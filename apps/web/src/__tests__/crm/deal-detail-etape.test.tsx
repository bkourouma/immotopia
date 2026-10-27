import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';

/**
 * BUG-2026-09-28-017 (recette OI, D.5) : après un changement d'étape, la
 * réponse allégée du PATCH (sans téléphone du contact) remplaçait le détail
 * chargé, et la ligne « Téléphone » disparaissait jusqu'au rechargement.
 * Les libellés sont accentués : « Créé le », « Modifié le », « Qualifié ».
 */

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../../utils/api-client', () => ({ default: api, __esModule: true }));
vi.mock('../../components/properties/PropertyMatching', () => ({
  PropertyMatching: () => <div data-testid="matching" />
}));

import { DealDetail } from '../../components/crm/DealDetail';

const deal = {
  id: 'deal-1',
  type: 'VENTE',
  stage: 'NEW',
  version: 1,
  budgetMin: 40000000,
  budgetMax: 50000000,
  createdAt: '2026-09-28T10:00:00.000Z',
  updatedAt: '2026-09-28T10:00:00.000Z',
  contact: {
    id: 'c1',
    firstName: 'Mariam',
    lastName: 'Koné OI',
    email: 'm@oi.test',
    phonePrimary: '+225 0700000007'
  },
  activities: []
};

describe('DealDetail', () => {
  it("garde le téléphone du contact après un changement d'étape", async () => {
    api.get.mockResolvedValue({ data: { success: true, data: deal } });
    // Réponse du PATCH : ni téléphone, ni activités.
    api.patch.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...deal,
          stage: 'QUALIFIED',
          version: 2,
          activities: undefined,
          contact: { id: 'c1', firstName: 'Mariam', lastName: 'Koné OI', email: 'm@oi.test' }
        }
      }
    });

    render(
      <AntApp>
        <MemoryRouter>
          <DealDetail tenantId="agence-1" dealId="deal-1" />
        </MemoryRouter>
      </AntApp>
    );

    expect(await screen.findByText('+225 0700000007')).toBeInTheDocument();
    // Libellés accentués, type traduit.
    expect(screen.getByText('Téléphone')).toBeInTheDocument();
    expect(screen.getByText('Créé le')).toBeInTheDocument();
    expect(screen.getByText('Modifié le')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vente' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByTitle('Qualifié'));

    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText('Qualifié').length).toBeGreaterThan(0));
    expect(screen.getByText('+225 0700000007')).toBeInTheDocument();
  });
});
