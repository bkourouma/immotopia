import { describe, expect, it } from 'vitest';
import {
  filterItems,
  isActiveValue,
  matchesAnyOf,
  matchesBoolean,
  matchesDateRange,
  matchesEquals,
  matchesNumberRange,
  matchesText
} from '../../utils/list-search/filter';
import type { LocalFilterConfig } from '../../utils/list-search/filter';
import { normalizeText } from '../../utils/list-search/normalize';
import { paginate } from '../../utils/list-search/paginate';
import type { SearchCriterion, SearchValues } from '../../utils/list-search/types';

interface Locataire {
  id: number;
  nom: string;
  ville: string;
  statut: string;
  tags: string[];
  loyer: number;
  entree: string | null;
  actif: boolean;
}

const locataires: Locataire[] = [
  {
    id: 1,
    nom: 'Élodie Kouassi',
    ville: 'Abidjan',
    statut: 'actif',
    tags: ['Bail', 'Syndic'],
    loyer: 150000,
    entree: '2026-03-15',
    actif: true
  },
  {
    id: 2,
    nom: 'Yao Koffi',
    ville: 'Bouaké',
    statut: 'sorti',
    tags: ['Vente'],
    loyer: 80000,
    entree: '2026-06-01T10:00:00',
    actif: false
  },
  {
    id: 3,
    nom: 'Aminata Traoré',
    ville: 'Abidjan',
    statut: 'actif',
    tags: [],
    loyer: 250000,
    entree: null,
    actif: true
  }
];

const criteria: SearchCriterion[] = [
  { type: 'text', key: 'q', label: 'Recherche', placeholder: 'Nom…' },
  { type: 'select', key: 'statut', label: 'Statut' },
  { type: 'multiSelect', key: 'ville', label: 'Ville', options: [] },
  { type: 'dateRange', key: 'entree', label: 'Entrée' },
  { type: 'numberRange', key: 'loyer', label: 'Loyer' },
  { type: 'boolean', key: 'actif', label: 'Actif' }
];

const config: LocalFilterConfig<Locataire> = {
  criteria,
  text: [l => l.nom, l => l.ville, l => l.tags],
  accessors: {
    statut: l => l.statut,
    ville: l => l.ville,
    entree: l => l.entree,
    loyer: l => l.loyer,
    actif: l => l.actif
  }
};

const ids = (items: readonly Locataire[]) => items.map(l => l.id);

describe('normalizeText', () => {
  it('retire les accents, la casse et les espaces superflus', () => {
    expect(normalizeText('  Élodie  KOUASSI ')).toBe('elodie kouassi');
  });

  it('retire les diacritiques sans toucher au reste du mot', () => {
    expect(normalizeText('Côte d’Ivoire')).toContain('cote');
  });

  it('donne une chaîne vide pour null et undefined', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });

  it('accepte les nombres', () => {
    expect(normalizeText(42)).toBe('42');
  });

  it('donne le jour aaaa-mm-jj pour une date, en heure locale', () => {
    expect(normalizeText(new Date(2026, 2, 5, 12, 0))).toBe('2026-03-05');
  });
});

describe('matchesText', () => {
  const accessors = [(l: Locataire) => l.nom];

  it('trouve un mot sans tenir compte des accents ni de la casse', () => {
    expect(matchesText(locataires[0], 'elodie', accessors)).toBe(true);
    expect(matchesText(locataires[0], 'ELODIE', accessors)).toBe(true);
    expect(matchesText(locataires[0], 'élo', accessors)).toBe(true);
  });

  it('exige que chaque mot soit présent, dans une ou plusieurs colonnes', () => {
    const cols = [(l: Locataire) => l.nom, (l: Locataire) => l.ville];
    expect(matchesText(locataires[0], 'koua abidjan', cols)).toBe(true);
    expect(matchesText(locataires[0], 'koua cocody', cols)).toBe(false);
  });

  it('considère chaque élément d’une valeur tableau', () => {
    const tags = [(l: Locataire) => l.tags];
    expect(matchesText(locataires[0], 'bail', tags)).toBe(true);
    expect(matchesText(locataires[0], 'vente', tags)).toBe(false);
  });

  it('laisse passer un terme vide', () => {
    expect(matchesText(locataires[0], '', accessors)).toBe(true);
    expect(matchesText(locataires[0], '   ', accessors)).toBe(true);
  });
});

describe('isActiveValue', () => {
  it('considère inactives les valeurs vides', () => {
    expect(isActiveValue(undefined)).toBe(false);
    expect(isActiveValue('')).toBe(false);
    expect(isActiveValue('   ')).toBe(false);
    expect(isActiveValue([])).toBe(false);
    expect(isActiveValue({})).toBe(false);
    expect(isActiveValue({ from: undefined })).toBe(false);
  });

  it('considère actifs les textes, tableaux et bornes renseignés', () => {
    expect(isActiveValue('x')).toBe(true);
    expect(isActiveValue(['a'])).toBe(true);
    expect(isActiveValue({ from: '2026-01-01' })).toBe(true);
    expect(isActiveValue({ max: 0 })).toBe(true);
  });

  it('considère actifs true et false', () => {
    expect(isActiveValue(true)).toBe(true);
    expect(isActiveValue(false)).toBe(true);
  });
});

describe('matchesEquals', () => {
  it('laisse passer un critère vide', () => {
    expect(matchesEquals('a', undefined)).toBe(true);
    expect(matchesEquals('a', '')).toBe(true);
  });

  it('compare la forme texte de la valeur', () => {
    expect(matchesEquals('actif', 'actif')).toBe(true);
    expect(matchesEquals('actif', 'sorti')).toBe(false);
    expect(matchesEquals(3, '3')).toBe(true);
  });

  it('matche un tableau si l’un de ses éléments matche', () => {
    expect(matchesEquals(['a', 'b'], 'b')).toBe(true);
    expect(matchesEquals(['a'], 'b')).toBe(false);
  });

  it('refuse une valeur absente', () => {
    expect(matchesEquals(null, 'x')).toBe(false);
  });
});

describe('matchesAnyOf', () => {
  it('laisse passer une liste demandée vide', () => {
    expect(matchesAnyOf('a', [])).toBe(true);
  });

  it('exige une intersection non vide pour une valeur tableau', () => {
    expect(matchesAnyOf(['a', 'b'], ['b', 'c'])).toBe(true);
    expect(matchesAnyOf(['a'], ['c'])).toBe(false);
  });

  it('teste l’appartenance pour une valeur simple', () => {
    expect(matchesAnyOf('b', ['a', 'b'])).toBe(true);
    expect(matchesAnyOf('z', ['a', 'b'])).toBe(false);
  });
});

describe('matchesDateRange', () => {
  const range = { from: '2026-03-15', to: '2026-03-20' };

  it('inclut les deux bornes', () => {
    expect(matchesDateRange('2026-03-15', range)).toBe(true);
    expect(matchesDateRange('2026-03-20', range)).toBe(true);
  });

  it('exclut les jours hors de l’intervalle', () => {
    expect(matchesDateRange('2026-03-14', range)).toBe(false);
    expect(matchesDateRange('2026-03-21', range)).toBe(false);
  });

  it('accepte une borne ouverte', () => {
    expect(matchesDateRange('2030-01-01', { from: '2026-03-15' })).toBe(true);
    expect(matchesDateRange('2001-01-01', { to: '2026-03-15' })).toBe(true);
    expect(matchesDateRange('2001-01-01', { from: '2026-03-15' })).toBe(false);
  });

  it('compare le jour d’une date ISO avec heure', () => {
    expect(matchesDateRange('2026-03-15T23:30:00', { from: '2026-03-15', to: '2026-03-15' })).toBe(true);
  });

  it('compare le jour local d’un objet Date', () => {
    expect(matchesDateRange(new Date(2026, 2, 15, 0, 30), { from: '2026-03-15', to: '2026-03-15' })).toBe(true);
  });

  it('refuse une valeur vide ou illisible quand l’intervalle est actif', () => {
    expect(matchesDateRange(null, range)).toBe(false);
    expect(matchesDateRange(undefined, range)).toBe(false);
    expect(matchesDateRange('', range)).toBe(false);
    expect(matchesDateRange('pas une date', range)).toBe(false);
  });

  it('laisse passer tout si l’intervalle est sans borne', () => {
    expect(matchesDateRange(null, {})).toBe(true);
  });
});

describe('matchesNumberRange', () => {
  const range = { min: 100, max: 200 };

  it('accepte une chaîne numérique et un nombre', () => {
    expect(matchesNumberRange('150', range)).toBe(true);
    expect(matchesNumberRange(150, range)).toBe(true);
  });

  it('inclut les bornes', () => {
    expect(matchesNumberRange(100, range)).toBe(true);
    expect(matchesNumberRange('200', range)).toBe(true);
  });

  it('exclut les valeurs hors bornes', () => {
    expect(matchesNumberRange(99, range)).toBe(false);
    expect(matchesNumberRange(201, range)).toBe(false);
  });

  it('refuse une valeur non numérique quand l’intervalle est actif', () => {
    expect(matchesNumberRange('abc', range)).toBe(false);
    expect(matchesNumberRange('', { min: 0 })).toBe(false);
    expect(matchesNumberRange(null, { min: 0 })).toBe(false);
  });

  it('laisse passer tout si l’intervalle est sans borne', () => {
    expect(matchesNumberRange('abc', {})).toBe(true);
  });
});

describe('matchesBoolean', () => {
  it('laisse passer quand le critère est indifférent', () => {
    expect(matchesBoolean(undefined, undefined)).toBe(true);
    expect(matchesBoolean(true, undefined)).toBe(true);
  });

  it('compare la véracité de la valeur, faux compris', () => {
    expect(matchesBoolean(false, false)).toBe(true);
    expect(matchesBoolean(true, false)).toBe(false);
    expect(matchesBoolean(undefined, true)).toBe(false);
    expect(matchesBoolean(true, true)).toBe(true);
  });
});

describe('filterItems', () => {
  it('ne filtre rien sans critère actif et renvoie un nouveau tableau', () => {
    const result = filterItems(locataires, {}, config);
    expect(ids(result)).toEqual([1, 2, 3]);
    expect(result).not.toBe(locataires);
    expect(locataires).toHaveLength(3);
  });

  it('applique le champ libre sur plusieurs colonnes, sans accents', () => {
    expect(ids(filterItems(locataires, { q: 'elodie' }, config))).toEqual([1]);
    expect(ids(filterItems(locataires, { q: 'koua abidjan' }, config))).toEqual([1]);
    expect(ids(filterItems(locataires, { q: 'bail' }, config))).toEqual([1]);
  });

  it('applique un multiSelect par intersection', () => {
    expect(ids(filterItems(locataires, { ville: ['Abidjan'] }, config))).toEqual([1, 3]);
    expect(ids(filterItems(locataires, { ville: ['Bouaké', 'Abidjan'] }, config))).toEqual([1, 2, 3]);
  });

  it('applique un intervalle de nombres', () => {
    expect(ids(filterItems(locataires, { loyer: { min: 100000, max: 200000 } }, config))).toEqual([1]);
  });

  it('applique un intervalle de dates, en excluant les entrées vides', () => {
    expect(ids(filterItems(locataires, { entree: { from: '2026-06-01' } }, config))).toEqual([2]);
    expect(ids(filterItems(locataires, { entree: { to: '2026-03-15' } }, config))).toEqual([1]);
  });

  it('applique un booléen faux comme critère actif', () => {
    expect(ids(filterItems(locataires, { actif: false }, config))).toEqual([2]);
  });

  it('combine les critères en ET', () => {
    const values: SearchValues = { q: 'abidjan', actif: true };
    expect(ids(filterItems(locataires, values, config))).toEqual([1, 3]);
    expect(ids(filterItems(locataires, { ...values, loyer: { min: 200000 } }, config))).toEqual([3]);
  });

  it('laisse le prédicat sur mesure primer sur l’accesseur, avec la valeur active', () => {
    const custom: LocalFilterConfig<Locataire> = {
      ...config,
      predicates: {
        statut: (item, value) => value === 'actif' && item.id === 3
      }
    };
    expect(ids(filterItems(locataires, { statut: 'actif' }, custom))).toEqual([3]);
  });

  it('ignore un critère sans accesseur ni prédicat', () => {
    const local: LocalFilterConfig<Locataire> = {
      criteria: [{ type: 'select', key: 'zone', label: 'Zone' }],
      accessors: {}
    };
    expect(ids(filterItems(locataires, { zone: 'x' }, local))).toEqual([1, 2, 3]);
  });

  it('ignore le champ libre quand aucun accesseur texte n’est fourni', () => {
    const local: LocalFilterConfig<Locataire> = {
      criteria: [{ type: 'text', key: 'q', label: 'Recherche', placeholder: 'Nom…' }],
      text: []
    };
    expect(ids(filterItems(locataires, { q: 'elodie' }, local))).toEqual([1, 2, 3]);
  });
});

describe('paginate', () => {
  const list = [1, 2, 3, 4, 5];

  it('renvoie la tranche demandée', () => {
    expect(paginate(list, 2, 2)).toEqual({ items: [3, 4], page: 2 });
  });

  it('ramène une page trop grande sur la dernière page', () => {
    expect(paginate(list, 9, 2)).toEqual({ items: [5], page: 3 });
  });

  it('ramène une page nulle ou négative sur la première', () => {
    expect(paginate(list, 0, 2)).toEqual({ items: [1, 2], page: 1 });
    expect(paginate(list, -4, 2)).toEqual({ items: [1, 2], page: 1 });
  });

  it('fonctionne avec une taille de page de 1', () => {
    expect(paginate(['a', 'b', 'c'], 2, 1)).toEqual({ items: ['b'], page: 2 });
  });

  it('renvoie une seule page vide pour une liste vide', () => {
    expect(paginate([], 3, 10)).toEqual({ items: [], page: 1 });
  });
});

describe('normalizeText — arabe', () => {
  it('retire les diacritiques arabes (tachkîl)', () => {
    expect(normalizeText('مُحَمَّد')).toBe(normalizeText('محمد'));
    expect(normalizeText('مُحَمَّد')).toContain('محمد');
  });
});
