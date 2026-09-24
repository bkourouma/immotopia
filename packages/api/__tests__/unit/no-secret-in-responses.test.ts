/**
 * Lot E (multi-tenant) — E4 : aucune reponse de l'API ne porte
 * `passwordHash`/`tokenHash`.
 *
 * `stripSecrets`/`responseSanitizer` sont deja testes unitairement dans
 * `__tests__/unit/response-sanitizer.test.ts` (appel direct de la fonction,
 * et appel direct du middleware avec un faux `res.json`). Pour eviter le
 * doublon, ce fichier verifie deux choses que l'autre ne peut pas couvrir :
 *
 *   1. Le middleware est bien MONTE dans la VRAIE app (`src/app.ts`), et
 *      AVANT toute route — pas seulement disponible et teste isolement. Une
 *      regression qui deplace `app.use(responseSanitizer)` apres les routeurs
 *      (ou l'oublie) romprait le filet de securite sans qu'aucun test
 *      unitaire du middleware ne le remarque.
 *   2. Le middleware fonctionne au travers d'un VRAI cycle requete/reponse
 *      Express (`res.json` reellement appele par un handler, en passant par
 *      la pile de middlewares), pas seulement via un faux objet `res` appele
 *      a la main. On ne reconstruit pas toute l'app (ses controleurs
 *      touchent la base) : une petite app Express dediee reutilise le VRAI
 *      middleware importe depuis `src/middleware/response-sanitizer-middleware.ts`
 *      et une route factice qui renvoie un `User` complet.
 */

import '../helpers/app-shims';
import express from 'express';
import request from 'supertest';
import { responseSanitizer } from '../../src/middleware/response-sanitizer-middleware';
import app from '../../src/app';

describe('Aucune reponse ne porte passwordHash/tokenHash (lot E, E4)', () => {
  it('responseSanitizer est monte dans app.ts, avant toute route ou routeur', () => {
    const stack = (app as unknown as { _router: { stack: any[] } })._router.stack;

    const sanitizerIndex = stack.findIndex(layer => layer.handle === responseSanitizer);
    expect(sanitizerIndex).toBeGreaterThanOrEqual(0);

    const firstRouteOrRouterIndex = stack.findIndex(
      (layer, index) => index !== sanitizerIndex && (layer.route || layer.name === 'router')
    );

    // -1 impossible en pratique (l'app monte des dizaines de routeurs), mais
    // gardee explicite : un -1 signifierait qu'aucune route n'a ete trouvee,
    // pas que le test passe par defaut.
    expect(firstRouteOrRouterIndex).toBeGreaterThan(-1);
    expect(sanitizerIndex).toBeLessThan(firstRouteOrRouterIndex);
  });

  it('une route factice qui renvoie un User complet ressort sans passwordHash/tokenHash, a travers un vrai cycle Express', async () => {
    const fakeUser = {
      success: true,
      data: {
        id: 'user-1',
        email: 'a@b.c',
        passwordHash: '$2b$10$secretHashNeverToLeak',
        fullName: 'Test User',
        invitation: { tokenHash: 'should-not-leak-either' }
      }
    };

    const probeApp = express();
    // Meme middleware que src/app.ts, importe depuis le meme fichier — pas
    // une reimplementation.
    probeApp.use(responseSanitizer);
    probeApp.get('/probe/user', (_req, res) => {
      res.json(fakeUser);
    });

    const response = await request(probeApp).get('/probe/user').expect(200);

    const raw = JSON.stringify(response.body);
    expect(raw).not.toMatch(/passwordHash|tokenHash/);
    expect(response.body.data.email).toBe('a@b.c');
    expect(response.body.data.fullName).toBe('Test User');
  });
});
