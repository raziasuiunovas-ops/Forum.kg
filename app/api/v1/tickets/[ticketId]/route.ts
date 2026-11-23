/**
 * GET /api/v1/tickets/{ticketId}
 * Get ticket details with QR data (owner only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { decryptQRToken } from '@/lib/crypto/qr-encryption'

interface RouteContext {
  params: Promise<{
    ticketId: string
  }>
}

const PRIVATE_QR_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Vary: 'Cookie, Authorization',
}

function privateJson(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: PRIVATE_QR_HEADERS })
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // Authenticate user
    const authResult = await requireAuth(request)
    
    if ('headers' in authResult) {
      authResult.headers.set('Cache-Control', PRIVATE_QR_HEADERS['Cache-Control'])
      authResult.headers.set('Pragma', PRIVATE_QR_HEADERS.Pragma)
      authResult.headers.set('Vary', PRIVATE_QR_HEADERS.Vary)
      return authResult
    }

    const user = authResult.user
    const { ticketId } = await context.params

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketId)) {
      return privateJson(
        {
          error: {
            code: 'INVALID_TICKET_ID',
            message: 'Неверный формат ID билета',
          },
        },
        400
      )
    }

    // Get ticket with full details
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        forum: {
          include: {
            translations: {
              where: { locale: 'RU' },
            },
          },
        },
        orderItem: {
          include: {
            ticketCategory: {
              include: {
                translations: {
                  where: { locale: 'RU' },
                },
              },
            },
            order: {
              select: {
                orderNumber: true,
                paidAt: true,
              },
            },
          },
        },
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        checkIn: {
          select: {
            id: true,
            checkedInAt: true,
            method: true,
          },
        },
      },
    })

    if (!ticket) {
      return privateJson(
        {
          error: {
            code: 'TICKET_NOT_FOUND',
            message: 'Билет не найден',
          },
        },
        404
      )
    }

    // Authorization: only ticket owner can view
    if (ticket.buyerId !== user.userId && user.role !== 'SUPER_ADMIN') {
      return privateJson(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Нет доступа к этому билету',
          },
        },
        403
      )
    }

    // SECURITY: Check if order is paid
    // Never expose QR for unpaid tickets
    if (!ticket.orderItem.order.paidAt) {
      return privateJson(
        {
          error: {
            code: 'ORDER_NOT_PAID',
            message: 'Заказ не оплачен. QR-код будет доступен после оплаты.',
          },
        },
        402 // Payment Required
      )
    }

    // Check if ticket expired
    const now = new Date()
    const isExpired = ticket.expiresAt < now

    const canUseQr = ticket.status === 'ACTIVE' && ticket.expiresAt > now
    let qrData: string | null = null
    if (canUseQr) {
      try {
        const qrToken = decryptQRToken(ticket.qrTokenEncrypted)
        qrData = `FORUM.KG|${ticket.ticketNumber}|${qrToken}`
      } catch {
        console.error('[SECURITY] Failed to decrypt QR token for ticket:', ticket.id)
        return privateJson({
          error: {
            code: 'QR_DECRYPTION_FAILED',
            message: 'Не удалось расшифровать QR-код. Обратитесь в поддержку.',
          },
        }, 500)
      }
    }

    // Transform to API response
    const response = {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      isExpired,
      issuedAt: ticket.issuedAt.toISOString(),
      expiresAt: ticket.expiresAt.toISOString(),
      usedAt: ticket.usedAt?.toISOString() || null,
      cancelledAt: ticket.cancelledAt?.toISOString() || null,
      qrData, // For QR generation on client or server
      forum: {
        id: ticket.forum.id,
        slug: ticket.forum.slug,
        title: ticket.forum.translations[0]?.title || 'Untitled',
        startsAt: ticket.forum.startsAt.toISOString(),
        endsAt: ticket.forum.endsAt?.toISOString() || null,
        venueName: ticket.forum.venueName,
        venueAddress: ticket.forum.venueAddress,
      },
      category: {
        id: ticket.orderItem.ticketCategory.id,
        code: ticket.orderItem.ticketCategory.code,
        name: ticket.orderItem.ticketCategory.translations[0]?.name || ticket.orderItem.ticketCategory.code,
        priceMinor: ticket.orderItem.unitPriceMinor,
      },
      participant: {
        firstName: ticket.orderItem.participantFirstName,
        lastName: ticket.orderItem.participantLastName,
      },
      order: {
        orderNumber: ticket.orderItem.order.orderNumber,
        paidAt: ticket.orderItem.order.paidAt?.toISOString() || null,
      },
      checkIn: ticket.checkIn
        ? {
            checkedInAt: ticket.checkIn.checkedInAt.toISOString(),
            method: ticket.checkIn.method,
          }
        : null,
    }

    return privateJson(response, 200)
  } catch (error) {
    console.error('Error fetching ticket:', error)
    return privateJson(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Не удалось получить данные билета',
        },
      },
      500
    )
  }
}
