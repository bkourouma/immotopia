/**
 * Rétro-remplissage des comptes de tiers locataires — lot 1, tâche 1.4.
 *
 * Avant ce script, aucun `ThirdPartyAccount` n'existe : la balance clients et
 * le relevé de compte (`spec.md`, récits 1 et 2) n'ont rien à montrer tant que
 * les échéances, règlements et pénalités déjà en base n'ont pas été rejoués
 * dans le grand livre. C'est ce que fait ce script, une fois, pour un tenant
 * donné : il crée le compte de chaque locataire (`getOrCreateTenantAccountTx`)
 * puis reconstruit son historique complet (`rebuildThirdPartyAccount`),
 * exactement comme le ferait une reprise après incident.
 *
 * Ce script ne construit aucune règle métier : les deux fonctions qu'il
 * appelle (`lib/finance/ledger.ts`) portent tout le calcul. Il orchestre
 * seulement la boucle, la sécurité et l'affichage.
 *
 * Sécurité — trois garde-fous, dans cet ordre :
 *   1. Refuse de tourner sans `--tenant=<id>` : pas de rétro-remplissage
 *      accidentel « pour tout le monde ».
 *   2. Refuse de tourner si `NODE_ENV` vaut `production` : ce script est un
 *      outil de mise en place, pas une tâche planifiée.
 *   3. N'écrit jamais que des mouvements et des comptes — jamais de
 *      suppression, jamais de modification d'une pièce source
 *      (`RentalInstallment`, `RentalPayment`, `RentalPaymentAllocation`,
 *      `RentalPenalty` restent intouchés).
 *
 * Idempotent : `getOrCreateTenantAccountTx` réutilise le compte existant
 * plutôt que d'en créer un second, et `rebuildThirdPartyAccount` rejoue
 * chaque pièce derrière la contrainte unique `(sourceType, sourceId, type)`
 * de `ThirdPartyMovement` — une pièce déjà rejouée ne l'est pas deux fois.
 * Relancer ce script sur un tenant déjà rempli ne duplique donc rien ; c'est
 * ce qui le rend sûr à relancer après un incident ou une interruption.
 *
 * Chaque locataire est traité isolément : l'échec de l'un (compte introuvable,
 * pièce inattendue) est consigné et n'interrompt pas les suivants, pour que le
 * rétro-remplissage sur une grosse base ne s'arrête pas au premier accroc.
 *
 * Usage :
 *   npx ts-node packages/api/scripts/finance-backfill-tenant-accounts.ts --tenant=<tenantId>
 *   npx ts-node packages/api/scripts/finance-backfill-tenant-accounts.ts --tenant=<tenantId> --json
 */

import { prisma } from '../src/utils/database';
import { getOrCreateTenantAccountTx, rebuildThirdPartyAccount } from '../src/lib/finance/ledger';

// ---------------------------------------------------------------------------
// Arguments et garde-fous
// ---------------------------------------------------------------------------

function parseTenantArg(args: string[]): string | undefined {
  const prefix = '--tenant=';
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

const args = process.argv.slice(2);
const JSON_ONLY = args.includes('--json');
const TENANT_ID = parseTenantArg(args);

function guardHasTenant(): string {
  if (!TENANT_ID) {
    console.error('Refus de tourner : --tenant=<tenantId> est obligatoire.');
    console.error('Usage : npx ts-node packages/api/scripts/finance-backfill-tenant-accounts.ts --tenant=<tenantId>');
    process.exit(1);
  }
  return TENANT_ID;
}

function guardNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      'Refus de tourner : NODE_ENV=production. Ce script est un outil de mise en place ' +
        'du lot 1, pas une tâche planifiée en production.'
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Rétro-remplissage
// ---------------------------------------------------------------------------

interface AccountOutcome {
  tenantClientId: string;
  label: string;
  ok: boolean;
  movementsWritten?: number;
  balance?: number;
  error?: string;
}

/**
 * Locataires du tenant : un compte de tiers par `TenantClient` de type
 * `RENTER` (seul type peuplé par le lot 1 — voir `data-model.md`), pas par
 * bail, pour que le relevé suive la personne même si elle change de bail.
 */
async function listRenterTenantClients(tenantId: string): Promise<{ id: string; label: string }[]> {
  const clients = await prisma.tenantClient.findMany({
    where: { tenantId, clientType: 'RENTER' },
    select: {
      id: true,
      user: { select: { fullName: true, email: true } }
    }
  });

  return clients.map(client => ({
    id: client.id,
    label: client.user?.fullName || client.user?.email || client.id
  }));
}

async function backfillOne(tenantId: string, tenantClientId: string, label: string): Promise<AccountOutcome> {
  try {
    // Le compte doit exister avant d'être reconstruit ; `rebuildThirdPartyAccount`
    // ne le crée pas lui-même (voir son contrat dans `lib/finance/types.ts`).
    const account = await prisma.$transaction(tx => getOrCreateTenantAccountTx(tx, tenantId, tenantClientId));
    if (!account) {
      return { tenantClientId, label, ok: false, error: 'Compte de tiers introuvable ou impossible à créer' };
    }

    const { movementsWritten, balance } = await rebuildThirdPartyAccount(tenantId, account.id);
    return { tenantClientId, label, ok: true, movementsWritten, balance };
  } catch (error: any) {
    return { tenantClientId, label, ok: false, error: error?.message ?? String(error) };
  }
}

async function main(): Promise<void> {
  guardNotProduction();
  const tenantId = guardHasTenant();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
  if (!tenant) {
    console.error(`Refus de tourner : tenant introuvable (${tenantId}).`);
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }

  if (!JSON_ONLY) {
    console.log('');
    console.log('=== Rétro-remplissage des comptes de tiers locataires ===');
    console.log('');
    console.log(`Tenant : ${tenant.name} (${tenant.id})`);
  }

  const renters = await listRenterTenantClients(tenantId);

  if (!JSON_ONLY) {
    console.log(`Locataires à traiter : ${renters.length}`);
    console.log('');
  }

  const outcomes: AccountOutcome[] = [];
  for (let i = 0; i < renters.length; i += 1) {
    const renter = renters[i];
    const outcome = await backfillOne(tenantId, renter.id, renter.label);
    outcomes.push(outcome);

    if (!JSON_ONLY) {
      const progress = `[${i + 1}/${renters.length}]`;
      if (outcome.ok) {
        console.log(
          `${progress} ${outcome.label} : ${outcome.movementsWritten} mouvement(s) écrit(s), solde ${outcome.balance}`
        );
      } else {
        console.log(`${progress} ${outcome.label} : ÉCHEC — ${outcome.error}`);
      }
    }
  }

  const succeeded = outcomes.filter(o => o.ok);
  const failed = outcomes.filter(o => !o.ok);
  const totalMovementsWritten = succeeded.reduce((sum, o) => sum + (o.movementsWritten ?? 0), 0);

  const summary = {
    tenantId,
    tenantName: tenant.name,
    accountsProcessed: outcomes.length,
    accountsSucceeded: succeeded.length,
    accountsFailed: failed.length,
    totalMovementsWritten,
    failures: failed.map(f => ({ tenantClientId: f.tenantClientId, label: f.label, error: f.error }))
  };

  if (JSON_ONLY) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('');
    console.log('--- Récapitulatif ---');
    console.log('');
    console.log(`Comptes traités  : ${summary.accountsProcessed}`);
    console.log(`Comptes en échec : ${summary.accountsFailed}`);
    console.log(
      `Mouvements écrits (toutes exécutions confondues, y compris les rejeux sans effet) : ${totalMovementsWritten}`
    );
    if (failed.length > 0) {
      console.log('');
      console.log('Échecs :');
      for (const f of failed) {
        console.log(`  - ${f.label} (${f.tenantClientId}) : ${f.error}`);
      }
    }
    console.log('');
  }

  process.exitCode = failed.length > 0 ? 1 : 0;
  await prisma.$disconnect();
}

main().catch(async error => {
  console.error('Erreur inattendue du rétro-remplissage :', error);
  process.exitCode = 1;
  await prisma.$disconnect();
});
