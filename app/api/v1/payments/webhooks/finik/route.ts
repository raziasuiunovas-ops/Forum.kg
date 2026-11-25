import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { OrderStatus, PaymentStatus, Prisma, RefundMethod, RefundStatus, TicketStatus, WebhookEventStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { countOccupiedSeats, lockEventRow } from '@/lib/api/events'
import { encryptQRToken } from '@/lib/crypto/qr-encryption'
import {
  FINIK_MAX_WEBHOOK_BYTES,
  readFinikWebhookPublicKey,
  readLimitedRequestText,
  verifyFinikWebhookSignature,
} from '@/lib/payments/finik'

type FinikWebhookPayload = {
  id?: unknown
  transactionId?: unknown
  status?: unknown
  amount?: unknown
  fields?: unknown
  transactionDate?: unknown
}

type FinikFields = Record<string, unknown> & {
  paymentId?: unknown
  amount?: unknown
  currency?: unknown
  orderNumber?: unknown
}

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toMinorUnits(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const minor = Math.round(value * 100)
  if (!Number.isSafeInteger(minor) || Math.abs(value - minor / 100) > 1e-9) return null
  return minor
}

function eventId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null
}

function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}

function generateQRToken(): string {
  return randomBytes(32).toString('base64url')
}

function hashQRToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function POST(request: NextRequest) {
  console.log('[Finik Webhook] ===== WEBHOOK RECEIVED =====')
  console.log('[Finik Webhook] URL:', request.url)
  console.log('[Finik Webhook] Method:', request.method)
  console.log('[Finik Webhook] Headers:', Object.fromEntries(request.headers.entries()))
  
  let rawBody: string
  try {
    const contentLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > FINIK_MAX_WEBHOOK_BYTES) {
      return jsonError('PAYLOAD_TOO_LARGE', 'Webhook payload is too large', 413)
    }
    const text = await readLimitedRequestText(request, FINIK_MAX_WEBHOOK_BYTES)
    if (text === null) return jsonError('PAYLOAD_TOO_LARGE', 'Webhook payload is too large', 413)
    rawBody = text
    console.log('[Finik Webhook] Raw body:', rawBody)
  } catch (error) {
    console.error('[Finik Webhook] Error reading body:', error)
    return jsonError('INVALID_PAYLOAD', 'Invalid webhook payload', 400)
  }

  let payload: FinikWebhookPayload
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (!isRecord(parsed)) {
      console.error('[Finik Webhook] Payload is not a record')
      return jsonError('INVALID_PAYLOAD', 'Invalid webhook payload', 400)
    }
    payload = parsed
    console.log('[Finik Webhook] Parsed payload:', JSON.stringify(payload, null, 2))
  } catch (error) {
    console.error('[Finik Webhook] JSON parse error:', error)
    return jsonError('INVALID_PAYLOAD', 'Invalid webhook payload', 400)
  }

  const fields = isRecord(payload.fields) ? payload.fields as FinikFields : null
  const paymentId = eventId(fields?.paymentId)
  const transactionId = eventId(payload.transactionId) ?? eventId(payload.id)
  
  console.log('[Finik Webhook] Extracted fields:', {
    hasFields: !!fields,
    paymentId,
    transactionId,
    status: payload.status,
    statusType: typeof payload.status
  })
  
  if (!fields || !paymentId || !transactionId || typeof payload.status !== 'string') {
    console.error('[Finik Webhook] Missing required fields')
    return jsonError('INVALID_PAYLOAD', 'Invalid webhook payload', 400)
  }

  // TEMPORARY: Skip signature verification for testing
  // TODO: Add FINIK_PROD_PUBLIC_KEY to environment variables and restore verification
  const skipVerification = process.env.FINIK_SKIP_SIGNATURE_VERIFICATION === 'true'
  
  if (!skipVerification) {
    let publicKey: string
    try {
      publicKey = readFinikWebhookPublicKey(process.env)
    } catch {
      return jsonError('WEBHOOK_NOT_CONFIGURED', 'Webhook processing is unavailable', 503)
    }

    const url = new URL(request.url)
    if (!verifyFinikWebhookSignature({
      method: request.method,
      path: url.pathname,
      host: request.headers.get('host'),
      headers: request.headers,
      query: url.searchParams,
      body: payload,
      signature: request.headers.get('signature'),
      publicKey,
    })) {
      return jsonError('INVALID_SIGNATURE', 'Webhook signature verification failed', 401)
    }
  } else {
    console.warn('[Finik Webhook] ⚠️ SIGNATURE VERIFICATION DISABLED - ONLY FOR TESTING!')
  }

  const digest = createHash('sha256').update(rawBody, 'utf8').digest('hex')
  const normalizedStatus = payload.status.toLowerCase()
  if (normalizedStatus !== 'success' && normalizedStatus !== 'succeeded') {
    return NextResponse.json({ success: true, ignored: true })
  }

  const receivedAmount = toMinorUnits(payload.amount)
  const fieldsAmount = toMinorUnits(fields.amount)
  // Finik не всегда присылает currency в fields — по умолчанию KGS
  const receivedCurrency = typeof fields.currency === 'string' ? fields.currency.toUpperCase() : 'KGS'
  const receivedOrderNumber = typeof fields.orderNumber === 'string' ? fields.orderNumber : null

  console.log('[Finik Webhook] Amount check:', { receivedAmount, fieldsAmount, receivedCurrency })

  // В тестовом режиме (FINIK_TEST_MODE=true) мы отправляем Finik 1 сом,
  // но в БД хранится реальная цена билета — сравнение суммы пропускаем.
  const testMode = process.env.FINIK_TEST_MODE === 'true'

  if (receivedAmount === null || fieldsAmount === null || (!testMode && receivedAmount !== fieldsAmount)) {
    console.error('[Finik Webhook] Amount mismatch:', { receivedAmount, fieldsAmount, testMode })
    return jsonError('INVALID_PAYMENT_DETAILS', 'Webhook payment details do not match', 400)
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const priorEvent = await tx.paymentWebhookEvent.findUnique({ where: { dedupeKey: `finik:${transactionId}` } })
      if (priorEvent) return { outcome: 'duplicate' as const }

      const candidate = await tx.payment.findUnique({
        where: { providerPaymentId: paymentId },
        include: { order: { select: { id: true, forumId: true } } },
      })
      if (!candidate) {
        console.error('[Finik Webhook] Payment not found by providerPaymentId:', paymentId)
        // Try to find by searching all payments to debug
        const allPayments = await tx.payment.findMany({
          select: { id: true, providerPaymentId: true, status: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        })
        console.error('[Finik Webhook] Recent payments:', JSON.stringify(allPayments))
        await tx.paymentWebhookEvent.create({
          data: {
            provider: 'FINIK',
            dedupeKey: `finik:${transactionId}`,
            providerEventId: transactionId,
            payloadDigest: digest,
            eventType: normalizedStatus,
            status: WebhookEventStatus.IGNORED,
          },
        })
        return { outcome: 'unknown-payment' as const }
      }

      // Match the lock used by RSVP and order reservation before touching the order,
      // payment, tickets, or capacity counts.
      await lockEventRow(tx, candidate.order.forumId)
      const payment = await tx.payment.findUnique({ where: { id: candidate.id } })
      const order = await tx.order.findUnique({
        where: { id: candidate.order.id },
        include: { items: true, forum: { select: { capacity: true, qrExpiresAt: true } } },
      })
      if (!payment || !order) return { outcome: 'unknown-payment' as const }

      const webhookEvent = await tx.paymentWebhookEvent.create({
        data: {
          provider: 'FINIK',
          dedupeKey: `finik:${transactionId}`,
          providerEventId: transactionId,
          paymentId: payment.id,
          payloadDigest: digest,
          eventType: normalizedStatus,
          status: WebhookEventStatus.RECEIVED,
        },
      })

      const isValidOrderNumber = !receivedOrderNumber || receivedOrderNumber === order.orderNumber
      
      console.log('[Finik Webhook] Payment validation:', {
        providerPaymentIdMatch: payment.providerPaymentId === paymentId,
        orderIdMatch: payment.orderId === order.id,
        amountMatch: payment.amountMinor === receivedAmount,
        dbAmount: payment.amountMinor,
        receivedAmount,
        currencyMatch: payment.currency === receivedCurrency,
        dbCurrency: payment.currency,
        receivedCurrency,
        isValidOrderNumber,
        testMode,
      })

      // В тестовом режиме суммы не совпадут (1 сом vs реальная цена) — пропускаем проверку суммы
      const amountOk = testMode ? true : (payment.amountMinor === receivedAmount && payment.amountMinor === fieldsAmount)
      
      if (
        payment.providerPaymentId !== paymentId ||
        payment.orderId !== order.id ||
        !amountOk ||
        payment.currency !== receivedCurrency ||
        !isValidOrderNumber
      ) {
        await tx.paymentWebhookEvent.update({ where: { id: webhookEvent.id }, data: { status: WebhookEventStatus.IGNORED } })
        return { outcome: 'mismatch' as const }
      }

      if (
        payment.status === PaymentStatus.SUCCEEDED ||
        payment.status === PaymentStatus.REFUND_PENDING ||
        payment.status === PaymentStatus.PARTIALLY_REFUNDED ||
        payment.status === PaymentStatus.REFUNDED
      ) {
        await tx.paymentWebhookEvent.update({ where: { id: webhookEvent.id }, data: { status: WebhookEventStatus.IGNORED } })
        return { outcome: 'already-paid' as const }
      }

      const paidAt = typeof payload.transactionDate === 'number' && Number.isFinite(payload.transactionDate)
        ? new Date(payload.transactionDate)
        : new Date()
      // Allow up to 1 hour in the future to handle clock skew
      if (!Number.isFinite(paidAt.getTime()) || paidAt.getTime() > Date.now() + 60 * 60 * 1000) {
        console.error('[Finik Webhook] Invalid transaction date:', payload.transactionDate)
        await tx.paymentWebhookEvent.update({ where: { id: webhookEvent.id }, data: { status: WebhookEventStatus.IGNORED } })
        return { outcome: 'mismatch' as const }
      }

      const occupied = await countOccupiedSeats(tx, order.forumId, new Date())
      const reservationActive = order.status === OrderStatus.PENDING_PAYMENT && !!order.reservedUntil && order.reservedUntil > new Date()
      const extraCapacity = reservationActive ? 0 : order.items.length
      const capacityUnavailable = occupied > order.forum.capacity || occupied + extraCapacity > order.forum.capacity

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.SUCCEEDED, paidAt },
      })

      if (capacityUnavailable || order.status !== OrderStatus.PENDING_PAYMENT) {
        await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELLED } })
        await tx.refund.create({
          data: {
            orderId: order.id,
            paymentId: payment.id,
            method: RefundMethod.MANUAL,
            status: RefundStatus.PENDING,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            reason: 'Payment arrived after reservation was no longer available',
          },
        })
        await tx.paymentWebhookEvent.update({ where: { id: webhookEvent.id }, data: { status: WebhookEventStatus.PROCESSED, processedAt: new Date() } })
        return { outcome: 'refund-required' as const }
      }

      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAID, paidAt } })
      for (const item of order.items) {
        const existingTicket = await tx.ticket.findUnique({ where: { orderItemId: item.id } })
        if (existingTicket) continue

        const token = generateQRToken()
        await tx.ticket.create({
          data: {
            ticketNumber: `TIX-${randomUUID()}`,
            orderItemId: item.id,
            buyerId: order.userId,
            forumId: order.forumId,
            status: TicketStatus.ACTIVE,
            qrTokenHash: hashQRToken(token),
            qrTokenEncrypted: encryptQRToken(token),
            expiresAt: order.forum.qrExpiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          },
        })
      }

      await tx.paymentWebhookEvent.update({ where: { id: webhookEvent.id }, data: { status: WebhookEventStatus.PROCESSED, processedAt: new Date() } })
      return { outcome: 'processed' as const, ticketsIssued: order.items.length }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (result.outcome === 'duplicate') return NextResponse.json({ success: true, duplicate: true })
    if (result.outcome === 'unknown-payment') return NextResponse.json({ success: true, ignored: true })
    if (result.outcome === 'mismatch') return jsonError('PAYMENT_DETAILS_MISMATCH', 'Webhook payment details do not match', 400)
    if (result.outcome === 'already-paid') return NextResponse.json({ success: true, duplicate: true })
    if (result.outcome === 'refund-required') return NextResponse.json({ success: true, processed: true, refundRequired: true })
    return NextResponse.json({ success: true, processed: true, ticketsIssued: result.ticketsIssued })
  } catch (error) {
    if (isPrismaCode(error, 'P2002')) return NextResponse.json({ success: true, duplicate: true })
    // Do not log provider payloads, headers, signatures, or database error contents.
    console.error('Finik webhook transaction failed')
    return jsonError('WEBHOOK_PROCESSING_FAILED', 'Failed to process webhook', 500)
  }
}
