import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest, NextResponse } from 'next/server'

// Keep this route-level test isolated from any database. Prisma methods are
// stubbed below, and the API integration runner clears database URLs.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = ''
process.env.DIRECT_URL = ''
process.env.JWT_SECRET = 'users-profile-test-access-secret'
process.env.JWT_REFRESH_SECRET = 'users-profile-test-refresh-secret'

const prisma = {
  user: {
    findUnique: async (_args: unknown) => null,
    update: async (_args: unknown) => null,
  },
}

// Replace the DB module before loading routes; no PrismaClient is constructed
// and no database connection can be opened by these tests.
const moduleLoader = require('node:module') as any
const originalLoad = moduleLoader._load
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/db') return { prisma, default: prisma }
  return originalLoad.call(this, request, parent, isMain)
}

const authMiddleware = require('../../../lib/auth/middleware') as typeof import('../../../lib/auth/middleware')
const ownProfileRoute = require('../../../app/api/v1/users/me/route') as typeof import('../../../app/api/v1/users/me/route')
const publicProfileRoute = require('../../../app/api/v1/users/[id]/route') as typeof import('../../../app/api/v1/users/[id]/route')
moduleLoader._load = originalLoad

const USER_ID = '9f6a5d17-a1b8-47c1-9a2f-d223e4b4da19'
const OTHER_USER_ID = '207d88cb-9f36-4bc2-8b5b-f6c3a5c4e120'

const ownProfile = {
  id: USER_ID,
  firstName: 'Айжан',
  lastName: 'Осмонова',
  phone: '+996555123456',
  phoneVerifiedAt: new Date('2026-01-02T03:04:05.000Z'),
  email: 'aizhan@example.test',
  role: 'USER',
  status: 'ACTIVE',
  preferredLocale: 'RU',
  announcementsPushEnabled: true,
  createdAt: new Date('2025-01-02T03:04:05.000Z'),
  updatedAt: new Date('2026-01-02T03:04:05.000Z'),
}

function authenticatedUser() {
  return { user: { userId: USER_ID, role: 'USER', status: 'ACTIVE' } }
}

function apiRequest(path: string, method = 'GET', body?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  })
}

test('GET /api/v1/users/me returns only the authenticated user profile', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())
  let query: any
  t.mock.method(prisma.user, 'findUnique', async (args: any) => {
    query = args
    return ownProfile
  })

  const response = await ownProfileRoute.GET(apiRequest('/api/v1/users/me'))
  const body = await response.json() as { user: Record<string, unknown> }

  assert.equal(response.status, 200)
  assert.equal(body.user.id, USER_ID)
  assert.equal(body.user.phone, ownProfile.phone)
  assert.equal(body.user.role, 'USER')
  assert.equal(query.where.id, USER_ID)
  assert.equal(query.select.sessions, undefined)
  assert.equal(query.select.authIdentities, undefined)
})

test('GET /api/v1/users/me returns the auth response without querying a profile when unauthenticated', async (t) => {
  const unauthorized = NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  t.mock.method(authMiddleware, 'requireAuth', async () => unauthorized)
  let queried = false
  t.mock.method(prisma.user, 'findUnique', async () => {
    queried = true
    return ownProfile
  })

  const response = await ownProfileRoute.GET(apiRequest('/api/v1/users/me'))

  assert.equal(response.status, 401)
  assert.equal(queried, false)
})

test('PATCH /api/v1/users/me updates allowed fields for the authenticated user and audits success', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())
  let updateArgs: any
  t.mock.method(prisma.user, 'update', async (args: any) => {
    updateArgs = args
    return { ...ownProfile, ...args.data }
  })
  let auditRecord: Record<string, unknown> | undefined
  t.mock.method(console, 'info', (line: string) => {
    try { auditRecord = JSON.parse(line) as Record<string, unknown> } catch { /* unrelated output */ }
  })

  const response = await ownProfileRoute.PATCH(apiRequest(
    '/api/v1/users/me',
    'PATCH',
    JSON.stringify({ firstName: 'Айгуль', preferredLocale: 'KY', announcementsPushEnabled: false })
  ))
  const body = await response.json() as { user: Record<string, unknown> }

  assert.equal(response.status, 200)
  assert.equal(body.user.firstName, 'Айгуль')
  assert.equal(updateArgs.where.id, USER_ID)
  assert.deepEqual(updateArgs.data, {
    firstName: 'Айгуль',
    preferredLocale: 'KY',
    announcementsPushEnabled: false,
  })
  assert.equal(auditRecord?.eventType, 'USER_PROFILE_UPDATED')
  assert.equal(auditRecord?.userId, USER_ID)
})

test('PATCH rejects protected fields and does not call Prisma update', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())
  let updated = false
  t.mock.method(prisma.user, 'update', async () => {
    updated = true
    return ownProfile
  })

  const response = await ownProfileRoute.PATCH(apiRequest(
    '/api/v1/users/me',
    'PATCH',
    JSON.stringify({ role: 'SUPER_ADMIN', phoneVerifiedAt: null })
  ))
  const body = await response.json() as { error: { code: string } }

  assert.equal(response.status, 422)
  assert.equal(body.error.code, 'VALIDATION_ERROR')
  assert.equal(updated, false)
})

test('PATCH rejects unknown fields', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())
  let updated = false
  t.mock.method(prisma.user, 'update', async () => {
    updated = true
    return ownProfile
  })

  const response = await ownProfileRoute.PATCH(apiRequest(
    '/api/v1/users/me',
    'PATCH',
    JSON.stringify({ firstName: 'Айжан', unexpectedField: 'value' })
  ))

  assert.equal(response.status, 422)
  assert.equal(updated, false)
})

test('PATCH rejects invalid types and an empty update object', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())
  let updateCalls = 0
  t.mock.method(prisma.user, 'update', async () => {
    updateCalls += 1
    return ownProfile
  })

  const invalidType = await ownProfileRoute.PATCH(apiRequest(
    '/api/v1/users/me', 'PATCH', JSON.stringify({ firstName: 42 })
  ))
  const emptyUpdate = await ownProfileRoute.PATCH(apiRequest('/api/v1/users/me', 'PATCH', '{}'))

  assert.equal(invalidType.status, 422)
  assert.equal(emptyUpdate.status, 422)
  assert.equal(updateCalls, 0)
})

test('PATCH rejects empty and malformed JSON bodies', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())

  const emptyBody = await ownProfileRoute.PATCH(apiRequest('/api/v1/users/me', 'PATCH', ''))
  const malformedBody = await ownProfileRoute.PATCH(apiRequest('/api/v1/users/me', 'PATCH', '{ invalid'))

  assert.equal(emptyBody.status, 422)
  assert.equal(malformedBody.status, 422)
})

test('GET /api/v1/users/[id] returns only public fields, including for another user', async (t) => {
  let query: any
  t.mock.method(prisma.user, 'findUnique', async (args: any) => {
    query = args
    return { id: OTHER_USER_ID, firstName: 'Бакыт', lastName: 'Садыков' }
  })

  const response = await publicProfileRoute.GET(
    apiRequest(`/api/v1/users/${OTHER_USER_ID}`),
    { params: Promise.resolve({ id: OTHER_USER_ID }) }
  )
  const body = await response.json() as { user: Record<string, unknown> }

  assert.equal(response.status, 200)
  assert.deepEqual(body.user, {
    id: OTHER_USER_ID,
    firstName: 'Бакыт',
    lastName: 'Садыков',
  })
  assert.equal(query.where.id, OTHER_USER_ID)
  assert.deepEqual(query.select, { id: true, firstName: true, lastName: true })
  for (const privateField of ['phone', 'email', 'role', 'status', 'phoneVerifiedAt']) {
    assert.equal(privateField in body.user, false)
  }
})

test('GET /api/v1/users/[id] returns 404 for a missing user', async (t) => {
  t.mock.method(prisma.user, 'findUnique', async () => null)

  const response = await publicProfileRoute.GET(
    apiRequest(`/api/v1/users/${OTHER_USER_ID}`),
    { params: Promise.resolve({ id: OTHER_USER_ID }) }
  )
  const body = await response.json() as { error: { code: string } }

  assert.equal(response.status, 404)
  assert.equal(body.error.code, 'USER_NOT_FOUND')
})
