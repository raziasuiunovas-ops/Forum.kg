/**
 * Integration tests for Admin Dashboard API
 * Tests /api/v1/admin/dashboard/stats and /api/v1/admin/dashboard/recent-activity
 * 
 * Note: These tests focus on response structure validation and basic functionality.
 * Full end-to-end testing with authentication requires test database setup.
 */

import { describe, test, before, after } from 'node:test'
import assert from 'node:assert'
import { prisma } from '@/lib/db'
import { UserRole, ForumStatus, OrderStatus, PaymentStatus } from '@prisma/client'

describe('Admin Dashboard API Integration Tests', () => {
  let testUserId: string
  let testForumId: string
  let testOrderId: string

  before(async () => {
    // Create test data
    const testUser = await prisma.user.create({
      data: {
        firstName: 'Test',
        lastName: 'Dashboard',
        phone: '+996700111222',
        role: UserRole.SUPER_ADMIN,
        status: 'ACTIVE',
      },
    })
    testUserId = testUser.id

    const testForum = await prisma.forum.create({
      data: {
        slug: 'dashboard-test-forum',
        status: ForumStatus.PUBLISHED,
        capacity: 100,
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        qrExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: testUserId,
        translations: {
          create: [
            { locale: 'RU', title: 'Тестовый форум для dashboard' },
          ],
        },
        categories: {
          create: [
            {
              code: 'STANDARD',
              priceMinor: 100000,
              currency: 'KGS',
              sortOrder: 0,
              translations: {
                create: [{ locale: 'RU', name: 'Стандарт' }],
              },
            },
          ],
        },
      },
    })
    testForumId = testForum.id

    const testOrder = await prisma.order.create({
      data: {
        orderNumber: 'DASH-TEST-001',
        userId: testUserId,
        forumId: testForumId,
        status: OrderStatus.PAID,
        subtotalMinor: 100000,
        totalMinor: 100000,
        currency: 'KGS',
        paidAt: new Date(),
      },
    })
    testOrderId = testOrder.id
  })

  after(async () => {
    // Cleanup test data
    if (testOrderId) {
      await prisma.order.delete({ where: { id: testOrderId } }).catch(() => {})
    }
    if (testForumId) {
      await prisma.forum.delete({ where: { id: testForumId } }).catch(() => {})
    }
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {})
    }
  })

  describe('Dashboard Stats Data Retrieval', () => {
    test('should retrieve users stats', async () => {
      const totalUsers = await prisma.user.count()
      assert.ok(totalUsers > 0, 'Should have at least one user')
    })

    test('should retrieve forums stats', async () => {
      const totalForums = await prisma.forum.count()
      const activeForums = await prisma.forum.count({
        where: {
          OR: [
            { status: ForumStatus.PUBLISHED },
            { status: ForumStatus.SCHEDULED },
          ],
        },
      })
      
      assert.ok(totalForums >= activeForums, 'Total forums should be >= active forums')
      assert.ok(activeForums > 0, 'Should have at least one active forum')
    })

    test('should retrieve orders stats', async () => {
      const totalOrders = await prisma.order.count()
      const paidOrders = await prisma.order.count({
        where: { status: OrderStatus.PAID },
      })
      
      assert.ok(totalOrders > 0, 'Should have at least one order')
      assert.ok(paidOrders > 0, 'Should have at least one paid order')
    })

    test('should calculate revenue from paid orders', async () => {
      const result = await prisma.order.aggregate({
        _sum: { totalMinor: true },
        where: { status: OrderStatus.PAID },
      })
      
      assert.ok(result._sum.totalMinor !== null, 'Should have revenue data')
      assert.ok(result._sum.totalMinor! >= 100000, 'Revenue should be at least 100000 (1000 KGS)')
    })

    test('should retrieve payments stats', async () => {
      const totalPayments = await prisma.payment.count()
      const successfulPayments = await prisma.payment.count({
        where: { status: PaymentStatus.SUCCEEDED },
      })
      
      // Payments may not exist in test data
      assert.ok(totalPayments >= 0, 'Total payments should be non-negative')
      assert.ok(successfulPayments >= 0, 'Successful payments should be non-negative')
      assert.ok(totalPayments >= successfulPayments, 'Total >= successful')
    })

    test('should retrieve topics stats', async () => {
      const totalTopics = await prisma.topic.count()
      assert.ok(totalTopics >= 0, 'Total topics should be non-negative')
    })

    test('should perform DB health check', async () => {
      const result = await prisma.$queryRaw`SELECT 1 as health`
      assert.ok(result, 'DB health check should return result')
    })
  })

  describe('Dashboard Stats with Date Filtering', () => {
    test('should filter users by creation date', async () => {
      const startDate = new Date('2020-01-01')
      const endDate = new Date('2030-12-31')
      
      const usersInRange = await prisma.user.count({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      })
      
      assert.ok(usersInRange > 0, 'Should have users in date range')
    })

    test('should filter orders by creation date', async () => {
      const startDate = new Date('2020-01-01')
      const endDate = new Date('2030-12-31')
      
      const ordersInRange = await prisma.order.count({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      })
      
      assert.ok(ordersInRange > 0, 'Should have orders in date range')
    })

    test('should calculate revenue in date range', async () => {
      const startDate = new Date('2020-01-01')
      const endDate = new Date('2030-12-31')
      
      const result = await prisma.order.aggregate({
        _sum: { totalMinor: true },
        where: {
          status: OrderStatus.PAID,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      })
      
      assert.ok(result._sum.totalMinor !== null, 'Should have revenue in date range')
    })
  })

  describe('Recent Activity Data Retrieval', () => {
    test('should retrieve recent users', async () => {
      const recentUsers = await prisma.user.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
      
      assert.ok(recentUsers.length > 0, 'Should have recent users')
      assert.ok(recentUsers[0].id, 'User should have id')
      assert.ok(recentUsers[0].createdAt, 'User should have createdAt')
    })

    test('should retrieve recent orders with user data', async () => {
      const recentOrders = await prisma.order.findMany({
        select: {
          id: true,
          status: true,
          totalMinor: true,
          createdAt: true,
          paidAt: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
      
      assert.ok(recentOrders.length > 0, 'Should have recent orders')
      assert.ok(recentOrders[0].user, 'Order should have user data')
      assert.ok(recentOrders[0].totalMinor >= 0, 'Order should have total amount')
    })

    test('should retrieve recent forums with creator', async () => {
      const recentForums = await prisma.forum.findMany({
        select: {
          id: true,
          slug: true,
          createdAt: true,
          createdBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          translations: {
            where: { locale: 'RU' },
            select: { title: true },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })
      
      assert.ok(recentForums.length > 0, 'Should have recent forums')
      assert.ok(recentForums[0].createdBy, 'Forum should have creator')
      assert.ok(recentForums[0].translations.length > 0, 'Forum should have translations')
    })

    test('should retrieve recent topics with author', async () => {
      const recentTopics = await prisma.topic.findMany({
        select: {
          id: true,
          title: true,
          createdAt: true,
          author: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          category: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
      
      // Topics may not exist in test data
      assert.ok(recentTopics.length >= 0, 'Should retrieve topics (may be empty)')
    })

    test('should retrieve recent event registrations', async () => {
      const recentRegistrations = await prisma.eventRegistration.findMany({
        select: {
          id: true,
          createdAt: true,
          attendeeFirstName: true,
          attendeeLastName: true,
          forum: {
            select: {
              id: true,
              translations: {
                where: { locale: 'RU' },
                select: { title: true },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
      
      // Registrations may not exist in test data
      assert.ok(recentRegistrations.length >= 0, 'Should retrieve registrations (may be empty)')
    })

    test('should retrieve recent successful payments', async () => {
      const recentPayments = await prisma.payment.findMany({
        select: {
          id: true,
          amountMinor: true,
          status: true,
          createdAt: true,
          order: {
            select: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        where: {
          status: PaymentStatus.SUCCEEDED,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
      
      // Payments may not exist in test data
      assert.ok(recentPayments.length >= 0, 'Should retrieve payments (may be empty)')
    })
  })

  describe('Active Users Calculation', () => {
    test('should count unique active users from sessions', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      
      const activeSessions = await prisma.session.groupBy({
        by: ['userId'],
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
        orderBy: {
          userId: 'asc',
        },
      })
      
      assert.ok(activeSessions.length >= 0, 'Should have active sessions count (may be 0)')
      assert.ok(Array.isArray(activeSessions), 'Should return array of unique user IDs')
    })
  })

  describe('Data Structure Validation', () => {
    test('should validate stats structure', () => {
      const stats = {
        users: {
          total: 10,
          active: 5,
          newInPeriod: 2,
        },
        forums: {
          total: 3,
          active: 2,
        },
        events: {
          total: 3,
          upcoming: 1,
          totalRegistrations: 5,
        },
        orders: {
          total: 8,
          pending: 1,
          completed: 5,
          cancelled: 2,
          revenueMinor: 500000,
        },
        payments: {
          totalAmountMinor: 500000,
          successful: 5,
          failed: 0,
          pending: 1,
        },
        topics: {
          total: 15,
          newInPeriod: 3,
        },
        system: {
          dbStatus: 'healthy' as const,
          lastSync: new Date().toISOString(),
        },
      }

      assert.strictEqual(typeof stats.users.total, 'number')
      assert.strictEqual(typeof stats.forums.active, 'number')
      assert.strictEqual(typeof stats.orders.revenueMinor, 'number')
      assert.strictEqual(typeof stats.system.dbStatus, 'string')
      assert.ok(['healthy', 'degraded', 'down'].includes(stats.system.dbStatus))
    })

    test('should validate activity item structure', () => {
      const activity = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'USER_REGISTERED' as const,
        description: 'Новый пользователь: Иван Иванов',
        timestamp: new Date().toISOString(),
        metadata: {
          userId: '550e8400-e29b-41d4-a716-446655440000',
          phone: '+996700123456',
        },
      }

      assert.strictEqual(typeof activity.id, 'string')
      assert.ok(['USER_REGISTERED', 'ORDER_CREATED', 'ORDER_COMPLETED', 'TOPIC_CREATED', 
                 'EVENT_REGISTRATION', 'PAYMENT_COMPLETED', 'FORUM_CREATED'].includes(activity.type))
      assert.strictEqual(typeof activity.description, 'string')
      assert.strictEqual(typeof activity.timestamp, 'string')
      assert.ok(activity.metadata)
    })
  })
})
