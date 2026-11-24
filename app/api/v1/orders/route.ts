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

// Order reservation timeout (10 minutes)
const RESERVATION_TIMEOUT_MS = 10 * 60 * 1000
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
      message: 'Idempotency-Key СѓР¶Рµ РёСЃРїРѕР»СЊР·РѕРІР°РЅ СЃ РґСЂСѓРіРёРј Р·Р°РїСЂРѕСЃРѕРј',
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
      error: { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE', message: 'Р РµР·СѓР»СЊС‚Р°С‚ Р·Р°РїСЂРѕСЃР° РµС‰С‘ РѕР±СЂР°Р±Р°С‚С‹РІР°РµС‚СЃСЏ. РџРѕРІС‚РѕСЂРёС‚Рµ Р·Р°РїСЂРѕСЃ РїРѕР·Р¶Рµ' },
    }, { status: 503, headers: { 'Retry-After': '1' } })
  }
  return createFinikOrderResponse(saved.id)
}

async function createFinikOrderResponse(idempotencyId: string): Promise<NextResponse> {
  const idempotency = await prisma.orderIdempotency.findUnique({ where: { id: idempotencyId } })
  if (!idempotency?.orderId) {
    return NextResponse.json({
      error: { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE', message: 'Р РµР·СѓР»СЊС‚Р°С‚ Р·Р°РїСЂРѕСЃР° РµС‰С‘ РѕР±СЂР°Р±Р°С‚С‹РІР°РµС‚СЃСЏ. РџРѕРІС‚РѕСЂРёС‚Рµ Р·Р°РїСЂРѕСЃ РїРѕР·Р¶Рµ' },
    }, { status: 503, headers: { 'Retry-After': '1' } })
  }
  if (idempotency.status === OrderIdempotencyStatus.COMPLETED && idempotency.responseStatus !== null && idempotency.response !== null) {
    return NextResponse.json(idempotency.response, { status: idempotency.responseStatus })
  }

  const [order, payment] = await Promise.all([
    prisma.Order.findUnique({
      where: { id: idempotency.orderId },
      include: {
        items: { include: { TicketCategory: { include: { translations: true } } } },
        Forum: { include: { translations: true } },
      },
    }),
    prisma.Payment.findFirst({
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
    const body = { error: { code: 'ORDER_RESERVATION_EXPIRED', message: 'РЎСЂРѕРє СЂРµР·РµСЂРІР°С†РёРё Р·Р°РєР°Р·Р° РёСЃС‚С‘Рє' } }
    await prisma.$transaction(async (tx) => {
      await tx.Order.updateMany({
        where: {
          id: order.id,
          status: OrderStatus.PENDING_PAYMENT,
          OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
        },
        data: { status: OrderStatus.EXPIRED },
      })
      await tx.Payment.updateMany({ where: { id: payment.id, status: { in: [PaymentStatus.CREATED, PaymentStatus.PROCESSING] } }, data: { status: PaymentStatus.EXPIRED } })
      await tx.orderIdempotency.update({
        where: { id: idempotency.id },
        data: { status: OrderIdempotencyStatus.COMPLETED, responseStatus: 410, response: body as Prisma.InputJsonValue },
      })
    })
    return NextResponse.json(body, { status: 410 })
  }
  const finikEndDate = order.reservedUntil ?? new Date(now.getTime() + RESERVATION_TIMEOUT_MS)

  const leaseExpiredAt = new Date(now.getTime() - FINIK_REQUEST_LEASE_MS)
  const claim = alreadyPaid ? { count: 1 } : await prisma.Payment.updateMany({
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
      error: { code: 'PAYMENT_INITIALIZATION_IN_PROGRESS', message: 'РџР»Р°С‚С‘Р¶ СЃРѕР·РґР°С‘С‚СЃСЏ. РџРѕРІС‚РѕСЂРёС‚Рµ Р·Р°РїСЂРѕСЃ РїРѕР·Р¶Рµ' },
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
      Order: {
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
          categoryName: item.TicketCategory.translations[0]?.name || item.TicketCategory.code,
        })),
        Forum: {
          id: order.Forum.id,
          slug: order.Forum.slug,
          title: order.Forum.translations[0]?.title || 'Untitled',
          startsAt: order.Forum.startsAt.toISOString(),
        },
      },
      paymentUrl,
    }

    const savedResponse = await prisma.$transaction(async (tx) => {
      const current = await tx.orderIdempotency.findUnique({ where: { id: idempotency.id } })
      if (current?.status === OrderIdempotencyStatus.COMPLETED && current.responseStatus !== null && current.response !== null) {
        return { body: current.response as Prisma.InputJsonValue, status: current.responseStatus }
      }
      await tx.Payment.updateMany({
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
  } catch {
    await prisma.Payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PROCESSING },
      data: { status: PaymentStatus.CREATED },
    }).catch(() => undefined)
    return NextResponse.json({
      error: { code: 'FINIK_PAYMENT_UNAVAILABLE', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РїР»Р°С‚С‘Р¶. РџРѕРІС‚РѕСЂРёС‚Рµ Р·Р°РїСЂРѕСЃ РїРѕР·Р¶Рµ' },
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

    const user = authResult.User

    const idempotencyKey = request.headers.get('idempotency-key')
    if (idempotencyKey === null) {
      return NextResponse.json({
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'РўСЂРµР±СѓРµС‚СЃСЏ Р·Р°РіРѕР»РѕРІРѕРє Idempotency-Key',
        },
      }, { status: 400 })
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return NextResponse.json({
        error: {
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency-Key РґРѕР»Р¶РµРЅ СЃРѕРґРµСЂР¶Р°С‚СЊ РѕС‚ 1 РґРѕ 255 РїРµС‡Р°С‚РЅС‹С… ASCII-СЃРёРјРІРѕР»РѕРІ',
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
            message: 'РћС€РёР±РєР° РІР°Р»РёРґР°С†РёРё РґР°РЅРЅС‹С… Р·Р°РєР°Р·Р°',
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
    const { randomUUID } = await import('node:crypto')
    const createOrderTransaction = () => prisma.$transaction(
      async (tx) => {
        const idempotency = await tx.orderIdempotency.create({
          data: {
            userId: user.userId,
            keyHash,
            fingerprint,
            status: OrderIdempotencyStatus.PROCESSING,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          select: { id: true },
        })

        // 1. Get forum with FOR UPDATE lock to prevent race conditions
        const forum = await tx.Forum.findUnique({
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
          tx.Ticket.count({
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
              Order: {
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
          tx.Ticket.count({
            where: {
              forumId: forum.id,
              status: 'ACTIVE',
            },
          }),
          tx.orderItem.count({
            where: {
              Order: {
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
                  { Ticket: { isNot: null } },
                  // Active reservations
                  {
                    Order: {
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

        const order = await tx.Order.create({
          data: {
            id: randomUUID(),
            orderNumber,
            userId: user.userId,
            forumId: forum.id,
            status: OrderStatus.PENDING_PAYMENT,
            subtotalMinor,
            totalMinor,
            currency: 'KGS',
            reservedUntil,
            createdAt: new Date(),
            updatedAt: new Date(),
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
                TicketCategory: {
                  include: {
                    translations: true,
                  },
                },
              },
            },
            Forum: {
              include: {
                translations: true,
              },
            },
          },
        })

        // 6. Create payment record (CREATED status)
        const payment = await tx.Payment.create({
          data: {
            id: randomUUID(),
            orderId: order.id,
            provider: 'FINIK',
            status: PaymentStatus.CREATED,
            amountMinor: totalMinor,
            currency: 'KGS',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        })

        // Persist the order and stable provider ID before calling Finik. The external
        // request must stay outside this retried Serializable transaction.
        await tx.Payment.update({
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

    // Handle business logic errors
    if (error.message === 'FORUM_NOT_FOUND') {
      return NextResponse.json(
        {
          error: {
            code: 'FORUM_NOT_FOUND',
            message: 'РњРµСЂРѕРїСЂРёСЏС‚РёРµ РЅРµ РЅР°Р№РґРµРЅРѕ',
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
            message: 'РњРµСЂРѕРїСЂРёСЏС‚РёРµ РЅРµРґРѕСЃС‚СѓРїРЅРѕ РґР»СЏ СЂРµРіРёСЃС‚СЂР°С†РёРё',
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
            message: 'РњРµСЂРѕРїСЂРёСЏС‚РёРµ СѓР¶Рµ РЅР°С‡Р°Р»РѕСЃСЊ, СЂРµРіРёСЃС‚СЂР°С†РёСЏ Р·Р°РєСЂС‹С‚Р°',
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
            message: 'РџСЂРµРІС‹С€РµРЅ Р»РёРјРёС‚ Р±РёР»РµС‚РѕРІ РЅР° Р°РєРєР°СѓРЅС‚',
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
            message: 'Р’СЃРµ Р±РёР»РµС‚С‹ СЂР°СЃРїСЂРѕРґР°РЅС‹',
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
            message: 'Р‘РёР»РµС‚С‹ РІС‹Р±СЂР°РЅРЅРѕР№ РєР°С‚РµРіРѕСЂРёРё СЂР°СЃРїСЂРѕРґР°РЅС‹',
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
            message: 'РљР°С‚РµРіРѕСЂРёСЏ Р±РёР»РµС‚Р° РЅРµ РЅР°Р№РґРµРЅР°',
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
            message: 'Р’С‹Р±СЂР°РЅРЅР°СЏ РєР°С‚РµРіРѕСЂРёСЏ РЅРµРґРѕСЃС‚СѓРїРЅР°',
          },
        },
        { status: 400 }
      )
    }

    if (isPrismaErrorCode(error, 'P2034')) {
      return NextResponse.json({
        error: {
          code: 'CONCURRENT_MODIFICATION',
          message: 'Р—Р°РєР°Р· РёР·РјРµРЅРёР»СЃСЏ РѕРґРЅРѕРІСЂРµРјРµРЅРЅРѕ СЃ Р·Р°РїСЂРѕСЃРѕРј. РџРѕРІС‚РѕСЂРёС‚Рµ РїРѕРїС‹С‚РєСѓ',
        },
      }, { status: 409 })
    }

    // Generic error
    return NextResponse.json(
      {
        error: {
          code: 'ORDER_CREATION_FAILED',
          message: 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ Р·Р°РєР°Р·',
        },
      },
      { status: 500 }
    )
  }
}

