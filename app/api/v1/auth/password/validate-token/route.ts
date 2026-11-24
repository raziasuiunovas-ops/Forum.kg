/**
 * POST /api/v1/auth/password/validate-token
 * Validate a password reset token without consuming it
 * Body: { token: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validatePasswordResetToken } from '@/lib/auth/password-reset'

const validateTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
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

  const parsed = validateTokenSchema.safeParse(body)
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Токен обязателен', 422)
  }

  try {
    const userId = await validatePasswordResetToken(parsed.data.token)

    if (!userId) {
      return error(
        'INVALID_TOKEN',
        'Недействительная или истекшая ссылка для восстановления пароля',
        400
      )
    }

    return NextResponse.json(
      {
        valid: true,
        message: 'Токен действителен',
      },
      { status: 200 }
    )
  } catch (e) {
    console.error('[Validate Token] Unexpected error:', e)
    return error('INTERNAL_ERROR', 'Внутренняя ошибка сервера', 500)
  }
}
