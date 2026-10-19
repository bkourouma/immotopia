/**
 * `sanitizeBody` n'altère jamais un champ mot de passe, à quelque profondeur
 * que ce soit, et continue d'assainir les champs ordinaires (audit 2026-10-19).
 */
import type { NextFunction, Request, Response } from 'express';
import {
  sanitizeBody,
  isPasswordField,
  legacySanitizedPassword,
  validate,
  loginSchema,
  registerSchema,
  resetPasswordSchema
} from '../../src/middleware/validation-middleware';

const TRICKY = ' <a>&javascript:Bonjour=1! ';

function run(schema: Parameters<typeof validate>[0], body: Record<string, unknown>): { body: any; error: unknown } {
  const req = { body } as unknown as Request;
  let error: unknown;
  validate(schema)(
    req,
    {} as Response,
    ((e?: unknown) => {
      error = e;
    }) as NextFunction
  );
  return { body: req.body, error };
}

describe('sanitizeBody et mots de passe', () => {
  it.each([
    'password',
    'newPassword',
    'currentPassword',
    'confirmPassword',
    'oldPassword',
    'passwordConfirmation',
    'passwd',
    'passphrase'
  ])('laisse %s intact', key => {
    expect(sanitizeBody({ [key]: TRICKY })[key]).toBe(TRICKY);
  });

  it('laisse un mot de passe imbriqué ou dans un tableau intact', () => {
    const out = sanitizeBody({ account: { credentials: { password: '<a>&' } }, users: [{ newPassword: '<b>' }] });
    expect(out.account.credentials.password).toBe('<a>&');
    expect(out.users[0].newPassword).toBe('<b>');
  });

  it('assainit toujours les champs ordinaires, y compris à côté d’un mot de passe', () => {
    const out = sanitizeBody({ fullName: ' <b>Awa</b> ', password: '<a>', nested: { note: 'onclick=x' } });
    expect(out.fullName).toBe('bAwa/b');
    expect(out.password).toBe('<a>');
    expect(out.nested.note).toBe('x');
  });

  it('ne reconnaît pas comme mot de passe un champ sans rapport', () => {
    expect(isPasswordField('fullName')).toBe(false);
    expect(isPasswordField('email')).toBe(false);
    expect(isPasswordField('token')).toBe(false);
  });

  it('legacySanitizedPassword reproduit la forme altérée d’avant le correctif', () => {
    expect(legacySanitizedPassword(TRICKY)).toBe('a&B1!');
  });
});

describe('validate() sur les schémas d’authentification', () => {
  it('login : un mot de passe contenant <a> ou & ressort identique, l’e-mail reste normalisé', () => {
    const { body, error } = run(loginSchema, { email: '  Foo@Bar.COM ', password: 'P<a>ss&1!' });
    expect(error).toBeUndefined();
    expect(body).toEqual({ email: 'foo@bar.com', password: 'P<a>ss&1!' });
  });

  it('inscription : mot de passe et confirmation intacts, nom assaini', () => {
    const { body, error } = run(registerSchema, {
      email: 'a@b.test',
      password: ' P<a>ss&1! ',
      confirmPassword: ' P<a>ss&1! ',
      fullName: '<i>Awa</i>'
    });
    expect(error).toBeUndefined();
    expect(body.password).toBe(' P<a>ss&1! ');
    expect(body.confirmPassword).toBe(' P<a>ss&1! ');
    expect(body.fullName).toBe('iAwa/i');
  });

  it('réinitialisation : nouveau mot de passe intact', () => {
    const { body, error } = run(resetPasswordSchema, {
      token: 'tok',
      newPassword: 'N<e>w&1!',
      confirmPassword: 'N<e>w&1!'
    });
    expect(error).toBeUndefined();
    expect(body.newPassword).toBe('N<e>w&1!');
  });
});
