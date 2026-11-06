import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import { NotFoundError } from '../../middleware/error-middleware';
import { currentLanguage, t } from '../../i18n';
import { recordAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { prisma } from '../../utils/database';
import {
  drawDocumentHeader,
  drawSignatureBlock,
  fontsOf,
  resolveDocumentBranding,
  truncate,
  type DocumentBranding
} from '../documents/document-branding';
import { sanitizeForPdf } from '../documents/pdf-text';
import { arabicFaces, drawArabicFooters, drawArabicText, wrapArabicText } from '../documents/pdf-arabic';
import { A4, formatAmount, wrapText } from '../syndics/charge-receipt-pdf';
import { contactDisplayName, referenceOf, resolveDebtorNames } from './dto';
import { formatIbanGroups } from './iban';
import { decryptMandateIban } from './mandates';
import { RENTAL_CTX, auditScope, scopeWhere, type DirectDebitScopeCtx } from './syndic/scope';

/**
 * PDF « Autorisation de prélèvement » prérempli (spec 042, PB3-R1).
 *
 * C'est le SEUL endroit où l'IBAN complet sort du serveur : le débiteur le
 * signe et le remet à sa banque. Le document est généré à la demande, jamais
 * stocké, servi avec `Cache-Control: no-store`, et réservé à la permission de
 * gestion. Textes en français (document légal), comme les autres PDF du dépôt.
 */

export interface AuthorizationPdfData {
  reference: string;
  creditorLabel: string;
  creditorIdentifier: string | null;
  creditorBankName: string | null;
  debtorName: string | null;
  holderName: string;
  /** IBAN complet, en clair : uniquement pour ce document. */
  iban: string;
  bankCode: string;
  leaseNumber: string | null;
  propertyLabel: string | null;
  /** Copropriété (SYNDIC_LOT) : syndicat et lot débités ; nuls pour un bail. */
  syndicateName?: string | null;
  lotNumber?: string | null;
  maxAmount: number | null;
  collectionDay: number;
  currency: string;
}

const MARGIN = 40;
const CONTENT_WIDTH = A4.width - 2 * MARGIN;
const GREY = rgb(0.35, 0.35, 0.35);
const LIGHT = rgb(0.75, 0.75, 0.75);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

function drawRow(page: PDFPage, y: number, label: string, value: string, fonts: Fonts): number {
  const size = 10;
  page.drawText(sanitizeForPdf(label), { x: MARGIN, y, size, font: fonts.bold });
  page.drawText(truncate(value || ' ', fonts.regular, size, CONTENT_WIDTH - 150), {
    x: MARGIN + 150,
    y,
    size,
    font: fonts.regular
  });
  return y - size * 1.7;
}

function drawSection(page: PDFPage, y: number, title: string, fonts: Fonts): number {
  page.drawText(sanitizeForPdf(title), { x: MARGIN, y, size: 11, font: fonts.bold });
  page.drawLine({
    start: { x: MARGIN, y: y - 4 },
    end: { x: MARGIN + CONTENT_WIDTH, y: y - 4 },
    thickness: 0.6,
    color: LIGHT
  });
  return y - 20;
}

function drawParagraph(page: PDFPage, y: number, text: string, fonts: Fonts, size = 9.5): number {
  for (const line of wrapText(text, fonts.regular, size, CONTENT_WIDTH, 8)) {
    page.drawText(line, { x: MARGIN, y, size, font: fonts.regular, color: GREY });
    y -= size * 1.4;
  }
  return y - 4;
}

/** Nom du fichier téléchargé, sans caractère interdit. */
export function authorizationFileName(reference: string): string {
  return `Autorisation de prélèvement ${reference}`.replace(/[\\/:*?"<>|]+/g, '-').trim() + '.pdf';
}

/** Copie arabe créée à la demande ; l'IBAN et les montants restent en ordre LTR. */
async function renderAuthorizationArabicPdf(data: AuthorizationPdfData, branding: DocumentBranding): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setLanguage('ar');
  pdfDoc.setTitle(t('Autorisation de prélèvement {{reference}}', { reference: data.reference }));
  const page = pdfDoc.addPage([A4.width, A4.height]);
  const faces = await arabicFaces(pdfDoc);
  const right = A4.width - MARGIN;
  let y = await drawDocumentHeader(pdfDoc, page, branding, {
    title: t('AUTORISATION DE PRÉLÈVEMENT'),
    subtitle: t('Référence du mandat : {{reference}}', { reference: data.reference })
  });
  const section = (title: string) => {
    y -= 7;
    drawArabicText(page, faces.bold, title, { x: right, y, size: 11, maxWidth: CONTENT_WIDTH });
    y -= 5;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 0.6, color: LIGHT });
    y -= 20;
  };
  const row = (label: string, value: string, ltr = false) => {
    drawArabicText(page, faces.bold, label, { x: right, y, size: 9, maxWidth: 145 });
    drawArabicText(page, faces.regular, value || '—', {
      x: ltr ? MARGIN : right - 155,
      y,
      size: 9,
      maxWidth: CONTENT_WIDTH - 165,
      ...(ltr ? { align: 'start' as const } : {})
    });
    y -= 18;
  };
  section(t('Créancier (bénéficiaire du prélèvement)'));
  row(t('Nom'), data.creditorLabel);
  row(
    t("Numéro d'émetteur"),
    data.creditorIdentifier ?? t('À renseigner par le créancier'),
    Boolean(data.creditorIdentifier)
  );
  if (data.creditorBankName) row(t('Banque du créancier'), data.creditorBankName);
  section(t('Débiteur (titulaire du compte à débiter)'));
  row(t('Titulaire du compte'), data.holderName);
  if (data.debtorName && data.debtorName !== data.holderName) {
    row(data.lotNumber ? t('Copropriétaire') : t('Locataire'), data.debtorName);
  }
  row(t('IBAN'), formatIbanGroups(data.iban), true);
  row(t('Code banque'), data.bankCode, true);
  section(t('Conditions du prélèvement'));
  if (data.leaseNumber) row(t('Bail'), data.leaseNumber, true);
  if (data.propertyLabel) row(t('Bien loué'), data.propertyLabel);
  if (data.syndicateName) row(t('Copropriété'), data.syndicateName);
  if (data.lotNumber) row(t('Lot'), data.lotNumber, true);
  row(t('Jour de prélèvement'), t('Le {{day}} de chaque mois', { day: data.collectionDay }));
  row(
    t('Montant maximal'),
    data.maxAmount === null ? t('Sans plafond') : formatAmount(data.maxAmount, data.currency),
    data.maxAmount !== null
  );

  const paragraphs = [
    t(
      "En signant ce formulaire, j'autorise {{creditor}} à envoyer des instructions à ma banque pour débiter mon compte, et ma banque à débiter mon compte conformément à ces instructions, au titre {{purpose}}. Je peux révoquer cette autorisation à tout moment en prévenant le créancier et ma banque par écrit. Je serai prévenu avant chaque prélèvement.",
      {
        creditor: data.creditorLabel,
        purpose: data.lotNumber
          ? t('des appels de charges de copropriété de ce lot')
          : t('du loyer et des charges de mon bail')
      }
    ),
    t(
      'Ce document est à signer, à remettre au créancier et à déposer auprès de la banque du débiteur. Il contient des coordonnées bancaires : ne le laissez pas à la portée de tiers.'
    )
  ];
  for (const paragraph of paragraphs) {
    for (const line of wrapArabicText(faces.regular, paragraph, 8.5, CONTENT_WIDTH)) {
      drawArabicText(page, faces.regular, line, { x: right, y, size: 8.5, maxWidth: CONTENT_WIDTH });
      y -= 13;
    }
    y -= 5;
  }
  const top = Math.min(y - 10, 225);
  const boxWidth = (CONTENT_WIDTH - 20) / 2;
  page.drawRectangle({
    x: right - boxWidth,
    y: top - 86,
    width: boxWidth,
    height: 80,
    borderColor: LIGHT,
    borderWidth: 0.75
  });
  drawArabicText(page, faces.bold, t('Fait à ____________________, le ____ / ____ / ________'), {
    x: right,
    y: top + 8,
    size: 8.5,
    maxWidth: boxWidth + 20
  });
  drawArabicText(page, faces.bold, t('Signature du titulaire du compte'), {
    x: right - 8,
    y: top - 22,
    size: 8.5,
    maxWidth: boxWidth - 16
  });
  drawArabicText(page, faces.regular, t('(précédée de « Bon pour autorisation »)'), {
    x: right - 8,
    y: top - 36,
    size: 8,
    maxWidth: boxWidth - 16
  });
  await drawSignatureBlock(pdfDoc, page, branding, { x: MARGIN, y: top, label: t('Le créancier') });
  drawArabicFooters(pdfDoc, faces, branding.issuer.name);
  return Buffer.from(await pdfDoc.save());
}

/** Rend l'autorisation (une page A4). */
export async function renderAuthorizationPdf(data: AuthorizationPdfData, branding: DocumentBranding): Promise<Buffer> {
  if (currentLanguage() === 'ar') return renderAuthorizationArabicPdf(data, branding);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A4.width, A4.height]);
  const fonts = await fontsOf(pdfDoc);

  let y = await drawDocumentHeader(pdfDoc, page, branding, {
    title: 'AUTORISATION DE PRÉLÈVEMENT',
    subtitle: `Référence du mandat : ${data.reference}`
  });
  y -= 6;

  y = drawSection(page, y, 'Créancier (bénéficiaire du prélèvement)', fonts);
  y = drawRow(page, y, 'Nom', data.creditorLabel, fonts);
  y = drawRow(page, y, "Numéro d'émetteur", data.creditorIdentifier ?? 'À renseigner par le créancier', fonts);
  if (data.creditorBankName) y = drawRow(page, y, 'Banque du créancier', data.creditorBankName, fonts);
  y -= 6;

  y = drawSection(page, y, 'Débiteur (titulaire du compte à débiter)', fonts);
  y = drawRow(page, y, 'Titulaire du compte', data.holderName, fonts);
  if (data.debtorName && data.debtorName !== data.holderName) {
    y = drawRow(page, y, data.lotNumber ? 'Copropriétaire' : 'Locataire', data.debtorName, fonts);
  }
  y = drawRow(page, y, 'IBAN', formatIbanGroups(data.iban), fonts);
  y = drawRow(page, y, 'Code banque', data.bankCode, fonts);
  y -= 6;

  y = drawSection(page, y, 'Conditions du prélèvement', fonts);
  if (data.leaseNumber) y = drawRow(page, y, 'Bail', data.leaseNumber, fonts);
  if (data.propertyLabel) y = drawRow(page, y, 'Bien loué', data.propertyLabel, fonts);
  if (data.syndicateName) y = drawRow(page, y, 'Copropriété', data.syndicateName, fonts);
  if (data.lotNumber) y = drawRow(page, y, 'Lot', data.lotNumber, fonts);
  y = drawRow(page, y, 'Jour de prélèvement', `Le ${data.collectionDay} de chaque mois`, fonts);
  y = drawRow(
    page,
    y,
    'Montant maximal',
    data.maxAmount === null ? 'Sans plafond' : formatAmount(data.maxAmount, data.currency),
    fonts
  );
  y -= 6;

  y = drawParagraph(
    page,
    y,
    `En signant ce formulaire, j'autorise ${data.creditorLabel} à envoyer des instructions à ma banque pour débiter mon compte, et ma banque à débiter mon compte conformément à ces instructions, au titre ${data.lotNumber ? 'des appels de charges de copropriété de ce lot' : 'du loyer et des charges de mon bail'}. Je peux révoquer cette autorisation à tout moment en prévenant le créancier et ma banque par écrit. Je serai prévenu avant chaque prélèvement.`,
    fonts
  );
  y = drawParagraph(
    page,
    y,
    'Ce document est à signer, à remettre au créancier et à déposer auprès de la banque du débiteur. Il contient des coordonnées bancaires : ne le laissez pas à la portée de tiers.',
    fonts,
    8.5
  );

  // Date et signature du débiteur (cases à remplir à la main).
  const boxTop = Math.min(y - 14, 260);
  const boxHeight = 84;
  const boxWidth = (CONTENT_WIDTH - 20) / 2;
  page.drawText('Fait à ____________________, le ____ / ____ / ________', {
    x: MARGIN,
    y: boxTop + 8,
    size: 9.5,
    font: fonts.regular
  });
  page.drawRectangle({
    x: MARGIN,
    y: boxTop - boxHeight - 6,
    width: boxWidth,
    height: boxHeight,
    borderColor: LIGHT,
    borderWidth: 0.75
  });
  page.drawText(sanitizeForPdf('Signature du titulaire du compte'), {
    x: MARGIN + 8,
    y: boxTop - 20,
    size: 8.5,
    font: fonts.bold
  });
  page.drawText(sanitizeForPdf('(précédée de « Bon pour autorisation »)'), {
    x: MARGIN + 8,
    y: boxTop - 32,
    size: 8,
    font: fonts.regular,
    color: GREY
  });

  await drawSignatureBlock(pdfDoc, page, branding, {
    x: MARGIN + boxWidth + 20,
    y: boxTop,
    label: 'Le créancier'
  });

  const title = sanitizeForPdf(`Autorisation de prélèvement ${data.reference}`);
  pdfDoc.setTitle(title);
  pdfDoc.setProducer('ImmoTopia');
  pdfDoc.setCreator('ImmoTopia');
  return Buffer.from(await pdfDoc.save());
}

/**
 * Charge le mandat de l'agence, déchiffre l'IBAN, rend le PDF et trace le
 * téléchargement (sans IBAN dans la charge utile).
 */
export async function generateAuthorizationPdf(
  tenantId: string,
  mandateId: string,
  actorUserId?: string | null,
  ctx: DirectDebitScopeCtx = RENTAL_CTX
): Promise<{ buffer: Buffer; fileName: string }> {
  const row = await prisma.directDebitMandate.findFirst({
    where: { id: mandateId, tenantId, ...scopeWhere(ctx) },
    select: {
      id: true,
      year: true,
      sequence: true,
      ibanEncrypted: true,
      ibanBankCode: true,
      ibanLast4: true,
      holderName: true,
      maxAmount: true,
      collectionDay: true,
      creditor: {
        select: {
          label: true,
          creditorIdentifier: true,
          collectionDay: true,
          bankName: true,
          treasuryAccount: { select: { bankName: true } }
        }
      },
      debtor: { select: { id: true, details: true, user: { select: { fullName: true } } } },
      lease: { select: { lease_number: true, currency: true, property: { select: { title: true, address: true } } } },
      debtorContact: { select: { contactType: true, firstName: true, lastName: true, legalName: true } },
      syndicate: { select: { name: true } },
      lot: { select: { lotNumber: true } }
    }
  });
  if (!row) throw new NotFoundError(t('Mandat introuvable.'));

  const iban = decryptMandateIban(row.ibanEncrypted);
  const names = await resolveDebtorNames(prisma, tenantId, [row.debtor]);
  const reference = referenceOf(row.year, row.sequence);
  const branding = await resolveDocumentBranding(tenantId, null);

  const property = row.lease?.property;
  const buffer = await renderAuthorizationPdf(
    {
      reference,
      creditorLabel: row.creditor.label,
      creditorIdentifier: row.creditor.creditorIdentifier ?? null,
      creditorBankName: row.creditor.treasuryAccount?.bankName ?? row.creditor.bankName ?? null,
      debtorName: row.debtor
        ? (names.get(row.debtor.id) ?? null)
        : row.debtorContact
          ? contactDisplayName(row.debtorContact)
          : null,
      holderName: row.holderName,
      iban,
      bankCode: row.ibanBankCode,
      leaseNumber: row.lease?.lease_number ?? null,
      propertyLabel: property ? [property.title, property.address].filter(Boolean).join(' - ') : null,
      syndicateName: row.syndicate?.name ?? null,
      lotNumber: row.lot?.lotNumber ?? null,
      maxAmount: row.maxAmount === null ? null : Number(row.maxAmount),
      collectionDay: row.collectionDay ?? row.creditor.collectionDay,
      currency: row.lease?.currency ?? 'FCFA'
    },
    branding
  );

  // Trace écrite AVANT l'envoi (le PDF porte l'IBAN complet) : un échec d'écriture bloque l'envoi.
  await recordAuditEvent(prisma, {
    actorUserId: actorUserId ?? null,
    tenantId,
    actionKey: AuditActionKey.DIRECT_DEBIT_MANDATE_AUTHORIZATION_DOWNLOADED,
    entityType: 'DirectDebitMandate',
    entityId: mandateId,
    payload: { ...auditScope(ctx), reference, bankCode: row.ibanBankCode, last4Digits: row.ibanLast4 }
  });
  return { buffer, fileName: authorizationFileName(reference) };
}
