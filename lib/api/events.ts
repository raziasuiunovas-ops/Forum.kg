import { ForumStatus, OrderStatus, Prisma, TicketStatus } from '@prisma/client'

export const publicEventSelect = {
  id: true,
  slug: true,
  status: true,
  bannerUrl: true,
  venueName: true,
  venueAddress: true,
  locationCoordinates: true,
  timeZone: true,
  startsAt: true,
  endsAt: true,
  registrationDeadline: true,
  qrExpiresAt: true,
  capacity: true,
  maxTicketsPerAccount: true,
  publishAt: true,
  publishedAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  tags: true,
  translations: {
    select: {
      locale: true,
      title: true,
      shortDescription: true,
      description: true,
      program: true,
      venueName: true,
      venueAddress: true,
    },
  },
  categories: {
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      priceMinor: true,
      currency: true,
      capacity: true,
      translations: { select: { locale: true, name: true, description: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { registrations: true } },
} satisfies Prisma.ForumSelect

type EventRecord = Prisma.ForumGetPayload<{ select: typeof publicEventSelect }>

const localeKey = { RU: 'ru', KY: 'ky', EN: 'en' } as const

function localized(
  rows: EventRecord['translations'],
  field: 'title' | 'shortDescription' | 'description' | 'program' | 'venueName' | 'venueAddress'
) {
  return Object.fromEntries(rows.flatMap((row) => {
    const value = row[field]
    return value === null ? [] : [[localeKey[row.locale], value]]
  }))
}

export function toEventDto(event: EventRecord) {
  const lowestPrice = event.categories.reduce<number | null>((min, category) =>
    min === null || category.priceMinor < min ? category.priceMinor : min, null)

  return {
    id: event.id,
    slug: event.slug,
    organizerId: event.createdById,
    organizer: event.createdBy,
    status: event.status,
    isPublished: event.status === ForumStatus.PUBLISHED,
    title: localized(event.translations, 'title'),
    description: localized(event.translations, 'description'),
    shortDescription: localized(event.translations, 'shortDescription'),
    program: localized(event.translations, 'program'),
    coverImageUrl: event.bannerUrl,
    location: {
      name: Object.keys(localized(event.translations, 'venueName')).length
        ? localized(event.translations, 'venueName')
        : { ru: event.venueName },
      address: Object.keys(localized(event.translations, 'venueAddress')).length
        ? localized(event.translations, 'venueAddress')
        : event.venueAddress ? { ru: event.venueAddress } : undefined,
      coordinates: event.locationCoordinates,
    },
    timeZone: event.timeZone,
    startTime: event.startsAt,
    endTime: event.endsAt,
    registrationDeadline: event.registrationDeadline,
    qrExpiresAt: event.qrExpiresAt,
    capacity: event.capacity,
    maxTicketsPerAccount: event.maxTicketsPerAccount,
    price: lowestPrice === null ? null : { amountMinor: lowestPrice, currency: event.categories[0]?.currency ?? 'KGS' },
    categories: event.categories.map((category) => ({
      id: category.id,
      code: category.code,
      priceMinor: category.priceMinor,
      currency: category.currency,
      capacity: category.capacity,
      translations: Object.fromEntries(category.translations.map((translation) => [
        localeKey[translation.locale],
        { name: translation.name, description: translation.description },
      ])),
    })),
    tags: event.tags,
    registrationCount: event._count.registrations,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  }
}

export function translationRows(input: {
  title: { ru: string; ky?: string; en?: string }
  description: { ru: string; ky?: string; en?: string }
  location: {
    name: { ru: string; ky?: string; en?: string }
    address?: { ru: string; ky?: string; en?: string }
  }
}) {
  const languages = ['ru', 'ky', 'en'] as const
  return languages.map((language) => ({
    locale: language.toUpperCase() as 'RU' | 'KY' | 'EN',
    title: input.title[language] ?? input.title.ru,
    description: input.description[language] ?? null,
    venueName: input.location.name[language] ?? input.location.name.ru,
    venueAddress: input.location.address?.[language] ?? input.location.address?.ru ?? null,
  }))
}

export function categoryCreateData(names: string[] | undefined, priceMinor: number) {
  const categoryNames = names?.length ? names : ['Standard']
  return categoryNames.map((name, index) => ({
    code: `CATEGORY_${index + 1}`,
    priceMinor,
    currency: 'KGS',
    translations: { create: [{ locale: 'RU' as const, name }] },
  }))
}

/** Lock the parent forum so competing RSVP operations serialize per event. */
export async function lockEventRow(tx: Prisma.TransactionClient, forumId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Forum" WHERE "id" = ${forumId} FOR UPDATE`)
}

/** Count occupied seats across RSVPs, issued tickets, and unexpired/unissued orders. */
export async function countOccupiedSeats(
  tx: Prisma.TransactionClient,
  forumId: string,
  now: Date
): Promise<number> {
  const [registrations, tickets, orderHolds] = await Promise.all([
    tx.eventRegistration.count({ where: { forumId } }),
    tx.ticket.count({ where: { forumId, status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] } } }),
    tx.orderItem.count({
      where: {
        ticket: { is: null },
        order: {
          is: {
            forumId,
            OR: [
              { status: OrderStatus.PENDING_PAYMENT, reservedUntil: { gt: now } },
              { status: { in: [OrderStatus.PAID, OrderStatus.PARTIALLY_CANCELLED] } },
            ],
          },
        },
      },
    }),
  ])

  return registrations + tickets + orderHolds
}
