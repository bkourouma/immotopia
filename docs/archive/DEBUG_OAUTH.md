# Débogage OAuth - Erreur de Vérification

## 🔴 Problème Actuel

Après l'authentification Google, vous êtes redirigé vers `/auth/callback?success=true` mais vous obtenez l'erreur :
**"Erreur lors de la vérification de l'authentification"**

## 🔍 Causes Possibles

### 1. **Problème de SameSite Cookie**
Les cookies sont définis avec `sameSite: 'strict'` ce qui peut bloquer les cookies lors de redirections cross-site.

**Fichier**: `packages/api/src/routes/auth-routes.ts` lignes 94 et 101

```typescript
sameSite: 'strict'  // ❌ Trop restrictif pour OAuth
```

**Solution**: Changer en `sameSite: 'lax'` pour le développement

### 2. **Mauvaise URL de Redirection**
Le backend utilise `CLIENT_URL` qui pourrait être mal configuré.

**Fichier**: `packages/api/.env` ligne 20
```env
CLIENT_URL="http://localhost:3000"  # ✅ Doit être 3000, pas 3001
```

### 3. **Cookies Non Envoyés**
L'appel à `/api/auth/me` ne reçoit pas les cookies.

## 🛠️ Solutions à Appliquer

### Solution 1: Modifier SameSite en 'lax'

**Fichier**: `packages/api/src/routes/auth-routes.ts`

**Changer lignes 94 et 101** :
```typescript
// Avant
sameSite: 'strict'

// Après
sameSite: 'lax'  // Permet les cookies lors de redirections GET
```

### Solution 2: Vérifier CLIENT_URL

**Fichier**: `packages/api/.env`

```env
CLIENT_URL="http://localhost:3000"  # ✅ Correct
```

### Solution 3: Ajouter des Logs de Débogage

**Fichier**: `apps/web/src/pages/AuthCallback.tsx`

Ajouter avant l'appel à `getMe()` :
```typescript
console.log('Calling /api/auth/me...');
console.log('Cookies:', document.cookie);
```

## 📋 Checklist de Vérification

### Backend
- [ ] Le backend tourne sur le port 8001
- [ ] `CLIENT_URL` est `http://localhost:3000`
- [ ] Les cookies sont définis avec `sameSite: 'lax'`
- [ ] CORS autorise `http://localhost:3000`

### Frontend
- [ ] Le frontend tourne sur le port 3000
- [ ] `REACT_APP_API_URL` est `http://localhost:8001/api`
- [ ] `withCredentials: true` dans api-client.ts
- [ ] La route `/auth/callback` existe dans App.tsx

### Cookies
- [ ] Les cookies `accessToken` et `refreshToken` sont définis
- [ ] Les cookies sont visibles dans DevTools → Application → Cookies
- [ ] Les cookies sont envoyés avec les requêtes vers `/api/auth/me`

## 🧪 Tests Manuels

### Test 1: Vérifier les Cookies dans le Navigateur

1. Ouvrir DevTools (F12)
2. Aller dans **Application** → **Cookies** → `http://localhost:3000`
3. Vérifier que vous voyez :
   - `accessToken`
   - `refreshToken`

### Test 2: Vérifier la Requête /api/auth/me

1. Ouvrir DevTools (F12)
2. Aller dans **Network**
3. Rafraîchir la page `/auth/callback?success=true`
4. Chercher la requête vers `/api/auth/me`
5. Vérifier :
   - **Status**: Devrait être 200
   - **Request Headers** → **Cookie**: Devrait contenir `accessToken` et `refreshToken`
   - **Response**: Devrait contenir `{ success: true, user: {...} }`

### Test 3: Tester Directement /api/auth/me

Ouvrir la console du navigateur et exécuter :
```javascript
fetch('http://localhost:8001/api/auth/me', {
  credentials: 'include'
})
  .then(r => r.json())
  .then(data => console.log('Response:', data))
  .catch(err => console.error('Error:', err));
```

**Résultat attendu** :
```json
{
  "success": true,
  "user": {
    "id": "...",
    "email": "...",
    "fullName": "...",
    ...
  }
}
```

## 🔧 Commandes de Débogage

### Vérifier les Cookies depuis le Backend

Ajouter temporairement dans `packages/api/src/controllers/auth-controller.ts` (fonction `getMe`) :

```typescript
console.log('Cookies received:', req.cookies);
console.log('User from token:', req.user);
```

### Vérifier les Cookies depuis le Frontend

Ajouter dans `apps/web/src/pages/AuthCallback.tsx` :

```typescript
console.log('Document cookies:', document.cookie);
console.log('API URL:', process.env.REACT_APP_API_URL);
```

## 📝 Prochaines Étapes

1. **Modifier sameSite en 'lax'** dans `auth-routes.ts`
2. **Redémarrer le backend**
3. **Tester à nouveau l'authentification Google**
4. **Vérifier les cookies dans DevTools**
5. **Partager les résultats des tests**

