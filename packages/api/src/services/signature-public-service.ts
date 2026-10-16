import { t, currentLanguage } from '../i18n';
import { AppError, BadRequestError, ConflictError } from '../middleware/error-middleware';
import { invalidSecureLinkError } from '../lib/secure-links';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { runWithTenantContext } from '../utils/tenant-context';
import { recordAuditEvent, AuditActionKey } from './audit-service';
import { maskContact } from '../lib/signature/dto';
import { appendSignatureEvent, appendSignatureEventStandalone } from '../lib/signature/events';
import { hashIp, sha256Hex, truncateIp, truncateUserAgent } from '../lib/signature/evidence';
import { readSignatureFile, removeSignatureFile, signatureFileKey, writeSignatureFile } from '../lib/signature/files';
import { consentText } from '../lib/signature/messages';
import {
  agencyNameOf,
  deliverOtp,
  commitSignerToken,
  inviteSigner,
  languageOf,
  notifyIssuer,
  prepareSignerToken
} from '../lib/signature/notify';
import { generateOtpCode, normalizeOtpInput, otpHash, otpLimits, otpMatches } from '../lib/signature/otp';
import { sealRequest } from '../lib/signature/sealing';
import { assertReadablePng, parseSignatureInput } from '../lib/signature/signature-input';
import { hashToken, looksLikeToken } from '../lib/signature/token';
import { ACTIONABLE_SIGNER_STATUSES, ACTIVE_REQUEST_STATUSES } from '../lib/signature/types';
import { cancelRequestInternal } from '../lib/signature/cancel';
import { findSignatureSource } from '../lib/signature/sources';

/**
 * Signature électronique, côté signataire (spec 044, lot S1) : routes publiques
 * sous `/api/public/signatures/:token`. Le jeton est la seule preuve d'accès.
 * Jeton inconnu, expiré, révoqué ou demande close : MÊME refus (404 uniforme,
 * `invalidSecureLinkError`), aucune fuite d'existence (SG-R9). Après
 * résolution du jeton, tout s'exécute dans le contexte de l'agence du
 * signataire (`runWithTenantContext`) et toute requête filtre par `tenantId`.
 */

export type PublicMeta = { ip?: string; userAgent?: string };

const SIGNER_SELECT = {
  id: true,
  tenantId: true,
  requestId: true,
  role: true,
  position: true,
  fullName: true,
  channel: true,
  contact: true,
  contactId: true,
  status: true,
  tokenExpiresAt: true,
  otpSends: true,
  otpLastSentAt: true,
  inPersonIssuedBy: true,
  request: {
    select: {
      id: true,
      kind: true,
      targetType: true,
      targetId: true,
      title: true,
      language: true,
      status: true,
      sequential: true,
      expiresAt: true,
      sourceFileKey: true,
      sourceHash: true,
      sourceDocumentId: true,
      sourceDocHash: true,
      createdByUserId: true
    }
  }
} as const;

type ResolvedSigner = NonNullable<Awaited<ReturnType<typeof loadSigner>>>;

function loadSigner(token: string) {
  return prisma.signatureSigner.findUnique({ where: { tokenHash: hashToken(token) }, select: SIGNER_SELECT });
}

/**
 * Résout un jeton. `readOnly` : un signataire ayant déjà signé, ou une demande
 * terminée, peut encore consulter (confirmation) mais pas agir.
 */
async function resolveToken(token: string, options: { readOnly?: boolean } = {}): Promise<ResolvedSigner> {
  if (!looksLikeToken(token)) throw invalidSecureLinkError();
  const signer = await loadSigner(token);
  const now = Date.now();
  if (!signer || signer.tokenExpiresAt.getTime() <= now || signer.request.expiresAt.getTime() <= now) {
    throw invalidSecureLinkError();
  }
  const { status } = signer.request;
  const requestOk =
    (ACTIVE_REQUEST_STATUSES as readonly string[]).includes(status) || (options.readOnly && status === 'COMPLETED');
  const signerOk =
    (ACTIONABLE_SIGNER_STATUSES as readonly string[]).includes(signer.status) ||
    (options.readOnly === true && signer.status === 'SIGNED');
  if (!requestOk || !signerOk) throw invalidSecureLinkError();
  return signer;
}

async function isSignerTurn(signer: ResolvedSigner): Promise<boolean> {
  if (!signer.request.sequential) return true;
  const before = await prisma.signatureSigner.count({
    where: {
      tenantId: signer.tenantId,
      requestId: signer.requestId,
      position: { lt: signer.position },
      status: { not: 'SIGNED' }
    }
  });
  return before === 0;
}

async function assertCanAct(signer: ResolvedSigner): Promise<void> {
  if (signer.status === 'SIGNED') throw new ConflictError(t('Vous avez déjà signé ce document.'));
  if (!(await isSignerTurn(signer))) {
    throw new AppError(t("Ce n'est pas encore votre tour de signer."), 409, 'SIGNATURE_NOT_YOUR_TURN');
  }
}

function inTenant<T>(signer: ResolvedSigner, run: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ tenantId: signer.tenantId }, run);
}

// ------------------------------------------------------------------ lecture

export async function getPublicSignature(token: string) {
  const signer = await resolveToken(token, { readOnly: true });
  return inTenant(signer, async () => {
    if (signer.status === 'PENDING') {
      const opened = await prisma.signatureSigner.updateMany({
        where: { id: signer.id, tenantId: signer.tenantId, status: 'PENDING' },
        data: { status: 'OPENED', openedAt: new Date() }
      });
      if (opened.count === 1) {
        await appendSignatureEventStandalone({
          tenantId: signer.tenantId,
          requestId: signer.requestId,
          signerId: signer.id,
          type: 'OPENED'
        });
      }
    }
    const canSign = signer.status !== 'SIGNED' && signer.request.status !== 'COMPLETED' && (await isSignerTurn(signer));
    return {
      request: {
        kind: signer.request.kind,
        title: signer.request.title,
        status: signer.request.status,
        expiresAt: signer.request.expiresAt.toISOString()
      },
      signer: {
        fullName: signer.fullName,
        role: signer.role,
        maskedContact: maskContact(signer.channel, signer.contact),
        status: signer.status === 'PENDING' ? 'OPENED' : signer.status,
        channel: signer.channel,
        canSign
      },
      consentText: consentText(currentLanguage())
    };
  });
}

/** PDF source à lire par le signataire (flux). */
export async function getPublicSourceFile(token: string): Promise<{ buffer: Buffer; title: string }> {
  const signer = await resolveToken(token, { readOnly: true });
  return inTenant(signer, async () => {
    const file = await readSignatureFile(signer.tenantId, signer.requestId, signer.request.sourceFileKey);
    return { buffer: file.buffer, title: signer.request.title };
  });
}

// --------------------------------------------------------------------- code

export async function sendPublicOtp(token: string) {
  const signer = await resolveToken(token);
  return inTenant(signer, async () => {
    await assertCanAct(signer);
    if (signer.channel === 'IN_PERSON') {
      throw new BadRequestError(t("Aucun code n'est requis pour la signature sur place."));
    }
    const limits = otpLimits();
    const now = new Date();
    const code = generateOtpCode();
    // Réserve l'envoi (compteur, délai) SANS toucher au code en cours : si la
    // remise échoue, l'ancien code reste valable.
    const reserved = await prisma.signatureSigner.updateMany({
      where: {
        id: signer.id,
        tenantId: signer.tenantId,
        status: { in: [...ACTIONABLE_SIGNER_STATUSES] },
        otpSends: { lt: limits.maxSends },
        OR: [{ otpLastSentAt: null }, { otpLastSentAt: { lte: new Date(now.getTime() - limits.resendDelayMs) } }]
      },
      data: { otpSends: { increment: 1 }, otpLastSentAt: now }
    });
    if (reserved.count !== 1) {
      if (signer.otpSends >= limits.maxSends) {
        throw new AppError(t("Le nombre d'envois de code est atteint : contactez l'agence."), 429, 'RATE_LIMITED');
      }
      const wait = Math.max(1, Math.ceil(limits.resendDelayMs / 1000));
      throw new AppError(
        t('Un code vient d’être envoyé : patientez avant d’en demander un autre.'),
        429,
        'RATE_LIMITED',
        undefined,
        { retryAfterSeconds: wait }
      );
    }
    const delivery = await deliverOtp({
      tenantId: signer.tenantId,
      title: signer.request.title,
      language: signer.request.language,
      agencyName: await agencyNameOf(signer.tenantId),
      signer,
      code,
      ttlMinutes: Math.round(limits.ttlMs / 60000)
    });
    if (!delivery.ok) {
      // Remise impossible : le code ne compte pas (envoi et délai rendus, ancien code conservé).
      await prisma.signatureSigner.updateMany({
        where: { id: signer.id, tenantId: signer.tenantId },
        data: { otpSends: { decrement: 1 }, otpLastSentAt: signer.otpLastSentAt }
      });
      await appendSignatureEventStandalone({
        tenantId: signer.tenantId,
        requestId: signer.requestId,
        signerId: signer.id,
        type: 'OTP_FAILED',
        payload: { reason: 'DELIVERY', channel: signer.channel }
      });
      throw new AppError(t("Le code n'a pas pu être envoyé. Réessayez dans un instant."), 503, 'SERVICE_UNAVAILABLE');
    }
    // Le nouveau code remplace l'ancien seulement une fois remis.
    await prisma.signatureSigner.updateMany({
      where: { id: signer.id, tenantId: signer.tenantId, status: { in: [...ACTIONABLE_SIGNER_STATUSES] } },
      data: {
        otpHash: otpHash(code, signer.id),
        otpExpiresAt: new Date(now.getTime() + limits.ttlMs),
        otpAttempts: 0
      }
    });
    await appendSignatureEventStandalone({
      tenantId: signer.tenantId,
      requestId: signer.requestId,
      signerId: signer.id,
      type: 'OTP_SENT',
      payload: { channel: signer.channel, sendNumber: signer.otpSends + 1 }
    });
    return {
      sentTo: maskContact(signer.channel, signer.contact),
      retryAfterSeconds: Math.ceil(limits.resendDelayMs / 1000)
    };
  });
}

// ----------------------------------------------------------------- signature

export type SignInput = {
  code?: string;
  consent: true;
  signature: { mode: 'TYPED' | 'DRAWN'; value: string };
};

type SignOutcome =
  { kind: 'SIGNED'; complete: boolean } | { kind: 'WRONG'; remaining: number } | { kind: 'LOCKED' } | { kind: 'GONE' };

/**
 * Le document n'a pas bougé depuis l'envoi (SG-R2) : PDF source intact (SHA-256),
 * contrat toujours en vigueur (FINAL) et DOCX source inchangé (`file_hash`
 * comparé à celui figé à l'envoi). Sinon la demande est annulée.
 */
async function assertSourceIntact(signer: ResolvedSigner): Promise<void> {
  const { request } = signer;
  const file = await readSignatureFile(signer.tenantId, request.id, request.sourceFileKey);
  if (sha256Hex(file.buffer) !== request.sourceHash) {
    logger.error('Signature : empreinte du document source différente', {
      tenantId: signer.tenantId,
      requestId: request.id
    });
    throw new AppError(t('Le document ne peut plus être signé : contactez l’agence.'), 409, 'CONFLICT');
  }
  // Module d'origine : le document est-il toujours celui qui a été envoyé ? (échec fermé si le type n'a plus de source)
  const source = findSignatureSource(request.kind);
  const intact =
    source !== undefined &&
    (await source.isSourceIntact({
      id: request.id,
      tenantId: signer.tenantId,
      kind: request.kind,
      targetType: request.targetType,
      targetId: request.targetId,
      sourceDocumentId: request.sourceDocumentId,
      sourceDocHash: request.sourceDocHash
    }));
  if (!intact) {
    await cancelRequestInternal({ tenantId: signer.tenantId, userId: null }, request.id, 'SOURCE_CHANGED');
    throw invalidSecureLinkError();
  }
}

async function recordSignature(args: {
  signer: ResolvedSigner;
  code: string | null;
  parsed: ReturnType<typeof parseSignatureInput>;
  meta: PublicMeta;
  consentHash: string;
  consentLanguage: string;
}): Promise<SignOutcome> {
  const { signer } = args;
  const limits = otpLimits();
  const now = new Date();
  const imageName = `signer-${signer.id}.png`;
  let writtenImage = false;
  try {
    return await prisma.$transaction(async tx => {
      // La demande doit être active et non échue AU MOMENT de signer (pose aussi le verrou de ligne).
      const live = await tx.signatureRequest.updateMany({
        where: {
          id: signer.requestId,
          tenantId: signer.tenantId,
          status: { in: [...ACTIVE_REQUEST_STATUSES] },
          expiresAt: { gt: now }
        },
        data: { updatedAt: now }
      });
      if (live.count !== 1) return { kind: 'GONE' } as SignOutcome;

      if (signer.channel !== 'IN_PERSON') {
        // L'essai est RÉSERVÉ avant la comparaison : la limite tient sous requêtes simultanées.
        const reserved = await tx.signatureSigner.updateMany({
          where: {
            id: signer.id,
            tenantId: signer.tenantId,
            status: { in: [...ACTIONABLE_SIGNER_STATUSES] },
            otpAttempts: { lt: limits.maxAttempts },
            otpExpiresAt: { gt: now },
            otpHash: { not: null }
          },
          data: { otpAttempts: { increment: 1 } }
        });
        if (reserved.count !== 1) return { kind: 'LOCKED' } as SignOutcome;
        const current = await tx.signatureSigner.findFirst({
          where: { id: signer.id, tenantId: signer.tenantId },
          select: { otpAttempts: true, otpHash: true }
        });
        if (!current?.otpHash) return { kind: 'LOCKED' } as SignOutcome;
        if (!args.code || !otpMatches(current.otpHash, args.code, signer.id)) {
          const locked = current.otpAttempts >= limits.maxAttempts;
          await appendSignatureEvent(tx, {
            tenantId: signer.tenantId,
            requestId: signer.requestId,
            signerId: signer.id,
            type: locked ? 'OTP_LOCKED' : 'OTP_FAILED',
            payload: { reason: 'WRONG_CODE', attempts: current.otpAttempts }
          });
          if (locked) {
            await recordAuditEvent(tx, {
              tenantId: signer.tenantId,
              actorUserId: null,
              actorType: 'PORTAL',
              actionKey: AuditActionKey.SIGNATURE_OTP_LOCKED,
              entityType: 'SignatureSigner',
              entityId: signer.id,
              payload: { requestId: signer.requestId, signerId: signer.id, channel: signer.channel }
            });
          }
          return { kind: 'WRONG', remaining: Math.max(0, limits.maxAttempts - current.otpAttempts) } as SignOutcome;
        }
      }

      const drawn = args.parsed.mode === 'DRAWN' ? args.parsed.png : null;
      const signed = await tx.signatureSigner.updateMany({
        where: { id: signer.id, tenantId: signer.tenantId, status: { in: [...ACTIONABLE_SIGNER_STATUSES] } },
        data: {
          status: 'SIGNED',
          signedAt: now,
          otpHash: null,
          otpExpiresAt: null,
          signatureMode: args.parsed.mode,
          signatureTyped: args.parsed.mode === 'TYPED' ? args.parsed.typed : null,
          signatureImageKey: drawn ? signatureFileKey(signer.tenantId, signer.requestId, imageName) : null,
          consentTextHash: args.consentHash,
          ipHash: hashIp(args.meta.ip),
          ipTruncated: truncateIp(args.meta.ip),
          userAgent: truncateUserAgent(args.meta.userAgent)
        }
      });
      if (signed.count !== 1) return { kind: 'LOCKED' } as SignOutcome;

      // L'image n'est écrite qu'une fois la signature acquise, sans écraser un fichier existant.
      if (drawn) {
        await writeSignatureFile(signer.tenantId, signer.requestId, imageName as `signer-${string}.png`, drawn, {
          exclusive: true
        });
        writtenImage = true;
      }

      await tx.signatureRequest.updateMany({
        where: { id: signer.requestId, tenantId: signer.tenantId, status: 'SENT' },
        data: { status: 'PARTIALLY_SIGNED' }
      });
      await appendSignatureEvent(tx, {
        tenantId: signer.tenantId,
        requestId: signer.requestId,
        signerId: signer.id,
        type: 'SIGNED',
        payload: {
          channel: signer.channel,
          mode: args.parsed.mode,
          consentTextHash: args.consentHash,
          consentLanguage: args.consentLanguage,
          ipHash: hashIp(args.meta.ip),
          ...(drawn ? { imageSha256: sha256Hex(drawn) } : {}),
          ...(signer.channel === 'IN_PERSON'
            ? { presence: 'IN_PERSON', agentUserId: signer.inPersonIssuedBy }
            : { otp: true })
        },
        now
      });
      await recordAuditEvent(tx, {
        tenantId: signer.tenantId,
        actorUserId: null,
        actorType: 'PORTAL',
        actionKey: AuditActionKey.SIGNATURE_SIGNED,
        entityType: 'SignatureRequest',
        entityId: signer.requestId,
        payload: {
          requestId: signer.requestId,
          signerId: signer.id,
          role: signer.role,
          channel: signer.channel,
          mode: args.parsed.mode
        }
      });
      const remaining = await tx.signatureSigner.count({
        where: { tenantId: signer.tenantId, requestId: signer.requestId, status: { not: 'SIGNED' } }
      });
      return { kind: 'SIGNED', complete: remaining === 0 } as SignOutcome;
    });
  } catch (error) {
    // La transaction est annulée : le fichier écrit ne correspond plus à rien.
    if (writtenImage) await removeSignatureFile(signer.tenantId, signer.requestId, imageName);
    throw error;
  }
}

/**
 * Ouvre le tour du signataire suivant (signature séquentielle) : nouveau jeton,
 * posé seulement une fois le lien envoyé.
 */
async function inviteNextSigner(signer: ResolvedSigner): Promise<void> {
  const next = await prisma.signatureSigner.findFirst({
    where: { tenantId: signer.tenantId, requestId: signer.requestId, status: { in: [...ACTIONABLE_SIGNER_STATUSES] } },
    orderBy: { position: 'asc' },
    select: { id: true, fullName: true, channel: true, contact: true, contactId: true }
  });
  if (!next || next.channel === 'IN_PERSON') return;
  const prepared = prepareSignerToken(signer.request.expiresAt, false);
  const status = await inviteSigner({
    request: {
      id: signer.requestId,
      tenantId: signer.tenantId,
      title: signer.request.title,
      language: signer.request.language,
      expiresAt: signer.request.expiresAt
    },
    signer: next,
    token: prepared.token,
    agencyName: await agencyNameOf(signer.tenantId)
  });
  if (status === 'SENT') await commitSignerToken(signer.tenantId, next.id, prepared);
}

export async function signPublic(token: string, input: SignInput, meta: PublicMeta) {
  const signer = await resolveToken(token);
  return inTenant(signer, async () => {
    await assertCanAct(signer);
    const parsed = parseSignatureInput(input.signature.mode, input.signature.value);
    if (signer.channel === 'IN_PERSON') {
      // Sans code, la présence ne tient qu'à la signature manuscrite : un nom saisi ne suffit pas.
      if (parsed.mode !== 'DRAWN') {
        throw new BadRequestError(t('La signature sur place doit être dessinée.'));
      }
    }
    if (parsed.mode === 'DRAWN') await assertReadablePng(parsed.png);
    let code: string | null = null;
    if (signer.channel !== 'IN_PERSON') {
      code = normalizeOtpInput(input.code);
      if (!code) throw new BadRequestError(t('Saisissez le code reçu pour signer.'));
    }
    await assertSourceIntact(signer);

    const language = currentLanguage();
    const outcome = await recordSignature({
      signer,
      code,
      parsed,
      meta,
      consentHash: sha256Hex(consentText(language)),
      consentLanguage: language
    });
    if (outcome.kind === 'GONE') throw invalidSecureLinkError();
    if (outcome.kind === 'WRONG') {
      throw new AppError(t('Code invalide ou expiré.'), 400, 'SIGNATURE_OTP_INVALID', undefined, {
        remainingAttempts: outcome.remaining
      });
    }
    if (outcome.kind === 'LOCKED') throw new AppError(t('Code invalide ou expiré.'), 400, 'SIGNATURE_OTP_INVALID');

    if (outcome.complete) {
      const sealed = await sealRequest(signer.tenantId, signer.requestId);
      return { status: 'SIGNED', requestStatus: sealed === 'SEALED' ? 'COMPLETED' : 'PARTIALLY_SIGNED' };
    }
    if (signer.request.sequential) await inviteNextSigner(signer);
    return { status: 'SIGNED', requestStatus: 'PARTIALLY_SIGNED' };
  });
}

// ------------------------------------------------------------------- refus

/** Motif de refus : caractères de contrôle remplacés par une espace, 500 caractères au plus. */
function sanitizeReason(reason: string | undefined): string | null {
  const text = Array.from(reason ?? '', char => {
    const code = char.charCodeAt(0);
    return code <= 0x1f || code === 0x7f ? ' ' : char;
  }).join('');
  return text.trim().slice(0, 500) || null;
}

export async function declinePublic(token: string, reason: string | undefined) {
  const signer = await resolveToken(token);
  return inTenant(signer, async () => {
    await assertCanAct(signer);
    const cleaned = sanitizeReason(reason);
    const now = new Date();
    const declined = await prisma.$transaction(async tx => {
      const updated = await tx.signatureSigner.updateMany({
        where: { id: signer.id, tenantId: signer.tenantId, status: { in: [...ACTIONABLE_SIGNER_STATUSES] } },
        data: { status: 'DECLINED', declineReason: cleaned, otpHash: null, otpExpiresAt: null }
      });
      if (updated.count !== 1) return false;
      await tx.signatureRequest.updateMany({
        where: { id: signer.requestId, tenantId: signer.tenantId, status: { in: [...ACTIVE_REQUEST_STATUSES] } },
        data: { status: 'DECLINED' }
      });
      await appendSignatureEvent(tx, {
        tenantId: signer.tenantId,
        requestId: signer.requestId,
        signerId: signer.id,
        type: 'DECLINED',
        payload: { hasReason: Boolean(cleaned) },
        now
      });
      await recordAuditEvent(tx, {
        tenantId: signer.tenantId,
        actorUserId: null,
        actorType: 'PORTAL',
        actionKey: AuditActionKey.SIGNATURE_DECLINED,
        entityType: 'SignatureRequest',
        entityId: signer.requestId,
        payload: { requestId: signer.requestId, signerId: signer.id, role: signer.role }
      });
      return true;
    });
    if (!declined) throw invalidSecureLinkError();
    await notifyIssuer({
      tenantId: signer.tenantId,
      userId: signer.request.createdByUserId,
      language: signer.request.language,
      subject: t('Signature refusée — {{title}}', { title: signer.request.title }, languageOf(signer.request.language)),
      text: t(
        '{{name}} ({{role}}) a refusé de signer « {{title}} ». La demande est close.',
        { name: signer.fullName, role: signer.role, title: signer.request.title },
        languageOf(signer.request.language)
      )
    });
    return { status: 'DECLINED' };
  });
}
