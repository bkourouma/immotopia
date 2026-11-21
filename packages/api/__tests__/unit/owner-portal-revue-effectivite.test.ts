/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Revue d'effectivité du portail propriétaire (lot 4) — non-régression.
 *
 *  - détail d'un bien / d'un ticket : réponse restreinte par `select` (ni notes
 *    internes du bail, ni `terms_json`, ni JSON `details` des fiches client) ;
 *  - identifiant mal formé (colonnes uuid) : 404 sans appel à la base ;
 *  - bornes de période : le dernier jour reste inclus, une date invalide est un 400 ;
 *  - export avec une seule borne : la période est appliquée ;
 *  - rapports : format invalide 400, bail d'une autre agence exclu de l'occupation ;
 *  - préférences : valeur non booléenne 400.
 */

const mockDb = {
  property: { findUnique: jest.fn(), findMany: jest.fn() },
  rentalLease: { findFirst: jest.fn(), findMany: jest.fn() },
  rentalPayment: { aggregate: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  rentalInstallment: { findMany: jest.fn() },
  rentalSecurityDeposit: { findFirst: jest.fn() },
  rentalDocument: { findFirst: jest.fn() },
  maintenanceTicket: { findFirst: jest.fn(), findMany: jest.fn() }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockDb }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/document-generation-service', () => ({ getDocumentFile: jest.fn() }));

const mockExportData = jest.fn(async (..._args: any[]) => Buffer.from('ok'));
const mockOccupancyCsv = jest.fn(async (..._args: any[]) => Buffer.from('ok'));
jest.mock('../../src/utils/report-generator', () => ({
  generateRevenueReportPDF: jest.fn(),
  generateRevenueReportCSV: jest.fn(),
  generateRevenueReportExcel: jest.fn(),
  generateOccupancyReportPDF: jest.fn(),
  generateOccupancyReportCSV: (...a: any[]) => (mockOccupancyCsv as any)(...a),
  generateOccupancyReportExcel: jest.fn(),
  exportData: (...a: any[]) => (mockExportData as any)(...a)
}));

import { OwnerPortalService } from '../../src/services/owner-portal-service';
import { OwnerPortalController, parsePortalDateBoundary } from '../../src/controllers/owner-portal-controller';
import { BadRequestError } from '../../src/middleware/error-middleware';

const service = new OwnerPortalService();
const TENANT = 'tenant-1';
const OWN = 'prop-own';
const UUID = '00000000-0000-4000-8000-0000000000b1';

beforeEach(() => jest.clearAllMocks());

/** Parcourt un objet de sélection Prisma et rend tous les noms de champs demandés. */
function selectedKeys(node: any, acc: string[] = []): string[] {
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      acc.push(key);
      selectedKeys(value, acc);
    }
  }
  return acc;
}

describe("détail d'un bien : pas de fuite de données internes", () => {
  beforeEach(() => {
    mockDb.property.findUnique.mockResolvedValue({ id: OWN, title: 'Villa', media: [], documents: [] });
    mockDb.rentalLease.findFirst.mockResolvedValue(null);
    mockDb.rentalLease.findMany.mockResolvedValue([]);
    mockDb.rentalPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockDb.rentalPayment.findFirst.mockResolvedValue(null);
    mockDb.maintenanceTicket.findMany.mockResolvedValue([]);
  });

  it('bien, bail courant et historique sont lus par `select`, sans notes ni JSON internes', async () => {
    await service.getPropertyDetails(OWN, [OWN], TENANT);

    const propertyArgs = mockDb.property.findUnique.mock.calls[0][0];
    expect(propertyArgs.include).toBeUndefined();
    const propertyKeys = selectedKeys(propertyArgs.select);
    for (const forbidden of ['ownerUserId', 'internalReference', 'typeSpecificData', 'qualityScore', 'version']) {
      expect(propertyKeys).not.toContain(forbidden);
    }

    const currentLeaseArgs = mockDb.rentalLease.findFirst.mock.calls[0][0];
    const historyArgs = mockDb.rentalLease.findMany.mock.calls[0][0];
    for (const args of [currentLeaseArgs, historyArgs]) {
      expect(args.include).toBeUndefined();
      const keys = selectedKeys(args.select);
      for (const forbidden of [
        'notes',
        'terms_json',
        'created_by_user_id',
        'details',
        'ownerTaxStatus',
        'passwordHash'
      ]) {
        expect(keys).not.toContain(forbidden);
      }
      expect(keys).toContain('fullName');
    }
  });

  it('un bien hors périmètre ne touche pas la base', async () => {
    await expect(service.getPropertyDetails('autre', [OWN], TENANT)).rejects.toThrow(/non trouvée/);
    expect(mockDb.property.findUnique).not.toHaveBeenCalled();
  });
});

describe("détail d'un ticket : réponse restreinte", () => {
  it('ne charge ni le bien complet, ni le bail, ni la fiche locataire', async () => {
    mockDb.maintenanceTicket.findFirst.mockResolvedValue({ id: UUID, attachments: [], comments: [] });
    await service.getMaintenanceTicketDetails(UUID, [OWN], TENANT);

    const args = mockDb.maintenanceTicket.findFirst.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    const keys = selectedKeys(args.select);
    for (const forbidden of ['lease', 'primaryRenter', 'details', 'resolution_notes', 'tenant_contact_id']) {
      expect(keys).not.toContain(forbidden);
    }
    expect(args.select.property).toEqual({ select: { id: true, address: true, title: true } });
    expect(args.where.property_id).toEqual({ in: [OWN] });
    expect(args.where.tenant_id).toBe(TENANT);
  });

  it('ne demande ni e-mail ni identifiant des personnes, et réduit la réponse à des noms', async () => {
    const staff = { id: 'u-1', email: 'agent@agence.test', fullName: 'Awa Agent' };
    mockDb.maintenanceTicket.findFirst.mockResolvedValue({
      id: UUID,
      attachments: [],
      comments: [
        { id: 'c1', authorUser: staff, authorContact: null },
        {
          id: 'c2',
          authorUser: null,
          authorContact: { id: 'ct', firstName: 'Moi', lastName: 'Locataire', email: 'moi@exemple.test' }
        }
      ],
      statusHistory: [{ id: 'h1', changedByUser: staff }],
      assignedToUser: staff,
      assignedVendor: { id: 'v1', name: 'Plomberie', phone: '0700000000', email: 'v@plomberie.test' }
    });

    const out: any = (await service.getMaintenanceTicketDetails(UUID, [OWN], TENANT)).ticket;

    const args = mockDb.maintenanceTicket.findFirst.mock.calls[0][0];
    const keys = selectedKeys(args.select);
    expect(keys).not.toContain('email');
    expect(args.select.assignedToUser).toEqual({ select: { fullName: true } });
    expect(out.assignedToUser).toEqual({ fullName: 'Awa Agent' });
    expect(out.comments[0].authorUser).toEqual({ fullName: 'Awa Agent' });
    expect(out.comments[1].authorContact).toEqual({ firstName: 'Moi', lastName: 'Locataire' });
    expect(out.statusHistory[0].changedByUser).toEqual({ fullName: 'Awa Agent' });
    expect(out.assignedVendor).toEqual({ name: 'Plomberie', phone: '0700000000' });
    const json = JSON.stringify(out);
    for (const leaked of ['agence.test', 'exemple.test', 'plomberie.test', 'u-1', '"ct"', '"v1"']) {
      expect(json).not.toContain(leaked);
    }
  });
});

describe('identifiant mal formé : 404, jamais une erreur de base', () => {
  it.each([
    ['getLeaseDetails', () => service.getLeaseDetails('abc', [OWN], TENANT), /Bail non trouvé/],
    ['getPaymentDetails', () => service.getPaymentDetails('abc', [OWN], TENANT), /Paiement non trouvé/],
    ['getDepositMovements', () => service.getDepositMovements('abc', [OWN], TENANT), /Dépôt de garantie non trouvé/],
    [
      'getMaintenanceTicketDetails',
      () => service.getMaintenanceTicketDetails('abc', [OWN], TENANT),
      /Ticket de maintenance non trouvé/
    ],
    ['downloadDocument', () => service.downloadDocument('abc', [OWN], TENANT), /Document non trouvé/]
  ])('%s', async (_name, call, message) => {
    await expect(call()).rejects.toThrow(message);
    expect(mockDb.rentalLease.findFirst).not.toHaveBeenCalled();
    expect(mockDb.maintenanceTicket.findFirst).not.toHaveBeenCalled();
    expect(mockDb.rentalDocument.findFirst).not.toHaveBeenCalled();
  });
});

describe('bornes de période', () => {
  it('un jour seul en fin de période couvre toute la journée (UTC)', () => {
    expect(parsePortalDateBoundary('2026-11-20', 'endDate', true)?.toISOString()).toBe('2026-11-20T23:59:59.999Z');
    expect(parsePortalDateBoundary('2026-11-20', 'startDate', false)?.toISOString()).toBe('2026-11-20T00:00:00.000Z');
  });

  it('absent ou vide : undefined ; ISO complet : tel quel', () => {
    expect(parsePortalDateBoundary(undefined, 'x', true)).toBeUndefined();
    expect(parsePortalDateBoundary('', 'x', true)).toBeUndefined();
    expect(parsePortalDateBoundary('2026-11-20T10:00:00.000Z', 'x', true)?.toISOString()).toBe(
      '2026-11-20T10:00:00.000Z'
    );
  });

  it.each(['abc', '2026-02-31', '20/11/2026', 42, {}])('%p : 400', value => {
    expect(() => parsePortalDateBoundary(value, 'endDate', true)).toThrow(BadRequestError);
  });
});

function fakeRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.setHeader = jest.fn();
  res.send = jest.fn();
  return res;
}

const portalReq = (body: any, query: any = {}): any => ({
  body,
  query,
  ownerPortal: { tenantClientId: 'tc-1', tenantId: TENANT, propertyIds: [OWN], availableTenantIds: [TENANT] }
});

describe('contrôleur : entrées invalides = 400', () => {
  const controller = new OwnerPortalController();

  it('rapport de revenus : format inconnu', async () => {
    const res = fakeRes();
    await controller.generateRevenueReport(
      portalReq({ startDate: '2026-01-01', endDate: '2026-01-31', format: 'docx' }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb.rentalPayment.findMany).not.toHaveBeenCalled();
  });

  it('rapport de revenus : date invalide ou période inversée', async () => {
    for (const body of [
      { startDate: 'pas-une-date', endDate: '2026-01-31', format: 'csv' },
      { startDate: '2026-02-01', endDate: '2026-01-31', format: 'csv' }
    ]) {
      const res = fakeRes();
      await controller.generateRevenueReport(portalReq(body), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockDb.rentalPayment.findMany).not.toHaveBeenCalled();
  });

  it("rapport d'occupation : format inconnu", async () => {
    const res = fakeRes();
    await controller.generateOccupancyReport(portalReq({ asOfDate: '2026-01-31', format: 'xlsx' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb.property.findMany).not.toHaveBeenCalled();
  });

  it('revenus : une date invalide est un 400, pas un 500', async () => {
    const res = fakeRes();
    await controller.getRevenues(portalReq({}, { endDate: 'zzz' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('revenus : la fin de période inclut son dernier jour', async () => {
    mockDb.rentalPayment.findMany.mockResolvedValue([]);
    const res = fakeRes();
    await controller.getRevenues(portalReq({}, { startDate: '2026-11-01', endDate: '2026-11-20' }), res);
    const where = mockDb.rentalPayment.findMany.mock.calls[0][0].where;
    expect(where.succeeded_at.lte.toISOString()).toBe('2026-11-20T23:59:59.999Z');
    expect(where.succeeded_at.gte.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('biens : un statut hors enum est un 400', async () => {
    const res = fakeRes();
    await controller.getProperties(portalReq({}, { status: 'NOPE' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb.property.findMany).not.toHaveBeenCalled();
  });

  it('préférences : une valeur non booléenne est un 400', async () => {
    const res = fakeRes();
    await controller.updatePreferences(portalReq({ newsletterConsent: 'oui' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('exports et rapports : périmètre et période', () => {
  it("export avec une seule borne : l'autre borne est complétée, la période s'applique", async () => {
    await service.exportData([OWN], TENANT, {
      entityType: 'payments',
      startDate: new Date('2026-05-01T00:00:00.000Z'),
      format: 'csv'
    });
    const filters = mockExportData.mock.calls[0][3];
    expect(filters.startDate.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(filters.endDate.getUTCFullYear()).toBe(9999);

    mockExportData.mockClear();
    await service.exportData([OWN], TENANT, {
      entityType: 'leases',
      endDate: new Date('2026-05-31T23:59:59.999Z'),
      format: 'csv'
    });
    const onlyEnd = mockExportData.mock.calls[0][3];
    expect(onlyEnd.startDate.getTime()).toBe(0);
    expect(onlyEnd.endDate.toISOString()).toBe('2026-05-31T23:59:59.999Z');
  });

  it('export sans aucun bien : 404 typé, pas une erreur serveur', async () => {
    await expect(service.exportData([], TENANT, { entityType: 'payments', format: 'csv' })).rejects.toMatchObject({
      statusCode: 404
    });
    expect(mockExportData).not.toHaveBeenCalled();
  });

  it("occupation : ne retient que les baux de l'agence résolue", async () => {
    mockDb.property.findMany.mockResolvedValue([]);
    await service.generateOccupancyReport([OWN], TENANT, { asOfDate: new Date('2026-09-30'), format: 'csv' });
    const include = mockDb.property.findMany.mock.calls[0][0].include;
    expect(include.rentalLeases.where.tenant_id).toBe(TENANT);
  });
});

describe('tableau de bord : échéance du jour', () => {
  it("une échéance due aujourd'hui reste dans les paiements à venir", async () => {
    mockDb.property.findMany.mockResolvedValue([]);
    mockDb.rentalPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockDb.rentalPayment.findMany.mockResolvedValue([]);
    mockDb.rentalInstallment.findMany.mockResolvedValue([]);
    mockDb.maintenanceTicket.findMany.mockResolvedValue([]);

    await service.getDashboard([OWN], TENANT);

    const where = mockDb.rentalInstallment.findMany.mock.calls[0][0].where;
    const lowerBound: Date = where.due_date.gte;
    expect(lowerBound.getHours()).toBe(0);
    expect(lowerBound.getMinutes()).toBe(0);
    expect(lowerBound.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
