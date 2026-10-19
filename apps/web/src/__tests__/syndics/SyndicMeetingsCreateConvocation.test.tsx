/**
 * Création d'AG : les convocations ne partent plus d'office. La case est décochée par défaut,
 * l'aide l'explique, et un NOT_SENT ne lance aucun suivi d'envoi.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from 'antd';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SyndicMeetings } from '../../pages/syndics/SyndicMeetings';

const api = { listMeetings: vi.fn() };

vi.mock('../../services/syndic-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/syndic-service')>('../../services/syndic-service');
  return {
    ...actual,
    listMeetings: (...a: unknown[]) => api.listMeetings(...a)
  };
});

vi.mock('../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 't1', syndicId: 's1', meetingId: undefined, lotId: undefined })
}));

function mount() {
  render(
    <MemoryRouter>
      <App>
        <SyndicMeetings />
      </App>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listMeetings.mockResolvedValue([]);
});

describe('SyndicMeetings - convocations à la création', () => {
  it('propose la case « Envoyer les convocations maintenant » décochée, avec son aide', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Nouvelle assemblée/ }));
    const box = (await screen.findByRole('checkbox', {
      name: 'Envoyer les convocations maintenant'
    })) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(
      screen.getByText("Vous pourrez les envoyer depuis l'assemblée une fois l'ordre du jour saisi.")
    ).toBeTruthy();
  });
});
