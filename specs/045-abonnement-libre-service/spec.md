# 045 — Abonnement en libre-service et facturation de l'agence

Date : 2026-10-16. Branche : `feat/abonnement-libre-service` (depuis `main` `68f2699e`).
Socle : [PLAN-ABONNEMENTS.md](../../docs/architecture/PLAN-ABONNEMENTS.md) (décisions D1–D14 du 24/09/2026).

## 1. Objectif

Un module « Abonnement et factures » où l'agence, sans passer par l'équipe ImmoTopia :

1. voit son compte : formule, statut, solde dû à ce jour, prochaine échéance ;
2. ajoute elle-même un pack ou une extension à son abonnement ;
3. programme le retrait d'un pack ou d'une extension (et peut l'annuler) ;
4. voit l'utilisation de son abonnement et de ses extensions (inclus, utilisé, dépassement) ;
5. voit sa prochaine facture estimée à ce jour et ses factures émises (existant) ;
6. consulte le relevé de son compte : factures, paiements, avoirs et mouvements de l'abonnement, avec le solde.

## 2. Décisions (utilisateur, 2026-10-16)

- **AL-D1 — ajout immédiat, prorata sur la prochaine facture** (reprise de D7) : l'élément est actif tout
  de suite ; le prorata des jours restants devient une ligne en attente reprise par la prochaine
  facture. Pendant l'essai : pas de prorata (comportement existant de `addSubscriptionItem`).
- **AL-D2 — relevé de compte** : chronologie des factures, avoirs, paiements, ajouts et retraits
  d'éléments, avec le solde. Chaque mouvement indique l'utilisateur qui l'a fait quand il est connu.
- **AL-D3 — retrait à l'échéance** par l'agence, sans remboursement (D7), annulable tant que
  l'échéance n'est pas passée. Jamais de retrait immédiat en libre-service (réservé au super-admin).

Choix du pilote (les plus sûrs, réversibles) :

- **AL-C1** : ajouter / retirer / annuler un retrait exige une nouvelle permission
  `TENANT_SUBSCRIPTION_MANAGE`, donnée au seul rôle `TENANT_ADMIN`. Lire exige `TENANT_SETTINGS_VIEW`.
- **AL-C2** : en lecture seule (impayé ou lecture seule manuelle), lecture et paiement restent
  ouverts, mais ajout, retrait et annulation sont refusés (`ForbiddenError` : « Réglez la facture en
  attente avant de modifier votre abonnement. » / lecture seule manuelle : « Contactez ImmoTopia. »).
- **AL-C3** : le libre-service ne change pas de pack incompatible (Intégré exclusif, paliers) : l'offre
  est affichée « non disponible » avec la raison, et le changement de pack reste à ImmoTopia
  (`changePack`, super-admin). Le retrait du DERNIER pack détenu est refusé (« Pour résilier,
  contactez ImmoTopia. »).
- **AL-C4** : les espaces particuliers (`PARTICULIER_PACKS`) gardent leur parcours de montée de
  palier (`PersonalTierCard`, `/subscription/upgrade`) ; le libre-service des packs et extensions
  leur est refusé côté serveur et masqué côté écran.
- **AL-C5** : remise commerciale, prix figé et note restent des champs super-admin : les routes
  agence ne les acceptent pas (schéma zod strict).
- **AL-C6** : URL inchangée `/tenant/:tenantId/settings/abonnement` (liens existants), onglets par
  `?onglet=` ; une entrée de menu dédiée « Abonnement et factures ».

## 3. Contrat d'API (agence)

Toutes sous `/api/tenants/:tenantId/subscription` (préfixe EXEMPT de la lecture seule dans
`lib/subscription/route-features.ts`, les refus d'AL-C2 sont donc faits par le service).
`authenticate`, `requireTenantAccess`, enveloppe `{ success, data }`, montants en FCFA HT sauf
mention, dates ISO.

### 3.1 `GET /overview` — `TENANT_SETTINGS_VIEW`

```ts
interface SubscriptionAccountOverview {
  phase: "NONE" | "TRIAL" | "ACTIVE" | "GRACE" | "READ_ONLY";
  billingCycle: "MONTHLY" | "ANNUAL" | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  isParticulier: boolean; // AL-C4
  canManage: boolean; // l'appelant a TENANT_SUBSCRIPTION_MANAGE ET pas de lecture seule
  manageBlockedReason: string | null; // raison si canManage est faux à cause d'AL-C2 (null si c'est la permission)
  items: AccountItem[]; // éléments en vigueur ou programmés (pas les ENDED)
  capacities: CapacityBreakdown[];
  balance: {
    amountDue: number;
    overdueAmount: number;
    nextDueAt: string | null;
    currency: "FCFA";
  }; // TTC
}
interface AccountItem {
  id: string;
  code: string;
  name: string;
  kind: "PACK" | "EXTENSION" | "SETUP";
  quantity: number;
  unitMonthlyPrice: number; // prix figé HT
  monthlyAmount: number; // quantity × prix × (1 − remise) HT
  startsAt: string;
  endsAt: string | null; // non nul et futur = retrait programmé
  removalScheduled: boolean;
  parentItemId: string | null;
  capacities: Partial<Record<CapacityKeyCode, number>>; // capacité apportée (unités × capacité unitaire)
  canScheduleRemoval: boolean; // faux : dernier pack, SETUP, déjà programmé…
  canCancelRemoval: boolean;
}
interface CapacityBreakdown {
  key: CapacityKeyCode;
  included: number; // apporté par les packs
  extensions: number; // apporté par les extensions
  overrides: number; // dérogations super-admin en cours (montant seul, pas le motif)
  limit: number; // = entitlements.capacities[key].limit
  used: number;
  overage: number; // max(0, used − limit)
  estimatedOverageAmount: number | null; // HT, à ce jour, si quotaPolicy = BILL_OVERAGE
}
```

### 3.2 `GET /catalog` — `TENANT_SETTINGS_VIEW`

Offres PACK et EXTENSION vendables (`isSellable`), jamais SETUP. Vide pour un espace particulier.

```ts
interface CatalogOffer {
  code: string;
  kind: "PACK" | "EXTENSION";
  name: string;
  description: string | null;
  unitMonthlyPrice: number; // prix HT d'une unité pour CETTE agence (packs détenus pris en compte ; 1er palier pour les lots)
  modules: string[];
  capacities: Partial<Record<CapacityKeyCode, number>>; // par unité
  held: boolean; // pack déjà détenu
  available: boolean;
  unavailableReason: string | null; // incompatibilité, pack requis, déjà détenu…
  maxQuantity: number; // 1 pour un pack, 100 pour une extension
}
```

### 3.3 `POST /items/quote` — `TENANT_SETTINGS_VIEW`, corps strict `{ code: string, quantity?: int ≥ 1 }`

Calcul à blanc, avec EXACTEMENT la logique d'`addSubscriptionItem` (refactorisée en une fonction de
plan commune, rien n'est écrit). Mêmes refus que l'ajout (400/409 avec message).

```ts
interface AddItemQuote {
  code: string;
  name: string;
  kind: "PACK" | "EXTENSION";
  quantity: number;
  segments: { quantity: number; unitMonthlyPrice: number }[];
  monthlyAmount: number; // HT, récurrent ajouté par mois (avant ×11 annuel)
  cycleAmount: number; // HT, récurrent ajouté par période de facturation
  prorata: {
    amount: number;
    from: string;
    periodEnd: string;
    remainingDays: number;
    totalDays: number;
  } | null; // null pendant l'essai
  comboDiscountDelta: number; // HT, ≤ 0 (prorata de la variation de remise de combinaison)
  taxRate: number; // 18
  dueOnNextInvoiceInclTax: number; // (prorata + delta) TTC, ajouté à la prochaine facture
  modulesOpened: string[];
  trial: boolean;
}
```

### 3.4 `POST /items` — `TENANT_SUBSCRIPTION_MANAGE`, corps strict `{ code, quantity? }`

Appelle `addSubscriptionItem(tenantId, { code, quantity }, userId)` après les gardes AL-C2/C4.
Réponse : `{ items: AccountItem[], pendingLines: [...], modules }` (reprendre la sérialisation existante).
Audit existant `SUBSCRIPTION_ITEM_ADDED`. Notifier le super-admin par e-mail si un mécanisme existe
déjà pour les demandes d'extension (sinon ne rien créer).

### 3.5 `POST /items/:itemId/schedule-removal` — `TENANT_SUBSCRIPTION_MANAGE`, corps strict `{ quantity?: int ≥ 1 }`

`removeSubscriptionItem(..., { immediate: false, quantity })`. `itemId` d'une autre agence →
`NotFoundError`. Refus du dernier pack (AL-C3). Réponse : `AccountItem` mis à jour.

### 3.6 `POST /items/:itemId/cancel-removal` — `TENANT_SUBSCRIPTION_MANAGE`

Annule un retrait programmé dont l'échéance n'est pas passée, en restaurant EXACTEMENT l'état
antérieur (retrait partiel : supprimer l'élément « reste » créé et lever l'échéance ; extensions
liées retirées avec le pack : les rétablir aussi). Si ce n'est pas faisable proprement → 409 avec
message. Nouvelle action d'audit `SUBSCRIPTION_ITEM_REMOVAL_CANCELED`.

### 3.7 `GET /invoice-preview` — `TENANT_SETTINGS_VIEW`

`previewNextInvoice(tenantId)` sans `pendingLineIds` : prochaine facture estimée à ce jour
(récurrent de la période suivante, prorata en attente, dépassement à ce jour, TVA ; annuel :
`overageInvoice`). Agence sans abonnement : 404 propre.

### 3.8 `GET /statement?from=&to=` — `TENANT_SETTINGS_VIEW`

```ts
interface AccountStatement {
  from: string | null;
  to: string | null;
  currency: "FCFA";
  openingBalance: number; // solde TTC avant `from` (0 sans `from`)
  entries: StatementEntry[]; // ordre chronologique croissant
  totals: {
    invoiced: number;
    credited: number;
    paid: number;
    balanceDue: number;
  }; // TTC, sur la fenêtre
}
interface StatementEntry {
  id: string; // `${type}:${sourceId}`
  date: string;
  type:
    | "INVOICE"
    | "CREDIT_NOTE"
    | "PAYMENT"
    | "ITEM_ADDED"
    | "ITEM_REMOVAL_SCHEDULED"
    | "ITEM_REMOVAL_CANCELED"
    | "ITEM_ENDED";
  label: string; // libellé français (traduit par l'API, i18n/index.ts)
  reference: string | null; // numéro de facture / d'avoir, référence de paiement
  invoiceId: string | null;
  debit: number; // TTC, factures
  credit: number; // TTC, avoirs et paiements
  balanceAfter: number | null; // null pour un mouvement non monétaire
  actorName: string | null; // prénom nom (select sur User, jamais l'objet complet)
  status: string | null; // statut de la facture le cas échéant
}
```

Factures en brouillon et annulées exclues. Paiement = `PlatformInvoicePayment`. Mouvements
d'éléments : `SubscriptionItem.startsAt/addedByUserId`, `endsAt/endedByUserId` (et l'audit pour les
annulations). Tout filtré par `tenantId`.

## 4. Écran

`/tenant/:tenantId/settings/abonnement`, titre « Abonnement et factures », onglets (`?onglet=`) :

1. **Vue d'ensemble** — statut, cycle, période, alerte lecture seule (existant), solde dû à ce jour
   et prochaine échéance, prochaine facture estimée (total TTC), modules, `PersonalTierCard`.
2. **Packs et extensions** — éléments détenus (prix, capacité apportée, retrait programmé avec date,
   boutons Retirer à l'échéance / Annuler le retrait) ; catalogue en cartes (prix, capacités,
   modules, raison si indisponible, bouton Ajouter) ; fenêtre d'ajout : quantité, devis (`/quote`)
   — montant mensuel, prorata et nombre de jours, montant TTC ajouté à la prochaine facture — puis
   confirmation explicite. Masqué pour un particulier. Le formulaire « Autre demande » existant
   reste en bas. Boutons absents sans `canManage` (avec `manageBlockedReason` affiché).
3. **Consommation** — par capacité : inclus (packs), extensions, dérogations, limite, utilisé, barre,
   dépassement et montant estimé ; lien « Ajouter une extension » vers l'onglet 2.
4. **Factures** — « Prochaine facture estimée à ce jour » (lignes, HT, TVA, TTC, période) puis
   `TenantInvoicesSection` existant (PDF, paiement en ligne).
5. **Relevé de compte** — filtre de période, solde d'ouverture, tableau (date, mouvement, référence,
   débit, crédit, solde, par), totaux, export (primitive `Table`).

## 5. Vérifications attendues

- Tests API : permission (`TENANT_SUBSCRIPTION_MANAGE` requise, `TENANT_SETTINGS_VIEW` en lecture),
  isolation (`itemId` d'une autre agence → 404), lecture seule → refus, particulier → refus, dernier
  pack → refus, devis = ajout (mêmes montants), annulation de retrait, solde du relevé.
  `routes-inventory.test.ts` à jour.
- Tests web : onglets, devis puis confirmation, boutons masqués sans `canManage`, relevé.
- `npm run typecheck`, `npm run lint`, `npm run check:architecture`, i18n (fr/en/ar), RTL.
- Recette navigateur sur l'instance de démo.
