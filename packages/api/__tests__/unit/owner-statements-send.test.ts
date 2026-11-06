/** Envoi d'un relevé payé : le statut ne change pas (recette GL-10-018). */
const ownerStatementFindFirst = jest.fn();
const ownerStatementUpdate = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    ownerStatement: {
      findFirst: (...a: any[]) => ownerStatementFindFirst(...a),
      update: (...a: any[]) => ownerStatementUpdate(...a)
    }
  }
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest.fn(async () => ({ enabled: true, subjectOverride: null, bodyHtmlOverride: null }))
}));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: jest.fn(async () => undefined) }
}));
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: jest.fn(async () => false)
}));

import { sendOwnerStatement } from '../../src/lib/patrimoine/notifications';

function statement(status: string) {
  return {
    id: 's1',
    tenantId: 't1',
    status,
    period: '2026-09',
    currency: 'XOF',
    totalRentDue: 1,
    totalRevenue: 1,
    totalArrears: 0,
    totalManagementFees: 0,
    totalManagementFeesVat: 0,
    totalExpenses: 0,
    netAmount: 1,
    owner: {
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.c',
      consentEmail: true,
      whatsappNumber: null,
      phonePrimary: null
    },
    items: []
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  ownerStatementUpdate.mockResolvedValue(undefined);
});

describe('sendOwnerStatement : statut', () => {
  it('un relevé PAID reste PAID après envoi', async () => {
    ownerStatementFindFirst.mockResolvedValue(statement('PAID'));
    await sendOwnerStatement('s1', 't1');
    const data = ownerStatementUpdate.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
  });

  it.each(['DRAFT', 'SENT'])('un relevé %s passe à SENT', async status => {
    ownerStatementFindFirst.mockResolvedValue(statement(status));
    await sendOwnerStatement('s1', 't1');
    expect(ownerStatementUpdate.mock.calls[0][0].data.status).toBe('SENT');
  });
});
