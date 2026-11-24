import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkAdmin2FATable() {
  try {
    console.log('🔍 Checking Admin2FACode table existence...\n')
    
    // Check if table exists
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'Admin2FACode'
      )
    `
    
    const exists = tableExists[0].exists
    console.log(`Admin2FACode table exists: ${exists ? '✅ YES' : '❌ NO'}`)
    
    if (exists) {
      // Count records
      const count = await prisma.$queryRaw`SELECT COUNT(*) FROM "Admin2FACode"`
      console.log(`Records in Admin2FACode: ${count[0].count}`)
      
      // Check columns
      const columns = await prisma.$queryRaw`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'Admin2FACode' 
        ORDER BY ordinal_position
      `
      
      console.log('\nColumns:')
      columns.forEach(c => {
        console.log(`  - ${c.column_name} (${c.data_type})`)
      })
    }
    
    console.log('\n📋 Migration record in _prisma_migrations:')
    const migrationRecord = await prisma.$queryRaw`
      SELECT migration_name, finished_at 
      FROM _prisma_migrations 
      WHERE migration_name = '20261123033306_add_admin_2fa_code'
    `
    
    if (migrationRecord.length > 0) {
      console.log('✅ Migration record EXISTS in database')
      console.log(`   Applied: ${new Date(migrationRecord[0].finished_at).toISOString()}`)
    } else {
      console.log('⚠️  Migration record NOT FOUND in database')
      console.log('   But table exists - migration may have been applied manually')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

checkAdmin2FATable()
