# Implementation Plan: Plan de trésorerie prévisionnel du patrimoine (lot A2)

**Branch**: `[feat/patrimoine-tresorerie]` | **Date**: 2026-10-01 | **Spec**: [`specs/030-patrimoine-plan-tresorerie/spec.md`](./spec.md)
**Input**: spécification du lot A2, feuille de route `docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md` (capacité 7), contrat d'interface commun à l'API et à l'écran tenu par le coordinateur.

## Summary

Le lot agrège en lecture les flux futurs du patrimoine (loyers, mensualités d'emprunt, travaux planifiés, charges récurrentes, taxe foncière estimée) en un plan mensuel sur 12 ou 24 mois, avec cumul et alerte de creux. Le calcul est une **fonction pure** (`lib/patrimoine/cash-plan.ts`) nourrie par un **service de chargement** qui lit la base et le moteur fiscal existants ; une route de lecture et une route d'écriture du seul paramètre d'agence ; une page web.

Deux ajouts de données, additifs : une périodicité sur `PropertyExpense` et un paramètre d'agence `PatrimonyCashPlanSettings` (date d'exigibilité de la taxe foncière, **sans valeur par défaut**). Le plan n'est jamais persisté. Rien de ce qui existe ne change de sens : le rendement du bien et les charges annuelles restent calculés comme avant.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js backend + React 18 frontend)
**Primary Dependencies**: Express 4, Prisma 5, Zod, Jest (backend), React, Ant Design, recharts (graphique, déjà utilisé par l'application), Vitest (frontend)
**Storage**: PostgreSQL via Prisma (`packages/api/prisma/schema.prisma`) ; une migration additive
**Testing**: Jest backend (`packages/api/__tests__/{unit,api}`, isolation par `npm run test:isolation`), Vitest frontend (`apps/web/src/__tests__/`)
**Target Platform**: SaaS web multi-tenant (API Node.js + SPA React)
**Project Type**: Monorepo web application (`packages/api` + `apps/web`)
**Performance Goals**: plan sur 24 mois d'un portefeuille de 100 biens en moins de 3 secondes (SC-008), appels au moteur fiscal par lots de 5
**Constraints**: isolation par `tenantId` sur toute lecture ; migration strictement additive ; aucune valeur fiscale ni date d'exigibilité inventée ; aucune réécriture du générateur d'échéances ; XOF seul, aucune conversion ; textes via `t()` en fr/en/ar ; marges logiques
**Scale/Scope**: 1 énumération, 1 nouveau modèle, 2 colonnes ajoutées ; 2 routes neuves, 2 schémas de dépense étendus ; 1 page, 1 entrée de menu, quelques composants ; pas de nouvelle dépendance

## Constitution Check

_GATE: respect d'`AGENTS.md`, qui prime._

- **Isolation multi-tenant** : conforme. Chaque lecture est filtrée par `tenantId` ; le filtre `propertyId` passe par `assertBelongsToTenant` (même `NotFoundError` qu'un bien inexistant) ; le nouveau modèle porte `tenantId` et passe `schema-tenant-coverage.test.ts` ; la nouvelle route passe `routes-inventory.test.ts`.
- **Erreurs** : conforme. Le contrôleur est enveloppé dans `asyncHandler` et le service lève des erreurs typées ; pas de `try/catch` qui devine un statut.
- **Configuration** : conforme. Aucune variable d'environnement nouvelle.
- **Textes affichés** : conforme sous réserve d'exécuter `npm run i18n:extract` ; marges logiques.
- **Frontend** : conforme. Réseau par `utils/api-client`, URL par `config/api`, page en `React.lazy`, aucun `dangerouslySetInnerHTML`.
- **Wiki** : mise à jour du classeur et `npm run wiki:export` dans la même PR.
- **Jamais de `include: { user: true }`** : sans objet ; le paramètre ne stocke que l'identifiant de l'auteur.

Aucun écart à justifier.

## Project Structure

### Documentation (this feature)

```text
specs/030-patrimoine-plan-tresorerie/
|-- spec.md
`-- plan.md
```

### Source Code (repository root)

```text
packages/api/
|-- prisma/
|   |-- schema.prisma                                   # enum ExpenseRecurrence ; PropertyExpense + 2 colonnes ; modèle PatrimonyCashPlanSettings ; relation inverse sur Tenant
|   `-- migrations/
|       `-- 20261007100000_patrimoine_plan_tresorerie/
|           `-- migration.sql                           # nouveau (additif ; CHECK du paramètre)
|-- src/
|   |-- lib/patrimoine/
|   |   |-- cash-plan.ts                                # nouveau : fonction pure + types CashPlan*
|   |   |-- cash-plan-service.ts                        # nouveau : chargement, taxe par lots de 5, paramètre d'agence
|   |   |-- schemas.ts                                  # étendu : recurrence / recurrenceEndDate ; schémas de la requête et du corps (partagé avec A1)
|   |   `-- queries.ts                                  # étendu seulement pour renvoyer les 2 champs de dépense (partagé avec A1)
|   |-- controllers/
|   |   `-- patrimoine-cash-plan-controller.ts          # nouveau (évite de grossir patrimoine-controller.ts, partagé avec A1)
|   `-- routes/
|       `-- patrimoine-routes.ts                        # 2 routes ajoutées
`-- __tests__/
    |-- unit/
    |   |-- patrimoine.cash-plan.test.ts                # nouveau
    |   |-- patrimoine.cash-plan-service.test.ts        # nouveau
    |   |-- routes-inventory.test.ts                    # mis à jour si nécessaire
    |   `-- schema-tenant-coverage.test.ts              # mis à jour pour le nouveau modèle
    `-- api/
        `-- patrimoine.cash-plan.test.ts                # nouveau : gardes, validation, isolation

apps/web/src/
|-- pages/patrimoine/
|   `-- CashPlanPage.tsx                                # nouveau, en React.lazy dans App.tsx
|-- components/patrimoine/
|   |-- CashPlanChart.tsx                               # nouveau (recharts, chargé avec la page)
|   |-- CashPlanTable.tsx                               # nouveau (tableau mensuel dépliable)
|   `-- CashPlanSourcesPanel.tsx                        # nouveau (sources non incluses + formulaire de taxe)
|-- components/patrimoine/PropertyPatrimoineTab.tsx     # périodicité + date de fin dans le formulaire et la liste de dépenses (partagé avec A1)
|-- services/patrimoine-service.ts                      # getCashPlan, updateCashPlanSettings
|-- types/patrimoine-types.ts                           # types CashPlan*, champs de dépense
|-- navigation/{model.tsx, menu-catalog.ts, route-labels.ts}
|-- App.tsx                                             # route /tenant/:tenantId/patrimoine/plan-tresorerie
|-- i18n/locales/                                       # catalogues fr/en/ar (via i18n:extract)
`-- __tests__/
    |-- navigation/route-features.test.ts               # ligne ['patrimoine/plan-tresorerie', 'PATRIMOINE']
    `-- patrimoine/                                     # tests de la page et du service

docs/fonctionnalites/                                   # classeur du wiki + export (fait par le coordinateur ou signalé)
```

**Structure Decision**: extension de la base existante du module patrimoine. Un contrôleur dédié et un service dédié isolent le lot ; les fichiers partagés avec le lot A1 ne reçoivent que des ajouts ciblés.

## Approche technique

### 1. Schéma et migration (additifs)

- Énumération `ExpenseRecurrence { ONE_OFF MONTHLY QUARTERLY ANNUAL }`.
- `PropertyExpense` : `recurrence` (défaut `ONE_OFF`) et `recurrenceEndDate` (nul). Tout enregistrement existant devient ponctuel : aucun changement de sens, aucune réécriture de données.
- `PatrimonyCashPlanSettings` : un par agence (`tenantId` unique, suppression en cascade), `propertyTaxDueMonth` et `propertyTaxDueDay` nuls par défaut, `updatedByUserId`, dates ; `@@map("patrimony_cash_plan_settings")`. Patron : `OwnerPortalSettings`. Relation inverse déclarée sur `Tenant`.
- La migration `20261007100000_patrimoine_plan_tresorerie` crée l'énumération, ajoute les colonnes avec leur défaut, crée la table et sa **contrainte CHECK** (les deux nuls, ou les deux renseignés avec mois 1–12 et jour 1–31). Horodatage distinct de ceux des autres lots ; aucune migration existante n'est modifiée.
- Ce qui reste hors base : la validité « le jour existe dans le mois » (février jusqu'au 29) est contrôlée par zod, pas par la contrainte.
- Mettre à jour `docs/architecture/DATA_MODELS.md` si le schéma l'exige.

### 2. Fonction pure `lib/patrimoine/cash-plan.ts`

Entrées, sans Prisma : date du jour, horizon, solde de départ facultatif, biens retenus, échéances, baux actifs, prêts, travaux, dépenses périodiques, paramètre de taxe, estimations de taxe déjà calculées par le service. Sorties : le plan (mois, lignes, totaux, creux, sources, avertissements) ; `generatedAt`, le périmètre et le paramètre peuvent être posés par le service.

Principes :

- Aucune horloge ni globale : la date du jour est un argument. Toutes les dates en UTC.
- Mois 1 = mois du jour. Un petit utilitaire interne d'addition de mois par rapport à un ancrage (jour ramené au dernier jour du mois, jamais en cumulant) sert aux emprunts, aux dépenses et à la taxe.
- Une fonction par source, qui renvoie des lignes et un état de source ; l'assemblage place les lignes dans les mois, calcule net, cumul et montants par catégorie, puis l'alerte de creux.
- Les échéances à venir des baux appellent `buildInstallmentForPeriod` de `lib/finance/installment-builder.ts`, **sans le modifier ni le réécrire** ; une période déjà couverte par une échéance existante du même bail n'est pas générée.
- Arithmétique exacte (entiers ou décimaux) pour les sommes ; arrondi à l'unité en fin de calcul.
- Un montant en devise autre que XOF/FCFA est écarté et compté, jamais sommé.
- Retourne toujours une entrée par source, même vide : pas de zéro silencieux.

### 3. Service de chargement `lib/patrimoine/cash-plan-service.ts`

- **Lecture du plan** : charge les biens de l'agence (`ownershipType = 'TENANT'`, filtrés par `tenantId`), écarte ceux dont le statut est dans `OCCUPANCY_EXCLUDED_STATUSES` (importé de `queries.ts`, non modifié) ou « en vente » (modes de transaction contenant la vente, sans location ni courte durée), les range dans le périmètre avec leur motif ; charge échéances ouvertes, baux actifs, prêts actifs, travaux planifiés ou en cours, dépenses non ponctuelles et le paramètre d'agence, tous restreints aux biens retenus et à `tenantId`.
- **Taxe** : si le paramètre est vide, aucun appel au moteur fiscal. Sinon, appels à `getPropertyTaxEstimate(tenantId, propertyId, { year })` pour chaque bien et chaque année d'échéance comprise dans l'horizon, **par lots de 5 au plus**, en excluant les biens couverts par une dépense périodique de taxe foncière. Seules les taxes de nature taxe foncière sont retenues ; l'indicateur « indicatif » vient de `allParametersValidated`. Une estimation vide ou nulle compte comme « non estimable ».
- **Filtre `propertyId`** : vérifié avec `assertBelongsToTenant` avant tout chargement (même `NotFoundError` qu'un bien inexistant) ; un bien exclu donne un plan vide et figure dans le périmètre.
- **Paramètre d'agence** : lecture et upsert sur `tenantId` ; le service refuse les états incohérents (un seul des deux champs, jour inexistant dans le mois) en plus du contrôle de la requête.

### 4. Route et contrôleur

- `GET /tenants/:tenantId/patrimoine/cash-plan` : `requireAnyPropertyPermission(['PROPERTIES_VIEW'])`, requête zod `.strict()` (`months` 12 ou 24 par défaut 12, `openingBalance` nombre fini, `propertyId` uuid).
- `PUT /tenants/:tenantId/patrimoine/cash-plan/settings` : `requirePropertyPermission('PROPERTIES_EDIT')`, à vérifier sans `:propertyId` ; sinon `requireAnyPropertyPermission(['PROPERTIES_EDIT'])`. Corps zod `.strict()`, deux nuls ou deux renseignés, jour valide dans le mois.
- Réponses `{ success: true, data }` ; contrôleur enveloppé dans `asyncHandler`, modèle `property-media-controller.ts`. Le préfixe `/patrimoine` est déjà associé à la fonctionnalité PATRIMOINE : à vérifier, pas à modifier.
- Dépenses existantes : `createExpenseSchema` et `updateExpenseSchema` acceptent `recurrence` et `recurrenceEndDate` (règles de l'exigence FR-022) ; les requêtes de liste, de détail, de création et de mise à jour renvoient les deux champs. La périodicité n'est pas lue par le rendement ni par la consolidation.

### 5. Écran (apps/web)

- Route `/tenant/:tenantId/patrimoine/plan-tresorerie` ; page `CashPlanPage.tsx` en `React.lazy` dans `App.tsx`.
- Menu : clé `patrimoine-cash-plan`, libellé « Trésorerie prévisionnelle », sous `patrimoine` dans `model.tsx` ; `menu-catalog.ts` : `['PROPERTIES_VIEW']` ; `route-labels.ts` : `tresorerie` ; test `route-features.test.ts`. Le préfixe `patrimoine` de `route-features.ts` couvre déjà la route : à vérifier, à modifier seulement si besoin.
- Page : sélecteur 12/24, solde de départ, filtre par bien, bandeau de creux ou d'absence de creux, graphique (recharts, chargé avec la page, jamais dans le paquet d'entrée), tableau mensuel dépliable avec la source de chaque ligne, encart des sources non incluses avec le formulaire mois/jour de la taxe (appel du PUT, affiché selon `PROPERTIES_EDIT`), mention « estimation indicative », avertissement « calculé sans solde de départ », avertissement de devise écartée.
- Traduction côté écran des codes machine (catégories, sources, raisons, particularités) ; libellés d'origine affichés tels quels.
- Onglet Patrimoine du bien : champ « Périodicité » et « Date de fin » (visible si périodique) dans le formulaire de dépense existant ; périodicité affichée dans la liste.
- `npm run i18n:extract` dans `apps/web` (et dans `packages/api` si un message d'erreur de validation visible est ajouté), puis traduction en anglais et en arabe.

## Ordre de réalisation

1. **Schéma et migration** (le reste en dépend) : énumération, colonnes, modèle, CHECK ; régénération du client Prisma ; test de couverture tenant.
2. **Fonction pure et ses tests** : d'abord les règles de date (fins de mois, 29 février), puis chaque source, l'assemblage, le cumul et l'alerte. C'est le noyau, testable sans base.
3. **Schémas et dépenses** : périodicité sur les schémas de dépense, réponses de liste, détail, création, mise à jour ; tests de validation (date de fin sans périodicité, antérieure à la date de paiement).
4. **Service de chargement, contrôleur et routes** : filtre par bien, taxe par lots de 5, paramètre d'agence ; tests d'API et d'isolation.
5. **Écran** : page, composants, navigation, formulaire de dépense, service et types ; tests ; catalogues de traduction.
6. **Wiki et vérifications de fin.**

Les étapes 2 et 3 peuvent avancer en parallèle après l'étape 1 (fichiers distincts) ; l'étape 5 commence quand la forme de réponse est figée par le contrat.

## Risques

| Risque                                                                                                                                                                                                              | Parade                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fichiers partagés avec le lot A1** (`lib/patrimoine/schemas.ts`, `lib/patrimoine/queries.ts`, `PropertyPatrimoineTab.tsx`, catalogues i18n, `patrimoine-types.ts`, `patrimoine-service.ts`) : conflits de fusion. | Ajouts ciblés et localisés, jamais de réorganisation ; contrôleur et service propres au lot ; ne pas faire de commits parallèles sur le même fichier ; intégrer lot par lot (feuille de route § Risques) ; relire le fichier avant toute modification. |
| Horodatage de migration voisin de celui d'un autre lot.                                                                                                                                                             | Horodatage dédié `20261007100000` ; ne jamais éditer une migration existante.                                                                                                                                                                          |
| Un plan faux avec aplomb (taxe, date inventée).                                                                                                                                                                     | Paramètre sans défaut, taxe exclue et expliquée tant qu'il est vide, marque « indicative » tant que des paramètres sont `A_VALIDER`.                                                                                                                   |
| Zéro silencieux pris pour une absence de flux.                                                                                                                                                                      | Une entrée par source dans la réponse, avec statut et raison, affichée à l'écran ; test de couverture de chaque raison.                                                                                                                                |
| Lenteur du moteur fiscal sur un grand portefeuille.                                                                                                                                                                 | Appels par lots de 5, un seul appel par bien et par année d'échéance, aucun appel sans paramètre ; mesure de SC-008 sur un jeu simulé.                                                                                                                 |
| Doublon d'une période de bail déjà échéancée, ou d'une taxe saisie en dépense.                                                                                                                                      | Détection de période déjà couverte (quel que soit le statut) ; non-doublon taxe / dépense périodique.                                                                                                                                                  |
| Dérive des fins de mois (31 janvier mensuel).                                                                                                                                                                       | Jour calculé depuis l'ancrage, pas en cumulé ; tests dédiés.                                                                                                                                                                                           |
| La garde `requirePropertyPermission` sans `:propertyId`.                                                                                                                                                            | Vérifier tôt ; repli sur `requireAnyPropertyPermission(['PROPERTIES_EDIT'])`.                                                                                                                                                                          |
| Nouveau modèle ou nouvelle route non déclarés dans les tests d'inventaire.                                                                                                                                          | Mettre à jour `routes-inventory.test.ts` et `schema-tenant-coverage.test.ts` dans la même étape.                                                                                                                                                       |
| Graphique dans le paquet d'entrée.                                                                                                                                                                                  | Importer recharts dans les composants de la page lazy ; vérifier le découpage du bundle.                                                                                                                                                               |
| Régression du rendement par la périodicité.                                                                                                                                                                         | La périodicité n'est lue que par le plan ; test de non-régression du rendement sur un jeu avec dépenses périodiques.                                                                                                                                   |
| Disque ou poste limités.                                                                                                                                                                                            | Tests ciblés, pas de pack complet.                                                                                                                                                                                                                     |

## Stratégie de test

- **Fonction pure** (`patrimoine.cash-plan.test.ts`, sans base) : horizon 12 et 24 ; mois sans flux ; cumul avec et sans solde de départ, solde négatif ; alerte de creux (premier mois, mois le plus bas, profondeur, absence) ; loyers (échéance en retard ramenée au mois 1, échéance payée ou annulée ignorée, période déjà couverte non dupliquée, bail sans loyer, bail sans date de fin, pénalités non anticipées) ; emprunt qui finit en cours de plan, jour 31 et 29 février ; travaux (date dépassée, hors horizon, en cours avec coût réel, reste nul) ; charges récurrentes (mensuelle, trimestrielle, annuelle, date de fin incluse, occurrences passées exclues, ponctuelle jamais incluse) ; taxe (paramètre vide : zéro ligne et zéro appel, estimation indicative, non estimable, doublon avec dépense périodique) ; devise étrangère écartée et comptée, FCFA assimilée à XOF ; une entrée par source ; arrondi en fin de calcul.
- **Service** (`patrimoine.cash-plan-service.test.ts`, base simulée) : exclusion des biens en vente, vendus, archivés et en brouillon avec motif ; lots de 5 pour la taxe ; aucun appel au moteur fiscal sans paramètre ; filtre `propertyId` d'une autre agence identique à un bien inexistant ; upsert et effacement du paramètre.
- **API** (`__tests__/api`) : 401 et 403 sur les deux routes ; `.strict()` (paramètre inconnu refusé) ; `months` invalide ; `openingBalance` non fini ; corps du PUT incomplet, hors bornes, 31 février ; périodicité sur les dépenses (défaut ponctuelle, date de fin sans périodicité, antérieure à la date de paiement) ; les réponses de dépense renvoient les deux champs.
- **Isolation** : deux agences, aucune fuite de bien, prêt, bail, dépense, échéance ni paramètre ; `npm run test:isolation` (base dédiée `DATABASE_URL_TEST`).
- **Non-régression** : rendement et charges annuelles inchangés avec des dépenses périodiques ; suites locative et patrimoine existantes vertes.
- **Frontend** (Vitest, en français) : rendu des 12 ou 24 mois, bandeau de creux et d'absence de creux, encart des sources avec ses raisons, formulaire de taxe réservé à `PROPERTIES_EDIT`, mention « estimation indicative », avertissement sans solde de départ, avertissement de devise, formulaire de dépense (périodicité, date de fin conditionnelle), ligne `route-features`. Un `vi.mock` couvre chaque export utilisé. Une suite qui échoue par délai dépassé se rejoue seule avant tout diagnostic.
- **Contrôle des marges** : aucune occurrence de `ml-*` ou `mr-*` dans les fichiers du lot.

## Vérifications de fin

```bash
npm run typecheck
npm run lint
npm run check:architecture
npm test -- patrimoine            # tests backend ciblés du lot
npm run test:web -- patrimoine    # tests frontend ciblés du lot
npm run test:isolation            # étanchéité entre agences
npm run i18n:extract              # dans apps/web (et packages/api si nécessaire), catalogues à jour
npm run wiki:export && npm run wiki:check
```

Contrôles complémentaires : aucune erreur TypeScript nouvelle dans un fichier déjà propre ; migration appliquée sur une base de test et dépenses existantes toujours ponctuelles ; pas de `ml-*`/`mr-*` ; pas de `dangerouslySetInnerHTML` ; vérification sur le navigateur de la page (12 et 24 mois, alerte, sources non incluses, formulaire de taxe, arabe en lecture de droite à gauche).

## Mise à jour du wiki

Classeur `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx`, puis `npm run wiki:export` dans la même PR (`npm run wiki:check` en CI), selon `docs/fonctionnalites/README.md`. Sous-fonctionnalités ajoutées ou modifiées à y consigner :

- **Ajoutée** : page « Trésorerie prévisionnelle » (plan 12 et 24 mois, solde de départ, filtre par bien, alerte de creux, détail par ligne avec source, sources non incluses).
- **Ajoutée** : paramètre d'agence « date d'exigibilité de la taxe foncière » (mois et jour, sans valeur par défaut), saisi depuis la page ; permission d'écriture des biens.
- **Ajoutées** : routes `GET /patrimoine/cash-plan` et `PUT /patrimoine/cash-plan/settings` ; entrée de menu « Trésorerie prévisionnelle » (permission de lecture des biens).
- **Modifiée** : dépenses d'un bien, avec périodicité (ponctuelle, mensuelle, trimestrielle, annuelle) et date de fin, dans le formulaire et la liste de l'onglet Patrimoine.

Si le classeur n'est pas confié à l'agent de réalisation, il signale ces entrées au coordinateur dans son rapport.
