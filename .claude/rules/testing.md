---
paths:
  - "packages/api/__tests__/**"
  - "apps/web/src/**/__tests__/**"
  - "**/*.test.{ts,tsx}"
  - "**/*.spec.{ts,tsx}"
---

# Tests

Détail complet : [docs/governance/CODING_STANDARDS.md](../../docs/governance/CODING_STANDARDS.md).

## Backend — Jest (`packages/api/__tests__`)

Trois dossiers, trois frontières de mock :

- `unit/` — un test de contrôleur mocke le **service** appelé
  (`jest.mock('../../src/services/property-service', () => ({ ... }))`),
  pas Prisma directement ; un test de service/garde-fou mocke
  `utils/database` ou lit `Prisma.dmmf` (`schema-tenant-coverage.test.ts`).
- `api/` — bout en bout via `supertest` sur l'app Express réelle.
  `authenticate`, `requireTenantAccess`, les gardes `*-rbac-middleware`
  sont remplacés par des passe-plats posant `req.user`/`req.tenantContext` ;
  seul le module de domaine du contrôleur est simulé (modèle :
  `__tests__/api/finance.suppliers.test.ts`).
- `integration/` — plusieurs couches réelles ensemble.

Un mock de module doit couvrir **chaque export utilisé** par le fichier
testé, sinon l'import réel se glisse dedans sans que Jest le signale.

## Frontend — Vitest (`apps/web/src`)

Le mock se pose à la **frontière réseau** :
`vi.mock('../../utils/api-client', () => ({ default: { get: vi.fn(), ... } }))`,
les vrais services et composants tournant par-dessus (modèle :
`src/__tests__/admin/tenant-create.test.tsx`). Ne pas mocker un service
métier si mocker `api-client` suffit.

**Vitest refuse tout import qu'un `vi.mock` ne déclare pas explicitement**,
là où Jest renvoie `undefined` en silence : un composant qui utilise un
export absent de la factory casse au montage — corriger la factory.

`setupTests.ts` force `fr` dans `localStorage` avant tout import. Sans
lui, jsdom se déclare `en-US`, l'appli bascule en anglais, et la suite
(écrite en français) cherche « Enregistrer » dans une interface qui
affiche « Save ». Ne jamais contourner cette ligne dans un test.

**Un échec par timeout dans la suite web ne prouve rien** tant que le test
n'a pas été relancé seul (`npx vitest run <fichier>`) : la suite complète
est lente, un timeout isolé est souvent un effet de charge parallèle.

## Garde-fous multi-tenant

- `__tests__/unit/routes-inventory.test.ts` — échoue si une route n'a ni
  `requireTenantAccess`, ni une garde de portail
  (`requireTenantPortalAccess`, `requireOwnerPortalAccess`,
  `requireCoOwnerPortalAccess`), ni `requirePermission('PLATFORM_*')`,
  hors liste blanche explicite. Toute route nouvelle doit le passer.
- `__tests__/unit/schema-tenant-coverage.test.ts` — tout modèle Prisma
  nouveau doit être CLOISONNÉ, ENFANT ou GLOBAL, sinon le test échoue.
- `__tests__/api/portal-no-disk-paths.test.ts` — aucune réponse de portail
  ne porte de chemin disque ni de clé `/uploads/...` d'un fichier privé.

## Isolation de bout en bout

`npm run test:isolation` (`__tests__/helpers/run-isolation-tests.js`)
utilise une base dédiée via `DATABASE_URL_TEST` (`env.example`). Sans
cette variable, le script ne fait rien et sort en code 0 — pas une preuve
d'étanchéité, seulement une suite non exécutée.
