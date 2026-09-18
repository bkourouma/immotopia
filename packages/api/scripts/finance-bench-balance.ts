/**
 * Banc de charge — balance sur un tenant simulé, agrégation en mémoire contre
 * agrégation SQL.
 *
 * Le critère de sortie du lot 1 (plan §5.5) exige qu'une balance sur un
 * exercice complet sorte en moins de 3 s pour un tenant de 500 tiers. Le plan
 * (§1.2) relève que `getTrialBalanceBySyndicate`
 * (packages/api/src/lib/syndics/queries.ts:2925) charge toutes les lignes en
 * mémoire et agrège en JavaScript. Ce banc mesure si cette approche tient à
 * l'échelle visée, ou si l'agrégation SQL est obligatoire dès le lot 1.
 *
 * Les tables du module financier (`ThirdPartyAccount`, `ThirdPartyMovement`,
 * …) n'existent pas encore : le banc porte donc sur les tables locatives
 * existantes que la balance du lot 1 lira de toute façon —
 * `RentalInstallment`, `RentalPayment`, `RentalPaymentAllocation`. C'est la
 * mesure qui compte, pas la table qui la porte.
 *
 * Sécurité :
 *   - refuse de tourner si NODE_ENV vaut "production" ;
 *   - crée son propre tenant jetable, reconnaissable (slug préfixé
 *     `bench-finance-jetable-`), et n'écrit jamais que sous ce tenant ;
 *   - nettoie systématiquement derrière lui, y compris en cas d'échec en
 *     cours de route (bloc `finally`) ;
 *   - si la base est injoignable, ne fabrique aucun chiffre : le dit et
 *     s'arrête.
 *
 * Usage :
 *   npx ts-node packages/api/scripts/finance-bench-balance.ts
 *   npx ts-node packages/api/scripts/finance-bench-balance.ts --tiers=500 --mouvements=24
 *   npx ts-node packages/api/scripts/finance-bench-balance.ts --tiers=100 --mouvements=12 --repetitions=5 --json
 *
 * Note sur la configuration lue : ce script lit `process.env.NODE_ENV`
 * directement plutôt que `src/config/env.ts`, pour ne pas exiger la
 * configuration complète de l'application (secrets JWT, OAuth…) alors que ce
 * banc n'a besoin que d'une base de données joignable. `DATABASE_URL` est lu
 * par Prisma lui-même, comme pour tout script de ce dossier.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseIntArg(args: string[], flag: string, fallback: number): number {
  const prefix = `--${flag}=`;
  const found = args.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  const value = Number.parseInt(found.slice(prefix.length), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const args = process.argv.slice(2);
const TIERS = parseIntArg(args, 'tiers', 500);
const MOUVEMENTS = parseIntArg(args, 'mouvements', 24);
const REPETITIONS = parseIntArg(args, 'repetitions', 3);
const JSON_ONLY = args.includes('--json');

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const TENANT_SLUG = `bench-finance-jetable-${RUN_ID}`;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function createManyChunked<T>(
  label: string,
  items: T[],
  create: (batch: T[]) => Promise<unknown>,
  size = 1000
): Promise<void> {
  for (const batch of chunk(items, size)) {
    await create(batch);
  }
  if (!JSON_ONLY) {
    console.log(`  ${label} : ${items.length} ligne(s) insérée(s)`);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function timeIt<T>(fn: () => Promise<T>): Promise<{ ms: number; result: T }> {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  return { ms: Number(end - start) / 1e6, result };
}

// ---------------------------------------------------------------------------
// Garde-fous
// ---------------------------------------------------------------------------

function guardNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refus de tourner : NODE_ENV=production. Ce banc crée et supprime des données.');
    process.exit(1);
  }
}

async function guardDatabaseReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    console.error('Mesure non prise : DATABASE_URL est absent. Aucun chiffre ne sera fabriqué.');
    return false;
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error: any) {
    console.error('Mesure non prise : base de données injoignable.');
    console.error(`   Détail : ${error?.message ?? error}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Génération du jeu de données jetable
// ---------------------------------------------------------------------------

interface FixtureIds {
  tenantId: string;
  propertyId: string;
  creatorUserId: string;
  userIds: string[];
  clientIds: string[];
  leaseIds: string[];
}

async function seedFixture(): Promise<FixtureIds> {
  if (!JSON_ONLY) {
    console.log(`Création du tenant jetable ${TENANT_SLUG} (${TIERS} tiers x ${MOUVEMENTS} mouvements)…`);
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Banc de charge finance (jetable)',
      slug: TENANT_SLUG,
      type: 'AGENCY',
      website: 'https://bench.invalid/finance-lot-0',
      status: 'ACTIVE'
    }
  });

  const creatorUser = await prisma.user.create({
    data: {
      email: `bench-finance-createur-${RUN_ID}@immotopia.invalid`,
      fullName: 'Créateur banc de charge (jetable)',
      isActive: true
    }
  });

  const property = await prisma.property.create({
    data: {
      internalReference: `BENCH-${RUN_ID}`,
      propertyType: 'IMMEUBLE',
      ownershipType: 'TENANT',
      tenantId: tenant.id,
      ownerUserId: creatorUser.id,
      title: 'Bien du banc de charge (jetable)',
      description: 'Bien créé uniquement pour le banc de charge finance-bench-balance.ts, supprimé en fin de mesure.',
      address: 'N/A — donnée de banc de charge',
      currency: 'XOF',
      status: 'DRAFT'
    }
  });

  const userIds: string[] = [];
  const clientIds: string[] = [];
  const leaseIds: string[] = [];

  const users = [];
  const clients = [];
  const leases = [];

  const now = new Date();

  for (let i = 0; i < TIERS; i += 1) {
    const userId = uuidv4();
    const clientId = uuidv4();
    const leaseId = uuidv4();
    userIds.push(userId);
    clientIds.push(clientId);
    leaseIds.push(leaseId);

    users.push({
      id: userId,
      email: `bench-finance+${i}-${RUN_ID}@immotopia.invalid`,
      fullName: `Tiers de banc ${i + 1}`,
      isActive: true
    });

    clients.push({
      id: clientId,
      userId,
      tenantId: tenant.id,
      clientType: 'RENTER' as const
    });

    const rentAmount = 50000 + (i % 25) * 10000; // FCFA, valeurs variées mais déterministes
    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - MOUVEMENTS);

    leases.push({
      id: leaseId,
      tenant_id: tenant.id,
      property_id: property.id,
      primary_renter_client_id: clientId,
      lease_number: `BENCH-${RUN_ID}-${i}`,
      status: 'ACTIVE' as const,
      start_date: startDate,
      billing_frequency: 'MONTHLY' as const,
      due_day_of_month: 5,
      currency: 'FCFA',
      rent_amount: new Prisma.Decimal(rentAmount),
      service_charge_amount: new Prisma.Decimal(0),
      security_deposit_amount: new Prisma.Decimal(0),
      penalty_grace_days: 0,
      penalty_mode: 'PERCENT_OF_BALANCE' as const,
      penalty_rate: new Prisma.Decimal(0),
      penalty_fixed_amount: new Prisma.Decimal(0),
      created_by_user_id: creatorUser.id
    });
  }

  await createManyChunked('Utilisateurs', users, batch => prisma.user.createMany({ data: batch }));
  await createManyChunked('Comptes tiers (TenantClient)', clients, batch =>
    prisma.tenantClient.createMany({ data: batch })
  );
  await createManyChunked('Baux', leases, batch => prisma.rentalLease.createMany({ data: batch }));

  const installments: any[] = [];
  const payments: any[] = [];
  const allocations: any[] = [];

  for (let li = 0; li < leaseIds.length; li += 1) {
    const leaseId = leaseIds[li];
    const rentAmount = leases[li].rent_amount as Prisma.Decimal;
    const startDate = leases[li].start_date as Date;

    for (let mi = 0; mi < MOUVEMENTS; mi += 1) {
      const periodDate = new Date(startDate);
      periodDate.setMonth(periodDate.getMonth() + mi);
      const periodYear = periodDate.getFullYear();
      const periodMonth = periodDate.getMonth() + 1;
      const dueDate = new Date(periodYear, periodMonth - 1, 5);

      const installmentId = uuidv4();
      // Environ trois quarts des échéances sont réglées : assez de contraste
      // pour que la balance ait un solde réel à calculer, dans les deux
      // stratégies.
      const isPaid = (li + mi) % 4 !== 0;

      installments.push({
        id: installmentId,
        tenant_id: tenant.id,
        lease_id: leaseId,
        period_year: periodYear,
        period_month: periodMonth,
        due_date: dueDate,
        status: isPaid ? ('PAID' as const) : ('DUE' as const),
        currency: 'FCFA',
        amount_rent: rentAmount,
        amount_service: new Prisma.Decimal(0),
        amount_other_fees: new Prisma.Decimal(0),
        penalty_amount: new Prisma.Decimal(0),
        amount_paid: isPaid ? rentAmount : new Prisma.Decimal(0)
      });

      if (isPaid) {
        const paymentId = uuidv4();
        payments.push({
          id: paymentId,
          tenant_id: tenant.id,
          lease_id: leaseId,
          renter_client_id: clientIds[li],
          method: 'CASH' as const,
          status: 'SUCCESS' as const,
          currency: 'FCFA',
          amount: rentAmount,
          idempotency_key: uuidv4(),
          initiated_at: dueDate,
          succeeded_at: dueDate,
          created_by_user_id: creatorUser.id
        });
        allocations.push({
          id: uuidv4(),
          tenant_id: tenant.id,
          payment_id: paymentId,
          installment_id: installmentId,
          amount: rentAmount,
          currency: 'FCFA'
        });
      }
    }
  }

  await createManyChunked('Échéances (RentalInstallment)', installments, batch =>
    prisma.rentalInstallment.createMany({ data: batch })
  );
  await createManyChunked('Règlements (RentalPayment)', payments, batch =>
    prisma.rentalPayment.createMany({ data: batch })
  );
  await createManyChunked('Imputations (RentalPaymentAllocation)', allocations, batch =>
    prisma.rentalPaymentAllocation.createMany({ data: batch })
  );

  return { tenantId: tenant.id, propertyId: property.id, creatorUserId: creatorUser.id, userIds, clientIds, leaseIds };
}

// ---------------------------------------------------------------------------
// Les deux stratégies de balance
// ---------------------------------------------------------------------------

/**
 * Stratégie « mémoire » : charge toutes les lignes puis agrège en
 * JavaScript, comme le fait aujourd'hui `getTrialBalanceBySyndicate`
 * (packages/api/src/lib/syndics/queries.ts:2925).
 */
async function balanceInMemory(tenantId: string): Promise<{ leaseCount: number }> {
  const installments = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId },
    select: { lease_id: true, amount_rent: true, amount_service: true, amount_other_fees: true, penalty_amount: true }
  });

  const allocations = await prisma.rentalPaymentAllocation.findMany({
    where: { tenant_id: tenantId, payment: { status: 'SUCCESS' } },
    select: { amount: true, installment: { select: { lease_id: true } } }
  });

  const dueByLease = new Map<string, number>();
  for (const line of installments) {
    const due =
      Number(line.amount_rent) +
      Number(line.amount_service) +
      Number(line.amount_other_fees) +
      Number(line.penalty_amount);
    dueByLease.set(line.lease_id, (dueByLease.get(line.lease_id) ?? 0) + due);
  }

  const paidByLease = new Map<string, number>();
  for (const line of allocations) {
    const leaseId = line.installment.lease_id;
    paidByLease.set(leaseId, (paidByLease.get(leaseId) ?? 0) + Number(line.amount));
  }

  const leaseIds = new Set([...dueByLease.keys(), ...paidByLease.keys()]);
  const balances = Array.from(leaseIds).map(leaseId => ({
    leaseId,
    due: dueByLease.get(leaseId) ?? 0,
    paid: paidByLease.get(leaseId) ?? 0,
    balance: (dueByLease.get(leaseId) ?? 0) - (paidByLease.get(leaseId) ?? 0)
  }));
  balances.sort((a, b) => a.leaseId.localeCompare(b.leaseId));

  return { leaseCount: balances.length };
}

/**
 * Stratégie SQL : l'agrégation (SUM/GROUP BY) est faite par PostgreSQL, dans
 * une seule requête. Rien n'est chargé ligne à ligne côté Node.
 */
async function balanceBySql(tenantId: string): Promise<{ leaseCount: number }> {
  const rows = await prisma.$queryRaw<{ lease_id: string; total_due: string; total_paid: string }[]>`
    SELECT
      l.id AS lease_id,
      COALESCE(inst.total_due, 0) AS total_due,
      COALESCE(pay.total_paid, 0) AS total_paid
    FROM rental_leases l
    LEFT JOIN (
      SELECT lease_id, SUM(amount_rent + amount_service + amount_other_fees + penalty_amount) AS total_due
      FROM rental_installments
      WHERE tenant_id = ${tenantId}
      GROUP BY lease_id
    ) inst ON inst.lease_id = l.id
    LEFT JOIN (
      SELECT i.lease_id, SUM(a.amount) AS total_paid
      FROM rental_payment_allocations a
      JOIN rental_payments p ON p.id = a.payment_id
      JOIN rental_installments i ON i.id = a.installment_id
      WHERE a.tenant_id = ${tenantId} AND p.status = 'SUCCESS'
      GROUP BY i.lease_id
    ) pay ON pay.lease_id = l.id
    WHERE l.tenant_id = ${tenantId}
    ORDER BY l.id
  `;
  return { leaseCount: rows.length };
}

// ---------------------------------------------------------------------------
// Nettoyage — ne touche jamais qu'aux données créées par ce run
// ---------------------------------------------------------------------------

async function cleanup(ids: Partial<FixtureIds>): Promise<void> {
  if (!ids.tenantId) return;
  const tenantId = ids.tenantId;

  if (!JSON_ONLY) {
    console.log(`Nettoyage du tenant jetable ${TENANT_SLUG}…`);
  }

  await prisma.rentalPaymentAllocation.deleteMany({ where: { tenant_id: tenantId } });
  await prisma.rentalPayment.deleteMany({ where: { tenant_id: tenantId } });
  await prisma.rentalInstallment.deleteMany({ where: { tenant_id: tenantId } });
  await prisma.rentalLease.deleteMany({ where: { tenant_id: tenantId } });
  await prisma.tenantClient.deleteMany({ where: { tenantId } });
  if (ids.propertyId) {
    await prisma.property.deleteMany({ where: { id: ids.propertyId, tenantId } });
  }
  if (ids.userIds) {
    await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
  }
  if (ids.creatorUserId) {
    await prisma.user.deleteMany({ where: { id: ids.creatorUserId } });
  }
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  guardNotProduction();

  const reachable = await guardDatabaseReachable();
  if (!reachable) {
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  let fixture: FixtureIds | undefined;
  try {
    fixture = await seedFixture();

    const memoryTimings: number[] = [];
    const sqlTimings: number[] = [];

    for (let i = 0; i < REPETITIONS; i += 1) {
      const memRun = await timeIt(() => balanceInMemory(fixture!.tenantId));
      memoryTimings.push(memRun.ms);
      const sqlRun = await timeIt(() => balanceBySql(fixture!.tenantId));
      sqlTimings.push(sqlRun.ms);
    }

    const summary = {
      tiers: TIERS,
      mouvementsParTiers: MOUVEMENTS,
      repetitions: REPETITIONS,
      memoire: { timingsMs: memoryTimings, medianeMs: median(memoryTimings) },
      sql: { timingsMs: sqlTimings, medianeMs: median(sqlTimings) },
      seuilMs: 3000
    };

    if (JSON_ONLY) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log('');
      console.log('=== Banc de charge — balance ===');
      console.log(`Tiers : ${TIERS}, mouvements par tiers : ${MOUVEMENTS}, répétitions : ${REPETITIONS}`);
      console.log('');
      console.log(
        `Agrégation en mémoire : médiane ${summary.memoire.medianeMs.toFixed(1)} ms (mesures : ${memoryTimings.map(v => v.toFixed(1)).join(', ')} ms)`
      );
      console.log(
        `Agrégation SQL        : médiane ${summary.sql.medianeMs.toFixed(1)} ms (mesures : ${sqlTimings.map(v => v.toFixed(1)).join(', ')} ms)`
      );
      console.log('');
      console.log(`Seuil du critère de sortie du lot 1 : ${summary.seuilMs} ms`);
      console.log(
        summary.memoire.medianeMs <= summary.seuilMs
          ? "L'agrégation en mémoire tient le seuil sur ce volume."
          : "L'agrégation en mémoire NE tient PAS le seuil sur ce volume : l'agrégation SQL est nécessaire dès le lot 1."
      );
    }
  } finally {
    await cleanup(fixture ?? {});
    await prisma.$disconnect();
  }
}

main().catch(async error => {
  console.error('Erreur inattendue du banc de charge :', error);
  process.exitCode = 1;
  await prisma.$disconnect();
});
