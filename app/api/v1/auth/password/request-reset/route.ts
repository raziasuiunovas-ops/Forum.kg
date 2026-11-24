/**
 * POST /api/v1/auth/password/request-reset
 * Request a password reset email
 * Body: { email: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { normalizeEmail } from '@/lib/auth/password'
import { createPasswordResetToken } from '@/lib/auth/password-reset'
import { checkPasswordResetRateLimit } from '@/lib/auth/password-reset-rate-limit'
import { sendPasswordResetEmail } from '@/lib/services/email.service'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

const requestResetSchema = z.object({
  email: z.string().email('Invalid email format'),
})

function error(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status })
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return error('INVALID_REQUEST', 'Неверный формат запроса', 400)
  }

  const parsed = requestResetSchema.safeParse(body)
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Неверный формат email', 422)
  }

  const email = normalizeEmail(parsed.data.email)

  try {
    // Check rate limits
    const rateLimitCheck = await checkPasswordResetRateLimit(request, email)

    if (!rateLimitCheck.allowed) {
      writeSecurityAuditEvent({
        eventType: 'RATE_LIMIT_EXCEEDED',
        result: 'denied',
        request,
        reason: `password_reset_${rateLimitCheck.reason}`,
        statusCode: 429,
      })

      const response = error(
        'RATE_LIMIT_EXCEEDED',
        'Слишком много запросов. Пожалуйста, попробуйте позже.',
        429
      )

      if (rateLimitCheck.retryAfterSeconds) {
        response.headers.set('Retry-After', rateLimitCheck.retryAfterSeconds.toString())
      }

      return response
    }

    // Find user by email (only if they have a password - no password reset for OAuth-only accounts)
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
        preferredLocale: true,
      },
    })

    // IMPORTANT: Always return success response even if user doesn't exist
    // This prevents user enumeration attacks
    if (!user || !user.passwordHash) {
      // Log the attempt but don't reveal that the email doesn't exist
      writeSecurityAuditEvent({
        eventType: 'PASSWORD_RESET_REQUEST',
        result: 'success',
        request,
        reason: 'nonexistent_or_oauth_account',
        statusCode: 200,
      })

      // Return success to prevent user enumeration
      return NextResponse.json(
        {
          success: true,
          message: 'Если аккаунт с таким email существует, мы отправили инструкции по восстановлению пароля.',
        },
        { status: 200 }
      )
    }

    // Check if user is suspended
    if (user.status === 'SUSPENDED') {
      writeSecurityAuditEvent({
        eventType: 'PASSWORD_RESET_REQUEST',
        result: 'denied',
        request,
        userId: user.id,
        reason: 'account_suspended',
        statusCode: 200,
      })

      // Still return success to prevent user enumeration
      return NextResponse.json(
        {
          success: true,
          message: 'Если аккаунт с таким email существует, мы отправили инструкции по восстановлению пароля.',
        },
        { status: 200 }
      )
    }

    // Generate reset token
    const resetToken = await createPasswordResetToken(user.id)

    // Send reset email
    const emailResult = await sendPasswordResetEmail(
      user.email!,
      resetToken,
      user.preferredLocale?.toLowerCase() || 'ru'
    )

    if (!emailResult.success) {
      console.error('[Password Reset] Failed to send email:', emailResult.error)
      
      // In development, still log the link even if email fails
      if (process.env.NODE_ENV === 'development') {
        console.log('\n=== PASSWORD RESET LINK (EMAIL FAILED, DEV MODE) ===')
        console.log('Email:', user.email)
        console.log('Token:', resetToken)
        console.log('Error:', emailResult.error)
        console.log('====================================================\n')
        
        // Return success in development for testing
        writeSecurityAuditEvent({
          eventType: 'PASSWORD_RESET_REQUEST',
          result: 'success',
          request,
          userId: user.id,
          reason: 'dev_mode_email_failed_but_logged',
          statusCode: 200,
        })
        
        return NextResponse.json(
          {
            success: true,
            message: 'Если аккаунт с таким email существует, мы отправили инструкции по восстановлению пароля.',
          },
          { status: 200 }
        )
      }
      
      writeSecurityAuditEvent({
        eventType: 'API_ERROR',
        result: 'error',
        request,
        userId: user.id,
        reason: 'email_send_failure',
        statusCode: 500,
      })

      return error(
        'EMAIL_SEND_FAILED',
        'Не удалось отправить письмо. Пожалуйста, попробуйте позже.',
        500
      )
    }

    writeSecurityAuditEvent({
      eventType: 'PASSWORD_RESET_REQUEST',
      result: 'success',
      request,
      userId: user.id,
      reason: 'email_sent',
      statusCode: 200,
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Если аккаунт с таким email существует, мы отправили инструкции по восстановлению пароля.',
      },
      { status: 200 }
    )
  } catch (e) {
    console.error('[Password Reset] Unexpected error:', e)

    writeSecurityAuditEvent({
      eventType: 'API_ERROR',
      result: 'error',
      request,
      reason: 'password_reset_request_failure',
      statusCode: 500,
    })

    return error('INTERNAL_ERROR', 'Внутренняя ошибка сервера', 500)
  }
}
