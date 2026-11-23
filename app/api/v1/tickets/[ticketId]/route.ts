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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // Authenticate user
    const authResult = await requireAuth(request)
    
    if ('headers' in authResult) {
      return authResult
    }

    const user = authResult.user
    const { ticketId } = await context.params

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketId)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_TICKET_ID',
            message: 'Неверный формат ID билета',
          },
        },
        { status: 400 }
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
      return NextResponse.json(
        {
          error: {
            code: 'TICKET_NOT_FOUND',
            message: 'Билет не найден',
          },
        },
        { status: 404 }
      )
    }

    // Authorization: only ticket owner can view
    if (ticket.buyerId !== user.userId && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Нет доступа к этому билету',
          },
        },
        { status: 403 }
      )
    }

    // SECURITY: Check if order is paid
    // Never expose QR for unpaid tickets
    if (!ticket.orderItem.order.paidAt) {
      return NextResponse.json(
        {
          error: {
            code: 'ORDER_NOT_PAID',
            message: 'Заказ не оплачен. QR-код будет доступен после оплаты.',
          },
        },
        { status: 402 } // 402 Payment Required
      )
    }

    // Check if ticket expired
    const now = new Date()
    const isExpired = ticket.expiresAt < now

    // Decrypt QR token using AES-256-GCM
    // This replaces the insecure Base64 decoding
    // SECURITY NOTE: QR token is sensitive - only return to authenticated owner
    let qrToken: string
    try {
      qrToken = decryptQRToken(ticket.qrTokenEncrypted)
    } catch (error) {
      console.error('[SECURITY] Failed to decrypt QR token for ticket:', ticket.id)
      // Never log the error details which might contain key information
      return NextResponse.json(
        {
          error: {
            code: 'QR_DECRYPTION_FAILED',
            message: 'Не удалось расшифровать QR-код. Обратитесь в поддержку.',
          },
        },
        { status: 500 }
      )
    }

    // Build QR data URL for client
    // Format: FORUM.KG|{ticketNumber}|{qrToken}
    // SECURITY: This contains sensitive token - only returned to authenticated owner
    // Frontend must NOT log or expose this value
    const qrData = `FORUM.KG|${ticket.ticketNumber}|${qrToken}`

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

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching ticket:', error)
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Не удалось получить данные билета',
        },
      },
      { status: 500 }
    )
  }
}
