/**
 * Unit tests for Admin Forums API validation schemas
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { forumCreateSchema, forumUpdateSchema, forumQuerySchema } from '@/lib/api/schemas/forum'
import { Locale, ForumStatus } from '@prisma/client'

describe('Forum Create Schema Validation', () => {
  const baseValidForum = {
    slug: 'test-forum-2027',
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
  }

  test('accepts valid forum data', () => {
    const result = forumCreateSchema.safeParse(baseValidForum)
    assert.strictEqual(result.success, true)
  })

  test('rejects invalid slug format', () => {
    const result = forumCreateSchema.safeParse({
      ...baseValidForum,
      slug: 'Invalid Slug!',
    })
    assert.strictEqual(result.success, false)
  })

  test('rejects missing Russian translation', () => {
    const result = forumCreateSchema.safeParse({
      ...baseValidForum,
      translations: [{ locale: Locale.EN, title: 'Test Forum' }],
    })
    assert.strictEqual(result.success, false)
  })

  test('rejects past start date', () => {
    const result = forumCreateSchema.safeParse({
      ...baseValidForum,
      startsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    assert.strictEqual(result.success, false)
  })

  test('rejects end date before start date', () => {
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const endsAt = new Date(startsAt.getTime() - 1000)
    
    const result = forumCreateSchema.safeParse({
      ...baseValidForum,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    })
    assert.strictEqual(result.success, false)
  })

  test('rejects QR expiry before start date', () => {
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const qrExpiresAt = new Date(startsAt.getTime() - 1000)
    
    const result = forumCreateSchema.safeParse({
      ...baseValidForum,
      startsAt: startsAt.toISOString(),
      qrExpiresAt: qrExpiresAt.toISOString(),
    })
    assert.strictEqual(result.success, false)
  })

  test('rejects duplicate category codes', () => {
    const result = forumCreateSchema.safeParse({
      ...baseValidForum,
      categories: [
        {
          code: 'STANDARD',
          priceMinor: 150000,
          currency: 'KGS',
          sortOrder: 0,
          translations: [{ locale: Locale.RU, name: 'Стандарт' }],
        },
        {
          code: 'STANDARD', // Duplicate
          priceMinor: 200000,
          currency: 'KGS',
          sortOrder: 1,
          translations: [{ locale: Locale.RU, name: 'Стандарт Плюс' }],
        },
      ],
    })
    assert.strictEqual(result.success, false)
  })

  test('rejects category capacity exceeding forum capacity', () => {
    const result = forumCreateSchema.safeParse({
      ...baseValidForum,
      capacity: 100,
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
    })
    assert.strictEqual(result.success, false)
  })

  test('accepts multiple valid categories', () => {
    const result = forumCreateSchema.safeParse({
      ...baseValidForum,
      capacity: 200,
      categories: [
        {
          code: 'STANDARD',
          priceMinor: 150000,
          currency: 'KGS',
          capacity: 150,
          sortOrder: 0,
          translations: [{ locale: Locale.RU, name: 'Стандарт' }],
        },
        {
          code: 'VIP',
          priceMinor: 300000,
          currency: 'KGS',
          capacity: 50,
          sortOrder: 1,
          translations: [
            { locale: Locale.RU, name: 'VIP' },
            { locale: Locale.EN, name: 'VIP' },
          ],
        },
      ],
    })
    assert.strictEqual(result.success, true)
  })

  test('accepts optional fields', () => {
    const result = forumCreateSchema.safeParse({
      ...baseValidForum,
      bannerUrl: 'https://example.com/banner.jpg',
      venueName: 'Test Venue',
      venueAddress: 'Test Address',
      locationCoordinates: { latitude: 42.8746, longitude: 74.5698 },
      endsAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
      registrationDeadline: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
      maxTicketsPerAccount: 3,
      tags: ['tech', 'conference'],
    })
    assert.strictEqual(result.success, true)
  })
})

describe('Forum Update Schema Validation', () => {
  test('accepts empty update', () => {
    const result = forumUpdateSchema.safeParse({})
    assert.strictEqual(result.success, true)
  })

  test('accepts partial update', () => {
    const result = forumUpdateSchema.safeParse({
      capacity: 150,
      maxTicketsPerAccount: 2,
    })
    assert.strictEqual(result.success, true)
  })

  test('rejects end date before start date when both provided', () => {
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const endsAt = new Date(startsAt.getTime() - 1000)
    
    const result = forumUpdateSchema.safeParse({
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    })
    assert.strictEqual(result.success, false)
  })

  test('accepts status change', () => {
    const result = forumUpdateSchema.safeParse({
      status: ForumStatus.PUBLISHED,
    })
    assert.strictEqual(result.success, true)
  })

  test('accepts null values for optional fields', () => {
    const result = forumUpdateSchema.safeParse({
      bannerUrl: null,
      endsAt: null,
      locationCoordinates: null,
    })
    assert.strictEqual(result.success, true)
  })

  test('requires Russian translation when updating translations', () => {
    const result = forumUpdateSchema.safeParse({
      translations: [{ locale: Locale.EN, title: 'Test Forum' }],
    })
    assert.strictEqual(result.success, false)
  })

  test('accepts valid translation update', () => {
    const result = forumUpdateSchema.safeParse({
      translations: [
        { locale: Locale.RU, title: 'Обновлённый форум' },
        { locale: Locale.EN, title: 'Updated Forum' },
      ],
    })
    assert.strictEqual(result.success, true)
  })
})

describe('Forum Query Schema Validation', () => {
  test('accepts default values', () => {
    const result = forumQuerySchema.safeParse({})
    assert.strictEqual(result.success, true)
    if (result.success) {
      assert.strictEqual(result.data.page, 1)
      assert.strictEqual(result.data.limit, 20)
      assert.strictEqual(result.data.sortBy, 'startsAt')
      assert.strictEqual(result.data.sortOrder, 'asc')
    }
  })

  test('accepts valid query parameters', () => {
    const result = forumQuerySchema.safeParse({
      page: '2',
      limit: '50',
      status: ForumStatus.PUBLISHED,
      search: 'tech conference',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
    assert.strictEqual(result.success, true)
    if (result.success) {
      assert.strictEqual(result.data.page, 2)
      assert.strictEqual(result.data.limit, 50)
      assert.strictEqual(result.data.status, ForumStatus.PUBLISHED)
    }
  })

  test('rejects invalid page number', () => {
    const result = forumQuerySchema.safeParse({ page: '0' })
    assert.strictEqual(result.success, false)
  })

  test('rejects limit exceeding maximum', () => {
    const result = forumQuerySchema.safeParse({ limit: '200' })
    assert.strictEqual(result.success, false)
  })

  test('rejects invalid sort field', () => {
    const result = forumQuerySchema.safeParse({ sortBy: 'invalid' })
    assert.strictEqual(result.success, false)
  })

  test('coerces string numbers to integers', () => {
    const result = forumQuerySchema.safeParse({
      page: '3',
      limit: '25',
    })
    assert.strictEqual(result.success, true)
    if (result.success) {
      assert.strictEqual(typeof result.data.page, 'number')
      assert.strictEqual(typeof result.data.limit, 'number')
    }
  })
})

console.log('✅ All Admin Forums validation tests completed')
