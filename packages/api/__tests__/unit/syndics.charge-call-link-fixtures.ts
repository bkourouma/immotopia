/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Base en mémoire du lien « Payer cet appel » (spec 042, lot M6). Pas un test :
 * partagé par les suites `syndics.charge-call-link*.test.ts`.
 *
 * Complète `syndics.online-payment-fixtures` (moteur) avec ce que lit le lien :
 * la lecture d'un appel avec sa copropriété et son lot (filtre d'agence
 * réellement appliqué), les fiches de propriété du lot et la table
 * `SecureLink` (création, lecture par empreinte, révocation, compteur). Le
 * service `lib/secure-links` reste le VRAI : jeton, empreinte, expiration et
 * révocation sont donc réellement exercés.
 *
 * Ce qui n'est PAS simulé : PostgreSQL (verrous, concurrence) et la garde
 * d'agence de l'extension Prisma.
 */
import { randomUUID } from 'crypto';
import { getCurrentTenantId } from '../../src/utils/tenant-context';
import { createEngineDb, IDS } from './syndics.online-payment-fixtures';

type Row = Record<string, any>;

export function createLinkDb() {
  const db = createEngineDb();
  const profiles: Row[] = [];
  const links: Row[] = [];
  /** Agence ambiante (AsyncLocalStorage) vue à chaque lecture d'un appel. */
  const observedTenants: Array<string | undefined> = [];

  const tenantOf = (tenantId: string) => {
    const tenant = db.store.tenants.find(row => row.id === tenantId);
    return tenant ? { isActive: tenant.isActive, status: tenant.status } : null;
  };

  db.prisma.chargeCall.findFirst = jest.fn(async (args: any = {}) => {
    observedTenants.push(getCurrentTenantId());
    const where = args.where ?? {};
    const call = db.store.calls.find(
      row =>
        row.id === where.id &&
        (!where.syndicateId || row.syndicateId === where.syndicateId) &&
        (!where.lotId || row.lotId === where.lotId)
    );
    if (!call) return null;
    const syndicate = db.store.syndicates.find(row => row.id === call.syndicateId);
    if (!syndicate || (where.syndicate?.tenantId && syndicate.tenantId !== where.syndicate.tenantId)) return null;
    const lot = db.store.lots.find(row => row.id === call.lotId);
    return {
      ...call,
      periodStart: call.periodStart ?? null,
      syndicate: { name: syndicate.name },
      lot: {
        lotNumber: lot?.lotNumber ?? '',
        ownerContactId: lot?.ownerContactId ?? null,
        coownerId: lot?.coownerId ?? null
      }
    };
  });

  db.prisma.lotOwnerProfile = {
    findMany: jest.fn(async ({ where }: any) =>
      profiles
        .filter(row => row.lotId === where.lotId && (where.isActive === undefined || row.isActive === where.isActive))
        .map(row => ({ ...row }))
    )
  };

  const matchesLink = (row: Row, where: Row = {}) =>
    ['id', 'tenantId', 'scope', 'objectType', 'objectId', 'createdByUserId'].every(
      key => where[key] === undefined || row[key] === where[key]
    ) &&
    (where.revokedAt !== null || row.revokedAt === null);

  db.prisma.secureLink = {
    create: jest.fn(async ({ data }: any) => {
      const row = {
        id: randomUUID(),
        revokedAt: null,
        viewCount: 0,
        lastViewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdByUserId: null,
        ...data
      };
      links.push(row);
      return { id: row.id };
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      const row = links.find(link => link.tokenHash === where.tokenHash);
      return row ? { ...row, tenant: tenantOf(row.tenantId) } : null;
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      const row = links.find(link => matchesLink(link, where));
      return row ? { ...row } : null;
    }),
    findMany: jest.fn(async ({ where }: any) =>
      links
        .filter(link => matchesLink(link, where))
        .reverse()
        .map(link => ({ ...link }))
    ),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const rows = links.filter(link => matchesLink(link, where));
      rows.forEach(row => {
        for (const [key, value] of Object.entries<any>(data)) {
          row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value;
        }
      });
      return { count: rows.length };
    })
  };

  const resetEngine = db.reset;
  function reset() {
    resetEngine();
    profiles.length = 0;
    links.length = 0;
    observedTenants.length = 0;
    db.store.tenants.forEach(row => {
      row.isActive = true;
    });
    // Le lot L1 (A12) est détenu par Awa ; une fiche de propriété s'ajoute au besoin.
    db.store.lots[0].ownerContactId = IDS.AWA;
  }

  /** Fiche de propriété du lot L1 : copropriétaire depuis `ownedSince`, actif, sans fin. */
  function addOwnerProfile(overrides: Row = {}): Row {
    const row = {
      id: randomUUID(),
      lotId: IDS.L1,
      contactId: IDS.AWA,
      ownershipPercentage: 100,
      ownedSince: new Date('2020-01-01T00:00:00.000Z'),
      ownedUntil: null,
      isActive: true,
      ...overrides
    };
    profiles.push(row);
    return row;
  }

  return { ...db, reset, profiles, links, observedTenants, addOwnerProfile };
}

export type LinkDb = ReturnType<typeof createLinkDb>;
