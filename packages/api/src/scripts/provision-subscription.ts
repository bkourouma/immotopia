/**
 * Outil d'exploitation — provisionnement / suspension d'abonnement en
 * production. Lancé dans le conteneur de l'API :
 *   docker exec immotopia-saas-api node dist/scripts/provision-subscription.js <action> [options]
 *
 * Toute la logique vit dans `services/subscription-provisioning-service.ts` ;
 * ce fichier ne fait qu'analyser les arguments, appeler le service et
 * afficher le résultat. N'importe QUE des dépendances de production (aucune
 * dépendance à `ts-node`, `commander`, etc. à l'exécution).
 */

import { BillingCycle, QuotaPolicy } from '@prisma/client';
import { disconnectDatabase } from '../utils/database';
import { flushAuditEvents } from '../services/audit-service';
import {
  ProvisionDryRunResult,
  ProvisionOutcomeCommon,
  ProvisionRealResult,
  ProvisioningRefusedError,
  SuspendDryRunResult,
  SuspendRealResult,
  listTenants,
  provisionSubscription,
  suspendTenantAction
} from '../services/subscription-provisioning-service';
import { BadRequestError, NotFoundError } from '../middleware/error-middleware';

// =============================================================== analyseur d'arguments

export interface ParsedArgs {
  positional: string[];
  options: Record<string, string | boolean>;
}

export class CliUsageError extends Error {}

/** Drapeaux booleens : ne consomment JAMAIS le token suivant. `--x=valeur` n'est accepte que pour `valeur === 'true'`. */
const BOOLEAN_FLAGS = new Set(['dry-run', 'setup-waived', 'help']);

/** Analyse minimale : `--cle=valeur`, `--cle valeur`, `--drapeau` (booleen). Refuse une option repetee, une option a valeur sans valeur, ou un `=valeur` sur un drapeau booleen autre que `true`. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  const options: Record<string, string | boolean> = {};
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      const key = eq >= 0 ? body.slice(0, eq) : body;
      const inlineValue = eq >= 0 ? body.slice(eq + 1) : undefined;

      if (seen.has(key)) {
        throw new CliUsageError(`Option répétée : --${key}.`);
      }
      seen.add(key);

      if (BOOLEAN_FLAGS.has(key)) {
        if (inlineValue !== undefined && inlineValue !== 'true') {
          throw new CliUsageError(
            `--${key} est un drapeau : seule la forme --${key}=true est acceptée (ou --${key} seul).`
          );
        }
        options[key] = true;
        continue;
      }

      if (inlineValue !== undefined) {
        options[key] = inlineValue;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new CliUsageError(`--${key} attend une valeur.`);
      }
      options[key] = next;
      i += 1;
      continue;
    }
    positional.push(token);
  }
  return { positional, options };
}

const KNOWN_OPTIONS: Record<string, readonly string[]> = {
  list: ['search'],
  provision: ['tenant', 'items', 'trial-ends-at', 'setup-waived', 'quota-policy', 'billing-cycle', 'dry-run'],
  suspend: ['tenant', 'dry-run'],
  help: []
};

function assertKnownOptions(action: string, options: Record<string, string | boolean>): void {
  const allowed = new Set(KNOWN_OPTIONS[action] ?? []);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) {
      throw new CliUsageError(`Option inconnue pour « ${action} » : --${key}.`);
    }
  }
}

function requireString(options: Record<string, string | boolean>, key: string): string {
  const value = options[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CliUsageError(`--${key} est obligatoire et doit avoir une valeur.`);
  }
  return value;
}

function parseItems(raw: string): Array<{ code: string; quantity?: number }> {
  return raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [code, qty] = part.split(':');
      if (!code) throw new CliUsageError(`Élément invalide dans --items : « ${part} ».`);
      if (qty === undefined) return { code };
      const quantity = Number(qty);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new CliUsageError(`Quantité invalide pour ${code} : « ${qty} ».`);
      }
      return { code, quantity };
    });
}

/** Date seule AAAA-MM-JJ -> 23:59:59.999 UTC ce jour-là ; sinon ISO tel quel. */
function parseTrialEndsAt(raw: string): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const value = dateOnly.test(raw) ? `${raw}T23:59:59.999Z` : raw;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new CliUsageError(`--trial-ends-at invalide : « ${raw} » (attendu AAAA-MM-JJ ou ISO).`);
  }
  return date;
}

function parseQuotaPolicy(raw: string): QuotaPolicy {
  if (raw === 'BILL_OVERAGE' || raw === 'BLOCK' || raw === 'WARN_ONLY') return raw;
  throw new CliUsageError(`--quota-policy invalide : « ${raw} » (BILL_OVERAGE, BLOCK ou WARN_ONLY).`);
}

function parseBillingCycle(raw: string): BillingCycle {
  if (raw === 'MONTHLY' || raw === 'ANNUAL') return raw;
  throw new CliUsageError(`--billing-cycle invalide : « ${raw} » (MONTHLY ou ANNUAL).`);
}

const USAGE = `Usage :
  node dist/scripts/provision-subscription.js list [--search <texte>]
  node dist/scripts/provision-subscription.js provision --tenant <id|slug> --items <CODE[:QTE],...>
      [--trial-ends-at <AAAA-MM-JJ|ISO>] [--setup-waived] [--quota-policy BILL_OVERAGE|BLOCK|WARN_ONLY]
      [--billing-cycle MONTHLY|ANNUAL] [--dry-run]
  node dist/scripts/provision-subscription.js suspend --tenant <id|slug> [--dry-run]
  node dist/scripts/provision-subscription.js --help
`;

// =============================================================== affichage

function fmtMoney(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

/** Nombre de jours (arrondi au jour superieur) entre deux dates. */
function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function fmtPlannedItem(item: {
  code: string;
  quantity: number;
  unitMonthlyPrice: number;
  unitSetupPrice: number;
}): string {
  const total = item.unitMonthlyPrice * item.quantity;
  const setup = item.unitSetupPrice ? `, mise en route ${fmtMoney(item.unitSetupPrice)}` : '';
  return `${item.code} × ${item.quantity} — ${fmtMoney(item.unitMonthlyPrice)}/mois par unité, soit ${fmtMoney(total)}/mois${setup}`;
}

function printTenantList(rows: Awaited<ReturnType<typeof listTenants>>): void {
  if (rows.length === 0) {
    console.log('Aucune agence trouvée.');
    return;
  }
  for (const row of rows) {
    console.log(
      `${row.id}  ${row.slug.padEnd(28)} ${row.name.padEnd(30)} agence=${row.status.padEnd(10)} abonnement=${(row.subscriptionStatus ?? 'aucun').padEnd(10)} éléments=[${row.openItemCodes.join(', ')}]`
    );
  }
}

function printEntitlements(
  label: string,
  ent: {
    status: string;
    phase: string;
    modules: string[];
    capacities: Record<string, { used: number; limit: number }>;
    quotaPolicy: string;
  }
): void {
  console.log(
    `  ${label} : statut=${ent.status} phase=${ent.phase} modules=[${ent.modules.join(', ')}] politique=${ent.quotaPolicy}`
  );
  for (const [key, cap] of Object.entries(ent.capacities)) {
    const over = cap.used > cap.limit ? ` (dépassement de ${cap.used - cap.limit})` : '';
    console.log(`    ${key} : ${cap.used}/${cap.limit}${over}`);
  }
}

function printBeforeBlock(result: ProvisionDryRunResult): void {
  console.log('--- Avant ---');
  if (result.before.subscription) {
    const s = result.before.subscription;
    console.log(
      `  Abonnement existant : statut=${s.status} cycle=${s.billingCycle} finEssai=${s.trialEndsAt?.toISOString() ?? 'aucune'} politique=${s.quotaPolicy} setupWaived=${s.metadata?.setupWaived === true}`
    );
    console.log(`  Éléments en vigueur : ${s.items.map(i => `${i.code}×${i.quantity}`).join(', ') || 'aucun'}`);
  } else {
    console.log('  Abonnement existant : aucun');
  }
  printEntitlements('Droits actuels', result.before.entitlementsNow);
  console.log(
    `  Registre : ${result.before.lotRegistry.openActivations} activation(s) ouverte(s), ${result.before.lotRegistry.qualifying} unité(s) qualifiante(s)`
  );
}

/** En-tete commun aux issues non refusees : statut, cycle, politique, mise en route, fin d'essai. */
function printOutcomeHeader(result: ProvisionOutcomeCommon): void {
  console.log(
    `  Statut : ${result.subscriptionStatus}  Cycle : ${result.billingCycle}  Politique de quota : ${result.quotaPolicy}  Mise en route : ${result.setupWaived ? 'levée' : 'non levée'}`
  );
  console.log(
    `  Fin d'essai : ${result.trialEndsAt.toISOString()} (${daysBetween(result.now, result.trialEndsAt)} jour(s))`
  );
}

function printWouldDoBlock(result: ProvisionDryRunResult): void {
  console.log('--- Ce qui serait fait ---');
  if (result.wouldDo === 'refused') {
    console.log('  REFUSÉ :');
    for (const r of result.refusalReasons) console.log(`    - ${r}`);
    return;
  }
  printOutcomeHeader(result);
  if (result.wouldDo === 'already-provisioned') {
    console.log('  Déjà provisionné (aucune écriture).');
    return;
  }
  console.log('  Création de l’abonnement avec les éléments :');
  for (const item of result.plannedItems) console.log(`    ${fmtPlannedItem(item)}`);
  if (result.reconciliationPreview) {
    console.log(
      `  Réconciliation du registre : +${result.reconciliationPreview.added} / -${result.reconciliationPreview.removed} (${JSON.stringify(result.reconciliationPreview.byKind)})`
    );
  }
}

function printAfterBlock(result: ProvisionDryRunResult): void {
  if (!result.after) return;
  console.log('--- Après (attendu) ---');
  printEntitlements('Droits projetés', result.after.projectedEntitlements);
  console.log(
    `  Estimation mensuelle après l'essai : HT ${fmtMoney(result.after.monthlyEstimate.amountExclTax)}, TVA ${fmtMoney(result.after.monthlyEstimate.taxAmount)}, TTC ${fmtMoney(result.after.monthlyEstimate.amountTotal)}`
  );
  const detail = result.after.setupCharge.lines.map(l => `${l.code} ${fmtMoney(l.amount)}`).join(', ');
  if (result.after.setupCharge.firstInvoiceAlreadyIssued && result.after.setupCharge.lines.length === 0) {
    console.log('  Mise en route : aucune (première facture déjà émise)');
  } else if (result.after.setupCharge.waived) {
    console.log(
      `  Mise en route : LEVÉE (aurait coûté ${fmtMoney(result.after.setupCharge.amount)}${detail ? ` : ${detail}` : ''})`
    );
  } else {
    console.log(
      `  Mise en route : sera facturée à la première facture, à la fin de l'essai : ${fmtMoney(result.after.setupCharge.amount)}${detail ? ` (${detail})` : ''}`
    );
  }
  console.log('  Rappel : aucune facture pendant l’essai ; première facture à la fin de l’essai.');
}

function printProvisionDryRun(result: ProvisionDryRunResult): void {
  console.log(
    `Agence : ${result.tenant.id} (${result.tenant.slug}) — ${result.tenant.name} — statut ${result.tenant.status}`
  );
  for (const w of result.warnings) console.log(`  ${w}`);
  printBeforeBlock(result);
  printWouldDoBlock(result);
  printAfterBlock(result);
}

function printProvisionReal(result: ProvisionRealResult): void {
  console.log(`Agence : ${result.tenant.id} (${result.tenant.slug}) — ${result.tenant.name}`);
  for (const w of result.warnings) console.log(`  ${w}`);
  console.log(
    result.outcome === 'created' ? 'Abonnement créé.' : 'Déjà provisionné (aucune écriture sur l’abonnement).'
  );
  printOutcomeHeader(result);
  console.log('  Éléments :');
  for (const item of result.plannedItems) console.log(`    ${fmtPlannedItem(item)}`);
  console.log(
    `  Réconciliation du registre : ${result.reconciliation.qualifying} unité(s) qualifiante(s), +${result.reconciliation.added.length} / -${result.reconciliation.removed.length}`
  );
  printEntitlements('Droits actuels', result.entitlements);
}

function printSuspendDryRun(result: SuspendDryRunResult): void {
  console.log(`Agence : ${result.tenant.id} (${result.tenant.slug}) — ${result.tenant.name}`);
  for (const w of result.warnings) console.log(`  ${w}`);
  console.log(
    `--- Avant --- statut=${result.before.status} actif=${result.before.isActive} membresActifs=${result.before.activeMemberCount} abonnement=${result.before.subscriptionStatus ?? 'aucun'}`
  );
  console.log(
    result.wouldDo === 'nothing'
      ? '--- Ce qui serait fait --- Rien à faire (déjà SUSPENDED).'
      : `--- Ce qui serait fait --- Suspension : révocation des sessions de ${result.before.activeMemberCount} membre(s) actif(s), statut -> SUSPENDED, isActive -> false.`
  );
}

function printSuspendReal(result: SuspendRealResult): void {
  console.log(`Agence : ${result.tenant.id} (${result.tenant.slug}) — ${result.tenant.name}`);
  console.log(result.outcome === 'suspended' ? 'Agence suspendue.' : 'Rien à faire (déjà SUSPENDED).');
}

// =============================================================== main

export async function run(argv: readonly string[]): Promise<number> {
  const { positional, options } = parseArgs(argv);
  const action = positional[0];

  if (!action || action === '--help' || options.help) {
    console.log(USAGE);
    return 0;
  }

  if (positional.length > 1) {
    throw new CliUsageError(`Argument(s) en trop après l'action « ${action} » : ${positional.slice(1).join(', ')}.`);
  }

  if (!KNOWN_OPTIONS[action]) {
    console.error(`Action inconnue : « ${action} ».\n${USAGE}`);
    return 2;
  }
  assertKnownOptions(action, options);

  if (action === 'list') {
    const search = typeof options.search === 'string' ? options.search : undefined;
    const rows = await listTenants({ search });
    printTenantList(rows);
    return 0;
  }

  if (action === 'provision') {
    const tenantRef = requireString(options, 'tenant');
    const itemsRaw = requireString(options, 'items');
    const items = parseItems(itemsRaw);
    const trialEndsAt =
      typeof options['trial-ends-at'] === 'string' ? parseTrialEndsAt(options['trial-ends-at']) : undefined;
    const quotaPolicy =
      typeof options['quota-policy'] === 'string' ? parseQuotaPolicy(options['quota-policy']) : undefined;
    const billingCycle =
      typeof options['billing-cycle'] === 'string' ? parseBillingCycle(options['billing-cycle']) : undefined;
    const dryRun = Boolean(options['dry-run']);
    const setupWaived = Boolean(options['setup-waived']);

    const result = await provisionSubscription({
      tenantRef,
      items,
      trialEndsAt,
      quotaPolicy,
      billingCycle,
      dryRun,
      setupWaived
    });
    if (result.outcome === 'dry-run') {
      printProvisionDryRun(result);
      return result.wouldDo === 'refused' ? 2 : 0;
    }
    printProvisionReal(result);
    return 0;
  }

  // action === 'suspend'
  const tenantRef = requireString(options, 'tenant');
  const dryRun = Boolean(options['dry-run']);
  const result = await suspendTenantAction({ tenantRef, dryRun });
  if (result.outcome === 'dry-run') {
    printSuspendDryRun(result);
    return 0;
  }
  printSuspendReal(result);
  return 0;
}

async function main(): Promise<void> {
  let exitCode = 0;
  try {
    exitCode = await run(process.argv.slice(2));
  } catch (error) {
    if (
      error instanceof CliUsageError ||
      error instanceof BadRequestError ||
      error instanceof NotFoundError ||
      error instanceof ProvisioningRefusedError
    ) {
      const reasons = error instanceof ProvisioningRefusedError ? error.reasons : [error.message];
      for (const reason of reasons) console.error(reason);
      exitCode = 2;
    } else {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error('Erreur inattendue :', detail);
      exitCode = 1;
    }
  }

  const remaining = await flushAuditEvents();
  if (remaining > 0) {
    console.error(`${remaining} évènement(s) d'audit n'ont pas pu être écrits.`);
    exitCode = exitCode === 0 ? 1 : exitCode;
  }

  try {
    await disconnectDatabase();
  } catch (error) {
    console.error('Erreur lors de la déconnexion de la base :', error);
    exitCode = exitCode === 0 ? 1 : exitCode;
  }

  process.exitCode = exitCode;
  if (remaining > 0) {
    // La file d'audit non videe laisse l'intervalle de relance de
    // audit-service arme : sans sortie explicite, le process ne se termine
    // jamais tout seul.
    process.exit(exitCode);
  }
}

if (require.main === module) {
  main();
}
