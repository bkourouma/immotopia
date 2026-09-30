import type { NextFunction, Request, Response } from 'express';
import { loginSchema, validate } from '../../src/middleware/validation-middleware';
import {
  BootstrapInputError,
  DEFAULT_ADMIN_NAME,
  normalizeAdminEmail,
  normalizeAdminName,
  readPasswordFromStdinContent,
  sanitizeLikeLogin,
  validateBootstrapPassword
} from '../../src/utils/bootstrap-admin-input';

describe('normalizeAdminEmail', () => {
  it('retire les espaces et met en minuscules', () => {
    expect(normalizeAdminEmail('  Admin@Exemple.COM \n')).toBe('admin@exemple.com');
  });
  it('accepte les sous-domaines et le +', () => {
    expect(normalizeAdminEmail('a.b+c@mail.exemple.co.ci')).toBe('a.b+c@mail.exemple.co.ci');
  });
  it.each([
    'a..b@exemple.com',
    '.a@exemple.com',
    'a,b@exemple.com',
    'é@exemple.com',
    'a@exemple.c',
    'a<b@exemple.com',
    'ononx=a@exemple.com'
  ])('refuse un e-mail que la connexion refuserait ou modifierait : %j', value => {
    expect(() => normalizeAdminEmail(value)).toThrow(BootstrapInputError);
  });
  it.each(['', '   ', 'sans-arobase', 'a@b', 'a@@b.com', 'a b@c.com', '@c.com', 'a@.com', 'a@c..com', 'a@c.'])(
    'refuse %j',
    value => {
      expect(() => normalizeAdminEmail(value)).toThrow(BootstrapInputError);
    }
  );
  it('refuse une adresse trop longue', () => {
    expect(() => normalizeAdminEmail(`${'a'.repeat(250)}@b.com`)).toThrow(BootstrapInputError);
  });
  it('refuse une valeur non textuelle', () => {
    expect(() => normalizeAdminEmail(undefined as unknown as string)).toThrow(BootstrapInputError);
  });
});

describe('validateBootstrapPassword', () => {
  it('accepte un mot de passe fort de 12 caractères ou plus', () => {
    expect(() => validateBootstrapPassword('Abcdef123!xy')).not.toThrow();
  });
  it('refuse moins de 12 caractères', () => {
    expect(() => validateBootstrapPassword('Abcde123!xy')).toThrow(/au moins 12/);
  });
  it.each([
    ['sans majuscule', 'abcdef123!xyz'],
    ['sans minuscule', 'ABCDEF123!XYZ'],
    ['sans chiffre', 'Abcdefgh!xyzw'],
    ['sans caractère spécial', 'Abcdef123xyzw']
  ])('refuse un mot de passe %s', (_label, pwd) => {
    expect(() => validateBootstrapPassword(pwd)).toThrow(BootstrapInputError);
  });
  it.each([
    ['un chevron', 'Abcdef123!<x'],
    ['des espaces de bord', ' Se cret 12! '],
    ['un espace final', 'Secret 12345! '],
    ['un motif onxxx=', 'Passon12=Abcd!'],
    ['javascript:', 'Abcdef1!JaVaScRiPt:x']
  ])('refuse un mot de passe que la connexion modifierait : %s', (_label, pwd) => {
    expect(() => validateBootstrapPassword(pwd)).toThrow(/connexion retire/);
  });
  it('accepte un espace interne', () => {
    expect(() => validateBootstrapPassword('Se cret 12345!')).not.toThrow();
  });
  it('refuse le vide et plus de 72 octets', () => {
    expect(() => validateBootstrapPassword('')).toThrow(BootstrapInputError);
    expect(() => validateBootstrapPassword(`Aa1!${'x'.repeat(70)}`)).toThrow(/trop long/);
  });
  it('ne divulgue jamais le mot de passe dans le message', () => {
    for (const pwd of ['court', 'abcdef123!xyz', 'ABCDEF123!XYZ', 'Abcdefgh!xyzw', 'Abcdef123xyzw']) {
      let message = '';
      try {
        validateBootstrapPassword(pwd);
      } catch (e) {
        expect(e).toBeInstanceOf(BootstrapInputError);
        message = (e as Error).message;
      }
      expect(message).not.toBe('');
      expect(message).not.toContain(pwd);
    }
  });
});

describe('readPasswordFromStdinContent', () => {
  it('retire un LF final', () => {
    expect(readPasswordFromStdinContent('Secret123!\n')).toBe('Secret123!');
  });
  it('retire un CRLF final et plusieurs retours finaux', () => {
    expect(readPasswordFromStdinContent('Secret123!\r\n')).toBe('Secret123!');
    expect(readPasswordFromStdinContent('Secret123!\n\n\r\n')).toBe('Secret123!');
  });
  it('conserve les espaces à la lecture (le refus se fait à la validation)', () => {
    expect(readPasswordFromStdinContent(' Se cret 12! \n')).toBe(' Se cret 12! ');
  });
  it('conserve un retour à la ligne interne', () => {
    expect(readPasswordFromStdinContent('a\nb')).toBe('a\nb');
  });
  it('refuse le vide ou les seuls retours à la ligne', () => {
    expect(() => readPasswordFromStdinContent('')).toThrow(BootstrapInputError);
    expect(() => readPasswordFromStdinContent('\r\n')).toThrow(BootstrapInputError);
  });
});

describe('normalizeAdminName', () => {
  it('applique la valeur par défaut si vide ou absent', () => {
    expect(normalizeAdminName(undefined)).toBe(DEFAULT_ADMIN_NAME);
    expect(normalizeAdminName('   ')).toBe(DEFAULT_ADMIN_NAME);
  });
  it('normalise les espaces', () => {
    expect(normalizeAdminName('  Awa   Koné ')).toBe('Awa Koné');
  });
  it('refuse un nom trop long', () => {
    expect(() => normalizeAdminName('x'.repeat(121))).toThrow(BootstrapInputError);
  });
});

describe('synchronisation avec le vrai middleware de connexion', () => {
  function runLoginMiddleware(body: Record<string, unknown>): { body: any; error: unknown } {
    const req = { body } as unknown as Request;
    let error: unknown;
    validate(loginSchema)(
      req,
      {} as Response,
      ((e?: unknown) => {
        error = e;
      }) as NextFunction
    );
    return { body: req.body, error };
  }

  const acceptedPasswords = ['Abcdef123!xy', 'Se cret 12345!', 'Mot-de-passe_Long9!&', 'Aa1!bcdéèà€xyz'];
  const acceptedEmails = ['Admin@Exemple.COM', '  a.b+c@mail.exemple.co.ci ', 'x_y@exemple.com'];
  const sanitizedPasswords = [
    'Abcdef123!<x',
    'Abcdef123!>x',
    ' Se cret 12! ',
    'Secret 12345! ',
    'Passon12=Abcd!',
    'Abcdef1!JaVaScRiPt:x'
  ];
  const sanitizedEmails = ['a<b@exemple.com', 'a>b@exemple.com', 'javascript:a@exemple.com'];

  it.each(acceptedPasswords)('mot de passe accepté %j : le middleware ne le modifie pas', pwd => {
    expect(() => validateBootstrapPassword(pwd)).not.toThrow();
    const { body, error } = runLoginMiddleware({ email: 'admin@exemple.com', password: pwd });
    expect(error).toBeUndefined();
    expect(body.password).toBe(pwd);
  });

  it.each(acceptedEmails)('e-mail accepté %j : le middleware donne la forme normalisée', raw => {
    const email = normalizeAdminEmail(raw);
    const { body, error } = runLoginMiddleware({ email, password: 'Abcdef123!xy' });
    expect(error).toBeUndefined();
    expect(body.email).toBe(email);
    // La saisie brute (espaces, majuscules) aboutit à la même forme côté connexion.
    const raw2 = runLoginMiddleware({ email: raw, password: 'Abcdef123!xy' });
    expect(raw2.body.email).toBe(email);
  });

  it.each(sanitizedPasswords)('mot de passe refusé %j : le middleware le modifie effectivement', pwd => {
    expect(() => validateBootstrapPassword(pwd)).toThrow(BootstrapInputError);
    const { body } = runLoginMiddleware({ email: 'admin@exemple.com', password: pwd });
    expect(body.password).not.toBe(pwd);
    expect(body.password).toBe(sanitizeLikeLogin(pwd));
  });

  it.each(sanitizedEmails)('e-mail refusé par sanitation %j : le middleware le modifie effectivement', raw => {
    expect(() => normalizeAdminEmail(raw)).toThrow(BootstrapInputError);
    const { body } = runLoginMiddleware({ email: raw, password: 'Abcdef123!xy' });
    // Soit le middleware modifie l'e-mail, soit il le rejette (zod) : jamais un passage à l'identique.
    expect(body.email).not.toBe(raw.trim().toLowerCase());
  });

  it.each(['a..b@exemple.com', '.a@exemple.com', 'a,b@exemple.com', 'é@exemple.com', 'a@exemple.c'])(
    'e-mail %j : le middleware de connexion le rejette aussi',
    raw => {
      expect(() => normalizeAdminEmail(raw)).toThrow(BootstrapInputError);
      const { error } = runLoginMiddleware({ email: raw, password: 'Abcdef123!xy' });
      expect(error).toBeDefined();
    }
  );
});
