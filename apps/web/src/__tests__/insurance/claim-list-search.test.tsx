import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ClaimList } from '../../components/insurance/ClaimList';
import type { InsuranceClaimDto } from '../../types/insurance-types';

/**
 * Sinistres d'UN bien : la liste n'a de barre de recherche (locale, préfixe
 * `sin`) qu'au-delà de 10 sinistres ; en deçà elle reste telle quelle.
 */

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const T = { timeout: 8000 };

function sinistre(index: number, overrides: Partial<InsuranceClaimDto> = {}): InsuranceClaimDto {
  return {
    id: `sin-${index}`,
    propertyId: 'bien-1',
    propertyReference: 'REF-1',
    policyId: 'pol-1',
    policyLabel: `Assureur ${index}`,
    ticketId: null,
    ticketTitle: null,
    expenseId: null,
    occurredAt: '2026-08-10T00:00:00.000Z',
    declaredAt: '2026-08-11T00:00:00.000Z',
    cause: 'WATER_DAMAGE',
    description: `Dossier numéro ${index}`,
    status: 'DECLARED',
    claimedAmount: 100000 * index,
    indemnifiedAmount: null,
    deductible: null,
    outOfPocketAmount: null,
    currency: 'XOF',
    rejectionReason: null,
    insurerNotifiedAt: null,
    expertiseAt: null,
    settledAt: null,
    rejectedAt: null,
    closedAt: null,
    allowedNextStatuses: [],
    documentsCount: 0,
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
    ...overrides
  };
}

function Adresse() {
  return <div data-testid="adresse">{useLocation().search}</div>;
}

function monter(claims: InsuranceClaimDto[], url = '/biens/bien-1') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Adresse />
      <ClaimList claims={claims} onOpen={vi.fn()} />
    </MemoryRouter>
  );
}

describe('ClaimList : barre de recherche au-delà de 10 sinistres', () => {
  it('n’affiche pas de barre pour 10 sinistres ou moins', () => {
    monter(Array.from({ length: 10 }, (_, i) => sinistre(i + 1)));
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Détail' })).toHaveLength(10);
  });

  it('signale la troncature à 200 sinistres, et seulement alors', async () => {
    const { unmount } = monter(Array.from({ length: 200 }, (_, i) => sinistre(i + 1)));
    expect(await screen.findByText(/La liste est limitée aux 200 sinistres/, {}, T)).toBeInTheDocument();
    unmount();
    monter(Array.from({ length: 3 }, (_, i) => sinistre(i + 1)));
    expect(screen.queryByText(/La liste est limitée aux/)).not.toBeInTheDocument();
  });

  it('affiche la barre nommée, le compteur et pagine à 20 par page au-delà de 10', async () => {
    monter(Array.from({ length: 25 }, (_, i) => sinistre(i + 1)));
    const barre = await screen.findByRole('search', { name: 'Rechercher dans les sinistres' }, T);
    expect(within(barre).getByText('25 résultats')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Détail' })).toHaveLength(20);
  });

  it('filtre localement par le texte (police, description) et garde le terme dans l’URL préfixée', async () => {
    const user = userEvent.setup({ delay: null });
    monter(Array.from({ length: 12 }, (_, i) => sinistre(i + 1)));
    const champ = await screen.findByPlaceholderText('Cause, statut, police, description…', {}, T);
    await user.type(champ, 'Dossier numéro 7');
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Détail' })).toHaveLength(1), T);
    expect(screen.getByText(/Assureur 7/)).toBeInTheDocument();
    expect(screen.getByTestId('adresse')).toHaveTextContent('sin.q=');
  });

  it('applique le statut d’une URL partagée et montre « 0 résultat » quand rien ne correspond', async () => {
    monter(
      Array.from({ length: 12 }, (_, i) => sinistre(i + 1, i === 0 ? { status: 'SETTLED' } : {})),
      '/biens/bien-1?sin.status=SETTLED'
    );
    const barre = await screen.findByRole('search', {}, T);
    expect(await within(barre).findByText('1 résultat', {}, T)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Détail' })).toHaveLength(1);
  });

  it('« Effacer les critères » ramène la liste complète', async () => {
    const user = userEvent.setup({ delay: null });
    monter(
      Array.from({ length: 12 }, (_, i) => sinistre(i + 1)),
      '/biens/bien-1?sin.q=zzz'
    );
    const barre = await screen.findByRole('search', {}, T);
    expect(await within(barre).findByText('0 résultat', {}, T)).toBeInTheDocument();
    await user.click(within(barre).getByRole('button', { name: 'Effacer les critères' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Détail' })).toHaveLength(12), T);
    expect(screen.getByTestId('adresse')).not.toHaveTextContent('sin.q');
  });
});
