/**
 * Password Reset Token Utilities
 * Cryptographically secure token generation and validation
 */

import { randomBytes, createHash } from 'node:crypto'
import { prisma } from '@/lib/db'

const TOKEN_LENGTH = 32 // 32 bytes = 256 bits of entropy
const TOKEN_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Generate a cryptographically secure random token
 * @returns URL-safe base64 token string
 */
export function generateResetToken(): string {
  return randomBytes(TOKEN_LENGTH).toString('base64url')
}

/**
 * Hash a token using SHA-256 for database storage
 * @param token - Plain token string
 * @returns Hashed token
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Create a password reset token for a user
 * @param userId - User ID
 * @returns Plain token (to be sent via email)
 */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = generateResetToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS)

  // Invalidate all existing unused tokens for this user (security: prevent token accumulation)
  await prisma.passwordResetToken.updateMany({
    where: {
      userId,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: {
      usedAt: new Date(), // Mark as used to invalidate
    },
  })

  // Create new token
  const { randomUUID } = await import('node:crypto')
  await prisma.passwordResetToken.create({
    data: {
      id: randomUUID(),
      userId,
      tokenHash,
      expiresAt,
    },
  })

  return token
}

/**
 * Validate a password reset token
 * @param token - Plain token string
 * @returns userId if valid, null if invalid/expired/used
 */
export async function validatePasswordResetToken(token: string): Promise<string | null> {
  const tokenHash = hashToken(token)

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      userId: true,
      expiresAt: true,
      usedAt: true,
    },
  })

  if (!record) return null
  if (record.usedAt) return null // Already used
  if (record.expiresAt < new Date()) return null // Expired

  return record.userId
}

/**
 * Consume a password reset token (mark as used atomically)
 * @param token - Plain token string
 * @returns userId if successfully consumed, null if invalid/already used/expired
 */
export async function consumePasswordResetToken(token: string): Promise<string | null> {
  const tokenHash = hashToken(token)

  try {
    // Atomic operation: update only if not used and not expired
    const record = await prisma.passwordResetToken.updateMany({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        usedAt: new Date(),
      },
    })

    // If no records were updated, token is invalid/used/expired
    if (record.count === 0) return null

    // Fetch the userId
    const tokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    })

    return tokenRecord?.userId ?? null
  } catch (error) {
    // Race condition or database error
    return null
  }
}

/**
 * Clean up expired password reset tokens
 * Should be called periodically (e.g., via cron job)
 */
export async function cleanupExpiredResetTokens(): Promise<number> {
  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  })
  return result.count
}
