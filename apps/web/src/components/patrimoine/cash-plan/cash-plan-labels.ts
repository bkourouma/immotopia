import type {
  CashPlanCategory,
  CashPlanExcludedReason,
  CashPlanNote,
  CashPlanSourceKey,
  CashPlanSourceKind,
  CashPlanSourceReason,
  CashPlanSourceStatusCode,
  CashPlanWarningCode
} from '../../../types/cash-plan-types';
import { t } from '../../../i18n/t';
import { activeLocale } from '../../../i18n/format';

/**
 * Libellés du plan de trésorerie. L'API renvoie des CODES ; chaque code a son
 * libellé ici (le test `cash-plan-labels.test.ts` en vérifie la couverture).
 * Des fonctions : `t()` se lit au rendu, dans la langue affichée.
 */

export function categoryLabel(category: CashPlanCategory): string {
  switch (category) {
    case 'RENT':
      return t('Loyers');
    case 'RENT_ARREARS':
      return t('Loyers en retard');
    case 'LOAN':
      return t('Emprunts');
    case 'WORKS':
      return t('Travaux');
    case 'RECURRING_EXPENSE':
      return t('Charges récurrentes');
    case 'PROPERTY_TAX':
      return t('Taxe foncière');
    default:
      return category;
  }
}

export function sourceKindLabel(kind: CashPlanSourceKind): string {
  switch (kind) {
    case 'RENTAL_INSTALLMENT':
      return t('Échéance de loyer');
    case 'LEASE_SCHEDULE':
      return t('Échéancier du bail');
    case 'LOAN':
      return t("Mensualité d'emprunt");
    case 'WORK_PROGRAM':
      return t('Programme de travaux');
    case 'PROPERTY_EXPENSE':
      return t('Dépense périodique');
    case 'TAX_ESTIMATE':
      return t('Taxe foncière estimée');
    default:
      return kind;
  }
}

export function noteLabel(note: CashPlanNote): string {
  switch (note) {
    case 'DATE_PASSED_MOVED_TO_FIRST_MONTH':
      return t('Date dépassée : ramenée au premier mois du plan');
    case 'REMAINING_AFTER_ACTUAL_COST':
      return t('Reste à payer après le coût réel déjà engagé');
    default:
      return note;
  }
}

export function sourceKeyLabel(source: CashPlanSourceKey): string {
  switch (source) {
    case 'RENT':
      return t('Loyers');
    case 'LOANS':
      return t('Emprunts');
    case 'WORKS':
      return t('Travaux');
    case 'RECURRING_EXPENSES':
      return t('Charges récurrentes');
    case 'PROPERTY_TAX':
      return t('Taxe foncière');
    default:
      return source;
  }
}

export function sourceStatusLabel(status: CashPlanSourceStatusCode): string {
  switch (status) {
    case 'INCLUDED':
      return t('Incluse');
    case 'NO_DATA':
      return t('Aucune donnée');
    case 'NOT_CONFIGURED':
      return t('Non configurée');
    case 'PARTIAL':
      return t('Partielle');
    default:
      return status;
  }
}

/** Explication d'une source absente ou partielle ; `count` = nombre de biens concernés, s'il est connu. */
export function sourceReasonLabel(reason: CashPlanSourceReason, count: number | null): string {
  const known = typeof count === 'number' && count > 0;
  switch (reason) {
    case 'NO_ACTIVE_LEASE':
      return t("Aucun bail actif ni échéance à encaisser : aucun loyer n'est prévu.");
    case 'NO_ACTIVE_LOAN':
      return t("Aucun emprunt actif : aucune mensualité n'est prévue.");
    case 'NO_PLANNED_WORK':
      return t('Aucun programme de travaux planifié ou en cours.');
    case 'NO_RECURRING_EXPENSE':
      return t(
        'Aucune dépense périodique enregistrée : seules les dépenses mensuelles, trimestrielles ou annuelles entrent dans le plan (une dépense ponctuelle est déjà passée).'
      );
    case 'TAX_DUE_DATE_NOT_SET':
      return t(
        "Date d'exigibilité de la taxe foncière non renseignée : la taxe n'entre pas dans le plan tant que le mois et le jour ne sont pas indiqués."
      );
    case 'NO_ELIGIBLE_PROPERTY':
      return t('Aucun bien retenu dans le périmètre du plan.');
    case 'TAX_NOT_ESTIMABLE':
      if (!known)
        return t('Taxe foncière non estimable pour certains biens (pays non géré, paramètres absents ou exonération).');
      return count === 1
        ? t('Taxe foncière non estimable pour {{nombre}} bien (pays non géré, paramètres absents ou exonération).', {
            nombre: count
          })
        : t('Taxe foncière non estimable pour {{nombre}} biens (pays non géré, paramètres absents ou exonération).', {
            nombre: count
          });
    case 'TAX_COVERED_BY_RECURRING_EXPENSE':
      if (!known) return t('Taxe foncière déjà couverte par une dépense périodique : pas de doublon.');
      return count === 1
        ? t('{{nombre}} bien a déjà une dépense périodique de taxe foncière : pas de doublon.', { nombre: count })
        : t('{{nombre}} biens ont déjà une dépense périodique de taxe foncière : pas de doublon.', { nombre: count });
    case 'NO_FLOW_IN_PERIOD':
      return t(
        'Des éléments existent mais aucun flux ne tombe dans la période (dates passées, éléments terminés, montant nul ou devise non gérée).'
      );
    case 'TAX_NO_DUE_DATE_IN_WINDOW':
      return t(
        "Taxe foncière : la prochaine date d'exigibilité tombe après la période affichée (ou est déjà passée ce mois-ci). Passez à 24 mois pour la voir."
      );
    default:
      return reason;
  }
}

export function excludedReasonLabel(reason: CashPlanExcludedReason): string {
  switch (reason) {
    case 'FOR_SALE':
      return t('En vente');
    case 'SOLD':
      return t('Vendu');
    case 'ARCHIVED':
      return t('Archivé');
    case 'DRAFT':
      return t('Brouillon');
    default:
      return reason;
  }
}

export function warningLabel(code: CashPlanWarningCode, count: number): string {
  switch (code) {
    case 'FOREIGN_CURRENCY_SKIPPED':
      return count === 1
        ? t("{{nombre}} montant en devise étrangère a été écarté du plan : il n'est ni converti ni additionné.", {
            nombre: count
          })
        : t(
            '{{nombre}} montants en devise étrangère ont été écartés du plan : ils ne sont ni convertis ni additionnés.',
            {
              nombre: count
            }
          );
    default:
      return code;
  }
}

/** 'YYYY-MM' → « sept. 2026 » (ou « septembre 2026 » avec `long`). */
export function formatPlanMonth(month: string, long = false): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat(activeLocale(), {
    month: long ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

/** Nom du mois (1–12) pour le choix de la date d'exigibilité. */
export function monthName(monthNumber: number): string {
  return new Intl.DateTimeFormat(activeLocale(), { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, monthNumber - 1, 1))
  );
}
