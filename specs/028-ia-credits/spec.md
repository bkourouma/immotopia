# Spécification 028 — Facturation des crédits IA d'ImmoCopilot

> Mesure de l'usage de l'assistant, dix requêtes gratuites par mois, packs
> mensuels, dépassement facturé avec plafond, recharges prépayées, contrôle
> avant l'appel au modèle et tableau de marge. **Spécification seule** :
> décision de l'utilisateur du 29/09/2026, aucune implémentation n'est engagée.
> Les choix de cette spécification sont les **recommandations** de la demande,
> retenues par défaut faute de réponse aux cinq décisions posées ; chacun est
> marqué **[Par défaut — à valider]** et ses alternatives sont en §14.
>
> Compagnons : [plan.md](./plan.md) (architecture, lots, tests),
> [data-model.md](./data-model.md) (schéma Prisma proposé),
> [contracts/openapi.yaml](./contracts/openapi.yaml) (API),
> [tasks.md](./tasks.md) (tâches par lot).

**Statut** : brouillon · **Créée** : 2026-09-29 · **Base** : `main` `6c454886`

**Règle de lecture.** Cette spécification ne décide d'aucune règle légale,
fiscale ou comptable. Tout ce qui en relève est marqué **[À VALIDER —
juriste]** ou **[À VALIDER — expert-comptable]**, et les seuils commerciaux
**[À VALIDER — utilisateur]** ; ces valeurs se paramètrent au lieu de se coder
en dur. **Aucun prix n'est figé** avant les deux semaines de données du lot A
(§7.10). La liste consolidée est au §14.

## 1. Références

- **Spec de l'assistant** : [022](../022-assistant-ia-immocopilot/spec.md)
  (contrat `/ai/chat`, limites, audit) et
  [ADR-004](../../docs/architecture/adr/ADR-004-assistant-ia-immocopilot.md).
  Cette spec ne change pas ce que fait l'assistant, seulement ce qu'il coûte
  et à qui.
- **Abonnements et facturation** :
  [`docs/architecture/PLAN-ABONNEMENTS.md`](../../docs/architecture/PLAN-ABONNEMENTS.md)
  (décisions D1 à D16 : réserve unique D3, dépassement facturé D4, ajout
  immédiat au prorata et retrait à l'échéance D7, essai et grâce D8, factures
  automatiques TVA 18 % Alliance Consultants D9, paiement en ligne et constat
  manuel D10, catalogue en base et prix figé D12, dépassement impayé sans effet
  automatique D15). Cette spec **s'y conforme** ; les seuls écarts sont nommés
  (Q15).
- **Paiement** : [`docs/integrations/paysecurehub.md`](../../docs/integrations/paysecurehub.md)
  (mode `SIMULATOR` par défaut : `PLATFORM_PAYSECUREHUB_MODE`,
  `config/env.ts:108`).
- **Specs voisines** : 026 (espace particulier en libre-service et palier
  gratuit, **non fusionnée** : branche `claude/lucid-bell-0pzfvc`) — elle
  ajoute `TenantType.PARTICULIER`, les packs `PARTICULIER_GRATUIT` (0 F) et
  `PARTICULIER_PLUS` (2 900 F HT) et une capacité `ACTIFS` ; 027 (clôture
  d'exercice Syndic, branche `docs/spec-syndic-cloture-exercice`) : sans lien,
  cite seulement la numérotation.
- **PR en vol** : #61 `feat/copilot-openrouter` (fournisseur `openrouter`,
  `PlatformAiSettings`, `getLlmProvider()` asynchrone), **non fusionnée**.
  Cette spec ne la suppose pas fusionnée ; l'ordre de fusion est en §11 et Q20.
- **Numérotation** : le numéro 028 est libre au 29/09/2026 (`ls specs` sur
  `main` ; 023 à 026 dans les branches Patrimoine, 027 dans la branche de la
  clôture d'exercice).
- **Inventaire des fonctionnalités** : à mettre à jour à la livraison de
  chaque lot (§12), pas maintenant.

## 2. Contexte et problème

### 2.1 Ce que fait aujourd'hui l'assistant et la facturation (vérifié dans le code, `main` `6c454886`)

| Domaine                   | État réel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Une « requête » IA        | Un `POST /api/tenants/:tenantId/ai/chat` en flux SSE : `chatHandler` (`controllers/ai-controller.ts:103-136`) puis `runChat` (`lib/ai/orchestrator.ts:108`). L'orchestrateur boucle jusqu'à `AI_MAX_TOOL_ROUNDS` = 4 tours d'outils (`:172`), donc **jusqu'à 5 appels au modèle**, et 8 appels d'outils (`:39`). Le `requestId` est un UUID généré par le serveur (`ai-controller.ts:129`). `POST /ai/actions/execute` (`:145-150`) ne joint pas le modèle : il génère un document depuis un jeton signé à usage unique.                                                                                      |
| Traçage                   | Uniquement `AuditLog` par `logAuditEvent` : une **file en mémoire** vidée toutes les 5 s ou à 100 entrées (`services/audit-service.ts:12-13`), **pas un registre de facturation**. Clés `AI_CHAT_TURN` (`orchestrator.ts:210-228` : `requestId`, `provider`, `outcome`, `rounds`, `toolCalls`, `messageCount`, `durationMs`), `AI_TOOL_*`, `AI_PROPOSAL_*`, `AI_ACTION_*` (`types/audit-types.ts:119-125`). **Aucune table d'usage, aucun compteur de jetons, aucun coût, aucun modèle tracé.**                                                                                                               |
| Fournisseurs              | `LlmTurnResult` (`lib/ai/contracts.ts:249-253`) ne porte pas d'usage. L'adaptateur Anthropic lit `stream.finalMessage()` (`anthropic-provider.ts:179`) puis construit la réponse **sans** `message.usage` ni `message.model` (`:182-188`), alors que le SDK 0.129.0 les fournit (`BetaUsage` : jetons d'entrée, de sortie, de cache lu et écrit). Un repli serveur (`fallbacks: 'default'`, `:155`) peut faire servir un autre modèle que celui demandé.                                                                                                                                                      |
| Modèle et coût par défaut | `AI_MODEL` vaut `claude-opus-5-5` (`config/env.ts:139`), `AI_MAX_OUTPUT_TOKENS` 16 000 (`:141`). L'invite système est une chaîne simple, **sans balise de cache** (`anthropic-provider.ts:145`) : aucun cache de prompt n'est actif.                                                                                                                                                                                                                                                                                                                                                                          |
| Limiteurs de débit        | Chat 20 par minute et 300 par jour par utilisateur et agence (`middleware/rate-limit-middleware.ts:268-296`), plafond par agence `AI_TENANT_MINUTE_LIMIT` et `AI_TENANT_DAILY_LIMIT` (`:311-339`), confirmations 10 par minute (`:342`). **Compteurs en mémoire, par instance d'API** : inutilisables comme quota facturable.                                                                                                                                                                                                                                                                                 |
| Activation                | `requireAiAssistantAccess` (`middleware/ai-access-middleware.ts:29-48`) refuse le super-admin, les non-collaborateurs et les clients de portail, et répond 503 `AI_DISABLED` sans fournisseur. **Aucun interrupteur IA par agence.** Chaîne des routes : `routes/ai-routes.ts:32-40`. `/ai/chat` est classé « écriture qui n'en est pas une » (`lib/subscription/route-features.ts:189`) : il reste permis à une agence en lecture seule.                                                                                                                                                                     |
| Catalogue et abonnement   | `DEFAULT_CATALOG` (`lib/subscription/catalog.ts`) : AGENCE 29 900, SYNDIC 49 900, PROMOTEUR 149 900, INTEGRE 249 900, PATRIMOINE_ESSENTIEL 9 900, PATRIMOINE_PRO 29 900 ; extensions EXT_LOTS_10 1 500, EXT_COPRO 10 000, EXT_CHANTIER 40 000, EXT_BIENS_10 9 900 (HT par mois). `CapacityKey` : LOTS, COPROPRIETES, CHANTIERS, BIENS_DETENUS (`schema.prisma:102-107`). `Subscription.quotaPolicy` BLOCK, BILL_OVERAGE (défaut) ou WARN_ONLY (`:1017`). Essai de 30 jours, grâce de 7 jours d'**impayé**, annuel = 11 mois (`catalog.ts:55-59`).                                                             |
| Consommation              | Les capacités sont des **stocks** : `UsageSnapshot` garde le pic quotidien (`schema.prisma:1301`), `computeCapacityLimits` somme des capacités de packs et d'extensions (`lib/subscription/entitlements.ts:157-182`), `computeOverageLines` facture le dépassement d'un stock (`lib/subscription/pricing.ts:273-330`). `QuotaAlert` porte les alertes 80 et 100 % (`jobs/subscription-usage-job.ts:53`). Aucun de ces mécanismes ne sait compter un **flux mensuel**.                                                                                                                                         |
| Extensions                | **Pas en libre-service** : l'agence envoie une `SubscriptionExtensionRequest`, le super-admin ajoute l'élément (`routes/tenant-routes.ts:118-129`, `routes/admin-routes.ts:123`). Un achat de pack par l'agence n'existe pas.                                                                                                                                                                                                                                                                                                                                                                                 |
| Factures et paiement      | `Invoice` (natures `PERIOD`, `OVERAGE`, `CREDIT_NOTE`, `schema.prisma:86-90`), `InvoiceLine` dont le type `USAGE` (`:138`) n'est produit par aucun code (il n'apparaît que dans les types et l'ordre d'affichage, `platform-invoice.ts:64`), numérotation `IMT-AAAA-NNNNN` (`platform-invoice-service.ts:116`), `settlePlatformInvoiceTx` comme porte unique du règlement (`platform-payment-service.ts:175-223`), **un seul paiement par facture** (`invoiceId` unique de `PlatformInvoicePayment`), PaySecureHub et constat manuel. **Aucun prépaiement, crédit ni portefeuille n'existe côté plateforme.** |
| Interface                 | Agence : `pages/tenant/TenantSubscriptionSettings.tsx` (carte « Consommation » à jauges, `:228-257`, factures, demande d'extension). Super-admin : `components/admin/tenant-detail/SubscriptionTab.tsx`. Assistant : `components/copilot/CopilotDrawer.tsx` alimenté par `GET /ai/status` (`CopilotStatus`, `apps/web/src/types/copilot.ts:117-123`).                                                                                                                                                                                                                                                         |
| Multi-tenant              | Le compteur est **par agence** ; l'utilisateur ne sert qu'aux statistiques. Aucun `TenantType` particulier sur `main` (`AGENCY`, `OPERATOR`, `schema.prisma:19-22`) : les particuliers sont des agences ordinaires avec les packs PATRIMOINE_* ; la spec 026 prévoit un type dédié.                                                                                                                                                                                                                                                                                                                           |

### 2.2 Le problème

L'assistant appelle un fournisseur **payant à chaque message**, et personne ne
sait combien : ni le nombre de messages par agence, ni les jetons, ni le coût,
ni le modèle réellement servi. Seuls des plafonds de débit en mémoire, par
instance, bornent la dépense — ils protègent contre l'emballement, pas contre
l'usage soutenu d'une agence qui ne paie rien pour l'IA. Le modèle par défaut
est le plus cher de la gamme, sans cache de prompt.

La demande de l'utilisateur : **dix requêtes IA gratuites par mois, le reste
facturé, et des packs IA à souscrire.** Aujourd'hui rien de cela ne peut se
faire : pas de mesure, pas de solde, pas de contrôle avant l'appel, pas de
pack IA dans le catalogue, pas d'achat en libre-service, pas de facturation à
l'usage, pas de prépaiement.

**Objectif.** Mesurer chaque requête, tenir un solde de crédits par agence,
refuser proprement quand il est vide, offrir trois façons d'en obtenir plus
(pack mensuel, dépassement plafonné, recharge prépayée) qui **réutilisent les
factures et les paiements existants**, et donner au super-admin le tableau de
marge qui permet de fixer les prix d'après des coûts **mesurés**, pas
supposés.

## 3. Périmètre

**Dans le périmètre**

- Mesure de chaque requête : agence, utilisateur, fournisseur, modèle servi,
  jetons, coût, issue (lot A).
- Portefeuille de crédits par agence (lots, journal en ajout seul),
  réservation atomique, dix requêtes gratuites par mois, remise à zéro
  mensuelle, contrôle avant le modèle, interrupteur IA par agence, jauge dans
  l'assistant (lot B).
- Packs IA mensuels du catalogue et achat en libre-service par l'administrateur
  de l'agence (lot C).
- Dépassement facturé : opt-in, plafond mensuel, alertes 80 et 100 %, facture
  mensuelle séparée (lot D).
- Recharges prépayées : achat, paiement en ligne, crédits ajoutés au règlement,
  validité de 12 mois (lot E).
- Écran « Assistant IA » de l'agence, vues et dérogations du super-admin,
  tableau de marge, table de prix des modèles, alertes et e-mails.
- Permissions, audit, i18n (fr, en, ar).

**Hors périmètre** (décisions à confirmer, §14)

- **Modèle « expert » à 3 crédits** : la structure (`credit_cost`,
  `allocations`) le permet, mais ni le choix du modèle par l'utilisateur ni
  le poids ne sont livrés (D3, Q3).
- **Facturation de l'exécution d'un document** (`/ai/actions/execute`) : gratuite.
- **Remboursement du non-consommé** : jamais (D4), sauf erreur de facturation
  (FR-084).
- **Remboursement partiel d'une recharge** : hors V1 (Q22).
- **Écritures comptables** du produit constaté d'avance des recharges
  **[À VALIDER — expert-comptable]** (Q10) : la spec fournit les données, pas
  les écritures.
- **Assistant pour le super-admin** ou pour les clients de portail : inchangé
  (refusés).
- **Persistance des conversations, contenu des messages** : jamais stockés.
- **Autre monnaie que le FCFA** ; **TVA hors 18 %** (Q9).
- **Offre IA dédiée aux particuliers** (pack moins cher) : question ouverte
  (Q14), pas livrée par défaut.
- **Changement de fournisseur ou du comportement de l'assistant** : voir 022
  et la PR #61.

## 4. Choix par défaut de cette spécification (réversibles)

Toutes ces lignes sont **[Par défaut — à valider]** : ce sont les
recommandations de la demande, retenues faute de réponse. Les alternatives et
qui tranche sont en §14.

| #   | Choix **[Par défaut — à valider]**                                                                                                                                                                                                                                                                                                                                                              | Alternatives |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| D1  | **Portée du gratuit** : réserve unique de l'agence = 10 requêtes × nombre de collaborateurs actifs, **plafonnée à 100** ; un particulier (espace à un seul membre) a 10. Jamais reportée.                                                                                                                                                                                                       | Q1           |
| D2  | **« Le reste facturé »** : pack d'abord, puis recharge ; le **dépassement n'est facturé que si l'agence l'a activé (opt-in)**, avec un **plafond mensuel en montant** et des alertes à 80 et 100 % ; sans opt-in, blocage à zéro avec invitation à acheter. Pas de facturation après coup sans plafond (facture surprise).                                                                      | Q2           |
| D3  | **Une requête** = un message envoyé à l'assistant = **1 crédit**. Un échec du fournisseur avant réponse n'est pas facturé ; la confirmation d'un document est gratuite ; un abandon par le client en cours de flux est facturé **si au moins un fragment de réponse a été émis**. Un modèle « expert » à 3 crédits est une option future, non livrée.                                           | Q3           |
| D4  | **Reports et expiration** : gratuit, offert et packs mensuels expirent le 1er du mois suivant à 00:00 UTC (Abidjan = UTC) ; recharges valables 12 mois ; **aucun remboursement du non-consommé** (cohérent avec D7 des abonnements).                                                                                                                                                            | Q4           |
| D5  | **Modèle par défaut** : passer à un modèle rapide avec cache de prompt ; l'expert reste une option. Aujourd'hui le défaut est `claude-opus-5-5`, le plus cher (§7.3).                                                                                                                                                                                                                           | Q5           |
| D6  | **Prix de départ** (HT, FCFA) : Pack 100 = 9 900 par mois ; Pack 500 = 39 900 ; Pack 2 000 = 129 900 ; dépassement 120 F la requête ; recharge de 100 crédits = 12 900 (12 mois) ; TVA 18 % en sus. **Hypothèses à mesurer au lot A ; aucun prix figé avant deux semaines de données** (§7).                                                                                                    | Q6, Q8, Q13  |
| D7  | **Mode de contrôle propre à l'IA** (`AiBillingMode` : `OFF` mesure seule, `SHADOW` portefeuille tenu sans jamais bloquer, `ENFORCE`), réglé par le super-admin **en base**, **indépendant de `SUBSCRIPTION_ENFORCEMENT`**. Précédent : la garde du palier gratuit de la spec 026, indépendante du mode global. `SUBSCRIPTION_ENFORCEMENT` garde son rôle pour les phases d'abonnement (FR-033). | Q7           |
| D8  | **Panne d'écriture** : _fail-closed avant le modèle_ (en `ENFORCE`, si la réservation échoue : 503 `AI_BILLING_UNAVAILABLE`, aucun appel au fournisseur), _fail-open après la réponse_ (la réponse livrée n'est jamais remise en cause ; reprise en file, puis balayeur).                                                                                                                       | Q18          |
| D9  | **Période de crédits** : mois calendaire UTC, quel que soit le cycle de l'abonnement.                                                                                                                                                                                                                                                                                                           | Q17          |
| D10 | **Un seul pack IA actif par agence** ; montée immédiate au prorata, descente à l'échéance (D7 des abonnements) ; **pas de pack IA pendant l'essai** (les recharges, payées d'avance, restent permises) ; retiré avec son pack de base.                                                                                                                                                          | Q14          |
| D11 | **Recharge** : la facture reste en **brouillon jusqu'au règlement**, est numérotée et passée « payée » **au règlement**, et les crédits sont ajoutés dans la même transaction. Un paiement abandonné ne laisse ni numéro consommé ni facture émise.                                                                                                                                             | Q16          |
| D12 | **Dépassement** : une **facture mensuelle séparée** par agence (`AI_USAGE`), pour tous les cycles, émise le mois suivant ; impayée à l'échéance, elle **suspend le dépassement** (jamais l'abonnement).                                                                                                                                                                                         | Q15, Q23     |
| D13 | **Portefeuille à lots et journal en ajout seul**, consommation par rang (gratuit, offert, pack, recharge, dépassement) ; `AI_REQUESTS` est ajouté à l'enum `CapacityKey` mais **jamais à `CAPACITY_KEYS`** : un flux mensuel n'est pas un stock (plan §4.5.1).                                                                                                                                  | Q19          |
| D14 | **Prix et seuils en base** (`PlatformAiBillingSettings`, `AiTopupOffer`, catalogue), modifiables sans déploiement et sans migration ; aucune variable d'environnement nouvelle.                                                                                                                                                                                                                 | Q13          |
| D15 | **Garde-fous** : plafond dur mensuel par agence (5 000 requêtes par défaut), alerte de budget global du gratuit, plafond de jetons de sortie revu, interrupteur IA par agence ; les limiteurs de débit restent.                                                                                                                                                                                 | Q21          |
| D16 | **Coûts tenus en dollars** (`costUsd`, source de vérité) ; le FCFA (`costXof`) se déduit d'un taux saisi par le super-admin. Aucun tarif de fournisseur n'est amorcé par la spec.                                                                                                                                                                                                               | Q8           |

## 5. Rôles et parcours

### 5.1 Rôles

| Rôle                                                        | Ce qu'il fait                                                                                                                                                                          | Permissions (existantes)                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Collaborateur (agent, gestionnaire)                         | Pose des questions à l'assistant ; voit la jauge « requêtes IA ce mois » ; s'il n'y a plus de crédit, est invité à contacter son administrateur.                                       | Accès collaborateur ; aucune permission dédiée (`requireAiAssistantAccess`)             |
| Gestionnaire (`TENANT_MANAGER`)                             | Voit l'écran « Assistant IA » : solde, historique d'usage, factures liées.                                                                                                             | `TENANT_SETTINGS_VIEW`                                                                  |
| Administrateur de l'agence (`TENANT_ADMIN`)                 | Achète et change le pack IA, achète une recharge, active le dépassement et fixe son plafond, allume ou éteint l'assistant pour l'agence.                                               | `TENANT_SETTINGS_EDIT` (que seul `TENANT_ADMIN` détient au seed, `rbac-seed.ts:39,222`) |
| Super-administrateur                                        | Règle le mode, les prix des modèles, le gratuit, le dépassement ; accorde des crédits offerts ; suit la marge ; force une coupure ; dérogations par agence. N'utilise pas l'assistant. | `PLATFORM_SUBSCRIPTIONS_VIEW` / `_EDIT`, `requireSuperAdmin` pour le réglage global     |
| Particulier (espace à un seul membre)                       | Même parcours que l'administrateur d'agence, avec une réserve gratuite de 10 ; **aucune règle spécifique dans le code**.                                                               | idem administrateur                                                                     |
| Client de portail (locataire, propriétaire, copropriétaire) | N'a pas accès à l'assistant : aucun crédit ne lui est débité.                                                                                                                          | —                                                                                       |

Séparation des tâches : acheter, activer le dépassement ou allumer l'assistant
exige `TENANT_SETTINGS_EDIT`, que ni un collaborateur ni un gestionnaire ne
détient. Le réglage global (mode, prix, taux de change) n'est jamais délégué :
double garde `requirePermission` puis `requireSuperAdmin`, comme le réglage de
fournisseur de la PR #61.

### 5.2 Parcours

**P1 — Poser une question** (collaborateur)

1. Le collaborateur ouvre l'assistant : une jauge « 7 requêtes sur 30 restantes
   ce mois — remise à zéro le 1er octobre » s'affiche (mode `ENFORCE`).
2. Il envoie un message. Le serveur réserve un crédit, appelle le modèle,
   diffuse la réponse, puis règle le crédit (consommé) à la fin.
3. À zéro sans pack ni dépassement : la réponse est un refus JSON typé **avant**
   tout flux ; la saisie est conservée ; l'administrateur voit « Acheter des
   requêtes », les autres « Contactez votre administrateur ».

**P2 — Acheter un pack IA** (administrateur)

Écran « Assistant IA » › Packs › choisir Pack 100, 500 ou 2 000 › confirmation
du prix HT, TVA et prorata du mois › l'élément d'abonnement est ajouté et lié
au pack de base ; les crédits du mois arrivent tout de suite (prorata), puis
chaque 1er du mois. Refusé pendant l'essai.

**P3 — Autoriser le dépassement** (administrateur)

Écran › Dépassement › activer › saisir un **plafond mensuel en FCFA HT**
(obligatoire, borné) › l'écran affiche l'équivalent en requêtes (plafond ÷ 120).
Alertes à 80 et 100 % du plafond ; à 100 %, retour au blocage. La facture du
mois arrive le mois suivant, pas avant.

**P4 — Recharger** (administrateur)

Écran › Recharger › « 100 requêtes — 12 900 F HT (15 222 F TTC), valables 12
mois » › paiement mobile money par PaySecureHub (ou constat manuel par
ImmoTopia) › au règlement confirmé par rapprochement serveur, la facture est
numérotée et les crédits s'ajoutent.

**P5 — Suivre la marge** (super-admin)

Vue globale : requêtes par source, revenu imputé, coût fournisseur, marge
brute, crédits expirés (casse), usage incomplet, modèles sans tarif. Vue par
agence : solde, historique, journal, crédits offerts avec motif, dérogations,
coupure forcée. Table de prix des modèles et taux de change.

**P6 — Particulier** (espace à un seul membre)

Il reçoit 10 requêtes par mois, voit la même jauge, et n'a que la recharge ou
un pack pour aller plus loin. Son parcours ne diffère de P1 à P4 que par sa
réserve gratuite.

**P7 — Fin de mois** (système)

À 00:00 UTC, les crédits mensuels du mois écoulé cessent d'être valides (le
solde ne dépend pas de la tâche : un filtre de date suffit) ; les lots du mois
suivant se créent à la première requête. La tâche horaire écrit les écritures
d'expiration, libère les réservations orphelines et lève les alertes ; à 02:45
UTC, la tâche quotidienne facture le dépassement du mois écoulé.

## 6. Exigences fonctionnelles

Chaque exigence est numérotée (FR) et se rattache à des critères
d'acceptation (CA, §10) et à un lot livrable (A à E, [plan.md](./plan.md)).

### 6.1 Requête IA, mesure et idempotence

- **FR-001** Une **requête IA** est un `POST /api/tenants/:tenantId/ai/chat`
  accepté (authentification, garde d'accès, limiteurs de débit et contrôle des
  crédits passés) et qui atteint l'orchestrateur. Elle vaut **un événement**,
  quel que soit le nombre de tours du fournisseur (jusqu'à 5) et d'appels
  d'outils (jusqu'à 8). Son identité est le `requestId` généré par le serveur.
- **FR-002** **Ne sont pas des requêtes** : `GET /ai/status`, `POST
/ai/actions/execute` (aucun appel au modèle : gratuit), ni une requête
  refusée avant l'orchestrateur (400, 401, 402, 403, 429, 503). Elles ne
  créent aucun événement et ne débitent aucun crédit.
- **FR-003** Chaque requête qui atteint l'orchestrateur écrit un
  **`AiUsageEvent`** dans une **table dédiée**, avec `await`, **jamais** dans la
  file de `logAuditEvent` (en mémoire, vidée toutes les 5 s ou à 100 entrées :
  un arrêt du processus la perd). Lot A : écrit à la fin de `runChat`, avant
  l'audit `AI_CHAT_TURN`. Dès le lot B : créé à la réservation, réglé à la fin.
- **FR-004** Contenu de l'événement : agence, utilisateur, `requestId`,
  fournisseur, **modèle réellement servi**, jetons d'entrée, de sortie, de cache
  lu et de cache écrit, coût en dollars et en FCFA avec sa source, nombre
  d'appels au fournisseur, de tours et d'appels d'outils, durée, issue
  (`end_turn`, `max_rounds`, `aborted`, `error`, `refusal`), code d'erreur,
  indicateur d'usage complet, mois de la requête. **Jamais** le texte d'un
  message ou d'une réponse, le contexte d'écran, un résultat d'outil ou
  l'adresse IP.
- **FR-005** `LlmTurnResult` reçoit un champ **`usage` facultatif** :
  Anthropic le lit dans `message.usage` et `message.model` (aujourd'hui jetés),
  OpenRouter dans l'usage et le coût du flux (après la fusion de la PR #61 ;
  le format exact est à confirmer par lecture de la documentation du
  fournisseur au lot A, non supposé ici), le faux fournisseur renvoie un usage
  déterministe pour les tests. L'orchestrateur **cumule** les tours d'une
  requête.
- **FR-006** **Usage partiel ou absent** : si un tour ne rapporte aucun usage
  (flux coupé par le client, fournisseur muet, délai dépassé), l'événement porte
  `usage_complete = false` ; le coût est calculé sur les tours connus, ou reste
  inconnu (`UNKNOWN`) s'il n'en reste aucun. La requête est comptée dans tous
  les cas. Le nombre d'événements à usage incomplet est visible du super-admin.
- **FR-007** **Idempotence** : `request_id` est unique. Une seconde écriture
  pour le même identifiant (reprise interne, balayeur) **met à jour** l'événement
  et ne le duplique jamais. Un nouvel envoi du même message par le client est une
  **nouvelle requête** (nouveau `requestId`, nouvelle réservation) : aucun
  dédoublonnage côté client n'est tenté (E-12).
- **FR-008** **Coût** : calculé à partir du tarif du modèle en vigueur
  (`AiModelPrice`, version à effet daté) : `(entrée × tarif entrée + cache lu ×
tarif cache lu + cache écrit × tarif cache écrit + sortie × tarif sortie) /
1 000 000` en dollars, ou coût rapporté par le fournisseur quand il existe.
  Le tarif employé (`model_price_id`) et le taux de change sont mémorisés ;
  un coût passé n'est **jamais recalculé** quand un tarif change.
- **FR-009** Les jetons et les coûts ne sont visibles que du super-admin : les
  routes d'agence ne renvoient que des nombres de requêtes et de crédits.

### 6.2 Portefeuille de crédits

- **FR-010** Chaque agence a un **portefeuille** : un ensemble de lots
  (`AiCreditGrant`) de source `MONTHLY_FREE`, `PACK_MONTHLY`, `ADMIN_GRANT` ou
  `TOPUP`, chacun avec sa quantité, son restant, sa validité et son lien avec
  l'élément d'abonnement ou la facture d'origine.
- **FR-011** Le **journal** `AiCreditLedger` est en **ajout seul** : entrées
  `GRANT`, `RESERVE`, `CONSUME`, `RELEASE`, `EXPIRE`, `REFUND`, `ADJUST`. Aucune
  ligne n'est modifiée ni supprimée ; la somme des variations d'un lot égale son
  restant (I-2).
- **FR-012** **Ordre de consommation** : (1) `MONTHLY_FREE`, (2) `ADMIN_GRANT`,
  (3) `PACK_MONTHLY`, (4) `TOPUP`, puis le dépassement s'il est permis. À rang
  égal : l'expiration la plus proche d'abord, puis la création la plus ancienne.
  On brûle d'abord ce qui expire le plus tôt et ce qui ne coûte rien.
- **FR-013** Le **solde** est la somme des restants des lots valides (non
  expirés, `valid_from` atteint). Un restant ne devient **jamais négatif**
  (contrainte de base).
- **FR-014** Le solde affiché à l'agence détaille : gratuit, offert, pack,
  recharge, total, requêtes en cours (réservées), consommé et alloué du mois, date
  de remise à zéro (1er du mois suivant à 00:00 UTC) et prochaine expiration de
  recharge.
- **FR-015** L'unité est le **crédit entier**. Une requête vaut 1 crédit
  (`credit_cost`, toujours 1 en V1 ; l'option « modèle expert = 3 crédits » est
  hors des lots A à E, la structure la permet).
- **FR-016** Chaque lot mémorise sa **valeur unitaire** HT (`unit_value_xof` :
  prix mensuel du pack, net de remise et, en cycle annuel, ramené au mois
  (× 11 ÷ 12), rapporté à ses crédits ; prix de la recharge rapporté à ses
  crédits ; 0 pour le gratuit et l'offert) ; l'événement la recopie au règlement.
  Elle alimente le tableau de marge (§7) sans jamais changer avec le catalogue.
- **FR-017** Les lots mensuels sont créés **paresseusement** (à la première
  requête ou lecture du mois, `ensureMonthlyGrantsTx`), de façon idempotente par
  contraintes d'unicité ; aucun lot ne dépend d'une tâche planifiée (celle de
  l'abonnement ne traite d'ailleurs que les abonnements vivants).
- **FR-018** Un lot ne se modifie que par une écriture de journal (jamais un
  `UPDATE` de `remaining` sans ligne correspondante).
- **FR-019** Tout accès est **filtré par `tenantId`**, y compris dans les
  requêtes SQL brutes de la réservation.

### 6.3 Réservation, concurrence et règle de facturation d'une requête

- **FR-020** **Réservation atomique avant l'appel au modèle** : une transaction
  courte, sous verrou consultatif propre à l'agence
  (`withTransactionalAdvisoryLock('ai-credits:<tenantId>')`), choisit le lot selon
  FR-012, décrémente son restant, écrit `RESERVE` et crée l'événement `RESERVED`.
  La réservation a lieu **après** la validation du corps et la résolution des
  outils, **juste avant** l'ouverture du flux (plan §4.4).
- **FR-021** **Aucun dépassement du solde sous concurrence** : N requêtes
  simultanées sur un solde de K ne produisent **exactement K** réservations ; les
  autres reçoivent le refus typé.
- **FR-022** **Règle de consommation**, appliquée à la fin de `runChat` : le
  crédit est **consommé** (`CONSUME`) si l'issue est `end_turn` (réponse complète
  livrée) ou si le client est parti (`aborted`) **après au moins un fragment de
  réponse émis** ; il est **libéré** (`RELEASE`) dans tous les autres cas :
  `error` (fournisseur indisponible, délai, réponse tronquée), `refusal`,
  `max_rounds`, abandon avant tout texte. Le **coût fournisseur** des requêtes
  libérées est enregistré quand même (il alimente la marge).
- **FR-023** Un crédit libéré dont le lot a **expiré** entre-temps n'est pas
  restitué (crédit périmé, E-02).
- **FR-024** **Réservations orphelines** : un balayeur passe en `EXPIRED` et
  libère toute réservation plus vieille que `stuckReservationMinutes` (15 par
  défaut), quand le processus a disparu entre la réservation et le règlement.
  Aucune facture n'est calculée sur un mois où il en reste (I-6).
- **FR-025** Une erreur **avant l'ouverture du flux** (corps invalide 400, aucun
  outil disponible 403, contexte d'écran) **ne laisse aucune réservation** : la
  réservation suit ces validations et le contrôleur relâche en `finally`.
- **FR-026** Les limiteurs de débit restent en place et **en amont** de la
  réservation (429 `RATE_LIMITED`) ; ils ne sont pas un quota facturable (E-14).
- **FR-027** Une requête consomme **au plus** son `credit_cost`, quel que soit
  le nombre de tours ou d'appels d'outils ; les plafonds de tours (4) et d'outils
  (8) ne changent pas.
- **FR-028** **Ordre des garde-fous** dans `routes/ai-routes.ts` : authentification
  et accès agence, garde de l'assistant, limiteurs de débit (429), puis
  `requireAiQuota` (403, 402, 503), puis le contrôleur (validation, réservation,
  flux).
- **FR-029** Le **mode** en vigueur à la réservation est mémorisé sur
  l'événement : changer de mode pendant qu'une requête est en vol ne change ni
  son règlement ni sa libération (E-15).

### 6.4 Contrôle avant le modèle, interrupteur et modes

- **FR-030** Un middleware **`requireAiQuota`**, placé après
  `aiTenantDailyLimiter`, charge les réglages de l'agence et le mode de la
  plateforme, applique l'**interrupteur IA** (FR-035) et, en `ENFORCE`, un
  **pré-contrôle sans effet de bord** du solde. La réservation atomique reste
  celle du contrôleur (FR-020) ; les deux répondent par les mêmes erreurs.
- **FR-031** **Erreurs typées, en JSON, avant tout flux SSE** (aucun événement
  `event-stream` n'a été ouvert) :

  | Statut | Code                       | Quand                                                                                                                                                     |
  | ------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 402    | `AI_CREDITS_EXHAUSTED`     | Solde nul et dépassement non permis (`data.reason` : `NO_CREDITS`, `OVERAGE_NOT_ENABLED`, `OVERAGE_SUSPENDED_UNPAID`, `POLICY_BLOCK`, `PHASE_RESTRICTED`) |
  | 402    | `AI_OVERAGE_CAP_REACHED`   | Dépassement activé mais plafond mensuel atteint                                                                                                           |
  | 403    | `AI_TENANT_DISABLED`       | Assistant éteint pour l'agence (par elle ou par la plateforme, `data.by`)                                                                                 |
  | 429    | `AI_MONTHLY_LIMIT_REACHED` | Plafond dur mensuel de la plateforme atteint (FR-037)                                                                                                     |
  | 429    | `RATE_LIMITED`             | Limiteurs de débit existants, inchangés                                                                                                                   |
  | 503    | `AI_BILLING_UNAVAILABLE`   | Réservation impossible en `ENFORCE` (D8, FR-120)                                                                                                          |
  | 503    | `AI_DISABLED`              | Aucun fournisseur (existant, inchangé)                                                                                                                    |

  Le corps `data` des 402 porte : solde par source, date de remise à zéro,
  `canPurchase` (l'utilisateur détient `TENANT_SETTINGS_EDIT`), `purchasePath`
  (chemin relatif de l'écran « Assistant IA »), et l'état du dépassement.

- **FR-032** **Trois modes** (`AiBillingMode`, réglage plateforme, défaut `OFF`
  tant que le super-admin n'a rien écrit), indépendants de
  `SUBSCRIPTION_ENFORCEMENT` :

  | Comportement                                   | `OFF`                                | `SHADOW`                                                       | `ENFORCE`                            |
  | ---------------------------------------------- | ------------------------------------ | -------------------------------------------------------------- | ------------------------------------ |
  | Événement d'usage (mesure)                     | oui, source `UNBILLED`, aucun crédit | oui                                                            | oui                                  |
  | Portefeuille tenu, lots mensuels créés         | non                                  | oui                                                            | oui                                  |
  | Réservation avant le modèle                    | non                                  | oui, **jamais bloquante**                                      | oui                                  |
  | Solde à zéro                                   | sans objet                           | la requête passe, `source = UNBILLED`, `shadow_blocked = true` | 402 (ou dépassement s'il est permis) |
  | Interrupteur IA de l'agence (lot B)            | appliqué                             | appliqué                                                       | appliqué                             |
  | Jauge et solde dans `GET /ai/status`           | absents                              | absents (le super-admin les voit)                              | présents                             |
  | Achat de pack, recharge, opt-in du dépassement | refusés, 409 `AI_BILLING_NOT_ACTIVE` | refusés, 409 `AI_BILLING_NOT_ACTIVE`                           | permis                               |
  | Facture de dépassement                         | aucune                               | aucune                                                         | émise                                |
  | Alertes 80 et 100 % à l'agence                 | non                                  | non (le super-admin est prévenu)                               | oui                                  |
  | Plafond dur mensuel (FR-037)                   | non                                  | oui                                                            | oui                                  |
  | Panne de réservation (FR-120)                  | sans objet                           | fail-open                                                      | fail-closed avant le modèle          |

  Mise en service : `OFF` (lot A) → `SHADOW` (lot B, deux semaines
  d'observation) → `ENFORCE` (voir §11 : seulement quand un moyen d'acheter
  existe, ou avec le message « contactez ImmoTopia »).

- **FR-033** **`SUBSCRIPTION_ENFORCEMENT` et les phases d'abonnement.** Le mode
  d'abonnement ne décide pas du solde (c'est `AiBillingMode`) ; il décide quelles
  **sources** sont utilisables selon la phase (`resolveSubscriptionPhase`) :

  | Phase de l'abonnement                                                                      | Gratuit | Offert | Pack                             | Recharge | Dépassement                          |
  | ------------------------------------------------------------------------------------------ | ------- | ------ | -------------------------------- | -------- | ------------------------------------ |
  | `TRIAL`                                                                                    | oui     | oui    | sans objet (aucun pack en essai) | oui      | non (aucune facture pendant l'essai) |
  | `ACTIVE`                                                                                   | oui     | oui    | oui                              | oui      | selon FR-062                         |
  | `GRACE` (impayé depuis moins de 7 jours)                                                   | oui     | oui    | oui                              | oui      | non                                  |
  | `READ_ONLY` (impayé après grâce, résilié échu, suspendu, lecture seule manuelle) ou `NONE` | oui     | oui    | non                              | oui      | non                                  |

  `enforce` : le tableau s'applique. `warn` : il est évalué, le refus qui
  _aurait_ eu lieu est journalisé et compté (compteur de garde d'abonnement), la
  requête passe. `off` : non évalué. Les autres conditions du dépassement
  (opt-in, plafond, politique, facture impayée) ne dépendent **pas** de ce mode.

- **FR-034** **`quotaPolicy` de l'agence** appliquée à l'IA : `BLOCK` — jamais de
  dépassement même activé ; `BILL_OVERAGE` (défaut) — dépassement seulement avec
  opt-in ; `WARN_ONLY` — à zéro la requête passe, non facturée (`source =
UNBILLED`), avec alerte au super-admin ; réservé à des accords exceptionnels
  posés par le super-admin, le plafond dur (FR-037) reste la borne.
- **FR-035** **Interrupteur IA par agence** (`TenantAiSettings.aiEnabled`,
  défaut actif) : l'administrateur peut éteindre l'assistant de son agence ;
  le super-admin peut l'éteindre **de force** avec un motif (`platformDisabledAt`),
  ce que l'agence ne peut pas lever. Éteint : 403 `AI_TENANT_DISABLED` sur le
  chat, et `GET /ai/status` répond `enabled: false, reason: 'TENANT_DISABLED'`
  (le bouton flottant disparaît). S'applique dans tous les modes, dès le lot B.
- **FR-036** Une agence suspendue est déjà refusée par `requireTenantAccess`
  (403 `TENANT_SUSPENDED`) ; cette spec n'y touche pas. Une agence sans
  abonnement garde le gratuit (phase « aucune » du tableau FR-033).
- **FR-037** **Plafond dur mensuel** : au-delà de `hardMonthlyCap` requêtes par
  agence et par mois (5 000 par défaut, dérogation possible), la requête est
  refusée en 429 `AI_MONTHLY_LIMIT_REACHED`, quel que soit le solde, le
  dépassement ou `WARN_ONLY`. C'est la borne d'un abus, pas un produit.
- **FR-038** Le pré-contrôle du middleware ne réserve rien et ne modifie rien ;
  il évite seulement de valider un corps pour un refus certain. En cas de doute
  (course), la réservation du contrôleur tranche.
- **FR-039** En `SHADOW`, le pré-contrôle et la réservation **ne bloquent
  jamais** ; ils enregistrent `shadow_blocked` pour mesurer combien de requêtes
  auraient été refusées.

### 6.5 Gratuit mensuel

- **FR-040** **Réserve gratuite** de l'agence pour le mois =
  `min(10 × collaborateurs actifs, 100)`, au minimum 10 (un particulier a 10).
  Un collaborateur actif est un membre `ACTIVE` d'utilisateur actif détenteur
  d'au moins un rôle de portée agence — la définition de
  `requireTenantAccess` (`middleware/tenant-middleware.ts:127-152`). Les 10 et
  le plafond de 100 sont des réglages (`freeCreditsPerMember`, `freeCreditsCap`).
- **FR-041** La réserve est calculée **au premier accès du mois**. Si de
  nouveaux collaborateurs actifs arrivent en cours de mois, elle **augmente**
  (écriture `ADJUST`) ; elle ne baisse jamais en cours de mois.
- **FR-042** Le gratuit **expire le 1er du mois suivant à 00:00 UTC** et ne se
  reporte pas.
- **FR-043** Dérogation super-admin par agence (`freeCreditsOverride`) : elle
  remplace la formule.
- **FR-044** Le gratuit est accordé à toute agence active, y compris pendant
  l'essai et en lecture seule (FR-033).
- **FR-045** Les paramètres du gratuit se modifient sans déploiement, avec un
  audit sans secret ; un changement s'applique à la **création du lot suivant**,
  jamais rétroactivement.
- **FR-046** Un lot gratuit et un lot de pack du même mois coexistent : la
  consommation suit FR-012.
- **FR-047** **Budget global du gratuit** : la plateforme compte les crédits
  gratuits consommés dans le mois ; au-delà de `freeBudgetMonthlyCredits`, le
  super-admin est alerté (e-mail, tableau de marge). Aucune coupure automatique.

### 6.6 Packs mensuels et achat

- **FR-050** Le catalogue reçoit trois **extensions** : `EXT_IA_100` (9 900 HT
  par mois), `EXT_IA_500` (39 900), `EXT_IA_2000` (129 900), de capacité
  `AI_REQUESTS` égale à 100, 500 et 2 000 par unité, avec
  `rules.requiresAnyOf` = tous les packs de base et `rules.aiPack = true`. Les
  prix sont ceux de D6 **[Par défaut — à valider]**.
- **FR-051** **Un seul pack IA actif** par agence (quantité 1). Changement :
  **montée** immédiate (avoir au prorata de l'ancien, prorata du nouveau, comme
  `changePack`), **descente** à l'échéance ; retrait à l'échéance sans
  remboursement (D7 des abonnements). À la montée, le **restant** du lot de
  l'ancien pack est **reporté** dans le lot du nouveau (écriture `ADJUST`) et
  l'ancien est clos : l'agence ne perd pas de crédits payés pour le mois (E-03).
- **FR-052** **Achat en libre-service** par l'administrateur de l'agence
  (`TENANT_SETTINGS_EDIT`), sans passer par le super-admin, par `addSubscriptionItem` :
  l'élément est **lié au pack de base** (`parentItemId`) et part avec lui.
- **FR-053** **Refus** de l'achat : 409 `AI_PACK_NOT_DURING_TRIAL` pendant
  l'essai (D10) ; 409 `AI_BILLING_NOT_ACTIVE` hors `ENFORCE` ; 409
  `AI_PACK_READ_ONLY` en lecture seule d'impayé (payer d'abord la facture
  en attente).
- **FR-054** **Crédits d'un pack** : un lot `PACK_MONTHLY` par mois calendaire
  tant que l'élément est en vigueur. Le mois de l'achat, le lot est
  **proratisé** : `ceil(crédits × jours restants du mois ÷ jours du mois)` ;
  chaque mois suivant, le lot est plein. Il expire à `min(fin du mois, fin de
l'élément)`.
- **FR-055** **Cycle annuel** : le pack IA est facturé avec la facture annuelle
  (mois facturés = 11, `ANNUAL_MONTHS`) et crédité **chaque mois**.
- **FR-056** **Remises** : aucune remise de combinaison ne s'applique à un pack
  IA (elle ne porte que sur les packs de base) ; la remise commerciale d'un
  élément (`discountPercent`) est libre mais le super-admin est **averti** quand
  le prix unitaire net passe sous `coût moyen mesuré × marginFloorMultiplier` (1,30
  par défaut) **[À VALIDER — utilisateur]** (§7.9).
- **FR-057** Le prix d'un pack est **figé** dans `SubscriptionItem.unitMonthlyPrice`
  à la souscription (D12 des abonnements) : modifier le catalogue ne change aucun
  abonnement en cours.
- **FR-058** Retirer le pack de base retire le pack IA à la même échéance
  (mécanisme `parentItemId` existant).
- **FR-059** Le super-admin garde les routes existantes (`POST` et `DELETE
/api/admin/tenants/:tenantId/subscription/items`) pour ajouter ou retirer un
  pack IA, y compris pendant l'essai ou en dérogation.

### 6.7 Dépassement facturé, plafond et alertes

- **FR-060** **Opt-in explicite** de l'administrateur (`overageEnabled`), avec
  un **plafond mensuel HT obligatoire** (`overageMonthlyCapXof`), borné par
  `overageCapMinXof` et `overageCapMaxXof` (1 000 et 500 000 par défaut), suggéré
  à 20 000. Désactivé par défaut. Sans plafond, l'activation est refusée (400).
- **FR-061** **Prix unitaire** : 120 F HT la requête par défaut
  (`overageUnitPriceXof`, dérogation par agence), **figé sur la requête** à la
  réservation (`overage_unit_price`) ; un changement de prix n'affecte que les
  requêtes suivantes.
- **FR-062** Un crédit de dépassement n'est réservé que si **toutes** ces
  conditions tiennent : (a) aucun crédit utilisable (solde nul, ou seules des sources que la phase
  n'autorise pas), (b) opt-in actif, (c) `(crédits de
dépassement du mois + 1) × prix ≤ plafond`, (d) `quotaPolicy = BILL_OVERAGE`,
  (e) aucune facture `AI_USAGE` de l'agence n'est en retard, (f) la phase le
  permet (FR-033), (g) le plafond dur n'est pas atteint. Sinon 402
  `AI_CREDITS_EXHAUSTED` ou, si seule (c) échoue, `AI_OVERAGE_CAP_REACHED`.
- **FR-063** **Alertes 80 et 100 %** : (1) de l'**allocation mensuelle**
  (gratuit + offert + packs du mois) — une ligne `QuotaAlert` de capacité
  `AI_REQUESTS`, une fois par seuil et par mois ; (2) du **plafond de
  dépassement** — deux horodatages de `AiUsageMonth`. E-mail aux administrateurs
  de l'agence et bandeau dans l'écran ; le super-admin est prévenu aux 100 %.
  Traitées par la tâche horaire, idempotentes entre instances.
- **FR-064** **Facturation** : le mois suivant, la tâche quotidienne (02:45
  UTC) émet **une facture par agence et par mois**, de nature `AI_USAGE`, avec
  des lignes `USAGE` groupées par prix unitaire (quantité × prix), TVA 18 %,
  échéance `PLATFORM_INVOICE_DUE_DAYS`, numérotation `IMT-AAAA-NNNNN`.
  **Idempotente** : `AiUsageMonth.overageInvoiceId` et l'index unique partiel.
- **FR-065** La règle est **la même en cycle mensuel et annuel** : ni intégrée
  à la facture de période, ni multipliée par 11 (contrairement au dépassement de
  capacité d'un abonnement annuel, `previewNextInvoice`,
  `subscription-v2-service.ts:1509-1517`).
- **FR-066** Une facture `AI_USAGE` **en retard** (`OVERDUE`) **suspend le
  dépassement** de l'agence : 402 `AI_CREDITS_EXHAUSTED`, `data.reason =
OVERAGE_SUSPENDED_UNPAID`. Le gratuit, le pack et la recharge restent
  utilisables ; l'abonnement, ses modules et son statut ne changent pas ; le
  paiement lève la suspension. C'est un **écart minimal** par rapport à D15 des
  abonnements (« dépassement impayé sans effet automatique ») **[À VALIDER —
  utilisateur]** (Q15).
- **FR-067** Un mois à dépassement **nul** n'émet aucune facture (`WAIVED`). En
  V1 tout montant strictement positif est facturé ; un seuil minimal de
  facturation avec report est une question ouverte (Q23).
- **FR-068** En `SHADOW` et `OFF`, aucun dépassement n'est facturé (les requêtes
  passent en `UNBILLED`).
- **FR-069** Le dépassement ne consomme aucun lot : il ne peut pas rendre un
  restant négatif ; il est compté dans `AiUsageMonth.overageCredits` (I-5).

### 6.8 Recharges prépayées

- **FR-070** **Offre** : `AiTopupOffer` (global, éditable par le super-admin) ;
  amorçage `AI_TOPUP_100` = 100 crédits pour 12 900 F HT, valables 12 mois
  **[Par défaut — à valider]**.
- **FR-071** **Achat en libre-service** par l'administrateur (`TENANT_SETTINGS_EDIT`) :
  la route crée une facture `AI_TOPUP` en **brouillon** (TVA 18 %, quantité 1 à
  10 offres) et **démarre le paiement en ligne** PaySecureHub
  (`startInvoiceCheckout`), ou renvoie les références pour un constat manuel du
  super-admin.
- **FR-072** **Crédits au règlement** : `settlePlatformInvoiceTx`, porte unique
  du règlement (IPN rapproché ou constat manuel), **numérote la facture, la passe
  « payée » et crée le lot `TOPUP` dans la même transaction**
  (`expires_at = règlement + 12 mois`). Rejouer un IPN ne crédite pas deux fois
  (unicité du lot par facture).
- **FR-073** **Aucun crédit avant règlement confirmé.** Le contenu d'une
  notification de paiement n'est jamais cru sur parole : la règle existante de
  rapprochement serveur-à-serveur s'applique (`docs/governance/SECURITY.md`).
- **FR-074** Une recharge **abandonnée, échouée ou annulée** ne laisse aucune
  facture émise ni aucun numéro consommé : le brouillon est purgé après 48 heures
  (D11, R-19).
- **FR-075** Une recharge est permise **pendant l'essai** et **en lecture seule**
  d'impayé (payée d'avance, avec de l'argent réel).
- **FR-076** Le règlement d'une recharge **n'a aucun effet sur la période
  d'abonnement** : `applyPaymentToSubscriptionTx` ne doit jamais renouveler un
  abonnement `PAST_DUE` à cause d'une facture sans période (R-10).
- **FR-077** Quantité par achat : 1 à 10 offres (au plus 1 000 crédits par
  transaction) ; hors bornes, 400.
- **FR-078** TVA de 18 % (`PLATFORM_TAX_RATE_PERCENT`). Le traitement d'un client
  étranger (diaspora, packs Patrimoine) **[À VALIDER — expert-comptable]** (Q9).
- **FR-079** **Pas de remboursement du non-consommé** (D4), sauf erreur de
  facturation (FR-083, FR-084).

### 6.9 Factures, TVA et corrections

- **FR-080** Trois flux **réutilisent** `Invoice` et `InvoiceLine` : (a) le
  **pack** est une ligne d'extension de la facture de période ; (b) le
  **dépassement** est une facture `AI_USAGE` de lignes `USAGE` ; (c) la
  **recharge** est une facture `AI_TOPUP` d'une ligne `USAGE`. Numérotation
  continue, émetteur Alliance Consultants, HT et TVA séparés, mentions
  figées à l'émission : inchangés.
- **FR-081** Le PDF et les libellés (`platform-invoice-pdf.ts:169`,
  `platform-invoice-labels.ts:18-20`, `InvoicesTab.tsx`) reconnaissent les deux
  natures ; les lignes indiquent la période et le **nombre de requêtes**, jamais
  d'information sur leur contenu.
- **FR-082** **Avoir sur une facture `AI_USAGE`** : `issueCreditNote` (limité
  aujourd'hui aux natures `PERIOD` et `OVERAGE`, `platform-invoice-service.ts:603`)
  l'accepte ; l'avoir annule la facture et **rouvre le mois** (`overageInvoiceId`
  effacé, mois `OPEN`) pour une refacturation corrigée.
- **FR-083** **Avoir sur une facture `AI_TOPUP`** (erreur de la plateforme) :
  autorisé **seulement si le lot n'a pas été entamé** ; l'avoir révoque alors le
  lot (écriture `REFUND` négative). Lot entamé : 409 avec la marche à suivre (le
  remboursement partiel est hors V1, Q22).
- **FR-084** **Erreur de comptage** (bogue de facturation) : la correction est
  une écriture `REFUND` ou `ADJUST` du journal (restitution de crédits) avec
  **motif obligatoire** et audit ; si le mois est déjà facturé, avoir puis
  refacturation (FR-082).
- **FR-085** Le super-admin restitue ou offre des crédits par une même route
  (`kind` : `GIFT` ou `REFUND`), avec motif (FR-101).
- **FR-086** La **reconnaissance du produit** des recharges non consommées
  (produit constaté d'avance) **[À VALIDER — expert-comptable]** : la spec fournit
  les données (lots, valeurs unitaires, consommation, casse) mais **aucune
  écriture comptable**.
- **FR-087** Les e-mails de facture existants (`sendPlatformInvoiceEmail`) sont
  réutilisés tels quels.
- **FR-088** Sur une facture `AI_USAGE`, les lignes `USAGE` s'affichent au rang 65
  déjà réservé par `KIND_ORDER`.
- **FR-089** Aucune facture n'est émise pour du gratuit ou de l'offert.

### 6.10 Expiration et remise à zéro

- **FR-090** À 00:00 UTC le 1er de chaque mois, les lots `MONTHLY_FREE`,
  `PACK_MONTHLY` et `ADMIN_GRANT` du mois écoulé cessent d'être valides **par le
  filtre de date du solde** ; les lots du mois se créent à la première requête
  (FR-017).
- **FR-091** Une **tâche planifiée** dédiée (`jobs/ai-credits-job.ts`) passe
  toutes les heures : écritures `EXPIRE` des lots échus, libération des
  réservations orphelines (FR-024), alertes (FR-063), purge des brouillons de
  recharge (FR-074), et, chaque jour à 02:45 UTC, la facturation du dépassement
  des mois échus (FR-064). Elle s'exécute dans un contexte d'agence
  (`runWithTenantContext`) et est **idempotente** entre instances.
- **FR-092** **Fuseau** : UTC (Abidjan est à UTC). Une requête réservée à
  23:59:59 relève du mois de sa réservation (`period_key` figé) même si elle se
  termine après minuit.
- **FR-093** Une recharge est **valable 12 mois** ; un e-mail prévient 30 jours
  avant son échéance, une seule fois **[Par défaut — à valider]**.
- **FR-094** Pas de report du non-consommé, pas de remboursement (D4).
- **FR-095** Durées de conservation de l'historique d'usage, du journal et des
  factures liées **[À VALIDER — juriste]** (Q11) : non fixées ici.

### 6.11 Super-administrateur

- **FR-100** **Vue par agence** : solde par source, consommation du mois et des
  mois précédents, journal, coûts et marge, état du dépassement, factures liées.
- **FR-101** **Crédits offerts** (`ADMIN_GRANT`) avec quantité, expiration (au
  plus 12 mois) et **motif obligatoire** ; audit ; visibles de l'agence comme
  source « offert ».
- **FR-102** **Dérogations par agence** : réserve gratuite, plafond dur mensuel,
  prix de dépassement, `quotaPolicy` (route d'abonnement existante), et
  **coupure forcée** de l'assistant avec motif.
- **FR-103** **Tableau de marge** : par mois, par agence, par source et par
  modèle : requêtes, revenu imputé HT (`unit_value_xof × crédits consommés`),
  coût fournisseur, marge brute, part d'usage incomplet, frais de passerelle
  réels des factures liées (`providerFees`), casse (crédits payés expirés).
- **FR-104** **Table de prix des modèles** versionnée (`AiModelPrice`) : jamais
  modifiée, une nouvelle ligne à effet daté par changement ; taux de change
  `usdToXofRate` dans le réglage plateforme.
- **FR-105** **Réglages plateforme** (`PlatformAiBillingSettings`) : mode,
  gratuit, plafond dur, budget du gratuit, prix et bornes du dépassement, plancher
  de marge, délai des réservations orphelines. Cache de 30 secondes, invalidé à
  l'écriture, audit sans secret.
- **FR-106** Le super-admin est refusé par l'assistant (existant) : aucun
  crédit ne lui est débité.
- **FR-107** **Export CSV** de l'usage d'une agence pour un mois (nombre de
  requêtes par jour et par utilisateur, jamais de contenu).
- **FR-108** **Alertes au super-admin** : modèle servi sans tarif, coût mensuel
  au-dessus d'un seuil, budget du gratuit dépassé, usage incomplet au-dessus de
  5 % des requêtes du mois, échecs d'écriture d'usage (FR-120).

### 6.12 Interface

- **FR-110** **Tiroir de l'assistant** : jauge « requêtes IA ce mois »
  (consommé sur alloué), solde total et date de remise à zéro, alimentés par
  `GET /ai/status` étendu (`credits`). Absents en `OFF` et `SHADOW`.
- **FR-111** **Blocage** : message clair, saisie désactivée mais **texte
  conservé** ; l'administrateur voit « Acheter des requêtes », les autres
  « Contactez votre administrateur » (`canPurchase`). Les codes de FR-031 sont
  tous traités.
- **FR-112** **Écran « Assistant IA »** de l'agence
  (`/tenant/:tenantId/settings/assistant-ia`, accessible depuis les réglages
  d'abonnement) : consommation du mois et jauge, solde par source, pack actuel et
  changement, recharge, dépassement (opt-in, plafond, équivalent en requêtes),
  interrupteur, historique par jour et par utilisateur, factures liées. Écran
  ouvert à une agence en lecture seule (préfixe `/subscription`, exempté).
- **FR-113** **Alertes** : lignes `QuotaAlert` lues par les écrans, e-mails aux
  administrateurs de l'agence à 80 et 100 %, bandeau dans l'écran et le tiroir.
- **FR-114** **i18n** : tous les libellés par `t()` (fr, en, ar), marges en
  propriétés logiques, montants formatés selon la langue, aucun
  `dangerouslySetInnerHTML`.
- **FR-115** En `SHADOW` l'agence ne voit **rien** de la facturation IA ; le
  super-admin voit les soldes et les blocages qui _auraient_ eu lieu.
- **FR-116** **Accessibilité** : la jauge expose `aria-valuenow`,
  `aria-valuemin`, `aria-valuemax` et un libellé ; un refus s'annonce en
  `role="alert"`.
- **FR-117** **Historique d'usage** de l'agence : nombre de requêtes par jour
  et par utilisateur (jamais de contenu, jamais de jetons ni de coûts), visible
  de `TENANT_SETTINGS_VIEW`.

### 6.13 Fiabilité et transverses

- **FR-120** **Panne d'écriture — tranché (D8).** _Avant le modèle_ : si la
  réservation échoue en `ENFORCE`, 503 `AI_BILLING_UNAVAILABLE` (réessayable),
  **aucun appel** au fournisseur ; en `SHADOW` et `OFF`, la requête passe
  (fail-open). _Après la réponse_ : si le règlement de l'événement échoue, la
  réponse déjà livrée n'est **jamais** remise en cause (fail-open) ; l'écriture
  est reprise depuis une file mémoire bornée (1 000 entrées, reprise avec
  attente croissante) ; en cas d'échec définitif, audit `AI_USAGE_WRITE_FAILED`
  et la réservation est libérée par le balayeur — perte bornée à un crédit par
  échec, alertée au super-admin. Recommandation : ce compromis évite de refuser
  des clients à cause d'une panne de facturation tout en interdisant l'appel
  non mesuré.
- **FR-121** **Isolation** : chaque route filtre par agence ; tout identifiant
  reçu (`userId` d'un filtre d'historique, `itemId`, `invoiceId`) est vérifié
  (`assertBelongsToTenant`) ; une référence d'une autre agence lève la même
  `NotFoundError` qu'un objet inexistant. Tout modèle nouveau d'agence porte
  `tenantId` ; les trois modèles globaux sont classés `GLOBAL_MODELS`.
- **FR-122** **Audit** (`logAuditEvent`) : interrupteur, opt-in et plafond du
  dépassement, achat et changement de pack, recharge demandée et réglée,
  crédits offerts ou restitués, dérogations, coupure forcée, réglages
  plateforme, échecs d'écriture. Jamais le contenu d'une conversation ni un
  secret.
- **FR-123** **Performance** : la réservation est une transaction courte (une
  connexion quelques millisecondes) ; elle emploie `withTransactionalAdvisoryLock`
  et **jamais** `withExclusiveSection`, dont le sémaphore de processus (2
  sections simultanées, `advisory-lock.ts:67`) sérialiserait tout le chat.
- **FR-124** **Aucune variable d'environnement nouvelle** : prix, seuils et mode
  sont en base (D14). `AI_MAX_OUTPUT_TOKENS` et les autres `AI_*` existants
  restent.
- **FR-125** **Confidentialité** : `AiUsageEvent` ne contient aucun contenu ;
  les fournisseurs (Anthropic, OpenRouter) reçoivent déjà des extraits d'outils
  (022 §4.6) ; base légale, sous-traitance et conservation **[À VALIDER —
  juriste]** (Q11).
- **FR-126** **Compatibilité** : tant que le mode est `OFF` ou `SHADOW`, rien
  ne change pour l'agence ; `GET /ai/status` ajoute des champs et n'en retire
  aucun (un ancien client les ignore).
- **FR-127** **Garde-fous de coût** : revoir la valeur par défaut de
  `AI_MAX_OUTPUT_TOKENS` (16 000 aujourd'hui, jusqu'à 5 appels par requête) au vu
  des mesures du lot A ; **plafond de coût par requête** facultatif
  (`maxCostPerRequestXof`, désactivé par défaut) qui interrompt proprement une
  boucle d'outils trop chère **[Par défaut — à valider]**.
- **FR-128** À la livraison de chaque lot : inventaire des fonctionnalités
  (`npm run wiki:export`), scénario de recette, `SECURITY.md` (facturation IA,
  minimisation), `RUNBOOK.md` (mode, prix, taux, reprise), HANDOFF.
- **FR-129** **Particuliers** : aucune règle propre dans le code ; le gratuit
  d'un espace à un seul membre est 10 par application de FR-040. Si la spec 026
  est fusionnée, les codes de ses packs entrent dans `rules.requiresAnyOf` des
  packs IA.

## 7. Modèle économique

> Les chiffres ci-dessous sont des **hypothèses de départ** recopiées de la
> demande et **recalculées** ici. Aucun n'est mesuré : le coût fournisseur par
> requête est inconnu tant que le lot A n'a pas tourné deux semaines. **Aucun
> prix n'est figé** avant ces données (§7.10).

### 7.1 Ce qu'on vend, ce qu'on paie

- **Revenu** : trois flux — packs mensuels, dépassement, recharges — plus, en
  contrepartie, l'abonnement de base qui finance le gratuit.
- **Coût** : le fournisseur de modèles (facturé en **dollars**, à la requête et
  aux jetons), les frais de passerelle de paiement (relevés dans
  `providerFees`), la TVA qui n'est **pas** un revenu.
- **Marge brute** d'un produit = revenu HT − coût fournisseur des requêtes qu'il
  finance. Les frais de passerelle sont traités à part (§7.7).

### 7.2 Formules

| #   | Grandeur                                        | Formule                                                                                              | Notation                                                                                   |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| F1  | Prix unitaire HT d'un crédit                    | `u = P ÷ N`                                                                                          | `P` prix HT du produit, `N` crédits qu'il contient                                         |
| F2  | Coût d'une requête                              | `c = Σ appels (entrée × p_e + cache lu × p_cl + cache écrit × p_ce + sortie × p_s) ÷ 10⁶ × fx`       | prix `p` par million de jetons (`AiModelPrice`), `fx` taux USD → FCFA ; ou coût rapporté   |
| F3  | Marge brute à pleine consommation               | `m = 1 − c ÷ u`                                                                                      |                                                                                            |
| F4  | Marge brute à taux d'usage `ρ`                  | `m(ρ) = 1 − ρ · N · c ÷ P`                                                                           | `ρ` = part des crédits payés effectivement consommés (le reste est de la **casse**)        |
| F5  | Point mort de coût                              | `c* = u ÷ ρ`                                                                                         | coût par requête au-delà duquel le produit perd de l'argent                                |
| F6  | Prix unitaire minimal pour une marge cible `m*` | `u_min = c ÷ (1 − m*)`                                                                               |                                                                                            |
| F7  | Coût du gratuit d'une agence                    | `F = min(g · k, K) · c`                                                                              | `g` = 10, `K` = 100, `k` collaborateurs actifs                                             |
| F8  | Conversion de point mort du gratuit             | `x* = g · c ÷ (P − ρ · N · c)`                                                                       | part des utilisateurs gratuits qui doivent prendre le produit `P` ; définie si `P > ρ N c` |
| F9  | Marge nette de frais de passerelle              | `m_net = (P · (1 + t) · (1 − f) − P · t − ρ · N · c) ÷ P`                                            | `t` = 18 % de TVA, `f` = frais de passerelle sur le TTC encaissé                           |
| F10 | Prix TTC                                        | `P_TTC = P · (1 + t)`                                                                                |                                                                                            |
| F11 | Marge brute d'un mois                           | `M = Σ (unit_value_xof × crédits consommés) − Σ coût des requêtes` (toutes sources, gratuit compris) | calculée par le tableau de marge (FR-103)                                                  |

### 7.3 Hypothèses de coût par requête (**non mesurées**)

| Hypothèse | Profil                                              | Coût moyen `c` par requête |
| --------- | --------------------------------------------------- | -------------------------: |
| A         | modèle rapide avec cache de prompt                  |                       15 F |
| B         | modèle intermédiaire                                |                       40 F |
| C         | modèle haut de gamme (le défaut actuel, sans cache) |                      150 F |

Le défaut actuel de la plateforme (`claude-opus-5-5`, sans cache de prompt,
`env.ts:139` et `anthropic-provider.ts:145`) est de profil **C**. Une requête
peut appeler le modèle jusqu'à 5 fois et chaque tour relit l'historique, d'où
une dispersion forte autour de la moyenne : c'est la **moyenne mesurée** qui
compte pour les marges, et le **95ᵉ centile** pour les plafonds de coût.

### 7.4 Prix par défaut

| Produit      | Crédits `N` |  HT `P` | TTC (18 %) | Prix unitaire HT `u` | Prix unitaire TTC | Annuel (11 mois) : HT par mois équivalent, `u` |
| ------------ | ----------: | ------: | ---------: | -------------------: | ----------------: | ---------------------------------------------: |
| Pack 100     |         100 |   9 900 |     11 682 |              99,00 F |          116,82 F |                9 075 F par mois, `u` = 90,75 F |
| Pack 500     |         500 |  39 900 |     47 082 |              79,80 F |           94,16 F |               36 575 F par mois, `u` = 73,15 F |
| Pack 2 000   |       2 000 | 129 900 |    153 282 |              64,95 F |           76,64 F |              119 075 F par mois, `u` = 59,54 F |
| Dépassement  |           1 |     120 |        142 |             120,00 F |          141,60 F |               sans objet (facturé chaque mois) |
| Recharge 100 |         100 |  12 900 |     15 222 |             129,00 F |          152,22 F |                    sans objet (payée d'avance) |

Les valeurs `u` de la demande (« 80 F » et « 65 F ») sont les arrondis de 79,80 F
et 64,95 F ; les marges ci-dessous utilisent les valeurs exactes.

### 7.5 Marges à pleine consommation (F3), recalculées

| Produit      | Marge à A (15 F) | Marge à B (40 F) | Marge à C (150 F) | Marge absolue A / B / C, par mois ou par achat |
| ------------ | ---------------: | ---------------: | ----------------: | ---------------------------------------------- |
| Pack 100     |           84,8 % |           59,6 % |           −51,5 % | 8 400 / 5 900 / −5 100 F                       |
| Pack 500     |           81,2 % |           49,9 % |           −88,0 % | 32 400 / 19 900 / −35 100 F                    |
| Pack 2 000   |           76,9 % |           38,4 % |          −130,9 % | 99 900 / 49 900 / −170 100 F                   |
| Dépassement  |           87,5 % |           66,7 % |           −25,0 % | 105 / 80 / −30 F par requête                   |
| Recharge 100 |           88,4 % |           69,0 % |           −16,3 % | 11 400 / 8 900 / −2 100 F                      |

**Écarts avec les chiffres de la demande** (aucun n'est un désaccord, ce sont
des arrondis) : Pack 100 à A 84,8 % (demande : 85 %) ; Pack 500 à B 49,9 %
(50 %) ; dépassement à A 87,5 % (88 %) ; conversion de point mort 1,8 % et 6,8 %
(demande : « ~2 % » et « ~7 % »). Toutes les autres valeurs concordent au point de
pourcentage près.

**Lecture.** Le modèle de profil C est **déficitaire partout** : il ne doit pas
rester le défaut d'une offre payante (R-02). Le Pack 2 000 est celui qui a le
moins de marge de sécurité : son point mort de coût est de 64,95 F, moins de
deux fois l'hypothèse B.

### 7.6 Coût du gratuit et conversion de point mort

Coût du gratuit par utilisateur et par mois (F7 avec `k = 1`) : **150 F** (A),
**400 F** (B), **1 500 F** (C). Coût pour une agence de `k` collaborateurs :

| Collaborateurs actifs `k` | Requêtes gratuites | Coût à A | Coût à B | Coût à C |
| ------------------------: | -----------------: | -------: | -------: | -------: |
|                         1 |                 10 |    150 F |    400 F |  1 500 F |
|                         3 |                 30 |    450 F |  1 200 F |  4 500 F |
|                         5 |                 50 |    750 F |  2 000 F |  7 500 F |
|                10 et plus |      100 (plafond) |  1 500 F |  4 000 F | 15 000 F |

**Conversion de point mort vers un Pack 100** (F8, `g = 10`) : il faut que
**1,8 %** (A) ou **6,8 %** (B) des utilisateurs gratuits prennent un Pack 100 à
pleine consommation pour amortir le gratuit — 1,7 % et 5,8 % à 75 % d'usage,
1,6 % et 5,1 % à 50 %. À C, le Pack 100 perd de l'argent : aucune conversion ne
suffit à pleine consommation (à 50 % d'usage, 62,5 %).

**Le gratuit rapporté au revenu de base.** Pour une agence, le gratuit est financé
par son abonnement de base, pas seulement par les packs IA :

| Abonnement de base (HT par mois)               |                                                 Gratuit à A | Gratuit à B | Gratuit à C |
| ---------------------------------------------- | ----------------------------------------------------------: | ----------: | ----------: |
| Agence 29 900 (jusqu'à 100 requêtes gratuites) |                                                       5,0 % |      13,4 % |      50,2 % |
| Syndic 49 900 (jusqu'à 100)                    |                                                       3,0 % |       8,0 % |      30,1 % |
| Patrimoine Essentiel 9 900 (10)                |                                                       1,5 % |       4,0 % |      15,2 % |
| Particulier Plus 2 900, spec 026 (10)          |                                                       5,2 % |      13,8 % |      51,7 % |
| Particulier gratuit, spec 026 (10)             | **pur coût** (0 F de revenu) : 150 / 400 / 1 500 F par mois |             |             |

Deux cas sont à part : l'**essai** de 30 jours (aucun revenu, mais le gratuit
s'applique) et le **palier gratuit durable** de la spec 026 (10 requêtes par
mois **à vie** pour un compte sans revenu). Ce dernier expose la plateforme à
l'ouverture de comptes pour le gratuit (R-06, Q21).

### 7.7 Feuille de sensibilité

**Au coût `c`** (marge à pleine consommation, en %) :

| `c` (F par requête) | Pack 100 | Pack 500 | Pack 2 000 | Dépassement | Recharge 100 |
| ------------------: | -------: | -------: | ---------: | ----------: | -----------: |
|                   5 |     94,9 |     93,7 |       92,3 |        95,8 |         96,1 |
|                  10 |     89,9 |     87,5 |       84,6 |        91,7 |         92,2 |
|                  15 |     84,8 |     81,2 |       76,9 |        87,5 |         88,4 |
|                  25 |     74,7 |     68,7 |       61,5 |        79,2 |         80,6 |
|                  40 |     59,6 |     49,9 |       38,4 |        66,7 |         69,0 |
|                  60 |     39,4 |     24,8 |        7,6 |        50,0 |         53,5 |
|                  80 |     19,2 |     −0,3 |      −23,2 |        33,3 |         38,0 |
|                 100 |     −1,0 |    −25,3 |      −54,0 |        16,7 |         22,5 |
|                 150 |    −51,5 |    −88,0 |     −130,9 |       −25,0 |        −16,3 |

**Points morts de coût** (F5) : Pack 100 à 99,0 F, Pack 500 à 79,8 F,
Pack 2 000 à 65,0 F, dépassement à 120 F, recharge à 129 F. **Coût pour 60 % de
marge** : 39,6 F, 31,9 F, 26,0 F, 48,0 F et 51,6 F. **Prix unitaire minimal**
pour une marge cible (F6) : 30,0 F (A), 80,0 F (B), 300,0 F (C) pour 50 % ;
37,5 F, 100,0 F, 375,0 F pour 60 % ; 50,0 F, 133,3 F, 500,0 F pour 70 %.

**Au taux d'usage `ρ`** (F4, Pack 100 / Pack 500 / Pack 2 000, en %) :

|   `ρ` | À A (15 F)         | À B (40 F)         | À C (150 F)            |
| ----: | ------------------ | ------------------ | ---------------------- |
| 100 % | 84,8 / 81,2 / 76,9 | 59,6 / 49,9 / 38,4 | −51,5 / −88,0 / −130,9 |
|  75 % | 88,6 / 85,9 / 82,7 | 69,7 / 62,4 / 53,8 | −13,6 / −41,0 / −73,2  |
|  50 % | 92,4 / 90,6 / 88,5 | 79,8 / 74,9 / 69,2 | 24,2 / 6,0 / −15,5     |

La **casse** (crédits payés jamais consommés) est une marge de plus, déclarée
à part dans le tableau de marge : elle ne doit pas servir à justifier un prix.

**Au cycle annuel** (11 mois pour 12, F3 avec `u` annuel) : Pack 100 à 83,5 % (A)
et 55,9 % (B) ; Pack 500 à 79,5 % et 45,3 % ; Pack 2 000 à 74,8 % et 32,8 %.

**Au taux de change** : le coût est en dollars, le revenu en francs. Un dollar
plus cher de 10 % équivaut à `c × 1,10` : à `c` = 40 → 44 F, Pack 100 55,6 %,
Pack 500 44,9 %, Pack 2 000 32,3 %, dépassement 63,3 %, recharge 65,9 %.

**Aux frais de passerelle** (F9, valeurs `f` **d'illustration**, à remplacer par
les frais réels lus dans `providerFees`) : à `f` = 2 % — Pack 100 82,5 % (A) et
57,2 % (B), Pack 500 78,8 % et 47,5 %, Pack 2 000 74,5 % et 36,1 %, dépassement
85,1 % et 64,3 %, recharge 86,0 % et 66,6 % ; à `f` = 4 % — Pack 100 80,1 % et
54,9 %, Pack 500 76,5 % et 45,2 %, Pack 2 000 72,2 % et 33,7 %, dépassement
82,8 % et 61,9 %, recharge 83,7 % et 64,3 %. Un dépassement facturé après coup
n'est réglé que si la facture l'est : ses frais dépendent du canal.

**Exemple illustratif, pas une prévision** : 50 agences de 4 collaborateurs (40
requêtes gratuites chacune), dont 10 sur Pack 100 avec 60 % d'usage, et une agence
en dépassement de 30 requêtes. Revenu IA : 10 × 9 900 + 30 × 120 = 102 600 F HT. Coût :
2 000 gratuites, 600 de packs, 30 de dépassement, soit 39 450 F (A), 105 200 F (B),
394 500 F (C). Marge brute IA : 63 150 F soit 61,5 % (A), −2 600 F soit −2,5 %
(B), −291 900 F (C). Sans le gratuit (financé par les 50 abonnements de base,
1 495 000 F), la marge serait de 90,8 % (A), 75,4 % (B), 7,9 % (C) ; le gratuit pèse
2,0 % (A), 5,4 % (B) et 20,1 % (C) de ces abonnements.

### 7.8 Politique de remises

- **Pas de remise de combinaison** sur les packs IA (FR-056).
- **Cycle annuel** : le pack IA suit la règle générale (11 mois pour 12) ; c'est
  la seule remise structurelle ; ses marges figurent en §7.7.
- **Remise commerciale** par élément : libre, mais le super-admin est averti
  sous le **plancher de marge** `coût moyen mesuré × 1,30` **[À VALIDER —
  utilisateur]** ; la remise ne peut pas porter sur le prix de dépassement
  (dérogation d'agence explicite et auditée à la place).
- **Crédits offerts** : outil de geste commercial, valeur unitaire 0, motif
  obligatoire, coût visible dans le tableau de marge.

### 7.9 Plancher de marge et alertes de prix

Pour chaque produit, l'écran super-admin affiche `u`, `c` mesuré (moyenne des 30
derniers jours du modèle par défaut), la marge F3, le point mort F5, et une alerte
quand `u < c × marginFloorMultiplier` ou quand un modèle est servi sans tarif.
C'est un **aide à la décision**, pas une règle : aucun prix ne change tout seul.

### 7.10 Plan de mesure et gel des prix

Le lot A tourne **au moins deux semaines** (mode `OFF`, mesure seule, avec
les tarifs des modèles et le taux de change saisis). Sont alors relevés :
`c` moyen et 95ᵉ centile, par modèle ; nombre de requêtes par agence et par
collaborateur ; part d'usage incomplet ; distribution des tours et des appels
d'outils. **Les prix de D6 ne sont confirmés, ajustés ou abandonnés qu'après
cette mesure** ; les valeurs de ce §7 sont recalculées à partir d'elle (le
script du plan §4.7 reproduit les tableaux du §7 à partir des données réelles).

## 8. Cas limites

| #    | Cas                                                                   | Traitement                                                                                                                                                                     |
| ---- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E-01 | Deux requêtes simultanées pour le dernier crédit.                     | Verrou d'agence (FR-020) : une réserve, l'autre reçoit 402. Jamais de solde négatif (I-1).                                                                                     |
| E-02 | Bascule à minuit UTC pendant une requête.                             | `period_key` fixé à la réservation ; le lot du mois écoulé, expiré, n'est pas restitué à la libération (FR-023) ; la requête suivante crée les lots du nouveau mois.           |
| E-03 | Changement de pack en cours de mois.                                  | Montée : avoir prorata, nouveau lot proratisé, **restant de l'ancien reporté** (FR-051). Descente : à l'échéance ; le lot du mois reste, celui du mois suivant est plus petit. |
| E-04 | Prorata du premier mois d'un pack.                                    | `ceil(crédits × jours restants ÷ jours du mois)` (FR-054) : 500 crédits, 15 jours restants sur 30 → 250.                                                                       |
| E-05 | Suspension ou résiliation de l'abonnement.                            | Agence suspendue : refusée en amont (`TENANT_SUSPENDED`). Abonnement résilié ou en lecture seule : gratuit, offert et recharge seuls (FR-033).                                 |
| E-06 | Essai.                                                                | Gratuit et recharge permis ; aucun pack (D10) ; aucun dépassement (aucune facture pendant l'essai).                                                                            |
| E-07 | Agence en lecture seule d'impayé.                                     | L'assistant reste utilisable (`/ai/chat` est « lecture ») avec gratuit, offert et recharge ; pack et dépassement refusés ; l'écran « Assistant IA » reste ouvert pour payer.   |
| E-08 | Rétrogradation d'un pack de base.                                     | Le pack IA suit ou part avec lui (`parentItemId`) ; ses lots du mois restent valides jusqu'à `endsAt`.                                                                         |
| E-09 | Fournisseur qui renvoie un usage partiel.                             | `usage_complete = false`, coût partiel ou `UNKNOWN`, requête comptée (FR-006).                                                                                                 |
| E-10 | Flux interrompu par le client.                                        | Facturée seulement si un fragment de réponse a été émis (FR-022) ; sinon libérée ; le coût est enregistré dans tous les cas.                                                   |
| E-11 | Instance arrêtée entre la réservation et le règlement.                | Le balayeur libère la réservation au bout de `stuckReservationMinutes` (FR-024) ; l'événement passe `EXPIRED`.                                                                 |
| E-12 | Retry du client avec le même message.                                 | Nouvelle requête, nouveau `requestId`, nouvelle réservation ; jamais de dédoublonnage (FR-007). L'ancienne est réglée ou libérée selon FR-022.                                 |
| E-13 | Changement de mode pendant des requêtes en vol.                       | Le mode est mémorisé à la réservation (FR-029) ; les requêtes en vol se règlent comme prévu.                                                                                   |
| E-14 | Plusieurs instances d'API.                                            | Le portefeuille est en base et fait foi ; les limiteurs en mémoire restent un frein par instance, jamais un quota (R-15).                                                      |
| E-15 | Deux requêtes de dépassement simultanées au moment du plafond.        | Le verrou d'agence sérialise ; une seule passe, l'autre reçoit `AI_OVERAGE_CAP_REACHED` (I-13).                                                                                |
| E-16 | Le prix de dépassement ou d'un pack change en cours de mois.          | Dépassement : prix figé par requête (FR-061). Pack : prix figé à la souscription (FR-057).                                                                                     |
| E-17 | Recharge qui expire pendant une réservation.                          | Le crédit réservé est consommé normalement ; libéré après l'expiration, il n'est pas restitué (FR-023).                                                                        |
| E-18 | Mois où le mode était `SHADOW`.                                       | Aucune facture ; `AiUsageMonth` conservé pour l'analyse.                                                                                                                       |
| E-19 | Un collaborateur est retiré en cours de mois.                         | La réserve gratuite ne baisse pas avant le mois suivant (FR-041).                                                                                                              |
| E-20 | Suppression de l'agence.                                              | Les tables de la spec se suppriment en cascade comme les factures (I-12) ; l'export de données d'agence (`TenantDataExport`) est à étendre si l'usage doit y figurer (Q11).    |
| E-21 | Recharge payée alors que l'abonnement est `PAST_DUE`.                 | Crédits ajoutés ; **période et statut de l'abonnement inchangés** (FR-076).                                                                                                    |
| E-22 | Le super-admin ajoute un pack IA pendant l'essai.                     | Permis (FR-059) ; les crédits s'ajoutent ; la facture le reprendra à la fin de l'essai.                                                                                        |
| E-23 | Requête libérée dont le coût fournisseur est élevé.                   | Le coût est enregistré (FR-022) ; le tableau de marge le montre en « coût des requêtes libérées ».                                                                             |
| E-24 | Agence sans ligne `TenantAiSettings`.                                 | Valeurs par défaut sans écriture (assistant actif, dépassement inactif).                                                                                                       |
| E-25 | Facture `AI_USAGE` du mois M pendant que le mois M+1 a déjà commencé. | Le mois M est figé à la facturation (I-6) ; les requêtes de M+1 s'accumulent dans `AiUsageMonth(M+1)`.                                                                         |

## 9. Risques

| #    | Risque                                                                                                                                                                                                                          | Parade                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | **Le coût par requête est inconnu.** Tous les prix reposent sur trois hypothèses.                                                                                                                                               | Lot A d'abord ; aucun prix figé avant deux semaines de données (§7.10) ; tableau de marge en continu.                                                       |
| R-02 | **Modèle haut de gamme par défaut** (`claude-opus-5-5`, sans cache) : déficitaire pour toutes les offres du §7.5.                                                                                                               | D5 ; alerte de plancher de marge (§7.9) ; le changement de modèle est un réglage du super-admin (PR #61) ; cache de prompt à chiffrer (R-18).               |
| R-03 | **Usage incomplet** (flux coupé, fournisseur muet, repli serveur qui sert un autre modèle) : coût sous-estimé.                                                                                                                  | `usage_complete`, modèle réellement servi, alerte au-dessus de 5 % (FR-108).                                                                                |
| R-04 | **Concurrence et pool de connexions** : verrou par agence trop long, ou `withExclusiveSection` (2 sections par processus) qui sérialise le chat.                                                                                | Transaction courte, `withTransactionalAdvisoryLock` seul (FR-123), test à deux connexions et de charge.                                                     |
| R-05 | **Fuite de revenu** : écriture d'usage perdue après la réponse (fail-open).                                                                                                                                                     | File de reprise, balayeur, audit, alerte ; perte bornée à un crédit par échec (FR-120).                                                                     |
| R-06 | **Exploitation du gratuit** : comptes créés pour les 10 requêtes (inscription libre de la spec 026, faux collaborateurs invités pour gonfler la réserve).                                                                       | Plafond de 100 (FR-040), plafond dur (FR-037), budget global du gratuit (FR-047), e-mail vérifié exigé par la spec 026 ; captcha : Q21.                     |
| R-07 | **Facture surprise.**                                                                                                                                                                                                           | Opt-in, plafond obligatoire, alertes 80 et 100 % (D2) ; jamais de post-facturation sans plafond.                                                            |
| R-08 | **Change** : coût en dollars, revenu en francs.                                                                                                                                                                                 | `costUsd` source de vérité, taux paramétré, sensibilité au §7.7, revue mensuelle du taux.                                                                   |
| R-09 | **Confusion flux / stock** : ajouter `AI_REQUESTS` à `CAPACITY_KEYS` le ferait traiter comme une capacité (`computeCapacityLimits`, `getUsage`, `computeOverageForUsage` typé `Record<CapacityKeyCode, …>`, jauges génériques). | Constante distincte `FLOW_CAPACITY_KEYS`, type `CatalogCapacityKeyCode` séparé (plan §4.5.1) ; test qui échoue si `AI_REQUESTS` entre dans `CAPACITY_KEYS`. |
| R-10 | **Une recharge renouvelle un abonnement impayé** : `applyPaymentToSubscriptionTx` traite une facture sans période comme réglant l'échéance d'un abonnement `PAST_DUE` (`platform-payment-service.ts:257-261`).                  | Garde explicite par nature (FR-076) et critère CA-28.                                                                                                       |
| R-11 | `issueCreditNote` refuse toute nature hors `PERIOD` et `OVERAGE` (`platform-invoice-service.ts:603`).                                                                                                                           | Extension par nature avec effets propres (FR-082, FR-083).                                                                                                  |
| R-12 | **Conflits de fusion** : PR #61 (`contracts.ts`, providers, `ai-controller.ts`), spec 026 (`CapacityKeyCode`, `TenantType`, `catalog.ts`).                                                                                      | Ordre de fusion et découpage du lot A (§11, Q20) ; enums migrés séparément.                                                                                 |
| R-13 | **Volumétrie** : une ligne par requête (et deux de journal) ; index à maintenir.                                                                                                                                                | Index ciblés, agrégat mensuel, purge à définir (Q11), mesure de taille au lot A.                                                                            |
| R-14 | **Droit et fiscalité non tranchés** (TVA d'un client étranger, produit constaté d'avance, CGV, conservation des données).                                                                                                       | Marqués [À VALIDER] ; paramétrables ; aucune règle légale codée en dur.                                                                                     |
| R-15 | **Limiteurs de débit en mémoire, par instance** : à N instances le plafond effectif est N fois la valeur configurée.                                                                                                            | Ils restent un frein ; le portefeuille en base et le plafond dur mensuel sont les bornes réelles.                                                           |
| R-16 | **`SHADOW` qui s'éternise** : coût non maîtrisé.                                                                                                                                                                                | Échéance de bascule dans le HANDOFF, plafond dur actif dès `SHADOW`, alerte de budget du gratuit.                                                           |
| R-17 | Le **cache des droits** (30 secondes, `getEntitlements`) retarde la prise en compte d'un pack acheté.                                                                                                                           | La réservation lit le portefeuille en base, pas le cache ; l'achat invalide le cache (`invalidateEntitlements`).                                            |
| R-18 | **Le cache de prompt n'est pas actif** : l'hypothèse A le suppose (`system` est une chaîne sans `cache_control`).                                                                                                               | Chiffrer et livrer le cache séparément, avec mesure avant et après ; ne pas prendre l'hypothèse A pour acquise.                                             |
| R-19 | **Numéros de facture consommés par des recharges abandonnées** si la facture était émise avant le paiement.                                                                                                                     | Brouillon jusqu'au règlement (D11, FR-074) ; alternative Q16.                                                                                               |
| R-20 | **Coût maximal d'une requête** : jusqu'à 5 appels, 16 000 jetons de sortie chacun, sorties d'outils de 8 Ko.                                                                                                                    | Plafond de sortie revu au vu des mesures, plafond de coût par requête facultatif (FR-127).                                                                  |

## 10. Critères d'acceptation

Chaque critère est vérifiable par un test automatisé (API Jest, intégration sur
base `DATABASE_URL_TEST`, web Vitest) ou, à défaut, par la recette rejouée.

| CA    | FR                                | Critère                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-01 | 001, 002, 007                     | Un `POST /ai/chat` accepté crée exactement un `AiUsageEvent` ; deux envois du même message en créent deux ; `GET /ai/status` et `POST /ai/actions/execute` n'en créent aucun ; une requête refusée avant l'orchestrateur (400, 402, 403, 429) n'en crée aucun ; réécrire le même `request_id` met à jour la ligne sans la dupliquer.                                                                                                                                                                                                          |
| CA-02 | 003, 004, 009                     | L'événement contient agence, utilisateur, `requestId`, fournisseur, modèle, jetons, coût, tours, outils, durée, issue et mois. Après un message contenant une chaîne repère, aucune table de la spec ni aucune ligne d'audit ne la contient (I-15). Les réponses des routes d'agence ne contiennent ni jetons, ni coût.                                                                                                                                                                                                                       |
| CA-03 | 005, 006, 008                     | Avec un fournisseur simulé renvoyant un usage sur 3 tours, l'événement cumule les jetons des 3 tours et porte le modèle réellement servi. Coût = formule F2 avec le tarif en vigueur ; un nouveau tarif à effet ultérieur ne change pas le coût d'un événement passé. Un tour sans usage donne `usage_complete = false`, coût des tours connus ; aucun usage : `UNKNOWN` et requête comptée. Coût rapporté par OpenRouter repris tel quel (après la PR #61).                                                                                  |
| CA-04 | 010, 011, 013, 018, 019           | Pour tout lot, `remaining` reste entre 0 et `quantity` ; la somme des `delta` du journal égale `remaining` ; une tentative de `UPDATE` d'une ligne du journal échoue ; aucune requête de la spec ne s'exécute sans `tenant_id`.                                                                                                                                                                                                                                                                                                               |
| CA-05 | 012                               | Un portefeuille de 2 gratuits, 1 offert, 1 pack et 1 recharge donne, sur 6 requêtes successives, les sources : gratuit, gratuit, offert, pack, recharge, puis refus (ou dépassement s'il est permis). À rang égal, le lot qui expire le plus tôt passe d'abord.                                                                                                                                                                                                                                                                               |
| CA-06 | 015, 016                          | Un événement réglé sur un lot de pack de 9 900 F pour 100 crédits porte `unit_value_xof = 99` ; sur du gratuit ou de l'offert, 0 ; sur une recharge de 12 900 F pour 100 crédits, 129. La somme `unit_value_xof × crédits` du mois égale le « revenu imputé » du tableau de marge.                                                                                                                                                                                                                                                            |
| CA-07 | 017, 040, 041, 042, 044           | Premier accès du mois : un lot gratuit de 10 pour 1 collaborateur actif, 30 pour 3, 100 pour 15 (plafond) ; un second accès ne crée aucun doublon ; un collaborateur activé en cours de mois augmente la quantité de 10 par `ADJUST`, un départ ne la baisse pas ; le lot expire le 1er du mois suivant à 00:00 UTC ; un client de portail n'est pas compté.                                                                                                                                                                                  |
| CA-08 | 020, 021, 028, 123                | Avec un solde de 5 et 20 requêtes simultanées sur la même agence (base réelle, deux connexions ou plus) : exactement 5 réservations réussissent, 15 reçoivent 402 ; aucun restant négatif ; aucun interblocage ; 50 réservations sur 50 agences différentes se terminent sans saturer le pool (aucune erreur d'attente de connexion).                                                                                                                                                                                                         |
| CA-09 | 022, 023, 027                     | Issue `end_turn` : crédit consommé. `aborted` après un fragment émis : consommé ; `aborted` avant tout texte : libéré. `error`, `refusal`, `max_rounds` : libéré. Dans tous les cas, le coût est enregistré. Une libération sur un lot déjà expiré ne restitue rien. Une requête à 5 tours et 8 outils ne consomme qu'un crédit.                                                                                                                                                                                                              |
| CA-10 | 024, 091                          | Une réservation vieille de plus de `stuckReservationMinutes` passe `EXPIRED` et rend son crédit ; une réservation récente reste `RESERVED` ; deux passages du balayeur ne rendent le crédit qu'une fois (I-4).                                                                                                                                                                                                                                                                                                                                |
| CA-11 | 025                               | Un corps invalide (400) et une agence sans outil disponible (403) ne laissent ni événement `RESERVED` ni restant décrémenté.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| CA-12 | 026, 030, 031, 038, 111           | En `ENFORCE`, à zéro : réponse JSON 402 `AI_CREDITS_EXHAUSTED` de type `application/json`, **sans** en-tête `text/event-stream`, fournisseur jamais appelé ; `data` contient solde, date de remise à zéro, `purchasePath` et `canPurchase` (vrai pour l'administrateur, faux pour un agent). Les six autres codes de FR-031 sont produits dans leurs conditions. Un dépassement du limiteur de débit par minute renvoie 429 `RATE_LIMITED` **avant** toute lecture de solde et toute réservation.                                             |
| CA-13 | 029, 032, 039, 115, 126           | `OFF` : aucun lot, aucune réservation, événement `UNBILLED`, `GET /ai/status` sans `credits`. `SHADOW` : portefeuille débité ; à zéro la requête passe en `UNBILLED` avec `shadow_blocked = true` ; aucune facture ; l'agence ne voit rien. `ENFORCE` : blocage. Le mode change en vol sans altérer les requêtes déjà réservées.                                                                                                                                                                                                              |
| CA-14 | 033                               | Phase `READ_ONLY` : gratuit, offert et recharge consommables, pack et dépassement refusés (`enforce`) ; en `warn`, le pack passe et le refus est compté ; en `off`, rien n'est évalué. `TRIAL` : gratuit et recharge seuls. `GRACE` : dépassement refusé.                                                                                                                                                                                                                                                                                     |
| CA-15 | 034, 062                          | `BLOCK` : dépassement refusé même activé. `BILL_OVERAGE` sans opt-in : 402 ; avec opt-in : passe. `WARN_ONLY` : passe en `UNBILLED` avec alerte. Chacune des conditions (a) à (g) de FR-062, prise isolément, refuse le dépassement.                                                                                                                                                                                                                                                                                                          |
| CA-16 | 035, 036                          | Interrupteur éteint par l'administrateur : chat 403 `AI_TENANT_DISABLED`, `GET /ai/status` `enabled: false, reason: 'TENANT_DISABLED'`. Coupure forcée par le super-admin : l'administrateur ne peut pas la lever. Aucun `TenantAiSettings` : assistant actif.                                                                                                                                                                                                                                                                                |
| CA-17 | 037                               | Au-delà de `hardMonthlyCap` requêtes dans le mois : 429 `AI_MONTHLY_LIMIT_REACHED`, même avec dépassement activé et politique `WARN_ONLY` ; la dérogation par agence est prise en compte.                                                                                                                                                                                                                                                                                                                                                     |
| CA-18 | 043, 045, 046, 047, 105           | Une dérogation `freeCreditsOverride` remplace la formule ; une modification du réglage s'applique au lot suivant sous 30 secondes et jamais aux lots existants ; audit sans secret ; dépasser `freeBudgetMonthlyCredits` déclenche l'alerte au super-admin.                                                                                                                                                                                                                                                                                   |
| CA-19 | 050, 052, 057, 058                | Le catalogue contient `EXT_IA_100/500/2000` aux prix et capacités de FR-050. L'administrateur (`TENANT_SETTINGS_EDIT`) achète le Pack 100 : élément créé au prix figé, lié au pack de base ; un gestionnaire ou un agent reçoit 403 ; retirer le pack de base retire le pack IA à la même échéance.                                                                                                                                                                                                                                           |
| CA-20 | 051                               | Un second pack IA est refusé ; montée Pack 100 → 500 immédiate avec avoir au prorata de l'ancien et prorata du nouveau, restant de l'ancien lot reporté (`ADJUST`), ancien lot clos ; descente programmée à l'échéance sans remboursement.                                                                                                                                                                                                                                                                                                    |
| CA-21 | 053, 059                          | Pendant l'essai : 409 `AI_PACK_NOT_DURING_TRIAL` ; hors `ENFORCE` : 409 `AI_BILLING_NOT_ACTIVE` ; en lecture seule d'impayé : 409 `AI_PACK_READ_ONLY` ; le super-admin peut ajouter un pack pendant l'essai.                                                                                                                                                                                                                                                                                                                                  |
| CA-22 | 054, 055                          | Un pack acheté avec 15 jours restants sur 30 crédite `ceil(500 × 15 ÷ 30) = 250` (Pack 500), puis 500 chaque mois ; le lot expire à `min(fin du mois, fin de l'élément)` ; en cycle annuel, la facture est ×11 et le crédit reste mensuel.                                                                                                                                                                                                                                                                                                    |
| CA-23 | 056                               | Aucune remise de combinaison n'est calculée sur un pack IA ; une remise qui ramène le prix unitaire net sous `coût moyen × 1,30` renvoie un avertissement au super-admin sans bloquer.                                                                                                                                                                                                                                                                                                                                                        |
| CA-24 | 060, 061, 069                     | Activer le dépassement sans plafond : 400 ; plafond hors bornes : 400. Avec un plafond de 1 200 F HT et un prix de 120 F, la 10ᵉ requête de dépassement passe et la 11ᵉ reçoit 402 `AI_OVERAGE_CAP_REACHED`. Le prix figé sur la requête ne change pas si le réglage change ensuite. Une requête de dépassement ne modifie aucun lot (restants inchangés) et `overage_credits` égale le nombre d'événements de source `OVERAGE` réservés ou réglés (I-5).                                                                                     |
| CA-25 | 063, 113                          | Les alertes de 80 et 100 % de l'allocation (`QuotaAlert`, `AI_REQUESTS`) et du plafond (horodatages) ne sont levées qu'une fois par seuil et par mois, y compris sur deux exécutions et deux instances ; e-mail aux administrateurs de l'agence ; le super-admin est prévenu aux 100 %.                                                                                                                                                                                                                                                       |
| CA-26 | 064, 065, 067, 068, 088, 089      | 37 requêtes de dépassement à 120 F sur le mois M : le 1er du mois suivant, **une** facture `AI_USAGE`, ligne `USAGE` 37 × 120 = 4 440 F HT, TVA 799, total 5 239 ; un second passage n'en crée pas ; identique en cycle mensuel et annuel ; aucune facture en `SHADOW`/`OFF` ; dépassement nul : mois `WAIVED` sans facture ; aucune facture n'est émise pour du gratuit ou de l'offert.                                                                                                                                                      |
| CA-27 | 066                               | Une facture `AI_USAGE` `OVERDUE` refuse le dépassement (402, `OVERAGE_SUSPENDED_UNPAID`) sans toucher au gratuit, au pack, à la recharge ni au statut de l'abonnement ; son paiement lève la suspension.                                                                                                                                                                                                                                                                                                                                      |
| CA-28 | 070, 071, 072, 073, 074, 075, 076 | Recharge de 1 offre : brouillon `AI_TOPUP` de 12 900 HT, TVA 2 322, TTC 15 222, paiement démarré. Succès simulé : facture numérotée puis « payée » et lot de 100 crédits expirant 12 mois après, dans la même transaction ; l'IPN rejoué deux fois ne crédite pas deux fois. Échec ou annulation : aucun lot, aucune facture numérotée ; brouillon purgé après 48 h, **sans trou** dans la série `IMT`. Permise pendant l'essai et en lecture seule ; **un abonnement `PAST_DUE` payé par une recharge reste `PAST_DUE`, période inchangée**. |
| CA-29 | 077, 078, 079                     | Quantité 0 ou 11 : 400 ; 1 à 10 : facture multiple de l'offre ; TVA à 18 % ; aucun remboursement automatique du non-consommé.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CA-30 | 080, 081, 087                     | Les trois flux produisent les natures et lignes attendues ; le PDF et les libellés (fr, en, ar) reconnaissent `AI_USAGE` et `AI_TOPUP` ; les e-mails de facture existants partent ; la série `IMT-AAAA-NNNNN` reste continue.                                                                                                                                                                                                                                                                                                                 |
| CA-31 | 082, 083, 084, 085                | Avoir sur `AI_USAGE` : facture annulée, mois `OPEN`, refacturation possible avec un montant corrigé. Avoir sur `AI_TOPUP` intact : lot révoqué (`REFUND` négatif) ; entamé : 409. Restitution ou crédit offert : motif obligatoire, journal et audit.                                                                                                                                                                                                                                                                                         |
| CA-32 | 090, 092, 094                     | Requête réservée à 23:59:59 UTC : `period_key` de l'ancien mois ; à 00:00:00 les lots du mois écoulé ne sont plus consommables ; aucun report ni remboursement.                                                                                                                                                                                                                                                                                                                                                                               |
| CA-33 | 091, 093                          | La tâche horaire est idempotente (deux passages, mêmes écritures) : `EXPIRE` des lots échus, brouillons purgés, un seul e-mail d'expiration de recharge à J-30.                                                                                                                                                                                                                                                                                                                                                                               |
| CA-34 | 100, 103, 107, 108                | Vue par agence et tableau de marge : totaux égaux aux événements ; revenu imputé = Σ `unit_value_xof × crédits` ; casse = restants des lots expirés ; frais de passerelle repris de `providerFees` ; export CSV sans contenu ; alertes de modèle sans tarif et d'usage incomplet.                                                                                                                                                                                                                                                             |
| CA-35 | 101, 102, 106                     | Crédits offerts : motif obligatoire, source « offert » visible de l'agence, audit ; dérogations (gratuit, plafond dur, prix, coupure) prises en compte ; un super-admin qui appelle `/ai/chat` est refusé (403) sans événement ni débit.                                                                                                                                                                                                                                                                                                      |
| CA-36 | 104, 016                          | Nouveau tarif à effet daté : coût des requêtes passées inchangé ; nouveau taux de change : appliqué aux requêtes suivantes seulement ; un modèle sans tarif donne `UNKNOWN` et une alerte.                                                                                                                                                                                                                                                                                                                                                    |
| CA-37 | 110, 111, 115, 116                | Vitest : le tiroir affiche la jauge en `ENFORCE` et rien en `SHADOW`/`OFF` ; à un 402, l'administrateur voit « Acheter des requêtes », un agent « Contactez votre administrateur », le texte saisi est conservé ; la jauge expose ses attributs d'accessibilité.                                                                                                                                                                                                                                                                              |
| CA-38 | 014, 112, 117                     | Vitest : l'écran « Assistant IA » rend consommation, solde par source, pack, recharge, dépassement (plafond validé, équivalent en requêtes), interrupteur, historique sans contenu ; il reste ouvert à une agence en lecture seule.                                                                                                                                                                                                                                                                                                           |
| CA-39 | 114                               | Les catalogues fr, en, ar sont complets pour les textes nouveaux (`npm run i18n:extract` sans orphelin) ; aucune propriété CSS physique ; aucun `dangerouslySetInnerHTML`.                                                                                                                                                                                                                                                                                                                                                                    |
| CA-40 | 120                               | Injection de panne : une écriture de règlement qui échoue n'altère pas la réponse déjà livrée et réussit à la reprise ; un échec définitif écrit `AI_USAGE_WRITE_FAILED` et le balayeur libère la réservation ; en `ENFORCE`, une réservation impossible donne 503 `AI_BILLING_UNAVAILABLE` sans appel au fournisseur ; en `SHADOW`, la requête passe.                                                                                                                                                                                        |
| CA-41 | 121, 019                          | Un utilisateur d'une autre agence, avec un `itemId`, un `invoiceId` ou un `userId` de l'agence A, reçoit un 404 identique à un objet inexistant sur chaque route ; `npm run test:isolation` couvre les routes de la spec ; `schema-tenant-coverage`, `routes-inventory` et `route-features` passent.                                                                                                                                                                                                                                          |
| CA-42 | 122                               | Chaque geste de FR-122 écrit une ligne d'audit sans contenu de conversation ni secret.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| CA-43 | 124, 128                          | Aucune variable d'environnement nouvelle (`env.example` inchangé) ; `npm run wiki:check` et le scénario de recette sont à jour ; `SECURITY.md` et `RUNBOOK.md` décrivent le mode, les prix et le taux.                                                                                                                                                                                                                                                                                                                                        |
| CA-44 | 127                               | Le plafond de jetons de sortie et, s'il est activé, le plafond de coût par requête interrompent proprement une boucle trop chère (issue `error`, crédit libéré, coût enregistré) ; désactivé, le comportement d'aujourd'hui est inchangé.                                                                                                                                                                                                                                                                                                     |
| CA-45 | 129, 040, 047                     | Un espace à un seul collaborateur (particulier) reçoit 10 requêtes ; un lot gratuit n'est créé que pour une agence active ; le budget global du gratuit alerte le super-admin.                                                                                                                                                                                                                                                                                                                                                                |
| CA-46 | 003, 123                          | Vérification négative : l'orchestrateur n'écrit jamais dans la file d'audit pour la facturation ; aucune route de la spec n'emploie `withExclusiveSection` (test statique sur le code).                                                                                                                                                                                                                                                                                                                                                       |
| CA-47 | 016, 103 (§7)                     | Les fonctions pures du modèle économique (F1 à F11), alimentées par les hypothèses du §7, reproduisent les tableaux 7.5 à 7.7 à 0,1 point près (test unitaire) ; le rapport de marge sur un jeu de données de test égale le calcul à la main.                                                                                                                                                                                                                                                                                                 |
| CA-48 | 126, 013                          | `GET /ai/status` étendu reste lisible par l'ancien client web (champs ajoutés, aucun retiré) ; en mode `OFF`, la seule différence observable pour l'agence est l'absence de changement.                                                                                                                                                                                                                                                                                                                                                       |

**Sans critère automatisé** : FR-086 (écritures comptables du produit constaté
d'avance : décision de l'expert-comptable), FR-095 et FR-125 (conservation et
base légale : décisions du juriste), FR-047 partiellement pour la partie
« aucune coupure automatique ». Ils se vérifient à la revue et par les
réponses aux questions Q10 et Q11.

## 11. Découpage en lots livrables

Détail (contenu, fichiers, dépendances, tests) dans le [plan](./plan.md) §7 et
les [tâches](./tasks.md). Une PR par lot. Estimation **grossière** en jours
de travail d'un agent de réalisation, relecture comprise, sans compter la
mesure de deux semaines ni les décisions à obtenir.

| Lot | Contenu                                                                                                                                                                                                                                               | Taille | Estimation | Dépend de                                         | Valeur seule                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A   | **Mesure seule** : `usage` dans `LlmTurnResult` et les fournisseurs, `AiUsageEvent`, tarifs des modèles, taux de change, mode `OFF`, vue super-admin de l'usage et du coût, aucune facturation                                                        | M      | 5 à 7 j    | PR #61 (voir ci-dessous) ; rien d'autre           | Le coût réel par requête, par agence et par modèle : la matière des prix             |
| B   | **Portefeuille, dix gratuits, contrôle avant le modèle, jauge, blocage à zéro** : lots, journal, réservation, gratuit, clé `AI_REQUESTS` (enum isolé), modes `SHADOW`/`ENFORCE`, interrupteur IA, `requireAiQuota`, `GET /ai/status` étendu, balayeur | L      | 10 à 14 j  | A                                                 | Le gratuit mensuel appliqué et la dépense bornée ; blocage propre avec « contactez » |
| C   | **Packs mensuels et achat en libre-service** : catalogue `EXT_IA_*`, lots de pack, achat et changement par l'administrateur, écran « Assistant IA » (packs)                                                                                           | M      | 6 à 9 j    | B                                                 | Le premier revenu IA récurrent, sans l'équipe ImmoTopia                              |
| D   | **Dépassement facturé avec plafond et alertes** : opt-in, plafond, nature `AI_USAGE`, facture mensuelle, alertes 80/100 %, suspension pour impayé                                                                                                     | L      | 8 à 12 j   | B (et C pour l'écran ; pas nécessaire au serveur) | Le reste facturé, sans blocage brutal                                                |
| E   | **Recharges prépayées** : offre, achat, paiement en ligne, crédits au règlement, garde d'abonnement, purge des brouillons, avoirs                                                                                                                     | L      | 8 à 12 j   | B ; paiement existant ; C et D indépendants       | Le seul chemin pour un particulier ou une agence sans pack                           |

Chemin critique : A → deux semaines de mesure → B → C → D → E. C, D et E ne se
dépendent pas fonctionnellement (chacun ne dépend que de B) mais touchent les
mêmes fichiers de facturation (`platform-invoice-service.ts`,
`platform-payment-service.ts`, `TenantSubscriptionSettings.tsx`) : ils se
livrent **en série** dans cet ordre, pas en parallèle. Total : environ 37 à
54 jours de réalisation, soit de l'ordre de 8 à 11 semaines en série, **auxquelles
s'ajoutent les deux semaines de mesure** avant les prix.

**Dépendances externes**

- **PR #61 (OpenRouter et `PlatformAiSettings`)**. Elle rend `getLlmProvider()`
  **asynchrone** (`providers/index.ts`, `ai-controller.ts:79,105`,
  `ai-access-middleware.ts:39`) et modifie `contracts.ts` et
  `anthropic-provider.ts`, les deux fichiers que le lot A touche. Deux
  ordres sont possibles : **(1)** fusionner la #61 avant le lot A (recommandé) ;
  **(2)** livrer le lot A en deux temps — A1 : contrat `usage`, Anthropic, faux
  fournisseur, orchestrateur, table et audit ; A2 : usage d'OpenRouter après la
  #61 — et faire rebaser la #61 sur A1. Dans les deux cas, `requireAiQuota` se
  place après un `requireAiAssistantAccess` qui peut devenir asynchrone : il ne
  doit pas supposer l'inverse.
- **Spec 026 (particuliers)**, non fusionnée : elle ajoute `CapacityKey.ACTIFS`
  et modifie la liste `CAPACITY_KEYS`. Les deux ajouts d'enum sont indépendants
  (une migration chacun) ; les conflits sont textuels (`catalog.ts`). Les codes
  `PARTICULIER_*` entrent dans `rules.requiresAnyOf` des packs IA si elle est
  fusionnée avant le lot C.
- **Paiement en ligne** : mode `SIMULATOR` par défaut ; la validation du mode
  réel reste celle du lot 7 des abonnements (non validée).

**Mise en service.** Déployer A (`OFF`), saisir tarifs et taux, mesurer deux
semaines, arrêter les prix (Q6). Déployer B, passer en `SHADOW` et observer la
part de requêtes qui auraient été bloquées. Passer en `ENFORCE` **seulement quand
un moyen d'acheter existe** (au moins C ou E, ou, avant, avec le message
« contactez ImmoTopia » et les routes d'administration existantes). Le retour
arrière normal est de repasser en `OFF`, sans migration.

## 12. Inventaire des fonctionnalités à ajouter à la livraison

À reporter dans `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx`
(`npm run wiki:export`) lot par lot. Fonctionnalité « Assistant IA
ImmoCopilot » (existante) et « Abonnements par packs » (existante), plus une
nouvelle fonctionnalité « Crédits IA » :

- **A** : mesure d'usage par requête ; table des tarifs de modèles ; taux de
  change ; vue super-admin de l'usage et du coût.
- **B** : jauge d'usage dans l'assistant ; gratuit mensuel ; interrupteur IA de
  l'agence ; refus 402 typé ; modes `OFF`/`SHADOW`/`ENFORCE` ; solde et journal
  vus par le super-admin ; dérogations et crédits offerts ; réglages
  plateforme.
- **C** : catalogue des packs IA ; achat et changement de pack par
  l'administrateur ; écran « Assistant IA ».
- **D** : opt-in et plafond du dépassement ; alertes 80/100 % ; facture mensuelle
  de dépassement ; suspension pour impayé.
- **E** : offre de recharge ; achat et paiement d'une recharge ; crédits au
  règlement ; purge des brouillons ; avoir sur recharge.
- **Modifiées** : `GET /ai/status` (champ `credits`, raison `TENANT_DISABLED`),
  `POST /ai/chat` (402, 403, 429 nouveaux), `POST
/subscription/invoices/:id/checkout` (recharge), liste et détail des
  factures (deux natures), avoir, carte « Consommation » (inchangée),
  `notifications` d'alerte de quota.

Détail au [plan](./plan.md) §9.

## 13. Traçabilité — demande → exigences → critères → lot

| Demande de l'utilisateur ou de la cartographie                                           | Réponse                                                                                                    | FR / CA / lot                                    |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| « Les utilisateurs ont 10 requêtes IA gratuites par mois »                               | Réserve gratuite de 10 par collaborateur actif, plafonnée, remise à zéro mensuelle (D1, D4, D9).           | FR-040 à 047, 090, 092 · CA-07, 32, 45 · B       |
| « Le reste est facturé »                                                                 | Pack, recharge, puis dépassement opt-in plafonné, facture mensuelle séparée (D2, D12).                     | FR-060 à 069, 080 à 084 · CA-24 à 27, 30, 31 · D |
| « Ils peuvent souscrire à des packs IA »                                                 | Trois packs mensuels du catalogue, achat en libre-service, un seul actif, changement au prorata (D6, D10). | FR-050 à 059 · CA-19 à 23 · C                    |
| Recharge prépayée (architecture proposée, flux c)                                        | Offre, brouillon, paiement, crédits au règlement, sans effet sur l'abonnement (D11).                       | FR-070 à 079 · CA-28, 29 · E                     |
| Mesure : table d'usage, jetons, coût, modèle                                             | `AiUsageEvent`, `usage` des fournisseurs, tarifs versionnés, taux de change (D16).                         | FR-001 à 009 · CA-01 à 03, 36 · A                |
| Idempotence de la mesure, jamais la file d'audit                                         | `request_id` unique, écriture avec `await` dans une table dédiée.                                          | FR-003, 007, 120 · CA-01, 40, 46 · A, B          |
| Portefeuille, lots, journal, ordre de consommation                                       | `AiCreditGrant`, `AiCreditLedger`, rangs, invariants.                                                      | FR-010 à 019 · CA-04 à 06 · B                    |
| Réservation avant le modèle, concurrence, verrou consultatif                             | Réservation atomique par agence, `withTransactionalAdvisoryLock`, balayeur, règle d'abandon (D3).          | FR-020 à 029, 123 · CA-08 à 11 · B               |
| Contrôle avant le modèle, 402 typé, `quotaPolicy`, interrupteur par agence               | `requireAiQuota`, codes typés, politique d'abonnement, `TenantAiSettings`.                                 | FR-030 à 039 · CA-12 à 17 · B                    |
| Mode `SUBSCRIPTION_ENFORCEMENT` warn et enforce                                          | Tableau des phases et modes propres à l'IA (D7).                                                           | FR-032, 033 · CA-13, 14 · B                      |
| Alertes 80 et 100 %, tâche horaire                                                       | `QuotaAlert` (allocation), horodatages (plafond), tâche dédiée idempotente.                                | FR-063, 091 · CA-25, 33 · B, D                   |
| Interface : jauge, écran, alertes, e-mails                                               | Tiroir, écran « Assistant IA », bandeaux, e-mails, i18n, RTL.                                              | FR-110 à 117 · CA-37 à 39 · B, C, D, E           |
| Super-admin : marge, crédits offerts, dérogations, prix des modèles                      | Vues, tableau de marge, table versionnée, réglages plateforme, coupure forcée.                             | FR-100 à 108 · CA-34 à 36 · A à E                |
| Garde-fous : plafond de jetons, interrupteur, table de prix, tableau de marge, anti-abus | Plafond dur, budget du gratuit, plafond de coût, tarifs versionnés (D15).                                  | FR-037, 047, 127 · CA-17, 44, 45 · B             |
| Échec d'écriture d'usage : fail-open ou fail-closed                                      | Fail-closed avant le modèle, fail-open après, reprise et balayeur (D8).                                    | FR-120 · CA-40 · B                               |
| Erreur de facturation : avoir ou restitution                                             | Avoirs par nature, `REFUND` et `ADJUST` du journal avec motif.                                             | FR-082 à 085 · CA-31 · D, E                      |
| Particuliers, arabe, RTL, libellés                                                       | Aucune règle propre au particulier ; `t()` fr/en/ar, propriétés logiques.                                  | FR-114, 129 · CA-39, 45 · B                      |
| Modèle économique complet, formules, sensibilité, points morts, remises                  | §7 : F1 à F11, tableaux recalculés, exemple, politique de remises, gel des prix.                           | §7 · CA-47 · A (mesure), C, D, E                 |
| Aucun prix figé avant deux semaines de données du lot A                                  | §7.10, mise en service §11.                                                                                | §7.10, §11 · A                                   |
| PR #61 OpenRouter et `getLlmProvider()` asynchrone                                       | Dépendance et ordre de fusion (§11), A1 et A2.                                                             | R-12, Q20 · A                                    |
| Cache de prompt et modèle rapide par défaut                                              | D5, R-18 : à chiffrer et mesurer, non supposé acquis.                                                      | D5, R-02, R-18 · A                               |

## 14. Questions ouvertes

Q1 à Q7 reprennent les cinq décisions de la demande (D1 à D6) et le mode de
contrôle (D7) avec leurs alternatives ; Q1, Q2, Q3 et Q7 bloquent le lot B,
Q6 bloque les lots C, D et E.

| #   | Question                                                                                                                                                                                                                                      | Alternatives                                                                                                                                                                                                                                                            | Qui tranche               | Bloque  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------- |
| Q1  | **D1 — Portée du gratuit.** 10 par collaborateur actif, plafonné à 100 ?                                                                                                                                                                      | 10 **par utilisateur** individuel (chaque personne, pas de réserve commune) ; 10 **par agence** ; un autre plafond que 100 ; un gratuit dégressif.                                                                                                                      | Utilisateur               | B       |
| Q2  | **D2 — « Le reste facturé ».** Dépassement en opt-in avec plafond mensuel ?                                                                                                                                                                   | Facturation après coup **sans plafond** (déconseillé : facture surprise) ; blocage strict sans dépassement (pack ou recharge seulement) ; dépassement activé par défaut avec plafond suggéré.                                                                           | Utilisateur               | D       |
| Q3  | **D3 — Une requête.** 1 message = 1 crédit ; abandon facturé si un fragment est émis ; exécution de document gratuite ; expert à 3 crédits hors périmètre.                                                                                    | Facturer tout abandon ; ne facturer que les réponses complètes ; facturer aussi l'exécution d'un document ; livrer l'expert à 3 crédits ; facturer selon le nombre de tours ou de jetons.                                                                               | Utilisateur               | B       |
| Q4  | **D4 — Reports et expiration.** Fin de mois UTC, recharges de 12 mois, aucun remboursement.                                                                                                                                                   | Report d'un mois du non-consommé d'un pack (« rollover ») ; recharges de 6 ou 24 mois ; remboursement du non-consommé d'une recharge (**[À VALIDER — juriste]**).                                                                                                       | Utilisateur / juriste     | C, E    |
| Q5  | **D5 — Modèle par défaut.** Passer à un modèle rapide avec cache ; l'expert en option ?                                                                                                                                                       | Garder le haut de gamme (déficitaire partout, §7.5) ; deux niveaux d'offre (rapide inclus, expert facturé plus cher) ; choix du modèle par l'agence.                                                                                                                    | Utilisateur / Pilote      | A, B    |
| Q6  | **D6 — Prix.** Pack 100 à 9 900, Pack 500 à 39 900, Pack 2 000 à 129 900, dépassement 120, recharge 100 à 12 900. À figer après deux semaines de mesure.                                                                                      | Grille à un ou deux packs ; prix au coût mesuré × un coefficient cible ; recharges plus grandes ; prix différents pour les particuliers (voir Q14).                                                                                                                     | Utilisateur               | C, D, E |
| Q7  | **D7 — Mode de contrôle.** Mode propre à l'IA (`AiBillingMode`, en base), distinct de `SUBSCRIPTION_ENFORCEMENT` ?                                                                                                                            | **Réutiliser `SUBSCRIPTION_ENFORCEMENT`** tel quel (aucun réglage nouveau, mais un blocage IA lié au basculement de tous les modules, et aucune protection tant que la valeur reste `warn`, défaut de production) ; variable d'environnement dédiée au lieu de la base. | Utilisateur / Pilote      | B       |
| Q8  | **Conversion et frais de passerelle.** Quelle conversion gratuit → payant est visée (§7.6) ? Quels sont les frais réels PaySecureHub et mobile money ? Non déduits des marges du §7.5.                                                        | Cible de conversion par segment ; frais lus dans `providerFees` après quelques paiements réels ; frais refacturés (**[À VALIDER — juriste]**).                                                                                                                          | Utilisateur               | C, D, E |
| Q9  | **TVA d'une recharge facturée à un client à l'étranger** (diaspora, packs Patrimoine) et des avoirs.                                                                                                                                          | Taux unique de 18 % (retenu par défaut) ; exonération ou autre régime selon la résidence du client. **[À VALIDER — expert-comptable]**                                                                                                                                  | Expert-comptable          | E       |
| Q10 | **Produit constaté d'avance** des recharges non consommées et écritures.                                                                                                                                                                      | Constatation à l'encaissement ; à la consommation (la spec en fournit les données, FR-086). **[À VALIDER — expert-comptable]**                                                                                                                                          | Expert-comptable          | E       |
| Q11 | **Conservation** du journal d'usage et des lots, protection des données, sous-traitants (Anthropic, OpenRouter), extension de l'export de données d'agence.                                                                                   | Durées (12, 24, 60 mois) ; agrégation puis suppression des lignes détaillées. **[À VALIDER — juriste]**                                                                                                                                                                 | Juriste                   | A, tous |
| Q12 | **Mentions contractuelles** (conditions générales) : validité des crédits, non-remboursement, dépassement et plafond, suspension pour impayé, disponibilité du service.                                                                       | Texte à rédiger par le juriste ; intégré à l'écran d'achat et aux factures. **[À VALIDER — juriste]**                                                                                                                                                                   | Juriste                   | C, D, E |
| Q13 | **Seuils commerciaux** : plafond de réserve gratuite (100), plafond dur mensuel (5 000), plafond suggéré du dépassement (20 000), bornes (1 000 à 500 000), plancher de marge (1,30), budget global du gratuit. **[À VALIDER — utilisateur]** | Autres valeurs, après le lot A.                                                                                                                                                                                                                                         | Utilisateur               | B, D    |
| Q14 | **Offre IA.** Un seul pack IA à la fois (retenu) ? Pack IA pendant l'essai (refusé) ? **Pack moins cher pour les particuliers** (le Pack 100 à 9 900 vaut 3,4 fois « Particulier Plus » à 2 900, spec 026) ?                                  | Packs cumulables ; pack en essai avec crédits activés à la fin de l'essai ; pack de 20 à 30 requêtes pour les particuliers.                                                                                                                                             | Utilisateur               | C       |
| Q15 | **Suspension du dépassement pour facture impayée** : étend D15 des abonnements (« dépassement impayé sans effet automatique ») à la seule fonction IA.                                                                                        | Aucun effet automatique, lecture seule manuelle en recours (D15 strict) ; délai de grâce avant suspension.                                                                                                                                                              | Utilisateur               | D       |
| Q16 | **Facture de recharge** : brouillon jusqu'au règlement (retenu), ou émise dès la demande ?                                                                                                                                                    | Émise à la demande (code plus simple : le paiement en ligne part d'une facture émise, mais un numéro est consommé par tentative abandonnée, à annuler par avoir). **[À VALIDER — expert-comptable]**                                                                    | Expert-comptable / Pilote | E       |
| Q17 | **Période des crédits** : mois calendaire UTC (retenu) ou période d'abonnement (ancre `currentPeriodStart`, comme `alertPeriodStart`).                                                                                                        | Période d'abonnement : alignée sur la facture de période, mais différente d'une agence à l'autre et floue en essai.                                                                                                                                                     | Utilisateur               | B       |
| Q18 | **D8 — Fail-open ou fail-closed** : fail-closed avant le modèle (en `ENFORCE`), fail-open après la réponse ?                                                                                                                                  | Fail-open partout (jamais de refus pour panne de facturation, mais un appel non mesuré) ; fail-closed partout (plus strict, plus de refus).                                                                                                                             | Utilisateur               | B       |
| Q19 | **`AI_REQUESTS` dans l'enum `CapacityKey`** (retenu : réutilise `CatalogCapacity`, `QuotaAlert`, `CapacityOverride`, `InvoiceLine`) ou clé `rules.aiCredits` du catalogue **sans migration d'enum**.                                          | `rules.aiCredits` : moins de réutilisation des tables, mais aucun `ALTER TYPE` irréversible.                                                                                                                                                                            | Pilote (technique)        | B       |
| Q20 | **Ordre de fusion** : PR #61 avant le lot A (retenu), ou A en deux temps ; spec 026 avant ou après C.                                                                                                                                         | Voir §11.                                                                                                                                                                                                                                                               | Pilote                    | A, C    |
| Q21 | **Anti-abus du gratuit** avec l'inscription libre de la spec 026 : e-mail vérifié (prévu par 026) suffit-il ? Captcha (que 026 écarte « à ce stade »), délai avant le premier gratuit, budget global du gratuit avec coupure automatique.     | Gratuit réservé aux agences avec pack payant ; gratuit réduit pour un particulier sans revenu.                                                                                                                                                                          | Utilisateur               | B       |
| Q22 | **Remboursement partiel d'une recharge entamée** (crédit d'avoir au prorata des crédits non consommés).                                                                                                                                       | Jamais (retenu, D4) ; sur décision du super-admin seulement. **[À VALIDER — juriste]**                                                                                                                                                                                  | Juriste / utilisateur     | E       |
| Q23 | **Facturation minimale** du dépassement : toute somme positive est facturée en V1 ; faut-il un seuil (par exemple 1 000 F HT) avec report au mois suivant ?                                                                                   | Seuil avec report ; cumul sur le trimestre ; rien sous le seuil (perte assumée).                                                                                                                                                                                        | Utilisateur               | D       |
