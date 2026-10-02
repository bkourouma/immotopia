import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { i18next } from '../../i18n';
import { TaxEstimateCard } from '../../components/patrimoine/entities/TaxEstimateCard';
import { parameterKeyLabel, taxLineLabel } from '../../components/patrimoine/entities/tax-labels';
import type { TaxComputation } from '../../types/patrimoine-entities-types';

/**
 * BUG-2026-10-01-011 : les libellés de lignes de l'estimation fiscale viennent
 * de l'API (colonne `label` de `tax_parameters`, ou littéral du moteur) en
 * français. Ils doivent passer par `t()` à l'affichage. Ce test installe un
 * catalogue arabe *de test* (les vrais catalogues sont intégrés à part) et
 * vérifie que ces libellés sortent traduits.
 */

const AR: Record<string, string> = {
  "Base : valeur locative (loyer de l'année N-1)": 'الأساس: القيمة الإيجارية (إيجار السنة ن-1)',
  'Base imposable': 'الوعاء الضريبي',
  'Impôt sur le patrimoine foncier bâti loué, personne morale': 'ضريبة الملكية العقارية المبنية المؤجرة، شخص معنوي',
  'Impôt sur le revenu foncier, personne morale': 'ضريبة الدخل العقاري، شخص معنوي'
};

function line(code: string, label: string) {
  return {
    code,
    label,
    base: 1000,
    rate: null,
    amount: 1000,
    parameterId: null,
    parameterKey: null,
    source: null,
    status: null
  };
}

const computation = {
  taxKind: 'PROPERTY_TAX',
  applicable: true,
  reason: null,
  parametersYear: 2026,
  parametersFallback: false,
  baseKind: 'RENTAL_VALUE',
  amountFull: 110,
  lines: [
    line('BASE', "Base : valeur locative (loyer de l'année N-1)"),
    line('TAXABLE_BASE', 'Base imposable'),
    line('PRINCIPAL', 'Impôt sur le patrimoine foncier bâti loué, personne morale')
  ],
  warnings: [],
  allParametersValidated: true
} as unknown as TaxComputation;

afterEach(async () => {
  await i18next.changeLanguage('fr');
});

describe('libellés de lignes de l estimation fiscale', () => {
  it('reste en français sans traduction', () => {
    expect(taxLineLabel('Base imposable')).toBe('Base imposable');
    expect(taxLineLabel('Libellé inconnu')).toBe('Libellé inconnu');
  });

  it('traduit les libellés de ligne en arabe', async () => {
    i18next.addResourceBundle('ar', 'app', AR, true, true);
    await i18next.changeLanguage('ar');

    render(<TaxEstimateCard computations={[computation]} fiscalYear={2026} />);

    expect(screen.getByText(AR["Base : valeur locative (loyer de l'année N-1)"])).toBeInTheDocument();
    expect(screen.getByText(AR['Impôt sur le patrimoine foncier bâti loué, personne morale'])).toBeInTheDocument();
    // « Base imposable » : code de ligne ET libellé, tous deux traduits.
    expect(screen.getAllByText(AR['Base imposable']).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Impôt sur le patrimoine foncier bâti loué, personne morale')).not.toBeInTheDocument();
  });

  it("couvre les libellés de l'écran des paramètres (repli sur le libellé API)", async () => {
    i18next.addResourceBundle('ar', 'app', AR, true, true);
    await i18next.changeLanguage('ar');
    expect(parameterKeyLabel('cle_inconnue', 'Impôt sur le revenu foncier, personne morale')).toBe(
      AR['Impôt sur le revenu foncier, personne morale']
    );
  });
});
