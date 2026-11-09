import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { t } from '../../../i18n';
import { AppError, ErrorCode } from '../../../middleware/error-middleware';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { getPaymentProofVisionProvider, isPaymentProofVisionConfigured } from '../../payment-proof/vision';
import { normalizeModelRead } from '../../syndics/declared-payment/proof-read';
import { discardTempProof, prepareProofFile, saveTempProofRead, type ProofFileInput } from './proof-files';
import { loadDeclaredPaymentSettings, type DeclaredPaymentRules } from './settings';
import { RENTAL_PROOF_READ_QUOTAS, type ProofReadResultDto, type RentalPrefillField } from './types';

/**
 * Lecture IA d'une capture de paiement locatif (contrat 049, §1.5).
 *
 * La capture est un fichier privé conservé 24 h, lié par `proofReadId`. Le modèle
 * ne décide de rien : sa sortie est normalisée (mêmes règles que le Syndic) et ne
 * produit que des PROPOSITIONS. Une panne du fournisseur n'est jamais une erreur :
 * réponse 200 `UNREADABLE`. Seules l'indisponibilité (409) et les quotas (429)
 * sont des erreurs. Journal : identifiants, issue, durée, jamais une valeur lue.
 */

export const RENTAL_PROOF_READ_RETENTION_HOURS = 24;

type ReadOutcome = 'OK' | 'UNREADABLE' | 'NOT_A_PAYMENT' | 'FAILED' | 'DISABLED';

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function disabled(): AppError {
  return new AppError(
    t("La lecture automatique des captures n'est pas disponible."),
    409,
    ErrorCode.RENTAL_PROOF_READ_DISABLED
  );
}

function quotaExceeded(scope: 'CONTACT_MONTH' | 'TENANT_MONTH'): AppError {
  const message =
    scope === 'TENANT_MONTH'
      ? t("Le nombre de lectures automatiques de ce mois est atteint pour l'agence. Saisissez les champs à la main.")
      : t('Vous avez atteint le nombre de lectures automatiques de ce mois. Saisissez les champs à la main.');
  return new AppError(message, 429, ErrorCode.RENTAL_PROOF_READ_QUOTA_EXCEEDED, undefined, { scope });
}

/** Lectures de ce mois (celles qui ont réellement appelé le modèle). */
async function monthlyCounts(
  client: Pick<typeof prisma, 'rentalPaymentProofRead'>,
  tenantId: string,
  clientId: string,
  now: Date
): Promise<{ tenant: number; contact: number }> {
  const since = startOfMonthUtc(now);
  const [tenant, contact] = await Promise.all([
    client.rentalPaymentProofRead.count({
      where: { tenant_id: tenantId, created_at: { gte: since }, outcome: { not: 'DISABLED' } }
    }),
    client.rentalPaymentProofRead.count({
      where: {
        tenant_id: tenantId,
        renter_client_id: clientId,
        created_at: { gte: since },
        outcome: { not: 'DISABLED' }
      }
    })
  ]);
  return { tenant, contact };
}

/** Le pré-remplissage est-il proposé au locataire (réglage, fournisseur, quotas mensuels) ? */
export async function isAiPrefillOffered(
  tenantId: string,
  clientId: string,
  rules: DeclaredPaymentRules,
  now: Date = new Date()
): Promise<boolean> {
  if (!rules.aiPrefillEnabled || !isPaymentProofVisionConfigured()) return false;
  const counts = await monthlyCounts(prisma, tenantId, clientId, now);
  return (
    counts.tenant < RENTAL_PROOF_READ_QUOTAS.tenantPerMonth && counts.contact < RENTAL_PROOF_READ_QUOTAS.contactPerMonth
  );
}

async function reserveRead(params: {
  readId: string;
  tenantId: string;
  clientId: string;
  sha256: string;
  provider: string;
  model: string;
  now: Date;
}): Promise<void> {
  const { tenantId, now } = params;
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rental-proof-read:${tenantId}`}))`;
    const counts = await monthlyCounts(tx, tenantId, params.clientId, now);
    if (counts.tenant >= RENTAL_PROOF_READ_QUOTAS.tenantPerMonth) throw quotaExceeded('TENANT_MONTH');
    if (counts.contact >= RENTAL_PROOF_READ_QUOTAS.contactPerMonth) throw quotaExceeded('CONTACT_MONTH');
    await tx.rentalPaymentProofRead.create({
      data: {
        id: params.readId,
        tenant_id: tenantId,
        renter_client_id: params.clientId,
        sha256: params.sha256,
        provider: params.provider,
        model: params.model,
        outcome: 'FAILED',
        latency_ms: 0,
        expires_at: new Date(now.getTime() + RENTAL_PROOF_READ_RETENTION_HOURS * 3_600_000)
      }
    });
  });
}

const EMPTY: Omit<ProofReadResultDto, 'proofReadId' | 'quality'> = {
  operator: null,
  amount: null,
  reference: null,
  paidAt: null,
  payerPhone: null,
  recipientPhone: null,
  confidence: {},
  warnings: [],
  matchedReceivingNumberId: null
};

export async function readRentalProof(params: {
  tenantId: string;
  tenantClientId: string;
  file: ProofFileInput | null;
  now?: Date;
}): Promise<ProofReadResultDto> {
  const { tenantId, tenantClientId } = params;
  const now = params.now ?? new Date();

  const rules = await loadDeclaredPaymentSettings(tenantId);
  const provider = getPaymentProofVisionProvider();
  if (!rules.enabled || !rules.aiPrefillEnabled || !isPaymentProofVisionConfigured()) throw disabled();

  if (!params.file) {
    throw new AppError(t('La capture est vide ou illisible.'), 400, ErrorCode.RENTAL_DECLARATION_PROOF_REQUIRED);
  }
  const prepared = prepareProofFile(params.file);

  const readId = randomUUID();
  await reserveRead({
    readId,
    tenantId,
    clientId: tenantClientId,
    sha256: prepared.sha256,
    provider: provider.id,
    model: provider.model,
    now
  });

  let tempFileUrl: string | null = null;
  try {
    tempFileUrl = (await saveTempProofRead({ tenantId, readId, file: prepared })).fileUrl;
    // Chemin posé en base AVANT l'appel au modèle : la purge retrouve toujours le fichier.
    await prisma.rentalPaymentProofRead.updateMany({
      where: { id: readId, tenant_id: tenantId },
      data: { temp_file_url: tempFileUrl }
    });
  } catch (error) {
    if (tempFileUrl) await discardTempProof(tenantId, tempFileUrl);
    await prisma.rentalPaymentProofRead
      .deleteMany({ where: { id: readId, tenant_id: tenantId } })
      .catch(() => undefined);
    throw error;
  }

  let result: ProofReadResultDto = { proofReadId: readId, quality: 'UNREADABLE', ...EMPTY };
  let rowOutcome: ReadOutcome = 'FAILED';
  let latencyMs = 0;
  let recipientForCheck: string | null = null;
  try {
    // L'appel ne lève jamais : une panne devient « illisible ».
    const outcome = await provider.analyze(
      { image: prepared.buffer, mimeType: prepared.mimeType },
      new AbortController().signal
    );
    latencyMs = outcome.latencyMs;
    if (outcome.ok) {
      const reading = normalizeModelRead(outcome.result, now);
      rowOutcome = reading.quality;
      const confidence: Partial<Record<RentalPrefillField, number>> = {};
      for (const field of ['operator', 'amount', 'paidAt', 'payerPhone'] as const) {
        const value = reading.confidence[field];
        if (value !== undefined) confidence[field] = value;
      }
      if (reading.confidence.transactionReference !== undefined) {
        confidence.reference = reading.confidence.transactionReference;
      }
      result = {
        proofReadId: readId,
        quality: reading.quality,
        operator: reading.operator,
        amount: reading.amount,
        reference: reading.transactionReference,
        paidAt: reading.paidAt,
        payerPhone: reading.payerPhone,
        recipientPhone: reading.recipientPhone,
        confidence,
        warnings: [],
        matchedReceivingNumberId: null
      };
      recipientForCheck = reading.recipientPhone;
    } else if (outcome.reason === 'DISABLED') {
      rowOutcome = 'DISABLED';
    }

    if (result.quality === 'OK') {
      if (recipientForCheck) {
        const numbers = await prisma.rentalReceivingNumber.findMany({
          where: { tenant_id: tenantId, is_active: true },
          select: { id: true, phone: true }
        });
        result.matchedReceivingNumberId = numbers.find(n => n.phone === recipientForCheck)?.id ?? null;
        if (!result.matchedReceivingNumberId) result.warnings.push('RECIPIENT_NOT_A_RECEIVING_NUMBER');
      }
      if (result.reference) {
        const used = await prisma.rentalPaymentDeclaration.findFirst({
          where: {
            tenant_id: tenantId,
            reference_normalized: result.reference,
            status: { in: ['PENDING', 'APPROVED'] }
          },
          select: { id: true }
        });
        if (used) result.warnings.push('REFERENCE_ALREADY_DECLARED');
      }
    }

    await prisma.rentalPaymentProofRead.updateMany({
      where: { id: readId, tenant_id: tenantId },
      data: {
        outcome: rowOutcome,
        latency_ms: latencyMs,
        result: {
          quality: result.quality,
          operator: result.operator,
          amount: result.amount,
          reference: result.reference,
          paidAt: result.paidAt,
          payerPhone: result.payerPhone,
          recipientPhone: result.recipientPhone,
          confidence: result.confidence
        } as Prisma.InputJsonValue
      }
    });
  } catch (error) {
    // Aucune réponse ne sera rendue : la capture n'a plus d'usage.
    if (await discardTempProof(tenantId, tempFileUrl)) {
      await prisma.rentalPaymentProofRead
        .updateMany({ where: { id: readId, tenant_id: tenantId }, data: { temp_file_url: null } })
        .catch(() => undefined);
    }
    throw error;
  }

  logger.info('[rental-declared] lecture de capture', {
    readId,
    provider: provider.id,
    outcome: rowOutcome,
    latencyMs,
    warnings: result.warnings
  });
  return result;
}
