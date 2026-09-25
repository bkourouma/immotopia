/**
 * B4 — `calculateQualityScore` / `getLatestQualityScore` filtrent elles-memes
 * le bien par agence (defense en profondeur), au lieu de faire confiance au
 * seul controleur (`property-controller.ts` verifiait deja via
 * `getPropertyById`, mais rien n'empechait un futur appelant d'oublier ce
 * garde-fou).
 */

const propertyFindUnique = jest.fn();
const qualityScoreFindFirst = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: { findUnique: (...a: any[]) => propertyFindUnique(...a) },
    propertyQualityScore: {
      findFirst: (...a: any[]) => qualityScoreFindFirst(...a),
      create: jest.fn()
    }
  }
}));

jest.mock('../../src/services/property-template-service', () => ({
  getTemplateByType: jest.fn().mockResolvedValue(null)
}));

import { calculateQualityScore, getLatestQualityScore } from '../../src/services/property-quality-service';

function bien(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    tenantId: 'tenant-B',
    mandates: [],
    media: [],
    documents: [],
    description: 'Un bel appartement',
    latitude: 1,
    longitude: 1,
    price: 100000,
    address: '12 rue des Fleurs',
    locationZone: 'Cocody',
    propertyType: 'APPARTEMENT',
    ...overrides
  };
}

beforeEach(() => jest.clearAllMocks());

describe('calculateQualityScore — isolation par agence', () => {
  it("refuse un bien d'une autre agence sans mandat actif", async () => {
    propertyFindUnique.mockResolvedValue(bien({ tenantId: 'tenant-B', mandates: [] }));

    await expect(calculateQualityScore('p1', 'tenant-A')).rejects.toThrow();
  });

  it('accepte un bien de sa propre agence', async () => {
    propertyFindUnique.mockResolvedValue(bien({ tenantId: 'tenant-A' }));

    const result = await calculateQualityScore('p1', 'tenant-A');
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("accepte un bien d'une autre agence quand un mandat actif existe", async () => {
    propertyFindUnique.mockResolvedValue(
      bien({ tenantId: null, mandates: [{ tenantId: 'tenant-A' }] })
    );

    const result = await calculateQualityScore('p1', 'tenant-A');
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('renvoie NotFound quand le bien n\'existe pas du tout', async () => {
    propertyFindUnique.mockResolvedValue(null);

    await expect(calculateQualityScore('p1', 'tenant-A')).rejects.toThrow();
  });
});

describe('getLatestQualityScore — isolation par agence', () => {
  it("refuse de lire le score d'un bien d'une autre agence", async () => {
    propertyFindUnique.mockResolvedValue({ tenantId: 'tenant-B', mandates: [] });

    await expect(getLatestQualityScore('p1', 'tenant-A')).rejects.toThrow();
    expect(qualityScoreFindFirst).not.toHaveBeenCalled();
  });

  it('lit le score de sa propre agence', async () => {
    propertyFindUnique.mockResolvedValue({ tenantId: 'tenant-A', mandates: [] });
    qualityScoreFindFirst.mockResolvedValue({ id: 'score-1', score: 80 });

    const result = await getLatestQualityScore('p1', 'tenant-A');
    expect(result?.id).toBe('score-1');
  });
});
