/**
 * Dashboard Zod Validation Schemas
 * Admin dashboard statistics and activity queries
 */

import { z } from 'zod'

/**
 * Dashboard stats query parameters
 * ?startDate=2026-01-01T00:00:00.000Z&endDate=2026-12-31T23:59:59.999Z
 * Optional date range filtering for time-based stats
 */
export const dashboardStatsQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate
    }
    return true
  },
  {
    message: 'startDate должна быть раньше или равна endDate',
    path: ['startDate'],
  }
)

export type DashboardStatsQuery = z.infer<typeof dashboardStatsQuerySchema>

/**
 * Recent activity query parameters
 * ?limit=20
 */
export const recentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export type RecentActivityQuery = z.infer<typeof recentActivityQuerySchema>

/**
 * Dashboard stats response type
 */
export const dashboardStatsSchema = z.object({
  users: z.object({
    total: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    newInPeriod: z.number().int().nonnegative(),
  }),
  forums: z.object({
    total: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
  }),
  events: z.object({
    total: z.number().int().nonnegative(),
    upcoming: z.number().int().nonnegative(),
    totalRegistrations: z.number().int().nonnegative(),
  }),
  orders: z.object({
    total: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
    revenueMinor: z.number().int().nonnegative(),
  }),
  payments: z.object({
    totalAmountMinor: z.number().int().nonnegative(),
    successful: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
  }),
  topics: z.object({
    total: z.number().int().nonnegative(),
    newInPeriod: z.number().int().nonnegative(),
  }),
  system: z.object({
    dbStatus: z.enum(['healthy', 'degraded', 'down']),
    lastSync: z.string().datetime(),
  }),
})

export type DashboardStats = z.infer<typeof dashboardStatsSchema>

/**
 * Recent activity item types
 */
export const activityTypeSchema = z.enum([
  'USER_REGISTERED',
  'ORDER_CREATED',
  'ORDER_COMPLETED',
  'TOPIC_CREATED',
  'EVENT_REGISTRATION',
  'PAYMENT_COMPLETED',
  'FORUM_CREATED',
])

export type ActivityType = z.infer<typeof activityTypeSchema>

/**
 * Recent activity item
 */
export const activityItemSchema = z.object({
  id: z.string().uuid(),
  type: activityTypeSchema,
  description: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
})

export type ActivityItem = z.infer<typeof activityItemSchema>

/**
 * Recent activity response
 */
export const recentActivitySchema = z.object({
  activities: z.array(activityItemSchema),
  total: z.number().int().nonnegative(),
})

export type RecentActivity = z.infer<typeof recentActivitySchema>

/**
 * Helper: Parse dashboard stats query params from URL searchParams
 */
export function parseDashboardStatsQuery(searchParams: URLSearchParams): DashboardStatsQuery {
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  return dashboardStatsQuerySchema.parse({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  })
}

/**
 * Helper: Parse recent activity query params from URL searchParams
 */
export function parseRecentActivityQuery(searchParams: URLSearchParams): RecentActivityQuery {
  return recentActivityQuerySchema.parse({
    limit: searchParams.get('limit') || 20,
  })
}
