/**
 * POST /api/v1/auth/email/register
 * Create an account with email + password and sign the user in.
 * Body: { firstName, lastName, email, password, preferredLocale? }
 *
 * Note: the phone number must still be verified before buying tickets (spec 10.1).
 */
import { NextRequest, NextResponse } from 'next/server'
import { Prisma, UserRole, UserStatus, Locale } from '@prisma/client'
import { prisma } from '@/lib/db'
import { hashPassword, normalizeEmail } from '@/lib/auth/password'
import { describeAuthError, publicUser, registerEmailSchema, startSession } from '@/lib/auth/email-auth'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

function error(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status })
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return error('INVALID_REQUEST', 'Неверный формат запроса', 400)
  }

  const parsed = registerEmailSchema.safeParse(body)
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.'))
    return error('VALIDATION_ERROR', 'Ошибка валидации данных', 422, { fields })
  }

  const { firstName, lastName, password, preferredLocale } = parsed.data
  const email = normalizeEmail(parsed.data.email)

  try {
    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        preferredLocale: (preferredLocale as Locale | undefined) ?? Locale.RU,
      },
    })

    await startSession(user, request)

    writeSecurityAuditEvent({
      eventType: 'AUTH_SUCCESS',
      result: 'success',
      request,
      userId: user.id,
      reason: 'email_register',
      statusCode: 201,
    })

    return NextResponse.json({ success: true, user: publicUser(user) }, { status: 201 })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return error('EMAIL_TAKEN', 'Аккаунт с таким email уже существует', 409)
    }
    const code = describeAuthError(e, 'auth/email/register')
    writeSecurityAuditEvent({
      eventType: 'API_ERROR',
      result: 'error',
      request,
      reason: 'email_register_failure',
      statusCode: 500,
    })
    return error(code, 'Внутренняя ошибка сервера', 500)
  }
}
