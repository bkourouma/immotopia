import { t, currentLanguage } from '../i18n';
import { AppError, BadRequestError, ConflictError } from '../middleware/error-middleware';
import { invalidSecureLinkError } from '../lib/secure-links';
import { prisma, type PrismaTransactionClient } from '../utils/database';
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
import {
  ACTIONABLE_SIGNER_STATUSES,
  ACTIVE_REQUEST_STATUSES,
  isInternalSignatureProvider
} from '../lib/signature/types';
import { cancelRequestInternal } from '../lib/signature/cancel';
import { findSignatureSource } from '../lib/signature/sources';
import { sourceGateOf, newViewGrant, viewGrantIsValid } from '../lib/signature/view-grant';
import { auditSignatureFileServed } from '../lib/signature/file-audit';
import { providerSignerRef } from '../lib/signature/external-gateway';
import { getExternalSignatureClientById } from '../lib/signature/provider/external';

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
  viewGrantHash: true,
  viewGrantExpiresAt: true,
  request: {
    select: {
      id: true,
      kind: true,
      targetType: true,
      targetId: true,
      title: true,
      language: true,
      status: true,
      providerId: true,
      providerRef: true,
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
 * terminée, peut encore consulter (confirmation) mais pas agir. `allowExternal` : une
 * demande confiée à un prestataire n'est atteignable que pour une source `externalGateway`
 * (ImmoTopia garde la porte : page, code et lien) ; signer et refuser restent refusés.
 */
async function resolveToken(
  token: string,
  options: { readOnly?: boolean; allowExternal?: boolean } = {}
): Promise<ResolvedSigner> {
  if (!looksLikeToken(token)) throw invalidSecureLinkError();
  const signer = await loadSigner(token);
  const now = Date.now();
  if (!signer || signer.tokenExpiresAt.getTime() <= now || signer.request.expiresAt.getTime() <= now) {
    throw invalidSecureLinkError();
  }
  // Demande confiée à un prestataire externe : aucun jeton interne n'agit, même refus uniforme,
  // sauf (parcours public limité) pour une source `externalGateway`.
  if (
    !isInternalSignatureProvider(signer.request.providerId) &&
    !(options.allowExternal && sourceGateOf(signer.request.kind).externalGateway)
  ) {
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
  const signer = await resolveToken(token, { readOnly: true, allowExternal: true });
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
    // Spec 042 §10.5 : le parcours public sait s'il faut le code AVANT de montrer le document, et si la
    // signature se fait chez le prestataire. Pour ces sources, rien du document hors titre et contact masqué.
    const codeRequiredBeforeView = sourceGateOf(signer.request.kind).codeBeforeView;
    const external = !isInternalSignatureProvider(signer.request.providerId);
    return {
      codeRequiredBeforeView,
      external,
      request: {
        kind: signer.request.kind,
        title: signer.request.title,
        status: signer.request.status,
        expiresAt: signer.request.expiresAt.toISOString(),
        codeRequiredBeforeView,
        external
      },
      signer: {
        fullName: signer.fullName,
        role: signer.role,
        maskedContact: maskContact(signer.channel, signer.contact),
        status: signer.status === 'PENDING' ? 'OPENED' : signer.status,
        channel: signer.channel,
        // Demande externe : la signature se fait chez le prestataire, jamais ici.
        canSign: canSign && !external
      },
      consentText: consentText(currentLanguage())
    };
  });
}

/**
 * PDF source à lire par le signataire (flux). Source `codeBeforeView` : le jeton de consultation
 * (en-tête `X-Signature-View-Token`, posé par `verifyPublicOtp`) est exigé, sinon le même 404 ; la
 * lecture est auditée AVANT l'envoi (un échec d'audit bloque). Le mode lecture seule après
 * signature suit la même règle.
 */
export async function getPublicSourceFile(
  token: string,
  viewToken?: string
): Promise<{ buffer: Buffer; title: string }> {
  const signer = await resolveToken(token, { readOnly: true, allowExternal: true });
  if (sourceGateOf(signer.request.kind).codeBeforeView && !viewGrantIsValid(signer, viewToken)) {
    throw invalidSecureLinkError();
  }
  return inTenant(signer, async () => {
    const file = await readSignatureFile(signer.tenantId, signer.requestId, signer.request.sourceFileKey);
    await auditSignatureFileServed({
      tenantId: signer.tenantId,
      requestId: signer.requestId,
      kind: signer.request.kind,
      targetId: signer.request.targetId,
      channel: 'SIGNER',
      variant: 'source',
      signerId: signer.id
    });
    return { buffer: file.buffer, title: signer.request.title };
  });
}

// --------------------------------------------------------------------- code

export async function sendPublicOtp(token: string) {
  const signer = await resolveToken(token, { allowExternal: true });
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

// ------------------------------------------- code avant consultation (042 §10.5)

type VerifyOutcome = OtpCheck | { kind: 'GONE' } | { kind: 'DONE' };

/**
 * Vérifie le code AVANT toute consultation du document (source `codeBeforeView` ; sinon le même
 * 404 qu'un jeton invalide). Mêmes essais, verrouillage et événements que la signature par code
 * (essai réservé avant la comparaison). Au succès : le code est consommé, `otpVerifiedAt` posé,
 * un jeton de consultation de 32 octets (empreinte SHA-256 stockée, 15 minutes) est remis une
 * seule fois, et l'événement de preuve `OTP_VERIFIED` entre dans la chaîne.
 */
export async function verifyPublicOtp(token: string, rawCode: string | undefined) {
  const signer = await resolveToken(token, { allowExternal: true });
  if (!sourceGateOf(signer.request.kind).codeBeforeView || signer.channel === 'IN_PERSON') {
    throw invalidSecureLinkError();
  }
  return inTenant(signer, async () => {
    await assertCanAct(signer);
    const code = normalizeOtpInput(rawCode);
    if (!code) throw new BadRequestError(t('Saisissez le code reçu pour continuer.'));
    const limits = otpLimits();
    const now = new Date();
    const grant = newViewGrant(now);
    const outcome: VerifyOutcome = await prisma.$transaction(async tx => {
      // La demande doit être active et non échue (pose aussi le verrou de ligne).
      const live = await tx.signatureRequest.updateMany({
        where: {
          id: signer.requestId,
          tenantId: signer.tenantId,
          status: { in: [...ACTIVE_REQUEST_STATUSES] },
          expiresAt: { gt: now }
        },
        data: { updatedAt: now }
      });
      if (live.count !== 1) return { kind: 'GONE' };
      const checked = await checkOtpInTx(tx, signer, code, limits, now);
      if (checked.kind !== 'OK') return checked;
      const verified = await tx.signatureSigner.updateMany({
        where: { id: signer.id, tenantId: signer.tenantId, status: { in: [...ACTIONABLE_SIGNER_STATUSES] } },
        data: {
          otpHash: null,
          otpExpiresAt: null,
          otpVerifiedAt: now,
          viewGrantHash: grant.hash,
          viewGrantExpiresAt: grant.expiresAt
        }
      });
      if (verified.count !== 1) return { kind: 'LOCKED' };
      await appendSignatureEvent(tx, {
        tenantId: signer.tenantId,
        requestId: signer.requestId,
        signerId: signer.id,
        type: 'OTP_VERIFIED',
        payload: { channel: signer.channel },
        now
      });
      return { kind: 'DONE' };
    });
    if (outcome.kind === 'GONE') throw invalidSecureLinkError();
    if (outcome.kind === 'WRONG') {
      throw new AppError(t('Code invalide ou expiré.'), 400, 'SIGNATURE_OTP_INVALID', undefined, {
        remainingAttempts: outcome.remaining
      });
    }
    if (outcome.kind !== 'DONE') throw new AppError(t('Code invalide ou expiré.'), 400, 'SIGNATURE_OTP_INVALID');
    return { viewToken: grant.token, expiresAt: grant.expiresAt.toISOString() };
  });
}

/**
 * Lien de signature du prestataire (source `externalGateway`, SIG-S6) : exige le jeton de
 * consultation, puis lit EN DIRECT chez le prestataire le lien du signataire. L'URL n'est ni
 * stockée ni journalisée. Fournisseur interne, source ordinaire ou jeton de consultation absent :
 * 404 uniforme.
 */
export async function getPublicExternalLink(token: string, viewToken?: string) {
  const signer = await resolveToken(token, { allowExternal: true });
  const gate = sourceGateOf(signer.request.kind);
  if (
    !gate.externalGateway ||
    isInternalSignatureProvider(signer.request.providerId) ||
    !signer.request.providerRef ||
    !viewGrantIsValid(signer, viewToken)
  ) {
    throw invalidSecureLinkError();
  }
  const client = getExternalSignatureClientById(signer.request.providerId);
  if (!client) throw invalidSecureLinkError();
  const providerRef = signer.request.providerRef;
  return inTenant(signer, async () => {
    await assertCanAct(signer);
    const signerRef = await providerSignerRef(signer.tenantId, signer.requestId, signer.position);
    if (!signerRef) throw invalidSecureLinkError();
    try {
      return { url: await client.getSignerLink(providerRef, signerRef) };
    } catch (error) {
      // Ni l'URL ni le corps de la réponse ne sont journalisés : le code d'erreur typé seulement.
      logger.warn('Signature : lien du prestataire indisponible', {
        tenantId: signer.tenantId,
        requestId: signer.requestId,
        code: (error as { code?: unknown } | null)?.code ?? 'inconnu'
      });
      throw new AppError(
        t("Le lien de signature n'est pas disponible pour le moment. Réessayez dans un instant."),
        503,
        'SERVICE_UNAVAILABLE'
      );
    }
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

type OtpCheck = { kind: 'OK' } | { kind: 'WRONG'; remaining: number } | { kind: 'LOCKED' };

/**
 * Vérifie un code DANS la transaction `tx` (signature, ou vérification avant consultation) :
 * l'essai est RÉSERVÉ avant la comparaison, si bien que la limite tient sous requêtes simultanées.
 * Un échec écrit l'événement de preuve (et l'audit au verrouillage) ; ces écritures sont conservées
 * parce que l'appelant renvoie le résultat au lieu de lever.
 */
async function checkOtpInTx(
  tx: PrismaTransactionClient,
  signer: ResolvedSigner,
  code: string | null,
  limits: ReturnType<typeof otpLimits>,
  now: Date
): Promise<OtpCheck> {
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
  if (reserved.count !== 1) return { kind: 'LOCKED' };
  const current = await tx.signatureSigner.findFirst({
    where: { id: signer.id, tenantId: signer.tenantId },
    select: { otpAttempts: true, otpHash: true }
  });
  if (!current?.otpHash) return { kind: 'LOCKED' };
  if (!code || !otpMatches(current.otpHash, code, signer.id)) {
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
    return { kind: 'WRONG', remaining: Math.max(0, limits.maxAttempts - current.otpAttempts) };
  }
  return { kind: 'OK' };
}

async function recordSignature(args: {
  signer: ResolvedSigner;
  code: string | null;
  /** Source `codeBeforeView` : empreinte du jeton de consultation présenté (remplace le code). */
  viewGrant?: { hash: string };
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

      if (args.viewGrant) {
        // Source « code avant consultation » : le code a déjà été consommé à la vérification ; la signature
        // exige le jeton de consultation valide (revérifié ici, dans la transaction).
        const granted = await tx.signatureSigner.count({
          where: {
            id: signer.id,
            tenantId: signer.tenantId,
            viewGrantHash: args.viewGrant.hash,
            viewGrantExpiresAt: { gt: now }
          }
        });
        if (granted !== 1) return { kind: 'GONE' } as SignOutcome;
      } else if (signer.channel !== 'IN_PERSON') {
        const checked = await checkOtpInTx(tx, signer, args.code, limits, now);
        if (checked.kind !== 'OK') return checked as SignOutcome;
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
            : { otp: true, ...(args.viewGrant ? { viewGrant: true } : {}) })
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

/**
 * Signature. Source `codeBeforeView` (spec 042 §10.5) : le code a déjà été consommé par
 * `verifyPublicOtp` ; la signature exige le jeton de consultation (`viewToken`, valide et non
 * échu), sinon le 404 uniforme. Une demande confiée à un prestataire ne se signe jamais ici.
 */
export async function signPublic(token: string, input: SignInput, meta: PublicMeta, viewToken?: string) {
  const signer = await resolveToken(token);
  const gated = sourceGateOf(signer.request.kind).codeBeforeView;
  if (gated && (signer.channel === 'IN_PERSON' || !viewGrantIsValid(signer, viewToken))) {
    throw invalidSecureLinkError();
  }
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
    if (!gated && signer.channel !== 'IN_PERSON') {
      code = normalizeOtpInput(input.code);
      if (!code) throw new BadRequestError(t('Saisissez le code reçu pour signer.'));
    }
    await assertSourceIntact(signer);

    const language = currentLanguage();
    const outcome = await recordSignature({
      signer,
      code,
      viewGrant: gated && viewToken ? { hash: hashToken(viewToken) } : undefined,
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
