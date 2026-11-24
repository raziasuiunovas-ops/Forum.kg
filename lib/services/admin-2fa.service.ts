/**
 * Admin 2FA Service
 * Handles two-factor authentication for admin login via Telegram
 * 
 * Security features:
 * - 6-digit cryptographically secure codes
 * - 5-minute expiry
 * - One-time use (codes deleted after verification)
 * - Rate limiting (3 attempts per 15 minutes)
 * - Persistent database storage (multi-instance safe)
 * - SHA-256 hashed codes (never store plaintext)
 * - Constant-time comparison
 */

import { randomInt, createHash, randomBytes, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/db'
import { sendAdmin2FACode } from '@/lib/integrations/telegram'

/**
 * 2FA Configuration
 */
const ADMIN_2FA_CONFIG = {
  CODE_LENGTH: 6,
  CODE_EXPIRY_MS: 5 * 60 * 1000, // 5 minutes
  MAX_ATTEMPTS: 3,
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_ATTEMPTS: 3,
} as const

/**
 * Generate cryptographically secure 6-digit code
 */
function generate6DigitCode(): string {
  // Generate random integer between 0 and 999999
  // randomInt is cryptographically secure (uses crypto.randomBytes internally)
  const code = randomInt(0, 1000000)
  
  // Pad with leading zeros to ensure 6 digits
  return code.toString().padStart(ADMIN_2FA_CONFIG.CODE_LENGTH, '0')
}

/**
 * Generate cryptographically secure pending token
 */
function generatePendingToken(): string {
  // Generate 32 bytes (256 bits) of random data
  return randomBytes(32).toString('base64url')
}

/**
 * Hash code with SHA-256
 * Never store plaintext codes in database
 */
function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/**
 * Constant-time string comparison
 * Prevents timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  // Convert strings to buffers for timingSafeEqual
  const bufferA = Buffer.from(a, 'utf8')
  const bufferB = Buffer.from(b, 'utf8')

  try {
    return timingSafeEqual(bufferA, bufferB)
  } catch {
    // timingSafeEqual throws if lengths differ (shouldn't happen due to check above)
    return false
  }
}

/**
 * Check rate limit for username
 */
async function checkRateLimit(username: string): Promise<boolean> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - ADMIN_2FA_CONFIG.RATE_LIMIT_WINDOW_MS)

  // Count recent login attempts
  const recentAttempts = await prisma.admin2FACode.count({
    where: {
      username,
      createdAt: {
        gte: windowStart,
      },
    },
  })

  return recentAttempts < ADMIN_2FA_CONFIG.RATE_LIMIT_MAX_ATTEMPTS
}

/**
 * Cleanup expired 2FA codes
 * Should be called periodically (e.g., via cron job)
 */
export async function cleanupExpiredAdmin2FACodes(): Promise<number> {
  const result = await prisma.admin2FACode.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  })

  return result.count
}

/**
 * Admin 2FA Service
 */
export const Admin2FAService = {
  /**
   * Create 2FA session and send code via Telegram
   * Returns pending token for verification step
   */
  async createSession(username: string, chatId: string): Promise<{
    pendingToken: string
    expiresInSeconds: number
  }> {
    // Check rate limit
    const rateLimitAllowed = await checkRateLimit(username)
    if (!rateLimitAllowed) {
      throw new Error('RATE_LIMIT_EXCEEDED')
    }

    // Generate 6-digit code
    const code = generate6DigitCode()
    const codeHash = hashCode(code)

    // Generate pending token
    const pendingToken = generatePendingToken()

    const now = new Date()
    const expiresAt = new Date(now.getTime() + ADMIN_2FA_CONFIG.CODE_EXPIRY_MS)

    // Send code via Telegram BEFORE storing in database
    // If sending fails, we don't create orphaned DB records
    try {
      await sendAdmin2FACode(chatId, code, 5)
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`TELEGRAM_SEND_FAILED: ${error.message}`)
      }
      throw new Error('TELEGRAM_SEND_FAILED')
    }

    // Store 2FA code in database
    try {
      const { randomUUID } = await import('node:crypto')
      await prisma.admin2FACode.create({
        data: {
          id: randomUUID(),
          pendingToken,
          username,
          codeHash,
          chatId,
          attempts: 0,
          expiresAt,
        },
      })
    } catch (error) {
      // Handle unique constraint violation (duplicate pendingToken)
      // This should be extremely rare with 256-bit random tokens
      if (error instanceof Error && error.message.includes('unique constraint')) {
        throw new Error('TOKEN_GENERATION_CONFLICT')
      }
      throw error
    }

    return {
      pendingToken,
      expiresInSeconds: Math.floor(ADMIN_2FA_CONFIG.CODE_EXPIRY_MS / 1000),
    }
  },

  /**
   * Verify 2FA code
   * Returns username if verification successful
   */
  async verifyCode(pendingToken: string, code: string): Promise<{
    success: boolean
    username?: string
    error?: 'INVALID_TOKEN' | 'CODE_EXPIRED' | 'INVALID_CODE' | 'TOO_MANY_ATTEMPTS'
  }> {
    // Get 2FA code entry from database
    const codeEntry = await prisma.admin2FACode.findUnique({
      where: { pendingToken },
    })

    if (!codeEntry) {
      return { success: false, error: 'INVALID_TOKEN' }
    }

    // Check expiry
    if (new Date() > codeEntry.expiresAt) {
      // Delete expired code
      await prisma.admin2FACode.delete({
        where: { id: codeEntry.id },
      })
      return { success: false, error: 'CODE_EXPIRED' }
    }

    // Check attempt limit
    if (codeEntry.attempts >= ADMIN_2FA_CONFIG.MAX_ATTEMPTS) {
      // Delete code after too many attempts
      await prisma.admin2FACode.delete({
        where: { id: codeEntry.id },
      })
      return { success: false, error: 'TOO_MANY_ATTEMPTS' }
    }

    // Increment attempts
    await prisma.admin2FACode.update({
      where: { id: codeEntry.id },
      data: {
        attempts: codeEntry.attempts + 1,
      },
    })

    // Verify code using constant-time comparison
    const codeHash = hashCode(code)
    const isValid = constantTimeCompare(codeHash, codeEntry.codeHash)

    if (!isValid) {
      return { success: false, error: 'INVALID_CODE' }
    }

    // Success - delete code (one-time use)
    await prisma.admin2FACode.delete({
      where: { id: codeEntry.id },
    })

    return {
      success: true,
      username: codeEntry.username,
    }
  },

  /**
   * Get configuration (for testing/debugging)
   */
  getConfig() {
    return ADMIN_2FA_CONFIG
  },
}
