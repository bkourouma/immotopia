/**
 * Adaptateur Yousign (spec 044, lot S6) : transport HTTP mocké, aucun appel réseau.
 */
import crypto from 'crypto';
import {
  createYousignClient,
  fetchTransport,
  MAX_RESPONSE_BYTES,
  YOUSIGN_SANDBOX_BASE_URL,
  type YousignHttp,
  type YousignHttpRequest
} from '../../src/lib/signature/provider/external/yousign';
import { ExternalProviderError } from '../../src/lib/signature/provider/external/types';

const API_KEY = 'sk_test_SUPERSECRETKEY123';
const SECRET = 'webhook-secret-0123456789abcdef';
const PDF = Buffer.from('%PDF-1.4 contenu-confidentiel-du-pdf');

type Reply = { status: number; json?: unknown; raw?: Buffer } | Error;

function mockHttp(replies: Reply[]) {
  const calls: YousignHttpRequest[] = [];
  const http: YousignHttp = async request => {
    calls.push(request);
    const reply = replies.shift();
    if (!reply) throw new Error('réponse non prévue');
    if (reply instanceof Error) throw reply;
    return { status: reply.status, body: reply.raw ?? Buffer.from(JSON.stringify(reply.json ?? {})) };
  };
  return { http, calls };
}

function client(http: YousignHttp, extra: Record<string, unknown> = {}) {
  return createYousignClient({
    apiKey: API_KEY,
    webhookSecret: SECRET,
    http,
    now: () => new Date('2026-10-16T08:00:00Z'),
    ...extra
  });
}

const INPUT = {
  requestId: 'req_1',
  title: 'Compromis de vente',
  pdf: PDF,
  language: 'fr' as const,
  sequential: true,
  expiresAt: new Date('2026-10-23T08:00:00Z'),
  signers: [
    { position: 1, fullName: 'Awa Traoré', email: 'awa@example.com', role: 'BUYER' },
    { position: 0, fullName: 'Madonna', email: 'm@example.com', role: 'SELLER' }
  ]
};

const OK_CREATE: Reply[] = [
  { status: 201, json: { id: 'sr-1' } },
  { status: 201, json: { id: 'doc-1' } },
  { status: 201, json: { id: 'sg-a' } },
  { status: 201, json: { id: 'sg-b' } },
  { status: 201, json: { id: 'sr-1' } }
];

describe('createYousignClient.create', () => {
  it('enchaîne création, document, signataires dans l’ordre des positions, activation', async () => {
    const { http, calls } = mockHttp([...OK_CREATE]);
    const result = await client(http).create(INPUT);
    expect(result).toEqual({ providerRef: 'sr-1', signerRefs: ['sg-a', 'sg-b'] });
    expect(calls.map(c => `${c.method} ${c.url.replace(YOUSIGN_SANDBOX_BASE_URL, '')}`)).toEqual([
      'POST /signature_requests',
      'POST /signature_requests/sr-1/documents',
      'POST /signature_requests/sr-1/signers',
      'POST /signature_requests/sr-1/signers',
      'POST /signature_requests/sr-1/activate'
    ]);
    expect(calls[0].headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(calls[0].json).toMatchObject({
      name: 'Compromis de vente',
      delivery_mode: 'email',
      ordered_signers: true,
      expiration_date: '2026-10-23T08:00:00',
      external_id: 'req_1'
    });
    expect(calls[1].multipart?.fields.nature).toBe('signable_document');
    expect(calls[1].multipart?.file.content).toBe(PDF);
    const first = calls[2].json as Record<string, any>;
    expect(first.info).toMatchObject({
      first_name: 'Madonna',
      last_name: 'Madonna',
      email: 'm@example.com',
      locale: 'fr'
    });
    expect(first.fields).toHaveLength(1);
    expect(first.fields[0]).toMatchObject({ type: 'signature', document_id: 'doc-1' });
    expect(first.insert_after_id).toBeUndefined();
    const second = calls[3].json as Record<string, any>;
    expect(second.insert_after_id).toBe('sg-a');
    expect(second.info).toMatchObject({ first_name: 'Awa', last_name: 'Traoré' });
    expect(second.signature_authentication_mode).toBe('otp_email');
  });

  it('replie l’arabe sur le français et borne l’expiration', async () => {
    const { http, calls } = mockHttp([...OK_CREATE]);
    await client(http).create({
      ...INPUT,
      language: 'ar',
      sequential: false,
      expiresAt: new Date('2030-01-01T00:00:00Z')
    });
    expect((calls[2].json as any).info.locale).toBe('fr');
    expect(calls[0].json).toMatchObject({ audit_trail_locale: 'fr', ordered_signers: false });
    expect((calls[0].json as any).expiration_date).toBe('2027-10-15T08:00:00');
  });

  it('tente de supprimer la demande si une étape échoue puis relance l’erreur', async () => {
    const { http, calls } = mockHttp([
      { status: 201, json: { id: 'sr-1' } },
      { status: 201, json: { id: 'doc-1' } },
      { status: 422 },
      { status: 204 }
    ]);
    await expect(client(http).create(INPUT)).rejects.toMatchObject({ code: 'REJECTED', status: 422 });
    expect(calls[calls.length - 1]).toMatchObject({ method: 'DELETE' });
    expect(calls[calls.length - 1].url).toContain('/signature_requests/sr-1');
  });

  it('relance l’erreur d’origine même si le nettoyage échoue', async () => {
    const { http } = mockHttp([{ status: 201, json: { id: 'sr-1' } }, { status: 503 }, new Error('réseau')]);
    await expect(client(http).create(INPUT)).rejects.toMatchObject({ code: 'SERVER' });
  });

  it('réponse sans identifiant : INVALID_RESPONSE', async () => {
    const { http } = mockHttp([{ status: 201, json: {} }]);
    await expect(client(http).create(INPUT)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('mapping des erreurs HTTP et du transport', () => {
  const cases: Array<[number, string]> = [
    [401, 'UNAUTHORIZED'],
    [403, 'UNAUTHORIZED'],
    [404, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'],
    [500, 'SERVER'],
    [503, 'SERVER'],
    [400, 'REJECTED']
  ];
  it.each(cases)('HTTP %i -> %s sans fuite de secret ni de corps', async (status, code) => {
    const { http } = mockHttp([{ status, raw: Buffer.from(`corps-sensible ${API_KEY} ${SECRET}`) }]);
    const error = await client(http)
      .getSnapshot('sr-1')
      .catch(e => e);
    expect(error).toBeInstanceOf(ExternalProviderError);
    expect(error.code).toBe(code);
    expect(error.message).not.toContain(API_KEY);
    expect(error.message).not.toContain(SECRET);
    expect(error.message).not.toContain('corps-sensible');
  });

  it('abandon -> TIMEOUT, panne réseau -> NETWORK', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    await expect(client(mockHttp([abort]).http).getSnapshot('x')).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(client(mockHttp([new Error(`ECONNRESET ${API_KEY}`)]).http).getSnapshot('x')).rejects.toMatchObject({
      code: 'NETWORK',
      message: expect.not.stringContaining(API_KEY)
    });
  });

  it('clé absente : UNAUTHORIZED sans appel', async () => {
    const { http, calls } = mockHttp([]);
    await expect(createYousignClient({ http }).getSnapshot('x')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(calls).toHaveLength(0);
  });

  it('corps JSON illisible : INVALID_RESPONSE', async () => {
    const { http } = mockHttp([{ status: 200, raw: Buffer.from('<html>') }]);
    await expect(client(http).getSnapshot('x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('cancel', () => {
  it('annule avec une raison documentée', async () => {
    const { http, calls } = mockHttp([{ status: 201, json: { id: 'sr-1', status: 'canceled' } }]);
    await client(http).cancel('sr-1');
    expect(calls[0].url).toMatch(/\/signature_requests\/sr-1\/cancel$/);
    expect(calls[0].json).toMatchObject({ reason: 'other' });
  });

  it('idempotent : 404, ou refus sur une demande déjà annulée/terminée', async () => {
    await expect(client(mockHttp([{ status: 404 }]).http).cancel('sr-1')).resolves.toBeUndefined();
    const snap = { id: 'sr-1', status: 'done', signers: [] };
    await expect(
      client(mockHttp([{ status: 400 }, { status: 200, json: snap }]).http).cancel('sr-1')
    ).resolves.toBeUndefined();
  });

  it('refus alors que la demande est en cours : l’erreur remonte', async () => {
    const snap = { id: 'sr-1', status: 'ongoing', signers: [] };
    await expect(
      client(mockHttp([{ status: 400 }, { status: 200, json: snap }]).http).cancel('sr-1')
    ).rejects.toMatchObject({
      code: 'REJECTED'
    });
  });
});

describe('getSnapshot', () => {
  it('mappe demande et signataires', async () => {
    const { http } = mockHttp([
      {
        status: 200,
        json: {
          id: 'sr-1',
          status: 'ongoing',
          signers: [
            { id: 'a', status: 'signed' },
            { id: 'b', status: 'notified' },
            { id: 'c', status: 'consent_given' },
            { id: 'd', status: 'declined' }
          ]
        }
      }
    ]);
    expect(await client(http).getSnapshot('sr-1')).toEqual({
      ref: 'sr-1',
      state: 'ONGOING',
      signers: [
        { ref: 'a', state: 'SIGNED', signedAt: null },
        { ref: 'b', state: 'PENDING', signedAt: null },
        { ref: 'c', state: 'OPENED', signedAt: null },
        { ref: 'd', state: 'DECLINED', signedAt: null }
      ]
    });
  });

  it.each([
    ['done', 'DONE'],
    ['expired', 'EXPIRED'],
    ['canceled', 'CANCELED'],
    ['declined', 'DECLINED'],
    ['rejected', 'DECLINED']
  ])('statut %s -> %s', async (status, state) => {
    const { http } = mockHttp([{ status: 200, json: { id: 'sr-1', status, signers: [] } }]);
    expect((await client(http).getSnapshot('sr-1')).state).toBe(state);
  });

  it('statut inconnu : INVALID_RESPONSE, jamais DONE', async () => {
    await expect(
      client(mockHttp([{ status: 200, json: { id: 'sr-1', status: 'mystere', signers: [] } }]).http).getSnapshot('sr-1')
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(
      client(
        mockHttp([{ status: 200, json: { id: 'sr-1', status: 'ongoing', signers: [{ id: 'a', status: 'nouveau' }] } }])
          .http
      ).getSnapshot('sr-1')
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('downloads', () => {
  it('renvoie le PDF signé et la preuve', async () => {
    const { http, calls } = mockHttp([
      { status: 200, raw: PDF },
      { status: 200, raw: PDF }
    ]);
    const c = client(http);
    expect(await c.downloadSigned('sr-1')).toEqual(PDF);
    expect(await c.downloadEvidence('sr-1')).toEqual(PDF);
    expect(calls[0].url).toContain('/documents/download?version=completed');
    expect(calls[1].url).toContain('/audit_trails/download?merge=true');
  });

  it('refuse une réponse qui n’est pas un PDF', async () => {
    const { http } = mockHttp([{ status: 200, raw: Buffer.from('PK\u0003\u0004zip') }]);
    await expect(client(http).downloadSigned('sr-1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('webhooks', () => {
  const body = Buffer.from(
    JSON.stringify({
      event_id: 'ev-1',
      event_name: 'signature_request.done',
      data: { signature_request: { id: 'sr-1' } }
    })
  );
  const sign = (b: Buffer, secret = SECRET) => `sha256=${crypto.createHmac('sha256', secret).update(b).digest('hex')}`;
  const c = client(mockHttp([]).http);

  it('accepte une signature valide, quelle que soit la casse de l’en-tête', () => {
    expect(c.verifyWebhook(body, { 'X-Yousign-Signature-256': sign(body) })).toBe(true);
    expect(c.verifyWebhook(body, { 'x-yousign-signature-256': [sign(body)] })).toBe(true);
  });

  it('refuse signature fausse, corps modifié, mauvaise longueur, en-tête absent ou mal formé', () => {
    expect(c.verifyWebhook(body, { 'x-yousign-signature-256': sign(body, 'autre-secret-0123456789') })).toBe(false);
    expect(c.verifyWebhook(Buffer.from('{}'), { 'x-yousign-signature-256': sign(body) })).toBe(false);
    expect(c.verifyWebhook(body, { 'x-yousign-signature-256': 'sha256=abc' })).toBe(false);
    expect(c.verifyWebhook(body, { 'x-yousign-signature-256': sign(body).replace('sha256=', '') })).toBe(false);
    expect(c.verifyWebhook(body, {})).toBe(false);
    expect(c.verifyWebhook(body, { 'x-yousign-signature-256': undefined })).toBe(false);
  });

  it('refuse tout sans secret configuré', () => {
    const noSecret = createYousignClient({ apiKey: API_KEY, http: mockHttp([]).http });
    expect(noSecret.verifyWebhook(body, { 'x-yousign-signature-256': sign(body) })).toBe(false);
  });

  it('parseWebhook extrait l’événement ou renvoie null', () => {
    expect(c.parseWebhook(body)).toEqual({ eventId: 'ev-1', eventName: 'signature_request.done', ref: 'sr-1' });
    expect(c.parseWebhook(Buffer.from('pas du json'))).toBeNull();
    expect(c.parseWebhook(Buffer.from(JSON.stringify({ event_name: 'x', data: {} })))).toBeNull();
    expect(c.parseWebhook(Buffer.from('[]'))).toBeNull();
  });
});

describe('transport par défaut (fetchTransport)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const request = { method: 'GET' as const, url: 'https://api.yousign.app/v3/x', headers: {}, timeoutMs: 1000 };

  it('ne suit aucune redirection', async () => {
    const spy = jest.fn(async () => new Response('ok', { status: 200 }));
    global.fetch = spy as never;
    await fetchTransport(request);
    expect(spy).toHaveBeenCalledWith(request.url, expect.objectContaining({ redirect: 'error' }));
  });

  it('refuse une réponse plus grande que le plafond (content-length)', async () => {
    global.fetch = jest.fn(
      async () => new Response('x', { status: 200, headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) } })
    ) as never;
    await expect(fetchTransport(request)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('refuse un flux qui dépasse le plafond sans content-length', async () => {
    const big = new Uint8Array(MAX_RESPONSE_BYTES + 1);
    global.fetch = jest.fn(async () => new Response(big, { status: 200 })) as never;
    await expect(fetchTransport(request)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
