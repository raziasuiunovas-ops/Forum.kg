import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { after, test } from 'node:test'
import { NextRequest } from 'next/server'
import { ForumStatus, Locale, OrderStatus, TicketStatus, UserRole, UserStatus } from '@prisma/client'

function isLocalTestDatabase(connectionString: string | undefined): connectionString is string {
  if (!connectionString) return false
  try {
    const url = new URL(connectionString)
    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
    return ['postgres:', 'postgresql:'].includes(url.protocol)
      && localHosts.has(url.hostname)
      && databaseName.endsWith('_test')
  } catch {
    return false
  }
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL

if (!isLocalTestDatabase(testDatabaseUrl)) {
  test('PostgreSQL permits exactly one check-in for simultaneous scans of the same QR', {
    skip: 'requires TEST_DATABASE_URL pointing to a local PostgreSQL database ending in _test',
  }, () => {})
} else {
  // Override only this test process before importing Prisma. Never fall back to DATABASE_URL.
  process.env.DATABASE_URL = testDatabaseUrl
  process.env.DIRECT_URL = testDatabaseUrl

  const { prisma } = require('../../../lib/db') as typeof import('../../../lib/db')
  const authMiddleware = require('../../../lib/auth/middleware') as typeof import('../../../lib/auth/middleware')
  const checkInRoute = require('../../../app/api/v1/check-in/validate/route') as typeof import('../../../app/api/v1/check-in/validate/route')

  const qrToken = randomBytes(32).toString('base64url')
  const ticketNumber = `TIX-CHECKIN-${randomBytes(8).toString('hex')}`
  const qrData = `FORUM.KG|${ticketNumber}|${qrToken}`
  const qrTokenHash = createHash('sha256').update(qrToken).digest('hex')

  let createdUserIds: string[] = []
  let forumId = ''
  let orderId = ''
  let orderItemId = ''
  let ticketId = ''

  async function authenticateAsScanner(): Promise<void> {
  // Patch only the handler's authorization boundary; all ticket/check-in reads and writes use PostgreSQL.
  const originalRequireRole = authMiddleware.requireRole
  authMiddleware.requireRole = async () => ({
    user: { userId: createdUserIds[0], role: UserRole.SCANNER, status: UserStatus.ACTIVE },
  })
  try {
    await runConcurrentCheckIns()
  } finally {
    authMiddleware.requireRole = originalRequireRole
  }
}

  async function runConcurrentCheckIns(): Promise<void> {
  const requests = [1, 2].map(() => new NextRequest('http://localhost/api/v1/check-in/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qrData, forumId }),
  }))
  const responses = await Promise.all(requests.map((request) => checkInRoute.POST(request)))
  const statuses = responses.map(({ status }) => status)

  assert.equal(statuses.filter((status) => status === 200).length, 1)
  assert.ok(statuses.every((status) => status === 200 || status === 400 || status === 409))
  assert.equal(await prisma.checkIn.count({ where: { ticketId } }), 1)
  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { status: true } })
  assert.equal(ticket.status, TicketStatus.USED)
}

  test('PostgreSQL permits exactly one check-in for simultaneous scans of the same QR', async () => {
  const users = await prisma.user.createManyAndReturn({
    data: [0, 1, 2].map((index) => ({ email: `ticket-checkin-${randomBytes(12).toString('hex')}-${index}@example.test` })),
    select: { id: true },
  })
  createdUserIds = users.map(({ id }) => id)

  const forum = await prisma.forum.create({
    data: {
      slug: `ticket-checkin-${randomBytes(12).toString('hex')}`,
      status: ForumStatus.PUBLISHED,
      startsAt: new Date(Date.now() + 60_000),
      qrExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      capacity: 10,
      createdById: createdUserIds[1],
      translations: { create: { locale: Locale.RU, title: 'Check-in concurrency fixture' } },
      categories: {
        create: {
          code: 'GENERAL',
          priceMinor: 1500,
          translations: { create: { locale: Locale.RU, name: 'General' } },
        },
      },
    },
    select: { id: true, categories: { select: { id: true } } },
  })
  forumId = forum.id

  const order = await prisma.order.create({
    data: {
      orderNumber: `ORD-CHECKIN-${randomBytes(10).toString('hex')}`,
      userId: createdUserIds[2],
      forumId,
      status: OrderStatus.PAID,
      paidAt: new Date(),
      subtotalMinor: 1500,
      totalMinor: 1500,
      currency: 'KGS',
    },
    select: { id: true },
  })
  orderId = order.id

  const orderItem = await prisma.orderItem.create({
    data: {
      orderId,
      ticketCategoryId: forum.categories[0].id,
      participantFirstName: 'Test',
      participantLastName: 'Attendee',
      unitPriceMinor: 1500,
    },
    select: { id: true },
  })
  orderItemId = orderItem.id

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      orderItemId,
      forumId,
      buyerId: createdUserIds[2],
      status: TicketStatus.ACTIVE,
      qrTokenHash,
      qrTokenEncrypted: 'concurrency-test-only',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    select: { id: true },
  })
  ticketId = ticket.id

  await authenticateAsScanner()
})

  after(async () => {
  if (ticketId) await prisma.checkIn.deleteMany({ where: { ticketId } })
  if (ticketId) await prisma.ticket.deleteMany({ where: { id: ticketId } })
  if (orderItemId) await prisma.orderItem.deleteMany({ where: { id: orderItemId } })
  if (orderId) await prisma.order.deleteMany({ where: { id: orderId } })
  if (forumId) await prisma.forum.deleteMany({ where: { id: forumId } })
  if (createdUserIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
  await prisma.$disconnect()
  })
}
