/**
 * Auth Types for FORUM.KG
 * Session-based authentication with JWT tokens
 */

import { UserRole, UserStatus, Locale } from '@prisma/client'

export interface SessionUser {
  id: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  phoneVerifiedAt: Date | null
  email: string | null
  role: UserRole
  status: UserStatus
  preferredLocale: Locale
  createdAt: Date
}

export interface JWTPayload {
  userId: string
  sessionId: string
  role: UserRole
  status: UserStatus
  iat: number
  exp: number
}

/**
 * Authenticated user with fresh data from database
 * Used in middleware to ensure RBAC uses current role/status
 */
export interface AuthenticatedUser {
  userId: string
  role: UserRole
  status: UserStatus
}

export interface SessionCookieOptions {
  httpOnly: boolean
  secure: boolean
  sameSite: 'strict' | 'lax' | 'none'
  path: string
  maxAge: number
}

export interface AuthErrorResponse {
  code: string
  message: string
  details?: Record<string, any>
}

// OTP Configuration
export const OTP_CONFIG = {
  LENGTH: 6,
  EXPIRY_MINUTES: 10,
  MAX_ATTEMPTS: 5,
  RESEND_COOLDOWN_SECONDS: 60,
} as const

// Session Configuration
export const SESSION_CONFIG = {
  ACCESS_TOKEN_EXPIRY: '15m', // 15 minutes
  REFRESH_TOKEN_EXPIRY: '7d', // 7 days
  COOKIE_MAX_AGE: 15 * 60, // 15 minutes in seconds
  REFRESH_COOKIE_MAX_AGE: 7 * 24 * 60 * 60, // 7 days in seconds
} as const

// Rate Limiting Configuration
export const RATE_LIMIT_CONFIG = {
  OTP_REQUEST: {
    MAX_ATTEMPTS: 3,
    WINDOW_MINUTES: 15,
    RESEND_COOLDOWN_SECONDS: OTP_CONFIG.RESEND_COOLDOWN_SECONDS,
  },
  LOGIN: {
    MAX_ATTEMPTS: 5,
    WINDOW_MINUTES: 15,
  },
} as const
