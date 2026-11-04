import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Table } from '../../components/primitives/Table';
import type { ListSearchBinding } from '../../utils/list-search/types';

/**
 * `primitives/Table` avec `search` : la barre est au-dessus du tableau (même
 * vide), le compteur se déduit, l'export se loge dans la barre, et un tableau
 * vide sous critères propose d'effacer. Sans `search`, aucune barre.
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

type Ligne = { id: string; nom: string };
const LIGNES: Ligne[] = [
  { id: '1', nom: 'Aminata' },
  { id: '2', nom: 'Koffi' }
];
const COLUMNS = [{ title: 'Nom', dataIndex: 'nom', key: 'nom' }];

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

function table(props: Partial<React.ComponentProps<typeof Table<Ligne>>> = {}) {
  return render(<Table<Ligne> rowKey="id" columns={COLUMNS} dataSource={LIGNES} aria-label="Locataires" {...props} />);
}

beforeEach(() => {
  isDesktop.value = true;
});

describe('Table — prop search', () => {
  it('ne rend aucune barre sans search', () => {
    table();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(screen.getByText('Aminata')).toBeInTheDocument();
  });

  it('rend la barre au-dessus du tableau, compteur = longueur de dataSource', () => {
    table({ search: binding() });
    const bar = screen.getByRole('search');
    expect(bar.compareDocumentPosition(screen.getByRole('table')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(bar).getByText('2 résultats')).toBeInTheDocument();
  });

  it('prend pagination.total quand la pagination est un objet avec total', () => {
    table({ search: binding(), pagination: { total: 128, pageSize: 20, current: 1 } });
    expect(screen.getByText('128 résultats')).toBeInTheDocument();
  });

  it('préfère search.resultCount', () => {
    table({ search: binding({ resultCount: 7 }), pagination: { total: 128 } });
    expect(screen.getByText('7 résultats')).toBeInTheDocument();
  });

  it("loge l'export dans la barre", () => {
    table({ search: binding(), exportFilename: 'locataires' });
    expect(within(screen.getByRole('search')).getByRole('button', { name: /Exporter/ })).toBeInTheDocument();
  });

  it('garde la barre sur un tableau vide, et offre un état « aucun résultat » sous critères', async () => {
    const user = userEvent.setup();
    const search = binding({ values: { q: 'zzz' }, activeCount: 1 });
    table({ search, dataSource: [] });
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByText('Aucun élément ne correspond aux filtres appliqués.')).toBeInTheDocument();
    // Deux boutons « Effacer les critères » : celui de la barre et celui de l'état vide.
    const buttons = screen.getAllByRole('button', { name: 'Effacer les critères' });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1]);
    expect(search.onClear).toHaveBeenCalledTimes(1);
  });

  it('ne montre pas « aucun résultat » pendant un chargement', () => {
    // Premier chargement sous critères : la liste n'est pas encore connue, et le
    // bouton serait recouvert par l'indicateur d'AntD (pointer-events: none).
    table({ search: binding({ values: { q: 'zzz' }, activeCount: 1 }), dataSource: [], loading: true });
    expect(screen.queryByText('Aucun élément ne correspond aux filtres appliqués.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Effacer les critères' })).toHaveLength(1);
  });

  it("garde le texte vide d'Ant Design sans critère actif", () => {
    table({ search: binding(), dataSource: [] });
    expect(screen.queryByText('Aucun élément ne correspond aux filtres appliqués.')).not.toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it("respecte le locale.emptyText fourni par l'écran", () => {
    table({
      search: binding({ values: { q: 'zzz' }, activeCount: 1 }),
      dataSource: [],
      locale: { emptyText: 'Aucun locataire pour ce bien' }
    });
    expect(screen.getByText('Aucun locataire pour ce bien')).toBeInTheDocument();
    expect(screen.queryByText('Aucun élément ne correspond aux filtres appliqués.')).not.toBeInTheDocument();
  });

  it('recadre une page hors bornes via pagination.onChange', () => {
    const onChange = vi.fn();
    table({
      search: binding(),
      dataSource: [],
      pagination: { total: 25, current: 9, pageSize: 20, onChange }
    });
    expect(onChange).toHaveBeenCalledWith(2, 20);
    expect(screen.queryByText('Aucun élément ne correspond aux filtres appliqués.')).not.toBeInTheDocument();
  });

  it('ne recadre rien sans search', () => {
    const onChange = vi.fn();
    table({ dataSource: [], pagination: { total: 25, current: 9, pageSize: 20, onChange } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
