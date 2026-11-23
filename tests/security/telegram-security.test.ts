/**
 * Telegram Security Tests
 * Tests for Telegram integration security
 */

import { describe, it, mock } from 'node:test'
import assert from 'node:assert'
import { sendAdmin2FACode, TelegramError } from '../../lib/integrations/telegram'

describe('Telegram Security Tests', () => {
  it('should not leak bot token in errors', async () => {
    // Mock fetch to simulate network error
    const originalFetch = global.fetch
    global.fetch = mock.fn(async () => {
      throw new Error('Network error with URL: https://api.telegram.org/bot123:ABC/sendMessage')
    }) as any

    try {
      await sendAdmin2FACode('123', '123456')
      assert.fail('should throw')
    } catch (error) {
      assert.ok(error instanceof TelegramError)
      // Error message should NOT contain token
      assert.ok(
        !error.message.includes('123:ABC'),
        'error should not contain bot token'
      )
      assert.ok(
        !error.message.includes('api.telegram.org'),
        'error should not contain URL'
      )
    } finally {
      global.fetch = originalFetch
    }
  })

  it('should not leak code in errors', async () => {
    const originalFetch = global.fetch
    global.fetch = mock.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: false,
          error_code: 400,
          description: 'Bad Request: chat not found',
        }),
        { status: 400 }
      )
    }) as any

    try {
      await sendAdmin2FACode('123', '654321')
      assert.fail('should throw')
    } catch (error) {
      assert.ok(error instanceof TelegramError)
      // Error should not contain the code
      assert.ok(
        !error.message.includes('654321'),
        'error should not contain 2FA code'
      )
    } finally {
      global.fetch = originalFetch
    }
  })

  it('should sanitize HTML in codes', async () => {
    // Set token temporarily for this test
    const originalToken = process.env.TELEGRAM_BOT_TOKEN
    process.env.TELEGRAM_BOT_TOKEN = 'test-token-123'
    
    const originalFetch = global.fetch
    let capturedPayload: any = null

    global.fetch = mock.fn(async (_url: string, options: any) => {
      capturedPayload = JSON.parse(options.body)
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
    }) as any

    try {
      await sendAdmin2FACode('123', '<script>alert("xss")</script>')

      assert.ok(capturedPayload)
      assert.ok(
        !capturedPayload.text.includes('<script>'),
        'HTML tags should be escaped'
      )
      assert.ok(
        capturedPayload.text.includes('&lt;script&gt;'),
        'HTML should be entity-encoded'
      )
    } finally {
      global.fetch = originalFetch
      process.env.TELEGRAM_BOT_TOKEN = originalToken
    }
  })

  it('should handle timeout gracefully', async () => {
    // Set token temporarily for this test
    const originalToken = process.env.TELEGRAM_BOT_TOKEN
    process.env.TELEGRAM_BOT_TOKEN = 'test-token-123'
    
    const originalFetch = global.fetch
    global.fetch = mock.fn(async () => {
      // Simulate timeout
      await new Promise((resolve) => setTimeout(resolve, 11000))
      return new Response(JSON.stringify({ ok: true }))
    }) as any

    try {
      await sendAdmin2FACode('123', '123456')
      assert.fail('should timeout')
    } catch (error) {
      assert.ok(error instanceof TelegramError)
      // Should be timeout-related error
      assert.ok(
        error.message.includes('timeout') || 
        error.message.includes('TimeoutError') || 
        error.message.includes('AbortError') ||
        error.message.includes('aborted'),
        'should indicate timeout or abort'
      )
    } finally {
      global.fetch = originalFetch
      process.env.TELEGRAM_BOT_TOKEN = originalToken
    }
  })

  it('should not log sensitive data in console', async () => {
    const originalFetch = global.fetch
    const originalConsoleError = console.error
    let consoleOutput = ''

    console.error = mock.fn((...args: any[]) => {
      consoleOutput += args.join(' ')
    }) as any

    global.fetch = mock.fn(async () => {
      throw new Error('Network error')
    }) as any

    try {
      await sendAdmin2FACode('123456789', '999888')
    } catch {
      // Expected to throw
    }

    // Check console output doesn't contain sensitive data
    assert.ok(
      !consoleOutput.includes('999888'),
      'console should not log 2FA code'
    )
    assert.ok(
      !consoleOutput.includes('123456789'),
      'console should not log chat ID'
    )

    console.error = originalConsoleError
    global.fetch = originalFetch
  })
})
