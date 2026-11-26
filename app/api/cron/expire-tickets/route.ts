/**
 * Ticket Expiration Cron Endpoint
 * GET /api/cron/expire-tickets
 * 
 * Automatically cancels tickets after forum ends
 * 
 * DEPLOYMENT:
 * 1. Set CRON_SECRET in .env (cryptographically random string)
 * 2. Configure external cron:
 *    - Vercel Cron: vercel.json with cron schedule (runs daily)
 *    - GitHub Actions: .github/workflows/expire-tickets.yml
 *    - Alternative: Any HTTP cron service (cron-job.org, etc.)
 * 
 * SECURITY:
 * - Protected by CRON_SECRET header or query param
 * - Safe for concurrent execution (database handles locking)
 * - No sensitive data in response
 * 
 * BUSINESS LOGIC:
 * - Cancels ACTIVE tickets whose expiresAt date has passed
 * - Only processes tickets that are still ACTIVE (not already USED or CANCELLED)
 * - Logs action to audit trail
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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
 * Cancel expired tickets
 */
async function cancelExpiredTickets(): Promise<number> {
  const now = new Date()

  // Find all ACTIVE tickets whose expiresAt has passed
  const expiredTickets = await prisma.ticket.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: {
        lt: now,
      },
    },
    select: {
      id: true,
      ticketNumber: true,
      forumId: true,
    },
  })

  if (expiredTickets.length === 0) {
    return 0
  }

  // Cancel all expired tickets
  const result = await prisma.ticket.updateMany({
    where: {
      id: {
        in: expiredTickets.map((t) => t.id),
      },
      status: 'ACTIVE', // Double-check status to avoid race conditions
    },
    data: {
      status: 'CANCELLED',
    },
  })

  // Log to audit trail
  if (result.count > 0) {
    await prisma.auditLog.create({
      data: {
        action: 'TICKETS_EXPIRED_AUTO',
        targetType: 'Ticket',
        targetId: null,
        metadata: {
          count: result.count,
          ticketIds: expiredTickets.map((t) => t.id),
        },
        actorId: null, // System action, no user actor
      },
    })
  }

  return result.count
}

/**
 * Get statistics about expired and active tickets
 */
async function getTicketStats() {
  const now = new Date()

  const [activeCount, expiredActiveCount, cancelledCount] = await Promise.all([
    prisma.ticket.count({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          gte: now,
        },
      },
    }),
    prisma.ticket.count({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          lt: now,
        },
      },
    }),
    prisma.ticket.count({
      where: {
        status: 'CANCELLED',
      },
    }),
  ])

  return {
    active: activeCount,
    expiredActive: expiredActiveCount,
    cancelled: cancelledCount,
  }
}

/**
 * GET /api/cron/expire-tickets
 * Cancel expired tickets automatically
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
    const statsBefore = await getTicketStats()

    // Cancel expired tickets
    const cancelledCount = await cancelExpiredTickets()

    // Get stats after cleanup
    const statsAfter = await getTicketStats()

    const duration = Date.now() - startTime

    return NextResponse.json(
      {
        success: true,
        message: cancelledCount > 0 
          ? `${cancelledCount} билет(ов) автоматически аннулировано` 
          : 'Нет истекших билетов для аннулирования',
        data: {
          cancelled: cancelledCount,
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
    console.error('Ticket expiration error:', error)

    return NextResponse.json(
      {
        error: {
          code: 'EXPIRATION_FAILED',
          message: 'Failed to cancel expired tickets',
        },
      },
      { status: 500 }
    )
  }
}
