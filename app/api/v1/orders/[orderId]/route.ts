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
/**
 * DELETE /api/v1/orders/{orderId}
 * Cancel unpaid order (owner only, PENDING_PAYMENT status only)
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    // Authenticate user
    const authResult = await requireAuth(request)
    
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

    // Use Serializable transaction to prevent race conditions
    const result = await prisma.$transaction(async (tx) => {
      // Lock order for update
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`

      // Get order with owner check
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          userId: user.userId,
        },
        include: {
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      })

      if (!order) {
        return { kind: 'not_found' as const }
      }

      // Only allow cancellation of PENDING_PAYMENT orders
      if (order.status !== 'PENDING_PAYMENT') {
        return { kind: 'not_cancellable' as const, status: order.status }
      }

      // Check if already expired or paid
      const now = new Date()
      if (order.reservedUntil && order.reservedUntil < now) {
        return { kind: 'already_expired' as const }
      }

      if (order.paidAt) {
        return { kind: 'already_paid' as const }
      }

      // Cancel order and expire payment
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      })

      // Expire pending payment if exists
      if (order.payments[0]) {
        await tx.payment.updateMany({
          where: {
            id: order.payments[0].id,
            status: { in: ['CREATED', 'PENDING', 'PROCESSING'] },
          },
          data: { status: 'EXPIRED' },
        })
      }

      return { kind: 'success' as const }
    }, {
      isolationLevel: 'Serializable',
    })

    if (result.kind === 'not_found') {
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

    if (result.kind === 'not_cancellable') {
      return NextResponse.json(
        {
          error: {
            code: 'ORDER_NOT_CANCELLABLE',
            message: `Нельзя отменить заказ в статусе ${result.status}. Только неоплаченные заказы можно отменить напрямую.`,
          },
        },
        { status: 409 }
      )
    }

    if (result.kind === 'already_expired') {
      return NextResponse.json(
        {
          error: {
            code: 'ORDER_ALREADY_EXPIRED',
            message: 'Заказ уже истёк',
          },
        },
        { status: 409 }
      )
    }

    if (result.kind === 'already_paid') {
      return NextResponse.json(
        {
          error: {
            code: 'ORDER_ALREADY_PAID',
            message: 'Заказ уже оплачен. Используйте endpoint отмены с возвратом средств.',
          },
        },
        { status: 409 }
      )
    }

    return NextResponse.json(
      {
        message: 'Заказ успешно отменён',
        orderId,
        status: 'CANCELLED',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error cancelling unpaid order:', error)
    
    // Handle Prisma transaction conflicts
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') {
      return NextResponse.json(
        {
          error: {
            code: 'CONCURRENT_MODIFICATION',
            message: 'Заказ изменился одновременно с запросом. Повторите попытку.',
          },
        },
        { status: 409 }
      )
    }

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Не удалось отменить заказ',
        },
      },
      { status: 500 }
    )
  }
}
