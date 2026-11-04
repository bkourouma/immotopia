import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { useListSearch } from '../../hooks/useListSearch';
import type { UseListSearchOptions, UseListSearchResult } from '../../hooks/useListSearch';
import type { ApiParams, SearchCriterion } from '../../utils/list-search/types';

/**
 * `useListSearch` — critères multicritères portés par l'URL et traduits pour l'API.
 * On teste l'URL produite, les valeurs lues et les paramètres d'API.
 */

const OPTIONS = [
  { value: 'A', label: 'Alpha' },
  { value: 'B', label: 'Bravo' }
];

const baseCriteria = (): SearchCriterion[] => [
  { key: 'q', type: 'text', label: 'Recherche', placeholder: 'Nom…' },
  { key: 'statut', type: 'select', label: 'Statut', options: OPTIONS },
  { key: 'types', type: 'multiSelect', label: 'Types', options: OPTIONS },
  { key: 'periode', type: 'dateRange', label: 'Période', api: ['from', 'to'] },
  { key: 'montant', type: 'numberRange', label: 'Montant', api: ['minAmount', 'maxAmount'] },
  { key: 'retard', type: 'boolean', label: 'En retard' }
];

let latest: UseListSearchResult;

function Probe({
  criteria,
  prefix,
  label = '',
  extra
}: {
  criteria?: SearchCriterion[];
  prefix?: string;
  label?: string;
  extra?: Partial<UseListSearchOptions>;
}) {
  const search = useListSearch({ criteria: criteria ?? baseCriteria(), paramPrefix: prefix, ...extra });
  if (!label) latest = search;
  const navType = useNavigationType();
  return (
    <div>
      <span data-testid={`${label}values`}>{JSON.stringify(search.values)}</span>
      <span data-testid={`${label}filter`}>{JSON.stringify(search.filterParams)}</span>
      <span data-testid={`${label}api`}>{JSON.stringify(search.apiParams)}</span>
      <span data-testid={`${label}count`}>{search.activeCount}</span>
      <span data-testid={`${label}page`}>{search.page}</span>
      <span data-testid="nav">{navType}</span>
      <button onClick={() => search.setValues({ q: 'villa' })}>{`${label}q`}</button>
      <button onClick={() => search.setValues({ q: 'v' }, { replace: true })}>{`${label}replace`}</button>
      <button onClick={() => search.setPage(4)}>{`${label}page4`}</button>
      <button onClick={search.clear}>{`${label}clear`}</button>
    </div>
  );
}

function Url() {
  return <span data-testid="url">{useLocation().search || '(vide)'}</span>;
}

const at = (search: string, ui: React.ReactElement = <Probe />) =>
  render(
    <MemoryRouter initialEntries={[`/l${search}`]}>
      <Url />
      {ui}
    </MemoryRouter>
  );

const json = (id: string) => JSON.parse(screen.getByTestId(id).textContent as string);
const url = () => screen.getByTestId('url').textContent as string;
const act = async (fn: () => void) => {
  const { act: rtlAct } = await import('@testing-library/react');
  await rtlAct(async () => fn());
};

describe('useListSearch — lecture de l’URL', () => {
  it('lit chaque type de critère', () => {
    at(
      '?q=villa%20mer&statut=A&types=A,B&periodeFrom=2025-01-02&periodeTo=2025-02-03&montantMin=10&montantMax=20.5&retard=0'
    );
    expect(json('values')).toEqual({
      q: 'villa mer',
      statut: 'A',
      types: ['A', 'B'],
      periode: { from: '2025-01-02', to: '2025-02-03' },
      montant: { min: 10, max: 20.5 },
      retard: false
    });
    expect(json('count')).toBe(6);
  });

  it('une valeur inactive : tous les critères figurent, aucun ne compte', () => {
    at('');
    expect(json('values')).toEqual({
      q: undefined,
      statut: undefined,
      types: [],
      periode: {},
      montant: {},
      retard: undefined
    });
    expect(json('count')).toBe(0);
    expect(latest.isFiltered).toBe(false);
  });

  it('ignore les valeurs mal formées', () => {
    at('?periodeFrom=2025-13-40&periodeTo=hier&montantMin=abc&montantMax=Infinity&retard=oui&types=,,&q=%20%20');
    expect(json('values')).toEqual({
      q: undefined,
      statut: undefined,
      types: [],
      periode: {},
      montant: {},
      retard: undefined
    });
    expect(json('count')).toBe(0);
  });

  it('refuse une date inexistante mais bien formée', () => {
    at('?periodeFrom=2025-02-31');
    expect(json('values').periode).toEqual({});
  });

  it('un intervalle à une seule borne compte pour 1', () => {
    at('?montantMin=5');
    expect(json('values').montant).toEqual({ min: 5 });
    expect(json('count')).toBe(1);
  });
});

describe('useListSearch — écriture dans l’URL', () => {
  it('encode chaque type et efface les valeurs vides', async () => {
    at('');
    await act(() =>
      latest.setValues({
        q: 'villa',
        statut: 'B',
        types: ['A', 'B'],
        periode: { from: '2025-01-02', to: '2025-02-03' },
        montant: { min: 1, max: 9 },
        retard: true
      })
    );
    const u = url();
    expect(u).toContain('q=villa');
    expect(u).toContain('statut=B');
    expect(u).toContain('types=A%2CB');
    expect(u).toContain('periodeFrom=2025-01-02');
    expect(u).toContain('periodeTo=2025-02-03');
    expect(u).toContain('montantMin=1');
    expect(u).toContain('montantMax=9');
    expect(u).toContain('retard=1');

    await act(() =>
      latest.setValues({ q: '', statut: undefined, types: [], periode: {}, montant: {}, retard: undefined })
    );
    expect(url()).toBe('(vide)');
  });

  it('boolean false s’écrit 0', async () => {
    at('');
    await act(() => latest.setValues({ retard: false }));
    expect(url()).toBe('?retard=0');
  });

  it('fusionne : ne touche pas aux critères non cités', async () => {
    at('?statut=A');
    await act(() => latest.setValues({ q: 'x' }));
    expect(url()).toContain('statut=A');
    expect(url()).toContain('q=x');
  });

  it('remet la page à 1 au changement de critère', async () => {
    const user = userEvent.setup();
    at('?page=7');
    expect(screen.getByTestId('page')).toHaveTextContent('7');
    await user.click(screen.getByText('q'));
    expect(screen.getByTestId('page')).toHaveTextContent('1');
  });

  it('replace remplace l’entrée d’historique', async () => {
    const user = userEvent.setup();
    at('');
    await user.click(screen.getByText('replace'));
    expect(screen.getByTestId('nav')).toHaveTextContent('REPLACE');
    await user.click(screen.getByText('q'));
    expect(screen.getByTestId('nav')).toHaveTextContent('PUSH');
  });

  it('clear efface les critères mais pas les paramètres étrangers', async () => {
    const user = userEvent.setup();
    at('?q=x&statut=A&page=3&utm=1');
    await user.click(screen.getByText('clear'));
    expect(url()).toBe('?utm=1');
  });
});

describe('useListSearch — préfixe', () => {
  it('deux instances préfixées ne s’écrasent pas', async () => {
    const user = userEvent.setup();
    at(
      '',
      <>
        <Probe prefix="a" label="a-" />
        <Probe prefix="b" label="b-" />
      </>
    );
    await user.click(screen.getByText('a-q'));
    await user.click(screen.getByText('b-page4'));
    expect(url()).toContain('a.q=villa');
    expect(url()).toContain('b.page=4');
    expect(json('a-values').q).toBe('villa');
    expect(json('b-values').q).toBeUndefined();
    expect(screen.getByTestId('a-page')).toHaveTextContent('1');
    expect(screen.getByTestId('b-page')).toHaveTextContent('4');
    await user.click(screen.getByText('a-clear'));
    expect(url()).toBe('?b.page=4');
  });
});

describe('useListSearch — paramètres d’API', () => {
  it('traduit par défaut : q→search, plages, booléen, multi-valeurs', () => {
    at('?q=villa&statut=A&types=A,B&periodeFrom=2025-01-02&montantMax=9&retard=1&page=2&limit=50');
    expect(json('filter')).toEqual({
      search: 'villa',
      statut: 'A',
      types: 'A,B',
      from: '2025-01-02',
      maxAmount: 9,
      retard: 'true'
    });
    expect(json('api')).toEqual({
      search: 'villa',
      statut: 'A',
      types: 'A,B',
      from: '2025-01-02',
      maxAmount: 9,
      retard: 'true',
      page: 2,
      limit: 50
    });
  });

  it('les noms par défaut d’un intervalle sont ceux de l’URL', () => {
    const criteria: SearchCriterion[] = [
      { key: 'd', type: 'dateRange', label: 'D' },
      { key: 'n', type: 'numberRange', label: 'N', urlKeys: ['nMin', 'nMax'] }
    ];
    at('?dFrom=2025-01-01&dTo=2025-01-31&nMin=1', <Probe criteria={criteria} />);
    expect(json('filter')).toEqual({ dFrom: '2025-01-01', dTo: '2025-01-31', nMin: 1 });
  });

  it('renomme (string), n’envoie pas (false) et traduit librement (fonction)', () => {
    const criteria: SearchCriterion[] = [
      { key: 'q', type: 'text', label: 'Q', placeholder: 'Nom…', api: 'term' },
      { key: 'statut', type: 'select', label: 'S', options: OPTIONS, api: false },
      {
        key: 'retard',
        type: 'boolean',
        label: 'R',
        api: (v): ApiParams => (v ? { overdue: 'true', since: 3 } : {})
      }
    ];
    at('?q=x&statut=A&retard=1', <Probe criteria={criteria} />);
    expect(json('filter')).toEqual({ term: 'x', overdue: 'true', since: 3 });
    expect(json('count')).toBe(3);
  });

  it('boolean faux envoyé comme "false" ; la fonction n’est pas appelée si inactif', () => {
    let calls = 0;
    const criteria: SearchCriterion[] = [
      { key: 'actif', type: 'boolean', label: 'A' },
      {
        key: 'fn',
        type: 'select',
        label: 'F',
        options: OPTIONS,
        api: v => {
          calls++;
          return { f: String(v) };
        }
      }
    ];
    at('?actif=0', <Probe criteria={criteria} />);
    expect(json('filter')).toEqual({ actif: 'false' });
    expect(calls).toBe(0);
  });

  it('filterParams ne contient ni pagination ni tri ; apiParams oui, avec apiNames', () => {
    at('?q=a&page=3&sort=nom:desc', <Probe extra={{ apiNames: { page: 'p', limit: 'size', sort: 'order' } }} />);
    expect(json('filter')).toEqual({ search: 'a' });
    expect(json('api')).toEqual({ search: 'a', p: 3, size: 20, order: 'nom:desc' });
  });

  it('sort: false n’envoie pas le tri ; défaut de tri non envoyé s’il est nul', () => {
    at('?sort=nom:desc', <Probe extra={{ apiNames: { sort: false } }} />);
    expect(json('api')).toEqual({ page: 1, limit: 20 });
  });

  it('applique defaultSort et defaultPageSize', () => {
    at('', <Probe extra={{ defaultPageSize: 10, defaultSort: { field: 'date', order: 'desc' } }} />);
    expect(json('api')).toEqual({ page: 1, limit: 10, sort: 'date:desc' });
  });
});

describe('useListSearch — props dérivées', () => {
  it('searchProps, dataViewProps et tablePagination', async () => {
    at('?q=x&page=2');
    const { searchProps, dataViewProps } = latest;
    expect(searchProps.values).toBe(latest.values);
    expect(searchProps.activeCount).toBe(1);
    expect(searchProps.onChange).toBe(latest.setValues);
    expect(searchProps.onClear).toBe(latest.clear);
    expect('resultCount' in searchProps).toBe(false);
    expect(dataViewProps).toMatchObject({ page: 2, pageSize: 20, isFiltered: true, sort: null });

    const pagination = latest.tablePagination(95);
    expect(pagination).toMatchObject({ current: 2, pageSize: 20, total: 95, showSizeChanger: true });

    // Changer de page conserve la taille ; changer la taille repasse à la page 1.
    await act(() => pagination.onChange?.(3, 20));
    expect(url()).toContain('page=3');
    await act(() => latest.tablePagination(95).onChange?.(3, 50));
    expect(url()).toContain('limit=50');
    expect(url()).not.toContain('page=');
  });

  it('des critères redéclarés à chaque rendu ne changent pas les références', async () => {
    const user = userEvent.setup();
    at('?q=x');
    const first = latest;
    await user.click(screen.getByText('page4')); // provoque un rendu avec de NOUVEAUX critères
    expect(latest.values).toBe(first.values);
    expect(latest.filterParams).toBe(first.filterParams);
    expect(latest.criteria).toBe(first.criteria);
    expect(latest.apiParams).not.toBe(first.apiParams); // la page a changé
  });
});
