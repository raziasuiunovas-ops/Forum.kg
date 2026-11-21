/**
 * Auth Middleware Helpers
 * For protecting API endpoints with authentication and role-based access control
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentSession, createAuthError, AuthenticatedUser } from './index'
import { UserRole } from '@prisma/client'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

/**
 * Authenticated request context
 */
export interface AuthenticatedRequest extends NextRequest {
  user?: AuthenticatedUser
}

/**
 * Require authentication middleware
 * Returns user with FRESH role and status from database
 * JWT is used only for identity verification, not for RBAC
 * 
 * SECURITY: Validates session in database to ensure:
 * - Session exists and not revoked
 * - Session not expired
 * - Session belongs to correct user
 * - User not suspended
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ user: AuthenticatedUser } | NextResponse> {
  try {
    const session = await getCurrentSession()

    if (!session) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Требуется авторизация',
          },
        },
        { status: 401 }
      )
    }

    // CRITICAL: Validate session in database
    // This ensures immediate logout/revocation takes effect
    const dbSession = await prisma.session.findUnique({
      where: { id: session.sessionId },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        revokedReason: true,
        expiresAt: true,
      },
    })

    // Session not found in database
    if (!dbSession) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_TOKEN',
            message: 'Сессия не найдена',
          },
        },
        { status: 401 }
      )
    }

    // Session has been revoked (logout, logout-all, or reuse detection)
    if (dbSession.revokedAt) {
      return NextResponse.json(
        {
          error: {
            code: 'SESSION_REVOKED',
            message: 'Сессия отозвана',
            details: {
              reason: dbSession.revokedReason,
            },
          },
        },
        { status: 401 }
      )
    }

    // Session expired in database (should not happen if JWT is valid, but check anyway)
    if (dbSession.expiresAt < new Date()) {
      return NextResponse.json(
        {
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Сессия истекла',
          },
        },
        { status: 401 }
      )
    }

    // Session belongs to different user (should never happen, security check)
    if (dbSession.userId !== session.userId) {
      writeSecurityAuditEvent({
        eventType: 'SUSPICIOUS_REQUEST',
        result: 'denied',
        request,
        reason: 'session_user_mismatch',
        statusCode: 401,
      })
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_TOKEN',
            message: 'Недействительный токен',
          },
        },
        { status: 401 }
      )
    }

    // Fetch fresh user data from database
    // IMPORTANT: Do NOT trust role/status from JWT payload for RBAC
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        status: true,
        role: true,
      },
    })

    if (!user) {
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

    if (user.status === 'SUSPENDED') {
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

    // Return authenticated user with FRESH role and status from database
    return {
      user: {
        userId: user.id,
        role: user.role,
        status: user.status,
      },
    }
  } catch {
    writeSecurityAuditEvent({
      eventType: 'API_ERROR',
      result: 'error',
      request,
      reason: 'auth_middleware_failure',
      statusCode: 500,
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

/**
 * Require specific role(s) middleware
 * Returns user with fresh role from database
 * IMPORTANT: Uses actual role from database, NOT from JWT payload
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: UserRole[]
): Promise<{ user: AuthenticatedUser } | NextResponse> {
  // First check authentication and get fresh user data from DB
  const authResult = await requireAuth(request)

  // If auth failed, return the error response
  if (authResult instanceof NextResponse) {
    return authResult
  }

  // Check if user has required role (using FRESH role from database)
  const { user } = authResult

  if (!allowedRoles.includes(user.role)) {
    writeSecurityAuditEvent({
      eventType: 'ACCESS_DENIED',
      result: 'denied',
      request,
      userId: user.userId,
      reason: 'insufficient_role',
      statusCode: 403,
    })
    return NextResponse.json(
      {
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Недостаточно прав доступа',
          details: {
            required: allowedRoles,
            current: user.role,
          },
        },
      },
      { status: 403 }
    )
  }

  return { user }
}

/**
 * Role-specific middleware helpers
 */
export const requireUser = (request: NextRequest) =>
  requireAuth(request)

export const requireScanner = (request: NextRequest) =>
  requireRole(request, [UserRole.SCANNER, UserRole.MANAGER, UserRole.SUPER_ADMIN])

export const requireManager = (request: NextRequest) =>
  requireRole(request, [UserRole.MANAGER, UserRole.SUPER_ADMIN])

export const requireSuperAdmin = (request: NextRequest) =>
  requireRole(request, [UserRole.SUPER_ADMIN])

/**
 * Verify resource ownership
 * Use this in addition to requireAuth for endpoints that need ownership checks
 */
export async function verifyOwnership(
  userId: string,
  resourceUserId: string
): Promise<boolean> {
  return userId === resourceUserId
}

/**
 * Helper to extract and validate UUID from route params
 */
export function extractUuid(
  params: any,
  paramName: string
): string | NextResponse {
  const value = params?.[paramName]

  if (!value || typeof value !== 'string') {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_PARAMETER',
          message: `Параметр ${paramName} обязателен`,
        },
      },
      { status: 400 }
    )
  }

  // Basic UUID v4 validation
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  if (!uuidRegex.test(value)) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_PARAMETER',
          message: `Параметр ${paramName} должен быть UUID`,
        },
      },
      { status: 400 }
    )
  }

  return value
}

/**
 * Example usage in route handler:
 * 
 * export async function GET(request: NextRequest) {
 *   const authResult = await requireAuth(request)
 *   if (authResult instanceof NextResponse) return authResult
 *   
 *   const { user } = authResult
 *   // user.userId, user.role (FRESH from DB), user.status available here
 * }
 * 
 * export async function POST(request: NextRequest) {
 *   const authResult = await requireManager(request)
 *   if (authResult instanceof NextResponse) return authResult
 *   
 *   const { user } = authResult
 *   // Only users with current MANAGER or SUPER_ADMIN role can reach here
 *   // Role is verified against database, not JWT payload
 * }
 */
