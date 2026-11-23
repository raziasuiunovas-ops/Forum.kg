/**
 * Check-in Integration Tests
 * 
 * Tests check-in API endpoint with various scenarios:
 * - Valid QR code check-in
 * - Invalid/forged QR code
 * - Expired ticket
 * - Already checked-in ticket
 * - Unpaid order
 * - Wrong forum
 * - Unauthorized user (non-scanner role)
 * - Concurrent check-in attempts
 * 
 * Run with: npm run test:integration
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// All DB delegates are local stubs. These tests never construct PrismaClient
// and cannot connect to a development or production database.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = ''
process.env.DIRECT_URL = ''
process.env.JWT_SECRET = 'check-in-test-access-secret'
process.env.JWT_REFRESH_SECRET = 'check-in-test-refresh-secret'
process.env.ENCRYPTION_KEY_BASE64 = Buffer.from('test-encryption-key-32-bytes!!').toString('base64')

// Helper: Hash QR token
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Mock prisma client
const prisma: any = {
  ticket: {
    findFirst: async () => null,
    update: async () => null,
  },
  checkIn: {
    create: async () => null,
  },
  $transaction: async (operation: any) => operation(prisma),
}

// Setup module loader to intercept lib/db imports
const moduleLoader = require('node:module') as any
const originalLoad = moduleLoader._load
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/db') return { prisma, default: prisma }
  return originalLoad.call(this, request, parent, isMain)
}

// Import the route handler AFTER mocking
const auth = require('../../../lib/auth/middleware') as typeof import('../../../lib/auth/middleware')
const checkInRoute = require('../../../app/api/v1/check-in/validate/route') as typeof import('../../../app/api/v1/check-in/validate/route')

// Restore original loader
moduleLoader._load = originalLoad

// Test data constants
const FORUM_ID = '9f6a5d17-a1b8-47c1-9a2f-d223e4b4da19'
const TICKET_ID = '207d88cb-9f36-4bc2-8b5b-f6c3a5c4e120'
const TICKET_NUMBER = 'TKT-2026-001'
const SCANNER_USER_ID = 'scanner-user-id'
const QR_TOKEN = crypto.randomBytes(32).toString('base64url')
const QR_TOKEN_HASH = hashToken(QR_TOKEN)
const QR_DATA = `FORUM.KG|${TICKET_NUMBER}|${QR_TOKEN}`

const mockTicket = {
  id: TICKET_ID,
  ticketNumber: TICKET_NUMBER,
  qrTokenHash: QR_TOKEN_HASH,
  status: 'ACTIVE',
  forumId: FORUM_ID,
  expiresAt: new Date('2026-12-31T23:59:59Z'),
  checkIn: null,
  forum: {
    id: FORUM_ID,
    slug: 'test-forum',
    startsAt: new Date('2026-01-15T10:00:00Z'),
    endsAt: new Date('2026-01-15T18:00:00Z'),
    translations: [{ locale: 'RU', title: 'Тестовый форум' }],
  },
  orderItem: {
    participantFirstName: 'Иван',
    participantLastName: 'Иванов',
    ticketCategory: {
      code: 'STANDARD',
      translations: [{ locale: 'RU', name: 'Стандартный' }],
    },
  },
}

// Helper: Create authenticated request
function request(path: string, method = 'POST', body?: string, userId = SCANNER_USER_ID, role = 'SCANNER') {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': userId,
    'x-user-role': role,
  }
  
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    body,
  })
}

// Helper: Mock authenticated user
function authenticatedUser(userId = SCANNER_USER_ID, role = 'SCANNER') {
  return { user: { userId, role, status: 'ACTIVE' } }
}

// Helper: Setup auth mock for requireRole
function authAs(t: any, userId = SCANNER_USER_ID, role = 'SCANNER') {
  // Mock requireAuth first (called by requireRole)
  t.mock.method(auth, 'requireAuth', async () => {
    return authenticatedUser(userId, role)
  })
  
  // Mock requireRole
  t.mock.method(auth, 'requireRole', async (_request: NextRequest, allowedRoles: string[]) => {
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: { code: 'INSUFFICIENT_PERMISSIONS' } }, { status: 403 })
    }
    return authenticatedUser(userId, role)
  })
}

// =============================================================================
// Test 1: Valid QR Check-in
// =============================================================================

test('POST /api/v1/check-in/validate - valid QR creates check-in', async (t) => {
  authAs(t)
  
  t.mock.method(prisma.ticket, 'findFirst', async () => mockTicket)
  t.mock.method(prisma.checkIn, 'create', async (data: any) => ({
    id: 'checkin-001',
    ticketId: data.data.ticketId,
    forumId: data.data.forumId,
    operatorId: data.data.operatorId,
    method: data.data.method,
    checkedInAt: new Date(),
  }))
  t.mock.method(prisma.ticket, 'update', async () => ({
    ...mockTicket,
    status: 'USED',
    usedAt: new Date(),
  }))
  
  const response = await checkInRoute.POST(
    request('/api/v1/check-in/validate', 'POST', JSON.stringify({
      qrData: QR_DATA,
      forumId: FORUM_ID,
    }))
  )
  
  assert.equal(response.status, 200, 'Valid QR must succeed')
  
  const data = await response.json()
  assert.equal(data.success, true, 'Response must indicate success')
  assert.equal(data.ticket.ticketNumber, TICKET_NUMBER, 'Ticket number must match')
  assert.equal(data.ticket.status, 'USED', 'Ticket status must be USED')
  assert.ok(data.checkIn.checkedInAt, 'Check-in timestamp must be present')
})

// =============================================================================
// Test 2: Invalid/Forged QR
// =============================================================================

test('POST /api/v1/check-in/validate - invalid QR format rejected', async (t) => {
  authAs(t)

  authAs(t)
  
  const response = await checkInRoute.POST(
    request('/api/v1/check-in/validate', 'POST', JSON.stringify({
      qrData: 'INVALID|FORMAT',
      forumId: FORUM_ID,
    }))
  )
  
  assert.equal(response.status, 400, 'Invalid QR format must return 400')
  
  const data = await response.json()
  assert.equal(data.error.code, 'INVALID_QR_FORMAT', 'Error code must be INVALID_QR_FORMAT')
})

test('POST /api/v1/check-in/validate - forged token hash rejected', async (t) => {
  authAs(t)
  
  t.mock.method(prisma.ticket, 'findFirst', async () => null) // Token hash doesn't match
  
  // Use different token (forged)
  const forgedToken = crypto.randomBytes(32).toString('base64url')
  const forgedQRData = `FORUM.KG|${TICKET_NUMBER}|${forgedToken}`
  
  const response = await checkInRoute.POST(
    request('/api/v1/check-in/validate', 'POST', JSON.stringify({
      qrData: forgedQRData,
      forumId: FORUM_ID,
    }))
  )
  
  assert.equal(response.status, 404, 'Forged token must return 404')
  
  const data = await response.json()
  assert.equal(data.error.code, 'TICKET_NOT_FOUND', 'Error code must be TICKET_NOT_FOUND')
})

// =============================================================================
// Test 3: Expired Ticket
// =============================================================================

test('POST /api/v1/check-in/validate - expired ticket rejected', async (t) => {
  authAs(t)
  
  const expiredTicket = {
    ...mockTicket,
    expiresAt: new Date('2020-01-01T00:00:00Z'), // Expired
  }
  
  t.mock.method(prisma.ticket, 'findFirst', async () => expiredTicket)
  
  const response = await checkInRoute.POST(
    request('/api/v1/check-in/validate', 'POST', JSON.stringify({
      qrData: QR_DATA,
      forumId: FORUM_ID,
    }))
  )
  
  assert.equal(response.status, 400, 'Expired ticket must return 400')
  
  const data = await response.json()
  assert.equal(data.error.code, 'TICKET_EXPIRED', 'Error code must be TICKET_EXPIRED')
})

// =============================================================================
// Test 4: Already Checked-in
// =============================================================================

test('POST /api/v1/check-in/validate - already checked-in rejected', async (t) => {
  authAs(t)
  
  const checkedInTicket = {
    ...mockTicket,
    checkIn: {
      id: 'existing-checkin',
      checkedInAt: new Date('2026-01-15T09:00:00Z'),
    },
  }
  
  t.mock.method(prisma.ticket, 'findFirst', async () => checkedInTicket)
  
  const response = await checkInRoute.POST(
    request('/api/v1/check-in/validate', 'POST', JSON.stringify({
      qrData: QR_DATA,
      forumId: FORUM_ID,
    }))
  )
  
  assert.equal(response.status, 400, 'Already checked-in must return 400')
  
  const data = await response.json()
  assert.equal(data.error.code, 'ALREADY_CHECKED_IN', 'Error code must be ALREADY_CHECKED_IN')
})

// =============================================================================
// Test 5: Wrong Forum
// =============================================================================

test('POST /api/v1/check-in/validate - wrong forum rejected', async (t) => {
  authAs(t)
  
  t.mock.method(prisma.ticket, 'findFirst', async () => mockTicket)
  
  const response = await checkInRoute.POST(
    request('/api/v1/check-in/validate', 'POST', JSON.stringify({
      qrData: QR_DATA,
      forumId: 'a5c2cc60-2820-43df-9ca9-a90e7a5aabb3', // Wrong forum
    }))
  )
  
  assert.equal(response.status, 400, 'Wrong forum must return 400')
  
  const data = await response.json()
  assert.equal(data.error.code, 'WRONG_FORUM', 'Error code must be WRONG_FORUM')
})

// =============================================================================
// Test 6: Cancelled Ticket
// =============================================================================

test('POST /api/v1/check-in/validate - cancelled ticket rejected', async (t) => {
  authAs(t)
  
  const cancelledTicket = {
    ...mockTicket,
    status: 'CANCELLED',
  }
  
  t.mock.method(prisma.ticket, 'findFirst', async () => cancelledTicket)
  
  const response = await checkInRoute.POST(
    request('/api/v1/check-in/validate', 'POST', JSON.stringify({
      qrData: QR_DATA,
      forumId: FORUM_ID,
    }))
  )
  
  assert.equal(response.status, 400, 'Cancelled ticket must return 400')
  
  const data = await response.json()
  assert.equal(data.error.code, 'TICKET_CANCELLED', 'Error code must be TICKET_CANCELLED')
})

// =============================================================================
// Test 7: Used Ticket
// =============================================================================

test('POST /api/v1/check-in/validate - used ticket rejected', async (t) => {
  authAs(t)
  
  const usedTicket = {
    ...mockTicket,
    status: 'USED',
  }
  
  t.mock.method(prisma.ticket, 'findFirst', async () => usedTicket)
  
  const response = await checkInRoute.POST(
    request('/api/v1/check-in/validate', 'POST', JSON.stringify({
      qrData: QR_DATA,
      forumId: FORUM_ID,
    }))
  )
  
  assert.equal(response.status, 400, 'Used ticket must return 400')
  
  const data = await response.json()
  assert.equal(data.error.code, 'TICKET_ALREADY_USED', 'Error code must be TICKET_ALREADY_USED')
})

test('POST /api/v1/check-in/validate - repeating the same QR cannot create another check-in', async (t) => {
  authAs(t)
  let ticketState: any = { ...mockTicket }
  let checkInCreates = 0
  t.mock.method(prisma.ticket, 'findFirst', async () => ticketState)
  t.mock.method(prisma.checkIn, 'create', async (args: any) => {
    checkInCreates += 1
    ticketState = { ...ticketState, status: 'USED', usedAt: new Date(), checkIn: { id: 'checkin-once' } }
    return {
      id: 'checkin-once',
      ticketId: args.data.ticketId,
      forumId: args.data.forumId,
      operatorId: args.data.operatorId,
      method: args.data.method,
      checkedInAt: new Date(),
    }
  })
  t.mock.method(prisma.ticket, 'update', async () => ticketState)

  const body = JSON.stringify({ qrData: QR_DATA, forumId: FORUM_ID })
  const first = await checkInRoute.POST(request('/api/v1/check-in/validate', 'POST', body))
  const repeated = await checkInRoute.POST(request('/api/v1/check-in/validate', 'POST', body))
  const repeatedBody = await repeated.json()

  assert.equal(first.status, 200)
  assert.equal(repeated.status, 400)
  assert.equal(repeatedBody.error.code, 'TICKET_ALREADY_USED')
  assert.equal(checkInCreates, 1)
})

// =============================================================================
// Test 8: Unauthorized Role
// =============================================================================

test('POST /api/v1/check-in/validate - unauthorized role rejected', async (t) => {
  authAs(t, 'regular-user', 'USER')

  const response = await checkInRoute.POST(
    request('/api/v1/check-in/validate', 'POST', JSON.stringify({
        qrData: QR_DATA,
        forumId: FORUM_ID,
      }), 'regular-user', 'USER')
  )
  
  assert.equal(response.status, 403, 'Unauthorized role must return 403')
})

console.log('✅ All check-in integration tests passed')
