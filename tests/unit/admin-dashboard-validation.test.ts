/**
 * Unit tests for Admin Dashboard validation schemas
 * Tests Zod schema validation for dashboard stats and recent activity queries
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  dashboardStatsQuerySchema,
  recentActivityQuerySchema,
  parseDashboardStatsQuery,
  parseRecentActivityQuery,
  activityTypeSchema,
} from '@/lib/api/schemas/dashboard'

describe('Admin Dashboard Validation Schemas', () => {
  describe('dashboardStatsQuerySchema', () => {
    it('should accept empty query (no date filters)', () => {
      const result = dashboardStatsQuerySchema.safeParse({})
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.startDate, undefined)
        assert.strictEqual(result.data.endDate, undefined)
      }
    })

    it('should accept valid startDate only', () => {
      const startDate = new Date('2026-01-01')
      const result = dashboardStatsQuerySchema.safeParse({ startDate })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.ok(result.data.startDate instanceof Date)
        assert.strictEqual(result.data.endDate, undefined)
      }
    })

    it('should accept valid endDate only', () => {
      const endDate = new Date('2026-12-31')
      const result = dashboardStatsQuerySchema.safeParse({ endDate })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.startDate, undefined)
        assert.ok(result.data.endDate instanceof Date)
      }
    })

    it('should accept valid date range (startDate <= endDate)', () => {
      const startDate = new Date('2026-01-01')
      const endDate = new Date('2026-12-31')
      const result = dashboardStatsQuerySchema.safeParse({ startDate, endDate })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.ok(result.data.startDate instanceof Date)
        assert.ok(result.data.endDate instanceof Date)
      }
    })

    it('should accept same startDate and endDate', () => {
      const date = new Date('2026-06-15')
      const result = dashboardStatsQuerySchema.safeParse({ startDate: date, endDate: date })
      assert.strictEqual(result.success, true)
    })

    it('should reject when startDate > endDate', () => {
      const startDate = new Date('2026-12-31')
      const endDate = new Date('2026-01-01')
      const result = dashboardStatsQuerySchema.safeParse({ startDate, endDate })
      assert.strictEqual(result.success, false)
      if (!result.success) {
        const errors = result.error.format()
        assert.ok(errors.startDate)
      }
    })

    it('should coerce string dates to Date objects', () => {
      const result = dashboardStatsQuerySchema.safeParse({
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.ok(result.data.startDate instanceof Date)
        assert.ok(result.data.endDate instanceof Date)
      }
    })

    it('should reject invalid date strings', () => {
      const result = dashboardStatsQuerySchema.safeParse({
        startDate: 'invalid-date',
      })
      assert.strictEqual(result.success, false)
    })
  })

  describe('recentActivityQuerySchema', () => {
    it('should use default limit of 20 when not provided', () => {
      const result = recentActivityQuerySchema.safeParse({})
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.limit, 20)
      }
    })

    it('should accept valid limit', () => {
      const result = recentActivityQuerySchema.safeParse({ limit: 50 })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.limit, 50)
      }
    })

    it('should coerce string limit to number', () => {
      const result = recentActivityQuerySchema.safeParse({ limit: '30' })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.limit, 30)
      }
    })

    it('should reject limit > 100', () => {
      const result = recentActivityQuerySchema.safeParse({ limit: 150 })
      assert.strictEqual(result.success, false)
    })

    it('should reject negative limit', () => {
      const result = recentActivityQuerySchema.safeParse({ limit: -10 })
      assert.strictEqual(result.success, false)
    })

    it('should reject zero limit', () => {
      const result = recentActivityQuerySchema.safeParse({ limit: 0 })
      assert.strictEqual(result.success, false)
    })

    it('should reject non-integer limit', () => {
      const result = recentActivityQuerySchema.safeParse({ limit: 25.5 })
      assert.strictEqual(result.success, false)
    })

    it('should accept limit of 1', () => {
      const result = recentActivityQuerySchema.safeParse({ limit: 1 })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.limit, 1)
      }
    })

    it('should accept limit of 100 (max)', () => {
      const result = recentActivityQuerySchema.safeParse({ limit: 100 })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.limit, 100)
      }
    })
  })

  describe('activityTypeSchema', () => {
    it('should accept USER_REGISTERED', () => {
      const result = activityTypeSchema.safeParse('USER_REGISTERED')
      assert.strictEqual(result.success, true)
    })

    it('should accept ORDER_CREATED', () => {
      const result = activityTypeSchema.safeParse('ORDER_CREATED')
      assert.strictEqual(result.success, true)
    })

    it('should accept ORDER_COMPLETED', () => {
      const result = activityTypeSchema.safeParse('ORDER_COMPLETED')
      assert.strictEqual(result.success, true)
    })

    it('should accept TOPIC_CREATED', () => {
      const result = activityTypeSchema.safeParse('TOPIC_CREATED')
      assert.strictEqual(result.success, true)
    })

    it('should accept EVENT_REGISTRATION', () => {
      const result = activityTypeSchema.safeParse('EVENT_REGISTRATION')
      assert.strictEqual(result.success, true)
    })

    it('should accept PAYMENT_COMPLETED', () => {
      const result = activityTypeSchema.safeParse('PAYMENT_COMPLETED')
      assert.strictEqual(result.success, true)
    })

    it('should accept FORUM_CREATED', () => {
      const result = activityTypeSchema.safeParse('FORUM_CREATED')
      assert.strictEqual(result.success, true)
    })

    it('should reject invalid activity type', () => {
      const result = activityTypeSchema.safeParse('INVALID_TYPE')
      assert.strictEqual(result.success, false)
    })

    it('should reject empty string', () => {
      const result = activityTypeSchema.safeParse('')
      assert.strictEqual(result.success, false)
    })
  })

  describe('parseDashboardStatsQuery helper', () => {
    it('should parse URL searchParams without dates', () => {
      const params = new URLSearchParams()
      const result = parseDashboardStatsQuery(params)
      assert.strictEqual(result.startDate, undefined)
      assert.strictEqual(result.endDate, undefined)
    })

    it('should parse URL searchParams with startDate', () => {
      const params = new URLSearchParams({ startDate: '2026-01-01T00:00:00.000Z' })
      const result = parseDashboardStatsQuery(params)
      assert.ok(result.startDate instanceof Date)
      assert.strictEqual(result.endDate, undefined)
    })

    it('should parse URL searchParams with both dates', () => {
      const params = new URLSearchParams({
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-12-31T23:59:59.999Z',
      })
      const result = parseDashboardStatsQuery(params)
      assert.ok(result.startDate instanceof Date)
      assert.ok(result.endDate instanceof Date)
    })

    it('should throw on invalid date range', () => {
      const params = new URLSearchParams({
        startDate: '2026-12-31',
        endDate: '2026-01-01',
      })
      assert.throws(() => parseDashboardStatsQuery(params))
    })
  })

  describe('parseRecentActivityQuery helper', () => {
    it('should parse URL searchParams without limit (use default)', () => {
      const params = new URLSearchParams()
      const result = parseRecentActivityQuery(params)
      assert.strictEqual(result.limit, 20)
    })

    it('should parse URL searchParams with limit', () => {
      const params = new URLSearchParams({ limit: '50' })
      const result = parseRecentActivityQuery(params)
      assert.strictEqual(result.limit, 50)
    })

    it('should throw on limit > 100', () => {
      const params = new URLSearchParams({ limit: '150' })
      assert.throws(() => parseRecentActivityQuery(params))
    })

    it('should throw on negative limit', () => {
      const params = new URLSearchParams({ limit: '-5' })
      assert.throws(() => parseRecentActivityQuery(params))
    })
  })
})
