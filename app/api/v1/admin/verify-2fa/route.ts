/**
 * Admin 2FA Verification API - Step 2: Verify Code and Create Session
 * POST /api/v1/admin/verify-2fa
 * 
 * Verifies 2FA code and creates admin session with JWT tokens
 * Returns access token (session cookie) and refresh token
 * 
 * Security:
 * - CSRF protection via middleware
 * - One-time use codes (deleted after verification)
 * - 5-minute code expiry
 * - 3 verification attempts per code
 * - Creates session with SUPER_ADMIN role
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { Admin2FAService } from '@/lib/services/admin-2fa.service'
import { SessionService } from '@/lib/services/session.service'
import { createAccessToken } from '@/lib/auth/session'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'
import { UserRole, UserStatus } from '@prisma/client'

/**
 * Request body schema
 */
interface VerifyRequest {
  pendingToken: string
  code: string
}

/**
 * Get or create admin user in database
 * Admin user is identified by ADMIN_LOGIN from environment
 */
async function getOrCreateAdminUser(username: string) {
  const ADMIN_LOGIN = process.env.ADMIN_LOGIN

  // Find user by admin login (stored in email field as unique identifier)
  // Admin users don't have phone/email verification requirements
  let adminUser = await prisma.user.findFirst({
    where: {
      email: `${ADMIN_LOGIN}@admin.forum.kg`,
      role: UserRole.SUPER_ADMIN,
    },
  })

  // Create admin user if doesn't exist
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: `${ADMIN_LOGIN}@admin.forum.kg`,
        firstName: 'Admin',
        lastName: 'System',
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        preferredLocale: 'RU',
      },
    })
  }

  // Ensure admin user is active
  if (adminUser.status !== UserStatus.ACTIVE) {
    throw new Error('ADMIN_ACCOUNT_SUSPENDED')
  }

  return adminUser
}

/**
 * POST /api/v1/admin/verify-2fa
 * Step 2: Verify 2FA code and create admin session
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: VerifyRequest
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

    const { pendingToken, code } = body

    // Validate input
    if (!pendingToken || typeof pendingToken !== 'string') {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'pendingToken обязателен',
          },
        },
        { status: 400 }
      )
    }

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Код подтверждения обязателен',
          },
        },
        { status: 400 }
      )
    }

    // Verify 2FA code
    const verifyResult = Admin2FAService.verifyCode(pendingToken, code)

    if (!verifyResult.success) {
      // Map error codes to user-friendly messages
      const errorMessages = {
        INVALID_TOKEN: 'Недействительный токен или сессия истекла',
        CODE_EXPIRED: 'Код подтверждения истёк',
        INVALID_CODE: 'Неверный код подтверждения',
        TOO_MANY_ATTEMPTS: 'Слишком много неверных попыток',
      }

      writeSecurityAuditEvent({
        eventType: 'AUTH_FAILURE',
        result: 'denied',
        request,
        reason: `2fa_verification_failed_${verifyResult.error}`,
        statusCode: 401,
      })

      return NextResponse.json(
        {
          error: {
            code: verifyResult.error,
            message: errorMessages[verifyResult.error!] || 'Ошибка проверки кода',
          },
        },
        { status: 401 }
      )
    }

    // Get or create admin user
    let adminUser
    try {
      adminUser = await getOrCreateAdminUser(verifyResult.username!)
    } catch (error) {
      if (error instanceof Error && error.message === 'ADMIN_ACCOUNT_SUSPENDED') {
        writeSecurityAuditEvent({
          eventType: 'ACCESS_DENIED',
          result: 'denied',
          request,
          reason: 'admin_account_suspended',
          statusCode: 403,
        })

        return NextResponse.json(
          {
            error: {
              code: 'ACCOUNT_SUSPENDED',
              message: 'Аккаунт администратора заблокирован',
            },
          },
          { status: 403 }
        )
      }

      throw error
    }

    // Extract metadata for session
    const userAgent = request.headers.get('user-agent') || undefined
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      undefined

    // Create session
    const sessionData = await SessionService.createSession(adminUser.id, {
      userAgent,
      ipAddress,
    })

    // Create access token
    const accessToken = createAccessToken(
      {
        id: adminUser.id,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        phone: adminUser.phone,
        phoneVerifiedAt: adminUser.phoneVerifiedAt,
        email: adminUser.email,
        role: adminUser.role,
        status: adminUser.status,
        preferredLocale: adminUser.preferredLocale,
        createdAt: adminUser.createdAt,
      },
      sessionData.sessionId
    )

    // Set cookies
    const cookieStore = await cookies()
    const isProduction = process.env.NODE_ENV === 'production'

    // Set access token cookie (session)
    cookieStore.set('session', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60, // 15 minutes
    })

    // Set refresh token cookie
    cookieStore.set('refresh', sessionData.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    })

    writeSecurityAuditEvent({
      eventType: 'AUTH_SUCCESS',
      result: 'success',
      request,
      userId: adminUser.id,
      reason: '2fa_verified_session_created',
      statusCode: 200,
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Аутентификация успешна',
        data: {
          user: {
            id: adminUser.id,
            email: adminUser.email,
            role: adminUser.role,
            firstName: adminUser.firstName,
            lastName: adminUser.lastName,
          },
          session: {
            expiresAt: sessionData.expiresAt,
          },
        },
      },
      { status: 200 }
    )
  } catch (error) {
    writeSecurityAuditEvent({
      eventType: 'API_ERROR',
      result: 'error',
      request,
      reason: 'admin_verify_2fa_exception',
      statusCode: 500,
    })

    console.error('Admin verify 2FA error:', error)

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
