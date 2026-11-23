/**
 * Admin 2FA Cleanup Service
 * Serverless-safe cleanup of expired 2FA codes
 * 
 * DEPLOYMENT OPTIONS:
 * 
 * 1. API Route (recommended for serverless):
 *    - Create /api/cron/cleanup-2fa endpoint
 *    - Configure external cron (Vercel Cron, GitHub Actions, etc.)
 *    - Protect with CRON_SECRET env var
 * 
 * 2. Database Trigger (alternative):
 *    - Use PostgreSQL trigger on INSERT
 *    - Automatically cleanup on each new code creation
 * 
 * 3. Background Worker (traditional):
 *    - Separate Node.js process with setInterval
 *    - Only for non-serverless deployments
 */

import { prisma } from '@/lib/db'

/**
 * Cleanup expired 2FA codes
 * Safe for concurrent execution (uses database transaction)
 * 
 * @returns Number of codes deleted
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
 * Cleanup old codes for specific user (rate limiting cleanup)
 * Keeps only most recent N codes per user
 * 
 * @param username Username to cleanup
 * @param keepCount Number of recent codes to keep (default: 3)
 * @returns Number of codes deleted
 */
export async function cleanupOldCodesForUser(
  username: string,
  keepCount: number = 3
): Promise<number> {
  // Get IDs of codes to delete (all except most recent N)
  const codesToDelete = await prisma.admin2FACode.findMany({
    where: { username },
    orderBy: { createdAt: 'desc' },
    skip: keepCount,
    select: { id: true },
  })

  if (codesToDelete.length === 0) {
    return 0
  }

  const result = await prisma.admin2FACode.deleteMany({
    where: {
      id: { in: codesToDelete.map((c) => c.id) },
    },
  })

  return result.count
}

/**
 * Cleanup codes older than specified age
 * Useful for compliance (data retention policies)
 * 
 * @param maxAgeMs Maximum age in milliseconds (default: 24 hours)
 * @returns Number of codes deleted
 */
export async function cleanupOldCodes(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  const cutoffDate = new Date(Date.now() - maxAgeMs)

  const result = await prisma.admin2FACode.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  })

  return result.count
}

/**
 * Get cleanup statistics
 * Useful for monitoring
 */
export async function getCleanupStats(): Promise<{
  total: number
  expired: number
  active: number
  oldestExpiry: Date | null
}> {
  const now = new Date()

  const [total, expired, oldestExpired] = await Promise.all([
    prisma.admin2FACode.count(),
    prisma.admin2FACode.count({
      where: { expiresAt: { lt: now } },
    }),
    prisma.admin2FACode.findFirst({
      where: { expiresAt: { lt: now } },
      orderBy: { expiresAt: 'asc' },
      select: { expiresAt: true },
    }),
  ])

  return {
    total,
    expired,
    active: total - expired,
    oldestExpiry: oldestExpired?.expiresAt || null,
  }
}
