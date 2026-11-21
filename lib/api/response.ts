/**
 * API Response Helpers
 * Provides consistent response formatting for all API endpoints
 * Following OpenAPI 3.0.3 specification from docs/openapi.yaml
 */

import { NextResponse } from 'next/server'

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

/**
 * Success response with single resource
 */
export function success<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status })
}

/**
 * Success response with paginated data
 */
export function paginated<T>(
  data: T[],
  pagination: PaginationMeta,
  status: number = 200
): NextResponse {
  return NextResponse.json(
    {
      data,
      pagination,
    },
    { status }
  )
}

/**
 * Created response (201)
 */
export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 })
}

/**
 * No content response (204)
 */
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 })
}

/**
 * Error response following OpenAPI error format
 */
export interface ApiErrorResponse {
  error: {
    code: string
    message: string
    details?: Record<string, any>
  }
}

/**
 * Generic error response
 */
export function error(
  code: string,
  message: string,
  status: number = 400,
  details?: Record<string, any>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details && { details }),
      },
    },
    { status }
  )
}

/**
 * Validation error response (422)
 */
export function validationError(
  message: string = 'Ошибка валидации данных',
  fields?: Record<string, string[]>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: {
        code: 'VALIDATION_ERROR',
        message,
        ...(fields && { details: { fields } }),
      },
    },
    { status: 422 }
  )
}

/**
 * Unauthorized error (401)
 */
export function unauthorized(
  message: string = 'Требуется авторизация',
  code: string = 'UNAUTHORIZED'
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status: 401 }
  )
}

/**
 * Forbidden error (403)
 */
export function forbidden(
  message: string = 'Недостаточно прав доступа',
  code: string = 'INSUFFICIENT_PERMISSIONS'
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status: 403 }
  )
}

/**
 * Not found error (404)
 */
export function notFound(
  resource: string = 'Ресурс',
  code: string = 'NOT_FOUND'
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: {
        code,
        message: `${resource} не найден`,
      },
    },
    { status: 404 }
  )
}

/**
 * Conflict error (409)
 */
export function conflict(
  message: string,
  code: string = 'CONFLICT',
  details?: Record<string, any>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details && { details }),
      },
    },
    { status: 409 }
  )
}

/**
 * Rate limit exceeded (429)
 */
export function rateLimitExceeded(
  retryAfter?: number
): NextResponse<ApiErrorResponse> {
  const response = NextResponse.json(
    {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Слишком много запросов. Попробуйте позже',
        ...(retryAfter && { details: { retryAfter } }),
      },
    },
    { status: 429 }
  )

  if (retryAfter) {
    response.headers.set('Retry-After', retryAfter.toString())
  }

  return response
}

/**
 * Internal server error (500)
 */
export function internalError(
  message: string = 'Внутренняя ошибка сервера',
  code: string = 'INTERNAL_ERROR'
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status: 500 }
  )
}

/**
 * Service unavailable (503)
 */
export function serviceUnavailable(
  service?: string
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: service
          ? `Сервис ${service} временно недоступен`
          : 'Сервис временно недоступен',
      },
    },
    { status: 503 }
  )
}
