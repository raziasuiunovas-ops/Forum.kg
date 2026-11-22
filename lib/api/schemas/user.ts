/**
 * User API Validation Schemas
 * Based on docs/openapi.yaml User schemas
 */

import { z } from 'zod'
import { emailSchema, nameSchema, phoneSchema, localeSchema } from './common'

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
