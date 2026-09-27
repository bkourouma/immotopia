# Conventions de code — ImmoTopia

En cas de désaccord entre ce document et [AGENTS.md](../../AGENTS.md), **AGENTS.md
prime**. Ce guide en développe le détail ; pour les conventions humaines de
contribution (branches, hooks, CI), voir [CONTRIBUTING.md](../../CONTRIBUTING.md) ;
pour l'état de la dette technique, voir [AUDIT_CODE.md](../../AUDIT_CODE.md), non
reproduit ici.

## 1. Organisation du monorepo

```text
apps/web                 React 18 + TypeScript + Ant Design 6, build Vite
packages/api             Express 4 + Prisma 5 + PostgreSQL
packages/tsconfig        configuration TypeScript partagée
packages/eslint-config   configuration ESLint partagée
docs/                    documentation (index : docs/README.md)
specs/                   spécifications fonctionnelles par module
```

Workspaces npm déclarés dans le `package.json` racine :
`packages/tsconfig`, `packages/eslint-config`, `packages/api` (nom de
paquet `@immotopia/api`), `apps/web` (`@immotopia/web`). Une seule
installation, à la racine (`npm install`) : un seul `package-lock.json`
pour tout le dépôt. Ne jamais lancer `npm install` dans `apps/web` ou
`packages/api` séparément.

Commandes courantes (racine) :

```bash
npm run dev          # API (8001) + web (3000) en parallèle
npm run dev:api       # API seule
npm run dev:web       # web seul
npm run build         # build des deux paquets
npm run typecheck     # tsc --noEmit sur les deux paquets
npm run lint
npm test              # jest — @immotopia/api
npm run test:web      # vitest — @immotopia/web
```

Ports : API `8001`, web `3000`. Des documents archivés mentionnent `8000`
ou `5000` : c'est faux, ne pas les reproduire dans du code ou de la
documentation nouvelle.

## 2. Conventions backend (`packages/api`)

### 2.1 Nommage des fichiers

`src/routes`, `controllers`, `services`, `middleware`, `utils`, `lib` :
kebab-case, suffixé par le rôle du fichier — `property-media-controller.ts`,
`finance-rbac-middleware.ts`, `tenant-ownership.ts`,
`prisma-tenant-guard-extension.ts`. Les schémas Zod d'un module vivent à
côté de sa logique, ex. `src/lib/finance/schemas-budgets.ts`.

### 2.2 Couches et responsabilités

Le découpage routes → contrôleurs → services est la règle : les requêtes
Prisma vivent dans les services, pas dans les contrôleurs (l'audit compte
13 appels Prisma dans les contrôleurs contre 732 dans les services —
proportion à préserver). Certains modules (`syndics`, `patrimoine`) vivent
dans `src/lib/<module>/queries.ts` plutôt que `src/services/` : ne pas
introduire un troisième emplacement pour un nouveau module, choisir l'un
des deux existants selon la taille attendue.

### 2.3 Prisma

Un seul client, importé partout de la même façon :

```ts
import { prisma } from "../utils/database";
```

`geographic-service.ts` et `src/lib/syndics/queries.ts` instancient encore
leur propre `PrismaClient` : dette connue (`AUDIT_CODE.md` §3.5), à ne pas
imiter dans du code nouveau.

**Jamais `include: { user: true }`** sur une relation vers `User` — l'objet
complet porte `passwordHash`. Toujours un `select` explicite :

```ts
// services/maintenance-notification-service.ts
user: { select: { id: true, email: true, fullName: true } }
```

**Écritures multi-étapes** : toute séquence de mutations qui doit rester
cohérente (création + changement de statut + historique) va dans
`prisma.$transaction(async tx => { ... })`. Les effets de bord externes
(e-mail, WhatsApp) partent après le commit, jamais à l'intérieur — un
échec d'envoi ne doit pas faire annuler une transaction déjà valide côté
métier.

**Bornage des listes** : un `findMany` exposé sur une route doit porter un
`take` (et une pagination côté contrôleur), pas une liste non bornée.

### 2.4 Isolation multi-tenant

Toute requête sur une entité appartenant à une agence est filtrée par
`tenantId` :

- `requireTenantAccess` (`middleware/tenant-middleware.ts`) est monté sur
  chaque routeur qui sert une agence ; il pose `req.tenantContext`.
- Pour les biens et leurs enfants (médias, documents, historique de
  statut, qui ne portent pas `tenantId` en base) :
  `enforcePropertyTenantIsolation` (`middleware/tenant-isolation-middleware.ts`)
  pose `req.propertyTenantId`, et chaque service résout la propriété via
  `getPropertyForTenant(propertyId, tenantId)`
  (`utils/property-tenant-guard.ts`) plutôt qu'un `findUnique({ where: { id } })`
  seul.
- Pour tout autre identifiant reçu dans le corps d'une requête (`siteId`,
  `contactId`, utilisateur assigné…) : `assertBelongsToTenant(client,
model, id, tenantId)` (`utils/tenant-ownership.ts`), qui lève
  `NotFoundError` — la même erreur qu'un objet inexistant — si
  l'enregistrement appartient à une autre agence. Un utilisateur désigné
  doit en plus être membre actif de l'agence.
- L'extension Prisma `utils/prisma-tenant-guard-extension.ts` (activée via
  `TENANT_GUARD_MODE`, `warn` par défaut, `off`/`enforce` possibles) est
  une seconde ligne de défense, dérivée automatiquement du schéma Prisma
  (`Prisma.dmmf`) : tout modèle portant `tenantId`/`tenant_id` est
  surveillé sans liste à maintenir à la main. Elle détecte une requête
  sans filtre tenant et, en lecture, une ligne renvoyée qui n'appartient
  pas au tenant du contexte. Ne jamais ignorer ses avertissements en
  journal : ce sont les seuls signaux qui restent quand une garde
  applicative a été oubliée.

### 2.5 Erreurs

Les services lèvent des erreurs typées de `middleware/error-middleware.ts` :
`BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`,
`ConflictError`, `ValidationError`, et des variantes propres à
l'abonnement (`ModuleNotIncludedError`, `QuotaExceededError`, …). Les
contrôleurs sont enveloppés dans `asyncHandler`, qui capture toute
promesse rejetée et la transmet à `errorHandler` :

```ts
export const uploadMediaHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const tenantId = requireTenantId(req);
    if (!req.file) {
      throw new BadRequestError("Un fichier est requis.");
    }
    // ...
    res.status(201).json({ success: true, data: media });
  },
);
```

Modèle de référence : `src/controllers/property-media-controller.ts`.
**Ne pas ajouter de `try/catch` qui devine le code HTTP à partir du texte
du message** (`includes('not found')` etc.) — c'est le motif que
`asyncHandler` remplace. `errorHandler` reconnaît aussi nativement les
`ZodError`, les erreurs Multer et les codes Prisma connus (`P2002`,
`P2025`, `P2003`) : un contrôleur n'a pas à les traduire lui-même.

### 2.6 Validation Zod

Le motif des modules récents (finance, lots 2+) : des schémas dans
`src/lib/finance/schemas*.ts`, appelés directement en tête de contrôleur :

```ts
// controllers/finance-budgets-controller.ts
const body = createSiteBudgetSchema.parse(req.body ?? {});
```

`.parse()` partout, jamais `.safeParse()` suivi d'un abandon silencieux du
résultat `success: false`. Les schémas récents sont en `.strict()` : un
champ imprévu dans le corps est rejeté en 400 plutôt qu'ignoré. Un
`ZodError` non intercepté remonte via `asyncHandler` jusqu'à
`errorHandler`, qui le formate en 400 avec le détail par champ — aucune
gestion locale n'est nécessaire.

Un middleware `validate(schema)` plus ancien
(`middleware/validation-middleware.ts`) existe encore et reste utilisé sur
`routes/auth-routes.ts` et `routes/crm-routes.ts`. Le motif dominant du
code récent reste l'appel direct en contrôleur ; ne pas mélanger les deux
styles dans un même fichier.

### 2.7 Permissions (RBAC)

`requirePermission(key)`, `requireAnyPermission([...])`,
`requireAllPermissions([...])` (`middleware/rbac-middleware.ts`) sont les
briques de base, posées sur la route. Chaque module expose ses propres
gardes nommées par métier plutôt que la clé brute dans les routes :

```ts
// middleware/finance-rbac-middleware.ts
export const requireDocumentsValidate = requirePermission(
  "FINANCE_DOCUMENTS_VALIDATE",
);
```

Fichiers existants à suivre comme modèle : `finance-rbac-middleware.ts`,
`crm-rbac-middleware.ts`, `property-rbac-middleware.ts`,
`rental-rbac-middleware.ts`, `maintenance-rbac-middleware.ts`,
`communication-rbac-middleware.ts`. Un nouveau droit se déclare dans le
fichier du module concerné, pas comme vérification ad hoc dans un
contrôleur.

### 2.8 Configuration

Toute variable d'environnement passe par `src/config/env.ts`, un schéma
Zod validé une seule fois au démarrage — le process refuse de démarrer si
un secret est absent, trop court ou reprend une valeur d'exemple connue.
Jamais `process.env.X || 'valeur par défaut'` pour un secret. Toute
nouvelle variable est documentée dans `env.example` avec une valeur vide
ou factice.

## 3. Conventions frontend (`apps/web`)

### 3.1 Nommage

`src/components`, `src/pages` : PascalCase (`ProtectedRoute.tsx`,
`TenantSwitcher.tsx`). `src/services`, `src/utils`, `src/i18n` :
kebab-case, comme côté API (`api-client.ts`, `tenant-service.ts`).

### 3.2 Réseau et découpage

Tout appel réseau passe par `utils/api-client` (jamais `fetch` brut) ; les
URL viennent de `config/api` (`API_ORIGIN`, `API_URL`, `fileUrl()`),
jamais codées en dur. Les pages sont chargées en `React.lazy` depuis
`App.tsx`, pour garder un bundle qui se découpe par route.

### 3.3 Contenu utilisateur

Jamais `dangerouslySetInnerHTML` sur du contenu saisi par un utilisateur.
Le seul rendu de HTML utilisateur (aperçu de newsletter) passe par une
`<iframe sandbox>` — modèle : `pages/newsletter/NewsletterCampaignsPage.tsx`.

### 3.4 Ant Design et RTL

Écrire les marges et alignements en propriétés logiques —
`margin-inline-start`, la classe utilitaire `ms-4`, `align: 'end'` —
jamais `margin-left`, `ml-4`, `align: 'right'`. L'arabe retourne toute la
mise en page (`<html dir="rtl">`, `<ConfigProvider direction="rtl">`) ; une
propriété physique ne suit pas ce retournement. Détail :
[docs/architecture/i18n.md](../architecture/i18n.md).

## 4. Gestion des erreurs — contrat de réponse

Le contrat cible, produit par `errorHandler`, est
`{ success: false, message, code?, errors? }` (plus `error`, alias
rétro-compatible égal à `message`). Un contrôleur ne doit pas inventer sa
propre forme de réponse d'erreur : laisser remonter l'exception vers
`errorHandler` plutôt que construire un `res.status(...).json(...)` à la
main.

## 5. Internationalisation (i18n)

L'application est trilingue (fr/en/ar) et **le texte français est la clé
de traduction** : `t('Ajouter un bien')`, jamais `t('properties.actions.add')`.
`i18n/t.ts` côté web (fonction de module, pas un hook — les libellés
apparaissent aussi hors composant, dans des `columns` ou des constantes),
`i18n/index.ts` côté API (traduction faite une seule fois, dans
`error-middleware.ts`, à partir de l'en-tête `Accept-Language`).

Tout libellé visible passe par `t()`. `npm run i18n:extract` (dans le
paquet concerné) enveloppe les nouveaux textes et met les catalogues à
jour ; il est rejouable, il ne vide jamais un catalogue existant.
Retoucher un texte français casse ses traductions existantes — la clé
change avec le texte. Après une retouche, `i18n:extract` déplace la
traduction devenue orpheline dans un `*.orphans.json` : la reporter à la
main sur la nouvelle clé plutôt que de la laisser dans ce fichier. Détail
complet, y compris la procédure pour ajouter une langue :
[docs/architecture/i18n.md](../architecture/i18n.md).

## 6. Tests

Backend : Jest, trois dossiers (`__tests__/unit`, `api`, `integration`),
chacun avec sa propre frontière de mock. Frontend : Vitest, mock à la
frontière réseau (`utils/api-client`). Détail des motifs de mock réels,
des garde-fous multi-tenant et de `npm run test:isolation` :
[.claude/rules/testing.md](../../.claude/rules/testing.md).

## 7. Migrations Prisma

Une migration qui touche des données existantes commence par un contrôle
qui l'arrête proprement, avec un message clair, plutôt que d'échouer à
mi-parcours. Exemple :
`packages/api/prisma/migrations/20260907120000_tenant_scoping_and_money_precision/migration.sql` —
un bloc `DO $$ ... RAISE EXCEPTION ... END $$` vérifie l'absence de
doublons (`tenant_id`, `internal_reference`) avant toute altération de
schéma, avec un message qui dit quoi corriger et où.

```bash
npm run prisma:migrate -w @immotopia/api   # crée et applique en développement
```

Ne jamais exécuter une migration destructive sans sauvegarde préalable. Le
seed de démonstration (`prisma/seed.ts`) est lui-même destructif : il
exige `ALLOW_DESTRUCTIVE_SEED=1` et refuse de tourner si `NODE_ENV=production`.

## 8. Branches et commits

`main` est la branche de référence, on ne pousse pas directement dessus.
Une branche par sujet : `fix/...`, `feat/...`, `chore/...`. Messages de
commit en [Conventional Commits](https://www.conventionalcommits.org/fr/) :
`type(portée): résumé à l'impératif`. **Le corps du message explique le
pourquoi**, pas le quoi — le diff dit déjà quoi. Exemple observé dans
l'historique du dépôt :

```text
fix(portails): aucune réponse de portail ne porte de chemin disque

Plusieurs réponses des portails rendaient la ligne entière d'un modèle
qui décrit un fichier : filePath / file_path (chemin absolu sur le
serveur) et l'identifiant de stockage /uploads/... d'un fichier privé.
```

Un hook `pre-commit` (husky + lint-staged) formate et lint les fichiers
modifiés. La CI (`.github/workflows/ci.yml`) bloque sur `jest` backend,
`tsc --noEmit` frontend et le `build` frontend ; `prisma migrate diff`,
`tsc --noEmit` backend et `eslint` sont encore non bloquants (dette
préexistante) et doivent le devenir module par module, sans jamais
régresser sur un fichier déjà propre.

## 9. Dette connue

L'état détaillé de la dette technique (erreurs TypeScript préexistantes,
fichiers hors gabarit, doublons, modèles sans transaction, etc.) est tenu
dans [AUDIT_CODE.md](../../AUDIT_CODE.md) et n'est pas reproduit ici. Avant
de contourner une convention de ce document au motif que « le code
existant le fait déjà », vérifier dans `AUDIT_CODE.md` si c'est un choix
documenté ou un point à corriger.
