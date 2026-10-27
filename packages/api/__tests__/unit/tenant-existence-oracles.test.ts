/**
 * Oracles d'existence d'agence (suite de la PR #185) : une route ne doit pas
 * repondre differemment selon qu'une agence existe, est suspendue ou n'existe
 * pas, ni laisser passer un message Prisma brut.
 */
import * as fs from 'fs';
import * as path from 'path';

const mockPrisma = {
  tenant: { findFirst: jest.fn(), findUnique: jest.fn() },
  tenantClient: { findUnique: jest.fn(), delete: jest.fn() }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import { getTenantBySlug, removeTenantClient } from '../../src/services/tenant-service';
import { NotFoundError } from '../../src/middleware/error-middleware';

beforeEach(() => jest.clearAllMocks());

describe('GET /api/tenants/slug/:slug — getTenantBySlug', () => {
  it("ne cherche qu'une agence active (isActive et statut ACTIVE)", async () => {
    mockPrisma.tenant.findFirst.mockResolvedValue(null);
    await expect(getTenantBySlug('agence-suspendue')).resolves.toBeNull();
    expect(mockPrisma.tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'agence-suspendue', isActive: true, status: 'ACTIVE' } })
    );
    expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('ne renvoie que la fiche publique', async () => {
    mockPrisma.tenant.findFirst.mockResolvedValue({ id: 't1', name: 'A', slug: 'a' });
    await getTenantBySlug('a');
    const select = mockPrisma.tenant.findFirst.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(
      ['brandingPrimaryColor', 'city', 'country', 'id', 'logoUrl', 'name', 'slug', 'type', 'website'].sort()
    );
  });
});

describe('DELETE /api/tenants/:tenantId/unregister — removeTenantClient', () => {
  it('leve la meme NotFoundError neutre pour une agence inconnue ou un non-client, sans erreur Prisma', async () => {
    mockPrisma.tenantClient.findUnique.mockResolvedValue(null);
    const erreurs: unknown[] = [];
    for (const tenantId of ['agence-inexistante', 'agence-dont-je-ne-suis-pas-client']) {
      erreurs.push(await removeTenantClient('user-1', tenantId).catch(e => e));
    }
    for (const e of erreurs) {
      expect(e).toBeInstanceOf(NotFoundError);
      expect((e as Error).message).toBe('Compte client introuvable pour cette agence.');
      expect((e as Error).message).not.toMatch(/P2025|prisma|Record to delete/i);
    }
    expect(mockPrisma.tenantClient.delete).not.toHaveBeenCalled();
  });

  it('supprime le rattachement sans historique', async () => {
    mockPrisma.tenantClient.findUnique.mockResolvedValue({
      id: 'c1',
      _count: { primaryLeases: 0, ownerLeases: 0 },
      managementTerms: null
    });
    mockPrisma.tenantClient.delete.mockResolvedValue({});
    await removeTenantClient('user-1', 't1');
    expect(mockPrisma.tenantClient.delete).toHaveBeenCalledWith({
      where: { userId_tenantId: { userId: 'user-1', tenantId: 't1' } }
    });
  });
});

describe('Middleware mort', () => {
  it("property-ownership-middleware.ts est supprime (il repondait 403 ou 404 selon l'existence du bien)", () => {
    const file = path.join(__dirname, '../../src/middleware/property-ownership-middleware.ts');
    expect(fs.existsSync(file)).toBe(false);
  });
});
