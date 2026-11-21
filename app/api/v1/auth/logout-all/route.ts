/**
 * POST /api/v1/auth/logout-all
 * Logout from all devices - revoke all user sessions
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth } from '@/lib/auth/middleware'
import { SessionService } from '@/lib/services/session.service'
import { clearCsrfToken } from '@/lib/security/csrf'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

export async function POST(request: NextRequest) {
  try {
    // Require the access token's database-backed session to still be active.
    const authResult = await requireAuth(request)
    if (authResult instanceof NextResponse) {
      writeSecurityAuditEvent({
        eventType: 'ACCESS_DENIED', result: 'denied', request,
        reason: 'logout_all_auth_required', statusCode: authResult.status,
      })
      return authResult
    }

    // Revoke all sessions for this user
    const revokedCount = await SessionService.logoutAll(authResult.user.userId)

    // Clear cookies for current device
    const cookieStore = await cookies()
    cookieStore.delete('session')
    cookieStore.delete({
      name: 'refresh',
      path: '/api/v1/auth',
    })

    // Clear CSRF token
    await clearCsrfToken()

    writeSecurityAuditEvent({
      eventType: 'LOGOUT_ALL', result: 'success', request,
      userId: authResult.user.userId, reason: 'all_sessions_revoked', statusCode: 200,
    })

    return NextResponse.json(
      {
        success: true,
        revokedSessions: revokedCount,
      },
      { status: 200 }
    )
  } catch {
    writeSecurityAuditEvent({
      eventType: 'API_ERROR', result: 'error', request,
      reason: 'logout_all_api_failure', statusCode: 500,
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
