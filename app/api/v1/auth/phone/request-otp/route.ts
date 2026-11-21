/**
 * POST /api/v1/auth/phone/request-otp
 * Request OTP code for phone verification
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  requestOtpSchema,
  validateRequestBody,
  formatValidationErrors,
  normalizePhone,
  generateOTP,
  hashPassword,
  OTP_CONFIG,
  createAuthError,
  VALIDATION_ERRORS,
  OTP_ERRORS,
} from '@/lib/auth'

export async function POST(request: NextRequest) {
  // Retry configuration for Serializable isolation conflicts
  const MAX_RETRIES = 3
  const BASE_DELAY_MS = 50

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await attemptOTPRequest(request)
    } catch (error) {
      // Check if error is retryable (Serialization Failure)
      const isPrismaSerializationError =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2034'

      if (isPrismaSerializationError && attempt < MAX_RETRIES - 1) {
        // Exponential backoff before retry
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        continue
      }

      // Non-retryable error or max retries reached - rethrow
      throw error
    }
  }

  // Should never reach here, but TypeScript needs return
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

async function attemptOTPRequest(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json()
    const validation = validateRequestBody(requestOtpSchema, body)

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

    const { phone, purpose } = validation.data

    // Normalize phone number to E.164 format
    const normalizedPhone = normalizePhone(phone)
    if (!normalizedPhone) {
      return NextResponse.json(
        {
          error: {
            code: VALIDATION_ERRORS.INVALID_PHONE.code,
            message: VALIDATION_ERRORS.INVALID_PHONE.message,
          },
        },
        { status: 422 }
      )
    }

    // Use transaction with Serializable isolation to prevent race conditions:
    // 1. Check rate limiting (atomic with Serializable isolation)
    // 2. Invalidate previous active OTP challenges
    // 3. Create new OTP challenge
    const challenge = await prisma.$transaction(
      async (tx) => {
        // Rate limiting check: max 3 OTP requests per phone per 15 minutes
        // Serializable isolation ensures this count is atomic across concurrent requests
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
        const recentChallenges = await tx.otpChallenge.count({
          where: {
            phone: normalizedPhone,
            purpose,
            createdAt: {
              gte: fifteenMinutesAgo,
            },
          },
        })

        if (recentChallenges >= 3) {
          throw createAuthError('RATE_LIMIT_EXCEEDED')
        }

      // Generate OTP code
      const otpCode = generateOTP()

      // Hash OTP code before storing
      const codeHash = await hashPassword(otpCode)
      
      // TODO: Send OTP via SMS provider (in production)
      // For development, OTP codes are NOT logged for security
      // Use test accounts or check database directly if needed

      // Calculate expiry time
      const expiresAt = new Date(Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000)

      // Invalidate all previous active OTP challenges for this phone + purpose
      // Mark them as consumed to prevent reuse
      await tx.otpChallenge.updateMany({
        where: {
          phone: normalizedPhone,
          purpose,
          consumedAt: null, // Only invalidate non-consumed challenges
          expiresAt: {
            gte: new Date(), // Only invalidate non-expired challenges
          },
        },
        data: {
          consumedAt: new Date(), // Mark as consumed (invalidated)
        },
      })

      // Create new OTP challenge (now the only active one)
      const newChallenge = await tx.otpChallenge.create({
        data: {
          phone: normalizedPhone,
          purpose,
          codeHash,
          expiresAt,
          attempts: 0,
        },
      })

      return newChallenge
      },
      {
        isolationLevel: 'Serializable',
        timeout: 10000, // 10 seconds
      }
    )

    // Return challenge ID and expiry
    return NextResponse.json(
      {
        challengeId: challenge.id,
        expiresAt: challenge.expiresAt.toISOString(),
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error in request-otp:', error)

    // Handle rate limit error from transaction
    if (error && typeof error === 'object' && 'code' in error) {
      const authError = error as { code: string; message: string }
      if (authError.code === 'RATE_LIMIT_EXCEEDED') {
        return NextResponse.json(
          {
            error: {
              code: OTP_ERRORS.RATE_LIMIT_EXCEEDED.code,
              message: OTP_ERRORS.RATE_LIMIT_EXCEEDED.message,
              details: {
                retryAfter: '15 minutes',
              },
            },
          },
          { status: 429 }
        )
      }
    }

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
