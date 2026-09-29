import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderList, ProviderWithContracts } from '../../components/syndics/ProviderList';
import { MaintenanceContract } from '../../types/syndic-types';

/**
 * `<ProviderList>` — prestataires de l'agence vus depuis une copropriété :
 * filtre « Sous contrat » par défaut, bascule vers « Tous », tri (contrats
 * actifs puis nombre de contrats puis nom), colonne d'actions propre à
 * l'écran appelant, état vide. Rendu avec le vrai antd (pas de mock) : ces
 * comportements dépendent de `<Segmented>`/`<Table>` réels.
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
  it('filtre par défaut sur « Sous contrat » quand au moins un prestataire en a un', () => {
    const providers = [
      provider({ id: 'p1', name: 'Hydro-Tech Plomberie', contracts: [contract({ id: 'c1', providerId: 'p1' })] }),
      provider({ id: 'p2', name: 'Sans Contrat SARL' })
    ];

    render(<ProviderList providers={providers} />);

    expect(screen.getByText('Hydro-Tech Plomberie')).toBeInTheDocument();
    expect(screen.queryByText('Sans Contrat SARL')).not.toBeInTheDocument();
    expect(screen.getByText('Sous contrat (1)')).toBeInTheDocument();
    expect(screen.getByText('Tous (2)')).toBeInTheDocument();
  });

  it('bascule sur « Tous » quand aucun prestataire n’a de contrat avec cette copropriété', () => {
    const providers = [provider({ id: 'p1', name: 'Sans Contrat SARL' })];

    render(<ProviderList providers={providers} />);

    expect(screen.getByText('Sans Contrat SARL')).toBeInTheDocument();
  });

  it('bascule vers « Tous » au clic', async () => {
    const user = userEvent.setup();
    const providers = [
      provider({ id: 'p1', name: 'Hydro-Tech Plomberie', contracts: [contract({ id: 'c1', providerId: 'p1' })] }),
      provider({ id: 'p2', name: 'Sans Contrat SARL' })
    ];

    render(<ProviderList providers={providers} />);
    expect(screen.queryByText('Sans Contrat SARL')).not.toBeInTheDocument();

    await user.click(screen.getByText('Tous (2)'));

    expect(screen.getByText('Sans Contrat SARL')).toBeInTheDocument();
    expect(screen.getByText('Hydro-Tech Plomberie')).toBeInTheDocument();
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

    render(<ProviderList providers={providers} />);

    const names = screen.getAllByText(/Zeta Sécurité|Alpha Ascenseurs/).map(node => node.textContent);
    expect(names).toEqual(['Alpha Ascenseurs', 'Zeta Sécurité']);
  });

  it('garde les actions propres à l’écran appelant', () => {
    const providers = [provider({ id: 'p1', name: 'Hydro-Tech Plomberie' })];

    render(<ProviderList providers={providers} renderActions={p => <button>Modifier {p.name}</button>} />);

    expect(screen.getByText('Modifier Hydro-Tech Plomberie')).toBeInTheDocument();
  });

  it('affiche un état vide sans prestataire', () => {
    render(<ProviderList providers={[]} />);
    expect(screen.getByText('Aucun prestataire')).toBeInTheDocument();
  });
});
