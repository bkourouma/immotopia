# Consignes pour les agents IA

Contexte à charger avant de modifier ce dépôt. Pour les conventions humaines,
voir [CONTRIBUTING.md](CONTRIBUTING.md) ; pour l'état du code et la dette
identifiée, voir [AUDIT_CODE.md](AUDIT_CODE.md).

Ce fichier est la source unique de vérité pour tous les agents (Claude Code,
Codex, Cursor…). En cas de désaccord avec un autre document, il prime ; le
détail vit ailleurs et se charge à la demande :

| Sujet                                | Document                               |
| ------------------------------------ | -------------------------------------- |
| Reprise du travail en cours          | `docs/workflows/HANDOFF.md`            |
| Développement multi-agents           | `docs/workflows/DEV_PROCESS.md`        |
| Démo, anomalies et retests           | `docs/workflows/DEMO_DEBUG_PROCESS.md` |
| Pilotage par un agent unique         | `docs/workflows/LEAD_PROCESS.md`       |
| Installation, ports, dépannage       | `docs/workflows/RUNBOOK.md`            |
| Architecture, modèle de données, ADR | `docs/architecture/`                   |
| Conventions et modèle de menace      | `docs/governance/`                     |
| Règles ciblées par chemin            | `.claude/rules/`                       |
| Inventaire des fonctionnalités       | `docs/fonctionnalites/`                |

## Passation de session

Avant de conclure un tour en plusieurs étapes, l'agent met à jour
`docs/workflows/HANDOFF.md` sans l'annoncer : fait, reste à faire, pièges,
branche et dernier commit. Une session commence par lire ce fichier.

## Structure réelle

```text
apps/web                 React 18 + TypeScript + Ant Design, build Vite
packages/api             Express 4 + Prisma 5 + PostgreSQL
packages/tsconfig        configuration TypeScript partagée
packages/eslint-config   configuration ESLint partagée
docs/                    documentation (index : docs/README.md)
specs/                   spécifications fonctionnelles par module
```

Monorepo npm workspaces : `npm install` **à la racine uniquement**, un seul
`package-lock.json`.

## Commandes

```bash
npm run dev          # API (8001) + web (3000)
npm run typecheck    # tsc --noEmit sur les deux paquets
npm run lint
npm run check:architecture # frontières entre frontend et API
npm run repomix             # contexte IA local, export ignoré par Git
npm test             # tests backend
npm run test:web     # tests frontend
```

## Flux de travail des agents et hooks

Deux processus réutilisables sont définis dans `docs/workflows/` :
**développement** et **démo/debug**. Ils définissent des rôles, des passations
et des critères de fin indépendants du modèle et de l'outil. Si une demande
lance ces processus, chaque coordinateur dirige ses agents spécialisés ; la
recette transmet ses anomalies au développement, attend les corrections, puis
rejoue les scénarios jusqu'à réussite ou blocage documenté. Un **Pilote**
(`docs/workflows/LEAD_PROCESS.md`) peut, en agent unique, coordonner les deux
processus l'un après l'autre ou en boucle, ou déléguer directement à des
agents de réalisation pour une tâche bornée, et livrer seul jusqu'à la pull
request ; la fusion de cette PR reste à l'utilisateur. Choisir les modèles
et les outils disponibles dans l'environnement courant. Pour les sous-agents,
préférer le modèle rapide de l'environnement dès que la tâche le permet
(réalisation bornée, tests, relecture, recette), et réserver le modèle le plus
puissant au travail transverse difficile ; sous Claude Code, voir la règle
précise dans `CLAUDE.md`. Ne pas demander de
validation humaine pour les actions réversibles déjà autorisées ; respecter les
permissions et confirmations imposées par la plateforme.

- Au début d'une session, lire `docs/workflows/HANDOFF.md` et vérifier
  `git status` avant de modifier le dépôt.
- Utiliser Repomix seulement lorsqu'un contexte regroupé est utile pour une
  revue ou un autre agent. Préférer un périmètre ciblé, par exemple :
  `npm run repomix -- --include "AGENTS.md,apps/web/src/**/*.ts,apps/web/src/**/*.tsx"`.
  Le fichier généré est local et ignoré par Git ; vérifier les exclusions
  Secretlint avant de partager son contenu. Ne pas produire le pack complet
  automatiquement à chaque session.
- Lefthook est installé par `npm install` à la racine via `prepare`. À chaque
  commit, son hook `pre-commit` lance `lint-staged` sur les fichiers indexés.
  Laisser le hook terminer et corriger ses erreurs avant de recommitter ; ne pas
  le contourner avec `LEFTHOOK=0`.
- Le hook de commit ne remplace pas les vérifications pertinentes du projet
  (`typecheck`, tests ciblés et `check:architecture`) avant une livraison.

## Règles à respecter

**Isolation multi-tenant.** Toute requête sur une entité appartenant à un tenant
est filtrée par `tenantId`. Pour les biens et leurs enfants, passer par
`packages/api/src/utils/property-tenant-guard.ts`. Tout identifiant reçu dans
une requête (`siteId`, `contactId`, utilisateur assigné…) est vérifié comme
appartenant à l'agence avant écriture — `utils/tenant-ownership.ts`
(`assertBelongsToTenant`) — et un utilisateur désigné doit être membre ACTIF de
l'agence. Une référence d'une autre agence lève la même `NotFoundError` qu'un
objet inexistant. Une extension Prisma (`prisma-tenant-guard-extension.ts`,
mode `TENANT_GUARD_MODE`) contrôle chaque requête, id compris, dans le contexte
d'agence posé par `requireTenantAccess` et les portails : ne pas ignorer ses
avertissements. Jamais de `include: { user: true }` : toujours un `select` sur
`User` (l'objet complet porte `passwordHash`). Une nouvelle route passe
`__tests__/unit/routes-inventory.test.ts`, un nouveau modèle
`__tests__/unit/schema-tenant-coverage.test.ts` ; l'étanchéité de bout en bout
se vérifie avec `npm run test:isolation` (base dédiée `DATABASE_URL_TEST`).

**Erreurs.** Les services lèvent des erreurs typées de
`middleware/error-middleware` ; les contrôleurs sont enveloppés dans
`asyncHandler`. Ne pas ajouter de `try/catch` qui devine le statut HTTP à partir
du message. Modèle : `src/controllers/property-media-controller.ts`.

**Configuration.** Toute variable d'environnement passe par
`src/config/env.ts` et est documentée dans `env.example`. Pas de
`process.env.X || 'valeur par défaut'` pour un secret.

**Fichiers uploadés.** Les documents privés ne sont jamais servis en statique.

**Frontend.** Réseau via `utils/api-client`, URL via `config/api`, pages en
`React.lazy`, jamais de `dangerouslySetInnerHTML` sur du contenu utilisateur.

**Textes affichés.** L'application est trilingue (fr/en/ar) et **le texte
français est la clé de traduction** : `t('Ajouter un bien')`, jamais
`t('properties.add')`. Tout libellé visible passe par `t()` — `i18n/t.ts` côté
web, `i18n/index.ts` côté API. `npm run i18n:extract` dans le paquet concerné
enveloppe les nouveaux textes et met les catalogues à jour. Écrire une marge en
propriété logique (`ms-4`, `margin-inline-start`, `align: 'end'`), jamais
`ml-4` : l'arabe retourne toute la mise en page. Détails :
[docs/architecture/i18n.md](docs/architecture/i18n.md).

**Ports.** API 8001, web 3000. Des documents archivés mentionnent 8000 ou 5000 :
c'est faux.

**Wiki des fonctionnalités.** Après la mise en place d'une fonctionnalité
(écran, action, route API, permission ou entrée de menu ajoutés, modifiés
ou retirés), mettre à jour `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx`
et lancer `npm run wiki:export` dans la même PR ; `npm run wiki:check` le
vérifie en CI. Détail : [docs/fonctionnalites/README.md](docs/fonctionnalites/README.md).

## Pièges connus

- La base de démonstration est effacée par `npm run db:seed` : ce seed exige
  `ALLOW_DESTRUCTIVE_SEED=1` et refuse de tourner en production.
- Les variables d'environnement du frontend doivent être préfixées `VITE_` pour
  être exposées au bundle, et se lisent via `import.meta.env`, pas
  `process.env`. Le port du serveur de développement vient de `PORT` dans
  `apps/web/.env` et doit rester aligné avec `FRONTEND_URL` côté API, dont le
  CORS n'autorise qu'une seule origine.
- Vitest refuse tout import qu'un `vi.mock` ne déclare pas explicitement, là où
  Jest renvoyait `undefined` en silence : un mock de module doit couvrir chaque
  export utilisé par le composant testé.
- Le backend compte encore ~160 erreurs TypeScript préexistantes ; ne pas en
  ajouter dans les fichiers déjà propres.
- Modifier un texte français **casse ses traductions** : la clé, c'est le texte.
  Après une retouche, `npm run i18n:extract` déplace la traduction devenue
  orpheline dans un `*.orphans.json` au lieu de la perdre — la reporter à la
  main sur la nouvelle clé.
- Les tests frontend tournent en français parce que `setupTests.ts` l'impose.
  Sans cela jsdom se déclare `en-US` et la suite cherche « Enregistrer » dans une
  interface qui affiche « Save ».
