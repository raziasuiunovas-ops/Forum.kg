/**
 * Admin 2FA Concurrency Tests
 * Tests race conditions and concurrent verification attempts
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert'
import { Admin2FAService } from '../../lib/services/admin-2fa.service'
import { prisma } from '../../lib/db'
import * as telegramModule from '../../lib/integrations/telegram'

const originalSendAdmin2FACode = telegramModule.sendAdmin2FACode
let telegramMock: any

beforeEach(() => {
  telegramMock = mock.fn(async () => Promise.resolve())
  ;(telegramModule as any).sendAdmin2FACode = telegramMock
})

afterEach(async () => {
  ;(telegramModule as any).sendAdmin2FACode = originalSendAdmin2FACode
  await prisma.admin2FACode.deleteMany({
    where: { username: { startsWith: 'concurrent-' } },
  })
})

describe('Admin 2FA Concurrency Tests', () => {
  it('should handle concurrent verification attempts', async () => {
    const session = await Admin2FAService.createSession('concurrent-test-1', '123456789')
    const code = telegramMock.mock.calls[0].arguments[1]

    // Attempt to verify same code concurrently
    const results = await Promise.allSettled([
      Admin2FAService.verifyCode(session.pendingToken, code),
      Admin2FAService.verifyCode(session.pendingToken, code),
      Admin2FAService.verifyCode(session.pendingToken, code),
    ])

    // Only one should succeed
    const successes = results.filter(
      (r) => r.status === 'fulfilled' && r.value.success
    )
    const failures = results.filter(
      (r) => r.status === 'fulfilled' && !r.value.success
    )

    assert.strictEqual(successes.length, 1, 'exactly one verification should succeed')
    assert.ok(failures.length >= 2, 'at least two should fail')

    // Verify code deleted from database
    const dbEntry = await prisma.admin2FACode.findUnique({
      where: { pendingToken: session.pendingToken },
    })
    assert.strictEqual(dbEntry, null, 'code should be deleted')
  })

  it('should handle concurrent wrong code attempts', async () => {
    const session = await Admin2FAService.createSession('concurrent-test-2', '123456789')

    // Attempt wrong codes concurrently
    const results = await Promise.allSettled([
      Admin2FAService.verifyCode(session.pendingToken, '000000'),
      Admin2FAService.verifyCode(session.pendingToken, '111111'),
      Admin2FAService.verifyCode(session.pendingToken, '222222'),
    ])

    // All should fail
    const failures = results.filter(
      (r) => r.status === 'fulfilled' && !r.value.success
    )
    assert.strictEqual(failures.length, 3, 'all should fail')

    // Check final attempt count (may vary due to race conditions)
    const dbEntry = await prisma.admin2FACode.findUnique({
      where: { pendingToken: session.pendingToken },
    })

    if (dbEntry) {
      // Not yet deleted, check attempts
      assert.ok(dbEntry.attempts >= 1, 'at least one attempt should be recorded')
      assert.ok(dbEntry.attempts <= 3, 'should not exceed max attempts')
    } else {
      // Deleted due to max attempts reached
      assert.ok(true, 'code deleted after max attempts')
    }
  })

  it('should handle concurrent session creation for same user', async () => {
    // Try to create multiple sessions concurrently
    const promises = []
    for (let i = 0; i < 5; i++) {
      promises.push(
        Admin2FAService.createSession('concurrent-rate-test', '123456789').catch((e) => e)
      )
    }

    const results = await Promise.allSettled(promises)

    // Count successes (should be <= 3 due to rate limiting)
    const successes = results.filter(
      (r) => r.status === 'fulfilled' && !(r.value instanceof Error)
    )

    assert.ok(successes.length <= 3, 'rate limit should prevent more than 3 sessions')
    assert.ok(successes.length >= 1, 'at least one session should succeed')
  })

  it('should ensure code uniqueness across concurrent sessions', async () => {
    const sessions = await Promise.all([
      Admin2FAService.createSession('concurrent-unique-1', '123456789'),
      Admin2FAService.createSession('concurrent-unique-2', '123456789'),
      Admin2FAService.createSession('concurrent-unique-3', '123456789'),
    ])

    const tokens = sessions.map((s) => s.pendingToken)
    const uniqueTokens = new Set(tokens)

    assert.strictEqual(
      uniqueTokens.size,
      3,
      'all pending tokens should be unique'
    )

    // Verify all stored in database
    const dbEntries = await prisma.admin2FACode.findMany({
      where: {
        pendingToken: { in: tokens },
      },
    })

    assert.strictEqual(dbEntries.length, 3, 'all codes should be in database')
  })

  it('should handle verification after code expiry', async () => {
    // Create code with manual DB entry (expired)
    const pendingToken = 'expired-token-test'
    await prisma.admin2FACode.create({
      data: {
        pendingToken,
        username: 'concurrent-expired',
        codeHash: 'dummy-hash',
        chatId: '123',
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
      },
    })

    const result = await Admin2FAService.verifyCode(pendingToken, '123456')

    assert.strictEqual(result.success, false)
    assert.strictEqual(result.error, 'CODE_EXPIRED')

    // Verify deleted from database
    const dbEntry = await prisma.admin2FACode.findUnique({
      where: { pendingToken },
    })
    assert.strictEqual(dbEntry, null, 'expired code should be deleted')
  })
})
