# Lot 7 — Paiement en ligne des loyers : contrat

Contrat entre le backend (`packages/api`) et le frontend (`apps/web`). Les deux
côtés s'y conforment à la lettre ; toute divergence se corrige ici d'abord.
Contexte fournisseur : [docs/integrations/paysecurehub.md](../integrations/paysecurehub.md).

Périmètre : paiement d'échéances par le locataire depuis son portail, via la
page hébergée PaySecureHub, avec un compte marchand par agence. **Hors
périmètre** : SMS (aucun fournisseur retenu), paiement direct sans page
hébergée, paiement par l'agence pour le compte du locataire, remboursements.

Toutes les réponses JSON suivent la convention existante `{ success: true, data }`.
Les montants sont des nombres en FCFA, les dates des chaînes ISO 8601.

## 1. Modèle de données (backend)

```prisma
enum PaymentGatewayProvider { PAYSECUREHUB }
enum PaymentGatewayMode { SIMULATOR LIVE }
enum PaymentGatewayFeesPayer { CLIENT AGENCY }
enum OnlineCheckoutStatus { PENDING SUCCESS FAILED CANCELED EXPIRED REVIEW }

/// Compte marchand de l'agence chez l'agrégateur. Un par agence.
model PaymentGatewayConfig {
  id                 String                   @id @default(uuid()) @db.Uuid
  tenantId           String                   @unique @map("tenant_id")
  provider           PaymentGatewayProvider   @default(PAYSECUREHUB)
  mode               PaymentGatewayMode       @default(SIMULATOR)
  isActive           Boolean                  @default(false) @map("is_active")
  merchantId         String?                  @map("merchant_id")
  apiKeyEncrypted    String?                  @map("api_key_encrypted")   // AES-256-GCM, jamais renvoyé
  apiKeyLast4        String?                  @map("api_key_last4")
  treasuryAccountId  String?                  @map("treasury_account_id") @db.Uuid
  feesPaidBy         PaymentGatewayFeesPayer  @default(CLIENT) @map("fees_paid_by")
  lastTestAt         DateTime?                @map("last_test_at")
  lastTestOk         Boolean?                 @map("last_test_ok")
  lastTestMessage    String?                  @map("last_test_message")
  createdAt / updatedAt
  @@map("payment_gateway_configs")
}

/// Une tentative de paiement en ligne. Adossée 1–1 à un RentalPayment PENDING.
model OnlinePaymentCheckout {
  id                    String               @id @default(uuid()) @db.Uuid
  tenantId              String               @map("tenant_id")
  paymentId             String               @unique @map("payment_id") @db.Uuid   // RentalPayment
  leaseId               String               @map("lease_id") @db.Uuid
  renterClientId        String               @map("renter_client_id")
  provider              PaymentGatewayProvider
  mode                  PaymentGatewayMode
  codePaiement          String               @unique @map("code_paiement")   // "IMT-" + 20 car. aléatoires, imprévisible
  amount                Decimal              @db.Decimal(12, 2)
  currency              String               @default("FCFA")
  installmentIds        String[]             @map("installment_ids")
  checkoutUrl           String?              @map("checkout_url")
  providerToken         String?              @map("provider_token")
  providerTransactionId String?              @map("provider_transaction_id")
  providerServiceName   String?              @map("provider_service_name")
  providerFees          Decimal?             @map("provider_fees") @db.Decimal(12, 2)
  status                OnlineCheckoutStatus @default(PENDING)
  lastProviderState     String?              @map("last_provider_state")
  lastProviderPayload   Json?                @map("last_provider_payload")
  lastCheckedAt         DateTime?            @map("last_checked_at")
  checkAttempts         Int                  @default(0) @map("check_attempts")
  failureMessage        String?              @map("failure_message")    // message de l'agrégateur, brut
  reviewReason          String?              @map("review_reason")
  simulatedOutcome      String?              @map("simulated_outcome")  // SUCCESS | FAILED | CANCELED, mode simulateur seulement
  createdByUserId       String?              @map("created_by_user_id")
  completedAt           DateTime?            @map("completed_at")
  createdAt / updatedAt
  @@index([tenantId, status])
  @@map("online_payment_checkouts")
}
```

Relation Prisma côté `RentalPayment` : `onlineCheckout OnlinePaymentCheckout?`.

Le `RentalPayment` associé est créé `PENDING`, `method = MOBILE_MONEY`,
`psp_name = 'PAYSECUREHUB'`, `psp_reference = codePaiement`,
`idempotency_key = codePaiement`, `treasury_account_id` = compte de collecte de
la config. Le moyen réel (Wave, Orange…) est reporté dans `mm_operator` au
succès (`OTHER` pour la carte ou un nom inconnu) ; `psp_transaction_id` reçoit
`payments.transactionId`.

### Compte de trésorerie

Si la config n'a pas de `treasuryAccountId` au moment de l'activation, le
backend crée (ou reprend) un compte `MOBILE_MONEY` numéro **5525**, libellé
« PaySecureHub — compte de collecte », `mmOperator = OTHER`.

## 2. Règles de rapprochement (backend)

`reconcileCheckout(checkoutId)` est la **seule** porte qui change un statut.
Appelée par l'IPN, par le portail (consultation), par le bouton « Vérifier » de
l'agence et par la tâche planifiée.

1. Interroge `status/transact` (ou le simulateur) avec les identifiants de
   l'agence. Jamais le corps de l'IPN.
2. Correspondance `payments.state` (insensible à la casse) :
   `SUCCESSFUL`, `SUCCESS`, `SUCCES`, `PAID`, `VALIDATED` → succès ;
   `FAILED`, `ECHEC`, `REJECTED` → échec ; `CANCEL`, `CANCELED`, `CANCELLED`,
   `ABANDONED` → annulé ; `PENDING`, `PENDDING`, `INITIATED`, vide → en attente ;
   toute autre valeur → en attente + avertissement dans les logs.
3. Succès : si `payments.amount` (entier) ≠ `amount` du checkout, statut
   `REVIEW` avec `reviewReason`, le paiement reste `PENDING`. Sinon, dans une
   même transaction : `updatePaymentStatus(SUCCESS)` avec `succeeded_at` = date
   de l'agrégateur si fournie, puis affectation aux `installmentIds` dans
   l'ordre des échéances (montant restant de chacune, le reliquat reste en
   avance), puis checkout `SUCCESS`, `completedAt`.
4. Échec / annulation : paiement `FAILED` / `CANCELED`, checkout idem.
5. Un checkout `FAILED` peut repasser `SUCCESS` (l'agrégateur corrige un échec
   déjà notifié) ; un checkout `SUCCESS` ne redescend jamais — un état contraire
   le met en `REVIEW`.
6. Idempotent : rejouer un rapprochement déjà conclu ne réécrit rien. Verrou
   par ligne (`SELECT … FOR UPDATE`) ou mise à jour conditionnelle sur `status`.
7. `EXPIRED` : la tâche planifiée passe en `EXPIRED` (et le paiement en
   `CANCELED`) un checkout toujours en attente 48 h après sa création, après une
   dernière vérification.

## 3. Points d'entrée

### 3.1 Agence — paramètres (`TENANT_SETTINGS_VIEW` / `TENANT_SETTINGS_EDIT`)

`GET /api/tenants/:tenantId/settings/payment-gateway` → `PaymentGatewaySettings`

```ts
interface PaymentGatewaySettings {
  provider: "PAYSECUREHUB";
  mode: "SIMULATOR" | "LIVE";
  isActive: boolean;
  merchantId: string | null;
  apiKeyConfigured: boolean;
  apiKeyLast4: string | null;
  treasuryAccountId: string | null;
  treasuryAccountLabel: string | null; // « 5525 — PaySecureHub — compte de collecte »
  feesPaidBy: "CLIENT" | "AGENCY";
  callbackUrl: string; // à communiquer à BMI
  simulatorAvailable: boolean; // false en production
  encryptionAvailable: boolean; // false si PAYMENT_SECRETS_KEY manque
  lastTest: { at: string; ok: boolean; message: string } | null;
}
```

Sans config en base, renvoie les valeurs par défaut (`SIMULATOR`, inactif).

`PUT` même chemin, corps partiel :

```ts
interface UpdatePaymentGatewaySettings {
  mode?: "SIMULATOR" | "LIVE";
  isActive?: boolean;
  merchantId?: string | null;
  apiKey?: string; // écriture seule ; absent = inchangé ; '' = effacée
  treasuryAccountId?: string | null;
  feesPaidBy?: "CLIENT" | "AGENCY";
}
```

Refus 400 (message français, clé i18n) : activer en `LIVE` sans `merchantId`
ou sans clé ; enregistrer une clé si `encryptionAvailable` est faux ; choisir
`SIMULATOR` quand `simulatorAvailable` est faux ; compte de trésorerie
inexistant, inactif, d'une autre agence ou d'une nature autre que
`MOBILE_MONEY` / `BANK`.

`POST /api/tenants/:tenantId/settings/payment-gateway/test` (`TENANT_SETTINGS_EDIT`)
→ `{ ok: boolean; message: string; balance: { amount: number; currency: string; at: string } | null }`.
Appelle `data-ws/solde` (ou répond `ok` en simulateur) et mémorise `lastTest*`.
Une erreur de l'agrégateur donne `ok: false`, pas un 500.

### 3.2 Agence — paiements (`requirePaymentsView` / `requirePaymentsAllocate`)

`GET /api/tenants/:tenantId/rental/payments` et `…/payments/:paymentId` incluent
désormais `onlineCheckout: OnlineCheckoutSummary | null` sur chaque paiement :

```ts
interface OnlineCheckoutSummary {
  id: string;
  codePaiement: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "CANCELED" | "EXPIRED" | "REVIEW";
  mode: "SIMULATOR" | "LIVE";
  providerServiceName: string | null;
  providerTransactionId: string | null;
  providerFees: number | null;
  failureMessage: string | null;
  reviewReason: string | null;
  lastCheckedAt: string | null;
}
```

`POST /api/tenants/:tenantId/rental/payments/:paymentId/online-check`
(`requirePaymentsAllocate`) → relance `reconcileCheckout`, renvoie
`OnlineCheckoutSummary`. 404 si le paiement n'a pas de checkout.

### 3.3 Portail locataire (`authenticate` + `requireTenantPortalAccess`)

`GET /api/portal/tenant/online-payments/availability`
→ `{ available: boolean; mode: 'SIMULATOR' | 'LIVE' | null; feesPaidBy: 'CLIENT' | 'AGENCY' | null }`.
`available` = config active et utilisable.

`POST /api/portal/tenant/online-payments` corps `{ installmentIds: string[] }`
(1 à 24 identifiants, tous du bail du portail, reste dû > 0, non annulés)
→ `OnlineCheckout` (201). Le frontend redirige alors vers `checkoutUrl`.
Refus 400 : liste vide, échéance étrangère au bail ou soldée, paiement en ligne
indisponible ; 409 si un checkout `PENDING` de moins de 15 minutes couvre déjà
l'une de ces échéances (le corps d'erreur porte alors `data.codePaiement` et
`data.checkoutUrl` pour reprendre).
Erreur de l'agrégateur à la création → 502, paiement et checkout marqués `FAILED`.

`GET /api/portal/tenant/online-payments/:codePaiement` → `OnlineCheckout`.
Si le checkout est `PENDING` et vérifié il y a plus de 10 s, rapproche d'abord.
404 si le code n'appartient pas au locataire connecté.

```ts
interface OnlineCheckout {
  id: string;
  codePaiement: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "CANCELED" | "EXPIRED" | "REVIEW";
  amount: number;
  currency: string;
  installmentIds: string[];
  checkoutUrl: string | null;
  providerServiceName: string | null;
  failureMessage: string | null;
  paymentId: string;
  createdAt: string;
  completedAt: string | null;
}
```

Retour du locataire : `Url_Retour = ${FRONTEND_URL}/tenant/payments?paiement=<codePaiement>`.
La page Paiements du portail lit ce paramètre, interroge
`GET …/online-payments/:codePaiement` toutes les 3 s tant que le statut est
`PENDING` (60 s au plus, puis message « en cours de confirmation »), affiche le
résultat et recharge échéances et historique au succès. `REVIEW` s'affiche au
locataire comme « en cours de vérification par l'agence ».

### 3.4 Public

`POST /api/payment-gateway/paysecurehub/ipn` — sans authentification, avec le
limiteur `webhookRateLimiter`, monté avant les routeurs qui imposent
l'authentification. Lit `codePaiement` (ou `code_paiement`) du corps, retrouve
le checkout, lance `reconcileCheckout`, répond toujours `200 { received: true }`
(même code inconnu : ne rien révéler). Corps illisible → 400.
`Url_Callback` envoyé à l'agrégateur = `${BACKEND_URL}/api/payment-gateway/paysecurehub/ipn`.

Simulateur — monté seulement si `simulatorAvailable` :

- `GET /api/payment-gateway/simulator/:codePaiement` : page HTML autonome
  (montant, libellé, trois boutons : Payer, Solde insuffisant, Annuler). HTML
  échappé, aucun script externe.
- `POST /api/payment-gateway/simulator/:codePaiement/:outcome`
  (`success` | `failed` | `canceled`) : enregistre `simulatedOutcome`, lance
  `reconcileCheckout`, redirige (303) vers `Url_Retour`.

En mode simulateur, `checkoutUrl = ${BACKEND_URL}/api/payment-gateway/simulator/<codePaiement>`
et le « statut agrégateur » se lit dans `simulatedOutcome` (absent = en attente).

## 4. Configuration

`src/config/env.ts` et `env.example` :

- `PAYMENT_SECRETS_KEY` — optionnelle, 32 octets en base64 (`openssl rand -base64 32`).
  Absente : `encryptionAvailable = false`, aucune clé API enregistrable.
- `PAYSECUREHUB_BASE_URL` — défaut `https://rest-airtime.paysecurehub.com/api`.
- `PAYSECUREHUB_TIMEOUT_MS` — défaut 15000.
- `PAYMENT_GATEWAY_SIMULATOR` — `1` pour autoriser le simulateur en production
  (démonstration) ; hors production il est toujours disponible.

## 5. Interface (frontend)

- **Paramètres de l'agence** (`pages/tenant/AgencyFinanceSettings.tsx`) : nouvelle
  carte « Paiement en ligne » — mode (Simulateur / Réel), identifiant marchand,
  clé API (champ mot de passe, placeholder « •••• 1234 » si configurée,
  « Remplacer la clé »), compte de trésorerie (liste des comptes Mobile Money et
  banque), qui paie les frais, interrupteur Activer, bouton « Tester la
  connexion », adresse de notification à copier, alertes si
  `encryptionAvailable` ou `simulatorAvailable` sont faux.
- **Portail locataire** (`pages/TenantPortal/Payments.tsx`, et bouton sur le
  tableau de bord si une échéance est due) : si `available`, sélection
  d'échéances impayées + bouton « Payer en ligne » (total affiché, mention des
  frais si `feesPaidBy = CLIENT`, bandeau « Mode démonstration » en simulateur),
  puis redirection ; au retour, suivi du statut comme décrit en 3.3.
- **Paiements de l'agence** (`pages/rental/Payments.tsx`, `PaymentDetailPage.tsx`) :
  étiquette « En ligne » + statut du checkout, opérateur, frais, message
  d'échec ; bouton « Vérifier le statut » quand `PENDING` ou `REVIEW`.

Tous les textes passent par `t()` avec la phrase française pour clé, marges en
propriétés logiques.
