/**
 * Post/Topic API Validation Schemas
 * Based on docs/openapi.yaml Topic schemas
 */

import { z } from 'zod'
import { uuidSchema, slugSchema, translationSchema, paginationQuerySchema } from './common'

const strictTranslationSchema = translationSchema.strict()
const booleanQuerySchema = z.enum(['true', 'false']).transform((value) => value === 'true')

/** Topic categories are provisioned by managers and selected by topic authors. */
export const createTopicCategorySchema = z.object({
  slug: slugSchema,
  name: strictTranslationSchema,
  description: strictTranslationSchema.optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional().default(0),
}).strict()

export type CreateTopicCategoryInput = z.infer<typeof createTopicCategorySchema>

/**
 * Create topic/post schema
 * POST /api/v1/topics
 */
export const createTopicSchema = z.object({
  categoryId: uuidSchema,
  title: strictTranslationSchema,
  content: strictTranslationSchema,
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
  title: strictTranslationSchema.optional(),
  content: strictTranslationSchema.optional(),
  tags: z.array(z.string().min(2).max(50)).max(10).optional(),
  isPinned: z.boolean().optional(),
  isLocked: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'Необходимо передать хотя бы одно поле для изменения',
})

export type UpdateTopicInput = z.infer<typeof updateTopicSchema>

/**
 * Topic query filters
 * GET /api/v1/topics
 */
export const topicFiltersSchema = paginationQuerySchema.extend({
  categoryId: uuidSchema.optional(),
  authorId: uuidSchema.optional(),
  tag: z.string().max(50).optional(),
  isPinned: booleanQuerySchema.optional(),
  isLocked: booleanQuerySchema.optional(),
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
  content: strictTranslationSchema,
  parentId: uuidSchema.optional(), // For nested replies
}).strict()

export type CreateReplyInput = z.infer<typeof createReplySchema>

/**
 * Update reply schema
 * PATCH /api/v1/replies/:id
 */
export const updateReplySchema = z.object({
  content: strictTranslationSchema,
}).strict()

export type UpdateReplyInput = z.infer<typeof updateReplySchema>
