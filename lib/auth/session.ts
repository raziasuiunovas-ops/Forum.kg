/**
 * JWT Session Management
 * Implements JWT-based sessions with HttpOnly cookies
 */

import jwt from 'jsonwebtoken'
import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { SessionUser, JWTPayload, SESSION_CONFIG } from './types'
import { createAuthError } from './errors'

// Get JWT secret from environment (no fallback for security)
const JWT_SECRET = process.env.JWT_SECRET
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET

// Validate secrets are configured
if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  const error = 'CRITICAL: JWT_SECRET and JWT_REFRESH_SECRET must be configured in environment variables'
  
  if (process.env.NODE_ENV === 'production') {
    // In production, throw error to prevent startup with missing secrets
    throw new Error(error)
  } else {
    // In development, log error but allow startup for configuration
    console.error(`\n❌ ${error}`)
    console.error('⚠️  Application will fail on authentication attempts until secrets are configured\n')
  }
}

/**
 * Create JWT access token
 */
export function createAccessToken(user: SessionUser, sessionId: string): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured')
  }

  const payload: JWTPayload = {
    userId: user.id,
    sessionId,
    role: user.role,
    status: user.status,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 15 * 60, // 15 minutes
  }

  return jwt.sign(payload, JWT_SECRET)
}

/**
 * Create JWT refresh token
 */
export function createRefreshToken(userId: string): string {
  if (!JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET is not configured')
  }

  // Generate cryptographically secure random nonce
  // This ensures each token is unique even if issued in same second
  const nonce = randomBytes(16).toString('hex')

  const payload = {
    userId,
    jti: nonce, // JWT ID - ensures uniqueness
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
  }

  return jwt.sign(payload, JWT_REFRESH_SECRET)
}

/**
 * Verify and decode JWT access token
 */
export function verifyAccessToken(token: string): JWTPayload {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured')
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    return decoded
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw createAuthError('SESSION_EXPIRED')
    }
    throw createAuthError('INVALID_TOKEN')
  }
}

/**
 * Verify and decode JWT refresh token
 */
export function verifyRefreshToken(token: string): { userId: string } {
  if (!JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET is not configured')
  }

  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string }
    return decoded
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw createAuthError('SESSION_EXPIRED')
    }
    throw createAuthError('INVALID_TOKEN')
  }
}

/**
 * Set session cookies
 * @deprecated Use SessionService.createSession and manual cookie setting instead
 */
export async function setSessionCookies(user: SessionUser, sessionId: string) {
  const accessToken = createAccessToken(user, sessionId)
  const refreshToken = createRefreshToken(user.id)

  const cookieStore = await cookies()
  const isProduction = process.env.NODE_ENV === 'production'

  // Set access token cookie
  cookieStore.set('session', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_CONFIG.COOKIE_MAX_AGE,
  })

  // Set refresh token cookie
  cookieStore.set('refresh', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: SESSION_CONFIG.REFRESH_COOKIE_MAX_AGE,
  })
}

/**
 * Clear session cookies
 */
export async function clearSessionCookies() {
  const cookieStore = await cookies()
  
  cookieStore.delete('session')
  cookieStore.delete('refresh')
}

/**
 * Get current session from cookies
 */
export async function getCurrentSession(): Promise<JWTPayload | null> {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('session')

    if (!sessionCookie?.value) {
      return null
    }

    const payload = verifyAccessToken(sessionCookie.value)
    return payload
  } catch (error) {
    return null
  }
}

/**
 * Get session user from request
 * Throws error if not authenticated
 */
export async function requireSession(): Promise<JWTPayload> {
  const session = await getCurrentSession()

  if (!session) {
    throw createAuthError('UNAUTHORIZED')
  }

  return session
}
