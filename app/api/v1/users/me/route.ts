import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/db'
import { validateBody, withErrorHandler } from '@/lib/api'
import {
  updateOwnUserProfileSchema,
  type UpdateOwnUserProfileInput,
} from '@/lib/api/schemas/user'
import { requireAuth } from '@/lib/auth/middleware'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

const ownProfileSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  phoneVerifiedAt: true,
  email: true,
  role: true,
  status: true,
  preferredLocale: true,
  announcementsPushEnabled: true,
  createdAt: true,
  updatedAt: true,
} as const

/** GET /api/v1/users/me — return the authenticated user's safe profile. */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const user = await prisma.user.findUnique({
    where: { id: authResult.user.userId },
    select: ownProfileSelect,
  })

  if (!user) {
    return NextResponse.json(
      { error: { code: 'USER_NOT_FOUND', message: 'Пользователь не найден' } },
      { status: 404 }
    )
  }

  return NextResponse.json({ user }, { status: 200 })
})

/** PATCH /api/v1/users/me — update only allowlisted profile fields. */
export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  let updates: UpdateOwnUserProfileInput
  try {
    updates = await validateBody(request, updateOwnUserProfileSchema)
  } catch (error) {
    if (
      error instanceof ZodError &&
      error.issues.some((issue) => issue.code === 'unrecognized_keys')
    ) {
      // Do not include attempted field names or values in the audit record.
      writeSecurityAuditEvent({
        eventType: 'ACCESS_DENIED',
        result: 'denied',
        request,
        userId: authResult.user.userId,
        reason: 'protected_profile_field_attempt',
        statusCode: 422,
      })
    }
    throw error
  }

  const user = await prisma.user.update({
    where: { id: authResult.user.userId },
    data: updates,
    select: ownProfileSelect,
  })

  writeSecurityAuditEvent({
    eventType: 'USER_PROFILE_UPDATED',
    result: 'success',
    request,
    userId: authResult.user.userId,
    reason: 'self_profile_updated',
    statusCode: 200,
  })

  return NextResponse.json({ user }, { status: 200 })
})
