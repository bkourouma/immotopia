# Runbook — ImmoTopia

Procédures opérationnelles vérifiées dans le code au 2026-09-27. Pour la
première installation pas à pas, voir aussi
[docs/setup/getting-started.md](../setup/getting-started.md) — attention,
ce document date d'avant la migration vers Vite et décrit encore le port 5000
comme alternatif et une convention `REACT_APP_*` obsolète côté frontend ; les
commandes de ce runbook priment en cas de contradiction.

## Prérequis

- **Node 20** — `.nvmrc` à la racine contient `20`. `engines.node` du
  `package.json` racine exige `>=20`.
- **npm 10** — `engines.npm` exige `>=10`.
- **PostgreSQL** — 16 en local via `docker-compose.yml`
  (`postgres:16-alpine`) ; la doc archivée mentionne `>=14`, à vérifier si
  une contrainte de version stricte existe ailleurs (aucune trouvée dans le
  code applicatif).
- **`docker-compose.yml`** (racine) lance :
  - `db` : PostgreSQL 16, port `5432` par défaut (`POSTGRES_PORT`),
    utilisateur/mot de passe/`POSTGRES_DB` par défaut `immotopia`.
  - `api` (optionnel) : construit l'image depuis `packages/api/Dockerfile`
    avec pour contexte la racine du monorepo (un seul lockfile) ; exige
    `JWT_SECRET` (pas de valeur par défaut, la commande échoue sans elle) ;
    expose le port `8001`.
  - Usage courant : `docker compose up -d db` (base seule — le cas le plus
    fréquent, l'API tournant en local avec `npm run dev:api`).

## Installation

```bash
npm install
```

**À la racine uniquement.** Le dépôt est un monorepo npm workspaces
(`packages/tsconfig`, `packages/eslint-config`, `packages/api`, `apps/web`)
avec un seul `package-lock.json`. Une installation séparée dans
`packages/api` ou `apps/web` casse la résolution des paquets partagés.

### Fichiers d'environnement

- Backend : copier `packages/api/env.example` vers `packages/api/.env`.
  Chaque variable y est commentée. `packages/api/src/config/env.ts` valide
  la configuration avec Zod **au démarrage** et fait sortir le processus
  (`process.exit(1)`) si une variable requise manque, si un secret fait
  moins de 32 caractères, ou si un secret correspond à une valeur d'exemple
  connue (`your-access-token-secret-minimum-256-bits-here`, `changeme`,
  etc.). Ne pas contourner cette validation : elle est volontaire.
- Frontend : copier (facultatif) `apps/web/env.example` vers `apps/web/.env`.
  Il liste les variables réellement lues : `PORT` (port de dev/preview via
  `vite.config.ts`, défaut 3000, doit correspondre à `FRONTEND_URL` de
  l'API — le CORS n'autorise qu'une seule origine), `VITE_API_ORIGIN` /
  `VITE_API_URL` (lues par `apps/web/src/config/api.ts` via
  `import.meta.env`, jamais `process.env`), et
  `VITE_SHOW_DEMO_ACCOUNTS`. Toute variable `VITE_*` finit dans le bundle
  public : n'y mettre aucun secret. Pour un poste de dev standard (API sur
  8001, web sur 3000), aucun `.env` frontend n'est nécessaire :
  `config/api.ts` retombe sur `http://localhost:8001` par défaut.

## Ports

| Service    | Port par défaut | Source                                                                                                                                                      |
| ---------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API        | `8001`          | `PORT` dans `packages/api/.env`, défaut `8001` dans `config/env.ts` (`z.coerce.number()...default(8001)`)                                                   |
| Web (Vite) | `3000`          | `PORT` dans `apps/web/.env` (non préfixé `VITE_`, volontairement — voir commentaire dans `vite.config.ts` : reste hors du bundle) ; défaut `3000` si absent |

**Jamais 8000 ni 5000** malgré ce qu'affichent certains documents archivés
(`docs/README.md` le signale explicitement pour le dossier `archive/`, et
`docs/runbooks/troubleshooting-connection.md` — voir « Dépannage » plus bas —
décrit encore un défaut à 8000).

Le port web et l'origine autorisée côté API doivent rester alignés : le CORS
de l'API (`middleware/cors-middleware.ts`, piloté par `FRONTEND_URL`/
`CLIENT_URL` dans `config/env.ts`) n'autorise **qu'une seule origine**. Si
`apps/web/.env` change `PORT`, `packages/api/.env` doit changer
`FRONTEND_URL` (et `CLIENT_URL` s'il est défini) pour pointer sur le même
port, sous peine d'un blocage CORS silencieux côté navigateur.

### `.claude/launch.json`

Quatre configurations (plus une pour un site vitrine externe, hors
périmètre de ce dépôt) :

| Nom        | Commande                                                                                                                      | Port   | Usage                                                                                                                                                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `web`      | `npm run dev:web`                                                                                                             | `3002` | Frontend de développement courant. **Le port diffère du défaut Vite (3000)** — à vérifier avant de le confondre avec `FRONTEND_URL` par défaut côté API ; si l'API tourne avec sa configuration par défaut (`FRONTEND_URL=http://localhost:3000`), lancer `web` via ce fichier sans ajuster `FRONTEND_URL` provoque un blocage CORS. |
| `api`      | `npm run dev:api`                                                                                                             | `8001` | Backend de développement courant, config par défaut.                                                                                                                                                                                                                                                                                 |
| `api-demo` | `npm run dev:api` avec `PORT`, `FRONTEND_URL`, `CLIENT_URL`, `BACKEND_URL` surchargés en ligne de commande (`cmd /c set ...`) | `8800` | Instance de démonstration isolée, pensée pour tourner en parallèle de l'instance de dev normale.                                                                                                                                                                                                                                     |
| `web-demo` | `npm run dev:web` avec `PORT=3300`, `VITE_API_ORIGIN`/`VITE_API_URL` pointant sur `8800`                                      | `3300` | Frontend apparié à `api-demo`.                                                                                                                                                                                                                                                                                                       |

Ces configurations Windows utilisent `cmd /c set VAR=valeur&& ...` (pas de
`VAR=valeur commande` façon Unix, qui ne fonctionne pas sous `cmd.exe`).

## Base de données

```bash
# Générer le client Prisma (aussi automatique via le hook postinstall)
npm run prisma:generate -w @immotopia/api

# Créer et appliquer une migration en développement
npm run prisma:migrate -w @immotopia/api
```

### Seed

`packages/api/package.json` expose de nombreux scripts `db:seed*`. Le plus
important :

```bash
# PowerShell
$env:ALLOW_DESTRUCTIVE_SEED="1"; npm run db:seed -w @immotopia/api

# bash / CI
ALLOW_DESTRUCTIVE_SEED=1 npm run db:seed -w @immotopia/api
```

`prisma/seed.ts` (exécuté par `db:seed`) **efface tous les utilisateurs et
tenants de la base ciblée** et refuse de s'exécuter sans
`ALLOW_DESTRUCTIVE_SEED=1` ou `=true`. Il refuse également **toujours** de
tourner si `NODE_ENV=production`, quelle que soit la valeur de
`ALLOW_DESTRUCTIVE_SEED` — vérifié dans `prisma/seed.ts`.

Autres seeds utiles, à lancer séparément selon le besoin (liste tirée de
`packages/api/package.json`, non exhaustive dans ce document) :

| Script                                                   | Rôle                                                                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `db:seed:rbac`                                           | Rôles et permissions — **à lancer avant le seed principal** d'après `docs/setup/getting-started.md`. |
| `db:seed:geographic`                                     | Référentiel pays/régions/communes.                                                                   |
| `db:seed:super-admin`                                    | Compte super-admin plateforme.                                                                       |
| `db:seed:catalog`                                        | Catalogue des offres d'abonnement par packs.                                                         |
| `db:seed:property-templates`                             | Gabarits de biens par type.                                                                          |
| `db:seed:document-templates`                             | Gabarits de documents (baux, quittances...).                                                         |
| `db:seed:maintenance`, `db:seed:maintenance-permissions` | Données et permissions du module maintenance.                                                        |
| `db:seed:communication-permissions`                      | Permissions du module communication.                                                                 |
| `db:seed:tenant-members`                                 | Membres de démonstration par agence.                                                                 |
| `db:seed:syndic-demo`                                    | Jeu de données de démonstration syndic/copropriété.                                                  |
| `db:seed:crm`, `db:seed:comprehensive`                   | Données CRM de démonstration, jeu de données complet.                                                |

## Commandes quotidiennes

Depuis la racine (chaque commande cible les deux paquets sauf mention
contraire) :

```bash
npm run dev          # API (8001) + web (3000, sauf override .env/launch.json), en parallèle (concurrently)
npm run dev:api       # API seule
npm run dev:web       # Web seul
npm run typecheck     # tsc --noEmit sur packages/api ET apps/web
npm run lint          # eslint sur les deux paquets
npm run build         # build API puis build web
npm test              # jest — backend uniquement
npm run test:web      # vitest run — frontend uniquement
```

Isolation multi-tenant de bout en bout :

```bash
# Nécessite DATABASE_URL_TEST (packages/api/.env ou variable d'environnement) :
# pointe sur une base DÉDIÉE, distincte de DATABASE_URL. Si absente, le script
# ne fait rien (code 0) et la suite s'auto-ignore (describe.skip) — npm test
# reste vert sans cette base.
npm run test:isolation -w @immotopia/api
```

i18n (voir aussi [docs/architecture/i18n.md](../architecture/i18n.md)) :

```bash
npm run i18n:extract -w @immotopia/api   # scripts/i18n-extract.mjs
npm run i18n:extract -w @immotopia/web   # scripts/i18n-migrate.mjs
```

Le texte français **est** la clé de traduction (`t('Ajouter un bien')`).
Retoucher un texte français casse sa traduction existante ;
`i18n:extract` déplace alors la traduction devenue orpheline dans un
`*.orphans.json` au lieu de la perdre silencieusement — la reporter à la
main sur la nouvelle clé.

## Worktrees git (`.claude/worktrees/*`)

Un `git worktree` n'a pas son propre `node_modules` : `npm install` n'y
tourne pas automatiquement, et le hook `pre-commit` (husky + lint-staged)
échoue tant qu'aucun module n'est résolvable. Les worktrees existants du
dépôt (`.claude/worktrees/<nom>/node_modules`) sont en réalité des
**jonctions Windows** vers le `node_modules` du checkout principal — vérifié
avec PowerShell :

```powershell
Get-Item '.claude\worktrees\<nom>\node_modules' | Select-Object FullName, LinkType
# LinkType: Junction, cible D:\APP\Immobillier\node_modules
```

Pour un nouveau worktree, poser la même jonction avant tout `git commit` :

```cmd
mklink /J "D:\APP\Immobillier\.claude\worktrees\<nom>\node_modules" "D:\APP\Immobillier\node_modules"
```

Cette jonction suffit pour les binaires partagés (prettier, eslint) utilisés
par `pre-commit`. Elle ne remplace pas `prisma generate` si le worktree
modifie `schema.prisma` : le client Prisma généré vit dans
`node_modules/.prisma`, donc partagé par la jonction — un `schema.prisma`
divergent entre le worktree et le checkout principal désynchronise le
client généré pour les deux tant que `prisma generate` n'a pas été relancé.

## Dépannage

### CORS / mauvais port

Un blocage CORS dans la console navigateur signifie presque toujours que
`FRONTEND_URL` (ou `CLIENT_URL`) côté API ne correspond pas au port réel du
frontend — le CORS de ce projet n'autorise **qu'une seule origine** (voir
« Ports » ci-dessus). Vérifier dans l'ordre :

1. Sur quel port le frontend tourne réellement (`apps/web/.env` → `PORT`,
   ou la configuration `.claude/launch.json` utilisée — `web` tourne sur
   `3002`, pas 3000).
2. Que `FRONTEND_URL` dans `packages/api/.env` (ou les variables passées à
   `api-demo`) pointe sur ce même port.
3. `docs/runbooks/troubleshooting-connection.md` documente un scénario
   `ERR_CONNECTION_REFUSED` daté où le backend écoutait sur 8000 par
   défaut — **ce n'est plus le cas** : le défaut actuel de
   `config/env.ts` est `8001`. Lire ce document pour la méthode de
   diagnostic (vérifier que le backend tourne, `curl` sur `/health`), pas
   pour les numéros de port qu'il cite.

### `lint-staged` bloqué sous Windows

`.husky/pre-commit` appelle explicitement les points d'entrée JS de
prettier et eslint (`node node_modules/prettier/bin/prettier.cjs --write`)
plutôt que les raccourcis `node_modules/.bin/*.cmd`. Raison documentée dans
le hook lui-même : sous Windows, `lint-staged` 17.5.0 se bloque
indéfiniment dès qu'un raccourci `.cmd` reçoit sept arguments de fichier ou
plus, sans lancer de processus enfant ni produire d'erreur — donc sans
diagnostic possible depuis le blocage lui-même. Si un hook personnalisé ou
une commande `lint-staged` ajoutée à la main réintroduit un appel via
`node_modules/.bin`, le même blocage silencieux peut réapparaître : ne pas
revenir à ce raccourci.

### Erreurs TypeScript préexistantes côté API

L'étape `tsc --noEmit` de l'API en CI est **non bloquante**
(`continue-on-error: true` dans `.github/workflows/ci.yml`), le temps de
résorber un passif documenté par ce même workflow (148 erreurs de type au
moment de son commentaire ; AGENTS.md en mentionne ~160 — l'ordre de
grandeur est celui qui compte, pas le chiffre exact). Ne pas ajouter
d'erreurs dans les fichiers déjà propres (voir AUDIT_CODE.md pour le détail
module par module).

### Tests frontend lents / timeouts

Un échec par timeout seul, sans assertion fausse, ne prouve rien tant que
le test n'a pas été relancé isolément : `vite.config.ts` documente que
plusieurs tests montent une vraie coquille Ant Design (`Modal`, `Drawer`)
et prennent 3 à 13 s isolés, mais peuvent dépasser `testTimeout` sous charge
parallèle. `maxWorkers: 4` borne volontairement le parallélisme pour rendre
le résultat local reproductible. En CI, la suite est découpée en 4 lots
(`matrix.shard`) sur des runners séparés (`--shard=N/4 --maxWorkers=2`) —
voir le commentaire du job `web-tests` dans `.github/workflows/ci.yml` pour
la mesure ayant motivé ce découpage (23 min et une vingtaine de timeouts sur
un seul runner à 4 vCPU).

### CI — étapes bloquantes (`.github/workflows/ci.yml`)

| Job         | Étape                                                              | Bloquant |
| ----------- | ------------------------------------------------------------------ | -------- |
| `api`       | `prisma migrate diff` (dérive schéma/migrations)                   | Non      |
| `api`       | `tsc --noEmit`                                                     | Non      |
| `api`       | `eslint`                                                           | Non      |
| `api`       | `jest`                                                             | **Oui**  |
| `web-tests` | `vitest run` (4 lots)                                              | **Oui**  |
| `web`       | `tsc --noEmit`                                                     | **Oui**  |
| `web`       | `eslint`                                                           | Non      |
| `web`       | `build` (`tsc --noEmit` + `vite build`)                            | **Oui**  |
| `web`       | Grep anti-identifiants en clair dans le bundle de production       | **Oui**  |
| `web`       | Grep anti-atelier de dev (`src/dev/`) dans le bundle de production | **Oui**  |
| `web`       | Budget du chunk d'entrée (`npm run measure:entry`)                 | **Oui**  |
| `web`       | Contraste AA (`npm run a11y:contrast`)                             | **Oui**  |

Les étapes non bloquantes le sont **temporairement** (CONTRIBUTING.md) :
elles doivent devenir bloquantes module par module à mesure que la dette
correspondante est résorbée — ne pas les considérer comme définitivement
optionnelles.

## Pour aller plus loin

- Installation détaillée pas à pas :
  [docs/setup/getting-started.md](../setup/getting-started.md).
- Diagnostic de connexion backend/frontend :
  [docs/runbooks/troubleshooting-connection.md](../runbooks/troubleshooting-connection.md).
- Architecture et cycle de vie d'une requête :
  [docs/architecture/SYSTEM_DESIGN.md](../architecture/SYSTEM_DESIGN.md).
- Conventions de contribution et garde-fous CI :
  [CONTRIBUTING.md](../../CONTRIBUTING.md).
