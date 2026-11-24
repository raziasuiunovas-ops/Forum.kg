/**
 * GET /api/v1/forums/{slug}
 * Get forum by slug (public endpoint)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { Locale, ForumStatus } from '@prisma/client'

const getForumSchema = z.object({
  locale: z.nativeEnum(Locale).optional().default(Locale.RU),
})

interface RouteContext {
  params: Promise<{
    slug: string
  }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { slug } = await context.params
    const { searchParams } = new URL(request.url)

    const validation = getForumSchema.safeParse({
      locale: searchParams.get('locale') ?? undefined,
    })

    if (!validation.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Ошибка валидации параметров',
            details: validation.error.format(),
          },
        },
        { status: 422 }
      )
    }

    const { locale } = validation.data

    // Only published forums visible to public
    const forum = await prisma.forum.findFirst({
      where: {
        slug,
        status: ForumStatus.PUBLISHED,
      },
      include: {
        ForumTranslation: true,
        TicketCategory: {
          include: {
            TicketCategoryTranslation: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            Ticket: {
              where: {
                status: 'ACTIVE',
              },
            },
            Order: {
              where: {
                status: {
                  in: ['PENDING_PAYMENT', 'PAID'],
                },
              },
            },
          },
        },
      },
    })

    if (!forum) {
      return NextResponse.json(
        {
          error: {
            code: 'FORUM_NOT_FOUND',
            message: 'Мероприятие не найдено',
          },
        },
        { status: 404 }
      )
    }

    // Check if published (scheduled publication check)
    if (forum.publishedAt && forum.publishedAt > new Date()) {
      return NextResponse.json(
        {
          error: {
            code: 'FORUM_NOT_FOUND',
            message: 'Мероприятие не найдено',
          },
        },
        { status: 404 }
      )
    }

    // Get translation for requested locale
    const translation = forum.ForumTranslation.find((t) => t.locale === locale)
    const fallbackTranslation = forum.ForumTranslation.find((t) => t.locale === Locale.RU)

    if (!translation && !fallbackTranslation) {
      return NextResponse.json(
        {
          error: {
            code: 'TRANSLATION_NOT_FOUND',
            message: 'Перевод не найден',
          },
        },
        { status: 404 }
      )
    }

    // Calculate available tickets
    const soldTickets = forum._count.Ticket
    const availableTickets = Math.max(0, forum.capacity - soldTickets)

    // Check if sold out
    const isSoldOut = availableTickets === 0

    // Transform to API format
    const result = {
      id: forum.id,
      slug: forum.slug,
      status: forum.status,
      bannerUrl: forum.bannerUrl,
      venueName: forum.venueName,
      venueAddress: forum.venueAddress,
      timeZone: forum.timeZone,
      startsAt: forum.startsAt.toISOString(),
      endsAt: forum.endsAt?.toISOString() || null,
      qrExpiresAt: forum.qrExpiresAt.toISOString(),
      capacity: forum.capacity,
      maxTicketsPerAccount: forum.maxTicketsPerAccount,
      publishAt: forum.publishAt?.toISOString() || null,
      publishedAt: forum.publishedAt?.toISOString() || null,
      createdAt: forum.createdAt.toISOString(),
      updatedAt: forum.updatedAt.toISOString(),
      availableTickets,
      isSoldOut,
      // Use requested locale or fallback to RU
      title: translation?.title || fallbackTranslation?.title || 'Untitled',
      shortDescription:
        translation?.shortDescription || fallbackTranslation?.shortDescription || null,
      description: translation?.description || fallbackTranslation?.description || null,
      program: translation?.program || fallbackTranslation?.program || null,
      createdBy: {
        id: forum.createdBy.id,
        firstName: forum.createdBy.firstName,
        lastName: forum.createdBy.lastName,
      },
      categories: forum.TicketCategory.map((cat) => {
        const catTranslation = cat.TicketCategoryTranslation.find((t) => t.locale === locale)
        const catFallback = cat.TicketCategoryTranslation.find((t) => t.locale === Locale.RU)

        // Calculate category-specific availability
        const categorySold = cat.capacity
          ? soldTickets // Simplified - should query per-category
          : 0

        const categoryAvailable = cat.capacity
          ? Math.max(0, cat.capacity - categorySold)
          : availableTickets

        return {
          id: cat.id,
          code: cat.code,
          priceMinor: cat.priceMinor,
          capacity: cat.capacity,
          sortOrder: cat.sortOrder,
          availableTickets: categoryAvailable,
          isSoldOut: cat.capacity ? categoryAvailable === 0 : isSoldOut,
          name: catTranslation?.name || catFallback?.name || cat.code,
          description: catTranslation?.description || catFallback?.description || null,
        }
      }),
      stats: {
        totalOrders: forum._count.orders,
        totalTickets: soldTickets,
      },
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching forum:', error)
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Не удалось получить данные мероприятия',
        },
      },
      { status: 500 }
    )
  }
}
