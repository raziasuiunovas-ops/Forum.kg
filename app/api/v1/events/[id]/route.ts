import { NextRequest, NextResponse } from 'next/server'
import { ForumStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { conflict, notFound, validateBody, validationError, withErrorHandler } from '@/lib/api'
import { updateEventSchema } from '@/lib/api/schemas/event'
import { uuidSchema } from '@/lib/api/schemas/common'
import { requireManager } from '@/lib/auth/middleware'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'
import {
  categoryCreateData,
  countOccupiedSeats,
  lockEventRow,
  publicEventSelect,
  toEventDto,
} from '@/lib/api/events'
import { revalidatePublicForums } from '@/lib/forums/revalidate'

type EventRouteContext = { params: Promise<{ id: string }> }

class EventCapacityError extends Error {}
class ImmutableEventCategoriesError extends Error {}
class EventCancelledError extends Error {}

async function getId(context: EventRouteContext): Promise<string | NextResponse> {
  const { id } = await context.params
  const result = uuidSchema.safeParse(id)
  return result.success ? result.data : validationError('Неверный идентификатор события')
}

export const GET = withErrorHandler(async (request: NextRequest, context: EventRouteContext) => {
  const id = await getId(context)
  if (id instanceof NextResponse) return id

  const event = await prisma.forum.findUnique({ where: { id }, select: publicEventSelect })
  if (!event) return notFound('Событие', 'EVENT_NOT_FOUND')

  if (event.status !== ForumStatus.PUBLISHED) {
    const authResult = await requireManager(request)
    if (authResult instanceof NextResponse) return notFound('Событие', 'EVENT_NOT_FOUND')
  }

  return NextResponse.json({ event: toEventDto(event) }, { status: 200 })
})

export const PATCH = withErrorHandler(async (request: NextRequest, context: EventRouteContext) => {
  const authResult = await requireManager(request)
  if (authResult instanceof NextResponse) return authResult
  const id = await getId(context)
  if (id instanceof NextResponse) return id

  const input = await validateBody(request, updateEventSchema)
  try {
    const event = await prisma.$transaction(async (tx) => {
      await lockEventRow(tx, id)
      const current = await tx.forum.findUnique({
        where: { id },
        include: {
          translations: true,
          categories: { include: { translations: true } },
        },
      })
      if (!current) return null
      if (current.status === ForumStatus.CANCELLED) throw new EventCancelledError()

      const startsAt = input.startTime ? new Date(input.startTime) : current.startsAt
      const endsAt = input.endTime ? new Date(input.endTime) : current.endsAt
      if (endsAt && endsAt <= startsAt) {
        return validationError('Время окончания должно быть позже времени начала', { endTime: ['invalid_range'] })
      }
      const deadline = input.registrationDeadline
        ? new Date(input.registrationDeadline)
        : current.registrationDeadline
      if (deadline && deadline > startsAt) {
        return validationError('Дедлайн регистрации должен быть до начала события', { registrationDeadline: ['invalid_range'] })
      }

      if (input.capacity !== undefined) {
        const occupied = await countOccupiedSeats(tx, id, new Date())
        if (input.capacity < occupied) throw new EventCapacityError()
      }

      if (input.price !== undefined || input.categories !== undefined) {
        const orderItems = await tx.orderItem.count({ where: { ticketCategory: { is: { forumId: id } } } })
        if (orderItems > 0) throw new ImmutableEventCategoriesError()
        const labels = input.categories ?? current.categories.map((category) =>
          category.translations.find((translation) => translation.locale === 'RU')?.name ?? category.code)
        const priceMinor = input.price?.amountMinor ?? current.categories[0]?.priceMinor ?? 0
        await tx.ticketCategory.deleteMany({ where: { forumId: id } })
        for (const category of categoryCreateData(labels, priceMinor)) {
          await tx.ticketCategory.create({ data: { ...category, forumId: id } })
        }
      }

      if (input.title || input.description || input.location) {
        const oldByLocale = new Map(current.translations.map((translation) => [translation.locale, translation]))
        const languages = [
          ['RU', 'ru'], ['KY', 'ky'], ['EN', 'en'],
        ] as const
        for (const [locale, key] of languages) {
          const old = oldByLocale.get(locale)
          const title = input.title?.[key] ?? old?.title ?? current.translations.find((row) => row.locale === 'RU')?.title
          if (!title) continue
          const venueName = input.location?.name[key] ?? old?.venueName ?? current.venueName
          const venueAddress = input.location?.address?.[key] ?? old?.venueAddress ?? current.venueAddress
          await tx.forumTranslation.upsert({
            where: { forumId_locale: { forumId: id, locale } },
            create: {
              forumId: id,
              locale,
              title,
              description: input.description?.[key] ?? old?.description,
              shortDescription: old?.shortDescription,
              program: old?.program,
              venueName,
              venueAddress,
            },
            update: {
              title,
              ...(input.description && { description: input.description[key] ?? null }),
              ...(input.location && { venueName, venueAddress }),
            },
          })
        }
      }

      await tx.forum.update({
        where: { id },
        data: {
          ...(input.slug !== undefined && { slug: input.slug }),
          ...(input.coverImageUrl !== undefined && { bannerUrl: input.coverImageUrl }),
          ...(input.location && {
            venueName: input.location.name.ru,
            venueAddress: input.location.address?.ru,
            locationCoordinates: input.location.coordinates as Prisma.InputJsonValue | undefined,
          }),
          ...(input.timeZone !== undefined && { timeZone: input.timeZone }),
          ...(input.startTime !== undefined && { startsAt }),
          ...(input.endTime !== undefined && { endsAt }),
          ...(input.registrationDeadline !== undefined && { registrationDeadline: deadline }),
          ...(input.capacity !== undefined && { capacity: input.capacity }),
          ...(input.tags !== undefined && { tags: input.tags }),
          ...(input.isPublished !== undefined && {
            status: input.isPublished ? ForumStatus.PUBLISHED : ForumStatus.DRAFT,
            ...(input.isPublished && !current.publishedAt && { publishedAt: new Date() }),
          }),
        },
      })

      return tx.forum.findUnique({ where: { id }, select: publicEventSelect })
    })

    if (event instanceof NextResponse) return event
    if (!event) return notFound('Событие', 'EVENT_NOT_FOUND')
    
    revalidatePublicForums()
    
    writeSecurityAuditEvent({
      eventType: 'EVENT_UPDATED',
      result: 'success',
      request,
      userId: authResult.user.userId,
      reason: 'event_updated',
      statusCode: 200,
    })
    return NextResponse.json({ event: toEventDto(event) }, { status: 200 })
  } catch (cause) {
    if (cause instanceof EventCapacityError) {
      return conflict('Нельзя уменьшить вместимость ниже числа занятых мест', 'EVENT_CAPACITY_BELOW_OCCUPANCY')
    }
    if (cause instanceof ImmutableEventCategoriesError) {
      return conflict('Категории и цены нельзя менять после создания заказов', 'EVENT_CATEGORIES_IN_USE')
    }
    if (cause instanceof EventCancelledError) {
      return conflict('Отменённое событие нельзя редактировать', 'EVENT_CANCELLED')
    }
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
      return conflict('Событие с таким идентификатором уже существует', 'EVENT_SLUG_TAKEN')
    }
    throw cause
  }
})

export const DELETE = withErrorHandler(async (request: NextRequest, context: EventRouteContext) => {
  const authResult = await requireManager(request)
  if (authResult instanceof NextResponse) return authResult
  const id = await getId(context)
  if (id instanceof NextResponse) return id

  const changed = await prisma.forum.updateMany({
    where: { id, status: { not: ForumStatus.CANCELLED } },
    data: { status: ForumStatus.CANCELLED },
  })
  if (changed.count === 0) {
    const exists = await prisma.forum.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return notFound('Событие', 'EVENT_NOT_FOUND')
  }

  revalidatePublicForums()

  writeSecurityAuditEvent({
    eventType: 'EVENT_CANCELLED',
    result: 'success',
    request,
    userId: authResult.user.userId,
    reason: 'event_deactivated',
    statusCode: 200,
  })
  return NextResponse.json({ success: true }, { status: 200 })
})
