# Plan — besoins du prospect Syndic (compte rendu du 25/09/2026)

Source : `docs/Compte-rendu-entretien-module-syndic.md`. Plan établi le
2026-09-27 après relevé de l'existant (branche `chore/agentic-architecture`,
qui contient `fix/recette-syndic-modules`).

Hors périmètre sur décision de l'utilisateur : besoin 9 (assistant IA) et
besoin 10 (marketplace). Paiement en ligne des charges : chantier séparé,
plus tard.

## Décisions de l'utilisateur (27/09/2026)

| #   | Sujet                    | Décision                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Multi-agences (besoin 7) | Un seul compte (tenant) pour le cabinet. Nouvelle fiche **Agence mandante** (nom, coordonnées, logo, signature, cachet). Chaque copropriété est rattachée à un mandant (facultatif). Les documents portent le logo, la signature et le cachet du mandant, ainsi que le logo de la copropriété. Les mandants ne se connectent pas.                  |
| P2  | Affectation (4 et 5)     | Par défaut, un paiement solde d'abord les appels les plus anciens. Le gestionnaire peut cocher lui-même les mois couverts. L'excédent devient une **avance**, imputée automatiquement sur chaque nouvel appel. Un appel entièrement couvert n'est ni notifié ni relancé.                                                                           |
| P3  | Appels auto (6)          | Émis **et envoyés** automatiquement selon une programmation par copropriété : fréquence, jour d'émission, échéance, et montant tiré du budget voté ÷ nombre de périodes ou montant fixe.                                                                                                                                                           |
| P4  | Portail (2)              | Pas de paiement en ligne. Ajouts au portail : Mes paiements, Mes quittances, relevé PDF, fiche copropriété et grille des mois réglés et dus.                                                                                                                                                                                                       |
| P5  | Paiement partiel (1)     | Un paiement qui laisse un reste dû, ou une pure avance, donne un **reçu de paiement**. Chaque appel entièrement soldé, y compris par imputation d'une avance, donne une **quittance** de sa période.                                                                                                                                               |
| P6  | Envoi (1)                | **E-mail automatique** avec le PDF joint, sur un modèle modifiable et désactivable par l'agence. Le document est toujours présent dans le portail et dans l'historique du lot.                                                                                                                                                                     |
| P7  | Impression (1)           | Impression groupée des quittances d'une période, pour tous les copropriétaires ou pour un seul. L'utilisateur choisit la mise en page A4 : **nombre de colonnes × nombre de lignes** par feuille.                                                                                                                                                  |
| P8  | Prestataires (3)         | Traitement **complet** : une facture (PDF joint) est rattachée à une copropriété et à un contrat ou un incident, les paiements partiels sont admis et l'historique est conservé. Chaque paiement débite le fonds choisi (avec journal des mouvements), passe l'écriture dans la comptabilité de la copropriété et met à jour le réalisé du budget. |
| P9  | Export (8)               | Réservé au **super-admin**. Il produit une archive ZIP de toute l'agence : un fichier CSV ou Excel par type de données, plus tous les fichiers. La préparation tourne en tâche de fond, puis l'archive se télécharge.                                                                                                                              |

## Choix par défaut du Pilote (réversibles, à confirmer au besoin)

- En-tête des documents : celui du mandant s'il existe, sinon celui de
  l'agence (tenant). Aucune mention du cabinet en sous-traitance par défaut.
- Numérotation : une séquence par émetteur (mandant, ou agence sinon), par
  type et par année. Formats : `Q-2026-000123` pour une quittance,
  `R-2026-000045` pour un reçu. Elle est atomique (`INSERT … ON CONFLICT DO
UPDATE … RETURNING`, comme `nextPlatformInvoiceNumberTx`).
- Signature et cachet sont stockés en **privé**, jamais dans la liste
  blanche statique. Un logo de mandant ou de copropriété est privé lui aussi
  (lu à la génération).
- PDF générés avec pdf-lib et un en-tête commun factorisé. Les quittances
  générées sont **stockées** sous `syndics/<id>/quittances/` et historisées ;
  un original n'est jamais régénéré en silence.
- Pas de quittance rétroactive pour les paiements existants. Un bouton
  « Générer les quittances manquantes » est prévu.
- Montant d'un appel issu du budget : quote-part annuelle ÷ nombre de
  périodes, ce qui corrige le défaut actuel (l'appel porte l'année entière).
- PV d'AG (DOCX) : logo injecté par `docxtemplater-image-module-free`. Si ce
  module ne convient pas, le PV sera produit en PDF.

## Découpage en lots

Une PR par lot, empilées. Base : `fix/recette-syndic-modules` (PR #15), là
où vit le code Syndic à jour. Idéalement, les PR #12 à #16 sont fusionnées
avant le lot 1.

| Lot | Besoin | Contenu                                   | Taille | Dépend de                                          |
| --- | ------ | ----------------------------------------- | ------ | -------------------------------------------------- |
| S1  | 7      | Identité des documents                    | M      | —                                                  |
| S2  | 4, 5   | Périodes structurées, affectation, avance | L      | —                                                  |
| S3  | 1      | Reçus et quittances, impression groupée   | L      | S1, S2                                             |
| S4  | 6      | Appels automatiques et avis d'appel PDF   | M      | S1, S2 (S3 pour les quittances issues des avances) |
| S5  | 2      | Portail copropriétaire enrichi            | M      | S2, S3                                             |
| S6  | 3      | Factures et paiements des prestataires    | L      | — (S1 facultatif)                                  |
| S7  | 8      | Export complet super-admin                | M      | — (générique : couvre aussi les modèles ajoutés)   |

Chemin critique : S1 → S2 → S3 → (S4 ∥ S5). S6 et S7 avancent en parallèle,
chacun dans son worktree.

### S1 — Identité des documents (besoin 7)

- Prisma :
  - modèle `MandatingAgency` : tenantId, name, legalName, address, phone,
    email, rccm, logoPath, signaturePath, stampPath ;
  - sur `Syndicate` : `mandatingAgencyId?` et `logoPath?` ;
  - sur `Tenant` ou `AgencyFinanceSettings` : `signaturePath?` et
    `stampPath?`.
- API :
  - CRUD des mandants, avec vérification d'appartenance du
    `mandatingAgencyId` à l'agence (`assertBelongsToTenant`) ;
  - upload privé du logo, de la signature et du cachet (PNG/JPG, taille
    bornée, type vérifié).
- Module commun `lib/documents/document-branding.ts` :
  - `resolveBranding(syndicateId)` calcule l'en-tête (mandant, sinon
    agence) ;
  - `drawPdfHeader(page, branding)` et `drawSignatureBlock(page, branding)`
    le dessinent.
- Application :
  - le relevé de compte du lot existant ;
  - le PV d'AG (DOCX, logo injecté).
- Web : page « Agences mandantes » dans le menu Syndic, sélection du mandant
  et logo dans la fiche copropriété, signature et cachet dans les paramètres
  de l'agence.
- Tests : `schema-tenant-coverage`, `routes-inventory`, isolation (mandant
  d'une autre agence → 404), `portal-no-disk-paths`.

### S2 — Périodes, affectation, avance (besoins 4 et 5)

- Prisma :
  - sur `ChargeCall` : `periodStart` et `periodEnd`. Le libellé `period` est
    conservé. Rattrapage des données existantes au mieux ; une période
    illisible reste nulle et est listée dans le rapport de migration ;
  - sur `ChargePayment` : `lotId`, et `chargeCallId` devient facultatif ;
  - nouvelle table `ChargePaymentAllocation` (paymentId, chargeCallId,
    amount). Les paiements existants y sont reportés 1:1.
- Service :
  - `recordChargePayment` affecte le montant aux mois cochés, sinon du plus
    ancien au plus récent. Le reliquat devient une avance : un crédit non
    affecté du compte du lot. Le refus 422 du trop-perçu disparaît.
  - `applyOwnerAdvanceTx` (sur le modèle de `applyAdvancesTx` du locatif)
    est appelé dans les trois boucles de création d'appels (`queries.ts`
    ~1220, ~1313, ~4047).
  - `notifyChargeCall` et `runReminderBatchForSyndicate` ignorent un appel
    couvert.
- Lecture : une grille lot × mois (réglé, partiel, dû, couvert par l'avance)
  par copropriété et par exercice.
- Web :
  - modale de paiement avec des cases à cocher pour les mois et un aperçu de
    l'affectation et de l'avance ;
  - onglet « Suivi mensuel » dans les charges ;
  - avance affichée dans le compte du lot.
- Tests :
  - unitaires sur l'affectation (ordre, mois cochés, excédent, arrondis) ;
  - imputation de l'avance à la création d'un appel ;
  - statuts PAID, PARTIAL et OVERDUE ;
  - absence de relance sur un appel couvert.

### S3 — Reçus et quittances (besoin 1)

- Prisma :
  - modèle `ChargeReceipt` : tenantId, syndicateId, lotId, contactId, kind
    (RECEIPT ou QUITTANCE), number, chargePaymentId?, chargeCallId?,
    periodStart, periodEnd, amount, filePath, issuedAt, emailedAt,
    voidedAt ;
  - séquence `ChargeReceiptSequence`.
- Génération :
  - dans la transaction du paiement (et de l'imputation d'avance), on
    réserve le numéro et on crée l'enregistrement ;
  - après le commit, on produit le PDF (en-tête S1, montant en chiffres et en
    lettres, période, lot, reste dû, signature et cachet) et on l'envoie.
- E-mail : clés `CHARGE_PAYMENT_RECEIPT` et `CHARGE_CALL_SETTLED` dans
  `email-notification-keys.ts` et les modèles par défaut, avec la pièce
  jointe.
- Impression groupée :
  - route `GET …/quittances/impression?du=&au=&lotId|contactId=&cols=&rows=`,
    qui compose N quittances par feuille A4 (grille de 1×1 à 3×4) ;
  - la taille du texte s'adapte à la cellule, avec des traits de coupe.
- Web :
  - historique des reçus et quittances par lot et par copropriété, avec
    téléchargement et renvoi par e-mail ;
  - écran « Imprimer les quittances » : période, tous ou un copropriétaire,
    colonnes × lignes, aperçu ;
  - bouton « Générer les quittances manquantes ».
- Tests :
  - numérotation concurrente sans doublon ;
  - reçu contre quittance selon le solde ;
  - accès aux fichiers réservé à l'agence ;
  - mise en page de la grille (nombre de pages).

### S4 — Appels automatiques (besoin 6)

- Prisma : modèle `SyndicChargeSchedule` : syndicateId, frequency (MONTHLY,
  QUARTERLY, SEMIANNUAL, ANNUAL), issueDay, dueOffsetDays, amountSource
  (BUDGET ou FIXED), budgetId?, fixedAmount?, active, nextRunAt, lastRunAt.
  Contrainte d'unicité `(scheduleId, periodStart)` sur `ChargeCallBatch`
  pour l'idempotence.
- Tâche `jobs/syndic-charge-call-scheduler.job.ts` (node-cron, quotidienne,
  démarrée dans `index.ts`, sur le modèle de `land-lease-accrual-job.ts`).
  Pour chaque programmation due, sous `runWithTenantContext` :
  1. créer le lot d'appels ;
  2. imputer les avances (S2) ;
  3. émettre une quittance pour chaque appel couvert (S3) ;
  4. notifier les seuls appels non couverts, avec l'avis d'appel en PDF
     joint.
     Chaque échec est journalisé copropriété par copropriété.
- Avis d'appel de charges en PDF (en-tête S1), téléchargeable côté
  gestionnaire et côté portail.
- Correctif : `generateChargeCallsFromBudget` répartit sur le nombre de
  périodes.
- Web : onglet « Programmation » par copropriété (création, pause, prochaine
  émission, historique des exécutions).
- Tests :
  - idempotence (deux exécutions ne créent pas de doublon) ;
  - calcul de la prochaine date ;
  - budget ÷ périodes ;
  - un appel couvert ne reçoit pas de demande de paiement.

### S5 — Portail copropriétaire (besoin 2)

- Routes à ajouter dans `coowner-portal-routes.ts` : `GET /paiements`,
  `GET /quittances`, `GET /quittances/:id/fichier`,
  `GET /lots/:lotId/releve`, `GET /appels/:id/avis`,
  `GET /lots/:lotId/suivi-mensuel`, `GET /copropriete/:id`.
- Chaque lecture est limitée par `resolveCoOwnerScope`. Aucun chemin disque
  n'est renvoyé.
- Pages web : Mes paiements, Mes quittances, grille mensuelle, fiche
  copropriété (mandant, contacts du syndic, logo).
- Revue `security-auditor` obligatoire : risque d'IDOR entre lots et entre
  agences.

### S6 — Prestataires (besoin 3)

- Prisma :
  - modèles `SyndicProviderInvoice` (syndicateId, providerId, contractId?,
    incidentId?, number, invoiceDate, dueDate, amountHT, vat, amountTTC,
    filePath, status) et `SyndicProviderPayment` (invoiceId, fundId?,
    amount, paidAt, method, reference, journalEntryId) ;
  - modèle `SyndicateFundMovement`, qui donne un historique réel au fonds.
- Comptabilité :
  - plan comptable minimal de la copropriété créé à la première utilisation
    (401 prestataires, 6xx charges, 512 banque, 10x fonds) ;
  - écriture de portée SYNDICATE à la validation de la facture et au
    paiement ;
  - `BudgetLineItem.amountActual` mis à jour ;
  - `IncidentCostImputation.journalEntryId` enfin renseigné.
- Web :
  - onglet « Factures » dans la page Prestataires ;
  - factures et paiements visibles depuis le contrat et depuis l'incident ;
  - soldes dus par prestataire.
- Nouveau code dans `lib/syndics/provider-invoices.ts`, et non dans
  `queries.ts` (4 600 lignes), pour limiter les conflits avec S2 et S3.
- Tests : fonds débité et mouvement tracé, écriture équilibrée, réalisé du
  budget, isolation.

### S7 — Export complet super-admin (besoin 8)

- Service générique qui s'appuie sur le DMMF de Prisma. Il parcourt tous les
  modèles rattachés à l'agence, directement (`tenantId`) ou par leur parent
  (appels → copropriété). Il écrit un CSV par modèle et un classeur Excel
  récapitulatif, et joint les fichiers de `uploads/` et de
  `assets/generated_documents/<tenantId>`. Le tout est empaqueté en ZIP
  (dépendance `archiver`).
- Un test fait échouer la CI si un modèle rattaché à une agence n'est pas
  couvert, sur le principe de `schema-tenant-coverage`.
- Tâche de fond, archive privée à durée de vie limitée, journal d'audit.
  Route et bouton dans l'écran super-admin de l'agence. Les secrets sont
  exclus (`passwordHash`, jetons, identifiants de paiement chiffrés).
- Revue `security-auditor` obligatoire : risque d'exfiltration et de fuite
  entre agences.

## Vérifications à chaque lot

`npm run typecheck`, `npm run lint`, `npm run check:architecture`, tests
ciblés, `npm test`, `npm run test:isolation` si une donnée d'agence est
touchée, et `code-reviewer`. Pour S1, S3, S5 et S7 s'y ajoute
`security-auditor` (uploads, fichiers, portail, export). Une recette
navigateur sur l'instance de démo (`npm run demo:sync -- <ref> --migrate`)
suit chaque lot visible.

## Risques et points ouverts

- **Pile de PR** : les PR #12 à #16 ne sont pas fusionnées. Sans fusion
  préalable, S1 à S7 s'empilent sur une chaîne de cinq PR, avec des conflits
  i18n et Prisma probables.
- **Collision de calendrier** : les lots « abonnements par packs » (29/09)
  touchent `route-features.ts`, tout comme S6 et S7. Il faut classer les
  nouvelles routes dans le pack Syndic.
- **Migrations** : S2 réécrit l'attache des paiements, c'est la migration la
  plus risquée (rattrapage des données). Elle est à tester sur une copie de
  la base de démo avant tout autre environnement.
- **Comptabilité de copropriété** : il n'existe aujourd'hui aucun plan
  comptable pré-rempli ni aucune écriture automatique. S6 en pose le socle,
  et les choix de comptes sont à valider par un comptable.
- **Mentions légales** d'une quittance de charges en Côte d'Ivoire (mentions
  obligatoires, timbre) : à confirmer par le métier.
- **Émetteur légal** : quand le mandant figure en en-tête, faut-il aussi
  mentionner le cabinet ? Par défaut, non.
