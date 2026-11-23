import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listTables() {
  try {
    console.log('📊 Querying all tables in database...\n');
    
    // Query to get all table names
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    
    console.log(`Found ${tables.length} tables:\n`);
    tables.forEach((row, index) => {
      console.log(`${index + 1}. ${row.table_name}`);
    });
    
    console.log('\n✅ Query completed successfully');
  } catch (error) {
    console.error('❌ Error listing tables:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

listTables();
