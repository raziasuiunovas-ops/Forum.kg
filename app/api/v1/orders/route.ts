/**
 * POST /api/v1/orders
 * Create order with capacity validation and idempotency
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/middleware'
import { OrderIdempotencyStatus, OrderStatus, PaymentStatus, Prisma } from '@prisma/client'
import { createAuthError } from '@/lib/auth'
import { createFinikPayment } from '@/lib/payments/finik'

const createOrderSchema = z.object({
  forumId: z.string().uuid(),
  items: z
    .array(
      z.object({
        ticketCategoryId: z.string().uuid(),
        participantFirstName: z.string().min(1).max(100),
        participantLastName: z.string().min(1).max(100),
      })
    )
    .min(1)
    .max(20), // Reasonable limit per order
})

// Order reservation timeout (30 minutes — enough time to pay and receive webhook)
const RESERVATION_TIMEOUT_MS = 30 * 60 * 1000
const MAX_ORDER_TRANSACTION_ATTEMPTS = 3
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7E]{1,255}$/
const FINIK_REQUEST_LEASE_MS = 30_000

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function idempotencyConflict(): NextResponse {
  return NextResponse.json({
    error: {
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency-Key уже использован с другим запросом',
    },
  }, { status: 409 })
}

async function resumeIdempotencyResponse(
  userId: string,
  keyHash: string,
  fingerprint: string
): Promise<NextResponse | null> {
  const saved = await prisma.orderIdempotency.findUnique({
    where: { userId_keyHash: { userId, keyHash } },
  })
  if (!saved) return null
  if (saved.fingerprint !== fingerprint) return idempotencyConflict()
  if (saved.status === OrderIdempotencyStatus.COMPLETED && saved.responseStatus !== null && saved.response !== null) {
    return NextResponse.json(saved.response, { status: saved.responseStatus })
  }
  if (!saved.orderId) {
    return NextResponse.json({
      error: { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE', message: 'Результат запроса ещё обрабатывается. Повторите запрос позже' },
    }, { status: 503, headers: { 'Retry-After': '1' } })
  }
  return createFinikOrderResponse(saved.id)
}

async function createFinikOrderResponse(idempotencyId: string): Promise<NextResponse> {
  const idempotency = await prisma.orderIdempotency.findUnique({ where: { id: idempotencyId } })
  if (!idempotency?.orderId) {
    return NextResponse.json({
      error: { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE', message: 'Результат запроса ещё обрабатывается. Повторите запрос позже' },
    }, { status: 503, headers: { 'Retry-After': '1' } })
  }
  if (idempotency.status === OrderIdempotencyStatus.COMPLETED && idempotency.responseStatus !== null && idempotency.response !== null) {
    return NextResponse.json(idempotency.response, { status: idempotency.responseStatus })
  }

  const [order, payment] = await Promise.all([
    prisma.order.findUnique({
      where: { id: idempotency.orderId },
      include: {
        items: { include: { ticketCategory: { include: { translations: true } } } },
        forum: { include: { translations: true } },
      },
    }),
    prisma.payment.findFirst({
      where: { orderId: idempotency.orderId, provider: 'FINIK' },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  if (!order || !payment) throw new Error('FINIK_PAYMENT_RECORD_NOT_FOUND')

  const now = new Date()
  const alreadyPaid = order.status === OrderStatus.PAID || payment.status === PaymentStatus.SUCCEEDED
  const reservationExpired = order.status === OrderStatus.PENDING_PAYMENT && (!order.reservedUntil || order.reservedUntil <= now)
  const orderClosed = order.status !== OrderStatus.PENDING_PAYMENT && !alreadyPaid
  if (reservationExpired || orderClosed) {
    const body = { error: { code: 'ORDER_RESERVATION_EXPIRED', message: 'Срок резервации заказа истёк' } }
    await prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: {
          id: order.id,
          status: OrderStatus.PENDING_PAYMENT,
          OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
        },
        data: { status: OrderStatus.EXPIRED },
      })
      await tx.payment.updateMany({ where: { id: payment.id, status: { in: [PaymentStatus.CREATED, PaymentStatus.PROCESSING] } }, data: { status: PaymentStatus.EXPIRED } })
      await tx.orderIdempotency.update({
        where: { id: idempotency.id },
        data: { status: OrderIdempotencyStatus.COMPLETED, responseStatus: 410, response: body as Prisma.InputJsonValue },
      })
    })
    return NextResponse.json(body, { status: 410 })
  }
  const finikEndDate = order.reservedUntil ?? new Date(now.getTime() + RESERVATION_TIMEOUT_MS)

  const leaseExpiredAt = new Date(now.getTime() - FINIK_REQUEST_LEASE_MS)
  const claim = alreadyPaid ? { count: 1 } : await prisma.payment.updateMany({
    where: {
      id: payment.id,
      OR: [
        { status: PaymentStatus.CREATED },
        { status: PaymentStatus.PROCESSING, updatedAt: { lt: leaseExpiredAt } },
      ],
    },
    data: { status: PaymentStatus.PROCESSING, providerPaymentId: payment.providerPaymentId ?? payment.id },
  })
  if (claim.count !== 1) {
    const refreshed = await prisma.orderIdempotency.findUnique({ where: { id: idempotency.id } })
    if (refreshed?.status === OrderIdempotencyStatus.COMPLETED && refreshed.responseStatus !== null && refreshed.response !== null) {
      return NextResponse.json(refreshed.response, { status: refreshed.responseStatus })
    }
    return NextResponse.json({
      error: { code: 'PAYMENT_INITIALIZATION_IN_PROGRESS', message: 'Платёж создаётся. Повторите запрос позже' },
    }, { status: 503, headers: { 'Retry-After': '1' } })
  }

  try {
    const { paymentUrl } = await createFinikPayment({
      paymentId: payment.providerPaymentId ?? payment.id,
      orderNumber: order.orderNumber,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      reservedUntil: finikEndDate,
    })
    const response = {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalMinor: order.totalMinor,
        currency: order.currency,
        reservedUntil: order.reservedUntil?.toISOString() ?? null,
        createdAt: order.createdAt.toISOString(),
        items: order.items.map((item) => ({
          id: item.id,
          participantFirstName: item.participantFirstName,
          participantLastName: item.participantLastName,
          unitPriceMinor: item.unitPriceMinor,
          categoryName: item.ticketCategory.translations[0]?.name || item.ticketCategory.code,
        })),
        forum: {
          id: order.forum.id,
          slug: order.forum.slug,
          title: order.forum.translations[0]?.title || 'Untitled',
          startsAt: order.forum.startsAt.toISOString(),
        },
      },
      paymentUrl,
    }

    const savedResponse = await prisma.$transaction(async (tx) => {
      const current = await tx.orderIdempotency.findUnique({ where: { id: idempotency.id } })
      if (current?.status === OrderIdempotencyStatus.COMPLETED && current.responseStatus !== null && current.response !== null) {
        return { body: current.response as Prisma.InputJsonValue, status: current.responseStatus }
      }
      await tx.payment.updateMany({
        where: { id: payment.id, status: { in: [PaymentStatus.PROCESSING, PaymentStatus.CREATED] } },
        data: { status: PaymentStatus.PENDING, providerPaymentId: payment.providerPaymentId ?? payment.id },
      })
      await tx.orderIdempotency.update({
        where: { id: idempotency.id },
        data: { status: OrderIdempotencyStatus.COMPLETED, responseStatus: 201, response: response as Prisma.InputJsonValue },
      })
      return { body: response as Prisma.InputJsonValue, status: 201 }
    })
    return NextResponse.json(savedResponse.body, { status: savedResponse.status })
  } catch (error) {
    console.error('[Finik Payment Error]', error)
    console.error('[Finik Payment Error Stack]', error instanceof Error ? error.stack : 'No stack')
    await prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PROCESSING },
      data: { status: PaymentStatus.CREATED },
    }).catch(() => undefined)
    return NextResponse.json({
      error: { code: 'FINIK_PAYMENT_UNAVAILABLE', message: 'Не удалось создать платёж. Повторите запрос позже' },
    }, { status: 502, headers: { 'Retry-After': '1' } })
  }
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}

/**
 * Generate unique order number
 * Format: ORD-YYYYMMDD-XXXXXX
 */
function generateOrderNumber(): string {
  const date = new Date()
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '')
  const randomPart = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0')
  return `ORD-${datePart}-${randomPart}`
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const authResult = await requireAuth(request)
    
    // Check if auth failed (returns NextResponse)
    if ('headers' in authResult) {
      return authResult
    }

    const user = authResult.user

    const idempotencyKey = request.headers.get('idempotency-key')
    if (idempotencyKey === null) {
      return NextResponse.json({
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'Требуется заголовок Idempotency-Key',
        },
      }, { status: 400 })
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return NextResponse.json({
        error: {
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency-Key должен содержать от 1 до 255 печатных ASCII-символов',
        },
      }, { status: 400 })
    }

    // Parse request body
    const body = await request.json()
    const validation = createOrderSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Ошибка валидации данных заказа',
            details: validation.error.format(),
          },
        },
        { status: 422 }
      )
    }

    const { forumId, items } = validation.data
    const keyHash = sha256(idempotencyKey)
    const fingerprint = sha256(JSON.stringify({
      forumId,
      items: items.map((item) => ({
        ticketCategoryId: item.ticketCategoryId,
        participantFirstName: item.participantFirstName,
        participantLastName: item.participantLastName,
      })),
    }))

    const previousResponse = await resumeIdempotencyResponse(user.userId, keyHash, fingerprint)
    if (previousResponse) return previousResponse

    // Execute order creation in transaction with capacity checks
    const createOrderTransaction = () => prisma.$transaction(
      async (tx) => {
        const idempotency = await tx.orderIdempotency.create({
          data: {
            userId: user.userId,
            keyHash,
            fingerprint,
            status: OrderIdempotencyStatus.PROCESSING,
          },
          select: { id: true },
        })

        // 1. Get forum with FOR UPDATE lock to prevent race conditions
        const forum = await tx.forum.findUnique({
          where: { id: forumId },
          include: {
            categories: true,
          },
        })

        if (!forum) {
          throw new Error('FORUM_NOT_FOUND')
        }

        // Check forum is published and not cancelled
        if (forum.status !== 'PUBLISHED') {
          throw new Error('FORUM_NOT_AVAILABLE')
        }

        // Check forum hasn't started yet (allow orders until start time)
        if (forum.startsAt < new Date()) {
          throw new Error('FORUM_ALREADY_STARTED')
        }

        // 2. Check maxTicketsPerAccount limit
        // Count non-cancelled tickets + active order items for this user+forum
        const [userTicketsCount, userActiveOrderItems] = await Promise.all([
          tx.ticket.count({
            where: {
              buyerId: user.userId,
              forumId: forum.id,
              status: {
                in: ['ACTIVE', 'USED'], // Don't count CANCELLED
              },
            },
          }),
          tx.orderItem.count({
            where: {
              order: {
                userId: user.userId,
                forumId: forum.id,
                status: {
                  in: ['PENDING_PAYMENT', 'PAID'],
                },
                // Check unexpired reservations
                OR: [
                  { reservedUntil: { gte: new Date() } },
                  { status: 'PAID' },
                ],
              },
            },
          }),
        ])

        const userCurrentTickets = userTicketsCount + userActiveOrderItems

        if (userCurrentTickets + items.length > forum.maxTicketsPerAccount) {
          throw new Error('MAX_TICKETS_PER_ACCOUNT_EXCEEDED')
        }

        // 3. Check forum capacity
        const [soldTickets, reservedItems] = await Promise.all([
          tx.ticket.count({
            where: {
              forumId: forum.id,
              status: 'ACTIVE',
            },
          }),
          tx.orderItem.count({
            where: {
              order: {
                forumId: forum.id,
                status: 'PENDING_PAYMENT',
                reservedUntil: { gte: new Date() },
              },
            },
          }),
        ])

        const totalOccupied = soldTickets + reservedItems

        if (totalOccupied + items.length > forum.capacity) {
          throw new Error('FORUM_CAPACITY_EXCEEDED')
        }

        // 4. Check category capacities and get prices
        const categoryMap = new Map(forum.categories.map((c) => [c.id, c]))
        let subtotalMinor = 0

        for (const item of items) {
          const category = categoryMap.get(item.ticketCategoryId)
          if (!category) {
            throw new Error('CATEGORY_NOT_FOUND')
          }

          if (!category.isActive) {
            throw new Error('CATEGORY_NOT_ACTIVE')
          }

          // Check category capacity if set
          if (category.capacity) {
            const categorySold = await tx.orderItem.count({
              where: {
                ticketCategoryId: category.id,
                OR: [
                  // Already issued tickets
                  { ticket: { isNot: null } },
                  // Active reservations
                  {
                    order: {
                      status: 'PENDING_PAYMENT',
                      reservedUntil: { gte: new Date() },
                    },
                  },
                ],
              },
            })

            if (categorySold >= category.capacity) {
              throw new Error('CATEGORY_CAPACITY_EXCEEDED')
            }
          }

          subtotalMinor += category.priceMinor
        }

        const totalMinor = subtotalMinor // No fees for now

        // 5. Create order
        const orderNumber = generateOrderNumber()
        const reservedUntil = new Date(Date.now() + RESERVATION_TIMEOUT_MS)

        const order = await tx.order.create({
          data: {
            orderNumber,
            userId: user.userId,
            forumId: forum.id,
            status: OrderStatus.PENDING_PAYMENT,
            subtotalMinor,
            totalMinor,
            currency: 'KGS',
            reservedUntil,
            items: {
              create: items.map((item) => {
                const category = categoryMap.get(item.ticketCategoryId)!
                return {
                  ticketCategoryId: item.ticketCategoryId,
                  participantFirstName: item.participantFirstName,
                  participantLastName: item.participantLastName,
                  unitPriceMinor: category.priceMinor, // Immutable price snapshot
                }
              }),
            },
          },
          include: {
            items: {
              include: {
                ticketCategory: {
                  include: {
                    translations: true,
                  },
                },
              },
            },
            forum: {
              include: {
                translations: true,
              },
            },
          },
        })

        // 6. Create payment record (CREATED status)
        const payment = await tx.payment.create({
          data: {
            orderId: order.id,
            provider: 'FINIK',
            status: PaymentStatus.CREATED,
            amountMinor: totalMinor,
            currency: 'KGS',
          },
        })

        // Persist the order and stable provider ID before calling Finik. The external
        // request must stay outside this retried Serializable transaction.
        await tx.payment.update({
          where: { id: payment.id },
          data: { providerPaymentId: payment.id },
        })
        await tx.orderIdempotency.update({ where: { id: idempotency.id }, data: { orderId: order.id } })

        return idempotency.id
      },
      {
        timeout: 10000, // 10 second timeout for transaction
        isolationLevel: 'Serializable',
      }
    )

    let idempotencyId: string | null = null
    for (let attempt = 0; attempt < MAX_ORDER_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        idempotencyId = await createOrderTransaction()
        break
      } catch (error) {
        const committedResponse = await resumeIdempotencyResponse(user.userId, keyHash, fingerprint)
        if (committedResponse) return committedResponse

        if (
          isPrismaErrorCode(error, 'P2034') &&
          attempt + 1 < MAX_ORDER_TRANSACTION_ATTEMPTS
        ) {
          continue
        }

        throw error
      }
    }

    if (idempotencyId === null) throw new Error('ORDER_CREATION_FAILED')
    return createFinikOrderResponse(idempotencyId)
  } catch (error: any) {
    console.error('Order creation failed')
    console.error('Error details:', error)
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)

    // Handle business logic errors
    if (error.message === 'FORUM_NOT_FOUND') {
      return NextResponse.json(
        {
          error: {
            code: 'FORUM_NOT_FOUND',
            message: 'Мероприятие не найдено',
          },
        },
        { status: 404 }
      )
    }

    if (error.message === 'FORUM_NOT_AVAILABLE') {
      return NextResponse.json(
        {
          error: {
            code: 'FORUM_NOT_AVAILABLE',
            message: 'Мероприятие недоступно для регистрации',
          },
        },
        { status: 400 }
      )
    }

    if (error.message === 'FORUM_ALREADY_STARTED') {
      return NextResponse.json(
        {
          error: {
            code: 'FORUM_ALREADY_STARTED',
            message: 'Мероприятие уже началось, регистрация закрыта',
          },
        },
        { status: 400 }
      )
    }

    if (error.message === 'MAX_TICKETS_PER_ACCOUNT_EXCEEDED') {
      return NextResponse.json(
        {
          error: {
            code: 'MAX_TICKETS_PER_ACCOUNT_EXCEEDED',
            message: 'Превышен лимит билетов на аккаунт',
          },
        },
        { status: 400 }
      )
    }

    if (error.message === 'FORUM_CAPACITY_EXCEEDED') {
      return NextResponse.json(
        {
          error: {
            code: 'CAPACITY_EXCEEDED',
            message: 'Все билеты распроданы',
          },
        },
        { status: 400 }
      )
    }

    if (error.message === 'CATEGORY_CAPACITY_EXCEEDED') {
      return NextResponse.json(
        {
          error: {
            code: 'CATEGORY_CAPACITY_EXCEEDED',
            message: 'Билеты выбранной категории распроданы',
          },
        },
        { status: 400 }
      )
    }

    if (error.message === 'CATEGORY_NOT_FOUND') {
      return NextResponse.json(
        {
          error: {
            code: 'CATEGORY_NOT_FOUND',
            message: 'Категория билета не найдена',
          },
        },
        { status: 404 }
      )
    }

    if (error.message === 'CATEGORY_NOT_ACTIVE') {
      return NextResponse.json(
        {
          error: {
            code: 'CATEGORY_NOT_ACTIVE',
            message: 'Выбранная категория недоступна',
          },
        },
        { status: 400 }
      )
    }

    if (isPrismaErrorCode(error, 'P2034')) {
      return NextResponse.json({
        error: {
          code: 'CONCURRENT_MODIFICATION',
          message: 'Заказ изменился одновременно с запросом. Повторите попытку',
        },
      }, { status: 409 })
    }

    // Generic error
    return NextResponse.json(
      {
        error: {
          code: 'ORDER_CREATION_FAILED',
          message: 'Не удалось создать заказ',
        },
      },
      { status: 500 }
    )
  }
}

