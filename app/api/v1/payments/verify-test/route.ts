/**
 * POST /api/v1/payments/verify-test
 * Manual payment verification for development/testing
 * 
 * SECURITY: This endpoint should be DISABLED in production
 * or protected with admin-only access
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const verifyTestPaymentSchema = z.object({
  orderNumber: z.string(),
  simulateSuccess: z.boolean().default(true),
})

export async function POST(request: NextRequest) {
  // SECURITY: Disable in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        error: {
          code: 'ENDPOINT_DISABLED',
          message: 'This endpoint is disabled in production',
        },
      },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const validation = verifyTestPaymentSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request',
            details: validation.error.format(),
          },
        },
        { status: 422 }
      )
    }

    const { orderNumber, simulateSuccess } = validation.data

    // Find order
    const order = await prisma.Order.findFirst({
      where: { orderNumber },
      include: {
        Payment: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!order) {
      return NextResponse.json(
        {
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'Order not found',
          },
        },
        { status: 404 }
      )
    }

    if (!order.payments[0]) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_PAYMENT_RECORD',
            message: 'No payment record found for order',
          },
        },
        { status: 404 }
      )
    }

    const payment = order.payments[0]

    // Simulate webhook by calling the webhook endpoint
    const webhookPayload = {
      event_type: simulateSuccess ? 'payment.succeeded' : 'payment.failed',
      payment_id: payment.providerPaymentId || payment.id,
      order_number: orderNumber,
      amount: order.totalMinor / 100, // Convert from minor units
      currency: order.currency,
      status: simulateSuccess ? 'succeeded' : 'failed',
      paid_at: simulateSuccess ? new Date().toISOString() : undefined,
    }

    // Call webhook handler
    const webhookUrl = new URL('/api/v1/payments/webhooks/finik', request.url)
    const webhookResponse = await fetch(webhookUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-finik-signature': 'test-signature',
      },
      body: JSON.stringify(webhookPayload),
    })

    const webhookResult = await webhookResponse.json()

    return NextResponse.json({
      success: true,
      message: `Payment ${simulateSuccess ? 'succeeded' : 'failed'} simulation triggered`,
      orderNumber,
      webhookResult,
    })
  } catch (error) {
    console.error('Error verifying test Payment:', error)
    return NextResponse.json(
      {
        error: {
          code: 'VERIFICATION_FAILED',
          message: 'Failed to verify payment',
        },
      },
      { status: 500 }
    )
  }
}
