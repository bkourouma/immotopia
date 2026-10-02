# Spécification 033 — Suivi d'avancement de la régularisation foncière

**Branche** : `feat/patrimoine-foncier` (lot B2 de la feuille de route
[PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md](../../docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md))
**Créée** : 2026-10-01
**Statut** : en cours
**Portée** : capacité 4 du plan (suivi d'avancement foncier : attestation villageoise,
ACD, titre foncier), **sans intégration au coût de revient** (lot ultérieur).

Références : [plan.md](./plan.md) · modèles `LandRegularization` et `LandRegularizationStep`
dans [DATA_MODELS.md](../../docs/architecture/DATA_MODELS.md) · module patrimoine d'origine :
[spec 015](../015-patrimoine-module/spec.md).

> **Avertissement juridique.** Cette spécification ne contient **aucune affirmation de
> droit foncier**. La filière `CI_ACD` (étapes et ordre) est une **hypothèse de travail**
> fournie par la feuille de route, marquée `A_VALIDER` dans le produit tant qu'un juriste
> local ne l'a pas confirmée. Les questions à lui poser sont listées en section 8.

## 1. Synthèse

Un bien sans titre foncier définitif passe par une suite de démarches administratives
longues. Aujourd'hui, ImmoTopia ne sait que ranger la pièce finale (type de document
`TITLE_DEED` ou `LAND_CONCESSION`) et un champ « type de titre » : l'agence suit
l'avancement dans des tableurs ou de tête, sans échéance ni alerte.

Le lot livre un **dossier de régularisation foncière** par bien :

- une **filière** d'étapes ordonnées : la filière constante `CI_ACD` (Côte d'Ivoire,
  affichée « à faire valider par un juriste local ») ou une filière **personnalisée**
  dont l'agence saisit les étapes ;
- pour chaque étape : un statut, une échéance, les **frais engagés** (XOF), des notes et
  une **pièce rattachée** choisie parmi les documents du même bien ;
- un **suivi** : progression, étape en cours, étapes en retard, total des **frais de
  régularisation** (chiffre séparé, jamais fusionné au coût de revient ni au rendement) ;
- une **piste d'audit** de chaque changement d'état, y compris les réouvertures
  (avec motif) ;
- une **relance par e-mail** à l'agence quand une étape dépasse son échéance, une seule
  fois par échéance.

Le lot ne calcule aucun délai légal, ne soumet rien à une administration et n'ajoute
aucun type de document.

## 2. Scénarios utilisateur

### US1 — Ouvrir un dossier « Côte d'Ivoire (ACD) » sur un bien (P1)

1. **Étant donné** un bien de l'agence sans dossier en cours et un gestionnaire ayant
   `PROPERTIES_EDIT`, **quand** il choisit la filière `CI_ACD` et valide, **alors** un dossier
   `EN_COURS` est créé avec les six étapes de la filière dans l'ordre (toutes `A_FAIRE`),
   la réponse est un `201` et un événement `LAND_REGULARIZATION_CREATED` est journalisé.
2. **Étant donné** ce dossier ouvert, **quand** l'écran l'affiche, **alors** la filière porte
   la mention « À valider » et la note « filière à faire valider par un juriste local » :
   l'écran ne présente pas la filière comme certaine.
3. **Étant donné** une demande avec `steps` pour la filière `CI_ACD`, **quand** elle est
   envoyée, **alors** elle est refusée (400) : les étapes de cette filière sont constantes.

### US2 — Suivre et terminer les étapes dans l'ordre (P1)

1. **Étant donné** un dossier `CI_ACD` dont aucune étape n'est terminée, **quand** le
   gestionnaire passe l'étape 1 à `EN_COURS` puis à `TERMINEE`, **alors** `startedAt` est
   posé au premier passage, `completedAt` à la fin, la progression passe à 1 étape sur 6
   (17 %) et `LAND_STEP_STATUS_CHANGED` est journalisé à chaque passage.
2. **Étant donné** que l'étape 1 (obligatoire) n'est pas `TERMINEE`, **quand** le
   gestionnaire tente de terminer l'étape 2, **alors** la demande est refusée (409) avec un
   message clair : les étapes obligatoires précédentes doivent être terminées d'abord.
3. **Étant donné** une étape `EN_COURS`, **quand** le gestionnaire la marque `BLOQUEE`, avec
   ou sans motif, **alors** elle est bloquée et pourra repasser `EN_COURS` ou `A_FAIRE`.
4. **Étant donné** une étape, **quand** la même valeur de statut est renvoyée, **alors** la
   demande est refusée (400).
5. **Étant donné** que toutes les étapes obligatoires sont `TERMINEE`, **quand** le
   gestionnaire passe le dossier à `TERMINEE`, **alors** il est clôturé (`endedAt`
   renseigné) ; **étant donné** qu'il en reste une, **alors** le refus est un 409.

### US3 — Rouvrir une étape ou un dossier avec un motif tracé (P1)

1. **Étant donné** une étape `TERMINEE` dont aucune étape suivante n'est `TERMINEE`,
   **quand** le gestionnaire la rouvre (`EN_COURS`) en indiquant un motif, **alors**
   `completedAt` est remis à vide et l'événement d'audit porte `reopened: true` et le motif.
2. **Étant donné** la même réouverture **sans motif**, **alors** la demande est refusée (400).
3. **Étant donné** qu'une étape d'ordre supérieur est déjà `TERMINEE`, **quand** le
   gestionnaire tente de rouvrir l'étape, **alors** la demande est refusée (409).
4. **Étant donné** un dossier `TERMINEE` ou `ABANDONNEE`, **quand** le gestionnaire le
   rouvre avec un motif, **alors** il repasse `EN_COURS` et `LAND_REGULARIZATION_STATUS_CHANGED`
   est journalisé avec le motif ; sans motif : 400.

### US4 — Un seul dossier en cours par bien (P1)

1. **Étant donné** un bien qui a déjà un dossier `EN_COURS`, **quand** un second est créé
   pour ce bien, **alors** la réponse est un 409 (conflit).
2. **Étant donné** deux créations simultanées pour le même bien, **alors** l'une réussit et
   l'autre échoue : la règle tient aussi au niveau de la base (index unique partiel), pas
   seulement dans le service.
3. **Étant donné** un dossier `TERMINEE` ou `ABANDONNEE`, **quand** un nouveau dossier est
   créé sur le même bien, **alors** c'est accepté : l'historique des dossiers est conservé.
4. **Étant donné** un dossier clos et un autre dossier `EN_COURS` sur le même bien,
   **quand** le gestionnaire tente de rouvrir le dossier clos, **alors** la demande est
   refusée (409).

### US5 — Rattacher une pièce du même bien à une étape (P1)

1. **Étant donné** une étape et un document du même bien (déjà téléversé dans les
   documents du bien), **quand** le gestionnaire le rattache, **alors** l'étape affiche le
   nom et le type du document.
2. **Étant donné** l'étape « Arrêté de concession définitive (ACD) », **quand** le
   gestionnaire téléverse une pièce depuis l'étape, **alors** le type de document proposé est
   `LAND_CONCESSION` (types suggérés des autres étapes : voir FR-006) et le document est
   téléversé par le service existant des documents de bien avant d'être rattaché.
3. **Étant donné** un `documentId` d'une autre agence, d'un autre bien ou inexistant,
   **quand** il est rattaché, **alors** la réponse est la même 404 qu'un objet inexistant.
4. **Étant donné** un document rattaché que l'agence supprime, **alors** l'étape reste
   valide et ne référence plus de pièce (la relation passe à vide, l'étape n'est pas supprimée).

### US6 — Saisir les frais et voir le total « frais de régularisation » (P1)

1. **Étant donné** une étape, **quand** le gestionnaire saisit un coût (nombre positif ou
   nul, en XOF), **alors** la fiche du dossier affiche le total des coûts de **toutes** les
   étapes, étiqueté « Frais de régularisation ».
2. **Étant donné** un coût négatif, **alors** la demande est refusée (400).
3. **Étant donné** des frais saisis, **quand** l'onglet Patrimoine du bien ou la vue de
   performance sont affichés, **alors** le coût de revient et les rendements sont
   **inchangés** : les frais restent un chiffre à part (leur intégration est un lot ultérieur).

### US7 — Filière personnalisée (P2)

1. **Étant donné** un bien, **quand** le gestionnaire choisit la filière personnalisée et
   saisit de 1 à 30 étapes (libellé, caractère obligatoire, échéance facultative), **alors** le
   dossier est créé avec ces étapes dans l'ordre saisi, aucune filière n'est « à valider » (la
   mention est « Non applicable ») et chaque étape a une clé `custom_<n>`.
2. **Étant donné** une demande personnalisée sans étape, ou avec plus de 30, **alors** elle est
   refusée (400).
3. **Étant donné** un dossier personnalisé `EN_COURS`, **quand** le gestionnaire ajoute une
   étape, en renomme une, change son caractère obligatoire ou supprime une étape `A_FAIRE`
   sans coût ni pièce, **alors** le changement est accepté ; sur un dossier `CI_ACD` (ajout,
   renommage, caractère obligatoire) ou pour la suppression d'une étape avancée, avec coût ou
   avec pièce, il est refusé.

### US8 — Relance par e-mail d'une étape en retard (P2)

1. **Étant donné** une étape `A_FAIRE` ou `EN_COURS` d'un dossier `EN_COURS` dont
   l'échéance est dépassée, **quand** l'alerte quotidienne tourne, **alors** les
   administrateurs actifs de l'agence reçoivent un e-mail (clé `LAND_STEP_OVERDUE_ALERT`) qui
   nomme le bien, la filière, l'étape, l'échéance et le retard en jours, avec un lien vers le dossier.
2. **Étant donné** la même étape toujours en retard le lendemain, **alors** aucun doublon
   n'est envoyé ; **étant donné** que l'échéance est repoussée puis de nouveau dépassée,
   **alors** une nouvelle relance part (le doublon se juge par étape **et** échéance).
3. **Étant donné** une étape `TERMINEE` ou `BLOQUEE`, ou un dossier clos, **alors** aucune
   relance ne part.
4. **Étant donné** une agence sans administrateur actif joignable, **alors** rien n'est
   envoyé et le cas est compté à part (`skippedNoRecipient`).

### US9 — Isolation entre agences (P1)

1. **Étant donné** un dossier, une étape ou un document de l'agence A, **quand** un
   utilisateur de l'agence B les demande par identifiant (lecture, modification, suppression,
   changement de statut, rattachement de pièce), **alors** il reçoit la même 404 qu'un objet
   inexistant.
2. **Étant donné** un `propertyId` d'une autre agence à la création, **alors** même 404.
3. **Étant donné** la liste des dossiers, **alors** elle ne contient que ceux de l'agence
   courante.

### US10 — Lecture seule et modification (P1)

1. **Étant donné** un utilisateur qui a `PROPERTIES_VIEW` sans `PROPERTIES_EDIT`, **quand**
   il ouvre la liste ou le détail d'un dossier, **alors** il voit tout mais aucun bouton de
   modification n'est affiché et chaque route d'écriture répond 403.
2. **Étant donné** un utilisateur sans `PROPERTIES_VIEW`, **alors** la lecture répond 403
   et l'entrée n'apparaît pas dans l'interface.
3. **Étant donné** un dossier `TERMINEE` ou `ABANDONNEE`, **quand** un utilisateur autorisé
   tente de modifier une étape ou le dossier, **alors** la demande est refusée (409), à
   l'exception du changement de statut du dossier lui-même (réouverture, US3).

## 3. Exigences fonctionnelles

### Modèle de données

- **FR-001** : deux modèles, rattachés à l'agence par un `tenantId` direct :
  - `LandRegularization` (un dossier par bien et par tentative) : `propertyId`, `track`
    (`CI_ACD` ou `PERSONNALISEE`), `status` (`EN_COURS`, `TERMINEE`, `ABANDONNEE`),
    `startDate`, `endedAt`, `notes`, `createdByUserId` ;
  - `LandRegularizationStep` : `regularizationId`, `stepKey`, `sortOrder`, `label`,
    `required`, `status` (`A_FAIRE`, `EN_COURS`, `TERMINEE`, `BLOQUEE`), `startedAt`,
    `completedAt`, `dueDate`, `costXof` (décimal 14,2, défaut 0), `notes`, `documentId`.
    Détail des champs, des index et des règles d'intégrité : DATA_MODELS.md.
- **FR-002** : **un seul dossier `EN_COURS` par bien** : vérifié dans le service (409 clair)
  **et** garanti par un index unique partiel en base (`land_regularizations_one_active_per_property_key`,
  exprimé en SQL uniquement, car Prisma ne sait pas l'écrire). Une violation de l'index à
  la création concurrente est convertie en la même erreur 409.
- **FR-003** : `(regularizationId, sortOrder)` est unique ; l'ordre des étapes est celui de
  `sortOrder`, de 1 à N sans trou à la création. Supprimer une étape personnalisée ne renumérote pas
  les autres (l'ordre relatif reste le même).
- **FR-004** : la suppression d'un bien supprime ses dossiers et leurs étapes (cascade) ;
  la suppression d'un document rattaché vide `documentId` (`SetNull`) sans supprimer l'étape ;
  la suppression de l'utilisateur créateur vide `createdByUserId`.
- **FR-005** : la migration est **additive** (`20261007130000_patrimoine_regularisation_fonciere`) :
  trois types, deux tables, aucune donnée existante touchée.

### Filières constantes versionnées

- **FR-006** : les filières sont des **constantes versionnées dans le code**
  (`lib/patrimoine/land/tracks.ts`), pas des données d'agence. Chaque filière déclare : clé,
  pays (`CI` ou aucun), libellé, `validationStatus` (`A_VALIDER` ou `NON_APPLICABLE`), note de
  validation et liste d'étapes (clé, ordre, libellé, caractère obligatoire, durée indicative,
  type de document suggéré).
  - `CI_ACD` : pays `CI`, `validationStatus: 'A_VALIDER'`, note « filière à faire valider par un
    juriste local » ; six étapes, **toutes obligatoires, sans durée indicative** (aucune durée
    n'est inventée) :

    | Ordre | Clé                          | Libellé                               | Type de document suggéré |
    | ----- | ---------------------------- | ------------------------------------- | ------------------------ |
    | 1     | `attestation_villageoise`    | Attestation villageoise               | `OTHER`                  |
    | 2     | `dossier_technique_geometre` | Dossier technique du géomètre         | `PLAN`                   |
    | 3     | `bornage_contradictoire`     | Bornage contradictoire                | `PLAN`                   |
    | 4     | `demande_acd`                | Demande d'ACD au ministère            | `OTHER`                  |
    | 5     | `acd`                        | Arrêté de concession définitive (ACD) | `LAND_CONCESSION`        |
    | 6     | `titre_foncier`              | Titre foncier                         | `TITLE_DEED`             |

  - `PERSONNALISEE` : aucune étape prédéfinie ; clé d'étape `custom_<n>` ; type de document
    suggéré `OTHER` ; `validationStatus: 'NON_APPLICABLE'`.
- **FR-007** : la filière est **versionnée par le dépôt** : un changement d'étapes est une
  modification de code, relue et testée. Un dossier existant **garde les étapes copiées à sa
  création** (`label`, `sortOrder`, `required` stockés par étape) : modifier la constante
  plus tard ne réécrit pas les dossiers en cours.
- **FR-008** : le libellé d'une étape du catalogue est stocké **en français** (clé de
  traduction) et traduit à la lecture par `t()` selon la langue de la requête ; le libellé
  d'une étape personnalisée est le texte saisi, rendu tel quel.
- **FR-009** : `GET …/land-tracks` expose le catalogue (filière, pays, libellé,
  `validationStatus`, `validationNote` traduite, étapes). **L'écran affiche le statut
  `A_VALIDER`** (étiquette « À valider » et note) partout où la filière apparaît : création,
  liste, détail.

### Règles de transition

- **FR-010** : transitions d'étape (fonction pure, source unique, qui calcule aussi
  `allowedTransitions` renvoyé à l'écran) :
  `A_FAIRE → EN_COURS | BLOQUEE | TERMINEE` ; `EN_COURS → TERMINEE | BLOQUEE | A_FAIRE` ;
  `BLOQUEE → EN_COURS | A_FAIRE` ; `TERMINEE → EN_COURS` (réouverture). Même statut : 400.
- **FR-011** : **terminer** une étape exige que toutes les étapes `required` d'ordre
  inférieur soient `TERMINEE` ; sinon 409, avec un message clair en français traduit par
  `t()`. Une étape non obligatoire peut être sautée.
- **FR-012** : **rouvrir** une étape `TERMINEE` exige un `reason` (400 sinon), est refusé (409)
  si une étape d'ordre supérieur est `TERMINEE`, remet `completedAt` à vide et marque
  l'événement d'audit `reopened: true`.
- **FR-013** : `startedAt` est posé au premier passage à `EN_COURS` ou `TERMINEE` (et jamais
  effacé) ; `completedAt` est posé au passage à `TERMINEE`.
- **FR-014** : transitions du dossier, par `POST …/status` :
  `EN_COURS → TERMINEE | ABANDONNEE` ; `TERMINEE | ABANDONNEE → EN_COURS`. Passer à `TERMINEE`
  exige que toutes les étapes `required` soient `TERMINEE` (409 sinon). La réouverture exige un
  `reason` et l'absence d'un autre dossier `EN_COURS` sur le bien (409). `endedAt` est renseigné
  à la clôture.
- **FR-015** : toute modification d'étape ou de dossier (champs, étapes ajoutées ou supprimées,
  statut d'étape, pièce, frais) est refusée (409) quand le dossier n'est pas `EN_COURS`, sauf
  `POST …/status` du dossier.

### Contenu des étapes, pièces et frais

- **FR-016** : champs modifiables d'une étape : `dueDate` (ou vide), `costXof` (≥ 0), `notes`
  (ou vide), `documentId` (ou vide) pour toutes les étapes ; `label` et `required` pour les
  seules étapes personnalisées. Ajout d'une étape : filière personnalisée seulement, en fin
  de liste, dossier `EN_COURS`, dans la limite de 30 étapes au total. Suppression : étape
  personnalisée, `A_FAIRE`, sans coût ni pièce, et jamais la dernière étape du dossier.
  Passer `required` de faux à vrai est refusé (409) si une étape d'ordre supérieur est déjà `TERMINEE`.
  Toute écriture sur un dossier prend un verrou de ligne (`SELECT … FOR UPDATE`) pour que deux
  modifications simultanées ne contournent pas les règles d'ordre.
- **FR-017** : **pièces par les types de document existants.** Aucun type n'est ajouté à
  `PropertyDocumentType`. L'étape donne le **contexte** : l'API renvoie `suggestedDocumentType`
  parmi `TITLE_DEED`, `LAND_CONCESSION`, `PLAN`, `TAX_DOCUMENT` et `OTHER`
  (FR-006), l'écran préselectionne ce type au téléversement. Le téléversement passe par le service
  existant des documents de bien (`POST /tenants/:tenantId/properties/:id/documents`), puis
  l'écran rattache le document par `PATCH …/steps/:stepId` avec `documentId`. Rien n'oblige le
  type du document à égaler le type suggéré : c'est une suggestion.
- **FR-018** : un `documentId` doit désigner un `PropertyDocument` de la **même agence ET du même
  bien** que le dossier ; sinon la même 404 qu'un objet inexistant.
- **FR-019** : `feesXof` d'un dossier est la **somme des `costXof` de toutes ses étapes**
  (y compris terminées, bloquées, et d'un dossier clos). Ce chiffre est affiché séparément
  sous le nom « Frais de régularisation ».
- **FR-020** : **les frais ne sont pas fusionnés** au coût de revient ni au rendement : aucun
  module de calcul existant (`lib/patrimoine/yield.ts`, `queries.ts`, consolidation, exports)
  n'est modifié, aucune dépense `PropertyExpense` n'est créée. L'intégration au coût de revient
  est un **lot ultérieur** (section 7).

### Progression et retards

- **FR-021** : la progression d'un dossier est calculée à la lecture, jamais stockée :
  `total`, `required`, `completed`, `completedRequired`, `percent` (étapes `TERMINEE` ÷ total × 100,
  arrondi). `currentStepLabel` est le libellé de la première étape non terminée ; `nextDueDate`
  est la plus proche échéance parmi les étapes non terminées.
- **FR-022** : une étape est **en retard** (`isOverdue`) si elle est `A_FAIRE` ou `EN_COURS`,
  que son `dueDate` est antérieur au **début du jour courant (00:00 UTC)** et que le dossier est
  `EN_COURS` ; une étape due aujourd'hui n'est donc pas en retard. `overdueSteps` les compte.
  La même règle (`isOverdueAt`) sert à l'alerte, qui exprime le retard en jours calendaires UTC (≥ 1).

### Audit

- **FR-023** : événements `logAuditEvent` : `LAND_REGULARIZATION_CREATED`,
  `LAND_REGULARIZATION_STATUS_CHANGED`, `LAND_STEP_STATUS_CHANGED`, `LAND_STEP_UPDATED`,
  `PATRIMOINE_LAND_STEP_OVERDUE_ALERT_SENT` (marque anti-doublon de l'alerte, FR-026). Le
  payload porte les identifiants, les statuts avant et après, `reopened` et le motif ;
  jamais le contenu libre des notes.

### Alerte

- **FR-024** : `alertOverdueLandSteps(tenantId, { now? })` (`lib/patrimoine/land-alerts.ts`)
  sélectionne les étapes `A_FAIRE` ou `EN_COURS` dont le `dueDate` est antérieur à `now`, dans un
  dossier `EN_COURS` de l'agence. Une étape `BLOQUEE` n'est pas relancée.
- **FR-025** : destinataires : les **administrateurs actifs de l'agence** (même résolution que
  les alertes d'agence existantes, par exemple l'échéance d'emprunt). Clé e-mail
  `LAND_STEP_OVERDUE_ALERT`, rattachée à la fonctionnalité d'abonnement `PATRIMOINE`, désactivable
  et personnalisable par agence comme les autres événements. Variables du modèle :
  `agencyName`, `propertyReference`, `trackLabel`, `stepLabel`, `dueDate`, `daysOverdue`,
  `regularizationUrl`.
- **FR-026** : anti-doublon par `AuditLog` : événement
  `PATRIMOINE_LAND_STEP_OVERDUE_ALERT_SENT`, `entityType = 'LandRegularizationStep'`,
  `entityId = <stepId>::<AAAA-MM-JJ de l'échéance>`. Même retour que l'alerte d'échéance
  d'emprunt : `{ matched, sent, skippedNoRecipient, skippedAlreadySent, failed }`.
- **FR-027** : le message ne contient aucun montant ni donnée personnelle ; les valeurs
  injectées dans le modèle HTML sont échappées ; aucun envoi réel pendant le
  développement du lot (les tests utilisent des simulateurs, jamais un fournisseur réel).

### API

- **FR-028** : routes sous `/api/tenants/:tenantId/patrimoine/` (préfixe déjà couvert par la
  fonctionnalité d'abonnement `PATRIMOINE`) :

  | Route                                                               | Permission        | Effet                                          |
  | ------------------------------------------------------------------- | ----------------- | ---------------------------------------------- |
  | `GET /land-tracks`                                                  | `PROPERTIES_VIEW` | catalogue des filières                         |
  | `GET /land-regularizations?propertyId=&status=`                     | `PROPERTIES_VIEW` | liste (résumés)                                |
  | `GET /land-regularizations/:regularizationId`                       | `PROPERTIES_VIEW` | détail                                         |
  | `POST /land-regularizations`                                        | `PROPERTIES_EDIT` | crée un dossier ; 201 ; 409 si déjà `EN_COURS` |
  | `PATCH /land-regularizations/:regularizationId`                     | `PROPERTIES_EDIT` | `notes`, `startDate`                           |
  | `POST /land-regularizations/:regularizationId/status`               | `PROPERTIES_EDIT` | clôture, abandon, réouverture (FR-014)         |
  | `POST /land-regularizations/:regularizationId/steps`                | `PROPERTIES_EDIT` | ajoute une étape personnalisée                 |
  | `PATCH /land-regularizations/:regularizationId/steps/:stepId`       | `PROPERTIES_EDIT` | champs d'étape (FR-016)                        |
  | `POST /land-regularizations/:regularizationId/steps/:stepId/status` | `PROPERTIES_EDIT` | change le statut d'une étape (FR-010 à FR-013) |
  | `DELETE /land-regularizations/:regularizationId/steps/:stepId`      | `PROPERTIES_EDIT` | supprime une étape personnalisée (FR-016)      |

  Aucune nouvelle permission. Enveloppe de réponse : celle de `controllers/patrimoine-controller.ts`.

- **FR-029** : corps de création : `{ propertyId, track, startDate?, notes?, steps?: [{ label,
required?, dueDate? }] }` ; `steps` est **obligatoire** (1 à 30) pour `PERSONNALISEE`,
  **interdit** pour `CI_ACD`. Tous les schémas zod sont `.strict()` et appelés avec `.parse()`
  en tête de contrôleur ; un champ inconnu est refusé (400). Le motif d'un changement de
  statut (`reason`) est limité à 500 caractères.
- **FR-030** : formes de réponse (dates en ISO, montants en nombres) :
  - **Résumé** : `id`, `propertyId`, `property { id, internalReference, title }`, `track`,
    `trackLabel`, `validationStatus`, `status`, `startDate`, `endedAt`, `notes`,
    `progress { total, required, completed, completedRequired, percent }`, `feesXof`,
    `nextDueDate`, `overdueSteps`, `currentStepLabel`, `createdAt`, `updatedAt` ;
  - **Détail** : résumé + `validationNote` et `steps` ;
  - **Étape** : `id`, `stepKey`, `order`, `label`, `required`, `status`, `startedAt`,
    `completedAt`, `dueDate`, `costXof`, `notes`, `documentId`, `document { id, fileName,
documentType }` ou `null`, `suggestedDocumentType`, `isOverdue`, `allowedTransitions`.
- **FR-031** : tout identifiant (`propertyId`, `regularizationId`, `stepId`, `documentId`)
  est vérifié comme appartenant à l'agence (et le document au même bien) avant lecture ou
  écriture ; la même `NotFoundError` sert l'objet inexistant et l'objet d'une autre agence.
  `stepId` doit de plus appartenir au dossier de l'URL. Le bien est contrôlé par le garde de
  `utils/property-tenant-guard.ts`. Aucune réponse n'expose `User` complet : le créateur
  n'est pas renvoyé, ou seulement par `select` explicite.

### Web

- **FR-032** : deux écrans, en `React.lazy`, sous la fonctionnalité patrimoine :
  `/tenant/:tenantId/patrimoine/land` (liste des dossiers, filtres par statut ; accepte
  `?propertyId=` pour filtrer par bien) et `/tenant/:tenantId/patrimoine/land/:regularizationId`
  (détail : frise des étapes dans l'ordre, progression, total « Frais de régularisation »,
  retards, pièces, actions autorisées). Un point d'entrée dans le menu patrimoine, visible avec
  `PROPERTIES_VIEW`. Le lien depuis la fiche d'un bien est **hors périmètre** de ce lot
  (`PropertyPatrimoineTab.tsx` n'est pas modifié) ; l'écran liste filtré par `?propertyId=` le remplace.
- **FR-033** : l'écran n'affiche une action que si l'utilisateur a `PROPERTIES_EDIT` **et**
  que le serveur la déclare permise (`allowedTransitions`) ; le serveur reste l'autorité.
  Le statut `A_VALIDER` de la filière est toujours visible (FR-009).
- **FR-034** : réseau via `utils/api-client` et `config/api`, service dédié du dossier foncier
  (pas dans `patrimoine-service.ts`, hors territoire), types du contrat, pas de
  `dangerouslySetInnerHTML`.
- **FR-035** : tout libellé visible passe par `t()` (français = clé, en, ar) ; marges en
  propriétés logiques (`ms-`, `margin-inline-start`, `align: 'end'`), jamais `ml-` ; les
  montants en XOF et les dates suivent les formateurs existants.

### Transverse

- **FR-036** : `routes-inventory.test.ts` couvre les dix routes ; `schema-tenant-coverage.test.ts`
  couvre les deux modèles (`tenantId` direct, y compris sur l'étape) ; l'étanchéité de bout
  en bout est vérifiée par `npm run test:isolation`.
- **FR-037** : l'export de données d'une agence inclut les deux modèles (il est dérivé du
  schéma et ne demande aucune exclusion : aucun secret n'est stocké).

## 4. Entités clés

- **`LandRegularization`** (nouveau) : un dossier, rattaché à `Tenant` et `Property`.
- **`LandRegularizationStep`** (nouveau) : une étape, rattachée à `Tenant`, à son dossier
  et, facultativement, à un `PropertyDocument`.
- **Filière** (constante de code, pas une table) : catalogue d'étapes de `CI_ACD` et de
  `PERSONNALISEE`.
- **`Property`** (existant, inchangé) : bien visé ; son identifiant, sa référence interne et son titre
  sont repris dans le résumé.
- **`PropertyDocument`** (existant, inchangé) : pièce rattachée ; types réutilisés tels quels.
- **`AuditLog`** (existant) : journal des changements et marque anti-doublon de l'alerte.
- **Notification e-mail `LAND_STEP_OVERDUE_ALERT`** (nouvelle clé) : relance d'agence.

## 5. Hypothèses

- Les étapes, leur ordre et leur caractère obligatoire pour `CI_ACD` sont ceux de la
  feuille de route, **repris sans vérification juridique** ; ils sont présentés comme
  « à valider » jusqu'à confirmation (section 8).
- Toutes les étapes de `CI_ACD` sont modélisées **obligatoires et séquentielles** : c'est
  un choix de conception du suivi (ne pas oublier une étape), pas une règle de droit. Il
  peut devenir inadapté si une étape est dispensée dans un cas réel : l'agence peut alors
  abandonner le dossier et ouvrir un dossier personnalisé, faute d'une dispense par étape (point ouvert).
- Aucune durée indicative n'est affichée : le champ existe dans le contrat (`indicativeDurationDays`)
  mais reste vide pour `CI_ACD`.
- Un bien peut avoir **plusieurs dossiers dans le temps** (une tentative abandonnée puis
  une nouvelle), jamais deux `EN_COURS` à la fois.
- L'agence est seule juge d'avancement : le produit n'interroge aucune administration et ne
  vérifie pas l'authenticité des pièces rattachées.
- Les frais sont en XOF, comme le reste du module patrimoine ; pas de conversion de devise.
- Les administrateurs actifs de l'agence sont les destinataires de l'alerte (pas le
  propriétaire du bien) ; un envoi au propriétaire ou par WhatsApp n'est pas prévu.
- Le contrôle de retard se fait au quotidien (job existant), pas en temps réel.
- Les notes et les libellés d'étapes personnalisées sont du texte libre de l'agence : ils ne
  sont ni traduits ni vérifiés.

## 6. Critères de succès

- **SC-001** : créer un dossier `CI_ACD` sur un bien produit exactement six étapes dans
  l'ordre du tableau FR-006, toutes `A_FAIRE`, et une progression à 0 %.
- **SC-002** : sur un jeu de séquences, 100 % des tentatives de terminer une étape
  alors qu'une étape obligatoire précédente n'est pas terminée sont refusées (409), et
  100 % des séquences ordonnées aboutissent.
- **SC-003** : 100 % des réouvertures (étape ou dossier) sans motif sont refusées (400) ;
  100 % des réouvertures acceptées produisent un événement d'audit avec le motif.
- **SC-004** : pour un même bien, deux créations simultanées donnent exactement un dossier
  `EN_COURS` (test de concurrence contre la base, pas seulement un test unitaire).
- **SC-005** : pour tout dossier, `feesXof` est égal à la somme des coûts des étapes, et le coût de
  revient et le rendement du bien sont identiques avec et sans frais de régularisation (test de
  non-régression).
- **SC-006** : 100 % des identifiants d'une autre agence (dossier, étape, bien, document)
  reçoivent la même 404 qu'un identifiant inexistant (`test:isolation`) ; un document d'un autre bien de la
  **même** agence est aussi refusé.
- **SC-007** : sur trois passages quotidiens successifs avec la même échéance, 1 seul e-mail
  par étape en retard et par agence ; une échéance repoussée puis dépassée en produit un
  nouveau.
- **SC-008** : 100 % des routes d'écriture répondent 403 sans `PROPERTIES_EDIT`, et
  100 % des routes de lecture 403 sans `PROPERTIES_VIEW`.
- **SC-009** : la mention « À valider » est affichée sur 100 % des écrans montrant une filière
  `CI_ACD` (création, liste, détail).
- **SC-010** : typecheck sans nouvelle erreur, lint, `check:architecture`,
  `routes-inventory`, `schema-tenant-coverage`, `test:isolation` verts ; catalogues `i18n`
  complets (fr, en, ar) ; wiki des fonctionnalités à jour.

## 7. Hors périmètre

- **Intégration au coût de revient** : les frais restent un chiffre séparé ; leur rattachement au
  prix de revient, aux dépenses et au rendement est un lot ultérieur, à concevoir avec le
  chantier multi-actifs.
- **Filières d'autres pays** : seule `CI_ACD` est fournie. **Aucune filière Mali** n'est
  créée (la feuille de route la mentionne pour le fiscal, pas ici). La filière personnalisée
  couvre les autres cas sans prétendre qu'ils sont valides.
- **Calcul de délais légaux** : aucun délai, aucune date butoir réglementaire, aucune
  durée indicative n'est calculée ou affichée.
- **Export** (PDF, Excel, dossier bancaire) du dossier foncier.
- **Notification du propriétaire ou par WhatsApp** de l'avancement.
- **Lien depuis la fiche du bien** (onglet Patrimoine) et indicateur de statut foncier dans
  les listes de biens.
- **Dépôt de dossier auprès d'une administration** et vérification des pièces.
- **Dispense ou saut d'étape d'une filière constante** : toutes les étapes de `CI_ACD` sont
  obligatoires ; seule une étape personnalisée peut être non obligatoire.
- **Modèles de courrier ou de formulaire** officiels.

## 8. Questions juridiques ouvertes

Rien de ce qui suit n'est établi dans ce dépôt. Chaque point est à confirmer par un juriste
local (ou un notaire) **avant** de retirer la mention `A_VALIDER`.

1. **Validité et ordre de la filière `CI_ACD`** : les six étapes sont-elles les bonnes, dans
   cet ordre, pour tous les cas ? L'attestation villageoise est-elle un préalable ou une pièce
   parmi d'autres ? Le bornage contradictoire précède-t-il toujours la demande d'ACD ?
2. **Durées légales** : existe-t-il des délais réglementaires (instruction, publication,
   recours) à afficher ? Aucun n'est modélisé ; les ajouter exigerait leur source.
3. **Qui délivre quelle pièce** : l'autorité de chaque étape (village, géomètre, ministère,
   conservation foncière) et la forme de la pièce attendue ; ce lot ne nomme aucun organisme.
4. **Frais officiels** : y a-t-il des barèmes (droits, taxes, honoraires de géomètre) à
   proposer en aide à la saisie ? Aujourd'hui l'agence saisit librement le montant.
5. **Équivalents d'autres pays** : existe-t-il des filières comparables (hors Côte d'Ivoire),
   avec quelles étapes ? Aucune n'est supposée.
6. **Valeur probante des pièces archivées** : une copie numérique téléversée dans ImmoTopia
   a-t-elle une valeur ? L'application n'en prétend aucune et ne remplace pas l'original.
7. **Régularisation d'une construction et d'un terrain nu** : les étapes diffèrent-elles
   (permis, certificat de conformité…) ? Le dossier est aujourd'hui rattaché à un bien sans
   distinguer ces cas.
8. **Lien avec le futur `legalStatus`** du chantier multi-actifs (specs 023 à 026, ADR-005) :
   le statut juridique d'un actif doit-il être **déduit** de l'état du dossier (par exemple
   « titre foncier obtenu »), **saisi** à part, ou les deux ? Ce lot ne modifie pas le statut
   d'un bien ; la réponse conditionne le lot suivant.
