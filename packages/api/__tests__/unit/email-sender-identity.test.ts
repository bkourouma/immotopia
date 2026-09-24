/**
 * Tests de `services/email-service.ts` — identite d'envoi par agence (lot H).
 *
 * Verifie : nom d'expediteur "<Agence> via ImmoTopia" et Reply-To =
 * contactEmail de l'agence, quand une agence est identifiable (option
 * explicite `tenantId` OU contexte ambiant `getCurrentTenantId()`) ; repli sur
 * "ImmoTopia" sans Reply-To sinon ; cache 5 minutes (pas de second appel a
 * `prisma.tenant.findUnique` tant qu'il n'a pas expire).
 */

const sendMailMock = jest.fn(async (..._args: any[]) => ({ messageId: 'mock-message-id' }));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: (...args: any[]) => sendMailMock(...args) })
}));

const tenantFindUniqueMock = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: { tenant: { findUnique: (...args: any[]) => tenantFindUniqueMock(...args) } }
}));

import { emailService } from '../../src/services/email-service';
import { runWithTenantContext } from '../../src/utils/tenant-context';

const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  // `sendEmail` court-circuite l'envoi quand NODE_ENV=test (mis par
  // __tests__/setup.ts), sauf ENABLE_EMAILS=1 — exactement le mecanisme prevu
  // pour les tests manuels (voir env.example). Sans lui, `sendMail` ne serait
  // jamais appele et ce fichier ne testerait rien.
  process.env.ENABLE_EMAILS = '1';
  process.env.EMAIL_FROM = 'noreply@immotopia.com';
});

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
});

beforeEach(() => {
  sendMailMock.mockClear();
  tenantFindUniqueMock.mockReset();
});

describe("Identite d'envoi par agence (lot H)", () => {
  it("sans agence identifiable (ni option, ni contexte ambiant) : expediteur ImmoTopia, pas de Reply-To", async () => {
    await emailService.sendPasswordResetEmail('user@example.com', 'reset-token');

    expect(tenantFindUniqueMock).not.toHaveBeenCalled();
    const call: any = sendMailMock.mock.calls[0]![0];
    expect(call.from).toBe('"ImmoTopia" <noreply@immotopia.com>');
    expect(call.replyTo).toBeUndefined();
  });

  it("avec tenantId explicite (sendInviteEmail) : expediteur '<Agence> via ImmoTopia', Reply-To = contactEmail", async () => {
    tenantFindUniqueMock.mockResolvedValueOnce({ name: 'Agence Kipe', contactEmail: 'contact@agence-kipe.example.com' });

    await emailService.sendInviteEmail(
      'admin@example.com',
      'plain-token',
      'Agence Kipe',
      ["Administrateur de l'agence"],
      new Date(),
      'tenant-kipe'
    );

    expect(tenantFindUniqueMock).toHaveBeenCalledWith({
      where: { id: 'tenant-kipe' },
      select: { name: true, contactEmail: true }
    });
    const call: any = sendMailMock.mock.calls[0]![0];
    expect(call.from).toBe('"Agence Kipe via ImmoTopia" <noreply@immotopia.com>');
    expect(call.replyTo).toBe('contact@agence-kipe.example.com');
  });

  it("agence sans contactEmail : nom d'agence dans le From, mais pas de Reply-To", async () => {
    tenantFindUniqueMock.mockResolvedValueOnce({ name: 'Agence Sans Contact', contactEmail: null });

    await emailService.sendInviteEmail('x@example.com', 'tok', 'Agence Sans Contact', [], new Date(), 'tenant-sc');

    const call: any = sendMailMock.mock.calls[0]![0];
    expect(call.from).toBe('"Agence Sans Contact via ImmoTopia" <noreply@immotopia.com>');
    expect(call.replyTo).toBeUndefined();
  });

  it('sans option explicite, retombe sur le contexte ambiant getCurrentTenantId() (pose par requireTenantAccess/les jobs)', async () => {
    tenantFindUniqueMock.mockResolvedValueOnce({ name: 'Agence Ambiante', contactEmail: 'contact@ambiante.example.com' });

    await runWithTenantContext({ tenantId: 'tenant-ambiant' }, async () => {
      await emailService.sendPasswordResetEmail('user2@example.com', 'reset-token-2');
    });

    expect(tenantFindUniqueMock).toHaveBeenCalledWith({
      where: { id: 'tenant-ambiant' },
      select: { name: true, contactEmail: true }
    });
    const call: any = sendMailMock.mock.calls[0]![0];
    expect(call.from).toBe('"Agence Ambiante via ImmoTopia" <noreply@immotopia.com>');
    expect(call.replyTo).toBe('contact@ambiante.example.com');
  });

  it('option tenantId explicite prioritaire sur le contexte ambiant', async () => {
    tenantFindUniqueMock.mockResolvedValueOnce({ name: 'Agence Explicite', contactEmail: 'contact@explicite.example.com' });

    await runWithTenantContext({ tenantId: 'tenant-ambiant-ignore' }, async () => {
      await emailService.sendInviteEmail('x@example.com', 'tok', 'Agence Explicite', [], new Date(), 'tenant-explicite');
    });

    expect(tenantFindUniqueMock).toHaveBeenCalledWith({
      where: { id: 'tenant-explicite' },
      select: { name: true, contactEmail: true }
    });
  });

  it("cache 5 minutes : deux envois pour la meme agence ne relisent qu'une fois", async () => {
    tenantFindUniqueMock.mockResolvedValueOnce({ name: 'Agence Cachee', contactEmail: 'contact@cachee.example.com' });

    await emailService.sendInviteEmail('a@example.com', 't1', 'Agence Cachee', [], new Date(), 'tenant-cache');
    await emailService.sendInviteEmail('b@example.com', 't2', 'Agence Cachee', [], new Date(), 'tenant-cache');

    expect(tenantFindUniqueMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    for (const call of sendMailMock.mock.calls as any[][]) {
      expect((call as any)[0].from).toBe('"Agence Cachee via ImmoTopia" <noreply@immotopia.com>');
    }
  });

  it('agence introuvable : repli silencieux sur ImmoTopia, aucune levee', async () => {
    tenantFindUniqueMock.mockResolvedValueOnce(null);

    await expect(
      emailService.sendInviteEmail('x@example.com', 'tok', 'Peu importe', [], new Date(), 'tenant-inconnu')
    ).resolves.toBeUndefined();

    const call: any = sendMailMock.mock.calls[0]![0];
    expect(call.from).toBe('"ImmoTopia" <noreply@immotopia.com>');
    expect(call.replyTo).toBeUndefined();
  });
});
