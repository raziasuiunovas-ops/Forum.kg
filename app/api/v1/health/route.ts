/**
 * GET /api/v1/health
 * Health Check API for FORUM.KG
 * 
 * Provides two health check modes:
 * 1. Liveness - application is running and processing requests (no DB required)
 * 2. Readiness - application + database connectivity check
 * 
 * Query parameters:
 * - ?check=live   - Liveness probe (always returns 200 if app is running)
 * - ?check=ready  - Readiness probe (checks DB connection, returns 503 if DB unavailable)
 * - (no param)    - Full check (default, same as readiness)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { withErrorHandler, validateQuery } from '@/lib/api'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

/**
 * Health check query schema
 */
const healthCheckQuerySchema = z.object({
  check: z.enum(['live', 'ready']).optional().default('ready'),
}).strict()

/**
 * Health check types
 */
type HealthCheckType = 'live' | 'ready'

/**
 * Health status
 */
type HealthStatus = 'ok' | 'unavailable'

/**
 * Component status
 */
interface ComponentStatus {
  status: 'ok' | 'unavailable'
  message?: string
}

/**
 * Health check response
 */
interface HealthCheckResponse {
  status: HealthStatus
  timestamp: string
  checks: {
    application: ComponentStatus
    database?: ComponentStatus
  }
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const { check: checkType } = validateQuery(searchParams, healthCheckQuerySchema)

  const timestamp = new Date().toISOString()

  // Liveness check: application is running
  if (checkType === 'live') {
    const response: HealthCheckResponse = {
      status: 'ok',
      timestamp,
      checks: {
        application: {
          status: 'ok',
          message: 'Application is running',
        },
      },
    }

    return NextResponse.json(response, { status: 200 })
  }

  // Readiness check: application + database
  const dbStatus = await checkDatabase(request)

  const allHealthy = dbStatus.status === 'ok'

  const response: HealthCheckResponse = {
    status: allHealthy ? 'ok' : 'unavailable',
    timestamp,
    checks: {
      application: {
        status: 'ok',
        message: 'Application is running',
      },
      database: dbStatus,
    },
  }

  // Return 503 if database is unavailable
  const statusCode = allHealthy ? 200 : 503

  return NextResponse.json(response, { status: statusCode })
})

/**
 * Check database connectivity
 * Uses safe read-only query that doesn't modify data
 */
async function checkDatabase(request: NextRequest): Promise<ComponentStatus> {
  try {
    // Execute safe read-only query: SELECT 1
    // This is the standard health check query that:
    // - Does not modify any data
    // - Does not read sensitive information
    // - Verifies connection and query execution
    await prisma.$queryRaw`SELECT 1`

    return {
      status: 'ok',
      message: 'Database is accessible',
    }
  } catch {
    writeSecurityAuditEvent({
      eventType: 'API_ERROR', result: 'error', request,
      reason: 'health_database_unavailable', statusCode: 503,
    })

    // Return generic error message without exposing:
    // - Connection strings
    // - Database host/port
    // - Internal error details
    // - Stack traces
    return {
      status: 'unavailable',
      message: 'Database is not accessible',
    }
  }
}
