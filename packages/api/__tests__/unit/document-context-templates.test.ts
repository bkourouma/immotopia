/**
 * Quittance et releve de compte : les contextes construits couvrent tous les
 * champs des modeles DOCX du depot (`Reçu_Loyer.docx`, `Releve_Compte.docx`).
 *
 * Prisma est simule ; le contexte est le vrai, et le rendu passe par le vrai
 * `renderDocx` sur le vrai modele. Aucun `{{CHAMP}}` en clair ne doit subsister.
 */
import * as path from 'path';
import PizZip from 'pizzip';

const rentalPaymentFindFirst = jest.fn();
const rentalInstallmentFindFirst = jest.fn();
const rentalInstallmentFindMany = jest.fn();
const rentalLeaseFindFirst = jest.fn();
const crmContactFindFirst = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalPayment: { findFirst: (...a: any[]) => rentalPaymentFindFirst(...a) },
    rentalInstallment: {
      findFirst: (...a: any[]) => rentalInstallmentFindFirst(...a),
      findMany: (...a: any[]) => rentalInstallmentFindMany(...a)
    },
    rentalLease: { findFirst: (...a: any[]) => rentalLeaseFindFirst(...a) },
    crmContact: { findFirst: (...a: any[]) => crmContactFindFirst(...a) }
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { buildRentReceiptContext, buildRentStatementContext } from '../../src/services/document-context-builder';
import { renderDocx } from '../../src/services/docx-renderer';

// docxtemplater signale `setData` (utilise par docx-renderer) comme obsolete : bruit sans rapport.
beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

const MODELS_DIR = path.resolve(__dirname, '../../../../assets/modeles_documents');

/** Rend le vrai modele avec le vrai moteur et renvoie le texte du document. */
async function renderModelText(filename: string, context: Record<string, any>): Promise<string> {
  const buffer = await renderDocx(
    { id: 'tpl-test', storage_path: path.join(MODELS_DIR, filename), stored_filename: filename } as any,
    context
  );
  const xml = new PizZip(buffer).file('word/document.xml')!.asText();
  expect(xml).not.toContain('{{');
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(new RegExp('[\\u202f\\u00a0]', 'g'), ' ');
}

const agency = {
  id: 'agency-1',
  name: 'Agence Test',
  city: 'Abidjan',
  address: 'Cocody, rue 12',
  contactPhone: '+225 27 00 00 00',
  contactEmail: 'contact@agence.test'
};

const lease = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  lease_number: 'BAIL-2026-001',
  currency: 'FCFA',
  rent_amount: 120000,
  property: { address: '12 rue des Palmiers, Cocody', propertyType: 'MAISON_VILLA', owner: null },
  primaryRenter: {
    id: 'renter-1',
    user: { id: 'u1', email: 'locataire@test.ci', fullName: 'Awa Koné' },
    details: { phone: '+225 07 11 22 33' }
  },
  ownerClient: {
    id: 'owner-1',
    user: { id: 'u2', email: 'bailleur@test.ci', fullName: 'Moussa Traoré' },
    details: null
  },
  tenant: agency
};

const installment = (month: number, overrides: Record<string, any> = {}) => ({
  id: `inst-${month}`,
  period_year: 2026,
  period_month: month,
  due_date: new Date(2026, month - 1, 5),
  status: 'DUE',
  currency: 'FCFA',
  amount_rent: 120000,
  amount_service: 15000,
  amount_other_fees: 0,
  penalty_amount: 0,
  amount_paid: 0,
  ...overrides
});

function payment(amount: number, allocations: Array<{ installment: any; amount: number }>) {
  return {
    id: 'bbbbbbbb-1111-2222-3333-444444444444',
    lease_id: lease.id,
    method: 'BANK_TRANSFER',
    currency: 'FCFA',
    amount,
    psp_reference: null,
    psp_transaction_id: null,
    initiated_at: new Date(2026, 5, 7),
    succeeded_at: new Date(2026, 5, 8),
    lease,
    renterClient: null,
    allocations: allocations.map(a => ({
      installment_id: a.installment.id,
      amount: a.amount,
      installment: a.installment
    }))
  };
}

describe('buildRentReceiptContext + Reçu_Loyer.docx', () => {
  beforeEach(() => jest.clearAllMocks());

  it("quittance d'un paiement complet : tous les champs du modele sont remplis", async () => {
    const june = installment(6, { amount_paid: 135000, status: 'PAID' });
    rentalPaymentFindFirst.mockResolvedValue(payment(135000, [{ installment: june, amount: 135000 }]));
    rentalInstallmentFindFirst.mockResolvedValue(june);

    const context = await buildRentReceiptContext('agency-1', 'pay-1');

    // Cles historiques conservees
    expect(context).toEqual(
      expect.objectContaining({
        AGENCE_NOM: 'Agence Test',
        BIEN_ADRESSE: '12 rue des Palmiers, Cocody',
        BAIL_NUMERO: 'BAIL-2026-001',
        PAIEMENT_NUMERO: 'BBBBBBBB',
        PERIODE_MOIS: '6/2026'
      })
    );
    expect(context.PERIODE_LOYER).toBe('juin 2026');
    expect(context.RECU_NUMERO).toBe('BBBBBBBB');
    expect(context.REFERENCE_PAIEMENT).toBe('BBBBBBBB');

    const text = await renderModelText('Reçu_Loyer.docx', context);
    expect(text).toContain('juin 2026');
    expect(text).toContain('Awa Koné');
    expect(text).toContain('Moussa Traoré');
    expect(text).toContain('Virement bancaire');
    expect(text).toContain('Maison / Villa');
    expect(text).toContain('120 000');
    expect(text).toContain('15 000');
    expect(text).toContain('135 000 FCFA');
    expect(text).toContain('BAIL-2026-001');
    expect(text).toContain('Abidjan');
    expect(context.DEVISE).toBe('FCFA');
    expect(text).toContain('Montant FCFA');
  });

  it('devise du paiement : DEVISE suit la devise, le modele ne dit plus FCFA en dur', async () => {
    const june = installment(6, { amount_paid: 135000, status: 'PAID' });
    rentalPaymentFindFirst.mockResolvedValue({
      ...payment(135000, [{ installment: june, amount: 135000 }]),
      currency: 'EUR'
    });
    rentalInstallmentFindFirst.mockResolvedValue(june);

    const context = await buildRentReceiptContext('agency-1', 'pay-1');
    expect(context.DEVISE).toBe('EUR');

    const text = await renderModelText('Reçu_Loyer.docx', context);
    expect(text).toContain('135 000 EUR');
    expect(text).toContain('Montant EUR');
    expect(text).not.toContain('FCFA');
  });

  it('numero du recu : le contexte porte la reference du paiement, generateDocument la remplace par RCU-… avant le rendu', async () => {
    const june = installment(6, { amount_paid: 135000, status: 'PAID' });
    rentalPaymentFindFirst.mockResolvedValue(payment(135000, [{ installment: june, amount: 135000 }]));
    rentalInstallmentFindFirst.mockResolvedValue(june);

    const context = await buildRentReceiptContext('agency-1', 'pay-1');
    context.RECU_NUMERO = 'RCU-202606-0042';

    const text = await renderModelText('Reçu_Loyer.docx', context);
    expect(text).toContain('N° Reçu : RCU-202606-0042');
  });

  it('paiement partiel : le loyer est rempli en premier, le total egale le montant paye', async () => {
    const june = installment(6, { amount_paid: 100000, status: 'PARTIAL' });
    rentalPaymentFindFirst.mockResolvedValue(payment(100000, [{ installment: june, amount: 100000 }]));
    rentalInstallmentFindFirst.mockResolvedValue(june);

    const context = await buildRentReceiptContext('agency-1', 'pay-1');
    expect(context.MONTANT_LOYER).toMatch(/^100\D000$/);
    expect(context.MONTANT_CHARGES).toBe('0');
    expect(context.MONTANT_PENALITES).toBe('0');
    expect(context.MONTANT_TOTAL).toMatch(/^100\D000$/);

    const text = await renderModelText('Reçu_Loyer.docx', context);
    expect(text).toContain('100 000 FCFA');
  });

  it('paiement couvrant deux echeances (penalite comprise) : plage de periodes et total exact', async () => {
    const may = installment(5, { penalty_amount: 5000, amount_paid: 140000 });
    const june = installment(6, { amount_paid: 135000 });
    rentalPaymentFindFirst.mockResolvedValue(
      payment(275000, [
        { installment: may, amount: 140000 },
        { installment: june, amount: 135000 }
      ])
    );
    rentalInstallmentFindFirst.mockResolvedValue(may);

    const context = await buildRentReceiptContext('agency-1', 'pay-1');
    expect(context.PERIODE_LOYER).toBe('mai 2026 à juin 2026');
    expect(context.MONTANT_LOYER).toMatch(/^240\D000$/);
    expect(context.MONTANT_CHARGES).toMatch(/^30\D000$/);
    expect(context.MONTANT_PENALITES).toMatch(/^5\D000$/);
    expect(context.MONTANT_TOTAL).toMatch(/^275\D000$/);
    await renderModelText('Reçu_Loyer.docx', context);
  });

  it('donnees optionnelles absentes : « — » lisible, jamais un champ en clair', async () => {
    const june = installment(6);
    const bare = payment(50000, [{ installment: june, amount: 50000 }]);
    bare.lease = {
      ...lease,
      ownerClient: null as any,
      primaryRenter: { ...lease.primaryRenter, details: null as any },
      tenant: { ...agency, city: null as any, address: null as any, contactPhone: null as any }
    };
    rentalPaymentFindFirst.mockResolvedValue(bare);
    rentalInstallmentFindFirst.mockResolvedValue(june);

    const context = await buildRentReceiptContext('agency-1', 'pay-1');
    // Sans proprietaire connu, l'agence gestionnaire figure comme bailleur.
    expect(context.BAILLEUR_NOM).toBe('Agence Test');
    expect(context.BAILLEUR_TELEPHONE).toBe('—');
    expect(context.LIEU_EMISSION).toBe('—');
    expect(context.LOCATAIRE_TELEPHONE).toBe('—');

    const text = await renderModelText('Reçu_Loyer.docx', context);
    expect(text).toContain('Agence Test');
  });
});

describe('buildRentStatementContext + Releve_Compte.docx', () => {
  beforeEach(() => jest.clearAllMocks());

  const start = new Date(2026, 3, 1);
  const end = new Date(2026, 8, 30);

  it('releve de plusieurs echeances : lignes, totaux et solde final coherents', async () => {
    // 5 echeances (avril a aout) : la 3e ligne regroupe les trois dernieres.
    const installments = [
      installment(4, { amount_paid: 135000, status: 'PAID' }),
      installment(5, { amount_paid: 135000, status: 'PAID' }),
      installment(6, { amount_paid: 100000, status: 'PARTIAL' }),
      installment(7, { penalty_amount: 5000, status: 'OVERDUE' }),
      installment(8)
    ];
    rentalLeaseFindFirst.mockResolvedValue({ ...lease, installments });
    // Une echeance anterieure impayee de 20 000 : solde initial.
    rentalInstallmentFindMany.mockResolvedValue([
      {
        amount_rent: 15000,
        amount_service: 5000,
        amount_other_fees: 0,
        penalty_amount: 0,
        amount_paid: 0
      }
    ]);

    const context = await buildRentStatementContext('agency-1', lease.id, start, end);

    // Cles historiques conservees
    expect(context.TOTAL_DU).toMatch(/^680\D000 FCFA$/);
    expect(context.ECHEANCES).toHaveLength(5);

    // Solde initial + du - paye = solde final (20 000 + 680 000 - 370 000 = 330 000)
    expect(context.SOLDE_INITIAL).toMatch(/^20\D000 FCFA$/);
    expect(context.TOTAL_LOYERS).toMatch(/^600\D000 FCFA$/);
    expect(context.TOTAL_CHARGES).toMatch(/^75\D000 FCFA$/);
    expect(context.TOTAL_PENALITES).toMatch(/^5\D000 FCFA$/);
    expect(context.TOTAL_PAIEMENTS).toMatch(/^370\D000 FCFA$/);
    expect(context.SOLDE_FINAL).toMatch(/^330\D000 FCFA$/);
    expect(context.OP_SOLDE_3).toBe(context.SOLDE_FINAL);
    expect(context.RELEVE_REFERENCE).toBe('RLV-BAIL-2026-001-202604');
    expect(context.OBSERVATIONS).toContain('regroupées');

    const text = await renderModelText('Releve_Compte.docx', context);
    expect(text).toContain('Awa Koné');
    expect(text).toContain('Moussa Traoré');
    expect(text).toContain('RLV-BAIL-2026-001-202604');
    expect(text).toContain('Échéance avril 2026');
    expect(text).toContain('Échéances juin 2026 à août 2026');
    expect(text).toContain('330 000 FCFA');
    expect(context.DEVISE).toBe('FCFA');
    expect(text).toContain('Montant (FCFA)');
  });

  it('releve court : lignes inutilisees a « — », sans champ en clair', async () => {
    rentalLeaseFindFirst.mockResolvedValue({ ...lease, installments: [installment(6, { amount_paid: 135000 })] });
    rentalInstallmentFindMany.mockResolvedValue([]);

    const context = await buildRentStatementContext('agency-1', lease.id, start, end);
    expect(context.SOLDE_INITIAL).toBe('0 FCFA');
    expect(context.SOLDE_FINAL).toBe('0 FCFA');
    expect(context.OP_LIBELLE_2).toBe('—');
    expect(context.OP_SOLDE_3).toBe('—');
    expect(context.OBSERVATIONS).toBe('—');

    const text = await renderModelText('Releve_Compte.docx', context);
    expect(text).toContain('Échéance juin 2026');
  });

  it('releve sans echeance : observation explicite', async () => {
    rentalLeaseFindFirst.mockResolvedValue({ ...lease, installments: [] });
    rentalInstallmentFindMany.mockResolvedValue([]);

    const context = await buildRentStatementContext('agency-1', lease.id, start, end);
    expect(context.OBSERVATIONS).toBe('Aucune échéance sur la période.');
    await renderModelText('Releve_Compte.docx', context);
  });
});
