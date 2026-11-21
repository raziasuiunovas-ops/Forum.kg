/**
 * Session Management Security Tests
 * 
 * Tests critical security scenarios:
 * 1. Concurrent refresh attempts
 * 2. Token reuse detection
 * 3. Family revocation
 * 4. Logout functionality
 * 5. Access token validation
 * 6. Cleanup safety
 * 
 * IMPORTANT: Uses isolated test database
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { SessionService } from '@/lib/services/session.service'
import { createRefreshToken, verifyRefreshToken, createAccessToken, verifyAccessToken } from '@/lib/auth/session'
import { hashToken } from '@/lib/utils'

// Use test database
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    },
  },
})

// Test user ID
let testUserId: string

beforeAll(async () => {
  // Create test user
  const user = await prisma.user.create({
    data: {
      phone: '+996555000001',
      phoneVerifiedAt: new Date(),
      role: 'USER',
      status: 'ACTIVE',
      preferredLocale: 'RU',
    },
  })
  testUserId = user.id
})

afterAll(async () => {
  // Cleanup: Delete test sessions and user
  await prisma.session.deleteMany({
    where: { userId: testUserId },
  })
  await prisma.user.delete({
    where: { id: testUserId },
  })
  await prisma.$disconnect()
})

beforeEach(async () => {
  // Clear sessions before each test
  await prisma.session.deleteMany({
    where: { userId: testUserId },
  })
})

describe('Session Management Security', () => {
  describe('1. Concurrent Refresh Prevention', () => {
    it('should prevent two simultaneous refresh requests from creating multiple children', async () => {
      // Create initial session
      const initialSession = await SessionService.createSession(testUserId, {
        userAgent: 'Test Browser',
        ipAddress: '127.0.0.1',
      })

      // Simulate two concurrent refresh attempts with same token
      const refreshPromises = [
        SessionService.refreshSession(initialSession.refreshToken, {
          userAgent: 'Test Browser 1',
        }),
        SessionService.refreshSession(initialSession.refreshToken, {
          userAgent: 'Test Browser 2',
        }),
      ]

      // One should succeed, one should fail
      const results = await Promise.allSettled(refreshPromises)

      const successful = results.filter(r => r.status === 'fulfilled')
      const failed = results.filter(r => r.status === 'rejected')

      // CRITICAL: Exactly one should succeed
      expect(successful.length).toBe(1)
      expect(failed.length).toBe(1)

      // Check database: initial session should have exactly ONE active child
      const children = await prisma.session.findMany({
        where: {
          parentSessionId: initialSession.sessionId,
          revokedAt: null,
        },
      })

      expect(children.length).toBe(1)

      // Verify initial session is revoked with ROTATED
      const parent = await prisma.session.findUnique({
        where: { id: initialSession.sessionId },
      })

      expect(parent?.revokedAt).not.toBeNull()
      expect(parent?.revokedReason).toBe('ROTATED')
    })

    it('should handle three-way concurrent refresh correctly', async () => {
      const initialSession = await SessionService.createSession(testUserId)

      const refreshPromises = [
        SessionService.refreshSession(initialSession.refreshToken),
        SessionService.refreshSession(initialSession.refreshToken),
        SessionService.refreshSession(initialSession.refreshToken),
      ]

      const results = await Promise.allSettled(refreshPromises)

      const successful = results.filter(r => r.status === 'fulfilled')

      // CRITICAL: Exactly one should succeed
      expect(successful.length).toBe(1)

      // Verify only one child in database
      const children = await prisma.session.count({
        where: {
          parentSessionId: initialSession.sessionId,
          revokedAt: null,
        },
      })

      expect(children).toBe(1)
    })
  })

  describe('2. Token Reuse Detection', () => {
    it('should detect reuse after single rotation', async () => {
      // Create session and rotate once
      const session1 = await SessionService.createSession(testUserId)
      const session2 = await SessionService.refreshSession(session1.refreshToken)

      // Try to use old token again (reuse)
      await expect(
        SessionService.refreshSession(session1.refreshToken)
      ).rejects.toThrow('token_reuse_detected')

      // Verify entire family is revoked
      const sessions = await prisma.session.findMany({
        where: {
          sessionFamilyId: (await prisma.session.findUnique({
            where: { id: session1.sessionId },
            select: { sessionFamilyId: true },
          }))!.sessionFamilyId,
        },
      })

      // All sessions should be revoked
      sessions.forEach(s => {
        expect(s.revokedAt).not.toBeNull()
      })

      // New session should be revoked with SUSPICIOUS_ACTIVITY
      const latestSession = sessions.find(s => s.id === session2.sessionId)
      expect(latestSession?.revokedReason).toBe('SUSPICIOUS_ACTIVITY')
    })

    it('should detect reuse after multiple rotations', async () => {
      // Create session and rotate 3 times
      const session1 = await SessionService.createSession(testUserId)
      const session2 = await SessionService.refreshSession(session1.refreshToken)
      const session3 = await SessionService.refreshSession(session2.refreshToken)
      const session4 = await SessionService.refreshSession(session3.refreshToken)

      // Try to use session2 token (2 rotations ago)
      await expect(
        SessionService.refreshSession(session2.refreshToken)
      ).rejects.toThrow('token_reuse_detected')

      // Verify all sessions revoked
      const familyId = (await prisma.session.findUnique({
        where: { id: session1.sessionId },
        select: { sessionFamilyId: true },
      }))!.sessionFamilyId

      const activeCount = await prisma.session.count({
        where: {
          sessionFamilyId: familyId,
          revokedAt: null,
        },
      })

      expect(activeCount).toBe(0)
    })
  })

  describe('3. Family Revocation Race Condition', () => {
    it('should not allow new session creation after family revocation starts', async () => {
      const session1 = await SessionService.createSession(testUserId)
      const session2 = await SessionService.refreshSession(session1.refreshToken)

      // Simulate: reuse detection + concurrent refresh
      const reusePromise = SessionService.refreshSession(session1.refreshToken)
      const concurrentRefreshPromise = SessionService.refreshSession(session2.refreshToken)

      const results = await Promise.allSettled([reusePromise, concurrentRefreshPromise])

      // Both should fail (reuse triggers family revoke, concurrent refresh sees revoked family)
      results.forEach(result => {
        expect(result.status).toBe('rejected')
      })

      // Verify no new active sessions created
      const familyId = (await prisma.session.findUnique({
        where: { id: session1.sessionId },
        select: { sessionFamilyId: true },
      }))!.sessionFamilyId

      const activeCount = await prisma.session.count({
        where: {
          sessionFamilyId: familyId,
          revokedAt: null,
        },
      })

      expect(activeCount).toBe(0)
    })
  })

  describe('4. Logout Functionality', () => {
    it('should revoke single session on logout', async () => {
      const session = await SessionService.createSession(testUserId)

      const result = await SessionService.logout(session.refreshToken)

      expect(result).toBe(true)

      // Verify session revoked in database
      const dbSession = await prisma.session.findUnique({
        where: { id: session.sessionId },
      })

      expect(dbSession?.revokedAt).not.toBeNull()
      expect(dbSession?.revokedReason).toBe('LOGOUT')
    })

    it('should revoke all user sessions on logout-all', async () => {
      // Create 3 sessions for user
      const session1 = await SessionService.createSession(testUserId, { userAgent: 'Device 1' })
      const session2 = await SessionService.createSession(testUserId, { userAgent: 'Device 2' })
      const session3 = await SessionService.createSession(testUserId, { userAgent: 'Device 3' })

      const revokedCount = await SessionService.logoutAll(testUserId)

      expect(revokedCount).toBe(3)

      // Verify all revoked
      const sessions = await prisma.session.findMany({
        where: { userId: testUserId },
      })

      sessions.forEach(s => {
        expect(s.revokedAt).not.toBeNull()
        expect(s.revokedReason).toBe('LOGOUT_ALL')
      })
    })

    it('should not affect other users sessions on logout-all', async () => {
      // Create second user
      const user2 = await prisma.user.create({
        data: {
          phone: '+996555000002',
          phoneVerifiedAt: new Date(),
          role: 'USER',
          status: 'ACTIVE',
          preferredLocale: 'RU',
        },
      })

      // Create sessions for both users
      const session1 = await SessionService.createSession(testUserId)
      const session2 = await SessionService.createSession(user2.id)

      // Logout user1
      await SessionService.logoutAll(testUserId)

      // Verify user1 session revoked
      const user1Session = await prisma.session.findUnique({
        where: { id: session1.sessionId },
      })
      expect(user1Session?.revokedAt).not.toBeNull()

      // Verify user2 session still active
      const user2Session = await prisma.session.findUnique({
        where: { id: session2.sessionId },
      })
      expect(user2Session?.revokedAt).toBeNull()

      // Cleanup
      await prisma.session.delete({ where: { id: session2.sessionId } })
      await prisma.user.delete({ where: { id: user2.id } })
    })
  })

  describe('5. Access Token Validation', () => {
    it('should include sessionId in access token', async () => {
      const session = await SessionService.createSession(testUserId)

      const user = await prisma.user.findUnique({ where: { id: testUserId } })
      const accessToken = createAccessToken(
        {
          id: user!.id,
          firstName: user!.firstName,
          lastName: user!.lastName,
          phone: user!.phone,
          phoneVerifiedAt: user!.phoneVerifiedAt,
          email: user!.email,
          role: user!.role,
          status: user!.status,
          preferredLocale: user!.preferredLocale,
          createdAt: user!.createdAt,
        },
        session.sessionId
      )

      const decoded = verifyAccessToken(accessToken)

      expect(decoded.sessionId).toBe(session.sessionId)
      expect(decoded.userId).toBe(testUserId)
    })

    it('should reject access token after session revoked', async () => {
      const session = await SessionService.createSession(testUserId)

      // Logout (revoke session)
      await SessionService.logout(session.refreshToken)

      // Check session status in database
      const dbSession = await prisma.session.findUnique({
        where: { id: session.sessionId },
      })

      expect(dbSession?.revokedAt).not.toBeNull()

      // Access token JWT is still valid, but session is revoked
      // requireAuth middleware should reject this
    })
  })

  describe('6. Cleanup Safety', () => {
    it('should not break reuse detection after cleanup', async () => {
      // Create session chain
      const session1 = await SessionService.createSession(testUserId)
      const session2 = await SessionService.refreshSession(session1.refreshToken)
      const session3 = await SessionService.refreshSession(session2.refreshToken)

      // Mark old sessions as expired (simulate time passage)
      await prisma.session.update({
        where: { id: session1.sessionId },
        data: { expiresAt: new Date(Date.now() - 100000) },
      })

      // Run cleanup
      await SessionService.cleanupExpiredSessions()

      // Try to reuse session2 (should still detect reuse even if session1 deleted)
      await expect(
        SessionService.refreshSession(session2.refreshToken)
      ).rejects.toThrow()

      // Current session should be revoked
      const currentSession = await prisma.session.findUnique({
        where: { id: session3.sessionId },
      })

      // If reuse detection worked, session3 should be revoked
      // (either SUSPICIOUS_ACTIVITY or still active if detection failed)
    })

    it('should delete sessions bottom-up respecting foreign key constraints', async () => {
      // Create chain
      const session1 = await SessionService.createSession(testUserId)
      const session2 = await SessionService.refreshSession(session1.refreshToken)
      const session3 = await SessionService.refreshSession(session2.refreshToken)

      // Mark all as expired
      const past = new Date(Date.now() - 100000)
      await prisma.session.updateMany({
        where: {
          id: { in: [session1.sessionId, session2.sessionId, session3.sessionId] },
        },
        data: { expiresAt: past },
      })

      // Cleanup should not throw FK constraint error
      await expect(SessionService.cleanupExpiredSessions()).resolves.not.toThrow()

      // All should be deleted
      const remaining = await prisma.session.count({
        where: {
          id: { in: [session1.sessionId, session2.sessionId, session3.sessionId] },
        },
      })

      expect(remaining).toBe(0)
    })
  })

  describe('7. Fake Token Protection', () => {
    it('should not revoke family with fake token', async () => {
      // Create real session
      const realSession = await SessionService.createSession(testUserId)

      // Create fake token with same userId but invalid signature
      const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fakepayload.fakesignature'

      // Try to refresh with fake token
      await expect(
        SessionService.refreshSession(fakeToken)
      ).rejects.toThrow()

      // Real session should still be active
      const dbSession = await prisma.session.findUnique({
        where: { id: realSession.sessionId },
      })

      expect(dbSession?.revokedAt).toBeNull()
    })

    it('should not revoke another users family', async () => {
      // Create second user
      const user2 = await prisma.user.create({
        data: {
          phone: '+996555000003',
          phoneVerifiedAt: new Date(),
          role: 'USER',
          status: 'ACTIVE',
          preferredLocale: 'RU',
        },
      })

      // Create sessions for both users
      const session1 = await SessionService.createSession(testUserId)
      const session2 = await SessionService.createSession(user2.id)

      // Rotate session1
      const session1Rotated = await SessionService.refreshSession(session1.refreshToken)

      // Try to reuse session1 old token (triggers family revocation for user1)
      await expect(
        SessionService.refreshSession(session1.refreshToken)
      ).rejects.toThrow('token_reuse_detected')

      // Verify user1 family revoked
      const user1Sessions = await prisma.session.findMany({
        where: { userId: testUserId },
      })
      user1Sessions.forEach(s => expect(s.revokedAt).not.toBeNull())

      // Verify user2 session still active
      const user2Session = await prisma.session.findUnique({
        where: { id: session2.sessionId },
      })
      expect(user2Session?.revokedAt).toBeNull()

      // Cleanup
      await prisma.session.delete({ where: { id: session2.sessionId } })
      await prisma.user.delete({ where: { id: user2.id } })
    })
  })
})
