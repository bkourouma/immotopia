/**
 * Relevé de compte de tiers, imprimable — lot 1.
 *
 * Même modèle que `lib/syndics/owner-account-statement.ts` (même bibliothèque,
 * même mise en page A4 une page), mais le vocabulaire change : « montant
 * facturé » et « montant réglé », jamais « débit »/« crédit » (principe P-1
 * du PRD). Les colonnes de la base gardent ces noms ; seule la restitution,
 * ici comme dans `reports.ts`, parle la langue de la gestionnaire.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ThirdPartyMovementRecord } from './types';

export interface AccountStatementPdfPayload {
  accountLabel: string;
  currency: string;
  openingBalance: number;
  closingBalance: number;
  periodFrom?: Date;
  periodTo?: Date;
  movements: ThirdPartyMovementRecord[];
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

export async function buildAccountStatementPdf(payload: AccountStatementPdfPayload): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const { height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const left = 40;
  let y = height - 50;

  page.drawText('Releve de compte', { x: left, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 28;

  page.drawText(`Compte: ${payload.accountLabel}`, { x: left, y, size: 10, font });
  y -= 16;

  if (payload.periodFrom || payload.periodTo) {
    page.drawText(`Periode: du ${formatDate(payload.periodFrom)} au ${formatDate(payload.periodTo)}`, {
      x: left,
      y,
      size: 10,
      font
    });
    y -= 16;
  }
  y -= 8;

  page.drawText(`Solde d'ouverture: ${money(payload.openingBalance, payload.currency)}`, {
    x: left,
    y,
    size: 10,
    font: bold
  });
  y -= 16;
  page.drawText(`Solde de cloture: ${money(payload.closingBalance, payload.currency)}`, {
    x: left,
    y,
    size: 10,
    font: bold
  });
  y -= 24;

  page.drawText('Date', { x: left, y, size: 9, font: bold });
  page.drawText('Type', { x: left + 70, y, size: 9, font: bold });
  page.drawText('Libelle', { x: left + 140, y, size: 9, font: bold });
  page.drawText('Facture', { x: left + 330, y, size: 9, font: bold });
  page.drawText('Regle', { x: left + 410, y, size: 9, font: bold });
  page.drawText('Solde', { x: left + 490, y, size: 9, font: bold });
  y -= 12;

  for (const movement of payload.movements) {
    if (y < 60) {
      // Même limite qu'`owner-account-statement.ts` : une page suffit pour
      // l'aperçu imprimable, le détail complet reste consultable à l'écran.
      break;
    }
    page.drawText(formatDate(movement.movementDate), { x: left, y, size: 8, font });
    page.drawText(movement.type, { x: left + 70, y, size: 8, font });
    page.drawText(movement.label.slice(0, 38), { x: left + 140, y, size: 8, font });
    page.drawText(movement.amountBilled ? money(movement.amountBilled, payload.currency) : '-', {
      x: left + 330,
      y,
      size: 8,
      font
    });
    page.drawText(movement.amountSettled ? money(movement.amountSettled, payload.currency) : '-', {
      x: left + 410,
      y,
      size: 8,
      font
    });
    page.drawText(money(movement.balanceAfter, payload.currency), { x: left + 490, y, size: 8, font });
    y -= 12;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
