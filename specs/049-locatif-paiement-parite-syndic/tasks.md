# Tâches 049 — Locatif : paiement déclaré (parité Syndic)

Un lot = un territoire de fichiers ; jamais deux agents sur le même fichier. Types partagés :
`packages/api/src/lib/rental/declared-payment/types.ts` et `apps/web/src/types/rental-declared-payment.ts`.

| Lot | Contenu                                                                                                                                                                                                   | Territoire                                                                                                                            | Dépend de |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 0   | Contrats et types                                                                                                                                                                                         | `specs/049-*`, les deux `types.ts`                                                                                                    | rien      |
| 1   | API : schéma Prisma (numéros, réglages, lectures IA, champs additifs de `RentalPaymentDeclaration`), migration, numéros, réglages, déclaration, validation, rejet, lecture IA, routes, `ErrorCode`, audit | `packages/api/prisma`, `packages/api/src/lib/rental/declared-payment/*`, services, contrôleurs et routes locatif et portail locataire | 0         |
| 2   | API : paiement en ligne (fragment B)                                                                                                                                                                      | à définir par le chef                                                                                                                 | 1         |
| 3   | API : relances et notifications (fragment C)                                                                                                                                                              | à définir par le chef                                                                                                                 | 1         |
| 4   | Web gestionnaire : numéros, réglages, file des déclarations, validation/rejet, badge, `pendingDeclaration` sur les échéances                                                                              | `apps/web/src/pages` et `components` locatif, services locatif                                                                        | 1         |
| 5   | Web portail locataire : formulaire (référence, capture, lecture IA), liste, annulation                                                                                                                    | `apps/web/src` portail locataire                                                                                                      | 1         |
| 6   | Tests de bout en bout et isolation (`test:isolation`), recette                                                                                                                                            | `packages/api/__tests__`, e2e                                                                                                         | 1 à 5     |
| 7   | i18n (catalogues), classeur wiki (`npm run wiki:export`), documentation                                                                                                                                   | catalogues, `docs/fonctionnalites`                                                                                                    | 4, 5      |

Les lots 1 puis (2, 3, 4, 5 en parallèle) puis 6 puis 7.

## Commandes de test

```bash
npm run typecheck
npm test -w packages/api -- rental-declared          # lot 1
npm run test:isolation                               # lot 1 et 6 (base DATABASE_URL_TEST)
npm run test:web -- rental-declared                  # lots 4 et 5
npm run check:architecture
```

Vérification des types partagés : `cd packages/api && npx tsc --noEmit -p . | grep lib/rental/declared-payment`
(sans sortie) et idem dans `apps/web` pour `types/rental-declared-payment.ts`.
