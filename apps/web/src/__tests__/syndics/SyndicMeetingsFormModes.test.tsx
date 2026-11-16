/**
 * Création d'AG : réglages de champs de l'agence (formulaire `syndic.assemblee-creation`).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from 'antd';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SyndicMeetings } from '../../pages/syndics/SyndicMeetings';

const api = { listMeetings: vi.fn() };
let modes: Record<string, 'REQUIRED' | 'OPTIONAL' | 'HIDDEN'> = {};

vi.mock('../../hooks/useFormFieldModes', () => ({
  useFormFieldModes: () => ({
    loading: false,
    mode: (key: string, fallback = 'OPTIONAL') => modes[key] ?? fallback,
    isVisible: (key: string) => modes[key] !== 'HIDDEN',
    isRequired: (key: string, fallback: boolean) => (modes[key] ? modes[key] === 'REQUIRED' : fallback)
  })
}));

vi.mock('../../services/syndic-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/syndic-service')>('../../services/syndic-service');
  return {
    ...actual,
    listMeetings: (...a: unknown[]) => api.listMeetings(...a),
    listMeetingsPage: async (...a: unknown[]) => {
      const items = await api.listMeetings(...a);
      return { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } };
    }
  };
});

vi.mock('../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 't1', syndicId: 's1', meetingId: undefined, lotId: undefined })
}));

async function openModal() {
  render(
    <MemoryRouter>
      <App>
        <SyndicMeetings />
      </App>
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByRole('button', { name: /Nouvelle assemblée/ }));
  await screen.findByLabelText('Date');
}

beforeEach(() => {
  vi.clearAllMocks();
  modes = {};
  api.listMeetings.mockResolvedValue([]);
});

describe('SyndicMeetings - réglages de champs', () => {
  it('affiche les champs facultatifs par défaut', async () => {
    await openModal();
    expect(screen.getByLabelText('Lieu')).toBeTruthy();
    expect(screen.getByLabelText('Heure de fin')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Envoyer les convocations maintenant' })).toBeTruthy();
  });

  it('un champ masqué est absent du formulaire', async () => {
    modes = { location: 'HIDDEN', endTime: 'HIDDEN', sendConvocation: 'HIDDEN' };
    await openModal();
    expect(screen.queryByLabelText('Lieu')).toBeNull();
    expect(screen.queryByLabelText('Heure de fin')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Envoyer les convocations maintenant' })).toBeNull();
  });

  it('un lieu obligatoire affiche son message à la validation', async () => {
    modes = { location: 'REQUIRED' };
    await openModal();
    fireEvent.click(screen.getByRole('button', { name: /Créer/ }));
    expect(await screen.findByText('Le lieu est obligatoire')).toBeTruthy();
  });
});
