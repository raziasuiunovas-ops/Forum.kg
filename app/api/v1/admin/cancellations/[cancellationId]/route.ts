import { NextRequest, NextResponse } from 'next/server'
import {
  CancellationStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  RefundMethod,
  RefundStatus,
  TicketStatus,
} from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireManager } from '@/lib/auth/middleware'

type RouteContext = { params: Promise<{ cancellationId: string }> }

const reviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  adminNote: z.string().trim().max(1000).optional(),
}).strict()

type ReviewOutcome =
  | { kind: 'not_found' }
  | { kind: 'invalid_state' }
  | { kind: 'order_not_refundable' }
  | { kind: 'ticket_not_cancellable' }
  | { kind: 'refund_already_exists' }
  | { kind: 'rejected'; cancellation: { id: string; status: CancellationStatus } }
  | { kind: 'refund_pending'; cancellation: { id: string; status: CancellationStatus }; refund: { id: string; status: RefundStatus; amountMinor: number; currency: string } }

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authResult = await requireManager(request)
  if ('headers' in authResult) return authResult

  const { cancellationId } = await context.params
  if (!validUuid(cancellationId)) return jsonError('INVALID_CANCELLATION_ID', 'Неверный формат ID запроса отмены', 400)

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return jsonError('VALIDATION_ERROR', 'Некорректный JSON запроса', 422)
  }
  const parsed = reviewSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({
      error: { code: 'VALIDATION_ERROR', message: 'Ошибка валидации решения по отмене', details: parsed.error.format() },
    }, { status: 422 })
  }

  try {
    const outcome = await prisma.$transaction(async (tx): Promise<ReviewOutcome> => {
      const reference = await tx.cancellationRequest.findUnique({
        where: { id: cancellationId },
        select: { orderId: true },
      })
      if (!reference) return { kind: 'not_found' }

      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${reference.orderId} FOR UPDATE`)

      const cancellation = await tx.cancellationRequest.findUnique({
        where: { id: cancellationId },
        include: {
          Order: {
            include: {
              OrderItem: { include: { Ticket: { include: { CheckIn: { select: { id: true } } } } } },
              Payment: { orderBy: { createdAt: 'desc' } },
              Refund: { orderBy: { createdAt: 'desc' } },
            },
          },
        },
      })
      if (!cancellation) return { kind: 'not_found' }

      const activeRefundStatuses: RefundStatus[] = [RefundStatus.PENDING, RefundStatus.PROCESSING, RefundStatus.SUCCEEDED]
      const priorRefund = cancellation.Order.Refund.find((refund) =>
        refund.ticketId === cancellation.ticketId && activeRefundStatuses.includes(refund.status))

      if (cancellation.status === CancellationStatus.APPROVED && parsed.data.decision === 'approve' && priorRefund) {
        return {
          kind: 'refund_pending',
          cancellation: { id: cancellation.id, status: cancellation.status },
          refund: { id: priorRefund.id, status: priorRefund.status, amountMinor: priorRefund.amountMinor, currency: priorRefund.currency },
        }
      }
      if (cancellation.status === CancellationStatus.REJECTED && parsed.data.decision === 'reject') {
        return { kind: 'rejected', cancellation: { id: cancellation.id, status: cancellation.status } }
      }
      const reviewableStatuses: CancellationStatus[] = [CancellationStatus.SUBMITTED, CancellationStatus.UNDER_REVIEW]
      if (!reviewableStatuses.includes(cancellation.status)) {
        return { kind: 'invalid_state' }
      }

      const now = new Date()
      if (parsed.data.decision === 'reject') {
        const updated = await tx.cancellationRequest.update({
          where: { id: cancellation.id },
          data: {
            status: CancellationStatus.REJECTED,
            reviewedById: authResult.user.userId,
            reviewedAt: now,
            adminNote: parsed.data.adminNote || null,
          },
          select: { id: true, status: true },
        })
        return { kind: 'rejected', cancellation: updated }
      }

      const refundableOrderStatuses: OrderStatus[] = [OrderStatus.PAID, OrderStatus.PARTIALLY_CANCELLED]
      if (!refundableOrderStatuses.includes(cancellation.Order.status) || !cancellation.Order.paidAt) {
        return { kind: 'order_not_refundable' }
      }

      const payment = cancellation.Order.Payment.find((candidate) => candidate.status === PaymentStatus.SUCCEEDED)
      if (!payment) return { kind: 'order_not_refundable' }

      const targetItems = cancellation.ticketId === null
        ? cancellation.Order.OrderItem
        : cancellation.Order.OrderItem.filter(({ Ticket }) => Ticket?.id === cancellation.ticketId)
      if (targetItems.length === 0 || targetItems.some(({ Ticket }) => !Ticket || Ticket.status !== TicketStatus.ACTIVE || Ticket.CheckIn !== null)) {
        return { kind: 'ticket_not_cancellable' }
      }

      if (priorRefund) return { kind: 'refund_already_exists' }
      const amountMinor = targetItems.reduce((sum, item) => sum + item.unitPriceMinor, 0)
      const outstandingRefundable = payment.amountMinor - cancellation.Order.Refund
        .filter((refund) => activeRefundStatuses.includes(refund.status))
        .reduce((sum, refund) => sum + refund.amountMinor, 0)
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > outstandingRefundable) {
        return { kind: 'order_not_refundable' }
      }

      // Finik's refund API is not available/verified. Persist the request as pending,
      // revoke admission only after manager approval, and never report refund success.
      const { randomUUID } = await import('node:crypto')
      const refund = await tx.refund.create({
        data: {
          id: randomUUID(),
          orderId: cancellation.orderId,
          paymentId: payment.id,
          ticketId: cancellation.ticketId,
          method: RefundMethod.FINIK,
          status: RefundStatus.PENDING,
          amountMinor,
          currency: payment.currency,
          reason: 'Cancellation approved; external provider refund is pending integration',
        },
        select: { id: true, status: true, amountMinor: true, currency: true },
      })

      const affectedTicketIds = targetItems.map(({ ticket }) => ticket!.id)
      const ticketsUpdated = await tx.ticket.updateMany({
        where: { id: { in: affectedTicketIds }, status: TicketStatus.ACTIVE },
        data: { status: TicketStatus.CANCELLED, cancelledAt: now },
      })
      if (ticketsUpdated.count !== affectedTicketIds.length) throw new Error('CANCELLATION_STATE_CHANGED')

      const allTicketItemsCancelled = cancellation.Order.OrderItem.every(({ Ticket }) =>
        Ticket !== null && (Ticket.status === TicketStatus.CANCELLED || affectedTicketIds.includes(Ticket.id)))
      await tx.order.update({
        where: { id: cancellation.orderId },
        data: { status: allTicketItemsCancelled ? OrderStatus.CANCELLED : OrderStatus.PARTIALLY_CANCELLED },
      })
      await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.REFUND_PENDING } })
      await tx.cancellationRequest.update({
        where: { id: cancellation.id },
        data: {
          status: CancellationStatus.APPROVED,
          reviewedById: authResult.user.userId,
          reviewedAt: now,
          adminNote: parsed.data.adminNote || null,
        },
      })

      return {
        kind: 'refund_pending',
        cancellation: { id: cancellation.id, status: CancellationStatus.APPROVED },
        refund,
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (outcome.kind === 'not_found') return jsonError('CANCELLATION_NOT_FOUND', 'Запрос отмены не найден', 404)
    if (outcome.kind === 'invalid_state') return jsonError('CANCELLATION_ALREADY_REVIEWED', 'Запрос уже обработан', 409)
    if (outcome.kind === 'order_not_refundable') return jsonError('ORDER_NOT_REFUNDABLE', 'Заказ или платёж не допускает подготовку возврата', 409)
    if (outcome.kind === 'ticket_not_cancellable') return jsonError('TICKET_NOT_CANCELLABLE', 'Билет использован, отменён или не найден', 409)
    if (outcome.kind === 'refund_already_exists') return jsonError('REFUND_ALREADY_EXISTS', 'Для билета уже есть активный возврат', 409)
    if (outcome.kind === 'rejected') {
      return NextResponse.json({ cancellation: outcome.cancellation, refundStatus: 'NOT_STARTED' }, { status: 200 })
    }

    return NextResponse.json({
      cancellation: outcome.cancellation,
      refund: outcome.refund,
      refundStatus: outcome.refund.status,
      providerRefund: 'BLOCKED',
      message: 'Отмена одобрена, возврат подготовлен и ожидает подтверждения платёжного провайдера',
    }, { status: 202 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return jsonError('CONCURRENT_MODIFICATION', 'Заказ изменился одновременно с запросом. Повторите попытку', 409)
    }
    if (error instanceof Error && error.message === 'CANCELLATION_STATE_CHANGED') {
      return jsonError('CONCURRENT_MODIFICATION', 'Состояние билета изменилось одновременно с запросом', 409)
    }
    console.error('Cancellation review failed')
    return jsonError('CANCELLATION_REVIEW_FAILED', 'Не удалось обработать запрос отмены', 500)
  }
}
