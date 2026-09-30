/**
 * Visites : assigné et collaborateurs sont des membres ACTIFS de l'agence
 * (jamais un filtre d'agence facultatif) ; un bien CLIENT saisi par l'agence
 * (tenantId posé, sans mandat) est planifiable, listable, au calendrier et
 * apparié.
 */
import fs from 'fs';
import path from 'path';

const propertyFindFirst = jest.fn();
const membershipFindMany = jest.fn();
const membershipFindFirst = jest.fn();
const visitFindMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: { findFirst: (...a: any[]) => propertyFindFirst(...a) },
    membership: {
      findMany: (...a: any[]) => membershipFindMany(...a),
      findFirst: (...a: any[]) => membershipFindFirst(...a)
    },
    propertyVisit: {
      findMany: (...a: any[]) => visitFindMany(...a),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn()
    }
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/crm-activity-service', () => ({ createActivity: jest.fn() }));

import { scheduleVisit, getPropertyVisits } from '../../src/services/property-visit-service';
import { NotFoundError } from '../../src/middleware/error-middleware';

const futur = () => new Date(Date.now() + 86_400_000);
const base = () => ({ visitType: 'PHYSICAL' as any, scheduledAt: futur() });

beforeEach(() => {
  jest.clearAllMocks();
  propertyFindFirst.mockResolvedValue({ id: 'p1', address: 'x' });
  membershipFindMany.mockResolvedValue([]);
  membershipFindFirst.mockResolvedValue(null);
  visitFindMany.mockResolvedValue([]);
});

describe('scheduleVisit — membres actifs', () => {
  it('assigné non membre actif : 404, le filtre exige agence et statut ACTIVE', async () => {
    await expect(
      scheduleVisit('p1', { ...base(), assignedToUserId: 'u-x' }, 'tenant-A', 'actor')
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(membershipFindFirst.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-A',
      userId: 'u-x',
      status: 'ACTIVE'
    });
  });

  it('collaborateur non membre actif : 404, le filtre exige agence et statut ACTIVE', async () => {
    await expect(
      scheduleVisit('p1', { ...base(), collaboratorIds: ['u-x'] }, 'tenant-A', 'actor')
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(membershipFindMany.mock.calls[0][0].where).toMatchObject({ tenantId: 'tenant-A', status: 'ACTIVE' });
  });
});

describe('bien CLIENT sans mandat mais saisi par l’agence', () => {
  const clause = { ownershipType: 'CLIENT', tenantId: 'tenant-A' };

  it('planifier une visite lit le bien avec la branche CLIENT de l’agence', async () => {
    await scheduleVisit('p1', base(), 'tenant-A', 'actor').catch(() => undefined);
    expect(propertyFindFirst.mock.calls[0][0].where.OR).toContainEqual(clause);
  });

  it('lister les visites lit le bien avec la branche CLIENT de l’agence', async () => {
    await getPropertyVisits('p1', 'tenant-A');
    expect(propertyFindFirst.mock.calls[0][0].where.OR).toContainEqual(clause);
  });

  it.each(['crm-calendar-service.ts', 'property-matching-service.ts'])(
    '%s porte la branche CLIENT de l’agence',
    file => {
      const source = fs.readFileSync(path.join(__dirname, '../../src/services', file), 'utf8');
      expect(source).toContain("{ ownershipType: 'CLIENT', tenantId },");
    }
  );
});

describe('patrimoine : seuls les biens détenus par l’agence', () => {
  it.each(['queries.ts', 'export/data.ts'])('%s filtre ownershipType TENANT', file => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/lib/patrimoine', file), 'utf8');
    expect(source).toContain("ownershipType: 'TENANT', status: { notIn: OCCUPANCY_EXCLUDED_STATUSES }");
  });
});
