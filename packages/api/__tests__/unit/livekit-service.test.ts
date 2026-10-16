/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Service LiveKit (spec 045) : `RoomServiceClient` simulé, `AccessToken` réel.
 * Les jetons sont décodés (charge utile du JWT) pour vérifier les droits.
 */
const mockEnv: Record<string, string | undefined> = {};
jest.mock('../../src/config/env', () => ({ env: mockEnv }));

const mockRoom = {
  createRoom: jest.fn(),
  listRooms: jest.fn(),
  listParticipants: jest.fn(),
  getParticipant: jest.fn(),
  updateParticipant: jest.fn(),
  removeParticipant: jest.fn(),
  deleteRoom: jest.fn(),
  sendData: jest.fn()
};
const mockRoomCtor = jest.fn(() => mockRoom);
jest.mock('livekit-server-sdk', () => ({
  ...jest.requireActual('livekit-server-sdk'),
  RoomServiceClient: function (...args: unknown[]) {
    return (mockRoomCtor as any)(...args);
  }
}));

import { DataPacket_Kind, TrackSource } from 'livekit-server-sdk';
import * as livekit from '../../src/services/livekit-service';
import { ConflictError } from '../../src/middleware/error-middleware';

const SECRET = 's'.repeat(40);

function decode(jwt: string) {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
}

function notFound() {
  return Object.assign(new Error('not found'), { status: 404, code: 'not_found' });
}

beforeEach(() => {
  jest.clearAllMocks();
  livekit._resetLiveKitServiceForTests();
  mockEnv.LIVEKIT_URL = 'wss://visio.example.test';
  mockEnv.LIVEKIT_API_KEY = 'APIkey';
  mockEnv.LIVEKIT_API_SECRET = SECRET;
  for (const fn of Object.values(mockRoom)) fn.mockResolvedValue(undefined);
});

describe('configuration', () => {
  it('isVisioEnabled : les trois variables présentes', () => {
    expect(livekit.isVisioEnabled()).toBe(true);
    mockEnv.LIVEKIT_API_KEY = undefined;
    expect(livekit.isVisioEnabled()).toBe(false);
  });

  it('non configurée : ConflictError (409), aucun appel réseau', async () => {
    mockEnv.LIVEKIT_URL = undefined;
    await expect(livekit.ensureRoom('r')).rejects.toBeInstanceOf(ConflictError);
    await expect(livekit.mintParticipantToken({ roomName: 'r', identity: 'i', name: 'n' })).rejects.toThrow(
      "La visio intégrée n'est pas activée"
    );
    expect(mockRoomCtor).not.toHaveBeenCalled();
  });

  it('nom de salle : t_<agence>__ag_<assemblée>', () => {
    expect(livekit.buildMeetingRoomName('tenant-a', 'meeting-1')).toBe('t_tenant-a__ag_meeting-1');
  });

  it('le client REST reçoit une URL http(s), pas ws(s)', async () => {
    await livekit.ensureRoom('r');
    expect(mockRoomCtor).toHaveBeenCalledWith('https://visio.example.test', 'APIkey', SECRET);
  });
});

describe('jetons', () => {
  it('copropriétaire : regarde et écoute, ne publie pas, pas de données, pas roomAdmin', async () => {
    const minted = await livekit.mintParticipantToken({ roomName: 'room-1', identity: 'part-1', name: 'Awa Traore' });
    const claims = decode(minted.token);
    expect(claims.sub).toBe('part-1');
    expect(claims.name).toBe('Awa Traore');
    expect(claims.iss).toBe('APIkey');
    expect(claims.video).toMatchObject({
      room: 'room-1',
      roomJoin: true,
      canSubscribe: true,
      canPublish: false,
      canPublishData: false,
      canUpdateOwnMetadata: false
    });
    expect(claims.video.roomAdmin).toBeFalsy();
    expect(claims.video.canPublishSources).toBeUndefined();
    expect(claims.exp - claims.nbf).toBe(600);
    expect(minted).toMatchObject({
      serverUrl: 'wss://visio.example.test',
      identity: 'part-1',
      roomName: 'room-1'
    });
    expect(Math.abs(new Date(minted.expiresAt).getTime() - (Date.now() + 600_000))).toBeLessThan(5_000);
  });

  it("gestionnaire : micro, caméra, partage d'écran ; pas roomAdmin, pas de données", async () => {
    const minted = await livekit.mintModeratorToken({
      roomName: 'room-1',
      identity: 'gestionnaire-u1',
      name: 'Syndic Un'
    });
    const claims = decode(minted.token);
    expect(claims.video).toMatchObject({
      room: 'room-1',
      roomJoin: true,
      canSubscribe: true,
      canPublish: true,
      canPublishData: false,
      canUpdateOwnMetadata: false
    });
    expect(claims.video.roomAdmin).toBeFalsy();
    expect(claims.video.canPublishSources).toEqual(
      expect.arrayContaining(['microphone', 'camera', 'screen_share', 'screen_share_audio'])
    );
    expect(claims.exp - claims.nbf).toBe(600);
  });

  it("le secret n'apparaît jamais dans la réponse", async () => {
    const minted = await livekit.mintParticipantToken({ roomName: 'r', identity: 'i', name: 'n' });
    expect(JSON.stringify(minted)).not.toContain(SECRET);
  });
});

describe('salles et modération', () => {
  it('ensureRoom : 300 participants, fermeture après 10 min de salle vide', async () => {
    await livekit.ensureRoom('room-1');
    expect(mockRoom.createRoom).toHaveBeenCalledWith({ name: 'room-1', maxParticipants: 300, emptyTimeout: 600 });
  });

  it('listRoomParticipants : salle inexistante = liste vide', async () => {
    mockRoom.listParticipants.mockRejectedValueOnce(notFound());
    await expect(livekit.listRoomParticipants('r')).resolves.toEqual([]);
    mockRoom.listParticipants.mockResolvedValueOnce([{ identity: 'a' }]);
    await expect(livekit.listRoomParticipants('r')).resolves.toEqual([{ identity: 'a' }]);
  });

  it('getRoomParticipant : absent = null', async () => {
    mockRoom.getParticipant.mockRejectedValueOnce(notFound());
    await expect(livekit.getRoomParticipant('r', 'x')).resolves.toBeNull();
  });

  it('roomExists', async () => {
    mockRoom.listRooms.mockResolvedValueOnce([{ name: 'r' }]);
    await expect(livekit.roomExists('r')).resolves.toBe(true);
    mockRoom.listRooms.mockResolvedValueOnce([]);
    await expect(livekit.roomExists('r')).resolves.toBe(false);
  });

  it('main levée : attribut main_levee horodaté, puis vide', async () => {
    await livekit.setHandRaised('r', 'p1', true);
    const raisedAttrs = mockRoom.updateParticipant.mock.calls[0][2].attributes;
    expect(mockRoom.updateParticipant.mock.calls[0].slice(0, 2)).toEqual(['r', 'p1']);
    expect(new Date(raisedAttrs.main_levee).toISOString()).toBe(raisedAttrs.main_levee);
    await livekit.setHandRaised('r', 'p1', false);
    expect(mockRoom.updateParticipant.mock.calls[1][2]).toEqual({ attributes: { main_levee: '' } });
  });

  it('donner la parole : micro et caméra seulement, pas de données, main baissée', async () => {
    await livekit.setCanSpeak('r', 'p1', true);
    expect(mockRoom.updateParticipant).toHaveBeenCalledWith('r', 'p1', {
      permission: {
        canSubscribe: true,
        canPublish: true,
        canPublishData: false,
        canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA]
      },
      attributes: { main_levee: '' }
    });
  });

  it('retirer la parole : plus aucune source publiable', async () => {
    await livekit.setCanSpeak('r', 'p1', false);
    expect(mockRoom.updateParticipant).toHaveBeenCalledWith('r', 'p1', {
      permission: { canSubscribe: true, canPublish: false, canPublishData: false, canPublishSources: [] },
      attributes: { main_levee: '' }
    });
  });

  it("removeParticipant et deleteRoom : l'absent est ignoré", async () => {
    mockRoom.removeParticipant.mockRejectedValueOnce(notFound());
    mockRoom.deleteRoom.mockRejectedValueOnce(notFound());
    await expect(livekit.removeParticipant('r', 'p')).resolves.toBeUndefined();
    await expect(livekit.deleteRoom('r')).resolves.toBeUndefined();
    expect(mockRoom.removeParticipant).toHaveBeenCalledWith('r', 'p');
    expect(mockRoom.deleteRoom).toHaveBeenCalledWith('r');
  });

  it('signal de rafraîchissement : sujet ag-refresh, message fiable, aucune donnée de vote', async () => {
    await livekit.sendRefreshSignal('r');
    const [room, data, kind, options] = mockRoom.sendData.mock.calls[0];
    expect(room).toBe('r');
    expect(Buffer.from(data).toString('utf8')).toBe('{"type":"refresh"}');
    expect(kind).toBe(DataPacket_Kind.RELIABLE);
    expect(options).toEqual({ topic: 'ag-refresh' });
  });

  it('signal : salle inexistante ignorée', async () => {
    mockRoom.sendData.mockRejectedValueOnce(notFound());
    await expect(livekit.sendRefreshSignal('r')).resolves.toBeUndefined();
  });
});

describe('erreurs', () => {
  it('LiveKit injoignable : VisioUnavailableError 503, sans le message du SDK', async () => {
    mockRoom.createRoom.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.1:443'));
    const error: any = await livekit.ensureRoom('r').catch(e => e);
    expect(error).toBeInstanceOf(livekit.VisioUnavailableError);
    expect(error.statusCode).toBe(503);
    expect(error.code).toBe('VISIO_UNAVAILABLE');
    expect(error.message).toBe('La visio est momentanément indisponible');
    expect(error.message).not.toContain('ECONNREFUSED');
  });

  it('une erreur inattendue sur une lecture reste un 503 (seul not_found est toléré)', async () => {
    mockRoom.listParticipants.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    await expect(livekit.listRoomParticipants('r')).rejects.toBeInstanceOf(livekit.VisioUnavailableError);
  });
});
