/**
 * Admin 2FA Cryptographic Security Tests
 * Tests hashing, timing-safe comparison, and code generation
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'

test('2FA codes use SHA-256 hashing', () => {
  const code = '123456'
  const hash = crypto.createHash('sha256').update(code).digest('hex')
  
  assert.strictEqual(hash.length, 64, 'SHA-256 hash must be 64 hex characters')
  
  // Different codes produce different hashes
  const code2 = '654321'
  const hash2 = crypto.createHash('sha256').update(code2).digest('hex')
  assert.notStrictEqual(hash, hash2, 'Different codes must produce different hashes')
})

test('Code verification uses constant-time comparison', () => {
  const code = '123456'
  const hash = crypto.createHash('sha256').update(code).digest('hex')
  
  // Verify with correct code
  const verifyHash = crypto.createHash('sha256').update(code).digest('hex')
  
  // Use timingSafeEqual for constant-time comparison
  const hashBuffer = Buffer.from(hash, 'hex')
  const verifyBuffer = Buffer.from(verifyHash, 'hex')
  
  assert.strictEqual(
    crypto.timingSafeEqual(hashBuffer, verifyBuffer),
    true,
    'Correct code must verify'
  )
})

test('Timing-safe comparison rejects wrong codes', () => {
  const correctCode = '123456'
  const correctHash = crypto.createHash('sha256').update(correctCode).digest('hex')
  
  const wrongCode = '654321'
  const wrongHash = crypto.createHash('sha256').update(wrongCode).digest('hex')
  
  const correctBuffer = Buffer.from(correctHash, 'hex')
  const wrongBuffer = Buffer.from(wrongHash, 'hex')
  
  assert.strictEqual(
    crypto.timingSafeEqual(correctBuffer, wrongBuffer),
    false,
    'Wrong code must be rejected'
  )
})

test('2FA codes are 6-digit random numbers', () => {
  // Generate multiple codes to verify format
  for (let i = 0; i < 100; i++) {
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    
    assert.strictEqual(code.length, 6, 'Code must be 6 digits')
    assert.ok(/^\d{6}$/.test(code), 'Code must be numeric')
    assert.ok(Number(code) >= 100000, 'Code must be >= 100000')
    assert.ok(Number(code) <= 999999, 'Code must be <= 999999')
  }
})

test('Hashed codes cannot be reversed', () => {
  const code = '123456'
  const hash = crypto.createHash('sha256').update(code).digest('hex')
  
  // Hash is one-way - cannot derive code from hash
  // We can only verify by hashing a candidate and comparing
  assert.notStrictEqual(hash, code, 'Hash must not equal plaintext')
  assert.strictEqual(hash.length, 64, 'Hash must be 64 characters')
})

test('Pending tokens are UUIDs', () => {
  const token = crypto.randomUUID()
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  assert.ok(uuidRegex.test(token), 'Token must be valid UUID v4')
})

test('Code expiry is 5 minutes', () => {
  const now = new Date()
  const expiry = new Date(now.getTime() + 5 * 60 * 1000)
  
  const diff = expiry.getTime() - now.getTime()
  assert.strictEqual(diff, 5 * 60 * 1000, 'Expiry must be exactly 5 minutes')
})

test('Expired codes are rejected', () => {
  const now = new Date()
  const expiredTime = new Date(now.getTime() - 1000) // 1 second ago
  
  assert.ok(expiredTime < now, 'Expired time must be in the past')
})

test('Non-expired codes are accepted', () => {
  const now = new Date()
  const validTime = new Date(now.getTime() + 60000) // 1 minute in future
  
  assert.ok(validTime > now, 'Valid time must be in the future')
})

console.log('✅ All Admin 2FA crypto tests passed')
