import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropertyHoldingTaxSection } from '../../components/patrimoine/entities/PropertyHoldingTaxSection';

/**
 * BUG-2026-10-01-012 : à 375 px, « Enregistrer les détenteurs » débordait de
 * l'écran. jsdom ne mesure pas la mise en page ; on vérifie donc les classes de
 * repli posées (la mesure réelle à 375 px se rejoue au navigateur).
 */

vi.mock('../../services/patrimoine-entities-service', () => ({
  getPropertyHoldings: () =>
    Promise.resolve({
      propertyId: 'p',
      totalSharePercent: 60,
      unassignedSharePercent: 40,
      holdings: [
        {
          id: 'h1',
          entityId: 'e1',
          entityName: 'SCI',
          legalForm: 'SCI',
          country: 'CI',
          sharePercent: 60,
          effectiveFrom: null,
          notes: null
        }
      ],
      entities: [{ id: 'e1', name: 'SCI', legalForm: 'SCI', country: 'CI' }]
    }),
  getPropertyTaxProfile: () => Promise.resolve({ propertyId: 'p', profile: null, derived: null }),
  getPropertyTaxEstimate: () => new Promise(() => undefined),
  setPropertyHoldings: vi.fn(),
  setPropertyTaxProfile: vi.fn()
}));

describe('<PropertyHoldingTaxSection> — repli sur mobile', () => {
  it('les boutons et les lignes de détenteurs passent à la ligne', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AntApp>
          <PropertyHoldingTaxSection tenantId="a" propertyId="p" />
        </AntApp>
      </QueryClientProvider>
    );

    const save = await screen.findByRole('button', { name: 'Enregistrer les détenteurs' });
    expect(save.closest('.ant-space')).toHaveStyle({ flexWrap: 'wrap' });

    const select = screen.getByLabelText('Entité détentrice');
    const row = select.closest('.ant-row') as HTMLElement;
    expect(row).not.toBeNull();
    // Select pleine largeur sur mobile, quote-part et bouton Retirer sous lui.
    expect(select.closest('.ant-col')).toHaveClass('ant-col-xs-24');
    expect(row.style.rowGap).toBe('8px');
  });
});
