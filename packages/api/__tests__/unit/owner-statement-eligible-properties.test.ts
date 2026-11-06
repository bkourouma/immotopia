const contactFindFirst = jest.fn();
const clientFindMany = jest.fn();
const shareFindMany = jest.fn();
const propertyFindMany = jest.fn();
const resolveOwnerPortalPropertyIds = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    crmContact: { findFirst: (...args: any[]) => contactFindFirst(...args) },
    tenantClient: { findMany: (...args: any[]) => clientFindMany(...args) },
    propertyOwnershipShare: { findMany: (...args: any[]) => shareFindMany(...args) },
    property: { findMany: (...args: any[]) => propertyFindMany(...args) }
  }
}));
jest.mock('../../src/lib/owner-portal-scope', () => ({
  resolveOwnerPortalPropertyIds: (...args: any[]) => resolveOwnerPortalPropertyIds(...args)
}));

import { listOwnerStatementEligibleProperties } from '../../src/lib/patrimoine/owner-statement-eligible-properties';

const TENANT = 'tenant-A';
const CONTACT = 'contact-A';

beforeEach(() => {
  jest.clearAllMocks();
  contactFindFirst.mockResolvedValue({ id: CONTACT });
  clientFindMany.mockResolvedValue([{ id: 'client-A', userId: 'user-A' }]);
  resolveOwnerPortalPropertyIds.mockResolvedValue(['prop-A', 'prop-B']);
  shareFindMany.mockResolvedValue([{ propertyId: 'prop-C' }]);
  propertyFindMany.mockResolvedValue([
    { id: 'prop-A', title: 'A', internalReference: 'A-1', address: 'Rue A' },
    { id: 'prop-C', title: 'C', internalReference: 'C-1', address: 'Rue C' }
  ]);
});

describe('biens éligibles au relevé de gérance', () => {
  it('réunit le périmètre propriétaire et les quotes-parts, puis filtre les biens de l’agence', async () => {
    const rows = await listOwnerStatementEligibleProperties(TENANT, CONTACT);

    expect(rows.map(row => row.id)).toEqual(['prop-A', 'prop-C']);
    expect(contactFindFirst).toHaveBeenCalledWith({ where: { id: CONTACT, tenantId: TENANT }, select: { id: true } });
    expect(clientFindMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, details: { path: ['crmContactId'], equals: CONTACT } },
      select: { id: true, userId: true }
    });
    expect(resolveOwnerPortalPropertyIds).toHaveBeenCalledWith({
      userId: 'user-A',
      tenantClientId: 'client-A',
      tenantId: TENANT,
      restrictToTenantProperties: true
    });
    expect(shareFindMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, ownerClientId: { in: ['client-A'] } },
      select: { propertyId: true }
    });
    expect(propertyFindMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, id: { in: ['prop-A', 'prop-B', 'prop-C'] } },
      select: { id: true, title: true, internalReference: true, address: true },
      orderBy: [{ title: 'asc' }, { internalReference: 'asc' }, { id: 'asc' }]
    });
  });

  it('ne révèle pas si un contact existe dans une autre agence', async () => {
    contactFindFirst.mockResolvedValue(null);
    await expect(listOwnerStatementEligibleProperties(TENANT, CONTACT)).rejects.toMatchObject({ statusCode: 404 });
    expect(clientFindMany).not.toHaveBeenCalled();
    expect(propertyFindMany).not.toHaveBeenCalled();
  });

  it('renvoie une liste vide si le contact n’a pas de compte propriétaire lié', async () => {
    clientFindMany.mockResolvedValue([]);
    expect(await listOwnerStatementEligibleProperties(TENANT, CONTACT)).toEqual([]);
    expect(resolveOwnerPortalPropertyIds).not.toHaveBeenCalled();
    expect(propertyFindMany).not.toHaveBeenCalled();
  });
});
