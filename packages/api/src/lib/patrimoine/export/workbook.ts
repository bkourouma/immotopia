import ExcelJS from 'exceljs';
import { t } from '../../../i18n';
import {
  documentStateLabel,
  documentTypeLabel,
  expenseCategoryLabel,
  loanStatusLabel,
  propertyStatusLabel,
  propertyTypeLabel,
  valuationMethodLabel,
  workProgramStatusLabel
} from './labels';
import type { PatrimoineExportData } from './data';

/**
 * Classeur Excel de l'export patrimoine — lot P3.
 *
 * Style repris de `lib/accounting-exports/service.ts` (`toXlsx`) : en-têtes
 * gras, volet figé sur la première ligne, colonnes de montant en `#,##0`.
 * Étendu ici de deux façons que `toXlsx` ne couvrait pas : des colonnes de
 * vraies dates Excel (`numFmt 'dd/mm/yyyy'`, pas une chaîne formatée), et la
 * neutralisation d'une éventuelle injection de formule sur chaque cellule
 * texte — `toXlsx` n'a jamais eu à s'en soucier, ses données venant toutes de
 * calculs internes, jamais d'un libellé de dépense ou de programme de travaux
 * saisi librement par un utilisateur.
 */

/** Un texte qui commencerait par l'un de ces caractères serait lu comme une formule par Excel/LibreOffice. */
const FORMULA_INJECTION_PATTERN = /^[=+\-@\t\r]/;

/** Préfixe d'une apostrophe — convention qu'Excel lit comme « ceci est du texte » — tout texte à risque. */
export function sanitizeXlsxText(value: string): string {
  return FORMULA_INJECTION_PATTERN.test(value) ? `'${value}` : value;
}

export type XlsxCellValue = string | number | Date | null;

export interface XlsxColumn {
  header: string;
  key: string;
  width?: number;
  money?: boolean;
  date?: boolean;
}

export interface XlsxSheetSpec {
  name: string;
  columns: XlsxColumn[];
  rows: Array<Record<string, XlsxCellValue>>;
}

/** Construit un classeur à partir de feuilles déclaratives (nom, colonnes, lignes). */
export async function buildWorkbook(sheets: XlsxSheetSpec[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ImmoTopia';

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name.slice(0, 31));
    worksheet.columns = sheet.columns.map(column => ({
      header: column.header,
      key: column.key,
      width: column.width ?? Math.min(60, Math.max(12, column.header.length + 2))
    }));
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const row of sheet.rows) {
      const values: Record<string, XlsxCellValue> = {};
      for (const column of sheet.columns) {
        const raw = row[column.key] ?? null;
        values[column.key] = typeof raw === 'string' ? sanitizeXlsxText(raw) : raw;
      }
      worksheet.addRow(values);
    }

    sheet.columns.forEach((column, index) => {
      const excelColumn = worksheet.getColumn(index + 1);
      if (column.money) excelColumn.numFmt = '#,##0';
      if (column.date) excelColumn.numFmt = 'dd/mm/yyyy';
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function synthesisSheet(data: PatrimoineExportData): XlsxSheetSpec {
  const rows: Array<Record<string, XlsxCellValue>> = [];
  if (data.overview) {
    rows.push(
      { label: t('Biens au portefeuille'), value: data.overview.totalProperties },
      { label: t("Taux d'occupation"), value: Math.round(data.overview.occupancyRate * 1000) / 10 },
      { label: t('Valeur estimée totale'), value: data.overview.totalEstimatedValue },
      { label: t('Encours de crédits'), value: data.overview.totalLoanBalance },
      { label: t("Charges de l'année"), value: data.overview.totalExpensesThisYear },
      { label: t('Loyers annuels'), value: data.overview.totalAnnualRent }
    );
  } else {
    const property = data.properties[0];
    rows.push(
      { label: t('Bien'), value: property ? `${property.internalReference} — ${property.title}` : '' },
      { label: t('Valeur estimée'), value: property?.yield.currentValue ?? 0 },
      { label: t('Loyer annuel'), value: property?.yield.annualRent ?? 0 }
    );
  }
  return {
    name: t('Synthèse'),
    columns: [
      { header: t('Indicateur'), key: 'label', width: 32 },
      { header: t('Valeur'), key: 'value', money: true }
    ],
    rows
  };
}

function propertiesSheet(data: PatrimoineExportData): XlsxSheetSpec {
  return {
    name: t('Biens'),
    columns: [
      { header: t('Référence'), key: 'ref', width: 16 },
      { header: t('Bien'), key: 'title', width: 28 },
      { header: t('Type'), key: 'type', width: 16 },
      { header: t('Statut'), key: 'status', width: 16 },
      { header: t('Adresse'), key: 'address', width: 30 },
      { header: t('Valeur estimée'), key: 'value', money: true },
      { header: t('Loyer annuel'), key: 'rent', money: true },
      { header: t('Rendement brut (%)'), key: 'gross', money: true },
      { header: t('Rendement net (%)'), key: 'net', money: true },
      { header: t('Rendement net-net (%)'), key: 'netnet', money: true },
      { header: t('Plus-value latente'), key: 'gain', money: true }
    ],
    rows: data.properties.map(property => ({
      ref: property.internalReference,
      title: property.title,
      type: propertyTypeLabel(property.propertyType),
      status: propertyStatusLabel(property.status),
      address: property.address,
      value: property.yield.currentValue,
      rent: property.yield.annualRent,
      gross: Math.round(property.yield.grossYield * 100) / 100,
      net: Math.round(property.yield.netYield * 100) / 100,
      netnet: property.yield.netNetYield !== null ? Math.round(property.yield.netNetYield * 100) / 100 : null,
      gain: property.yield.latentCapitalGain
    }))
  };
}

function valuationsSheet(data: PatrimoineExportData): XlsxSheetSpec {
  const rows: Array<Record<string, XlsxCellValue>> = [];
  for (const property of data.properties) {
    for (const valuation of property.valuations) {
      rows.push({
        ref: property.internalReference,
        title: property.title,
        date: valuation.valuatedAt,
        value: valuation.estimatedValue,
        currency: valuation.currency,
        method: valuationMethodLabel(valuation.method)
      });
    }
  }
  return {
    name: t('Valorisations'),
    columns: [
      { header: t('Référence'), key: 'ref', width: 16 },
      { header: t('Bien'), key: 'title', width: 28 },
      { header: t('Date'), key: 'date', date: true },
      { header: t('Valeur estimée'), key: 'value', money: true },
      { header: t('Devise'), key: 'currency', width: 10 },
      { header: t('Méthode'), key: 'method', width: 18 }
    ],
    rows
  };
}

function loansSheet(data: PatrimoineExportData): XlsxSheetSpec {
  const rows: Array<Record<string, XlsxCellValue>> = [];
  for (const property of data.properties) {
    for (const loan of property.loans) {
      rows.push({
        ref: property.internalReference,
        title: property.title,
        lender: loan.lender,
        capital: loan.capitalAmount,
        remaining: loan.remainingCapital,
        rate: loan.interestRate,
        monthly: loan.monthlyPayment,
        currency: loan.currency,
        start: loan.startDate,
        end: loan.endDate,
        status: loanStatusLabel(loan.status)
      });
    }
  }
  return {
    name: t('Emprunts'),
    columns: [
      { header: t('Référence'), key: 'ref', width: 16 },
      { header: t('Bien'), key: 'title', width: 28 },
      { header: t('Prêteur'), key: 'lender', width: 20 },
      { header: t('Capital initial'), key: 'capital', money: true },
      { header: t('Capital restant'), key: 'remaining', money: true },
      { header: t("Taux d'intérêt (%)"), key: 'rate', money: true },
      { header: t('Mensualité'), key: 'monthly', money: true },
      { header: t('Devise'), key: 'currency', width: 10 },
      { header: t('Date de début'), key: 'start', date: true },
      { header: t('Date de fin'), key: 'end', date: true },
      { header: t('Statut'), key: 'status', width: 14 }
    ],
    rows
  };
}

function expensesSheet(data: PatrimoineExportData): XlsxSheetSpec {
  const rows: Array<Record<string, XlsxCellValue>> = [];
  for (const property of data.properties) {
    for (const expense of property.expenses) {
      rows.push({
        ref: property.internalReference,
        title: property.title,
        category: expenseCategoryLabel(expense.category),
        label: expense.label,
        amount: expense.amount,
        currency: expense.currency,
        date: expense.paidAt,
        capitalized: expense.isCapitalized ? t('Oui') : t('Non')
      });
    }
  }
  return {
    name: t('Dépenses'),
    columns: [
      { header: t('Référence'), key: 'ref', width: 16 },
      { header: t('Bien'), key: 'title', width: 28 },
      { header: t('Catégorie'), key: 'category', width: 20 },
      { header: t('Libellé'), key: 'label', width: 28 },
      { header: t('Montant'), key: 'amount', money: true },
      { header: t('Devise'), key: 'currency', width: 10 },
      { header: t('Date de paiement'), key: 'date', date: true },
      { header: t('Capitalisée'), key: 'capitalized', width: 12 }
    ],
    rows
  };
}

function workProgramsSheet(data: PatrimoineExportData): XlsxSheetSpec {
  const rows: Array<Record<string, XlsxCellValue>> = [];
  for (const property of data.properties) {
    for (const program of property.workPrograms) {
      rows.push({
        ref: property.internalReference,
        title: property.title,
        program: program.title,
        status: workProgramStatusLabel(program.status),
        estimated: program.estimatedCost,
        actual: program.actualCost,
        currency: program.currency,
        planned: program.plannedDate,
        completed: program.completedDate
      });
    }
  }
  return {
    name: t('Travaux'),
    columns: [
      { header: t('Référence'), key: 'ref', width: 16 },
      { header: t('Bien'), key: 'title', width: 28 },
      { header: t('Programme'), key: 'program', width: 28 },
      { header: t('Statut'), key: 'status', width: 14 },
      { header: t('Coût estimé'), key: 'estimated', money: true },
      { header: t('Coût réel'), key: 'actual', money: true },
      { header: t('Devise'), key: 'currency', width: 10 },
      { header: t('Date prévue'), key: 'planned', date: true },
      { header: t('Date de complétion'), key: 'completed', date: true }
    ],
    rows
  };
}

function documentsSheet(data: PatrimoineExportData): XlsxSheetSpec {
  const rows: Array<Record<string, XlsxCellValue>> = [];
  for (const property of data.properties) {
    for (const document of property.documents) {
      rows.push({
        ref: property.internalReference,
        title: property.title,
        type: documentTypeLabel(document.type),
        label: document.label,
        expires: document.expiresAt,
        state: documentStateLabel(document.state),
        daysRemaining: document.daysRemaining
      });
    }
  }
  return {
    name: t('Documents'),
    columns: [
      { header: t('Référence'), key: 'ref', width: 16 },
      { header: t('Bien'), key: 'title', width: 28 },
      { header: t('Type'), key: 'type', width: 20 },
      { header: t('Nom du fichier'), key: 'label', width: 28 },
      { header: t("Date d'expiration"), key: 'expires', date: true },
      { header: t('État'), key: 'state', width: 14 },
      { header: t('Jours restants'), key: 'daysRemaining', width: 14 }
    ],
    rows
  };
}

/** Classeur complet de l'export patrimoine : les 7 feuilles attendues, dans cet ordre. */
export async function buildPatrimoineWorkbook(data: PatrimoineExportData): Promise<Buffer> {
  return buildWorkbook([
    synthesisSheet(data),
    propertiesSheet(data),
    valuationsSheet(data),
    loansSheet(data),
    expensesSheet(data),
    workProgramsSheet(data),
    documentsSheet(data)
  ]);
}
