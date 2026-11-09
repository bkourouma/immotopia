import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { t } from '../../i18n';
import { drawDocumentHeader, drawSignatureBlock, type DocumentBranding } from '../documents/document-branding';
import { arabicFaces, drawArabicText, type ArabicFaces } from '../documents/pdf-arabic';
import { amountToArabicWords } from './number-to-arabic-words';
import { formatAmount } from './charge-receipt-pdf';
import { frenchDay, periodText } from './charge-receipt-snapshot';
import { paymentMethodLine, type ChargeCallNoticeData } from './charge-call-notice-pdf';

const W = 595;
const H = 842;
const L = 40;
const R = 555;
const GREY = rgb(0.4, 0.4, 0.4);

// @i18n-keys
const AMOUNT_LABELS = {
  called: 'Montant appelé',
  advance: 'Avance déjà imputée',
  paid: 'Déjà réglé',
  outstanding: 'Reste à payer'
} as const;

function row(page: PDFPage, faces: ArabicFaces, label: string, value: string, y: number, strong = false) {
  drawArabicText(page, strong ? faces.bold : faces.regular, t(label, undefined, 'ar'), {
    x: R,
    y,
    size: 9,
    maxWidth: 170
  });
  drawArabicText(page, strong ? faces.bold : faces.regular, value, { x: 370, y, size: 9, maxWidth: 320 });
}

export async function renderArabicChargeCallNoticePdf(
  data: ChargeCallNoticeData,
  branding: DocumentBranding
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const faces = await arabicFaces(pdf);
  const page = pdf.addPage([W, H]);
  let y = await drawDocumentHeader(pdf, page, branding, {
    title: t("Avis d'appel de charges", undefined, 'ar'),
    subtitle: periodText(data.period)
  });
  const lot = [`${data.lot.number}${data.lot.type ? ` (${data.lot.type})` : ''}`, data.lot.label]
    .filter(Boolean)
    .join(' - ');
  // @i18n-keys
  const infoRows = [
    ['Lot', lot],
    ['Copropriétaire', data.coowner?.name ?? t('Non renseigné', undefined, 'ar')],
    ['Adresse', data.coowner?.address ?? ''],
    ['Période', periodText(data.period)],
    ["Date d'émission", frenchDay(data.issuedAt)],
    ["Date d'échéance", frenchDay(data.dueDate)]
  ];
  for (const [label, value] of infoRows) {
    if (!value) continue;
    row(page, faces, label, value, y);
    y -= 18;
  }
  y -= 10;
  const amountRows: Array<[string, string, boolean]> = [
    [AMOUNT_LABELS.called, formatAmount(data.amount, data.currency), true]
  ];
  if (data.advanceImputed > 0)
    amountRows.push([AMOUNT_LABELS.advance, `- ${formatAmount(data.advanceImputed, data.currency)}`, false]);
  if (data.paid > 0) amountRows.push([AMOUNT_LABELS.paid, `- ${formatAmount(data.paid, data.currency)}`, false]);
  amountRows.push([AMOUNT_LABELS.outstanding, formatAmount(data.outstanding, data.currency), true]);
  const boxHeight = amountRows.length * 20 + 38;
  page.drawRectangle({
    x: L,
    y: y - boxHeight + 12,
    width: R - L,
    height: boxHeight,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 0.7
  });
  for (const [label, value, strong] of amountRows) {
    row(page, faces, label, value, y, strong);
    y -= 20;
  }
  drawArabicText(
    page,
    faces.regular,
    `${t('Montant en lettres', undefined, 'ar')} : ${amountToArabicWords(data.amount, data.currency)}`,
    { x: R - 10, y: y - 2, size: 8, maxWidth: R - L - 20, color: GREY }
  );
  y -= 35;
  if (data.paymentMethods.length) {
    drawArabicText(page, faces.bold, t('Moyens de paiement', undefined, 'ar'), { x: R, y, size: 10, maxWidth: R - L });
    y -= 18;
    for (const method of data.paymentMethods.slice(0, 8)) {
      drawArabicText(page, faces.regular, paymentMethodLine(method), { x: R, y, size: 9, maxWidth: R - L });
      y -= 14;
    }
  }
  const mention = data.outstanding > 0 ? t('Reste à payer', undefined, 'ar') : t('Solde à jour', undefined, 'ar');
  drawArabicText(page, faces.regular, mention, { x: R, y: Math.max(y - 8, 250), size: 9, maxWidth: R - L });
  await drawSignatureBlock(pdf, page, branding, { x: 350, y: 150, label: t('Le syndic', undefined, 'ar') });
  pdf.setTitle(`${t("Avis d'appel de charges", undefined, 'ar')} ${data.lot.number} ${data.period.label ?? ''}`);
  pdf.setProducer('ImmoTopia');
  pdf.setCreator('ImmoTopia');
  return Buffer.from(await pdf.save());
}
