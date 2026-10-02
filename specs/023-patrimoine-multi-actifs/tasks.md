# Tasks: Patrimoine multi-actifs (lot 1 — socle)

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Modèle**: [data-model.md](data-model.md)

Un territoire par agent ; ne pas commiter pendant qu'un agent écrit.

## A — Schéma et migration

- [ ] A1 Ajouter `AssetClass`, `AssetStatus`, `ValuationReliability` et le modèle `Asset`
- [ ] A2 `AssetValuation` : `assetId` facultatif, `propertyId` facultatif, `source`, `reliability`, contrainte XOR
- [ ] A3 `PropertyLoan` : `assetId` facultatif, `propertyId` facultatif, contrainte « au plus un »
- [ ] A4 `PatrimonyDocument` : `assetId` facultatif
- [ ] A5 `PropertyHolding` : `assetId` facultatif, `propertyId` facultatif, contrainte XOR, unicité `(assetId, entityId)`
- [ ] A6 Migration des données : un `Asset` `REAL_ESTATE` par bien portant des données (aucune ligne existante réécrite)
- [ ] A7 Mettre à jour `schema-tenant-coverage` et `docs/architecture/DATA_MODELS.md`

## B — Domaine pur (`lib/patrimoine/assets/`)

- [ ] B1 Schémas zod des `details` par classe, versionnés
- [ ] B2 Valeur courante d'un actif à une date, conversion XOF
- [ ] B3 Valeur nette, répartition par classe, actifs exclus
- [ ] B4 Évolution de la valeur nette dans le temps
- [ ] B5 Tests unitaires (SC-004 : 10 actifs de classes variées)

## C — Service et API

- [ ] C1 CRUD des actifs (création, liste, détail, modification, archivage)
- [ ] C2 Valorisations, dettes, documents et parts par actif via `asset-scope` (dépenses et travaux hors lot 1)
- [ ] C3 `GET /tenants/:tenantId/patrimoine/net-worth` et évolution
- [ ] C4 Gardes d'appartenance, erreurs typées, `asyncHandler`
- [ ] C5 `routes-inventory` et tests d'isolation entre tenants

## D — Adaptation de l'immobilier existant

- [ ] D1 Rendre les lecteurs de valorisations, prêts et parts détenues tolérants à `propertyId` nul :
      `lib/patrimoine/queries.ts`, `tax/service.ts`, `entities/*`, `export/*`, `notifications.ts`,
      `owner-portal-view.ts`, `owner-account/sync.ts`, `dashboard-service.ts`
- [ ] D2 Vérifier que les flux de trésorerie et de chantier (`finance/cost-allocation`,
      `site-closing`) restent inchangés (ils ne lisent que dépenses et travaux)
- [ ] D3 Tests de non-régression : rendement, fiscalité, relevés, portail (SC-003)

## E — Frontend

- [ ] E1 Tableau de bord : valeur nette, répartition, courbe, actifs sans valeur
- [ ] E2 Liste d'actifs avec filtre par classe
- [ ] E3 Formulaire d'actif dynamique selon la classe
- [ ] E4 Fiche d'actif : valeurs, dettes, dépenses, documents, détenteurs
- [ ] E5 État vide pour un nouvel utilisateur
- [ ] E6 Menu et pages en `React.lazy`

## F — Finition

- [ ] F1 `npm run i18n:extract` (fr, en, ar), propriétés logiques
- [ ] F2 Recette navigateur par `ui-tester` sur un parcours complet
- [ ] F3 Wiki (`docs/fonctionnalites/*.xlsx`, `npm run wiki:export`,
      `sous-fonctionnalites.md`)
- [ ] F4 Revue `code-reviewer` et `security-auditor`, mise à jour de `HANDOFF.md`

## Lots suivants (specs à écrire avant implémentation)

- [ ] Lot 2 : méthodes de valorisation par classe, fiabilité, statut juridique
- [ ] Lot 3 : projections consolidées, scénarios, simulations
- [ ] Lot 4 : tenant particulier, inscription libre, palier gratuit, mobile money
- [ ] Lot 5 : exports PDF et Excel, portail
- [ ] Lot 6 : collecte fiscale par IA, validation utilisateur, promotion administrateur
