# Lot 9 — Gestion des ventes immobilières

**Date : 23 septembre 2026.** Branche `feat/gestion-locative-lot-1`.
Rédigé sans atelier avec la cliente, sur instruction de Baba (« prends le lead ») ;
les choix marqués **[D]** sont des décisions par défaut, à confirmer.

## 1. Le besoin

Aujourd'hui ImmoTopia suit une vente jusqu'à l'affaire CRM « gagnée » (`CrmDeal`,
type `VENTE`/`ACHAT`, étape `WON`) et rien après : pas de mandat de vente, pas
d'offre d'achat, pas de compromis, pas de suivi de l'acte, pas de commission de
transaction. ChezvousBO propose offres, compromis et commissions (voir
`docs/ImmoTopia_fonctionnalites_concurrentes_a_verifier.md`).

Le lot 9 couvre la chaîne complète d'une vente où l'agence est **intermédiaire** :

```text
Mandat de vente ──► Offres d'achat ──► Compromis ──► Acte authentique ──► Commission
 (vendeur, prix,     (acquéreur, prix,   (prix, conditions   (vente conclue,     (facturée,
  honoraires)         contre-offre)       suspensives,        bien vendu)          encaissée,
                                          échéancier)                               comptabilisée)
```

## 2. Principes

- **P1 — Le vendeur est un `TenantClient`** (décision du 22/09 : identité unique du
  propriétaire). Un bien en indivision (`PropertyOwnershipShare`) liste ses
  indivisaires comme co-vendeurs, en lecture ; le mandat désigne un signataire.
- **P2 — L'acquéreur est un `CrmContact`** : un prospect n'a ni compte ni
  `TenantClient`. L'offre peut se rattacher à l'affaire CRM d'où elle vient.
- **P3 — L'agence ne détient aucun fonds de la vente [D].** Le prix et le dépôt de
  l'acquéreur transitent par le notaire (ou le vendeur). ImmoTopia suit l'échéancier
  sans écriture. Seule la **commission** de l'agence entre en comptabilité. Détenir
  un séquestre imposerait le 4731 et un auxiliaire par acquéreur : hors lot.
- **P4 — La commission naît à la signature de l'acte [D]**, pas au compromis :
  c'est la pratique usuelle, un compromis peut encore tomber.
- **P5 — Comptabilisation à l'encaissement [D]**, comme la gestion locative (lot 10) :
  la TVA des prestations de services est exigible à l'encaissement. Chaque
  règlement de commission passe
  `Débit trésorerie réelle / Crédit 70612 (HT) + 4432 (TVA)`. Aucune créance 411 n'est constatée à la facturation — point à faire
  valider par le cabinet (question ajoutée au document des questions).
- **P6 — Rien ne s'efface.** Mandat révoqué, offre retirée, compromis annulé,
  règlement annulé : un statut, un motif, une date, un auteur. L'annulation d'un
  règlement contre-passe son écriture (`reverseDocumentEntryTx`).
- **P7 — Le statut du bien suit la vente** et passe par l'historique
  (`PropertyStatusHistory`, service `property-status-service.ts`) :
  offre acceptée → `RESERVED`, compromis signé → `UNDER_OFFER`, acte signé → `SOLD`,
  compromis annulé ou offre acceptée retirée → retour à `AVAILABLE`.
- **P8 — Pas de nouvelle permission [D].** Mandats, offres, compromis :
  `CRM_DEALS_VIEW` (lecture) et `CRM_DEALS_EDIT` (écriture). Encaisser une
  commission : `FINANCE_DOCUMENTS_CREATE` ; annuler un règlement :
  `FINANCE_DOCUMENTS_VALIDATE` ; lister les commissions : `FINANCE_ACCOUNTS_READ`
  ou `CRM_DEALS_VIEW`.

## 3. Modèle de données (migration additive)

Numérotation annuelle par agence, comme `REV-AAAA-NNNN` : colonnes `year` + `sequence`,
unique `(tenantId, year, sequence)`.

### `SaleMandate` — `sale_mandates`, référence `MV-AAAA-NNNN`

| Champ                                      | Type                                                   | Règle                                              |
| ------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------- |
| propertyId                                 | FK Property                                            | un seul mandat `ACTIVE` par bien et par agence     |
| sellerClientId                             | FK TenantClient                                        | signataire côté vendeur                            |
| mandateType                                | `SaleMandateType` : `SIMPLE`, `EXCLUSIVE`              |                                                    |
| askingPrice                                | Decimal(14,2)                                          | > 0                                                |
| minimumPrice                               | Decimal?                                               | prix plancher confidentiel, ≤ askingPrice          |
| commissionMode                             | `SaleCommissionMode` : `PERCENT`, `FIXED`              |                                                    |
| commissionRate                             | Decimal(7,4)?                                          | requis en PERCENT, 0 < x ≤ 20                      |
| commissionFixedAmount                      | Decimal?                                               | requis en FIXED                                    |
| commissionPayer                            | `SaleCommissionPayer` : `SELLER`, `BUYER`              |                                                    |
| agentUserId                                | FK User?                                               | négociateur                                        |
| agentSharePercent                          | Decimal(7,4)?                                          | part du négociateur sur la commission HT encaissée |
| startDate / endDate                        | Date / Date?                                           | endDate ≥ startDate                                |
| status                                     | `SaleMandateStatus` : `ACTIVE`, `REVOKED`, `COMPLETED` | expiration **calculée** (`isExpired`), pas stockée |
| revokedAt / revokedByUserId / revokeReason |                                                        |                                                    |
| notes                                      | Text?                                                  |                                                    |

### `SaleOffer` — `sale_offers`, référence `OA-AAAA-NNNN`

| Champ                                        | Type                                                                              | Règle                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| mandateId                                    | FK SaleMandate                                                                    | mandat `ACTIVE` à la création                  |
| buyerContactId                               | FK CrmContact                                                                     |                                                |
| dealId                                       | FK CrmDeal?                                                                       | affaire d'origine                              |
| amount                                       | Decimal(14,2)                                                                     | > 0                                            |
| financing                                    | `SaleFinancing` : `CASH`, `LOAN`, `MIXED`                                         |                                                |
| conditions                                   | Text?                                                                             |                                                |
| validUntil                                   | Date?                                                                             | expiration calculée (`isExpired`)              |
| status                                       | `SaleOfferStatus` : `SUBMITTED`, `COUNTERED`, `ACCEPTED`, `REJECTED`, `WITHDRAWN` |                                                |
| counterAmount                                | Decimal?                                                                          | posé par `COUNTERED` (contre-offre du vendeur) |
| decidedAt / decidedByUserId / decisionReason |                                                                                   |                                                |

Transitions : `SUBMITTED|COUNTERED → COUNTERED|ACCEPTED|REJECTED|WITHDRAWN`.
Une offre `ACCEPTED` d'un contre-offre retient `counterAmount` comme prix convenu.
**Une seule offre `ACCEPTED` vivante par mandat** (une offre acceptée dont le compromis
est annulé ne compte plus). Accepter → bien `RESERVED`.
Retirer (`WITHDRAWN`) une offre acceptée n'est possible que sans compromis signé ;
le bien revient à `AVAILABLE`.

### `SaleAgreement` — `sale_agreements`, référence `CV-AAAA-NNNN`

| Champ                                          | Type                                                                | Règle                                           |
| ---------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| offerId                                        | FK SaleOffer, **unique**                                            | offre `ACCEPTED`                                |
| mandateId, propertyId                          | FK                                                                  | recopiés pour les requêtes                      |
| price                                          | Decimal(14,2)                                                       | prix convenu (défaut : counterAmount ?? amount) |
| depositAmount                                  | Decimal?                                                            | dépôt de l'acquéreur                            |
| depositHolder                                  | `SaleDepositHolder` : `NOTARY`, `SELLER`                            | P3 : jamais l'agence                            |
| notaryName                                     | String?                                                             |                                                 |
| signedAt                                       | Date?                                                               | posé par `SIGNED`                               |
| expectedDeedDate                               | Date?                                                               |                                                 |
| deedDate                                       | Date?                                                               | posé par `COMPLETED`                            |
| status                                         | `SaleAgreementStatus` : `DRAFT`, `SIGNED`, `COMPLETED`, `CANCELLED` |                                                 |
| cancelledAt / cancelReason / cancelledByUserId |                                                                     |                                                 |

Transitions :

- `DRAFT → SIGNED` (signedAt requis) → bien `UNDER_OFFER`.
- `SIGNED → COMPLETED` (deedDate requis ; **toutes les conditions** `MET` ou `WAIVED`) →
  bien `SOLD`, mandat `COMPLETED`, affaire CRM liée `WON`, **commission créée**.
- `DRAFT|SIGNED → CANCELLED` (motif requis) → bien `AVAILABLE`.
- `COMPLETED` est définitif.

### `SaleAgreementCondition` — conditions suspensives

`label`, `dueDate?`, `status` : `PENDING`, `MET`, `FAILED`, `WAIVED`, `resolvedAt?`.
Une condition `FAILED` n'annule pas seule le compromis : l'agent décide.

### `SalePaymentMilestone` — échéancier de l'acquéreur (suivi, sans écriture)

`label`, `dueDate?`, `amount`, `paidAt?`, `sortOrder`. Somme des montants ≤ prix
(avertissement côté écran, pas de refus : un échéancier peut être en cours de saisie).

### `SaleCommission` — `sale_commissions`, référence `HT-AAAA-NNNN`

Créée automatiquement au passage `COMPLETED`, unique par compromis.

| Champ                           | Règle                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| agreementId (unique), mandateId |                                                                                                             |
| payer                           | recopié du mandat                                                                                           |
| baseAmount                      | prix de vente                                                                                               |
| amountExclTax                   | PERCENT : prix × taux / 100 ; FIXED : forfait. Arrondi à l'unité (FCFA)                                     |
| vatRate                         | taux des paramètres financiers si `vatRegistered`, sinon 0 — **figé**                                       |
| vatAmount, amountInclTax        |                                                                                                             |
| agentUserId, agentSharePercent  | **figés** depuis le mandat                                                                                  |
| status                          | `DUE`, `PARTIALLY_PAID`, `PAID`, `CANCELLED` — `paidAmount` **calculé** à partir des règlements non annulés |
| issuedAt                        | = deedDate                                                                                                  |

### `SaleCommissionPayment` — référence `RC-AAAA-NNNN`

`commissionId`, `amount` (> 0, ≤ reste dû TTC), `paidAt`, `paymentMethod`
(mêmes valeurs que les paiements locatifs), `treasuryAccountId`, `reference?`,
`status` : `POSTED`, `VOIDED`, `voidReason`, `voidedAt`, `voidedByUserId`, `createdByUserId`.

Écriture (journal selon la nature du compte de trésorerie, `journalForKind`,
`documentType: 'SALE_COMMISSION_PAYMENT'`, ajouté à `SOURCE_TYPE_BY_DOCUMENT`) :

| Compte                                                 | Débit   | Crédit             |
| ------------------------------------------------------ | ------- | ------------------ |
| trésorerie réelle (`treasuryAccount.chartOfAccountId`) | montant |                    |
| `70612` Honoraires de transaction                      |         | montant × HT / TTC |
| `4432` TVA facturée (si TVA > 0)                       |         | montant − part HT  |

La part HT est arrondie à l'unité ; la TVA prend le reste (l'écriture tombe juste).
`70612` est une constante `DEFAULT_SALE_COMMISSION_ACCOUNT` [D], distincte du compte
des honoraires de gestion ; le 4432 est celui des paramètres financiers.

## 4. API

Préfixe `/api/tenants/:tenantId/sales`. Réponses JSON en DTO plats : montants en
`number`, dates en chaîne ISO, noms résolus (`propertyLabel`, `sellerName`,
`buyerName`, `agentName`). Erreurs typées de `middleware/error-middleware`.

| Méthode | Chemin                                  | Permission                              | Rôle                                                                                                                    |
| ------- | --------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| GET     | `/mandates?status=&propertyId=&search=` | CRM_DEALS_VIEW                          | liste `SaleMandateDto[]`                                                                                                |
| POST    | `/mandates`                             | CRM_DEALS_EDIT                          | créer                                                                                                                   |
| GET     | `/mandates/:id`                         | CRM_DEALS_VIEW                          | `SaleMandateDetailDto` (mandat + offres + compromis + commission + co-vendeurs)                                         |
| PATCH   | `/mandates/:id`                         | CRM_DEALS_EDIT                          | modifier (prix, dates, honoraires, négociateur, notes) tant que `ACTIVE` et sans compromis signé                        |
| POST    | `/mandates/:id/revoke`                  | CRM_DEALS_EDIT                          | `{ reason }` ; refusé si compromis `SIGNED`                                                                             |
| POST    | `/mandates/:id/offers`                  | CRM_DEALS_EDIT                          | créer une offre                                                                                                         |
| POST    | `/offers/:id/decision`                  | CRM_DEALS_EDIT                          | `{ action: 'COUNTER'                                                                                                    | 'ACCEPT' | 'REJECT' | 'WITHDRAW', counterAmount?, reason? }` |
| POST    | `/offers/:id/agreement`                 | CRM_DEALS_EDIT                          | créer le compromis `DRAFT`                                                                                              |
| GET     | `/agreements?status=`                   | CRM_DEALS_VIEW                          | liste `SaleAgreementDto[]`                                                                                              |
| GET     | `/agreements/:id`                       | CRM_DEALS_VIEW                          | `SaleAgreementDetailDto` (conditions, échéancier, commission)                                                           |
| PATCH   | `/agreements/:id`                       | CRM_DEALS_EDIT                          | prix, dépôt, notaire, dates prévues (hors `COMPLETED`/`CANCELLED`)                                                      |
| POST    | `/agreements/:id/sign`                  | CRM_DEALS_EDIT                          | `{ signedAt }`                                                                                                          |
| POST    | `/agreements/:id/complete`              | CRM_DEALS_EDIT                          | `{ deedDate }`                                                                                                          |
| POST    | `/agreements/:id/cancel`                | CRM_DEALS_EDIT                          | `{ reason }`                                                                                                            |
| POST    | `/agreements/:id/conditions`            | CRM_DEALS_EDIT                          | ajouter                                                                                                                 |
| PATCH   | `/conditions/:id`                       | CRM_DEALS_EDIT                          | libellé, échéance, statut                                                                                               |
| DELETE  | `/conditions/:id`                       | CRM_DEALS_EDIT                          | seulement en `DRAFT`                                                                                                    |
| PUT     | `/agreements/:id/milestones`            | CRM_DEALS_EDIT                          | remplace l'échéancier (liste complète)                                                                                  |
| GET     | `/commissions?status=`                  | FINANCE_ACCOUNTS_READ ou CRM_DEALS_VIEW | liste `SaleCommissionDto[]` avec totaux                                                                                 |
| GET     | `/commissions/:id`                      | idem                                    | détail + règlements                                                                                                     |
| POST    | `/commissions/:id/payments`             | FINANCE_DOCUMENTS_CREATE                | encaisser                                                                                                               |
| POST    | `/commission-payments/:id/void`         | FINANCE_DOCUMENTS_VALIDATE              | `{ reason }`                                                                                                            |
| GET     | `/pipeline`                             | CRM_DEALS_VIEW                          | compteurs et valeurs : mandats actifs, offres ouvertes, compromis signés, ventes du mois, commissions dues / encaissées |

Contrat des DTO : `packages/api/src/lib/sales/types.ts` fait foi ; le frontend les
recopie dans `apps/web/src/services/sales-service.ts`.

## 5. Écrans

Menu **Ventes** (module `MODULE_AGENCY`), entre CRM et Gestion locative, pages en
`React.lazy` :

1. **Tableau des ventes** `/tenant/:tenantId/sales` — les compteurs de `/pipeline`,
   puis les mandats actifs (bien, vendeur, prix demandé, type, échéance, nombre
   d'offres, statut).
2. **Mandats** `/tenant/:tenantId/sales/mandates` — liste filtrable, bouton « Nouveau
   mandat » (sélecteurs cherchables : bien, vendeur, négociateur).
3. **Fiche mandat** `/tenant/:tenantId/sales/mandates/:id` — en-tête (prix, honoraires,
   dates, co-vendeurs), onglets Offres (saisie, contre-offre, accepter, refuser,
   retirer), Compromis (création depuis l'offre acceptée), Historique.
4. **Fiche compromis** `/tenant/:tenantId/sales/agreements/:id` — étapes
   (brouillon → signé → acte), conditions suspensives, échéancier de l'acquéreur,
   bloc commission.
5. **Commissions de vente** `/tenant/:tenantId/sales/commissions` — liste, reste dû,
   encaissement (sélecteur de compte de trésorerie `TreasuryAccountSelector`),
   annulation d'un règlement, part du négociateur.
6. **Fiche bien** : un encart « Vente » (mandat actif, dernière offre, compromis) avec
   un lien vers la fiche mandat.

Tous les libellés en `t('texte français')`, catalogues en/ar mis à jour, marges en
propriétés logiques.

## 6. Hors périmètre du lot 9

- Génération DOCX du mandat, de l'offre et du compromis (le moteur existe : lot suivant).
- Séquestre détenu par l'agence (P3).
- Ventes du promoteur en VEFA (appels de fonds comptabilisés, `MODULE_PROMOTER`).
- Portail acquéreur, signature électronique.
- Publication automatique « Vendu » sur le site vitrine (le statut `SOLD` suffit à retirer
  l'annonce si la publication le filtre déjà).

## 7. Recette

1. Créer un mandat exclusif à 5 % payé par le vendeur, prix 50 000 000.
2. Offre à 45 M → contre-offre 48 M → acceptée : bien `RESERVED`.
3. Compromis au prix de 48 M, deux conditions, dépôt 4,8 M chez le notaire ; signé :
   bien `UNDER_OFFER`.
4. Acte refusé tant qu'une condition est `PENDING` ; les lever, acte signé : bien `SOLD`,
   mandat `COMPLETED`, commission `HT-…` de 2 400 000 HT, TVA 432 000 si l'agence est
   assujettie, 2 832 000 TTC.
5. Encaisser 1 000 000 par Wave : écriture `5521` / `70612` / `4432` équilibrée ;
   statut `PARTIALLY_PAID`. Annuler : contre-passation, statut `DUE`.
6. Balance : 70612 et 4432 reflètent exactement les règlements non annulés.

## 8. Mise en œuvre (24 septembre 2026)

Livré sur `feat/gestion-locative-lot-1` : migration `20260926080000_ventes`,
`packages/api/src/lib/sales/`, routes `/tenants/:tenantId/sales`, écrans
`apps/web/src/pages/sales/`, encart `PropertySaleCard` sur la fiche bien.

Règles ajoutées à la recette :

- À l'acte comme à la révocation, les offres encore ouvertes du mandat passent
  **refusées** (« Bien vendu », « Mandat révoqué ») ; un mandat inactif ne reçoit
  plus de décision (409), et sa fiche n'en propose plus.
- Révoquer un mandat qui porte une offre acceptée vivante est refusé : la retirer
  d'abord remet le bien disponible par le chemin habituel.
- « Un seul mandat actif par bien » est tenu par le service, pas par une contrainte SQL.

Recette §7 rejouée contre l'API : tout passe (le tenant de démonstration n'est
pas assujetti à la TVA ; la répartition HT/TVA est couverte par les tests
unitaires). Reste à faire : jeu de démonstration dédié, test d'intégration des
transitions avec base réelle.
