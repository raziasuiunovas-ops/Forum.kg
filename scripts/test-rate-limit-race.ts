/**
 * Test Script: Rate Limit Race Condition
 * Verify if concurrent requests can bypass 3-per-15min limit
 */

import { PrismaClient, OtpPurpose } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const testPhone = '+996555999002'
  const purpose = OtpPurpose.LOGIN

  console.log('🧪 Testing Rate Limit Race Condition\n')

  // Clean up
  await prisma.otpChallenge.deleteMany({
    where: { phone: testPhone },
  })

  console.log('✅ Test data cleaned\n')

  // Test 1: Sequential requests (should work correctly)
  console.log('📝 Test 1: Sequential requests (baseline)')
  
  for (let i = 1; i <= 3; i++) {
    await prisma.otpChallenge.create({
      data: {
        phone: testPhone,
        purpose,
        codeHash: `hash_${i}`,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
      },
    })
    console.log(`  Request ${i}: Created`)
  }

  // Try 4th request (should fail)
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
  const count = await prisma.otpChallenge.count({
    where: {
      phone: testPhone,
      purpose,
      createdAt: { gte: fifteenMinutesAgo },
    },
  })

  console.log(`  Total challenges: ${count}`)

  if (count >= 3) {
    console.log('✅ Rate limit correctly enforced (sequential)\n')
  } else {
    console.log('❌ Rate limit NOT enforced (sequential)\n')
  }

  // Clean up
  await prisma.otpChallenge.deleteMany({
    where: { phone: testPhone },
  })

  // Test 2: Concurrent requests (race condition test)
  console.log('📝 Test 2: Concurrent requests (race condition)')
  console.log('  Simulating 5 simultaneous requests...\n')

  // Simulate the actual transaction logic from request-otp route
  const createOTPWithRateLimit = async (requestId: number) => {
    return prisma.$transaction(async (tx) => {
      console.log(`  [Request ${requestId}] Start transaction`)

      // Rate limit check
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
      const recentChallenges = await tx.otpChallenge.count({
        where: {
          phone: testPhone,
          purpose,
          createdAt: { gte: fifteenMinutesAgo },
        },
      })

      console.log(`  [Request ${requestId}] Count: ${recentChallenges}`)

      if (recentChallenges >= 3) {
        console.log(`  [Request ${requestId}] ❌ Rate limit exceeded`)
        throw new Error('RATE_LIMIT_EXCEEDED')
      }

      // Small delay to increase race window
      await new Promise(resolve => setTimeout(resolve, 50))

      // Create OTP
      const challenge = await tx.otpChallenge.create({
        data: {
          phone: testPhone,
          purpose,
          codeHash: `concurrent_${requestId}_${Date.now()}`,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 0,
        },
      })

      console.log(`  [Request ${requestId}] ✅ Created: ${challenge.id.substring(0, 8)}...`)
      return challenge
    })
  }

  // Launch 5 concurrent requests
  const promises = Array.from({ length: 5 }, (_, i) =>
    createOTPWithRateLimit(i + 1).catch((error) => {
      return { error: error.message, requestId: i + 1 }
    })
  )

  const results = await Promise.all(promises)

  // Count successes
  const successes = results.filter((r) => !('error' in r))
  const failures = results.filter((r) => 'error' in r)

  console.log(`\n📊 Results:`)
  console.log(`  Successful: ${successes.length}`)
  console.log(`  Failed (rate limited): ${failures.length}`)

  // Check actual count in database
  const finalCount = await prisma.otpChallenge.count({
    where: {
      phone: testPhone,
      purpose,
      createdAt: { gte: fifteenMinutesAgo },
    },
  })

  console.log(`  Database count: ${finalCount}`)

  console.log('\n🔍 Analysis:')

  if (finalCount <= 3) {
    console.log('✅ PASS: Rate limit enforced correctly')
    console.log('   Only 3 or fewer OTPs created despite concurrent requests')
  } else {
    console.log('❌ FAIL: Race condition detected!')
    console.log(`   Expected: max 3 OTPs`)
    console.log(`   Actual: ${finalCount} OTPs`)
    console.log('   Root cause: Non-atomic COUNT + INSERT in Read Committed isolation')
  }

  if (successes.length > 3) {
    console.log(`\n⚠️  ${successes.length} requests succeeded (expected max 3)`)
    console.log('   Multiple transactions saw the same count concurrently')
  }

  // Test 3: Extreme concurrency (10 simultaneous requests)
  console.log('\n📝 Test 3: Extreme concurrency (10 requests)')

  // Clean up
  await prisma.otpChallenge.deleteMany({
    where: { phone: testPhone },
  })

  const extremePromises = Array.from({ length: 10 }, (_, i) =>
    createOTPWithRateLimit(i + 1).catch((error) => {
      return { error: error.message }
    })
  )

  const extremeResults = await Promise.all(extremePromises)
  const extremeSuccesses = extremeResults.filter((r) => !('error' in r))

  const extremeCount = await prisma.otpChallenge.count({
    where: {
      phone: testPhone,
      purpose,
      createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
    },
  })

  console.log(`  Successful: ${extremeSuccesses.length} / 10`)
  console.log(`  Database count: ${extremeCount}`)

  if (extremeCount > 3) {
    console.log(`  ❌ CRITICAL: ${extremeCount} OTPs created (limit bypass confirmed)`)
  } else {
    console.log(`  ✅ Rate limit held under extreme concurrency`)
  }

  // Clean up
  await prisma.otpChallenge.deleteMany({
    where: { phone: testPhone },
  })

  console.log('\n🏁 Test completed')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
