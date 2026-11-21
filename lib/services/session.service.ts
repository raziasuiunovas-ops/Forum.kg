/**
 * Session Management Service for FORUM.KG
 * 
 * Implements PostgreSQL-based session management with:
 * - Refresh token rotation
 * - Reuse detection via session families
 * - Logout single device & logout all devices
 * - Concurrent request handling with retry logic
 * 
 * @architecture
 * Sessions are organized into families tracked by `sessionFamilyId`.
 * Each rotation increments `generationNumber` and sets `parentSessionId`.
 * When reuse is detected (old token used after rotation), the entire family is revoked.
 */

import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { hashToken } from '@/lib/utils'
import { verifyRefreshToken, createRefreshToken } from '@/lib/auth/session'
import { createAuthError } from '@/lib/auth/errors'

/**
 * Session metadata for creation
 */
export interface SessionMetadata {
  userAgent?: string
  ipAddress?: string
}

/**
 * Session data returned after creation/rotation
 */
export interface SessionData {
  sessionId: string
  userId: string
  refreshToken: string
  expiresAt: Date
}

/**
 * Retry configuration for concurrent operations
 */
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 50,
  EXPONENTIAL_FACTOR: 2,
} as const

/**
 * Session expiry duration (7 days)
 */
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

/**
 * SessionService - Manages database-backed refresh token sessions
 */
export class SessionService {
  /**
   * Create a new session for user login
   * 
   * @param userId - User ID
   * @param metadata - Optional session metadata (userAgent, ipAddress)
   * @returns Session data with new refresh token
   */
  static async createSession(
    userId: string,
    metadata: SessionMetadata = {}
  ): Promise<SessionData> {
    const refreshToken = createRefreshToken(userId)
    const refreshTokenHash = hashToken(refreshToken)
    const sessionFamilyId = randomUUID()
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS)

    const session = await prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        sessionFamilyId,
        generationNumber: 0,
        expiresAt,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
      },
    })

    return {
      sessionId: session.id,
      userId: session.userId,
      refreshToken,
      expiresAt: session.expiresAt,
    }
  }

  /**
   * Refresh session with token rotation and reuse detection
   * 
   * Algorithm:
   * 1. Verify JWT signature and expiry
   * 2. Find current session by token hash
   * 3. Check session validity (not revoked, not expired)
   * 4. Detect reuse via parent-child relationship
   * 5. Create new rotated session
   * 6. Revoke old session with reason ROTATED
   * 7. Return new refresh token
   * 
   * If reuse detected: revoke entire session family in separate transaction
   * 
   * @param currentRefreshToken - Current refresh token from cookie
   * @param metadata - Optional session metadata
   * @returns New session data with rotated token
   * @throws AuthError if token invalid, session revoked, or reuse detected
   */
  static async refreshSession(
    currentRefreshToken: string,
    metadata: SessionMetadata = {}
  ): Promise<SessionData> {
    // Step 1: Verify JWT signature and expiry BEFORE database queries
    let userId: string
    try {
      const decoded = verifyRefreshToken(currentRefreshToken)
      userId = decoded.userId
    } catch (error) {
      // JWT verification failed - invalid signature or expired
      throw error
    }

    const tokenHash = hashToken(currentRefreshToken)

    // Retry logic for concurrent refresh scenarios
    for (let attempt = 0; attempt < RETRY_CONFIG.MAX_ATTEMPTS; attempt++) {
      try {
        return await this._attemptRefresh(userId, tokenHash, metadata)
      } catch (error) {
        // Check if error is retryable (race condition)
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2034') &&
          attempt < RETRY_CONFIG.MAX_ATTEMPTS - 1
        ) {
          // Exponential backoff
          const delayMs = RETRY_CONFIG.BASE_DELAY_MS * Math.pow(RETRY_CONFIG.EXPONENTIAL_FACTOR, attempt)
          await new Promise(resolve => setTimeout(resolve, delayMs))
          continue
        }

        // Non-retryable error or max attempts reached
        throw error
      }
    }

    // Should never reach here, but TypeScript needs return
    throw new Error('Refresh failed after max retry attempts')
  }

  /**
   * Attempt to refresh session (single try, used in retry loop)
   */
  private static async _attemptRefresh(
    userId: string,
    tokenHash: string,
    metadata: SessionMetadata
  ): Promise<SessionData> {
    // Use Serializable isolation + SELECT FOR UPDATE for concurrent safety
    return await prisma.$transaction(
      async (tx) => {
        // Step 2: Find and LOCK current session by token hash
        // SELECT FOR UPDATE prevents concurrent transactions from reading/modifying this row
        const sessions = await tx.$queryRaw<Array<{
          id: string
          userId: string
          refreshTokenHash: string
          userAgent: string | null
          ipAddress: string | null
          createdAt: Date
          expiresAt: Date
          lastUsedAt: Date
          revokedAt: Date | null
          revokedReason: string | null
          sessionFamilyId: string
          generationNumber: number
          parentSessionId: string | null
        }>>`
          SELECT * FROM "Session"
          WHERE "refreshTokenHash" = ${tokenHash}
          FOR UPDATE
        `

        if (sessions.length === 0) {
          throw createAuthError('INVALID_TOKEN')
        }

        const currentSession = sessions[0]

        // Acquire advisory lock on session family to prevent race with family revocation
        // Lock number is derived from sessionFamilyId hash
        const familyLockId = this._getFamilyLockId(currentSession.sessionFamilyId)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${familyLockId})`

        // Check if family has been revoked (after acquiring lock)
        const activeFamilyMembers = await tx.session.count({
          where: {
            sessionFamilyId: currentSession.sessionFamilyId,
            revokedAt: null,
          },
        })

        // If no active members in family, it means family was revoked
        // (current session should be revoked, but check anyway)
        if (activeFamilyMembers === 0) {
          throw createAuthError('INVALID_TOKEN', {
            reason: 'family_revoked',
            sessionFamilyId: currentSession.sessionFamilyId,
          })
        }

        // Verify userId matches (should never fail if JWT valid)
        if (currentSession.userId !== userId) {
          throw createAuthError('INVALID_TOKEN')
        }

        // Step 3: Check session validity
        const now = new Date()

        if (currentSession.expiresAt < now) {
          throw createAuthError('SESSION_EXPIRED')
        }

        // Step 4: Detect reuse
        // Check if this session has EVER been rotated (has ANY child, active or revoked)
        const allChildren = await tx.session.findMany({
          where: {
            parentSessionId: currentSession.id,
          },
          select: { id: true, revokedAt: true },
        })

        if (allChildren.length > 0) {
          // This session was rotated - using it again is REUSE
          // Revoke family in separate committed transaction
          await this._revokeFamilyCommitted(currentSession.sessionFamilyId)
          throw createAuthError('INVALID_TOKEN', {
            reason: 'token_reuse_detected',
            sessionFamilyId: currentSession.sessionFamilyId,
          })
        }

        // Additional check: if session is already revoked for any reason, deny
        if (currentSession.revokedAt) {
          throw createAuthError('INVALID_TOKEN', {
            reason: currentSession.revokedReason || 'session_revoked',
          })
        }

        // Step 5: Create new rotated session
        const newRefreshToken = createRefreshToken(userId)
        const newTokenHash = hashToken(newRefreshToken)
        const newExpiresAt = new Date(Date.now() + SESSION_EXPIRY_MS)

        const newSession = await tx.session.create({
          data: {
            userId,
            refreshTokenHash: newTokenHash,
            sessionFamilyId: currentSession.sessionFamilyId,
            generationNumber: currentSession.generationNumber + 1,
            parentSessionId: currentSession.id,
            expiresAt: newExpiresAt,
            userAgent: metadata.userAgent || currentSession.userAgent,
            ipAddress: metadata.ipAddress || currentSession.ipAddress,
          },
        })

        // Step 6: Revoke old session with ROTATED reason
        await tx.session.update({
          where: { id: currentSession.id },
          data: {
            revokedAt: now,
            revokedReason: 'ROTATED',
            lastUsedAt: now,
          },
        })

        // Step 7: Return new session data
        return {
          sessionId: newSession.id,
          userId: newSession.userId,
          refreshToken: newRefreshToken,
          expiresAt: newSession.expiresAt,
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000, // 10 seconds
      }
    )
  }

  /**
   * Generate consistent lock ID from session family UUID
   * PostgreSQL advisory locks use bigint, so we hash UUID to number
   */
  private static _getFamilyLockId(sessionFamilyId: string): number {
    // Simple hash: take first 8 bytes of UUID and convert to number
    // Remove dashes and take first 15 hex chars (to fit in JS safe integer)
    const hex = sessionFamilyId.replace(/-/g, '').substring(0, 15)
    return parseInt(hex, 16)
  }

  /**
   * Revoke entire session family in separate committed transaction
   * 
   * This prevents rollback from canceling security revocations.
   * Called when token reuse is detected.
   * 
   * NOTE: Does NOT acquire advisory lock - assumes caller already holds it
   * or revocation happens outside refresh flow (e.g. admin action).
   */
  private static async _revokeFamilyCommitted(sessionFamilyId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Revoke all active sessions in family
      // Do NOT acquire lock here - would cause self-deadlock if called from _attemptRefresh
      await tx.session.updateMany({
        where: {
          sessionFamilyId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          revokedReason: 'SUSPICIOUS_ACTIVITY',
        },
      })
    })
  }

  /**
   * Logout - revoke single session
   * Uses advisory lock to prevent race with concurrent refresh
   * 
   * @param refreshToken - Current refresh token
   * @returns true if session was revoked, false if not found
   */
  static async logout(refreshToken: string): Promise<boolean> {
    // Verify JWT first
    try {
      verifyRefreshToken(refreshToken)
    } catch (error) {
      // Token invalid or expired - consider it already logged out
      return false
    }

    const tokenHash = hashToken(refreshToken)

    // Use transaction with advisory lock for synchronization
    const result = await prisma.$transaction(async (tx) => {
      // Find session to get familyId for locking
      const session = await tx.session.findUnique({
        where: { refreshTokenHash: tokenHash },
        select: { sessionFamilyId: true },
      })

      if (!session) {
        return 0
      }

      // Acquire family lock to prevent concurrent refresh
      const familyLockId = this._getFamilyLockId(session.sessionFamilyId)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${familyLockId})`

      // Revoke the session
      const updateResult = await tx.session.updateMany({
        where: {
          refreshTokenHash: tokenHash,
          revokedAt: null, // Only revoke if not already revoked
        },
        data: {
          revokedAt: new Date(),
          revokedReason: 'LOGOUT',
        },
      })

      return updateResult.count
    })

    return result > 0
  }

  /**
   * Logout all devices - revoke all sessions for user
   * Uses advisory locks for each family to prevent race with concurrent refresh
   * 
   * @param userId - User ID
   * @returns Number of sessions revoked
   */
  static async logoutAll(userId: string): Promise<number> {
    // Get all unique session families for this user
    const families = await prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      select: {
        sessionFamilyId: true,
      },
      distinct: ['sessionFamilyId'],
    })

    let totalRevoked = 0

    // Revoke each family with proper locking
    for (const { sessionFamilyId } of families) {
      const revoked = await prisma.$transaction(async (tx) => {
        // Acquire family lock
        const familyLockId = this._getFamilyLockId(sessionFamilyId)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${familyLockId})`

        // Revoke all sessions in this family for this user
        const result = await tx.session.updateMany({
          where: {
            userId,
            sessionFamilyId,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
            revokedReason: 'LOGOUT_ALL',
          },
        })

        return result.count
      })

      totalRevoked += revoked
    }

    return totalRevoked
  }

  /**
   * Get active sessions for user (for debugging/admin)
   * 
   * @param userId - User ID
   * @returns Array of active sessions
   */
  static async getActiveSessions(userId: string) {
    return await prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
        sessionFamilyId: true,
        generationNumber: true,
      },
    })
  }

  /**
   * Cleanup expired sessions (cron job)
   * 
   * Deletes sessions in bottom-up order (children first, then parents)
   * to respect RESTRICT constraint on parentSessionId.
   * 
   * Deletes sessions that are:
   * - Expired (expiresAt < now)
   * - Revoked and older than 30 days
   * 
   * Preserves recent revoked sessions for reuse detection.
   * 
   * @returns Number of sessions deleted
   */
  static async cleanupExpiredSessions(): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const now = new Date()

    let totalDeleted = 0

    // Delete in loop until no more sessions to delete
    // Each iteration deletes leaf sessions (no active children)
    let deletedInIteration = 0
    do {
      const result = await prisma.$executeRaw`
        DELETE FROM "Session"
        WHERE "id" IN (
          SELECT s."id"
          FROM "Session" s
          WHERE (
            -- Expired sessions
            s."expiresAt" < ${now}
            OR
            -- Old revoked sessions (but keep recent ones for reuse detection)
            (s."revokedAt" IS NOT NULL AND s."revokedAt" < ${thirtyDaysAgo})
          )
          -- Only delete if no active children reference this session
          AND NOT EXISTS (
            SELECT 1 FROM "Session" child
            WHERE child."parentSessionId" = s."id"
          )
          LIMIT 1000
        )
      `

      deletedInIteration = Number(result)
      totalDeleted += deletedInIteration

      // Break if nothing deleted or reasonable iteration limit
      if (deletedInIteration === 0 || totalDeleted > 100000) {
        break
      }
    } while (deletedInIteration > 0)

    return totalDeleted
  }
}
