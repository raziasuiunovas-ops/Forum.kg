/**
 * GET /api/v1/auth/session
 * Get current session information
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

export async function GET(request: NextRequest) {
  try {
    // Require authentication with full DB validation
    const authResult = await requireAuth(request)
    
    if (authResult instanceof NextResponse) {
      return authResult
    }

    const { user } = authResult

    // Fetch full user profile from database
    const userProfile = await prisma.user.findUnique({
      where: { id: user.userId },
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

    if (!userProfile) {
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

    // Return user profile
    return NextResponse.json(
      {
        user: {
          id: userProfile.id,
          firstName: userProfile.firstName,
          lastName: userProfile.lastName,
          phone: userProfile.phone,
          phoneVerifiedAt: userProfile.phoneVerifiedAt?.toISOString(),
          email: userProfile.email,
          role: userProfile.role,
          status: userProfile.status,
          preferredLocale: userProfile.preferredLocale,
          announcementsPushEnabled: userProfile.announcementsPushEnabled,
          createdAt: userProfile.createdAt.toISOString(),
          updatedAt: userProfile.updatedAt.toISOString(),
        },
      },
      { status: 200 }
    )
  } catch {
    writeSecurityAuditEvent({
      eventType: 'API_ERROR', result: 'error', request,
      reason: 'session_api_failure', statusCode: 500,
    })

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
