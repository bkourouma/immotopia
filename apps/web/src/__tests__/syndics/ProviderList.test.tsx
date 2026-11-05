import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProviderList, ProviderWithContracts } from '../../components/syndics/ProviderList';
import { MaintenanceContract } from '../../types/syndic-types';

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function renderList(props: React.ComponentProps<typeof ProviderList>) {
  return render(
    <MemoryRouter>
      <ProviderList {...props} />
    </MemoryRouter>
  );
}

/**
 * `<ProviderList>` — prestataires de l'agence vus depuis une copropriété :
 * tous affichés (la recherche locale et son critère « Contrat » les filtrent),
 * tri (contrats actifs puis nombre de contrats puis nom), colonne d'actions
 * propre à l'écran appelant, état vide. Rendu avec le vrai antd (pas de mock) ;
 * la recherche elle-même est couverte par `ProvidersSearch.test.tsx`.
 */

function contract(overrides: Partial<MaintenanceContract>): MaintenanceContract {
  return {
    id: overrides.id || 'c1',
    syndicateId: 's1',
    providerId: overrides.providerId || 'p1',
    nature: 'Entretien',
    startDate: '2026-01-01T00:00:00.000Z',
    currency: 'XOF',
    renewalAlertDays: 30,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function provider(overrides: Partial<ProviderWithContracts>): ProviderWithContracts {
  return {
    id: overrides.id || 'p1',
    tenantId: 't1',
    name: 'Prestataire',
    ...overrides
  };
}

describe('ProviderList', () => {
  it('affiche tous les prestataires, ceux sous contrat en premier', () => {
    const providers = [
      provider({ id: 'p2', name: 'Sans Contrat SARL' }),
      provider({ id: 'p1', name: 'Hydro-Tech Plomberie', contracts: [contract({ id: 'c1', providerId: 'p1' })] })
    ];

    renderList({ providers });

    const names = screen.getAllByText(/Hydro-Tech Plomberie|Sans Contrat SARL/).map(node => node.textContent);
    expect(names).toEqual(['Hydro-Tech Plomberie', 'Sans Contrat SARL']);
  });

  it('résume les contrats actifs et terminés de chaque prestataire', () => {
    const providers = [
      provider({
        id: 'p1',
        name: 'Hydro-Tech Plomberie',
        contracts: [
          contract({ id: 'c1', providerId: 'p1' }),
          contract({ id: 'c2', providerId: 'p1', status: 'TERMINATED' })
        ]
      }),
      provider({ id: 'p2', name: 'Sans Contrat SARL' })
    ];

    renderList({ providers });

    expect(screen.getByText('1 actif')).toBeInTheDocument();
    expect(screen.getByText('1 terminé')).toBeInTheDocument();
    expect(screen.getByText('Aucun contrat')).toBeInTheDocument();
  });

  it('trie les prestataires sous contrat actif avant ceux au contrat terminé, puis par nom', () => {
    const providers = [
      provider({
        id: 'p1',
        name: 'Zeta Sécurité',
        contracts: [contract({ id: 'c1', providerId: 'p1', status: 'TERMINATED' })]
      }),
      provider({
        id: 'p2',
        name: 'Alpha Ascenseurs',
        contracts: [contract({ id: 'c2', providerId: 'p2', status: 'ACTIVE' })]
      })
    ];

    renderList({ providers });

    const names = screen.getAllByText(/Zeta Sécurité|Alpha Ascenseurs/).map(node => node.textContent);
    expect(names).toEqual(['Alpha Ascenseurs', 'Zeta Sécurité']);
  });

  it('garde les actions propres à l’écran appelant', () => {
    const providers = [provider({ id: 'p1', name: 'Hydro-Tech Plomberie' })];

    renderList({ providers, renderActions: p => <button>Modifier {p.name}</button> });

    expect(screen.getByText('Modifier Hydro-Tech Plomberie')).toBeInTheDocument();
  });

  it('affiche un état vide sans prestataire', () => {
    renderList({ providers: [] });
    expect(screen.getByText('Aucun prestataire')).toBeInTheDocument();
  });
});
