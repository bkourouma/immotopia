import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';

/**
 * BUG-2026-11-04-055 : l'onglet « Déclarations en attente » arrondissait les
 * montants à l'entier (0,01 -> « 0 ») et écrivait « F CFA ».
 */
const listPaymentDeclarations = vi.fn();
vi.mock('../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/rental-service')>();
  return { ...actual, listPaymentDeclarations: (...a: unknown[]) => listPaymentDeclarations(...a) };
});
vi.mock('../../components/finance/TreasuryAccountSelector', () => ({ TreasuryAccountSelector: () => null }));

import { PaymentDeclarationsList } from '../../components/rental/PaymentDeclarationsList';

const declaration = (id: string, amount: number) => ({
  id,
  tenant_id: 'a',
  lease_id: 'b',
  declared_by: 'u',
  amount,
  payment_date: '2026-11-01',
  payment_method: 'CASH',
  status: 'PENDING',
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
  lease: { id: 'b', lease_number: `BAIL-${id}` }
});

describe('Déclarations en attente — montants', () => {
  it('affiche le montant exact et FCFA', async () => {
    listPaymentDeclarations.mockResolvedValue({
      success: true,
      data: [declaration('1', 0.01), declaration('2', 1500.5), declaration('3', 150000)],
      pagination: { page: 1, limit: 100, total: 3, totalPages: 1 }
    });
    render(
      <AntApp>
        <PaymentDeclarationsList tenantId="agence-1" />
      </AntApp>
    );
    const texte = async (re: RegExp) => screen.findByText(re, {}, { timeout: 15000 });
    expect(await texte(/^0,01\sFCFA$/)).toBeInTheDocument();
    expect(await texte(/^1\s500,50\sFCFA$/)).toBeInTheDocument();
    expect(await texte(/^150\s000\sFCFA$/)).toBeInTheDocument();
    expect(screen.queryByText(/F CFA/)).toBeNull();
  });
});
