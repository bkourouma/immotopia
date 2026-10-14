# Spécification 040 — Écrans du contrôle du stock (sprints A et B)

> **Branche** : `feat/controle-stock` · **Créée** : 04/10/2026 · **Statut** : révision 2 (questions au contrat résolues, §14)
> **Documents liés** : [spec.md](spec.md) (exigences A1 à A11, B1 à B8),
> [data-model.md](data-model.md), [contracts/openapi.yaml](contracts/openapi.yaml)
> (font foi pour les données et les routes), [meubles.md](meubles.md) (le volet
> meublés M1 à M5 a ses propres écrans, §8 de ce fichier-là ; rien ici ne les
> touche).
> Toutes les références `fichier:ligne` ont été vérifiées dans le worktree
> (base `e72e960a`). Elles sont relatives à `apps/web/src/` sauf mention
> contraire. « Contrat » désigne `contracts/openapi.yaml` ; un schéma est cité
> par son nom (`FieldContext`, `CountView`…), une route par son chemin sous
> `/api/tenants/{tenantId}/finance`.

## 0. Ce que ce document décide, et ce qu'il ne décide pas

Il décrit, écran par écran : la route, le fichier, l'entrée de menu, le contenu,
les états (chargement, vide, erreur, refus), le comportement sous 992 px, les
libellés français exacts, les appels d'API, ce qui est masqué au magasinier, et
les tests Vitest. Il ne change ni le contrat, ni le modèle de données. Les
manques constatés en première version (§14 « Questions au contrat ») ont tous
reçu une réponse en révision 2 : le contrat a été complété, et ce document
applique les réponses (plus aucun repli provisoire). Le découpage en
territoires d'agents est dans [plan.md](plan.md).

### 0.1 Cinq règles qui valent pour tous les écrans du lot

1. **Montré, pas jugé (D2).** Aucun texte affiché (libellé, aide, message,
   infobulle, nom de fichier, texte alternatif) ne contient « vol », « vols »,
   « voleur », « fraude », « frauduleux », « détournement », « détourné ». On
   écrit « écart », « écart à justifier », « disparition non expliquée ». Un
   écart n'a jamais de couleur d'erreur (rouge) : il est en ton `warning` tant
   qu'il n'est pas justifié, neutre ensuite. Aucun écran ne rapproche un écart
   d'un nom de personne dans un même titre.
2. **Le serveur masque, l'écran n'invente pas (B1, A2).** Un champ de valeur
   reçu à `null` parce que `meta.valuesVisible` est faux ne s'affiche **pas** :
   la colonne, la carte ou la ligne disparaît. On n'écrit jamais « 0 FCFA » ni
   « — » à la place d'un montant masqué (un tiret se lit « rien »). Une quantité
   reçue à `null` parce que le lieu est dans `meta.blindLocationIds` s'affiche
   « Comptage en cours » (§3.4). L'écran ne recalcule jamais une valeur ni un
   écart (principe P-4 des écrans existants, `pages/finance/Stock.tsx:170-181`).
3. **Les gestes affichés sont ceux que l'appelant peut faire.** Le web reçoit
   bien les permissions effectives du compte dans l'agence
   (`GET /roles/menu-access/me`, lu par `services/role-menu-service.ts:37-49`),
   mais seul le menu s'en sert (`navigation/menu-catalog.ts`). Les écrans du
   stock lisent `FieldContext.abilities` (contrat, `GET /stock/field-context`,
   dont `canViewAlerts` et `canManageSettings`) et `meta.valuesVisible` pour
   montrer ou cacher un bouton : une seule source, déjà chargée, traduite en
   gestes. Un refus `403` reste possible (rôle changé entre deux lectures, cache
   de 5 minutes côté API) : il est relayé, jamais avalé.
4. **Une écriture terrain porte toujours un `clientRequestId` (B3-R2).** Tiré
   à l'ouverture du formulaire, gardé tant que l'envoi n'a pas réussi, jeté
   après le succès (§3.7). Un réessai après une coupure ne crée donc jamais une
   seconde réception ou sortie.
5. **Sous 992 px, des cartes ; sous 768 px, des écrans d'une colonne.** Toute
   liste passe par `<DataView>` et son `renderCard` obligatoire
   (`components/primitives/DataView.tsx:13-17, 77`), sauf l'écran Magasin, qui
   est conçu d'abord pour le téléphone (§6) et n'utilise aucun tableau.

### 0.2 Vocabulaire des écrans

| Terme technique                                  | Ce que l'écran écrit                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `ISSUE`                                          | Sortie (vers un chantier)                                                     |
| `RECEIPT`                                        | Réception                                                                     |
| `TRANSFER`                                       | Transfert entre lieux                                                         |
| `ADJUSTMENT`                                     | Ajustement d'inventaire                                                       |
| `SUPPLIER_RETURN`                                | Retour au fournisseur                                                         |
| `SCRAP`                                          | Rebut                                                                         |
| `StockTaker`                                     | Preneur (« la personne qui emporte »)                                         |
| `requestedBy` sans preneur                       | Demandeur                                                                     |
| `StockSlip` `RECEIPT` / `ISSUE` / `COUNT_REPORT` | Bon de réception (BR) / Bon de sortie (BS) / Procès-verbal d'inventaire (PVI) |
| `DRAFT` (inventaire)                             | Comptage en cours                                                             |
| `COUNTED`                                        | Comptage clos                                                                 |
| `VALIDATED`                                      | Validé                                                                        |
| `CANCELLED`                                      | Abandonné                                                                     |
| `blind`                                          | Comptage à l'aveugle                                                          |
| `selfValidated`                                  | Validé sans second regard                                                     |
| `StockAlert`                                     | Alerte (« à regarder »)                                                       |

## 1. Inventaire des écrans

| #   | Écran                                                                 | Route web                                             | Fichier                                                                  | Statut      | Accès (lecture)                           |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ | ----------- | ----------------------------------------- |
| E1  | Stock (état, journal, réception, sortie, rebut, retour, bon, facture) | `/tenant/:tenantId/finance/stock`                     | `pages/finance/Stock.tsx`                                                | modifié     | `STOCK_VIEW`                              |
| E2  | Magasin — écran mobile en trois gestes                                | `/tenant/:tenantId/finance/stock/magasin`             | `pages/finance/StockMagasin.tsx` (+ `components/finance/stock/magasin/`) | **nouveau** | `STOCK_VIEW`                              |
| E3  | Transferts et inventaire                                              | `/tenant/:tenantId/finance/stock/inventaire`          | `pages/finance/StockInventaire.tsx`                                      | modifié     | `STOCK_VIEW`                              |
| E4  | Carnet des preneurs                                                   | `/tenant/:tenantId/finance/stock/preneurs`            | `pages/finance/StockPreneurs.tsx`                                        | **nouveau** | `STOCK_VIEW`                              |
| E5  | Contrôle (alertes, indicateurs, réglages)                             | `/tenant/:tenantId/finance/stock/controle`            | `pages/finance/StockControle.tsx`                                        | **nouveau** | `STOCK_ALERTS_VIEW` / `STOCK_VALUES_VIEW` |
| E6  | Articles et lieux                                                     | `/tenant/:tenantId/finance/stock/parametrage`         | `pages/finance/StockReferentiel.tsx`                                     | retouché    | `STOCK_VIEW`                              |
| E7  | Stock du chantier                                                     | `/tenant/:tenantId/finance/chantiers/:siteId/stock`   | `pages/finance/StockChantier.tsx`                                        | modifié     | `FINANCE_ACCOUNTS_READ` (inchangé)        |
| E8  | Clôture du chantier                                                   | `/tenant/:tenantId/finance/chantiers/:siteId/cloture` | `pages/finance/ClotureChantier.tsx`                                      | retouché    | inchangé                                  |
| E9  | Accueil — file « À traiter »                                          | `/tenant/:tenantId/dashboard` (inchangée)             | `components/home/HomeFeeds.tsx`, `services/dashboard-service.ts`         | retouché    | inchangé                                  |
| E10 | Collaborateurs, invitations, rôles                                    | écrans existants                                      | `constants/permissions-labels.ts`                                        | libellés    | inchangé                                  |
| E11 | Journal d'activité de l'agence (spec 023)                             | `/tenant/:tenantId/activity`                          | `constants/audit-labels.ts`                                              | libellés    | `TENANT_AUDIT_VIEW`                       |
| E12 | Importation (réception et sortie de stock)                            | `/tenant/:tenantId/finance/importation`               | `lib/importation/natures.ts`                                             | adapté      | inchangé                                  |

Toutes les routes nouvelles sont sous `finance/stock`, déjà classé
`CONSTRUCTION` côté web (`navigation/route-features.ts:38`) comme côté API
(D1) : aucune ligne de classement à ajouter.

## 2. Navigation et menu

### 2.1 Routes (`App.tsx`)

Les trois pages nouvelles sont chargées en `React.lazy`, dans le même chunk
`finance` que les pages du stock (`App.tsx:307-323`), et montées dans le layout
existant `<FinanceWorkspaceLayout family="gestion-stock" />`
(`App.tsx:1197-1201`) :

```tsx
const StockMagasin = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/StockMagasin').then(m => ({ default: m.StockMagasin }))
);
const StockPreneurs = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/StockPreneurs').then(m => ({ default: m.StockPreneurs }))
);
const StockControle = lazy(() =>
  import(/* webpackChunkName: "finance" */ './pages/finance/StockControle').then(m => ({ default: m.StockControle }))
);

<Route path="/tenant/:tenantId/finance/stock/magasin" element={<StockMagasin />} />
<Route path="/tenant/:tenantId/finance/stock/preneurs" element={<StockPreneurs />} />
<Route path="/tenant/:tenantId/finance/stock/controle" element={<StockControle />} />
```

Paramètres de requête reconnus (lus par `useSearchParams`, jamais l'agence, qui
reste dans le chemin) :

| Écran | Paramètre                                    | Effet                                                                                    |
| ----- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| E1    | `?onglet=journal`                            | ouvre l'onglet « Journal des mouvements »                                                |
| E1    | `?onglet=journal&mouvement=<movementId>`     | journal filtré sur un mouvement (filtre `movementId`, cible des alertes `StockMovement`) |
| E1    | `?bon=<slipId>`                              | ouvre le tiroir du bon (§5.7)                                                            |
| E1    | `?facture=<invoiceId>`                       | ouvre le tiroir « Réceptions de la facture » (§5.8)                                      |
| E3    | `?onglet=transfert&origine=<locationId>`     | ouvre le transfert, lieu d'origine prérempli                                             |
| E3    | `?inventaire=<countId>`                      | ouvre le détail de l'inventaire                                                          |
| E3    | `?ouvrir=OPENING\|CLOSING&lieu=<locationId>` | ouvre la fenêtre « Ouvrir un inventaire », nature et lieu préremplis                     |
| E5    | `?onglet=alertes\|indicateurs\|reglages`     | onglet affiché (alertes par défaut)                                                      |
| E5    | `?alerte=<alertId>`                          | onglet alertes, alerte mise en évidence et ouverte                                       |

### 2.2 Onglets de l'espace « Gestion du stock »

`navigation/finance-workspaces.tsx:195-212` reçoit trois onglets ; l'ordre suit
le flux (le quotidien, le terrain, le contrôle, puis le référentiel qu'on ne
touche qu'à l'installation) :

| Ordre | Clé                 | Libellé           | Route                        | Icône                         |
| ----- | ------------------- | ----------------- | ---------------------------- | ----------------------------- |
| 1     | `stock`             | Stock             | `/finance/stock`             | `InboxOutlined` (inchangé)    |
| 2     | `stock-magasin`     | **Magasin**       | `/finance/stock/magasin`     | `MobileOutlined`              |
| 3     | `stock-inventaire`  | Inventaire        | `/finance/stock/inventaire`  | `CarryOutOutlined` (inchangé) |
| 4     | `stock-preneurs`    | **Preneurs**      | `/finance/stock/preneurs`    | `TeamOutlined`                |
| 5     | `stock-controle`    | **Contrôle**      | `/finance/stock/controle`    | `AlertOutlined`               |
| 6     | `stock-parametrage` | Articles et lieux | `/finance/stock/parametrage` | `AppstoreOutlined` (inchangé) |

L'onglet actif est le préfixe le plus long (`components/navigation/WorkspaceTabs.tsx:72-85`) :
`/finance/stock/magasin` allume « Magasin » et non « Stock ». L'entrée de menu
« Gestion du stock » (`navigation/model.tsx:409`) reste unique et s'allume sur
les six onglets (`financeWorkspaceActiveFor`).

**Onglet « Contrôle » et magasinier.** Les onglets ne sont filtrés que par
fonctionnalité d'abonnement (`filterWorkspaceTabsByAccess`,
`navigation/finance-workspaces.tsx:250-262`), pas par permission, et ce lot ne
change pas ce mécanisme commun. Le magasinier voit donc l'onglet ; la page
lit `abilities.canViewAlerts` et `valuesVisible` et, s'ils sont tous deux faux,
affiche d'emblée l'état « refus » du §8.1 sans appeler les routes d'alertes.

### 2.3 Menu latéral et rôle Magasinier

Le menu ne masque d'après les permissions réelles que deux groupes, `biens` et
`patrimoine` (`navigation/menu-catalog.ts:389`) ; tous les autres restent
visibles tant qu'un administrateur ne les a pas coupés (« l'absence de décision
vaut autorisé », `packages/api/src/services/role-menu-service.ts:13-16`). Ce lot
fait deux changements, et en laisse un troisième à la décision du Pilote :

1. `MENU_REQUIREMENTS` (`navigation/menu-catalog.ts:130`) reçoit
   `'finance-stock': ['STOCK_VIEW']` et `'finance-chantiers': ['FINANCE_ACCOUNTS_READ']`.
   Le commentaire des lignes 150-156 (une entrée à onglets n'exige une permission
   que si chacun de ses écrans en exige une) est respecté : les six onglets du
   stock exigent `STOCK_VIEW`, et les trois onglets « Suivi des chantiers »
   exigent tous `FINANCE_ACCOUNTS_READ` (`packages/api/src/routes/finance-sites-routes.ts:53`).
2. `PERMISSION_GATED_GROUPS` reçoit `'finance-chantiers-stock'` avec
   l'exigence de groupe `['STOCK_VIEW', 'FINANCE_ACCOUNTS_READ']` (l'une ou
   l'autre). Effet : un magasinier voit « Chantiers et stock › Gestion du
   stock » et pas « Suivi des chantiers » ; un comptable voit les deux.
3. **Tranché (Q14)** : le magasinier n'ayant aucune autre permission, il
   verrait encore les groupes non conditionnés (CRM, baux, finance…). Ni
   l'extension de `PERMISSION_GATED_GROUPS` à tous les groupes (changement de
   comportement pour **tous** les rôles, hors du sujet du lot), ni une migration
   de décisions `role_menu_access` (clés de menu opaques côté serveur, que la
   migration devrait recopier depuis le web et qui divergeraient) : les menus
   hors stock du rôle « Magasinier » se coupent **une fois, par la plateforme**,
   dans l'écran existant « Rôles et menus » (`PUT /roles/menu-access/:roleKey`,
   `packages/api/src/routes/role-routes.ts:36`). L'étape est écrite dans
   `docs/workflows/DEPLOIEMENT.md` (data-model §3.3) et vérifiée en recette
   (plan.md, scénario R1).

Aucun onglet de barre inférieure mobile n'est ajouté : le magasinier atteint
« Magasin » par le menu, puis l'écran Stock lui propose le raccourci (§5.1).

### 2.4 Atelier de développement

`dev/atelier/finance-mock-stock-mouvements.ts`, `finance-mock-stock-inventaire.ts`
et `finance-mock-stock-rapprochement.ts` répondent aux nouvelles formes
(`{ data, meta }`, bons, preneurs, contexte terrain) ; un banc
`finance-mock-stock-controle.ts` répond aux routes nouvelles. Deux scènes de
plus dans `dev/atelier/Atelier.tsx` : « Magasin, téléphone, magasinier sans
valeurs » et « Inventaire clos à justifier ».

## 3. Socle commun

### 3.1 Types (`types/finance-stock-controle-types.ts`, nouveau)

Recopie en TypeScript des schémas du contrat, **noms de champs identiques** :
`StockMeta` (`Meta`), `StockReasonCode`, `StockCountKind`, `StockCountStatus`
(quatre valeurs), `StockValuationSource`, `StockSlipKind`, `StockSlipSummary`,
`StockSlipView`, `StockMovementView` (`MovementView`), `StockBalanceView`,
`StockFieldContext` (`FieldContext`), `StockLocationView`, `StockCountView`,
`StockCountLineView`, `StockTakerView`, `StockAttachmentView`,
`StockAlertView`, `StockIndicatorRow`, `StockIndicatorsView`,
`StockControlsSettings`, `StockInvoiceReceiptsView`, `StockReceiptControl`,
`StockErrorCode`, `StockReceivableInvoice`, `StockInvoiceLineView`, et les
corps de requête (`ReceiptRequest`, `IssueRequest`, `TransferRequest`,
`SupplierReturnRequest`, `ScrapRequest`, `CreateCountRequest`,
`SetCountLineRequest`, `JustifyLineRequest`, `ValidateCountRequest`,
`CreateTakerRequest`, `UpdateTakerRequest`, `ControlsSettingsPatch`). Les
champs « valeur » sont typés `number | null`, et `quantity` (solde),
`quantityAfter`, `countedQuantity` aussi : un type qui promettrait `number`
ferait écrire `formatQuantity(null)` sans que le compilateur proteste.

Les types existants qui mentent après ce lot sont alignés :

- `types/finance-stock-mouvements-types.ts:55` — `StockMovementType` reçoit
  `SUPPLIER_RETURN` et `SCRAP` ; libellés et tons (`:57-79`) aussi :
  « Retour au fournisseur » (`neutral`), « Rebut » (`warning`).
- `types/finance-stock-inventaire-types.ts:220` — `StockCountStatus` passe à
  quatre valeurs ; `StockCountLine.expectedQuantity`, `variance`,
  `countedQuantity` deviennent `number | null` ; `estEnEcart` et
  `lignesSansMotif` (`:344-358`) ne considèrent une ligne « en écart » que si
  `variance` est un nombre non nul, `setAside` nul et `notCounted` faux, et
  « sans motif » se lit dans `justified` **calculé par le serveur** (règle
  unique A4-R2 : `reasonCode`, ou motif libre d'une ligne d'avant le lot) —
  l'écran n'a plus sa propre règle. `lignesNonComptees` (nouvelle) rend les
  lignes `notCounted` non écartées. Le commentaire `:255` (« Casse, perte,
  vol. ») est réécrit sans le mot.
- `types/finance-stock-inventaire-types.ts:152` déclare un type de mouvement
  `TRANSFER_OUT | TRANSFER_IN` que l'API n'émet pas (`TRANSFER`, contrat
  `MovementType`) : dette relevée au passage, alignée sur le contrat.
- `types/finance-site-closing-types.ts:191-195` — `SiteClosureBlocker` reçoit
  `documentType?: 'SUPPLIER_INVOICE' | 'STOCK_COUNT' | 'STOCK_RESIDUAL' |
'STOCK_CLOSING_COUNT_MISSING'` et `documentIds?: string[]` (contrat
  `ClosureBlocker`).
- `types/finance-stock-rapprochement-types.ts` — `SiteStockStatus` reçoit
  `openingCountSuggested: boolean` ; `SiteStockReconciliationLine` reçoit les
  quatre champs de `ReconciliationLineAdditions`, et `remainingQuantity`,
  `remainingValue` (ligne et en-tête) deviennent `number | null` (aveugle) ; la
  réponse est lue avec son `meta`.

### 3.2 Services

**Règle nouvelle** : une route qui renvoie `meta` est lue par une fonction qui
renvoie `{ data, meta }`. Les services actuels jettent `meta`
(`services/finance-stock-mouvements-service.ts:111, 126` ;
`services/finance-stock-inventaire-service.ts:110-138`), et sans lui l'écran
ne peut savoir ni que les valeurs sont masquées, ni quels lieux sont en
comptage.

| Fichier                                       | Fonction                                                                                                                      | Route du contrat                                                                                                                                | Retour                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `finance-stock-controle-service.ts` (nouveau) | `getStockFieldContext`                                                                                                        | `GET /stock/field-context`                                                                                                                      | `{ data: StockFieldContext, meta }`                                   |
| idem                                          | `listStockTakers`, `createStockTaker`, `updateStockTaker`                                                                     | `GET/POST /stock/takers`, `PATCH /stock/takers/{takerId}`                                                                                       | `StockTakerView[]` / `StockTakerView`                                 |
| idem                                          | `getStockSlip`, `downloadStockSlipPdf`                                                                                        | `GET /stock/slips/{slipId}`, `GET …/pdf` (`responseType: 'blob'`)                                                                               | `{ data, meta }` / `{ blob, filename }`                               |
| idem                                          | `downloadStockCountReport`                                                                                                    | `GET /stock/counts/{countId}/report.pdf`                                                                                                        | `{ blob, filename }`                                                  |
| idem                                          | `uploadStockAttachment` (avec `clientRequestId`), `listStockAttachments`, `fetchStockAttachmentBlob`, `removeStockAttachment` | `POST/GET /stock/attachments`, `GET …/{id}/file`, `POST …/{id}/remove`                                                                          | `StockAttachmentView` / `[]` / `Blob` / `StockAttachmentView`         |
| idem                                          | `listStockAlerts`, `acknowledgeStockAlert`                                                                                    | `GET /stock/alerts`, `POST …/{alertId}/acknowledge`                                                                                             | `{ data, meta }` / `StockAlertView`                                   |
| idem                                          | `getStockIndicators`                                                                                                          | `GET /stock/indicators`                                                                                                                         | `StockIndicatorsView`                                                 |
| idem                                          | `getStockControls`, `updateStockControls`                                                                                     | `GET/PATCH /stock/settings/controls`                                                                                                            | `StockControlsSettings`                                               |
| idem                                          | `getInvoiceReceipts`                                                                                                          | `GET /stock/supplier-invoices/{invoiceId}/receipts` (lignes de la facture et `byItem` compris)                                                  | `{ data, meta }`                                                      |
| idem                                          | `searchReceivableInvoices`                                                                                                    | `GET /stock/receivable-invoices?search=&cursor=&limit=20`                                                                                       | `{ data: StockReceivableInvoice[], meta }`                            |
| idem                                          | `setAsideUncountedLines`                                                                                                      | `POST /stock/counts/{countId}/set-aside-uncounted` `{ reason }`                                                                                 | `StockCountView`                                                      |
| idem                                          | `listMovementAuthors`                                                                                                         | `GET /stock/movements/authors`                                                                                                                  | `{ userId, label }[]`                                                 |
| idem                                          | `exportStockMovementsCsv`                                                                                                     | `GET /stock/movements/export.csv`                                                                                                               | `{ blob, filename }`                                                  |
| idem                                          | `recordStockScrap`, `recordSupplierReturn`                                                                                    | `POST /stock/scraps`, `/stock/supplier-returns`                                                                                                 | `{ data: StockMovementView, meta, replayed }`                         |
| `finance-stock-mouvements-service.ts`         | `listStockBalances`                                                                                                           | `GET /stock/balances`                                                                                                                           | **devient** `{ data, meta }`                                          |
| idem                                          | `listStockMovements`                                                                                                          | `GET /stock/movements` (+ `cursor`, `limit`, `slipId`, `movementId`, et avec les valeurs seulement `takerId`, `createdByUserId`, `requestedBy`) | **devient** `{ data, meta }`                                          |
| idem                                          | `recordStockReceipt`                                                                                                          | `POST /stock/receipts`                                                                                                                          | **devient** `{ data: { slip, movements, controls }, meta, replayed }` |
| idem                                          | `recordStockIssue`                                                                                                            | `POST /stock/issues`, corps multi-lignes                                                                                                        | **devient** `{ data: { slip, movements }, meta, replayed }`           |
| idem                                          | `listSupplierInvoicesForReceipt` (`:219-225`)                                                                                 | inchangée                                                                                                                                       | gardée seulement pour le repli §5.3                                   |
| `finance-stock-inventaire-service.ts`         | `createStockTransfer`                                                                                                         | `POST /stock/transfers` (+ `takerId`/`requestedBy`, `reasonCode`, `reason`, `clientRequestId`)                                                  | `{ data, meta, replayed }`                                            |
| idem                                          | `setStockCountLine`                                                                                                           | `PUT …/lines` : **n'envoie plus jamais `reason`** (400 sinon, A2-R5), envoie `clientRequestId`                                                  | `StockCountLineView` (n'est plus un inventaire entier)                |
| idem                                          | `closeStockCount`, `justifyStockCountLine`, `setAsideStockCountLine`, `cancelStockCount`                                      | routes `close`, `justification`, `set-aside`, `cancel`                                                                                          | `StockCountView` / `StockCountLineView`                               |
| idem                                          | `validateStockCount(tenantId, countId, selfValidationReason?)`                                                                | `POST …/validate` : corps vide, ou `{ selfValidationReason }`                                                                                   | `StockCountView`                                                      |
| idem                                          | `createStockCount`                                                                                                            | `POST /stock/counts` (+ `kind`)                                                                                                                 | `StockCountView`                                                      |
| idem                                          | `listStockCounts`                                                                                                             | `GET /stock/counts` (lignes omises, `withLines` non envoyé)                                                                                     | `{ data, meta }`                                                      |
| `finance-stock-rapprochement-service.ts`      | inchangées                                                                                                                    | types étendus (§3.1)                                                                                                                            | —                                                                     |

`replayed` vaut `response.status === 200` sur une écriture : le rejeu
idempotent répond `200`, la création `201` (contrat, routes `receipts`,
`issues`, `transfers`, `scraps`, `supplier-returns`). L'écran s'en sert pour
dire « déjà enregistrée » plutôt que « enregistrée » (§3.7).

Les corps sont **recomposés champ par champ** comme aujourd'hui
(`services/finance-stock-mouvements-service.ts:177-185`) : aucun champ de
valeur ne peut se glisser dans une sortie, et `unitCost` d'une réception n'est
envoyé que si l'appelant l'a saisi (§5.3).

### 3.3 Le contexte terrain, chargé une fois

Hook `hooks/useStockFieldContext.ts` (nouveau) :
`useQuery({ queryKey: queryKey('stock-field-context', tenantId), queryFn: getStockFieldContext, staleTime: STALE_TIME.list })`.
Il remplace, **dans tous les écrans du stock**, les lectures qui exigent un
droit financier que le magasinier n'a pas :

| Lecture actuelle                                            | Droit exigé aujourd'hui                                                            | Remplacée par                                                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `listConstructionSites` (`pages/finance/Stock.tsx:338-343`) | `FINANCE_ACCOUNTS_READ` (`packages/api/src/routes/finance-sites-routes.ts:53`)     | `FieldContext.sites`                                                                                         |
| `listCostCategories` (`Stock.tsx:345-350`)                  | `FINANCE_ACCOUNTS_READ` (`finance-sites-routes.ts:65`)                             | `FieldContext.costCategories`                                                                                |
| `listSuppliers` (`Stock.tsx:365-370`)                       | `FINANCE_ACCOUNTS_READ` (`packages/api/src/routes/finance-suppliers-routes.ts:59`) | `FieldContext.receivableInvoices[].supplierName`                                                             |
| `listSupplierInvoicesForReceipt` (`Stock.tsx:382-387`)      | idem                                                                               | `FieldContext.receivableInvoices` (50 plus récentes), puis `searchReceivableInvoices` (`STOCK_VIEW`) au-delà |
| `listStockItems` / `listStockLocations` (actifs)            | `STOCK_VIEW` après le lot                                                          | `FieldContext.items` / `.locations` (moins d'appels)                                                         |

Le contexte est **invalidé** après : création ou modification d'un preneur,
réception (le `receiptCount` d'une facture change), ouverture, clôture,
validation ou abandon d'un inventaire (`countInProgress`, `toRecount`
changent). Il ne porte plus les lignes des factures : elles se lisent par
`getInvoiceReceipts` à l'étape qui en a besoin.

Il donne aussi les **droits de l'appelant** (`abilities`), utilisés partout :

| Ability             | Montre                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canReceive`        | « Enregistrer une réception », geste « Recevoir »                                                                                                                   |
| `canIssue`          | « Enregistrer une sortie », geste « Sortir »                                                                                                                        |
| `canTransfer`       | onglet Transfert d'E3, geste « Transférer »                                                                                                                         |
| `canCount`          | « Ouvrir un inventaire », saisie de ligne, « Clore le comptage », « Justifier »                                                                                     |
| `canValidateCount`  | « Valider », « Abandonner », « Écarter la ligne » ; justification aussi                                                                                             |
| `canDispose`        | « Rebut », « Retour au fournisseur », « Retirer une pièce jointe » après 15 min                                                                                     |
| `canManageTakers`   | création et correction de preneurs ; colonne et champ « Téléphone » (le serveur rend `phone = null` sinon)                                                          |
| `canViewAlerts`     | onglet « Alertes » d'E5                                                                                                                                             |
| `canManageSettings` | boutons d'écriture d'E6 (référentiel) et formulaire des réglages de contrôle d'E5 en écriture                                                                       |
| `valuesVisible`     | toute colonne, carte ou ligne de valeur ; filtres « Preneur », « Demandeur ou preneur contient » et « Saisi par » du journal ; onglets Indicateurs et Réglages d'E5 |

Si le contexte échoue en `403` (`FORBIDDEN`), l'écran affiche
`<StateBlock variant="forbidden" title={t("Le stock ne vous est pas ouvert")}
description={t("Votre rôle ne comprend pas la consultation du stock. Demandez à l'administrateur de l'agence de vous attribuer le rôle Magasinier ou un rôle qui la comprend.")} />`.
En `403 MODULE_NOT_INCLUDED` (`utils/module-not-included.ts:9`), l'état
`<ModuleNotIncluded>` existant.

### 3.4 Le comptage à l'aveugle, côté écran (A2)

**Ce que l'écran ne fait jamais** : afficher, pendant un comptage (`DRAFT`), la
quantité que le système attend pour un article du lieu compté — ni dans le
formulaire de saisie, ni dans une infobulle, ni par un calcul à partir d'un
autre écran. L'écran actuel le fait (`pages/finance/StockInventaire.tsx:339-345`
lit les soldes du lieu compté, `:884-896` écrit « Le système dit qu'il y a … à
cet instant ») : **ces deux blocs sont supprimés**.

Partout ailleurs, un lieu listé dans `meta.blindLocationIds` (ou dont
`LocationView.countInProgress.status === 'DRAFT'`) est traité ainsi :

| Endroit                                                                                                                  | Affichage                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cellule « Quantité » d'un solde (`quantity === null`)                                                                    | `<StatusTag tone="info" label={t('Comptage en cours')} />` et infobulle « Un inventaire est en cours sur ce lieu : la quantité reste masquée jusqu'à la clôture du comptage. » |
| Cellules « Coût moyen unitaire » et « Valeur » d'un solde d'un lieu aveugle (`value === null` alors que `valuesVisible`) | même pastille « Comptage en cours » ; jamais « 0 FCFA » ni « — » (le comptable aussi est à l'aveugle, spec §8.2)                                                               |
| « Reste après », « Prix unitaire », « Valeur après » d'un mouvement d'un lieu aveugle                                    | « Masqué (comptage en cours) » en texte secondaire                                                                                                                             |
| « Restant » du rapprochement d'un chantier dont le lieu est en comptage (E7)                                             | « Comptage en cours » ; l'écran ne recalcule rien                                                                                                                              |
| Stock disponible dans une sortie ou un transfert                                                                         | « Lieu en cours de comptage : la quantité disponible n'est pas affichée. Le serveur refusera une sortie qui dépasse le stock. » ; pas d'avertissement de dépassement           |
| Liste des lieux d'un geste                                                                                               | pastille « Comptage en cours »                                                                                                                                                 |
| Refus `409 STOCK_INSUFFICIENT`                                                                                           | message du serveur relayé tel quel (il ne cite aucune quantité, A2 critère 3)                                                                                                  |

Un détenteur de `STOCK_COUNT_VALIDATE` reçoit les quantités hors des routes
d'inventaire (spec §8.2) ; l'écran n'a rien à faire de plus : il affiche ce
qu'il reçoit.

### 3.5 Les valeurs, côté écran (B1)

`valuesVisible = meta.valuesVisible ?? fieldContext.abilities.valuesVisible`.
Quand il est faux :

- colonnes retirées des tableaux : « Coût moyen unitaire », « Valeur »
  (soldes) ; « Prix unitaire », « Valeur du mouvement », valeur sous « Reste
  après » (journal) ; « Valeur de l'écart » (inventaires) ;
- champs retirés des cartes mobiles (`highlight` d'une carte de solde ou de
  mouvement : la quantité prend la place de la valeur) ;
- `<StatCard>` de valeur retirées ; aperçu de sortie (`Stock.tsx:1372-1389`)
  retiré ; champ « Prix unitaire » d'une réception retiré ; montant des
  factures retiré des listes ;
- paragraphes qui expliquent le coût moyen (`Stock.tsx:914-919`) retirés : ils
  parlent d'un chiffre que la personne ne voit pas ;
- message de succès d'une sortie sans montant (« Sortie enregistrée : bon
  BS-2026-00057. » au lieu de « … pour 152 000 FCFA », `Stock.tsx:671-678`).

Un en-tête discret le dit une fois par écran, sous le `PageHeader` :
`<Text type="secondary">{t('Les valeurs du stock ne sont pas affichées pour votre rôle.')}</Text>`.

### 3.6 Libellés partagés (`types/finance-stock-controle-types.ts`)

Tous passent par `t()`, texte français = clé.

**Motifs (`STOCK_REASON_LABELS`)** — repris de spec §4, à l'identique :

| Code                        | Libellé                                 | Aide affichée sous l'option (facultative)                                          |
| --------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| `BREAKAGE`                  | Casse                                   | Matière brisée ou endommagée sur place.                                            |
| `DETERIORATION`             | Détérioration (humidité, péremption)    | Matière devenue inutilisable avec le temps.                                        |
| `COUNTING_ERROR`            | Erreur du comptage précédent            | Le dernier inventaire avait mal compté.                                            |
| `ENTRY_ERROR`               | Erreur de saisie d'un mouvement         | Une réception, une sortie ou un transfert a été mal saisi.                         |
| `UNIT_CONFUSION`            | Confusion d'unité                       | Compté dans une autre unité que celle de l'article.                                |
| `UNRECORDED_ISSUE`          | Sortie non enregistrée                  | De la matière est partie sans sortie saisie.                                       |
| `UNRECORDED_RECEIPT`        | Réception non enregistrée               | De la matière est arrivée sans réception saisie.                                   |
| `UNEXPLAINED_DISAPPEARANCE` | Disparition non expliquée               | Il manque de la matière et personne n'en connaît la cause. C'est une constatation. |
| `OPENING_BALANCE`           | Stock d'ouverture (posé par le système) | — (jamais proposé au choix)                                                        |
| `NON_CONFORMING`            | Non conforme à la commande              |                                                                                    |
| `DAMAGED_ON_DELIVERY`       | Endommagé à la livraison                |                                                                                    |
| `EXCESS_DELIVERY`           | Livré en trop                           |                                                                                    |
| `SITE_SUPPLY`               | Approvisionnement d'un chantier         |                                                                                    |
| `RETURN_TO_WAREHOUSE`       | Retour au magasin                       |                                                                                    |
| `SITE_EVACUATION`           | Évacuation d'un chantier                |                                                                                    |
| `REBALANCING`               | Rééquilibrage entre lieux               |                                                                                    |
| `OTHER`                     | Autre (précision obligatoire)           |                                                                                    |

Les listes proposées viennent de `FieldContext.reasonCodes.count`,
`.scrap`, `.supplierReturn`, `.transfer` : l'écran **n'en déduit aucune** de
son côté. Choisir « Autre » rend la précision obligatoire (bouton d'envoi
fermé tant qu'elle est vide, 1 à 500 caractères). Une ligne d'avant le lot
(`reasonCode === null` et `reason` non vide) s'affiche « Motif libre :
{{reason}} ».

**Autres libellés** :

| Ensemble                                    | Valeurs                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Statut d'inventaire                         | `DRAFT` « Comptage en cours » (`info`), `COUNTED` « Comptage clos » (`warning`), `VALIDATED` « Validé » (`success`), `CANCELLED` « Abandonné » (`neutral`). Toujours passés en `label` à `<StatusTag>` : son libellé par défaut de `DRAFT` est « Brouillon » (`components/primitives/StatusTag.tsx:36`).                                                                                                                           |
| Nature d'inventaire                         | `REGULAR` « Inventaire courant », `OPENING` « Inventaire d'ouverture », `CLOSING` « Inventaire de clôture »                                                                                                                                                                                                                                                                                                                        |
| Bon                                         | `RECEIPT` « Bon de réception », `ISSUE` « Bon de sortie », `COUNT_REPORT` « Procès-verbal d'inventaire »                                                                                                                                                                                                                                                                                                                           |
| Pièce jointe                                | `GOODS_PHOTO` « Photo de la marchandise », `DELIVERY_NOTE` « Bon de livraison du fournisseur », `SIGNED_SLIP` « Bon signé », `OTHER` « Autre document »                                                                                                                                                                                                                                                                            |
| Source du prix (valeurs visibles seulement) | `DECLARED` « Prix saisi », `INVOICE_LINE` « Prix de la ligne de facture », `AVERAGE_COST` « Coût moyen du lieu », `LAST_RECEIPT` « Dernier prix reçu », `NONE` « Aucun prix connu »                                                                                                                                                                                                                                                |
| Gravité d'alerte                            | `WARNING` « À regarder » (`warning`), `INFO` « Information » (`info`)                                                                                                                                                                                                                                                                                                                                                              |
| Nature d'alerte (filtre)                    | `COUNT_VARIANCE` « Écart d'inventaire au-dessus du seuil », `LARGE_ISSUE` « Sortie importante », `LARGE_SCRAP` « Rebut important », `RECEIPT_REPEATED` « Facture déjà réceptionnée », `RECEIPT_OVER_INVOICE` « Valeur reçue supérieure à la facture », `RECEIPT_UNVALUED` « Réception sans prix connu », `CASH_MATERIAL_PURCHASE` « Achat de matériaux en espèces », `COUNT_SELF_VALIDATED` « Inventaire validé par son compteur » |

Le **titre** et le **message** d'une alerte sont construits et traduits par le
serveur (`AlertView.title`, `.message`) : l'écran les affiche tels quels et ne
les retraduit pas.

### 3.7 Identifiant de requête et réseau instable

`utils/stock-client-request-id.ts` (nouveau) exporte
`nouvelIdentifiantDeRequete(): string`. Le contrat exige un UUID
(`ClientRequestId`, `format: uuid`) : `crypto.randomUUID()` quand il existe,
**sinon un UUID v4 construit avec `crypto.getRandomValues`**. Le repli des
écrans existants (`` `${installmentId}-${Math.random()…}` ``,
`pages/rental/Installments.tsx:134-137`) n'est pas un UUID et serait refusé ;
or `randomUUID` manque sur les navigateurs Android anciens et hors contexte
sécurisé, exactement la cible de l'écran Magasin.

Cycle de vie, identique dans tous les formulaires d'écriture :

1. tiré à l'ouverture du formulaire (ou de l'étape récapitulative du geste) ;
2. gardé tel quel à chaque nouvel essai, **y compris après une erreur réseau
   sans réponse** ;
3. jeté après un succès (`200` ou `201`), et après un `4xx` qui oblige à
   modifier le formulaire (le corps changera : réutiliser l'identifiant
   donnerait `409 STOCK_IDEMPOTENCY_MISMATCH`).

Erreur réseau (aucune réponse) : le formulaire reste rempli, et l'écran
affiche `<Alert type="warning" message={t('La connexion a été perdue.')}
description={t("Vos saisies sont conservées. Réessayez : l'opération ne sera pas enregistrée deux fois.")} />`
avec un bouton « Réessayer ». Réponse `200` (rejeu) : « Cette opération était
déjà enregistrée : voici son bon. » au lieu du message de succès.
`409 STOCK_IDEMPOTENCY_MISMATCH` : « Cette opération a déjà été envoyée avec
d'autres données. Vérifiez le journal avant de recommencer. » et un nouvel
identifiant est tiré.

Il n'y a **pas de mode hors ligne** (D3) : rien n'est mis en file d'attente
au-delà de la page ouverte.

### 3.8 Dates de mouvement (A5-R4)

Tous les sélecteurs de date d'une réception, d'une sortie, d'un transfert,
d'un rebut, d'un retour et d'un inventaire :

- valeur par défaut : aujourd'hui ;
- `disabledDate` : après aujourd'hui, ou avant aujourd'hui −
  `FieldContext.settings.backdatingLimitDays` ;
- aide sous le champ : « Au plus {{n}} jours en arrière. La date de saisie
  réelle est enregistrée à côté. » (« Aujourd'hui seulement. » quand la borne
  vaut 0) ;
- les refus `400 STOCK_DATE_IN_FUTURE` / `STOCK_DATE_TOO_OLD` (le jour a pu
  changer entre l'ouverture et l'envoi) sont relayés et le champ de date est
  mis en erreur.

Sur l'écran Magasin, la date n'est pas demandée : elle vaut aujourd'hui, et un
lien discret « Changer la date » ouvre le sélecteur.

### 3.9 Erreurs à traitement particulier

Règle générale inchangée : le message du serveur est relayé tel quel
(`err.response.data.message`), avec un texte de secours. Les codes ci-dessous
(contrat `StockErrorCode`, lus dans `err.response.data.code`) déclenchent en
plus un comportement d'écran :

| Code                                                              | Comportement                                                                                                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STOCK_COUNT_SELF_VALIDATION_FORBIDDEN` (403)                     | Alerte persistante dans le détail de l'inventaire (§7.6), pas un toast                                                                             |
| `STOCK_COUNT_SELF_VALIDATION_REASON_REQUIRED` (400)               | Ouvre la fenêtre « Valider sans second regard » (§7.6)                                                                                             |
| `STOCK_COUNT_UNJUSTIFIED_VARIANCE` (409, `data.items`)            | Liste les articles dans le bloc de validation                                                                                                      |
| `STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS` (409, `data.items`)        | Alerte dédiée (§7.6)                                                                                                                               |
| `STOCK_TAKER_DUPLICATE` (409, `data.existingTakerId`)             | Propose « Choisir ce preneur »                                                                                                                     |
| `STOCK_TAKER_REQUIRED`, `STOCK_REQUESTER_REQUIRED` (400)          | Met en erreur le sélecteur de preneur                                                                                                              |
| `STOCK_REASON_REQUIRED`, `STOCK_REASON_NOT_ALLOWED` (400)         | Met en erreur le champ motif ou précision                                                                                                          |
| `STOCK_DATE_IN_FUTURE`, `STOCK_DATE_TOO_OLD` (400)                | Met en erreur le champ date                                                                                                                        |
| `STOCK_SITE_CLOSED` (409)                                         | Relayé ; la liste des chantiers et des lieux d'arrivée est rechargée                                                                               |
| `STOCK_IDEMPOTENCY_MISMATCH` (409)                                | §3.7                                                                                                                                               |
| `STOCK_EXPORT_TOO_LARGE` (422)                                    | « L'export dépasse 50 000 lignes. Réduisez la période ou ajoutez un filtre. » (corps lu par `describeDownloadError`, `utils/download-error.ts:18`) |
| `STOCK_ATTACHMENT_TOO_LARGE` (413), `STOCK_ATTACHMENT_TYPE` (400) | Message sous la vignette en échec ; les autres photos continuent                                                                                   |
| `STOCK_VALUE_FIELD_FORBIDDEN` (403)                               | Ne doit pas arriver (l'écran n'envoie aucune valeur sans `valuesVisible`) : relayé tel quel                                                        |
| `STOCK_ALERT_ALREADY_ACKNOWLEDGED` (409)                          | « Cette alerte a déjà été traitée. » puis rechargement de la liste                                                                                 |
| `STOCK_COUNT_INCOMPLETE` (409, `data.items`)                      | Liste des articles à compter, chacun ramenant à sa saisie (§6.6)                                                                                   |
| `STOCK_COUNT_UNCOUNTED_LINES` (409, `data.items`)                 | Rappel des non comptés à écarter, inventaire relu (§7.6)                                                                                           |
| `STOCK_RETURN_UNVALUED` (409)                                     | Met en erreur le champ « Ligne de la facture » (§5.5)                                                                                              |
| `STOCK_OPENING_COUNT_NOT_ALLOWED` (409)                           | Relayé dans la fenêtre « Ouvrir un inventaire » ; la nature revient à « Inventaire courant » (§7.3)                                                |
| `STOCK_ATTACHMENT_TARGET_NOT_ALLOWED` (409)                       | Message sous la vignette ; ne doit pas arriver (l'écran ne propose pas ces cibles)                                                                 |

## 4. Composants partagés (`components/finance/stock/`, nouveau dossier)

| Composant                 | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `StockPhotoCapture.tsx`   | Bouton « Prendre une photo » : `<Upload accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" showUploadList={false} beforeUpload={… return false}>` (même mécanique qu'`components/rental/inspections/ItemPhotos.tsx:92-104`). Réduit l'image avant envoi par `downscaleImageFile(file, 1600, 0.7)` (`utils/downscale-image.ts:27`, paramètre `quality` ajouté, Q12). Garde les fichiers **en attente** tant que la cible n'existe pas (photo prise avant l'enregistrement d'une sortie), puis les envoie un par un, avec un état par vignette : « En attente », « Envoi… », « Envoyée », « Échec — réessayer ». Chaque fichier a son `clientRequestId` (tiré à la prise de vue, gardé jusqu'au succès) : réessayer après une coupure ne dépose jamais deux fois la même photo (spec B5-R7). Consigne affichée sous le bouton, toujours : « Photographiez la marchandise et les bons, pas les personnes. » Hauteur minimale 48 px.                                                                                                                                                 |
| `StockAttachmentList.tsx` | Vignettes d'une cible (`GET /stock/attachments?targetType&targetId`, ou `SlipView.attachments`). Image lue en blob par `fetchStockAttachmentBlob` puis `URL.createObjectURL`, révoquée au démontage (forme d'`components/rental/inspections/InspectionPhotoImage.tsx`). PDF : icône et bouton « Ouvrir ». Sous chaque pièce : finalité, « Ajoutée par {{label}} le {{date}} à {{heure}} (heure du serveur) », empreinte courte « Empreinte : 3fa9…c21e » avec bouton « Copier l'empreinte complète » et infobulle « Empreinte enregistrée : toute modification du fichier serait détectable. » (jamais « infalsifiable », spec §3.3). Pièce retirée (`removed` non nul) : vignette grisée « Retirée le … par … — motif : … », empreinte conservée, aucun fichier. Bouton « Retirer » affiché si `canRemove` (calculé par le serveur), avec « jusqu'à {{heure}} » quand `removableUntil` est renseigné ; fenêtre de motif (3 à 500). Les vignettes ne se chargent qu'à l'ouverture d'un bon ou d'une ligne, jamais dans une liste : chaque lecture de fichier est tracée (`DOCUMENT_DOWNLOADED`, spec B5-R8). |
| `StockSlipPdfButton.tsx`  | « Télécharger le bon (PDF) » : `downloadStockSlipPdf`, puis `saveBlob(blob, filenameFromDisposition(disposition, '<numéro>.pdf'))` (`utils/save-blob.ts:6, 18`) ; erreur par `describeDownloadError`. Variante PVI : « Télécharger le procès-verbal (PDF) » sur `downloadStockCountReport`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `StockTakerSelect.tsx`    | Choix d'un preneur : liste cherchable des `FieldContext.takers` actifs (« Nom — Équipe »), option de tête « Ajouter un preneur… » (si `canManageTakers`) qui ouvre `StockTakerForm` en ligne et sélectionne le preneur créé. Si `settings.requireTaker` est faux, un lien « Saisir un nom sans l'ajouter au carnet » bascule sur un champ texte `requestedBy` (1 à 200 caractères). Si `requireTaker` est vrai, le lien n'existe pas et l'aide dit : « Votre agence exige un preneur du carnet pour chaque sortie et chaque transfert. »                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `StockTakerForm.tsx`      | Champs : « Nom complet » (2 à 120), « Équipe ou entreprise » (facultatif, 120), « Téléphone » (facultatif, `inputMode="tel"`, 30), « Lier à un employé ou un tâcheron » (facultatif, `FieldContext.people`, un seul choix). Rien d'autre (spec §10). Aide : « Le nom du preneur est imprimé sur les bons de sortie. Ne saisissez que ce qui sert à le reconnaître. »                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `StockReasonPicker.tsx`   | Motif d'une liste fermée en **gros boutons radio** (une option par ligne, 48 px, libellé et aide), puis « Précision » (`Input.TextArea`, obligatoire pour « Autre », 500 caractères). Jamais de champ libre seul.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `StockQuantityInput.tsx`  | `<InputNumber>` en `inputMode="decimal"`, `min` selon le cas, unité en suffixe, quatre décimales au plus sans les imposer (règle d'`arrondirQuantite`, `Stock.tsx:206-208`), police 16 px au moins (sous 16 px, Chrome Android zoome à la saisie).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `StockQuantityCell.tsx`   | Affiche une quantité (`formatQuantity`), ou l'état « Comptage en cours » si elle vaut `null` (§3.4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `StockBlindBanner.tsx`    | Bandeau du comptage à l'aveugle (§7.3, §6.6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 5. E1 — Stock (`pages/finance/Stock.tsx`, modifié)

### 5.1 En-tête et actions

- `PageHeader` inchangé ; mention « Les valeurs du stock ne sont pas affichées
  pour votre rôle. » quand `!valuesVisible` (§3.5).
- Bandeau « C'est la sortie qui impute le chantier, pas la livraison »
  (`Stock.tsx:1058-1066`) conservé, **seulement si `valuesVisible`** (il parle
  de coût).
- **Sous 992 px** (`useBreakpoint().isDesktop === false`), une carte de tête
  avant tout le reste : titre « Vous êtes sur le terrain ? », texte « L'écran
  Magasin réunit la réception, la sortie et le comptage en trois gestes, avec
  la photo. », bouton primaire pleine largeur « Ouvrir l'écran Magasin » →
  `/tenant/:tenantId/finance/stock/magasin`.
- Boutons, selon `abilities` : « Enregistrer une réception » (`canReceive`),
  « Enregistrer une sortie » (`canIssue`, primaire), menu « Autres mouvements »
  (`canDispose`) avec « Rebut » et « Retour au fournisseur ». Aucun bouton
  quand aucune ability d'écriture n'est vraie.

### 5.2 Onglet « État du stock »

Appel : `listStockBalances(tenantId, filtres)` → `GET /stock/balances`
(`locationId`, `itemId`, `onlyInStock`), lecture de `meta`.

| Colonne             | Contenu                                                                        | Valeurs masquées |
| ------------------- | ------------------------------------------------------------------------------ | ---------------- |
| Article             | libellé, référence dessous                                                     | —                |
| Lieu                | libellé, pastille « Comptage en cours » si lieu aveugle                        | —                |
| Quantité            | `StockQuantityCell` ; « 0 sac — plus rien ici » inchangé (`Stock.tsx:714-721`) | —                |
| Coût moyen unitaire | `MoneyValue` / unité                                                           | **retirée**      |
| Valeur              | `MoneyValue`                                                                   | **retirée**      |

Carte mobile : titre article, sous-titre « référence — lieu », `highlight` =
valeur si visible, sinon quantité ; champs : Quantité, Coût moyen unitaire (si
visible). États : chargement (squelette de `DataView`), vide « Aucun stock
n'est encore enregistré. » (+ « Enregistrer une réception » si `canReceive`),
erreur « Impossible de charger l'état du stock. » + Réessayer, filtré « Aucun
résultat » + Effacer les filtres.

### 5.3 Fenêtre « Enregistrer une réception » (A8, B4, B5)

Remplace `Stock.tsx:1088-1271`. Ordre des champs :

1. **Facture validée** — liste cherchable de `FieldContext.receivableInvoices`
   (« FA-2026-0142 — Ciments d'Abidjan — 28/09/2026 », plus « — 1 250 000 FCFA »
   si `valuesVisible`). Le choix du fournisseur d'abord disparaît : la liste
   porte déjà le fournisseur. Pastille sur l'option : « Déjà réceptionnée
   ({{n}} fois) » quand `receiptCount > 0`. Aide : « Seules les factures
   validées les plus récentes sont proposées. » Pour une autre facture, **pour
   tout le monde** : champ « Chercher une autre facture (référence ou
   fournisseur) » → `searchReceivableInvoices` (`STOCK_VIEW`, 20 par page,
   « Afficher plus »). L'ancien couple fournisseur/facture et ses lectures
   financières disparaissent de l'écran.
2. **Avertissement de réception multiple (A8-R1)** — dès qu'une facture avec
   `receiptCount > 0` est choisie : `getInvoiceReceipts(invoiceId)` puis
   `<Alert type="info" message={t('Cette facture a déjà été réceptionnée')}
description={liste} />`, la liste donnant pour chaque réception : numéro du
   bon (lien `?bon=`), date, lieu, auteur, articles et quantités (valeurs si
   visibles). Phrase finale : « Une livraison en plusieurs fois est normale.
   Vérifiez seulement que cette marchandise n'a pas déjà été saisie. »
   Chargement : « Lecture des réceptions déjà faites… ». Échec : texte
   secondaire « Les réceptions déjà faites n'ont pas pu être lues. » (la saisie
   reste possible).
3. **Lieu de réception** — lieux actifs ; préremplit le lieu du chantier de la
   facture quand `sites[siteId].stockEnabled` et `locationId` existent.
   Exclut les lieux des chantiers clos (`sites[].closed`, A7-R4).
4. **Date de réception** — §3.8.
5. **Lignes reçues** (1 à 50) — pour chaque ligne : « Article » (obligatoire),
   « Quantité reçue » (obligatoire, > 0), « Ligne de la facture » (facultatif,
   `getInvoiceReceipts(...).invoice.lines`, lu dès le choix de la facture,
   option « — Aucune — »), et **seulement si `valuesVisible`** « Prix
   unitaire » (**facultatif**). Règles du prix (spec A8-R3, même chaîne pour
   tous) :
   - ligne de facture choisie avec `hasUnitPrice` : le champ prix est prérempli
     de `unitPrice`, aide « Prix repris de la facture. » ; **s'il n'est pas
     modifié, `unitCost` n'est pas envoyé** (seul `supplierInvoiceLineId`
     part, et la source enregistrée est `INVOICE_LINE`) ;
   - prix laissé vide : aide « Laissé vide, le prix est repris de la ligne de
     facture, sinon du coût moyen du lieu, sinon du dernier prix reçu. » ;
     aucun refus du serveur ;
   - sans `valuesVisible` : aucun champ ; aide unique sous les lignes : « Le
     prix est repris de la facture, ou à défaut du coût moyen du lieu. Vous
     n'avez rien à saisir. »
6. **Photos (facultatif)** — `StockPhotoCapture` : « Photographier le bon de
   livraison » (`DELIVERY_NOTE`) et « Photographier la marchandise »
   (`GOODS_PHOTO`), envoyées sur le bon après l'enregistrement
   (`targetType = SLIP`, `targetId = slip.id`).

Envoi : `recordStockReceipt` → `POST /stock/receipts` avec `locationId`,
`supplierInvoiceId`, `receiptDate`, `lines[]` (`itemId`, `quantity`,
`supplierInvoiceLineId?`, `unitCost?`), `clientRequestId`. Le bouton
« Enregistrer la réception » reste fermé tant qu'il manque la facture, le
lieu, la date ou une ligne complète.

**Résultat** — la fenêtre ne se ferme pas ; elle passe à un écran de
confirmation :

- titre « Réception enregistrée — {{numéro}} » (« … était déjà enregistrée »
  sur un rejeu) ;
- `controls[]` (contrat `ReceiptControl`) affichés chacun en `<Alert>` :
  `WARNING` → `type="warning"`, `INFO` → `type="info"`, texte = `message` du
  serveur ; montant et seuil seulement s'ils ne sont pas `null` ;
- lignes reçues (article, quantité, « Reste après » selon §3.4 ; prix et
  source du prix si `valuesVisible`) ;
- état d'envoi des photos ;
- boutons : `StockSlipPdfButton`, « Photographier le bon signé » (finalité
  `SIGNED_SLIP`), « Nouvelle réception », « Fermer ».

Le texte d'aide actuel « Le total reçu n'a pas à égaler le montant de la
facture… » (`Stock.tsx:1168-1173`) est gardé si `valuesVisible`.

### 5.4 Fenêtre « Enregistrer une sortie » (B2, B3-R3, A10)

Remplace `Stock.tsx:1276-1482`. Champs :

1. **Chantier** — `FieldContext.sites` dont `closed === false` (un chantier clos
   n'accepte plus de sortie, `Stock.tsx:1404-1406`).
2. **Lieu de sortie** — lieux actifs ; préremplit le lieu du chantier s'il en a
   un, sinon le dernier lieu utilisé (§6.2).
3. **Preneur** — `StockTakerSelect`. Libellé « Qui emporte la marchandise ? ».
   Le texte actuel « Sans nom, le matériau disparaît sans que personne n'en
   réponde » (`Stock.tsx:1454-1459`) est **retiré** : il prête une intention.
   Il devient : « Le preneur est la personne à qui la marchandise est remise.
   Son nom est imprimé sur le bon de sortie, qu'il signe. »
4. **Lignes** (1 à 50) — « Article », « Quantité », « Poste de dépense ». Le
   poste est prérempli par la proposition de l'article et dit comme tel
   (règle `Stock.tsx:611-632`, conservée ligne par ligne). Sous chaque ligne :
   « Stock disponible dans ce lieu : 120 sacs » (lu dans
   `GET /stock/balances?locationId=…`), ou l'état aveugle (§3.4) ; en cas de
   dépassement, l'avertissement existant (`Stock.tsx:1358-1369`). Aperçu de
   valeur (`Stock.tsx:1372-1389`) **par ligne, seulement si `valuesVisible`**.
   Bouton « Ajouter un article ». Deux lignes pour le même article et le même
   poste sont refusées à l'écran (« Cet article est déjà dans la sortie :
   modifiez sa quantité. »).
5. **Date de sortie** — §3.8.
6. **Photo (facultatif)** — marchandise sortie, envoyée sur le bon
   (`SLIP`, `GOODS_PHOTO`).

Envoi : `recordStockIssue` → `POST /stock/issues`, forme `IssueRequest` :
`locationId`, `siteId`, `issueDate`, `lines[]` (`itemId`, `quantity`,
`costCategoryId`), `takerId` **ou** `requestedBy`, `clientRequestId`. Toujours
la forme multi-lignes, même pour un seul article. Aucun champ de valeur.

Résultat : « Sortie enregistrée — {{numéro}} », lignes sorties (avec la
valeur de chaque mouvement telle que le serveur la rend, seulement si
visible : `SlipSummary` ne porte pas de total, et l'écran n'en fabrique pas ;
le total est dans le tiroir du bon, `SlipView.totalValue`), `StockSlipPdfButton`, « Photographier le
bon signé par le preneur » (`SIGNED_SLIP`), rappel « Faites signer le bon par
le preneur, puis photographiez-le. », « Nouvelle sortie », « Fermer ».

### 5.5 Fenêtres « Rebut » et « Retour au fournisseur » (A6, `canDispose`)

**Rebut** — titre « Enregistrer un rebut ». Encadré : « Un rebut retire du
stock une matière détruite ou inutilisable. Il n'est imputé à aucun chantier. »
Champs : lieu, article, quantité (stock disponible affiché), motif
(`StockReasonPicker`, liste `reasonCodes.scrap` : Casse, Détérioration,
Autre), date, photo (`MOVEMENT`, `GOODS_PHOTO`). Envoi `POST /stock/scraps`
(`ScrapRequest`). Succès : « Rebut enregistré : {{quantité}} de {{article}}. »
(+ « pour {{valeur}} » si visible).

**Retour au fournisseur** — titre « Retourner une marchandise au
fournisseur ». Champs : facture validée (même liste et même recherche que
§5.3), puis `getInvoiceReceipts` ; article — **seulement ceux de
`byItem`** ; pour l'article choisi : « Reçu sur cette facture : 100 sacs ·
déjà retourné : 10 sacs · retournable : 90 sacs » (`receivedQuantity`,
`returnedQuantity`, `returnableQuantity` tels que le serveur les rend) ;
« Ligne de la facture » (`invoice.lines` avec `hasUnitPrice`), **obligatoire**
quand `returnNeedsInvoiceLine` est vrai, avec l'aide « Le montant déduit de la
dette du fournisseur est le prix de cette ligne. » ; lieu ; quantité ; motif
(`reasonCodes.supplierReturn` : Non conforme à la commande, Endommagé à la
livraison, Livré en trop, Autre) ; date ; photo (`MOVEMENT`). Encadré : « Le
retour diminue le stock et le solde dû au fournisseur. Il ne modifie pas le
reste à payer affiché sur la facture : rapprochez l'avoir du fournisseur. »
Envoi `POST /stock/supplier-returns` (`SupplierReturnRequest`, avec
`supplierInvoiceLineId` si choisie). `409 STOCK_RETURN_EXCEEDS_RECEIVED` et
`409 STOCK_RETURN_UNVALUED` relayés (le second met en erreur le champ « Ligne
de la facture »).

### 5.6 Onglet « Journal des mouvements » (A5, A4-R4)

Appel : `listStockMovements(tenantId, { …filtres, cursor, limit: 50 })` →
`GET /stock/movements`. **Pagination par curseur** : `DataView` en
`paginated={false}` et, sous la liste, « Charger plus » tant que
`meta.nextCursor` n'est pas nul (forme de
`pages/tenant/TenantActivityLog.tsx:77, 113, 238-241`) ; changer un filtre
repart de la première page. Clé de cache : `queryKey('stock-movements', tenantId, filtres)`,
pages accumulées en état local (pas de `useInfiniteQuery` : le dépôt n'en a
aucun, inutile d'en introduire un).

**Filtres** (`FilterSheet`, `Stock.tsx:925-1005` étendu) : Article, Lieu,
Chantier, Nature (six natures), Du / Au ; et **seulement si `valuesVisible`**
les trois filtres par personne : « Demandeur ou preneur contient » (texte →
`requestedBy`), « Preneur » (`takerId`, liste des preneurs, inactifs compris)
et « Saisi par » (`createdByUserId`, `listMovementAuthors`, chargée à
l'ouverture du filtre). Ces trois filtres sont absents — pas désactivés — sans
`valuesVisible` (le serveur répondrait `403`, spec A5-R2). Le tiroir d'un bon
et le lien d'une alerte filtrent par `slipId` ou `movementId` (pastille de
filtre « Bon BS-2026-00042 » ou « Mouvement du 30/09 », effaçable).

**Colonnes** :

| Colonne                            | Contenu                                                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                               | `movementDate` (JJ/MM/AAAA)                                                                                                                                                                     |
| Saisi le                           | `createdAt` (JJ/MM/AAAA HH:mm) ; si `entryLagDays > 0`, pastille « +{{n}} j » (ton `warning` à partir de 3 jours, sinon `neutral`) et infobulle « Saisi {{n}} jour(s) après la date déclarée. » |
| Nature                             | `StatusTag` (six natures)                                                                                                                                                                       |
| Bon                                | `slipNumber`, lien vers le tiroir `?bon=` ; « — » sinon                                                                                                                                         |
| Article                            | libellé + référence                                                                                                                                                                             |
| Lieu                               | libellé                                                                                                                                                                                         |
| Quantité                           | « + » / « − » selon `isDecrease` (`Stock.tsx:772-779`)                                                                                                                                          |
| Reste après                        | `StockQuantityCell` ; valeur après dessous si visible                                                                                                                                           |
| Prix unitaire, Valeur du mouvement | si visible ; `totalValue` tel quel (`Stock.tsx:786-794`) ; pour un retour, infobulle « Valeur sortie du stock ; montant porté au fournisseur : {{supplierCreditValue}} »                        |
| Chantier imputé                    | inchangé (`Stock.tsx:808-824`)                                                                                                                                                                  |
| Preneur ou demandeur               | `requestedBy` (l'instantané imprimé sur le bon) ; si `takerLabel` existe et diffère : « (aujourd'hui : {{takerLabel}}) » en secondaire                                                          |
| Motif                              | libellé du `reasonCode` + précision ; « Motif libre : … » ; « — »                                                                                                                               |
| Pièce                              | facture fournisseur                                                                                                                                                                             |
| Saisi par                          | `createdByLabel`                                                                                                                                                                                |
| Pièces jointes                     | icône trombone + nombre (`attachmentsCount`), ouvre le tiroir du bon ou une fenêtre de pièces jointes du mouvement                                                                              |

Carte mobile : titre article, sous-titre « date — lieu », statut = nature,
`highlight` = valeur si visible, sinon quantité signée ; champs : Quantité,
Bon, Preneur ou demandeur, Motif, Saisi le (avec la pastille de délai).

**Export** — bouton « Exporter (CSV) » à côté des filtres :
`exportStockMovementsCsv(tenantId, filtres sans curseur)` → `GET /stock/movements/export.csv`,
blob, `saveBlob`, nom repris de `Content-Disposition`
(`journal-stock-AAAA-MM-JJ.csv`). Pendant le téléchargement : bouton en
chargement. Erreur `422` : §3.9. Aide sous le bouton : « Mêmes filtres que la
liste, 50 000 lignes au plus. » (+ « Sans les colonnes de valeur. » si
`!valuesVisible`).

États : vide « Aucun mouvement de stock n'a encore été enregistré. » ; filtré
« Aucun mouvement pour ces filtres. » ; erreur « Impossible de charger le
journal des mouvements. » + Réessayer ; échec de « Charger plus » : message
sous le bouton, les lignes déjà chargées restent.

### 5.7 Tiroir « Bon » (`?bon=<slipId>`)

`Drawer` (pleine largeur sous 768 px, 640 px au-delà). Appel
`getStockSlip(slipId)` → `GET /stock/slips/{slipId}` (`SlipView`). Contenu :
titre « {{libellé de nature}} {{numéro}} » ; « Date du document : … » ;
« Enregistré le … à … (heure du serveur) par … » ; lieu ; chantier ; preneur
ou demandeur ; facture (« FA-… — fournisseur ») ; lignes (article, quantité,
unité, valeurs si visibles) ; `totalValue` si visible ; `StockSlipPdfButton` ;
`StockAttachmentList` + `StockPhotoCapture` (finalités « Bon signé »,
« Photo de la marchandise », « Bon de livraison du fournisseur »), droit
d'ajout selon la nature (`canReceive` pour un BR, `canIssue` pour un BS,
`canValidateCount` pour le PVI signé, spec B5-R6) ; lien « Voir les mouvements
de ce bon » → journal filtré par `slipId`. Un PVI ouvre plutôt le détail de
l'inventaire (`/finance/stock/inventaire?inventaire=<stockCountId>`), où se
trouve le même bloc de pièces jointes.
États : chargement `SkeletonDetail`, `404` « Ce bon est introuvable. »,
erreur + Réessayer.

### 5.8 Tiroir « Réceptions d'une facture » (`?facture=<invoiceId>`)

`getInvoiceReceipts` (`InvoiceReceiptsView`) : en-tête facture (référence,
fournisseur, date, statut, montant si visible) ; réceptions (bon, date, lieu,
auteur, lignes) ; retours ; « Reçu : … · Retourné : … » en valeur si visible.
C'est la cible des alertes `RECEIPT_REPEATED`, `RECEIPT_OVER_INVOICE` et
`RECEIPT_UNVALUED` (§8.2).

## 6. E2 — Magasin, l'écran mobile en trois gestes (`pages/finance/StockMagasin.tsx`, nouveau)

### 6.1 Principes

- Conçu pour un **Android d'entrée de gamme** (écran 360 × 640, réseau 3G
  instable) ; fonctionne tel quel sur ordinateur, centré, 560 px de large au
  plus.
- **Aucun tableau, aucune fenêtre modale empilée** : chaque geste est une
  suite d'étapes plein écran, une question par étape, avec une barre d'action
  collée en bas (« Retour » à gauche en logique `inline-start`, action
  principale à droite).
- **Des listes plutôt que du texte libre** : facture, lieu, chantier,
  preneur, article, motif se choisissent dans des listes à lignes de 56 px
  au moins, avec une recherche en tête dès 8 éléments. Le seul texte libre
  est la précision d'un motif « Autre » et le nom d'un nouveau preneur.
- **Gros boutons** : 48 px au moins pour toute cible, 72 px pour les trois
  gestes ; police 16 px au moins.
- **Rien de lourd** : pas de graphique, pas de bibliothèque nouvelle, pas
  d'image décorative. Un seul appel au chargement (`GET /stock/field-context`,
  B3-R1) ; les soldes ne sont lus qu'à l'étape qui les montre.
- **Pas de valeur**, même pour qui a `valuesVisible` : l'écran du terrain
  parle de quantités. (Les valeurs restent sur E1.)

### 6.2 Accueil de l'écran

```
┌──────────────────────────────────────┐
│ Magasin                              │
│ Lieu : Magasin central   [Changer]   │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ ⬇  Recevoir                      │ │
│ │    Marchandise livrée            │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ⬆  Sortir                        │ │
│ │    Remettre à un chantier        │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ☰  Compter                       │ │
│ │    Inventaire du lieu            │ │
│ └──────────────────────────────────┘ │
│ Autres gestes ▾                      │
│   Transférer vers un autre lieu      │
├──────────────────────────────────────┤
│ Aujourd'hui sur ce lieu              │
│  BS-2026-00057 · 10:42 · 3 articles  │
│  BR-2026-00012 · 08:15 · 2 articles  │
└──────────────────────────────────────┘
```

- **Lieu courant** : choisi une fois, gardé dans `localStorage`
  (`immotopia.stock.lieu.<tenantId>`, lecture et écriture sous `try/catch` ;
  absent ou invalide → demande de choix). Liste des lieux actifs, avec la
  pastille « Comptage en cours » ou « Comptage clos » (`countInProgress`) et
  « Chantier clos » pour le lieu d'un chantier clos.
- **Les trois gestes** : boutons de 72 px, icône, titre, sous-titre. Seuls
  ceux permis apparaissent (`canReceive`, `canIssue`, `canCount`). Aucun
  geste permis : `StateBlock` « Aucun geste de stock ne vous est ouvert » et
  « Votre rôle permet de consulter le stock, pas de l'enregistrer. »
- **Autres gestes** (repliés) : « Transférer vers un autre lieu »
  (`canTransfer`). Le rebut et le retour restent sur E1 (`canDispose` n'est pas
  un droit de magasinier).
- **Aujourd'hui sur ce lieu** : `GET /stock/movements?locationId=<lieu>&from=<aujourd'hui>&to=<aujourd'hui>&limit=20`
  (aucun filtre par personne : interdit sans `STOCK_VALUES_VIEW`). Une ligne par
  bon ou par mouvement sans bon : numéro, heure de saisie, nature, nombre
  d'articles ; toucher une ligne ouvre le bon (§5.7 en plein écran). Vide :
  « Rien n'a encore été enregistré aujourd'hui sur ce lieu. »
- Chargement : squelette des trois boutons. Erreur du contexte : §3.3, avec
  « Réessayer » en bouton pleine largeur.

### 6.3 Geste « Recevoir »

| Étape | Écran                                                             | Détail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | « Quelle facture ? »                                              | Liste de `receivableInvoices` : fournisseur en gras, « FA-… · 28/09/2026 · Chantier Riviera », pastille « Déjà reçue 2 fois ». Recherche par fournisseur ou référence : filtre la liste chargée, puis « Chercher dans toutes les factures » → `searchReceivableInvoices`. Vide : « Aucune facture validée trouvée. La réception exige une facture validée par la comptabilité. » (limite de spec §3.3). Le choix déclenche `getInvoiceReceipts` (réceptions précédentes et lignes de la facture).                                         |
| 1 bis | (si `receiptCount > 0`) « Cette facture a déjà été réceptionnée » | Liste des réceptions précédentes (§5.3 point 2), puis deux boutons : « Continuer : c'est une autre livraison » et « Choisir une autre facture ».                                                                                                                                                                                                                                                                                                                                                                                          |
| 2     | « Où arrive la marchandise ? »                                    | Lieu courant présélectionné ; changer = liste. Le lieu d'un chantier clos n'est pas proposé.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 3     | « Qu'avez-vous reçu ? »                                           | Liste des lignes déjà ajoutées (article, quantité, unité). Bouton « Ajouter un article » → liste cherchable des articles (référence — libellé — unité) → écran quantité (`StockQuantityInput` grand format, unité visible) → « Ajouter ». Facultatif sur l'écran quantité : « Ligne de la facture » (`invoice.lines` lues à l'étape 1, « Je ne sais pas » par défaut). Aucun prix n'est demandé, à personne : la chaîne de prix du serveur s'applique (spec A8-R3), y compris pour un comptable. Toucher une ligne : modifier ou retirer. |
| 4     | « Photos » (facultatif)                                           | « Photographier le bon de livraison », « Photographier la marchandise » ; vignettes. Consigne : « Photographiez la marchandise et les bons, pas les personnes. » Bouton « Passer » visible.                                                                                                                                                                                                                                                                                                                                               |
| 5     | « Vérifiez »                                                      | Facture, lieu, date (aujourd'hui, lien « Changer la date »), lignes. Bouton « Enregistrer la réception ».                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 6     | « Réception enregistrée »                                         | Numéro du bon en grand ; contrôles du serveur (§5.3) ; état des photos ; « Télécharger le bon (PDF) » ; « Photographier le bon signé » ; « Nouvelle réception » ; « Retour au magasin ».                                                                                                                                                                                                                                                                                                                                                  |

### 6.4 Geste « Sortir »

| Étape | Écran                            | Détail                                                                                                                                                                                                                                                                                                                                     |
| ----- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | « Pour quel chantier ? »         | `sites` ouverts. Vide : « Aucun chantier ouvert. »                                                                                                                                                                                                                                                                                         |
| 2     | « Qui emporte la marchandise ? » | Liste des preneurs actifs (nom en gras, équipe dessous), recherche ; en tête « Ajouter un preneur » (`canManageTakers`) → mini-formulaire (§4) ; en bas, si `!requireTaker`, « Saisir un nom sans l'ajouter au carnet ».                                                                                                                   |
| 3     | « Quels articles ? »             | Comme 6.3 étape 3, plus, sur l'écran quantité : « Disponible ici : 120 sacs » (ou l'état aveugle) et l'avertissement de dépassement. Le poste de dépense est prérempli par l'article ; s'il n'en propose pas, une liste « Poste du chantier » apparaît sur l'écran quantité (obligatoire). Lieu de sortie = lieu courant, rappelé en tête. |
| 4     | « Photo » (facultatif)           | marchandise remise.                                                                                                                                                                                                                                                                                                                        |
| 5     | « Vérifiez »                     | Chantier, preneur, lieu, date, lignes. « Enregistrer la sortie ».                                                                                                                                                                                                                                                                          |
| 6     | « Sortie enregistrée »           | Numéro du bon ; « Faites signer le bon par le preneur. » ; « Télécharger le bon (PDF) » ; « Photographier le bon signé » ; « Nouvelle sortie » ; « Retour au magasin ».                                                                                                                                                                    |

`409 STOCK_INSUFFICIENT` ramène à l'étape 3 avec le message du serveur en tête
et la ligne concernée mise en évidence (si le serveur la nomme dans
`data.items` ; sinon message seul).

### 6.5 Geste « Transférer » (autres gestes)

Étapes : lieu d'arrivée (liste ; les lieux des chantiers clos sont grisés avec
« Chantier clos : il ne reçoit plus de marchandise », A7-R4) → article et
quantité (un seul article : `TransferRequest`) → demandeur (`StockTakerSelect`)
→ motif (`StockReasonPicker`, `reasonCodes.transfer`) → photo facultative →
vérification → « Transfert enregistré ». Pas de bon PDF (le contrat n'en
prévoit pas pour un transfert) ; les photos vont sur la moitié sortante
(`TransferResultEnvelope.data.movements[]` dont `isDecrease` est vrai,
`targetType = MOVEMENT`).

### 6.6 Geste « Compter »

| Situation du lieu courant (`countInProgress`) | Écran                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| aucun inventaire                              | « Aucun inventaire en cours sur ce lieu. » + « Commencer l'inventaire » (`canCount`) → confirmation « Commencer un inventaire de {{lieu}} aujourd'hui ? Les quantités attendues ne seront pas affichées pendant le comptage. » → `POST /stock/counts` (`kind: REGULAR`, `countedAt` = aujourd'hui). `409 STOCK_COUNT_ALREADY_OPEN` : rechargement du contexte. |
| `DRAFT`                                       | Écran de comptage (ci-dessous).                                                                                                                                                                                                                                                                                                                                |
| `COUNTED`                                     | Écran de justification (ci-dessous).                                                                                                                                                                                                                                                                                                                           |

**Écran de comptage (`DRAFT`)** — `GET /stock/counts/{countId}` puis :

- `StockBlindBanner` en tête, fixe : « Comptage à l'aveugle. Comptez ce que
  vous voyez : la quantité attendue n'est pas affichée, à personne. »
- Recherche, puis deux sections : « À compter » (articles actifs non encore
  comptés, `FieldContext.items`, triés par référence) et « Déjà comptés
  ({{n}}) » (lignes de l'inventaire : quantité comptée, « compté par
  {{countedByLabel}} à {{heure}} »).
- Toucher un article → écran de saisie : grand `StockQuantityInput`, bouton
  secondaire « Rien trouvé (0) » qui pose 0, bouton « Enregistrer ».
  `PUT …/lines` (`itemId`, `countedQuantity`, `clientRequestId`). Ressaisir
  un article déjà compté remplace sa quantité ; l'écran le dit : « Cette
  quantité remplace celle saisie à {{heure}} par {{nom}}. »
- **Aucun champ motif** à cette étape (refusé par le serveur, A2-R5).
- Section « À compter » : les articles de `toRecount` du lieu sont en tête,
  pastille « À recompter ».
- Barre du bas : « Clore le comptage » (actif dès une ligne, `canCount`) →
  confirmation : « Clore le comptage de {{lieu}} ? {{n}} article(s) compté(s).
  Les articles qui ont du stock ici et que personne n'a comptés apparaîtront
  comme « non comptés » : une personne habilitée devra les écarter. Après la
  clôture, les quantités ne se modifient plus et les écarts s'affichent. » →
  `POST …/close`. `409 STOCK_COUNT_EMPTY` relayé. `409 STOCK_COUNT_INCOMPLETE`
  (inventaire d'ouverture ou de clôture) : « Un inventaire d'ouverture ou de
  clôture doit compter tous les articles présents sur le lieu. Il reste à
  compter : {{liste}}. », chaque article de `data.items` ramenant à sa saisie.
  L'écran ne sait pas quels articles ont du stock (aveugle) : il ne les
  devine pas, il relaie la liste du serveur.

**Écran de justification (`COUNTED`)** — le détail est désormais révélé :

- en tête : « Comptage clos le {{date}} par {{nom}}. Les écarts sont visibles :
  dites ce qui s'est passé pour chacun. »
- section « Écarts à justifier ({{n}}) » : une carte par ligne en écart non
  justifiée et non écartée : article, « Attendu : 100 sacs · Compté : 92 sacs
  · Écart : −8 sacs » (quantités, jamais de valeur sur cet écran), bouton
  « Justifier » → `StockReasonPicker` (`reasonCodes.count` sans
  `OPENING_BALANCE`) + « Ajouter une photo » (`COUNT_LINE`, permis en
  `COUNTED` seulement, B5-R6) → `PUT …/lines/{itemId}/justification`
  (`JustifyLineRequest`).
- section « Écarts justifiés ({{n}}) » : motif, précision, « justifié par …
  à … », possibilité de corriger (même appel).
- section « Non comptés ({{n}}) » (`notCounted`) : article, « Attendu :
  100 sacs · non compté », texte « Une personne habilitée doit écarter cette
  ligne ou faire recompter l'article. » Aucun bouton pour le magasinier.
- section repliée « Sans écart ({{n}}) ».
- quand tout est justifié : « Tous les écarts sont justifiés. Une personne
  habilitée doit maintenant valider l'inventaire. » ; si `canValidateCount`,
  bouton « Ouvrir l'inventaire pour le valider » →
  `/finance/stock/inventaire?inventaire=<countId>` (la validation, avec ses
  contrôles A1/A3, vit sur E3, responsive).

### 6.7 États communs du geste

- Quitter un geste commencé (bouton retour du navigateur ou « Retour » à la
  première étape) : confirmation « Abandonner cette saisie ? Rien n'a encore été
  enregistré. » (sauf après l'étape « enregistré »).
- Brouillon du geste gardé en mémoire de page seulement (pas de stockage
  durable, D3) ; il survit au changement d'étape, pas à la fermeture de
  l'onglet.
- Pendant l'envoi : bouton en chargement, autres boutons inactifs, texte
  « Envoi en cours… Ne fermez pas l'écran. »
- Photos : envoi **après** l'opération, une par une ; un échec ne remet pas
  l'opération en cause : « L'opération est enregistrée. 1 photo n'a pas pu être
  envoyée. » + « Réessayer l'envoi » (sans doublon : un `clientRequestId` par photo,
  Q4).

## 7. E3 — Transferts et inventaire (`pages/finance/StockInventaire.tsx`, modifié)

### 7.1 Onglet « Transfert entre lieux » (A11, A7-R4)

Ajouts au formulaire actuel (`StockInventaire.tsx:474-611`) :

- **Lieu d'arrivée** : les lieux des chantiers clos restent dans la liste mais
  désactivés, suffixe « (chantier clos) ».
- **Demandeur** : `StockTakerSelect`, libellé « Qui demande ou emporte ce
  transfert ? », obligatoire.
- **Motif** : liste `reasonCodes.transfer` (Approvisionnement d'un chantier,
  Retour au magasin, Évacuation d'un chantier, Rééquilibrage entre lieux,
  Autre) + précision si « Autre ».
- **Date** : §3.8.
- « Au lieu d'origine, il reste … » (`:568-583`) : état aveugle si le lieu
  d'origine est en comptage ; le texte « C'est une prévenance de lecture… »
  passe par `t()` (il est aujourd'hui en dur, `:578`).

Corps : `fromLocationId`, `toLocationId`, `itemId`, `quantity`,
`transferDate`, `takerId` ou `requestedBy`, `reasonCode`, `reason?`,
`clientRequestId`.

Résultat (`:613-641`) : « Valeur déplacée » (`StatCard`) seulement si
`valuesVisible` ; « il y reste » selon §3.4 ; demandeur et motif rappelés ;
`StockPhotoCapture` sur la moitié sortante.

### 7.2 Onglet « Inventaire physique » — la liste

`GET /stock/counts` (`locationId`, `status`, `kind`).

| Colonne           | Contenu                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Lieu              | libellé                                                                                           |
| Nature            | Inventaire courant / d'ouverture / de clôture                                                     |
| Compté le         | `countedAt`                                                                                       |
| État              | §3.6 ; « Validé sans second regard » en pastille de plus quand `selfValidated`                    |
| Lignes            | `linesCount`                                                                                      |
| Lignes en écart   | `varianceCount`, ou « Masqué » quand `blind`                                                      |
| Valeur de l'écart | si visible et non `blind` : `varianceValueNet` signée ; « estimée » en secondaire pour `COUNTED`  |
| Ouvert par        | `createdByLabel`                                                                                  |
| Validé par        | `validatedByLabel`                                                                                |
| Actions           | « Poursuivre le comptage » (`DRAFT`), « Justifier les écarts » (`COUNTED`), « Consulter » (sinon) |

Filtre « État » : les quatre statuts (aujourd'hui deux, `:1074-1077`) ;
filtre « Nature ». Bouton « Ouvrir un inventaire » (`canCount`). Encadré de
tête, remplaçant `:1034-1042` : « Un inventaire se compte à l'aveugle, se clôt,
se justifie, puis se valide par une autre personne que celle qui a compté. Rien
ne bouge dans le stock avant la validation. »

### 7.3 Fenêtre « Ouvrir un inventaire »

Champs : « Lieu à compter » (les lieux portant déjà un inventaire en cours ou
clos sont désactivés avec « inventaire en cours »), « Nature » (Inventaire
courant ; d'ouverture — proposé **seulement** quand le lieu porte
`openingCountSuggested` (lieu de chantier basculé depuis moins de 30 jours,
spec A7-R1) ; de clôture — seulement pour un lieu de chantier,
`kind === 'SITE'`), « Date du comptage » (§3.8). Si le lieu a des articles à
recompter (`LocationView.toRecount`), la fenêtre les liste : « À recompter
depuis le dernier inventaire : {{liste}}. » Textes :
« Le comptage se fait à l'aveugle : personne ne verra la quantité attendue avant
sa clôture. » ; pour l'ouverture : « L'inventaire d'ouverture constate ce qui se
trouve déjà sur le lieu. Un surplus y entre sans valeur : sa matière a déjà été
payée par les factures du chantier. » ; pour la clôture : « L'inventaire de
clôture permet de clôturer le chantier quand du stock reste sur son lieu. »
Le texte actuel sur « deux vérités » (`:1183-1187`) est gardé.
`POST /stock/counts` (`CreateCountRequest`). `409 STOCK_OPENING_COUNT_EXISTS`,
`STOCK_OPENING_COUNT_NOT_ALLOWED` et `STOCK_COUNT_ALREADY_OPEN` relayés.
Préremplissage par `?ouvrir=…&lieu=…`. Texte de la clôture complété : « Il doit
compter tous les articles présents sur le lieu. » ; de l'ouverture : « Les
manques constatés se justifient comme dans tout inventaire. »

### 7.4 Détail d'un inventaire en cours (`DRAFT`)

- `StockBlindBanner` : titre « Comptage à l'aveugle » ; texte « Pendant le
  comptage, personne ne voit la quantité attendue ni l'écart, pas même un
  administrateur. Ils apparaîtront à la clôture du comptage. »
- Statistiques : « Articles comptés » (`linesCount`), « Compteurs »
  (`CountView.counters` : toutes les personnes qui ont saisi une ligne, même
  remplacée). **Plus de « Lignes en écart » ni de « Valeur de l'écart »**
  (`:802-817`) : le serveur les rend `null`.
- Si l'utilisateur connecté a `canValidateCount` : bandeau `info` « Vous voyez
  le stock de ce lieu : les lignes que vous saisirez seront marquées « comptées
  sans aveugle » sur le procès-verbal. » (spec A2-R9).
- Formulaire de saisie (`:820-906`) : article, quantité comptée, « Enregistrer
  le comptage ». **Supprimés** : le champ « Motif de l'écart » (`:867-878`,
  dont le texte d'exemple contient un mot interdit), le paragraphe « Le système
  dit qu'il y a … » (`:885-896`), et la phrase « Le motif peut attendre… »
  (`:902-905`). Nouveau texte : « Saisir le même article une seconde fois
  remplace son comptage. Le motif d'un écart se donne après la clôture du
  comptage. »
- Tableau des lignes : Article, Compté, Compté par, Saisi à, Actions
  (« Reprendre », « Retirer », `canCount`). Carte mobile : titre référence,
  `highlight` = quantité comptée, champs « Compté par », « Saisi à ».
- Actions : « Clore le comptage » (`canCount`, primaire, confirmation de §6.6) ;
  « Abandonner l'inventaire » (`canValidateCount`, bouton `danger`
  secondaire) → fenêtre « Abandonner cet inventaire ? » : « Un inventaire
  abandonné ne s'ajuste pas, et ses quantités attendues ne sont pas affichées
  à l'écran. S'il a déjà des lignes, l'abandon est signalé aux responsables du
  stock et ses quantités restent dans le journal d'activité. Le lieu pourra
  être compté à nouveau. » + « Motif » (3 à 500, obligatoire) →
  `POST …/cancel`.

### 7.5 Détail d'un inventaire clos (`COUNTED`) — justifier

- Bandeau `warning` : « Comptage clos le {{date}} par {{nom}} : les écarts sont
  visibles. Chaque écart doit être justifié avant la validation. »
- Statistiques : « Articles comptés », « Lignes en écart », « Écarts à
  justifier » (lignes en écart, non écartées, `justified === false`), « Non
  comptés » (`uncountedLinesCount`, lignes non écartées), et si visible
  « Valeur estimée de l'écart » (`varianceValueNet`, aide « Estimée au coût
  moyen actuel ; figée à la validation. »).
- Tableau : Article, « Ce que le système disait » (`expectedQuantity`, en-tête
  et aide existants `:683-689` gardés), Compté, Écart (`formatVariance`, ton
  `warning` si non justifié, neutre sinon — jamais rouge), Valeur de l'écart
  (si visible), Compté par, Motif (libellé + précision, « Écart à justifier »
  en `warning`, « Aucun écart », « Motif libre : … », « Écartée : … »),
  Pièces jointes (nombre), Actions.
- Actions par ligne : « Justifier » / « Modifier le motif » (`canCount` ou
  `canValidateCount`, ligne en écart non écartée) → fenêtre « Justifier
  l'écart de {{article}} » : rappel « Attendu … · Compté … · Écart … »,
  `StockReasonPicker`, `StockPhotoCapture` (`COUNT_LINE`), « Enregistrer le
  motif ». « Écarter la ligne » (`canValidateCount`) → fenêtre : « Écarter
  cette ligne ? Elle ne sera pas ajustée et figurera au procès-verbal dans les
  lignes écartées. Faites recompter l'article dans un nouvel inventaire. » +
  « Motif » (3 à 500) → `POST …/set-aside`.
- Lignes non comptées : pastille « Non compté », colonnes Compté et Écart
  « — non compté », action « Écarter la ligne » (`canValidateCount`) ; au-dessus
  du tableau, si `canValidateCount` et qu'il en reste : bouton « Écarter tous
  les articles non comptés » → fenêtre « Écarter les {{n}} articles non
  comptés ? Ils ne seront pas ajustés, figureront au procès-verbal et seront à
  recompter. La mise à l'écart est signalée aux responsables du stock. » +
  « Motif » (3 à 500, ex. « Inventaire tournant : seuls les ciments étaient à
  compter ») → `setAsideUncountedLines`.
- Mention, sous le tableau : « Un motif décrit ce que vous constatez. Il ne met
  personne en cause, et aucune retenue n'en découle. » ; et sous l'action
  « Écarter » : « Écarter une ligne n'efface pas son écart : il reste compté
  dans le contrôle de l'inventaire. »

### 7.6 Validation (A1, A3, A4)

Bloc « Valider l'inventaire » (visible en `COUNTED` pour `canValidateCount`) :

1. **Lignes restant à justifier** — liste calculée par `lignesSansMotif` (§3.1)
   pour prévenir, et bouton fermé tant qu'il en reste (comme `:962-990`). Le
   texte `:975-977` (« … casse, perte, vol, erreur de saisie. ») est remplacé :
   « Chaque écart doit recevoir un motif avant la validation : choisissez ce qui
   décrit le mieux ce que vous constatez. »
2. **Quatre yeux, prévenus avant le clic** — lus dans `CountView.validation`
   (calculé par le serveur, spec A1-R5) :
   - `callerIsCounter` vrai et `selfValidationAllowed` faux : `<Alert
type="info" message={t('Vous avez compté des lignes de cet inventaire')}
description={t("Une autre personne habilitée de l'agence doit le valider.")} />`,
     bouton « Valider » fermé ;
   - `callerIsCounter` vrai et `selfValidationAllowed` vrai : même titre,
     description « Personne d'autre dans l'agence ne peut valider cet
     inventaire. Vous pouvez le valider en indiquant pourquoi : la validation
     sera signalée. », et le bouton ouvre directement la fenêtre « Valider sans
     second regard » (point 4) ;
   - sinon : rien.
     Le flux en deux temps sur `403` / `400` reste géré (rôle changé entre deux
     lectures).
     2 bis. **Lignes non comptées** — tant qu'il en reste de non écartées, bouton
     fermé et rappel « {{n}} article(s) non compté(s) à écarter avant la
     validation. »
3. **Confirmation** — remplace `:993-1015` (le texte actuel décrit l'écrasement
   qu'A3 supprime) : titre « Valider l'inventaire de « {{lieu}} » ? » ; texte
   « Chaque écart justifié devient un ajustement, appliqué au stock actuel du
   lieu. Les mouvements enregistrés depuis le comptage sont conservés. Un
   inventaire validé ne s'annule pas : une erreur se corrige par un nouvel
   inventaire. Aucun chantier n'est imputé. » → `POST …/validate`, corps vide.
4. **Réponses** :
   - `403 STOCK_COUNT_SELF_VALIDATION_FORBIDDEN` → alerte persistante :
     « Vous avez compté cet inventaire : une autre personne habilitée de l'agence
     doit le valider. »
   - `400 STOCK_COUNT_SELF_VALIDATION_REASON_REQUIRED` → fenêtre « Valider sans
     second regard » : « Personne d'autre dans l'agence ne peut valider cet
     inventaire. Vous pouvez le valider vous-même : la validation sera signalée
     dans le procès-verbal, le journal d'activité et les alertes. » + « Pourquoi
     validez-vous seul ? » (`TextArea`, 10 à 500, compteur) → `POST …/validate`
     `{ selfValidationReason }`.
   - `409 STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS` → alerte : « Des mouvements
     enregistrés depuis le comptage ont fait baisser le stock de ces articles
     plus que ce qui a été compté : {{liste}}. Écartez ces lignes et faites-les
     recompter dans un nouvel inventaire. » Chaque article de la liste porte un
     lien « Écarter la ligne ».
   - `409 STOCK_COUNT_UNJUSTIFIED_VARIANCE` → liste du point 1 rafraîchie.
   - `409 STOCK_COUNT_UNCOUNTED_LINES` → rappel du point 2 bis, inventaire
     relu.

### 7.7 Détail d'un inventaire validé (`VALIDATED`)

- Bandeau `success` : « Inventaire validé le {{date}} par {{nom}}. Les écarts
  sont devenus des ajustements de stock. » ; texte d'irréversibilité existant
  (`:788-790`) gardé.
- Si `selfValidated` : `<Alert type="info" message={t('Validé sans second regard')}
description={t('Cet inventaire a été validé par une personne qui l’a aussi compté. Motif donné : « {{motif}} ».')} />`.
- Statistiques : Articles comptés, Lignes en écart, Non comptés, et si visible
  « Valeur comptée » (`countedValue`), « Écart brut » (`varianceValueGross`,
  aide « Somme des écarts, manques et surplus confondus »), « Écart net »
  (`varianceValueNet`, signé), « Écart des lignes écartées »
  (`setAsideVarianceValue`), tous « figés à la validation ».
- Les lignes `countedBlind === false` portent la mention « Comptée par une
  personne qui voyait le stock ».
- Tableau : colonnes de §7.5 + « Mouvements depuis le comptage »
  (`movementsSinceCapture`, aide « Mouvements de cet article sur ce lieu entre
  la saisie de la ligne et la validation. Ils ont été conservés. » ; « Non
  mesuré » quand il vaut `null`, ligne antérieure au contrôle) ; sections
  « Lignes écartées » et « Non comptés » à part.
- Inventaire validé avant le lot : le bouton du procès-verbal reste, le PDF
  est « antérieur à la numérotation » (spec B4-R3 bis).
- Bouton « Télécharger le procès-verbal (PDF) » (`slip.number`, `PVI-…`).
- Inventaire d'ouverture : mention « Inventaire d'ouverture : les surplus sont
  entrés sans valeur. »

### 7.8 Détail d'un inventaire abandonné (`CANCELLED`)

Bandeau `neutral` : « Inventaire abandonné le {{date}}. Motif : {{motif}}. Les
quantités attendues ne sont pas affichées ; elles restent consultables dans le
journal d'activité de l'agence. » ; tableau des lignes comptées seulement
(Article, Compté, Compté par).

## 8. E5 — Contrôle (`pages/finance/StockControle.tsx`, nouveau)

`PageHeader` « Contrôle du stock », sous-titre « Alertes, indicateurs et
réglages ». Trois onglets (`Tabs`, clé dans `?onglet=`). Sous l'en-tête,
toujours : « Une alerte ou un indicateur signale un fait au-dessus d'un seuil.
Il ne désigne personne et n'interdit rien : c'est à vous de regarder et de
qualifier. »

### 8.1 Accès

| Onglet               | Lecture             | Écriture                  | Sans le droit                                                                                                                                                          |
| -------------------- | ------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alertes              | `STOCK_ALERTS_VIEW` | idem                      | onglet retiré si `!abilities.canViewAlerts` ; un `403` inattendu → `StateBlock variant="forbidden"` « Les alertes du stock sont réservées aux responsables du stock. » |
| Indicateurs          | `STOCK_VALUES_VIEW` | —                         | onglet retiré si `!valuesVisible`                                                                                                                                      |
| Réglages de contrôle | `STOCK_VALUES_VIEW` | `FINANCE_SETTINGS_MANAGE` | onglet retiré si `!valuesVisible` ; formulaire en lecture seule si `!abilities.canManageSettings` (et sur un `403` inattendu)                                          |

Un magasinier (ni alertes, ni valeurs) n'a donc aucun onglet : la page entière
affiche `StateBlock variant="forbidden"` « Cet écran est réservé aux
responsables du stock. » et un bouton « Aller à l'écran Magasin », sans appeler
les routes d'alertes. L'onglet par défaut est le premier visible.

### 8.2 Onglet « Alertes » (B7)

Appel : `listStockAlerts` → `GET /stock/alerts` (`status`, `kind`, `siteId`,
`locationId`, `from`, `to`, `cursor`, `limit=50`), « Charger plus » sur
`meta.nextCursor`.

Filtres : « Statut » (À traiter — défaut, `OPEN` ; Traitées ; Toutes), « Nature »
(§3.6), « Chantier », « Lieu », « Du », « Au ».

| Colonne         | Contenu                                                           |
| --------------- | ----------------------------------------------------------------- |
| Gravité         | `StatusTag` « À regarder » / « Information »                      |
| Alerte          | `title` en gras, `message` dessous (tels que le serveur les rend) |
| Montant · seuil | `MoneyValue` de `amount` et « seuil {{threshold}} » si non nuls   |
| Où              | chantier et/ou lieu                                               |
| Objet           | `subjectLabel`, lien selon `subjectType` (tableau ci-dessous)     |
| Levée le        | `raisedAt` (date et heure)                                        |
| Statut          | « À traiter » / « Traitée le … par … » + note                     |
| Action          | « Marquer comme traitée » (`OPEN`)                                |

| `subjectType`     | Lien                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StockSlip`       | `/finance/stock?bon=<subjectId>`                                                                                                                        |
| `StockCount`      | `/finance/stock/inventaire?inventaire=<subjectId>`                                                                                                      |
| `StockMovement`   | `/finance/stock?onglet=journal&mouvement=<subjectId>` (filtre `movementId`, §5.6)                                                                       |
| `SupplierInvoice` | `/finance/stock?facture=<subjectId>` (§5.8)                                                                                                             |
| `CashVoucher`     | `/finance/chantiers/<site.id>` (aucune route web n'ouvre une pièce de caisse par son identifiant ; `PieceDeCaisse.tsx:89-90` ne lit que `?chantierId=`) |

« Marquer comme traitée » → fenêtre : « Marquer l'alerte comme traitée ? Elle
quittera la file « À traiter » et restera consultable. » + « Note (facultative) »
(1 000 caractères) → `POST …/acknowledge`. Aucune suppression n'est offerte
(B7-R4).

`?alerte=<id>` : la ligne est mise en évidence (fond `--color-warning-bg`) et
défilée en vue ; si elle n'est pas dans la première page (alerte ancienne),
l'écran passe le filtre statut à « Toutes ».

Carte mobile : titre = `title`, statut = gravité, `highlight` = montant,
champs : Où, Objet, Levée le ; `primaryAction` « Marquer comme traitée ».

Natures nouvelles en révision 2 (libellés du filtre, §3.6) :
`COUNT_LINE_SET_ASIDE` « Lignes d'inventaire écartées », `COUNT_CANCELLED`
« Inventaire abandonné » (objet `StockCount`, lien `?inventaire=`). Pour
`LARGE_SCRAP` et `CASH_MATERIAL_PURCHASE`, `mode = MONTHLY_CUMUL` ajoute sous
le titre « Cumul du mois » (le message du serveur le dit déjà ; l'écran
n'ajoute que la pastille).

États : vide (`OPEN`) « Aucune alerte à traiter. » ; vide (autre filtre)
« Aucune alerte pour ces filtres. » ; erreur + Réessayer.

### 8.3 Onglet « Indicateurs » (B8)

Appel : `getStockIndicators` → `GET /stock/indicators?from=AAAA-MM&to=AAAA-MM&locationId=`.
Période par défaut : les six derniers mois, mois courant compris ; sélecteur
`DatePicker.RangePicker picker="month"`, 24 mois au plus (au-delà, bouton
« Afficher » fermé et aide « 24 mois au plus. »).

Haut de l'onglet — quatre `StatCard` sur le **dernier mois** de `totals` :

| Carte                                      | Valeur                                   | Aide                                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Taux d'écart                               | `varianceRate` en % (1 décimale)         | « Écarts des inventaires validés rapportés à la valeur comptée. Hors inventaires d'ouverture. » ; « — » et « Aucun inventaire validé ce mois-ci. » si `null` |
| Sorties avec preneur identifié             | `takerShare` en %                        | « Sorties dont le preneur vient du carnet. »                                                                                                                 |
| Inventaires validés par une autre personne | `otherValidatorShare` en %               | « Inventaires validés par quelqu'un qui n'a pas compté. »                                                                                                    |
| Délai moyen de saisie                      | `averageEntryLagDays` (1 décimale) « j » | « Écart moyen entre la date déclarée et le jour de saisie. Saisis le jour même : {{sameDayShare}} %. »                                                       |

Puis un tableau **par mois** (`totals`) : Mois, Taux d'écart (dont lignes
écartées, `setAsideVarianceValue`), Lignes non comptées (`uncountedLines`),
Lignes comptées à l'aveugle (`blindLineShare`), Inventaires validés (dont par
une autre personne), Sorties (dont avec preneur), Rebuts (`scrapValue`, et
`scrapShare` en %), Délai moyen de saisie, Saisies le jour même. Puis un
tableau **par lieu et par mois** (`rows`), filtrable par lieu, mêmes colonnes. Cartes mobiles : un mois par carte. Aucun
graphique (pas de bibliothèque dans ce lot) ; les pourcentages sont rendus par
`Intl.NumberFormat` (`style: 'percent'`) de la langue active.

Note de bas d'onglet quand un `countsWithoutFrozenValues > 0` sur la période :
« {{n}} inventaire(s) validé(s) avant la mise en place de ce contrôle ne sont pas
comptés dans le taux d'écart : leurs valeurs n'ont pas été figées. »
Rappel permanent : « Ces indicateurs portent sur des lieux et des mois, jamais
sur des personnes. »

Aucun calcul à l'écran : chaque chiffre vient de la réponse, y compris les
parts.

### 8.4 Onglet « Réglages de contrôle » (A5-R4, B2-R3, B7, A9)

Appel : `getStockControls` → `GET /stock/settings/controls` ; envoi
`updateStockControls` → `PATCH` avec les **seuls champs modifiés**.

| Champ                                        | Contrôle                                                   | Aide                                                                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Antériorité maximale d'une date de mouvement | `InputNumber` 0 à 365, suffixe « jours »                   | « Une réception, une sortie ou un inventaire ne peut pas être daté de plus loin. Pour reprendre un historique, relevez la borne le temps de l'import, puis remettez-la. » |
| Exiger un preneur du carnet                  | `Switch`                                                   | « Activé : chaque sortie et chaque transfert doit nommer un preneur du carnet. Désactivé : un nom saisi à la main suffit. »                                               |
| Sortie importante                            | montant FCFA + case « Désactiver cette alerte »            | « Alerte quand un bon de sortie ou un rebut atteint ce montant. »                                                                                                         |
| Écart d'inventaire — montant                 | montant FCFA + « Désactiver »                              | « Alerte quand l'écart d'un inventaire validé atteint ce montant… »                                                                                                       |
| Écart d'inventaire — taux                    | 0 à 100 % + « Désactiver »                                 | « … ou ce pourcentage de la valeur comptée. »                                                                                                                             |
| Achats de matériaux en espèces               | montant FCFA + « Désactiver »                              | « Alerte quand une pièce de caisse de matériaux, ou leur cumul du mois sur un chantier, atteint ce montant. »                                                             |
| Postes « matériaux »                         | `Select mode="multiple"` sur `FieldContext.costCategories` | Liste vide : « Postes retenus faute de choix : {{effectiveMaterialCostCategoryIds en libellés}} (postes proposés par vos articles). »                                     |

« Désactiver » envoie `null` (contrat `ControlsSettingsPatch`). Les montants
utilisent `montantSaisiProps` (`utils/montant-saisi.ts`, déjà employé par
`Stock.tsx:1249`). Pied : « Modifié le {{updatedAt}} par {{updatedByLabel}}. »
Encadré : « Les seuils proposés sont des points de départ. Ajustez-les à la
taille de vos chantiers. » Enregistrement : « Réglages enregistrés. » ;
`403` → formulaire passé en lecture seule et « Seule une personne qui peut
paramétrer la finance de l'agence peut modifier ces réglages. »

## 9. E4 — Carnet des preneurs (`pages/finance/StockPreneurs.tsx`, nouveau)

`PageHeader` « Preneurs », sous-titre « Les personnes qui emportent la
marchandise ». Appel : `listStockTakers` → `GET /stock/takers?onlyActive&search`.

- Filtres : recherche (nom, équipe), case « Afficher les preneurs désactivés »
  (`onlyActive=false`).
- Tableau : Nom, Équipe ou entreprise, Téléphone (**seulement si
  `canManageTakers`** : le serveur rend `phone = null` aux autres, spec B2-R6),
  Lié à (`linkedPersonLabel`), Statut (Actif / Désactivé), Actions
  (« Corriger », « Désactiver » / « Réactiver », « Effacer le téléphone » s'il y
  en a un), ces actions seulement si `canManageTakers`.
- Carte mobile : titre nom, sous-titre équipe, statut, champs téléphone et
  lien, `primaryAction` « Corriger ».
- « Ajouter un preneur » (`canManageTakers`) → fenêtre `StockTakerForm`.
  `POST /stock/takers`. `409 STOCK_TAKER_DUPLICATE` → « Un preneur actif porte
  déjà ce nom dans cette équipe. » + bouton « Voir ce preneur » (filtre sur
  `existingTakerId`).
- Corriger → `PATCH /stock/takers/{id}` (champs modifiés seulement). Désactiver
  → confirmation « Désactiver {{nom}} ? Il ne pourra plus être choisi pour une
  sortie. Ses sorties passées restent à son nom. » → `PATCH { isActive: false }`.
  Effacer le téléphone → `PATCH { phone: null }`.
- Encadré d'information (spec §10), toujours visible : « Les sorties et les
  transferts sont enregistrés au nom du preneur, et son nom est imprimé sur les
  bons. Informez les personnes concernées. Le carnet ne garde que le nom,
  l'équipe et, si vous le souhaitez, un téléphone, que vous pouvez effacer à
  tout moment. »
- États : vide « Le carnet est vide. Ajoutez les chefs d'équipe et les
  tâcherons qui viennent chercher la marchandise. » ; erreur + Réessayer.

## 10. E6 à E12 — Retouches des écrans voisins

### 10.1 E6 — Articles et lieux (`StockReferentiel.tsx`)

- Désactiver un lieu qui porte un inventaire en cours : le serveur répond
  `409 STOCK_COUNT_IN_PROGRESS` ; message relayé. La liste des lieux affiche la
  pastille « Comptage en cours » / « Comptage clos » (`LocationView.countInProgress`).
- Changer l'unité d'un article : avertissement sous le champ dans la fenêtre de
  correction, seulement si l'unité est modifiée : « Changer l'unité ne
  convertit pas les quantités déjà en stock. Vérifiez par un inventaire. »
  (limite de spec §3.3, motif « Confusion d'unité »).
- Les boutons d'écriture (`FINANCE_SETTINGS_MANAGE`) ne s'affichent que si
  `abilities.canManageSettings` ; un `403` inattendu est relayé. Les lectures
  des postes et des chantiers (`StockReferentiel.tsx:236-245`) ne sont faites
  que si `canManageSettings` (elles ne servent qu'aux formulaires d'écriture,
  et échoueraient en `403` pour un magasinier).

### 10.2 E7 — Stock du chantier (`StockChantier.tsx`)

- **Inventaire d'ouverture (A7-R1)** : si `statut.openingCountSuggested`,
  `<Alert type="info">` sous le bandeau « passé au stock » : titre « Faites
  l'inventaire d'ouverture de ce lieu », texte « Il constate ce qui s'y trouve
  déjà. Les quantités trouvées entrent dans le stock sans valeur, puisque leurs
  factures ont déjà été imputées au chantier. », bouton « Faire l'inventaire
  d'ouverture » → `/finance/stock/inventaire?ouvrir=OPENING&lieu=<stockLocationId>`.
  Le message de succès de la bascule (`:240-246`) ajoute : « Pensez à faire
  l'inventaire d'ouverture. »
- **Rapprochement** : deux colonnes descriptives après « Consommé » :
  « Retourné au fournisseur » (`returnedToSupplierQuantity` / `Value`) et
  « Mis au rebut » (`scrappedQuantity` / `Value`), même `CelluleFlux`
  (`:178-188`) ; ajoutées aux cartes mobiles. Le paragraphe « Ces quatre
  colonnes ne se soustraient pas entre elles » (`:581`) devient « Ces colonnes
  ne se soustraient pas entre elles ». Aucun mot de la liste du test de
  doctrine (`__tests__/finance/stock-chantier.test.tsx:474-493` : perte, vol,
  anomalie, manquant, injustifié, non justifié, fraude, détournement, suspect)
  n'apparaît : la formule de l'écart et ses deux lectures restent intactes.
- **Aveugle** : pendant un comptage du lieu du chantier, la réponse rend
  `remainingQuantity` et `remainingValue` à `null` pour un appelant sans
  `STOCK_COUNT_VALIDATE` (spec §8.2) ; la colonne « Restant » affiche alors la
  pastille « Comptage en cours » (`StockQuantityCell`), et le total restant de
  l'en-tête aussi. Le service lit désormais `{ data, meta }`.

### 10.3 E8 — Clôture du chantier (`ClotureChantier.tsx`)

La liste des bloqueurs (`:864-886`) reste le message du serveur tel quel ; un
bloqueur de stock reçoit en plus un lien d'action :

| `documentType`                | Lien                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `STOCK_COUNT`                 | « Ouvrir l'inventaire » → `/finance/stock/inventaire?inventaire=<documentIds[0]>`                               |
| `STOCK_RESIDUAL`              | « Transférer le reste vers un magasin » → `/finance/stock/inventaire?onglet=transfert&origine=<documentIds[0]>` |
| `STOCK_CLOSING_COUNT_MISSING` | « Faire l'inventaire de clôture » → `/finance/stock/inventaire?ouvrir=CLOSING&lieu=<documentIds[0]>`            |

Les deux bloqueurs de stock se lisent dans l'ordre du parcours (spec A7-R3) :
d'abord l'inventaire de clôture, puis le transfert du reste. Quand les deux
sont présents, l'écran affiche au-dessus de la liste : « Faites d'abord
l'inventaire de clôture du lieu de stockage, puis transférez ce qui reste vers
un magasin. »

Le titre « {{n}} raison(s) empêche(nt) de clôturer ce chantier ({{total}} pièce(s)
concernée(s)) » (`:868-879`) additionne des pièces et, pour `STOCK_RESIDUAL`,
des articles (`count` = nombre d'articles, contrat `ClosureBlocker`) : le total
exclut désormais les bloqueurs de stock, et le texte de succès « Aucune pièce en
brouillon ne le vise. » devient « Aucune pièce en brouillon ni aucun stock ne le
vise. » (les deux textes changent de clé : traductions à reporter, §13).

### 10.4 E9 — Accueil, file « À traiter » (B7-R5)

- `services/dashboard-service.ts:30` : `DashboardTaskKind` reçoit
  `'STOCK_ALERT'`.
- `components/home/HomeFeeds.tsx:49-53` : `ICONE_TACHE.STOCK_ALERT = <InboxOutlined />`
  (le `Record` l'impose, sinon la compilation casse).
- `pages/Dashboard.tsx:661-663` : filtre inchangé (le serveur n'émet la nature
  qu'avec `CONSTRUCTION`).
- `href` émis par le serveur : `/tenant/<tenantId>/finance/stock/controle?alerte=<alertId>`
  (contrat aligné en révision 2, Q7) ; aucune redirection à ajouter.
- Texte de la file vide (`HomeFeeds.tsx:82`) inchangé.

### 10.5 E10 — Rôles et permissions (`constants/permissions-labels.ts`)

- `ROLE_LABELS_FR.TENANT_STOREKEEPER` : nom « Magasinier », description
  « Reçoit, sort, transfère et compte le stock, et tient le carnet des preneurs.
  Ne voit ni les valeurs du stock ni la comptabilité. » Les écrans d'invitation
  et de fiche collaborateur lisent les rôles de l'API et ces libellés
  (`pages/tenant/InviteCollaborator.tsx:43, 199-203`,
  `pages/tenant/CollaboratorDetail.tsx:72, 195-199`) : rien d'autre à faire.
- `PERMISSION_GROUP_LABELS_FR.STOCK` : « Stock de chantier ».
- `PERMISSION_LABELS_FR` :

| Clé                    | Libellé                      | Description                                                                                      |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `STOCK_VIEW`           | Consulter le stock           | Articles, lieux, quantités, mouvements, inventaires, preneurs et bons. Sans les valeurs.         |
| `STOCK_VALUES_VIEW`    | Voir les valeurs du stock    | Coûts, valeurs, écarts valorisés, indicateurs et filtres du journal par personne.                |
| `STOCK_RECEIVE`        | Recevoir                     | Enregistrer une réception sur une facture validée.                                               |
| `STOCK_ISSUE`          | Sortir                       | Enregistrer une sortie vers un chantier.                                                         |
| `STOCK_TRANSFER`       | Transférer                   | Déplacer du stock d'un lieu à un autre.                                                          |
| `STOCK_COUNT`          | Compter                      | Ouvrir, compter, clore et justifier un inventaire.                                               |
| `STOCK_TAKERS_MANAGE`  | Tenir le carnet des preneurs | Ajouter, corriger et désactiver des preneurs.                                                    |
| `STOCK_COUNT_VALIDATE` | Valider les inventaires      | Valider ou abandonner un inventaire, écarter une ligne ; voir les quantités pendant un comptage. |
| `STOCK_DISPOSE`        | Rebuts et retours            | Enregistrer un rebut ou un retour au fournisseur, retirer une pièce jointe.                      |
| `STOCK_ALERTS_VIEW`    | Alertes de stock             | Consulter et traiter les alertes, et les recevoir par e-mail.                                    |

### 10.6 E11 — Journal d'activité (`constants/audit-labels.ts`)

`AUDIT_ACTION_LABELS_FR` reçoit les 22 clés de spec §B6-R1, par exemple :
`STOCK_RECEIPT_RECORDED` « Enregistrement d'une réception de stock (bon de
réception) », `STOCK_ISSUE_RECORDED` « Enregistrement d'une sortie de stock (bon
de sortie) », `STOCK_COUNT_SELF_VALIDATED` « Validation d'un inventaire par une
personne qui l'a aussi compté », `STOCK_COUNT_LINE_SET_ASIDE` « Mise à l'écart
d'une ligne d'inventaire », `STOCK_ATTACHMENT_REMOVED` « Retrait d'une pièce
jointe du stock (fichier effacé, empreinte conservée) », `STOCK_CONTROLS_UPDATED`
« Modification des réglages de contrôle du stock ». `AUDIT_ENTITY_TYPE_LABELS_FR`
(`:192`) reçoit `StockSlip` « Bon de stock », `StockCount` « Inventaire »,
`StockMovement` « Mouvement de stock », `StockTaker` « Preneur »,
`StockAttachment` « Pièce jointe de stock », `StockAlert` « Alerte de stock »,
`StockSettings` « Réglages du stock », `StockItem` « Article de stock »,
`StockLocation` « Lieu de stockage ». Aucun libellé n'emploie un mot interdit.

### 10.7 Notifications e-mail

`constants/email-notification-events.ts` : `VARIABLES_BY_EVENT_KEY.STOCK_ALERT_AGENCY`
= `agencyName`, `alertsCount`, `alertsSummary`, `controlUrl` (spec B7-R6 ; Q10).
Libellé de l'événement : « Alertes de stock (récapitulatif) ».

### 10.8 E12 — Importation (`lib/importation/natures.ts`)

- Réception (`:572-583`) : `recordStockReceipt` rend désormais
  `{ data: { slip, movements, controls } }` ; l'importeur garde son appel
  (une ligne par réception) et ajoute un `clientRequestId` tiré par ligne de
  classeur, stable entre deux essais d'une même ligne (rejeu sûr).
- Sortie (`:664-674`) : corps multi-lignes à une ligne, `requestedBy` gardé
  (texte) ; un classeur importé en mode strict (`requireTaker`) échouera ligne
  par ligne avec `400 STOCK_TAKER_REQUIRED` : l'aide de la nature le dit
  (« Si votre agence exige un preneur du carnet, enregistrez les sorties depuis
  l'écran Stock. »).
- `chargerEmpreintes` (`:594`, `:684-689`) lit `listStockMovements` **sans
  pagination** : avec le journal paginé (50 par défaut), il ne verrait que la
  première page et laisserait passer des doublons. Il parcourt donc toutes les
  pages (`limit: 200`, boucle sur `meta.nextCursor`), bornées à la période du
  classeur (`from` / `to`) pour ne pas tout relire.
- Dates : les lignes plus anciennes que `backdatingLimitDays` sont refusées
  par le serveur (`400 STOCK_DATE_TOO_OLD`) ; l'aide de la date le dit et
  renvoie aux réglages (§8.4).

## 11. Tests Vitest

Règles du dépôt (`.claude/rules/testing.md`) : mock à la frontière réseau
(`vi.mock('../../utils/api-client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))`),
vrais services et composants par-dessus ; **un `vi.mock` déclare chaque
export utilisé** — Vitest refuse l'import manquant. Mocks à prévoir, complets :

| Module mocké                       | Exports à déclarer                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `utils/api-client`                 | `default` avec `get`, `post`, `put`, `patch`, `delete` (`patch` est nouveau : préférences et preneurs)                                      |
| `hooks/useBreakpoint`              | `useBreakpoint` (desktop pour E1, E3, E4, E5 ; `{ isMobile: true, isTablet: false, isDesktop: false, active: 'xs' }` pour E2 et les cartes) |
| `hooks/useAuth`                    | `useAuth` (renvoie `{ user: { id, … } }` : test des quatre yeux)                                                                            |
| `utils/downscale-image` (si mocké) | `downscaleImageFile`                                                                                                                        |
| `utils/save-blob` (si mocké)       | `saveBlob` **et** `filenameFromDisposition`                                                                                                 |

jsdom n'a ni `URL.createObjectURL` ni `URL.revokeObjectURL` : les tests qui
affichent une vignette ou téléchargent un PDF les posent par `vi.stubGlobal`.
Tests en français (`setupTests.ts`) ; le vocabulaire se vérifie sur
`normaliser(document.body.textContent)` comme le fait
`__tests__/finance/stock-chantier.test.tsx:474-493`.

### 11.1 Fichiers nouveaux

**`__tests__/finance/stock-magasin.test.tsx`** (E2, mobile) :

1. n'affiche que les gestes permis par `abilities` (magasinier : Recevoir,
   Sortir, Compter, pas de Rebut) ; aucun geste → état « Aucun geste… ».
2. un seul appel au chargement : `GET /stock/field-context`.
3. Recevoir : une facture `receiptCount > 0` affiche les réceptions précédentes
   (`GET …/supplier-invoices/{id}/receipts`) avant de continuer.
4. Recevoir : le corps posté ne contient **aucun `unitCost`** pour un
   magasinier, contient `supplierInvoiceLineId` quand une ligne est choisie, et
   un `clientRequestId` au format UUID.
5. Réseau coupé (rejet axios sans `response`) puis réessai : les deux `POST`
   portent le **même** `clientRequestId` ; un rejeu `200` affiche « déjà
   enregistrée ».
6. Sortir : `requireTaker = true` → pas de lien « Saisir un nom… » ;
   `requireTaker = false` → le corps porte `requestedBy` et pas de `takerId`.
7. Sortir : lieu dans `meta.blindLocationIds` → « la quantité disponible n'est
   pas affichée », aucun chiffre de solde, aucun avertissement de dépassement.
8. Compter (`DRAFT`) : aucun texte « attendu », aucune quantité attendue, aucun
   champ motif ; le `PUT` ne porte que `itemId`, `countedQuantity`,
   `clientRequestId`.
9. Compter : « Clore le comptage » poste `…/close` après confirmation.
10. Compter (`COUNTED`) : « Justifier » propose la liste `reasonCodes.count`
    sans « Stock d'ouverture » ; « Autre » sans précision garde l'envoi fermé.
11. Photo : le fichier est envoyé **après** la sortie, en `multipart` sur
    `targetType=SLIP`, `targetId` = id du bon ; un échec d'envoi n'annule pas le
    succès de la sortie.
12. Aucune valeur monétaire (« FCFA ») n'apparaît, même avec `valuesVisible`.
13. Vocabulaire : aucun mot interdit (D2) sur l'accueil, la justification et
    les écrans de succès.
14. `nouvelIdentifiantDeRequete` rend un UUID v4 même quand `crypto.randomUUID`
    est absent (test unitaire de `utils/stock-client-request-id.ts`).

**`__tests__/finance/stock-controle.test.tsx`** (E5) :

1. Alertes : liste `OPEN` par défaut, titre et message affichés tels quels.
2. « Marquer comme traitée » poste `{ note }` (ou un corps sans note) et
   recharge ; `409 STOCK_ALERT_ALREADY_ACKNOWLEDGED` affiche le message dédié.
3. `?alerte=<id>` met la ligne en évidence.
4. Liens d'objet : `StockSlip` → `?bon=`, `StockCount` → `?inventaire=`,
   `CashVoucher` → fiche du chantier.
5. `403` sur les alertes → état « réservées aux responsables du stock ».
6. `valuesVisible = false` → ni onglet Indicateurs ni onglet Réglages.
7. Indicateurs : affiche `varianceRate` tel quel en pourcentage, « — » quand il
   est `null`, la note `countsWithoutFrozenValues`, et aucun nom de personne.
8. Indicateurs : période de plus de 24 mois → envoi fermé.
9. Réglages : n'envoie que les champs modifiés ; « Désactiver » envoie `null` ;
   `403` passe le formulaire en lecture seule.
10. Vocabulaire des trois onglets.

**`__tests__/finance/stock-preneurs.test.tsx`** (E4) :

1. liste, recherche, preneurs désactivés sur demande.
2. création : corps limité aux cinq champs du contrat ; `409
STOCK_TAKER_DUPLICATE` propose « Voir ce preneur ».
3. désactivation : `PATCH { isActive: false }` après confirmation.
4. « Effacer le téléphone » : `PATCH { phone: null }`.
5. sans `canManageTakers` : aucun bouton d'écriture.
6. l'encadré d'information sur les données personnelles est affiché.

**`__tests__/finance/stock-vocabulaire.test.ts`** (statique) : parcourt les
littéraux de `pages/finance/Stock*.tsx`, `components/finance/stock/**`,
`types/finance-stock-*.ts`, `constants/permissions-labels.ts`,
`constants/audit-labels.ts` et les catalogues `i18n/locales/*/finance.json` ;
aucun mot interdit à frontière de mot (`\bvols?\b`, `\bvoleurs?\b`,
`\bfraud`, `\bd[ée]tourn`). Il échoue aujourd'hui sur
`pages/finance/StockInventaire.tsx:874, 976` et sur leurs traductions dans
`i18n/locales/en/finance.json` et `ar/finance.json` : c'est voulu, le lot les
retire.

### 11.2 Fichiers modifiés délibérément

**`__tests__/finance/stock.test.tsx`** (E1) :

| Test actuel                                                                | Changement                                                                                                                                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « poste exactement les sept champs du schéma, et AUCUN prix » (`:728`)     | devient : poste `IssueRequest` multi-lignes (`locationId`, `siteId`, `issueDate`, `lines[]`, `takerId` ou `requestedBy`, `clientRequestId`), toujours aucun prix |
| « Le demandeur est exigé » (`:851-867`)                                    | devient : preneur **ou** demandeur ; texte « disparaît sans que personne n'en réponde » absent                                                                   |
| « ne propose que les factures validées du fournisseur choisi » (`:870`)    | devient : propose `FieldContext.receivableInvoices` sans passer par le fournisseur                                                                               |
| « poste les quatre champs du schéma, avec une ligne par article » (`:882`) | devient : `supplierInvoiceLineId` envoyé, `unitCost` omis quand il n'a pas été modifié, `clientRequestId` présent                                                |
| tests du journal (`:616-682`)                                              | lisent `{ data, meta }` ; ajout : « Charger plus » envoie `cursor` ; filtres « Preneur » et « Saisi par » absents sans `valuesVisible`                           |

Ajouts : sans `valuesVisible`, aucune colonne de valeur ni aperçu, et le
message de succès d'une sortie ne cite aucun montant ; lieu aveugle →
« Comptage en cours » ; contrôles d'une réception affichés ; export CSV
(`responseType: 'blob'`, mêmes filtres, `422` relayé) ; pastille « +3 j » du
délai de saisie ; rebut et retour visibles seulement avec `canDispose` ;
raccourci « Ouvrir l'écran Magasin » sous 992 px.

**`__tests__/finance/stock-inventaire.test.tsx`** (E3) :

| Test actuel                                                                                             | Changement                                                                                                                    |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| « poste cinq champs et rien d'autre » (`:389`)                                                          | devient : ajoute demandeur, `reasonCode`, `reason` si « Autre », `clientRequestId` ; toujours ni agence, ni prix, ni chantier |
| « poste l'article, la quantité comptée et le motif » (`:529`)                                           | **inversé** : le `PUT` ne porte jamais `reason`                                                                               |
| « omet le motif quand il est vide » (`:558`)                                                            | supprimé (plus de motif à la saisie)                                                                                          |
| « est impossible tant qu'un écart n'a pas de motif » (`:626`)                                           | déplacé en `COUNTED` ; un motif libre d'avant le lot vaut justification                                                       |
| « dit, dans la confirmation, que c'est irréversible et que le comptage écrase ce qui a bougé » (`:659`) | **inversé** : dit que les mouvements postérieurs sont conservés                                                               |
| « liste les comptages avec leur état… » (`:485`)                                                        | « Masqué » dans « Lignes en écart » pour un `DRAFT`                                                                           |

Ajouts : en `DRAFT`, ni « Le système dit », ni attendu, ni écart, ni lecture
de `GET /stock/balances` du lieu compté ; « Clore le comptage » ; abandon avec
motif ; justification (`PUT …/justification`) ; écarter une ligne ; quatre
yeux (alerte « Vous avez compté… » quand `useAuth().user.id` est un
compteur) ; `400 …REASON_REQUIRED` ouvre « Valider sans second regard » et
renvoie `{ selfValidationReason }` ; `409 …NEGATIVE_AFTER_MOVEMENTS` liste les
articles ; procès-verbal téléchargeable en `VALIDATED` seulement ;
`selfValidated` affiché ; lieu de chantier clos désactivé dans les
destinations du transfert ; aucun mot interdit (D2) en `DRAFT`, `COUNTED`,
`VALIDATED`.

**`__tests__/finance/stock-chantier.test.tsx`** (E7) : le test de doctrine
(`:474-493`) reste **inchangé** et doit passer avec les deux colonnes ajoutées ;
ajouts : bandeau d'inventaire d'ouverture et son lien quand
`openingCountSuggested`, absent sinon ; colonnes « Retourné au fournisseur » et
« Mis au rebut ».

**`__tests__/finance/cloture-chantier.test.tsx`** (E8) : liens d'action des
bloqueurs `STOCK_COUNT` et `STOCK_RESIDUAL` ; total des pièces sans les
bloqueurs de stock.

**`__tests__/finance/corps-des-requetes.test.ts`** : corps de
`recordStockIssue` (multi-lignes), `recordStockReceipt`
(`supplierInvoiceLineId`, `unitCost` facultatif), `createStockTransfer`
(demandeur, motif), `setStockCountLine` (sans `reason`), et des écritures
nouvelles (`recordStockScrap`, `recordSupplierReturn`, `justifyStockCountLine`,
`createStockTaker`, `updateStockControls`) ; aucun ne répète `tenantId`.

**`__tests__/finance/importation.test.tsx`** : `chargerEmpreintes` parcourt
toutes les pages ; `clientRequestId` stable par ligne.

**`__tests__/home/dashboard.test.tsx`** : une tâche `STOCK_ALERT` s'affiche avec
son icône et son lien.

**`__tests__/navigation/menu-catalog.test.ts`**, **`permission-gated-menu.test.ts`** :
un compte avec seulement `STOCK_*` voit « Gestion du stock » et pas « Suivi des
chantiers » ; un compte avec `FINANCE_ACCOUNTS_READ` voit les deux.
**`workspace-layout.test.tsx`** : l'espace « Gestion du stock » montre six
onglets dans l'ordre du §2.2, « Magasin » actif sur `/finance/stock/magasin`.

### 11.3 Ajouts de la révision 2

- `stock-magasin.test.tsx` : test 4 étendu — le corps ne contient **aucun
  `unitCost`, même avec `valuesVisible`** (l'écran Magasin ne demande aucun
  prix) ; « Compter » : les articles `toRecount` sont en tête avec la pastille
  « À recompter » ; `409 STOCK_COUNT_INCOMPLETE` liste les articles du serveur ;
  « Recevoir » : la recherche d'une facture hors liste appelle
  `GET /stock/receivable-invoices` ; la photo porte un `clientRequestId`
  stable entre deux essais.
- `stock.test.tsx` : prix de réception facultatif pour `valuesVisible` (aucun
  blocage d'envoi) ; filtre « Demandeur ou preneur contient » absent sans
  `valuesVisible` ; solde d'un lieu aveugle avec `valuesVisible` : pastille
  « Comptage en cours » dans les colonnes Coût moyen et Valeur, jamais
  « 0 FCFA » ; retour fournisseur : ligne de facture exigée quand
  `returnNeedsInvoiceLine`, `409 STOCK_RETURN_UNVALUED` relayé.
- `stock-inventaire.test.tsx` : `validation.callerIsCounter` ferme le bouton
  Valider (ou ouvre la fenêtre de dérogation si `selfValidationAllowed`) ;
  lignes non comptées, bouton « Écarter tous les articles non comptés » et
  `409 STOCK_COUNT_UNCOUNTED_LINES` ; ligne `countedBlind === false` mentionnée ;
  « Inventaire d'ouverture » absent quand `openingCountSuggested` est faux.
- `stock-controle.test.tsx` : sans `canViewAlerts` ni `valuesVisible`, état
  « réservé » **sans** appel à `GET /stock/alerts` ; réglages en lecture seule
  sans `canManageSettings` ; alertes `COUNT_LINE_SET_ASIDE`, `COUNT_CANCELLED`
  et pastille « Cumul du mois ».
- `stock-preneurs.test.tsx` : colonne Téléphone absente sans `canManageTakers`.
- `stock-chantier.test.tsx` : restant `null` → « Comptage en cours » ; le test
  de doctrine (`:474-493`) reste inchangé et vert.
- `cloture-chantier.test.tsx` : bloqueur `STOCK_CLOSING_COUNT_MISSING` et son
  lien ; phrase d'ordre du parcours quand les deux bloqueurs de stock sont là.
- `__tests__/finance/stock-vocabulaire.test.ts` : liste de mots étendue à
  l'anglais et à l'arabe (`\btheft\b`, `\bstolen\b`, `\bsteal`, `\bembezzl`,
  `سرق`, `احتيال`, `اختلاس`) sur les catalogues `en` et `ar`.

## 12. Wiki des fonctionnalités

Écrans, actions, routes, permissions et entrée de rôle ajoutés : mise à jour de
`docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx` puis
`npm run wiki:export` dans la même PR (AGENTS.md, « Wiki des
fonctionnalités »). Lignes à ajouter : Magasin (trois gestes), Preneurs,
Contrôle (alertes, indicateurs, réglages), bons PDF, pièces jointes,
inventaire à l'aveugle (clôture, justification, mise à l'écart, abandon,
validation par une autre personne), rebut, retour au fournisseur, export du
journal, rôle Magasinier.

## 13. Traductions et découpage

**Traductions.** Tout texte de ce document passe par `t()`. Après écriture,
`npm run i18n:extract` dans `apps/web` (une seule fois, par le dernier agent,
pour éviter deux agents sur les catalogues). Textes **modifiés** dont la
traduction part dans `*.orphans.json` et doit être reportée à la main
(AGENTS.md, pièges) : confirmations de validation d'inventaire, encadré de
l'onglet Inventaire, phrase « Ces quatre colonnes… », titre et texte de
succès des bloqueurs de clôture, aide du demandeur de sortie. Textes
**supprimés** (et leurs traductions) : `StockInventaire.tsx:874` et `:976`,
qui contiennent un mot interdit.

**Territoires de fichiers.** Le découpage des agents (web et API, fondations,
territoires parallèles, intégration finale) est dans [plan.md](plan.md). Il
remplace le tableau W0 à W5 de la première version : les fichiers communs
(`App.tsx`, `navigation/*`, `constants/*`, catalogues `i18n/locales/*`) y ont
chacun **un seul** propriétaire.

## 14. Questions au contrat — réponses (révision 2)

Toutes les questions de la première version ont reçu une réponse ; le contrat
(`contracts/openapi.yaml`, version 2.0.0) et les sections de ce document ont
été mis à jour. Il n'y a plus de repli provisoire.

| #   | Question                                                                                   | Réponse retenue                                                                                                                                                                               | Où                                                        |
| --- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Q1  | Les écrans ne savent pas si l'appelant a `STOCK_ALERTS_VIEW` ou `FINANCE_SETTINGS_MANAGE`. | `FieldContext.abilities` reçoit `canViewAlerts` et `canManageSettings`. Les permissions effectives de `GET /roles/menu-access/me` existent aussi, mais une seule source par écran vaut mieux. | Contrat `FieldContext` ; §3.3, §8.1, §10.1                |
| Q2  | `LocationView` ne dit ni chantier clos ni inventaire d'ouverture suggéré.                  | Ajout de `siteClosed`, `openingCountSuggested` et `toRecount`.                                                                                                                                | Contrat `LocationView` ; §7.3                             |
| Q3  | L'écran ne sait pas si l'appelant peut retirer une pièce jointe.                           | `AttachmentView.canRemove` et `removableUntil`, calculés pour l'appelant.                                                                                                                     | Contrat `AttachmentView` ; §4                             |
| Q4  | Un dépôt de photo réessayé peut doublonner.                                                | Le dépôt accepte `clientRequestId` (opération `ATTACHMENT`), rejeu en `200`.                                                                                                                  | Contrat `AttachmentUpload` ; spec B5-R7 ; §4              |
| Q5  | L'écran découvre la dérogation A1 par deux allers-retours.                                 | `CountView.validation` : `callerIsCounter`, `selfValidationAllowed` (test en base).                                                                                                           | Contrat `CountView` ; spec A1-R5 ; §7.6                   |
| Q6  | Aucun filtre par bon ni par mouvement.                                                     | Filtres `slipId` et `movementId` sur le journal et l'export.                                                                                                                                  | Contrat ; spec A5-R2 ; §5.6, §8.2                         |
| Q7  | `href` de la tâche `STOCK_ALERT` incohérent.                                               | `/tenant/<tenantId>/finance/stock/controle?alerte=<alertId>`.                                                                                                                                 | Contrat `/dashboard` ; spec B7-R5 ; §10.4                 |
| Q8  | L'écran du retour devrait additionner reçu et retourné.                                    | `InvoiceReceiptsView.byItem` (reçu, retourné, retournable, ligne de facture exigée).                                                                                                          | Contrat ; §5.5                                            |
| Q9  | Le magasinier ne peut pas réceptionner une facture hors des 180 jours / 200 premières.     | Route `GET /stock/receivable-invoices?search=&cursor=` sous `STOCK_VIEW` ; le contexte terrain ne porte plus que 50 factures, sans lignes.                                                    | Contrat ; spec B3-R1 ; §5.3, §6.3                         |
| Q10 | Variables du gabarit e-mail non définies.                                                  | `agencyName`, `alertsCount`, `alertsSummary`, `controlUrl` ; aucun nom de personne.                                                                                                           | Spec B7-R6 ; §10.7                                        |
| Q11 | Inventaire d'ouverture sur un magasin ?                                                    | Refusé : `409 STOCK_OPENING_COUNT_NOT_ALLOWED` ; ouverture seulement sur le lieu d'un chantier, dans les 30 jours de la bascule.                                                              | Spec A7-R1 ; §7.3                                         |
| Q12 | `downscaleImageFile` fixe la qualité JPEG à 0,9.                                           | (Web) paramètre facultatif `quality`, défaut inchangé ; l'écran du stock appelle `downscaleImageFile(file, 1600, 0.7)`.                                                                       | `utils/downscale-image.ts`, territoire W-socle de plan.md |
| Q13 | La liste des inventaires rend toutes les lignes.                                           | Lignes omises en liste (`lines = []`) sauf `withLines=true`.                                                                                                                                  | Contrat `GET /stock/counts` ; §3.2                        |
| Q14 | Le magasinier voit les menus hors stock.                                                   | Coupés une fois par la plateforme pour le rôle « Magasinier » (écran « Rôles et menus ») ; étape de déploiement.                                                                              | §2.3 ; data-model §3.3                                    |
| Q15 | `ReceiptControl` ne dit pas quelle ligne est sans prix.                                    | `ReceiptControl.itemIds`.                                                                                                                                                                     | Contrat ; spec A8-R2                                      |
| Q16 | Quelle moitié d'un transfert porte les photos ?                                            | La moitié sortante (`isDecrease = true`), comme l'audit `STOCK_TRANSFER_RECORDED` ; le service refuse la moitié entrante (`409 STOCK_ATTACHMENT_TARGET_NOT_ALLOWED`).                         | Spec B5-R6 ; §6.5                                         |
