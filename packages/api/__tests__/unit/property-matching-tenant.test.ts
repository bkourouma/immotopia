/**
 * Balayage B6 — `addToShortlist(dealId, propertyId, tenantId, ...)` ecrivait
 * une `CrmDealProperty` sans jamais verifier que `dealId` appartient a
 * `tenantId`, ni que `propertyId` est accessible a cette agence (proprietaire
 * ou mandat actif). La cle composite `tenantId_dealId_propertyId` protegeait
 * la relecture/mise a jour d'une fiche existante, mais pas la creation : un
 * `dealId` d'une AUTRE agence (ou un `propertyId` totalement etranger)
 * passait tel quel a `prisma.crmDealProperty.create`.
 */

const dealFindFirst = jest.fn();
const propertyFindFirst = jest.fn();
const contactFindFirst = jest.fn();
const dealPropertyFindUnique = jest.fn();
const dealPropertyCreate = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    crmDeal: { findFirst: (...a: any[]) => dealFindFirst(...a) },
    property: { findFirst: (...a: any[]) => propertyFindFirst(...a) },
    crmContact: { findFirst: (...a: any[]) => contactFindFirst(...a) },
    crmDealProperty: {
      findUnique: (...a: any[]) => dealPropertyFindUnique(...a),
      create: (...a: any[]) => dealPropertyCreate(...a),
      update: jest.fn()
    }
  }
}));

import { addToShortlist } from '../../src/services/property-matching-service';

beforeEach(() => {
  jest.clearAllMocks();
  dealPropertyFindUnique.mockResolvedValue(null);
  dealPropertyCreate.mockResolvedValue({ id: 'dp1' });
});

describe('addToShortlist — isolation par agence', () => {
  it("refuse un dealId d'une autre agence", async () => {
    dealFindFirst.mockResolvedValue(null); // le deal n'appartient pas a tenant-A

    await expect(addToShortlist('deal-autre-agence', 'p1', 'tenant-A')).rejects.toThrow();
    expect(dealPropertyCreate).not.toHaveBeenCalled();
  });

  it("refuse un propertyId inaccessible a l'agence (ni proprietaire, ni mandat)", async () => {
    dealFindFirst.mockResolvedValue({ id: 'deal-1' });
    propertyFindFirst.mockResolvedValue(null);

    await expect(addToShortlist('deal-1', 'p-autre-agence', 'tenant-A')).rejects.toThrow();
    expect(dealPropertyCreate).not.toHaveBeenCalled();
  });

  it('accepte un deal et un bien valides pour l\'agence', async () => {
    dealFindFirst.mockResolvedValue({ id: 'deal-1' });
    propertyFindFirst.mockResolvedValue({ id: 'p1' });

    const result = await addToShortlist('deal-1', 'p1', 'tenant-A');

    expect(result.id).toBe('dp1');
    expect(dealPropertyCreate).toHaveBeenCalled();
  });

  it("refuse un sourceOwnerContactId d'une autre agence", async () => {
    dealFindFirst.mockResolvedValue({ id: 'deal-1' });
    propertyFindFirst.mockResolvedValue({ id: 'p1' });
    contactFindFirst.mockResolvedValue(null);

    await expect(
      addToShortlist('deal-1', 'p1', 'tenant-A', undefined, undefined, 'contact-autre-agence')
    ).rejects.toThrow();
    expect(dealPropertyCreate).not.toHaveBeenCalled();
  });
});
