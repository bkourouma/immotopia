import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { t } from '../../i18n';
import { drawDocumentHeader, drawSignatureBlock, type DocumentBranding } from '../documents/document-branding';
import {
  arabicFaces,
  drawArabicFooters,
  drawArabicNumber,
  drawArabicText,
  type ArabicFaces
} from '../documents/pdf-arabic';
import { describeBalanceForPdf, movementTypeLabel, type StatementPayload } from './owner-account-statement';

const W = 595;
const H = 842;
const R = 555;
const L = 40;
const GREY = rgb(0.4, 0.4, 0.4);
const COL = {
  date: { right: 105, width: 65 },
  debit: { right: 185, width: 75 },
  credit: { right: 265, width: 75 },
  balance: { right: 345, width: 75 },
  type: { right: 410, width: 55 },
  label: { right: R, width: 135 }
} as const;

const amount = (value: number, currency: string) =>
  `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

function cell(
  page: PDFPage,
  faces: ArabicFaces,
  value: string,
  x: number,
  y: number,
  width: number,
  bold = false,
  size = 8,
  numeric = false
) {
  (numeric ? drawArabicNumber : drawArabicText)(page, bold ? faces.bold : faces.regular, value, {
    x,
    y,
    size,
    maxWidth: width
  });
}

function pair(
  page: PDFPage,
  faces: ArabicFaces,
  label: string,
  value: string,
  y: number,
  bold = false,
  numeric = false
) {
  cell(page, faces, label, R, y, 200, bold, 9);
  cell(page, faces, value, 340, y, 270, bold, 9, numeric);
}

function tableHeader(page: PDFPage, faces: ArabicFaces, y: number) {
  cell(page, faces, t('Libellé', undefined, 'ar'), COL.label.right, y, COL.label.width, true);
  cell(page, faces, t('Type', undefined, 'ar'), COL.type.right, y, COL.type.width, true);
  cell(page, faces, t('Solde', undefined, 'ar'), COL.balance.right, y, COL.balance.width, true);
  cell(page, faces, t('Crédit', undefined, 'ar'), COL.credit.right, y, COL.credit.width, true);
  cell(page, faces, t('Débit', undefined, 'ar'), COL.debit.right, y, COL.debit.width, true);
  cell(page, faces, t('Date', undefined, 'ar'), COL.date.right, y, COL.date.width, true);
  page.drawLine({ start: { x: L, y: y - 5 }, end: { x: R, y: y - 5 }, thickness: 0.5, color: GREY });
}

export async function renderArabicOwnerAccountStatementPdf(
  payload: StatementPayload,
  branding?: DocumentBranding | null
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const faces = await arabicFaces(pdf);
  let page = pdf.addPage([W, H]);
  let y = branding
    ? await drawDocumentHeader(pdf, page, branding, { title: t('Relevé de compte du lot', undefined, 'ar') })
    : H - 55;
  if (!branding) {
    cell(page, faces, t('Relevé de compte du lot', undefined, 'ar'), R, y, R - L, true, 15);
    y -= 28;
  }
  pair(page, faces, t('Copropriété', undefined, 'ar'), payload.syndicateName, y);
  y -= 18;
  pair(page, faces, t('Lot', undefined, 'ar'), payload.lotNumber, y);
  y -= 18;
  pair(page, faces, t('Propriétaire', undefined, 'ar'), payload.ownerName, y);
  y -= 24;
  for (const [label, value] of [
    [t('Solde initial', undefined, 'ar'), payload.openingBalance],
    [t('Solde final', undefined, 'ar'), payload.closingBalance]
  ] as Array<[string, number]>) {
    const described = describeBalanceForPdf(value);
    pair(
      page,
      faces,
      `${label} (${t(described.label, undefined, 'ar')})`,
      amount(described.amount, payload.currency),
      y,
      true,
      true
    );
    y -= 18;
  }
  y -= 12;
  tableHeader(page, faces, y);
  y -= 22;
  for (const tx of payload.transactions) {
    if (y < (branding ? 155 : 58)) {
      page = pdf.addPage([W, H]);
      y = H - 55;
      tableHeader(page, faces, y);
      y -= 22;
    }
    cell(page, faces, tx.label, COL.label.right, y, COL.label.width);
    cell(page, faces, t(movementTypeLabel(tx.type), undefined, 'ar'), COL.type.right, y, COL.type.width);
    cell(
      page,
      faces,
      amount(tx.balanceAfter, payload.currency),
      COL.balance.right,
      y,
      COL.balance.width,
      false,
      8,
      true
    );
    cell(
      page,
      faces,
      tx.credit ? amount(tx.credit, payload.currency) : '-',
      COL.credit.right,
      y,
      COL.credit.width,
      false,
      8,
      true
    );
    cell(
      page,
      faces,
      tx.debit ? amount(tx.debit, payload.currency) : '-',
      COL.debit.right,
      y,
      COL.debit.width,
      false,
      8,
      true
    );
    cell(
      page,
      faces,
      new Date(tx.transactionDate).toLocaleDateString('fr-FR'),
      COL.date.right,
      y,
      COL.date.width,
      false,
      8,
      true
    );
    y -= 15;
  }
  if (branding)
    await drawSignatureBlock(pdf, page, branding, { x: 350, y: 130, label: t('Pour le syndic', undefined, 'ar') });
  drawArabicFooters(pdf, faces, branding?.issuer.name || payload.syndicateName);
  return Buffer.from(await pdf.save());
}
