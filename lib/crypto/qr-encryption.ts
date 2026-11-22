/**
 * QR Token Encryption Module
 * 
 * Provides AES-256-GCM encryption for QR tokens stored in database.
 * Uses crypto.subtle (Web Crypto API) for secure key derivation and encryption.
 * 
 * SECURITY NOTES:
 * - AES-256-GCM provides authenticated encryption (confidentiality + integrity)
 * - Each encryption uses unique IV (Initialization Vector)
 * - Encryption key derived from ENCRYPTION_KEY_BASE64 environment variable
 * - IV stored alongside ciphertext in format: {iv}:{ciphertext}:{authTag}
 * 
 * PRODUCTION REQUIREMENTS:
 * 1. Set ENCRYPTION_KEY_BASE64 in .env (generate with: openssl rand -base64 32)
 * 2. Rotate encryption keys periodically (implement key versioning)
 * 3. Use hardware security module (HSM) for key storage in high-security environments
 * 4. Never log or expose plaintext tokens or encryption keys
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // 128 bits for AES
const AUTH_TAG_LENGTH = 16 // 128 bits for GCM
const KEY_LENGTH = 32 // 256 bits for AES-256

/**
 * Get encryption key from environment
 * In production, this should come from a secure key management service
 */
function getEncryptionKey(): Buffer {
  const keyBase64 = process.env.ENCRYPTION_KEY_BASE64

  if (!keyBase64) {
    // DEVELOPMENT/TEST ONLY: Use deterministic key
    // WARNING: This is NOT secure for production
    const nodeEnv = process.env.NODE_ENV || 'production'
    if (nodeEnv === 'development' || nodeEnv === 'test') {
      console.warn('[SECURITY WARNING] Using development encryption key. Set ENCRYPTION_KEY_BASE64 in production.')
      return Buffer.from('dev-key-not-secure-change-in-production-env-variable-required', 'utf-8').slice(0, KEY_LENGTH)
    }

    throw new Error('ENCRYPTION_KEY_BASE64 environment variable is required for production')
  }

  const key = Buffer.from(keyBase64, 'base64')

  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 8} bits). Got ${key.length} bytes. Generate with: openssl rand -base64 32`)
  }

  return key
}

/**
 * Encrypt QR token using AES-256-GCM
 * 
 * @param plaintext - The QR token to encrypt (base64url encoded random bytes)
 * @returns Encrypted string in format: {iv_base64}:{ciphertext_base64}:{authTag_base64}
 * 
 * @example
 * const token = crypto.randomBytes(32).toString('base64url')
 * const encrypted = encryptQRToken(token)
 * // Returns: "lKj2...8fQ==:9xR...mPg==:Ht7...kLw=="
 */
export function encryptQRToken(plaintext: string): string {
  try {
    const key = getEncryptionKey()
    
    // Generate random IV (must be unique for each encryption)
    const iv = crypto.randomBytes(IV_LENGTH)
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    
    // Encrypt plaintext
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ])
    
    // Get authentication tag
    const authTag = cipher.getAuthTag()
    
    // Return as base64-encoded string: iv:ciphertext:authTag
    return [
      iv.toString('base64'),
      ciphertext.toString('base64'),
      authTag.toString('base64'),
    ].join(':')
  } catch (error) {
    console.error('[SECURITY] QR token encryption failed:', error)
    throw new Error('Failed to encrypt QR token')
  }
}

/**
 * Decrypt QR token using AES-256-GCM
 * 
 * @param encrypted - Encrypted string from encryptQRToken()
 * @returns Decrypted plaintext token
 * @throws Error if decryption fails (wrong key, tampered data, or invalid format)
 * 
 * @example
 * const decrypted = decryptQRToken("lKj2...8fQ==:9xR...mPg==:Ht7...kLw==")
 * // Returns original token string
 */
export function decryptQRToken(encrypted: string): string {
  try {
    const key = getEncryptionKey()
    
    // Parse encrypted string
    const parts = encrypted.split(':')
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted token format. Expected: iv:ciphertext:authTag')
    }
    
    const [ivBase64, ciphertextBase64, authTagBase64] = parts
    const iv = Buffer.from(ivBase64, 'base64')
    const ciphertext = Buffer.from(ciphertextBase64, 'base64')
    const authTag = Buffer.from(authTagBase64, 'base64')
    
    // Validate lengths
    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`)
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`)
    }
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    
    // Decrypt ciphertext
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])
    
    return plaintext.toString('utf-8')
  } catch (error) {
    console.error('[SECURITY] QR token decryption failed:', error)
    throw new Error('Failed to decrypt QR token. Data may be corrupted or key may be incorrect.')
  }
}

/**
 * Generate secure encryption key for production
 * This is a helper function - actual key should be generated securely and stored in .env
 * 
 * @returns Base64-encoded 256-bit encryption key
 * 
 * @example
 * // Run once to generate key, then add to .env as ENCRYPTION_KEY_BASE64
 * console.log(generateEncryptionKey())
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('base64')
}

/**
 * Check if encryption is properly configured
 * Used for health checks and startup validation
 */
export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey()
    return true
  } catch {
    return false
  }
}
