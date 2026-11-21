/**
 * Unit Tests for Validation Schemas
 * Tests Zod validation schemas used across API endpoints
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  phoneSchema,
  emailSchema,
  otpCodeSchema,
  uuidSchema,
  otpPurposeSchema,
  requestOtpSchema,
  verifyOtpSchema,
  googleCallbackSchema,
} from '../../lib/auth/validation'
import { OtpPurpose } from '@prisma/client'

describe('Phone Schema Validation', () => {
  it('accepts valid Kyrgyzstan phone numbers in various formats', () => {
    const validPhones = [
      '+996700123456',
      '996700123456',
      '0700123456',
      '700123456',
    ]

    validPhones.forEach((phone) => {
      const result = phoneSchema.safeParse(phone)
      assert.ok(result.success, `Should accept ${phone}`)
    })
  })

  it('rejects invalid phone numbers', () => {
    const invalidPhones = [
      'abc',        // Letters
      '12',         // Too short
      '',           // Empty
    ]

    invalidPhones.forEach((phone) => {
      const result = phoneSchema.safeParse(phone)
      assert.equal(result.success, false, `Should reject ${phone}`)
    })
  })

  it('accepts phone numbers from different countries (validation happens at normalization)', () => {
    // phoneSchema is lenient - it accepts various formats
    // Actual Kyrgyzstan validation happens in normalizePhone()
    const phones = [
      '+1234567890',  // US format (passes schema, fails normalization)
      '+996700123456', // KG format (passes both)
    ]

    phones.forEach((phone) => {
      const result = phoneSchema.safeParse(phone)
      assert.ok(result.success, `phoneSchema should accept ${phone}`)
    })
  })
})

describe('Email Schema Validation', () => {
  it('accepts valid email addresses', () => {
    const validEmails = [
      'user@example.com',
      'test.user@domain.co.uk',
      'name+tag@test.org',
    ]

    validEmails.forEach((email) => {
      const result = emailSchema.safeParse(email)
      assert.ok(result.success, `Should accept ${email}`)
    })
  })

  it('rejects invalid email addresses', () => {
    const invalidEmails = [
      'not-an-email',
      '@example.com',
      'user@',
      '',
    ]

    invalidEmails.forEach((email) => {
      const result = emailSchema.safeParse(email)
      assert.equal(result.success, false, `Should reject ${email}`)
    })
  })

  it('rejects emails longer than 255 characters', () => {
    const longEmail = 'a'.repeat(250) + '@test.com'
    const result = emailSchema.safeParse(longEmail)
    assert.equal(result.success, false)
  })
})

describe('OTP Code Schema Validation', () => {
  it('accepts valid 6-digit OTP codes', () => {
    const validCodes = ['123456', '000000', '999999']

    validCodes.forEach((code) => {
      const result = otpCodeSchema.safeParse(code)
      assert.ok(result.success, `Should accept ${code}`)
    })
  })

  it('rejects invalid OTP codes', () => {
    const invalidCodes = [
      '12345',    // Too short
      '1234567',  // Too long
      'abcdef',   // Non-numeric
      '12345a',   // Mixed
      '',
    ]

    invalidCodes.forEach((code) => {
      const result = otpCodeSchema.safeParse(code)
      assert.equal(result.success, false, `Should reject ${code}`)
    })
  })
})

describe('UUID Schema Validation', () => {
  it('accepts valid UUIDs', () => {
    const validUUIDs = [
      '550e8400-e29b-41d4-a716-446655440000',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      '00000000-0000-0000-0000-000000000000',
    ]

    validUUIDs.forEach((uuid) => {
      const result = uuidSchema.safeParse(uuid)
      assert.ok(result.success, `Should accept ${uuid}`)
    })
  })

  it('rejects invalid UUIDs', () => {
    const invalidUUIDs = [
      'not-a-uuid',
      '550e8400-e29b-41d4-a716', // Too short
      '550e8400-e29b-41d4-a716-446655440000-extra', // Too long
      '',
    ]

    invalidUUIDs.forEach((uuid) => {
      const result = uuidSchema.safeParse(uuid)
      assert.equal(result.success, false, `Should reject ${uuid}`)
    })
  })
})

describe('OTP Purpose Schema Validation', () => {
  it('accepts valid OTP purposes', () => {
    const validPurposes: OtpPurpose[] = [
      OtpPurpose.LOGIN,
      OtpPurpose.VERIFY_PHONE,
      OtpPurpose.CHANGE_PHONE,
    ]

    validPurposes.forEach((purpose) => {
      const result = otpPurposeSchema.safeParse(purpose)
      assert.ok(result.success, `Should accept ${purpose}`)
    })
  })

  it('rejects invalid OTP purposes', () => {
    const invalidPurposes = [
      'INVALID_PURPOSE',
      'login', // lowercase
      '',
      123,
    ]

    invalidPurposes.forEach((purpose) => {
      const result = otpPurposeSchema.safeParse(purpose)
      assert.equal(result.success, false, `Should reject ${purpose}`)
    })
  })
})

describe('Request OTP Schema Validation', () => {
  it('accepts valid request OTP payload', () => {
    const validPayload = {
      phone: '+996700123456',
      purpose: OtpPurpose.LOGIN,
    }

    const result = requestOtpSchema.safeParse(validPayload)
    assert.ok(result.success)
  })

  it('rejects payload with missing required fields', () => {
    const invalidPayloads = [
      { phone: '+996700123456' }, // Missing purpose
      { purpose: OtpPurpose.LOGIN }, // Missing phone
      {}, // Missing both
    ]

    invalidPayloads.forEach((payload) => {
      const result = requestOtpSchema.safeParse(payload)
      assert.equal(result.success, false)
    })
  })

  it('rejects payload with invalid phone', () => {
    const payload = {
      phone: 'invalid',
      purpose: OtpPurpose.LOGIN,
    }

    const result = requestOtpSchema.safeParse(payload)
    assert.equal(result.success, false)
  })

  it('rejects payload with invalid purpose', () => {
    const payload = {
      phone: '+996700123456',
      purpose: 'INVALID',
    }

    const result = requestOtpSchema.safeParse(payload)
    assert.equal(result.success, false)
  })

  it('rejects payload with unknown fields (schema is strict by default)', () => {
    const payload = {
      phone: '+996700123456',
      purpose: OtpPurpose.LOGIN,
      unexpectedField: 'value',
    }

    // requestOtpSchema has .strict() by default
    const result = requestOtpSchema.safeParse(payload)
    assert.equal(result.success, false, 'Should reject unknown fields')

    if (!result.success) {
      // Verify it's a validation error about unknown keys
      const errorMessage = result.error.issues[0]?.message || ''
      assert.ok(
        errorMessage.includes('Unrecognized') || errorMessage.includes('неожиданное'),
        'Error should mention unrecognized field'
      )
    }
  })
})

describe('Verify OTP Schema Validation', () => {
  it('accepts valid verify OTP payload', () => {
    const validPayload = {
      challengeId: '550e8400-e29b-41d4-a716-446655440000',
      code: '123456',
    }

    const result = verifyOtpSchema.safeParse(validPayload)
    assert.ok(result.success)
  })

  it('rejects payload with invalid UUID', () => {
    const payload = {
      challengeId: 'not-a-uuid',
      code: '123456',
    }

    const result = verifyOtpSchema.safeParse(payload)
    assert.equal(result.success, false)
  })

  it('rejects payload with invalid OTP code', () => {
    const invalidPayloads = [
      {
        challengeId: '550e8400-e29b-41d4-a716-446655440000',
        code: '123', // Too short
      },
      {
        challengeId: '550e8400-e29b-41d4-a716-446655440000',
        code: 'abcdef', // Non-numeric
      },
    ]

    invalidPayloads.forEach((payload) => {
      const result = verifyOtpSchema.safeParse(payload)
      assert.equal(result.success, false)
    })
  })
})

describe('Google Callback Schema Validation', () => {
  it('accepts valid callback query parameters', () => {
    const validParams = {
      code: 'auth-code-123',
      state: 'csrf-token',
    }

    const result = googleCallbackSchema.safeParse(validParams)
    assert.ok(result.success)
  })

  it('accepts callback without state parameter', () => {
    const params = {
      code: 'auth-code-123',
    }

    const result = googleCallbackSchema.safeParse(params)
    assert.ok(result.success)
  })

  it('rejects callback without code parameter', () => {
    const params = {
      state: 'csrf-token',
    }

    const result = googleCallbackSchema.safeParse(params)
    assert.equal(result.success, false)
  })

  it('rejects callback with empty code', () => {
    const params = {
      code: '',
      state: 'csrf-token',
    }

    const result = googleCallbackSchema.safeParse(params)
    assert.equal(result.success, false)
  })
})

console.log('✓ All validation schema unit tests defined')

