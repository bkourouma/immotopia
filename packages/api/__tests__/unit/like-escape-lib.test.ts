/**
 * Recherches de src/lib : un `%` ou un `_` saisi est cherché littéralement
 * (échappé par escapeLike avant d'atteindre contains / startsWith de Prisma).
 */
const findMany = jest.fn();
const count = jest.fn();
const stockItemFindMany = jest.fn();
const membershipFindMany = jest.fn();
const treasuryFindMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    userNotification: {
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a)
    },
    stockItem: { findMany: (...a: unknown[]) => stockItemFindMany(...a) },
    membership: { findMany: (...a: unknown[]) => membershipFindMany(...a) },
    tenantClient: { findMany: jest.fn().mockResolvedValue([]) },
    treasuryTransfer: { findMany: (...a: unknown[]) => treasuryFindMany(...a) }
  }
}));
jest.mock('../../src/services/permission-service', () => ({ hasPermission: jest.fn().mockResolvedValue(false) }));

import { applyInstallmentListExtras, applyLeaseSearch } from '../../src/lib/rental/lease-list-filters';
import { applyPaymentListExtras, applyDeclarationListExtras } from '../../src/lib/rental/payment-list-filters';
import { applyDocumentListExtras } from '../../src/lib/rental/document-list-filters';
import { listMyNotifications, listNotificationRecipients } from '../../src/lib/notifications/queries';
import { listStockItems } from '../../src/lib/finance/stock-referentiel';
import { directory } from '../../src/lib/messaging/identity';

/** Toutes les valeurs de `contains` d'un `where`, quelle que soit la profondeur. */
function containsValues(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach(n => containsValues(n, out));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'contains' && typeof value === 'string') out.push(value);
      else containsValues(value, out);
    }
  }
  return out;
}

const BS = String.fromCharCode(92); // une barre oblique inverse
const CASES: Array<[string, string]> = [
  ['100%', `100${BS}%`],
  ['lot_7', `lot${BS}_7`],
  [`a${BS}b`, `a${BS}${BS}b`],
  ['loyer', 'loyer']
];

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  count.mockReset().mockResolvedValue(0);
  stockItemFindMany.mockReset().mockResolvedValue([]);
  membershipFindMany.mockReset().mockResolvedValue([]);
  treasuryFindMany.mockReset().mockResolvedValue([]);
});

for (const [saisie, attendu] of CASES)
  describe(`recherche ${JSON.stringify(saisie)}`, () => {
    it('locatif : baux, échéances, paiements, déclarations, documents', () => {
      const lease: any = {};
      applyLeaseSearch(lease, saisie);
      const installment: any = {};
      applyInstallmentListExtras(installment, { search: saisie } as any);
      const payment: any = {};
      applyPaymentListExtras(payment, { search: saisie } as any);
      const declaration: any = {};
      applyDeclarationListExtras(declaration, { search: saisie } as any);
      const document: any = {};
      applyDocumentListExtras(document, { search: saisie } as any);
      for (const where of [lease, installment, payment, declaration, document]) {
        const values = containsValues(where);
        expect(values.length).toBeGreaterThan(0);
        expect(new Set(values)).toEqual(new Set([attendu]));
      }
    });

    it('notifications : mes notifications et destinataires', async () => {
      await listMyNotifications({ tenantId: 't1', userId: 'u1', q: saisie });
      expect(new Set(containsValues(findMany.mock.calls[0][0].where))).toEqual(new Set([attendu]));
      findMany.mockClear();
      await listNotificationRecipients('t1', saisie);
      expect(findMany.mock.calls[0][0].where.recipientLabel.contains).toBe(attendu);
      expect(findMany.mock.calls[0][0].where.tenantId).toBe('t1');
    });

    it('finance stock : articles', async () => {
      await listStockItems('t1', { search: saisie } as any);
      const where = stockItemFindMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('t1');
      expect(new Set(containsValues(where))).toEqual(new Set([attendu]));
    });

    it('messagerie : annuaire', async () => {
      await directory({ userId: 'u1', tenantId: 't1', audience: 'STAFF' } as any, saisie);
      const where = membershipFindMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('t1');
      expect(new Set(containsValues(where))).toEqual(new Set([attendu]));
    });
  });
