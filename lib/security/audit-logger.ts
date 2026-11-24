import { NextRequest } from 'next/server'
import { getClientIp } from './api-rate-limit'

export type SecurityAuditEventType =
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILURE'
  | 'OTP_REQUEST'
  | 'OTP_VERIFY'
  | 'REFRESH_SUCCESS'
  | 'REFRESH_TOKEN_REUSE'
  | 'LOGOUT'
  | 'LOGOUT_ALL'
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET_ATTEMPT'
  | 'PASSWORD_RESET_SUCCESS'
  | 'ACCESS_DENIED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'CSRF_REJECTED'
  | 'SUSPICIOUS_REQUEST'
  | 'API_ERROR'
  | 'USER_PROFILE_UPDATED'
  | 'TOPIC_CATEGORY_CREATED'
  | 'TOPIC_CREATED'
  | 'TOPIC_UPDATED'
  | 'TOPIC_DELETED'
  | 'POST_CREATED'
  | 'POST_UPDATED'
  | 'POST_DELETED'
  | 'EVENT_CREATED'
  | 'EVENT_UPDATED'
  | 'EVENT_CANCELLED'
  | 'EVENT_REGISTERED'
  | 'EVENT_REGISTRATION_CANCELLED'

export type SecurityAuditResult = 'success' | 'failure' | 'denied' | 'error'
export type SecurityAuditSeverity = 'info' | 'warning' | 'error'

export interface SecurityAuditInput {
  eventType: SecurityAuditEventType
  result: SecurityAuditResult
  request?: NextRequest
  requestId?: string
  userId?: string
  reason?: string
  statusCode?: number
}

export interface SecurityAuditRecord {
  eventType: SecurityAuditEventType
  timestamp: string
  requestId: string
  userId?: string
  ip?: string
  endpoint: string
  method: string
  result: SecurityAuditResult
  severity: SecurityAuditSeverity
  reason?: string
  statusCode?: number
  suppressedCount?: number
}

export type SecurityAuditSink = (severity: SecurityAuditSeverity, jsonLine: string) => void

export interface SecurityAuditOptions {
  sink?: SecurityAuditSink
  now?: () => number
}

const SEVERITY_BY_EVENT: Record<SecurityAuditEventType, SecurityAuditSeverity> = {
  AUTH_SUCCESS: 'info',
  AUTH_FAILURE: 'warning',
  OTP_REQUEST: 'info',
  OTP_VERIFY: 'info',
  REFRESH_SUCCESS: 'info',
  REFRESH_TOKEN_REUSE: 'error',
  LOGOUT: 'info',
  LOGOUT_ALL: 'info',
  PASSWORD_RESET_REQUEST: 'info',
  PASSWORD_RESET_ATTEMPT: 'info',
  PASSWORD_RESET_SUCCESS: 'info',
  ACCESS_DENIED: 'warning',
  RATE_LIMIT_EXCEEDED: 'warning',
  CSRF_REJECTED: 'warning',
  SUSPICIOUS_REQUEST: 'warning',
  API_ERROR: 'error',
  USER_PROFILE_UPDATED: 'info',
  TOPIC_CATEGORY_CREATED: 'info',
  TOPIC_CREATED: 'info',
  TOPIC_UPDATED: 'info',
  TOPIC_DELETED: 'warning',
  POST_CREATED: 'info',
  POST_UPDATED: 'info',
  POST_DELETED: 'warning',
  EVENT_CREATED: 'info',
  EVENT_UPDATED: 'info',
  EVENT_CANCELLED: 'warning',
  EVENT_REGISTERED: 'info',
  EVENT_REGISTRATION_CANCELLED: 'info',
}

const THROTTLED_EVENTS = new Set<SecurityAuditEventType>([
  'AUTH_FAILURE',
  'OTP_REQUEST',
  'OTP_VERIFY',
  'ACCESS_DENIED',
  'RATE_LIMIT_EXCEEDED',
  'CSRF_REJECTED',
  'SUSPICIOUS_REQUEST',
  'API_ERROR',
])

const THROTTLE_WINDOW_MS = 60_000
const MAX_THROTTLE_KEYS = 5_000
const throttleState = new Map<string, { lastLoggedAt: number; suppressedCount: number }>()

/**
 * Writes a one-line JSON security event. Only explicitly selected fields are
 * serialized; caller-provided payloads and error objects are never accepted.
 * Logging failures are intentionally swallowed so they cannot fail a request.
 */
export function writeSecurityAuditEvent(
  input: SecurityAuditInput,
  options: SecurityAuditOptions = {}
): void {
  try {
    const now = options.now?.() ?? Date.now()
    const record = createSecurityAuditRecord(input, now)
    if (!record) return

    const suppressedCount = shouldEmit(record, now)
    if (suppressedCount === null) return
    if (suppressedCount > 0) record.suppressedCount = suppressedCount

    const jsonLine = JSON.stringify(record)
    const sink = options.sink ?? writeToConsole
    try {
      sink(record.severity, jsonLine)
    } catch {
      // Audit logging is best effort and must not interrupt application work.
    }
  } catch {
    // Covers malformed request metadata and failures in the logging runtime.
  }
}

export function createSecurityAuditRecord(
  input: SecurityAuditInput,
  now = Date.now()
): SecurityAuditRecord | null {
  if (!input || !Object.prototype.hasOwnProperty.call(SEVERITY_BY_EVENT, input.eventType)) {
    return null
  }

  const result = sanitizeResult(input.result)
  if (!result) return null

  const record: SecurityAuditRecord = {
    eventType: input.eventType,
    timestamp: new Date(now).toISOString(),
    requestId: getRequestId(input.request, input.requestId),
    endpoint: getEndpoint(input.request),
    method: getMethod(input.request),
    result,
    severity: getSeverity(input.eventType, result),
  }

  const userId = sanitizeUserId(input.userId)
  if (userId) record.userId = userId

  const ip = getTrustedIp(input.request)
  if (ip) record.ip = ip

  const reason = sanitizeReason(input.reason)
  if (reason) record.reason = reason

  if (Number.isInteger(input.statusCode) && input.statusCode! >= 100 && input.statusCode! <= 599) {
    record.statusCode = input.statusCode
  }

  return record
}

function getSeverity(
  eventType: SecurityAuditEventType,
  result: SecurityAuditResult
): SecurityAuditSeverity {
  if (
    result !== 'success' &&
    ['OTP_REQUEST', 'OTP_VERIFY', 'LOGOUT', 'LOGOUT_ALL', 'REFRESH_SUCCESS'].includes(eventType)
  ) {
    return 'warning'
  }
  return SEVERITY_BY_EVENT[eventType]
}

/** Detect high-confidence path injection patterns without logging request data. */
export function isSuspiciousApiRequest(request: NextRequest): boolean {
  try {
    const rawPath = request.url.split('?')[0]
    return /%00|%0a|%0d|%2e%2e|%5c|\\/i.test(rawPath)
  } catch {
    return false
  }
}

function shouldEmit(record: SecurityAuditRecord, now: number): number | null {
  if (!THROTTLED_EVENTS.has(record.eventType)) return 0

  const identity = record.userId ?? record.ip ?? 'unknown'
  const key = `${record.eventType}:${identity}:${record.endpoint}:${record.reason ?? ''}`
  const previous = throttleState.get(key)

  if (previous && now - previous.lastLoggedAt < THROTTLE_WINDOW_MS) {
    previous.suppressedCount += 1
    return null
  }

  pruneThrottleState(now)
  throttleState.set(key, { lastLoggedAt: now, suppressedCount: 0 })
  return previous?.suppressedCount ?? 0
}

function pruneThrottleState(now: number): void {
  if (throttleState.size < MAX_THROTTLE_KEYS) return

  for (const [key, value] of throttleState) {
    if (now - value.lastLoggedAt >= THROTTLE_WINDOW_MS) throttleState.delete(key)
  }

  while (throttleState.size >= MAX_THROTTLE_KEYS) {
    const oldestKey = throttleState.keys().next().value as string | undefined
    if (!oldestKey) break
    throttleState.delete(oldestKey)
  }
}

function getRequestId(request?: NextRequest, explicitRequestId?: string): string {
  const candidate = explicitRequestId?.trim() ?? request?.headers.get('x-request-id')?.trim()
  if (candidate && /^[A-Za-z0-9._:-]{1,80}$/.test(candidate)) return candidate
  return crypto.randomUUID()
}

function getEndpoint(request?: NextRequest): string {
  if (!request) return 'unknown'

  try {
    return request.nextUrl.pathname
      .split('/')
      .map((segment) => {
        if (!segment) return ''

        let decoded: string
        try {
          decoded = decodeURIComponent(segment)
        } catch {
          return ':redacted'
        }

        if (
          decoded.length > 48 ||
          decoded.includes('@') ||
          /^\+?[\d\s().-]{6,}$/.test(decoded) ||
          /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(decoded) ||
          !/^[A-Za-z0-9_-]+$/.test(decoded)
        ) {
          return ':redacted'
        }

        return decoded
      })
      .join('/') || '/'
  } catch {
    return 'unknown'
  }
}

function getMethod(request?: NextRequest): string {
  const method = request?.method.toUpperCase()
  return method && ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method)
    ? method
    : 'OTHER'
}

function getTrustedIp(request?: NextRequest): string | undefined {
  if (!request) return undefined
  const ip = getClientIp(request)
  return ip === 'ip:unknown' ? undefined : ip
}

function sanitizeUserId(value?: string): string | undefined {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : undefined
}

function sanitizeReason(value?: string): string | undefined {
  return value && /^[A-Za-z0-9_:-]{1,64}$/.test(value) ? value : undefined
}

function sanitizeResult(value: unknown): SecurityAuditResult | undefined {
  return value === 'success' || value === 'failure' || value === 'denied' || value === 'error'
    ? value
    : undefined
}

function writeToConsole(severity: SecurityAuditSeverity, jsonLine: string): void {
  if (severity === 'error') console.error(jsonLine)
  else if (severity === 'warning') console.warn(jsonLine)
  else console.info(jsonLine)
}
