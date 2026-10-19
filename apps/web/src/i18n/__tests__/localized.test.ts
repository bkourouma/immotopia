import i18next from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../t';
import { localizedList, localizedRecord } from '../localized';

afterEach(async () => {
  await i18next.changeLanguage('fr');
});

describe('localizedRecord / localizedList', () => {
  it('retraduisent à chaud, sans recharger le module', async () => {
    const LABELS = localizedRecord(() => ({ A: t('Disponible'), B: t('Loué') }));
    const OPTIONS = localizedList(() => [
      { value: 'A', label: t('Disponible') },
      { value: 'B', label: t('Loué') }
    ]);

    expect(LABELS.A).toBe('Disponible');
    expect(OPTIONS[1].label).toBe('Loué');

    i18next.addResourceBundle('ar', 'app', { Disponible: 'متاح', Loué: 'مؤجر' }, true, true);
    await i18next.changeLanguage('ar');

    expect(LABELS.A).toBe('متاح');
    expect(OPTIONS.map(o => o.label)).toEqual(['متاح', 'مؤجر']);

    await i18next.changeLanguage('fr');
    expect(LABELS.B).toBe('Loué');
  });

  it("se comporte comme l'objet ou le tableau d'origine", () => {
    const LABELS = localizedRecord(() => ({ A: t('Disponible'), B: t('Loué') }));
    const LIST = localizedList(() => [t('Disponible'), t('Loué')]);

    expect(Object.keys(LABELS)).toEqual(['A', 'B']);
    expect(Object.entries(LABELS)).toEqual([
      ['A', 'Disponible'],
      ['B', 'Loué']
    ]);
    expect({ ...LABELS }).toEqual({ A: 'Disponible', B: 'Loué' });
    expect('A' in LABELS).toBe(true);
    expect(JSON.stringify(LABELS)).toBe('{"A":"Disponible","B":"Loué"}');

    expect(Array.isArray(LIST)).toBe(true);
    expect(LIST).toHaveLength(2);
    expect([...LIST]).toEqual(['Disponible', 'Loué']);
    expect(LIST.map(s => s.length)).toEqual([10, 4]);
    expect(LIST.find(s => s === 'Loué')).toBe('Loué');
    expect(JSON.stringify(LIST)).toBe('["Disponible","Loué"]');
  });
});
