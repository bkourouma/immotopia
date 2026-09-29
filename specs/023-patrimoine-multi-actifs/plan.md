# Implementation Plan: Patrimoine multi-actifs

**Branch**: `[023-patrimoine-multi-actifs]` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)
**Décision**: [ADR-005](../../docs/architecture/adr/ADR-005-patrimoine-multi-actifs.md)

## Summary

Introduire `Asset` comme racine du patrimoine, généraliser valorisations, prêts,
dépenses, travaux, documents et parts détenues à `assetId`, exposer une valeur
nette consolidée, et conserver à l'identique les moteurs immobiliers. Le lot 1 ne
livre ni méthodes de valorisation par classe, ni projections, ni onboarding
particulier : il pose le socle sur lequel ils reposent.

## Périmètre du code touché (inventaire au 2026-09-29)

Backend (`packages/api/src`) — fichiers qui lisent ou écrivent les modèles
patrimoine :

- `controllers/patrimoine-controller.ts`, `routes/patrimoine-routes.ts`
- `lib/patrimoine/{queries,notifications,owner-portal-view}.ts`
- `lib/patrimoine/export/{data,pdf,workbook,labels}.ts`
- `lib/patrimoine/tax/service.ts`
- `lib/patrimoine/entities/{service,schemas,consolidation-service}.ts`
- `lib/owner-account/sync.ts`, `services/dashboard-service.ts`
- `lib/finance/{cost-allocation,site-closing}.ts` (bascule chantier vers patrimoine)
- `constants/email-notification-default-templates.ts`

Frontend (`apps/web/src`) : `components/patrimoine/*`,
`components/patrimoine/entities/*`, `pages/patrimoine/*`, portail propriétaire
(`pages/OwnerPortal/Patrimoine.tsx`).

Ce périmètre est un point de départ : l'implémentation le reconfirme avec
`grep` avant de modifier.

## Approche technique

1. **Schéma** : enums, `Asset`, `assetId` facultatif sur valorisations, prêts, documents et
   parts détenues, migration additive (voir `data-model.md`).
2. **Domaine pur** (`lib/patrimoine/assets/`) : schémas zod par classe, calcul de
   la valeur courante et de la valeur nette, évolution dans le temps. Fonctions
   pures, testées sans base.
3. **Service et routes** : CRUD `assets`, valorisations par actif, dettes, valeur
   nette (`GET /tenants/:tenantId/patrimoine/net-worth`). Erreurs typées,
   `asyncHandler`, gardes `assertBelongsToTenant`.
4. **Adaptation des existants** : les lignes immobilières restent sur `propertyId`, donc
   les moteurs de rendement et de fiscalité reçoivent les mêmes entrées qu'avant ; les
   fichiers de l'inventaire qui lisent valorisations, prêts et parts détenues deviennent
   tolérants à un `propertyId` nul.
5. **Frontend** : tableau de bord « Mon patrimoine » (valeur nette, répartition,
   courbe), liste et fiche d'actif à onglets (valeurs, dettes, dépenses,
   documents), formulaire d'actif dynamique selon la classe. Pages en
   `React.lazy`, `api-client`, `t()`, propriétés logiques.
6. **Permissions et abonnement** : réutiliser les permissions patrimoine
   existantes ; les évolutions de pack (`BIENS_DETENUS`, entitlements) sont au lot 4.
7. **Documentation et wiki** : `docs/fonctionnalites/*.xlsx`, `npm run wiki:export`,
   `docs/architecture/DATA_MODELS.md`, `docs/fonctionnalites/sous-fonctionnalites.md`.

## Ordre de réalisation et territoires

| Étape | Territoire                                                 | Dépend de |
| ----- | ---------------------------------------------------------- | --------- |
| A     | Schéma Prisma, migration, `schema-tenant-coverage`         | —         |
| B     | Domaine pur `lib/patrimoine/assets/` et ses tests          | A         |
| C     | Service, contrôleur, routes, `routes-inventory`, isolation | A, B      |
| D     | Adaptation des fichiers immobiliers de l'inventaire        | A, C      |
| E     | Frontend : tableau de bord, liste, fiche, formulaire       | C         |
| F     | Recette, traductions (fr, en, ar), wiki, documentation     | D, E      |

Un agent par territoire de fichiers, jamais deux sur le même fichier ; D touche
beaucoup de fichiers existants et passe avant E pour éviter les conflits.

## Risques

| Risque                                                                  | Réponse                                                                                |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Régression du rendement, de la fiscalité, des relevés ou du portail     | Comparer avant et après sur le jeu de démonstration (SC-003), tests de non-régression  |
| Migration qui perd des lignes                                           | Comptes avant et après, migration testée sur une copie de la base de démonstration     |
| Fuite entre tenants via `assetId`                                       | `assertBelongsToTenant`, extension Prisma en `enforce` sur les tests, `test:isolation` |
| `details` JSON sans contrôle                                            | Schéma zod par classe et `detailsVersion`                                              |
| Bascule chantier vers patrimoine (`site-closing`) qui crée un bien seul | Faire créer aussi l'actif `REAL_ESTATE` correspondant                                  |
| Périmètre qui enfle vers projections et onboarding                      | Le lot 1 s'arrête à la valeur nette ; tout le reste a sa propre spec                   |

## Vérifications avant livraison

`npm run typecheck` (aucune erreur nouvelle), `npm run lint`,
`npm run check:architecture`, `npm test` (suites `patrimoine`,
`routes-inventory`, `schema-tenant-coverage`), `npm run test:web`,
`npm run test:isolation`, `npm run i18n:extract`, `npm run wiki:export`.

## Décisions ouvertes à trancher au démarrage de l'implémentation

1. Point d'entrée exact de la création d'un actif immobilier (depuis Biens, ou
   depuis Patrimoine avec choix du bien).
2. Comportement de la suppression d'un bien qui a un actif (refuser ou archiver).
3. Nom du menu et de la page d'accueil du particulier (« Mon patrimoine »).
