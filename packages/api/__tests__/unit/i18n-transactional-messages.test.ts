/**
 * BUG-2026-09-30-004 / 005 : e-mails d'authentification et message de doublon
 * de contact rendus dans la langue de l'utilisateur.
 */
import { emailService } from '../../src/services/email-service';
import { runWithLanguage } from '../../src/i18n';
import { AppError, ConflictError } from '../../src/middleware/error-middleware';
import { respondWithAppError } from '../../src/utils/app-error-response';

jest.mock('../../src/utils/database', () => ({
  prisma: { crmContact: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) } }
}));

describe("e-mails d'authentification traduits", () => {
  let sendEmail: jest.SpyInstance;

  beforeEach(() => {
    sendEmail = jest.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);
  });
  afterEach(() => sendEmail.mockRestore());

  const sent = () => sendEmail.mock.calls[0][0] as { subject: string; html: string };

  it('reinitialisation : francais par defaut, jamais anglais brut', async () => {
    await emailService.sendPasswordResetEmail('a@exemple.test', 'tok', { userName: 'Awa' });
    expect(sent().subject).toBe('Réinitialisation de votre mot de passe - ImmoTopia');
    expect(sent().html).toContain('Bonjour Awa');
    expect(sent().html).not.toMatch(/Reset your password|You requested/);
  });

  it('reinitialisation : la preference du compte prime sur la requete', async () => {
    await runWithLanguage('en', () =>
      emailService.sendPasswordResetEmail('a@exemple.test', 'tok', { userName: 'Awa', language: 'fr' })
    );
    expect(sent().subject).toContain('Réinitialisation');
  });

  it('reinitialisation : sans preference, langue de la requete (en)', async () => {
    await runWithLanguage('en', () => emailService.sendPasswordResetEmail('a@exemple.test', 'tok'));
    expect(sent().subject).toBe('Reset your password - ImmoTopia');
    expect(sent().html).toContain('lang="en"');
  });

  it('reinitialisation : arabe, ecriture droite-a-gauche', async () => {
    await emailService.sendPasswordResetEmail('a@exemple.test', 'tok', { userName: 'Awa', language: 'ar' });
    expect(sent().subject).toBe('إعادة تعيين كلمة مرورك - ImmoTopia');
    expect(sent().html).toContain('dir="rtl"');
  });

  it('verification : sujet et corps traduits', async () => {
    await emailService.sendVerificationEmail('a@exemple.test', 'tok', { userName: 'Awa', language: 'en' });
    expect(sent().subject).toBe('Verify your email address - ImmoTopia');
    expect(sent().html).not.toContain('Welcome to Immobillier');
  });
});

describe('doublon de contact CRM', () => {
  it('leve un ConflictError traduit et rattache au champ email', async () => {
    const { createContact } = await import('../../src/services/crm-contact-service');
    const data = { firstName: 'A', lastName: 'B', email: 'awa@exemple.test' } as never;

    const fr = await createContact('t1', data).catch(e => e);
    expect(fr).toBeInstanceOf(ConflictError);
    expect(fr.message).toBe("Un contact avec l'e-mail awa@exemple.test existe déjà dans cette agence");

    const en = await runWithLanguage('en', () => createContact('t1', data).catch(e => e));
    expect(en.message).toBe('A contact with the email awa@exemple.test already exists in this agency');
    expect(en.errors).toEqual([{ field: 'email', message: 'A contact with this email already exists in the agency' }]);

    const ar = await runWithLanguage('ar', () => createContact('t1', data).catch(e => e));
    expect(ar.message).toContain('awa@exemple.test');
    expect(ar.message).not.toMatch(/already exists/);
  });

  it('respondWithAppError renvoie 409 avec le message traduit', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as never as import('express').Response;
    const handled = runWithLanguage('en', () =>
      respondWithAppError(res, new ConflictError("Un contact avec cet e-mail existe déjà dans l'agence"))
    );
    expect(handled).toBe(true);
    expect(res.status).toHaveBeenCalledWith(409);
    expect((res.json as jest.Mock).mock.calls[0][0].message).toBe(
      'A contact with this email already exists in the agency'
    );
    expect(respondWithAppError(res, new Error('x'))).toBe(false);
    expect(respondWithAppError(res, new AppError('boom', 500))).toBe(false);
  });
});
