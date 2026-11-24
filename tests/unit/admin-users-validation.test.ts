/**
 * Unit tests for Admin Users validation schemas
 * Tests Zod schema validation for admin user management operations
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  adminUserQuerySchema,
  adminUserUpdateSchema,
  parseAdminUserQuery,
} from '@/lib/api/schemas/user'
import { UserRole, UserStatus } from '@prisma/client'

describe('Admin Users Validation Schemas', () => {
  describe('adminUserQuerySchema', () => {
    it('should accept query with default values', () => {
      const result = adminUserQuerySchema.safeParse({})
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.page, 1)
        assert.strictEqual(result.data.limit, 20)
        assert.strictEqual(result.data.sortBy, 'createdAt')
        assert.strictEqual(result.data.sortOrder, 'desc')
      }
    })

    it('should accept valid pagination parameters', () => {
      const result = adminUserQuerySchema.safeParse({
        page: 2,
        limit: 50,
      })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.page, 2)
        assert.strictEqual(result.data.limit, 50)
      }
    })

    it('should coerce string pagination to numbers', () => {
      const result = adminUserQuerySchema.safeParse({
        page: '3',
        limit: '25',
      })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.page, 3)
        assert.strictEqual(result.data.limit, 25)
      }
    })

    it('should accept valid role filter', () => {
      const result = adminUserQuerySchema.safeParse({
        role: UserRole.MANAGER,
      })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.role, UserRole.MANAGER)
      }
    })

    it('should accept all UserRole values', () => {
      const roles = [UserRole.USER, UserRole.SCANNER, UserRole.MANAGER, UserRole.SUPER_ADMIN]
      
      roles.forEach((role) => {
        const result = adminUserQuerySchema.safeParse({ role })
        assert.strictEqual(result.success, true, `Should accept role: ${role}`)
      })
    })

    it('should reject invalid role', () => {
      const result = adminUserQuerySchema.safeParse({
        role: 'INVALID_ROLE',
      })
      assert.strictEqual(result.success, false)
    })

    it('should accept valid status filter', () => {
      const result = adminUserQuerySchema.safeParse({
        status: UserStatus.ACTIVE,
      })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.status, UserStatus.ACTIVE)
      }
    })

    it('should accept all UserStatus values', () => {
      const statuses = [UserStatus.ACTIVE, UserStatus.SUSPENDED]
      
      statuses.forEach((status) => {
        const result = adminUserQuerySchema.safeParse({ status })
        assert.strictEqual(result.success, true, `Should accept status: ${status}`)
      })
    })

    it('should reject invalid status', () => {
      const result = adminUserQuerySchema.safeParse({
        status: 'INVALID_STATUS',
      })
      assert.strictEqual(result.success, false)
    })

    it('should accept valid search string', () => {
      const result = adminUserQuerySchema.safeParse({
        search: 'John Doe',
      })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.search, 'John Doe')
      }
    })

    it('should reject empty search string', () => {
      const result = adminUserQuerySchema.safeParse({
        search: '',
      })
      assert.strictEqual(result.success, false)
    })

    it('should reject search string longer than 100 chars', () => {
      const result = adminUserQuerySchema.safeParse({
        search: 'a'.repeat(101),
      })
      assert.strictEqual(result.success, false)
    })

    it('should accept valid sortBy values', () => {
      const sortByValues = ['createdAt', 'updatedAt', 'firstName', 'lastName', 'role']
      
      sortByValues.forEach((sortBy) => {
        const result = adminUserQuerySchema.safeParse({ sortBy })
        assert.strictEqual(result.success, true, `Should accept sortBy: ${sortBy}`)
      })
    })

    it('should reject invalid sortBy value', () => {
      const result = adminUserQuerySchema.safeParse({
        sortBy: 'invalidField',
      })
      assert.strictEqual(result.success, false)
    })

    it('should accept valid sortOrder values', () => {
      const result1 = adminUserQuerySchema.safeParse({ sortOrder: 'asc' })
      const result2 = adminUserQuerySchema.safeParse({ sortOrder: 'desc' })
      
      assert.strictEqual(result1.success, true)
      assert.strictEqual(result2.success, true)
    })

    it('should reject invalid sortOrder value', () => {
      const result = adminUserQuerySchema.safeParse({
        sortOrder: 'invalid',
      })
      assert.strictEqual(result.success, false)
    })

    it('should accept combined filters', () => {
      const result = adminUserQuerySchema.safeParse({
        page: 2,
        limit: 30,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        search: 'test',
        sortBy: 'firstName',
        sortOrder: 'asc',
      })
      assert.strictEqual(result.success, true)
    })
  })

  describe('adminUserUpdateSchema', () => {
    it('should accept firstName update', () => {
      const result = adminUserUpdateSchema.safeParse({
        firstName: 'John',
      })
      assert.strictEqual(result.success, true)
    })

    it('should accept lastName update', () => {
      const result = adminUserUpdateSchema.safeParse({
        lastName: 'Doe',
      })
      assert.strictEqual(result.success, true)
    })

    it('should accept email update', () => {
      const result = adminUserUpdateSchema.safeParse({
        email: 'john.doe@example.com',
      })
      assert.strictEqual(result.success, true)
    })

    it('should reject invalid email format', () => {
      const result = adminUserUpdateSchema.safeParse({
        email: 'invalid-email',
      })
      assert.strictEqual(result.success, false)
    })

    it('should accept role update', () => {
      const result = adminUserUpdateSchema.safeParse({
        role: UserRole.MANAGER,
      })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.role, UserRole.MANAGER)
      }
    })

    it('should accept all UserRole values for role update', () => {
      const roles = [UserRole.USER, UserRole.SCANNER, UserRole.MANAGER, UserRole.SUPER_ADMIN]
      
      roles.forEach((role) => {
        const result = adminUserUpdateSchema.safeParse({ role })
        assert.strictEqual(result.success, true, `Should accept role: ${role}`)
      })
    })

    it('should accept status update', () => {
      const result = adminUserUpdateSchema.safeParse({
        status: UserStatus.SUSPENDED,
      })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.status, UserStatus.SUSPENDED)
      }
    })

    it('should accept preferredLocale update', () => {
      const result = adminUserUpdateSchema.safeParse({
        preferredLocale: 'RU',
      })
      assert.strictEqual(result.success, true)
    })

    it('should accept announcementsPushEnabled update', () => {
      const result = adminUserUpdateSchema.safeParse({
        announcementsPushEnabled: false,
      })
      assert.strictEqual(result.success, true)
      if (result.success) {
        assert.strictEqual(result.data.announcementsPushEnabled, false)
      }
    })

    it('should accept multiple fields update', () => {
      const result = adminUserUpdateSchema.safeParse({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        role: UserRole.MANAGER,
      })
      assert.strictEqual(result.success, true)
    })

    it('should reject empty update object', () => {
      const result = adminUserUpdateSchema.safeParse({})
      assert.strictEqual(result.success, false)
    })

    it('should reject unknown fields (strict mode)', () => {
      const result = adminUserUpdateSchema.safeParse({
        firstName: 'John',
        unknownField: 'value',
      })
      assert.strictEqual(result.success, false)
    })

    it('should reject non-boolean for announcementsPushEnabled', () => {
      const result = adminUserUpdateSchema.safeParse({
        announcementsPushEnabled: 'yes',
      })
      assert.strictEqual(result.success, false)
    })

    it('should accept SUPER_ADMIN role promotion', () => {
      const result = adminUserUpdateSchema.safeParse({
        role: UserRole.SUPER_ADMIN,
      })
      assert.strictEqual(result.success, true)
      // Note: Actual permission check happens in endpoint, not schema
    })

    it('should accept status suspension', () => {
      const result = adminUserUpdateSchema.safeParse({
        status: UserStatus.SUSPENDED,
      })
      assert.strictEqual(result.success, true)
    })
  })

  describe('parseAdminUserQuery helper', () => {
    it('should parse URL searchParams with defaults', () => {
      const params = new URLSearchParams()
      const result = parseAdminUserQuery(params)
      
      assert.strictEqual(result.page, 1)
      assert.strictEqual(result.limit, 20)
      assert.strictEqual(result.sortBy, 'createdAt')
      assert.strictEqual(result.sortOrder, 'desc')
    })

    it('should parse URL searchParams with custom values', () => {
      const params = new URLSearchParams({
        page: '3',
        limit: '50',
        role: UserRole.MANAGER,
        status: UserStatus.ACTIVE,
        search: 'test user',
        sortBy: 'firstName',
        sortOrder: 'asc',
      })
      const result = parseAdminUserQuery(params)
      
      assert.strictEqual(result.page, 3)
      assert.strictEqual(result.limit, 50)
      assert.strictEqual(result.role, UserRole.MANAGER)
      assert.strictEqual(result.status, UserStatus.ACTIVE)
      assert.strictEqual(result.search, 'test user')
      assert.strictEqual(result.sortBy, 'firstName')
      assert.strictEqual(result.sortOrder, 'asc')
    })

    it('should parse URL searchParams with partial values', () => {
      const params = new URLSearchParams({
        page: '2',
        search: 'john',
      })
      const result = parseAdminUserQuery(params)
      
      assert.strictEqual(result.page, 2)
      assert.strictEqual(result.limit, 20) // default
      assert.strictEqual(result.search, 'john')
      assert.strictEqual(result.role, undefined)
      assert.strictEqual(result.status, undefined)
    })

    it('should throw on invalid role in searchParams', () => {
      const params = new URLSearchParams({
        role: 'INVALID_ROLE',
      })
      
      assert.throws(() => parseAdminUserQuery(params))
    })

    it('should throw on invalid status in searchParams', () => {
      const params = new URLSearchParams({
        status: 'INVALID_STATUS',
      })
      
      assert.throws(() => parseAdminUserQuery(params))
    })

    it('should throw on invalid sortBy in searchParams', () => {
      const params = new URLSearchParams({
        sortBy: 'invalidField',
      })
      
      assert.throws(() => parseAdminUserQuery(params))
    })
  })
})
