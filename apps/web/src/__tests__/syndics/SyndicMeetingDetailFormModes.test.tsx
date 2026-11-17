/**
 * Détail d'AG : réglages de champs de l'agence (informations, résolution, point d'ordre du jour).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SyndicMeetingDetail } from '../../pages/syndics/SyndicMeetingDetail';

const api = { getMeeting: vi.fn(), updateMeeting: vi.fn(), addMeetingResolution: vi.fn() };
type Mode = 'REQUIRED' | 'OPTIONAL' | 'HIDDEN';
let modes: Record<string, Record<string, Mode>> = {};

vi.mock('../../hooks/useFormFieldModes', () => ({
  useFormFieldModes: (formKey: string) => {
    const m = modes[formKey] ?? {};
    return {
      loading: false,
      mode: (key: string, fallback = 'OPTIONAL') => m[key] ?? fallback,
      isVisible: (key: string) => m[key] !== 'HIDDEN',
      isRequired: (key: string, fallback: boolean) => (m[key] ? m[key] === 'REQUIRED' : fallback)
    };
  }
}));

vi.mock('../../services/syndic-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/syndic-service')>('../../services/syndic-service');
  return {
    ...actual,
    getMeeting: (...a: unknown[]) => api.getMeeting(...a),
    updateMeeting: (...a: unknown[]) => api.updateMeeting(...a),
    addMeetingResolution: (...a: unknown[]) => api.addMeetingResolution(...a)
  };
});

vi.mock('../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 't1', syndicId: 's1', meetingId: 'm1', lotId: undefined })
}));
vi.mock('../../components/syndics/MeetingLiveConsole', () => ({
  MANUAL_VOTE_ANCHOR_ID: 'meeting-vote-entry',
  MeetingLiveConsole: () => null,
  default: () => null
}));
vi.mock('../../components/syndics/MeetingProxies', () => ({ MeetingProxies: () => null }));
vi.mock('../../components/syndics/MeetingAgenda', () => ({ MeetingAgenda: () => null }));
vi.mock('../../components/syndics/MeetingStatusActions', () => ({ MeetingStatusActions: () => null }));
vi.mock('../../components/syndics/MeetingConvocationWord', () => ({ MeetingConvocationWord: () => null }));

function makeMeeting() {
  return {
    id: 'm1',
    syndicateId: 's1',
    type: 'ORDINARY',
    scheduledAt: '2026-10-20T09:00:00.000Z',
    status: 'PLANNED',
    quorum: 0,
    createdAt: '',
    updatedAt: '',
    resolutions: [],
    agendaItems: [],
    syndicate: { lots: [] }
  };
}

function ui() {
  return (
    <MemoryRouter>
      <App>
        <SyndicMeetingDetail />
      </App>
    </MemoryRouter>
  );
}

const addButton = () => screen.getByRole('button', { name: /^(loading\s+)?Ajouter$/ });

beforeEach(() => {
  vi.clearAllMocks();
  modes = {};
  api.getMeeting.mockResolvedValue(makeMeeting());
  api.updateMeeting.mockResolvedValue({});
  api.addMeetingResolution.mockResolvedValue({ id: 'r-new' });
});

describe('SyndicMeetingDetail - réglages de champs', () => {
  it('informations : champs masqués absents du bandeau', async () => {
    modes['syndic.assemblee-informations'] = { startTime: 'HIDDEN', endTime: 'HIDDEN', location: 'HIDDEN' };
    render(ui());
    await screen.findByText('Détail assemblée générale');
    expect(screen.queryByLabelText('Heure début')).toBeNull();
    expect(screen.queryByLabelText('Heure fin')).toBeNull();
    expect(screen.queryByLabelText('Lieu')).toBeNull();
    // Rien à enregistrer : pas de bouton, donc pas de PATCH vide.
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
    expect(api.updateMeeting).not.toHaveBeenCalled();
  });

  it('informations : un lieu masqué n est pas envoyé', async () => {
    modes['syndic.assemblee-informations'] = { location: 'HIDDEN' };
    render(ui());
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.updateMeeting).toHaveBeenCalledTimes(1));
    expect(Object.keys(api.updateMeeting.mock.calls[0][3])).not.toContain('location');
  });

  it('informations : un lieu obligatoire affiche son message', async () => {
    modes['syndic.assemblee-informations'] = { location: 'REQUIRED' };
    render(ui());
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Le lieu est obligatoire')).toBeTruthy();
    expect(api.updateMeeting).not.toHaveBeenCalled();
  });

  it('résolution : description masquée absente et non envoyée', async () => {
    modes['syndic.assemblee-resolution'] = { description: 'HIDDEN' };
    render(ui());
    fireEvent.click(await screen.findByRole('button', { name: /Ajouter une résolution/ }));
    fireEvent.change(await screen.findByLabelText('Titre'), { target: { value: 'Toiture' } });
    expect(screen.queryByLabelText('Description')).toBeNull();
    fireEvent.click(addButton());
    await waitFor(() => expect(api.addMeetingResolution).toHaveBeenCalledTimes(1));
    expect(Object.keys(api.addMeetingResolution.mock.calls[0][3])).not.toContain('description');
  });

  it('résolution : description obligatoire affiche son message', async () => {
    modes['syndic.assemblee-resolution'] = { description: 'REQUIRED' };
    render(ui());
    fireEvent.click(await screen.findByRole('button', { name: /Ajouter une résolution/ }));
    fireEvent.change(await screen.findByLabelText('Titre'), { target: { value: 'Toiture' } });
    fireEvent.click(addButton());
    expect(await screen.findByText('La description est obligatoire')).toBeTruthy();
    expect(api.addMeetingResolution).not.toHaveBeenCalled();
  });

  it('ordre du jour : discussions masquées absentes', async () => {
    modes['syndic.assemblee-ordre-du-jour'] = { discussions: 'HIDDEN' };
    render(ui());
    fireEvent.click(await screen.findByRole('button', { name: /Ajouter un point/ }));
    await screen.findByLabelText('Titre du point');
    expect(screen.queryByLabelText(/Discussions/)).toBeNull();
  });

  it('ordre du jour : discussions obligatoires affichent leur message', async () => {
    modes['syndic.assemblee-ordre-du-jour'] = { discussions: 'REQUIRED' };
    render(ui());
    fireEvent.click(await screen.findByRole('button', { name: /Ajouter un point/ }));
    fireEvent.change(await screen.findByLabelText('Titre du point'), { target: { value: 'Budget' } });
    const saveButtons = screen.getAllByRole('button', { name: /^(loading\s+)?Enregistrer$/ });
    fireEvent.click(saveButtons[saveButtons.length - 1]);
    expect(await screen.findByText('Les discussions sont obligatoires')).toBeTruthy();
  });
});
