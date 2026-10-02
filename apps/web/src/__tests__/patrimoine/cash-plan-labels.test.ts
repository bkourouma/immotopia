import { describe, it, expect } from 'vitest';
import {
  CASH_PLAN_CATEGORIES,
  CASH_PLAN_EXCLUDED_REASONS,
  CASH_PLAN_NOTES,
  CASH_PLAN_SOURCE_KEYS,
  CASH_PLAN_SOURCE_KINDS,
  CASH_PLAN_SOURCE_REASONS,
  CASH_PLAN_SOURCE_STATUSES,
  CASH_PLAN_WARNING_CODES
} from '../../types/cash-plan-types';
import {
  categoryLabel,
  excludedReasonLabel,
  formatPlanMonth,
  noteLabel,
  sourceKeyLabel,
  sourceKindLabel,
  sourceReasonLabel,
  sourceStatusLabel,
  taxCoveredNoteLabel,
  warningLabel
} from '../../components/patrimoine/cash-plan/cash-plan-labels';
import { EXPENSE_RECURRENCES, expenseRecurrenceLabel } from '../../components/patrimoine/patrimoine-labels';

/** Aucun code machine du plan ne doit s'afficher tel quel : chacun a son libellé. */
function expectLabelled(codes: readonly string[], label: (code: string) => string) {
  for (const code of codes) {
    const text = label(code);
    expect(text, code).toBeTruthy();
    expect(text, code).not.toBe(code);
    expect(text, code).not.toMatch(/^[A-Z_]+$/);
  }
}

describe('libellés du plan de trésorerie', () => {
  it('couvre chaque code renvoyé par l’API', () => {
    expectLabelled(CASH_PLAN_CATEGORIES, c => categoryLabel(c as never));
    expectLabelled(CASH_PLAN_SOURCE_KINDS, c => sourceKindLabel(c as never));
    expectLabelled(CASH_PLAN_NOTES, c => noteLabel(c as never));
    expectLabelled(CASH_PLAN_SOURCE_KEYS, c => sourceKeyLabel(c as never));
    expectLabelled(CASH_PLAN_SOURCE_STATUSES, c => sourceStatusLabel(c as never));
    expectLabelled(CASH_PLAN_EXCLUDED_REASONS, c => excludedReasonLabel(c as never));
    expectLabelled(EXPENSE_RECURRENCES, c => expenseRecurrenceLabel(c as never));
  });

  it('explique chaque raison de source, avec ou sans nombre de biens', () => {
    for (const reason of CASH_PLAN_SOURCE_REASONS) {
      for (const count of [null, 1, 3]) {
        const text = sourceReasonLabel(reason, count);
        expect(text, `${reason}/${count}`).not.toBe(reason);
        expect(text).not.toMatch(/\{\{/);
      }
    }
    expect(sourceReasonLabel('TAX_DUE_DATE_NOT_SET', null)).toMatch(
      /Date d'exigibilité de la taxe foncière non renseignée/
    );
    expect(sourceReasonLabel('TAX_NOT_ESTIMABLE', 3)).toMatch(/3 biens/);
    expect(taxCoveredNoteLabel(1)).toMatch(/1 bien couvert par une charge récurrente de taxe foncière/);
    expect(taxCoveredNoteLabel(2)).toMatch(/2 biens couverts par une charge récurrente de taxe foncière/);
  });

  it('couvre chaque avertissement et formate les mois', () => {
    for (const code of CASH_PLAN_WARNING_CODES) {
      expect(warningLabel(code, 2)).not.toBe(code);
      expect(warningLabel(code, 2)).not.toMatch(/\{\{/);
    }
    expect(formatPlanMonth('2026-09', true)).toMatch(/septembre 2026/);
  });
});
