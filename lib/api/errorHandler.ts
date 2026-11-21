/**
 * Centralized Error Handler
 * Converts errors to consistent API error responses
 * Prevents leaking sensitive information in production
 */

import { NextRequest, NextResponse } from 'next/server'
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
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

/**
 * Handle API errors and convert to NextResponse
 */
export function handleApiError(err: unknown): NextResponse {
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
      const response = handleApiError(err)
      if (response.status >= 500) {
        const firstArg = args[0]
        const request =
          firstArg &&
          typeof firstArg === 'object' &&
          'url' in firstArg &&
          'headers' in firstArg
            ? (firstArg as NextRequest)
            : undefined

        writeSecurityAuditEvent({
          eventType: 'API_ERROR',
          result: 'error',
          request,
          reason: 'unhandled_api_exception',
          statusCode: response.status,
        })
      }
      return response
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

/**
 * Validate and parse request body with Zod schema
 * Throws ValidationError if validation fails
 * 
 * @param request - Next.js Request object
 * @param schema - Zod schema for validation
 * @param options - Validation options
 * @returns Validated and typed data
 * 
 * @example
 * const data = await validateBody(request, createPostSchema)
 */
export async function validateBody<T>(
  request: Request,
  schema: import('zod').ZodSchema<T>,
  options?: {
    /** Reject unknown fields (default: false) - only works with ZodObject schemas */
    strict?: boolean
  }
): Promise<T> {
  const body = await safeJsonParse<unknown>(request)
  
  if (body === null) {
    throw new ValidationError('Тело запроса не может быть пустым')
  }

  // Apply strict mode if requested and schema supports it (ZodObject)
  let schemaToUse = schema
  if (options?.strict) {
    // Check if schema has strict method (available on ZodObject)
    const schemaWithStrict = schema as { strict?: () => import('zod').ZodSchema<T> }
    if (typeof schemaWithStrict.strict === 'function') {
      schemaToUse = schemaWithStrict.strict()
    }
  }

  const result = schemaToUse.safeParse(body)
  
  if (!result.success) {
    throw result.error
  }
  
  return result.data
}

/**
 * Validate and parse query parameters with Zod schema
 * Throws ValidationError if validation fails
 * 
 * @param searchParams - URLSearchParams from request.url
 * @param schema - Zod schema for validation
 * @returns Validated and typed query parameters
 * 
 * @example
 * const { searchParams } = new URL(request.url)
 * const query = validateQuery(searchParams, paginationQuerySchema)
 */
export function validateQuery<T>(
  searchParams: URLSearchParams,
  schema: import('zod').ZodSchema<T>
): T {
  // Convert URLSearchParams to plain object
  const params: Record<string, string | string[]> = {}
  
  for (const [key, value] of searchParams.entries()) {
    // Handle multiple values for same key (e.g., ?tag=js&tag=ts)
    const existing = params[key]
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        params[key] = [existing, value]
      }
    } else {
      params[key] = value
    }
  }
  
  const result = schema.safeParse(params)
  
  if (!result.success) {
    throw result.error
  }
  
  return result.data
}
