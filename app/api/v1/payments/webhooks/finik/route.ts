/**
 * POST /api/v1/payments/webhooks/finik
 * Finik payment webhook handler
 * 
 * IMPORTANT: This is a STUB implementation due to lack of Finik API documentation.
 * In production, you must:
 * 1. Implement webhook signature verification
 * 2. Parse actual Finik webhook payload
 * 3. Map Finik payment statuses to internal statuses
 * 4. Handle all payment lifecycle events
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { OrderStatus, PaymentStatus, TicketStatus } from '@prisma/client'
import crypto from 'crypto'
import { encryptQRToken } from '@/lib/crypto/qr-encryption'

/**
 * Stub webhook payload structure
 * Replace with actual Finik webhook schema when available
 */
interface FinikWebhookPayload {
  event_type: 'payment.succeeded' | 'payment.failed' | 'payment.expired'
  payment_id: string // Finik's payment ID
  order_number: string // Our order number
  amount: number
  currency: string
  status: string
  paid_at?: string
  metadata?: Record<string, any>
}

/**
 * Verify Finik webhook signature
 * 
 * PRODUCTION REQUIREMENTS - BLOCKED:
 * To complete this implementation, you need the following from Finik API documentation:
 * 1. Signature algorithm (HMAC-SHA256, HMAC-SHA512, or other)
 * 2. HTTP header name for signature (e.g., X-Finik-Signature, X-Hub-Signature-256)
 * 3. Payload format for signature calculation (raw body, specific fields, etc.)
 * 4. Signature format (hex, base64, prefixed with "sha256=", etc.)
 * 5. Timestamp validation requirements (if any)
 * 6. Webhook secret key format and how to obtain it
 * 
 * CURRENT IMPLEMENTATION:
 * - Uses HMAC-SHA256 (common standard, adjust if Finik uses different algorithm)
 * - Expects signature in X-Finik-Signature header
 * - Signs raw request body
 * - Compares using timing-safe comparison
 * 
 * SECURITY NOTES:
 * - NEVER bypass signature verification in production (NODE_ENV check is temporary)
 * - Use constant-time comparison to prevent timing attacks
 * - Validate timestamp if Finik includes it (prevents replay attacks)
 * - Log failed verification attempts for monitoring
 * 
 * @param payload - Raw request body (as string, before JSON parsing)
 * @param signature - Signature from X-Finik-Signature header
 * @param secret - Webhook secret from FINIK_WEBHOOK_SECRET environment variable
 * @returns true if signature is valid, false otherwise
 */
function verifyFinikSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) {
    console.warn('[SECURITY] No signature provided for Finik webhook')
    return false
  }

  // SECURITY: No bypass in any environment
  // For local testing without Finik, use test endpoint: POST /api/v1/payments/verify-test
  // Production MUST have valid FINIK_WEBHOOK_SECRET and proper signature

  try {
    // Calculate expected signature using HMAC-SHA256
    // ADJUST ALGORITHM IF FINIK USES DIFFERENT METHOD (check their docs)
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf-8')
      .digest('hex')

    // Some providers prefix signature with algorithm: "sha256=abc123..."
    // Adjust this parsing based on Finik's actual format
    let receivedSignature = signature
    if (signature.includes('=')) {
      const parts = signature.split('=')
      if (parts.length === 2 && parts[0] === 'sha256') {
        receivedSignature = parts[1]
      }
    }

    // Constant-time comparison to prevent timing attacks
    // Both strings must be same length for timingSafeEqual
    if (expectedSignature.length !== receivedSignature.length) {
      console.warn('[SECURITY] Signature length mismatch', {
        expected: expectedSignature.length,
        received: receivedSignature.length,
      })
      return false
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf-8'),
      Buffer.from(receivedSignature, 'utf-8')
    )

    if (!isValid) {
      console.warn('[SECURITY] Webhook signature verification failed')
    }

    return isValid
  } catch (error) {
    console.error('[SECURITY] Error during signature verification:', error)
    return false
  }
}

/**
 * Generate QR token for ticket
 * Uses cryptographically secure random bytes
 */
function generateQRToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * Hash QR token for lookup
 */
function hashQRToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    // Get webhook signature
    const signature = request.headers.get('x-finik-signature')

    // Get raw body for signature verification
    const rawBody = await request.text()
    let payload: FinikWebhookPayload

    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Invalid JSON payload',
          },
        },
        { status: 400 }
      )
    }

    // Verify webhook signature
    const finikSecret = process.env.FINIK_WEBHOOK_SECRET || 'dev-secret'
    if (!verifyFinikSignature(rawBody, signature, finikSecret)) {
      console.error('Invalid Finik webhook signature')
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_SIGNATURE',
            message: 'Webhook signature verification failed',
          },
        },
        { status: 401 }
      )
    }

    // Generate dedupe key to prevent duplicate processing
    const dedupeKey = `finik:${payload.payment_id}:${payload.event_type}`

    // Calculate payload digest for audit
    const payloadDigest = crypto.createHash('sha256').update(rawBody).digest('hex')

    // Process webhook in transaction with deduplication check INSIDE transaction
    // This prevents race conditions where two identical webhooks arrive simultaneously
    const result = await prisma.$transaction(async (tx) => {
      // Check for duplicate webhook inside transaction (prevents race condition)
      const existingWebhook = await tx.paymentWebhookEvent.findUnique({
        where: { dedupeKey },
      })

      if (existingWebhook) {
        console.log(`Duplicate webhook ignored (in transaction): ${dedupeKey}`)
        // Return early from transaction - no processing needed
        return {
          duplicate: true,
          payment: null,
          order: null,
          tickets: [],
          webhookEvent: existingWebhook,
        }
      }
      // 1. Find order by orderNumber
      const order = await tx.order.findFirst({
        where: { orderNumber: payload.order_number },
        include: {
          items: true,
          payments: {
            where: { providerPaymentId: payload.payment_id },
            take: 1,
          },
        },
      })

      if (!order) {
        throw new Error('ORDER_NOT_FOUND')
      }

      // 2. Find or update payment record
      let payment = order.payments[0]

      if (!payment) {
        // Create payment if doesn't exist (shouldn't happen normally)
        payment = await tx.payment.create({
          data: {
            orderId: order.id,
            provider: 'FINIK',
            providerPaymentId: payload.payment_id,
            status: PaymentStatus.PENDING,
            amountMinor: Math.round(payload.amount * 100), // Convert to minor units
            currency: payload.currency,
          },
        })
      }

      // 3. Record webhook event
      const webhookEvent = await tx.paymentWebhookEvent.create({
        data: {
          provider: 'FINIK',
          dedupeKey,
          providerEventId: payload.payment_id,
          paymentId: payment.id,
          payloadDigest,
          eventType: payload.event_type,
          status: 'RECEIVED',
        },
      })

      // 4. Process event based on type
      let updatedPayment
      let updatedOrder
      const tickets: any[] = []

      if (payload.event_type === 'payment.succeeded') {
        // Payment successful - update payment and order
        const paidAt = payload.paid_at ? new Date(payload.paid_at) : new Date()

        updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCEEDED,
            paidAt,
          },
        })

        updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.PAID,
            paidAt,
          },
        })

        // 5. Issue tickets for all order items
        for (const item of order.items) {
          // Check if ticket already exists (idempotency)
          const existingTicket = await tx.ticket.findUnique({
            where: { orderItemId: item.id },
          })

          if (existingTicket) {
            tickets.push(existingTicket)
            continue
          }

          // Generate ticket number: TIX-YYYYMMDD-XXXXXX
          const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
          const randomPart = Math.floor(Math.random() * 1000000)
            .toString()
            .padStart(6, '0')
          const ticketNumber = `TIX-${datePart}-${randomPart}`

          // Get forum and order item details
          const forum = await tx.forum.findUnique({
            where: { id: order.forumId },
            select: { qrExpiresAt: true },
          })

          const fullItem = await tx.orderItem.findUnique({
            where: { id: item.id },
            select: {
              participantFirstName: true,
              participantLastName: true,
              ticketCategoryId: true,
            },
          })

          // Generate QR token
          const qrToken = generateQRToken()
          const qrTokenHash = hashQRToken(qrToken)

          // Encrypt qrToken using AES-256-GCM
          // This replaces the insecure Base64 encoding
          const qrTokenEncrypted = encryptQRToken(qrToken)

          // Create ticket
          const ticket = await tx.ticket.create({
            data: {
              ticketNumber,
              orderItemId: item.id,
              buyerId: order.userId,
              forumId: order.forumId,
              status: TicketStatus.ACTIVE,
              qrTokenHash,
              qrTokenEncrypted, // TODO: Use proper encryption in production
              expiresAt: forum?.qrExpiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            },
          })

          tickets.push({ ...ticket, qrToken, categoryId: fullItem?.ticketCategoryId })
        }

        // Mark webhook as processed
        await tx.paymentWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
          },
        })
      } else if (payload.event_type === 'payment.failed') {
        // Payment failed
        updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED },
        })

        updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.PAYMENT_FAILED },
        })

        await tx.paymentWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
          },
        })
      } else if (payload.event_type === 'payment.expired') {
        // Payment expired
        updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.EXPIRED },
        })

        updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.EXPIRED },
        })

        await tx.paymentWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
          },
        })
      } else {
        // Unknown event type - mark as ignored
        await tx.paymentWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: { status: 'IGNORED' },
        })
      }

      return {
        duplicate: false,
        payment: updatedPayment,
        order: updatedOrder,
        tickets,
        webhookEvent,
      }
    })

    // Handle duplicate detection result
    if (result.duplicate) {
      return NextResponse.json({ success: true, duplicate: true })
    }

    console.log(`Processed Finik webhook: ${payload.event_type} for order ${payload.order_number}`)

    // In production, should trigger:
    // - Email notification to user
    // - Telegram notification if connected
    // - SMS with ticket links

    return NextResponse.json({
      success: true,
      processed: true,
      ticketsIssued: result.tickets?.length || 0,
    })
  } catch (error: any) {
    console.error('Error processing Finik webhook:', error)

    // Handle Prisma unique constraint violation (duplicate dedupeKey)
    // This is a backup safety check - should not happen with transaction-based deduplication
    if (error.code === 'P2002' && error.meta?.target?.includes('dedupeKey')) {
      console.log(`Duplicate webhook caught by unique constraint: ${error.meta.target}`)
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: 'Webhook already processed',
      })
    }

    if (error.message === 'ORDER_NOT_FOUND') {
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

    // Return 500 to trigger Finik retry
    return NextResponse.json(
      {
        error: {
          code: 'WEBHOOK_PROCESSING_FAILED',
          message: 'Failed to process webhook',
        },
      },
      { status: 500 }
    )
  }
}
