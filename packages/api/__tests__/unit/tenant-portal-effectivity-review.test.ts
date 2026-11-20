/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Revue d'effectivité du portail locataire (lot 4, 20/11/2026) : fiche d'échéance
 * alignée sur la liste, détail de ticket sans données internes du personnel,
 * catégorie de ticket invalide refusée en 400. Prisma est simulé.
 */
const prismaMock: any = {
  rentalInstallment: { findFirst: jest.fn() },
  rentalPayment: { findMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));

jest.mock('../../src/lib/rental/declared-payment/agency-notification', () => ({
  notifyAgencyOfDeclaration: jest.fn()
}));
// Modules lourds que ces cas n'exercent pas (le client Prisma généré du poste peut être en retard
// sur le schéma, et certaines dépendances manquer) : on ne les charge pas.
jest.mock('../../src/lib/rental/declared-payment/settings', () => ({}));
jest.mock('../../src/services/document-generation-service', () => ({ getDocumentFile: jest.fn() }));
jest.mock('../../src/services/rental-deposit-service', () => ({
  getDeposit: jest.fn(),
  listDepositMovements: jest.fn()
}));
jest.mock('../../src/services/maintenance-attachment-service', () => ({ uploadAttachment: jest.fn() }));
jest.mock('../../src/lib/direct-debit/mandate-files', () => ({ detectMandateScanKind: jest.fn() }));
jest.mock('../../src/utils/file-signature', () => ({
  detectDocumentKind: jest.fn(),
  detectImageKind: jest.fn(),
  extensionForKind: jest.fn()
}));
jest.mock('../../src/lib/signature/sources/guards', () => ({
  isUuid: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}));

const findTenantPortalTicket = jest.fn();
jest.mock('../../src/lib/maintenance/portal-visibility', () => ({
  findTenantPortalTicket: (...a: unknown[]) => findTenantPortalTicket(...a),
  resolveTenantPortalCrmContactId: jest.fn().mockResolvedValue('contact-1'),
  tenantPortalTicketFilter: jest.fn().mockResolvedValue({})
}));

const getTicketById = jest.fn();
jest.mock('../../src/services/maintenance-ticket-service', () => ({
  getTicketById: (...a: unknown[]) => getTicketById(...a),
  createTicket: jest.fn()
}));
const addComment = jest.fn();
jest.mock('../../src/services/maintenance-comment-service', () => ({
  addComment: (...a: unknown[]) => addComment(...a)
}));

import { TenantPortalService } from '../../src/services/tenant-portal-service';
import { createMaintenanceTicketSchema } from '../../src/utils/tenant-portal-validators';

const service = new TenantPortalService();
const INSTALLMENT = '00000000-0000-4000-8000-000000000001';
const TICKET = '00000000-0000-4000-8000-000000000002';
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fiche d’échéance : payé, reste dû et statut comme la liste', () => {
  const row = (over: Record<string, unknown>) => ({
    id: INSTALLMENT,
    lease_id: 'l',
    period_year: 2026,
    period_month: 10,
    status: 'DUE',
    amount_rent: 100_000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    items: [],
    payments: [],
    penalties: [],
    ...over
  });

  it('compte les allocations réussies même quand amount_paid est resté à 0, et passe en Payé', async () => {
    prismaMock.rentalInstallment.findFirst.mockResolvedValue(
      row({
        due_date: daysFromNow(-3),
        status: 'OVERDUE',
        payments: [{ id: 'a', amount: 100_000, payment: { status: 'SUCCESS' } }]
      })
    );
    prismaMock.rentalPayment.findMany.mockResolvedValue([]);

    const out = await service.getInstallmentDetails('c', 'l', 't', INSTALLMENT, ['l']);

    expect(out.installment.balance).toBe(0);
    expect(out.installment.amount_paid).toBe(100_000);
    expect(out.installment.status).toBe('PAID');
  });

  it('ignore une allocation d’un paiement non abouti', async () => {
    prismaMock.rentalInstallment.findFirst.mockResolvedValue(
      row({
        due_date: daysFromNow(-3),
        status: 'DUE',
        payments: [{ id: 'a', amount: 100_000, payment: { status: 'FAILED' } }]
      })
    );
    prismaMock.rentalPayment.findMany.mockResolvedValue([]);

    const out = await service.getInstallmentDetails('c', 'l', 't', INSTALLMENT, ['l']);

    expect(out.installment.balance).toBe(100_000);
    // Échue et impayée : « En retard » même si le job de nuit ne l’a pas encore basculée.
    expect(out.installment.status).toBe('OVERDUE');
  });

  it('garde un brouillon futur et une annulée tels quels', async () => {
    prismaMock.rentalPayment.findMany.mockResolvedValue([]);
    prismaMock.rentalInstallment.findFirst.mockResolvedValueOnce(row({ status: 'DRAFT', due_date: daysFromNow(40) }));
    expect((await service.getInstallmentDetails('c', 'l', 't', INSTALLMENT, ['l'])).installment.status).toBe('DRAFT');

    prismaMock.rentalInstallment.findFirst.mockResolvedValueOnce(
      row({ status: 'CANCELED', due_date: daysFromNow(-9) })
    );
    expect((await service.getInstallmentDetails('c', 'l', 't', INSTALLMENT, ['l'])).installment.status).toBe(
      'CANCELED'
    );
  });
});

describe('détail de ticket : pas de données internes du personnel', () => {
  const staff = { id: 'u-1', email: 'agent@agence.test', fullName: 'Awa Agent' };

  it('ne renvoie ni e-mail ni identifiant du personnel (assigné, commentaires, historique)', async () => {
    findTenantPortalTicket.mockResolvedValue({ id: TICKET });
    getTicketById.mockResolvedValue({
      id: TICKET,
      assignedToUser: staff,
      comments: [
        { id: 'c1', author_type: 'MANAGER', content: 'Passage jeudi', authorUser: staff, authorContact: null },
        {
          id: 'c2',
          author_type: 'MANAGER',
          content: 'Ok',
          authorUser: { id: 'u-2', email: 'sans-nom@agence.test', fullName: null },
          authorContact: null
        }
      ],
      statusHistory: [{ id: 'h1', to_status: 'ASSIGNED', changedByUser: staff }],
      attachments: []
    });

    const out = await service.getMaintenanceTicketDetails('c', 'l', 't', TICKET, ['l']);

    expect(out.assignedToUser).toEqual({ fullName: 'Awa Agent' });
    expect(out.comments[0].authorUser).toEqual({ fullName: 'Awa Agent' });
    // Sans nom affiché : l’écran retombe sur « Gestionnaire », jamais sur l’e-mail.
    expect(out.comments[1].authorUser).toBeNull();
    expect(out.statusHistory[0].changedByUser).toBeNull();
    expect(JSON.stringify(out)).not.toContain('agence.test');
    expect(JSON.stringify(out)).not.toContain('u-1');
  });

  it('ne renvoie pas l’e-mail du personnel dans le commentaire qu’il vient d’ajouter', async () => {
    findTenantPortalTicket.mockResolvedValue({ id: TICKET });
    addComment.mockResolvedValue({
      id: 'c9',
      content: 'Merci',
      authorUser: null,
      authorContact: { id: 'ct', firstName: 'Moi', lastName: 'Locataire', email: 'moi@exemple.test' }
    });

    const out = await service.addTicketComment('c', 'l', 't', TICKET, 'Merci', ['l']);

    expect(out.authorUser).toBeNull();
    expect(out.authorContact.firstName).toBe('Moi');
  });
});

describe('création de ticket : catégorie', () => {
  const valid = { category: 'PLUMBING', priority: 'MEDIUM', title: 'Fuite', description: 'Fuite sous évier' };

  it('accepte les quatre catégories connues', () => {
    for (const category of ['PLUMBING', 'ELECTRICITY', 'AC', 'OTHER']) {
      expect(createMaintenanceTicketSchema.safeParse({ ...valid, category }).success).toBe(true);
    }
  });

  it('refuse une catégorie inconnue (400) au lieu de la laisser atteindre Prisma (500)', () => {
    expect(createMaintenanceTicketSchema.safeParse({ ...valid, category: 'ROOF' }).success).toBe(false);
    expect(createMaintenanceTicketSchema.safeParse({ ...valid, category: '' }).success).toBe(false);
    expect(createMaintenanceTicketSchema.safeParse({ ...valid, category: undefined }).success).toBe(false);
  });
});
