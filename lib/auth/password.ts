/**
 * Password and OTP Hashing Utilities
 * Uses bcrypt for secure hashing
 */

import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

/**
 * Hash a password or OTP code
 * @param plainText - Plain text to hash
 * @returns Hashed string
 */
export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, SALT_ROUNDS)
}

/**
 * Verify a password or OTP code against a hash
 * @param plainText - Plain text to verify
 * @param hash - Hash to compare against
 * @returns True if matches
 */
export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plainText, hash)
  } catch (error) {
    // If hash is invalid, return false instead of throwing
    return false
  }
}

/**
 * Generate a random 6-digit OTP code
 * @returns 6-digit string
 */
export function generateOTP(): string {
  // Generate cryptographically secure random 6-digit code (100000-999999)
  const crypto = require('crypto')
  const code = crypto.randomInt(100000, 1000000)
  return code.toString()
}

/**
 * Normalize phone number to E.164 format
 * @param phone - Phone number in various formats
 * @returns Normalized phone number or null if invalid
 */
export function normalizePhone(phone: string): string | null {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')
  
  // Kyrgyzstan phone numbers: +996XXXXXXXXX (12 digits total)
  // Accept formats: +996555123456, 996555123456, 0555123456, 555123456
  
  if (digits.length === 9) {
    // Format: 555123456 -> +996555123456
    return `+996${digits}`
  } else if (digits.length === 10 && digits.startsWith('0')) {
    // Format: 0555123456 -> +996555123456
    return `+996${digits.slice(1)}`
  } else if (digits.length === 12 && digits.startsWith('996')) {
    // Format: 996555123456 -> +996555123456
    return `+${digits}`
  } else if (digits.length === 12 && digits.startsWith('996')) {
    return `+${digits}`
  }
  
  // Invalid format
  return null
}

/**
 * Normalize email to lowercase
 * @param email - Email address
 * @returns Normalized email
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
