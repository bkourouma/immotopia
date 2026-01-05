# 🔴 CORRECTION CRITIQUE : Middleware d'Authentification

## 🐛 Le Problème Principal

Le middleware `authenticate` dans `packages/api/src/middleware/auth-middleware.ts` cherchait le token JWT **uniquement dans le header Authorization** et **ignorait complètement les cookies**.

### Code Problématique (Avant)

```typescript
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ message: 'No authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1]; // Bearer <token>
  // ...
};
```

### Pourquoi c'était un problème ?

1. **Google OAuth définit les tokens dans les cookies** (lignes 91-103 de `auth-routes.ts`)
2. **Le frontend n'envoie PAS de header Authorization** (il utilise `withCredentials: true` pour envoyer les cookies)
3. **Le middleware rejetait toutes les requêtes** avec `401 No authorization header`

### Résultat

- ✅ L'authentification Google fonctionnait (cookies définis)
- ❌ L'appel à `/api/auth/me` échouait (middleware rejetait la requête)
- ❌ L'utilisateur voyait "Erreur lors de la vérification de l'authentification"

## ✅ La Solution

### Code Corrigé (Après)

```typescript
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  // Try to get token from cookies first (for browser requests)
  let token = req.cookies?.accessToken;

  // Fallback to Authorization header (for API clients)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      token = authHeader.split(' ')[1]; // Bearer <token>
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Authentication token missing' });
    return;
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    res.status(403).json({ message: 'Invalid or expired token' });
    return;
  }

  // Attach user identity to request
  req.user = decoded;
  next();
};
```

### Changements Clés

1. **Priorité aux cookies** : `req.cookies?.accessToken` est vérifié en premier
2. **Fallback au header** : Si pas de cookie, on cherche dans `Authorization: Bearer <token>`
3. **Support des deux méthodes** : Compatible avec les navigateurs (cookies) ET les clients API (headers)

## 🔄 Flux d'Authentification Complet

### Avant la Correction

```
1. User → Google OAuth → Backend
2. Backend → Set cookies (accessToken, refreshToken)
3. Backend → Redirect to /auth/callback?success=true
4. Frontend → Call /api/auth/me
5. Middleware → Check Authorization header ❌ NOT FOUND
6. Middleware → Return 401 ❌
7. Frontend → Show error message ❌
```

### Après la Correction

```
1. User → Google OAuth → Backend
2. Backend → Set cookies (accessToken, refreshToken)
3. Backend → Redirect to /auth/callback?success=true
4. Frontend → Call /api/auth/me (cookies sent automatically)
5. Middleware → Check cookies ✅ FOUND
6. Middleware → Verify token ✅ VALID
7. Middleware → Attach user to req.user ✅
8. Controller → Return user data ✅
9. Frontend → Redirect to dashboard ✅
```

## 📝 Fichiers Modifiés

### `packages/api/src/middleware/auth-middleware.ts`

**Fonctions modifiées** :
1. ✅ `authenticate` - Lit les cookies en priorité
2. ✅ `optionalAuthenticate` - Lit les cookies en priorité

## 🚀 Instructions de Test

### 1. Redémarrer le Backend

**CRITIQUE** : Le backend doit être redémarré pour charger le nouveau middleware.

```bash
# Terminal backend - Appuyer sur Ctrl+C puis :
cd packages/api
npm run dev
```

### 2. Vider les Cookies

Les anciens cookies peuvent causer des problèmes.

```bash
# Option 1 : DevTools
F12 → Application → Cookies → http://localhost:3000 → Clear All

# Option 2 : Navigation privée
Ctrl+Shift+N (Chrome) ou Ctrl+Shift+P (Firefox)
```

### 3. Tester l'Authentification Google

1. Aller sur `http://localhost:3000/register`
2. Cliquer sur "Se connecter avec Google"
3. Autoriser l'application
4. **Résultat attendu** :
   - Message "Connexion réussie ! Redirection..."
   - Redirection vers `/dashboard`
   - Informations utilisateur affichées

## 🔍 Vérifications

### Vérifier que les Cookies sont Envoyés

1. Ouvrir DevTools (F12) → Network
2. Aller sur `/auth/callback?success=true`
3. Chercher la requête `me`
4. Cliquer dessus → Headers → Request Headers
5. Vérifier la ligne **Cookie** :
   ```
   Cookie: accessToken=eyJhbGc...; refreshToken=a1b2c3...
   ```

### Vérifier la Réponse de /api/auth/me

1. Dans Network → Cliquer sur la requête `me`
2. Onglet **Response**
3. Devrait voir :
   ```json
   {
     "success": true,
     "user": {
       "id": "...",
       "email": "...",
       "fullName": "...",
       "globalRole": "USER",
       ...
     }
   }
   ```

## 🎯 Résumé

| Aspect | Avant | Après |
|--------|-------|-------|
| **Lecture des cookies** | ❌ Non | ✅ Oui (priorité) |
| **Header Authorization** | ✅ Oui (seul) | ✅ Oui (fallback) |
| **Google OAuth** | ❌ Échoue | ✅ Fonctionne |
| **Login email/password** | ✅ Fonctionne | ✅ Fonctionne |
| **Clients API** | ✅ Fonctionne | ✅ Fonctionne |

## 💡 Pourquoi ce Bug Existait ?

Le middleware a probablement été créé pour une API REST classique où les clients envoient des tokens dans les headers. Mais avec l'ajout de Google OAuth et l'utilisation de cookies HTTP-only pour la sécurité, le middleware n'a pas été mis à jour pour supporter les cookies.

## 🔐 Sécurité

Cette correction **améliore** la sécurité car :

1. **Cookies HTTP-only** : Protège contre les attaques XSS
2. **SameSite: lax** : Protège contre les attaques CSRF
3. **Fallback au header** : Permet toujours l'utilisation d'API clients sécurisés
4. **Pas de token dans localStorage** : Évite les vulnérabilités XSS

## 📚 Références

- [MDN - HTTP Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
- [OWASP - Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [Express Cookie Parser](https://expressjs.com/en/resources/middleware/cookie-parser.html)

