/**
 * GET /api/v1/orders/{orderId}
 * Get order details (owner only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { createAuthError } from '@/lib/auth'

interface RouteContext {
  params: Promise<{
    orderId: string
  }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // Authenticate user
    const authResult = await requireAuth(request)
    
    // Check if auth failed (returns NextResponse)
    if ('headers' in authResult) {
      return authResult
    }

    const user = authResult.user
    const { orderId } = await context.params

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_ORDER_ID',
            message: 'Неверный формат ID заказа',
          },
        },
        { status: 400 }
      )
    }

    // Get order with authorization check
    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        items: {
          include: {
            ticketCategory: {
              include: {
                translations: true,
              },
            },
            ticket: {
              select: {
                id: true,
                ticketNumber: true,
                status: true,
                expiresAt: true,
              },
            },
          },
        },
        forum: {
          include: {
            translations: true,
          },
        },
        payments: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
        cancellations: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    })

    if (!order) {
      return NextResponse.json(
        {
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'Заказ не найден',
          },
        },
        { status: 404 }
      )
    }

    // Authorization: only order owner can view
    // Admin check could be added here
    if (order.userId !== user.userId && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Нет доступа к этому заказу',
          },
        },
        { status: 403 }
      )
    }

    // Check if reservation expired
    const isReservationExpired =
      order.status === 'PENDING_PAYMENT' &&
      order.reservedUntil &&
      order.reservedUntil < new Date()

    // Transform to API response
    const response = {
      id: order.id,
      orderNumber: order.orderNumber,
      status: isReservationExpired ? 'EXPIRED' : order.status,
      subtotalMinor: order.subtotalMinor,
      totalMinor: order.totalMinor,
      currency: order.currency,
      reservedUntil: order.reservedUntil?.toISOString() || null,
      paidAt: order.paidAt?.toISOString() || null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        participantFirstName: item.participantFirstName,
        participantLastName: item.participantLastName,
        unitPriceMinor: item.unitPriceMinor,
        category: {
          id: item.ticketCategory.id,
          code: item.ticketCategory.code,
          name: item.ticketCategory.translations[0]?.name || item.ticketCategory.code,
        },
        ticket: item.ticket
          ? {
              id: item.ticket.id,
              ticketNumber: item.ticket.ticketNumber,
              status: item.ticket.status,
              expiresAt: item.ticket.expiresAt.toISOString(),
            }
          : null,
      })),
      forum: {
        id: order.forum.id,
        slug: order.forum.slug,
        title: order.forum.translations[0]?.title || 'Untitled',
        startsAt: order.forum.startsAt.toISOString(),
        endsAt: order.forum.endsAt?.toISOString() || null,
        venueName: order.forum.venueName,
        venueAddress: order.forum.venueAddress,
      },
      payment: order.payments[0]
        ? {
            id: order.payments[0].id,
            status: order.payments[0].status,
            amountMinor: order.payments[0].amountMinor,
            paidAt: order.payments[0].paidAt?.toISOString() || null,
            createdAt: order.payments[0].createdAt.toISOString(),
          }
        : null,
      cancellation: order.cancellations[0]
        ? {
            id: order.cancellations[0].id,
            status: order.cancellations[0].status,
            reason: order.cancellations[0].reason,
            createdAt: order.cancellations[0].createdAt.toISOString(),
          }
        : null,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching order:', error)
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Не удалось получить данные заказа',
        },
      },
      { status: 500 }
    )
  }
}
