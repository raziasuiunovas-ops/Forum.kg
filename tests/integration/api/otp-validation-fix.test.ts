/**
 * Integration Tests for OTP Endpoints Validation Fix
 * Specifically tests malformed JSON and empty body handling
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Base URL for API (check actual port)
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3001'

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

describe('OTP Endpoints Validation Fix', () => {
  describe('POST /api/v1/auth/phone/request-otp', () => {
    it('should return 422 for malformed JSON', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/auth/phone/request-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{ invalid json',
      })
      
      assert.equal(response.status, 422, 'Should return 422 for malformed JSON')
      
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
      assert.ok(data.error.message.includes('JSON') || data.error.message.includes('некорректный'), 
        'Error message should mention JSON')
    })

    it('should return 422 for empty body', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/auth/phone/request-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '',
      })
      
      assert.equal(response.status, 422, 'Should return 422 for empty body')
      
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
      assert.ok(data.error.message.includes('пустым') || data.error.message.includes('empty'),
        'Error message should mention empty body')
    })

    it('should return 422 for missing required fields', async () => {
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

    it('should return 422 for unknown fields (strict mode)', async () => {
      const response = await apiRequest('/api/v1/auth/phone/request-otp', {
        method: 'POST',
        body: JSON.stringify({
          phone: '+996700123456',
          purpose: 'PHONE_VERIFICATION',
          unknownField: 'should be rejected',
        }),
      })
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })

    it('should return 422 for invalid phone format', async () => {
      const response = await apiRequest('/api/v1/auth/phone/request-otp', {
        method: 'POST',
        body: JSON.stringify({
          phone: 'invalid-phone',
          purpose: 'PHONE_VERIFICATION',
        }),
      })
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.ok(data.error.code === 'VALIDATION_ERROR' || data.error.code === 'INVALID_PHONE')
    })
  })

  describe('POST /api/v1/auth/phone/verify-otp', () => {
    it('should return 422 for malformed JSON', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/auth/phone/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{ "challengeId": "incomplete',
      })
      
      assert.equal(response.status, 422, 'Should return 422 for malformed JSON')
      
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
      assert.ok(data.error.message.includes('JSON') || data.error.message.includes('некорректный'))
    })

    it('should return 422 for empty body', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/auth/phone/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '',
      })
      
      assert.equal(response.status, 422, 'Should return 422 for empty body')
      
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
      assert.ok(data.error.message.includes('пустым') || data.error.message.includes('empty'))
    })

    it('should return 422 for missing required fields', async () => {
      const response = await apiRequest('/api/v1/auth/phone/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: '550e8400-e29b-41d4-a716-446655440000',
          // code is missing
        }),
      })
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })

    it('should return 422 for invalid UUID format', async () => {
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

    it('should return 422 for invalid OTP code format', async () => {
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

    it('should return 422 for unknown fields (strict mode)', async () => {
      const response = await apiRequest('/api/v1/auth/phone/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: '550e8400-e29b-41d4-a716-446655440000',
          code: '123456',
          unknownField: 'should be rejected',
        }),
      })
      
      assert.equal(response.status, 422)
      const data = await response.json()
      assert.equal(data.error.code, 'VALIDATION_ERROR')
    })
  })
})

console.log('✓ All OTP validation fix tests defined')
