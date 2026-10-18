import { z } from 'zod';
import { prisma, type PrismaTransactionClient } from '../../../utils/database';
import { AppError, ErrorCode } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { t } from '../../../i18n';
import { assertSyndicateOfTenant } from '../charge-allocation';
import { isSyndicOnlinePaymentAllowed } from '../online-payment/feature-gate';
import { listActiveReceivingNumbersForPortal } from './receiving-numbers';
import type { DeclaredPaymentSettings, ReceivingNumber } from './types';

/**
 * Réglages du paiement mobile money déclaré d'une copropriété (spec 047,
 * contrats §1.5). Sans ligne en base : valeurs par défaut, rien n'est écrit.
 */

type Client = PrismaTransactionClient | typeof prisma;

/** Quota mensuel de lectures IA par agence (D9). */
export const AI_READS_MONTHLY_QUOTA = 300;

export const DEFAULT_REVIEW_ALERT_BUSINESS_DAYS = 3;

export interface DeclaredPaymentRules {
  enabled: boolean;
  reviewAlertBusinessDays: number;
  proofRequired: boolean;
  payerInstructions: string | null;
  aiPrefillEnabled: boolean;
}

/** Corps de `PUT …/reglages` : champs inconnus refusés, bornes du contrat §1.5. */
export const updateDeclaredPaymentSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    reviewAlertBusinessDays: z.number().int().min(1).max(15).optional(),
    proofRequired: z.boolean().optional(),
    payerInstructions: z.string().trim().max(500).nullable().optional(),
    aiPrefillEnabled: z.boolean().optional()
  })
  .strict();

/**
 * Règles applicables à une copropriété, relues dans `client` (prisma ou
 * transaction). Sans ligne : valeurs par défaut (D11 à D14, D9).
 */
export async function getDeclaredPaymentRules(
  client: Client,
  tenantId: string,
  syndicateId: string
): Promise<DeclaredPaymentRules> {
  const row = await client.syndicDeclaredPaymentSettings.findFirst({ where: { tenantId, syndicateId } });
  return {
    enabled: row?.enabled ?? false,
    reviewAlertBusinessDays: row?.reviewAlertBusinessDays ?? DEFAULT_REVIEW_ALERT_BUSINESS_DAYS,
    proofRequired: row?.proofRequired ?? false,
    payerInstructions: row?.payerInstructions ?? null,
    aiPrefillEnabled: row?.aiPrefillEnabled ?? false
  };
}

/** Début du mois courant, en UTC. */
function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function buildSettings(
  tenantId: string,
  syndicateId: string,
  now: Date = new Date()
): Promise<DeclaredPaymentSettings> {
  const [rules, activeNumbers, aiReadsThisMonth] = await Promise.all([
    getDeclaredPaymentRules(prisma, tenantId, syndicateId),
    prisma.syndicReceivingNumber.count({ where: { tenantId, syndicateId, isActive: true } }),
    prisma.syndicPaymentProofRead.count({ where: { tenantId, createdAt: { gte: startOfMonthUtc(now) } } })
  ]);
  return {
    syndicateId,
    ...rules,
    // Le fournisseur de vision est branché en PR3.
    aiPrefillAvailable: false,
    aiReadsThisMonth,
    aiReadsMonthlyQuota: AI_READS_MONTHLY_QUOTA,
    usable: rules.enabled && activeNumbers > 0
  };
}

export async function getDeclaredPaymentSettings(
  tenantId: string,
  syndicateId: string
): Promise<DeclaredPaymentSettings> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  return buildSettings(tenantId, syndicateId);
}

export async function updateDeclaredPaymentSettings(params: {
  tenantId: string;
  syndicateId: string;
  actorUserId: string;
  body: unknown;
}): Promise<DeclaredPaymentSettings> {
  const { tenantId, syndicateId, actorUserId } = params;
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  // Une valeur hors bornes ou un champ inconnu lève une ZodError (400 VALIDATION_ERROR).
  const body = updateDeclaredPaymentSettingsSchema.parse(params.body);

  const changes: Record<string, unknown> = {};
  if (body.enabled !== undefined) changes.enabled = body.enabled;
  if (body.reviewAlertBusinessDays !== undefined) changes.reviewAlertBusinessDays = body.reviewAlertBusinessDays;
  if (body.proofRequired !== undefined) changes.proofRequired = body.proofRequired;
  if (body.payerInstructions !== undefined) changes.payerInstructions = body.payerInstructions || null;
  if (body.aiPrefillEnabled !== undefined) changes.aiPrefillEnabled = body.aiPrefillEnabled;

  await prisma.syndicDeclaredPaymentSettings.upsert({
    where: { syndicateId },
    create: { tenantId, syndicateId, ...changes, updatedById: actorUserId },
    update: { ...changes, updatedById: actorUserId }
  });

  // Aucune donnée personnelle : les valeurs, et la longueur seule de la consigne payeur.
  const { payerInstructions, ...auditValues } = changes;
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_DECLARED_PAYMENT_SETTINGS_UPDATED,
    entityType: 'SYNDIC_DECLARED_PAYMENT_SETTINGS',
    entityId: syndicateId,
    payload: {
      syndicateId,
      ...auditValues,
      ...(payerInstructions === undefined
        ? {}
        : { payerInstructionsLength: typeof payerInstructions === 'string' ? payerInstructions.length : 0 })
    }
  });
  return buildSettings(tenantId, syndicateId);
}

/**
 * Droit SYNDIC de l'agence pour le paiement déclaré : même décision que le
 * paiement en ligne (agence active, abonnement, modes off/warn/enforce), via
 * `online-payment/feature-gate`. Lève 403 `SYNDIC_FEATURE_DENIED`.
 */
export async function assertSyndicFeatureForDeclared(tenantId: string, now: Date = new Date()): Promise<void> {
  if (!(await isSyndicOnlinePaymentAllowed(tenantId, now))) {
    throw new AppError(
      t("Le paiement mobile money déclaré n'est pas disponible pour cette agence."),
      403,
      ErrorCode.SYNDIC_FEATURE_DENIED
    );
  }
}

/**
 * Disponibilité côté portail : réglage activé, au moins un numéro actif et
 * droit SYNDIC de l'agence. Ne lève jamais pour un refus de droit : `available`
 * vaut alors `false`.
 */
export async function getDeclaredPaymentAvailability(
  tenantId: string,
  syndicateId: string
): Promise<{ available: boolean; settings: DeclaredPaymentSettings; receivingNumbers: ReceivingNumber[] }> {
  const [settings, receivingNumbers, featureAllowed] = await Promise.all([
    buildSettings(tenantId, syndicateId),
    listActiveReceivingNumbersForPortal(tenantId, syndicateId),
    isSyndicOnlinePaymentAllowed(tenantId)
  ]);
  return {
    available: settings.enabled && receivingNumbers.length > 0 && featureAllowed,
    settings,
    receivingNumbers
  };
}
