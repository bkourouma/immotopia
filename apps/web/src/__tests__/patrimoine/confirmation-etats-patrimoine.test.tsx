import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ExpensesSection } from '../../components/patrimoine/property-tab/ExpensesSection';
import { LoansSection } from '../../components/patrimoine/property-tab/LoansSection';
import { montantProps } from '../../components/patrimoine/property-tab/section-parts';
import type { PropertyExpense } from '../../types/patrimoine-types';

const depense = {
  id: 'dep-1',
  label: 'Plomberie',
  category: 'ROUTINE_MAINTENANCE',
  amount: 150000,
  currency: 'XOF',
  paidAt: new Date().toISOString(),
  isCapitalized: false
} as unknown as PropertyExpense;

const monter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('Onglet Patrimoine — confirmations, états vides et erreurs', () => {
  it('nomme la dépense dans la confirmation de suppression', async () => {
    const onDelete = vi.fn();
    monter(
      <ExpensesSection expenses={[depense]} busyActionId={null} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={onDelete} />
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByText('Supprimer la dépense « Plomberie » ?')).toBeInTheDocument();
    expect(screen.getByText('Cette suppression est définitive.')).toBeInTheDocument();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Supprimer' })).at(-1) as HTMLElement);
    expect(onDelete).toHaveBeenCalledWith('dep-1');
  });

  it('propose « Ajouter une dépense » dans l’état vide', async () => {
    const onAdd = vi.fn();
    monter(<ExpensesSection expenses={[]} busyActionId={null} onAdd={onAdd} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(await screen.findByText('Aucune dépense pour ce bien.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une dépense' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('affiche une erreur claire avec « Réessayer » au lieu du tableau', async () => {
    const onRetry = vi.fn();
    monter(
      <LoansSection
        loans={[]}
        error="Erreur de chargement des crédits"
        onRetry={onRetry}
        busyActionId={null}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const alerte = await screen.findByRole('alert');
    expect(within(alerte).getByText('Impossible de charger les crédits')).toBeInTheDocument();
    await userEvent.click(within(alerte).getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('formate les montants avec des séparateurs de milliers', () => {
    expect(montantProps.formatter(1234567)).toBe('1 234 567');
    expect(montantProps.formatter('1234.5678')).toBe('1 234.5678');
    expect(montantProps.parser('1 234 567')).toBe('1234567');
  });
});
