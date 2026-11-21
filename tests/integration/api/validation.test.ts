/**
 * Integration Tests for API Input Validation
 * Tests actual API endpoints with various validation scenarios
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'

// Base URL for API
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000'

/**
 * Helper function to make API requests
 */
async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${BASE_URL}${endpoint}`
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

describe('API Validation Integration Tests', () => {
  describe('Health Check API', () => {
    it('should validate correct query parameter', async () => {
      const response = await apiRequest('/api/v1/health?check=live')
      assert.equal(response.status, 200)
      
      const data = await response.json()
      assert.equal(data.status, 'ok')
    })

    it('should reject invalid query parameter', async () => {
      const response = await apiRequest('/api/v1/health?check=invalid')
      assert.equal(response.status, 422) // Validation error
      
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })

    it('should use default value when parameter is missing', async () => {
      const response = await apiRequest('/api/v1/health')
      assert.equal(response.status, 200)
      
      const data = await response.json()
      assert.ok(data.checks.database) // Default is 'ready' which checks DB
    })
  })

  describe('OTP Request API', () => {
    it('should validate correct OTP request body', async () => {
      const response = await apiRequest('/api/v1/auth/phone/request-otp', {
        method: 'POST',
        body: JSON.stringify({
          phone: '+996700123456',
          purpose: 'PHONE_VERIFICATION',
        }),
      })
      
      // Should succeed or rate limit (both are OK for validation test)
      assert.ok(response.status === 200 || response.status === 429)
    })

    it('should reject missing required field', async () => {
      const response = await apiRequest('/api/v1/auth/phone/request-otp', {
        method: 'POST',
        body: JSON.stringify({
          phone: '+996700123456',
          // purpose is missing
        }),
      })
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })

    it('should reject invalid phone format', async () => {
      const response = await apiRequest('/api/v1/auth/phone/request-otp', {
        method: 'POST',
        body: JSON.stringify({
          phone: 'invalid',
          purpose: 'PHONE_VERIFICATION',
        }),
      })
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.ok(data.error.code === 'VALIDATION_ERROR' || data.error.code === 'INVALID_PHONE')
    })

    it('should reject unknown fields in strict mode', async () => {
      const response = await apiRequest('/api/v1/auth/phone/request-otp', {
        method: 'POST',
        body: JSON.stringify({
          phone: '+996700123456',
          purpose: 'PHONE_VERIFICATION',
          unexpectedField: 'should be rejected',
        }),
      })
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })

    it('should reject malformed JSON', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/auth/phone/request-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{ invalid json',
      })
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
      assert.ok(data.error.message.includes('JSON'))
    })

    it('should reject empty body', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/auth/phone/request-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '',
      })
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })

    it('should reject invalid enum value', async () => {
      const response = await apiRequest('/api/v1/auth/phone/request-otp', {
        method: 'POST',
        body: JSON.stringify({
          phone: '+996700123456',
          purpose: 'INVALID_PURPOSE',
        }),
      })
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })
  })

  describe('OTP Verify API', () => {
    it('should reject invalid UUID format', async () => {
      const response = await apiRequest('/api/v1/auth/phone/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: 'not-a-uuid',
          code: '123456',
        }),
      })
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })

    it('should reject invalid OTP code length', async () => {
      const response = await apiRequest('/api/v1/auth/phone/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: '550e8400-e29b-41d4-a716-446655440000',
          code: '123', // Too short
        }),
      })
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })

    it('should reject non-numeric OTP code', async () => {
      const response = await apiRequest('/api/v1/auth/phone/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: '550e8400-e29b-41d4-a716-446655440000',
          code: 'abcdef',
        }),
      })
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })
  })

  describe('Google OAuth Callback API', () => {
    it('should validate correct query parameters', async () => {
      const response = await apiRequest(
        '/api/v1/auth/google/callback?code=test-auth-code&state=test-state'
      )
      
      // Should return not implemented, but validation should pass
      assert.equal(response.status, 501)
      const data = await response.json()
      assert.equal(data.error.code, 'NOT_IMPLEMENTED')
    })

    it('should reject missing code parameter', async () => {
      const response = await apiRequest('/api/v1/auth/google/callback')
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })

    it('should reject empty code parameter', async () => {
      const response = await apiRequest('/api/v1/auth/google/callback?code=')
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })

    it('should handle OAuth error parameter', async () => {
      const response = await apiRequest(
        '/api/v1/auth/google/callback?error=access_denied'
      )
      
      assert.equal(response.status, 400)
      const data = await response.json()
      assert.equal(data.error.code, 'OAUTH_ERROR')
    })
  })
})

console.log('✓ All API validation integration tests defined')
