/**
 * Admin Login API - Step 1: Username/Password Verification
 * POST /api/v1/admin/login
 * 
 * Verifies admin credentials and sends 2FA code via Telegram
 * Returns pendingToken for verification step
 * 
 * Security:
 * - CSRF protection via middleware
 * - Rate limiting (3 attempts per 15 minutes)
 * - Bcrypt password verification
 * - Does not reveal if username or password is wrong
 * - Sends 6-digit code via Telegram
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Admin2FAService } from '@/lib/services/admin-2fa.service'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

/**
 * Admin credentials from environment
 */
const ADMIN_LOGIN = process.env.ADMIN_LOGIN
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH
const ADMIN_TELEGRAM_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID

// Validate configuration at module load
if (!ADMIN_LOGIN || !ADMIN_PASSWORD_HASH || !ADMIN_TELEGRAM_CHAT_ID) {
  console.error('⚠️  Admin 2FA credentials not fully configured in .env')
  console.error('   Required: ADMIN_LOGIN, ADMIN_PASSWORD_HASH, ADMIN_TELEGRAM_CHAT_ID')
}

/**
 * Request body schema
 */
interface LoginRequest {
  username: string
  password: string
}

/**
 * POST /api/v1/admin/login
 * Step 1: Verify credentials and send 2FA code
 */
export async function POST(request: NextRequest) {
  try {
    // Check configuration
    if (!ADMIN_LOGIN || !ADMIN_PASSWORD_HASH || !ADMIN_TELEGRAM_CHAT_ID) {
      writeSecurityAuditEvent({
        eventType: 'SUSPICIOUS_REQUEST',
        result: 'error',
        request,
        reason: 'admin_2fa_not_configured',
        statusCode: 500,
      })
      return NextResponse.json(
        {
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Аутентификация администратора не настроена',
          },
        },
        { status: 500 }
      )
    }

    // Parse request body
    let body: LoginRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Неверный формат запроса',
          },
        },
        { status: 400 }
      )
    }

    const { username, password } = body

    // Validate input
    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Логин обязателен',
          },
        },
        { status: 400 }
      )
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Пароль обязателен',
          },
        },
        { status: 400 }
      )
    }

    // Verify username (case-insensitive)
    if (username.toLowerCase() !== ADMIN_LOGIN.toLowerCase()) {
      writeSecurityAuditEvent({
        eventType: 'AUTH_FAILURE',
        result: 'denied',
        request,
        reason: 'invalid_credentials',
        statusCode: 401,
      })

      // Generic error message - don't reveal if username or password is wrong
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Неверный логин или пароль',
          },
        },
        { status: 401 }
      )
    }

    // Verify password with bcrypt
    const passwordMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH)

    if (!passwordMatch) {
      writeSecurityAuditEvent({
        eventType: 'AUTH_FAILURE',
        result: 'denied',
        request,
        reason: 'invalid_credentials',
        statusCode: 401,
      })

      // Generic error message - don't reveal if username or password is wrong
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Неверный логин или пароль',
          },
        },
        { status: 401 }
      )
    }

    // Create 2FA session and send code via Telegram
    try {
      const session = await Admin2FAService.createSession(
        username,
        ADMIN_TELEGRAM_CHAT_ID
      )

      writeSecurityAuditEvent({
        eventType: 'AUTH_SUCCESS',
        result: 'success',
        request,
        reason: 'admin_2fa_code_sent',
        statusCode: 200,
      })

      return NextResponse.json(
        {
          success: true,
          message: 'Код подтверждения отправлен в Telegram',
          data: {
            pendingToken: session.pendingToken,
            expiresInSeconds: session.expiresInSeconds,
          },
        },
        { status: 200 }
      )
    } catch (error) {
      // Handle rate limit
      if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
        writeSecurityAuditEvent({
          eventType: 'RATE_LIMIT_EXCEEDED',
          result: 'denied',
          request,
          reason: 'admin_login_rate_limit',
          statusCode: 429,
        })

        return NextResponse.json(
          {
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Слишком много попыток входа. Попробуйте через 15 минут',
            },
          },
          { status: 429 }
        )
      }

      // Handle Telegram send failure
      if (
        error instanceof Error &&
        error.message.startsWith('TELEGRAM_SEND_FAILED')
      ) {
        writeSecurityAuditEvent({
          eventType: 'API_ERROR',
          result: 'error',
          request,
          reason: 'telegram_send_failed',
          statusCode: 500,
        })

        return NextResponse.json(
          {
            error: {
              code: 'SERVICE_ERROR',
              message: 'Не удалось отправить код подтверждения',
            },
          },
          { status: 500 }
        )
      }

      throw error
    }
  } catch (error) {
    writeSecurityAuditEvent({
      eventType: 'API_ERROR',
      result: 'error',
      request,
      reason: 'admin_login_exception',
      statusCode: 500,
    })

    console.error('Admin login error:', error)

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
