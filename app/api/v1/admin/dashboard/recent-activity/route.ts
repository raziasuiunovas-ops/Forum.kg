/**
 * GET /api/v1/admin/dashboard/recent-activity
 * Get recent activity across the platform (SUPER_ADMIN only)
 * 
 * Query params:
 * - limit: number (default: 20, max: 100) - number of activities to return
 * 
 * Returns array of recent activities:
 * - USER_REGISTERED
 * - ORDER_CREATED
 * - ORDER_COMPLETED
 * - TOPIC_CREATED
 * - EVENT_REGISTRATION
 * - PAYMENT_COMPLETED
 * - FORUM_CREATED
 * 
 * Each activity includes: id, type, description, timestamp, metadata
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/auth/middleware'
import { parseRecentActivityQuery } from '@/lib/api/schemas/dashboard'
import type { ActivityItem, ActivityType } from '@/lib/api/schemas/dashboard'
import { OrderStatus, PaymentStatus } from '@prisma/client'

/**
 * GET - Recent activity
 */
export async function GET(request: NextRequest) {
  const authResult = await requireSuperAdmin(request)
  if ('headers' in authResult) return authResult

  try {
    const { searchParams } = new URL(request.url)
    const validation = parseRecentActivityQuery(searchParams)

    const { limit } = validation

    // Fetch recent data from multiple sources in parallel
    const [
      recentUsers,
      recentOrders,
      recentTopics,
      recentRegistrations,
      recentPayments,
      recentForums,
    ] = await prisma.$transaction([
      // Recent user registrations
      prisma.user.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      
      // Recent orders
      prisma.order.findMany({
        select: {
          id: true,
          status: true,
          totalMinor: true,
          createdAt: true,
          paidAt: true,
          User: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      
      // Recent topics
      prisma.topic.findMany({
        select: {
          id: true,
          title: true,
          createdAt: true,
          User: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          TopicCategory: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      
      // Recent event registrations
      prisma.eventRegistration.findMany({
        select: {
          id: true,
          createdAt: true,
          attendeeFirstName: true,
          attendeeLastName: true,
          Forum: {
            select: {
              id: true,
              ForumTranslation: {
                where: { locale: 'RU' },
                select: { title: true },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      
      // Recent successful payments
      prisma.payment.findMany({
        select: {
          id: true,
          amountMinor: true,
          status: true,
          createdAt: true,
          Order: {
            select: {
              User: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        where: {
          status: PaymentStatus.SUCCEEDED,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      
      // Recent forums
      prisma.forum.findMany({
        select: {
          id: true,
          slug: true,
          createdAt: true,
          User: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          ForumTranslation: {
            where: { locale: 'RU' },
            select: { title: true },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.floor(limit / 6), // Less forums as they're created rarely
      }),
    ])

    // Combine all activities into a single array
    const activities: ActivityItem[] = []

    // User registrations
    recentUsers.forEach((user) => {
      activities.push({
        id: user.id,
        type: 'USER_REGISTERED' as ActivityType,
        description: `Новый пользователь: ${user.firstName} ${user.lastName || ''}`.trim(),
        timestamp: user.createdAt.toISOString(),
        metadata: {
          userId: user.id,
          phone: user.phone,
        },
      })
    })

    // Orders
    recentOrders.forEach((order) => {
      const userName = `${order.User.firstName} ${order.User.lastName || ''}`.trim()
      const amount = (order.totalMinor / 100).toFixed(2)
      
      if (order.status === OrderStatus.PAID && order.paidAt) {
        activities.push({
          id: order.id,
          type: 'ORDER_COMPLETED' as ActivityType,
          description: `Заказ завершён: ${userName} - ${amount} KGS`,
          timestamp: order.paidAt.toISOString(),
          metadata: {
            orderId: order.id,
            userId: order.User,
            amountMinor: order.totalMinor,
          },
        })
      } else {
        activities.push({
          id: order.id,
          type: 'ORDER_CREATED' as ActivityType,
          description: `Новый заказ: ${userName} - ${amount} KGS`,
          timestamp: order.createdAt.toISOString(),
          metadata: {
            orderId: order.id,
            status: order.status,
            amountMinor: order.totalMinor,
          },
        })
      }
    })

    // Topics
    recentTopics.forEach((topic) => {
      const authorName = `${topic.User.firstName} ${topic.User.lastName || ''}`.trim()
      activities.push({
        id: topic.id,
        type: 'TOPIC_CREATED' as ActivityType,
        description: `Новая тема: "${topic.title}" от ${authorName}`,
        timestamp: topic.createdAt.toISOString(),
        metadata: {
          topicId: topic.id,
          categoryName: topic.TopicCategory.name,
        },
      })
    })

    // Event registrations
    recentRegistrations.forEach((reg) => {
      const userName = `${reg.attendeeFirstName} ${reg.attendeeLastName}`.trim()
      const eventTitle = reg.Forum.ForumTranslation[0]?.title || 'Мероприятие'
      activities.push({
        id: reg.id,
        type: 'EVENT_REGISTRATION' as ActivityType,
        description: `Регистрация на событие: ${userName} → ${eventTitle}`,
        timestamp: reg.createdAt.toISOString(),
        metadata: {
          registrationId: reg.id,
          forumId: reg.Forum.id,
        },
      })
    })

    // Payments
    recentPayments.forEach((payment) => {
      const userName = payment.Order?.User 
        ? `${payment.Order.User.firstName} ${payment.Order.User.lastName || ''}`.trim()
        : 'Пользователь'
      const amount = (payment.amountMinor / 100).toFixed(2)
      activities.push({
        id: payment.id,
        type: 'PAYMENT_COMPLETED' as ActivityType,
        description: `Платёж успешно завершён: ${userName} - ${amount} KGS`,
        timestamp: payment.createdAt.toISOString(),
        metadata: {
          paymentId: payment.id,
          amountMinor: payment.amountMinor,
        },
      })
    })

    // Forums
    recentForums.forEach((forum) => {
      const creatorName = `${forum.User.firstName} ${forum.User.lastName || ''}`.trim()
      const forumTitle = forum.ForumTranslation[0]?.title || forum.slug
      activities.push({
        id: forum.id,
        type: 'FORUM_CREATED' as ActivityType,
        description: `Новый форум создан: "${forumTitle}" создал ${creatorName}`,
        timestamp: forum.createdAt.toISOString(),
        metadata: {
          forumId: forum.id,
          slug: forum.slug,
        },
      })
    })

    // Sort all activities by timestamp descending and take limit
    const sortedActivities = activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)

    return NextResponse.json(
      {
        data: {
          activities: sortedActivities,
          total: sortedActivities.length,
        },
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('[Admin Dashboard Recent Activity] Error:', error)

    // Check if it's a validation error
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Ошибка валидации параметров запроса',
            details: error.message,
          },
        },
        { status: 422 }
      )
    }

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Внутренняя ошибка сервера',
        },
      },
      { status: 500 }
    )
  }
}
