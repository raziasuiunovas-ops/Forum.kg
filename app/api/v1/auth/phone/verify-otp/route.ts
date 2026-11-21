/**
 * POST /api/v1/auth/phone/verify-otp
 * Verify OTP code and create/update user session
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import {
  verifyOtpSchema,
  validateRequestBody,
  formatValidationErrors,
  verifyPassword,
  createAccessToken,
  OTP_CONFIG,
  OTP_ERRORS,
  createAuthError,
  SessionUser,
  SESSION_CONFIG,
} from '@/lib/auth'
import { UserRole, UserStatus, Locale } from '@prisma/client'
import { SessionService } from '@/lib/services/session.service'

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json()
    const validation = validateRequestBody(verifyOtpSchema, body)

    if (!validation.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Ошибка валидации данных',
            details: formatValidationErrors(validation.errors),
          },
        },
        { status: 422 }
      )
    }

    const { challengeId, code } = validation.data

    // Find OTP challenge
    const challenge = await prisma.otpChallenge.findUnique({
      where: { id: challengeId },
    })

    if (!challenge) {
      return NextResponse.json(
        {
          error: {
            code: OTP_ERRORS.INVALID_OTP.code,
            message: OTP_ERRORS.INVALID_OTP.message,
          },
        },
        { status: 400 }
      )
    }

    // Check if already consumed
    if (challenge.consumedAt) {
      return NextResponse.json(
        {
          error: {
            code: OTP_ERRORS.OTP_ALREADY_USED.code,
            message: OTP_ERRORS.OTP_ALREADY_USED.message,
          },
        },
        { status: 400 }
      )
    }

    // Check if expired
    if (challenge.expiresAt < new Date()) {
      return NextResponse.json(
        {
          error: {
            code: OTP_ERRORS.OTP_EXPIRED.code,
            message: OTP_ERRORS.OTP_EXPIRED.message,
          },
        },
        { status: 400 }
      )
    }

    // Check attempts limit
    if (challenge.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
      return NextResponse.json(
        {
          error: {
            code: OTP_ERRORS.TOO_MANY_ATTEMPTS.code,
            message: OTP_ERRORS.TOO_MANY_ATTEMPTS.message,
          },
        },
        { status: 429 }
      )
    }

    // Verify OTP code
    const isValid = await verifyPassword(code, challenge.codeHash)

    if (!isValid) {
      // Atomically increment attempts to prevent race conditions
      const updatedChallenge = await prisma.otpChallenge.update({
        where: { id: challengeId },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      })

      return NextResponse.json(
        {
          error: {
            code: OTP_ERRORS.INVALID_OTP.code,
            message: OTP_ERRORS.INVALID_OTP.message,
            details: {
              attemptsRemaining: OTP_CONFIG.MAX_ATTEMPTS - updatedChallenge.attempts,
            },
          },
        },
        { status: 400 }
      )
    }

    // Mark challenge as consumed
    await prisma.otpChallenge.update({
      where: { id: challengeId },
      data: { consumedAt: new Date() },
    })

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { phone: challenge.phone },
    })

    const now = new Date()

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          phone: challenge.phone,
          phoneVerifiedAt: now,
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          preferredLocale: Locale.RU,
        },
      })
    } else {
      // Update phone verification timestamp if not set
      if (!user.phoneVerifiedAt) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { phoneVerifiedAt: now },
        })
      }
    }

    // Check if user is suspended
    if (user.status === UserStatus.SUSPENDED) {
      return NextResponse.json(
        {
          error: {
            code: 'ACCOUNT_SUSPENDED',
            message: 'Аккаунт заблокирован',
          },
        },
        { status: 403 }
      )
    }

    // Create session
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

    // Create database-backed session with SessionService
    const userAgent = request.headers.get('user-agent') || undefined
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined

    const sessionData = await SessionService.createSession(user.id, {
      userAgent,
      ipAddress,
    })

    // Create access token
    const accessToken = createAccessToken(sessionUser, sessionData.sessionId)

    // Set session cookies
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

    // Return success with user data (without sensitive fields)
    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          phoneVerifiedAt: user.phoneVerifiedAt?.toISOString(),
          email: user.email,
          role: user.role,
          status: user.status,
          preferredLocale: user.preferredLocale,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error in verify-otp:', error)

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
