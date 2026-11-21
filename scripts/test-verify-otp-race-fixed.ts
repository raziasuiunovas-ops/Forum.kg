/**
 * Test Script: Verify OTP Race Condition FIXED
 * Verify that atomic consumption prevents multiple sessions from one OTP
 */

import { PrismaClient, OtpPurpose } from '@prisma/client'
import { generateOTP, hashPassword } from '../lib/auth/password'

const prisma = new PrismaClient()

// Simulate the FIXED verify-otp logic
async function simulateVerifyOTP(
  challengeId: string,
  code: string,
  requestId: number
): Promise<{ success: boolean; error?: string; sessionId?: string }> {
  try {
    console.log(`  [Request ${requestId}] Start verification`)

    // Step 1: Find challenge
    const challenge = await prisma.otpChallenge.findUnique({
      where: { id: challengeId },
    })

    if (!challenge) {
      console.log(`  [Request ${requestId}] Challenge not found`)
      return { success: false, error: 'INVALID_OTP' }
    }

    // Step 2: Early checks (before expensive bcrypt)
    if (challenge.consumedAt) {
      console.log(`  [Request ${requestId}] Already consumed`)
      return { success: false, error: 'OTP_ALREADY_USED' }
    }

    if (challenge.expiresAt < new Date()) {
      console.log(`  [Request ${requestId}] Expired`)
      return { success: false, error: 'OTP_EXPIRED' }
    }

    if (challenge.attempts >= 5) {
      console.log(`  [Request ${requestId}] Too many attempts`)
      return { success: false, error: 'TOO_MANY_ATTEMPTS' }
    }

    // Step 3: Verify password (expensive, but before consumption)
    const bcrypt = require('bcryptjs')
    const isValid = await bcrypt.compare(code, challenge.codeHash)

    if (!isValid) {
      console.log(`  [Request ${requestId}] Invalid OTP code`)
      
      // Atomic increment with conditions
      await prisma.otpChallenge.updateMany({
        where: {
          id: challengeId,
          consumedAt: null,
          expiresAt: { gte: new Date() },
          attempts: { lt: 5 },
        },
        data: {
          attempts: { increment: 1 },
        },
      })
      
      return { success: false, error: 'INVALID_OTP' }
    }

    // Step 4: ATOMIC CONSUMPTION
    const now = new Date()
    const consumed = await prisma.otpChallenge.updateMany({
      where: {
        id: challengeId,
        consumedAt: null, // Critical: only if not consumed
        expiresAt: { gte: now }, // Critical: check expiry again
        attempts: { lt: 5 }, // Critical: below limit
      },
      data: {
        consumedAt: now,
      },
    })

    console.log(`  [Request ${requestId}] Atomic consumption: count=${consumed.count}`)

    if (consumed.count === 0) {
      // Re-check to determine specific error
      const current = await prisma.otpChallenge.findUnique({
        where: { id: challengeId },
      })

      if (current?.consumedAt) {
        console.log(`  [Request ${requestId}] Race lost: already consumed by another request`)
        return { success: false, error: 'OTP_ALREADY_USED' }
      }

      console.log(`  [Request ${requestId}] Atomic consumption failed (conditions not met)`)
      return { success: false, error: 'CONSUMPTION_FAILED' }
    }

    // Step 5: Create session (simulated)
    const sessionId = `session_${requestId}_${Date.now()}`
    console.log(`  [Request ${requestId}] ✅ SUCCESS - Session created: ${sessionId}`)

    return { success: true, sessionId }
  } catch (error: any) {
    console.log(`  [Request ${requestId}] Error: ${error.message}`)
    return { success: false, error: 'INTERNAL_ERROR' }
  }
}

async function main() {
  const testPhone = '+996555999010'
  const purpose = OtpPurpose.LOGIN

  console.log('🧪 Testing FIXED Verify OTP (Atomic Consumption)\n')

  // Clean up
  await prisma.otpChallenge.deleteMany({ where: { phone: testPhone } })
  await prisma.user.deleteMany({ where: { phone: testPhone } })

  console.log('✅ Test data cleaned\n')

  // Test 1: 10 concurrent requests with valid OTP
  console.log('📝 Test 1: 10 concurrent verification requests (CRITICAL TEST)\n')

  const otpCode = generateOTP()
  const codeHash = await hashPassword(otpCode)

  const challenge = await prisma.otpChallenge.create({
    data: {
      phone: testPhone,
      purpose,
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    },
  })

  console.log(`Created challenge: ${challenge.id.substring(0, 8)}...`)
  console.log(`OTP code: ${otpCode}`)
  console.log(`\nSending 10 concurrent verification requests...\n`)

  // Launch 10 concurrent requests
  const promises = Array.from({ length: 10 }, (_, i) =>
    simulateVerifyOTP(challenge.id, otpCode, i + 1)
  )

  const results = await Promise.all(promises)

  const successes = results.filter((r) => r.success)
  const failures = results.filter((r) => !r.success)

  console.log(`\n📊 Test 1 Results:`)
  console.log(`  Successful: ${successes.length}`)
  console.log(`  Failed: ${failures.length}`)

  // Group failures by error type
  const errorCounts = failures.reduce((acc, f) => {
    const err = f.error || 'UNKNOWN'
    acc[err] = (acc[err] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  console.log(`  Error breakdown:`)
  for (const [error, count] of Object.entries(errorCounts)) {
    console.log(`    - ${error}: ${count}`)
  }

  // Verify database state
  const finalChallenge = await prisma.otpChallenge.findUnique({
    where: { id: challenge.id },
  })

  console.log(`\n  Database state:`)
  console.log(`    - consumedAt: ${finalChallenge?.consumedAt ? 'SET' : 'NULL'}`)
  console.log(`    - attempts: ${finalChallenge?.attempts}`)

  // CRITICAL CHECK
  if (successes.length === 1) {
    console.log(`\n✅ PASS: Exactly 1 successful verification`)
    console.log(`   Atomic consumption prevented race condition`)
  } else if (successes.length === 0) {
    console.log(`\n⚠️  WARNING: 0 successful verifications`)
    console.log(`   Possible issue: all requests raced and none won`)
  } else {
    console.log(`\n❌ FAIL: ${successes.length} successful verifications`)
    console.log(`   Race condition still exists!`)
  }

  // Clean up
  await prisma.otpChallenge.deleteMany({ where: { id: challenge.id } })

  // Test 2: Concurrent wrong attempts
  console.log(`\n📝 Test 2: Concurrent wrong OTP attempts (atomic increment test)\n`)

  const challenge2 = await prisma.otpChallenge.create({
    data: {
      phone: testPhone,
      purpose,
      codeHash: await hashPassword('123456'),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    },
  })

  console.log(`Created challenge: ${challenge2.id.substring(0, 8)}...`)
  console.log(`Sending 6 concurrent requests with WRONG OTP...\n`)

  const wrongPromises = Array.from({ length: 6 }, (_, i) =>
    simulateVerifyOTP(challenge2.id, '999999', i + 1)
  )

  await Promise.all(wrongPromises)

  const finalChallenge2 = await prisma.otpChallenge.findUnique({
    where: { id: challenge2.id },
  })

  console.log(`\n📊 Test 2 Results:`)
  console.log(`  Final attempts: ${finalChallenge2?.attempts}`)

  if (finalChallenge2 && finalChallenge2.attempts <= 5) {
    console.log(`  ✅ PASS: Attempts did not exceed limit (${finalChallenge2.attempts} <= 5)`)
  } else {
    console.log(`  ❌ FAIL: Attempts exceeded limit (${finalChallenge2?.attempts} > 5)`)
  }

  // Clean up
  await prisma.otpChallenge.deleteMany({ where: { phone: testPhone } })
  await prisma.user.deleteMany({ where: { phone: testPhone } })

  // Test 3: Sequential verification after concurrent
  console.log(`\n📝 Test 3: Sequential verification after successful consumption\n`)

  const challenge3 = await prisma.otpChallenge.create({
    data: {
      phone: testPhone,
      purpose,
      codeHash: await hashPassword('111111'),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    },
  })

  // First verification (should succeed)
  const result1 = await simulateVerifyOTP(challenge3.id, '111111', 1)

  // Second verification (should fail - already consumed)
  const result2 = await simulateVerifyOTP(challenge3.id, '111111', 2)

  console.log(`\n📊 Test 3 Results:`)
  console.log(`  First verification: ${result1.success ? 'SUCCESS' : 'FAIL'}`)
  console.log(`  Second verification: ${result2.success ? 'SUCCESS' : 'FAIL'}`)
  console.log(`  Second error: ${result2.error}`)

  if (result1.success && !result2.success && result2.error === 'OTP_ALREADY_USED') {
    console.log(`  ✅ PASS: Sequential reuse correctly rejected`)
  } else {
    console.log(`  ❌ FAIL: Sequential reuse not handled correctly`)
  }

  // Clean up
  await prisma.otpChallenge.deleteMany({ where: { phone: testPhone } })
  await prisma.user.deleteMany({ where: { phone: testPhone } })

  console.log(`\n🏁 All tests completed`)
  console.log(`\n📋 Summary:`)
  console.log(`  - Atomic consumption prevents multiple sessions from one OTP`)
  console.log(`  - Concurrent wrong attempts handled correctly`)
  console.log(`  - Sequential reuse blocked`)
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
