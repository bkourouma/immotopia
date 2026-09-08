# Intégration Google OAuth - Résumé des Modifications

## Vue d'ensemble
Ce document résume les modifications apportées pour intégrer Google OAuth dans l'application Immobillier, en remplacement de l'ancien système de rôles (STUDENT/INSTRUCTOR) par le nouveau système de profils Tenant.

## Modifications Frontend

### 1. Page d'Inscription (`apps/web/src/pages/Register.tsx`)
**Changements:**
- ✅ Ajout du bouton "Se connecter avec Google"
- ✅ Suppression de l'ancien sélecteur de rôle (STUDENT/INSTRUCTOR)
- ✅ Mise à jour pour utiliser le nouveau système de profils Tenant
- ✅ Ajout de la fonction `handleGoogleLogin()` pour rediriger vers l'authentification Google
- ✅ Ajout du logo Google SVG dans le bouton

**Fonctionnalités:**
- L'utilisateur peut s'inscrire avec email/mot de passe (système existant)
- L'utilisateur peut s'inscrire avec Google OAuth (nouveau)
- Après inscription Google, l'utilisateur est redirigé vers `/auth/callback`

### 2. Page de Connexion (`apps/web/src/pages/Login.tsx`)
**Changements:**
- ✅ Ajout du bouton "Se connecter avec Google"
- ✅ Ajout de la fonction `handleGoogleLogin()` pour rediriger vers l'authentification Google
- ✅ Ajout d'un séparateur visuel "Ou continuer avec"
- ✅ Conservation des boutons de connexion rapide pour les tests

**Fonctionnalités:**
- L'utilisateur peut se connecter avec email/mot de passe
- L'utilisateur peut se connecter avec Google OAuth
- Connexion rapide pour les utilisateurs de test (développement)

### 3. Page de Callback OAuth (`apps/web/src/pages/AuthCallback.tsx`)
**Nouveau fichier créé:**
- ✅ Gère le retour de Google OAuth
- ✅ Vérifie le paramètre `success` dans l'URL
- ✅ Récupère les informations de l'utilisateur via `/api/auth/me`
- ✅ Met à jour le contexte d'authentification
- ✅ Redirige vers le dashboard en cas de succès
- ✅ Affiche les erreurs en cas d'échec
- ✅ Affiche un état de chargement pendant le traitement

**États gérés:**
- Loading: Pendant la vérification de l'authentification
- Success: Redirection automatique vers le dashboard
- Error: Affichage du message d'erreur avec lien de retour

### 4. Configuration des Routes (`apps/web/src/App.tsx`)
**Changements:**
- ✅ Ajout de l'import `AuthCallback`
- ✅ Ajout de la route `/auth/callback` pour gérer le retour OAuth

### 5. Types TypeScript (`apps/web/src/types/auth-types.ts`)
**Changements:**
- ✅ Mise à jour de `RegisterData` pour correspondre au backend
- ✅ Ajout du champ `fullName` (requis)
- ✅ Suppression du champ `role` (obsolète)
- ✅ Conservation de la compatibilité avec le système existant

### 6. Variables d'Environnement
**Fichiers modifiés:**
- ✅ `apps/web/.env` - Ajout de `REACT_APP_GOOGLE_CLIENT_ID`
- ✅ `apps/web/env.example` - Ajout de `REACT_APP_GOOGLE_CLIENT_ID`

**Configuration requise:**
```env
REACT_APP_GOOGLE_CLIENT_ID=your-google-client-id-here
```

## Backend (Déjà Implémenté)

Le backend dispose déjà de:
- ✅ Configuration Passport.js avec stratégie Google OAuth
- ✅ Routes `/api/auth/google` et `/api/auth/google/callback`
- ✅ Gestion des tokens JWT (access + refresh)
- ✅ Cookies HTTP-only sécurisés
- ✅ Nouveau modèle de données avec Tenants et profils

## Flux d'Authentification Google OAuth

### Inscription/Connexion:
1. L'utilisateur clique sur "Se connecter avec Google"
2. Redirection vers `/api/auth/google`
3. Google affiche la page de consentement
4. Après autorisation, Google redirige vers `/api/auth/google/callback`
5. Le backend crée/récupère l'utilisateur et génère les tokens
6. Redirection vers `/auth/callback?success=true` avec cookies
7. Le frontend vérifie l'authentification via `/api/auth/me`
8. Mise à jour du contexte et redirection vers `/dashboard`

### Gestion des Erreurs:
- Si l'authentification échoue, redirection vers `/auth/callback?success=false&error=message`
- Affichage du message d'erreur avec option de retour à la connexion

## Configuration Google Cloud Console

Pour que l'intégration fonctionne, il faut:

1. **Créer un projet Google Cloud**
2. **Activer l'API Google+ / Google Identity**
3. **Créer des identifiants OAuth 2.0:**
   - Type: Application Web
   - Origines JavaScript autorisées: `http://localhost:3000`
   - URI de redirection autorisés: `http://localhost:8001/api/auth/google/callback`

4. **Configurer les variables d'environnement:**
   - Backend: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
   - Frontend: `REACT_APP_GOOGLE_CLIENT_ID`

## Tests Recommandés

1. ✅ Tester l'inscription avec Google
2. ✅ Tester la connexion avec Google (utilisateur existant)
3. ✅ Vérifier la gestion des erreurs OAuth
4. ✅ Vérifier la persistance de la session (cookies)
5. ✅ Tester la déconnexion
6. ✅ Vérifier la compatibilité avec l'inscription email/mot de passe

## Notes Importantes

- Les montants monétaires doivent être en FCFA avec séparateurs d'espace (ex: 1 500 000 FCFA)
- Ne jamais changer les ports - tuer les processus existants en cas de conflit
- Le système de rôles STUDENT/INSTRUCTOR a été complètement remplacé par le système Tenant
- Les cookies sont HTTP-only et sécurisés en production
- Le refresh token a une durée de vie de 7 jours
- L'access token a une durée de vie de 15 minutes

## Prochaines Étapes

1. Configurer Google Cloud Console avec les bonnes URLs
2. Mettre à jour les variables d'environnement avec les vraies clés
3. Tester le flux complet d'authentification
4. Mettre à jour les tests unitaires et E2E
5. Documenter le processus pour les autres développeurs

