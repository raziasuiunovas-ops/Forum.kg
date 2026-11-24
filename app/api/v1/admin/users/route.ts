/**
 * GET /api/v1/admin/users
 * List all users with filtering, search, pagination (Manager+)
 * 
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 * - role: UserRole (optional) - filter by role
 * - status: UserStatus (optional) - filter by status
 * - search: string (optional) - search by name, phone, email
 * - sortBy: 'createdAt' | 'updatedAt' | 'firstName' | 'lastName' | 'role' (default: 'createdAt')
 * - sortOrder: 'asc' | 'desc' (default: 'desc')
 * 
 * Returns:
 * - Paginated list of users with basic info
 * - Each user includes: id, firstName, lastName, phone, email, role, status, createdAt, updatedAt
 * - Includes session count and last activity timestamp
 * - Total count and pagination metadata
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireManager } from '@/lib/auth/middleware'
import { parseAdminUserQuery } from '@/lib/api/schemas/user'
import { Prisma } from '@prisma/client'
import { calculatePagination } from '@/lib/api/schemas/common'

/**
 * GET - List all users with filtering and pagination
 */
export async function GET(request: NextRequest) {
  const authResult = await requireManager(request)
  if ('headers' in authResult) return authResult

  try {
    const { searchParams } = new URL(request.url)
    
    // Parse and validate query parameters
    let queryParams
    try {
      queryParams = parseAdminUserQuery(searchParams)
    } catch (error) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Ошибка валидации параметров запроса',
            details: error instanceof Error ? error.message : 'Invalid query parameters',
          },
        },
        { status: 422 }
      )
    }

    const { page, limit, role, status, search, sortBy, sortOrder } = queryParams
    const skip = (page - 1) * limit

    // Build where clause
    const where: Prisma.UserWhereInput = {}

    if (role) {
      where.role = role
    }

    if (status) {
      where.status = status
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Build orderBy clause
    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    }

    // Fetch users and total count in parallel
    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          phoneVerifiedAt: true,
          email: true,
          role: true,
          status: true,
          preferredLocale: true,
          announcementsPushEnabled: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              Session: true,
              Order: true,
              Ticket: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ])

    // Enrich user data with last activity
    const userIds = users.map((u) => u.id)
    
    const lastActivities = await prisma.session.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
      },
      _max: {
        createdAt: true,
      },
      orderBy: {
        userId: 'asc',
      },
    })

    // Create a map for quick lookup
    const lastActivityMap = new Map(
      lastActivities.map((la) => [la.userId, la._max.createdAt])
    )

    // Combine user data with last activity
    const enrichedUsers = users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      phoneVerified: !!user.phoneVerifiedAt,
      email: user.email,
      role: user.role,
      status: user.status,
      preferredLocale: user.preferredLocale,
      announcementsPushEnabled: user.announcementsPushEnabled,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      sessionCount: user._count.Session,
      orderCount: user._count.Order,
      ticketCount: user._count.Ticket,
      lastActivityAt: lastActivityMap.get(user.id)?.toISOString() || null,
    }))

    const pagination = calculatePagination(page, limit, total)

    return NextResponse.json(
      {
        data: {
          users: enrichedUsers,
          pagination,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[Admin Users List] Error:', error)

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
