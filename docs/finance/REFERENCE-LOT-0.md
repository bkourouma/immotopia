# Référence lot 0 — module financier opérationnel

Ce document est régénéré par `packages/api/scripts/finance-baseline.ts --write`. Ne pas
l'éditer à la main : toute correction doit passer par le script, sous peine d'être
écrasée à la prochaine mesure.

## Reproduire cette mesure

```bash
npx ts-node packages/api/scripts/finance-baseline.ts
```

Ajouter `--json` pour une sortie machine seule, `--write` pour régénérer ce fichier.

## Règle de lecture

**Le décompte d'erreurs TypeScript ne doit jamais augmenter, et aucun fichier
aujourd'hui à zéro erreur ne doit en gagner.** Un total inchangé ne suffit pas :
comparer la ventilation par fichier ci-dessous à chaque point d'intégration.
Un fichier qui apparaît dans la liste API alors qu'il n'y était pas, ou dont le
compte augmente, est une régression — même si le total global n'a pas bougé.

La même règle de non-régression s'applique aux suites et tests : une suite ou
un test qui passait doit continuer de passer. Un compte de tests qui augmente
n'est pas un problème en soi (de nouveaux tests de caractérisation peuvent
apparaître entre deux mesures, écrits par d'autres agents du même lot) ; un
compte qui diminue, ou un test qui échoue, l'est.

## Instantané

Mesuré le 2026-09-18T11:03:00.000Z. Commit f21409c (`feat/finance-lot-0`, 2026-09-18T10:42:57Z).

### Erreurs TypeScript

**packages/api** : 103 erreur(s) TypeScript.

| Fichier                                                           | Erreurs |
| ----------------------------------------------------------------- | ------- |
| `packages/api/src/services/contact-search.service.ts`             | 12      |
| `packages/api/src/controllers/newsletter-controller.ts`           | 10      |
| `packages/api/src/services/document-context-builder.ts`           | 7       |
| `packages/api/src/controllers/crm-controller.ts`                  | 6       |
| `packages/api/src/services/crm-deal-service.ts`                   | 5       |
| `packages/api/src/services/tenant-service.ts`                     | 5       |
| `packages/api/src/controllers/rental-document-controller.ts`      | 4       |
| `packages/api/src/middleware/tenant-middleware.ts`                | 4       |
| `packages/api/src/services/crm-matching-service.ts`               | 4       |
| `packages/api/src/services/newsletter-campaign.service.ts`        | 4       |
| `packages/api/src/services/owner-portal-service.ts`               | 4       |
| `packages/api/src/services/property-visit-service.ts`             | 4       |
| `packages/api/src/services/crm-contact-service.ts`                | 3       |
| `packages/api/src/controllers/document-generation-controller.ts`  | 2       |
| `packages/api/src/services/document-generation-service.ts`        | 2       |
| `packages/api/src/services/newsletter-subscriber.service.ts`      | 2       |
| `packages/api/src/services/property-template-service.ts`          | 2       |
| `packages/api/src/controllers/geographic-controller.ts`           | 1       |
| `packages/api/src/controllers/maintenance-ticket-controller.ts`   | 1       |
| `packages/api/src/controllers/property-mandate-controller.ts`     | 1       |
| `packages/api/src/controllers/rental-controller.ts`               | 1       |
| `packages/api/src/controllers/role-controller.ts`                 | 1       |
| `packages/api/src/controllers/subscription-controller.ts`         | 1       |
| `packages/api/src/controllers/tenant-portal-controller.ts`        | 1       |
| `packages/api/src/jobs/newsletter-campaign-scheduler.job.ts`      | 1       |
| `packages/api/src/jobs/penalty-calculation-job.ts`                | 1       |
| `packages/api/src/jobs/reminder-scheduler.job.ts`                 | 1       |
| `packages/api/src/middleware/property-ownership-middleware.ts`    | 1       |
| `packages/api/src/middleware/request-context-middleware.ts`       | 1       |
| `packages/api/src/routes/document-routes.ts`                      | 1       |
| `packages/api/src/routes/maintenance-routes.ts`                   | 1       |
| `packages/api/src/services/audit-service.ts`                      | 1       |
| `packages/api/src/services/crm-activity-service.ts`               | 1       |
| `packages/api/src/services/invoice-service.ts`                    | 1       |
| `packages/api/src/services/property-mandate-service.ts`           | 1       |
| `packages/api/src/services/property-matching-service.ts`          | 1       |
| `packages/api/src/services/rental-document-service.ts`            | 1       |
| `packages/api/src/services/rental-payment-declaration-service.ts` | 1       |
| `packages/api/src/services/tenant-portal-service.ts`              | 1       |
| `packages/api/src/types/tenant-types.ts`                          | 1       |

**apps/web** : 0 erreur(s) TypeScript.

### Tests

**Backend (Jest)**

| Suites                                  | Tests                                             |
| --------------------------------------- | ------------------------------------------------- |
| 29 au total, 25 sans échec, 4 ignoré(s) | 197 au total, 193 passés, 0 en échec, 4 ignoré(s) |

**Frontend (Vitest)**

| Fichiers                                | Tests                                             |
| --------------------------------------- | ------------------------------------------------- |
| 34 au total, 34 sans échec, 0 ignoré(s) | 319 au total, 319 passés, 0 en échec, 0 ignoré(s) |

## Banc de charge — balance à 500 tiers (critère de sortie du lot 1, plan §5.5)

Mesure prise avec 500 tiers et 24 mouvements par tiers (tables locatives existantes
`RentalInstallment` / `RentalPayment` / `RentalPaymentAllocation`, en attendant les
tables du module financier) :

| Stratégie                                                    | Durée (médiane sur 3 répétitions) |
| ------------------------------------------------------------ | --------------------------------- |
| Agrégation en mémoire (comme `getTrialBalanceBySyndicate`)   | 1354.6 ms                         |
| Agrégation SQL (jointures + `SUM`/`GROUP BY` en une requête) | 93.5 ms                           |

Mesures individuelles (ms) — mémoire : 2136.5, 1354.6, 1228.3 ; SQL : 6302.4 (première
exécution, effet de démarrage à froid), 54.1, 93.5.

Au seuil de 3000 ms fixé par le critère de sortie du lot 1 : l'agrégation en mémoire le
tient à ce volume, mais avec une marge étroite et variable (1,2 à 2,1 s d'une exécution à
l'autre) ; l'agrégation SQL le tient avec une marge d'environ 30x et une variance bien
plus faible hors première exécution. Cette mesure corrobore la décision déjà actée au
plan (§5.2, tâche 1.6) de bâtir la balance clients du lot 1 sur une agrégation SQL plutôt
que sur le motif existant de `getTrialBalanceBySyndicate`.

Reproduire ce banc :

```bash
npx ts-node packages/api/scripts/finance-bench-balance.ts --tiers=500 --mouvements=24
```
