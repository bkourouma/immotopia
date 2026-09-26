/**
 * Une agence ne pouvait pas être créée en recette : le navigateur bloquait la
 * requête avant même qu'elle parte, avec
 * `Request header field idempotency-key is not allowed by
 * Access-Control-Allow-Headers in preflight response`.
 *
 * `tenant-service.ts` pose `Idempotency-Key` sur la création d'agence, et
 * `api-client.ts` pose `X-Portal-Tenant-Id` sur les routes de portail ; ce
 * test épingle que les deux figurent dans `Access-Control-Allow-Headers`
 * pour que la requête OPTIONS de préflight les autorise.
 */

process.env.FRONTEND_URL = 'http://localhost:3000';

import { corsMiddleware } from '../../src/middleware/cors-middleware';

type Row = Record<string, any>;

function requeteFactice(overrides: Row = {}): any {
  return {
    method: 'OPTIONS',
    headers: { origin: 'http://localhost:3000' },
    ...overrides
  };
}

function reponseFactice() {
  const headers: Row = {};
  const res: Row = {};
  res.setHeader = jest.fn((name: string, value: string) => {
    headers[name] = value;
  });
  res.sendStatus = jest.fn(() => res);
  res.getHeader = (name: string) => headers[name];
  return res;
}

describe('corsMiddleware', () => {
  it("liste Idempotency-Key et X-Portal-Tenant-Id dans Access-Control-Allow-Headers pour une requete OPTIONS depuis l'origine autorisee", () => {
    const req = requeteFactice();
    const res = reponseFactice();
    const next = jest.fn();

    corsMiddleware(req, res as any, next);

    const allowHeaders = res.getHeader('Access-Control-Allow-Headers') as string;
    const allowed = allowHeaders.split(',').map((h: string) => h.trim());

    expect(allowed).toContain('Idempotency-Key');
    expect(allowed).toContain('X-Portal-Tenant-Id');
    expect(res.sendStatus).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('pose aussi les en-tetes deja attendus (non-regression)', () => {
    const req = requeteFactice();
    const res = reponseFactice();
    const next = jest.fn();

    corsMiddleware(req, res as any, next);

    const allowHeaders = res.getHeader('Access-Control-Allow-Headers') as string;
    const allowed = allowHeaders.split(',').map((h: string) => h.trim());

    expect(allowed).toEqual(expect.arrayContaining(['Content-Type', 'Authorization', 'X-Requested-With']));
  });
});
