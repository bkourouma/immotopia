/**
 * `lib/patrimoine/insurance/maintenance-log-service.ts` et ses schémas Zod
 * (lot B1, spec 032) : isolation par agence, cohérence des dates, tri.
 *
 * Mock à la frontière `utils/database`.
 */

const propertyFindFirst = jest.fn();
const vendorFindFirst = jest.fn();
const documentFindFirst = jest.fn();
const entryFindFirst = jest.fn();
const entryFindMany = jest.fn();
const entryCreate = jest.fn();
const entryUpdateMany = jest.fn();
const entryDeleteMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: { findFirst: (...a: any[]) => propertyFindFirst(...a) },
    maintenanceVendor: { findFirst: (...a: any[]) => vendorFindFirst(...a) },
    propertyDocument: { findFirst: (...a: any[]) => documentFindFirst(...a) },
    maintenanceLogEntry: {
      findFirst: (...a: any[]) => entryFindFirst(...a),
      findMany: (...a: any[]) => entryFindMany(...a),
      create: (...a: any[]) => entryCreate(...a),
      updateMany: (...a: any[]) => entryUpdateMany(...a),
      deleteMany: (...a: any[]) => entryDeleteMany(...a)
    }
  }
}));

import { NotFoundError, BadRequestError } from '../../src/middleware/error-middleware';
import {
  createMaintenanceLogEntry,
  deleteMaintenanceLogEntry,
  exportMaintenanceLogCsv,
  listMaintenanceLog,
  updateMaintenanceLogEntry
} from '../../src/lib/patrimoine/insurance/maintenance-log-service';
import {
  createMaintenanceLogEntrySchema,
  updateMaintenanceLogEntrySchema
} from '../../src/lib/patrimoine/insurance/maintenance-log-schemas';

const TENANT = 'tenant-1';
const VENDOR_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    tenantId: TENANT,
    propertyId: 'prop-1',
    category: 'PLUMBING',
    performedAt: new Date('2026-09-01T00:00:00.000Z'),
    vendorId: null,
    vendor: null,
    cost: '15000.50',
    currency: 'XOF',
    description: 'Remplacement du chauffe-eau',
    nextDueDate: null,
    warrantyEndDate: null,
    documentId: null,
    createdByUserId: 'u1',
    createdAt: new Date('2026-09-02T00:00:00.000Z'),
    updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    ...overrides
  };
}

function createInput(overrides: Record<string, unknown> = {}) {
  return createMaintenanceLogEntrySchema.parse({
    propertyId: 'prop-1',
    category: 'PLUMBING',
    performedAt: '2026-09-01',
    description: 'Remplacement du chauffe-eau',
    ...overrides
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  propertyFindFirst.mockResolvedValue({ id: 'prop-1', tenantId: TENANT, internalReference: 'REF-1' });
  vendorFindFirst.mockResolvedValue({ id: 'v1' });
  documentFindFirst.mockResolvedValue({ id: 'doc-1' });
  entryFindFirst.mockResolvedValue(row());
  entryFindMany.mockResolvedValue([]);
  entryCreate.mockImplementation(async ({ data }: any) => row({ ...data, vendor: null }));
  entryUpdateMany.mockResolvedValue({ count: 1 });
  entryDeleteMany.mockResolvedValue({ count: 1 });
});

describe('schémas', () => {
  it('rejette un champ inconnu (tenantId, createdByUserId)', () => {
    expect(() => createMaintenanceLogEntrySchema.parse({ ...createInput(), tenantId: 'x' })).toThrow();
    expect(() => updateMaintenanceLogEntrySchema.parse({ createdByUserId: 'x' })).toThrow();
  });

  it('accepte AAAA-MM-JJ et ISO complet', () => {
    expect(createInput({ performedAt: '2026-09-01T10:00:00.000Z' }).performedAt).toBeInstanceOf(Date);
    expect(() => createInput({ performedAt: '2026-02-31' })).toThrow();
    expect(() => createInput({ performedAt: '2026-9-1' })).toThrow();
    expect(createInput().performedAt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it("rejette échéance et garantie antérieures à l'intervention, accepte l'égalité", () => {
    expect(() => createInput({ nextDueDate: '2026-08-31' })).toThrow();
    expect(() => createInput({ warrantyEndDate: '2026-08-31' })).toThrow();
    expect(() => createInput({ nextDueDate: '2026-09-01', warrantyEndDate: '2026-09-01' })).not.toThrow();
  });

  it('rejette un coût négatif, une description vide et une devise invalide', () => {
    expect(() => createInput({ cost: -1 })).toThrow();
    expect(() => createInput({ cost: 10.123 })).toThrow(); // deux décimales au plus, comme les sinistres
    expect(createInput({ cost: 10.12 }).cost).toBe(10.12);
    expect(() => createInput({ description: '   ' })).toThrow();
    expect(() => createInput({ currency: 'xof' })).toThrow();
  });

  it('vendorId doit être un UUID (@db.Uuid), documentId reste libre', () => {
    expect(() => createInput({ vendorId: 'v-1' })).toThrow();
    expect(createInput({ vendorId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }).vendorId).toBeDefined();
    expect(createInput({ documentId: 'doc-libre' }).documentId).toBe('doc-libre');
  });
});

describe('listMaintenanceLog', () => {
  it('trie par intervention décroissante puis création décroissante, filtré par agence', async () => {
    await listMaintenanceLog(TENANT, { propertyId: 'prop-1', category: 'PLUMBING' });
    const args = entryFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ tenantId: TENANT, propertyId: 'prop-1', category: 'PLUMBING' });
    expect(args.orderBy).toEqual([{ performedAt: 'desc' }, { createdAt: 'desc' }]);
  });

  it('renvoie des montants en nombre et des dates ISO', async () => {
    entryFindMany.mockResolvedValue([
      row({ nextDueDate: new Date('2027-03-01T00:00:00.000Z'), vendor: { id: 'v1', name: 'Plomberie Abidjan' } })
    ]);
    const [dto] = await listMaintenanceLog(TENANT, { propertyId: 'prop-1' });
    expect(dto.cost).toBe(15000.5);
    expect(dto.performedAt).toBe('2026-09-01T00:00:00.000Z');
    expect(dto.nextDueDate).toBe('2027-03-01T00:00:00.000Z');
    expect(dto.vendorName).toBe('Plomberie Abidjan');
  });

  it("bien d'une autre agence : NotFoundError, aucune lecture du carnet", async () => {
    propertyFindFirst.mockResolvedValue(null);
    await expect(listMaintenanceLog(TENANT, { propertyId: 'autre' })).rejects.toBeInstanceOf(NotFoundError);
    expect(entryFindMany).not.toHaveBeenCalled();
  });
});

describe('createMaintenanceLogEntry', () => {
  it('crée avec tenantId et auteur issus du contexte, jamais du corps', async () => {
    await createMaintenanceLogEntry(TENANT, createInput({ cost: 1000 }), 'user-9');
    const data = entryCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: TENANT, createdByUserId: 'user-9', propertyId: 'prop-1', cost: 1000 });
  });

  it("identifiants d'une autre agence : même NotFoundError (bien, prestataire, document)", async () => {
    propertyFindFirst.mockResolvedValueOnce(null);
    await expect(createMaintenanceLogEntry(TENANT, createInput(), 'u')).rejects.toBeInstanceOf(NotFoundError);

    vendorFindFirst.mockResolvedValueOnce(null);
    await expect(createMaintenanceLogEntry(TENANT, createInput({ vendorId: VENDOR_UUID }), 'u')).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(vendorFindFirst).toHaveBeenCalledWith({
      where: { id: VENDOR_UUID, tenant_id: TENANT },
      select: { id: true }
    });

    documentFindFirst.mockResolvedValueOnce(null);
    await expect(createMaintenanceLogEntry(TENANT, createInput({ documentId: 'd-x' }), 'u')).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(documentFindFirst.mock.calls[0][0].where).toEqual({
      id: 'd-x',
      propertyId: 'prop-1',
      OR: [{ tenantId: TENANT }, { tenantId: null }]
    });
    expect(entryCreate).not.toHaveBeenCalled();
  });
});

describe('updateMaintenanceLogEntry', () => {
  it("entrée d'une autre agence : NotFoundError, aucune écriture", async () => {
    entryFindFirst.mockResolvedValue(null);
    await expect(updateMaintenanceLogEntry(TENANT, 'log-x', { description: 'x' })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(entryFindFirst).toHaveBeenCalledWith({ where: { id: 'log-x', tenantId: TENANT } });
    expect(entryUpdateMany).not.toHaveBeenCalled();
  });

  it("refuse (400) une échéance antérieure à l'intervention existante", async () => {
    const patch = updateMaintenanceLogEntrySchema.parse({ nextDueDate: '2026-08-01' });
    await expect(updateMaintenanceLogEntry(TENANT, 'log-1', patch)).rejects.toBeInstanceOf(BadRequestError);
  });

  it("refuse (400) de décaler l'intervention après une échéance déjà posée", async () => {
    entryFindFirst.mockResolvedValue(row({ nextDueDate: new Date('2026-10-01T00:00:00.000Z') }));
    const patch = updateMaintenanceLogEntrySchema.parse({ performedAt: '2026-11-01' });
    await expect(updateMaintenanceLogEntry(TENANT, 'log-1', patch)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('délie le prestataire avec null et ne touche que les champs fournis', async () => {
    await updateMaintenanceLogEntry(TENANT, 'log-1', updateMaintenanceLogEntrySchema.parse({ vendorId: null }));
    expect(entryUpdateMany.mock.calls[0][0].where).toEqual({ id: 'log-1', tenantId: TENANT });
    expect(entryUpdateMany.mock.calls[0][0].data).toEqual({ vendorId: null });
    // Relecture portée par l'agence, jamais par l'id seul.
    expect(entryFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'log-1', tenantId: TENANT } })
    );
    expect(vendorFindFirst).not.toHaveBeenCalled();
  });

  it("entrée supprimée entre la lecture et l'écriture : NotFoundError", async () => {
    entryUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      updateMaintenanceLogEntry(TENANT, 'log-1', updateMaintenanceLogEntrySchema.parse({ description: 'x' }))
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("document d'un autre bien : NotFoundError", async () => {
    documentFindFirst.mockResolvedValueOnce(null);
    await expect(
      updateMaintenanceLogEntry(TENANT, 'log-1', updateMaintenanceLogEntrySchema.parse({ documentId: 'd-x' }))
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('deleteMaintenanceLogEntry', () => {
  it('supprime une entrée de l’agence', async () => {
    await deleteMaintenanceLogEntry(TENANT, 'log-1');
    expect(entryDeleteMany).toHaveBeenCalledWith({ where: { id: 'log-1', tenantId: TENANT } });
  });

  it("entrée d'une autre agence : NotFoundError", async () => {
    entryDeleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteMaintenanceLogEntry(TENANT, 'log-x')).rejects.toBeInstanceOf(NotFoundError);
    expect(entryDeleteMany).toHaveBeenCalledWith({ where: { id: 'log-x', tenantId: TENANT } });
  });
});

describe('exportMaintenanceLogCsv', () => {
  it('produit un CSV et un nom de fichier sûr', async () => {
    propertyFindFirst.mockResolvedValue({ id: 'prop-1', internalReference: 'REF 1/é' });
    entryFindMany.mockResolvedValue([row()]);
    const { csv, filename } = await exportMaintenanceLogCsv(TENANT, 'prop-1');
    expect(csv.startsWith('﻿Date;')).toBe(true);
    expect(filename).toBe('carnet-entretien-REF_1__.csv');
  });

  it("bien d'une autre agence : NotFoundError", async () => {
    propertyFindFirst.mockResolvedValue(null);
    await expect(exportMaintenanceLogCsv(TENANT, 'autre')).rejects.toBeInstanceOf(NotFoundError);
  });
});
