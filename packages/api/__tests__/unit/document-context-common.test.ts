/**
 * Contexte commun des modeles DOCX locatifs : EMETTEUR_*, COPROPRIETE_*,
 * DATE_EMISSION_DOCUMENT, REFERENCE_DOCUMENT et images, sans casser les
 * balises historiques (AGENCE_*, BAILLEUR_*, ...).
 */
import PizZip from 'pizzip';

const rentalPaymentFindFirst = jest.fn();
const rentalInstallmentFindFirst = jest.fn();
const rentalInstallmentFindMany = jest.fn();
const rentalLeaseFindFirst = jest.fn();
const crmContactFindFirst = jest.fn();
const tenantFindUnique = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalPayment: { findFirst: (...a: any[]) => rentalPaymentFindFirst(...a) },
    rentalInstallment: {
      findFirst: (...a: any[]) => rentalInstallmentFindFirst(...a),
      findMany: (...a: any[]) => rentalInstallmentFindMany(...a)
    },
    rentalLease: { findFirst: (...a: any[]) => rentalLeaseFindFirst(...a) },
    crmContact: { findFirst: (...a: any[]) => crmContactFindFirst(...a) },
    tenant: { findUnique: (...a: any[]) => tenantFindUnique(...a) },
    syndicate: { findFirst: jest.fn() }
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { buildRentReceiptContext, buildRentStatementContext } from '../../src/services/document-context-builder';
import { renderDocxBuffer } from '../../src/services/docx-renderer';
import { buildStandardTemplate } from '../../src/lib/documents/docx-standard-templates';

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

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
    details: null
  },
  ownerClient: {
    id: 'owner-1',
    user: { id: 'u2', email: 'bailleur@test.ci', fullName: 'Moussa Traoré' },
    details: null
  },
  tenant: agency
};

const june = {
  id: 'inst-6',
  period_year: 2026,
  period_month: 6,
  due_date: new Date(2026, 5, 5),
  status: 'PAID',
  currency: 'FCFA',
  amount_rent: 120000,
  amount_service: 15000,
  amount_other_fees: 0,
  penalty_amount: 0,
  amount_paid: 135000
};

const payment = {
  id: 'bbbbbbbb-1111-2222-3333-444444444444',
  lease_id: lease.id,
  method: 'BANK_TRANSFER',
  currency: 'FCFA',
  amount: 135000,
  psp_reference: null,
  psp_transaction_id: null,
  initiated_at: new Date(2026, 5, 7),
  succeeded_at: new Date(2026, 5, 8),
  lease,
  renterClient: null,
  allocations: [{ installment_id: june.id, amount: 135000, installment: june }]
};

const tenantRow = {
  name: 'Agence Test',
  legalName: null,
  address: 'Cocody, rue 12',
  city: 'Abidjan',
  country: null,
  contactPhone: '+225 27 00 00 00',
  contactEmail: 'contact@agence.test',
  logoUrl: null,
  documentSignaturePath: null,
  documentStampPath: null,
  financeSettings: { taxpayerNumber: '2012345A' }
};

const textOf = (buffer: Buffer, part: string): string =>
  new PizZip(buffer)
    .file(part)!
    .asText()
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '');

describe('contexte commun des documents locatifs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rentalPaymentFindFirst.mockResolvedValue(payment);
    rentalInstallmentFindFirst.mockResolvedValue(june);
    tenantFindUnique.mockResolvedValue(tenantRow);
  });

  it("la quittance garde ses balises et reçoit l'identité de l'agence", async () => {
    const context = await buildRentReceiptContext('agency-1', 'pay-1');

    expect(context).toMatchObject({
      AGENCE_NOM: 'Agence Test',
      BAIL_NUMERO: 'BAIL-2026-001',
      RECU_NUMERO: 'BBBBBBBB',
      EMETTEUR_NOM: 'Agence Test',
      EMETTEUR_ADRESSE: 'Cocody, rue 12, Abidjan',
      EMETTEUR_TELEPHONE: '+225 27 00 00 00',
      EMETTEUR_EMAIL: 'contact@agence.test',
      EMETTEUR_NCC: '2012345A',
      EMETTEUR_RCCM: '',
      COPROPRIETE_NOM: '',
      COPROPRIETE_IMMATRICULATION: '',
      REFERENCE_DOCUMENT: 'BBBBBBBB'
    });
    expect(context.DATE_EMISSION_DOCUMENT).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(context.__images).toEqual({
      LOGO_EMETTEUR: null,
      LOGO_COPROPRIETE: null,
      SIGNATURE_EMETTEUR: null,
      CACHET_EMETTEUR: null
    });
  });

  it('le rendu du reçu standard suit le numéro définitif de la quittance', async () => {
    const context = await buildRentReceiptContext('agency-1', 'pay-1');
    context.RECU_NUMERO = 'RCU-202606-0007';

    const rendered = renderDocxBuffer(buildStandardTemplate('recu_loyer'), context);

    const body = textOf(rendered, 'word/document.xml');
    expect(body).toContain('RCU-202606-0007');
    expect(body).not.toContain('{{');
    // Identité vide (RCCM) : jamais le nom de la balise dans l'en-tête ni le pied.
    expect(textOf(rendered, 'word/footer1.xml')).toContain('Agence Test · NCC 2012345A');
    expect(textOf(rendered, 'word/header1.xml')).not.toMatch(/\{\{|LOGO_|@@/);
  });

  it('le relevé reçoit sa référence comme référence du document', async () => {
    rentalLeaseFindFirst.mockResolvedValue({ ...lease, installments: [june] });
    rentalInstallmentFindMany.mockResolvedValue([]);

    const context = await buildRentStatementContext('agency-1', lease.id, new Date(2026, 5, 1), new Date(2026, 5, 30));

    expect(context.REFERENCE_DOCUMENT).toBe(context.RELEVE_REFERENCE);
    expect(context.EMETTEUR_NOM).toBe('Agence Test');
  });

  it("l'identité est illisible : le document se construit quand même, en-tête vide", async () => {
    tenantFindUnique.mockRejectedValue(new Error('base indisponible'));

    const context = await buildRentReceiptContext('agency-1', 'pay-1');

    expect(context.AGENCE_NOM).toBe('Agence Test');
    expect(context.EMETTEUR_NOM).toBe('');
    expect(context.REFERENCE_DOCUMENT).toBe('BBBBBBBB');
  });
});
