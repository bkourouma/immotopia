/**
 * Plan V2, étape 4 — `POST /ai/actions/execute` pour un plan d'écriture générique, et
 * chaîne complète chat -> plan -> confirmation.
 *
 * Authentification et accès à l'agence sont des passe-plats (en-têtes de test) ; le fournisseur
 * LLM est le faux fournisseur ; les écritures partent vers une mini-app Express (loopback)
 * qui enregistre ce qu'elle reçoit. Gardes de l'assistant, limiteurs, contrôleur,
 * orchestrateur, jeton et exécuteur sont les vrais.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import request from 'supertest';

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: req.header('x-user') || 'user-1', email: 'u@example.com', globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = {
      tenantId: req.params.tenantId,
      role: null,
      isCollaborator: true,
      isClient: false,
      isSuperAdmin: false
    };
    next();
  },
  requireTenantCollaborator: (_req: any, _res: any, next: any) => next()
}));

let mockProvider: unknown = null;
jest.mock('../../src/lib/ai/providers', () => ({
  ...jest.requireActual('../../src/lib/ai/providers'),
  getLlmProvider: () => mockProvider
}));

let mockEnforcement = 'warn';
jest.mock('../../src/lib/subscription/enforcement', () => ({ getSubscriptionEnforcement: () => mockEnforcement }));

const mockGetEntitlements = jest.fn();
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: (...a: unknown[]) => mockGetEntitlements(...a)
}));

const mockGetUserPermissions = jest.fn();
const mockHasPermission = jest.fn();
jest.mock('../../src/services/permission-service', () => ({
  getUserPermissions: (...a: unknown[]) => mockGetUserPermissions(...a),
  hasPermission: (...a: unknown[]) => mockHasPermission(...a),
  hasAnyPermission: jest.fn(),
  hasAllPermissions: jest.fn()
}));

const mockPrisma: Record<string, any> = {
  rentalLease: { findFirst: jest.fn() },
  auditLog: { findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
  $executeRaw: jest.fn(async () => 0)
};
const mockGenerateDocument = jest.fn();
const mockLogAudit = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/property-service', () => ({ listProperties: jest.fn() }));
jest.mock('../../src/services/rental-lease-service', () => ({ listLeases: jest.fn() }));
jest.mock('../../src/services/rental-document-service', () => ({ listDocuments: jest.fn() }));
jest.mock('../../src/services/property-document-service', () => ({ getDocuments: jest.fn() }));
jest.mock('../../src/utils/property-tenant-guard', () => ({ getPropertyForTenant: jest.fn() }));
jest.mock('../../src/services/document-template-service', () => ({ resolveTemplate: jest.fn() }));
jest.mock('../../src/services/document-generation-service', () => ({
  generateDocument: (...a: unknown[]) => mockGenerateDocument(...a)
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (...a: unknown[]) => mockLogAudit(...a) }));

import { FakeProvider } from '../../src/lib/ai/providers';
import { getCatalogEntries } from '../../src/lib/ai/gateway/catalog';
import { setLoopbackBaseUrlForTests } from '../../src/lib/ai/gateway/loopback';
import { computePlanHash } from '../../src/lib/ai/plan-hash';
import { resetProposalUsageForTests, signCapabilityProposal, signProposal } from '../../src/lib/ai/proposal-token';
import { errorHandler } from '../../src/middleware/error-middleware';
import aiRoutes from '../../src/routes/ai-routes';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const BEARER = 'eyJhbGciOiJIUzI1NiJ9.ROUTESECRET123.SIGROUTE456';
const CONTACT_ID = '55555555-5555-4555-8555-555555555555';
const LEASE_ID = '11111111-1111-4111-8111-111111111111';
const PATCH_CONTACT = 'PATCH /api/tenants/:tenantId/crm/contacts/:contactId';
const POST_VALIDATE = 'POST /api/tenants/:tenantId/finance/salary-notes/:salaryNoteId/validate';

const CATALOG_PERMISSIONS = [
  ...new Set(
    getCatalogEntries().flatMap(entry => [...(entry.permissions ?? []), ...(entry.anyOfPermissions ?? []).flat()])
  ),
  'PROPERTIES_VIEW'
];

const app = express();
app.use(express.json());
app.use('/api/tenants/:tenantId/ai', aiRoutes);
app.use(errorHandler);

// --- mini-app loopback -------------------------------------------------------
type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;
let server: http.Server;
let handler: Handler;
const received: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders; body: string }> = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      received.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      handler(req, res);
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

let userCounter = 0;
let currentUser = 'user-0';

const base = (tenant = TENANT_A) => `/api/tenants/${tenant}/ai`;
const post = (path: string, body: unknown, bearer: string | null = BEARER) => {
  const req = request(app).post(path).set('x-user', currentUser);
  return (bearer ? req.set('Authorization', `Bearer ${bearer}`) : req).send(body as object);
};

const plan = (overrides: Record<string, unknown> = {}, userId = currentUser, tenantId = TENANT_A) => {
  const args = {
    capabilityId: PATCH_CONTACT,
    pathParams: { contactId: CONTACT_ID },
    query: {},
    body: { city: 'Bouaké' } as Record<string, unknown> | null,
    ...overrides
  };
  return signCapabilityProposal({
    userId,
    tenantId,
    args: { ...args, planHash: computePlanHash(args as never) } as never
  }).token;
};

beforeEach(() => {
  jest.clearAllMocks();
  received.length = 0;
  resetProposalUsageForTests();
  userCounter += 1;
  currentUser = `user-${userCounter}`; // un budget de débit neuf par test
  mockProvider = new FakeProvider();
  mockEnforcement = 'warn';
  mockGetUserPermissions.mockResolvedValue(CATALOG_PERMISSIONS);
  mockHasPermission.mockResolvedValue(true);
  mockPrisma.auditLog.findFirst.mockResolvedValue(null);
  mockPrisma.auditLog.create.mockResolvedValue({});
  handler = (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: { id: CONTACT_ID } }));
  };
});

describe('POST /ai/actions/execute — plan d’écriture', () => {
  it('exécute par loopback sous l’identité de la requête de confirmation : 201 { success, data: capability }', async () => {
    const res = await post(`${base()}/actions/execute`, { proposalToken: plan() });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ kind: 'capability', ok: true, status: 200 });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ method: 'PATCH', url: `/api/tenants/${TENANT_A}/crm/contacts/${CONTACT_ID}` });
    expect(JSON.parse(received[0]!.body)).toEqual({ city: 'Bouaké' });
    expect(received[0]!.headers.authorization).toBe(`Bearer ${BEARER}`);
    expect(mockGenerateDocument).not.toHaveBeenCalled();
  });

  it('ne demande PLUS documents:generate ni documents:view pour un plan (la route réelle porte la permission)', async () => {
    mockHasPermission.mockResolvedValue(false);
    const res = await post(`${base()}/actions/execute`, { proposalToken: plan() });
    expect(res.status).toBe(201);
    expect(mockHasPermission).not.toHaveBeenCalledWith(
      expect.anything(),
      'RENTAL_DOCUMENTS_GENERATE',
      expect.anything()
    );
  });

  it('la route appelée refuse (403) : 200 avec ok:false et le message de la route', async () => {
    handler = (_req, res) => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Permission requise : CRM_CONTACTS_EDIT' }));
    };
    const res = await post(`${base()}/actions/execute`, { proposalToken: plan() });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ok: false, status: 403, message: 'Permission requise : CRM_CONTACTS_EDIT' });
  });

  it('sans authentification rejouable (ni cookie ni Bearer) : 403, rien d’écrit, jeton non consommé', async () => {
    const token = plan();
    const res = await post(`${base()}/actions/execute`, { proposalToken: token }, null);
    expect(res.status).toBe(403);
    expect(received).toHaveLength(0);
    expect((await post(`${base()}/actions/execute`, { proposalToken: token })).status).toBe(201);
  });

  it('accepte un jeton volumineux (corps de 7 Ko) : au-delà des 4 096 caractères d’avant', async () => {
    const token = plan({ body: { note: 'n'.repeat(7000) } });
    expect(token.length).toBeGreaterThan(4096);
    const res = await post(`${base()}/actions/execute`, { proposalToken: token });
    expect(res.status).toBe(201);
    expect(JSON.parse(received[0]!.body).note).toHaveLength(7000);
  });

  it('confirmation : max 20 caractères (400), mot exigé pour une écriture sensible (400 sans consommer), puis 201', async () => {
    expect(
      (await post(`${base()}/actions/execute`, { proposalToken: plan(), confirmation: 'x'.repeat(21) })).status
    ).toBe(400);
    const token = plan({ capabilityId: POST_VALIDATE, pathParams: { salaryNoteId: CONTACT_ID }, body: {} });
    const refused = await post(`${base()}/actions/execute`, { proposalToken: token });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('CONFIRMATION_REQUIRED');
    expect(received).toHaveLength(0);
    const ok = await post(`${base()}/actions/execute`, { proposalToken: token, confirmation: 'CONFIRMER' });
    expect(ok.status).toBe(201);
    expect(received[0]!.method).toBe('POST');
  });

  it('rejeu : 409 PROPOSAL_ALREADY_USED, une seule écriture', async () => {
    const token = plan();
    expect((await post(`${base()}/actions/execute`, { proposalToken: token })).status).toBe(201);
    const second = await post(`${base()}/actions/execute`, { proposalToken: token });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('PROPOSAL_ALREADY_USED');
    expect(received).toHaveLength(1);
  });

  it('jeton de l’agence A présenté sur l’agence B, ou d’un autre utilisateur : 400 PROPOSAL_INVALID, rien d’écrit', async () => {
    const res = await post(`${base(TENANT_B)}/actions/execute`, { proposalToken: plan() });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PROPOSAL_INVALID');
    const other = await post(`${base()}/actions/execute`, { proposalToken: plan({}, 'autre-utilisateur') });
    expect(other.status).toBe(400);
    expect(received).toHaveLength(0);
  });

  it('limiteur partagé : 10 confirmations par minute et par utilisateur, puis 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await post(`${base()}/actions/execute`, {})).status);
    expect(statuses.slice(0, 10).every(status => status === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('abonnement : en enforce sans module de location, le plan d’écriture passe (CORE), pas la quittance', async () => {
    mockEnforcement = 'enforce';
    mockGetEntitlements.mockResolvedValue({
      enforcement: 'enforce',
      moduleAccess: {
        MODULE_SYNDIC: 'FULL',
        MODULE_AGENCY: 'NONE',
        MODULE_PROMOTER: 'NONE',
        MODULE_PATRIMOINE: 'NONE'
      },
      readOnly: false
    });
    expect((await post(`${base()}/actions/execute`, { proposalToken: plan() })).status).toBe(201);
    mockPrisma.rentalLease.findFirst.mockResolvedValue({ id: LEASE_ID });
    const rental = signProposal({
      userId: currentUser,
      tenantId: TENANT_A,
      args: { docType: 'RENT_STATEMENT', leaseId: LEASE_ID, startDate: '2026-01-01', endDate: '2026-02-01' }
    }).token;
    const res = await post(`${base()}/actions/execute`, { proposalToken: rental });
    expect(res.status).toBe(403);
    expect(mockGenerateDocument).not.toHaveBeenCalled();
  });
});

describe('POST /ai/actions/reject — refus d’un plan', () => {
  const auditKeys = () => mockLogAudit.mock.calls.map(([event]) => event.actionKey);

  it('consomme le jeton : 200 { rejected: true }, audit AI_PROPOSAL_REJECTED, puis l’exécution est refusée (409), rien d’écrit', async () => {
    const token = plan();
    const res = await post(`${base()}/actions/reject`, { proposalToken: token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { rejected: true } });
    expect(auditKeys()).toContain('AI_PROPOSAL_REJECTED');
    const rejectedEvent = mockLogAudit.mock.calls.find(([event]) => event.actionKey === 'AI_PROPOSAL_REJECTED')![0];
    expect(JSON.stringify(rejectedEvent)).not.toContain(token);
    expect(rejectedEvent.payload).toEqual({ act: 'EXECUTE_CAPABILITY', capabilityId: PATCH_CONTACT });
    const exec = await post(`${base()}/actions/execute`, { proposalToken: token });
    expect(exec.status).toBe(409);
    expect(exec.body.code).toBe('PROPOSAL_ALREADY_USED');
    expect(received).toHaveLength(0);
  });

  it('idempotent : un jeton déjà refusé, déjà exécuté ou expiré répond 200 { rejected: false } sans erreur', async () => {
    const token = plan();
    await post(`${base()}/actions/reject`, { proposalToken: token });
    const again = await post(`${base()}/actions/reject`, { proposalToken: token });
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual({ rejected: false });

    const executed = plan({ body: { city: 'Autre' } });
    expect((await post(`${base()}/actions/execute`, { proposalToken: executed })).status).toBe(201);
    const after = await post(`${base()}/actions/reject`, { proposalToken: executed });
    expect(after.status).toBe(200);
    expect(after.body.data).toEqual({ rejected: false });

    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout'] });
    try {
      const old = plan({ body: { city: 'Vieux' } });
      jest.setSystemTime(Date.now() + 2 * 3600 * 1000);
      const expired = await post(`${base()}/actions/reject`, { proposalToken: old });
      expect(expired.status).toBe(200);
      expect(expired.body.data).toEqual({ rejected: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it('jeton d’un autre utilisateur, d’une autre agence, forgé ou illisible : 400 PROPOSAL_INVALID, jeton NON consommé', async () => {
    const token = plan();
    const otherTenant = await post(`${base(TENANT_B)}/actions/reject`, { proposalToken: token });
    expect(otherTenant.status).toBe(400);
    expect(otherTenant.body.code).toBe('PROPOSAL_INVALID');
    const otherUser = await post(`${base()}/actions/reject`, { proposalToken: plan({}, 'autre-utilisateur') });
    expect(otherUser.status).toBe(400);
    const [v, payload] = token.split('.');
    expect(
      (await post(`${base()}/actions/reject`, { proposalToken: `${v}.${payload}.AAAA${'A'.repeat(40)}` })).status
    ).toBe(400);
    expect((await post(`${base()}/actions/reject`, { proposalToken: 'x'.repeat(30) })).status).toBe(400);
    expect(auditKeys()).not.toContain('AI_PROPOSAL_REJECTED');
    // Le jeton valide de l'utilisateur légitime reste utilisable.
    expect((await post(`${base()}/actions/execute`, { proposalToken: token })).status).toBe(201);
  });

  it('corps strict (clé inconnue refusée) et limiteur d’action partagé (429)', async () => {
    expect((await post(`${base()}/actions/reject`, { proposalToken: plan(), tenantId: 'x' })).status).toBe(400);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await post(`${base()}/actions/reject`, {})).status);
    expect(statuses[10]).toBe(429);
  });

  it('ne demande aucune permission de génération (collaborateur sans documents:generate)', async () => {
    mockHasPermission.mockResolvedValue(false);
    const res = await post(`${base()}/actions/reject`, { proposalToken: plan() });
    expect(res.status).toBe(200);
    expect(mockHasPermission).not.toHaveBeenCalled();
  });
});

describe('POST /ai/actions/execute — quittance : permissions inchangées', () => {
  const statement = () =>
    signProposal({
      userId: currentUser,
      tenantId: TENANT_A,
      args: { docType: 'RENT_STATEMENT', leaseId: LEASE_ID, startDate: '2026-01-01', endDate: '2026-03-31' }
    }).token;

  it('GENERATE et VIEW sont toujours exigées (403 sinon, rien n’est généré, rien n’est réclamé)', async () => {
    mockHasPermission.mockResolvedValue(false);
    const res = await post(`${base()}/actions/execute`, { proposalToken: statement() });
    expect(res.status).toBe(403);
    mockHasPermission.mockImplementation(
      async (_u: string, permission: string) => permission === 'RENTAL_DOCUMENTS_GENERATE'
    );
    expect((await post(`${base()}/actions/execute`, { proposalToken: statement() })).status).toBe(403);
    expect(mockHasPermission).toHaveBeenCalledWith(currentUser, 'RENTAL_DOCUMENTS_VIEW', TENANT_A);
    expect(mockGenerateDocument).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('un jeton de quittance valide passe toujours (201)', async () => {
    mockPrisma.rentalLease.findFirst.mockResolvedValue({
      id: LEASE_ID,
      lease_number: 'L-1',
      currency: 'FCFA',
      property: { internalReference: 'B-1', title: 'T' },
      primaryRenter: null
    });
    mockGenerateDocument.mockResolvedValue({ id: 'doc-1', document_number: 'REL-1', type: 'STATEMENT' });
    const res = await post(`${base()}/actions/execute`, { proposalToken: statement() });
    expect(res.status).toBe(201);
    expect(res.body.data.document.id).toBe('doc-1');
    expect(received).toHaveLength(0); // aucune écriture générique pour une quittance
  });
});

// --- chaîne complète : chat -> plan -> confirmation -----------------------------------------------------

describe('chaîne complète : chat (fake) -> write_plan -> confirmation', () => {
  const sse = (path: string, body: unknown) =>
    request(app)
      .post(path)
      .set('x-user', currentUser)
      .set('Authorization', `Bearer ${BEARER}`)
      .send(body as object)
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => (data += chunk));
        res.on('end', () => cb(null, data));
      });

  const events = (text: string) =>
    text
      .split('\n\n')
      .map(block => block.trim())
      .filter(block => block.startsWith('event:'))
      .map(block => ({
        event: /^event: (.+)$/m.exec(block)![1]!,
        data: JSON.parse(/^data: (.+)$/m.exec(block)![1]!) as Record<string, any>
      }));

  it('le chat n’écrit RIEN ; la confirmation écrit, une fois, sous l’identité de l’utilisateur', async () => {
    const chat = await sse(`${base()}/chat`, { messages: [{ role: 'user', content: 'Crée une étiquette « VIP »' }] });
    expect(chat.status).toBe(200);
    const parsed = events(chat.body as unknown as string);
    const planEvent = parsed.find(e => e.event === 'write_plan');
    expect(planEvent).toBeDefined();
    const writePlan = planEvent!.data.plan;
    expect(writePlan).toMatchObject({ capabilityId: 'POST /api/tenants/:tenantId/crm/tags', recordKind: 'create' });
    expect(parsed.at(-1)).toMatchObject({ event: 'done' });
    // Pendant le chat : aucune écriture (création : aucune lecture non plus).
    expect(received.filter(r => r.method !== 'GET')).toEqual([]);

    // Confirmation humaine : seule porte d'écriture.
    const confirmed = await post(`${base()}/actions/execute`, { proposalToken: writePlan.token });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data).toMatchObject({ kind: 'capability', proposalId: writePlan.proposalId, ok: true });
    const writes = received.filter(r => r.method !== 'GET');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ method: 'POST', url: `/api/tenants/${TENANT_A}/crm/tags` });
    expect(JSON.parse(writes[0]!.body)).toEqual({ name: 'VIP', color: '#1677ff' });
    expect(writes[0]!.headers.authorization).toBe(`Bearer ${BEARER}`);

    // Audit : plan émis puis exécution, sans le corps ni le jeton d'accès.
    const keys = mockLogAudit.mock.calls.map(([e]) => e.actionKey);
    expect(keys).toEqual(expect.arrayContaining(['AI_PROPOSAL_ISSUED', 'AI_ACTION_EXECUTED']));
    expect(JSON.stringify(mockLogAudit.mock.calls)).not.toMatch(/ROUTESECRET|VIP/);
  });

  it('statut : plan_write est annoncé aux collaborateurs autorisés', async () => {
    const res = await request(app).get(`${base()}/status`).set('x-user', currentUser);
    expect(res.body.data.tools).toContain('plan_write');
  });
});
