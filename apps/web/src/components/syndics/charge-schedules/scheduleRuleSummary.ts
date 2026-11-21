import dayjs from 'dayjs';
import type {
  ChargeAllocationMethod,
  ChargeScheduleAmountSource,
  ChargeScheduleFrequency
} from '../../../types/syndic-types';
import { formatMoney } from '../../primitives/MoneyValue';
import { displayCurrency } from '../../../utils/syndic-currency';
import { t } from '../../../i18n/t';

/**
 * La règle de génération d'une programmation, dite en français courant, pour que le
 * gestionnaire relise ce qu'il a réglé avant d'enregistrer. Rien n'est calculé côté
 * métier : la phrase ne fait que reformuler les champs du formulaire.
 */

export interface ScheduleRuleInput {
  frequency?: ChargeScheduleFrequency;
  issueDay?: number | null;
  dueOffsetDays?: number | null;
  amountSource?: ChargeScheduleAmountSource;
  fixedAmount?: number | null;
  allocationMethod?: ChargeAllocationMethod | null;
  currency?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

function frequencyPhrase(frequency: ChargeScheduleFrequency): string {
  switch (frequency) {
    case 'MONTHLY':
      return t('chaque mois');
    case 'QUARTERLY':
      return t('chaque trimestre');
    case 'SEMIANNUAL':
      return t('chaque semestre');
    default:
      return t('chaque année');
  }
}

function shortDate(value: string): string | null {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('DD/MM/YYYY') : null;
}

/** Phrases décrivant la règle, une par ligne ; vide tant que fréquence et jour d'émission manquent. */
export function describeScheduleRule(input: ScheduleRuleInput): string[] {
  const { frequency, issueDay } = input;
  if (!frequency || !issueDay) return [];
  const lines: string[] = [];

  const offset = Number(input.dueOffsetDays);
  const dueClause =
    Number.isFinite(offset) && input.dueOffsetDays !== null && input.dueOffsetDays !== undefined
      ? offset === 0
        ? t("l'échéance tombe le jour même de l'émission")
        : offset === 1
          ? t("l'échéance tombe 1 jour après l'émission")
          : t("l'échéance tombe {{count}} jours après l'émission", { count: offset })
      : null;
  lines.push(
    dueClause
      ? t('Un appel de charges est émis {{frequency}}, le {{day}} du premier mois de la période ; {{due}}.', {
          frequency: frequencyPhrase(frequency),
          day: issueDay,
          due: dueClause
        })
      : t('Un appel de charges est émis {{frequency}}, le {{day}} du premier mois de la période.', {
          frequency: frequencyPhrase(frequency),
          day: issueDay
        })
  );

  if (input.amountSource === 'BUDGET') {
    lines.push(t("Le montant reprend le budget approuvé de l'exercice au moment de l'émission."));
  } else if (input.amountSource === 'FIXED') {
    const method = input.allocationMethod ?? 'SHARES';
    if (method === 'BY_LOT_TYPE') {
      lines.push(t('Le montant de chaque lot vient du barème par type de lot de la copropriété.'));
    } else if (Number(input.fixedAmount) > 0) {
      const amount = formatMoney(Number(input.fixedAmount), {
        currency: displayCurrency(input.currency || 'XOF') ?? undefined
      });
      lines.push(
        method === 'EQUAL'
          ? t('Montant fixe de {{amount}} par période, divisé à parts égales entre les lots.', { amount })
          : t('Montant fixe de {{amount}} par période, réparti selon les tantièmes.', { amount })
      );
    }
  }

  const start = input.startDate ? shortDate(input.startDate) : null;
  const end = input.endDate ? shortDate(input.endDate) : null;
  if (start && end) lines.push(t('La programmation court du {{start}} au {{end}}.', { start, end }));
  else if (start) lines.push(t('La programmation démarre le {{start}}, sans date de fin.', { start }));

  return lines;
}
