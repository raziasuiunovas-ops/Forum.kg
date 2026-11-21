/**
 * API Error Classes
 * Typed errors for consistent error handling across the application
 * Following OpenAPI error response format
 */

/**
 * Base API Error
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = 'ApiError'
    
    // Maintain proper stack trace (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    }
  }
}

/**
 * Validation Error (422)
 * Used when request data fails validation
 */
export class ValidationError extends ApiError {
  constructor(
    message: string = 'Ошибка валидации данных',
    fields?: Record<string, string[]>
  ) {
    super(
      'VALIDATION_ERROR',
      message,
      422,
      fields ? { fields } : undefined
    )
    this.name = 'ValidationError'
  }
}

/**
 * Unauthorized Error (401)
 * Used when authentication is required but missing or invalid
 */
export class UnauthorizedError extends ApiError {
  constructor(
    message: string = 'Требуется авторизация',
    code: string = 'UNAUTHORIZED'
  ) {
    super(code, message, 401)
    this.name = 'UnauthorizedError'
  }
}

/**
 * Forbidden Error (403)
 * Used when user lacks necessary permissions
 */
export class ForbiddenError extends ApiError {
  constructor(
    message: string = 'Недостаточно прав доступа',
    code: string = 'INSUFFICIENT_PERMISSIONS'
  ) {
    super(code, message, 403)
    this.name = 'ForbiddenError'
  }
}

/**
 * Not Found Error (404)
 * Used when a resource doesn't exist
 */
export class NotFoundError extends ApiError {
  constructor(
    resource: string = 'Ресурс',
    code: string = 'NOT_FOUND'
  ) {
    super(code, `${resource} не найден`, 404)
    this.name = 'NotFoundError'
  }
}

/**
 * Conflict Error (409)
 * Used for business logic conflicts (e.g., capacity exceeded, duplicate, already used)
 */
export class ConflictError extends ApiError {
  constructor(
    message: string,
    code: string = 'CONFLICT',
    details?: Record<string, any>
  ) {
    super(code, message, 409, details)
    this.name = 'ConflictError'
  }
}

/**
 * Rate Limit Error (429)
 * Used when rate limits are exceeded
 */
export class RateLimitError extends ApiError {
  constructor(
    message: string = 'Слишком много запросов. Попробуйте позже',
    retryAfter?: number
  ) {
    super(
      'RATE_LIMIT_EXCEEDED',
      message,
      429,
      retryAfter ? { retryAfter } : undefined
    )
    this.name = 'RateLimitError'
  }
}

/**
 * Internal Server Error (500)
 * Used for unexpected server errors
 */
export class InternalError extends ApiError {
  constructor(
    message: string = 'Внутренняя ошибка сервера',
    code: string = 'INTERNAL_ERROR'
  ) {
    super(code, message, 500)
    this.name = 'InternalError'
  }
}

/**
 * Service Unavailable Error (503)
 * Used when external services are unavailable
 */
export class ServiceUnavailableError extends ApiError {
  constructor(service?: string) {
    super(
      'SERVICE_UNAVAILABLE',
      service
        ? `Сервис ${service} временно недоступен`
        : 'Сервис временно недоступен',
      503
    )
    this.name = 'ServiceUnavailableError'
  }
}

/**
 * Check if error is an ApiError instance
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/**
 * Type guard for checking if error has a status code
 */
export function hasStatusCode(error: unknown): error is { statusCode: number } {
  return typeof error === 'object' && error !== null && 'statusCode' in error
}
