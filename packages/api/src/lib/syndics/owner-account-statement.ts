import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { sanitizeForPdf } from '../documents/pdf-text';
import { drawDocumentHeader, drawSignatureBlock, type DocumentBranding } from '../documents/document-branding';

type StatementTransaction = {
  transactionDate: Date;
  type: string;
  label: string;
  debit: number | null;
  credit: number | null;
  balanceAfter: number;
};

type StatementPayload = {
  syndicateName: string;
  lotNumber: string;
  ownerName: string;
  currency: string;
  openingBalance: number;
  closingBalance: number;
  transactions: StatementTransaction[];
};

function money(value: number, currency: string) {
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/**
 * Le solde d'un compte copropriétaire (et le solde après chaque mouvement)
 * suit la même convention comptable que l'écran web (`SyndicOwnerAccount.tsx`) :
 * un débit (appel de charges, pénalité) l'augmente, un crédit (paiement,
 * remise) le diminue — positif = le copropriétaire doit ce montant, négatif =
 * il a une avance. Les deux écrans étaient déjà cohérents entre eux ; ce
 * n'était que le signe brut, sans mention, qui rendait la lecture ambiguë
 * (constat de recette module 3.4). On affiche donc ici la valeur absolue avec
 * la mention explicite, plutôt que de changer la convention stockée.
 */
export function describeBalanceForPdf(value: number): { amount: number; label: string } {
  const rounded = Math.round(value * 100) / 100;
  if (rounded > 0) return { amount: rounded, label: 'Debiteur' };
  if (rounded < 0) return { amount: Math.abs(rounded), label: 'Crediteur' };
  return { amount: 0, label: 'Solde a jour' };
}

// Déplacé dans lib/documents/pdf-text.ts (lot S1) pour être partagé par
// l'en-tête commun des documents ; réexporté ici pour les appelants existants.
export { sanitizeForPdf } from '../documents/pdf-text';

/**
 * `branding` (lot S1) : identité de l'émetteur — agence mandante de la
 * copropriété, sinon l'agence — dessinée en en-tête et en bloc de signature.
 * Sans elle (appelants anciens, tests), le relevé garde son titre simple.
 */
export async function buildOwnerAccountStatementPdf(
  payload: StatementPayload,
  branding?: DocumentBranding | null
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const { height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const draw = (text: string, options: Parameters<typeof page.drawText>[1]) =>
    page.drawText(sanitizeForPdf(text), options);

  const left = 40;
  let y = height - 50;

  if (branding) {
    // L'en-tête porte déjà le nom de la copropriété et ses références.
    y = await drawDocumentHeader(pdfDoc, page, branding, { title: 'Releve de Compte Lot' });
  } else {
    draw('Releve de Compte Lot', { x: left, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
    y -= 28;
    draw(`Copropriete: ${payload.syndicateName}`, { x: left, y, size: 10, font });
    y -= 16;
  }
  draw(`Lot: ${payload.lotNumber}`, { x: left, y, size: 10, font });
  y -= 16;
  draw(`Proprietaire: ${payload.ownerName}`, { x: left, y, size: 10, font });
  y -= 24;

  const opening = describeBalanceForPdf(payload.openingBalance);
  const closing = describeBalanceForPdf(payload.closingBalance);

  draw(`Solde initial: ${money(opening.amount, payload.currency)} (${opening.label})`, {
    x: left,
    y,
    size: 10,
    font: bold
  });
  y -= 16;
  draw(`Solde final: ${money(closing.amount, payload.currency)} (${closing.label})`, {
    x: left,
    y,
    size: 10,
    font: bold
  });
  y -= 24;

  draw('Date', { x: left, y, size: 9, font: bold });
  draw('Type', { x: left + 70, y, size: 9, font: bold });
  draw('Libelle', { x: left + 140, y, size: 9, font: bold });
  draw('Debit', { x: left + 330, y, size: 9, font: bold });
  draw('Credit', { x: left + 410, y, size: 9, font: bold });
  draw('Solde', { x: left + 490, y, size: 9, font: bold });
  y -= 11;
  // Legende plutot qu'une mention repetee sur chaque ligne (la colonne est
  // trop etroite pour "12 345 FCFA (Debiteur)" a 8pt) : le signe du solde
  // courant de chaque mouvement se lit ainsi sans connaitre la convention.
  draw('(positif = le coproprietaire doit, negatif = il a une avance)', {
    x: left + 140,
    y,
    size: 7,
    font,
    color: rgb(0.4, 0.4, 0.4)
  });
  y -= 13;

  // Place réservée en bas de page au bloc de signature (cachet + signature).
  const bottomLimit = branding ? 150 : 60;
  const rows = payload.transactions.slice(0, 30);
  for (const tx of rows) {
    if (y < bottomLimit) {
      break;
    }
    draw(new Date(tx.transactionDate).toLocaleDateString('fr-FR'), { x: left, y, size: 8, font });
    draw(tx.type, { x: left + 70, y, size: 8, font });
    draw(tx.label.slice(0, 38), { x: left + 140, y, size: 8, font });
    draw(tx.debit ? money(Number(tx.debit), payload.currency) : '-', { x: left + 330, y, size: 8, font });
    draw(tx.credit ? money(Number(tx.credit), payload.currency) : '-', { x: left + 410, y, size: 8, font });
    draw(money(Number(tx.balanceAfter), payload.currency), { x: left + 490, y, size: 8, font });
    y -= 12;
  }

  if (branding) {
    await drawSignatureBlock(pdfDoc, page, branding, { x: 360, y: 125, label: 'Pour le syndic' });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
