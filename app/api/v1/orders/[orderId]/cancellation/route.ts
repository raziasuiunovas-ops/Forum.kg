import { NextRequest, NextResponse } from 'next/server'
import { CancellationStatus, OrderStatus, PaymentStatus, Prisma, TicketStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'

type RouteContext = { params: Promise<{ orderId: string }> }

const requestSchema = z.object({
  ticketId: z.string().uuid().optional(),
  reason: z.string().trim().max(1000).optional(),
}).strict()

type RequestOutcome =
  | { kind: 'not_found' }
  | { kind: 'not_cancellable' }
  | { kind: 'payment_unavailable' }
  | { kind: 'ticket_not_found' }
  | { kind: 'ticket_not_cancellable' }
  | { kind: 'request_in_progress' }
  | { kind: 'created' | 'existing'; cancellation: { id: string; ticketId: string | null; status: CancellationStatus; reason: string | null; createdAt: Date } }

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(request)
  if ('headers' in authResult) return authResult

  const { orderId } = await context.params
  if (!validUuid(orderId)) return jsonError('INVALID_ORDER_ID', 'Неверный формат ID заказа', 400)

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return jsonError('VALIDATION_ERROR', 'Некорректный JSON запроса', 422)
  }
  const parsed = requestSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({
      error: { code: 'VALIDATION_ERROR', message: 'Ошибка валидации запроса отмены', details: parsed.error.format() },
    }, { status: 422 })
  }

  try {
    const outcome = await prisma.$transaction(async (tx): Promise<RequestOutcome> => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`)

      const order = await tx.order.findFirst({
        where: { id: orderId, userId: authResult.user.userId },
        include: {
          items: { include: { ticket: { include: { checkIn: { select: { id: true } } } } } },
          payments: { orderBy: { createdAt: 'desc' } },
          cancellations: { orderBy: { createdAt: 'desc' } },
        },
      })
      if (!order) return { kind: 'not_found' }

      const reusableStatuses: CancellationStatus[] = [CancellationStatus.SUBMITTED, CancellationStatus.UNDER_REVIEW, CancellationStatus.APPROVED, CancellationStatus.COMPLETED]
      const sameRequest = order.cancellations.find((cancellation) => cancellation.ticketId === (parsed.data.ticketId ?? null)
        && reusableStatuses.includes(cancellation.status))
      if (sameRequest) return { kind: 'existing', cancellation: sameRequest }

      const openStatuses: CancellationStatus[] = [CancellationStatus.SUBMITTED, CancellationStatus.UNDER_REVIEW]
      const overlappingOpenRequest = order.cancellations.some((cancellation) =>
        openStatuses.includes(cancellation.status)
        && (cancellation.ticketId === null || parsed.data.ticketId === undefined || cancellation.ticketId === parsed.data.ticketId))
      if (overlappingOpenRequest) return { kind: 'request_in_progress' }

      const cancellableOrderStatuses: OrderStatus[] = [OrderStatus.PAID, OrderStatus.PARTIALLY_CANCELLED]
      if (!cancellableOrderStatuses.includes(order.status) || !order.paidAt) {
        return { kind: 'not_cancellable' }
      }
      const payment = order.payments.find(({ status }) => status === PaymentStatus.SUCCEEDED)
      if (!payment) return { kind: 'payment_unavailable' }

      const targetItems = parsed.data.ticketId === undefined
        ? order.items
        : order.items.filter(({ ticket }) => ticket?.id === parsed.data.ticketId)
      if (targetItems.length === 0 || targetItems.some(({ ticket }) => !ticket)) return { kind: 'ticket_not_found' }
      if (targetItems.some(({ ticket }) => ticket!.status !== TicketStatus.ACTIVE || ticket!.checkIn !== null)) {
        return { kind: 'ticket_not_cancellable' }
      }

      const cancellation = await tx.cancellationRequest.create({
        data: {
          orderId: order.id,
          ticketId: parsed.data.ticketId ?? null,
          requesterId: authResult.user.userId,
          status: CancellationStatus.SUBMITTED,
          reason: parsed.data.reason || null,
        },
        select: { id: true, ticketId: true, status: true, reason: true, createdAt: true },
      })
      return { kind: 'created', cancellation }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (outcome.kind === 'not_found') return jsonError('ORDER_NOT_FOUND', 'Заказ не найден', 404)
    if (outcome.kind === 'not_cancellable') return jsonError('ORDER_NOT_CANCELLABLE', 'Заказ нельзя отменить в текущем статусе', 409)
    if (outcome.kind === 'payment_unavailable') return jsonError('PAYMENT_NOT_REFUNDABLE', 'Для заказа нет подтверждённого платежа, доступного для возврата', 409)
    if (outcome.kind === 'ticket_not_found') return jsonError('TICKET_NOT_FOUND', 'Билет не найден в этом заказе', 404)
    if (outcome.kind === 'ticket_not_cancellable') return jsonError('TICKET_NOT_CANCELLABLE', 'Использованный или ранее отменённый билет нельзя отменить', 409)
    if (outcome.kind === 'request_in_progress') return jsonError('CANCELLATION_IN_PROGRESS', 'Для заказа уже рассматривается пересекающийся запрос отмены', 409)

    return NextResponse.json({
      cancellation: outcome.cancellation,
      refundStatus: outcome.kind === 'existing' && outcome.cancellation.status === CancellationStatus.APPROVED
        ? 'PENDING_PROVIDER'
        : 'NOT_STARTED',
      reused: outcome.kind === 'existing',
    }, { status: outcome.kind === 'created' ? 201 : 200 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return jsonError('CONCURRENT_MODIFICATION', 'Заказ изменился одновременно с запросом. Повторите попытку', 409)
    }
    console.error('Order cancellation request failed')
    return jsonError('CANCELLATION_REQUEST_FAILED', 'Не удалось создать запрос отмены', 500)
  }
}
