import assert from 'node:assert/strict'
import { randomInt } from 'node:crypto'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { OtpDeliveryStatus, OtpPurpose } from '@prisma/client'
import { hashPassword } from '../../../lib/auth/password'

process.env.JWT_SECRET = 'forum-kg-otp-database-test-access-secret'
process.env.JWT_REFRESH_SECRET = 'forum-kg-otp-database-test-refresh-secret'

const { prisma } = require('@/lib/db') as typeof import('../../../lib/db')
const verifyOtp = require('@/app/api/v1/auth/phone/verify-otp/route').POST as typeof import('../../../app/api/v1/auth/phone/verify-otp/route').POST
const auth = require('@/lib/auth/middleware') as typeof import('../../../lib/auth/middleware')
const csrf = require('@/lib/security/csrf') as typeof import('../../../lib/security/csrf')
const nextHeaders = require('next/headers') as typeof import('next/headers')

function uniquePhone(): string {
  return `+996555${randomInt(0, 1_000_000).toString().padStart(6, '0')}`
}

function request(challengeId: string) {
  return new NextRequest('http://localhost/api/v1/auth/phone/verify-otp', {
    method: 'POST',
    headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify({ challengeId, code: '123456' }),
  })
}

async function createChallenge(
  phone: string,
  purpose: OtpPurpose,
  requestedByUserId: string | null
) {
  return prisma.otpChallenge.create({
    data: {
      phone,
      purpose,
      codeHash: await hashPassword('123456'),
      attempts: 0,
      expiresAt: new Date(Date.now() + 10 * 60_000),
      deliveryStatus: OtpDeliveryStatus.ACCEPTED,
      requestedByUserId,
    },
  })
}

test('real database persists VERIFY_PHONE and CHANGE_PHONE without creating users or sessions', async (t) => {
  const userIds: string[] = []
  const challengeIds: string[] = []
  t.after(async () => {
    await prisma.otpChallenge.deleteMany({ where: { id: { in: challengeIds } } })
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  })

  const originalPhone = uniquePhone()
  const newPhone = uniquePhone()
  const userCountBefore = await prisma.user.count()
  const user = await prisma.user.create({ data: { phone: originalPhone } })
  userIds.push(user.id)
  t.mock.method(auth, 'requireAuth', async () => ({
    user: { userId: user.id, role: 'USER', status: 'ACTIVE' },
  }))
  t.mock.method(csrf, 'verifyCsrfToken', async () => true)

  const verifyChallenge = await createChallenge(originalPhone, OtpPurpose.VERIFY_PHONE, user.id)
  challengeIds.push(verifyChallenge.id)
  const verifyResponse = await verifyOtp(request(verifyChallenge.id))
  assert.equal(verifyResponse.status, 200)

  const verifiedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  assert.equal(verifiedUser.phone, originalPhone)
  assert.ok(verifiedUser.phoneVerifiedAt)
  assert.equal(await prisma.user.count(), userCountBefore + 1)
  assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0)
  assert.ok((await prisma.otpChallenge.findUniqueOrThrow({ where: { id: verifyChallenge.id } })).consumedAt)

  const changeChallenge = await createChallenge(newPhone, OtpPurpose.CHANGE_PHONE, user.id)
  challengeIds.push(changeChallenge.id)
  const changeResponse = await verifyOtp(request(changeChallenge.id))
  assert.equal(changeResponse.status, 200)

  const changedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  assert.equal(changedUser.phone, newPhone)
  assert.ok(changedUser.phoneVerifiedAt)
  assert.equal(await prisma.user.count(), userCountBefore + 1)
  assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0)
  assert.ok((await prisma.otpChallenge.findUniqueOrThrow({ where: { id: changeChallenge.id } })).consumedAt)
})

test('real database LOGIN creates a user and persists exactly one session', async (t) => {
  const phone = uniquePhone()
  const challenge = await createChallenge(phone, OtpPurpose.LOGIN, null)
  let createdUserId: string | undefined
  t.after(async () => {
    await prisma.otpChallenge.delete({ where: { id: challenge.id } })
    if (createdUserId) {
      await prisma.session.deleteMany({ where: { userId: createdUserId } })
      await prisma.user.delete({ where: { id: createdUserId } })
    }
  })

  t.mock.method(nextHeaders, 'cookies', async () => ({
    set: () => undefined,
    get: () => undefined,
    delete: () => undefined,
  }) as never)

  const response = await verifyOtp(request(challenge.id))
  assert.equal(response.status, 200)
  const createdUser = await prisma.user.findUniqueOrThrow({ where: { phone } })
  createdUserId = createdUser.id
  assert.ok(createdUser.phoneVerifiedAt)
  assert.equal(await prisma.session.count({ where: { userId: createdUser.id, revokedAt: null } }), 1)
  assert.ok((await prisma.otpChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).consumedAt)
})
