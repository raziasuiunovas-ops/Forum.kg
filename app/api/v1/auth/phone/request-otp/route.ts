/**
 * POST /api/v1/auth/phone/request-otp
 * Creates and sends a one-time code for the requested phone operation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { OtpDeliveryStatus, OtpPurpose } from '@prisma/client'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'
import { safeJsonParse } from '@/lib/api'
import {
  requestOtpSchema,
  validateRequestBody,
  formatValidationErrors,
  normalizePhone,
  generateOTP,
  hashPassword,
  OTP_CONFIG,
  RATE_LIMIT_CONFIG,
  OTP_ERRORS,
  VALIDATION_ERRORS,
} from '@/lib/auth'
import { requireAuth } from '@/lib/auth/middleware'
import { verifyCsrfToken } from '@/lib/security/csrf'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'
import { getSmsProvider, sendOtpSms, SmsProviderError } from '@/lib/integrations/sms/provider'

const MAX_TRANSACTION_RETRIES = 3
const BASE_RETRY_DELAY_MS = 50
const OTP_WINDOW_MS = RATE_LIMIT_CONFIG.OTP_REQUEST.WINDOW_MINUTES * 60 * 1000

type PreparedChallenge = {
  kind: 'created' | 'accepted' | 'pending'
  id: string
  expiresAt: Date
  retryAfterSeconds?: number
}

function errorResponse(code: string, message: string, status: number, details?: object) {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status }
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await safeJsonParse<unknown>(request)
    if (body === null) {
      return errorResponse('VALIDATION_ERROR', 'Тело запроса не может быть пустым', 422)
    }

    const validation = validateRequestBody(requestOtpSchema, body)
    if (!validation.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        'Ошибка валидации данных',
        422,
        formatValidationErrors(validation.errors)
      )
    }

    const { phone, purpose } = validation.data
    const normalizedPhone = normalizePhone(phone)
    if (!normalizedPhone) {
      return errorResponse(
        VALIDATION_ERRORS.INVALID_PHONE.code,
        VALIDATION_ERRORS.INVALID_PHONE.message,
        422
      )
    }

    let requesterUserId: string | null = null
    if (purpose !== OtpPurpose.LOGIN) {
      const authResult = await requireAuth(request)
      if (authResult instanceof NextResponse) return authResult

      const authenticatedUserId = authResult.user.userId
      requesterUserId = authenticatedUserId
      const { currentUser, userWithPhone } = await prisma.$transaction(async (tx) => ({
        currentUser: await tx.user.findUnique({
          where: { id: authenticatedUserId },
          select: { id: true, phone: true },
        }),
        userWithPhone: purpose === OtpPurpose.CHANGE_PHONE
          ? await tx.user.findUnique({
              where: { phone: normalizedPhone },
              select: { id: true },
            })
          : null,
      }))
      if (!currentUser) {
        return errorResponse('UNAUTHORIZED', 'Требуется авторизация', 401)
      }

      const csrfValid = await verifyCsrfToken(request, { respectSkippedPaths: false })
      if (!csrfValid) {
        writeSecurityAuditEvent({
          eventType: 'CSRF_REJECTED', result: 'denied', request,
          userId: requesterUserId, reason: 'csrf_validation_failed', statusCode: 403,
        })
        return errorResponse('CSRF_TOKEN_INVALID', 'CSRF token validation failed', 403)
      }

      if (purpose === OtpPurpose.VERIFY_PHONE) {
        if (!currentUser.phone || normalizePhone(currentUser.phone) !== normalizedPhone) {
          return errorResponse(
            OTP_ERRORS.PHONE_NOT_CURRENT.code,
            OTP_ERRORS.PHONE_NOT_CURRENT.message,
            OTP_ERRORS.PHONE_NOT_CURRENT.statusCode
          )
        }
      } else {
        if (userWithPhone && userWithPhone.id !== authenticatedUserId) {
          return errorResponse(
            OTP_ERRORS.PHONE_ALREADY_IN_USE.code,
            OTP_ERRORS.PHONE_ALREADY_IN_USE.message,
            OTP_ERRORS.PHONE_ALREADY_IN_USE.statusCode
          )
        }
        if (userWithPhone?.id === authenticatedUserId) {
          return errorResponse('PHONE_UNCHANGED', 'Новый номер должен отличаться от текущего', 409)
        }
      }
    }

    const smsProvider = getSmsProvider()
    if (!smsProvider) {
      writeSecurityAuditEvent({
        eventType: 'API_ERROR', result: 'error', request,
        userId: requesterUserId ?? undefined, reason: 'sms_provider_not_configured', statusCode: 503,
      })
      return errorResponse(
        OTP_ERRORS.SMS_NOT_CONFIGURED.code,
        OTP_ERRORS.SMS_NOT_CONFIGURED.message,
        OTP_ERRORS.SMS_NOT_CONFIGURED.statusCode
      )
    }

    // Generate/hash once, before the retryable database transaction. The
    // provider is called only after a successful commit and is never retried.
    const otpCode = generateOTP()
    const codeHash = await hashPassword(otpCode)
    const expiresAt = new Date(Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000)
    let prepared: PreparedChallenge | undefined

    for (let attempt = 0; attempt < MAX_TRANSACTION_RETRIES; attempt++) {
      try {
        prepared = await prisma.$transaction(
          async (tx): Promise<PreparedChallenge> => {
            const now = new Date()
            const resendWindowStart = new Date(
              now.getTime() - RATE_LIMIT_CONFIG.OTP_REQUEST.RESEND_COOLDOWN_SECONDS * 1000
            )

            const recentChallenge = await tx.otpChallenge.findFirst({
              where: {
                phone: normalizedPhone,
                purpose,
                consumedAt: null,
                expiresAt: { gt: now },
                createdAt: { gte: resendWindowStart },
                deliveryStatus: OtpDeliveryStatus.ACCEPTED,
              },
              orderBy: { createdAt: 'desc' },
              select: { id: true, expiresAt: true, requestedByUserId: true },
            })

            if (
              recentChallenge &&
              recentChallenge.requestedByUserId === requesterUserId
            ) {
              return {
                kind: 'accepted',
                id: recentChallenge.id,
                expiresAt: recentChallenge.expiresAt,
              }
            }

            // Never resend while a submission is pending, even if this
            // invocation outlived the normal resend cooldown. The sender may
            // have accepted the SMS just before its process stopped.
            const pendingChallenge = await tx.otpChallenge.findFirst({
              where: {
                phone: normalizedPhone,
                purpose,
                consumedAt: null,
                expiresAt: { gt: now },
                deliveryStatus: OtpDeliveryStatus.PENDING,
              },
              orderBy: { createdAt: 'desc' },
              select: { id: true, expiresAt: true },
            })
            if (pendingChallenge) {
              return {
                kind: 'pending',
                id: pendingChallenge.id,
                expiresAt: pendingChallenge.expiresAt,
                retryAfterSeconds: Math.max(
                  1,
                  Math.ceil((pendingChallenge.expiresAt.getTime() - now.getTime()) / 1000)
                ),
              }
            }

            // An UNKNOWN result might already have reached the handset. Do not
            // submit another code during its validity window.
            const uncertainChallenge = await tx.otpChallenge.findFirst({
              where: {
                phone: normalizedPhone,
                purpose,
                deliveryStatus: OtpDeliveryStatus.UNKNOWN,
                createdAt: {
                  gte: new Date(now.getTime() - OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000),
                },
              },
              orderBy: { createdAt: 'desc' },
              select: { id: true, expiresAt: true },
            })
            if (uncertainChallenge) {
              return {
                kind: 'pending',
                id: uncertainChallenge.id,
                expiresAt: uncertainChallenge.expiresAt,
                retryAfterSeconds: Math.max(
                  1,
                  Math.ceil((uncertainChallenge.expiresAt.getTime() - now.getTime()) / 1000)
                ),
              }
            }

            const recentRequestCount = await tx.otpChallenge.count({
              where: {
                phone: normalizedPhone,
                purpose,
                createdAt: { gte: new Date(now.getTime() - OTP_WINDOW_MS) },
              },
            })
            if (recentRequestCount >= RATE_LIMIT_CONFIG.OTP_REQUEST.MAX_ATTEMPTS) {
              throw Object.assign(new Error('OTP request rate limit exceeded'), {
                code: 'RATE_LIMIT_EXCEEDED',
              })
            }

            // Supersede all previous unconsumed challenges before delivery.
            // This includes stale PENDING records from an interrupted request.
            await tx.otpChallenge.updateMany({
              where: {
                phone: normalizedPhone,
                purpose,
                consumedAt: null,
              },
              data: { consumedAt: now },
            })

            const challenge = await tx.otpChallenge.create({
              data: {
                id: randomUUID(),
                phone: normalizedPhone,
                purpose,
                codeHash,
                expiresAt,
                attempts: 0,
                deliveryStatus: OtpDeliveryStatus.PENDING,
                requestedByUserId: requesterUserId,
              },
              select: { id: true, expiresAt: true },
            })

            return { kind: 'created', id: challenge.id, expiresAt: challenge.expiresAt }
          },
          { isolationLevel: 'Serializable', timeout: 10_000 }
        )
        break
      } catch (error) {
        const isSerializationConflict =
          error && typeof error === 'object' && 'code' in error && error.code === 'P2034'
        if (!isSerializationConflict || attempt === MAX_TRANSACTION_RETRIES - 1) throw error
        await new Promise((resolve) =>
          setTimeout(resolve, BASE_RETRY_DELAY_MS * Math.pow(2, attempt))
        )
      }
    }

    if (!prepared) {
      return errorResponse('INTERNAL_ERROR', 'Внутренняя ошибка сервера', 500)
    }

    if (prepared.kind === 'pending') {
      return errorResponse(
        OTP_ERRORS.REQUEST_IN_PROGRESS.code,
        OTP_ERRORS.REQUEST_IN_PROGRESS.message,
        OTP_ERRORS.REQUEST_IN_PROGRESS.statusCode,
        { retryAfterSeconds: prepared.retryAfterSeconds ?? RATE_LIMIT_CONFIG.OTP_REQUEST.RESEND_COOLDOWN_SECONDS }
      )
    }

    if (prepared.kind === 'accepted') {
      writeSecurityAuditEvent({
        eventType: 'OTP_REQUEST', result: 'success', request,
        userId: requesterUserId ?? undefined, reason: 'challenge_reused', statusCode: 200,
      })
      return NextResponse.json(
        { challengeId: prepared.id, expiresAt: prepared.expiresAt.toISOString() },
        { status: 200 }
      )
    }

    try {
      await sendOtpSms(smsProvider, {
        challengeId: prepared.id,
        to: normalizedPhone,
        code: otpCode,
        purpose,
        expiresAt: prepared.expiresAt,
      })
    } catch (error) {
      const certainty = error instanceof SmsProviderError ? error.certainty : 'unknown'
      const failedAt = new Date()
      await prisma.$transaction((tx) => tx.otpChallenge.updateMany({
        where: {
          id: prepared.id,
          deliveryStatus: OtpDeliveryStatus.PENDING,
          consumedAt: null,
        },
        data: {
          deliveryStatus:
            certainty === 'rejected' ? OtpDeliveryStatus.FAILED : OtpDeliveryStatus.UNKNOWN,
          consumedAt: failedAt,
        },
      }))
      writeSecurityAuditEvent({
        eventType: 'OTP_REQUEST', result: 'failure', request,
        userId: requesterUserId ?? undefined,
        reason: certainty === 'rejected' ? 'sms_delivery_rejected' : 'sms_delivery_unknown',
        statusCode: 502,
      })
      return errorResponse(
        OTP_ERRORS.SMS_DELIVERY_FAILED.code,
        OTP_ERRORS.SMS_DELIVERY_FAILED.message,
        OTP_ERRORS.SMS_DELIVERY_FAILED.statusCode
      )
    }

    const activated = await prisma.$transaction((tx) => tx.otpChallenge.updateMany({
      where: {
        id: prepared.id,
        deliveryStatus: OtpDeliveryStatus.PENDING,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { deliveryStatus: OtpDeliveryStatus.ACCEPTED },
    }))
    if (activated.count !== 1) {
      writeSecurityAuditEvent({
        eventType: 'OTP_REQUEST', result: 'denied', request,
        userId: requesterUserId ?? undefined, reason: 'challenge_superseded', statusCode: 409,
      })
      return errorResponse('OTP_REQUEST_SUPERSEDED', 'Запрос кода заменён новым', 409)
    }

    writeSecurityAuditEvent({
      eventType: 'OTP_REQUEST', result: 'success', request,
      userId: requesterUserId ?? undefined, reason: 'sms_accepted', statusCode: 200,
    })
    return NextResponse.json(
      { challengeId: prepared.id, expiresAt: prepared.expiresAt.toISOString() },
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

    if (error && typeof error === 'object' && 'code' in error) {
      const authError = error as { code: string; message?: string; statusCode?: number }
      if (authError.code === 'RATE_LIMIT_EXCEEDED') {
        writeSecurityAuditEvent({
          eventType: 'OTP_REQUEST', result: 'denied', request,
          reason: 'otp_request_rate_limit', statusCode: 429,
        })
        writeSecurityAuditEvent({
          eventType: 'RATE_LIMIT_EXCEEDED', result: 'denied', request,
          reason: 'otp_phone_limit', statusCode: 429,
        })
        return errorResponse(
          OTP_ERRORS.RATE_LIMIT_EXCEEDED.code,
          OTP_ERRORS.RATE_LIMIT_EXCEEDED.message,
          OTP_ERRORS.RATE_LIMIT_EXCEEDED.statusCode,
          { retryAfter: '15 minutes' }
        )
      }
    }

    writeSecurityAuditEvent({
      eventType: 'API_ERROR', result: 'error', request,
      reason: 'otp_request_failure', statusCode: 500,
    })
    return errorResponse('INTERNAL_ERROR', 'Внутренняя ошибка сервера', 500)
  }
}

