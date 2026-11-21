/**
 * POST /api/v1/auth/logout
 * Logout user and revoke current session
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SessionService } from '@/lib/services/session.service'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const refreshCookie = cookieStore.get('refresh')

    // Revoke session in database if refresh token exists
    if (refreshCookie?.value) {
      await SessionService.logout(refreshCookie.value)
    }

    // Clear session cookies (always clear, even if token was invalid)
    cookieStore.delete('session')
    cookieStore.delete({
      name: 'refresh',
      path: '/api/v1/auth',
    })

    return NextResponse.json(
      {
        success: true,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error in logout:', error)

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
