import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SaleAgreementDetail } from '../../pages/sales/SaleAgreementDetail';

/**
 * Fiche compromis — passage à l'acte (lot 9, PRD §3 `SaleAgreement`).
 *
 * « Acte refusé tant qu'une condition est `PENDING` » (PRD §7, recette) :
 * bouton désactivé côté écran, en plus du refus serveur. Neuf exports de
 * `sales-service` sont importés par `SaleAgreementDetail.tsx` ; tous sont
 * mockés (AGENTS.md).
 */

const getSaleAgreement = vi.fn();
const updateSaleAgreement = vi.fn();
const signSaleAgreement = vi.fn();
const completeSaleAgreement = vi.fn();
const cancelSaleAgreement = vi.fn();
const addSaleCondition = vi.fn();
const updateSaleCondition = vi.fn();
const deleteSaleCondition = vi.fn();
const replaceSaleMilestones = vi.fn();

vi.mock('../../services/sales-service', () => ({
  getSaleAgreement: (...a: unknown[]) => getSaleAgreement(...a),
  updateSaleAgreement: (...a: unknown[]) => updateSaleAgreement(...a),
  signSaleAgreement: (...a: unknown[]) => signSaleAgreement(...a),
  completeSaleAgreement: (...a: unknown[]) => completeSaleAgreement(...a),
  cancelSaleAgreement: (...a: unknown[]) => cancelSaleAgreement(...a),
  addSaleCondition: (...a: unknown[]) => addSaleCondition(...a),
  updateSaleCondition: (...a: unknown[]) => updateSaleCondition(...a),
  deleteSaleCondition: (...a: unknown[]) => deleteSaleCondition(...a),
  replaceSaleMilestones: (...a: unknown[]) => replaceSaleMilestones(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function agreement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agreement-1',
    number: 'CV-2026-0001',
    offerId: 'offer-1',
    mandateId: 'mandate-1',
    mandateNumber: 'MV-2026-0001',
    propertyId: 'property-1',
    propertyLabel: 'REF-001 · Villa Cocody',
    sellerName: 'Aissatou Barry',
    buyerContactId: 'contact-1',
    buyerName: 'Moussa Diallo',
    price: 48_000_000,
    depositAmount: 4_800_000,
    depositHolder: 'NOTARY',
    notaryName: 'Maître Koné',
    signedAt: '2026-09-10',
    expectedDeedDate: '2026-11-01',
    deedDate: null,
    status: 'SIGNED',
    cancelledAt: null,
    cancelReason: null,
    pendingConditionsCount: 1,
    createdAt: '2026-09-05',
    updatedAt: '2026-09-10',
    conditions: [
      { id: 'cond-1', label: 'Obtention du prêt bancaire', dueDate: null, status: 'PENDING', resolvedAt: null }
    ],
    milestones: [],
    commission: null,
    ...overrides
  };
}

function mount(url = '/tenant/agence-1/sales/agreements/agreement-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/sales/agreements/:id" element={<SaleAgreementDetail />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Fiche compromis — passage à l’acte', () => {
  it('désactive « Passer à l’acte » tant qu’une condition est en attente', async () => {
    getSaleAgreement.mockResolvedValue(agreement());
    mount();

    const bouton = await screen.findByRole('button', { name: 'Passer à l’acte' }, { timeout: 8000 });
    expect(bouton).toBeDisabled();
    expect(completeSaleAgreement).not.toHaveBeenCalled();
  });

  it('active « Passer à l’acte » une fois la condition remplie', async () => {
    getSaleAgreement.mockResolvedValue(
      agreement({
        pendingConditionsCount: 0,
        conditions: [
          { id: 'cond-1', label: 'Obtention du prêt bancaire', dueDate: null, status: 'MET', resolvedAt: '2026-09-20' }
        ]
      })
    );
    mount();

    const bouton = await screen.findByRole('button', { name: 'Passer à l’acte' }, { timeout: 8000 });
    expect(bouton).not.toBeDisabled();
  });

  it('confirme la date de l’acte et appelle completeSaleAgreement', async () => {
    getSaleAgreement.mockResolvedValue(agreement({ pendingConditionsCount: 0, conditions: [] }));
    completeSaleAgreement.mockResolvedValue(
      agreement({ status: 'COMPLETED', pendingConditionsCount: 0, deedDate: '2026-11-05' })
    );
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    mount();

    const bouton = await screen.findByRole('button', { name: 'Passer à l’acte' }, { timeout: 8000 });
    await user.click(bouton);

    await screen.findByText('Date de l’acte authentique', {}, { timeout: 8000 });
    await user.click(screen.getByText('Confirmer'));

    expect(completeSaleAgreement).toHaveBeenCalledWith('agence-1', 'agreement-1', expect.any(String));
  });
});

describe('Fiche compromis — rafraîchissement après signature (BUG-072)', () => {
  it('propose « Passer à l’acte » et masque « Signer le compromis » sans rechargement', async () => {
    const brouillon = agreement({ status: 'DRAFT', signedAt: null, pendingConditionsCount: 0, conditions: [] });
    const signe = agreement({ status: 'SIGNED', signedAt: '2026-09-30', pendingConditionsCount: 0, conditions: [] });
    getSaleAgreement.mockResolvedValueOnce(brouillon).mockResolvedValue(signe);
    signSaleAgreement.mockResolvedValue({ ...signe });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Signer le compromis' }, { timeout: 8000 }));
    await user.click(await screen.findByRole('button', { name: 'Signer' }, { timeout: 8000 }));

    expect(await screen.findByRole('button', { name: 'Passer à l’acte' }, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Signer le compromis' })).not.toBeInTheDocument());
  });
});
