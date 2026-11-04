import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { OwnerFeeTermsCard } from '../../components/settings/OwnerFeeTermsCard';
import { AgentCommissionCard } from '../../components/settings/AgentCommissionCard';

/**
 * Réglages d'agence (lot DIV-C) : conditions par propriétaire (recherche locale)
 * et commission des collaborateurs (barre au-delà de 10 lignes).
 */

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const svc = vi.hoisted(() => ({ listOwnerFeeTerms: vi.fn(), listAgentCommissionShares: vi.fn() }));
vi.mock('../../services/agency-finance-settings-service', () => ({
  listOwnerFeeTerms: (...a: unknown[]) => svc.listOwnerFeeTerms(...a),
  updateOwnerFeeTerms: vi.fn(),
  deleteOwnerFeeTerms: vi.fn(),
  listAgentCommissionShares: (...a: unknown[]) => svc.listAgentCommissionShares(...a),
  updateAgentCommissionShare: vi.fn()
}));

const T = { timeout: 8000 };

function mount(element: React.ReactElement, path = '/') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
    </AntApp>
  );
}

const proprietaire = (id: string, ownerName: string, terms: unknown) => ({
  ownerClientId: id,
  ownerName,
  email: `${id}@ex.com`,
  leaseCount: 1,
  terms,
  ownerTaxStatus: null
});

beforeEach(() => {
  svc.listOwnerFeeTerms.mockReset();
  svc.listAgentCommissionShares.mockReset();
});

describe('OwnerFeeTermsCard — recherche locale', () => {
  it('filtre par nom (sans accent) puis par type de conditions', async () => {
    const user = userEvent.setup();
    svc.listOwnerFeeTerms.mockResolvedValue([
      proprietaire('o1', 'Aïcha Koné', null),
      proprietaire('o2', 'Yao Brou', {
        managementFeeMode: 'FIXED',
        managementFeeRate: null,
        managementFeeFixedAmount: 50000,
        managementFeeBase: 'RENT_ONLY'
      })
    ]);
    mount(<OwnerFeeTermsCard tenantId="t1" />);
    await screen.findByText('Aïcha Koné', undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'aicha');
    await vi.waitFor(() => expect(screen.queryByText('Yao Brou')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Aïcha Koné')).toBeInTheDocument();
  });

  it('applique le type de conditions de l’URL', async () => {
    svc.listOwnerFeeTerms.mockResolvedValue([
      proprietaire('o1', 'Aïcha Koné', null),
      proprietaire('o2', 'Yao Brou', {
        managementFeeMode: 'FIXED',
        managementFeeRate: null,
        managementFeeFixedAmount: 50000,
        managementFeeBase: 'RENT_ONLY'
      })
    ]);
    mount(<OwnerFeeTermsCard tenantId="t1" />, '/?prop.mode=FIXED');
    await screen.findByText('Yao Brou', undefined, T);
    expect(screen.queryByText('Aïcha Koné')).not.toBeInTheDocument();
  });
});

describe('AgentCommissionCard — barre au-delà de 10 lignes', () => {
  const agents = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      userId: `u${i}`,
      fullName: `Agent ${String(i).padStart(2, '0')}`,
      email: `agent${i}@ex.com`,
      sharePercent: null
    }));

  it('pas de barre pour un petit effectif', async () => {
    svc.listAgentCommissionShares.mockResolvedValue(agents(3));
    mount(<AgentCommissionCard tenantId="t1" />);
    await screen.findByText('Agent 00', undefined, T);
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });

  it('barre et filtrage local au-delà de 10 collaborateurs', async () => {
    const user = userEvent.setup();
    svc.listAgentCommissionShares.mockResolvedValue(agents(14));
    mount(<AgentCommissionCard tenantId="t1" />);
    await screen.findByText('Agent 00', undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'agent 07');
    await vi.waitFor(() => expect(screen.queryByText('Agent 00')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Agent 07')).toBeInTheDocument();
  });
});
