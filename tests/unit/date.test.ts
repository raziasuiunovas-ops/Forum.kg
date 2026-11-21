import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addDays,
  addHours,
  addMinutes,
  diffInDays,
  diffInHours,
  diffInMinutes,
  endOfDay,
  formatForDisplay,
  isExpired,
  isFuture,
  isPast,
  isValidTimezone,
  parseDateTime,
  startOfDay,
  toISO8601,
} from '../../lib/utils/date'

test('converts Date, timestamp, and string values to the same ISO UTC form', () => {
  const expected = '2026-01-02T03:04:05.000Z'
  const timestamp = Date.parse(expected)

  assert.equal(toISO8601(new Date(timestamp)), expected)
  assert.equal(toISO8601(timestamp), expected)
  assert.equal(toISO8601(expected), expected)
})

test('parses valid date strings and returns null for invalid strings', () => {
  assert.equal(parseDateTime('2026-01-02T03:04:05.000Z')?.toISOString(), '2026-01-02T03:04:05.000Z')
  assert.equal(parseDateTime('not-a-date'), null)
})

test('classifies past, future, and expired dates', () => {
  const past = '2000-01-01T00:00:00.000Z'
  const future = '2999-01-01T00:00:00.000Z'

  assert.equal(isPast(past), true)
  assert.equal(isFuture(future), true)
  assert.equal(isExpired(past), true)
  assert.equal(isPast('not-a-date'), false)
  assert.equal(isFuture('not-a-date'), false)
})

test('adds minutes, hours, and days without mutating the input date', () => {
  const base = new Date('2026-01-01T00:00:00.000Z')

  assert.equal(addMinutes(base, 90).toISOString(), '2026-01-01T01:30:00.000Z')
  assert.equal(addHours(base, 2).toISOString(), '2026-01-01T02:00:00.000Z')
  assert.equal(addDays(base, 1).toISOString(), '2026-01-02T00:00:00.000Z')
  assert.equal(base.toISOString(), '2026-01-01T00:00:00.000Z')
})

test('calculates whole-minute, whole-hour, and whole-day differences', () => {
  const earlier = new Date('2026-01-01T00:00:00.000Z')
  const later = new Date('2026-01-03T02:30:00.000Z')

  assert.equal(diffInMinutes(later, earlier), 3030)
  assert.equal(diffInHours(later, earlier), 50)
  assert.equal(diffInDays(later, earlier), 2)
})

test('calculates start and end of day in UTC without mutating the input', () => {
  const input = new Date('2026-01-02T13:14:15.678Z')

  assert.equal(startOfDay(input).toISOString(), '2026-01-02T00:00:00.000Z')
  assert.equal(endOfDay(input).toISOString(), '2026-01-02T23:59:59.999Z')
  assert.equal(input.toISOString(), '2026-01-02T13:14:15.678Z')
})

test('formats valid dates for display and returns an empty string for invalid input', () => {
  assert.match(formatForDisplay('2026-01-02T03:04:05.000Z', 'en-US'), /2026/)
  assert.equal(formatForDisplay('not-a-date'), '')
})

test('validates IANA timezone identifiers', () => {
  assert.equal(isValidTimezone('Asia/Bishkek'), true)
  assert.equal(isValidTimezone('Not/A_Timezone'), false)
})
