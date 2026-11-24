import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkMigrations() {
  try {
    console.log('📦 Checking applied migrations in Neon...\n')
    
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations 
      ORDER BY finished_at ASC
    `
    
    console.log(`Total applied migrations: ${migrations.length}\n`)
    
    migrations.forEach((m, i) => {
      const status = m.rolled_back_at ? '🔴 ROLLED BACK' : '✅ APPLIED'
      const date = new Date(m.finished_at).toISOString().split('T')[0]
      console.log(`${i + 1}. ${status} ${m.migration_name}`)
      console.log(`   Date: ${date}`)
    })
    
    console.log('\n📂 Local migrations folder:')
    const localMigrations = [
      '20261120230706_init_forum_kg',
      '20261120230944_add_check_constraints',
      '20261121123550_add_session_management',
      '20261121131439_add_unique_parent_session_constraint',
      '20261121134116_fix_session_chain_on_delete',
      '20261122150000_add_topics_posts',
      '20261122161000_add_event_registrations',
      '20261123033306_add_admin_2fa_code',
      '20261123120000_add_order_idempotency',
      '20261123140000_add_otp_delivery_and_owner'
    ]
    
    const appliedNames = migrations.map(m => m.migration_name)
    
    localMigrations.forEach((name, i) => {
      const applied = appliedNames.includes(name)
      const icon = applied ? '✅' : '⚠️ '
      console.log(`${icon} ${i + 1}. ${name}`)
    })
    
    const pending = localMigrations.filter(name => !appliedNames.includes(name))
    
    if (pending.length > 0) {
      console.log(`\n⚠️  ${pending.length} pending migration(s):`)
      pending.forEach(name => console.log(`   - ${name}`))
    } else {
      console.log('\n✅ All local migrations are applied to database')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.message.includes("Can't reach database")) {
      console.log('\n💡 Tip: Database might be behind firewall or requires IP whitelisting')
    }
  } finally {
    await prisma.$disconnect()
  }
}

checkMigrations()
