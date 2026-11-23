/**
 * Admin 2FA Cleanup Cron Endpoint
 * GET /api/cron/cleanup-2fa
 * 
 * Cleans up expired 2FA codes from database
 * 
 * DEPLOYMENT:
 * 1. Set CRON_SECRET in .env (cryptographically random string)
 * 2. Configure external cron:
 *    - Vercel Cron: vercel.json with cron schedule
 *    - GitHub Actions: .github/workflows/cleanup-2fa.yml
 *    - Alternative: Any HTTP cron service (cron-job.org, etc.)
 * 
 * SECURITY:
 * - Protected by CRON_SECRET header or query param
 * - Safe for concurrent execution (database handles locking)
 * - No sensitive data in response
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  cleanupExpiredAdmin2FACodes,
  cleanupOldCodes,
  getCleanupStats,
} from '@/lib/services/admin-2fa-cleanup'

/**
 * Verify cron secret
 */
function verifyCronSecret(request: NextRequest): boolean {
  const CRON_SECRET = process.env.CRON_SECRET

  // If no secret configured, block all requests
  if (!CRON_SECRET) {
    console.error('⚠️  CRON_SECRET not configured - blocking cron endpoint')
    return false
  }

  // Check Authorization header (preferred)
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${CRON_SECRET}`) {
    return true
  }

  // Check x-cron-secret header (alternative)
  const cronHeader = request.headers.get('x-cron-secret')
  if (cronHeader === CRON_SECRET) {
    return true
  }

  // Check query param (fallback for simple cron services)
  const url = new URL(request.url)
  const secretParam = url.searchParams.get('secret')
  if (secretParam === CRON_SECRET) {
    return true
  }

  return false
}

/**
 * GET /api/cron/cleanup-2fa
 * Cleanup expired 2FA codes
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing cron secret',
        },
      },
      { status: 401 }
    )
  }

  try {
    const startTime = Date.now()

    // Get stats before cleanup
    const statsBefore = await getCleanupStats()

    // Run cleanup tasks
    const [expiredDeleted, oldDeleted] = await Promise.all([
      cleanupExpiredAdmin2FACodes(),
      cleanupOldCodes(24 * 60 * 60 * 1000), // Delete codes older than 24 hours
    ])

    // Get stats after cleanup
    const statsAfter = await getCleanupStats()

    const duration = Date.now() - startTime

    return NextResponse.json(
      {
        success: true,
        message: 'Cleanup completed successfully',
        data: {
          deleted: {
            expired: expiredDeleted,
            old: oldDeleted,
            total: expiredDeleted + oldDeleted,
          },
          stats: {
            before: statsBefore,
            after: statsAfter,
          },
          duration: `${duration}ms`,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Admin 2FA cleanup error:', error)

    return NextResponse.json(
      {
        error: {
          code: 'CLEANUP_FAILED',
          message: 'Failed to cleanup expired codes',
        },
      },
      { status: 500 }
    )
  }
}
