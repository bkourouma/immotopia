/**
 * ImmoCopilot — `plan_write` valide le corps à sec AVANT d'afficher le plan.
 * Cas réel du staging : création d'un bien sans `ownershipType`, plan affiché puis refusé à l'exécution.
 *
 * Un refus ne doit laisser aucune trace : pas de lecture loopback, pas d'événement d'interface,
 * pas de jeton signé, pas d'audit, pas de plan décompté.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const mockLogAudit = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (...a: unknown[]) => mockLogAudit(...a) }));

import { ForbiddenError, ValidationError } from '../../src/middleware/error-middleware';
import type { CopilotSseEvent, CopilotToolContext, WritePlan } from '../../src/lib/ai/contracts';
import { findWritableEntry, getCatalogEntries } from '../../src/lib/ai/gateway/catalog';
import { setLoopbackBaseUrlForTests } from '../../src/lib/ai/gateway/loopback';
import { WRITE_BODY_VALIDATORS } from '../../src/lib/ai/gateway/write-validators';
import { computePlanHash } from '../../src/lib/ai/plan-hash';
import * as proposalToken from '../../src/lib/ai/proposal-token';
import { planWriteTool } from '../../src/lib/ai/tools/plan-write';
import { buildSystemPrompt } from '../../src/lib/ai/system-prompt';
import { toolsForUser } from '../../src/lib/ai/tools/registry';

const TENANT = 'tenant-a';
const POST_PROPERTIES = 'POST /api/tenants/:tenantId/properties';
const POST_TAGS = 'POST /api/tenants/:tenantId/crm/tags';
const PATCH_CONTACT = 'PATCH /api/tenants/:tenantId/crm/contacts/:contactId';
const CONTACT_ID = '55555555-5555-4555-8555-555555555555';
const UNVERIFIED = 'Cette route n’a pas pu être vérifiée à l’avance : le serveur contrôlera les champs à l’exécution.';

const ALL_PERMISSIONS = new Set(
  getCatalogEntries().flatMap(entry => [...(entry.permissions ?? []), ...(entry.anyOfPermissions ?? []).flat()])
);
ALL_PERMISSIONS.add('PROPERTIES_VIEW');

let server: http.Server;
const received: Array<{ method: string; url: string }> = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    received.push({ method: req.method ?? '', url: req.url ?? '' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: { id: CONTACT_ID, city: 'Abidjan' } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  setLoopbackBaseUrlForTests(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

afterAll(async () => {
  setLoopbackBaseUrlForTests(null);
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

let signSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  received.length = 0;
  signSpy = jest.spyOn(proposalToken, 'signCapabilityProposal');
});

afterEach(() => signSpy.mockRestore());

function ctx(overrides: Partial<CopilotToolContext> = {}): CopilotToolContext {
  return {
    tenantId: TENANT,
    userId: 'user-1',
    permissions: ALL_PERMISSIONS,
    requestId: 'req-1',
    conversationId: 'conv-1',
    signal: new AbortController().signal,
    seenLeaseIds: new Set(),
    loopbackHeaders: () => ({ Authorization: 'Bearer x.y.z' }),
    ...overrides
  };
}

const base = { title: 'Créer un bien', steps: ['Créer le bien'] };
const plan = (input: Record<string, unknown>, context = ctx()) =>
  planWriteTool.execute(planWriteTool.inputSchema.parse({ ...base, ...input }), context);

const validBody = { propertyType: 'APPARTEMENT', ownershipType: 'TENANT', title: 'Villa Cocody' };

describe('plan_write — validation à sec du corps', () => {
  it('cas du staging : bien sans ownershipType refusé avec le champ et les valeurs permises', async () => {
    const error = await plan({
      capabilityId: POST_PROPERTIES,
      body: { propertyType: 'APPARTEMENT', title: 'Villa Cocody' }
    }).catch(e => e);
    expect(error).toBeInstanceOf(ValidationError);
    const issue = (error as ValidationError).errors!.find(e => e.field === 'ownershipType') as unknown as {
      kind: string;
      allowedValues: string[];
    };
    expect(issue.kind).toBe('missing');
    expect(issue.allowedValues).toContain('TENANT');
    expect((error as ValidationError).message).toBe(
      'Corps refusé par la route : certains champs sont absents ou invalides.'
    );
  });

  it('un refus ne laisse aucune trace (compteur, jeton, audit, lecture loopback)', async () => {
    const context = ctx();
    await expect(
      plan({ capabilityId: POST_PROPERTIES, body: { propertyType: 'APPARTEMENT', title: 'Villa' } }, context)
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      plan(
        { capabilityId: PATCH_CONTACT, pathParams: { contactId: CONTACT_ID }, body: { contactType: 'ROBOT' } },
        context
      )
    ).rejects.toBeInstanceOf(ValidationError);
    expect(context.writePlansIssued ?? 0).toBe(0);
    expect(signSpy).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
    expect(received).toEqual([]);
  });

  it('plan complet valide accepté ; le corps et le hash sont ceux du modèle', async () => {
    const context = ctx();
    const outcome = await plan({ capabilityId: POST_PROPERTIES, body: validBody }, context);
    expect(outcome.uiEvent?.type).toBe('write_plan');
    const written = (outcome.uiEvent as Extract<CopilotSseEvent, { type: 'write_plan' }>).plan as WritePlan;
    expect(written.warnings).not.toContain(UNVERIFIED);
    expect(context.writePlansIssued).toBe(1);
    const signed = signSpy.mock.calls[0]![0].args;
    expect(signed.body).toEqual(validBody);
    // Hash identique à celui d'avant le contrôle : calculé sur le corps brut, sans champ ajouté par la validation.
    const expected = computePlanHash({
      capabilityId: POST_PROPERTIES,
      pathParams: {},
      query: {},
      body: validBody
    });
    expect(signed.planHash).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });

  it('route sans entrée de registre : plan accepté avec l’avertissement « non vérifiée »', async () => {
    expect(WRITE_BODY_VALIDATORS.has(POST_TAGS)).toBe(false);
    expect(findWritableEntry(POST_TAGS)).toBeDefined();
    const outcome = await plan({ capabilityId: POST_TAGS, body: { name: 'VIP' } });
    const written = (outcome.uiEvent as Extract<CopilotSseEvent, { type: 'write_plan' }>).plan;
    expect(written.warnings).toContain(UNVERIFIED);
    expect((outcome.modelResult as { summary: string }).summary).toContain("n'ont pas pu être vérifiés");
  });

  it('un schéma qui lève une exception non-Zod ne produit pas de 500 : plan accepté, non vérifié', async () => {
    const registry = WRITE_BODY_VALIDATORS as Map<string, unknown>;
    registry.set(POST_TAGS, {
      schema: {
        safeParse: () => {
          throw new TypeError('boom');
        }
      }
    });
    try {
      const outcome = await plan({ capabilityId: POST_TAGS, body: { name: 'VIP' } });
      const written = (outcome.uiEvent as Extract<CopilotSseEvent, { type: 'write_plan' }>).plan;
      expect(written.warnings).toContain(UNVERIFIED);
    } finally {
      registry.delete(POST_TAGS);
    }
  });

  it('permission refusée : refus habituel, aucune information sur les champs', async () => {
    const error = await plan(
      { capabilityId: POST_PROPERTIES, body: { title: 'x' } },
      ctx({ permissions: new Set(['PROPERTIES_VIEW']) })
    ).catch(e => e);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).errors).toBeUndefined();
    expect(JSON.stringify(error)).not.toMatch(/ownershipType/);
  });
});

describe('invite système', () => {
  it('demande de ne pas inventer les champs refusés par plan_write', () => {
    const prompt = buildSystemPrompt('fr', toolsForUser(ALL_PERMISSIONS));
    expect(prompt).toMatch(/N'INVENTE ni valeur ni identifiant/);
    expect(prompt).toMatch(/pas pu être vérifiée à l'avance/);
  });
});
