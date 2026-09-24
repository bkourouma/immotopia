# Spécification : Fournisseur SMS pour ImmoTopia

**Branche de la feature** : `020-fournisseur-sms`
**Créée** : 2026-09-24
**Statut** : Draft
**Entrée** : Demande d'ajout de l'envoi de SMS à ImmoTopia (monorepo `packages/api` +
`apps/web`), sur le modèle des fournisseurs WhatsApp/e-mail déjà en place.

Cette spécification ne contient aucun code : elle décrit le contrat fonctionnel
et technique à implémenter. Elle s'appuie sur le code réellement lu dans le
dépôt (checkout principal `D:\APP\Immobillier`, branche `docs/spec-fournisseur-sms`
= `main`) et, pour le patron de réglages chiffrés par agence, sur le worktree
`D:\APP\Immobillier\.claude\worktrees\lot7` (branche `feat/paiement-en-ligne-lot-7`,
non fusionnée à ce jour). Tout élément non vérifié directement dans le code est
marqué **« à vérifier »**.

---

## 1. Contexte et objectif

### 1.1 Pourquoi le SMS

ImmoTopia notifie déjà ses utilisateurs par e-mail
(`packages/api/src/services/providers/email.provider.ts`, SMTP/SendGrid via
Nodemailer) et par WhatsApp
(`packages/api/src/services/providers/whatsapp.provider.ts`, WaSender ou
Twilio). Le SMS est le seul canal qui atteint un numéro ivoirien sans
application installée ni connexion internet au moment de la réception — utile
pour les relances de loyer et les accusés de paiement quand le locataire n'a
pas WhatsApp actif, et comme filet de secours quand WaSender perd sa session
(le provider WhatsApp l'exige explicitement, cf.
`ensureWaSenderSessionConnected` dans `whatsapp.provider.ts` lignes 293-312 :
« WaSender session non connectee »).

Le SMS n'est pas une nouveauté architecturale : le canal existe déjà comme
valeur réservée dans plusieurs endroits du code, non câblée à un envoi réel :

- `CommunicationChannel` inclut `'SMS'` avec le commentaire « reserved for
  future » (`packages/api/src/types/communication-types.ts` ligne 11).
- Les schémas Zod du module communication acceptent déjà `channel: 'SMS'`
  (`communicationChannelEnum`, `communication-validators.ts` ligne 10) et un
  champ `templateIdSms` / `templateIdWhatsapp` sur les règles de notification
  (`createRuleSchema`, mêmes lignes 66-67).
- Le schéma Prisma porte trois enums qui incluent déjà `SMS` :
  `PreferredContactChannel` (`CALL | WHATSAPP | EMAIL | SMS`, schema.prisma
  ligne 206-211), `CrmActivityType` (`CALL | EMAIL | SMS | WHATSAPP | ...`,
  ligne 245-255) et `ReminderChannel` (`EMAIL | SMS | WHATSAPP | PUSH`, ligne
  2835-2840) déjà utilisé par le modèle `PaymentReminder` du module Syndic
  (`ReminderStatus` associé : `SENT | DELIVERED | FAILED`, lignes 2842-2846,
  utilisé lignes 3461-3479).

Autrement dit : le SMS est prévu dans les enums depuis le début, mais **aucun
fournisseur SMS n'existe** — le contrat du lot 7 paiement en ligne le confirme
explicitement en l'excluant de son périmètre : « **Hors périmètre** : SMS
(aucun fournisseur retenu) »
(`docs/finance/LOT-7-CONTRAT-PAIEMENT-EN-LIGNE.md` ligne 9, worktree lot7).

**À vérifier** : le modèle Prisma `Communication`
(`packages/api/prisma/schema.prisma` lignes 2542-2556) est un placeholder
minimal (`id, tenantId, recipientTenantClientId, recipientContactId, status,
createdAt` — ni `channel`, ni `body`, ni `type`), en retrait par rapport aux
entités décrites dans `specs/010-communication-module/spec.md` (« Key
Entities » §133-139). Le journal des SMS proposé au §5 est donc un nouveau
modèle dédié (`SmsMessage`), pas une extension de `Communication`.

### 1.2 Déclencheurs existants qui pourraient partir en SMS

Le canal WhatsApp couvre aujourd'hui 22 clés de notification, listées et
décrites dans `packages/api/src/constants/whatsapp-notification-keys.ts`
(`WHATSAPP_NOTIFICATION_KEYS`, lignes 6-31). Les plus pertinentes pour un
premier lot SMS — parce qu'elles sont courtes, urgentes et déjà déclenchées
automatiquement par le code métier — sont :

| Clé                                                               | Déclencheur                                       | Destinataire   | Fichier appelant (WhatsApp)                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `INSTALLMENT_DUE_REMINDER`                                        | Rappel avant échéance de loyer                    | Locataire      | à vérifier (non trouvé dans les fichiers lus ; probablement un job planifié gestion locative) |
| `INSTALLMENT_OVERDUE`                                             | Échéance de loyer dépassée                        | Locataire      | idem                                                                                          |
| `PAYMENT_APPROVED_TENANT`                                         | Paiement approuvé par l'agence                    | Locataire      | idem                                                                                          |
| `PAYMENT_REJECTED_TENANT`                                         | Paiement rejeté par l'agence                      | Locataire      | idem                                                                                          |
| `CHARGE_CALL_ISSUED` / `CHARGE_CALL_REMINDER`                     | Appel de charges syndic émis / rappelé            | Copropriétaire | `packages/api/src/lib/syndics/notifications.ts` (lignes 113-128, 204-221, 317-332)            |
| `OWNER_STATEMENT_SENT`                                            | Relevé de gérance envoyé                          | Propriétaire   | `packages/api/src/lib/patrimoine/notifications.ts` (ligne 137-144)                            |
| `MAINTENANCE_TICKET_CREATED_TENANT` / `..._STATUS_CHANGED_TENANT` | Ticket de maintenance créé / changement de statut | Locataire      | `packages/api/src/services/maintenance-notification-service.ts` (ligne 287+)                  |

Ces mêmes fichiers (`lib/syndics/notifications.ts`,
`lib/patrimoine/notifications.ts`, `services/maintenance-notification-service.ts`)
sont les points d'extension naturels pour ajouter un appel
`sendSmsNotification(...)` juste après (ou à la place de, selon préférence du
destinataire) l'appel `sendWhatsappNotification(...)` existant — même
`tenantId`, mêmes `variables`, même `contactId`/`to`.

**Point d'architecture observé** : `sendWhatsappNotification` accepte soit un
`contactId` (et vérifie alors `consentWhatsapp` sur `CrmContact`, service
`whatsapp-notification-send-service.ts` lignes 97-111), soit un `to` direct
résolu par l'appelant, **sans vérification de consentement** (ex.
`to: directPhone` dans `lib/syndics/notifications.ts` lignes 122-127 et
326-331). Le SMS reproduira cette dualité (§3), avec une différence
volontaire au §9 : le consentement sera aussi vérifié côté `to` direct pour
les envois promotionnels/groupés, conformément à l'ARTCI.

### 1.3 OTP

Aucun mécanisme d'OTP (code à usage unique) n'existe aujourd'hui dans le code
lu. Ce document prévoit l'architecture (`SmsProvider.sendText`) comme
suffisante pour un futur usage OTP, mais **l'OTP est hors périmètre des lots
proposés au §10** — à confirmer avec Baba si un besoin (connexion portail
locataire par code SMS, par exemple) existe déjà.

### 1.4 Reçus de paiement par SMS

Le module de paiement en ligne (lot 7, worktree lot7) ne prévoit pas de reçu
SMS ; l'accusé WhatsApp `PAYMENT_APPROVED_TENANT` est aujourd'hui le
mécanisme le plus proche. Le lot SMS 3 (§10) propose d'y ajouter le SMS comme
canal alternatif ou complémentaire, sur le même modèle.

---

## 2. Choix du fournisseur et justification

| Fournisseur                         | Prix/SMS (FCFA, indicatif)                  | Couverture opérateurs CI                                                              | API                                               | Nom d'expéditeur                                           | Accusés de réception                                    | Limites                                                  | Remarque                                                                                      |
| ----------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Orange SMS API CI v2.0** (retenu) | ~7,26 (pack 10 000 SMS / 72 600 FCFA, 60 j) | Annoncée « tout opérateur » — MTN/Moov non nommés explicitement, à vérifier à l'essai | REST, OAuth2 `client_credentials`                 | Gratuit sur validation Orange, 11 car. alphanumériques max | Webhook temps réel sur demande à l'équipe locale Orange | 5 transactions/s, achat plafonné à 100 000 FCFA/jour/SIM | Packs prépayés, payables en crédit ou Orange Money ; solde reporté si rachat avant expiration |
| **HSMS** (secours)                  | ~11 à 16                                    | À vérifier                                                                            | Non documentée publiquement                       | À vérifier                                                 | À vérifier                                              | À vérifier                                               | Acteur local (Abidjan) ; à qualifier avant d'écrire une implémentation                        |
| **SMS Partner Africa** (secours)    | À vérifier (devis)                          | 120 pays, CI incluse                                                                  | REST `api.smspartner.fr/v1/send`, 500 SMS/requête | À vérifier                                                 | Oui (webhooks)                                          | À vérifier                                               | Bonne option si Orange est indisponible ou plafonné                                           |
| **BulkGate** (secours)              | ~0,0248 €/SMS (~16 FCFA)                    | À vérifier                                                                            | REST                                              | À vérifier                                                 | À vérifier                                              | À vérifier                                               | Plus cher qu'Orange, couverture large                                                         |
| Twilio (écarté)                     | ~280 (0,4925 $)                             | Large                                                                                 | REST, SDK officiel                                | Payant, procédure longue                                   | Oui                                                     | Élevées                                                  | ~38× le tarif Orange ; à écarter pour un usage en Côte d'Ivoire à fort volume                 |

**Recommandation : Orange SMS API CI v2.0 comme fournisseur principal.**
Justification : c'est de loin le moins cher pour un opérateur qui couvre déjà
la majorité du marché ivoirien (Orange CI), l'API est documentée
publiquement avec exemples JS, le nom d'expéditeur est gratuit après
validation, et les accusés de réception sont disponibles sur simple demande à
l'équipe locale. La limite « vers tout opérateur » n'étant pas nommée
explicitement par opérateur (MTN, Moov) dans la documentation citée, **à
vérifier pendant l'essai** avant d'annoncer une couverture universelle aux
agences.

**Secours recommandé : SMS Partner Africa**, pour son API REST documentée
publiquement (contrairement à HSMS) et ses webhooks de statut — donc
compatible avec l'interface `SmsProvider` du §3 sans travail de
rétro-ingénierie. HSMS reste une option locale à qualifier plus tard si son
tarif au SMS s'avère décisif ; BulkGate est une roue de secours technique
(passerelle multi-pays déjà largement utilisée) si les deux premiers sont
indisponibles. Twilio est écarté sauf demande explicite du client (coût
prohibitif à l'échelle).

---

## 3. Architecture

### 3.1 Vue d'ensemble

Les déclencheurs métier (syndics, patrimoine, maintenance, gestion locative,
CRM) et les écrans agence (`apps/web` : carte de réglages, règles de
notification, historique) appellent tous deux, par des chemins différents
(appel direct de service côté back, REST côté front), le nouveau
`sms-notification-send-service.ts`. Ce service résout la config agence
(`SmsGatewayConfig`, identifiants chiffrés), vérifie le consentement
(`CrmContact`/`TenantClient`), normalise le numéro en E.164 `+225`, découpe
le texte en segments et estime le coût, puis appelle l'interface
`SmsProvider` et journalise le résultat dans `SmsMessage`. `SmsProvider` est
implémentée d'abord par `OrangeSmsProvider` (OAuth2 `client_credentials`,
file d'attente 5 req/s), et plus tard par un second fournisseur (ex.
`SmsPartnerAfricaProvider`) derrière la même interface. Orange notifie les
accusés de réception sur le webhook public
`POST /api/sms/webhook/orange/:secret` (§3.9).

### 3.2 Interface `SmsProvider`

Interface abstraite dans `packages/api/src/services/providers/sms.provider.ts`
(nouveau fichier), sur le modèle de `whatsapp.provider.ts` mais typée en
interface explicite — même style que les clients de passerelle du lot 7
(`GatewayError`, `gatewayClientForMode`, importés dans `settings.ts` ligne 10,
**à vérifier** : fichier source non lu en détail).

```ts
export interface SmsSendOptions {
  to: string; // E.164, ex. +2250102030405
  body: string;
  senderId?: string; // nom d'expéditeur, défaut = celui de la config agence
}
export interface SmsSendResult {
  providerMessageId: string;
  segments: number;
  encoding: "GSM_7" | "UCS_2";
  estimatedCostFcfa: number | null;
}
export interface SmsStatusResult {
  status: "PENDING" | "DELIVERED" | "FAILED" | "UNKNOWN";
  providerRawStatus?: string;
  deliveredAt?: string;
}
export interface SmsBalance {
  remainingSms: number | null;
  expiresAt: string | null;
}
export interface SmsProvider {
  readonly kind: "orange" | "sms_partner_africa" | "hsms" | "bulkgate";
  sendText(options: SmsSendOptions): Promise<SmsSendResult>;
  getStatus(providerMessageId: string): Promise<SmsStatusResult>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  getBalance?(): Promise<SmsBalance>; // optionnel dans l'interface (fournisseurs de secours qui ne l'exposent pas) ; implémenté par OrangeSmsProvider (voir ci-dessous)
}
```

`OrangeSmsProvider` est la première implémentation
(`packages/api/src/services/providers/orange-sms.provider.ts`). Un deuxième
fournisseur (ex. `SmsPartnerAfricaProvider`) s'ajoute plus tard en implémentant
la même interface, sélectionné par une variable d'environnement
`SMS_PROVIDER` — exactement le patron `WHATSAPP_PROVIDER` /
`getPreferredProvider()` de `whatsapp.provider.ts` (lignes 63-72).

**Points d'API réels d'Orange** (source : page « getting started » commune à
tous les pays Orange, renvoyée par la page CI — §13) :

- **Envoi** : `POST https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B2250000/requests`
  (le numéro court/l'expéditeur figure encodé dans l'URL), corps
  `{"outboundSMSMessageRequest":{"address":"tel:+2250102030405","senderAddress":"tel:+2250000","senderName":"IMMOTOPIA","outboundSMSTextMessage":{"message":"..."}}}`.
  L'URL est en `v1` alors que la page produit s'intitule « SMS 2.0 » — à ne
  pas confondre.
- **Administration** (implémente `getBalance()`, non optionnel pour Orange) :
  solde et packs `GET https://api.orange.com/sms/admin/v1/contracts`,
  statistiques `GET .../sms/admin/v1/statistics`, historique d'achats
  `GET .../sms/admin/v1/purchaseorders`. `testConnection()` pour Orange
  consiste à obtenir un jeton puis lire `contracts` — sans envoyer de SMS.

### 3.3 Branchement dans le module communication existant

- `CommunicationChannel` (`communication-types.ts` ligne 11) passe de
  « reserved for future » à un canal actif ; aucun changement de type requis,
  seulement du câblage.
- Un nouveau service `sms-notification-send-service.ts` reproduit la forme de
  `whatsapp-notification-send-service.ts` : `SendSmsOptions { tenantId,
notificationKey, variables, to?, contactId? }`, résolution du gabarit par
  défaut, normalisation du numéro, vérification du consentement, appel
  fournisseur, journalisation.
- Les clés de notification SMS réutilisent `WHATSAPP_NOTIFICATION_KEYS`
  (même liste, même fichier `whatsapp-notification-keys.ts`) plutôt que d'en
  créer une copie : un même événement métier peut avoir une config WhatsApp et
  une config SMS indépendantes, mais partage la même clé et le même texte de
  variables. **Décision à confirmer** : soit on ajoute une table de
  configuration SMS séparée par notification (symétrique à
  `WhatsappNotificationConfig`, non lue en détail mais dont l'existence est
  déduite de `whatsapp-notification-config-service.ts`/`-controller.ts`), soit
  on étend le contrôleur WhatsApp existant pour accepter un canal en
  paramètre. Ce document retient la première option (table séparée) pour ne
  pas complexifier un contrôleur qui fonctionne déjà.
- Pour un envoi par `recipientTenantClientId` (locataire), `TenantClient` n'a
  pas de colonne téléphone (§5) : le numéro se résout aujourd'hui dans
  `document-context-builder.ts` (lignes 52-80, 164) dans l'ordre
  `CrmContact.phonePrimary` → `phoneSecondary` → `whatsappNumber` →
  `TenantClient.details.phone`/`telephone`/`mobile` (JSON). Le service SMS
  n'y ajoute pas une quatrième implémentation : cette résolution est extraite
  dans un utilitaire partagé (ex.
  `packages/api/src/utils/resolve-tenant-client-phone.ts`) que
  `document-context-builder.ts` et `sms-notification-send-service.ts`
  appellent tous les deux.

### 3.4 Jeton OAuth2 (Orange)

`POST https://api.orange.com/oauth/v3/token`, `grant_type=client_credentials`,
authentification par en-tête `Authorization: Basic <Client ID:Client Secret
en base64>` (pas dans le corps). La réponse porte `expires_in` = 3600 s ; tous
les appels suivants (envoi, `contracts`, `statistics`, `purchaseorders`)
passent `Authorization: Bearer <token>`. `OrangeSmsProvider` mémorise le
jeton en mémoire process avec sa date d'expiration et ne le renouvelle qu'à
l'approche de celle-ci (marge de sécurité, ex. 60 s) — même idée que
`twilioClient` mis en cache dans `whatsapp.provider.ts` (lignes 37-52), avec
une expiration explicite au lieu d'un cache indéfini. Le jeton n'est jamais
journalisé ni renvoyé au frontend.

**Point multi-tenant (modèle hybride, §4)** : le cache de jeton est une
`Map<'PLATFORM' | tenantId, { token, expiresAt }>` — une entrée unique pour
le compte plateforme (partagée par toutes les agences en mode par défaut), et
une entrée par agence qui a choisi ses propres identifiants (§4). Le jeton du
compte plateforme ne sert jamais à envoyer au nom d'une agence en
identifiants propres, et réciproquement.

### 3.5 Limitation à 5 SMS/s

Orange impose 5 transactions/s **par compte**. Une file d'attente en mémoire
process (FIFO, un `setInterval`/`p-queue`-like ou équivalent maison) sérialise
les envois à un débit ≤ 5/s : une file globale pour le compte plateforme
(partagée par toutes les agences en mode par défaut, §4), et une file séparée
par agence qui a ses propres identifiants. Un envoi qui dépasse le débit
attend en file plutôt que d'échouer immédiatement — cohérent avec le
comportement transactionnel attendu (rappel de loyer, reçu de paiement) où un
délai de quelques secondes est acceptable mais un échec silencieux ne l'est
pas.

**À vérifier** : sur plusieurs instances API (process Node multiples), une
file en mémoire process ne suffit plus à respecter la limite globale de 5/s —
il faudrait une file partagée (table Postgres avec verrou, ou Redis). Rien
dans le code lu n'indique une architecture multi-instance aujourd'hui.

### 3.6 Normalisation des numéros (E.164 +225)

Depuis 2021, les numéros ivoiriens comptent 10 chiffres locaux (préfixe
`0X XX XX XX XX`), et le `0` initial fait partie de ces 10 chiffres — il est
conservé, pas retiré, lors du passage en E.164. La normalisation E.164 suit
le même schéma que `normalizePhone()`, déjà dupliqué dans
`whatsapp-notification-send-service.ts` (lignes 46-53) et
`whatsapp-notification-config-controller.ts` (lignes 178-186), mais avec le
défaut `225` au lieu de `33` — ce que fait déjà
`WHATSAPP_DEFAULT_COUNTRY_CODE=225` dans `env.example` (ligne 48). Plutôt que
de dupliquer une troisième fois cette fonction, ce lot l'extrait dans un
utilitaire partagé `packages/api/src/utils/phone-normalize.ts`, consommé par
les trois call sites (SMS, service WhatsApp, contrôleur WhatsApp).

Règle : préfixe `+225` puis les 10 chiffres locaux tels quels
(`0102030405` → `+2250102030405`, 13 chiffres après le `+`). Un numéro saisi
en 8 chiffres (ancien format, antérieur à 2021) n'est pas deviné ni
complété : il est rejeté avec une erreur de validation claire
(`BadRequestError`, §8) invitant à ressaisir le numéro au format actuel à 10
chiffres.

### 3.7 Découpage en segments (GSM-7 / UCS-2)

Un SMS standard : 160 caractères si tout le texte est encodable en GSM-7
(alphabet SMS de base — lettres non accentuées, chiffres, ponctuation
courante). Dès qu'un seul caractère hors GSM-7 apparaît (accents français
é/è/à/ç, caractères arabes), le SMS entier bascule en UCS-2, limité à 70
caractères par segment. Un message plus long se découpe en plusieurs segments
concaténés (153 car./segment en GSM-7, 67 car./segment en UCS-2, à cause de
l'en-tête de concaténation), **chaque segment facturé comme un SMS**.

Conséquence directe pour ImmoTopia : les gabarits SMS doivent être rédigés
sans accents quand c'est possible pour rester en GSM-7 (ex. « Rappel loyer:
echeance du 05/10 non reglee. » plutôt que « Rappel loyer : échéance du 05/10
non réglée. ») — un choix éditorial à trancher avec l'agence, car il dégrade
légèrement la qualité du français affiché. Le texte arabe (troisième langue de
l'app, cf. §7) sera toujours en UCS-2, donc plus cher au caractère — à
budgéter si des SMS en arabe sont envoyés.

`sms-notification-send-service.ts` calcule le nombre de segments et
l'encodage avant l'envoi (fonction pure, testable sans réseau), les stocke
dans `SmsMessage` (§5) et les utilise pour l'estimation de coût.

### 3.8 Journalisation

Chaque tentative d'envoi crée une ligne `SmsMessage` (§5) avec statut,
segments, coût estimé, identifiant fournisseur, avant même l'appel réseau
(statut `QUEUED`), puis mise à jour après réponse (`SENT` / `FAILED`) et après
accusé webhook (`DELIVERED` / `FAILED`). Ce flux journal-avant-envoi est
important pour ne pas perdre trace d'un SMS parti mais dont la réponse HTTP a
timeout (Orange dit avoir reçu la requête, l'agence ne le saurait jamais sans
une ligne `QUEUED` déjà en base).

### 3.9 Webhook d'accusés de réception

Chez Orange, l'URL de rappel des accusés (« delivery info ») ne se déclare
pas par API : elle se renseigne via un formulaire Orange Developer, une fois
pour le compte (source §13). Orange y poste
`{"deliveryInfoNotification":{"callbackData":"<id>","deliveryInfo":{"address":"tel:+225...","deliveryStatus":"<statut>"}}}`
et attend une réponse `200 OK`. La corrélation avec `SmsMessage` se fait donc
par `callbackData` — à renseigner à l'envoi avec l'identifiant de
`SmsMessage` (**à vérifier** : que le champ `callbackData` soit bien accepté
dans le corps de la requête d'envoi `smsmessaging/v1/outbound/.../requests`,
non confirmé dans la documentation lue) — et, à défaut, par le
`resourceURL` renvoyé en réponse de l'envoi.

Route ImmoTopia proposée : `POST /api/sms/webhook/orange/:secret` — public
(pas de session), monté avant les routeurs authentifiés (même position que
le futur webhook PaySecureHub du lot 7), protégé par le `webhookRateLimiter`
déjà exposé par `packages/api/src/middleware/rate-limit-middleware.ts`
(utilisé par `packages/api/src/routes/whatsapp.webhook.route.ts` — **à
vérifier** : fichier non ouvert en détail, usage repéré par recherche).
Aucune signature de webhook n'est documentée par Orange pour ce mécanisme de
formulaire (contrairement à un webhook signé classique) ; ce document
recommande donc un secret dans le chemin de l'URL
(`:secret` = `ORANGE_SMS_WEBHOOK_PATH_SECRET`, §6) en complément du rate
limiter, puisque l'URL de rappel est unique par compte Orange et n'a pas
d'autre mécanisme de vérification — un point qui pèse aussi dans la décision
du §4 (compte plateforme = une seule URL et un seul enregistrement à gérer).

Contraintes :

- **Résolution du tenant sans authentification** : le webhook retrouve
  `SmsMessage` par `callbackData` (lecture transverse hors contexte tenant,
  comme l'IPN PaySecureHub, contrat lot 7 §2 point 8), puis applique la mise
  à jour de statut dans le contexte de l'agence retrouvée avec
  `runWithTenantContext(context, fn)`
  (`packages/api/src/utils/tenant-context.ts` ligne 23,
  `export function runWithTenantContext<T>(context: TenantContext, fn: () => T): T`),
  déjà utilisé par `lib/payment-gateway/checkout.ts` et
  `jobs/newsletter-campaign-scheduler.job.ts`. Ce mécanisme existe sur la
  branche lot 7 (`feat/paiement-en-ligne-lot-7`) mais pas encore sur `main` :
  cette spécification **suppose le lot 7 / multi-tenant fusionné** avant
  l'implémentation SMS.
- **Idempotence** : un même `callbackData` reçu deux fois ne doit pas
  dupliquer l'écriture ; mise à jour conditionnelle sur le statut actuel
  (`DELIVERED` ne redescend jamais), même principe que le rapprochement de
  paiement du lot 7 (contrat §2 point 6).
- **Réponse** : toujours `200 OK`, même pour un `callbackData` inconnu — ne
  jamais révéler s'il existe (même principe que l'IPN PaySecureHub, contrat
  §3.4).

---

## 4. Décision à trancher : compte plateforme, identifiants par agence, ou hybride

Point de départ différent du lot 7 : ouvrir un compte Orange Developer
suppose une **SIM Orange** rattachée au compte, et les packs SMS s'achètent
par SIM, en crédit ou en Orange Money (§2). La quasi-totalité des agences
clientes ne le fera pas spontanément — contrairement au compte marchand
PaySecureHub du lot 7, qui répond à un besoin direct et immédiat de l'agence
(encaisser ses loyers en ligne), un compte SMS Orange n'a de valeur que pour
ImmoTopia. Autre différence structurante : le paiement en ligne fait
transiter l'argent du locataire _vers_ l'agence, ce qui justifiait un compte
marchand par agence (traçabilité, propriété des fonds) ; le SMS ne fait
transiter aucun argent vers l'agence, seulement une dépense sortante — la
raison juridique qui imposait un compte par agence au lot 7 ne s'applique
donc pas ici. Enfin, l'URL de rappel des accusés se déclare une fois par
compte Orange (§3.9) et l'enregistrement MTN prend 15 jours par nom
d'expéditeur (§11) : multiplier les comptes multiplie ces démarches.

|                         | Compte plateforme (retenu par défaut)                                                                                                                | Identifiants propres par agence (option, patron lot 7)                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Mise en place           | Un seul compte Orange Developer ImmoTopia, un seul enregistrement ARTCI/MTN, une seule URL de rappel                                                 | Chaque agence crée son propre compte Orange (SIM, packs), fait valider son propre nom d'expéditeur                   |
| Facturation             | ImmoTopia achète les packs ; chaque agence reçoit un quota mensuel de SMS lié à son abonnement, décompté depuis `SmsMessage`                         | Chaque agence paie directement Orange ; ImmoTopia ne gère aucun flux d'argent SMS pour elle                          |
| Nom d'expéditeur        | « IMMOTOPIA » par défaut ; nom propre à l'agence possible via l'option Orange « Multiple Sender Names », chaque nom soumis à validation Orange/ARTCI | Chaque agence enregistre directement son propre nom d'expéditeur                                                     |
| Cohérence avec le lot 7 | S'écarte du patron `PaymentGatewayConfig` — justifié ci-dessus (pas de flux d'argent vers l'agence)                                                  | Suit exactement le patron `PaymentGatewayConfig` : `SmsGatewayConfig` chiffré, `tenantId @unique`, test de connexion |
| Risque de dépassement   | Le plafond Orange (100 000 FCFA/jour/SIM) est partagé par la plateforme ; le quota par agence (ci-dessus) protège les autres agences d'un pic isolé  | Chaque agence a son propre plafond, ses propres packs                                                                |
| Pour qui                | Le cas par défaut, quasi toutes les agences                                                                                                          | Grosses agences qui veulent leur propre marque SMS et sont prêtes à gérer leur compte Orange                         |

**Recommandation : modèle hybride, compte plateforme par défaut.** ImmoTopia
ouvre et opère un unique compte Orange (identifiants dans `env.ts`, §6),
avec le nom d'expéditeur « IMMOTOPIA » validé une fois pour toutes ; chaque
agence reçoit un quota mensuel de SMS inclus dans son abonnement (compté
depuis `SmsMessage`, alerte à l'approche du quota, blocage ou dépassement
facturé au-delà — **à trancher commercialement**, §12), sans rien à
configurer. Une agence qui veut son propre nom d'expéditeur peut le demander
via l'option Orange « Multiple Sender Names » (validation Orange/ARTCI
supplémentaire par nom, toujours sur le compte plateforme). Les grosses
agences qui veulent gérer leur propre compte Orange (leurs propres SIM,
packs, plafond) gardent l'option « identifiants propres », sur le patron
exact du lot 7 (`SmsGatewayConfig` chiffré) — traitée comme un lot ultérieur
(§10.2, lot SMS-4) plutôt que comme le chemin par défaut.

Conséquence sur le modèle de données (§5) : `SmsGatewayConfig` devient
**facultatif par agence** — son absence signifie « compte plateforme, quota
par défaut » ; une ligne n'est créée que pour fixer un quota personnalisé,
un nom d'expéditeur dédié, ou pour basculer une agence en identifiants
propres.

---

## 5. Modèle de données Prisma proposé

```prisma
enum SmsProviderKind {
  ORANGE
  SMS_PARTNER_AFRICA
  HSMS
  BULKGATE
}

enum SmsGatewayMode {
  PLATFORM         // compte Orange ImmoTopia, quota mensuel par agence (défaut, §4)
  OWN_CREDENTIALS  // l'agence utilise son propre compte Orange (identifiants chiffrés ci-dessous)
}

enum SmsMessageStatus {
  QUEUED
  SENT
  DELIVERED
  FAILED
  CANCELLED
}

enum SmsEncoding {
  GSM_7
  UCS_2
}

/// Réglages SMS d'une agence. Ligne absente = compte plateforme au quota par
/// défaut (§4) ; une ligne n'est créée que pour un quota personnalisé, un nom
/// d'expéditeur dédié (mode PLATFORM), ou des identifiants propres (mode
/// OWN_CREDENTIALS, patron lot 7 : PaymentGatewayConfig).
model SmsGatewayConfig {
  id                String          @id @default(uuid()) @db.Uuid
  tenantId          String          @unique @map("tenant_id")
  mode              SmsGatewayMode  @default(PLATFORM)
  provider          SmsProviderKind @default(ORANGE)
  isActive          Boolean         @default(true) @map("is_active")   // surtout pertinent en OWN_CREDENTIALS
  senderId          String?         @map("sender_id")            // nom d'expéditeur ; "IMMOTOPIA" si vide en mode PLATFORM
  clientIdEncrypted String?         @map("client_id_encrypted")  // rempli seulement en mode OWN_CREDENTIALS ; AES-256-GCM (crypto.ts du lot 7)
  clientSecretEncrypted String?     @map("client_secret_encrypted")
  credentialsLast4  String?         @map("credentials_last4")
  monthlyQuota      Int?            @map("monthly_quota")        // quota mensuel de l'agence en mode PLATFORM (lié à l'abonnement — source à trancher, §12)
  lastTestAt        DateTime?       @map("last_test_at")
  lastTestOk        Boolean?        @map("last_test_ok")
  lastTestMessage   String?         @map("last_test_message")
  createdAt         DateTime        @default(now()) @map("created_at")
  updatedAt         DateTime        @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("sms_gateway_configs")
}

/// Journal de chaque envoi SMS (transactionnel ou de masse). Isolé par tenant.
model SmsMessage {
  id                 String            @id @default(uuid()) @db.Uuid
  tenantId           String            @map("tenant_id")
  notificationKey    String?           @map("notification_key")   // clé WHATSAPP_NOTIFICATION_KEYS réutilisée, nullable pour un envoi manuel
  recipientContactId String?           @map("recipient_contact_id")
  recipientTenantClientId String?      @map("recipient_tenant_client_id")
  toPhone            String            @map("to_phone")           // E.164, numéro effectivement utilisé
  body               String            @db.Text
  segments           Int
  encoding           SmsEncoding
  estimatedCostFcfa  Decimal?          @map("estimated_cost_fcfa") @db.Decimal(10, 2)
  provider           SmsProviderKind
  providerMessageId  String?           @map("provider_message_id")
  status             SmsMessageStatus  @default(QUEUED)
  failureReason      String?           @map("failure_reason")
  sentAt             DateTime?         @map("sent_at")
  deliveredAt        DateTime?         @map("delivered_at")
  createdAt          DateTime          @default(now()) @map("created_at")

  tenant       Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contact      CrmContact?  @relation(fields: [recipientContactId], references: [id], onDelete: SetNull)
  tenantClient TenantClient? @relation(fields: [recipientTenantClientId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([tenantId, status])
  @@index([providerMessageId])
  @@map("sms_messages")
}
```

Notes :

- `tenantId` est présent sur les deux modèles, conformément à la règle
  d'isolation multi-tenant d'`AGENTS.md` (§« Isolation multi-tenant »).
  `SmsGatewayConfig.tenantId` est `@unique`, comme
  `PaymentGatewayConfig.tenantId` (contrat lot 7 ligne 26) : au plus une
  config par agence, et son absence est un état valide (§4).
- Le quota d'une agence en mode `PLATFORM` sans ligne `SmsGatewayConfig` se
  lit sur un quota par défaut de la plateforme (constante ou table
  d'abonnement — non détaillée ici, §12), pas sur `monthlyQuota` qui n'existe
  alors pas encore ; la consommation se calcule toujours par agrégation de
  `SmsMessage` sur le mois en cours, avec ou sans ligne de config.
- `providerMessageId` n'est pas `@unique` en base (un fournisseur peut ne pas
  en renvoyer un pour un envoi en échec immédiat), mais indexé pour la
  résolution du webhook (§3.9) — la résolution utilise en pratique
  `callbackData` (§3.9), qu'`OrangeSmsProvider` renseigne avec l'id de
  `SmsMessage` à l'envoi ; `providerMessageId` reste utile pour `getStatus`
  et l'affichage.
- `clientIdEncrypted`/`clientSecretEncrypted` séparés (Orange utilise un
  couple Client ID/Secret OAuth2, pas une clé API unique comme PaySecureHub),
  même format versionné `pg1:iv:authTag:ciphertext` que `crypto.ts` du lot 7,
  réutilisable tel quel.
- `TenantClient` existe bien, mais **n'a pas de colonne téléphone** (`User`
  non plus). Le numéro d'un locataire se résout aujourd'hui dans cet ordre :
  `CrmContact.phonePrimary` (via `details.crmContactId`), puis
  `phoneSecondary`, puis `whatsappNumber`, puis
  `TenantClient.details.phone`/`telephone`/`mobile` (JSON libre) —
  `packages/api/src/services/document-context-builder.ts` lignes 52-80 et 164. `SmsMessage.toPhone` (le numéro effectivement utilisé) vient de cette
  résolution, pas d'une colonne dédiée sur `TenantClient` ; voir §3.3 pour le
  partage de cette logique et §12 pour la question d'une colonne dédiée.
- **Décision ouverte** (cf. §3.3) : si une table `SmsNotificationConfig`
  séparée est retenue pour activer/désactiver le SMS par notification
  (symétrique à la config WhatsApp), elle s'ajoute ici — non détaillée faute
  d'avoir lu `whatsapp-notification-config-service.ts` en entier.

---

## 6. Variables d'environnement

Toutes passent par `packages/api/src/config/env.ts` (schéma Zod,
`z.object({...}).passthrough()`) et sont documentées dans
`packages/api/env.example`, conformément à la règle « Configuration »
d'`AGENTS.md`. Aucune valeur par défaut pour un secret.

**Écart assumé avec le code WhatsApp existant** : `whatsapp.provider.ts` lit
`process.env.WASENDER_API_KEY` etc. directement, sans passer par le schéma
`env` de `env.ts` — ce que la règle « Configuration » d'`AGENTS.md` interdit
pourtant explicitement. Le module SMS ne reproduit pas cet écart : toutes ses
variables sont déclarées dans le schéma Zod de `env.ts`, sur le modèle du lot
7 qui déclare bien `PAYMENT_SECRETS_KEY` et `PAYSECUREHUB_BASE_URL` dans son
propre `env.ts` (worktree lot7, lignes 87-88).

```ts
// Ajouts proposés à envSchema dans packages/api/src/config/env.ts
SMS_PROVIDER: z.enum(['orange', 'sms_partner_africa', 'hsms', 'bulkgate']).default('orange'),

// Compte plateforme (mode PLATFORM par défaut, §4) — sans valeur par défaut,
// non fournies : le SMS reste indisponible pour toutes les agences en mode PLATFORM.
ORANGE_SMS_CLIENT_ID: z.string().optional(),
ORANGE_SMS_CLIENT_SECRET: z.string().optional(),
ORANGE_SMS_PLATFORM_SENDER_ID: z.string().default('IMMOTOPIA'),

// Chiffrement des identifiants propres d'une agence (mode OWN_CREDENTIALS uniquement)
SMS_SECRETS_KEY: z.string().optional(), // 32 octets base64 ; séparée ou non de PAYMENT_SECRETS_KEY, à trancher (§12)

ORANGE_SMS_BASE_URL: z.string().url().default('https://api.orange.com'),
ORANGE_SMS_OAUTH_URL: z.string().url().default('https://api.orange.com/oauth/v3/token'),
ORANGE_SMS_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
ORANGE_SMS_MAX_PER_SECOND: z.coerce.number().int().positive().default(5),
SMS_DEFAULT_COUNTRY_CODE: z.string().regex(/^\d{1,4}$/).default('225'),

// Secret dans le chemin de l'URL de rappel Orange (§3.9) — aucune signature
// documentée par Orange pour ce mécanisme, ce secret en tient lieu.
ORANGE_SMS_WEBHOOK_PATH_SECRET: secretSchema,
```

```bash
# env.example — section à ajouter, sur le modèle de la section "WhatsApp Provider"
SMS_PROVIDER="orange"

# Compte Orange de la plateforme (mode PLATFORM par défaut, toutes les agences)
ORANGE_SMS_CLIENT_ID=""
ORANGE_SMS_CLIENT_SECRET=""
ORANGE_SMS_PLATFORM_SENDER_ID="IMMOTOPIA"

# Chiffrement des identifiants propres d'une agence (mode OWN_CREDENTIALS).
# 32 octets en base64. Générer avec: openssl rand -base64 32
# Absente : aucune agence ne peut basculer en identifiants propres.
SMS_SECRETS_KEY=""

ORANGE_SMS_BASE_URL="https://api.orange.com"
ORANGE_SMS_OAUTH_URL="https://api.orange.com/oauth/v3/token"
ORANGE_SMS_TIMEOUT_MS=15000
ORANGE_SMS_MAX_PER_SECOND=5
SMS_DEFAULT_COUNTRY_CODE="225"

# Secret inséré dans le chemin de l'URL de rappel Orange (/api/sms/webhook/orange/<secret>).
# Générer avec: openssl rand -base64 48
ORANGE_SMS_WEBHOOK_PATH_SECRET=""
```

**Décision à trancher** : `SMS_SECRETS_KEY` séparée de `PAYMENT_SECRETS_KEY`
(isolation des secrets, rotation indépendante) ou clé de chiffrement unique
pour toute la plateforme (plus simple à opérer). Ce document recommande une
clé séparée : un module reste compromis indépendamment de l'autre en cas de
fuite, et le format versionné `pg1:...` de `crypto.ts` gagnerait de toute
façon un préfixe distinct (`sms1:...`). Avec le modèle hybride du §4, cette
clé n'est nécessaire que pour les agences qui basculent en identifiants
propres — la grande majorité des agences (mode plateforme) n'en dépend pas.

---

## 7. Écrans

Toutes les règles i18n d'`AGENTS.md` s'appliquent : le texte français est la
clé de traduction (`t('Paramètres SMS')`, jamais `t('sms.settings')`), toute
marge en propriété logique (`margin-inline-start`, jamais `ml-4`), et
`npm run i18n:extract` dans `apps/web` après toute rédaction de texte pour
mettre à jour les catalogues fr/en/ar.

### 7.1 Carte de réglages SMS

`apps/web/src/components/settings/SmsGatewaySettingsCard.tsx` (nouveau
fichier), calqué sur `PaymentGatewaySettingsCard.tsx` du lot 7. Vue par
défaut (mode plateforme, aucune ligne `SmsGatewayConfig` requise) : quota
mensuel restant (agrégation `SmsMessage` du mois vs `monthlyQuota` ou le
quota par défaut, §5), nom d'expéditeur affiché (« IMMOTOPIA » ou le nom
dédié validé via « Multiple Sender Names », §4), champ pour en demander un
propre (texte informatif : validation Orange/ARTCI, délai). Section
« Identifiants propres » repliée par défaut (`Switch`/`Collapse`) : bascule
en mode `OWN_CREDENTIALS`, champ Client ID/Secret en écriture seule (jamais
renvoyés par l'API, seulement `credentialsConfigured` et `credentialsLast4`,
comme `apiKeyConfigured`/`apiKeyLast4` côté paiement), bouton « Remplacer les
identifiants » qui déverrouille le champ (state `editingCredentials`,
identique à `editingApiKey` du composant lot 7), nom d'expéditeur propre
(`senderId`, validation 11 caractères alphanumériques sans espace ni
caractère spécial), bouton « Tester la connexion »
(`POST /api/tenants/:tenantId/settings/sms-gateway/test` — obtient un jeton
et lit `contracts`, §3.2), alerte si `encryptionAvailable` est faux
(`SMS_SECRETS_KEY` manquante, bascule impossible).

Section « Test d'envoi » : champ numéro + bouton « Envoyer un SMS de test »,
sur le modèle de `testSendHandler` WhatsApp
(`whatsapp-notification-config-controller.ts` lignes 230-287) —
`POST /api/tenants/:tenantId/sms/test-send`.

### 7.2 Choix du canal SMS dans les règles de notification existantes

Le canal SMS s'ajoute là où le canal WhatsApp est déjà configurable par
notification (page dérivée de la liste `WHATSAPP_NOTIFICATION_META`,
`whatsapp-notification-keys.ts` lignes 42-184) : chaque ligne de la liste des
22 notifications gagne une case à cocher/interrupteur SMS à côté de celui
WhatsApp existant, avec le même mécanisme d'édition du corps du message
(`bodyOverride`) que la config WhatsApp — en tenant compte du§ 3.7 (segments)
pour avertir l'agence si son texte personnalisé dépasse 1 segment.

### 7.3 Historique des envois

Nouvelle page (ou onglet de la page communication existante) listant
`SmsMessage` avec filtres statut/date/destinataire, sur le modèle des User
Story 3 de `specs/010-communication-module/spec.md` (§42-56) : liste paginée,
statut par ligne, raison d'échec visible au clic, action « Renvoyer » pour un
`FAILED` (limité par le taux 5/s, §3.5).

---

## 8. Erreurs

Le service `sms-notification-send-service.ts` et le contrôleur
`sms-gateway-controller.ts` suivent le modèle
`property-media-controller.ts` : contrôleurs enveloppés dans `asyncHandler`
(`packages/api/src/middleware/error-middleware.ts`), services qui lèvent des
erreurs typées (`BadRequestError`, `NotFoundError`, `ConflictError`,
`ValidationError` — classes confirmées dans `error-middleware.ts` lignes
63-93) plutôt qu'un `try/catch` qui devine le statut HTTP à partir du message.

**Écart assumé avec le code WhatsApp existant** : le contrôleur
`whatsapp-notification-config-controller.ts` actuel enveloppe chaque handler
dans un `try/catch` manuel qui renvoie 500 par défaut, ou dérive le statut du
texte du message (`err.message.startsWith('Provider HTTP ')`, ligne 279 ;
`isGroupBroadcastClientError`, test de sous-chaînes françaises « requis »,
« invalide », lignes 215-224) — exactement le patron qu'`AGENTS.md` interdit.
Le module SMS ne le reproduit pas et lève des erreurs typées à la place
(`throw new BadRequestError('Numéro requis.')` plutôt que
`res.status(400).json(...)`).

Exemples d'erreurs typées attendues :

- `BadRequestError` : numéro absent/invalide, texte vide ou trop long,
  fournisseur non configuré, tentative d'enregistrer des identifiants sans
  `SMS_SECRETS_KEY` (`encryptionAvailable` faux), nom d'expéditeur invalide
  (>11 caractères ou caractères interdits).
- `NotFoundError` : `SmsMessage` inexistant ou d'une autre agence (via
  `assertBelongsToTenant`, §9), compte de trésorerie/quota référencé
  inexistant.
- `ConflictError` : webhook reçu pour un `SmsMessage` déjà `DELIVERED` avec un
  statut contraire incohérent (à ignorer plutôt qu'à écraser, cf. §3.9
  idempotence — ce cas ne lève probablement pas d'erreur visible côté client,
  simplement un log).

---

## 9. Conformité

- **Consentement / désinscription (STOP)** : tout SMS **promotionnel**
  (annonces, newsletter SMS si un jour ajoutée) exige le consentement du
  destinataire — réutiliser `consentMarketing` (`CrmContact.consentMarketing`,
  schema.prisma ligne 1040), ou ajouter un `consentSms` dédié par cohérence
  avec `consentWhatsapp`/`consentEmail` déjà distincts (**décision à
  trancher**, §12). Tout SMS promotionnel doit porter une mention de
  désinscription (« STOP au XXXX ») ; le traitement d'un STOP entrant est
  **hors périmètre technique de ce document** — à vérifier auprès d'Orange
  si c'est pris en charge côté plateforme ou à implémenter côté ImmoTopia
  (suppose un canal de réception de SMS entrants, non couvert ici).
- **SMS transactionnels** (rappel de loyer, reçu de paiement, ticket de
  maintenance) : même principe que le WhatsApp existant — envoyés dès qu'un
  numéro est disponible, sans consentement marketing distinct, base légale
  « exécution du contrat » de bail/gestion. Cohérent avec le comportement
  actuel de `sendWhatsappNotification` sur le chemin `to` direct (§1.2).
- **Heures d'envoi** : restreintes pour le SMS promotionnel (créneau à
  définir, ex. 8h-20h Abidjan) — aucune contrainte réglementaire identifiée
  pour le transactionnel dans les sources citées, mais bonne pratique de ne
  pas envoyer de rappel avant 7h ni après 21h. À implémenter comme un filtre
  dans `sms-notification-send-service.ts` (reporter en file plutôt
  qu'annuler), sur le principe des « quiet hours » déjà prévues dans
  `CreatePreferenceDto` (`communication-types.ts` lignes 76-77).
- **Pas de données sensibles dans le SMS** : jamais de mot de passe, de solde
  bancaire complet, ni d'information d'identité — un SMS est lisible sur
  l'écran de verrouillage. Les gabarits ne portent que le strict nécessaire
  (montant dû, échéance, lien court).
- **Enregistrement du nom d'expéditeur (ARTCI)** : obligatoire, doit
  contenir la marque, sensible à la casse, délai ~5 jours ouvrés chez Orange,
  ~15 jours chez MTN avec pré-enregistrement obligatoire (d7networks, Telnyx,
  §13) — à lancer tôt, voir §11. Dans le modèle hybride (§4), « IMMOTOPIA »
  se valide une fois pour le compte plateforme ; chaque nom d'expéditeur
  supplémentaire demandé par une agence via « Multiple Sender Names » suit
  son propre délai de validation Orange/ARTCI, indépendamment des autres.

---

## 10. Plan de tests et découpage en lots

### 10.1 Plan de tests

- **Unitaires, fournisseur simulé** : un `FakeSmsProvider implements
SmsProvider` (en mémoire, pas de réseau) pour tester
  `sms-notification-send-service.ts` sans appeler Orange — même esprit que le
  mode `SIMULATOR` du lot 7 (`PaymentGatewayMode`). Couvre : normalisation de
  numéro (formats avec/sans `+`, avec `00`, avec `0` local), calcul de
  segments/encodage (texte pur GSM-7, texte avec accents, texte arabe, texte
  à la limite de 160/153/70/67 caractères), résolution du gabarit par défaut
  vs `bodyOverride`, respect du consentement sur le chemin `contactId`.
- **Isolation multi-tenant** : un test qui crée deux agences, une
  `SmsGatewayConfig` par agence, vérifie qu'un `SmsMessage` de l'agence A
  n'est ni lisible ni modifiable par un appel authentifié pour l'agence B
  (mêmes fondations que `getPropertyForTenant`, `property-tenant-guard.ts`).
  Si `tenant-ownership.ts`/`assertBelongsToTenant` et les tests
  `schema-tenant-coverage.test.ts`/`routes-inventory.test.ts` du worktree
  lot7 sont fusionnés sur `main` d'ici l'implémentation SMS (**à vérifier** :
  absents de l'`AGENTS.md` de la branche `docs/spec-fournisseur-sms`), les
  nouveaux modèles et routes SMS doivent les satisfaire.
- **Webhook idempotent** : rejouer deux fois le même corps de webhook avec un
  `providerMessageId` identique ne doit produire qu'une seule mise à jour
  effective de `SmsMessage.status`, et un statut `DELIVERED` ne doit jamais
  redescendre vers `SENT`/`QUEUED` sur réception d'un webhook tardif ou
  dupliqué.
- **Segments** : cas limites explicites — 160 caractères GSM-7 exact (1
  segment), 161 caractères GSM-7 (2 segments), 70 caractères UCS-2 exact (1
  segment), texte mêlant un seul emoji/caractère arabe au milieu d'un texte
  français (bascule UCS-2 pour tout le message, pas seulement le caractère
  concerné).
- **Erreurs typées** : vérifier qu'un numéro invalide lève `BadRequestError`
  et non une 500, qu'un `SmsGatewayConfig` d'une autre agence référencé lève
  `NotFoundError`.

### 10.2 Découpage en lots de livraison

1. **Lot SMS-1 — Fondations et compte plateforme.** Modèle Prisma
   (`SmsGatewayConfig` facultatif, `SmsMessage`), migration, `env.ts`/
   `env.example` (identifiants du compte plateforme), interface
   `SmsProvider`, `OrangeSmsProvider` (OAuth2, envoi texte simple, lecture
   `contracts` pour `getBalance()`/`testConnection()`, sans file d'attente ni
   segments encore), carte de réglages frontend en lecture (quota, nom
   d'expéditeur). Pas encore branché aux déclencheurs.
2. **Lot SMS-2 — Envoi transactionnel et journal.** File d'attente 5/s,
   normalisation E.164, calcul de segments/coût, décompte du quota mensuel
   par agence, service d'envoi, branchement sur 2-3 déclencheurs à fort
   impact (`INSTALLMENT_DUE_REMINDER`, `PAYMENT_APPROVED_TENANT`,
   `CHARGE_CALL_ISSUED`), historique en lecture seule.
3. **Lot SMS-3 — Webhook, statuts, reste des déclencheurs.** Webhook Orange
   avec secret de chemin (accusés via `callbackData`, idempotence), mise à
   jour de statut dans l'historique, extension aux déclencheurs restants
   (maintenance, patrimoine, reste du syndic), choix du canal SMS dans
   l'écran de règles de notification existant.
4. **Lot SMS-4 — Identifiants propres, conformité, deuxième fournisseur
   (optionnel).** Bascule `OWN_CREDENTIALS` pour les grosses agences
   (chiffrement des identifiants, carte de réglages repliée, patron lot 7),
   consentement SMS dédié si retenu (§9), heures d'envoi, gestion du STOP si
   le besoin promotionnel se confirme, fournisseur de secours
   (`SmsPartnerAfricaProvider`) derrière la même interface `SmsProvider`.

---

## 11. Démarches hors code à lancer tôt

- **Créer le compte Orange Developer de la plateforme** (SIM Orange dédiée,
  souscription à l'API SMS CI, accès sandbox puis production) — préalable à
  tout développement contre l'API réelle. C'est le seul compte à ouvrir dans
  le modèle recommandé (§4) ; il porte le Client ID/Secret d'`env.ts`.
- **Demander la validation du nom d'expéditeur « IMMOTOPIA »** auprès
  d'Orange : ~5 jours ouvrés, 11 caractères alphanumériques max, sans espace
  ni caractère spécial, sensible à la casse (ARTCI). C'est le nom par défaut
  de toutes les agences en mode plateforme.
- **Déclarer l'URL de rappel des accusés** via le formulaire Orange Developer
  du compte plateforme (§3.9) — une seule fois, puisqu'un seul compte.
- **Lancer l'enregistrement MTN en parallèle**, dès que la couverture
  multi-opérateurs d'Orange SMS API CI est confirmée (§2) : ~15 jours ouvrés,
  pré-enregistrement obligatoire avant tout envoi vers des numéros MTN — une
  seule démarche pour toute la plateforme.
- **Se renseigner sur l'option Orange « Multiple Sender Names »** (délai et
  coût par nom supplémentaire) avant de la proposer aux agences qui
  voudraient leur propre nom d'expéditeur en mode plateforme.
- **Si une agence bascule en identifiants propres (§4, lot SMS-4)** :
  préparer un guide court expliquant comment créer son propre compte Orange
  Developer et où trouver son Client ID/Secret — cette démarche n'est alors
  pas au pouvoir d'ImmoTopia, l'agence la fait elle-même.

---

## 12. Questions ouvertes

1. Orange confirme-t-il l'envoi effectif vers MTN et Moov via l'API SMS CI
   v2.0, ou seulement vers les numéros Orange ? Détermine si un deuxième
   fournisseur est nécessaire dès le lancement plutôt qu'en secours.
2. **Tarif/quota SMS par formule d'abonnement** (modèle hybride, §4) :
   `docs/PROPOSITION_MODELE_ECONOMIQUE_2026.md` a été consulté et ne mentionne
   le SMS dans aucune formule — le quota mensuel par agence (nombre de SMS
   inclus, comportement au dépassement : blocage ou facturation
   supplémentaire) reste à définir commercialement avant le lot SMS-2.
3. Quelle part des agences est susceptible de demander des identifiants
   propres (§4, lot SMS-4) plutôt que le compte plateforme — dimensionne
   l'effort à mettre sur cette option.
4. `SMS_SECRETS_KEY` séparée de `PAYMENT_SECRETS_KEY` du lot 7, ou clé de
   chiffrement unique pour tous les secrets de passerelle de la plateforme ?
5. Un `consentSms` dédié sur `CrmContact`, ou réutilisation de
   `consentMarketing` pour le SMS promotionnel (§9) ?
6. Le besoin OTP par SMS (connexion, vérification de numéro) existe-t-il
   réellement à court terme ? Il mériterait son propre lot.
7. Qui gère le mot-clé STOP entrant : la plateforme Orange nativement, ou
   ImmoTopia doit-il recevoir et traiter des SMS entrants (non couvert ici) ?
8. La configuration SMS par notification (§3.3) : nouveau modèle Prisma
   dédié, ou extension du modèle de configuration WhatsApp existant (non lu
   en détail) pour porter plusieurs canaux ?
9. Le champ `callbackData` (§3.9) est-il bien accepté dans le corps de la
   requête d'envoi `smsmessaging/v1/outbound/.../requests` ? Non confirmé
   dans la documentation lue — à valider à l'essai avant le lot SMS-3, faute
   de quoi la corrélation des accusés repose uniquement sur `resourceURL`.
10. Faut-il une vraie colonne téléphone (et un consentement SMS dédié) sur
    `TenantClient`, plutôt que de continuer à résoudre le numéro via
    `CrmContact`/`details` JSON (§3.3, §5) ? Simplifierait la résolution et
    éviterait sa dépendance à un contact CRM lié.

---

## 13. Sources

- Orange SMS API Côte d'Ivoire — présentation : https://developer.orange.com/apis/sms-ci
- Orange SMS API Côte d'Ivoire — tarifs : https://developer.orange.com/apis/sms-ci/pricing
- Orange SMS API Côte d'Ivoire — FAQ : https://developer.orange.com/apis/sms-ci/faq
- Orange SMS API Côte d'Ivoire — référence API : https://developer.orange.com/apis/sms-ci/api-reference
- Orange SMS API — guide de démarrage (commun à tous les pays, endpoints
  OAuth2/envoi/administration/webhook) : https://developer.orange.com/apis/sms/getting-started
- HSMS (Abidjan) : https://hsms.ci/
- SMS Partner Africa — API SMS Côte d'Ivoire : https://smspartner.africa/ci/api-sms/
- BulkGate — tarifs Côte d'Ivoire : https://www.bulkgate.com/en/pricing/sms/ci/cote-d-ivoire/
- Twilio — tarifs SMS Côte d'Ivoire : https://www.twilio.com/en-us/sms/pricing/ci
- D7 Networks — réglementation SMS Côte d'Ivoire (ARTCI) : https://d7networks.com/sms/ivory-coast-cote-d-ivoire/sms-regulations/
- Telnyx — guide SMS Côte d'Ivoire : https://support.telnyx.com/en/articles/6665111-cote-d-ivoire-sms-guidelines

### Fichiers du dépôt cités

- `AGENTS.md` (racine)
- `packages/api/src/services/providers/whatsapp.provider.ts`
- `packages/api/src/services/providers/email.provider.ts`
- `packages/api/src/services/whatsapp-notification-send-service.ts`
- `packages/api/src/controllers/whatsapp-notification-config-controller.ts`
- `packages/api/src/constants/whatsapp-notification-keys.ts`
- `packages/api/src/types/communication-types.ts`
- `packages/api/src/utils/communication-validators.ts`
- `packages/api/src/config/env.ts`
- `packages/api/env.example`
- `packages/api/prisma/schema.prisma` (enums `PreferredContactChannel`,
  `CrmActivityType`, `ReminderChannel`, `ReminderStatus`, modèles
  `PaymentReminder`, `Communication`, `CommunicationPreference`, `CrmContact`)
- `packages/api/src/middleware/error-middleware.ts`
- `packages/api/src/controllers/property-media-controller.ts`
- `packages/api/src/utils/property-tenant-guard.ts`
- `packages/api/src/lib/syndics/notifications.ts`
- `packages/api/src/lib/patrimoine/notifications.ts`
- `packages/api/src/services/maintenance-notification-service.ts`
- `packages/api/src/services/document-context-builder.ts` (résolution du
  téléphone d'un `TenantClient`, lignes 52-80 et 164)
- `specs/010-communication-module/spec.md`
- `specs/011-in-app-notifications-messaging/spec.md`
- `docs/PROPOSITION_MODELE_ECONOMIQUE_2026.md` (aucune mention du SMS, §12)
- `.claude/worktrees/lot7/docs/finance/LOT-7-CONTRAT-PAIEMENT-EN-LIGNE.md`
  (branche `feat/paiement-en-ligne-lot-7`, non fusionnée)
- `.claude/worktrees/lot7/packages/api/src/lib/payment-gateway/crypto.ts`
- `.claude/worktrees/lot7/packages/api/src/lib/payment-gateway/settings.ts`
- `.claude/worktrees/lot7/packages/api/src/utils/tenant-ownership.ts`
- `.claude/worktrees/lot7/apps/web/src/components/settings/PaymentGatewaySettingsCard.tsx`
- `.claude/worktrees/lot7/packages/api/src/config/env.ts`
- `.claude/worktrees/lot7/packages/api/src/utils/tenant-context.ts`
  (`runWithTenantContext`, ligne 23)
- `.claude/worktrees/lot7/packages/api/src/lib/payment-gateway/checkout.ts`
  (appelant de `runWithTenantContext`)
- `.claude/worktrees/lot7/packages/api/src/jobs/newsletter-campaign-scheduler.job.ts`
  (appelant de `runWithTenantContext`)
- `.claude/worktrees/lot7/AGENTS.md` (variante non fusionnée, règles
  supplémentaires sur `assertBelongsToTenant` et les tests d'isolation)
