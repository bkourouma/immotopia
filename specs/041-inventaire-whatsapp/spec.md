# Spécification 041 — Inventaire de chantier par WhatsApp et IA

> **Branche** : `feat/inventaire-whatsapp`, empilée sur `feat/controle-stock`
> (lot 040) · **Créée** : 04/10/2026 · **Statut** : révision 1, prête pour la critique
> **Documents liés** : [data-model.md](data-model.md) (schéma, migrations,
> purges), [contracts/openapi.yaml](contracts/openapi.yaml) (routes),
> [ecrans.md](ecrans.md) (écrans), [plan.md](plan.md) (territoires des agents,
> recette).
> **Entrées** : PRD du fondateur (inventaire par photo WhatsApp, IA Gemini
> Flash), décisions W-D1 à W-D7 du fondateur (04/10/2026), décisions techniques
> T1 à T16 du Pilote, lot 040 (`specs/040-controle-stock/`).
> **Base vérifiée** : worktree `inventaire-whatsapp`, HEAD `c03d75f2`
> (`origin/main` + spécification 040, **sans le code du lot 040**). Les chemins
> sont relatifs à `packages/api/` sauf mention contraire. Les fonctions du lot
> 040 citées (`setStockCountLineTx`…) sont celles que fige
> `specs/040-controle-stock/plan.md` §11 ; elles n'existent pas encore dans le
> code de cette base.

## 1. Objectif

Le chef de chantier compte son stock là où il est : il photographie une pile de
sacs, un fagot de fers ou une palette de parpaings, et l'envoie au numéro
WhatsApp officiel d'ImmoTopia. L'IA reconnaît l'article parmi ceux de son
entreprise, compte, et propose un total. Le chef valide d'un chiffre, ou donne le
bon nombre. Chaque comptage validé devient une **ligne d'un inventaire ordinaire
du lot 040**, avec la photo et son empreinte comme preuve.

Ce lot **n'ajoute aucune règle de stock**. Il ajoute un canal de saisie des
comptages. Le stock théorique n'est corrigé qu'au bureau, à la validation de
l'inventaire, par une autre personne que le compteur (A1 du lot 040). Le bot ne
dit jamais ce que le système attend.

Cibles du PRD (mesurées, pas garanties, §6 W14) : moins de 45 secondes par
référence ; au moins 88 % de comptages justes au premier jet ; 100 % des lignes
saisies par WhatsApp avec une photo de preuve.

## 2. Décisions et leur traduction

| Décision   | Contenu                                                                                                     | Traduction dans ce lot                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **W-D1**   | Un comptage WhatsApp alimente un `StockCount` ordinaire ; le stock n'est corrigé qu'à la validation.        | W5 : le bot écrit seulement par `createStockCountTx`, `setStockCountLineTx`, `closeStockCountTx` (plan 040 §11). Aucun mouvement, aucun ajustement, aucune validation depuis WhatsApp. Le chef n'a pas `STOCK_COUNT_VALIDATE` (W2). |
| **W-D2**   | Aveugle strict ; pas de motif demandé ; l'état « ATTENTE_MOTIF » du PRD disparaît.                          | §8.3 : aucune réponse du bot ne contient l'attendu, l'écart, une valeur ou un coût. L'IA ne reçoit jamais l'attendu (W8-R4). La justification reste celle du lot 040 (A2-R5), au bureau.                                            |
| **W-D3**   | Vocabulaire D2 du lot 040.                                                                                  | Mots interdits du lot 040 (spec 040 §4) dans tout message du bot, libellé, alerte, prompt de l'IA ; test de vocabulaire étendu aux fichiers du lot (§11).                                                                           |
| **W-D4**   | Meta WhatsApp Cloud API, un numéro unique pour la plateforme ; WaSender exclu en réception ; pas Twilio.    | W6 : webhook signé `X-Hub-Signature-256` toujours vérifié. Le webhook existant (`src/routes/whatsapp.webhook.route.ts`) n'est ni réutilisé ni modifié.                                                                              |
| **W-D5**   | Seuls les titulaires du rôle « Chef de chantier » s'inscrivent.                                             | W2 (rôle `TENANT_SITE_MANAGER`), W3-R2.                                                                                                                                                                                             |
| **W-D6**   | Option payante `EXT_INVENTAIRE_WHATSAPP`, 25 000 FCFA HT / mois / bloc de 500 photos, Promoteur et Intégré. | W11 : ligne de catalogue, capacité `PHOTOS_INVENTAIRE`, quota mensuel. Prix modifiable par le super-admin (catalogue en base, `src/lib/subscription/catalog.ts:5-9`).                                                               |
| **W-D7**   | PR empilée sur `feat/controle-stock`.                                                                       | plan.md §1.                                                                                                                                                                                                                         |
| **T1–T16** | Décisions techniques du Pilote.                                                                             | Exigences W1 à W14. Trois précisions et trois écarts motivés : §13.                                                                                                                                                                 |

## 3. Périmètre

### 3.1 Dans le périmètre

- Passerelle Meta WhatsApp Cloud API en entrée (webhook) et en sortie (réponses
  dans la fenêtre de service), transport de journal (`log`) et simulateur.
- Inscription d'un chef de chantier, activation par code, révocation.
- Conversation du bot : choix du chantier, analyse de la photo, confirmation,
  article non reconnu, commandes `FIN`, `AIDE`, `CHANTIER`, relance, expiration.
- Analyse d'image par un fournisseur de vision (Gemini direct, OpenRouter, faux
  fournisseur de recette).
- Écriture dans l'inventaire du lot 040, clôture du comptage, alerte
  `FIELD_COUNT_CLOSED`.
- Option payante et quota mensuel de photos analysées.
- Écrans : onglet « WhatsApp » (inscriptions, quota, passerelle, simulateur),
  écran « Comptages terrain », visualiseur de preuve, badge sur l'inventaire.
- Journal des conversations, journal des événements du webhook, purges.

### 3.2 Hors périmètre

Message initié par l'entreprise (modèles Meta : alerte WhatsApp au directeur,
rappel de comptage planifié) ; WaSender et Twilio ; SMS ; création d'un article
depuis WhatsApp ; réception, sortie, transfert ou rebut par WhatsApp ; comptage
d'un magasin (`WAREHOUSE`) par WhatsApp ; stock nul déclaré par WhatsApp (il se
compte au bureau, dans le web) ; audio, vidéo, localisation, documents non image ;
compression d'image côté serveur (T15) ; stockage objet S3/R2 (T15) ;
vérification de l'identité de la personne qui tient le téléphone ; inscription
d'un même numéro dans deux agences (§14 Q3).

### 3.3 Limites assumées

| Limite                                                                                                                                                                                  | Pourquoi                                                                                                                                                              | Conséquence                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Décision du Pilote (04/10, aveugle strict W-D2) : le chef ne détient **pas** `STOCK_VIEW`, seulement `STOCK_COUNT`. Il ne lit aucun solde dans le web, ni avant ni pendant un comptage. | Le magasinier du lot 040 garde `STOCK_VIEW` (l'aveugle y couvre l'inventaire `DRAFT`, pas l'avant) ; le chef de chantier, qui compte par WhatsApp, n'en a pas besoin. | Le chef n'a aucun écran du stock dans le web ; un stock nul ou une panne se signalent au bureau (M07, M22, M26).                        |
| Une photo prouve qu'une image a été reçue à une heure serveur, pas où ni par qui elle a été prise.                                                                                      | Pas de géolocalisation (D4 du lot 040) ; l'EXIF est retiré.                                                                                                           | On dit « empreinte enregistrée, modification détectable », jamais « infalsifiable ».                                                    |
| L'IA se trompe. Une pile cachée derrière une autre n'est pas comptée.                                                                                                                   | Limite de la vision.                                                                                                                                                  | Le total est une **proposition** ; le chef le valide ou le corrige ; le mode (`ACCEPTED` / `CORRECTED`) est enregistré et mesuré (W14). |
| Un inventaire `REGULAR` clos par le chef crée une ligne « non comptée » pour chaque article de solde non nul qu'il n'a pas photographié (A2-R8 du lot 040).                             | Règle du lot 040, inchangée.                                                                                                                                          | Le validateur les écarte en une fois (`set-aside-uncounted`) ; l'écran Comptages terrain le rappelle (ecrans.md §3).                    |
| Un traitement interrompu (arrêt de l'API entre la réception et la réponse) reprend au passage suivant de la tâche, pas instantanément.                                                  | Réponse 200 immédiate à Meta (T7) ; Meta ne renvoie pas un événement acquitté.                                                                                        | L'événement est écrit en base **avant** la réponse 200 et repris par la tâche planifiée (W6-R7).                                        |

## 4. Vocabulaire

| Terme                 | Sens                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chef de chantier**  | Membre `ACTIVE` d'une agence titulaire du rôle `TENANT_SITE_MANAGER` (W2).                                                                     |
| **Inscription**       | Lien entre un chef, un numéro E.164 et un ou plusieurs chantiers (`StockWhatsappRegistration`). En attente d'activation, active ou révoquée.   |
| **Code d'activation** | Six chiffres affichés à l'administrateur, envoyés par le chef au bot depuis son WhatsApp. Prouve qu'il détient le numéro et vaut consentement. |
| **Session**           | Échange en cours entre le bot et un chef inscrit (`StockWhatsappSession`), fermé après 30 minutes sans message du chef.                        |
| **Capture**           | Une photo reçue, son analyse, et ce que le chef en a fait (`StockFieldCapture`).                                                               |
| **Proposition**       | Total proposé par l'IA pour une capture, en attente de la réponse du chef.                                                                     |
| **Comptage terrain**  | Ligne d'inventaire saisie par WhatsApp (elle porte une capture).                                                                               |
| **Passerelle**        | Le transport des messages : `meta` (production), `log` (développement, staging, tests), `disabled`.                                            |
| **Simulateur**        | Écran et route qui injectent des messages entrants au nom d'un chef, sans Meta (W13).                                                          |
| **Photo analysée**    | Photo pour laquelle le fournisseur de vision a rendu une réponse valide. C'est l'unité du quota.                                               |

Mots interdits : ceux du lot 040 (spec 040 §4), dans les trois langues.

## 5. État vérifié de l'existant

| Sujet                        | Constat                                                                                                                                                                                                                                                          | Preuve                                                                                                                                                                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parseurs globaux             | `express.json` (10 Mo) et `express.urlencoded` sont globaux ; le corps brut est perdu. Seuls les préfixes de `PUBLIC_TOKEN_PREFIXES` y échappent, testés par `req.path.startsWith(prefix + '/')`.                                                                | `src/app.ts:129-136`                                                                                                                                                                                                                                                                         |
| Montage des webhooks         | Le webhook WhatsApp actuel est monté sur `/api` avant les routeurs authentifiés.                                                                                                                                                                                 | `src/app.ts:219-224`                                                                                                                                                                                                                                                                         |
| Routeur WhatsApp actuel      | Monté sur `/api`, il pose `router.use(express.urlencoded(...))` pour toute requête `/api/*` qui le traverse. La signature Twilio est **contournée hors production** ; WaSender n'est pas signé du tout. Il lit `process.env.TWILIO_AUTH_TOKEN` hors de `env.ts`. | `src/routes/whatsapp.webhook.route.ts:11-16, 27-63`                                                                                                                                                                                                                                          |
| Fournisseurs WhatsApp        | WaSender et Twilio seulement, aucune trace de l'API Graph de Meta.                                                                                                                                                                                               | `src/services/providers/whatsapp.provider.ts:29, 64-70`                                                                                                                                                                                                                                      |
| Normalisation de téléphone   | Quatre copies de `normalizePhone` à indicatif **33** par défaut. Les indicatifs UEMOA (225 pour la Côte d'Ivoire) existent dans l'espace personnel.                                                                                                              | `src/controllers/whatsapp-notification-config-controller.ts:135`, `src/services/newsletter-campaign.service.ts:36`, `src/services/whatsapp-group-automation-service.ts:227`, `src/services/whatsapp-notification-send-service.ts:46` ; `src/services/personal-space/schemas.ts:10-19, 30-40` |
| Comparaison à temps constant | `hashesMatch` (deux empreintes hexadécimales, `timingSafeEqual`) et `hashToken` (SHA-256).                                                                                                                                                                       | `src/lib/secure-links/token.ts:16-26`                                                                                                                                                                                                                                                        |
| Limiteur de webhook          | 120 requêtes par minute et par IP ; plancher global 1 000 / 15 min.                                                                                                                                                                                              | `src/middleware/rate-limit-middleware.ts:127-136, 205-216`                                                                                                                                                                                                                                   |
| Fichiers servis en statique  | Liste blanche : `whatsapp/**` est **public** (diffusions lues par le fournisseur) ; tout autre dossier répond 404.                                                                                                                                               | `src/middleware/uploads-access-middleware.ts:39-63, 80-86`                                                                                                                                                                                                                                   |
| Fichiers privés              | `privateUploadPath`, `readPrivateUpload`, `sendPrivateFile` relisent un fichier après contrôle de l'objet.                                                                                                                                                       | `src/lib/files/private-files.ts:53-60, 75-99, 102-108`                                                                                                                                                                                                                                       |
| Contexte d'agence            | `runWithTenantContext` pose l'agence ambiante et l'acteur d'audit (sans effet hors requête).                                                                                                                                                                     | `src/utils/tenant-context.ts:24-28` ; `src/utils/request-context.ts:35-50`                                                                                                                                                                                                                   |
| Droits                       | `hasPermission` lit le cache de permissions, sans vérifier l'adhésion `ACTIVE` ni l'agence suspendue ; `requireTenantAccess` les vérifie.                                                                                                                        | `src/services/permission-service.ts:112-115` ; `src/middleware/tenant-middleware.ts:114-135`                                                                                                                                                                                                 |
| Comptes                      | `User` n'a pas de téléphone ; il a `preferredLanguage` (nul = jamais choisi) et `isActive`.                                                                                                                                                                      | `prisma/schema.prisma:451-468`                                                                                                                                                                                                                                                               |
| Adhésion                     | `Membership` (`PENDING_INVITE`, `ACTIVE`, `DISABLED`), unique par (utilisateur, agence).                                                                                                                                                                         | `prisma/schema.prisma:45-49, 904-922`                                                                                                                                                                                                                                                        |
| Chantier                     | Un seul responsable (`managerId`), un statut (`PLANNED`, `IN_PROGRESS`, `SUSPENDED`, `CLOSED`), `stockEnabledAt`. Aucun lien vers plusieurs personnes.                                                                                                           | `prisma/schema.prisma:6291-6296, 6298-6354`                                                                                                                                                                                                                                                  |
| Lieu de chantier             | Un seul `StockLocation` par chantier (`siteId` unique), `kind = SITE`.                                                                                                                                                                                           | `prisma/schema.prisma:7520-7530, 7617-7640`                                                                                                                                                                                                                                                  |
| Ligne d'inventaire           | Unique par (inventaire, article) : une seconde saisie du même article **remplace** la première.                                                                                                                                                                  | `prisma/schema.prisma:7775-7797` (`@@unique([countId, itemId])`)                                                                                                                                                                                                                             |
| Vision                       | ImmoCopilot : fournisseurs `disabled`, `fake`, `anthropic`, `openrouter`, texte seul (aucune image). `OPENROUTER_API_KEY` et `OPENROUTER_BASE_URL` existent.                                                                                                     | `src/lib/ai/providers/` ; `src/config/env.ts:162-174`                                                                                                                                                                                                                                        |
| Faux fournisseur             | `fake` n'est accepté que si `NODE_ENV` vaut `development` ou `test`.                                                                                                                                                                                             | `src/config/env.ts:32-34, 221-230`                                                                                                                                                                                                                                                           |
| Staging                      | Le staging tourne en `NODE_ENV=production` (contrôlé au déploiement).                                                                                                                                                                                            | `infra/scripts/deploy.sh:241-242`                                                                                                                                                                                                                                                            |
| Simulateur de paiement       | Précédent : disponible hors production, en production seulement avec `PAYMENT_GATEWAY_SIMULATOR=1`, refusé par `deploy.sh` sur la production.                                                                                                                    | `src/config/env.ts:307` ; `infra/scripts/deploy.sh:279-282`                                                                                                                                                                                                                                  |
| Catalogue des offres         | Extensions `EXT_LOTS_10`, `EXT_COPRO`, `EXT_CHANTIER`, `EXT_BIENS_10` ; règles `byHeldPacks`, `requiresAnyOf` ; capacités par unité ; catalogue édité en base par le super-admin.                                                                                | `src/lib/subscription/catalog.ts:19, 28-34, 50-55, 85-111, 284-299`                                                                                                                                                                                                                          |
| Capacités                    | `CAPACITY_KEYS` est parcouru par le calcul des plafonds, les relevés, les alertes de quota et la facture de dépassement ; une capacité sans extension dans `extensionCodes` n'est jamais facturée en dépassement.                                                | `src/lib/subscription/entitlements.ts:158-183, 473-481` ; `src/jobs/subscription-usage-job.ts:63-75, 313, 369` ; `src/services/subscription-v2-service.ts:1518-1544`                                                                                                                         |
| Consommation                 | `usageProviders` (un compteur par capacité) et `registerUsageProvider`.                                                                                                                                                                                          | `src/services/subscription-v2-service.ts:231-266`                                                                                                                                                                                                                                            |
| Droits d'abonnement          | `getEntitlements` (cache 30 s) ; `evaluateFeatureAccess` ; `denialFor` n'est pas exporté.                                                                                                                                                                        | `src/services/subscription-v2-service.ts:337-360` ; `src/lib/subscription/feature-access.ts:28-48` ; `src/lib/subscription/notification-feature-gate.ts:21-37`                                                                                                                               |
| Stock et abonnement          | `/finance/stock` est classé `CONSTRUCTION`.                                                                                                                                                                                                                      | `src/lib/subscription/route-features.ts:162`                                                                                                                                                                                                                                                 |
| Tâches planifiées            | Lecture transverse hors contexte, puis traitement par agence dans `runWithTenantContext` ; démarrage dans `index.ts` hors test.                                                                                                                                  | `src/jobs/newsletter-campaign-scheduler.job.ts:14-60` ; `src/index.ts:46-79`                                                                                                                                                                                                                 |
| Langue                       | `runWithLanguage`, `t()` (texte français = clé).                                                                                                                                                                                                                 | `src/i18n/index.ts:36, 78`                                                                                                                                                                                                                                                                   |
| Libellés de rôle             | `TENANT_ROLE_LABELS_FR` (quatre rôles).                                                                                                                                                                                                                          | `src/services/invitation-service.ts:26-31`                                                                                                                                                                                                                                                   |
| Seeds RBAC                   | Ordre d'appel des seeds de permissions avant le super-admin.                                                                                                                                                                                                     | `prisma/seeds/rbac-seed.ts:121-134`                                                                                                                                                                                                                                                          |
| Journal des requêtes         | Écrit `req.url`, chaîne de requête comprise.                                                                                                                                                                                                                     | `src/middleware/logging-middleware.ts:14, 24`                                                                                                                                                                                                                                                |
| Catalogue de l'assistant     | Toute route dont le chemin contient `webhook` est exclue ; un segment `whatsapp` rend une écriture « sensible ».                                                                                                                                                 | `src/lib/ai/gateway/catalog-builder.ts:57-62` ; `src/lib/ai/gateway/path-rules.ts:16-17, 66-73`                                                                                                                                                                                              |
| Routes publiques             | Liste blanche commentée, dont `POST /api/whatsapp/webhook`.                                                                                                                                                                                                      | `__tests__/unit/routes-inventory.test.ts:58-84`                                                                                                                                                                                                                                              |
| Routes hors abonnement       | Familles hors `/api/tenants` déclarées, dont `/api/whatsapp`.                                                                                                                                                                                                    | `__tests__/unit/route-features.test.ts:11, 47`                                                                                                                                                                                                                                               |
| Modèles globaux              | Liste `GLOBAL_MODELS` commentée (ex. `SignupAttempt`, compteur par IP hachée).                                                                                                                                                                                   | `__tests__/unit/schema-tenant-coverage.test.ts:61-99`                                                                                                                                                                                                                                        |
| Export d'agence              | `UPLOAD_FOLDER_RULES` ; `EXCLUDED_MODELS` ; champs dont le nom contient `hash` retirés.                                                                                                                                                                          | `src/services/tenant-data-export/file-references.ts:79-90` ; `src/services/tenant-data-export/model-registry.ts:62` ; `src/services/tenant-data-export/sensitive-fields.ts:16-17`                                                                                                            |

## 6. Exigences

Chaque critère d'acceptation est rédigé pour devenir un test. « Le bot répond
Mxx » renvoie aux textes exacts du §10. Sauf mention, « refusé » signifie : rien
n'est écrit dans le stock ni dans l'inventaire, aucun quota n'est consommé.

### W1 — Passerelle et transport

**Règles**

- **W1-R1.** `WHATSAPP_INVENTORY_TRANSPORT` vaut `disabled` (défaut), `log` ou
  `meta` (`src/config/env.ts`, `superRefine`). `meta` exige
  `META_WA_APP_SECRET`, `META_WA_VERIFY_TOKEN` (32 caractères au moins),
  `META_WA_ACCESS_TOKEN`, `META_WA_PHONE_NUMBER_ID` (data-model §7).
- **W1-R2.** Interface unique `WhatsappTransport` (plan §3.3) : `send`,
  `markRead`, `fetchMedia`. `meta` appelle l'API Graph ; `log` n'envoie rien,
  écrit chaque message sortant dans `StockWhatsappMessage` et rend les médias
  déposés par le simulateur ; `disabled` refuse tout.
- **W1-R3.** `log` en `NODE_ENV=production` n'est accepté qu'avec
  `WHATSAPP_INVENTORY_SIMULATOR=1` (écart E1, §13) ; `deploy.sh` refuse cette
  variable sur la production comme `PAYMENT_GATEWAY_SIMULATOR`.
- **W1-R4. Envoi Meta.** `POST {META_WA_GRAPH_BASE_URL}/{META_WA_GRAPH_VERSION}/{META_WA_PHONE_NUMBER_ID}/messages`,
  `Authorization: Bearer <META_WA_ACCESS_TOKEN>`, corps
  `messaging_product: "whatsapp"`, `to` = numéro sans `+`, `type` `text` ou
  `interactive` ([doc Meta, boutons](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages),
  [listes](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-list-messages)).
  Bornes appliquées **avant** l'envoi par le constructeur de messages : 3
  boutons au plus, titre de bouton 20 caractères, corps 1 024 ; liste : 10
  lignes au total, titre de ligne 24, description 72, texte du bouton 20. Un
  libellé plus long est tronqué avec « … », jamais refusé par Meta.
- **W1-R5. Accusé de lecture.** Chaque message entrant traité reçoit
  `{"messaging_product":"whatsapp","status":"read","message_id":…}` sur la même
  route ([doc Meta](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/mark-message-as-read)).
  Un échec d'accusé est journalisé, jamais bloquant.
- **W1-R6. Fenêtre de service.** Le bot ne répond qu'à un chef qui lui a écrit
  dans les 24 heures (relance et message d'expiration compris : tous partent
  moins de 31 minutes après le dernier message du chef). Aucun modèle Meta
  n'est utilisé. Les messages hors modèle dans la fenêtre sont gratuits depuis
  le 1er juillet 2025 ([tarification Meta](https://developers.facebook.com/docs/whatsapp/pricing)).
- **W1-R7. Échec d'envoi.** Un envoi Meta en échec (réseau, `4xx`, `5xx`) est
  réessayé une fois après 2 s, puis journalisé (`StockWhatsappMessage.sendError`)
  ; l'état de la session n'est pas défait (l'écriture d'inventaire a eu lieu).

**Critères d'acceptation**

1. `WHATSAPP_INVENTORY_TRANSPORT=meta` sans `META_WA_APP_SECRET` : l'API refuse
   de démarrer avec le nom de la variable.
2. `WHATSAPP_INVENTORY_TRANSPORT=log`, `NODE_ENV=production`, sans
   `WHATSAPP_INVENTORY_SIMULATOR=1` : refus de démarrer.
3. Une liste de 14 articles candidats produit un message `list` de 10 lignes au
   plus ; un titre de 30 caractères sort en 24 caractères terminés par « … ».
4. En `log`, une réponse du bot crée une ligne `OUTBOUND` et aucun appel réseau
   (le client HTTP simulé n'est jamais appelé).

### W2 — Rôle « Chef de chantier »

**Règles**

- **W2-R1.** Rôle global `TENANT_SITE_MANAGER`, portée `TENANT`, nom
  `Tenant Site Manager`, description « Chef de chantier : compte le stock de
  ses chantiers, notamment par WhatsApp, sans valider ni accéder aux valeurs ».
  Permissions : `STOCK_COUNT` seulement (lot 040, B1-R1). Pas `STOCK_VIEW` :
  à l'aveugle strict (W-D2), le chef ne doit lire aucun solde, même hors
  comptage ; il n'utilise pas les écrans du stock. Une agence qui veut lui
  ouvrir le web lui attribue en plus un rôle qui porte `STOCK_VIEW`.
- **W2-R2.** Libellé « Chef de chantier » dans `TENANT_ROLE_LABELS_FR`
  (`src/services/invitation-service.ts:26-31`) et dans les libellés web.
- **W2-R3.** Créé par le seed et par une migration de données idempotente
  (data-model §5, modèle `prisma/migrations/20261006130000_syndic_permissions`).
- **W2-R4.** Il s'attribue par l'écran des membres existant (portée `TENANT`).
  Les menus hors « Chantiers et stock » se coupent pour ce rôle par la
  plateforme (« Rôles et menus »), une fois, au déploiement (même mécanique
  que le Magasinier, ecrans 040 §2.3).

**Critères d'acceptation**

1. Après migration, le rôle `TENANT_SITE_MANAGER` existe avec exactement
   `STOCK_COUNT` ; relancer la migration ne crée aucun doublon.
2. Un chef reçoit `403` sur `POST /stock/counts/{id}/validate` et sur
   `GET /stock/alerts`.

### W3 — Inscription d'un chef

**Règles**

- **W3-R1. Qui inscrit.** Un détenteur de `FINANCE_SETTINGS_MANAGE`, par
  `POST /finance/stock/whatsapp/registrations` (route sous `requireTenantAccess`).
- **W3-R2. Qui est inscrit.** Un membre de l'agence : `Membership.status =
ACTIVE`, `User.isActive = true`, un `UserRole` de cette agence sur le rôle
  `TENANT_SITE_MANAGER` — lus **en base**, jamais dans le cache des
  permissions. Sinon `409 STOCK_WHATSAPP_MEMBER_NOT_ELIGIBLE`. Un identifiant
  d'utilisateur d'une autre agence lève la même erreur qu'un membre inéligible
  (pas de distinction observable).
- **W3-R3. Numéro.** Une seule fonction, `normalizePhoneE164(raw,
defaultDialCode = '225')` (`src/lib/phone/e164.ts`, nouveau) : retire
  espaces, points, tirets et parenthèses ; `00` initial → `+` ; sans `+`,
  préfixe l'indicatif par défaut ; exige `+` puis 8 à 15 chiffres. Les
  indicatifs UEMOA viennent de `UEMOA_COUNTRY_DIAL_CODES`
  (`src/services/personal-space/schemas.ts:10-19`). Un numéro invalide :
  `400 STOCK_WHATSAPP_PHONE_INVALID`. Les quatre `normalizePhone` à indicatif 33
  ne sont ni utilisés ni modifiés.
- **W3-R4. Unicité.** Un numéro n'a qu'une inscription non révoquée **sur toute
  la plateforme** (index unique partiel, data-model §5.2). Un numéro déjà
  inscrit, dans cette agence ou une autre, donne `409
STOCK_WHATSAPP_PHONE_UNAVAILABLE` avec le même message (« Ce numéro ne peut
  pas être inscrit. ») : la réponse ne dit jamais qu'une autre agence l'utilise.
  Un membre n'a qu'une inscription non révoquée dans l'agence (`409
STOCK_WHATSAPP_MEMBER_ALREADY_REGISTERED`).
- **W3-R5. Chantiers affectés.** 1 à 10 chantiers (borne de la liste Meta,
  W1-R4) de l'agence, chacun **ouvert** (`status ≠ CLOSED`), **basculé au
  stock** (`stockEnabledAt` non nul) et dont le lieu (`StockLocation.kind =
SITE`) est actif. Chaque identifiant passe par `assertBelongsToTenant`
  (`src/utils/tenant-ownership.ts:64`) ; une référence d'une autre agence lève
  la même `NotFoundError` qu'un chantier inexistant. Un chantier non éligible :
  `409 STOCK_WHATSAPP_SITE_NOT_ELIGIBLE`, `data.siteIds`. Modifiables par
  `PATCH …/registrations/{id}`.
- **W3-R6. Code d'activation.** Six chiffres tirés par `crypto.randomInt`, rendus
  **une seule fois** dans la réponse de création (et de régénération). Stocké
  sous forme d'empreinte : `hashToken(code + ':' + registrationId)`
  (`src/lib/secure-links/token.ts:16-18`). Valable 72 heures, 5 essais. Comparé
  par `hashesMatch` (`:21-26`). `POST …/registrations/{id}/regenerate-code`
  remet le compteur d'essais à zéro et invalide l'ancien code.
- **W3-R7. Activation.** Le chef envoie au numéro officiel un message texte
  dont les seuls chiffres forment le code (« 482 913 », « Code 482913 »
  acceptés). L'expéditeur (`messages[].from`, normalisé) doit être le numéro de
  l'inscription en attente. Succès : statut `ACTIVE`, `activatedAt`, empreinte
  effacée, audit `STOCK_WHATSAPP_REGISTRATION_ACTIVATED`, le bot répond M02.
  Échec : `activationAttempts + 1`, M03 ; au 5e échec ou après 72 h, M04 et
  audit `STOCK_WHATSAPP_ACTIVATION_LOCKED` (sécurité).
- **W3-R8. Consentement.** L'envoi du code par le chef vaut consentement à
  recevoir les réponses du bot. Aucun message n'est envoyé à un numéro qui n'a
  pas écrit le premier (W1-R6).
- **W3-R9. Révocation.** `POST …/registrations/{id}/revoke` (motif facultatif,
  500 caractères) : statut `REVOKED`, session ouverte fermée (`REVOKED`),
  proposition en attente abandonnée (`EXPIRED`), aucun message envoyé au chef.
  Le numéro redevient inscriptible.
- **W3-R10. Contrôle à chaque message.** Pour tout message d'un numéro inscrit,
  le moteur relit **en base**, dans cet ordre, et refuse au premier échec
  (W12) : agence non suspendue (`Tenant.status ≠ SUSPENDED`) ; adhésion
  `ACTIVE` ; `User.isActive` ; rôle `TENANT_SITE_MANAGER` détenu dans l'agence
  et portant `STOCK_COUNT` (`RolePermission`) ; inscription `ACTIVE` ; droits
  d'abonnement (W11-R4).

**Critères d'acceptation**

1. Awa détient le rôle Chef de chantier ; l'administrateur l'inscrit au
   `07 12 34 56 78` : le numéro stocké est `+2250712345678`, la réponse porte un
   code de 6 chiffres, la base ne contient pas ce code en clair.
2. Le même numéro, inscrit dans l'agence B : `409 STOCK_WHATSAPP_PHONE_UNAVAILABLE`,
   message identique à celui d'un doublon dans l'agence A.
3. Moussa est `TENANT_AGENT` : `409 STOCK_WHATSAPP_MEMBER_NOT_ELIGIBLE`.
4. Un chantier `CLOSED` ou non basculé : `409 STOCK_WHATSAPP_SITE_NOT_ELIGIBLE`
   avec son identifiant ; un chantier d'une autre agence : `404`.
5. Le chef envoie un mauvais code 5 fois : M03 quatre fois (essais restants 4,
   3, 2, 1), M04 à la cinquième ; le bon code ensuite : M04, inscription
   toujours en attente.
6. Un message qui porte le bon code depuis un autre numéro : M01, l'inscription
   reste en attente.
7. Après révocation, le chef envoie une photo : M06 ; aucune capture créée.
8. L'administrateur retire le rôle Chef de chantier à Awa : le message suivant
   d'Awa reçoit M06, sans attendre l'expiration du cache des permissions.

### W4 — Session et machine à états

**Règles**

- **W4-R1.** Au plus une session ouverte par inscription (`closedAt` nul ; index
  unique partiel). Une session s'ouvre au premier message d'un chef actif sans
  session ouverte.
- **W4-R2. États** : `AWAITING_SITE`, `ANALYZING`, `AWAITING_ITEM`,
  `AWAITING_CONFIRMATION`, `AWAITING_MERGE` (écart E3, §13), `READY`, `CLOSED`.
  Transitions : table du §7.
- **W4-R3. Choix du chantier.** Un seul chantier éligible : associé d'office,
  le bot l'annonce dans sa réponse. Plusieurs : boutons (2 ou 3 chantiers) ou
  liste (4 à 10) ; état `AWAITING_SITE`. Aucun : M09, session fermée. Une
  photo reçue avant le choix est **gardée** (capture `RECEIVED`) et analysée
  dès le choix fait.
- **W4-R4. Une photo à la fois.** Le passage `READY → ANALYZING` (ou
  `AWAITING_SITE → ANALYZING`) est une mise à jour conditionnelle
  (`UPDATE … WHERE state = <attendu>`). Une photo reçue pendant `ANALYZING` :
  M12 ; pendant `AWAITING_ITEM`, `AWAITING_CONFIRMATION` ou `AWAITING_MERGE` :
  M12b. Dans les deux cas, la photo n'est ni téléchargée ni stockée, aucun quota
  n'est consommé, et le message entrant est journalisé.
- **W4-R5. Inactivité.** `lastInboundAt` est mis à jour à chaque message du chef.
  À 10 minutes sans message, si l'état est `AWAITING_SITE`, `AWAITING_ITEM`,
  `AWAITING_CONFIRMATION` ou `AWAITING_MERGE` et qu'aucune relance n'a été
  envoyée depuis le dernier message : relance M23, une seule
  (`reminderSentAt`). À 30 minutes : fermeture (`TIMEOUT`) — proposition en
  attente abandonnée (capture `EXPIRED`, rien n'est écrit) ; inventaire clos si
  W5-R5 le permet ; message M24.
- **W4-R6. Commandes** (texte seul, insensible à la casse, aux accents et aux
  espaces autour ; équivalents anglais acceptés) : `FIN` / `END`, `AIDE` /
  `HELP`, `CHANTIER` / `SITE`. Reconnues dans tous les états ouverts.
  `CHANTIER` applique à l'inventaire du chantier courant la règle de `FIN`
  (W5-R5), abandonne la proposition en attente, puis repropose le choix.
- **W4-R7. Réponses à une proposition.** `1` ou bouton « Valider » : total
  proposé (`ACCEPTED`). Un nombre strictement positif (virgule ou point
  décimal, 4 décimales au plus, 1 000 000 au plus, unité facultative après le
  nombre : « 84 », « 84,5 », « 84 sacs ») : quantité corrigée (`CORRECTED`).
  `0` ou bouton « Annuler » : `CANCELLED`. Toute autre réponse : M17, l'état ne
  change pas. Un stock nul ne se déclare pas par WhatsApp : il se signale au bureau ; `AIDE` le dit.
- **W4-R8. Messages non pris en charge** (audio, vidéo, autocollant,
  localisation, contact, réaction, document non image) : M28, aucun changement
  d'état. Un document dont le type déclaré est `image/jpeg`, `image/png` ou
  `image/webp` est traité comme une photo.
- **W4-R9. Ordre.** Les messages d'un même chef sont traités un par un, dans
  l'ordre de réception par le serveur (verrou consultatif de transaction
  `stock-whatsapp-registration:<registrationId>` pris pour chaque transition
  d'état ; aucun verrou n'est tenu pendant l'appel à l'IA).

**Critères d'acceptation**

1. Un chef affecté à un seul chantier envoie une photo : la session passe par
   `ANALYZING` puis `AWAITING_CONFIRMATION` sans question de chantier.
2. Affecté à trois chantiers : un message à 3 boutons ; à cinq : une liste de 5
   lignes. Après le choix, la photo envoyée avant est analysée.
3. Deux photos arrivent à 1 seconde d'intervalle : la première est analysée, la
   seconde reçoit M12, une seule capture existe, le compteur du mois a augmenté
   de 1.
4. Une proposition reste sans réponse 10 minutes : M23 une fois ; 30 minutes :
   capture `EXPIRED`, aucune ligne d'inventaire nouvelle, M24.
5. « fin », « Fin » et « FIN » ferment la session.
6. « 84 sacs » répond à une proposition de 90 : ligne à 84, capture `CORRECTED`.
7. « 0 » : capture `CANCELLED`, aucune ligne.
8. Un message vocal : M28, état inchangé.

### W5 — Écriture dans l'inventaire du lot 040

**Règles**

- **W5-R1. Seules écritures permises** : `createStockCountTx`,
  `setStockCountLineTx`, `closeStockCountTx` (plan 040 §11), plus la colonne
  `StockCount.source` (ce lot) et les écritures des modèles de ce lot. Aucun
  appel aux mouvements, à la validation, à l'abandon, à la mise à l'écart.
- **W5-R2. Première confirmation d'une session sur un lieu.** Dans une
  transaction : si le lieu porte un inventaire `DRAFT`, il est réutilisé, qu'il
  ait été ouvert par WhatsApp ou par le web ; sinon `createStockCountTx`
  (`kind = REGULAR`, `countedAt` = jour UTC du serveur, `createdByUserId` = chef)
  puis `source = WHATSAPP`. Si le lieu porte un inventaire `COUNTED` (clos, non
  validé) : refus M29, capture `CANCELLED`, aucune écriture (l'index unique du
  lot 040 empêche un second inventaire ouvert, data-model 040 §5).
- **W5-R3. Ligne.** `setStockCountLineTx(tx, tenantId, countId, { itemId,
countedQuantity, countedByUserId: chef })`. La capture reçoit `countId`,
  `countLineId`, `confirmedQuantity`, `outcome`, `confirmedAt` dans la même
  transaction. Audit `STOCK_WHATSAPP_COUNT_RECORDED` (non critique) après la
  transaction ; l'audit `STOCK_COUNT_LINE_RECORDED` du lot 040 est écrit par
  le lot 040 lui-même.
- **W5-R4. Article déjà compté dans l'inventaire.** La ligne est unique par
  (inventaire, article) (`prisma/schema.prisma:7795`) : une seconde saisie
  remplacerait la première. Avant d'écrire, si la ligne existe, état
  `AWAITING_MERGE` et M30 : `1` = additionner (nouvelle quantité = existante +
  confirmée), `2` = remplacer, `0` = annuler cette photo. La quantité existante
  affichée est une quantité **comptée** (visible des compteurs en `DRAFT`, lot
  040), jamais l'attendu. Écart E3 (§13).
- **W5-R5. Clôture par WhatsApp.** À `FIN`, à `CHANTIER` et à l'expiration
  (W4-R5), l'inventaire courant de la session est clos par
  `closeStockCountTx(tx, tenantId, countId, chef)` **seulement si** : `source =
WHATSAPP`, il a au moins une ligne, et `counterUserIds` ne contient que le
  chef. Sinon il reste `DRAFT`, pour le bureau (M25b). Un refus du lot 040
  (`STOCK_COUNT_EMPTY`, `STOCK_COUNT_WRONG_STATUS`) laisse l'inventaire tel
  quel et est journalisé.
- **W5-R6. Alerte.** Dans la transaction de la clôture : `raiseStockAlertTx`
  (lot 040, B7-R2) avec `kind = FIELD_COUNT_CLOSED`, clé
  `FIELD_COUNT_CLOSED:<countId>`, `subjectType = StockCount`, `siteId`,
  `locationId`, `details = { linesCount, capturesCount, uncountedLinesCount }`
  (aucun nom de personne). Gravité `WARNING` si l'écart brut valorisé des lignes
  comptées — Σ |compté − attendu figé| × coût moyen du lieu — atteint
  `countVarianceAlertAmount`, ou atteint `countVarianceAlertPercent` de la valeur
  comptée ; sinon `INFO`. Seuils lus par `readStockAlertSettings` (lot 040) ;
  `amount` et `threshold` figés. L'e-mail récapitulatif et la file « À traiter »
  du lot 040 s'en chargent ; aucun message WhatsApp au directeur.
- **W5-R7. Course avec le bureau.** Si l'inventaire a été clos, validé ou
  abandonné au bureau entre deux messages, `setStockCountLineTx` échoue (lot
  040 : `409 STOCK_COUNT_WRONG_STATUS`) : capture `CANCELLED`, M31, la session
  revient à `READY` et oublie l'inventaire ; la photo suivante suit W5-R2.
- **W5-R8. Chantier devenu inéligible** (clos, lieu désactivé, retiré de
  l'inscription) : au message suivant, M32 puis nouveau choix (W4-R3).

**Critères d'acceptation**

1. Lieu sans inventaire : la première confirmation crée un inventaire `DRAFT`,
   `source = WHATSAPP`, `createdByUserId` = chef, et une ligne dont
   `countedByUserId` = chef.
2. Lieu avec un inventaire `DRAFT` ouvert par le magasinier dans le web :
   aucune création ; la ligne du chef s'y ajoute ; à `FIN`, l'inventaire reste
   `DRAFT` (deux compteurs) et le bot répond M25b.
3. Inventaire ouvert par WhatsApp, deux lignes du chef, `FIN` : statut
   `COUNTED`, lignes non comptées créées par le lot 040, une alerte
   `FIELD_COUNT_CLOSED` ouverte, M25 cite « 2 article(s) ».
4. Écart brut valorisé de 150 000 pour un seuil de 100 000 : alerte `WARNING` ;
   de 20 000 sur une valeur comptée de 1 000 000 avec 5 % : `INFO`.
5. Lieu portant un inventaire `COUNTED` : M29, aucune ligne, capture
   `CANCELLED`.
6. Ciment déjà compté 40 dans l'inventaire, nouvelle photo validée à 84 :
   M30 ; « 1 » → ligne à 124 ; « 2 » → ligne à 84.
7. Aucun appel à un service de mouvement, de validation ou d'ajustement dans le
   module du lot (test de dépendances, §11).

### W6 — Webhook Meta

**Règles**

- **W6-R1. Routes.** `GET` et `POST /api/webhooks/whatsapp-cloud/events`
  (routeur `src/routes/whatsapp-cloud-webhook-routes.ts`), montées dans
  `src/app.ts` **avant** `whatsappWebhookRoutes` (`:221`), dont le
  `router.use(express.urlencoded…)` s'applique à toute requête `/api/*` qui le
  traverse. Hors transport `meta`, les deux routes répondent `404`.
- **W6-R2. Corps brut.** Le préfixe `/api/webhooks/whatsapp-cloud` est ajouté à
  la liste des préfixes que les parseurs globaux ne traitent pas
  (`src/app.ts:129-136`). Le routeur lit `express.raw({ type:
'application/json', limit: '1mb' })`.
- **W6-R3. Vérification d'abonnement** (`GET`) : `hub.mode = subscribe` et
  `hub.verify_token` égal à `META_WA_VERIFY_TOKEN`, comparés par
  `hashesMatch(hashToken(attendu), hashToken(reçu))` (temps constant, longueurs
  égalisées par l'empreinte) ; succès : `200`, corps = `hub.challenge` en
  `text/plain` ; sinon `403` ([doc Meta](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)).
  Le journal des requêtes (`src/middleware/logging-middleware.ts:14, 24`) écrit
  `req.url` : pour ce préfixe, `hub.verify_token` et `hub.challenge` y sont
  remplacés par `[masqué]`.
- **W6-R4. Signature** (`POST`), **toujours exigée**, sans exception hors
  production : en-tête `X-Hub-Signature-256: sha256=<hex>` ; HMAC-SHA256 du
  corps brut avec `META_WA_APP_SECRET`, comparé à temps constant. Absente ou
  fausse : `401`, rien n'est écrit, avertissement au journal sans le corps.
- **W6-R5. Limiteur.** `webhookRateLimiter`
  (`src/middleware/rate-limit-middleware.ts:127-136`) avant la signature.
- **W6-R6. Lecture du corps.** `object = whatsapp_business_account`, puis
  `entry[].changes[].value` où `field = messages`. `value.metadata.phone_number_id`
  doit valoir `META_WA_PHONE_NUMBER_ID` (sinon ignoré). `value.messages[]` :
  `from`, `id`, `timestamp`, `type` (`text.body` ; `image` : `id`, `mime_type`,
  `sha256`, `caption` ; `interactive` : `button_reply` ou `list_reply` avec `id`
  et `title` ; `document`). `value.statuses[]` : journalisés comme événements
  `STATUS` et ignorés ([exemples Meta](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples),
  [interactif](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages/interactive)).
  `value.contacts[].profile.name` n'est pas conservé (minimisation).
- **W6-R7. Accusé immédiat, traitement fiable.** Pour chaque message, une ligne
  `WhatsappCloudEvent` est **insérée avant** la réponse (`metaMessageId` unique :
  un renvoi de Meta bute sur l'unicité et n'est pas retraité). Puis réponse
  `200` et traitement dans le processus (`setImmediate`). Le traitement réclame
  l'événement par mise à jour conditionnelle (`RECEIVED → PROCESSING`). La
  tâche planifiée (W10) reprend un événement resté `RECEIVED` plus de 2 minutes,
  ou `PROCESSING` plus de 5 minutes (arrêt de l'API), deux fois au plus, puis
  `FAILED`. Meta réessaie un événement non acquitté pendant 36 heures ;
  l'unicité absorbe ces renvois.
- **W6-R8. Événement global.** `WhatsappCloudEvent` n'a pas d'agence (modèle
  global, data-model §2.8) : il porte l'identifiant Meta, la nature, l'état,
  l'empreinte de l'expéditeur (`senderHash` = HMAC-SHA256 du numéro E.164 avec
  `META_WA_APP_SECRET`), et une copie **transitoire** du message (`payload`),
  effacée dès le traitement et au plus tard après 1 heure. Jamais le numéro en
  clair d'un expéditeur inconnu au-delà de ce transit.
- **W6-R9. Média.** `fetchMedia(mediaId)` : `GET /{version}/{media-id}` (rend
  `url`, `mime_type`, `sha256`, `file_size`), puis `GET url` avec le même jeton
  `Bearer` ([doc Meta](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media)).
  L'URL expire après 5 minutes : téléchargement immédiat, à la réception.
  **Garde SSRF** : schéma `https`, hôte égal à l'un de
  `META_WA_MEDIA_HOSTS` (défaut `lookaside.fbsbx.com` [à vérifier, source
  tierce]), port 443, aucune redirection suivie, résolution DNS refusée vers
  une adresse privée ou de bouclage. 10 Mo au plus (lecture interrompue
  au-delà). Type établi par les octets (`detectStockFileKind`, lot 040 §11) :
  JPEG, PNG, WebP ; autre → M18c. `sha256` annoncé par Meta comparé au fichier
  reçu (avant retrait de l'EXIF) : différent → rejet, journalisé.
- **W6-R10. Stockage.** `stripImageMetadata` puis `sha256Hex` (lot 040 §11) sur
  le fichier **stocké** ; écriture sous
  `uploads/stock-whatsapp/<tenantId>/<aaaa>/<uuid>.<ext>` (racine
  `getUploadsRoot(env.UPLOADS_DIR)`), jamais sous `uploads/whatsapp/`, dossier
  public (`src/middleware/uploads-access-middleware.ts:49-52`).

**Critères d'acceptation**

1. `POST` sans `X-Hub-Signature-256`, ou avec une signature fausse, en
   `NODE_ENV=development` : `401`, aucune ligne `WhatsappCloudEvent`.
2. `GET` avec le bon jeton : `200` et le `hub.challenge` ; avec un mauvais :
   `403` ; le journal des requêtes ne contient pas le jeton.
3. Le même message livré deux fois : un seul traitement, une seule capture.
4. Un événement `statuses` : ligne `STATUS`, aucun message envoyé.
5. Une URL de média sur `evil.example` ou `127.0.0.1` : refusée, aucun appel
   réseau vers cet hôte.
6. Un fichier `image/jpeg` déclaré dont les octets sont du HTML : refusé, M18c.
7. Un JPEG avec coordonnées GPS : le fichier stocké n'a plus de bloc EXIF ;
   l'empreinte enregistrée est celle du fichier stocké.
8. Arrêt simulé après l'insertion de l'événement : la tâche le traite au
   passage suivant, une seule fois.
9. `GET /uploads/stock-whatsapp/<tenant>/<aaaa>/<fichier>` : `404`.

### W7 — Numéro inconnu

**Règles**

- **W7-R1.** Expéditeur sans inscription non révoquée : M01, **au plus une fois
  par 24 heures** par empreinte d'expéditeur (`WhatsappCloudEvent.unknownReplySentAt`).
  Aucune capture, aucune session, aucun téléchargement de média.
- **W7-R2.** Un numéro dont l'inscription est en attente d'activation et qui
  n'envoie pas de code : M05 (pas M01).

**Critères d'acceptation**

1. Trois messages d'un inconnu en une heure : une seule réponse M01.
2. Le même inconnu 25 heures plus tard : une nouvelle réponse M01.
3. Une photo d'un inconnu : aucun appel à `fetchMedia`.

### W8 — Analyse de l'image (vision)

**Règles**

- **W8-R1. Interface** `StockVisionProvider` (plan §3.3) ; fournisseurs
  `gemini`, `openrouter`, `fake`, `disabled`, choisis par
  `STOCK_VISION_PROVIDER` ; modèle par `STOCK_VISION_MODEL`. `gemini` exige
  `GEMINI_API_KEY` ; `openrouter` réutilise `OPENROUTER_API_KEY` et
  `OPENROUTER_BASE_URL` et exige un modèle `fournisseur/modèle`. Ces choix ne
  dépendent pas du réglage ImmoCopilot du super-admin.
- **W8-R2. Gemini.** `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`,
  en-tête `x-goog-api-key`, `contents[0].parts` = consigne texte puis
  `inlineData { mimeType, data }` (base64), `generationConfig.responseMimeType =
application/json`, `responseJsonSchema` (JSON Schema de W8-R5 ; `responseSchema`,
  sous-ensemble OpenAPI, est déprécié), `temperature = 0`
  ([référence](https://ai.google.dev/api/generate-content)). Modèle par défaut
  `gemini-3.8-flash` (Flash stable recommandé pour un nouveau projet ;
  `gemini-2.5-flash` n'est plus ouvert qu'aux comptes qui l'utilisaient déjà),
  `google/gemini-3.8-flash` sur OpenRouter
  ([modèles Gemini](https://ai.google.dev/gemini-api/docs/models), vérifié le
  04/10/2026).
- **W8-R3. OpenRouter.** `POST {OPENROUTER_BASE_URL}/chat/completions`, `stream:
false`, message utilisateur en deux parties (`text`, puis `image_url` dont
  `url` est un URI `data:image/jpeg;base64,…`), `response_format: { type:
"json_schema", json_schema: { name: "stock_count", strict: true, schema } }`,
  `provider: { require_parameters: true }` ([images](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding),
  [sorties structurées](https://openrouter.ai/docs/features/structured-outputs)).
  OpenRouter précise que le respect du schéma varie selon le fournisseur : la
  validation Zod (W8-R5) reste l'autorité.
- **W8-R4. Ce qui est envoyé.** L'image **stockée** (EXIF retiré) et la liste
  des articles candidats : articles actifs de l'agence (`id`, `reference`,
  `label`, `unit`, `category`), 300 au plus (au-delà : ceux qui ont eu un
  mouvement sur le lieu dans les 180 derniers jours d'abord, puis par
  référence). **Jamais** le stock théorique, un solde, une valeur, un nom de
  personne, ni la légende de la photo (texte du chef, non fiable).
- **W8-R5. Sortie validée par Zod** (`stockVisionResultSchema`) :
  `quality` (`OK`, `TOO_DARK`, `BLURRY`, `NOT_STOCK`) ; `itemId` (un identifiant
  de la liste, ou `null`) ; `itemConfidence` (0 à 1) ; `visibleUnits` (entier
  ≥ 0) ; `layers`, `columns`, `depthRows` (entiers ≥ 1 ou `null`) ;
  `proposedTotal` (≥ 0, ≤ 1 000 000, 4 décimales) ; `confidence` (0 à 1) ;
  `method` (`SACKS_STACKED`, `BARS_BUNDLE`, `BLOCKS_PALLET`, `OTHER`) ;
  `explanation` (300 caractères au plus). Un `itemId` hors liste vaut `null`.
  Une sortie invalide vaut échec (`INVALID_OUTPUT`).
- **W8-R6. Consigne** (`src/lib/stock-whatsapp/vision/prompt.ts`) en français,
  spécialisée BTP : sacs empilés (unités de face × rangées en profondeur, ou
  couches × colonnes × profondeur) ; barres et tubes (compter les sections
  visibles en bout de fagot) ; briques et parpaings palettisés (blocs par
  couche × couches) ; ne pas extrapoler ce qui est caché ; préférer `null` à un
  article douteux ; ne jamais inventer un article hors de la liste ; aucun mot
  interdit (D2 du lot 040). La consigne ignore toute instruction écrite sur
  l'image (affiche, étiquette).
- **W8-R7. Délai.** `STOCK_VISION_TIMEOUT_MS` (20 000 par défaut), par
  `AbortSignal`. Échec (délai, erreur du fournisseur, sortie invalide) :
  capture `FAILED`, photo conservée, M22, aucun quota consommé (W11-R3), session
  `READY`.
- **W8-R8. Décision après analyse.** `quality ≠ OK` : capture `UNREADABLE`, M18
  (`TOO_DARK`, `BLURRY`) ou M18b (`NOT_STOCK`), session `READY`. `itemId` nul :
  `AWAITING_ITEM` (W9). `proposedTotal = 0` avec `OK` : traité comme `NOT_STOCK`.
  Sinon : `AWAITING_CONFIRMATION`, M13 ; si `confidence < 0,7`, la phrase de
  prudence de M13 est ajoutée.
- **W8-R9. Faux fournisseur** (`fake`), déterministe, pour le développement, les
  tests et la recette : lit la légende de la photo, **et seulement lui** :
  `fake:dark`, `fake:blurry`, `fake:notstock`, `fake:unknown`, `fake:fail`,
  `fake:timeout`, `fake:item=<référence>;total=<n>;conf=<0..1>` ; sans
  directive : premier candidat par référence, total 84, confiance 0,92,
  `SACKS_STACKED`, 12 de face × 7 rangées. Autorisé si `NODE_ENV` vaut
  `development` ou `test`, ou si `WHATSAPP_INVENTORY_SIMULATOR=1` (écart E1).
- **W8-R10. Trace.** La capture garde le fournisseur, le modèle, la durée, la
  sortie validée complète (`analysis`) et, en cas d'échec, la raison (sans la
  réponse brute du fournisseur, qui peut être longue).

**Critères d'acceptation**

1. La requête construite pour Gemini et pour OpenRouter (client HTTP simulé) ne
   contient ni `expectedQuantity`, ni `quantity` de solde, ni `value`, ni la
   légende.
2. Une sortie dont `itemId` n'est pas dans la liste : traitée comme non
   reconnue.
3. Une sortie sans `method` : `FAILED`, M22, compteur du mois inchangé.
4. Délai dépassé (fournisseur simulé lent) : `FAILED` en 20 s au plus.
5. `fake:item=CIM-45;total=60;conf=0.5` : M13 avec 60 et la phrase de prudence.

### W9 — Article non reconnu

**Règles**

- **W9-R1.** État `AWAITING_ITEM`, message M19. Le chef tape un nom.
- **W9-R2. Correspondance** sur `label` et `reference` des articles actifs,
  sans accents, sans casse, espaces réduits : égalité de référence d'abord,
  puis libellé contenant tous les mots tapés, puis distance d'édition ≤ 2 sur
  un mot. Un seul résultat : nouvelle analyse de la **même** photo avec
  l'article imposé (`imposedItemId`), sans quota de plus (W11-R3). Plusieurs :
  liste interactive (10 au plus, M20), la réponse de liste impose l'article.
  Aucun : M21, l'état reste `AWAITING_ITEM`. `0` : capture `UNRECOGNIZED`,
  `READY`.
- **W9-R3.** Jamais de création d'article depuis WhatsApp.
- **W9-R4.** Avec l'article imposé, l'IA rend le comptage ; si elle rend encore
  `itemId` nul ou un autre article, l'article imposé l'emporte.

**Critères d'acceptation**

1. « ciment » pour un seul article « Ciment CPJ 45 » : nouvelle analyse, M13
   avec cet article, compteur du mois inchangé par rapport à la première
   analyse.
2. « fer » pour « Fer 8 », « Fer 10 », « Fer 12 » : liste de trois lignes.
3. « bois » sans correspondance : M21.
4. Aucun `StockItem` n'est créé quel que soit le texte.

### W10 — Tâche planifiée

**Règles**

- **W10-R1.** `src/jobs/stock-whatsapp-job.ts` (`node-cron`, chaque minute),
  démarrée dans `src/index.ts` quand le transport n'est pas `disabled`, jamais
  en test.
- **W10-R2.** Lecture transverse assumée hors contexte (sessions ouvertes dont
  l'échéance est passée, événements à reprendre), puis chaque session traitée
  dans `runWithTenantContext({ tenantId })` et `runWithLanguage(langue du chef)`
  (même parti pris que `src/jobs/newsletter-campaign-scheduler.job.ts:14-26`).
- **W10-R3.** Travaux : relances et expirations (W4-R5) ; reprise des
  événements (W6-R7) ; effacement des `payload` de plus d'une heure ; purges
  nocturnes à 3 h 30 UTC : messages de conversation de plus de 180 jours,
  événements du webhook de plus de 30 jours (W14).
- **W10-R4.** Deux instances ne relancent ni ne ferment deux fois la même
  session : chaque action passe par une mise à jour conditionnelle (`WHERE
reminderSentAt IS NULL`, `WHERE closedAt IS NULL`).

**Critères d'acceptation**

1. Deux exécutions simultanées sur une session expirée : un seul M24.
2. Une session dont l'agence est suspendue entre-temps se ferme sans message.

### W11 — Option payante et quota

**Règles**

- **W11-R1. Catalogue.** Ligne `EXT_INVENTAIRE_WHATSAPP` (`EXTENSION`), nom
  « Inventaire WhatsApp — bloc de 500 photos », description « Comptage du stock
  de chantier par photo WhatsApp et IA : 500 photos analysées par mois »,
  25 000 FCFA HT par mois et par bloc, `rules.requiresAnyOf = [PROMOTEUR,
INTEGRE]`, capacité `PHOTOS_INVENTAIRE = 500` par unité, cumulable (quantité
  de l'élément d'abonnement). Amorcée par migration idempotente (`ON CONFLICT DO
NOTHING`) et par `DEFAULT_CATALOG` ; le super-admin en modifie ensuite le prix
  dans le catalogue en base.
- **W11-R2. Capacité.** `CapacityKey` reçoit `PHOTOS_INVENTAIRE`. Elle mesure une
  **consommation du mois civil UTC**, pas un stock : le fournisseur de
  consommation (`registerUsageProvider`) rend `used` du mois courant. Elle n'a
  **pas** de facturation de dépassement (absente de `extensionCodes`,
  `src/services/subscription-v2-service.ts:1520-1525`) et elle est sautée par
  les alertes de seuil de quota et les relevés quand son plafond est nul
  (`src/jobs/subscription-usage-job.ts:75`, même traitement qu'`ACTIFS`).
- **W11-R3. Compteur.** `StockWhatsappUsage` (agence, mois `AAAA-MM`, `used`).
  Avant l'appel à l'IA : réservation atomique `UPDATE … SET used = used + 1
WHERE tenant_id = $1 AND month = $2 AND used < $3 RETURNING used` (ligne créée
  au préalable par `INSERT … ON CONFLICT DO NOTHING`). Aucune ligne rendue :
  quota atteint. Après un échec de l'IA (W8-R7) : la réservation est rendue
  (`used = used - 1`). La nouvelle analyse avec article imposé (W9-R2) ne
  réserve rien.
- **W11-R4. Mode d'application** (`SUBSCRIPTION_ENFORCEMENT`) :
  - `enforce` : il faut `CONSTRUCTION` ouvert en écriture
    (`evaluateFeatureAccess(…, 'CONSTRUCTION', true)`) **et** un plafond
    `PHOTOS_INVENTAIRE > 0` ; sinon M06b. Quota = plafond.
  - `warn` : sans option (plafond nul), quota de secours
    `WHATSAPP_INVENTORY_WARN_QUOTA` (500 par défaut) et avertissement au
    journal (une fois par agence et par jour) ; avec option, quota = plafond.
  - `off` : quota de secours, sans avertissement.
- **W11-R5. Quota atteint** : M07, audit `STOCK_WHATSAPP_QUOTA_REACHED` une fois
  par agence et par mois, photo non téléchargée.

**Critères d'acceptation**

1. Agence Promoteur, 2 blocs : plafond 1 000. Agence Agence seule : l'extension
   n'est pas vendable (`requiresAnyOf`).
2. 500 photos analysées sur un bloc, `enforce` : la 501e reçoit M07, compteur
   à 500.
3. Deux photos simultanées à 499 : une seule passe (test d'intégration, base
   réelle).
4. `enforce`, sans option : M06b, aucune capture.
5. `warn`, sans option, `WHATSAPP_INVENTORY_WARN_QUOTA=3` : la 4e photo du mois
   reçoit M07.
6. La facture de dépassement d'une agence à 1 200 photos sur 1 000 ne porte
   aucune ligne `PHOTOS_INVENTAIRE`.
7. Échec de l'IA : compteur revenu à sa valeur d'avant.

### W12 — Refus d'accès au fil de la conversation

**Règles**

- **W12-R1.** Un échec du contrôle W3-R10 en cours de session : la session se
  ferme (`ACCESS_LOST`), la proposition en attente devient `EXPIRED`, le bot
  répond M06 (ou M06b pour l'option manquante en `enforce`), et l'inventaire
  n'est **pas** clos (le chef n'a plus le droit d'écrire).
- **W12-R2.** Le même contrôle est fait **avant** chaque écriture d'inventaire
  (il a pu changer pendant l'analyse).

**Critères d'acceptation**

1. Agence suspendue pendant une proposition : la réponse « 1 » du chef reçoit
   M06, aucune ligne écrite.

### W13 — Simulateur

**Règles**

- **W13-R1. Disponibilité.** Seulement si le transport vaut `log` ; en
  `NODE_ENV=production`, seulement avec `WHATSAPP_INVENTORY_SIMULATOR=1`
  (écart E1). Sinon `404 STOCK_WHATSAPP_SIMULATOR_UNAVAILABLE`.
- **W13-R2. Droit.** `FINANCE_SETTINGS_MANAGE`, routes d'agence sous
  `requireTenantAccess`.
- **W13-R3. Injection.** `POST /finance/stock/whatsapp/simulator/messages` :
  au nom d'une inscription de l'agence (en attente ou active), ou d'un numéro
  libre (pour jouer W7) ; texte, photo (multipart, 10 Mo, légende facultative)
  ou réponse de bouton ou de liste (`replyId`). Le message passe par le **même**
  moteur que le webhook (`handleInboundMessage`), avec `via = SIMULATOR`. La
  photo est déposée dans le magasin de médias du transport `log` et lue par
  `fetchMedia`.
- **W13-R4. Conversation.** `GET …/simulator/conversation?registrationId=` rend
  les messages entrants et sortants de l'inscription (ou du numéro libre, tant
  que le processus vit), boutons et listes compris.
- **W13-R5. Horloge.** `POST …/simulator/sessions/{sessionId}/advance`
  `{ minutes: 10 | 30 }` recule `lastInboundAt` et lance aussitôt le passage de
  la tâche pour cette session : relance et expiration se jouent en recette.
- **W13-R6.** Exclu du catalogue de l'assistant (segment `simulator`,
  `src/lib/ai/gateway/catalog-builder.ts:57-62`).

**Critères d'acceptation**

1. Transport `meta` : `404 STOCK_WHATSAPP_SIMULATOR_UNAVAILABLE`.
2. Une photo injectée produit la même capture qu'une photo reçue par le
   webhook, `via = SIMULATOR` en plus.
3. `advance 30` sur une session en attente : M24 visible dans la conversation.

### W14 — Écrans, conservation et mesures

**Règles**

- **W14-R1. Écrans** : ecrans.md (onglet WhatsApp, Comptages terrain,
  visualiseur, badge).
- **W14-R2. Lecture des captures.** `STOCK_VIEW`. Les quantités et valeurs de
  stock suivent les masques du lot 040 (§8.1 valeurs, §8.2 aveugle) ; une
  capture ne porte aucune quantité théorique (T10).
- **W14-R3. Conversation d'une session.** Lisible par `FINANCE_SETTINGS_MANAGE`
  ou `STOCK_COUNT_VALIDATE` (elle contient les textes du chef).
- **W14-R4. Fichier.** `GET …/captures/{id}/file` : agence vérifiée, puis
  `privateUploadPath(fileUrl, ['stock-whatsapp', tenantId, <aaaa>])` et
  `sendPrivateFile` ; lecture tracée (`DOCUMENT_DOWNLOADED`, middleware d'accès,
  comme le lot 040 B5-R8).
- **W14-R5. Retrait d'une photo.** `POST …/captures/{id}/remove-photo`
  (`STOCK_DISPOSE`, motif 3 à 500) : fichier effacé, ligne gardée avec
  l'empreinte, `photoRemovedAt`, `photoRemovedByUserId`, `photoRemovalReason`,
  audit `STOCK_WHATSAPP_PHOTO_REMOVED` (critique). Cas type : la photo montre
  une personne.
- **W14-R6. Conservation.** Captures et photos : comme les pièces jointes du
  stock (lot 040 §10). Messages : 180 jours (T9). Événements du webhook :
  30 jours. `payload` d'un événement : 1 heure au plus.
- **W14-R7. Mesures** (`GET …/whatsapp/overview`, par mois, agence entière,
  **jamais par personne**, D4 du lot 040) : photos analysées et quota ; délai
  médian entre la réception de la photo et la confirmation (cible < 45 s) ; part
  des confirmations `ACCEPTED` parmi `ACCEPTED + CORRECTED` (cible ≥ 88 %) ;
  part des lignes WhatsApp portant une photo non retirée (cible 100 %) ; parts
  `UNREADABLE`, `UNRECOGNIZED`, `FAILED`.

**Critères d'acceptation**

1. Le fichier d'une capture d'une autre agence : `404` (test d'isolation).
2. Un comptable sans `STOCK_COUNT_VALIDATE` lit l'écran Comptages terrain d'un
   lieu en comptage : stock théorique `null`.
3. Les mesures ne contiennent aucun identifiant de personne.

## 7. Machine à états

| État                    | Entrée              | Événement                            | Effet                                                      | État suivant                                                             |
| ----------------------- | ------------------- | ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| (aucune session)        | —                   | Photo ou texte d'un chef actif       | Session ouverte                                            | `AWAITING_SITE` (plusieurs chantiers) ou `READY` / `ANALYZING` (un seul) |
| `AWAITING_SITE`         | M08                 | Réponse de bouton ou de liste valide | `siteId`, `locationId`                                     | `ANALYZING` si une photo attend, sinon `READY` (M10)                     |
| `AWAITING_SITE`         |                     | Photo                                | Capture `RECEIVED` gardée (une seule ; une seconde : M12b) | `AWAITING_SITE`                                                          |
| `READY`                 | M10, M14, M15, M16… | Photo                                | Quota réservé, M11, analyse                                | `ANALYZING`                                                              |
| `READY`                 |                     | Texte qui n'est pas une commande     | M33                                                        | `READY`                                                                  |
| `ANALYZING`             | M11                 | Analyse `OK`, article trouvé         | M13                                                        | `AWAITING_CONFIRMATION`                                                  |
| `ANALYZING`             |                     | Analyse `OK`, article nul            | M19                                                        | `AWAITING_ITEM`                                                          |
| `ANALYZING`             |                     | Qualité insuffisante                 | M18 / M18b                                                 | `READY`                                                                  |
| `ANALYZING`             |                     | Échec                                | Quota rendu, M22                                           | `READY`                                                                  |
| `ANALYZING`             |                     | Photo                                | M12                                                        | `ANALYZING`                                                              |
| `AWAITING_ITEM`         | M19                 | Texte → 1 article / liste / aucun    | Nouvelle analyse / M20 / M21                               | `ANALYZING` / `AWAITING_ITEM` / `AWAITING_ITEM`                          |
| `AWAITING_ITEM`         |                     | `0`                                  | Capture `UNRECOGNIZED`                                     | `READY`                                                                  |
| `AWAITING_CONFIRMATION` | M13                 | `1`, nombre                          | Écriture (W5) ou M30 si l'article est déjà compté          | `READY` (M14, M15) ou `AWAITING_MERGE`                                   |
| `AWAITING_CONFIRMATION` |                     | `0`                                  | Capture `CANCELLED`, M16                                   | `READY`                                                                  |
| `AWAITING_MERGE`        | M30                 | `1` / `2` / `0`                      | Addition / remplacement / annulation                       | `READY`                                                                  |
| tout état ouvert        |                     | `FIN`                                | W5-R5, M25 / M25b / M25c                                   | `CLOSED`                                                                 |
| tout état ouvert        |                     | `CHANTIER`                           | W5-R5 sur le chantier courant, proposition abandonnée      | `AWAITING_SITE`                                                          |
| tout état ouvert        |                     | `AIDE`                               | M26                                                        | inchangé                                                                 |
| tout état ouvert        |                     | 30 min sans message                  | W4-R5, M24                                                 | `CLOSED`                                                                 |
| tout état ouvert        |                     | Accès perdu (W12)                    | M06 / M06b                                                 | `CLOSED`                                                                 |

## 8. Règles transverses

### 8.1 Sécurité

- Signature Meta toujours vérifiée (W6-R4) ; aucun contournement selon
  `NODE_ENV`. Jeton de vérification comparé à temps constant et masqué au
  journal (W6-R3).
- Aucun secret par défaut ; toutes les variables par `src/config/env.ts` et
  `env.example`. Le code de ce lot ne lit jamais `process.env` directement.
- Garde SSRF sur les médias (W6-R9). Aucune URL de média ne vient du corps du
  webhook : seule l'URL rendue par `GET /{media-id}` est suivie.
- Code d'activation haché, 72 h, 5 essais, comparaison à temps constant ;
  verrouillage audité.
- Le simulateur n'existe pas en production (W13-R1).
- Le contenu des messages du chef et l'image sont des **données** : ni la
  légende ni un texte ne pilotent l'IA (W8-R4, W8-R6).

### 8.2 Isolation

- Tout modèle nouveau porte `tenantId`, sauf `WhatsappCloudEvent` (global,
  justifié dans `GLOBAL_MODELS`).
- Toutes les routes d'agence passent `requireTenantAccess` ; toute référence
  reçue (inscription, chantier, membre, capture, session, inventaire) est
  vérifiée par `assertBelongsToTenant` ; une référence d'une autre agence lève
  la même `NotFoundError` qu'un objet inexistant.
- Le moteur résout l'agence depuis l'inscription (lecture transverse assumée,
  par numéro), puis travaille dans `runWithTenantContext`.
- Les agrégats en SQL brut (mesures, quota) portent `tenant_id = $1` explicite.

### 8.3 Aveugle (W-D2)

Aucune réponse du bot, aucun champ de capture, aucune donnée envoyée à l'IA ne
contient : l'attendu d'une ligne, un solde, un écart, une valeur, un coût, le
seuil d'une alerte, ni le fait qu'une alerte a été levée. Le bot cite seulement
ce que le chef a compté (la proposition, la quantité confirmée, la quantité déjà
comptée dans l'inventaire, M30). Test : §11 « aveugle du bot ».

### 8.4 Données personnelles

- **Numéro de téléphone** du chef : stocké en E.164 sur l'inscription,
  affiché masqué partout sauf à l'écran d'inscription
  (`+225 07 •• •• •• 78`) ; masqué dans l'audit (`redact: ['phone',
'phoneE164']`) ; absent des mesures. Le numéro d'un inconnu n'est conservé
  qu'en empreinte (W6-R8).
- **Photos** : marchandise seulement ; consigne dans M02 et M26 ; EXIF retiré ;
  retrait possible (W14-R5). Les photos sont transmises au fournisseur de
  vision (Google directement, ou via OpenRouter) : à mentionner dans
  l'information des chefs et dans la politique de confidentialité de
  l'agence [Ext, à faire valider : loi ivoirienne et ARTCI, transfert hors
  Côte d'Ivoire].
- **Conversations** : 180 jours ; le nom de profil WhatsApp n'est pas conservé.
- **Ce que le produit ne fait pas** : pas de géolocalisation, pas d'indicateur
  par personne, pas de qualification d'un écart (D4 du lot 040).

### 8.5 Langue

Les messages du bot sortent dans `User.preferredLanguage` du chef (`fr`, `en`,
`ar`), français s'il est nul, par `runWithLanguage` et `t()` (texte français =
clé). Les commandes françaises et anglaises sont reconnues dans toutes les
langues. Les nombres s'écrivent sans séparateur de milliers dans les messages
(« 1250 »), pour que le chef puisse les recopier.

### 8.6 Erreurs

`AppError` avec code stable `STOCK_WHATSAPP_*` (contrat, `StockWhatsappErrorCode`),
jamais `lib/errors.conflict(message, details)` (spec 040 §8.3).

## 9. Cas limites

| Cas                                                                      | Comportement                                                                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Album de 5 photos envoyé d'un coup                                       | Cinq messages : la première est analysée, les quatre autres reçoivent M12 (W4-R4).                                         |
| Photo envoyée comme document                                             | Traitée comme photo si son type est JPEG, PNG ou WebP (W4-R8).                                                             |
| Photo avec légende « 84 »                                                | La légende est ignorée par l'analyse réelle ; le chef corrige après la proposition.                                        |
| Le chef répond « 1 » à une proposition expirée                           | Pas de session ouverte : une nouvelle session s'ouvre, M33 (« Envoyez une photo… »).                                       |
| Réponse de bouton d'un ancien message (`context.id` d'une autre capture) | Ignorée avec M17 : le bouton porte l'identifiant de la capture (`confirm:<captureId>`), comparé à la proposition en cours. |
| Inscription révoquée pendant l'analyse                                   | Analyse terminée, quota consommé, aucune écriture, M06 (W12-R2).                                                           |
| Article désactivé entre la proposition et la confirmation                | Refus du lot 040 relayé : capture `CANCELLED`, M31.                                                                        |
| Chantier clos pendant la session                                         | M32, nouveau choix (W5-R8).                                                                                                |
| Inventaire validé au bureau pendant la session                           | W5-R7.                                                                                                                     |
| Deux chefs sur le même chantier                                          | Même inventaire `DRAFT` ; à `FIN`, il reste ouvert (deux compteurs, W5-R5).                                                |
| Meta renvoie un message 36 heures plus tard                              | Unicité de `metaMessageId` : ignoré (purge à 30 jours, au-delà de la fenêtre de renvoi).                                   |
| Changement de numéro du chef                                             | Révoquer, réinscrire avec le nouveau numéro, nouveau code.                                                                 |
| Panne du fournisseur de vision                                           | M22, quota rendu ; le bureau compte dans le web.                                                                           |
| Agence en lecture seule (abonnement impayé)                              | `enforce` : M06b ; `warn` : passe, avertissement au journal.                                                               |
| Fichier de 12 Mo                                                         | Téléchargement interrompu à 10 Mo, M18c.                                                                                   |

## 10. Textes du bot (français, clés de traduction)

Les variables entre doubles accolades sont remplacées après traduction. Aucun
texte ne cite un attendu, un écart ou une valeur.

| Id   | Quand                               | Texte                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01  | Numéro inconnu (W7)                 | Bonjour. Ce numéro n'est pas associé à un compte Chef de chantier ImmoTopia. Contactez votre administrateur.                                                                                                                                                                                                                                                                                                |
| M02  | Activation réussie                  | Bienvenue {{name}}. Votre numéro est relié à ImmoTopia pour l'inventaire des chantiers de {{agency}}. Envoyez une photo de votre stock pour commencer : une photo par article, prise de face. Photographiez la marchandise, pas les personnes. Tapez AIDE à tout moment.                                                                                                                                    |
| M03  | Code incorrect                      | Code incorrect. Il vous reste {{remaining}} essai(s). Vérifiez le code donné par votre administrateur.                                                                                                                                                                                                                                                                                                      |
| M04  | Code épuisé ou expiré               | Ce code n'est plus valable. Demandez un nouveau code à votre administrateur.                                                                                                                                                                                                                                                                                                                                |
| M05  | Inscription en attente, pas de code | Votre inscription n'est pas encore activée. Envoyez d'abord le code à 6 chiffres donné par votre administrateur.                                                                                                                                                                                                                                                                                            |
| M06  | Accès perdu                         | Votre accès à l'inventaire par WhatsApp n'est plus actif. Contactez votre administrateur.                                                                                                                                                                                                                                                                                                                   |
| M06b | Option absente (`enforce`)          | L'inventaire par WhatsApp n'est pas activé pour votre entreprise. Contactez votre administrateur.                                                                                                                                                                                                                                                                                                           |
| M07  | Quota atteint                       | Le nombre de photos analysées ce mois-ci pour votre entreprise est atteint. Contactez votre administrateur. Le bureau peut saisir le comptage dans ImmoTopia.                                                                                                                                                                                                                                               |
| M08  | Choix du chantier                   | Sur quel chantier êtes-vous ? (bouton de liste : « Choisir »)                                                                                                                                                                                                                                                                                                                                               |
| M09  | Aucun chantier                      | Aucun chantier ouvert au stock ne vous est affecté. Contactez votre administrateur.                                                                                                                                                                                                                                                                                                                         |
| M10  | Chantier choisi                     | Chantier « {{site}} ». Envoyez la photo du premier article.                                                                                                                                                                                                                                                                                                                                                 |
| M11  | Photo reçue                         | Photo reçue, je compte…                                                                                                                                                                                                                                                                                                                                                                                     |
| M12  | Analyse en cours                    | Je termine l'analyse de la photo précédente. Renvoyez cette photo après ma réponse.                                                                                                                                                                                                                                                                                                                         |
| M12b | Question en attente                 | Répondez d'abord à ma question précédente, ou tapez 0 pour l'annuler. Renvoyez ensuite cette photo.                                                                                                                                                                                                                                                                                                         |
| M13  | Proposition                         | {{item}} ({{reference}})<br>{{methodDetail}}<br>Total proposé : {{total}} {{unit}}<br><br>Tapez 1 pour VALIDER ce comptage ({{total}} {{unit}}), le nombre exact si différent, 0 pour annuler. — boutons « Valider » et « Annuler ». Si confiance < 0,7, ligne ajoutée avant la consigne : « Je ne suis pas sûr de ce total : vérifiez-le avant de valider. »                                               |
| M13a | Détail : sacs                       | {{front}} sacs de face × {{depth}} rangée(s) en profondeur                                                                                                                                                                                                                                                                                                                                                  |
| M13b | Détail : barres                     | {{visible}} sections comptées en bout de fagot                                                                                                                                                                                                                                                                                                                                                              |
| M13c | Détail : palette                    | {{columns}} blocs par couche × {{layers}} couche(s)                                                                                                                                                                                                                                                                                                                                                         |
| M13d | Détail : autre                      | {{visible}} unité(s) visible(s)                                                                                                                                                                                                                                                                                                                                                                             |
| M14  | Enregistré                          | Enregistré : {{quantity}} {{unit}} de {{item}}. Envoyez la photo de l'article suivant, ou tapez FIN quand vous avez terminé.                                                                                                                                                                                                                                                                                |
| M15  | Enregistré, corrigé                 | Enregistré : {{quantity}} {{unit}} de {{item}} (quantité corrigée). Envoyez la photo de l'article suivant, ou tapez FIN quand vous avez terminé.                                                                                                                                                                                                                                                            |
| M16  | Annulé                              | Comptage de cette photo annulé : rien n'est enregistré. Envoyez une autre photo, ou tapez FIN.                                                                                                                                                                                                                                                                                                              |
| M17  | Réponse incomprise                  | Je n'ai pas compris. Tapez 1 pour valider {{total}} {{unit}}, le nombre exact (ex. 84), ou 0 pour annuler.                                                                                                                                                                                                                                                                                                  |
| M18  | Trop sombre ou floue                | Photo trop sombre ou floue pour compter précisément. Merci de reprendre la photo en activant le flash.                                                                                                                                                                                                                                                                                                      |
| M18b | Pas de stock visible                | Je ne vois pas de matériau à compter sur cette photo. Photographiez le stock de face, en entier.                                                                                                                                                                                                                                                                                                            |
| M18c | Fichier refusé                      | Je ne peux pas lire ce fichier. Envoyez une photo (JPEG ou PNG) de moins de 10 Mo.                                                                                                                                                                                                                                                                                                                          |
| M19  | Article non reconnu                 | Photo reçue, mais l'article n'est pas identifiable avec certitude. De quel matériau s'agit-il ? (Ex : Ciment, Fer 10, Parpaing)                                                                                                                                                                                                                                                                             |
| M20  | Plusieurs articles                  | Plusieurs articles correspondent. Lequel est sur la photo ? (bouton de liste : « Choisir »)                                                                                                                                                                                                                                                                                                                 |
| M21  | Aucun article                       | Je ne trouve pas « {{text}} » parmi les articles de votre entreprise. Essayez un autre nom (ex. Ciment, Fer 10), ou tapez 0 pour annuler. Un article nouveau se crée dans ImmoTopia par le bureau.                                                                                                                                                                                                          |
| M22  | Échec de l'analyse                  | Désolé, je n'arrive pas à analyser cette photo pour le moment. Elle est conservée. Réessayez dans quelques minutes, ou prévenez le bureau.                                                                                                                                                                                                                                                                  |
| M23  | Relance (10 min)                    | J'attends votre réponse à ma question précédente. Sans réponse dans 20 minutes, cette photo ne sera pas enregistrée.                                                                                                                                                                                                                                                                                        |
| M24  | Expiration (30 min)                 | Session terminée après 30 minutes sans réponse. {{pending}}{{closed}} Envoyez une photo pour recommencer. — `pending` : « La dernière photo n'a pas été enregistrée. » ; `closed` : « L'inventaire de « {{site}} » est transmis au bureau ({{count}} article(s)). »                                                                                                                                         |
| M25  | `FIN`, inventaire clos              | Merci. L'inventaire de « {{site}} » est transmis au bureau : {{count}} article(s) compté(s). Le bureau le vérifiera et le validera.                                                                                                                                                                                                                                                                         |
| M25b | `FIN`, inventaire laissé ouvert     | Merci. Vos {{count}} article(s) sont enregistrés dans l'inventaire en cours de « {{site}} ». Il reste ouvert : le bureau le clôturera.                                                                                                                                                                                                                                                                      |
| M25c | `FIN`, rien compté                  | Session terminée. Aucun article n'a été compté.                                                                                                                                                                                                                                                                                                                                                             |
| M26  | `AIDE`                              | Inventaire par photo :<br>1. Envoyez une photo par article, de face, en entier, avec le flash si besoin.<br>2. Je propose un total : tapez 1 pour valider, le nombre exact s'il est différent, 0 pour annuler.<br>3. Tapez FIN quand vous avez terminé.<br>CHANTIER : changer de chantier.<br>Un article à zéro se signale au bureau, pas par WhatsApp.<br>Photographiez la marchandise, pas les personnes. |
| M28  | Type non pris en charge             | Je lis seulement les photos et les messages écrits. Envoyez une photo de votre stock, ou tapez AIDE.                                                                                                                                                                                                                                                                                                        |
| M29  | Inventaire en attente de validation | Un inventaire de ce chantier attend sa validation au bureau. Le comptage par WhatsApp reprendra après cette validation. Rien n'a été enregistré.                                                                                                                                                                                                                                                            |
| M30  | Article déjà compté                 | {{item}} est déjà compté dans cet inventaire : {{existing}} {{unit}}. Tapez 1 pour AJOUTER {{quantity}} (total {{sum}}), 2 pour REMPLACER par {{quantity}}, 0 pour annuler cette photo. — boutons « Ajouter », « Remplacer », « Annuler ».                                                                                                                                                                  |
| M31  | Inventaire modifié au bureau        | L'inventaire en cours a été modifié au bureau : ce comptage n'a pas été enregistré. Envoyez à nouveau la photo.                                                                                                                                                                                                                                                                                             |
| M32  | Chantier plus disponible            | Le chantier « {{site}} » n'est plus ouvert au comptage par WhatsApp.                                                                                                                                                                                                                                                                                                                                        |
| M33  | Texte libre en `READY`              | Envoyez une photo de votre stock, ou tapez AIDE.                                                                                                                                                                                                                                                                                                                                                            |

(`<br>` marque un saut de ligne du message ; M27 n'existe pas.)

## 11. Tests à écrire

| Fichier (`packages/api/__tests__/` sauf mention)       | Contenu                                                                                                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/phone-e164.test.ts`                              | W3-R3 : formats ivoiriens, `00`, `+`, invalides ; masquage.                                                                                                                            |
| `unit/whatsapp-cloud-webhook.test.ts`                  | W6 : signature (absente, fausse, juste, `NODE_ENV=development`), vérification `GET`, masquage du jeton au journal, dédoublonnage, statuts, numéro de téléphone d'une autre ligne Meta. |
| `unit/whatsapp-meta-transport.test.ts`                 | W1-R4/R5/R7, W6-R9 : corps envoyés, bornes, garde SSRF, 10 Mo, empreinte Meta.                                                                                                         |
| `unit/stock-vision.test.ts`                            | W8 : requêtes Gemini et OpenRouter (aucun champ de stock), validation Zod, délai, faux fournisseur et ses directives.                                                                  |
| `unit/stock-whatsapp-engine.test.ts`                   | W4, W5, W9, W12 : chaque transition du §7, commandes, M30, courses avec le bureau, clôture et alerte (fonctions du lot 040 simulées).                                                  |
| `unit/stock-whatsapp-registration.test.ts`             | W3 : éligibilité lue en base, unicité, code haché, essais, révocation.                                                                                                                 |
| `unit/stock-whatsapp-quota.test.ts`                    | W11 : modes `enforce` / `warn` / `off`, réservation et restitution, audit une fois par mois.                                                                                           |
| `unit/stock-whatsapp-job.test.ts`                      | W4-R5, W6-R7, W10 : relance unique, expiration, reprise, purges, deux exécutions simultanées.                                                                                          |
| `unit/stock-whatsapp-blind.test.ts`                    | §8.3 : tous les messages produits par un parcours complet ne contiennent ni l'attendu ni une valeur (stock théorique de 137 sacs, jamais « 137 » dans un message).                     |
| `unit/stock-whatsapp-dependencies.test.ts`             | W5-R1 : le module `src/lib/stock-whatsapp/` n'importe ni `stock-mouvements`, ni `stock-transferts`, ni la validation d'inventaire.                                                     |
| `api/finance.stock-whatsapp.test.ts`                   | Routes d'agence : droits, `404` inter-agences, masques de la réconciliation, simulateur indisponible hors `log`.                                                                       |
| `integration/stock-whatsapp-quota-concurrence.test.ts` | W11 critère 3 (base `DATABASE_URL_TEST`, sauté sans elle).                                                                                                                             |
| `integration/isolation.test.ts`                        | Bloc « Inventaire WhatsApp » : inscription, capture, fichier, session, conversation d'une autre agence → `404`.                                                                        |
| `unit/routes-inventory.test.ts`                        | **Modifié** : entrées `GET` et `POST /api/webhooks/whatsapp-cloud/events` avec leur raison.                                                                                            |
| `unit/route-features.test.ts`                          | **Modifié** : famille `/api/webhooks` hors abonnement (`:47`).                                                                                                                         |
| `unit/schema-tenant-coverage.test.ts`                  | **Modifié** : `WhatsappCloudEvent` dans `GLOBAL_MODELS`, avec sa raison.                                                                                                               |
| `unit/tenant-data-export.registry.test.ts`             | Modèles du lot classés (data-model §6).                                                                                                                                                |
| `unit/audit-catalog.test.ts`                           | Clés `STOCK_WHATSAPP_*` dans `postMigrationKeys`.                                                                                                                                      |
| `unit/ai.catalog.test.ts`                              | Vert après `npm run ai:catalog` ; simulateur absent du catalogue.                                                                                                                      |
| `unit/stock-vocabulaire.test.ts` (lot 040)             | **Étendu** aux fichiers de `src/lib/stock-whatsapp/` et à la consigne de l'IA.                                                                                                         |
| `unit/i18n-catalogs-completeness.test.ts`              | Vert après extraction et traduction en/ar des messages du bot.                                                                                                                         |
| Côté web                                               | ecrans.md §8.                                                                                                                                                                          |

## 12. Fichiers touchés

Découpage par territoires : [plan.md](plan.md). Nouveau module
`src/lib/stock-whatsapp/` (transport, webhook, moteur, vision, quota,
inscriptions, fichiers, messages du bot), deux routeurs, une tâche, une
fonction de téléphone. Points d'accroche dans des fichiers existants listés au
plan §6, chacun avec un seul propriétaire.

## 13. Précisions et écarts par rapport aux décisions techniques

| #   | Décision | Proposition                                                                                                                                                                                                                                              | Preuve dans le code                                                                                                                                                                                                          |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | T8       | Le simulateur, le transport `log` et le faux fournisseur de vision s'activent aussi en `NODE_ENV=production` avec `WHATSAPP_INVENTORY_SIMULATOR=1`, que `deploy.sh` refuse sur la production. Sinon la recette navigateur est impossible sur le staging. | Le staging tourne en `NODE_ENV=production` (`infra/scripts/deploy.sh:241-242`) ; `fake` n'est permis qu'en `development` / `test` (`src/config/env.ts:32-34`) ; précédent `PAYMENT_GATEWAY_SIMULATOR` (`deploy.sh:279-282`). |
| E2  | T7       | L'événement du webhook est **inséré en base avant** la réponse 200, puis repris par la tâche s'il n'a pas été traité. « Traitement dans le processus » seul perdrait le message à tout arrêt de l'API.                                                   | Meta ne renvoie pas un événement acquitté ([doc](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)).                                                                                                  |
| E3  | T2, T3   | État de plus, `AWAITING_MERGE` : additionner ou remplacer quand l'article a déjà une ligne. Sans lui, la seconde pile de ciment photographiée **remplacerait** la première sans le dire.                                                                 | `prisma/schema.prisma:7795` (`@@unique([countId, itemId])`) ; ressaisie qui remplace (spec 040 §9, première ligne).                                                                                                          |
| P1  | T7       | Routeur monté **avant** `whatsappWebhookRoutes`, dont le `router.use(express.urlencoded)` traverse toute requête `/api/*`.                                                                                                                               | `src/app.ts:221` ; `src/routes/whatsapp.webhook.route.ts:11-16`.                                                                                                                                                             |
| P2  | T7       | `hub.verify_token` masqué dans le journal des requêtes.                                                                                                                                                                                                  | `src/middleware/logging-middleware.ts:14, 24` (écrit `req.url`).                                                                                                                                                             |
| P3  | T6       | `PHOTOS_INVENTAIRE` exclue de la facture de dépassement et des alertes de seuil quand son plafond est nul ; quota en mois civil UTC, réservé avant l'IA puis rendu si elle échoue.                                                                       | `src/services/subscription-v2-service.ts:1518-1544` ; `src/jobs/subscription-usage-job.ts:75` ; T6 « consommé seulement si l'IA a répondu ».                                                                                 |
| P4  | T8, T2   | Transport `disabled` par défaut (la tâche ne démarre pas) ; 10 chantiers au plus par inscription (liste Meta de 10 lignes).                                                                                                                              | [Listes Meta](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-list-messages).                                                                                                                   |

Aucune décision n'est renversée.

## 14. Questions ouvertes

1. **`STOCK_VIEW` du chef** (§3.3) : **tranché par le Pilote le 04/10** — retiré
   (aveugle strict W-D2). Le rôle ne porte que `STOCK_COUNT`.
2. **Comptes sans e-mail** : un chef doit être membre, donc avoir un compte
   invité par e-mail. Beaucoup de chefs n'en ont pas. Faut-il une invitation
   sans e-mail (hors lot) ?
3. **Un chef pour deux agences** : un numéro n'a qu'une inscription sur la
   plateforme (T1). Un sous-traitant qui travaille pour deux promoteurs devra
   choisir. Acceptable ?
4. **Seuil de prudence** (confiance < 0,7) et **borne de 300 articles
   candidats** : à régler avec les premiers chantiers.
5. **Hôte de téléchargement des médias** : `lookaside.fbsbx.com` est attesté par
   des sources tierces, pas par la page officielle ; à confirmer au premier
   essai réel (variable `META_WA_MEDIA_HOSTS`).
6. **Transfert de photos à Google** : texte d'information des chefs et base
   légale à valider (ARTCI).
7. **Prix et taille du bloc** (25 000 FCFA, 500 photos) : modifiables par le
   super-admin ; faut-il un essai gratuit (par exemple 50 photos le premier
   mois) ?
