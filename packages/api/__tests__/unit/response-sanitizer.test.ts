/**
 * Aucune reponse de l'API ne porte d'empreinte de mot de passe ni de jeton.
 *
 * `GET /api/tenants/:tenantId` renvoyait, sans authentification, des `User`
 * complets avec `passwordHash`. Le service est corrige ; ce filtre garantit
 * qu'un prochain `include: { user: true }` ne rouvrira pas la fuite.
 */

import { stripSecrets, responseSanitizer } from '../../src/middleware/response-sanitizer-middleware';

describe('stripSecrets', () => {
  it('retire passwordHash et tokenHash a toute profondeur', () => {
    const body = {
      success: true,
      data: {
        clients: [{ user: { id: 'u1', email: 'a@b.c', passwordHash: 'x' } }],
        invitation: { tokenHash: 'y', token_hash: 'z', password_hash: 'w' }
      }
    };

    const out = JSON.stringify(stripSecrets(body));

    expect(out).not.toMatch(/passwordHash|tokenHash|token_hash|password_hash/);
    expect(out).toContain('a@b.c');
  });

  it('laisse intactes les dates et les instances de classe', () => {
    class Montant {
      toJSON() {
        return '12.50';
      }
    }
    const date = new Date('2026-09-24T00:00:00Z');
    const out = stripSecrets({ date, montant: new Montant() }) as Record<string, unknown>;

    expect(out.date).toBe(date);
    expect(JSON.stringify(out)).toContain('"12.50"');
  });

  it('ne boucle pas sur une reference circulaire', () => {
    const a: Record<string, unknown> = { id: 1 };
    a.self = a;
    expect(() => stripSecrets(a)).not.toThrow();
  });
});

describe('responseSanitizer', () => {
  it('filtre ce que les controleurs passent a res.json', () => {
    const sent: unknown[] = [];
    const res: Record<string, any> = { json: (b: unknown) => sent.push(b) };
    const next = jest.fn();

    responseSanitizer({} as any, res as any, next);
    res.json({ data: { passwordHash: 'secret', email: 'a@b.c' } });

    expect(next).toHaveBeenCalled();
    expect(sent[0]).toEqual({ data: { email: 'a@b.c' } });
  });
});
