import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = ''
process.env.DIRECT_URL = ''
process.env.JWT_SECRET = 'events-test-secret'
process.env.JWT_REFRESH_SECRET = 'events-refresh-secret'

const USER_ID = '9f6a5d17-a1b8-47c1-9a2f-d223e4b4da19'
const MANAGER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const EVENT_ID = 'b346ebef-57ad-4773-8754-81d79cc8886c'
const REGISTRATION_ID = 'c1ff98b1-0243-4d78-a3f1-1e0f848fbac9'
const START = new Date('2027-03-01T10:00:00.000Z')
const END = new Date('2027-03-01T12:00:00.000Z')
const PAST_START = new Date('2026-01-01T10:00:00.000Z')
const FUTURE_DEADLINE = new Date('2027-02-28T10:00:00.000Z')
const PAST_DEADLINE = new Date('2026-01-15T10:00:00.000Z')

const event = {
  id: EVENT_ID, slug: 'forum-2027', status: 'PUBLISHED',
  bannerUrl: 'https://cdn.example.test/event.png', venueName: 'Бишкек',
  venueAddress: 'Чүй проспекти', locationCoordinates: { latitude: 42.87, longitude: 74.59 },
  timeZone: 'Asia/Bishkek', startsAt: START, endsAt: END,
  registrationDeadline: FUTURE_DEADLINE, qrExpiresAt: END, capacity: 10,
  maxTicketsPerAccount: 1, publishAt: null, publishedAt: new Date('2026-01-01T00:00:00.000Z'),
  createdById: MANAGER_ID, createdAt: START, updatedAt: START, tags: ['tech'],
  translations: [{ locale: 'RU', title: 'Форум', shortDescription: null, description: 'Описание',
    program: null, venueName: 'Бишкек', venueAddress: 'Чүй проспекти' }],
  categories: [{ id: EVENT_ID, code: 'CATEGORY_1', priceMinor: 1000, currency: 'KGS', capacity: null,
    translations: [{ locale: 'RU', name: 'Standard', description: null }] }],
  createdBy: { id: MANAGER_ID, firstName: 'Айжан', lastName: 'Осмонова' },
  _count: { registrations: 2 }
}

const registration = {
  id: REGISTRATION_ID, forumId: EVENT_ID, userId: USER_ID,
  attendeeFirstName: 'Иван', attendeeLastName: 'Петров', attendeePhone: '+996700123456',
  attendeeEmail: 'ivan@example.com', additionalInfo: 'Test',
  createdAt: new Date('2026-12-01T00:00:00.000Z')
}

const prisma: any = {
  forum: { findMany: async () => [], findUnique: async () => null, count: async () => 0,
    create: async () => null, update: async () => null, updateMany: async () => ({ count: 0 }) },
  forumTranslation: { upsert: async () => null },
  ticketCategory: { create: async () => null, deleteMany: async () => ({ count: 0 }) },
  eventRegistration: { findMany: async () => [], findUnique: async () => null, count: async () => 0,
    create: async () => null, deleteMany: async () => ({ count: 0 }) },
  ticket: { count: async () => 0 },
  orderItem: { count: async () => 0 }
}
prisma.$transaction = async (operation: (tx: any) => Promise<unknown>) => operation(prisma)
prisma.$queryRaw = async () => []

const moduleLoader = require('node:module') as any
const originalLoad = moduleLoader._load
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/db') return { prisma, default: prisma }
  return originalLoad.call(this, request, parent, isMain)
}

const auth = require('../../../lib/auth/middleware') as typeof import('../../../lib/auth/middleware')
const eventsRoute = require('../../../app/api/v1/events/route') as typeof import('../../../app/api/v1/events/route')
const eventRoute = require('../../../app/api/v1/events/[id]/route') as typeof import('../../../app/api/v1/events/[id]/route')
const registerRoute = require('../../../app/api/v1/events/[id]/register/route') as typeof import('../../../app/api/v1/events/[id]/register/route')
const registrationsRoute = require('../../../app/api/v1/events/[id]/registrations/route') as typeof import('../../../app/api/v1/events/[id]/registrations/route')
const myRegistrationsRoute = require('../../../app/api/v1/events/my-registrations/route') as typeof import('../../../app/api/v1/events/my-registrations/route')
moduleLoader._load = originalLoad

function authenticatedUser(userId = USER_ID, role = 'USER') {
  return { user: { userId, role, status: 'ACTIVE' } }
}

function request(path: string, method = 'GET', body?: string) {
  return new NextRequest(`http://localhost${path}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body
  })
}

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

function authAs(t: any, userId = USER_ID, role = 'USER') {
  t.mock.method(auth, 'requireAuth', async () => authenticatedUser(userId, role))
}

function authAsManager(t: any, userId = MANAGER_ID) {
  t.mock.method(auth, 'requireManager', async () => authenticatedUser(userId, 'MANAGER'))
}

// GET /api/v1/events tests
test('GET events returns paginated list with filters', async (t) => {
  let findArgs: any
  t.mock.method(prisma.forum, 'findMany', async (args: any) => { findArgs = args; return [event] })
  t.mock.method(prisma.forum, 'count', async () => 15)
  const response = await eventsRoute.GET(request('/api/v1/events?page=2&limit=5&organizerId=' + MANAGER_ID))
  const body = await response.json() as any
  assert.equal(response.status, 200)
  assert.equal(findArgs.skip, 5)
  assert.equal(findArgs.where.createdById, MANAGER_ID)
})

test('GET events filters by category', async (t) => {
  let findArgs: any
  t.mock.method(prisma.forum, 'findMany', async (args: any) => { findArgs = args; return [] })
  t.mock.method(prisma.forum, 'count', async () => 0)
  await eventsRoute.GET(request('/api/v1/events?category=tech'))
  assert.ok(findArgs.where.categories.some)
  assert.equal(findArgs.where.categories.some.isActive, true)
})

test('GET events filters by tag', async (t) => {
  let findArgs: any
  t.mock.method(prisma.forum, 'findMany', async (args: any) => { findArgs = args; return [] })
  t.mock.method(prisma.forum, 'count', async () => 0)
  await eventsRoute.GET(request('/api/v1/events?tag=workshop'))
  assert.deepEqual(findArgs.where.tags, { has: 'workshop' })
})

test('GET events filters by date range', async (t) => {
  let findArgs: any
  t.mock.method(prisma.forum, 'findMany', async (args: any) => { findArgs = args; return [] })
  t.mock.method(prisma.forum, 'count', async () => 0)
  await eventsRoute.GET(request('/api/v1/events?startAfter=2027-01-01T00:00:00.000Z'))
  assert.ok(findArgs.where.startsAt.gte)
})

test('GET events searches in translations', async (t) => {
  let findArgs: any
  t.mock.method(prisma.forum, 'findMany', async (args: any) => { findArgs = args; return [] })
  t.mock.method(prisma.forum, 'count', async () => 0)
  await eventsRoute.GET(request('/api/v1/events?search=conference'))
  assert.ok(findArgs.where.translations.some.OR)
})

test('GET events sorts by registrationCount', async (t) => {
  let findArgs: any
  t.mock.method(prisma.forum, 'findMany', async (args: any) => { findArgs = args; return [] })
  t.mock.method(prisma.forum, 'count', async () => 0)
  await eventsRoute.GET(request('/api/v1/events?sortBy=registrationCount&sortOrder=asc'))
  assert.deepEqual(findArgs.orderBy[0], { registrations: { _count: 'asc' } })
})

test('GET events requires MANAGER for unpublished filter', async (t) => {
  t.mock.method(auth, 'requireManager', async () => NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }))
  const response = await eventsRoute.GET(request('/api/v1/events?isPublished=false'))
  assert.equal(response.status, 403)
})

test('GET events rejects invalid UUID', async (t) => {
  const response = await eventsRoute.GET(request('/api/v1/events?organizerId=invalid'))
  assert.equal(response.status, 422)
})

// GET /api/v1/events/:id tests
test('GET one event returns full details', async (t) => {
  t.mock.method(prisma.forum, 'findUnique', async () => event)
  const response = await eventRoute.GET(request(`/api/v1/events/${EVENT_ID}`), params(EVENT_ID))
  const body = await response.json() as any
  assert.equal(response.status, 200)
  assert.equal(body.event.id, EVENT_ID)
})

test('GET one event returns 404 when not found', async (t) => {
  t.mock.method(prisma.forum, 'findUnique', async () => null)
  const response = await eventRoute.GET(request(`/api/v1/events/${EVENT_ID}`), params(EVENT_ID))
  assert.equal(response.status, 404)
})

test('GET one event hides unpublished from non-managers', async (t) => {
  t.mock.method(prisma.forum, 'findUnique', async () => ({ ...event, status: 'DRAFT' }))
  t.mock.method(auth, 'requireManager', async () => NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }))
  const response = await eventRoute.GET(request(`/api/v1/events/${EVENT_ID}`), params(EVENT_ID))
  assert.equal(response.status, 404)
})

// POST /api/v1/events tests
test('POST event creates with MANAGER role', async (t) => {
  authAsManager(t, MANAGER_ID)
  let createArgs: any
  t.mock.method(prisma.forum, 'create', async (args: any) => { createArgs = args; return event })
  const response = await eventsRoute.POST(request('/api/v1/events', 'POST', JSON.stringify({
    slug: 'test', title: { ru: 'Тест' }, description: { ru: 'Описание' },
    location: { name: { ru: 'Бишкек' } }, timeZone: 'Asia/Bishkek',
    startTime: START.toISOString(), endTime: END.toISOString(),
    capacity: 100, organizerId: MANAGER_ID
  })))
  assert.equal(response.status, 201)
  assert.equal(createArgs.data.slug, 'test')
})

test('POST event rejects non-MANAGER users', async (t) => {
  t.mock.method(auth, 'requireManager', async () => NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }))
  const response = await eventsRoute.POST(request('/api/v1/events', 'POST', JSON.stringify({
    slug: 'test', title: { ru: 'Тест' }, description: { ru: 'Описание' },
    location: { name: { ru: 'Бишкек' } }, startTime: START.toISOString(), endTime: END.toISOString(),
    capacity: 100, organizerId: USER_ID
  })))
  assert.equal(response.status, 403)
})

test('POST event rejects different organizerId', async (t) => {
  authAsManager(t, MANAGER_ID)
  const response = await eventsRoute.POST(request('/api/v1/events', 'POST', JSON.stringify({
    slug: 'test', title: { ru: 'Тест' }, description: { ru: 'Описание' },
    location: { name: { ru: 'Бишкек' } }, startTime: START.toISOString(), endTime: END.toISOString(),
    capacity: 100, organizerId: USER_ID
  })))
  assert.equal(response.status, 403)
})

test('POST event validates endTime > startTime', async (t) => {
  authAsManager(t, MANAGER_ID)
  const response = await eventsRoute.POST(request('/api/v1/events', 'POST', JSON.stringify({
    slug: 'test', title: { ru: 'Тест' }, description: { ru: 'Описание' },
    location: { name: { ru: 'Бишкек' } },
    startTime: END.toISOString(), endTime: START.toISOString(),
    capacity: 100, organizerId: MANAGER_ID
  })))
  assert.equal(response.status, 422)
})

test('POST event rejects duplicate slug', async (t) => {
  authAsManager(t, MANAGER_ID)
  t.mock.method(prisma.forum, 'create', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
    })
    throw error
  })
  const response = await eventsRoute.POST(request('/api/v1/events', 'POST', JSON.stringify({
    slug: 'dup', title: { ru: 'Тест' }, description: { ru: 'Описание' },
    location: { name: { ru: 'Бишкек' } }, startTime: START.toISOString(), endTime: END.toISOString(),
    capacity: 100, organizerId: MANAGER_ID
  })))
  assert.equal(response.status, 409)
})

// PATCH /api/v1/events/:id tests
test('PATCH event updates capacity', async (t) => {
  authAsManager(t, MANAGER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => ({ ...event, translations: event.translations, categories: event.categories }))
  t.mock.method(prisma.forum, 'update', async () => event)
  t.mock.method(prisma.eventRegistration, 'count', async () => 5)
  t.mock.method(prisma.ticket, 'count', async () => 0)
  t.mock.method(prisma.orderItem, 'count', async () => 0)
  const response = await eventRoute.PATCH(request(`/api/v1/events/${EVENT_ID}`, 'PATCH', JSON.stringify({ capacity: 150 })), params(EVENT_ID))
  assert.equal(response.status, 200)
})

test('PATCH event requires MANAGER role', async (t) => {
  t.mock.method(auth, 'requireManager', async () => NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }))
  const response = await eventRoute.PATCH(request(`/api/v1/events/${EVENT_ID}`, 'PATCH', JSON.stringify({ capacity: 150 })), params(EVENT_ID))
  assert.equal(response.status, 403)
})

test('PATCH event returns 404 when not found', async (t) => {
  authAsManager(t, MANAGER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => null)
  const response = await eventRoute.PATCH(request(`/api/v1/events/${EVENT_ID}`, 'PATCH', JSON.stringify({ capacity: 150 })), params(EVENT_ID))
  assert.equal(response.status, 404)
})

test('PATCH event rejects capacity below occupied', async (t) => {
  authAsManager(t, MANAGER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => ({ ...event, translations: event.translations, categories: event.categories }))
  t.mock.method(prisma.eventRegistration, 'count', async () => 50)
  t.mock.method(prisma.ticket, 'count', async () => 0)
  t.mock.method(prisma.orderItem, 'count', async () => 0)
  const response = await eventRoute.PATCH(request(`/api/v1/events/${EVENT_ID}`, 'PATCH', JSON.stringify({ capacity: 10 })), params(EVENT_ID))
  assert.equal(response.status, 409)
})

test('PATCH event rejects editing cancelled events', async (t) => {
  authAsManager(t, MANAGER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => ({ ...event, status: 'CANCELLED', translations: event.translations, categories: event.categories }))
  const response = await eventRoute.PATCH(request(`/api/v1/events/${EVENT_ID}`, 'PATCH', JSON.stringify({ capacity: 150 })), params(EVENT_ID))
  assert.equal(response.status, 409)
})

// DELETE /api/v1/events/:id tests
test('DELETE event soft deletes', async (t) => {
  authAsManager(t, MANAGER_ID)
  let updateArgs: any
  t.mock.method(prisma.forum, 'updateMany', async (args: any) => { updateArgs = args; return { count: 1 } })
  const response = await eventRoute.DELETE(request(`/api/v1/events/${EVENT_ID}`, 'DELETE'), params(EVENT_ID))
  assert.equal(response.status, 200)
  assert.equal(updateArgs.data.status, 'CANCELLED')
})

test('DELETE event requires MANAGER role', async (t) => {
  t.mock.method(auth, 'requireManager', async () => NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }))
  const response = await eventRoute.DELETE(request(`/api/v1/events/${EVENT_ID}`, 'DELETE'), params(EVENT_ID))
  assert.equal(response.status, 403)
})

test('DELETE event returns 404 when not found', async (t) => {
  authAsManager(t, MANAGER_ID)
  t.mock.method(prisma.forum, 'updateMany', async () => ({ count: 0 }))
  t.mock.method(prisma.forum, 'findUnique', async () => null)
  const response = await eventRoute.DELETE(request(`/api/v1/events/${EVENT_ID}`, 'DELETE'), params(EVENT_ID))
  assert.equal(response.status, 404)
})

// POST /api/v1/events/:id/register tests
test('POST registration creates successfully', async (t) => {
  authAs(t, USER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => ({ id: EVENT_ID, status: 'PUBLISHED', startsAt: START, registrationDeadline: FUTURE_DEADLINE, capacity: 10 }))
  t.mock.method(prisma.eventRegistration, 'findUnique', async () => null)
  t.mock.method(prisma.eventRegistration, 'count', async () => 5)
  t.mock.method(prisma.ticket, 'count', async () => 0)
  t.mock.method(prisma.orderItem, 'count', async () => 0)
  let createArgs: any
  t.mock.method(prisma.eventRegistration, 'create', async (args: any) => { createArgs = args; return registration })
  const response = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify({
    attendeeFirstName: 'Иван', attendeeLastName: 'Петров', attendeePhone: '+996700123456'
  })), params(EVENT_ID))
  assert.equal(response.status, 201)
  assert.equal(createArgs.data.userId, USER_ID)
})

test('POST registration requires authentication', async (t) => {
  t.mock.method(auth, 'requireAuth', async () => NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }))
  const response = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify({
    attendeeFirstName: 'Иван', attendeeLastName: 'Петров', attendeePhone: '+996700123456'
  })), params(EVENT_ID))
  assert.equal(response.status, 401)
})

test('POST registration rejects duplicate', async (t) => {
  authAs(t, USER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => ({ id: EVENT_ID, status: 'PUBLISHED', startsAt: START, registrationDeadline: FUTURE_DEADLINE, capacity: 10 }))
  t.mock.method(prisma.eventRegistration, 'findUnique', async () => registration)
  const response = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify({
    attendeeFirstName: 'Иван', attendeeLastName: 'Петров', attendeePhone: '+996700123456'
  })), params(EVENT_ID))
  assert.equal(response.status, 409)
})

test('POST registration rejects when capacity full', async (t) => {
  authAs(t, USER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => ({ id: EVENT_ID, status: 'PUBLISHED', startsAt: START, registrationDeadline: FUTURE_DEADLINE, capacity: 10 }))
  t.mock.method(prisma.eventRegistration, 'findUnique', async () => null)
  t.mock.method(prisma.eventRegistration, 'count', async () => 10)
  t.mock.method(prisma.ticket, 'count', async () => 0)
  t.mock.method(prisma.orderItem, 'count', async () => 0)
  const response = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify({
    attendeeFirstName: 'Иван', attendeeLastName: 'Петров', attendeePhone: '+996700123456'
  })), params(EVENT_ID))
  assert.equal(response.status, 409)
})

test('POST registration rejects past deadline', async (t) => {
  authAs(t, USER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => ({ id: EVENT_ID, status: 'PUBLISHED', startsAt: START, registrationDeadline: PAST_DEADLINE, capacity: 10 }))
  const response = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify({
    attendeeFirstName: 'Иван', attendeeLastName: 'Петров', attendeePhone: '+996700123456'
  })), params(EVENT_ID))
  assert.equal(response.status, 409)
})

test('POST registration rejects after event started', async (t) => {
  authAs(t, USER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => ({ id: EVENT_ID, status: 'PUBLISHED', startsAt: PAST_START, registrationDeadline: null, capacity: 10 }))
  const response = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify({
    attendeeFirstName: 'Иван', attendeeLastName: 'Петров', attendeePhone: '+996700123456'
  })), params(EVENT_ID))
  assert.equal(response.status, 409)
})

test('POST registration rejects unpublished event', async (t) => {
  authAs(t, USER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => ({ id: EVENT_ID, status: 'DRAFT', startsAt: START, registrationDeadline: FUTURE_DEADLINE, capacity: 10 }))
  const response = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify({
    attendeeFirstName: 'Иван', attendeeLastName: 'Петров', attendeePhone: '+996700123456'
  })), params(EVENT_ID))
  assert.equal(response.status, 409)
})

test('POST registration validates phone format', async (t) => {
  authAs(t, USER_ID)
  const response = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify({
    attendeeFirstName: 'Иван', attendeeLastName: 'Петров', attendeePhone: 'invalid'
  })), params(EVENT_ID))
  assert.equal(response.status, 422)
})

test('POST registration returns 404 for non-existent event', async (t) => {
  authAs(t, USER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => null)
  const response = await registerRoute.POST(request(`/api/v1/events/${EVENT_ID}/register`, 'POST', JSON.stringify({
    attendeeFirstName: 'Иван', attendeeLastName: 'Петров', attendeePhone: '+996700123456'
  })), params(EVENT_ID))
  assert.equal(response.status, 404)
})

// DELETE /api/v1/events/:id/register tests
test('DELETE registration cancels successfully', async (t) => {
  authAs(t, USER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => ({ id: EVENT_ID }))
  t.mock.method(prisma.eventRegistration, 'deleteMany', async () => ({ count: 1 }))
  const response = await registerRoute.DELETE(request(`/api/v1/events/${EVENT_ID}/register`, 'DELETE'), params(EVENT_ID))
  assert.equal(response.status, 200)
})

test('DELETE registration requires authentication', async (t) => {
  t.mock.method(auth, 'requireAuth', async () => NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }))
  const response = await registerRoute.DELETE(request(`/api/v1/events/${EVENT_ID}/register`, 'DELETE'), params(EVENT_ID))
  assert.equal(response.status, 401)
})

test('DELETE registration returns 404 when registration not found', async (t) => {
  authAs(t, USER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => ({ id: EVENT_ID }))
  t.mock.method(prisma.eventRegistration, 'deleteMany', async () => ({ count: 0 }))
  const response = await registerRoute.DELETE(request(`/api/v1/events/${EVENT_ID}/register`, 'DELETE'), params(EVENT_ID))
  assert.equal(response.status, 404)
})

// GET /api/v1/events/:id/registrations tests
test('GET registrations returns paginated list for MANAGER', async (t) => {
  authAsManager(t, MANAGER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => ({ id: EVENT_ID }))
  let findArgs: any
  t.mock.method(prisma.eventRegistration, 'findMany', async (args: any) => { findArgs = args; return [registration] })
  t.mock.method(prisma.eventRegistration, 'count', async () => 10)
  const response = await registrationsRoute.GET(request(`/api/v1/events/${EVENT_ID}/registrations?page=2&limit=5`), params(EVENT_ID))
  const body = await response.json() as any
  assert.equal(response.status, 200)
  assert.equal(findArgs.skip, 5)
  assert.equal(body.registrations.length, 1)
})

test('GET registrations requires MANAGER role', async (t) => {
  t.mock.method(auth, 'requireManager', async () => NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }))
  const response = await registrationsRoute.GET(request(`/api/v1/events/${EVENT_ID}/registrations`), params(EVENT_ID))
  assert.equal(response.status, 403)
})

test('GET registrations returns 404 when event not found', async (t) => {
  authAsManager(t, MANAGER_ID)
  t.mock.method(prisma.forum, 'findUnique', async () => null)
  const response = await registrationsRoute.GET(request(`/api/v1/events/${EVENT_ID}/registrations`), params(EVENT_ID))
  assert.equal(response.status, 404)
})

// GET /api/v1/events/my-registrations tests
test('GET my-registrations returns user registrations with event details', async (t) => {
  authAs(t, USER_ID)
  let findArgs: any
  t.mock.method(prisma.eventRegistration, 'findMany', async (args: any) => { findArgs = args; return [{ ...registration, forum: event }] })
  t.mock.method(prisma.eventRegistration, 'count', async () => 5)
  const response = await myRegistrationsRoute.GET(request('/api/v1/events/my-registrations?page=1&limit=10'))
  const body = await response.json() as any
  assert.equal(response.status, 200)
  assert.equal(findArgs.where.userId, USER_ID)
  assert.ok(body.registrations[0].event)
})

test('GET my-registrations requires authentication', async (t) => {
  t.mock.method(auth, 'requireAuth', async () => NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }))
  const response = await myRegistrationsRoute.GET(request('/api/v1/events/my-registrations'))
  assert.equal(response.status, 401)
})

test('GET my-registrations supports pagination', async (t) => {
  authAs(t, USER_ID)
  let findArgs: any
  t.mock.method(prisma.eventRegistration, 'findMany', async (args: any) => { findArgs = args; return [] })
  t.mock.method(prisma.eventRegistration, 'count', async () => 25)
  const response = await myRegistrationsRoute.GET(request('/api/v1/events/my-registrations?page=3&limit=10'))
  const body = await response.json() as any
  assert.equal(response.status, 200)
  assert.equal(findArgs.skip, 20)
  assert.equal(body.pagination.page, 3)
})
