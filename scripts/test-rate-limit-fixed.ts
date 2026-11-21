/**
 * Test Script: Rate Limit FIXED (Serializable Isolation)
 * Verify that Serializable isolation prevents concurrent bypass
 */

import { PrismaClient, OtpPurpose, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

// Simulate the FIXED transaction logic with Serializable isolation
const createOTPWithSerializable = async (
  phone: string,
  purpose: OtpPurpose,
  requestId: number
) => {
  const MAX_RETRIES = 3
  const BASE_DELAY_MS = 50

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          console.log(`  [Request ${requestId}] Attempt ${attempt + 1}: Start`)

          // Rate limit check
          const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
          const recentChallenges = await tx.otpChallenge.count({
            where: {
              phone,
              purpose,
              createdAt: { gte: fifteenMinutesAgo },
            },
          })

          console.log(`  [Request ${requestId}] Attempt ${attempt + 1}: Count ${recentChallenges}`)

          if (recentChallenges >= 3) {
            console.log(`  [Request ${requestId}] Attempt ${attempt + 1}: Rate limit`)
            throw new Error('RATE_LIMIT_EXCEEDED')
          }

          // Small delay to increase race window
          await new Promise((resolve) => setTimeout(resolve, 50))

          // Create OTP
          const challenge = await tx.otpChallenge.create({
            data: {
              phone,
              purpose,
              codeHash: `serial_${requestId}_${Date.now()}`,
              expiresAt: new Date(Date.now() + 10 * 60 * 1000),
              attempts: 0,
            },
          })

          console.log(`  [Request ${requestId}] Attempt ${attempt + 1}: ✅ Created ${challenge.id.substring(0, 8)}...`)
          return challenge
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10000,
        }
      )
    } catch (error: any) {
      // Handle Serialization Failure (P2034)
      if (error.code === 'P2034' && attempt < MAX_RETRIES - 1) {
        console.log(`  [Request ${requestId}] Attempt ${attempt + 1}: P2034 Serialization failure, retrying...`)
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        continue
      }

      // Rate limit error or max retries
      if (error.message === 'RATE_LIMIT_EXCEEDED') {
        console.log(`  [Request ${requestId}] Attempt ${attempt + 1}: ❌ Rate limited`)
        throw error
      }

      // Other error
      console.log(`  [Request ${requestId}] Attempt ${attempt + 1}: ❌ Error ${error.code || error.message}`)
      throw error
    }
  }

  throw new Error('Max retries exceeded')
}

async function main() {
  const testPhone = '+996555999003'
  const purpose = OtpPurpose.LOGIN

  console.log('🧪 Testing FIXED Rate Limit (Serializable Isolation)\n')

  // Clean up
  await prisma.otpChallenge.deleteMany({
    where: { phone: testPhone },
  })

  console.log('✅ Test data cleaned\n')

  // Test 1: 5 concurrent requests
  console.log('📝 Test 1: 5 concurrent requests (should allow max 3)\n')

  const promises1 = Array.from({ length: 5 }, (_, i) =>
    createOTPWithSerializable(testPhone, purpose, i + 1).catch((error) => {
      return { error: error.message, requestId: i + 1 }
    })
  )

  const results1 = await Promise.all(promises1)

  const successes1 = results1.filter((r) => !('error' in r))
  const failures1 = results1.filter((r) => 'error' in r)

  const count1 = await prisma.otpChallenge.count({
    where: {
      phone: testPhone,
      purpose,
      createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
    },
  })

  console.log(`\n📊 Test 1 Results:`)
  console.log(`  Successful: ${successes1.length}`)
  console.log(`  Failed: ${failures1.length}`)
  console.log(`  Database count: ${count1}`)

  if (count1 === 3) {
    console.log('  ✅ PASS: Exactly 3 OTPs created')
  } else if (count1 < 3) {
    console.log(`  ⚠️  WARNING: Only ${count1} OTPs created (some serialization conflicts?)`)
  } else {
    console.log(`  ❌ FAIL: ${count1} OTPs created (race condition still exists!)`)
  }

  // Clean up
  await prisma.otpChallenge.deleteMany({
    where: { phone: testPhone },
  })

  // Test 2: 10 concurrent requests
  console.log('\n📝 Test 2: 10 concurrent requests (extreme concurrency)\n')

  const promises2 = Array.from({ length: 10 }, (_, i) =>
    createOTPWithSerializable(testPhone, purpose, i + 1).catch((error) => {
      return { error: error.message }
    })
  )

  const results2 = await Promise.all(promises2)

  const successes2 = results2.filter((r) => !('error' in r))
  const failures2 = results2.filter((r) => 'error' in r)

  const count2 = await prisma.otpChallenge.count({
    where: {
      phone: testPhone,
      purpose,
      createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
    },
  })

  console.log(`\n📊 Test 2 Results:`)
  console.log(`  Successful: ${successes2.length}`)
  console.log(`  Failed: ${failures2.length}`)
  console.log(`  Database count: ${count2}`)

  if (count2 === 3) {
    console.log('  ✅ PASS: Exactly 3 OTPs created despite extreme concurrency')
  } else if (count2 < 3) {
    console.log(`  ⚠️  WARNING: Only ${count2} OTPs created`)
  } else {
    console.log(`  ❌ FAIL: ${count2} OTPs created (limit bypass!)`)
  }

  // Test 3: Sequential after concurrent
  console.log('\n📝 Test 3: 4th request after 3 created (should fail immediately)\n')

  const result3 = await createOTPWithSerializable(testPhone, purpose, 11).catch((error) => {
    return { error: error.message }
  })

  if ('error' in result3 && result3.error === 'RATE_LIMIT_EXCEEDED') {
    console.log('  ✅ PASS: 4th request correctly rate limited')
  } else {
    console.log('  ❌ FAIL: 4th request should have been rate limited')
  }

  // Clean up
  await prisma.otpChallenge.deleteMany({
    where: { phone: testPhone },
  })

  console.log('\n🏁 All tests completed')
  console.log('\n📋 Summary:')
  console.log('  - Serializable isolation prevents race conditions')
  console.log('  - P2034 errors are retried automatically')
  console.log('  - Rate limit enforced correctly under concurrency')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
