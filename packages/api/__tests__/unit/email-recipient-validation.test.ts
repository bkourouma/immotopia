/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * FRI-08 : les adresses destinataires sont validees avant nodemailer
 * (injection d'en-tetes, liste d'adresses, forme « Nom <adresse> », longueur).
 * Une adresse invalide n'appelle jamais le transport et ne leve pas.
 */
const sendMailMock = jest.fn(async (..._args: any[]) => ({ messageId: 'mock-message-id' }));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: (...args: any[]) => sendMailMock(...args), verify: jest.fn() })
}));

jest.mock('../../src/utils/database', () => ({
  prisma: { tenant: { findUnique: jest.fn(async () => null) } }
}));

import { emailService } from '../../src/services/email-service';
import { sendEmail as providerSendEmail } from '../../src/services/providers/email.provider';
import {
  isSafeEmailAddress,
  sanitizeRecipients,
  maskEmailForLog,
  normalizeRecipientAddress,
  sendVerificationEmail,
  sendPasswordResetEmail
} from '../../src/utils/email-utils';
import { env } from '../../src/config/env';

const VALID = [
  'a@b.com',
  'jean.dupont+newsletter@mail.agence.example.co.ci',
  "o'neil@exemple.fr",
  'x_y-z@sub.domain.org'
];

const INVALID: Array<[string, string]> = [
  ['injection CRLF', 'a@b.com\r\nBcc: x@y.com'],
  ['injection LF', 'a@b.com\nBcc: x@y.com'],
  ['caractere nul', 'a@b.com\u0000'],
  ['deux adresses (virgule)', 'a@b.com, c@d.com'],
  ['deux adresses (point-virgule)', 'a@b.com;c@d.com'],
  ['forme Nom <adresse>', '"x"<a@b.com>'],
  ['chevrons', '<a@b.com>'],
  ['espace', 'a b@c.com'],
  ['sans domaine', 'a@'],
  ['sans arobase', 'abc.def'],
  ['sans point dans le domaine', 'a@localhost'],
  ['chaine vide', ''],
  ['trop longue (> 254)', `${'a'.repeat(60)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`],
  ['partie locale > 64', `${'a'.repeat(65)}@b.com`]
];

describe('isSafeEmailAddress / sanitizeRecipients', () => {
  it.each(VALID)('accepte %s', address => {
    expect(isSafeEmailAddress(address)).toBe(true);
    expect(sanitizeRecipients(address)).toEqual([address]);
  });

  it.each(INVALID)('rejette : %s', (_label, address) => {
    expect(isSafeEmailAddress(address)).toBe(false);
    expect(sanitizeRecipients(address)).toEqual([]);
  });

  it('254 caracteres acceptes, 255 refuses', () => {
    const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`;
    const ok = `${'a'.repeat(254 - domain.length - 1)}@${domain}`;
    expect(ok).toHaveLength(254);
    expect(isSafeEmailAddress(ok)).toBe(true);
    expect(isSafeEmailAddress(`a${ok}`)).toBe(false);
  });

  it('valide chaque element d un tableau et garde les adresses sures', () => {
    expect(sanitizeRecipients(['a@b.com', 'a@b.com\r\nBcc: x@y.com', 'c@d.org'])).toEqual(['a@b.com', 'c@d.org']);
    expect(sanitizeRecipients(null)).toEqual([]);
    expect(sanitizeRecipients(undefined)).toEqual([]);
  });

  // C5 : espaces/tabulations de BORD tolérés (version rognée transmise), reste refusé.
  it("accepte ' a@b.com ' et renvoie la version rognée", () => {
    expect(isSafeEmailAddress(' a@b.com ')).toBe(true);
    expect(isSafeEmailAddress('\ta@b.com\t')).toBe(true);
    expect(normalizeRecipientAddress(' a@b.com ')).toBe('a@b.com');
    expect(sanitizeRecipients(' a@b.com ')).toEqual(['a@b.com']);
  });

  it.each([
    ['CRLF de bord', 'a@b.com\r\n'],
    ['LF de bord', '\na@b.com'],
    ['CRLF puis en-tete', 'a@b.com\r\nBcc: x@y.com'],
    ['tabulation interne', 'a@\tb.com'],
    ['espace interne', 'a@ b.com'],
    ['uniquement des espaces', '   ']
  ])('rejette malgre le rognage : %s', (_label, address) => {
    expect(isSafeEmailAddress(address)).toBe(false);
    expect(sanitizeRecipients(address)).toEqual([]);
  });

  it('refuse un type non chaine', () => {
    expect(isSafeEmailAddress(undefined)).toBe(false);
    expect(isSafeEmailAddress(42)).toBe(false);
  });

  it('maskEmailForLog masque la partie locale et retire les caracteres de controle', () => {
    expect(maskEmailForLog('jean@exemple.fr')).toBe('j***@exemple.fr');
    expect(maskEmailForLog('a@b.com\r\nBcc: x@y.com')).not.toMatch(/[\r\n]/);
    expect(maskEmailForLog('sans-arobase')).toBe('***');
  });
});

describe('EmailService.sendEmail : adresse invalide', () => {
  const ORIGINAL_ENABLE_EMAILS = env.ENABLE_EMAILS;
  beforeAll(() => {
    // Le service court-circuite l'envoi en NODE_ENV=test sauf ENABLE_EMAILS.
    env.ENABLE_EMAILS = true;
  });
  afterAll(() => {
    env.ENABLE_EMAILS = ORIGINAL_ENABLE_EMAILS;
  });
  beforeEach(() => sendMailMock.mockClear());

  it('adresse valide (avec + et sous-domaine) : le transport est appele une fois', async () => {
    await emailService.sendEmail({ to: 'jean+news@mail.agence.example.com', subject: 'Sujet', html: '<p>x</p>' });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect((sendMailMock.mock.calls[0]![0] as any).to).toBe('jean+news@mail.agence.example.com');
  });

  it.each(INVALID)('%s : aucun appel au transport et aucune exception', async (_label, address) => {
    await expect(emailService.sendEmail({ to: address, subject: 'Sujet', html: '<p>x</p>' })).resolves.toEqual({
      sent: false,
      reason: 'INVALID_RECIPIENT'
    });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('adresse valide : résultat { sent: true }', async () => {
    await expect(emailService.sendEmail({ to: 'ok@exemple.com', subject: 'Sujet', html: '<p>x</p>' })).resolves.toEqual(
      {
        sent: true
      }
    );
  });

  it('les méthodes publiques qui enveloppent sendEmail propagent le résultat (invalide => sent:false)', async () => {
    await expect(
      emailService.sendInviteEmail('a@b.com\r\nBcc: x@y.com', 'tok', 'Agence', ['Agent'], new Date())
    ).resolves.toEqual({
      sent: false,
      reason: 'INVALID_RECIPIENT'
    });
    await expect(
      emailService.sendInviteEmail('ok@exemple.com', 'tok', 'Agence', ['Agent'], new Date())
    ).resolves.toEqual({
      sent: true
    });
  });

  it("' a@b.com ' : adresse acceptée et c'est 'a@b.com' (rognée) qui part au transport", async () => {
    const result = await emailService.sendEmail({ to: ' a@b.com ', subject: 'Sujet', html: '<p>x</p>' });
    expect(result).toEqual({ sent: true });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect((sendMailMock.mock.calls[0]![0] as any).to).toBe('a@b.com');
  });

  it('un envoi en masse continue apres une adresse invalide', async () => {
    for (const to of ['a@b.com\r\nBcc: x@y.com', 'ok@exemple.com']) {
      await emailService.sendEmail({ to, subject: 'Sujet', html: '<p>x</p>' });
    }
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect((sendMailMock.mock.calls[0]![0] as any).to).toBe('ok@exemple.com');
  });
});

describe('providers/email.provider sendEmail : adresse invalide', () => {
  beforeEach(() => sendMailMock.mockClear());

  it('adresse valide : envoyee', async () => {
    const result = await providerSendEmail({ to: 'a+b@c.example.com', subject: 's', text: 't' });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: true, messageId: 'mock-message-id' });
  });

  it("' a@b.com ' : la version rognée part au transport (to et replyTo)", async () => {
    const result = await providerSendEmail({ to: ' a@b.com ', subject: 's', text: 't', replyTo: ' r@b.com\t' });
    expect(result.sent).toBe(true);
    const sent = sendMailMock.mock.calls[0]![0] as any;
    expect(sent.to).toBe('a@b.com');
    expect(sent.replyTo).toBe('r@b.com');
  });

  it('adresse invalide : pas de transport, pas d exception', async () => {
    const result = await providerSendEmail({ to: 'a@b.com\r\nBcc: x@y.com', subject: 's', text: 't' });
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: false, reason: 'INVALID_RECIPIENT' });
    expect(result.messageId).toBeUndefined();
  });

  it('replyTo invalide : ignore, le message part sans replyTo', async () => {
    await providerSendEmail({ to: 'a@b.com', subject: 's', text: 't', replyTo: 'x@y.com\r\nBcc: z@z.com' });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect((sendMailMock.mock.calls[0]![0] as any).replyTo).toBeUndefined();
  });
});

describe('utils/email-utils : résultat explicite (booléen)', () => {
  beforeEach(() => sendMailMock.mockClear());

  it('adresse invalide : false, aucun envoi', async () => {
    await expect(sendVerificationEmail('a@b.com\r\nBcc: x@y.com', 'Jean', 'tok')).resolves.toBe(false);
    await expect(sendPasswordResetEmail('a@@b', 'Jean', 'tok')).resolves.toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("adresse valide : true, et l'adresse rognée part au transport", async () => {
    await expect(sendVerificationEmail(' a@b.com ', 'Jean', 'tok')).resolves.toBe(true);
    await expect(sendPasswordResetEmail('c@d.com', 'Jean', 'tok')).resolves.toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect((sendMailMock.mock.calls[0]![0] as any).to).toBe('a@b.com');
  });
});

describe('contre-audit PR #205 : rognage des blancs de bord en temps linéaire', () => {
  const elapsedMs = (fn: () => void): number => {
    const start = process.hrtime.bigint();
    fn();
    return Number(process.hrtime.bigint() - start) / 1e6;
  };

  it('100 000 espaces internes : refus immédiat (longueur brute) et rognage linéaire', () => {
    const evil = `a${' '.repeat(100_000)}b`;
    isSafeEmailAddress(evil);
    expect(elapsedMs(() => expect(isSafeEmailAddress(evil)).toBe(false))).toBeLessThan(100);
    expect(elapsedMs(() => expect(normalizeRecipientAddress(evil)).toBe(evil))).toBeLessThan(100);
  });

  it('blancs de bord sous la borne brute : rognés comme avant', () => {
    const padded = `${' \t'.repeat(200)}a@b.com${'\t '.repeat(200)}`;
    expect(isSafeEmailAddress(padded)).toBe(true);
    expect(normalizeRecipientAddress(padded)).toBe('a@b.com');
    expect(normalizeRecipientAddress(' \t a b \t ')).toBe('a b');
    expect(normalizeRecipientAddress(' \t ')).toBe('');
  });

  it('au-delà de la borne brute (1024), refus même si l’adresse rognée est courte', () => {
    expect(isSafeEmailAddress(`${' '.repeat(1100)}a@b.com`)).toBe(false);
  });
});
