import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest } from 'next/server'

// The route imports auth modules at load time. These are test-only values.
process.env.JWT_SECRET = 'forum-kg-otp-rate-limit-test-access-key'
process.env.JWT_REFRESH_SECRET = 'forum-kg-otp-rate-limit-test-refresh-key'

const { prisma } = require('../../../lib/db') as typeof import('../../../lib/db')
const { POST } = require('../../../app/api/v1/auth/phone/request-otp/route') as typeof import('../../../app/api/v1/auth/phone/request-otp/route')

test('preserves the OTP per-phone limit and returns HTTP 429 at the existing threshold', async (t) => {
  t.mock.method(console, 'error', () => undefined)

  let countCalls = 0
  const transactionClient = {
    otpChallenge: {
      count: async () => {
        countCalls += 1
        return 3
      },
    },
  }

  t.mock.method(prisma, '$transaction', async (operation: unknown) => {
    assert.equal(typeof operation, 'function')
    return (operation as (client: typeof transactionClient) => Promise<unknown>)(transactionClient)
  })

  const request = new NextRequest('http://localhost/api/v1/auth/phone/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+996555123456', purpose: 'LOGIN' }),
  })
  const response = await POST(request)
  const body = await response.json() as {
    error: { code: string; details: { retryAfter: string } }
  }

  assert.equal(response.status, 429)
  assert.equal(body.error.code, 'RATE_LIMIT_EXCEEDED')
  assert.equal(body.error.details.retryAfter, '15 minutes')
  assert.equal(countCalls, 1)
})
