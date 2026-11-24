/**
 * Zod validation schemas for Forum API endpoints
 */

import { z } from 'zod'
import { Locale, ForumStatus } from '@prisma/client'

// Translation schema for localized content
const forumTranslationSchema = z.object({
  locale: z.nativeEnum(Locale),
  title: z.string().min(1).max(255),
  shortDescription: z.string().max(1000).optional(),
  description: z.string().optional(),
  program: z.string().optional(),
  venueName: z.string().max(255).optional(),
  venueAddress: z.string().optional(),
})

// Ticket category schema
const ticketCategorySchema = z.object({
  code: z.string().regex(/^[A-Z_]+$/, 'Code must be uppercase letters and underscores').max(40),
  priceMinor: z.number().int().min(0),
  currency: z.string().length(3).default('KGS'),
  capacity: z.number().int().min(1).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  translations: z.array(z.object({
    locale: z.nativeEnum(Locale),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
  })).min(1),
})

// CREATE forum schema
export const forumCreateSchema = z.object({
  slug: z.string()
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .min(3)
    .max(180),
  status: z.nativeEnum(ForumStatus).optional().default(ForumStatus.DRAFT),
  bannerUrl: z.string().url().optional(),
  venueName: z.string().max(255).optional(),
  venueAddress: z.string().optional(),
  locationCoordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).optional(),
  timeZone: z.string().max(64).default('Asia/Bishkek'),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  registrationDeadline: z.string().datetime().optional(),
  qrExpiresAt: z.string().datetime(),
  capacity: z.number().int().min(1),
  maxTicketsPerAccount: z.number().int().min(1).default(1),
  tags: z.array(z.string().max(50)).default([]),
  publishAt: z.string().datetime().optional(),
  translations: z.array(forumTranslationSchema).min(1),
  categories: z.array(ticketCategorySchema).min(1),
}).refine(
  (data) => {
    // Ensure at least one RU translation exists
    return data.translations.some(t => t.locale === Locale.RU)
  },
  { message: 'Russian translation is required', path: ['translations'] }
).refine(
  (data) => {
    // Ensure startsAt is after current time
    return new Date(data.startsAt) > new Date()
  },
  { message: 'Forum start time must be in the future', path: ['startsAt'] }
).refine(
  (data) => {
    // Ensure endsAt is after startsAt if provided
    if (data.endsAt) {
      return new Date(data.endsAt) > new Date(data.startsAt)
    }
    return true
  },
  { message: 'End time must be after start time', path: ['endsAt'] }
).refine(
  (data) => {
    // Ensure qrExpiresAt is after startsAt
    return new Date(data.qrExpiresAt) >= new Date(data.startsAt)
  },
  { message: 'QR expiration must be at or after forum start time', path: ['qrExpiresAt'] }
).refine(
  (data) => {
    // Ensure each category has at least one translation
    return data.categories.every(cat => cat.translations.length > 0)
  },
  { message: 'Each category must have at least one translation', path: ['categories'] }
).refine(
  (data) => {
    // Ensure no duplicate category codes
    const codes = data.categories.map(c => c.code)
    return codes.length === new Set(codes).size
  },
  { message: 'Category codes must be unique', path: ['categories'] }
).refine(
  (data) => {
    // Ensure total category capacity doesn't exceed forum capacity
    const totalCategoryCapacity = data.categories
      .filter(c => c.capacity !== undefined)
      .reduce((sum, c) => sum + (c.capacity || 0), 0)
    if (totalCategoryCapacity > 0) {
      return totalCategoryCapacity <= data.capacity
    }
    return true
  },
  { message: 'Total category capacity cannot exceed forum capacity', path: ['categories'] }
)

// UPDATE forum schema (all fields optional except those that can't be changed)
export const forumUpdateSchema = z.object({
  status: z.nativeEnum(ForumStatus).optional(),
  bannerUrl: z.string().url().optional().nullable(),
  venueName: z.string().max(255).optional(),
  venueAddress: z.string().optional(),
  locationCoordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).optional().nullable(),
  timeZone: z.string().max(64).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional().nullable(),
  registrationDeadline: z.string().datetime().optional().nullable(),
  qrExpiresAt: z.string().datetime().optional(),
  capacity: z.number().int().min(1).optional(),
  maxTicketsPerAccount: z.number().int().min(1).optional(),
  tags: z.array(z.string().max(50)).optional(),
  publishAt: z.string().datetime().optional().nullable(),
  translations: z.array(forumTranslationSchema).optional(),
  categories: z.array(ticketCategorySchema).optional(),
}).refine(
  (data) => {
    // If translations provided, ensure RU exists
    if (data.translations && data.translations.length > 0) {
      return data.translations.some(t => t.locale === Locale.RU)
    }
    return true
  },
  { message: 'Russian translation is required when updating translations', path: ['translations'] }
).refine(
  (data) => {
    // Ensure endsAt is after startsAt if both provided
    if (data.startsAt && data.endsAt) {
      return new Date(data.endsAt) > new Date(data.startsAt)
    }
    return true
  },
  { message: 'End time must be after start time', path: ['endsAt'] }
).refine(
  (data) => {
    // Ensure qrExpiresAt is after startsAt if both provided
    if (data.startsAt && data.qrExpiresAt) {
      return new Date(data.qrExpiresAt) >= new Date(data.startsAt)
    }
    return true
  },
  { message: 'QR expiration must be at or after forum start time', path: ['qrExpiresAt'] }
).refine(
  (data) => {
    // If categories provided, ensure no duplicate codes
    if (data.categories && data.categories.length > 0) {
      const codes = data.categories.map(c => c.code)
      return codes.length === new Set(codes).size
    }
    return true
  },
  { message: 'Category codes must be unique', path: ['categories'] }
).refine(
  (data) => {
    // If both capacity and categories provided, validate total
    if (data.capacity && data.categories) {
      const totalCategoryCapacity = data.categories
        .filter(c => c.capacity !== undefined)
        .reduce((sum, c) => sum + (c.capacity || 0), 0)
      if (totalCategoryCapacity > 0) {
        return totalCategoryCapacity <= data.capacity
      }
    }
    return true
  },
  { message: 'Total category capacity cannot exceed forum capacity', path: ['categories'] }
)

// QUERY schema for listing forums
export const forumQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(ForumStatus).optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['startsAt', 'createdAt', 'updatedAt', 'capacity']).default('startsAt'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  includeStats: z.coerce.boolean().default(true),
})

export type ForumCreateInput = z.infer<typeof forumCreateSchema>
export type ForumUpdateInput = z.infer<typeof forumUpdateSchema>
export type ForumQueryInput = z.infer<typeof forumQuerySchema>
