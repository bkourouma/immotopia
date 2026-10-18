/**
 * Avis de prélèvement : destinataire masqué et provenance enregistrés à l'envoi
 * (spec 042, retour de recette §8.12). Compte portail d'abord, puis fiche
 * contact ; jamais l'adresse complète en base, en réponse ou en journal.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const TENANT = 'tenant-a';
const REMITTANCE = 'rem-1';

const mockState: { lines: Row[]; debtors: Row[]; contacts: Row[] } = { lines: [], debtors: [], contacts: [] };
const mockMail = { send: jest.fn(), config: jest.fn() };
const mockAudit = { log: jest.fn() };

const mockDb: Row = {
  directDebitRemittance: {
    findFirst: jest.fn(async () => ({
      year: 2026,
      sequence: 1,
      status: 'VALIDATED',
      collectionDate: new Date('2026-10-26T00:00:00Z'),
      creditorIdentifierSnapshot: 'CI-EMET-001',
      tenant: { name: 'Agence Test' }
    }))
  },
  directDebitRemittanceLine: {
    findMany: jest.fn(async () =>
      mockState.lines.map(line => {
        const debtor = mockState.debtors.find(entry => entry.id === line.debtorClientId) as Row;
        return {
          ...line,
          mandate: { year: 2026, sequence: 1, ibanLast4: '0589' },
          lease: { lease_number: 'BAIL-001' },
          installment: { period_year: 2026, period_month: 10 },
          debtor: { id: debtor.id, details: debtor.details ?? null, user: { fullName: debtor.fullName } }
        };
      })
    ),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = mockState.lines.filter(row => row.id === where.id && row.status === where.status);
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    })
  },
  tenantClient: {
    findMany: jest.fn(async ({ where }: Row) =>
      mockState.debtors
        .filter(row => where.id.in.includes(row.id))
        .map(row => ({ id: row.id, details: row.details ?? null, user: { email: row.email ?? null } }))
    )
  },
  crmContact: {
    findMany: jest.fn(async ({ where }: Row) =>
      mockState.contacts.filter(row => where.id.in.includes(row.id) && row.tenantId === where.tenantId)
    )
  }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockDb }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...args: unknown[]) => mockAudit.log(...args),
  recordAuditEvent: jest.fn()
}));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendDirectDebitPrenotification: (...args: unknown[]) => mockMail.send(...args) }
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...args: unknown[]) => mockMail.config(...args)
}));
jest.mock('../../src/lib/ai/advisory-lock', () => ({
  withExclusiveSection: jest.fn(async (_key: string, fn: () => Promise<unknown>) => fn())
}));

import { logger } from '../../src/utils/logger';
import { sendRemittancePrenotifications } from '../../src/lib/direct-debit/prenotification';

const line = (id: string, debtorClientId: string): Row => ({
  id,
  tenantId: TENANT,
  remittanceId: REMITTANCE,
  status: 'PENDING',
  amount: 100000,
  debtorClientId,
  prenotificationStatus: 'PENDING',
  prenotifiedAt: null,
  prenotificationRecipientMasked: null,
  prenotificationRecipientSource: null
});

beforeEach(() => {
  jest.clearAllMocks();
  mockState.debtors = [
    { id: 'c-account', fullName: 'Awa Traoré', email: 'awa.traore@example.test' },
    { id: 'c-contact', fullName: 'Koffi Yao', email: null, details: { crmContactId: 'contact-1' } },
    { id: 'c-none', fullName: 'Marie Kouassi', email: null },
    { id: 'c-foreign', fullName: 'Ibrahim Sylla', email: null, details: { crmContactId: 'contact-foreign' } }
  ];
  mockState.contacts = [
    { id: 'contact-1', tenantId: TENANT, email: 'koffi.yao@example.test', contactType: 'PERSON' },
    { id: 'contact-foreign', tenantId: 'tenant-b', email: 'etranger@example.test', contactType: 'PERSON' }
  ];
  mockState.lines = [
    line('l-account', 'c-account'),
    line('l-contact', 'c-contact'),
    line('l-none', 'c-none'),
    line('l-foreign', 'c-foreign')
  ];
  mockMail.config.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  mockMail.send.mockResolvedValue(undefined);
});

const row = (id: string) => mockState.lines.find(entry => entry.id === id) as Row;

describe('prénotification / destinataire enregistré', () => {
  it('enregistre l’adresse masquée et sa provenance, compte portail d’abord puis fiche contact', async () => {
    const counters = await sendRemittancePrenotifications(TENANT, REMITTANCE, 'user-1');

    expect(counters).toEqual({ sent: 2, noEmail: 2, disabled: 0, failed: 0 });
    expect(mockMail.send.mock.calls.map(call => call[0]).sort()).toEqual([
      'awa.traore@example.test',
      'koffi.yao@example.test'
    ]);

    expect(row('l-account')).toMatchObject({
      prenotificationStatus: 'SENT',
      prenotificationRecipientMasked: 'a•••@ex•••.test',
      prenotificationRecipientSource: 'ACCOUNT'
    });
    expect(row('l-contact')).toMatchObject({
      prenotificationStatus: 'SENT',
      prenotificationRecipientMasked: 'k•••@ex•••.test',
      prenotificationRecipientSource: 'CONTACT'
    });
  });

  it('sans adresse (ou avec un contact d’une autre agence) rien n’est enregistré', async () => {
    await sendRemittancePrenotifications(TENANT, REMITTANCE, 'user-1');
    for (const id of ['l-none', 'l-foreign']) {
      expect(row(id)).toMatchObject({
        prenotificationStatus: 'NO_EMAIL',
        prenotificationRecipientMasked: null,
        prenotificationRecipientSource: null
      });
    }
    expect(mockMail.send.mock.calls.map(call => call[0])).not.toContain('etranger@example.test');
  });

  it('un envoi échoué garde tout de même l’adresse tentée (masquée)', async () => {
    mockMail.send.mockRejectedValue(new Error('550 awa.traore@example.test refusé'));
    const counters = await sendRemittancePrenotifications(TENANT, REMITTANCE, 'user-1');
    expect(counters.failed).toBe(2);
    expect(row('l-account')).toMatchObject({
      prenotificationStatus: 'FAILED',
      prenotificationRecipientMasked: 'a•••@ex•••.test',
      prenotificationRecipientSource: 'ACCOUNT'
    });
  });

  it('désactivé : aucune adresse n’est enregistrée', async () => {
    mockMail.config.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });
    await sendRemittancePrenotifications(TENANT, REMITTANCE, 'user-1');
    expect(row('l-account')).toMatchObject({
      prenotificationStatus: 'DISABLED',
      prenotificationRecipientMasked: null,
      prenotificationRecipientSource: null
    });
    expect(mockMail.send).not.toHaveBeenCalled();
  });

  it('jamais l’adresse complète en base, au journal d’audit ou dans les logs', async () => {
    mockMail.send.mockRejectedValueOnce(new Error('550 koffi.yao@example.test refusé'));
    await sendRemittancePrenotifications(TENANT, REMITTANCE, 'user-1');
    const persisted = JSON.stringify(mockState.lines);
    const audited = JSON.stringify(mockAudit.log.mock.calls);
    const logged = JSON.stringify((logger.warn as jest.Mock).mock.calls);
    for (const text of [persisted, audited, logged]) {
      expect(text).not.toMatch(/@example\.test/);
      expect(text).not.toMatch(/awa\.traore|koffi\.yao/);
    }
  });
});
