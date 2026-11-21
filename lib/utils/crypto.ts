/**
 * Cryptographic utilities for FORUM.KG
 * Session token hashing using SHA-256
 */

import { createHash } from 'crypto';

/**
 * Hash a refresh token using SHA-256 for secure storage
 * 
 * @param token - Raw refresh token (JWT string)
 * @returns 64-character hex string (SHA-256 hash)
 * 
 * @example
 * ```ts
 * const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
 * const hash = hashToken(token);
 * // hash = "a3d5e8f9b2c1d4e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1"
 * ```
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
