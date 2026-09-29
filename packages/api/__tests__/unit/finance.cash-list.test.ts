/**
 * Liste des pièces de caisse (`lib/finance/cash-list.ts`) — BUG-2026-09-29-020.
 *
 * Faux client Prisma en mémoire : ce qui compte ici est le filtrage par agence,
 * la vérification d'appartenance du chantier reçu, et le statut dérivé
 * (brouillon, validée, annulée) — jamais lu depuis une colonne.
 */

import { listCashVouchers } from '../../src/lib/finance/cash-list';
import { NotFoundError } from '../../src/middleware/error-middleware';

type Row = Record<string, any>;

const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const SITE_A = 'site-A';
const SITE_B = 'site-B-other-tenant';

let vouchers: Row[] = [];
let voids: Row[] = [];
let sites: Row[] = [];

function voucher(overrides: Row): Row {
  return {
    id: 'v-1',
    tenantId: TENANT_A,
    voucherYear: null,
    voucherNumber: null,
    siteId: SITE_A,
    costCategoryId: 'cat-1',
    beneficiaryName: 'Quincaillerie Bingerville',
    amount: '250000',
    currency: 'XOF',
    reason: 'Achat de ciment',
    voucherDate: new Date('2026-09-29'),
    createdAt: new Date('2026-09-29T08:00:00Z'),
    createdByUserId: 'user-compta-000000',
    validatedAt: null,
    site: { name: 'Chantier Émeraude OI' },
    costCategory: { label: 'Matériaux' },
    createdBy: { fullName: 'Compta OI', email: 'compta.oi@recette.test' },
    ...overrides
  };
}

const client: any = {
  constructionSite: {
    findFirst: jest.fn(
      async ({ where }: Row) => sites.find(s => s.id === where.id && s.tenantId === where.tenantId) ?? null
    )
  },
  cashVoucher: {
    findMany: jest.fn(async ({ where }: Row) =>
      vouchers.filter(v => v.tenantId === where.tenantId && (where.siteId ? v.siteId === where.siteId : true))
    )
  },
  voidDocument: {
    findMany: jest.fn(async ({ where }: Row) =>
      voids.filter(
        v =>
          v.tenantId === where.tenantId &&
          v.documentType === where.documentType &&
          where.documentId.in.includes(v.documentId)
      )
    )
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  sites = [
    { id: SITE_A, tenantId: TENANT_A },
    { id: SITE_B, tenantId: TENANT_B }
  ];
  vouchers = [];
  voids = [];
});

describe('listCashVouchers', () => {
  it('rend une pièce validée par un autre que son auteur, avec son numéro et ses libellés', async () => {
    vouchers = [
      voucher({ id: 'v-1', voucherYear: 2026, voucherNumber: 1, validatedAt: new Date('2026-09-29T09:00:00Z') })
    ];

    const [piece] = await listCashVouchers(client, TENANT_A);

    expect(piece).toMatchObject({
      id: 'v-1',
      number: '2026-0001',
      status: 'VALIDATED',
      siteLabel: 'Chantier Émeraude OI',
      costCategoryLabel: 'Matériaux',
      beneficiaryName: 'Quincaillerie Bingerville',
      amount: 250000,
      createdByLabel: 'Compta OI'
    });
  });

  it('dérive le statut : brouillon sans numéro, annulée dès qu’une annulation la vise', async () => {
    vouchers = [
      voucher({ id: 'v-draft' }),
      voucher({ id: 'v-void', voucherYear: 2026, voucherNumber: 2, validatedAt: new Date('2026-09-29T09:00:00Z') })
    ];
    voids = [
      {
        tenantId: TENANT_A,
        documentType: 'CASH_VOUCHER',
        documentId: 'v-void',
        voidedAt: new Date('2026-09-29T10:00:00Z'),
        reason: 'Erreur de bénéficiaire'
      }
    ];

    const liste = await listCashVouchers(client, TENANT_A);
    const brouillon = liste.find(p => p.id === 'v-draft')!;
    const annulee = liste.find(p => p.id === 'v-void')!;

    expect(brouillon).toMatchObject({ status: 'DRAFT', number: null, voidedAt: null });
    expect(annulee).toMatchObject({ status: 'VOIDED', voidReason: 'Erreur de bénéficiaire' });
  });

  it('ne rend jamais les pièces d’une autre agence', async () => {
    vouchers = [voucher({ id: 'v-a' }), voucher({ id: 'v-b', tenantId: TENANT_B })];

    const liste = await listCashVouchers(client, TENANT_A);

    expect(liste.map(p => p.id)).toEqual(['v-a']);
    expect(client.cashVoucher.findMany.mock.calls[0][0].where.tenantId).toBe(TENANT_A);
  });

  it('filtre par chantier, après avoir vérifié qu’il appartient à l’agence', async () => {
    vouchers = [voucher({ id: 'v-1' }), voucher({ id: 'v-2', siteId: 'autre-chantier' })];

    const liste = await listCashVouchers(client, TENANT_A, { siteId: SITE_A });

    expect(liste.map(p => p.id)).toEqual(['v-1']);
  });

  it('lève NotFoundError pour un chantier d’une autre agence, sans rien lire', async () => {
    await expect(listCashVouchers(client, TENANT_A, { siteId: SITE_B })).rejects.toBeInstanceOf(NotFoundError);
    expect(client.cashVoucher.findMany).not.toHaveBeenCalled();
  });
});
