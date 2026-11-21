/**
 * GET /api/v1/auth/csrf-token
 * Get CSRF token for authenticated session
 */

import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateCsrfToken } from '@/lib/security/csrf'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

export async function GET(request: NextRequest) {
  try {
    // Get or create CSRF token
    const csrfToken = await getOrCreateCsrfToken()

    // Return token to client
    // Client should include this in X-CSRF-Token header for state-changing requests
    return NextResponse.json(
      {
        csrfToken,
      },
      { status: 200 }
    )
  } catch {
    writeSecurityAuditEvent({
      eventType: 'API_ERROR', result: 'error', request,
      reason: 'csrf_token_api_failure', statusCode: 500,
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
