import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkTables() {
  try {
    console.log('🔍 Checking database tables...\n')
    
    // Get all tables
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `
    
    console.log(`📊 Found ${tables.length} tables in database:\n`)
    tables.forEach((t, i) => {
      console.log(`${i + 1}. ${t.table_name}`)
    })
    
    console.log('\n🔍 Checking _prisma_migrations...\n')
    
    // Check migrations
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, started_at, finished_at, rolled_back_at
      FROM _prisma_migrations 
      ORDER BY started_at DESC
    `
    
    console.log(`📝 Found ${migrations.length} applied migrations:\n`)
    migrations.forEach((m, i) => {
      const status = m.rolled_back_at ? '❌ ROLLED BACK' : '✅ APPLIED'
      console.log(`${i + 1}. ${status} ${m.migration_name}`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

checkTables()
