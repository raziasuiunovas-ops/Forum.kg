/**
 * GET /api/v1/admin/data
 * Returns all real data for the admin panel in AdminState format.
 * Replaces the localStorage/mock demo store.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('headers' in authResult) return authResult
  
  const { user } = authResult
  
  // Check if user has admin/staff role
  const ADMIN_ROLES = ['SUPER_ADMIN', 'MANAGER', 'SCANNER']
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Доступ запрещен' } },
      { status: 403 }
    )
  }

  try {
    const [
      forums,
      orders,
      payments,
      tickets,
      users,
      cancellations,
    ] = await Promise.all([
      // Forums with translations and categories
      prisma.forum.findMany({
        include: {
          translations: true,
          categories: { include: { translations: true } },
          tickets: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // Orders with items and user
      prisma.order.findMany({
        include: {
          user: { select: { firstName: true, lastName: true, email: true, phone: true } },
          items: {
            include: {
              ticketCategory: { include: { translations: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),

      // Payments
      prisma.payment.findMany({
        where: { status: { in: ['SUCCEEDED', 'PENDING', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
        include: {
          order: {
            select: {
              orderNumber: true,
              forumId: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),

      // Tickets
      prisma.ticket.findMany({
        include: {
          buyer: { select: { firstName: true, lastName: true } },
          orderItem: {
            include: {
              ticketCategory: { include: { translations: true } },
            },
          },
          checkIn: true,
        },
        orderBy: { issuedAt: 'desc' },
        take: 1000,
      }),

      // Users with counts
      prisma.user.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          status: true,
          createdAt: true,
          _count: { select: { orders: true, purchasedTickets: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),

      // Cancellation requests
      prisma.cancellationRequest.findMany({
        include: {
          order: {
            select: {
              orderNumber: true,
              forumId: true,
              totalMinor: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
          ticket: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // Map forums
    const adminForums = forums.map((f) => {
      const ru = f.translations.find((t) => t.locale === 'RU')
      const ky = f.translations.find((t) => t.locale === 'KY')
      const en = f.translations.find((t) => t.locale === 'EN')
      const sold = f.tickets.filter((t) => t.status === 'ACTIVE' || t.status === 'USED').length
      const checkedIn = f.tickets.filter((t) => t.status === 'USED').length
      return {
        id: f.id,
        slug: f.slug,
        status: f.status,
        title: { ru: ru?.title ?? '', ky: ky?.title ?? ru?.title ?? '', en: en?.title ?? ru?.title ?? '' },
        shortDescription: { ru: ru?.shortDescription ?? '', ky: ky?.shortDescription ?? '', en: en?.shortDescription ?? '' },
        description: { ru: ru?.description ?? '', ky: ky?.description ?? '', en: en?.description ?? '' },
        program: { ru: ru?.program ?? '', ky: ky?.program ?? '', en: en?.program ?? '' },
        bannerUrl: f.bannerUrl ?? '',
        startsAt: f.startsAt.toISOString(),
        endsAt: f.endsAt?.toISOString() ?? null,
        venueName: f.venueName ?? '',
        venueAddress: f.venueAddress ?? '',
        capacity: f.capacity,
        maxTicketsPerAccount: f.maxTicketsPerAccount,
        qrExpiresAt: f.qrExpiresAt.toISOString(),
        publishAt: f.publishAt?.toISOString() ?? null,
        categories: f.categories.map((c) => ({
          code: c.code,
          priceMinor: c.priceMinor,
          capacity: c.capacity ?? null,
        })),
        sold,
        checkedIn,
      }
    })

    // Map orders
    const adminOrders = orders.map((o) => {
      const name = [o.user.firstName, o.user.lastName].filter(Boolean).join(' ') || o.user.email || o.user.phone || 'Неизвестно'
      return {
        id: o.id,
        number: o.orderNumber,
        userName: name,
        forumId: o.forumId,
        items: o.items.map((i) => ({
          participant: [i.participantFirstName, i.participantLastName].filter(Boolean).join(' '),
          category: i.ticketCategory.translations[0]?.name ?? i.ticketCategory.code,
          priceMinor: i.unitPriceMinor,
        })),
        totalMinor: o.totalMinor,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
      }
    })

    // Map payments
    const mapPaymentStatus = (s: string): string => {
      if (s === 'SUCCEEDED') return 'PAID'
      if (s === 'REFUND_PENDING' || s === 'PARTIALLY_REFUNDED') return 'REFUND_PENDING'
      if (s === 'REFUNDED') return 'REFUNDED'
      if (s === 'FAILED') return 'FAILED'
      return 'PENDING'
    }

    const adminPayments = payments.map((p) => {
      const name = p.order
        ? [p.order.user.firstName, p.order.user.lastName].filter(Boolean).join(' ') || 'Неизвестно'
        : 'Неизвестно'
      return {
        id: p.id,
        orderNumber: p.order?.orderNumber ?? '',
        userName: name,
        forumId: p.order?.forumId ?? '',
        amountMinor: p.amountMinor,
        status: mapPaymentStatus(p.status),
        providerRef: p.providerPaymentId ?? '',
        paidAt: (p.paidAt ?? p.createdAt).toISOString(),
      }
    })

    // Map tickets
    const adminTickets = tickets.map((t) => {
      const buyerName = [t.buyer.firstName, t.buyer.lastName].filter(Boolean).join(' ') || 'Неизвестно'
      const participant = [t.orderItem.participantFirstName, t.orderItem.participantLastName].filter(Boolean).join(' ')
      const category = t.orderItem.ticketCategory.translations[0]?.name ?? t.orderItem.ticketCategory.code
      return {
        id: t.id,
        number: t.ticketNumber,
        forumId: t.forumId,
        participant,
        buyerName,
        category,
        status: t.status,
        issuedAt: t.issuedAt.toISOString(),
        checkedInAt: t.checkIn?.checkedInAt?.toISOString() ?? null,
      }
    })

    // Map users (with spent amount from payments)
    const userIds = users.map((u) => u.id)
    const spentByUser = await prisma.payment.groupBy({
      by: ['orderId'],
      where: { status: 'SUCCEEDED' },
      _sum: { amountMinor: true },
    })
    // Build map orderId -> userId
    const orderUserMap = new Map(orders.map((o) => [o.id, o.userId]))
    const spentMap = new Map<string, number>()
    for (const s of spentByUser) {
      const userId = orderUserMap.get(s.orderId)
      if (userId) {
        spentMap.set(userId, (spentMap.get(userId) ?? 0) + (s._sum.amountMinor ?? 0))
      }
    }

    const adminUsers = users.map((u) => {
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.phone || 'Неизвестно'
      return {
        id: u.id,
        name,
        phone: u.phone ?? '',
        email: u.email ?? null,
        registeredAt: u.createdAt.toISOString(),
        status: u.status,
        orders: u._count.orders,
        tickets: u._count.purchasedTickets,
        spentMinor: spentMap.get(u.id) ?? 0,
      }
    })

    // Map cancellations
    const adminCancellations = cancellations.map((c) => {
      const name = c.order
        ? [c.order.user.firstName, c.order.user.lastName].filter(Boolean).join(' ') || 'Неизвестно'
        : 'Неизвестно'
      return {
        id: c.id,
        orderNumber: c.order?.orderNumber ?? '',
        userName: name,
        forumId: c.order?.forumId ?? '',
        ticketCount: c.ticket ? 1 : (orders.find((o) => o.orderNumber === c.order?.orderNumber)?.items.length ?? 0),
        amountMinor: c.order?.totalMinor ?? 0,
        reason: c.reason ?? '',
        createdAt: c.createdAt.toISOString(),
        status: c.status,
        ticketsInvalidated: false, // not in DB schema yet
        refund: 'NONE' as string,
        adminNote: c.adminNote ?? undefined,
      }
    })

    return NextResponse.json({
      forums: adminForums,
      orders: adminOrders,
      payments: adminPayments,
      tickets: adminTickets,
      users: adminUsers,
      cancellations: adminCancellations,
    })
  } catch (error) {
    console.error('[Admin Data] Error:', error)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Ошибка загрузки данных' } }, { status: 500 })
  }
}
