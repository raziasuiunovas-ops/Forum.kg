import assert from 'node:assert/strict'
import { generateKeyPairSync, createSign, createVerify } from 'node:crypto'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { Prisma, PaymentStatus, OrderStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { POST as finikWebhook } from '@/app/api/v1/payments/webhooks/finik/route'
import { createFinikCanonicalString, createFinikPayment, type FinikPaymentInput } from '@/lib/payments/finik'

const URL = 'https://example.test/api/v1/payments/webhooks/finik'
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()

function finikEnv() {
  return {
    FINIK_ENV: 'beta',
    FINIK_API_KEY: 'test-api-key',
    FINIK_ACCOUNT_ID: 'test-account',
    FINIK_PRIVATE_KEY: privateKey,
    FINIK_BETA_PUBLIC_KEY: publicKey,
    FINIK_REDIRECT_URL: 'https://example.test/payment/return',
    FINIK_WEBHOOK_URL: URL,
  }
}

const paymentInput: FinikPaymentInput = {
  paymentId: '7b61e4f7-c7ad-4cf3-9e59-e2f58754d96b',
  orderNumber: 'ORD-20261123-123456',
  amountMinor: 12345,
  currency: 'KGS',
  reservedUntil: new Date('2026-11-23T12:10:00.000Z'),
}

test('Finik payment creation signs the Web SDK request and returns the payment redirect', async () => {
  let requestUrl = ''
  let init: RequestInit | undefined
  const result = await createFinikPayment(paymentInput, {
    env: finikEnv(),
    now: () => 1_800_000_000_000,
    fetcher: async (url, requestInit) => {
      requestUrl = String(url)
      init = requestInit
      return new Response(null, { status: 302, headers: { location: 'https://qr.finik/test-payment' } })
    },
  })

  assert.equal(requestUrl, 'https://beta.api.acquiring.averspay.kg/v1/payment')
  assert.equal(result.paymentUrl, 'https://qr.finik/test-payment')
  assert.equal(init?.redirect, 'manual')
  const body = JSON.parse(String(init?.body))
  assert.equal(body.PaymentId, paymentInput.paymentId)
  assert.equal(body.Amount, 123.45)
  assert.equal(body.Currency, 'KGS')
  const headers = init?.headers as Record<string, string>
  const verifier = createVerify('RSA-SHA256')
  verifier.update(createFinikCanonicalString({
    method: 'POST',
    path: '/v1/payment',
    host: 'beta.api.acquiring.averspay.kg',
    headers,
    body,
  }))
  verifier.end()
  assert.equal(verifier.verify(publicKey, headers.signature, 'base64'), true)
})

test('Finik payment creation handles provider errors without exposing response content', async () => {
  await assert.rejects(
    createFinikPayment(paymentInput, {
      env: finikEnv(),
      fetcher: async () => new Response('{"ErrorMessage":"private provider details"}', { status: 401 }),
    }),
    /Finik rejected the payment request/
  )
})

test('Finik payment creation rejects invalid private key format', async () => {
  const invalidEnv = {
    ...finikEnv(),
    FINIK_PRIVATE_KEY: 'not-a-valid-pem-key',
  }
  await assert.rejects(
    createFinikPayment(paymentInput, { env: invalidEnv }),
    /Finik is not configured/
  )
})

test('Finik payment creation rejects missing private key', async () => {
  const invalidEnv = {
    ...finikEnv(),
    FINIK_PRIVATE_KEY: undefined,
  }
  await assert.rejects(
    createFinikPayment(paymentInput, { env: invalidEnv }),
    /Finik is not configured/
  )
})

test('Finik payment creation rejects invalid public key format', async () => {
  const invalidEnv = {
    ...finikEnv(),
    FINIK_BETA_PUBLIC_KEY: 'not-a-valid-pem-key',
  }
  await assert.rejects(
    createFinikPayment(paymentInput, { env: invalidEnv }),
    /Finik is not configured/
  )
})

test('Finik payment creation logs errors safely without exposing credentials', async (t) => {
  let loggedData: any
  t.mock.method(console, 'error', (_message: string, data: unknown) => { loggedData = data })
  
  await assert.rejects(
    createFinikPayment(paymentInput, {
      env: finikEnv(),
      fetcher: async () => new Response(null, { status: 500 }),
    }),
    /Finik rejected the payment request/
  )
  
  assert.ok(loggedData, 'Error should be logged')
  assert.equal(loggedData.status, 500)
  assert.equal(loggedData.paymentId, paymentInput.paymentId)
  assert.equal(loggedData.environment, 'beta')
  // Verify no credentials in logs
  assert.equal(typeof loggedData.apiKey, 'undefined')
  assert.equal(typeof loggedData.privateKey, 'undefined')
  assert.equal(typeof loggedData.signature, 'undefined')
})

function webhookPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'finik-debit-transaction-1_DEBIT',
    transactionId: 'finik-transaction-1',
    status: 'success',
    amount: 123.45,
    fields: {
      paymentId: paymentInput.paymentId,
      amount: 123.45,
      currency: 'KGS',
      orderNumber: 'ORD-20261123-123456',
    },
    transactionDate: Date.now(),
    ...overrides,
  }
}

function signedWebhookRequest(payload: unknown, signatureOverride?: string): NextRequest {
  const timestamp = String(Date.now())
  const headerRecord: Record<string, string> = { 'x-api-timestamp': timestamp }
  const canonical = createFinikCanonicalString({
    method: 'POST',
    path: '/api/v1/payments/webhooks/finik',
    host: 'example.test',
    headers: headerRecord,
    body: payload,
  })
  const signer = createSign('RSA-SHA256')
  signer.update(canonical)
  signer.end()
  
  const headers = new Headers({ host: 'example.test', 'x-api-timestamp': timestamp })
  headers.set('signature', signatureOverride ?? signer.sign(privateKey, 'base64'))
  headers.set('content-type', 'application/json')
  return new NextRequest(URL, { method: 'POST', headers, body: JSON.stringify(payload) })
}

function setTestWebhookKey(t: { after: (callback: () => void) => void }) {
  const previousEnvironment = process.env.FINIK_ENV
  const previousBetaKey = process.env.FINIK_BETA_PUBLIC_KEY
  process.env.FINIK_ENV = 'beta'
  process.env.FINIK_BETA_PUBLIC_KEY = publicKey
  t.after(() => {
    if (previousEnvironment === undefined) delete process.env.FINIK_ENV
    else process.env.FINIK_ENV = previousEnvironment
    if (previousBetaKey === undefined) delete process.env.FINIK_BETA_PUBLIC_KEY
    else process.env.FINIK_BETA_PUBLIC_KEY = previousBetaKey
  })
}

function mockSuccessfulPaymentTransaction(t: any, options: { paymentStatus?: PaymentStatus; failTicket?: boolean } = {}) {
  const payment = {
    id: paymentInput.paymentId,
    providerPaymentId: paymentInput.paymentId,
    orderId: 'order-1',
    status: options.paymentStatus ?? PaymentStatus.PENDING,
    amountMinor: 12345,
    currency: 'KGS',
  }
  const order: any = {
    id: 'order-1',
    orderNumber: paymentInput.orderNumber,
    userId: 'user-1',
    forumId: 'forum-1',
    status: OrderStatus.PENDING_PAYMENT,
    reservedUntil: new Date(Date.now() + 60_000),
    items: [{ id: 'item-1' }],
    forum: { capacity: 50, qrExpiresAt: null },
  }
  const tx: any = {
    $queryRaw: async () => [],
    paymentWebhookEvent: {
      findUnique: async () => null,
      create: async () => ({ id: 'webhook-1' }),
      update: async () => ({}),
    },
    payment: {
      findUnique: async (args: any) => args.where.providerPaymentId
        ? { ...payment, order: { id: 'order-1', forumId: 'forum-1' } }
        : payment,
      update: async (_args: unknown) => ({}),
    },
    order: { findUnique: async () => order, update: async () => ({}) },
    eventRegistration: { count: async () => 0 },
    ticket: {
      count: async () => 0,
      findUnique: async () => null,
      create: async () => {
        if (options.failTicket) throw new Error('database write failed')
        return { id: 'ticket-1' }
      },
    },
    orderItem: { count: async () => 1 },
    refund: { create: async () => ({}) },
  }
  t.mock.method(prisma, '$transaction', async (operation: (client: any) => unknown) => operation(tx))
  return { payment, order, tx }
}

test('Finik webhook rejects a bad signature before opening a database transaction', async (t) => {
  setTestWebhookKey(t)
  let transactionCalls = 0
  t.mock.method(prisma, '$transaction', async () => { transactionCalls += 1; return {} })
  const response = await finikWebhook(signedWebhookRequest(webhookPayload(), 'invalid-signature'))
  assert.equal(response.status, 401)
  assert.equal(transactionCalls, 0)
})

test('Finik webhook checks amount and currency before payment mutation', async (t) => {
  setTestWebhookKey(t)
  const { tx } = mockSuccessfulPaymentTransaction(t)
  let ticketCreates = 0
  tx.ticket.create = async () => { ticketCreates += 1; return { id: 'ticket-test' } }
  const badAmount = webhookPayload({ amount: 999 })
  const amountResponse = await finikWebhook(signedWebhookRequest(badAmount))
  assert.equal(amountResponse.status, 400)
  const badCurrency = webhookPayload({ fields: { ...webhookPayload().fields as object, currency: 'USD' } })
  const currencyResponse = await finikWebhook(signedWebhookRequest(badCurrency))
  assert.equal(currencyResponse.status, 400)
  assert.equal(ticketCreates, 0)
})

test('Finik webhook processes a valid payment and issues tickets exactly once', async (t) => {
  setTestWebhookKey(t)
  const { tx } = mockSuccessfulPaymentTransaction(t)
  let paymentUpdate: any
  let orderUpdate: any
  let ticketCreates = 0
  let processedEvents = 0
  tx.payment.update = async (args: any) => { paymentUpdate = args; return {} }
  tx.order.update = async (args: any) => { orderUpdate = args; return {} }
  tx.ticket.create = async () => { ticketCreates += 1; return { id: 'ticket-1' } }
  tx.paymentWebhookEvent.update = async (args: any) => {
    if (args.data.status === 'PROCESSED') processedEvents += 1
    return {}
  }
  let capturedError: unknown
  t.mock.method(console, 'error', (_message: string, error: unknown) => { capturedError = error })
  const response = await finikWebhook(signedWebhookRequest(webhookPayload()))
  const body = await response.json()
  assert.equal(response.status, 200, String((capturedError as Error | undefined)?.message ?? ''))
  assert.equal(body.processed, true)
  assert.equal(body.ticketsIssued, 1)
  assert.equal(paymentUpdate.data.status, PaymentStatus.SUCCEEDED)
  assert.equal(orderUpdate.data.status, OrderStatus.PAID)
  assert.equal(ticketCreates, 1)
  assert.equal(processedEvents, 1)
})

test('Finik webhook records a manual refund when an expired reservation has no remaining capacity', async (t) => {
  setTestWebhookKey(t)
  const { tx, order } = mockSuccessfulPaymentTransaction(t)
  order.status = OrderStatus.EXPIRED
  order.reservedUntil = new Date(Date.now() - 60_000)
  order.forum.capacity = 1
  tx.eventRegistration.count = async () => 1
  tx.orderItem.count = async () => 0
  let paymentUpdate: any
  let orderUpdate: any
  let refundData: any
  let ticketCreates = 0
  tx.payment.update = async (args: any) => { paymentUpdate = args; return {} }
  tx.order.update = async (args: any) => { orderUpdate = args; return {} }
  tx.refund.create = async (args: any) => { refundData = args.data; return { id: 'refund-1' } }
  tx.ticket.create = async () => { ticketCreates += 1; return { id: 'ticket-1' } }

  const response = await finikWebhook(signedWebhookRequest(webhookPayload()))
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.refundRequired, true)
  assert.equal(paymentUpdate.data.status, PaymentStatus.SUCCEEDED)
  assert.equal(orderUpdate.data.status, OrderStatus.CANCELLED)
  assert.equal(refundData.method, 'MANUAL')
  assert.equal(refundData.status, 'PENDING')
  assert.equal(refundData.amountMinor, 12345)
  assert.equal(ticketCreates, 0)
})

test('Finik webhook recognizes a duplicate transaction', async (t) => {
  setTestWebhookKey(t)
  const tx = { paymentWebhookEvent: { findUnique: async () => ({ id: 'existing' }) } }
  t.mock.method(prisma, '$transaction', async (operation: (client: any) => unknown) => operation(tx))
  const response = await finikWebhook(signedWebhookRequest(webhookPayload()))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).duplicate, true)
})

test('Finik webhook ignores unknown payment identifiers', async (t) => {
  setTestWebhookKey(t)
  let eventData: any
  const tx = {
    paymentWebhookEvent: {
      findUnique: async () => null,
      create: async (args: any) => { eventData = args.data; return { id: 'webhook-unknown' } },
    },
    payment: { findUnique: async () => null },
  }
  t.mock.method(prisma, '$transaction', async (operation: (client: any) => unknown) => operation(tx))
  const response = await finikWebhook(signedWebhookRequest(webhookPayload()))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).ignored, true)
  assert.equal(eventData.status, 'IGNORED')
})

test('Finik webhook does not issue tickets for an already paid payment', async (t) => {
  setTestWebhookKey(t)
  const { tx } = mockSuccessfulPaymentTransaction(t, { paymentStatus: PaymentStatus.SUCCEEDED })
  let capturedError: unknown
  t.mock.method(console, 'error', (_message: string, error: unknown) => { capturedError = error })
  let ticketCreates = 0
  tx.ticket.create = async () => { ticketCreates += 1; return { id: 'ticket-ignored' } }
  const response = await finikWebhook(signedWebhookRequest(webhookPayload()))
  assert.equal(response.status, 200, String((capturedError as Error | undefined)?.message ?? ''))
  assert.equal((await response.json()).duplicate, true)
  assert.equal(ticketCreates, 0)
})

test('Finik webhook returns a retryable error when database processing fails', async (t) => {
  setTestWebhookKey(t)
  mockSuccessfulPaymentTransaction(t, { failTicket: true })
  const response = await finikWebhook(signedWebhookRequest(webhookPayload()))
  assert.equal(response.status, 500)
  assert.equal((await response.json()).error.code, 'WEBHOOK_PROCESSING_FAILED')
})

test('Finik webhook handles a concurrent unique-event collision as a duplicate', async (t) => {
  setTestWebhookKey(t)
  const uniqueError = new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['dedupeKey'] },
  })
  t.mock.method(prisma, '$transaction', async () => { throw uniqueError })
  const response = await finikWebhook(signedWebhookRequest(webhookPayload()))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).duplicate, true)
})

test('Finik webhook rejects invalid public key format', async (t) => {
  const previousEnv = process.env.FINIK_ENV
  const previousKey = process.env.FINIK_BETA_PUBLIC_KEY
  process.env.FINIK_ENV = 'beta'
  process.env.FINIK_BETA_PUBLIC_KEY = 'not-a-valid-pem-key'
  
  t.after(() => {
    if (previousEnv === undefined) delete process.env.FINIK_ENV
    else process.env.FINIK_ENV = previousEnv
    if (previousKey === undefined) delete process.env.FINIK_BETA_PUBLIC_KEY
    else process.env.FINIK_BETA_PUBLIC_KEY = previousKey
  })
  
  const response = await finikWebhook(signedWebhookRequest(webhookPayload()))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'WEBHOOK_NOT_CONFIGURED')
})

test('Finik webhook returns 503 when public key is missing', async (t) => {
  const previousEnv = process.env.FINIK_ENV
  const previousKey = process.env.FINIK_BETA_PUBLIC_KEY
  process.env.FINIK_ENV = 'beta'
  delete process.env.FINIK_BETA_PUBLIC_KEY
  
  t.after(() => {
    if (previousEnv === undefined) delete process.env.FINIK_ENV
    else process.env.FINIK_ENV = previousEnv
    if (previousKey === undefined) delete process.env.FINIK_BETA_PUBLIC_KEY
    else process.env.FINIK_BETA_PUBLIC_KEY = previousKey
  })
  
  const response = await finikWebhook(signedWebhookRequest(webhookPayload()))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'WEBHOOK_NOT_CONFIGURED')
})
