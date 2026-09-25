import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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
 * Caractères propres à WinAnsi (Windows-1252) au-delà de Latin-1 : ceux que
 * pdf-lib sait aussi encoder avec les polices standard (`Helvetica`).
 */
const WINANSI_EXTRA_CHARS = 'ŒœŠšŸŽžƒˆ˜' + '–—‘’‚“”„†‡•…‰‹›€™';
const WINANSI_SAFE_PATTERN = new RegExp(`[^\\u0000-\\u00FF${WINANSI_EXTRA_CHARS}]`, 'g');

/**
 * Nettoie un texte avant de le dessiner dans le PDF.
 *
 * La police standard `Helvetica` de pdf-lib encode en WinAnsi. Or
 * `toLocaleString('fr-FR')` (utilisé par `money()` et par le formatage des
 * dates) sépare les groupes de chiffres par une espace fine insécable
 * (U+202F, parfois U+00A0 selon l'environnement Node) : ce caractère est hors
 * de ce jeu et faisait lever `drawText` — « WinAnsi cannot encode U+202F » —
 * dès qu'un montant atteignait quatre chiffres, sur toutes les copropriétés.
 *
 * Les noms, libellés et adresses viennent de saisies libres (l'application
 * est trilingue fr/en/ar) : par prudence, tout autre caractère qui ne serait
 * pas encodable en WinAnsi est remplacé par « ? » plutôt que de faire échouer
 * la génération du relevé. Cette fonction est appliquée à chaque appel de
 * `drawText` de ce fichier via le petit wrapper `draw()` ci-dessous.
 */
function sanitizeForPdf(text: string): string {
  return text.replace(/[\u00A0\u202F]/g, ' ').replace(WINANSI_SAFE_PATTERN, '?');
}

export async function buildOwnerAccountStatementPdf(payload: StatementPayload): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const { height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const draw = (text: string, options: Parameters<typeof page.drawText>[1]) =>
    page.drawText(sanitizeForPdf(text), options);

  const left = 40;
  let y = height - 50;

  draw('Releve de Compte Lot', { x: left, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 28;

  draw(`Copropriete: ${payload.syndicateName}`, { x: left, y, size: 10, font });
  y -= 16;
  draw(`Lot: ${payload.lotNumber}`, { x: left, y, size: 10, font });
  y -= 16;
  draw(`Proprietaire: ${payload.ownerName}`, { x: left, y, size: 10, font });
  y -= 24;

  draw(`Solde initial: ${money(payload.openingBalance, payload.currency)}`, {
    x: left,
    y,
    size: 10,
    font: bold
  });
  y -= 16;
  draw(`Solde final: ${money(payload.closingBalance, payload.currency)}`, {
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
  y -= 12;

  const rows = payload.transactions.slice(0, 30);
  for (const tx of rows) {
    if (y < 60) {
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

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
