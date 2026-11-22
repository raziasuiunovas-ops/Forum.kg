/**
 * POST /api/v1/check-in/validate
 * Validate QR code and perform check-in
 * 
 * SECURITY: Requires SCANNER, MANAGER, or SUPER_ADMIN role
 * BUSINESS RULES:
 * - Single-use enforcement via DB unique constraint on CheckIn.ticketId
 * - Expiry check
 * - Status validation (must be ACTIVE)
 * - Forum matching
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { requireRole } from '@/lib/auth/middleware'
import { createAuthError } from '@/lib/auth'
import crypto from 'crypto'

const validateCheckInSchema = z.object({
  qrData: z.string().min(1),
  forumId: z.string().uuid(),
})

/**
 * Parse QR data
 * Expected format: FORUM.KG|{ticketNumber}|{qrToken}
 */
function parseQRData(qrData: string): { ticketNumber: string; qrToken: string } | null {
  const parts = qrData.split('|')
  if (parts.length !== 3 || parts[0] !== 'FORUM.KG') {
    return null
  }
  return {
    ticketNumber: parts[1],
    qrToken: parts[2],
  }
}

/**
 * Hash QR token for database lookup
 */
function hashQRToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    // Require SCANNER, MANAGER, or SUPER_ADMIN role
    const authResult = await requireRole(request, ['SCANNER', 'MANAGER', 'SUPER_ADMIN'])
    
    if ('headers' in authResult) {
      return authResult
    }

    const user = authResult.user

    // Parse request body
    const body = await request.json()
    const validation = validateCheckInSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Ошибка валидации данных',
            details: validation.error.format(),
          },
        },
        { status: 422 }
      )
    }

    const { qrData, forumId } = validation.data

    // Parse QR data
    const parsed = parseQRData(qrData)
    if (!parsed) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_QR_FORMAT',
            message: 'Неверный формат QR-кода',
          },
        },
        { status: 400 }
      )
    }

    const { ticketNumber, qrToken } = parsed
    const qrTokenHash = hashQRToken(qrToken)

    // Perform check-in in transaction
    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Find ticket by ticket number and QR token hash
        const ticket = await tx.ticket.findFirst({
          where: {
            ticketNumber,
            qrTokenHash,
          },
          include: {
            forum: {
              select: {
                id: true,
                slug: true,
                startsAt: true,
                endsAt: true,
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
            checkIn: true,
          },
        })

        if (!ticket) {
          throw new Error('TICKET_NOT_FOUND')
        }

        // 2. Verify ticket belongs to correct forum
        if (ticket.forumId !== forumId) {
          throw new Error('WRONG_FORUM')
        }

        // 3. Check ticket status
        if (ticket.status === 'CANCELLED') {
          throw new Error('TICKET_CANCELLED')
        }

        if (ticket.status === 'USED') {
          throw new Error('TICKET_ALREADY_USED')
        }

        // 4. Check expiry
        const now = new Date()
        if (ticket.expiresAt < now) {
          throw new Error('TICKET_EXPIRED')
        }

        // 5. Check if already checked in (double-check in case of race)
        if (ticket.checkIn) {
          throw new Error('ALREADY_CHECKED_IN')
        }

        // 6. Create check-in record
        // Database UNIQUE constraint on CheckIn.ticketId prevents double check-in
        const checkIn = await tx.checkIn.create({
          data: {
            ticketId: ticket.id,
            forumId: ticket.forumId,
            operatorId: user.userId,
            method: 'QR_ONLINE',
          },
        })

        // 7. Update ticket status to USED
        const updatedTicket = await tx.ticket.update({
          where: { id: ticket.id },
          data: {
            status: 'USED',
            usedAt: now,
          },
        })

        return {
          checkIn,
          ticket: {
            ...updatedTicket,
            forum: ticket.forum,
            orderItem: ticket.orderItem,
          },
        }
      },
      {
        timeout: 5000,
        isolationLevel: 'Serializable', // Prevent race conditions
      }
    )

    // Build response
    const response = {
      success: true,
      message: 'Регистрация прошла успешно',
      checkIn: {
        id: result.checkIn.id,
        checkedInAt: result.checkIn.checkedInAt.toISOString(),
        method: result.checkIn.method,
      },
      ticket: {
        id: result.ticket.id,
        ticketNumber: result.ticket.ticketNumber,
        status: result.ticket.status,
        participant: {
          firstName: result.ticket.orderItem.participantFirstName,
          lastName: result.ticket.orderItem.participantLastName,
        },
        category: {
          code: result.ticket.orderItem.ticketCategory.code,
          name:
            result.ticket.orderItem.ticketCategory.translations[0]?.name ||
            result.ticket.orderItem.ticketCategory.code,
        },
        forum: {
          id: result.ticket.forum.id,
          slug: result.ticket.forum.slug,
          title: result.ticket.forum.translations[0]?.title || 'Untitled',
          startsAt: result.ticket.forum.startsAt.toISOString(),
        },
      },
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('Check-in error:', error)

    // Handle specific business logic errors
    if (error.message === 'TICKET_NOT_FOUND') {
      return NextResponse.json(
        {
          error: {
            code: 'TICKET_NOT_FOUND',
            message: 'Билет не найден или QR-код недействителен',
          },
        },
        { status: 404 }
      )
    }

    if (error.message === 'WRONG_FORUM') {
      return NextResponse.json(
        {
          error: {
            code: 'WRONG_FORUM',
            message: 'Билет не для этого мероприятия',
          },
        },
        { status: 400 }
      )
    }

    if (error.message === 'TICKET_CANCELLED') {
      return NextResponse.json(
        {
          error: {
            code: 'TICKET_CANCELLED',
            message: 'Билет отменён',
          },
        },
        { status: 400 }
      )
    }

    if (error.message === 'TICKET_ALREADY_USED') {
      return NextResponse.json(
        {
          error: {
            code: 'TICKET_ALREADY_USED',
            message: 'Билет уже использован',
          },
        },
        { status: 400 }
      )
    }

    if (error.message === 'TICKET_EXPIRED') {
      return NextResponse.json(
        {
          error: {
            code: 'TICKET_EXPIRED',
            message: 'Срок действия билета истёк',
          },
        },
        { status: 400 }
      )
    }

    if (error.message === 'ALREADY_CHECKED_IN') {
      return NextResponse.json(
        {
          error: {
            code: 'ALREADY_CHECKED_IN',
            message: 'Билет уже зарегистрирован',
          },
        },
        { status: 400 }
      )
    }

    // Handle Prisma unique constraint violation (P2002)
    if (error.code === 'P2002' && error.meta?.target?.includes('ticketId')) {
      return NextResponse.json(
        {
          error: {
            code: 'ALREADY_CHECKED_IN',
            message: 'Билет уже зарегистрирован',
          },
        },
        { status: 400 }
      )
    }

    // Generic error
    return NextResponse.json(
      {
        error: {
          code: 'CHECK_IN_FAILED',
          message: 'Не удалось выполнить регистрацию',
        },
      },
      { status: 500 }
    )
  }
}
