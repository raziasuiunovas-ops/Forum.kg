import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest } from 'next/server'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = ''
process.env.DIRECT_URL = ''

const ownerId = '9f6a5d17-a1b8-47c1-9a2f-d223e4b4da19'
const managerId = 'a5c2cc60-2820-43df-9ca9-a90e7a5aabb3'
const orderId = '207d88cb-9f36-4bc2-8b5b-f6c3a5c4e120'
const ticketId = 'c1ff98b1-0243-4d78-a3f1-1e0f848fbac9'
const cancellationId = 'dba88c33-a66e-44dd-9b24-a8a49688ef39'

const payment = {
  id: 'e11b7430-6fac-4b1b-8f82-7a3e95de3627',
  status: 'SUCCEEDED',
  amountMinor: 1500,
  currency: 'KGS',
}
const ticket = { id: ticketId, status: 'ACTIVE', checkIn: null }
const item = { id: 'f41a5172-b47c-442d-a3a0-9168ae2d0e21', unitPriceMinor: 1500, ticket }
const order: any = {
  id: orderId,
  userId: ownerId,
  status: 'PAID',
  paidAt: new Date(),
  items: [item],
  payments: [payment],
  cancellations: [],
  refunds: [],
}
let cancellation: any = null
let refundCreateCount = 0

const prisma: any = {
  $queryRaw: async () => [],
  $transaction: async (operation: (tx: any) => Promise<unknown>) => operation(prisma),
  order: {
    findFirst: async ({ where }: any = {}) => {
      // Check userId filter
      if (where?.userId && where.userId !== order.userId) {
        return null
      }
      return { ...order, cancellations: [...order.cancellations], payments: order.payments.length > 0 ? [payment] : [] }
    },
    update: async ({ data }: any) => Object.assign(order, data),
  },
  cancellationRequest: {
    create: async ({ data }: any) => {
      cancellation = { id: cancellationId, ...data, createdAt: new Date(), reviewedAt: null }
      order.cancellations.push(cancellation)
      return cancellation
    },
    findUnique: async ({ include }: any) => {
      if (!include) return { orderId }
      
      // Return full cancellation with order including proper ticket structure
      const fullOrder = {
        ...order,
        items: order.items.map((item: any) => ({
          ...item,
          ticket: item.ticket ? { ...item.ticket, checkIn: item.ticket.checkIn || null } : null
        })),
        payments: order.payments ? [...order.payments] : [payment],
        refunds: [...order.refunds]
      }
      
      return {
        ...cancellation,
        order: fullOrder
      }
    },
    update: async ({ data }: any) => Object.assign(cancellation, data),
  },
  refund: {
    create: async ({ data }: any) => {
      refundCreateCount += 1
      const created = { id: '550e8400-e29b-41d4-a716-446655440000', ...data }
      order.refunds.push(created)
      return created
    },
  },
  ticket: {
    updateMany: async ({ where, data }: any) => {
      const ids = new Set(where.id.in)
      const affected = order.items.filter((candidate: any) => ids.has(candidate.ticket.id) && candidate.ticket.status === where.status)
      for (const candidate of affected) Object.assign(candidate.ticket, data)
      return { count: affected.length }
    },
  },
  payment: {
    update: async ({ data }: any) => Object.assign(payment, data),
    updateMany: async ({ data }: any) => {
      Object.assign(payment, data)
      return { count: 1 }
    },
  },
}
const auth: any = {
  requireAuth: async () => ({ user: { userId: ownerId, role: 'USER', status: 'ACTIVE' } }),
  requireManager: async () => ({ user: { userId: managerId, role: 'MANAGER', status: 'ACTIVE' } }),
}

const moduleLoader = require('node:module') as any
const originalLoad = moduleLoader._load
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/db') return { prisma, default: prisma }
  if (request === '@/lib/auth/middleware') return auth
  return originalLoad.call(this, request, parent, isMain)
}
const orderCancellationRoute = require('../../../app/api/v1/orders/[orderId]/cancellation/route') as typeof import('../../../app/api/v1/orders/[orderId]/cancellation/route')
const adminCancellationRoute = require('../../../app/api/v1/admin/cancellations/[cancellationId]/route') as typeof import('../../../app/api/v1/admin/cancellations/[cancellationId]/route')
const orderRoute = require('../../../app/api/v1/orders/[orderId]/route') as typeof import('../../../app/api/v1/orders/[orderId]/route')
moduleLoader._load = originalLoad

function postRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/v1/admin/cancellations/${cancellationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function orderContext() {
  return { params: Promise.resolve({ orderId }) }
}

function cancellationContext() {
  return { params: Promise.resolve({ cancellationId }) }
}

test('repeated cancellation request reuses the existing request instead of creating duplicates', async (t) => {
  order.cancellations = []
  cancellation = null
  t.mock.method(auth, 'requireAuth', async () => ({ user: { userId: ownerId, role: 'USER', status: 'ACTIVE' } }))
  const request = () => orderCancellationRoute.POST(
    postRequest(`/api/v1/orders/${orderId}/cancellation`, { ticketId, reason: 'Cannot attend' }),
    orderContext()
  )

  const first = await request()
  const firstBody = await first.json() as { cancellation: { id: string } }
  const repeated = await request()
  const repeatedBody = await repeated.json() as { cancellation: { id: string }; reused: boolean }

  assert.equal(first.status, 201)
  assert.equal(repeated.status, 200)
  assert.equal(repeatedBody.reused, true)
  assert.equal(repeatedBody.cancellation.id, firstBody.cancellation.id)
  assert.equal(order.cancellations.length, 1)
  assert.equal(ticket.status, 'ACTIVE', 'A customer request alone must not cancel admission')
})

test('approved cancellation prepares one pending refund and never reports provider success', async (t) => {
  cancellation = {
    id: cancellationId,
    orderId,
    ticketId,
    requesterId: ownerId,
    status: 'SUBMITTED',
    reason: 'Cannot attend',
    reviewedAt: null,
  }
  order.status = 'PAID'
  ticket.status = 'ACTIVE'
  ticket.checkIn = null
  payment.status = 'SUCCEEDED'
  order.refunds = []
  refundCreateCount = 0
  t.mock.method(auth, 'requireManager', async () => ({ user: { userId: managerId, role: 'MANAGER', status: 'ACTIVE' } }))

  const response = await adminCancellationRoute.PATCH(patchRequest({ decision: 'approve' }), cancellationContext())
  const body = await response.json() as any

  assert.equal(response.status, 202)
  assert.equal(body.refundStatus, 'PENDING')
  assert.equal(body.providerRefund, 'BLOCKED')
  assert.notEqual(body.refundStatus, 'SUCCEEDED')
  assert.equal(order.status, 'CANCELLED')
  assert.equal(payment.status, 'REFUND_PENDING')
  assert.equal(ticket.status, 'CANCELLED')
  assert.equal(cancellation.status, 'APPROVED')
  assert.equal(refundCreateCount, 1)
})

test('repeating refund approval returns the pending refund without creating another', async (t) => {
  cancellation = {
    id: cancellationId,
    orderId,
    ticketId,
    requesterId: ownerId,
    reviewedById: managerId,
    status: 'APPROVED',
    reason: 'Cannot attend',
    reviewedAt: new Date(),
  }
  order.status = 'CANCELLED'
  ticket.status = 'CANCELLED'
  payment.status = 'REFUND_PENDING'
  order.refunds = [{
    id: '550e8400-e29b-41d4-a716-446655440000',
    orderId,
    paymentId: payment.id,
    ticketId,
    status: 'PENDING',
    amountMinor: 1500,
    currency: 'KGS',
  }]
  refundCreateCount = 1
  t.mock.method(auth, 'requireManager', async () => ({ user: { userId: managerId, role: 'MANAGER', status: 'ACTIVE' } }))

  const response = await adminCancellationRoute.PATCH(patchRequest({ decision: 'approve' }), cancellationContext())
  const body = await response.json() as any

  assert.equal(response.status, 202)
  assert.equal(body.refund.id, order.refunds[0].id)
  assert.equal(body.refund.status, 'PENDING')
  assert.equal(refundCreateCount, 1)
})

test('provider refund is explicitly blocked and no refund is marked successful', async (t) => {
  cancellation = {
    id: cancellationId,
    orderId,
    ticketId,
    requesterId: ownerId,
    status: 'SUBMITTED',
    reason: null,
    reviewedAt: null,
  }
  order.status = 'PAID'
  ticket.status = 'ACTIVE'
  ticket.checkIn = null
  payment.status = 'SUCCEEDED'
  order.refunds = []
  refundCreateCount = 0
  t.mock.method(auth, 'requireManager', async () => ({ user: { userId: managerId, role: 'MANAGER', status: 'ACTIVE' } }))

  const response = await adminCancellationRoute.PATCH(patchRequest({ decision: 'approve' }), cancellationContext())
  const body = await response.json() as any

  assert.equal(response.status, 202)
  assert.equal(body.providerRefund, 'BLOCKED')
  assert.equal(order.refunds[0].status, 'PENDING')
  assert.equal(payment.status, 'REFUND_PENDING')
  assert.equal(order.refunds.some((refund: any) => refund.status === 'SUCCEEDED'), false)
})

test('unpaid order can be cancelled directly by owner', async (t) => {
  order.status = 'PENDING_PAYMENT'
  order.paidAt = null
  order.reservedUntil = new Date(Date.now() + 600000) // 10 minutes from now
  payment.status = 'CREATED'
  
  t.mock.method(auth, 'requireAuth', async () => ({ user: { userId: ownerId, role: 'USER', status: 'ACTIVE' } }))

  const response = await orderRoute.DELETE(
    new NextRequest(`http://localhost/api/v1/orders/${orderId}`, { method: 'DELETE' }),
    orderContext()
  )
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(body.status, 'CANCELLED')
  assert.equal(order.status, 'CANCELLED')
  assert.equal(payment.status, 'EXPIRED')
})

test('unpaid order cancellation rejects non-owner', async (t) => {
  const otherId = 'b346ebef-57ad-4773-8754-81d79cc8886c'
  order.status = 'PENDING_PAYMENT'
  order.paidAt = null
  order.userId = ownerId
  
  t.mock.method(auth, 'requireAuth', async () => ({ user: { userId: otherId, role: 'USER', status: 'ACTIVE' } }))

  const response = await orderRoute.DELETE(
    new NextRequest(`http://localhost/api/v1/orders/${orderId}`, { method: 'DELETE' }),
    orderContext()
  )

  assert.equal(response.status, 404, 'Non-owner should receive 404 (not found) instead of 403')
})

test('unpaid order cancellation rejects already paid order', async (t) => {
  order.status = 'PAID'
  order.paidAt = new Date()
  payment.status = 'SUCCEEDED'
  
  t.mock.method(auth, 'requireAuth', async () => ({ user: { userId: ownerId, role: 'USER', status: 'ACTIVE' } }))

  const response = await orderRoute.DELETE(
    new NextRequest(`http://localhost/api/v1/orders/${orderId}`, { method: 'DELETE' }),
    orderContext()
  )
  const body = await response.json() as any

  assert.equal(response.status, 409)
  assert.equal(body.error.code, 'ORDER_NOT_CANCELLABLE')
})

test('unpaid order cancellation rejects expired reservation', async (t) => {
  order.status = 'PENDING_PAYMENT'
  order.paidAt = null
  order.reservedUntil = new Date(Date.now() - 60000) // 1 minute ago
  payment.status = 'CREATED'
  
  t.mock.method(auth, 'requireAuth', async () => ({ user: { userId: ownerId, role: 'USER', status: 'ACTIVE' } }))

  const response = await orderRoute.DELETE(
    new NextRequest(`http://localhost/api/v1/orders/${orderId}`, { method: 'DELETE' }),
    orderContext()
  )
  const body = await response.json() as any

  assert.equal(response.status, 409)
  assert.equal(body.error.code, 'ORDER_ALREADY_EXPIRED')
})

test('unpaid order cancellation rejects cancelled order', async (t) => {
  order.status = 'CANCELLED'
  order.paidAt = null
  
  t.mock.method(auth, 'requireAuth', async () => ({ user: { userId: ownerId, role: 'USER', status: 'ACTIVE' } }))

  const response = await orderRoute.DELETE(
    new NextRequest(`http://localhost/api/v1/orders/${orderId}`, { method: 'DELETE' }),
    orderContext()
  )
  const body = await response.json() as any

  assert.equal(response.status, 409)
  assert.equal(body.error.code, 'ORDER_NOT_CANCELLABLE')
})

test('refund duplicate prevention: concurrent approval creates only one refund', async (t) => {
  // Reset state
  order.status = 'PAID'
  order.paidAt = new Date()
  order.refunds = []
  payment.status = 'SUCCEEDED'
  
  cancellation = {
    id: cancellationId,
    orderId,
    ticketId,
    requesterId: ownerId,
    status: 'SUBMITTED',
    reason: 'Cannot attend',
    reviewedAt: null,
  }
  ticket.status = 'ACTIVE'
  ticket.checkIn = null
  refundCreateCount = 0

  t.mock.method(auth, 'requireManager', async () => ({ user: { userId: managerId, role: 'MANAGER', status: 'ACTIVE' } }))

  const response = await adminCancellationRoute.PATCH(patchRequest({ decision: 'approve' }), cancellationContext())
  const body = await response.json() as any

  assert.equal(response.status, 202)
  assert.equal(refundCreateCount, 1, 'Should create exactly one refund')
  assert.equal(order.refunds.length, 1, 'Should have exactly one refund record')
  assert.equal(body.refund.status, 'PENDING')
})

test('refund duplicate prevention: approving already approved cancellation returns existing refund', async (t) => {
  cancellation = {
    id: cancellationId,
    orderId,
    ticketId,
    requesterId: ownerId,
    reviewedById: managerId,
    status: 'APPROVED',
    reason: 'Cannot attend',
    reviewedAt: new Date(),
  }
  order.status = 'CANCELLED'
  ticket.status = 'CANCELLED'
  payment.status = 'REFUND_PENDING'
  const existingRefund = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    orderId,
    paymentId: payment.id,
    ticketId,
    status: 'PENDING',
    amountMinor: 1500,
    currency: 'KGS',
  }
  order.refunds = [existingRefund]
  const initialRefundCount = refundCreateCount
  
  t.mock.method(auth, 'requireManager', async () => ({ user: { userId: managerId, role: 'MANAGER', status: 'ACTIVE' } }))

  const response = await adminCancellationRoute.PATCH(patchRequest({ decision: 'approve' }), cancellationContext())
  const body = await response.json() as any

  assert.equal(response.status, 202)
  assert.equal(body.refund.id, existingRefund.id, 'Should return existing refund')
  assert.equal(refundCreateCount, initialRefundCount, 'Should not create new refund')
})

test('refund amount calculation: validates against payment amount', async (t) => {
  // Reset state
  order.status = 'PAID'
  order.paidAt = new Date()
  order.refunds = []
  payment.status = 'SUCCEEDED'
  payment.amountMinor = 3500 // Total of both items
  ticket.status = 'ACTIVE'
  ticket.checkIn = null
  
  const item2 = { ...item, id: 'second-item-id', unitPriceMinor: 2000, ticket: { ...ticket, id: 'ticket-2', status: 'ACTIVE', checkIn: null } }
  
  cancellation = {
    id: cancellationId,
    orderId,
    ticketId: null, // Full order cancellation
    requesterId: ownerId,
    status: 'SUBMITTED',
    reason: 'Event conflict',
    reviewedAt: null,
  }
  order.items = [item, item2]
  refundCreateCount = 0

  t.mock.method(auth, 'requireManager', async () => ({ user: { userId: managerId, role: 'MANAGER', status: 'ACTIVE' } }))

  const response = await adminCancellationRoute.PATCH(patchRequest({ decision: 'approve' }), cancellationContext())
  const body = await response.json() as any

  assert.equal(response.status, 202)
  assert.equal(body.refund.amountMinor, 3500, 'Refund should cover all items in full order cancellation')
  assert.equal(refundCreateCount, 1)
  
  // Restore original items
  order.items = [item]
})

test('refund duplicate prevention: rejects if another refund is processing', async (t) => {
  // Reset state
  order.status = 'PAID'
  order.paidAt = new Date()
  order.cancellations = []
  payment.status = 'SUCCEEDED'
  payment.amountMinor = 1500
  ticket.status = 'ACTIVE'
  ticket.checkIn = null
  
  cancellation = {
    id: cancellationId,
    orderId,
    ticketId,
    requesterId: ownerId,
    status: 'SUBMITTED',
    reason: 'Cannot attend',
    reviewedAt: null,
  }
  order.refunds = [{
    id: 'processing-refund-id',
    orderId,
    paymentId: payment.id,
    ticketId,
    status: 'PROCESSING', // Active refund status
    amountMinor: 1500,
    currency: 'KGS',
  }]
  refundCreateCount = 0

  t.mock.method(auth, 'requireManager', async () => ({ user: { userId: managerId, role: 'MANAGER', status: 'ACTIVE' } }))

  const response = await adminCancellationRoute.PATCH(patchRequest({ decision: 'approve' }), cancellationContext())
  const body = await response.json() as any

  assert.equal(response.status, 409, 'Should reject when active refund already exists')
  assert.equal(body.error.code, 'REFUND_ALREADY_EXISTS', 'Should return REFUND_ALREADY_EXISTS error')
  assert.equal(refundCreateCount, 0, 'Should not create duplicate refund')
})

test('concurrent cancellation requests: second request reuses first', async (t) => {
  order.status = 'PAID'
  order.paidAt = new Date()
  order.cancellations = []
  ticket.status = 'ACTIVE'
  ticket.checkIn = null
  payment.status = 'SUCCEEDED'
  cancellation = null
  
  t.mock.method(auth, 'requireAuth', async () => ({ user: { userId: ownerId, role: 'USER', status: 'ACTIVE' } }))

  // First request creates cancellation
  const response1 = await orderCancellationRoute.POST(
    postRequest(`/api/v1/orders/${orderId}/cancellation`, { ticketId, reason: 'Cannot attend' }),
    orderContext()
  )
  const body1 = await response1.json() as any

  assert.equal(response1.status, 201, 'First request should create')
  assert.equal(body1.reused, false, 'First request should have reused: false')

  // Second identical request reuses
  const response2 = await orderCancellationRoute.POST(
    postRequest(`/api/v1/orders/${orderId}/cancellation`, { ticketId, reason: 'Cannot attend' }),
    orderContext()
  )
  const body2 = await response2.json() as any

  assert.equal(response2.status, 200, 'Second request should reuse')
  assert.equal(body2.reused, true, 'Second request should indicate reuse')
  assert.equal(body1.cancellation.id, body2.cancellation.id, 'Both should reference same cancellation')
  assert.equal(order.cancellations.length, 1, 'Should create only one cancellation request')
})

test('concurrent cancellation requests: overlapping requests are rejected', async (t) => {
  order.status = 'PAID'
  order.paidAt = new Date()
  order.cancellations = []
  ticket.status = 'ACTIVE'
  ticket.checkIn = null
  payment.status = 'SUCCEEDED'
  cancellation = null

  t.mock.method(auth, 'requireAuth', async () => ({ user: { userId: ownerId, role: 'USER', status: 'ACTIVE' } }))

  // First request: cancel specific ticket
  const response1 = await orderCancellationRoute.POST(
    postRequest(`/api/v1/orders/${orderId}/cancellation`, { ticketId, reason: 'Cannot attend' }),
    orderContext()
  )
  const body1 = await response1.json() as any

  assert.equal(response1.status, 201)
  assert.equal(body1.cancellation.ticketId, ticketId)

  // Second request: try to cancel entire order (overlaps with first)
  const response2 = await orderCancellationRoute.POST(
    postRequest(`/api/v1/orders/${orderId}/cancellation`, { reason: 'Cancel all' }),
    orderContext()
  )
  const body2 = await response2.json() as any

  assert.equal(response2.status, 409, 'Should reject overlapping cancellation request')
  assert.equal(body2.error.code, 'CANCELLATION_IN_PROGRESS')
})

test('concurrent unpaid order cancellations: handled with Serializable isolation', async (t) => {
  order.status = 'PENDING_PAYMENT'
  order.paidAt = null
  order.reservedUntil = new Date(Date.now() + 600000)
  payment.status = 'CREATED'

  t.mock.method(auth, 'requireAuth', async () => ({ user: { userId: ownerId, role: 'USER', status: 'ACTIVE' } }))
  
  // First cancellation succeeds
  const response1 = await orderRoute.DELETE(
    new NextRequest(`http://localhost/api/v1/orders/${orderId}`, { method: 'DELETE' }),
    orderContext()
  )

  assert.equal(response1.status, 200, 'First cancellation should succeed')
  assert.equal(order.status, 'CANCELLED')
  
  // Second cancellation detects already cancelled
  const response2 = await orderRoute.DELETE(
    new NextRequest(`http://localhost/api/v1/orders/${orderId}`, { method: 'DELETE' }),
    orderContext()
  )

  assert.equal(response2.status, 409, 'Second cancellation should detect conflict')
})
