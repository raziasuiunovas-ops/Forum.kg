/**
 * Password Reset Rate Limiting
 * Protection against abuse of password reset functionality
 */

import { prisma } from '@/lib/db'
import { normalizeEmail } from './password'

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_REQUESTS_PER_IP = 5 // Max 5 requests per IP per 15 minutes
const MAX_REQUESTS_PER_EMAIL = 3 // Max 3 requests per email per 15 minutes
const MIN_INTERVAL_MS = 60 * 1000 // Min 60 seconds between requests for same email

// In-memory store for IP-based rate limiting (simple sliding window)
// In production, consider using Redis or Upstash for distributed rate limiting
const ipRequestStore = new Map<string, number[]>()

/**
 * Clean up expired entries from in-memory store
 */
function cleanupExpiredEntries() {
  const now = Date.now()
  const cutoff = now - RATE_LIMIT_WINDOW_MS

  for (const [ip, timestamps] of ipRequestStore.entries()) {
    const validTimestamps = timestamps.filter(t => t > cutoff)
    if (validTimestamps.length === 0) {
      ipRequestStore.delete(ip)
    } else if (validTimestamps.length < timestamps.length) {
      ipRequestStore.set(ip, validTimestamps)
    }
  }
}

/**
 * Extract client IP from request
 */
function getClientIp(request: Request): string {
  // Check common proxy headers
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  // Fallback to 'unknown' if no IP can be determined
  return 'unknown'
}

/**
 * Check if IP has exceeded rate limit
 */
function checkIpRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  cleanupExpiredEntries()

  const now = Date.now()
  const timestamps = ipRequestStore.get(ip) || []
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  const recentRequests = timestamps.filter(t => t > cutoff)

  if (recentRequests.length >= MAX_REQUESTS_PER_IP) {
    const oldestRequest = Math.min(...recentRequests)
    const retryAfterMs = oldestRequest + RATE_LIMIT_WINDOW_MS - now
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    }
  }

  // Record this request
  recentRequests.push(now)
  ipRequestStore.set(ip, recentRequests)

  return { allowed: true }
}

/**
 * Check if email has exceeded rate limit (database-based)
 */
async function checkEmailRateLimit(email: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const normalizedEmail = normalizeEmail(email)
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS)

  // Count recent password reset requests for this email
  const recentRequests = await prisma.passwordResetToken.findMany({
    where: {
      createdAt: { gte: cutoff },
      User: { email: normalizedEmail },
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })

  if (recentRequests.length >= MAX_REQUESTS_PER_EMAIL) {
    const oldestRequest = recentRequests[0].createdAt
    const retryAfterMs = oldestRequest.getTime() + RATE_LIMIT_WINDOW_MS - Date.now()
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    }
  }

  // Check minimum interval between requests
  if (recentRequests.length > 0) {
    const lastRequest = recentRequests[recentRequests.length - 1].createdAt
    const timeSinceLastRequest = Date.now() - lastRequest.getTime()

    if (timeSinceLastRequest < MIN_INTERVAL_MS) {
      const retryAfterMs = MIN_INTERVAL_MS - timeSinceLastRequest
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      }
    }
  }

  return { allowed: true }
}

/**
 * Check password reset rate limits (both IP and email)
 * Returns the most restrictive limit
 */
export async function checkPasswordResetRateLimit(
  request: Request,
  email: string
): Promise<{ allowed: boolean; reason?: 'ip' | 'email'; retryAfterSeconds?: number }> {
  // Check IP-based rate limit
  const clientIp = getClientIp(request)
  const ipCheck = checkIpRateLimit(clientIp)

  if (!ipCheck.allowed) {
    return {
      allowed: false,
      reason: 'ip',
      retryAfterSeconds: ipCheck.retryAfterSeconds,
    }
  }

  // Check email-based rate limit
  const emailCheck = await checkEmailRateLimit(email)

  if (!emailCheck.allowed) {
    return {
      allowed: false,
      reason: 'email',
      retryAfterSeconds: emailCheck.retryAfterSeconds,
    }
  }

  return { allowed: true }
}

/**
 * Clean up old password reset tokens (should be called periodically)
 */
export async function cleanupOldPasswordResetTokens(): Promise<number> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { usedAt: { not: null, lt: oneDayAgo } },
      ],
    },
  })
  return result.count
}
