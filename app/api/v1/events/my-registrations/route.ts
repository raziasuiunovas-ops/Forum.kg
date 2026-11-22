import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calculatePagination, withErrorHandler } from '@/lib/api'
import { parsePaginationParams } from '@/lib/api/schemas/common'
import { requireAuth } from '@/lib/auth/middleware'
import { publicEventSelect, toEventDto } from '@/lib/api/events'

/**
 * GET /api/v1/events/my-registrations
 * Returns authenticated user's event registrations with event details
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const pagination = parsePaginationParams(new URL(request.url).searchParams)
  const where = { userId: authResult.user.userId }

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
        forum: { select: publicEventSelect },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    }),
    prisma.eventRegistration.count({ where }),
  ])

  return NextResponse.json({
    registrations: registrations.map((registration) => ({
      id: registration.id,
      attendeeFirstName: registration.attendeeFirstName,
      attendeeLastName: registration.attendeeLastName,
      attendeePhone: registration.attendeePhone,
      attendeeEmail: registration.attendeeEmail,
      additionalInfo: registration.additionalInfo,
      createdAt: registration.createdAt,
      event: toEventDto(registration.forum),
    })),
    pagination: calculatePagination(pagination.page, pagination.limit, total),
  }, { status: 200 })
})
