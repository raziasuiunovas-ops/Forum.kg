/**
 * POST /api/v1/auth/password/reset
 * Reset password using a valid token
 * Body: { token: string, password: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/auth/password'
import { consumePasswordResetToken } from '@/lib/auth/password-reset'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

// Same password policy as registration: 8-72 chars, at least one letter and one digit
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .refine(
      (p) => /[A-Za-zА-Яа-яЁёҐґЄєІіЇї]/.test(p) && /\d/.test(p),
      'Password must contain at least one letter and one digit'
    ),
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

  const parsed = resetPasswordSchema.safeParse(body)
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]
    return error('VALIDATION_ERROR', firstError.message, 422)
  }

  const { token, password } = parsed.data

  try {
    // Atomically consume the token (marks as used and validates in one operation)
    const userId = await consumePasswordResetToken(token)

    if (!userId) {
      writeSecurityAuditEvent({
        eventType: 'PASSWORD_RESET_ATTEMPT',
        result: 'denied',
        request,
        reason: 'invalid_or_expired_token',
        statusCode: 400,
      })

      return error(
        'INVALID_TOKEN',
        'Недействительная или истекшая ссылка для восстановления пароля',
        400
      )
    }

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        status: true,
      },
    })

    if (!user) {
      return error('USER_NOT_FOUND', 'Пользователь не найден', 404)
    }

    if (user.status === 'SUSPENDED') {
      writeSecurityAuditEvent({
        eventType: 'PASSWORD_RESET_ATTEMPT',
        result: 'denied',
        request,
        userId: user.id,
        reason: 'account_suspended',
        statusCode: 403,
      })

      return error('ACCOUNT_SUSPENDED', 'Аккаунт заблокирован', 403)
    }

    // Hash the new password
    const passwordHash = await hashPassword(password)

    // Update password and revoke all sessions in a transaction
    await prisma.$transaction(async (tx) => {
      // Update password
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          updatedAt: new Date(),
        },
      })

      // Revoke all active sessions for security
      await tx.session.updateMany({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          revokedAt: new Date(),
          revokedReason: 'PASSWORD_RESET',
        },
      })
    })

    writeSecurityAuditEvent({
      eventType: 'PASSWORD_RESET_SUCCESS',
      result: 'success',
      request,
      userId: user.id,
      reason: 'password_updated_sessions_revoked',
      statusCode: 200,
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Пароль успешно изменен',
      },
      { status: 200 }
    )
  } catch (e) {
    console.error('[Password Reset] Unexpected error:', e)

    writeSecurityAuditEvent({
      eventType: 'API_ERROR',
      result: 'error',
      request,
      reason: 'password_reset_failure',
      statusCode: 500,
    })

    return error('INTERNAL_ERROR', 'Внутренняя ошибка сервера', 500)
  }
}
