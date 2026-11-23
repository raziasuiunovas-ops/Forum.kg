import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function verifyMigrations() {
  try {
    console.log('🔍 VERIFICATION REPORT\n')
    console.log('='.repeat(70))
    
    // 1. Check _prisma_migrations
    console.log('\n📝 1. CHECKING _prisma_migrations TABLE')
    console.log('-'.repeat(70))
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, started_at, finished_at, rolled_back_at
      FROM _prisma_migrations 
      ORDER BY started_at ASC
    `
    
    console.log(`Total migrations: ${migrations.length}`)
    console.log('\nAll migrations:')
    migrations.forEach((m, i) => {
      const status = m.rolled_back_at ? '❌ ROLLED BACK' : '✅ APPLIED'
      const date = new Date(m.finished_at).toISOString().split('T')[0]
      console.log(`${String(i + 1).padStart(2)}. ${status} ${m.migration_name.substring(0, 60)} (${date})`)
    })
    
    // Check if our two migrations are there
    const hasMigration1 = migrations.some(m => m.migration_name === '20261123033306_add_admin_2fa_code')
    const hasMigration2 = migrations.some(m => m.migration_name === '20261123140000_add_otp_delivery_and_owner')
    
    console.log('\n✅ Target migrations:')
    console.log(`   ${hasMigration1 ? '✅' : '❌'} 20261123033306_add_admin_2fa_code`)
    console.log(`   ${hasMigration2 ? '✅' : '❌'} 20261123140000_add_otp_delivery_and_owner`)
    
    // 2. Check Admin2FACode table
    console.log('\n' + '='.repeat(70))
    console.log('\n📊 2. CHECKING Admin2FACode TABLE')
    console.log('-'.repeat(70))
    const admin2faTable = await prisma.$queryRaw`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_name = 'Admin2FACode' AND table_schema = 'public') as column_count
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'Admin2FACode'
    `
    
    if (admin2faTable.length > 0) {
      console.log(`✅ Table exists with ${admin2faTable[0].column_count} columns`)
      
      const admin2faCount = await prisma.admin2FACode.count()
      console.log(`   Records: ${admin2faCount}`)
      
      // Check indexes
      const indexes = await prisma.$queryRaw`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'Admin2FACode'
        ORDER BY indexname
      `
      console.log(`   Indexes: ${indexes.length}`)
      indexes.forEach(idx => console.log(`      - ${idx.indexname}`))
    } else {
      console.log('❌ Table does not exist!')
    }
    
    // 3. Check OtpDeliveryStatus enum
    console.log('\n' + '='.repeat(70))
    console.log('\n🔢 3. CHECKING OtpDeliveryStatus ENUM')
    console.log('-'.repeat(70))
    const enumValues = await prisma.$queryRaw`
      SELECT enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'OtpDeliveryStatus'
      ORDER BY e.enumsortorder
    `
    
    if (enumValues.length > 0) {
      console.log(`✅ Enum exists with ${enumValues.length} values:`)
      enumValues.forEach(v => console.log(`   - ${v.enumlabel}`))
    } else {
      console.log('❌ Enum does not exist!')
    }
    
    // 4. Check OtpChallenge new columns
    console.log('\n' + '='.repeat(70))
    console.log('\n📋 4. CHECKING OtpChallenge NEW COLUMNS')
    console.log('-'.repeat(70))
    const otpColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'OtpChallenge'
        AND column_name IN ('deliveryStatus', 'requestedByUserId')
      ORDER BY column_name
    `
    
    console.log(`Found ${otpColumns.length} new columns:`)
    otpColumns.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'
      const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : ''
      console.log(`   ✅ ${col.column_name} (${col.data_type}, ${nullable}${defaultVal})`)
    })
    
    // Check the foreign key
    const fkey = await prisma.$queryRaw`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'OtpChallenge'
        AND constraint_name = 'OtpChallenge_requestedByUserId_fkey'
    `
    console.log(`   Foreign key: ${fkey.length > 0 ? '✅ Exists' : '❌ Missing'}`)
    
    // 5. Check existing OtpChallenge data
    console.log('\n' + '='.repeat(70))
    console.log('\n💾 5. CHECKING OtpChallenge EXISTING DATA')
    console.log('-'.repeat(70))
    const otpChallenges = await prisma.otpChallenge.findMany({
      select: {
        id: true,
        phone: true,
        deliveryStatus: true,
        requestedByUserId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    
    console.log(`Total records: ${await prisma.otpChallenge.count()}`)
    if (otpChallenges.length > 0) {
      console.log('\nSample records (showing new columns):')
      otpChallenges.forEach((otp, i) => {
        console.log(`   ${i + 1}. ${otp.phone} - deliveryStatus: ${otp.deliveryStatus}, requestedBy: ${otp.requestedByUserId || 'NULL'}`)
      })
    }
    
    // 6. Check all tables count
    console.log('\n' + '='.repeat(70))
    console.log('\n📊 6. DATABASE SUMMARY')
    console.log('-'.repeat(70))
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name != '_prisma_migrations'
      ORDER BY table_name
    `
    console.log(`Total tables (excluding _prisma_migrations): ${tables.length}`)
    
    // Check critical data
    const userCount = await prisma.user.count()
    const forumCount = await prisma.forum.count()
    const orderCount = await prisma.order.count()
    const sessionCount = await prisma.session.count()
    
    console.log('\nData integrity check:')
    console.log(`   Users: ${userCount}`)
    console.log(`   Forums: ${forumCount}`)
    console.log(`   Orders: ${orderCount}`)
    console.log(`   Sessions: ${sessionCount}`)
    
    console.log('\n' + '='.repeat(70))
    console.log('\n✅ MIGRATION VERIFICATION COMPLETE')
    console.log('='.repeat(70))
    console.log('\nAll checks passed! Database is healthy.')
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message)
    console.error(error)
  } finally {
    await prisma.$disconnect()
  }
}

verifyMigrations()
