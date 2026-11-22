import { NextRequest, NextResponse } from 'next/server'
import { csrfMiddleware } from './lib/security/csrf'
import { checkApiRateLimit } from './lib/security/api-rate-limit'
import { isSuspiciousApiRequest, writeSecurityAuditEvent } from './lib/security/audit-logger'

export default async function middleware(request: NextRequest) {
  const isApiRequest = request.nextUrl.pathname.startsWith('/api/')
  const requestId = isApiRequest ? crypto.randomUUID() : undefined
  const forwardedRequestHeaders = isApiRequest ? new Headers(request.headers) : undefined
  if (requestId && forwardedRequestHeaders) {
    // Use a server-generated ID so every downstream audit event for this
    // request shares one correlation value, regardless of client input.
    forwardedRequestHeaders.set('x-request-id', requestId)
  }

  if (isApiRequest && isSuspiciousApiRequest(request)) {
    writeSecurityAuditEvent({
      eventType: 'SUSPICIOUS_REQUEST',
      result: 'denied',
      request,
      requestId,
      reason: 'path_injection_pattern',
    })
  }

  const rateLimitDecision = isApiRequest
    ? await checkApiRateLimit(request)
    : null

  if (rateLimitDecision?.response) {
    if (rateLimitDecision.response.status === 429) {
      writeSecurityAuditEvent({
        eventType: 'RATE_LIMIT_EXCEEDED',
        result: 'denied',
        request,
        requestId,
        reason: 'global_api_limit',
        statusCode: 429,
      })
    } else if (rateLimitDecision.response.status >= 500) {
      writeSecurityAuditEvent({
        eventType: 'API_ERROR',
        result: 'error',
        request,
        requestId,
        reason: 'rate_limit_service_unavailable',
        statusCode: rateLimitDecision.response.status,
      })
    }
    return rateLimitDecision.response
  }

  const addRateLimitHeaders = (response: NextResponse): NextResponse => {
    rateLimitDecision?.headers.forEach((value, name) => {
      response.headers.set(name, value)
    })
    return response
  }

  // Apply CSRF protection for API routes
  if (isApiRequest) {
    const csrfResponse = await csrfMiddleware(request)
    if (csrfResponse) {
      if (csrfResponse.status === 403) {
        writeSecurityAuditEvent({
          eventType: 'CSRF_REJECTED',
          result: 'denied',
          request,
          requestId,
          reason: 'csrf_validation_failed',
          statusCode: 403,
        })
      }
      return addRateLimitHeaders(csrfResponse)
    }
    
    // For API routes, just add rate limit headers and continue
    return addRateLimitHeaders(NextResponse.next({
      request: { headers: forwardedRequestHeaders },
    }))
  }

  // For non-API routes, continue without modification
  return addRateLimitHeaders(NextResponse.next())
}

export const config = {
  matcher: ['/api/:path*']
}
