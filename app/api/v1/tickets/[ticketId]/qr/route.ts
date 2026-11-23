/**
 * GET /api/v1/tickets/{ticketId}/qr
 * Generate a private, scannable QR image for an active ticket.
 */

import QRCode from 'qrcode'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { decryptQRToken } from '@/lib/crypto/qr-encryption'

interface RouteContext {
  params: Promise<{ ticketId: string }>
}

const PRIVATE_QR_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Vary: 'Cookie, Authorization',
  'X-Content-Type-Options': 'nosniff',
}

function privateJson(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: PRIVATE_QR_HEADERS })
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requireAuth(request)
    if ('headers' in authResult) {
      authResult.headers.set('Cache-Control', PRIVATE_QR_HEADERS['Cache-Control'])
      authResult.headers.set('Pragma', PRIVATE_QR_HEADERS.Pragma)
      authResult.headers.set('Vary', PRIVATE_QR_HEADERS.Vary)
      return authResult
    }

    const { ticketId } = await context.params
    if (!isUuid(ticketId)) {
      return privateJson({ error: { code: 'INVALID_TICKET_ID', message: 'Неверный формат ID билета' } }, 400)
    }

    const sizeValue = request.nextUrl.searchParams.get('size')
    const size = sizeValue === null ? 512 : Number(sizeValue)
    if (!Number.isInteger(size) || size < 128 || size > 1024) {
      return privateJson({ error: { code: 'INVALID_QR_SIZE', message: 'Размер QR-кода должен быть от 128 до 1024 пикселей' } }, 400)
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        ticketNumber: true,
        buyerId: true,
        status: true,
        expiresAt: true,
        qrTokenEncrypted: true,
        orderItem: {
          select: {
            order: { select: { paidAt: true } },
          },
        },
      },
    })

    if (!ticket) {
      return privateJson({ error: { code: 'TICKET_NOT_FOUND', message: 'Билет не найден' } }, 404)
    }

    if (ticket.buyerId !== authResult.user.userId && authResult.user.role !== 'SUPER_ADMIN') {
      return privateJson({ error: { code: 'FORBIDDEN', message: 'Нет доступа к этому билету' } }, 403)
    }

    if (!ticket.orderItem.order.paidAt) {
      return privateJson({
        error: { code: 'ORDER_NOT_PAID', message: 'QR-код будет доступен после оплаты заказа' },
      }, 402)
    }

    if (ticket.status !== 'ACTIVE') {
      return privateJson({ error: { code: 'TICKET_NOT_ACTIVE', message: 'QR-код доступен только для активного билета' } }, 409)
    }

    if (ticket.expiresAt <= new Date()) {
      return privateJson({ error: { code: 'TICKET_EXPIRED', message: 'Срок действия билета истёк' } }, 400)
    }

    let qrToken: string
    try {
      qrToken = decryptQRToken(ticket.qrTokenEncrypted)
    } catch {
      console.error('[SECURITY] Failed to decrypt QR token for ticket:', ticket.id)
      return privateJson({
        error: { code: 'QR_DECRYPTION_FAILED', message: 'Не удалось сформировать QR-код. Обратитесь в поддержку.' },
      }, 500)
    }

    // This is the minimal payload consumed by POST /api/v1/check-in/validate.
    const payload = `FORUM.KG|${ticket.ticketNumber}|${qrToken}`
    const svg = await QRCode.toString(payload, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: size,
    })

    return new NextResponse(svg, {
      status: 200,
      headers: {
        ...PRIVATE_QR_HEADERS,
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Content-Disposition': 'inline; filename="ticket-qr.svg"',
      },
    })
  } catch {
    console.error('Error generating ticket QR')
    return privateJson({ error: { code: 'QR_GENERATION_FAILED', message: 'Не удалось создать QR-код' } }, 500)
  }
}
