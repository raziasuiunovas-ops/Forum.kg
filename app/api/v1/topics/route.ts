import { NextRequest, NextResponse } from 'next/server'
import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  calculatePagination,
  forbidden,
  notFound,
  validateBody,
  validateQuery,
  withErrorHandler,
} from '@/lib/api'
import {
  createTopicSchema,
  topicFiltersSchema,
  type TopicFilters,
} from '@/lib/api/schemas/post'
import { requireAuth } from '@/lib/auth/middleware'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

const topicPublicSelect = {
  id: true,
  categoryId: true,
  title: true,
  content: true,
  tags: true,
  isPinned: true,
  isLocked: true,
  viewCount: true,
  replyCount: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: { id: true, slug: true, name: true },
  },
  author: {
    select: { id: true, firstName: true, lastName: true },
  },
} satisfies Prisma.TopicSelect

const isModerator = (role: UserRole) =>
  role === UserRole.MANAGER || role === UserRole.SUPER_ADMIN

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const filters = validateQuery(
    searchParams,
    topicFiltersSchema as unknown as import('zod').ZodSchema<TopicFilters>
  )
  const where: Prisma.TopicWhereInput = { deletedAt: null }

  if (filters.categoryId) where.categoryId = filters.categoryId
  if (filters.authorId) where.authorId = filters.authorId
  if (filters.isPinned !== undefined) where.isPinned = filters.isPinned
  if (filters.isLocked !== undefined) where.isLocked = filters.isLocked
  if (filters.tag) where.tags = { has: filters.tag }
  if (filters.search) {
    where.OR = (['ru', 'ky', 'en'] as const).flatMap((locale) => [
      { title: { path: [locale], string_contains: filters.search, mode: 'insensitive' } },
      { content: { path: [locale], string_contains: filters.search, mode: 'insensitive' } },
    ]) as Prisma.TopicWhereInput['OR']
  }

  const sortBy = filters.sortBy ?? 'createdAt'
  const sortOrder = filters.sortOrder ?? 'desc'
  const orderBy: Prisma.TopicOrderByWithRelationInput[] = [
    { isPinned: 'desc' },
    { [sortBy]: sortOrder },
    { id: 'asc' },
  ]
  const skip = (filters.page - 1) * filters.limit

  const [topics, total] = await Promise.all([
    prisma.topic.findMany({
      where,
      select: topicPublicSelect,
      orderBy,
      skip,
      take: filters.limit,
    }),
    prisma.topic.count({ where }),
  ])

  return NextResponse.json({
    topics,
    pagination: calculatePagination(filters.page, filters.limit, total),
  }, { status: 200 })
})

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const input = await validateBody(request, createTopicSchema)
  const moderator = isModerator(authResult.user.role)
  if (!moderator && (input.isPinned || input.isLocked)) {
    writeSecurityAuditEvent({
      eventType: 'ACCESS_DENIED',
      result: 'denied',
      request,
      userId: authResult.user.userId,
      reason: 'topic_moderation_fields_attempt',
      statusCode: 403,
    })
    return forbidden('Закрепление и блокировка доступны только модераторам')
  }

  const category = await prisma.topicCategory.findFirst({
    where: { id: input.categoryId, isActive: true },
    select: { id: true },
  })
  if (!category) return notFound('Категория', 'TOPIC_CATEGORY_NOT_FOUND')

  const topic = await prisma.topic.create({
    data: {
      categoryId: category.id,
      authorId: authResult.user.userId,
      title: input.title as Prisma.InputJsonValue,
      content: input.content as Prisma.InputJsonValue,
      tags: input.tags ?? [],
      isPinned: moderator ? input.isPinned : false,
      isLocked: moderator ? input.isLocked : false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    select: topicPublicSelect,
  })

  writeSecurityAuditEvent({
    eventType: 'TOPIC_CREATED',
    result: 'success',
    request,
    userId: authResult.user.userId,
    reason: 'topic_created',
    statusCode: 201,
  })

  return NextResponse.json({ topic }, { status: 201 })
})
