/**
 * Liste les règles de notification pour un tenant.
 * Usage: npm run script:list-rules -- <tenantId>
 * Exemple: npm run script:list-rules -- e3e428d1-364b-42c9-a102-a22daa9329c5
 */
import { prisma } from '../src/utils/database';

const tenantId = process.argv[2] || 'e3e428d1-364b-42c9-a102-a22daa9329c5';

async function main() {
  const rules = await prisma.notificationRule.findMany({
    where: { tenant_id: tenantId },
    include: {
      templateEmail: { select: { name: true, channel: true } },
      templateWhatsapp: { select: { name: true, channel: true } }
    },
    orderBy: { created_at: 'asc' }
  });
  console.log(JSON.stringify({ tenantId, count: rules.length, rules }, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
