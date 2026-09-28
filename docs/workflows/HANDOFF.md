# Passation de session

Carnet de reprise entre sessions d'agents. **Lire en premier** en début de
session ; **mettre à jour sans l'annoncer** avant de conclure tout tour en
plusieurs étapes (règle posée dans AGENTS.md et CLAUDE.md).

## Mode d'emploi

- Une section par branche, la plus récente en haut. Réécrire la section de sa
  branche au lieu d'empiler des entrées : ce fichier décrit l'état présent, pas
  l'historique (l'historique, c'est `git log`).
- Supprimer la section d'une branche une fois fusionnée dans `main`.
- Dates absolues (`2026-09-27`), jamais « hier ».
- Chaque worktree a sa copie : en cas de conflit à la fusion, garder les deux
  sections de branche, elles sont indépendantes.
- Pas de secret, pas de donnée personnelle, pas de contenu de `.env`.

Modèle de section :

```markdown
## Branche `type/sujet` — AAAA-MM-JJ

**État :** en cours | prêt à relire | bloqué
**Dernier commit :** `abc1234` résumé

Fait :

- …

Reste à faire :

- …

Pièges et décisions :

- …
```

---

## Branche `fix/syndic-anomalies-recette` — 2026-09-28

**État :** prêt à relire — PR #47 vers `main`, recette navigateur faite (5/5)
**Dernier commit :** voir `git log -1` sur la branche (worktree `.claude/worktrees/anomalies-recette`)

Fait (5 anomalies du testeur, recette Syndic du 2026-09-28) :

- AG : date seule + heure de début obligatoire (plus de panneau date+heure
  débordant) ; `needConfirm={false}` sur les autres DatePicker showTime.
- Incidents : bouton « Modifier l'incident » (PATCH existant), statut Assigné.
- Avis d'appel : destinataire `ownerContactId ?? coownerId`, raisons
  distinctes affichées en clair, `charge_calls.notice_sent_at` (migration
  `20260928120000_charge_call_notice_sent_at`), route
  `…/executions/:runId/renvoyer-avis` avec réservation atomique.
- Budgets : transitions contrôlées, Réviser / Clôturer, réalisé et écart.
- Téléchargements : délai 120 s pour les blobs sans rejeu sur expiration,
  `download-error.ts`, images de marque réduites à 800 px avant l'envoi.
- Wiki mis à jour, i18n extrait et traduit (en/ar).

Reste à faire :

- Recette faite le 2026-09-28 sur la démo (base `immotopia_demo`, créée depuis
  `.env` avec envois neutralisés ; `.env.demo` ignoré par git). Non vu : une
  exécution neuve avec raisons par lot, compte copropriétaire, import réel
  d'image de marque. BUG-011 (jeton expiré → 403) corrigé en 401 (63a68506) ;
  BUG-012 (calendrier 25 px sous la fenêtre à 1280x700) accepté.
- Cause réelle des avis non envoyés en production : non vérifiée (pas de
  lecture de la base prod) ; le nouvel écran donne la raison.
- Déploiement : `migrate deploy` (migration additive).
- Hors lot : clôture complète d'exercice (report à nouveau, ouverture N+1).

Pièges et décisions :

- Fusion de `main` (PR #43 `feat/syndic-reprise-ecarts` incluse) : l'écran
  Programmation est désormais découpé en sous-composants
  (`components/syndics/charge-schedules/`) ; les avis y passent par
  `ChargeScheduleRunNotices` (ScheduleTable, ScheduleRunsPanel,
  `handleNoticesResent` de `useChargeSchedules`). Tableau des incidents :
  description de 240 px (retour à la ligne) pour que Statut, Prestataire et
  Actions restent visibles.
- Le client Prisma partagé par jonction a été régénéré avec `noticeSentAt`
  (additif).
- Échec connu hors sujet : `tenant-data-export.archive.test.ts` (types
  `archiver` absents), aussi sur `main`.
- Les images de marque déjà en 3000 px restent lentes à incruster : il faut
  les réimporter.

## Branche `feat/syndic-reprise-ecarts` — 2026-09-28

**État :** prêt à relire — PR #43 vers `main`, CI verte (6/6)
**Dernier commit :** `ffd2bdff` fix(api): lever la collision de type entre deux fichiers de test sans import

Fait (reprise d'une session coupée par une limite d'API — le travail était déjà
sur disque dans le worktree, non commité ; repris sans rien refaire) :

- Les 7 écarts du lot, chacun dans son propre commit : pagination des
  copropriétés (`queries.ts`, `syndic-controller.ts`, `syndic-service.ts`,
  `SyndicsList.tsx`), votants d'AG à la date (nouveau
  `packages/api/src/lib/syndics/meeting-voters.ts`, consommé côté frontend
  sans dupliquer `meeting-governance.ts`), sélecteur « Changer de
  copropriété » dans `SyndicWorkspaceLayout`, prestataires sous contrat en
  premier (nouveau `ProviderList.tsx`), seed de démo avec historique des
  fonds cohérent (nouveau `syndic-demo-fund-movements.ts`), découpage de
  `SyndicChargeSchedules.tsx` (828 → 146 lignes) en
  `components/syndics/charge-schedules/`, retouches d'affichage
  lots/incidents. Catalogues i18n et classeur wiki en commits séparés.
- Vérifications : typecheck api+web propre sur les fichiers touchés (aucune
  nouvelle erreur dans la base préexistante) ; Jest ciblé
  (`syndics.*`, `routes-inventory`, `route-features`,
  `schema-tenant-coverage`) tout vert ; Vitest syndics+navigation vert, sauf
  des délais isolés déjà connus sur ce poste (confirmés indépendants du diff
  en relançant les fichiers seuls) ; `check:architecture` et `wiki:check`
  propres (662 sous-fonctionnalités).
- Relecture `security-auditor` (pagination + votants d'AG, identifiants
  reçus dans les routes) : 0 constat. Relecture générale indépendante des 7
  items : **prêt** sur les 7.
- Fusion de `main` (en retard de plusieurs commits, dont PR #37 à #40 —
  migrations, abonnements, patrimoine) : seul le classeur wiki
  (`ImmoTopia_Wiki_Fonctionnalites.xlsx`) entrait en conflit binaire.
  Résolu en repartant du classeur de `main` et en y réappliquant les mêmes
  modifications de cellules que sur cette branche (1 ligne ajoutée, 5
  retouchées), puis en régénérant le miroir. Le mirroir doit refléter
  `endRow − startRow` lignes de données (table Excel `SousFonctionnalites`,
  `ref` **et** `autoFilter.ref` à mettre à jour tous les deux après un
  `insert_rows` openpyxl, sinon `wiki:check` sous-compte silencieusement).
- CI : un premier run a échoué sur `provision-subscription-cli.test.ts` /
  `subscription-provisioning-service.test.ts` (fusionnés depuis `main`,
  PR #39) — aucun des deux n'a d'`import`/`export` top-level, TypeScript les
  traite comme deux scripts globaux et leur `type Row` commun entre en
  collision (TS2300) dès qu'ils tournent dans le même run `jest`. Corrigé
  par un `export {}` dans chacun (commit dédié, hors périmètre du lot mais
  nécessaire pour la CI verte).

Reste à faire :

- Fusion de la PR #43 : à l'utilisateur.

Pièges et décisions :

- Un fichier de test Jest sans `import`/`export` est un script global en
  TypeScript : deux fichiers de ce type déclarant le même identifiant de
  niveau supérieur (ex. `type Row = …`, motif très répandu dans
  `packages/api/__tests__`) entrent en collision TS2300 s'ils sont compilés
  ensemble — invisible tant qu'un seul des deux tourne isolément.
- Résolution d'un conflit Git sur le classeur xlsx : ne pas prendre un
  camp entier, reconstruire par clé stable (Module, Fonctionnalité,
  Sous-fonctionnalité) — script dans le scratchpad de session
  `6d754bbb-846c-4481-9333-070145f6e577` (non conservé).

---

## Branche `feat/patrimoine-p5-portail` — 2026-09-28

**État :** prêt à fusionner — PR #42 vers `main`, 6/6 checks CI au vert (`gh pr view 42` : `mergeable: MERGEABLE`), fusion laissée à l'utilisateur
**Dernier commit :** `0728d7a` fix(tests): lever la collision de type entre deux suites d'abonnements

Reprise : le tour précédent avait tout implémenté mais s'est arrêté avant de
committer (limite d'API) — la branche était encore au niveau de PR #38, 7
commits derrière `main` (PR #39 provisionnement, #40 patrimoine-suite-p0).
Ce tour a relu (`security-auditor` + relecture générale, aucun bloquant, un
point mineur documenté ci-dessous), vérifié (`typecheck`, 7 suites Jest
ciblées = 114 tests, 5 fichiers Vitest = 57 tests, `check:architecture`,
`wiki:check`, tous verts), committé, fusionné `origin/main` (sans conflit sur
le code — seuls `HANDOFF.md`, `sous-fonctionnalites.md` et le classeur wiki se
recoupaient, résolus en conservant les deux apports), puis ouvert la PR.

Fait :

- Vue patrimoine du portail propriétaire (lot P5) : `GET /api/portal/owner/patrimoine`
  (+ `/settings`, `/properties/:propertyId`, `/properties/:propertyId/documents/:documentId/file`),
  lecture seule, biens = `req.ownerPortal.propertyIds` dans l'agence du portail,
  même 404 pour bien d'autrui / d'une autre agence / inexistant. Calculs par
  `buildPropertyYieldInput` + `lib/patrimoine/yield.ts` (aucun second moteur).
  Agrégats de la liste pondérés par la quote-part d'indivision ; détail non pondéré.
- Masquage par l'agence : modèle `OwnerPortalSettings` (migration
  `20261003150500_owner_portal_settings`, table dédiée, tout ouvert par défaut
  sans écrire), `GET|PUT /api/tenants/:tenantId/settings/owner-portal`
  (`TENANT_SETTINGS_VIEW/EDIT`), carte « Portail propriétaire » dans Paramètres
  de l'agence. Vue masquée → 404 et entrée de menu retirée ; rubrique masquée →
  clé absente ; `netNetYield` absent si les emprunts sont masqués.
- Front : `pages/OwnerPortal/Patrimoine.tsx`, `PatrimoinePropertyDetails.tsx`
  (React.lazy), menu « Mon patrimoine », traductions en/ar.
- Correctifs du portail propriétaire : bug `date-fns` (variable `format` du corps
  qui masquait la fonction → 500 sur les trois rapports) ; IDOR préexistant de
  `POST /reports/export` (`report-generator.ts` : `propertyId` du corps écrasait
  le périmètre) ; validation de `entityType`/`format`.
- Tests : `owner-portal-patrimoine` (24), `owner-portal-reports-filename` (5),
  `owner-portal-export-scope` (18), Vitest portail/menu/réglage. Wiki mis à jour
  (4 lignes ajoutées, 3 rapports repassés « Disponible », note date-fns retirée).
- Relectures (ce tour) : `security-auditor` — 0 bloquant, 1 mineur (cas
  `PropertyDocument.tenantId: null` non documenté, corrigé par une note dans
  `docs/governance/SECURITY.md` §5) ; relecture générale — 0 bloquant, 2
  remarques cosmétiques sans suite.

- Correctif hors P5 après la fusion de `origin/main` : `npm test -w @immotopia/api`
  échouait en CI (TS2300 « Duplicate identifier 'Row' » entre
  `provision-subscription-cli.test.ts` et
  `subscription-provisioning-service.test.ts`, aucun des deux n'a
  d'import/export donc TypeScript les traite en scripts globaux). Défaut
  préexistant des PR #39/#40 déjà fusionnées — vérifié avec
  `gh run list --branch main` : la CI de `main` elle-même est rouge sur ce
  point depuis la fusion de la #40, indépendamment de P5. Corrigé en
  renommant l'alias en `CliRow` dans le seul fichier CLI (`0728d7a`) ; les
  deux suites (46 tests) repassent au vert.

Reste à faire :

- Fusion de la PR #42 : décision de l'utilisateur.
- Recette navigateur du portail propriétaire sur une base migrée (non faite
  dans ce tour — CI verte et deux relectures automatisées seules avant
  fusion).
- Signalé à part (hors P5, tâche déléguée via `spawn_task` — `task_42d38dec`) :
  `main` a une CI rouge sur ce même défaut depuis la fusion de la #40 —
  `subscription-provisioning-service.test.ts` garde encore le nom `Row` non
  renommé ici (volontairement, pour ne toucher qu'un fichier dans cette PR) ;
  un futur commit sur `main` doit soit renommer aussi ce second alias, soit
  ajouter un `export {}` aux deux fichiers.
- Décision éventuelle : un bien dont la table d'indivision ne cite pas le
  propriétaire compte pour 0 % dans ses totaux (même règle que le relevé de
  gérance, `ownerSharesByProperty`).

Pièges et décisions :

- Table dédiée plutôt que colonnes sur `AgencyFinanceSettings` : réglage de
  portail, pas comptable, et P4 touche aux réglages fiscaux en parallèle.
- Les tests qui montent `owner-portal-routes` vont dans `APP_LEVEL_TESTS`
  (`jest.config.js`) : erreurs TS anciennes de `document-context-builder.ts`.
- Worktree avec son propre `npm ci` (schéma modifié), pas de jonction.
- Fusion de `origin/main` dans ce tour : les sections `fix/patrimoine-suite-p0`
  (#40) et `feat/provision-abonnements` (#39) qui vivaient ici ont été
  retirées — les deux branches sont déjà fusionnées dans `main` (règle du
  fichier : une section disparaît une fois fusionnée, l'historique reste dans
  `git log`).

---

## Branche `fix/patrimoine-suite-p0` — 2026-09-28

**État :** prêt à relire — PR #40 vers `main`
**Dernier commit :** voir `git log -1` sur la branche (commit unique du lot)

Fait :

- `alertExpiringDocuments` (`lib/patrimoine/notifications.ts`) porte désormais
  sur `PropertyDocument` (et non plus `PatrimonyDocument`, inutilisé depuis P0) :
  fenêtre [maintenant, +30 j], destinataires = propriétaires du bien
  (`PropertyOwnershipShare` + `ownerUserId` → `TenantClient` →
  `details.crmContactId` → `CrmContact.consentEmail === true`), anti-doublon
  par `warningSentAt` réservé atomiquement (`updateMany … warningSentAt: null`),
  remis à null si aucun envoi n'aboutit ; HTML échappé.
- Job `jobs/document-expiry-alert-job.ts`, chaque jour 7 h UTC, agences
  ACTIVE une par une dans `runWithTenantContext`, démarré dans `src/index.ts`
  (deux lignes, conflit trivial possible avec `feat/provision-abonnements`).
- `owner-statements-controller.ts` en `asyncHandler` + erreurs typées ;
  tests 400/404/409 (supertest + `errorHandler` réel).
- Wiki : ligne « Alerter les propriétaires d'un document qui arrive à échéance ».

Reste à faire :

- Fusion par l'utilisateur. Le modèle `PatrimonyDocument` reste au schéma
  (retrait = migration, hors lot).

Pièges et décisions :

- Pas de consentement supposé depuis le seul `User` : un propriétaire sans
  contact CRM lié ne reçoit rien ; le document n'est pas marqué et est
  retenté chaque jour.
- Limites assumées (commentées) : échec partiel en indivision non relancé ;
  arrêt du processus entre réservation et envoi laisse la marque posée.
- Une erreur sans statut dans create/update du relevé donne 500 (et non
  plus 400 par défaut) ; les erreurs métier portent toutes un statut.

## Branche `feat/provision-abonnements` — 2026-09-28

**État :** prêt à relire (PR ouverte vers `main`)
**Dernier commit :** voir `git log` de la branche (outil d'exploitation des abonnements)

Fait :

- Outil en ligne de commande `packages/api/src/scripts/provision-subscription.ts`
  (logique : `services/subscription-provisioning-service.ts`) : `list`,
  `provision` (essai TRIALING + éléments en une transaction, `setupWaived`,
  puis réconciliation du registre des lots), `suspend` (`suspendTenant`),
  `--dry-run` sans écriture, idempotent, fenêtre hh:10–hh:20 UTC refusée,
  acteur d'audit `system:provision-subscription`. `audit-service` exporte
  `flushAuditEvents`. Section RUNBOOK « Outil d'exploitation des abonnements ».
- Essai de bout en bout sur une base jetable (PostgreSQL local, migrations +
  catalogue) avec le JavaScript compilé comme dans l'image : dry-run sans
  écriture, création Ivoire (AGENCE + SYNDIC + 2 × EXT_COPRO, 100 lots
  copro réconciliés), relance idempotente, refus non conforme, suspension
  et révocation des jetons, première facture simulée après l'essai sans
  frais de mise en route (96 810 HT / 114 236 TTC).

Reste à faire :

- En production (hors de cette branche, après fusion et déploiement) : dry-run
  puis réel pour Ivoire Résidences, Agence Immobilière du Mali, Bamako
  Immobilier (commandes dans la PR). Les slugs réels sont à lire avec `list`.

Pièges et décisions :

- Ivoire aura 4 copropriétés pour 4 incluses : la tâche horaire enverra les
  alertes de seuil 80 % et 100 % (une fois par période). Voulu par la
  composition décidée ; le dry-run l'annonce.
- Un abonnement existant non conforme est refusé, jamais corrigé : si la
  production en a déjà un pour Ivoire, décider à la main.
- Le gestionnaire SIGTERM/SIGINT d'`audit-service` sort en code 0 même si la
  file d'audit n'a pas pu être vidée (hérité, hors périmètre).

## Pilote — lots Syndic S3 à S5, e-mail de contact, abonnements — 2026-09-27

**État :** prêt à relire ; 5 PR ouvertes, CI verte (#26/#27 relancées après le dernier correctif)
**Dernier commit :** S3 `ec3fceb`, S4 `caaa034`, S5 `5e3dd93`, e-mail `443461b`, journaux `e077830`

Fait :

- PR empilées, à fusionner dans l'ordre : #25 S3 reçus/quittances (base
  `main`) → #26 S4 appels automatiques (base S3) → #27 S5 portail
  copropriétaire (base S4 ; S5 a été empilée sur S4 pour absorber les
  conflits S4↔S5 : limiteurs de débit, routes du portail, wiki).
- Revue de code et audit de sécurité S4/S5 : 0 bloquant ; corrigés : suivi
  mensuel du portail borné aux appels du copropriétaire (moyenne), avis
  d'appel du portail borné à `ownedSince`, limiteurs sur l'exécution
  manuelle et l'avis gestionnaire. Choix produit actés : signature et cachet
  restent sur les quittances servies au portail (même PDF que l'e-mail) ;
  le relevé du portail ouvre sur le solde du compte à la date d'acquisition.
- Recette navigateur sur la démo (`5e3dd93`) : S3, S4, S5 passés ;
  BUG-2026-09-27-009 (appels non notifiés comptés nulle part) corrigé
  (`caaa034`) et retesté. Traduction « Quittance » = « Settlement receipt »
  / « إيصال تسوية » (S3 avait « Statement »).
- #28 : adresse de support `support@immotopia.cloud` (env.example, specs).
  `PLATFORM_ISSUER_EMAIL=support@immotopia.cloud` posé dans `.env`, `.env.demo`
  et l'environnement de production (sauvegarde
  `/home/deployer/immotopia-saas.env.avant-email-20260927`), API de prod
  recréée. Site vitrine : e-mail déployé (`d2a4818`, image de retour
  `immotopia-site:avant-email-20260927`), et avant cela logos/menu/formulations
  (`9b30cbd`, retour `:avant-menu-20260927`).
- #29 : `/app/logs` de l'API de prod sur un volume nommé.
- Abonnements en production (lecture seule) : l'image de prod date du
  2026-09-25, sans garde d'abonnement ; 10 migrations en attente ; aucune
  agence n'a d'abonnement ; Ivoire Résidences n'a que MODULE_AGENCY mais
  utilise 4 copropriétés et 1 chantier ; Agence Immobilière du Mali n'a aucun
  module.

Reste à faire :

- Fusion de #25 → #26 → #27, #28, #29 : décision de l'utilisateur.
- Déployer `main` en production (10 migrations, dont la réécriture des
  paiements Syndic : sauvegarde de base avant), puis attribuer un pack à
  chaque agence, observer les refus en `warn`, enfin
  `SUBSCRIPTION_ENFORCEMENT=enforce` — chaque étape avec accord.
- Découper `SyndicChargeSchedules.tsx` (631 lignes, remarque de revue).
- Pagination « 1–3 sur 3 » non traduite : tâche séparée lancée
  (`fix/pagination-i18n`).
- Hérité : `demo:sync --install` jamais relancé depuis S7 ; protection de
  branche GitHub indisponible.

Pièges et décisions :

- Recréer le conteneur API de prod efface ses journaux (#29 corrige) : les
  refus du garde d'abonnement d'avant le 2026-09-27 18:47 UTC sont perdus.
- Deux jest lourds en parallèle sur ce poste : tout tombe en délai ; lancer
  les suites une par une (`--maxWorkers=4`).
- Un jest orphelin d'une session morte verrouille le moteur Prisma du
  worktree (EPERM au `prisma generate`) : chercher les `node.exe` du worktree.
- `validate-bash.sh` prend `gh pr create --base main` chaîné après `git push`
  pour une poussée vers main : lancer `gh pr create` seul.
- Test web du suivi mensuel du portail : attendre le rendu (`findAllByText`),
  pas seulement l'appel du service ; année courante, jamais 2026 en dur.
- Déploiement du site : `npx tsc --noEmit` local passe grâce au cache
  incrémental alors que `next build` échoue ; vérifier avec
  `--incremental false` ou `npm run build`.
