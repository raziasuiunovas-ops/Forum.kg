import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, afterEach, beforeEach, test } from 'node:test'
import { NextRequest } from 'next/server'
import { PrismaClient, UserRole, UserStatus } from '@prisma/client'

// These test-only keys are local to this test process; no .env is loaded.
process.env.JWT_SECRET = 'forum-kg-integration-test-access-key'
process.env.JWT_REFRESH_SECRET = 'forum-kg-integration-test-refresh-key'

const { prisma } = require('../../../lib/db') as typeof import('../../../lib/db')
const { SessionService } = require('../../../lib/services/session.service') as typeof import('../../../lib/services/session.service')
const authSession = require('../../../lib/auth/session') as typeof import('../../../lib/auth/session')
const logoutAllRoute = require('../../../app/api/v1/auth/logout-all/route') as typeof import('../../../app/api/v1/auth/logout-all/route')

let userId = ''

async function removeSessionTree(targetUserId: string): Promise<void> {
  while (true) {
    const leaves = await prisma.session.findMany({
      where: {
        userId: targetUserId,
        childSessions: { none: {} },
      },
      select: { id: true },
    })

    if (leaves.length === 0) break

    await prisma.session.deleteMany({
      where: { id: { in: leaves.map(({ id }) => id) } },
    })
  }
}

async function getFamilyId(sessionId: string): Promise<string> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { sessionFamilyId: true },
  })

  assert.ok(session, 'expected the fixture session to exist')
  return session.sessionFamilyId
}

beforeEach(async () => {
  const user = await prisma.user.create({
    data: { email: `session-test-${randomUUID()}@example.test` },
    select: { id: true },
  })
  userId = user.id
})

afterEach(async () => {
  if (!userId) return

  await removeSessionTree(userId)
  await prisma.user.deleteMany({ where: { id: userId } })
  userId = ''
})

after(async () => {
  await prisma.$disconnect()
})

test('reusing a rotated refresh token commits revocation of the whole family', async () => {
  const first = await SessionService.createSession(userId)
  await SessionService.refreshSession(first.refreshToken)

  await assert.rejects(SessionService.refreshSession(first.refreshToken))

  const familyId = await getFamilyId(first.sessionId)
  const family = await prisma.session.findMany({ where: { sessionFamilyId: familyId } })

  assert.ok(family.length >= 2)
  assert.ok(family.every(({ revokedAt }) => revokedAt !== null))
})

test('two simultaneous refreshes of one token cannot both succeed', async () => {
  const first = await SessionService.createSession(userId)

  const results = await Promise.allSettled([
    SessionService.refreshSession(first.refreshToken),
    SessionService.refreshSession(first.refreshToken),
  ])

  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1)
  assert.equal(results.filter(({ status }) => status === 'rejected').length, 1)

  const familyId = await getFamilyId(first.sessionId)
  const activeCount = await prisma.session.count({
    where: { sessionFamilyId: familyId, revokedAt: null },
  })
  assert.equal(activeCount, 0)
})

test('logout racing with refresh leaves no active session in that family', async () => {
  const first = await SessionService.createSession(userId)

  const [logoutResult, refreshResult] = await Promise.allSettled([
    SessionService.logout(first.refreshToken),
    SessionService.refreshSession(first.refreshToken),
  ])

  assert.equal(logoutResult.status, 'fulfilled')
  if (logoutResult.status === 'fulfilled') assert.equal(logoutResult.value, true)
  assert.ok(refreshResult.status === 'fulfilled' || refreshResult.status === 'rejected')

  const familyId = await getFamilyId(first.sessionId)
  assert.equal(await prisma.session.count({
    where: { sessionFamilyId: familyId, revokedAt: null },
  }), 0)
})

test('logout-all racing with refresh leaves no active session for the user', async () => {
  const first = await SessionService.createSession(userId)

  const [logoutAllResult, refreshResult] = await Promise.allSettled([
    SessionService.logoutAll(userId),
    SessionService.refreshSession(first.refreshToken),
  ])

  assert.equal(logoutAllResult.status, 'fulfilled')
  if (logoutAllResult.status === 'fulfilled') assert.ok(logoutAllResult.value >= 1)
  assert.ok(refreshResult.status === 'fulfilled' || refreshResult.status === 'rejected')
  assert.equal(await prisma.session.count({ where: { userId, revokedAt: null } }), 0)
})

test('logout-all and session creation are serialized by the per-user lock', async () => {
  const completionOrder: string[] = []
  const createPromise = SessionService.createSession(userId).then((session) => {
    completionOrder.push('create')
    return session
  })
  const logoutAllPromise = SessionService.logoutAll(userId).then((count) => {
    completionOrder.push('logout-all')
    return count
  })

  const [created, revokedCount] = await Promise.all([createPromise, logoutAllPromise])

  const createdSession = await prisma.session.findUniqueOrThrow({
    where: { id: created.sessionId },
    select: { revokedAt: true },
  })

  // If creation commits first, Logout All must include it. If Logout All
  // commits first, creation is a later login and may remain active.
  if (completionOrder.indexOf('create') < completionOrder.indexOf('logout-all')) {
    assert.equal(revokedCount, 1)
    assert.ok(createdSession.revokedAt)
  } else {
    assert.equal(revokedCount, 0)
    assert.equal(createdSession.revokedAt, null)
  }
})

test('a revoked access-token session cannot invoke the logout-all route', async (t) => {
  const session = await SessionService.createSession(userId)
  await SessionService.logout(session.refreshToken)

  t.mock.method(authSession, 'getCurrentSession', async () => ({
    userId,
    sessionId: session.sessionId,
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 15 * 60,
  }))

  const request = new NextRequest('http://localhost/api/v1/auth/logout-all', {
    method: 'POST',
  })
  const response = await logoutAllRoute.POST(request)
  const body = await response.json() as { error: { code: string } }

  assert.equal(response.status, 401)
  assert.equal(body.error.code, 'SESSION_REVOKED')
})

test('a transaction error rolls back all family revocations', async () => {
  const first = await SessionService.createSession(userId)
  await SessionService.refreshSession(first.refreshToken)
  const familyId = await getFamilyId(first.sessionId)

  // Add a second active row in the same family to verify rollback across rows.
  await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: randomUUID().replace(/-/g, '').padEnd(64, '0'),
      sessionFamilyId: familyId,
      generationNumber: 0,
      expiresAt: new Date(Date.now() + 60_000),
    },
  })

  await assert.rejects(prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: { userId, sessionFamilyId: familyId, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedReason: 'SUSPICIOUS_ACTIVITY',
      },
    })

    throw new Error('forced transaction failure')
  }))

  assert.equal(await prisma.session.count({
    where: { userId, sessionFamilyId: familyId, revokedAt: null },
  }), 2)
})
