/**
 * Post/Topic API Validation Schemas
 * Based on docs/openapi.yaml Topic schemas
 */

import { z } from 'zod'
import { uuidSchema, slugSchema, translationSchema, paginationQuerySchema } from './common'

/**
 * Create topic/post schema
 * POST /api/v1/topics
 */
export const createTopicSchema = z.object({
  categoryId: uuidSchema,
  title: translationSchema,
  content: translationSchema,
  tags: z.array(z.string().min(2).max(50)).max(10).optional(),
  isPinned: z.boolean().optional().default(false),
  isLocked: z.boolean().optional().default(false),
}).strict()

export type CreateTopicInput = z.infer<typeof createTopicSchema>

/**
 * Update topic schema
 * PATCH /api/v1/topics/:id
 */
export const updateTopicSchema = z.object({
  title: translationSchema.optional(),
  content: translationSchema.optional(),
  tags: z.array(z.string().min(2).max(50)).max(10).optional(),
  isPinned: z.boolean().optional(),
  isLocked: z.boolean().optional(),
}).strict()

export type UpdateTopicInput = z.infer<typeof updateTopicSchema>

/**
 * Topic query filters
 * GET /api/v1/topics
 */
export const topicFiltersSchema = paginationQuerySchema.extend({
  categoryId: uuidSchema.optional(),
  authorId: uuidSchema.optional(),
  tag: z.string().max(50).optional(),
  isPinned: z.coerce.boolean().optional(),
  isLocked: z.coerce.boolean().optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'viewCount', 'replyCount']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
}).strict()

export type TopicFilters = z.infer<typeof topicFiltersSchema>

/**
 * Comment/Reply schema
 * POST /api/v1/topics/:topicId/replies
 */
export const createReplySchema = z.object({
  content: translationSchema,
  parentId: uuidSchema.optional(), // For nested replies
}).strict()

export type CreateReplyInput = z.infer<typeof createReplySchema>

/**
 * Update reply schema
 * PATCH /api/v1/replies/:id
 */
export const updateReplySchema = z.object({
  content: translationSchema,
}).strict()

export type UpdateReplyInput = z.infer<typeof updateReplySchema>
