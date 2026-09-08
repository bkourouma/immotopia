# Configuration Google OAuth - Immobillier

## ✅ Identifiants Google OAuth Configurés

### Client ID
```
YOUR_GOOGLE_CLIENT_ID
```

### Client Secret
```
YOUR_GOOGLE_CLIENT_SECRET
```

## 📝 Variables d'Environnement Configurées

### Backend (`packages/api/.env`)
```env
# Application URLs
FRONTEND_URL="http://localhost:3000"
BACKEND_URL="http://localhost:8001"
CLIENT_URL="http://localhost:3000"

# Google OAuth
GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
GOOGLE_CALLBACK_URL="http://localhost:8001/api/auth/google/callback"
```

### Frontend (`apps/web/.env`)
```env
# API Configuration
REACT_APP_API_URL=http://localhost:8001/api
REACT_APP_FRONTEND_URL=http://localhost:3000

# Google OAuth
REACT_APP_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
```

## 🔧 Configuration Google Cloud Console Requise

Pour que l'authentification fonctionne, vous devez configurer ces paramètres dans Google Cloud Console :

### 1. Origines JavaScript autorisées
```
http://localhost:3000
http://localhost:8001
```

### 2. URI de redirection autorisés
```
http://localhost:8001/api/auth/google/callback
```

### 3. Écran de consentement OAuth
- Type d'application : **Externe** (pour les tests)
- Nom de l'application : **Immobillier**
- Email d'assistance utilisateur : Votre email
- Domaines autorisés : `localhost`

## 🚀 Démarrage de l'Application

### 1. Démarrer le Backend
```bash
cd packages/api
npm run dev
```
Le backend sera accessible sur `http://localhost:8001`

### 2. Démarrer le Frontend
```bash
cd apps/web
npm run dev
```
Le frontend sera accessible sur `http://localhost:3000`

## 🧪 Tester l'Authentification Google

### Étapes de Test :

1. **Ouvrir l'application** : `http://localhost:3000`

2. **Aller sur la page d'inscription** : `http://localhost:3000/register`

3. **Cliquer sur "Se connecter avec Google"**

4. **Vérifier le flux** :
   - ✅ Redirection vers Google
   - ✅ Page de consentement Google s'affiche
   - ✅ Après autorisation, retour vers l'application
   - ✅ Redirection automatique vers le dashboard
   - ✅ Utilisateur connecté avec les informations Google

5. **Tester la connexion** : `http://localhost:3000/login`
   - ✅ Cliquer sur "Se connecter avec Google"
   - ✅ Connexion automatique si déjà autorisé
   - ✅ Redirection vers le dashboard

## 🔍 Vérification de la Configuration

### Vérifier que le backend est bien configuré :
```bash
# Dans packages/api
cat .env | grep GOOGLE
```

Devrait afficher :
```
GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
GOOGLE_CALLBACK_URL="http://localhost:8001/api/auth/google/callback"
```

### Vérifier que le frontend est bien configuré :
```bash
# Dans apps/web
cat .env | grep GOOGLE
```

Devrait afficher :
```
REACT_APP_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
```

## ⚠️ Important

1. **Redémarrer les serveurs** après modification des variables d'environnement
2. **Vérifier les ports** : Backend sur 8001, Frontend sur 3000
3. **Ne jamais commiter** les fichiers `.env` avec les vraies clés
4. **En production** : Utiliser des URLs HTTPS et mettre à jour les configurations Google Cloud

## 🐛 Dépannage

### Erreur "redirect_uri_mismatch"
- Vérifier que `http://localhost:8001/api/auth/google/callback` est bien dans les URI autorisés
- Vérifier que le port du backend est bien 8001

### Erreur "origin_mismatch"
- Vérifier que `http://localhost:3000` est dans les origines JavaScript autorisées
- Vérifier que le port du frontend est bien 3000

### L'utilisateur n'est pas redirigé après connexion
- Vérifier que `CLIENT_URL` est bien configuré dans le backend
- Vérifier les cookies dans les DevTools du navigateur
- Vérifier les logs du backend pour voir les erreurs

### Le bouton Google ne fait rien
- Vérifier que `REACT_APP_GOOGLE_CLIENT_ID` est bien configuré
- Redémarrer le serveur frontend après modification du .env
- Vérifier la console du navigateur pour les erreurs JavaScript

## 📚 Documentation Complémentaire

- Voir `GOOGLE_OAUTH_INTEGRATION.md` pour le détail de l'implémentation
- Voir `GOOGLE_OAUTH_SETUP.md` pour le guide complet de configuration Google Cloud

