# Plan d'implémentation 033 — Suivi d'avancement de la régularisation foncière

**Branche** : `feat/patrimoine-foncier` · **Spec** : [spec.md](./spec.md) ·
**Plan de vague** : [PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md](../../docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md) (lot B2)

## Résumé

Un dossier de régularisation foncière suit, bien par bien, une suite d'étapes ordonnées
(filière constante `CI_ACD`, « à valider », ou filière personnalisée saisie par l'agence).
Chaque étape porte un statut, une échéance, des frais (XOF), des notes et une pièce choisie
parmi les documents du même bien. Les règles de transition vivent dans une fonction pure,
source unique du serveur et de l'écran (`allowedTransitions`). Les frais forment un chiffre
séparé « frais de régularisation », sans effet sur le coût de revient ni le rendement. Une
relance e-mail prévient l'agence d'une étape en retard, une seule fois par échéance.

## Contexte technique

- API Express 4, Prisma 5, PostgreSQL, Jest ; web React 18, Ant Design, Vitest.
- Existant réutilisé : `routes/patrimoine-routes.ts` et `controllers/patrimoine-controller.ts`
  (enveloppe de réponse, gardes `requirePropertyPermission` / `requireAnyPropertyPermission`),
  préfixe `/patrimoine` déjà rattaché à la fonctionnalité d'abonnement `PATRIMOINE`
  (`lib/subscription/route-features.ts`), `utils/property-tenant-guard.ts`,
  `utils/tenant-ownership.ts`, `services/audit-service.ts` (`logAuditEvent`),
  `lib/patrimoine/notifications.ts` (modèle de l'alerte d'agence `alertLoanMaturity`, privée
  donc dupliquée), `jobs/document-expiry-alert-job.ts` (job quotidien existant),
  service des documents de bien (téléversement), `middleware/error-middleware`.
- **Schéma et migration déjà écrits** par le coordinateur : enums `LandTrackKey`,
  `LandRegularizationStatus`, `LandStepStatus`, modèles `LandRegularization` et
  `LandRegularizationStep`, migration additive `20261007130000_patrimoine_regularisation_fonciere`
  (horodatage > `20261006150000` et distinct de ceux des lots A1, A2 et A3 ; aucune
  migration existante n'est éditée). Les agents du lot ne modifient pas le schéma : un
  manque se signale au coordinateur.

## Vérification de la constitution (AGENTS.md)

| Règle                          | Application                                                                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolation multi-tenant         | `tenantId` direct sur le dossier **et** l'étape ; bien contrôlé par `property-tenant-guard` ; `regularizationId`, `stepId`, `documentId` vérifiés ; `NotFoundError` uniforme     |
| Document d'un autre bien       | `documentId` accepté seulement s'il appartient à la même agence **et** au même bien que le dossier (404 sinon) : vérification dédiée, plus stricte que le seul contrôle d'agence |
| Erreurs typées, `asyncHandler` | contrôleurs enveloppés ; `BadRequestError` (400), `NotFoundError` (404), `ConflictError` (409) de `middleware/error-middleware` ; aucun `try/catch` qui devine un statut         |
| Validation                     | schémas zod `.strict()` appelés avec `.parse()` en tête de contrôleur                                                                                                            |
| Données                        | jamais `include: { user: true }` ; `select` explicite pour le bien (`id`, `internalReference`, `title`) et le document (`id`, `fileName`, `documentType`)                        |
| Un seul dossier en cours       | contrôle de service **et** index unique partiel en base ; une violation d'index à la création est convertie en `ConflictError`                                                   |
| Configuration                  | aucune variable d'environnement nouvelle                                                                                                                                         |
| Frontend                       | `utils/api-client`, `config/api`, pages en `React.lazy`, pas de `dangerouslySetInnerHTML`                                                                                        |
| i18n                           | fr clé, en, ar (`npm run i18n:extract` côté API et web) ; marges logiques                                                                                                        |
| Wiki                           | sous-fonctionnalités signalées au coordinateur (voir plus bas)                                                                                                                   |
| Honnêteté juridique            | aucune valeur juridique présentée comme certaine ; filière `A_VALIDER` ; aucune durée légale ; aucune filière hors Côte d'Ivoire                                                 |

## Découpage par territoire de fichiers

Un fichier = un seul agent. Ordre : 1 → 2 → (3 ∥ 4) → 5 → 6 ; la documentation (7) vit à part.
Fichiers **intouchables** : `lib/patrimoine/{yield,queries,notifications}.ts`,
`lib/patrimoine/entities/*`, `lib/patrimoine/export/*`, `PropertyPatrimoineTab.tsx`,
`apps/web/src/services/patrimoine-service.ts`.

### 1. Schéma et migration (fait, coordinateur)

- `packages/api/prisma/schema.prisma` : trois enums, deux modèles, relations inverses sur
  `Tenant`, `Property`, `PropertyDocument` et `User`.
- `packages/api/prisma/migrations/20261007130000_patrimoine_regularisation_fonciere/migration.sql` :
  tables, index et **index unique partiel** `land_regularizations_one_active_per_property_key`
  (`WHERE "status" = 'EN_COURS'`).
- `packages/api/src/types/audit-types.ts` : `LAND_REGULARIZATION_CREATED`,
  `LAND_REGULARIZATION_STATUS_CHANGED`, `LAND_STEP_STATUS_CHANGED`, `LAND_STEP_UPDATED`,
  `PATRIMOINE_LAND_STEP_OVERDUE_ALERT_SENT` (ajoutées par l'agent API).
- L'export de données d'agence (`services/tenant-data-export/model-registry.ts`) est **dérivé du
  schéma** : les deux modèles y entrent d'office (aucun secret), sans exclusion à écrire ; le
  test `tenant-data-export.registry.test.ts` le confirme.

### 2. Cœur du domaine `lib/patrimoine/land/`

- `tracks.ts` : filières constantes et versionnées (FR-006) ; `CI_ACD` avec ses six étapes
  (`validationStatus: 'A_VALIDER'`, aucune durée), `PERSONNALISEE` ; accès par clé ; clé d'étape
  `custom_<n>` ; libellés français stockés, traduits à la lecture par `t()`.
- `transitions.ts` : **fonction pure**, sans accès base : transitions autorisées d'étape,
  contrôle « étapes obligatoires précédentes terminées », contrôle de réouverture (motif,
  aucune étape suivante terminée), calcul de `allowedTransitions`, transitions du dossier. Seule
  source de ces règles : l'API s'en sert pour refuser, l'écran pour proposer.
- `fees.ts` : somme des frais d'un dossier (`feesXof`). Aucun import de `yield.ts` ni de `queries.ts`.
- `schemas.ts` : schémas zod `.strict()` du contrat HTTP (création, `PATCH`, statut, étape ;
  `steps` 1 à 30 obligatoire pour `PERSONNALISEE` et interdit pour `CI_ACD` ; `reason` ≤ 500).
- `dto.ts` : projection `Summary`, `Detail`, `Step` (progression, `nextDueDate`, `overdueSteps`,
  `currentStepLabel`, `isOverdue`, `allowedTransitions`, dates ISO, montants en nombres,
  libellés traduits).
- Service du dossier (même dossier) : création en transaction (dossier + étapes copiées de la
  filière), changements de statut, ajout / modification / suppression d'étape, rattachement de
  pièce, journal d'audit. Les écritures sont atomiques : un échec ne laisse ni dossier sans étapes
  ni statut sans événement d'audit.

### 3. Alertes de retard

- `packages/api/src/lib/patrimoine/land-alerts.ts` : `alertOverdueLandSteps(tenantId, { now? })`,
  étapes `A_FAIRE` ou `EN_COURS`, `dueDate` < `now`, dossier `EN_COURS` ; administrateurs actifs
  de l'agence (résolution **dupliquée** de `resolveAgencyAdminRecipients`, privée dans
  `notifications.ts`, intouchable) ; anti-doublon par `AuditLog`
  (`PATRIMOINE_LAND_STEP_OVERDUE_ALERT_SENT`, `entityId = <stepId>::<AAAA-MM-JJ de l'échéance>`) ;
  retour `{ matched, sent, skippedNoRecipient, skippedAlreadySent, failed }`.
- `packages/api/src/constants/email-notification-keys.ts`,
  `email-notification-default-templates.ts`, `notification-key-features.ts` : clé
  `LAND_STEP_OVERDUE_ALERT` (fonctionnalité `PATRIMOINE`) et gabarit (`agencyName`,
  `propertyReference`, `trackLabel`, `stepLabel`, `dueDate`, `daysOverdue`, `regularizationUrl`).
  Le gabarit n'écrit aucun montant ; les valeurs HTML sont échappées. Les types de
  `types/communication-types.ts` et `utils/communication-validators.ts` suivent s'ils énumèrent les clés.
- `packages/api/src/jobs/document-expiry-alert-job.ts` : l'alerte est appelée par agence, dans son
  contexte (`runWithTenantContext`), à la suite des alertes patrimoine existantes ; les tests du job
  et de la barrière d'abonnement (`notification-feature-gate`) en tiennent compte.

### 4. Contrôleur, routes et schémas

- Contrôleur et routes dédiés du dossier foncier, **ajoutés à côté** de `patrimoine-routes.ts`
  (nouveau routeur monté sous `/api`, comme `patrimoine-entities-routes.ts`) pour ne pas encombrer
  un fichier partagé ; dix routes de FR-028, mêmes gardes que les routes voisines
  (`PROPERTIES_VIEW` en lecture, `PROPERTIES_EDIT` en écriture), enveloppe de réponse de
  `patrimoine-controller.ts`, handlers `asyncHandler`, `.parse()` en tête.
- `packages/api/src/app.ts` (une ligne de montage) et
  `packages/api/__tests__/unit/routes-inventory.test.ts` (les dix routes) : fichiers partagés,
  touchés par **un seul** agent et signalés au coordinateur.
- Ordre des vérifications : permission → bien (garde de bien) → dossier de l'agence → étape du
  dossier → document du même bien → règle métier.

### 5. Web `apps/web/src/pages/patrimoine/land/`

- `LandRegularizationListPage.tsx` : liste, filtre par statut, `?propertyId=`, création
  (modale `LandCreateModal.tsx` : bien, filière, étapes de la filière personnalisée).
- Page de détail : frise des étapes dans l'ordre, progression, total « Frais de régularisation »,
  retards, pièces (téléversement par le service existant des documents de bien, type suggéré,
  puis rattachement), actions limitées par `allowedTransitions` et `PROPERTIES_EDIT`, motif
  demandé à la réouverture.
- `land-regularization-service.ts` (réseau via `utils/api-client`, `config/api`), `land-types.ts`
  (types du contrat), `land-labels.ts` (libellés et couleurs de statut, étiquette « À valider »).
- Routes `/tenant/:tenantId/patrimoine/land` et `/…/land/:regularizationId` en `React.lazy` dans
  `App.tsx` ; entrée de menu patrimoine (`menu-catalog`, voir Risques). **Aucun** changement de
  `PropertyPatrimoineTab.tsx` ni de `patrimoine-service.ts`.

### 6. Tests

Voir « Stratégie de tests ». Un fichier de test = un agent ; les tests d'un fichier de code sont
écrits par l'agent de ce fichier ou, à défaut, par l'agent « tests » du lot.

### 7. Documentation

- `specs/033-patrimoine-regularisation-fonciere/{spec,plan}.md` (ce dossier) et la section
  « LandRegularization » de `docs/architecture/DATA_MODELS.md`.
- Wiki des fonctionnalités et `npm run wiki:export` : par le coordinateur (voir plus bas).

## Stratégie de tests

| Domaine                     | Cas                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filières (unit)             | `CI_ACD` : six étapes, ordre 1 à 6, toutes obligatoires, aucune durée, `A_VALIDER`, types suggérés ; `PERSONNALISEE` : `NON_APPLICABLE`, clés `custom_<n>`, type `OTHER`                                                                                                                                                                                                                                                               |
| Transitions (unit, pures)   | table complète des transitions et refus du même statut ; terminer exige les obligatoires précédentes ; étape facultative sautée ; réouverture : motif, refus si étape suivante terminée ; `startedAt` / `completedAt` ; `allowedTransitions`                                                                                                                                                                                           |
| Frais (unit)                | somme des coûts de toutes les étapes ; dossier sans coût = 0 ; décimaux                                                                                                                                                                                                                                                                                                                                                                |
| Service et routes (API)     | création `CI_ACD` (six étapes) et personnalisée (1 à 30) ; `steps` interdit pour `CI_ACD` ; 409 si déjà `EN_COURS` ; dossier clos ouvre un nouveau ; clôture exige les obligatoires ; réouverture de dossier (motif, 409 si autre `EN_COURS`) ; modification refusée (409) sur dossier clos ; ajout et suppression d'étape personnalisée ; audit à chaque changement dont `reopened: true` ; schémas `.strict()` (champ inconnu = 400) |
| Concurrence (API, base)     | deux créations simultanées pour un bien : une réussit, l'autre est un 409 (index unique partiel) — exécuté contre la base jetable, pas en simulation                                                                                                                                                                                                                                                                                   |
| Pièces (API)                | document du même bien accepté ; document d'un autre bien de la même agence, d'une autre agence ou inexistant = 404 ; suppression du document = étape conservée, `documentId` vide                                                                                                                                                                                                                                                      |
| Non-fusion des frais (unit) | le coût de revient et le rendement d'un bien sont identiques avec et sans frais de régularisation ; aucune `PropertyExpense` créée                                                                                                                                                                                                                                                                                                     |
| Permissions (API)           | 403 en écriture sans `PROPERTIES_EDIT`, 403 en lecture sans `PROPERTIES_VIEW`                                                                                                                                                                                                                                                                                                                                                          |
| Alertes (unit)              | étape en retard relancée ; `BLOQUEE`, `TERMINEE` et dossier clos ignorés ; doublon évité (même étape, même échéance) ; échéance repoussée = nouvelle relance ; sans destinataire = `skippedNoRecipient` ; échec isolé ; e-mail simulé                                                                                                                                                                                                  |
| Job (unit)                  | l'alerte est appelée par agence dans son contexte ; l'échec d'une agence n'arrête pas les suivantes                                                                                                                                                                                                                                                                                                                                    |
| Inventaire                  | `routes-inventory.test.ts` (dix routes), `schema-tenant-coverage.test.ts` (deux modèles), `tenant-data-export.registry.test.ts`, `notification-feature-gate.test.ts` (nouvelle clé)                                                                                                                                                                                                                                                    |
| Isolation                   | `npm run test:isolation` : dossier, étape et document de l'agence A lus, modifiés, supprimés avec le contexte de l'agence B = 404 ; liste sans dossier étranger                                                                                                                                                                                                                                                                        |
| Web                         | liste (filtre, `?propertyId=`), création `CI_ACD` avec mention « À valider », création personnalisée, actions limitées par `allowedTransitions`, lecture seule sans bouton de modification, motif exigé à la réouverture, téléversement puis rattachement, total « Frais de régularisation »                                                                                                                                           |
| i18n                        | `npm run i18n:extract` sans clé orpheline ; libellés des étapes `CI_ACD` présents en en et ar                                                                                                                                                                                                                                                                                                                                          |

Poste lent : `npx jest <fichiers> --maxWorkers=2`, jamais deux suites lourdes en parallèle ; un
échec par délai se rejoue seul avant toute conclusion.

## Définition de fini

Tests ciblés verts, `typecheck` sans nouvelle erreur, lint, `check:architecture`,
`routes-inventory`, `schema-tenant-coverage`, `test:isolation`, relecture `code-reviewer` (et
`security-auditor` pour le contrôle d'appartenance des identifiants), `DATA_MODELS.md` à jour
(fait avec la spec), `npm run i18n:extract` (fr clé, en, ar), wiki des fonctionnalités +
`npm run wiki:export` par le coordinateur, `HANDOFF.md` par le coordinateur.

## Sous-fonctionnalités à ajouter au wiki (pour le coordinateur)

Fonctionnalité « Patrimoine » (ou « Gestion du patrimoine » selon le classeur) :

- Dossier de régularisation foncière : création pour un bien (filière Côte d'Ivoire « à valider » ou personnalisée).
- Suivi des étapes : démarrer, terminer dans l'ordre, bloquer, rouvrir avec motif.
- Étapes personnalisées : ajout, renommage, suppression d'une étape non commencée.
- Échéance, notes et frais par étape ; total « Frais de régularisation » (séparé du coût de revient).
- Rattachement d'une pièce du bien à une étape (type de document suggéré par l'étape).
- Clôture, abandon et réouverture d'un dossier (un seul dossier en cours par bien).
- Liste des dossiers fonciers (filtres par statut et par bien) et détail avec progression et retards.
- Relance e-mail d'une étape en retard (administrateurs de l'agence, sans doublon).
- Routes API : `GET …/patrimoine/land-tracks`, `GET/POST …/patrimoine/land-regularizations`,
  `GET/PATCH …/land-regularizations/:id`, `POST …/:id/status`, `POST …/:id/steps`,
  `PATCH/DELETE …/:id/steps/:stepId`, `POST …/:id/steps/:stepId/status`.
- Événement de notification : `LAND_STEP_OVERDUE_ALERT`.
- Permissions : `PROPERTIES_VIEW` (lecture), `PROPERTIES_EDIT` (écriture).

## Risques

- **Valeur juridique** : le risque principal n'est pas technique. La filière `CI_ACD` peut être
  fausse ou incomplète pour certains cas. Mesures : mention « À valider » visible partout,
  étapes figées dans le code et versionnées, aucune durée, aucune affirmation légale dans les
  libellés (voir les questions ouvertes de la spec).
- **Fichiers très partagés** : `schema.prisma` (déjà fait), `app.ts`, `routes-inventory.test.ts`,
  `notification-key-features.ts`, `email-notification-*`, `document-expiry-alert-job.ts`,
  `menu-catalog`, `route-features.ts`, `App.tsx`, catalogues i18n, wiki. Intégrer lot par lot,
  jamais en parallèle sur le même fichier (plan de vague, § 5).
- **Entrée de menu** : le catalogue des menus est partagé et son territoire n'est pas attribué à
  un agent du lot ; à confirmer par le coordinateur, sinon l'écran n'est joignable que par l'URL.
- **Index unique partiel** : Prisma ne le connaît pas ; un futur `prisma migrate dev` pourrait
  proposer de le supprimer. Il est commenté dans le schéma et la migration ; ne jamais accepter
  cette suppression.
- **Course sur « un seul EN_COURS »** : le contrôle de service seul ne suffit pas ; l'index fait foi
  et la conversion de son erreur en `ConflictError` est testée contre une vraie base.
- **Appartenance du document** : le contrôle d'agence seul laisserait rattacher la pièce d'un autre
  bien de la même agence ; un test dédié le verrouille.
- **Libellés traduits et libellés stockés** : le catalogue est stocké en français et traduit à la
  lecture ; modifier un libellé dans `tracks.ts` casse sa traduction (la clé, c'est le texte) :
  relancer `npm run i18n:extract` et reporter les traductions orphelines.
- **Dérive du catalogue** : changer la filière dans le code ne modifie pas les dossiers en cours
  (étapes copiées à la création) ; c'est voulu, mais deux dossiers d'une même filière peuvent
  avoir des étapes différentes selon leur date de création.
- **Alerte en retard et fuseau** : la comparaison d'échéance se fait en UTC ; une échéance
  « aujourd'hui » peut être relancée dès le lendemain UTC. Acceptable pour une relance quotidienne.
- **Client Prisma généré** : le lot change le schéma ; il a ses propres dépendances (`npm ci`,
  pas de jonction) pour ne pas désynchroniser le client partagé.

## Questions ouvertes

Juridiques (détail dans la [spec](./spec.md), section 8) : validité et ordre de la filière
`CI_ACD`, durées légales, autorité qui délivre chaque pièce, frais officiels, équivalents d'autres
pays, valeur probante des copies archivées, terrain nu ou construction, lien avec `legalStatus`.

Produit et technique, à trancher avant ou pendant l'implémentation :

- **Dispense d'étape** : faut-il permettre de marquer une étape d'une filière constante « non
  applicable » (dossier réel où une étape ne s'applique pas) ? Aujourd'hui l'agence abandonne et
  ouvre un dossier personnalisé.
- **Statut du bien** : le dossier `TERMINEE` ne modifie pas le bien (ni son type de titre, ni un
  futur `legalStatus`) ; l'agence met la fiche à jour à la main.
- **Transitions directes du dossier** : seules `EN_COURS → TERMINEE | ABANDONNEE` et la
  réouverture sont prévues ; un passage direct `TERMINEE ↔ ABANDONNEE` est refusé. À confirmer
  avec le coordinateur et les agents API.
- **Destinataires de l'alerte** : administrateurs de l'agence seulement ; faut-il aussi le
  responsable du bien ou le propriétaire ?
- **Entrée dans l'onglet Patrimoine du bien** : le lien vers les dossiers du bien est laissé à un
  lot ultérieur (`PropertyPatrimoineTab.tsx` intouchable ici).

## Coordination avec les autres lots

- **A1 (spec 029)**, **A2 (spec 030)** et **A3 (spec 031)** : horodatages de migration distincts
  (`20261007130000` pour ce lot) ; fichiers partagés intégrés l'un après l'autre. Ce lot ne touche ni
  `yield.ts` (A1), ni le plan de trésorerie (A2), ni `notifications.ts` ni `lib/secure-links` (A3) : il
  duplique la résolution des destinataires d'agence au lieu de modifier `notifications.ts`.
- **B1 (spec 032)** et **B3 (spec 034)** : même vague ; mêmes fichiers partagés (clés de
  notification, `app.ts`, catalogues, wiki) : ne pas intégrer en parallèle.
- **Chantier multi-actifs** (specs 023 à 026, ADR-005, PR en cours) : le futur `legalStatus` d'un
  actif et la consolidation des frais attendent cette fusion. Ce lot n'y touche pas et ne crée
  aucune dépendance de schéma vers `Asset`.
- **Lot ultérieur « coût de revient »** : consommera `feesXof` (ou les `costXof` d'étapes) ; l'API
  expose déjà le total séparé, sans le fusionner.
