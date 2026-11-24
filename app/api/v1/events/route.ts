import { NextRequest, NextResponse } from 'next/server'
import { ForumStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  calculatePagination,
  conflict,
  forbidden,
  validateBody,
  validateQuery,
  withErrorHandler,
} from '@/lib/api'
import { createEventSchema, eventFiltersSchema, type EventFilters } from '@/lib/api/schemas/event'
import { requireManager } from '@/lib/auth/middleware'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'
import { categoryCreateData, publicEventSelect, toEventDto, translationRows } from '@/lib/api/events'

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const filters = validateQuery(
    searchParams,
    eventFiltersSchema as unknown as import('zod').ZodSchema<EventFilters>
  )

  if (filters.isPublished === false) {
    const authResult = await requireManager(request)
    if (authResult instanceof NextResponse) return authResult
  }

  const where: Prisma.ForumWhereInput = {
    status: filters.isPublished === false ? { not: ForumStatus.PUBLISHED } : ForumStatus.PUBLISHED,
  }
  if (filters.isPublished !== false) {
    where.OR = [{ publishedAt: null }, { publishedAt: { lte: new Date() } }]
  }
  if (filters.organizerId) where.createdById = filters.organizerId
  if (filters.category) {
    where.TicketCategory = {
      some: {
        isActive: true,
        OR: [
          { code: filters.category },
          { TicketCategoryTranslation: { some: { name: { contains: filters.category, mode: 'insensitive' } } } },
        ],
      },
    }
  }
  if (filters.tag) where.tags = { has: filters.tag }
  if (filters.startAfter || filters.startBefore) {
    where.startsAt = {
      ...(filters.startAfter && { gte: new Date(filters.startAfter) }),
      ...(filters.startBefore && { lte: new Date(filters.startBefore) }),
    }
  }
  if (filters.search) {
    where.ForumTranslation = {
      some: {
        OR: [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { shortDescription: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ],
      },
    }
  }

  const sortOrder = filters.sortOrder ?? 'asc'
  const dateSortField = filters.sortBy === 'createdAt' ? 'createdAt' : 'startsAt'
  const orderBy: Prisma.ForumOrderByWithRelationInput[] = filters.sortBy === 'registrationCount'
    ? [{ EventRegistration: { _count: sortOrder } }, { startsAt: 'asc' }, { id: 'asc' }]
    : [{ [dateSortField]: sortOrder }, { id: 'asc' }]
  const skip = (filters.page - 1) * filters.limit

  const [events, total] = await Promise.all([
    prisma.forum.findMany({
      where,
      select: publicEventSelect,
      orderBy,
      skip,
      take: filters.limit,
    }),
    prisma.forum.count({ where }),
  ])

  return NextResponse.json({
    events: events.map(toEventDto),
    pagination: calculatePagination(filters.page, filters.limit, total),
  }, { status: 200 })
})

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireManager(request)
  if (authResult instanceof NextResponse) return authResult

  const input = await validateBody(request, createEventSchema)
  if (input.organizerId !== authResult.user.userId) {
    writeSecurityAuditEvent({
      eventType: 'ACCESS_DENIED',
      result: 'denied',
      request,
      userId: authResult.user.userId,
      reason: 'event_organizer_must_be_actor',
      statusCode: 403,
    })
    return forbidden('Организатором события должен быть текущий пользователь')
  }

  const now = new Date()
  const priceMinor = input.price?.amountMinor ?? 0
  try {
    const { randomUUID } = await import('node:crypto')
    const event = await prisma.$transaction(async (tx) => tx.forum.create({
      data: {
        id: randomUUID(),
        slug: input.slug,
        status: input.isPublished ? ForumStatus.PUBLISHED : ForumStatus.DRAFT,
        bannerUrl: input.coverImageUrl,
        venueName: input.location.name.ru,
        venueAddress: input.location.address?.ru,
        locationCoordinates: input.location.coordinates as Prisma.InputJsonValue | undefined,
        timeZone: input.timeZone,
        startsAt: new Date(input.startTime),
        endsAt: new Date(input.endTime),
        registrationDeadline: input.registrationDeadline ? new Date(input.registrationDeadline) : null,
        qrExpiresAt: new Date(input.endTime),
        capacity: input.capacity,
        tags: input.tags ?? [],
        publishedAt: input.isPublished ? now : null,
        createdById: authResult.user.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        translations: { create: translationRows(input) },
        categories: { create: categoryCreateData(input.categories, priceMinor) },
      },
      select: publicEventSelect,
    }))
    writeSecurityAuditEvent({
      eventType: 'EVENT_CREATED',
      result: 'success',
      request,
      userId: authResult.user.userId,
      reason: 'event_created',
      statusCode: 201,
    })
    return NextResponse.json({ event: toEventDto(event) }, { status: 201 })
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
      return conflict('Событие с таким идентификатором уже существует', 'EVENT_SLUG_TAKEN')
    }
    throw cause
  }
})
