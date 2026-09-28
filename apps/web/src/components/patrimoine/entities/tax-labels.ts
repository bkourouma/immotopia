import type {
  BuiltStatus,
  FiscalCountry,
  FiscalOwnerKind,
  HoldingEntityForm,
  Occupancy,
  ParameterStatus,
  TaxKind,
  TaxLineCode,
  TaxOccupancySelector,
  TaxOwnerKindSelector,
  TaxPropertyKindSelector,
  TaxReason,
  TaxWarning
} from '../../../types/patrimoine-entities-types';
import { t } from '../../../i18n/t';

/**
 * Libellés traduits des codes du moteur fiscal et des entités détentrices
 * (lot P4). Chaque fonction repose sur `t()`, lu au rendu.
 */

export function legalFormLabel(form: HoldingEntityForm): string {
  switch (form) {
    case 'SCI':
      return t('SCI');
    case 'HOLDING':
      return t('Holding');
    case 'COMPANY':
      return t('Société');
    case 'INDIVIDUAL':
      return t('Personne physique');
    case 'OTHER':
      return t('Autre');
    default:
      return form;
  }
}

export function legalFormOptions(): Array<{ value: HoldingEntityForm; label: string }> {
  return (['SCI', 'HOLDING', 'COMPANY', 'INDIVIDUAL', 'OTHER'] as HoldingEntityForm[]).map(value => ({
    value,
    label: legalFormLabel(value)
  }));
}

export function fiscalCountryLabel(country: FiscalCountry): string {
  if (country === 'CI') return t("Côte d'Ivoire");
  if (country === 'ML') return t('Mali');
  return country;
}

export function fiscalCountryOptions(): Array<{ value: FiscalCountry; label: string }> {
  return (['CI', 'ML'] as FiscalCountry[]).map(value => ({ value, label: fiscalCountryLabel(value) }));
}

export function occupancyLabel(occupancy: Occupancy): string {
  switch (occupancy) {
    case 'MAIN_RESIDENCE':
      return t('Habitation principale');
    case 'OWNER_OCCUPIED':
      return t('Occupé par le propriétaire');
    case 'RENTED':
      return t('Loué');
    case 'VACANT':
      return t('Vacant');
    default:
      return occupancy;
  }
}

export function occupancyOptions(): Array<{ value: Occupancy; label: string }> {
  return (['MAIN_RESIDENCE', 'OWNER_OCCUPIED', 'RENTED', 'VACANT'] as Occupancy[]).map(value => ({
    value,
    label: occupancyLabel(value)
  }));
}

export function builtStatusLabel(status: BuiltStatus): string {
  return status === 'BUILT' ? t('Bâti') : t('Non bâti');
}

export function builtStatusOptions(): Array<{ value: BuiltStatus; label: string }> {
  return (['BUILT', 'UNBUILT'] as BuiltStatus[]).map(value => ({ value, label: builtStatusLabel(value) }));
}

export function fiscalOwnerKindLabel(kind: FiscalOwnerKind): string {
  return kind === 'INDIVIDUAL' ? t('Personne physique') : t('Personne morale');
}

export function fiscalOwnerKindOptions(): Array<{ value: FiscalOwnerKind; label: string }> {
  return (['INDIVIDUAL', 'COMPANY'] as FiscalOwnerKind[]).map(value => ({
    value,
    label: fiscalOwnerKindLabel(value)
  }));
}

/**
 * Sélecteurs de paramètres fiscaux (`'ANY'` en plus de la valeur métier) —
 * réutilisent les libellés ci-dessus, avec un texte dédié pour `'ANY'`.
 */
export function propertyKindSelectorLabel(value: TaxPropertyKindSelector): string {
  return value === 'ANY' ? t('Tous') : builtStatusLabel(value);
}

export function occupancySelectorLabel(value: TaxOccupancySelector): string {
  return value === 'ANY' ? t('Tous') : occupancyLabel(value);
}

export function ownerKindSelectorLabel(value: TaxOwnerKindSelector): string {
  return value === 'ANY' ? t('Tous') : fiscalOwnerKindLabel(value);
}

export function taxKindLabel(kind: TaxKind): string {
  return kind === 'PROPERTY_TAX' ? t('Impôt foncier') : t('Impôt sur les revenus fonciers');
}

export function taxReasonLabel(reason: TaxReason): string {
  switch (reason) {
    case 'EXEMPT':
      return t('Exonéré');
    case 'TEMPORARY_EXEMPTION':
      return t('Exonération temporaire');
    case 'NOT_APPLICABLE':
      return t('Non applicable');
    case 'NO_PARAMETERS':
      return t('Paramètres fiscaux indisponibles');
    case 'NO_BASE':
      return t('Base imposable indisponible');
    case 'UNSUPPORTED_COUNTRY':
      return t('Pays non géré par le moteur fiscal');
    default:
      return reason;
  }
}

export function taxWarningLabel(warning: TaxWarning): string {
  switch (warning) {
    case 'MISSING_RATE':
      return t('Taux manquant dans les paramètres');
    case 'RENTAL_VALUE_ESTIMATED':
      return t('Valeur locative estimée à partir de la valeur marchande');
    case 'NO_MARKET_VALUE':
      return t('Aucune valeur marchande disponible');
    case 'PARAMETERS_FALLBACK':
      return t("Paramètres d'une année antérieure, faute de valeurs pour l'année demandée");
    case 'PARAMETERS_NOT_VALIDATED':
      return t('Paramètres à valider par un conseil fiscal');
    case 'UNKNOWN_BASE_KIND':
      return t('Base de calcul inconnue');
    default:
      return warning;
  }
}

export function taxLineCodeLabel(code: TaxLineCode): string {
  switch (code) {
    case 'BASE':
      return t('Base');
    case 'ABATEMENT':
      return t('Abattement');
    case 'TAXABLE_BASE':
      return t('Base imposable');
    case 'PRINCIPAL':
      return t('Principal');
    case 'BRACKET':
      return t('Tranche');
    case 'MINIMUM':
      return t('Minimum');
    case 'SURCHARGE':
      return t('Majoration');
    case 'EXEMPTION':
      return t('Exonération');
    default:
      return code;
  }
}

export function parameterStatusLabel(status: ParameterStatus): string {
  return status === 'VALIDE' ? t('Validé') : t('À valider');
}

/**
 * Clés de paramètres connues (`p4-contrat.md` §6). Une clé absente de cette
 * table retombe sur le `label` fourni par l'API, en français.
 */
const PARAMETER_KEY_LABELS: Record<string, string> = {
  base: 'Base de calcul',
  rate: 'Taux',
  abatement_rate: "Taux d'abattement",
  base_rounding_down: 'Arrondi de la base',
  minimum_amount: 'Montant minimum',
  applicable: 'Applicable',
  exempt: 'Exonéré',
  acquisition_exemption_years: "Années d'exonération à l'acquisition",
  taxable_after_holding_years: 'Imposable après (années de détention)'
};

export function parameterKeyLabel(key: string, apiLabel: string): string {
  const known = PARAMETER_KEY_LABELS[key];
  return known ? t(known) : apiLabel;
}
