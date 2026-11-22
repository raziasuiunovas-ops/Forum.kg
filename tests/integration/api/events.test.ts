import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest, NextResponse } from 'next/server'

// Route tests stub every Prisma delegate and never construct PrismaClient.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = ''
process.env.DIRECT_URL = ''
process.env.JWT_SECRET = 'events-route-test-access-secret'
process.env.JWT_REFRESH_SECRET = 'events-route-test-refresh-secret'

const USER_ID = '9f6a5d17-a1b8-47c1-9a2f-d223e4b4da19'
const OTHER_USER_ID = '207d88cb-9f36-4bc2-8b5b-f6c3a5c4e120'
const EVENT_ID = 'b346ebef-57ad-4773-8754-81d79cc8886c'
const START = new Date('2027-03-01T10:00:00.000Z')
const END = new Date('2027-03-01T12:00:00.000Z')
const FUTURE_DEADLINE = new Date('2027-02-28T10:00:00.000Z')

const event = {
  id: EVENT_ID,
  slug: 'forum-2027',
  status: 'PUBLISHED',
  bannerUrl: 'https://cdn.example.test/event.png',
  venueName: 'Бишкек',
  venueAddress: 'Чүй проспекти',
  locationCoordinates: { latitude: 42.87, longitude: 74.59 },
  timeZone: 'Asia/Bishkek',
  startsAt: START,
  endsAt: END,
  registrationDeadline: FUTURE_DEADLINE,
  qrExpiresAt: END,
  capacity: 10,
  maxTicketsPerAccount: 1,
  publishAt: null,
  publishedAt: new Date('2026-01-01T00:00:00.000Z'),
  createdById: USER_ID,
  createdAt: START,
  updatedAt: START,
  tags: ['tech'],
  translations: [{
    locale: 'RU', title: 'Форум', shortDescription: null, description: 'Описание',
    program: null, venueName: 'Бишкек', venueAddress: 'Чүй проспекти',
  }],
  categories: [{
    id: OTHER_USER_ID, code: 'CATEGORY_1', priceMinor: 1000, currency: 'KGS', capacity: null,
    translations: [{ locale: 'RU', name: 'Standard', description: null }],
  }],
  createdBy: { id: USER_ID, firstName: 'Айжан', lastName: 'Осмонова' },
  _count: { registrations: 2 },
}

const registration = {
  id: OTHER_USER_ID,
  attendeeFirstName: 'Айжан',
  attendeeLastName: 'Осмонова',
  attendeePhone: '+996555123456',
  attendeeEmail: 'aizhan@example.test',
  additionalInfo: null,
  createdAt: START,
}

const prisma: any = {
  forum: {
    findMany: async () => [],
    findUnique: async () => null,
    count: async () => 0,
    create: async () => event,
    update: async () => event,
    updateMany: async () => ({ count: 0 }),
  },
  forumTranslation: { upsert: async () => ({}) },
  ticketCategory: {
    deleteMany: async () => ({ count: 0 }),
    create: async () => ({}),
    findMany: async () => [],
  },
  eventRegistration: {
    findMany: async () => [],
    findUnique: async () => null,
    count: async () => 0,
    create: async () => registration,
    deleteMany: async () => ({ count: 0 }),
  },
  ticket: { count: async () => 0 },
  orderItem: { count: async () => 0 },
  $queryRaw: async () => [],
}

let rowLockTail: Promise<void> = Promise.resolve()
let rowLockRequests = 0
prisma.$transaction = async (operation: (tx: any) => Promise<unknown>) => {
  let releaseRowLock: (() => void) | undefined
  const tx = Object.create(prisma)
  tx.$queryRaw = async () => {
    rowLockRequests += 1
    if (!releaseRowLock) {
      let release!: () => void
      const next = new Promise<void>((resolve) => { release = resolve })
      const previous = rowLockTail
      rowLockTail = previous.then(() => next)
      await previous
      releaseRowLock = release
    }
    return []
  }

  try {
    return await operation(tx)
  } finally {
    releaseRowLock?.()
  }
}

const moduleLoader = require('node:module') as any
const originalLoad = moduleLoader._load
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/db') return { prisma, default: prisma }
  return originalLoad.call(this, request, parent, isMain)
}

const auth = require('../../../lib/auth/middleware') as typeof import('../../../lib/auth/middleware')
const eventsRoute = require('../../../app/api/v1/events/route') as typeof import('../../../app/api/v1/events/route')
const eventRoute = require('../../../app/api/v1/events/[id]/route') as typeof import('../../../app/api/v1/events/[id]/route')
const registrationsRoute = require('../../../app/api/v1/events/[id]/registrations/route') as typeof import('../../../app/api/v1/events/[id]/registrations/route')
const registerRoute = require('../../../app/api/v1/events/[id]/register/route') as typeof import('../../../app/api/v1/events/[id]/register/route')
moduleLoader._load = originalLoad

function authResult(userId = USER_ID, role = 'USER') {
  return { user: { userId, role, status: 'ACTIVE' } }
}

function request(path: string, method = 'GET', body?: string, userId?: string) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(userId ? { 'x-test-user-id': userId } : {}),
    },
    body,
  })
}

function context(id = EVENT_ID) {
  return { params: Promise.resolve({ id }) }
}

function validEventPayload(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'forum-2027',
    title: { ru: 'Форум' },
    description: { ru: 'Описание' },
    location: { name: { ru: 'Бишкек' }, address: { ru: 'Чүй проспекти' } },
    startTime: START.toISOString(),
    endTime: END.toISOString(),
    capacity: 10,
    organizerId: USER_ID,
    ...overrides,
  }
}

function validRegistrationPayload(overrides: Record<string, unknown> = {}) {
  return {
    attendeeFirstName: 'Айжан',
    attendeeLastName: 'Осмонова',
    attendeePhone: '+996555123456',
    attendeeEmail: 'aizhan@example.test',
    ...overrides,
  }
}

function mockManager(t: any, managerId = USER_ID) {
  t.mock.method(auth, 'requireManager', async () => authResult(managerId, 'MANAGER'))
}

function mockAuth(t: any) {
  t.mock.method(auth, 'requireAuth', async (req: NextRequest) => authResult(req.headers.get('x-test-user-id') ?? USER_ID))
}

test('GET events filters, paginates, and returns only public organizer fields', async (t) => {
  let args: any
  t.mock.method(prisma.forum, 'findMany', async (query: any) => { args = query; return [event] })
  t.mock.method(prisma.forum, 'count', async () => 13)

  const response = await eventsRoute.GET(request('/api/v1/events?page=2&limit=5&isPublished=true&tag=tech'))
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(args.skip, 5)
  assert.equal(args.take, 5)
  assert.equal(args.where.status, 'PUBLISHED')
  assert.ok(Array.isArray(args.where.OR))
  assert.deepEqual(args.where.tags, { has: 'tech' })
  assert.equal(body.pagination.totalPages, 3)
  assert.equal(body.events[0].registrationCount, 2)
  assert.equal('phone' in body.events[0].organizer, false)
  assert.equal('email' in body.events[0].organizer, false)
})

test('GET events requires manager access to search unpublished events', async (t) => {
  t.mock.method(auth, 'requireManager', async () => NextResponse.json({ error: { code: 'DENIED' } }, { status: 403 }))
  const response = await eventsRoute.GET(request('/api/v1/events?isPublished=false'))
  assert.equal(response.status, 403)
})

test('GET one published event returns details without private participant data', async (t) => {
  t.mock.method(prisma.forum, 'findUnique', async () => event)
  const response = await eventRoute.GET(request(`/api/v1/events/${EVENT_ID}`), context())
  const body = await response.json() as any
  assert.equal(response.status, 200)
  assert.equal(body.event.id, EVENT_ID)
  assert.equal(body.event.title.ru, 'Форум')
  assert.equal(body.event.registrationCount, 2)
  assert.equal('registrations' in body.event, false)
  assert.equal('attendeePhone' in body.event, false)
})

test('GET one event returns 404 for invalid or missing IDs', async (t) => {
  t.mock.method(prisma.forum, 'findUnique', async () => null)
  const invalid = await eventRoute.GET(request('/api/v1/events/not-a-uuid'), context('not-a-uuid'))
  const missing = await eventRoute.GET(request(`/api/v1/events/${EVENT_ID}`), context())
  assert.equal(invalid.status, 422)
  assert.equal(missing.status, 404)
})

test('GET one event hides a scheduled publication from non-managers', async (t) => {
  t.mock.method(prisma.forum, 'findUnique', async () => ({ ...event, publishedAt: new Date(Date.now() + 60_000) }))
  t.mock.method(auth, 'requireManager', async () => NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }))
  const response = await eventRoute.GET(request(`/api/v1/events/${EVENT_ID}`), context())
  assert.equal(response.status, 404)
})

test('POST event creates the event, translations, and ticket categories for a manager', async (t) => {
  mockManager(t)
  let createArgs: any
  t.mock.method(prisma.forum, 'create', async (args: any) => { createArgs = args; return event })

  const response = await eventsRoute.POST(request('/api/v1/events', 'POST', JSON.stringify(validEventPayload())))
  const body = await response.json() as any

  assert.equal(response.status, 201)
  assert.equal(body.event.id, EVENT_ID)
  assert.equal(createArgs.data.createdById, USER_ID)
  assert.equal(createArgs.data.categories.create[0].priceMinor, 0)
  assert.equal(createArgs.data.translations.create.length, 3)
})

test('POST event rejects anonymous users and organizer ID escalation', async (t) => {
  t.mock.method(auth, 'requireManager', async (req: NextRequest) => req.headers.has('x-test-user-id')
    ? authResult(OTHER_USER_ID, 'MANAGER')
    : NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }))
  let writes = 0
  t.mock.method(prisma.forum, 'create', async () => { writes += 1; return event })

  const anonymous = await eventsRoute.POST(request('/api/v1/events', 'POST', JSON.stringify(validEventPayload())))
  const escalation = await eventsRoute.POST(request('/api/v1/events', 'POST', JSON.stringify(validEventPayload()), OTHER_USER_ID))
  assert.equal(anonymous.status, 401)
  assert.equal(escalation.status, 403)
  assert.equal(writes, 0)
})

test('POST event rejects unknown fields, malformed JSON, and invalid event dates', async (t) => {
  mockManager(t)
  const unknown = await eventsRoute.POST(request('/api/v1/events', 'POST', JSON.stringify(validEventPayload({ isAdmin: true }))))
  const malformed = await eventsRoute.POST(request('/api/v1/events', 'POST', '{ bad'))
  const invalidRange = await eventsRoute.POST(request('/api/v1/events', 'POST', JSON.stringify(validEventPayload({
    endTime: START.toISOString(),
  }))))
  assert.equal(unknown.status, 422)
  assert.equal(malformed.status, 422)
  assert.equal(invalidRange.status, 422)
})

test('PATCH event checks manager permissions and updates event translations', async (t) => {
  mockManager(t)
  let reads = 0
  t.mock.method(prisma.forum, 'findUnique', async () => {
    reads += 1
    return reads === 1
      ? { ...event, translations: event.translations, categories: event.categories.map((category) => ({
          ...category, translations: category.translations,
        })) }
      : event
  })
  let translated = 0
  t.mock.method(prisma.forumTranslation, 'upsert', async () => { translated += 1; return {} })

  const response = await eventRoute.PATCH(request(`/api/v1/events/${EVENT_ID}`, 'PATCH', JSON.stringify({
    title: { ru: 'Обновлённый форум' },
  })), context())

  assert.equal(response.status, 200)
  assert.equal(translated, 3)
})

test('PATCH event rejects capacity below existing occupied seats', async (t) => {
  mockManager(t)
  const current = {
    ...event,
    capacity: 10,
    translations: event.translations,
    categories: event.categories.map((category) => ({ ...category, translations: category.translations })),
  }
  t.mock.method(prisma.forum, 'findUnique', async () => current)
  t.mock.method(prisma.eventRegistration, 'count', async () => 6)
  t.mock.method(prisma.ticket, 'count', async () => 3)
  t.mock.method(prisma.orderItem, 'count', async () => 2)

  const response = await eventRoute.PATCH(request(`/api/v1/events/${EVENT_ID}`, 'PATCH', JSON.stringify({ capacity: 10 })), context())
  assert.equal(response.status, 409)
})

test('PATCH event requires manager authorization', async (t) => {
  t.mock.method(auth, 'requireManager', async () => NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }))
  const response = await eventRoute.PATCH(request(
    `/api/v1/events/${EVENT_ID}`, 'PATCH', JSON.stringify({ slug: 'new-slug' })
  ), context())
  assert.equal(response.status, 401)
})

test('DELETE event deactivates it by setting CANCELLED and is repeat-safe', async (t) => {
  mockManager(t)
  let updates = 0
  let updateArgs: any
  t.mock.method(prisma.forum, 'updateMany', async (args: any) => {
    updateArgs = args
    return { count: updates++ === 0 ? 1 : 0 }
  })
  t.mock.method(prisma.forum, 'findUnique', async () => ({ id: EVENT_ID }))

  const first = await eventRoute.DELETE(request(`/api/v1/events/${EVENT_ID}`, 'DELETE'), context())
  const second = await eventRoute.DELETE(request(`/api/v1/events/${EVENT_ID}`, 'DELETE'), context())
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.deepEqual(updateArgs.data, { status: 'CANCELLED' })
})

test('GET registrations is manager-only and excludes account identifiers', async (t) => {
  mockManager(t)
  t.mock.method(prisma.forum, 'findUnique', async () => ({ id: EVENT_ID }))
  let query: any
  t.mock.method(prisma.eventRegistration, 'findMany', async (args: any) => { query = args; return [registration] })
  t.mock.method(prisma.eventRegistration, 'count', async () => 1)

  const response = await registrationsRoute.GET(request(`/api/v1/events/${EVENT_ID}/registrations?page=1&limit=1`), context())
  const body = await response.json() as any
  assert.equal(response.status, 200)
  assert.equal(query.skip, 0)
  assert.equal(query.take, 1)
  assert.equal('userId' in body.registrations[0], false)
  assert.equal('email' in body.registrations[0], false)
})

test('POST registration requires authentication and validates payload strictly', async (t) => {
  t.mock.method(auth, 'requireAuth', async () => NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }))
  let transactions = 0
  t.mock.method(prisma, '$transaction', async (operation: (tx: any) => Promise<unknown>) => {
    transactions += 1
    return operation(prisma)
  })
  const anonymous = await registerRoute.POST(
    request(`/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify(validRegistrationPayload())), context()
  )
  assert.equal(anonymous.status, 401)
  assert.equal(transactions, 0)

  t.mock.method(auth, 'requireAuth', async () => authResult())
  const unknown = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify(
    validRegistrationPayload({ role: 'MANAGER' })
  )), context())
  const malformed = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', '{ bad'), context())
  const invalidPhone = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify(
    validRegistrationPayload({ attendeePhone: '555123456' })
  )), context())
  assert.equal(unknown.status, 422)
  assert.equal(malformed.status, 422)
  assert.equal(invalidPhone.status, 422)
})

test('POST registration checks state, capacity, and writes RSVP atomically', async (t) => {
  mockAuth(t)
  t.mock.method(prisma.forum, 'findUnique', async () => event)
  t.mock.method(prisma.eventRegistration, 'findUnique', async () => null)
  t.mock.method(prisma.eventRegistration, 'count', async () => 1)
  t.mock.method(prisma.ticket, 'count', async () => 1)
  t.mock.method(prisma.orderItem, 'count', async () => 0)
  let registrationArgs: any
  t.mock.method(prisma.eventRegistration, 'create', async (args: any) => {
    registrationArgs = args
    return registration
  })
  const locksBefore = rowLockRequests

  const response = await registerRoute.POST(request(
    `/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify(validRegistrationPayload())
  ), context())

  assert.equal(response.status, 201)
  assert.equal(registrationArgs.data.userId, USER_ID)
  assert.equal(registrationArgs.data.forumId, EVENT_ID)
  assert.equal(rowLockRequests - locksBefore, 1)
})

test('POST registration rejects duplicate RSVPs, full events, and closed events', async (t) => {
  mockAuth(t)
  let currentEvent = event
  let existing: unknown = { id: OTHER_USER_ID }
  let occupied = { registrations: 0, tickets: 0, orderItems: 0 }
  t.mock.method(prisma.forum, 'findUnique', async () => currentEvent)
  t.mock.method(prisma.eventRegistration, 'findUnique', async () => existing)
  t.mock.method(prisma.eventRegistration, 'count', async () => occupied.registrations)
  t.mock.method(prisma.ticket, 'count', async () => occupied.tickets)
  t.mock.method(prisma.orderItem, 'count', async () => occupied.orderItems)

  const payload = JSON.stringify(validRegistrationPayload())
  const duplicate = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', payload), context())
  existing = null
  occupied = { registrations: 0, tickets: 7, orderItems: 3 }
  const full = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', payload), context())
  currentEvent = { ...event, status: 'CANCELLED' }
  const closed = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', payload), context())

  assert.equal(duplicate.status, 409)
  assert.equal(full.status, 409)
  assert.equal(closed.status, 409)
})

test('POST registration rejects events past their start or registration deadline', async (t) => {
  mockAuth(t)
  let currentEvent: any = { ...event, startsAt: new Date(Date.now() - 60_000), registrationDeadline: null }
  t.mock.method(prisma.forum, 'findUnique', async () => currentEvent)
  t.mock.method(prisma.eventRegistration, 'findUnique', async () => null)
  const payload = JSON.stringify(validRegistrationPayload())
  const started = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', payload), context())
  currentEvent = { ...event, registrationDeadline: new Date(Date.now() - 60_000) }
  const deadline = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', payload), context())
  currentEvent = { ...event, publishedAt: new Date(Date.now() + 60_000) }
  const scheduled = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', payload), context())
  assert.equal(started.status, 409)
  assert.equal(deadline.status, 409)
  assert.equal(scheduled.status, 409)
})

test('simultaneous RSVPs serialize capacity checks and never exceed capacity', async (t) => {
  const accepted: Array<{ forumId: string; userId: string }> = []
  t.mock.method(auth, 'requireAuth', async (req: NextRequest) => authResult(req.headers.get('x-test-user-id') ?? USER_ID))
  t.mock.method(prisma.forum, 'findUnique', async () => ({
    id: EVENT_ID, status: 'PUBLISHED', startsAt: START, publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    registrationDeadline: null, capacity: 1,
  }))
  t.mock.method(prisma.eventRegistration, 'findUnique', async (args: any) =>
    accepted.find((row) => row.forumId === args.where.forumId_userId.forumId && row.userId === args.where.forumId_userId.userId)
      ? { id: OTHER_USER_ID }
      : null)
  t.mock.method(prisma.eventRegistration, 'count', async () => accepted.length)
  t.mock.method(prisma.ticket, 'count', async () => 0)
  t.mock.method(prisma.orderItem, 'count', async () => 0)
  t.mock.method(prisma.eventRegistration, 'create', async (args: any) => {
    accepted.push(args.data)
    return registration
  })

  const [first, second] = await Promise.all([USER_ID, OTHER_USER_ID].map((userId) => registerRoute.POST(
    request(`/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify(validRegistrationPayload()), userId),
    context()
  )))

  assert.deepEqual([first.status, second.status].sort(), [201, 409])
  assert.equal(accepted.length, 1)
})

test('DELETE registration cancels only the current user RSVP', async (t) => {
  mockAuth(t)
  t.mock.method(prisma.forum, 'findUnique', async () => ({ id: EVENT_ID }))
  let deleteArgs: any
  t.mock.method(prisma.eventRegistration, 'deleteMany', async (args: any) => {
    deleteArgs = args
    return { count: 1 }
  })

  const response = await registerRoute.DELETE(request(`/api/v1/events/${EVENT_ID}/register`, 'DELETE'), context())
  assert.equal(response.status, 200)
  assert.deepEqual(deleteArgs.where, { forumId: EVENT_ID, userId: USER_ID })
})

test('registration and manager endpoints return 404 for missing events', async (t) => {
  mockAuth(t)
  t.mock.method(prisma.forum, 'findUnique', async () => null)
  const missing = await registerRoute.POST(request(
    `/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify(validRegistrationPayload())
  ), context())
  assert.equal(missing.status, 404)

  t.mock.method(auth, 'requireManager', async () => NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }))
  const managerOnly = await registrationsRoute.GET(
    request(`/api/v1/events/${EVENT_ID}/registrations`), context()
  )
  assert.equal(managerOnly.status, 401)
})
