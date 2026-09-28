/**
 * `lib/patrimoine/notifications.ts` — `sendOwnerStatement`.
 *
 * Mock à la frontière `utils/database`, comme l'exige `.claude/rules/testing.md`
 * pour un test de service ; les autres dépendances (config des notifications,
 * envoi d'e-mail, envoi WhatsApp) sont aussi mockées, chaque factory couvrant
 * tous les exports utilisés par le fichier testé (AGENTS.md).
 */

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

const getEmailNotificationConfig = jest.fn();
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...a: any[]) => getEmailNotificationConfig(...a)
}));

const sendEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...a: any[]) => sendEmail(...a) }
}));

const sendWhatsappNotification = jest.fn();
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: (...a: any[]) => sendWhatsappNotification(...a)
}));

import { ConflictError } from '../../src/middleware/error-middleware';
import { sendOwnerStatement } from '../../src/lib/patrimoine/notifications';

const TENANT = 'tenant-1';
const STATEMENT_ID = 'statement-1';

function baseStatement(overrides: Record<string, unknown> = {}) {
  return {
    id: STATEMENT_ID,
    tenantId: TENANT,
    period: '2026-01',
    currency: 'XOF',
    totalRentDue: 500_000,
    totalRevenue: 500_000,
    totalArrears: 0,
    totalManagementFees: 50_000,
    totalManagementFeesVat: 9_000,
    totalExpenses: 0,
    netAmount: 441_000,
    owner: {
      firstName: 'Awa',
      lastName: 'Koné',
      email: 'awa@example.com',
      consentEmail: true,
      whatsappNumber: null,
      phonePrimary: '+2250700000000'
    },
    items: [{ label: 'Loyer janvier', amount: 500_000, property: { internalReference: 'REF-1' } }],
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getEmailNotificationConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  sendWhatsappNotification.mockResolvedValue(false);
  sendEmail.mockResolvedValue(undefined);
  ownerStatementUpdate.mockResolvedValue(undefined);
});

describe('sendOwnerStatement — consentement e-mail du propriétaire', () => {
  it("refuse en 409 quand le propriétaire n'a pas consenti (consentEmail: false)", async () => {
    ownerStatementFindFirst.mockResolvedValue(
      baseStatement({ owner: { ...baseStatement().owner, consentEmail: false } })
    );

    await expect(sendOwnerStatement(STATEMENT_ID, TENANT)).rejects.toMatchObject({
      statusCode: 409
    });
    await expect(sendOwnerStatement(STATEMENT_ID, TENANT)).rejects.toBeInstanceOf(ConflictError);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuse en 409 quand le consentement n'est pas renseigné (consentEmail: null)", async () => {
    ownerStatementFindFirst.mockResolvedValue(
      baseStatement({ owner: { ...baseStatement().owner, consentEmail: null } })
    );

    await expect(sendOwnerStatement(STATEMENT_ID, TENANT)).rejects.toBeInstanceOf(ConflictError);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('envoie le relevé quand le propriétaire a explicitement consenti', async () => {
    ownerStatementFindFirst.mockResolvedValue(baseStatement());

    const result = await sendOwnerStatement(STATEMENT_ID, TENANT);

    expect(result.sent).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    // La deuxieme requete Prisma (mise a jour du statut) reste filtree par tenant.
    expect(ownerStatementUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: STATEMENT_ID, tenantId: TENANT } })
    );
  });
});

describe("sendOwnerStatement — echappement d'un libelle de depense malveillant", () => {
  const XSS_LABEL = '<script>alert(1)</script>';

  it('echappe le libelle dans le corps HTML, et le laisse intact dans le message WhatsApp', async () => {
    ownerStatementFindFirst.mockResolvedValue(
      baseStatement({
        items: [{ label: XSS_LABEL, amount: 500_000, property: { internalReference: 'REF-1' } }],
        owner: { ...baseStatement().owner, whatsappNumber: '+2250700000000' }
      })
    );

    await sendOwnerStatement(STATEMENT_ID, TENANT);

    const emailArgs = sendEmail.mock.calls[0][0];
    expect(emailArgs.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(emailArgs.html).not.toContain(XSS_LABEL);
    // Le sujet de ce modele ne reprend pas les lignes du releve : il reste
    // donc, de fait, non corrompu par un libelle malveillant.
    expect(emailArgs.subject).not.toContain('script');

    expect(sendWhatsappNotification).toHaveBeenCalledTimes(1);
    const whatsappArgs = sendWhatsappNotification.mock.calls[0][0];
    // Canal texte brut, jamais de HTML a interpreter : le libelle part intact.
    expect(whatsappArgs.variables.statementLines).toContain(XSS_LABEL);
  });
});
