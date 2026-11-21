import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import middleware from '../../middleware'
import {
  checkApiRateLimit,
  getClientIp,
  isExpensiveRequest,
  MemoryRateLimitStore,
  UpstashRestRateLimitStore,
  type RateLimitStore,
} from '../../lib/security/api-rate-limit'

const SECRET = 'api-rate-limit-test-key'

function testEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'test',
    JWT_SECRET: SECRET,
    API_RATE_LIMIT_WINDOW_MS: '60000',
    API_RATE_LIMIT_PUBLIC_LIMIT: '2',
    API_RATE_LIMIT_AUTH_IP_LIMIT: '100',
    API_RATE_LIMIT_AUTH_USER_LIMIT: '1',
    API_RATE_LIMIT_EXPENSIVE_PUBLIC_LIMIT: '1',
    API_RATE_LIMIT_EXPENSIVE_AUTH_IP_LIMIT: '10',
    API_RATE_LIMIT_EXPENSIVE_AUTH_USER_LIMIT: '1',
    ...overrides,
  }
}

function apiRequest(
  pathname = '/api/v1/example',
  headers: Record<string, string> = {},
  method = 'GET'
): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, { method, headers })
}

function accessToken(userId: string, secret: string, now: number): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const payload = encode({
    userId,
    sessionId: `session-${userId}`,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 600,
  })
  const signingInput = `${header}.${payload}`
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url')
  return `${signingInput}.${signature}`
}

test('allows requests within the public limit and returns rate limit headers', async () => {
  const store = new MemoryRateLimitStore()
  const request = apiRequest('/api/v1/example', { 'x-real-ip': '198.51.100.10' })

  const first = await checkApiRateLimit(request, {
    store,
    now: () => 1_000,
    env: testEnvironment(),
  })
  const second = await checkApiRateLimit(request, {
    store,
    now: () => 1_000,
    env: testEnvironment(),
  })

  assert.equal(first.response, null)
  assert.equal(first.headers.get('RateLimit-Limit'), '2')
  assert.equal(first.headers.get('RateLimit-Remaining'), '1')
  assert.equal(second.response, null)
  assert.equal(second.headers.get('RateLimit-Remaining'), '0')
})

test('returns HTTP 429 and Retry-After after the configured limit is exceeded', async () => {
  const store = new MemoryRateLimitStore()
  const request = apiRequest('/api/v1/example', { 'x-real-ip': '198.51.100.11' })
  const options = { store, now: () => 10_000, env: testEnvironment() }

  await checkApiRateLimit(request, options)
  await checkApiRateLimit(request, options)
  const limited = await checkApiRateLimit(request, options)

  assert.equal(limited.response?.status, 429)
  assert.equal(limited.response?.headers.get('Retry-After'), '60')
  assert.equal(limited.response?.headers.get('RateLimit-Remaining'), '0')
  const body = await limited.response?.json() as { error: { code: string } }
  assert.equal(body.error.code, 'RATE_LIMIT_EXCEEDED')
})

test('resets the counter after its fixed window expires', async () => {
  const store = new MemoryRateLimitStore()
  const request = apiRequest('/api/v1/example', { 'x-real-ip': '198.51.100.12' })
  const env = testEnvironment({ API_RATE_LIMIT_PUBLIC_LIMIT: '1' })

  assert.equal((await checkApiRateLimit(request, { store, now: () => 0, env })).response, null)
  assert.equal((await checkApiRateLimit(request, { store, now: () => 1, env })).response?.status, 429)
  assert.equal((await checkApiRateLimit(request, { store, now: () => 60_001, env })).response, null)
})

test('enforces the limit under concurrent requests', async () => {
  const store = new MemoryRateLimitStore()
  const request = apiRequest('/api/v1/example', { 'x-real-ip': '198.51.100.13' })
  const env = testEnvironment({ API_RATE_LIMIT_PUBLIC_LIMIT: '5' })

  const results = await Promise.all(
    Array.from({ length: 25 }, () => checkApiRateLimit(request, { store, now: () => 5_000, env }))
  )

  assert.equal(results.filter(({ response }) => response === null).length, 5)
  assert.equal(results.filter(({ response }) => response?.status === 429).length, 20)
})

test('uses verified user identity for authenticated limits and separates users', async () => {
  const store = new MemoryRateLimitStore()
  const now = 1_700_000_000_000
  const env = testEnvironment()
  const requestFor = (userId: string) => apiRequest('/api/v1/example', {
    'x-real-ip': '198.51.100.14',
    cookie: `session=${accessToken(userId, SECRET, now)}`,
  })

  const userOneFirst = await checkApiRateLimit(requestFor('user-one'), { store, now: () => now, env })
  const userTwoFirst = await checkApiRateLimit(requestFor('user-two'), { store, now: () => now, env })
  const userOneSecond = await checkApiRateLimit(requestFor('user-one'), { store, now: () => now, env })

  assert.equal(userOneFirst.response, null)
  assert.equal(userTwoFirst.response, null)
  assert.equal(userOneSecond.response?.status, 429)
})

test('ignores spoofable X-Forwarded-For values and validates the trusted IP header', () => {
  const request = apiRequest('/api/v1/example', {
    'x-forwarded-for': '203.0.113.99',
    'x-real-ip': '198.51.100.15',
  })
  const spoofOnly = apiRequest('/api/v1/example', {
    'x-forwarded-for': '203.0.113.99',
  })
  const invalidTrustedHeader = apiRequest('/api/v1/example', {
    'x-real-ip': 'not-an-ip',
  })

  assert.equal(getClientIp(request), 'ip:v4:198.51.100.15')
  assert.equal(getClientIp(spoofOnly), 'ip:unknown')
  assert.equal(getClientIp(invalidTrustedHeader), 'ip:unknown')
})

test('uses a stricter shared bucket for expensive API operations', async () => {
  const store = new MemoryRateLimitStore()
  const env = testEnvironment({ API_RATE_LIMIT_PUBLIC_LIMIT: '5' })
  const expensiveRequest = apiRequest('/api/v1/auth/phone/verify-otp', {
    'x-real-ip': '198.51.100.16',
  }, 'POST')
  const ordinaryRequest = apiRequest('/api/v1/example', {
    'x-real-ip': '198.51.100.16',
  })

  assert.equal(isExpensiveRequest(expensiveRequest), true)
  assert.equal((await checkApiRateLimit(expensiveRequest, { store, now: () => 20_000, env })).response, null)
  assert.equal((await checkApiRateLimit(expensiveRequest, { store, now: () => 20_000, env })).response?.status, 429)
  assert.equal((await checkApiRateLimit(ordinaryRequest, { store, now: () => 20_000, env })).response, null)
})

test('fails closed with HTTP 503 when Redis is unavailable in production', async () => {
  const unavailableStore: RateLimitStore = {
    async increment() {
      throw new Error('private Redis outage detail')
    },
  }

  const result = await checkApiRateLimit(
    apiRequest('/api/v1/example', { 'x-real-ip': '198.51.100.17' }),
    {
      store: unavailableStore,
      now: () => 30_000,
      env: { NODE_ENV: 'production' },
    }
  )
  const body = await result.response?.json() as { error: { code: string; message: string } }

  assert.equal(result.response?.status, 503)
  assert.equal(result.response?.headers.get('Retry-After'), '1')
  assert.equal(body.error.code, 'RATE_LIMIT_UNAVAILABLE')
  assert.equal(body.error.message.includes('private Redis outage detail'), false)

  const unconfigured = await checkApiRateLimit(
    apiRequest('/api/v1/example', { 'x-real-ip': '198.51.100.18' }),
    { now: () => 30_000, env: { NODE_ENV: 'production' } }
  )
  assert.equal(unconfigured.response?.status, 503)
})

test('uses the bounded local fallback outside production when Redis is not configured', async () => {
  const request = apiRequest('/api/v1/example', { 'x-real-ip': '198.51.100.19' })
  const env = testEnvironment({ API_RATE_LIMIT_PUBLIC_LIMIT: '1' })

  const first = await checkApiRateLimit(request, { now: () => 40_000, env })
  const second = await checkApiRateLimit(request, { now: () => 40_000, env })

  assert.equal(first.response, null)
  assert.equal(second.response?.status, 429)
})

test('applies the limiter in the global API middleware and returns its headers', async () => {
  const environmentKeys = [
    'NODE_ENV',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'API_RATE_LIMIT_PUBLIC_LIMIT',
    'API_RATE_LIMIT_WINDOW_MS',
  ] as const
  const previousValues = new Map(environmentKeys.map((key) => [key, process.env[key]]))

  process.env.NODE_ENV = 'test'
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  process.env.API_RATE_LIMIT_PUBLIC_LIMIT = '1'
  process.env.API_RATE_LIMIT_WINDOW_MS = '60000'

  try {
    const request = apiRequest('/api/v1/health?check=live', {
      'x-real-ip': '198.51.100.20',
    })
    const allowed = await middleware(request)
    const limited = await middleware(request)

    assert.equal(allowed.headers.get('RateLimit-Limit'), '1')
    assert.equal(allowed.headers.get('RateLimit-Remaining'), '0')
    assert.equal(limited.status, 429)
    assert.equal(limited.headers.get('Retry-After'), '60')
  } finally {
    for (const key of environmentKeys) {
      const previousValue = previousValues.get(key)
      if (previousValue === undefined) delete process.env[key]
      else process.env[key] = previousValue
    }
  }
})

test('sends an atomic EVAL command through the Redis REST API', async () => {
  let requestBody: unknown
  const fetcher: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ result: [3, 45_000] }), { status: 200 })
  }
  const store = new UpstashRestRateLimitStore('https://redis.example.test', 'test-only-token', fetcher)

  const result = await store.increment('hashed-client-key', 60_000, 100_000)
  const command = requestBody as unknown[]

  assert.deepEqual(result, { count: 3, resetAt: 145_000 })
  assert.ok(Array.isArray(command))
  assert.equal(command[0], 'EVAL')
  assert.equal(command[3], 'hashed-client-key')
})
