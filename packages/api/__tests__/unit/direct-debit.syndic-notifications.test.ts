/**
 * Avis de rejet d'un prélèvement de charges — spec 042, P4 (data-model §9.3,
 * clé `SYNDIC_DIRECT_DEBIT_REJECTED`).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockLine = jest.fn();
const mockConfig = jest.fn();
const mockSend = jest.fn();
const mockWarn = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: { directDebitRemittanceLine: { findFirst: (...args: unknown[]) => mockLine(...args) } }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: (...args: unknown[]) => mockWarn(...args), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendSyndicDirectDebitRejected: (...args: unknown[]) => mockSend(...args) }
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...args: unknown[]) => mockConfig(...args)
}));

import { sendSyndicDirectDebitRejectionNotice } from '../../src/lib/direct-debit/syndic/notifications';

const TENANT = 'tenant-a';
const lineRow = (over: Record<string, unknown> = {}) => ({
  amount: 90000,
  rejectionCode: 'AC04',
  rejectionReason: 'Compte clôturé',
  mandate: { year: 2026, sequence: 1, ibanLast4: '0589' },
  lot: { lotNumber: 'A12' },
  debtorContact: {
    contactType: 'PERSON',
    firstName: 'Awa',
    lastName: 'Traoré',
    legalName: null,
    email: 'awa.traore@example.ci'
  },
  remittance: {
    collectionDate: new Date('2026-10-26T00:00:00Z'),
    tenant: { name: 'Agence Test' },
    syndicate: { name: 'Résidence Les Palmiers' }
  },
  ...over
});

beforeEach(() => {
  jest.clearAllMocks();
  mockLine.mockResolvedValue(lineRow());
  mockConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  mockSend.mockResolvedValue(undefined);
});

describe('syndic / avis de rejet', () => {
  it('envoie au contact débiteur, IBAN masqué, sans frais, avec la suspension du mandat si elle a eu lieu', async () => {
    const outcome = await sendSyndicDirectDebitRejectionNotice(TENANT, 'line-1', { suspended: true });

    expect(outcome).toBe('SENT');
    expect(mockConfig).toHaveBeenCalledWith(TENANT, 'SYNDIC_DIRECT_DEBIT_REJECTED');
    const [to, vars, options] = mockSend.mock.calls[0];
    expect(to).toBe('awa.traore@example.ci');
    expect(vars).toMatchObject({
      debtorName: 'Awa Traoré',
      agencyName: 'Agence Test',
      syndicateName: 'Résidence Les Palmiers',
      lotNumber: 'A12',
      mandateReference: 'MDT-2026-0001',
      collectionDate: '26/10/2026',
      reason: 'Compte clôturé',
      rejectFee: ''
    });
    expect(vars.ibanMasked).toContain('0589');
    expect(vars.suspensionNotice).toMatch(/suspendu/);
    expect(JSON.stringify(vars)).not.toMatch(/CI93/);
    expect(options).toMatchObject({ tenantId: TENANT });
  });

  it('sans suspension le message est vide ; sans motif libre il retombe sur le code puis sur un motif générique', async () => {
    await sendSyndicDirectDebitRejectionNotice(TENANT, 'line-1');
    expect(mockSend.mock.calls[0][1].suspensionNotice).toBe('');

    mockLine.mockResolvedValue(lineRow({ rejectionReason: null }));
    await sendSyndicDirectDebitRejectionNotice(TENANT, 'line-1');
    expect(mockSend.mock.calls[1][1].reason).toBe('AC04');

    mockLine.mockResolvedValue(lineRow({ rejectionReason: null, rejectionCode: null }));
    await sendSyndicDirectDebitRejectionNotice(TENANT, 'line-1');
    expect(mockSend.mock.calls[2][1].reason).toBe('Rejet par la banque');
  });

  it('lit la ligne de l agence et du périmètre copropriété seulement', async () => {
    await sendSyndicDirectDebitRejectionNotice(TENANT, 'line-1');
    expect(mockLine.mock.calls[0][0].where).toEqual({
      id: 'line-1',
      tenantId: TENANT,
      remittance: { scope: 'SYNDIC_LOT' }
    });
  });

  it('ne fait rien pour une ligne inconnue, d une autre agence ou locative', async () => {
    mockLine.mockResolvedValue(null);
    expect(await sendSyndicDirectDebitRejectionNotice(TENANT, 'line-x')).toBe('NOT_APPLICABLE');
    mockLine.mockResolvedValue(lineRow({ lot: null }));
    expect(await sendSyndicDirectDebitRejectionNotice(TENANT, 'line-1')).toBe('NOT_APPLICABLE');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('respecte la désactivation par l agence et l absence d adresse', async () => {
    mockConfig.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });
    expect(await sendSyndicDirectDebitRejectionNotice(TENANT, 'line-1')).toBe('DISABLED');

    mockConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
    mockLine.mockResolvedValue(lineRow({ debtorContact: { ...lineRow().debtorContact, email: ' ' } }));
    expect(await sendSyndicDirectDebitRejectionNotice(TENANT, 'line-1')).toBe('NO_EMAIL');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('applique le sujet et le corps personnalisés par l agence', async () => {
    mockConfig.mockResolvedValue({ enabled: true, subjectOverride: 'Sujet', bodyHtmlOverride: '<p>Corps</p>' });
    await sendSyndicDirectDebitRejectionNotice(TENANT, 'line-1');
    expect(mockSend.mock.calls[0][2].templateOverrides).toEqual({ subject: 'Sujet', bodyHtml: '<p>Corps</p>' });
  });

  it('ne lève jamais : un échec d envoi est journalisé sans adresse ni message du transport', async () => {
    mockSend.mockRejectedValue(new Error('550 awa.traore@example.ci refusé'));
    await expect(sendSyndicDirectDebitRejectionNotice(TENANT, 'line-1')).resolves.toBe('FAILED');
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain('awa.traore');
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain('refusé');
  });
});
