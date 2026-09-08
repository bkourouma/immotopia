# Connexion Google (OAuth 2.0)

Document unique de référence pour l'authentification Google. Il remplace
`GOOGLE_OAUTH_SETUP.md`, `GOOGLE_OAUTH_CONFIG.md`, `GOOGLE_OAUTH_INTEGRATION.md`,
`DEBUG_OAUTH.md`, `OAUTH_FIX_SUMMARY.md` et `TROUBLESHOOTING_GOOGLE_OAUTH.md`,
archivés sous `docs/archive/`.

## Principe

Le flux est entièrement géré côté serveur : le frontend ne manipule jamais de
jeton Google. Il se contente de rediriger le navigateur vers l'API.

```
Navigateur                API (8001)                 Google
    |  GET /api/auth/google   |                         |
    |------------------------>|                         |
    |                         | pose un cookie `state`  |
    |<---- 302 vers Google ---|                         |
    |------------------------------------------------->|
    |                  écran de consentement            |
    |<-------------------------------------------------|
    |  GET /api/auth/google/callback?code=..&state=..   |
    |------------------------>|                         |
    |                         | vérifie `state`         |
    |                         | échange le code         |
    |                         | crée/retrouve l'user    |
    |                         | pose accessToken +      |
    |                         | refreshToken (httpOnly) |
    |<-- 302 /auth/callback --|                         |
```

Le frontend appelle ensuite `GET /api/auth/me` pour hydrater son contexte
d'authentification (`apps/web/src/pages/AuthCallback.tsx`).

## Sécurité

| Mesure | Où |
|---|---|
| Paramètre `state` (anti-CSRF de login), cookie httpOnly, comparaison en temps constant | `packages/api/src/routes/auth-routes.ts` |
| Cookies `httpOnly`, `secure` en production, `sameSite: lax` | `packages/api/src/utils/auth-cookies.ts` |
| Rotation du refresh token à chaque usage, détection de réutilisation | `packages/api/src/services/auth-service.ts` |
| Algorithme JWT épinglé (HS256) à la signature et à la vérification | `packages/api/src/utils/jwt-utils.ts` |

`sameSite: 'lax'` (et non `strict`) est nécessaire : le retour depuis Google est
une navigation de premier niveau venant d'un autre site, et un cookie `strict`
ne serait pas envoyé.

**Fusion de comptes** : si un compte existe déjà avec la même adresse e-mail, le
`googleId` y est rattaché (`packages/api/src/config/passport.ts`). C'est pratique
mais cela suppose que Google a vérifié l'adresse ; voir la limite connue plus bas.

## Configuration

### Google Cloud Console

1. Créer un projet, puis des identifiants **OAuth 2.0 – Application Web**.
2. **Origines JavaScript autorisées** : `http://localhost:3000`
3. **URI de redirection autorisés** : `http://localhost:8001/api/auth/google/callback`
4. Écran de consentement : type *Externe* en développement, domaine `localhost`.

En production, remplacer par les URL HTTPS réelles.

### Variables d'environnement

Backend — `packages/api/.env` (voir `packages/api/env.example`) :

```env
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_CALLBACK_URL="http://localhost:8001/api/auth/google/callback"
FRONTEND_URL="http://localhost:3000"
BACKEND_URL="http://localhost:8001"
```

Frontend — `apps/web/.env` :

```env
REACT_APP_API_URL=http://localhost:8001/api
```

Le frontend n'a **pas** besoin du `GOOGLE_CLIENT_ID` : il ne fait que rediriger
vers l'API. Si `REACT_APP_GOOGLE_CLIENT_ID` traîne encore dans un `.env`, il est
inutilisé.

Si `GOOGLE_CLIENT_ID` ou `GOOGLE_CLIENT_SECRET` sont absents, la stratégie n'est
pas enregistrée et l'API le signale au démarrage : la connexion Google est
simplement désactivée, le reste de l'application fonctionne.

## Endpoints

| Endpoint | Méthode | Rôle |
|---|---|---|
| `/api/auth/google` | GET | Démarre le flux, pose le cookie `state` |
| `/api/auth/google/callback` | GET | Vérifie `state`, crée la session, redirige vers le frontend |
| `/api/auth/me` | GET | Utilisateur courant (authentifié) |
| `/api/auth/refresh` | POST | Renouvelle l'access token et fait tourner le refresh token |
| `/api/auth/logout` | POST | Révoque la session |

## Tester

```bash
curl -i http://localhost:8001/api/auth/google
```

Attendu : `302` vers `accounts.google.com`, plus un `Set-Cookie: oauthState=...`.

Puis, dans un navigateur, `http://localhost:3000/login` → « Se connecter avec
Google » → consentement → retour sur `/dashboard`.

## Dépannage

**`redirect_uri_mismatch`** — L'URI déclarée dans Google Cloud Console diffère de
`GOOGLE_CALLBACK_URL`. Les deux doivent être identiques au caractère près, port
compris. L'API écoute sur **8001** ; une documentation plus ancienne mentionnait
8000, c'est faux.

**`origin_mismatch`** — `http://localhost:3000` manque dans les origines
JavaScript autorisées.

**Redirection vers `/login?error=invalid_state`** — Le cookie `state` est absent
ou ne correspond pas. Causes usuelles : le flux a été démarré depuis une autre
origine, le cookie a expiré (10 minutes), ou l'onglet a été rouvert entre-temps.
Relancer la connexion depuis le début.

**Redirection vers `/login?error=auth_failed`** — Google a répondu mais l'échange
a échoué. Regarder les logs de l'API : identifiants invalides ou compte Google
sans adresse e-mail.

**L'utilisateur revient mais n'est pas connecté** — Vérifier que `FRONTEND_URL`
correspond à l'origine réelle du frontend et que les cookies apparaissent dans
les DevTools. Un `FRONTEND_URL` erroné casse aussi le CORS.

**« Google OAuth credentials not found » au démarrage** — Les variables ne sont
pas chargées : mauvais répertoire de travail, ou `.env` absent.

## Limites connues

- **Fusion de comptes sans vérification préalable** : un compte existant créé par
  mot de passe est lié au premier compte Google présentant la même adresse, sans
  exiger que l'adresse ait été vérifiée de notre côté. À durcir (voir
  `AUDIT_CODE.md`, section 2.3).
- La stratégie ne demande que `profile` et `email`.
