# Migration de l'Ancien au Nouveau Système d'Authentification

## Vue d'ensemble
Ce document résume les modifications apportées pour migrer de l'ancien système de rôles (STUDENT/INSTRUCTOR/ADMIN) vers le nouveau système basé sur les Tenants avec Google OAuth.

## Changements du Modèle de Données

### Ancien Modèle (Spec 1-auth-login)
```typescript
interface User {
  id: string;
  email: string;
  full_name: string;        // ❌ Ancien
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';  // ❌ Ancien
  email_verified: boolean;
  created_at: string;       // ❌ Ancien
  updated_at: string;
}
```

### Nouveau Modèle (Spec 002-auth-profiles)
```typescript
interface User {
  id: string;
  email: string;
  fullName: string | null;  // ✅ Nouveau (camelCase)
  avatarUrl: string | null; // ✅ Nouveau
  globalRole: 'SUPER_ADMIN' | 'USER';  // ✅ Nouveau
  emailVerified: boolean;
  isActive: boolean;        // ✅ Nouveau
  createdAt: string;        // ✅ Nouveau (camelCase)
  updatedAt: string;        // ✅ Nouveau (camelCase)
}
```

## Fichiers Modifiés

### 1. Types TypeScript (`apps/web/src/types/auth-types.ts`)
**Changements:**
- ✅ Mise à jour de l'interface `User` pour correspondre au backend
- ✅ Suppression du champ `role`
- ✅ Ajout de `globalRole: 'SUPER_ADMIN' | 'USER'`
- ✅ Changement de `full_name` → `fullName`
- ✅ Changement de `created_at` → `createdAt`
- ✅ Ajout de `avatarUrl`, `isActive`

### 2. Service d'Authentification (`apps/web/src/services/auth-service.ts`)
**Changements:**
- ✅ Suppression de `role` dans la fonction `register()`
- ✅ Suppression de `confirmPassword` envoyé au backend

### 3. Navigation (`apps/web/src/components/Navigation.tsx`)
**Changements:**
- ✅ `user?.full_name` → `user?.fullName`
- ✅ Affichage du rôle: `SUPER_ADMIN` → "Super Admin", `USER` → "Utilisateur"
- ✅ Suppression des rôles STUDENT/INSTRUCTOR/ADMIN

### 4. Route Protégée (`apps/web/src/components/ProtectedRoute.tsx`)
**Changements:**
- ✅ `requiredRole?: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN'` → `requiredRole?: 'SUPER_ADMIN' | 'USER'`
- ✅ `user?.role` → `user?.globalRole`

### 5. Dashboard (`apps/web/src/pages/Dashboard.tsx`)
**Changements:**
- ✅ `user.full_name` → `user.fullName`
- ✅ `user.created_at` → `user.createdAt`
- ✅ `user.role` → `user.globalRole`
- ✅ Affichage du rôle global au lieu des anciens rôles
- ✅ Contenu conditionnel basé sur `globalRole` au lieu de `role`

### 6. Page d'Inscription (`apps/web/src/pages/Register.tsx`)
**Changements:**
- ✅ Suppression du sélecteur de rôle (STUDENT/INSTRUCTOR)
- ✅ Ajout du bouton "Se connecter avec Google"
- ✅ Mise à jour pour utiliser le nouveau système

### 7. Page de Connexion (`apps/web/src/pages/Login.tsx`)
**Changements:**
- ✅ Ajout du bouton "Se connecter avec Google"
- ✅ Conservation des boutons de test pour le développement

## Mapping des Rôles

### Ancien Système → Nouveau Système

| Ancien Rôle | Nouveau Rôle Global | Profil Tenant |
|-------------|---------------------|---------------|
| STUDENT     | USER                | TenantClient (RENTER/BUYER) |
| INSTRUCTOR  | USER                | Collaborator (AGENT) |
| ADMIN       | SUPER_ADMIN         | Collaborator (ADMIN) |

## Nouvelles Fonctionnalités

### 1. Google OAuth
- ✅ Authentification via Google
- ✅ Création automatique de compte
- ✅ Gestion des tokens JWT
- ✅ Cookies HTTP-only sécurisés

### 2. Système Multi-Tenant
- ✅ Un utilisateur peut avoir plusieurs profils
- ✅ Profils Collaborateur (ADMIN, MANAGER, AGENT)
- ✅ Profils Client (OWNER, RENTER, BUYER)
- ✅ Gestion par Tenant (AGENCY, OPERATOR)

### 3. Rôles Globaux Simplifiés
- ✅ `SUPER_ADMIN`: Accès complet à la plateforme
- ✅ `USER`: Utilisateur standard avec profils Tenant

## Migration des Données Existantes

Si vous avez des utilisateurs existants dans l'ancien système, voici comment les migrer :

```sql
-- Migration des utilisateurs
UPDATE users SET
  global_role = CASE
    WHEN role = 'ADMIN' THEN 'SUPER_ADMIN'
    ELSE 'USER'
  END,
  full_name = COALESCE(full_name, email),
  is_active = true
WHERE global_role IS NULL;

-- Créer des profils Tenant pour les anciens utilisateurs
-- (À adapter selon vos besoins spécifiques)
```

## Tests de Régression

### À Tester:
1. ✅ Inscription avec email/mot de passe
2. ✅ Inscription avec Google OAuth
3. ✅ Connexion avec email/mot de passe
4. ✅ Connexion avec Google OAuth
5. ✅ Affichage du profil utilisateur
6. ✅ Navigation et permissions
7. ✅ Déconnexion

## Notes Importantes

- **Compatibilité descendante**: L'ancien système n'est plus supporté
- **Migration requise**: Les utilisateurs existants doivent être migrés
- **Nouveaux champs**: `avatarUrl`, `isActive` sont maintenant disponibles
- **Naming convention**: Utilisation de camelCase au lieu de snake_case

## Prochaines Étapes

1. Tester l'authentification Google OAuth
2. Implémenter la gestion des profils Tenant
3. Créer les interfaces pour les collaborateurs
4. Créer les interfaces pour les clients
5. Implémenter le système de permissions par Tenant

