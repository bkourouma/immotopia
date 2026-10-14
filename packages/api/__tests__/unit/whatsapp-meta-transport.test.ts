/**
 * Lot 041 — transport WhatsApp de l'inventaire (spec W1-R1 à R7, W6-R9,
 * W13-R3). Critères W1-1 à 4, W6-5 ; corps envoyés, bornes, garde SSRF,
 * 10 Mo, empreinte Meta.
 *
 * AUCUN appel réseau : le client HTTP et la résolution DNS sont injectés ; le
 * `fetch` global est espionné pour prouver que le transport `log` ne l'appelle
 * jamais.
 */
import crypto from 'crypto';

jest.mock('dotenv/config', () => ({}));

const mockEnv: Record<string, unknown> = {
  NODE_ENV: 'test',
  UPLOADS_DIR: undefined,
  WHATSAPP_INVENTORY_TRANSPORT: 'meta',
  WHATSAPP_INVENTORY_SIMULATOR: '0',
  META_WA_APP_SECRET: 's'.repeat(40),
  META_WA_VERIFY_TOKEN: 'v'.repeat(40),
  META_WA_ACCESS_TOKEN: 'jeton-acces-test',
  META_WA_PHONE_NUMBER_ID: '1234567890',
  META_WA_GRAPH_BASE_URL: 'https://graph.example.test',
  META_WA_GRAPH_VERSION: 'v23.0',
  META_WA_MEDIA_HOSTS: ['lookaside.fbsbx.com']
};

jest.mock('../../src/config/env', () => ({ env: mockEnv, isProduction: false, isTest: true }));

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const mockMessageCreate = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: { stockWhatsappMessage: { create: (...args: unknown[]) => mockMessageCreate(...args) } }
}));

jest.mock('../../src/lib/stock-whatsapp/capture-files', () => ({ CAPTURE_MAX_BYTES: 10 * 1024 * 1024 }));

import { logger } from '../../src/utils/logger';
import { MediaFetchError, type OutboundMessage } from '../../src/lib/stock-whatsapp/types';
import {
  boundOutboundMessage,
  toMetaMessageBody,
  truncateLabel
} from '../../src/lib/stock-whatsapp/transport/message-limits';
import { assertMediaUrlAllowed, isBlockedAddress } from '../../src/lib/stock-whatsapp/transport/media-guard';
import {
  createMetaTransport,
  providerShaMatches,
  type HttpFetch,
  type MetaTransportConfig
} from '../../src/lib/stock-whatsapp/transport/meta-transport';
import {
  createLogTransport,
  depositSimulatorMedia,
  listUnknownSenderOutbox,
  resetLogTransportMemoryForTests
} from '../../src/lib/stock-whatsapp/transport/log-transport';
import { getWhatsappTransport, resetWhatsappTransportForTests } from '../../src/lib/stock-whatsapp/transport';

const PHONE = '+2250712345678';
const LOG_TARGET = { tenantId: 'tenant-a', registrationId: 'reg-1', sessionId: 'sess-1', captureId: null };

const CONFIG: MetaTransportConfig = {
  accessToken: 'jeton-acces-test',
  phoneNumberId: '1234567890',
  graphBaseUrl: 'https://graph.example.test',
  graphVersion: 'v23.0',
  mediaHosts: ['lookaside.fbsbx.com']
};

const PUBLIC_LOOKUP = jest.fn(async () => [{ address: '157.240.1.1', family: 4 }]);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function bytesResponse(buffer: Buffer, headers: Record<string, string> = {}): Response {
  return new Response(new Uint8Array(buffer), { status: 200, headers });
}

function streamResponse(chunkCount: number, chunkSize: number): Response {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= chunkCount) {
        controller.close();
        return;
      }
      sent += 1;
      controller.enqueue(new Uint8Array(chunkSize));
    }
  });
  return new Response(stream, { status: 200 });
}

function mediaMeta(buffer: Buffer, overrides: Record<string, unknown> = {}) {
  return {
    url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=42&ext=1&hash=abc',
    mime_type: 'image/jpeg',
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    file_size: buffer.length,
    id: 'media-42',
    messaging_product: 'whatsapp',
    ...overrides
  };
}

function makeTransport(fetchImpl: HttpFetch, sleep = jest.fn(async () => undefined)) {
  return { transport: createMetaTransport({ fetch: fetchImpl, lookup: PUBLIC_LOOKUP, sleep, config: CONFIG }), sleep };
}

function loggedText(): string {
  const calls = [
    ...(logger.warn as jest.Mock).mock.calls,
    ...(logger.info as jest.Mock).mock.calls,
    ...(logger.error as jest.Mock).mock.calls
  ];
  return JSON.stringify(calls);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMessageCreate.mockResolvedValue({ id: 'msg-1' });
  resetLogTransportMemoryForTests();
  resetWhatsappTransportForTests();
  mockEnv.WHATSAPP_INVENTORY_TRANSPORT = 'meta';
});

// ---------------------------------------------------------------------------
// Bornes (W1-R4)
// ---------------------------------------------------------------------------

describe('bornes des messages (W1-R4)', () => {
  it('W1-3 : 14 articles candidats donnent une liste de 10 lignes au plus ; un titre de 30 caractères sort en 24 terminés par « … »', () => {
    const rows = Array.from({ length: 14 }, (_, index) => ({
      id: `item:${index}`,
      title: `Article numéro ${index} très long`.padEnd(30, 'x').slice(0, 30)
    }));
    expect(rows[0].title).toHaveLength(30);
    const bounded = boundOutboundMessage({ kind: 'LIST', text: 'Lequel ?', buttonText: 'Choisir', rows });
    expect(bounded.kind).toBe('LIST');
    if (bounded.kind !== 'LIST') return;
    expect(bounded.rows).toHaveLength(10);
    for (const row of bounded.rows) {
      expect(Array.from(row.title)).toHaveLength(24);
      expect(row.title.endsWith('…')).toBe(true);
    }
    // Les identifiants ne sont jamais tronqués avec « … » : le moteur les relit.
    expect(bounded.rows[9].id).toBe('item:9');
  });

  it('boutons : 3 au plus, titre de 20 caractères, corps de 1 024', () => {
    const bounded = boundOutboundMessage({
      kind: 'BUTTONS',
      text: 'x'.repeat(2000),
      buttons: [
        { id: 'a', title: 'Valider ce comptage maintenant' },
        { id: 'b', title: 'Annuler' },
        { id: 'c', title: 'Remplacer' },
        { id: 'd', title: 'De trop' }
      ]
    });
    if (bounded.kind !== 'BUTTONS') throw new Error('BUTTONS attendu');
    expect(bounded.buttons.map(button => button.id)).toEqual(['a', 'b', 'c']);
    expect(Array.from(bounded.buttons[0].title)).toHaveLength(20);
    expect(bounded.buttons[0].title.endsWith('…')).toBe(true);
    expect(bounded.buttons[1].title).toBe('Annuler');
    expect(Array.from(bounded.text)).toHaveLength(1024);
  });

  it('liste : description de 72, texte du bouton de 20', () => {
    const bounded = boundOutboundMessage({
      kind: 'LIST',
      text: 'Sur quel chantier êtes-vous ?',
      buttonText: 'Choisir un chantier dans la liste',
      rows: [{ id: 'site:1', title: 'Résidence', description: 'd'.repeat(100) }]
    });
    if (bounded.kind !== 'LIST') throw new Error('LIST attendu');
    expect(Array.from(bounded.buttonText)).toHaveLength(20);
    expect(Array.from(bounded.rows[0].description ?? '')).toHaveLength(72);
  });

  it('un message à boutons sans bouton devient un texte', () => {
    expect(boundOutboundMessage({ kind: 'BUTTONS', text: 'Bonjour', buttons: [] })).toEqual({
      kind: 'TEXT',
      text: 'Bonjour'
    });
  });

  it('truncateLabel garde un libellé court intact et compte les points de code', () => {
    expect(truncateLabel('Ciment', 24)).toBe('Ciment');
    expect(truncateLabel('ééééééééééééééééééééééééééé', 24)).toHaveLength(24);
  });

  it('corps Meta : texte, boutons et liste ; `to` sans « + »', () => {
    expect(toMetaMessageBody(PHONE, { kind: 'TEXT', text: 'Bonjour' })).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '2250712345678',
      type: 'text',
      text: { preview_url: false, body: 'Bonjour' }
    });
    expect(
      toMetaMessageBody(PHONE, { kind: 'BUTTONS', text: 'Total ?', buttons: [{ id: 'confirm:c1', title: 'Valider' }] })
    ).toMatchObject({
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Total ?' },
        action: { buttons: [{ type: 'reply', reply: { id: 'confirm:c1', title: 'Valider' } }] }
      }
    });
    expect(
      toMetaMessageBody(PHONE, {
        kind: 'LIST',
        text: 'Lequel ?',
        buttonText: 'Choisir',
        rows: [{ id: 'item:1', title: 'Ciment', description: 'Sac 50 kg' }]
      })
    ).toMatchObject({
      type: 'interactive',
      interactive: {
        type: 'list',
        action: {
          button: 'Choisir',
          sections: [{ rows: [{ id: 'item:1', title: 'Ciment', description: 'Sac 50 kg' }] }]
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Transport meta : envoi (W1-R4, W1-R7) et accusé de lecture (W1-R5)
// ---------------------------------------------------------------------------

describe('transport meta — envoi', () => {
  it('POST /{version}/{phone-number-id}/messages, jeton Bearer, sans redirection, avec délai ; journal OUTBOUND borné', async () => {
    const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>(async () =>
      jsonResponse(200, { messages: [{ id: 'wamid.SORTANT' }] })
    );
    const { transport } = makeTransport(fetchMock);
    const rows = Array.from({ length: 12 }, (_, index) => ({ id: `item:${index}`, title: `Article ${index}` }));

    const result = await transport.send({
      toE164: PHONE,
      message: { kind: 'LIST', text: 'Lequel ?', buttonText: 'Choisir', rows },
      log: LOG_TARGET
    });

    expect(result).toEqual({ metaMessageId: 'wamid.SORTANT', error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.example.test/v23.0/1234567890/messages');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeDefined();
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-acces-test');
    const body = JSON.parse(String(init.body));
    expect(body.to).toBe('2250712345678');
    expect(body.interactive.action.sections[0].rows).toHaveLength(10);

    expect(mockMessageCreate).toHaveBeenCalledTimes(1);
    const data = mockMessageCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: 'tenant-a',
      registrationId: 'reg-1',
      sessionId: 'sess-1',
      captureId: null,
      direction: 'OUTBOUND',
      kind: 'LIST',
      text: 'Lequel ?',
      metaMessageId: 'wamid.SORTANT',
      sendError: null
    });
    expect(data.interactive).toHaveLength(10);
  });

  it('W1-R7 : un échec est réessayé une fois après 2 s, puis journalisé dans sendError ; le numéro jamais en clair', async () => {
    const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>(async () =>
      jsonResponse(500, { error: { code: 131000, message: 'Something went wrong' } })
    );
    const { transport, sleep } = makeTransport(fetchMock);

    const result = await transport.send({ toE164: PHONE, message: { kind: 'TEXT', text: 'Bonjour' }, log: LOG_TARGET });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(result.metaMessageId).toBeNull();
    expect(result.error).toBe('HTTP 500 (code Meta 131000)');
    expect(mockMessageCreate.mock.calls[0][0].data).toMatchObject({
      direction: 'OUTBOUND',
      sendError: 'HTTP 500 (code Meta 131000)',
      metaMessageId: null
    });
    expect(logger.warn).toHaveBeenCalled();
    expect(loggedText()).not.toContain('2250712345678');
    expect(loggedText()).not.toContain('jeton-acces-test');
  });

  it('un échec réseau suivi d’un succès : message remis, aucune erreur', async () => {
    const fetchMock = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: 'wamid.2' }] }));
    const { transport } = makeTransport(fetchMock);
    const result = await transport.send({ toE164: PHONE, message: { kind: 'TEXT', text: 'Bonjour' }, log: LOG_TARGET });
    expect(result).toEqual({ metaMessageId: 'wamid.2', error: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('expéditeur inconnu (`log: null`) : rien n’est journalisé dans la conversation', async () => {
    const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>(async () =>
      jsonResponse(200, { messages: [{ id: 'wamid.3' }] })
    );
    const { transport } = makeTransport(fetchMock);
    await transport.send({ toE164: PHONE, message: { kind: 'TEXT', text: 'Bonjour' }, log: null });
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('W1-R5 : accusé de lecture sur la même route ; un échec est journalisé sans lever', async () => {
    const okFetch = jest.fn<Promise<Response>, [string, RequestInit]>(async () => jsonResponse(200, { success: true }));
    await makeTransport(okFetch).transport.markRead('wamid.ENTRANT');
    expect(okFetch.mock.calls[0][0]).toBe('https://graph.example.test/v23.0/1234567890/messages');
    expect(JSON.parse(String(okFetch.mock.calls[0][1].body))).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.ENTRANT'
    });

    const failingFetch = jest.fn<Promise<Response>, [string, RequestInit]>(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(makeTransport(failingFetch).transport.markRead('wamid.X')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Transport meta : médias (W6-R9)
// ---------------------------------------------------------------------------

describe('transport meta — médias (W6-R9)', () => {
  const photo = Buffer.from('octets-d-une-photo-jpeg');

  it('métadonnées puis téléchargement, jeton Bearer, sans redirection ; empreinte Meta vérifiée', async () => {
    const fetchMock = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockResolvedValueOnce(jsonResponse(200, mediaMeta(photo)))
      .mockResolvedValueOnce(bytesResponse(photo));
    const { transport } = makeTransport(fetchMock);

    const media = await transport.fetchMedia('media-42');

    expect(media.buffer.equals(photo)).toBe(true);
    expect(media.declaredMimeType).toBe('image/jpeg');
    expect(media.providerSha256).toBe(mediaMeta(photo).sha256);
    expect(fetchMock.mock.calls[0][0]).toBe('https://graph.example.test/v23.0/media-42');
    expect(new URL(fetchMock.mock.calls[1][0]).hostname).toBe('lookaside.fbsbx.com');
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.redirect).toBe('manual');
      expect(init.signal).toBeDefined();
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-acces-test');
    }
    expect(PUBLIC_LOOKUP).toHaveBeenCalledWith('lookaside.fbsbx.com');
  });

  it('empreinte annoncée en base64 : acceptée', () => {
    const base64 = crypto.createHash('sha256').update(photo).digest('base64');
    expect(providerShaMatches(base64, photo)).toBe(true);
    expect(providerShaMatches(base64, Buffer.from('autre'))).toBe(false);
  });

  it('empreinte différente de celle annoncée : rejet journalisé', async () => {
    const fetchMock = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockResolvedValueOnce(jsonResponse(200, mediaMeta(photo, { sha256: 'f'.repeat(64) })))
      .mockResolvedValueOnce(bytesResponse(photo));
    const error = await makeTransport(fetchMock)
      .transport.fetchMedia('media-42')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MediaFetchError);
    expect((error as MediaFetchError).reason).toBe('HTTP');
    expect(logger.warn).toHaveBeenCalled();
  });

  it.each([
    ['https://evil.example/photo.jpg', 'hôte hors liste'],
    ['https://127.0.0.1/photo.jpg', 'adresse de bouclage'],
    ['http://lookaside.fbsbx.com/photo.jpg', 'schéma http'],
    ['https://lookaside.fbsbx.com:8443/photo.jpg', 'autre port'],
    ['https://user:pass@lookaside.fbsbx.com/photo.jpg', 'identifiants dans l’URL'],
    ['https://lookaside.fbsbx.com.evil.example/photo.jpg', 'suffixe trompeur']
  ])('W6-5 : URL de média %s (%s) refusée, aucun appel vers cet hôte', async url => {
    const fetchMock = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockResolvedValueOnce(jsonResponse(200, mediaMeta(photo, { url })));
    const error = await makeTransport(fetchMock)
      .transport.fetchMedia('media-42')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MediaFetchError);
    expect((error as MediaFetchError).reason).toBe('HOST_NOT_ALLOWED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((error as Error).message).not.toContain('evil.example');
  });

  it('hôte autorisé résolu vers une adresse privée : refusé avant tout téléchargement', async () => {
    const fetchMock = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockResolvedValueOnce(jsonResponse(200, mediaMeta(photo)));
    const transport = createMetaTransport({
      fetch: fetchMock,
      lookup: async () => [
        { address: '157.240.1.1', family: 4 },
        { address: '10.0.0.5', family: 4 }
      ],
      sleep: async () => undefined,
      config: CONFIG
    });
    await expect(transport.fetchMedia('media-42')).rejects.toMatchObject({ reason: 'HOST_NOT_ALLOWED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('taille annoncée de plus de 10 Mo : TOO_LARGE sans téléchargement', async () => {
    const fetchMock = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockResolvedValueOnce(jsonResponse(200, mediaMeta(photo, { file_size: 12 * 1024 * 1024 })));
    await expect(makeTransport(fetchMock).transport.fetchMedia('media-42')).rejects.toMatchObject({
      reason: 'TOO_LARGE'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('en-tête Content-Length de plus de 10 Mo : TOO_LARGE', async () => {
    const fetchMock = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockResolvedValueOnce(jsonResponse(200, mediaMeta(photo, { file_size: undefined })))
      .mockResolvedValueOnce(bytesResponse(photo, { 'Content-Length': String(11 * 1024 * 1024) }));
    await expect(makeTransport(fetchMock).transport.fetchMedia('media-42')).rejects.toMatchObject({
      reason: 'TOO_LARGE'
    });
  });

  it('corps de 12 Mo sans taille annoncée : lecture interrompue au-delà de 10 Mo', async () => {
    const fetchMock = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockResolvedValueOnce(jsonResponse(200, mediaMeta(photo, { file_size: undefined, sha256: undefined })))
      .mockResolvedValueOnce(streamResponse(12, 1024 * 1024));
    await expect(makeTransport(fetchMock).transport.fetchMedia('media-42')).rejects.toMatchObject({
      reason: 'TOO_LARGE'
    });
  });

  it('redirection au téléchargement : refusée, jamais suivie', async () => {
    const fetchMock = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockResolvedValueOnce(jsonResponse(200, mediaMeta(photo)))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/' } }));
    await expect(makeTransport(fetchMock).transport.fetchMedia('media-42')).rejects.toMatchObject({ reason: 'HTTP' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('média inconnu de Meta : NOT_FOUND ; identifiant suspect : NOT_FOUND sans appel', async () => {
    const fetchMock = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockResolvedValueOnce(jsonResponse(404, { error: { code: 100 } }));
    await expect(makeTransport(fetchMock).transport.fetchMedia('media-42')).rejects.toMatchObject({
      reason: 'NOT_FOUND'
    });

    const untouched = jest.fn<Promise<Response>, [string, RequestInit]>();
    await expect(makeTransport(untouched).transport.fetchMedia('../../me?fields=x')).rejects.toMatchObject({
      reason: 'NOT_FOUND'
    });
    expect(untouched).not.toHaveBeenCalled();
  });

  it('délai dépassé : TIMEOUT', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>().mockRejectedValueOnce(timeout);
    await expect(makeTransport(fetchMock).transport.fetchMedia('media-42')).rejects.toMatchObject({
      reason: 'TIMEOUT'
    });
  });
});

describe('garde SSRF (media-guard)', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    'pas-une-ip'
  ])('%s est refusée', address => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['157.240.1.1', '31.13.64.1', '2a03:2880:f12f:83:face:b00c:0:25de'])('%s est acceptée', address => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it('hôte en IP littérale refusé même s’il figurait dans la liste', async () => {
    await expect(assertMediaUrlAllowed('https://157.240.1.1/x', ['157.240.1.1'], PUBLIC_LOOKUP)).rejects.toMatchObject({
      reason: 'HOST_NOT_ALLOWED'
    });
    expect(PUBLIC_LOOKUP).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Transport log (W1-R2, W13-R3) et choix du transport (W1-R1)
// ---------------------------------------------------------------------------

describe('transport log', () => {
  it('W1-4 : une réponse du bot crée une ligne OUTBOUND et aucun appel réseau', async () => {
    const globalFetch = jest.spyOn(globalThis, 'fetch');
    const transport = createLogTransport();
    const result = await transport.send({
      toE164: PHONE,
      message: { kind: 'BUTTONS', text: 'Total proposé : 84 sac', buttons: [{ id: 'confirm:c1', title: 'Valider' }] },
      log: LOG_TARGET
    });
    expect(result).toEqual({ metaMessageId: null, error: null });
    expect(mockMessageCreate).toHaveBeenCalledTimes(1);
    expect(mockMessageCreate.mock.calls[0][0].data).toMatchObject({
      direction: 'OUTBOUND',
      kind: 'BUTTONS',
      interactive: [{ id: 'confirm:c1', title: 'Valider' }],
      metaMessageId: null
    });
    await transport.markRead('sim-1');
    expect(globalFetch).not.toHaveBeenCalled();
    globalFetch.mockRestore();
  });

  it('texte de plus de 1 000 caractères : tronqué dans le journal', async () => {
    await createLogTransport().send({
      toE164: PHONE,
      message: { kind: 'TEXT', text: 'a'.repeat(1500) },
      log: LOG_TARGET
    });
    expect(mockMessageCreate.mock.calls[0][0].data.text).toHaveLength(1000);
  });

  it('numéro inconnu : rien en base, message gardé pour le simulateur', async () => {
    const message: OutboundMessage = { kind: 'TEXT', text: 'Bonjour.' };
    await createLogTransport().send({ toE164: '+2250100000999', message, log: null });
    expect(mockMessageCreate).not.toHaveBeenCalled();
    const outbox = listUnknownSenderOutbox('+2250100000999');
    expect(outbox).toHaveLength(1);
    expect(outbox[0].message).toEqual(message);
    expect(listUnknownSenderOutbox('+2250100000999', new Date(Date.now() + 1000))).toHaveLength(0);
  });

  it('W13-R3 : une photo déposée par le simulateur se relit par fetchMedia ; inconnue : NOT_FOUND', async () => {
    const photo = Buffer.from('photo-du-simulateur');
    const mediaId = depositSimulatorMedia(photo, 'image/jpeg');
    expect(mediaId).toMatch(/^sim-media-/);
    const transport = createLogTransport();
    const media = await transport.fetchMedia(mediaId);
    expect(media.buffer.equals(photo)).toBe(true);
    expect(media.declaredMimeType).toBe('image/jpeg');
    expect(media.providerSha256).toBe(crypto.createHash('sha256').update(photo).digest('hex'));
    await expect(transport.fetchMedia('sim-media-inconnu')).rejects.toMatchObject({ reason: 'NOT_FOUND' });
  });
});

describe('choix du transport (W1-R1, W1-R2)', () => {
  it('suit WHATSAPP_INVENTORY_TRANSPORT', () => {
    mockEnv.WHATSAPP_INVENTORY_TRANSPORT = 'meta';
    expect(getWhatsappTransport().id).toBe('meta');
    mockEnv.WHATSAPP_INVENTORY_TRANSPORT = 'log';
    expect(getWhatsappTransport().id).toBe('log');
    mockEnv.WHATSAPP_INVENTORY_TRANSPORT = 'disabled';
    expect(getWhatsappTransport().id).toBe('disabled');
  });

  it('disabled refuse tout', async () => {
    mockEnv.WHATSAPP_INVENTORY_TRANSPORT = 'disabled';
    const transport = getWhatsappTransport();
    const result = await transport.send({ toE164: PHONE, message: { kind: 'TEXT', text: 'x' }, log: LOG_TARGET });
    expect(result.metaMessageId).toBeNull();
    expect(result.error).toBeTruthy();
    expect(mockMessageCreate).not.toHaveBeenCalled();
    await expect(transport.fetchMedia('m')).rejects.toBeInstanceOf(MediaFetchError);
  });
});

// ---------------------------------------------------------------------------
// Configuration (W1-1, W1-2) : src/config/env.ts réel, rechargé isolément
// ---------------------------------------------------------------------------

describe('configuration du transport (env.ts)', () => {
  const BASE_ENV: Record<string, string> = {
    DATABASE_URL: 'postgresql://user:s3cret@localhost:5432/db',
    JWT_SECRET: 'a'.repeat(48),
    FRONTEND_URL: 'https://app.example.com',
    BACKEND_URL: 'https://api.example.com'
  };
  const WHATSAPP_KEYS = [
    'WHATSAPP_INVENTORY_TRANSPORT',
    'WHATSAPP_INVENTORY_SIMULATOR',
    'META_WA_APP_SECRET',
    'META_WA_VERIFY_TOKEN',
    'META_WA_ACCESS_TOKEN',
    'META_WA_PHONE_NUMBER_ID',
    'STOCK_VISION_PROVIDER',
    'AI_PROVIDER'
  ];
  const saved = { ...process.env };

  afterAll(() => {
    process.env = saved;
  });

  function loadWith(vars: Record<string, string>) {
    process.env = { ...saved, ...BASE_ENV };
    for (const key of WHATSAPP_KEYS) delete process.env[key];
    Object.assign(process.env, vars);
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warns = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.isolateModules(() => {
      try {
        jest.requireActual('../../src/config/env');
      } catch {
        // process.exit simulé
      }
    });
    const result = { exited: exit.mock.calls.length > 0, output: errors.mock.calls.flat().join('\n') };
    exit.mockRestore();
    errors.mockRestore();
    warns.mockRestore();
    process.env = saved;
    return result;
  }

  it('W1-1 : transport meta sans META_WA_APP_SECRET : refus de démarrer, avec le nom de la variable', () => {
    const result = loadWith({
      NODE_ENV: 'development',
      WHATSAPP_INVENTORY_TRANSPORT: 'meta',
      META_WA_VERIFY_TOKEN: 'v'.repeat(40),
      META_WA_ACCESS_TOKEN: 'jeton',
      META_WA_PHONE_NUMBER_ID: '123456'
    });
    expect(result.exited).toBe(true);
    expect(result.output).toContain('META_WA_APP_SECRET');
  });

  it('W1-2 : transport log en production sans WHATSAPP_INVENTORY_SIMULATOR=1 : refus de démarrer', () => {
    const result = loadWith({ NODE_ENV: 'production', WHATSAPP_INVENTORY_TRANSPORT: 'log' });
    expect(result.exited).toBe(true);
    expect(result.output).toContain('WHATSAPP_INVENTORY_TRANSPORT');
  });

  it('transport log en développement : démarre', () => {
    const result = loadWith({ NODE_ENV: 'development', WHATSAPP_INVENTORY_TRANSPORT: 'log' });
    expect(result.exited).toBe(false);
  });
});
