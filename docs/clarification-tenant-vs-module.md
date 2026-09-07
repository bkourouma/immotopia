# Clarification : Tenant vs Module

## 🎯 La Confusion

Il y a souvent une confusion entre les concepts de **Tenant** et **Module**. Ce document clarifie la différence.

---

## 📊 Les Concepts

### 1. **TENANT** (Organisation/Entreprise)

Un **Tenant** est une **organisation cliente** qui utilise l'application ImmoTopia.

**Exemples concrets :**
- "Agence Immobilière ABC" (une agence immobilière)
- "Syndic XYZ" (un syndic de copropriété)
- "Promoteur Immobilier 123" (un promoteur)

**Caractéristiques :**
- Chaque tenant est une **entité distincte** avec ses propres :
  - Utilisateurs (collaborateurs)
  - Propriétés
  - Clients
  - Données
  - Paramètres
  - Abonnement

**Dans la base de données :**
```prisma
model Tenant {
  id        String     @id @default(uuid())
  name      String     // "Agence Immobilière ABC"
  slug      String     @unique // "agence-abc"
  type      TenantType // AGENCY ou OPERATOR
  // ... autres champs
}
```

**Types de Tenants :**
- `AGENCY` : Agence immobilière
- `OPERATOR` : Opérateur (syndic, promoteur, etc.)

> ⚠️ **Important** : Il n'y a que **2 types de tenants**, pas 3 !

---

### 2. **MODULE** (Fonctionnalité Métier)

Un **Module** est une **fonctionnalité métier** qui peut être activée ou désactivée pour un tenant.

**Exemples :**
- `MODULE_AGENCY` : Fonctionnalités pour les agences immobilières
- `MODULE_SYNDIC` : Fonctionnalités pour les syndics
- `MODULE_PROMOTER` : Fonctionnalités pour les promoteurs

**Caractéristiques :**
- Un tenant peut avoir **plusieurs modules activés** simultanément
- Les modules contrôlent quelles **fonctionnalités** sont disponibles pour un tenant
- Un module peut être activé ou désactivé par un administrateur de la plateforme

**Dans la base de données :**
```prisma
model TenantModule {
  id        String    @id @default(uuid())
  tenantId  String    @map("tenant_id")  // Lien vers le tenant
  moduleKey ModuleKey @map("module_key")  // MODULE_AGENCY, MODULE_SYNDIC, etc.
  enabled   Boolean   @default(false)     // Activé ou non
  // ...
}
```

**Modules disponibles :**
- `MODULE_AGENCY` : Module Agence
- `MODULE_SYNDIC` : Module Syndic
- `MODULE_PROMOTER` : Module Promoteur

> ⚠️ **Important** : Il y a **3 modules disponibles**, pas 3 tenants !

---

## 🔗 Relation entre Tenant et Module

### Relation : Un Tenant peut avoir plusieurs Modules

```
┌─────────────────┐
│   TENANT        │
│  "Agence ABC"   │
│  type: AGENCY   │
└────────┬────────┘
         │
         │ peut avoir
         │
         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ TenantModule    │     │ TenantModule    │     │ TenantModule    │
│ MODULE_AGENCY   │     │ MODULE_SYNDIC   │     │ MODULE_PROMOTER │
│ enabled: true   │     │ enabled: false  │     │ enabled: true   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Exemples Concrets

#### Exemple 1 : Agence Immobilière Simple
```
Tenant: "Agence Immobilière ABC"
  ├─ Type: AGENCY
  └─ Modules activés:
      ├─ MODULE_AGENCY: ✅ activé
      ├─ MODULE_SYNDIC: ❌ désactivé
      └─ MODULE_PROMOTER: ❌ désactivé
```

#### Exemple 2 : Syndic avec Module Agence
```
Tenant: "Syndic XYZ"
  ├─ Type: OPERATOR
  └─ Modules activés:
      ├─ MODULE_AGENCY: ✅ activé
      ├─ MODULE_SYNDIC: ✅ activé
      └─ MODULE_PROMOTER: ❌ désactivé
```

#### Exemple 3 : Promoteur avec Tous les Modules
```
Tenant: "Promoteur 123"
  ├─ Type: OPERATOR
  └─ Modules activés:
      ├─ MODULE_AGENCY: ✅ activé
      ├─ MODULE_SYNDIC: ✅ activé
      └─ MODULE_PROMOTER: ✅ activé
```

---

## 📋 Récapitulatif

| Concept | Nombre | Description |
|---------|--------|-------------|
| **Types de Tenants** | **2** | `AGENCY`, `OPERATOR` |
| **Modules Disponibles** | **3** | `MODULE_AGENCY`, `MODULE_SYNDIC`, `MODULE_PROMOTER` |
| **Tenants (organisations)** | **Illimité** | Chaque organisation cliente est un tenant |

---

## ❓ Réponse à Votre Question Initiale

### Question : "On a 3 tenant dans notre application"

**Réponse :** Non, il n'y a pas 3 tenants. Il y a :

1. **2 types de tenants** : `AGENCY` et `OPERATOR`
2. **3 modules disponibles** : `MODULE_AGENCY`, `MODULE_SYNDIC`, `MODULE_PROMOTER`
3. **Un nombre illimité de tenants** (organisations) qui peuvent être créés

### Question : "Tous ces tenant disposent de tous les mêmes rôles disponibles ?"

**Réponse :** OUI ! Tous les tenants (peu importe leur type ou leurs modules activés) disposent des **mêmes 4 rôles tenant** :

- ✅ `TENANT_ADMIN`
- ✅ `TENANT_MANAGER`
- ✅ `TENANT_AGENT`
- ✅ `TENANT_ACCOUNTANT`

Les modules activés n'affectent **pas** les rôles disponibles, mais affectent les **fonctionnalités** accessibles dans l'interface.

---

## 🎯 Analogie Simple

Pensez à un **restaurant** (tenant) qui peut proposer différents **types de cuisine** (modules) :

- **Tenant** = Le restaurant ("Restaurant ABC")
- **Type de Tenant** = Le type d'établissement (Fast-food ou Restaurant gastronomique)
- **Module** = Les types de cuisine proposés (Italienne, Française, Asiatique)
- **Rôles** = Les postes dans le restaurant (Chef, Serveur, Caissier, Manager)

Un restaurant peut proposer plusieurs types de cuisine (plusieurs modules activés), mais les postes (rôles) restent les mêmes pour tous les restaurants.

---

## 📚 Pour Aller Plus Loin

- **Tenants** : Voir `packages/api/prisma/schema.prisma` → `model Tenant`
- **Modules** : Voir `packages/api/prisma/schema.prisma` → `model TenantModule`
- **Rôles** : Voir `packages/api/prisma/schema.prisma` → `model Role`
