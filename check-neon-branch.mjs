import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkNeonBranch() {
  try {
    console.log('🔍 Checking Neon connection details...\n')
    
    // Get database name and version
    const dbInfo = await prisma.$queryRaw`
      SELECT current_database() as db_name, version() as pg_version
    `
    console.log('📊 Connected to database:', dbInfo[0].db_name)
    console.log('🗄️  PostgreSQL version:', dbInfo[0].pg_version.split(' ')[0] + ' ' + dbInfo[0].pg_version.split(' ')[1])
    
    // Check if this looks like production data
    const userCount = await prisma.user.count()
    const forumCount = await prisma.forum.count()
    const orderCount = await prisma.order.count()
    const sessionCount = await prisma.session.count()
    
    console.log('\n📈 Data presence check:')
    console.log(`   Users: ${userCount}`)
    console.log(`   Forums: ${forumCount}`)
    console.log(`   Orders: ${orderCount}`)
    console.log(`   Sessions: ${sessionCount}`)
    
    if (userCount > 0 || forumCount > 0 || orderCount > 0) {
      console.log('\n⚠️  WARNING: This appears to be a database WITH DATA')
      console.log('   This could be Production or Staging')
    } else {
      console.log('\n✅ This appears to be a clean/development database')
    }
    
    // Check applied migrations
    const migrations = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM _prisma_migrations
    `
    console.log(`\n📝 Applied migrations: ${migrations[0].count}`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

checkNeonBranch()
