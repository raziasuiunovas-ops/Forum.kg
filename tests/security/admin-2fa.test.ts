/**
 * Admin 2FA Security Tests (Database Integration)
 * Tests for admin two-factor authentication via Telegram
 * 
 * Test coverage:
 * - 2FA code generation (cryptographic security)
 * - Code expiry (5 minutes)
 * - One-time use enforcement
 * - Rate limiting (3 attempts per 15 minutes)
 * - Verification attempts limit (3 per code)
 * - Database persistence
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert'
import { Admin2FAService, cleanupExpiredAdmin2FACodes } from '../../lib/services/admin-2fa.service'
import { prisma } from '../../lib/db'
import * as telegramModule from '../../lib/integrations/telegram'

// Mock Telegram integration
const originalSendAdmin2FACode = telegramModule.sendAdmin2FACode
let telegramMock: any

beforeEach(() => {
  telegramMock = mock.fn(async () => Promise.resolve())
  ;(telegramModule as any).sendAdmin2FACode = telegramMock
})

afterEach(async () => {
  ;(telegramModule as any).sendAdmin2FACode = originalSendAdmin2FACode
  
  // Cleanup test data
  await prisma.admin2FACode.deleteMany({
    where: {
      username: { in: ['admin-test', 'admin-rate-limit'] },
    },
  })
})

describe('Admin 2FA Security Tests', () => {
  describe('1. Code Generation & Storage', () => {
    it('should generate code and store in database', async () => {
      const session = await Admin2FAService.createSession('admin-test', '123456789')

      assert.ok(session.pendingToken)
      assert.strictEqual(session.expiresInSeconds, 300)

      const dbEntry = await prisma.admin2FACode.findUnique({
        where: { pendingToken: session.pendingToken },
      })

      assert.ok(dbEntry)
      assert.strictEqual(dbEntry.username, 'admin-test')
      assert.strictEqual(dbEntry.attempts, 0)
      assert.strictEqual(dbEntry.codeHash.length, 64) // SHA-256
    })

    it('should call Telegram with 6-digit code', async () => {
      await Admin2FAService.createSession('admin-test', '123456789')

      assert.strictEqual(telegramMock.mock.calls.length, 1)
      const code = telegramMock.mock.calls[0].arguments[1]
      assert.match(code, /^\d{6}$/)
    })
  })

  describe('2. Verification', () => {
    it('should verify correct code', async () => {
      const session = await Admin2FAService.createSession('admin-test', '123456789')
      const code = telegramMock.mock.calls[0].arguments[1]

      const result = await Admin2FAService.verifyCode(session.pendingToken, code)

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.username, 'admin-test')

      // Verify deleted from DB (one-time use)
      const dbEntry = await prisma.admin2FACode.findUnique({
        where: { pendingToken: session.pendingToken },
      })
      assert.strictEqual(dbEntry, null)
    })

    it('should reject incorrect code', async () => {
      const session = await Admin2FAService.createSession('admin-test', '123456789')

      const result = await Admin2FAService.verifyCode(session.pendingToken, '000000')

      assert.strictEqual(result.success, false)
      assert.strictEqual(result.error, 'INVALID_CODE')

      // Verify attempts incremented
      const dbEntry = await prisma.admin2FACode.findUnique({
        where: { pendingToken: session.pendingToken },
      })
      assert.strictEqual(dbEntry!.attempts, 1)
    })

    it('should reject invalid token', async () => {
      const result = await Admin2FAService.verifyCode('invalid', '123456')
      assert.strictEqual(result.error, 'INVALID_TOKEN')
    })
  })

  describe('3. One-Time Use', () => {
    it('should delete code after successful verification', async () => {
      const session = await Admin2FAService.createSession('admin-test', '123456789')
      const code = telegramMock.mock.calls[0].arguments[1]

      await Admin2FAService.verifyCode(session.pendingToken, code)

      const result2 = await Admin2FAService.verifyCode(session.pendingToken, code)
      assert.strictEqual(result2.error, 'INVALID_TOKEN')
    })

    it('should delete code after max attempts', async () => {
      const session = await Admin2FAService.createSession('admin-test', '123456789')

      for (let i = 0; i < 3; i++) {
        await Admin2FAService.verifyCode(session.pendingToken, '000000')
      }

      const result = await Admin2FAService.verifyCode(session.pendingToken, '000000')
      assert.strictEqual(result.error, 'INVALID_TOKEN')

      const dbEntry = await prisma.admin2FACode.findUnique({
        where: { pendingToken: session.pendingToken },
      })
      assert.strictEqual(dbEntry, null)
    })
  })

  describe('4. Rate Limiting', () => {
    it('should allow 3 sessions', async () => {
      for (let i = 0; i < 3; i++) {
        await Admin2FAService.createSession('admin-rate-limit', '123456789')
      }

      const dbEntries = await prisma.admin2FACode.findMany({
        where: { username: 'admin-rate-limit' },
      })
      assert.strictEqual(dbEntries.length, 3)
    })

    it('should block 4th session', async () => {
      for (let i = 0; i < 3; i++) {
        await Admin2FAService.createSession('admin-rate-limit', '123456789')
      }

      try {
        await Admin2FAService.createSession('admin-rate-limit', '123456789')
        assert.fail('should throw')
      } catch (error) {
        assert.strictEqual((error as Error).message, 'RATE_LIMIT_EXCEEDED')
      }
    })
  })

  describe('5. Cleanup', () => {
    it('should cleanup expired codes', async () => {
      // Create expired code by manual DB insert
      await prisma.admin2FACode.create({
        data: {
          pendingToken: 'expired-token',
          username: 'admin-test',
          codeHash: 'hash',
          chatId: '123',
          expiresAt: new Date(Date.now() - 1000), // 1 second ago
        },
      })

      const deleted = await cleanupExpiredAdmin2FACodes()
      assert.ok(deleted >= 1)

      const dbEntry = await prisma.admin2FACode.findUnique({
        where: { pendingToken: 'expired-token' },
      })
      assert.strictEqual(dbEntry, null)
    })
  })

  describe('6. Telegram Integration', () => {
    it('should handle Telegram failure', async () => {
      const errorMock = mock.fn(async () => {
        throw new Error('Network error')
      })
      ;(telegramModule as any).sendAdmin2FACode = errorMock

      try {
        await Admin2FAService.createSession('admin-test', '123456789')
        assert.fail('should throw')
      } catch (error) {
        assert.ok((error as Error).message.startsWith('TELEGRAM_SEND_FAILED'))
      }

      // Verify no orphaned DB record
      const dbEntries = await prisma.admin2FACode.findMany({
        where: { username: 'admin-test' },
      })
      assert.strictEqual(dbEntries.length, 0)
    })
  })
})
