import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import { beforeEach, describe, expect, it } from 'vitest';
import { rentPeriodLabel } from '../../pages/TenantPortal/Payments';

describe('rentPeriodLabel : période du motif suggéré au locataire', () => {
  beforeEach(() => {
    // L'application fixe la langue de dayjs au démarrage (index.tsx) ; le test fait de même.
    dayjs.locale('fr');
  });

  it('transforme le format technique AAAA-MM en mois lisible', () => {
    expect(rentPeriodLabel('2026-10').toLowerCase()).toBe('octobre 2026');
    expect(rentPeriodLabel('2026-01').toLowerCase()).toBe('janvier 2026');
    expect(rentPeriodLabel(' 2026-12 ').toLowerCase()).toBe('décembre 2026');
  });

  it('laisse inchangée toute autre forme, plutôt que d’inventer une période', () => {
    expect(rentPeriodLabel('2026-13')).toBe('2026-13');
    expect(rentPeriodLabel('2026-00')).toBe('2026-00');
    expect(rentPeriodLabel('T4 2026')).toBe('T4 2026');
    expect(rentPeriodLabel('')).toBe('');
  });
});
