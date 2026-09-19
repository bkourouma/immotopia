# Lot 3 — Budget de chantier, engagements, pilotage · Modèle et contrat

> Périmètre : `docs/finance/PLAN-mise-en-oeuvre.md` §7, PRD épique E5.
> Contrat gelé : `packages/api/src/lib/finance/types-lot3.ts` et
> `apps/web/src/types/finance-lot3-types.ts`.
> Migration : `20260919120000_add_site_budget_and_pilotage`, appliquée.
> 19 septembre 2026.

---

## 1. Deux écarts assumés avec le plan

Le plan a été écrit avant d'avoir le nez dans le schéma. Deux de ses choix ne tiennent pas à l'examen. Ils sont tranchés ici, et le schéma les porte déjà.

### 1.1 On ne réutilise pas `BudgetLineItem`

Le plan prévoyait d'ajouter `siteBudgetId?` et `costCategoryId?` à `BudgetLineItem`, en rendant `budgetId` nullable. Trois raisons de ne pas le faire.

`BudgetLineItem` porte `distributionKey` en NOT NULL : une clé de répartition des charges entre lots de copropriété, qui n'a aucun sens pour un chantier. Il porte `category` en chaîne libre là où il nous faut une clé étrangère vers `CostCategory`. Et il porte `amountActual` : **un réalisé stocké**.

Ce dernier point est décisif. Toute la doctrine des lots précédents est qu'un coût se dérive et ne se saisit jamais — c'est le principe P-4 du PRD, et c'est exactement le défaut corrigé au lot 2 sur `WorkProgram.actualCost`. Réutiliser ce modèle aurait fait entrer ce défaut dans le module neuf.

Le partage voulu par le plan reste possible : c'est le **composant de saisie de lignes** qu'on extrait, pas la table. Partager un composant React n'oblige pas à partager un modèle.

Même raisonnement pour l'énumération : `SiteBudgetStatus` est distincte de `BudgetStatus`, dont deux valeurs (`REVISED`, `CLOSED`) n'ont aucun sens ici et dont celle qu'il nous faut manque.

### 1.2 Il n'y a pas de `NotificationEvent`

Le plan renvoie à un modèle qui n'existe pas. Les seules notifications du dépôt sont le courriel et WhatsApp, configurés par agence. Il n'existe aucune notification dans l'application, que le PRD exige pourtant pour l'alerte de dépassement.

Plutôt que de bâtir une charpente de notification générique dont rien d'autre ne se servirait, l'alerte est **un enregistrement de première classe** : `SiteBudgetAlert`, datée, motivée par un seuil franchi, acquittable, lisible depuis le tableau de bord. C'est ce que le PRD demande.

---

## 2. Ce qui ne se stocke pas

C'est le fil de tout le lot. Trois grandeurs pourraient tenter d'exister en colonne, et aucune n'en a.

| Grandeur                     | Comment elle se calcule                                 |
| ---------------------------- | ------------------------------------------------------- |
| Total d'un budget            | Somme de ses lignes                                     |
| Budget révisé                | Initial plus somme des avenants **validés**             |
| État de facturation d'un bon | Fonction des factures validées qui lui sont rapprochées |

La seule copie stockée du lot est `ConstructionSite.progressPercent`, tenue à jour par `recordSiteProgressTx`. Elle existe parce que les écrans du lot 2 la lisent déjà. Le contrôleur d'invariants vérifie qu'elle dit bien ce que dit la dernière saisie.

---

## 3. L'engagé, et son piège

```
réalisé = somme des imputations validées et non annulées du chantier
          (c'est getSiteActualCost du lot 2, inchangé)

engagé  = réalisé
        + somme, sur les bons ÉMIS et non annulés du chantier,
          de leur RESTE À FACTURER
```

Le reste à facturer, **et non le montant du bon**. Sans cela, une facture rapprochée d'un bon serait comptée deux fois : une fois dans le réalisé, une fois dans le bon. C'est le piège de cette formule, et la raison pour laquelle `remainingAmount` existe sur `PurchaseOrderRecord`.

Un bon en brouillon n'engage rien. Un bon annulé non plus.

---

## 4. Les huit modèles

| Modèle                | Rôle                                          | Ce qu'il ne porte pas                    |
| --------------------- | --------------------------------------------- | ---------------------------------------- |
| `SiteBudget`          | Budget d'un chantier, brouillon puis validé   | Aucun total : c'est la somme des lignes  |
| `SiteBudgetLine`      | Un poste, un montant prévu                    | Aucun réalisé : il se dérive             |
| `BudgetAmendment`     | Avenant daté et motivé, brouillon puis validé | Aucun nouveau total                      |
| `BudgetAmendmentLine` | Un poste, un écart **signé**                  |                                          |
| `PurchaseOrder`       | Bon de commande, cycle décidé                 | Aucun état de facturation : il se dérive |
| `PurchaseOrderLine`   | Un poste, un montant                          |                                          |
| `SiteProgressEntry`   | Avancement daté, historique conservé          |                                          |
| `SiteBudgetAlert`     | Alerte de dépassement, acquittable            |                                          |

Deux index partiels, posés en SQL brut parce que le langage de Prisma ne connaît pas la clause `WHERE` sur un index : un seul budget validé par chantier, et une seule alerte non acquittée par budget.

---

## 5. Les points d'entrée

Dix-neuf routes, toutes sous `/tenants/{tenantId}/finance`. Les permissions sont celles des lots 1 et 2 : **aucune permission neuve**.

| Méthode | Chemin                                  | Permission           | Rend                    |
| ------- | --------------------------------------- | -------------------- | ----------------------- |
| GET     | `sites/{siteId}/budgets`                | `accounts.read`      | `SiteBudget[]`          |
| POST    | `sites/{siteId}/budgets`                | `sites.manage`       | `SiteBudget`            |
| GET     | `sites/{siteId}/budget`                 | `accounts.read`      | `SiteBudget` ou 404     |
| POST    | `site-budgets/{budgetId}/validate`      | `documents.validate` | `SiteBudget`            |
| GET     | `site-budgets/{budgetId}/amendments`    | `accounts.read`      | `BudgetAmendment[]`     |
| POST    | `site-budgets/{budgetId}/amendments`    | `sites.manage`       | `BudgetAmendment`       |
| POST    | `budget-amendments/{id}/validate`       | `documents.validate` | `BudgetAmendment`       |
| GET     | `purchase-orders`                       | `accounts.read`      | `PurchaseOrder[]`       |
| POST    | `purchase-orders`                       | `documents.create`   | `PurchaseOrder`         |
| GET     | `purchase-orders/{orderId}`             | `accounts.read`      | `PurchaseOrder`         |
| POST    | `purchase-orders/{orderId}/issue`       | `documents.validate` | `PurchaseOrder`         |
| POST    | `purchase-orders/{orderId}/cancel`      | `documents.validate` | `PurchaseOrder`         |
| POST    | `supplier-invoices/{id}/purchase-order` | `documents.create`   | `PurchaseOrder` ou null |
| GET     | `sites/{siteId}/engagement`             | `accounts.read`      | `SiteEngagement`        |
| GET     | `sites/{siteId}/progress`               | `accounts.read`      | `SiteProgressEntry[]`   |
| POST    | `sites/{siteId}/progress`               | `sites.manage`       | `SiteProgressEntry`     |
| GET     | `budget-alerts`                         | `reports.read`       | `SiteBudgetAlert[]`     |
| POST    | `budget-alerts/{alertId}/acknowledge`   | `documents.validate` | `SiteBudgetAlert`       |
| GET     | `sites/dashboard`                       | `reports.read`       | `SitesDashboard`        |

Le rapprochement d'une facture à un bon prend `{ "purchaseOrderId": "<uuid>" | null }` : passer `null` défait le rapprochement.

**Les gardes se posent avec leur chemin**, jamais en `router.use(authenticate)` nu. Un routeur monté sur `/api` tout entier ferait sinon traverser son garde à toute requête `/api/*` — le défaut corrigé au lot 2, qui rendait le sélecteur de commune muet.

---

## 6. Où l'alerte se déclenche

`raiseBudgetAlertIfNeededTx` est appelée aux **trois seuls moments où l'engagé peut monter** :

1. validation d'une facture fournisseur (`validateSupplierInvoiceTx`) ;
2. validation d'une pièce de caisse (`validateCashVoucherTx`) ;
3. émission d'un bon de commande (`issuePurchaseOrderTx`).

Elle **ne lève jamais d'exception** pour cause de dépassement. Une alerte informe, elle n'interdit pas : refuser la validation d'une facture parce qu'un budget est dépassé bloquerait l'enregistrement d'une dépense qui, elle, a bien eu lieu.

---

## 7. Critères de sortie

1. Sur une vraie base, l'engagé d'un chantier égale son réalisé plus le reste à facturer de ses bons émis, **sans double compte** quand une facture est rapprochée d'un bon.
2. Aucune route ne permet d'écrire un total de budget, un budget révisé, ni un état de facturation.
3. `ConstructionSite.progressPercent` égale toujours le pourcentage de la dernière saisie d'avancement, au sens de la date de saisie.
4. Le tableau de bord sort en un seul appel, agrégé en SQL.
5. Aucun écran ne prononce « débit » ni « crédit ».

Les trois premiers sont vérifiés par `scripts/finance-e2e-lot3.ts`, sur le modèle du lot 2 : tenant jetable, fonctions de production appelées telles quelles, nettoyage systématique.
