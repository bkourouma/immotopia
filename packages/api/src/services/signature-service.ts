import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { currentLanguage, t } from '../i18n';
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  QuotaExceededError
} from '../middleware/error-middleware';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { assertBelongsToTenant } from '../utils/tenant-ownership';
import { runWithTenantContext } from '../utils/tenant-context';
import { logAuditEvent, recordAuditEvent, AuditActionKey } from './audit-service';
import { getDocumentFile } from './document-generation-service';
import { countSignaturesThisMonth } from './subscription-v2-service';
import { convertDocxToPdf } from '../lib/pdf-convert';
import { cancelOpenRequestsForTarget, cancelRequestInternal } from '../lib/signature/cancel';
import type { CreateSignatureInput, ListSignaturesFilters } from '../lib/signature/schemas';
import { toRequestDto } from '../lib/signature/dto';
import {
  appendSignatureEvent,
  appendSignatureEventStandalone,
  listChainedEvents,
  verifyEventChain
} from '../lib/signature/events';
import { sha256Hex } from '../lib/signature/evidence';
import { readSignatureFile, removeSignatureFolder, writeSignatureFile } from '../lib/signature/files';
import {
  agencyNameOf,
  commitSignerToken,
  inviteSigner,
  languageOf,
  notifyIssuer,
  prepareSignerToken
} from '../lib/signature/notify';
import { assertSignatureProviderEnabled } from '../lib/signature/provider';
import { releaseSignature, reserveSignature, resolveSignatureQuotaPolicy } from '../lib/signature/quota';
import { sealRequest } from '../lib/signature/sealing';
import { generateToken, hashToken } from '../lib/signature/token';
import { ACTIVE_REQUEST_STATUSES, OPEN_REQUEST_STATUSES } from '../lib/signature/types';
import { normalizePhoneE164 } from '../lib/phone/e164';
import { sendPrivateFile } from '../lib/files/private-files';
import type { Response } from 'express';

/**
 * Signature électronique, côté agence (spec 043, lot S1) : création d'une
 * demande pour un bail, liste, détail, annulation, relance, fichiers, jeton de
 * signature sur place, expiration. Tout est filtré par `tenantId` ; la cible
 * est vérifiée par `assertBelongsToTenant`.
 */

export const REMINDER_MIN_INTERVAL_MS = 10 * 60 * 1000;

/** Ré-exports : le module propriétaire du document annule sans importer ce service lourd. */
export { cancelOpenRequestsForTarget };

const requestSelect = {
  id: true,
  kind: true,
  targetType: true,
  targetId: true,
  title: true,
  language: true,
  status: true,
  sequential: true,
  expiresAt: true,
  createdAt: true,
  completedAt: true,
  sourceHash: true,
  signedHash: true,
  signedFileKey: true,
  signers: {
    select: {
      id: true,
      role: true,
      position: true,
      fullName: true,
      channel: true,
      contact: true,
      status: true,
      signedAt: true,
      inviteStatus: true,
      otpAttempts: true
    }
  }
} satisfies Prisma.SignatureRequestSelect;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type NormalizedSigner = {
  role: string;
  fullName: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'IN_PERSON';
  contact: string;
  contactId: string | null;
};

/**
 * Valide et normalise les signataires : contact conforme au canal. Deux
 * signataires peuvent partager un contact (couple, colocataires) : chacun a son
 * jeton et son code. WhatsApp exige un contact du CRM (consentement).
 */
export function normalizeSigners(signers: CreateSignatureInput['signers']): NormalizedSigner[] {
  return signers.map(signer => {
    let contact = signer.contact;
    if (signer.channel === 'EMAIL') {
      if (!EMAIL_PATTERN.test(contact)) {
        throw new BadRequestError(t('Adresse e-mail invalide pour {{name}}.', { name: signer.fullName }));
      }
      contact = contact.toLowerCase();
    } else if (signer.channel === 'WHATSAPP') {
      const phone = normalizePhoneE164(contact);
      if (!phone) throw new BadRequestError(t('Numéro WhatsApp invalide pour {{name}}.', { name: signer.fullName }));
      if (!signer.contactId) {
        throw new BadRequestError(
          t('Le canal WhatsApp exige un contact du CRM ayant consenti à WhatsApp ({{name}}).', {
            name: signer.fullName
          })
        );
      }
      contact = phone;
    } else {
      contact = '';
    }
    return {
      role: signer.role,
      fullName: signer.fullName,
      channel: signer.channel,
      contact,
      contactId: signer.channel === 'WHATSAPP' ? (signer.contactId ?? null) : null
    };
  });
}

/** Le contact CRM désigné appartient à l'agence ET a consenti à WhatsApp. */
async function assertWhatsappContact(tenantId: string, signer: NormalizedSigner): Promise<void> {
  if (!signer.contactId) return;
  await assertBelongsToTenant(prisma, 'crmContact', signer.contactId, tenantId);
  const contact = await prisma.crmContact.findFirst({
    where: { id: signer.contactId, tenantId },
    select: { consentWhatsapp: true }
  });
  if (!contact?.consentWhatsapp) {
    throw new BadRequestError(
      t("Ce contact n'a pas consenti à recevoir des messages WhatsApp ({{name}}).", { name: signer.fullName })
    );
  }
}

// ------------------------------------------------------------- document source

type LeaseSource = { documentId: string; documentHash: string | null; pdf: Buffer; title: string };

/**
 * Document source du bail : dernier contrat FINAL (`RentalDocument` de type
 * LEASE_CONTRACT), converti en PDF si c'est un DOCX. Refus clair sans contrat.
 */
async function loadLeaseSource(tenantId: string, lease: { id: string; lease_number: string }): Promise<LeaseSource> {
  const document = await prisma.rentalDocument.findFirst({
    where: { tenant_id: tenantId, lease_id: lease.id, type: 'LEASE_CONTRACT', status: 'FINAL' },
    orderBy: { created_at: 'desc' },
    select: { id: true, mime_type: true, file_hash: true }
  });
  if (!document) {
    throw new BadRequestError(
      t("Aucun contrat n'a été généré pour ce bail : générez le contrat avant de l'envoyer en signature.")
    );
  }
  const file = await getDocumentFile(tenantId, document.id);
  const pdf = document.mime_type === 'application/pdf' ? file : await convertDocxToPdf(file);
  if (pdf.subarray(0, 4).toString('latin1') !== '%PDF') {
    throw new AppError(t('La conversion du contrat en PDF a échoué.'), 502, 'SERVICE_UNAVAILABLE');
  }
  return {
    documentId: document.id,
    documentHash: document.file_hash ?? null,
    pdf,
    title: t('Contrat de bail {{number}}', { number: lease.lease_number })
  };
}

// ------------------------------------------------------------------- quota

async function reserveQuota(tenantId: string, actorUserId: string): Promise<string> {
  const policy = await resolveSignatureQuotaPolicy(tenantId);
  const refuse = async (limit: number): Promise<never> => {
    logAuditEvent({
      tenantId,
      actorUserId,
      actionKey: AuditActionKey.SIGNATURE_QUOTA_REFUSED,
      entityType: 'SignatureUsage',
      entityId: tenantId,
      payload: { limit }
    });
    const used = await countSignaturesThisMonth(prisma, tenantId);
    throw new QuotaExceededError(
      { capacityKey: 'SIGNATURES_MENSUELLES', limit, used, requested: 1, extensible: true },
      policy.ok
        ? t(
            'Le quota mensuel de signatures électroniques de votre agence est atteint : ajoutez l’extension « Signatures électroniques — bloc de 50 » depuis votre abonnement.'
          )
        : t("Votre abonnement n'inclut pas la signature électronique.")
    );
  };
  if (!policy.ok) return refuse(0);
  const reservation = await reserveSignature(tenantId, policy.limit);
  if (!reservation.ok) return refuse(policy.limit);
  return reservation.month;
}

// ---------------------------------------------------------------- création

type Ctx = { tenantId: string; userId: string };

async function persistRequest(args: {
  ctx: Ctx;
  requestId: string;
  input: CreateSignatureInput;
  signers: NormalizedSigner[];
  tokens: string[];
  source: LeaseSource;
  sourceFileKey: string;
  sourceHash: string;
  expiresAt: Date;
  providerId: string;
  providerRef?: string;
  now: Date;
}): Promise<void> {
  const { ctx, requestId } = args;
  try {
    await prisma.$transaction(async tx => {
      await tx.signatureRequest.create({
        data: {
          id: requestId,
          tenantId: ctx.tenantId,
          kind: args.input.kind,
          targetType: 'RentalLease',
          targetId: args.input.targetId,
          title: args.source.title,
          language: currentLanguage(),
          status: 'SENT',
          providerId: args.providerId,
          providerRef: args.providerRef ?? null,
          sourceDocumentId: args.source.documentId,
          sourceDocHash: args.source.documentHash,
          sourceFileKey: args.sourceFileKey,
          sourceHash: args.sourceHash,
          sequential: args.input.sequential ?? false,
          expiresAt: args.expiresAt,
          createdByUserId: ctx.userId
        }
      });
      await tx.signatureSigner.createMany({
        data: args.signers.map((signer, position) => ({
          tenantId: ctx.tenantId,
          requestId,
          role: signer.role,
          position,
          fullName: signer.fullName,
          channel: signer.channel,
          contact: signer.contact,
          contactId: signer.contactId,
          tokenHash: hashToken(args.tokens[position]),
          tokenExpiresAt:
            signer.channel === 'IN_PERSON'
              ? new Date(Math.min(args.expiresAt.getTime(), args.now.getTime() + 24 * 60 * 60 * 1000))
              : args.expiresAt,
          inviteStatus: signer.channel === 'IN_PERSON' ? 'NOT_APPLICABLE' : 'WAITING',
          inPersonIssuedBy: signer.channel === 'IN_PERSON' ? ctx.userId : null
        }))
      });
      await appendSignatureEvent(tx, {
        tenantId: ctx.tenantId,
        requestId,
        type: 'CREATED',
        payload: {
          kind: args.input.kind,
          signers: args.signers.length,
          sequential: args.input.sequential ?? false,
          sourceHash: args.sourceHash,
          byUserId: ctx.userId
        },
        now: args.now
      });
      await recordAuditEvent(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        actionKey: AuditActionKey.SIGNATURE_REQUEST_SENT,
        entityType: 'SignatureRequest',
        entityId: requestId,
        payload: {
          requestId,
          kind: args.input.kind,
          targetType: 'RentalLease',
          targetId: args.input.targetId,
          signerCount: args.signers.length,
          channels: args.signers.map(s => s.channel),
          sequential: args.input.sequential ?? false,
          sourceHash: args.sourceHash
        }
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(
        t('Une demande de signature est déjà en cours pour ce document : annulez-la avant d’en créer une autre.')
      );
    }
    throw error;
  }
}

/**
 * Crée la demande de signature d'un bail et envoie les liens. Étapes :
 * fournisseur actif, bail de l'agence, signataires, quota RÉSERVÉ (avant la
 * conversion LibreOffice, coûteuse), contrat source (PDF) figé par son SHA-256,
 * persistance, envois. Toute erreur après la réservation la restitue. Si AUCUN
 * lien n'a pu partir (et aucun signataire n'est sur place), la demande est
 * annulée et le quota rendu.
 */
export async function createSignatureRequest(ctx: Ctx, input: CreateSignatureInput) {
  const provider = assertSignatureProviderEnabled();

  await assertBelongsToTenant(prisma, 'rentalLease', input.targetId, ctx.tenantId, {
    tenantField: 'tenant_id',
    message: t('Bail introuvable.')
  });
  const lease = await prisma.rentalLease.findFirst({
    where: { id: input.targetId, tenant_id: ctx.tenantId },
    select: { id: true, lease_number: true, status: true }
  });
  if (!lease) throw new NotFoundError(t('Bail introuvable.'));
  if (lease.status === 'CANCELED' || lease.status === 'ENDED') {
    throw new BadRequestError(t('Ce bail est terminé ou annulé : il ne peut plus être envoyé en signature.'));
  }
  const signers = normalizeSigners(input.signers);
  for (const signer of signers) await assertWhatsappContact(ctx.tenantId, signer);
  const open = await prisma.signatureRequest.findFirst({
    where: {
      tenantId: ctx.tenantId,
      targetType: 'RentalLease',
      targetId: lease.id,
      kind: input.kind,
      status: { in: [...OPEN_REQUEST_STATUSES] }
    },
    select: { id: true }
  });
  if (open) {
    throw new ConflictError(
      t('Une demande de signature est déjà en cours pour ce document : annulez-la avant d’en créer une autre.')
    );
  }

  const month = await reserveQuota(ctx.tenantId, ctx.userId);
  const requestId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.expiresInDays ?? env.SIGNATURE_TOKEN_TTL_DAYS) * 86_400_000);
  const tokens = signers.map(() => generateToken());
  try {
    const source = await loadLeaseSource(ctx.tenantId, lease);
    const sourceHash = sha256Hex(source.pdf);
    const created = await provider.createRequest({
      tenantId: ctx.tenantId,
      requestId,
      kind: input.kind,
      signerCount: signers.length
    });
    const sourceFileKey = await writeSignatureFile(ctx.tenantId, requestId, 'source.pdf', source.pdf);
    await persistRequest({
      ctx,
      requestId,
      input,
      signers,
      tokens,
      source,
      sourceFileKey,
      sourceHash,
      expiresAt,
      providerId: provider.id,
      providerRef: created.providerRef,
      now
    });
  } catch (error) {
    await releaseSignature(ctx.tenantId, month);
    await removeSignatureFolder(ctx.tenantId, requestId);
    throw error;
  }

  return finalizeCreation({ ctx, requestId, signers, tokens, month });
}

async function finalizeCreation(args: {
  ctx: Ctx;
  requestId: string;
  signers: NormalizedSigner[];
  tokens: string[];
  month: string;
}) {
  const { ctx, requestId } = args;
  const rows = await prisma.signatureRequest.findFirst({
    where: { id: requestId, tenantId: ctx.tenantId },
    select: requestSelect
  });
  if (!rows) throw new NotFoundError(t('Demande de signature introuvable.'));
  const agencyName = await agencyNameOf(ctx.tenantId);
  const inPersonTokens = new Map<string, string>();
  const ordered = [...rows.signers].sort((a, b) => a.position - b.position);
  let delivered = 0;
  let inPerson = 0;
  for (const signer of ordered) {
    const token = args.tokens[signer.position];
    if (signer.channel === 'IN_PERSON') {
      inPersonTokens.set(signer.id, token);
      inPerson += 1;
      continue;
    }
    // Séquentiel : seul le premier signataire reçoit son lien maintenant.
    if (rows.sequential && signer.position > 0) continue;
    const planned = args.signers[signer.position];
    const status = await inviteSigner({
      request: {
        id: requestId,
        tenantId: ctx.tenantId,
        title: rows.title,
        language: rows.language,
        expiresAt: rows.expiresAt
      },
      signer: {
        id: signer.id,
        fullName: signer.fullName,
        channel: signer.channel,
        contact: signer.contact,
        contactId: planned.contactId
      },
      token,
      agencyName
    });
    if (status === 'SENT') delivered += 1;
  }
  if (delivered === 0 && inPerson === 0) {
    await cancelRequestInternal(ctx, requestId, 'SEND_FAILED', { refundMonth: args.month });
    throw new AppError(
      t("Aucun lien de signature n'a pu être envoyé : vérifiez les coordonnées et la configuration d'envoi."),
      503,
      'SERVICE_UNAVAILABLE'
    );
  }
  const fresh = await prisma.signatureRequest.findFirst({
    where: { id: requestId, tenantId: ctx.tenantId },
    select: requestSelect
  });
  if (!fresh) throw new NotFoundError(t('Demande de signature introuvable.'));
  return toRequestDto(fresh, { inPersonTokens });
}

// ------------------------------------------------------------ lecture

export async function listSignatureRequests(tenantId: string, filters: ListSignaturesFilters) {
  const rows = await prisma.signatureRequest.findMany({
    where: {
      tenantId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.targetType ? { targetType: filters.targetType } : {}),
      ...(filters.targetId ? { targetId: filters.targetId } : {})
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: requestSelect
  });
  return rows.map(row => toRequestDto(row));
}

async function findRequest(tenantId: string, id: string) {
  const row = await prisma.signatureRequest.findFirst({ where: { id, tenantId }, select: requestSelect });
  if (!row) throw new NotFoundError(t('Demande de signature introuvable.'));
  return row;
}

/** Détail avec historique ; `chainIntact` dit si la piste de preuve est intacte (SG-R8). */
export async function getSignatureRequest(tenantId: string, id: string) {
  const row = await findRequest(tenantId, id);
  const events = await listChainedEvents(tenantId, id);
  const dto = toRequestDto(row, { events });
  return { ...dto, chainIntact: verifyEventChain(events).ok };
}

// ------------------------------------------------------------ annulation

export async function cancelSignatureRequest(ctx: Ctx, id: string) {
  await findRequest(ctx.tenantId, id);
  const canceled = await cancelRequestInternal(ctx, id, 'USER');
  if (!canceled) throw new ConflictError(t('Cette demande de signature n’est plus en cours.'));
  return getSignatureRequest(ctx.tenantId, id);
}

// -------------------------------------------------------------- relance

/**
 * Relance les signataires qui n'ont encore RIEN ouvert (statut `PENDING`), hors
 * mode sur place. Chaque relance émet un nouveau jeton, posé seulement après un
 * envoi réussi (un échec garde le lien déjà reçu). L'intervalle minimal est
 * réservé atomiquement (`lastReminderAt`). Rend `{ reminded, failed }`.
 */
export async function remindSignatureRequest(ctx: Ctx, id: string) {
  const request = await prisma.signatureRequest.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      id: true,
      tenantId: true,
      title: true,
      language: true,
      status: true,
      sequential: true,
      expiresAt: true,
      signers: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          fullName: true,
          channel: true,
          contact: true,
          contactId: true,
          status: true,
          position: true
        }
      }
    }
  });
  if (!request) throw new NotFoundError(t('Demande de signature introuvable.'));
  if (!(ACTIVE_REQUEST_STATUSES as readonly string[]).includes(request.status)) {
    throw new ConflictError(t('Cette demande de signature n’est plus en cours.'));
  }
  const now = new Date();
  const claimed = await prisma.signatureRequest.updateMany({
    where: {
      id,
      tenantId: ctx.tenantId,
      status: { in: [...ACTIVE_REQUEST_STATUSES] },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: new Date(now.getTime() - REMINDER_MIN_INTERVAL_MS) } }]
    },
    data: { lastReminderAt: now }
  });
  if (claimed.count !== 1) {
    throw new AppError(t('Une relance vient d’être envoyée : réessayez dans quelques minutes.'), 429, 'RATE_LIMITED');
  }

  const unsigned = request.signers.filter(s => s.status === 'PENDING' || s.status === 'OPENED');
  const candidates = request.sequential ? unsigned.slice(0, 1) : unsigned;
  const targets = candidates.filter(s => s.status === 'PENDING' && s.channel !== 'IN_PERSON');
  const agencyName = await agencyNameOf(ctx.tenantId);
  let reminded = 0;
  let failed = 0;
  for (const signer of targets) {
    const prepared = prepareSignerToken(request.expiresAt, false, now);
    const status = await inviteSigner({ request, signer, token: prepared.token, agencyName, reminder: true });
    if (status === 'SENT' && (await commitSignerToken(ctx.tenantId, signer.id, prepared))) reminded += 1;
    else failed += 1;
  }
  await appendSignatureEventStandalone({
    tenantId: ctx.tenantId,
    requestId: id,
    type: 'REMINDER_SENT',
    payload: { reminded, failed, byUserId: ctx.userId },
    now
  });
  return { reminded, failed };
}

/**
 * Nouveau jeton de signature sur place (l'ancien cesse d'agir), remis UNE seule
 * fois. Tracé : événement `IN_PERSON_TOKEN_ISSUED` (utilisateur) + audit critique
 * dans la même transaction, et `inPersonIssuedBy` désigne l'agent qui assiste le
 * signataire (consigné à la signature).
 */
export async function reissueInPersonToken(ctx: Ctx, id: string, signerId: string) {
  const request = await findRequest(ctx.tenantId, id);
  if (!(ACTIVE_REQUEST_STATUSES as readonly string[]).includes(request.status)) {
    throw new ConflictError(t('Cette demande de signature n’est plus en cours.'));
  }
  const signer = request.signers.find(s => s.id === signerId);
  if (!signer || signer.channel !== 'IN_PERSON') throw new NotFoundError(t('Signataire introuvable.'));
  const now = new Date();
  const prepared = prepareSignerToken(request.expiresAt, true, now);
  await prisma.$transaction(async tx => {
    const updated = await tx.signatureSigner.updateMany({
      where: { id: signerId, tenantId: ctx.tenantId, status: { in: ['PENDING', 'OPENED'] }, channel: 'IN_PERSON' },
      data: { tokenHash: prepared.tokenHash, tokenExpiresAt: prepared.tokenExpiresAt, inPersonIssuedBy: ctx.userId }
    });
    if (updated.count !== 1) throw new ConflictError(t('Ce signataire a déjà signé ou refusé.'));
    await appendSignatureEvent(tx, {
      tenantId: ctx.tenantId,
      requestId: id,
      signerId,
      type: 'IN_PERSON_TOKEN_ISSUED',
      payload: { byUserId: ctx.userId },
      now
    });
    await recordAuditEvent(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actionKey: AuditActionKey.SIGNATURE_IN_PERSON_TOKEN_ISSUED,
      entityType: 'SignatureRequest',
      entityId: id,
      payload: { requestId: id, signerId }
    });
  });
  return { inPersonUrlToken: prepared.token };
}

// -------------------------------------------------------------- fichiers

/** PDF source ou scellé d'une demande de l'agence, en flux, sans cache. */
export async function sendSignatureFile(tenantId: string, id: string, variant: 'source' | 'signed', res: Response) {
  const request = await prisma.signatureRequest.findFirst({
    where: { id, tenantId },
    select: { id: true, title: true, sourceFileKey: true, signedFileKey: true }
  });
  if (!request) throw new NotFoundError(t('Demande de signature introuvable.'));
  const key = variant === 'signed' ? request.signedFileKey : request.sourceFileKey;
  if (!key) throw new NotFoundError(t("Le PDF scellé n'est pas encore disponible."));
  const file = await readSignatureFile(tenantId, id, key);
  sendPrivateFile(res, {
    ...file,
    fileName: `${request.title.replace(/[^\p{L}\p{N} ._-]/gu, '')}${variant === 'signed' ? ' - signé' : ''}.pdf`
  });
}

// ----------------------------------------------------- expiration (tâche)

/**
 * Marque `EXPIRED` les demandes échues et prévient l'émetteur (SG-R11). Les
 * demandes dont TOUS les signataires ont signé ne s'expirent pas : elles
 * attendent leur scellement (`sealPendingSignatureRequests`, joué avant). Mise
 * à jour conditionnelle : plusieurs instances ne doublent rien.
 */
export async function expireDueSignatureRequests(now: Date = new Date(), batch = 100): Promise<number> {
  const stillWaiting = { signers: { some: { status: { not: 'SIGNED' as const } } } };
  const due = await prisma.signatureRequest.findMany({
    where: { status: { in: ['SENT', 'PARTIALLY_SIGNED'] }, expiresAt: { lt: now }, ...stillWaiting },
    take: batch,
    select: { id: true, tenantId: true, title: true, language: true, createdByUserId: true }
  });
  let expired = 0;
  for (const request of due) {
    const done = await runWithTenantContext({ tenantId: request.tenantId }, () =>
      prisma.$transaction(async tx => {
        const updated = await tx.signatureRequest.updateMany({
          where: {
            id: request.id,
            tenantId: request.tenantId,
            status: { in: ['SENT', 'PARTIALLY_SIGNED'] },
            expiresAt: { lt: now },
            ...stillWaiting
          },
          data: { status: 'EXPIRED' }
        });
        if (updated.count !== 1) return false;
        await appendSignatureEvent(tx, { tenantId: request.tenantId, requestId: request.id, type: 'EXPIRED', now });
        await recordAuditEvent(tx, {
          tenantId: request.tenantId,
          actorUserId: null,
          actorType: 'SYSTEM',
          actionKey: AuditActionKey.SIGNATURE_EXPIRED,
          entityType: 'SignatureRequest',
          entityId: request.id,
          payload: { requestId: request.id }
        });
        return true;
      })
    ).catch(error => {
      logger.error('Signature : expiration en échec', {
        requestId: request.id,
        error: error instanceof Error ? error.name : 'inconnue'
      });
      return false;
    });
    if (!done) continue;
    expired += 1;
    const language = languageOf(request.language);
    await notifyIssuer({
      tenantId: request.tenantId,
      userId: request.createdByUserId,
      language,
      subject: t('Demande de signature expirée — {{title}}', { title: request.title }, language),
      text: t(
        'La demande de signature de « {{title}} » a expiré avant que toutes les parties aient signé.',
        { title: request.title },
        language
      )
    });
  }
  return expired;
}

/** Rejoue le scellement des demandes entièrement signées mais non scellées (échec antérieur). */
export async function sealPendingSignatureRequests(now: Date = new Date(), batch = 50): Promise<number> {
  const pending = await prisma.signatureRequest.findMany({
    where: {
      status: { in: ['SENT', 'PARTIALLY_SIGNED'] },
      signedFileKey: null,
      signers: { some: {}, none: { status: { not: 'SIGNED' } } }
    },
    take: batch,
    select: { id: true, tenantId: true }
  });
  let sealed = 0;
  for (const request of pending) {
    const outcome = await runWithTenantContext({ tenantId: request.tenantId }, () =>
      sealRequest(request.tenantId, request.id, now)
    );
    if (outcome === 'SEALED') sealed += 1;
  }
  return sealed;
}
