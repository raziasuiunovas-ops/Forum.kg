/**
 * CSRF Protection for FORUM.KG
 * Protects cookie-based JWT authentication from Cross-Site Request Forgery attacks
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const CSRF_TOKEN_LENGTH = 32
const CSRF_COOKIE_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'
const FINIK_WEBHOOK_PATH = '/api/v1/payments/webhooks/finik'

// Methods that require CSRF protection
const PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

// Paths that should skip CSRF check (e.g., public endpoints)
const CSRF_SKIP_PATHS: string[] = [
  // OTP endpoints - these are rate-limited and don't rely on cookies for auth
  '/api/v1/auth/phone/request-otp',
  '/api/v1/auth/phone/verify-otp',
  // Email auth endpoints - new session creation, no existing cookie to protect
  '/api/v1/auth/email/register',
  '/api/v1/auth/email/login',
  // Password reset - the user is signed out; protected by single-use hashed tokens and rate limits
  '/api/v1/auth/password/request-reset',
  '/api/v1/auth/password/validate-token',
  '/api/v1/auth/password/reset',
  // Add other public endpoints here if needed
]

/**
 * Generate a cryptographically secure CSRF token
 * Uses Web Crypto API compatible with Edge runtime
 */
export function generateCsrfToken(): string {
  // Use Web Crypto API instead of Node.js crypto
  const array = new Uint8Array(CSRF_TOKEN_LENGTH)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Set CSRF token in HttpOnly cookie
 */
export async function setCsrfCookie(token: string) {
  const cookieStore = await cookies()
  const isProduction = process.env.NODE_ENV === 'production'

  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  })
}

/**
 * Get CSRF token from cookie
 */
export async function getCsrfTokenFromCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  const csrfCookie = cookieStore.get(CSRF_COOKIE_NAME)
  return csrfCookie?.value || null
}

/**
 * Get CSRF token from request header
 */
export function getCsrfTokenFromHeader(request: NextRequest): string | null {
  return request.headers.get(CSRF_HEADER_NAME)
}

/**
 * Validate Origin/Referer headers
 */
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const host = request.headers.get('host')

  if (!host) {
    return false
  }

  // If Origin header present, validate it
  if (origin) {
    try {
      const originUrl = new URL(origin)
      // Allow same-origin requests
      if (originUrl.host === host) {
        return true
      }
      // Reject cross-origin
      return false
    } catch {
      return false
    }
  }

  // If no Origin but Referer present, validate it
  if (referer) {
    try {
      const refererUrl = new URL(referer)
      // Allow same-origin requests
      if (refererUrl.host === host) {
        return true
      }
      // Reject cross-origin
      return false
    } catch {
      return false
    }
  }

  // For same-origin requests from older browsers that don't send Origin
  // Allow if no Origin/Referer (e.g., direct API calls from server)
  // This is safe because CSRF attacks always include Origin/Referer
  return true
}

/**
 * Check if path should skip CSRF validation
 */
export function shouldSkipCsrf(pathname: string): boolean {
  // Finik authenticates this server-to-server callback with its signed request;
  // browser cookies and CSRF tokens are not part of the webhook contract.
  return pathname === FINIK_WEBHOOK_PATH || CSRF_SKIP_PATHS.some(path => pathname.startsWith(path))
}

/**
 * Verify CSRF token
 */
export async function verifyCsrfToken(
  request: NextRequest,
  options: { respectSkippedPaths?: boolean } = {}
): Promise<boolean> {
  const method = request.method.toUpperCase()

  // Skip CSRF check for safe methods
  if (!PROTECTED_METHODS.includes(method)) {
    return true
  }

  // Skip for configured paths
  const pathname = new URL(request.url).pathname
  if (options.respectSkippedPaths !== false && shouldSkipCsrf(pathname)) {
    return true
  }

  // Validate Origin/Referer
  if (!validateOrigin(request)) {
    return false
  }

  // Get tokens
  const cookieToken = await getCsrfTokenFromCookie()
  const headerToken = getCsrfTokenFromHeader(request)

  // Both must be present
  if (!cookieToken || !headerToken) {
    return false
  }

  // Tokens must match (constant-time comparison)
  // Convert to same length to prevent timing attacks
  if (cookieToken.length !== headerToken.length) {
    return false
  }

  // Simple constant-time comparison for Edge runtime
  let result = 0
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i)
  }
  
  return result === 0
}

/**
 * Middleware to enforce CSRF protection
 */
export async function csrfMiddleware(request: NextRequest): Promise<NextResponse | null> {
  const method = request.method.toUpperCase()

  // Skip CSRF check for safe methods
  if (!PROTECTED_METHODS.includes(method)) {
    return null
  }

  // Skip for configured paths
  const pathname = new URL(request.url).pathname
  if (shouldSkipCsrf(pathname)) {
    return null
  }

  // Verify CSRF token
  const isValid = await verifyCsrfToken(request)

  if (!isValid) {
    return NextResponse.json(
      {
        error: {
          code: 'CSRF_TOKEN_INVALID',
          message: 'CSRF token validation failed',
        },
      },
      { status: 403 }
    )
  }

  return null
}

/**
 * Generate and set CSRF token for session
 * Call this when creating a new session
 */
export async function initializeCsrfToken(): Promise<string> {
  const token = generateCsrfToken()
  await setCsrfCookie(token)
  return token
}

/**
 * Get current CSRF token or generate new one
 */
export async function getOrCreateCsrfToken(): Promise<string> {
  const existingToken = await getCsrfTokenFromCookie()
  
  if (existingToken) {
    return existingToken
  }

  return await initializeCsrfToken()
}

/**
 * Clear CSRF token (call on logout)
 */
export async function clearCsrfToken() {
  const cookieStore = await cookies()
  cookieStore.delete(CSRF_COOKIE_NAME)
}
