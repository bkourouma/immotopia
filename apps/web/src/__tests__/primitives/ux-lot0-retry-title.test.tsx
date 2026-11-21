import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PageHeader, StateBlock } from '../../components/primitives';

// Lot UX 0 : aides à l'usage ajoutées aux primitives (rétrocompatibles).

describe('StateBlock onRetry', () => {
  it('affiche « Réessayer » sur une erreur et relance au clic', async () => {
    const onRetry = vi.fn();
    render(<StateBlock variant="error" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('n’ajoute rien sans onRetry, ni sur un état vide', () => {
    const { rerender } = render(<StateBlock variant="error" />);
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
    rerender(<StateBlock variant="empty" onRetry={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });
});

describe('PageHeader titre de document', () => {
  it('met à jour document.title puis le restaure au démontage', () => {
    document.title = 'Avant';
    const { unmount } = render(
      <MemoryRouter>
        <PageHeader title="Mes biens" />
      </MemoryRouter>
    );
    expect(document.title).toBe('Mes biens · ImmoTopia');
    unmount();
    expect(document.title).toBe('Avant');
  });
});
