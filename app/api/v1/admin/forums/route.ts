/**
 * GET /api/v1/admin/forums
 * List all forums with filtering, search, pagination (Manager+)
 * 
 * POST /api/v1/admin/forums
 * Create a new forum (Manager+)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireManager } from '@/lib/auth/middleware'
import { forumCreateSchema, forumQuerySchema } from '@/lib/api/schemas/forum'
import { ForumStatus, Locale, Prisma } from '@prisma/client'
import { error as jsonError } from '@/lib/api/response'

/**
 * GET - List all forums with filtering and pagination
 */
export async function GET(request: NextRequest) {
  const authResult = await requireManager(request)
  if ('headers' in authResult) return authResult

  try {
    const { searchParams } = new URL(request.url)
    const validation = forumQuerySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      sortBy: searchParams.get('sortBy') ?? undefined,
      sortOrder: searchParams.get('sortOrder') ?? undefined,
      includeStats: searchParams.get('includeStats') ?? undefined,
    })

    if (!validation.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Ошибка валидации параметров запроса',
            details: validation.error.format(),
          },
        },
        { status: 422 }
      )
    }

    const { page, limit, status, search, sortBy, sortOrder, includeStats } = validation.data
    const skip = (page - 1) * limit

    // Build where clause
    const where: Prisma.ForumWhereInput = {}
    
    if (status) {
      where.status = status
    }

    if (search) {
      where.OR = [
        { slug: { contains: search, mode: 'insensitive' } },
        { venueName: { contains: search, mode: 'insensitive' } },
        { ForumTranslation: { some: { title: { contains: search, mode: 'insensitive' } } } },
      ]
    }

    // Build orderBy clause
    const orderBy: Prisma.ForumOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    }

    const [forums, total] = await prisma.$transaction([
      prisma.forum.findMany({
        where,
        include: {
          ForumTranslation: {
            orderBy: { locale: 'asc' },
          },
          TicketCategory: {
            include: {
              TicketCategoryTranslation: {
                orderBy: { locale: 'asc' },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
          User: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          ...(includeStats ? {
            _count: {
              select: {
                Ticket: {
                  where: { status: 'ACTIVE' },
                },
                Order: {
                  where: { status: 'PAID' },
                },
                CheckIn: true,
              },
            },
          } : {}),
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.forum.count({ where }),
    ])

    const totalPages = Math.ceil(total / limit)

    return NextResponse.json({
      forums: forums.map((forum) => ({
        id: forum.id,
        slug: forum.slug,
        status: forum.status,
        bannerUrl: forum.bannerUrl,
        venueName: forum.venueName,
        venueAddress: forum.venueAddress,
        locationCoordinates: forum.locationCoordinates,
        timeZone: forum.timeZone,
        startsAt: forum.startsAt.toISOString(),
        endsAt: forum.endsAt?.toISOString() || null,
        registrationDeadline: forum.registrationDeadline?.toISOString() || null,
        qrExpiresAt: forum.qrExpiresAt.toISOString(),
        capacity: forum.capacity,
        maxTicketsPerAccount: forum.maxTicketsPerAccount,
        tags: forum.tags,
        publishAt: forum.publishAt?.toISOString() || null,
        publishedAt: forum.publishedAt?.toISOString() || null,
        createdById: forum.createdById,
        createdBy: forum.User,
        createdAt: forum.createdAt.toISOString(),
        updatedAt: forum.updatedAt.toISOString(),
        translations: forum.ForumTranslation,
        categories: forum.TicketCategory,
        ...(includeStats && '_count' in forum ? {
          stats: {
            activeTickets: forum._count.Ticket,
            paidOrders: forum._count.Order,
            checkIns: forum._count.CheckIn,
            availableCapacity: forum.capacity - forum._count.Ticket,
          },
        } : {}),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error('Error fetching admin forums:', error)
    return jsonError('INTERNAL_SERVER_ERROR', 'Не удалось получить список мероприятий', 500)
  }
}

/**
 * POST - Create a new forum
 */
export async function POST(request: NextRequest) {
  const authResult = await requireManager(request)
  if ('headers' in authResult) return authResult

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return jsonError('VALIDATION_ERROR', 'Некорректный JSON запроса', 422)
  }

  const validation = forumCreateSchema.safeParse(rawBody)
  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Ошибка валидации данных форума',
          details: validation.error.format(),
        },
      },
      { status: 422 }
    )
  }

  const data = validation.data

  try {
    // Check if slug already exists
    const existingForum = await prisma.forum.findUnique({
      where: { slug: data.slug },
    })

    if (existingForum) {
      return jsonError('SLUG_ALREADY_EXISTS', `Форум с slug "${data.slug}" уже существует`, 409)
    }

    // Create forum with translations and categories in a transaction
    const forum = await prisma.$transaction(async (tx) => {
      // Create forum
      const { randomUUID } = await import('node:crypto')
      const newForum = await tx.forum.create({
        data: {
          id: randomUUID(),
          slug: data.slug,
          status: data.status || ForumStatus.DRAFT,
          bannerUrl: data.bannerUrl,
          venueName: data.venueName,
          venueAddress: data.venueAddress,
          locationCoordinates: data.locationCoordinates || Prisma.DbNull,
          timeZone: data.timeZone,
          startsAt: new Date(data.startsAt),
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
          registrationDeadline: data.registrationDeadline ? new Date(data.registrationDeadline) : null,
          qrExpiresAt: new Date(data.qrExpiresAt),
          capacity: data.capacity,
          maxTicketsPerAccount: data.maxTicketsPerAccount,
          tags: data.tags,
          publishAt: data.publishAt ? new Date(data.publishAt) : null,
          createdById: authResult.user.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })

      // Create translations
      await tx.forumTranslation.createMany({
        data: data.translations.map((t) => ({
          id: randomUUID(),
          forumId: newForum.id,
          locale: t.locale,
          title: t.title,
          shortDescription: t.shortDescription || null,
          description: t.description || null,
          program: t.program || null,
          venueName: t.venueName || null,
          venueAddress: t.venueAddress || null,
        })),
      })

      // Create categories with translations
      for (const category of data.categories) {
        const newCategory = await tx.ticketCategory.create({
          data: {
            id: randomUUID(),
            forumId: newForum.id,
            code: category.code,
            priceMinor: category.priceMinor,
            currency: category.currency,
            capacity: category.capacity || null,
            isActive: category.isActive,
            sortOrder: category.sortOrder,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        })

        await tx.ticketCategoryTranslation.createMany({
          data: category.translations.map((t) => ({
            id: randomUUID(),
            categoryId: newCategory.id,
            locale: t.locale,
            name: t.name,
            description: t.description || null,
          })),
        })
      }

      // Log audit event
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          actorId: authResult.user.userId,
          action: 'FORUM_CREATED',
          targetType: 'Forum',
          targetId: newForum.id,
          metadata: {
            slug: newForum.slug,
            status: newForum.status,
            startsAt: newForum.startsAt.toISOString(),
          },
        },
      })

      return newForum
    })

    // Fetch complete forum data with relations
    const completeForum = await prisma.forum.findUnique({
      where: { id: forum.id },
      include: {
        ForumTranslation: true,
        TicketCategory: {
          include: {
            TicketCategoryTranslation: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
        User: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json(
      {
        message: 'Мероприятие успешно создано',
        forum: completeForum,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating forum:', error)
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return jsonError('SLUG_ALREADY_EXISTS', 'Форум с таким slug уже существует', 409)
      }
    }

    return jsonError('INTERNAL_SERVER_ERROR', 'Не удалось создать мероприятие', 500)
  }
}
