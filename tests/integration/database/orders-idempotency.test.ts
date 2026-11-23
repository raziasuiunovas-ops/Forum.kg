import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, afterEach, beforeEach, test } from 'node:test'
import { NextRequest } from 'next/server'
import { ForumStatus, Locale, UserRole, UserStatus } from '@prisma/client'

process.env.JWT_SECRET = 'forum-kg-order-idempotency-test-access-key'
process.env.JWT_REFRESH_SECRET = 'forum-kg-order-idempotency-test-refresh-key'

const { prisma } = require('../../../lib/db') as typeof import('../../../lib/db')
const authMiddleware = require('../../../lib/auth/middleware') as typeof import('../../../lib/auth/middleware')
const ordersRoute = require('../../../app/api/v1/orders/route') as typeof import('../../../app/api/v1/orders/route')

let userId = ''
let forumId = ''
let categoryId = ''

beforeEach(async () => {
  const user = await prisma.user.create({
    data: { email: `order-idempotency-${randomUUID()}@example.test` },
    select: { id: true },
  })
  userId = user.id

  const forum = await prisma.forum.create({
    data: {
      slug: `order-idempotency-${randomUUID()}`,
      status: ForumStatus.PUBLISHED,
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      qrExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      capacity: 50,
      maxTicketsPerAccount: 20,
      createdById: userId,
      translations: {
        create: { locale: Locale.EN, title: 'Idempotency integration test' },
      },
      categories: {
        create: {
          code: 'GENERAL',
          priceMinor: 1500,
          capacity: 50,
          translations: {
            create: { locale: Locale.EN, name: 'General' },
          },
        },
      },
    },
    select: { id: true, categories: { select: { id: true } } },
  })
  forumId = forum.id
  categoryId = forum.categories[0].id
})

afterEach(async () => {
  if (!userId) return

  await prisma.orderIdempotency.deleteMany({ where: { userId } })
  await prisma.payment.deleteMany({ where: { order: { userId } } })
  await prisma.order.deleteMany({ where: { userId } })
  await prisma.forum.deleteMany({ where: { id: forumId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  userId = ''
  forumId = ''
  categoryId = ''
})

after(async () => {
  await prisma.$disconnect()
})

function authenticateAsFixtureUser(t: any): void {
  t.mock.method(authMiddleware, 'requireAuth', async () => ({
    user: { userId, role: UserRole.USER, status: UserStatus.ACTIVE },
  }))
}

function orderRequest(
  key: string,
  participantFirstName = 'Aida',
  itemCount = 1
): NextRequest {
  return new NextRequest('http://localhost/api/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify({
      forumId,
      items: Array.from({ length: itemCount }, () => ({
        ticketCategoryId: categoryId,
        participantFirstName,
        participantLastName: 'Test',
      })),
    }),
  })
}

async function countCreatedRows() {
  const [orders, payments, items, idempotencyKeys] = await Promise.all([
    prisma.order.count({ where: { userId, forumId } }),
    prisma.payment.count({ where: { order: { userId, forumId } } }),
    prisma.orderItem.count({ where: { order: { userId, forumId } } }),
    prisma.orderIdempotency.count({ where: { userId } }),
  ])

  return { orders, payments, items, idempotencyKeys }
}

test('repeating an identical request returns its persisted original response', async (t) => {
  authenticateAsFixtureUser(t)
  const key = `repeat-${randomUUID()}`

  const first = await ordersRoute.POST(orderRequest(key))
  const firstBody = await first.json()
  const replay = await ordersRoute.POST(orderRequest(key))

  assert.equal(first.status, 201)
  assert.equal(replay.status, first.status)
  assert.deepEqual(await replay.json(), firstBody)
  assert.deepEqual(await countCreatedRows(), {
    orders: 1,
    payments: 1,
    items: 1,
    idempotencyKeys: 1,
  })

  const saved = await prisma.orderIdempotency.findFirstOrThrow({
    where: { userId },
    select: { keyHash: true, fingerprint: true, status: true, orderId: true, responseStatus: true, response: true },
  })
  assert.notEqual(saved.keyHash, key)
  assert.match(saved.keyHash, /^[a-f0-9]{64}$/)
  assert.equal(saved.status, 'COMPLETED')
  assert.ok(saved.orderId)
  assert.equal(saved.responseStatus, 201)
  assert.deepEqual(saved.response, firstBody)
})

test('reusing a key with different validated request data returns 409', async (t) => {
  authenticateAsFixtureUser(t)
  const key = `different-body-${randomUUID()}`

  const first = await ordersRoute.POST(orderRequest(key, 'Aida'))
  assert.equal(first.status, 201)

  const conflict = await ordersRoute.POST(orderRequest(key, 'Bermet'))
  const body = await conflict.json() as { error: { code: string } }

  assert.equal(conflict.status, 409)
  assert.equal(body.error.code, 'IDEMPOTENCY_KEY_REUSED')
  assert.deepEqual(await countCreatedRows(), {
    orders: 1,
    payments: 1,
    items: 1,
    idempotencyKeys: 1,
  })
})

test('simultaneous requests with one key create only one order and reservation', async (t) => {
  authenticateAsFixtureUser(t)
  const key = `concurrent-${randomUUID()}`

  const responses = await Promise.all([
    ordersRoute.POST(orderRequest(key)),
    ordersRoute.POST(orderRequest(key)),
  ])
  const bodies = await Promise.all(responses.map((response) => response.json()))

  assert.deepEqual(responses.map(({ status }) => status), [201, 201])
  assert.deepEqual(bodies[0], bodies[1])
  assert.deepEqual(await countCreatedRows(), {
    orders: 1,
    payments: 1,
    items: 1,
    idempotencyKeys: 1,
  })
})

test('a failed order transaction leaves no key that blocks a later retry', async (t) => {
  authenticateAsFixtureUser(t)
  const key = `rollback-${randomUUID()}`
  await prisma.forum.update({ where: { id: forumId }, data: { capacity: 1 } })

  const failed = await ordersRoute.POST(orderRequest(key, 'Aida', 2))
  assert.equal(failed.status, 400)
  assert.deepEqual(await countCreatedRows(), {
    orders: 0,
    payments: 0,
    items: 0,
    idempotencyKeys: 0,
  })

  await prisma.forum.update({ where: { id: forumId }, data: { capacity: 50 } })
  const retried = await ordersRoute.POST(orderRequest(key, 'Aida', 2))
  assert.equal(retried.status, 201)
  assert.deepEqual(await countCreatedRows(), {
    orders: 1,
    payments: 1,
    items: 2,
    idempotencyKeys: 1,
  })
})
