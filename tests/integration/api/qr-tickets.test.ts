import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import QRCode from 'qrcode'
import { NextRequest, NextResponse } from 'next/server'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = ''
process.env.DIRECT_URL = ''
process.env.ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64')

const ticketId = '207d88cb-9f36-4bc2-8b5b-f6c3a5c4e120'
const buyerId = '9f6a5d17-a1b8-47c1-9a2f-d223e4b4da19'
const qrToken = randomBytes(32).toString('base64url')
const { encryptQRToken } = require('../../../lib/crypto/qr-encryption') as typeof import('../../../lib/crypto/qr-encryption')

const ticket = {
  id: ticketId,
  ticketNumber: 'TIX-test-001',
  buyerId,
  status: 'ACTIVE',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  qrTokenEncrypted: encryptQRToken(qrToken),
  orderItem: { order: { paidAt: new Date() } },
}

const prisma: any = {
  ticket: { findUnique: async () => ticket },
}
const authMiddleware: any = {
  requireAuth: async () => ({ user: { userId: buyerId, role: 'USER', status: 'ACTIVE' } }),
}

const moduleLoader = require('node:module') as any
const originalLoad = moduleLoader._load
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/db') return { prisma, default: prisma }
  if (request === '@/lib/auth/middleware') return authMiddleware
  return originalLoad.call(this, request, parent, isMain)
}
const qrRoute = require('../../../app/api/v1/tickets/[ticketId]/qr/route') as typeof import('../../../app/api/v1/tickets/[ticketId]/qr/route')
moduleLoader._load = originalLoad

function request(id = ticketId): NextRequest {
  return new NextRequest(`http://localhost/api/v1/tickets/${id}/qr`)
}

function context(id = ticketId) {
  return { params: Promise.resolve({ ticketId: id }) }
}

test('QR endpoint returns a real SVG QR encoding only the check-in payload', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => ({
    user: { userId: buyerId, role: 'USER', status: 'ACTIVE' },
  }))
  t.mock.method(prisma.ticket, 'findUnique', async () => ticket)

  const response = await qrRoute.GET(request(), context())
  const actualSvg = await response.text()
  const expectedSvg = await QRCode.toString(`FORUM.KG|${ticket.ticketNumber}|${qrToken}`, {
    type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 512,
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/svg+xml; charset=utf-8')
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
  assert.match(actualSvg, /<svg\b/)
  assert.match(actualSvg, /<path\b[^>]*\bd="[Mm]/)
  assert.doesNotMatch(actualSvg, /QR CODE PLACEHOLDER|ticketNumber|qrToken/i)
  assert.equal(actualSvg, expectedSvg)
})

test('QR endpoint rejects a different ticket owner and does not reveal image bytes', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => ({
    user: { userId: 'a5c2cc60-2820-43df-9ca9-a90e7a5aabb3', role: 'USER', status: 'ACTIVE' },
  }))
  t.mock.method(prisma.ticket, 'findUnique', async () => ticket)

  const response = await qrRoute.GET(request(), context())
  const body = await response.json() as { error: { code: string } }

  assert.equal(response.status, 403)
  assert.equal(body.error.code, 'FORBIDDEN')
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
})

test('QR endpoint returns no-store for unauthenticated requests without querying tickets', async (t) => {
  let reads = 0
  t.mock.method(authMiddleware, 'requireAuth', async () =>
    NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }))
  t.mock.method(prisma.ticket, 'findUnique', async () => {
    reads += 1
    return ticket
  })

  const response = await qrRoute.GET(request(), context())

  assert.equal(response.status, 401)
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
  assert.equal(reads, 0)
})

test('QR endpoint refuses cancelled tickets', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => ({
    user: { userId: buyerId, role: 'USER', status: 'ACTIVE' },
  }))
  t.mock.method(prisma.ticket, 'findUnique', async () => ({ ...ticket, status: 'CANCELLED' }))

  const response = await qrRoute.GET(request(), context())
  const body = await response.json() as { error: { code: string } }

  assert.equal(response.status, 409)
  assert.equal(body.error.code, 'TICKET_NOT_ACTIVE')
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
})

test('QR endpoint rejects invalid ticket IDs before database lookup', async (t) => {
  let reads = 0
  t.mock.method(authMiddleware, 'requireAuth', async () => ({
    user: { userId: buyerId, role: 'USER', status: 'ACTIVE' },
  }))
  t.mock.method(prisma.ticket, 'findUnique', async () => {
    reads += 1
    return ticket
  })

  const response = await qrRoute.GET(request('not-a-uuid'), context('not-a-uuid'))
  const body = await response.json() as { error: { code: string } }

  assert.equal(response.status, 400)
  assert.equal(body.error.code, 'INVALID_TICKET_ID')
  assert.equal(reads, 0)
})
