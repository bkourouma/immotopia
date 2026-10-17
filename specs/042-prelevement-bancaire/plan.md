# Plan de réalisation — 042 Prélèvement bancaire

> **Branche** : `feat/prelevement-bancaire` · **Worktree** :
> `.claude/worktrees/prelevement` (dépendances propres, `npm ci`, parce que
> le schéma Prisma diverge du checkout principal) · **Rédigé** : 15/10/2026 ·
> **Base** : `origin/main` `7effd904`
> **Documents** : [spec.md](spec.md), [data-model.md](data-model.md),
> [ADR-007](../../docs/architecture/adr/ADR-007-prelevement-bancaire-fichier-et-reglement-confirme.md).

## 1. Lots

| Lot | Contenu                                                                                                                                                                                                                                                                                                                               | Dépend de                              | État         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------ |
| P0  | Cadrage : spec, modèle de données, ADR-007, ce plan. Liste des pièces à obtenir de la banque pilote (spec §2).                                                                                                                                                                                                                        | D1–D8                                  | fait         |
| P1  | Créanciers et mandats (spec §5, contrat data-model.md).                                                                                                                                                                                                                                                                               | P0                                     | fait         |
| P2  | Remises de loyers : sélection des échéances dues (reste dû de l'échéance du mois, plafonné, D6), brouillon `PRL-AAAA-NNNN`, validation humaine, fichier par adaptateur (`GENERIC_CSV`), prénotification à J − 5 ouvrés (D7). Ajout de `DIRECT_DEBIT` à `RentalPaymentMethod`. Unicité (mandat, échéance) sur les lignes non annulées. | P1                                     | fait         |
| P3  | Retour banque : constat manuel par ligne ou par remise, import du relevé ou du fichier de rejets ; règlement → `RentalPayment` `DIRECT_DEBIT` `SUCCESS` + ventilation + quittance (D3) ; rejet → `updatePaymentStatusTx`, frais de rejet (D4), compteur et suspension (D5), notifications.                                            | P2                                     | à faire      |
| P4  | Copropriété : `scope = SYNDIC_LOT`, créancier = compte du syndicat, encaissement par `ChargePayment` (plus ancien d'abord, avance, quittances S3), garde `SYNDIC`.                                                                                                                                                                    | P3                                     | à faire      |
| P5  | Portails locataire et copropriétaire (mandat masqué, prochain prélèvement, demande de révocation) ; tâche quotidienne (brouillons, prénotifications) ; tableau de bord des rejets.                                                                                                                                                    | P3 (P4 pour la copropriété)            | à faire      |
| P6  | Abonnements des agences prélevés (Alliance Consultants créancier).                                                                                                                                                                                                                                                                    | décision du fondateur (D1 : plus tard) | non planifié |

Chaque lot : une PR, empilée sur la précédente tant qu'elle n'est pas fusionnée.

## 2. P1 — territoires

Deux agents en parallèle, **jamais sur le même fichier**. Le contrat
data-model.md §3–§4 est la seule interface entre eux.

### API (agent `dev-complex`)

- `packages/api/prisma/schema.prisma`, `packages/api/prisma/migrations/2026101509*`
- `packages/api/prisma/seeds/rental-permissions-seed.ts`
- `packages/api/src/lib/direct-debit/**` (nouveau : `iban.ts`, `schemas.ts`,
  `creditors.ts`, `mandates.ts`, `mandate-files.ts`, `authorization-pdf.ts`,
  `dto.ts`)
- `packages/api/src/controllers/direct-debit-controller.ts`,
  `packages/api/src/routes/direct-debit-routes.ts`, montage dans
  `packages/api/src/app.ts`
- `packages/api/src/middleware/rental-rbac-middleware.ts` (ajout des deux gardes)
- `packages/api/src/types/audit-types.ts`, `packages/api/src/types/audit-catalog.ts`
- `packages/api/src/lib/ai/gateway/catalog.generated.json` (`npm run ai:catalog`)
- `packages/api/src/i18n/locales/{en,ar}.json`
- `packages/api/__tests__/unit/direct-debit.*.test.ts`

### Web (agent `dev-complex`)

- `apps/web/src/services/direct-debit-service.ts` (types du contrat)
- `apps/web/src/components/rental/direct-debit/**` (panneau du bail,
  formulaire de mandat, actions, carte des créanciers)
- `apps/web/src/pages/rental/DirectDebitMandates.tsx` (liste)
- `apps/web/src/pages/rental/LeaseDetailPage.tsx` (onglet)
- `apps/web/src/pages/tenant/AgencyFinanceSettings.tsx` (carte)
- `apps/web/src/App.tsx` (route), `apps/web/src/navigation/model.tsx`,
  `apps/web/src/navigation/menu-catalog.ts`
- `apps/web/src/constants/permissions-labels.ts`, `apps/web/src/constants/audit-labels.ts`
- `apps/web/src/i18n/locales/{en,ar}/rental.json` (et `settings.json` si la carte y range ses textes)
- `apps/web/src/__tests__/rental/direct-debit*.test.tsx`

### Pilote

Classeur des fonctionnalités (`docs/fonctionnalites/`), `wiki:export`,
HANDOFF, commits, PR.

## 3. P1 — vérifications

- `npx prisma migrate dev` refusé (base partagée) : migration générée par
  `prisma migrate diff`, appliquée par `prisma migrate deploy` sur une base
  **dédiée** du worktree uniquement si elle existe ; sinon `prisma validate`
  - `prisma generate`, et la PR le dit.
- Tests API : `direct-debit.*`, `routes-inventory`, `route-features`,
  `schema-tenant-coverage`, `audit-catalog`, `ai.catalog`,
  `ai.catalog-guards`, `i18n-catalogs-completeness`.
- Tests web : `direct-debit*`, `catalogs-completeness`.
- `npm run typecheck`, `npm run lint`, `npm run check:architecture`.
- Relecture `code-reviewer` et `security-auditor` (IBAN, fichiers privés,
  identifiants d'agence).
- Recette navigateur (spec §6 point 4).

## 4. Pièges connus

- `RentalLease` et `RentalInstallment` utilisent `tenant_id` (snake case) :
  `assertBelongsToTenant(…, { tenantField: 'tenant_id' })`.
- `requireModule` existe mais n'est branché nulle part : la garde
  d'abonnement passe par `lib/subscription/route-features.ts`.
- Pas de crochet de permission côté web : les actions s'appuient sur le 403
  de l'API ; la visibilité du menu passe par `MENU_REQUIREMENTS`.
- `PAYMENT_SECRETS_KEY` absente → `isEncryptionAvailable()` faux : refuser la
  création du mandat avec un message clair, ne rien écrire.
- Les clés d'audit contenant `iban` sont déjà masquées par
  `services/audit-entry-builder.ts`, mais ne jamais compter dessus : ne pas
  mettre l'IBAN dans la charge utile.

## 5. P2 — réalisé (16/10/2026)

Contrat : [data-model.md](data-model.md) §7. Branche
`feat/prelevement-p2-remises`, empilée sur `fix/prelevement-cle-iban` (clé
dédiée et versionnée des IBAN, décision du 16/10/2026).

- **API** : `lib/direct-debit/remittances.ts` (service),
  `remittance-selection.ts` (règles D6, fonctions pures),
  `business-days.ts` (date limite de prénotification D7),
  `prenotification.ts` (e-mail `DIRECT_DEBIT_PRENOTIFICATION`),
  `file-formats/` (adaptateur `GENERIC_CSV`, registre par format),
  `controllers/direct-debit-remittance-controller.ts`, 10 routes ;
  migrations `20261017090000_prelevement_moyen_paiement` et
  `20261017090100_prelevement_remises`.
- **Écran** : onglets « Mandats » / « Remises » de Location › Prélèvements,
  `pages/rental/DirectDebitRemittances.tsx` (liste, préparation) et
  `DirectDebitRemittanceDetail.tsx` (actions par statut, lignes, mandats non
  retenus).
- **Choix faits pendant la réalisation** : une échéance ne figure que dans
  une seule ligne non annulée, quel que soit le mandat ou le créancier (ADR-007
  §6, plus strict que « (mandat, échéance) ») ; à l'actualisation, un mandat
  dont une ligne a été retirée de la remise n'y revient pas ; le renvoi des
  prénotifications est refusé dès le jour du prélèvement ; jours fériés non
  gérés (lundi à vendredi).
- **Reste ouvert** : format réel de la banque pilote (nouvel adaptateur, après
  réception des pièces de la spec §2) ; prénotification par WhatsApp ou SMS et
  avis d'annulation au débiteur (P5) ; règlements et rejets (P3) ; jours
  fériés ivoiriens.
