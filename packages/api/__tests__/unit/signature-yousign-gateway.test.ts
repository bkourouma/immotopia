/**
 * Adaptateur Yousign, passerelle externe (spec 042 §10.2 SIG-S6) : demande créée en
 * `delivery_mode: 'none'`, lien de signature lu en direct sur la ressource signataire.
 * Transport HTTP mocké, aucun appel réseau.
 */
import {
  createYousignClient,
  YOUSIGN_SANDBOX_BASE_URL,
  isYousignHost,
  type YousignHttp,
  type YousignHttpRequest
} from '../../src/lib/signature/provider/external/yousign';
import { createExternalProvider } from '../../src/lib/signature/provider/external/provider';
import { ExternalProviderError } from '../../src/lib/signature/provider/external/types';

const API_KEY = 'sk_test_SUPERSECRETKEY123';
const LINK = 'https://sign.yousign.app/s/ABC123-secret';

type Reply = { status: number; json?: unknown } | Error;

function mockHttp(replies: Reply[]) {
  const calls: YousignHttpRequest[] = [];
  const http: YousignHttp = async request => {
    calls.push(request);
    const reply = replies.shift();
    if (!reply) throw new Error('réponse non prévue');
    if (reply instanceof Error) throw reply;
    return { status: reply.status, body: Buffer.from(JSON.stringify(reply.json ?? {})) };
  };
  return { http, calls };
}

const client = (http: YousignHttp) =>
  createYousignClient({ apiKey: API_KEY, http, now: () => new Date('2026-10-16T08:00:00Z') });

const INPUT = {
  requestId: 'req_1',
  title: 'Autorisation de prélèvement MDT-2026-0001',
  pdf: Buffer.from('%PDF-1.4 contenu'),
  language: 'fr' as const,
  sequential: false,
  expiresAt: new Date('2026-10-23T08:00:00Z'),
  signers: [{ position: 0, fullName: 'Awa Traoré', email: 'awa@example.com', role: 'DEBITEUR' }]
};
const OK_CREATE: Reply[] = [
  { status: 201, json: { id: 'sr-1' } },
  { status: 201, json: { id: 'doc-1' } },
  { status: 201, json: { id: 'sg-a' } },
  { status: 201, json: { id: 'sr-1' } }
];

describe('delivery_mode', () => {
  it("'none' : le prestataire n'envoie rien ; otp_email reste exigé au moment de signer", async () => {
    const { http, calls } = mockHttp([...OK_CREATE]);
    await client(http).create({ ...INPUT, deliveryMode: 'none' });
    expect(calls[0].json).toMatchObject({ delivery_mode: 'none' });
    expect((calls[2].json as Record<string, unknown>).signature_authentication_mode).toBe('otp_email');
  });

  it("par défaut : 'email' (comportement existant)", async () => {
    const { http, calls } = mockHttp([...OK_CREATE]);
    await client(http).create(INPUT);
    expect(calls[0].json).toMatchObject({ delivery_mode: 'email' });
  });

  it('le fournisseur externe transmet le mode du noyau', async () => {
    const { http, calls } = mockHttp([...OK_CREATE]);
    const provider = createExternalProvider(client(http));
    await provider.createRequest({
      tenantId: 't1',
      requestId: 'req_1',
      kind: 'DIRECT_DEBIT_MANDATE',
      signerCount: 1,
      external: { ...INPUT, deliveryMode: 'none' }
    });
    expect(calls[0].json).toMatchObject({ delivery_mode: 'none' });
  });
});

describe('getSignerLink', () => {
  it('lit signature_link sur la ressource signataire, en direct', async () => {
    const { http, calls } = mockHttp([{ status: 200, json: { id: 'sg-a', signature_link: LINK } }]);
    await expect(client(http).getSignerLink('sr-1', 'sg-a')).resolves.toBe(LINK);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'GET' });
    expect(calls[0].url).toBe(`${YOUSIGN_SANDBOX_BASE_URL}/signature_requests/sr-1/signers/sg-a`);
  });

  it.each([
    ['lien absent', { id: 'sg-a' }],
    ['lien non texte', { id: 'sg-a', signature_link: 42 }],
    ['lien http', { id: 'sg-a', signature_link: 'http://sign.exemple.test/x' }],
    ['lien javascript', { id: 'sg-a', signature_link: 'javascript:alert(1)' }],
    ['lien illisible', { id: 'sg-a', signature_link: 'pas une url' }],
    ['hôte étranger', { id: 'sg-a', signature_link: 'https://sign.exemple-prestataire.test/s/ABC' }],
    ['hôte piégé (suffixe)', { id: 'sg-a', signature_link: 'https://yousign.app.evil.test/s/ABC' }],
    ['hôte piégé (préfixe)', { id: 'sg-a', signature_link: 'https://evilyousign.app/s/ABC' }]
  ])('refuse une réponse invalide (%s) sans citer la réponse', async (_label, json) => {
    const { http } = mockHttp([{ status: 200, json }]);
    const error = await client(http)
      .getSignerLink('sr-1', 'sg-a')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExternalProviderError);
    expect(error).toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(String((error as Error).message)).not.toContain('javascript');
  });

  it("accepte l'hôte de l'API configurée, et seulement lui ou *.yousign.app", () => {
    expect(isYousignHost('api-sandbox.yousign.app', YOUSIGN_SANDBOX_BASE_URL)).toBe(true);
    expect(isYousignHost('YOUSIGN.app', YOUSIGN_SANDBOX_BASE_URL)).toBe(true);
    expect(isYousignHost('proxy.exemple.test', 'https://proxy.exemple.test/v3')).toBe(true);
    expect(isYousignHost('proxy.exemple.test', YOUSIGN_SANDBOX_BASE_URL)).toBe(false);
    expect(isYousignHost('yousign.app.evil.test', YOUSIGN_SANDBOX_BASE_URL)).toBe(false);
    expect(isYousignHost('sign.yousign.app', 'pas une url')).toBe(true);
    expect(isYousignHost('evil.test', 'pas une url')).toBe(false);
  });

  it('erreur HTTP : erreur typée, ni clé API ni lien dans le message', async () => {
    const { http } = mockHttp([{ status: 404 }]);
    const error = (await client(http)
      .getSignerLink('sr-1', 'sg-a')
      .catch((e: unknown) => e)) as ExternalProviderError;
    expect(error).toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(error.message).not.toContain(API_KEY);
  });
});
