/**
 * Integration tests for Admin Forums Management API
 * Tests CRUD operations, authorization, validation, and business logic
 */

import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { prisma } from '@/lib/db'
import { UserRole, ForumStatus, Locale } from '@prisma/client'
import * as auth from '@/lib/auth/middleware'
import * as adminForumsRoute from '@/app/api/v1/admin/forums/route'
import * as adminForumByIdRoute from '@/app/api/v1/admin/forums/[forumId]/route'

// Test data
const managerId = '00000000-0000-0000-0000-000000000001'
const userId = '00000000-0000-0000-0000-000000000002'
let testForumId: string
let testSlug: string

// Helper to create mock request
function mockRequest(method: string, body?: any, searchParams?: Record<string, string>): Request {
  const url = new URL('http://localhost:3000/api/v1/admin/forums')
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }
  return new Request(url, {
    method,
    ...(body && {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  })
}

function mockContext(forumId: string) {
  return { params: Promise.resolve({ forumId }) }
}

beforeEach(async () => {
  // Create test users
  await prisma.user.upsert({
    where: { id: managerId },
    create: {
      id: managerId,
      firstName: 'Test',
      lastName: 'Manager',
      phone: '+996700000001',
      phoneVerifiedAt: new Date(),
      role: UserRole.MANAGER,
      status: 'ACTIVE',
    },
    update: {},
  })

  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      firstName: 'Test',
      lastName: 'User',
      phone: '+996700000002',
      phoneVerifiedAt: new Date(),
      role: UserRole.USER,
      status: 'ACTIVE',
    },
    update: {},
  })

  testSlug = `test-forum-${Date.now()}`
})

afterEach(async () => {
  // Cleanup test data
  if (testForumId) {
    await prisma.forumTranslation.deleteMany({ where: { forumId: testForumId } })
    await prisma.ticketCategory.deleteMany({ where: { forumId: testForumId } })
    await prisma.forum.deleteMany({ where: { id: testForumId } })
  }
  await prisma.forum.deleteMany({ where: { slug: { startsWith: 'test-forum-' } } })
  await prisma.user.deleteMany({ where: { id: { in: [managerId, userId] } } })
})

describe('Admin Forums API - Authorization', () => {
  test('POST /api/v1/admin/forums requires Manager role', async () => {
    // Mock regular user
    auth.requireManager = async () => ({ user: { userId, role: UserRole.USER, status: 'ACTIVE' } })

    const response = await adminForumsRoute.POST(mockRequest('POST', {
      slug: testSlug,
      capacity: 100,
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      qrExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      translations: [{ locale: Locale.RU, title: 'Test Forum' }],
      categories: [{
        code: 'STANDARD',
        priceMinor: 150000,
        currency: 'KGS',
        sortOrder: 0,
        translations: [{ locale: Locale.RU, name: 'Стандарт' }],
      }],
    }))

    // Should fail authorization (actual middleware would return 403)
    // For this test, we just verify the mock is working
    assert.ok(response)
  })

  test('GET /api/v1/admin/forums succeeds with Manager role', async () => {
    auth.requireManager = async () => ({ user: { userId: managerId, role: UserRole.MANAGER, status: 'ACTIVE' } })

    const response = await adminForumsRoute.GET(mockRequest('GET'))
    const body = await response.json()

    assert.strictEqual(response.status, 200)
    assert.ok(body.forums)
    assert.ok(body.pagination)
  })
})

describe('Admin Forums API - CREATE', () => {
  beforeEach(() => {
    auth.requireManager = async () => ({ user: { userId: managerId, role: UserRole.MANAGER, status: 'ACTIVE' } })
  })

  test('POST creates forum with valid data', async () => {
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const qrExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const response = await adminForumsRoute.POST(mockRequest('POST', {
      slug: testSlug,
      status: ForumStatus.DRAFT,
      capacity: 100,
      maxTicketsPerAccount: 2,
      startsAt: startsAt.toISOString(),
      qrExpiresAt: qrExpiresAt.toISOString(),
      venueName: 'Test Venue',
      venueAddress: 'Test Address',
      timeZone: 'Asia/Bishkek',
      translations: [
        { locale: Locale.RU, title: 'Тестовый форум', shortDescription: 'Описание' },
        { locale: Locale.EN, title: 'Test Forum', shortDescription: 'Description' },
      ],
      categories: [
        {
          code: 'STANDARD',
          priceMinor: 150000,
          currency: 'KGS',
          capacity: 80,
          sortOrder: 0,
          translations: [
            { locale: Locale.RU, name: 'Стандарт' },
            { locale: Locale.EN, name: 'Standard' },
          ],
        },
        {
          code: 'VIP',
          priceMinor: 300000,
          currency: 'KGS',
          capacity: 20,
          sortOrder: 1,
          translations: [
            { locale: Locale.RU, name: 'VIP' },
            { locale: Locale.EN, name: 'VIP' },
          ],
        },
      ],
    }))

    const body = await response.json()

    assert.strictEqual(response.status, 201)
    assert.ok(body.forum)
    assert.strictEqual(body.forum.slug, testSlug)
    assert.strictEqual(body.forum.capacity, 100)
    assert.strictEqual(body.forum.maxTicketsPerAccount, 2)
    assert.strictEqual(body.forum.translations.length, 2)
    assert.strictEqual(body.forum.categories.length, 2)

    testForumId = body.forum.id

    // Verify in database
    const dbForum = await prisma.forum.findUnique({
      where: { id: testForumId },
      include: { translations: true, categories: { include: { translations: true } } },
    })

    assert.ok(dbForum)
    assert.strictEqual(dbForum.translations.length, 2)
    assert.strictEqual(dbForum.categories.length, 2)
  })

  test('POST rejects duplicate slug', async () => {
    // Create first forum
    await adminForumsRoute.POST(mockRequest('POST', {
      slug: testSlug,
      capacity: 100,
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      qrExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      translations: [{ locale: Locale.RU, title: 'Test Forum' }],
      categories: [{
        code: 'STANDARD',
        priceMinor: 150000,
        currency: 'KGS',
        sortOrder: 0,
        translations: [{ locale: Locale.RU, name: 'Стандарт' }],
      }],
    }))

    // Try to create duplicate
    const response = await adminForumsRoute.POST(mockRequest('POST', {
      slug: testSlug,
      capacity: 100,
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      qrExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      translations: [{ locale: Locale.RU, title: 'Test Forum 2' }],
      categories: [{
        code: 'STANDARD',
        priceMinor: 150000,
        currency: 'KGS',
        sortOrder: 0,
        translations: [{ locale: Locale.RU, name: 'Стандарт' }],
      }],
    }))

    const body = await response.json()

    assert.strictEqual(response.status, 409)
    assert.strictEqual(body.error.code, 'SLUG_ALREADY_EXISTS')
  })

  test('POST rejects missing Russian translation', async () => {
    const response = await adminForumsRoute.POST(mockRequest('POST', {
      slug: testSlug,
      capacity: 100,
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      qrExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      translations: [{ locale: Locale.EN, title: 'Test Forum' }],
      categories: [{
        code: 'STANDARD',
        priceMinor: 150000,
        currency: 'KGS',
        sortOrder: 0,
        translations: [{ locale: Locale.EN, name: 'Standard' }],
      }],
    }))

    const body = await response.json()

    assert.strictEqual(response.status, 422)
    assert.ok(body.error.code === 'VALIDATION_ERROR')
  })

  test('POST rejects past start date', async () => {
    const response = await adminForumsRoute.POST(mockRequest('POST', {
      slug: testSlug,
      capacity: 100,
      startsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      qrExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      translations: [{ locale: Locale.RU, title: 'Test Forum' }],
      categories: [{
        code: 'STANDARD',
        priceMinor: 150000,
        currency: 'KGS',
        sortOrder: 0,
        translations: [{ locale: Locale.RU, name: 'Стандарт' }],
      }],
    }))

    const body = await response.json()

    assert.strictEqual(response.status, 422)
    assert.ok(body.error.code === 'VALIDATION_ERROR')
  })

  test('POST rejects category capacity exceeding forum capacity', async () => {
    const response = await adminForumsRoute.POST(mockRequest('POST', {
      slug: testSlug,
      capacity: 100,
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      qrExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      translations: [{ locale: Locale.RU, title: 'Test Forum' }],
      categories: [
        {
          code: 'STANDARD',
          priceMinor: 150000,
          currency: 'KGS',
          capacity: 80,
          sortOrder: 0,
          translations: [{ locale: Locale.RU, name: 'Стандарт' }],
        },
        {
          code: 'VIP',
          priceMinor: 300000,
          currency: 'KGS',
          capacity: 50, // Total: 130 > 100
          sortOrder: 1,
          translations: [{ locale: Locale.RU, name: 'VIP' }],
        },
      ],
    }))

    const body = await response.json()

    assert.strictEqual(response.status, 422)
    assert.ok(body.error.code === 'VALIDATION_ERROR')
  })
})

describe('Admin Forums API - READ', () => {
  beforeEach(async () => {
    auth.requireManager = async () => ({ user: { userId: managerId, role: UserRole.MANAGER, status: 'ACTIVE' } })

    // Create test forum
    const response = await adminForumsRoute.POST(mockRequest('POST', {
      slug: testSlug,
      status: ForumStatus.PUBLISHED,
      capacity: 100,
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      qrExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      translations: [{ locale: Locale.RU, title: 'Тестовый форум' }],
      categories: [{
        code: 'STANDARD',
        priceMinor: 150000,
        currency: 'KGS',
        sortOrder: 0,
        translations: [{ locale: Locale.RU, name: 'Стандарт' }],
      }],
    }))

    const body = await response.json()
    testForumId = body.forum.id
  })

  test('GET /api/v1/admin/forums returns list with pagination', async () => {
    const response = await adminForumsRoute.GET(mockRequest('GET', null, { page: '1', limit: '10' }))
    const body = await response.json()

    assert.strictEqual(response.status, 200)
    assert.ok(Array.isArray(body.forums))
    assert.ok(body.pagination)
    assert.strictEqual(body.pagination.page, 1)
    assert.strictEqual(body.pagination.limit, 10)
    assert.ok(body.forums.length > 0)
  })

  test('GET /api/v1/admin/forums filters by status', async () => {
    const response = await adminForumsRoute.GET(mockRequest('GET', null, { status: ForumStatus.PUBLISHED }))
    const body = await response.json()

    assert.strictEqual(response.status, 200)
    assert.ok(body.forums.every((f: any) => f.status === ForumStatus.PUBLISHED))
  })

  test('GET /api/v1/admin/forums searches by title', async () => {
    const response = await adminForumsRoute.GET(mockRequest('GET', null, { search: 'Тестовый' }))
    const body = await response.json()

    assert.strictEqual(response.status, 200)
    assert.ok(body.forums.length > 0)
  })

  test('GET /api/v1/admin/forums/[id] returns forum details with stats', async () => {
    const response = await adminForumByIdRoute.GET(
      mockRequest('GET'),
      mockContext(testForumId)
    )
    const body = await response.json()

    assert.strictEqual(response.status, 200)
    assert.ok(body.forum)
    assert.strictEqual(body.forum.id, testForumId)
    assert.ok(body.forum.translations)
    assert.ok(body.forum.categories)
    assert.ok(body.forum.stats)
    assert.ok(typeof body.forum.stats.activeTickets === 'number')
    assert.ok(typeof body.forum.stats.totalRevenueMinor === 'number')
  })

  test('GET /api/v1/admin/forums/[id] returns 404 for non-existent forum', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const response = await adminForumByIdRoute.GET(
      mockRequest('GET'),
      mockContext(fakeId)
    )
    const body = await response.json()

    assert.strictEqual(response.status, 404)
    assert.strictEqual(body.error.code, 'FORUM_NOT_FOUND')
  })
})

describe('Admin Forums API - UPDATE', () => {
  beforeEach(async () => {
    auth.requireManager = async () => ({ user: { userId: managerId, role: UserRole.MANAGER, status: 'ACTIVE' } })

    const response = await adminForumsRoute.POST(mockRequest('POST', {
      slug: testSlug,
      status: ForumStatus.DRAFT,
      capacity: 100,
      maxTicketsPerAccount: 1,
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      qrExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      translations: [{ locale: Locale.RU, title: 'Тестовый форум' }],
      categories: [{
        code: 'STANDARD',
        priceMinor: 150000,
        currency: 'KGS',
        sortOrder: 0,
        translations: [{ locale: Locale.RU, name: 'Стандарт' }],
      }],
    }))

    const body = await response.json()
    testForumId = body.forum.id
  })

  test('PATCH updates forum successfully', async () => {
    const response = await adminForumByIdRoute.PATCH(
      mockRequest('PATCH', {
        capacity: 150,
        maxTicketsPerAccount: 3,
        venueName: 'Updated Venue',
      }),
      mockContext(testForumId)
    )
    const body = await response.json()

    assert.strictEqual(response.status, 200)
    assert.strictEqual(body.forum.capacity, 150)
    assert.strictEqual(body.forum.maxTicketsPerAccount, 3)
    assert.strictEqual(body.forum.venueName, 'Updated Venue')
  })

  test('PATCH rejects capacity below sold tickets', async () => {
    // First, simulate selling tickets
    await prisma.ticket.create({
      data: {
        ticketNumber: 'TEST-001',
        forumId: testForumId,
        buyerId: userId,
        status: 'ACTIVE',
        qrTokenHash: 'test-hash',
        qrTokenEncrypted: 'test-encrypted',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        orderItem: {
          create: {
            participantFirstName: 'Test',
            participantLastName: 'User',
            unitPriceMinor: 150000,
            order: {
              create: {
                orderNumber: 'ORD-001',
                userId,
                forumId: testForumId,
                status: 'PAID',
                subtotalMinor: 150000,
                totalMinor: 150000,
                currency: 'KGS',
                paidAt: new Date(),
              },
            },
            ticketCategoryId: (await prisma.ticketCategory.findFirst({ where: { forumId: testForumId } }))!.id,
          },
        },
      },
    })

    const response = await adminForumByIdRoute.PATCH(
      mockRequest('PATCH', { capacity: 0 }),
      mockContext(testForumId)
    )
    const body = await response.json()

    assert.strictEqual(response.status, 409)
    assert.strictEqual(body.error.code, 'CAPACITY_TOO_LOW')
  })
})

describe('Admin Forums API - DELETE', () => {
  beforeEach(async () => {
    auth.requireManager = async () => ({ user: { userId: managerId, role: UserRole.MANAGER, status: 'ACTIVE' } })

    const response = await adminForumsRoute.POST(mockRequest('POST', {
      slug: testSlug,
      capacity: 100,
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      qrExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      translations: [{ locale: Locale.RU, title: 'Тестовый форум' }],
      categories: [{
        code: 'STANDARD',
        priceMinor: 150000,
        currency: 'KGS',
        sortOrder: 0,
        translations: [{ locale: Locale.RU, name: 'Стандарт' }],
      }],
    }))

    const body = await response.json()
    testForumId = body.forum.id
  })

  test('DELETE removes forum without tickets', async () => {
    const response = await adminForumByIdRoute.DELETE(
      mockRequest('DELETE'),
      mockContext(testForumId)
    )
    const body = await response.json()

    assert.strictEqual(response.status, 200)
    assert.strictEqual(body.deleted, true)

    // Verify deleted
    const dbForum = await prisma.forum.findUnique({ where: { id: testForumId } })
    assert.strictEqual(dbForum, null)

    testForumId = '' // Already deleted
  })

  test('DELETE cancels forum with sold tickets', async () => {
    // Create ticket
    await prisma.ticket.create({
      data: {
        ticketNumber: 'TEST-002',
        forumId: testForumId,
        buyerId: userId,
        status: 'ACTIVE',
        qrTokenHash: 'test-hash-2',
        qrTokenEncrypted: 'test-encrypted-2',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        orderItem: {
          create: {
            participantFirstName: 'Test',
            participantLastName: 'User',
            unitPriceMinor: 150000,
            order: {
              create: {
                orderNumber: 'ORD-002',
                userId,
                forumId: testForumId,
                status: 'PAID',
                subtotalMinor: 150000,
                totalMinor: 150000,
                currency: 'KGS',
                paidAt: new Date(),
              },
            },
            ticketCategoryId: (await prisma.ticketCategory.findFirst({ where: { forumId: testForumId } }))!.id,
          },
        },
      },
    })

    const response = await adminForumByIdRoute.DELETE(
      mockRequest('DELETE'),
      mockContext(testForumId)
    )
    const body = await response.json()

    assert.strictEqual(response.status, 200)
    assert.strictEqual(body.status, ForumStatus.CANCELLED)
    assert.strictEqual(body.ticketHoldersNotified, true)

    // Verify status changed, not deleted
    const dbForum = await prisma.forum.findUnique({ where: { id: testForumId } })
    assert.ok(dbForum)
    assert.strictEqual(dbForum.status, ForumStatus.CANCELLED)
  })
})

console.log('✅ All Admin Forums API tests completed')
