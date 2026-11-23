/**
 * POST /api/v1/auth/email/login
 * Sign in with email + password.
 * Body: { email, password }
 */
import { NextRequest, NextResponse } from 'next/server'
import { UserStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { randomBytes } from 'node:crypto'
import { hashPassword, normalizeEmail, verifyPassword } from '@/lib/auth/password'
import { describeAuthError, loginEmailSchema, publicUser, startSession } from '@/lib/auth/email-auth'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

// A real bcrypt hash of a random value, created once per server instance. It is compared when the
// account does not exist so "unknown email" and "wrong password" take the same time
// (prevents user enumeration by response timing).
let dummyHash: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
  return dummyHash
}

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

  const parsed = loginEmailSchema.safeParse(body)
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Ошибка валидации данных', 422)
  }

  const email = normalizeEmail(parsed.data.email)

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await getDummyHash()))

    if (!user || !user.passwordHash || !ok) {
      writeSecurityAuditEvent({
        eventType: 'AUTH_FAILURE',
        result: 'denied',
        request,
        reason: 'invalid_credentials',
        statusCode: 401,
      })
      return error('INVALID_CREDENTIALS', 'Неверный email или пароль', 401)
    }

    if (user.status === UserStatus.SUSPENDED) {
      return error('ACCOUNT_SUSPENDED', 'Аккаунт заблокирован', 403)
    }

    await startSession(user, request)

    writeSecurityAuditEvent({
      eventType: 'AUTH_SUCCESS',
      result: 'success',
      request,
      userId: user.id,
      reason: 'email_login',
      statusCode: 200,
    })

    return NextResponse.json({ success: true, user: publicUser(user) }, { status: 200 })
  } catch (e) {
    const code = describeAuthError(e, 'auth/email/login')
    writeSecurityAuditEvent({
      eventType: 'API_ERROR',
      result: 'error',
      request,
      reason: 'email_login_failure',
      statusCode: 500,
    })
    return error(code, 'Внутренняя ошибка сервера', 500)
  }
}
