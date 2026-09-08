# Dépannage Google OAuth - Erreur "Plain HTTP to SSL-enabled server"

## 🔴 Problème Rencontré

```
Bad Request
Your browser sent a request that this server could not understand.
Reason: You're speaking plain HTTP to an SSL-enabled server port.
Instead use the HTTPS scheme to access this URL, please.

http://localhost:8000/api/auth/google
```

## 🔍 Cause du Problème

L'erreur indique que vous essayez d'accéder au port **8000** mais :
1. Votre backend est configuré pour tourner sur le port **8001** (voir `.env`)
2. Le port 8000 pourrait avoir un autre service qui écoute en HTTPS

## ✅ Solution Appliquée

### 1. Correction du Code Frontend

**Fichier modifié**: `apps/web/src/pages/Register.tsx`

**Avant** (ligne 21):
```typescript
const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';
```

**Après**:
```typescript
const apiUrl = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:8001';
```

**Changements**:
- ✅ Utilisation de `process.env.REACT_APP_API_URL` (Create React App) au lieu de `import.meta.env.VITE_API_URL` (Vite)
- ✅ Port par défaut changé de `8000` à `8001`
- ✅ Cohérence avec `Login.tsx` qui utilise déjà la bonne logique

### 2. Vérification de la Configuration

**Backend** (`packages/api/.env`):
```env
PORT=8001
BACKEND_URL="http://localhost:8001"
GOOGLE_CALLBACK_URL="http://localhost:8001/api/auth/google/callback"
```

**Frontend** (`apps/web/.env`):
```env
REACT_APP_API_URL=http://localhost:8001/api
```

## 🚀 Étapes pour Résoudre

### 1. Arrêter tous les serveurs
```bash
# Windows
taskkill /F /IM node.exe

# Ou utilisez Ctrl+C dans chaque terminal
```

### 2. Vérifier qu'aucun processus n'utilise les ports
```bash
# Vérifier le port 8001 (backend)
netstat -ano | findstr :8001

# Vérifier le port 3000 (frontend)
netstat -ano | findstr :3000

# Si un processus utilise le port, le tuer
taskkill /PID <PID> /F
```

### 3. Redémarrer le Backend
```bash
cd packages/api
npm run dev
```

**Vérifier la sortie**:
```
Server running on port 8001
```

### 4. Redémarrer le Frontend
```bash
cd apps/web
npm run dev
```

**Vérifier la sortie**:
```
Local:            http://localhost:3000
```

### 5. Tester l'Authentification Google

1. Ouvrir `http://localhost:3000/register`
2. Cliquer sur "Se connecter avec Google"
3. Vérifier que l'URL de redirection est: `http://localhost:8001/api/auth/google`

## 🔧 Vérifications Supplémentaires

### Vérifier que le backend répond
```bash
curl http://localhost:8001/health
```

**Réponse attendue**:
```json
{"status":"ok","timestamp":"2025-12-09T..."}
```

### Vérifier la route Google OAuth
```bash
# Ouvrir dans le navigateur
http://localhost:8001/api/auth/google
```

**Comportement attendu**:
- Redirection vers la page de consentement Google
- OU erreur "No state parameter" (normal si accès direct)

### Vérifier les variables d'environnement chargées

**Backend** - Ajouter temporairement dans `packages/api/src/index.ts`:
```typescript
console.log('PORT:', process.env.PORT);
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...');
console.log('GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL);
```

**Frontend** - Ouvrir la console du navigateur et taper:
```javascript
console.log('API URL:', process.env.REACT_APP_API_URL);
console.log('Google Client ID:', process.env.REACT_APP_GOOGLE_CLIENT_ID?.substring(0, 20) + '...');
```

## ⚠️ Erreurs Courantes

### Erreur: "redirect_uri_mismatch"
**Cause**: L'URI de redirection dans Google Cloud Console ne correspond pas

**Solution**: Vérifier dans Google Cloud Console que l'URI autorisé est:
```
http://localhost:8001/api/auth/google/callback
```

### Erreur: "origin_mismatch"
**Cause**: L'origine JavaScript n'est pas autorisée

**Solution**: Vérifier dans Google Cloud Console que les origines autorisées incluent:
```
http://localhost:3000
http://localhost:8001
```

### Erreur: "Cannot GET /api/auth/google"
**Cause**: Le backend n'est pas démarré ou la route n'existe pas

**Solution**:
1. Vérifier que le backend tourne sur le port 8001
2. Vérifier que `auth-routes.ts` contient bien la route Google OAuth
3. Vérifier les logs du backend pour les erreurs

### Erreur: "CORS policy"
**Cause**: Le frontend n'est pas autorisé à accéder au backend

**Solution**: Vérifier `packages/api/src/middleware/cors-middleware.ts`:
```typescript
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
```

## 📝 Checklist de Vérification

- [ ] Backend tourne sur le port 8001
- [ ] Frontend tourne sur le port 3000
- [ ] Variables d'environnement correctement configurées
- [ ] Google Cloud Console configuré avec les bonnes URLs
- [ ] Aucun autre service n'utilise les ports 8001 ou 3000
- [ ] Les deux serveurs ont été redémarrés après modification des `.env`
- [ ] Le bouton Google redirige vers `http://localhost:8001/api/auth/google`

## 🎯 Test Final

1. Ouvrir `http://localhost:3000/register`
2. Ouvrir les DevTools (F12) → Onglet Network
3. Cliquer sur "Se connecter avec Google"
4. Vérifier dans l'onglet Network:
   - Requête vers `http://localhost:8001/api/auth/google`
   - Statut: 302 (Redirection)
   - Location: URL Google OAuth

Si tout fonctionne, vous devriez être redirigé vers la page de consentement Google !

