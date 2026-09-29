import { t } from '../../../i18n';
import { buildWorkbook, type XlsxSheetSpec } from './workbook';
import type { NetWorthExportData } from './net-worth-data';
import { assetClassLabel, exclusionReasonLabel, reliabilityLabel } from './net-worth-labels';

/**
 * Classeur Excel de la situation patrimoniale (lot 5) : synthèse, actifs,
 * dettes, actifs non comptés, historique. Repose sur `buildWorkbook`
 * (`workbook.ts`) : en-têtes gras, montants `#,##0`, vraies dates et
 * neutralisation des injections de formule sur chaque texte saisi
 * (nom d'actif, prêteur).
 */

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function summarySheet(data: NetWorthExportData): XlsxSheetSpec {
  const note = (key: string, count: number, total: number) =>
    t('{{count}} lignes sur {{total}} : {{key}} tronqué au plafond de l’export', { count, total, key });
  const notes: string[] = [];
  if (data.truncated.assets) notes.push(note(t('actifs'), data.assets.length, data.totals.assets));
  if (data.truncated.excludedAssets) {
    notes.push(note(t('actifs non comptés'), data.excludedAssets.length, data.totals.excludedAssets));
  }
  if (data.truncated.debts) notes.push(note(t('dettes'), data.debts.length, data.totals.debts));

  const rows: XlsxSheetSpec['rows'] = [
    { label: t('Valeur nette'), amount: data.netWorth, note: '' },
    { label: t('Total des actifs'), amount: data.totalAssets, note: '' },
    { label: t('Total des dettes'), amount: data.totalDebts, note: '' },
    { label: t('Date de calcul'), amount: null, note: isoDay(data.asOf) },
    { label: t('Devise'), amount: null, note: data.currency },
    {
      label: t('Part de la valeur reposant sur des valeurs peu fiables (%)'),
      amount: null,
      note: `${data.lowReliabilityShare}`
    },
    ...data.byClass.map(entry => ({
      label: `${t('Répartition')} — ${assetClassLabel(entry.assetClass)}`,
      amount: entry.value,
      note: `${entry.count} — ${entry.share} %`
    })),
    ...notes.map(text => ({ label: t('Attention'), amount: null, note: text }))
  ];
  return {
    name: t('Synthèse'),
    columns: [
      { header: t('Indicateur'), key: 'label', width: 50 },
      { header: `${t('Montant')} (${data.currency})`, key: 'amount', money: true, width: 22 },
      { header: t('Détail'), key: 'note', width: 60 }
    ],
    rows
  };
}

function assetsSheet(data: NetWorthExportData): XlsxSheetSpec {
  return {
    name: t('Actifs'),
    columns: [
      { header: t('Actif'), key: 'name', width: 40 },
      { header: t('Classe'), key: 'assetClass', width: 30 },
      { header: t('Devise'), key: 'currency', width: 10 },
      { header: t("Valeur d'origine"), key: 'originalValue', money: true, width: 18 },
      { header: `${t('Valeur')} (${data.currency})`, key: 'valueXof', money: true, width: 18 },
      { header: t('Date de valorisation'), key: 'valuatedAt', date: true, width: 20 },
      { header: t('Fiabilité'), key: 'reliability', width: 16 },
      { header: t('Valeur ancienne'), key: 'stale', width: 16 }
    ],
    rows: data.assets.map(asset => ({
      name: asset.name,
      assetClass: assetClassLabel(asset.assetClass),
      currency: asset.currency,
      originalValue: asset.originalValue,
      valueXof: asset.valueXof,
      valuatedAt: asset.valuatedAt,
      reliability: reliabilityLabel(asset.reliability),
      stale: asset.stale ? t('Oui') : t('Non')
    }))
  };
}

function debtsSheet(data: NetWorthExportData): XlsxSheetSpec {
  return {
    name: t('Dettes'),
    columns: [
      { header: t('Prêteur'), key: 'lender', width: 36 },
      { header: t('Actif adossé'), key: 'assetName', width: 36 },
      { header: t('Devise'), key: 'currency', width: 10 },
      { header: t('Capital restant dû'), key: 'remaining', money: true, width: 20 },
      { header: `${t('Valeur')} (${data.currency})`, key: 'valueXof', money: true, width: 18 },
      { header: t('Fin du prêt'), key: 'endDate', date: true, width: 16 },
      { header: t('Observation'), key: 'remark', width: 34 }
    ],
    rows: data.debts.map(debt => ({
      lender: debt.lender,
      assetName: debt.assetName ?? t('Dette personnelle'),
      currency: debt.currency,
      remaining: debt.remainingCapital,
      valueXof: debt.valueXof,
      endDate: debt.endDate,
      remark: debt.valueXof === null ? `${t('Non comptée')} : ${exclusionReasonLabel('MISSING_EXCHANGE_RATE')}` : ''
    }))
  };
}

function excludedSheet(data: NetWorthExportData): XlsxSheetSpec {
  return {
    name: t('Actifs non comptés'),
    columns: [
      { header: t('Actif'), key: 'name', width: 40 },
      { header: t('Classe'), key: 'assetClass', width: 30 },
      { header: t('Raison'), key: 'reason', width: 30 }
    ],
    rows: data.excludedAssets.map(item => ({
      name: item.name,
      assetClass: assetClassLabel(item.assetClass),
      reason: exclusionReasonLabel(item.reason)
    }))
  };
}

function historySheet(data: NetWorthExportData): XlsxSheetSpec {
  return {
    name: t('Historique de la valeur nette'),
    columns: [
      { header: t('Date'), key: 'date', width: 14 },
      { header: t('Total des actifs'), key: 'totalAssets', money: true, width: 20 },
      { header: t('Total des dettes'), key: 'totalDebts', money: true, width: 20 },
      { header: t('Valeur nette'), key: 'netWorth', money: true, width: 20 }
    ],
    rows: data.history.map(point => ({ ...point }))
  };
}

/** Construit le classeur Excel de la situation patrimoniale, en mémoire. */
export async function buildNetWorthWorkbook(data: NetWorthExportData): Promise<Buffer> {
  return buildWorkbook([
    summarySheet(data),
    assetsSheet(data),
    debtsSheet(data),
    excludedSheet(data),
    historySheet(data)
  ]);
}
