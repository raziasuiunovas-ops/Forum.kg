/**
 * Shared helpers for email + password authentication.
 * Sessions are created exactly like the phone-OTP flow (database-backed refresh session + cookies).
 */
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import type { User } from '@prisma/client'
import { SessionService } from '@/lib/services/session.service'
import { createAccessToken } from '@/lib/auth/session'
import { SESSION_CONFIG } from '@/lib/auth/types'
import type { SessionUser } from '@/lib/auth/types'
import { initializeCsrfToken } from '@/lib/security/csrf'

export const emailField = z
  .string()
  .trim()
  .min(3)
  .max(255)
  .email()

/** 8-72 chars (bcrypt ignores everything after 72 bytes), at least one letter and one digit. */
export const passwordField = z
  .string()
  .min(8)
  .max(72)
  .regex(/[A-Za-zЀ-ӿ]/, 'letter')
  .regex(/\d/, 'digit')

const nameField = z.string().trim().min(1).max(100)

export const registerEmailSchema = z
  .object({
    firstName: nameField,
    lastName: nameField,
    email: emailField,
    password: passwordField,
    preferredLocale: z.enum(['RU', 'KY', 'EN']).optional(),
  })
  .strict()

export const loginEmailSchema = z
  .object({
    email: emailField,
    // Do not apply the registration policy on login: only require a non-empty, bounded value.
    password: z.string().min(1).max(200),
  })
  .strict()

/** Public (safe) view of the user returned to the browser. */
export function publicUser(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    phoneVerifiedAt: user.phoneVerifiedAt?.toISOString() ?? null,
    email: user.email,
    role: user.role,
    status: user.status,
    preferredLocale: user.preferredLocale,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

/** Create a DB-backed session and set the HttpOnly cookies + CSRF token. */
export async function startSession(user: User, request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || undefined
  const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined

  const sessionData = await SessionService.createSession(user.id, { userAgent, ipAddress })

  const sessionUser: SessionUser = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    phoneVerifiedAt: user.phoneVerifiedAt,
    email: user.email,
    role: user.role,
    status: user.status,
    preferredLocale: user.preferredLocale,
    createdAt: user.createdAt,
  }
  const accessToken = createAccessToken(sessionUser, sessionData.sessionId)

  const cookieStore = await cookies()
  const isProduction = process.env.NODE_ENV === 'production'
  cookieStore.set('session', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_CONFIG.COOKIE_MAX_AGE,
  })
  cookieStore.set('refresh', sessionData.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: SESSION_CONFIG.REFRESH_COOKIE_MAX_AGE,
  })
  await initializeCsrfToken()
}
