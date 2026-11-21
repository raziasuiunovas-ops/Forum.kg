/**
 * Manual Test Script: OTP Invalidation
 * Run with: npx tsx scripts/test-otp-invalidation.ts
 */

import { PrismaClient, OtpPurpose } from '@prisma/client'
import { generateOTP, hashPassword, verifyPassword } from '../lib/auth/password'

const prisma = new PrismaClient()

async function main() {
  const testPhone = '+996555999001'
  const purpose = OtpPurpose.LOGIN

  console.log('🧪 Testing OTP Invalidation Logic\n')

  // Clean up previous test data
  await prisma.otpChallenge.deleteMany({
    where: { phone: testPhone },
  })

  console.log('✅ Test data cleaned\n')

  // Test 1: Create first OTP
  console.log('📝 Test 1: Create first OTP')
  const otp1 = generateOTP()
  console.log(`Generated OTP1: ${otp1}`)
  const hash1 = await hashPassword(otp1)
  
  const challenge1 = await prisma.otpChallenge.create({
    data: {
      phone: testPhone,
      purpose,
      codeHash: hash1,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    },
  })

  console.log(`Challenge1 ID: ${challenge1.id}`)
  console.log(`Challenge1 consumedAt: ${challenge1.consumedAt}`)
  console.log('✅ First OTP created\n')

  // Test 2: Create second OTP (should invalidate first)
  console.log('📝 Test 2: Request second OTP (should invalidate first)')
  
  const result = await prisma.$transaction(async (tx) => {
    // Count active challenges before invalidation
    const activeBefore = await tx.otpChallenge.count({
      where: {
        phone: testPhone,
        purpose,
        consumedAt: null,
        expiresAt: { gte: new Date() },
      },
    })
    console.log(`Active challenges before: ${activeBefore}`)

    // Invalidate previous challenges
    const invalidated = await tx.otpChallenge.updateMany({
      where: {
        phone: testPhone,
        purpose,
        consumedAt: null,
        expiresAt: { gte: new Date() },
      },
      data: { consumedAt: new Date() },
    })
    console.log(`Invalidated challenges: ${invalidated.count}`)

    // Create new challenge
    const otp2 = generateOTP()
    console.log(`Generated OTP2: ${otp2}`)
    const hash2 = await hashPassword(otp2)
    
    const challenge2 = await tx.otpChallenge.create({
      data: {
        phone: testPhone,
        purpose,
        codeHash: hash2,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
      },
    })

    // Count active challenges after
    const activeAfter = await tx.otpChallenge.count({
      where: {
        phone: testPhone,
        purpose,
        consumedAt: null,
        expiresAt: { gte: new Date() },
      },
    })
    console.log(`Active challenges after: ${activeAfter}`)

    return { challenge2, otp2, activeAfter }
  })

  console.log(`Challenge2 ID: ${result.challenge2.id}`)
  console.log(`Challenge2 consumedAt: ${result.challenge2.consumedAt}`)
  console.log('✅ Second OTP created\n')

  // Test 3: Verify first OTP is invalidated
  console.log('📝 Test 3: Check first OTP status')
  const updatedChallenge1 = await prisma.otpChallenge.findUnique({
    where: { id: challenge1.id },
  })

  if (updatedChallenge1) {
    console.log(`Challenge1 consumedAt: ${updatedChallenge1.consumedAt}`)
    if (updatedChallenge1.consumedAt) {
      console.log('✅ First OTP is correctly invalidated')
    } else {
      console.log('❌ FAILED: First OTP is still active!')
    }
  }

  // Test 4: Verify old OTP should be rejected
  console.log('\n📝 Test 4: Try to verify old (invalidated) OTP')
  if (updatedChallenge1) {
    // Check consumedAt (should fail)
    if (updatedChallenge1.consumedAt) {
      console.log('✅ Old OTP rejected: consumedAt is set')
    } else {
      console.log('❌ Old OTP would be accepted: consumedAt is null')
    }

    // Check if code is still valid (cryptographically)
    const isCodeValid = await verifyPassword(otp1, updatedChallenge1.codeHash)
    console.log(`Code cryptographically valid: ${isCodeValid}`)
    console.log('(This is expected - code is correct but should be rejected by consumedAt check)')
  }

  // Test 5: Verify new OTP can be used
  console.log('\n📝 Test 5: Verify new OTP is valid')
  const newChallenge = await prisma.otpChallenge.findUnique({
    where: { id: result.challenge2.id },
  })

  if (newChallenge) {
    console.log(`New OTP consumedAt: ${newChallenge.consumedAt}`)
    console.log(`New OTP expiresAt: ${newChallenge.expiresAt}`)
    console.log(`New OTP attempts: ${newChallenge.attempts}`)
    
    const checks = {
      notConsumed: newChallenge.consumedAt === null,
      notExpired: newChallenge.expiresAt > new Date(),
      belowAttemptLimit: newChallenge.attempts < 5,
      codeValid: await verifyPassword(result.otp2, newChallenge.codeHash),
    }

    console.log(`\nValidation checks:`)
    console.log(`  - Not consumed: ${checks.notConsumed}`)
    console.log(`  - Not expired: ${checks.notExpired}`)
    console.log(`  - Below attempt limit: ${checks.belowAttemptLimit}`)
    console.log(`  - Code valid: ${checks.codeValid}`)

    if (Object.values(checks).every(v => v)) {
      console.log('✅ New OTP is valid and can be used')
    } else {
      console.log('❌ FAILED: New OTP has validation issues')
    }
  }

  // Test 6: Concurrent requests simulation
  console.log('\n📝 Test 6: Simulate concurrent OTP requests')
  
  // Clean up
  await prisma.otpChallenge.deleteMany({
    where: { phone: testPhone },
  })

  const concurrentRequests = 3
  const promises = Array.from({ length: concurrentRequests }, async (_, i) => {
    return prisma.$transaction(async (tx) => {
      console.log(`  Request ${i + 1}: Start`)

      // Invalidate previous
      const invalidated = await tx.otpChallenge.updateMany({
        where: {
          phone: testPhone,
          purpose,
          consumedAt: null,
          expiresAt: { gte: new Date() },
        },
        data: { consumedAt: new Date() },
      })

      // Small delay to increase race condition likelihood
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100))

      // Create new
      const otp = generateOTP()
      const hash = await hashPassword(otp)
      const challenge = await tx.otpChallenge.create({
        data: {
          phone: testPhone,
          purpose,
          codeHash: hash,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 0,
        },
      })

      console.log(`  Request ${i + 1}: Created challenge ${challenge.id.substring(0, 8)}...`)
      return challenge
    })
  })

  const results = await Promise.all(promises)
  console.log(`\n  Created ${results.length} challenges`)

  // Check how many are still active
  const activeCount = await prisma.otpChallenge.count({
    where: {
      phone: testPhone,
      purpose,
      consumedAt: null,
      expiresAt: { gte: new Date() },
    },
  })

  console.log(`  Active challenges: ${activeCount}`)

  if (activeCount === 1) {
    console.log('✅ Perfect: Only 1 active challenge (race condition prevented)')
  } else if (activeCount > 1) {
    console.log(`⚠️  WARNING: ${activeCount} active challenges (race condition detected)`)
    console.log('   This is expected with PostgreSQL Read Committed isolation level')
    console.log('   Impact: User may receive multiple SMS with different codes')
    console.log('   Mitigation: Rate limiting (3 per 15min) reduces likelihood')
  } else {
    console.log('❌ FAILED: No active challenges found')
  }

  // Test 7: Test expired OTP not invalidated
  console.log('\n📝 Test 7: Expired OTP should not be invalidated')
  
  await prisma.otpChallenge.deleteMany({
    where: { phone: testPhone },
  })

  // Create expired OTP
  const expiredOtp = generateOTP()
  const expiredHash = await hashPassword(expiredOtp)
  const expiredChallenge = await prisma.otpChallenge.create({
    data: {
      phone: testPhone,
      purpose,
      codeHash: expiredHash,
      expiresAt: new Date(Date.now() - 1000), // Already expired
      attempts: 0,
    },
  })
  console.log(`Created expired challenge: ${expiredChallenge.id}`)

  // Request new OTP
  await prisma.$transaction(async (tx) => {
    await tx.otpChallenge.updateMany({
      where: {
        phone: testPhone,
        purpose,
        consumedAt: null,
        expiresAt: { gte: new Date() },
      },
      data: { consumedAt: new Date() },
    })

    const newOtp = generateOTP()
    const newHash = await hashPassword(newOtp)
    await tx.otpChallenge.create({
      data: {
        phone: testPhone,
        purpose,
        codeHash: newHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
      },
    })
  })

  // Check expired challenge
  const checkExpired = await prisma.otpChallenge.findUnique({
    where: { id: expiredChallenge.id },
  })

  if (checkExpired && checkExpired.consumedAt === null) {
    console.log('✅ Expired OTP was NOT invalidated (correct behavior)')
  } else {
    console.log('❌ FAILED: Expired OTP was invalidated')
  }

  // Clean up
  await prisma.otpChallenge.deleteMany({
    where: { phone: testPhone },
  })

  console.log('\n🏁 All tests completed')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
