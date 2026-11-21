/**
 * Comparison Test: Before vs After Fix
 */

import { PrismaClient, OtpPurpose, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

// BEFORE: Read Committed (vulnerable)
const testBefore = async (phone: string, purpose: OtpPurpose) => {
  const promises = Array.from({ length: 5 }, (_, i) =>
    prisma.$transaction(async (tx) => {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
      const count = await tx.otpChallenge.count({
        where: { phone, purpose, createdAt: { gte: fifteenMinutesAgo } },
      })

      if (count >= 3) throw new Error('RATE_LIMIT')

      await new Promise(resolve => setTimeout(resolve, 50))

      return tx.otpChallenge.create({
        data: {
          phone,
          purpose,
          codeHash: `before_${i}_${Date.now()}`,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 0,
        },
      })
    }).catch(() => null)
  )

  await Promise.all(promises)

  const count = await prisma.otpChallenge.count({
    where: { phone, purpose, createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } },
  })

  return count
}

// AFTER: Serializable (fixed)
const testAfter = async (phone: string, purpose: OtpPurpose) => {
  const promises = Array.from({ length: 5 }, async (_, i) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await prisma.$transaction(
          async (tx) => {
            const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
            const count = await tx.otpChallenge.count({
              where: { phone, purpose, createdAt: { gte: fifteenMinutesAgo } },
            })

            if (count >= 3) throw new Error('RATE_LIMIT')

            await new Promise(resolve => setTimeout(resolve, 50))

            return tx.otpChallenge.create({
              data: {
                phone,
                purpose,
                codeHash: `after_${i}_${Date.now()}`,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                attempts: 0,
              },
            })
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 }
        )
      } catch (error: any) {
        if (error.code === 'P2034' && attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 50 * Math.pow(2, attempt)))
          continue
        }
        return null
      }
    }
  })

  await Promise.all(promises)

  const count = await prisma.otpChallenge.count({
    where: { phone, purpose, createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } },
  })

  return count
}

async function main() {
  console.log('🔬 Comparison: Before vs After Fix\n')

  const phoneBefore = '+996555999004'
  const phoneAfter = '+996555999005'
  const purpose = OtpPurpose.LOGIN

  // Clean up
  await prisma.otpChallenge.deleteMany({ where: { phone: phoneBefore } })
  await prisma.otpChallenge.deleteMany({ where: { phone: phoneAfter } })

  console.log('🔴 BEFORE (Read Committed): 5 concurrent requests')
  const countBefore = await testBefore(phoneBefore, purpose)
  console.log(`   Result: ${countBefore} OTPs created`)
  if (countBefore > 3) {
    console.log(`   ❌ VULNERABLE: Limit bypassed (${countBefore - 3} extra OTPs)\n`)
  } else {
    console.log(`   ⚠️  Lucky: No bypass this time\n`)
  }

  console.log('🟢 AFTER (Serializable): 5 concurrent requests')
  const countAfter = await testAfter(phoneAfter, purpose)
  console.log(`   Result: ${countAfter} OTPs created`)
  if (countAfter === 3) {
    console.log(`   ✅ SECURE: Limit enforced correctly\n`)
  } else {
    console.log(`   ❌ FAILED: Limit still bypassed\n`)
  }

  console.log('📊 Summary:')
  console.log(`   Before: ${countBefore} / 3 (${countBefore > 3 ? 'FAIL' : 'PASS'})`)
  console.log(`   After: ${countAfter} / 3 (${countAfter === 3 ? 'PASS' : 'FAIL'})`)

  if (countBefore > 3 && countAfter === 3) {
    console.log('\n✅ Fix confirmed: Race condition eliminated')
  }

  // Clean up
  await prisma.otpChallenge.deleteMany({ where: { phone: phoneBefore } })
  await prisma.otpChallenge.deleteMany({ where: { phone: phoneAfter } })
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
