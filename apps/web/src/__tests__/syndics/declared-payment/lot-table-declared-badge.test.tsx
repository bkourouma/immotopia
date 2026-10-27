import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LotTable } from '../../../components/syndics/LotTable';
import type { SyndicateLot } from '../../../types/syndic-types';

/** Spec 047, R32 : pastille « Paiement déclaré » sur le lot visé par une déclaration en attente. */
const lot = (id: string, lotNumber: string) =>
  ({
    id,
    lotNumber,
    lotType: 'APARTMENT',
    generalShares: 10,
    owners: [],
    tenantAssignments: []
  }) as unknown as SyndicateLot;

describe('LotTable : pastille des paiements déclarés', () => {
  it('marque seulement les lots visés', () => {
    render(
      <MemoryRouter>
        <LotTable lots={[lot('l1', 'A12'), lot('l2', 'B07')]} declaredPendingLotIds={new Set(['l1'])} />
      </MemoryRouter>
    );
    expect(screen.getAllByText('Paiement déclaré')).toHaveLength(1);
    const row = screen.getByText('A12').closest('tr') as HTMLElement;
    expect(row.textContent).toContain('Paiement déclaré');
    expect((screen.getByText('B07').closest('tr') as HTMLElement).textContent).not.toContain('Paiement déclaré');
  });

  it('sans lots visés, aucune pastille', () => {
    render(
      <MemoryRouter>
        <LotTable lots={[lot('l1', 'A12')]} />
      </MemoryRouter>
    );
    expect(screen.queryByText('Paiement déclaré')).not.toBeInTheDocument();
  });
});
