import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DeclarationsTable } from '../../../components/syndics/declared-payment/DeclarationsTable';
import type { SyndicDeclarationRow } from '../../../services/syndic-declared-payment-service';

/** Sous 992 px, la file des paiements déclarés passe en cartes : résumé lisible et « Examiner et décider » en un geste. */

const listSyndicDeclarations = vi.fn();

vi.mock(
  '../../../hooks/useFormFieldModes',
  async () => (await import('../../../__tests__/syndics/charges-form-modes-mock')).formModesModule
);
vi.mock('../../../services/syndic-declared-payment-service', () => ({
  listSyndicDeclarations: (...a: unknown[]) => listSyndicDeclarations(...a),
  listSyndicReceivingNumbers: () => Promise.resolve([])
}));
vi.mock('../../../services/syndic-service', () => ({ listSyndicateLots: () => Promise.resolve([]) }));
vi.mock('../../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'xs', isMobile: true, isTablet: false, isDesktop: false })
}));

const row = {
  id: 'd1',
  status: 'PENDING',
  receivingNumber: { id: 'n1', operator: 'WAVE', phoneNumber: '+2250707070707', holderName: 'Syndic Les Palmiers' },
  declaredBy: { type: 'COOWNER', contactId: 'c1', name: 'Awa Koné' },
  payerPhone: '+2250101010101',
  amount: 50000,
  acceptedAmount: null,
  paidAt: '2026-10-10T09:30:00.000Z',
  acceptedPaidAt: null,
  transactionReference: 'TX-REF-001',
  lines: [{ id: 'l1', lot: { id: 'lot-1', lotNumber: 'A12' }, amount: 50000, acceptedAmount: null, chargeCalls: [] }],
  hasProof: false,
  aiPrefilled: false,
  aiEditedFields: [],
  overdue: true,
  alerts: [],
  createdAt: '2026-10-11T08:00:00.000Z'
} as unknown as SyndicDeclarationRow;

describe('DeclarationsTable en cartes (mobile)', () => {
  beforeEach(() => {
    listSyndicDeclarations.mockReset();
    listSyndicDeclarations.mockResolvedValue({
      items: [row],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      counts: { pending: 1, overdue: 1, suspectedDuplicate: 0 }
    });
  });

  it('affiche une carte avec le déclarant, le lot, la référence et ouvre la déclaration', async () => {
    const onOpen = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AntApp>
          <MemoryRouter>
            <DeclarationsTable tenantId="t1" syndicId="s1" onOpen={onOpen} />
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Awa Koné', undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('A12')).toBeInTheDocument();
    expect(screen.getByText('TX-REF-001')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Examiner et décider/ }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }));
  });
});
