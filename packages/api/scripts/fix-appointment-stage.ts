/**
 * Fix script to update any remaining deals with APPOINTMENT stage to VISIT
 * This should have been handled by migration 20250115000001_remove_appointment_stage
 * but in case there are still some, this script will fix them.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking for deals with APPOINTMENT stage...');

  try {
    // Use raw SQL to check and fix the data since Prisma can't query invalid enum values
    const result = await prisma.$executeRawUnsafe(`
      UPDATE crm_deals 
      SET stage = 'VISIT'::"CrmDealStage"
      WHERE stage::text = 'APPOINTMENT'
      RETURNING id, stage;
    `);

    console.log(`✅ Fixed ${result} deal(s) with APPOINTMENT stage`);
    
    if (result === 0) {
      console.log('ℹ️  No deals with APPOINTMENT stage found. Database is clean!');
    }
  } catch (error: any) {
    console.error('❌ Error fixing APPOINTMENT stage:', error.message);
    
    // Try alternative approach if the first one fails
    try {
      console.log('🔄 Trying alternative fix method...');
      await prisma.$executeRawUnsafe(`
        UPDATE crm_deals 
        SET stage = 'VISIT'
        WHERE stage::text = 'APPOINTMENT';
      `);
      console.log('✅ Alternative fix method succeeded');
    } catch (error2: any) {
      console.error('❌ Alternative fix also failed:', error2.message);
      console.error('\n📝 Please run this SQL query manually in your database:');
      console.log(`
        UPDATE crm_deals 
        SET stage = 'VISIT'::"CrmDealStage"
        WHERE stage::text = 'APPOINTMENT';
      `);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

