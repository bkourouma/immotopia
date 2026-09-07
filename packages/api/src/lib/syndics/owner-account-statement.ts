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

export async function buildOwnerAccountStatementPdf(payload: StatementPayload): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const { height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const left = 40;
  let y = height - 50;

  page.drawText('Releve de Compte Lot', { x: left, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 28;

  page.drawText(`Copropriete: ${payload.syndicateName}`, { x: left, y, size: 10, font });
  y -= 16;
  page.drawText(`Lot: ${payload.lotNumber}`, { x: left, y, size: 10, font });
  y -= 16;
  page.drawText(`Proprietaire: ${payload.ownerName}`, { x: left, y, size: 10, font });
  y -= 24;

  page.drawText(`Solde initial: ${money(payload.openingBalance, payload.currency)}`, {
    x: left,
    y,
    size: 10,
    font: bold
  });
  y -= 16;
  page.drawText(`Solde final: ${money(payload.closingBalance, payload.currency)}`, {
    x: left,
    y,
    size: 10,
    font: bold
  });
  y -= 24;

  page.drawText('Date', { x: left, y, size: 9, font: bold });
  page.drawText('Type', { x: left + 70, y, size: 9, font: bold });
  page.drawText('Libelle', { x: left + 140, y, size: 9, font: bold });
  page.drawText('Debit', { x: left + 330, y, size: 9, font: bold });
  page.drawText('Credit', { x: left + 410, y, size: 9, font: bold });
  page.drawText('Solde', { x: left + 490, y, size: 9, font: bold });
  y -= 12;

  const rows = payload.transactions.slice(0, 30);
  for (const tx of rows) {
    if (y < 60) {
      break;
    }
    page.drawText(new Date(tx.transactionDate).toLocaleDateString('fr-FR'), { x: left, y, size: 8, font });
    page.drawText(tx.type, { x: left + 70, y, size: 8, font });
    page.drawText(tx.label.slice(0, 38), { x: left + 140, y, size: 8, font });
    page.drawText(tx.debit ? money(Number(tx.debit), payload.currency) : '-', { x: left + 330, y, size: 8, font });
    page.drawText(tx.credit ? money(Number(tx.credit), payload.currency) : '-', { x: left + 410, y, size: 8, font });
    page.drawText(money(Number(tx.balanceAfter), payload.currency), { x: left + 490, y, size: 8, font });
    y -= 12;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
