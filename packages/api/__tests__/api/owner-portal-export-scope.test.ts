/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Isolation IDOR — `POST /api/portal/owner/reports/export`.
 *
 * `src/utils/report-generator.ts` (`exportDataCSV` / `exportDataExcel`)
 * construisait le filtre Prisma ainsi :
 *
 *   lease: {
 *     property_id: { in: propertyIds },
 *     ...(filters.propertyId && { property_id: filters.propertyId })
 *   }
 *
 * La clé du spread écrasait `{ in: propertyIds }` : un `propertyId` du
 * corps appartenant à un AUTRE propriétaire de la même agence sortait quand
 * même ses paiements/échéances/baux, sans jamais être vérifié contre le
 * périmètre de l'appelant (IDOR).
 *
 * Correctif : `exportData` restreint le périmètre AVANT de descendre —
 * `scopedPropertyIds = filters.propertyId ? propertyIds.filter(id => id ===
 * filters.propertyId) : propertyIds` — et les fonctions internes n'écrivent
 * plus jamais `property_id` à partir de `filters.propertyId`.
 *
 * Ce test appelle directement `exportData` (pas la route HTTP, déjà
 * couverte par `owner-portal-reports-filename.test.ts`) avec un mock de
 * `../../src/utils/database` qui applique vraiment le filtre `property_id`
 * reçu (imbriqué sous `lease` pour payments/installments, direct pour
 * leases) — la preuve porte sur les LIGNES renvoyées, pas seulement sur la
 * forme du `where`.
 */

import { exportData } from '../../src/utils/report-generator';
import { RentalPaymentStatus } from '@prisma/client';

const TENANT_A = 'tenant-a';
const P1 = 'prop-1'; // appartient au propriétaire appelant
const P2 = 'prop-2'; // appartient à un AUTRE propriétaire de la même agence

interface Row {
  id: string;
  property_id: string;
  [key: string]: any;
}

const paymentRows: Row[] = [
  {
    id: 'pay-p1',
    property_id: P1,
    tenant_id: TENANT_A,
    status: RentalPaymentStatus.SUCCESS,
    amount: 1000,
    succeeded_at: new Date('2026-02-01'),
    method: 'MOBILE_MONEY'
  },
  {
    id: 'pay-p2',
    property_id: P2,
    tenant_id: TENANT_A,
    status: RentalPaymentStatus.SUCCESS,
    amount: 2000,
    succeeded_at: new Date('2026-02-02'),
    method: 'MOBILE_MONEY'
  }
];

const installmentRows: Row[] = [
  {
    id: 'inst-p1',
    property_id: P1,
    tenant_id: TENANT_A,
    period_month: 1,
    period_year: 2026,
    due_date: new Date('2026-02-01'),
    amount_rent: 1000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 1000,
    status: 'PAID'
  },
  {
    id: 'inst-p2',
    property_id: P2,
    tenant_id: TENANT_A,
    period_month: 1,
    period_year: 2026,
    due_date: new Date('2026-02-01'),
    amount_rent: 2000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    status: 'PENDING'
  }
];

const leaseRows: Row[] = [
  {
    id: 'lease-p1',
    property_id: P1,
    tenant_id: TENANT_A,
    start_date: new Date('2026-01-01'),
    end_date: null,
    rent_amount: 1000,
    status: 'ACTIVE'
  },
  {
    id: 'lease-p2',
    property_id: P2,
    tenant_id: TENANT_A,
    start_date: new Date('2026-01-01'),
    end_date: null,
    rent_amount: 2000,
    status: 'ACTIVE'
  }
];

/** Extrait le filtre `{ in: [...] }` reçu, imbriqué sous `lease` ou direct. */
function extractPropertyScope(where: any): string[] {
  const clause = where.lease ? where.lease.property_id : where.property_id;
  return clause?.in ?? [];
}

function withProperty(row: Row) {
  return {
    ...row,
    property: { address: `Adresse ${row.property_id}` },
    primaryRenter: { user: { id: 'u1', fullName: 'Locataire Test' } }
  };
}

function makeFindMany(rows: Row[], nested: boolean) {
  return jest.fn(async (args: any) => {
    const scope = extractPropertyScope(args.where);
    const matched = rows.filter(row => scope.includes(row.property_id));
    if (!nested) return matched.map(withProperty);
    // payments / installments : la relation `lease` porte `property` et `primaryRenter`.
    return matched.map(row => ({ ...row, lease: withProperty(row) }));
  });
}

const rentalPaymentFindMany = makeFindMany(paymentRows, true);
const rentalInstallmentFindMany = makeFindMany(installmentRows, true);
const rentalLeaseFindMany = makeFindMany(leaseRows, false);

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalPayment: { findMany: (args: any) => rentalPaymentFindMany(args) },
    rentalInstallment: { findMany: (args: any) => rentalInstallmentFindMany(args) },
    rentalLease: { findMany: (args: any) => rentalLeaseFindMany(args) }
  }
}));

beforeEach(() => {
  jest.clearAllMocks();
});

const OWNER_SCOPE = [P1]; // le propriétaire appelant ne possède que P1

describe.each(['csv', 'excel'] as const)('exportData — format %s', format => {
  describe.each(['payments', 'installments', 'leases'] as const)('entityType %s', entityType => {
    it("exclut les données d'un autre propriétaire quand propertyId visé est hors périmètre", async () => {
      const buffer = await exportData(entityType, OWNER_SCOPE, TENANT_A, { propertyId: P2 }, format);
      const text = format === 'csv' ? buffer.toString('utf-8') : null;

      if (text !== null) {
        expect(text).not.toContain(P2);
        expect(text).not.toContain('pay-p2');
        expect(text).not.toContain('inst-p2');
        expect(text).not.toContain('lease-p2');
      }

      const findManyMock =
        entityType === 'payments'
          ? rentalPaymentFindMany
          : entityType === 'installments'
            ? rentalInstallmentFindMany
            : rentalLeaseFindMany;

      expect(findManyMock).toHaveBeenCalledTimes(1);
      const receivedWhere = findManyMock.mock.calls[0][0].where;
      // Le périmètre envoyé à Prisma est restreint à un tableau VIDE — jamais
      // à P2, et jamais { in: [P1] } (qui laisserait passer une lecture
      // silencieuse d'un autre bien du même propriétaire par erreur de
      // logique, ce n'est pas le cas ici mais on fige l'intersection exacte).
      expect(extractPropertyScope(receivedWhere)).toEqual([]);
    });

    it('renvoie uniquement les données du bien demandé quand il appartient au périmètre', async () => {
      const buffer = await exportData(entityType, OWNER_SCOPE, TENANT_A, { propertyId: P1 }, format);
      const text = format === 'csv' ? buffer.toString('utf-8') : null;

      if (text !== null) {
        expect(text).toContain(P1);
        expect(text).not.toContain(P2);
      }

      const findManyMock =
        entityType === 'payments'
          ? rentalPaymentFindMany
          : entityType === 'installments'
            ? rentalInstallmentFindMany
            : rentalLeaseFindMany;

      const receivedWhere = findManyMock.mock.calls[0][0].where;
      expect(extractPropertyScope(receivedWhere)).toEqual([P1]);
    });

    it('sans propertyId, reste borné au périmètre complet du propriétaire (jamais P2)', async () => {
      const buffer = await exportData(entityType, OWNER_SCOPE, TENANT_A, {}, format);
      const text = format === 'csv' ? buffer.toString('utf-8') : null;

      if (text !== null) {
        expect(text).toContain(P1);
        expect(text).not.toContain(P2);
      }

      const findManyMock =
        entityType === 'payments'
          ? rentalPaymentFindMany
          : entityType === 'installments'
            ? rentalInstallmentFindMany
            : rentalLeaseFindMany;

      const receivedWhere = findManyMock.mock.calls[0][0].where;
      expect(extractPropertyScope(receivedWhere)).toEqual(OWNER_SCOPE);
    });
  });
});
