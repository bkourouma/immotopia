/**
 * Plan V2, étape 4 — exécution CONFIRMÉE d'un plan d'écriture
 * (lib/ai/actions/execute-capability.ts).
 *
 * Le jeton réel (proposal-token.ts) est utilisé ; une mini-app Express sur un port éphémère
 * remplace l'API (loopback) et enregistre chaque requête ; permissions, audit et Prisma sont
 * simulés. Les jetons forgés sont signés avec la clé de test dérivée de JWT_SECRET (comme le
 * ferait quelqu'un qui connaîtrait la clé) : même signés, ils ne doivent rien pouvoir de
 * destructif ni de falsifié.
 */
import { createHmac, hkdfSync, randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: Record<string, any> = {
  auditLog: { findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
  $executeRaw: jest.fn(async () => 0)
};
const mockGetUserPermissions = jest.fn();
const mockLogAudit = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: (...a: unknown[]) => mockLoggerError(...a), debug: jest.fn() }
}));
jest.mock('../../src/services/permission-service', () => ({
  getUserPermissions: (...a: unknown[]) => mockGetUserPermissions(...a),
  hasPermission: jest.fn()
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (...a: unknown[]) => mockLogAudit(...a) }));

import { env } from '../../src/config/env';
import { AppError, ForbiddenError } from '../../src/middleware/error-middleware';
import type { ExecuteCapabilityArgs } from '../../src/lib/ai/contracts';
import { executeCapability } from '../../src/lib/ai/actions/execute-capability';
import { getCatalogEntries } from '../../src/lib/ai/gateway/catalog';
import * as loopbackModule from '../../src/lib/ai/gateway/loopback';
import { LoopbackTimeoutError, setLoopbackBaseUrlForTests } from '../../src/lib/ai/gateway/loopback';
import { computePlanHash } from '../../src/lib/ai/plan-hash';
import {
  resetProposalUsageForTests,
  signCapabilityProposal,
  signProposal,
  verifyCapabilityProposal
} from '../../src/lib/ai/proposal-token';
import { ALL_TOOLS } from '../../src/lib/ai/tools/registry';

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const USER = 'user-1';
const BEARER = 'eyJhbGciOiJIUzI1NiJ9.CONFIRMERSECRET123.SIGSECRET456';
const CONTACT_ID = '55555555-5555-4555-8555-555555555555';

const PATCH_CONTACT = 'PATCH /api/tenants/:tenantId/crm/contacts/:contactId';
const POST_VALIDATE = 'POST /api/tenants/:tenantId/finance/salary-notes/:salaryNoteId/validate';

const ALL_PERMISSIONS = [
  ...new Set(
    getCatalogEntries().flatMap(entry => [...(entry.permissions ?? []), ...(entry.anyOfPermissions ?? []).flat()])
  )
];

// --- mini-app loopback -------------------------------------------------------

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void;
let server: http.Server;
let handler: Handler;
const received: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders; body: string }> = [];

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      received.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      handler(req, res, body);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  setLoopbackBaseUrlForTests(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

afterAll(async () => {
  setLoopbackBaseUrlForTests(null);
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

// --- aides ---------------------------------------------------------------------

const argsFor = (overrides: Partial<Omit<ExecuteCapabilityArgs, 'planHash'>> = {}): ExecuteCapabilityArgs => {
  const base = {
    capabilityId: PATCH_CONTACT,
    pathParams: { contactId: CONTACT_ID },
    query: {},
    body: { city: 'Bouaké', score: 20 } as Record<string, unknown> | null,
    ...overrides
  };
  return { ...base, planHash: computePlanHash(base) };
};

const issue = (args = argsFor(), userId = USER, tenantId = TENANT) =>
  signCapabilityProposal({ userId, tenantId, args });

const headers = () => ({ Authorization: `Bearer ${BEARER}`, 'X-Forwarded-For': '203.0.113.7' });

const run = (token: string, extra: Partial<Parameters<typeof executeCapability>[0]> = {}) =>
  executeCapability({ token, userId: USER, tenantId: TENANT, loopbackHeaders: headers, ...extra });

/** Forge un jeton signé avec la vraie clé (une fuite de JWT_SECRET) : le contenu est librement choisi. */
function forge(claims: Record<string, unknown>): string {
  const key = Buffer.from(hkdfSync('sha256', env.JWT_SECRET, 'immotopia/immocopilot', 'proposal-token/v1', 32));
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const signature = createHmac('sha256', key).update(`v1.${payload}`).digest('base64url');
  return `v1.${payload}.${signature}`;
}

const forgedClaims = (args: object, overrides: Record<string, unknown> = {}) => {
  const iat = Math.floor(Date.now() / 1000);
  return {
    v: 1,
    jti: randomUUID(),
    sub: USER,
    tid: TENANT,
    act: 'EXECUTE_CAPABILITY',
    args,
    iat,
    exp: iat + 600,
    ...overrides
  };
};

const rejectedReasons = () =>
  mockLogAudit.mock.calls.filter(([e]) => e.actionKey === 'AI_ACTION_REJECTED').map(([e]) => e.payload.reason);
const writes = () => received.filter(r => r.method !== 'GET');

beforeEach(() => {
  jest.clearAllMocks();
  received.length = 0;
  resetProposalUsageForTests();
  mockPrisma.auditLog.findFirst.mockResolvedValue(null);
  mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  mockGetUserPermissions.mockResolvedValue(ALL_PERMISSIONS);
  handler = (_req, res) =>
    json(res, 200, { success: true, data: { id: CONTACT_ID, city: 'Bouaké', passwordHash: 'h4sh' } });
});

// --- exécution nominale ----------------------------------------------------------

describe('exécution d’un plan confirmé', () => {
  it('appelle la route avec le bon verbe, le bon chemin, le corps signé et les en-têtes du confirmeur', async () => {
    const { token, claims } = issue(argsFor({ query: { notify: false } }));
    // Une requête avec paramètres de requête exige le mot de confirmation (audit : query montrée à l'humain).
    const { payload } = await run(token, { confirmation: 'CONFIRMER' });

    expect(writes()).toHaveLength(1);
    const call = received[0]!;
    expect(call.method).toBe('PATCH');
    const url = new URL(`http://x${call.url}`);
    expect(url.pathname).toBe(`/api/tenants/${TENANT}/crm/contacts/${CONTACT_ID}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ notify: 'false' });
    expect(JSON.parse(call.body)).toEqual({ city: 'Bouaké', score: 20 });
    expect(call.headers.authorization).toBe(`Bearer ${BEARER}`);
    expect(call.headers['x-forwarded-for']).toBe('203.0.113.7');
    expect(call.headers['content-type']).toMatch(/json/);
    expect(call.headers['accept-language']).toBe('fr');

    expect(payload).toMatchObject({ kind: 'capability', proposalId: claims.jti, ok: true, status: 200 });
    expect(typeof payload.message).toBe('string');
  });

  it('POST de création : verbe POST et corps vide { } quand il n’y a pas de corps', async () => {
    const args = argsFor({ capabilityId: 'POST /api/tenants/:tenantId/crm/contacts', pathParams: {}, body: null });
    await run(issue(args).token);
    expect(received[0]!.method).toBe('POST');
    expect(received[0]!.url).toBe(`/api/tenants/${TENANT}/crm/contacts`);
    expect(JSON.parse(received[0]!.body)).toEqual({});
  });

  it('impose le tenantId de la requête authentifiée dans le chemin', async () => {
    await run(issue().token);
    expect(received[0]!.url).toContain(`/api/tenants/${TENANT}/`);
    expect(received[0]!.url).not.toContain(OTHER_TENANT);
  });

  it('resultPreview : réponse masquée et réduite comme call_read, jamais de secret', async () => {
    handler = (_req, res) =>
      json(res, 200, {
        success: true,
        data: {
          id: CONTACT_ID,
          passwordHash: 'h4sh',
          note: 'x'.repeat(900),
          list: Array.from({ length: 300 }, (_, i) => i)
        }
      });
    const { payload } = await run(issue().token);
    const text = JSON.stringify(payload.resultPreview);
    expect(text).not.toContain('h4sh');
    expect(text).toContain('[masqué]');
    expect(text).not.toContain('x'.repeat(501));
    expect(text.length).toBeLessThanOrEqual(12000);
  });

  it('resultPreview : retire récursivement file_path / filePath / path (chemins disque)', async () => {
    handler = (_req, res) =>
      json(res, 200, {
        success: true,
        data: {
          id: CONTACT_ID,
          file_path: '/srv/uploads/private/a.pdf',
          doc: { filePath: '/srv/uploads/b.pdf', name: 'b', files: [{ path: '/srv/uploads/c.pdf', size: 3 }] }
        }
      });
    const { payload } = await run(issue().token);
    const text = JSON.stringify(payload.resultPreview);
    expect(text).not.toContain('/srv/uploads');
    expect(text).not.toMatch(/file_path|filePath|"path"/);
    expect(text).toContain('"size":3');
    expect(text).toContain('"name":"b"');
  });

  it('une réponse d’erreur de la route (403, 422) devient { ok:false, status, message } ; le jeton est consommé', async () => {
    handler = (_req, res) => json(res, 403, { success: false, message: 'Permission requise : CRM_CONTACTS_EDIT' });
    const { token } = issue();
    const { payload } = await run(token);
    expect(payload).toMatchObject({
      kind: 'capability',
      ok: false,
      status: 403,
      message: 'Permission requise : CRM_CONTACTS_EDIT'
    });
    await expect(run(token)).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_USED', statusCode: 409 });
    expect(writes()).toHaveLength(1);

    handler = (_req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<pre>Error at /srv/app/secret.ts:9</pre>');
    };
    const second = await run(issue().token);
    expect(second.payload).toMatchObject({ ok: false, status: 500 });
    expect(JSON.stringify(second.payload)).not.toContain('/srv/app');
  });

  it('délai dépassé : 504, message honnête (l’écriture a pu aboutir), jamais rejouée', async () => {
    const spy = jest.spyOn(loopbackModule, 'loopbackWrite').mockRejectedValueOnce(new LoopbackTimeoutError());
    const { token } = issue();
    const { payload } = await run(token);
    expect(payload).toMatchObject({ ok: false, status: 504 });
    expect(payload.message).toMatch(/peut-être/);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    await expect(run(token)).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_USED' });
  });

  it('délai d’une écriture : 30 s (voir LOOPBACK_WRITE_TIMEOUT_MS)', () => {
    expect(loopbackModule.LOOPBACK_WRITE_TIMEOUT_MS).toBe(30_000);
  });
});

// --- usage unique, expiration, identité ---------------------------------------------

describe('jeton : usage unique, expiration, utilisateur, agence', () => {
  it('rejeu : PROPOSAL_ALREADY_USED (409), une seule écriture', async () => {
    const { token } = issue();
    await run(token);
    await expect(run(token)).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_USED', statusCode: 409 });
    expect(writes()).toHaveLength(1);
    expect(rejectedReasons()).toContain('ALREADY_USED');
  });

  it('double clic simultané : une seule écriture', async () => {
    const { token } = issue();
    const results = await Promise.allSettled([run(token), run(token)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(writes()).toHaveLength(1);
  });

  it('verrou consultatif : réclamation sous verrou transactionnel propre au jeton', async () => {
    const { token, claims } = issue();
    await run(token);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.$executeRaw.mock.calls[0]![1]).toBe(`ai-proposal:${TENANT}:${claims.jti}`);
    expect(mockPrisma.auditLog.create.mock.calls[0]![0].data).toMatchObject({
      actionKey: 'AI_PROPOSAL_REDEEMED',
      entityId: claims.jti,
      payload: { act: 'EXECUTE_CAPABILITY', capabilityId: PATCH_CONTACT }
    });
  });

  it('expiré : PROPOSAL_EXPIRED (410), rien d’écrit', async () => {
    const past = Math.floor(Date.now() / 1000) - 1000;
    const token = forge(forgedClaims(argsFor(), { iat: past - 900, exp: past }));
    await expect(run(token)).rejects.toMatchObject({ code: 'PROPOSAL_EXPIRED', statusCode: 410 });
    expect(writes()).toHaveLength(0);
  });

  it('autre utilisateur : PROPOSAL_INVALID, rien d’écrit', async () => {
    const { token } = issue(argsFor(), 'autre-utilisateur');
    await expect(run(token)).rejects.toMatchObject({ code: 'PROPOSAL_INVALID', statusCode: 400 });
    expect(rejectedReasons()).toContain('WRONG_USER');
    expect(writes()).toHaveLength(0);
  });

  it('autre agence (jeton de A présenté sur B) : PROPOSAL_INVALID, rien d’écrit', async () => {
    const { token } = issue();
    await expect(run(token, { tenantId: OTHER_TENANT })).rejects.toMatchObject({ code: 'PROPOSAL_INVALID' });
    expect(rejectedReasons()).toContain('WRONG_TENANT');
    expect(writes()).toHaveLength(0);
  });

  it('signature altérée, jeton illisible : PROPOSAL_INVALID', async () => {
    const { token } = issue();
    const [v, payload, signature] = token.split('.');
    await expect(run(`${v}.${payload}.${signature!.slice(0, -2)}AA`)).rejects.toMatchObject({
      code: 'PROPOSAL_INVALID'
    });
    await expect(run('x'.repeat(40))).rejects.toMatchObject({ code: 'PROPOSAL_INVALID' });
    expect(writes()).toHaveLength(0);
  });

  it('un jeton de quittance n’exécute rien ici, et inversement un jeton de plan n’est pas une quittance', async () => {
    const rental = signProposal({
      userId: USER,
      tenantId: TENANT,
      args: { docType: 'RENT_STATEMENT', leaseId: CONTACT_ID, startDate: '2026-01-01', endDate: '2026-02-01' }
    }).token;
    await expect(run(rental)).rejects.toMatchObject({ code: 'PROPOSAL_INVALID' });
    expect(writes()).toHaveLength(0);
    const plan = issue().token;
    expect(() => verifyCapabilityProposal(plan, { userId: USER, tenantId: TENANT })).not.toThrow();
  });
});

// --- empreinte, catalogue, jamais de suppression -------------------------------------------

describe('défense en profondeur : empreinte et catalogue', () => {
  it('planHash altéré (jeton re-signé avec une empreinte qui ne correspond pas) : refusé, rien d’écrit', async () => {
    const args = argsFor();
    const token = forge(forgedClaims({ ...args, planHash: 'a'.repeat(64) }));
    await expect(run(token)).rejects.toMatchObject({ code: 'PROPOSAL_INVALID' });
    expect(rejectedReasons()).toContain('PLAN_HASH_MISMATCH');
    expect(writes()).toHaveLength(0);
  });

  it('arguments altérés sans recalculer l’empreinte (corps modifié) : refusé', async () => {
    const args = argsFor();
    const token = forge(forgedClaims({ ...args, body: { city: 'Autre', score: 99 } }));
    await expect(run(token)).rejects.toMatchObject({ code: 'PROPOSAL_INVALID' });
    expect(rejectedReasons()).toContain('PLAN_HASH_MISMATCH');
    expect(writes()).toHaveLength(0);
  });

  it('DELETE n’est JAMAIS exécutable, même avec un jeton signé avec la vraie clé', async () => {
    const capabilityId = 'DELETE /api/tenants/:tenantId/crm/contacts/:contactId';
    const base = { capabilityId, pathParams: { contactId: CONTACT_ID }, query: {}, body: null };
    const token = forge(forgedClaims({ ...base, planHash: computePlanHash(base) }));
    await expect(run(token)).rejects.toMatchObject({ code: 'PROPOSAL_INVALID' });
    expect(writes()).toHaveLength(0);
    expect(received).toHaveLength(0);
  });

  it.each([
    ['suppression déguisée en POST', 'POST /api/tenants/:tenantId/crm/contacts/:contactId/delete'],
    ['route inconnue du catalogue', 'PATCH /api/tenants/:tenantId/inconnu/:id'],
    ['lecture (GET)', 'GET /api/tenants/:tenantId/crm/contacts/:contactId']
  ])('%s : refusé à l’exécution, rien d’écrit', async (_name, capabilityId) => {
    const base = { capabilityId, pathParams: { contactId: CONTACT_ID }, query: {}, body: { a: 1 } };
    const token = forge(forgedClaims({ ...base, planHash: computePlanHash(base) }));
    await expect(run(token)).rejects.toBeInstanceOf(Error);
    expect(received).toHaveLength(0);
  });

  it('écriture « sensible-interdite » du catalogue (secret, jeton, passerelle…) : refusée à l’exécution', async () => {
    const entry = getCatalogEntries().find(e => e.method !== 'GET' && e.sensitive)!;
    expect(entry).toBeDefined();
    const params = Object.fromEntries(entry.pathParams.map(name => [name, CONTACT_ID]));
    const base = { capabilityId: entry.id, pathParams: params, query: {}, body: {} };
    const token = forge(forgedClaims({ ...base, planHash: computePlanHash(base) }));
    await expect(run(token)).rejects.toBeInstanceOf(ForbiddenError);
    expect(rejectedReasons()).toContain('CAPABILITY_NOT_ALLOWED');
    expect(received).toHaveLength(0);
  });

  it('paramètres de chemin forgés (traversée, tenantId) : refusés, jeton non consommé', async () => {
    for (const pathParams of [
      { contactId: '../../auth/me' },
      { contactId: CONTACT_ID, tenantId: OTHER_TENANT },
      {}
    ] as Array<Record<string, string>>) {
      const base = { capabilityId: PATCH_CONTACT, pathParams, query: {}, body: { a: 1 } };
      const token = forge(forgedClaims({ ...base, planHash: computePlanHash(base) }));
      await expect(run(token)).rejects.toBeInstanceOf(Error);
    }
    expect(received).toHaveLength(0);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('corps forgé hors limites (clé __proto__, profondeur, taille) : refusé dès la lecture des claims', async () => {
    const poisoned = `{"capabilityId":${JSON.stringify(PATCH_CONTACT)},"pathParams":{"contactId":"${CONTACT_ID}"},"query":{},"body":{"__proto__":{"admin":true}},"planHash":"${'a'.repeat(64)}"}`;
    const iat = Math.floor(Date.now() / 1000);
    const claims = `{"v":1,"jti":"j1","sub":"${USER}","tid":"${TENANT}","act":"EXECUTE_CAPABILITY","args":${poisoned},"iat":${iat},"exp":${iat + 600}}`;
    const key = Buffer.from(hkdfSync('sha256', env.JWT_SECRET, 'immotopia/immocopilot', 'proposal-token/v1', 32));
    const payload = Buffer.from(claims, 'utf8').toString('base64url');
    const token = `v1.${payload}.${createHmac('sha256', key).update(`v1.${payload}`).digest('base64url')}`;
    await expect(run(token)).rejects.toMatchObject({ code: 'PROPOSAL_INVALID' });

    for (const body of [{ a: { b: { c: { d: { e: 1 } } } } }, { big: 'x'.repeat(9000) }]) {
      const base = { capabilityId: PATCH_CONTACT, pathParams: { contactId: CONTACT_ID }, query: {}, body };
      await expect(run(forge(forgedClaims({ ...base, planHash: computePlanHash(base) })))).rejects.toMatchObject({
        code: 'PROPOSAL_INVALID'
      });
    }
    expect(received).toHaveLength(0);
  });

  it('le registre des outils du LLM ne contient aucune porte d’exécution', () => {
    expect(ALL_TOOLS.some(tool => /execute/i.test(tool.name))).toBe(false);
    expect(ALL_TOOLS.every(tool => tool.kind === 'read' || tool.kind === 'proposal')).toBe(true);
  });
});

// --- permissions, confirmation renforcée -------------------------------------------------------

describe('permissions et confirmation', () => {
  it('permission du catalogue retirée depuis le plan : ForbiddenError, jeton NON consommé, rien d’écrit', async () => {
    mockGetUserPermissions.mockResolvedValue(['PROPERTIES_VIEW']);
    const { token } = issue();
    await expect(run(token)).rejects.toBeInstanceOf(ForbiddenError);
    expect(rejectedReasons()).toContain('PERMISSION_REVOKED');
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
    mockGetUserPermissions.mockResolvedValue(ALL_PERMISSIONS);
    await expect(run(token)).resolves.toBeDefined();
  });

  it('sans en-têtes d’authentification : refus, jeton non consommé', async () => {
    const { token } = issue();
    await expect(run(token, { loopbackHeaders: undefined })).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    await expect(run(token)).resolves.toBeDefined();
  });

  const sensitive = () =>
    issue(argsFor({ capabilityId: POST_VALIDATE, pathParams: { salaryNoteId: CONTACT_ID }, body: {} }));

  it.each([undefined, '', 'confirmer', 'OUI', 'CONFIRMER '])(
    'écriture sensible, confirmation %p : CONFIRMATION_REQUIRED (400), jeton NON consommé',
    async confirmation => {
      const { token } = sensitive();
      const error = await run(token, { confirmation }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: 'CONFIRMATION_REQUIRED', statusCode: 400 });
      expect(writes()).toHaveLength(0);
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
      expect(rejectedReasons()).toContain('CONFIRMATION_REQUIRED');
    }
  );

  it('écriture sensible : après un refus, la bonne saisie dans le délai du plan réussit (même jeton)', async () => {
    const { token } = sensitive();
    await expect(run(token)).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    const { payload } = await run(token, { confirmation: 'CONFIRMER' });
    expect(payload.ok).toBe(true);
    expect(writes()).toHaveLength(1);
    expect(received[0]!.url).toContain('/finance/salary-notes/');
    expect(received[0]!.url).toContain('/validate');
  });

  it('requête avec paramètres de requête : le mot est exigé (le plan ne reproduit pas la requête dans les changements)', async () => {
    const { token } = issue(argsFor({ query: { dryRun: true } }));
    await expect(run(token)).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    expect(writes()).toHaveLength(0);
    await expect(run(token, { confirmation: 'CONFIRMER' })).resolves.toBeDefined();
    expect(received[0]!.url).toContain('dryRun=true');
  });

  it('corps sensible sur une route de comptes (roles sur PATCH /users/:userId) : le mot est exigé', async () => {
    const { token } = issue(
      argsFor({
        capabilityId: 'PATCH /api/tenants/:tenantId/users/:userId',
        pathParams: { userId: CONTACT_ID },
        body: { roles: ['ADMIN'] }
      })
    );
    await expect(run(token)).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    await expect(run(token, { confirmation: 'CONFIRMER' })).resolves.toBeDefined();
  });

  it('requireConfirmation signé (liste remplacée) : exigé à l’exécution ; retirer le drapeau change l’empreinte, refusé', async () => {
    const withFlag = { ...argsFor(), requireConfirmation: true as const };
    const flagged = issue({
      ...withFlag,
      planHash: computePlanHash(withFlag)
    });
    await expect(run(flagged.token)).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    await expect(run(flagged.token, { confirmation: 'CONFIRMER' })).resolves.toBeDefined();
    // Jeton re-signé SANS le drapeau mais avec l'empreinte du plan à drapeau : empreinte incohérente.
    const stripped = issue({ ...argsFor(), planHash: computePlanHash(withFlag) });
    await expect(run(stripped.token)).rejects.toMatchObject({ code: 'PROPOSAL_INVALID' });
    expect(computePlanHash(argsFor())).not.toBe(computePlanHash(withFlag));
  });

  it('plan non sensible : la confirmation est ignorée', async () => {
    const { payload } = await run(issue().token, { confirmation: 'bla' });
    expect(payload.ok).toBe(true);
  });

  it('corps de plus de 30 champs : le mot est exigé aussi (le plan ne peut pas l’afficher en entier)', async () => {
    const body = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`c${i}`, i]));
    const { token } = issue(argsFor({ body }));
    await expect(run(token)).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    await expect(run(token, { confirmation: 'CONFIRMER' })).resolves.toBeDefined();
  });
});

// --- audit ------------------------------------------------------------------------------------------

describe('audit de l’exécution', () => {
  it('journalise qui, agence, capabilityId, planHash, statut — jamais le corps brut ni un secret', async () => {
    const args = argsFor({ body: { city: 'Valeur-privée', password: 'p4ss-secret' } });
    const { token, claims } = issue(args);
    await run(token);
    const executed = mockLogAudit.mock.calls.map(([e]) => e).filter(e => e.actionKey === 'AI_ACTION_EXECUTED');
    expect(executed).toHaveLength(1);
    expect(executed[0]).toMatchObject({
      actorUserId: USER,
      tenantId: TENANT,
      entityType: 'AI_CAPABILITY',
      entityId: claims.jti,
      payload: {
        kind: 'capability',
        proposalId: claims.jti,
        capabilityId: PATCH_CONTACT,
        planHash: args.planHash,
        status: 200,
        ok: true
      }
    });
    const everything = JSON.stringify([mockLogAudit.mock.calls, mockPrisma.auditLog.create.mock.calls]);
    expect(everything).not.toMatch(/Valeur-privée|p4ss-secret|CONFIRMERSECRET|SIGSECRET|h4sh/);
  });

  it('une écriture refusée par la route est aussi journalisée (ok: false, statut)', async () => {
    handler = (_req, res) => json(res, 422, { success: false, message: 'Invalide' });
    await run(issue().token);
    const executed = mockLogAudit.mock.calls.map(([e]) => e).find(e => e.actionKey === 'AI_ACTION_EXECUTED');
    expect(executed.payload).toMatchObject({ ok: false, status: 422 });
  });

  it('le jeton d’accès du confirmeur n’est ni renvoyé ni journalisé', async () => {
    const { payload } = await run(issue().token);
    expect(JSON.stringify(payload)).not.toContain('CONFIRMERSECRET');
    expect(JSON.stringify(mockLoggerError.mock.calls)).not.toContain('CONFIRMERSECRET');
  });
});
