/**
 * GET /api/v1/auth/session
 * Get current session information
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentSession, createAuthError } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Get current session from cookie
    const session = await getCurrentSession()

    if (!session) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Требуется авторизация',
          },
        },
        { status: 401 }
      )
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
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
      },
    })

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_TOKEN',
            message: 'Пользователь не найден',
          },
        },
        { status: 401 }
      )
    }

    // Check if user is suspended
    if (user.status === 'SUSPENDED') {
      return NextResponse.json(
        {
          error: {
            code: 'ACCOUNT_SUSPENDED',
            message: 'Аккаунт заблокирован',
          },
        },
        { status: 403 }
      )
    }

    // Return user profile
    return NextResponse.json(
      {
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          phoneVerifiedAt: user.phoneVerifiedAt?.toISOString(),
          email: user.email,
          role: user.role,
          status: user.status,
          preferredLocale: user.preferredLocale,
          announcementsPushEnabled: user.announcementsPushEnabled,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error in get session:', error)

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
