/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot S1 (besoin 7) : agences mandantes et images d'identité des documents.
 *
 * Base en mémoire minimale (filtres `where` réellement appliqués) : un test
 * d'isolation qui renverrait ce qu'on lui a préparé ne prouverait rien.
 * Couvre : CRUD des mandants, refus de suppression d'un mandant utilisé,
 * isolation entre agences (lecture, image, rattachement), validation des
 * dépôts (type réel, taille), remplacement d'un fichier, et absence de tout
 * chemin disque dans les réponses.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { findDiskPathLeaks } from '../helpers/disk-path-leaks';

jest.mock('../../src/config/env', () => {
  const actual = jest.requireActual('../../src/config/env');
  const nodePath = require('path');
  const nodeOs = require('os');
  return {
    ...actual,
    env: { ...actual.env, UPLOADS_DIR: nodePath.join(nodeOs.tmpdir(), `immotopia-branding-api-${process.pid}`) }
  };
});

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requireAnyPropertyPermission: () => (_req: any, _res: any, next: any) => next(),
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

jest.mock('../../src/middleware/rbac-middleware', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next()
}));

jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), flushAuditQueue: jest.fn() }));

// ------------------------------------------------------------ base en mémoire
type Row = Record<string, any>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('equals' in condition) {
        return condition.mode === 'insensitive'
          ? String(row[key] ?? '').toLowerCase() === String(condition.equals).toLowerCase()
          : row[key] === condition.equals;
      }
      if ('not' in condition) return row[key] !== condition.not;
      return false;
    }
    return (row[key] ?? null) === condition;
  });
}

function project(row: Row, select?: Row): Row {
  if (!select) return { ...row };
  return Object.fromEntries(
    Object.keys(select)
      .filter(k => select[k])
      .map(k => [k, row[k] ?? null])
  );
}

function model(rows: Row[], extras: (row: Row, args: any) => Row = row => row) {
  return {
    findFirst: jest.fn(async (args: any = {}) => {
      const row = rows.find(r => matches(r, args.where));
      return row ? project(extras({ ...row }, args), args.select) : null;
    }),
    findUnique: jest.fn(async (args: any = {}) => {
      const row = rows.find(r => matches(r, args.where));
      return row ? project(extras({ ...row }, args), args.select) : null;
    }),
    findMany: jest.fn(async (args: any = {}) =>
      rows.filter(r => matches(r, args.where)).map(r => project(extras({ ...r }, args), args.select))
    ),
    count: jest.fn(async (args: any = {}) => rows.filter(r => matches(r, args.where)).length),
    create: jest.fn(async (args: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...args.data };
      rows.push(row);
      return { ...row };
    }),
    update: jest.fn(async (args: any) => {
      const row = rows.find(r => matches(r, args.where));
      if (!row) throw new Error('Record to update not found.');
      Object.assign(row, args.data, { updatedAt: new Date() });
      return project({ ...row }, args.select);
    }),
    delete: jest.fn(async (args: any) => {
      const index = rows.findIndex(r => matches(r, args.where));
      if (index < 0) throw new Error('Record to delete does not exist.');
      return rows.splice(index, 1)[0];
    })
  };
}

const mockDb: { mandants: Row[]; syndicates: Row[]; tenants: Row[] } = { mandants: [], syndicates: [], tenants: [] };

const mockPrisma: any = {
  syndicMandatingAgency: model(mockDb.mandants, (row, args) => {
    if (args.include?._count) {
      row._count = { syndicates: mockDb.syndicates.filter(s => s.mandatingAgencyId === row.id).length };
    }
    if (args.include?.syndicates) {
      row.syndicates = mockDb.syndicates
        .filter(s => s.mandatingAgencyId === row.id && s.tenantId === row.tenantId)
        .map(s => ({ id: s.id, name: s.name }));
    }
    return row;
  }),
  syndicate: model(mockDb.syndicates),
  tenant: model(mockDb.tenants)
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import documentBrandingRoutes from '../../src/routes/document-branding-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
import { updateSyndicateByTenant } from '../../src/lib/syndics/queries';

const UPLOADS = path.join(os.tmpdir(), `immotopia-branding-api-${process.pid}`);
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const SYNDIC_A = '11111111-1111-4111-8111-111111111111';
const SYNDIC_B = '22222222-2222-4222-8222-222222222222';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const app = express();
app.use(express.json());
app.use('/api', documentBrandingRoutes);
app.use(errorHandler);

const base = (tenantId: string) => `/api/tenants/${tenantId}`;

function expectNoPath(body: unknown) {
  expect(findDiskPathLeaks(body)).toEqual([]);
  expect(JSON.stringify(body)).not.toMatch(/branding\/|logoPath|signaturePath|stampPath/);
}

async function createMandant(tenantId: string, name: string) {
  const res = await request(app)
    .post(`${base(tenantId)}/syndic-mandating-agencies`)
    .send({ name });
  expect(res.status).toBe(201);
  return res.body.data;
}

beforeEach(() => {
  mockDb.mandants.length = 0;
  mockDb.syndicates.length = 0;
  mockDb.tenants.length = 0;
  mockDb.tenants.push(
    { id: TENANT_A, logoUrl: null, documentSignaturePath: null, documentStampPath: null },
    { id: TENANT_B, logoUrl: null, documentSignaturePath: null, documentStampPath: null }
  );
  mockDb.syndicates.push(
    {
      id: SYNDIC_A,
      tenantId: TENANT_A,
      name: 'Residence A',
      status: 'ACTIVE',
      logoPath: null,
      mandatingAgencyId: null
    },
    { id: SYNDIC_B, tenantId: TENANT_B, name: 'Residence B', status: 'ACTIVE', logoPath: null, mandatingAgencyId: null }
  );
});

afterAll(() => {
  fs.rmSync(UPLOADS, { recursive: true, force: true });
});

describe('agences mandantes : CRUD', () => {
  it('crée, liste, lit et modifie un mandant', async () => {
    const created = await request(app)
      .post(`${base(TENANT_A)}/syndic-mandating-agencies`)
      .send({ name: '  Agence Alpha ', email: 'contact@alpha.ci', phone: '', rccm: 'CI-1' });
    expect(created.status).toBe(201);
    expect(created.body.data).toEqual(
      expect.objectContaining({
        name: 'Agence Alpha',
        email: 'contact@alpha.ci',
        phone: null,
        rccm: 'CI-1',
        hasLogo: false,
        hasSignature: false,
        hasStamp: false,
        logoUrl: null,
        syndicateCount: 0
      })
    );
    const id = created.body.data.id;

    const list = await request(app).get(`${base(TENANT_A)}/syndic-mandating-agencies`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((m: any) => m.id)).toEqual([id]);

    const patched = await request(app)
      .patch(`${base(TENANT_A)}/syndic-mandating-agencies/${id}`)
      .send({ address: 'Plateau' });
    expect(patched.status).toBe(200);
    expect(patched.body.data.address).toBe('Plateau');

    const detail = await request(app).get(`${base(TENANT_A)}/syndic-mandating-agencies/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toEqual(expect.objectContaining({ id, syndicates: [] }));
    expectNoPath(detail.body);
  });

  it('refuse un nom déjà pris dans la même agence (409), pas dans une autre', async () => {
    await createMandant(TENANT_A, 'Agence Alpha');
    const clash = await request(app)
      .post(`${base(TENANT_A)}/syndic-mandating-agencies`)
      .send({ name: 'agence alpha' });
    expect(clash.status).toBe(409);
    await createMandant(TENANT_B, 'Agence Alpha');
  });

  it('refuse un nom vide ou un e-mail invalide', async () => {
    const res = await request(app)
      .post(`${base(TENANT_A)}/syndic-mandating-agencies`)
      .send({ name: 'X', email: 'pas-un-email' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const empty = await request(app)
      .post(`${base(TENANT_A)}/syndic-mandating-agencies`)
      .send({ name: ' ' });
    expect(empty.status).toBeGreaterThanOrEqual(400);
    expect(empty.status).toBeLessThan(500);
  });

  it("ne montre jamais le mandant d'une autre agence (404), ni un identifiant mal formé", async () => {
    const other = await createMandant(TENANT_B, 'Agence Beta');
    const list = await request(app).get(`${base(TENANT_A)}/syndic-mandating-agencies`);
    expect(list.body.data).toEqual([]);
    expect((await request(app).get(`${base(TENANT_A)}/syndic-mandating-agencies/${other.id}`)).status).toBe(404);
    expect(
      (
        await request(app)
          .patch(`${base(TENANT_A)}/syndic-mandating-agencies/${other.id}`)
          .send({ name: 'Pirate' })
      ).status
    ).toBe(404);
    expect((await request(app).delete(`${base(TENANT_A)}/syndic-mandating-agencies/${other.id}`)).status).toBe(404);
    expect((await request(app).get(`${base(TENANT_A)}/syndic-mandating-agencies/pas-un-uuid`)).status).toBe(404);
  });

  it('refuse de supprimer un mandant rattaché à une copropriété (409), puis le supprime une fois détaché', async () => {
    const mandant = await createMandant(TENANT_A, 'Agence Alpha');
    mockDb.syndicates[0].mandatingAgencyId = mandant.id;

    const refused = await request(app).delete(`${base(TENANT_A)}/syndic-mandating-agencies/${mandant.id}`);
    expect(refused.status).toBe(409);
    expect(mockDb.mandants).toHaveLength(1);

    mockDb.syndicates[0].mandatingAgencyId = null;
    const deleted = await request(app).delete(`${base(TENANT_A)}/syndic-mandating-agencies/${mandant.id}`);
    expect(deleted.status).toBe(200);
    expect(mockDb.mandants).toHaveLength(0);
  });
});

describe('images : dépôt, lecture, remplacement', () => {
  it('dépose, relit puis remplace le logo d’un mandant (l’ancien fichier est supprimé)', async () => {
    const mandant = await createMandant(TENANT_A, 'Agence Alpha');
    const url = `${base(TENANT_A)}/syndic-mandating-agencies/${mandant.id}/images/logo`;

    const first = await request(app).put(url).attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual(
      expect.objectContaining({
        hasLogo: true,
        logoUrl: `/tenants/${TENANT_A}/syndic-mandating-agencies/${mandant.id}/images/logo`
      })
    );
    expectNoPath(first.body);
    const firstKey = mockDb.mandants[0].logoPath as string;
    expect(firstKey).toMatch(new RegExp(`^branding/${TENANT_A}/mandants/${mandant.id}/logo-[0-9a-f-]+\\.png$`));
    expect(fs.existsSync(path.join(UPLOADS, firstKey))).toBe(true);

    const read = await request(app).get(url);
    expect(read.status).toBe(200);
    expect(read.headers['content-type']).toBe('image/png');
    expect(read.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.compare(read.body as Buffer, PNG)).toBe(0);

    const second = await request(app).put(url).attach('file', PNG, { filename: 'autre.png', contentType: 'image/png' });
    expect(second.status).toBe(200);
    const secondKey = mockDb.mandants[0].logoPath as string;
    expect(secondKey).not.toBe(firstKey);
    expect(fs.existsSync(path.join(UPLOADS, firstKey))).toBe(false);
    expect(fs.existsSync(path.join(UPLOADS, secondKey))).toBe(true);

    const removed = await request(app).delete(url);
    expect(removed.status).toBe(200);
    expect(removed.body.data.hasLogo).toBe(false);
    expect(fs.existsSync(path.join(UPLOADS, secondKey))).toBe(false);
    expect((await request(app).get(url)).status).toBe(404);
  });

  it('refuse un faux PNG (400), un GIF (400), un fichier trop lourd (413) et un type d’image inconnu (404)', async () => {
    const mandant = await createMandant(TENANT_A, 'Agence Alpha');
    const url = `${base(TENANT_A)}/syndic-mandating-agencies/${mandant.id}/images/signature`;

    const fake = await request(app)
      .put(url)
      .attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);

    const gif = await request(app)
      .put(url)
      .attach('file', Buffer.from('GIF89a......'), { filename: 'x.gif', contentType: 'image/gif' });
    expect(gif.status).toBe(400);

    const heavy = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const tooBig = await request(app).put(url).attach('file', heavy, { filename: 'x.png', contentType: 'image/png' });
    expect(tooBig.status).toBe(413);

    const missing = await request(app).put(url);
    expect(missing.status).toBe(400);

    const unknownKind = await request(app)
      .put(`${base(TENANT_A)}/syndic-mandating-agencies/${mandant.id}/images/photo`)
      .attach('file', PNG, { filename: 'x.png', contentType: 'image/png' });
    expect(unknownKind.status).toBe(404);
    expect(mockDb.mandants[0].signaturePath ?? null).toBeNull();
  });

  it("répond 404 à la lecture ou au dépôt d'une image d'une autre agence", async () => {
    const other = await createMandant(TENANT_B, 'Agence Beta');
    const otherUrl = `${base(TENANT_B)}/syndic-mandating-agencies/${other.id}/images/logo`;
    expect(
      (await request(app).put(otherUrl).attach('file', PNG, { filename: 'l.png', contentType: 'image/png' })).status
    ).toBe(200);

    const crossUrl = `${base(TENANT_A)}/syndic-mandating-agencies/${other.id}/images/logo`;
    expect((await request(app).get(crossUrl)).status).toBe(404);
    expect(
      (await request(app).put(crossUrl).attach('file', PNG, { filename: 'l.png', contentType: 'image/png' })).status
    ).toBe(404);
    expect((await request(app).delete(crossUrl)).status).toBe(404);

    // Logo de copropriété : même règle.
    await request(app)
      .put(`${base(TENANT_B)}/syndics/${SYNDIC_B}/logo`)
      .attach('file', PNG, { filename: 'l.png', contentType: 'image/png' });
    expect((await request(app).get(`${base(TENANT_A)}/syndics/${SYNDIC_B}/logo`)).status).toBe(404);
    expect((await request(app).get(`${base(TENANT_B)}/syndics/${SYNDIC_B}/logo`)).status).toBe(200);
  });

  it('gère le logo d’une copropriété sans exposer de chemin', async () => {
    const url = `${base(TENANT_A)}/syndics/${SYNDIC_A}/logo`;
    const res = await request(app).put(url).attach('file', PNG, { filename: 'l.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: SYNDIC_A,
      hasLogo: true,
      logoUrl: `/tenants/${TENANT_A}/syndics/${SYNDIC_A}/logo`
    });
    expect(mockDb.syndicates[0].logoPath).toMatch(new RegExp(`^branding/${TENANT_A}/syndics/${SYNDIC_A}/`));
    const removed = await request(app).delete(url);
    expect(removed.body.data.hasLogo).toBe(false);
  });

  it("gère la signature et le cachet de l'agence", async () => {
    const identity = await request(app).get(`${base(TENANT_A)}/document-identity`);
    expect(identity.status).toBe(200);
    expect(identity.body.data).toEqual({
      hasLogo: false,
      logoUrl: null,
      hasSignature: false,
      hasStamp: false,
      signatureUrl: null,
      stampUrl: null
    });

    const stamp = await request(app)
      .put(`${base(TENANT_A)}/document-identity/images/stamp`)
      .attach('file', PNG, { filename: 'cachet.png', contentType: 'image/png' });
    expect(stamp.status).toBe(200);
    expect(stamp.body.data).toEqual(
      expect.objectContaining({ hasStamp: true, stampUrl: `/tenants/${TENANT_A}/document-identity/images/stamp` })
    );
    expectNoPath(stamp.body);
    expect(mockDb.tenants[0].documentStampPath).toMatch(new RegExp(`^branding/${TENANT_A}/agence/cachet-`));

    const read = await request(app).get(`${base(TENANT_A)}/document-identity/images/stamp`);
    expect(read.status).toBe(200);
    expect((await request(app).get(`${base(TENANT_B)}/document-identity/images/stamp`)).status).toBe(404);
    // Le logo de l'agence reste celui de sa fiche : pas de dépôt ici.
    expect(
      (
        await request(app)
          .put(`${base(TENANT_A)}/document-identity/images/logo`)
          .attach('file', PNG, { filename: 'l.png', contentType: 'image/png' })
      ).status
    ).toBe(404);
  });
});

describe('rattachement d’une copropriété à un mandant', () => {
  it('accepte un mandant de la même agence, puis le détache avec null', async () => {
    const mandant = await createMandant(TENANT_A, 'Agence Alpha');
    await updateSyndicateByTenant(TENANT_A, SYNDIC_A, { mandatingAgencyId: mandant.id });
    expect(mockDb.syndicates[0].mandatingAgencyId).toBe(mandant.id);
    await updateSyndicateByTenant(TENANT_A, SYNDIC_A, { mandatingAgencyId: null });
    expect(mockDb.syndicates[0].mandatingAgencyId).toBeNull();
  });

  it("refuse le mandant d'une autre agence avec le même 404 qu'un mandant inexistant", async () => {
    const other = await createMandant(TENANT_B, 'Agence Beta');
    await expect(updateSyndicateByTenant(TENANT_A, SYNDIC_A, { mandatingAgencyId: other.id })).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(
      updateSyndicateByTenant(TENANT_A, SYNDIC_A, { mandatingAgencyId: randomUUID() })
    ).rejects.toMatchObject({
      statusCode: 404
    });
    expect(mockDb.syndicates[0].mandatingAgencyId).toBeNull();
  });
});
