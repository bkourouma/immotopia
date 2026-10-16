import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DiscussionMessageView, VisioJoinInfo } from '../../types/syndic-live-types';

/* --- doubles de LiveKit (même principe que MeetingVisioRoom.test) --- */

type DataMessage = { payload: Uint8Array; from?: unknown };

const lk = vi.hoisted(() => ({
  handlers: {} as Record<string, (message: { payload: Uint8Array; from?: unknown }) => void>,
  roomListeners: {} as Record<string, Array<() => void>>,
  local: { identity: 'me', attributes: {} } as { identity: string; attributes: Record<string, string> },
  roomMounts: 0
}));

vi.mock('@livekit/components-styles', () => ({}));

vi.mock('livekit-client', () => ({
  Track: { Source: { Microphone: 'microphone', Camera: 'camera', ScreenShare: 'screen_share' } },
  RoomEvent: { Reconnected: 'reconnected' },
  DisconnectReason: { CLIENT_INITIATED: 1, PARTICIPANT_REMOVED: 4, ROOM_DELETED: 5, ROOM_CLOSED: 10 },
  MediaDeviceFailure: { PermissionDenied: 'PermissionDenied', NotFound: 'NotFound', DeviceInUse: 'DeviceInUse' }
}));

vi.mock('@livekit/components-react', async () => {
  const react = await import('react');
  const room = {
    disconnect: vi.fn(),
    on: (event: string, listener: () => void) => {
      (lk.roomListeners[event] ??= []).push(listener);
    },
    off: (event: string, listener: () => void) => {
      lk.roomListeners[event] = (lk.roomListeners[event] ?? []).filter(item => item !== listener);
    }
  };
  return {
    LiveKitRoom: (props: { children?: React.ReactNode }) => {
      react.useEffect(() => {
        lk.roomMounts += 1;
      }, []);
      return <div data-testid="lk-room">{props.children}</div>;
    },
    GridLayout: () => <div data-testid="grid" />,
    ParticipantTile: () => <div data-testid="tile" />,
    RoomAudioRenderer: () => null,
    StartAudio: () => null,
    useTrackToggle: () => ({ enabled: false, toggle: vi.fn(), pending: false }),
    useDataChannel: (topic: string, onMessage: (message: DataMessage) => void) => {
      lk.handlers[topic] = onMessage;
      return {};
    },
    useIsRecording: () => false,
    useLocalParticipant: () => ({ localParticipant: lk.local }),
    useLocalParticipantPermissions: () => ({ canPublish: false }),
    useParticipantAttribute: () => '',
    useRoomContext: () => room,
    useTrackRefContext: () => null,
    useTracks: () => []
  };
});

import MeetingVisioRoom from '../../components/syndics/visio/MeetingVisioRoom';
import type { VisioDiscussionAdapter } from '../../components/syndics/visio/use-visio-discussion';

const INFO: VisioJoinInfo = {
  serverUrl: 'wss://lk.example.com',
  token: 'jwt-token',
  identity: 'p-c1',
  roomName: 't1__ag_m1',
  expiresAt: '2026-10-20T10:10:00.000Z'
};

function msg(id: string, body: string | null, extra: Partial<DiscussionMessageView> = {}): DiscussionMessageView {
  return {
    id,
    authorKind: 'COOWNER',
    authorIdentity: `p-${id}`,
    authorName: `Auteur ${id}`,
    body,
    hidden: false,
    createdAt: `2026-10-20T10:0${id.length % 10}:00.000Z`,
    ...extra
  };
}

function emit(payload: unknown, from?: unknown) {
  const handler = lk.handlers['ag-discussion'];
  expect(handler).toBeTruthy();
  act(() => handler({ payload: new TextEncoder().encode(JSON.stringify(payload)), from }));
}

interface AdapterOptions {
  open?: boolean;
  muted?: boolean;
  messages?: DiscussionMessageView[];
  manager?: boolean;
}

function makeAdapter(options: AdapterOptions = {}) {
  const load = vi.fn().mockResolvedValue({
    open: options.open ?? true,
    muted: options.muted ?? false,
    maxLength: 500,
    messages: options.messages ?? []
  });
  const send = vi.fn().mockImplementation(async (body: string) => msg('sent', body, { authorIdentity: 'me' }));
  const setHidden = vi.fn().mockResolvedValue(undefined);
  const adapter: VisioDiscussionAdapter = {
    load,
    send,
    ...(options.manager ? { moderation: { setHidden }, canWriteWhenClosed: true } : {})
  };
  return { adapter, load, send, setHidden };
}

async function mount(adapter?: VisioDiscussionAdapter) {
  const getToken = vi.fn().mockResolvedValue(INFO);
  const view = render(<MeetingVisioRoom role="participant" getToken={getToken} discussion={adapter} />);
  await screen.findByTestId('lk-room');
  return { getToken, ...view };
}

async function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: /^Discussion/ }));
  return screen.findByRole('log');
}

beforeEach(() => {
  vi.clearAllMocks();
  lk.handlers = {};
  lk.roomListeners = {};
  lk.local = { identity: 'me', attributes: {} };
  lk.roomMounts = 0;
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
});

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
});

describe('salle de visio : bouton et panneau de discussion', () => {
  it('sans adaptateur, aucun bouton « Discussion » et aucun abonnement au sujet', async () => {
    await mount();
    expect(screen.queryByRole('button', { name: /Discussion/ })).toBeNull();
    expect(lk.handlers['ag-discussion']).toBeUndefined();
  });

  it('avec adaptateur : bouton aria-pressed, historique chargé une fois, mention M10 en tête', async () => {
    const { adapter, load } = makeAdapter({ messages: [msg('a', 'Bonjour à tous')] });
    await mount(adapter);
    const button = screen.getByRole('button', { name: 'Discussion' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    const log = await openPanel();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(
      screen.getByText(
        'Vos messages sont visibles de tous les participants de la visio et conservés par le syndic. Un message ne vaut pas vote.'
      )
    ).toBeTruthy();
    expect(within(log).getByText('Bonjour à tous')).toBeTruthy();
    expect(within(log).getByText('Auteur a')).toBeTruthy();
  });

  it('ouvrir et fermer le panneau ne recrée jamais la connexion à la salle', async () => {
    const { adapter } = makeAdapter();
    const { getToken } = await mount(adapter);
    await waitFor(() => expect(lk.roomMounts).toBe(1));
    const button = screen.getByRole('button', { name: 'Discussion' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(lk.roomMounts).toBe(1);
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('salle large : panneau à côté de la grille, sans bouton « Retour à la vidéo »', async () => {
    const { adapter } = makeAdapter();
    await mount(adapter);
    await openPanel();
    expect(screen.queryByRole('button', { name: 'Retour à la vidéo' })).toBeNull();
    expect((screen.getByTestId('grid').parentElement as HTMLElement).style.display).not.toBe('none');
  });

  it('salle étroite : le panneau remplace la grille et propose de revenir à la vidéo', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 });
    const { adapter } = makeAdapter();
    await mount(adapter);
    await openPanel();
    expect((screen.getByTestId('grid').parentElement as HTMLElement).style.display).toBe('none');
    fireEvent.click(screen.getByRole('button', { name: 'Retour à la vidéo' }));
    expect((screen.getByTestId('grid').parentElement as HTMLElement).style.display).not.toBe('none');
    expect(screen.queryByRole('log')).toBeNull();
    expect(lk.roomMounts).toBe(1);
  });

  it('pastille de messages non lus tant que le panneau est fermé, sans compter les siens', async () => {
    const { adapter } = makeAdapter();
    await mount(adapter);
    await waitFor(() => expect(lk.handlers['ag-discussion']).toBeTruthy());

    emit({ type: 'message', message: msg('a', 'un') });
    emit({ type: 'message', message: msg('b', 'deux') });
    emit({ type: 'message', message: msg('mine', 'moi', { authorIdentity: 'me' }) });
    const button = await screen.findByRole('button', { name: 'Discussion, 2 message(s) non lu(s)' });
    expect(button).toBeTruthy();

    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Discussion' })).toBeTruthy();
  });
});

describe('panneau de discussion : contenu des messages', () => {
  it('affiche le HTML et le script tels quels, en texte, sans créer d’élément', async () => {
    const { adapter } = makeAdapter();
    await mount(adapter);
    const log = await openPanel();
    emit({ type: 'message', message: msg('a', '<img src=x onerror=alert(1)>') });
    emit({ type: 'message', message: msg('bb', '<b>gras</b>') });

    expect(await within(log).findByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(within(log).getByText('<b>gras</b>')).toBeTruthy();
    expect(log.querySelector('img')).toBeNull();
    expect(log.querySelector('b')).toBeNull();
    expect(log.querySelector('a')).toBeNull();
  });

  it('une adresse web reste du texte, sans lien cliquable', async () => {
    const { adapter } = makeAdapter();
    await mount(adapter);
    const log = await openPanel();
    emit({ type: 'message', message: msg('a', 'Voir https://exemple.test/piege et www.exemple.test') });
    expect(await within(log).findByText('Voir https://exemple.test/piege et www.exemple.test')).toBeTruthy();
    expect(log.querySelector('a')).toBeNull();
    expect(within(log).queryByRole('link')).toBeNull();
  });

  it('le texte garde ses retours à la ligne et coupe les mots longs', async () => {
    const { adapter } = makeAdapter();
    await mount(adapter);
    const log = await openPanel();
    emit({ type: 'message', message: msg('a', 'ligne 1\nligne 2') });
    const body = (await within(log).findByText(/ligne 1/)) as HTMLElement;
    expect(body.style.whiteSpace).toBe('pre-wrap');
    expect(body.style.overflowWrap).toBe('anywhere');
  });

  it('marque « Gestionnaire » pour un auteur gestionnaire', async () => {
    const { adapter } = makeAdapter({
      messages: [msg('a', 'Bienvenue', { authorKind: 'MANAGER', authorName: 'Mme Diallo' })]
    });
    await mount(adapter);
    const log = await openPanel();
    expect(await within(log).findByText('Gestionnaire')).toBeTruthy();
  });
});

describe('panneau de discussion : messages de données', () => {
  it('ignore un message qui porte un émetteur, un JSON illisible et un type inconnu', async () => {
    const { adapter } = makeAdapter();
    await mount(adapter);
    const log = await openPanel();
    emit({ type: 'message', message: msg('a', 'faux') }, { identity: 'intrus' });
    act(() => lk.handlers['ag-discussion']({ payload: new TextEncoder().encode('{pas du json') }));
    emit({ type: 'inconnu', message: msg('b', 'inconnu') });
    emit({ type: 'message', message: { id: 'x' } });
    expect(within(log).queryByText('faux')).toBeNull();
    expect(within(log).queryByText('inconnu')).toBeNull();
    expect(within(log).getByText("Aucun message pour l'instant.")).toBeTruthy();
  });

  it('dédoublonne par identifiant (diffusion reçue deux fois, ou après la réponse HTTP)', async () => {
    const { adapter } = makeAdapter();
    await mount(adapter);
    const log = await openPanel();
    emit({ type: 'message', message: msg('a', 'une seule fois') });
    emit({ type: 'message', message: msg('a', 'une seule fois') });
    expect(within(log).getAllByText('une seule fois')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Votre message'), { target: { value: 'moi aussi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await within(log).findByText('moi aussi');
    emit({ type: 'message', message: msg('sent', 'moi aussi', { authorIdentity: 'me' }) });
    expect(within(log).getAllByText('moi aussi')).toHaveLength(1);
  });

  it('range les messages par date', async () => {
    const { adapter } = makeAdapter();
    await mount(adapter);
    const log = await openPanel();
    emit({ type: 'message', message: msg('a', 'second', { createdAt: '2026-10-20T10:05:00.000Z' }) });
    emit({ type: 'message', message: msg('b', 'premier', { createdAt: '2026-10-20T10:01:00.000Z' }) });
    const texts = within(log)
      .getAllByRole('listitem')
      .map(item => item.textContent ?? '');
    expect(texts[0]).toContain('premier');
    expect(texts[1]).toContain('second');
  });

  it('« hidden » remplace le texte par la mention, « restored » le rétablit', async () => {
    const { adapter } = makeAdapter({ messages: [msg('a', 'à masquer')] });
    await mount(adapter);
    const log = await openPanel();
    expect(await within(log).findByText('à masquer')).toBeTruthy();

    emit({ type: 'hidden', id: 'a' });
    expect(within(log).queryByText('à masquer')).toBeNull();
    const mention = within(log).getByText('Message masqué par le gestionnaire');
    expect(mention.style.fontStyle).toBe('italic');

    emit({ type: 'restored', message: msg('a', 'à masquer') });
    expect(within(log).getByText('à masquer')).toBeTruthy();
    expect(within(log).queryByText('Message masqué par le gestionnaire')).toBeNull();
  });

  it('« state » ferme puis rouvre la discussion pour un copropriétaire', async () => {
    const { adapter } = makeAdapter();
    await mount(adapter);
    await openPanel();
    const input = screen.getByLabelText('Votre message') as HTMLTextAreaElement;
    await waitFor(() => expect(input.disabled).toBe(false));

    emit({ type: 'state', open: false });
    expect(screen.getByText('Le gestionnaire a fermé la discussion.')).toBeTruthy();
    expect((screen.getByLabelText('Votre message') as HTMLTextAreaElement).disabled).toBe(true);

    emit({ type: 'state', open: true });
    expect(screen.queryByText('Le gestionnaire a fermé la discussion.')).toBeNull();
    expect((screen.getByLabelText('Votre message') as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('« muted » coupe puis rétablit l’écriture, avec la mention', async () => {
    const { adapter } = makeAdapter();
    await mount(adapter);
    await openPanel();
    await waitFor(() => expect((screen.getByLabelText('Votre message') as HTMLTextAreaElement).disabled).toBe(false));

    emit({ type: 'muted', muted: true });
    expect(screen.getByText("Le gestionnaire a suspendu votre droit d'écrire.")).toBeTruthy();
    expect((screen.getByLabelText('Votre message') as HTMLTextAreaElement).disabled).toBe(true);

    emit({ type: 'muted', muted: false });
    expect(screen.queryByText("Le gestionnaire a suspendu votre droit d'écrire.")).toBeNull();
    expect((screen.getByLabelText('Votre message') as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('le gestionnaire écrit encore quand la discussion est fermée', async () => {
    const { adapter } = makeAdapter({ open: false, manager: true });
    await mount(adapter);
    await openPanel();
    expect(await screen.findByText('Le gestionnaire a fermé la discussion.')).toBeTruthy();
    expect((screen.getByLabelText('Votre message') as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('relit l’historique après une reconnexion', async () => {
    const { adapter, load } = makeAdapter();
    await mount(adapter);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(lk.roomListeners.reconnected).toHaveLength(1);
    act(() => lk.roomListeners.reconnected[0]());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
});

describe('panneau de discussion : saisie', () => {
  const type = (text: string) => fireEvent.change(screen.getByLabelText('Votre message'), { target: { value: text } });

  it('Entrée envoie, le texte est vidé ; Maj+Entrée n’envoie pas', async () => {
    const { adapter, send } = makeAdapter();
    await mount(adapter);
    await openPanel();
    await waitFor(() => expect((screen.getByLabelText('Votre message') as HTMLTextAreaElement).disabled).toBe(false));

    type('Bonjour');
    fireEvent.keyDown(screen.getByLabelText('Votre message'), { key: 'Enter', shiftKey: true });
    expect(send).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByLabelText('Votre message'), { key: 'Enter' });
    await waitFor(() => expect(send).toHaveBeenCalledWith('Bonjour'));
    await waitFor(() => expect((screen.getByLabelText('Votre message') as HTMLTextAreaElement).value).toBe(''));
  });

  it('le bouton « Envoyer » est désactivé tant que le texte est vide', async () => {
    const { adapter } = makeAdapter();
    await mount(adapter);
    await openPanel();
    await waitFor(() => expect((screen.getByLabelText('Votre message') as HTMLTextAreaElement).disabled).toBe(false));
    const button = screen.getByRole('button', { name: 'Envoyer' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    type('   ');
    expect(button.disabled).toBe(true);
    type('ok');
    expect(button.disabled).toBe(false);
  });

  it('limite la saisie à 500 caractères et affiche le compteur', async () => {
    const { adapter } = makeAdapter();
    await mount(adapter);
    await openPanel();
    await waitFor(() => expect((screen.getByLabelText('Votre message') as HTMLTextAreaElement).disabled).toBe(false));
    expect(screen.getByLabelText('Votre message').getAttribute('maxlength')).toBe('500');
    type('abc');
    expect(screen.getByText('3/500')).toBeTruthy();
  });

  it('conserve le texte et affiche le message du serveur quand l’envoi échoue', async () => {
    const { adapter, send } = makeAdapter();
    send.mockRejectedValueOnce(new Error('Vous écrivez trop vite, patientez un instant.'));
    await mount(adapter);
    await openPanel();
    await waitFor(() => expect((screen.getByLabelText('Votre message') as HTMLTextAreaElement).disabled).toBe(false));

    type('Mon texte');
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByText('Vous écrivez trop vite, patientez un instant.')).toBeTruthy();
    expect((screen.getByLabelText('Votre message') as HTMLTextAreaElement).value).toBe('Mon texte');
  });

  it('repli « Message non envoyé, réessayez. » quand l’erreur n’a pas de texte', async () => {
    const { adapter, send } = makeAdapter();
    send.mockRejectedValueOnce(new Error(''));
    await mount(adapter);
    await openPanel();
    await waitFor(() => expect((screen.getByLabelText('Votre message') as HTMLTextAreaElement).disabled).toBe(false));
    type('Mon texte');
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByText('Message non envoyé, réessayez.')).toBeTruthy();
  });

  it('affiche l’erreur de chargement et propose de réessayer', async () => {
    const { adapter, load } = makeAdapter();
    load.mockRejectedValueOnce(new Error('Vous n’êtes pas dans la visio'));
    await mount(adapter);
    await openPanel();
    expect(await screen.findByText('Vous n’êtes pas dans la visio')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Vous n’êtes pas dans la visio')).toBeNull());
  });
});

describe('panneau de discussion : modération du gestionnaire', () => {
  it('le texte d’un message masqué reste lisible, marqué « masqué », avec « Rétablir »', async () => {
    const hidden = msg('a', 'texte caché', { hidden: true, authorName: 'Awa Traoré' });
    const { adapter, setHidden } = makeAdapter({
      manager: true,
      messages: [hidden, msg('bb', 'visible', { authorName: 'Ibrahim Koné' })]
    });
    await mount(adapter);
    const log = await openPanel();

    expect(await within(log).findByText('texte caché')).toBeTruthy();
    expect(within(log).getByText('masqué')).toBeTruthy();
    expect(within(log).queryByText('Message masqué par le gestionnaire')).toBeNull();

    fireEvent.click(within(log).getByRole('button', { name: 'Rétablir le message de Awa Traoré' }));
    await waitFor(() => expect(setHidden).toHaveBeenCalledWith('a', false));
    await waitFor(() => expect(within(log).queryByText('masqué')).toBeNull());

    fireEvent.click(within(log).getByRole('button', { name: 'Masquer le message de Ibrahim Koné' }));
    await waitFor(() => expect(setHidden).toHaveBeenCalledWith('bb', true));
    expect(await within(log).findByText('masqué')).toBeTruthy();
  });

  it('un copropriétaire n’a aucun bouton de modération', async () => {
    const { adapter } = makeAdapter({ messages: [msg('a', 'texte')] });
    await mount(adapter);
    const log = await openPanel();
    await within(log).findByText('texte');
    expect(within(log).queryByRole('button', { name: /Masquer/ })).toBeNull();
  });

  it('une erreur de modération s’affiche et ne change rien', async () => {
    const { adapter, setHidden } = makeAdapter({ manager: true, messages: [msg('a', 'texte')] });
    setHidden.mockRejectedValueOnce(new Error('Action impossible, réessayez.'));
    await mount(adapter);
    const log = await openPanel();
    fireEvent.click(await within(log).findByRole('button', { name: 'Masquer le message de Auteur a' }));
    expect(await screen.findByText('Action impossible, réessayez.')).toBeTruthy();
    expect(within(log).queryByText('masqué')).toBeNull();
  });
});
