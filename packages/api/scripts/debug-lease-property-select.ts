import { PrismaClient, PropertyStatus } from '@prisma/client';

const prisma = new PrismaClient();

type LeaseFilterDecision = {
  propertyId: string;
  title: string;
  internalReference: string;
  status: string;
  propertyType: string;
  transactionModes: string[];
  childCount: number;
  oldRuleIncluded: boolean;
  newRuleIncluded: boolean;
  oldRuleReason: string;
  newRuleReason: string;
};

function oldWizardRule(input: {
  transactionModes: string[];
  propertyType: string;
  childCount: number;
  status: string;
}): { included: boolean; reason: string } {
  const isRental =
    input.transactionModes.includes('RENTAL') ||
    input.transactionModes.includes('SHORT_TERM');
  if (!isRental) return { included: false, reason: 'Mode non RENTAL/SHORT_TERM' };
  if (input.propertyType === 'IMMEUBLE' && input.childCount > 0) {
    return { included: false, reason: 'Immeuble conteneur avec appartements' };
  }
  if (input.status === 'RENTED' || input.status === 'SOLD') {
    return { included: false, reason: 'Statut RENTED/SOLD' };
  }
  return { included: true, reason: 'OK' };
}

function newWizardRule(input: {
  transactionModes: string[];
  propertyType: string;
  childCount: number;
  status: string;
}): { included: boolean; reason: string } {
  const normalizedModes = input.transactionModes.map((mode) => String(mode).toUpperCase());
  const hasModeInfo = normalizedModes.length > 0;
  const hasRentalMode = normalizedModes.some((mode) =>
    ['RENTAL', 'SHORT_TERM', 'LOCATION', 'RENT'].includes(mode)
  );

  if (hasModeInfo && !hasRentalMode) {
    return { included: false, reason: 'Modes presents mais aucun mode locatif' };
  }
  if (input.propertyType === 'IMMEUBLE' && input.childCount > 0) {
    return { included: false, reason: 'Immeuble conteneur avec appartements' };
  }
  if (input.status === 'SOLD' || input.status === 'RENTED') {
    return { included: false, reason: 'Statut SOLD/RENTED' };
  }
  return { included: true, reason: hasModeInfo ? 'OK' : 'OK (legacy sans modes)' };
}

async function run(tenantId: string): Promise<void> {
  console.log(`\n[debug-lease-property-select] Tenant: ${tenantId}\n`);

  const properties = await prisma.property.findMany({
    where: {
      tenantId,
      status: {
        not: PropertyStatus.ARCHIVED
      }
    },
    select: {
      id: true,
      title: true,
      internalReference: true,
      status: true,
      propertyType: true,
      transactionModes: true,
      _count: {
        select: {
          containerChildren: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  if (properties.length === 0) {
    console.log('Aucun bien retourne en base pour ce tenant (hors ARCHIVED).');
    return;
  }

  const rows: LeaseFilterDecision[] = properties.map((p) => {
    const payload = {
      transactionModes: (p.transactionModes as unknown as string[]) ?? [],
      propertyType: p.propertyType,
      childCount: p._count.containerChildren,
      status: p.status
    };
    const oldDecision = oldWizardRule(payload);
    const newDecision = newWizardRule(payload);
    return {
      propertyId: p.id,
      title: p.title || '-',
      internalReference: p.internalReference || '-',
      status: p.status,
      propertyType: p.propertyType,
      transactionModes: payload.transactionModes,
      childCount: payload.childCount,
      oldRuleIncluded: oldDecision.included,
      newRuleIncluded: newDecision.included,
      oldRuleReason: oldDecision.reason,
      newRuleReason: newDecision.reason
    };
  });

  console.log(`Total biens analyses: ${rows.length}`);
  console.log(`Inclus ancienne regle wizard: ${rows.filter((r) => r.oldRuleIncluded).length}`);
  console.log(`Inclus nouvelle regle wizard: ${rows.filter((r) => r.newRuleIncluded).length}\n`);

  for (const row of rows) {
    console.log(`- ${row.title} [${row.internalReference}] (${row.propertyId})`);
    console.log(`  status=${row.status} type=${row.propertyType} children=${row.childCount}`);
    console.log(`  modes=${row.transactionModes.length > 0 ? row.transactionModes.join(',') : '(vide)'}`);
    console.log(
      `  oldRule=${row.oldRuleIncluded ? 'IN' : 'OUT'} (${row.oldRuleReason}) | newRule=${row.newRuleIncluded ? 'IN' : 'OUT'} (${row.newRuleReason})`
    );
  }
}

async function main(): Promise<void> {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error('Usage: npm run debug:lease-property-select -- <tenantId>');
    process.exit(1);
  }

  try {
    await run(tenantId);
  } catch (error) {
    console.error('Erreur diagnostic lease property select:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();

