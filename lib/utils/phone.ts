/**
 * Phone Number Utilities for Kyrgyzstan
 * Handles validation, normalization, and formatting
 */

/**
 * Validate Kyrgyzstan phone number in E.164 format
 * Expected format: +996XXXXXXXXX (12 digits total)
 * @param phone - Phone number to validate
 * @returns true if valid
 */
export function isValidKyrgyzstanPhone(phone: string): boolean {
  const e164Pattern = /^\+996\d{9}$/
  return e164Pattern.test(phone)
}

/**
 * Normalize phone number to E.164 format (+996XXXXXXXXX)
 * Accepts multiple input formats:
 * - +996555123456 (already normalized)
 * - 996555123456 (missing +)
 * - 0555123456 (local format with leading 0)
 * - 555123456 (local format without 0)
 * 
 * @param phone - Phone number in various formats
 * @returns Normalized phone number or null if invalid
 */
export function normalizePhone(phone: string): string | null {
  // Remove all non-digit characters except leading +
  const cleaned = phone.replace(/[^\d+]/g, '')
  
  // Remove + if present for digit-only processing
  const digits = cleaned.replace(/^\+/, '')
  
  // Case 1: Already in correct format +996XXXXXXXXX (12 chars)
  if (cleaned.startsWith('+996') && cleaned.length === 13) {
    return cleaned
  }
  
  // Case 2: 996XXXXXXXXX (missing +)
  if (digits.startsWith('996') && digits.length === 12) {
    return `+${digits}`
  }
  
  // Case 3: 0555123456 (local format with 0, 10 digits)
  if (digits.startsWith('0') && digits.length === 10) {
    return `+996${digits.slice(1)}`
  }
  
  // Case 4: 555123456 (local format without 0, 9 digits)
  if (digits.length === 9) {
    return `+996${digits}`
  }
  
  // Invalid format
  return null
}

/**
 * Format phone number for display
 * Converts +996555123456 to +996 555 12 34 56
 * 
 * @param phone - Phone number in E.164 format
 * @returns Formatted phone number
 */
export function formatPhoneForDisplay(phone: string): string {
  if (!isValidKyrgyzstanPhone(phone)) {
    return phone // Return as-is if invalid
  }
  
  // +996 555 12 34 56
  return phone.replace(/(\+996)(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5')
}

/**
 * Extract country code from phone number
 * @param phone - Phone number in E.164 format
 * @returns Country code (e.g., "996") or null
 */
export function extractCountryCode(phone: string): string | null {
  const match = phone.match(/^\+(\d{1,3})/)
  return match ? match[1] : null
}

/**
 * Mask phone number for privacy
 * Converts +996555123456 to +996***1234**
 * 
 * @param phone - Phone number in E.164 format
 * @returns Masked phone number
 */
export function maskPhone(phone: string): string {
  if (!isValidKyrgyzstanPhone(phone)) {
    return '***'
  }
  
  // Show country code, hide middle digits, show last 4
  return phone.replace(/(\+996)\d{5}(\d{4})/, '$1***$2**')
}

/**
 * Check if two phone numbers are the same (after normalization)
 * @param phone1 - First phone number
 * @param phone2 - Second phone number
 * @returns true if phones are the same
 */
export function arePhonesEqual(phone1: string, phone2: string): boolean {
  const normalized1 = normalizePhone(phone1)
  const normalized2 = normalizePhone(phone2)
  
  if (!normalized1 || !normalized2) {
    return false
  }
  
  return normalized1 === normalized2
}

/**
 * Get mobile operator from Kyrgyzstan phone number
 * Based on first 3 digits after country code
 * 
 * @param phone - Phone number in E.164 format
 * @returns Operator name or "Unknown"
 */
export function getMobileOperator(phone: string): string {
  if (!isValidKyrgyzstanPhone(phone)) {
    return 'Unknown'
  }
  
  const operatorCode = phone.slice(4, 7) // Extract XXX from +996XXX......
  
  // Kyrgyzstan mobile operator prefixes (as of 2024)
  const operators: Record<string, string> = {
    '700': 'Beeline',
    '770': 'Beeline',
    '771': 'Beeline',
    '772': 'Beeline',
    '773': 'Beeline',
    '774': 'Beeline',
    '775': 'Beeline',
    '776': 'Beeline',
    '777': 'Beeline',
    '778': 'Beeline',
    
    '500': 'O!',
    '501': 'O!',
    '502': 'O!',
    '503': 'O!',
    '504': 'O!',
    '505': 'O!',
    '506': 'O!',
    '507': 'O!',
    '508': 'O!',
    '509': 'O!',
    
    '550': 'MegaCom',
    '551': 'MegaCom',
    '552': 'MegaCom',
    '553': 'MegaCom',
    '554': 'MegaCom',
    '555': 'MegaCom',
    '556': 'MegaCom',
    '557': 'MegaCom',
    '558': 'MegaCom',
    '559': 'MegaCom',
    
    '755': 'NurTelecom',
    '750': 'NurTelecom',
  }
  
  return operators[operatorCode] || 'Unknown'
}
