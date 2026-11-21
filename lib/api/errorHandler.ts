/**
 * Centralized Error Handler
 * Converts errors to consistent API error responses
 * Prevents leaking sensitive information in production
 */

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import {
  ApiError,
  InternalError,
  ValidationError,
  isApiError,
} from './errors'
import { error as errorResponse, internalError, validationError } from './response'
import { formatValidationErrors } from '@/lib/auth/validation'

/**
 * Handle API errors and convert to NextResponse
 */
export function handleApiError(err: unknown): NextResponse {
  // Log error for debugging (in production, use proper logging service)
  if (process.env.NODE_ENV === 'development') {
    console.error('API Error:', err)
  }

  // Handle known ApiError instances
  if (isApiError(err)) {
    return errorResponse(
      err.code,
      err.message,
      err.statusCode,
      err.details
    )
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const fields = formatValidationErrors(err)
    return validationError('Ошибка валидации данных', fields)
  }

  // Handle Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaError(err)
  }

  // Handle standard JavaScript errors
  if (err instanceof Error) {
    // In production, don't expose internal error messages
    if (process.env.NODE_ENV === 'production') {
      return internalError()
    }
    
    // In development, show the actual error message
    return internalError(err.message, 'INTERNAL_ERROR')
  }

  // Unknown error type
  return internalError()
}

/**
 * Handle Prisma-specific errors
 */
function handlePrismaError(err: Prisma.PrismaClientKnownRequestError): NextResponse {
  switch (err.code) {
    // Unique constraint violation
    case 'P2002': {
      const target = (err.meta?.target as string[]) || []
      const field = target[0] || 'поле'
      
      return errorResponse(
        'DUPLICATE_ENTRY',
        `Запись с таким значением ${field} уже существует`,
        409,
        { field }
      )
    }

    // Record not found
    case 'P2025': {
      return errorResponse(
        'NOT_FOUND',
        'Запись не найдена',
        404
      )
    }

    // Foreign key constraint violation
    case 'P2003': {
      return errorResponse(
        'INVALID_REFERENCE',
        'Указана несуществующая связь',
        400
      )
    }

    // Required field missing
    case 'P2011': {
      const field = (err.meta?.constraint as string) || 'поле'
      return errorResponse(
        'REQUIRED_FIELD_MISSING',
        `Обязательное поле ${field} не может быть пустым`,
        400,
        { field }
      )
    }

    // Default: generic database error
    default: {
      // Don't expose Prisma error details in production
      if (process.env.NODE_ENV === 'production') {
        return internalError('Ошибка базы данных', 'DATABASE_ERROR')
      }
      
      return internalError(err.message, 'DATABASE_ERROR')
    }
  }
}

/**
 * Async error handler wrapper for route handlers
 * Usage: export const GET = withErrorHandler(async (request) => { ... })
 */
export function withErrorHandler<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args)
    } catch (err) {
      return handleApiError(err)
    }
  }
}

/**
 * Assert condition or throw ApiError
 */
export function assert(
  condition: boolean,
  error: ApiError | string,
  code?: string
): asserts condition {
  if (!condition) {
    if (typeof error === 'string') {
      throw new InternalError(error, code)
    }
    throw error
  }
}

/**
 * Safe JSON parse with error handling
 */
export async function safeJsonParse<T>(request: Request): Promise<T | null> {
  try {
    const text = await request.text()
    if (!text) return null
    return JSON.parse(text) as T
  } catch {
    throw new ValidationError('Некорректный JSON в теле запроса')
  }
}
