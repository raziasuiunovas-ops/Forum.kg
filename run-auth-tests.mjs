#!/usr/bin/env node
/**
 * Test runner for auth-rbac-security tests
 * Loads .env before running tests to ensure JWT secrets are available
 */

import { config } from 'dotenv'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load .env first
config()

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Run tsx with the test file
const testFile = join(__dirname, 'tests', 'security', 'auth-rbac-security.test.ts')

const child = spawn('npx', ['tsx', testFile], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env }
})

child.on('exit', (code) => {
  process.exit(code || 0)
})
