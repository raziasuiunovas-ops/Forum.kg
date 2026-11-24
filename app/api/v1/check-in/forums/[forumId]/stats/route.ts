/**
 * GET /api/v1/check-in/forums/{forumId}/stats
 * Get check-in statistics for forum
 * 
 * SECURITY: Requires SCANNER, MANAGER, or SUPER_ADMIN role
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/auth/middleware'

interface RouteContext {
  params: Promise<{
    forumId: string
  }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // Require SCANNER, MANAGER, or SUPER_ADMIN role
    const authResult = await requireRole(request, ['SCANNER', 'MANAGER', 'SUPER_ADMIN'])
    
    if ('headers' in authResult) {
      return authResult
    }

    const { forumId } = await context.params

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(forumId)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_FORUM_ID',
            message: 'Неверный формат ID мероприятия',
          },
        },
        { status: 400 }
      )
    }

    // Check forum exists
    const forum = await prisma.forum.findUnique({
      where: { id: forumId },
      select: {
        id: true,
        slug: true,
        ForumTranslation: {
          where: { locale: 'RU' },
          select: { title: true },
        },
      },
    })

    if (!forum) {
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

    // Get statistics
    const [totalTickets, checkedInCount, cancelledCount] = await Promise.all([
      // Total issued tickets (excluding cancelled)
      prisma.ticket.count({
        where: {
          forumId,
          status: {
            in: ['ACTIVE', 'USED'],
          },
        },
      }),
      // Checked in tickets
      prisma.checkIn.count({
        where: { forumId },
      }),
      // Cancelled tickets
      prisma.ticket.count({
        where: {
          forumId,
          status: 'CANCELLED',
        },
      }),
    ])

    const pendingCheckIn = totalTickets - checkedInCount
    const checkInRate = totalTickets > 0 ? (checkedInCount / totalTickets) * 100 : 0

    const response = {
      forum: {
        id: forum.id,
        slug: forum.slug,
        title: forum.ForumTranslation[0]?.title || 'Untitled',
      },
      stats: {
        totalTickets,
        checkedIn: checkedInCount,
        pendingCheckIn,
        cancelled: cancelledCount,
        checkInRate: Math.round(checkInRate * 100) / 100, // Round to 2 decimals
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching check-in stats:', error)
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Не удалось получить статистику',
        },
      },
      { status: 500 }
    )
  }
}
