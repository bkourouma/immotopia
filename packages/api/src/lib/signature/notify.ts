import { prisma } from '../../utils/database';
import { isLanguage, type Language } from '../../i18n';
import { logger } from '../../utils/logger';
import { emailService } from '../../services/email-service';
import { appendSignatureEventStandalone } from './events';
import { buildInviteMessage, buildOtpMessage, signingUrl } from './messages';
import { getSignatureProvider } from './provider';
import { generateToken, hashToken } from './token';
import type { DeliveryResult } from './types';

/**
 * Remise des liens et des codes aux signataires (spec 044), et notification de
 * l'émetteur. Rien de ce qui est remis (lien, jeton, code, contact) n'est
 * journalisé : seuls le canal et le résultat figurent aux événements.
 */

export type InviteRequest = { id: string; tenantId: string; title: string; language: string; expiresAt: Date };
export type InviteSigner = {
  id: string;
  fullName: string;
  channel: string;
  contact: string;
  contactId: string | null;
};

export function languageOf(value: string): Language {
  return isLanguage(value) ? value : 'fr';
}

export async function agencyNameOf(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return tenant?.name ?? 'ImmoTopia';
}

function channelOf(channel: string): 'EMAIL' | 'WHATSAPP' | 'SMS' | null {
  return channel === 'EMAIL' || channel === 'WHATSAPP' || channel === 'SMS' ? channel : null;
}

/** Envoie le lien de signature (première invitation ou relance) et note le résultat. */
export async function inviteSigner(args: {
  request: InviteRequest;
  signer: InviteSigner;
  token: string;
  agencyName: string;
  reminder?: boolean;
}): Promise<'SENT' | 'FAILED' | 'NOT_APPLICABLE'> {
  const { request, signer } = args;
  const channel = channelOf(signer.channel);
  if (!channel) return 'NOT_APPLICABLE';

  const message = buildInviteMessage({
    signerName: signer.fullName,
    agencyName: args.agencyName,
    title: request.title,
    url: signingUrl(args.token),
    expiresAt: request.expiresAt,
    language: languageOf(request.language),
    reminder: args.reminder,
    channel
  });
  const result: DeliveryResult = await getSignatureProvider().deliver({
    tenantId: request.tenantId,
    channel,
    to: signer.contact,
    contactId: signer.contactId,
    ...message
  });

  const status = result.ok ? 'SENT' : 'FAILED';
  await prisma.signatureSigner.updateMany({
    where: { id: signer.id, tenantId: request.tenantId },
    data: { inviteStatus: status }
  });
  await appendSignatureEventStandalone({
    tenantId: request.tenantId,
    requestId: request.id,
    signerId: signer.id,
    type: result.ok ? 'INVITE_SENT' : 'INVITE_FAILED',
    payload: { channel, reminder: Boolean(args.reminder), ...(result.ok ? {} : { reason: result.reason }) }
  });
  return status;
}

export type PreparedToken = { token: string; tokenHash: string; tokenExpiresAt: Date };

/**
 * Prépare un nouveau jeton (rien n'est écrit). Le jeton en clair n'étant
 * jamais conservé, une relance ou l'ouverture d'un tour exige d'en émettre un
 * nouveau ; il ne remplace l'ancien (commitSignerToken) qu'APRÈS un envoi
 * réussi, pour qu'un échec n'invalide pas le lien déjà reçu.
 * shortLived : signature sur place, validité de 24 h au plus.
 */
export function prepareSignerToken(requestExpiresAt: Date, shortLived: boolean, now: Date = new Date()): PreparedToken {
  const token = generateToken();
  const tokenExpiresAt = shortLived
    ? new Date(Math.min(requestExpiresAt.getTime(), now.getTime() + 24 * 60 * 60 * 1000))
    : requestExpiresAt;
  return { token, tokenHash: hashToken(token), tokenExpiresAt };
}

/** Pose le jeton préparé tant que le signataire peut encore agir. Rend vrai si posé. */
export async function commitSignerToken(tenantId: string, signerId: string, prepared: PreparedToken): Promise<boolean> {
  const updated = await prisma.signatureSigner.updateMany({
    where: { id: signerId, tenantId, status: { in: ['PENDING', 'OPENED'] } },
    data: { tokenHash: prepared.tokenHash, tokenExpiresAt: prepared.tokenExpiresAt }
  });
  return updated.count === 1;
}

/** Envoie un code à usage unique. Rend le résultat de la remise. */
export async function deliverOtp(args: {
  tenantId: string;
  title: string;
  language: string;
  agencyName: string;
  signer: InviteSigner;
  code: string;
  ttlMinutes: number;
}): Promise<DeliveryResult> {
  const channel = channelOf(args.signer.channel);
  if (!channel) return { ok: false, reason: 'UNSUPPORTED' };
  const message = buildOtpMessage({
    agencyName: args.agencyName,
    title: args.title,
    code: args.code,
    ttlMinutes: args.ttlMinutes,
    language: languageOf(args.language),
    channel
  });
  return getSignatureProvider().deliver({
    tenantId: args.tenantId,
    channel,
    to: args.signer.contact,
    contactId: args.signer.contactId,
    ...message
  });
}

/**
 * Prévient l'émetteur de la demande (e-mail), au mieux : un échec ne bloque rien.
 * `subject` et `text` sont déjà traduits par l'appelant dans `language` (langue de la
 * demande) ; elle fixe aussi le sens de lecture du message.
 */
export async function notifyIssuer(args: {
  tenantId: string;
  userId: string;
  language: string;
  subject: string;
  text: string;
}): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: args.userId }, select: { email: true } });
    if (!user?.email) return;
    await emailService.sendEmail({
      to: user.email,
      subject: args.subject,
      text: args.text,
      html: `<div dir="${languageOf(args.language) === 'ar' ? 'rtl' : 'ltr'}"><p>${args.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p></div>`,
      tenantId: args.tenantId
    });
  } catch (error) {
    logger.warn('Signature : notification de l’émetteur en échec', {
      tenantId: args.tenantId,
      error: error instanceof Error ? error.name : 'inconnue'
    });
  }
}
