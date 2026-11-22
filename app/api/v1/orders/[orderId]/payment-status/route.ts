/**
 * GET /api/v1/orders/{orderId}/payment-status
 * Check payment status (for polling after redirect)
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

    // Get order with payment info
    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      select: {
        id: true,
        userId: true,
        status: true,
        paidAt: true,
        reservedUntil: true,
        payments: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          select: {
            id: true,
            status: true,
            paidAt: true,
            providerPaymentId: true,
          },
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

    // Authorization check
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

    const payment = order.payments[0]

    const response = {
      orderStatus: isReservationExpired ? 'EXPIRED' : order.status,
      paymentStatus: payment?.status || null,
      paidAt: payment?.paidAt?.toISOString() || null,
      providerPaymentId: payment?.providerPaymentId || null,
      reservedUntil: order.reservedUntil?.toISOString() || null,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error checking payment status:', error)
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Не удалось проверить статус оплаты',
        },
      },
      { status: 500 }
    )
  }
}
