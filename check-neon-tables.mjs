import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkTables() {
  try {
    console.log('🔍 Checking Neon database connection...\n')
    
    // Get DATABASE_URL info
    const dbUrl = process.env.DATABASE_URL || ''
    const match = dbUrl.match(/ep-[a-z0-9-]+/)
    console.log('📊 Connected to endpoint:', match ? match[0] : 'unknown')
    console.log('📁 Database:', dbUrl.match(/\/([^?]+)/)?.[1] || 'unknown')
    console.log('')
    
    // Query all tables
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `
    
    console.log('📋 Tables found:', tables.length)
    console.log('')
    
    if (tables.length === 0) {
      console.log('⚠️  No tables found in database!')
    } else {
      console.log('Tables:')
      tables.forEach((t, i) => {
        const name = t.table_name
        const isPlayingNeon = name === 'playing_with_neon'
        const isForumTable = ['User', 'Forum', 'Order', 'Session', 'Ticket', 'Admin2FACode'].includes(name)
        
        const icon = isPlayingNeon ? '🔴' : isForumTable ? '✅' : '📄'
        console.log(`  ${icon} ${i + 1}. ${name}`)
      })
    }
    
    console.log('')
    
    // Check for key Forum.kg tables
    const tableNames = tables.map(t => t.table_name)
    const keyTables = ['User', 'Forum', 'Order', 'Session', 'Ticket', '_prisma_migrations']
    const foundKeyTables = keyTables.filter(t => tableNames.includes(t))
    
    console.log('🔑 Key Forum.kg tables:')
    keyTables.forEach(t => {
      const found = tableNames.includes(t)
      console.log(`  ${found ? '✅' : '❌'} ${t}`)
    })
    
    console.log('')
    
    // Check for playing_with_neon
    if (tableNames.includes('playing_with_neon')) {
      console.log('🔴 WARNING: "playing_with_neon" table found!')
      console.log('   This suggests connection to a test/demo branch, not production Forum.kg data.')
    }
    
    // Check migrations
    if (tableNames.includes('_prisma_migrations')) {
      const migrations = await prisma.$queryRaw`
        SELECT migration_name, finished_at 
        FROM _prisma_migrations 
        ORDER BY finished_at DESC 
        LIMIT 5
      `
      
      console.log('')
      console.log('📦 Recent migrations:')
      if (migrations.length === 0) {
        console.log('   No migrations found')
      } else {
        migrations.forEach((m, i) => {
          console.log(`   ${i + 1}. ${m.migration_name}`)
        })
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

checkTables()
