import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import {
  createSecurityAuditRecord,
  isSuspiciousApiRequest,
  writeSecurityAuditEvent,
  type SecurityAuditInput,
  type SecurityAuditEventType,
} from '../../lib/security/audit-logger'

const REQUEST_ID = 'audit-test-req-01'

function request(url = 'https://forum.example.test/api/v1/auth/session?token=query-secret') {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'x-request-id': REQUEST_ID,
      'x-real-ip': '203.0.113.20',
      cookie: 'session=cookie-secret; refresh=refresh-secret',
      authorization: 'Bearer authorization-secret',
      'x-csrf-token': 'csrf-secret',
    },
  })
}

test('creates structured records with the required request and outcome fields', () => {
  const record = createSecurityAuditRecord({
    eventType: 'AUTH_SUCCESS',
    result: 'success',
    request: request(),
    userId: '9f6a5d17-a1b8-47c1-9a2f-d223e4b4da19',
    reason: 'otp_verified',
    statusCode: 200,
  }, 1_700_000_000_000)

  assert.ok(record)
  assert.equal(record.eventType, 'AUTH_SUCCESS')
  assert.equal(record.timestamp, new Date(1_700_000_000_000).toISOString())
  assert.equal(record.requestId, REQUEST_ID)
  assert.equal(record.userId, '9f6a5d17-a1b8-47c1-9a2f-d223e4b4da19')
  assert.equal(record.ip, 'ip:v4:203.0.113.20')
  assert.equal(record.endpoint, '/api/v1/auth/session')
  assert.equal(record.method, 'POST')
  assert.equal(record.result, 'success')
  assert.equal(record.severity, 'info')
})

test('uses the server supplied request ID ahead of client controlled request headers', () => {
  const record = createSecurityAuditRecord({
    eventType: 'API_ERROR',
    result: 'error',
    request: request(),
    requestId: 'server-generated-id',
  })

  assert.equal(record?.requestId, 'server-generated-id')
})

test('serializes only allowlisted fields and omits tokens, cookies, OTP, and payload data', () => {
  const lines: string[] = []
  const unsafeInput = {
    eventType: 'OTP_VERIFY',
    result: 'success',
    request: request(),
    userId: '9f6a5d17-a1b8-47c1-9a2f-d223e4b4da19',
    reason: 'otp_verified',
    password: 'password-secret',
    otp: '123456',
    accessToken: 'access-secret',
    refreshToken: 'refresh-secret',
    payload: { phone: '+996555123456' },
  } as unknown as SecurityAuditInput

  writeSecurityAuditEvent(unsafeInput, { sink: (_severity, line) => lines.push(line) })

  assert.equal(lines.length, 1)
  const record = JSON.parse(lines[0]) as Record<string, unknown>
  assert.equal(record.eventType, 'OTP_VERIFY')
  assert.equal(record.endpoint, '/api/v1/auth/session')
  for (const secret of [
    'query-secret', 'cookie-secret', 'refresh-secret', 'authorization-secret',
    'csrf-secret', 'password-secret', '123456', 'access-secret', '+996555123456',
  ]) {
    assert.equal(lines[0].includes(secret), false)
  }
})

test('rejects log injection in request metadata and keeps output parseable as one line', () => {
  const lines: string[] = []
  const injectedRequest = new NextRequest('https://forum.example.test/api/v1/auth/%0aInjected', {
    headers: { 'x-request-id': 'safe-id%0aforged=true', 'x-real-ip': '203.0.113.21' },
  })

  writeSecurityAuditEvent({
    eventType: 'SUSPICIOUS_REQUEST',
    result: 'denied',
    request: injectedRequest,
    reason: 'invalid\nseverity=info',
  }, { sink: (_severity, line) => lines.push(line) })

  assert.equal(lines.length, 1)
  assert.equal(lines[0].includes('\n'), false)
  const record = JSON.parse(lines[0]) as Record<string, unknown>
  assert.match(String(record.requestId), /^[0-9a-f-]{36}$/i)
  assert.equal(record.endpoint, '/api/v1/auth/:redacted')
  assert.equal('reason' in record, false)
})

test('assigns warning severity to failed OTP and access-denied outcomes', () => {
  const otp = createSecurityAuditRecord({
    eventType: 'OTP_VERIFY',
    result: 'failure',
    request: request(),
  })
  const denied = createSecurityAuditRecord({
    eventType: 'ACCESS_DENIED',
    result: 'denied',
    request: request(),
  })

  assert.equal(otp?.severity, 'warning')
  assert.equal(denied?.severity, 'warning')
})

test('supports each required security event type', () => {
  const eventTypes: SecurityAuditEventType[] = [
    'AUTH_SUCCESS', 'AUTH_FAILURE', 'OTP_REQUEST', 'OTP_VERIFY', 'REFRESH_SUCCESS',
    'REFRESH_TOKEN_REUSE', 'LOGOUT', 'LOGOUT_ALL', 'ACCESS_DENIED',
    'RATE_LIMIT_EXCEEDED', 'CSRF_REJECTED', 'SUSPICIOUS_REQUEST', 'API_ERROR',
    'USER_PROFILE_UPDATED', 'TOPIC_CATEGORY_CREATED', 'TOPIC_CREATED',
    'TOPIC_UPDATED', 'TOPIC_DELETED', 'POST_CREATED', 'POST_UPDATED', 'POST_DELETED',
    'EVENT_CREATED', 'EVENT_UPDATED', 'EVENT_CANCELLED', 'EVENT_REGISTERED',
    'EVENT_REGISTRATION_CANCELLED',
  ]

  for (const eventType of eventTypes) {
    const record = createSecurityAuditRecord({ eventType, result: 'success' })
    assert.equal(record?.eventType, eventType)
    assert.equal(typeof record?.timestamp, 'string')
    assert.equal(typeof record?.requestId, 'string')
    assert.equal(record?.endpoint, 'unknown')
    assert.equal(record?.method, 'OTHER')
  }
})

test('detects suspicious API path patterns without treating query values as path input', () => {
  assert.equal(isSuspiciousApiRequest(request('https://forum.example.test/api/%0aInjected')), true)
  assert.equal(isSuspiciousApiRequest(request('https://forum.example.test/api/v1/items?next=%2e%2e')), false)
})

test('throttles repeated noisy events and reports the suppressed count', () => {
  const lines: string[] = []
  const event: SecurityAuditInput = {
    eventType: 'AUTH_FAILURE',
    result: 'failure',
    request: new NextRequest('https://forum.example.test/api/v1/auth/login', {
      headers: { 'x-real-ip': '203.0.113.22' },
    }),
    reason: 'invalid_credentials',
  }
  const sink = (_severity: string, line: string) => lines.push(line)

  writeSecurityAuditEvent(event, { sink, now: () => 10_000 })
  writeSecurityAuditEvent(event, { sink, now: () => 11_000 })
  writeSecurityAuditEvent(event, { sink, now: () => 80_001 })

  assert.equal(lines.length, 2)
  assert.equal(JSON.parse(lines[1]).suppressedCount, 1)
})

test('does not throw when the configured logging sink fails', () => {
  assert.doesNotThrow(() => {
    writeSecurityAuditEvent({
      eventType: 'API_ERROR',
      result: 'error',
      request: request(),
      reason: 'sink_failure_test',
    }, { sink: () => { throw new Error('private sink detail') } })
  })
})
