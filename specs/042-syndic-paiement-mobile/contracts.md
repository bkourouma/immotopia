# Contrats 042 — Paiement mobile money des charges de copropriété

**Spec** : [spec.md](./spec.md) · **Plan** : [plan.md](./plan.md) · **Tâches** : [tasks.md](./tasks.md)

Ce document est la **référence unique** des agents API et web, qui travaillent en parallèle. En
cas d'écart entre une implémentation et ce fichier, c'est l'implémentation qui a tort ; un doute
se signale au coordinateur, il ne se tranche pas seul.

## 0. Conventions communes

- **Enveloppe** : succès `{ success: true, data: T }` ; erreur
  `{ success: false, message: string, code?: string, errors?: {field,message}[], data?: unknown }`
  (`errorHandler` existant). Les messages sont en français, passés par `t()`.
- **Montants** : nombres JavaScript en unités (FCFA, entiers pour tout ce qui part chez le
  fournisseur). **Dates** : chaîne ISO 8601 (`toISOString()`) ; une date de jour en entrée est
  `YYYY-MM-DD`.
- **Identifiants** : UUID, sauf `codePaiement` (`IMS-` + 20 caractères `[A-Za-z0-9]`).
- **Corps** : schémas Zod `.strict()` sur les routes authentifiées (champ inconnu = 400
  `VALIDATION_ERROR`). Sur les routes publiques, champs en trop **ignorés** (jamais lus).
- **Isolation** : aucun identifiant d'agence n'est lu d'un corps. Gestionnaire : `:tenantId`
  contrôlé par `requireTenantAccess`, `:syndicId` par `assertSyndicateOfTenant`. Portail et public :
  l'agence vient de la session ou du jeton. Un objet d'une autre agence répond comme un objet
  inexistant (404).
- **Pas de nouvelle variable d'environnement** : `PAYMENT_SECRETS_KEY`, `PAYSECUREHUB_*`,
  `SECURE_LINK_*`, `FRONTEND_URL`, `BACKEND_URL` existent déjà.
- Les types ci-dessous portent **les mêmes noms** côté API (`packages/api/src/lib/syndics/online-payment/types.ts`)
  et côté web (dans les services). Le web ne les importe pas de l'API : il les recopie.

### 0.1 Types partagés

```ts
export type OnlineCheckoutStatus =
  "PENDING" | "SUCCESS" | "FAILED" | "CANCELED" | "EXPIRED" | "REVIEW";
/** Vue du copropriétaire et de la page publique : REVIEW -> PENDING, EXPIRED -> CANCELED. */
export type PublicCheckoutStatus =
  "PENDING" | "SUCCESS" | "FAILED" | "CANCELED";
export type GatewayMode = "SIMULATOR" | "LIVE";
export type FeesPaidBy = "CLIENT" | "AGENCY"; // recopié de PaymentGatewayConfig.feesPaidBy de l'agence, CLIENT par défaut
export type CheckoutOrigin = "PORTAL" | "SECURE_LINK";
/** Moyens annoncés au payeur (ne préjuge pas de ceux activés chez PaySecureHub). */
export type OnlinePaymentChannel =
  "WAVE" | "ORANGE_MONEY" | "MTN_MONEY" | "MOOV_MONEY" | "CARD";
export type ReviewKind =
  | "AMOUNT_MISMATCH" // montant payé différent du montant attendu
  | "FISCAL_YEAR_CLOSED" // exercice clos à la date du paiement
  | "CALLS_UNAVAILABLE" // un appel visé a disparu ou n'appartient plus au lot
  | "DUPLICATE_TRANSACTION" // transaction fournisseur déjà enregistrée
  | "CONTRARY_STATE"; // le fournisseur rapporte échec/annulation après un succès
export type ReviewResolution = "ACCEPTED" | "REJECTED";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface DocumentRef {
  id: string;
  kind: "RECEIPT" | "QUITTANCE";
  number: string;
}

/** Ligne du suivi gestionnaire. */
export interface SyndicOnlineCheckoutRow {
  id: string;
  codePaiement: string;
  status: OnlineCheckoutStatus;
  origin: CheckoutOrigin;
  mode: GatewayMode;
  amount: number; // demandé
  receivedAmount: number | null; // payé selon le fournisseur, dès qu'il l'a rapporté
  currency: string;
  lot: { id: string; lotNumber: string };
  /** Payeur résolu au lancement ; null si la fiche a disparu. */
  payer: { contactId: string; name: string } | null;
  chargeCalls: Array<{ id: string; period: string }>;
  providerServiceName: string | null; // « Wave », « Orange Money »…
  providerTransactionId: string | null;
  providerFees: number | null;
  failureMessage: string | null;
  reviewKind: ReviewKind | null;
  reviewReason: string | null; // texte à afficher
  resolution: ReviewResolution | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  chargePaymentId: string | null; // non nul = encaissement enregistré
  lastCheckedAt: string | null;
  createdAt: string;
  completedAt: string | null;
}
```

### 0.2 Codes d'erreur (ajouts à `ErrorCode`)

| Code                                  | HTTP | Sens                                                                                                  |
| ------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| `ONLINE_PAYMENT_UNAVAILABLE`          | 400  | Copropriété sans configuration active et utilisable (jamais de repli sur le compte du cabinet)        |
| `ONLINE_PAYMENT_NOTHING_DUE`          | 400  | Aucun appel sélectionné n'a de reste dû                                                               |
| `CHARGE_CALL_ALREADY_SETTLED`         | 400  | Au moins un appel sélectionné est déjà soldé                                                          |
| `ONLINE_PAYMENT_CURRENCY_UNSUPPORTED` | 400  | Devise autre que XOF/FCFA, ou devises mélangées                                                       |
| `ONLINE_PAYMENT_IN_PROGRESS`          | 409  | Un paiement `PENDING` récent couvre déjà un des appels (`data` : voir 3.1)                            |
| `ONLINE_PAYMENT_UNDER_REVIEW`         | 409  | Un paiement `REVIEW` couvre un des appels : à trancher par le gestionnaire                            |
| `ONLINE_PAYMENT_PROVIDER_UNREACHABLE` | 502  | PaySecureHub n'a pas répondu (`build-away` ou statut)                                                 |
| `SYNDIC_FEATURE_DENIED`               | 403  | Abonnement de l'agence sans droit sur le module SYNDIC (portail seulement)                            |
| `GATEWAY_ENCRYPTION_UNAVAILABLE`      | 400  | `PAYMENT_SECRETS_KEY` absente : aucune clé enregistrable                                              |
| `GATEWAY_SIMULATOR_UNAVAILABLE`       | 400  | Mode `SIMULATOR` demandé alors qu'il est interdit sur ce serveur                                      |
| `GATEWAY_CREDENTIALS_REQUIRED`        | 400  | Activation en `LIVE` sans identifiant marchand ou sans clé                                            |
| `GATEWAY_CHECKOUTS_PENDING`           | 409  | Changement de mode, d'identifiant marchand ou de clé alors qu'un paiement est `PENDING`               |
| `CHECKOUT_NOT_VERIFIABLE`             | 409  | Vérification demandée sur un paiement ni `PENDING` ni `REVIEW`                                        |
| `CHECKOUT_NOT_IN_REVIEW`              | 409  | Décision demandée sur un paiement qui n'est pas (ou plus) `REVIEW`                                    |
| `REVIEW_NOT_REJECTABLE`               | 409  | Refus d'un `REVIEW` dont l'encaissement est déjà enregistré (`CONTRARY_STATE` avec `chargePaymentId`) |
| `REVIEW_NOT_ACCEPTABLE`               | 409  | Acceptation d'un `REVIEW` `DUPLICATE_TRANSACTION`                                                     |
| `PAYOUT_EXCEEDS_COLLECTED`            | 400  | Reversement supérieur au solde du compte 5525                                                         |
| `PAYOUT_DUPLICATE`                    | 409  | Référence de reversement déjà utilisée dans cette copropriété                                         |

Les erreurs génériques existantes restent : 400 `VALIDATION_ERROR`, 401, 403, 404 (`NotFoundError`),
429 (limiteur). La clôture d'exercice lève la `BadRequestError` existante de
`assertFiscalYearOpenTx` (400, message déjà traduit).

---

## 1. Gestionnaire — `/api/tenants/:tenantId/syndics/:syndicId`

Fichier de routes : `packages/api/src/routes/syndic-online-payment-routes.ts`, monté sur `/api`.
Classé `SYNDIC` par le préfixe `/syndics` de `route-features.ts` (aucune entrée à ajouter).
Gardes posées avec leur chemin, jamais en `router.use` nu :
`authenticate, requireTenantAccess, enforcePropertyTenantIsolation`, puis la permission indiquée.
`canView = requireAnyPropertyPermission(['SYNDIC_VIEW'])`, `canEdit = requirePropertyPermission('SYNDIC_EDIT')`,
`canEditSecrets = requirePermission('TENANT_SETTINGS_EDIT')` (en plus de `canEdit`).

### 1.1 `GET /paiement-en-ligne/configuration`

Garde : `canView`. Pas de corps. 404 si la copropriété n'est pas de l'agence.

```ts
export interface SyndicPaymentGatewaySettings {
  syndicateId: string;
  provider: "PAYSECUREHUB";
  mode: GatewayMode; // SIMULATOR sans ligne en base
  isActive: boolean; // false sans ligne
  merchantId: string | null;
  /** La clé n'est JAMAIS renvoyée : seulement sa présence et ses 4 derniers caractères. */
  apiKeyConfigured: boolean;
  apiKeyLast4: string | null;
  /** isActive ET (SIMULATOR, ou merchantId + clé). C'est ce qui fait apparaître « Payer ». */
  usable: boolean;
  callbackUrl: string; // à communiquer à PaySecureHub
  simulatorAvailable: boolean;
  encryptionAvailable: boolean;
  lastTest: { at: string; ok: boolean; message: string } | null;
  /** Frais : suit la configuration de l'AGENCE (information affichée au payeur). */
  agencyFeesPaidBy: FeesPaidBy;
  /** Compte de trésorerie 5525 de la copropriété (créé à la première utilisation). */
  collectionAccount: {
    accountNumber: "5525";
    exists: boolean;
    balance: number;
  };
  updatedAt: string | null;
}
```

`collectionAccount.balance` = solde débiteur comptable du 5525 de **cette** copropriété (0 si le
compte n'existe pas). Sans ligne en base, la route ne crée rien.

### 1.2 `PUT /paiement-en-ligne/configuration`

Garde : `canEdit` **et** `canEditSecrets`. Limiteur : 20/min/utilisateur.

```ts
export interface UpdateSyndicPaymentGatewayBody {
  mode?: GatewayMode;
  isActive?: boolean;
  merchantId?: string | null; // trim, max 120 ; '' ou null = effacer
  /** Écriture seule : absent = inchangée ; '' = efface ; max 500. Jamais préremplie côté web. */
  apiKey?: string;
}
```

Réponse 200 : `SyndicPaymentGatewaySettings` (relu). Règles :

- `mode: 'SIMULATOR'` interdit si `!paymentGatewaySimulatorAvailable` -> 400 `GATEWAY_SIMULATOR_UNAVAILABLE`.
- `apiKey` non vide sans `PAYMENT_SECRETS_KEY` -> 400 `GATEWAY_ENCRYPTION_UNAVAILABLE`.
- Résultat `isActive && mode==='LIVE'` sans `merchantId` ou sans clé -> 400 `GATEWAY_CREDENTIALS_REQUIRED`.
- Si `mode`, `merchantId` ou `apiKey` **change** alors qu'un `SyndicOnlineCheckout` `PENDING` de cette
  copropriété existe -> 409 `GATEWAY_CHECKOUTS_PENDING` (la vérification utiliserait un autre compte).
  Activer/désactiver reste permis.
- Upsert sur `syndicateId` (une ligne par copropriété), `tenantId` posé côté serveur.
- Audit `SYNDIC_GATEWAY_CONFIG_UPDATED` : `{ syndicateId, mode, isActive, merchantIdChanged, apiKeyChanged }`.
  **Jamais** la clé, ni son chiffré, ni ses 4 derniers caractères.

### 1.3 `POST /paiement-en-ligne/configuration/test`

Garde : `canEdit` **et** `canEditSecrets`. Limiteur : 10/min/utilisateur. Pas de corps.

```ts
export interface SyndicPaymentGatewayTestResult {
  ok: boolean;
  message: string;
  balance: { amount: number; currency: string; at: string } | null;
}
```

200 toujours (une panne fournisseur donne `ok:false`, jamais un 500). `SIMULATOR` : `ok:true`,
`balance:null`. `LIVE` sans identifiants : `ok:false` avec le message de configuration. Le résultat
est enregistré (`lastTestAt/Ok/Message`) ; la ligne est créée si elle n'existe pas (inactive).
La clé utilisée est **celle de la copropriété**.

### 1.4 `GET /paiement-en-ligne/solde`

Garde : `canView`. Limiteur : 10/min/utilisateur.

```ts
export interface SyndicProviderBalance {
  available: boolean; // false : pas de compte utilisable ou fournisseur injoignable
  balance: { amount: number; currency: string; at: string } | null;
  message: string | null; // motif quand available=false, ou « Mode simulateur »
}
```

200 toujours. Appelle `getBalance` avec la clé de la copropriété. Solde **fournisseur**, à comparer
au `collectionAccount.balance` comptable.

### 1.5 `GET /paiements-en-ligne`

Garde : `canView`.

Query : `status?` (liste séparée par des virgules de `OnlineCheckoutStatus`, défaut : tous),
`origin?: CheckoutOrigin`, `lotId?: uuid`, `from?`/`to?` (`YYYY-MM-DD`, bornes sur `createdAt`,
`to` inclus), `page?` (défaut 1), `limit?` (défaut 20, max 100). Tri : `createdAt` décroissant.

```ts
export interface SyndicOnlineCheckoutsResult {
  items: SyndicOnlineCheckoutRow[];
  pagination: Pagination;
  /** Compteurs de TOUTE la copropriété (pas de la page ni du filtre) pour les pastilles. */
  counts: Record<OnlineCheckoutStatus, number>;
}
```

### 1.6 `POST /paiements-en-ligne/:checkoutId/verifier`

Garde : `canEdit`. Limiteur : 20/min/utilisateur. Pas de corps.

```ts
export interface VerifySyndicCheckoutResult {
  checkout: SyndicOnlineCheckoutRow;
  /** true si le statut ou l'encaissement a changé pendant cet appel. */
  changed: boolean;
}
```

- Demande le statut au fournisseur **avec la clé de la copropriété** puis applique le moteur
  (3.3 de la spec). Autorisé sur `PENDING` et `REVIEW`.
- Sur `REVIEW`, la vérification **ne crée jamais d'encaissement** : elle met seulement à jour le
  suivi (`lastProviderState`, `receivedAmount`, `lastCheckedAt`). Seule la décision (1.7) tranche.
- Erreurs : 404 paiement inconnu ou d'une autre copropriété ; 409 `CHECKOUT_NOT_VERIFIABLE` ;
  502 `ONLINE_PAYMENT_PROVIDER_UNREACHABLE`.

### 1.7 `POST /paiements-en-ligne/:checkoutId/trancher`

Garde : `canEdit`. Limiteur : 20/min/utilisateur.

```ts
export interface DecideSyndicCheckoutBody {
  decision: "ACCEPT" | "REJECT";
  note: string; // trim, 1 à 500, obligatoire (audit)
  /** ACCEPT seulement : date d'encaissement (défaut : aujourd'hui). Sert à sortir d'un exercice clos. */
  paidAt?: string; // YYYY-MM-DD, pas dans le futur
}

export interface DecideSyndicCheckoutResult {
  checkout: SyndicOnlineCheckoutRow; // status SUCCESS (ACCEPT) ou FAILED (REJECT), resolution renseignée
  /** Présent seulement si cet appel a enregistré l'encaissement. */
  payment: {
    id: string;
    amount: number;
    unallocatedAmount: number; // part devenue avance
    documents: DocumentRef[];
  } | null;
}
```

Règles (par `reviewKind`) :

| `reviewKind`                                                       | ACCEPT                                                                                                                                                                                              | REJECT                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `AMOUNT_MISMATCH`, `FISCAL_YEAR_CLOSED`, `CALLS_UNAVAILABLE`       | enregistre l'encaissement du **montant reçu** (`receivedAmount`, à défaut le montant demandé) sur les appels visés encore ouverts, l'excédent devient une avance ; `SUCCESS`, `resolution=ACCEPTED` | aucun encaissement ; `FAILED`, `resolution=REJECTED`, `failureMessage` = note |
| `DUPLICATE_TRANSACTION`                                            | 409 `REVIEW_NOT_ACCEPTABLE`                                                                                                                                                                         | `FAILED`, `REJECTED`                                                          |
| `CONTRARY_STATE` avec encaissement (`chargePaymentId`)             | aucun nouvel encaissement ; `SUCCESS`, `resolution=ACCEPTED`                                                                                                                                        | 409 `REVIEW_NOT_REJECTABLE`                                                   |
| `CONTRARY_STATE` sans encaissement (succès tardif après `EXPIRED`) | enregistre l'encaissement du **montant reçu**, comme les autres motifs (appels soldés entre-temps : le reliquat devient une avance) ; `SUCCESS`, `resolution=ACCEPTED`                              | aucun encaissement ni remboursement ; `FAILED`, `resolution=REJECTED`         |

- Une seule transaction : claim atomique (`status='REVIEW'` -> nouveau statut), encaissement
  éventuel (même fonction que le succès automatique), reçus/quittances ; envoi après commit.
- `CONTRARY_STATE` se tranche selon `chargePaymentId`, pas selon le seul motif : renseigné, l'encaissement existe déjà (ACCEPT clôt, REJECT refusé) ; nul, c'est un succès tardif après expiration (ACCEPT encaisse, REJECT permis).
- `DUPLICATE_TRANSACTION` : ACCEPT refusé (409 `REVIEW_NOT_ACCEPTABLE`), la transaction fournisseur étant déjà enregistrée sur un autre paiement ; seul REJECT est possible.
- ACCEPT dans un exercice clos sans `paidAt` ouvert -> 400 (message de `assertFiscalYearOpenTx`).
- 404 paiement inconnu ; 409 `CHECKOUT_NOT_IN_REVIEW` si le statut n'est pas `REVIEW` (y compris
  deuxième décision concurrente : le claim atomique garantit un seul vainqueur).
- Audit `SYNDIC_ONLINE_PAYMENT_RESOLVED` : `{ checkoutId, codePaiement, decision, reviewKind, amount, note }`.
- Un REJECT **ne rembourse pas** le payeur : l'argent reste chez PaySecureHub (écran : rappel).

### 1.8 `GET /paiement-en-ligne/reversements`

Garde : `canView`. Query : `limit?` (défaut 50, max 200). Tri : date décroissante.

```ts
export interface SyndicGatewayPayout {
  entryId: string;
  reference: string; // référence saisie
  date: string; // jour du reversement
  amount: number;
  note: string | null;
  createdAt: string;
}
export type SyndicGatewayPayoutsResult = { items: SyndicGatewayPayout[] };
```

Les reversements annulés (écriture contre-passée) n'y figurent pas.

### 1.9 `POST /paiement-en-ligne/reversements`

Garde : `canEdit`. Limiteur : 20/min/utilisateur.

```ts
export interface RecordGatewayPayoutBody {
  amount: number; // > 0, max 9_999_999_999.99
  date: string; // YYYY-MM-DD, pas dans le futur
  reference: string; // trim, 1 à 120 : référence du virement chez le fournisseur
  note?: string | null; // max 250
}
export interface RecordGatewayPayoutResult {
  entryId: string;
  reference: string;
  amount: number;
  date: string;
  /** Solde du 5525 après l'écriture. */
  collectionBalanceAfter: number;
}
```

201. Écriture comptable de la copropriété (scope SYNDICATE) : **débit 521 Banque / crédit 5525**, journal
     banque, `documentType = 'SYNDIC_GATEWAY_PAYOUT'`. Les comptes 521 et 5525 sont créés à la demande.
     Erreurs : 400 `PAYOUT_EXCEEDS_COLLECTED` (montant > solde du 5525) ; 400 exercice clos ; 409
     `PAYOUT_DUPLICATE` (référence normalisée en majuscules déjà utilisée, écriture non annulée) ;
     400 `VALIDATION_ERROR`. Audit `SYNDIC_GATEWAY_PAYOUT_RECORDED`. Ce n'est qu'un **enregistrement** :
     aucun virement n'est déclenché.

### 1.10 Lien « Payer cet appel » côté gestionnaire

Trois routes, sur le patron exact de la spec 039 (§FR-007 à FR-010). Appel désigné par `:chargeId`
(`ChargeCall.id` de la copropriété). Garde : `canEdit` (POST/DELETE), `canView` (GET).

`POST /charges/:chargeId/lien-paiement`

```ts
export interface CreateChargeCallPaymentLinkBody {
  delivery: "SEND" | "COPY";
  ttlDays?: number; // entier 1 à 30 ; au-delà : 400, jamais tronqué
}
export type CreateChargeCallPaymentLinkResult =
  // COPY -> 201 ; l'URL n'est renvoyée QU'UNE FOIS
  | {
      linkId: string;
      url: string;
      expiresAt: string;
      amountDue: number;
      currency: string;
    }
  // SEND, au moins un message parti -> 201
  | {
      sent: true;
      channel: "EMAIL" | "WHATSAPP";
      linkId: string;
      expiresAt: string;
      amountDue: number;
      currency: string;
    }
  // SEND, aucun message parti -> 200 ; aucun lien conservé
  | {
      sent: false;
      reason:
        | "NO_ELIGIBLE_CHANNEL"
        | "EVENT_DISABLED"
        | "SEND_FAILED"
        | "RECIPIENT_NOT_FOUND";
    };
```

- 400 `ONLINE_PAYMENT_UNAVAILABLE` (copropriété sans configuration utilisable), 400 appel soldé
  (`ONLINE_PAYMENT_NOTHING_DUE`), 404 appel d'une autre copropriété/agence.
- SEND : destinataire = le **copropriétaire réel** (règle unique `resolveChargeCallRecipient` +
  `isCurrentLotOwner`), jamais fourni par l'appelant. Événement `CHARGE_CALL_PAYMENT_LINK_SENT`
  (e-mail et WhatsApp, rattaché à la fonctionnalité `SYNDIC`). Audit `SYNDIC_CHARGE_PAYMENT_LINK_SENT`
  sans jeton ni URL.

`GET /charges/:chargeId/liens-paiement` -> `ChargeCallPaymentLinkSummary[]` :

```ts
export interface ChargeCallPaymentLinkSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  viewCount: number;
  lastViewedAt: string | null;
  createdByUserId: string | null; // null : lien joint automatiquement à un avis ou une relance
  payment: {
    status: "NONE" | OnlineCheckoutStatus;
    amount: number | null;
    updatedAt: string | null;
  };
}
```

Jamais de jeton, de hash ni d'URL. `DELETE /charges/:chargeId/lien-paiement/:linkId` -> 200
`{ revoked: true }`, idempotent ; un lien d'un autre appel = 404 uniforme. Audit
`SECURE_LINK_REVOKED` existant.

---

## 2. Portail copropriétaire — `/api/portal/copropriete`

Ajouts à `routes/coowner-portal-routes.ts` (derrière `authenticate` + `requireCoOwnerPortalAccess`,
hors garde d'abonnement). Contrôleur : `controllers/coowner-online-payment-controller.ts`. L'agence, le
lot et le payeur viennent de `req.coOwnerPortal.scope` : **aucun** identifiant de copropriétaire,
d'agence, de contact ou de montant n'est lu du corps. Ordre de déclaration : `/paiements-en-ligne/disponibilite`
**avant** `/paiements-en-ligne/:codePaiement`.

**Droit SYNDIC** : le portail n'est pas protégé par `subscriptionRouteGuard`. Chaque route de cette
section appelle `assertSyndicOnlinePaymentAllowed(tenantId)` (réutilise `evaluateSchedulingGate` :
agence active + `evaluateFeatureAccess(entitlements, 'SYNDIC', true)`, avec les modes `off`/`warn`/`enforce`).
Refus -> 403 `SYNDIC_FEATURE_DENIED` ; pour la disponibilité, `available:false` (pas d'erreur).

### 2.1 `GET /paiements-en-ligne/disponibilite`

```ts
export interface CoOwnerOnlinePaymentAvailability {
  syndicates: Array<{
    syndicateId: string;
    name: string;
    available: boolean; // configuration utilisable ET droit SYNDIC ET agence non suspendue
    unavailableReason: null | "NOT_CONFIGURED" | "SUBSCRIPTION";
    mode: GatewayMode | null; // null si NOT_CONFIGURED
    simulated: boolean; // mode === 'SIMULATOR'
    feesPaidBy: FeesPaidBy; // celui de l'agence, CLIENT sans configuration
  }>;
  paymentMethods: OnlinePaymentChannel[]; // ['WAVE','ORANGE_MONEY','MTN_MONEY','MOOV_MONEY','CARD']
}
```

Une entrée par copropriété du périmètre. Sans configuration active : `available:false` -> l'écran
n'affiche **aucun** bouton « Payer ».

### 2.2 Ajout aux lignes de `GET /appels` (réponse existante, additif)

Chaque `CoOwnerChargeCall` gagne deux champs ; le reste de la réponse et son tableau sont inchangés
(pas de rupture) :

```ts
export interface CoOwnerChargeCall /* + */ {
  /** Copropriété payable en ligne ET reste dû > 0 ET devise XOF/FCFA. */
  onlinePayable: boolean;
  /** Paiement en cours (PENDING < 15 min) ou à vérifier (REVIEW) couvrant cet appel. */
  onlineCheckout: "NONE" | "IN_PROGRESS" | "REVIEW";
  /** Copropriété de l'appel : l'écran retrouve sa disponibilité par identifiant, jamais par nom. */
  syndicateId: string;
  /**
   * Code du paiement ouvert (`IN_PROGRESS` ou `REVIEW`) lancé par CE compte portail, pour le reprendre
   * (`GET /paiements-en-ligne/:codePaiement` rend alors l'URL du fournisseur) ; `null` si aucun, ou si le
   * paiement ouvert vient d'un autre compte ou d'un lien sécurisé.
   */
  onlineCheckoutCode: string | null;
}
```

**Choix** : champs par appel plutôt qu'une route par appel (une seule requête, la liste existante
suffit à griser le bouton), plus la route `disponibilite` pour les informations par copropriété
(mode, frais) qui ne tiennent pas dans un tableau.

### 2.3 `POST /paiements-en-ligne`

Corps :

```ts
export interface StartCoOwnerOnlinePaymentBody {
  lotId: string; // uuid, un lot du périmètre
  chargeCallIds: string[]; // uuid, 1 à 24, sans doublon, tous du lot
}
```

Réponse : `201 { success, data: CoOwnerOnlineCheckout }`, ou `200` si le checkout `PENDING` existant
est **repris** (`reused: true`).

```ts
export interface CoOwnerOnlineCheckout {
  codePaiement: string;
  status: PublicCheckoutStatus;
  underReview: boolean; // true quand le statut interne est REVIEW (affiché « en cours de vérification »)
  amount: number; // FCFA entier, recalculé par le serveur
  currency: string;
  chargeCallIds: string[];
  periods: string[]; // libellés de période, dans l'ordre d'échéance
  checkoutUrl: string | null; // page hébergée ; null hors PENDING
  reused: boolean; // POST seulement ; toujours false sur GET
  lot: { id: string; lotNumber: string };
  syndicate: { id: string; name: string };
  mode: GatewayMode;
  feesPaidBy: FeesPaidBy;
  documents: DocumentRef[]; // vide tant que status != SUCCESS
  createdAt: string;
  completedAt: string | null;
}
```

Le serveur : (1) droit SYNDIC ; (2) `lotId` dans le périmètre et appels éligibles
(`ownedChargeCallsWhere`, même `lotId`), sinon 404 `Lot introuvable.` / `Appel de charges introuvable.` ;
(3) configuration **de la copropriété** utilisable, sinon 400 `ONLINE_PAYMENT_UNAVAILABLE` ;
(4) sous verrou consultatif `(tenantId, lotId)`, recalcule le reste dû de chaque appel (somme des
affectations), refuse un appel soldé (400 `CHARGE_CALL_ALREADY_SETTLED`) ; montant = somme arrondie à
l'entier ; (5) contrôle les chevauchements (voir ci-dessous) ; (6) crée le `SyndicOnlineCheckout`
`PENDING` (origine `PORTAL`, `tenantClientId` de la session, payeur = contact du lot dans le périmètre) ;
(7) appelle `build-away` **hors transaction** avec la clé de la copropriété et l'URL de retour
`${FRONTEND_URL}/copropriete/appels?paiement=<codePaiement>` ; URL fournisseur validée avant stockage.

Chevauchement (sous verrou, appels en commun) :

- `PENDING` de moins de 15 min, origine `PORTAL`, mêmes appels, même montant, même mode, URL présente
  -> **reprise** (200, `reused:true`).
- tout autre `PENDING` récent (autre origine, autres appels, autre montant, URL pas encore stockée) ->
  409 `ONLINE_PAYMENT_IN_PROGRESS`, `data: { codePaiement, checkoutUrl } | undefined` (renseigné seulement si
  l'existant est d'origine `PORTAL` et a une URL).
- `REVIEW` (sans limite d'âge) -> 409 `ONLINE_PAYMENT_UNDER_REVIEW`.

Autres erreurs : 400 `ONLINE_PAYMENT_NOTHING_DUE`, 400 `ONLINE_PAYMENT_CURRENCY_UNSUPPORTED`, 403
`SYNDIC_FEATURE_DENIED`, 502 `ONLINE_PAYMENT_PROVIDER_UNREACHABLE` (paiement et checkout marqués
`FAILED`, jamais d'URL conservée), 400 `VALIDATION_ERROR` (corps).

### 2.4 `GET /paiements-en-ligne/:codePaiement`

`:codePaiement` au format `^IMS-[A-Za-z0-9]{20}$`, sinon 404. Réponse `CoOwnerOnlineCheckout`
(`reused:false`).

- Périmètre : le checkout doit appartenir à l'agence de la session **et** à un lot du périmètre ;
  sinon 404 (même réponse qu'un code inconnu).
- Si `PENDING` et non vérifié depuis plus de 10 s : réservation atomique de `lastCheckedAt` (un seul
  appel fournisseur par fenêtre), puis réconciliation serveur à serveur ; erreur fournisseur avalée
  (l'état stocké est renvoyé).
- Après le retour du fournisseur, l'écran (`/copropriete/appels?paiement=<code>`) interroge cette route
  toutes les 3 s, environ 2 minutes, tant que `status === 'PENDING'`. **Il ne se fie jamais au
  paramètre d'URL** : seul le statut serveur compte.

---

## 3. Public, lien sécurisé — `/api/public/secure-links`

Fichier : `routes/secure-link-public-routes.ts` (trois routes ajoutées), contrôleur
`controllers/charge-call-payment-public-controller.ts`. Chaque route : limiteur par IP **avant** toute
vérification, `secureLinkNoStoreHeaders` (`Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`,
`Referrer-Policy: no-referrer`) sur toute réponse, `express.json({ limit: '1kb' })`, erreur de parseur =
404 uniforme. Trois limiteurs aux **clés propres** (distinctes de ceux des loyers) : consultation 30/min,
démarrage 10/min, statut 90/min. Aucun identifiant ni montant n'est lu du corps : seuls `token` ou
`codePaiement`.

**Refus uniforme** : toute cause d'échec (jeton inconnu, expiré, révoqué, autre portée, agence inactive ou
suspendue, droit SYNDIC refusé, appel disparu ou soldé, configuration absente, lot passé à un autre
copropriétaire depuis l'appel) répond **la même** 404 :
`{ success:false, message:'Lien invalide ou expiré.' }` avec les mêmes en-têtes.

### 3.1 `POST /charge-call-payment`

Corps `{ token: string }` (1 à `TOKEN_MAX_LENGTH`). Réponse 200 :

```ts
export interface ChargeCallPaymentPublicDto {
  syndicateName: string;
  lotLabel: string; // « Lot A12 »
  period: string; // libellé de la période de l'appel
  dueDate: string;
  amountDue: number; // reste dû recalculé à l'ouverture (jamais celui de l'envoi)
  currency: string;
  expiresAt: string;
  paymentMethods: OnlinePaymentChannel[];
  simulated: boolean;
  feesPaidBy: FeesPaidBy;
  paymentInProgress: boolean; // PENDING < 15 min couvrant cet appel
  reviewPending: boolean; // REVIEW couvrant cet appel
}
```

Ni nom du copropriétaire, ni coordonnées, ni identifiant technique. Comptabilise la consultation
(`viewCount`, `lastViewedAt`, audit `SECURE_LINK_VIEWED`) **après** une lecture réussie.

### 3.2 `POST /charge-call-payment/start`

Corps `{ token: string }`. Réponse 200 `{ success, data: { checkoutUrl: string } }`.

Même mécanique que 2.3 pour **un** appel, origine `SECURE_LINK`, `secureLinkId` posé, `createdByUserId` =
créateur du lien (null pour un lien automatique), payeur = copropriétaire principal actuel du lot,
URL de retour `${FRONTEND_URL}/payer-charges/statut?paiement=<codePaiement>`. Reprise d'un `PENDING`
< 15 min d'origine `SECURE_LINK`, même appel, même montant, même mode, URL présente (`checkoutUrl`
identique). Erreurs : 404 uniforme (voir plus haut), 409 `ONLINE_PAYMENT_IN_PROGRESS` « Un paiement en
ligne est déjà en cours pour cet appel. » (sans `data`), 409 `ONLINE_PAYMENT_UNDER_REVIEW` « Votre
paiement est en cours de vérification par le syndic. Contactez votre syndic. », 502
`ONLINE_PAYMENT_PROVIDER_UNREACHABLE`. Audit `SECURE_LINK_CHARGE_PAYMENT_STARTED`
`{ linkId, chargeCallId, checkoutId, amount, reused }`.

### 3.3 `POST /charge-call-payment/status`

Corps `{ codePaiement: string }` (`^IMS-[A-Za-z0-9]{20}$`, sinon 404 uniforme). Réponse 200 :

```ts
export interface ChargeCallPaymentStatusDto {
  status: PublicCheckoutStatus;
  amount: number;
  currency: string;
  syndicateName: string;
  period: string;
}
```

Seuls les checkouts d'origine `SECURE_LINK` d'une agence non suspendue sont lisibles (un code du portail =
404 uniforme). Même réconciliation que 2.4. `REVIEW` est présenté `PENDING`, `EXPIRED` est présenté
`CANCELED`.

### 3.4 Pages web (routes React, hors `/api`)

| URL                                     | Page                                                  | Appelle                                       |
| --------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `/payer-charges#<jeton>`                | `ChargeCallPaymentPage` (lit le fragment, POST corps) | 3.1 puis 3.2                                  |
| `/payer-charges/statut?paiement=<code>` | `ChargeCallPaymentStatusPage`                         | 3.3, toutes les 3 s, ~2 min, `sessionStorage` |

Redirection vers le fournisseur : `window.location.assign` seulement vers une URL `https` (ou `http`
local en simulateur), même garde que `InstallmentPaymentPage`.

---

## 4. Routes techniques déjà publiques, étendues (pas de nouvelle route)

| Route existante                                          | Changement                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `POST /api/payment-gateway/paysecurehub/ipn`             | Un code `IMS-` est confié à `reconcileSyndicCheckoutPublic` (la clé de la copropriété) ; toujours 200, code inconnu tu |
| `GET/POST /api/payment-gateway/simulator/:codePaiement…` | Prend en charge `IMS-` : lecture du `SyndicOnlineCheckout`, redirection finale vers l'URL de retour du checkout        |
| Tâche `online-payment-reconciliation-job`                | Rapproche aussi les `SyndicOnlineCheckout` `PENDING` de plus de 2 min et expire ceux de plus de 48 h                   |

---

## 5. Variables des modèles de messages

Déjà posées par le lot M6 amorcé (`lib/syndics/charge-call-payment-url.ts`) :

- `{{paymentUrl}}` : URL du lien (vide sans lien) ;
- `{{paymentBlock}}` : « Payer en ligne : <url> », chaîne vide sans lien (précédée de deux sauts de ligne
  en WhatsApp). Présent dans les modèles par défaut de `CHARGE_CALL_ISSUED` et `CHARGE_CALL_REMINDER`
  (e-mail et WhatsApp). Les modèles personnalisés des agences ne sont pas modifiés : elles peuvent y
  ajouter `{{paymentUrl}}`.
- Nouvel événement `CHARGE_CALL_PAYMENT_LINK_SENT` (e-mail + WhatsApp) pour l'envoi manuel (1.10), avec
  les variables `ownerName, syndicateName, lotLabel, period, amountDue, currency, dueDate, paymentUrl, expiresAt`.

Résolveur : `resolveChargeCallPaymentUrl({ tenantId, syndicateId, lotId, chargeCallIds })` renvoie une URL
`http(s)` ou `null`, **sans jamais lever**. Pour exactement un appel (`chargeCallIds.length === 1`), il :
vérifie configuration utilisable + droit SYNDIC + reste dû > 0 ; crée un `SecureLink`
(`CHARGE_CALL_PAYMENT`, `objectType 'ChargeCall'`, `objectId` = appel, `createdByUserId` null, durée =
`SECURE_LINK_MAX_TTL_DAYS`) ; renvoie `${FRONTEND_URL}/payer-charges#<jeton>`. Sinon `null` : le message
part sans bloc de paiement.
