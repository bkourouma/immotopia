import { promises as fs } from 'fs';
import * as path from 'path';
import { env, isTest } from '../../config/env';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { getUploadsRoot } from '../../utils/project-root';
import { privateUploadPath, readPrivateUpload } from '../files/private-files';
import { resolveDocumentBranding, type DocumentBranding, type DocumentImage } from '../documents/document-branding';
import type { EmailNotificationKey } from '../../constants/email-notification-keys';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../constants/email-notification-default-templates';
import { getEmailNotificationConfig } from '../../services/email-notification-config-service';
import { emailService } from '../../services/email-service';
import { AGENCY_ISSUER_KEY, type ChargeReceiptKind } from './charge-receipt-numbering';
import { renderChargeReceiptPdf, formatAmount } from './charge-receipt-pdf';
import { frenchDay, periodText, type ChargeReceiptSnapshot } from './charge-receipt-snapshot';
import type { IssuedChargeDocument } from './charge-receipts';

/**
 * Après le commit d'un paiement ou d'une création d'appel (lot S3) : PDF des
 * reçus et quittances émis, écrit en PRIVÉ sous
 * `<uploads>/syndics/<copropriété>/quittances/<id>.pdf` (jamais servi en
 * statique : `/uploads/syndics/` est refusé par `uploadsAccessGuard`), puis
 * e-mail au copropriétaire avec le PDF joint.
 *
 * Rien ici n'annule jamais le paiement : chaque échec est journalisé, et
 * l'échec d'un e-mail est noté sur le document (`emailError`). Un PDF absent
 * du disque est reconstruit à l'identique depuis le `snapshot`.
 */

/** Clé de notification e-mail de chaque type de document (modèle modifiable et désactivable). */
export const RECEIPT_EMAIL_KEYS: Record<ChargeReceiptKind, EmailNotificationKey> = {
  RECEIPT: 'CHARGE_PAYMENT_RECEIPT',
  QUITTANCE: 'CHARGE_CALL_SETTLED'
};

export interface StoredReceipt {
  id: string;
  tenantId: string;
  syndicateId: string;
  lotId: string;
  contactId: string | null;
  kind: ChargeReceiptKind;
  number: string;
  snapshot: unknown;
  filePath: string | null;
  emailedAt: Date | null;
}

export const STORED_RECEIPT_SELECT = {
  id: true,
  tenantId: true,
  syndicateId: true,
  lotId: true,
  contactId: true,
  kind: true,
  number: true,
  snapshot: true,
  filePath: true,
  emailedAt: true
} as const;

// ---------------------------------------------------------------- identité

/** Identité courante d'une copropriété, avec la clé de son émetteur et de ses images. */
export interface SyndicateRenderContext {
  issuerKey: string;
  branding: DocumentBranding;
}

export async function loadSyndicateRenderContext(
  tenantId: string,
  syndicateId: string
): Promise<SyndicateRenderContext> {
  // Émetteur, images et clés des images viennent de la MÊME lecture.
  const branding = await resolveDocumentBranding(tenantId, syndicateId);
  return { issuerKey: branding.source?.issuerKey ?? AGENCY_ISSUER_KEY, branding };
}

/** Une image courante n'est apposée que si c'est le fichier noté à l'émission. */
function sameImage(current: string | null | undefined, frozen: string | null | undefined): boolean {
  return Boolean(current) && current === frozen;
}

/**
 * Identité à dessiner : TOUT le texte vient du snapshot. Une image de
 * l'émetteur (logo, signature, cachet) n'est apposée que si l'émetteur est
 * toujours le même ET que le fichier est celui noté à l'émission (clé de
 * stockage, régénérée à chaque dépôt). Sinon le document sort sans elle :
 * jamais une signature remplacée ou celle d'un autre émetteur sur un original.
 */
export function brandingForSnapshot(
  context: SyndicateRenderContext,
  snapshot: ChargeReceiptSnapshot
): DocumentBranding {
  const source = context.branding.source;
  const frozen = snapshot.issuerImages;
  const sameIssuer = snapshot.issuer.key === context.issuerKey && Boolean(source) && Boolean(frozen);
  const keep = (
    image: DocumentImage | null,
    current: string | null | undefined,
    original: string | null | undefined
  ) => (sameIssuer && sameImage(current, original) ? image : null);
  return {
    issuer: snapshot.issuer,
    issuerLogo: keep(context.branding.issuerLogo, source?.logoKey, frozen?.logo),
    signature: keep(context.branding.signature, source?.signatureKey, frozen?.signature),
    stamp: keep(context.branding.stamp, source?.stampKey, frozen?.stamp),
    syndicate: { ...snapshot.syndicate, logo: context.branding.syndicate?.logo ?? null }
  };
}

export function snapshotOf(receipt: Pick<StoredReceipt, 'snapshot'>): ChargeReceiptSnapshot {
  return receipt.snapshot as ChargeReceiptSnapshot;
}

// ---------------------------------------------------------------- fichiers

const receiptFolder = (syndicateId: string) => ['syndics', syndicateId, 'quittances'];

/** Identifiant de stockage (jamais renvoyé au client). */
export function receiptFileUrl(syndicateId: string, receiptId: string): string {
  return `/uploads/${receiptFolder(syndicateId).join('/')}/${receiptId}.pdf`;
}

/** Nom de téléchargement : le numéro du document. */
export function receiptDownloadName(receipt: Pick<StoredReceipt, 'kind' | 'number'>): string {
  return `${receipt.kind === 'QUITTANCE' ? 'Quittance' : 'Recu'} ${receipt.number}.pdf`;
}

async function writeReceiptFile(receipt: StoredReceipt, buffer: Buffer): Promise<string> {
  const relative = privateUploadPath(
    receiptFileUrl(receipt.syndicateId, receipt.id),
    receiptFolder(receipt.syndicateId)
  );
  if (!relative) throw new Error('Chemin de quittance invalide');
  const absolute = path.join(getUploadsRoot(env.UPLOADS_DIR), relative);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, buffer);
  return receiptFileUrl(receipt.syndicateId, receipt.id);
}

async function readStoredFile(receipt: StoredReceipt): Promise<Buffer | null> {
  const relative = privateUploadPath(receipt.filePath, receiptFolder(receipt.syndicateId));
  if (!relative) return null;
  try {
    return (await readPrivateUpload(relative, null, 'Document introuvable.')).buffer;
  } catch {
    return null;
  }
}

/**
 * Le PDF d'un document : le fichier stocké s'il existe, sinon reconstruit
 * depuis le snapshot, écrit et rattaché (`filePath`). Ne régénère jamais un
 * original avec un autre contenu : seules les données figées sont dessinées.
 */
export async function ensureReceiptPdf(receipt: StoredReceipt, context?: SyndicateRenderContext): Promise<Buffer> {
  const stored = await readStoredFile(receipt);
  if (stored) return stored;

  const renderContext = context ?? (await loadSyndicateRenderContext(receipt.tenantId, receipt.syndicateId));
  const snapshot = snapshotOf(receipt);
  const buffer = await renderChargeReceiptPdf({ snapshot, branding: brandingForSnapshot(renderContext, snapshot) });
  try {
    const fileUrl = await writeReceiptFile(receipt, buffer);
    if (receipt.filePath !== fileUrl) {
      await prisma.syndicChargeReceipt.updateMany({
        where: { id: receipt.id, tenantId: receipt.tenantId },
        data: { filePath: fileUrl }
      });
      receipt.filePath = fileUrl;
    }
  } catch (error) {
    // Le document reste servi (reconstruit à chaque demande) ; on le signale.
    logger.error('Charge receipt PDF could not be stored', { receiptId: receipt.id, error: String(error) });
  }
  return buffer;
}

// ---------------------------------------------------------------- e-mail

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => HTML_ESCAPES[char]);

/** Remplace `{{variable}}` ; les valeurs (saisies libres) sont échappées pour le HTML. */
export function applyReceiptTemplate(template: string, vars: Record<string, string>, html: boolean): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = String(vars[key] ?? '');
    return html ? escapeHtml(value) : value;
  });
}

export function receiptTemplateVars(snapshot: ChargeReceiptSnapshot): Record<string, string> {
  return {
    ownerName: snapshot.coowner?.name ?? 'Coproprietaire',
    syndicateName: snapshot.syndicate.name,
    lotLabel: snapshot.lot.label ? `${snapshot.lot.number} - ${snapshot.lot.label}` : snapshot.lot.number,
    lotNumber: snapshot.lot.number,
    number: snapshot.number,
    amount: formatAmount(snapshot.amount, snapshot.currency),
    currency: snapshot.currency,
    period: periodText(snapshot.call?.period) || '',
    paidAt: frenchDay(snapshot.payment?.paidAt ?? snapshot.settledAt ?? snapshot.issuedAt),
    outstanding: formatAmount(snapshot.outstandingAfter, snapshot.currency),
    advance: formatAmount(snapshot.advance, snapshot.currency),
    issuerName: snapshot.issuer.name
  };
}

export type ReceiptEmailErrorCode = 'SMTP_REJECTED' | 'TIMEOUT' | 'ERROR';

/** Message générique stocké et affiché ; l'erreur brute ne va qu'aux journaux. */
export const RECEIPT_EMAIL_ERROR_MESSAGES: Record<ReceiptEmailErrorCode, string> = {
  SMTP_REJECTED: "Le serveur de messagerie a refusé l'e-mail.",
  TIMEOUT: "Le serveur de messagerie n'a pas répondu à temps.",
  ERROR: "L'envoi de l'e-mail a échoué."
};

/** Classe une erreur d'envoi (nodemailer) sans en conserver le texte. */
export function classifyEmailError(error: unknown): ReceiptEmailErrorCode {
  const detail = (error ?? {}) as { code?: unknown; responseCode?: unknown };
  const code = typeof detail.code === 'string' ? detail.code : '';
  const responseCode = typeof detail.responseCode === 'number' ? detail.responseCode : 0;
  if (['ETIMEDOUT', 'ETIMEOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET', 'ECONNECTION'].includes(code)) return 'TIMEOUT';
  if (responseCode >= 500 || ['EENVELOPE', 'EMESSAGE', 'EAUTH'].includes(code)) return 'SMTP_REJECTED';
  return 'ERROR';
}

export type ReceiptEmailOutcome =
  | { sent: true }
  | { sent: false; reason: 'DISABLED' | 'NO_EMAIL' }
  | { sent: false; reason: 'ERROR'; code: ReceiptEmailErrorCode };

/**
 * Envoie le document à son copropriétaire (adresse ACTUELLE du contact),
 * selon le modèle et l'activation de l'agence (`ignoreDisabled` : renvoi
 * manuel, qui passe outre la désactivation de l'envoi automatique). Note `emailedAt` ou
 * `emailError` ; ne lève jamais.
 */
export async function sendReceiptEmail(
  receipt: StoredReceipt,
  context?: SyndicateRenderContext,
  options: { ignoreDisabled?: boolean } = {}
): Promise<ReceiptEmailOutcome> {
  const key = RECEIPT_EMAIL_KEYS[receipt.kind];
  try {
    const config = await getEmailNotificationConfig(receipt.tenantId, key);
    if (!config.enabled && !options.ignoreDisabled) return { sent: false, reason: 'DISABLED' };

    const contact = receipt.contactId
      ? await prisma.crmContact.findFirst({
          where: { id: receipt.contactId, tenantId: receipt.tenantId },
          select: { email: true }
        })
      : null;
    const to = contact?.email?.trim();
    if (!to) return { sent: false, reason: 'NO_EMAIL' };

    const pdf = await ensureReceiptPdf(receipt, context);
    const vars = receiptTemplateVars(snapshotOf(receipt));
    const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[key];
    await emailService.sendEmail({
      to,
      tenantId: receipt.tenantId,
      subject: applyReceiptTemplate(config.subjectOverride || defaults.subject, vars, false),
      html: applyReceiptTemplate(config.bodyHtmlOverride || defaults.bodyHtml, vars, true),
      attachments: [{ filename: receiptDownloadName(receipt), content: pdf, contentType: 'application/pdf' }]
    });
    await prisma.syndicChargeReceipt.updateMany({
      where: { id: receipt.id, tenantId: receipt.tenantId },
      data: { emailedAt: new Date(), emailError: null, emailErrorCode: null }
    });
    return { sent: true };
  } catch (error) {
    const code = classifyEmailError(error);
    // Le détail brut (serveur, adresse, réponse SMTP) reste dans les journaux.
    logger.warn('Charge receipt e-mail failed', {
      receiptId: receipt.id,
      key,
      code,
      error: error instanceof Error ? error.message : String(error)
    });
    await prisma.syndicChargeReceipt
      .updateMany({
        where: { id: receipt.id, tenantId: receipt.tenantId },
        data: { emailErrorCode: code, emailError: RECEIPT_EMAIL_ERROR_MESSAGES[code] }
      })
      .catch(() => undefined);
    return { sent: false, reason: 'ERROR', code };
  }
}

// ---------------------------------------------------------------- après commit

/** PDF puis e-mail de chaque document émis. Ne lève jamais. */
export async function deliverChargeDocuments(tenantId: string, documents: IssuedChargeDocument[]): Promise<void> {
  if (documents.length === 0) return;
  const contexts = new Map<string, SyndicateRenderContext>();
  for (const document of documents) {
    try {
      const receipt = (await prisma.syndicChargeReceipt.findFirst({
        where: { id: document.id, tenantId },
        select: STORED_RECEIPT_SELECT
      })) as StoredReceipt | null;
      if (!receipt) continue;
      let context = contexts.get(receipt.syndicateId);
      if (!context) {
        context = await loadSyndicateRenderContext(tenantId, receipt.syndicateId);
        contexts.set(receipt.syndicateId, context);
      }
      await ensureReceiptPdf(receipt, context);
      await sendReceiptEmail(receipt, context);
    } catch (error) {
      logger.error('Charge receipt delivery failed', { receiptId: document.id, error: String(error) });
    }
  }
}

/**
 * Lance la livraison sans faire attendre la réponse HTTP. Désactivé sous
 * Jest (`NODE_ENV=test`) : les suites qui passent par un paiement n'écrivent
 * rien sur le disque ; celles de ce lot appellent `deliverChargeDocuments`.
 */
export function scheduleChargeDocumentDelivery(tenantId: string, documents: IssuedChargeDocument[]): void {
  if (documents.length === 0 || isTest) return;
  void deliverChargeDocuments(tenantId, documents).catch(error =>
    logger.error('Charge receipt delivery crashed', { tenantId, error: String(error) })
  );
}
