/**
 * Date and Time Utilities
 * Handles ISO 8601 UTC timestamps and timezone conversions
 * Following docs/API_CONTRACTS_DECISIONS.md Section 2.2
 */

/**
 * Convert Date to ISO 8601 UTC string
 * Format: "2026-11-19T15:30:00.000Z"
 * @param date - Date object or timestamp
 * @returns ISO 8601 string
 */
export function toISO8601(date: Date | number | string): string {
  if (typeof date === 'string') {
    return new Date(date).toISOString()
  }
  
  if (typeof date === 'number') {
    return new Date(date).toISOString()
  }
  
  return date.toISOString()
}

/**
 * Parse ISO 8601 string to Date object
 * @param isoString - ISO 8601 string
 * @returns Date object or null if invalid
 */
export function parseDateTime(isoString: string): Date | null {
  try {
    const date = new Date(isoString)
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return null
    }
    
    return date
  } catch {
    return null
  }
}

/**
 * Check if date is in the past
 * @param date - Date object or ISO string
 * @returns true if date is before now
 */
export function isPast(date: Date | string): boolean {
  const targetDate = typeof date === 'string' ? parseDateTime(date) : date
  
  if (!targetDate) {
    return false
  }
  
  return targetDate.getTime() < Date.now()
}

/**
 * Check if date is in the future
 * @param date - Date object or ISO string
 * @returns true if date is after now
 */
export function isFuture(date: Date | string): boolean {
  const targetDate = typeof date === 'string' ? parseDateTime(date) : date
  
  if (!targetDate) {
    return false
  }
  
  return targetDate.getTime() > Date.now()
}

/**
 * Check if date is expired (same as isPast)
 * @param date - Date object or ISO string
 * @returns true if date is before now
 */
export function isExpired(date: Date | string): boolean {
  return isPast(date)
}

/**
 * Add minutes to date
 * @param date - Base date
 * @param minutes - Number of minutes to add
 * @returns New date with added minutes
 */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

/**
 * Add hours to date
 * @param date - Base date
 * @param hours - Number of hours to add
 * @returns New date with added hours
 */
export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

/**
 * Add days to date
 * @param date - Base date
 * @param days - Number of days to add
 * @returns New date with added days
 */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

/**
 * Calculate difference between two dates in minutes
 * @param date1 - First date
 * @param date2 - Second date
 * @returns Difference in minutes (positive if date1 is after date2)
 */
export function diffInMinutes(date1: Date, date2: Date): number {
  return Math.floor((date1.getTime() - date2.getTime()) / (60 * 1000))
}

/**
 * Calculate difference between two dates in hours
 * @param date1 - First date
 * @param date2 - Second date
 * @returns Difference in hours
 */
export function diffInHours(date1: Date, date2: Date): number {
  return Math.floor((date1.getTime() - date2.getTime()) / (60 * 60 * 1000))
}

/**
 * Calculate difference between two dates in days
 * @param date1 - First date
 * @param date2 - Second date
 * @returns Difference in days
 */
export function diffInDays(date1: Date, date2: Date): number {
  return Math.floor((date1.getTime() - date2.getTime()) / (24 * 60 * 60 * 1000))
}

/**
 * Get start of day (00:00:00.000)
 * @param date - Date object
 * @returns Date at start of day
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setUTCHours(0, 0, 0, 0)
  return result
}

/**
 * Get end of day (23:59:59.999)
 * @param date - Date object
 * @returns Date at end of day
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date)
  result.setUTCHours(23, 59, 59, 999)
  return result
}

/**
 * Format date for display in Kyrgyzstan timezone (Asia/Bishkek)
 * @param date - Date object or ISO string
 * @param locale - Locale for formatting (default: 'ru-KG')
 * @returns Formatted date string
 */
export function formatForDisplay(
  date: Date | string,
  locale: string = 'ru-KG'
): string {
  const targetDate = typeof date === 'string' ? parseDateTime(date) : date
  
  if (!targetDate) {
    return ''
  }
  
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Bishkek',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(targetDate)
}

/**
 * Format date for short display (date only)
 * @param date - Date object or ISO string
 * @param locale - Locale for formatting
 * @returns Formatted date string (e.g., "19 ноября 2026")
 */
export function formatDateOnly(
  date: Date | string,
  locale: string = 'ru-KG'
): string {
  const targetDate = typeof date === 'string' ? parseDateTime(date) : date
  
  if (!targetDate) {
    return ''
  }
  
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Bishkek',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(targetDate)
}

/**
 * Format time only (HH:MM)
 * @param date - Date object or ISO string
 * @returns Formatted time string (e.g., "15:30")
 */
export function formatTimeOnly(date: Date | string): string {
  const targetDate = typeof date === 'string' ? parseDateTime(date) : date
  
  if (!targetDate) {
    return ''
  }
  
  return new Intl.DateTimeFormat('ru-KG', {
    timeZone: 'Asia/Bishkek',
    hour: '2-digit',
    minute: '2-digit',
  }).format(targetDate)
}

/**
 * Check if date is today (in Asia/Bishkek timezone)
 * @param date - Date object or ISO string
 * @returns true if date is today
 */
export function isToday(date: Date | string): boolean {
  const targetDate = typeof date === 'string' ? parseDateTime(date) : date
  
  if (!targetDate) {
    return false
  }
  
  const now = new Date()
  const targetStart = startOfDay(targetDate)
  const nowStart = startOfDay(now)
  
  return targetStart.getTime() === nowStart.getTime()
}

/**
 * Validate IANA timezone
 * @param timezone - Timezone string (e.g., "Asia/Bishkek")
 * @returns true if valid
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone })
    return true
  } catch {
    return false
  }
}
