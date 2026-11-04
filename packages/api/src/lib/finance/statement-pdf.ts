/**
 * Relevé de compte de tiers, imprimable — lot 1.
 *
 * Même modèle que `lib/syndics/owner-account-statement.ts` (même bibliothèque,
 * même mise en page A4 une page), mais le vocabulaire change : « montant
 * facturé » et « montant réglé », jamais « débit »/« crédit » (principe P-1
 * du PRD). Les colonnes de la base gardent ces noms ; seule la restitution,
 * ici comme dans `reports.ts`, parle la langue de la gestionnaire.
 */

import { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { t } from '../../i18n';
import { drawDocumentHeader, fontsOf, resolveDocumentBranding, truncate } from '../documents/document-branding';
import { FOOTER_RESERVED, drawDocumentFooters, pdfLanguage } from '../documents/document-layout';
import { sanitizeForPdf } from '../documents/pdf-text';
import type { ThirdPartyMovementRecord, ThirdPartyMovementType } from './types';

export interface AccountStatementPdfPayload {
  /** Agence émettrice : son identité (nom, logo) figure dans l'en-tête. */
  tenantId: string;
  accountLabel: string;
  kind?: string;
  currency: string;
  openingBalance: number;
  closingBalance: number;
  periodFrom?: Date;
  periodTo?: Date;
  movements: ThirdPartyMovementRecord[];
  filteredTotals?: { debit: number; credit: number };
}

/**
 * Formate un montant pour le PDF, **sans passer par la locale**.
 *
 * `toLocaleString('fr-FR')` separe les milliers par une espace fine insecable
 * (U+202F). Ce caractere est hors du jeu WinAnsi, seul encodage que les
 * polices standard de `pdf-lib` savent ecrire : la generation levait donc une
 * erreur au premier montant a quatre chiffres.
 *
 * Le defaut n'a jamais ete vu parce que le test de cet endpoint simule la
 * construction du document. Il se serait declare au premier clic sur
 * « Imprimer », en production.
 *
 * On separe donc a la main, par une espace ordinaire. Un test verifie qu'aucun
 * caractere renvoye ne sort du jeu encodable.
 */
export function money(value: number, currency: string) {
  const [entier, decimales] = Math.abs(value).toFixed(2).split('.');
  const milliers = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const signe = value < 0 ? '-' : '';
  return `${signe}${milliers},${decimales} ${currency}`;
}

function formatDate(date?: Date) {
  return date ? new Date(date).toLocaleDateString('fr-FR') : '-';
}

const LEFT = 40;
const PAGE_WIDTH = 595;
/** Bord droit de la zone utile : aucune colonne ne le dépasse. */
const RIGHT = PAGE_WIDTH - 40;
/**
 * Colonnes de texte (abscisse relative à LEFT) et colonnes de montants
 * (bord droit absolu : un montant est aligné à droite, jamais tronqué).
 */
const COLUMNS = { type: 50, label: 105 } as const;
const AMOUNT_WIDTH = 96;
const AMOUNT_RIGHT = { billed: LEFT + 315, settled: LEFT + 415, balance: RIGHT } as const;
const LABEL_WIDTH = AMOUNT_RIGHT.billed - AMOUNT_WIDTH - LEFT - COLUMNS.label - 6;

function drawRightAligned(page: PDFPage, text: string, right: number, y: number, size: number, font: PDFFont) {
  const clean = sanitizeForPdf(text);
  // Un montant n'est jamais coupé : si la colonne est trop étroite, la police rapetisse.
  let fitted = size;
  while (fitted > 5 && font.widthOfTextAtSize(clean, fitted) > AMOUNT_WIDTH) fitted -= 0.5;
  const width = font.widthOfTextAtSize(clean, fitted);
  page.drawText(clean, { x: right - width, y, size: fitted, font });
}

function drawColumnHeaders(page: PDFPage, y: number, bold: PDFFont) {
  page.drawText(t('Date', undefined, pdfLanguage()), { x: LEFT, y, size: 9, font: bold });
  page.drawText(t('Type', undefined, pdfLanguage()), { x: LEFT + COLUMNS.type, y, size: 9, font: bold });
  page.drawText(t('Libellé', undefined, pdfLanguage()), { x: LEFT + COLUMNS.label, y, size: 9, font: bold });
  drawRightAligned(page, t('Facturé', undefined, pdfLanguage()), AMOUNT_RIGHT.billed, y, 9, bold);
  drawRightAligned(page, t('Réglé', undefined, pdfLanguage()), AMOUNT_RIGHT.settled, y, 9, bold);
  drawRightAligned(page, t('Solde après', undefined, pdfLanguage()), AMOUNT_RIGHT.balance, y, 9, bold);
}

/** Le vocabulaire dépend du tiers ; les codes techniques restent dans l'API. */
function movementTypeLabel(
  type: ThirdPartyMovementType,
  kind: string | undefined,
  language: ReturnType<typeof pdfLanguage>
) {
  if (type === 'INSTALLMENT') {
    if (kind === 'SUPPLIER') return t('Facture', undefined, language);
    if (kind === 'EMPLOYEE') return t('Note de salaire', undefined, language);
    if (kind === 'CONTRACTOR') return t("Situation d'avancement", undefined, language);
    if (kind === 'LANDLORD') return t('Loyer de terrain', undefined, language);
    if (kind === 'PARTNER') return t('Quote-part', undefined, language);
    return t('Loyer', undefined, language);
  }
  if (type === 'ADVANCE_RECEIVED') {
    if (kind === 'EMPLOYEE') return t('Avance versée', undefined, language);
    if (kind && kind !== 'TENANT' && kind !== 'OWNER') return t('Acompte versé', undefined, language);
    return t('Avance reçue', undefined, language);
  }
  switch (type) {
    case 'PAYMENT':
      return t('Règlement', undefined, language);
    case 'ADVANCE_APPLIED':
      return t('Avance imputée', undefined, language);
    case 'PENALTY':
      return t('Pénalité', undefined, language);
    case 'WAIVER':
      return t('Remise', undefined, language);
    case 'ADJUSTMENT':
      return t('Ajustement', undefined, language);
    case 'OPENING_BALANCE':
      return t('Solde initial', undefined, language);
    case 'VOID':
      return t('Annulation', undefined, language);
    case 'RENT_COLLECTED':
      return t('Loyer encaissé', undefined, language);
    case 'MANAGEMENT_FEE':
      return t('Honoraires de gestion', undefined, language);
    case 'MANAGEMENT_FEE_VAT':
      return t('TVA sur honoraires', undefined, language);
    case 'EXPENSE':
      return t('Dépense', undefined, language);
    case 'PAYOUT':
      return t('Reversement', undefined, language);
    case 'WITHHOLDING_TAX':
      return t('Retenue à la source', undefined, language);
    case 'DEPOSIT_RETAINED':
      return t('Dépôt de garantie conservé', undefined, language);
    default:
      return type;
  }
}

function drawMovementRow(
  page: PDFPage,
  y: number,
  font: PDFFont,
  movement: ThirdPartyMovementRecord,
  currency: string,
  kind: string | undefined,
  language: ReturnType<typeof pdfLanguage>
) {
  // Seuls les libellés sont abrégés ; les montants sont alignés à droite, entiers.
  const text = (value: string, x: number, width: number) =>
    page.drawText(truncate(value, font, 8, width), { x: LEFT + x, y, size: 8, font });
  text(formatDate(movement.movementDate), 0, COLUMNS.type - 6);
  text(movementTypeLabel(movement.type, kind, language), COLUMNS.type, COLUMNS.label - COLUMNS.type - 6);
  text(movement.label, COLUMNS.label, LABEL_WIDTH);
  const amount = (value: number | null, right: number, always = false) =>
    drawRightAligned(page, value || always ? money(value ?? 0, currency) : '-', right, y, 8, font);
  amount(movement.amountBilled, AMOUNT_RIGHT.billed);
  amount(movement.amountSettled, AMOUNT_RIGHT.settled);
  amount(movement.balanceAfter, AMOUNT_RIGHT.balance, true);
}

export async function buildAccountStatementPdf(payload: AccountStatementPdfPayload): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595, 842]);
  const { height } = page.getSize();
  const { regular: font, bold } = await fontsOf(pdfDoc);

  // En-tête standard de l'agence, sans copropriété : un relevé de tiers n'en a pas.
  const branding = await resolveDocumentBranding(payload.tenantId, null);
  const language = pdfLanguage();
  const period =
    payload.periodFrom || payload.periodTo
      ? `  -  ${t('Période : du {{from}} au {{to}}', { from: formatDate(payload.periodFrom), to: formatDate(payload.periodTo) }, language)}`
      : '';
  let y = await drawDocumentHeader(pdfDoc, page, branding, {
    title: t('Relevé de compte', undefined, language),
    subtitle: `${t('Compte', undefined, language)} : ${payload.accountLabel}${period}`
  });

  page.drawText(`${t("Solde d'ouverture", undefined, language)} : ${money(payload.openingBalance, payload.currency)}`, {
    x: LEFT,
    y,
    size: 10,
    font: bold
  });
  y -= 16;
  page.drawText(`${t('Solde de clôture', undefined, language)} : ${money(payload.closingBalance, payload.currency)}`, {
    x: LEFT,
    y,
    size: 10,
    font: bold
  });
  y -= 16;
  if (payload.filteredTotals) {
    page.drawText(t('Lignes filtrées', undefined, language), { x: LEFT, y, size: 9, font: bold });
    y -= 14;
    page.drawText(`${t('Facturé', undefined, language)} : ${money(payload.filteredTotals.debit, payload.currency)}`, {
      x: LEFT,
      y,
      size: 9,
      font
    });
    y -= 14;
    page.drawText(`${t('Réglé', undefined, language)} : ${money(payload.filteredTotals.credit, payload.currency)}`, {
      x: LEFT,
      y,
      size: 9,
      font
    });
    y -= 18;
  } else {
    y -= 8;
  }
  drawColumnHeaders(page, y, bold);
  y -= 12;

  for (const movement of payload.movements) {
    if (y < FOOTER_RESERVED + 14) {
      // Page pleine : on poursuit sur la suivante, colonnes reprises.
      page = pdfDoc.addPage([595, 842]);
      y = height - 50;
      drawColumnHeaders(page, y, bold);
      y -= 12;
    }
    drawMovementRow(page, y, font, movement, payload.currency, payload.kind, language);
    y -= 12;
  }

  await drawDocumentFooters(pdfDoc, {
    issuerName: branding.issuer.name,
    reference: payload.accountLabel
  });
  return Buffer.from(await pdfDoc.save());
}
