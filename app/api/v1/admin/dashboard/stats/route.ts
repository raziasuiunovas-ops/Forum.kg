/**
 * GET /api/v1/admin/dashboard/stats
 * Get comprehensive dashboard statistics (SUPER_ADMIN only)
 * 
 * Query params:
 * - startDate: ISO date (optional) - filter time-based stats from this date
 * - endDate: ISO date (optional) - filter time-based stats to this date
 * 
 * Returns:
 * - users: total, active (logged in last 30 days), new in period
 * - forums: total, active (not archived)
 * - events: total, upcoming, total registrations
 * - orders: total, pending, completed, cancelled, revenue
 * - payments: total amount, successful, failed, pending
 * - topics: total, new in period
 * - system: db status, last sync timestamp
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/auth/middleware'
import { parseDashboardStatsQuery } from '@/lib/api/schemas/dashboard'
import { OrderStatus, PaymentStatus, ForumStatus } from '@prisma/client'

/**
 * GET - Dashboard statistics
 */
export async function GET(request: NextRequest) {
  const authResult = await requireSuperAdmin(request)
  if ('headers' in authResult) return authResult

  try {
    const { searchParams } = new URL(request.url)
    const validation = parseDashboardStatsQuery(searchParams)

    const { startDate, endDate } = validation

    // Build date filters
    const dateFilter = startDate && endDate ? {
      gte: startDate,
      lte: endDate,
    } : startDate ? {
      gte: startDate,
    } : endDate ? {
      lte: endDate,
    } : undefined

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Execute all stat queries in parallel
    const [
      // Users stats
      totalUsers,
      activeUsersRaw,
      newUsers,
      
      // Forums stats
      totalForums,
      activeForums,
      
      // Events stats (EventRegistration is the registration, forum has event-like data)
      totalForums_forEvents,
      upcomingForums,
      totalRegistrations,
      
      // Orders stats
      totalOrders,
      pendingOrders,
      paidOrders,
      cancelledOrders,
      revenueResult,
      
      // Payments stats
      totalPaymentsAmount,
      successfulPayments,
      failedPayments,
      pendingPayments,
      
      // Topics stats
      totalTopics,
      newTopics,
      
      // DB health check
      dbHealthCheck,
    ] = await prisma.$transaction([
      // Users
      prisma.user.count(),
      // Active users: those with recent sessions (last 30 days)
      prisma.session.groupBy({
        by: ['userId'],
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
        orderBy: {
          userId: 'asc',
        },
      }),
      prisma.user.count({
        where: dateFilter ? {
          createdAt: dateFilter,
        } : undefined,
      }),
      
      // Forums
      prisma.forum.count(),
      prisma.forum.count({
        where: {
          OR: [
            { status: ForumStatus.PUBLISHED },
            { status: ForumStatus.SCHEDULED },
          ],
        },
      }),
      
      // Events - using forums as events (no separate Event model)
      prisma.forum.count(),
      prisma.forum.count({
        where: {
          status: ForumStatus.PUBLISHED,
          startsAt: { gte: now },
        },
      }),
      prisma.eventRegistration.count(),
      
      // Orders
      prisma.order.count({
        where: dateFilter ? {
          createdAt: dateFilter,
        } : undefined,
      }),
      prisma.order.count({
        where: {
          status: OrderStatus.PENDING_PAYMENT,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),
      prisma.order.count({
        where: {
          status: OrderStatus.PAID,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),
      prisma.order.count({
        where: {
          status: OrderStatus.CANCELLED,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),
      prisma.order.aggregate({
        _sum: { totalMinor: true },
        where: {
          status: OrderStatus.PAID,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),
      
      // Payments
      prisma.payment.aggregate({
        _sum: { amountMinor: true },
        where: dateFilter ? {
          createdAt: dateFilter,
        } : undefined,
      }),
      prisma.payment.count({
        where: {
          status: PaymentStatus.SUCCEEDED,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),
      prisma.payment.count({
        where: {
          status: PaymentStatus.FAILED,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),
      prisma.payment.count({
        where: {
          status: PaymentStatus.PENDING,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),
      
      // Topics
      prisma.topic.count(),
      prisma.topic.count({
        where: dateFilter ? {
          createdAt: dateFilter,
        } : undefined,
      }),
      
      // DB Health - simple query to verify connection
      prisma.$queryRaw`SELECT 1 as health`,
    ])

    // Determine DB status
    const dbStatus = dbHealthCheck ? 'healthy' : 'down'
    
    // Calculate unique active users from groupBy result
    const activeUsersWithSessions = activeUsersRaw.length

    const stats = {
      users: {
        total: totalUsers,
        active: activeUsersWithSessions,
        newInPeriod: newUsers,
      },
      forums: {
        total: totalForums,
        active: activeForums,
      },
      events: {
        total: totalForums_forEvents,
        upcoming: upcomingForums,
        totalRegistrations: totalRegistrations,
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        completed: paidOrders,
        cancelled: cancelledOrders,
        revenueMinor: revenueResult._sum.totalMinor || 0,
      },
      payments: {
        totalAmountMinor: totalPaymentsAmount._sum.amountMinor || 0,
        successful: successfulPayments,
        failed: failedPayments,
        pending: pendingPayments,
      },
      topics: {
        total: totalTopics,
        newInPeriod: newTopics,
      },
      system: {
        dbStatus,
        lastSync: new Date().toISOString(),
      },
    }

    return NextResponse.json({ data: stats }, { status: 200 })

  } catch (error) {
    console.error('[Admin Dashboard Stats] Error:', error)

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
