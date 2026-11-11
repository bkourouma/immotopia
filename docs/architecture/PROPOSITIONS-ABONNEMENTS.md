# Propositions de nouvelles fonctionnalités de gestion des abonnements

> Document de réflexion, rédigé le 2026-11-09 sur la base de `origin/main` (`aa857a25`). Il ne
> modifie aucune spec ni aucun code : chaque proposition est une **idée** à instruire, à trancher
> puis à spécifier. Contrat de référence de l'existant :
> [PLAN-ABONNEMENTS.md](PLAN-ABONNEMENTS.md).

## 0. Comment lire ce document

- **Section 1** : ce que la gestion des abonnements fait déjà et ses trous, vérifiés dans le code
  (références `fichier:ligne` relatives à la racine du dépôt, à la date ci-dessus). Quand la
  documentation contredit le code, la section 1.9 le dit.
- **Section 2** : 25 propositions regroupées par thème (A à G), au même gabarit : problème, valeurs,
  description fonctionnelle, dépendances dans le code, effort (S/M/L), risque, décisions métier.
- **Section 3** : priorisation valeur par effort, feuille de route en trois vagues, anomalies de
  code à corriger indépendamment des propositions.
- **Section 4** : squelettes de spec des cinq propositions à instruire en premier.
- **Section 5** : décisions métier à trancher, sous forme de questions fermées avec une option
  recommandée. Ce sont des questions au propriétaire : rien n'y est présenté comme définitif.

Conventions : montants en FCFA entiers hors taxes ; aucun montant tarifaire ni chiffre de marché
n'est avancé (les prix et seuils sont des paramètres à fixer par le propriétaire) ; les pratiques
SaaS citées sont des pratiques courantes, sans chiffre. Les points fiscaux ou juridiques sont
marqués « à valider avec l'expert-comptable ou un juriste ». Les numéros de ligne peuvent différer
de quelques lignes d'une fiche à l'autre quand elles citent le même bloc : se fier au fichier et à
la fonction nommée.

Branche à connaître : `feat/abonnement-libre-service` (brouillon de la spec 045, non fusionnée dans
cette base) recouvre en partie A1, A3 et A4 ; chaque fiche indique ce qu'elle reprend et ce
qu'elle ajoute.

## 1. État des lieux

Périmètre : gestion des abonnements d'ImmoTopia, lue dans le worktree
`D:\APP\Immobillier-worktrees\abonnements` (branche `orch/2026-11-09-abonnements`, base
`aa857a25`, fusion de la PR #199). Lecture seule, aucun code modifié, aucun test lancé.
Tous les chemins sont relatifs à la racine du worktree. Abréviations : `API` =
`packages/api/src`, `WEB` = `apps/web/src`, `schema` = `packages/api/prisma/schema.prisma`.

Statut des branches liées (`git merge-base --is-ancestor` contre HEAD) :

- `feat/abonnements-packs`, `feat/provision-abonnements` : fusionnées.
- `feat/mon-compte-abonnement` : non ancêtre de HEAD (8 commits hors base) mais fusionnée par
  squash (#181) selon `docs/workflows/HANDOFF.md:112` ; le code est bien présent
  (`WEB/pages/tenant/TenantBillingSettings.tsx`, `WEB/navigation/menu-catalog.ts:250-252`).
- `feat/abonnement-libre-service` : NON fusionnée, 2 commits hors base (`b651eef1`
  sauvegarde inachevée de la spec 045, `1de3d262`). Elle ajoute `specs/045-abonnement-libre-
service/spec.md` et ~20 composants web ; rien de cela n'est dans cette base
  (`HANDOFF.md:112` : « jamais vérifiée, numéro 045 en collision »).

### 1.1 Modèle de données

Tous les modèles ci-dessous sont dans `schema` (numéros de ligne de la déclaration).

| Modèle (ligne)                        | Rôle                                   | Champs clés                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Subscription` (1331)                 | un abonnement par agence               | `tenantId @unique` 1333, `planKey` déprécié 1336, `billingCycle` MONTHLY/ANNUAL, `status` (TRIALING, ACTIVE, PAST_DUE, CANCELED, SUSPENDED : enum 67), `trialEndsAt`, `pastDueAt`, `graceDays` 1349 (7), `quotaPolicy` 1351 (BILL_OVERAGE), `comboDiscountPercent` 1353 (10), `nextBillingAt`, `manualReadOnlyAt/Reason` 1359, `cancelAt/canceledAt` 1342-1343, `metadata` JSON |
| `CatalogItem` (1474)                  | offre globale (PACK, EXTENSION, SETUP) | `code @unique`, `monthlyPrice`, `setupPrice`, `modules[]`, `exclusiveGroup` 1488, `rules` JSON 1491, `isSellable` 1492                                                                                                                                                                                                                                                          |
| `CatalogCapacity` (1505)              | capacité apportée par une unité        | `capacityKey`, `amount`, unique (offre, clé)                                                                                                                                                                                                                                                                                                                                    |
| `SubscriptionItem` (1519)             | élément souscrit, prix figé            | `quantity`, `unitMonthlyPrice` 1526, `unitSetupPrice`, `discountPercent` 1530, `status` SCHEDULED/ACTIVE/ENDED, `startsAt`, `endsAt`, `endReason`, `replacesItemId`, `parentItemId` 1541, `billedThrough` 1543, `note`                                                                                                                                                          |
| `CapacityOverride` (1565)             | dérogation de capacité                 | `capacityKey`, `delta`, `reason` (obligatoire en service), `expiresAt`, `revokedAt`                                                                                                                                                                                                                                                                                             |
| `LotActivation` (1596)                | registre des lots comptés              | `unitKey`, `kind`, `deactivatedAt` ; unicité partielle `lot_activations_open_unit_key` (`migrations/20260928090000_abonnements_packs/migration.sql:304`)                                                                                                                                                                                                                        |
| `InvoiceLine` (1623)                  | ligne de facture                       | `invoiceId` nul = ligne en attente (prorata, avoir) ; `kind` (PACK, EXTENSION, PRORATA, DISCOUNT, SETUP, OVERAGE, CREDIT, USAGE, TAX : enum 138), `amount`, `metadata`                                                                                                                                                                                                          |
| `UsageSnapshot` (1654)                | relevé quotidien de consommation       | unique (agence, capacité, jour) 1668 ; `used`, `limit`, `overage`                                                                                                                                                                                                                                                                                                               |
| `QuotaAlert` (1675)                   | alerte de seuil déjà envoyée           | unique (agence, capacité, seuil, période) 1689 ; `notifiedAt`                                                                                                                                                                                                                                                                                                                   |
| `Invoice` (1376)                      | facture (PLATFORM ou RENTAL)           | `kind`, `billingNature` 1401 (PERIOD, OVERAGE, CREDIT_NOTE), `periodStart/End`, `amountExclTax`, `taxAmount`, `taxRate`, `currency` 1383 (défaut FCFA), `creditedInvoiceId` 1409, `issuerSnapshot` 1411, statuts enum 75 (dont OVERDUE)                                                                                                                                         |
| `PlatformInvoiceSequence` (1440)      | compteur IMT-AAAA-NNNNN, global        | `year @id`, `lastNumber`                                                                                                                                                                                                                                                                                                                                                        |
| `PlatformInvoicePayment` (9475)       | règlement d'une facture PLATFORM       | `invoiceId @unique` 9478, `method` (ONLINE, BANK_TRANSFER, MOBILE_MONEY, CHECK, CASH : enum 9464), `proofPath`, `checkoutId`                                                                                                                                                                                                                                                    |
| `PlatformPaymentCheckout` (9500)      | tentative de paiement PaySecureHub     | `codePaiement @unique` 9506, `status`, `checkAttempts`, `reviewReason`, `simulatedOutcome`                                                                                                                                                                                                                                                                                      |
| `SubscriptionExtensionRequest` (9661) | demande d'extension de l'agence        | `catalogCode`, `quantity`, `message`, `status` OPEN/HANDLED/DECLINED, `handledNote`                                                                                                                                                                                                                                                                                             |
| `TenantModule` (946)                  | module ouvert                          | `source` PACK/OVERRIDE, `expiresAt`, `disabledAt`                                                                                                                                                                                                                                                                                                                               |

Capacités mesurées (`CapacityKey`, schema:103-115 et `API/lib/subscription/catalog.ts:28-29`) : LOTS,
COPROPRIETES, CHANTIERS, BIENS_DETENUS, ACTIFS, PHOTOS_INVENTAIRE, SIGNATURES_MENSUELLES.
Types d'espace : AGENCY, OPERATOR, PARTICULIER (`schema:19-23`).

Faits de structure à retenir :

- Pas de table de journal des changements d'abonnement : l'historique est porté par les
  éléments terminés (`SubscriptionItem.status = ENDED`, `endReason`) et par `AuditLog`
  (clés `SUBSCRIPTION_*`, `CAPACITY_OVERRIDE_*`, `CATALOG_ITEM_UPDATED` :
  `API/types/audit-types.ts:42-61`).
- `Subscription` n'a aucun champ de motif de résiliation (lecture de `schema:1331-1370`).
- `Invoice.currency`, `PlatformInvoicePayment.currency`, `PlatformPaymentCheckout.currency`
  valent « FCFA » par défaut (`schema:1383, 9481, 9508`).

### 1.2 Catalogue et règles de prix

Source : `API/lib/subscription/catalog.ts` (`DEFAULT_CATALOG` 149-403) ; en base le code lit la
table, pas la constante (en-tête 4-9). Prix HT mensuels en FCFA.

| Code                           | Nature                |                                                                HT/mois | Mise en route | Capacités incluses                                       |
| ------------------------------ | --------------------- | ---------------------------------------------------------------------: | ------------: | -------------------------------------------------------- |
| AGENCE                         | PACK                  |                                                                 29 900 |       100 000 | LOTS 100, SIGNATURES 20 (151-163)                        |
| SYNDIC                         | PACK                  |                                                                 49 900 |       150 000 | COPRO 2, LOTS 100, SIGNATURES 50 (164-177)               |
| PROMOTEUR                      | PACK                  |                                                                149 900 |       450 000 | CHANTIERS 2, LOTS 150, SIGNATURES 20 (178-191)           |
| INTEGRE                        | PACK, groupe exclusif |                                                                249 900 |       650 000 | CHANTIERS 3, COPRO 3, LOTS 300, SIGNATURES 100 (192-206) |
| PATRIMOINE_ESSENTIEL           | PACK                  |                                                                  9 900 |        30 000 | BIENS_DETENUS 10 (207-221)                               |
| PATRIMOINE_PRO                 | PACK                  |                                                                 29 900 |        90 000 | BIENS_DETENUS 100 (222-236)                              |
| PARTICULIER_GRATUIT            | PACK                  |                                                                      0 |             0 | ACTIFS 10 (243-256)                                      |
| PARTICULIER_PLUS               | PACK                  |                                                                  2 900 |             0 | ACTIFS 100 (260-272)                                     |
| EXT_LOTS_10                    | EXTENSION             | 1 500 (1 000 Promoteur/Intégré ; 750 Agence seule au-delà du 300e lot) |               | LOTS 10 (273-291)                                        |
| EXT_COPRO                      | EXTENSION             |                                                                 10 000 |               | COPRO 1 (292-305)                                        |
| EXT_CHANTIER                   | EXTENSION             |                                                40 000 (35 000 Intégré) |               | CHANTIERS 1 (306-322)                                    |
| EXT_BIENS_10                   | EXTENSION             |                            9 900 (2 990 avec Pro, non vendable au Pro) |               | BIENS 10 (323-343)                                       |
| EXT_INVENTAIRE_WHATSAPP        | EXTENSION             |                                                                 25 000 |               | PHOTOS 500/mois (344-361)                                |
| EXT_SIGNATURES_SUPPLEMENTAIRES | EXTENSION             |                                                                  5 000 |               | SIGNATURES 50/mois (362-379)                             |
| SETUP_<PACK> (6)               | SETUP                 |                                                                      0 |  prix du pack | une fois (380-402)                                       |

Règles (`API/lib/subscription/pricing.ts`, montants entiers) :

- Mensuel = Σ quantité × prix figé × (1 − remise de l'élément) (`computeRecurringLines` 178-217).
- Remise de combinaison : `comboDiscountPercent` % du prix de base du pack le moins cher, dès
  2 packs distincts, extensions exclues (`computeComboDiscount` 172-176) ; l'Intégré exclut
  tout autre pack (`exclusiveGroup`, `API/lib/subscription/entitlements.ts:118`).
- Annuel = 11 mensualités (`ANNUAL_MONTHS` `catalog.ts:88`, `cycleMultiplier` 236) ; période
  annuelle = +12 mois (`addBillingPeriod` 252). Aucune autre remise annuelle ni réglable.
- Prorata : jours restants, jour d'ajout compris, arrondi à l'unité (`prorataDays` 270,
  `prorateAmount` 281).
- Dépassement : prix d'un bloc ÷ taille, au rang du lot (`computeOverageLines` 296) ; chiffré
  seulement en `BILL_OVERAGE`, jamais pour PHOTOS_INVENTAIRE ni ACTIFS ni SIGNATURES
  (`API/services/subscription-v2-service.ts:1555-1566`, table `extensionCodes`).
- TVA : 18 % constante (`catalog.ts:96`), ligne `TAX` séparée sur le total HT
  (`finalizeInvoice` 366-381). Émetteur : `PLATFORM_ISSUER_*` (`API/config/env.ts:261-266`).
- Prix figé à la souscription (`SubscriptionItem.unitMonthlyPrice`, `schema:1526`) :
  modifier le catalogue (`updateCatalogItem`, `subscription-v2-service.ts:185-222`) ne touche
  aucun abonnement. Le seed `db:seed:catalog` sans `--missing-only` écrase le catalogue
  (`docs/architecture/PLAN-ABONNEMENTS.md:50-56`).
- Un élément peut recevoir une remise propre ou un prix figé modifié par le super-admin
  (`updateSubscriptionItem`, `API/services/subscription-admin-extras-service.ts:79-135`).

### 1.3 Cycle de vie

Phases (`resolveSubscriptionPhase`, `API/lib/subscription/entitlements.ts:285-352`) :
lecture seule manuelle prioritaire (291-294) ; SUSPENDED = lecture seule (298-305) ; CANCELED =
accès jusqu'à `cancelAt` puis lecture seule (308-323) ; TRIALING jusqu'à `trialEndsAt` puis
grâce puis lecture seule (325-331) ; PAST_DUE : grâce depuis `pastDueAt` (333-339) ; ACTIVE :
période échue = grâce puis lecture seule (341-349). Essai : 30 jours (`TRIAL_DAYS`
`catalog.ts:90`), prolongeable (`updateSubscriptionSettings`, `subscription-v2-service.ts:1309`,
`trialEndsAt`). Grâce : `graceDays`, 0 à 90 (1313-1316).

Opérations super-admin (`API/services/subscription-v2-service.ts`) :

- Ajout d'élément : immédiat, ligne PRORATA en attente hors essai (`addSubscriptionItem` 707).
- Retrait : à l'échéance par défaut, immédiat avec raison obligatoire (`removeSubscriptionItem`
  876, exigence de raison 882) ; extensions liées retirées avec leur pack (`parentItemId`).
- Changement de pack : montée immédiate avec avoirs CREDIT au prorata et PRORATA du nouveau,
  descente programmée à l'échéance, immédiat pendant l'essai (`changePack` 1003-1225).
- Dérogations, politique de quota, remise de combinaison, lecture seule manuelle avec motif :
  1226, 1309, 1366, 1395. Le cache des droits dure 30 s (`getEntitlements` 379).

Tâche planifiée (`API/jobs/subscription-usage-job.ts`, démarrée par `API/index.ts:62`) :
passage complet à 02:30 UTC, alertes seules chaque heure à :15 (610-618). Abonnements traités :
TRIALING, ACTIVE, PAST_DUE (58-62). Ordre (531-589) : étape de facturation, échéance, relevé,
rappel d'essai, alertes.

- Échéance (`processBillingBoundary` 200-300) : transitions dues, puis facture PLATFORM PAYÉE
  couvrant la période suivante = renouvellement ; sinon `PAST_DUE` avec `pastDueAt` = échéance
  (222-252). Un abonnement entièrement gratuit se renouvelle sans facture (234-246).
  Notification unique « impayé » (271-282), puis notification unique d'entrée en lecture seule
  (`readOnlyNotifiedFor`, 285-298).
- Relevés : pic quotidien par capacité (`recordUsageSnapshots` 313-345).
- Alertes 80 % et 100 % (`QUOTA_ALERT_THRESHOLDS`, `evaluateQuotaAlerts` 369-426) : e-mail aux
  administrateurs et aux super-admins ; la ligne `QuotaAlert` sert d'anti-doublon.
- Rappels de fin d'essai J-7 et J-1 (`TRIAL_REMINDER_DAYS` 56, `sendTrialReminders` 476-524).

Dépassement : en mensuel, ligne OVERAGE dans la facture de période ; en annuel, facture OVERAGE
séparée chaque mois, sur le pic des relevés (`previewNextInvoice` 1597-1670,
`previewMonthlyOverage` 1675, `dueOverageWindows` `API/services/platform-invoice-service.ts:1238`,
rattrapage 35 jours). Une facture de dépassement impayée n'a aucun effet automatique sur
l'abonnement (D15, `PLAN-ABONNEMENTS.md:227-232`) : confirmé, `processBillingBoundary` ne
regarde que les factures de période (`job:222-246`).

Lecture seule : bloque les écritures, laisse portails, paiements et factures
(`API/lib/subscription/route-features.ts:41-52`, préfixes `/subscription` EXEMPT).

Particulier (espace personnel) : packs gratuits sans facture ni rappel d'essai
(`isFreeSubscription` `platform-invoice-service.ts:600-614`, `job:480`) ; liste blanche de
routes (`API/lib/subscription/particulier-routes.ts`).

Abonnement résilié : voir trou T5 ; `CANCELED` sort de `LIVE_STATUSES`
(`job:58-62`, `platform-invoice-service.ts:1275-1280`) : plus de facture ni de renouvellement.

### 1.4 Facturation et encaissement de la plateforme

- Génération (`generateInvoiceForPeriod` `platform-invoice-service.ts:665` →
  `buildPlatformInvoiceDraft` 222 → `generateInvoiceForPeriodTx` 321) : verrou consultatif par
  agence (144-147), lignes en attente rattachées, mise en route ajoutée à la première facture
  sauf `metadata.setupWaived` (169-180), refus pendant l'essai.
- Idempotence : recherche d'une facture existante par (agence, nature, début de période) hors
  CANCELED (336-341) ; index uniques partiels `invoices_platform_period_key` et
  `invoices_credit_note_key`
  (`migrations/20260928110000_abonnements_facturation/migration.sql:31, 38`) ; repli sur
  violation d'unicité (690-705).
- Numérotation IMT-AAAA-NNNNN continue, attribuée à l'émission (`nextPlatformInvoiceNumberTx`
  132, format `API/lib/subscription/platform-invoice.ts:20-23`) ; émetteur et client figés
  (`issuerSnapshot`, `customerSnapshot`) ; PDF en français et arabe
  (`API/lib/subscription/platform-invoice-pdf.ts`, `...-pdf-ar.ts`) ; e-mail avec PDF aux
  TENANT_ADMIN actifs, sinon e-mail de contact (`sendPlatformInvoiceEmail` 1157, destinataires
  1138-1150).
- Échéance : début de période + `graceDays` (`:287`) ; facture de dépassement annuel :
  émission + `PLATFORM_INVOICE_DUE_DAYS` = 7 (`:247`, `API/config/env.ts:268`).
- Période suivante : générée par le job seulement quand l'échéance est atteinte
  (`runPlatformBillingStep` 1268-1334, appel 1317-1321) ; facture à zéro = PAYÉE d'office.
- Statut OVERDUE : simple `updateMany` des ISSUED échues (`markOverdueInvoices` 753-766).
- Avoir : `issueCreditNote` 782 ; facture annulée → CANCELED, avoir PAYÉ par COMPENSATION,
  ou `REFUND_DUE` si la facture était réglée, remboursement « hors ligne » (779-780, 837).
- Encaissement en ligne : PaySecureHub, compte ImmoTopia
  (`API/lib/payment-gateway/platform-account.ts:14-38`), mode `PLATFORM_PAYSECUREHUB_MODE`
  défaut `SIMULATOR` (`API/config/env.ts:254`) ; `startInvoiceCheckout`
  (`API/services/platform-payment-service.ts:529`) : facture ISSUED/OVERDUE/FAILED
  (`PAYABLE_INVOICE_STATUSES` 59), montant entier de la facture (546-548), reprise d'un
  paiement de moins de 15 minutes (54, 551-562). IPN :
  `POST /payment-gateway/paysecurehub/platform-ipn`
  (`API/routes/payment-gateway-public-routes.ts:21`).
- Constat manuel super-admin : BANK_TRANSFER, MOBILE_MONEY, CHECK, CASH (`:61`, 411-480), avec
  justificatif privé.
- Porte unique de règlement : `settlePlatformInvoiceTx` (188-265), verrou de ligne, idempotent
  (un règlement par facture, 197-200), audit dans la transaction ; renouvellement au paiement
  (`applyPaymentToSubscriptionTx` 267-318) qui n'avance qu'une période (`addBillingPeriod`
  appelé une fois, 293 ; D16 `PLAN-ABONNEMENTS.md:233-239`).
- Réconciliation : tâche toutes les 5 minutes (`API/jobs/online-payment-reconciliation-job.ts:55-56`)
  qui rapproche les checkouts PENDING de plus de 2 minutes et expire à 48 h
  (`reconcilePendingPlatformCheckouts` `platform-payment-service.ts:870-908`).
- Montée de palier particulier : `POST /api/tenants/:tenantId/subscription/upgrade`
  (`API/routes/tenant-routes.ts:123-128`), cible fermée PARTICULIER_PLUS depuis
  PARTICULIER_GRATUIT (`API/services/subscription-upgrade/constants.ts:14-18`), facture du
  premier mois puis paiement ; le pack ne change qu'au règlement
  (`apply-upgrade.ts:39`, appel dans `settlePlatformInvoiceTx`).
- Variables : `PLATFORM_ISSUER_*`, `PLATFORM_PAYSECUREHUB_*`, `PLATFORM_INVOICE_DUE_DAYS`
  (`API/config/env.ts:254-268`).

### 1.5 Écrans

Agence (menu « Mon compte », entrées `mon-compte-abonnement` et `mon-compte-facturation`,
permission `TENANT_SETTINGS_VIEW`, `WEB/navigation/menu-catalog.ts:250-252` ; cette permission est
aussi donnée à `TENANT_MANAGER` et `TENANT_AGENT`, `API/prisma/seeds/rbac-seed.ts:242, 293` : les
deux écrans exposent donc déjà les montants aux managers et aux agents, alors que le comptable,
qui n'a que des permissions `BILLING_*`, n'atteint pas Facturation aujourd'hui) :

- Abonnement, `/tenant/:tenantId/settings/abonnement` (`WEB/App.tsx:1108`,
  `WEB/pages/tenant/TenantSubscriptionSettings.tsx`, 446 lignes) : cartes Formule (statut,
  cycle, libellés des packs, période, jours d'essai restants : 293-313), Consommation (jauges,
  320-349), Modules (351), Demander une extension et Mes demandes (373-443) ; bandeau de
  lecture seule avec motif manuel (270-290) ; `PersonalTierCard` pour un espace personnel
  (316-318). Aucune action de changement de pack, d'ajout ni de retrait.
- Facturation, `/tenant/:tenantId/settings/facturation` (`WEB/App.tsx:1111`,
  `WEB/pages/tenant/TenantBillingSettings.tsx`, 82 lignes) : `TenantInvoicesSection`
  (`WEB/components/subscription/TenantInvoicesSection.tsx`) : liste, PDF français et arabe
  (225-230), bouton « Payer en ligne » (239), suivi du retour `?paiement=`.

Super-admin :

- Fiche agence, onglet Abonnement (`WEB/components/admin/tenant-detail/SubscriptionTab.tsx`,
  1188 lignes) : cartes Abonnement (922), Consommation (1011), Packs et extensions avec
  éléments terminés visibles (1048-1062, statut « Terminé » 158), Dérogations (1067), Modules
  inclus (1080), aperçu de la prochaine facture (`InvoicePreviewSection` 324, onglet 1105) ;
  modales d'ajout (187), de dérogation (259), retrait immédiat avec raison, changement de pack
  (624), prolongation d'essai (714), lecture seule manuelle (758, 1168).
- Onglet Factures (`WEB/components/admin/tenant-detail/InvoicesTab.tsx`) : générer, émettre,
  constat de paiement, avoir (461-480).
- Création d'agence (`WEB/components/admin/CreateTenantDrawer.tsx`) : choix de packs, cycle
  « Annuel (11 mois facturés) » (543), devis via `POST /api/admin/catalog/quote`.
- Liste des agences (`WEB/pages/admin/TenantsList.tsx`) : résumés d'abonnement et filtre
  « proches de la limite » (`API/services/subscription-admin-extras-service.ts:407-470`).
- Statistiques (`WEB/pages/admin/Statistics.tsx:80-88`) : nombre d'abonnements actifs et annulés (cassé, voir E1).
- Absents du web (grep sur `WEB/services/subscription-v2-service.ts:231-244` : seuls `GET
/admin/catalog` et `POST /admin/catalog/quote` sont appelés) : édition du catalogue,
  résiliation. Les demandes d'extension côté super-admin existent, elles : section et onglet
  « Demandes d'extension » de `SubscriptionTab.tsx:397-443, 640-642, 1102`, services
  `listExtensionRequests` et `handleExtensionRequest`
  (`API/services/subscription-admin-extras-service.ts:331, 346`).

API : routes super-admin `API/routes/admin-routes.ts:95-218` et `:234` (factures plateforme),
routes agence `API/routes/tenant-routes.ts:92-160`, factures `API/routes/platform-invoice-routes.ts`.

### 1.6 Intégrations adjacentes

- Libre-service particuliers (spec 026, lot 4) : présent dans cette base. Packs et capacité ACTIFS
  (`catalog.ts:243-272`), montée de palier (1.4), liste blanche de routes, wiki lignes 867-871.
  Le plan `PLAN-ABONNEMENTS.md:31-46` le décrit. Limites consignées dans le wiki (ligne 37) :
  aucune rétrogradation, paiement mobile money réel non testé. Distinct du « libre-service
  agence » (spec 045, branche non fusionnée, voir en tête). `HANDOFF.md:114` classe « routes de
  l'abonnement libre-service » parmi les specs non entamées : cela vise la spec 045, pas la route
  `/subscription/upgrade` des particuliers, qui existe (`tenant-routes.ts:123`).
- Crédits IA (spec 028) : spec seule, aucune implémentation. `specs/028-ia-credits/tasks.md:3-5`
  (« Aucune tâche n'est engagée »), `HANDOFF.md:114` ; recherche de `aiCredit|AiUsage` dans
  `API` et `schema` : aucun résultat. Seul garde existant : limiteur de débit par agence
  (`API/middleware/rate-limit-middleware.ts:786`, `API/routes/ai-routes.ts:38`).
- Quota signatures (spec 044) : capacité SIGNATURES_MENSUELLES incluse par pack (valeurs
  provisoires `catalog.ts:16-21`) + bloc de 50 vendable 5 000 FCFA ; compteur du mois civil
  (`subscription-v2-service.ts:270-282`) ; réservation atomique (`API/lib/signature/quota.ts:
70`) ; en `enforce` sans plafond le refus est `OPTION_MISSING` (`quota.ts:50-55`) ; en
  `warn` repli `SIGNATURE_WARN_QUOTA` = 50 (`API/config/env.ts:559-560`). Jamais de dépassement
  facturé.
- WhatsApp (lot 041) : option EXT_INVENTAIRE_WHATSAPP, capacité PHOTOS_INVENTAIRE (mois civil
  UTC, `subscription-v2-service.ts:253-268`), repli `WHATSAPP_INVENTORY_WARN_QUOTA` = 500
  (`env.ts:424-427`). Aucun dépassement facturé (`subscription-v2-service.ts:1556-1559`). Les
  notifications WhatsApp (routes `whatsapp-notification-config-routes.ts`) n'ont aucun quota
  d'abonnement.
- SMS Orange CI : aucun lien avec le catalogue ni les capacités (recherche de `sms` dans
  `API/lib/subscription` et `subscription-v2-service.ts` : aucun résultat) ; seul plafond :
  `SIGNATURE_SMS_DAILY_LIMIT` = 200 par jour (`env.ts:511`), valeur globale appliquée à chaque agence (`lib/signature/sms-guard.ts:40-52`, `countSmsSentToday(tenantId)`), qui ne protège que les SMS de signature. `SMS_PROVIDER` défaut `disabled`
  (`env.ts:493`) ; Orange livré mais non en service (`HANDOFF.md:116`).
- PaySecureHub : compte plateforme distinct des comptes agence ; mode réel non validé
  (`PLAN-ABONNEMENTS.md:312`, `HANDOFF.md:116, 215` : prod en `SIMULATOR` pour les abonnements).
- Gardes : `SUBSCRIPTION_ENFORCEMENT` défaut `warn` (`env.ts:315`) ; staging en `enforce`
  depuis le 03/10 (`HANDOFF.md:856`).

### 1.7 Trous constatés

Triés par impact. Chaque trou : constat et preuve.

**T1. L'agence ne peut pas modifier elle-même son abonnement.**
Constat : ajout, retrait et changement de pack sont réservés au super-admin
(`API/routes/admin-routes.ts:125, 164, 169`). Les routes agence se limitent à la lecture, aux
factures, au paiement et à la demande d'extension (`API/routes/tenant-routes.ts:106-160`). L'écran
agence n'a que « Demander une extension » (`TenantSubscriptionSettings.tsx:373-443`). Le rappel
de fin d'essai dit pourtant « choisissez vos packs et réglez votre abonnement »
(`API/jobs/subscription-usage-job.ts:503`). La branche `feat/abonnement-libre-service` (spec 045) n'est pas dans la base.

**T2. Aucun prélèvement ni moyen de paiement mémorisé : chaque période se paie à la main.**
Constat : un paiement PaySecureHub porte sur une facture, montant entier
(`platform-payment-service.ts:546-548`) ; recherche de `autopay|recurr|tokeni|carte enregistr`
dans `platform-payment-service.ts` et `lib/payment-gateway/platform-account.ts` : aucun résultat.
La montée de palier le dit hors périmètre (`PLAN-ABONNEMENTS.md:254-255`). Mode réel non validé,
défaut `SIMULATOR` (`env.ts:254`). Le prélèvement bancaire de la spec 042 (`DirectDebitMandate`, remises, IBAN chiffré, `specs/042-prelevement-bancaire`) existe pour les loyers et les charges de copropriété ; les abonnements prélevés y sont « non planifiés » (P6, `spec.md:77`) : il reste une alternative réelle à l'agrégateur, à étendre.

**T3. La facture de période n'est émise qu'à l'échéance : conforme à D8 / `PLAN-ABONNEMENTS.md` §6 bis, mais le message « impayé » est trompeur à chaque renouvellement.**
Constat (lecture du code, non rejoué) : le job génère la facture quand `boundary <= now`
(`platform-invoice-service.ts:1317-1321`) puis, dans le même passage, `processBillingBoundary`
ne trouve aucune facture PAYÉE et pose `PAST_DUE` (`job:222-252`) avec le message « Votre
abonnement est impayé » (271-282). Échéance de la facture = début de période + `graceDays`
(`platform-invoice-service.ts:287`). Ce comportement est conforme au plan (`PLAN-ABONNEMENTS.md` §6 bis : « sinon `PAST_DUE` », grâce de 7 jours, D8) ; ce qui est trompeur, c'est le message « Votre abonnement est impayé » envoyé alors que la facture vient d'être émise. Aucune facture n'est émise à l'avance (aucun appel de
`generateInvoiceForPeriod` hors job et route admin `platform-invoice-routes.ts:34`).

**T4. Aucune relance d'impayé.**
Constat : `markOverdueInvoices` ne fait que changer le statut (`platform-invoice-service.ts:
753-766`). Les seuls envois sont l'e-mail d'émission et d'avoir (appels 730, 746, 937), le message
PAST_DUE unique et le message de lecture seule unique (`job:271-298`). Recherche de
`dunning|relance` dans les fichiers d'abonnement et de facturation (hors messages « relancez ») :
aucun résultat. Un échec d'envoi d'e-mail n'est que journalisé (`platform-invoice-service.ts:1153`).

**T5. Résiliation : uniquement l'ancienne route v1, sans motif, sans écran, côté super-admin.**
Constat : `POST /api/admin/tenants/:tenantId/subscription/cancel` (`admin-routes.ts:107`) appelle
`cancelSubscription` (`API/services/subscription-service.ts:161-216`) : statut CANCELED immédiat
avec `cancelAt` = fin de période, sans paramètre ni champ de motif (`schema:1331-1370`), sans
fin des `SubscriptionItem` ni resynchronisation des modules. La fonction web
`cancelAdminSubscription` existe (`WEB/services/admin-subscription-service.ts:157`) mais
aucun composant ne l'appelle (recherche dans `WEB` hors `services/` : aucun résultat). Aucune
route agence de résiliation. Le wiki marque ces routes « legacy »
(lignes 615-618, note ligne 2).

**T6. Pas de changement de cycle mensuel/annuel après création.**
Constat : aucune fonction v2 n'écrit `billingCycle` après création (recherche de `billingCycle:`
dans `services`, `controllers`, `lib`, `jobs` : seulement création et route v1
`subscription-service.ts:42, 67, 97`). La route v1 `PATCH /tenants/:id/subscription`
(`admin-routes.ts:101`) recalcule `currentPeriodEnd` sans facture, sans avoir ni prorata
(`subscription-service.ts:97-104`) ; le web ne l'appelle pas (`updateAdminSubscription` sans
usage hors service). Le provisioning signale une divergence de cycle sans la corriger
(`subscription-provisioning-service.ts:315-317`).

**T7. Le catalogue n'a pas d'écran d'édition.**
Constat : la route `PATCH /api/admin/catalog/:code` existe (`admin-routes.ts:117`) ; le web ne
fait que lire et chiffrer (`WEB/services/subscription-v2-service.ts:231-244`). Le wiki (ligne 569) indique « Administration (écran catalogue) » et le commentaire `catalog.ts:238-241` parle
d'« ecran super-admin » : aucun écran trouvé (recherche de `catalog` dans `WEB/pages`,
`WEB/components` : création d'agence, onglet abonnement, libellés seulement).

**T8. Aucun indicateur d'activité commerciale (MRR, ARR, churn).**
Constat : recherche de `mrr|churn` dans `API` et `WEB` : 0 résultat. Les statistiques comptent
les abonnements par statut et par `planKey` (`API/services/statistics-service.ts:57-66`) ; or
`planKey` est nul pour les agences créées avec des packs (`:102-110`, `schema:1334-1336`).

**T9. Les alertes de quota ne sont lisibles nulle part dans l'application.**
Constat : `QuotaAlert` n'est écrite que par le job (`job:383, 417`) ; `listQuotaAlerts`
(`job:459`) n'a aucun appelant (recherche de `quotaAlert|listQuotaAlerts` hors tests : définition
et écriture seulement). `UsageSnapshot` n'est lu que pour le dépassement annuel
(`subscription-v2-service.ts:1683`) ; aucune courbe d'usage. Contredit
`PLAN-ABONNEMENTS.md:169-173` et `job:22-24` (« alerte in-app lue par les écrans »).

**T10. L'agence ne voit pas ce qu'elle paie, ni aperçu de prorata avant action.**
Constat : l'aperçu de facture est super-admin (`admin-routes.ts:206`, aucune route agence) ; la
carte Formule n'affiche que les libellés de packs, sans prix (`TenantSubscriptionSettings.tsx:
301-303`). `addSubscriptionItem` et `changePack` n'ont pas de mode simulation (recherche de
`dryRun` dans `subscription-v2-service.ts` : aucun résultat) ; le prorata n'apparaît qu'après
écriture, comme ligne en attente. Un devis de composition existe (`POST /catalog/quote`). Le brouillon de la spec 045 prévoit côté agence un `GET /invoice-preview` (§3.7, non livré) qui comblerait l'aperçu de prochaine facture, pas l'aperçu de prorata avant action.

**T11. Remises : pas de plafond, pas d'approbation, pas de code promo.**
Constat : remise d'élément bornée 0 à 100 % (`subscription-admin-extras-service.ts:87-98`),
remise de combinaison 0 à 100 % (`subscription-v2-service.ts:1317-1322`) ; recherche de
`coupon|promoCode|code promo` dans `API`, `WEB`, `schema` : 0 résultat.

**T12. Reliquat v1 actif, hors série de numérotation et hors porte de règlement.**
Constat : `POST /tenants/:id/invoices` crée une facture PLATFORM numérotée `INV-<horodatage>-<alea>`
(`API/services/invoice-service.ts:10-14, 48`), hors série IMT ; `POST /invoices/:id/mark-paid`
passe par `updateInvoice` (`invoice-service.ts:244-255`), pas par `settlePlatformInvoiceTx` : ni
renouvellement, ni audit de règlement (`admin-routes.ts:222-230`). `PATCH /tenants/:id/subscription`
accepte tout statut (`subscription-service.ts:83-100`) ; `SUBSCRIPTION` SUSPENDED n'est posé
par aucun code (recherche de `SubscriptionStatus.SUSPENDED` : aucun producteur hors cette route).

**T13. Le dépassement est chiffré au prix du catalogue courant, pas au prix figé.**
Constat : `computeOverageForUsage` charge le catalogue en base (`subscription-v2-service.ts:
1567`) et tarife avec `rules`/`monthlyPrice` courants (`pricing.ts:296`). Modifier une extension
modifie donc les dépassements en cours, alors que le contrat dit « modifier le catalogue ne
change aucun abonnement » (`schema:1471-1473`, `PLAN-ABONNEMENTS.md:55-57`).

**T14. Un paiement n'avance que d'une période ; pas de paiement partiel ; remboursement hors outil.**
Constat : D16 (`platform-payment-service.ts:293`) ; montant du checkout = total de la facture
(546-548) ; règlement manuel au montant de la facture sauf `amount` fourni (`SettleInput`
`:150-162`). Avoir sur facture réglée = `REFUND_DUE` sans suite outillée
(`platform-invoice-service.ts:779-780, 837`) ; `InvoiceStatus.REFUNDED` (`schema:81`) n'est
produit par aucune route PLATFORM (recherche : aucun producteur dans `platform-*`).

**T15. TVA et devise figées.**
Constat : TVA 18 % constante (`catalog.ts:96`, défaut de `finalizeInvoice` `pricing.ts:366`),
pas d'exonération par client ; devise « FCFA » écrite en dur (`platform-invoice-service.ts:371,
538`). Multi-devises (spec 036) : non entamée (`HANDOFF.md:114`).

**T16. Pas de pause d'abonnement ; essai unique de 30 jours.**
Constat : recherche de `pause|pausedAt` dans les fichiers d'abonnement et `schema` : aucun
résultat. Essai identique pour tous les packs (`TRIAL_DAYS` `catalog.ts:90`) ; prolongation
manuelle seulement (`subscription-v2-service.ts:1334-1336`).

**T17. IA et SMS hors du modèle d'abonnement.**
Constat : spec 028 non codée (1.6) ; aucune clé de capacité SMS ni IA (`schema:103-115`) ;
SMS limité par une variable d'environnement globale appliquée par agence et réservée aux SMS de signature (`env.ts:511`, `sms-guard.ts:40-52`).

**T18. Pas de multi-entités ni de revendeur.**
Constat : `Subscription.tenantId @unique` (`schema:1333`) ; recherche de
`reseller|revendeur|parentTenantId` dans `schema` : aucun résultat ; vue Groupe (spec 035) non
entamée (`HANDOFF.md:114`).

**T19. Le lien des e-mails d'abonnement mène à la page Abonnement, pas à Facturation.**
Constat : `subscriptionUrl` = `/settings/abonnement` (`job:87`) alors que le bouton « Payer en
ligne » vit sous `/settings/facturation` (`TenantInvoicesSection.tsx:239`, `App.tsx:1111`) ; la
page Abonnement ne propose le lien « Aller à la facturation » qu'en cas de lecture seule
(`TenantSubscriptionSettings.tsx:279-285`). L'e-mail de facture, lui, pointe vers Facturation
(`HANDOFF.md:183`, non revérifié dans le code).

**T20. Pas de journal de catalogue consultable ni de versions.**
Constat : `updateCatalogItem` écrit un audit avant/après (`subscription-v2-service.ts:206-215`)
mais aucune table de versions ni écran dédié ; lisible seulement par l'audit général.

### 1.8 Inventaire « existe déjà »

| Capacité                                    | Présent ?    | Preuve                                                                                                                          |
| ------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Changement de pack par l'agence             | non          | `admin-routes.ts:169` seul ; `tenant-routes.ts:106-160` sans changement de pack                                                 |
| Changement de pack par le super-admin       | oui          | `subscription-v2-service.ts:1003-1225` ; `SubscriptionTab.tsx:624`                                                              |
| Aperçu de prorata avant action              | non          | aucun `dryRun` (`subscription-v2-service.ts`) ; lignes créées à l'écriture (1161-1200)                                          |
| Aperçu de la prochaine facture              | partiel      | `previewNextInvoice` 1597, super-admin seulement (`admin-routes.ts:206`)                                                        |
| Ajout d'extension                           | partiel      | super-admin `addSubscriptionItem` 707 ; agence : demande seulement (`admin-extras:219`)                                         |
| Retrait d'extension                         | partiel      | super-admin `removeSubscriptionItem` 876 (partiel par quantité) ; agence : non                                                  |
| Historique des changements                  | partiel      | éléments `ENDED` visibles (`SubscriptionTab.tsx:158, 1048`) + `AuditLog` ; pas de chronologie dédiée                            |
| Paiement en ligne des factures plateforme   | oui          | `platform-payment-service.ts:529` ; `TenantInvoicesSection.tsx:239` ; mode réel non validé                                      |
| Paiement mobile money                       | partiel      | via PaySecureHub (réel non testé, `HANDOFF.md:116`) ; constat manuel MOBILE_MONEY (`:61`)                                       |
| Paiement par carte enregistrée, prélèvement | non          | aucun résultat `autopay\|recurr\|tokeni` (T2)                                                                                   |
| Relances d'impayés                          | non          | `markOverdueInvoices` 753-766 ; un seul message PAST_DUE (`job:271`)                                                            |
| Avoirs                                      | oui          | `issueCreditNote` `platform-invoice-service.ts:782` ; remboursement hors ligne                                                  |
| Codes promo                                 | non          | aucun résultat (T11)                                                                                                            |
| Remises                                     | partiel      | par élément (`admin-extras:79`), combinaison 10 % (`catalog.ts:94`) ; sans plafond                                              |
| Essai                                       | oui          | `TRIAL_DAYS` 30, prolongeable, rappels J-7 et J-1 (`job:476-524`)                                                               |
| Pause                                       | non          | aucun résultat (T16)                                                                                                            |
| Résiliation avec motif                      | non          | v1 sans motif, sans écran (T5) ; lecture seule manuelle avec motif oui (`v2:1366`)                                              |
| Remise annuelle                             | oui, fixe    | 11 mois facturés (`catalog.ts:88`) ; non paramétrable                                                                           |
| TVA                                         | oui, fixe    | 18 % (`catalog.ts:96`), ligne TAX (`pricing.ts:366`)                                                                            |
| Devise                                      | partiel      | colonne `currency` mais « FCFA » en dur (`platform-invoice-service.ts:371`)                                                     |
| Prorata                                     | oui          | `prorateAmount` `pricing.ts:281`, ajouts et montées de gamme                                                                    |
| MRR, ARR, churn                             | non          | 0 résultat (T8) ; statistiques par statut seulement (`statistics-service.ts:57`)                                                |
| Journal de catalogue                        | partiel      | audit `CATALOG_ITEM_UPDATED` avant/après (`v2:206-215`) ; sans versions ni écran                                                |
| Grandfathering                              | oui, de fait | prix figé par élément (`schema:1526`) ; sauf dépassement (T13)                                                                  |
| Plafonds de remise                          | non          | bornes 0-100 % seulement (T11)                                                                                                  |
| Multi-entités                               | non          | `Subscription.tenantId @unique` (`schema:1333`)                                                                                 |
| Revendeur                                   | non          | aucun résultat (T18)                                                                                                            |
| Idempotence de la facturation               | oui          | verrou + unicité (`platform-invoice-service.ts:144, 336-341, 690-705`)                                                          |
| Réconciliation des paiements                | oui          | tâche 5 min (`online-payment-reconciliation-job.ts:55-56`) + IPN ; règlement idempotent (`platform-payment-service.ts:197-200`) |
| Quotas et alertes                           | partiel      | relevés et e-mails oui ; alerte in-app non lue (T9)                                                                             |
| Lecture seule manuelle                      | oui          | `subscription-v2-service.ts:1366-1420` ; `SubscriptionTab.tsx:758`                                                              |
| Dérogations de capacité (reprise)           | oui          | `grantCapacityOverride` 1226 ; `catalog.ts:100`                                                                                 |

### 1.9 Contradictions documentation / code relevées

1. `PLAN-ABONNEMENTS.md:169-173` et `job:22-24` : la ligne `QuotaAlert` serait l'alerte in-app lue
   par les écrans ; code : aucun lecteur (T9).
2. `PLAN-ABONNEMENTS.md:20-29` (table du catalogue) et `:314-362` (contrat) : ni les packs
   Patrimoine, ni EXT_BIENS_10, EXT_INVENTAIRE_WHATSAPP, EXT_SIGNATURES_SUPPLEMENTAIRES, ni les
   capacités BIENS_DETENUS, PHOTOS_INVENTAIRE, SIGNATURES_MENSUELLES ; le contrat de
   `TenantEntitlements` ne cite que trois capacités (`catalog.ts:28-29` en liste sept).
3. `PLAN-ABONNEMENTS.md:139-141` (phase « grâce ») : une période ACTIVE échue en grâce est
   exposée comme phase `ACTIVE` (`entitlements.ts:348`), pas `GRACE` ; `GRACE` ne sort que pour
   l'essai échu et PAST_DUE.
4. `catalog.ts:238-241` et wiki ligne 569 : « écran catalogue » ; aucun écran (T7).
5. `specs/028-ia-credits/spec.md:44-48` : la spec 026 serait « non fusionnée » ; code : packs
   Particulier et montée de palier présents (`catalog.ts:243-272`).
6. `HANDOFF.md:114` : « routes de l'abonnement libre-service » non entamées ; la route
   `/subscription/upgrade` du libre-service particulier existe ; seul le libre-service agence
   (spec 045) manque.
7. `docs/recette/operateur-integre/09-abonnement-quotas.md` : renvoie à la carte « Voir mon
   abonnement » des Paramètres et à des numéros de ligne de `catalog.ts` qui ont bougé ;
   `HANDOFF.md:184` précise que la carte est retirée au profit du groupe « Mon compte ».
8. `schema:1471-1473` et `PLAN-ABONNEMENTS.md:55-57` (« prix figé ») : vrai pour les éléments,
   faux pour le dépassement (T13).

### 1.10 Limites de cette lecture

- Aucun test, aucune exécution : les comportements (T3 notamment) sont déduits du code.
- Non lus en détail : `API/controllers/*` (au-delà des signatures de route), PDF de facture,
  `lib/subscription/route-features.ts` au-delà de l'en-tête, `docs/recette/packs/SCENARIO_*`.
- Le brouillon de `specs/045-abonnement-libre-service/spec.md` a été lu en lecture seule
  (`git show origin/feat/abonnement-libre-service:specs/045-abonnement-libre-service/spec.md`) :
  décisions AL-C1 à AL-C4 et contrat d'API §3.3 à 3.8 ; branche non fusionnée, rien n'en est
  exécuté. Son §3.7 `GET /invoice-preview` (agence, `TENANT_SETTINGS_VIEW`) répond en partie à T10.
- Le mode réel PaySecureHub et l'état de production (simulateur) ne sont connus que par
  `HANDOFF.md` ; aucune vérification sur serveur.

## 2. Propositions

Vingt-cinq propositions, identifiées par thème (A libre-service, B facturation et paiement,
C rétention, D tarification, E pilotage super-admin, F gouvernance, G fiabilité). Les questions
métier d'une fiche portent l'identifiant `Q-<ID>-n` et sont reprises à la section 5.

### Thème A — Libre-service du client

Aujourd'hui l'agence consulte son abonnement et ses factures, paie en ligne et envoie une demande d'extension, mais toute modification passe par l'équipe ImmoTopia (`apps/web/src/pages/tenant/TenantSubscriptionSettings.tsx:267`).
Ces quatre propositions donnent à l'agence la main sur le devis, le changement de pack, les extensions et l'historique, sans toucher aux règles de prix de `PLAN-ABONNEMENTS.md` §5 et §6. Le brouillon de la spec 045 (branche `origin/feat/abonnement-libre-service`, jamais fusionnée, voir `docs/workflows/HANDOFF.md:112`) couvre déjà une partie de A1, A3 et A4 ; chaque fiche dit ce qu'elle reprend et ce qu'elle ajoute.

#### A1 — Simulateur de devis avant achat

- **Statut** : Extension de l'existant. Le calcul de devis existe côté super-admin seulement : `POST /api/admin/catalog/quote` (`packages/api/src/routes/admin-routes.ts:116`, `controllers/subscription-v2-controller.ts:109`) sur `estimateMonthly` (`lib/subscription/pricing.ts:390`) ; l'aperçu de facture `previewNextInvoice` (`services/subscription-v2-service.ts:1597`) l'est aussi. Le devis d'UN élément (`POST /items/quote`, §3.3) et un `GET /invoice-preview` côté agence (§3.7, `TENANT_SETTINGS_VIEW`, prochaine facture estimée) sont décrits dans le brouillon de la spec 045, non livré.
- **Problème** : une agence (ou un commercial) ne peut pas chiffrer « Agence + Syndic, 320 lots, en annuel » avant d'acheter. `estimateMonthly` ne connaît que lots, copropriétés, chantiers et biens (`pricing.ts:390-440`) : ni signatures, ni inventaire WhatsApp, ni prorata ; le devis admin ne renvoie ni TVA ni TTC. L'annuel existe déjà dans ce devis (`controllers/subscription-v2-controller.ts:126-129`, `annual` via `annualPrice`) : le vrai manque est la TVA, le TTC, le prorata, les signatures et WhatsApp, et l'exposition côté agence. Aucune route agence n'expose de devis (`routes/tenant-routes.ts:93-165`).
- **Valeur pour l'agence** : savoir ce que coûte une montée de pack ou une extension avant de cliquer, avec la TVA et le premier montant à payer ; moins de demandes « combien ça coûte ? » à l'équipe.
- **Valeur pour ImmoTopia** : moins de friction à la vente, même chiffrage côté agence et côté super-admin, base commune pour A2 et A3 (un seul moteur de plan, jamais deux calculs divergents).
- **Description fonctionnelle** :
  - Écran agence « Simuler mon abonnement » (route à créer, ex. `/tenant/:tenantId/settings/abonnement?onglet=simulateur`) : choix des packs vendables, quantités d'extensions, cycle mensuel ou annuel. Affichage live : lignes HT, remise de combinaison, total HT, TVA, TTC, et la différence avec l'abonnement actuel.
  - Cycle : en annuel, la règle actuelle est 11 mensualités (`lib/subscription/catalog.ts:88`, `pricing.ts:236-244`) ; le simulateur affiche mensuel et annuel côte à côte (le devis admin renvoie déjà `monthly` et `annual`, `subscription-v2-controller.ts:126-129`) et la différence en FCFA entiers, sans pourcentage inventé, en y ajoutant TVA et TTC.
  - Prorata : si l'agence a déjà un abonnement hors essai, aperçu « à régler sur la prochaine facture » = prorata des jours restants, jour d'ajout compris (`prorateAmount`, `pricing.ts:281`), plus la variation de la remise de combinaison ; pendant l'essai, aucun prorata (même règle que `addSubscriptionItem`, `subscription-v2-service.ts:707`).
  - Refus identiques à l'achat réel : offre non vendable, Intégré exclusif, extension non autorisée par les packs détenus (`assertPackComposition`, `subscription-v2-service.ts:1723`), pack déjà souscrit ; message explicite plutôt que chiffre faux.
  - Mention permanente « Devis indicatif, hors dépassements éventuels » ; si la politique de l'agence est `BILL_OVERAGE`, afficher le dépassement estimé à la consommation actuelle.
  - Espace PARTICULIER : écran masqué et route refusée (liste blanche `lib/subscription/particulier-routes.ts:32`), comme pour la spec 045 AL-C4.
  - Côté super-admin : le même devis dans `SubscriptionTab.tsx`, en lecture seule, pour accompagner une vente.
- **Dépendances dans le code existant** : extraire le calcul de `addSubscriptionItem` (`subscription-v2-service.ts:707-872`) en fonction de plan sans écriture (prévue par la spec 045 §3.3) ; réutiliser `computeRecurringLines`, `planExtensionUnits`, `finalizeInvoice` (`pricing.ts:178,129,366`) ; route agence `POST /api/tenants/:tenantId/subscription/quote` dans `routes/tenant-routes.ts` (préfixe `/subscription` déjà exempté de lecture seule). Aucun modèle Prisma nouveau ; test d'égalité devis = ajout réel à écrire.
- **Effort** : M — le moteur existe (annuel compris), mais il faut le séparer de l'écriture, ajouter TVA, TTC et prorata, et couvrir les extensions de consommation (signatures, WhatsApp) que `estimateMonthly` ignore.
- **Risque** : finance (devis différent de la facture) : garde-fou = une seule fonction de plan pour le devis et l'exécution, test de non-régression sur les exemples de `__tests__/unit/subscription.pricing.test.ts`. Sécurité tenant : la route lit uniquement l'abonnement de `:tenantId` ; ne jamais renvoyer le catalogue non vendable ni les prix figés d'une autre agence.
- **Valeur** : agence Moyenne ; ImmoTopia Moyenne
- **Prérequis et décisions métier** :
  - Q-A1-1 — Qui voit le simulateur ? Options : (a) administrateur d'agence seulement, exprimé par `TENANT_SUBSCRIPTION_MANAGE` (ou une permission de lecture dédiée à créer), car `TENANT_SETTINGS_VIEW` est aussi donnée à `TENANT_MANAGER` et `TENANT_AGENT` (`rbac-seed.ts:242, 293`) et gouverne déjà Abonnement et Facturation (`menu-catalog.ts:250-252`) ; seul `TENANT_ADMIN` détient `TENANT_SETTINGS_EDIT` ; (b) tout titulaire de `TENANT_SETTINGS_VIEW`, donc aussi managers et agents ; recommandée : (a) parce que les montants sont sensibles. Constat : les écrans actuels exposent déjà les montants aux managers et agents ; l'option (a) est donc plus stricte que l'existant pour le simulateur et ne le corrige pas pour les écrans en place.
  - Q-A1-2 — Faut-il un simulateur public pour prospects (site vitrine) ? Options : (a) non, agence connectée seulement ; (b) oui, sans compte ; recommandée : (a) parce que le site vitrine a sa propre grille (`PLAN-ABONNEMENTS.md`, en-tête) et un devis public double la surface d'exposition des prix.
  - Q-A1-3 — Faut-il inclure la mise en route (`SETUP_<PACK>`, facturée une fois) dans le devis d'un nouveau pack ? Options : (a) oui, ligne séparée ; (b) non ; recommandée : (a) parce qu'elle apparaît sur la première facture (`PLAN-ABONNEMENTS.md` §6 quater).
  - Q-A1-4 — Devis exportable en PDF ? Options : (a) non, écran seul ; (b) PDF « non contractuel » ; recommandée : (a) pour la première livraison, parce qu'un PDF de devis touche aux mentions légales (voir B5).
- **Mise en œuvre sûre** : livrer d'abord le calcul à blanc côté API avec ses tests d'égalité, puis l'écran ; aucune écriture en base, donc réversible en retirant la route.

#### A2 — Changement de pack en libre-service avec aperçu du prorata

- **Statut** : Extension de l'existant. `changePack` (`services/subscription-v2-service.ts:1003`) gère montée immédiate et descente à l'échéance mais n'est joignable que par le super-admin (`routes/admin-routes.ts:169`). La spec 045 AL-C3 laisse expressément le changement de pack à ImmoTopia : ce lot est donc absent du brouillon.
- **Problème** : l'écran dit « les modifications de la formule passent par l'équipe ImmoTopia » (`TenantSubscriptionSettings.tsx:267`). `changePack` écrit directement, sans mode aperçu (`subscription-v2-service.ts:1003-1226`). Une montée donne accès immédiat au pack supérieur alors que prorata et avoirs ne sont que des lignes en attente reprises par la facture suivante (`subscription-v2-service.ts:1107-1175`) : aucun encaissement au moment de la montée, contrairement au palier Particulier qui exige le paiement (`PLAN-ABONNEMENTS.md` §6 sexies). La descente programmée (`SCHEDULED`) ne s'annule nulle part.
- **Valeur pour l'agence** : monter ou descendre de pack à son rythme, en voyant le coût exact avant de valider, sans attendre une réponse.
- **Valeur pour ImmoTopia** : moins de demandes manuelles, montées de gamme plus rapides, trace claire des changements.
- **Description fonctionnelle** :
  - Écran « Changer de formule » (onglet Packs de la spec 045, ou section de `TenantSubscriptionSettings.tsx`) : liste des packs cibles autorisés pour l'agence, les autres affichés « non disponible » avec la raison (exclusivité Intégré, groupe de paliers).
  - Aperçu avant validation : avoir du pack remplacé au prorata, prorata du nouveau pack, variation de la remise de combinaison, TVA, total à régler ; extensions liées qui suivent ou qui partent (`PLAN-ABONNEMENTS.md` §6, extensions liées) ; capacités avant et après ; modules qui passeraient en lecture seule (D11, `moduleHoldsData`, `subscription-v2-service.ts:435`).
  - Montée : effet immédiat ; hors essai, prorata et avoirs repris sur la prochaine facture, ou facture immédiate de la différence payable en ligne (voir Q-A2-1). Descente : programmée à l'échéance, avec bouton « Annuler la descente » tant que l'échéance n'est pas passée. Pendant l'essai : tout immédiat, sans prorata.
  - Descente avec consommation supérieure à la nouvelle capacité : avertissement chiffré (la politique `BLOCK` / `BILL_OVERAGE` / `WARN_ONLY` s'appliquera, `PLAN-ABONNEMENTS.md` D4), confirmation explicite.
  - Refus en lecture seule d'impayé ou manuelle, comme la spec 045 AL-C2 ; erreurs typées, jamais de message deviné.
  - Super-admin : continue d'utiliser `changePack` ; l'historique distingue « par l'agence » et « par ImmoTopia » (`actorUserId` déjà tracé, `SUBSCRIPTION_PACK_CHANGED`, `types/audit-catalog.ts:94`).
  - Cas limites : abonnement annuel (prorata sur la période de 12 mois, montants multipliés par `cycleMultiplier`) ; pack identique déjà détenu (409) ; plusieurs packs à remplacer (`fromCodes`).
- **Dépendances dans le code existant** : refactor de `changePack` en plan + exécution (même technique que A1) ; `generateUpgradeInvoiceTx` (`services/platform-invoice-service.ts:477`) si paiement immédiat ; `startInvoiceCheckout` (`platform-payment-service.ts:529`) ; nouvelle permission `TENANT_SUBSCRIPTION_MANAGE` (proposée par la spec 045 AL-C1, à créer dans `rbac-seed.ts` et `rbac-types.ts`) ; routes agence `POST /subscription/change-pack/quote`, `POST /subscription/change-pack`, `POST /subscription/change-pack/cancel-downgrade` (à créer). Aucun champ Prisma nouveau : `SubscriptionItem.status = SCHEDULED` et `endsAt` suffisent (`schema.prisma:1519`).
- **Effort** : L — plan à blanc, annulation de descente, éventuel paiement immédiat, garde de lecture seule et tests de prorata sont indissociables.
- **Risque** : finance : montée sans encaissement, ou allers-retours pour échapper au paiement ; garde-fou = paiement immédiat de la différence ou plafond de changements par période (Q-A2-1, Q-A2-3). Sécurité tenant : `fromCodes` et `toCode` validés contre l'abonnement de l'agence ; permission dédiée plutôt que `TENANT_SETTINGS_EDIT`.
- **Valeur** : agence Forte ; ImmoTopia Forte
- **Prérequis et décisions métier** :
  - Q-A2-1 — Montée de pack : quand régler la différence ? Options : (a) sur la prochaine facture (comportement actuel, `subscription-v2-service.ts:1107-1175`) ; (b) facture immédiate payable en ligne, effet au règlement (modèle du palier Particulier) ; recommandée : (b) parce qu'elle supprime le risque d'accès sans paiement, mais c'est une décision propriétaire (rupture avec D7).
  - Q-A2-2 — Descente avec consommation au-dessus de la nouvelle capacité. Options : (a) refuser tant que l'usage dépasse ; (b) autoriser et laisser la politique de quota s'appliquer ; recommandée : (b) avec avertissement, parce que (a) bloque des agences qui veulent justement réduire.
  - Q-A2-3 — Fréquence maximale de changements. Options : (a) un par période de facturation ; (b) illimitée ; recommandée : (a) pour décourager l'usage en yo-yo.
  - Q-A2-4 — Qui peut changer de pack ? Options : (a) `TENANT_ADMIN` seul ; (b) tout titulaire de `TENANT_SETTINGS_EDIT` ; recommandée : (a) comme la spec 045 AL-C1.
  - Q-A2-5 — Rétrogradation du palier Particulier payant vers le gratuit : incluse ? Options : (a) non ; (b) oui à l'échéance ; recommandée : (a) parce que la spec 026 la déclare hors périmètre (`specs/026-particuliers-libre-service/spec.md:129`).
- **Mise en œuvre sûre** : livrer l'aperçu seul (sans écriture) puis le changement derrière un réglage désactivé par défaut ; le super-admin garde la voie actuelle, donc retour arrière immédiat.

#### A3 — Boutique d'extensions à la carte et incitations contextuelles

- **Statut** : Extension de l'existant. L'agence peut lister les extensions ouvertes par ses packs et envoyer une demande (`GET /subscription/extension-offers`, `POST /subscription/extension-requests`, `routes/tenant-routes.ts:144-162`) ; la demande est traitée à la main (`services/subscription-admin-extras-service.ts:219,346`). L'ajout et le retrait en libre-service sont décrits dans la spec 045 §3.4-3.6, non fusionnée. Les blocs SMS sont une idée nouvelle : aucune capacité SMS n'existe.
- **Problème** : trois trous vérifiés. (1) Marquer une demande « Traitée » n'ajoute rien à l'abonnement (`subscription-admin-extras-service.ts:346-380`) ; l'ajout est un second geste du super-admin via `POST /items`. (2) L'alerte de seuil n'est qu'un e-mail qui dit « Ajoutez l'extension … depuis {{url}} » (`jobs/subscription-usage-job.ts:445-450`) alors que la page ne propose qu'un formulaire de demande (`TenantSubscriptionSettings.tsx:373`). (3) `listQuotaAlerts` (`subscription-usage-job.ts:459`) n'est appelée nulle part : l'alerte in-app annoncée par `PLAN-ABONNEMENTS.md` §6 bis n'existe pas côté écran.
- **Valeur pour l'agence** : débloquer un quota en un geste au moment où il bloque, voir le prix avant de confirmer, retirer une extension devenue inutile.
- **Valeur pour ImmoTopia** : revenu d'extension sans intervention humaine, signatures et inventaire WhatsApp vendus au bon moment, moins de tickets de support.
- **Description fonctionnelle** :
  - Onglet « Extensions » : cartes des offres vendables (blocs de lots, copropriété, chantier, biens, `EXT_SIGNATURES_SUPPLEMENTAIRES` `catalog.ts:367-378`, `EXT_INVENTAIRE_WHATSAPP` `catalog.ts:349-361`) avec prix pour CETTE agence (`planExtensionUnits`), capacité apportée, raison d'indisponibilité. Bouton « Ajouter » : devis (A1) puis confirmation, effet immédiat, prorata sur la prochaine facture hors essai.
  - Retrait : « Retirer à l'échéance » par l'agence (`removeSubscriptionItem`, `subscription-v2-service.ts:876`, sans remboursement, D7), annulable ; le retrait immédiat reste réservé au super-admin.
  - Incitation contextuelle : sous la jauge de chaque capacité à 80 % et 100 %, bandeau « Ajouter un bloc » menant à la carte préremplie ; sur un refus 409 `QUOTA_EXCEEDED`, le bouton déjà prévu (`components/shell/AppShell.tsx:238-241`) ouvre la carte de la capacité concernée.
  - Alerte in-app : exposer les `QuotaAlert` de l'agence (route à créer au-dessus de `listQuotaAlerts`) et afficher un bandeau d'abonnement dans l'application, en plus de l'e-mail ; ne pas répéter une alerte déjà fermée (une seule par capacité, seuil et période, `schema.prisma:1675`).
  - Consommations mensuelles (`PHOTOS_INVENTAIRE`, `SIGNATURES_MENSUELLES`) : comptées par mois civil UTC (`subscription-v2-service.ts:270`) alors que la facturation suit la période d'abonnement ; afficher la règle (« 50 signatures de plus à partir de maintenant, remises à zéro le 1er du mois »).
  - Blocs SMS (idée nouvelle) : capacité mensuelle de SMS, bloc cumulable, même mécanique que les signatures ; dépend du fournisseur SMS encore non mis en service (`HANDOFF.md:116`).
  - Refus en lecture seule d'impayé (AL-C2) ; offres non vendables restent en « demande ».
- **Dépendances dans le code existant** : `addSubscriptionItem` et `removeSubscriptionItem` (plan à blanc, voir A1) ; `listTenantExtensionOffers` (`subscription-admin-extras-service.ts:306`) ; `evaluateQuotaAlerts` (`subscription-usage-job.ts:369`) ; `components/shell/AppShell.tsx` ; `Table` et `TenantSubscriptionSettings.tsx`. Pour les SMS : valeur `SMS_MENSUELLES` de `CapacityKey` (`schema.prisma:103`, à créer, migration), fournisseur `lib/sms/orange.ts`, fournisseur d'usage (`registerUsageProvider`, `subscription-v2-service.ts:292`), ligne `EXT_SMS_*` du catalogue (à créer).
- **Effort** : L — ajout et retrait libre-service, alerte in-app et incitations ; les SMS ajoutent un chantier de comptage et de fournisseur (à découper en lot séparé).
- **Risque** : finance : clic accidentel ou double clic qui double un bloc ; garde-fou = devis puis confirmation, clé d'idempotence, permission `TENANT_SUBSCRIPTION_MANAGE`. Sécurité tenant : `itemId` d'une autre agence doit lever la même `NotFoundError` qu'un objet inexistant (règle `AGENTS.md`). Conformité : un bandeau trop insistant doit rester informatif.
- **Valeur** : agence Forte ; ImmoTopia Forte
- **Prérequis et décisions métier** :
  - Q-A3-1 — L'ajout est-il libre-service sans validation ImmoTopia ? Options : (a) oui, immédiat ; (b) demande puis validation comme aujourd'hui ; recommandée : (a) pour les offres vendables, parce que le prix est fixé par le catalogue ; (b) reste pour les offres non vendables.
  - Q-A3-2 — Seuils des incitations. Options : (a) 80 % et 100 % comme les e-mails ; (b) 100 % et refus seulement ; recommandée : (a) parce que le seuil existe déjà dans `crossedThresholds`.
  - Q-A3-3 — Blocs SMS : lancer la capacité SMS ? Options : (a) oui, lot séparé après mise en service du fournisseur ; (b) non pour l'instant ; recommandée : (b) tant que le nom d'expéditeur n'est pas approuvé (`HANDOFF.md:116`) ; taille du bloc et prix à fixer par le propriétaire.
  - Q-A3-4 — Rôle autorisé à acheter. Options : (a) `TENANT_ADMIN` ; (b) aussi comptable ; recommandée : (a).
  - Q-NEW-3 (voir section 5) — Empilement du quota Signatures : quota inclus et blocs `EXT_SIGNATURES_SUPPLEMENTAIRES`, puis crédits prépayés (D3), puis surcoût facturé (D4) ou refus ; recommandé : cet ordre, à valider avant d'ouvrir D3 et D4.
  - Q-A3-5 — Comptage mensuel civil contre période d'abonnement pour les consommations : garder le mois civil UTC (a) ou aligner sur la période (b) ? Recommandée : (a), règle existante de la spec 044.
- **Mise en œuvre sûre** : commencer par l'exposition des `QuotaAlert` et les cartes en lecture seule, puis l'ajout derrière un réglage ; les demandes manuelles restent en service pendant toute la transition.

#### A4 — Historique d'abonnement et centre de facturation

- **Statut** : Extension de l'existant. Existent : liste, détail et PDF des factures (`routes/platform-invoice-routes.ts`, composant `components/subscription/TenantInvoicesSection.tsx`), et un journal d'activité d'agence filtrable par catégorie `BILLING` (`pages/tenant/TenantActivityLog.tsx:97`, `routes/tenant-audit-routes.ts:18`, événements `tenant('BILLING')` dans `types/audit-catalog.ts:89-110`). Le relevé de compte est décrit dans la spec 045 §3.8, non livrée. Reçus et demande d'avoir sont absents.
- **Problème** : l'agence ne voit nulle part « qui a ajouté ou retiré quoi, quand » à côté de ses factures : le journal est dans un autre menu et n'est pas orienté abonnement. Aucun reçu de paiement n'existe (aucune occurrence de reçu dans `lib/subscription` ni `services/platform-*.ts`) alors que `PlatformInvoicePayment` porte mode, référence et date (`schema.prisma:9475`). Seul le super-admin peut émettre un avoir (`routes/platform-invoice-routes.ts`, route `credit-note`, `platform-invoice-service.ts:782`).
- **Valeur pour l'agence** : une page unique pour retrouver ses factures, ses reçus et l'historique de son abonnement, utile à sa comptabilité et à ses audits internes.
- **Valeur pour ImmoTopia** : moins de demandes de justificatifs, litiges plus faciles à trancher, point d'entrée propre pour les demandes d'avoir (B4).
- **Description fonctionnelle** :
  - Page « Facturation » (`TenantBillingSettings.tsx`) à onglets : Factures (existant), Historique, Reçus, Demandes.
  - Historique : chronologie fusionnant `SubscriptionItem` (ajout `startsAt`/`addedByUserId`, fin `endsAt`/`endReason`/`endedByUserId`), factures émises, avoirs, paiements et événements d'audit de visibilité agence uniquement ; chaque ligne indique l'auteur (prénom et nom via `select`, jamais l'objet `User` complet).
  - Reçus : pour chaque facture PAID, bouton « Reçu » (PDF fr et ar comme la facture) avec date, mode, référence, montant ; aucun reçu pour un avoir.
  - Demande d'avoir : bouton sur une facture émise ou payée, motif obligatoire, pièce jointe facultative ; crée la demande traitée par B4 ; statut visible (ouverte, acceptée, refusée, remboursée).
  - Filtres de période, export CSV par la primitive `Table`, libellés `t()` fr/en/ar, mise en page RTL.
  - Cas limites : événements internes (`internal('BILLING')`, par exemple `CAPACITY_OVERRIDE_GRANTED`) jamais affichés ; facture annulée par avoir : lien vers l'avoir ; paiement en cours de vérification (`REVIEW`) affiché comme tel.
- **Dépendances dans le code existant** : `getTenantAuditLogsHandler` et sa visibilité (`services/audit-read-service.ts`) pour l'historique ; `renderPlatformInvoicePdf` (`platform-invoice-service.ts:1115`) comme modèle de reçu ; `toPaymentDto` (`platform-payment-service.ts:120`) ; tables `InvoiceCreditRequest` (à créer, partagée avec B4) ; route de lecture `GET /subscription/history` (à créer), filtrée par `tenantId`.
- **Effort** : M — agrégation de sources existantes, un PDF de reçu et un formulaire ; la logique d'avoir vit dans B4.
- **Risque** : sécurité tenant : un historique mal filtré pourrait exposer une action interne du super-admin ou l'identité d'un utilisateur d'une autre agence ; garde-fou = filtre sur la visibilité de l'événement et sur `tenantId`, test d'isolation. Conformité : un « reçu » peut avoir une valeur comptable (voir Q-A4-1).
- **Valeur** : agence Moyenne ; ImmoTopia Moyenne
- **Prérequis et décisions métier** :
  - Q-A4-1 — Numérotation du reçu. Options : (a) pas de numéro propre, il reprend le numéro de facture ; (b) série dédiée continue ; recommandée : (a) pour la première livraison, la valeur légale d'un reçu est à valider avec l'expert-comptable.
  - Q-A4-2 — Qui voit l'historique et les reçus ? Options : (a) `TENANT_SETTINGS_VIEW` (donnée aussi à `TENANT_MANAGER` et `TENANT_AGENT`, `rbac-seed.ts:242, 293`) ; (b) administrateur et comptable seulement ; recommandée : (b) parce que les montants et les auteurs sont sensibles. Attention : le comptable n'a que des permissions `BILLING_*` et n'atteint pas Facturation aujourd'hui (l'entrée de menu exige `TENANT_SETTINGS_VIEW`, `menu-catalog.ts:252`) ; (b) suppose donc une règle de menu et de route acceptant `BILLING_VIEW`, ou une permission dédiée.
  - Q-A4-3 — Faut-il afficher les actions du super-admin (par exemple dérogation de capacité) ? Options : (a) non ; (b) oui sans motif ; recommandée : (a).
  - Q-A4-4 — Durée d'affichage de l'historique. Options : (a) illimitée ; (b) limitée par la rétention du journal d'audit ; recommandée : (b) pour rester cohérent avec `audit-retention-service.ts`.
- **Mise en œuvre sûre** : livrer l'historique en lecture seule d'abord (aucune écriture), puis les reçus, puis la demande d'avoir avec B4 ; chaque onglet se masque sans toucher aux factures.

### Thème B — Facturation et paiement

Les factures de plateforme sont émises automatiquement, numérotées sans trou (`IMT-AAAA-NNNNN`) et payables en ligne via PaySecureHub, mais le mode réel n'est pas validé (`docs/integrations/paysecurehub.md:111`, la production tourne en `SIMULATOR` pour les abonnements, `HANDOFF.md:116`).
Ces cinq propositions comblent ce qui manque entre l'émission et l'encaissement : lien de paiement, relances, cycles, avoirs et conformité des mentions. Aucun montant n'est fixé ici : tout est paramètre à décider par le propriétaire.

#### B1 — Paiement mobile money par lien de paiement, avec reconduction optionnelle

- **Statut** : Extension de l'existant. Le paiement en ligne d'une facture existe pour un utilisateur connecté : bouton « Payer en ligne » (`components/subscription/TenantInvoicesSection.tsx:239`) puis `startInvoiceCheckout` (`services/platform-payment-service.ts:529`). Les moyens Orange, Wave, MTN et Moov passent par la page PaySecureHub (`specs/026-particuliers-libre-service/spec.md:75-76`). Lien public et reconduction sont absents.
- **Problème** : l'e-mail de facture renvoie vers `/settings/facturation`, qui exige une connexion (`platform-invoice-service.ts:1185-1191`) ; une agence en lecture seule doit d'abord se connecter pour payer. Aucun mécanisme de reconduction : le prélèvement des abonnements est « plus tard, P6 non planifié » (`specs/042-prelevement-bancaire/spec.md:47,77`). Une agence qui paie par virement ou par transfert mobile direct ne peut pas déclarer son paiement : seul le super-admin constate (`recordManualPayment`, `platform-payment-service.ts:411`).
- **Valeur pour l'agence** : payer depuis son téléphone en un clic depuis l'e-mail ou un message, sans mot de passe, avec le moyen de paiement habituel de la région.
- **Valeur pour ImmoTopia** : encaissements plus rapides et moins de relances manuelles ; trace automatique du moyen réel utilisé (`providerServiceName`, `schema.prisma:9500`).
- **Description fonctionnelle** :
  - Lien sécurisé par facture : réutiliser `lib/secure-links` (comme le lien de loyer, `lib/payment-gateway/installment-payment-link.ts:41-96`) avec une nouvelle portée `PLATFORM_INVOICE_PAYMENT` (à créer dans `SecureLinkScope`, `schema.prisma:1092`). Le montant n'est jamais dans le lien : il est relu de la facture à chaque ouverture ; un lien = une facture ; expiration et révocation.
  - Page publique de paiement (route à créer) : résumé de la facture (numéro, période, TTC), bouton « Payer », puis redirection vers PaySecureHub ; retour avec statut ; facture déjà payée, annulée ou à zéro : page « rien à régler ». Même message d'erreur public pour tout lien invalide.
  - Diffusion : lien ajouté à l'e-mail de facture et aux relances (B2) ; SMS ou WhatsApp en option selon les fournisseurs en service.
  - Déclaration de paiement (variante) : l'agence qui a payé hors PaySecureHub saisit mode, référence et capture ; le super-admin valide (modèle de la spec 047, `specs/047-syndic-paiement-declare/spec.md`) ; seul le constat valide crée le règlement, par `recordManualPayment`.
  - Reconduction optionnelle : (i) « rappel avec lien » à chaque nouvelle facture, sans mandat conservé ; (ii) paiement automatique à chaque échéance uniquement si l'agrégateur le permet : non vérifié dans le dépôt, à confirmer avec PaySecureHub avant toute conception ; (iii) prélèvement bancaire par mandat de la spec 042 (hors périmètre livré, P6). Consentement explicite et révocable dans l'écran Facturation.
  - Cas limites : paiement en cours (`409` avec reprise de 15 min, `platform-payment-service.ts:546-558`) ; montant reçu différent → `REVIEW` (`platform-payment-service.ts:715-721`) ; double notification (règlement unique par facture, `schema.prisma:9478`) ; avoir et facture à zéro non payables (`PAYABLE_INVOICE_STATUSES`, `platform-payment-service.ts:59`).
- **Dépendances dans le code existant** : `startInvoiceCheckout` accepte déjà `actorUserId` nul ; `settlePlatformInvoiceTx` (`platform-payment-service.ts:188`) reste la porte unique du règlement ; `sendPlatformInvoiceEmail` (`platform-invoice-service.ts:1157`) ; `SecureLinkScope` (migration, valeur à créer) ; table `PlatformInvoicePaymentDeclaration` (à créer) pour la déclaration ; champ de consentement de reconduction (à créer, par exemple sur `Subscription.metadata`, à décider).
- **Effort** : L — lien public, page publique, déclaration et reconduction ; le mode réel de l'agrégateur n'est de toute façon pas validé.
- **Risque** : finance : créditer la mauvaise facture ou débiter sans accord ; garde-fou = lien lié à `tenantId` + `invoiceId`, montant relu côté serveur, aucun prélèvement sans consentement enregistré. Sécurité : endpoint public à limiter en débit, jeton haché (comme `SecureLink.tokenHash`), aucune donnée d'agence dans l'URL.
- **Valeur** : agence Forte ; ImmoTopia Forte
- **Prérequis et décisions métier** :
  - Q-B1-1 — Canal d'envoi du lien. Options : (a) e-mail seul ; (b) e-mail et SMS ; (c) e-mail, SMS et WhatsApp ; recommandée : (a) en premier, parce que SMS et WhatsApp ne sont pas encore en service (`HANDOFF.md:116`).
  - Q-B1-2 — Reconduction. Options : (a) aucune ; (b) rappel avec lien à chaque facture ; (c) prélèvement automatique si l'agrégateur le supporte (non vérifié) ; (d) prélèvement bancaire de la spec 042 (`DirectDebitMandate`, remises mensuelles, IBAN chiffré ; `specs/042-prelevement-bancaire`), alternative réelle à l'agrégateur mais dont le périmètre livré est le locatif et la copropriété, les abonnements (P6) étant non planifiés, et ImmoTopia devant y être créancier ; recommandée : (b) parce qu'elle n'exige ni mandat ni capacité technique non vérifiée ; (d) à instruire plus tard.
  - Q-B1-3 — Déclaration manuelle de paiement ouverte aux agences ? Options : (a) oui avec validation super-admin ; (b) non ; recommandée : (a) parce que le mode réel n'est pas encore validé.
  - Q-B1-4 — Durée de validité du lien. Options : (a) jusqu'à l'échéance + délai de grâce ; (b) durée fixe ; recommandée : (a), valeur exacte à fixer par le propriétaire.
  - Q-B1-5 — Frais d'opérateur (`providerFees`) : à la charge de qui ? Options : (a) ImmoTopia ; (b) ajoutés à l'agence ; recommandée : (a) tant que le tarif n'est pas décidé.
- **Mise en œuvre sûre** : livrer le lien d'abord pour les seules factures en simulateur (recette sans argent réel), puis la déclaration ; la reconduction n'arrive qu'après validation du mode réel.

#### B2 — Relances automatiques graduées des factures impayées

- **Statut** : Extension de l'existant. Délai de grâce, lecture seule et réactivation au paiement existent ; les relances graduées n'existent pas.
- **Problème** : un seul message part quand l'abonnement devient `PAST_DUE` (`jobs/subscription-usage-job.ts:274-282`) et un seul à l'entrée en lecture seule (`subscription-usage-job.ts:296-302`). Le passage d'une facture à `OVERDUE` ne notifie personne (`services/platform-invoice-service.ts:753-766`). Les seuls rappels programmés concernent la fin d'essai, à J-7 et J-1 (`subscription-usage-job.ts:464-500`). L'échéance de la facture de période est le début de période plus `graceDays` (`platform-invoice-service.ts:287`) : elle coïncide donc avec l'entrée en lecture seule, sans aucun message intermédiaire.
- **Valeur pour l'agence** : être prévenue avant de perdre l'accès en écriture, avec le lien pour payer, et retrouver l'accès sans démarche au paiement (déjà vrai, `platform-payment-service.ts:267-312`).
- **Valeur pour ImmoTopia** : moins d'impayés « oubliés », moins de relances manuelles du super-admin, suivi des retards au même endroit.
- **Description fonctionnelle** :
  - Calendrier de relances paramétrable, exprimé en jours relatifs à l'échéance (valeurs à fixer par le propriétaire) : rappel avant échéance, relance à l'échéance, relances de retard, avertissement de lecture seule imminente, avis de lecture seule, avis de réactivation.
  - Chaque envoi : e-mail avec numéro, montant TTC, échéance, lien de paiement (B1) ; SMS optionnel ; bandeau dans l'application tant que la facture est impayée.
  - Traçabilité : journal `DunningEvent` (à créer : agence, facture, étape, canal, date) qui garantit l'idempotence du passage quotidien (`runSubscriptionUsageCycle`, 02:30 UTC) au lieu du marqueur dans `metadata` utilisé pour les rappels d'essai.
  - Super-admin : dans la liste des abonnements (`listSubscriptionSummaries`, `subscription-admin-extras-service.ts:424`), colonne « étape de relance » et montant en retard ; boutons « Relancer maintenant » et « Suspendre les relances » (réglage par agence, motif obligatoire).
  - Règle D15 conservée : une facture de dépassement impayée reçoit des relances mais n'a aucun effet sur l'abonnement (`PLAN-ABONNEMENTS.md` §6 quater) ; règle D16 : un paiement n'avance qu'une période, les relances suivent la facture la plus ancienne impayée.
  - Cas limites : paiement en cours (checkout `PENDING`) suspend l'envoi ; abonnement gratuit exclu (`isFreeSubscription`) ; lecture seule manuelle sans relance de paiement ; facture annulée ou payée entre deux passages : étape annulée ; espace PARTICULIER : pas de copie super-admin (`subscription-usage-job.ts:174-178`).
- **Dépendances dans le code existant** : `processBillingBoundary` et `notify` (`subscription-usage-job.ts:199,167`) ; `markOverdueInvoices` (`platform-invoice-service.ts:753`) ; `resolveSubscriptionPhase` (`lib/subscription/entitlements.ts:285`, inchangé) ; `updateSubscriptionSettings` (`subscription-v2-service.ts:1309`) pour le calendrier par agence ; textes dans `i18n/index.ts` côté API (fr, en, ar). Modèles : `DunningEvent` (à créer), réglage global du calendrier (à créer).
- **Effort** : M — ajout d'une étape dans la tâche quotidienne et d'un journal, sans changer les phases.
- **Risque** : finance : relancer un montant faux ou une facture déjà payée ; garde-fou = montant relu de la facture à l'envoi, vérification du statut juste avant. Conformité : messages envoyés au bon destinataire seulement (`agencyAdminRecipients`), jamais à un autre tenant.
- **Valeur** : agence Moyenne ; ImmoTopia Forte
- **Prérequis et décisions métier** :
  - Q-B2-1 — Calendrier. Options : (a) trois étapes (avant échéance, échéance, lecture seule) ; (b) cinq étapes ou plus ; recommandée : (a) parce que le délai total est court ; décalages exacts à fixer par le propriétaire.
  - Q-B2-2 — Canaux. Options : (a) e-mail ; (b) e-mail et SMS ; recommandée : (a) en premier (SMS non en service, `HANDOFF.md:116`).
  - Q-B2-3 — Le passage en lecture seule reste-t-il fixé par `graceDays` ? Options : (a) oui, relances calées dessus ; (b) délai de relance distinct ; recommandée : (a) pour ne pas changer D8.
  - Q-B2-4 — Copie au super-admin de chaque relance. Options : (a) oui ; (b) résumé quotidien ; recommandée : (b).
  - Q-B2-5 — Facturer des frais de retard ? Options : (a) non ; (b) oui ; recommandée : (a) tant que le texte contractuel n'est pas validé (voir B5).
- **Mise en œuvre sûre** : activer d'abord le journal en mode « à blanc » (calcule et trace sans envoyer) pendant un cycle, puis l'envoi ; un interrupteur global coupe tout.

#### B3 — Cycles annuel et trimestriel, remise annuelle paramétrable, échéancier

- **Statut** : Extension de l'existant. Mensuel et annuel (11 mensualités) existent ; trimestriel, remise paramétrable et échéancier n'existent pas.
- **Problème** : le cycle est une énumération à deux valeurs (`schema.prisma:62-65`) et la remise annuelle est la constante `ANNUAL_MONTHS = 11` (`lib/subscription/catalog.ts:88`, `pricing.ts:236-244`). Le cycle se fixe à la création ou par le `PATCH` historique de l'abonnement, qui réécrit `currentPeriodEnd` sans facture ni prorata (`services/subscription-service.ts:97-104`, `controllers/subscription-controller.ts:35`) ; `updateSubscriptionSettings` ne le gère pas (`subscription-v2-service.ts:1309`). Une facture annuelle est un seul règlement, intégral : un paiement dont le montant diffère part en `REVIEW` (`platform-payment-service.ts:715-721`) et `PlatformInvoicePayment.invoiceId` est unique (`schema.prisma:9478`), donc aucun paiement partiel.
- **Valeur pour l'agence** : engagement plus long contre un prix moindre, ou rythme de paiement adapté à sa trésorerie.
- **Valeur pour ImmoTopia** : trésorerie anticipée, moins de factures à émettre et à relancer, fidélisation.
- **Description fonctionnelle** :
  - Paramètres de plateforme (écran super-admin à créer) : nombre de mensualités facturées par cycle annuel et trimestriel (valeurs à fixer par le propriétaire ; aujourd'hui 11 en annuel) ; ils remplacent la constante et sont figés dans la facture.
  - Changement de cycle par l'agence, effectif à la prochaine échéance seulement (jamais au milieu d'une période), avec aperçu du premier montant et du suivant (moteur de A1) ; le super-admin garde l'application immédiate avec prorata chiffré.
  - Échéancier optionnel d'un cycle annuel : N tranches planifiées (dates et montants proposés, TVA ventilée) ; chaque tranche est payable par lien (B1) ; la facture annuelle reste UNE facture, les règlements deviennent plusieurs.
  - Règles d'état : une tranche impayée suit le calendrier de relances (B2) ; l'abonnement n'avance qu'une période par paiement complet (D16) ; le dépassement garde ses fenêtres mensuelles en annuel (`monthlyOverageWindow`, `subscription-v2-service.ts:1524`) ; pour le trimestriel, règle à décider (Q-B3-4).
  - Cas limites : prorata en cours de période multiplié par le facteur du cycle (`subscription-v2-service.ts:1107`) ; pack Intégré annuel, montant élevé (exemple du plan, `PLAN-ABONNEMENTS.md` §5) ; changement de cycle avec lignes en attente ; arrondis en FCFA entiers (`roundFcfa`).
  - Anomalie à corriger en passant : le `PATCH` historique doit refuser un changement de cycle (renvoyer vers l'aperçu et l'échéance).
- **Dépendances dans le code existant** : `BillingCycle` (`schema.prisma:62`, valeur `QUARTERLY` à créer, migration) ; `cycleMultiplier`, `addBillingPeriod` (`pricing.ts:236,252`) ; `buildPlatformInvoiceDraft` (`platform-invoice-service.ts:222`) ; index unique `invoices_platform_period_key` (`PLAN-ABONNEMENTS.md` §6 quater) ; `settlePlatformInvoiceTx` (règlements multiples, relâcher l'unicité de `PlatformInvoicePayment.invoiceId`, à décider) ; table `InvoiceInstallment` (à créer).
- **Effort** : L — énumération, moteur de facturation, règlements partiels et règle d'état se touchent tous.
- **Risque** : finance, le plus élevé du thème : double facturation au changement de cycle ou règlement partiel mal imputé ; garde-fou = changement à l'échéance uniquement, aperçu obligatoire, drapeau par agence, tests sur les exemples de `__tests__/unit/subscription.pricing.test.ts`. Conformité : une remise annuelle fait partie de l'offre commerciale, à faire figurer sur la facture.
- **Valeur** : agence Moyenne ; ImmoTopia Forte
- **Prérequis et décisions métier** :
  - Q-B3-1 — Ajouter le cycle trimestriel ? Options : (a) oui ; (b) non, garder mensuel et annuel ; recommandée : (b) pour la première livraison, parce qu'il alourdit surtout la règle de dépassement.
  - Q-B3-2 — Remise annuelle. Options : (a) garder « une mensualité offerte » ; (b) la rendre paramétrable ; recommandée : (b) pour ne plus dépendre d'une constante, valeur décidée par le propriétaire.
  - Q-B3-3 — Échéancier : lancer l'étalement d'une facture annuelle ? Options : (a) oui, sur demande ; (b) non ; recommandée : (b) tant que les règlements partiels ne sont pas conçus (risque cité plus haut).
  - Q-B3-4 — Dépassement en trimestriel. Options : (a) fenêtres mensuelles comme l'annuel ; (b) facturé avec la facture du trimestre ; recommandée : (a) pour réutiliser la règle annuelle.
  - Q-B3-5 — Qui change le cycle ? Options : (a) l'agence à l'échéance ; (b) super-admin seulement ; recommandée : (a).
- **Mise en œuvre sûre** : d'abord la remise paramétrable et le blocage du `PATCH` historique (sans nouveau cycle), puis le changement de cycle à l'échéance ; trimestriel et échéancier derrière un drapeau.

#### B4 — Avoirs et remboursements de prorata, demande en libre-service, validation super-admin

- **Statut** : Extension de l'existant. L'avoir TOTAL d'une facture existe côté super-admin (`services/platform-invoice-service.ts:782-935`). Demande par l'agence, avoir partiel et suivi du remboursement n'existent pas.
- **Problème** : l'avoir annule la facture entière : ses lignes sont opposées et la facture passe `CANCELED` ; un seul avoir par facture (index `invoices_credit_note_key`, `PLAN-ABONNEMENTS.md` §6 quater). Si la facture était payée, l'avoir porte `REFUND_DUE` dans `paymentMethod` (`platform-invoice-service.ts:836-837`) et plus rien ne suit : aucun écran, aucune file, aucun statut de remboursement (la valeur n'est lue nulle part ailleurs ; `InvoiceStatus.REFUNDED`, `schema.prisma:75-83`, n'est posable que par le `PATCH` historique, `controllers/subscription-controller.ts:50`). Le retrait immédiat se fait « sans remboursement » (`PLAN-ABONNEMENTS.md` §6, D7).
- **Valeur pour l'agence** : demander une correction ou un remboursement avec une trace, et connaître l'issue de sa demande.
- **Valeur pour ImmoTopia** : file de travail claire pour le super-admin, décisions auditées, moins d'échanges hors outil.
- **Description fonctionnelle** :
  - Côté agence (entrée depuis A4) : « Demander un avoir » sur une facture émise ou payée : motif dans une liste fermée plus texte, montant demandé facultatif ; statuts ouverte, acceptée, refusée, remboursée.
  - Côté super-admin : file des demandes (modèle de `SubscriptionExtensionRequest`, `schema.prisma:9661`) ; fiche avec facture, lignes, paiement, consommation ; actions Accepter (total ou partiel), Refuser avec motif.
  - Avoir partiel : choix de lignes ou d'un montant HT, TVA recalculée en FCFA entier ; il faut lever la contrainte « un avoir par facture » ou la remplacer par un plafond cumulé (décision de conception).
  - Prorata d'un retrait immédiat ou d'un arrêt de service : montant proposé par `prorateAmount` (`pricing.ts:281`) sur les jours non consommés, modifiable par le super-admin avec motif.
  - Issue de l'avoir : (i) crédit reporté sur la prochaine facture (ligne `CREDIT` en attente, `invoiceId` nul, `schema.prisma:1623`, mécanisme déjà utilisé par les montées) ; (ii) remboursement hors ligne suivi dans une liste « À rembourser » (mode, référence, date, statut) qui remplace le simple marqueur `REFUND_DUE`.
  - Cas limites : facture impayée → compensation sans flux d'argent ; paiement en ligne PaySecureHub : remboursement par l'agrégateur non prévu dans le dépôt, donc hors ligne ; numérotation continue des avoirs conservée ; double demande sur la même facture refusée ; audit critique `INVOICE_CREDIT_NOTE_ISSUED` (`types/audit-catalog.ts`).
- **Dépendances dans le code existant** : `issueCreditNote` et l'inversion de lignes (`lib/subscription/platform-invoice.ts:114` (`creditNoteLines`)) ; `removeSubscriptionItem` (`subscription-v2-service.ts:876`) ; `InvoicesTab.tsx` côté admin ; tables `InvoiceCreditRequest` et `PlatformRefund` (à créer) ; permission existante `PLATFORM_INVOICES_EDIT`.
- **Effort** : L — avoir partiel, file de demandes et suivi de remboursement touchent le cœur de la facturation.
- **Risque** : finance : avoir erroné ou fraude de remboursement ; garde-fou = validation super-admin obligatoire, montant plafonné au payé, motif et auteur audités, jamais de remboursement automatique. Conformité : l'avoir est un document comptable numéroté (voir B5).
- **Valeur** : agence Moyenne ; ImmoTopia Moyenne
- **Prérequis et décisions métier** :
  - Q-B4-1 — Politique de remboursement du prorata. Options : (a) jamais (règle D7 actuelle) ; (b) au cas par cas sur décision du super-admin ; (c) automatique dans des cas définis ; recommandée : (b) parce qu'elle ne modifie pas D7 et reste réversible.
  - Q-B4-2 — Avoir partiel autorisé ? Options : (a) non, total seulement ; (b) oui ; recommandée : (b) mais seulement après avoir tranché l'index « un avoir par facture ».
  - Q-B4-3 — Forme de la restitution. Options : (a) crédit sur la facture suivante ; (b) remboursement en espèces ou mobile money ; recommandée : (a) par défaut, (b) sur validation explicite.
  - Q-B4-4 — Double validation au-delà d'un seuil ? Options : (a) non ; (b) oui, seuil à fixer par le propriétaire ; recommandée : (b).
  - Q-B4-5 — Délai maximal pour demander un avoir après l'émission. Options : (a) sans limite ; (b) délai fixé par le propriétaire ; recommandée : (b).
- **Mise en œuvre sûre** : d'abord la file de demandes et le suivi « À rembourser » (aucun changement de calcul), puis l'avoir partiel ; l'avoir total actuel reste inchangé.

#### B5 — TVA et mentions légales des factures de plateforme pour la Côte d'Ivoire

- **Statut** : Extension de l'existant (conformité). Ce lot n'arrête aucune règle fiscale : il rend les mentions paramétrables, contrôlées et validées par un professionnel. Tout point fiscal ci-dessous est « à valider avec l'expert-comptable ».
- **Problème** : trois constats. (1) L'émetteur n'est contrôlé nulle part : les variables `PLATFORM_ISSUER_*` sont facultatives (`config/env.ts:261-266`, `env.example:117-122` laisse RCCM, compte contribuable, adresse et téléphone vides) : une facture peut sortir sans RCCM ni identifiant fiscal. (2) Le taux est la constante 18 % (`lib/subscription/catalog.ts:96`), appliquée à toutes les agences, y compris hors Côte d'Ivoire (le plan cite une agence malienne, `PLAN-ABONNEMENTS.md` §10) ; il est stocké par facture (`Invoice.taxRate`, `schema.prisma:1376`). (3) Le PDF n'imprime ni conditions de paiement, ni mode de règlement, ni mention de retard ; certains textes sont en dur, sans accent et hors `t()` (« Reglee le », « Montant a regler » : `lib/subscription/platform-invoice-pdf.ts:268,271`).
- **Valeur pour l'agence** : factures utilisables en comptabilité sans correction, avec ses propres identifiants fiscaux (le compte contribuable client est déjà repris de `finance?.taxpayerNumber`, `platform-invoice-service.ts:120`).
- **Valeur pour ImmoTopia** : réduction du risque de redressement ou de rejet, preuve que les mentions ont été validées, évolution du taux sans déploiement.
- **Description fonctionnelle** :
  - Écran super-admin « Mentions légales de la plateforme » : identité de l'émetteur, RCCM, identifiant fiscal, adresse, contact, coordonnées de paiement, texte de conditions de paiement (rédigé par le propriétaire, jamais par le code) ; chaque modification est auditée et applicable aux factures à venir seulement (les factures émises gardent leur `issuerSnapshot`).
  - Contrôle : en production, refuser l'émission (ou alerter selon un réglage) tant que le jeu minimal de mentions n'est pas complet ; état affiché dans l'écran. Le jeu minimal exact est à valider avec l'expert-comptable.
  - Taux de TVA : paramètre de plateforme avec date d'effet, figé dans chaque facture ; règles par pays ou par statut d'agence (exonérée, hors territoire) à décider, aucune règle n'est devinée dans le code.
  - Avoirs : mention explicite « annule la facture n° … » ; TVA inversée (comportement actuel de `creditNoteLines`, `lib/subscription/platform-invoice.ts:114`) vérifiée avec l'expert-comptable.
  - PDF : passer tous les textes par `t()` (fr, en, ar), corriger les accents, afficher conditions de paiement et lien de paiement (B1) ; une facture arabe garde la version française comme référence.
  - Numérotation : la série continue `IMT-AAAA-NNNNN` (`lib/subscription/platform-invoice.ts:19`) reste la seule ; la route historique `POST /api/admin/tenants/:tenantId/invoices` génère des numéros `INV-…` hors série (`routes/admin-routes.ts:224`, `services/invoice-service.ts:10-16`) : à désactiver pour les factures PLATFORM.
  - Facturation électronique imposée par l'administration fiscale : existence, périmètre et calendrier à valider avec l'expert-comptable ; le lot prévoit seulement un point d'extension (statut de transmission), sans engagement.
- **Dépendances dans le code existant** : `platformIssuer()` (`platform-invoice-service.ts:84`) ; `finalizeInvoice` (`pricing.ts:366`) ; `customerOf` ; `platform-invoice-pdf.ts` et `platform-invoice-pdf-ar.ts` ; `config/env.ts` ; modèle `PlatformBillingSettings` (à créer, ligne unique comme `PlatformAiSettings`, `schema.prisma:1453`) ; migration additive.
- **Effort** : M — peu de logique de calcul, mais paramétrage, contrôle d'émission, PDF et validation externe.
- **Risque** : conformité : document légal inexact ; garde-fou = aucune mention inventée, validation écrite de l'expert-comptable avant activation, effet non rétroactif grâce aux instantanés, test de PDF de référence. Finance : modifier un taux ne doit jamais toucher une facture émise.
- **Valeur** : agence Moyenne ; ImmoTopia Forte
- **Prérequis et décisions métier** :
  - Q-B5-1 — Jeu de mentions obligatoires. Options : (a) garder l'existant (nom, RCCM, compte contribuable, TVA) ; (b) étendre selon la liste de l'expert-comptable ; recommandée : (b), liste à valider avec l'expert-comptable.
  - Q-B5-2 — Bloquer l'émission si les mentions de l'émetteur manquent en production ? Options : (a) oui ; (b) alerte seule ; recommandée : (a) parce qu'une facture sans identifiant fiscal est un risque certain.
  - Q-B5-3 — TVA pour les agences hors Côte d'Ivoire. Options : (a) même taux ; (b) exonération ou autre règle ; (c) sujet reporté ; recommandée : (c) en attendant l'avis de l'expert-comptable, sans changer le comportement actuel.
  - Q-B5-4 — Taux de TVA paramétrable avec date d'effet ? Options : (a) oui ; (b) constante ; recommandée : (a) pour absorber un changement sans déploiement ; valeur à confirmer par l'expert-comptable.
  - Q-B5-5 — Texte de pénalités et de conditions de paiement : (a) fourni par le propriétaire ; (b) absent ; recommandée : (a), contenu à valider avec l'expert-comptable ou un juriste.
  - Q-B5-6 — Désactiver la création de facture PLATFORM par la route historique ? Options : (a) oui ; (b) non ; recommandée : (a).
- **Mise en œuvre sûre** : commencer par le contrôle des mentions et la correction des textes du PDF (aucun calcul touché), puis les paramètres ; chaque étape se coupe par un réglage.

### Thème C — Dunning et rétention

Une agence qui part ou qui interrompt son activité n'a aujourd'hui aucun parcours : l'annulation est réservée au super-admin, sans motif, sans offre, sans export côté agence, et le statut `SUSPENDED` signifie seulement lecture seule.
Ces deux propositions donnent une porte de sortie maîtrisée (résilier) et une porte de côté (mettre en pause) qui conservent le client et ses données ; elles s'appuient sur A2, B2 et B4 pour la partie prix et relances.

#### C1 — Parcours de résiliation avec motif, offre de rétention et export des données

- **Statut** : Extension de l'existant. `cancelSubscription` existe (`services/subscription-service.ts:161-208`), appelable par le super-admin seulement (`routes/admin-routes.ts:107-109`) ; la spec 045 AL-C3 renvoie la résiliation à ImmoTopia (« Pour résilier, contactez ImmoTopia »). L'export complet existe, réservé au super-admin (`routes/tenant-data-export-routes.ts:26-30`, `requireSuperAdmin`, modèle `TenantDataExport`, `schema.prisma:9693`).
- **Problème** : l'annulation fixe `status = CANCELED` et `cancelAt` à la fin de période, sans motif ni trace du raisonnement (`subscription-service.ts:181-185`). Pendant la période restante, l'agence reste active (`lib/subscription/entitlements.ts:306-322`) mais la tâche d'abonnement ne la traite plus (`LIVE_STATUSES` exclut `CANCELED`, `jobs/subscription-usage-job.ts:58-62`) : plus de relevés ni d'alertes. Les éléments d'abonnement ne sont pas terminés. Le contrôleur devine le statut HTTP à partir du message d'erreur (`controllers/subscription-controller.ts:171-190`) et le service lève des `Error` nues (`subscription-service.ts:167,171`), contre la règle des erreurs typées d'`AGENTS.md`. Le message de lecture seule promet des données « exportables » (`subscription-usage-job.ts:299-300`) mais l'agence ne peut pas déclencher l'export global.
- **Valeur pour l'agence** : partir proprement, récupérer ses données, ne plus être facturée au-delà de la période payée, ou obtenir une alternative moins coûteuse.
- **Valeur pour ImmoTopia** : motifs de départ mesurés, chance de conserver le client, risque d'impayé et de litige réduit, conformité sur la restitution des données.
- **Description fonctionnelle** :
  - Écran « Résilier mon abonnement » (dans Abonnement, réservé à `TENANT_ADMIN`) en étapes : (1) motif (liste fermée + commentaire facultatif) ; (2) offre de rétention selon le motif : pause (C2), rétrogradation de pack (A2), remise temporaire (règle et montant à fixer par le propriétaire), ou aucune ; (3) récapitulatif et export ; (4) confirmation par saisie du nom de l'agence.
  - Effet par défaut : fin à l'échéance de la période payée (`cancelAt = currentPeriodEnd`), accès normal jusqu'à cette date, puis lecture seule ; aucun remboursement (D7), la demande éventuelle passe par B4 ; les factures déjà émises restent dues.
  - Avertissements chiffrés avant confirmation : nombre de baux actifs, mandats, copropriétés et chantiers, signatures en cours ; rappel que les portails et paiements des locataires ne sont jamais bloqués (`PLAN-ABONNEMENTS.md` §6).
  - Export : l'agence lance l'archive de ses données avant la fin (version agence du `TenantDataExport`, archive privée jamais servie en statique, chemin jamais exposé) ; durée de conservation des données après la fin à décider.
  - Annulation de la résiliation par l'agence tant que `cancelAt` n'est pas passée : retour à `ACTIVE`, sans perdre l'historique (`canceledAt` conservé dans un journal).
  - Super-admin : tableau des résiliations (date, motif, offre proposée et acceptée, export fait) ; e-mail de confirmation à l'agence et au super-admin ; audit critique `SUBSCRIPTION_CANCELED` (`types/audit-catalog.ts:91`).
  - Cas limites : facture ouverte ou `PAST_DUE` ; abonnement annuel ; abonnement gratuit ou Particulier (archivage plutôt que résiliation, à décider) ; double demande ; pack Intégré avec extensions liées (elles suivent le pack, `PLAN-ABONNEMENTS.md` §6) ; données de plusieurs copropriétaires.
- **Dépendances dans le code existant** : `cancelSubscription` (à refondre en erreurs typées) ; `services/tenant-data-export/export-service.ts` et `DataExportTab.tsx` ; `resolveSubscriptionPhase` (`entitlements.ts:285`) ; `applyDueItemTransitionsTx` pour terminer les éléments à la date d'effet ; table `SubscriptionCancellation` (à créer : agence, motif, commentaire, offre acceptée, `requestedByUserId`, `effectiveAt`, `withdrawnAt`) ; permission `TENANT_SUBSCRIPTION_MANAGE` (voir A2).
- **Effort** : L — parcours à étapes, export côté agence, retour en arrière et refonte des erreurs.
- **Risque** : sécurité : un export complet est le fichier le plus sensible de l'agence ; garde-fou = `TENANT_ADMIN` seul, journalisation, archive privée expirante, jamais d'URL publique. Finance : résiliation à tort ; garde-fou = confirmation par le nom de l'agence et annulation possible jusqu'à l'échéance. Conformité : durée de conservation à valider (juriste).
- **Valeur** : agence Moyenne ; ImmoTopia Forte
- **Prérequis et décisions métier** :
  - Q-C1-1 — Qui peut résilier ? Options : (a) `TENANT_ADMIN` ; (b) administrateur et comptable ; recommandée : (a).
  - Q-C1-2 — Date d'effet. Options : (a) fin de la période payée ; (b) immédiate sur demande ; recommandée : (a) parce qu'elle respecte D7 et évite tout remboursement.
  - Q-C1-3 — Durée de conservation des données après la fin. Options : (a) durée fixée par le propriétaire ; (b) indéfinie ; recommandée : (a), valeur à valider avec un juriste.
  - Q-C1-4 — Offres de rétention proposées. Options : (a) pause seule ; (b) pause, rétrogradation, remise ; (c) aucune ; recommandée : (a) en premier, parce que la remise engage un prix.
  - Q-C1-5 — Export avant résiliation. Options : (a) proposé mais facultatif ; (b) obligatoire ; recommandée : (a).
  - Q-C1-6 — Réactivation après la fin. Options : (a) en libre-service dans un délai donné ; (b) via ImmoTopia ; recommandée : (b) pour la première livraison.
- **Mise en œuvre sûre** : d'abord le motif et le journal côté super-admin (aucun changement d'état), puis la demande de résiliation côté agence qui crée seulement une demande traitée à la main, puis l'effet automatique.

#### C2 — Pause d'abonnement (suspension saisonnière à tarif réduit, reprise automatique)

- **Statut** : Idée nouvelle, sur une base partielle. `SubscriptionStatus.SUSPENDED` existe (`schema.prisma:67-73`) mais veut dire lecture seule sans date de fin ni tarif (`lib/subscription/entitlements.ts:297-304`) ; la tâche ignore ce statut (`subscription-usage-job.ts:58-62`) ; le `PATCH` historique peut le poser sans facturation (`controllers/subscription-controller.ts:25,35`, `subscription-service.ts:97-108`).
- **Problème** : une agence qui ralentit (saison creuse, travaux) n'a que deux options : payer plein tarif ou résilier. Il n'existe ni durée de pause, ni tarif de pause, ni reprise automatique : aucune règle ne rouvre ni ne refacture une agence `SUSPENDED`.
- **Valeur pour l'agence** : garder ses données et son historique sans payer le plein tarif pendant une interruption d'activité.
- **Valeur pour ImmoTopia** : alternative à la résiliation (C1), revenu réduit mais conservé, reprise de facturation sans intervention.
- **Description fonctionnelle** :
  - Nouvel état `PAUSED` (valeur de `SubscriptionStatus`, à créer) distinct de `SUSPENDED`, qui reste la sanction du super-admin ; champs `pausedAt`, `pausedUntil` sur l'abonnement (à créer).
  - Demande par l'agence (`TENANT_ADMIN`) : durée dans un maximum paramétrable, effet à la prochaine échéance seulement, jamais au milieu d'une période déjà payée ; refus si une facture est impayée ou si l'abonnement est en essai.
  - Pendant la pause : accès en lecture seule et export (nouvelle raison `PAUSED` dans `ReadOnlyReason`, `entitlements.ts:239`), bandeau « Abonnement en pause jusqu'au … », aucune facture de période ni de dépassement ; les portails et paiements des locataires restent ouverts (`PLAN-ABONNEMENTS.md` §6).
  - Tarif réduit : forfait ou pourcentage fixé par le propriétaire, facturé comme une ligne dédiée (type d'élément `PAUSE` du catalogue, `CatalogItemKind`, `schema.prisma:96`, à créer) ; gratuit si le propriétaire le décide.
  - Reprise automatique à `pausedUntil` : la tâche quotidienne repasse l'abonnement `ACTIVE`, démarre une nouvelle période et émet la facture ; rappel J-7 avant la reprise (même mécanisme que les rappels d'essai, `subscription-usage-job.ts:464-500`) ; reprise anticipée possible, avec facture au prorata.
  - Abonnement annuel : règle à décider (report de la fin de période de la durée de la pause, ou refus) ; consommations mensuelles (signatures, photos) remises à zéro normalement.
  - Cas limites : nombre de pauses par an limité ; pause pendant un chantier ou une copropriété active (les lots restent comptés au registre mais sans facture) ; Particulier gratuit exclu ; combinaison avec la résiliation (C1) : une pause en cours n'empêche pas de résilier.
- **Dépendances dans le code existant** : `resolveSubscriptionPhase` et `ReadOnlyReason` (`entitlements.ts:239,285`) ; `processBillingBoundary` et `LIVE_STATUSES` (`subscription-usage-job.ts:58,199`) ; `runPlatformBillingStep` (`platform-invoice-service.ts:1268`) ; `Subscription` (`schema.prisma:1331`, champs `pausedAt`, `pausedUntil` et état `PAUSED` à créer, migration additive) ; `applyPaymentToSubscriptionTx` (`platform-payment-service.ts:267`) à vérifier pour la reprise ; libellés i18n fr, en, ar.
- **Effort** : L — nouvel état de cycle de vie, tarif de pause, reprise automatique et toutes les gardes de lecture seule touchées.
- **Risque** : finance : pause répétée pour éviter de payer, ou reprise sans facture ; garde-fou = durée maximale, nombre annuel de pauses, durée minimale d'activité entre deux pauses, reprise tracée et auditée. Sécurité : aucune fuite entre agences, la pause ne change que la ligne de l'agence demandeuse.
- **Valeur** : agence Moyenne ; ImmoTopia Moyenne
- **Prérequis et décisions métier** :
  - Q-C2-1 — Durée maximale et nombre de pauses par an. Options : (a) valeurs fixées par le propriétaire ; (b) illimité ; recommandée : (a).
  - Q-C2-2 — Tarif pendant la pause. Options : (a) gratuit ; (b) forfait ; (c) pourcentage du tarif ; recommandée : (b) ou (c), montant à fixer par le propriétaire ; aucun chiffre n'est proposé ici.
  - Q-C2-3 — Accès pendant la pause. Options : (a) lecture seule et export ; (b) accès fermé sauf export ; recommandée : (a) pour cohérence avec la lecture seule existante.
  - Q-C2-4 — Abonnements annuels éligibles ? Options : (a) oui avec report de période ; (b) non ; recommandée : (b) pour la première livraison.
  - Q-C2-5 — Reprise. Options : (a) automatique avec rappel ; (b) manuelle ; recommandée : (a).
  - Q-C2-6 — Pause proposée comme offre de rétention dans C1 ? Options : (a) oui ; (b) non ; recommandée : (a).
- **Mise en œuvre sûre** : d'abord l'état et la reprise côté super-admin seulement (pause décidée par ImmoTopia), puis la demande par l'agence ; tout reste derrière un réglage par agence et se désactive sans migration inverse.

### Thème D — Tarification

Cinq leviers commerciaux pour faire varier le prix sans toucher à la grille de base : remises temporaires, parrainage, crédits prépayés, paliers de volume, essais par module.
Tous respectent le moteur actuel : montants HT entiers en FCFA, prix figés par abonnement (D12 du plan), TVA 18 % calculée en dernier, isolation par agence. Aucun montant n'est proposé ici : ce sont des paramètres à fixer par le propriétaire.

Références de chemin : `packages/api/src` est abrégé en `api/`, `apps/web/src` en `web/`.

#### D1 — Codes promo et remises temporaires

- **Statut** : Idée nouvelle. Elle s'appuie sur la remise permanente par élément (`SubscriptionItem.discountPercent`, `api/services/subscription-admin-extras-service.ts:79-135`, modèle `prisma/schema.prisma:1519`) et sur le type de ligne `DISCOUNT` (`schema.prisma:138`). Recherche `coupon|promo|referral|parrain` dans `api/` : aucun mécanisme (seul `leadSource: 'REFERRAL'` du CRM, `api/types/crm-types.ts:125`, sans rapport).
- **Problème** : la seule remise commerciale est permanente, saisie à la main, sans date de fin ni plafond de campagne. Le motif est facultatif (`reason` optionnel, `api/controllers/platform-billing-controller.ts:64-69`) et l'ajout d'un élément accepte 0 à 100 % (`api/controllers/subscription-v2-controller.ts:146-151`). Une offre « premiers mois à tarif réduit » oblige à penser à retirer la remise au bon moment, sinon elle dure indéfiniment.
- **Valeur pour l'agence** : une offre de lancement lisible sur sa facture (« Code X : remise pendant N mois »), avec la date exacte de retour au prix normal.
- **Valeur pour ImmoTopia** : des campagnes (salons, partenaires, lancement d'un pack) mesurables, qui s'éteignent seules, sans dérive de remises oubliées.
- **Description fonctionnelle** :
  - Super-admin, écran « Offres › Codes promo » (route à créer, ex. `/admin/promo-codes`) : code unique insensible à la casse, type POURCENTAGE ou MONTANT FIXE (FCFA HT entier), durée (N périodes de facturation ou date de fin), offres éligibles (codes de packs/extensions), plafond global d'utilisations, un usage par agence, fenêtre de validité, cumul ou non avec la remise de combinaison (D6) et la remise d'élément.
  - Saisie du code : par le super-admin sur la fiche agence (`SubscriptionTab`), à la création d'agence (`CreateTenantDrawer`), puis, si décidé, par l'agence sur « Paramètres › Abonnement ». Aujourd'hui l'agence ne peut rien acheter seule (`web/pages/tenant/TenantSubscriptionSettings.tsx:267`), sauf la montée de palier particulier (`api/routes/tenant-routes.ts:119-126`).
  - Calcul : jamais de modification du prix figé `unitMonthlyPrice`. La remise est une ligne `DISCOUNT` dédiée, avec le code en libellé, calculée sur les lignes éligibles après remise d'élément et avant TVA (`finalizeInvoice`, `api/lib/subscription/pricing.ts:366-380`). Arrondi `roundFcfa`. En annuel, le pourcentage s'applique au total annuel (11 mensualités), le montant fixe une seule fois.
  - États du code : BROUILLON, ACTIF, ÉPUISÉ, EXPIRÉ, ARRÊTÉ. États d'une utilisation : EN COURS, TERMINÉE, ANNULÉE. Messages (fr/en/ar via `t()`) : « Ce code n'est plus valable », « Ce code ne s'applique pas à votre formule ».
  - Cas limites : la durée ne démarre pas pendant l'essai de 30 jours (première facture de période seulement) ; un montant fixe ne rend jamais une facture négative (excédent perdu ou reporté, voir question) ; retrait du pack concerné = fin de l'utilisation ; un avoir renverse les lignes sans « rendre » le code ; abonnement gratuit (`isFreeSubscription`) : le code n'est pas consommé.
- **Dépendances dans le code existant** : injection dans `previewNextInvoice` (`api/services/subscription-v2-service.ts:1597-1670`, avant `finalizeInvoice`) donc automatiquement dans `buildPlatformInvoiceDraft` (`api/services/platform-invoice-service.ts:222`) ; décompte de la période consommée dans la transaction d'émission (`generateInvoiceForPeriodTx`, `:321`) ; réservation atomique d'usage sur le modèle `reserveSignature` (`api/lib/signature/quota.ts:73-92`). Modèles à créer : `PromoCode` (global, à classer dans `GLOBAL_MODELS` de `__tests__/unit/schema-tenant-coverage.test.ts`) et `PromoRedemption` (porte `tenantId`, unique `(promoCodeId, tenantId)`). `InvoiceLine.metadata` référence l'utilisation, aucune colonne ajoutée.
- **Effort** : M — un calcul pur plus deux tables, un écran super-admin et un champ de saisie, sans toucher au cycle de vie des éléments.
- **Risque** : finance — double application ou facture négative ; garde-fou : calcul pur testé (G2), compteur conditionnel atomique, plafond au HT de la facture. Tenant — un code ne doit jamais révéler les autres agences qui l'ont utilisé ; limiter le débit des essais de codes (énumération). Conformité — remise avant TVA, jamais après.
- **Valeur** : agence Moyenne ; ImmoTopia Moyenne.
- **Prérequis et décisions métier** :
  - Q-D1-1 — Le code se cumule-t-il avec la remise de combinaison de 10 % ? Options : (a) cumulable ; (b) exclusif, la meilleure des deux s'applique. Recommandée : (b) parce que la combinaison est déjà une remise structurelle et que le cumul rend le prix plancher difficile à garantir.
  - Q-D1-2 — En annuel, la remise en pourcentage porte-t-elle sur les 11 mensualités ? Options : (a) oui, sur le total annuel ; (b) non, première période seulement. Recommandée : (a) parce que c'est le montant réellement facturé.
  - Q-D1-3 — Un montant fixe supérieur à la facture est-il reporté ? Options : (a) perdu ; (b) reporté en ligne CREDIT en attente. Recommandée : (a) parce qu'un report crée une dette de la plateforme difficile à auditer.
  - Q-D1-4 — Qui peut saisir un code ? Options : (a) super-admin seul ; (b) agence aussi. Recommandée : (a) au départ parce que l'agence n'a pas d'achat libre-service.
  - Q-D1-5 — Plafond de remise totale (code + remise d'élément) ? Options : (a) 100 % toléré ; (b) plafond fixé par le propriétaire, relié à F1. Recommandée : (b).
- **Mise en œuvre sûre** : livrer d'abord le code appliqué par le super-admin à une agence, visible dans l'aperçu de facture, puis la saisie par l'agence. Réversible : désactiver un code n'altère aucune facture émise ni aucun prix figé.

#### D2 — Parrainage entre agences

- **Statut** : Idée nouvelle. Elle réutilise les lignes `CREDIT` en attente (`InvoiceLine.invoiceId` nul, `schema.prisma:1623`, plan §3 et §6 quater) et les points d'entrée d'agence : `POST /api/admin/tenants` (`api/routes/admin-routes.ts:72`) et l'espace personnel (`api/routes/personal-space-routes.ts:14`). Aucune route ne crée aujourd'hui de ligne `CREDIT` manuelle (seuls `changePack`, `subscription-v2-service.ts:1130-1145`, et le report de solde, `platform-invoice-service.ts:427`, en écrivent).
- **Problème** : aucune trace de l'origine d'une agence ni de lien entre agences. L'acquisition passe par le super-admin ou l'inscription particulier ; rien ne récompense une recommandation, qui reste un geste commercial hors système.
- **Valeur pour l'agence** : un avantage concret (crédit sur sa prochaine facture) pour une recommandation, et pour la nouvelle agence un démarrage avantageux.
- **Valeur pour ImmoTopia** : un canal d'acquisition payé seulement à la conversion réelle (premier règlement), traçable et plafonné.
- **Description fonctionnelle** :
  - Agence, « Paramètres › Abonnement › Parrainer » : code et lien personnels stables, liste des filleuls avec un statut seul (invité, inscrit, en essai, abonné payant, récompensé), récompenses gagnées et en attente. Aucune donnée de l'agence filleule n'est visible au parrain.
  - Filleul : champ « Code de parrainage » à la création (par le super-admin dans `CreateTenantDrawer`, ou à l'inscription d'un espace personnel). Le rattachement est unique par filleul.
  - Déclencheur de la récompense : premier règlement d'une facture PERIOD de montant supérieur à zéro, détecté dans `settlePlatformInvoiceTx` (`api/services/platform-payment-service.ts:188-265`), dans la même transaction, donc idempotent (contrainte unique sur le filleul). Option : attendre un délai sans avoir de remboursement (`REFUND_DUE`).
  - Récompense : ligne `CREDIT` en attente (`invoiceId` nul) reprise par la prochaine facture du parrain, montant ou pourcentage à fixer par le propriétaire ; côté filleul, remise via D1 ou période offerte. Jamais de versement d'argent.
  - Anti-abus : pas d'auto-parrainage (même e-mail d'administrateur, même téléphone, même `contactEmail`), parrain en statut ACTIVE sans retard au moment de la récompense, plafond annuel par parrain, filleul jamais abonné auparavant.
  - Cas limites : parrain suspendu ou résilié avant le déclenchement (récompense conservée ou perdue, voir question) ; avoir sur la facture du filleul (récompense annulée par une ligne CREDIT inverse) ; crédit supérieur au dû, déjà géré (facture à zéro, report) ; espace Particulier gratuit : rien ne se déclenche à 0 FCFA.
  - Le lien est fourni, jamais envoyé en masse par ImmoTopia au nom du parrain (pas de campagne e-mail non sollicitée).
- **Dépendances dans le code existant** : `settlePlatformInvoiceTx` (`platform-payment-service.ts:188`), `createPendingLinesTx` (`subscription-v2-service.ts:627`), `tenant-provisioning-service.ts`, notifications e-mail trilingues. Modèles à créer : `Referral` (parrain, filleul unique, code, statut, `qualifiedAt`, `rewardedAt`) et `ReferralSettings` (global : montant, plafond, délai). Classement `schema-tenant-coverage` à prévoir.
- **Effort** : M — table de rattachement, hook de règlement, écrans de suivi, sans toucher au calcul des prix.
- **Risque** : finance — double récompense ou récompense d'une facture ensuite annulée ; garde-fou : unicité du filleul, délai, inversion par avoir. Fraude — auto-parrainage entre comptes liés ; garde-fous ci-dessus et validation manuelle au-delà d'un seuil. Conformité — pas d'envoi de messages en masse, consentement du destinataire.
- **Valeur** : agence Moyenne ; ImmoTopia Moyenne.
- **Prérequis et décisions métier** :
  - Q-D2-1 — Nature de la récompense ? Options : (a) crédit en FCFA fixe ; (b) pourcentage de la première facture ; (c) période offerte. Recommandée : (a) parce qu'elle est prévisible et tient sur une ligne CREDIT.
  - Q-D2-2 — Qui est récompensé ? Options : (a) parrain seul ; (b) parrain et filleul. Recommandée : (b) parce que le filleul n'a sinon aucune incitation à saisir le code.
  - Q-D2-3 — Déclencheur ? Options : (a) premier règlement ; (b) règlement plus un délai d'attente. Recommandée : (b) pour éviter les remboursements rapides.
  - Q-D2-4 — Plafond par parrain et par an ? Options : (a) plafond en nombre ; (b) plafond en montant ; (c) aucun. Recommandée : (a) simple à expliquer.
  - Q-D2-5 — Le parrainage vaut-il aussi pour l'espace Particulier payant ? Options : (a) oui ; (b) agences seulement. Recommandée : (b) en V1.
- **Mise en œuvre sûre** : V1 sans libre-service (le super-admin saisit le parrain à la création, la récompense est un crédit tracé et approuvé via F1), V2 lien et suivi côté agence. Réversible : la table est additive, aucune règle de prix n'est modifiée.

#### D3 — Crédits prépayés à la carte (IA, SMS, signatures, WhatsApp)

- **Statut** : Extension de l'existant. La spec 028 (`specs/028-ia-credits/spec.md`, statut brouillon, aucun code sur main : `docs/workflows/HANDOFF.md:114`) décrit déjà, pour l'IA seule, un portefeuille à lots, un journal en ajout seul, des recharges de 12 mois et un dépassement plafonné (modèles `AiCreditGrant`, `AiCreditLedger`, `AiTopupOffer`, `specs/028-ia-credits/data-model.md:194,251,422`). En code aujourd'hui : quotas mensuels durs de signatures (`api/lib/signature/quota.ts:73-92`) et de photos d'inventaire (`api/lib/stock-whatsapp/quota.ts`), capacités `SIGNATURES_MENSUELLES` et `PHOTOS_INVENTAIRE` (`schema.prisma:103-114`), blocs d'extension `EXT_SIGNATURES_SUPPLEMENTAIRES` (50) et `EXT_INVENTAIRE_WHATSAPP` (500) (`api/lib/subscription/catalog.ts:349,367-378`).
- **Problème** : au-delà du quota mensuel la signature est refusée en 409 (`api/services/signature-service.ts:209`) jusqu'à ce qu'ImmoTopia ajoute un bloc, demandé par message (`SubscriptionExtensionRequest`, `schema.prisma:9661` ; écran `TenantSubscriptionSettings.tsx:267` : « passent par l'équipe ImmoTopia »). Pas de solde prépayé, pas de report, pas d'achat à l'unité. Le SMS n'a qu'un plafond quotidien d'environnement (`SIGNATURE_SMS_DAILY_LIMIT`, `api/config/env.ts:511`, `api/lib/signature/sms-guard.ts:40-52`) : valeur globale appliquée à chaque agence (`countSmsSentToday(tenantId)`), qui ne protège que les SMS de signature ; le coût du SMS reste à la charge de la plateforme (« compte unique », `specs/044-signature-electronique/spec.md:83-84`, SG-R4).
- **Valeur pour l'agence** : acheter ce dont elle a besoin le jour où elle en a besoin, en mobile money, sans attendre un échange avec ImmoTopia ni souscrire un bloc fixe mensuel.
- **Valeur pour ImmoTopia** : revenu d'usage encaissé d'avance, coût variable (IA, SMS, vision) couvert par un prix explicite, moins de demandes manuelles d'extension.
- **Description fonctionnelle** :
  - Unités gérées par un même portefeuille : requête IA (spec 028), signature, photo analysée ; SMS hors V1 (Q-D3-1), le SMS n'étant pas en service. Chaque unité a un nom, une taille de recharge, un prix (à fixer par le propriétaire), une durée de validité et un interrupteur d'activation.
  - Écran agence « Abonnement › Mes crédits » (route à créer) : solde par unité (inclus du mois, prépayé, date d'expiration du plus ancien lot), journal des mouvements, bouton « Recharger » réservé à la permission d'achat de Q-A3-4 (`TENANT_SUBSCRIPTION_MANAGE`), pas à `TENANT_SETTINGS_EDIT`. Recharge = facture PLATFORM à ligne unique, calquée sur `generateUpgradeInvoiceTx` (`platform-invoice-service.ts:477`), payée par `startInvoiceCheckout` (`platform-payment-service.ts:529`) ; les crédits sont ajoutés au règlement, dans la même transaction que `settlePlatformInvoiceTx` (rejeu sans effet).
  - Consommation : d'abord le quota inclus du mois (comportement actuel inchangé), puis le prépayé, par lot le plus proche de l'expiration. Réservation atomique conditionnelle (`UPDATE … WHERE solde >= 1`) et restitution si l'envoi échoue, comme `releaseSignature` (`quota.ts:93-100`).
  - Expiration : lot daté, alertes J-30 et J-7, ligne de journal EXPIRÉ, aucun remboursement (cohérent avec la spec 028).
  - Alertes de solde bas : réutiliser `QuotaAlert` (une alerte par unité, seuil, période) ou table dédiée.
  - Super-admin : octroi de crédits avec motif (soumis à F1), vue de marge par unité (coût fournisseur mesuré contre prix), mode SHADOW avant ENFORCE (spec 028, D7).
  - Cas limites : agence en lecture seule (aucune écriture, donc aucune consommation) ; avoir sur une recharge déjà consommée (solde négatif interdit : avoir limité au non consommé) ; agence supprimée (crédits perdus, à écrire dans les conditions) ; TVA 18 % sur la recharge, produit constaté d'avance à faire valider par l'expert-comptable (spec 028, Q10).
- **Dépendances dans le code existant** : `settlePlatformInvoiceTx` (`platform-payment-service.ts:188`), compteurs `countSignaturesThisMonth` et `countInventoryPhotosThisMonth` (`api/services/subscription-v2-service.ts:237-300`), `QuotaAlert` (`schema.prisma:1675`), `CatalogItemKind` (`schema.prisma:96`, une valeur RECHARGE à créer ou une table d'offres). Modèles à créer : portefeuille généralisé `CreditGrant` et `CreditLedger` avec un champ `unit` (à substituer aux `AiCreditGrant` et `AiCreditLedger` de la spec 028 avant leur implémentation, sinon migration lourde), tous deux portant `tenantId`.
- **Effort** : L — nouveau sous-système financier (solde, journal, expiration, achat, alertes) touchant quatre points de consommation.
- **Risque** : finance — argent encaissé d'avance, expiration, TVA ; garde-fou : journal immuable et contrôle solde = somme du journal (voir G1). Concurrence — double débit ; garde-fou : mise à jour conditionnelle unique. Tenant — solde strictement par agence. Conformité — conditions d'expiration affichées avant l'achat, avis du juriste.
- **Valeur** : agence Forte ; ImmoTopia Moyenne.
- **Prérequis et décisions métier** :
  - Q-D3-1 — Unités en V1 ? Options : (a) IA seule (périmètre de la spec 028) ; (b) IA et signatures ; (c) les quatre. Recommandée : (b) parce que le SMS n'est pas en service (`HANDOFF.md:116`) et que la signature a déjà un quota dur à lever.
  - Q-D3-2 — Modèle de données ? Options : (a) généralisé dès le départ ; (b) IA d'abord puis généralisation. Recommandée : (a) pour ne pas migrer un solde monétaire en production.
  - Q-NEW-3 (voir section 5) — Pour les signatures, l'ordre complet est : quota inclus et blocs `EXT_SIGNATURES_SUPPLEMENTAIRES` (A3), puis crédits prépayés (cette fiche), puis surcoût facturé (D4, Q-D4-3 option b) ou refus ; recommandé, à valider.
  - Q-D3-3 — Ordre de consommation ? Options : (a) inclus puis prépayé ; (b) prépayé puis inclus. Recommandée : (a) parce qu'il préserve la valeur du prépayé.
  - Q-D3-4 — Durée de validité ? Options : (a) 12 mois pour toutes les unités ; (b) par unité. Recommandée : (a) alignée sur la spec 028.
  - Q-D3-5 — Recharge pendant l'essai ? Options : (a) permise ; (b) interdite. Recommandée : (a), payée d'avance donc sans risque d'impayé.
- **Mise en œuvre sûre** : ne rien changer aux quotas durs actuels ; livrer le portefeuille en mode SHADOW (journal sans blocage), puis une seule unité avec recharge. Réversible : désactiver l'unité ramène au quota dur d'aujourd'hui.

#### D4 — Remises de volume et tarification à l'usage par paliers

- **Statut** : Extension de l'existant. Le palier de volume existe pour l'Agence seule (`lotTiers`, 750 FCFA le bloc au-delà du 300e lot : `api/lib/subscription/catalog.ts:284`, évalué par `resolveUnitMonthlyPrice`, `api/lib/subscription/pricing.ts:73-88`). Le dépassement est chiffré par `computeOverageLines` (`pricing.ts:296-353`) pour lots, copropriétés, chantiers et biens détenus. Les capacités de consommation (signatures, photos) sont VOLONTAIREMENT sans dépassement facturé (`subscription-v2-service.ts:1553-1572`, `extensionCodes` `:1561` ; spec 044 SG-R12, `specs/044-signature-electronique/spec.md:112-117`).
- **Problème** : le palier ne s'applique qu'à la composition exacte `onlyPacks = ['AGENCE']` (`sameSet`, `pricing.ts:63-67`) : Agence + Syndic paient 150 FCFA le lot jusqu'au bout (plan §11 point 2, exemple 94 810 de `subscription.pricing.test.ts:258`). Copropriétés, chantiers et biens n'ont aucun palier. Les signatures et photos au-delà du quota sont refusées, pas tarifées.
- **Valeur pour l'agence** : un prix qui baisse avec le volume, sans effet de seuil brutal, et la possibilité de continuer à travailler (signer) en payant l'excédent plutôt qu'être bloquée.
- **Valeur pour ImmoTopia** : encaisser l'usage excédentaire de consommation au lieu de le refuser, et rendre la grille plus lisible pour les grands comptes.
- **Description fonctionnelle** :
  - Super-admin « Offres › Paliers » (écran à créer ; aujourd'hui seul `PATCH /api/admin/catalog/:code`, `admin-routes.ts:117`, sans écran web) : édition de règles de paliers par capacité (rang de départ, prix unitaire, packs détenus en « au moins un parmi » plutôt qu'en composition exacte).
  - Calcul : le prix du rang n est celui du palier qui le contient, pour le bloc acheté (`planExtensionUnits`, `pricing.ts:129-148`) comme pour le dépassement (même fonction), donc acheter un bloc ou dépasser coûte le même prix au lot. Valeurs entières, `roundFcfa`.
  - Usage par paliers pour une capacité de consommation, activable capacité par capacité : au-delà du quota inclus, les N premières unités à un prix, les suivantes à un autre ; ligne `OVERAGE` à la facture suivante. L'agence voit sur « Abonnement » : « 0 à 20 inclus ; 21 à 70 : X FCFA ; au-delà : Y FCFA » et une estimation du mois (`previewNextInvoice` expose déjà `overageInvoice`).
  - Articulation avec `quotaPolicy` : BLOCK refuse comme aujourd'hui, WARN_ONLY avertit, BILL_OVERAGE applique les paliers ; plafond mensuel optionnel en montant pour éviter la facture surprise ; alertes 80 et 100 % inchangées (`QuotaAlert`).
  - Annuel : le dépassement reste facturé chaque mois sur le pic (plan §6 ter) ; une capacité à remise à zéro calendaire UTC (`AAAA-MM`) ne coïncide pas avec la fenêtre ancrée sur le début de période annuelle : à trancher.
  - Cas limites : usage qui baisse en cours de mois (pic pour un stock, cumul de fin de mois pour une consommation) ; abonnement gratuit exclu ; paliers jamais décroissants en rang ni négatifs.
- **Dépendances dans le code existant** : `pricing.ts:73-88,129-148,296-353` ; `subscription-v2-service.ts:1536-1595` (table `extensionCodes`) ; `rulesSchema` strict (`subscription-v2-controller.ts:55-70`, à étendre) ; `UsageSnapshot` (`schema.prisma:1654`). Champ à créer : plafond mensuel d'agence (`Subscription.overageCapMonthly`, nullable). `CatalogRules` (`catalog.ts:110-130`) s'étend sans migration, la colonne `rules` étant en JSON.
- **Effort** : M — une règle de prix pure et sa validation, un écran de réglage, sans changement de schéma obligatoire.
- **Risque** : finance — paliers mal ordonnés donnant des prix incohérents ou un effet de seuil inversé ; garde-fous : validation stricte (rangs croissants, prix entiers non négatifs), jeux « golden » (G2), aperçu avant publication (E3). Pas de risque tenant propre.
- **Valeur** : agence Moyenne ; ImmoTopia Moyenne.
- **Prérequis et décisions métier** :
  - Q-D4-1 — Composition des paliers ? Options : (a) « contient au moins » le pack ; (b) palier propre à chaque pack ; (c) statu quo Agence seule. Recommandée : (a) parce qu'elle règle le cas Agence + Syndic sans multiplier les règles.
  - Q-D4-2 — Capacités concernées en V1 ? Options : (a) lots seuls ; (b) lots et copropriétés/chantiers/biens. Recommandée : (a).
  - Q-D4-3 — Tarifer l'excédent de signatures et de photos ? Options : (a) non, refus conservé ; (b) oui, opt-in par capacité. Recommandée : (b), avec rouverture explicite de la décision SG-R12 de la spec 044.
  - Q-NEW-3 (voir section 5) — Le surcoût facturé n'intervient pour les signatures qu'après le quota inclus, les blocs `EXT_SIGNATURES_SUPPLEMENTAIRES` (A3) et les crédits prépayés (D3) ; recommandé, à valider.
  - Q-D4-4 — Plafond mensuel de facture d'excédent ? Options : (a) aucun ; (b) plafond par agence réglable. Recommandée : (b).
  - Q-D4-5 — Fenêtre de comptage annuelle pour les consommations ? Options : (a) mois calendaire UTC ; (b) mois glissant ancré sur la période. Recommandée : (a) parce que le compteur de quota lui-même est calendaire.
- **Mise en œuvre sûre** : V1 paliers de lots seuls, fonction pure testée, publiés par le catalogue sans toucher aux abonnements existants ; V2 usage de consommation derrière un indicateur par capacité. Réversible : retirer les paliers du JSON rétablit la grille actuelle.

#### D5 — Essais gratuits par module ou extension

- **Statut** : Extension de l'existant. L'essai actuel est global à l'agence : 30 jours (`TRIAL_DAYS`, `api/lib/subscription/catalog.ts:90`), `Subscription.trialEndsAt` (`schema.prisma:1331`), aucune ligne de prorata pendant l'essai (`subscription-v2-service.ts:794`), rappels J-7 et J-1 (`api/jobs/subscription-usage-job.ts`, §4). Une dérogation de module à date existe en lecture (`TenantModule.expiresAt`, `subscription-v2-service.ts:480`) mais n'est jamais écrite : `updateTenantModules` (`api/services/module-service.ts:52-100`) pose `source: 'OVERRIDE'` sans `expiresAt` ni motif.
- **Problème** : une agence déjà ACTIVE qui ajoute un pack ou un module est facturée tout de suite au prorata (`subscription-v2-service.ts:794-820`) ; impossible d'offrir 14 jours de Syndic puis de convertir ou revenir en arrière. L'ouverture manuelle d'un module est permanente et sans fin programmée.
- **Valeur pour l'agence** : tester un module avec ses vraies données avant de payer, avec une date de fin claire et sans engagement caché.
- **Valeur pour ImmoTopia** : un levier de montée en gamme (expansion) mesurable, plus propre que des ouvertures de module permanentes oubliées.
- **Description fonctionnelle** :
  - Super-admin, `SubscriptionTab` : action « Ajouter avec essai » sur un pack ou une extension, avec durée en jours (borne maximale paramétrable) et issue à l'échéance : RETOUR (l'élément prend fin, modules resynchronisés, retour au palier précédent) ou CONVERSION (l'élément devient payant). Côté agence, un bouton « Essayer N jours » n'a de sens qu'avec un achat libre-service (non livré : `HANDOFF.md:114`).
  - États d'un élément à l'essai : EN ESSAI (prix figé enregistré, aucune ligne de facture), CONVERTI (facturé, prorata de la période), TERMINÉ (`endReason = TRIAL_ENDED`). Réutilise `endsAt` et `endReason` de `SubscriptionItem`.
  - Règles : un essai par agence et par code d'offre à vie ; pas d'essai sur un élément déjà détenu ; pas de superposition avec l'essai d'abonnement (déjà gratuit) ; pas d'essai pour une agence en retard de paiement.
  - Fin d'essai en RETOUR : si l'usage dépasse la capacité retrouvée, `quotaPolicy` s'applique (BILL_OVERAGE = facturation) ; l'agence est prévenue à J-3 avec le montant estimé tiré de `previewNextInvoice`. Données du module conservées en lecture seule (plan §6, D11), rappelé dans le message.
  - Rappels J-3 et J-1 par élément : champ de suivi à créer (les rappels actuels sont dans `Subscription.metadata`, par abonnement).
  - Cas limites : changement de pack pendant l'essai de l'élément ; retrait immédiat (aucun prorata) ; essai à cheval sur la phase PAST_DUE ; conversion consentie par une case tracée à l'activation, jamais implicite.
- **Dépendances dans le code existant** : `SubscriptionItem` (`schema.prisma:1519`, champs `trialEndsAt` et `trialOutcome` à créer, nullables) ; `addSubscriptionItem` (`subscription-v2-service.ts:707-870`, pas de ligne PRORATA en essai) ; `applyDueItemTransitionsTx` (appelée par `processBillingBoundary`, `subscription-usage-job.ts:199-206`) pour convertir ou terminer ; `previewNextInvoice` et `effectiveItems` (exclure les éléments en essai de la facture) ; modules et capacités calculés par `buildEntitlements` (éléments en essai comptés mais non facturés).
- **Effort** : M — un cycle de vie d'élément à enrichir, de la facturation à exclure et un job à étendre.
- **Risque** : finance — oubli d'exclure l'élément en essai de la facture, ou conversion sans consentement ; garde-fous : exclusion testée (G2), RETOUR par défaut. Conformité — la conversion automatique exige un consentement explicite et un préavis (avis juriste). Tenant — aucun risque propre.
- **Valeur** : agence Forte ; ImmoTopia Moyenne.
- **Prérequis et décisions métier** :
  - Q-D5-1 — Issue par défaut à l'échéance ? Options : (a) RETOUR ; (b) CONVERSION. Recommandée : (a) parce qu'elle est réversible et ne facture rien sans acte volontaire.
  - Q-D5-2 — Durée maximale d'un essai d'élément ? Options : (a) valeur unique fixée par le propriétaire ; (b) par offre. Recommandée : (a).
  - Q-D5-3 — Offres éligibles ? Options : (a) packs et modules seulement ; (b) aussi extensions de capacité. Recommandée : (a) en V1.
  - Q-D5-4 — Qui déclenche ? Options : (a) super-admin seul ; (b) agence aussi. Recommandée : (a) tant qu'il n'y a pas d'achat libre-service.
  - Q-D5-5 — Un essai à l'abonnement gratuit Particulier est-il concerné ? Options : (a) oui ; (b) non. Recommandée : (b) car le palier gratuit est déjà sans limite de durée.
- **Mise en œuvre sûre** : V1 super-admin seul, issue RETOUR seule, deux champs nullables additifs ; la conversion automatique n'arrive qu'après décision de consentement. Réversible : sans les champs, le comportement actuel est inchangé.

### Thème E — Pilotage super-admin

Trois outils de décision pour l'équipe ImmoTopia : revenus récurrents, créances, et maîtrise des changements de prix du catalogue.
Ils lisent le modèle existant (abonnements, éléments, factures, relevés d'usage) sans changer la facturation ; les agences n'y ont aucun accès.

#### E1 — Tableau de bord des revenus récurrents (MRR, ARR, churn, cohortes)

- **Statut** : Idée nouvelle. Existant limité : `getGlobalStatistics` (`api/services/statistics-service.ts:42-150`) compte agences, collaborateurs, abonnements par statut, par `planKey` DÉPRÉCIÉ et modules activés ; écran `web/pages/admin/Statistics.tsx` (155 lignes), route `GET /api/admin/statistics` (`admin-routes.ts:240`). Aucune somme d'argent : recherche `mrr|churn|arr` dans `api/` et `web/`, aucun résultat.
- **Problème** : on ne sait pas combien rapporte la base d'abonnés par mois. Anomalie constatée en passant : `Statistics.tsx:84-85` lit `stats.activeSubscriptions` et `stats.cancelledSubscriptions` (type web `web/services/statistics-service.ts:10-11`) que l'API ne renvoie pas (elle renvoie `subscriptionsByStatus`, `statistics-service.ts:139-150`) ; la carte affiche donc « undefined actifs ». `subscriptionsByPlan` reste à zéro pour les agences à packs (`planKey` nul, `:105`).
- **Valeur pour l'agence** : indirecte, un produit piloté par des chiffres justes ; aucun accès direct.
- **Valeur pour ImmoTopia** : voir le revenu récurrent, la perte d'agences, la contribution des extensions et la fidélité par cohorte, base de toute décision tarifaire (D, E3).
- **Description fonctionnelle** :
  - Écran super-admin « Pilotage › Revenus récurrents » (route à créer, `/admin/revenus`, permission `PLATFORM_SUBSCRIPTIONS_VIEW`).
  - MRR = somme, pour chaque abonnement ACTIF non gratuit (`isFreeSubscription` exclu), des lignes récurrentes mensuelles HT calculées par `computeRecurringLines` (`api/lib/subscription/pricing.ts:178-216` : packs, extensions, remise de combinaison). En annuel, montant facturé divisé par 12 (11 mensualités pour 12 mois). ARR = 12 fois le MRR. Hors TVA, hors mise en route, dépassement affiché à part (variable). Définitions visibles en info-bulle.
  - Essais (TRIALING) exclus du MRR, montrés en « MRR potentiel en essai ».
  - Mouvements du mois : nouveau, expansion (ajouts, montée de pack), contraction (retraits, descente), churn (résiliation effective à `cancelAt`, accès conservé jusqu'à cette date : `api/lib/subscription/entitlements.ts:306-310`), réactivation. Cohortes : agences groupées par mois de création (`Tenant.createdAt`) ou de premier paiement, rétention du MRR et du nombre d'agences à M+1 à M+12.
  - Répartition par pack, par extension, par pays (`Tenant.country`) ; part d'agences à 80 % ou plus d'une capacité (`UsageSnapshot`) comme réserve d'expansion.
  - Export CSV (FCFA entiers, dates ISO) ; chiffres arrêtés après la tâche quotidienne de 02:30 UTC.
  - Cas limites : abonnement résilié mais encore actif (compté jusqu'à `cancelAt`) ; remise de 100 % (MRR nul, agence non gratuite) ; suspension ; agence sans abonnement.
  - Historique : relevé mensuel figé (`MrrSnapshot`, à créer), car `updateSubscriptionItem` modifie prix et remise sur place (`subscription-admin-extras-service.ts:112-135`) ; seul l'audit garde avant/après, ce qui interdit une reconstruction fiable a posteriori.
- **Dépendances dans le code existant** : `statistics-service.ts` (corriger la réponse), fonction pure de MRR par agence à extraire dans `api/lib/subscription/` (aujourd'hui `loadState`, `effectiveItems` et `toChargeable` sont internes à `subscription-v2-service.ts`), `listSubscriptionSummaries` (`subscription-admin-extras-service.ts:424`, lots de 100) pour le volume, tâche `subscription-usage-job.ts` pour le relevé. Modèle à créer : `MrrSnapshot` (porte `tenantId`, à classer dans `schema-tenant-coverage`).
- **Effort** : M — un calcul pur réutilisant le moteur, un relevé et un écran de lecture.
- **Risque** : finance — un MRR faux fausse les décisions ; garde-fou : calcul testé par jeux « golden » (G2) et recoupement avec `invoice-preview`. Tenant — agrégats inter-agences réservés aux permissions plateforme, jamais exposés au contexte agence. Conformité — aucun.
- **Valeur** : agence Faible ; ImmoTopia Forte.
- **Prérequis et décisions métier** :
  - Q-E1-1 — MRR d'un abonnement annuel ? Options : (a) montant annuel facturé divisé par 12 ; (b) tarif mensuel plein. Recommandée : (a) parce qu'elle reflète ce qui est réellement encaissé.
  - Q-E1-2 — Définition du churn ? Options : (a) résiliation effective ; (b) résiliation ou lecture seule non régularisée au-delà d'un délai. Recommandée : (a) puis (b) en indicateur séparé.
  - Q-E1-3 — Dépassement dans le MRR ? Options : (a) exclu, affiché à part ; (b) inclus. Recommandée : (a) car variable.
  - Q-E1-4 — Particulier payant inclus ? Options : (a) oui, segment distinct ; (b) exclu. Recommandée : (a) en segment distinct.
  - Q-E1-5 — Cohorte par création ou par premier paiement ? Options : (a) création ; (b) premier paiement. Recommandée : (b) car l'essai gonfle (a).
- **Mise en œuvre sûre** : V1 calcul à la volée plus correction de l'écran `Statistics.tsx`, lecture seule ; V2 relevés mensuels et cohortes. Aucun effet sur la facturation ; réversible en retirant l'écran.

#### E2 — Tableau des impayés et prévisions d'encaissement

- **Statut** : Idée nouvelle (vue inter-agences). Existant par agence : `listPlatformInvoices` (`api/services/platform-invoice-service.ts:1012-1070`), statut `OVERDUE` posé par `markOverdueInvoices` (`:753-765`), constat de paiement, lecture seule manuelle (plan §6 quinquies). Aucune liste transverse : les routes ne vivent que sous `/tenants/:tenantId/platform-invoices` (`api/routes/platform-invoice-routes.ts:30-45`). La balance âgée existante (Finance) concerne les loyers des agences, pas les factures de la plateforme.
- **Problème** : pour savoir qui doit quoi à ImmoTopia il faut ouvrir les factures agence par agence. Pas d'âge des créances, pas de classement des débiteurs, pas de calendrier d'encaissement.
- **Valeur pour l'agence** : indirecte, des relances plus justes et cohérentes (un message avant la coupure).
- **Valeur pour ImmoTopia** : trésorerie pilotée, relances priorisées par montant et ancienneté, vision des encaissements à venir.
- **Description fonctionnelle** :
  - Écran super-admin « Pilotage › Créances » (route à créer, `/admin/creances`, permission `PLATFORM_INVOICES_VIEW`).
  - Tableau : agence, n° de facture, nature (PERIOD, OVERAGE), émission, échéance, TTC, âge en jours, tranche (0-7, 8-30, 31-60, 61-90, plus de 90 : bornes paramétrables), phase de l'abonnement (ACTIVE, grâce, lecture seule), nombre de périodes en retard.
  - Top débiteurs : somme TTC en retard par agence et part du total.
  - Prévision d'encaissement : factures ISSUED à échoir par semaine (`dueDate`) et prochaines factures de période attendues à `Subscription.nextBillingAt` (indexé, `schema.prisma:1331`) chiffrées par `previewNextInvoice`. Aucun taux de recouvrement inventé : deux scénarios affichés, « tout payé à l'échéance » et « selon le délai de paiement constaté de chaque agence » (`PlatformInvoicePayment.paidAt` moins `dueDate`).
  - Actions par ligne : ouvrir la fiche agence (onglet Factures, existant), enregistrer un paiement (constat existant), lecture seule manuelle (existant), avoir (existant), relance par e-mail (à créer : modèle trilingue, journal de relance, fréquence maximale).
  - Export CSV (FCFA entiers, échappement des champs commençant par `=`, `+`, `-`, `@`).
  - Cas limites : avoirs `REFUND_DUE` listés à part (dû aux agences) ; factures à zéro payées d'office exclues ; dépassement impayé : reste OVERDUE sans effet automatique (plan D15) ; D16, un paiement n'avance qu'une période, d'où le nombre de périodes en retard.
- **Dépendances dans le code existant** : `Invoice` (`schema.prisma:1376`, index `status` et `dueDate`), `PlatformInvoicePayment` (`schema.prisma:9475`), `Subscription` ; service transverse `platform-receivables-service.ts` (à créer), route admin, `emailService` pour la relance. Pas de modèle de relance propre : réutiliser `DunningEvent` de B2 (agence, facture, étape, canal, date, `tenantId`, voir 3.3 et 4.4), avec l'auteur et le canal pour une relance manuelle, afin de n'avoir qu'un seul journal.
- **Effort** : M — requêtes transverses en lecture, un écran, un journal de relances.
- **Risque** : sécurité tenant — vue inter-agences limitée au contexte super-admin existant, jamais d'objet complet `User` (règle AGENTS.md, `select` explicite). Finance — total incohérent avec les avoirs ; garde-fou : base = factures non soldées hors CANCELED, avoirs déduits. Conformité — contenu de relance validé, e-mail transactionnel.
- **Valeur** : agence Faible ; ImmoTopia Forte.
- **Prérequis et décisions métier** :
  - Q-E2-1 — Tranches d'âge ? Options : (a) 0-7 / 8-30 / 31-60 / 61-90 / plus de 90 ; (b) autres bornes fixées par le propriétaire. Recommandée : (a) comme point de départ.
  - Q-E2-2 — Relance ? Options : (a) manuelle et journalisée ; (b) automatique après N jours. Recommandée : (a) tant que les modèles ne sont pas validés.
  - Q-E2-3 — Montants en vue ? Options : (a) TTC ; (b) HT. Recommandée : (a) pour les créances (c'est ce qui est encaissé), HT pour le MRR (E1).
  - Q-E2-4 — Canal de relance ? Options : (a) e-mail seul ; (b) e-mail et WhatsApp. Recommandée : (a) en V1 (WhatsApp Meta pas en service, `HANDOFF.md:116`).
  - Q-E2-5 — Lien avec la lecture seule manuelle ? Options : (a) raccourci seulement ; (b) suggestion automatique après un délai. Recommandée : (a), la coupure reste un acte humain.
- **Mise en œuvre sûre** : V1 lecture seule et export ; V2 relance manuelle journalisée. Aucune automatisation de coupure ; réversible en retirant l'écran.

#### E3 — Simulateur de tarif, journal des changements de catalogue et grandfathering

- **Statut** : Extension de l'existant. Simulateur : `POST /api/admin/catalog/quote` (`subscription-v2-controller.ts:100-110` → `estimateMonthly`, `pricing.ts:390-460`), déjà utilisé par `CreateTenantDrawer`. Édition : `PATCH /api/admin/catalog/:code` → `updateCatalogItem` avec audit avant/après (`subscription-v2-service.ts:185-220`, clé `CATALOG_ITEM_UPDATED`). Prix figés par agence (plan §2, D12), donc grandfathering implicite et éternel. Absents : écran de catalogue (aucune page web ne l'édite), versionnement, rapport d'impact, journal dédié.
- **Problème** : (1) `npm run db:seed:catalog` met à jour les prix directement, sans événement d'audit (`api/prisma/seeds/catalog-seed.ts:44-52`) ; (2) `updateCatalogItem` journalise par la file mémoire best-effort (`logAuditEvent`, `api/services/audit-service.ts:29-39`) au lieu de `recordAuditEvent(tx)` utilisé pour les dérogations (`subscription-v2-service.ts:1226-1270`) ; (3) le schéma d'entrée accepte des prix non entiers (`catalogPatchSchema`, `subscription-v2-controller.ts:81-91`, `z.number().nonnegative()` sans `.int()`) et `rulesSchema` strict n'a pas `tierGroup` (`:55-70`) : réécrire `rules` d'un pack Patrimoine ou Particulier perd son palier ; (4) pour migrer des abonnés vers un nouveau prix, seul `updateSubscriptionItem` agence par agence existe (`subscription-admin-extras-service.ts:79`).
- **Valeur pour l'agence** : des changements de prix annoncés, datés et non rétroactifs ; la garantie de savoir quand et pourquoi sa facture change.
- **Valeur pour ImmoTopia** : mesurer l'effet d'un changement de grille avant de le publier, garder la preuve de chaque décision, faire évoluer les prix sans bricolage agence par agence.
- **Description fonctionnelle** :
  - Super-admin « Offres › Catalogue » (écran à créer) : liste (prix, capacités, règles, vendable), fiche avec historique, éditeur validant des entiers et un motif obligatoire.
  - Versionnement : chaque modification crée une version (`effectiveFrom`, instantané JSON, auteur, motif), planifiable dans le futur. Le prix d'une date donnée est celui de la version alors en vigueur (devis datés, tests G2).
  - Simulateur « et si ? » : choisir une offre et un nouveau prix ou règle, obtenir sans écriture : agences concernées, MRR avant et après (E1), plus fortes hausses et baisses, nombre d'agences dont la facture augmente.
  - Grandfathering par modification : PRIX FIGÉ (défaut actuel), MIGRATION PLANIFIÉE (bascule à la prochaine échéance après préavis de N jours), MIGRATION SÉLECTIVE (liste d'agences). La migration crée un nouvel élément qui remplace l'ancien (`replacesItemId`, `schema.prisma:1519`) au lieu de modifier `unitMonthlyPrice` sur place, pour garder historique et MRR exacts.
  - Préavis : e-mail trilingue aux administrateurs (`billingRecipients`, `platform-invoice-service.ts:1138`), date d'effet respectant le préavis choisi.
  - Journal : vue « Historique du catalogue » filtrant `CATALOG_ITEM_UPDATED` de l'audit plateforme (écran existant, ligne Excel 567) avec différence lisible ancien/nouveau ; le seed passe par le même service.
  - Cas limites : abonnement annuel déjà payé (effet à la période suivante seulement) ; offre retirée de la vente (`isSellable = false`) n'est pas une migration ; paliers de lots simulés par rang.
- **Dépendances dans le code existant** : `updateCatalogItem`, `catalog-seed.ts`, `changePack`/`replacesItemId`, `pricing.ts`, audit (`recordAuditEvent`), E1 pour le MRR. Modèles à créer : `CatalogItemVersion` (global, `GLOBAL_MODELS`) et `PriceMigration` (agence, élément, ancien et nouveau prix, statut, date d'effet ; porte `tenantId`).
- **Effort** : L — versionnement, simulation d'impact et migration contrôlée sur toute la base.
- **Risque** : finance — migration de masse modifiant des factures futures ; garde-fous : simulation à blanc obligatoire, plafond de hausse, exécution par lots avec arrêt et audit par agence. Conformité — préavis (avis juriste). Tenant — la migration touche toutes les agences, chaque écriture doit rester dans le contexte de son agence.
- **Valeur** : agence Moyenne ; ImmoTopia Forte.
- **Prérequis et décisions métier** :
  - Q-E3-1 — Comportement par défaut d'une hausse ? Options : (a) prix figé à vie ; (b) figé jusqu'au renouvellement annuel ; (c) migration sur préavis. Recommandée : (a) parce que c'est le comportement actuel et qu'il n'expose à aucun litige.
  - Q-E3-2 — Préavis minimal avant une migration ? Options : (a) valeur fixée par le propriétaire ; (b) par type de contrat. Recommandée : (a) après avis du juriste.
  - Q-E3-3 — Qui approuve un changement de catalogue ? Options : (a) un super-admin seul ; (b) deux personnes (voir F1). Recommandée : (b) pour les hausses.
  - Q-E3-4 — Versionnement complet ou journal seul d'abord ? Options : (a) journal et validations d'abord ; (b) versionnement d'emblée. Recommandée : (a).
  - Q-E3-5 — Le seed sans `--missing-only` reste-t-il possible en production ? Options : (a) oui ; (b) refusé et remplacé par le service audité. Recommandée : (b).
- **Mise en œuvre sûre** : étape 1 sans migration de schéma (validation entière, `tierGroup` accepté, audit transactionnel, audit du seed, vue de journal) ; étape 2 versions ; étape 3 migrations. Chaque étape est indépendante et réversible.

### Thème F — Gouvernance

Quatre propositions qui encadrent qui peut accorder quoi, et comment des structures plus grandes (groupes, contrats, partenaires) entrent dans le modèle.
Chacune élargit des accès ou des engagements : la sécurité tenant et la traçabilité y priment sur la rapidité.

#### F1 — Approbation des dérogations et plafonds de remise (quatre yeux)

- **Statut** : Idée nouvelle. Actions sensibles aujourd'hui sans second regard : `grantCapacityOverride` (`api/services/subscription-v2-service.ts:1226-1270` : tout entier non nul, `expiresAt` nul = sans limite) ; `updateSubscriptionItem` (prix ou remise de 0 à 100 %, `subscription-admin-extras-service.ts:79-135`) ; ajout d'élément avec remise (`subscription-v2-controller.ts:146-151`) ; `updateSubscriptionSettings` (combinaison 0-100, prolongation d'essai, `:186-193`) ; ouverture d'un module (`module-service.ts:52-100`, sans date ni motif). Un seul rôle plateforme `PLATFORM_SUPER_ADMIN` détient toutes les permissions (`api/prisma/seeds/rbac-seed.ts:66-76,147-165`) et `PLATFORM_SUBSCRIPTIONS_EDIT` est unique (`:38`).
- **Problème** : un seul compte peut accorder une capacité illimitée, 100 % de remise ou un module permanent ; la trace n'existe qu'après coup (`CAPACITY_OVERRIDE_GRANTED`, `SUBSCRIPTION_ITEM_UPDATED`), et le motif d'une remise d'élément est facultatif.
- **Valeur pour l'agence** : des conditions commerciales cohérentes d'une agence à l'autre et motivées.
- **Valeur pour ImmoTopia** : maîtriser la fuite de revenu par gestes commerciaux, séparer demandeur et approbateur, preuve en cas d'audit ou de contestation.
- **Description fonctionnelle** :
  - Écran « Gouvernance › Règles d'approbation » (propriétaire seul) : par type d'action, seuil sans approbation (remise jusqu'à X %, dérogation jusqu'à Y unités et Z jours, prix négocié au moins égal à un pourcentage du catalogue) ; au-delà, demande obligatoire.
  - Flux : demandeur crée une demande (type, agence, paramètres, motif d'une longueur minimale) en EN ATTENTE ; un autre approbateur, jamais le demandeur (contrôle côté serveur), l'approuve ou la refuse avec commentaire ; à l'approbation le service exécute l'action dans une seule transaction avec l'identifiant de la demande (EXÉCUTÉE) ; sans décision à la date limite : EXPIRÉE.
  - Rôles : permission `PLATFORM_APPROVALS_DECIDE` (à créer) attribuée à un rôle distinct ; mode « solo » explicite quand un seul super-admin existe (auto-approbation marquée SOLO dans l'audit) pour ne pas bloquer l'exploitation.
  - Écrans : « mes demandes » et « à approuver », compteur dans l'en-tête super-admin, e-mail à l'approbateur, impact chiffré (manque à gagner mensuel de la remise, voir E1).
  - Crédits et récompenses : l'octroi manuel de crédits prépayés (D3) et les récompenses de parrainage (D2) au-delà d'un seuil de montant passent par la même demande, pour que D2 V1 et D3 aient une voie d'approbation ; en dessous du seuil, ils sont exécutés et journalisés.
  - Plafonds absolus non dérogeables (jamais de prix négatif, jamais plus de 100 %).
  - Cas limites : provisionnement et reprise automatiques à acteur système (`SYSTEM_ACTOR_ID`, `subscription-provisioning-service.ts`) exemptés ; révocation d'une dérogation jamais soumise ; demande caduque si l'abonnement a changé entre-temps ; toute modification de paramètres crée une nouvelle demande.
  - Audit : `APPROVAL_REQUESTED`, `APPROVED`, `REJECTED` liés à l'action exécutée, via `recordAuditEvent(tx)`.
- **Dépendances dans le code existant** : `subscription-v2-service.ts:1226`, `subscription-admin-extras-service.ts:79`, `module-service.ts:52`, contrôleurs correspondants, `rbac-seed.ts`, `AuditActionKey` (`api/types/audit-types.ts`). Modèle à créer : `ApprovalRequest` (objet plateforme, à classer dans `schema-tenant-coverage` comme `PlatformAiSettings`, avec `tenantId` cible).
- **Effort** : M — une machine d'états simple, une garde unique dans les services, deux écrans.
- **Risque** : sécurité — contournement par appel direct d'une ancienne route ; garde-fou : la règle vit dans les services, pas dans les contrôleurs. Finance — paramètres modifiés après approbation ; garde-fou : paramètres figés (empreinte). Opérationnel — blocage faute d'approbateur ; garde-fou : mode solo tracé.
- **Valeur** : agence Faible ; ImmoTopia Forte.
- **Prérequis et décisions métier** :
  - Q-F1-1 — Seuils sans approbation ? Options : (a) valeurs fixées par le propriétaire par type d'action ; (b) aucun seuil, tout est soumis. Recommandée : (a) pour ne pas alourdir les gestes courants.
  - Q-F1-2 — Combien de personnes peuvent approuver ? Options : (a) au moins deux comptes distincts ; (b) un seul compte, mode solo. Recommandée : (a) dès que possible, (b) en attendant.
  - Q-F1-3 — Mode solo autorisé ? Options : (a) oui, tracé ; (b) non. Recommandée : (a) en transition.
  - Q-F1-4 — Périmètre de V1 ? Options : (a) dérogations de capacité seulement ; (b) dérogations de capacité, plus crédits et récompenses (D2, D3) au-delà d'un seuil ; (c) aussi remises et prix négociés ; (d) aussi modules. Recommandée : (b) en V1, parce que D2 V1 et D3 renvoient à F1 pour leur approbation, puis (c).
  - Q-F1-5 — Délai avant expiration d'une demande ? Options : (a) valeur fixée par le propriétaire ; (b) sans expiration. Recommandée : (a).
- **Mise en œuvre sûre** : V1 en mode « observation » : calculer et journaliser « aurait exigé une approbation » sans rien bloquer (comme `SUBSCRIPTION_ENFORCEMENT=warn`) ; V2 bloquer les dérogations, ainsi que les crédits et récompenses au-delà du seuil ; V3 les remises. Réversible par un indicateur de politique.

#### F2 — Groupes multi-entités et facturation consolidée

- **Statut** : Idée nouvelle. La spec 035 « Vue Groupe » est réservée côté Patrimoine (`HANDOFF.md:114` ; `docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md:12,117`) et concerne les entités détentrices d'une même agence, pas un groupe d'agences. Aucun lien entre agences : `Tenant` n'a ni parent ni groupe (`schema.prisma:595-615`), `Subscription.tenantId` est unique (`:1331`), `Invoice.tenantId` désigne le destinataire.
- **Problème** : un opérateur à plusieurs agences reçoit N abonnements, N factures et N paiements, sans vue d'ensemble ; la remise de combinaison ne joue qu'entre les packs d'une même agence (`pricing.ts:172-175`).
- **Valeur pour l'agence** : un seul interlocuteur, un seul paiement mobile money, une vue consolidée de la consommation du groupe.
- **Valeur pour ImmoTopia** : garder les groupes comme comptes uniques, simplifier le recouvrement, base d'une offre de groupe.
- **Description fonctionnelle** :
  - Notion de groupe (`BillingGroup`, à créer) : nom, responsable de groupe (un utilisateur existant), agences membres (chacune reste un tenant isolé), mode de facturation SÉPARÉE (statu quo) ou CONSOLIDÉE.
  - Écran du responsable « Mon groupe » (route hors contexte agence, à créer) : agences, formule, jauges de consommation, factures, paiement. Il n'ouvre JAMAIS l'accès aux données métier d'une agence (biens, locataires) : entrer dans une agence exige son propre `Membership`.
  - Super-admin : créer un groupe, rattacher ou détacher une agence (motif, effet à la prochaine période), choisir le mode de facturation, voir le groupe depuis la fiche agence.
  - Calcul : chaque agence conserve son abonnement et ses éléments ; la facture consolidée regroupe leurs lignes avec un sous-total par agence, TVA 18 % sur le total HT (`finalizeInvoice`). Remise de groupe éventuelle : paramètre du propriétaire, via D1 ou F3, aucun montant ici.
  - Règles : facture consolidée impayée, effet sur les agences à trancher (jamais coupure en bloc par défaut) ; échéances d'agence différentes, alignement sur une ancre commune ou facturation par période.
  - Cas limites : agence quittant le groupe en cours de période ; appartenance à un seul groupe (unique) ; groupe sans responsable actif ; FCFA seulement (036 multi-devises non entamé).
- **Dépendances dans le code existant** : `buildPlatformInvoiceDraft` (`platform-invoice-service.ts:222`), `generateInvoiceForPeriodTx` (`:321`), verrou par agence `lockTenantBillingTx` (`:144`, à passer au groupe), `settlePlatformInvoiceTx` (`platform-payment-service.ts:188`, un paiement groupé doit solder plusieurs factures, `PlatformInvoicePayment.invoiceId` étant unique), boucle d'échéance `processBillingBoundary` (par agence), `tenant-middleware.ts` (nouveau contrôle d'accès de groupe). Modèles à créer : `BillingGroup`, `BillingGroupMember`, `Invoice.billingGroupId` (nullable).
- **Effort** : L — nouveau type d'acteur transverse, paiement ventilé et numérotation à préserver.
- **Risque** : sécurité tenant — le plus sensible : ne jamais ouvrir de lecture métier à partir du groupe ; tests `npm run test:isolation` à compléter d'abord. Finance — paiement unique ventilé, avoirs, numérotation continue. Conformité — nom du client sur la facture (`customerSnapshot`).
- **Valeur** : agence Moyenne ; ImmoTopia Moyenne.
- **Prérequis et décisions métier** :
  - Q-F2-1 — Forme de la facturation de groupe ? Options : (a) une facture mère détaillée ; (b) factures par agence plus un relevé de groupe. Recommandée : (b) parce qu'elle garde numérotation, avoirs et paiements actuels.
  - Q-F2-2 — Impayé du groupe ? Options : (a) aucune coupure automatique ; (b) grâce commune. Recommandée : (a) comme pour D15.
  - Q-F2-3 — Le responsable de groupe est-il aussi administrateur des agences ? Options : (a) non, facturation seule ; (b) oui. Recommandée : (a).
  - Q-F2-4 — Remise de groupe ? Options : (a) aucune ; (b) définie par le propriétaire. Recommandée : (a) en V1.
  - Q-F2-5 — Périodes alignées ? Options : (a) ancre commune ; (b) périodes propres à chaque agence. Recommandée : (b) en V1.
- **Mise en œuvre sûre** : V1 « relevé de groupe » en lecture seule agrégeant les factures existantes ; V2 paiement groupé soldant plusieurs factures ; V3 éventuelle facture mère. Détacher le groupe laisse les factures par agence intactes.

#### F3 — Contrats sur mesure

- **Statut** : Idée nouvelle. Éléments proches : prix figé par élément (D12), remise par élément, cycle annuel (11 mois), résiliation à `cancelAt` (`api/services/subscription-service.ts:161-205` ; accès conservé jusqu'à cette date, `entitlements.ts:306-310`), `graceDays` réglable de 0 à 90 (`subscription-v2-controller.ts:186-193`), `Subscription.metadata` JSON libre. Rien pour : durée d'engagement, reconduction, clauses, document contractuel, garantie de prix.
- **Problème** : un accord négocié vit dans la `note` d'un élément (`SubscriptionItem.note`, limitée à 500 caractères) ou dans une remise sans date de fin ; rien n'empêche une résiliation ou un retrait contraire à l'engagement ; le renouvellement ne dépend que d'une facture payée (`processBillingBoundary`, `subscription-usage-job.ts:199-250`).
- **Valeur pour l'agence** : une visibilité claire sur ses engagements, dates de préavis et prix garantis.
- **Valeur pour ImmoTopia** : traiter les gros comptes sans bricolage, ne pas laisser échapper une date de préavis ou une garantie de prix.
- **Description fonctionnelle** :
  - Super-admin : onglet « Contrat » dans `SubscriptionTab` (`web/components/admin/tenant-detail/SubscriptionTab.tsx`) : début et fin d'engagement, reconduction (TACITE avec préavis de N jours, EXPRESSE, AUCUNE), éléments à prix verrouillés et « prix garanti jusqu'au », conditions de paiement, clauses libres et pièce jointe PDF signée, stockée en privé (jamais servie en statique, règle AGENTS.md).
  - États : BROUILLON, PROPOSÉ, SIGNÉ, EN COURS, RENOUVELÉ, ÉCHU, RÉSILIÉ. La signature peut passer par le module de signature électronique (spec 044) avec un nouveau type de source à créer, ou rester hors plateforme.
  - Effets sur le moteur, limités à des champs structurés (dates, prix), jamais au texte libre : pendant l'engagement `removeSubscriptionItem` et `changePack` avertissent (« engagement jusqu'au… », dérogation motivée possible) ; résiliation avant l'échéance : avertissement, et selon la clause un solde à facturer en ligne libre (à définir) ; alertes de préavis J-90, J-60, J-30 à l'équipe ImmoTopia et au client.
  - Agence : « Abonnement › Mon contrat » en lecture seule : dates, prix garantis, prochaine échéance de préavis, téléchargement.
  - Cas limites : montée de pack en cours d'engagement ; hausse de catalogue (E3) sans effet sur les éléments verrouillés ; contrat échu sans reconduction : retour au catalogue public à la période suivante, avec préavis.
- **Dépendances dans le code existant** : `removeSubscriptionItem` (`subscription-v2-service.ts:876`), `changePack` (`:1003`), `cancelSubscription` (`subscription-service.ts:161`), rappels sur le modèle de `trialReminders` (`subscription-usage-job.ts`), envoi privé de fichiers, signature (spec 044), `recordAuditEvent`. Modèles à créer : `CustomContract` (porte `tenantId`) et ses clauses (JSON ou table).
- **Effort** : L — nouveau sous-domaine (contrat, états, rappels, fichiers) avec effets sur trois services.
- **Risque** : conformité — valeur juridique des clauses et niveau de signature (Yousign non qualifié par défaut, `HANDOFF.md:867`) : avis du juriste. Finance — pénalités de sortie. Tenant — document privé par agence, accès par permission, jamais d'URL publique.
- **Valeur** : agence Moyenne ; ImmoTopia Moyenne.
- **Prérequis et décisions métier** :
  - Q-F3-1 — Effet d'un engagement sur la résiliation ? Options : (a) information seule ; (b) avertissement et solde dû ; (c) blocage. Recommandée : (a) en V1 parce qu'il n'exige aucune règle juridique codée.
  - Q-F3-2 — Modèle contractuel ? Options : (a) modèle fourni par le juriste ; (b) texte libre par contrat. Recommandée : (a).
  - Q-F3-3 — Signature ? Options : (a) intégrée (spec 044) ; (b) hors plateforme, pièce jointe. Recommandée : (b) en V1.
  - Q-F3-4 — Pénalité de sortie facturée par la plateforme ? Options : (a) non ; (b) oui, ligne dédiée. Recommandée : (a) en V1.
  - Q-F3-5 — Reconduction tacite admise par le droit applicable ? Options : (a) oui ; (b) non, expresse seulement. Recommandée : à trancher par le juriste, (b) par prudence.
- **Mise en œuvre sûre** : V1 fiche contrat informative avec rappels de préavis, sans effet sur la facturation ; V2 avertissements ; V3 verrouillage. Réversible : sans contrat, le comportement actuel est inchangé.

#### F4 — Revendeur et marque blanche (partenaire)

- **Statut** : Idée nouvelle. Briques partielles : `Tenant.subdomain`, `customDomain`, `brandingPrimaryColor`, `logoUrl` (`schema.prisma:595-615`) sont stockés mais n'alimentent aucun routage par domaine (recherche `customDomain` : seulement création et validation, `api/controllers/tenant-controller.ts:114`, `api/services/tenant-service.ts:184-185`). `TenantType.OPERATOR` n'a pas de logique de partenaire. Seuls deux périmètres de rôle existent : `RoleScope` PLATFORM ou TENANT et `GlobalRole` SUPER_ADMIN ou USER (`schema.prisma:14-17,51-54`).
- **Problème** : un partenaire (cabinet, fédération) qui vendrait et suivrait des agences est soit super-admin (il voit tout), soit sans statut ; les factures sont émises uniquement au nom de l'émetteur plateforme (`PLATFORM_INVOICE_ISSUER`, `catalog.ts:98` ; `platformIssuer()`, `platform-invoice-service.ts:84`) ; pas de commission.
- **Valeur pour l'agence** : être accompagnée par un partenaire de confiance qui connaît son contexte.
- **Valeur pour ImmoTopia** : un canal de distribution, rémunéré seulement sur l'encaissement réel.
- **Description fonctionnelle** :
  - Fiche partenaire (`Partner`, à créer) : raison sociale, contact, statut, barème de commission fixé par le propriétaire, mode APPORTEUR (ImmoTopia facture l'agence et verse une commission) ou REVENDEUR (le partenaire refacture), ce dernier plus lourd juridiquement.
  - V1 recommandée : APPORTEUR avec gestion déléguée. Un rôle partenaire (périmètre à créer) ne voit que SES agences : liste, formule, factures, impayés ; il crée une agence en essai et demande des changements (qui passent par F1) ; jamais de données métier.
  - Portail partenaire (`/partner`, à créer) : mes agences, mes commissions par mois (base HT encaissée fois taux, statut À PAYER ou PAYÉE), exports.
  - Marque blanche (phase 2) : domaine ou sous-domaine du partenaire, logo et couleur (champs existants) à l'écran de connexion et dans les e-mails ; mention « propulsé par ImmoTopia » à décider ; l'émetteur légal des factures reste inchangé sauf revente.
  - Commissions : calculées à l'encaissement (`PlatformInvoicePayment.paidAt`) sur les lignes éligibles ; avoir ou remboursement = ligne négative le mois suivant ; versement hors plateforme (aucun décaissement automatique).
  - Cas limites : agence rattachée puis détachée ; commission sur dépassement ou mise en route ; conflit de rattachement (le premier gagne, changement par super-admin motivé) ; partenaire suspendu.
- **Dépendances dans le code existant** : `tenant-middleware.ts:110` (branche SUPER_ADMIN, base d'un nouveau périmètre borné au partenaire), garde Prisma d'isolation (nouveau contexte), `settlePlatformInvoiceTx` (hook commission), `rbac-seed.ts`, liste blanche de routes sur le modèle de `lib/subscription/particulier-routes.ts` (défaut refusé). Modèles à créer : `Partner`, `PartnerCommission`, `Tenant.partnerId` (nullable, à classer dans `schema-tenant-coverage`).
- **Effort** : L — nouvelle catégorie d'acteur inter-agences, commissions, portail et marque.
- **Risque** : sécurité tenant — maximal : nouvel acteur transversal, tests d'isolation écrits en premier, liste blanche de routes. Finance — erreurs de commission. Conformité — contrat de partenariat, statut de revendeur et TVA. Marque — usurpation d'un domaine ; vérification de propriété requise.
- **Valeur** : agence Faible ; ImmoTopia Moyenne.
- **Prérequis et décisions métier** :
  - Q-F4-1 — Modèle ? Options : (a) apporteur avec commission ; (b) revendeur qui refacture ; (c) les deux. Recommandée : (a) parce qu'ImmoTopia garde la relation de facturation et l'émetteur actuel.
  - Q-F4-2 — Base et durée de la commission ? Options : (a) premières périodes seulement ; (b) tant que l'agence paie. Recommandée : à fixer par le propriétaire, (a) par prudence.
  - Q-F4-3 — Marque blanche complète ou co-marque ? Options : (a) co-marque ; (b) blanche. Recommandée : (a).
  - Q-F4-4 — Le partenaire voit-il les factures de ses agences ? Options : (a) oui, lecture ; (b) non, impayés seulement. Recommandée : (b) en V1.
  - Q-F4-5 — Qui assure le support ? Options : (a) partenaire ; (b) ImmoTopia. Recommandée : (b) en V1.
- **Mise en œuvre sûre** : V1 sans accès partenaire : champ de rattachement et rapport de commissions pour le super-admin ; V2 portail en lecture seule ; V3 création d'agence ; V4 marque. Réversible à chaque étape.

### Thème G — Fiabilité

Deux garde-fous qui protègent l'argent : un contrôle de cohérence entre factures, paiements et abonnements, et un banc de non-régression du moteur de prix.
Ils ne changent rien pour l'agence mais réduisent le risque d'une facture fausse, d'un renouvellement non payé ou d'une régression de prix après une évolution.

#### G1 — Idempotence et réconciliation facturation/paiements

- **Statut** : Extension de l'existant. Garde-fous déjà en place : unicité d'une facture par agence, nature et début de période (plan §6 quater), verrou par agence `lockTenantBillingTx` (`api/services/platform-invoice-service.ts:144`), règlement idempotent `settlePlatformInvoiceTx` (`api/services/platform-payment-service.ts:188-205`), verrou de tâche `withJobLock` (`api/jobs/subscription-usage-job.ts:591-600`), rapprochement des paiements en ligne en attente (`reconcilePendingPlatformCheckouts`, `platform-payment-service.ts:870-907`) et des lots (`reconcileLotActivations`, `api/services/lot-registry-service.ts:427`). Absent : contrôle de cohérence facture, paiement et abonnement, et liste d'anomalies.
- **Problème** : trois trous constatés dans le code. (1) La route héritée `POST /api/admin/invoices/:invoiceId/mark-paid` (`admin-routes.ts:230` → `api/controllers/subscription-controller.ts:358-383` → `api/services/invoice-service.ts:247` → `updateInvoice`, `:109-135`) passe une facture PLATFORM à PAID sans ligne `PlatformInvoicePayment`, sans renouvellement et sans verrou de ligne ; `PATCH /admin/invoices/:id` fait de même, et `POST /admin/tenants/:id/invoices` crée des factures sans lignes (`invoice-service.ts:22-107`). Aucun appel web ne les utilise (`web/services/admin-subscription-service.ts:187-193` est sans appelant hors tests). (2) `processBillingBoundary` cherche une facture PAID de la période sans filtrer `billingNature` (`subscription-usage-job.ts:222-231`) alors qu'un avoir est créé PAID avec le `periodStart` de la facture annulée (`platform-invoice-service.ts:833-838`) : un avoir pourrait faire passer pour payée une période qui ne l'est pas (à confirmer par un test, non exécuté ici). Gravité estimée moyenne : le scénario exact est une facture de période générée à l'avance par la route admin `POST /tenants/:tenantId/platform-invoices/generate` (`platform-invoice-routes.ts:34`), puis annulée par avoir avant l'échéance ; le job n'émet rien avant l'échéance. (3) Aucun écran ne signale une facture PAID sans règlement, un règlement sans facture PAID, ou un abonnement renouvelé sans facture payée.
- **Valeur pour l'agence** : factures et état d'abonnement justes, pas de coupure ni de renouvellement indu.
- **Valeur pour ImmoTopia** : détecter tôt les écarts d'argent, corriger avec preuve, réduire les litiges et les fuites silencieuses.
- **Description fonctionnelle** :
  - Tâche quotidienne « Contrôle de facturation » (après la tâche de 02:30 UTC, sous `withJobLock`) et écran « Pilotage › Anomalies de facturation » (route à créer, `/admin/anomalies-facturation`).
  - Règles : R1 facture PLATFORM PAID de montant supérieur à zéro sans règlement (hors factures à zéro payées d'office) ; R2 règlement dont la facture n'est pas PAID ; R3 montant du règlement différent du total de la facture ; R4 paiement en ligne réussi dont la facture n'est pas PAID ; R5 paiements en revue (`REVIEW`) anciens ; R6 abonnement ACTIF dont la période courante n'est couverte par aucune facture PAID de nature PERIOD (hors gratuit et essai) ; R7 trou ou doublon dans la numérotation IMT-AAAA ; R8 deux factures non annulées de même nature et période (contrôle de secours de l'index) ; R9 avoir sans facture annulée ou l'inverse ; R10 lignes en attente trop anciennes ; R11 avoir `REFUND_DUE` sans suite ; R12 TVA différente de 18 % du HT ou somme des lignes différente du HT.
  - Chaque anomalie : gravité, agence, objets liés, première et dernière détection, état OUVERTE, ACQUITTÉE (avec motif) ou CORRIGÉE ; jamais supprimée automatiquement.
  - Correction guidée : aucune écriture automatique ; par règle, boutons ouvrant des actions existantes (enregistrer le règlement, relancer le rapprochement, émettre un avoir) qui passent par leur porte unique, avec confirmation, motif et trace liée à l'anomalie.
  - Préalable recommandé : refuser les routes héritées sur les factures de nature PLATFORM (réponse 409 « utilisez le constat de paiement »).
  - Alerte : récapitulatif aux super-admins quand une anomalie de gravité haute est ouverte.
  - Cas limites : factures de loyer (`RENTAL`) exclues ; abonnements Particulier gratuits ; dépassements annuels mensuels (nature OVERAGE) ; passage à blanc (lecture seule) pour le premier balayage de l'historique.
- **Dépendances dans le code existant** : fichiers cités ci-dessus ; règles pures dans `api/lib/subscription/reconciliation/` (à créer), service et tâche (à créer), `api/utils/job-lock.ts`. Modèle à créer : `BillingAnomaly` (règle, objets liés, gravité, état, dates ; unique `(règle, objet)` ; porte `tenantId`, à classer dans `schema-tenant-coverage`).
- **Effort** : M — règles en lecture seule, une table, une tâche et un écran de liste ; aucune écriture sur les factures.
- **Risque** : finance — faux positifs et fatigue d'alerte ; garde-fous : acquittement avec motif, règles activables une à une. Sécurité — requêtes inter-agences réservées au contexte super-admin ; `proofPath` des preuves jamais exposé. Performance — requêtes bornées par période.
- **Valeur** : agence Moyenne ; ImmoTopia Forte.
- **Prérequis et décisions métier** :
  - Q-G1-1 — Routes héritées de facture ? Options : (a) refus sur les factures PLATFORM ; (b) suppression ; (c) statu quo. Recommandée : (a) parce qu'elle ferme le contournement sans casser d'éventuel usage RENTAL ou ancien.
  - Q-G1-2 — Fréquence du contrôle ? Options : (a) quotidienne ; (b) horaire. Recommandée : (a).
  - Q-G1-3 — Règles de V1 ? Options : (a) R1 à R6 ; (b) toutes. Recommandée : (a) puis étendre.
  - Q-G1-4 — Destinataires de l'alerte ? Options : (a) tous les super-admins ; (b) un rôle finance. Recommandée : (a) en attendant F1.
  - Q-G1-5 — Profondeur historique du premier balayage ? Options : (a) 12 mois ; (b) tout l'historique. Recommandée : (a).
- **Mise en œuvre sûre** : V1 tâche en lecture seule qui journalise et affiche une liste ; V2 acquittement ; V3 liens d'action. Le contrôle n'écrit jamais sur une facture ; réversible en désactivant la tâche.

#### G2 — Tests de non-régression de prix (jeux « golden »)

- **Statut** : Extension de l'existant. Tests actuels : `packages/api/__tests__/unit/subscription.pricing.test.ts` (566 lignes : grille égale au site, exemples du plan 41 900, 55 900, 94 810, 189 900, 249 900, prorata, TVA, dépassement), `subscription-v2-service.test.ts`, `platform-invoice.test.ts` (947 lignes). Absents : jeux en données par pack, cycle et date, parité aperçu/facture émise, dates de fin de mois.
- **Problème** : un cas manquant est déjà prouvé. `addBillingPeriod` (`api/lib/subscription/pricing.ts:252-256`) fait `setUTCMonth(+1)` : 31/01/2026 devient 03/03/2026 et 31/08/2026 devient 01/10/2026 (vérifié à la main avec Node le 09/11/2026) ; l'ancre dérive, et les fenêtres de dépassement (`monthlyOverageWindow`, `subscription-v2-service.ts`, `dueOverageWindows`, `platform-invoice-service.ts:1238-1255`) en héritent. Un essai de 30 jours peut finir un 29, 30 ou 31 (`TRIAL_DAYS`, `catalog.ts:90`). Les tests ne couvrent que le 25/09 (`subscription.pricing.test.ts:560-565`). Rien ne prouve que l'aperçu (`previewNextInvoice`, `subscription-v2-service.ts:1597`) égale la facture émise (`generateInvoiceForPeriodTx`, `platform-invoice-service.ts:321`).
- **Valeur pour l'agence** : une facture juste après chaque évolution du moteur ou du catalogue.
- **Valeur pour ImmoTopia** : changer les règles (D1, D3, D4, E3) sans craindre une régression de prix silencieuse ; preuve exécutable des règles métier du plan.
- **Description fonctionnelle** (outil de test, pas d'écran) :
  - Dossier `packages/api/__tests__/golden/pricing/` : cas en JSON ou TSV versionnés. Entrée : packs, extensions, quantités, cycle, remise d'élément, remise de combinaison, date d'ajout, usage, `quotaPolicy`, catalogue figé (copie datée du `DEFAULT_CATALOG`). Sortie attendue : lignes, HT, TVA, TTC en FCFA entiers. Les attendus sont écrits et validés à la main par le propriétaire, jamais régénérés automatiquement (pas de mode de mise à jour en CI).
  - Matrice : chaque pack (AGENCE, SYNDIC, PROMOTEUR, INTEGRE, PATRIMOINE_ESSENTIEL et PRO, PARTICULIER_GRATUIT et PLUS) par cycle mensuel et annuel, sans extension, à la limite, un au-dessus, bloc complet ; combinaisons autorisées (D6) ; prorata d'ajout le 1er, le 15, le dernier jour, en février ; avoir de montée de pack ; dépassement mensuel et annuel (pic contre fin de mois) ; rangs 75 et 150 ; BLOCK et WARN_ONLY sans ligne de dépassement.
  - Propriétés vérifiées partout : somme des lignes = HT ; TVA = 18 % du HT arrondie, seulement si HT > 0 ; annuel = 11 fois le mensuel pour le récurrent ; montants entiers ; prorata au plus égal au montant du cycle ; HT non décroissant quand on ajoute une extension. La propriété « deux générations de la même période = une facture » exige la base de données : elle relève de la parité (V2).
  - Parité : sur N scénarios, l'aperçu et la facture émise ont mêmes lignes et totaux (base de test dédiée `DATABASE_URL_TEST`, comme `npm run test:isolation`).
  - Calendrier : horloge injectée (`now` est déjà un paramètre partout) ; cas 29/02/2028, 31/01, 30/04, passage d'année, essai finissant un 31, annuel du 29/02.
  - Les défauts connus s'écrivent d'abord en test attendu en échec (`it.failing`), puis la correction est décidée (Q-G2-1).
  - CI : exécution dans `npm test` ; calcul pur, quelques secondes ; sert de garde aux évolutions D1, D3, D4, E3.
- **Dépendances dans le code existant** : `pricing.ts` (pur), `catalog.ts`, `loadCatalogByCodes` (`subscription-v2-service.ts`), pour la parité la base de test. Aucun modèle Prisma nouveau.
- **Effort** : M — jeux de données et propriétés sans toucher au code de production, plus une couche de parité sur base de test.
- **Risque** : finance — faux sentiment de sécurité si les attendus sont faux ; garde-fou : validation du propriétaire ligne à ligne. Sécurité — aucune : données fictives, ni données réelles ni production. Tenant — sans objet.
- **Valeur** : agence Moyenne ; ImmoTopia Forte.
- **Prérequis et décisions métier** :
  - Q-G2-1 — Règle de fin de mois ? Options : (a) jour d'ancre conservé avec repli au dernier jour (31/01 → 28/02 puis 31/03) ; (b) statu quo (`setUTCMonth`) ; (c) premier du mois suivant. Recommandée : (a) parce que le client garde une date stable ; changement à traiter à part.
  - Q-G2-2 — Qui valide le jeu d'attendus ? Options : (a) le propriétaire ; (b) l'expert-comptable pour la TVA et l'arrondi. Recommandée : (a) puis (b) pour TVA.
  - Q-G2-3 — Arrondi du prorata ? Options : (a) au plus proche (actuel) ; (b) à l'inférieur. Recommandée : (a) conservé.
  - Q-G2-4 — Parité sur base de données bloquante en CI ? Options : (a) bloquante ; (b) non bloquante comme `test-isolation`. Recommandée : (b) au départ.
  - Q-G2-5 — Catalogue de test ? Options : (a) copie figée datée ; (b) lecture du catalogue vivant. Recommandée : (a).
- **Mise en œuvre sûre** : V1 jeux purs sur `pricing.ts` sans toucher au code de production ; V2 parité sur base de test. La correction de `addBillingPeriod` est un changement distinct, après décision Q-G2-1.

## 3. Priorisation et feuille de route

Sources : l'état des lieux (§1, trous T1 à T20) et les fiches de propositions (§2 : A1-A4, B1-B5,
C1-C2, D1-D5, E1-E3, F1-F4, G1-G2). Les valeurs, efforts et risques reprennent les fiches. Le score de priorité est un
jugement de synthèse (valeur, trous comblés, risque, dépendances) : c'est une proposition, pas
une décision. Abréviations : V1, V2, V3 = vagues du 3.3 ; « IT » = ImmoTopia.

### 3.1 Tableau valeur × effort

| ID  | Titre court                                                           | Valeur agence | Valeur IT | Effort | Risque principal                                                             | Trous T#                                               | Priorité |
| --- | --------------------------------------------------------------------- | ------------- | --------- | ------ | ---------------------------------------------------------------------------- | ------------------------------------------------------ | -------- |
| A1  | Simulateur de devis agence                                            | Moyenne       | Moyenne   | M      | Finance : devis différent de la facture ; tenant : fuite de prix figés       | T10 (T1 partiel)                                       | haut     |
| A2  | Changement de pack en libre-service avec aperçu du prorata            | Forte         | Forte     | L      | Finance : montée sans encaissement, yo-yo                                    | T1, T10                                                | haut     |
| A3  | Boutique d'extensions et incitations (alerte in-app)                  | Forte         | Forte     | L      | Finance : double clic qui double un bloc                                     | T1, T9, T17 (SMS : idée, partiel)                      | haut     |
| A4  | Historique d'abonnement et centre de facturation (reçus)              | Moyenne       | Moyenne   | M      | Tenant : historique exposant une action interne ; reçu à valeur comptable    | aucun T numéroté (1.8 « historique »)                  | moyen    |
| B1  | Lien de paiement mobile money, déclaration de paiement, reconduction  | Forte         | Forte     | L      | Finance : mauvaise facture créditée ; endpoint public ; mode réel non validé | T2 (partiel : pas de prélèvement), T19 (partiel)       | haut     |
| B2  | Relances graduées des impayés                                         | Moyenne       | Forte     | M      | Finance : relancer un montant faux ou une facture payée                      | T4, T3 (partiel)                                       | haut     |
| B3  | Cycles (trimestriel), remise annuelle paramétrable, échéancier        | Moyenne       | Forte     | L      | Finance (le plus élevé du thème B) : double facturation, règlement partiel   | T6, T14 (partiel : règlement partiel)                  | moyen    |
| B4  | Avoirs partiels, demande agence, remboursements suivis                | Moyenne       | Moyenne   | L      | Finance : avoir erroné, fraude au remboursement                              | T14                                                    | moyen    |
| B5  | TVA et mentions légales des factures de plateforme                    | Moyenne       | Forte     | M      | Conformité : document légal inexact                                          | T15 (partiel : taux et mentions), T12 (route PLATFORM) | haut     |
| C1  | Résiliation avec motif, rétention, export des données                 | Moyenne       | Forte     | L      | Sécurité : export complet ; finance : résiliation à tort                     | T5                                                     | moyen    |
| C2  | Pause d'abonnement (idée)                                             | Moyenne       | Moyenne   | L      | Finance : pauses répétées, reprise sans facture                              | T16 (pause), T12 (SUSPENDED, partiel)                  | bas      |
| D1  | Codes promo et remises temporaires (idée)                             | Moyenne       | Moyenne   | M      | Finance : double application, facture négative                               | T11                                                    | moyen    |
| D2  | Parrainage entre agences (idée)                                       | Moyenne       | Moyenne   | M      | Fraude : auto-parrainage ; finance : récompense d'une facture annulée        | aucun                                                  | bas      |
| D3  | Crédits prépayés à la carte (IA, SMS, signatures, WhatsApp)           | Forte         | Moyenne   | L      | Finance : argent encaissé d'avance, expiration, TVA ; double débit           | T17                                                    | moyen    |
| D4  | Paliers de volume et usage par paliers                                | Moyenne       | Moyenne   | M      | Finance : paliers mal ordonnés                                               | T17 (partiel : excédent signatures)                    | moyen    |
| D5  | Essais gratuits par module ou extension                               | Forte         | Moyenne   | M      | Finance : élément en essai facturé, conversion sans consentement             | T16 (partiel : essai unique)                           | moyen    |
| E1  | Tableau de bord MRR, ARR, churn, cohortes (idée)                      | Faible        | Forte     | M      | Finance : un MRR faux fausse les décisions                                   | T8                                                     | haut     |
| E2  | Tableau des impayés et prévisions d'encaissement (idée)               | Faible        | Forte     | M      | Tenant : vue inter-agences ; finance : total incohérent avec les avoirs      | T4 (partiel : vue créances)                            | moyen    |
| E3  | Simulateur de tarif, journal et versions du catalogue, grandfathering | Moyenne       | Forte     | L      | Finance : migration de masse des prix                                        | T7, T20                                                | moyen    |
| F1  | Approbation des dérogations, plafonds de remise (quatre yeux) (idée)  | Faible        | Forte     | M      | Sécurité : contournement par ancienne route ; blocage faute d'approbateur    | T11 (plafonds, partiel)                                | moyen    |
| F2  | Groupes multi-entités, facturation consolidée (idée)                  | Moyenne       | Moyenne   | L      | Tenant : le plus sensible (ne jamais ouvrir de lecture métier)               | T18 (partiel)                                          | bas      |
| F3  | Contrats sur mesure (idée)                                            | Moyenne       | Moyenne   | L      | Conformité : valeur juridique des clauses                                    | aucun                                                  | bas      |
| F4  | Revendeur et marque blanche (idée)                                    | Faible        | Moyenne   | L      | Tenant : maximal (nouvel acteur transversal)                                 | T18 (partiel)                                          | bas      |
| G1  | Réconciliation facturation et paiements                               | Moyenne       | Forte     | M      | Finance : faux positifs, fatigue d'alerte                                    | T12, T14 (partiel : REFUND_DUE)                        | haut     |
| G2  | Jeux golden de non-régression des prix                                | Moyenne       | Forte     | M      | Finance : faux sentiment de sécurité si attendus faux                        | aucun direct (garde de T13, T3)                        | haut     |

Trous sans proposition porteuse : T3 (message « impayé » trompeur à chaque renouvellement), T13 (dépassement
tarifé au prix courant), T15 pour la devise (spec 036 non entamée). B2, B1 et G2 les entourent
sans les corriger : voir 3.4 et les décisions Q-NEW-1 et Q-NEW-2 en 5.

Écarts de jugement par rapport aux fiches : valeurs et efforts repris tels quels. Deux nuances :
A1 reste M mais son extraction du « plan à blanc » conditionne A2 et A3 (effort de la vague, pas
de la fiche) ; E3 est L en entier mais son étape 1 (sans migration de schéma) est de taille M et
se traite en vague 1.

### 3.2 Matrice

Gains rapides (valeur forte à moyenne, effort M, faible risque, réversible) :

- G2 : jeux purs sur `pricing.ts`, aucun code de production touché.
- G1 V1 : tâche en lecture seule, plus refus 409 des routes héritées sur factures PLATFORM.
- E1 V1 : calcul à la volée et correction de `Statistics.tsx:84-85`.
- B5 étape 1 : contrôle des mentions et textes du PDF, aucun calcul touché.
- B2 : journal « à blanc » puis e-mail, interrupteur global.
- A1 : calcul à blanc côté API, sans écriture en base.
- E3 étape 1 : validation entière, `tierGroup` accepté, audit transactionnel, audit du seed.
- A4 (lecture seule d'abord) : historique agrégé, aucune écriture.

Paris structurants (valeur forte, effort L, dépendances lourdes) :

- A2 et A3 (libre-service : permission, plan à blanc, encaissement de la montée).
- B1 (lien public, déclaration ; la reconduction dépend du mode réel PaySecureHub).
- C1 (parcours de résiliation, export côté agence).
- D3 (portefeuille de crédits, à généraliser avant la spec 028).
- E3 complet (versions, migrations de prix) ; B3 (règlements partiels, cycles).

À planifier (valeur moyenne, effort M ou dépendance de décision) :

- D1, D4, D5 (leviers de prix, après G2 et E3 étape 1).
- E2 (créances, après B2 pour ne pas dupliquer le journal de relances).
- F1 (approbation, mode observation d'abord).
- B4 (file de demandes d'avoir, après A4).

À écarter ou différer (idées à faible valeur agence, risque tenant ou juridique élevé) :

- C2 (pause), D2 (parrainage), F2 (groupes), F3 (contrats), F4 (revendeur, marque blanche).
- Parties à différer dans des propositions retenues : blocs SMS de A3 et unité SMS de D3
  (fournisseur non en service), cycle trimestriel et échéancier de B3 (Q-B3-1, Q-B3-3),
  prélèvement automatique de B1 (non vérifié chez l'agrégateur).

### 3.3 Feuille de route en 3 vagues

L'ordre suit les dépendances citées dans les fiches : tout ce qui touche au prix s'appuie sur
G2 (garde) et sur un moteur de plan unique (A1) ; tout ce qui donne un geste à l'agence (A2, A3,
C1) exige la permission `TENANT_SUBSCRIPTION_MANAGE`, le plan à blanc et un encaissement fiable
(B1, B2, G1) ; les leviers de prix et la gouvernance (D, F) lisent ou approuvent des écritures
que les vagues précédentes ont sécurisées.

**Vague 1 : correctifs de fiabilité et base**

- Objectif : fermer les contournements, rendre les calculs prouvés et visibles, poser le moteur
  de plan sans écriture, avant de donner la main aux agences.
- Propositions : G2, G1, A1, B5 (étape 1), B2, E1 (V1), E3 (étape 1), B3 (étape 1 : blocage du
  `PATCH` historique de cycle, remise annuelle paramétrable), plus les correctifs de 3.4
  marqués « V1 ». Conception seule (pas de livraison) : règlements multiples par facture
  (relâcher l'unicité de `PlatformInvoicePayment.invoiceId`), nécessaire à B3 et F2.
- Dépendances entre elles : G2 avant tout changement de `pricing.ts` (A1, E1 pour la fonction
  de MRR pure, D4 plus tard) ; G1 R1 (refus des routes héritées) et B5 (Q-B5-6) partagent la
  même implémentation ; B2 se coordonne avec E2 (un seul journal de relances) ; A1 fournit
  l'extraction de plan à blanc reprise par A2 et A3.
- Dépendances hors lot : décisions Q-G1-1 et Q-G2-1 ; avis de l'expert-comptable pour le
  jeu minimal de mentions (B5) et la TVA (G2, Q-G2-2) ; décision sur le sort de la branche
  `feat/abonnement-libre-service` (spec 045, numéro en collision, `HANDOFF.md:112`) car A1
  reprend son devis d'élément (§3.3 de la spec) ; mode réel PaySecureHub non requis ici.
- Critère de sortie : jeux golden verts en CI ; parité aperçu / facture démontrée sur base de
  test ; une première liste d'anomalies de facturation lue sur le staging et revue ;
  routes héritées refusées sur PLATFORM ; émission bloquée sans mentions en production ;
  relances tracées « à blanc » pendant un cycle complet sans écart ; `Statistics.tsx`
  affiche des nombres justes ; devis agence égal à l'ajout réel sur tous les cas de test.

**Vague 2 : libre-service et encaissement**

- Objectif : l'agence modifie et paie seule ; ImmoTopia encaisse sans relance manuelle.
- Propositions : A2, A3 (sans SMS), A4 (historique, reçus), B1 (lien et déclaration d'abord),
  B4 (file de demandes d'avoir, suivi « À rembourser »), C1 (motif et journal côté super-admin,
  puis demande côté agence, puis effet automatique), B2 (ajout du lien de paiement B1 aux
  relances).
- Dépendances entre elles : A2 et A3 reprennent le plan à blanc d'A1 et créent la permission
  commune `TENANT_SUBSCRIPTION_MANAGE` ; A3 expose `QuotaAlert` (T9) ; A2 sans paiement
  immédiat de la montée laisse le risque d'accès sans paiement (Q-A2-1) ; A4 est l'entrée des
  demandes d'avoir de B4 ; C1 propose A2 (rétrogradation) et, plus tard, C2 (pause) comme
  rétention, et renvoie le remboursement à B4 ; B1 et B2 se complètent (le lien rend la relance
  utile).
- Dépendances hors lot : fusion ou reprise de la branche spec 045 (A2 en est absent, A1/A3/A4
  la recoupent) ; validation du mode réel PaySecureHub (aucune reconduction ni prélèvement
  avant) ; spec 044 pour le quota signatures ; fournisseur SMS Orange non en service (canal
  SMS de B1, B2 et blocs SMS de A3 reportés) ; avis du juriste pour la conservation des données
  (C1) et du comptable pour le reçu (A4).
- Critère de sortie : une agence change de pack, ajoute et retire une extension sans
  intervention, avec aperçu égal au résultat ; une montée non réglée n'ouvre pas d'accès durable
  (selon Q-A2-1) ; un impayé reçoit sa séquence de relances avec lien ; reçus et historique
  disponibles ; file d'avoirs opérationnelle ; résiliation demandable avec motif et export.

**Vague 3 : tarification avancée, pilotage, gouvernance**

- Objectif : faire varier les prix et piloter l'activité sans bricolage, sous contrôle.
- Propositions : F1 (d'abord, car D1, D2, D3 et G1 y renvoient), D1, D4, D5, D3, E3 (étapes 2
  et 3), E2, B3 (cycle à l'échéance, échéancier, trimestriel), E1 (V2 relevés mensuels et
  cohortes), puis par ordre de valeur décroissante C2, D2, F3, F2, F4 (idées, à confirmer).
- Dépendances entre elles : D1, D4, D5 et E3 passent par G2 ; E3 simule l'impact avec le MRR
  d'E1 ; D1 plafonne via F1 (Q-D1-5) ; D2 V1 approuve la récompense via F1 ; D3 soumet l'octroi
  à F1 ; B3 échéancier suppose les règlements multiples conçus en vague 1 et B1 ; F2 V2 suppose
  aussi les règlements multiples ; F4 s'appuie sur F1 ; C2 sert d'offre de rétention de C1.
- Dépendances hors lot : crédits IA spec 028 (D3 doit remplacer `AiCreditGrant` et
  `AiCreditLedger` par un portefeuille généralisé avant leur implémentation) ; spec 044 (SG-R12 à
  rouvrir pour D4 Q-D4-3 avec Q-NEW-3 pour l'empilement du quota, signature de contrat F3) ; spec 035 (réservée côté Patrimoine, ne
  pas confondre avec F2) ; spec 036 multi-devises non entamée ; avis juriste (préavis E3,
  conditions d'expiration D3, contrats F3, partenariat F4) et comptable (produit constaté
  d'avance D3).
- Critère de sortie : changement de catalogue publiable avec simulation d'impact et journal ;
  premier levier de prix (code promo ou palier de lots) en production sans écart golden ; une
  dérogation sensible suit la règle d'approbation choisie ; tableau des créances et des revenus
  récurrents utilisé par l'équipe.

### 3.4 Anomalies de code à corriger indépendamment des propositions

Ne figurent que les constats déjà établis dans l'état des lieux (§1) et les fiches (§2). Gravité = estimation de synthèse.
« Vérifié ici » signifie relu dans le code du worktree pour cette synthèse, sans exécution.

| Fichier:ligne                                                                                                                              | Constat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Gravité                        | Rattachement                             | Vague                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------- | ----------------------------------------------------- |
| `packages/api/src/lib/subscription/pricing.ts:252-256`                                                                                     | `addBillingPeriod` fait `setUTCMonth(+1)` : 31/01/2026 devient 03/03/2026, 31/08/2026 devient 01/10/2026 ; l'ancre dérive, les fenêtres de dépassement en héritent (vérifié ici dans le code ; dates de la fiche G2 vérifiées par Node)                                                                                                                                                                                                                                                     | haute                          | G2 (Q-G2-1), B3                          | V1 (test en échec d'abord, correction après décision) |
| `packages/api/src/jobs/subscription-usage-job.ts:222-231`                                                                                  | `processBillingBoundary` cherche une facture PAID de la période sans filtrer `billingNature` (vérifié ici) ; un avoir est créé PAID avec le `periodStart` de la facture annulée (`platform-invoice-service.ts:833-838`) : une période pourrait passer pour payée. Scénario : facture de période générée à l'avance par la route admin `POST …/platform-invoices/generate` puis annulée par avoir avant l'échéance (le job seul n'émet rien avant l'échéance). Effet à confirmer par un test | moyenne (à confirmer par test) | G1                                       | V1                                                    |
| `packages/api/src/routes/admin-routes.ts:222-230`, `services/invoice-service.ts:10-14,48,109-135,244-255`                                  | Routes héritées (création, `PATCH`, `mark-paid`) sur factures PLATFORM : numéro `INV-` hors série IMT, passage à PAID sans règlement, sans renouvellement, sans verrou (routes vérifiées ici ; aucun appel web : `admin-subscription-service.ts:187-193`)                                                                                                                                                                                                                                   | haute                          | G1 (Q-G1-1), B5 (Q-B5-6) ; T12           | V1                                                    |
| `packages/api/src/services/subscription-service.ts:83-104`                                                                                 | `PATCH` historique accepte tout statut et réécrit `currentPeriodEnd` sans facture ni prorata ; SUSPENDED n'a aucun producteur légitime                                                                                                                                                                                                                                                                                                                                                      | haute                          | B3 (blocage du cycle), C2 ; T6, T12      | V1                                                    |
| `apps/web/src/pages/admin/Statistics.tsx:84-85`                                                                                            | Lit `activeSubscriptions` et `cancelledSubscriptions` que l'API ne renvoie pas (`statistics-service.ts:139-150`) : « undefined actifs » (lignes vérifiées ici) ; `subscriptionsByPlan` à zéro (`planKey` nul)                                                                                                                                                                                                                                                                               | moyenne                        | E1 (V1) ; T8                             | V1                                                    |
| `packages/api/src/controllers/subscription-v2-controller.ts:81-91` et `:55-70`                                                             | `catalogPatchSchema` accepte des prix non entiers (`z.number().nonnegative()` sans `.int()`) ; `rulesSchema` strict sans `tierGroup` : réécrire `rules` d'un pack Patrimoine ou Particulier perd son palier                                                                                                                                                                                                                                                                                 | haute                          | E3 étape 1 ; T7                          | V1                                                    |
| `packages/api/prisma/seeds/catalog-seed.ts:44-52` ; `services/audit-service.ts:29-39`                                                      | Le seed met à jour les prix sans audit ; `updateCatalogItem` journalise par la file mémoire best-effort au lieu de `recordAuditEvent(tx)`                                                                                                                                                                                                                                                                                                                                                   | moyenne                        | E3 étape 1 ; T20                         | V1                                                    |
| `packages/api/src/config/env.ts:261-266`, `env.example:117-122`                                                                            | `PLATFORM_ISSUER_*` facultatives, RCCM, compte contribuable, adresse, téléphone vides : une facture peut sortir sans identifiant fiscal                                                                                                                                                                                                                                                                                                                                                     | haute (conformité)             | B5 (Q-B5-2) ; T15                        | V1                                                    |
| `packages/api/src/lib/subscription/platform-invoice-pdf.ts:268,271`                                                                        | Textes en dur sans accents et hors `t()` (« Reglee le », « Montant a regler »), contre la règle i18n d'`AGENTS.md`                                                                                                                                                                                                                                                                                                                                                                          | faible                         | B5                                       | V1                                                    |
| `packages/api/src/jobs/subscription-usage-job.ts:222-252` ; `services/platform-invoice-service.ts:1317-1321`                               | Conforme à D8 / `PLAN-ABONNEMENTS.md` §6 bis (facture de période émise à l'échéance, sinon `PAST_DUE`), mais message « impayé » trompeur à chaque renouvellement, posé dans le même passage que l'émission (lecture du code, non rejoué) ; échéance de facture = début + `graceDays` (`:287`)                                                                                                                                                                                               | moyenne (à rejouer)            | aucune (B1, B2 atténuent) ; T3 ; Q-NEW-1 | à décider                                             |
| `packages/api/src/services/subscription-v2-service.ts:1567` ; `lib/subscription/pricing.ts:296`                                            | Dépassement tarifé au catalogue courant, pas au prix figé : modifier une extension modifie les dépassements en cours (contredit `schema.prisma:1471-1473`)                                                                                                                                                                                                                                                                                                                                  | moyenne                        | aucune ; liée à E3 et D4 ; T13 ; Q-NEW-2 | à décider                                             |
| `packages/api/src/jobs/subscription-usage-job.ts:459`                                                                                      | `listQuotaAlerts` sans appelant : l'alerte in-app annoncée (`PLAN-ABONNEMENTS.md:169-173`) n'existe pas côté écran ; relevés lus seulement pour le dépassement annuel                                                                                                                                                                                                                                                                                                                       | moyenne                        | A3 ; T9                                  | V2                                                    |
| `packages/api/src/services/platform-invoice-service.ts:753-766,1153`                                                                       | `markOverdueInvoices` ne notifie personne ; l'échec d'envoi d'e-mail n'est que journalisé                                                                                                                                                                                                                                                                                                                                                                                                   | moyenne                        | B2 ; T4                                  | V1                                                    |
| `packages/api/src/services/platform-invoice-service.ts:779-780,837`                                                                        | Avoir sur facture payée : `REFUND_DUE` sans suite outillée ; `InvoiceStatus.REFUNDED` produit par aucune route PLATFORM (seulement le `PATCH` historique, `subscription-controller.ts:50`)                                                                                                                                                                                                                                                                                                  | moyenne                        | B4, G1 (règle R11) ; T14                 | V2                                                    |
| `packages/api/src/services/subscription-service.ts:161-216,167,171` ; `controllers/subscription-controller.ts:171-190`                     | `cancelSubscription` : pas de motif, éléments non terminés, modules non resynchronisés, `Error` nues, statut HTTP deviné depuis le message (contre `AGENTS.md`) ; CANCELED sort de `LIVE_STATUSES` : plus de relevés ni d'alertes jusqu'à `cancelAt`                                                                                                                                                                                                                                        | moyenne                        | C1 ; T5                                  | V2                                                    |
| `packages/api/src/services/module-service.ts:52-100`                                                                                       | `updateTenantModules` pose `source: 'OVERRIDE'` sans `expiresAt` ni motif ; `TenantModule.expiresAt` jamais écrit                                                                                                                                                                                                                                                                                                                                                                           | moyenne                        | D5, F1                                   | V3                                                    |
| `subscription-admin-extras-service.ts:87-98` ; `subscription-v2-service.ts:1317-1322` ; `controllers/platform-billing-controller.ts:64-69` | Remises 0 à 100 %, motif d'élément facultatif, aucun plafond ni approbation                                                                                                                                                                                                                                                                                                                                                                                                                 | moyenne                        | F1, D1 ; T11                             | V3                                                    |
| `packages/api/src/jobs/subscription-usage-job.ts:87`                                                                                       | Lien des e-mails vers `/settings/abonnement` alors que « Payer en ligne » vit sous `/settings/facturation`                                                                                                                                                                                                                                                                                                                                                                                  | faible                         | B1, B2 ; T19                             | V1 (avec B2)                                          |
| `docs/architecture/PLAN-ABONNEMENTS.md:20-29,55-57,139-141,169-173,314-362` ; `catalog.ts:238-241` ; `HANDOFF.md:114`                      | Contradictions documentation/code (1.9 : packs Patrimoine absents du plan, phase `GRACE`, « écran catalogue », prix figé hors dépassement, libre-service particulier)                                                                                                                                                                                                                                                                                                                       | faible                         | A3, E3, D4 (mise à jour de doc)          | au fil de l'eau                                       |

## 4. Les cinq propositions à spécifier en premier

Choix : G2, G1, A1, B2, B5. Tous cinq sont de taille M, sans migration lourde, et réversibles
(lecture seule, à blanc ou interrupteur). Ils comblent T10, T4, T12, T15 et protègent le moteur
de prix que toutes les autres propositions modifient. G2 et G1 sont les gardes sans lesquelles
une évolution de prix ou de règlement est risquée. A1 pose l'unique moteur de plan sans écriture
dont A2, A3, B3 et E3 dépendent. B2 et B5 réduisent un risque présent (impayés muets, factures
sans identifiant fiscal) sans toucher aux calculs. E1 (MRR) est le sixième candidat : il recoupe
la fonction de plan d'A1, donc il suit.

### 4.1 G2 — Jeux golden de non-régression des prix

**Objectifs**

- Figer les règles de prix (grille, prorata, cycle, TVA, dépassement) par des cas validés à la
  main.
- Vérifier des propriétés vraies pour toute entrée (somme des lignes, TVA, entiers).
- Couvrir le calendrier (fins de mois, 29/02) avec une horloge injectée.
- Prouver, en V2, que l'aperçu de facture égale la facture émise.

**Hors périmètre**

- Toute modification de `pricing.ts` : la correction de `addBillingPeriod` est un changement
  distinct, après Q-G2-1 ; aucun écran, aucune donnée réelle, aucun mode de régénération.

**Règles de gestion**

- R1. Les cas sont des fichiers de données versionnés dans
  `packages/api/__tests__/golden/pricing/`. Entrée : packs, extensions, quantités, cycle,
  remise d'élément, remise de combinaison, date d'ajout, usage, `quotaPolicy`, catalogue figé
  (copie datée de `DEFAULT_CATALOG`, Q-G2-5).
- R2. Sortie attendue : lignes, total HT, TVA, TTC en FCFA entiers, écrite à la main et validée
  par le propriétaire (Q-G2-2). Aucun script ne réécrit les attendus ; la CI échoue sur écart.
- R3. Propriétés vérifiées sur tous les cas : somme des lignes = HT ; TVA = 18 % du HT arrondie
  (`roundFcfa`) seulement si HT > 0 ; récurrent annuel = 11 fois le mensuel (état actuel,
  `ANNUAL_MONTHS`) ; montants entiers ; prorata au plus égal au montant du cycle ; HT non
  décroissant quand on ajoute une extension.
- R4. Matrice minimale : chaque pack (AGENCE, SYNDIC, PROMOTEUR, INTEGRE, PATRIMOINE_ESSENTIEL,
  PATRIMOINE_PRO, PARTICULIER_GRATUIT, PARTICULIER_PLUS) en mensuel et annuel, sans extension, à
  la limite, un au-dessus, bloc complet ; combinaisons autorisées (D6) ; prorata d'ajout le 1er,
  le 15, le dernier jour du mois et en février ; avoir de montée de pack ; dépassement mensuel et
  annuel (pic contre fin de mois) ; rangs 75 et 150 ; BLOCK et WARN_ONLY sans ligne de
  dépassement. Les exemples existants de `subscription.pricing.test.ts` (41 900, 55 900,
  94 810, 189 900, 249 900) sont repris tels quels.
- R5. Horloge injectée (`now` est déjà un paramètre) : cas 29/02/2028, 31/01, 30/04, passage
  d'année, essai de 30 jours finissant un 31, annuel du 29/02.
- R6. Les défauts connus s'écrivent en `it.failing` : 31/01/2026 attendu 28/02/2026 selon
  l'option (a) de Q-G2-1, obtenu 03/03/2026 ; 31/08/2026 obtenu 01/10/2026. La correction n'est
  pas décidée ici.
- R7. V2, parité : sur N scénarios, `previewNextInvoice` et `generateInvoiceForPeriodTx`
  produisent mêmes lignes et totaux, sur base `DATABASE_URL_TEST` (Q-G2-4 : bloquant ou non). Propriété ajoutée ici, avec base de données : deux générations de la même période produisent une seule facture (unicité agence, nature, début de période). V1 reste sans base de données.
- R8. Le prorata reste arrondi au plus proche (Q-G2-3 option a, état actuel) tant que non
  tranché.

**Modèle de données touché**

- Aucun modèle Prisma, aucune migration. Pas de nouvelle route : `routes-inventory.test.ts` et
  `schema-tenant-coverage.test.ts` ne bougent pas.
- La parité (V2) crée des agences fictives en base de test, avec `tenantId` propre à chaque
  scénario, annulées par transaction.

**API et écrans**

- Aucun. CI : exécution dans `npm test` (API) ; la parité tourne dans un script séparé du type
  `test:isolation` (nom à définir) tant que Q-G2-4 n'est pas tranchée.

**Critères d'acceptation**

1. Given le catalogue figé, When on exécute les cas golden, Then chaque sortie égale
   l'attendu à l'unité de FCFA près (zéro tolérance).
2. Given un cas modifié sans mise à jour de son attendu, When la CI tourne, Then elle échoue.
3. Given une entrée quelconque de la matrice, When on calcule, Then les propriétés R3 sont vraies.
4. Given l'horloge fixée au 31/01/2026, When on ajoute une période mensuelle, Then le test
   `it.failing` signale l'écart connu et la suite reste verte.
5. Given un abonnement annuel, When on calcule le récurrent, Then il vaut 11 fois le mensuel.
6. Given un ajout le dernier jour du mois, When on calcule le prorata, Then il vaut un jour
   et reste inférieur ou égal au montant du cycle.
7. Given BLOCK ou WARN_ONLY, When l'usage dépasse, Then aucune ligne OVERAGE n'apparaît.
8. Given un scénario de parité (V2), When on compare aperçu et facture émise, Then lignes et
   totaux sont identiques.
9. Given la suite complète, When on mesure, Then elle s'exécute en quelques secondes (calcul pur).

**Tests**

- Unitaires : cas golden et propriétés sur `pricing.ts` et `catalog.ts`.
- Intégration : parité aperçu et facture (V2) sur base de test.
- Isolation : sans objet (données fictives) ; vérifier seulement que deux agences de test ne
  partagent aucun état.

**Décisions préalables** : Q-G2-1 (règle de fin de mois), Q-G2-2 (validation des attendus),
Q-G2-3 (arrondi du prorata), Q-G2-4 (parité bloquante), Q-G2-5 (catalogue de test).

### 4.2 G1 — Réconciliation facturation et paiements (V1)

**Objectifs**

- Fermer le contournement des routes héritées sur les factures PLATFORM.
- Détecter chaque jour les écarts entre factures, règlements et abonnements.
- Lister les anomalies pour les super-admins, sans jamais écrire sur une facture.
- Confirmer ou écarter le défaut de `processBillingBoundary` face aux avoirs.

**Hors périmètre**

- Acquittement, correction guidée et liens d'action (V2, V3) ; règles de contrôle au-delà de
  RC1 à RC6 (Q-G1-3) ; toute correction automatique ; tout accès côté agence.

**Règles de gestion**

- R1. Pour une facture de nature PLATFORM, `POST /admin/tenants/:tenantId/invoices`,
  `PATCH /admin/invoices/:invoiceId` et `POST /admin/invoices/:invoiceId/mark-paid` répondent 409
  par une erreur typée avec le message « utilisez le constat de paiement » (Q-G1-1 option a).
  Les factures RENTAL ne changent pas pour `PATCH` et `mark-paid` ; la création ne produit que du PLATFORM. Cette règle est implémentée une seule fois, aussi pour B5.
- R2. RC1 : facture PLATFORM PAID de montant supérieur à zéro sans règlement (hors factures à
  zéro payées d'office). RC2 : règlement dont la facture n'est pas PAID. RC3 : montant du
  règlement différent du total de la facture. RC4 : paiement en ligne réussi dont la facture
  n'est pas PAID. RC5 : paiement en revue (`REVIEW`) plus ancien qu'un seuil à fixer. RC6 :
  abonnement ACTIVE non gratuit, hors essai, dont la période courante n'est couverte par aucune
  facture PAID de nature PERIOD.
- R3. Une anomalie est unique par (règle, objet) ; elle porte gravité, agence, objets liés,
  première et dernière détection, état OUVERTE. Elle n'est jamais supprimée automatiquement.
- R4. Le contrôle ne fait aucune écriture sur `Invoice`, `PlatformInvoicePayment`,
  `PlatformPaymentCheckout` ni `Subscription`.
- R5. Tâche quotidienne après le passage de 02:30 UTC, sous `withJobLock`. Premier balayage à
  blanc, 12 mois d'historique (Q-G1-5), sans alerte.
- R6. Alerte : un récapitulatif aux destinataires de Q-G1-4 quand une anomalie de gravité haute
  est ouverte, une seule fois par anomalie.
- R7. Exclusions : factures RENTAL, abonnements Particulier gratuits, factures de nature OVERAGE
  pour RC6, factures à zéro.
- R8. Un test reproduit d'abord le cas « avoir PAID de même `periodStart` » sur
  `processBillingBoundary`. S'il est confirmé, le filtre `billingNature: PERIOD` est ajouté dans
  le même lot, sur décision du chef de lot.
- R9. Les détails d'une anomalie n'exposent jamais `proofPath`.

**Modèle de données touché**

- Lecture : `Invoice`, `InvoiceLine`, `PlatformInvoicePayment`, `PlatformPaymentCheckout`,
  `Subscription`, `SubscriptionItem`.
- Création : `BillingAnomaly` (id, `tenantId` de l'agence concernée, `rule`, `objectType`,
  `objectId`, `severity`, `status`, `details` JSON, `firstDetectedAt`, `lastDetectedAt`) ;
  unique `(rule, objectType, objectId)` ; index `(status, severity)`. Migration additive.
- `schema-tenant-coverage.test.ts` : classer `BillingAnomaly` comme modèle porteur de `tenantId`.
  `routes-inventory.test.ts` : une route admin ajoutée. Toute requête agrégée reste dans le
  contexte super-admin ; aucune route agence.

**API et écrans**

- `GET /api/admin/billing-anomalies` (filtres règle, gravité, état, agence ; pagination),
  permission `PLATFORM_INVOICES_VIEW` à confirmer. Écran « Pilotage › Anomalies de facturation »
  `/admin/anomalies-facturation`, lecture seule en V1.
- Réponses 409 des routes héritées (R1).

**Critères d'acceptation**

1. Given une facture PLATFORM, When on appelle `mark-paid` historique, Then réponse 409 et aucune
   écriture.
2. Given une facture RENTAL, When on appelle `PATCH` ou `mark-paid`, Then le comportement est inchangé
   (`POST /admin/tenants/:id/invoices` ne crée que des factures PLATFORM, `kind` par défaut).
3. Given une facture PAID de 10 000 sans règlement, When le contrôle passe, Then RC1 est créée.
4. Given deux passages successifs sans changement, When on compare, Then aucune anomalie en
   double (idempotence).
5. Given une facture payée d'office à zéro, When le contrôle passe, Then aucune anomalie.
6. Given une anomalie OUVERTE, When la tâche tourne à nouveau, Then `lastDetectedAt` avance et
   `firstDetectedAt` reste.
7. Given un utilisateur d'agence, When il appelle la route, Then 403 ; un super-admin reçoit la
   liste sans `proofPath`.
8. Given le premier balayage, When il tourne, Then aucune alerte n'est envoyée.
9. Given un avoir PAID de même `periodStart`, When `processBillingBoundary` s'exécute, Then le
   résultat est consigné par le test R8 (renouvellement indu : oui ou non).

**Tests**

- Unitaires : règles pures dans `lib/subscription/reconciliation/`.
- Intégration (base de test) : un scénario par règle, idempotence, exclusions, routes 409.
- Isolation : une anomalie ne se lit qu'en super-admin ; `npm run test:isolation` complété pour
  vérifier qu'une agence ne voit aucune anomalie, y compris celles d'une autre agence.

**Décisions préalables** : Q-G1-1 à Q-G1-5 ; coordination avec Q-B5-6.

### 4.3 A1 — Simulateur de devis agence

**Objectifs**

- Donner à l'agence un devis HT, TVA et TTC avant tout achat, mensuel et annuel côte à côte.
- Extraire un plan de changement sans écriture, partagé par le devis et l'exécution.
- Chiffrer le prorata hors essai et les refus identiques à l'achat réel.

**Hors périmètre**

- Achat, changement de pack, ajout ou retrait (A2, A3) ; simulateur public (Q-A1-2 option a) ;
  PDF de devis (Q-A1-4 option a) ; blocs SMS ; mode réel de paiement.

**Règles de gestion**

- R1. Une seule fonction de plan sans écriture (nom provisoire `planSubscriptionChange`),
  extraite de `addSubscriptionItem`, sert au devis et à l'exécution.
- R2. Entrée : packs vendables, quantités d'extensions, cycle. Sortie : lignes récurrentes
  (`computeRecurringLines`), remise de combinaison, total HT, TVA 18 % sur le total HT
  (`finalizeInvoice`), TTC, différence avec l'abonnement actuel, en FCFA entiers.
- R3. Mensuel et annuel affichés côte à côte ; annuel = 11 mensualités ; la différence est un
  montant en FCFA, aucun pourcentage.
- R4. Prorata hors essai : jours restants, jour d'ajout compris (`prorateAmount`), plus la
  variation de la remise de combinaison ; pendant l'essai : aucun prorata ; en annuel :
  montants multipliés par `cycleMultiplier`.
- R5. Refus identiques à l'achat (`assertPackComposition`) : offre non vendable, Intégré
  exclusif, extension non autorisée par les packs détenus, pack déjà souscrit ; erreur typée,
  jamais de chiffre faux.
- R6. Mise en route `SETUP_<PACK>` en ligne séparée si Q-A1-3 option a.
- R7. Si `quotaPolicy = BILL_OVERAGE`, le dépassement estimé à la consommation actuelle est
  affiché ; mention permanente « Devis indicatif, hors dépassements éventuels ».
- R8. Visibilité : `TENANT_SUBSCRIPTION_MANAGE` ou permission de lecture dédiée (Q-A1-1 option a ;
  `TENANT_SETTINGS_VIEW` ouvrirait aussi aux managers et agents, `rbac-seed.ts:242, 293`) ; espace PARTICULIER : route refusée
  (liste blanche `particulier-routes.ts`).
- R9. La route ne lit que l'abonnement de `:tenantId` ; elle ne renvoie ni catalogue non
  vendable ni prix figés d'une autre agence ; les éléments déjà détenus gardent leur prix figé.
- R10. Le devis est identique au résultat d'un ajout réel pour la même entrée (test d'égalité).

**Modèle de données touché**

- Aucun modèle ni champ nouveau, aucune migration. Lecture : `Subscription`,
  `SubscriptionItem`, `CatalogItem`, `CatalogCapacity`, `UsageSnapshot`.
- `routes-inventory.test.ts` : une route agence ajoutée. `schema-tenant-coverage.test.ts` : sans
  objet. Toute lecture filtrée par le `tenantId` du contexte.

**API et écrans**

- `POST /api/tenants/:tenantId/subscription/quote`, préfixe `/subscription` déjà exempté de
  lecture seule. Écran « Simuler mon abonnement » dans Abonnement (`?onglet=simulateur`) ;
  même devis en lecture seule dans `SubscriptionTab.tsx` côté super-admin. Libellés `t()` fr,
  en, ar, mise en page RTL.

**Critères d'acceptation**

1. Given une agence en essai, When elle simule l'ajout du pack SYNDIC, Then aucune ligne de
   prorata n'apparaît.
2. Given une agence ACTIVE hors essai, When elle simule un ajout, Then le prorata égale celui
   d'un ajout réel au même jour.
3. Given Agence et Syndic, When elle simule, Then la remise de combinaison figure et le total HT
   égale le calcul de `computeRecurringLines`.
4. Given un pack Intégré avec un autre pack, When elle simule, Then refus typé, pas de chiffre.
5. Given une extension non autorisée par ses packs, When elle simule, Then refus typé.
6. Given un espace PARTICULIER, When il appelle la route, Then refus.
7. Given deux agences, When l'une simule, Then aucun prix figé ni donnée de l'autre n'est
   renvoyé.
8. Given le même scénario, When on compare devis et ajout réel en base de test, Then lignes,
   HT, TVA et TTC sont identiques.
9. Given un cycle annuel, When elle simule, Then le total annuel affiché vaut 11 mensualités.

**Tests**

- Unitaires : plan sans écriture sur les exemples de `subscription.pricing.test.ts` (appui
  sur G2).
- Intégration : égalité devis et ajout réel ; refus ; essai et hors essai.
- Isolation : route agence sans fuite inter-agences ; Particulier refusé.

**Décisions préalables** : Q-A1-1 à Q-A1-4 ; reprise ou abandon du devis d'élément de la
spec 045 §3.3 (branche non fusionnée).

### 4.4 B2 — Relances graduées des factures impayées

**Objectifs**

- Prévenir l'agence avant la lecture seule, avec le montant et le moyen de payer.
- Garantir l'idempotence des envois par un journal d'événements.
- Offrir au super-admin une suspension motivée et un interrupteur global.

**Hors périmètre**

- Frais de retard (Q-B2-5 option a) ; SMS et WhatsApp (Q-B2-2 option a) ; changement de
  `graceDays` ou des phases (D8 inchangé) ; lien de paiement public (B1) ; tableau des
  créances (E2).

**Règles de gestion**

- R1. Le calendrier est une liste d'étapes en jours relatifs à l'échéance de la facture
  (négatif avant, positif après). Les valeurs sont fixées par le propriétaire ; aucune valeur
  par défaut n'est codée, l'interrupteur global est coupé à la livraison (Q-B2-1).
- R2. Éligibilité : facture PLATFORM ISSUED ou OVERDUE, nature PERIOD ou OVERAGE ; abonnement non
  gratuit (`isFreeSubscription`) ; pas de lecture seule manuelle ; aucun checkout `PENDING` ;
  relances non suspendues pour l'agence.
- R3. Idempotence : un `DunningEvent` unique par (facture, étape, canal) ; passage quotidien
  (02:30 UTC). Le montant TTC est relu de la facture et son statut revérifié juste avant l'envoi ;
  facture PAID ou CANCELED entre-temps : étape SKIPPED.
- R4. Mode à blanc : calcule et trace sans envoyer, pendant un cycle ; l'interrupteur global
  coupe tout.
- R5. E-mail : numéro, montant TTC en FCFA entier, échéance, lien vers Facturation (lien de
  paiement B1 ensuite) ; textes `t()` fr, en, ar ; destinataires `agencyAdminRecipients`.
- R6. Règle D15 : une facture de dépassement impayée reçoit des relances mais n'a aucun effet sur
  l'abonnement. Règle D16 : les relances suivent la facture impayée la plus ancienne.
- R7. Le passage en lecture seule reste fixé par `graceDays` (Q-B2-3 option a).
- R8. Copie super-admin : résumé quotidien (Q-B2-4 option b), jamais pour l'espace PARTICULIER.
- R9. Suspension des relances par agence : motif obligatoire, auditée ; reprise possible.

**Modèle de données touché**

- Création : `DunningEvent` (`tenantId`, `invoiceId`, `step`, `channel`, `scheduledFor`,
  `sentAt`, `status` SENT, SKIPPED ou DRY_RUN, `error`), unique `(invoiceId, step, channel)` ;
  `DunningSettings` (ligne unique globale : interrupteur, mode à blanc, étapes JSON) ;
  champs nullables `dunningSuspendedAt` et `dunningSuspendedReason` sur `Subscription` (ou
  `metadata`, à trancher). Migration additive.
- Lecture : `Invoice`, `Subscription`, `PlatformPaymentCheckout`. Le journal est unique : E2 le
  réutilise au lieu de `DunningNotice`.
- `schema-tenant-coverage.test.ts` : `DunningEvent` porte `tenantId`, `DunningSettings` global
  comme `PlatformAiSettings`. `routes-inventory.test.ts` : routes admin ajoutées.

**API et écrans**

- `GET` et `PUT /api/admin/dunning-settings` (`PLATFORM_SUBSCRIPTIONS_EDIT`) ;
  `POST /api/admin/tenants/:tenantId/dunning/suspend` et `/resume` ; `GET` des événements par
  agence. Aucune route agence en V1. Textes API dans `i18n/index.ts`. Bandeau in-app et colonne
  « étape de relance » de la liste des abonnements : suite (V2 de la proposition).

**Critères d'acceptation**

1. Given l'interrupteur global coupé, When la tâche tourne, Then aucun événement ni envoi.
2. Given le mode à blanc, When la tâche tourne, Then des événements DRY_RUN existent et aucun
   e-mail ne part.
3. Given une étape due, When la tâche tourne deux fois, Then un seul envoi (unicité).
4. Given une facture payée entre deux passages, When l'étape arrive, Then SKIPPED.
5. Given un checkout `PENDING`, When l'étape arrive, Then pas d'envoi.
6. Given un abonnement gratuit, Then aucune relance.
7. Given une facture de dépassement impayée, When les relances passent, Then l'abonnement ne
   change pas de phase.
8. Given une agence suspendue sans motif, When le super-admin la suspend, Then refus ; avec
   motif, l'audit consigne l'acteur.
9. Given deux agences, When une relance part, Then seul le destinataire de l'agence concernée la
   reçoit.

**Tests**

- Unitaires : calcul des étapes, idempotence, éligibilité.
- Intégration : passage de tâche à blanc puis réel, relecture du montant et du statut.
- Isolation : destinataires et journal strictement filtrés par `tenantId`.

**Décisions préalables** : Q-B2-1 à Q-B2-5 ; unification du journal avec E2 (Q-E2-2) ; Q-B1-1
pour le canal du lien.

### 4.5 B5 — TVA et mentions légales des factures de plateforme (étapes 1 et 2)

**Objectifs**

- Empêcher l'émission d'une facture sans les mentions de l'émetteur en production.
- Corriger les textes du PDF (`t()`, accents) et imprimer conditions de paiement renseignées.
- Rendre les mentions et le taux de TVA paramétrables et audités, sans effet rétroactif.

**Hors périmètre**

- Toute règle fiscale non fournie par l'expert-comptable (TVA hors Côte d'Ivoire : Q-B5-3
  option c, comportement inchangé) ; facturation électronique imposée (aucun engagement) ;
  multi-devises ; rédaction des conditions de paiement par le code.

**Règles de gestion**

- R1. Étape 1 : un contrôle d'émission lit les mentions de l'émetteur (`platformIssuer()`,
  variables `PLATFORM_ISSUER_*`) et refuse l'émission en production tant que le jeu minimal est
  incomplet (Q-B5-1, Q-B5-2 option a), par une erreur typée. Hors production : avertissement.
- R2. Le refus intervient avant l'attribution du numéro `IMT-AAAA-NNNNN` (attribué à
  l'émission) : aucun trou de numérotation. Les brouillons restent possibles.
- R3. Le jeu minimal est celui de la liste validée par écrit par l'expert-comptable ; à défaut,
  l'existant (nom, RCCM, compte contribuable, TVA).
- R4. PDF : tous les textes passent par `t()` fr, en, ar ; accents corrigés (« Réglée le »,
  « Montant à régler ») ; conditions de paiement imprimées seulement si renseignées ; la
  facture arabe garde la version française comme référence ; un avoir mentionne « annule la
  facture n° … ».
- R5. Étape 2 : `PlatformBillingSettings` (ligne unique) porte identité de l'émetteur, RCCM,
  identifiant fiscal, adresse, contact, coordonnées de paiement, texte de conditions. Valeurs
  vides tolérées en base, jamais de valeur inventée ; repli sur les variables d'environnement
  tant que la base est vide.
- R6. Chaque modification est auditée (`recordAuditEvent(tx)`) et ne s'applique qu'aux
  factures à venir ; les factures émises gardent leur `issuerSnapshot`.
- R7. Taux de TVA : paramètre avec date d'effet, figé dans `Invoice.taxRate` ; sans version
  saisie, 18 % comme aujourd'hui (Q-B5-4). Aucune règle par pays.
- R8. La création de facture PLATFORM par la route historique est refusée (même implémentation
  que G1 R1, Q-B5-6).
- R9. La numérotation `IMT-AAAA-NNNNN` reste la seule série.

**Modèle de données touché**

- Étape 1 : aucun modèle. Étape 2 : `PlatformBillingSettings` (global, ligne unique, comme
  `PlatformAiSettings`) et, si Q-B5-4 option a, une table de versions de taux
  (`effectiveFrom`, taux ; nom et type de `taxRate` à confirmer). Migration additive.
- `Invoice` (`issuerSnapshot`, `taxRate`, `customerSnapshot`) en lecture ; classer les
  nouveaux modèles globaux dans `schema-tenant-coverage.test.ts` (`GLOBAL_MODELS`).
  `routes-inventory.test.ts` : routes admin ajoutées en étape 2.

**API et écrans**

- Étape 1 : aucun écran ; message d'erreur typé à l'émission ; test de PDF de référence.
- Étape 2 : `GET` et `PUT /api/admin/platform-billing-settings` (permission à confirmer, par
  exemple `PLATFORM_SUBSCRIPTIONS_EDIT`) ; écran super-admin « Mentions légales de la
  plateforme » avec état de complétude.

**Critères d'acceptation**

1. Given la production sans RCCM renseigné, When on émet une facture, Then refus typé et le
   compteur `IMT` n'avance pas.
2. Given un environnement hors production, When il manque une mention, Then l'émission passe avec
   un avertissement.
3. Given le jeu complet, When on émet, Then la facture sort et `issuerSnapshot` contient les
   mentions.
4. Given le PDF français, When on le génère, Then « Réglée le » et « Montant à régler » sont
   accentués et passent par `t()`.
5. Given un avoir, When on génère son PDF, Then il mentionne le numéro de la facture annulée.
6. Given une modification des mentions, When une facture déjà émise est relue, Then elle garde
   ses anciennes mentions.
7. Given un nouveau taux avec date d'effet future, When on émet avant cette date, Then le taux
   appliqué est l'ancien, figé dans la facture.
8. Given la route historique, When on crée une facture PLATFORM, Then refus.
9. Given un utilisateur d'agence, When il appelle les routes de paramétrage, Then refus.

**Tests**

- Unitaires : contrôle de complétude, choix du taux selon la date.
- Intégration : émission refusée ou acceptée, numéro non consommé, instantané figé, audit.
- PDF : test de référence fr et ar ; isolation : paramètres globaux inaccessibles aux agences.

**Décisions préalables** : Q-B5-1 à Q-B5-6 ; avis écrit de l'expert-comptable avant
activation de l'étape 2 ; coordination avec Q-G1-1.

## 5. Décisions métier à trancher

Questions pour le propriétaire, issues des fiches avec leurs identifiants ; aucune n'est
tranchée ici. « Reco » reprend la recommandation de la fiche. Vague = première vague bloquée.
Les montants, durées et seuils laissés « à fixer » dans les fiches restent à la charge du
propriétaire.

### Accès, rôles et libre-service

| ID     | Question                                                 | Options                                                                                                                                   | Reco et raison                                                                 | Bloque     | Vague |
| ------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------- | ----- |
| Q-A1-1 | Qui voit le simulateur ?                                 | a admin d'agence (`TENANT_SUBSCRIPTION_MANAGE`) ; b tout titulaire de `TENANT_SETTINGS_VIEW`                                              | a : montants sensibles ; `TENANT_SETTINGS_VIEW` ouvre aussi managers et agents | A1         | V1    |
| Q-A1-2 | Simulateur public pour prospects ?                       | a non ; b oui sans compte                                                                                                                 | a : le site a sa grille, un devis public double l'exposition des prix          | A1         | V1    |
| Q-A1-3 | Mise en route dans le devis d'un nouveau pack ?          | a ligne séparée ; b non                                                                                                                   | a : elle figure sur la première facture                                        | A1         | V1    |
| Q-A1-4 | Devis exportable en PDF ?                                | a non ; b PDF non contractuel                                                                                                             | a : un PDF touche aux mentions légales (B5)                                    | A1         | V1    |
| Q-A2-1 | Montée de pack : quand régler la différence ?            | a prochaine facture (actuel) ; b facture immédiate payable en ligne, effet au règlement                                                   | b : supprime l'accès sans paiement, mais rupture avec D7                       | A2, C1     | V2    |
| Q-A2-2 | Descente avec usage au-dessus de la capacité ?           | a refuser ; b autoriser, politique de quota                                                                                               | b avec avertissement : a bloque ceux qui veulent réduire                       | A2         | V2    |
| Q-A2-3 | Fréquence maximale de changements ?                      | a un par période ; b illimitée                                                                                                            | a : décourage le yo-yo                                                         | A2         | V2    |
| Q-A2-4 | Qui peut changer de pack ?                               | a `TENANT_ADMIN` ; b titulaire `TENANT_SETTINGS_EDIT`                                                                                     | a : comme la spec 045 AL-C1                                                    | A2, A3, C1 | V2    |
| Q-A2-5 | Rétrograder le palier Particulier payant ?               | a non ; b oui à l'échéance                                                                                                                | a : spec 026 la déclare hors périmètre                                         | A2         | V2    |
| Q-A3-1 | Ajout libre-service sans validation ImmoTopia ?          | a oui immédiat ; b demande puis validation                                                                                                | a pour offres vendables (prix du catalogue) ; b pour non vendables             | A3         | V2    |
| Q-A3-2 | Seuils des incitations ?                                 | a 80 % et 100 % ; b 100 % seulement                                                                                                       | a : seuil existant (`crossedThresholds`)                                       | A3         | V2    |
| Q-A3-3 | Lancer les blocs SMS ?                                   | a oui en lot séparé ; b non pour l'instant                                                                                                | b : nom d'expéditeur non approuvé ; taille et prix à fixer                     | A3, D3     | V3    |
| Q-A3-4 | Rôle autorisé à acheter ?                                | a `TENANT_ADMIN` ; b aussi comptable                                                                                                      | a                                                                              | A3, D3     | V2    |
| Q-A3-5 | Consommations : mois civil UTC ou période d'abonnement ? | a mois civil UTC ; b aligné sur la période                                                                                                | a : règle existante de la spec 044                                             | A3, D4     | V2    |
| Q-A4-1 | Numérotation du reçu ?                                   | a numéro de facture ; b série dédiée                                                                                                      | a pour V1 ; valeur légale à valider avec le comptable                          | A4         | V2    |
| Q-A4-2 | Qui voit historique et reçus ?                           | a `TENANT_SETTINGS_VIEW` (aussi managers, agents) ; b admin et comptable (nouvelle règle d'accès, le comptable n'atteint pas Facturation) | b : montants et auteurs sensibles                                              | A4         | V2    |
| Q-A4-3 | Afficher les actions du super-admin ?                    | a non ; b oui sans motif                                                                                                                  | a                                                                              | A4         | V2    |
| Q-A4-4 | Durée d'affichage de l'historique ?                      | a illimitée ; b limitée par la rétention d'audit                                                                                          | b : cohérence avec `audit-retention-service.ts`                                | A4         | V2    |

### Paiement, cycles et facturation

| ID     | Question                                               | Options                                                                                                                     | Reco et raison                                                     | Bloque | Vague |
| ------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------ | ----- |
| Q-B1-1 | Canal d'envoi du lien ?                                | a e-mail ; b e-mail et SMS ; c e-mail, SMS, WhatsApp                                                                        | a d'abord : SMS et WhatsApp non en service                         | B1, B2 | V2    |
| Q-B1-2 | Reconduction ?                                         | a aucune ; b rappel avec lien ; c prélèvement si l'agrégateur le permet ; d prélèvement bancaire spec 042 (P6 non planifié) | b : sans mandat ni capacité non vérifiée ; d à instruire plus tard | B1, B3 | V2    |
| Q-B1-3 | Déclaration manuelle de paiement ouverte aux agences ? | a oui avec validation super-admin ; b non                                                                                   | a : mode réel non validé                                           | B1     | V2    |
| Q-B1-4 | Validité du lien ?                                     | a jusqu'à échéance + grâce ; b durée fixe                                                                                   | a ; valeur exacte à fixer                                          | B1     | V2    |
| Q-B1-5 | Frais d'opérateur à la charge de qui ?                 | a ImmoTopia ; b ajoutés à l'agence                                                                                          | a tant que le tarif n'est pas décidé                               | B1     | V2    |
| Q-B3-1 | Ajouter le cycle trimestriel ?                         | a oui ; b non                                                                                                               | b en première livraison : alourdit le dépassement                  | B3     | V3    |
| Q-B3-2 | Remise annuelle ?                                      | a garder 11 mensualités ; b paramétrable                                                                                    | b : sortir d'une constante ; valeur par le propriétaire            | B3     | V1    |
| Q-B3-3 | Lancer l'échéancier d'une facture annuelle ?           | a oui sur demande ; b non                                                                                                   | b tant que les règlements partiels ne sont pas conçus              | B3, F2 | V3    |
| Q-B3-4 | Dépassement en trimestriel ?                           | a fenêtres mensuelles ; b avec la facture du trimestre                                                                      | a : réutilise la règle annuelle                                    | B3     | V3    |
| Q-B3-5 | Qui change le cycle ?                                  | a l'agence à l'échéance ; b super-admin seul                                                                                | a                                                                  | B3     | V3    |
| Q-B4-1 | Politique de remboursement du prorata ?                | a jamais (D7) ; b au cas par cas ; c automatique                                                                            | b : ne modifie pas D7, réversible                                  | B4, C1 | V2    |
| Q-B4-2 | Avoir partiel autorisé ?                               | a non ; b oui                                                                                                               | b après avoir tranché l'index « un avoir par facture »             | B4     | V2    |
| Q-B4-3 | Forme de la restitution ?                              | a crédit sur la facture suivante ; b remboursement                                                                          | a par défaut, b sur validation explicite                           | B4     | V2    |
| Q-B4-4 | Double validation au-delà d'un seuil ?                 | a non ; b oui, seuil à fixer                                                                                                | b                                                                  | B4     | V2    |
| Q-B4-5 | Délai maximal pour demander un avoir ?                 | a sans limite ; b délai fixé                                                                                                | b                                                                  | B4     | V2    |
| Q-D1-3 | Montant fixe supérieur à la facture : reporté ?        | a perdu ; b report en CREDIT                                                                                                | a : un report crée une dette difficile à auditer                   | D1     | V3    |
| Q-F2-1 | Forme de la facturation de groupe ?                    | a facture mère ; b factures par agence + relevé                                                                             | b : garde numérotation, avoirs, paiements                          | F2     | V3    |
| Q-F2-2 | Impayé du groupe ?                                     | a aucune coupure automatique ; b grâce commune                                                                              | a : comme D15                                                      | F2     | V3    |
| Q-F2-3 | Le responsable de groupe est-il admin des agences ?    | a non ; b oui                                                                                                               | a                                                                  | F2     | V3    |
| Q-F2-4 | Remise de groupe ?                                     | a aucune ; b fixée par le propriétaire                                                                                      | a en V1                                                            | F2     | V3    |
| Q-F2-5 | Périodes alignées ?                                    | a ancre commune ; b périodes propres                                                                                        | b en V1                                                            | F2     | V3    |

### Relances et créances

| ID     | Question                              | Options                                                 | Reco et raison                                   | Bloque | Vague |
| ------ | ------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ | ------ | ----- |
| Q-B2-1 | Calendrier des relances ?             | a trois étapes ; b cinq ou plus                         | a : délai total court ; décalages à fixer        | B2, E2 | V1    |
| Q-B2-2 | Canaux ?                              | a e-mail ; b e-mail et SMS                              | a d'abord (SMS non en service)                   | B2     | V1    |
| Q-B2-3 | Lecture seule fixée par `graceDays` ? | a oui ; b délai distinct                                | a : ne change pas D8                             | B2     | V1    |
| Q-B2-4 | Copie super-admin de chaque relance ? | a oui ; b résumé quotidien                              | b                                                | B2     | V1    |
| Q-B2-5 | Frais de retard ?                     | a non ; b oui                                           | a tant que le texte contractuel n'est pas validé | B2, B5 | V1    |
| Q-E2-1 | Tranches d'âge ?                      | a 0-7, 8-30, 31-60, 61-90, plus de 90 ; b autres bornes | a comme point de départ                          | E2     | V3    |
| Q-E2-2 | Relance depuis les créances ?         | a manuelle et journalisée ; b automatique               | a tant que les modèles ne sont pas validés       | E2, B2 | V3    |
| Q-E2-3 | Montants en vue ?                     | a TTC ; b HT                                            | a pour créances, HT pour le MRR                  | E2     | V3    |
| Q-E2-4 | Canal de relance ?                    | a e-mail ; b e-mail et WhatsApp                         | a (WhatsApp Meta non en service)                 | E2     | V3    |
| Q-E2-5 | Lien avec la lecture seule manuelle ? | a raccourci ; b suggestion automatique                  | a : la coupure reste un acte humain              | E2     | V3    |

### Mentions légales, TVA et conformité

| ID     | Question                                                  | Options                                          | Reco et raison                                                | Bloque | Vague |
| ------ | --------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- | ------ | ----- |
| Q-B5-1 | Jeu de mentions obligatoires ?                            | a existant ; b liste du comptable                | b ; liste à valider avec le comptable                         | B5     | V1    |
| Q-B5-2 | Bloquer l'émission sans mentions en production ?          | a oui ; b alerte seule                           | a : une facture sans identifiant fiscal est un risque certain | B5     | V1    |
| Q-B5-3 | TVA hors Côte d'Ivoire ?                                  | a même taux ; b exonération ou autre ; c reporté | c : attendre l'avis du comptable                              | B5     | V1    |
| Q-B5-4 | Taux de TVA paramétrable avec date d'effet ?              | a oui ; b constante                              | a ; valeur confirmée par le comptable                         | B5     | V1    |
| Q-B5-5 | Texte de pénalités et conditions ?                        | a fourni par le propriétaire ; b absent          | a ; validé par comptable ou juriste                           | B5     | V1    |
| Q-B5-6 | Désactiver la création PLATFORM par la route historique ? | a oui ; b non                                    | a (même implémentation que Q-G1-1)                            | B5, G1 | V1    |

### Résiliation, pause et essais

| ID     | Question                                      | Options                                                    | Reco et raison                                  | Bloque | Vague |
| ------ | --------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- | ------ | ----- |
| Q-C1-1 | Qui peut résilier ?                           | a `TENANT_ADMIN` ; b admin et comptable                    | a                                               | C1     | V2    |
| Q-C1-2 | Date d'effet ?                                | a fin de période payée ; b immédiate                       | a : respecte D7, aucun remboursement            | C1, B4 | V2    |
| Q-C1-3 | Conservation des données après la fin ?       | a durée fixée ; b indéfinie                                | a ; valeur à valider par un juriste             | C1     | V2    |
| Q-C1-4 | Offres de rétention ?                         | a pause seule ; b pause, rétrogradation, remise ; c aucune | a d'abord : la remise engage un prix            | C1, C2 | V2    |
| Q-C1-5 | Export avant résiliation ?                    | a facultatif ; b obligatoire                               | a                                               | C1     | V2    |
| Q-C1-6 | Réactivation après la fin ?                   | a libre-service dans un délai ; b via ImmoTopia            | b en première livraison                         | C1     | V2    |
| Q-C2-1 | Durée max et nombre de pauses par an ?        | a valeurs fixées ; b illimité                              | a                                               | C2     | V3    |
| Q-C2-2 | Tarif pendant la pause ?                      | a gratuit ; b forfait ; c pourcentage                      | b ou c ; montant à fixer, aucun chiffre proposé | C2     | V3    |
| Q-C2-3 | Accès pendant la pause ?                      | a lecture seule et export ; b fermé sauf export            | a : cohérence avec la lecture seule             | C2     | V3    |
| Q-C2-4 | Abonnements annuels éligibles ?               | a oui avec report ; b non                                  | b en première livraison                         | C2     | V3    |
| Q-C2-5 | Reprise ?                                     | a automatique avec rappel ; b manuelle                     | a                                               | C2     | V3    |
| Q-C2-6 | Pause proposée comme rétention dans C1 ?      | a oui ; b non                                              | a                                               | C2, C1 | V3    |
| Q-D5-1 | Issue par défaut d'un essai d'élément ?       | a retour ; b conversion                                    | a : réversible, rien facturé sans acte          | D5     | V3    |
| Q-D5-2 | Durée maximale d'un essai d'élément ?         | a valeur unique ; b par offre                              | a ; valeur à fixer                              | D5     | V3    |
| Q-D5-3 | Offres éligibles ?                            | a packs et modules ; b aussi extensions                    | a en V1                                         | D5     | V3    |
| Q-D5-4 | Qui déclenche l'essai ?                       | a super-admin ; b agence aussi                             | a tant qu'il n'y a pas d'achat libre-service    | D5     | V3    |
| Q-D5-5 | Essai pour l'abonnement gratuit Particulier ? | a oui ; b non                                              | b : palier déjà sans limite de durée            | D5     | V3    |

### Remises, parrainage, paliers et crédits

| ID     | Question                                            | Options                                                        | Reco et raison                                     | Bloque        | Vague |
| ------ | --------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------- | ------------- | ----- |
| Q-D1-1 | Code cumulable avec la remise de combinaison 10 % ? | a cumulable ; b exclusif, la meilleure                         | b : plancher de prix garantissable                 | D1            | V3    |
| Q-D1-2 | Annuel : remise en % sur les 11 mensualités ?       | a oui ; b première période                                     | a : c'est le montant facturé                       | D1            | V3    |
| Q-D1-4 | Qui saisit un code ?                                | a super-admin ; b agence aussi                                 | a : pas d'achat libre-service                      | D1            | V3    |
| Q-D1-5 | Plafond de remise totale ?                          | a 100 % toléré ; b plafond fixé (lié à F1)                     | b                                                  | D1, F1        | V3    |
| Q-D2-1 | Nature de la récompense ?                           | a crédit fixe ; b % de la première facture ; c période offerte | a : prévisible, une ligne CREDIT                   | D2            | V3    |
| Q-D2-2 | Qui est récompensé ?                                | a parrain ; b parrain et filleul                               | b : incitation du filleul                          | D2, D1        | V3    |
| Q-D2-3 | Déclencheur ?                                       | a premier règlement ; b règlement plus délai                   | b : évite les remboursements rapides               | D2            | V3    |
| Q-D2-4 | Plafond par parrain et par an ?                     | a en nombre ; b en montant ; c aucun                           | a : simple à expliquer                             | D2            | V3    |
| Q-D2-5 | Parrainage pour l'espace Particulier payant ?       | a oui ; b agences seulement                                    | b en V1                                            | D2            | V3    |
| Q-D3-1 | Unités en V1 ?                                      | a IA seule ; b IA et signatures ; c les quatre                 | b : SMS non en service, signature a un quota dur   | D3            | V3    |
| Q-D3-2 | Modèle de données ?                                 | a généralisé d'emblée ; b IA puis généralisation               | a : ne pas migrer un solde monétaire en production | D3 (spec 028) | V3    |
| Q-D3-3 | Ordre de consommation ?                             | a inclus puis prépayé ; b l'inverse                            | a : préserve la valeur du prépayé                  | D3            | V3    |
| Q-D3-4 | Durée de validité ?                                 | a 12 mois pour toutes ; b par unité                            | a : alignée sur la spec 028                        | D3            | V3    |
| Q-D3-5 | Recharge pendant l'essai ?                          | a permise ; b interdite                                        | a : payée d'avance                                 | D3            | V3    |
| Q-D4-1 | Composition des paliers ?                           | a « contient au moins » le pack ; b par pack ; c statu quo     | a : règle le cas Agence + Syndic                   | D4            | V3    |
| Q-D4-2 | Capacités concernées en V1 ?                        | a lots ; b lots et copro, chantiers, biens                     | a                                                  | D4            | V3    |
| Q-D4-3 | Tarifer l'excédent de signatures et photos ?        | a non ; b oui opt-in                                           | b, avec réouverture de SG-R12 (spec 044)           | D4            | V3    |
| Q-D4-4 | Plafond mensuel de facture d'excédent ?             | a aucun ; b par agence                                         | b                                                  | D4            | V3    |
| Q-D4-5 | Fenêtre de comptage annuelle des consommations ?    | a mois calendaire UTC ; b ancré sur la période                 | a : compteur de quota calendaire                   | D4            | V3    |

### Pilotage et catalogue

| ID     | Question                                       | Options                                                                        | Reco et raison                        | Bloque     | Vague |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- | ---------- | ----- |
| Q-E1-1 | MRR d'un abonnement annuel ?                   | a annuel divisé par 12 ; b tarif mensuel plein                                 | a : reflète l'encaissé                | E1         | V1    |
| Q-E1-2 | Définition du churn ?                          | a résiliation effective ; b aussi lecture seule non régularisée                | a puis b en indicateur séparé         | E1         | V1    |
| Q-E1-3 | Dépassement dans le MRR ?                      | a exclu, à part ; b inclus                                                     | a : variable                          | E1         | V1    |
| Q-E1-4 | Particulier payant inclus ?                    | a segment distinct ; b exclu                                                   | a                                     | E1         | V1    |
| Q-E1-5 | Cohorte par création ou premier paiement ?     | a création ; b premier paiement                                                | b : l'essai gonfle a                  | E1 (V2)    | V3    |
| Q-E3-1 | Comportement par défaut d'une hausse de prix ? | a figé à vie ; b figé jusqu'au renouvellement annuel ; c migration sur préavis | a : comportement actuel, aucun litige | E3, D4, F3 | V3    |
| Q-E3-2 | Préavis minimal avant migration ?              | a valeur fixée ; b par type de contrat                                         | a après avis du juriste               | E3         | V3    |
| Q-E3-3 | Qui approuve un changement de catalogue ?      | a un super-admin ; b deux personnes (F1)                                       | b pour les hausses                    | E3, F1     | V3    |
| Q-E3-4 | Versionnement complet ou journal d'abord ?     | a journal et validations ; b versionnement d'emblée                            | a                                     | E3         | V1    |
| Q-E3-5 | Seed sans `--missing-only` en production ?     | a possible ; b refusé, service audité                                          | b                                     | E3         | V1    |

### Gouvernance, contrats et partenaires

| ID     | Question                                             | Options                                                                                                               | Reco et raison                             | Bloque     | Vague |
| ------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------- | ----- |
| Q-F1-1 | Seuils sans approbation ?                            | a valeurs par type d'action ; b tout soumis                                                                           | a : n'alourdit pas les gestes courants     | F1, D1     | V3    |
| Q-F1-2 | Nombre d'approbateurs ?                              | a au moins deux comptes ; b un compte, mode solo                                                                      | a dès que possible, b en attendant         | F1, D3, G1 | V3    |
| Q-F1-3 | Mode solo autorisé ?                                 | a oui, tracé ; b non                                                                                                  | a en transition                            | F1         | V3    |
| Q-F1-4 | Périmètre de V1 ?                                    | a dérogations ; b dérogations + crédits et récompenses au-delà d'un seuil ; c aussi remises et prix ; d aussi modules | b en V1 (D2, D3 en dépendent), puis c      | F1, D1, D2 | V3    |
| Q-F1-5 | Délai avant expiration d'une demande ?               | a valeur fixée ; b sans expiration                                                                                    | a                                          | F1         | V3    |
| Q-F3-1 | Effet d'un engagement sur la résiliation ?           | a information ; b avertissement et solde ; c blocage                                                                  | a en V1 : aucune règle juridique codée     | F3, C1     | V3    |
| Q-F3-2 | Modèle contractuel ?                                 | a modèle du juriste ; b texte libre                                                                                   | a                                          | F3         | V3    |
| Q-F3-3 | Signature du contrat ?                               | a intégrée (spec 044) ; b hors plateforme                                                                             | b en V1                                    | F3         | V3    |
| Q-F3-4 | Pénalité de sortie facturée ?                        | a non ; b ligne dédiée                                                                                                | a en V1                                    | F3         | V3    |
| Q-F3-5 | Reconduction tacite admise par le droit applicable ? | a oui ; b expresse seulement                                                                                          | à trancher par le juriste ; b par prudence | F3         | V3    |
| Q-F4-1 | Modèle partenaire ?                                  | a apporteur avec commission ; b revendeur ; c les deux                                                                | a : ImmoTopia garde la facturation         | F4         | V3    |
| Q-F4-2 | Base et durée de la commission ?                     | a premières périodes ; b tant que l'agence paie                                                                       | à fixer ; a par prudence                   | F4         | V3    |
| Q-F4-3 | Marque blanche ou co-marque ?                        | a co-marque ; b blanche                                                                                               | a                                          | F4         | V3    |
| Q-F4-4 | Le partenaire voit les factures de ses agences ?     | a lecture ; b impayés seulement                                                                                       | b en V1                                    | F4         | V3    |
| Q-F4-5 | Qui assure le support ?                              | a partenaire ; b ImmoTopia                                                                                            | b en V1                                    | F4         | V3    |

### Fiabilité et calendrier

| ID     | Question                          | Options                                                                             | Reco et raison                                               | Bloque     | Vague |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------- | ----- |
| Q-G1-1 | Routes héritées de facture ?      | a refus sur PLATFORM ; b suppression ; c statu quo                                  | a : ferme le contournement sans casser RENTAL                | G1, B5     | V1    |
| Q-G1-2 | Fréquence du contrôle ?           | a quotidienne ; b horaire                                                           | a                                                            | G1         | V1    |
| Q-G1-3 | Règles de V1 ?                    | a RC1 à RC6 ; b toutes                                                              | a puis étendre                                               | G1         | V1    |
| Q-G1-4 | Destinataires de l'alerte ?       | a tous les super-admins ; b un rôle finance                                         | a en attendant F1                                            | G1         | V1    |
| Q-G1-5 | Profondeur du premier balayage ?  | a 12 mois ; b tout l'historique                                                     | a                                                            | G1         | V1    |
| Q-G2-1 | Règle de fin de mois ?            | a jour d'ancre avec repli au dernier jour ; b statu quo ; c premier du mois suivant | a : date stable pour le client ; correction à traiter à part | G2, B3, C2 | V1    |
| Q-G2-2 | Qui valide les attendus ?         | a propriétaire ; b comptable pour TVA et arrondi                                    | a puis b pour la TVA                                         | G2         | V1    |
| Q-G2-3 | Arrondi du prorata ?              | a au plus proche ; b à l'inférieur                                                  | a conservé                                                   | G2, A1     | V1    |
| Q-G2-4 | Parité sur base bloquante en CI ? | a bloquante ; b non bloquante                                                       | b au départ, comme `test-isolation`                          | G2         | V1    |
| Q-G2-5 | Catalogue de test ?               | a copie figée datée ; b catalogue vivant                                            | a                                                            | G2         | V1    |

### Questions sans fiche porteuse (ajoutées par cette synthèse, à ouvrir ou écarter)

| ID      | Question                                                                                                                | Options                                                                                                                                                         | Reco et raison                                                                                           | Bloque     | Vague |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------- | ----- |
| Q-NEW-1 | Faut-il émettre la facture de période avant l'échéance pour éviter le passage `PAST_DUE` à chaque renouvellement (T3) ? | a oui, à J-N ; b non, atténuer par B1 et B2                                                                                                                     | à analyser : T3 est déduit du code, non rejoué ; rejouer d'abord                                         | B2, B1, A2 | V1    |
| Q-NEW-2 | Le dépassement doit-il être tarifé au prix figé plutôt qu'au catalogue courant (T13) ?                                  | a oui ; b non, documenter                                                                                                                                       | a : cohérence avec « le catalogue ne change aucun abonnement » ; non tranché                             | E3, D4, G2 | V1    |
| Q-NEW-3 | Quel empilement pour le quota Signatures ?                                                                              | a quota inclus + blocs `EXT_SIGNATURES_SUPPLEMENTAIRES`, puis crédits prépayés, puis surcoût facturé ou refus ; b crédits avant les blocs ; c un seul mécanisme | a : le bloc fixe reste le premier levier, le prépayé couvre l'imprévu, le surcoût en dernier ; à valider | A3, D3, D4 | V2    |

### Les 8 décisions qui débloquent le plus

1. Q-G1-1 (et Q-B5-6) : refuser les routes héritées sur les factures PLATFORM ; ouvre G1 et B5.
2. Q-G2-1 : règle de fin de mois ; débloque la correction de `addBillingPeriod`, B3 et C2.
3. Q-B5-1 et Q-B5-2 : jeu minimal de mentions et blocage de l'émission ; avis du comptable requis.
4. Q-B2-1 et Q-B2-3 : calendrier de relances et lien avec `graceDays` ; ouvre B2, E2 et B1.
5. Q-A2-4, Q-A3-1 et Q-A3-4 : qui peut modifier et acheter sans validation ; permission
   `TENANT_SUBSCRIPTION_MANAGE` ; ouvre A2, A3, C1 et D3.
6. Q-A2-1 : régler la montée de pack à la facture suivante ou tout de suite ; rupture éventuelle
   avec D7 ; conditionne A2 et la rétention de C1.
7. Q-B1-2 (avec la validation du mode réel PaySecureHub, hors lot) : reconduction ; ouvre B1 et
   l'échéancier de B3.
8. Q-B4-1 (avec Q-C1-2) : politique de remboursement du prorata ; ouvre B4 et C1 sans toucher D7.

Viennent ensuite : Q-F1-2 (nombre d'approbateurs, ouvre F1 puis D1, D3), Q-D3-2 (portefeuille
généralisé avant la spec 028), Q-NEW-3 (empilement du quota Signatures : blocs, crédits prépayés,
surcoût facturé ; ouvre A3, D3 et D4) et Q-E3-1 (comportement d'une hausse de prix).
