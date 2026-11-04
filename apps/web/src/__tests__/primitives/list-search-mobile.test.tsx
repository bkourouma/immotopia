import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListSearch, type ListSearchProps } from '../../components/primitives/ListSearch';
import type { SearchCriterion } from '../../utils/list-search/types';

/**
 * `<ListSearch>` sous 992 px : le champ libre et un bouton « Filtres » qui
 * ouvre une feuille. Rien ne s'applique avant « Appliquer » (§5.4).
 */

const isDesktop = vi.hoisted(() => ({ value: false }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: isDesktop.value ? 'lg' : 'xs',
    isMobile: !isDesktop.value,
    isTablet: false,
    isDesktop: isDesktop.value
  })
}));

const CRITERIA: SearchCriterion[] = [
  { key: 'q', type: 'text', label: 'Recherche', placeholder: 'Chercher' },
  {
    key: 'status',
    type: 'multiSelect',
    label: 'Statut',
    primary: true,
    options: [
      { value: 'ACTIVE', label: 'Actif' },
      { value: 'DISABLED', label: 'Désactivé' }
    ]
  },
  { key: 'amount', type: 'numberRange', label: 'Montant', unit: 'FCFA' },
  { key: 'late', type: 'boolean', label: 'En retard' }
];

function setup(overrides: Partial<ListSearchProps> = {}) {
  const onChange = vi.fn();
  const onClear = vi.fn();
  const props: ListSearchProps = {
    criteria: CRITERIA,
    values: {},
    onChange,
    onClear,
    activeCount: 0,
    ...overrides
  };
  render(<ListSearch {...props} />);
  return { onChange, onClear };
}

beforeEach(() => {
  isDesktop.value = false;
});

describe('ListSearch — mobile', () => {
  it('montre le champ libre et un bouton « Filtres », sans les autres critères', () => {
    setup();
    expect(screen.getByRole('textbox', { name: 'Recherche' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtres' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Statut' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Plus de critères/ })).not.toBeInTheDocument();
  });

  it('compte sur le bouton les critères actifs hors champ libre', () => {
    setup({ values: { q: 'villa', status: ['ACTIVE'], late: true }, activeCount: 3 });
    expect(screen.getByRole('button', { name: 'Filtres (2)' })).toBeInTheDocument();
  });

  it("n'affiche pas de bouton quand il n'y a que le champ libre", () => {
    setup({ criteria: [CRITERIA[0]] });
    expect(screen.queryByRole('button', { name: /Filtres/ })).not.toBeInTheDocument();
  });

  it('donne 44 px de haut au bouton', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Filtres' })).toHaveStyle({ minHeight: '44px' });
  });

  it('ouvre la feuille avec tous les critères non-texte, libellés visibles', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    const sheet = await screen.findByRole('dialog');
    // Peu d'options : des cases à cocher de 44 px plutôt qu'une liste déroulante.
    expect(within(sheet).getByRole('checkbox', { name: 'Actif' })).toBeInTheDocument();
    expect(within(sheet).getByRole('spinbutton', { name: 'Montant minimum' })).toBeInTheDocument();
    expect(within(sheet).getByRole('checkbox', { name: 'En retard' })).toBeInTheDocument();
    expect(within(sheet).getByText('Montant')).toBeVisible();
    expect(within(sheet).getByRole('button', { name: 'Réinitialiser' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Appliquer' })).toBeInTheDocument();
  });

  it("n'applique rien tant que « Appliquer » n'est pas cliqué, puis applique en UN seul appel", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ values: { late: true }, activeCount: 1 });
    await user.click(screen.getByRole('button', { name: 'Filtres (1)' }));
    const sheet = await screen.findByRole('dialog');

    await user.type(within(sheet).getByRole('spinbutton', { name: 'Montant minimum' }), '500');
    await user.tab();
    await user.click(within(sheet).getByRole('checkbox', { name: 'En retard' }));
    expect(onChange).not.toHaveBeenCalled();

    // Le brouillon compte ses critères actifs : 500 renseigné, case décochée.
    const apply = within(sheet).getByRole('button', { name: 'Appliquer (1)' });
    await user.click(apply);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      status: undefined,
      amount: { min: 500 },
      late: undefined
    });
  });

  it('« Réinitialiser » vide le brouillon, pas les valeurs appliquées', async () => {
    const user = userEvent.setup();
    const { onChange, onClear } = setup({ values: { late: true }, activeCount: 1 });
    await user.click(screen.getByRole('button', { name: 'Filtres (1)' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('checkbox', { name: 'En retard' })).toBeChecked();

    await user.click(within(sheet).getByRole('button', { name: 'Réinitialiser' }));
    expect(within(sheet).getByRole('checkbox', { name: 'En retard' })).not.toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();

    await user.click(within(sheet).getByRole('button', { name: 'Appliquer' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ status: undefined, amount: undefined, late: undefined });
  });

  it('abandonne le brouillon à la fermeture, et le recopie depuis les valeurs à la réouverture', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    await screen.findByRole('dialog');
    await user.click(await screen.findByRole('checkbox', { name: 'En retard' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'En retard' })).toBeChecked());

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Close|Fermer/i }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    await screen.findByRole('dialog');
    expect(await screen.findByRole('checkbox', { name: 'En retard' })).not.toBeChecked();
  });

  it('retire un critère par sa puce, sans ouvrir la feuille', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ values: { status: ['ACTIVE'] }, activeCount: 1, resultCount: 3 });
    expect(screen.getByText('Statut : Actif')).toBeInTheDocument();
    expect(screen.getByText('3 résultats')).toBeInTheDocument();
    const remove = screen.getByRole('button', { name: 'Retirer le critère Statut' });
    expect(remove).toHaveStyle({ minHeight: '44px' });
    await user.click(remove);
    expect(onChange).toHaveBeenCalledWith({ status: undefined });
  });

  it('efface depuis la ligne du bas', async () => {
    const user = userEvent.setup();
    const { onClear } = setup({ values: { late: true }, activeCount: 1 });
    await user.click(screen.getByRole('button', { name: 'Effacer les critères' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("n'oublie pas un nombre tapé puis « Appliquer » sans quitter le champ", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    const sheet = await screen.findByRole('dialog');
    await user.type(within(sheet).getByRole('spinbutton', { name: 'Montant maximum' }), '900');
    await user.click(within(sheet).getByRole('button', { name: 'Appliquer (1)' }));
    expect(onChange).toHaveBeenCalledWith({ status: undefined, amount: { max: 900 }, late: undefined });
  });

  it('met le bouton Exporter (extra) sur sa propre ligne', () => {
    setup({ extra: <button type="button">Exporter</button> });
    const extra = screen.getByRole('button', { name: 'Exporter' });
    const filters = screen.getByRole('button', { name: 'Filtres' });
    expect(extra.parentElement).not.toBe(filters.parentElement);
  });
});
