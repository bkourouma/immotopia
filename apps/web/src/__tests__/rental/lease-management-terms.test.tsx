import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { LeaseManagementTermsCard } from '../../components/rental/LeaseManagementTermsCard';
import type { LeaseManagementTerms } from '../../services/lease-management-terms-service';

/**
 * Carte « Honoraires et gestionnaire » d'un bail.
 *
 * Le contrat d'API (lot 2 §4) n'est pas encore servi par le backend : ces
 * tests montent la carte contre un mock du service, pas contre une vraie API.
 */

const getLeaseManagementTerms = vi.fn();
const updateLeaseManagementTerms = vi.fn();

vi.mock('../../services/lease-management-terms-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/lease-management-terms-service')>();
  return {
    ...actual,
    getLeaseManagementTerms: (...a: unknown[]) => getLeaseManagementTerms(...a),
    updateLeaseManagementTerms: (...a: unknown[]) => updateLeaseManagementTerms(...a)
  };
});

function termes(overrides: Partial<LeaseManagementTerms> = {}): LeaseManagementTerms {
  return {
    leaseId: 'bail-1',
    ownerClientId: 'prop-1',
    override: null,
    agentUserId: null,
    effective: {
      source: 'AGENCY',
      managementFeeMode: 'PERCENT',
      managementFeeRate: 8,
      managementFeeFixedAmount: null,
      managementFeeBase: 'RENT_ONLY'
    },
    agents: [
      { userId: 'user-1', fullName: 'Fatou Camara' },
      { userId: 'user-2', fullName: 'Ismaël Bah' }
    ],
    ...overrides
  };
}

function mount(data: LeaseManagementTerms) {
  getLeaseManagementTerms.mockResolvedValue(data);
  return render(
    <AntApp>
      <MemoryRouter>
        <LeaseManagementTermsCard tenantId="agence-1" leaseId="bail-1" />
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Carte honoraires — origine du taux applicable', () => {
  it('affiche « Conditions du propriétaire » quand le taux vient du propriétaire', async () => {
    mount(
      termes({
        effective: {
          source: 'OWNER',
          managementFeeMode: 'PERCENT',
          managementFeeRate: 10,
          managementFeeFixedAmount: null,
          managementFeeBase: 'RENT_ONLY'
        }
      })
    );

    expect(await screen.findByText('Conditions du propriétaire')).toBeInTheDocument();
    expect(screen.getByText('10 %')).toBeInTheDocument();
  });

  it('affiche « Aucun taux fixé » avec un lien vers les paramètres financiers quand rien n’est paramétré', async () => {
    mount(termes({ effective: { source: 'NONE' } }));

    expect(await screen.findByText('Aucun taux fixé')).toBeInTheDocument();
    const lien = screen.getByRole('link', { name: 'Fixer le taux d’honoraires' });
    expect(lien).toHaveAttribute('href', '/tenant/agence-1/settings/finance');
  });
});

describe('Carte honoraires — conditions propres au bail', () => {
  it('affiche la saisie du mode et du taux quand on active l’interrupteur', async () => {
    const user = userEvent.setup({ delay: null });
    mount(termes());

    expect(await screen.findByText('Honoraires applicables')).toBeInTheDocument();
    expect(screen.queryByText('Calculés sur')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch'));

    expect(await screen.findByText('Calculés sur')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pourcentage' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Forfait par échéance' })).toBeInTheDocument();
  });

  it('enregistre avec la charge utile attendue', async () => {
    const user = userEvent.setup({ delay: null });
    updateLeaseManagementTerms.mockResolvedValue(termes());
    mount(termes());

    await screen.findByText('Honoraires applicables');
    await user.click(screen.getByRole('switch'));

    const tauxInput = await screen.findByRole('spinbutton');
    await user.clear(tauxInput);
    await user.type(tauxInput, '12');

    await user.click(screen.getByRole('button', { name: /Enregistrer/ }));

    await waitFor(() => expect(updateLeaseManagementTerms).toHaveBeenCalled());
    expect(updateLeaseManagementTerms).toHaveBeenCalledWith('agence-1', 'bail-1', {
      override: {
        managementFeeMode: 'PERCENT',
        managementFeeRate: 12,
        managementFeeFixedAmount: null,
        managementFeeBase: 'RENT_ONLY'
      },
      agentUserId: null
    });
  });

  it('envoie « override: null » quand l’interrupteur reste désactivé', async () => {
    const user = userEvent.setup({ delay: null });
    updateLeaseManagementTerms.mockResolvedValue(termes());
    mount(termes());

    await screen.findByText('Honoraires applicables');
    await user.click(screen.getByRole('button', { name: /Enregistrer/ }));

    await waitFor(() => expect(updateLeaseManagementTerms).toHaveBeenCalled());
    expect(updateLeaseManagementTerms).toHaveBeenCalledWith('agence-1', 'bail-1', {
      override: null,
      agentUserId: null
    });
  });
});
