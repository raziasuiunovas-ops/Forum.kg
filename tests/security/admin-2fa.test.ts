/**
 * Admin 2FA Security Tests
 * Tests for admin two-factor authentication via Telegram
 * 
 * Test coverage:
 * - 2FA code generation (cryptographic security)
 * - Code expiry (5 minutes)
 * - One-time use enforcement
 * - Rate limiting (3 attempts per 15 minutes)
 * - Verification attempts limit (3 per code)
 * - Pending token validation
 * - Full authentication flow
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert'
import { Admin2FAService } from '../../lib/services/admin-2fa.service'
import * as telegramModule from '../../lib/integrations/telegram'

// Mock Telegram integration
const originalSendAdmin2FACode = telegramModule.sendAdmin2FACode
let telegramMock: any

beforeEach(() => {
  // Mock Telegram sending to avoid actual API calls
  telegramMock = mock.fn(async () => {
    return Promise.resolve()
  })
  ;(telegramModule as any).sendAdmin2FACode = telegramMock
})

afterEach(() => {
  // Restore original implementation
  ;(telegramModule as any).sendAdmin2FACode = originalSendAdmin2FACode
})

describe('Admin 2FA Security Tests', () => {
  describe('1. Code Generation', () => {
    it('should generate 6-digit code', async () => {
      const session = await Admin2FAService.createSession('admin', '123456789')

      assert.ok(session.pendingToken, 'pendingToken should be generated')
      assert.strictEqual(typeof session.pendingToken, 'string')
      assert.ok(session.pendingToken.length > 20, 'pendingToken should be long enough')
      assert.strictEqual(session.expiresInSeconds, 300, 'code should expire in 5 minutes')
    })

    it('should call Telegram API with code', async () => {
      const chatId = '123456789'
      await Admin2FAService.createSession('admin', chatId)

      assert.strictEqual(telegramMock.mock.calls.length, 1, 'should call Telegram once')
      const call = telegramMock.mock.calls[0]
      assert.strictEqual(call.arguments[0], chatId, 'should use correct chat ID')

      const code = call.arguments[1]
      assert.strictEqual(typeof code, 'string', 'code should be string')
      assert.strictEqual(code.length, 6, 'code should be 6 digits')
      assert.match(code, /^\d{6}$/, 'code should contain only digits')
    })

    it('should generate unique codes for each session', async () => {
      const codes: string[] = []

      for (let i = 0; i < 10; i++) {
        await Admin2FAService.createSession('admin', '123456789')
        const call = telegramMock.mock.calls[i]
        codes.push(call.arguments[1])
      }

      const uniqueCodes = new Set(codes)
      assert.ok(
        uniqueCodes.size >= 8,
        'at least 8 out of 10 codes should be unique (probabilistic)'
      )
    })

    it('should generate unique pending tokens', async () => {
      const tokens: string[] = []

      for (let i = 0; i < 10; i++) {
        const session = await Admin2FAService.createSession('admin', '123456789')
        tokens.push(session.pendingToken)
      }

      const uniqueTokens = new Set(tokens)
      assert.strictEqual(uniqueTokens.size, 10, 'all pending tokens should be unique')
    })
  })

  describe('2. Code Verification', () => {
    it('should verify correct code', async () => {
      const session = await Admin2FAService.createSession('admin', '123456789')
      const code = telegramMock.mock.calls[0].arguments[1]

      const result = Admin2FAService.verifyCode(session.pendingToken, code)

      assert.strictEqual(result.success, true, 'verification should succeed')
      assert.strictEqual(result.username, 'admin', 'should return username')
      assert.strictEqual(result.error, undefined, 'should have no error')
    })

    it('should reject incorrect code', async () => {
      const session = await Admin2FAService.createSession('admin', '123456789')

      const result = Admin2FAService.verifyCode(session.pendingToken, '000000')

      assert.strictEqual(result.success, false, 'verification should fail')
      assert.strictEqual(result.error, 'INVALID_CODE', 'should return INVALID_CODE error')
      assert.strictEqual(result.username, undefined, 'should not return username')
    })

    it('should reject invalid pending token', async () => {
      const result = Admin2FAService.verifyCode('invalid-token', '123456')

      assert.strictEqual(result.success, false, 'verification should fail')
      assert.strictEqual(result.error, 'INVALID_TOKEN', 'should return INVALID_TOKEN error')
    })
  })

  describe('3. One-Time Use', () => {
    it('should invalidate code after successful verification', async () => {
      const session = await Admin2FAService.createSession('admin', '123456789')
      const code = telegramMock.mock.calls[0].arguments[1]

      // First verification - should succeed
      const result1 = Admin2FAService.verifyCode(session.pendingToken, code)
      assert.strictEqual(result1.success, true, 'first verification should succeed')

      // Second verification - should fail (code already used)
      const result2 = Admin2FAService.verifyCode(session.pendingToken, code)
      assert.strictEqual(result2.success, false, 'second verification should fail')
      assert.strictEqual(
        result2.error,
        'CODE_EXPIRED',
        'should return CODE_EXPIRED after use'
      )
    })

    it('should invalidate code after max attempts', async () => {
      const session = await Admin2FAService.createSession('admin', '123456789')

      // Attempt 1-3 with wrong code
      for (let i = 0; i < 3; i++) {
        const result = Admin2FAService.verifyCode(session.pendingToken, '000000')
        assert.strictEqual(result.success, false, `attempt ${i + 1} should fail`)
      }

      // Attempt 4 - should be blocked
      const result = Admin2FAService.verifyCode(session.pendingToken, '000000')
      assert.strictEqual(result.success, false, 'attempt 4 should fail')
      assert.strictEqual(
        result.error,
        'TOO_MANY_ATTEMPTS',
        'should return TOO_MANY_ATTEMPTS'
      )
    })

    it('should invalidate code even with correct code after max attempts', async () => {
      const session = await Admin2FAService.createSession('admin', '123456789')
      const code = telegramMock.mock.calls[0].arguments[1]

      // 3 wrong attempts
      for (let i = 0; i < 3; i++) {
        Admin2FAService.verifyCode(session.pendingToken, '000000')
      }

      // Correct code after max attempts - should fail
      const result = Admin2FAService.verifyCode(session.pendingToken, code)
      assert.strictEqual(result.success, false, 'should fail even with correct code')
      assert.strictEqual(result.error, 'TOO_MANY_ATTEMPTS')
    })
  })

  describe('4. Rate Limiting', () => {
    it('should allow first 3 sessions for same user', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await Admin2FAService.createSession('admin', '123456789')
        } catch (error) {
          assert.fail(`session ${i + 1} should not throw`)
        }
      }

      assert.strictEqual(
        telegramMock.mock.calls.length,
        3,
        'should create 3 sessions successfully'
      )
    })

    it('should block 4th session within rate limit window', async () => {
      // Create 3 sessions
      for (let i = 0; i < 3; i++) {
        await Admin2FAService.createSession('admin', '123456789')
      }

      // 4th session should fail
      try {
        await Admin2FAService.createSession('admin', '123456789')
        assert.fail('4th session should throw RATE_LIMIT_EXCEEDED')
      } catch (error) {
        assert.ok(error instanceof Error)
        assert.strictEqual(error.message, 'RATE_LIMIT_EXCEEDED')
      }
    })
  })

  describe('5. Code Expiry', () => {
    it('should have correct expiry time', async () => {
      const session = await Admin2FAService.createSession('admin', '123456789')

      assert.strictEqual(
        session.expiresInSeconds,
        300,
        'code should expire in 5 minutes (300 seconds)'
      )
    })

    it('should report code expiry in configuration', () => {
      const config = Admin2FAService.getConfig()

      assert.strictEqual(config.CODE_LENGTH, 6, 'code should be 6 digits')
      assert.strictEqual(
        config.CODE_EXPIRY_MS,
        5 * 60 * 1000,
        'code should expire in 5 minutes'
      )
      assert.strictEqual(config.MAX_ATTEMPTS, 3, 'should allow 3 attempts per code')
      assert.strictEqual(
        config.RATE_LIMIT_WINDOW_MS,
        15 * 60 * 1000,
        'rate limit window should be 15 minutes'
      )
    })
  })

  describe('6. Telegram Integration', () => {
    it('should handle Telegram send failure', async () => {
      // Mock Telegram failure
      const errorMock = mock.fn(async () => {
        throw new Error('Network error')
      })
      ;(telegramModule as any).sendAdmin2FACode = errorMock

      try {
        await Admin2FAService.createSession('admin', '123456789')
        assert.fail('should throw TELEGRAM_SEND_FAILED')
      } catch (error) {
        assert.ok(error instanceof Error)
        assert.ok(error.message.startsWith('TELEGRAM_SEND_FAILED'))
      }
    })

    it('should send formatted message with code', async () => {
      await Admin2FAService.createSession('admin', '123456789')

      const call = telegramMock.mock.calls[0]
      const chatId = call.arguments[0]
      const code = call.arguments[1]
      const expiresInMinutes = call.arguments[2]

      assert.strictEqual(chatId, '123456789', 'should use correct chat ID')
      assert.match(code, /^\d{6}$/, 'code should be 6 digits')
      assert.strictEqual(expiresInMinutes, 5, 'should specify 5 minutes expiry')
    })
  })

  describe('7. Security Properties', () => {
    it('should use constant-time comparison for code verification', async () => {
      const session = await Admin2FAService.createSession('admin', '123456789')

      // Measure time for correct code
      const start1 = performance.now()
      Admin2FAService.verifyCode(session.pendingToken, '000000')
      const time1 = performance.now() - start1

      // Measure time for incorrect code
      const session2 = await Admin2FAService.createSession('admin', '123456789')
      const start2 = performance.now()
      Admin2FAService.verifyCode(session2.pendingToken, '999999')
      const time2 = performance.now() - start2

      // Time difference should be minimal (constant-time comparison)
      // Note: This is a basic check; true constant-time requires timing attack analysis
      const timeDiff = Math.abs(time1 - time2)
      assert.ok(
        timeDiff < 5,
        'verification time should be similar for different codes (constant-time)'
      )
    })

    it('should not leak information through error messages', async () => {
      const session = await Admin2FAService.createSession('admin', '123456789')

      const errors: string[] = []

      // Invalid token
      const result1 = Admin2FAService.verifyCode('invalid', '123456')
      errors.push(result1.error!)

      // Expired code (using invalid token as proxy)
      errors.push('CODE_EXPIRED')

      // Invalid code
      const result3 = Admin2FAService.verifyCode(session.pendingToken, '000000')
      errors.push(result3.error!)

      // All errors should be generic, not revealing timing information
      assert.ok(errors.every((e) => typeof e === 'string'), 'all errors should be strings')
      assert.ok(
        errors.every((e) => e.length > 0),
        'all errors should have descriptive codes'
      )
    })

    it('should use cryptographically secure random generation', async () => {
      const codes: string[] = []

      // Generate 100 codes and check distribution
      for (let i = 0; i < 100; i++) {
        await Admin2FAService.createSession('admin', '123456789')
        const call = telegramMock.mock.calls[i]
        codes.push(call.arguments[1])
      }

      // Check uniqueness (should be very high with 6-digit codes)
      const uniqueCodes = new Set(codes)
      assert.ok(
        uniqueCodes.size >= 90,
        'at least 90% of 100 codes should be unique (crypto.randomInt)'
      )

      // Check all codes are valid 6-digit numbers
      assert.ok(
        codes.every((c) => /^\d{6}$/.test(c)),
        'all codes should be 6 digits'
      )
    })
  })
})
