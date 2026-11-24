/**
 * GET /api/v1/forums
 * List published forums (public endpoint)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { Locale, ForumStatus } from '@prisma/client'

const listForumsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  locale: z.nativeEnum(Locale).optional().default(Locale.RU),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    const validation = listForumsSchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
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

    const { page, limit, locale } = validation.data
    const skip = (page - 1) * limit

    // Only show PUBLISHED forums that are:
    // 1. status = PUBLISHED
    // 2. publishedAt <= now (if scheduled)
    const now = new Date()

    const [forums, total] = await prisma.$transaction([
      prisma.forum.findMany({
        where: {
          status: ForumStatus.PUBLISHED,
          OR: [
            { publishedAt: null },
            { publishedAt: { lte: now } },
          ],
        },
        include: {
          translations: true, // Load all translations, not just requested locale
          categories: {
            include: {
              translations: true, // Load all translations for categories too
            },
            orderBy: {
              sortOrder: 'asc',
            },
          },
          _count: {
            select: {
              tickets: {
                where: {
                  status: 'ACTIVE',
                },
              },
            },
          },
        },
        orderBy: {
          startsAt: 'asc',
        },
        skip,
        take: limit,
      }),
      prisma.forum.count({
        where: {
          status: ForumStatus.PUBLISHED,
          OR: [
            { publishedAt: null },
            { publishedAt: { lte: now } },
          ],
        },
      }),
    ])

    // Transform to API format
    const forumsWithTranslations = forums.map((forum) => {
      // Find translation for requested locale, fallback to RU
      const translation = forum.translations.find((t) => t.locale === locale)
      const fallbackTranslation = forum.translations.find((t) => t.locale === Locale.RU)

      // Calculate available tickets
      const soldTickets = forum._count.tickets
      const availableTickets = Math.max(0, forum.capacity - soldTickets)

      return {
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
        publishedAt: forum.publishedAt?.toISOString() || null,
        createdAt: forum.createdAt.toISOString(),
        updatedAt: forum.updatedAt.toISOString(),
        availableTickets,
        // Use requested locale translation or fallback to RU
        title: translation?.title || fallbackTranslation?.title || 'Untitled',
        shortDescription: translation?.shortDescription || fallbackTranslation?.shortDescription || null,
        description: translation?.description || fallbackTranslation?.description || null,
        program: translation?.program || fallbackTranslation?.program || null,
        categories: forum.categories.map((cat) => {
          const catTranslation = cat.translations.find((t) => t.locale === locale)
          const catFallback = cat.translations.find((t) => t.locale === Locale.RU)
          
          return {
            id: cat.id,
            code: cat.code,
            priceMinor: cat.priceMinor,
            capacity: cat.capacity,
            sortOrder: cat.sortOrder,
            name: catTranslation?.name || catFallback?.name || cat.code,
            description: catTranslation?.description || catFallback?.description || null,
          }
        }),
      }
    })

    const totalPages = Math.ceil(total / limit)

    return NextResponse.json({
      forums: forumsWithTranslations,
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
    console.error('Error fetching forums:', error)
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Не удалось получить список мероприятий',
        },
      },
      { status: 500 }
    )
  }
}
