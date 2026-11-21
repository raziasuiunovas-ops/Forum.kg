/**
 * Auth Error Codes and Messages
 * Following OpenAPI error response format
 */

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

// Authentication Errors
export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: {
    code: 'INVALID_CREDENTIALS',
    message: 'Неверные учётные данные',
    statusCode: 401,
  },
  SESSION_EXPIRED: {
    code: 'SESSION_EXPIRED',
    message: 'Сессия истекла',
    statusCode: 401,
  },
  SESSION_REVOKED: {
    code: 'SESSION_REVOKED',
    message: 'Сессия отозвана',
    statusCode: 401,
  },
  INVALID_TOKEN: {
    code: 'INVALID_TOKEN',
    message: 'Недействительный токен',
    statusCode: 401,
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    message: 'Требуется авторизация',
    statusCode: 401,
  },
  PHONE_NOT_VERIFIED: {
    code: 'PHONE_NOT_VERIFIED',
    message: 'Телефон не подтверждён',
    statusCode: 403,
  },
  ACCOUNT_SUSPENDED: {
    code: 'ACCOUNT_SUSPENDED',
    message: 'Аккаунт заблокирован',
    statusCode: 403,
  },
  INSUFFICIENT_PERMISSIONS: {
    code: 'INSUFFICIENT_PERMISSIONS',
    message: 'Недостаточно прав доступа',
    statusCode: 403,
  },
} as const

// OTP Errors
export const OTP_ERRORS = {
  INVALID_OTP: {
    code: 'INVALID_OTP',
    message: 'Неверный код подтверждения',
    statusCode: 400,
  },
  OTP_EXPIRED: {
    code: 'OTP_EXPIRED',
    message: 'Код подтверждения истёк',
    statusCode: 400,
  },
  OTP_ALREADY_USED: {
    code: 'OTP_ALREADY_USED',
    message: 'Код уже был использован',
    statusCode: 400,
  },
  TOO_MANY_ATTEMPTS: {
    code: 'TOO_MANY_ATTEMPTS',
    message: 'Превышено количество попыток',
    statusCode: 429,
  },
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Слишком много запросов. Попробуйте позже',
    statusCode: 429,
  },
} as const

// Validation Errors
export const VALIDATION_ERRORS = {
  INVALID_PHONE: {
    code: 'INVALID_PHONE',
    message: 'Неверный формат номера телефона',
    statusCode: 422,
  },
  INVALID_EMAIL: {
    code: 'INVALID_EMAIL',
    message: 'Неверный формат email',
    statusCode: 422,
  },
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    message: 'Ошибка валидации данных',
    statusCode: 422,
  },
} as const

// Helper function to create error response
export function createAuthError(
  errorType: keyof typeof AUTH_ERRORS | keyof typeof OTP_ERRORS | keyof typeof VALIDATION_ERRORS,
  details?: Record<string, any>
) {
  const allErrors = { ...AUTH_ERRORS, ...OTP_ERRORS, ...VALIDATION_ERRORS }
  const error = allErrors[errorType]
  
  return new AuthError(error.code, error.message, error.statusCode, details)
}
