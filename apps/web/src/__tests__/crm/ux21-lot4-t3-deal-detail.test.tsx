import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';

/**
 * Lot 4 UI/UX, tâche T3 : détail d'affaire. L'action suivante est le bouton principal ;
 * conclure l'affaire (« Gagnée ») demande une confirmation, les autres étapes non.
 */

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../../utils/api-client', () => ({ default: api, __esModule: true }));
vi.mock('../../components/properties/PropertyMatching', () => ({
  PropertyMatching: () => <div data-testid="matching" />
}));

import { DealDetail } from '../../components/crm/DealDetail';

const T = { timeout: 8000 };

const deal = (stage: string) => ({
  id: 'deal-1',
  type: 'VENTE',
  stage,
  version: 1,
  createdAt: '2026-09-28T10:00:00.000Z',
  updatedAt: '2026-09-28T10:00:00.000Z',
  contact: { id: 'c1', firstName: 'Mariam', lastName: 'Kone', email: 'm@oi.test', phonePrimary: '+225 0700000007' },
  activities: []
});

function mount() {
  return render(
    <AntApp>
      <MemoryRouter>
        <DealDetail tenantId="agence-1" dealId="deal-1" />
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DealDetail — étape suivante', { timeout: 60_000 }, () => {
  it('le bouton principal passe à l’étape suivante sans confirmation', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: { success: true, data: deal('NEW') } });
    api.patch.mockResolvedValue({ data: { success: true, data: { ...deal('QUALIFIED'), version: 2 } } });
    mount();

    await user.click(await screen.findByRole('button', { name: /Passer à « Qualifié »/ }, T));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1), T);
    expect(api.patch.mock.calls[0][1]).toMatchObject({ stage: 'QUALIFIED', version: 1 });
  });

  it('passer à « Gagné » demande confirmation avant d’appeler le serveur', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: { success: true, data: deal('NEGOTIATION') } });
    api.patch.mockResolvedValue({ data: { success: true, data: { ...deal('WON'), version: 2 } } });
    mount();

    await user.click(await screen.findByRole('button', { name: /Passer à « Gagné »/ }, T));
    const dialogue = await screen.findByRole('dialog', undefined, T);
    expect(api.patch).not.toHaveBeenCalled();

    await user.click(within(dialogue).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1), T);
    expect(api.patch.mock.calls[0][1]).toMatchObject({ stage: 'WON', version: 1 });
  });
});
