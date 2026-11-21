/**
 * POST /api/v1/auth/phone/verify-otp
 * Verify OTP code and create/update user session
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { safeJsonParse } from '@/lib/api'
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
import { initializeCsrfToken } from '@/lib/security/csrf'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body using safeJsonParse to catch malformed JSON
    const body = await safeJsonParse<unknown>(request)
    
    if (body === null) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Тело запроса не может быть пустым',
          },
        },
        { status: 422 }
      )
    }

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

    // Find OTP challenge for initial validation
    const challenge = await prisma.otpChallenge.findUnique({
      where: { id: challengeId },
    })

    if (!challenge) {
      writeSecurityAuditEvent({
        eventType: 'OTP_VERIFY', result: 'failure', request,
        reason: 'challenge_not_found', statusCode: 400,
      })
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

    // Check if already consumed (early check to avoid bcrypt on consumed OTP)
    if (challenge.consumedAt) {
      writeSecurityAuditEvent({
        eventType: 'OTP_VERIFY', result: 'denied', request,
        reason: 'challenge_already_used', statusCode: 400,
      })
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

    // Check if expired (early check to avoid bcrypt on expired OTP)
    if (challenge.expiresAt < new Date()) {
      writeSecurityAuditEvent({
        eventType: 'OTP_VERIFY', result: 'denied', request,
        reason: 'challenge_expired', statusCode: 400,
      })
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

    // Check attempts limit (early check)
    if (challenge.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
      writeSecurityAuditEvent({
        eventType: 'OTP_VERIFY', result: 'denied', request,
        reason: 'otp_attempt_limit', statusCode: 429,
      })
      writeSecurityAuditEvent({
        eventType: 'RATE_LIMIT_EXCEEDED', result: 'denied', request,
        reason: 'otp_attempt_limit', statusCode: 429,
      })
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

    // Verify OTP code BEFORE consuming (expensive bcrypt operation)
    const isValid = await verifyPassword(code, challenge.codeHash)

    if (!isValid) {
      // Single timestamp for atomic operations
      const now = new Date()
      
      // Atomically increment attempts with ALL conditions checked
      // This prevents race conditions in attempts counter
      const incrementedAttempts = await prisma.otpChallenge.updateMany({
        where: {
          id: challengeId,
          consumedAt: null, // Not yet consumed
          expiresAt: { gte: now }, // Not expired
          attempts: { lt: OTP_CONFIG.MAX_ATTEMPTS }, // Below limit
        },
        data: {
          attempts: { increment: 1 },
        },
      })

      // Fetch updated attempts count for response
      const updatedChallenge = await prisma.otpChallenge.findUnique({
        where: { id: challengeId },
        select: { attempts: true },
      })

      const attemptsUsed = updatedChallenge?.attempts || OTP_CONFIG.MAX_ATTEMPTS

      writeSecurityAuditEvent({
        eventType: 'OTP_VERIFY', result: 'failure', request,
        reason: 'invalid_otp', statusCode: 400,
      })
      writeSecurityAuditEvent({
        eventType: 'AUTH_FAILURE', result: 'failure', request,
        reason: 'invalid_otp', statusCode: 400,
      })

      return NextResponse.json(
        {
          error: {
            code: OTP_ERRORS.INVALID_OTP.code,
            message: OTP_ERRORS.INVALID_OTP.message,
            details: {
              attemptsRemaining: Math.max(0, OTP_CONFIG.MAX_ATTEMPTS - attemptsUsed),
            },
          },
        },
        { status: 400 }
      )
    }

    // TRANSACTIONAL OTP VERIFICATION
    // Wrap OTP consumption + user creation + session creation in atomic transaction
    // This prevents OTP waste if user/session creation fails
    const result = await prisma.$transaction(async (tx) => {
      // Use fresh timestamp at consumption time (after bcrypt verification)
      // This ensures OTP expired during bcrypt is rejected
      const consumptionTime = new Date()

      // ATOMIC OTP CONSUMPTION
      // Mark challenge as consumed with ALL safety conditions
      // This prevents race conditions where multiple requests consume the same OTP
      const consumed = await tx.otpChallenge.updateMany({
        where: {
          id: challengeId,
          consumedAt: null, // Not yet consumed (critical for single-use)
          expiresAt: { gte: consumptionTime }, // Not expired (check at consumption time)
          attempts: { lt: OTP_CONFIG.MAX_ATTEMPTS }, // Below limit
        },
        data: {
          consumedAt: consumptionTime,
        },
      })

      // If updateMany affected 0 rows, OTP was already consumed or conditions failed
      if (consumed.count === 0) {
        // Re-fetch challenge to determine specific failure reason
        const currentChallenge = await tx.otpChallenge.findUnique({
          where: { id: challengeId },
        })

        if (!currentChallenge) {
          throw createAuthError('INVALID_OTP')
        }

        if (currentChallenge.consumedAt) {
          throw createAuthError('OTP_ALREADY_USED')
        }

        if (currentChallenge.expiresAt < consumptionTime) {
          throw createAuthError('OTP_EXPIRED')
        }

        if (currentChallenge.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
          throw createAuthError('TOO_MANY_ATTEMPTS')
        }

        // Fallback error if none of above matched
        throw new Error('OTP consumption failed: unknown reason')
      }

      // SUCCESS: OTP atomically consumed within transaction
      // Now proceed with user and session creation

      // Find or create user
      let user = await tx.user.findUnique({
        where: { phone: challenge.phone },
      })

      if (!user) {
        // Create new user
        user = await tx.user.create({
          data: {
            phone: challenge.phone,
            phoneVerifiedAt: consumptionTime,
            role: UserRole.USER,
            status: UserStatus.ACTIVE,
            preferredLocale: Locale.RU,
          },
        })
      } else {
        // Update phone verification timestamp if not set
        if (!user.phoneVerifiedAt) {
          user = await tx.user.update({
            where: { id: user.id },
            data: { phoneVerifiedAt: consumptionTime },
          })
        }
      }

      // Check if user is suspended
      if (user.status === UserStatus.SUSPENDED) {
        throw createAuthError('ACCOUNT_SUSPENDED')
      }

      // Extract session metadata
      const userAgent = request.headers.get('user-agent') || undefined
      const ipAddress =
        request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined

      // Create database-backed session (inside transaction)
      const sessionData = await SessionService.createSession(
        user.id,
        { userAgent, ipAddress },
        tx // Pass transaction client
      )

      // Create session user object
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

      // Create access token
      const accessToken = createAccessToken(sessionUser, sessionData.sessionId)

      return {
        user,
        sessionData,
        accessToken,
      }
    })

    // Transaction succeeded - now set cookies (outside transaction)
    // Cookies are side effects and should only be set after transaction commits
    const cookieStore = await cookies()
    const isProduction = process.env.NODE_ENV === 'production'

    cookieStore.set('session', result.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: SESSION_CONFIG.COOKIE_MAX_AGE,
    })

    cookieStore.set('refresh', result.sessionData.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: SESSION_CONFIG.REFRESH_COOKIE_MAX_AGE,
    })

    // Initialize CSRF token for session
    await initializeCsrfToken()

    writeSecurityAuditEvent({
      eventType: 'OTP_VERIFY', result: 'success', request,
      userId: result.user.id, reason: 'otp_verified', statusCode: 200,
    })
    writeSecurityAuditEvent({
      eventType: 'AUTH_SUCCESS', result: 'success', request,
      userId: result.user.id, reason: 'otp_login', statusCode: 200,
    })

    // Return success with user data (without sensitive fields)
    return NextResponse.json(
      {
        success: true,
        user: {
          id: result.user.id,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          phone: result.user.phone,
          phoneVerifiedAt: result.user.phoneVerifiedAt?.toISOString(),
          email: result.user.email,
          role: result.user.role,
          status: result.user.status,
          preferredLocale: result.user.preferredLocale,
          createdAt: result.user.createdAt.toISOString(),
          updatedAt: result.user.updatedAt.toISOString(),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    // Handle ValidationError from safeJsonParse
    if (error && typeof error === 'object' && 'name' in error && error.name === 'ValidationError') {
      const validationError = error as { message?: string }
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: validationError.message || 'Некорректный JSON в теле запроса',
          },
        },
        { status: 422 }
      )
    }

    // Handle AuthError objects thrown from transaction
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      const authError = error as { code: string; message: string; statusCode?: number }
      const statusCode = authError.statusCode || 400
      writeSecurityAuditEvent({
        eventType: 'OTP_VERIFY', result: 'denied', request,
        reason: 'otp_verification_rejected', statusCode,
      })
      if (authError.code === OTP_ERRORS.INVALID_OTP.code) {
        writeSecurityAuditEvent({
          eventType: 'AUTH_FAILURE', result: 'failure', request,
          reason: 'invalid_otp', statusCode,
        })
      } else if (statusCode === 403) {
        writeSecurityAuditEvent({
          eventType: 'ACCESS_DENIED', result: 'denied', request,
          reason: 'otp_account_rejected', statusCode,
        })
      }
      return NextResponse.json(
        {
          error: {
            code: authError.code,
            message: authError.message,
          },
        },
        { status: authError.statusCode || 400 }
      )
    }

    writeSecurityAuditEvent({
      eventType: 'API_ERROR', result: 'error', request,
      reason: 'otp_verification_failure', statusCode: 500,
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
