import type { Prisma } from '@prisma/client';
import { prisma, type PrismaTransactionClient } from '../../../utils/database';
import { compareCallsForAllocation, fromCents, toCents } from '../charge-allocation-plan';
import { sumAllocationsByCall } from '../charge-allocation';
import { businessDaysBetween, isOverdue } from './business-days';
import { normalizeIvorianMsisdn } from './phone';
import { normalizeTransactionReference } from './reference';
import { getDeclaredPaymentRules } from './settings';
import type { DeclarationAlert, DeclarationStatus, PrefillField } from './types';

/**
 * Alertes d'une déclaration de paiement (spec 047, R17, contrats §0.1
 * `DeclarationAlert`) et résolution des appels visés par une ligne.
 *
 * Tout est CALCULÉ À LA LECTURE : aucune écriture, aucune colonne d'alerte.
 * Les montants passent par les centimes entiers de `charge-allocation-plan`
 * (jamais d'addition de flottants).
 *
 * Statuts : les alertes de décision (référence, doublon, excédent, partiel,
 * propriétaire, exercice clos, retard) n'ont de sens que pour une déclaration
 * `PENDING` ; pour tout autre statut elles sont omises. Restent, parce qu'ils
 * décrivent la déclaration elle-même et non l'état courant des comptes,
 * `AI_FIELDS_EDITED` et `RECIPIENT_MISMATCH` (lecture de l'IA, R27 et R28).
 */

type Client = PrismaTransactionClient | typeof prisma;

/** Écart maximal de `paidAt` entre deux déclarations pour un doublon probable (R10). */
export const PROBABLE_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

const PREFILL_FIELDS: readonly PrefillField[] = ['operator', 'amount', 'paidAt', 'transactionReference', 'payerPhone'];

/** Plafond de ChargePayment signalés par déclaration (l'écran n'en montre pas davantage). */
const MAX_EXISTING_PAYMENT_ALERTS = 5;

// ---------------------------------------------------------------------------
// Types et sélection Prisma
// ---------------------------------------------------------------------------

/**
 * Sélection Prisma qui fournit à `computeDeclarationAlerts` tout ce qu'il lit.
 * Explicite (jamais d'objet complet) : `aiPrefill` sert seulement à la lecture
 * défensive du numéro destinataire et ne sort jamais dans une réponse.
 */
export const DECLARATION_ALERTS_SELECT = {
  id: true,
  tenantId: true,
  syndicateId: true,
  receivingNumberId: true,
  receivingPhone: true,
  payerPhone: true,
  amount: true,
  paidAt: true,
  createdAt: true,
  transactionReference: true,
  status: true,
  declaredByContactId: true,
  aiPrefill: true,
  aiEditedFields: true,
  lines: {
    select: { id: true, lotId: true, amount: true, chargeCallIds: true, chargePaymentId: true },
    orderBy: { createdAt: 'asc' }
  }
} satisfies Prisma.SyndicPaymentDeclarationSelect;

/** Même objet, nom de commodité pour un `include`/`select` côté appelant. */
export const DECLARATION_ALERTS_INCLUDE = DECLARATION_ALERTS_SELECT;

/** Déclaration chargée avec `DECLARATION_ALERTS_SELECT` (ou une sélection plus large). */
export interface DeclarationForAlerts {
  id: string;
  tenantId: string;
  syndicateId: string;
  receivingNumberId: string;
  /** Instantané E.164 du numéro choisi. */
  receivingPhone: string;
  payerPhone: string;
  /** Decimal Prisma, nombre ou chaîne. */
  amount: unknown;
  paidAt: Date;
  createdAt: Date;
  transactionReference: string;
  status: DeclarationStatus;
  declaredByContactId: string | null;
  aiPrefill: unknown;
  aiEditedFields: string[];
  lines: Array<{
    id: string;
    lotId: string;
    amount: unknown;
    chargeCallIds: string[];
    chargePaymentId?: string | null;
  }>;
}

/** Appel visé, avec son reste dû ACTUEL en centimes. */
export interface CallDue {
  id: string;
  lotId: string;
  period: string;
  dueDate: Date;
  createdAt: Date;
  remainingCents: number;
}

export interface LineTargetInput {
  /** Clé libre de l'appelant (en général l'identifiant de la ligne). */
  key: string;
  syndicateId: string;
  lotId: string;
  amountCents: number;
  chargeCallIds: string[];
}

export interface LineTargets {
  calls: CallDue[];
  /** Somme des restes dus des appels visés, en centimes. */
  totalRemainingCents: number;
}

// ---------------------------------------------------------------------------
// Appels visés par une ligne
// ---------------------------------------------------------------------------

/**
 * Appels qu'une ligne vise, avec leur reste dû actuel (montant moins la somme
 * des affectations, requêtes groupées : pas d'aller-retour par appel).
 *
 * - `chargeCallIds` explicites : ces appels, s'ils appartiennent bien au lot de
 *   la ligne et à la copropriété (un appel étranger est ignoré, comme inexistant).
 *   Un appel soldé entre-temps reste dans la liste avec un reste dû nul (R13).
 * - `chargeCallIds` vide : appels OUVERTS du lot, les plus anciens d'abord
 *   (ordre d'affectation), autant qu'il en faut pour couvrir le montant de la
 *   ligne en cumulant leurs restes dus, au moins le plus ancien. C'est
 *   exactement l'ensemble que `planAllocationCents` toucherait.
 */
export async function resolveLineTargets(client: Client, lines: LineTargetInput[]): Promise<Map<string, LineTargets>> {
  const result = new Map<string, LineTargets>();
  if (lines.length === 0) return result;

  const explicitIds = new Set<string>();
  const openLotIds = new Set<string>();
  const syndicateIds = new Set<string>();
  for (const line of lines) {
    syndicateIds.add(line.syndicateId);
    if (line.chargeCallIds.length > 0) line.chargeCallIds.forEach(id => explicitIds.add(id));
    else openLotIds.add(line.lotId);
  }
  const branches: Prisma.ChargeCallWhereInput[] = [];
  if (explicitIds.size > 0) branches.push({ id: { in: Array.from(explicitIds) } });
  if (openLotIds.size > 0) branches.push({ lotId: { in: Array.from(openLotIds) }, status: { not: 'PAID' } });

  const rows = await client.chargeCall.findMany({
    where: { syndicateId: { in: Array.from(syndicateIds) }, OR: branches },
    select: { id: true, lotId: true, syndicateId: true, period: true, dueDate: true, createdAt: true, amount: true },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }]
  });
  const paid = await sumAllocationsByCall(
    client,
    rows.map(row => row.id)
  );
  const dues = rows.map(row => ({
    syndicateId: row.syndicateId,
    due: {
      id: row.id,
      lotId: row.lotId,
      period: row.period,
      dueDate: row.dueDate,
      createdAt: row.createdAt,
      remainingCents: Math.max(0, toCents(row.amount) - (paid.get(row.id) ?? 0))
    } satisfies CallDue
  }));
  const byOrder = (a: CallDue, b: CallDue) =>
    compareCallsForAllocation(
      { id: a.id, dueDate: a.dueDate, createdAt: a.createdAt, outstandingCents: a.remainingCents },
      { id: b.id, dueDate: b.dueDate, createdAt: b.createdAt, outstandingCents: b.remainingCents }
    );

  for (const line of lines) {
    const ofLot = dues
      .filter(entry => entry.due.lotId === line.lotId && entry.syndicateId === line.syndicateId)
      .map(entry => entry.due);
    let calls: CallDue[];
    if (line.chargeCallIds.length > 0) {
      const wanted = new Set(line.chargeCallIds);
      calls = ofLot.filter(call => wanted.has(call.id)).sort(byOrder);
    } else {
      calls = [];
      let covered = 0;
      for (const call of ofLot.filter(candidate => candidate.remainingCents > 0).sort(byOrder)) {
        if (calls.length > 0 && covered >= line.amountCents) break;
        calls.push(call);
        covered += call.remainingCents;
      }
    }
    result.set(line.key, { calls, totalRemainingCents: calls.reduce((sum, call) => sum + call.remainingCents, 0) });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Doublons probables (R10)
// ---------------------------------------------------------------------------

/** Champs lus pour comparer deux déclarations. */
export interface DuplicateProbe {
  id: string;
  receivingNumberId: string;
  payerPhone: string;
  amount: unknown;
  paidAt: Date;
  createdAt: Date;
  transactionReference: string;
}

export const DUPLICATE_PROBE_SELECT = {
  id: true,
  receivingNumberId: true,
  payerPhone: true,
  amount: true,
  paidAt: true,
  createdAt: true,
  transactionReference: true
} satisfies Prisma.SyndicPaymentDeclarationSelect;

/**
 * Déclarations de `pool` qui sont un doublon probable de `target` : même numéro
 * de réception, même montant, même numéro payeur, `paidAt` à 10 minutes près,
 * références DIFFÉRENTES (une même référence est refusée à la création).
 */
export function matchProbableDuplicates(target: DuplicateProbe, pool: DuplicateProbe[]): DuplicateProbe[] {
  const cents = toCents(target.amount);
  return pool
    .filter(
      other =>
        other.id !== target.id &&
        other.receivingNumberId === target.receivingNumberId &&
        other.payerPhone === target.payerPhone &&
        other.transactionReference !== target.transactionReference &&
        toCents(other.amount) === cents &&
        Math.abs(other.paidAt.getTime() - target.paidAt.getTime()) <= PROBABLE_DUPLICATE_WINDOW_MS
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * Déclarations `PENDING` ou `APPROVED` de la copropriété qui peuvent être le
 * doublon d'une des `targets` (filtre grossier en base, la comparaison exacte
 * est `matchProbableDuplicates`). Renvoie aussi les cibles elles-mêmes.
 */
export async function loadDuplicateCandidates(
  client: Client,
  tenantId: string,
  syndicateId: string,
  targets: DuplicateProbe[]
): Promise<DuplicateProbe[]> {
  if (targets.length === 0) return [];
  const times = targets.map(target => target.paidAt.getTime());
  return client.syndicPaymentDeclaration.findMany({
    where: {
      tenantId,
      syndicateId,
      status: { in: ['PENDING', 'APPROVED'] },
      receivingNumberId: { in: Array.from(new Set(targets.map(target => target.receivingNumberId))) },
      payerPhone: { in: Array.from(new Set(targets.map(target => target.payerPhone))) },
      paidAt: {
        gte: new Date(Math.min(...times) - PROBABLE_DUPLICATE_WINDOW_MS),
        lte: new Date(Math.max(...times) + PROBABLE_DUPLICATE_WINDOW_MS)
      }
    },
    select: DUPLICATE_PROBE_SELECT
  });
}

// ---------------------------------------------------------------------------
// Lecture défensive du JSON de pré-remplissage (R27, R28)
// ---------------------------------------------------------------------------

/** Champs IA retouchés, limités aux champs connus (jamais de valeur libre). */
export function editedFieldsOf(raw: unknown): PrefillField[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const value of raw) if (typeof value === 'string') seen.add(value);
  return PREFILL_FIELDS.filter(field => seen.has(field));
}

const PREFILL_CONTAINER_KEYS = ['reading', 'proposal', 'result', 'values', 'fields', 'prefill'] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Numéro destinataire lu par l'IA, ou `null`. Le JSON peut avoir n'importe
 * quelle forme (il est écrit par un autre lot, voire corrompu) : on cherche
 * `recipientPhone` à la racine puis dans quelques conteneurs usuels, sous forme
 * de chaîne ou de `{ value }`, sans jamais lever.
 */
export function readRecipientPhone(aiPrefill: unknown): string | null {
  const root = asRecord(aiPrefill);
  if (!root) return null;
  const candidates: Array<Record<string, unknown>> = [root];
  for (const key of PREFILL_CONTAINER_KEYS) {
    const nested = asRecord(root[key]);
    if (nested) candidates.push(nested);
  }
  for (const candidate of candidates) {
    const raw = candidate.recipientPhone;
    const wrapped = asRecord(raw)?.value;
    const text = typeof raw === 'string' ? raw : typeof wrapped === 'string' ? wrapped : null;
    const trimmed = text?.trim();
    if (trimmed) return trimmed.slice(0, 40);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Calcul
// ---------------------------------------------------------------------------

/** Alertes qui décrivent la déclaration elle-même, calculées pour tout statut. */
function staticAlerts(declaration: DeclarationForAlerts): DeclarationAlert[] {
  const alerts: DeclarationAlert[] = [];
  const edited = editedFieldsOf(declaration.aiEditedFields);
  if (edited.length > 0) alerts.push({ kind: 'AI_FIELDS_EDITED', fields: edited });
  const read = readRecipientPhone(declaration.aiPrefill);
  if (read) {
    const normalized = normalizeIvorianMsisdn(read);
    if (normalized !== declaration.receivingPhone) {
      alerts.push({ kind: 'RECIPIENT_MISMATCH', recipientPhone: normalized ?? read });
    }
  }
  return alerts;
}

function isCurrentOwner(profile: { ownedSince: Date; ownedUntil: Date | null }, now: Date): boolean {
  return (
    profile.ownedSince.getTime() <= now.getTime() &&
    (!profile.ownedUntil || profile.ownedUntil.getTime() >= now.getTime())
  );
}

/**
 * Alertes de plusieurs déclarations en un petit nombre de requêtes groupées.
 * Renvoie une entrée par déclaration reçue (tableau vide si aucune alerte).
 * `declarations` peut mêler plusieurs copropriétés.
 */
export async function computeDeclarationAlertsBatch(
  client: Client,
  declarations: DeclarationForAlerts[],
  now: Date = new Date()
): Promise<Map<string, DeclarationAlert[]>> {
  const result = new Map<string, DeclarationAlert[]>();
  for (const declaration of declarations) result.set(declaration.id, staticAlerts(declaration));
  const pending = declarations.filter(declaration => declaration.status === 'PENDING');
  if (pending.length === 0) return result;

  const syndicateIds = Array.from(new Set(pending.map(declaration => declaration.syndicateId)));
  const lines = pending.flatMap(declaration => declaration.lines.map(line => ({ declaration, line })));
  const lotIds = Array.from(new Set(lines.map(({ line }) => line.lotId)));
  const references = Array.from(new Set(pending.map(declaration => declaration.transactionReference)));
  const contactIds = Array.from(
    new Set(pending.map(declaration => declaration.declaredByContactId).filter((id): id is string => Boolean(id)))
  );
  const years = Array.from(new Set(pending.map(declaration => declaration.paidAt.getUTCFullYear())));

  const tenantPairs = new Map<string, { tenantId: string; syndicateId: string }>();
  for (const declaration of pending) {
    tenantPairs.set(`${declaration.tenantId}|${declaration.syndicateId}`, {
      tenantId: declaration.tenantId,
      syndicateId: declaration.syndicateId
    });
  }

  const [rulesList, payments, duplicatePools, targets, ownerProfiles, closedBudgets] = await Promise.all([
    Promise.all(
      Array.from(tenantPairs.values()).map(async pair => ({
        key: `${pair.tenantId}|${pair.syndicateId}`,
        rules: await getDeclaredPaymentRules(client, pair.tenantId, pair.syndicateId)
      }))
    ),
    client.chargePayment.findMany({
      where: {
        OR: references.map(reference => ({ reference: { equals: reference, mode: 'insensitive' as const } })),
        lot: { syndicateId: { in: syndicateIds } }
      },
      select: {
        id: true,
        reference: true,
        paidAt: true,
        amount: true,
        lot: { select: { syndicateId: true } }
      },
      orderBy: { paidAt: 'asc' },
      take: 200
    }),
    Promise.all(
      Array.from(tenantPairs.values()).map(async pair => ({
        key: `${pair.tenantId}|${pair.syndicateId}`,
        pool: await loadDuplicateCandidates(
          client,
          pair.tenantId,
          pair.syndicateId,
          pending.filter(d => d.tenantId === pair.tenantId && d.syndicateId === pair.syndicateId)
        )
      }))
    ),
    resolveLineTargets(
      client,
      lines.map(({ declaration, line }) => ({
        key: line.id,
        syndicateId: declaration.syndicateId,
        lotId: line.lotId,
        amountCents: toCents(line.amount),
        chargeCallIds: line.chargeCallIds
      }))
    ),
    contactIds.length === 0
      ? Promise.resolve([])
      : client.lotOwnerProfile.findMany({
          where: { lotId: { in: lotIds }, contactId: { in: contactIds }, isActive: true },
          select: { lotId: true, contactId: true, ownedSince: true, ownedUntil: true }
        }),
    client.syndicateBudget.findMany({
      where: { syndicateId: { in: syndicateIds }, status: 'CLOSED', fiscalYear: { in: years } },
      select: { syndicateId: true, fiscalYear: true }
    })
  ]);

  const rulesByKey = new Map(rulesList.map(entry => [entry.key, entry.rules]));
  const poolByKey = new Map(duplicatePools.map(entry => [entry.key, entry.pool]));

  for (const declaration of pending) {
    const alerts: DeclarationAlert[] = [];
    const pairKey = `${declaration.tenantId}|${declaration.syndicateId}`;

    // Référence déjà portée par un paiement de charges de la copropriété (saisie manuelle antérieure).
    // Comparaison sur la forme normalisée : un paiement saisi à la main peut avoir des espaces ou des minuscules.
    for (const payment of payments) {
      if (alerts.filter(a => a.kind === 'REFERENCE_ON_EXISTING_PAYMENT').length >= MAX_EXISTING_PAYMENT_ALERTS) break;
      if (payment.lot?.syndicateId !== declaration.syndicateId || !payment.reference) continue;
      const normalized =
        normalizeTransactionReference(payment.reference) ?? payment.reference.replace(/\s+/g, '').toUpperCase();
      if (normalized !== declaration.transactionReference) continue;
      alerts.push({
        kind: 'REFERENCE_ON_EXISTING_PAYMENT',
        chargePaymentId: payment.id,
        paidAt: payment.paidAt.toISOString(),
        amount: fromCents(toCents(payment.amount))
      });
    }

    for (const duplicate of matchProbableDuplicates(declaration, poolByKey.get(pairKey) ?? [])) {
      alerts.push({
        kind: 'PROBABLE_DUPLICATE',
        declarationId: duplicate.id,
        createdAt: duplicate.createdAt.toISOString()
      });
    }

    for (const line of declaration.lines) {
      const amountCents = toCents(line.amount);
      const totalCents = targets.get(line.id)?.totalRemainingCents ?? 0;
      if (amountCents > totalCents) {
        alerts.push({ kind: 'EXCESS', lotId: line.lotId, excess: fromCents(amountCents - totalCents) });
      } else if (amountCents < totalCents) {
        alerts.push({ kind: 'PARTIAL', lotId: line.lotId, remaining: fromCents(totalCents - amountCents) });
      }
    }

    // Le déclarant gestionnaire (P4) n'a pas de contact : rien à contrôler.
    if (declaration.declaredByContactId) {
      for (const line of declaration.lines) {
        const stillOwner = ownerProfiles.some(
          profile =>
            profile.lotId === line.lotId &&
            profile.contactId === declaration.declaredByContactId &&
            isCurrentOwner(profile, now)
        );
        if (!stillOwner) alerts.push({ kind: 'DECLARANT_NOT_CURRENT_OWNER', lotId: line.lotId });
      }
    }

    alerts.push(...(result.get(declaration.id) ?? []));

    // Même règle qu'`assertFiscalYearOpenTx`, en lecture seule : budget CLOSED de l'année de la date de paiement.
    if (
      closedBudgets.some(
        budget =>
          budget.syndicateId === declaration.syndicateId && budget.fiscalYear === declaration.paidAt.getUTCFullYear()
      )
    ) {
      alerts.push({ kind: 'FISCAL_YEAR_CLOSED' });
    }

    const threshold = rulesByKey.get(pairKey)?.reviewAlertBusinessDays ?? 0;
    if (threshold > 0 && isOverdue(declaration.createdAt, threshold, now)) {
      alerts.push({ kind: 'OVERDUE', businessDays: businessDaysBetween(declaration.createdAt, now) });
    }

    result.set(declaration.id, alerts);
  }
  return result;
}

/**
 * Alertes d'une déclaration (R17). `client` : prisma ou transaction. Voir
 * l'en-tête du fichier pour les statuts autres que `PENDING`.
 */
export async function computeDeclarationAlerts(
  client: Client,
  declaration: DeclarationForAlerts,
  now: Date = new Date()
): Promise<DeclarationAlert[]> {
  const alerts = await computeDeclarationAlertsBatch(client, [declaration], now);
  return alerts.get(declaration.id) ?? [];
}
