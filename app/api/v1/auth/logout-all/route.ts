/**
 * POST /api/v1/auth/logout-all
 * Logout from all devices - revoke all user sessions
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireSession } from '@/lib/auth/session'
import { SessionService } from '@/lib/services/session.service'
import { AuthError } from '@/lib/auth/errors'

export async function POST(request: NextRequest) {
  try {
    // Require authentication to get userId
    let session
    try {
      session = await requireSession()
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          {
            error: {
              code: error.code,
              message: error.message,
            },
          },
          { status: error.statusCode }
        )
      }
      throw error
    }

    // Revoke all sessions for this user
    const revokedCount = await SessionService.logoutAll(session.userId)

    // Clear cookies for current device
    const cookieStore = await cookies()
    cookieStore.delete('session')
    cookieStore.delete({
      name: 'refresh',
      path: '/api/v1/auth',
    })

    return NextResponse.json(
      {
        success: true,
        revokedSessions: revokedCount,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error in logout-all:', error)

    // Even on error, clear cookies for client safety
    const cookieStore = await cookies()
    cookieStore.delete('session')
    cookieStore.delete({
      name: 'refresh',
      path: '/api/v1/auth',
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
