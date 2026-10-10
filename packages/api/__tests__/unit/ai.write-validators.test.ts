/**
 * ImmoCopilot — validation à sec du corps d'un plan d'écriture (gateway/write-validators.ts).
 * Aucune base : le module est une feuille (schémas Zod seulement).
 *
 * Parité : pour des routes témoins, le verdict de `checkWriteBody` est comparé à celui du vrai
 * code de la route (middleware `validate`, contrôleur des baux, contrôleur des biens dont le
 * service est réduit à son premier geste, `createPropertySchema.parse`).
 */
import type { Request, Response } from 'express';
import { z } from 'zod';

const mockCreateProperty = jest.fn();
const mockCreateLease = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: (...a: unknown[]) => mockLoggerWarn(...a), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/property-service', () => ({
  createProperty: (...a: unknown[]) => mockCreateProperty(...a)
}));
jest.mock('../../src/services/rental-lease-service', () => ({
  createLease: (...a: unknown[]) => mockCreateLease(...a),
  getLeaseById: jest.fn(),
  updateLease: jest.fn(),
  listLeases: jest.fn(),
  updateLeaseStatus: jest.fn(),
  addCoRenter: jest.fn(),
  removeCoRenter: jest.fn(),
  listCoRenters: jest.fn(),
  deleteLease: jest.fn()
}));

import { createLeaseHandler } from '../../src/controllers/rental-controller';
import { createPropertyHandler } from '../../src/controllers/property-controller';
import { findWritableEntry, getCatalogEntries } from '../../src/lib/ai/gateway/catalog';
import {
  checkWriteBody,
  MAX_WRITE_BODY_ISSUES,
  WRITE_BODY_VALIDATORS,
  type WriteBodyCheck
} from '../../src/lib/ai/gateway/write-validators';
import { createPropertySchema } from '../../src/lib/properties/schemas';
import { validate } from '../../src/middleware/validation-middleware';
import { createContactSchema } from '../../src/types/crm-types';

const POST_PROPERTIES = 'POST /api/tenants/:tenantId/properties';
const PUT_PROPERTY = 'PUT /api/tenants/:tenantId/properties/:id';
const POST_CONTACTS = 'POST /api/tenants/:tenantId/crm/contacts';
const POST_LEASES = 'POST /api/tenants/:tenantId/rental/leases';
const CTX = { tenantId: 'tenant-a', pathParams: {} };
const entry = (id: string) => findWritableEntry(id)!;
const check = (id: string, body: Record<string, unknown> | null): WriteBodyCheck =>
  checkWriteBody(entry(id), body, CTX);

const validProperty = { propertyType: 'APPARTEMENT', ownershipType: 'TENANT', title: 'Villa Cocody' };

const EXPECTED_VALIDATOR_IDS = [
  'PATCH /api/tenants/:tenantId/crm/contacts/:contactId',
  'PATCH /api/tenants/:tenantId/crm/contacts/:contactId/roles',
  'PATCH /api/tenants/:tenantId/crm/deals/:dealId',
  'PATCH /api/tenants/:tenantId/rental/leases/:leaseId',
  'POST /api/tenants/:tenantId/crm/activities',
  'POST /api/tenants/:tenantId/crm/contacts',
  'POST /api/tenants/:tenantId/crm/contacts/:contactId/convert',
  'POST /api/tenants/:tenantId/crm/deals',
  'POST /api/tenants/:tenantId/properties',
  'POST /api/tenants/:tenantId/rental/leases',
  'PUT /api/tenants/:tenantId/properties/:id'
].sort();

beforeEach(() => jest.clearAllMocks());

describe('checkWriteBody', () => {
  it('cas du staging : bien sans ownershipType -> missing + valeurs permises', () => {
    const result = check(POST_PROPERTIES, { propertyType: 'APPARTEMENT', title: 'Villa' });
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    const issue = result.issues.find(i => i.path === 'ownershipType')!;
    expect(issue.kind).toBe('missing');
    expect(issue.allowedValues).toEqual(expect.arrayContaining(['TENANT']));
    expect(issue.allowedValues!.length).toBeGreaterThan(1);
  });

  it('valeur hors enum -> kind enum avec valeurs permises, sans écho de la valeur saisie', () => {
    const secret = 'ZZ-VALEUR-SECRETE';
    const result = check(POST_PROPERTIES, { ...validProperty, ownershipType: secret });
    if (result.status !== 'invalid') throw new Error('attendu invalid');
    const issue = result.issues.find(i => i.path === 'ownershipType')!;
    expect(issue.kind).toBe('enum');
    expect(issue.allowedValues).toContain('TENANT');
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('type erroné -> invalid, sans la valeur ni le type reçu', () => {
    const result = check(POST_PROPERTIES, { ...validProperty, price: 'MONTANT-SECRET' });
    if (result.status !== 'invalid') throw new Error('attendu invalid');
    const issue = result.issues.find(i => i.path === 'price')!;
    expect(issue.kind).toBe('invalid');
    expect(JSON.stringify(result)).not.toMatch(/MONTANT-SECRET|received/);
  });

  it('corps complet valide -> valid ; le corps n’est pas modifié', () => {
    const body = { ...validProperty };
    expect(check(POST_PROPERTIES, body)).toEqual({ status: 'valid' });
    expect(body).toEqual(validProperty);
  });

  it('plafonne à 10 issues et 200 caractères par message', () => {
    const registry = WRITE_BODY_VALIDATORS as Map<string, unknown>;
    registry.set('POST /api/test/many', {
      schema: z.object(Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`f${i}`, z.string()])))
    });
    registry.set('POST /api/test/long', {
      schema: z.object({ a: z.string().refine(() => false, 'x'.repeat(500)) })
    });
    try {
      const fake = (id: string) => ({ id }) as never;
      const many = checkWriteBody(fake('POST /api/test/many'), {}, CTX);
      if (many.status !== 'invalid') throw new Error('attendu invalid');
      expect(many.issues).toHaveLength(MAX_WRITE_BODY_ISSUES);
      const long = checkWriteBody(fake('POST /api/test/long'), { a: 'v' }, CTX);
      if (long.status !== 'invalid') throw new Error('attendu invalid');
      expect(long.issues[0]!.message.length).toBeLessThanOrEqual(200);
    } finally {
      registry.delete('POST /api/test/many');
      registry.delete('POST /api/test/long');
    }
  });

  it('route absente du registre -> unchecked (jamais valid)', () => {
    expect(check('POST /api/tenants/:tenantId/crm/tags', { name: 'x' })).toEqual({ status: 'unchecked' });
  });

  it('exception non-Zod ou schéma asynchrone -> unchecked, journalisé, sans lever', () => {
    const registry = WRITE_BODY_VALIDATORS as Map<string, unknown>;
    registry.set('POST /api/test/boom', {
      schema: z.object({}),
      prepare: () => {
        throw new Error('boom');
      }
    });
    registry.set('POST /api/test/async', {
      schema: z.object({ a: z.string().refine(async () => true) })
    });
    try {
      const fake = (id: string) => ({ id }) as never;
      expect(checkWriteBody(fake('POST /api/test/boom'), {}, CTX)).toEqual({ status: 'unchecked' });
      expect(checkWriteBody(fake('POST /api/test/async'), { a: 'x' }, CTX)).toEqual({ status: 'unchecked' });
      expect(mockLoggerWarn).toHaveBeenCalledTimes(2);
    } finally {
      registry.delete('POST /api/test/boom');
      registry.delete('POST /api/test/async');
    }
  });

  it('dérive : chaque clé du registre est une écriture reconnue par le catalogue', () => {
    expect([...WRITE_BODY_VALIDATORS.keys()].sort()).toEqual(EXPECTED_VALIDATOR_IDS);
    for (const id of WRITE_BODY_VALIDATORS.keys()) {
      expect(findWritableEntry(id)).toBeDefined();
    }
    const catalogIds = new Set(getCatalogEntries().map(e => e.id));
    for (const id of WRITE_BODY_VALIDATORS.keys()) expect(catalogIds.has(id)).toBe(true);
  });
});

describe('parité avec la vraie route', () => {
  const contactBodies: Array<Record<string, unknown>> = [
    {},
    { firstName: 'Awa' },
    { firstName: 'Awa', lastName: 'Koné' },
    { firstName: '<b>Awa</b>', lastName: 'Koné' },
    { firstName: 'Awa', lastName: 'Koné', contactType: 'ROBOT' },
    { firstName: '   ', lastName: 'Koné' }
  ];

  it.each(contactBodies.map((body, i) => [i, body] as const))('contact CRM, corps #%s', (_i, body) => {
    const req = { body: structuredClone(body) } as Request;
    const next = jest.fn();
    validate(createContactSchema)(req, {} as Response, next);
    const routeRejects = next.mock.calls[0]?.[0] !== undefined;
    expect(check(POST_CONTACTS, body).status === 'invalid').toBe(routeRejects);
  });

  const leaseBodies: Array<Record<string, unknown>> = [
    {},
    { propertyId: 'p1', startDate: '2026-01-01T00:00:00.000Z' },
    { propertyId: 'p1', startDate: '2026-01-01T00:00:00.000Z', primaryRenterContactId: 'c1' },
    { propertyId: 'p1', startDate: '+020257-01-01', primaryRenterContactId: 'c1' },
    {
      propertyId: 'p1',
      startDate: '2026-01-01T00:00:00.000Z',
      primaryRenterContactId: 'c1',
      billingFrequency: 'WEEKLY'
    }
  ];

  it.each(leaseBodies.map((body, i) => [i, body] as const))('bail, corps #%s', async (_i, body) => {
    mockCreateLease.mockResolvedValue({ id: 'l1' });
    const req = { body, tenantContext: { tenantId: 'tenant-a' }, user: { userId: 'u1' } } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn();
    await createLeaseHandler(req, res, next);
    expect(check(POST_LEASES, body).status === 'invalid').toBe(next.mock.calls.length > 0);
  });

  const propertyBodies: Array<Record<string, unknown>> = [
    {},
    { propertyType: 'APPARTEMENT', title: 'Villa' },
    validProperty,
    { ...validProperty, ownershipType: 'INCONNU' },
    { ...validProperty, price: 'abc' },
    { ...validProperty, ownerEmail: 'pas-un-email' },
    { ...validProperty, currency: '' },
    { ...validProperty, ownerUserId: null },
    { ...validProperty, ownerUserId: null, ownerEmail: 'proprio@example.com' },
    { ...validProperty, ownerUserId: 'pas-un-uuid' }
  ];

  it.each(propertyBodies.map((body, i) => [i, body] as const))('bien, corps #%s', async (_i, body) => {
    // Le service réel commence par `createPropertySchema.parse(data)` : on le réduit à ce geste.
    mockCreateProperty.mockImplementation(async (_tenant: unknown, _owner: unknown, data: unknown) => {
      createPropertySchema.parse(data);
      return { id: 'p1' };
    });
    const req = {
      body,
      params: { tenantId: 'tenant-a' },
      user: { userId: '11111111-1111-4111-8111-111111111111' }
    } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn();
    await createPropertyHandler(req, res, next);
    expect(check(POST_PROPERTIES, body).status === 'invalid').toBe(next.mock.calls.length > 0);
  });

  it('PUT bien : un corps partiel valide, un type erroné refusé', () => {
    expect(check(PUT_PROPERTY, { title: 'Nouveau titre' })).toEqual({ status: 'valid' });
    expect(check(PUT_PROPERTY, { price: 'abc' }).status).toBe('invalid');
    expect(check(PUT_PROPERTY, null)).toEqual({ status: 'valid' });
  });
});
