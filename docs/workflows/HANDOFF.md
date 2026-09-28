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

## Branche `feat/patrimoine-p3-exports` — 2026-09-28

**État :** prêt à relire — PR #45 vers `main`
(https://github.com/bkourouma/immotopia/pull/45), CI lancée, pas encore
fusionnée
**Dernier commit :** `6f073ae` fix(patrimoine): corrige la resolution du
proprietaire de bail et l'anti-doublon des alertes

Fait (lot P3 Patrimoine : exports, alertes, ACD) :

- **Exports PDF/Excel** (`lib/patrimoine/export/{data,pdf,workbook,labels}.ts`,
  `controllers/patrimoine-export-controller.ts`, routes
  `GET /tenants/:tenantId/patrimoine/export` et
  `GET /tenants/:tenantId/properties/:propertyId/patrimoine/export`,
  `PROPERTIES_VIEW`, isolation tenant, fichier en mémoire jamais servi en
  statique, borné à 500 biens — `MAX_EXPORT_PROPERTIES`) : déjà en place au
  début de cette reprise (travail non commité d'une session précédente),
  commité tel quel (`5f70ff69`) après vérification — tests déjà verts,
  aucune correction nécessaire.
- **ACD** (`PropertyDocumentType.LAND_CONCESSION`) : déjà livré avant cette
  session (schéma, libellés, i18n fr/en/ar API+web) — vérifié, rien à faire.
- **Alertes d'échéance étendues** (`lib/patrimoine/notifications.ts`,
  `jobs/document-expiry-alert-job.ts`, `types/audit-types.ts`) : ajoutées
  par cette session, en extension du job de PR #40 (fusionnée entre-temps
  dans `main`, rebasée dessus via `git merge origin/main`) — jamais dupliqué :
  - `alertExpiringLeases` : baux actifs, propriétaire résolu via
    `Property.ownerUserId`/indivision **et** `RentalLease.owner_client_id`
    (bug trouvé en relecture croisée : sans ce second chemin, un bail créé
    normalement n'a jamais de destinataire) ;
  - `alertLoanMaturity`/`alertUpcomingWorks` : emprunts actifs / travaux
    planifiés, alertent l'agence (`TENANT_ADMIN` actifs, repli
    `Tenant.contactEmail`) via un petit helper local
    `resolveAgencyAdminRecipients` (dupliqué volontairement, pas importé, de
    `jobs/subscription-usage-job.ts` — évite d'entraîner tout son graphe
    d'imports dans les tests de notifications) ;
  - anti-doublon via `AuditLog` (clé composée `id::échéance`, pas une simple
    marque par id — survit à un renouvellement/restructuration/report), au
    lieu d'une colonne `warningSentAt` dédiée : impossible d'ajouter une
    migration Prisma dans ce worktree (jonction `node_modules/.prisma`
    partagée avec le checkout principal, `prisma generate` interdit hors
    d'un worktree qui a son propre `node_modules`) ; flush immédiat après
    chaque envoi réussi (pas en fin de boucle) pour borner la fenêtre de
    doublon en cas de crash.
- Wiki : 5 lignes ajoutées (section « Parc immobilier ») — 2 exports, 3
  alertes étendues ; miroir régénéré (`npm run wiki:export`), `wiki:check`
  vert.
- Relecture croisée (`security-auditor` + revue générale, sous-agents
  `model: sonnet`) : GO sécurité (1 point mineur, corrigé — flush par
  entité) ; 2 points bloquants de correction fonctionnelle trouvés et
  corrigés (voir ci-dessus, résolution du propriétaire de bail et
  permanence de la marque anti-doublon).
- Vérifications : `typecheck` (0 nouvelle erreur, 73 préexistantes
  inchangées), `jest` ciblé (34 tests alertes/exports + suite large
  `patrimoine`/`routes-inventory`/`schema-tenant-coverage`, 2818/2818 hors 1
  échec préexistant sans rapport — `tenant-data-export.archive.test.ts`,
  typage du module `archiver`), `vitest` (`patrimoine`, 2 timeouts sous
  charge confirmés non reproductibles en isolation), `check:architecture`
  (0 violation), `wiki:check` (vert).

Reste à faire :

- Suivre la CI de la PR #45 jusqu'au vert (lancée, résultat pas encore
  connu au moment d'écrire cette section) et corriger si besoin.
- Fusion par l'utilisateur (pas faite par cette session).

Pièges et décisions :

- La branche n'avait aucun commit propre au départ de cette reprise (tout le
  travail d'export était en modifications non commitées) et était en retard
  de 2 commits sur `origin/main` (PR #40 fusionnée entre-temps) : commit de
  l'existant d'abord, puis `git merge origin/main --no-edit` — conflit
  uniquement sur le classeur xlsx et son miroir (fichiers binaires/générés),
  résolu en prenant la version `origin/main` puis en réappliquant les lignes
  du lot par-dessus (`docs/fonctionnalites/README.md`, section « Piège de
  fusion »).
- `resolveDocumentOwnerRecipients` (dans `notifications.ts`) a gagné un
  paramètre optionnel `extraTenantClientIds` pour couvrir
  `RentalLease.owner_client_id` sans dupliquer toute la logique
  indivision/CRM déjà éprouvée pour `alertExpiringDocuments`.
- Ne pas réintroduire une colonne `warningSentAt` sur `RentalLease`/
  `PropertyLoan`/`WorkProgram` sans avoir d'abord donné à ce worktree (ou à
  un nouveau worktree dédié) son propre `node_modules` (`--install`, voir
  RUNBOOK) : la jonction partagée interdit `prisma generate` ici.

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
