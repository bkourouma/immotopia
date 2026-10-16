import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { t } from '../i18n';
import { runWithTenantContext } from '../utils/tenant-context';
import { recordAuditEvent, AuditActionKey } from './audit-service';
import { cancelRequestInternal } from '../lib/signature/cancel';
import { appendSignatureEvent, listChainedEvents } from '../lib/signature/events';
import { languageOf, notifyIssuer } from '../lib/signature/notify';
import { getSignatureProvider } from '../lib/signature/provider';
import type { ExternalRequestSnapshot, ExternalSignatureClient } from '../lib/signature/provider/external/types';
import { sealRequest } from '../lib/signature/sealing';
import { ACTIVE_REQUEST_STATUSES, ACTIONABLE_SIGNER_STATUSES } from '../lib/signature/types';

/**
 * Webhook du prestataire de signature externe (spec 044, lot S6). Le corps n'est
 * JAMAIS cru : il authentifie (HMAC) et désigne une demande ; l'état est relu
 * chez le prestataire, puis réconcilié avec la machine d'états locale par des
 * mises à jour CONDITIONNELLES (rejeu = aucun effet, aucun événement en double).
 * Jamais de journal du corps, d'en-tête, de signature ou de secret.
 */

export type ProviderWebhookResult = { status: 200; received: true } | { status: 401 | 404 };

const RECEIVED: ProviderWebhookResult = { status: 200, received: true };

function activeExternalClient(providerId: string): ExternalSignatureClient | null {
  try {
    const provider = getSignatureProvider();
    return provider.external && provider.external.id === providerId ? provider.external : null;
  } catch {
    return null;
  }
}

type LocalRequest = {
  id: string;
  tenantId: string;
  status: string;
  title: string;
  language: string;
  createdByUserId: string;
  providerRef: string | null;
  signers: Array<{ id: string; position: number; status: string; role: string }>;
};

/** Références des signataires chez le prestataire, relevées dans l'événement CREATED (par position). */
async function providerSignerRefs(request: LocalRequest): Promise<string[] | null> {
  const events = await listChainedEvents(request.tenantId, request.id);
  const created = events.find(event => event.type === 'CREATED');
  const refs = (created?.payload as { providerSignerRefs?: unknown } | null)?.providerSignerRefs;
  return Array.isArray(refs) && refs.every(ref => typeof ref === 'string') ? (refs as string[]) : null;
}

async function applySigned(request: LocalRequest, signerId: string, role: string, signedAt: Date, provider: string) {
  await prisma.$transaction(async tx => {
    const updated = await tx.signatureSigner.updateMany({
      where: { id: signerId, tenantId: request.tenantId, status: { in: [...ACTIONABLE_SIGNER_STATUSES] } },
      data: { status: 'SIGNED', signedAt, signatureMode: 'PROVIDER', otpHash: null, otpExpiresAt: null }
    });
    if (updated.count !== 1) return;
    await tx.signatureRequest.updateMany({
      where: { id: request.id, tenantId: request.tenantId, status: 'SENT' },
      data: { status: 'PARTIALLY_SIGNED' }
    });
    await appendSignatureEvent(tx, {
      tenantId: request.tenantId,
      requestId: request.id,
      signerId,
      type: 'SIGNED',
      payload: { provider, mode: 'PROVIDER' },
      now: signedAt
    });
    await recordAuditEvent(tx, {
      tenantId: request.tenantId,
      actorUserId: null,
      actorType: 'SYSTEM',
      actionKey: AuditActionKey.SIGNATURE_SIGNED,
      entityType: 'SignatureRequest',
      entityId: request.id,
      payload: { requestId: request.id, signerId, role, mode: 'PROVIDER' }
    });
  });
}

async function applyDeclined(request: LocalRequest, signerId: string, role: string, provider: string) {
  const declined = await prisma.$transaction(async tx => {
    const updated = await tx.signatureSigner.updateMany({
      where: { id: signerId, tenantId: request.tenantId, status: { in: [...ACTIONABLE_SIGNER_STATUSES] } },
      data: { status: 'DECLINED', otpHash: null, otpExpiresAt: null }
    });
    if (updated.count !== 1) return false;
    await tx.signatureRequest.updateMany({
      where: { id: request.id, tenantId: request.tenantId, status: { in: [...ACTIVE_REQUEST_STATUSES] } },
      data: { status: 'DECLINED' }
    });
    await appendSignatureEvent(tx, {
      tenantId: request.tenantId,
      requestId: request.id,
      signerId,
      type: 'DECLINED',
      payload: { provider, hasReason: false }
    });
    await recordAuditEvent(tx, {
      tenantId: request.tenantId,
      actorUserId: null,
      actorType: 'SYSTEM',
      actionKey: AuditActionKey.SIGNATURE_DECLINED,
      entityType: 'SignatureRequest',
      entityId: request.id,
      payload: { requestId: request.id, signerId, role }
    });
    return true;
  });
  if (!declined) return;
  const language = languageOf(request.language);
  await notifyIssuer({
    tenantId: request.tenantId,
    userId: request.createdByUserId,
    language: request.language,
    subject: t('Signature refusée — {{title}}', { title: request.title }, language),
    text: t(
      '{{name}} ({{role}}) a refusé de signer « {{title}} ». La demande est close.',
      { name: role, role, title: request.title },
      language
    )
  });
}

async function applyExpired(request: LocalRequest, provider: string) {
  await prisma.$transaction(async tx => {
    const updated = await tx.signatureRequest.updateMany({
      where: { id: request.id, tenantId: request.tenantId, status: { in: [...ACTIVE_REQUEST_STATUSES] } },
      data: { status: 'EXPIRED' }
    });
    if (updated.count !== 1) return;
    await appendSignatureEvent(tx, {
      tenantId: request.tenantId,
      requestId: request.id,
      type: 'EXPIRED',
      payload: { provider }
    });
    await recordAuditEvent(tx, {
      tenantId: request.tenantId,
      actorUserId: null,
      actorType: 'SYSTEM',
      actionKey: AuditActionKey.SIGNATURE_EXPIRED,
      entityType: 'SignatureRequest',
      entityId: request.id,
      payload: { requestId: request.id }
    });
  });
}

/** Réconcilie l'état local sur l'état relu chez le prestataire. */
async function reconcile(request: LocalRequest, snapshot: ExternalRequestSnapshot, provider: string): Promise<void> {
  if (!(ACTIVE_REQUEST_STATUSES as readonly string[]).includes(request.status)) return;
  const refs = await providerSignerRefs(request);
  const ordered = [...request.signers].sort((a, b) => a.position - b.position);
  for (const signer of ordered) {
    if (!(ACTIONABLE_SIGNER_STATUSES as readonly string[]).includes(signer.status)) continue;
    const ref = refs?.[signer.position];
    const remote = ref ? snapshot.signers.find(s => s.ref === ref) : snapshot.signers[signer.position];
    if (!remote) continue;
    if (remote.state === 'SIGNED') {
      await applySigned(request, signer.id, signer.role, remote.signedAt ?? new Date(), provider);
    } else if (remote.state === 'DECLINED') {
      await applyDeclined(request, signer.id, signer.role, provider);
    }
  }
  if (snapshot.state === 'EXPIRED') {
    await applyExpired(request, provider);
  } else if (snapshot.state === 'CANCELED') {
    // Annulation décidée chez le prestataire : annulation locale conditionnelle (le prestataire, idempotent, n'en fait rien).
    await cancelRequestInternal({ tenantId: request.tenantId, userId: null }, request.id, 'USER');
  } else if (snapshot.state === 'DONE') {
    const remaining = await prisma.signatureSigner.count({
      where: { tenantId: request.tenantId, requestId: request.id, status: { not: 'SIGNED' } }
    });
    if (remaining === 0) await sealRequest(request.tenantId, request.id);
  }
}

/**
 * Traite un webhook du prestataire `providerId`. Erreur de relecture chez le
 * prestataire : l'exception remonte (500), il réessaiera.
 */
export async function handleSignatureProviderWebhook(
  providerId: string,
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  ip: string | undefined
): Promise<ProviderWebhookResult> {
  const client = activeExternalClient(providerId);
  // Réponse uniforme : fournisseur inactif ou signature invalide donnent le même 401 (aucune fuite de configuration).
  if (!client) return { status: 401 };

  if (!client.verifyWebhook(rawBody, headers)) {
    logger.warn('Webhook prestataire de signature : signature absente ou invalide', { ip, provider: providerId });
    return { status: 401 };
  }
  const event = client.parseWebhook(rawBody);
  if (!event || !event.ref) return RECEIVED;

  // Seule requête sans agence : retrouver la demande par la référence du prestataire.
  const found = await prisma.signatureRequest.findFirst({
    where: { providerId: client.id, providerRef: event.ref },
    select: { id: true, tenantId: true }
  });
  if (!found) return RECEIVED;

  await runWithTenantContext({ tenantId: found.tenantId }, async () => {
    const request = await prisma.signatureRequest.findFirst({
      where: { id: found.id, tenantId: found.tenantId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        title: true,
        language: true,
        createdByUserId: true,
        providerRef: true,
        signers: { select: { id: true, position: true, status: true, role: true } }
      }
    });
    if (!request?.providerRef) return;
    const snapshot = await client.getSnapshot(request.providerRef);
    await reconcile(request, snapshot, client.id);
  });
  return RECEIVED;
}
