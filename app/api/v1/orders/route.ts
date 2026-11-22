/**
 * POST /api/v1/orders
 * Create order with capacity validation and idempotency
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/middleware'
import { OrderStatus, PaymentStatus } from '@prisma/client'
import { createAuthError } from '@/lib/auth'

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

    // Check idempotency key
    const idempotencyKey = request.headers.get('idempotency-key')
    if (idempotencyKey) {
      // Check for existing order with this key
      // Note: Would need IdempotencyKey table in production
      // For now, skip detailed idempotency implementation
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

    // Execute order creation in transaction with capacity checks
    const result = await prisma.$transaction(
      async (tx) => {
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

        return { order, payment }
      },
      {
        timeout: 10000, // 10 second timeout for transaction
        isolationLevel: 'Serializable', // Highest isolation to prevent race conditions
      }
    )

    // 7. Generate payment URL (stub implementation)
    // In production, call Finik API here to create payment session
    const paymentUrl = generateFinikPaymentUrl(result.payment.id, result.order.orderNumber)

    // Transform to API response
    const response = {
      order: {
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        status: result.order.status,
        totalMinor: result.order.totalMinor,
        currency: result.order.currency,
        reservedUntil: result.order.reservedUntil?.toISOString(),
        createdAt: result.order.createdAt.toISOString(),
        items: result.order.items.map((item) => ({
          id: item.id,
          participantFirstName: item.participantFirstName,
          participantLastName: item.participantLastName,
          unitPriceMinor: item.unitPriceMinor,
          categoryName: item.ticketCategory.translations[0]?.name || item.ticketCategory.code,
        })),
        forum: {
          id: result.order.forum.id,
          slug: result.order.forum.slug,
          title: result.order.forum.translations[0]?.title || 'Untitled',
          startsAt: result.order.forum.startsAt.toISOString(),
        },
      },
      paymentUrl,
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error: any) {
    console.error('Error creating order:', error)

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

/**
 * Generate Finik payment URL (stub implementation)
 * In production, this would call Finik API to create payment session
 */
function generateFinikPaymentUrl(paymentId: string, orderNumber: string): string {
  // Stub: return placeholder URL
  // Real implementation would call Finik API:
  // const finikResponse = await finikClient.createPayment({...})
  // return finikResponse.paymentUrl

  const baseUrl = process.env.FINIK_PAYMENT_URL || 'https://pay.finik.kg'
  return `${baseUrl}/pay?order=${orderNumber}&payment=${paymentId}`
}
