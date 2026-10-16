import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { VisioJoinInfo } from '../../types/syndic-live-types';

/* --- doubles de LiveKit : le rendu réel exige un serveur, on vérifie la logique de la salle --- */

interface FakeParticipant {
  identity: string;
  attributes: Record<string, string>;
}

const lk = vi.hoisted(() => ({
  roomProps: null as null | Record<string, unknown>,
  dataHandler: null as null | ((message: { payload: Uint8Array; from?: unknown }) => void),
  permissions: { canPublish: false } as { canPublish: boolean },
  recording: false,
  toggles: {} as Record<string, { enabled: boolean; toggle: ReturnType<typeof vi.fn> }>,
  disconnect: vi.fn(),
  local: { identity: 'me', attributes: {} } as { identity: string; attributes: Record<string, string> },
  tracks: [] as Array<{ participant: { identity: string; attributes: Record<string, string> } }>
}));

vi.mock('@livekit/components-styles', () => ({}));

vi.mock('livekit-client', () => ({
  Track: { Source: { Microphone: 'microphone', Camera: 'camera', ScreenShare: 'screen_share' } },
  DisconnectReason: { CLIENT_INITIATED: 1, PARTICIPANT_REMOVED: 4, ROOM_DELETED: 5, ROOM_CLOSED: 10 },
  MediaDeviceFailure: {
    PermissionDenied: 'PermissionDenied',
    NotFound: 'NotFound',
    DeviceInUse: 'DeviceInUse',
    Other: 'Other'
  }
}));

vi.mock('@livekit/components-react', async () => {
  const react = await import('react');
  const TrackContext = react.createContext<{ participant: FakeParticipant } | null>(null);
  return {
    LiveKitRoom: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
      lk.roomProps = props;
      return <div data-testid="lk-room">{props.children}</div>;
    },
    GridLayout: ({
      tracks,
      children
    }: {
      tracks: Array<{ participant: FakeParticipant }>;
      children: React.ReactNode;
    }) => (
      <div data-testid="grid">
        {tracks.map(track => (
          <TrackContext.Provider key={track.participant.identity} value={track}>
            {children}
          </TrackContext.Provider>
        ))}
      </div>
    ),
    ParticipantTile: () => <div data-testid="tile" />,
    RoomAudioRenderer: () => null,
    StartAudio: ({ label }: { label: string }) => <button type="button">{label}</button>,
    useTrackToggle: ({ source }: { source: string }) => {
      lk.toggles[source] ??= { enabled: false, toggle: vi.fn() };
      return { ...lk.toggles[source], pending: false };
    },
    useDataChannel: (_topic: string, onMessage: (message: { payload: Uint8Array; from?: unknown }) => void) => {
      lk.dataHandler = onMessage;
      return {};
    },
    useIsRecording: () => lk.recording,
    useLocalParticipant: () => ({ localParticipant: lk.local }),
    useLocalParticipantPermissions: () => lk.permissions,
    useParticipantAttribute: (key: string, options: { participant: FakeParticipant }) =>
      options.participant.attributes[key] ?? '',
    useRoomContext: () => ({ disconnect: lk.disconnect }),
    useTrackRefContext: () => react.useContext(TrackContext),
    useTracks: () => lk.tracks
  };
});

import MeetingVisioRoom from '../../components/syndics/visio/MeetingVisioRoom';

const INFO: VisioJoinInfo = {
  serverUrl: 'wss://lk.example.com',
  token: 'jwt-token',
  identity: 'p-c1',
  roomName: 't1__ag_m1',
  expiresAt: '2026-10-20T10:10:00.000Z'
};

const DISCONNECT = { CLIENT_INITIATED: 1, PARTICIPANT_REMOVED: 4, ROOM_DELETED: 5 };

function message(payload: unknown, from?: unknown) {
  return { payload: new TextEncoder().encode(JSON.stringify(payload)), from };
}

async function mount(props: Partial<React.ComponentProps<typeof MeetingVisioRoom>> = {}) {
  const getToken = vi.fn().mockResolvedValue(INFO);
  const view = render(<MeetingVisioRoom role="participant" getToken={getToken} {...props} />);
  await screen.findByTestId('lk-room');
  return { getToken, ...view };
}

beforeEach(() => {
  vi.clearAllMocks();
  lk.roomProps = null;
  lk.dataHandler = null;
  lk.toggles = {};
  lk.permissions = { canPublish: false };
  lk.recording = false;
  lk.local = { identity: 'me', attributes: {} };
  lk.tracks = [];
});

describe('MeetingVisioRoom', () => {
  it('demande un jeton au montage et connecte la salle sans publier au départ', async () => {
    const { getToken } = await mount();
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(lk.roomProps).toMatchObject({
      serverUrl: 'wss://lk.example.com',
      token: 'jwt-token',
      connect: true,
      audio: false,
      video: false,
      'data-lk-theme': 'default'
    });
  });

  it('lève puis baisse la main selon l’attribut du participant local', async () => {
    const onRaiseHand = vi.fn().mockResolvedValue(undefined);
    const view = await mount({ onRaiseHand });
    fireEvent.click(screen.getByRole('button', { name: /Lever la main/ }));
    await waitFor(() => expect(onRaiseHand).toHaveBeenLastCalledWith(true));

    // Le serveur a posé l'attribut : le bouton propose de baisser la main.
    lk.local = { identity: 'me', attributes: { main_levee: '2026-10-20T10:05:00.000Z' } };
    view.rerender(
      <MeetingVisioRoom role="participant" getToken={vi.fn().mockResolvedValue(INFO)} onRaiseHand={onRaiseHand} />
    );
    const lower = await screen.findByRole('button', { name: /Baisser la main/ });
    fireEvent.click(lower);
    await waitFor(() => expect(onRaiseHand).toHaveBeenLastCalledWith(false));
  });

  it('n’offre pas le bouton de main levée au modérateur', async () => {
    await mount({ role: 'moderator', onRaiseHand: vi.fn() });
    expect(screen.queryByRole('button', { name: /Lever la main/ })).toBeNull();
  });

  it('affiche la pastille « Main levée » sur la tuile du seul participant concerné', async () => {
    lk.tracks = [
      { participant: { identity: 'a', attributes: { main_levee: '2026-10-20T10:05:00.000Z' } } },
      { participant: { identity: 'b', attributes: {} } }
    ];
    await mount({ role: 'moderator' });
    expect(screen.getAllByTestId('tile')).toHaveLength(2);
    expect(screen.getAllByText('Main levée')).toHaveLength(1);
  });

  it('prend le signal de rafraîchissement du serveur mais ignore celui d’un participant', async () => {
    const onRefreshSignal = vi.fn();
    await mount({ onRefreshSignal });
    expect(lk.dataHandler).toBeTruthy();

    act(() => lk.dataHandler?.(message({ type: 'refresh' }, { identity: 'intrus' })));
    expect(onRefreshSignal).not.toHaveBeenCalled();

    act(() => lk.dataHandler?.(message({ type: 'refresh' })));
    expect(onRefreshSignal).toHaveBeenCalledTimes(1);

    act(() => lk.dataHandler?.(message({ type: 'autre chose' })));
    expect(onRefreshSignal).toHaveBeenCalledTimes(1);
  });

  it('ne montre micro, caméra et partage que si le participant a le droit de publier', async () => {
    await mount();
    expect(screen.queryByRole('button', { name: 'Activer le micro' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Activer la caméra' })).toBeNull();
    expect(screen.queryByRole('button', { name: "Partager l'écran" })).toBeNull();
  });

  it('un copropriétaire à qui l’on a donné la parole publie sans partage d’écran, boutons nommés et traduits', async () => {
    lk.permissions = { canPublish: true };
    await mount();
    const mic = screen.getByRole('button', { name: 'Activer le micro' });
    expect(mic.getAttribute('title')).toBe('Activer le micro');
    expect(screen.getByRole('button', { name: 'Activer la caméra' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: "Partager l'écran" })).toBeNull();
    fireEvent.click(mic);
    expect(lk.toggles.microphone.toggle).toHaveBeenCalledTimes(1);
  });

  it('propose de couper un micro actif', async () => {
    lk.permissions = { canPublish: true };
    lk.toggles.microphone = { enabled: true, toggle: vi.fn() };
    await mount();
    expect(screen.getByRole('button', { name: 'Couper le micro' })).toBeTruthy();
  });

  it('réserve le partage d’écran au modérateur', async () => {
    lk.permissions = { canPublish: true };
    await mount({ role: 'moderator' });
    expect(screen.getByRole('button', { name: "Partager l'écran" })).toBeTruthy();
  });

  it('offre un bouton « Activer le son » traduit pour le repli de lecture audio', async () => {
    await mount();
    expect(screen.getByRole('button', { name: 'Activer le son' })).toBeTruthy();
  });

  it('annonce le retrait par le gestionnaire', async () => {
    const onLeave = vi.fn();
    await mount({ onLeave });
    act(() => (lk.roomProps?.onDisconnected as (reason: number) => void)(DISCONNECT.PARTICIPANT_REMOVED));
    expect(await screen.findByText('Vous avez été retiré de la visio par le gestionnaire.')).toBeTruthy();
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('annonce la fin de la visio quand la salle est fermée', async () => {
    await mount();
    act(() => (lk.roomProps?.onDisconnected as (reason: number) => void)(DISCONNECT.ROOM_DELETED));
    expect(await screen.findByText('La visio est terminée.')).toBeTruthy();
  });

  it('propose de revenir après un départ volontaire et redemande un jeton', async () => {
    const { getToken } = await mount();
    act(() => (lk.roomProps?.onDisconnected as (reason: number) => void)(DISCONNECT.CLIENT_INITIATED));
    expect(await screen.findByText('Vous avez quitté la visio.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Revenir dans la visio' }));
    await waitFor(() => expect(getToken).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('lk-room')).toBeTruthy();
  });

  it('affiche le message d’un échec de jeton', async () => {
    const getToken = vi.fn().mockRejectedValue(new Error('La visio est momentanément indisponible, réessayez.'));
    render(<MeetingVisioRoom role="participant" getToken={getToken} />);
    expect(await screen.findByText('La visio est momentanément indisponible, réessayez.')).toBeTruthy();
    expect(screen.queryByTestId('lk-room')).toBeNull();
  });

  it('explique un refus d’accès au micro ou à la caméra', async () => {
    await mount();
    act(() => (lk.roomProps?.onMediaDeviceFailure as (failure: string) => void)('PermissionDenied'));
    expect(await screen.findByText(/L'accès au micro ou à la caméra a été refusé/)).toBeTruthy();
  });

  it('quitte la salle sur « Quitter la visio »', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /Quitter la visio/ }));
    expect(lk.disconnect).toHaveBeenCalledTimes(1);
  });

  it.each(['participant', 'moderator'] as const)(
    'affiche le bandeau d enregistrement (%s) tant que LiveKit enregistre',
    async role => {
      lk.recording = true;
      await mount({ role });
      expect(screen.getByText('Cette assemblée est enregistrée.')).toBeTruthy();
    }
  );

  it('n affiche pas le bandeau quand la salle n est pas enregistrée', async () => {
    await mount();
    expect(screen.queryByText('Cette assemblée est enregistrée.')).toBeNull();
  });
});
