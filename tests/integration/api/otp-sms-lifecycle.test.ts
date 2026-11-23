import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test, type TestContext } from 'node:test'
import { NextRequest, NextResponse } from 'next/server'
import { hashPassword, verifyPassword } from '../../../lib/auth/password'
import type { SmsProvider, SmsProviderError, SmsOtpMessage } from '../../../lib/integrations/sms/provider'

process.env.JWT_SECRET = 'forum-kg-otp-lifecycle-test-access-secret'
process.env.JWT_REFRESH_SECRET = 'forum-kg-otp-lifecycle-test-refresh-secret'

const { prisma } = require('@/lib/db') as typeof import('../../../lib/db')
const requestOtp = require('../../../app/api/v1/auth/phone/request-otp/route').POST as typeof import('../../../app/api/v1/auth/phone/request-otp/route').POST
const verifyOtp = require('../../../app/api/v1/auth/phone/verify-otp/route').POST as typeof import('../../../app/api/v1/auth/phone/verify-otp/route').POST
const authMiddleware = require('@/lib/auth/middleware') as typeof import('../../../lib/auth/middleware')
const csrf = require('@/lib/security/csrf') as typeof import('../../../lib/security/csrf')
const sms = require('@/lib/integrations/sms/provider') as typeof import('../../../lib/integrations/sms/provider')
const nextHeaders = require('next/headers') as typeof import('next/headers')
const { SessionService } = require('../../../lib/services/session.service') as typeof import('../../../lib/services/session.service')

type Purpose = 'LOGIN' | 'VERIFY_PHONE' | 'CHANGE_PHONE'
type DeliveryStatus = 'PENDING' | 'ACCEPTED' | 'FAILED' | 'UNKNOWN'

interface TestUser {
  id: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  phoneVerifiedAt: Date | null
  email: string | null
  role: 'USER' | 'SCANNER' | 'MANAGER' | 'SUPER_ADMIN'
  status: 'ACTIVE' | 'SUSPENDED'
  preferredLocale: 'RU' | 'KY' | 'EN'
  announcementsPushEnabled: boolean
  createdAt: Date
  updatedAt: Date
}

interface TestChallenge {
  id: string
  phone: string
  purpose: Purpose
  codeHash: string
  attempts: number
  expiresAt: Date
  consumedAt: Date | null
  deliveryStatus: DeliveryStatus
  requestedByUserId: string | null
  createdAt: Date
}

interface TestState {
  challenges: TestChallenge[]
  users: TestUser[]
  sessions: Array<{ userId: string; sessionId: string }>
}

interface SetupOptions {
  challenges?: TestChallenge[]
  users?: TestUser[]
  serializationFailures?: number
}

function project<T extends object>(value: T | null, select?: Record<string, boolean>): T | null | Record<string, unknown> {
  if (!value || !select) return value
  return Object.fromEntries(
    Object.entries(select).filter(([, selected]) => selected).map(([key]) => [key, (value as Record<string, unknown>)[key]])
  )
}

function matchesChallenge(challenge: TestChallenge, where: Record<string, unknown> = {}): boolean {
  for (const field of ['id', 'phone', 'purpose', 'requestedByUserId', 'consumedAt'] as const) {
    if (!Object.prototype.hasOwnProperty.call(where, field)) continue
    if (field === 'consumedAt' && where[field] === null) {
      if (challenge.consumedAt !== null && challenge.consumedAt !== undefined) return false
      continue
    }
    if (challenge[field] !== where[field]) return false
  }

  const createdAt = where.createdAt as { gte?: Date } | undefined
  if (createdAt?.gte && challenge.createdAt < createdAt.gte) return false

  const expiresAt = where.expiresAt as { gt?: Date; gte?: Date } | undefined
  if (expiresAt?.gt && challenge.expiresAt <= expiresAt.gt) return false
  if (expiresAt?.gte && challenge.expiresAt < expiresAt.gte) return false

  const deliveryStatus = where.deliveryStatus as { in?: DeliveryStatus[] } | DeliveryStatus | undefined
  if (deliveryStatus && typeof deliveryStatus === 'object' && deliveryStatus.in) {
    if (!deliveryStatus.in.includes(challenge.deliveryStatus)) return false
  } else if (deliveryStatus && challenge.deliveryStatus !== deliveryStatus) {
    return false
  }

  const attempts = where.attempts as { lt?: number } | undefined
  if (attempts?.lt !== undefined && challenge.attempts >= attempts.lt) return false
  return true
}

function updateChallenge(challenge: TestChallenge, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (key === 'attempts' && value && typeof value === 'object' && 'increment' in value) {
      challenge.attempts += Number((value as { increment: number }).increment)
    } else {
      ;(challenge as unknown as Record<string, unknown>)[key] = value
    }
  }
}

function setupDatabase(t: TestContext, options: SetupOptions = {}) {
  let state: TestState = {
    challenges: structuredClone(options.challenges ?? []),
    users: structuredClone(options.users ?? []),
    sessions: [],
  }
  let serializationFailures = options.serializationFailures ?? 0

  const findChallenge = async (args: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
    const found = state.challenges.find((item) => matchesChallenge(item, args.where)) ?? null
    return project(found, args.select)
  }
  const updateChallenges = async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    let count = 0
    for (const challenge of state.challenges) {
      if (!matchesChallenge(challenge, args.where)) continue
      updateChallenge(challenge, args.data)
      count += 1
    }
    return { count }
  }
  const findUser = async (args: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
    const found = state.users.find((item) =>
      args.where.id ? item.id === args.where.id : item.phone === args.where.phone
    ) ?? null
    return project(found, args.select)
  }
  const createUser = async (args: { data: Partial<TestUser> }) => {
    const now = new Date()
    const user: TestUser = {
      id: args.data.id ?? randomUUID(),
      firstName: args.data.firstName ?? null,
      lastName: args.data.lastName ?? null,
      phone: args.data.phone ?? null,
      phoneVerifiedAt: args.data.phoneVerifiedAt ?? null,
      email: args.data.email ?? null,
      role: args.data.role ?? 'USER',
      status: args.data.status ?? 'ACTIVE',
      preferredLocale: args.data.preferredLocale ?? 'RU',
      announcementsPushEnabled: true,
      createdAt: args.data.createdAt ?? now,
      updatedAt: args.data.updatedAt ?? now,
    }
    state.users.push(user)
    return user
  }
  const updateUser = async (args: { where: { id: string }; data: Partial<TestUser> }) => {
    const user = state.users.find((item) => item.id === args.where.id)
    if (!user) throw new Error('User not found in fake database')
    Object.assign(user, args.data, { updatedAt: new Date() })
    return user
  }

  const transactionClient = {
    otpChallenge: {
      findFirst: async (args: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
        const found = state.challenges
          .filter((item) => matchesChallenge(item, args.where))
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null
        return project(found, args.select)
      },
      findUnique: findChallenge,
      count: async (args: { where: Record<string, unknown> }) =>
        state.challenges.filter((item) => matchesChallenge(item, args.where)).length,
      updateMany: updateChallenges,
      create: async (args: { data: Omit<TestChallenge, 'id' | 'createdAt'>; select?: Record<string, boolean> }) => {
        const challenge: TestChallenge = {
          ...args.data,
          id: randomUUID(),
          createdAt: new Date(),
        }
        state.challenges.push(challenge)
        return project(challenge, args.select)
      },
    },
    user: { findUnique: findUser, create: createUser, update: updateUser },
  }

  const runTransaction = async (operation: unknown) => {
    if (serializationFailures > 0) {
      serializationFailures -= 1
      throw Object.assign(new Error('serialization conflict'), { code: 'P2034' })
    }
    const snapshot = structuredClone(state)
    try {
      return await (operation as (client: typeof transactionClient) => Promise<unknown>)(transactionClient)
    } catch (error) {
      state = snapshot
      throw error
    }
  }

  t.mock.method(prisma, '$transaction', runTransaction as never)

  const sessionService = SessionService as typeof import('../../../lib/services/session.service').SessionService
  t.mock.method(sessionService, 'createSession', async (userId: string) => {
    const session = { userId, sessionId: randomUUID(), refreshToken: 'test-refresh-token' }
    state.sessions.push({ userId, sessionId: session.sessionId })
    return session
  })

  return {
    get state() { return state },
    setProvider(provider: SmsProvider | null) {
      t.mock.method(sms, 'getSmsProvider', () => provider)
    },
    setAuth(userId?: string) {
      t.mock.method(authMiddleware, 'requireAuth', async () =>
        userId
          ? { user: { userId, role: 'USER', status: 'ACTIVE' } }
          : NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
      )
    },
    setCsrf(valid = true) {
      t.mock.method(csrf, 'verifyCsrfToken', async () => valid)
    },
    mockCookies() {
      const cookies: Array<{ name: string; value: string }> = []
      t.mock.method(nextHeaders, 'cookies', async () => ({
        set: (name: string, value: string) => cookies.push({ name, value }),
        get: () => undefined,
        delete: () => undefined,
      }) as never)
      return cookies
    },
  }
}

function makeUser(overrides: Partial<TestUser> = {}): TestUser {
  const now = new Date()
  return {
    id: randomUUID(),
    firstName: 'Test',
    lastName: 'User',
    phone: '+996555123456',
    phoneVerifiedAt: null,
    email: null,
    role: 'USER',
    status: 'ACTIVE',
    preferredLocale: 'RU',
    announcementsPushEnabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

async function makeChallenge(
  code: string,
  overrides: Partial<TestChallenge> = {}
): Promise<TestChallenge> {
  const now = new Date()
  return {
    id: randomUUID(),
    phone: '+996555123456',
    purpose: 'LOGIN',
    codeHash: await hashPassword(code),
    attempts: 0,
    expiresAt: new Date(now.getTime() + 10 * 60_000),
    consumedAt: null,
    deliveryStatus: 'ACCEPTED',
    requestedByUserId: null,
    createdAt: now,
    ...overrides,
  }
}

function postRequest(path: string, body: object) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function successProvider(onSend?: (message: SmsOtpMessage) => void): SmsProvider {
  return {
    sendOtp: async (message) => {
      onSend?.(message)
      return { accepted: true }
    },
  }
}

test('LOGIN sends one code, stores only its hash, and does not expose code in response or audit logs', async (t) => {
  const db = setupDatabase(t)
  const sentMessages: SmsOtpMessage[] = []
  const logs: string[] = []
  t.mock.method(console, 'info', (message: string) => logs.push(message))
  t.mock.method(console, 'warn', (message: string) => logs.push(message))
  t.mock.method(console, 'error', (message: string) => logs.push(message))
  db.setProvider(successProvider((message) => sentMessages.push(message)))
  assert.ok(sms.getSmsProvider())

  const response = await requestOtp(postRequest('/api/v1/auth/phone/request-otp', {
    phone: '0555123456', purpose: 'LOGIN',
  }))
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0].to, /^\+996\d{9}$/)
  assert.notEqual(db.state.challenges[0].codeHash, sentMessages[0].code)
  assert.equal(db.state.challenges[0].deliveryStatus, 'ACCEPTED')
  assert.equal(payload.challengeId, db.state.challenges[0].id)
  assert.equal(JSON.stringify(payload).includes(sentMessages[0].code), false)
  assert.equal(logs.join('\n').includes(sentMessages[0].code), false)
})

test('missing SMS provider fails closed without creating a challenge', async (t) => {
  const db = setupDatabase(t)
  db.setProvider(null)
  const response = await requestOtp(postRequest('/api/v1/auth/phone/request-otp', {
    phone: '+996555123456', purpose: 'LOGIN',
  }))
  const payload = await response.json()

  assert.equal(response.status, 503)
  assert.equal(payload.error.code, 'SMS_NOT_CONFIGURED')
  assert.equal(db.state.challenges.length, 0)
})

test('confirmed SMS rejection invalidates prior active challenge and leaves the new one unusable', async (t) => {
  const previous = await makeChallenge('123456', { createdAt: new Date(Date.now() - 120_000) })
  const db = setupDatabase(t, { challenges: [previous] })
  db.setProvider({ sendOtp: async () => { throw new sms.SmsProviderError('rejected') } })

  const response = await requestOtp(postRequest('/api/v1/auth/phone/request-otp', {
    phone: previous.phone, purpose: 'LOGIN',
  }))

  assert.equal(response.status, 502)
  assert.notEqual(db.state.challenges[0].consumedAt, null)
  assert.equal(db.state.challenges[1].deliveryStatus, 'FAILED')
  assert.notEqual(db.state.challenges[1].consumedAt, null)
})

test('uncertain SMS outcome is not retried and its challenge cannot be verified', async (t) => {
  const db = setupDatabase(t)
  let sends = 0
  db.setProvider({ sendOtp: async () => {
    sends += 1
    throw new sms.SmsProviderError('unknown')
  } })

  const response = await requestOtp(postRequest('/api/v1/auth/phone/request-otp', {
    phone: '+996555123456', purpose: 'LOGIN',
  }))

  assert.equal(response.status, 502)
  assert.equal(sends, 1)
  assert.equal(db.state.challenges[0].deliveryStatus, 'UNKNOWN')
  assert.notEqual(db.state.challenges[0].consumedAt, null)

  const retry = await requestOtp(postRequest('/api/v1/auth/phone/request-otp', {
    phone: '+996555123456', purpose: 'LOGIN',
  }))
  const retryPayload = await retry.json()
  assert.equal(retry.status, 409)
  assert.equal(retryPayload.error.code, 'OTP_REQUEST_IN_PROGRESS')
  assert.equal(sends, 1)
})

test('a repeated request reuses a recent accepted challenge instead of sending a duplicate SMS', async (t) => {
  const db = setupDatabase(t)
  let sends = 0
  db.setProvider(successProvider(() => { sends += 1 }))
  const input = { phone: '+996555123456', purpose: 'LOGIN' }

  const first = await requestOtp(postRequest('/api/v1/auth/phone/request-otp', input))
  const firstPayload = await first.json()
  const second = await requestOtp(postRequest('/api/v1/auth/phone/request-otp', input))
  const secondPayload = await second.json()

  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(firstPayload.challengeId, secondPayload.challengeId)
  assert.equal(sends, 1)
  assert.equal(db.state.challenges.length, 1)
})

test('a repeated request during delivery is rejected without starting another send', async (t) => {
  const pending = await makeChallenge('123456', {
    deliveryStatus: 'PENDING',
    createdAt: new Date(),
  })
  const db = setupDatabase(t, { challenges: [pending] })
  let sends = 0
  db.setProvider(successProvider(() => { sends += 1 }))

  const response = await requestOtp(postRequest('/api/v1/auth/phone/request-otp', {
    phone: pending.phone, purpose: pending.purpose,
  }))
  const payload = await response.json()

  assert.equal(response.status, 409)
  assert.equal(payload.error.code, 'OTP_REQUEST_IN_PROGRESS')
  assert.equal(sends, 0)
  assert.equal(db.state.challenges.length, 1)
})

test('a pending send older than the resend cooldown is not duplicated', async (t) => {
  const pending = await makeChallenge('123456', {
    deliveryStatus: 'PENDING',
    createdAt: new Date(Date.now() - 2 * 60_000),
  })
  const db = setupDatabase(t, { challenges: [pending] })
  let sends = 0
  db.setProvider(successProvider(() => { sends += 1 }))

  const response = await requestOtp(postRequest('/api/v1/auth/phone/request-otp', {
    phone: pending.phone, purpose: pending.purpose,
  }))

  assert.equal(response.status, 409)
  assert.equal(sends, 0)
  assert.equal(db.state.challenges.length, 1)
})

test('preserves the three requests per phone and purpose limit', async (t) => {
  const old = await Promise.all([0, 1, 2].map((index) => makeChallenge('123456', {
    id: randomUUID(),
    createdAt: new Date(Date.now() - index * 60_000),
    deliveryStatus: 'FAILED',
    consumedAt: new Date(),
  })))
  const db = setupDatabase(t, { challenges: old })
  let sends = 0
  db.setProvider(successProvider(() => { sends += 1 }))

  const response = await requestOtp(postRequest('/api/v1/auth/phone/request-otp', {
    phone: old[0].phone, purpose: 'LOGIN',
  }))
  const payload = await response.json()

  assert.equal(response.status, 429)
  assert.equal(payload.error.code, 'RATE_LIMIT_EXCEEDED')
  assert.equal(sends, 0)
})

test('a serialization retry does not duplicate the SMS or change the generated code', async (t) => {
  const db = setupDatabase(t, { serializationFailures: 1 })
  const sentMessages: SmsOtpMessage[] = []
  db.setProvider(successProvider((message) => sentMessages.push(message)))

  const response = await requestOtp(postRequest('/api/v1/auth/phone/request-otp', {
    phone: '+996555123456', purpose: 'LOGIN',
  }))

  assert.equal(response.status, 200)
  assert.equal(sentMessages.length, 1)
  assert.equal(db.state.challenges.length, 1)
  assert.equal(db.state.challenges[0].deliveryStatus, 'ACCEPTED')
  assert.equal(await verifyPassword(sentMessages[0].code, db.state.challenges[0].codeHash), true)
})

test('LOGIN for an existing user verifies phone and creates one session with existing cookies', async (t) => {
  const user = makeUser({ phone: '+996555123456' })
  const challenge = await makeChallenge('123456')
  const db = setupDatabase(t, { users: [user], challenges: [challenge] })
  db.setAuth()
  const cookies = db.mockCookies()

  const response = await verifyOtp(postRequest('/api/v1/auth/phone/verify-otp', {
    challengeId: challenge.id, code: '123456',
  }))
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.user.id, user.id)
  assert.ok(db.state.users[0].phoneVerifiedAt)
  assert.equal(db.state.users.length, 1)
  assert.equal(db.state.sessions.length, 1)
  assert.deepEqual(cookies.map(({ name }) => name).sort(), ['csrf_token', 'refresh', 'session'])
})

test('LOGIN for a new user creates one account and one session', async (t) => {
  const challenge = await makeChallenge('123456')
  const db = setupDatabase(t, { challenges: [challenge] })
  db.setAuth()
  db.mockCookies()

  const response = await verifyOtp(postRequest('/api/v1/auth/phone/verify-otp', {
    challengeId: challenge.id, code: '123456',
  }))
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(db.state.users.length, 1)
  assert.equal(db.state.users[0].phone, challenge.phone)
  assert.ok(db.state.users[0].phoneVerifiedAt)
  assert.equal(db.state.sessions.length, 1)
  assert.equal(payload.user.id, db.state.users[0].id)
})

test('VERIFY_PHONE requires an authenticated session', async (t) => {
  const owner = makeUser()
  const challenge = await makeChallenge('123456', {
    purpose: 'VERIFY_PHONE', requestedByUserId: owner.id,
  })
  const db = setupDatabase(t, { users: [owner], challenges: [challenge] })
  db.setAuth()

  const response = await verifyOtp(postRequest('/api/v1/auth/phone/verify-otp', {
    challengeId: challenge.id, code: '123456',
  }))

  assert.equal(response.status, 401)
  assert.equal(db.state.challenges[0].attempts, 0)
  assert.equal(db.state.challenges[0].consumedAt, null)
  assert.equal(db.state.sessions.length, 0)
})

test('VERIFY_PHONE marks only the current account phone verified and creates no user or session', async (t) => {
  const owner = makeUser()
  const challenge = await makeChallenge('123456', {
    purpose: 'VERIFY_PHONE', requestedByUserId: owner.id,
  })
  const db = setupDatabase(t, { users: [owner], challenges: [challenge] })
  db.setAuth(owner.id)
  db.setCsrf(true)

  const response = await verifyOtp(postRequest('/api/v1/auth/phone/verify-otp', {
    challengeId: challenge.id, code: '123456',
  }))

  assert.equal(response.status, 200)
  assert.equal(db.state.users.length, 1)
  assert.ok(db.state.users[0].phoneVerifiedAt)
  assert.equal(db.state.sessions.length, 0)
  assert.ok(db.state.challenges[0].consumedAt)
})

test('CHANGE_PHONE requires an authenticated session', async (t) => {
  const owner = makeUser()
  const challenge = await makeChallenge('123456', {
    phone: '+996700123456', purpose: 'CHANGE_PHONE', requestedByUserId: owner.id,
  })
  const db = setupDatabase(t, { users: [owner], challenges: [challenge] })
  db.setAuth()

  const response = await verifyOtp(postRequest('/api/v1/auth/phone/verify-otp', {
    challengeId: challenge.id, code: '123456',
  }))

  assert.equal(response.status, 401)
  assert.equal(db.state.users[0].phone, owner.phone)
  assert.equal(db.state.sessions.length, 0)
})

test('CHANGE_PHONE updates only the authenticated account without issuing a new session', async (t) => {
  const owner = makeUser()
  const challenge = await makeChallenge('123456', {
    phone: '+996700123456', purpose: 'CHANGE_PHONE', requestedByUserId: owner.id,
  })
  const db = setupDatabase(t, { users: [owner], challenges: [challenge] })
  db.setAuth(owner.id)
  db.setCsrf(true)

  const response = await verifyOtp(postRequest('/api/v1/auth/phone/verify-otp', {
    challengeId: challenge.id, code: '123456',
  }))

  assert.equal(response.status, 200)
  assert.equal(db.state.users.length, 1)
  assert.equal(db.state.users[0].phone, '+996700123456')
  assert.ok(db.state.users[0].phoneVerifiedAt)
  assert.equal(db.state.sessions.length, 0)
})

test('a challenge bound to another user cannot be used to change this user account', async (t) => {
  const owner = makeUser()
  const other = makeUser({ phone: '+996700123456' })
  const challenge = await makeChallenge('123456', {
    phone: '+996777123456', purpose: 'CHANGE_PHONE', requestedByUserId: other.id,
  })
  const db = setupDatabase(t, { users: [owner, other], challenges: [challenge] })
  db.setAuth(owner.id)
  db.setCsrf(true)

  const response = await verifyOtp(postRequest('/api/v1/auth/phone/verify-otp', {
    challengeId: challenge.id, code: '123456',
  }))

  assert.equal(response.status, 403)
  assert.equal(db.state.users.find((user) => user.id === owner.id)?.phone, owner.phone)
  assert.equal(db.state.challenges[0].attempts, 0)
  assert.equal(db.state.sessions.length, 0)
})

test('CHANGE_PHONE rejects a number that became owned by another account', async (t) => {
  const owner = makeUser()
  const other = makeUser({ phone: '+996700123456' })
  const challenge = await makeChallenge('123456', {
    phone: other.phone!, purpose: 'CHANGE_PHONE', requestedByUserId: owner.id,
  })
  const db = setupDatabase(t, { users: [owner, other], challenges: [challenge] })
  db.setAuth(owner.id)
  db.setCsrf(true)

  const response = await verifyOtp(postRequest('/api/v1/auth/phone/verify-otp', {
    challengeId: challenge.id, code: '123456',
  }))
  const payload = await response.json()

  assert.equal(response.status, 409)
  assert.equal(payload.error.code, 'PHONE_ALREADY_IN_USE')
  assert.equal(db.state.users.find((user) => user.id === owner.id)?.phone, owner.phone)
  assert.ok(db.state.challenges[0].consumedAt)
})

test('CHANGE_PHONE request rejects an already-owned phone before creating a challenge', async (t) => {
  const owner = makeUser()
  const other = makeUser({ phone: '+996700123456' })
  const db = setupDatabase(t, { users: [owner, other] })
  db.setAuth(owner.id)
  db.setCsrf(true)
  db.setProvider(successProvider())

  const response = await requestOtp(postRequest('/api/v1/auth/phone/request-otp', {
    phone: other.phone, purpose: 'CHANGE_PHONE',
  }))
  const payload = await response.json()

  assert.equal(response.status, 409)
  assert.equal(payload.error.code, 'PHONE_ALREADY_IN_USE')
  assert.equal(db.state.challenges.length, 0)
})

test('authenticated OTP operations reject invalid CSRF tokens', async (t) => {
  const owner = makeUser()
  const challenge = await makeChallenge('123456', {
    purpose: 'VERIFY_PHONE', requestedByUserId: owner.id,
  })
  const db = setupDatabase(t, { users: [owner], challenges: [challenge] })
  db.setAuth(owner.id)
  db.setCsrf(false)

  const response = await verifyOtp(postRequest('/api/v1/auth/phone/verify-otp', {
    challengeId: challenge.id, code: '123456',
  }))

  assert.equal(response.status, 403)
  assert.equal(db.state.challenges[0].attempts, 0)
  assert.equal(db.state.users[0].phoneVerifiedAt, null)
})

test('incorrect OTP increments attempts and does not create an account or session', async (t) => {
  const challenge = await makeChallenge('123456')
  const db = setupDatabase(t, { challenges: [challenge] })
  db.setAuth()

  const response = await verifyOtp(postRequest('/api/v1/auth/phone/verify-otp', {
    challengeId: challenge.id, code: '999999',
  }))
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.equal(payload.error.code, 'INVALID_OTP')
  assert.equal(db.state.challenges[0].attempts, 1)
  assert.equal(db.state.users.length, 0)
  assert.equal(db.state.sessions.length, 0)
})

test('expired, consumed, and attempt-exhausted challenges are rejected', async (t) => {
  const expired = await makeChallenge('123456', { expiresAt: new Date(Date.now() - 1) })
  const expiredDb = setupDatabase(t, { challenges: [expired] })
  expiredDb.setAuth()
  const expiredResponse = await verifyOtp(postRequest('/api/v1/auth/phone/verify-otp', {
    challengeId: expired.id, code: '123456',
  }))
  assert.equal(expiredResponse.status, 400)
  assert.equal(expiredDb.state.users.length, 0)

  const consumed = await makeChallenge('123456', { consumedAt: new Date() })
  const consumedDb = setupDatabase(t, { challenges: [consumed] })
  consumedDb.setAuth()
  const consumedResponse = await verifyOtp(postRequest('/api/v1/auth/phone/verify-otp', {
    challengeId: consumed.id, code: '123456',
  }))
  assert.equal(consumedResponse.status, 400)
  assert.equal(consumedDb.state.sessions.length, 0)

  const exhausted = await makeChallenge('123456', { attempts: 5 })
  const exhaustedDb = setupDatabase(t, { challenges: [exhausted] })
  exhaustedDb.setAuth()
  const exhaustedResponse = await verifyOtp(postRequest('/api/v1/auth/phone/verify-otp', {
    challengeId: exhausted.id, code: '123456',
  }))
  assert.equal(exhaustedResponse.status, 429)
  assert.equal(exhaustedDb.state.users.length, 0)
})

test('SMS adapter timeout aborts the request and is classified as an unknown delivery result', async () => {
  let signal: AbortSignal | undefined
  const provider: SmsProvider = {
    sendOtp: async (_message, options) => {
      signal = options.signal
      return await new Promise(() => undefined)
    },
  }

  await assert.rejects(
    sms.sendOtpSms(provider, {
      challengeId: randomUUID(),
      to: '+996555123456',
      code: '123456',
      purpose: 'LOGIN',
      expiresAt: new Date(Date.now() + 60_000),
    }, 5),
    (error: SmsProviderError) => error.certainty === 'unknown'
  )
  assert.equal(signal?.aborted, true)
})
