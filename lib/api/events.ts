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
  const now = new Date()
  return categoryNames.map((name, index) => ({
    code: `CATEGORY_${index + 1}`,
    priceMinor,
    currency: 'KGS',
    createdAt: now,
    updatedAt: now,
    translations: { create: [{ locale: 'RU' as const, name }] },
  }))
}

/**
 * Lock the parent Forum row as the serialization point for every operation
 * that reserves, releases, or issues event seats. Call this before any other
 * query in the capacity-changing transaction.
 */
export async function lockEventRow(tx: Prisma.TransactionClient, forumId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Forum" WHERE "id" = ${forumId}::uuid FOR UPDATE`)
}

/** Lock related rows after the Forum row, using the shared lock order. */
export async function lockOrderRow(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`)
}

export async function lockOrderPayments(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Payment" WHERE "orderId" = ${orderId}::uuid ORDER BY "id" FOR UPDATE
  `)
}

export interface CapacitySnapshot {
  occupied: number
  categories: Map<string, number>
}

interface CapacityCountRow {
  forumId: string
  categoryId: string | null
  occupied: number | bigint
}

/**
 * Use one SQL definition for both the overall event capacity and category
 * availability. A ticket row replaces its OrderItem hold, so the item is only
 * counted when no ticket exists. USED tickets still consume a seat.
 */
export async function getCapacitySnapshots(
  tx: Prisma.TransactionClient,
  forumIds: string[],
  now: Date,
  options: { excludeOrderId?: string } = {}
): Promise<Map<string, CapacitySnapshot>> {
  if (forumIds.length === 0) return new Map()

  const rows = await tx.$queryRaw<CapacityCountRow[]>(Prisma.sql`
    WITH occupied_seats AS (
      SELECT
        o."forumId",
        oi."ticketCategoryId" AS "categoryId",
        COUNT(*) AS occupied
      FROM "OrderItem" oi
      INNER JOIN "Order" o ON o.id = oi."orderId"
      LEFT JOIN "Ticket" t ON t."orderItemId" = oi.id
      WHERE
        o."forumId" = ANY(${forumIds}::uuid[])
        AND (
          (o.status = 'PENDING_PAYMENT' AND o."reservedUntil" > ${now})
          OR o.status IN ('PAID', 'PARTIALLY_CANCELLED')
        )
        AND (t.id IS NULL OR t.status IN ('ACTIVE', 'USED'))
        ${options.excludeOrderId ? Prisma.sql`AND o.id != ${options.excludeOrderId}::uuid` : Prisma.empty}
      GROUP BY o."forumId", oi."ticketCategoryId"
    )
    SELECT
      "forumId"::text,
      "categoryId"::text,
      occupied
    FROM occupied_seats
  `)

  const snapshots = new Map<string, CapacitySnapshot>()
  for (const id of forumIds) {
    snapshots.set(id, { occupied: 0, categories: new Map() })
  }

  for (const row of rows) {
    const snap = snapshots.get(row.forumId)!
    const count = typeof row.occupied === 'bigint' ? Number(row.occupied) : row.occupied
    snap.occupied += count
    if (row.categoryId) snap.categories.set(row.categoryId, count)
  }

  return snapshots
}

/**
 * Wraps a capacity-sensitive transaction and ensures proper error handling.
 * Use this for operations like order creation, payment processing, cancellations.
 */
export async function withCapacityTransaction<T>(
  prisma: { $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => Promise<T> },
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(fn, {
    maxWait: 5000,
    timeout: 10000,
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  })
}

/** Count occupied seats across RSVPs, issued tickets, and unexpired/unissued orders. */
export async function countOccupiedSeats(
  tx: Prisma.TransactionClient,
  forumId: string,
  now: Date
): Promise<number> {
  const snapshots = await getCapacitySnapshots(tx, [forumId], now)
  return snapshots.get(forumId)?.occupied ?? 0
}
