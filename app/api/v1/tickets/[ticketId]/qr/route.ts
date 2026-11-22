/**
 * GET /api/v1/tickets/{ticketId}/qr
 * Generate QR code for ticket
 * 
 * NOTE: This is a STUB implementation.
 * In production, you should either:
 * 1. Install 'qrcode' package and generate PNG
 * 2. Use a dedicated QR generation service
 * 3. Return data for client-side QR generation
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'

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

    // Get ticket
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        ticketNumber: true,
        buyerId: true,
        status: true,
        expiresAt: true,
        qrTokenEncrypted: true,
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

    // Authorization check
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

    // Check ticket is valid for QR display
    if (ticket.status === 'CANCELLED') {
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

    // Check expiry
    if (ticket.expiresAt < new Date()) {
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

    // Decrypt QR token
    const qrToken = Buffer.from(ticket.qrTokenEncrypted, 'base64').toString('utf-8')

    // Build QR content
    const qrContent = `FORUM.KG|${ticket.ticketNumber}|${qrToken}`

    // STUB: Return simple SVG QR code placeholder
    // In production, use proper QR generation library
    const size = parseInt(request.nextUrl.searchParams.get('size') || '512')
    
    // Generate simple placeholder SVG
    const svg = generatePlaceholderQR(qrContent, size)

    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Error generating QR code:', error)
    return NextResponse.json(
      {
        error: {
          code: 'QR_GENERATION_FAILED',
          message: 'Не удалось создать QR-код',
        },
      },
      { status: 500 }
    )
  }
}

/**
 * Generate placeholder SVG QR code
 * STUB: Replace with actual QR generation in production
 */
function generatePlaceholderQR(content: string, size: number): string {
  // Simple SVG with text (not a real QR code)
  // In production, use 'qrcode' package:
  // const QRCode = require('qrcode')
  // const url = await QRCode.toDataURL(content)
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="white"/>
  <rect x="10%" y="10%" width="80%" height="80%" fill="none" stroke="black" stroke-width="2"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="12" fill="black">
    QR CODE PLACEHOLDER
  </text>
  <text x="50%" y="60%" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="8" fill="gray">
    Install 'qrcode' npm package
  </text>
  <text x="50%" y="70%" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="6" fill="gray" opacity="0.5">
    ${content.substring(0, 40)}...
  </text>
</svg>`
}
