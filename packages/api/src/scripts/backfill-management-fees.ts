/**
 * Rattrapage des honoraires de gestion des encaissements existants.
 *
 * Depuis BUG-2026-09-28-029, un niveau de conditions d'honoraires (bail,
 * propriétaire, agence) ne vaut que pour les encaissements enregistrés APRÈS
 * son dernier enregistrement (`feeTermsApplyToAllocation`). Un encaissement
 * antérieur qui n'a pas encore ses honoraires figés n'en recevra donc jamais
 * une fois les conditions modifiées, et c'est le cas de tout l'historique
 * d'une agence qui n'a jamais figé ses honoraires.
 *
 * Ce script fige les honoraires de chaque agence AVANT la mise en ligne, avec
 * les conditions encore en vigueur, par `freezeManagementFees` (le même appel
 * que celui qui précède chaque changement de conditions) :
 *
 *  - parcours par lots, sans charger toute l'agence en mémoire ;
 *  - idempotent : seuls les encaissements sans honoraires sont traités, et
 *    l'unicité sur `allocation_id` rend un second passage sans effet ;
 *  - une agence en échec n'arrête pas les autres (code de sortie 1 à la fin).
 *
 * SIMULATION PAR DÉFAUT : sans `--apply`, rien n'est écrit ; le rapport donne,
 * par agence, le nombre d'encaissements et le montant d'honoraires (HT et
 * TVA) qui seraient figés.
 *
 * Usage, APRÈS la migration et AVANT d'exposer la version. Ce fichier est
 * compilé dans l'image (comme `provision-subscription`) ; `scripts/` n'y est pas :
 *   docker exec immotopia-prod-api node dist/scripts/backfill-management-fees.js --allow-production
 *   docker exec immotopia-prod-api node dist/scripts/backfill-management-fees.js --allow-production --apply
 *   --tenant <id>       une seule agence
 *   --json              sortie machine
 *   --allow-production  exigé sous NODE_ENV=production (cas du conteneur)
 * En développement : `npm run ops:backfill-management-fees -w @immotopia/api -- [options]`
 * ou `npx ts-node scripts/backfill-management-fees.ts [options]` (même code).
 */

import { disconnectDatabase, prisma } from '../utils/database';
import { freezeManagementFees, previewManagementFeeFreeze } from '../lib/rental-fees/materialize';

export interface BackfillOptions {
  apply: boolean;
  json: boolean;
  tenantId?: string;
  allowProduction: boolean;
}

export interface TenantBackfillReport {
  tenantId: string;
  tenantName: string;
  /** Encaissements dont les honoraires seraient (simulation) ou ont été (apply) figés. */
  allocations: number;
  /** Honoraires HT correspondants (simulation seulement ; 0 après `--apply`). */
  feeAmount: number;
  /** TVA sur honoraires correspondante (simulation seulement ; 0 après `--apply`). */
  vatAmount: number;
  error?: string;
}

export interface BackfillResult {
  mode: 'simulation' | 'apply';
  reports: TenantBackfillReport[];
}

/** Lit les arguments (`--tenant <id>` ou `--tenant=<id>`). */
export function parseBackfillArgs(args: string[]): BackfillOptions {
  let tenantId: string | undefined;
  const index = args.findIndex(a => a === '--tenant' || a.startsWith('--tenant='));
  if (index !== -1) {
    tenantId = args[index].includes('=') ? args[index].slice('--tenant='.length) : args[index + 1];
    if (!tenantId || tenantId.startsWith('--')) throw new Error('--tenant exige un identifiant d’agence.');
  }
  return {
    apply: args.includes('--apply'),
    json: args.includes('--json'),
    tenantId,
    allowProduction: args.includes('--allow-production')
  };
}

/**
 * Fige (ou simule le figeage) des honoraires, agence par agence.
 * Lève une erreur sous production sans `--allow-production`, ou si l'agence
 * demandée n'existe pas.
 */
export async function runBackfillManagementFees(
  options: BackfillOptions,
  env: { NODE_ENV?: string } = process.env
): Promise<BackfillResult> {
  if (env.NODE_ENV === 'production' && !options.allowProduction) {
    throw new Error('Refus de tourner : NODE_ENV=production (ajouter --allow-production en connaissance de cause).');
  }

  const tenants = await prisma.tenant.findMany({
    where: options.tenantId ? { id: options.tenantId } : {},
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  });
  if (options.tenantId && tenants.length === 0) {
    throw new Error(`Refus de tourner : agence introuvable (${options.tenantId}).`);
  }

  const reports: TenantBackfillReport[] = [];
  for (const tenant of tenants) {
    const base = { tenantId: tenant.id, tenantName: tenant.name };
    try {
      if (options.apply) {
        const allocations = await freezeManagementFees(tenant.id);
        reports.push({ ...base, allocations, feeAmount: 0, vatAmount: 0 });
      } else {
        const preview = await previewManagementFeeFreeze(tenant.id);
        reports.push({ ...base, ...preview });
      }
    } catch (error) {
      reports.push({
        ...base,
        allocations: 0,
        feeAmount: 0,
        vatAmount: 0,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return { mode: options.apply ? 'apply' : 'simulation', reports };
}

function printReport(result: BackfillResult): void {
  for (const r of result.reports) {
    if (r.error) {
      console.log(`${r.tenantName} (${r.tenantId}) : ÉCHEC — ${r.error}`);
    } else if (result.mode === 'apply') {
      console.log(`${r.tenantName} (${r.tenantId}) : ${r.allocations} encaissement(s) figé(s)`);
    } else {
      console.log(
        `${r.tenantName} (${r.tenantId}) : ${r.allocations} encaissement(s) à figer, ` +
          `honoraires ${r.feeAmount.toFixed(2)} HT, TVA ${r.vatAmount.toFixed(2)}`
      );
    }
  }
  const total = result.reports.reduce((sum, r) => sum + r.allocations, 0);
  console.log('');
  console.log(
    result.mode === 'apply'
      ? `Terminé : ${total} encaissement(s) figé(s) dans ${result.reports.length} agence(s).`
      : `SIMULATION (rien n'est écrit) : ${total} encaissement(s) seraient figés dans ${result.reports.length} agence(s). ` +
          'Relancer avec --apply pour écrire.'
  );
}

export async function main(): Promise<void> {
  let options: BackfillOptions;
  let result: BackfillResult;
  try {
    options = parseBackfillArgs(process.argv.slice(2));
    result = await runBackfillManagementFees(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await disconnectDatabase();
    process.exit(1);
  }

  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printReport(result);
  await disconnectDatabase();
  if (result.reports.some(r => r.error)) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(async error => {
    console.error(error);
    await disconnectDatabase();
    process.exit(1);
  });
}
