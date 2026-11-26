#!/usr/bin/env node
/**
 * Generate a secure CRON_SECRET for protecting cron endpoints
 * Run: node scripts/generate-cron-secret.mjs
 */

import { randomBytes } from 'crypto'

const secret = randomBytes(32).toString('base64')

console.log('='.repeat(60))
console.log('Generated CRON_SECRET:')
console.log('='.repeat(60))
console.log('')
console.log(secret)
console.log('')
console.log('Add this to your .env file:')
console.log('')
console.log(`CRON_SECRET=${secret}`)
console.log('')
console.log('='.repeat(60))
