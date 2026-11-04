import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useLocalListSearch } from '../../utils/list-search/useLocalListSearch';
import type { UseLocalListSearchResult } from '../../utils/list-search/useLocalListSearch';
import type { Sort } from '../../hooks/useListParams';
import type { SearchCriterion } from '../../utils/list-search/types';

/** `useLocalListSearch` — filtrage, tri et pagination locaux, état dans l'URL. */

interface Row {
  id: number;
  nom: string;
  statut: string;
  montant: number;
}

const ROWS: Row[] = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  nom: i % 5 === 0 ? `Élodie ${i}` : `Client ${i}`,
  statut: i % 2 === 0 ? 'A' : 'B',
  montant: i * 10
}));

const TEXT = [(r: Row) => r.nom];
const ACCESSORS = { statut: (r: Row) => r.statut, montant: (r: Row) => r.montant };

let latest: UseLocalListSearchResult<Row>;

// Déclaré hors du composant : références stables (voir la JSDoc du hook).
const SORT_ITEMS = (list: Row[], sort: Sort | null) =>
  sort ? [...list].sort((a, b) => (a.montant - b.montant) * (sort.order === 'asc' ? 1 : -1)) : list;

function Probe({ items = ROWS, pageSize = 10 }: { items?: Row[] | null; pageSize?: number }) {
  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: 'Recherche', placeholder: 'Nom…' },
    { key: 'statut', type: 'select', label: 'Statut', options: [{ value: 'A', label: 'A' }] },
    { key: 'montant', type: 'numberRange', label: 'Montant' }
  ];
  latest = useLocalListSearch(items === null ? undefined : items, {
    criteria,
    defaultPageSize: pageSize,
    text: TEXT,
    accessors: ACCESSORS,
    sortItems: SORT_ITEMS
  });
  return <span data-testid="url">{useLocation().search || '(vide)'}</span>;
}

const at = (search: string, ui: React.ReactElement = <Probe />) =>
  render(<MemoryRouter initialEntries={[`/l${search}`]}>{ui}</MemoryRouter>);

describe('useLocalListSearch', () => {
  it('sans critère : toute la liste, première page', () => {
    at('');
    expect(latest.total).toBe(25);
    expect(latest.pageItems).toHaveLength(10);
    expect(latest.pageItems[0].id).toBe(1);
    expect(latest.searchProps.resultCount).toBe(25);
  });

  it('filtre, compte et expose le total filtré', () => {
    at('?q=elodie&statut=A');
    // « Élodie » : i = 0, 5, 10, 15, 20 ; statut A : i pair → 0, 10, 20.
    expect(latest.filtered.map(r => r.id)).toEqual([1, 11, 21]);
    expect(latest.total).toBe(3);
    expect(latest.activeCount).toBe(2);
    expect(latest.isFiltered).toBe(true);
    expect(latest.searchProps.resultCount).toBe(3);
    expect(latest.dataViewProps).toMatchObject({ total: 3, paginated: true, isFiltered: true });
    expect(latest.dataViewProps.items).toHaveLength(3);
    expect(latest.dataViewProps.search).toBe(latest.searchProps);
  });

  it('filtre sur un intervalle numérique', () => {
    at('?montantMin=200');
    expect(latest.filtered.map(r => r.montant)).toEqual([200, 210, 220, 230, 240]);
  });

  it('pagine : page 3 de 25 lignes à 10 par page', () => {
    at('?page=3');
    expect(latest.pageItems.map(r => r.id)).toEqual([21, 22, 23, 24, 25]);
    expect(latest.page).toBe(3);
    expect(latest.tableProps.dataSource).toBe(latest.pageItems);
    expect(latest.tableProps.pagination).toMatchObject({ current: 3, pageSize: 10, total: 25, showSizeChanger: true });
  });

  it('ramène la page à la dernière non vide quand le filtre réduit la liste', () => {
    at('?page=3&statut=A'); // 13 lignes A → 2 pages
    expect(latest.total).toBe(13);
    expect(latest.page).toBe(2);
    expect(latest.pageItems).toHaveLength(3);
    expect(latest.tableProps.pagination.current).toBe(2);
    expect(latest.dataViewProps.page).toBe(2);
  });

  it('applique sortItems avant la pagination', () => {
    at('?sort=montant:desc');
    expect(latest.filtered[0].montant).toBe(240);
    expect(latest.pageItems[0].montant).toBe(240);
  });

  it('changer de page passe par l’URL ; changer la taille revient à la page 1', async () => {
    at('');
    await act(async () => latest.tableProps.pagination.onChange?.(2, 10));
    expect(screen.getByTestId('url')).toHaveTextContent('?page=2');
    await act(async () => latest.dataViewProps.onPageChange(2, 20));
    expect(screen.getByTestId('url').textContent).toContain('limit=20');
    expect(screen.getByTestId('url').textContent).not.toContain('page=');
  });

  it('exportAll rend toute la liste filtrée', async () => {
    at('?statut=A');
    const all = await latest.exportAll();
    expect(all).toBe(latest.filtered);
    expect(all).toHaveLength(13);
  });

  it('items non chargés : liste vide', () => {
    at('', <Probe items={null} />);
    expect(latest.total).toBe(0);
    expect(latest.pageItems).toEqual([]);
    expect(latest.page).toBe(1);
  });

  it('références stables entre deux rendus sans changement', () => {
    const { rerender } = at('?q=client');
    const first = latest;
    rerender(
      <MemoryRouter initialEntries={['/l?q=client']}>
        <Probe />
      </MemoryRouter>
    );
    expect(latest.filtered).toBe(first.filtered);
    expect(latest.tableProps).toBe(first.tableProps);
  });
});
