import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CoOwnerMeetings from '../../pages/CoOwnerPortal/Meetings';
import type { CoOwnerMeeting } from '../../services/coowner-portal-service';

const listMyMeetings = vi.fn();
const requestLiveAccess = vi.fn();

vi.mock('../../services/coowner-portal-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/coowner-portal-service')>(
    '../../services/coowner-portal-service'
  );
  return {
    ...actual,
    listMyMeetings: (...a: unknown[]) => listMyMeetings(...a),
    requestLiveAccess: (...a: unknown[]) => requestLiveAccess(...a)
  };
});

function meeting(overrides: Partial<CoOwnerMeeting> = {}): CoOwnerMeeting {
  return {
    id: 'm1',
    type: 'ORDINARY',
    scheduledAt: '2026-10-20T09:00:00.000Z',
    location: 'Salle des fêtes',
    status: 'PLANNED',
    syndicate: 'Résidence Les Acacias',
    liveAvailable: true,
    agenda: [],
    resolutions: [],
    ...overrides
  };
}

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CoOwnerMeetings />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const assign = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, origin: 'http://localhost:3000', assign }
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('Portail copropriétaire — AG en direct', () => {
  it('ne propose pas le bouton quand l’AG n’est pas disponible en direct', async () => {
    listMyMeetings.mockResolvedValue([meeting({ liveAvailable: false })]);
    mount();
    await screen.findByText('Résidence Les Acacias');
    expect(screen.queryByRole('button', { name: "Rejoindre l'AG en direct" })).toBeNull();
  });

  it('obtient le lien personnel puis navigue dessus', async () => {
    listMyMeetings.mockResolvedValue([meeting()]);
    requestLiveAccess.mockResolvedValue({ url: 'https://app.example.com/ag-direct#jeton' });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: "Rejoindre l'AG en direct" }));
    await waitFor(() => expect(requestLiveAccess).toHaveBeenCalledWith('m1'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://app.example.com/ag-direct#jeton'));
  });

  it('refuse de suivre une adresse qui n’est pas http(s) et affiche une erreur', async () => {
    listMyMeetings.mockResolvedValue([meeting()]);
    requestLiveAccess.mockResolvedValue({ url: 'javascript:alert(1)' });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: "Rejoindre l'AG en direct" }));
    expect(await screen.findByText("Impossible de rejoindre l'assemblée en direct pour le moment.")).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it('affiche une erreur quand le serveur refuse (AG clôturée)', async () => {
    listMyMeetings.mockResolvedValue([meeting()]);
    requestLiveAccess.mockRejectedValue({ response: { status: 409 } });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: "Rejoindre l'AG en direct" }));
    expect(await screen.findByText("Impossible de rejoindre l'assemblée en direct pour le moment.")).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });
});
