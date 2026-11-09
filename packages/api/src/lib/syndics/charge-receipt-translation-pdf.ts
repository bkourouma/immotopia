/** Copie de lecture en arabe : le PDF original archivé et sa signature restent intacts. */
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { t } from '../../i18n';
import {
  arabicFaces,
  drawArabicHeader,
  drawArabicNumber,
  drawArabicText,
  wrapArabicText,
  type ArabicFaces
} from '../documents/pdf-arabic';
import type { DocumentBranding } from '../documents/document-branding';
import { formatAmount } from './charge-receipt-pdf';
import { frenchDay, paymentMethodLabel, periodText, type ChargeReceiptSnapshot } from './charge-receipt-snapshot';

const W = 595;
const H = 842;
const L = 40;
const R = W - L;
const GREY = rgb(0.36, 0.39, 0.42);

function pair(page: PDFPage, faces: ArabicFaces, label: string, value: string, y: number) {
  drawArabicText(page, faces.bold, t(label, undefined, 'ar'), { x: R, y, size: 9, maxWidth: 175 });
  drawArabicText(page, faces.regular, value, { x: 370, y, size: 9, maxWidth: 325 });
}

export async function renderArabicReceiptTranslationPdf(snapshot: ChargeReceiptSnapshot): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const faces = await arabicFaces(pdf);
  const branding: DocumentBranding = {
    issuer: snapshot.issuer,
    issuerLogo: null,
    signature: null,
    stamp: null,
    syndicate: { ...snapshot.syndicate, logo: null }
  };
  const title =
    snapshot.kind === 'QUITTANCE' ? t('Quittance de charges', undefined, 'ar') : t('Reçu de paiement', undefined, 'ar');
  let page = pdf.addPage([W, H]);
  let y = drawArabicHeader(
    page,
    faces,
    branding,
    title,
    `${t('Traduction arabe', undefined, 'ar')} — ${snapshot.number}`
  );
  const next = (needed: number) => {
    if (y - needed >= 75) return;
    page = pdf.addPage([W, H]);
    y = H - 55;
    drawArabicText(page, faces.bold, `${t('Traduction arabe', undefined, 'ar')} — ${snapshot.number}`, {
      x: R,
      y,
      size: 11,
      maxWidth: R - L
    });
    y -= 30;
  };
  // @i18n-keys
  const infoRows = [
    ['Copropriété', snapshot.syndicate.name],
    ['Lot', snapshot.lot.number],
    ['Copropriétaire', snapshot.coowner?.name ?? t('Non renseigné', undefined, 'ar')],
    ['Date', frenchDay(snapshot.issuedAt)],
    ['Période', periodText(snapshot.call?.period)],
    ['Montant', formatAmount(snapshot.amount, snapshot.currency)]
  ];
  for (const [label, value] of infoRows) {
    if (!value) continue;
    pair(page, faces, label, value, y);
    y -= 18;
  }
  y -= 12;
  const detail =
    snapshot.kind === 'QUITTANCE'
      ? snapshot.settlements.map(item => ({
          label: `${frenchDay(item.paidAt)} — ${item.source === 'ADVANCE' ? t('Avance', undefined, 'ar') : t(paymentMethodLabel(item.method) ?? 'Paiement', undefined, 'ar')}${item.reference ? ` — ${item.reference}` : ''}`,
          amount: item.amount
        }))
      : snapshot.allocations.map(item => ({
          label: `${periodText(item.period)} — ${item.source === 'ADVANCE' ? t('Avance', undefined, 'ar') : t('Paiement', undefined, 'ar')}`,
          amount: item.allocated
        }));
  if (detail.length) {
    drawArabicText(page, faces.bold, t('Détails', undefined, 'ar'), { x: R, y, size: 10, maxWidth: R - L });
    y -= 21;
    for (const item of detail) {
      for (const [index, part] of wrapArabicText(faces.regular, item.label, 8, 330).entries()) {
        next(18);
        drawArabicText(page, faces.regular, part, { x: R, y, size: 8, maxWidth: 330 });
        if (index === 0)
          drawArabicNumber(page, faces.regular, formatAmount(item.amount, snapshot.currency), {
            x: 210,
            y,
            size: 8,
            maxWidth: 160
          });
        y -= 16;
      }
    }
  }
  if (snapshot.kind !== 'QUITTANCE') {
    next(46);
    pair(page, faces, 'Reste dû', formatAmount(snapshot.outstandingAfter, snapshot.currency), y);
    y -= 18;
    pair(page, faces, 'Avance', formatAmount(snapshot.advance, snapshot.currency), y);
    y -= 18;
  }
  for (const [index, sheet] of pdf.getPages().entries()) {
    sheet.drawLine({ start: { x: L, y: 42 }, end: { x: R, y: 42 }, thickness: 0.5, color: GREY });
    drawArabicText(sheet, faces.bold, t('Traduction arabe', undefined, 'ar'), {
      x: R,
      y: 27,
      size: 8,
      maxWidth: 200,
      color: GREY
    });
    drawArabicText(sheet, faces.regular, `${snapshot.number} — ${index + 1}/${pdf.getPageCount()}`, {
      x: L,
      y: 27,
      size: 8,
      maxWidth: 240,
      align: 'start',
      color: GREY
    });
  }
  pdf.setTitle(`${t('Traduction arabe', undefined, 'ar')} — ${snapshot.number}`);
  pdf.setAuthor(snapshot.issuer.name);
  return Buffer.from(await pdf.save());
}
