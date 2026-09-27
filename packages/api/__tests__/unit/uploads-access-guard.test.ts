/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `uploadsAccessGuard` — le service statique de `/uploads`.
 *
 * AGENTS.md : les documents privés ne sont jamais servis en statique. La garde
 * ne laisse passer que les médias publics par nature (photos d'annonce, logos
 * d'agence, images WhatsApp) et répond 404 à tout le reste, quelle que soit la
 * session — personnel de l'agence compris. Chaque fichier privé sort par une
 * route authentifiée qui contrôle l'objet (documents de bien, pièces jointes
 * de maintenance, preuves de paiement, justificatifs de pénalité, documents de
 * copropriété).
 *
 * La garde ne lit plus ni la session ni la base : la requête porte un cookie
 * de session pour montrer qu'il ne change rien.
 */

import { uploadsAccessGuard } from '../../src/middleware/uploads-access-middleware';

async function hit(path: string, options: { method?: string; session?: boolean } = {}) {
  const req: any = {
    method: options.method ?? 'GET',
    path,
    cookies: options.session ? { accessToken: 'jeton-du-gestionnaire' } : {},
    headers: {}
  };
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  const next = jest.fn();
  await uploadsAccessGuard(req, res, next);
  return { served: next.mock.calls.length === 1, status: res.status.mock.calls[0]?.[0] as number | undefined };
}

describe('uploadsAccessGuard — médias publics', () => {
  it.each([
    '/properties/prop-1/photo.jpg',
    '/properties/agency-logos/tenant-a/logo.png',
    '/whatsapp/group-broadcast/tenant-a/image.jpg'
  ])('%s : servi, sans session', async path => {
    expect((await hit(path)).served).toBe(true);
  });
});

describe('uploadsAccessGuard — dossiers privés : 404, avec ou sans session', () => {
  const privatePaths = [
    '/properties/prop-1/documents/titre.pdf',
    '/portal/payments/tenant-a/preuve.jpg',
    '/rental/penalties/pen-1/accord.pdf',
    '/maintenance/tenant-a/ticket-1/photo.jpg',
    '/syndics/syn-1/documents/reglement.pdf',
    '/lease-inspections/tenant-a/insp-1/photo.jpg',
    '/inconnu/fichier.pdf',
    '/properties',
    '/properties/prop-1'
  ];

  it.each(privatePaths)('%s', async path => {
    expect(await hit(path, { session: true })).toEqual({ served: false, status: 404 });
    expect(await hit(path)).toEqual({ served: false, status: 404 });
  });

  it.each([
    // Un système de fichiers insensible à la casse et aux points finaux
    // (Windows) ouvrirait ces chemins sur le dossier privé.
    '/properties/prop-1/DOCUMENTS/titre.pdf',
    '/properties/prop-1/documents./titre.pdf',
    '/properties/prop-1/Documents /titre.pdf',
    '/Maintenance/tenant-a/ticket-1/photo.jpg',
    '/PORTAL/payments/tenant-a/preuve.jpg'
  ])('%s : variante de casse ou de point final, refusée aussi', async path => {
    expect(await hit(path, { session: true })).toEqual({ served: false, status: 404 });
  });
});

describe('uploadsAccessGuard — requêtes invalides', () => {
  it('refuse une remontée de dossier (400)', async () => {
    expect(await hit('/properties/prop-1/..%2Fdocuments%2Ftitre.pdf')).toEqual({ served: false, status: 400 });
  });

  it('refuse une autre méthode que GET/HEAD (405)', async () => {
    expect(await hit('/properties/prop-1/photo.jpg', { method: 'POST' })).toEqual({ served: false, status: 405 });
  });
});
