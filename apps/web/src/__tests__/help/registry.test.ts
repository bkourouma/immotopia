import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { HelpEntry } from '../../help/types';

const e = (id: string, title: string, extra: Partial<HelpEntry> = {}): HelpEntry => ({
  id,
  kind: 'page',
  title,
  summary: `Resume ${title}`,
  ...extra
});

const data = vi.hoisted(() => ({
  fail: false,
  calls: [] as string[],
  entries: {} as Record<string, unknown[]>
}));

vi.mock('../../help/content/index', () => {
  const loader = (module: string, lang: string) => async () => {
    data.calls.push(`${module}:${lang}`);
    if (data.fail) throw new Error('boom');
    return { default: data.entries[`${module}:${lang}`] ?? [] };
  };
  return {
    HELP_MODULES: ['locatif', 'syndic'],
    helpRoutes: [
      { pattern: '/tenant/:tenantId/rental/leases/:leaseId', helpId: 'locatif.baux.detail' },
      { pattern: '/tenant/:tenantId/rental/leases/new', helpId: 'locatif.baux.nouveau' },
      { pattern: '/tenant/:tenantId/rental/leases', helpId: 'locatif.baux.liste' },
      { pattern: '/tenant/:tenantId/syndic/*', helpId: 'syndic.accueil' },
      { pattern: '/tenant/:tenantId/syndic/meetings', helpId: 'syndic.ag.liste' }
    ],
    helpLoaders: {
      locatif: { fr: loader('locatif', 'fr'), en: loader('locatif', 'en'), ar: loader('locatif', 'ar') },
      syndic: { fr: loader('syndic', 'fr'), en: loader('syndic', 'en'), ar: loader('syndic', 'ar') }
    }
  };
});

import {
  getAllHelpEntries,
  getHelpEntry,
  loadHelpModule,
  moduleOfHelpId,
  normalizeForSearch,
  peekHelpEntry,
  resetHelpRegistryForTests,
  resolvePageHelpId,
  searchHelp,
  useHelpEntry
} from '../../help/registry';

afterEach(() => {
  resetHelpRegistryForTests();
  data.fail = false;
  data.calls = [];
  data.entries = {};
});

describe('moduleOfHelpId', () => {
  it('reconnait le module ou renvoie null', () => {
    expect(moduleOfHelpId('locatif.baux.liste')).toBe('locatif');
    expect(moduleOfHelpId('inconnu.x.y')).toBeNull();
  });
});

describe('resolvePageHelpId', () => {
  it('prefere le motif le plus specifique', () => {
    expect(resolvePageHelpId('/tenant/t1/rental/leases/new')).toBe('locatif.baux.nouveau');
    expect(resolvePageHelpId('/tenant/t1/rental/leases/42')).toBe('locatif.baux.detail');
    expect(resolvePageHelpId('/tenant/t1/rental/leases')).toBe('locatif.baux.liste');
  });
  it('ignore slash final, query et hash', () => {
    expect(resolvePageHelpId('/tenant/t1/rental/leases/?a=1#x')).toBe('locatif.baux.liste');
  });
  it('un joker est moins specifique', () => {
    expect(resolvePageHelpId('/tenant/t1/syndic/meetings')).toBe('syndic.ag.liste');
    expect(resolvePageHelpId('/tenant/t1/syndic/autre')).toBe('syndic.accueil');
  });
  it('renvoie null sans route', () => {
    expect(resolvePageHelpId('/rien')).toBeNull();
  });
});

describe('chargement et repli', () => {
  it('replie sur fr entree par entree', async () => {
    data.entries['locatif:fr'] = [e('locatif.a', 'Alpha'), e('locatif.b', 'Beta')];
    data.entries['locatif:en'] = [e('locatif.a', 'Alpha EN')];
    const a = await getHelpEntry('locatif.a', 'en');
    expect(a).toMatchObject({ language: 'en', fallback: false });
    expect(a?.entry.title).toBe('Alpha EN');
    const b = await getHelpEntry('locatif.b', 'en');
    expect(b).toMatchObject({ language: 'fr', fallback: true });
    expect(await getHelpEntry('locatif.zzz', 'en')).toBeNull();
    expect(await getHelpEntry('inconnu.x', 'fr')).toBeNull();
  });

  it('charge une seule fois par module et langue', async () => {
    data.entries['locatif:fr'] = [e('locatif.a', 'Alpha')];
    await getHelpEntry('locatif.a', 'fr');
    await getHelpEntry('locatif.a', 'fr');
    expect(data.calls).toEqual(['locatif:fr']);
  });

  it("un echec d'import donne une Map vide et n'est pas mis en cache", async () => {
    data.fail = true;
    expect((await loadHelpModule('locatif', 'fr')).size).toBe(0);
    data.fail = false;
    data.entries['locatif:fr'] = [e('locatif.a', 'Alpha')];
    expect((await loadHelpModule('locatif', 'fr')).size).toBe(1);
  });

  it('peekHelpEntry : undefined, puis valeur, puis null', async () => {
    data.entries['locatif:fr'] = [e('locatif.a', 'Alpha')];
    expect(peekHelpEntry('locatif.a', 'fr')).toBeUndefined();
    await getHelpEntry('locatif.a', 'fr');
    expect(peekHelpEntry('locatif.a', 'fr')?.entry.title).toBe('Alpha');
    expect(peekHelpEntry('locatif.nope', 'fr')).toBeNull();
  });
});

describe('searchHelp', () => {
  const setup = () => {
    data.entries['locatif:fr'] = [
      e('locatif.echeance', 'Échéances de loyer', { keywords: ['retard'] }),
      e('locatif.autre', 'Autre écran', { summary: 'Parle des échéances', keywords: [] }),
      e('locatif.quittance', 'Quittances', { keywords: ['echeance'] })
    ];
    data.entries['syndic:fr'] = [e('syndic.ag', 'Assemblée générale', { faq: [{ q: 'Quorum ?', a: 'Majorité' }] })];
    data.entries['locatif:ar'] = [e('locatif.echeance', 'الإِيجَار')];
  };

  it('ignore les accents et trie par score', async () => {
    setup();
    const res = await searchHelp('echeance', 'fr');
    expect(res.map(r => r.entry.id)).toEqual(['locatif.echeance', 'locatif.quittance', 'locatif.autre']);
    expect(res[0].score).toBeGreaterThan(res[1].score);
    expect(res[1].score).toBeGreaterThan(res[2].score);
  });

  it('exige chaque mot', async () => {
    setup();
    expect((await searchHelp('assemblee quorum', 'fr')).map(r => r.entry.id)).toEqual(['syndic.ag']);
    expect(await searchHelp('assemblee inexistant', 'fr')).toEqual([]);
  });

  it('requete trop courte ou vide', async () => {
    setup();
    expect(await searchHelp('a', 'fr')).toEqual([]);
    expect(await searchHelp('   ', 'fr')).toEqual([]);
  });

  it('arabe : diacritiques et alef, repli fr signale', async () => {
    setup();
    const res = await searchHelp('ايجار', 'ar');
    expect(res.map(r => r.entry.id)).toContain('locatif.echeance');
    const all = await getAllHelpEntries('ar');
    expect(all.find(x => x.entry.id === 'syndic.ag')?.fallback).toBe(true);
    expect(all.find(x => x.entry.id === 'locatif.echeance')?.fallback).toBe(false);
  });

  it('normalizeForSearch', () => {
    expect(normalizeForSearch('  ÉCHÉANCE   Loyer ')).toBe('echeance loyer');
    expect(normalizeForSearch('أحمد')).toBe('احمد');
  });
});

describe('useHelpEntry', () => {
  it('loading puis ready', async () => {
    data.entries['locatif:fr'] = [e('locatif.a', 'Alpha')];
    const { result } = renderHook(() => useHelpEntry('locatif.a'));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.entry?.title).toBe('Alpha');
  });

  it('rendu synchrone si le cache est chaud', async () => {
    data.entries['locatif:fr'] = [e('locatif.a', 'Alpha')];
    await getHelpEntry('locatif.a', 'fr');
    const { result } = renderHook(() => useHelpEntry('locatif.a'));
    expect(result.current.status).toBe('ready');
  });

  it('missing et idle', async () => {
    const { result } = renderHook(() => useHelpEntry('locatif.absent'));
    await waitFor(() => expect(result.current.status).toBe('missing'));
    const idle = renderHook(() => useHelpEntry(null));
    expect(idle.result.current.status).toBe('idle');
  });
});
