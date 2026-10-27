/**
 * Lot C : un paramètre de requête invalide sur les contrôleurs biens publics, recherche de biens,
 * rapprochement CRM, géographie et portail propriétaire répond 400 typé, sans appeler le service ;
 * un paramètre valide traverse tel quel.
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const mockSvc = {
  getPublishedProperties: jest.fn(),
  searchProperties: jest.fn(),
  matchPropertiesForDeal: jest.fn(),
  searchLocations: jest.fn(),
  getRevenuesByMonth: jest.fn()
};

jest.mock('../../src/services/property-publication-service', () => ({
  getPublishedProperties: (...a: any[]) => mockSvc.getPublishedProperties(...a),
  getPublishedProperty: jest.fn()
}));
jest.mock('../../src/services/property-search-service', () => ({
  searchProperties: (...a: any[]) => mockSvc.searchProperties(...a)
}));
jest.mock('../../src/services/crm-matching-service', () => ({
  matchPropertiesForDeal: (...a: any[]) => mockSvc.matchPropertiesForDeal(...a),
  addPropertyToShortlist: jest.fn(),
  updatePropertyMatchStatus: jest.fn(),
  getDealPropertyMatches: jest.fn()
}));
jest.mock('../../src/services/geographic-service', () => ({
  searchLocations: (...a: any[]) => mockSvc.searchLocations(...a),
  getRegionsByCountry: jest.fn(),
  getCommunesByRegion: jest.fn(),
  getAllCommunes: jest.fn(),
  getLocationByCommuneId: jest.fn()
}));
jest.mock('../../src/services/owner-portal-service', () => ({
  OwnerPortalService: jest.fn().mockImplementation(() => ({
    getRevenuesByMonth: (...a: any[]) => mockSvc.getRevenuesByMonth(...a)
  }))
}));

import { getPublishedPropertiesHandler } from '../../src/controllers/property-public-controller';
import { searchPropertiesHandler } from '../../src/controllers/property-search-controller';
import { matchPropertiesHandler } from '../../src/controllers/crm-matching-controller';
import { searchLocationsHandler } from '../../src/controllers/geographic-controller';
import { OwnerPortalController } from '../../src/controllers/owner-portal-controller';

function run(handler: any, query: Record<string, string>, body: any = {}, extra: Record<string, unknown> = {}) {
  const req: any = {
    query,
    params: { tenantId: 'tenant-a', dealId: 'deal-1' },
    body,
    tenantContext: { tenantId: 'tenant-a' },
    user: { userId: 'user-1' },
    headers: {},
    ...extra
  };
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (b: any) => {
    res.body = b;
    return res;
  };
  const next = (err: any) => {
    res.statusCode = err?.statusCode ?? 500;
    res.body = { success: false, message: err?.message };
  };
  return Promise.resolve(handler(req, res, next)).then(() => res);
}

const ownerController = new OwnerPortalController();
const ownerPortal = { propertyIds: ['p1'], tenantId: 'tenant-a' };

beforeEach(() => {
  jest.clearAllMocks();
  mockSvc.getPublishedProperties.mockResolvedValue({ properties: [], pagination: {} });
  mockSvc.searchProperties.mockResolvedValue({ properties: [], pagination: {} });
  mockSvc.matchPropertiesForDeal.mockResolvedValue([]);
  mockSvc.searchLocations.mockResolvedValue([]);
  mockSvc.getRevenuesByMonth.mockResolvedValue([]);
});

describe.each([
  [
    'biens publics ?propertyType',
    getPublishedPropertiesHandler,
    { propertyType: 'NOPE' },
    {},
    {},
    mockSvc.getPublishedProperties
  ],
  [
    'biens publics ?transactionMode',
    getPublishedPropertiesHandler,
    { transactionMode: 'NOPE' },
    {},
    {},
    mockSvc.getPublishedProperties
  ],
  [
    'biens publics ?priceMin',
    getPublishedPropertiesHandler,
    { priceMin: 'abc' },
    {},
    {},
    mockSvc.getPublishedProperties
  ],
  ['biens publics ?rooms', getPublishedPropertiesHandler, { rooms: '2x' }, {}, {}, mockSvc.getPublishedProperties],
  ['recherche de biens ?page', searchPropertiesHandler, { page: 'abc' }, {}, {}, mockSvc.searchProperties],
  ['recherche de biens ?limit', searchPropertiesHandler, { limit: '0' }, {}, {}, mockSvc.searchProperties],
  ['rapprochement CRM threshold', matchPropertiesHandler, {}, { threshold: 'x' }, {}, mockSvc.matchPropertiesForDeal],
  ['géographie ?limit', searchLocationsHandler, { limit: 'beaucoup' }, {}, {}, mockSvc.searchLocations],
  [
    'portail propriétaire ?year',
    ownerController.getRevenuesByMonth.bind(ownerController),
    { year: 'abcd' },
    {},
    { ownerPortal },
    mockSvc.getRevenuesByMonth
  ]
])('%s invalide', (_label, handler, query, body, extra, service) => {
  it('répond 400 sans appeler le service', async () => {
    const res = await run(handler, query as Record<string, string>, body, extra as Record<string, unknown>);
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(service).not.toHaveBeenCalled();
  });
});

describe('paramètres valides', () => {
  it('biens publics : enums et nombres traversent', async () => {
    const res = await run(getPublishedPropertiesHandler, {
      propertyType: 'APPARTEMENT',
      priceMin: '1000.5',
      rooms: '3',
      transactionMode: 'SALE'
    });
    expect(res.statusCode).toBe(200);
    expect(mockSvc.getPublishedProperties.mock.calls[0][0]).toMatchObject({
      propertyType: 'APPARTEMENT',
      priceMin: 1000.5,
      rooms: 3,
      transactionMode: 'SALE'
    });
  });

  it('recherche de biens : pagination par défaut', async () => {
    await run(searchPropertiesHandler, {});
    expect(mockSvc.searchProperties.mock.calls[0][0]).toMatchObject({ page: 1, limit: 20 });
  });

  it('rapprochement CRM : valeurs par défaut', async () => {
    await run(matchPropertiesHandler, {});
    expect(mockSvc.matchPropertiesForDeal).toHaveBeenCalledWith('tenant-a', 'deal-1', 40, 10);
  });

  it('portail propriétaire : année fournie', async () => {
    await run(ownerController.getRevenuesByMonth.bind(ownerController), { year: '2025' }, {}, { ownerPortal });
    expect(mockSvc.getRevenuesByMonth).toHaveBeenCalledWith(['p1'], 'tenant-a', 2025);
  });
});
