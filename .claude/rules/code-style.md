---
paths:
  - "packages/api/src/**/*.ts"
  - "apps/web/src/**/*.{ts,tsx}"
---

# Style de code

Détail complet : [docs/governance/CODING_STANDARDS.md](../../docs/governance/CODING_STANDARDS.md).
AGENTS.md prime en cas de désaccord.

## Nommage (observé dans le dépôt, à reproduire)

- `packages/api/src/routes`, `controllers`, `services`, `middleware`,
  `utils` : kebab-case avec suffixe de rôle —
  `property-media-controller.ts`, `finance-rbac-middleware.ts`,
  `tenant-ownership.ts`. Ne pas introduire de `camelCase.ts` ou de
  `PascalCase.ts` dans ces dossiers.
- `apps/web/src/components`, `pages` : PascalCase — `ProtectedRoute.tsx`,
  `TenantSwitcher.tsx`. Un dossier de page peut grouper plusieurs écrans
  (`pages/OwnerPortal/Documents.tsx`).
- `apps/web/src/services`, `utils`, `i18n` : kebab-case (`api-client.ts`,
  `tenant-service.ts`), comme côté API.

## Fonctions

Code **nouveau** : viser moins de 50 lignes par fonction. C'est une cible,
pas une réécriture rétroactive — une bonne partie du code existant la
dépasse déjà (voir `AUDIT_CODE.md`, fichiers de plusieurs milliers de
lignes dans `src/lib/syndics`, `src/services/owner-portal-service.ts`). Ne
pas grossir ces fonctions davantage en y ajoutant du code non lié.

## Prisma

Un seul client : `import { prisma } from '../utils/database'`. Jamais
`new PrismaClient()` ailleurs — `geographic-service.ts` et
`src/lib/syndics/queries.ts` le font encore, c'est de la dette connue
(`AUDIT_CODE.md` §3.5), pas un modèle à suivre.

Jamais `include: { user: true }` sur une relation vers `User` : l'objet
complet porte `passwordHash`. Toujours un `select` explicite, ex.
`user: { select: { id: true, email: true, fullName: true } }`
(`services/maintenance-notification-service.ts`).

## i18n

`t()` prend le texte français comme clé : `t('Ajouter un bien')`, jamais
`t('properties.add')`. Ne jamais retoucher un texte français déjà utilisé
sans lancer ensuite `npm run i18n:extract` dans le paquet concerné — la
traduction orpheline part dans un `*.orphans.json` au lieu d'être perdue,
mais **doit être reportée à la main** sur la nouvelle clé.

## RTL — propriétés logiques uniquement

`ms-4`, `me-2`, `margin-inline-start`, `align: 'end'` — jamais `ml-4`,
`margin-left`, `align: 'right'`. L'arabe retourne toute la mise en page ;
une propriété physique ne suit pas.

## Frontend

- Réseau : `utils/api-client` uniquement, jamais `fetch` brut.
- URLs : `config/api` (`API_ORIGIN`, `API_URL`, `fileUrl()`), jamais
  d'origine ou de port codé en dur ailleurs.
- Pages chargées en `React.lazy` depuis `App.tsx`.
- Jamais `dangerouslySetInnerHTML` sur du contenu utilisateur — passer par
  une `<iframe sandbox>` (modèle :
  `pages/newsletter/NewsletterCampaignsPage.tsx`).

## TypeScript

Le backend compte environ 160 erreurs `tsc --noEmit` préexistantes,
tolérées temporairement par la CI (`CONTRIBUTING.md`). Ne pas en ajouter
dans un fichier qui compile déjà sans erreur — vérifier avant et après
modification avec `npm run typecheck`.

## Ports

API `8001`, web `3000`. Ne jamais écrire `8000` ou `5000`, y compris dans
un exemple ou un commentaire.
