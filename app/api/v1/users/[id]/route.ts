import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notFound, validationError, withErrorHandler } from '@/lib/api'
import { uuidSchema } from '@/lib/api/schemas/common'

type UserRouteContext = {
  params: Promise<{ id: string }>
}

/** GET /api/v1/users/[id] — return only fields intended for public display. */
export const GET = withErrorHandler(async (_request: NextRequest, context: UserRouteContext) => {
  const { id } = await context.params
  const parsedId = uuidSchema.safeParse(id)

  if (!parsedId.success) {
    return validationError('Неверный формат идентификатора пользователя')
  }

  const user = await prisma.user.findUnique({
    where: { id: parsedId.data },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  })

  if (!user) return notFound('Пользователь', 'USER_NOT_FOUND')

  return NextResponse.json({ user }, { status: 200 })
})
