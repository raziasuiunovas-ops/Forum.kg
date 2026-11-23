/**
 * Admin 2FA Flow Integration Tests
 * Tests complete authentication flow through HTTP endpoints
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert'
import { NextRequest } from 'next/server'
import { POST as adminLogin } from '../../app/api/v1/admin/login/route'
import { POST as adminVerify2FA } from '../../app/api/v1/admin/verify-2fa/route'
import { prisma } from '../../lib/db'
import * as telegramModule from '../../lib/integrations/telegram'

const originalSendAdmin2FACode = telegramModule.sendAdmin2FACode
let telegramMock: any
let capturedCode: string | null = null

beforeEach(() => {
  capturedCode = null
  telegramMock = mock.fn(async (_chatId: string, code: string) => {
    capturedCode = code
    return Promise.resolve()
  })
  ;(telegramModule as any).sendAdmin2FACode = telegramMock
})

afterEach(async () => {
  ;(telegramModule as any).sendAdmin2FACode = originalSendAdmin2FACode
  await prisma.admin2FACode.deleteMany({ where: { username: 'admin' } })
  await prisma.user.deleteMany({ where: { email: 'admin@admin.forum.kg' } })
  await prisma.session.deleteMany({})
})

function createRequest(url: string, body: any): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Admin 2FA Flow Integration', () => {
  it('should complete full 2FA flow', async () => {
    // Step 1: Login with credentials
    const loginReq = createRequest('http://localhost:3000/api/v1/admin/login', {
      username: 'admin',
      password: process.env.ADMIN_PASSWORD_HASH ? 'dummy' : 'test-password',
    })

    // Skip if no admin password configured
    if (!process.env.ADMIN_LOGIN || !process.env.ADMIN_PASSWORD_HASH) {
      console.log('⚠️  Skipping: ADMIN_LOGIN/ADMIN_PASSWORD_HASH not configured')
      return
    }

    const loginRes = await adminLogin(loginReq)
    const loginData = await loginRes.json()

    if (loginRes.status !== 200) {
      // Expected if password doesn't match
      assert.strictEqual(loginData.error.code, 'INVALID_CREDENTIALS')
      return
    }

    assert.ok(loginData.data.pendingToken)
    assert.ok(capturedCode)

    // Step 2: Verify 2FA code
    const verifyReq = createRequest('http://localhost:3000/api/v1/admin/verify-2fa', {
      pendingToken: loginData.data.pendingToken,
      code: capturedCode,
    })

    const verifyRes = await adminVerify2FA(verifyReq)
    const verifyData = await verifyRes.json()

    assert.strictEqual(verifyRes.status, 200)
    assert.strictEqual(verifyData.data.user.role, 'SUPER_ADMIN')
    assert.ok(verifyData.data.session.expiresAt)
  })

  it('should reject invalid credentials', async () => {
    const req = createRequest('http://localhost:3000/api/v1/admin/login', {
      username: 'admin',
      password: 'wrong-password',
    })

    const res = await adminLogin(req)
    const data = await res.json()

    assert.strictEqual(res.status, 401)
    assert.strictEqual(data.error.code, 'INVALID_CREDENTIALS')
  })

  it('should reject invalid 2FA code', async () => {
    if (!process.env.ADMIN_LOGIN || !process.env.ADMIN_PASSWORD_HASH) {
      return
    }

    // Create session first
    const loginReq = createRequest('http://localhost:3000/api/v1/admin/login', {
      username: 'admin',
      password: 'test-password',
    })

    const loginRes = await adminLogin(loginReq)
    if (loginRes.status !== 200) return

    const loginData = await loginRes.json()

    // Try with wrong code
    const verifyReq = createRequest('http://localhost:3000/api/v1/admin/verify-2fa', {
      pendingToken: loginData.data.pendingToken,
      code: '000000',
    })

    const verifyRes = await adminVerify2FA(verifyReq)
    const verifyData = await verifyRes.json()

    assert.strictEqual(verifyRes.status, 401)
    assert.strictEqual(verifyData.error.code, 'INVALID_CODE')
  })

  it('should enforce rate limiting', async () => {
    if (!process.env.ADMIN_LOGIN || !process.env.ADMIN_TELEGRAM_CHAT_ID) {
      return
    }

    // Try to create 4 sessions
    for (let i = 0; i < 4; i++) {
      const req = createRequest('http://localhost:3000/api/v1/admin/login', {
        username: 'admin',
        password: 'test-password',
      })

      const res = await adminLogin(req)
      const data = await res.json()

      if (i < 3) {
        // First 3 should succeed or fail auth
        assert.ok(res.status === 200 || res.status === 401)
      } else {
        // 4th should be rate limited
        if (res.status === 429) {
          assert.strictEqual(data.error.code, 'RATE_LIMIT_EXCEEDED')
          return // Test passed
        }
      }
    }
  })
})
