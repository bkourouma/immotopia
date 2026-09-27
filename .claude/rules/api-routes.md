---
paths:
  - "packages/api/src/routes/**/*.ts"
  - "packages/api/src/controllers/**/*.ts"
  - "packages/api/src/services/**/*.ts"
  - "packages/api/src/middleware/**/*.ts"
---

# Routes API

Détail complet : [docs/governance/CODING_STANDARDS.md](../../docs/governance/CODING_STANDARDS.md)
et [docs/governance/SECURITY.md](../../docs/governance/SECURITY.md).

## Validation Zod

Motif actuel (modules finance récents, ex. `lib/finance/schemas-budgets.ts`) :
schémas Zod dans `src/lib/finance/schemas*.ts`, appelés directement en tête
de contrôleur avec `.parse()` (jamais `.safeParse()` suivi d'un abandon
silencieux) : `const body = createSiteBudgetSchema.parse(req.body ?? {})`.
Un `ZodError` non rattrapé remonte via `asyncHandler` jusqu'à
`errorHandler` (`middleware/error-middleware.ts`), qui répond 400 avec le
détail par champ. Les schémas récents sont en `.strict()` : un champ non
prévu est rejeté plutôt qu'ignoré.

Un middleware `validate(schema)` (`middleware/validation-middleware.ts`)
existe et reste utilisé sur `auth-routes.ts` et `crm-routes.ts` ; le motif
dominant du code récent est l'appel direct en contrôleur — ne pas mélanger
les deux styles dans un même fichier.

## Erreurs

Contrôleurs enveloppés dans `asyncHandler` ; services lèvent des erreurs
typées (`BadRequestError`, `NotFoundError`, `ConflictError`,
`ValidationError`, …) plutôt que des `Error` génériques. Jamais de
`try/catch` qui devine le code HTTP à partir du texte du message. Modèle :
`src/controllers/property-media-controller.ts`.

## Isolation tenant

- `requireTenantAccess` (`middleware/tenant-middleware.ts`) : sur chaque
  routeur qui sert une agence, pose `req.tenantContext`.
- `enforcePropertyTenantIsolation` (`middleware/tenant-isolation-middleware.ts`) :
  pour les biens et leurs enfants, pose `req.propertyTenantId` ; les
  services lisent une propriété via `getPropertyForTenant(propertyId,
tenantId)` (`utils/property-tenant-guard.ts`), jamais un `findUnique`
  seul.
- `assertBelongsToTenant(client, model, id, tenantId)`
  (`utils/tenant-ownership.ts`) : pour tout autre identifiant reçu dans
  une requête, à vérifier avant écriture ; lève `NotFoundError` si
  l'enregistrement appartient à une autre agence.
- Extension Prisma `utils/prisma-tenant-guard-extension.ts`
  (`TENANT_GUARD_MODE`, défaut `warn`) : seconde ligne de défense, dérivée
  du schéma. Ne jamais ignorer ses avertissements en log.

## Permissions (RBAC)

`requirePermission(key)` / `requireAnyPermission([...])` /
`requireAllPermissions([...])` (`middleware/rbac-middleware.ts`), posé sur
la route. Chaque module a ses gardes nommées : `finance-rbac-middleware.ts`,
`crm-rbac-middleware.ts`, `property-rbac-middleware.ts`,
`rental-rbac-middleware.ts`, `maintenance-rbac-middleware.ts`,
`communication-rbac-middleware.ts` — ex. `requireDocumentsValidate =
requirePermission('FINANCE_DOCUMENTS_VALIDATE')`. Ajouter un nouveau droit
dans le module concerné, jamais un contrôle ad hoc en contrôleur.

## Transactions et Prisma

Une écriture en plusieurs étapes qui doit rester cohérente va dans
`prisma.$transaction(async tx => ...)` ; notifications après le commit.
Un seul client (`utils/database`) ; jamais `include: { user: true }` —
toujours `select` explicite sur `User`.

## Garde-fou

Toute route nouvelle doit porter une garde tenant/portail/plateforme,
vérifié par `__tests__/unit/routes-inventory.test.ts`. Tout modèle Prisma
nouveau doit passer `__tests__/unit/schema-tenant-coverage.test.ts`.
