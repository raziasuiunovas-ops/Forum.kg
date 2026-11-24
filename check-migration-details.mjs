import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkMigrations() {
  try {
    console.log('🔍 Checking _prisma_migrations table...\n');
    
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at, applied_steps_count 
      FROM _prisma_migrations 
      ORDER BY finished_at DESC;
    `;
    
    console.log(`Found ${migrations.length} applied migrations:\n`);
    migrations.forEach((m, index) => {
      const date = m.finished_at ? new Date(m.finished_at).toISOString() : 'NOT FINISHED';
      console.log(`${index + 1}. ${m.migration_name}`);
      console.log(`   Applied: ${date}`);
      console.log(`   Steps: ${m.applied_steps_count}\n`);
    });
    
    console.log('✅ Query completed');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkMigrations();
