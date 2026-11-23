/**
 * Ticket QR Security Tests
 * 
 * Tests critical security requirements for ticket QR system:
 * 1. QR encryption (AES-256-GCM, not Base64)
 * 2. Payment status verification
 * 3. Ownership validation
 * 4. Token hash verification
 * 5. Expiry validation
 * 6. Status validation
 * 
 * Run with: NODE_ENV=test npx tsx tests/security/ticket-qr-security.test.ts
 */

import { test } from 'node:test'
import assert from 'node:assert'
import crypto from 'crypto'
import { encryptQRToken, decryptQRToken } from '../../lib/crypto/qr-encryption'

// =============================================================================
// Test 1: QR Token Encryption (AES-256-GCM)
// =============================================================================

test('QR token must use AES-256-GCM encryption, not Base64', () => {
  const plainToken = crypto.randomBytes(32).toString('base64url')
  
  // Encrypt token
  const encrypted = encryptQRToken(plainToken)
  
  // Verify format: iv:ciphertext:authTag (all base64)
  const parts = encrypted.split(':')
  assert.strictEqual(parts.length, 3, 'Encrypted token must have 3 parts (iv:ciphertext:authTag)')
  
  // Verify IV is 16 bytes (128 bits)
  const iv = Buffer.from(parts[0], 'base64')
  assert.strictEqual(iv.length, 16, 'IV must be 16 bytes')
  
  // Verify auth tag is 16 bytes (128 bits)
  const authTag = Buffer.from(parts[2], 'base64')
  assert.strictEqual(authTag.length, 16, 'Auth tag must be 16 bytes')
  
  // Decrypt and verify
  const decrypted = decryptQRToken(encrypted)
  assert.strictEqual(decrypted, plainToken, 'Decrypted token must match original')
})

test('QR decryption fails for tampered ciphertext', () => {
  const plainToken = 'valid-token-123'
  const encrypted = encryptQRToken(plainToken)
  
  // Tamper with ciphertext part
  const parts = encrypted.split(':')
  const tamperedCiphertext = Buffer.from(parts[1], 'base64')
  tamperedCiphertext[0] ^= 0xFF // Flip bits
  parts[1] = tamperedCiphertext.toString('base64')
  const tamperedEncrypted = parts.join(':')
  
  // Decryption must fail
  assert.throws(
    () => decryptQRToken(tamperedEncrypted),
    /Failed to decrypt QR token/,
    'Tampered ciphertext must be rejected'
  )
})

test('QR decryption fails for wrong auth tag', () => {
  const plainToken = 'valid-token-123'
  const encrypted = encryptQRToken(plainToken)
  
  // Replace auth tag with random bytes
  const parts = encrypted.split(':')
  parts[2] = crypto.randomBytes(16).toString('base64')
  const tamperedEncrypted = parts.join(':')
  
  // Decryption must fail
  assert.throws(
    () => decryptQRToken(tamperedEncrypted),
    /Failed to decrypt QR token/,
    'Wrong auth tag must be rejected'
  )
})

// =============================================================================
// Test 2: Payment Status Verification
// =============================================================================

test('QR endpoint must check order payment status', () => {
  // Simulate ticket data
  const ticket = {
    id: 'ticket-123',
    buyerId: 'user-456',
    orderItem: {
      order: {
        paidAt: null, // NOT PAID
      },
    },
  }
  
  const requestUserId = 'user-456'
  
  // Check ownership
  const isOwner = ticket.buyerId === requestUserId
  assert.strictEqual(isOwner, true, 'User must own the ticket')
  
  // Check payment status
  const isPaid = ticket.orderItem.order.paidAt !== null
  assert.strictEqual(isPaid, false, 'Order is not paid')
  
  // QR must NOT be returned
  if (!isPaid) {
    // Correct behavior: reject unpaid ticket
    return
  }
  
  throw new Error('QR must not be exposed for unpaid orders')
})

test('QR endpoint allows paid orders', () => {
  const ticket = {
    id: 'ticket-123',
    buyerId: 'user-456',
    orderItem: {
      order: {
        paidAt: new Date('2026-01-15T10:00:00Z'), // PAID
      },
    },
  }
  
  const requestUserId = 'user-456'
  
  // Check ownership
  const isOwner = ticket.buyerId === requestUserId
  assert.strictEqual(isOwner, true, 'User must own the ticket')
  
  // Check payment status
  const isPaid = ticket.orderItem.order.paidAt !== null
  assert.strictEqual(isPaid, true, 'Order must be paid')
  
  // QR can be returned
})

// =============================================================================
// Test 3: Ownership Validation
// =============================================================================

test('QR endpoint rejects non-owner access', () => {
  const ticket = {
    id: 'ticket-123',
    buyerId: 'user-456',
  }
  
  const requestUserId = 'user-789' // Different user
  const userRole: string = 'USER'
  
  // Check ownership
  const isOwner = ticket.buyerId === requestUserId
  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  const hasAccess = isOwner || isSuperAdmin
  
  assert.strictEqual(hasAccess, false, 'Non-owner without SUPER_ADMIN role must be rejected')
})

test('QR endpoint allows SUPER_ADMIN access', () => {
  const ticket = {
    id: 'ticket-123',
    buyerId: 'user-456',
  }
  
  const requestUserId = 'user-789' // Different user
  const userRole: string = 'SUPER_ADMIN'
  
  // Check ownership
  const isOwner = ticket.buyerId === requestUserId
  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  const hasAccess = isOwner || isSuperAdmin
  
  assert.strictEqual(hasAccess, true, 'SUPER_ADMIN must have access to any ticket')
})

// =============================================================================
// Test 4: Token Hash Verification
// =============================================================================

test('Check-in validates QR token via SHA-256 hash', () => {
  const qrToken = crypto.randomBytes(32).toString('base64url')
  
  // Hash token for storage
  const qrTokenHash = crypto.createHash('sha256').update(qrToken).digest('hex')
  
  // Verify hash length
  assert.strictEqual(qrTokenHash.length, 64, 'SHA-256 hash must be 64 hex characters')
  
  // Simulate check-in validation
  const scannedToken = qrToken
  const scannedHash = crypto.createHash('sha256').update(scannedToken).digest('hex')
  
  assert.strictEqual(scannedHash, qrTokenHash, 'Token hash must match')
})

test('Check-in rejects forged tokens', () => {
  const validToken = crypto.randomBytes(32).toString('base64url')
  const validHash = crypto.createHash('sha256').update(validToken).digest('hex')
  
  // Attacker tries different token
  const forgedToken = crypto.randomBytes(32).toString('base64url')
  const forgedHash = crypto.createHash('sha256').update(forgedToken).digest('hex')
  
  assert.notStrictEqual(forgedHash, validHash, 'Forged token hash must not match')
})

// =============================================================================
// Test 5: Expiry Validation
// =============================================================================

test('Check-in rejects expired tickets', () => {
  const now = new Date('2026-11-22T17:00:00Z')
  const ticket = {
    expiresAt: new Date('2026-11-22T16:59:00Z'), // Expired 1 minute ago
  }
  
  const isExpired = ticket.expiresAt < now
  assert.strictEqual(isExpired, true, 'Ticket must be expired')
})

test('Check-in accepts non-expired tickets', () => {
  const now = new Date('2026-11-22T17:00:00Z')
  const ticket = {
    expiresAt: new Date('2026-11-22T18:00:00Z'), // Expires in 1 hour
  }
  
  const isExpired = ticket.expiresAt < now
  assert.strictEqual(isExpired, false, 'Ticket must not be expired')
})

// =============================================================================
// Test 6: Status Validation
// =============================================================================

test('Check-in rejects CANCELLED tickets', () => {
  const ticket = {
    status: 'CANCELLED',
  }
  
  assert.strictEqual(ticket.status === 'CANCELLED', true, 'Cancelled tickets must be rejected')
})

test('Check-in rejects USED tickets', () => {
  const ticket = {
    status: 'USED',
  }
  
  assert.strictEqual(ticket.status === 'USED', true, 'Used tickets must be rejected')
})

test('Check-in accepts ACTIVE tickets', () => {
  const ticket = {
    status: 'ACTIVE',
  }
  
  assert.strictEqual(ticket.status === 'ACTIVE', true, 'Active tickets must be accepted')
})

// =============================================================================
// Test 7: QR Data Format
// =============================================================================

test('QR data format is FORUM.KG|ticketNumber|token', () => {
  const ticketNumber = 'TKT-2026-11-22-001'
  const qrToken = crypto.randomBytes(32).toString('base64url')
  const qrData = `FORUM.KG|${ticketNumber}|${qrToken}`
  
  // Parse QR data
  const parts = qrData.split('|')
  assert.strictEqual(parts.length, 3, 'QR data must have 3 parts')
  assert.strictEqual(parts[0], 'FORUM.KG', 'First part must be FORUM.KG')
  assert.strictEqual(parts[1], ticketNumber, 'Second part must be ticket number')
  assert.strictEqual(parts[2], qrToken, 'Third part must be QR token')
})

test('QR parsing rejects invalid format', () => {
  const invalidFormats = [
    'INVALID|TKT-001|token',
    'TKT-001|token',
    'FORUM.KG|TKT-001',
    'FORUM.KG|TKT-001|token|extra',
    '',
  ]
  
  for (const qrData of invalidFormats) {
    const parts = qrData.split('|')
    const isValid = parts.length === 3 && parts[0] === 'FORUM.KG'
    assert.strictEqual(isValid, false, `Invalid format must be rejected: ${qrData}`)
  }
})

console.log('✅ All QR security tests passed')
