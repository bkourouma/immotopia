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
CRM) et les écrans (`apps/web` : carte en lecture seule côté agence, onglet
SMS de la fiche agence côté super-admin, règles de notification, historique)
appellent tous deux, par des chemins différents (appel direct de service côté
back, REST côté front), le nouveau `sms-notification-send-service.ts`. Ce
service résout les réglages de l'agence (`TenantSmsSettings` : activé, nom
d'expéditeur, quota — §5), vérifie le consentement (`CrmContact`/
`TenantClient`), normalise le numéro en E.164 `+225`, puis appelle
l'interface `SmsProvider` et journalise le résultat dans `SmsMessage` (le
découpage en segments et l'estimation du coût arrivent au lot SMS-2, §5).
`SmsProvider` est implémentée d'abord par `OrangeSmsProvider` — un compte
Orange **unique pour toute la plateforme** (§4), OAuth2 `client_credentials`
— et plus tard par un second fournisseur (ex. `SmsPartnerAfricaProvider`)
derrière la même interface. Orange notifie les accusés de réception sur le
webhook public `POST /api/sms/webhook/orange/:secret` (§3.9, lot SMS-3).

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
  senderId?: string; // nom d'expéditeur ; défaut = TenantSmsSettings.senderName sinon ORANGE_SMS_PLATFORM_SENDER_NAME (§6)
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
  readonly kind: "orange" | "log" | "sms_partner_africa" | "hsms" | "bulkgate"; // 'log' = fournisseur factice du lot SMS-1, §6
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
  (le numéro court/l'expéditeur — `ORANGE_SMS_SENDER_ADDRESS`, §6 — figure
  encodé dans l'URL), corps
  `{"outboundSMSMessageRequest":{"address":"tel:+2250102030405","senderAddress":"<ORANGE_SMS_SENDER_ADDRESS>","senderName":"<TenantSmsSettings.senderName ou ORANGE_SMS_PLATFORM_SENDER_NAME>","outboundSMSTextMessage":{"message":"..."}}}`.
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
- Pour un envoi ciblant un locataire (`TenantClient`), le numéro n'est pas
  stocké comme relation sur `SmsMessage` (§5) : `TenantClient` n'a pas de
  colonne téléphone, donc le service résout le numéro *avant* l'envoi et ne
  journalise que le résultat (`SmsMessage.to`). Cette résolution suit
  aujourd'hui l'ordre défini par `document-context-builder.ts` (lignes 52-80,
  164) : `CrmContact.phonePrimary` → `phoneSecondary` → `whatsappNumber` →
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

**Compte unique (§4)** : le compte Orange étant unique pour toute la
plateforme — aucune agence n'a ses propres identifiants — le cache de jeton
est une simple variable de module (un seul jeton, comme `twilioClient` dans
`whatsapp.provider.ts`), pas une structure par agence.

### 3.5 Limitation à 5 SMS/s

Orange impose 5 transactions/s pour l'unique compte de la plateforme (§4).
Une file d'attente en mémoire process (FIFO, un `setInterval`/`p-queue`-like
ou équivalent maison) sérialise **tous** les envois, toutes agences
confondues, à un débit ≤ 5/s — une seule file globale, pas de file par
agence puisqu'il n'y a qu'un compte. Un envoi qui dépasse le débit attend en
file plutôt que d'échouer immédiatement — cohérent avec le comportement
transactionnel attendu (rappel de loyer, reçu de paiement) où un délai de
quelques secondes est acceptable mais un échec silencieux ne l'est pas.
Cette file d'attente arrive au lot SMS-2 (§10.2) ; le lot SMS-1 n'envoie que
des SMS de test, à un rythme trop faible pour la nécessiter.

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
l'encodage avant l'envoi (fonction pure, testable sans réseau) et les utilise
pour l'estimation de coût. **Leur persistance dans `SmsMessage` arrive au lot
SMS-2** : le modèle du lot SMS-1 (§5) n'a pas encore de colonnes `segments`,
`encoding` ni `estimatedCostFcfa`.

### 3.8 Journalisation

Chaque tentative d'envoi crée une ligne `SmsMessage` (§5) avant même l'appel
réseau (statut `QUEUED`), puis mise à jour après réponse (`SENT` / `FAILED`,
avec `providerMessageId` si Orange en a renvoyé un) et après accusé webhook
(`DELIVERED` / `FAILED`, lot SMS-3). Ce flux journal-avant-envoi est important
pour ne pas perdre trace d'un SMS parti mais dont la réponse HTTP a timeout
(Orange dit avoir reçu la requête, l'agence ne le saurait jamais sans une
ligne `QUEUED` déjà en base). Segments, encodage et coût estimé s'ajoutent au
journal à partir du lot SMS-2 (§3.7, §5).

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

## 4. Décision prise (24/09/2026) : compte plateforme unique

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

Comparatif ayant mené à la décision :

|                         | Compte plateforme (retenu)                                                                                                                            | Identifiants propres par agence (écarté)                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Mise en place           | Un seul compte Orange Developer ImmoTopia, un seul enregistrement ARTCI/MTN, une seule URL de rappel                                                   | Chaque agence crée son propre compte Orange (SIM, packs), fait valider son propre nom d'expéditeur                     |
| Facturation             | ImmoTopia achète les packs ; chaque agence reçoit un quota mensuel de SMS lié à son abonnement, décompté depuis `SmsMessage`                           | Chaque agence paie directement Orange ; ImmoTopia ne gère aucun flux d'argent SMS pour elle                            |
| Nom d'expéditeur        | « IMMOTOPIA » par défaut ; nom propre à l'agence possible via l'option Orange « Multiple Sender Names », chaque nom soumis à validation Orange/ARTCI   | Chaque agence enregistre directement son propre nom d'expéditeur                                                       |
| Cohérence avec le lot 7 | S'écarte du patron `PaymentGatewayConfig` — justifié ci-dessus (pas de flux d'argent vers l'agence)                                                     | Suivait le patron `PaymentGatewayConfig` : identifiants chiffrés, `tenantId @unique`, test de connexion               |
| Risque de dépassement   | Le plafond Orange (100 000 FCFA/jour/SIM) est partagé par la plateforme ; le quota par agence (ci-dessus) protège les autres agences d'un pic isolé    | Chaque agence aurait eu son propre plafond, ses propres packs                                                          |
| Pour qui                | Toutes les agences, sans exception                                                                                                                      | Aurait visé les grosses agences voulant leur propre marque SMS et prêtes à gérer leur compte Orange                    |

**Décision (Baba, 24/09/2026) : un seul compte Orange, au nom d'ImmoTopia.**
L'option « identifiants propres par agence » est abandonnée : aucune agence
ne configure ni ne paie son propre compte Orange, il n'y a pas de
chiffrement d'identifiants à gérer par agence. ImmoTopia ouvre et opère
l'unique compte Orange (identifiants dans `env.ts`, §6), avec le nom
d'expéditeur « IMMOTOPIA » par défaut ; chaque agence reçoit un quota mensuel
de SMS inclus dans son abonnement (compté depuis `SmsMessage`, quota par
défaut `SMS_DEFAULT_MONTHLY_QUOTA` si non personnalisé — le tarif/quota exact
par formule d'abonnement reste à trancher commercialement, §12). Une agence
qui veut son propre nom d'expéditeur peut le demander via l'option Orange
« Multiple Sender Names » (validation Orange/ARTCI supplémentaire par nom,
toujours sur le compte plateforme, jamais un compte Orange séparé).

Conséquence sur le modèle de données (§5) : le `SmsGatewayConfig` chiffré
envisagé plus haut est remplacé par `TenantSmsSettings` — pas d'identifiants
par agence, seulement activation, nom d'expéditeur et quota.

---

## 5. Modèle de données Prisma proposé

```prisma
enum SmsMessageStatus {
  QUEUED
  SENT
  DELIVERED
  FAILED
}

/// Réglages SMS d'une agence, dans le modèle à compte plateforme unique (§4).
/// Une ligne par agence, créée à l'activation (pas d'identifiants ici : le
/// compte Orange est celui de la plateforme, configuré une fois dans env.ts).
model TenantSmsSettings {
  id           String   @id @default(uuid()) @db.Uuid
  tenantId     String   @unique @map("tenant_id")
  enabled      Boolean  @default(false)
  senderName   String?  @map("sender_name")   // null = nom de la plateforme (ORANGE_SMS_PLATFORM_SENDER_NAME, §6)
  monthlyQuota Int?     @map("monthly_quota") // null = quota par défaut (SMS_DEFAULT_MONTHLY_QUOTA, §6)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("tenant_sms_settings")
}

/// Journal de chaque envoi SMS (déclenché par un événement métier ou un test
/// manuel). Isolé par tenant. Lot SMS-1 : pas de colonnes segments/encodage/
/// coût estimé — elles arrivent au lot SMS-2 (§3.7, §3.8, §10.2).
model SmsMessage {
  id                String           @id @default(uuid()) @db.Uuid
  tenantId          String           @map("tenant_id")
  to                String           // E.164, numéro effectivement utilisé (§3.6)
  body              String           @db.Text
  senderName        String?          @map("sender_name")
  status            SmsMessageStatus @default(QUEUED)
  provider          String           // 'orange' | 'log' (§6) — chaîne libre, pas un enum : la liste des fournisseurs bougera encore (secours, lot SMS-4)
  providerMessageId String?          @map("provider_message_id")
  notificationKey   String?          @map("notification_key") // clé WHATSAPP_NOTIFICATION_KEYS réutilisée ; null = envoi de test manuel
  errorMessage      String?          @map("error_message")
  createdByUserId   String?          @map("created_by_user_id") // utilisateur admin à l'origine d'un envoi de test
  sentAt            DateTime?        @map("sent_at")
  deliveredAt       DateTime?        @map("delivered_at")
  createdAt         DateTime         @default(now()) @map("created_at")
  updatedAt         DateTime         @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, createdAt])
  @@index([providerMessageId])
  @@map("sms_messages")
}
```

Notes :

- `tenantId` est présent sur les deux modèles, conformément à la règle
  d'isolation multi-tenant d'`AGENTS.md` (§« Isolation multi-tenant »).
  `TenantSmsSettings.tenantId` est `@unique` : au plus une ligne de réglages
  par agence.
- Une agence sans ligne `TenantSmsSettings` équivaut à ses valeurs par
  défaut : `enabled=false`, `senderName=null` (nom de la plateforme),
  `monthlyQuota=null` (quota par défaut `SMS_DEFAULT_MONTHLY_QUOTA`, §6). Une
  ligne n'est créée qu'à l'activation du SMS pour l'agence, ou pour
  personnaliser son nom d'expéditeur ou son quota. La consommation du mois se
  calcule toujours par agrégation de `SmsMessage` sur le mois en cours, avec
  ou sans ligne de réglages.
- `providerMessageId` n'est pas `@unique` en base (un fournisseur peut ne pas
  en renvoyer un pour un envoi en échec immédiat), mais indexé pour la
  résolution du webhook (§3.9, lot SMS-3) — la résolution utilise en pratique
  `callbackData`, qu'`OrangeSmsProvider` renseigne avec l'id de `SmsMessage`
  à l'envoi ; `providerMessageId` reste utile pour `getStatus` et
  l'affichage.
- Pas de relation `contact`/`tenantClient` sur `SmsMessage` : contrairement
  au brouillon précédent, seul le numéro effectivement utilisé (`to`) est
  journalisé, pas l'identité du destinataire — cohérent avec la résolution du
  téléphone en amont de l'envoi (note suivante et §3.3), qui reste dans le
  service d'envoi plutôt que dans le journal.
- `TenantClient` existe bien, mais **n'a pas de colonne téléphone** (`User`
  non plus). Le numéro d'un locataire se résout aujourd'hui dans cet ordre :
  `CrmContact.phonePrimary` (via `details.crmContactId`), puis
  `phoneSecondary`, puis `whatsappNumber`, puis
  `TenantClient.details.phone`/`telephone`/`mobile` (JSON libre) —
  `packages/api/src/services/document-context-builder.ts` lignes 52-80 et
  164. `SmsMessage.to` (le numéro effectivement utilisé) vient de cette
  résolution ; voir §3.3 pour le partage de cette logique et §12 pour la
  question d'une colonne dédiée.
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

// 'log' n'envoie rien (écrit dans les logs) : défaut sûr pour dev/CI tant que
// le compte Orange n'est pas configuré.
SMS_PROVIDER: z.enum(['orange', 'log']).default('log'),

// Compte Orange unique de la plateforme (§4) — sans valeur par défaut pour
// les identifiants : non fournis, le SMS reste indisponible pour toutes les
// agences (SMS_PROVIDER=orange échoue au démarrage ou au premier envoi).
ORANGE_SMS_CLIENT_ID: z.string().optional(),
ORANGE_SMS_CLIENT_SECRET: z.string().optional(),
ORANGE_SMS_API_BASE_URL: z.string().url().default('https://api.orange.com'),
ORANGE_SMS_SENDER_ADDRESS: z.string().default('tel:+2250000'), // numéro/short code expéditeur pour l'URL d'envoi (§3.2)
ORANGE_SMS_PLATFORM_SENDER_NAME: z.string().default(''), // vide tant que le nom n'est pas validé par Orange/ARTCI (§11)

// Quota mensuel d'une agence sans TenantSmsSettings.monthlyQuota (§5) —
// valeur provisoire du lot SMS-1 ; le tarif/quota par formule d'abonnement
// reste à définir commercialement (§12).
SMS_DEFAULT_MONTHLY_QUOTA: z.coerce.number().int().positive().default(100),

// Secret dans le chemin de l'URL de rappel Orange (§3.9) — prévu pour le
// webhook du lot SMS-3, déclaré dès maintenant pour ne pas rouvrir env.ts
// plus tard. Optionnel tant que ce webhook n'existe pas.
ORANGE_SMS_WEBHOOK_PATH_SECRET: z.string().optional(),
```

```bash
# env.example — section à ajouter, sur le modèle de la section "WhatsApp Provider"
# SMS_PROVIDER="orange" | "log" (log = n'envoie rien, pour dev/CI)
SMS_PROVIDER="log"

# Compte Orange unique de la plateforme (§4) — toutes les agences envoient
# depuis ce compte, il n'y a pas d'identifiants par agence.
ORANGE_SMS_CLIENT_ID=""
ORANGE_SMS_CLIENT_SECRET=""
ORANGE_SMS_API_BASE_URL="https://api.orange.com"
ORANGE_SMS_SENDER_ADDRESS="tel:+2250000"
# Vide tant que le nom n'est pas validé par Orange/ARTCI (§11). Une agence
# peut avoir son propre nom via TenantSmsSettings.senderName (§5), validé
# séparément sur ce même compte (option Orange "Multiple Sender Names", §4).
ORANGE_SMS_PLATFORM_SENDER_NAME=""

# Quota mensuel d'une agence sans quota personnalisé (TenantSmsSettings.monthlyQuota)
SMS_DEFAULT_MONTHLY_QUOTA=100

# Secret inséré dans le chemin de l'URL de rappel Orange
# (/api/sms/webhook/orange/<secret>). Prévu pour le lot SMS-3 ; peut rester
# vide jusque-là. Générer avec: openssl rand -base64 48
ORANGE_SMS_WEBHOOK_PATH_SECRET=""
```

---

## 7. Écrans

Toutes les règles i18n d'`AGENTS.md` s'appliquent : le texte français est la
clé de traduction (`t('Paramètres SMS')`, jamais `t('sms.settings')`), toute
marge en propriété logique (`margin-inline-start`, jamais `ml-4`), et
`npm run i18n:extract` dans `apps/web` après toute rédaction de texte pour
mettre à jour les catalogues fr/en/ar.

### 7.1 Réglages SMS

Le compte Orange étant unique pour toute la plateforme (§4), il n'y a rien à
configurer par agence côté identifiants — seulement l'activation, le nom
d'expéditeur et le quota. Deux écrans, à deux niveaux d'accès :

- **Carte SMS de la fiche agence (lecture seule)** : sur la page de réglages
  existante de l'agence, une carte affiche le statut (activé/désactivé), le
  nom d'expéditeur (`TenantSmsSettings.senderName` ou celui de la plateforme
  si vide), le quota mensuel (`monthlyQuota` ou le quota par défaut, §5) et
  la consommation du mois (agrégation `SmsMessage`). Rien n'est modifiable
  ici : pas de compte Orange à saisir, un seul compte plateforme.
  `GET /api/tenants/:tenantId/settings/sms`.
- **Onglet « SMS » de la fiche agence du super-admin**
  (`apps/web/.../TenantDetail.tsx`, nouvel onglet) : c'est là que tout se
  configure — activer/désactiver le SMS pour l'agence, nom d'expéditeur,
  quota mensuel (`GET`/`PATCH /api/admin/tenants/:tenantId/sms`), et un
  bouton « Envoyer un SMS de test » (champ numéro + message,
  `POST /api/admin/tenants/:tenantId/sms/test` — crée un `SmsMessage` avec
  `notificationKey=null` et `createdByUserId` = l'admin connecté, sur le
  modèle de `testSendHandler` WhatsApp,
  `whatsapp-notification-config-controller.ts` lignes 230-287). Une section
  « Compte Orange (plateforme) » du même onglet (ou un écran de config
  plateforme séparé) affiche le solde/les packs du compte unique
  (`GET /api/admin/sms/platform` — lit `contracts`, §3.2) et un bouton
  « Tester la connexion » (`POST /api/admin/sms/platform/test` — obtient un
  jeton et lit `contracts`, sans envoyer de SMS).

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
`SmsMessage` avec filtres statut/date/numéro (`to`), sur le modèle des User
Story 3 de `specs/010-communication-module/spec.md` (§42-56) : liste paginée,
statut par ligne, `errorMessage` visible au clic, action « Renvoyer » pour un
`FAILED` (limité par le taux 5/s, §3.5, lot SMS-2).

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
  fournisseur non configuré (`ORANGE_SMS_CLIENT_ID`/`SECRET` manquants côté
  plateforme, §6), nom d'expéditeur invalide (>11 caractères ou caractères
  interdits).
- `NotFoundError` : `SmsMessage` ou `TenantSmsSettings` inexistant ou d'une
  autre agence (isolation multi-tenant, `AGENTS.md`).
- `ConflictError` : webhook reçu pour un `SmsMessage` déjà `DELIVERED` avec un
  statut contraire incohérent (à ignorer plutôt qu'à écraser, cf. §3.9
  idempotence, lot SMS-3 — ce cas ne lève probablement pas d'erreur visible
  côté client, simplement un log).

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
  §13) — à lancer tôt, voir §11. Avec le compte plateforme unique (§4),
  « IMMOTOPIA » se valide une fois pour toute la plateforme ; chaque nom
  d'expéditeur supplémentaire demandé par une agence via « Multiple Sender
  Names » suit son propre délai de validation Orange/ARTCI, indépendamment
  des autres, mais reste sur ce même compte.

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
- **Isolation multi-tenant** : un test qui crée deux agences, chacune avec sa
  `TenantSmsSettings`, vérifie qu'un `SmsMessage` de l'agence A n'est ni
  lisible ni modifiable par un appel authentifié pour l'agence B
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
  et non une 500, qu'un `TenantSmsSettings` d'une autre agence référencé lève
  `NotFoundError`.

### 10.2 Découpage en lots de livraison

1. **Lot SMS-1 — Fondations et compte plateforme.** Correspond exactement à
   ce qui précède (§3–§9, moins ce qui est explicitement différé ci-dessous),
   plus la normalisation des numéros `+225` (§3.6), nécessaire à l'envoi de
   test : modèle Prisma (`TenantSmsSettings`, `SmsMessage` sans
   segments/encodage/coût), migration, `env.ts`/`env.example` (identifiants
   du compte plateforme unique, §6), interface `SmsProvider`,
   `OrangeSmsProvider` (jeton OAuth2 unique, envoi texte simple, lecture
   `contracts` pour `getBalance()`/`testConnection()`, sans file d'attente
   formelle — un envoi de test isolé n'a pas besoin de la file 5/s), carte
   agence en lecture seule et onglet SMS de la fiche agence super-admin
   (§7.1, activer/désactiver, nom d'expéditeur, quota, envoi de test). Pas
   encore branché aux déclencheurs métier automatiques.
2. **Lot SMS-2 — Envoi transactionnel et journal enrichi.** File d'attente
   5/s (§3.5), calcul et persistance des segments/encodage/coût estimé
   (§3.7, §3.8, colonnes ajoutées à `SmsMessage`), décompte du quota mensuel
   par agence, branchement sur 2-3 déclencheurs à fort impact
   (`INSTALLMENT_DUE_REMINDER`, `PAYMENT_APPROVED_TENANT`,
   `CHARGE_CALL_ISSUED`), historique en lecture seule (§7.3).
3. **Lot SMS-3 — Webhook, statuts, reste des déclencheurs.** Webhook Orange
   avec secret de chemin (accusés via `callbackData`, idempotence, §3.9),
   mise à jour de statut dans l'historique, extension aux déclencheurs
   restants (maintenance, patrimoine, reste du syndic), choix du canal SMS
   dans l'écran de règles de notification existant (§7.2).
4. **Lot SMS-4 — Conformité et deuxième fournisseur (optionnel).**
   Consentement SMS dédié si retenu (§9), heures d'envoi, gestion du STOP si
   le besoin promotionnel se confirme, fournisseur de secours
   (`SmsPartnerAfricaProvider`) derrière la même interface `SmsProvider`. Ne
   comporte plus d'option identifiants propres par agence : celle-ci est
   abandonnée (§4).

---

## 11. Démarches hors code à lancer tôt

- **Créer le compte Orange Developer de la plateforme** (SIM Orange dédiée,
  souscription à l'API SMS CI, accès sandbox puis production) — préalable à
  tout développement contre l'API réelle. C'est le seul compte Orange à
  ouvrir : la décision du §4 exclut désormais toute ouverture de compte par
  une agence.
- **Demander la validation du nom d'expéditeur « IMMOTOPIA »** auprès
  d'Orange : ~5 jours ouvrés, 11 caractères alphanumériques max, sans espace
  ni caractère spécial, sensible à la casse (ARTCI). C'est le nom par défaut
  de toutes les agences.
- **Déclarer l'URL de rappel des accusés** via le formulaire Orange Developer
  du compte plateforme (§3.9, lot SMS-3) — une seule fois, puisqu'un seul
  compte.
- **Lancer l'enregistrement MTN en parallèle**, dès que la couverture
  multi-opérateurs d'Orange SMS API CI est confirmée (§2) : ~15 jours ouvrés,
  pré-enregistrement obligatoire avant tout envoi vers des numéros MTN — une
  seule démarche pour toute la plateforme.
- **Se renseigner sur l'option Orange « Multiple Sender Names »** (délai et
  coût par nom supplémentaire) avant de la proposer aux agences qui
  voudraient leur propre nom d'expéditeur (`TenantSmsSettings.senderName`,
  §5) sur ce même compte plateforme.

---

## 12. Questions ouvertes

1. Orange confirme-t-il l'envoi effectif vers MTN et Moov via l'API SMS CI
   v2.0, ou seulement vers les numéros Orange ? Détermine si un deuxième
   fournisseur est nécessaire dès le lancement plutôt qu'en secours.
2. **Tarif/quota SMS par formule d'abonnement** (reste ouverte après la
   décision du §4) : `docs/PROPOSITION_MODELE_ECONOMIQUE_2026.md` a été
   consulté et ne mentionne le SMS dans aucune formule — le quota mensuel par
   agence (nombre de SMS inclus, comportement au dépassement : blocage ou
   facturation supplémentaire) reste à définir commercialement ; le lot
   SMS-1 démarre avec un quota par défaut provisoire
   (`SMS_DEFAULT_MONTHLY_QUOTA=100`, §6).
3. Un `consentSms` dédié sur `CrmContact`, ou réutilisation de
   `consentMarketing` pour le SMS promotionnel (§9) ?
4. Le besoin OTP par SMS (connexion, vérification de numéro) existe-t-il
   réellement à court terme ? Il mériterait son propre lot.
5. Qui gère le mot-clé STOP entrant : la plateforme Orange nativement, ou
   ImmoTopia doit-il recevoir et traiter des SMS entrants (non couvert ici) ?
6. La configuration SMS par notification (§3.3) : nouveau modèle Prisma
   dédié, ou extension du modèle de configuration WhatsApp existant (non lu
   en détail) pour porter plusieurs canaux ?
7. Le champ `callbackData` (§3.9) est-il bien accepté dans le corps de la
   requête d'envoi `smsmessaging/v1/outbound/.../requests` ? Non confirmé
   dans la documentation lue — à valider à l'essai avant le lot SMS-3, faute
   de quoi la corrélation des accusés repose uniquement sur `resourceURL`.
8. Faut-il une vraie colonne téléphone (et un consentement SMS dédié) sur
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
