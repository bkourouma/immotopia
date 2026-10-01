# Spécification 032 — Assurances, sinistres et carnet d'entretien

**Branche** : `feat/patrimoine-assurances` (lot B1 de la feuille de route
[PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md](../../docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md))
**Créée** : 2026-10-01
**Statut** : en cours
**Portée** : capacité 13 du plan (sinistres, assurances, carnet d'entretien).

Références : [plan.md](./plan.md) · modèles `InsurancePolicy`, `InsuranceClaim`,
`InsuranceClaimDocument`, `InsuranceClaimStatusHistory` et `MaintenanceLogEntry` dans
[DATA_MODELS.md](../../docs/architecture/DATA_MODELS.md) · modèle de menace dans
[SECURITY.md](../../docs/governance/SECURITY.md) (isolation par agence, fichiers privés).

## 1. Synthèse

Une agence qui gère un patrimoine doit savoir **quel bien est assuré, jusqu'à quand, et
ce qu'il est advenu des sinistres**. Le lot livre trois briques rattachées à la fiche d'un
bien et à la section patrimoine :

- les **polices d'assurance** d'un bien (assureur, numéro, type de couverture, période,
  prime annuelle, pièce justificative), avec un statut **dérivé** de leurs dates et une
  alerte d'échéance ;
- les **sinistres**, déclarés au titre d'une police, suivis par statuts jusqu'à
  l'indemnisation ou au refus, avec leurs pièces, leur historique horodaté et un **reste à
  charge calculé** (jamais saisi) ;
- le **carnet d'entretien** d'un bien : une ligne par intervention, en vue chronologique,
  exportable en CSV, avec une alerte de prochaine échéance ou de fin de garantie.

Le lot ne crée **aucune dépense** (une dépense écrit au journal comptable) : un sinistre
ne fait que pointer vers une dépense ou un ticket de maintenance existants. Il n'ajoute
**aucune permission** : lecture et écriture suivent celles des biens
(`PROPERTIES_VIEW` / `PROPERTIES_EDIT`).

## 2. Scénarios utilisateur

### US1 — Enregistrer et suivre les polices d'un bien (P1)

Un gestionnaire saisit les polices d'assurance d'un bien et voit d'un coup d'œil lesquelles
sont actives, proches de l'échéance ou échues. Une alerte prévient l'agence avant l'échéance.

1. **Étant donné** la fiche d'un bien, **quand** le gestionnaire ouvre l'onglet « Assurances
   et sinistres » et ajoute une police (assureur, numéro, type de couverture, début, fin,
   prime annuelle facultative), **alors** la police apparaît dans la liste avec son statut
   dérivé et le nombre de jours avant l'échéance.
2. **Étant donné** une police dont la date de fin tombe dans 30 jours ou moins, **quand** la
   liste est affichée, **alors** son statut est « Expire bientôt » ; une police dont la date
   de début est future est « À venir » ; une police dont la fin est dépassée est « Échue ».
3. **Étant donné** une date de fin antérieure à la date de début, **quand** le gestionnaire
   enregistre, **alors** la saisie est refusée (400) avec un message clair.
4. **Étant donné** une police liée à au moins un sinistre, **quand** le gestionnaire tente
   de la supprimer, **alors** la suppression est refusée (409) ; une police sans sinistre se
   supprime.
5. **Étant donné** une police qui expire dans la fenêtre d'alerte (30 jours), **quand** le
   job quotidien d'alertes passe, **alors** les administrateurs de l'agence reçoivent un
   e-mail, une seule fois pour cette échéance ; si l'événement e-mail est désactivé pour
   l'agence, rien n'est envoyé ni marqué.
6. **Étant donné** un `documentId` d'une autre agence ou d'un autre bien, **quand** il est
   joint à la police, **alors** la réponse est la même 404 qu'un document inexistant.

### US2 — Déclarer un sinistre et le suivre jusqu'à l'indemnisation (P1)

Un sinistre est déclaré sur un bien au titre d'une police, puis suivi à travers des
statuts jusqu'à son règlement, avec pièces et reste à charge.

1. **Étant donné** un bien et l'une de ses polices, **quand** le gestionnaire déclare un
   sinistre (date de survenance, cause, description, montant réclamé, franchise
   facultative, ticket de maintenance et dépense facultatifs), **alors** le sinistre est
   créé au statut `DECLARED`, la date de déclaration est celle du jour, une première ligne
   d'historique est écrite (sans statut d'origine) et `PATRIMOINE_INSURANCE_CLAIM_DECLARED`
   est journalisé.
2. **Étant donné** un sinistre `DECLARED`, **quand** le gestionnaire le passe à « Assureur
   prévenu » puis à « Expertise », **alors** chaque transition horodate son champ dédié,
   écrit une ligne d'historique avec la note éventuelle et journalise
   `PATRIMOINE_INSURANCE_CLAIM_STATUS_CHANGED`, le tout atomiquement.
3. **Étant donné** un sinistre en expertise, **quand** le gestionnaire le passe à
   « Indemnisé » en saisissant l'indemnité, **alors** le reste à charge est calculé
   (`max(0, réclamé - indemnisé)`) et affiché ; sans indemnité, la transition est refusée
   (400) ; une indemnité supérieure au montant réclamé est refusée (400).
4. **Étant donné** un sinistre en expertise, **quand** le gestionnaire le passe à
   « Refusé » avec un motif, **alors** l'indemnité vaut 0 et le reste à charge égale le
   montant réclamé ; sans motif, la transition est refusée (400).
5. **Étant donné** un sinistre `SETTLED` ou `REJECTED`, **quand** le gestionnaire le clôt,
   **alors** il passe à `CLOSED` et n'est plus modifiable (409 à toute tentative).
6. **Étant donné** une transition hors de la matrice (par exemple `DECLARED` vers
   `SETTLED`, ou un retour en arrière), **quand** elle est demandée, **alors** elle est
   refusée avec la même erreur typée, sans aucun effet.
7. **Étant donné** deux gestionnaires qui changent le statut du même sinistre en même
   temps, **quand** les deux requêtes arrivent, **alors** une seule réussit ; l'autre
   reçoit un 409 (mise à jour conditionnelle sur le statut d'origine).
8. **Étant donné** un sinistre, **quand** le gestionnaire rattache une pièce (devis, rapport
   d'expert, courrier de l'assureur, photos avant ou après, facture) déjà téléversée sur le
   bien, **alors** la liaison apparaît dans le détail ; la rattacher deux fois est refusé
   (409) ; la retirer ne supprime pas le document.
9. **Étant donné** un sinistre `DECLARED`, **quand** le gestionnaire le supprime, **alors**
   ses pièces et son historique disparaissent avec lui ; tout autre statut refuse la
   suppression (409).
10. **Étant donné** un `ticketId`, `expenseId`, `policyId` ou `documentId` d'une autre
    agence (ou d'un autre bien lorsque le lien exige le même bien), **quand** il est fourni,
    **alors** la réponse est la même 404 qu'un identifiant inexistant.

### US3 — Tenir le carnet d'entretien d'un bien (P2)

1. **Étant donné** la fiche d'un bien, **quand** le gestionnaire ouvre l'onglet « Carnet
   d'entretien » et ajoute une intervention (date, catégorie, description, prestataire,
   coût, prochaine échéance, fin de garantie, pièce), **alors** elle apparaît en tête d'une
   liste triée de la plus récente à la plus ancienne.
2. **Étant donné** un carnet rempli, **quand** le gestionnaire clique « Exporter en CSV »,
   **alors** il télécharge un fichier CSV UTF-8 avec marque d'ordre des octets (BOM),
   séparateur `;` et colonnes fixes ; une cellule commençant par `=`, `+`, `-` ou `@` est
   neutralisée contre l'injection de formule.
3. **Étant donné** une entrée dont la prochaine échéance ou la fin de garantie tombe dans
   30 jours, **quand** le job quotidien passe, **alors** les administrateurs reçoivent un
   e-mail « prochaine échéance » ou « fin de garantie », une seule fois par échéance.
4. **Étant donné** une date de prochaine échéance ou de fin de garantie antérieure à la
   date d'intervention, **quand** le gestionnaire enregistre, **alors** la saisie est
   refusée (400).
5. **Étant donné** un prestataire d'une autre agence, **quand** il est fourni, **alors** la
   réponse est la même 404 qu'un prestataire inexistant.

### US4 — Voir tous les sinistres par statut (P2)

1. **Étant donné** la page « Sinistres » de la section patrimoine, **quand** le gestionnaire
   l'ouvre, **alors** il voit les sinistres de l'agence, tous biens confondus, regroupés ou
   filtrables par statut, avec bien, police, cause, montants et dates.
2. **Étant donné** un filtre par bien, par police ou par statut, **quand** il est appliqué,
   **alors** seuls les sinistres correspondants sont listés, du plus récemment déclaré au
   plus ancien.
3. **Étant donné** un utilisateur qui n'a que la lecture des biens, **quand** il ouvre la
   page, **alors** il consulte sans pouvoir déclarer, modifier ni changer un statut.

## 3. Exigences fonctionnelles

### Polices

- **FR-001** : le modèle `InsurancePolicy` porte `tenantId` (direct), `propertyId`,
  `insurer`, `policyNumber`, `coverageType` (`MULTIRISK_HOME`, `MULTIRISK_BUILDING`,
  `OWNER_LIABILITY`, `OTHER`), `startDate`, `endDate`, `annualPremium` (facultatif),
  `currency` (3 lettres majuscules, `XOF` par défaut), `notes`, `documentId` facultatif et
  `createdByUserId`.
- **FR-002** : le statut d'une police est **dérivé, jamais stocké**, calculé à la date du
  jour en UTC par jour calendaire : `UPCOMING` si `startDate` est postérieure à aujourd'hui ;
  `EXPIRED` si `endDate` est antérieure à aujourd'hui ; `EXPIRING_SOON` si la police est
  active et `endDate - aujourd'hui <= 30` jours ; sinon `ACTIVE`. Fonction pure
  `derivePolicyStatus(policy, now)`, avec `daysToExpiry`. Les bornes (la veille, le jour
  même, le lendemain, J-30, J-31) sont testées.
- **FR-003** : `endDate >= startDate` (sinon 400) ; `annualPremium >= 0` ou nul.
- **FR-004** : `documentId` est facultatif ; s'il est fourni, c'est un `PropertyDocument` de
  la même agence **et** du même bien, sinon `NotFoundError` (la même qu'un document
  inexistant). `documentId: null` délie la pièce.
- **FR-005** : la suppression d'une police est refusée (409, `ConflictError`) si des
  sinistres lui sont rattachés.

### Sinistres

- **FR-006** : le modèle `InsuranceClaim` porte `tenantId` (direct), `propertyId`,
  `policyId`, `ticketId` et `expenseId` facultatifs, `occurredAt`, `declaredAt`, `cause`
  (`WATER_DAMAGE`, `FIRE`, `THEFT`, `STRUCTURAL`, `STORM`, `OTHER`), `description`, `status`,
  `claimedAmount`, `indemnifiedAmount`, `deductible`, `currency`, `rejectionReason`, les cinq
  horodatages dédiés (`insurerNotifiedAt`, `expertiseAt`, `settledAt`, `rejectedAt`,
  `closedAt`) et `createdByUserId`.
- **FR-007** : à la création, `propertyId` est un bien de l'agence ; `policyId` est une
  police de l'agence **et** du même bien ; `ticketId` est un ticket de maintenance de
  l'agence (et du même bien : un ticket d'un autre bien de l'agence donne aussi 404) ;
  `expenseId` est une dépense de l'agence **et** du même bien. `occurredAt` n'est pas dans
  le futur ; `declaredAt` est l'instant de la création et n'est pas saisi ;
  `claimedAmount >= 0` ; `deductible >= 0` ou nul. Statut initial `DECLARED`, première ligne
  d'historique (`fromStatus` nul), audit `PATRIMOINE_INSURANCE_CLAIM_DECLARED`.
- **FR-008** : le lot **ne crée aucune `PropertyExpense`** : `expenseId` est un simple lien
  vérifié, jamais le résultat d'une écriture comptable.
- **FR-009** : les transitions autorisées sont définies par **une table unique**
  (`lib/patrimoine/insurance/claim-status.ts`, fonctions pures `canTransition(from, to)` et
  `allowedNextStatuses(from)`) :

  | De                 | Vers                               |
  | ------------------ | ---------------------------------- |
  | `DECLARED`         | `INSURER_NOTIFIED`                 |
  | `INSURER_NOTIFIED` | `EXPERTISE`, `SETTLED`, `REJECTED` |
  | `EXPERTISE`        | `SETTLED`, `REJECTED`              |
  | `SETTLED`          | `CLOSED`                           |
  | `REJECTED`         | `CLOSED`                           |
  | `CLOSED`           | (aucune)                           |

  Toute autre transition est refusée par une erreur typée unique et cohérente (409
  `ConflictError`, testée sur toute la matrice). La liste des statuts suivants possibles
  est renvoyée avec chaque sinistre (`allowedNextStatuses`).

- **FR-010** : chaque transition, dans **une seule** `prisma.$transaction` : horodate le
  champ dédié (`insurerNotifiedAt`, `expertiseAt`, `settledAt`, `rejectedAt`, `closedAt`) à
  l'instant courant ; écrit une ligne `InsuranceClaimStatusHistory` (`fromStatus`,
  `toStatus`, `note`, `changedByUserId`, `changedAt`) ; écrit l'audit
  `PATRIMOINE_INSURANCE_CLAIM_STATUS_CHANGED`. Le verrou contre la course est une mise à
  jour conditionnelle `updateMany where { id, tenantId, status: from }` ; zéro ligne
  affectée donne 409.
- **FR-011** : le passage à `SETTLED` exige `indemnifiedAmount` (>= 0 et <= `claimedAmount`,
  sinon 400) ; `deductible` est facultatif. Le passage à `REJECTED` exige `rejectionReason`
  non vide (sinon 400) et force `indemnifiedAmount` à 0. `indemnifiedAmount` n'est modifiable
  **que** par la transition vers `SETTLED`, jamais par `PATCH`.
- **FR-012** : le **reste à charge** (`outOfPocketAmount`) est **calculé, jamais stocké ni
  accepté en entrée** : `max(0, claimedAmount - (indemnifiedAmount ?? 0))`, exposé
  uniquement quand le statut est `SETTLED`, `REJECTED` ou `CLOSED` (`null` avant). Le calcul
  se fait en centimes entiers ou en `Decimal`, jamais en flottant brut (fonction pure
  `computeOutOfPocket(claimed, indemnified)`, testée). Tout champ `outOfPocketAmount` dans
  un corps de requête est rejeté par le schéma `.strict()`.
- **FR-013** : `PATCH` d'un sinistre : `description`, `cause`, `occurredAt`,
  `claimedAmount`, `deductible`, `ticketId`, `expenseId` (`null` pour délier). Refusé (409)
  si le sinistre est `CLOSED` ; un `claimedAmount` qui rendrait le montant réclamé inférieur
  au montant indemnisé est refusé (400).
- **FR-014** : un sinistre ne se supprime que s'il est `DECLARED` (sinon 409) ; ses pièces
  et son historique sont supprimés en cascade.
- **FR-015** : `POST claims/:claimId/documents { documentId, kind }` : `documentId` est un
  `PropertyDocument` de l'agence **et** du bien du sinistre (sinon 404) ; `kind` vaut
  `PHOTO_BEFORE`, `PHOTO_AFTER`, `QUOTE`, `EXPERT_REPORT`, `INSURER_LETTER` ou `INVOICE` ;
  un doublon (`claimId`, `documentId`) donne 409. `DELETE …/documents/:linkId` retire la
  liaison, **jamais** le document.
- **FR-016** : le téléversement d'une pièce **réutilise** la route existante
  `POST /tenants/:tenantId/properties/:id/documents` (type `INSURANCE` ou `OTHER`) ;
  le téléchargement réutilise `GET …/properties/:id/documents/:documentId/file`. Aucun chemin
  disque n'apparaît dans une réponse du lot, aucun fichier n'est servi en statique.

### Carnet d'entretien

- **FR-017** : le modèle `MaintenanceLogEntry` porte `tenantId` (direct), `propertyId`,
  `category` (`PLUMBING`, `ELECTRICAL`, `AIR_CONDITIONING`, `GENERATOR`,
  `ROOF_WATERPROOFING`, `PAINTING`, `OTHER`), `performedAt`, `description` (non vide),
  `cost` (>= 0, facultatif), `currency`, `vendorId` (prestataire `MaintenanceVendor` de
  l'agence, sinon 404), `nextDueDate` et `warrantyEndDate` (facultatives, >= `performedAt`),
  `documentId` facultatif (document de l'agence et du bien), `createdByUserId`.
- **FR-018** : la liste est chronologique, `performedAt` décroissant puis `createdAt`
  décroissant ; `propertyId` est **obligatoire** pour la lister et l'exporter ; un filtre
  par catégorie est possible.
- **FR-019** : l'export est un CSV UTF-8 avec BOM, séparateur `;`, colonnes fixes (date,
  catégorie, prestataire, coût, devise, description, prochaine échéance, fin de garantie),
  cellules neutralisées contre l'injection de formule (préfixe `'` si la valeur commence par
  `=`, `+`, `-` ou `@`), en-tête `Content-Disposition: attachment`. **Pas de PDF.**

### Alertes

- **FR-020** : **une seule** nouvelle clé e-mail `INSURANCE_DEADLINE_ALERT`, rattachée à la
  fonctionnalité d'abonnement `PATRIMOINE` (`notification-key-features.ts`), avec son gabarit
  par défaut. Elle sert les trois alertes (fin de police, prochaine échéance d'entretien, fin
  de garantie) par des variables (`{{alertTitle}}`, `{{itemLabel}}`, `{{propertyReference}}`,
  `{{dueDate}}`). Aucune clé WhatsApp n'est ajoutée.
- **FR-021** : `alertExpiringInsurancePolicies` signale les polices dont la date de fin est
  comprise entre aujourd'hui et aujourd'hui + 30 jours ; `alertMaintenanceDeadlines`
  signale les entrées dont `nextDueDate` (« prochaine échéance ») ou `warrantyEndDate`
  (« fin de garantie ») tombe dans cette fenêtre ; `runInsuranceAlerts` agrège les deux et
  renvoie `{ matched, sent, skippedNoRecipient, skippedAlreadySent, failed }`. Le job
  quotidien existant des alertes de documents l'appelle pour chaque agence.
- **FR-022** : destinataires : les administrateurs actifs de l'agence (rôle `TENANT_ADMIN`),
  à défaut `Tenant.contactEmail`. Les valeurs injectées dans le gabarit HTML sont échappées.
  Les destinataires étant des utilisateurs internes et non des contacts CRM soumis à
  consentement, le routeur de canaux du lot 031 n'est **pas** appliqué (choix documenté en
  tête du fichier d'alertes).
- **FR-023** : anti-doublon par `AuditLog` : `entityType` + `entityId` =
  `${id}::${KIND}::${YYYY-MM-DD}` avec `KIND` ∈ `POLICY`, `DUE`, `WARRANTY` ; l'écriture
  d'audit est vidangée (`flush`) immédiatement. Un second passage envoie zéro message. Si
  l'événement e-mail est désactivé pour l'agence, rien n'est envoyé et rien n'est marqué.
  Les marques sont `PATRIMOINE_INSURANCE_POLICY_ALERT_SENT` et
  `PATRIMOINE_MAINTENANCE_DUE_ALERT_SENT`.

### Routes et isolation

- **FR-024** : routes sous `/tenants/:tenantId/patrimoine`, déjà rattachées à la
  fonctionnalité `PATRIMOINE` : chaque route est protégée par `authenticate`,
  `requireTenantAccess` et `requirePropertyPermission('PROPERTIES_VIEW' | 'PROPERTIES_EDIT')`
  (lecture = `VIEW` ; écriture et transitions = `EDIT`). **Aucune nouvelle permission.**
  Le détail des routes figure dans [plan.md](./plan.md).
- **FR-025** : toute référence (bien, police, ticket, dépense, document, prestataire,
  sinistre, entrée, liaison) est vérifiée comme appartenant à l'agence **avant** lecture ou
  écriture ; toute requête porte `tenantId` ; l'identifiant d'URL d'un sinistre, d'une
  police ou d'une entrée est cherché avec `{ id, tenantId }`. Une référence d'une autre
  agence lève la même `NotFoundError` qu'un objet inexistant. `createdByUserId` vient de
  l'utilisateur authentifié, jamais du corps. Jamais de `include: { user: true }` : le nom de
  l'auteur d'un changement de statut vient d'un `select` explicite `{ id, fullName }`.
- **FR-026** : les schémas de requête sont `.strict()` : tout champ inconnu (dont
  `outOfPocketAmount`, `indemnifiedAmount` hors transition, `tenantId`, `createdByUserId`)
  est rejeté (400). Les dates acceptent `YYYY-MM-DD` ou ISO complet. Les montants sont
  renvoyés en `number`, jamais en chaîne ; les dates en ISO 8601.
- **FR-027** : `GET /insurance/claims` accepte `propertyId`, `status`, `policyId` et `limit`
  (200 par défaut, 500 au plus) et trie par `declaredAt` décroissant.

### Écrans, i18n, transverse

- **FR-028** : deux onglets sur la fiche d'un bien, chargés en `React.lazy` : « Assurances et
  sinistres » (polices, sinistres, détail avec chronologie des statuts, pièces) et « Carnet
  d'entretien » (liste chronologique, ajout, modification, suppression, export CSV). Une
  page d'ensemble `/tenant/:tenantId/patrimoine/claims` et une entrée de menu « Sinistres »
  sous la section patrimoine, avec les permissions de la page Patrimoine.
- **FR-029** : tout libellé visible passe par `t()` (fr clé, en, ar) ; marges en propriétés
  logiques ; aucun `dangerouslySetInnerHTML` ; montants et devise formatés comme le reste du
  module patrimoine.
- **FR-030** : les nouvelles routes passent `routes-inventory.test.ts` et
  `route-features` ; les cinq nouveaux modèles passent `schema-tenant-coverage.test.ts`
  (`tenantId` direct) et figurent dans le registre d'export d'agence
  (`tenant-data-export.registry`) ; le nouveau gabarit passe `notification-catalogs.accents`.
- **FR-031** : le budget du bundle d'entrée n'est pas dégradé (`npm run measure:entry`) :
  onglets et page en `React.lazy`.

## 4. Cas limites

- Police sans sinistre, à la date de fin égale à aujourd'hui : statut `EXPIRING_SOON`
  (`daysToExpiry = 0`), pas `EXPIRED` ; la veille de la fin, idem ; le lendemain, `EXPIRED`.
- Police à J-30 : `EXPIRING_SOON` ; à J-31 : `ACTIVE`. Police dont le début est demain :
  `UPCOMING`, même si elle expire dans moins de 30 jours.
- Sinistre dont `occurredAt` est dans le futur : refusé (400). Sinistre dont la date tombe
  hors de la période de la police : **accepté** (voir points ouverts).
- Montant réclamé nul : accepté ; reste à charge 0 après règlement.
- Indemnité égale au montant réclamé : reste à charge 0 ; indemnité supérieure : 400. Le
  reste à charge n'est jamais négatif.
- Sinistre `REJECTED` : `indemnifiedAmount` forcé à 0, reste à charge égal au montant réclamé.
- `PATCH` du montant réclamé d'un sinistre déjà indemnisé : refusé s'il passe sous le montant
  indemnisé ; refusé en tout cas si le sinistre est `CLOSED`.
- Suppression d'un document déjà lié à un sinistre : la liaison disparaît avec le document
  (cascade) ; la suppression d'une liaison laisse le document.
- Ticket de maintenance ou dépense supprimés : le lien est mis à `null`, le sinistre reste.
- Bien supprimé : polices, sinistres et entrées de carnet disparaissent en cascade ; une
  police ne se supprime pas tant que des sinistres y sont rattachés (restriction).
- Entrée de carnet sans coût, sans prestataire ni échéance : valide ; ne produit aucune
  alerte. Entrée avec les deux dates dans la fenêtre : deux alertes distinctes (`DUE` et
  `WARRANTY`), chacune une seule fois.
- Valeur de cellule CSV commençant par `=`, `+`, `-` ou `@` (y compris dans une description
  saisie par un utilisateur) : neutralisée ; point-virgule ou guillemet dans une cellule :
  cellule entre guillemets, guillemets doublés.
- Aucun administrateur actif et pas d'e-mail d'agence : alerte comptée `skippedNoRecipient`.
- Deux passages simultanés du job d'alertes : le second ne renvoie pas ce que le premier a
  marqué (le marquage suit immédiatement l'envoi).
- Deux changements de statut concurrents : un seul réussit, l'autre reçoit un 409.

## 5. Entités clés

- **`InsurancePolicy`** (nouveau) : police d'un bien ; rattachée à `Tenant` et `Property` ;
  `documentId` vers `PropertyDocument` (`SetNull`). Statut dérivé, jamais stocké.
- **`InsuranceClaim`** (nouveau) : sinistre au titre d'une police (`NoAction` en base : une police
  avec sinistres ne se supprime pas ; le refus 409 est applicatif) ; liens facultatifs vers `MaintenanceTicket` et
  `PropertyExpense` (`SetNull`) ; reste à charge calculé, non stocké.
- **`InsuranceClaimDocument`** (nouveau) : liaison sinistre-document, unique par
  (`claimId`, `documentId`), avec la nature de la pièce (`kind`).
- **`InsuranceClaimStatusHistory`** (nouveau) : une ligne par changement de statut, avec
  note et auteur.
- **`MaintenanceLogEntry`** (nouveau) : une intervention d'entretien d'un bien ; lien
  facultatif vers `MaintenanceVendor` et `PropertyDocument` (`SetNull`).
- **`PropertyDocument`**, **`MaintenanceTicket`**, **`MaintenanceVendor`**,
  **`PropertyExpense`** (existants, inchangés) : cibles des liens, toujours vérifiées par
  agence ; le type de document `INSURANCE` existe déjà.
- **`AuditLog`** (existant) : journal des déclarations et changements de statut, et marque
  anti-doublon des alertes.

## 6. Hypothèses

- Un sinistre se déclare au titre d'une police **existante du même bien** : l'agence saisit
  d'abord la police.
- Le reste à charge est une donnée d'affichage : le lot ne génère ni écriture comptable, ni
  dépense, ni remboursement. Si l'agence veut tracer la dépense, elle la saisit par le module
  existant puis la lie au sinistre.
- Les pièces sont des documents du bien déjà téléversés (ou téléversés juste avant par la
  route existante) : le lot ne gère aucun fichier lui-même.
- Les alertes visent les utilisateurs internes de l'agence (administrateurs), pas les
  propriétaires ni les locataires ; elles passent par l'e-mail seulement.
- La fenêtre d'alerte est de 30 jours, la même que le seuil « Expire bientôt ».
- Le fuseau de référence des dates calendaires est UTC.
- Les montants sont exprimés dans la devise de la ligne (`XOF` par défaut, usage existant du
  module patrimoine) ; aucune conversion de devise.
- La liste des sinistres plafonne à 500 lignes ; au-delà, le filtrage par bien, police ou
  statut sert à réduire.

## 7. Critères de succès

- **SC-001** : la matrice complète des transitions de statut est testée : 100 % des couples
  (de, vers) hors table sont refusés, 100 % des couples de la table réussissent avec
  historique, horodatage et audit écrits.
- **SC-002** : le reste à charge n'est jamais négatif ni stocké, et est refusé en entrée
  dans 100 % des corps de requête (test paramétré sur tous les schémas).
- **SC-003** : 0 sinistre passe à `SETTLED` sans montant indemnisé valide et 0 à `REJECTED`
  sans motif.
- **SC-004** : 100 % des identifiants d'une autre agence (bien, police, ticket, dépense,
  document, prestataire, sinistre, entrée, liaison) renvoient la même 404 qu'un identifiant
  inexistant (test paramétré) ; `npm run test:isolation` vert.
- **SC-005** : le statut dérivé d'une police est correct à chaque borne (veille, jour même,
  lendemain, J-30, J-31, début demain).
- **SC-006** : un second passage du job d'alertes envoie 0 message pour une échéance déjà
  signalée ; un événement désactivé ou l'absence de destinataire n'envoie ni ne marque rien.
- **SC-007** : 0 `PropertyExpense` créée par une opération du lot (test de non-régression sur
  la création, les transitions et le règlement d'un sinistre).
- **SC-008** : l'export CSV porte le BOM et le séparateur `;`, et neutralise 100 % des
  cellules commençant par `=`, `+`, `-` ou `@`.
- **SC-009** : un utilisateur sans `PROPERTIES_EDIT` reçoit 403 sur 100 % des routes
  d'écriture et de transition ; un utilisateur sans `PROPERTIES_VIEW` sur 100 % des routes de
  lecture.
- **SC-010** : typecheck sans nouvelle erreur, lint, `check:architecture`,
  `routes-inventory`, `route-features`, `schema-tenant-coverage`,
  `tenant-data-export.registry`, `notification-catalogs.accents`, `test:isolation` verts ;
  `measure:entry` sans dégradation ; relecture `code-reviewer` et `security-auditor` faite.

## 8. Points ouverts et hors périmètre

- **Raccourci sans expertise** : la table autorise `INSURER_NOTIFIED` vers `SETTLED` ou
  `REJECTED` sans passer par `EXPERTISE` (petits sinistres réglés sur dossier). Décision à
  confirmer : supprimer ce raccourci imposerait une expertise systématique.
- **Période de la police** : le lot ne contrôle pas que la date du sinistre tombe dans la
  période de la police (une police échue ou à venir peut recevoir un sinistre). Contrôle à
  décider avec le métier (sinistre déclaré après l'échéance de la police, avenants).
- **Routeur de canaux (lot 031)** : non appliqué, car les destinataires sont des utilisateurs
  internes sans consentement CRM ; l'e-mail seul est utilisé.
- **PDF du carnet d'entretien** : absent ; seul l'export CSV est livré.
- **Une seule clé e-mail** `INSURANCE_DEADLINE_ALERT` pour les trois alertes : l'agence ne
  peut pas désactiver séparément fin de police, échéance d'entretien et fin de garantie.
- **Pas de clé WhatsApp** pour ces alertes.
- **Dépense automatique** : aucune ; la création d'une dépense à partir d'une indemnité ou
  d'un reste à charge n'est pas prévue (elle écrirait au journal comptable).
- **Alerte d'avancement de sinistre** (relance de l'assureur, sinistre sans nouvelle depuis
  N jours) : non prévue.
- **Renouvellement de police** (copie de la police pour l'année suivante) : non prévu.
- **Franchise** : saisie à titre d'information, sans effet sur le calcul du reste à charge
  (`max(0, réclamé - indemnisé)`).
- **Notification du propriétaire** d'un sinistre, portail propriétaire : hors lot.
- **Agrégats d'agence** (coût des sinistres, ratio sinistres/primes) : hors lot.
- **Limiteurs de débit** : ceux des routes d'agence existantes ; aucun limiteur dédié.
