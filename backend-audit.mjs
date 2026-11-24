import { PrismaClient } from '@prisma/client'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'

const prisma = new PrismaClient()

async function auditBackend() {
  console.log('🔍 FORUM.KG BACKEND AUDIT REPORT')
  console.log('='.repeat(80))
  console.log(`Generated: ${new Date().toISOString()}`)
  console.log('='.repeat(80))

  try {
    // 1. Database Status
    console.log('\n📊 1. DATABASE STATUS')
    console.log('-'.repeat(80))
    
    const dbInfo = await prisma.$queryRaw`SELECT current_database() as db, version() as ver`
    console.log(`Database: ${dbInfo[0].db}`)
    console.log(`Version: ${dbInfo[0].ver.split(' ').slice(0, 2).join(' ')}`)
    
    const migrations = await prisma.$queryRaw`SELECT COUNT(*) as count FROM _prisma_migrations WHERE rolled_back_at IS NULL`
    console.log(`Migrations applied: ${migrations[0].count}`)
    
    const tables = await prisma.$queryRaw`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `
    console.log(`Tables: ${tables[0].count}`)
    
    // 2. Data presence
    console.log('\n📈 2. DATA PRESENCE')
    console.log('-'.repeat(80))
    
    const counts = {
      users: await prisma.user.count(),
      forums: await prisma.forum.count(),
      orders: await prisma.order.count(),
      payments: await prisma.payment.count(),
      tickets: await prisma.ticket.count(),
      sessions: await prisma.session.count(),
      topics: await prisma.topic.count(),
      posts: await prisma.post.count(),
    }
    
    Object.entries(counts).forEach(([key, value]) => {
      console.log(`${key.padEnd(15)}: ${value}`)
    })
    
    // 3. API Endpoints
    console.log('\n🔌 3. API ENDPOINTS STRUCTURE')
    console.log('-'.repeat(80))
    
    async function scanApiDir(dir, prefix = '') {
      const entries = await readdir(dir, { withFileTypes: true })
      const endpoints = []
      
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const subEndpoints = await scanApiDir(join(dir, entry.name), `${prefix}/${entry.name}`)
          endpoints.push(...subEndpoints)
        } else if (entry.name === 'route.ts' || entry.name === 'route.js') {
          endpoints.push(prefix || '/')
        }
      }
      
      return endpoints
    }
    
    const apiEndpoints = await scanApiDir('app/api/v1')
    console.log(`Total v1 endpoints: ${apiEndpoints.length}`)
    console.log('\nEndpoints:')
    apiEndpoints.sort().forEach(ep => console.log(`  ${ep}`))
    
    // 4. Check tests
    console.log('\n🧪 4. TEST FILES')
    console.log('-'.repeat(80))
    
    async function countFiles(dir, pattern) {
      try {
        const entries = await readdir(dir, { withFileTypes: true })
        let count = 0
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            count += await countFiles(join(dir, entry.name), pattern)
          } else if (entry.name.match(pattern)) {
            count++
          }
        }
        
        return count
      } catch {
        return 0
      }
    }
    
    const unitTests = await countFiles('tests/unit', /\.test\.(ts|js)$/)
    const integrationTests = await countFiles('tests/integration', /\.test\.(ts|js)$/)
    
    console.log(`Unit tests: ${unitTests}`)
    console.log(`Integration tests: ${integrationTests}`)
    
    // 5. Prisma Schema models
    console.log('\n📋 5. PRISMA SCHEMA MODELS')
    console.log('-'.repeat(80))
    
    const schemaContent = await import('fs').then(fs => 
      fs.promises.readFile('prisma/schema.prisma', 'utf-8')
    )
    const models = schemaContent.match(/^model \w+/gm) || []
    const enums = schemaContent.match(/^enum \w+/gm) || []
    
    console.log(`Models: ${models.length}`)
    console.log(`Enums: ${enums.length}`)
    
    // 6. Migrations
    console.log('\n🔄 6. MIGRATION HISTORY')
    console.log('-'.repeat(80))
    
    const migrationsList = await prisma.$queryRaw`
      SELECT migration_name, finished_at
      FROM _prisma_migrations 
      WHERE rolled_back_at IS NULL
      ORDER BY finished_at DESC
      LIMIT 5
    `
    
    console.log('Last 5 migrations:')
    migrationsList.forEach((m, i) => {
      const date = new Date(m.finished_at).toISOString().split('T')[0]
      console.log(`  ${i + 1}. ${m.migration_name.substring(0, 50)} (${date})`)
    })
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ AUDIT COMPLETE')
    console.log('='.repeat(80))
    
  } catch (error) {
    console.error('\n❌ Error during audit:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

auditBackend()
