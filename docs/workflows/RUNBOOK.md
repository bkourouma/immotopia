# Runbook — ImmoTopia

Procédures opérationnelles vérifiées dans le code au 2026-09-27. Pour la
première installation pas à pas, voir aussi
[docs/setup/getting-started.md](../setup/getting-started.md) — attention,
ce document date d'avant la migration vers Vite et décrit encore le port 5000
comme alternatif et une convention `REACT_APP_*` obsolète côté frontend ; les
commandes de ce runbook priment en cas de contradiction.

Ce runbook couvre le poste de développement. Le déploiement sur le serveur
(staging sur `app.immotopia.cloud`, production sur `clients.immotopia.cloud`),
les sauvegardes et la restauration sont dans
[DEPLOIEMENT.md](DEPLOIEMENT.md) ; la décision est dans
[ADR-005](../architecture/adr/ADR-005-environnements-staging-production.md).

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
  - C'est un outil de développement : ne jamais le déployer. Les piles du
    serveur (staging, production) utilisent
    `infra/compose/docker-compose.prod.yml`, uniquement par
    `infra/scripts/deploy.sh <staging|prod>` — voir
    [DEPLOIEMENT.md](DEPLOIEMENT.md).

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

Ces ports sont ceux du développement. Sur le serveur, chaque environnement a les
siens (staging : web 3019, Postgres 5436 ; production : web 3020, Postgres 5437,
tous liés à `127.0.0.1`) : voir [DEPLOIEMENT.md](DEPLOIEMENT.md).

### `.claude/launch.json`

Quatre configurations (plus une pour un site vitrine externe, hors
périmètre de ce dépôt) :

| Nom        | Commande                                                                                                                                                                                 | Port   | Usage                                                                                                                                                                                                                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `web`      | `npm run dev:web`                                                                                                                                                                        | `3002` | Frontend de développement courant. **Le port diffère du défaut Vite (3000)** — à vérifier avant de le confondre avec `FRONTEND_URL` par défaut côté API ; si l'API tourne avec sa configuration par défaut (`FRONTEND_URL=http://localhost:3000`), lancer `web` via ce fichier sans ajuster `FRONTEND_URL` provoque un blocage CORS. |
| `api`      | `npm run dev:api`                                                                                                                                                                        | `8001` | Backend de développement courant, config par défaut.                                                                                                                                                                                                                                                                                 |
| `api-demo` | `npm run dev:api`, exécuté depuis `.claude/worktrees/demo` (`cd /d` avant le `cmd /c set ...`), avec `PORT`, `FRONTEND_URL`, `CLIENT_URL`, `BACKEND_URL` surchargés en ligne de commande | `8800` | Instance de démonstration figée sur un SHA, posée par `npm run demo:sync` (voir « Instance de démo figée » plus bas) ; base dédiée : `packages/api/.env.demo` du checkout principal, copié en `.env` du worktree.                                                                                                                    |
| `web-demo` | `npm run dev:web`, exécuté depuis `.claude/worktrees/demo`, avec `PORT=3300`, `VITE_API_ORIGIN`/`VITE_API_URL` pointant sur `8800`                                                       | `3300` | Frontend apparié à `api-demo`, même worktree.                                                                                                                                                                                                                                                                                        |

Ces configurations Windows utilisent `cmd /c set VAR=valeur&& ...` (pas de
`VAR=valeur commande` façon Unix, qui ne fonctionne pas sous `cmd.exe`).

## Instance de démo figée

`npm run demo:sync -- <ref> [--migrate] [--install]` place un worktree
détaché `.claude/worktrees/demo` sur le SHA donné et copie
`packages/api/.env.demo` — une base de démo DÉDIÉE, obligatoire — vers le
`.env` de l'API du worktree. La commande refuse de tourner si `.env.demo`
pointe sur la même `DATABASE_URL` que le développement. `--migrate` lance
ensuite `prisma migrate deploy` sur la base démo.

Dépendances, deux modes :

- par défaut, **jonctions (partagé)** : les trois `node_modules` (racine,
  `apps/web`, `packages/api`) sont des jonctions vers ceux du checkout
  principal (voir « Worktrees git » plus bas). Rapide, mais le client Prisma
  généré (`node_modules/.prisma`) est celui du checkout principal ;
- `--install`, **dépendances propres** : le script retire les jonctions (le
  lien seulement, jamais leur cible), lance `npm ci` à la racine du worktree
  puis `prisma generate` dans `packages/api`. Plus long, mais la démo a son
  propre client Prisma sans toucher au développement.

Le mode est enregistré à côté de la révision, dans le répertoire git du
worktree. Un `sync` ultérieur sans `--install` ne repose pas de jonction sur
un vrai `node_modules` : il le signale et conserve les dépendances propres.
Si le schéma Prisma du SHA démo diffère de celui du checkout principal en mode
jonctions, le script avertit : relancer avec `--install`.

Variables du frontend : le script copie vers `apps/web/.env` du worktree le
fichier `apps/web/.env.demo` du checkout principal s'il existe (optionnel),
sinon `apps/web/.env`, sinon ne copie rien et le dit. Ce fichier est ignoré
par git dans le worktree. Les `set PORT=…` et `set VITE_API_*=…` de
`web-demo` dans `.claude/launch.json` l'emportent sur lui : `loadEnv` de Vite
(6.4.3 installé) écrase les valeurs lues dans les fichiers par celles déjà
présentes dans l'environnement du processus.

`npm run demo:status` donne le SHA courant du worktree, le mode de
dépendances et la santé des ports `api-demo` (8800) / `web-demo` (3300), qui
tournent désormais dans ce worktree.

Le processus développement exécute `demo:sync` puis
`npm run agent-bus -- revision` avant d'annoncer une révision ; le processus
démo/debug vérifie `demo:status` (SHA = SHA annoncé) avant de rejouer un
scénario. Détail des rôles : [DEV_PROCESS.md](DEV_PROCESS.md) et
[DEMO_DEBUG_PROCESS.md](DEMO_DEBUG_PROCESS.md).

## Bus d'agents

`.agent-bus/` (racine du checkout principal, commun à tous les worktrees,
ignoré par git, surchargeable par `AGENT_BUS_DIR`) est le canal de passation
entre développement et démo/debug : un fichier par anomalie
(`bugs/BUG-AAAA-MM-JJ-NNN.md`) et un journal des livraisons (`revisions.md`).
CLI : `npm run agent-bus -- <new-bug|list|show|set-state|revision|path>`.
Détail du format et de la propriété des champs :
[BUG_REPORT_TEMPLATE.md](BUG_REPORT_TEMPLATE.md).

## Base de données

```bash
# Générer le client Prisma (aussi automatique via le hook postinstall)
npm run prisma:generate -w @immotopia/api

# Créer et appliquer une migration en développement
npm run prisma:migrate -w @immotopia/api
```

Déploiement des droits Syndic (BUG-096) : la migration de données `20261006130000_syndic_permissions` crée SYNDIC_* et OWNER_STATEMENTS__, les donne à TENANT_ADMIN et TENANT_MANAGER (et aux rôles personnalisés qui avaient PROPERTIES__) et retire USERS_VIEW à TENANT_AGENT ; un simple `prisma migrate deploy` suffit, le script `packages/api/scripts/backfill-syndic-permissions.ts` reste un contrôle idempotent. Le retrait de USERS_VIEW à TENANT_AGENT vaut pour TOUTES les agences d'un coup (rôles globaux). PLATFORM_SUPER_ADMIN reçoit aussi ces droits (migration `20261006140000_syndic_permissions_super_admin`). Les droits sont en cache 5 minutes : redémarrer l'API après le déploiement.

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

Rejouer la suite dans un environnement neuf (sans `.env`, tout en variables
d'environnement) :

```bash
# Base vierge dédiée (PostgreSQL 16 ; « immo » = super-utilisateur local)
PGPASSWORD=immo_local_pw psql -h localhost -U immo -d postgres \
  -c 'CREATE DATABASE immotopia_isolation'

export DATABASE_URL_TEST="postgresql://immo:immo_local_pw@localhost:5432/immotopia_isolation"
export JWT_SECRET="$(openssl rand -hex 48)"   # sans lui, l'API ne démarre pas
npm run test:isolation -w @immotopia/api
```

Le runner recopie `DATABASE_URL_TEST` dans `DATABASE_URL`, applique lui-même
`prisma migrate deploy` ; aucun seed n'est nécessaire (les fixtures créent le
rôle `TENANT_ADMIN` et ses permissions). **Un succès se lit dans « Tests: 43
passed, 43 total »** (suite `api-app`), jamais dans le seul code de sortie : sans
base, le script sort en succès et la suite s'ignore. Jest signale « did not exit
one second after the test run » (file d'audit ouverte) : sans effet sur le
résultat. Les données de test des baux restent en base (pas de cascade
`rental_*` dans le nettoyage) : la base est jetable.

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

**Piège connu (API).** `npm run i18n:extract -w @immotopia/api` déplace en
`*.orphans.json` les deux clés « Le pack Patrimoine… » de
`middleware/error-middleware.ts` : elles passent par `t(variable)`, que
l'extracteur ne voit pas. Après l'extraction, les restaurer à la main dans
les catalogues (`en.json`, `ar.json`) et vider l'orphelin correspondant.

## Worktrees git (`.claude/worktrees/*`)

Un `git worktree` n'a pas son propre `node_modules` : `npm install` n'y
tourne pas automatiquement, et le hook `pre-commit` (Lefthook + lint-staged)
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

## Outil d'exploitation des abonnements (production)

`packages/api/src/scripts/provision-subscription.ts`, compilé dans l'image
(`dist/scripts/provision-subscription.js`), crée l'abonnement d'essai d'une
agence ou la suspend, depuis le conteneur de l'API et sans écran. Il réutilise
les services du produit (catalogue, droits, registre des lots,
`suspendTenant`) : aucun SQL à la main.

Règles :

- **Dry-run d'abord, puis réel.** `--dry-run` n'écrit rien et affiche l'état
  avant, ce qui serait fait et l'état attendu après (éléments et prix,
  estimation mensuelle HT/TVA/TTC, mise en route, droits, capacités
  utilisées/plafond, alertes de seuil 80/100 % que la tâche horaire
  enverra). Relire, puis relancer sans `--dry-run`.
- **Fenêtre interdite hh:10–hh:20 UTC**, bornes incluses : la tâche
  `subscription-usage-job` passe à hh:15. Toute écriture y est refusée ; le
  dry-run et `list` restent possibles, avec un avertissement.
- **Idempotent.** Relancé avec la même demande, `provision` répond « déjà
  provisionné » sans rien écrire (il termine seulement une réconciliation du
  registre des lots interrompue) ; `suspend` répond « rien à faire ». Un
  abonnement existant différent de la demande (éléments en vigueur, cycle,
  politique de quota, mise en route levée, fin d'essai si elle est donnée) ou
  portant un changement programmé est refusé, avec les écarts listés.
- `provision` crée, en une transaction : abonnement `TRIALING` (30 jours par
  défaut, `--trial-ends-at AAAA-MM-JJ` sinon), éléments au prix du
  catalogue, rattachement des extensions à leur pack, modules ; puis
  réconcilie le registre des lots. Aucune facture pendant l'essai.
  `--setup-waived` pose `metadata.setupWaived` : la première facture ne
  portera pas les frais `SETUP_<pack>`.
- `suspend` appelle `suspendTenant` : statut `SUSPENDED` et révocation des
  sessions des membres actifs.
- Audit : acteur système `system:provision-subscription`
  (`SUBSCRIPTION_PROVISIONED`, `LOT_REGISTRY_RECONCILED`,
  `TENANT_SUSPENDED`). Aucun secret ni e-mail n'est affiché.
- Codes de sortie : `0` succès ou rien à faire, `2` refus, `1` erreur
  inattendue (dont un audit resté non écrit).

Choisir le conteneur de la pile visée : `immotopia-prod-api` (production,
`clients.immotopia.cloud`) ou `immotopia-saas-api` (staging,
`app.immotopia.cloud`). Vérifier avec `docker ps` avant d'écrire : les deux
piles ont chacune leur base : une agence créée sur l'une n'existe pas sur
l'autre (voir [DEPLOIEMENT.md](DEPLOIEMENT.md)).

```bash
# Production ; pour le staging : C=immotopia-saas-api
C=immotopia-prod-api; T=dist/scripts/provision-subscription.js
docker exec $C node $T list --search <texte>            # trouver le slug
docker exec $C node $T provision --tenant <slug>   --items AGENCE,SYNDIC,EXT_COPRO:2 --setup-waived --dry-run
docker exec $C node $T provision --tenant <slug>   --items AGENCE,SYNDIC,EXT_COPRO:2 --setup-waived
docker exec $C node $T suspend --tenant <slug> --dry-run
docker exec $C node $T suspend --tenant <slug>
```

Options de `provision` : `--items CODE[:QTE],…` (codes du catalogue),
`--trial-ends-at`, `--setup-waived`, `--quota-policy`
(`BILL_OVERAGE` par défaut, `BLOCK`, `WARN_ONLY`), `--billing-cycle`
(`MONTHLY` par défaut, `ANNUAL`). En local, depuis la racine du dépôt :
`npm run ops:provision-subscription -w @immotopia/api -- <action> …`.

## Assistant IA (ImmoCopilot)

Assistant conversationnel des collaborateurs d'agence (bouton « Assistant »,
Ctrl/Cmd+J). **Désactivé par défaut** : sans variable `AI_*`, l'application
démarre et fonctionne normalement, le bouton n'apparaît pas et
`POST /api/tenants/:tenantId/ai/chat` répond 503 `AI_DISABLED`. Décision :
[ADR-004](../architecture/adr/ADR-004-assistant-ia-immocopilot.md) ; modèle de
menace : [SECURITY.md](../governance/SECURITY.md) (section « Assistant IA »).

**Réglage en administration (prioritaire).** Le super-admin choisit fournisseur,
modèle, effort et repli dans l'administration de la plateforme
(`GET|PUT /api/platform/ai-settings`, catalogue OpenRouter :
`GET /api/platform/ai-settings/models`). La ligne `platform_ai_settings`, si elle
existe, l'emporte sur `AI_PROVIDER`, `AI_MODEL`, `AI_EFFORT` et
`AI_REFUSAL_FALLBACK`, qui ne sont plus que des **valeurs par défaut** (sans
ligne, le comportement est celui de l'environnement). Le changement s'applique
sans redémarrage (cache de 30 s, invalidé à chaque mise à jour, par instance de
l'API). Les **clés API restent exclusivement dans `.env`** : jamais en base,
jamais dans une réponse d'API (seule leur présence est indiquée). Si le réglage
désigne un fournisseur dont la clé manque, l'assistant répond `enabled: false` /
503 `AI_DISABLED` sans planter ; `fake` reste refusé en production à
l'exécution aussi. Appliquer la migration `20261004090000_platform_ai_settings`
(`prisma migrate deploy`).

Variables du backend (validées par `packages/api/src/config/env.ts`,
documentées dans `packages/api/env.example`) :

| Variable                  | Défaut                         | Rôle                                                                                                                                                                                  |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_PROVIDER`             | `disabled`                     | `disabled`, `fake` (déterministe, dev et test seulement, voir ci-dessous), `anthropic` ou `openrouter`. Simple valeur par défaut : le réglage du super-admin en base est prioritaire. |
| `ANTHROPIC_API_KEY`       | aucune                         | Exigée si `AI_PROVIDER=anthropic`. Jamais de valeur par défaut, jamais commitée, jamais `VITE_*`.                                                                                     |
| `OPENROUTER_API_KEY`      | aucune                         | Exigée si `AI_PROVIDER=openrouter`. Mêmes règles que la clé Anthropic (jamais par défaut ni `VITE_*`).                                                                                |
| `OPENROUTER_BASE_URL`     | `https://openrouter.ai/api/v1` | Point d'entrée OpenAI-compatible d'OpenRouter.                                                                                                                                        |
| `AI_MODEL`                | `claude-opus-5-5`              | Modèle par défaut : `claude-opus-5-5` pour `anthropic` ; identifiant OpenRouter `fournisseur/modele` (ex. `anthropic/claude-sonnet-4.5`) exigé pour `openrouter`.                     |
| `AI_EFFORT`               | `low`                          | Effort de raisonnement (`anthropic` seulement) : `low`, `medium` ou `high`.                                                                                                           |
| `AI_MAX_OUTPUT_TOKENS`    | `16000`                        | Plafond de tokens de sortie par tour (1024 à 64000).                                                                                                                                  |
| `AI_MAX_TOOL_ROUNDS`      | `4`                            | Tours d'outils maximum par requête de chat (1 à 8).                                                                                                                                   |
| `AI_REQUEST_TIMEOUT_MS`   | `60000`                        | Délai maximal d'un appel au fournisseur.                                                                                                                                              |
| `AI_PROPOSAL_TTL_SECONDS` | `300`                          | Validité d'une proposition à confirmer (60 à 900). Le jeton dérive de `JWT_SECRET`.                                                                                                   |
| `AI_REFUSAL_FALLBACK`     | `on`                           | Repli serveur en cas de refus (`anthropic` seulement) ; `off` le coupe.                                                                                                               |
| `AI_TENANT_MINUTE_LIMIT`  | `100`                          | Plafond de `POST /ai/chat` par minute et PAR AGENCE, tous collaborateurs confondus (1 à 100000).                                                                                      |
| `AI_TENANT_DAILY_LIMIT`   | `3000`                         | Plafond de `POST /ai/chat` par jour et PAR AGENCE (1 à 1000000).                                                                                                                      |

Le serveur ne démarre pas dans trois cas : `anthropic` sans `ANTHROPIC_API_KEY`,
`openrouter` sans `OPENROUTER_API_KEY` ou avec un `AI_MODEL` sans `/`, et `fake` dès que la variable **brute** `NODE_ENV` n'est pas explicitement
`development` ou `test` (absente, `production`, `staging`… : refus, alors que
`NODE_ENV` absent vaut `development` partout ailleurs). Avec `fake`, un
avertissement est écrit au démarrage. Les plafonds par agence s'ajoutent aux
limites par utilisateur (20 par minute, 300 par jour). Faire tourner
`JWT_SECRET` invalide les propositions en cours (5 minutes au plus).

**Activer en démonstration.** Poser `AI_PROVIDER=fake` dans la ligne de commande
de `api-demo` de `.claude/launch.json` (comme `PORT` ou `FRONTEND_URL`), avec
`NODE_ENV=development` explicite, jamais
dans un `.env` commité, puis relancer l'API. Le faux fournisseur répond par
règles sur mots-clés (biens et commune, « quittance » avec un numéro de bail
`L-…` et une période, « documents »), sans réseau ni clé. La quittance exige un
paiement encaissé pour la période et un modèle `RENT_RECEIPT` actif ; le relevé
un modèle `RENT_STATEMENT` (le seed ne sème que la quittance). `TENANT_AGENT` n'a
aucune permission `RENTAL_*` par défaut : il ne voit ni proposition ni
téléchargement de document.

**Activer en production (`anthropic`).** Avant de poser la clé, obtenir la
décision juridique sur le transfert de données personnelles au fournisseur (voir
SECURITY.md). Le module et l'abonnement suivent `SUBSCRIPTION_ENFORCEMENT` : en
`enforce`, les outils `RENTAL` exigent le module Location. L'API doit tourner en
**la confirmation est atomique entre instances** (usage unique des jetons et
idempotence des quittances sous verrous consultatifs PostgreSQL), mais les
**limiteurs de débit restent en mémoire, par instance** : avec N instances, les
plafonds effectifs sont multipliés par N.

**Rejouer le test de concurrence** (usage unique et quittances, deux
connexions simultanées sur une vraie base). Il exige une base PostgreSQL
DÉDIÉE et `DATABASE_URL`, `DATABASE_URL_TEST` et `TEST_DATABASE_URL`
**identiques** ; sinon il s'ignore sans échouer. Depuis `packages/api`, migrations
appliquées d'abord :

```bash
npx prisma migrate deploy   # avec DATABASE_URL pointant sur la base jetable
DATABASE_URL_TEST="postgresql://…/base" TEST_DATABASE_URL="postgresql://…/base" \
  DATABASE_URL="postgresql://…/base" JWT_SECRET="$(openssl rand -hex 48)" \
  npx jest --selectProjects api --runTestsByPath __tests__/integration/ai-concurrency.test.ts
```

Ne jamais écrire d'identifiants réels dans un fichier commité ; `JWT_SECRET` est
généré à la volée. Le test remplace `generateDocument` par un double : il prouve
l'exclusion mutuelle, pas le rendu DOCX.

**Proxy et flux SSE.** `POST /ai/chat` répond en `text/event-stream` et envoie
`Cache-Control: no-cache, no-transform` et `X-Accel-Buffering: no`. Le proxy ne
doit ni mettre la réponse en tampon (`proxy_buffering off` sur cette route, ou
respecter l'en-tête `X-Accel-Buffering`) ni la compresser, et son délai de
lecture doit dépasser le plus long silence du flux : `proxy_read_timeout` d'au
moins 120 s (valeur actuelle de `infra/nginx/*.conf`, à conserver ; l'API envoie
un commentaire `: ping` toutes les 15 s). Symptôme d'un tampon : le texte
n'arrive qu'à la fin, d'un bloc. Symptôme d'un délai trop court : le flux se
coupe en milieu de réponse.

**Dépannage rapide.**

- Bouton absent : `GET /api/tenants/:tenantId/ai/status` doit répondre
  `enabled: true`. `NOT_CONFIGURED` = `AI_PROVIDER=disabled` ; `NO_TOOLS` = ni
  `PROPERTIES_VIEW` ni `RENTAL_*` pour cet utilisateur (ou module absent en
  `enforce`). Le bouton est masqué pour le super-admin et les portails.
- 429 `RATE_LIMITED` : 20 messages par minute et 300 par jour, 10 confirmations
  par minute, par utilisateur et par agence ; en plus, `AI_TENANT_MINUTE_LIMIT`
  et `AI_TENANT_DAILY_LIMIT` pour toute l'agence (message « … par votre agence »).
- Serveur qui refuse de démarrer sur `AI_PROVIDER` : `fake` sans `NODE_ENV`
  explicite `development` ou `test`.
- Confirmation refusée (403, « Vous n'avez plus la permission… ») : il faut
  `RENTAL_DOCUMENTS_GENERATE` **et** `RENTAL_DOCUMENTS_VIEW`.
- `PROPOSAL_EXPIRED` (410) : la proposition a plus de `AI_PROPOSAL_TTL_SECONDS` ;
  la redemander. `PROPOSAL_ALREADY_USED` (409) : déjà confirmée.

## Journal d'audit (scellés, rétention, purge)

Décision : [ADR-006](../architecture/adr/ADR-006-audit-deux-niveaux.md) ;
spécification : `specs/023-audit-deux-niveaux/spec.md` (phase 5).

| Variable                          | Défaut  | Rôle                                                              |
| --------------------------------- | ------- | ----------------------------------------------------------------- |
| `AUDIT_RETENTION_TENANT_MONTHS`   | `24`    | Conservation des lignes visibles de l'agence (7 à 240)            |
| `AUDIT_RETENTION_PLATFORM_MONTHS` | `60`    | Conservation des lignes réservées à la plateforme (7 à 240)       |
| `AUDIT_SEAL_GRACE_DAYS`           | `2`     | Jours d'attente avant de sceller une journée (1 à 30)             |
| `AUDIT_PURGE_ENABLED`             | `false` | `true` pour que le job purge. **Irréversible** : valider d'abord. |

**Job quotidien (2 h 30 UTC, `jobs/audit-maintenance-job.ts`)** : scelle les
journées révolues, purge si `AUDIT_PURGE_ENABLED=true`, revérifie la chaîne et les
7 derniers jours, journalise la tête de chaîne (« Audit : tête de chaîne à
ancrer »). Il tourne dans chaque instance de l'API : le scellement est sérialisé
par un verrou consultatif, la purge est idempotente.

**Activer la purge** : confirmer les durées avec le responsable du produit
(contrats, conformité), sauvegarder la base (DEPLOIEMENT.md), poser
`AUDIT_PURGE_ENABLED=true`, redémarrer. Les premiers passages suppriment par lots
de 5 000 (200 lots au plus par passage et par visibilité) ; chaque lot écrit un
`AUDIT_PURGED` dans la même transaction. Seules les lignes d'une partition
**scellée** et plus anciennes que la rétention partent ; les scellés restent.

**Vérifier l'intégrité** : écran « Journaux d'audit » → « Vérifier l'intégrité »,
ou `GET /api/admin/audit/integrity?from=AAAA-MM-JJ&to=AAAA-MM-JJ`. Statuts d'une
partition : `OK` ; `EXPIRED` (purgée par la rétention, normal) ; `LATE_ROWS` (des
lignes sont arrivées après le scellé — remise en file après une panne, à regarder
mais pas une altération) ; `ROWS_MISSING` et `ALTERED` (**incident de sécurité** :
lignes disparues ou modifiées). Une chaîne rompue (`brokenAtSeq`) est aussi un
incident. Le job écrit alors `AUDIT_INTEGRITY_FAILED` et un log d'erreur : brancher
une alerte sur le message « INTÉGRITÉ DU JOURNAL COMPROMISE ».

**Ancrer la tête de chaîne (recommandé)** : les scellés vivent dans la même base,
donc qui peut tout réécrire peut recalculer toute la chaîne. Recopier
régulièrement la dernière valeur « tête de chaîne à ancrer » (`seq`, `sealDate`,
`chainHash`) hors de la base : coffre, e-mail à la direction, ticket horodaté. Une
chaîne dont le scellé `seq` ne retombe pas sur le `chainHash` ancré a été réécrite.

**Remise à zéro d'une base de recette** : `TRUNCATE audit_logs, audit_seals` reste
possible (un `TRUNCATE` ne passe pas par les déclencheurs de ligne) ; vider
seulement `audit_logs` laisserait des scellés orphelins, que la vérification
signalerait comme lignes disparues.

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

### Hooks Lefthook

`.lefthook.yml` déclare aussi un hook `pre-push`
(`scripts/pre-push-guard.cjs`) qui refuse une poussée directe vers
`main`/`master`. Un refus se corrige (passer par une branche puis une PR), il
ne se contourne pas.

### `lint-staged` bloqué sous Windows

`.lefthook.yml` délègue à `lint-staged`, qui appelle explicitement les points d'entrée JS de
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

### Migration orpheline du staging : comparaison base/dépôt, pas `migrate status`

La pile `immotopia-saas`, aujourd'hui le **staging** (`app.immotopia.cloud`,
[ADR-005](../architecture/adr/ADR-005-environnements-staging-production.md)),
porte une ligne `_prisma_migrations` sans dossier dans le dépôt :
`20260927080000_mouvements_fonds_copropriete`, appliquée hors dépôt le
25/09/2026, quand cette pile était la production. Décision, SQL d'origine et
nettoyage facultatif :
[ADR-003](../architecture/adr/ADR-003-migration-hors-git-fonds-copropriete.md).
La production (`immotopia-prod`, `clients.immotopia.cloud`) est une base neuve :
elle n'a pas cette ligne et n'en tolère aucune.

Ce contrôle est **automatique**, dans l'étape « Contrôle des migrations
inconnues du dépôt » de `deploy.sh`, **avant** `migrate deploy`. Il ne lit
pas le texte de `prisma migrate status` : mesuré sur Prisma 5.22.0, une ligne
orpheline isolée (aucune migration du dépôt par ailleurs en attente) produit
le diagnostic interne `migrationsDirectoryIsBehind`, que le CLI ne reconnaît
pas (seuls `databaseIsBehind` et `historiesDiverge` le sont) — il retombe en
silence sur « Database schema is up to date! », code 0, sans jamais signaler
l'orpheline. L'étape compare donc directement, par le socket local du
conteneur `postgres` (aucun secret sur la ligne de commande) :

- les migrations `_prisma_migrations` terminées et non annulées ;
- les dossiers de `packages/api/prisma/migrations`.

Une migration appliquée en base sans dossier local est une orpheline. Le
traitement dépend de l'environnement :

- **Staging** (`deploy.sh staging`) : son nom est comparé à la liste versionnée
  [`infra/scripts/migrations-orphelines-connues.txt`](../../infra/scripts/migrations-orphelines-connues.txt)
  (un nom par ligne, commentaires `#`, actuellement
  `20260927080000_mouvements_fonds_copropriete` avec un renvoi vers ADR-003).
  Un nom qui y figure ne bloque pas le déploiement ; un nom absent de cette
  liste fait échouer `deploy.sh` avant toute migration. **Cette liste ne vaut
  que pour la pile `immotopia-saas`.**
- **Production** (`deploy.sh prod`) : la liste est **ignorée**, aucune orpheline
  n'est tolérée ; la moindre fait échouer le script avant toute migration.

Dans les deux cas, une lecture de `_prisma_migrations` impossible (postgres
injoignable, réponse inattendue de `to_regclass`) fait aussi échouer le script ;
une table absente est lue comme un tout premier déploiement (rien à comparer).

Documenter une nouvelle exception avant de l'ajouter au fichier (staging
seulement) : y ajouter une ligne sans avoir écrit d'ADR (ou complété ADR-003)
revient à désactiver le contrôle en silence.

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
| `infra`     | `bash infra/scripts/check-infra.sh` (scripts et compose)           | **Oui**  |

Les étapes non bloquantes le sont **temporairement** (CONTRIBUTING.md) :
elles doivent devenir bloquantes module par module à mesure que la dette
correspondante est résorbée — ne pas les considérer comme définitivement
optionnelles.

## Pour aller plus loin

- Déploiement du staging et de la production, sauvegardes, restauration :
  [DEPLOIEMENT.md](DEPLOIEMENT.md) ; décision :
  [ADR-005](../architecture/adr/ADR-005-environnements-staging-production.md).
- Installation détaillée pas à pas :
  [docs/setup/getting-started.md](../setup/getting-started.md).
- Diagnostic de connexion backend/frontend :
  [docs/runbooks/troubleshooting-connection.md](../runbooks/troubleshooting-connection.md).
- Architecture et cycle de vie d'une requête :
  [docs/architecture/SYSTEM_DESIGN.md](../architecture/SYSTEM_DESIGN.md).
- Conventions de contribution et garde-fous CI :
  [CONTRIBUTING.md](../../CONTRIBUTING.md).
