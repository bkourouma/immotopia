# Disponibilité des Rôles par Tenant

## Vue d'ensemble

Ce document clarifie la disponibilité des rôles dans l'application ImmoTopia pour tous les tenants.

## Structure de l'Application

### ⚠️ Clarification Importante

Il ne faut **pas confondre** :
- **Tenant** : Une organisation cliente (ex: "Agence ABC", "Syndic XYZ")
- **Module** : Une fonctionnalité métier qui peut être activée pour un tenant

### Types de Tenants
L'application supporte **2 types de tenants** :
- `AGENCY` : Agence immobilière
- `OPERATOR` : Opérateur (syndic, promoteur, etc.)

> **Note** : Il peut y avoir un nombre illimité de tenants (organisations) dans l'application.

### Modules Disponibles
L'application propose **3 modules** qui peuvent être activés pour chaque tenant :
- `MODULE_AGENCY` : Module Agence
- `MODULE_SYNDIC` : Module Syndic
- `MODULE_PROMOTER` : Module Promoteur

> **Note** : Un tenant peut avoir plusieurs modules activés simultanément. Les modules contrôlent les fonctionnalités disponibles, pas les rôles.

## Rôles Disponibles dans l'Application

L'application définit **5 rôles** au total :

### 1. PLATFORM_SUPER_ADMIN
- **Scope** : `PLATFORM`
- **Description** : Super administrateur de la plateforme (tout gérer sur toute la plateforme)
- **Disponibilité** : Global (non lié à un tenant spécifique)
- **Permissions** : Toutes les permissions de la plateforme

### 2. TENANT_ADMIN
- **Scope** : `TENANT`
- **Description** : Administrateur du tenant (tout gérer au niveau du tenant)
- **Disponibilité** : **Disponible pour TOUS les tenants**
- **Permissions** : 
  - Gestion complète du tenant (settings, utilisateurs, modules)
  - Toutes les permissions CRM, Properties, Rental, Maintenance
  - Gestion de la facturation

### 3. TENANT_MANAGER
- **Scope** : `TENANT`
- **Description** : Manager (gestion sauf facturation)
- **Disponibilité** : **Disponible pour TOUS les tenants**
- **Permissions** :
  - Consultation des paramètres du tenant
  - Gestion des utilisateurs (view, edit)
  - Consultation de la facturation (sans modification)
  - Toutes les permissions CRM, Properties, Rental, Maintenance

### 4. TENANT_AGENT
- **Scope** : `TENANT`
- **Description** : Agent (consulter et créer des annonces)
- **Disponibilité** : **Disponible pour TOUS les tenants**
- **Permissions** :
  - Consultation des paramètres du tenant
  - Consultation des utilisateurs
  - Gestion des propriétés (view, create, edit, schedule visits)
  - Gestion CRM limitée (view, create, edit pour contacts, deals, activities, appointments, matching)

### 5. TENANT_ACCOUNTANT
- **Scope** : `TENANT`
- **Description** : Comptable (facturation et comptabilité)
- **Disponibilité** : **Disponible pour TOUS les tenants**
- **Permissions** :
  - Toutes les permissions de facturation (BILLING_*)

## Réponse à la Question

### ✅ OUI, tous les tenants disposent des mêmes rôles disponibles

**Tous les 4 rôles tenant** (`TENANT_ADMIN`, `TENANT_MANAGER`, `TENANT_AGENT`, `TENANT_ACCOUNTANT`) sont disponibles pour **TOUS les tenants**, indépendamment de :

- ✅ Le **type de tenant** (AGENCY ou OPERATOR)
- ✅ Les **modules activés** (MODULE_AGENCY, MODULE_SYNDIC, MODULE_PROMOTER)
- ✅ Le **statut du tenant** (PENDING, ACTIVE, SUSPENDED)

## Architecture Technique

### Structure des Rôles

Les rôles sont définis **une seule fois** dans la table `roles` et sont **globaux** à toute l'application :

```prisma
model Role {
  id          String    @id @default(uuid())
  key         String    @unique  // PLATFORM_SUPER_ADMIN, TENANT_ADMIN, etc.
  name        String
  description String?   @db.Text
  scope       RoleScope // PLATFORM ou TENANT
  // ...
}
```

### Assignation des Rôles

Les rôles sont assignés aux utilisateurs via la table `user_roles` :

```prisma
model UserRole {
  id          String    @id @default(uuid())
  userId      String    @map("user_id")
  roleId      String    @map("role_id")
  tenantId    String?   @map("tenant_id") // NULL pour PLATFORM, requis pour TENANT
  // ...
}
```

**Règles d'assignation** :
- Si `role.scope = PLATFORM` → `tenantId` doit être `NULL`
- Si `role.scope = TENANT` → `tenantId` doit être **NOT NULL** et correspondre à un tenant existant

### Validation dans le Code

Dans `packages/api/src/services/membership-service.ts`, la fonction `updateMemberRoles` vérifie uniquement que :
1. Les rôles existent
2. Les rôles ont le scope `TENANT`

**Aucune restriction** n'est appliquée sur :
- Le type de tenant
- Les modules activés
- Le statut du tenant

```typescript
// Vérification dans updateMemberRoles
const roles = await prisma.role.findMany({
  where: {
    id: { in: data.roleIds },
    scope: 'TENANT'  // Seule restriction : scope TENANT
  }
});
```

## Exemples d'Usage

### Exemple 1 : Tenant AGENCY avec MODULE_AGENCY
Un tenant de type `AGENCY` avec le module `MODULE_AGENCY` activé peut avoir :
- ✅ TENANT_ADMIN
- ✅ TENANT_MANAGER
- ✅ TENANT_AGENT
- ✅ TENANT_ACCOUNTANT

### Exemple 2 : Tenant OPERATOR avec MODULE_SYNDIC
Un tenant de type `OPERATOR` avec le module `MODULE_SYNDIC` activé peut avoir :
- ✅ TENANT_ADMIN
- ✅ TENANT_MANAGER
- ✅ TENANT_AGENT
- ✅ TENANT_ACCOUNTANT

### Exemple 3 : Tenant avec plusieurs modules
Un tenant avec `MODULE_AGENCY` + `MODULE_SYNDIC` + `MODULE_PROMOTER` activés peut avoir :
- ✅ TENANT_ADMIN
- ✅ TENANT_MANAGER
- ✅ TENANT_AGENT
- ✅ TENANT_ACCOUNTANT

## Conclusion

**Tous les tenants de l'application disposent exactement des mêmes rôles disponibles**, sans aucune restriction basée sur le type de tenant ou les modules activés. La seule distinction est entre les rôles `PLATFORM` (globaux) et `TENANT` (scopés à un tenant spécifique).

Cette architecture permet une grande flexibilité dans la gestion des utilisateurs et des permissions, tout en maintenant une structure RBAC cohérente et uniforme à travers toute l'application.
