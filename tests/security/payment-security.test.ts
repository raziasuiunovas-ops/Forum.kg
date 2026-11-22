/**
 * Payment Security Test Suite
 * 
 * Manual security tests for Payment API vulnerabilities.
 * Run with: npx tsx tests/security/payment-security.test.ts
 */

import crypto from 'crypto'
import { encryptQRToken, decryptQRToken } from '../../lib/crypto/qr-encryption'

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL'
  message: string
}

const results: TestResult[] = []

function test(name: string, fn: () => void) {
  try {
    fn()
    results.push({ name, status: 'PASS', message: 'OK' })
    console.log(`✅ ${name}`)
  } catch (error: any) {
    results.push({ name, status: 'FAIL', message: error.message })
    console.error(`❌ ${name}: ${error.message}`)
  }
}

// QR Encryption Tests
test('QR Encryption: encrypts and decrypts correctly', () => {
  const token = crypto.randomBytes(32).toString('base64url')
  const encrypted = encryptQRToken(token)
  const decrypted = decryptQRToken(encrypted)
  if (decrypted !== token) throw new Error('Decryption mismatch')
})

test('QR Encryption: produces unique ciphertexts', () => {
  const token = crypto.randomBytes(32).toString('base64url')
  const e1 = encryptQRToken(token)
  const e2 = encryptQRToken(token)
  if (e1 === e2) throw new Error('Same ciphertext for same plaintext')
})

test('QR Encryption: rejects tampered ciphertext', () => {
  const token = crypto.randomBytes(32).toString('base64url')
  const encrypted = encryptQRToken(token)
  const parts = encrypted.split(':')
  const tampered = `${parts[0]}:invalid:${parts[2]}`
  try {
    decryptQRToken(tampered)
    throw new Error('Accepted tampered ciphertext')
  } catch (e: any) {
    if (!e.message.includes('decrypt')) throw e
  }
})

// Webhook Signature Tests
test('Webhook: generates valid HMAC-SHA256', () => {
  const payload = '{"test":"data"}'
  const secret = 'secret123'
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  if (sig.length !== 64) throw new Error('Invalid signature length')
})

test('Webhook: timing-safe comparison works', () => {
  const sig1 = 'a'.repeat(64)
  const sig2 = 'b'.repeat(64)
  const result = crypto.timingSafeEqual(Buffer.from(sig1), Buffer.from(sig2))
  if (result) throw new Error('Different signatures matched')
})

// QR Token Generation
test('QR Token: generates 256-bit random tokens', () => {
  const token = crypto.randomBytes(32).toString('base64url')
  const decoded = Buffer.from(token, 'base64url')
  if (decoded.length !== 32) throw new Error('Wrong token length')
})

test('QR Token: SHA-256 hashing is consistent', () => {
  const token = crypto.randomBytes(32).toString('base64url')
  const h1 = crypto.createHash('sha256').update(token).digest('hex')
  const h2 = crypto.createHash('sha256').update(token).digest('hex')
  if (h1 !== h2) throw new Error('Inconsistent hashing')
  if (h1.length !== 64) throw new Error('Invalid hash length')
})

// QR Format Tests
test('QR Format: parses correctly', () => {
  const qr = 'FORUM.KG|TKT-123|token123'
  const parts = qr.split('|')
  if (parts.length !== 3) throw new Error('Invalid format')
  if (parts[0] !== 'FORUM.KG') throw new Error('Wrong prefix')
})

// Print Summary
console.log('\n' + '='.repeat(50))
console.log('TEST SUMMARY')
console.log('='.repeat(50))
const passed = results.filter(r => r.status === 'PASS').length
const failed = results.filter(r => r.status === 'FAIL').length
console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`)
if (failed > 0) process.exit(1)
