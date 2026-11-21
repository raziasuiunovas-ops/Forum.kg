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
 * Prisma transaction client type for use in transactional operations
 */
type TransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

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
   * @param tx - Optional Prisma transaction client (for transactional operations)
   * @returns Session data with new refresh token
   */
  static async createSession(
    userId: string,
    metadata: SessionMetadata = {},
    tx?: TransactionClient
  ): Promise<SessionData> {
    const refreshToken = createRefreshToken(userId)
    const refreshTokenHash = hashToken(refreshToken)
    const sessionFamilyId = randomUUID()
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS)

    const create = async (client: TransactionClient) => {
      await this._lockUserSessions(client, userId)

      return client.session.create({
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
    }

    // A transaction-scoped advisory lock must share the transaction with the insert.
    const session = tx ? await create(tx) : await prisma.$transaction(create)

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
 * If reuse is detected: revoke the entire session family in the refresh transaction
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
    // Serialize all session mutations for this user before locking session rows.
    // ReadCommitted gives each statement a fresh snapshot after an advisory-lock wait.
    const outcome = await prisma.$transaction(
      async (tx) => {
        await this._lockUserSessions(tx, userId)

        // Step 2: Find and LOCK current session by token hash
        // The user lock serializes service mutations; this row lock also protects
        // against writers that do not use SessionService.
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

        // Check if family has been revoked (after acquiring the user lock)
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
          // Revoke in this transaction and return a sentinel. Throwing here would
          // roll back the security update; the caller throws after commit instead.
          await tx.session.updateMany({
            where: {
              userId,
              sessionFamilyId: currentSession.sessionFamilyId,
              revokedAt: null,
            },
            data: {
              revokedAt: now,
              revokedReason: 'SUSPICIOUS_ACTIVITY',
            },
          })

          return {
            kind: 'reuse' as const,
            sessionFamilyId: currentSession.sessionFamilyId,
          }
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
          kind: 'success' as const,
          sessionData: {
            sessionId: newSession.id,
            userId: newSession.userId,
            refreshToken: newRefreshToken,
            expiresAt: newSession.expiresAt,
          },
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 10000, // 10 seconds
      }
    )

    if (outcome.kind === 'reuse') {
      throw createAuthError('INVALID_TOKEN', {
        reason: 'token_reuse_detected',
        sessionFamilyId: outcome.sessionFamilyId,
      })
    }

    return outcome.sessionData
  }

  /**
   * Serialize every session mutation for one user with a transaction-scoped
   * PostgreSQL lock. Hashing stays in PostgreSQL to avoid JS bigint precision loss.
   */
  private static async _lockUserSessions(
    tx: TransactionClient,
    userId: string
  ): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`
  }

  /**
   * Logout - revoke single session
   * Uses the per-user advisory lock to prevent races with concurrent refresh
   * 
   * @param refreshToken - Current refresh token
   * @returns true if session was revoked, false if not found
   */
  static async logout(refreshToken: string): Promise<boolean> {
    // Verify JWT first
    let userId: string
    try {
      userId = verifyRefreshToken(refreshToken).userId
    } catch (error) {
      // Token invalid or expired - consider it already logged out
      return false
    }

    const tokenHash = hashToken(refreshToken)

    // Use the same user lock as refresh. If refresh wins first, revoke its new
    // child; if logout wins first, the following refresh observes the revocation.
    const result = await prisma.$transaction(async (tx) => {
      await this._lockUserSessions(tx, userId)

      const session = await tx.session.findUnique({
        where: { refreshTokenHash: tokenHash },
        select: { userId: true, sessionFamilyId: true },
      })

      if (!session || session.userId !== userId) {
        return 0
      }

      // A refresh token represents this device family across rotations.
      const updateResult = await tx.session.updateMany({
        where: {
          userId,
          sessionFamilyId: session.sessionFamilyId,
          revokedAt: null,
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
   * Uses the per-user advisory lock to prevent races with concurrent refresh
   * 
   * @param userId - User ID
   * @returns Number of sessions revoked
   */
  static async logoutAll(userId: string): Promise<number> {
    // One lock and one transaction make Logout All atomic. createSession and
    // refresh use this same lock, so there is no family-list snapshot to go stale.
    return prisma.$transaction(async (tx) => {
      await this._lockUserSessions(tx, userId)

      const result = await tx.session.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          revokedReason: 'LOGOUT_ALL',
        },
      })

      return result.count
    })
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
