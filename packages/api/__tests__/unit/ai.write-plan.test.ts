/**
 * Plan V2, étape 4 — `plan_write` : plan d'écriture avec avant/après et accord humain.
 *
 * L'outil ne doit RIEN écrire : une mini-app Express sur un port éphémère remplace l'API
 * (point d'injection `setLoopbackBaseUrlForTests`) et enregistre chaque requête reçue ; les
 * tests vérifient qu'aucune écriture n'y arrive jamais. Aucune base : Prisma et les services
 * sont simulés.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockLogAudit = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/property-service', () => ({ listProperties: jest.fn() }));
jest.mock('../../src/services/rental-lease-service', () => ({ listLeases: jest.fn() }));
jest.mock('../../src/services/rental-document-service', () => ({ listDocuments: jest.fn() }));
jest.mock('../../src/services/property-document-service', () => ({ getDocuments: jest.fn() }));
jest.mock('../../src/utils/property-tenant-guard', () => ({ getPropertyForTenant: jest.fn() }));
jest.mock('../../src/services/document-template-service', () => ({ resolveTemplate: jest.fn() }));
jest.mock('../../src/services/document-generation-service', () => ({ generateDocument: jest.fn() }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (...a: unknown[]) => mockLogAudit(...a) }));

import { env } from '../../src/config/env';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../src/middleware/error-middleware';
import {
  COPILOT_MAX_WRITE_PLANS_PER_REQUEST,
  type CopilotSseEvent,
  type CopilotToolContext,
  type WritePlan
} from '../../src/lib/ai/contracts';
import { findWritableEntry, getCatalogEntries } from '../../src/lib/ai/gateway/catalog';
import { setLoopbackBaseUrlForTests } from '../../src/lib/ai/gateway/loopback';
import { bodySensitivity, pathWords, writeSensitivity } from '../../src/lib/ai/gateway/path-rules';
import { validatePlanBody } from '../../src/lib/ai/gateway/write-input';
import { computePlanHash, canonicalJson } from '../../src/lib/ai/plan-hash';
import { verifyCapabilityProposal } from '../../src/lib/ai/proposal-token';
import { runChat } from '../../src/lib/ai/orchestrator';
import { FakeProvider } from '../../src/lib/ai/providers';
import { planWriteTool } from '../../src/lib/ai/tools/plan-write';
import { toolsForUser } from '../../src/lib/ai/tools/registry';
import {
  assessWrite,
  classifyRecord,
  computeChanges,
  displayQuery,
  flattenLeaves,
  lastParamAncestorPath,
  readableLabel,
  shortRecordId,
  unwrapRecord
} from '../../src/lib/ai/write-plan';
import { formatSseEvent } from '../../src/lib/ai/sse';
import { buildSystemPrompt } from '../../src/lib/ai/system-prompt';

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const USER = 'user-1';
const BEARER = 'eyJhbGciOiJIUzI1NiJ9.CONFIRMERSECRET123.SIGSECRET456';
const CONTACT_ID = '55555555-5555-4555-8555-555555555555';

const PATCH_CONTACT = 'PATCH /api/tenants/:tenantId/crm/contacts/:contactId';
const GET_CONTACT = 'GET /api/tenants/:tenantId/crm/contacts/:contactId';
const POST_CONTACTS = 'POST /api/tenants/:tenantId/crm/contacts';
const POST_CONVERT = 'POST /api/tenants/:tenantId/crm/contacts/:contactId/convert';
const POST_VALIDATE = 'POST /api/tenants/:tenantId/finance/salary-notes/:salaryNoteId/validate';
const SENSITIVE_WRITE = 'POST /api/tenants/:tenantId/users/:userId/reset-password';

const ALL_CATALOG_PERMISSIONS = new Set(
  getCatalogEntries().flatMap(entry => [...(entry.permissions ?? []), ...(entry.anyOfPermissions ?? []).flat()])
);
ALL_CATALOG_PERMISSIONS.add('PROPERTIES_VIEW');

// --- mini-app loopback -------------------------------------------------------

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;
let server: http.Server;
let handler: Handler;
const received: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders }> = [];

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const contactState = {
  success: true,
  data: {
    id: CONTACT_ID,
    fullName: 'Awa Koné',
    city: 'Abidjan',
    score: 10,
    consentEmail: false,
    password: 'old-secret',
    address: { city: 'Cocody', zip: '01' }
  }
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    received.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers });
    handler(req, res);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  setLoopbackBaseUrlForTests(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

afterAll(async () => {
  setLoopbackBaseUrlForTests(null);
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

beforeEach(() => {
  jest.clearAllMocks();
  received.length = 0;
  handler = (_req, res) => json(res, 200, contactState);
});

function ctx(overrides: Partial<CopilotToolContext> = {}): CopilotToolContext {
  return {
    tenantId: TENANT,
    userId: USER,
    permissions: ALL_CATALOG_PERMISSIONS,
    requestId: 'req-1',
    conversationId: 'conv-1',
    signal: new AbortController().signal,
    seenLeaseIds: new Set(),
    loopbackHeaders: () => ({ Authorization: `Bearer ${BEARER}`, 'X-Forwarded-For': '203.0.113.7' }),
    ...overrides
  };
}

const base = { title: 'Mettre à jour le contact', steps: ['Lire la fiche', 'Modifier la ville'] };

const plan = (input: Record<string, unknown>, context = ctx()) =>
  planWriteTool.execute(planWriteTool.inputSchema.parse({ ...base, ...input }), context);

const planOf = (outcome: Awaited<ReturnType<typeof plan>>): WritePlan => {
  expect(outcome.uiEvent?.type).toBe('write_plan');
  return (outcome.uiEvent as Extract<CopilotSseEvent, { type: 'write_plan' }>).plan;
};

const nothingWritten = () => expect(received.filter(r => r.method !== 'GET')).toEqual([]);

// --- schéma et déclaration -----------------------------------------------------

describe('plan_write — déclaration et schéma', () => {
  it('exige PROPERTIES_VIEW, kind proposal, socle CORE, schéma strict', () => {
    expect(planWriteTool.name).toBe('plan_write');
    expect(planWriteTool.requiredPermission).toBe('PROPERTIES_VIEW');
    expect(planWriteTool.kind).toBe('proposal');
    expect(planWriteTool.feature).toBe('CORE');
    expect(toolsForUser(new Set()).map(t => t.name)).not.toContain('plan_write');
    expect(toolsForUser(new Set(['PROPERTIES_VIEW'])).map(t => t.name)).toContain('plan_write');
    const ok = { capabilityId: PATCH_CONTACT, ...base };
    expect(planWriteTool.inputSchema.safeParse(ok).success).toBe(true);
    expect(planWriteTool.inputSchema.safeParse({ ...ok, tenantId: 't' }).success).toBe(false);
    expect(planWriteTool.inputSchema.safeParse({ ...ok, userId: 'u' }).success).toBe(false);
  });

  it('titre : 1 à 120 caractères, texte brut', () => {
    const parse = (title: unknown) =>
      planWriteTool.inputSchema.safeParse({ capabilityId: PATCH_CONTACT, ...base, title });
    expect(parse('x'.repeat(120)).success).toBe(true);
    expect(parse('x'.repeat(121)).success).toBe(false);
    expect(parse('   ').success).toBe(false);
    expect(parse('<b>gras</b>').success).toBe(false);
    expect(parse('a\u0000b').success).toBe(false);
  });

  it('étapes : 1 à 8, 240 caractères au plus chacune', () => {
    const parse = (steps: unknown) =>
      planWriteTool.inputSchema.safeParse({ capabilityId: PATCH_CONTACT, ...base, steps });
    expect(parse([]).success).toBe(false);
    expect(parse(Array.from({ length: 8 }, () => 'étape')).success).toBe(true);
    expect(parse(Array.from({ length: 9 }, () => 'étape')).success).toBe(false);
    expect(parse(['x'.repeat(240)]).success).toBe(true);
    expect(parse(['x'.repeat(241)]).success).toBe(false);
    expect(parse(['<img src=x onerror=alert(1)>']).success).toBe(false);
  });

  it('corps : objet JSON, 8 Ko, profondeur 4, aucune clé __proto__ / constructor / prototype', () => {
    const parse = (body: unknown) =>
      planWriteTool.inputSchema.safeParse({ capabilityId: PATCH_CONTACT, ...base, body });
    expect(parse({ a: 1 }).success).toBe(true);
    expect(parse({ a: { b: { c: { d: 1 } } } }).success).toBe(true); // 4 niveaux
    expect(parse({ a: { b: { c: { d: { e: 1 } } } } }).success).toBe(false); // 5 niveaux
    expect(parse([1, 2]).success).toBe(false);
    expect(parse('x').success).toBe(false);
    expect(parse(null).success).toBe(false);
    expect(parse({ big: 'x'.repeat(8 * 1024) }).success).toBe(false);
    expect(parse({ ok: 'x'.repeat(8000) }).success).toBe(true);
    expect(parse(JSON.parse('{"__proto__":{"admin":true}}')).success).toBe(false);
    expect(parse(JSON.parse('{"a":{"constructor":1}}')).success).toBe(false);
    expect(parse({ prototype: 1 }).success).toBe(false);
    expect(parse({ n: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(parse({ d: new Date() }).success).toBe(false);
    expect(validatePlanBody(Object.create({ inherited: 1 }))).not.toBeNull(); // pas un objet JSON simple
  });

  it('paramètres de chemin : jeton simple comme call_read', () => {
    const parse = (pathParams: unknown) =>
      planWriteTool.inputSchema.safeParse({ capabilityId: PATCH_CONTACT, ...base, pathParams });
    expect(parse({ contactId: CONTACT_ID }).success).toBe(true);
    for (const bad of ['../x', 'a/b', 'a b', '%2e', '', 'x'.repeat(65)]) {
      expect(parse({ contactId: bad }).success).toBe(false);
    }
  });
});

// --- refus avant tout appel -------------------------------------------------------

describe('plan_write — ce qui est refusé', () => {
  it('id inconnu, GET, DELETE, écriture sensible-interdite : NotFoundError, aucun appel', async () => {
    const sensitiveWrite = getCatalogEntries().find(e => e.method !== 'GET' && e.sensitive);
    expect(sensitiveWrite).toBeDefined();
    expect(findWritableEntry(sensitiveWrite!.id)).toBeUndefined();
    for (const capabilityId of [
      'PATCH /api/tenants/:tenantId/inconnu',
      GET_CONTACT,
      'GET /api/tenants/:tenantId/crm/contacts',
      'DELETE /api/tenants/:tenantId/crm/contacts/:contactId',
      'POST /api/tenants/:tenantId/crm/contacts/:contactId/delete',
      'PUT /api/tenants/:tenantId/crm/contacts/:contactId/remove',
      sensitiveWrite!.id,
      'PATCH http://evil.example/steal',
      'POST /api/auth/login'
    ]) {
      await expect(plan({ capabilityId, pathParams: { contactId: CONTACT_ID } })).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(received).toHaveLength(0);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it('sans la permission de l’outil, sans la permission connue de la route, sans en-têtes : ForbiddenError', async () => {
    const args = { capabilityId: PATCH_CONTACT, pathParams: { contactId: CONTACT_ID }, body: { city: 'X' } };
    await expect(plan(args, ctx({ permissions: new Set() }))).rejects.toBeInstanceOf(ForbiddenError);
    // PROPERTIES_VIEW seul : le catalogue sait que cette route exige CRM_CONTACTS_EDIT.
    await expect(plan(args, ctx({ permissions: new Set(['PROPERTIES_VIEW']) }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(plan(args, ctx({ loopbackHeaders: undefined }))).rejects.toBeInstanceOf(ForbiddenError);
    expect(received).toHaveLength(0);
  });

  it('impose le tenantId : jamais fourni par le modèle, paramètres inattendus ou manquants refusés', async () => {
    await expect(
      plan({ capabilityId: PATCH_CONTACT, pathParams: { contactId: CONTACT_ID, tenantId: OTHER_TENANT } })
    ).rejects.toBeInstanceOf(BadRequestError);
    await expect(
      plan({ capabilityId: PATCH_CONTACT, pathParams: { contactId: CONTACT_ID, extra: 'x' } })
    ).rejects.toBeInstanceOf(BadRequestError);
    await expect(plan({ capabilityId: PATCH_CONTACT })).rejects.toBeInstanceOf(BadRequestError);
    expect(received).toHaveLength(0);

    await plan({ capabilityId: PATCH_CONTACT, pathParams: { contactId: CONTACT_ID }, body: { city: 'X' } });
    expect(received[0]!.url).toBe(`/api/tenants/${TENANT}/crm/contacts/${CONTACT_ID}`);
    expect(received[0]!.url).not.toContain(OTHER_TENANT);
  });

  it.each([
    [403, ForbiddenError],
    [404, NotFoundError],
    [500, BadRequestError]
  ])('lecture de l’état actuel en %s : plan refusé, aucun jeton, aucun audit', async (status, errorClass) => {
    handler = (_req, res) => json(res, status, { success: false, message: 'Refusé' });
    await expect(
      plan({ capabilityId: PATCH_CONTACT, pathParams: { contactId: CONTACT_ID }, body: { city: 'X' } })
    ).rejects.toBeInstanceOf(errorClass);
    expect(mockLogAudit).not.toHaveBeenCalled();
    nothingWritten();
  });

  it('plafond : 3 plans par requête de chat, le 4e est refusé', async () => {
    const context = ctx();
    for (let i = 0; i < COPILOT_MAX_WRITE_PLANS_PER_REQUEST; i += 1) {
      await plan({ capabilityId: POST_CONTACTS, body: { firstName: `A${i}` } }, context);
    }
    expect(context.writePlansIssued).toBe(3);
    await expect(plan({ capabilityId: POST_CONTACTS, body: { firstName: 'D' } }, context)).rejects.toBeInstanceOf(
      BadRequestError
    );
    // Une autre requête de chat repart de zéro.
    await expect(plan({ capabilityId: POST_CONTACTS, body: { firstName: 'E' } }, ctx())).resolves.toBeDefined();
  });
});

// --- simulation : avant / après ---------------------------------------------------

describe('plan_write — simulation sans écriture', () => {
  it('PATCH : lit l’état par GET, calcule before/after, omet l’inchangé, signale les champs absents', async () => {
    const outcome = await plan({
      capabilityId: PATCH_CONTACT,
      pathParams: { contactId: CONTACT_ID },
      body: {
        fullName: 'Awa Koné',
        city: 'Bouaké',
        score: 20,
        consentEmail: true,
        nouveauChamp: 'x',
        address: { city: 'Plateau', zip: '01' }
      }
    });
    const p = planOf(outcome);

    // Une seule requête reçue : le GET de l'état. Jamais d'écriture.
    expect(received.map(r => `${r.method} ${r.url}`)).toEqual([
      `GET /api/tenants/${TENANT}/crm/contacts/${CONTACT_ID}`
    ]);
    expect(received[0]!.headers.authorization).toBe(`Bearer ${BEARER}`);
    nothingWritten();

    expect(p.recordKind).toBe('update');
    expect(p.method).toBe('PATCH');
    expect(p.action).toBe('EXECUTE_CAPABILITY');
    expect(p.capabilityId).toBe(PATCH_CONTACT);
    expect(p.module).toBe('crm');
    expect(p.target).toEqual({ label: 'Awa Koné', resolved: true });
    expect(p.changes).toEqual([
      { field: 'city', before: 'Abidjan', after: 'Bouaké' },
      { field: 'score', before: 10, after: 20 },
      { field: 'consentEmail', before: false, after: true },
      { field: 'nouveauChamp', before: undefined, after: 'x' },
      { field: 'address.city', before: 'Cocody', after: 'Plateau' }
    ]);
    expect(p.changes.some(c => c.field === 'fullName')).toBe(false); // inchangé : omis
    expect(p.changes.some(c => c.field === 'address.zip')).toBe(false);
    expect(p.warnings.join(' | ')).toContain('Le serveur peut modifier d’autres champs');
    expect(p.warnings.join(' | ')).toContain('nouveauChamp');
    expect(p.sensitive).toBe(false);
    expect(p.requiresTypedConfirmation).toBe(false);
    expect(p.title).toBe(base.title);
    expect(p.steps).toEqual(base.steps);
  });

  it('calculé par le serveur : le modèle ne peut ni fournir ni fausser les changements', () => {
    expect(planWriteTool.inputSchema.safeParse({ capabilityId: PATCH_CONTACT, ...base, changes: [] }).success).toBe(
      false
    );
    expect(planWriteTool.inputSchema.safeParse({ capabilityId: PATCH_CONTACT, ...base, warnings: [] }).success).toBe(
      false
    );
    expect(
      planWriteTool.inputSchema.safeParse({ capabilityId: PATCH_CONTACT, ...base, sensitive: false }).success
    ).toBe(false);
  });

  it('masque les clés sensibles avant ET après, jamais de valeur secrète dans les changements', async () => {
    const p = planOf(
      await plan({
        capabilityId: PATCH_CONTACT,
        pathParams: { contactId: CONTACT_ID },
        body: { password: 'nouveau-secret', credentials: { apiKey: 'k-123' }, city: 'Bouaké' }
      })
    );
    const secretChange = p.changes.find(c => c.field === 'password');
    expect(secretChange).toEqual({ field: 'password', before: '[masqué]', after: '[masqué]' });
    expect(p.changes.find(c => c.field === 'credentials.apiKey')).toEqual({
      field: 'credentials.apiKey',
      before: undefined,
      after: '[masqué]'
    });
    const shown = JSON.stringify({ changes: p.changes, warnings: p.warnings, target: p.target });
    expect(shown).not.toMatch(/nouveau-secret|old-secret|k-123/);
  });

  it('une valeur longue est tronquée à l’affichage seulement, avec avertissement', async () => {
    const long = 'z'.repeat(1000);
    const p = planOf(
      await plan({ capabilityId: PATCH_CONTACT, pathParams: { contactId: CONTACT_ID }, body: { city: long } })
    );
    const after = p.changes[0]!.after as string;
    expect(after.length).toBeLessThan(400);
    expect(p.warnings.join(' ')).toContain('tronquées');
    // La requête signée, elle, est exacte.
    const claims = verifyCapabilityProposal(p.token, { userId: USER, tenantId: TENANT });
    expect((claims.args.body as { city: string }).city).toBe(long);
  });

  it('POST de création : aucun « avant », aucune lecture, recordKind create, pas de cible', async () => {
    const p = planOf(await plan({ capabilityId: POST_CONTACTS, body: { firstName: 'Awa', lastName: 'Koné' } }));
    expect(received).toHaveLength(0);
    expect(p.recordKind).toBe('create');
    expect(p.method).toBe('POST');
    expect(p.target).toBeNull();
    expect(p.changes).toEqual([
      { field: 'firstName', before: undefined, after: 'Awa' },
      { field: 'lastName', before: undefined, after: 'Koné' }
    ]);
  });

  it('POST d’action sur une ressource : cible lue sur le GET du parent, changes = le corps', async () => {
    const p = planOf(
      await plan({ capabilityId: POST_CONVERT, pathParams: { contactId: CONTACT_ID }, body: { targetType: 'OWNER' } })
    );
    expect(received.map(r => `${r.method} ${r.url}`)).toEqual([
      `GET /api/tenants/${TENANT}/crm/contacts/${CONTACT_ID}`
    ]);
    expect(p.recordKind).toBe('action');
    expect(p.target).toEqual({ label: 'Awa Koné', resolved: true });
    expect(p.changes).toEqual([{ field: 'targetType', before: undefined, after: 'OWNER' }]);
    nothingWritten();
  });

  it('action sur une ressource introuvable : plan refusé', async () => {
    handler = (_req, res) => json(res, 404, { success: false, message: 'Introuvable' });
    await expect(
      plan({ capabilityId: POST_CONVERT, pathParams: { contactId: CONTACT_ID }, body: {} })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('plus de 30 changements : 30 affichés, changesTruncated, mot de confirmation exigé', async () => {
    const body = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`champ${i}`, i]));
    const p = planOf(await plan({ capabilityId: POST_CONTACTS, body }));
    expect(p.changes).toHaveLength(30);
    expect(p.changesTruncated).toBe(true);
    expect(p.warnings.join(' ')).toContain('15 autres changements');
    expect(p.sensitive).toBe(false);
    expect(p.requiresTypedConfirmation).toBe(true);
    expect(p.confirmationWord).toBe('CONFIRMER');
    // Exactement 30 : pas de troncature.
    const exact = planOf(
      await plan({
        capabilityId: POST_CONTACTS,
        body: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`c${i}`, i]))
      })
    );
    expect(exact.changesTruncated).toBeUndefined();
    expect(exact.requiresTypedConfirmation).toBe(false);
  });

  it('écriture sensible : plan sensible, raison, mot de confirmation exigé', async () => {
    const p = planOf(await plan({ capabilityId: POST_VALIDATE, pathParams: { salaryNoteId: CONTACT_ID }, body: {} }));
    expect(p.sensitive).toBe(true);
    expect(p.sensitiveReason).toMatch(/comptable|clôture|validation/i);
    expect(p.requiresTypedConfirmation).toBe(true);
    expect(p.confirmationWord).toBe('CONFIRMER');
    expect(p.warnings.join(' ')).toContain('Action sensible');
  });
});

// --- audit de sécurité : query, parent, sensibilité, listes, champs protégés ----------------------

const POST_CHARGES = 'POST /api/tenants/:tenantId/syndics/:syndicId/charges/batch';
const SYNDIC_ID = '66666666-6666-4666-8666-666666666666';

describe('plan_write — paramètres de requête montrés à l’humain', () => {
  it('query non vide : champ `query` calculé, avertissement serveur, mot de confirmation exigé, valeurs secrètes masquées', async () => {
    const p = planOf(
      await plan({
        capabilityId: PATCH_CONTACT,
        pathParams: { contactId: CONTACT_ID },
        query: { notify: true, apiKey: 'sk-live-123', limit: 5 },
        body: { city: 'Bouaké' }
      })
    );
    expect(p.query).toEqual([
      { key: 'notify', value: 'true' },
      { key: 'apiKey', value: '[masqué]' },
      { key: 'limit', value: '5' }
    ]);
    expect(p.warnings.join(' | ')).toContain('Paramètres envoyés à la route : notify=true, apiKey=[masqué], limit=5');
    expect(JSON.stringify(p)).not.toContain('sk-live-123');
    expect(p.sensitive).toBe(false);
    expect(p.requiresTypedConfirmation).toBe(true);
    expect(p.confirmationWord).toBe('CONFIRMER');
  });

  it('sans query : pas de champ query, pas de mot ; la query entre dans displayHash', async () => {
    const without = planOf(
      await plan({ capabilityId: PATCH_CONTACT, pathParams: { contactId: CONTACT_ID }, body: { city: 'B' } })
    );
    expect(without.query).toBeUndefined();
    expect(without.requiresTypedConfirmation).toBe(false);
    const hashOf = () => mockLogAudit.mock.calls.at(-1)![0].payload.displayHash as string;
    const h1 = hashOf();
    await plan({
      capabilityId: PATCH_CONTACT,
      pathParams: { contactId: CONTACT_ID },
      query: { a: 1 },
      body: { city: 'B' }
    });
    expect(hashOf()).not.toBe(h1);
  });

  it('displayQuery et assessWrite (pur)', () => {
    expect(displayQuery({ token: 'abc', x: 'y'.repeat(300) })[0]).toEqual({ key: 'token', value: '[masqué]' });
    expect(displayQuery({ x: 'y'.repeat(300) })[0]!.value).toHaveLength(121);
    expect(displayQuery({ jwt: 'Bearer abc' })[0]!.value).toBe('[masqué]');
    expect(assessWrite(findWritableEntry(POST_CONTACTS)!, null, { a: 1 }).requiresTypedConfirmation).toBe(true);
    expect(assessWrite(findWritableEntry(POST_CONTACTS)!, null, {}).requiresTypedConfirmation).toBe(false);
  });
});

describe('plan_write — parent d’une création imbriquée', () => {
  it('POST /syndics/:syndicId/charges/batch (création imbriquée) : lit le GET du parent, renseigne target et pathParams', async () => {
    handler = (_req, res) => json(res, 200, { success: true, data: { id: SYNDIC_ID, name: 'Résidence Les Palmiers' } });
    const p = planOf(
      await plan({ capabilityId: POST_CHARGES, pathParams: { syndicId: SYNDIC_ID }, body: { amount: 100 } })
    );
    expect(received.map(r => `${r.method} ${r.url}`)).toEqual([`GET /api/tenants/${TENANT}/syndics/${SYNDIC_ID}`]);
    expect(p.recordKind).toBe('create');
    expect(p.target).toEqual({ label: 'Résidence Les Palmiers', resolved: true });
    expect(p.pathParams).toEqual([{ name: 'syndicId', value: SYNDIC_ID }]);
    // Création : aucun « avant » même si le parent a été lu.
    expect(p.changes).toEqual([{ field: 'amount', before: undefined, after: 100 }]);
    expect(p.stateReadAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    nothingWritten();
  });

  it.each([
    [404, NotFoundError],
    [403, ForbiddenError],
    [500, BadRequestError]
  ])('parent illisible (%i) : plan refusé', async (status, errorClass) => {
    handler = (_req, res) => json(res, status, { success: false, message: 'non' });
    await expect(
      plan({ capabilityId: POST_CHARGES, pathParams: { syndicId: SYNDIC_ID }, body: { amount: 1 } })
    ).rejects.toBeInstanceOf(errorClass);
  });

  it('pathParams exposés aussi pour une mise à jour et une action ; absents sans paramètre', async () => {
    const upd = planOf(
      await plan({ capabilityId: PATCH_CONTACT, pathParams: { contactId: CONTACT_ID }, body: { city: 'Z' } })
    );
    expect(upd.pathParams).toEqual([{ name: 'contactId', value: CONTACT_ID }]);
    const create = planOf(await plan({ capabilityId: POST_CONTACTS, body: { firstName: 'A' } }));
    expect(create.pathParams).toBeUndefined();
    expect(create.stateReadAt).toBeUndefined();
  });

  it('parent sans route de lecture connue : cible non résolue (id brut) et avertissement', async () => {
    const orphan = 'POST /api/tenants/:tenantId/syndics/:syndicId/lots/:lotId/compte/ajustements';
    const p = planOf(
      await plan({ capabilityId: orphan, pathParams: { syndicId: SYNDIC_ID, lotId: CONTACT_ID }, body: { montant: 5 } })
    );
    expect(received).toHaveLength(0);
    expect(p.target).toEqual({ label: 'Enregistrement 55555555…', resolved: false });
    expect(p.warnings.join(' | ')).toContain("n'a pas pu être vérifié");
  });

  it('lastParamAncestorPath', () => {
    expect(lastParamAncestorPath('/api/tenants/:tenantId/syndics/:syndicId/charges')).toBe(
      '/api/tenants/:tenantId/syndics/:syndicId'
    );
    expect(lastParamAncestorPath('/api/tenants/:tenantId/crm/contacts')).toBeNull();
    expect(lastParamAncestorPath('/api/tenants/:tenantId/crm/contacts/:id')).toBeNull();
  });
});

describe('écritures sensibles : routes réelles du catalogue (audit)', () => {
  const T = '/api/tenants/:tenantId';
  const SENSITIVE_ROUTES = [
    `PATCH ${T}/users/:userId`,
    `POST ${T}/users/:userId/disable`,
    `POST ${T}/users/:userId/enable`,
    `POST ${T}/users/:userId/revoke-sessions`,
    `POST ${T}/patrimoine/external-access`,
    `POST ${T}/patrimoine/external-access/:grantId/revoke`,
    `POST ${T}/rental/deposits/:depositId/movements`,
    `POST ${T}/finance/billing-runs`,
    `POST ${T}/subscription/upgrade`,
    `POST ${T}/syndics/:syndicId/quittances/:receiptId/envoi`,
    `POST ${T}/syndics/:syndicId/assemblees/:meetingId/convocation`,
    `PATCH ${T}/syndics/:syndicId/comptabilite/ecritures/:entryId/verrouiller`,
    `POST ${T}/rental/leases/:leaseId/events/termination`,
    `PATCH ${T}/rental/leases/:leaseId/status`,
    `POST ${T}/sales/agreements/:id/cancel`,
    `POST ${T}/sales/mandates/:id/revoke`,
    `POST ${T}/patrimoine/assets/:assetId/dispose`,
    `POST ${T}/properties/:id/publish`
  ];

  it.each(SENSITIVE_ROUTES)('%s : dans le catalogue, écriture autorisée ET classée sensible', id => {
    const entry = findWritableEntry(id);
    expect(entry).toBeDefined();
    expect(writeSensitivity(entry!.path)).not.toBeNull();
    expect(assessWrite(entry!, {})).toMatchObject({ sensitive: true, requiresTypedConfirmation: true });
  });

  it('chaque route du catalogue évoquant un mot de la liste est classée (aucune ne passe au travers)', () => {
    const lexicon =
      /(envoi|convocation|verrouiller|remise|ajustement|resiliation|termination|terminate|disable|enable|revoke|cancel|deposit|movement|billing|upgrade|dispose|archive|external-access|\/users|publish|release|issue|complete|generer-appels|generer-manquantes|renvoyer|ecriture)/i;
    const missed = getCatalogEntries()
      .filter(entry => entry.method !== 'GET' && lexicon.test(entry.path) && writeSensitivity(entry.path) === null)
      .map(entry => entry.id);
    expect(missed).toEqual([]);
  });

  it.each([
    ['/api/tenants/:tenantId/x/:id/generer-appels', 'bulk'],
    ['/api/tenants/:tenantId/x/:id/generer-manquantes', 'bulk'],
    ['/api/tenants/:tenantId/x/:id/renvoyer', 'sending'],
    ['/api/tenants/:tenantId/x/:id/remise', 'payment'],
    ['/api/tenants/:tenantId/x/ajustements', 'accounting'],
    ['/api/tenants/:tenantId/x/:id/resiliation', 'lifecycle'],
    ['/api/tenants/:tenantId/x/:id/terminate', 'lifecycle'],
    ['/api/tenants/:tenantId/x/:id/archive', 'lifecycle'],
    ['/api/tenants/:tenantId/x/:id/complete', 'lifecycle'],
    ['/api/tenants/:tenantId/x/:id/release', 'payment'],
    ['/api/tenants/:tenantId/x/:id/issue', 'accounting'],
    ['/api/tenants/:tenantId/bail/:id/status', 'lifecycle']
  ])('%s -> %s', (path, category) => {
    expect(writeSensitivity(path)?.category).toBe(category);
  });

  // Lot 040 : les écritures du stock qui sortent de la marchandise ou une preuve.
  it.each([
    'POST /api/tenants/:tenantId/finance/stock/scraps',
    'POST /api/tenants/:tenantId/finance/stock/supplier-returns',
    'POST /api/tenants/:tenantId/finance/stock/counts/:countId/lines/:itemId/set-aside',
    'POST /api/tenants/:tenantId/finance/stock/counts/:countId/set-aside-uncounted',
    'POST /api/tenants/:tenantId/finance/stock/counts/:countId/cancel'
  ])('%s : stock, écriture du catalogue classée sensible (lifecycle)', id => {
    const entry = findWritableEntry(id);
    expect(entry).toBeDefined();
    expect(writeSensitivity(entry!.path)?.category).toBe('lifecycle');
    expect(assessWrite(entry!, {})).toMatchObject({ sensitive: true, requiresTypedConfirmation: true });
  });

  it('stock : le retrait d’une pièce jointe est classé sensible, et exclu du catalogue comme destructeur', () => {
    const path = '/api/tenants/:tenantId/finance/stock/attachments/:attachmentId/remove';
    expect(writeSensitivity(path)?.category).toBe('lifecycle');
    expect(findWritableEntry(`POST ${path}`)).toBeUndefined();
  });

  // Lot 041 : inscriptions des chefs de chantier et retrait d'une photo de preuve.
  it.each([
    'POST /api/tenants/:tenantId/finance/stock/whatsapp/registrations/:registrationId/revoke',
    'POST /api/tenants/:tenantId/finance/stock/whatsapp/registrations/:registrationId/regenerate-code'
  ])('%s : inscription WhatsApp, sensible et hors de portée de l’assistant', id => {
    const entry = getCatalogEntries().find(candidate => candidate.id === id);
    expect(entry).toBeDefined();
    expect(entry!.sensitive).toBe(true);
    expect(writeSensitivity(entry!.path)).not.toBeNull();
    expect(findWritableEntry(id)).toBeUndefined();
  });

  it('stock WhatsApp : le retrait d’une photo de comptage est une écriture sensible à mot saisi', () => {
    const entry = findWritableEntry(
      'POST /api/tenants/:tenantId/finance/stock/whatsapp/captures/:captureId/remove-photo'
    );
    expect(entry).toBeDefined();
    expect(writeSensitivity(entry!.path)).not.toBeNull();
    expect(assessWrite(entry!, {})).toMatchObject({ sensitive: true, requiresTypedConfirmation: true });
  });

  it('`status` n’est sensible que sur un bail ; une création banale reste non sensible', () => {
    expect(writeSensitivity('/api/tenants/:tenantId/maintenance/tickets/:id/status')).toBeNull();
    expect(writeSensitivity('/api/tenants/:tenantId/rental/leases/:id/status')).not.toBeNull();
    expect(writeSensitivity('/api/tenants/:tenantId/x/:id/envois')).not.toBeNull();
    expect(writeSensitivity('/api/tenants/:tenantId/crm/tags')).toBeNull();
  });

  it('une écriture non classée reste à l’accord simple : plan non sensible, pas de mot', async () => {
    const p = planOf(await plan({ capabilityId: POST_CONTACTS, body: { firstName: 'Awa' } }));
    expect(p.sensitive).toBe(false);
    expect(p.requiresTypedConfirmation).toBe(false);
    expect(p.confirmationWord).toBeUndefined();
  });

  it('plan sur un statut de bail : sensible (lifecycle), raison d’état irréversible', async () => {
    const p = planOf(
      await plan({
        capabilityId: `PATCH ${T}/rental/leases/:leaseId/status`,
        pathParams: { leaseId: CONTACT_ID },
        body: { status: 'TERMINATED' }
      })
    );
    expect(p.sensitive).toBe(true);
    expect(p.sensitiveReason).toMatch(/résiliation|annulation|état/i);
    expect(p.requiresTypedConfirmation).toBe(true);
  });
});

describe('sensibilité par le corps (routes de comptes)', () => {
  const PATCH_USER = 'PATCH /api/tenants/:tenantId/users/:userId';

  it.each([
    [{ roles: ['ADMIN'] }],
    [{ role: 'ADMIN' }],
    [{ permissions: ['X'] }],
    [{ isActive: false }],
    [{ status: 'DISABLED' }],
    [{ password: 'x' }],
    [{ email: 'a@b.c' }],
    [{ profile: { nested: { ISACTIVE: true } } }],
    [{ list: [{ role: 'x' }] }]
  ])('%j sur une route users : sensible (accès)', body => {
    expect(bodySensitivity('/api/tenants/:tenantId/users/:userId', body)).toMatchObject({ category: 'access' });
    expect(assessWrite({ path: '/api/tenants/:tenantId/memberships/:id' }, body).sensitive).toBe(true);
    expect(assessWrite({ path: '/api/tenants/:tenantId/collaborators' }, body).requiresTypedConfirmation).toBe(true);
  });

  it('hors route de comptes, ces clés ne rendent rien sensible ; un corps banal non plus', () => {
    expect(bodySensitivity('/api/tenants/:tenantId/crm/contacts/:id', { email: 'a@b.c', status: 'X' })).toBeNull();
    expect(bodySensitivity('/api/tenants/:tenantId/crm/contacts', null)).toBeNull();
  });

  it('PATCH /users/:userId : sensible par le chemin (mot users) ; plan avec corps { roles }', async () => {
    handler = (_req, res) =>
      json(res, 200, { success: true, data: { id: CONTACT_ID, fullName: 'U', roles: ['AGENT'] } });
    const p = planOf(
      await plan({ capabilityId: PATCH_USER, pathParams: { userId: CONTACT_ID }, body: { roles: ['ADMIN'] } })
    );
    expect(p.sensitive).toBe(true);
    expect(p.requiresTypedConfirmation).toBe(true);
  });
});

describe('remplacement d’une liste', () => {
  it('computeChanges : tableau plus court que l’état -> changement de niveau liste, replacedLists', () => {
    const { changes, replacedLists } = computeChanges(
      { tags: ['a'], lines: [{ n: 1 }, { n: 2 }] },
      { tags: ['a', 'b', 'c'], lines: [{ n: 1 }, { n: 2 }] }
    );
    expect(changes).toEqual([{ field: 'tags', before: '[3 éléments]', after: '[1 éléments]' }]);
    expect(replacedLists).toEqual([{ field: 'tags', before: 3, after: 1, removed: 2 }]);
  });

  it('tableau vide, imbriqué ; plus long ou égal : pas de changement de liste ; création : jamais', () => {
    expect(computeChanges({ items: [] }, { items: [1, 2] }).replacedLists).toEqual([
      { field: 'items', before: 2, after: 0, removed: 2 }
    ]);
    expect(computeChanges({ o: { l: [1] } }, { o: { l: [1, 2] } }).replacedLists).toHaveLength(1);
    expect(computeChanges({ l: [1, 2, 3] }, { l: [1, 2] }).replacedLists).toEqual([]);
    expect(computeChanges({ l: [1, 2] }, { l: [1, 2] }).replacedLists).toEqual([]);
    expect(computeChanges({ l: [1] }, undefined).replacedLists).toEqual([]);
  });

  it('plan : avertissement « liste remplacée : N éléments retirés », mot exigé, signé dans le jeton', async () => {
    handler = (_req, res) =>
      json(res, 200, { success: true, data: { id: CONTACT_ID, fullName: 'Awa', tags: ['a', 'b', 'c', 'd'] } });
    const outcome = await plan({
      capabilityId: PATCH_CONTACT,
      pathParams: { contactId: CONTACT_ID },
      body: { tags: ['a'] }
    });
    const p = planOf(outcome);
    expect(p.changes).toContainEqual({ field: 'tags', before: '[4 éléments]', after: '[1 éléments]' });
    expect(p.warnings.join(' | ')).toContain('éléments retirés');
    expect(p.warnings.join(' | ')).toMatch(/3 éléments retirés/);
    expect(p.sensitive).toBe(false);
    expect(p.requiresTypedConfirmation).toBe(true);
    expect(p.confirmationWord).toBe('CONFIRMER');
    const claims = verifyCapabilityProposal(p.token, { userId: USER, tenantId: TENANT });
    expect(claims.args.requireConfirmation).toBe(true);
    expect(computePlanHash(claims.args)).toBe(claims.args.planHash);
  });

  it('liste inchangée ou plus longue : aucune exigence', async () => {
    handler = (_req, res) => json(res, 200, { success: true, data: { id: CONTACT_ID, fullName: 'Awa', tags: ['a'] } });
    const p = planOf(
      await plan({ capabilityId: PATCH_CONTACT, pathParams: { contactId: CONTACT_ID }, body: { tags: ['a', 'b'] } })
    );
    expect(p.requiresTypedConfirmation).toBe(false);
    const claims = verifyCapabilityProposal(p.token, { userId: USER, tenantId: TENANT });
    expect(claims.args.requireConfirmation).toBeUndefined();
  });
});

describe('champs protégés et instant de lecture', () => {
  it('un champ secret écrit : avertissement « champ protégé : valeur non affichée », valeur jamais montrée', async () => {
    const p = planOf(
      await plan({
        capabilityId: PATCH_CONTACT,
        pathParams: { contactId: CONTACT_ID },
        body: { city: 'Y', password: 'nouveau-secret-xyz', apiToken: 'tok-abc' }
      })
    );
    expect(p.warnings.join(' | ')).toContain('Champ protégé : valeur non affichée');
    expect(p.warnings.join(' | ')).toContain('password');
    expect(JSON.stringify(p)).not.toContain('nouveau-secret-xyz');
    expect(JSON.stringify(p)).not.toContain('tok-abc');
  });

  it('pas de champ secret : pas d’avertissement ; stateReadAt = instant ISO de la lecture « avant »', async () => {
    const before = Date.now();
    const p = planOf(
      await plan({ capabilityId: PATCH_CONTACT, pathParams: { contactId: CONTACT_ID }, body: { city: 'Y' } })
    );
    expect(p.warnings.join(' | ')).not.toContain('Champ protégé');
    const at = Date.parse(p.stateReadAt!);
    expect(at).toBeGreaterThanOrEqual(before - 1);
    expect(at).toBeLessThanOrEqual(Date.now() + 1);
    expect(new Date(at).toISOString()).toBe(p.stateReadAt);
  });
});

// --- jeton, audit, résultat renvoyé au modèle -----------------------------------------

describe('plan_write — jeton, audit et résultat', () => {
  it('signe un jeton lié à l’utilisateur et à l’agence, 900 s, avec une empreinte recalculable', async () => {
    const p = planOf(
      await plan({
        capabilityId: PATCH_CONTACT,
        pathParams: { contactId: CONTACT_ID },
        query: { dryRun: false },
        body: { city: 'X' }
      })
    );
    const claims = verifyCapabilityProposal(p.token, { userId: USER, tenantId: TENANT });
    expect(claims.act).toBe('EXECUTE_CAPABILITY');
    expect(claims.jti).toBe(p.proposalId);
    expect(claims.exp - claims.iat).toBe(env.AI_WRITE_PLAN_TTL_SECONDS);
    expect(env.AI_WRITE_PLAN_TTL_SECONDS).toBeGreaterThanOrEqual(300);
    expect(new Date(p.expiresAt).getTime()).toBe(claims.exp * 1000);
    expect(claims.args).toMatchObject({
      capabilityId: PATCH_CONTACT,
      pathParams: { contactId: CONTACT_ID },
      query: { dryRun: false },
      body: { city: 'X' }
    });
    expect(claims.args.planHash).toBe(computePlanHash(claims.args));
    expect(claims.args.planHash).toMatch(/^[0-9a-f]{64}$/);
    // Un autre utilisateur ou une autre agence ne peut pas vérifier ce jeton.
    expect(() => verifyCapabilityProposal(p.token, { userId: 'autre', tenantId: TENANT })).toThrow();
    expect(() => verifyCapabilityProposal(p.token, { userId: USER, tenantId: OTHER_TENANT })).toThrow();
  });

  it('modelResult : seulement planned, proposalId, summary ; JAMAIS le jeton ; dit d’attendre', async () => {
    const outcome = await plan({ capabilityId: POST_CONTACTS, body: { firstName: 'Awa' } });
    const p = planOf(outcome);
    expect(Object.keys(outcome.modelResult).sort()).toEqual(['planned', 'proposalId', 'summary']);
    expect(outcome.modelResult.planned).toBe(true);
    expect(outcome.modelResult.proposalId).toBe(p.proposalId);
    expect(JSON.stringify(outcome.modelResult)).not.toContain(p.token);
    expect(JSON.stringify(outcome.modelResult)).not.toContain('v1.');
    expect(String(outcome.modelResult.summary)).toMatch(/AUCUNE écriture/);
    expect(String(outcome.modelResult.summary)).toMatch(/Attends la décision humaine/);
  });

  it('audit AI_PROPOSAL_ISSUED sans corps ni valeur', async () => {
    const p = planOf(
      await plan({
        capabilityId: PATCH_CONTACT,
        pathParams: { contactId: CONTACT_ID },
        body: { city: 'Valeur-privée', password: 'p4ss' }
      })
    );
    const issued = mockLogAudit.mock.calls.map(([e]) => e).filter(e => e.actionKey === 'AI_PROPOSAL_ISSUED');
    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatchObject({ actorUserId: USER, tenantId: TENANT, entityId: p.proposalId });
    expect(issued[0].payload).toMatchObject({
      act: 'EXECUTE_CAPABILITY',
      capabilityId: PATCH_CONTACT,
      recordKind: 'update'
    });
    expect(issued[0].payload.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(issued[0].payload.displayHash).toMatch(/^[0-9a-f]{64}$/);
    const text = JSON.stringify(mockLogAudit.mock.calls);
    expect(text).not.toMatch(/Valeur-privée|p4ss|CONFIRMERSECRET/);
  });
});

// --- fonctions pures ----------------------------------------------------------------------

describe('règles de chemin : écritures sensibles', () => {
  it.each([
    ['/api/tenants/:tenantId/x/pay', 'payment'],
    ['/api/tenants/:tenantId/x/:id/payments', 'payment'],
    ['/api/tenants/:tenantId/x/refund', 'payment'],
    ['/api/tenants/:tenantId/x/transfers', 'payment'],
    ['/api/tenants/:tenantId/x/:id/send', 'sending'],
    ['/api/tenants/:tenantId/x/:id/send-email', 'sending'],
    ['/api/tenants/:tenantId/email-notifications/:key', 'sending'],
    ['/api/tenants/:tenantId/x/sms', 'sending'],
    ['/api/tenants/:tenantId/whatsapp-notifications/:key', 'sending'],
    ['/api/tenants/:tenantId/x/notify', 'sending'],
    ['/api/tenants/:tenantId/x/remind', 'sending'],
    ['/api/tenants/:tenantId/newsletter/campaigns', 'sending'],
    ['/api/tenants/:tenantId/sales/agreements/:id/sign', 'signature'],
    ['/api/tenants/:tenantId/x/:id/validate', 'accounting'],
    ['/api/tenants/:tenantId/x/:id/approve', 'accounting'],
    ['/api/tenants/:tenantId/x/:id/close', 'accounting'],
    ['/api/tenants/:tenantId/x/cloture', 'accounting'],
    ['/api/tenants/:tenantId/x/:id/lock', 'accounting'],
    ['/api/tenants/:tenantId/x/invoices', 'accounting'],
    ['/api/tenants/:tenantId/crm/contacts/:contactId/roles', 'access'],
    ['/api/tenants/:tenantId/x/permissions', 'access'],
    ['/api/tenants/:tenantId/users/invite', 'access'],
    ['/api/tenants/:tenantId/x/:id/activate', 'access'],
    ['/api/tenants/:tenantId/x/:id/suspend', 'access'],
    ['/api/tenants/:tenantId/x/password', 'access'],
    ['/api/tenants/:tenantId/x/import', 'bulk'],
    ['/api/tenants/:tenantId/x/bulk', 'bulk'],
    ['/api/tenants/:tenantId/x/batch', 'bulk'],
    ['/api/tenants/:tenantId/x/sendEmail', 'sending']
  ])('%s -> %s', (path, category) => {
    expect(writeSensitivity(path)?.category).toBe(category);
  });

  it.each([
    '/api/tenants/:tenantId/crm/contacts',
    '/api/tenants/:tenantId/crm/contacts/:contactId',
    '/api/tenants/:tenantId/crm/tags',
    '/api/tenants/:tenantId/properties/:id',
    '/api/tenants/:tenantId/cash-sessions',
    '/api/tenants/:tenantId/x/:payId', // un paramètre n'est pas un mot du chemin
    '/api/tenants/:tenantId/x/signal', // pas « sign »
    '/api/tenants/:tenantId/x/payroll'
  ])('%s n’est pas sensible', path => {
    expect(writeSensitivity(path)).toBeNull();
  });

  it('pathWords : découpe sur - _ et majuscules, ignore les paramètres', () => {
    expect(pathWords('/api/tenants/:tenantId/x/:id/send-email_now/doSomething')).toEqual([
      'api',
      'tenants',
      'x',
      'send',
      'email',
      'now',
      'do',
      'something'
    ]);
  });

  it('le catalogue réel : des écritures sensibles connues sont bien détectées, une création simple non', () => {
    const flagged = (id: string) => writeSensitivity(findWritableEntry(id)!.path) !== null;
    expect(flagged(POST_VALIDATE)).toBe(true);
    expect(flagged('POST /api/tenants/:tenantId/rental/payments')).toBe(true);
    expect(flagged('POST /api/tenants/:tenantId/newsletter/campaigns/:campaignId/send')).toBe(true);
    expect(flagged('POST /api/tenants/:tenantId/sales/agreements/:id/sign')).toBe(true);
    expect(flagged('POST /api/tenants/:tenantId/users/invite')).toBe(true);
    expect(flagged(POST_CONTACTS)).toBe(false);
    expect(findWritableEntry(SENSITIVE_WRITE)).toBeUndefined(); // reset-password : interdit (chemin sensible), pas seulement renforcé
  });
});

describe('write-plan (fonctions pures)', () => {
  it('flattenLeaves : notation pointée, listes indexées, conteneurs vides', () => {
    expect(flattenLeaves({ a: 1, b: { c: 'x', d: [true, null] }, e: {}, f: [] })).toEqual([
      { field: 'a', value: 1 },
      { field: 'b.c', value: 'x' },
      { field: 'b.d.0', value: true },
      { field: 'b.d.1', value: null },
      { field: 'e', value: '{}' },
      { field: 'f', value: '[]' }
    ]);
  });

  it('computeChanges : décimal en chaîne et nombre = même valeur ; objet remplacé par un scalaire', () => {
    const { changes } = computeChanges(
      { rent: 150000, address: 'Rue 1', same: 'a' },
      { rent: '150000', address: { city: 'X' }, same: 'a' }
    );
    expect(changes).toEqual([{ field: 'address', before: '[objet]', after: 'Rue 1' }]);
  });

  it('computeChanges : un JWT perdu dans une valeur est masqué', () => {
    const { changes } = computeChanges({ note: 'eyJhbGciOiJIUzI1NiJ9.AAAAAAAA.BBBBBBBB' }, undefined);
    expect(changes[0]!.after).toBe('[masqué]');
  });

  it('unwrapRecord : enveloppe { success, data } et enregistrement unique enveloppé ; listes refusées', () => {
    expect(unwrapRecord({ success: true, data: { id: 1 } })).toEqual({ id: 1 });
    expect(unwrapRecord({ data: { contact: { id: 2 } } })).toEqual({ id: 2 });
    expect(unwrapRecord({ success: true, data: [{ id: 1 }] })).toEqual({ success: true, data: [{ id: 1 }] });
    expect(unwrapRecord([1])).toBeNull();
  });

  it('readableLabel : forme réelle d’un contact CRM (prénom + nom, e-mail), jamais l’id', () => {
    // GET /crm/contacts/:id -> { success, data: <CrmContact + relations> } : ni name ni fullName au premier niveau.
    const contact = {
      id: CONTACT_ID,
      contactType: 'PERSON',
      firstName: 'Awa',
      lastName: 'Koné',
      email: 'awa@example.com',
      assignedTo: { id: 'u1', email: 'x@y.z', fullName: 'Agent' },
      tags: []
    };
    expect(readableLabel(unwrapRecord({ success: true, data: contact }))).toBe('Awa Koné');
    expect(readableLabel({ id: CONTACT_ID, email: 'awa@example.com' })).toBe('awa@example.com');
    expect(
      readableLabel({
        id: CONTACT_ID,
        contactType: 'COMPANY',
        legalName: 'SCI Palmiers',
        firstName: 'A',
        lastName: 'B'
      })
    ).toBe('SCI Palmiers');
  });

  it('readableLabel : ordre des clés, sous-objet d’enveloppe, numéros, repli sur null', () => {
    expect(readableLabel({ title: 'Villa', name: 'Nom', label: 'L' })).toBe('Nom');
    expect(readableLabel({ title: 'Villa', label: 'L' })).toBe('Villa');
    expect(readableLabel({ displayName: 'D', fullName: 'F' })).toBe('D');
    expect(readableLabel({ id: 'x', leaseNumber: 'BAIL-2025-0042' })).toBe('BAIL-2025-0042');
    expect(readableLabel({ id: 'x', internalReference: 'REF-9' })).toBe('REF-9');
    expect(readableLabel({ id: 'x', number: 12 })).toBe('12');
    expect(readableLabel({ id: 'x', documentNumber: 'DOC-1', email: 'a@b.c' })).toBe('DOC-1');
    expect(readableLabel({ id: 'x', meta: { name: 'caché' } })).toBeNull();
    expect(readableLabel({ id: 'x', item: { title: 'Dans item' } })).toBe('Dans item');
    expect(readableLabel({ id: 'x', contact: { firstName: 'Awa', lastName: 'Koné' } })).toBe('Awa Koné');
    expect(readableLabel({ id: 'x', data: { name: 'Enveloppé' } })).toBe('Enveloppé');
    expect(readableLabel({ id: 'x', password: 'secret' })).toBeNull();
    expect(readableLabel(null)).toBeNull();
    expect(readableLabel({ name: 'n'.repeat(200) })!.length).toBe(121);
  });

  it('shortRecordId : UUID abrégé, id court intact', () => {
    expect(shortRecordId(CONTACT_ID)).toBe('55555555…');
    expect(shortRecordId('L-42')).toBe('L-42');
  });

  it('classifyRecord et assessWrite', () => {
    const entry = (id: string) => findWritableEntry(id)!;
    expect(classifyRecord(entry(PATCH_CONTACT))).toBe('update');
    expect(classifyRecord(entry(POST_CONTACTS))).toBe('create');
    expect(classifyRecord(entry(POST_CONVERT))).toBe('action');
    expect(assessWrite(entry(POST_CONTACTS), { a: 1 })).toEqual({ sensitive: false, requiresTypedConfirmation: false });
    expect(assessWrite(entry(POST_VALIDATE), null)).toMatchObject({ sensitive: true, requiresTypedConfirmation: true });
    expect(
      assessWrite(entry(POST_CONTACTS), Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`k${i}`, 1])))
    ).toEqual({
      sensitive: false,
      requiresTypedConfirmation: true
    });
  });

  it('plan-hash : JSON canonique indépendant de l’ordre des clés', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}'
    );
    const one = computePlanHash({
      capabilityId: PATCH_CONTACT,
      pathParams: { a: '1', b: '2' },
      query: {},
      body: { x: 1, y: 2 }
    });
    const two = computePlanHash({
      capabilityId: PATCH_CONTACT,
      pathParams: { b: '2', a: '1' },
      query: {},
      body: { y: 2, x: 1 }
    });
    const three = computePlanHash({
      capabilityId: PATCH_CONTACT,
      pathParams: { a: '1', b: '2' },
      query: {},
      body: { x: 1, y: 3 }
    });
    expect(one).toBe(two);
    expect(one).not.toBe(three);
  });
});

// --- contrat et SSE ---------------------------------------------------------------------------

describe('contrat figé (miroir du front)', () => {
  const read = (relative: string) => readFileSync(join(__dirname, '../../../..', relative), 'utf8');
  const keysOf = (source: string, name: string): string[] => {
    const start = source.indexOf(`export interface ${name} {`);
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n}\n', start));
    return [...body.matchAll(/^ {2}(\w+)\??:/gm)].map(match => match[1]!).sort();
  };

  it.each(['WritePlan', 'WritePlanChange', 'CapabilityExecutedPayload'])(
    '%s : mêmes champs côté API et côté web',
    name => {
      const api = read('packages/api/src/lib/ai/contracts.ts');
      const web = read('apps/web/src/types/copilot.ts');
      expect(keysOf(api, name)).toEqual(keysOf(web, name));
    }
  );

  it('WritePlan : liste exacte des champs du contrat', () => {
    expect(keysOf(read('packages/api/src/lib/ai/contracts.ts'), 'WritePlan')).toEqual(
      [
        'proposalId',
        'token',
        'expiresAt',
        'action',
        'capabilityId',
        'method',
        'module',
        'title',
        'steps',
        'recordKind',
        'target',
        'pathParams',
        'query',
        'stateReadAt',
        'changes',
        'changesTruncated',
        'warnings',
        'sensitive',
        'sensitiveReason',
        'requiresTypedConfirmation',
        'confirmationWord'
      ].sort()
    );
  });

  it('l’événement SSE write_plan existe des deux côtés', () => {
    expect(read('packages/api/src/lib/ai/contracts.ts')).toContain("{ type: 'write_plan'; plan: WritePlan }");
    expect(read('apps/web/src/types/copilot.ts')).toContain("{ type: 'write_plan'; plan: WritePlan }");
  });

  it('se sérialise en événement SSE `write_plan`', async () => {
    const outcome = await plan({ capabilityId: POST_CONTACTS, body: { firstName: 'Awa' } });
    const text = formatSseEvent(outcome.uiEvent!);
    expect(text.startsWith('event: write_plan\ndata: ')).toBe(true);
    expect(JSON.parse(text.split('data: ')[1]!).plan.capabilityId).toBe(POST_CONTACTS);
  });
});

// --- de bout en bout : orchestrateur + faux fournisseur ------------------------------------------

describe('orchestrateur + fournisseur fake — écritures', () => {
  const run = async (question: string, provider = new FakeProvider(), permissions = ALL_CATALOG_PERMISSIONS) => {
    const events: CopilotSseEvent[] = [];
    const requests: string[] = [];
    const wrapped = {
      id: provider.id,
      runTurn: (req: Parameters<FakeProvider['runTurn']>[0], onText: (t: string) => void, signal: AbortSignal) => {
        requests.push(JSON.stringify(req.messages));
        return provider.runTurn(req, onText, signal);
      }
    };
    await runChat({
      provider: wrapped,
      tenantId: TENANT,
      userId: USER,
      permissions,
      tools: toolsForUser(permissions),
      messages: [{ role: 'user', content: question }],
      pageContext: null,
      conversationId: 'c',
      requestId: 'r',
      signal: new AbortController().signal,
      loopbackHeaders: () => ({ Authorization: `Bearer ${BEARER}` }),
      emit: event => events.push(event)
    });
    return { events, requests };
  };
  const statuses = (events: CopilotSseEvent[]) =>
    events
      .filter((e): e is Extract<CopilotSseEvent, { type: 'tool_status' }> => e.type === 'tool_status')
      .map(s => `${s.tool}:${s.status}`);
  const textOf = (events: CopilotSseEvent[]) => events.map(e => (e.type === 'text_delta' ? e.text : '')).join('');

  it('« crée une étiquette » : plan_write d’une création, événement write_plan, aucun jeton chez le modèle, aucune écriture', async () => {
    const { events, requests } = await run('Crée une étiquette « VIP »');
    expect(statuses(events)).toEqual(['plan_write:started', 'plan_write:succeeded']);
    const planEvent = events.find(e => e.type === 'write_plan') as Extract<CopilotSseEvent, { type: 'write_plan' }>;
    expect(planEvent.plan).toMatchObject({
      capabilityId: 'POST /api/tenants/:tenantId/crm/tags',
      recordKind: 'create',
      method: 'POST',
      sensitive: false
    });
    expect(planEvent.plan.changes).toEqual([
      { field: 'name', before: undefined, after: 'VIP' },
      { field: 'color', before: undefined, after: '#1677ff' }
    ]);
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'end_turn' });
    expect(textOf(events)).toMatch(/Rien n'a été modifié/);
    // Le jeton ne quitte pas le serveur : ni messages au LLM, ni journal d'audit.
    expect(requests.join('')).not.toContain(planEvent.plan.token);
    expect(requests.join('')).not.toContain('"token"');
    expect(JSON.stringify(mockLogAudit.mock.calls)).not.toContain(planEvent.plan.token);
    expect(received).toHaveLength(0);
  });

  it('« désactive le collaborateur » : plan SENSIBLE (mot exigé) sur .../users/:userId/disable, aucune écriture', async () => {
    const USER_ID = '77777777-7777-4777-8777-777777777777';
    handler = (req, res) =>
      req.url!.includes('?')
        ? json(res, 200, {
            success: true,
            data: {
              members: [
                { id: 'm1', user: { id: '88888888-8888-4888-8888-888888888888', fullName: 'Moi' } },
                { id: 'm2', user: { id: USER_ID, fullName: 'Collègue' } }
              ],
              pagination: { page: 1 }
            }
          })
        : json(res, 200, { success: true, data: { id: USER_ID, fullName: 'Collègue' } });
    const { events } = await run('Désactive le collaborateur');
    expect(statuses(events)).toEqual([
      'call_read:started',
      'call_read:succeeded',
      'plan_write:started',
      'plan_write:succeeded'
    ]);
    const planEvent = events.find(e => e.type === 'write_plan') as Extract<CopilotSseEvent, { type: 'write_plan' }>;
    expect(planEvent.plan.capabilityId).toBe('POST /api/tenants/:tenantId/users/:userId/disable');
    expect(planEvent.plan.pathParams).toEqual([{ name: 'userId', value: USER_ID }]);
    expect(planEvent.plan.sensitive).toBe(true);
    expect(planEvent.plan.requiresTypedConfirmation).toBe(true);
    expect(planEvent.plan.confirmationWord).toBe('CONFIRMER');
    expect(planEvent.plan.target).toEqual({ label: 'Collègue', resolved: true });
    expect(received.every(r => r.method === 'GET')).toBe(true);
    nothingWritten();
  });

  it('« désactive le collaborateur » sans collaborateur listé : aucun plan', async () => {
    handler = (_req, res) => json(res, 200, { success: true, data: { members: [] } });
    const { events } = await run('Désactive un membre');
    expect(events.some(e => e.type === 'write_plan')).toBe(false);
    expect(textOf(events)).toMatch(/aucun collaborateur/);
  });

  it('« modifie le contact » : lecture de la liste, lecture de l’état, plan PATCH, aucune écriture', async () => {
    handler = (req, res) =>
      req.url!.includes('?')
        ? json(res, 200, { success: true, data: [{ id: CONTACT_ID, fullName: 'Awa Koné' }] })
        : json(res, 200, { success: true, data: { id: CONTACT_ID, fullName: 'Awa Koné', internalNotes: 'avant' } });
    const { events } = await run('Modifie la note du premier contact : « rappeler lundi »');
    expect(statuses(events)).toEqual([
      'call_read:started',
      'call_read:succeeded',
      'plan_write:started',
      'plan_write:succeeded'
    ]);
    const planEvent = events.find(e => e.type === 'write_plan') as Extract<CopilotSseEvent, { type: 'write_plan' }>;
    expect(planEvent.plan.recordKind).toBe('update');
    expect(planEvent.plan.target).toEqual({ label: 'Awa Koné', resolved: true });
    expect(planEvent.plan.changes).toEqual([{ field: 'internalNotes', before: 'avant', after: 'rappeler lundi' }]);
    expect(received.map(r => r.method)).toEqual(['GET', 'GET']);
    expect(textOf(events)).toMatch(/approbation/);
  });

  it('un plan refusé (état illisible) est expliqué, sans événement write_plan', async () => {
    handler = (req, res) =>
      req.url!.includes('?')
        ? json(res, 200, { success: true, data: [{ id: CONTACT_ID }] })
        : json(res, 403, { success: false, message: 'interdit' });
    const { events } = await run('Modifie le contact');
    expect(events.some(e => e.type === 'write_plan')).toBe(false);
    expect(statuses(events)).toContain('plan_write:forbidden');
    expect(textOf(events)).toMatch(/pas pu préparer/);
  });

  it('un modèle qui tente plan_write sur une suppression ou un id inventé est refusé, rien n’est émis', async () => {
    for (const capabilityId of [
      'DELETE /api/tenants/:tenantId/crm/contacts/:contactId',
      'PATCH /api/tenants/:tenantId/nimporte/:id'
    ]) {
      const provider = new FakeProvider([
        {
          toolCalls: [{ name: 'plan_write', input: { capabilityId, pathParams: { contactId: CONTACT_ID }, ...base } }]
        },
        { text: 'fin' }
      ]);
      const { events, requests } = await run('x', provider);
      expect(events.some(e => e.type === 'write_plan')).toBe(false);
      expect(requests[1]).toContain('isError":true');
    }
    expect(received).toHaveLength(0);
  });

  it('plafond de 3 plans par requête de chat, via l’orchestrateur', async () => {
    const step = {
      toolCalls: [
        { name: 'plan_write' as const, input: { capabilityId: POST_CONTACTS, body: { firstName: 'A' }, ...base } },
        { name: 'plan_write' as const, input: { capabilityId: POST_CONTACTS, body: { firstName: 'B' }, ...base } },
        { name: 'plan_write' as const, input: { capabilityId: POST_CONTACTS, body: { firstName: 'C' }, ...base } },
        { name: 'plan_write' as const, input: { capabilityId: POST_CONTACTS, body: { firstName: 'D' }, ...base } }
      ]
    };
    const { events, requests } = await run('x', new FakeProvider([step, { text: 'fin' }]));
    expect(events.filter(e => e.type === 'write_plan')).toHaveLength(3);
    expect(requests[1]).toContain('Au plus 3 plans');
  });

  it('sans la permission de l’outil, plan_write n’est pas offert (refus audité, aucun plan)', async () => {
    const provider = new FakeProvider([
      { toolCalls: [{ name: 'plan_write', input: { capabilityId: POST_CONTACTS, ...base } }] },
      { text: 'fin' }
    ]);
    const { events } = await run('x', provider, new Set(['RENTAL_LEASES_VIEW']));
    expect(events.some(e => e.type === 'write_plan')).toBe(false);
    expect(events.some(e => e.type === 'tool_status' && e.status === 'forbidden')).toBe(true);
  });

  it('le fournisseur fake n’émet jamais plan_write si l’outil n’est pas offert', async () => {
    const provider = new FakeProvider();
    const result = await provider.runTurn(
      {
        system: '',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Crée une étiquette VIP' }] }],
        tools: [{ name: 'search_properties', description: '', inputSchema: {} }],
        maxOutputTokens: 100
      },
      () => undefined,
      new AbortController().signal
    );
    expect(result.toolCalls).toEqual([]);
  });
});

describe('invite système — écritures', () => {
  const tools = () => toolsForUser(ALL_CATALOG_PERMISSIONS);

  it('décrit le flux list_capabilities, call_read, plan_write, attendre ; jamais d’écriture affirmée ; pas de suppression', () => {
    const prompt = buildSystemPrompt('fr', tools());
    expect(prompt).toContain('plan_write');
    expect(prompt).toMatch(/quatre temps/);
    expect(prompt).toMatch(/ATTENDS l'accord/);
    expect(prompt).toMatch(/N'affirme JAMAIS qu'une écriture est faite/);
    expect(prompt).toMatch(/SUPPRESSION est impossible/);
    expect(prompt).toMatch(/langue de l'utilisateur/);
    expect(prompt).toMatch(/DONNÉES/);
    expect(prompt).toMatch(/Au plus 3 plans/);
    // Règle 3 : l'assistant ne prétend rien de fait.
    expect(prompt).toMatch(/Ne prétends jamais qu'un document a été généré, ou qu'une donnée a été créée/);
    // Règle de lecture : les routes d'écriture ne passent que par plan_write.
    expect(prompt).toMatch(/routes d'écriture .* ne sont PAS appelables par call_read/);
  });

  it('sans plan_write : lecture seule, aucune mention du plan', () => {
    const prompt = buildSystemPrompt(
      'fr',
      tools().filter(tool => tool.name !== 'plan_write')
    );
    expect(prompt).not.toContain('plan_write');
    expect(prompt).toMatch(/ne sont PAS appelables : si on te demande d'écrire/);
  });
});
