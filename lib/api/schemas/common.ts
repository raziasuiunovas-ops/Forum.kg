/**
 * Common Zod Validation Schemas
 * Shared across multiple API modules
 * Based on docs/openapi.yaml component schemas
 */

import { z } from 'zod'
import { Locale } from '@prisma/client'

/**
 * UUID validation
 * Format: "550e8400-e29b-41d4-a716-446655440000"
 */
export const uuidSchema = z.string().uuid('Неверный формат UUID')

/**
 * DateTime validation (ISO 8601 UTC)
 * Format: "2026-11-19T15:30:00.000Z"
 */
export const dateTimeSchema = z.string().datetime({
  message: 'Неверный формат даты. Ожидается ISO 8601 UTC',
})

/**
 * Locale validation
 * Enum: RU, KY, EN
 */
export const localeSchema = z.nativeEnum(Locale, {
  errorMap: () => ({ message: 'Неверная локаль. Допустимые значения: RU, KY, EN' }),
})

/**
 * Currency validation
 * Only KGS supported in MVP
 */
export const currencySchema = z.enum(['KGS'], {
  errorMap: () => ({ message: 'Неверная валюта. Поддерживается только KGS' }),
})

/**
 * Money amount schema
 * amountMinor: integer in minor units (tyiyn for KGS, 100 tyiyn = 1 KGS)
 */
export const moneyAmountSchema = z.object({
  amountMinor: z.number().int().nonnegative('Сумма не может быть отрицательной'),
  currency: currencySchema,
  amountDisplay: z.string().optional(),
})

/**
 * Pagination query parameters
 * ?page=1&limit=20
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

/**
 * Helper to calculate pagination metadata
 */
export function calculatePagination(
  page: number,
  limit: number,
  total: number
) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * Email validation (optional, max 255 chars)
 */
export const emailSchema = z
  .string()
  .email('Неверный формат email')
  .max(255, 'Email слишком длинный')
  .optional()

/**
 * Phone validation (Kyrgyzstan E.164 format)
 * Format: +996XXXXXXXXX
 */
export const phoneSchema = z
  .string()
  .regex(/^\+996\d{9}$/, 'Неверный формат номера телефона. Ожидается: +996XXXXXXXXX')

/**
 * User name validation
 */
export const nameSchema = z
  .string()
  .min(1, 'Имя не может быть пустым')
  .max(100, 'Имя слишком длинное')

/**
 * Timezone validation (IANA timezone database)
 * Example: "Asia/Bishkek"
 */
export const timezoneSchema = z
  .string()
  .regex(/^[A-Za-z_]+\/[A-Za-z_]+$/, 'Неверный формат часового пояса')

/**
 * Slug validation (URL-friendly identifier)
 * Format: lowercase letters, numbers, hyphens
 * Example: "it-forum-2026"
 */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug может содержать только строчные буквы, цифры и дефисы')
  .min(3, 'Slug слишком короткий')
  .max(100, 'Slug слишком длинный')

/**
 * Color validation (hex color)
 * Format: #RRGGBB
 */
export const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Неверный формат цвета. Ожидается: #RRGGBB')

/**
 * URL validation
 */
export const urlSchema = z
  .string()
  .url('Неверный формат URL')
  .max(500, 'URL слишком длинный')

/**
 * Idempotency key validation (UUID format)
 * Used for idempotent operations like order creation
 */
export const idempotencyKeySchema = z
  .string()
  .uuid('Idempotency-Key должен быть в формате UUID')
  .optional()

/**
 * Translation schema (multilingual text)
 */
export const translationSchema = z.object({
  ru: z.string().min(1, 'Русский текст обязателен'),
  ky: z.string().optional(),
  en: z.string().optional(),
})

/**
 * Coordinate validation (latitude, longitude)
 */
export const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

/**
 * Safe integer validation (JavaScript safe integer range)
 */
export const safeIntegerSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER)

/**
 * Positive integer validation
 */
export const positiveIntegerSchema = z
  .number()
  .int()
  .positive('Значение должно быть положительным числом')

/**
 * Helper: Parse pagination from URL searchParams
 */
export function parsePaginationParams(searchParams: URLSearchParams): PaginationQuery {
  return paginationQuerySchema.parse({
    page: searchParams.get('page') || 1,
    limit: searchParams.get('limit') || 20,
  })
}

/**
 * Helper: Parse locale from Accept-Language header
 */
export function parseLocaleHeader(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return Locale.RU

  const locale = acceptLanguage.split(',')[0].split('-')[0].toUpperCase()
  
  if (locale === 'KY') return Locale.KY
  if (locale === 'EN') return Locale.EN
  return Locale.RU
}
