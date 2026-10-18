import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { t } from '../../../i18n';
import { AppError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import type { CoOwnerPortalScope } from '../coowner-portal';
import { normalizeIvorianMsisdn } from './phone';
import { discardTempProof, prepareProofFile, saveTempProofRead, type ProofFileInput } from './proof-files';
import { normalizeTransactionReference } from './reference';
import { AI_READS_MONTHLY_QUOTA, assertSyndicFeatureForDeclared, getDeclaredPaymentRules } from './settings';
import {
  MAX_DECLARATION_AMOUNT,
  PAID_AT_FUTURE_TOLERANCE_MINUTES,
  PAID_AT_MAX_AGE_DAYS,
  type DeclaredPaymentSettings,
  type PaymentProofReading,
  type PrefillField
} from './types';
import { getPaymentProofVisionProvider, isPaymentProofVisionConfigured, type ProofModelRead } from './vision';

/**
 * Lecture IA d'une capture de preuve (spec 047, D9, R27, R28, R30, contrats §2.3).
 *
 * La capture est un fichier PRIVÉ : conservée 24 h sous le dossier temporaire de
 * l'agence, liée par `readId`, promue en preuve définitive si la déclaration est
 * créée avec ce `readId`, sinon purgée (`purgeExpiredProofReads`). Le modèle ne
 * décide de rien : sa sortie est validée par un schéma strict, normalisée ici,
 * et ne remplit que des PROPOSITIONS que la personne relit et que le gestionnaire
 * vérifie. Une panne du fournisseur n'est jamais une erreur : elle répond
 * `UNREADABLE` (R30). Seuls l'indisponibilité et le quota sont des erreurs.
 *
 * Journal et audit : identifiants, résultat, durée, noms des champs lus, jamais
 * une valeur lue ni la capture.
 */

export const PROOF_READ_RETENTION_HOURS = 24;

/**
 * Plafond mensuel de lectures par contact (en plus du quota de l'agence, 300) : un seul compte ne peut
 * pas consommer le quota de toute l'agence, ni faire facturer des lectures en boucle.
 */
export const AI_READS_MONTHLY_PER_CONTACT = 30;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

type ProofReadOutcome = 'OK' | 'UNREADABLE' | 'NOT_A_PAYMENT' | 'FAILED' | 'DISABLED';

/** Début du mois courant, en UTC (même découpage que `settings.ts`). */
function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// ---------------------------------------------------------------------------
// Disponibilité
// ---------------------------------------------------------------------------

/**
 * Le pré-remplissage est-il proposé au copropriétaire ? Fournisseur configuré
 * sur le serveur, interrupteur de la copropriété activé, quota mensuel de
 * l'agence non atteint (contrats §2.1).
 */
export function isAiPrefillOfferedToCoOwner(
  settings: Pick<
    DeclaredPaymentSettings,
    'aiPrefillAvailable' | 'aiPrefillEnabled' | 'aiReadsThisMonth' | 'aiReadsMonthlyQuota'
  >
): boolean {
  return Boolean(
    settings.aiPrefillAvailable && settings.aiPrefillEnabled && settings.aiReadsThisMonth < settings.aiReadsMonthlyQuota
  );
}

// ---------------------------------------------------------------------------
// Normalisation de la sortie du modèle
// ---------------------------------------------------------------------------

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Date lue → ISO 8601 UTC, ou `null` si elle est hors de la fenêtre admise pour
 * une déclaration (90 jours en arrière, 10 minutes en avant). Sans fuseau, la
 * date est lue en heure d'Abidjan (UTC+0). Une date seule vaut minuit.
 */
export function normalizePaidAt(raw: string | null, now: Date): string | null {
  if (!raw) return null;
  const text = raw.trim();
  let candidate = text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) candidate = `${text}T00:00:00Z`;
  else if (!HAS_OFFSET.test(text)) candidate = `${text.replace(' ', 'T')}Z`;
  const time = Date.parse(candidate);
  if (Number.isNaN(time)) return null;
  if (time > now.getTime() + PAID_AT_FUTURE_TOLERANCE_MINUTES * MS_PER_MINUTE) return null;
  if (time < now.getTime() - PAID_AT_MAX_AGE_DAYS * MS_PER_DAY) return null;
  return new Date(time).toISOString();
}

/** Valeurs proposées, normalisées comme le serveur les attend à la déclaration. */
export interface NormalizedReading {
  quality: ProofModelRead['quality'];
  operator: ProofModelRead['operator'];
  amount: number | null;
  paidAt: string | null;
  transactionReference: string | null;
  payerPhone: string | null;
  recipientPhone: string | null;
  recipientName: string | null;
  confidence: Partial<Record<PrefillField, number>>;
}

export function normalizeModelRead(read: ProofModelRead, now: Date): NormalizedReading {
  // Une capture illisible ou étrangère ne propose rien, quoi que le modèle ait rendu.
  if (read.quality !== 'OK') return emptyReading(read.quality);
  const amount = read.amount !== null && read.amount >= 1 && read.amount <= MAX_DECLARATION_AMOUNT ? read.amount : null;
  const normalized: NormalizedReading = {
    quality: read.quality,
    operator: read.operator,
    amount,
    paidAt: normalizePaidAt(read.paidAt, now),
    transactionReference: read.transactionReference ? normalizeTransactionReference(read.transactionReference) : null,
    payerPhone: read.payerPhone ? normalizeIvorianMsisdn(read.payerPhone) : null,
    recipientPhone: read.recipientPhone ? (normalizeIvorianMsisdn(read.recipientPhone) ?? null) : null,
    recipientName: read.recipientName,
    confidence: {}
  };
  // Une certitude n'est gardée que pour une valeur finalement retenue.
  for (const field of ['operator', 'amount', 'paidAt', 'transactionReference', 'payerPhone'] as const) {
    const value = read.confidence[field];
    if (value !== undefined && normalized[field] !== null) normalized.confidence[field] = value;
  }
  return normalized;
}

function emptyReading(quality: NormalizedReading['quality']): NormalizedReading {
  return {
    quality,
    operator: null,
    amount: null,
    paidAt: null,
    transactionReference: null,
    payerPhone: null,
    recipientPhone: null,
    recipientName: null,
    confidence: {}
  };
}

/** Noms des champs proposés (pour le journal et l'audit : jamais les valeurs). */
function readFieldNames(reading: NormalizedReading): string[] {
  return (['operator', 'amount', 'paidAt', 'transactionReference', 'payerPhone', 'recipientPhone'] as const).filter(
    field => reading[field] !== null
  );
}

// ---------------------------------------------------------------------------
// Contrôles croisés (R28)
// ---------------------------------------------------------------------------

async function crossChecks(params: {
  tenantId: string;
  syndicateId: string;
  reading: NormalizedReading;
}): Promise<{ warnings: PaymentProofReading['warnings']; matchedReceivingNumberId: string | null }> {
  const { tenantId, syndicateId, reading } = params;
  const warnings: PaymentProofReading['warnings'] = [];
  let matchedReceivingNumberId: string | null = null;

  if (reading.recipientPhone) {
    const numbers = await prisma.syndicReceivingNumber.findMany({
      where: { tenantId, syndicateId, isActive: true },
      select: { id: true, phoneNumber: true }
    });
    matchedReceivingNumberId = numbers.find(n => n.phoneNumber === reading.recipientPhone)?.id ?? null;
    if (!matchedReceivingNumberId) warnings.push('RECIPIENT_NOT_A_RECEIVING_NUMBER');
  }
  if (reading.transactionReference) {
    const used = await prisma.syndicPaymentDeclaration.findFirst({
      // Limité à CETTE copropriété : ne révèle rien des déclarations des autres copropriétés de l'agence.
      where: {
        tenantId,
        syndicateId,
        transactionReference: reading.transactionReference,
        status: { in: ['PENDING', 'APPROVED'] }
      },
      select: { id: true }
    });
    if (used) warnings.push('REFERENCE_ALREADY_DECLARED');
  }
  return { warnings, matchedReceivingNumberId };
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

function unavailable(): AppError {
  return new AppError(
    t("La lecture automatique des captures n'est pas disponible."),
    409,
    ErrorCode.PROOF_READ_UNAVAILABLE
  );
}

function quotaExceeded(): AppError {
  return new AppError(
    t("Le nombre de lectures automatiques de ce mois est atteint pour l'agence. Saisissez les champs à la main."),
    429,
    ErrorCode.PROOF_READ_QUOTA_EXCEEDED
  );
}

/**
 * Réserve une lecture : sous verrou par agence, vérifie le quota mensuel puis
 * insère la ligne (issue provisoire `FAILED`), pour que deux lectures
 * simultanées ne dépassent pas le quota.
 */
async function reserveRead(params: {
  readId: string;
  tenantId: string;
  syndicateId: string;
  contactId: string;
  sha256: string;
  provider: string;
  model: string;
  now: Date;
}): Promise<void> {
  const { readId, tenantId, now } = params;
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`syndic-proof-read:${tenantId}`}))`;
    // Seules les lectures qui ont réellement appelé le modèle comptent : une lecture refusée avant l'appel
    // (fournisseur coupé, capture non conservée) est retirée ou marquée DISABLED.
    const since = startOfMonthUtc(now);
    const used = await tx.syndicPaymentProofRead.count({
      where: { tenantId, createdAt: { gte: since }, outcome: { not: 'DISABLED' } }
    });
    if (used >= AI_READS_MONTHLY_QUOTA) throw quotaExceeded();
    const usedByContact = await tx.syndicPaymentProofRead.count({
      where: { tenantId, contactId: params.contactId, createdAt: { gte: since }, outcome: { not: 'DISABLED' } }
    });
    if (usedByContact >= AI_READS_MONTHLY_PER_CONTACT) throw quotaExceeded();
    await tx.syndicPaymentProofRead.create({
      data: {
        id: readId,
        tenantId,
        syndicateId: params.syndicateId,
        contactId: params.contactId,
        sha256: params.sha256,
        provider: params.provider,
        model: params.model,
        outcome: 'FAILED',
        latencyMs: 0,
        expiresAt: new Date(now.getTime() + PROOF_READ_RETENTION_HOURS * 60 * MS_PER_MINUTE)
      }
    });
  });
}

/**
 * `POST /paiements-declares/lecture` (§2.3). Le périmètre (agence, copropriété,
 * contact) vient de la garde du portail ; le corps ne porte aucun identifiant
 * d'agence. Une copropriété hors périmètre répond comme une copropriété inconnue.
 */
export async function readPaymentProof(params: {
  scope: CoOwnerPortalScope;
  syndicateId: string;
  file: ProofFileInput | null;
  now?: Date;
}): Promise<PaymentProofReading> {
  const { scope, syndicateId } = params;
  const now = params.now ?? new Date();
  const tenantId = scope.tenantId;

  const lot = scope.lots.find(item => item.syndicateId === syndicateId);
  if (!scope.syndicateIds.includes(syndicateId) || !lot) {
    throw new NotFoundError(t('Copropriété introuvable ou inaccessible.'));
  }
  await assertSyndicFeatureForDeclared(tenantId, now);

  const rules = await getDeclaredPaymentRules(prisma, tenantId, syndicateId);
  const provider = getPaymentProofVisionProvider();
  if (!rules.enabled || !rules.aiPrefillEnabled || !isPaymentProofVisionConfigured()) throw unavailable();

  if (!params.file) {
    throw new AppError(t('La capture est vide ou illisible.'), 400, ErrorCode.DECLARATION_PROOF_INVALID);
  }
  // Type réel, taille et métadonnées : mêmes règles que la capture d'une déclaration.
  const prepared = prepareProofFile(params.file);

  const readId = randomUUID();
  await reserveRead({
    readId,
    tenantId,
    syndicateId,
    contactId: lot.contactId,
    sha256: prepared.sha256,
    provider: provider.id,
    model: provider.model,
    now
  });

  let tempFileUrl: string | null = null;
  try {
    tempFileUrl = (await saveTempProofRead({ tenantId, readId, file: { buffer: prepared.buffer } })).fileUrl;
    // Le chemin est posé en base AVANT l'appel au modèle : un arrêt du processus ou une erreur
    // plus loin laisse une ligne que la purge sait retrouver, jamais un fichier sans trace.
    await prisma.syndicPaymentProofRead.updateMany({ where: { id: readId, tenantId }, data: { tempFileUrl } });
  } catch (error) {
    // Sans capture conservée, la lecture n'a pas de suite possible : on retire fichier et ligne.
    if (tempFileUrl) await discardTempProof(tenantId, tempFileUrl);
    await prisma.syndicPaymentProofRead.deleteMany({ where: { id: readId, tenantId } }).catch(() => undefined);
    throw error;
  }

  let outcome: Awaited<ReturnType<typeof provider.analyze>>;
  let reading = emptyReading('UNREADABLE');
  let rowOutcome: ProofReadOutcome = 'FAILED';
  let checks: Awaited<ReturnType<typeof crossChecks>> | null = null;
  try {
    // Appel au modèle : ne lève jamais ; une panne devient « illisible ».
    outcome = await provider.analyze(
      { image: prepared.buffer, mimeType: prepared.mimeType },
      new AbortController().signal
    );
    if (outcome.ok) {
      reading = normalizeModelRead(outcome.result, now);
      rowOutcome = reading.quality;
    } else if (outcome.reason === 'DISABLED') {
      rowOutcome = 'DISABLED';
    }
    checks = reading.quality === 'OK' ? await crossChecks({ tenantId, syndicateId, reading }) : null;
    await prisma.syndicPaymentProofRead.updateMany({
      where: { id: readId, tenantId },
      data: {
        outcome: rowOutcome,
        latencyMs: outcome.latencyMs,
        result: reading as unknown as Prisma.InputJsonValue
      }
    });
  } catch (error) {
    // Aucune réponse ne sera rendue : la capture n'a plus d'usage, on la supprime.
    if (await discardTempProof(tenantId, tempFileUrl)) {
      await prisma.syndicPaymentProofRead
        .updateMany({ where: { id: readId, tenantId }, data: { tempFileUrl: null } })
        .catch(() => undefined);
    }
    throw error;
  }

  const fields = readFieldNames(reading);
  logger.info('[declared-payment] lecture de capture', {
    readId,
    provider: outcome.provider,
    outcome: rowOutcome,
    reason: outcome.ok ? undefined : outcome.reason,
    latencyMs: outcome.latencyMs,
    fieldCount: fields.length
  });
  logAuditEvent({
    actorUserId: null,
    actorType: 'PORTAL',
    tenantId,
    actionKey: AuditActionKey.SYNDIC_PAYMENT_PROOF_READ,
    entityType: 'SYNDIC_PAYMENT_PROOF_READ',
    entityId: readId,
    payload: {
      syndicateId,
      contactId: lot.contactId,
      provider: outcome.provider,
      model: outcome.model,
      outcome: rowOutcome,
      latencyMs: outcome.latencyMs,
      fields,
      warnings: checks?.warnings ?? []
    }
  });

  return {
    readId,
    quality: reading.quality,
    operator: reading.operator,
    amount: reading.amount,
    paidAt: reading.paidAt,
    transactionReference: reading.transactionReference,
    payerPhone: reading.payerPhone,
    recipientPhone: reading.recipientPhone,
    recipientName: reading.recipientName,
    confidence: reading.confidence,
    warnings: checks?.warnings ?? [],
    matchedReceivingNumberId: checks?.matchedReceivingNumberId ?? null
  };
}
