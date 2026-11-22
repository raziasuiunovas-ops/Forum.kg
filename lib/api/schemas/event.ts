/**
 * Event API Validation Schemas
 * Based on docs/openapi.yaml Event schemas
 */

import { z } from 'zod'
import { 
  uuidSchema, 
  slugSchema, 
  translationSchema, 
  urlSchema, 
  coordinateSchema,
  moneyAmountSchema,
  dateTimeSchema,
  paginationQuerySchema,
  colorSchema
} from './common'

const strictTranslationSchema = translationSchema.strict()
const strictMoneyAmountSchema = moneyAmountSchema.strict()
const booleanQuerySchema = z.enum(['true', 'false']).transform((value) => value === 'true')

/**
 * Event location schema
 */
export const eventLocationSchema = z.object({
  name: strictTranslationSchema,
  address: strictTranslationSchema.optional(),
  coordinates: coordinateSchema.strict().optional(),
}).strict()

export type EventLocation = z.infer<typeof eventLocationSchema>

/**
 * Create event schema
 * POST /api/v1/events
 */
export const createEventSchema = z.object({
  slug: slugSchema,
  title: strictTranslationSchema,
  description: strictTranslationSchema,
  coverImageUrl: urlSchema.optional(),
  location: eventLocationSchema,
  timeZone: z.string().min(1).max(64).optional().default('Asia/Bishkek'),
  startTime: dateTimeSchema,
  endTime: dateTimeSchema,
  registrationDeadline: dateTimeSchema.optional(),
  capacity: z.number().int().positive(),
  price: strictMoneyAmountSchema.optional(),
  categories: z.array(z.string().min(2).max(50)).max(5).optional(),
  tags: z.array(z.string().min(2).max(50)).max(10).optional(),
  organizerId: uuidSchema,
  isPublished: z.boolean().optional().default(false),
}).strict().refine(
  (data) => new Date(data.endTime) > new Date(data.startTime),
  { message: 'Время окончания должно быть позже времени начала', path: ['endTime'] }
).refine(
  (data) => !data.registrationDeadline || new Date(data.registrationDeadline) <= new Date(data.startTime),
  { message: 'Дедлайн регистрации должен быть до начала события', path: ['registrationDeadline'] }
)

export type CreateEventInput = z.infer<typeof createEventSchema>

/**
 * Update event schema
 * PATCH /api/v1/events/:id
 */
export const updateEventSchema = z.object({
  slug: slugSchema.optional(),
  title: strictTranslationSchema.optional(),
  description: strictTranslationSchema.optional(),
  coverImageUrl: urlSchema.optional(),
  location: eventLocationSchema.optional(),
  timeZone: z.string().min(1).max(64).optional(),
  startTime: dateTimeSchema.optional(),
  endTime: dateTimeSchema.optional(),
  registrationDeadline: dateTimeSchema.optional(),
  capacity: z.number().int().positive().optional(),
  price: strictMoneyAmountSchema.optional(),
  categories: z.array(z.string().min(2).max(50)).max(5).optional(),
  tags: z.array(z.string().min(2).max(50)).max(10).optional(),
  isPublished: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'Необходимо передать хотя бы одно поле для изменения',
})

export type UpdateEventInput = z.infer<typeof updateEventSchema>

/**
 * Event query filters
 * GET /api/v1/events
 */
export const eventFiltersSchema = paginationQuerySchema.extend({
  organizerId: uuidSchema.optional(),
  category: z.string().max(50).optional(),
  tag: z.string().max(50).optional(),
  startAfter: dateTimeSchema.optional(),
  startBefore: dateTimeSchema.optional(),
  isPublished: booleanQuerySchema.optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['startTime', 'createdAt', 'registrationCount']).optional().default('startTime'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
}).strict()

export type EventFilters = z.infer<typeof eventFiltersSchema>

/**
 * Event registration schema
 * POST /api/v1/events/:eventId/register
 */
export const eventRegistrationSchema = z.object({
  attendeeFirstName: z.string().min(1).max(100),
  attendeeLastName: z.string().min(1).max(100),
  attendeePhone: z.string().regex(/^\+996\d{9}$/),
  attendeeEmail: z.string().email().max(255).optional(),
  additionalInfo: z.string().max(500).optional(),
}).strict()

export type EventRegistrationInput = z.infer<typeof eventRegistrationSchema>
