import dayjs from 'dayjs';
import 'dayjs/locale/ar';
import 'dayjs/locale/fr';
import i18next from 'i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatChargePeriod } from '../../utils/charge-period';

beforeEach(() => {
  dayjs.locale('fr');
});

afterEach(async () => {
  await i18next.changeLanguage('fr');
  dayjs.locale('fr');
});

describe('formatChargePeriod', () => {
  it('déduit le mois, le trimestre, le semestre et l’année des bornes', () => {
    expect(
      formatChargePeriod({
        period: 'x',
        periodStart: '2026-10-01T00:00:00.000Z',
        periodEnd: '2026-10-31T00:00:00.000Z'
      })
    ).toBe('octobre 2026');
    expect(
      formatChargePeriod({
        period: 'x',
        periodStart: '2026-10-01T00:00:00.000Z',
        periodEnd: '2026-12-31T00:00:00.000Z'
      })
    ).toBe('T4 2026');
    expect(
      formatChargePeriod({
        period: 'x',
        periodStart: '2026-07-01T00:00:00.000Z',
        periodEnd: '2026-12-31T00:00:00.000Z'
      })
    ).toBe('S2 2026');
    expect(
      formatChargePeriod({
        period: 'x',
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-12-31T00:00:00.000Z'
      })
    ).toBe('2026');
  });

  it('se replie sur le libellé français sans dates', () => {
    expect(formatChargePeriod({ period: 'Octobre 2026' })).toBe('octobre 2026');
    expect(formatChargePeriod({ period: 'février 2026' })).toBe('février 2026');
    expect(formatChargePeriod({ period: 'Aout 2026' })).toBe('août 2026');
    expect(formatChargePeriod({ period: 'T4 2026' })).toBe('T4 2026');
    expect(formatChargePeriod({ period: 'S1 2026' })).toBe('S1 2026');
    expect(formatChargePeriod({ period: '2026' })).toBe('2026');
  });

  it('renvoie le texte inconnu tel quel', () => {
    expect(formatChargePeriod({ period: 'Appel exceptionnel' })).toBe('Appel exceptionnel');
    expect(formatChargePeriod({ period: 'Foo 2026' })).toBe('Foo 2026');
  });

  it('localise en arabe', async () => {
    i18next.addResourceBundle('ar', 'app', { 'T{{n}} {{year}}': 'الفصل {{n}} {{year}}' }, true, true);
    await i18next.changeLanguage('ar');
    dayjs.locale('ar');
    const month = formatChargePeriod({ period: 'Octobre 2026' });
    expect(month).not.toContain('Octobre');
    expect(month).toContain('2026');
    expect(formatChargePeriod({ period: 'T4 2026' })).toBe('الفصل 4 2026');
  });
});
