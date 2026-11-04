import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DataView } from '../../components/primitives/DataView';
import { DataCard } from '../../components/primitives/DataCard';
import type { ListSearchBinding } from '../../utils/list-search/types';

/**
 * `<DataView search>` : la barre se pose au-dessus de la liste dans TOUS les
 * états, le compteur et l'effacement se déduisent, l'export se loge dans la
 * barre. Sans `search`, aucune barre.
 */

const isDesktop = vi.hoisted(() => ({ value: true }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: isDesktop.value ? 'lg' : 'xs',
    isMobile: !isDesktop.value,
    isTablet: false,
    isDesktop: isDesktop.value
  })
}));

type Bien = { id: string; titre: string };
const BIENS: Bien[] = [
  { id: '1', titre: 'Villa Angre' },
  { id: '2', titre: 'Studio Marcory' }
];
const COLUMNS = [{ title: 'Titre', dataIndex: 'titre', key: 'titre' }];

function binding(overrides: Partial<ListSearchBinding> = {}): ListSearchBinding {
  return {
    criteria: [{ key: 'q', type: 'text', label: 'Recherche', placeholder: 'Chercher' }],
    values: {},
    onChange: vi.fn(),
    onClear: vi.fn(),
    activeCount: 0,
    ...overrides
  };
}

function view(
  props: {
    search?: ListSearchBinding;
    items?: Bien[];
    total?: number;
    paginated?: boolean;
    loading?: boolean;
    isFiltered?: boolean;
    onClearFilters?: () => void;
    export?: false;
  } = {}
) {
  return render(
    <MemoryRouter>
      <DataView<Bien>
        items={BIENS}
        total={57}
        page={1}
        pageSize={20}
        onPageChange={() => {}}
        columns={COLUMNS}
        rowKey={b => b.id}
        renderCard={b => <DataCard title={b.titre} />}
        aria-label="Biens"
        {...props}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  isDesktop.value = true;
});

describe('DataView — prop search', () => {
  it('ne rend aucune barre sans search', () => {
    view();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('rend la barre au-dessus de la liste, avec le total serveur comme compteur', () => {
    view({ search: binding() });
    const bar = screen.getByRole('search');
    const table = screen.getByRole('table');
    expect(bar.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(bar).getByText('57 résultats')).toBeInTheDocument();
  });

  it('déduit le compteur de items.length quand la liste ne pagine pas', () => {
    view({ search: binding(), paginated: false });
    expect(screen.getByText('2 résultats')).toBeInTheDocument();
  });

  it('préfère search.resultCount quand il est fourni', () => {
    view({ search: binding({ resultCount: 5 }) });
    expect(screen.getByText('5 résultats')).toBeInTheDocument();
  });

  it('garde la barre pendant le premier chargement, sans compteur', () => {
    view({ search: binding(), items: [], loading: true });
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.queryByText(/résultat/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('garde la barre quand la liste est vide sans critère', () => {
    view({ search: binding(), items: [], total: 0 });
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByText('Aucune donnée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Effacer les critères' })).not.toBeInTheDocument();
  });

  it('aucun résultat : critères actifs déduits, le bouton Effacer appelle search.onClear', async () => {
    const user = userEvent.setup();
    const search = binding({ values: { q: 'zzz' }, activeCount: 1 });
    view({ search, items: [], total: 0 });
    expect(screen.getByRole('search')).toBeInTheDocument();
    // Le bloc d'état (isFiltered déduit de activeCount) dit comme la barre : « Effacer les critères ».
    expect(screen.queryByRole('button', { name: 'Effacer les filtres' })).not.toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Effacer les critères' });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1]);
    expect(search.onClear).toHaveBeenCalledTimes(1);
    await user.click(buttons[0]);
    expect(search.onClear).toHaveBeenCalledTimes(2);
  });

  it("laisse l'écran imposer isFiltered et onClearFilters", async () => {
    const user = userEvent.setup();
    const search = binding({ activeCount: 0 });
    const onClearFilters = vi.fn();
    view({ search, items: [], total: 0, isFiltered: true, onClearFilters });
    const buttons = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(buttons[buttons.length - 1]);
    expect(onClearFilters).toHaveBeenCalledTimes(1);
    expect(search.onClear).not.toHaveBeenCalled();
  });

  it("loge l'export dans la barre, pas sur sa propre ligne", () => {
    view({ search: binding() });
    const bar = screen.getByRole('search');
    expect(within(bar).getByRole('button', { name: /Exporter/ })).toBeInTheDocument();
  });

  it("n'affiche pas d'export avec export={false}", () => {
    view({ search: binding(), export: false });
    expect(screen.queryByRole('button', { name: /Exporter/ })).not.toBeInTheDocument();
  });

  it('fonctionne aussi en cartes sous 992 px', () => {
    isDesktop.value = false;
    view({ search: binding() });
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
