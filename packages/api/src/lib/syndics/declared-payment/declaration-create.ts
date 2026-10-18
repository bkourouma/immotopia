import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { Prisma } from '@prisma/client';
import { prisma, type PrismaTransactionClient } from '../../../utils/database';
import { AppError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { logger } from '../../../utils/logger';
import { t } from '../../../i18n';
import { privateUploadPath, privateUploadReadRoots } from '../../files/private-files';
import { PENDING_REUSE_WINDOW_MS } from '../online-payment/checkout-start';
import { assertLotOfSyndicate, assertSyndicateOfTenant, listOpenCallsForLot } from '../charge-allocation';
import { ownedChargeCallsWhere, type CoOwnerPortalScope } from '../coowner-portal';
import { normalizeIvorianMsisdn } from './phone';
import {
  discardTempProof,
  promoteTempProofToDeclaration,
  saveDeclarationProof,
  type ProofFileInput,
  type StoredProofFile
} from './proof-files';
import {
  buildAiPrefill,
  computeEditedFields,
  loadProofReadForDeclaration,
  proofReadInvalid,
  type LoadedProofRead
} from './proof-read-link';
import { getActiveReceivingNumber } from './receiving-numbers';
import { normalizeTransactionReference } from './reference';
import { assertSyndicFeatureForDeclared, getDeclaredPaymentRules } from './settings';
import {
  MAX_CHARGE_CALLS_PER_LINE,
  MAX_DECLARATION_AMOUNT,
  MAX_DECLARATION_LINES,
  MAX_PENDING_PER_LOT,
  PAID_AT_FUTURE_TOLERANCE_MINUTES,
  PAID_AT_MAX_AGE_DAYS,
  type DeclarationInput
} from './types';

/**
 * Création d'une déclaration de paiement mobile money (spec 047, contrats
 * §1.11 et §2.4, règles R6 à R11).
 *
 * Le corps est supposé déjà validé en FORME (Zod strict) par le contrôleur ;
 * ce module applique toutes les règles MÉTIER, dans l'ordre du contrat, et lève
 * des `AppError` typées (jamais de statut deviné d'après un message).
 *
 * RIEN n'est crédité ici (R14) : ni encaissement, ni reste dû, ni écriture
 * comptable. La déclaration naît `PENDING`, le gestionnaire la valide ensuite.
 * Aucune notification n'est envoyée : le contrôleur appelle
 * `notifyDeclarationReceived` après le retour.
 */

type Client = PrismaTransactionClient | typeof prisma;

export type DeclarationActor =
  | { type: 'COOWNER'; scope: CoOwnerPortalScope; contactId: string } // portail : contactId = déclarant de la session
  | { type: 'MANAGER'; userId: string; declaredForContactId?: string | null }; // P4

export type CreateDeclarationInput = Omit<DeclarationInput, 'syndicId'>;

const INDEX_NAME = 'syndic_payment_declarations_ref_active_uq';

function badRequest(message: string, code: string): AppError {
  return new AppError(message, 400, code);
}

/** Corps incohérent que la validation de forme aurait dû refuser : 400 `VALIDATION_ERROR`. */
function invalidBody(message: string): AppError {
  return badRequest(message, ErrorCode.VALIDATION_ERROR);
}

function lotNotFound(): NotFoundError {
  return new NotFoundError(t('Lot introuvable ou inaccessible pour cette copropriété.'));
}

function callNotFound(): NotFoundError {
  return new NotFoundError(t('Appel de charges introuvable.'));
}

function referenceUsedError(): AppError {
  return new AppError(
    t('Cette référence de transaction a déjà été déclarée.'),
    409,
    ErrorCode.DECLARATION_REFERENCE_USED
  );
}

// ---------------------------------------------------------------------------
// Étape 3 : contrôles de forme métier (sans base)
// ---------------------------------------------------------------------------

interface CheckedBody {
  payerPhone: string;
  transactionReference: string;
  amount: number;
  paidAt: Date;
  comment: string | null;
  lines: Array<{ lotId: string; amount: number; chargeCallIds: string[] }>;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function checkBody(input: CreateDeclarationInput, now: Date): CheckedBody {
  const payerPhone = normalizeIvorianMsisdn(input.payerPhone);
  if (!payerPhone) {
    throw badRequest(
      t("Le numéro de téléphone du payeur n'est pas un numéro mobile ivoirien valide."),
      ErrorCode.INVALID_PHONE
    );
  }
  const transactionReference = normalizeTransactionReference(input.transactionReference);
  if (!transactionReference) {
    throw badRequest(
      t('La référence de transaction doit comporter de 4 à 40 caractères (lettres, chiffres, tirets, points).'),
      ErrorCode.INVALID_TRANSACTION_REFERENCE
    );
  }

  if (!isPositiveInteger(input.amount)) {
    throw invalidBody(t('Le montant doit être un nombre entier de FCFA supérieur à zéro.'));
  }
  if (input.amount > MAX_DECLARATION_AMOUNT) {
    throw badRequest(
      t('Le montant dépasse le plafond de {max} FCFA par déclaration.', { max: MAX_DECLARATION_AMOUNT }),
      ErrorCode.DECLARATION_AMOUNT_TOO_HIGH
    );
  }

  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > MAX_DECLARATION_LINES) {
    throw invalidBody(t('Une déclaration porte sur 1 à {max} lots.', { max: MAX_DECLARATION_LINES }));
  }
  const seenLots = new Set<string>();
  const lines: CheckedBody['lines'] = [];
  let sum = 0;
  for (const line of input.lines) {
    if (typeof line?.lotId !== 'string' || !line.lotId) throw invalidBody(t('Lot invalide.'));
    if (seenLots.has(line.lotId)) throw invalidBody(t('Un lot ne peut figurer qu’une seule fois dans la déclaration.'));
    seenLots.add(line.lotId);
    if (!isPositiveInteger(line.amount)) {
      throw invalidBody(t('La part de chaque lot doit être un nombre entier de FCFA supérieur à zéro.'));
    }
    const callIds = Array.isArray(line.chargeCallIds) ? Array.from(new Set(line.chargeCallIds)) : [];
    if (callIds.length > MAX_CHARGE_CALLS_PER_LINE) {
      throw invalidBody(t('Une ligne vise {max} appels de charges au plus.', { max: MAX_CHARGE_CALLS_PER_LINE }));
    }
    sum += line.amount;
    lines.push({ lotId: line.lotId, amount: line.amount, chargeCallIds: callIds });
  }
  if (sum !== input.amount) {
    throw badRequest(
      t('La somme des parts par lot doit être égale au montant déclaré.'),
      ErrorCode.DECLARATION_AMOUNT_MISMATCH
    );
  }

  const paidAt = new Date(input.paidAt);
  if (Number.isNaN(paidAt.getTime())) throw invalidBody(t('Date de paiement invalide.'));
  const latest = now.getTime() + PAID_AT_FUTURE_TOLERANCE_MINUTES * 60_000;
  const earliest = now.getTime() - PAID_AT_MAX_AGE_DAYS * 86_400_000;
  if (paidAt.getTime() > latest || paidAt.getTime() < earliest) {
    throw badRequest(
      t('La date du paiement ne peut pas être dans le futur ni remonter à plus de {days} jours.', {
        days: PAID_AT_MAX_AGE_DAYS
      }),
      ErrorCode.DECLARATION_DATE_OUT_OF_RANGE
    );
  }

  const comment = typeof input.comment === 'string' ? input.comment.trim() : '';
  if (comment.length > 500) throw invalidBody(t('Le commentaire ne peut pas dépasser 500 caractères.'));

  return { payerPhone, transactionReference, amount: input.amount, paidAt, comment: comment || null, lines };
}

// ---------------------------------------------------------------------------
// Étape 4 : périmètre
// ---------------------------------------------------------------------------

/** Lots (et déclarant) dans le périmètre de l'acteur ; 404 uniforme sinon. */
async function assertLotScope(
  tenantId: string,
  syndicateId: string,
  actor: DeclarationActor,
  lotIds: string[],
  now: Date
): Promise<void> {
  if (actor.type === 'COOWNER') {
    const { scope } = actor;
    // Le périmètre doit être celui de CETTE agence et le déclarant l'un de ses contacts.
    if (scope.tenantId !== tenantId || !scope.contactIds.includes(actor.contactId)) throw lotNotFound();
    for (const lotId of lotIds) {
      const inScope = scope.lots.some(lot => lot.lotId === lotId && lot.syndicateId === syndicateId);
      if (!inScope) throw lotNotFound();
    }
    return;
  }

  // Gestionnaire : SyndicateLot n'a pas de tenantId, on passe par la copropriété de l'agence.
  for (const lotId of lotIds) await assertLotOfSyndicate(prisma, tenantId, syndicateId, lotId);

  const contactId = actor.declaredForContactId;
  if (!contactId) return;
  const contact = await prisma.crmContact.findFirst({ where: { id: contactId, tenantId }, select: { id: true } });
  if (!contact) throw lotNotFound();
  const profiles = await prisma.lotOwnerProfile.findMany({
    where: { contactId, lotId: { in: lotIds }, isActive: true },
    select: { lotId: true, ownedSince: true, ownedUntil: true }
  });
  const owned = new Set(
    profiles
      .filter(
        profile =>
          profile.ownedSince.getTime() <= now.getTime() &&
          (!profile.ownedUntil || profile.ownedUntil.getTime() >= now.getTime())
      )
      .map(profile => profile.lotId)
  );
  if (lotIds.some(lotId => !owned.has(lotId))) throw lotNotFound();
}

/** Appels visés : du lot de LEUR ligne, ouverts, et (portail) visibles du copropriétaire ; 404 sinon. */
async function assertCallsOfLines(
  tenantId: string,
  syndicateId: string,
  actor: DeclarationActor,
  lines: CheckedBody['lines']
): Promise<void> {
  for (const line of lines) {
    if (line.chargeCallIds.length === 0) continue;

    if (actor.type === 'COOWNER') {
      const visible = await prisma.chargeCall.findMany({
        where: {
          AND: [
            { id: { in: line.chargeCallIds }, syndicateId, lotId: line.lotId },
            ownedChargeCallsWhere(actor.scope, [line.lotId])
          ]
        },
        select: { id: true }
      });
      const visibleIds = new Set(visible.map(call => call.id));
      if (line.chargeCallIds.some(id => !visibleIds.has(id))) throw callNotFound();
    }

    // Appels du lot (de cette copropriété) dont le reste dû est > 0.
    const open = await listOpenCallsForLot(tenantId, syndicateId, line.lotId);
    const openIds = new Set(open.map(call => call.id));
    if (line.chargeCallIds.some(id => !openIds.has(id))) throw callNotFound();

    // Cas limite 9 (bloqué dans les deux sens) : un appel qui a un paiement en ligne en cours
    // (PENDING dans la fenêtre de reprise) ou à vérifier (REVIEW) ne se déclare pas en même temps.
    const checkouts = await prisma.syndicOnlineCheckout.findMany({
      where: {
        tenantId,
        lotId: line.lotId,
        chargeCallIds: { hasSome: line.chargeCallIds },
        OR: [
          { status: 'PENDING', createdAt: { gte: new Date(Date.now() - PENDING_REUSE_WINDOW_MS) } },
          { status: 'REVIEW' }
        ]
      },
      select: { chargeCallIds: true }
    });
    if (checkouts.length > 0) {
      const covered = new Set(checkouts.flatMap(checkout => checkout.chargeCallIds));
      throw new AppError(
        t(
          'Un paiement en ligne est en cours ou à vérifier pour cet appel : il ne peut pas être déclaré en même temps.'
        ),
        409,
        ErrorCode.CHARGE_CALL_ONLINE_PAYMENT_PENDING,
        undefined,
        { chargeCallIds: line.chargeCallIds.filter(id => covered.has(id)) }
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Étapes 5 et 7 : limites et doublon de référence
// ---------------------------------------------------------------------------

async function assertPendingLimit(client: Client, tenantId: string, lotIds: string[]): Promise<void> {
  for (const lotId of lotIds) {
    const pending = await client.syndicPaymentDeclarationLine.count({
      where: { tenantId, lotId, declaration: { status: 'PENDING' } }
    });
    if (pending >= MAX_PENDING_PER_LOT) {
      throw new AppError(
        t('Ce lot a déjà {max} déclarations en attente de validation.', { max: MAX_PENDING_PER_LOT }),
        409,
        ErrorCode.DECLARATION_PENDING_LIMIT
      );
    }
  }
}

/**
 * Violation d'unicité portant sur la référence. La cible est lue dans `meta`
 * (nom de l'index ou colonnes), jamais dans le message. Une cible absente est
 * traitée comme la référence : aucune autre unicité n'est alimentée ici.
 */
function isReferenceUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || (error as { code?: unknown }).code !== 'P2002') return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  const names = (Array.isArray(target) ? target : [target]).filter((n): n is string => typeof n === 'string');
  if (names.length === 0) return true;
  return names.some(name => name === INDEX_NAME || /transaction_?reference/i.test(name));
}

// ---------------------------------------------------------------------------
// Fichier
// ---------------------------------------------------------------------------

/**
 * Supprime la capture déjà écrite quand la création échoue. Un fichier absent
 * ou un échec de suppression ne masque jamais l'erreur d'origine.
 *
 * `proof-files.ts` n'exporte pas de suppression de capture définitive : même
 * geste que son `removeUpload` privé, restreint au dossier de la copropriété.
 */
async function removeStoredProof(tenantId: string, syndicateId: string, stored: StoredProofFile): Promise<void> {
  try {
    const relative = privateUploadPath(stored.fileUrl, ['syndics', 'payment-proofs', tenantId, syndicateId]);
    if (!relative) return;
    for (const root of privateUploadReadRoots()) {
      const absolute = path.resolve(root, relative);
      if (!absolute.startsWith(path.resolve(root) + path.sep)) continue;
      await fs.unlink(absolute).catch(() => undefined);
    }
  } catch (error) {
    logger.warn('[declared-payment] nettoyage de capture en échec', {
      code: (error as NodeJS.ErrnoException)?.code
    });
  }
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

export async function createDeclaration(params: {
  tenantId: string;
  syndicateId: string;
  actor: DeclarationActor;
  input: CreateDeclarationInput;
  proof?: ProofFileInput | null;
  now?: Date;
}): Promise<{ declarationId: string }> {
  const { tenantId, syndicateId, actor, input } = params;
  const now = params.now ?? new Date();
  const proof = params.proof ?? null;

  // 1. Copropriété de l'agence, droit SYNDIC (portail), réglages et numéros actifs.
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  if (actor.type === 'COOWNER') await assertSyndicFeatureForDeclared(tenantId, now);
  const rules = await getDeclaredPaymentRules(prisma, tenantId, syndicateId);
  const activeNumbers = rules.enabled
    ? await prisma.syndicReceivingNumber.count({ where: { tenantId, syndicateId, isActive: true } })
    : 0;
  if (!rules.enabled || activeNumbers === 0) {
    throw badRequest(
      t("Cette copropriété n'accepte pas les déclarations de paiement mobile money."),
      ErrorCode.DECLARED_PAYMENT_UNAVAILABLE
    );
  }

  // 2. Numéro de réception actif de CETTE copropriété ; instantané copié (S10).
  const receivingNumber = await getActiveReceivingNumber(prisma, tenantId, syndicateId, input.receivingNumberId);

  // 3. Téléphone, référence, montant, lignes, date.
  const body = checkBody(input, now);

  // 4. Périmètre : lots, déclarant, appels visés.
  const lotIds = body.lines.map(line => line.lotId);
  await assertLotScope(tenantId, syndicateId, actor, lotIds, now);
  await assertCallsOfLines(tenantId, syndicateId, actor, body.lines);

  // 5. Limite de déclarations en attente par lot (relue sous verrou à l'écriture).
  await assertPendingLimit(prisma, tenantId, lotIds);

  // 6. Capture : fichier envoyé, ou capture d'une lecture IA déjà faite (portail seulement).
  if (proof && input.proofReadId) {
    throw invalidBody(t('Envoyez une capture ou une lecture déjà faite, pas les deux.'));
  }
  let proofRead: LoadedProofRead | null = null;
  if (input.proofReadId) {
    if (actor.type !== 'COOWNER') {
      throw invalidBody(t('La lecture automatique des captures est réservée au portail.'));
    }
    proofRead = await loadProofReadForDeclaration(prisma, {
      tenantId,
      syndicateId,
      readId: input.proofReadId,
      contactIds: actor.scope.contactIds,
      now
    });
  }
  if (!proof && !proofRead && rules.proofRequired) {
    throw badRequest(
      t('Cette copropriété exige une capture de la preuve de paiement.'),
      ErrorCode.DECLARATION_PROOF_REQUIRED
    );
  }

  // Doublon de référence par lecture (réponse rapide) : même agence et même téléphone de
  // réception, y compris une autre copropriété (numéro partagé, D10). L'index partiel arbitre.
  const sameReference = await prisma.syndicPaymentDeclaration.findFirst({
    where: {
      tenantId,
      receivingPhone: receivingNumber.phoneNumber,
      transactionReference: body.transactionReference,
      status: { in: ['PENDING', 'APPROVED'] }
    },
    select: { id: true }
  });
  if (sameReference) throw referenceUsedError();

  // 7. Écriture : identifiant d'abord (il nomme le fichier), capture, puis une transaction.
  const declarationId = randomUUID();
  let stored: StoredProofFile | null = null;
  if (proof) {
    stored = await saveDeclarationProof({ tenantId, syndicateId, declarationId, file: proof });
  } else if (proofRead) {
    try {
      // Le temporaire est gardé jusqu'à la fin de la création : un échec laisse la lecture réutilisable.
      stored = await promoteTempProofToDeclaration({
        tenantId,
        syndicateId,
        declarationId,
        tempFileUrl: proofRead.tempFileUrl,
        keepSource: true
      });
    } catch (error) {
      if (error instanceof NotFoundError) throw proofReadInvalid();
      throw error;
    }
  }
  const aiPrefill = proofRead ? (buildAiPrefill(proofRead.id, proofRead.raw) as Prisma.InputJsonObject) : null;
  const aiEditedFields = proofRead
    ? computeEditedFields(proofRead.values, {
        amount: body.amount,
        paidAt: body.paidAt,
        transactionReference: body.transactionReference,
        payerPhone: body.payerPhone
      })
    : [];

  const declaredByContactId = actor.type === 'COOWNER' ? actor.contactId : (actor.declaredForContactId ?? null);
  const declaredByUserId = actor.type === 'MANAGER' ? actor.userId : null;

  try {
    await prisma.$transaction(async tx => {
      // Verrou par lot (ordre trié : pas d'interblocage) pour que deux déclarations
      // simultanées ne dépassent pas la limite de déclarations en attente.
      for (const lotId of [...lotIds].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`syndic-declaration-pending:${lotId}`}))`;
      }
      await assertPendingLimit(tx, tenantId, lotIds);

      if (proofRead) {
        // Une lecture ne sert qu'une fois : la consommation est atomique avec la création.
        const consumed = await tx.syndicPaymentProofRead.updateMany({
          where: { id: proofRead.id, tenantId, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now, tempFileUrl: null }
        });
        if (consumed.count !== 1) throw proofReadInvalid();
      }

      await tx.syndicPaymentDeclaration.create({
        data: {
          id: declarationId,
          tenantId,
          syndicateId,
          receivingNumberId: receivingNumber.id,
          receivingOperator: receivingNumber.operator,
          receivingPhone: receivingNumber.phoneNumber,
          receivingHolderName: receivingNumber.holderName,
          declaredByContactId,
          declaredByUserId,
          payerPhone: body.payerPhone,
          amount: body.amount,
          paidAt: body.paidAt,
          transactionReference: body.transactionReference,
          comment: body.comment,
          proofFileUrl: stored?.fileUrl ?? null,
          proofSha256: stored?.sha256 ?? null,
          status: 'PENDING',
          proofReadId: proofRead?.id ?? null,
          ...(aiPrefill ? { aiPrefill } : {}),
          aiEditedFields,
          lines: {
            // [] est conservé tel quel : « plus anciens d'abord » se résout à la validation.
            create: body.lines.map(line => ({
              tenantId,
              lotId: line.lotId,
              amount: line.amount,
              chargeCallIds: line.chargeCallIds
            }))
          }
        },
        select: { id: true }
      });
    });
  } catch (error) {
    if (stored) await removeStoredProof(tenantId, syndicateId, stored);
    if (isReferenceUniqueViolation(error)) throw referenceUsedError();
    throw error;
  }
  if (proofRead) await discardTempProof(tenantId, proofRead.tempFileUrl);

  // 8. Audit : identifiants, statut, montant, nombre de lignes. Ni capture, ni téléphone.
  logAuditEvent({
    actorUserId: declaredByUserId,
    ...(actor.type === 'COOWNER' ? { actorType: 'PORTAL' as const } : {}),
    tenantId,
    actionKey: AuditActionKey.SYNDIC_PAYMENT_DECLARATION_CREATED,
    entityType: 'SYNDIC_PAYMENT_DECLARATION',
    entityId: declarationId,
    payload: {
      syndicateId,
      status: 'PENDING',
      amount: body.amount,
      lineCount: body.lines.length,
      lines: body.lines.map(line => ({ lotId: line.lotId, amount: line.amount })),
      receivingNumberId: receivingNumber.id,
      contactId: declaredByContactId,
      hasProof: stored !== null,
      aiPrefilled: proofRead !== null,
      aiEditedFields
    }
  });

  return { declarationId };
}
