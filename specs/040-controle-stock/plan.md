# Plan de réalisation — 040 Contrôle du stock de chantier et gabarit mobilier

> **Branche** : `feat/controle-stock` · **Worktree** : `.claude/worktrees/controle-stock`
> · **Rédigé** : 04/10/2026 · **Base** : `e72e960a` (à jour de `origin/main`)
> **Documents** : [spec.md](spec.md) (exigences A1 à A11, B1 à B8, révision 2),
> [data-model.md](data-model.md), [contracts/openapi.yaml](contracts/openapi.yaml)
> (version 2.0.0), [ecrans.md](ecrans.md), [meubles.md](meubles.md) (M1 à M5).
> Les chemins sont relatifs à la racine du dépôt.

Ce plan découpe le lot en **territoires de fichiers** pour des agents qui
travaillent en parallèle. Règle absolue : **jamais deux agents sur le même
fichier**. Un fichier « carrefour » (partagé par nature) a **un seul
propriétaire** ; les autres lui décrivent ce qu'ils attendent (§6).

## 1. Ordonnancement

```text
t0 ──► Étape 0 — FONDATIONS (1 agent) ───────────────┐
  │                                                  ▼
  │     Étape 1 — huit territoires du stock, en parallèle :
  │       API-1 Mouvements et transferts     WEB-1 Stock, importation, chantier
  │       API-2 Inventaires et chantiers     WEB-2 Inventaire et Magasin
  │       API-3 Journal, terrain, preneurs   WEB-3 Contrôle, preneurs, carrefours
  │       API-4 Bons PDF et pièces jointes
  │       API-5 Alertes et pilotage
  │                                                  │
  └──► Territoire M — MEUBLÉS (1 agent), dès t0 ─────┤  (aucune dépendance)
                                                     ▼
                         Étape 2 — INTÉGRATION (1 agent)
                                                     ▼
                         Recette navigateur (§9), puis pull request
```

- **Huit territoires du stock + le volet meublés à part** : la demande borne à
  5 à 8 territoires parallèles, « meublés à part ». Le volet meublés ne touche
  aucun fichier du stock (meubles.md §0) et démarre dès `t0`, sans attendre les
  fondations : c'est le gain de temps le plus sûr du lot.
- **Pourquoi pas moins** : fusionner deux territoires API créerait un agent
  portant deux fichiers de plus de 700 lignes (`stock-mouvements.ts`,
  `stock-inventaire.ts`) ; fusionner les bons PDF et les alertes, un agent sur
  quinze fichiers sans lien.
- **Modèle** : tous les agents de ce plan tournent sur **Opus 5.5, effort
  élevé** — demande expresse de l'utilisateur pour aller plus vite ; elle prime
  ici sur la règle « Sonnet par défaut » de `CLAUDE.md`. Le Pilote le passe
  explicitement à chaque lancement.

## 2. Règles communes à tous les agents (à recopier dans chaque prompt)

1. Travailler **uniquement** dans `D:\APP\Immobillier\.claude\worktrees\controle-stock`.
   Ne jamais lire ni écrire `D:\APP\Immobillier\apps` ni `D:\APP\Immobillier\packages`
   (autre checkout).
2. N'écrire **que** les fichiers de son territoire (liste exhaustive au §4/§5) ;
   tout le reste est en lecture seule. Un fichier qui manque dans la liste et
   dont l'agent a besoin : s'arrêter et le signaler au Pilote, ne pas le créer.
3. **Interdit** : `git stash`, `checkout`, `reset`, `restore`, `add`, `commit`,
   `push`, et toute commande git qui modifie l'arbre ou l'index ; lancer
   d'autres agents ; lire ou écrire un `.env` ; toucher une base de données
   (aucun `migrate dev`, `db push`, `db:seed`, script sur base). Les commandes
   git de **lecture** (`status`, `diff`, `log`, `show`) sont permises.
4. Un fichier qui semble **revenu en arrière** ou modifié par quelqu'un
   d'autre : s'arrêter et le signaler, ne pas refaire le travail.
5. Lancer **sa** suite de tests (commande donnée), pas la suite complète ; le
   typecheck de son paquet peut montrer des erreurs dans les fichiers d'**autres**
   territoires (formes de réponse en transition) : les lister, ne pas les
   corriger.
6. Français pour tout texte, `t()` pour tout libellé visible (texte français =
   clé), marges en propriétés logiques, mots interdits (spec §4 : « vol »,
   « voleur », « fraude », « frauduleux », « détournement », « détourné ») jamais
   dans un texte destiné à un utilisateur. Ne **pas** lancer `npm run
i18n:extract` : c'est l'intégration (§7).
7. Erreurs métier en `AppError` avec code (`ErrorCode`, défini par les
   fondations) et `data` si utile, jamais `lib/errors.conflict(message,
details)` (spec §8.3). Tout identifiant reçu est vérifié par
   `assertBelongsToTenant` (`packages/api/src/utils/tenant-ownership.ts:64`).
   Jamais `include: { user: true }`.
8. Rapport final : fichiers touchés, exigences couvertes, tests lancés et
   résultat, erreurs de typecheck vues hors territoire, écarts à la spec.

## 3. Étape 0 — Fondations (un seul agent, avant les huit territoires)

**But** : poser tout ce dont plusieurs territoires dépendent — schéma,
migrations, droits, codes, clés d'audit, contrats de types, aides transverses —,
faire les **extractions de code sans changement de comportement** qui séparent
les territoires, et livrer la couche de contrat du web (types, services,
composants partagés). Après elle, aucun territoire n'a besoin d'un fichier d'un
autre.

### 3.1 Fichiers (création ou modification)

API (`packages/api/`) :

| Fichier                                                                                                                                                                                                  | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                                                                                                                                                   | Tout data-model §2 (enums, colonnes, `countedQuantity` facultatif, tables, relations inverses), et le commentaire du modèle `LeaseInspection` (meubles.md §5.3, `:7914-7924`).                                                                                                                                                                                                                                                              |
| `prisma/migrations/<horodatage>_controle_stock_enums/migration.sql`                                                                                                                                      | data-model §5, migration 1.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `prisma/migrations/<horodatage>_controle_stock/migration.sql`                                                                                                                                            | Migration 2 : générée **sans base** (data-model §5), plus les contraintes SQL à la main.                                                                                                                                                                                                                                                                                                                                                    |
| `prisma/migrations/<horodatage>_controle_stock_permissions/migration.sql`                                                                                                                                | data-model §3.3.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `prisma/seeds/stock-permissions-seed.ts` (nouveau), `prisma/seeds/rbac-seed.ts`                                                                                                                          | data-model §3.2 ; appel après `seedFinancePermissions` (`:127`).                                                                                                                                                                                                                                                                                                                                                                            |
| `src/lib/finance/types-040-controle.ts` (nouveau)                                                                                                                                                        | Toutes les formes du contrat côté API (spec §8.5) : vues (`MovementView`, `BalanceView`, `SlipView`, `CountView`, `CountLineView`, `LocationView`, `TakerView`, `AttachmentView`, `AlertView`, `IndicatorsView`, `ControlsSettings`, `FieldContext`, `InvoiceReceiptsView`, `ReceivableInvoice`), `StockMeta`, `StockCallerContext`, listes de motifs par contexte. Dérivées des types `lot5` par `Omit<…> & {…}`, jamais en les modifiant. |
| `src/lib/finance/stock-controles.ts` (nouveau)                                                                                                                                                           | Aides transverses, signatures au §3.3.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/lib/finance/stock-bons.ts` (nouveau)                                                                                                                                                                | Naissance d'un bon : numérotation sous verrou, `snapshot` (spec B4-R1, B4-R3). **Pas** le PDF (API-4).                                                                                                                                                                                                                                                                                                                                      |
| `src/lib/finance/stock-alertes.ts` (nouveau)                                                                                                                                                             | Naissance d'une alerte : `raiseStockAlertTx` (`createMany … skipDuplicates`), constructeurs de clés (spec B7-R1, B7-R2). **Pas** la lecture ni l'e-mail (API-5).                                                                                                                                                                                                                                                                            |
| `src/middleware/stock-rbac-middleware.ts` (nouveau)                                                                                                                                                      | Gardes nommées des dix `STOCK_*` (forme de `finance-rbac-middleware.ts:22-37`) et `requireStockAttachmentDeposit` (`requireAnyPermission` des six droits de dépôt).                                                                                                                                                                                                                                                                         |
| `src/middleware/error-middleware.ts`                                                                                                                                                                     | Tous les codes `STOCK_*` du contrat (`StockErrorCode`) dans `ErrorCode` (`:45`).                                                                                                                                                                                                                                                                                                                                                            |
| `src/types/audit-types.ts`, `src/types/audit-catalog.ts`                                                                                                                                                 | Toutes les clés de spec B6-R1 (révision 2 comprise), catégorie, criticité, `visibility = TENANT`, `redact: ['phone']` pour les preneurs.                                                                                                                                                                                                                                                                                                    |
| `__tests__/unit/audit-catalog.test.ts`                                                                                                                                                                   | Clés nouvelles ajoutées à `postMigrationKeys` (`:74`).                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/services/audit-service.ts`                                                                                                                                                                          | `enrichAuditLogsWithResourceLabels` (`:136`) : libellés `StockSlip` (numéro), `StockCount` (lieu et date), `StockTaker` (nom), bornés à l'agence (spec B6-R3).                                                                                                                                                                                                                                                                              |
| `src/lib/finance/accounting.ts`                                                                                                                                                                          | `SOURCE_TYPE_BY_DOCUMENT` (`:95-97`) : `STOCK_SUPPLIER_RETURN`, `STOCK_SCRAP`.                                                                                                                                                                                                                                                                                                                                                              |
| `src/services/invitation-service.ts`                                                                                                                                                                     | « Magasinier » dans `TENANT_ROLE_LABELS_FR` (`:26-31`).                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/lib/finance/stock-transferts.ts` (nouveau, **extraction**)                                                                                                                                          | `recordStockTransferTx` et ses aides privées déplacés de `stock-inventaire.ts:303-424`, **sans changement de comportement**.                                                                                                                                                                                                                                                                                                                |
| `src/lib/finance/schemas-stock-transferts.ts` (nouveau, extraction)                                                                                                                                      | `createStockTransferSchema` déplacé de `schemas-stock-inventaire.ts:72-85`.                                                                                                                                                                                                                                                                                                                                                                 |
| `src/controllers/finance-stock-transferts-controller.ts`, `src/routes/finance-stock-transferts-routes.ts` (nouveaux, extraction)                                                                         | Le gestionnaire et la route `POST /stock/transfers` (`finance-stock-inventaire-routes.ts:50`), mêmes gardes qu'aujourd'hui.                                                                                                                                                                                                                                                                                                                 |
| `src/lib/finance/stock-journal.ts` (nouveau, extraction)                                                                                                                                                 | `listStockMovements` et ses aides déplacés de `stock-mouvements.ts:672-704`.                                                                                                                                                                                                                                                                                                                                                                |
| `src/lib/finance/schemas-stock-journal.ts` (nouveau, extraction)                                                                                                                                         | Filtres du journal déplacés de `schemas-stock-mouvements.ts:153-162`.                                                                                                                                                                                                                                                                                                                                                                       |
| `src/controllers/finance-stock-journal-controller.ts`, `src/routes/finance-stock-journal-routes.ts` (nouveaux, extraction)                                                                               | `GET /stock/movements` (`finance-stock-mouvements-routes.ts:56`), mêmes gardes.                                                                                                                                                                                                                                                                                                                                                             |
| `src/routes/finance-stock-preuves-routes.ts`, `src/routes/finance-stock-pilotage-routes.ts` (nouveaux, **vides**)                                                                                        | Routeurs sans route, `export default router`, que API-4 et API-5 rempliront.                                                                                                                                                                                                                                                                                                                                                                |
| `src/lib/finance/stock-inventaire.ts`, `schemas-stock-inventaire.ts`, `src/controllers/finance-stock-inventaire-controller.ts`, `src/routes/finance-stock-inventaire-routes.ts`                          | **Seulement** le retrait du code déplacé (transfert).                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/lib/finance/stock-mouvements.ts`, `schemas-stock-mouvements.ts`, `src/controllers/finance-stock-mouvements-controller.ts`, `src/routes/finance-stock-mouvements-routes.ts`                          | **Seulement** le retrait du code déplacé (journal).                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/app.ts`                                                                                                                                                                                             | Montage des quatre routeurs nouveaux à côté de ceux du lot 5 (`:275-278`). **Seule modification de `app.ts` du lot.**                                                                                                                                                                                                                                                                                                                       |
| `__tests__/unit/finance.stock-transferts.test.ts`, `__tests__/api/finance.stock-transferts.test.ts` (nouveaux, extraction)                                                                               | Tests du transfert déplacés de `finance.stock-inventaire.test.ts` (unitaire : `:608-626` et voisins ; API : blocs `transferRecord`, `:116`).                                                                                                                                                                                                                                                                                                |
| `__tests__/unit/finance.stock-journal.test.ts`, `__tests__/api/finance.stock-journal.test.ts` (nouveaux, extraction)                                                                                     | Tests du journal déplacés de `finance.stock-mouvements.test.ts` (unitaire et API).                                                                                                                                                                                                                                                                                                                                                          |
| `__tests__/unit/finance.stock-inventaire.test.ts`, `__tests__/api/finance.stock-inventaire.test.ts`, `__tests__/unit/finance.stock-mouvements.test.ts`, `__tests__/api/finance.stock-mouvements.test.ts` | **Seulement** le retrait des tests déplacés.                                                                                                                                                                                                                                                                                                                                                                                                |
| `__tests__/unit/stock-controles.test.ts` (nouveau)                                                                                                                                                       | Tests des aides du §3.3 (dates, ordre des verrous, empreinte de corps, masquages).                                                                                                                                                                                                                                                                                                                                                          |

Web (`apps/web/src/`) :

| Fichier                                                                                                                                                                                                                                                            | Contenu                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types/finance-stock-controle-types.ts` (nouveau)                                                                                                                                                                                                                  | ecrans §3.1, recopie du contrat 2.0.0.                                                                                                                                                                                      |
| `types/finance-stock-mouvements-types.ts`, `finance-stock-inventaire-types.ts`, `finance-stock-rapprochement-types.ts`, `finance-site-closing-types.ts`, `finance-stock-referentiel-types.ts`                                                                      | Alignements d'ecrans §3.1 (révision 2 : `countedQuantity`, `notCounted`, `justified`, `remainingQuantity` nullables, `STOCK_CLOSING_COUNT_MISSING`, `LocationView`).                                                        |
| `services/finance-stock-controle-service.ts` (nouveau), `finance-stock-mouvements-service.ts`, `finance-stock-inventaire-service.ts`, `finance-stock-rapprochement-service.ts`, `finance-stock-referentiel-service.ts`                                             | ecrans §3.2 (révision 2 comprise : `searchReceivableInvoices`, `setAsideUncountedLines`, `listStockCounts`, `clientRequestId` des pièces jointes).                                                                          |
| `hooks/useStockFieldContext.ts` (nouveau), `utils/stock-client-request-id.ts` (nouveau)                                                                                                                                                                            | ecrans §3.3, §3.7.                                                                                                                                                                                                          |
| `utils/downscale-image.ts`                                                                                                                                                                                                                                         | Paramètre facultatif `quality` (Q12), défaut inchangé.                                                                                                                                                                      |
| `components/finance/stock/StockPhotoCapture.tsx`, `StockAttachmentList.tsx`, `StockSlipPdfButton.tsx`, `StockTakerSelect.tsx`, `StockTakerForm.tsx`, `StockReasonPicker.tsx`, `StockQuantityInput.tsx`, `StockQuantityCell.tsx`, `StockBlindBanner.tsx` (nouveaux) | ecrans §4.                                                                                                                                                                                                                  |
| `pages/finance/StockMagasin.tsx`, `pages/finance/StockPreneurs.tsx`, `pages/finance/StockControle.tsx` (nouveaux, **squelettes**)                                                                                                                                  | Composant nommé (`export function StockMagasin()` …) qui rend un `PageHeader` : `App.tsx` compile dès l'étape 1. Ils passent ensuite à WEB-2 et WEB-3.                                                                      |
| `__tests__/finance/corps-des-requetes.test.ts`                                                                                                                                                                                                                     | Corps des écritures (ecrans §11.2) ; aucun ne répète `tenantId`.                                                                                                                                                            |
| `__tests__/finance/stock-composants.test.tsx` (nouveau)                                                                                                                                                                                                            | Composants partagés : `StockReasonPicker` (« Autre » exige la précision), `StockQuantityCell` (`null` → « Comptage en cours »), `StockTakerSelect` (`requireTaker`), `nouvelIdentifiantDeRequete` sans `crypto.randomUUID`. |

### 3.2 Consignes, dans l'ordre

1. **Extractions d'abord**, avant tout changement de schéma : déplacer le
   transfert et le journal (tableau ci-dessus), déplacer leurs tests, et
   vérifier que les suites `finance.stock-*` passent **sans changement de
   résultat**. Les chemins et gardes des routes ne changent pas (le catalogue
   de l'assistant reste identique à ce stade).
2. **Schéma**, puis migrations **sans base** :
   `git show origin/main:packages/api/prisma/schema.prisma > <dossier de travail>/schema.main.prisma`,
   puis dans `packages/api` :
   `npx prisma migrate diff --from-schema-datamodel <dossier de travail>/schema.main.prisma --to-schema-datamodel prisma/schema.prisma --script`.
   Déplacer les `ALTER TYPE … ADD VALUE` dans la migration 1 ; ajouter à la main
   les contraintes de data-model §5 ; horodater après la dernière migration
   présente (`ls prisma/migrations`). Puis `npx prisma validate` et
   `npx prisma generate` (aucune base). Si `generate` échoue sur un fichier
   verrouillé (Windows), le signaler.
3. Seeds, migration de données, codes d'erreur, clés d'audit et leur test,
   libellés d'audit, `accounting.ts`, `invitation-service.ts`, garde RBAC.
4. `types-040-controle.ts`, `stock-controles.ts`, `stock-bons.ts`,
   `stock-alertes.ts` : exactement les signatures du §3.3 (les territoires
   codent contre elles).
5. Côté web : types, services, hook, utilitaires, composants partagés,
   squelettes de pages, tests du socle.
6. `npm run typecheck -w @immotopia/api` et `-w @immotopia/web` : **aucune
   erreur dans les fichiers des fondations** ; les erreurs attendues ailleurs
   (pages et services du lot 5 qui lisent encore les anciennes formes,
   `countedQuantity` devenu facultatif dans `stock-inventaire.ts`) sont listées
   dans le rapport, par fichier, pour le territoire propriétaire.

### 3.3 Contrat d'interface livré par les fondations

`src/lib/finance/stock-controles.ts` :

```ts
export const STOCK_CONTROLS_DEFAULTS: {
  backdatingLimitDays: 7;
  requireTaker: false;
  issueAlertAmount: 500000;
  countVarianceAlertAmount: 100000;
  countVarianceAlertPercent: 5;
  cashMaterialAlertAmount: 100000;
  materialCostCategoryIds: [];
};
// Contexte de l'appelant (permissions lues par getUserPermissions : cache de 5 min, B1-R6).
export async function resolveStockCallerContext(
  userId: string,
  tenantId: string,
): Promise<StockCallerContext>;
//   { userId, valuesVisible, canValidateCount, canReceive, canIssue, canTransfer, canCount,
//     canDispose, canManageTakers, canViewAlerts, canManageSettings }
export async function loadBlindLocationIds(
  db: PrismaLike,
  tenantId: string,
  ctx: StockCallerContext,
): Promise<Set<string>>;
//   vide si ctx.canValidateCount ; sinon lieux portant un inventaire DRAFT (§8.2)
export function buildStockMeta(
  ctx: StockCallerContext,
  blind: Set<string>,
  nextCursor?: string | null,
): StockMeta;
export function maskMovementView(
  v: MovementView,
  ctx: StockCallerContext,
  blind: Set<string>,
): MovementView;
export function maskBalanceView(
  v: BalanceView,
  ctx: StockCallerContext,
  blind: Set<string>,
): BalanceView;
export function maskValue<T extends number | null>(
  v: T,
  ctx: StockCallerContext,
): number | null;
export function assertMovementDateAllowed(
  date: Date,
  backdatingLimitDays: number,
  now?: Date,
): void;
//   400 STOCK_DATE_IN_FUTURE | STOCK_DATE_TOO_OLD (jour UTC, A5-R4)
export function entryLagDays(createdAt: Date, movementDate: Date): number;
export async function lockStockSiteTx(
  tx: PrismaTransactionClient,
  siteId: string,
): Promise<void>;
export async function lockStockBalancesTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  pairs: Array<{ itemId: string; locationId: string }>,
): Promise<void>; // dédoublonne, trie, $executeRaw
export function assertReasonForContext(
  context: "COUNT" | "SCRAP" | "SUPPLIER_RETURN" | "TRANSFER",
  reasonCode: StockReasonCode,
  reason?: string | null,
): void; // 400 STOCK_REASON_NOT_ALLOWED | STOCK_REASON_REQUIRED
export const REASON_CODES_BY_CONTEXT: Record<
  "count" | "scrap" | "supplierReturn" | "transfer",
  StockReasonCode[]
>;
export function hashRequestBody(body: unknown): string; // SHA-256 du corps canonique, sans clientRequestId
export async function claimClientRequestTx(
  tx: PrismaTransactionClient,
  input: {
    tenantId: string;
    clientRequestId: string;
    operation: StockClientOperation;
    bodyHash: string;
    userId: string;
  },
): Promise<string>;
//   PREMIÈRE écriture de la transaction ; renvoie l'id de la clé
export async function completeClientRequestTx(
  tx: PrismaTransactionClient,
  keyId: string,
  resultType: string,
  resultId: string,
): Promise<void>;
export async function findClientRequestReplay(
  tenantId: string,
  clientRequestId: string,
  userId: string,
  bodyHash: string,
): Promise<{ resultType: string; resultId: string } | null>;
//   null si absente ; 409 STOCK_IDEMPOTENCY_MISMATCH si autre corps ou autre utilisateur
export function isUniqueViolation(error: unknown): boolean; // P2002, pour relire la clé après un rejeu concurrent
export async function loadItemsToRecount(
  db: PrismaLike,
  tenantId: string,
  locationIds: string[],
): Promise<
  Map<
    string,
    Array<{
      itemId: string;
      itemLabel: string;
      countId: string;
      setAsideAt: Date;
    }>
  >
>;
export function isOpeningCountSuggested(
  site: { stockEnabledAt: Date | null },
  hasLiveOpening: boolean,
  now?: Date,
): boolean; // 30 jours
```

`src/lib/finance/stock-bons.ts` :

```ts
export const SLIP_PREFIX: Record<StockSlipKind, "BR" | "BS" | "PVI">;
export function formatSlipNumber(
  kind: StockSlipKind,
  year: number,
  number: number,
): string; // BR-2026-00042
export async function createStockSlipTx(
  tx: PrismaTransactionClient,
  input: {
    tenantId: string;
    kind: StockSlipKind;
    documentDate: Date;
    locationId: string;
    siteId?: string | null;
    takerId?: string | null;
    requestedBy?: string | null;
    supplierInvoiceId?: string | null;
    stockCountId?: string | null;
    createdByUserId: string;
    snapshot: StockSlipSnapshot;
  },
): Promise<{ id: string; number: string }>;
//   verrou stock-slip pris ICI, en dernier (A10-R2) ; année = année UTC de documentDate
```

`src/lib/finance/stock-alertes.ts` :

```ts
export async function raiseStockAlertTx(
  tx: PrismaTransactionClient,
  input: StockAlertInput,
): Promise<void>;
//   createMany({ data: [..], skipDuplicates: true }) — jamais create ; ne lève jamais pour cause d'alerte
export const alertKeys: {
  countVariance(countId);
  countLineSetAside(countId);
  countCancelled(countId);
  countSelfValidated(countId);
  largeIssue(slipId);
  largeScrap(movementId);
  scrapCumul(locationId, yyyyMm);
  receiptRepeated(slipId);
  receiptOverInvoice(slipId);
  receiptUnvalued(slipId);
  cashMaterial(voucherId);
  cashMaterialCumul(siteId, yyyyMm);
};
export async function readStockAlertSettings(
  db: PrismaLike,
  tenantId: string,
): Promise<StockControlsSettingsValues>;
//   findUnique + STOCK_CONTROLS_DEFAULTS, ne crée jamais de ligne (A9-R2)
```

Garde RBAC (`src/middleware/stock-rbac-middleware.ts`) : `requireStockView`,
`requireStockValuesView`, `requireStockReceive`, `requireStockIssue`,
`requireStockTransfer`, `requireStockCount`, `requireStockTakersManage`,
`requireStockCountValidate`, `requireStockDispose`, `requireStockAlertsView`,
`requireStockCountOrValidate`, `requireStockAttachmentDeposit`.

Web : fonctions de services d'ecrans §3.2 (noms et retours exacts), hook
`useStockFieldContext(tenantId)`, `nouvelIdentifiantDeRequete()`, composants
d'ecrans §4 avec ces propriétés minimales :
`StockPhotoCapture({ tenantId, target?: { type, id }, purposes, onUploaded })`,
`StockAttachmentList({ tenantId, targetType, targetId, canAdd })`,
`StockSlipPdfButton({ tenantId, slipId?, countId?, number })`,
`StockTakerSelect({ value, onChange, takers, requireTaker, canManageTakers, people })`,
`StockTakerForm({ onCreated, people })`, `StockReasonPicker({ codes, value, onChange })`,
`StockQuantityInput({ unit, value, onChange, min })`, `StockQuantityCell({ quantity, unit })`,
`StockBlindBanner({ variant: 'count' | 'magasin' })`.

### 3.4 Exigences et commandes

Exigences : socle de A1 à A11 et B1 à B8 (schéma, droits B1-R1 à B1-R4, codes
§8.3, audit B6-R1/R2/R3/R4, verrous A10, dates A5-R4, idempotence B3-R2,
masquage §8.1/§8.2, naissance des bons B4-R1/R3 et des alertes B7-R2),
commentaire M (meubles §5.3).

Tests (un lancement par paquet) :
`npm run test -w @immotopia/api -- "finance.stock|stock-controles|audit-catalog|schema-tenant-coverage"` ;
`npm run test -w @immotopia/web -- corps-des-requetes stock-composants`
(Vitest filtre par **sous-chaîne** du chemin : plusieurs filtres séparés par
des espaces, pas d'expression régulière ; Jest, côté API, accepte une
expression régulière).

## 4. Territoires de l'étape 1 — API

Chaque territoire écrit **ses** fichiers et ses tests, s'appuie sur le §3.3, et
ne touche ni `app.ts`, ni `schema.prisma`, ni `error-middleware.ts`, ni les
fichiers d'audit (fondations).

### API-1 — Mouvements et transferts

|               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fichiers**  | `packages/api/src/lib/finance/stock-mouvements.ts`, `schemas-stock-mouvements.ts`, `stock-transferts.ts`, `schemas-stock-transferts.ts` ; `src/controllers/finance-stock-mouvements-controller.ts`, `finance-stock-transferts-controller.ts` ; `src/routes/finance-stock-mouvements-routes.ts`, `finance-stock-transferts-routes.ts` ; `__tests__/unit/finance.stock-mouvements.test.ts`, `__tests__/api/finance.stock-mouvements.test.ts`, `__tests__/unit/finance.stock-transferts.test.ts`, `__tests__/api/finance.stock-transferts.test.ts`, `__tests__/integration/stock-concurrence.test.ts` (nouveau).                                                                                                                                                                                                                                                                                                                                                                                         |
| **Lecture**   | Fondations (§3.3), `stock-referentiel.ts` (`ensureStockSettingsTx`), `suppliers.ts`, `ledger.ts` (`appendThirdPartyMovementTx`, `:189`), `accounting.ts` (`postDocumentEntryTx`, `:583`), `cost-allocation`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Exigences** | A5-R4 (dates des réceptions, sorties, retours, rebuts, transferts), A6 (retour fournisseur, rebut, écritures, A6-R3 bis, A6-R6 cumul des rebuts, A6-R4 pas d'écriture nulle), A7-R4 (transfert et réception vers un chantier clos refusés) et A7-R3 bis (verrou `stock-site` à l'entrée d'un lieu de chantier), A8 (prix A8-R3 pour tous, contrôles A8-R2, `itemIds`, messages sans montant), A10, A11, B2-R3 (preneur ou demandeur, instantané, `requireTaker`, `STOCK_TAKER_INACTIVE`), B3-R2/R3/R4 (idempotence, sortie multi-lignes, réponses légères), B4-R1 (naissance BR et BS par `createStockSlipTx`), B7 (`LARGE_ISSUE`, `LARGE_SCRAP` simple et cumul, `RECEIPT_*`), B6 (`STOCK_RECEIPT_RECORDED`, `STOCK_ISSUE_RECORDED`, `STOCK_TRANSFER_RECORDED`, `STOCK_SUPPLIER_RETURN_RECORDED`, `STOCK_SCRAP_RECORDED` critiques ; `STOCK_BLIND_INSUFFICIENT_REFUSED` hors transaction), §8.1/§8.2 sur ses réponses et `GET /stock/balances` (dont `onlyInStock`), gardes `STOCK_*` de ses routes. |
| **Routes**    | `POST /stock/receipts`, `POST /stock/issues`, `POST /stock/transfers`, `POST /stock/supplier-returns`, `POST /stock/scraps`, `GET /stock/balances`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Tests**     | Critères d'acceptation A6, A7-5/8, A8, A10 (le test d'intégration se saute sans `DATABASE_URL_TEST`, `describe.skip`, comme `isolation.test.ts`), A11, B2, B3, B4-1/2, B7-1 ; masquage d'un comptable sur un lieu en comptage (A2-7). Commande : `npm run test -w @immotopia/api -- "finance.stock-(mouvements                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | transferts)"`. |
| **Consignes** | Ordre de transaction : clé d'idempotence, verrous (`stock-site`, soldes triés), lectures, écritures, bon (verrou `stock-slip` en dernier), alertes, audit critique. Le test épinglé `finance.stock-inventaire.test.ts:608-626` a été déplacé dans `finance.stock-transferts.test.ts` par les fondations : **l'inverser** (A7-R4). La réponse d'un rejeu est relue et masquée pour l'appelant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### API-2 — Inventaires, clôture et rapprochement

|               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fichiers**  | `packages/api/src/lib/finance/stock-inventaire.ts`, `schemas-stock-inventaire.ts`, `site-closing.ts`, `stock-rapprochement.ts`, `schemas-stock-rapprochement.ts` ; `src/controllers/finance-stock-inventaire-controller.ts`, `finance-stock-rapprochement-controller.ts` ; `src/routes/finance-stock-inventaire-routes.ts`, `finance-stock-rapprochement-routes.ts` ; `__tests__/unit/finance.stock-inventaire.test.ts`, `__tests__/api/finance.stock-inventaire.test.ts`, `__tests__/unit/finance.site-closing.test.ts`, `__tests__/unit/finance.stock-rapprochement.test.ts`, `__tests__/api/finance.stock-rapprochement.test.ts`, `__tests__/integration/stock-cloture-concurrence.test.ts` (nouveau).                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Lecture**   | Fondations, `stock-mouvements.ts` (valorisation au coût moyen), `permission-service.ts`, `membership-service.ts`, schéma (`Membership`, `UserRole`, `RolePermission`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Exigences** | A1 (compteurs accumulés, quatre yeux, dérogation testée **en base**, A1-R5 `CountView.validation`), A2 (cycle, aveugle des routes d'inventaire, clôture, justification, abandon avec audit et alerte, mise à l'écart unitaire et `set-aside-uncounted`, lignes non comptées A2-R8, `STOCK_COUNT_INCOMPLETE`, `countedBlind` A2-R9), A3 (écart appliqué, `STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS`, `movementsSinceCapture` nul pour les lignes d'avant le lot), A4 (règle unique de justification, motif au mouvement), A5-R4 (date d'inventaire), A6-R4 (pas d'ajustement à valeur nulle), A7-R1/R2 (ouverture restreinte, surplus à valeur nulle, `openingCountSuggested` du statut et de la bascule), A7-R3 et A7-R3 bis (trois bloqueurs, verrou `stock-site` dans `closeSiteTx`), B4-R1 (PVI par `createStockSlipTx`), B7 (`COUNT_VARIANCE` avec lignes écartées, `COUNT_LINE_SET_ASIDE`, `COUNT_CANCELLED`, `COUNT_SELF_VALIDATED`), B6 (clés `STOCK_COUNT_*`, `STOCK_SITE_ENABLED`), §8.2 (restant du rapprochement masqué, `meta`), gardes `STOCK_*` des routes d'inventaire, `GET /stock/counts` sans lignes par défaut. |
| **Routes**    | `POST/GET /stock/counts`, `GET /stock/counts/{countId}`, `PUT …/lines`, `DELETE …/lines/{itemId}`, `POST …/close`, `PUT …/lines/{itemId}/justification`, `POST …/lines/{itemId}/set-aside`, `POST …/set-aside-uncounted`, `POST …/validate`, `POST …/cancel` ; `POST /finance/sites/{siteId}/stock/enable`, `GET …/stock/status`, `GET …/stock/reconciliation` ; `closure-blockers` et `close` (comportement, routes inchangées).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Tests**     | Critères A1, A2 (1 à 12), A3 (le test `finance.stock-inventaire.test.ts:1117-1150` est **inversé**), A4, A7 (1 à 7 et 9 en intégration, auto-ignoré sans base), B4-3, B7 (alertes d'inventaire), B8-3 (valeurs figées). Commande : `npm run test -w @immotopia/api -- "finance.(stock-inventaire                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | site-closing | stock-rapprochement) | stock-cloture-concurrence"`. |
| **Consignes** | La dérogation lit la base, jamais `getUserPermissions`. Clôture du comptage : verrouiller les couples (article, lieu) de **tous** les articles de solde non nul et des lignes, puis créer les lignes non comptées en lot (`createMany`). La doctrine « montré, pas jugé » de `stock-rapprochement.ts:54-58` ne bouge pas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### API-3 — Journal, terrain, preneurs et référentiel

|               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fichiers**  | `packages/api/src/lib/finance/stock-journal.ts`, `schemas-stock-journal.ts`, `stock-terrain.ts` (nouveau), `stock-preneurs.ts` (nouveau), `schemas-stock-preneurs.ts` (nouveau), `stock-referentiel.ts`, `schemas-stock-referentiel.ts` ; `src/controllers/finance-stock-journal-controller.ts`, `finance-stock-referentiel-controller.ts` ; `src/routes/finance-stock-journal-routes.ts`, `finance-stock-referentiel-routes.ts` ; `__tests__/unit/finance.stock-journal.test.ts`, `__tests__/api/finance.stock-journal.test.ts`, `__tests__/unit/finance.stock-terrain.test.ts` (nouveau), `__tests__/unit/finance.stock-preneurs.test.ts` (nouveau), `__tests__/unit/finance.stock-referentiel.test.ts`, `__tests__/api/finance.stock-referentiel.test.ts`.                                                                                                                                                           |
| **Lecture**   | Fondations, `src/lib/csv.ts`, `stock-mouvements.ts` (forme des mouvements), `suppliers.ts`, `tenant-ownership.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Exigences** | A4-R4 (motif au journal), A5 (pagination par curseur, filtres dont `slipId`/`movementId`, trois filtres par personne réservés, export CSV 50 000 lignes, `entryLagDays`, `authors`), A8-R1 (réceptions d'une facture : lignes de facture, `byItem`, `returnNeedsInvoiceLine`), B2 (carnet : création, doublon, désactivation, téléphone effaçable, `phone` et `people` réservés à `STOCK_TAKERS_MANAGE`), B3-R1 (contexte terrain : 50 factures sans lignes, `abilities` complètes, `toRecount`, `siteClosed`, `openingCountSuggested`), route `GET /stock/receivable-invoices` (Q9), référentiel : gardes `STOCK_VIEW` en lecture, `LocationView`, refus `STOCK_COUNT_IN_PROGRESS` à la désactivation d'un lieu, audit `STOCK_ITEM_*` (avec `changes`, dont l'unité) et `STOCK_LOCATION_*`, B6 (`STOCK_TAKER_CREATED/UPDATED`, `redact: ['phone']`), §8.1/§8.2 sur le journal, le CSV et les réceptions d'une facture. |
| **Routes**    | `GET /stock/movements`, `GET /stock/movements/export.csv`, `GET /stock/movements/authors`, `GET /stock/field-context`, `GET /stock/receivable-invoices`, `GET /stock/supplier-invoices/{invoiceId}/receipts`, `GET/POST /stock/takers`, `PATCH /stock/takers/{takerId}` ; référentiel : `GET/POST /stock/items`, `GET/PATCH /stock/items/{itemId}`, `GET/POST /stock/locations`, `PATCH /stock/locations/{locationId}`, `GET/PUT /stock/settings`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Tests**     | Critères A4-2, A5 (1 à 4), A8-1, B2 (1 à 4), B3-2 ; CSV sans colonne de valeur pour un magasinier, colonnes masquées d'un lieu en comptage. Commande : `npm run test -w @immotopia/api -- "finance.stock-(journal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | terrain   | preneurs                                                                                                                                       | referentiel)"`. |
| **Consignes** | Curseur opaque (base64 de `movementDate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | createdAt | id`), jamais de décalage par `skip`. L'export lit par pages internes de 1 000 et s'arrête à 50 001 pour répondre `422 STOCK_EXPORT_TOO_LARGE`. |

### API-4 — Bons PDF, pièces jointes et export d'agence

|               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fichiers**  | `packages/api/src/lib/finance/stock-bons-pdf.ts` (nouveau), `stock-pieces-jointes.ts` (nouveau), `schemas-stock-preuves.ts` (nouveau) ; `src/controllers/finance-stock-preuves-controller.ts` (nouveau) ; `src/routes/finance-stock-preuves-routes.ts` (squelette des fondations) ; `src/services/tenant-data-export/file-references.ts`, `src/services/tenant-data-export/model-registry.ts` ; `__tests__/unit/stock-bons-pdf.test.ts` (nouveau), `__tests__/unit/stock-pieces-jointes.test.ts` (nouveau), `__tests__/unit/tenant-data-export.registry.test.ts`, et le test existant des règles de dossiers de l'export s'il existe (sinon `__tests__/unit/tenant-data-export.file-references.test.ts`, nouveau). |
| **Lecture**   | Fondations (`stock-bons.ts`, snapshot), `src/controllers/finance-sites-controller.ts:413-564` (gabarit `pdf-lib`), `src/lib/documents/document-branding.ts`, `src/lib/documents/pdf-text.ts` (`sanitizeForPdf`, `:24`), `src/lib/files/private-files.ts`, `src/lib/syndics/provider-invoice-files.ts:30` (détection d'octets), `src/routes/lease-inspection-routes.ts:35-49` (multer).                                                                                                                                                                                                                                                                                                                             |
| **Exigences** | B4-R2/R3/R3 bis/R4 (PDF BR, BS, PVI en français, libellés figés, sans montant sans `STOCK_VALUES_VIEW`, sans quantité après mouvement d'un lieu en comptage, PVI d'avant le lot sans numéro, mentions de dérogation, compteurs, non comptés, sans aveugle), B5 (cibles et refus `STOCK_ATTACHMENT_TARGET_NOT_ALLOWED`, types par octets avec WebP, 10 Mo, EXIF retiré, SHA-256 du fichier stocké, retrait à 15 minutes ou `STOCK_DISPOSE`, droits de dépôt par cible B5-R6, `clientRequestId` B5-R7, `canRemove`/`removableUntil`, export B5-R9), B6 (`STOCK_ATTACHMENT_ADDED`, `STOCK_ATTACHMENT_REMOVED` critique), lecture d'un bon (`GET /stock/slips/{slipId}`, masquée).                                     |
| **Routes**    | `GET /stock/slips/{slipId}`, `GET /stock/slips/{slipId}/pdf`, `GET /stock/counts/{countId}/report.pdf`, `POST/GET /stock/attachments`, `GET /stock/attachments/{attachmentId}/file`, `POST /stock/attachments/{attachmentId}/remove`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Tests**     | Critères B1-4, B4-1/3/4, B5 (1 à 7). Commande : `npm run test -w @immotopia/api -- "stock-(bons-pdf                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | pieces-jointes) | tenant-data-export"`. |
| **Consignes** | Le chemin `/stock/counts/:countId/report.pdf` vit dans **ce** routeur (segment fixe : aucune capture par `GET /stock/counts/:countId`). Filtre EXIF sans dépendance nouvelle (segments APP1 du JPEG, bloc `eXIf` du PNG, bloc `EXIF` du WebP). Aucun fichier sous `uploads/` n'est servi en statique.                                                                                                                                                                                                                                                                                                                                                                                                              |

### API-5 — Alertes, indicateurs, réglages, caisse, e-mail et tableau de bord

|               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fichiers**  | `packages/api/src/lib/finance/stock-alertes-lecture.ts` (nouveau), `stock-indicateurs.ts` (nouveau), `stock-reglages.ts` (nouveau), `schemas-stock-pilotage.ts` (nouveau), `cash.ts` ; `src/controllers/finance-stock-pilotage-controller.ts` (nouveau) ; `src/routes/finance-stock-pilotage-routes.ts` (squelette des fondations) ; `src/jobs/stock-maintenance-job.ts` (nouveau) ; `src/index.ts` (démarrage de la tâche) ; `src/config/env.ts`, `env.example` (`STOCK_ALERT_MAIL_JOB_ENABLED`) ; `src/services/dashboard-service.ts` ; `src/constants/email-notification-keys.ts`, `email-notification-default-templates.ts`, `notification-key-features.ts` ; `__tests__/unit/stock-alertes.test.ts` (nouveau), `__tests__/unit/stock-indicateurs.test.ts` (nouveau), `__tests__/unit/stock-maintenance-job.test.ts` (nouveau), `__tests__/unit/finance.cash.test.ts`, `__tests__/unit/dashboard-stock-alert.test.ts` (nouveau), `__tests__/integration/stock-alertes-concurrence.test.ts` (nouveau). |
| **Lecture**   | Fondations (`stock-alertes.ts`, `readStockAlertSettings`), `src/jobs/document-expiry-alert-job.ts:110`, `src/jobs/newsletter-campaign-scheduler.job.ts:19-29`, `src/utils/tenant-context.ts`, services d'e-mail existants, `cost-allocation`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Exigences** | A9 (postes « matériaux », `SINGLE` / `MONTHLY_CUMUL`, date de la pièce, sans `ensureStockSettingsTx`), B7-R3/R4/R5/R6 (titres et messages construits à la lecture, sans montant pour un appelant sans valeurs, acquittement, file « À traiter » et `href` vers `controle`, tâche d'e-mail avec réclamation à 30 minutes, envoi puis marquage, alertes sans objet marquées, interrupteur d'environnement, purge nocturne des clés d'idempotence), B8 (indicateurs par lieu et par mois, dont lignes écartées, non comptées, part à l'aveugle, rebuts ; `$queryRaw` avec `tenant_id = $1`), réglages de contrôle (`GET/PATCH /stock/settings/controls`, audit `STOCK_CONTROLS_UPDATED` avec `changes`, postes vérifiés par `assertBelongsToTenant`), B6 (`STOCK_ALERT_ACKNOWLEDGED`).                                                                                                                                                                                                                       |
| **Routes**    | `GET /stock/alerts`, `POST /stock/alerts/{alertId}/acknowledge`, `GET /stock/indicators`, `GET/PATCH /stock/settings/controls` ; effet de bord sur `POST /finance/cash-vouchers/{voucherId}/validate` ; `GET /dashboard` (`workQueue`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Tests**     | Critères A9 (1 à 5), B7 (2 à 6), B8 (1 à 3). Commande : `npm run test -w @immotopia/api -- "stock-(alertes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | indicateurs | maintenance-job) | finance.cash | dashboard-stock-alert"`. |
| **Consignes** | La clé `STOCK_ALERT_AGENCY` est classée `CONSTRUCTION` ; variables du gabarit `agencyName`, `alertsCount`, `alertsSummary`, `controlUrl`, sans nom de personne. Destinataires lus en base (B1-R6). Tâche planifiée seulement si `env.STOCK_ALERT_MAIL_JOB_ENABLED` (faux par défaut).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## 5. Territoires de l'étape 1 — web et meublés

### WEB-1 — Stock, importation, référentiel, chantier et clôture (E1, E6, E7, E8, E12)

|               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fichiers**  | `apps/web/src/pages/finance/Stock.tsx`, `StockReferentiel.tsx`, `StockChantier.tsx`, `ClotureChantier.tsx` ; `apps/web/src/lib/importation/natures.ts` ; `apps/web/src/dev/atelier/finance-mock-stock-mouvements.ts`, `finance-mock-stock-referentiel.ts`, `finance-mock-stock-rapprochement.ts` ; `apps/web/src/__tests__/finance/stock.test.tsx`, `stock-referentiel.test.tsx`, `stock-chantier.test.tsx`, `cloture-chantier.test.tsx`, `importation.test.tsx`.                                                                                   |
| **Lecture**   | Socle web des fondations, ecrans §0 à §5, §10.1 à §10.3, §10.8, §11.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Exigences** | E1 (ecrans §5 : réception sans prix obligatoire, recherche de factures, sortie multi-lignes avec preneur, rebut, retour avec ligne de facture, journal paginé et filtres réservés, export CSV, tiroirs bon et facture, masquages valeurs et aveugle), E6 (§10.1, `canManageSettings`), E7 (§10.2, inventaire d'ouverture, colonnes descriptives, restant aveugle — test de doctrine `stock-chantier.test.tsx:474-493` **inchangé**), E8 (§10.3, trois bloqueurs et leurs liens), E12 (§10.8, pages du journal, `clientRequestId` stable par ligne). |
| **Tests**     | ecrans §11.2 et §11.3 pour ces écrans. Commande : `npm run test -w @immotopia/web -- finance/stock.test finance/stock-referentiel.test finance/stock-chantier.test finance/cloture-chantier.test finance/importation.test`.                                                                                                                                                                                                                                                                                                                         |

### WEB-2 — Inventaire et Magasin (E3, E2)

|                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fichiers**        | `apps/web/src/pages/finance/StockInventaire.tsx`, `apps/web/src/pages/finance/StockMagasin.tsx` (squelette des fondations), `apps/web/src/components/finance/stock/magasin/*` (nouveau dossier) ; `apps/web/src/dev/atelier/finance-mock-stock-inventaire.ts` ; `apps/web/src/__tests__/finance/stock-inventaire.test.tsx`, `stock-magasin.test.tsx` (nouveau).                                                                                                                                                                                                                    |
| **Lecture**         | Socle web des fondations, ecrans §3, §4, §6, §7, §11.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Exigences**       | E3 (ecrans §7 : transfert avec demandeur et motif, liste sans lignes, ouverture selon `openingCountSuggested` et `toRecount`, comptage à l'aveugle sans aucune lecture des soldes du lieu, clôture et `STOCK_COUNT_INCOMPLETE`, justification avec `justified` du serveur, non comptés et mise à l'écart groupée, validation guidée par `CountView.validation`, PVI, abandon), E2 (ecrans §6 : trois gestes, transfert, téléphone 360 px, aucune valeur, aucun prix demandé, recherche de factures, lignes de facture à la demande, photos idempotentes, rejeu et coupure réseau). |
| **Tests**           | ecrans §11.1 (`stock-magasin.test.tsx`), §11.2 et §11.3 (`stock-inventaire.test.tsx`). Commande : `npm run test -w @immotopia/web -- finance/stock-inventaire.test finance/stock-magasin.test`.                                                                                                                                                                                                                                                                                                                                                                                    |
| **Attend de WEB-3** | La route `/tenant/:tenantId/finance/stock/magasin` montée dans `App.tsx` sur l'export nommé `StockMagasin`, et l'onglet « Magasin » de l'espace « Gestion du stock ».                                                                                                                                                                                                                                                                                                                                                                                                              |

### WEB-3 — Contrôle, preneurs, navigation et carrefours (E4, E5, E9, E10, E11)

|               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fichiers**  | `apps/web/src/pages/finance/StockControle.tsx`, `StockPreneurs.tsx` (squelettes des fondations) ; `apps/web/src/App.tsx` ; `apps/web/src/navigation/finance-workspaces.tsx`, `menu-catalog.ts`, `route-labels.ts`, `model.tsx` (seulement si une entrée doit y changer) ; `apps/web/src/constants/permissions-labels.ts`, `audit-labels.ts`, `email-notification-events.ts` ; `apps/web/src/services/dashboard-service.ts` ; `apps/web/src/components/home/HomeFeeds.tsx` ; `apps/web/src/dev/atelier/Atelier.tsx`, `finance-mock-stock-controle.ts` (nouveau) ; `apps/web/src/__tests__/finance/stock-controle.test.tsx` (nouveau), `stock-preneurs.test.tsx` (nouveau), `__tests__/home/dashboard.test.tsx`, `__tests__/navigation/menu-catalog.test.ts`, `permission-gated-menu.test.ts`, `workspace-layout.test.tsx`, `workspace-tabs.test.tsx`, `finance-workspace-tabs-access.test.ts`. |
| **Lecture**   | Socle web, ecrans §1, §2, §8, §9, §10.4 à §10.7, §11.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Exigences** | Routes et onglets (ecrans §2.1, §2.2), menu (§2.3 : `finance-stock` et `finance-chantiers` dans `MENU_REQUIREMENTS`, groupe `finance-chantiers-stock` conditionné), E5 Contrôle (§8 : onglets selon `canViewAlerts` / `valuesVisible`, alertes et natures nouvelles, indicateurs, réglages selon `canManageSettings`), E4 Preneurs (§9, téléphone selon `canManageTakers`), E9 file « À traiter » (§10.4), E10 libellés du rôle Magasinier et des dix droits (§10.5), E11 libellés d'audit (toutes les clés de spec B6-R1, révision 2 comprise, §10.6), notifications (§10.7), scènes de l'atelier (§2.4, dont « Magasin, téléphone, magasinier sans valeurs » sur le banc de WEB-2).                                                                                                                                                                                                         |
| **Tests**     | ecrans §11.1 (`stock-controle`, `stock-preneurs`), §11.2 (navigation, tableau de bord), §11.3. Commande : `npm run test -w @immotopia/web -- finance/stock-controle.test finance/stock-preneurs.test home/dashboard.test navigation/menu-catalog.test navigation/permission-gated-menu.test navigation/workspace-layout.test navigation/workspace-tabs.test navigation/finance-workspace-tabs-access.test`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### M — Meublés : gabarit mobilier des états des lieux (M1 à M5)

|                   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fichiers**      | API : `packages/api/src/lib/lease-inspections/inventory.ts` (nouveau), `packages/api/src/lib/lease-inspections/service.ts`, `packages/api/src/services/rental-lease-service.ts` (`select` du bien), `packages/api/src/types/rental-types.ts`, `packages/api/__tests__/unit/lease-inspections.test.ts`, `packages/api/__tests__/unit/lease-inspections-inventory.test.ts` (nouveau), `packages/api/__tests__/api/lease-inspections.test.ts`. Web : `apps/web/src/services/lease-inspections-service.ts`, `apps/web/src/services/rental-service.ts`, `apps/web/src/components/rental/inspections/inspection-constants.ts`, `deduction-proposals.ts` (nouveau), `ConditionPicker.tsx`, `RoomsAccordion.tsx`, `DeductionsSection.tsx`, `InspectionForm.tsx`, `InspectionViewer.tsx`, `InspectionCompareModal.tsx`, `StartInspectionModal.tsx`, `LeaseInspectionsPanel.tsx`, `apps/web/src/pages/rental/LeaseDetailPage.tsx`, `apps/web/src/__tests__/rental/lease-inspections.test.tsx`, `apps/web/src/__tests__/rental/inspection-inventory.test.ts` (nouveau). |
| **Lecture**       | meubles.md (entier), `prisma/schema.prisma:7914-7954`, `lease-lifecycle/service.ts:670-733`, `FinalSettlementCard.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Exigences**     | M1 à M5 (meubles §4, §6, §7, §8), R4 avec libellé, nature et valeur figés côté serveur pour un élément repris d'une entrée finalisée (révision 2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Tests**         | meubles §10. Commandes : `npm run test -w @immotopia/api -- lease-inspections` ; `npm run test -w @immotopia/web -- rental/lease-inspections.test rental/inspection-inventory.test`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Ne touche pas** | `schema.prisma` (commentaire : fondations), catalogues de traduction (intégration), classeur du wiki (intégration), aucun fichier du stock. Démarre dès `t0`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 6. Fichiers carrefours — un seul propriétaire

| Fichier                                                                                                                     | Propriétaire         | Ce que les autres attendent                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/api/prisma/schema.prisma`                                                                                         | Fondations           | Tout data-model §2 et le commentaire `LeaseInspection` ; personne d'autre n'y écrit. Un besoin de colonne découvert en étape 1 remonte au Pilote.                                                                    |
| `packages/api/src/app.ts`                                                                                                   | Fondations           | Les routeurs `finance-stock-transferts`, `finance-stock-journal`, `finance-stock-preuves`, `finance-stock-pilotage` montés ; les territoires ajoutent des routes **dans leurs routeurs**, jamais un routeur nouveau. |
| `packages/api/src/middleware/error-middleware.ts`                                                                           | Fondations           | Tous les codes du contrat ; un code manquant remonte au Pilote.                                                                                                                                                      |
| `packages/api/src/types/audit-types.ts`, `audit-catalog.ts`, `__tests__/unit/audit-catalog.test.ts`                         | Fondations           | Toutes les clés de spec B6-R1.                                                                                                                                                                                       |
| `packages/api/src/lib/finance/accounting.ts`                                                                                | Fondations           | Deux natures de pièce.                                                                                                                                                                                               |
| `packages/api/src/index.ts`, `src/config/env.ts`, `env.example`                                                             | API-5                | Démarrage de la tâche et sa variable.                                                                                                                                                                                |
| `packages/api/src/services/dashboard-service.ts`                                                                            | API-5                | Nature `STOCK_ALERT`.                                                                                                                                                                                                |
| `packages/api/src/services/tenant-data-export/*`                                                                            | API-4                | Dossier `stock/`, `StockClientRequest` exclu.                                                                                                                                                                        |
| `packages/api/__tests__/unit/routes-inventory.test.ts`, `schema-tenant-coverage.test.ts`                                    | Personne (inchangés) | Lancés par les fondations et l'intégration.                                                                                                                                                                          |
| `packages/api/__tests__/integration/isolation.test.ts`, `__tests__/helpers/run-isolation-tests.js`                          | Intégration          | Bloc « Stock » (spec §8.4, B8-R3) ; les trois tests de concurrence ajoutés au lanceur.                                                                                                                               |
| `packages/api/src/lib/ai/gateway/catalog.generated.json`, `path-rules.ts`                                                   | Intégration          | Catalogue régénéré, écritures sensibles.                                                                                                                                                                             |
| `packages/api/src/i18n/locales/{en,ar}.json`                                                                                | Intégration          | Commun stock et meublés.                                                                                                                                                                                             |
| `apps/web/src/App.tsx`, `navigation/*`                                                                                      | WEB-3                | Routes `magasin`, `preneurs`, `controle` ; six onglets ; lazy sur les exports nommés `StockMagasin`, `StockPreneurs`, `StockControle`.                                                                               |
| `apps/web/src/constants/*` (permissions, audit, notifications)                                                              | WEB-3                | Libellés de toutes les clés.                                                                                                                                                                                         |
| `apps/web/src/services/finance-stock-*-service.ts`, `types/finance-stock-*`, `components/finance/stock/*` (hors `magasin/`) | Fondations           | Signatures du §3.3 ; un manque remonte au Pilote, pas de copie locale.                                                                                                                                               |
| `apps/web/src/dev/atelier/Atelier.tsx`                                                                                      | WEB-3                | Scènes de WEB-2 décrites dans ecrans §2.4 ; bancs de données de chaque territoire.                                                                                                                                   |
| `apps/web/src/i18n/locales/*`                                                                                               | Intégration          | Extraction et traductions en une fois.                                                                                                                                                                               |
| `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx`, `sous-fonctionnalites.md`                                       | Intégration          | Lignes du stock (ecrans §12) et des états des lieux (meubles §12).                                                                                                                                                   |
| `docs/workflows/DEPLOIEMENT.md`                                                                                             | Intégration          | data-model §5.3, variable de la tâche, menus du Magasinier.                                                                                                                                                          |
| `docs/workflows/HANDOFF.md`                                                                                                 | Pilote               | —                                                                                                                                                                                                                    |

## 7. Étape 2 — Intégration (un seul agent, après les neuf territoires)

Consignes, dans l'ordre :

1. **Relire** les rapports des territoires et leurs erreurs « hors
   territoire » ; vérifier qu'aucune n'est restée.
2. **Traductions** : `npm run i18n:extract -w @immotopia/api` puis
   `npm run i18n:extract -w @immotopia/web` ; traduire en anglais et en arabe
   chaque clé nouvelle (`packages/api/src/i18n/locales/{en,ar}.json`,
   `apps/web/src/i18n/locales/{en,ar}/*.json`, notamment `finance.json`,
   `common.json`, `rental.json`, `admin.json`) ; reporter à la main sur les
   nouvelles clés les traductions parties dans `*.orphans.json` (textes
   modifiés : ecrans §13, meubles §11), puis **supprimer** les `*.orphans.json`
   (le test de complétude refuse un orphelin commis). Retirer les traductions
   contenant « theft » ou « سرقة » qui seraient restées (`finance.json:674`,
   `:1471`).
3. **Tests de vocabulaire** (créés ici, ils balaient tout le lot) :
   `packages/api/__tests__/unit/stock-vocabulaire.test.ts` (spec §11) et
   `apps/web/src/__tests__/finance/stock-vocabulaire.test.ts` (ecrans §11.1,
   §11.3), en trois langues.
4. **Assistant** : `npm run ai:catalog` (dans `packages/api`) ; vérifier que
   `scraps`, `supplier-returns`, `set-aside`, `set-aside-uncounted`, `cancel`,
   `remove` sortent sensibles, sinon compléter `src/lib/ai/gateway/path-rules.ts`
   (catégorie `lifecycle`) et son test.
5. **Isolation** : bloc « Stock » de `__tests__/integration/isolation.test.ts`
   (preneur, bon, PDF, pièce jointe, alerte, inventaire, contexte terrain,
   factures réceptionnables, indicateurs d'une autre agence → `404` ou sans
   fuite) ; ajouter `stock-concurrence`, `stock-cloture-concurrence` et
   `stock-alertes-concurrence` à `__tests__/helpers/run-isolation-tests.js`.
   Les lancer seulement si l'environnement fournit `DATABASE_URL_TEST` (sinon
   le dire dans le rapport : le Pilote les lance).
6. **Comptes de recette** : étendre `packages/api/prisma/seeds/pack-test-tenants.ts`,
   `seed-pack-test-tenants.ts` et `__tests__/unit/pack-test-tenants.test.ts`
   avec, pour les agences « Promoteur · 6 mois » et « Opérateur intégré ·
   6 mois », un Magasinier (`magasinier-promoteur@`, `magasinier-integre@`),
   un Comptable (`comptable-promoteur@`) et, pour l'Opérateur intégré, un second
   administrateur (`responsable-integre@`), au domaine
   `packs.immotopia.test` ; et la liste de connexion rapide du staging
   (`apps/web/src/dev/dev-accounts.ts` et son test). Aucun lancement du seed.
7. **Documentation** : `docs/workflows/DEPLOIEMENT.md` (retour arrière,
   `STOCK_ALERT_MAIL_JOB_ENABLED`, coupure des menus hors stock du rôle
   Magasinier par la plateforme, reseed des comptes de recette sur le
   staging) ; classeur du wiki (ecrans §12, meubles §12, mode d'emploi :
   `docs/fonctionnalites/README.md`) puis `npm run wiki:export` et
   `npm run wiki:check`.
8. **Contrôles** : `npm run typecheck`, `npm run lint`, `npm run check:architecture`,
   `npm test`, `npm run test:web`. Une erreur dans le code d'un territoire se
   corrige ici seulement si elle est mécanique (import, type, libellé) ; une
   erreur de comportement remonte au Pilote avec le territoire concerné.

## 8. Couverture des exigences

| Exigence | Territoire(s)                                                                          | Exigence                        | Territoire(s)                                                                                  |
| -------- | -------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| A1       | API-2 ; WEB-2                                                                          | B1                              | Fondations (droits, rôle, gardes) ; tous (gardes de leurs routes) ; WEB-3 (libellés, menus)    |
| A2       | API-2 (routes d'inventaire) ; Fondations, API-1, API-3, API-4 (masquages §8.2) ; WEB-2 | B2                              | API-3 (carnet) ; API-1 (sortie, transfert) ; WEB-3, WEB-1, WEB-2                               |
| A3       | API-2 ; WEB-2                                                                          | B3                              | API-3 (contexte terrain) ; API-1 (idempotence, multi-lignes) ; WEB-2 (Magasin)                 |
| A4       | API-2 ; API-3 (journal) ; WEB-2, WEB-1                                                 | B4                              | Fondations (naissance) ; API-1 (BR, BS) ; API-2 (PVI) ; API-4 (PDF) ; WEB-1, WEB-2             |
| A5       | Fondations (dates) ; API-3 (journal, CSV) ; WEB-1                                      | B5                              | API-4 ; Fondations (composants photo) ; WEB-1, WEB-2                                           |
| A6       | API-1 ; WEB-1                                                                          | B6                              | Fondations (clés) ; tous (écritures) ; WEB-3 (libellés)                                        |
| A7       | API-2 (ouverture, clôture) ; API-1 (chantier clos, verrou) ; WEB-1, WEB-2              | B7                              | Fondations (naissance) ; API-1, API-2, API-5 (natures) ; API-5 (lecture, e-mail, file) ; WEB-3 |
| A8       | API-1 ; API-3 (réceptions d'une facture) ; WEB-1, WEB-2                                | B8                              | API-5 ; WEB-3                                                                                  |
| A9       | API-5                                                                                  | M1 à M5                         | M                                                                                              |
| A10      | Fondations (aides) ; API-1, API-2                                                      | §8.4 isolation                  | Intégration                                                                                    |
| A11      | API-1 ; WEB-2                                                                          | Traductions, wiki, catalogue IA | Intégration                                                                                    |

## 9. Recette navigateur

**Environnement** : le staging (ou une instance locale équivalente) après
déploiement de la branche, migrations appliquées, seed des comptes de recette
relancé par le Pilote (`./infra/scripts/seed-pack-tests.sh staging`, étape 6 de
l'intégration), et `STOCK_ALERT_MAIL_JOB_ENABLED` vrai pour R15. Mot de passe de
tous les comptes `…@packs.immotopia.test` : la constante `PACK_TEST_PASSWORD` de
`packages/api/prisma/seeds/pack-test-tenants.ts` (non recopiée ici). Agences :
« Test — Pack Promoteur · 6 mois » (pack Promoteur), « Test — Pack Opérateur
intégré · 6 mois » (pack Opérateur intégré), « Test — Pack Agence · 6 mois »
(pack Agence, pour les meublés). Chaque scénario se joue en français, puis R18
rejoue les écrans en anglais et en arabe. Une capture par étape marquée ★.

**R1 — Rôle Magasinier et menus** (super-administrateur de la plateforme, puis
`magasinier-promoteur@`, Promoteur)

1. Super-administrateur : « Rôles et menus » › rôle « Magasinier » : couper tous
   les groupes de menu sauf « Accueil » et « Chantiers et stock ».
2. Se connecter en `magasinier-promoteur@`. ★ Le menu montre « Chantiers et stock
   › Gestion du stock », pas « Suivi des chantiers » ni la finance.
3. Ouvrir « Gestion du stock » : bandeau « Les valeurs du stock ne sont pas
   affichées pour votre rôle. », aucune colonne Coût moyen ni Valeur.
4. Saisir l'adresse `/tenant/<id>/finance/fournisseurs` (ou toute page
   financière) : refus explicite, pas d'écran vide.
5. Onglet « Contrôle » : état « Cet écran est réservé aux responsables du stock »
   et bouton « Aller à l'écran Magasin ».

**R2 — Réception sur facture, réception multiple** (`magasinier-promoteur@`,
puis `promoteur@`, Promoteur)

1. Magasin › « Recevoir » : choisir une facture validée ; lieu ; ajouter deux
   articles, dont un rattaché à sa ligne de facture ; « Passer » les photos ;
   « Enregistrer la réception ». ★ Numéro `BR-2026-…` affiché.
2. « Télécharger le bon (PDF) » : ★ en-tête de l'agence, lignes, zones « Livré
   par » / « Reçu par », **aucun montant**.
3. « Photographier le bon signé » : déposer une image ; empreinte courte
   affichée, « heure du serveur ».
4. Recommencer une réception sur **la même facture** : écran « Cette facture a
   déjà été réceptionnée » avec la liste ; « Continuer : c'est une autre
   livraison » ; enregistrer ; contrôle « Facture déjà réceptionnée » affiché
   sans montant.
5. Se connecter en `promoteur@` : Accueil › « À traiter » ★ contient « Facture
   déjà réceptionnée » ; le lien ouvre Contrôle › Alertes avec la ligne mise en
   évidence ; « Marquer comme traitée » avec une note : elle quitte la file.

**R3 — Sortie, preneur, stock insuffisant** (`magasinier-promoteur@`, Promoteur)

1. Magasin › « Sortir » : chantier ; « Ajouter un preneur » (nom, équipe) ; deux
   articles ; « Enregistrer la sortie ». ★ `BS-2026-…`, rappel « Faites signer
   le bon par le preneur ».
2. PDF du bon : « Remis par » / « Reçu par (preneur) », nom du preneur imprimé.
3. Nouvelle sortie d'une quantité supérieure au stock : refus « stock
   insuffisant », retour à l'étape des articles, rien d'enregistré (le journal
   ne montre aucun nouveau bon).
4. Carnet des preneurs : renommer le preneur ; le journal garde l'ancien nom sur
   le bon passé, avec « (aujourd'hui : …) » côté administrateur.

**R4 — Mode strict** (`promoteur@` puis `magasinier-promoteur@`, Promoteur)

1. Contrôle › Réglages : activer « Exiger un preneur du carnet ».
2. Magasinier : Sortir › étape preneur : le lien « Saisir un nom sans l'ajouter
   au carnet » a disparu ; aide « Votre agence exige un preneur du carnet… ».
3. Remettre le réglage à l'état initial.

**R5 — Inventaire à l'aveugle, lignes non comptées** (`magasinier-promoteur@`,
`comptable-promoteur@`, `promoteur@`, Promoteur)

1. Magasinier : Magasin › « Compter » › « Commencer l'inventaire ». ★ Bandeau
   « Comptage à l'aveugle », aucune quantité attendue.
2. Compter **un seul** des articles du lieu, avec un nombre inférieur au stock
   connu (noter ce stock avant, en administrateur).
3. Comptable : « Gestion du stock » › État du stock filtré sur ce lieu ★ :
   « Comptage en cours » à la place de la quantité, du coût moyen et de la
   valeur ; journal du lieu : « Reste après » et valeurs masqués.
4. Magasinier : « Clore le comptage » (confirmation qui annonce les non
   comptés). Écran de justification : écart révélé, section « Non comptés ».
5. Justifier l'écart : « Disparition non expliquée » ; vérifier qu'« Autre » sans
   précision garde le bouton fermé.
6. Administrateur : Inventaire › détail : « Valider » fermé tant qu'il reste des
   non comptés ; « Écarter tous les articles non comptés » avec un motif ;
   « Valider ». ★ Statut « Validé », PVI téléchargeable (rubriques « non
   comptés », « Compté par » = magasinier, « Validé par » = administrateur).
7. Contrôle › Alertes : « Lignes d'inventaire écartées » et, si le seuil est
   atteint, « Écart d'inventaire à justifier au-dessus du seuil ».
8. Rouvrir un inventaire sur le même lieu : les articles écartés sont listés
   « À recompter ».

**R6 — Quatre yeux et dérogation** (`integre@`, `responsable-integre@`,
Opérateur intégré ; `promoteur@`, Promoteur)

1. Intégré, `integre@` : ouvrir, compter une ligne, clore, justifier ; le bloc de
   validation affiche « Vous avez compté des lignes de cet inventaire » et le
   bouton « Valider » fermé.
2. `responsable-integre@` : valider. ★ Validé, `selfValidated` absent du PVI.
3. Promoteur (un seul administrateur) : `promoteur@` compte, clôt, justifie ;
   la fenêtre « Valider sans second regard » s'ouvre ; motif de moins de 10
   caractères refusé ; motif valide → validé ; ★ mention au PVI ; alerte
   « Inventaire validé par son compteur » ; Journal d'activité : « Validation
   d'un inventaire par une personne qui l'a aussi compté ». La ligne saisie par
   l'administrateur porte « Comptée par une personne qui voyait le stock ».

**R7 — Mouvement pendant le comptage** (`promoteur@`, Promoteur)

1. Lieu à 100 unités d'un article. Ouvrir un inventaire, compter 90, clore,
   justifier (« Casse »).
2. Avant de valider, transférer 20 unités vers un autre lieu (demandeur et motif
   exigés).
3. Faire valider par une autre personne (ou dérogation) : ★ stock final 70
   (écart −10 appliqué au stock courant), « Mouvements depuis le comptage : 1 ».

**R8 — Abandon d'un inventaire** (`promoteur@`, Promoteur)

1. Ouvrir un inventaire, compter deux lignes, « Abandonner l'inventaire » avec
   un motif.
2. ★ Bandeau « Inventaire abandonné », aucune quantité attendue à l'écran ;
   alerte « Inventaire abandonné » ; Journal d'activité : l'événement porte
   attendu et compté.

**R9 — Rebut et retour fournisseur** (`promoteur@` puis `comptable-promoteur@`,
Promoteur)

1. Stock › Autres mouvements › « Rebut » : motif « Casse », photo. Succès avec
   la valeur.
2. « Retour au fournisseur » : facture, article de `byItem`, « Reçu · déjà
   retourné · retournable » affichés ; laisser la ligne de facture vide quand
   elle est exigée → refus « Indiquez la ligne de la facture… » ; choisir la
   ligne ; enregistrer.
3. Comptable : compte du fournisseur ★ solde diminué du prix de la ligne × la
   quantité ; le reste à payer de la facture inchangé (comme annoncé).
4. Trois petits rebuts sous le seuil dont la somme le dépasse (seuil abaissé
   pour la recette) : une seule alerte « Rebut important — cumul du mois ».

**R10 — Journal, filtres, export, dates** (`comptable-promoteur@` puis
`magasinier-promoteur@`, Promoteur)

1. Comptable : journal ; « Charger plus » jusqu'à la fin ; filtres Preneur, Saisi
   par, Demandeur ; ★ export CSV ouvert dans un tableur (séparateur « ; »,
   accents corrects, colonnes de valeur présentes).
2. Magasinier : journal ; les trois filtres par personne sont absents ; export
   CSV sans colonnes de valeur.
3. Sortie datée de demain : le sélecteur l'interdit ; au-delà de 7 jours en
   arrière aussi ; une sortie datée de 3 jours en arrière porte la pastille
   « +3 j ».

**R11 — Bascule et inventaire d'ouverture** (`promoteur@`, Promoteur)

1. Basculer un chantier au stock : message « Pensez à faire l'inventaire
   d'ouverture » ; bandeau sur « Stock du chantier » et bouton.
2. Inventaire d'ouverture : un surplus entre ★ sans valeur, aucune alerte ;
   l'option « Inventaire d'ouverture » n'est pas proposée pour un magasin.

**R12 — Clôture d'un chantier** (`promoteur@`, Promoteur)

1. Chantier dont le lieu porte du stock : Clôture › ★ bloqueurs « pas
   d'inventaire de clôture validé » et « porte encore du stock », phrase d'ordre
   du parcours, liens d'action.
2. « Faire l'inventaire de clôture » : compter tous les articles (un oubli →
   refus listant l'article), clore, justifier, valider.
3. « Transférer le reste vers un magasin » (motif « Évacuation d'un chantier »).
4. Clôturer : ★ succès. Puis tenter un transfert vers le lieu de ce chantier :
   destination grisée « Chantier clos » (et refus serveur si forcé).

**R13 — Achats de matériaux en espèces** (`promoteur@`, Promoteur)

1. Réglages : seuil d'achats en espèces à 100 000, poste « matériaux » choisi.
2. Valider une pièce de caisse de 150 000 sur ce poste : alerte « Achat de
   matériaux en espèces ».
3. Valider trois pièces de 40 000 dans le mois sur le même chantier : une alerte
   « cumul du mois » à la troisième ; une quatrième se valide sans erreur.

**R14 — Indicateurs et réglages** (`promoteur@`, Promoteur)

1. Contrôle › Indicateurs : ★ taux d'écart du mois, lignes non comptées, part à
   l'aveugle, sorties avec preneur, rebuts, délai de saisie ; aucun nom de
   personne ; période de plus de 24 mois refusée.
2. Réglages : désactiver « Sortie importante » ; une grosse sortie n'ouvre plus
   d'alerte ; réactiver.

**R15 — E-mail des alertes** (`promoteur@`, Promoteur)

1. Notifications e-mail : activer « Alertes de stock (récapitulatif) ».
2. Provoquer une alerte, attendre au plus 10 minutes : ★ un e-mail récapitulatif
   sans nom de personne, lien vers l'écran Contrôle (boîte de test du staging ;
   si l'envoi n'est pas observable, le noter sans conclure).

**R16 — Téléphone d'entrée de gamme** (`magasinier-integre@`, Opérateur intégré)

1. Fenêtre 360 × 640 (appareil émulé, réseau « 3G lente ») : Magasin ★ trois
   gros boutons, aucun défilement horizontal, cibles de 48 px au moins.
2. Recevoir puis Sortir de bout en bout, avec photo prise depuis l'appareil.
3. Couper le réseau juste avant « Enregistrer la sortie », réessayer après
   l'avoir rétabli : ★ un seul bon créé (journal), message « déjà enregistrée »
   si le premier envoi était passé.

**R17 — Étanchéité entre agences** (`integre@` et `promoteur@`)

1. Noter l'identifiant d'un bon et d'une alerte du Promoteur ; en `integre@`,
   ouvrir `/finance/stock?bon=<id>` et `/finance/stock/controle?alerte=<id>` :
   ★ « introuvable », aucune donnée.
2. Pack Agence (`agence@`) : « Gestion du stock » absent ; une adresse du stock
   saisie à la main affiche « module non inclus » (gating inchangé, D1).

**R18 — Vocabulaire et langues** (`promoteur@`, Promoteur)

1. Parcourir Stock, Magasin, Inventaire (tous statuts), Contrôle, Preneurs,
   bons PDF, en français, anglais et arabe : aucun « vol », « voleur »,
   « fraude », « détournement », « theft », « سرقة ».
2. En arabe : ★ mise en page retournée correcte sur Magasin et Inventaire.

**R19 — État des lieux meublé** (`agence@`, pack Agence)

1. Bail d'un bien meublé › « Commencer l'état des lieux » (entrée) : modèle
   « Bâti, mobilier et équipements » présélectionné. ★ Pièces avec mobilier,
   quantités à 1.
2. Saisir une valeur de remplacement (Téléviseur 150 000, Chaises 6 × 15 000),
   évaluer **tous** les éléments ; « Finaliser » avant d'avoir tout évalué :
   message et éléments entourés, aucun appel de finalisation.
3. Sortie : Téléviseur « Manquant » (quantité forcée à 0), Chaises 4 ; la
   suppression d'un élément repris de l'entrée est impossible ; renommer un
   élément repris ne change rien après enregistrement.
4. « Comparer » : ★ synthèse (1 manquant, 1 baisse, clés, compteurs).
5. « Proposer depuis les dégradations et manquants » : 150 000 et 30 000
   proposés, modifiables ; clés manquantes à 0 FCFA ; pas de doublon au
   second clic.

**R20 — États des lieux anciens** (`agence@`, pack Agence)

1. Ouvrir un état des lieux enregistré avant le lot : il s'affiche et s'enregistre
   sans champ de quantité ; un brouillon ancien non entièrement évalué ne se
   finalise plus, avec la liste des éléments à évaluer.

## 10. Constats écartés ou appliqués autrement

La critique adverse a été vérifiée dans le code ; ses références sont exactes
(voir le résumé de la révision 2 en tête de spec.md). Les points suivants ont
été appliqués **autrement** qu'elle ne le proposait, ou nuancés :

| Constat                                                               | Décision                                                                                                                                                                                              | Pourquoi                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bloquant 1 — dérivation de l'attendu par l'historique du journal      | Masquage des champs directs (quantité, valeur, coût moyen, valeur après, coût unitaire, restant) **et** limite assumée inscrite (spec §3.3), plutôt que masquer les quantités passées des mouvements. | La critique laissait le choix. Masquer l'historique d'un lieu pendant des jours rend inutilisables le journal, les bons et l'export pour tout le monde, sans fermer d'autres sources (bons imprimés, factures). L'export reste tracé ; un refus `STOCK_INSUFFICIENT` sur un lieu en comptage est tracé. |
| Bloquant 2 — option `scope: PARTIAL`                                  | Pas de champ `scope` ; lignes non comptées obligatoires, écartées en une fois par le **validateur** (`set-aside-uncounted`).                                                                          | Un inventaire « partiel » choisi à l'ouverture par le compteur (qui a `STOCK_COUNT`) rouvrirait le comptage sélectif. Ici, ne pas compter est une décision du contrôleur, motivée, tracée et alertée. Les comptages planifiés par article sont du niveau 3 (D3).                                        |
| Bloquant 3 (1) — alerte à chaque mise à l'écart                       | Une alerte `COUNT_LINE_SET_ASIDE` **par inventaire, à la validation**.                                                                                                                                | Les montants se figent à la validation ; une alerte par ligne noierait la file pour un inventaire tournant. Un inventaire clos et jamais validé reste visible (bloque le lieu et la clôture du chantier, spec §9).                                                                                      |
| Important 6 — photo obligatoire au-delà d'un montant de rebut         | Non retenu ; cumul mensuel et indicateur retenus.                                                                                                                                                     | Une pièce jointe se dépose **après** l'opération (sa cible doit exister) : l'exiger demanderait un état « en attente de photo », c'est-à-dire la sortie en deux temps du niveau 3.                                                                                                                      |
| Important 7 — bloqueur de clôture                                     | Appliqué, avec un **troisième** bloqueur (`STOCK_CLOSING_COUNT_MISSING`).                                                                                                                             | « Solde > 0 » seul laisserait transférer le solde théorique vers un magasin sans compter, et le manque du chantier se noierait dans le magasin.                                                                                                                                                         |
| Important 8 — « décider quelles écritures l'assistant peut proposer » | Aucune exclusion ; écritures du stock à risque classées sensibles.                                                                                                                                    | L'assistant agit avec les permissions de l'utilisateur et lui fait confirmer ; l'exclusion par préfixe (`catalog-builder.ts:51`) est réservée aux espaces plateforme et portails.                                                                                                                       |
| Important 9 — drapeau de fonctionnalité au déploiement                | Non retenu : déploiement simultané API + web, retour arrière par correctif en avant (data-model §5.3).                                                                                                | Un drapeau dédoublerait chaque route du lot pendant une fenêtre de quelques minutes ; un rechargement de page suffit.                                                                                                                                                                                   |
| Important 5 — « reçoit systématiquement 400 »                         | Corrigé (chaîne de prix pour tous).                                                                                                                                                                   | Constat juste à une nuance près : le refus ne venait pas si l'appelant choisissait une ligne de facture valorisée.                                                                                                                                                                                      |
| Mineur — invalidation du cache des permissions                        | Non branchée dans ce lot (spec B1-R6, §13 Q6).                                                                                                                                                        | Changement transverse de la gestion des membres ; ce lot lit la base partout où la sécurité d'une écriture porte sur d'autres utilisateurs.                                                                                                                                                             |
| Mineur — Q1 par `GET /roles/menu-access/me`                           | `abilities.canViewAlerts` / `canManageSettings` retenus.                                                                                                                                              | Les écrans du stock ont déjà une source de droits chargée une fois (`FieldContext`) ; deux sources donneraient deux vérités.                                                                                                                                                                            |
| Mineur — contrainte `CHECK` `NOT VALID`                               | Contrainte limitée à `SCRAP` et `SUPPLIER_RETURN` (valide) ; motif du transfert garanti par le service.                                                                                               | Une condition sur `created_at` dépendrait de l'heure du déploiement ; aucune ligne existante n'a ces deux natures.                                                                                                                                                                                      |

Aucun constat n'a été jugé faux.

## 11. Contrat attendu par le lot 041 (inventaire par WhatsApp)

Le lot 041 (`specs/041-inventaire-whatsapp/`, branche `feat/inventaire-whatsapp`
empilée sur celle-ci) se développe **en parallèle** des territoires de l'étape 1.
Il appelle le stock seulement par les fonctions ci-dessous : leurs noms et leurs
signatures sont **figés** pour les territoires propriétaires, qui peuvent en
changer le corps mais pas la forme sans prévenir le Pilote.

API-2 — `packages/api/src/lib/finance/stock-inventaire.ts` (exports nommés) :

```ts
export async function createStockCountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    locationId: string;
    countedAt: Date;
    createdByUserId: string;
    kind?: StockCountKind;
  },
): Promise<{ id: string }>;
//   409 si un inventaire DRAFT existe déjà sur le lieu (comportement actuel conservé)
export async function setStockCountLineTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  params: { itemId: string; countedQuantity: number; countedByUserId: string },
): Promise<{ lineId: string }>;
//   l'auteur de la ligne est `countedByUserId` (A4-R1) ; aucun attendu ni écart dans le retour (A2-R2)
export async function closeStockCountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  closedByUserId: string,
): Promise<{ id: string; status: "COUNTED" }>;
//   A2-R4 et A2-R8 (lignes non comptées créées) ; 409 STOCK_COUNT_EMPTY / STOCK_COUNT_WRONG_STATUS
```

Le contrôleur HTTP passe `req.user.userId` en `countedByUserId` / `closedByUserId` ;
le lot 041 passe l'utilisateur rattaché au numéro WhatsApp.

API-4 — `packages/api/src/lib/finance/stock-pieces-jointes.ts` (exports nommés, purs) :

```ts
export type StockFileKind = "jpeg" | "png" | "webp" | "pdf";
export function detectStockFileKind(buffer: Buffer): StockFileKind | null; // octets magiques
export function stripImageMetadata(buffer: Buffer, kind: StockFileKind): Buffer; // EXIF retiré (B5-R3), PDF inchangé
export function sha256Hex(buffer: Buffer): string;
```
