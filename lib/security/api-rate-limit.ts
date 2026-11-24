import { NextRequest, NextResponse } from 'next/server'

export interface RateLimitCounter {
  count: number
  resetAt: number
}

export interface RateLimitStore {
  increment(key: string, windowMs: number, now: number): Promise<RateLimitCounter>
}

export interface ApiRateLimitOptions {
  store?: RateLimitStore
  now?: () => number
  env?: Readonly<Record<string, string | undefined>>
}

export interface ApiRateLimitDecision {
  response: NextResponse | null
  headers: Headers
}

interface RateLimitPolicy {
  key: string
  limit: number
}

interface RateLimitSettings {
  windowMs: number
  publicLimit: number
  authenticatedIpLimit: number
  authenticatedUserLimit: number
  expensivePublicLimit: number
  expensiveAuthenticatedIpLimit: number
  expensiveAuthenticatedUserLimit: number
}

const DEFAULT_SETTINGS: RateLimitSettings = {
  windowMs: 60_000,
  publicLimit: 120,
  authenticatedIpLimit: 300,
  authenticatedUserLimit: 300,
  expensivePublicLimit: 10,
  expensiveAuthenticatedIpLimit: 30,
  expensiveAuthenticatedUserLimit: 30,
}

const MAX_MEMORY_BUCKETS = 20_000
const REDIS_TIMEOUT_MS = 1_500

const INCREMENT_FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  ttl = tonumber(ARGV[1])
  redis.call('PEXPIRE', KEYS[1], ttl)
end
return {count, ttl}
`

/** Process-local store used only outside production and by unit tests. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitCounter>()

  async increment(key: string, windowMs: number, now: number): Promise<RateLimitCounter> {
    let bucket = this.buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      if (this.buckets.size >= MAX_MEMORY_BUCKETS) {
        for (const [existingKey, existingBucket] of this.buckets) {
          if (existingBucket.resetAt <= now) this.buckets.delete(existingKey)
        }
      }

      if (this.buckets.size >= MAX_MEMORY_BUCKETS) {
        throw new Error('Rate limit memory capacity reached')
      }

      bucket = { count: 0, resetAt: now + windowMs }
    }

    bucket.count += 1
    this.buckets.set(key, bucket)
    return { ...bucket }
  }
}

/** Upstash's REST endpoint accepts Redis commands over HTTPS without a client dependency. */
export class UpstashRestRateLimitStore implements RateLimitStore {
  private readonly endpoint: string

  constructor(
    endpoint: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch
  ) {
    const parsedEndpoint = new URL(endpoint)
    if (parsedEndpoint.protocol !== 'https:') {
      throw new Error('Redis REST endpoint must use HTTPS')
    }

    this.endpoint = parsedEndpoint.toString().replace(/\/+$/, '')
  }

  async increment(key: string, windowMs: number, now: number): Promise<RateLimitCounter> {
    const response = await this.fetcher(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
          'EVAL',
          INCREMENT_FIXED_WINDOW_SCRIPT,
          '1',
          key,
          String(windowMs),
      ]),
      cache: 'no-store',
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    })

    if (!response.ok) throw new Error('Redis rate limit request failed')

    const payload = await response.json() as { result?: unknown; error?: unknown }
    if (payload.error || !Array.isArray(payload.result) || payload.result.length !== 2) {
      throw new Error('Redis returned an invalid rate limit response')
    }

    const count = Number(payload.result[0])
    const ttlMs = Number(payload.result[1])
    if (!Number.isSafeInteger(count) || count < 1 || !Number.isFinite(ttlMs) || ttlMs < 0) {
      throw new Error('Redis returned an invalid rate limit counter')
    }

    return { count, resetAt: now + ttlMs }
  }
}

const localStore = new MemoryRateLimitStore()
let cachedRedisStore: { endpoint: string; token: string; store: UpstashRestRateLimitStore } | null = null

/**
 * Apply global API limits. All Redis failures fail closed in production; local
 * development and test environments use a bounded process-local fallback.
 */
export async function checkApiRateLimit(
  request: NextRequest,
  options: ApiRateLimitOptions = {}
): Promise<ApiRateLimitDecision> {
  const emptyDecision = { response: null, headers: new Headers() }
  if (!request.nextUrl.pathname.startsWith('/api/')) return emptyDecision

  const env = options.env ?? getRuntimeEnvironment()
  const now = options.now?.() ?? Date.now()
  const settings = getSettings(env)
  const clientIp = getClientIp(request)
  const userId = await getVerifiedAccessUserId(
    request.cookies.get('session')?.value,
    env.JWT_SECRET,
    now
  )
  const expensive = isExpensiveRequest(request)

  const ipHash = await sha256(clientIp)
  const policies: RateLimitPolicy[] = userId
    ? [
        {
          key: `ip:authenticated:${ipHash}`,
          limit: settings.authenticatedIpLimit,
        },
        {
          key: `user:${await sha256(userId)}`,
          limit: settings.authenticatedUserLimit,
        },
      ]
    : [{ key: `ip:public:${ipHash}`, limit: settings.publicLimit }]

  if (expensive) {
    policies.push(
      userId
        ? {
            key: `ip:expensive:authenticated:${ipHash}`,
            limit: settings.expensiveAuthenticatedIpLimit,
          }
        : {
            key: `ip:expensive:public:${ipHash}`,
            limit: settings.expensivePublicLimit,
          }
    )

    if (userId) {
      policies.push({
        key: `user:expensive:${await sha256(userId)}`,
        limit: settings.expensiveAuthenticatedUserLimit,
      })
    }
  }

  const store = options.store ?? getStore(env)
  if (!store) return { response: rateLimitUnavailable(), headers: new Headers() }

  let counters: RateLimitCounter[]
  try {
    counters = await Promise.all(
      policies.map(({ key }) => store.increment(`forumkg:api-rate:v1:${key}`, settings.windowMs, now))
    )
  } catch {
    if (options.store || env.NODE_ENV === 'production' || store === localStore) {
      return { response: rateLimitUnavailable(), headers: new Headers() }
    }

    // Redis fallback outside production remains bounded and process-local.
    try {
      counters = await Promise.all(
        policies.map(({ key }) => localStore.increment(`forumkg:api-rate:v1:${key}`, settings.windowMs, now))
      )
    } catch {
      return { response: rateLimitUnavailable(), headers: new Headers() }
    }
  }

  const results = policies.map((policy, index) => ({
    ...policy,
    ...counters[index],
    remaining: Math.max(0, policy.limit - counters[index].count),
    resetInSeconds: Math.max(1, Math.ceil((counters[index].resetAt - now) / 1000)),
  }))
  const mostRestrictive = results.reduce((selected, current) =>
    current.remaining / current.limit < selected.remaining / selected.limit ? current : selected
  )

  const headers = new Headers({
    'RateLimit-Limit': String(mostRestrictive.limit),
    'RateLimit-Remaining': String(mostRestrictive.remaining),
    'RateLimit-Reset': String(mostRestrictive.resetInSeconds),
  })

  const exceeded = results.filter(({ count, limit }) => count > limit)
  if (exceeded.length > 0) {
    const retryAfter = Math.max(...exceeded.map(({ resetInSeconds }) => resetInSeconds))
    headers.set('RateLimit-Remaining', '0')
    headers.set('Retry-After', String(retryAfter))

    const response = NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Слишком много запросов. Попробуйте позже',
        },
      },
      { status: 429, headers }
    )
    response.headers.set('Cache-Control', 'no-store')
    return { response, headers }
  }

  return { response: null, headers }
}

/** Trust only platform IP metadata; never use a client-supplied X-Forwarded-For chain. */
export function getClientIp(request: NextRequest): string {
  const platformIp = (request as NextRequest & { ip?: string }).ip
  const trustedIp = normalizeIp(platformIp) ?? normalizeIp(request.headers.get('x-real-ip') ?? undefined)
  return trustedIp ? `ip:${trustedIp}` : 'ip:unknown'
}

export function isExpensiveRequest(request: NextRequest): boolean {
  const pathname = request.nextUrl.pathname
  const method = request.method.toUpperCase()

  if (
    method === 'POST' &&
    /^\/api\/v1\/auth\/phone\/(?:request-otp|verify-otp)$/.test(pathname)
  ) {
    return true
  }

  if (method === 'POST' && pathname === '/api/v1/auth/refresh') return true
  if (pathname === '/api/v1/health' && request.nextUrl.searchParams.get('check') !== 'live') return true

  return false
}

function getStore(env: Readonly<Record<string, string | undefined>>): RateLimitStore | null {
  const endpoint = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN

  if (!endpoint || !token) return localStore // Используем memory store если нет Redis

  if (!cachedRedisStore || cachedRedisStore.endpoint !== endpoint || cachedRedisStore.token !== token) {
    try {
      cachedRedisStore = {
        endpoint,
        token,
        store: new UpstashRestRateLimitStore(endpoint, token),
      }
    } catch {
      return null
    }
  }

  return cachedRedisStore.store
}

function getRuntimeEnvironment(): Readonly<Record<string, string | undefined>> {
  // Keep direct property references so Next can expose configured Edge variables.
  return {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    API_RATE_LIMIT_WINDOW_MS: process.env.API_RATE_LIMIT_WINDOW_MS,
    API_RATE_LIMIT_PUBLIC_LIMIT: process.env.API_RATE_LIMIT_PUBLIC_LIMIT,
    API_RATE_LIMIT_AUTH_IP_LIMIT: process.env.API_RATE_LIMIT_AUTH_IP_LIMIT,
    API_RATE_LIMIT_AUTH_USER_LIMIT: process.env.API_RATE_LIMIT_AUTH_USER_LIMIT,
    API_RATE_LIMIT_EXPENSIVE_PUBLIC_LIMIT: process.env.API_RATE_LIMIT_EXPENSIVE_PUBLIC_LIMIT,
    API_RATE_LIMIT_EXPENSIVE_AUTH_IP_LIMIT: process.env.API_RATE_LIMIT_EXPENSIVE_AUTH_IP_LIMIT,
    API_RATE_LIMIT_EXPENSIVE_AUTH_USER_LIMIT: process.env.API_RATE_LIMIT_EXPENSIVE_AUTH_USER_LIMIT,
  }
}

function getSettings(env: Readonly<Record<string, string | undefined>>): RateLimitSettings {
  return {
    windowMs: readPositiveInteger(env.API_RATE_LIMIT_WINDOW_MS, DEFAULT_SETTINGS.windowMs, 1_000, 3_600_000),
    publicLimit: readPositiveInteger(env.API_RATE_LIMIT_PUBLIC_LIMIT, DEFAULT_SETTINGS.publicLimit, 1, 100_000),
    authenticatedIpLimit: readPositiveInteger(env.API_RATE_LIMIT_AUTH_IP_LIMIT, DEFAULT_SETTINGS.authenticatedIpLimit, 1, 100_000),
    authenticatedUserLimit: readPositiveInteger(env.API_RATE_LIMIT_AUTH_USER_LIMIT, DEFAULT_SETTINGS.authenticatedUserLimit, 1, 100_000),
    expensivePublicLimit: readPositiveInteger(env.API_RATE_LIMIT_EXPENSIVE_PUBLIC_LIMIT, DEFAULT_SETTINGS.expensivePublicLimit, 1, 100_000),
    expensiveAuthenticatedIpLimit: readPositiveInteger(env.API_RATE_LIMIT_EXPENSIVE_AUTH_IP_LIMIT, DEFAULT_SETTINGS.expensiveAuthenticatedIpLimit, 1, 100_000),
    expensiveAuthenticatedUserLimit: readPositiveInteger(env.API_RATE_LIMIT_EXPENSIVE_AUTH_USER_LIMIT, DEFAULT_SETTINGS.expensiveAuthenticatedUserLimit, 1, 100_000),
  }
}

function readPositiveInteger(
  rawValue: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (!rawValue || !/^\d+$/.test(rawValue)) return fallback
  const value = Number(rawValue)
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback
}

function rateLimitUnavailable(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'RATE_LIMIT_UNAVAILABLE',
        message: 'Сервис временно недоступен',
      },
    },
    {
      status: 503,
      headers: {
        'Retry-After': '1',
        'Cache-Control': 'no-store',
      },
    }
  )
}

async function getVerifiedAccessUserId(
  token: string | undefined,
  secret: string | undefined,
  now: number
): Promise<string | null> {
  if (!token || !secret) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  try {
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0]))) as { alg?: unknown }
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1]))) as {
      userId?: unknown
      sessionId?: unknown
      exp?: unknown
    }
    if (
      header.alg !== 'HS256' ||
      typeof payload.userId !== 'string' ||
      payload.userId.length === 0 ||
      typeof payload.sessionId !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(now / 1000)
    ) {
      return null
    }

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      toArrayBuffer(decodeBase64Url(parts[2])),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    )

    return isValid ? payload.userId : null
  } catch {
    return null
  }
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function normalizeIp(value: string | undefined): string | null {
  if (!value) return null
  let address = value.trim().toLowerCase()
  if (address.startsWith('[') && address.endsWith(']')) address = address.slice(1, -1)
  if (!address || address.includes('%')) return null

  const ipv4 = normalizeIpv4(address)
  if (ipv4) return ipv4

  if (address.includes('.')) {
    const lastColon = address.lastIndexOf(':')
    if (lastColon < 0) return null
    const embeddedIpv4 = normalizeIpv4(address.slice(lastColon + 1))
    if (!embeddedIpv4) return null
    const octets = embeddedIpv4.split('.').map(Number)
    const high = ((octets[0] << 8) | octets[1]).toString(16)
    const low = ((octets[2] << 8) | octets[3]).toString(16)
    address = `${address.slice(0, lastColon)}:${high}:${low}`
  }

  const halves = address.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const groups = [...left, ...right]

  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null

  if (halves.length === 1) {
    if (groups.length !== 8) return null
  } else {
    const zeroGroups = 8 - groups.length
    if (zeroGroups < 1) return null
    groups.splice(left.length, 0, ...Array.from({ length: zeroGroups }, () => '0'))
  }

  return `v6:${groups.map((group) => Number.parseInt(group, 16).toString(16).padStart(4, '0')).join(':')}`
}

function normalizeIpv4(address: string): string | null {
  const octets = address.split('.')
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet))) return null

  const values = octets.map(Number)
  if (values.some((octet) => octet < 0 || octet > 255)) return null
  return `v4:${values.join('.')}`
}
