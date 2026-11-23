const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function checkTables() {
  try {
    const tables = await prisma.$queryRaw`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `
    
    console.log('=== PRODUCTION DATABASE TABLES ===')
    console.log(JSON.stringify(tables, null, 2))
    
    // Check if User table exists
    const userTableExists = tables.some(t => t.tablename === 'User')
    console.log('\n=== USER TABLE CHECK ===')
    console.log('User table exists:', userTableExists)
    
    if (!userTableExists) {
      console.log('\n⚠️ PROBLEM: "User" table does NOT exist in production database')
      console.log('This is why registration fails with: relation "User" does not exist')
    }
    
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

checkTables()
