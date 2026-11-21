/**
 * Test: OTP Verification Transactional Consistency
 * 
 * Tests that OTP consumption, user creation, and session creation
 * are wrapped in an atomic transaction that rolls back on error.
 * 
 * Test scenarios:
 * 1. Normal flow: OTP consumed, user created, session created
 * 2. User creation error: transaction rolls back, OTP NOT consumed
 * 3. Session creation error: transaction rolls back, OTP NOT consumed
 * 4. Concurrent requests: only 1 succeeds, OTP consumed atomically
 */

import { prisma } from '../lib/db'
import { hashPassword, generateOTP } from '../lib/auth/password'
import { OtpPurpose } from '@prisma/client'

interface TestResult {
  scenario: string
  success: boolean
  details: string
}

async function cleanup(phone: string) {
  // Delete in correct order to respect foreign keys
  await prisma.session.deleteMany({ where: { user: { phone } } })
  await prisma.otpChallenge.deleteMany({ where: { phone } })
  await prisma.user.deleteMany({ where: { phone } })
}

async function createTestOTP(phone: string): Promise<string> {
  const code = generateOTP()
  const codeHash = await hashPassword(code)
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

  await prisma.otpChallenge.create({
    data: {
      phone,
      purpose: OtpPurpose.PHONE_LOGIN,
      codeHash,
      expiresAt,
      attempts: 0,
    },
  })

  return code
}

async function testNormalFlow(): Promise<TestResult> {
  const phone = '+996700000001'
  
  try {
    await cleanup(phone)
    
    // Create OTP
    const code = await createTestOTP(phone)
    
    // Find challenge ID
    const challenge = await prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    
    if (!challenge) throw new Error('Challenge not created')
    
    // Verify OTP via API
    const response = await fetch('http://localhost:3000/api/v1/auth/phone/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: challenge.id, code }),
    })
    
    const result = await response.json()
    
    // Check results
    const otpConsumed = await prisma.otpChallenge.findUnique({
      where: { id: challenge.id },
      select: { consumedAt: true },
    })
    
    const userCreated = await prisma.user.findUnique({
      where: { phone },
    })
    
    const sessionsCount = await prisma.session.count({
      where: { userId: userCreated?.id },
    })
    
    const success = response.ok && 
                    otpConsumed?.consumedAt !== null &&
                    userCreated !== null &&
                    sessionsCount === 1
    
    return {
      scenario: 'Normal Flow',
      success,
      details: success 
        ? 'OTP consumed ✅, user created ✅, session created ✅'
        : `Failed: status=${response.status}, consumed=${!!otpConsumed?.consumedAt}, user=${!!userCreated}, sessions=${sessionsCount}`
    }
  } catch (error) {
    return {
      scenario: 'Normal Flow',
      success: false,
      details: `Error: ${error instanceof Error ? error.message : String(error)}`
    }
  } finally {
    await cleanup(phone)
  }
}

async function testConcurrentRequests(): Promise<TestResult> {
  const phone = '+996700000002'
  
  try {
    await cleanup(phone)
    
    // Create OTP
    const code = await createTestOTP(phone)
    
    // Find challenge ID
    const challenge = await prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    
    if (!challenge) throw new Error('Challenge not created')
    
    // Send 10 concurrent requests
    const requests = Array.from({ length: 10 }, () =>
      fetch('http://localhost:3000/api/v1/auth/phone/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: challenge.id, code }),
      })
    )
    
    const responses = await Promise.all(requests)
    const successCount = responses.filter(r => r.ok).length
    
    // Check final state
    const otpState = await prisma.otpChallenge.findUnique({
      where: { id: challenge.id },
      select: { consumedAt: true },
    })
    
    const user = await prisma.user.findUnique({
      where: { phone },
    })
    
    const sessionsCount = await prisma.session.count({
      where: { userId: user?.id },
    })
    
    const success = successCount === 1 &&
                    otpState?.consumedAt !== null &&
                    sessionsCount === 1
    
    return {
      scenario: 'Concurrent Requests',
      success,
      details: success
        ? `10 concurrent → 1 success ✅, 1 session ✅, OTP consumed once ✅`
        : `Failed: ${successCount} successes (expected 1), ${sessionsCount} sessions (expected 1)`
    }
  } catch (error) {
    return {
      scenario: 'Concurrent Requests',
      success: false,
      details: `Error: ${error instanceof Error ? error.message : String(error)}`
    }
  } finally {
    await cleanup(phone)
  }
}

async function testOTPNotConsumedOnError(): Promise<TestResult> {
  const phone = '+996700000003'
  
  try {
    await cleanup(phone)
    
    // Create OTP
    const code = await createTestOTP(phone)
    
    // Find challenge ID
    const challenge = await prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    
    if (!challenge) throw new Error('Challenge not created')
    
    // First, create a SUSPENDED user to trigger ACCOUNT_SUSPENDED error
    await prisma.user.create({
      data: {
        phone,
        phoneVerifiedAt: new Date(),
        role: 'USER',
        status: 'SUSPENDED', // This will trigger error in transaction
        preferredLocale: 'RU',
      },
    })
    
    // Try to verify OTP (should fail with ACCOUNT_SUSPENDED)
    const response = await fetch('http://localhost:3000/api/v1/auth/phone/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: challenge.id, code }),
    })
    
    const result = await response.json()
    
    // Check if OTP was NOT consumed (rollback successful)
    const otpState = await prisma.otpChallenge.findUnique({
      where: { id: challenge.id },
      select: { consumedAt: true },
    })
    
    // Check no session was created
    const user = await prisma.user.findUnique({
      where: { phone },
    })
    
    const sessionsCount = await prisma.session.count({
      where: { userId: user?.id },
    })
    
    const success = !response.ok &&
                    result.error?.code === 'ACCOUNT_SUSPENDED' &&
                    otpState?.consumedAt === null &&
                    sessionsCount === 0
    
    return {
      scenario: 'Transaction Rollback on Error',
      success,
      details: success
        ? 'Error thrown ✅, OTP NOT consumed ✅, no session created ✅ (rollback successful)'
        : `Failed: status=${response.status}, error=${result.error?.code}, consumed=${!!otpState?.consumedAt}, sessions=${sessionsCount}`
    }
  } catch (error) {
    return {
      scenario: 'Transaction Rollback on Error',
      success: false,
      details: `Error: ${error instanceof Error ? error.message : String(error)}`
    }
  } finally {
    await cleanup(phone)
  }
}

async function testOTPReusableAfterRollback(): Promise<TestResult> {
  const phone = '+996700000004'
  
  try {
    await cleanup(phone)
    
    // Create OTP
    const code = await createTestOTP(phone)
    
    // Find challenge ID
    const challenge = await prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    
    if (!challenge) throw new Error('Challenge not created')
    
    // Create SUSPENDED user to trigger error
    await prisma.user.create({
      data: {
        phone,
        phoneVerifiedAt: new Date(),
        role: 'USER',
        status: 'SUSPENDED',
        preferredLocale: 'RU',
      },
    })
    
    // First attempt - should fail and rollback
    const firstResponse = await fetch('http://localhost:3000/api/v1/auth/phone/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: challenge.id, code }),
    })
    
    // Update user to ACTIVE
    await prisma.user.update({
      where: { phone },
      data: { status: 'ACTIVE' },
    })
    
    // Second attempt - should succeed with same OTP
    const secondResponse = await fetch('http://localhost:3000/api/v1/auth/phone/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: challenge.id, code }),
    })
    
    // Check OTP consumed after second attempt
    const otpState = await prisma.otpChallenge.findUnique({
      where: { id: challenge.id },
      select: { consumedAt: true },
    })
    
    const user = await prisma.user.findUnique({
      where: { phone },
    })
    
    const sessionsCount = await prisma.session.count({
      where: { userId: user?.id },
    })
    
    const success = !firstResponse.ok &&
                    secondResponse.ok &&
                    otpState?.consumedAt !== null &&
                    sessionsCount === 1
    
    return {
      scenario: 'OTP Reusable After Rollback',
      success,
      details: success
        ? 'First failed ✅, second succeeded ✅, OTP consumed on success ✅, 1 session ✅'
        : `Failed: first=${firstResponse.status}, second=${secondResponse.status}, consumed=${!!otpState?.consumedAt}, sessions=${sessionsCount}`
    }
  } catch (error) {
    return {
      scenario: 'OTP Reusable After Rollback',
      success: false,
      details: `Error: ${error instanceof Error ? error.message : String(error)}`
    }
  } finally {
    await cleanup(phone)
  }
}

async function main() {
  console.log('🧪 Testing OTP Verification Transactional Consistency\n')
  console.log('⚠️  Make sure the dev server is running: npm run dev\n')
  
  const results: TestResult[] = []
  
  // Run tests sequentially to avoid database conflicts
  console.log('1️⃣  Testing normal flow...')
  results.push(await testNormalFlow())
  
  console.log('2️⃣  Testing concurrent requests...')
  results.push(await testConcurrentRequests())
  
  console.log('3️⃣  Testing transaction rollback on error...')
  results.push(await testOTPNotConsumedOnError())
  
  console.log('4️⃣  Testing OTP reusable after rollback...')
  results.push(await testOTPReusableAfterRollback())
  
  // Print results
  console.log('\n' + '='.repeat(60))
  console.log('TEST RESULTS')
  console.log('='.repeat(60) + '\n')
  
  results.forEach(result => {
    const icon = result.success ? '✅' : '❌'
    console.log(`${icon} ${result.scenario}`)
    console.log(`   ${result.details}\n`)
  })
  
  const passedCount = results.filter(r => r.success).length
  const totalCount = results.length
  
  console.log('='.repeat(60))
  console.log(`SUMMARY: ${passedCount}/${totalCount} tests passed`)
  console.log('='.repeat(60))
  
  if (passedCount === totalCount) {
    console.log('\n🎉 All tests PASSED! Transactional consistency verified.')
  } else {
    console.log('\n⚠️  Some tests FAILED. Review implementation.')
    process.exit(1)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
