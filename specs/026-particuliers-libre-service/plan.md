# Plan: Espace particulier en libre-service et palier gratuit (lot 4)

**Spec**: [spec.md](spec.md) | **Décision**: [ADR-005](../../docs/architecture/adr/ADR-005-patrimoine-multi-actifs.md)
**Étude de faisabilité** : voir la section « Constats de l'étude » ci-dessous (lecture du code au 2026-09-29).

## Constats de l'étude (à ne pas redécouvrir)

- Aucune inscription libre-service avec création d'espace n'existe : `POST /api/auth/register` crée un
  `User` sans agence ; seul le super-administrateur crée un tenant (`POST /api/admin/tenants`). Un compte
  sans rattachement voit « Votre compte n'est rattaché à aucune agence ».
- Provisionnement transactionnel réutilisable : `services/tenant-provisioning-service.ts`
  (`runProvisioningTx`, `DEFAULT_MODULES_BY_TYPE: Record<TenantType, …>` : ajouter une valeur à
  `TenantType` impose de compléter cette table).
- Catalogue des packs : `lib/subscription/catalog.ts` (`PATRIMOINE_ESSENTIEL` 9 900 FCFA/mois, 10 biens ;
  `PATRIMOINE_PRO` ; `tierGroup: 'PATRIMOINE'`) ; amorçage SQL
  `prisma/migrations/20261001101600_patrimoine_pack_catalogue/`, seed `prisma/seeds/catalog-seed.ts`.
- `BIENS_DETENUS` ne compte que les biens ; aucun compteur d'actifs `Asset` n'existe dans l'abonnement ; le
  seul plafond sur `Asset` est le plafond anti-abus fixe de 500 (`services/patrimoine-assets/limits.ts`).
- `SUBSCRIPTION_ENFORCEMENT` est **global** (défaut `warn`) et la politique de quota par défaut est
  `BILL_OVERAGE` : d'où la **garde propre** au palier gratuit (décision du propriétaire).
- Facturation : une facture périodique à zéro serait émise et « payée » d'office à chaque période
  (`platform-invoice-service.ts`, total 0 donne `PAID`) : à éviter pour les abonnements gratuits.
- Paiement : `services/platform-payment-service.ts` (`startInvoiceCheckout`, réconciliation serveur,
  simulateur `paysecurehub/simulator-client.ts`) ; facturation et changement de pack sont réservés au
  super-administrateur aujourd'hui ; aucune route « je passe au palier supérieur et je paie ».
- Le menu n'est élagué par module que si le serveur répond `enforcement === 'enforce'`
  (`hooks/useMenuAccess.ts`) : sous `warn`, un particulier verrait tous les menus.
- L'inscription est limitée à 3 par heure et par IP avec un magasin en mémoire de processus ; le message
  « adresse déjà utilisée » permet de sonder les comptes ; sans serveur d'e-mails, le compte est marqué
  vérifié au login.
- Non testable sans identifiants réels : l'appel PaySecureHub en mode `LIVE`, le format réel de la
  notification, la signature de notification (point ouvert documenté), les frais et le pays.

## Découpage en sous-lots

| Sous-lot | Contenu                                                                                                           | Dépend de    |
| -------- | ----------------------------------------------------------------------------------------------------------------- | ------------ |
| 4A       | Schéma et catalogue : `TenantType.PARTICULIER`, capacité d'actifs, deux packs, facture à zéro évitée              | —            |
| 4B       | API : création d'espace personnel, garde du palier gratuit, compteur d'usage                                      | 4A           |
| 4C       | Web : parcours de création d'espace, navigation et tableau de bord particulier, bandeau d'usage                   | 4B (contrat) |
| 4D       | Montée de palier : route d'upgrade, facture, paiement, application à la confirmation ; écran                      | 4A, 4B       |
| 4E       | Anti-abus d'inscription : limiteur résistant au redémarrage, message non révélateur, vérification réelle d'e-mail | —            |
| 4F       | Relectures, wiki, HANDOFF                                                                                         | tous         |

## 4A — Schéma et catalogue

- `TenantType` gagne `PARTICULIER` ; `DEFAULT_MODULES_BY_TYPE` : `PARTICULIER → ['MODULE_PATRIMOINE']`.
- `CapacityKey` gagne `ACTIFS` (métrique : nombre d'actifs non archivés du tenant).
- Packs (constantes dans `catalog.ts`, lignes SQL de migration, seed) :
  - `PARTICULIER_GRATUIT` : prix 0, mise en route 0, capacité `ACTIFS: 10`, `tierGroup: 'PARTICULIER'`.
  - `PARTICULIER_PLUS` : **prix provisoire 2 900 FCFA HT/mois**, mise en route 0, capacité `ACTIFS: 100`,
    même `tierGroup`. Le produit ajuste prix et plafond dans le catalogue, sans migration.
- Un abonnement dont tous les éléments ont un prix nul ne génère aucune facture périodique (test) ; un
  abonnement gratuit n'expire pas et n'a pas de période d'essai.
- `packsForModules` et les packs Agence, Syndic, Promoteur, Patrimoine ne changent pas.

## 4B — API

- `POST /api/personal-space` (authentifié, hors `/tenants/:tenantId`) : corps `.strict()`
  `{ displayName (1..120), country: 'CI'|'SN'|'BF'|'ML'|'NE'|'TG'|'BJ'|'GW', phone? }` ; exige un e-mail
  vérifié ; crée en une transaction l'espace `PARTICULIER` (slug unique non prévisible), les modules,
  l'abonnement `ACTIVE` du pack gratuit avec `quotaPolicy = BLOCK`, l'appartenance `ACTIVE` et le rôle
  `TENANT_ADMIN` (pas de nouveau rôle au lot 4), l'audit. Idempotent (en-tête `Idempotency-Key`
  facultatif) ; un seul espace personnel par utilisateur, garanti sous concurrence par une garde en base
  (verrou consultatif par utilisateur ou contrainte unique). `201 { data: { tenantId, slug, name } }` ; si
  l'utilisateur a déjà un espace : `409` code `PERSONAL_SPACE_EXISTS` avec `data: { tenantId }` pour que
  l'interface le redirige.
- Garde du palier gratuit : à la création d'un actif, si le pack du tenant porte la capacité `ACTIFS`,
  refus `409` code `FREE_TIER_LIMIT` (`data: { limit, used }`) quand `used >= limit`, quel que soit le
  mode global ; sinon comportement du lot 1 inchangé. `ensurePropertyAsset` ne crée pas l'actif quand la
  limite est atteinte (la valorisation du bien reste enregistrée).
- `GET /api/tenants/:tenantId/patrimoine/usage` (lecture `PROPERTIES_VIEW`) →
  `{ data: { plan: 'FREE' | 'PAID' | 'AGENCY', limit: number | null, used: number, canAdd: boolean } }`.

## 4C — Web

- Après connexion sans rattachement : écran « Créer mon espace » (nom affiché prérempli, pays de
  l'UEMOA, téléphone facultatif validé) à la place de « Votre compte n'est rattaché à aucune agence » ;
  redirection vers le patrimoine après création ; la réponse `PERSONAL_SPACE_EXISTS` redirige vers l'espace.
- Espace `PARTICULIER` : navigation réduite au patrimoine, aux biens, aux baux et aux paramètres,
  **indépendante du mode global** (décidée par le type du tenant renvoyé par le serveur) ; accueil sur
  « Valeur nette » ; bandeau « X actifs sur 10 » avec invitation à passer au palier payant (lien vers
  l'écran d'abonnement).
- Aucun `React.lazy` supplémentaire dans `App.tsx` ; budget d'entrée mesuré avant et après.

## 4D — Montée de palier

- `POST /api/tenants/:tenantId/subscription/upgrade` (`TENANT_SETTINGS_EDIT`, exemptée de la lecture
  seule) : crée la facture du premier mois du pack payant, démarre le paiement PaySecureHub
  (`startInvoiceCheckout`) et renvoie `{ data: { invoiceId, checkoutUrl, code } }`. Le changement de
  pack n'a lieu **qu'à la confirmation du paiement** par la réconciliation serveur (aucun changement de
  droits avant), de façon idempotente.
- Écran d'abonnement de l'espace particulier : palier actuel, usage, bouton de montée de palier, suivi du
  paiement (mécanisme existant de retour et de sondage).
- Téléphone obligatoire avant de payer ; TVA et montants entiers en FCFA comme les factures existantes.

## 4E — Anti-abus d'inscription

- Limiteur d'inscription par IP dont l'état survit au redémarrage (magasin en base ou équivalent
  disponible dans le dépôt ; à défaut, documenter la limite d'instance unique) ; réponse d'inscription
  identique que l'adresse existe ou non ; refus de la création d'espace tant que l'e-mail n'est pas
  réellement vérifié (aucune vérification automatique quand un serveur d'e-mails est absent en production).
- Hors périmètre, listé : captcha, filtre de domaines jetables, vérification du téléphone.

## Hors périmètre du lot 4 (décisions produit ou juridiques ouvertes)

- Suppression ou anonymisation d'un compte et d'un espace, export libre-service, purge des espaces
  inactifs, conservation des données, consentements et conditions d'utilisation, régime de protection des
  données par pays, signature des notifications PaySecureHub, prélèvement récurrent, rétrogradation
  payant vers gratuit, rôle dédié « particulier », activation globale de `SUBSCRIPTION_ENFORCEMENT`.

## Risques

| Risque                            | Réponse                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Régression des agences existantes | La garde ne s'applique qu'aux tenants dont le pack porte `ACTIFS` ; suites de non-régression |
| Création d'espaces en double      | Garde en base, test de concurrence                                                           |
| Paiement pris sur parole          | Réconciliation serveur existante ; changement de pack seulement à la confirmation            |
| Factures à zéro en boucle         | Aucun `Invoice` périodique pour un abonnement à prix nul                                     |
| Budget d'entrée web               | Aucune nouvelle dépendance ni `React.lazy` ; mesure avant et après                           |
| Inscription abusive               | Limiteur persistant, message non révélateur, e-mail réellement vérifié                       |

## Contrats API des sous-lots 4B et 4D (font foi pour l'API et pour le web)

Erreurs de validation : `errors: [{ field, message }]` (ZodError 400, ValidationError 422), comme les
lots précédents. Montants en FCFA entiers.

### `POST /api/personal-space` (4B)

Authentifié (`authenticate`), hors `/tenants/:tenantId`, aucun middleware de tenant. Corps `.strict()` :
`{ displayName: string (1..120), country: 'CI'|'SN'|'BF'|'ML'|'NE'|'TG'|'BJ'|'GW', phone?: string }`
(`phone` : format international UEMOA `+225…`, `+221…`, etc., 8 à 15 chiffres, refusé sinon).
En-tête facultatif `Idempotency-Key`.

- `201 { data: { tenantId, slug, name } }`.
- `409` code `PERSONAL_SPACE_EXISTS`, `data: { tenantId }` : l'utilisateur a déjà un espace personnel
  (créé ou concurrent). La garde tient sous concurrence (verrou consultatif par utilisateur).
- `403` code `EMAIL_NOT_VERIFIED` : e-mail non vérifié. `503` code `SIGNUP_UNAVAILABLE` : production sans
  serveur d'e-mails (comme l'inscription).
- Crée en une transaction (réutilise `createTenantCoreTx`) : tenant `PARTICULIER` (`name` =
  `displayName`, `country`, `contactPhone`, `contactEmail` = e-mail de l'utilisateur), module Patrimoine,
  abonnement `ACTIVE` du pack `PARTICULIER_GRATUIT` avec `quotaPolicy = BLOCK`, `Membership` `ACTIVE`,
  rôle `TENANT_ADMIN`, audit `PERSONAL_SPACE_CREATED` (identifiants, jamais le nom ni le téléphone).

### `GET /api/tenants/:tenantId/patrimoine/usage` (4B)

Lecture `PROPERTIES_VIEW`. Réponse :

```ts
{ data: {
    plan: 'FREE' | 'PAID' | 'AGENCY';   // FREE = pack Particulier gratuit, PAID = Particulier plus, AGENCY = autres
    limit: number | null;                // capacité ACTIFS du pack, null si le pack n'en porte pas
    used: number;                        // actifs non archivés du tenant
    canAdd: boolean;                     // limit === null || used < limit
    upgrade: { target: 'PARTICULIER_PLUS'; priceMonthly: number; currency: 'XOF'; limit: number } | null;
                                         // proposé seulement pour plan === 'FREE'
} }
```

### Garde du palier gratuit (4B)

À la création d'un actif (`createAsset` du service d'actifs), si le pack actif du tenant porte la capacité
`ACTIFS` et que `used >= limit` : `409` code `FREE_TIER_LIMIT`, `data: { limit, used }`, message en
français invitant à passer au palier payant ; quel que soit `SUBSCRIPTION_ENFORCEMENT`. Aucun changement
pour les tenants dont le pack ne porte pas `ACTIFS` (plafond de 500 du lot 1 conservé). `ensurePropertyAsset`
ne crée pas l'actif quand la limite est atteinte (la valorisation du bien reste enregistrée).

### `POST /api/tenants/:tenantId/subscription/upgrade` (4D)

Permission `TENANT_SETTINGS_EDIT`, exemptée de la lecture seule, tenant de type `PARTICULIER` sur
`PARTICULIER_GRATUIT` uniquement. Corps `.strict()` : `{ target: 'PARTICULIER_PLUS' }`.

- `201 { data: { invoiceId, checkoutUrl, code } }` : crée la facture du premier mois du pack cible (TVA
  comprise, montants entiers) et démarre le paiement PaySecureHub (`startInvoiceCheckout`).
- **Aucun changement de droits avant la confirmation du paiement** : à la réconciliation serveur d'un
  paiement `SUCCESS` de cette facture, l'abonnement passe à `PARTICULIER_PLUS` (idempotent, verrou), le
  plafond passe à celui du pack. Un paiement annulé, échoué ou expiré laisse l'espace gratuit.
- Erreurs : `409` code `ALREADY_ON_TARGET` ; `409` code `PAYMENT_IN_PROGRESS` avec les données de reprise
  existantes du paiement en cours ; `422` code `PHONE_REQUIRED` si `contactPhone` du tenant est vide ;
  `403` pour un tenant non particulier ; `503` si les paiements sont indisponibles
  (`getPlatformPaymentAvailability`).
