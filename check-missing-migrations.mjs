import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkMissingMigrations() {
  try {
    console.log('🔍 Checking if migration changes already applied...\n')
    
    // Check 1: Does Admin2FACode table exist?
    const admin2faTable = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'Admin2FACode'
    `
    console.log('1️⃣ Admin2FACode table exists:', admin2faTable.length > 0 ? '✅ YES' : '❌ NO')
    
    // Check 2: Does OtpChallenge have deliveryStatus column?
    const otpColumns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'OtpChallenge'
        AND column_name IN ('deliveryStatus', 'requestedByUserId')
      ORDER BY column_name
    `
    console.log('2️⃣ OtpChallenge.deliveryStatus exists:', otpColumns.some(c => c.column_name === 'deliveryStatus') ? '✅ YES' : '❌ NO')
    console.log('3️⃣ OtpChallenge.requestedByUserId exists:', otpColumns.some(c => c.column_name === 'requestedByUserId') ? '✅ YES' : '❌ NO')
    
    // Check 3: Does OtpDeliveryStatus enum exist?
    const enumTypes = await prisma.$queryRaw`
      SELECT typname
      FROM pg_type 
      WHERE typname = 'OtpDeliveryStatus'
    `
    console.log('4️⃣ OtpDeliveryStatus enum exists:', enumTypes.length > 0 ? '✅ YES' : '❌ NO')
    
    console.log('\n📋 Summary:')
    const admin2faExists = admin2faTable.length > 0
    const otpDeliveryExists = otpColumns.some(c => c.column_name === 'deliveryStatus')
    
    if (!admin2faExists || !otpDeliveryExists) {
      console.log('⚠️  Missing migrations need to be applied!')
      console.log('   Run: npx prisma migrate deploy')
    } else {
      console.log('✅ All migration changes are already applied!')
      console.log('⚠️  But _prisma_migrations table is out of sync')
      console.log('   This might happen if migrations were applied manually')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

checkMissingMigrations()
