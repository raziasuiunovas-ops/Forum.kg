import { NextRequest, NextResponse } from 'next/server'
import { ForumStatus, Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'
import { conflict, notFound, validateBody, withErrorHandler } from '@/lib/api'
import { uuidSchema } from '@/lib/api/schemas/common'
import { eventRegistrationSchema } from '@/lib/api/schemas/event'
import { requireAuth } from '@/lib/auth/middleware'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'
import { countOccupiedSeats, lockEventRow } from '@/lib/api/events'

type RegistrationRouteContext = { params: Promise<{ id: string }> }

class EventFullError extends Error {}
class RegistrationClosedError extends Error {}

export const POST = withErrorHandler(async (
  request: NextRequest,
  context: RegistrationRouteContext
) => {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const { id } = await context.params
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return notFound('Событие', 'EVENT_NOT_FOUND')
  const input = await validateBody(request, eventRegistrationSchema)
  const now = new Date()

  try {
    const registration = await prisma.$transaction(async (tx) => {
      await lockEventRow(tx, parsedId.data)
      const event = await tx.forum.findUnique({
        where: { id: parsedId.data },
        select: {
          id: true,
          status: true,
          startsAt: true,
          registrationDeadline: true,
          capacity: true,
        },
      })
      if (!event) return null
      if (
        event.status !== ForumStatus.PUBLISHED ||
        event.startsAt <= now ||
        (event.registrationDeadline !== null && event.registrationDeadline <= now)
      ) {
        throw new RegistrationClosedError()
      }

      const existing = await tx.eventRegistration.findUnique({
        where: { forumId_userId: { forumId: event.id, userId: authResult.user.userId } },
        select: { id: true },
      })
      if (existing) return { duplicate: true as const }

      const occupied = await countOccupiedSeats(tx, event.id, now)
      if (occupied >= event.capacity) throw new EventFullError()

      return tx.eventRegistration.create({
        data: {
          id: randomUUID(),
          forumId: event.id,
          userId: authResult.user.userId,
          attendeeFirstName: input.attendeeFirstName,
          attendeeLastName: input.attendeeLastName,
          attendeePhone: input.attendeePhone,
          attendeeEmail: input.attendeeEmail,
          additionalInfo: input.additionalInfo,
        },
        select: {
          id: true,
          attendeeFirstName: true,
          attendeeLastName: true,
          attendeePhone: true,
          attendeeEmail: true,
          additionalInfo: true,
          createdAt: true,
        },
      })
    })

    if (!registration) return notFound('Событие', 'EVENT_NOT_FOUND')
    if ('duplicate' in registration) return conflict('Вы уже зарегистрированы на это событие', 'ALREADY_REGISTERED')

    writeSecurityAuditEvent({
      eventType: 'EVENT_REGISTERED',
      result: 'success',
      request,
      userId: authResult.user.userId,
      reason: 'event_rsvp_created',
      statusCode: 201,
    })
    return NextResponse.json({ registration }, { status: 201 })
  } catch (cause) {
    if (cause instanceof EventFullError) {
      return conflict('Свободных мест на событии больше нет', 'EVENT_CAPACITY_EXCEEDED')
    }
    if (cause instanceof RegistrationClosedError) {
      return conflict('Регистрация на событие закрыта', 'REGISTRATION_CLOSED')
    }
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
      return conflict('Вы уже зарегистрированы на это событие', 'ALREADY_REGISTERED')
    }
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2034') {
      return conflict('Регистрация изменилась одновременно с запросом. Повторите попытку', 'CONCURRENT_MODIFICATION')
    }
    throw cause
  }
})

export const DELETE = withErrorHandler(async (
  request: NextRequest,
  context: RegistrationRouteContext
) => {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const { id } = await context.params
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return notFound('Событие', 'EVENT_NOT_FOUND')

  const removed = await prisma.$transaction(async (tx) => {
    await lockEventRow(tx, parsedId.data)
    const event = await tx.forum.findUnique({ where: { id: parsedId.data }, select: { id: true } })
    if (!event) return 'event_missing' as const
    const result = await tx.eventRegistration.deleteMany({
      where: { forumId: event.id, userId: authResult.user.userId },
    })
    return result.count > 0 ? 'removed' as const : 'registration_missing' as const
  })

  if (removed === 'event_missing') return notFound('Событие', 'EVENT_NOT_FOUND')
  if (removed === 'registration_missing') return notFound('Регистрация', 'REGISTRATION_NOT_FOUND')

  writeSecurityAuditEvent({
    eventType: 'EVENT_REGISTRATION_CANCELLED',
    result: 'success',
    request,
    userId: authResult.user.userId,
    reason: 'event_rsvp_cancelled',
    statusCode: 200,
  })
  return NextResponse.json({ success: true }, { status: 200 })
})
