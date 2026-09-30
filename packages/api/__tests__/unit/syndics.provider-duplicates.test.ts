/**
 * BUG-2026-09-30-059 : un nom de prestataire en doublon (casse et espaces de
 * bord ignores) est refuse en 409 avec le champ fautif ; meme regle pour un
 * contrat actif qui se chevauche. Une autre agence peut reutiliser le nom.
 */

type Provider = { id: string; tenantId: string; name: string };

jest.mock('@prisma/client', () => {
  const providers: Provider[] = [];
  const contracts: any[] = [];
  let seq = 0;
  const prisma: any = {
    __providers: providers,
    __contracts: contracts,
    syndicate: { findFirst: jest.fn(async () => ({ id: 's1' })) },
    serviceProvider: {
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          providers.find(
            p =>
              p.tenantId === where.tenantId &&
              (where.id?.not ? p.id !== where.id.not : where.id ? p.id === where.id : true) &&
              (!where.name?.equals || p.name.toLowerCase() === where.name.equals.toLowerCase())
          ) ?? null
        );
      }),
      create: jest.fn(async ({ data }: any) => {
        const provider = { id: `p${++seq}`, ...data };
        providers.push(provider);
        return provider;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const provider = providers.find(p => p.id === where.id)!;
        Object.assign(provider, data);
        return provider;
      })
    },
    maintenanceContract: {
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          contracts.find(
            c =>
              c.syndicateId === where.syndicateId &&
              c.providerId === where.providerId &&
              c.status === 'ACTIVE' &&
              c.nature.toLowerCase() === where.nature.equals.toLowerCase() &&
              (!where.startDate?.lte || c.startDate <= where.startDate.lte) &&
              (c.endDate === null || c.endDate >= where.OR[1].endDate.gte)
          ) ?? null
        );
      }),
      create: jest.fn(async ({ data }: any) => {
        const contract = { id: `c${++seq}`, status: 'ACTIVE', endDate: null, ...data };
        contracts.push(contract);
        return contract;
      })
    }
  };
  return { PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma };
});

import {
  createMaintenanceContract,
  createServiceProvider,
  updateServiceProviderByTenant
} from '../../src/lib/syndics/queries';
import { ConflictError } from '../../src/middleware/error-middleware';

const { __mockPrisma: mockPrisma } = jest.requireMock('@prisma/client') as { __mockPrisma: any };

describe('Doublons de prestataires (BUG-059)', () => {
  beforeEach(() => {
    mockPrisma.__providers.length = 0;
    mockPrisma.__contracts.length = 0;
  });

  it('refuse un nom deja pris (casse et espaces ignores) avec le champ name', async () => {
    await createServiceProvider('tenant-a', { name: 'Ivoire Clean Services' });
    const error = await createServiceProvider('tenant-a', { name: '  ivoire clean SERVICES ' }).catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Un prestataire nommé « ivoire clean SERVICES » existe déjà dans votre agence.');
    expect(error.errors).toEqual([{ field: 'name', message: error.message }]);
    expect(mockPrisma.__providers).toHaveLength(1);
  });

  it('accepte le meme nom dans une autre agence', async () => {
    await createServiceProvider('tenant-a', { name: 'Ivoire Clean Services' });
    await expect(createServiceProvider('tenant-b', { name: 'Ivoire Clean Services' })).resolves.toBeTruthy();
    expect(mockPrisma.__providers).toHaveLength(2);
  });

  it('refuse un renommage vers un nom existant, pas vers son propre nom', async () => {
    const first = await createServiceProvider('tenant-a', { name: 'Ascenseurs Pro' });
    const second = await createServiceProvider('tenant-a', { name: 'Nettoyage Plus' });
    await expect(
      updateServiceProviderByTenant('tenant-a', second.id, { name: 'ascenseurs pro' })
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(updateServiceProviderByTenant('tenant-a', first.id, { name: 'ASCENSEURS PRO' })).resolves.toBeTruthy();
  });

  it('refuse un contrat actif de meme nature dont la periode chevauche', async () => {
    const provider = await createServiceProvider('tenant-a', { name: 'Ascenseurs Pro' });
    const base = { syndicateId: 's1', providerId: provider.id, currency: 'XOF', renewalAlertDays: 30 };
    await createMaintenanceContract('tenant-a', {
      ...base,
      nature: 'Entretien ascenseur',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z')
    });

    const error = await createMaintenanceContract('tenant-a', {
      ...base,
      nature: 'entretien ASCENSEUR',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2027-05-31T00:00:00.000Z')
    }).catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.errors[0].field).toBe('nature');

    // Periode suivante (apres la fin du premier) : autorisee.
    await expect(
      createMaintenanceContract('tenant-a', {
        ...base,
        nature: 'Entretien ascenseur',
        startDate: new Date('2027-01-01T00:00:00.000Z'),
        endDate: new Date('2027-12-31T00:00:00.000Z')
      })
    ).resolves.toBeTruthy();
  });
});
