/**
 * Comparison: Before vs After Fix
 * Demonstrates the race condition fix in OTP verification
 */

import { PrismaClient, OtpPurpose } from '@prisma/client'
import { hashPassword } from '../lib/auth/password'

const prisma = new PrismaClient()

// BEFORE FIX: Non-atomic consumption (vulnerable)
async function testBeforeFix(challengeId: string, code: string, requestId: number) {
  try {
    // Step 1: Read challenge
    const challenge = await prisma.otpChallenge.findUnique({
      where: { id: challengeId },
    })

    if (!challenge) return { success: false, error: 'NOT_FOUND' }

    // Step 2: Check consumed (non-atomic!)
    if (challenge.consumedAt) {
      return { success: false, error: 'ALREADY_USED' }
    }

    // Step 3: Check other conditions
    if (challenge.expiresAt < new Date()) {
      return { success: false, error: 'EXPIRED' }
    }

    if (challenge.attempts >= 5) {
      return { success: false, error: 'TOO_MANY_ATTEMPTS' }
    }

    // Step 4: Verify code
    const bcrypt = require('bcryptjs')
    const isValid = await bcrypt.compare(code, challenge.codeHash)

    if (!isValid) {
      // Atomic increment (this part was correct)
      await prisma.otpChallenge.update({
        where: { id: challengeId },
        data: { attempts: { increment: 1 } },
      })
      return { success: false, error: 'INVALID_CODE' }
    }

    // Step 5: Mark consumed (separate operation - RACE WINDOW!)
    await prisma.otpChallenge.update({
      where: { id: challengeId },
      data: { consumedAt: new Date() },
    })

    // Step 6: Create session
    console.log(`  [Before ${requestId}] ✅ SUCCESS (vulnerable)`)
    return { success: true, sessionId: `session_before_${requestId}` }
  } catch (error) {
    return { success: false, error: 'ERROR' }
  }
}

// AFTER FIX: Atomic consumption (secure)
async function testAfterFix(challengeId: string, code: string, requestId: number) {
  try {
    // Step 1: Read challenge
    const challenge = await prisma.otpChallenge.findUnique({
      where: { id: challengeId },
    })

    if (!challenge) return { success: false, error: 'NOT_FOUND' }

    // Step 2: Early checks (optimization)
    if (challenge.consumedAt) {
      return { success: false, error: 'ALREADY_USED' }
    }

    if (challenge.expiresAt < new Date()) {
      return { success: false, error: 'EXPIRED' }
    }

    if (challenge.attempts >= 5) {
      return { success: false, error: 'TOO_MANY_ATTEMPTS' }
    }

    // Step 3: Verify code
    const bcrypt = require('bcryptjs')
    const isValid = await bcrypt.compare(code, challenge.codeHash)

    if (!isValid) {
      // Atomic increment with conditions
      await prisma.otpChallenge.updateMany({
        where: {
          id: challengeId,
          consumedAt: null,
          expiresAt: { gte: new Date() },
          attempts: { lt: 5 },
        },
        data: { attempts: { increment: 1 } },
      })
      return { success: false, error: 'INVALID_CODE' }
    }

    // Step 4: ATOMIC CONSUMPTION
    const now = new Date()
    const consumed = await prisma.otpChallenge.updateMany({
      where: {
        id: challengeId,
        consumedAt: null, // Critical: only if not consumed
        expiresAt: { gte: now },
        attempts: { lt: 5 },
      },
      data: { consumedAt: now },
    })

    if (consumed.count === 0) {
      // Lost the race
      return { success: false, error: 'ALREADY_USED' }
    }

    // Step 5: Create session
    console.log(`  [After ${requestId}] ✅ SUCCESS (secure)`)
    return { success: true, sessionId: `session_after_${requestId}` }
  } catch (error) {
    return { success: false, error: 'ERROR' }
  }
}

async function main() {
  console.log('🔬 Comparison: Before vs After Fix\n')

  const testPhone = '+996555999011'
  const purpose = OtpPurpose.LOGIN

  // Clean up
  await prisma.otpChallenge.deleteMany({ where: { phone: testPhone } })

  // === TEST 1: BEFORE FIX (Vulnerable) ===
  console.log('🔴 BEFORE FIX: 5 concurrent requests\n')

  const challenge1 = await prisma.otpChallenge.create({
    data: {
      phone: testPhone,
      purpose,
      codeHash: await hashPassword('111111'),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    },
  })

  console.log(`Challenge ID: ${challenge1.id.substring(0, 8)}...`)
  console.log(`Testing vulnerable code (non-atomic)...\n`)

  const promises1 = Array.from({ length: 5 }, (_, i) =>
    testBeforeFix(challenge1.id, '111111', i + 1).catch(() => ({ success: false, error: 'ERROR' }))
  )

  const results1 = await Promise.all(promises1)
  const successes1 = results1.filter((r) => r.success).length

  console.log(`\n📊 BEFORE Results:`)
  console.log(`  Successful verifications: ${successes1}`)

  if (successes1 > 1) {
    console.log(`  ❌ VULNERABLE: ${successes1} sessions created from 1 OTP`)
    console.log(`     Race condition allows multiple successes\n`)
  } else {
    console.log(`  ⚠️  Got lucky: Only ${successes1} success (timing dependent)\n`)
  }

  // Clean up
  await prisma.otpChallenge.deleteMany({ where: { id: challenge1.id } })

  // === TEST 2: AFTER FIX (Secure) ===
  console.log('🟢 AFTER FIX: 5 concurrent requests\n')

  const challenge2 = await prisma.otpChallenge.create({
    data: {
      phone: testPhone,
      purpose,
      codeHash: await hashPassword('222222'),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    },
  })

  console.log(`Challenge ID: ${challenge2.id.substring(0, 8)}...`)
  console.log(`Testing fixed code (atomic consumption)...\n`)

  const promises2 = Array.from({ length: 5 }, (_, i) =>
    testAfterFix(challenge2.id, '222222', i + 1).catch(() => ({ success: false, error: 'ERROR' }))
  )

  const results2 = await Promise.all(promises2)
  const successes2 = results2.filter((r) => r.success).length

  console.log(`\n📊 AFTER Results:`)
  console.log(`  Successful verifications: ${successes2}`)

  if (successes2 === 1) {
    console.log(`  ✅ SECURE: Exactly 1 session created`)
    console.log(`     Atomic consumption prevents race condition\n`)
  } else {
    console.log(`  ❌ FIX FAILED: ${successes2} sessions created\n`)
  }

  // Clean up
  await prisma.otpChallenge.deleteMany({ where: { phone: testPhone } })

  // === SUMMARY ===
  console.log('📋 Summary:')
  console.log(`  Before fix: ${successes1} successes (vulnerable to race)`)
  console.log(`  After fix: ${successes2} successes (atomic, secure)`)

  if (successes1 > 1 && successes2 === 1) {
    console.log(`\n✅ FIX CONFIRMED: Race condition eliminated`)
  } else if (successes2 === 1) {
    console.log(`\n✅ FIX WORKING: Atomic consumption prevents multiple sessions`)
  }
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
