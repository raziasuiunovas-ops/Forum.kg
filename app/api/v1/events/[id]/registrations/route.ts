import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calculatePagination, notFound, withErrorHandler } from '@/lib/api'
import { parsePaginationParams, uuidSchema } from '@/lib/api/schemas/common'
import { requireManager } from '@/lib/auth/middleware'

type RegistrationsRouteContext = { params: Promise<{ id: string }> }

export const GET = withErrorHandler(async (
  request: NextRequest,
  context: RegistrationsRouteContext
) => {
  const authResult = await requireManager(request)
  if (authResult instanceof NextResponse) return authResult

  const { id } = await context.params
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return notFound('Событие', 'EVENT_NOT_FOUND')

  const event = await prisma.forum.findUnique({ where: { id: parsedId.data }, select: { id: true } })
  if (!event) return notFound('Событие', 'EVENT_NOT_FOUND')

  const pagination = parsePaginationParams(new URL(request.url).searchParams)
  const where = { forumId: event.id }
  const [registrations, total] = await Promise.all([
    prisma.eventRegistration.findMany({
      where,
      select: {
        id: true,
        attendeeFirstName: true,
        attendeeLastName: true,
        attendeePhone: true,
        attendeeEmail: true,
        additionalInfo: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    }),
    prisma.eventRegistration.count({ where }),
  ])

  return NextResponse.json({
    registrations,
    pagination: calculatePagination(pagination.page, pagination.limit, total),
  }, { status: 200 })
})
