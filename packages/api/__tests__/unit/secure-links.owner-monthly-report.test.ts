/**
 * lib/patrimoine/owner-monthly-report — rapport mensuel lu par lien sécurisé.
 *
 * `lib/secure-links` est mocké à sa frontière publique (chaque export utilisé
 * est couvert) ; Prisma est mocké à `utils/database`.
 */

import { NotFoundError } from '../../src/middleware/error-middleware';
import { getTenantContext } from '../../src/utils/tenant-context';
import { logger } from '../../src/utils/logger';

const statementFindFirst = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: { ownerStatement: { findFirst: (...a: any[]) => statementFindFirst(...a) } }
}));

const verifySecureLink = jest.fn();
const recordSecureLinkView = jest.fn();
jest.mock('../../src/lib/secure-links', () => {
  const { NotFoundError: NF } = jest.requireActual('../../src/middleware/error-middleware');
  return {
    verifySecureLink: (...a: any[]) => verifySecureLink(...a),
    recordSecureLinkView: (...a: any[]) => recordSecureLinkView(...a),
    invalidSecureLinkError: () => new NF('Lien invalide ou expiré.')
  };
});

import { getOwnerMonthlyReportByToken } from '../../src/lib/patrimoine/owner-monthly-report';

const TENANT_A = 'tenant-a';
const link = {
  id: 'link-1',
  tenantId: TENANT_A,
  scope: 'OWNER_MONTHLY_REPORT',
  objectType: 'OwnerStatement',
  objectId: 'stmt-owner-a',
  expiresAt: new Date('2026-10-20T10:00:00.000Z')
};

function statement(): any {
  return {
    period: '2026-09',
    currency: 'XOF',
    totalRentDue: '600000.00',
    totalRevenue: '500000.00',
    totalArrears: '100000.00',
    totalManagementFees: '50000.00',
    totalManagementFeesVat: '9000.00',
    totalExpenses: '20000.00',
    netAmount: '421000.00',
    tenant: { name: 'Agence Alpha' },
    owner: { firstName: 'Awa', lastName: 'Koné', legalName: null, contactType: 'PERSON' },
    items: [
      {
        propertyId: 'p1',
        label: 'Loyers encaissés',
        type: 'RENT_COLLECTED',
        amount: '300000.00',
        property: { internalReference: 'REF-1', title: 'Villa A' }
      },
      {
        propertyId: 'p2',
        label: 'Loyers encaissés',
        type: 'RENT_COLLECTED',
        amount: '200000.00',
        property: { internalReference: 'REF-2', title: 'Studio B' }
      },
      {
        propertyId: 'p1',
        label: 'Honoraires',
        type: 'MANAGEMENT_FEE',
        amount: '30000.00',
        property: { internalReference: 'REF-1', title: 'Villa A' }
      },
      {
        propertyId: 'p1',
        label: 'Plomberie',
        type: 'EXPENSE_DEDUCTED',
        amount: '20000.00',
        property: { internalReference: 'REF-1', title: 'Villa A' }
      }
    ]
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getOwnerMonthlyReportByToken', () => {
  it('renvoie le DTO figé, groupé par bien, sans identifiant interne ni coordonnées', async () => {
    verifySecureLink.mockResolvedValueOnce(link);
    let seenContext: string | undefined;
    statementFindFirst.mockImplementationOnce(async () => {
      seenContext = getTenantContext()?.tenantId;
      return statement();
    });

    const dto = await getOwnerMonthlyReportByToken('jeton', { ip: '1.2.3.4', userAgent: 'UA' });

    expect(verifySecureLink).toHaveBeenCalledWith('jeton', 'OWNER_MONTHLY_REPORT');
    expect(seenContext).toBe(TENANT_A);
    expect(dto).toEqual({
      agencyName: 'Agence Alpha',
      ownerName: 'Awa Koné',
      period: '2026-09',
      currency: 'XOF',
      expiresAt: '2026-10-20T10:00:00.000Z',
      totals: {
        totalRentDue: 600000,
        totalRevenue: 500000,
        totalArrears: 100000,
        managementFees: 50000,
        managementFeesVat: 9000,
        totalExpenses: 20000,
        withholdingTax: 0,
        depositRetained: 0,
        netAmount: 421000
      },
      properties: [
        {
          reference: 'REF-1',
          title: 'Villa A',
          lines: [
            { label: 'Loyers encaissés', type: 'RENT_COLLECTED', amount: 300000 },
            { label: 'Honoraires', type: 'MANAGEMENT_FEE', amount: 30000 },
            { label: 'Plomberie', type: 'EXPENSE_DEDUCTED', amount: 20000 }
          ],
          subtotal: 250000
        },
        {
          reference: 'REF-2',
          title: 'Studio B',
          lines: [{ label: 'Loyers encaissés', type: 'RENT_COLLECTED', amount: 200000 }],
          subtotal: 200000
        }
      ]
    });
    const serialised = JSON.stringify(dto);
    for (const forbidden of ['p1', 'p2', 'stmt-owner-a', 'tenant-a', 'email', 'phone', 'passwordHash', 'uploads']) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it('lignes OTHER : retenue à la source déduite et dépôt conservé ajouté, le sous-total réconcilie avec le net', async () => {
    verifySecureLink.mockResolvedValueOnce(link);
    const s = statement();
    // Un seul bien : 300000 - 30000 - 20000 - 15000 (retenue) + 40000 (dépôt) = 275000.
    s.items = s.items.filter((item: any) => item.propertyId === 'p1');
    s.items.push(
      {
        propertyId: 'p1',
        label: 'Retenue à la source (quote-part 50 %)',
        type: 'OTHER',
        amount: '15000.00',
        property: { internalReference: 'REF-1', title: 'Villa A' }
      },
      {
        propertyId: 'p1',
        label: 'Dépôt de garantie conservé',
        type: 'OTHER',
        amount: '40000.00',
        property: { internalReference: 'REF-1', title: 'Villa A' }
      }
    );
    s.netAmount = '275000.00';
    statementFindFirst.mockResolvedValueOnce(s);

    const dto = await getOwnerMonthlyReportByToken('jeton', {});

    expect(dto.totals.withholdingTax).toBe(15000);
    expect(dto.totals.depositRetained).toBe(40000);
    expect(dto.totals.netAmount).toBe(275000);
    expect(dto.properties).toHaveLength(1);
    expect(dto.properties[0].subtotal).toBe(250000 - 15000 + 40000);
    expect(dto.properties.reduce((sum, property) => sum + property.subtotal, 0)).toBe(dto.totals.netAmount);
  });

  it("ne lit que le relevé du lien, dans l'agence du lien, et ne sélectionne aucune coordonnée", async () => {
    verifySecureLink.mockResolvedValueOnce(link);
    statementFindFirst.mockResolvedValueOnce(statement());

    await getOwnerMonthlyReportByToken('jeton', {});

    const args = statementFindFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'stmt-owner-a', tenantId: TENANT_A });
    expect(Object.keys(args.select.owner.select).sort()).toEqual(['contactType', 'firstName', 'lastName', 'legalName']);
    expect(args.select.owner.select).not.toHaveProperty('email');
    expect(args.select.items.select.property.select).toEqual({ internalReference: true, title: true });
  });

  it("le lien du propriétaire A ne désigne jamais le relevé d'un propriétaire B ni d'une autre agence", async () => {
    // Le relevé d'une autre agence n'est pas trouvé dans l'agence du lien.
    verifySecureLink.mockResolvedValueOnce({ ...link, objectId: 'stmt-other-tenant' });
    statementFindFirst.mockImplementationOnce(async ({ where }: any) =>
      where.tenantId === 'tenant-b' ? statement() : null
    );

    await expect(getOwnerMonthlyReportByToken('jeton', {})).rejects.toMatchObject({
      statusCode: 404,
      message: 'Lien invalide ou expiré.'
    });
    expect(recordSecureLinkView).not.toHaveBeenCalled();
  });

  it('refuse un lien dont l’objet visé n’est pas un relevé', async () => {
    verifySecureLink.mockResolvedValueOnce({ ...link, objectType: 'Payment' });
    await expect(getOwnerMonthlyReportByToken('jeton', {})).rejects.toBeInstanceOf(NotFoundError);
    expect(statementFindFirst).not.toHaveBeenCalled();
    expect(recordSecureLinkView).not.toHaveBeenCalled();
  });

  it('propage le refus de vérification sans lire le relevé ni journaliser', async () => {
    verifySecureLink.mockRejectedValueOnce(new NotFoundError('Lien invalide ou expiré.'));
    await expect(getOwnerMonthlyReportByToken('jeton', {})).rejects.toBeInstanceOf(NotFoundError);
    expect(statementFindFirst).not.toHaveBeenCalled();
    expect(recordSecureLinkView).not.toHaveBeenCalled();
  });

  it('une consultation réussie reste un succès même si son enregistrement échoue (pas de 500)', async () => {
    verifySecureLink.mockResolvedValueOnce(link);
    statementFindFirst.mockResolvedValueOnce(statement());
    recordSecureLinkView.mockRejectedValueOnce(new Error('base indisponible jeton-secret'));
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    const dto = await getOwnerMonthlyReportByToken('jeton-secret', {});

    expect(dto.ownerName).toBe('Awa Koné');
    expect(recordSecureLinkView).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('jeton-secret');
    warn.mockRestore();
  });

  it('journalise la consultation uniquement après succès', async () => {
    verifySecureLink.mockResolvedValueOnce(link);
    statementFindFirst.mockResolvedValueOnce(statement());

    await getOwnerMonthlyReportByToken('jeton', { ip: '1.2.3.4', userAgent: 'UA' });

    expect(recordSecureLinkView).toHaveBeenCalledTimes(1);
    expect(recordSecureLinkView).toHaveBeenCalledWith(link, { ip: '1.2.3.4', userAgent: 'UA' });
  });

  it('utilise la raison sociale d’un propriétaire société', async () => {
    verifySecureLink.mockResolvedValueOnce(link);
    const s = statement();
    s.owner = { firstName: 'Jean', lastName: 'Dupont', legalName: 'SCI Soleil', contactType: 'COMPANY' };
    statementFindFirst.mockResolvedValueOnce(s);
    const dto = await getOwnerMonthlyReportByToken('jeton', {});
    expect(dto.ownerName).toBe('SCI Soleil');
  });
});
