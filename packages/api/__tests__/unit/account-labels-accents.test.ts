/**
 * Régression BUG-2026-09-30-052 / 076 : aucun intitulé de compte amorcé
 * (plan d'exploitation, plan Syndic) ne doit revenir sans accents.
 */
import { OPERATIONAL_ACCOUNT_SEEDS } from '../../src/lib/finance/accounting';
import { SYNDIC_PROVIDER_ACCOUNT_SEEDS } from '../../src/lib/syndics/provider-invoice-accounting';

const SANS_ACCENT =
  /matieres|tacheron|remuneration|constatee|achetes|reparation|impots|tresorerie|creance|prestations? de|degats|resultat/i;

describe('intitulés de comptes amorcés', () => {
  it.each([
    ...OPERATIONAL_ACCOUNT_SEEDS.map(s => ['exploitation', s.accountNumber, s.accountName]),
    ...SYNDIC_PROVIDER_ACCOUNT_SEEDS.map(s => ['syndic', s.accountNumber, s.accountName])
  ])('%s %s : « %s » est accentué', (_plan, _numero, nom) => {
    expect(String(nom)).not.toMatch(SANS_ACCENT);
  });

  it('le 603 et le 624 portent leur intitulé accentué', () => {
    expect(OPERATIONAL_ACCOUNT_SEEDS.find(s => s.accountNumber === '603')?.accountName).toBe(
      'Variations des stocks de biens achetés'
    );
    expect(SYNDIC_PROVIDER_ACCOUNT_SEEDS.find(s => s.accountNumber === '624')?.accountName).toBe(
      'Entretien, réparations et maintenance'
    );
  });
});
