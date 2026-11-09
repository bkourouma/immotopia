import { prisma } from '../../../utils/database';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { isPaymentProofVisionConfigured } from '../../payment-proof/vision';
import { updateDeclaredSettingsBodySchema } from './admin-schemas';
import {
  RENTAL_DEFAULT_REVIEW_ALERT_BUSINESS_DAYS,
  RENTAL_PROOF_READ_QUOTAS,
  type RentalDeclaredPaymentSettingsDto
} from './types';

/**
 * Réglages du paiement déclaré d'une agence (contrat §1.2). Sans ligne en base :
 * défauts H4 (enabled=true, proofRequired=false, aiPrefillEnabled=false, 3 jours),
 * rien n'est écrit par une lecture ; la ligne naît au premier `PUT`.
 */

export interface DeclaredPaymentRules {
  enabled: boolean;
  proofRequired: boolean;
  aiPrefillEnabled: boolean;
  reviewAlertBusinessDays: number;
  payerInstructions: string | null;
}

export type DeclaredPaymentSettingsView = RentalDeclaredPaymentSettingsDto & { payerInstructions: string | null };

export async function loadDeclaredPaymentSettings(tenantId: string): Promise<DeclaredPaymentRules> {
  const row = await prisma.rentalDeclaredPaymentSettings.findFirst({ where: { tenant_id: tenantId } });
  return {
    enabled: row?.enabled ?? true,
    proofRequired: row?.proof_required ?? false,
    aiPrefillEnabled: row?.ai_prefill_enabled ?? false,
    reviewAlertBusinessDays: row?.review_alert_business_days ?? RENTAL_DEFAULT_REVIEW_ALERT_BUSINESS_DAYS,
    payerInstructions: row?.payer_instructions ?? null
  };
}

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getSettingsDto(tenantId: string, now: Date = new Date()): Promise<DeclaredPaymentSettingsView> {
  const [rules, activeNumbers, aiReadsThisMonth] = await Promise.all([
    loadDeclaredPaymentSettings(tenantId),
    prisma.rentalReceivingNumber.count({ where: { tenant_id: tenantId, is_active: true } }),
    prisma.rentalPaymentProofRead.count({
      where: { tenant_id: tenantId, created_at: { gte: startOfMonthUtc(now) }, outcome: { not: 'DISABLED' } }
    })
  ]);
  return {
    enabled: rules.enabled,
    proofRequired: rules.proofRequired,
    aiPrefillEnabled: rules.aiPrefillEnabled,
    reviewAlertBusinessDays: rules.reviewAlertBusinessDays,
    payerInstructions: rules.payerInstructions,
    aiPrefillAvailable: isPaymentProofVisionConfigured(),
    aiReadsThisMonth,
    aiReadsMonthlyQuota: RENTAL_PROOF_READ_QUOTAS.tenantPerMonth,
    usable: rules.enabled && activeNumbers > 0
  };
}

export async function updateSettings(
  tenantId: string,
  userId: string,
  body: unknown
): Promise<DeclaredPaymentSettingsView> {
  // Hors bornes, champ inconnu ou corps vide : ZodError (400 VALIDATION_ERROR).
  const parsed = updateDeclaredSettingsBodySchema.parse(body ?? {});
  const before = await loadDeclaredPaymentSettings(tenantId);

  const changes: Record<string, unknown> = {};
  const audit: Record<string, unknown> = {};
  const apply = (key: keyof DeclaredPaymentRules, column: string, value: unknown) => {
    if (value === undefined || value === before[key]) return;
    changes[column] = value;
    audit[key] = value;
  };
  apply('enabled', 'enabled', parsed.enabled);
  apply('proofRequired', 'proof_required', parsed.proofRequired);
  apply('aiPrefillEnabled', 'ai_prefill_enabled', parsed.aiPrefillEnabled);
  apply('reviewAlertBusinessDays', 'review_alert_business_days', parsed.reviewAlertBusinessDays);
  if (parsed.payerInstructions !== undefined) {
    const next = parsed.payerInstructions || null;
    if (next !== before.payerInstructions) {
      changes.payer_instructions = next;
      // Jamais le texte dans l'audit : sa longueur seule.
      audit.payerInstructionsLength = next ? next.length : 0;
    }
  }

  // Sans changement de valeur : la ligne est tout de même créée (le gestionnaire a validé les défauts).
  await prisma.rentalDeclaredPaymentSettings.upsert({
    where: { tenant_id: tenantId },
    create: { tenant_id: tenantId, ...changes, updated_by_id: userId },
    update: { ...changes, updated_by_id: userId }
  });

  if (Object.keys(audit).length > 0) {
    logAuditEvent({
      actorUserId: userId,
      tenantId,
      actionKey: AuditActionKey.RENTAL_DECLARED_PAYMENT_SETTINGS_UPDATED,
      entityType: 'RENTAL_DECLARED_PAYMENT_SETTINGS',
      entityId: tenantId,
      payload: audit
    });
  }
  return getSettingsDto(tenantId);
}
