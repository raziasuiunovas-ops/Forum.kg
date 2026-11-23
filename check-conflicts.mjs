import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkConflicts() {
  try {
    console.log('🔍 Checking for potential migration conflicts...\n')
    
    // Check 1: Does Admin2FACode table already exist?
    console.log('1️⃣ Checking Admin2FACode table...')
    const admin2faTable = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'Admin2FACode'
    `
    if (admin2faTable.length > 0) {
      console.log('   ❌ CONFLICT: Admin2FACode table already exists!')
    } else {
      console.log('   ✅ OK: Admin2FACode table does not exist')
    }
    
    // Check 2: Does OtpDeliveryStatus enum already exist?
    console.log('\n2️⃣ Checking OtpDeliveryStatus enum...')
    const otpEnum = await prisma.$queryRaw`
      SELECT typname, enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'OtpDeliveryStatus'
      ORDER BY e.enumsortorder
    `
    if (otpEnum.length > 0) {
      console.log('   ❌ CONFLICT: OtpDeliveryStatus enum already exists!')
      console.log('   Values:', otpEnum.map(e => e.enumlabel).join(', '))
    } else {
      console.log('   ✅ OK: OtpDeliveryStatus enum does not exist')
    }
    
    // Check 3: Does OtpChallenge have the new columns?
    console.log('\n3️⃣ Checking OtpChallenge columns...')
    const otpColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'OtpChallenge'
        AND column_name IN ('deliveryStatus', 'requestedByUserId')
      ORDER BY column_name
    `
    if (otpColumns.length > 0) {
      console.log('   ❌ CONFLICT: OtpChallenge already has new columns!')
      otpColumns.forEach(col => {
        console.log(`      - ${col.column_name} (${col.data_type})`)
      })
    } else {
      console.log('   ✅ OK: OtpChallenge does not have new columns')
    }
    
    // Check 4: Check existing indexes
    console.log('\n4️⃣ Checking indexes...')
    const indexes = await prisma.$queryRaw`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND (
          indexname LIKE 'Admin2FACode%'
          OR (tablename = 'OtpChallenge' AND indexname LIKE '%requestedByUserId%')
        )
      ORDER BY tablename, indexname
    `
    if (indexes.length > 0) {
      console.log('   ⚠️  Found existing indexes:')
      indexes.forEach(idx => {
        console.log(`      - ${idx.tablename}.${idx.indexname}`)
      })
    } else {
      console.log('   ✅ OK: No conflicting indexes found')
    }
    
    // Check 5: Check foreign keys
    console.log('\n5️⃣ Checking foreign keys...')
    const fkeys = await prisma.$queryRaw`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND (
          tc.constraint_name = 'OtpChallenge_requestedByUserId_fkey'
        )
    `
    if (fkeys.length > 0) {
      console.log('   ⚠️  Found existing foreign keys:')
      fkeys.forEach(fk => {
        console.log(`      - ${fk.constraint_name}: ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`)
      })
    } else {
      console.log('   ✅ OK: No conflicting foreign keys found')
    }
    
    // Check 6: Check if OtpChallenge has any data
    console.log('\n6️⃣ Checking OtpChallenge data...')
    const otpCount = await prisma.otpChallenge.count()
    console.log(`   📊 Existing OtpChallenge records: ${otpCount}`)
    if (otpCount > 0) {
      console.log('   ⚠️  Migration will add DEFAULT UNKNOWN to existing records')
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('📋 SUMMARY:')
    console.log('='.repeat(60))
    
    const hasConflicts = admin2faTable.length > 0 || otpEnum.length > 0 || otpColumns.length > 0
    
    if (hasConflicts) {
      console.log('❌ CONFLICTS DETECTED!')
      console.log('   Migration will fail due to existing objects.')
      console.log('   Manual intervention required.')
    } else {
      console.log('✅ NO CONFLICTS DETECTED')
      console.log('   Safe to run: npx prisma migrate deploy')
      console.log('')
      console.log('⚠️  Note: Migration will add DEFAULT values to existing data')
      console.log('   This is SAFE and non-destructive.')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

checkConflicts()
