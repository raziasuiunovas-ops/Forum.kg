/**
 * POST /api/v1/auth/phone/verify-otp
 * Verifies a delivered OTP and performs only the operation bound to its purpose.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { Locale, OtpDeliveryStatus, OtpPurpose, UserRole, UserStatus } from '@prisma/client'
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
  normalizePhone,
} from '@/lib/auth'
import { requireAuth } from '@/lib/auth/middleware'
import { SessionService } from '@/lib/services/session.service'
import { initializeCsrfToken, verifyCsrfToken } from '@/lib/security/csrf'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

function errorResponse(code: string, message: string, status: number, details?: object) {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status }
  )
}

function toPublicUser(user: {
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
  updatedAt: Date
}) {
  return {
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
  }
}

export async function POST(request: NextRequest) {
  let challengeIdForFailure: string | undefined
  let purposeForFailure: OtpPurpose | undefined

  try {
    const body = await safeJsonParse<unknown>(request)
    if (body === null) {
      return errorResponse('VALIDATION_ERROR', 'Тело запроса не может быть пустым', 422)
    }

    const validation = validateRequestBody(verifyOtpSchema, body)
    if (!validation.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        'Ошибка валидации данных',
        422,
        formatValidationErrors(validation.errors)
      )
    }

    const { challengeId, code } = validation.data
    challengeIdForFailure = challengeId

    const challenge = await prisma.$transaction((tx) =>
      tx.otpChallenge.findUnique({ where: { id: challengeId } })
    )
    if (!challenge) {
      writeSecurityAuditEvent({
        eventType: 'OTP_VERIFY', result: 'failure', request,
        reason: 'challenge_not_found', statusCode: 400,
      })
      return errorResponse(OTP_ERRORS.INVALID_OTP.code, OTP_ERRORS.INVALID_OTP.message, 400)
    }
    purposeForFailure = challenge.purpose

    let requesterUserId: string | undefined
    if (challenge.purpose !== OtpPurpose.LOGIN) {
      const authResult = await requireAuth(request)
      if (authResult instanceof NextResponse) return authResult
      requesterUserId = authResult.user.userId

      const csrfValid = await verifyCsrfToken(request, { respectSkippedPaths: false })
      if (!csrfValid) {
        writeSecurityAuditEvent({
          eventType: 'CSRF_REJECTED', result: 'denied', request,
          userId: requesterUserId, reason: 'csrf_validation_failed', statusCode: 403,
        })
        return errorResponse('CSRF_TOKEN_INVALID', 'CSRF token validation failed', 403)
      }

      if (!challenge.requestedByUserId || challenge.requestedByUserId !== requesterUserId) {
        writeSecurityAuditEvent({
          eventType: 'OTP_VERIFY', result: 'denied', request,
          userId: requesterUserId, reason: 'challenge_owner_mismatch', statusCode: 403,
        })
        return errorResponse('CHALLENGE_FORBIDDEN', 'Операция не относится к текущему аккаунту', 403)
      }
    }

    if (challenge.consumedAt) {
      writeSecurityAuditEvent({
        eventType: 'OTP_VERIFY', result: 'denied', request,
        userId: requesterUserId, reason: 'challenge_already_used', statusCode: 400,
      })
      return errorResponse(OTP_ERRORS.OTP_ALREADY_USED.code, OTP_ERRORS.OTP_ALREADY_USED.message, 400)
    }
    if (challenge.expiresAt < new Date()) {
      writeSecurityAuditEvent({
        eventType: 'OTP_VERIFY', result: 'denied', request,
        userId: requesterUserId, reason: 'challenge_expired', statusCode: 400,
      })
      return errorResponse(OTP_ERRORS.OTP_EXPIRED.code, OTP_ERRORS.OTP_EXPIRED.message, 400)
    }
    if (challenge.deliveryStatus !== OtpDeliveryStatus.ACCEPTED) {
      writeSecurityAuditEvent({
        eventType: 'OTP_VERIFY', result: 'denied', request,
        userId: requesterUserId, reason: 'challenge_not_delivered', statusCode: 400,
      })
      return errorResponse(OTP_ERRORS.INVALID_OTP.code, OTP_ERRORS.INVALID_OTP.message, 400)
    }
    if (challenge.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
      writeSecurityAuditEvent({
        eventType: 'OTP_VERIFY', result: 'denied', request,
        userId: requesterUserId, reason: 'otp_attempt_limit', statusCode: 429,
      })
      writeSecurityAuditEvent({
        eventType: 'RATE_LIMIT_EXCEEDED', result: 'denied', request,
        userId: requesterUserId, reason: 'otp_attempt_limit', statusCode: 429,
      })
      return errorResponse(
        OTP_ERRORS.TOO_MANY_ATTEMPTS.code,
        OTP_ERRORS.TOO_MANY_ATTEMPTS.message,
        429
      )
    }

    const isValid = await verifyPassword(code, challenge.codeHash)
    if (!isValid) {
      const now = new Date()
      const updatedChallenge = await prisma.$transaction(async (tx) => {
        await tx.otpChallenge.updateMany({
          where: {
            id: challengeId,
            deliveryStatus: OtpDeliveryStatus.ACCEPTED,
            consumedAt: null,
            expiresAt: { gte: now },
            attempts: { lt: OTP_CONFIG.MAX_ATTEMPTS },
          },
          data: { attempts: { increment: 1 } },
        })
        return tx.otpChallenge.findUnique({
          where: { id: challengeId },
          select: { attempts: true },
        })
      })
      const attemptsUsed = updatedChallenge?.attempts ?? OTP_CONFIG.MAX_ATTEMPTS

      writeSecurityAuditEvent({
        eventType: 'OTP_VERIFY', result: 'failure', request,
        userId: requesterUserId, reason: 'invalid_otp', statusCode: 400,
      })
      writeSecurityAuditEvent({
        eventType: 'AUTH_FAILURE', result: 'failure', request,
        userId: requesterUserId, reason: 'invalid_otp', statusCode: 400,
      })
      return errorResponse(
        OTP_ERRORS.INVALID_OTP.code,
        OTP_ERRORS.INVALID_OTP.message,
        400,
        { attemptsRemaining: Math.max(0, OTP_CONFIG.MAX_ATTEMPTS - attemptsUsed) }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const consumptionTime = new Date()
      const consumed = await tx.otpChallenge.updateMany({
        where: {
          id: challengeId,
          deliveryStatus: OtpDeliveryStatus.ACCEPTED,
          consumedAt: null,
          expiresAt: { gte: consumptionTime },
          attempts: { lt: OTP_CONFIG.MAX_ATTEMPTS },
        },
        data: { consumedAt: consumptionTime },
      })

      if (consumed.count === 0) {
        const current = await tx.otpChallenge.findUnique({ where: { id: challengeId } })
        if (!current) throw createAuthError('INVALID_OTP')
        if (current.consumedAt) throw createAuthError('OTP_ALREADY_USED')
        if (current.expiresAt < consumptionTime) throw createAuthError('OTP_EXPIRED')
        if (current.attempts >= OTP_CONFIG.MAX_ATTEMPTS) throw createAuthError('TOO_MANY_ATTEMPTS')
        throw createAuthError('INVALID_OTP')
      }

      let user: {
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
        updatedAt: Date
      }

      if (challenge.purpose === OtpPurpose.LOGIN) {
        const existingUser = await tx.user.findUnique({ where: { phone: challenge.phone } })
        user = existingUser
          ? existingUser
          : await tx.user.create({
              data: {
                phone: challenge.phone,
                phoneVerifiedAt: consumptionTime,
                role: UserRole.USER,
                status: UserStatus.ACTIVE,
                preferredLocale: Locale.RU,
              },
            })

        if (!user.phoneVerifiedAt) {
          user = await tx.user.update({
            where: { id: user.id },
            data: { phoneVerifiedAt: consumptionTime },
          })
        }
      } else {
        const currentUser = await tx.user.findUnique({
          where: { id: requesterUserId },
        })
        if (!currentUser || currentUser.id !== challenge.requestedByUserId) {
          throw createAuthError('UNAUTHORIZED')
        }

        if (challenge.purpose === OtpPurpose.VERIFY_PHONE) {
          if (!currentUser.phone || normalizePhone(currentUser.phone) !== challenge.phone) {
            throw createAuthError('PHONE_NOT_CURRENT')
          }
          user = currentUser.phoneVerifiedAt
            ? currentUser
            : await tx.user.update({
                where: { id: currentUser.id },
                data: { phoneVerifiedAt: consumptionTime },
              })
        } else {
          if (currentUser.phone && normalizePhone(currentUser.phone) === challenge.phone) {
            throw createAuthError('PHONE_UNCHANGED')
          }
          const userWithPhone = await tx.user.findUnique({
            where: { phone: challenge.phone },
            select: { id: true },
          })
          if (userWithPhone && userWithPhone.id !== currentUser.id) {
            throw createAuthError('PHONE_ALREADY_IN_USE')
          }
          user = await tx.user.update({
            where: { id: currentUser.id },
            data: { phone: challenge.phone, phoneVerifiedAt: consumptionTime },
          })
        }
      }

      if (user.status === UserStatus.SUSPENDED) {
        throw createAuthError('ACCOUNT_SUSPENDED')
      }

      if (challenge.purpose !== OtpPurpose.LOGIN) {
        return { kind: 'updated' as const, user }
      }

      const userAgent = request.headers.get('user-agent') || undefined
      const ipAddress =
        request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined
      const sessionData = await SessionService.createSession(
        user.id,
        { userAgent, ipAddress },
        tx
      )
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
      return { kind: 'login' as const, user, sessionData, accessToken }
    })

    if (result.kind === 'login') {
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
      await initializeCsrfToken()
    }

    const eventReason =
      challenge.purpose === OtpPurpose.LOGIN
        ? 'otp_login'
        : challenge.purpose === OtpPurpose.VERIFY_PHONE
          ? 'phone_verified'
          : 'phone_changed'
    writeSecurityAuditEvent({
      eventType: 'OTP_VERIFY', result: 'success', request,
      userId: result.user.id, reason: eventReason, statusCode: 200,
    })
    if (result.kind === 'login') {
      writeSecurityAuditEvent({
        eventType: 'AUTH_SUCCESS', result: 'success', request,
        userId: result.user.id, reason: 'otp_login', statusCode: 200,
      })
    }

    return NextResponse.json(
      { success: true, user: toPublicUser(result.user) },
      { status: 200 }
    )
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'ValidationError') {
      const validationError = error as { message?: string }
      return errorResponse(
        'VALIDATION_ERROR',
        validationError.message || 'Некорректный JSON в теле запроса',
        422
      )
    }

    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined
    const statusCode = error && typeof error === 'object' && 'statusCode' in error
      ? Number((error as { statusCode: unknown }).statusCode)
      : undefined

    if (
      code &&
      statusCode &&
      Number.isInteger(statusCode) &&
      statusCode >= 400 &&
      statusCode <= 499
    ) {
      const message = error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'Запрос отклонён'

      if (
        challengeIdForFailure &&
        purposeForFailure === OtpPurpose.CHANGE_PHONE &&
        (code === OTP_ERRORS.PHONE_ALREADY_IN_USE.code || code === 'P2002')
      ) {
        await prisma.$transaction((tx) => tx.otpChallenge.updateMany({
          where: {
            id: challengeIdForFailure,
            deliveryStatus: OtpDeliveryStatus.ACCEPTED,
            consumedAt: null,
          },
          data: { consumedAt: new Date() },
        }))
        return errorResponse(
          OTP_ERRORS.PHONE_ALREADY_IN_USE.code,
          OTP_ERRORS.PHONE_ALREADY_IN_USE.message,
          OTP_ERRORS.PHONE_ALREADY_IN_USE.statusCode
        )
      }

      if (
        challengeIdForFailure &&
        (code === OTP_ERRORS.PHONE_NOT_CURRENT.code || code === 'PHONE_UNCHANGED')
      ) {
        await prisma.$transaction((tx) => tx.otpChallenge.updateMany({
          where: {
            id: challengeIdForFailure,
            deliveryStatus: OtpDeliveryStatus.ACCEPTED,
            consumedAt: null,
          },
          data: { consumedAt: new Date() },
        }))
      }

      writeSecurityAuditEvent({
        eventType: code === 'UNAUTHORIZED' ? 'ACCESS_DENIED' : 'OTP_VERIFY',
        result: 'denied', request,
        reason: code === 'UNAUTHORIZED' ? 'otp_account_rejected' : 'otp_verification_rejected',
        statusCode,
      })
      return errorResponse(code, message, statusCode)
    }

    if (code === 'P2002' && purposeForFailure === OtpPurpose.CHANGE_PHONE) {
      if (challengeIdForFailure) {
        await prisma.otpChallenge.updateMany({
          where: {
            id: challengeIdForFailure,
            deliveryStatus: OtpDeliveryStatus.ACCEPTED,
            consumedAt: null,
          },
          data: { consumedAt: new Date() },
        })
      }
      return errorResponse(
        OTP_ERRORS.PHONE_ALREADY_IN_USE.code,
        OTP_ERRORS.PHONE_ALREADY_IN_USE.message,
        OTP_ERRORS.PHONE_ALREADY_IN_USE.statusCode
      )
    }

    writeSecurityAuditEvent({
      eventType: 'API_ERROR', result: 'error', request,
      reason: 'otp_verification_failure', statusCode: 500,
    })
    return errorResponse('INTERNAL_ERROR', 'Внутренняя ошибка сервера', 500)
  }
}
