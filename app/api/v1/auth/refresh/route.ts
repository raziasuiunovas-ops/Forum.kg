/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token with rotation and reuse detection
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import {
  createAccessToken,
  SessionUser,
  createAuthError,
  SESSION_CONFIG,
  AuthError,
} from '@/lib/auth'
import { SessionService } from '@/lib/services/session.service'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

export async function POST(request: NextRequest) {
  try {
    // Get refresh token from cookie
    const cookieStore = await cookies()
    const refreshCookie = cookieStore.get('refresh')

    if (!refreshCookie?.value) {
      writeSecurityAuditEvent({
        eventType: 'AUTH_FAILURE', result: 'failure', request,
        reason: 'missing_refresh_token', statusCode: 401,
      })
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Refresh token отсутствует',
          },
        },
        { status: 401 }
      )
    }

    // Extract session metadata
    const userAgent = request.headers.get('user-agent') || undefined
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined

    // Refresh session with rotation and reuse detection
    let sessionData
    try {
      sessionData = await SessionService.refreshSession(refreshCookie.value, {
        userAgent,
        ipAddress,
      })
    } catch (error) {
      // Handle auth errors
      if (error instanceof AuthError) {
        if (error.details?.reason === 'token_reuse_detected') {
          writeSecurityAuditEvent({
            eventType: 'REFRESH_TOKEN_REUSE', result: 'denied', request,
            reason: 'token_reuse_detected', statusCode: error.statusCode,
          })
        }
        writeSecurityAuditEvent({
          eventType: 'AUTH_FAILURE', result: 'failure', request,
          reason: error.details?.reason === 'token_reuse_detected'
            ? 'token_reuse_detected'
            : 'refresh_rejected',
          statusCode: error.statusCode,
        })
        // Clear cookies on token errors
        cookieStore.delete('session')
        cookieStore.delete({
          name: 'refresh',
          path: '/api/v1/auth',
        })

        return NextResponse.json(
          {
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          },
          { status: error.statusCode }
        )
      }
      throw error
    }

    // Fetch user from database to create access token
    const user = await prisma.user.findUnique({
      where: { id: sessionData.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        phoneVerifiedAt: true,
        email: true,
        role: true,
        status: true,
        preferredLocale: true,
        createdAt: true,
      },
    })

    if (!user) {
      writeSecurityAuditEvent({
        eventType: 'AUTH_FAILURE', result: 'failure', request,
        reason: 'refresh_user_not_found', statusCode: 401,
      })
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_TOKEN',
            message: 'Пользователь не найден',
          },
        },
        { status: 401 }
      )
    }

    // Check if user is suspended
    if (user.status === 'SUSPENDED') {
      writeSecurityAuditEvent({
        eventType: 'ACCESS_DENIED', result: 'denied', request,
        userId: user.id, reason: 'account_suspended', statusCode: 403,
      })
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

    // Create new access token
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

    // Set new cookies with rotated tokens
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

    writeSecurityAuditEvent({
      eventType: 'REFRESH_SUCCESS', result: 'success', request,
      userId: user.id, reason: 'refresh_rotated', statusCode: 200,
    })

    return NextResponse.json(
      {
        success: true,
      },
      { status: 200 }
    )
  } catch {
    writeSecurityAuditEvent({
      eventType: 'API_ERROR', result: 'error', request,
      reason: 'refresh_api_failure', statusCode: 500,
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
