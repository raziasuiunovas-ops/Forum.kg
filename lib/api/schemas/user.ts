/**
 * User API Validation Schemas
 * Based on docs/openapi.yaml User schemas
 */

import { z } from 'zod'
import { emailSchema, nameSchema, phoneSchema, localeSchema, paginationQuerySchema } from './common'
import { UserRole, UserStatus } from '@prisma/client'

/**
 * Fields a signed-in user may change on their own profile.
 * Identity, contact verification, role, status, and other internal fields are
 * intentionally absent and `.strict()` rejects attempts to include them.
 */
export const updateOwnUserProfileSchema = z
  .object({
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    preferredLocale: localeSchema.optional(),
    announcementsPushEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Необходимо передать хотя бы одно поле профиля',
  })

export type UpdateOwnUserProfileInput = z.infer<typeof updateOwnUserProfileSchema>

/**
 * User profile update schema
 * PATCH /api/v1/users/:id
 */
export const updateUserSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  email: emailSchema,
  preferredLocale: localeSchema.optional(),
}).strict() // Reject unknown fields

export type UpdateUserInput = z.infer<typeof updateUserSchema>

/**
 * User query filters
 * GET /api/v1/users
 */
export const userFiltersSchema = z.object({
  role: z.enum(['USER', 'MODERATOR', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  search: z.string().max(100).optional(), // Search by name or phone
}).strict()

export type UserFilters = z.infer<typeof userFiltersSchema>

/**
 * Admin user query schema
 * GET /api/v1/admin/users
 */
export const adminUserQuerySchema = paginationQuerySchema.extend({
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  search: z.string().min(1).max(100).optional(), // Search by name, phone, email
  sortBy: z.enum(['createdAt', 'updatedAt', 'firstName', 'lastName', 'role']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>

/**
 * Admin user update schema
 * PATCH /api/v1/admin/users/[id]
 * 
 * Security notes:
 * - Role changes validated in endpoint (cannot change own role, SUPER_ADMIN promotion requires SUPER_ADMIN)
 * - Status changes logged to audit trail
 * - Email changes require re-verification (handled in endpoint)
 */
export const adminUserUpdateSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  email: emailSchema,
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  preferredLocale: localeSchema.optional(),
  announcementsPushEnabled: z.boolean().optional(),
}).strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Необходимо передать хотя бы одно поле для обновления',
  })

export type AdminUserUpdate = z.infer<typeof adminUserUpdateSchema>

/**
 * Helper: Parse admin user query from URL searchParams
 */
export function parseAdminUserQuery(searchParams: URLSearchParams): AdminUserQuery {
  return adminUserQuerySchema.parse({
    page: searchParams.get('page') || 1,
    limit: searchParams.get('limit') || 20,
    role: searchParams.get('role') || undefined,
    status: searchParams.get('status') || undefined,
    search: searchParams.get('search') || undefined,
    sortBy: searchParams.get('sortBy') || 'createdAt',
    sortOrder: searchParams.get('sortOrder') || 'desc',
  })
}
