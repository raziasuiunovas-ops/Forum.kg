/**
 * GET /api/v1/profile/tickets
 * Get current user's tickets
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/middleware'
import { TicketStatus } from '@prisma/client'

const listTicketsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(TicketStatus).optional(),
})

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const authResult = await requireAuth(request)
    
    if ('headers' in authResult) {
      return authResult
    }

    const user = authResult.user
    const { searchParams } = new URL(request.url)

    const validation = listTicketsSchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      status: searchParams.get('status') ?? undefined,
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

    const { page, limit, status } = validation.data
    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {
      buyerId: user.userId,
    }

    if (status) {
      where.status = status
    }

    // Get tickets with pagination
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          forum: {
            select: {
              id: true,
              slug: true,
              startsAt: true,
              endsAt: true,
              venueName: true,
              translations: {
                where: { locale: 'RU' },
                select: { title: true },
              },
            },
          },
          orderItem: {
            select: {
              participantFirstName: true,
              participantLastName: true,
              unitPriceMinor: true,
              ticketCategory: {
                select: {
                  code: true,
                  translations: {
                    where: { locale: 'RU' },
                    select: { name: true },
                  },
                },
              },
            },
          },
          checkIn: {
            select: {
              checkedInAt: true,
            },
          },
        },
        orderBy: {
          issuedAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.ticket.count({ where }),
    ])

    // Check expiry for each ticket
    const now = new Date()
    const ticketsWithExpiry = tickets.map((ticket) => {
      const isExpired = ticket.expiresAt < now

      return {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        isExpired,
        issuedAt: ticket.issuedAt.toISOString(),
        expiresAt: ticket.expiresAt.toISOString(),
        usedAt: ticket.usedAt?.toISOString() || null,
        forum: {
          id: ticket.forum.id,
          slug: ticket.forum.slug,
          title: ticket.forum.translations[0]?.title || 'Untitled',
          startsAt: ticket.forum.startsAt.toISOString(),
          endsAt: ticket.forum.endsAt?.toISOString() || null,
          venueName: ticket.forum.venueName,
        },
        category: {
          code: ticket.orderItem.ticketCategory.code,
          name: ticket.orderItem.ticketCategory.translations[0]?.name || ticket.orderItem.ticketCategory.code,
        },
        participant: {
          firstName: ticket.orderItem.participantFirstName,
          lastName: ticket.orderItem.participantLastName,
        },
        priceMinor: ticket.orderItem.unitPriceMinor,
        isCheckedIn: !!ticket.checkIn,
        checkedInAt: ticket.checkIn?.checkedInAt.toISOString() || null,
      }
    })

    const totalPages = Math.ceil(total / limit)

    return NextResponse.json({
      tickets: ticketsWithExpiry,
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
    console.error('Error fetching user tickets:', error)
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Не удалось получить список билетов',
        },
      },
      { status: 500 }
    )
  }
}
