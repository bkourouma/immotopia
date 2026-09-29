import type {
  ProjectionResponse,
  ProjectionScenarioKey,
  ProjectionWarning,
  SimulationOperation
} from '../../../services/patrimoine-projections-service';
import type { AssetClass } from '../../../services/patrimoine-assets-service';
import { assetClassLabel } from '../actifs/asset-classes';
import { formatAmount, serverFieldErrors } from '../actifs/asset-format';
import { t } from '../../../i18n/t';
import { activeLocale } from '../../../i18n/format';

/** Nombre maximal d'opérations d'une simulation (contrat). */
export const MAX_OPERATIONS = 50;
export const MAX_HORIZON = 30;
export const DEFAULT_HORIZON = 10;

export const SCENARIO_KEYS: readonly ProjectionScenarioKey[] = ['PRUDENT', 'CENTRAL', 'OPTIMISTIC'];

export function scenarioLabel(key: ProjectionScenarioKey | string): string {
  if (key === 'PRUDENT') return t('Prudent');
  if (key === 'CENTRAL') return t('Central');
  if (key === 'OPTIMISTIC') return t('Optimiste');
  return String(key);
}

/** Couleurs sobres des courbes ; chaque courbe a aussi un motif de trait et une légende textuelle. */
export const SCENARIO_STROKES: Record<ProjectionScenarioKey, { color: string; dash?: string }> = {
  PRUDENT: { color: '#8c8c8c', dash: '2 4' },
  CENTRAL: { color: '#1677ff' },
  OPTIMISTIC: { color: '#52c41a', dash: '8 4' }
};

export function formatPercent(value: number): string {
  return new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: 2 }).format(value);
}

/** Montant précédé de son signe (« +12 000 F CFA », « −3 000 F CFA »). */
export function formatSigned(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatAmount(Math.abs(value), 'XOF')}`;
}

/** Texte lisible d'un avertissement du contrat. `assetName` : nom connu de l'actif concerné, sinon libellé générique. */
export function warningText(warning: ProjectionWarning, assetName?: string): string {
  switch (warning.code) {
    case 'LOW_RELIABILITY_START':
      return t('{{part}} % de la valeur de départ repose sur des valeurs peu fiables.', {
        part: formatPercent(warning.sharePercent)
      });
    case 'ASSET_WITHOUT_VALUE':
      return assetName
        ? t("« {{name}} » n'a pas de valeur : il n'est pas compté dans la projection.", { name: assetName })
        : t("Un actif n'a pas de valeur : il n'est pas compté dans la projection.");
    case 'LOAN_PAYMENT_TOO_LOW':
      return t("La mensualité d'une dette ne couvre pas ses intérêts : son capital augmente.");
    case 'NEGATIVE_CASH':
      return t('La trésorerie devient négative en année {{year}}.', { year: warning.year });
    case 'OPERATION_NOT_APPLICABLE':
      return t("Une opération ne s'applique plus : l'actif ou la dette n'existe plus ou n'est plus actif.");
    default:
      return '';
  }
}

/** Avertissements de la base et de la simulation, sans doublon. */
export function collectWarnings(data: ProjectionResponse): ProjectionWarning[] {
  const seen = new Set<string>();
  const result: ProjectionWarning[] = [];
  for (const warning of [...data.base.warnings, ...(data.simulated?.warnings ?? [])]) {
    const key = JSON.stringify(warning);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(warning);
  }
  return result;
}

export type ChartRow = { year: number } & Partial<Record<ProjectionScenarioKey | 'base' | 'simulated', number>>;

/** Une ligne par année : base (ou les trois scénarios) et trajectoire simulée. */
export function buildChartRows(data: ProjectionResponse): ChartRow[] {
  const rows = new Map<number, ChartRow>();
  const put = (year: number, key: keyof ChartRow, value: number) => {
    const row = rows.get(year) ?? { year };
    (row as Record<string, number>)[key] = value;
    rows.set(year, row);
  };
  for (const point of data.base.points) put(point.year, 'base', point.netWorth);
  for (const key of SCENARIO_KEYS) {
    for (const point of data.byScenario?.[key]?.points ?? []) put(point.year, key, point.netWorth);
  }
  for (const point of data.simulated?.points ?? []) put(point.year, 'simulated', point.netWorth);
  return Array.from(rows.values()).sort((a, b) => a.year - b.year);
}

export function yearLabel(year: number): string {
  return year === 0 ? t("Aujourd'hui") : t('Année {{year}}', { year });
}

// --- Opérations ---------------------------------------------------------------

export type OperationType = SimulationOperation['type'];

export const OPERATION_TYPES: readonly OperationType[] = [
  'SELL_ASSET',
  'BUY_ASSET',
  'TAKE_LOAN',
  'PREPAY_LOAN',
  'MONTHLY_SAVING'
];

export function operationTypeLabel(type: OperationType): string {
  switch (type) {
    case 'SELL_ASSET':
      return t("Vente d'un actif");
    case 'BUY_ASSET':
      return t("Achat d'un actif");
    case 'TAKE_LOAN':
      return t('Nouvel emprunt');
    case 'PREPAY_LOAN':
      return t('Remboursement anticipé');
    case 'MONTHLY_SAVING':
      return t('Épargne mensuelle');
  }
}

export type OperationValues = Record<string, string>;

function num(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Opération construite depuis les champs du formulaire ; `null` si un champ
 * obligatoire manque ou n'est pas un nombre. Les bornes fines restent celles du serveur.
 */
export function buildOperation(type: OperationType, v: OperationValues): SimulationOperation | null {
  const year = num(v.year);
  const amount = num(v.amount);
  const optional = (key: string): number | undefined | null => {
    const parsed = num(v[key]);
    return parsed !== undefined && Number.isNaN(parsed) ? null : parsed;
  };
  const bad = (...values: Array<number | undefined>) =>
    values.some(value => value === undefined || !Number.isFinite(value));
  switch (type) {
    case 'SELL_ASSET': {
      const price = optional('salePrice');
      const fees = optional('feesPercent');
      if (!v.assetId || bad(year) || price === null || fees === null) return null;
      return {
        type,
        year: year as number,
        assetId: v.assetId,
        ...(price !== undefined ? { salePrice: price } : {}),
        ...(fees !== undefined ? { feesPercent: fees } : {})
      };
    }
    case 'BUY_ASSET': {
      const price = num(v.price);
      const growth = optional('growthPercent');
      if (!v.assetClass || !v.name?.trim() || bad(year, price) || growth === null) return null;
      return {
        type,
        year: year as number,
        assetClass: v.assetClass as AssetClass,
        name: v.name.trim(),
        price: price as number,
        ...(growth !== undefined ? { growthPercent: growth } : {})
      };
    }
    case 'TAKE_LOAN': {
      const rate = num(v.annualRatePercent);
      const term = num(v.termYears);
      if (bad(year, amount, rate, term)) return null;
      return {
        type,
        year: year as number,
        amount: amount as number,
        annualRatePercent: rate as number,
        termYears: term as number
      };
    }
    case 'PREPAY_LOAN':
      if (!v.loanId || bad(year, amount)) return null;
      return { type, year: year as number, loanId: v.loanId, amount: amount as number };
    case 'MONTHLY_SAVING': {
      const from = num(v.fromYear);
      const to = optional('toYear');
      if (bad(from, amount) || to === null) return null;
      return { type, fromYear: from as number, ...(to !== undefined ? { toYear: to } : {}), amount: amount as number };
    }
  }
}

/** Phrase décrivant une opération de la liste. */
export function operationSummary(
  op: SimulationOperation,
  names: { asset: (id: string) => string; loan: (id: string) => string }
): string {
  switch (op.type) {
    case 'SELL_ASSET':
      return t('Vente de « {{name}} » en année {{year}}', { name: names.asset(op.assetId), year: op.year });
    case 'BUY_ASSET':
      return t('Achat de « {{name}} » ({{classe}}) pour {{prix}} en année {{year}}', {
        name: op.name,
        classe: assetClassLabel(op.assetClass),
        prix: formatAmount(op.price, 'XOF'),
        year: op.year
      });
    case 'TAKE_LOAN':
      return t('Emprunt de {{montant}} à {{taux}} % sur {{duree}} ans en année {{year}}', {
        montant: formatAmount(op.amount, 'XOF'),
        taux: formatPercent(op.annualRatePercent),
        duree: op.termYears,
        year: op.year
      });
    case 'PREPAY_LOAN':
      return t('Remboursement anticipé de {{montant}} sur « {{name}} » en année {{year}}', {
        montant: formatAmount(op.amount, 'XOF'),
        name: names.loan(op.loanId),
        year: op.year
      });
    case 'MONTHLY_SAVING':
      return t("Épargne de {{montant}} par mois de l'année {{from}} à l'année {{to}}", {
        montant: formatAmount(op.amount, 'XOF'),
        from: op.fromYear,
        to: op.toYear ?? t('la fin')
      });
  }
}

export function operationFieldLabel(field: string): string {
  switch (field) {
    case 'year':
      return t('Année');
    case 'amount':
      return t('Montant');
    case 'salePrice':
      return t('Prix de vente');
    case 'feesPercent':
      return t('Frais (%)');
    case 'assetId':
      return t('Actif');
    case 'loanId':
      return t('Dette');
    case 'name':
      return t('Nom');
    case 'price':
      return t('Prix');
    case 'growthPercent':
      return t('Croissance (%)');
    case 'annualRatePercent':
      return t('Taux (%)');
    case 'termYears':
      return t('Durée (années)');
    case 'fromYear':
      return t("De l'année");
    case 'toYear':
      return t("À l'année");
    case 'assetClass':
      return t('Classe');
    default:
      return field;
  }
}

export interface OperationFieldError {
  field: string;
  message: string;
}

/**
 * Erreurs de validation du serveur (`operations.<index>.<champ>`), rangées par
 * index d'opération ; `general` reprend celles qui ne visent aucune opération.
 */
export function operationErrors(error: unknown): { byIndex: Map<number, OperationFieldError[]>; general: string[] } {
  const byIndex = new Map<number, OperationFieldError[]>();
  const general: string[] = [];
  for (const entry of serverFieldErrors(error)) {
    const [head, index, field] = entry.path;
    if (head === 'operations' && index !== undefined && /^\d+$/.test(index)) {
      const list = byIndex.get(Number(index)) ?? [];
      list.push({ field: field ?? '', message: entry.message });
      byIndex.set(Number(index), list);
    } else {
      general.push(entry.message);
    }
  }
  return { byIndex, general };
}

export { formatAmount };
