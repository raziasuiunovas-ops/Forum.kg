/**
 * POST /api/v1/auth/logout
 * Logout user and revoke current session
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SessionService } from '@/lib/services/session.service'
import { clearCsrfToken } from '@/lib/security/csrf'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

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

    // Clear CSRF token
    await clearCsrfToken()

    writeSecurityAuditEvent({
      eventType: 'LOGOUT', result: 'success', request,
      reason: 'logout_completed', statusCode: 200,
    })

    return NextResponse.json(
      {
        success: true,
      },
      { status: 200 }
    )
  } catch {
    writeSecurityAuditEvent({
      eventType: 'API_ERROR', result: 'error', request,
      reason: 'logout_api_failure', statusCode: 500,
    })

    // Even on error, clear cookies for client safety
    const cookieStore = await cookies()
    cookieStore.delete('session')
    cookieStore.delete({
      name: 'refresh',
      path: '/api/v1/auth',
    })

    // Clear CSRF token
    await clearCsrfToken()

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
