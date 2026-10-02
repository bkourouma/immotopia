# Tâches — facturation des crédits IA d'ImmoCopilot

**Entrées** : [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md),
[contracts/openapi.yaml](./contracts/openapi.yaml)
**Statut** : proposition. **Aucune tâche n'est engagée** : la décision du 29/09/2026
est de spécifier seulement.

**Tests** : requis pour chaque lot (mouvements de crédits, concurrence, factures,
paiement, isolation multi-tenant).

## Format : `[ID] [P?] [Lot] Description` (fichier ; critère)

- `[P]` : peut se faire en parallèle (fichiers différents, dépendances levées).
- `Lot` : A à E, voir [plan.md](./plan.md) §7 ; `A2` = la partie du lot A qui
  attend la fusion de la PR #61. CA : critère d'acceptation de
  [spec.md](./spec.md) §10.
- Chemins : `packages/api/…` (API), `apps/web/src/…` (web). Ne pas grossir
  `subscription-v2-service.ts` ni `platform-invoice-service.ts` au-delà d'un point
  d'accroche : le code neuf vit dans `lib/ai/billing/` et `services/ai-*.ts`.
- Aucune tâche n'exécute git ni n'installe de dépendance ; `npx prisma generate`
  se lance depuis `packages/api`, hors jonction partagée.

## Phase 0 — Décisions à obtenir avant le lot concerné

- [ ] T000a Trancher **Q20** (ordre de fusion : PR #61 avant le lot A, ou A en deux temps ; spec 026 avant ou après C) (bloque A).
- [ ] T000b Trancher **Q1, Q2, Q3, Q7, Q17, Q18, Q19, Q21** (gratuit, reste facturé, définition d'une requête, mode propre à l'IA, période, fail-open, `AI_REQUESTS` dans l'enum ou `rules.aiCredits`, anti-abus) (bloque B).
- [ ] T000c Trancher **Q5 puis Q6, Q8, Q13** avec les **données du lot A** : modèle par défaut, prix, conversion et frais de passerelle, seuils (bloque C, D, E). Aucun prix n'est figé avant deux semaines de mesure.
- [ ] T000d Trancher **Q14** (un seul pack IA, pack IA pendant l'essai, pack moins cher pour les particuliers) (bloque C).
- [ ] T000e Trancher **Q15, Q23** (suspension pour impayé, facturation minimale) (bloque D).
- [ ] T000f Obtenir **Q9, Q10, Q16, Q22** de l'expert-comptable et **Q11, Q12** du juriste (TVA d'un client étranger, produit constaté d'avance, facture émise ou brouillon, remboursement partiel, conservation, mentions contractuelles) (bloque E ; Q11 bloque l'ouverture de A en production).

## Lot A — Mesure seule

**But** : connaître le coût réel par requête, par agence et par modèle, sans rien
changer pour l'agence. Mode `OFF`.

- [ ] T001 [A] Ajouter enums `AiBillingMode`, `AiCostSource` et modèles `AiUsageEvent`, `AiModelPrice`, `PlatformAiBillingSettings` dans `packages/api/prisma/schema.prisma` (data-model §1.1, §2.1, §3.1, §3.3) ; relation inverse `Tenant`.
- [ ] T002 [A] Générer la migration `<horodatage>_ia_credits_mesure` (additive, data-model §6) avec son `rollback.sql` ; l'appliquer sur une copie de la base de démonstration (CA-43).
- [ ] T003 [A] `npx prisma generate` depuis `packages/api` (hors jonction partagée).
- [ ] T004 [P] [A] `__tests__/unit/schema-tenant-coverage.test.ts:61` : classer `PlatformAiBillingSettings` et `AiModelPrice` dans `GLOBAL_MODELS` avec leur raison (CA-41).
- [ ] T005 [A] `lib/ai/contracts.ts:249-253` : `LlmUsage`, `LlmTurnResult.usage?`, `ChatRunSummary`, port `AiBillingSession` (`settle`, `ensureClosed`) (CA-03).
- [ ] T006 [P] [A] `lib/ai/providers/anthropic-provider.ts:179-188` : renvoyer `usage` (entrée, sortie, cache lu, cache écrit) et `model` de `message` ; mettre à jour `ai.anthropic-provider.test.ts` (CA-03).
- [ ] T007 [P] [A] `lib/ai/providers/fake-provider.ts` : usage déterministe et étape « sans usage » pour tester `usage_complete` (CA-03).
- [ ] T008 [A] `lib/ai/orchestrator.ts:108-232` : cumul d'usage sur les tours, `providerCalls`, `emittedText` dans le rappel `text_delta` (`:148`), `ChatRunSummary`, `await input.billing?.settle(summary)` en `try/catch` avant `AI_CHAT_TURN` (`:210`), payload d'audit enrichi **sans contenu** ; l'orchestrateur n'importe aucun service de base (CA-02, CA-46).
- [ ] T009 [P] [A] `lib/ai/billing/ai-period.ts` (pur) : clé de mois UTC, bornes, prorata `ceil` ; tests de minuit (CA-22, CA-32).
- [ ] T010 [P] [A] `lib/ai/billing/ai-pricing.ts` (pur) : `resolveModelPrice`, `computeRequestCost` (formule F2, coût rapporté prioritaire) ; tests (CA-03, CA-36).
- [ ] T011 [A] `services/ai-billing-settings-service.ts` : lecture et écriture du réglage plateforme (cache 30 s, invalidé à l'écriture), tarifs de modèles versionnés, audit sans secret (CA-36).
- [ ] T012 [A] `services/ai-usage-service.ts` : `recordUsageEvent` (`INSERT … ON CONFLICT (request_id) DO UPDATE`, `await`), file de reprise bornée (1 000, attente 1, 5, 30 s), audit `AI_USAGE_WRITE_FAILED` (CA-01, CA-40).
- [ ] T013 [A] `lib/ai/billing/ai-billing-session.ts` : session minimale du mode `OFF` (`settle` écrit l'événement `UNBILLED`) ; branchement dans `controllers/ai-controller.ts` après `resolvePageContext` (`:114`) (CA-01, CA-48).
- [ ] T014 [A] `types/audit-types.ts:119-125` : clés d'audit du lot (`AI_BILLING_SETTINGS_CHANGED`, `AI_USAGE_WRITE_FAILED`, …) (CA-42).
- [ ] T015 [A] Routes d'administration : `GET /admin/ai-billing/usage`, `GET`/`PUT /admin/ai-billing/settings`, `GET`/`POST /admin/ai-billing/model-prices` ; schémas Zod `.strict()` (`lib/ai/billing/ai-schemas.ts`), contrôleur, routeur monté dans `routes/admin-routes.ts` ; `requirePermission('PLATFORM_SUBSCRIPTIONS_*')` puis `requireSuperAdmin` (CA-34, CA-36).
- [ ] T016 [P] [A] `lib/ai/billing/ai-economics.ts` (pur) : F1 à F11 ; test unitaire qui reproduit les tableaux 7.5 à 7.7 de la spec à 0,1 point près (CA-47).
- [ ] T017 [P] [A] `scripts/ai-margin-report.ts` (version A) : coût moyen et 95ᵉ centile par modèle, requêtes par agence et par collaborateur, part d'usage incomplet, distribution des tours (spec §7.10).
- [ ] T018 [P] [A] Tests unitaires : usage cumulé sur 3 tours, orchestrateur (aucun contenu dans l'événement ni l'audit), écriture idempotente, mode `OFF` (`ai.usage.test.ts`) (CA-01, CA-02, CA-03).
- [ ] T019 [P] [A] Tests API des routes d'administration : permissions, double garde, isolation, `routes-inventory` ; test d'intégration sur base réelle (événement écrit, `request_id` idempotent) (CA-01, CA-41).
- [ ] T020 [P] [A] Web : `types/ai-credits.ts`, `services/ai-credits-service.ts`, page `pages/admin/AiBilling.tsx` (usage et coût par agence et modèle, tarifs, taux de change, mode, alertes « modèle sans tarif ») ; route `React.lazy` (`App.tsx`) (CA-34).
- [ ] T021 [A] i18n (API et web), wiki (plan §9, lot A), `SECURITY.md`, `RUNBOOK.md` (mode, tarifs, taux), HANDOFF (CA-39, CA-43).
- [ ] T022 [A2] **Après la fusion de la PR #61** : `providers/openrouter-provider.ts` demande et lit l'usage du flux (format à confirmer dans la documentation du fournisseur), coût rapporté repris tel quel ; tests (CA-03).

**Point de contrôle A** : mode `OFF` ; chaque requête écrit un événement sans contenu ; aucun comportement observable ne change pour une agence ; tarifs et taux saisis ; deux semaines de mesure avant tout prix.

## Lot B — Portefeuille, dix gratuits, contrôle avant le modèle

**But** : solde par agence, gratuit mensuel, réservation atomique, refus typé, jauge,
interrupteur. Mise en service en `SHADOW` puis `ENFORCE`.

- [ ] T023 [B] Migration **isolée** `<horodatage>_ia_credits_enum_capacity` : `ALTER TYPE "CapacityKey" ADD VALUE IF NOT EXISTS 'AI_REQUESTS'` et rien d'autre (précédent `20261001101500_patrimoine_pack_enums`) ; documenter l'irréversibilité dans le `rollback.sql`.
- [ ] T024 [B] Ajouter enums `AiCreditSource`, `AiUsageStatus`, `AiLedgerEntryType`, `AiUsageMonthStatus`, modèles `AiCreditGrant`, `AiCreditLedger`, `AiUsageMonth`, `TenantAiSettings`, colonnes du lot B sur `AiUsageEvent` et `PlatformAiBillingSettings` (data-model §1.1, §2, §3.1) ; migration `ia_credits_portefeuille` : `CHECK`, index uniques partiels, index partiel de réservation, déclencheur d'ajout seul du journal, `rollback.sql` ; copie de la base de démonstration (CA-04).
- [ ] T025 [B] `npx prisma generate` depuis `packages/api`.
- [ ] T026 [P] [B] `lib/subscription/catalog.ts` : `CatalogCapacityKeyCode`, `FLOW_CAPACITY_KEYS` ; **`CAPACITY_KEYS` inchangé** ; test qui échoue si `AI_REQUESTS` entre dans `CAPACITY_KEYS` ; `entitlements.capacities` et les usage providers restent sans IA (R-09).
- [ ] T027 [P] [B] `lib/ai/billing/ai-policy.ts` (pur) : sources permises selon la phase (`resolveSubscriptionPhase`), `SUBSCRIPTION_ENFORCEMENT`, `quotaPolicy`, mode ; tests exhaustifs du tableau FR-033 (CA-14, CA-15).
- [ ] T028 [P] [B] `lib/ai/billing/ai-errors.ts` : `AiCreditsExhaustedError`, `AiOverageCapReachedError`, `AiTenantDisabledError`, `AiMonthlyLimitError`, `AiBillingUnavailableError` (sous-classes d'`AppError`, `data` typé) ; `CopilotErrorCode` élargi (`contracts.ts:23-34`) (CA-12).
- [ ] T029 [B] `services/ai-credits-service.ts` : `countActiveCollaborators` (définition de `tenant-middleware.ts:127-152`), `ensureMonthlyGrantsTx` (gratuit, hausse par `ADJUST`, dérogation) (CA-07).
- [ ] T030 [B] `reserveCredit` : `withTransactionalAdvisoryLock('ai-credits:<tenantId>', …, { maxWaitMs: 2000, timeoutMs: 4000 })`, sélection ordonnée, décrément gardé avec retentative, journal, événement `RESERVED`, `SHADOW` (`UNBILLED`, `shadow_blocked`) ; SQL brut filtré par `tenant_id` (CA-05, CA-08, CA-13).
- [ ] T031 [B] `settleRequest` et `releaseRequest` : règle de FR-022 (consommé si `end_turn` ou abandon après un fragment, sinon libéré), mise à jour conditionnelle, lot expiré non restitué, compteurs du mois, coût enregistré dans tous les cas ; copie de `unit_value_xof` du lot sur l'événement réglé (CA-06, CA-09).
- [ ] T032 [B] `getWalletSnapshot` (solde par source, alloué, consommé, réservé, remise à zéro, `canPurchase`) (CA-05, CA-12).
- [ ] T033 [B] `sweepOrphanReservations` et `expireGrants` (écritures `EXPIRE`, statut `EXPIRED`) ; idempotence (CA-10, CA-33).
- [ ] T034 [B] `lib/ai/billing/ai-billing-session.ts` : session complète (`reserve`, `settle`, `ensureClosed`) selon le mode ; fail-closed avant le modèle en `ENFORCE`, fail-open après, file de reprise (CA-09, CA-40).
- [ ] T035 [B] `services/tenant-ai-settings-service.ts` : interrupteur de l'agence, coupure forcée du super-admin, dérogations (gratuit, plafond dur, prix) ; lecture sans écriture pour une agence sans ligne (CA-16, CA-35).
- [ ] T036 [B] `middleware/ai-quota-middleware.ts` (`requireAiQuota`) inséré dans `routes/ai-routes.ts:32-40` après `aiTenantDailyLimiter` : mode, interrupteur, plafond dur, pré-contrôle sans effet de bord (CA-12, CA-16, CA-17).
- [ ] T037 [B] `controllers/ai-controller.ts:103-136` : réservation entre `resolvePageContext` et `openSseStream`, `try/finally` (`stream.end()` puis `session.ensureClosed()`), passage de la session à `runChat` ; `:77-93` : `credits` et raison `TENANT_DISABLED` dans `GET /ai/status`, sans retirer de champ (CA-11, CA-12, CA-48).
- [ ] T038 [B] `jobs/ai-credits-job.ts` : passage horaire à `hh:20` (balayeur, expiration, alertes), `runWithTenantContext` par agence, idempotent ; `index.ts:57` : `startAiCreditsJob()` ; exporter `notify` de `subscription-usage-job.ts:149` (CA-10, CA-33).
- [ ] T039 [B] Alertes 80 et 100 % de l'allocation : `QuotaAlert` de capacité `AI_REQUESTS`, une fois par seuil et par mois, e-mail aux administrateurs (`agencyAdminRecipients`), alerte au super-admin aux 100 % (CA-25).
- [ ] T040 [B] Alertes du super-admin : budget global du gratuit, usage incomplet au-dessus de 5 %, échecs d'écriture (CA-18, CA-34).
- [ ] T041 [P] [B] Routes d'agence en lecture : `GET /subscription/ai`, `GET /subscription/ai/usage`, `PUT /subscription/ai/settings` (interrupteur) ; `TENANT_SETTINGS_VIEW` / `EDIT` ; `routes-inventory` (CA-16, CA-38, CA-41).
- [ ] T042 [P] [B] Routes super-admin : `GET /admin/tenants/:tenantId/ai-billing` (+ `usage`, `ledger`, `usage/export`), `POST …/grants` (crédits offerts, restitution, motif obligatoire), `PUT …/overrides` (dérogations, coupure forcée) ; `PLATFORM_SUBSCRIPTIONS_*` (CA-34, CA-35).
- [ ] T043 [B] Réglages plateforme du lot B : `mode`, gratuit (10 et 100), plafond dur, budget du gratuit, délai des orphelines (`PlatformAiBillingSettings`) ; audit ; prise en compte sous 30 s (CA-18).
- [ ] T044 [P] [B] Web : `utils/event-stream.ts:10-14,73-77` transmet `data` de l'erreur ; `hooks/useCopilotChat.ts:33-47` transmet le 402 ; `CopilotStatus` étendu (`types/copilot.ts:117-123`) (CA-37).
- [ ] T045 [P] [B] Web : `CopilotCreditsGauge` et `CopilotBlockedNotice` dans `CopilotDrawer.tsx` ; masquage `TENANT_DISABLED` dans `CopilotRoot.tsx:53,72` ; texte saisi conservé (CA-37).
- [ ] T046 [P] [B] Web : page `pages/tenant/TenantAiSettings.tsx` (consommation, solde, interrupteur, historique sans contenu) ; route `React.lazy` `/tenant/:tenantId/settings/assistant-ia` ; lien depuis `TenantSubscriptionSettings.tsx` (CA-38).
- [ ] T047 [P] [B] Web super-admin : `AiCreditsTab.tsx` dans la fiche agence (solde, journal, crédits offerts, dérogations, coupure forcée) ; mode dans `AiBilling.tsx` (CA-34, CA-35).
- [ ] T048 [P] [B] Tests unitaires : gratuit (1, 3, 15 collaborateurs), ordre de consommation, règle FR-022, phases et modes (`ai.credits.*.test.ts`) (CA-05, CA-07, CA-09, CA-13, CA-14).
- [ ] T049 [B] Tests d'**intégration sur base réelle** : 20 requêtes simultanées sur un solde de 5 (exactement 5 réussies, aucun négatif, aucun interblocage) ; 50 agences en parallèle sans saturer le pool ; invariants I-1 à I-4 (`__tests__/integration/ai-credits.concurrency.test.ts`) (CA-04, CA-08).
- [ ] T050 [P] [B] Tests d'injection de panne : échec du règlement après réponse (reprise, puis `AI_USAGE_WRITE_FAILED`), réservation impossible en `ENFORCE` (503) et en `SHADOW` (passe) (CA-40).
- [ ] T051 [P] [B] Tests de non-régression : `ai.routes.test.ts`, `ai.orchestrator.test.ts` inchangés (mode `OFF`), `routes-inventory`, `route-features`, `schema-tenant-coverage`, `npm run test:isolation` (CA-41, CA-48).
- [ ] T052 [P] [B] Test statique : aucune route ni service de la spec n'emploie `withExclusiveSection` ; l'orchestrateur n'importe aucun service de base (CA-46).
- [ ] T053 [B] Vérification de `SUBSCRIPTION_ENFORCEMENT` : les trois modes sur les quatre phases du tableau FR-033 (CA-14).
- [ ] T054 [P] [B] `scripts/ai-credits-reconcile.ts` : recalcule `AiUsageMonth` depuis `ai_usage_events` et le journal, vérifie I-1 à I-5 et I-14, rapport (lecture seule par défaut) (data-model §2.4).
- [ ] T055 [P] [B] `scripts/ai-margin-report.ts` : ajouter les sources, le revenu imputé, la casse et les requêtes libérées (CA-34, CA-47).
- [ ] T056 [B] Réglage `SHADOW` par défaut à la mise en service : procédure documentée dans le RUNBOOK (bascule `OFF` → `SHADOW` → `ENFORCE`, retour à `OFF`), échéance de bascule dans le HANDOFF (R-16).
- [ ] T057 [P] [B] Anti-abus et garde-fous de coût : plafond dur mensuel, budget du gratuit, limite d'invitations de collaborateurs pour gonfler la réserve **[si Q21 le demande]** ; revue de `AI_MAX_OUTPUT_TOKENS` au vu des mesures du lot A ; plafond de coût par requête facultatif (`maxCostPerRequestXof`, désactivé par défaut, issue `error`, crédit libéré) (CA-17, CA-44, CA-45).
- [ ] T058 [B] i18n (API et web), arabe et RTL vérifiés, accessibilité de la jauge (CA-37, CA-39).
- [ ] T059 [B] Wiki (plan §9, lot B), scénario de recette, `SECURITY.md`, `RUNBOOK.md`, `DATA_MODELS.md`, ADR, HANDOFF (CA-43).
- [ ] T060 [B] Contrôle de fin de lot : `npm run typecheck` (aucune erreur ajoutée), lint, tests, `test:isolation`, `check:architecture`.

**Point de contrôle B** : en `SHADOW`, rien ne change pour l'agence ; en `ENFORCE`, un compte à zéro reçoit un 402 JSON avant tout flux et le fournisseur n'est jamais appelé ; la concurrence ne fait jamais passer un solde sous zéro.

## Lot C — Packs mensuels et achat en libre-service

**But** : le premier revenu IA récurrent, acheté par l'administrateur sans passer
par l'équipe ImmoTopia. La clé `AI_REQUESTS` existe depuis le lot B.

- [ ] T061 [C] Ajouter `EXT_IA_100`, `EXT_IA_500`, `EXT_IA_2000` à `DEFAULT_CATALOG` (`lib/subscription/catalog.ts`) et au seed (`prisma/seeds/catalog-seed.ts`) ; migration d'amorçage `ia_credits_catalogue` (précédent `20261001101600_patrimoine_pack_catalogue`, idempotente `ON CONFLICT DO NOTHING`) ; `catalog_capacities` `AI_REQUESTS` ; `rules.requiresAnyOf` (packs de base, dont `PARTICULIER_*` si la spec 026 est fusionnée) (CA-19).
- [ ] T062 [C] `subscription-v2-service.ts:95` : `toCatalogEntry` lit le type de capacités élargi ; vérifier que `getUsage`, `computeOverageForUsage` et `computeCapacityLimits` restent inchangés et sans IA (CA-19, R-09).
- [ ] T063 [C] `services/ai-pack-service.ts` : `subscribeAiPack` (mode `ENFORCE`, phase, pack unique) par `addSubscriptionItem` (`:591`) puis lot du mois proratisé ; erreurs `AI_PACK_NOT_DURING_TRIAL`, `AI_BILLING_NOT_ACTIVE`, `AI_PACK_READ_ONLY` (CA-19, CA-21, CA-22).
- [ ] T064 [C] `changeAiPack` : montée immédiate avec avoir au prorata et report du restant (`ADJUST`), descente à l'échéance ; **extraire** le cœur de `changePack` (`:887-1097`) pour l'employer aux extensions `aiPack` sans le dupliquer ; `cancelAiPack` (`removeSubscriptionItem`, `:760`) (CA-20).
- [ ] T065 [C] Lots `PACK_MONTHLY` : création lazy par élément et par mois, expiration `min(fin du mois, endsAt)`, cycle annuel (facture ×11, crédit mensuel) dans `ensureMonthlyGrantsTx` (CA-22).
- [ ] T066 [P] [C] Routes d'agence : `GET /subscription/ai/offers`, `PUT`/`DELETE /subscription/ai/pack` ; `TENANT_SETTINGS_EDIT` ; invalidation du cache des droits (`invalidateEntitlements`) ; `routes-inventory` (CA-19, CA-41).
- [ ] T067 [P] [C] Plancher de marge : avertissement au super-admin quand le prix unitaire net d'un pack IA passe sous `coût moyen × marginFloorMultiplier` (colonne du réglage, migration `ia_credits_catalogue`) (CA-23).
- [ ] T068 [P] [C] Web : `AiPackCard` (offres, prix HT et TTC, prorata, changement) dans `TenantAiSettings.tsx` ; `CopilotBlockedNotice` : lien d'achat pour l'administrateur (CA-37, CA-38).
- [ ] T069 [P] [C] Tests : achat, unicité, montée et descente, prorata `ceil`, cycle annuel, refus (essai, lecture seule, hors `ENFORCE`), permissions, retrait avec le pack de base, entitlements inchangés (CA-19 à CA-23).
- [ ] T070 [P] [C] Tests d'isolation : `itemId` d'une autre agence, `routes-inventory`, `route-features` (préfixe `/subscription` exempté) (CA-41).
- [ ] T071 [C] i18n, wiki (plan §9, lot C), scénario de recette, HANDOFF (CA-39, CA-43).

**Point de contrôle C** : `entitlements.capacities` est identique à celui d'avant le lot ; un pack acheté crédite le mois en cours au prorata et chaque 1er du mois ; les agences sans pack IA ne changent pas.

## Lot D — Dépassement facturé avec plafond et alertes

- [ ] T072 [D] Migration **isolée** `ia_credits_enum_usage` : `PlatformInvoiceNature` `ADD VALUE 'AI_USAGE'` ; puis migration `ia_credits_depassement` : colonnes du lot D (`ai_usage_months`, `tenant_ai_settings`, `platform_ai_billing_settings`), index unique partiel `invoices_ai_usage_period_key`, `rollback.sql` (data-model §6).
- [ ] T073 [D] `services/tenant-ai-settings-service.ts` : opt-in du dépassement, plafond obligatoire et borné (400 sinon), audit ; `PUT /subscription/ai/settings` accepte `overageEnabled` et `overageMonthlyCapXof` (CA-24).
- [ ] T074 [D] `reserveCredit` : réservation de dépassement (conditions (a) à (g) de FR-062, prix figé, compteur `overage_credits` et plafond sous le verrou) ; `AI_OVERAGE_CAP_REACHED` ; suspension pour facture `AI_USAGE` `OVERDUE` (CA-15, CA-24, CA-27).
- [ ] T075 [D] `services/ai-overage-billing-service.ts` : `billClosedMonths` (mois échu, sans orpheline), lignes `USAGE` groupées par prix, brouillon `AI_USAGE` (`subscriptionId` nullable), `generateInvoiceForPeriodTx` + `issuePlatformInvoiceTx` sous `lockTenantBillingTx` (**pas** `generateInvoiceForPeriod`), e-mail, mois `INVOICED` ou `WAIVED` (CA-26).
- [ ] T076 [D] `jobs/ai-credits-job.ts` : passage quotidien à 02:45 UTC (`billClosedMonths`) ; alertes 80 et 100 % du plafond (horodatages de `AiUsageMonth`) (CA-25, CA-26).
- [ ] T077 [D] `platform-invoice-service.ts:566-575` : `markOverdueInvoices` inclut `AI_USAGE` ; `:595-603` : `issueCreditNote` accepte `AI_USAGE` et rouvre le mois (`overage_invoice_id` nul, `OPEN`) (CA-27, CA-31).
- [ ] T078 [P] [D] PDF et libellés : `lib/subscription/platform-invoice-pdf.ts:169`, `platform-invoice-labels.ts:18-20`, `InvoicesTab.tsx:75,377`, `platform-billing-service.ts:16` ; libellés fr, en, ar (CA-30, CA-39).
- [ ] T079 [P] [D] Web : `AiOverageCard` (activation, plafond, équivalent en requêtes), bandeaux 80 et 100 %, facture du mois dans `TenantInvoicesSection.tsx` (CA-38).
- [ ] T080 [P] [D] Tests : plafond exact (10 requêtes pour 1 200 F à 120 F), deux requêtes simultanées au plafond, facture 37 × 120 = 4 440 HT / TVA 799 / total 5 239, idempotence de deux passages, mensuel et annuel, `SHADOW` sans facture, montant nul `WAIVED`, suspension et levée, avoir et refacturation (CA-24 à CA-27, CA-31).
- [ ] T081 [D] i18n, wiki (plan §9, lot D), RUNBOOK (facturation du dépassement), scénario de recette, HANDOFF (CA-39, CA-43).

**Point de contrôle D** : aucune facture de dépassement sans opt-in ; le plafond n'est jamais franchi, même sous concurrence ; un impayé suspend le dépassement sans toucher à l'abonnement.

## Lot E — Recharges prépayées

- [ ] T082 [E] Migration **isolée** `ia_credits_enum_topup` : `PlatformInvoiceNature` `ADD VALUE 'AI_TOPUP'` ; puis `ia_credits_recharges` : `ai_topup_offers`, amorçage `AI_TOPUP_100`, `rollback.sql` ; `GLOBAL_MODELS` : `AiTopupOffer` (CA-41).
- [ ] T083 [E] `services/ai-topup-service.ts` : `createTopupOrder` (mode `ENFORCE`, réutilisation d'un brouillon identique de moins de 15 minutes, brouillon `AI_TOPUP`, ligne `USAGE`, quantité 1 à 10) puis `startInvoiceCheckout` (CA-28, CA-29).
- [ ] T084 [E] `platform-payment-service.ts:446-448,495-498` : brouillon payable pour la seule nature `AI_TOPUP` ; libellé d'article et de commande d'après l'offre (CA-28).
- [ ] T085 [E] `platform-payment-service.ts:175-223` : dans `settlePlatformInvoiceTx`, émission du brouillon `AI_TOPUP` dans la même transaction (numéro continu), puis `grantTopupCreditsTx` (lot `TOPUP`, `expires_at = règlement + validité`, ligne `GRANT`, `invoice_id` unique) ; idempotence au rejeu d'IPN et de constat (CA-28).
- [ ] T086 [E] `platform-payment-service.ts:234-275` : `applyPaymentToSubscriptionTx` renvoie `NONE` pour `AI_TOPUP` (**un `PAST_DUE` payé par une recharge reste `PAST_DUE`**, période inchangée) (CA-28).
- [ ] T087 [E] Purge des brouillons `AI_TOPUP` de plus de 48 h par la tâche horaire, sans toucher aux paiements en cours ; audit (CA-28).
- [ ] T088 [E] `issueCreditNote` : nature `AI_TOPUP`, refusée (409) si le lot est entamé, sinon `REFUND` négatif du lot (CA-31).
- [ ] T089 [P] [E] Routes d'agence : `POST /subscription/ai/topups` ; routes super-admin : offres (`GET`, `PATCH /admin/ai-billing/topup-offers/:code`) ; constat manuel d'un brouillon de recharge dans `InvoicesTab.tsx` (CA-28, CA-41).
- [ ] T090 [P] [E] Web : `AiTopupCard` (offre, quantité, prix HT et TTC, validité de 12 mois), retour de paiement (`?paiement=`) traité par `TenantAiSettings.tsx`, alerte d'expiration à J-30 (CA-33, CA-38).
- [ ] T091 [P] [E] Tests : règlement et rejeu d'IPN, échec et annulation (aucun lot, aucun numéro), série `IMT` sans trou, essai et lecture seule permis, **abonnement `PAST_DUE` inchangé**, quantités 0 et 11, TVA 2 322 pour 12 900 HT, constat manuel, simulateur PaySecureHub de bout en bout (CA-28 à CA-30).
- [ ] T092 [E] i18n, wiki (plan §9, lot E), mentions contractuelles reprises de Q12, SECURITY (rapprochement serveur-à-serveur inchangé), scénario de recette, HANDOFF (CA-39, CA-43).

**Point de contrôle E** : une recharge payée crédite exactement une fois ; une recharge abandonnée ne laisse ni facture émise ni trou dans la série ; aucun renouvellement d'abonnement par erreur.

## Dépendances

```text
T000a → A ; T000b → B ; A → (2 semaines de mesure) → T000c → C, D, E ; T000d → C ; T000e → D ; T000f → E
A → B → C → D → E                      (chemin critique ; C, D, E ne dépendent que de B mais partagent des fichiers : en série)
T022 [A2]  ⟵  fusion de la PR #61
T023 (enum) → T024 (portefeuille) → T026 (FLOW_CAPACITY_KEYS) → T039 (alertes QuotaAlert)
T072 (enum AI_USAGE) → T075 ; T082 (enum AI_TOPUP) → T085
T086 avant tout test de règlement (T091)
```

## Vérifications à la fin de chaque lot

`npm run typecheck` (aucune erreur ajoutée dans un fichier propre) ;
`npm run lint` ; `npm test` sur les fichiers touchés ; `npm run test:web` ;
`npm run test:isolation` ; `npm run check:architecture` ;
`npm run i18n:extract` (API et web) sans orphelin ; `npm run wiki:export` puis
`wiki:check` ; suite d'abonnement et de facturation inchangée verte ; migration
appliquée sur une copie de la base de démonstration avant tout autre
environnement ; HANDOFF mis à jour.
