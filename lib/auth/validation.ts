/**
 * Zod Validation Schemas for Auth Endpoints
 * Following OpenAPI specification
 */

import { z } from 'zod'
import { OtpPurpose } from '@prisma/client'

/**
 * Phone number validation
 * Accepts Kyrgyzstan formats: +996XXXXXXXXX, 996XXXXXXXXX, 0XXXXXXXXX, XXXXXXXXX
 */
export const phoneSchema = z.string()
  .min(9, 'Номер телефона слишком короткий')
  .max(20, 'Номер телефона слишком длинный')
  .regex(/^[\d\s\-\+\(\)]+$/, 'Неверный формат номера телефона')

/**
 * Email validation
 */
export const emailSchema = z.string()
  .email('Неверный формат email')
  .max(255, 'Email слишком длинный')

/**
 * OTP code validation (6 digits)
 */
export const otpCodeSchema = z.string()
  .length(6, 'Код должен содержать 6 цифр')
  .regex(/^\d{6}$/, 'Код должен содержать только цифры')

/**
 * UUID validation
 */
export const uuidSchema = z.string()
  .uuid('Неверный формат ID')

/**
 * OTP Purpose validation
 */
export const otpPurposeSchema = z.nativeEnum(OtpPurpose, {
  errorMap: () => ({ message: 'Неверный тип OTP запроса' })
})

/**
 * POST /api/v1/auth/phone/request-otp
 */
export const requestOtpSchema = z.object({
  phone: phoneSchema,
  purpose: otpPurposeSchema,
})

export type RequestOtpInput = z.infer<typeof requestOtpSchema>

/**
 * POST /api/v1/auth/phone/verify-otp
 */
export const verifyOtpSchema = z.object({
  challengeId: uuidSchema,
  code: otpCodeSchema,
})

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>

/**
 * User name validation (for profile updates)
 */
export const userNameSchema = z.object({
  firstName: z.string()
    .min(1, 'Имя не может быть пустым')
    .max(100, 'Имя слишком длинное')
    .optional(),
  lastName: z.string()
    .min(1, 'Фамилия не может быть пустой')
    .max(100, 'Фамилия слишком длинная')
    .optional(),
})

/**
 * Google OAuth callback validation
 */
export const googleCallbackSchema = z.object({
  code: z.string().min(1, 'Отсутствует код авторизации'),
  state: z.string().optional(),
})

export type GoogleCallbackInput = z.infer<typeof googleCallbackSchema>

/**
 * Helper function to validate request body
 */
export function validateRequestBody<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data)
  
  if (result.success) {
    return { success: true, data: result.data }
  }
  
  return { success: false, errors: result.error }
}

/**
 * Format Zod errors for API response
 */
export function formatValidationErrors(error: z.ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {}
  
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (!formatted[path]) {
      formatted[path] = []
    }
    formatted[path].push(issue.message)
  }
  
  return formatted
}
