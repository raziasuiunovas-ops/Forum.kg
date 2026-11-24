/**
 * GET /api/v1/admin/users/[id]
 * Get detailed user information (Manager+)
 * 
 * PATCH /api/v1/admin/users/[id]
 * Update user profile, role, or status (Manager+)
 * 
 * Security:
 * - Cannot change own role (self-demotion prevention)
 * - SUPER_ADMIN role promotion requires SUPER_ADMIN permission
 * - All changes logged to audit trail
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireManager, extractUuid } from '@/lib/auth/middleware'
import { adminUserUpdateSchema } from '@/lib/api/schemas/user'
import { UserRole } from '@prisma/client'

/**
 * GET - Get detailed user information
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireManager(request)
  if ('headers' in authResult) return authResult

  try {
    // Await params in Next.js 15
    const resolvedParams = await params
    
    // Validate and extract user ID
    const userId = extractUuid(resolvedParams, 'id')
    if (userId instanceof NextResponse) return userId

    // Fetch user with detailed information
    const user = await prisma.user.findUnique({
      where: { id: userId },
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
        authIdentities: {
          select: {
            id: true,
            provider: true,
            providerEmail: true,
            linkedAt: true,
          },
        },
        sessions: {
          select: {
            id: true,
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
            ipAddress: true,
            userAgent: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10, // Last 10 sessions
        },
        _count: {
          select: {
            sessions: true,
            orders: true,
            purchasedTickets: true,
            authoredTopics: true,
            authoredPosts: true,
            eventRegistrations: true,
            createdForums: true,
            performedCheckIns: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'Пользователь не найден',
          },
        },
        { status: 404 }
      )
    }

    // Get order statistics
    const orderStats = await prisma.order.groupBy({
      by: ['status'],
      where: { userId },
      _count: { id: true },
      _sum: { totalMinor: true },
    })

    // Get last activity timestamp
    const lastSession = await prisma.session.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })

    // Format response
    const response = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      phoneVerified: !!user.phoneVerifiedAt,
      phoneVerifiedAt: user.phoneVerifiedAt?.toISOString() || null,
      email: user.email,
      role: user.role,
      status: user.status,
      preferredLocale: user.preferredLocale,
      announcementsPushEnabled: user.announcementsPushEnabled,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      lastActivityAt: lastSession?.createdAt.toISOString() || null,
      authIdentities: user.authIdentities.map((identity) => ({
        id: identity.id,
        provider: identity.provider,
        providerEmail: identity.providerEmail,
        linkedAt: identity.linkedAt.toISOString(),
      })),
      sessions: user.sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        revokedAt: session.revokedAt?.toISOString() || null,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })),
      stats: {
        totalSessions: user._count.sessions,
        totalOrders: user._count.orders,
        totalTickets: user._count.purchasedTickets,
        totalTopics: user._count.authoredTopics,
        totalPosts: user._count.authoredPosts,
        totalEventRegistrations: user._count.eventRegistrations,
        totalForumsCreated: user._count.createdForums,
        totalCheckInsPerformed: user._count.performedCheckIns,
        ordersByStatus: orderStats.reduce((acc, stat) => {
          acc[stat.status] = {
            count: stat._count.id,
            totalMinor: stat._sum.totalMinor || 0,
          }
          return acc
        }, {} as Record<string, { count: number; totalMinor: number }>),
      },
    }

    return NextResponse.json({ data: response }, { status: 200 })
  } catch (error) {
    console.error('[Admin User Details] Error:', error)

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

/**
 * PATCH - Update user profile, role, or status
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireManager(request)
  if ('headers' in authResult) return authResult

  const { user: currentUser } = authResult

  try {
    // Await params in Next.js 15
    const resolvedParams = await params
    
    // Validate and extract user ID
    const userId = extractUuid(resolvedParams, 'id')
    if (userId instanceof NextResponse) return userId

    // Parse and validate request body
    const body = await request.json()
    const validation = adminUserUpdateSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Ошибка валидации данных',
            details: validation.error.format(),
          },
        },
        { status: 422 }
      )
    }

    const updateData = validation.data

    // Fetch target user
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, email: true },
    })

    if (!targetUser) {
      return NextResponse.json(
        {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'Пользователь не найден',
          },
        },
        { status: 404 }
      )
    }

    // Security check: Prevent self-demotion
    if (userId === currentUser.userId && updateData.role && updateData.role !== targetUser.role) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Невозможно изменить собственную роль',
          },
        },
        { status: 403 }
      )
    }

    // Security check: Only SUPER_ADMIN can promote to SUPER_ADMIN
    if (
      updateData.role === UserRole.SUPER_ADMIN &&
      currentUser.role !== UserRole.SUPER_ADMIN
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Только SUPER_ADMIN может назначать роль SUPER_ADMIN',
          },
        },
        { status: 403 }
      )
    }

    // Track changes for audit log
    const changes: Record<string, { old: any; new: any }> = {}

    if (updateData.role && updateData.role !== targetUser.role) {
      changes.role = { old: targetUser.role, new: updateData.role }
    }

    if (updateData.status && updateData.status !== targetUser.status) {
      changes.status = { old: targetUser.status, new: updateData.status }
    }

    if (updateData.email && updateData.email !== targetUser.email) {
      changes.email = { old: targetUser.email, new: updateData.email }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        role: true,
        status: true,
        preferredLocale: true,
        announcementsPushEnabled: true,
        updatedAt: true,
      },
    })

    // Write audit log
    await prisma.auditLog.create({
      data: {
        actorId: currentUser.userId,
        action: 'USER_UPDATED',
        targetType: 'User',
        targetId: userId,
        metadata: {
          changes,
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      },
    })

    return NextResponse.json(
      {
        data: {
          id: updatedUser.id,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          phone: updatedUser.phone,
          email: updatedUser.email,
          role: updatedUser.role,
          status: updatedUser.status,
          preferredLocale: updatedUser.preferredLocale,
          announcementsPushEnabled: updatedUser.announcementsPushEnabled,
          updatedAt: updatedUser.updatedAt.toISOString(),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[Admin User Update] Error:', error)

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
