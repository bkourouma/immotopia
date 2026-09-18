# Organisation multi-agents — Lots 0 et 1

|                     |                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------- |
| **Document source** | Plan de mise en œuvre du 18 septembre 2026, décisions § 12                                    |
| **Superviseur**     | Claude Opus 5, effort élevé                                                                   |
| **Exécutants**      | Sous-agents Claude Sonnet 5, sauf exceptions motivées au § 6                                  |
| **Portée**          | Lots 0 et 1. Les lots 2 à 5 réutiliseront la même mécanique, recalibrée sur le réel du lot 1. |
| **Statut**          | Proposition, à valider avant lancement                                                        |

---

## 1. Le principe : contrat d'abord, territoires disjoints

Le parallélisme ne vient pas du nombre d'agents. Il vient de deux règles.

**Règle A · Le contrat précède le code.** Avant toute vague de fan-out, j'écris seul le schéma Prisma, la migration, les types TypeScript et les signatures de fonctions. Ces fichiers gèlent les interfaces. Chaque agent code ensuite contre une interface stable, sans attendre les autres. Un agent qui a besoin d'une fonction non encore écrite trouve un talon qui lève une erreur, avec la bonne signature.

**Règle B · Deux agents ne touchent jamais le même fichier.** Le territoire de chacun est une liste de chemins, énoncée dans sa consigne. Je vérifie après chaque vague avec `git diff --name-only` qu'aucun agent n'est sorti du sien. Un agent qui a besoin d'un fichier hors territoire ne le modifie pas : il le signale dans son rapport, et j'arbitre.

Ces deux règles ont un corollaire : **les fichiers-registre sont à moi.** Un fichier-registre est un fichier que tout le monde voudrait modifier d'une ligne. Il concentre les conflits. Liste exhaustive pour ce projet :

| Fichier                                       | Rôle                              |
| --------------------------------------------- | --------------------------------- |
| `packages/api/prisma/schema.prisma`           | 3 842 lignes, modèle unique       |
| `packages/api/prisma/migrations/`             | l'ordre des migrations est global |
| `packages/api/src/index.ts`                   | montage des routeurs              |
| `packages/api/src/lib/finance/types.ts`       | contrat gelé du domaine           |
| `apps/web/src/types/finance-types.ts`         | contrat gelé côté web             |
| `apps/web/src/services/finance-service.ts`    | frontière réseau                  |
| `apps/web/src/navigation/model.tsx`           | arbre de navigation               |
| `apps/web/src/App.tsx`                        | table des routes                  |
| `apps/web/src/components/primitives/index.ts` | barillet d'exports                |

---

## 2. Répertoire partagé, pas de worktree

Je recommande de **ne pas** isoler les agents dans des worktrees git, pour trois raisons propres à ce dépôt.

1. Le monorepo est en workspaces npm avec un seul `package-lock.json`. Chaque worktree exigerait son `npm install`.
2. Prisma génère son client dans `node_modules`. Chaque worktree exigerait son `prisma generate`, et un client désynchronisé produit des erreurs de type incompréhensibles.
3. Avec des territoires disjoints, l'isolement n'apporte rien. Il déplace le coût vers la fusion, que je devrais faire à la main N fois.

Exception : si une vague doit expérimenter une migration risquée, cet agent-là tourne en worktree. Ce ne sera pas le cas avant le lot 2.

---

## 3. Blocage à lever avant tout lancement

Le plan disait « créer `feat/finance-lot-1` depuis `main` après fusion de la refonte ». La vérification du dépôt montre que cette phrase, prise au pied de la lettre, détruirait le travail.

| Branche                         | Commits |
| ------------------------------- | ------- |
| `main`                          | 1       |
| `feat/refonte-lot-2` (courante) | 60      |
| Retard de `main` sur la refonte | 59      |

`main` ne contient que l'import initial du monorepo. Toute la refonte, les primitives, la coquille applicative, l'atelier, vivent sur les branches `feat/refonte-*`. S'y ajoutent 114 fichiers modifiés non commités sur la branche courante.

Trois choses doivent arriver, dans cet ordre, avant la première ligne de code du lot 1 :

1. Les 114 fichiers de `feat/refonte-lot-2` sont commités.
2. `feat/refonte-lot-2` est fusionnée dans `main`.
3. `feat/finance-lot-1` est créée depuis `main`, qui porte alors les 60 commits.

**Ce qui peut démarrer avant.** Les tâches du lot 0 qui ne créent que des fichiers nouveaux se fusionnent sans conflit quelle que soit la branche : la spécification 016 et les tests de caractérisation. Elles peuvent partir tout de suite sur la branche courante. Les deux extractions du lot 0, qui modifient des fichiers existants, attendent la branche propre.

---

## 4. Les rôles

Neuf rôles, définis par territoire de fichiers. Aucun n'est un poste permanent : un rôle est une consigne, un territoire et un critère de fin.

| Rôle                      | Territoire                                                                                | Livre                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Spécificateur**         | `specs/016-finance-operationnelle/`                                                       | Les cinq documents de spécification, au format des specs 013 à 015                                     |
| **Caractériseur**         | `packages/api/__tests__/**/*.characterization.test.ts`                                    | Les tests qui décrivent le comportement comptable actuel, garde-fou du lot 2                           |
| **Mesureur**              | `packages/api/scripts/`, `apps/web/scripts/`                                              | Le décompte de référence des erreurs TypeScript, l'inventaire des tests, le banc de charge à 500 tiers |
| **Refactoreur comptable** | `packages/api/src/lib/syndics/queries.ts`, `packages/api/src/lib/finance/ledger.ts`       | L'extraction du calcul de solde, à comportement identique                                              |
| **Refactoreur locatif**   | `packages/api/src/services/rental-installment-service.ts`                                 | L'extraction de `buildInstallmentForPeriod`                                                            |
| **Grand-livre**           | `lib/finance/ledger.ts` et ses tests                                                      | Ajout de mouvement, reconstruction de compte, idempotence                                              |
| **Intégrateur locatif**   | les quatre `services/rental-*.ts`                                                         | Le branchement du grand livre dans les transactions existantes                                         |
| **Restitution**           | `lib/finance/reports.ts`, `statement-pdf.ts`                                              | Balance, balance âgée, relevé, export                                                                  |
| **Campagne**              | `lib/finance/billing-run.ts`, `scripts/finance-backfill-*.ts`                             | Facturation groupée idempotente, application des avances, rétro-remplissage                            |
| **API**                   | `controllers/finance-controller.ts`, `routes/finance-routes.ts`, `lib/finance/schemas.ts` | Endpoints et validation Zod                                                                            |
| **Droits**                | `middleware/finance-rbac-middleware.ts`, `prisma/seeds/finance-permissions-seed.ts`       | Permissions, saisie et validation séparées                                                             |
| **Web balances**          | `pages/finance/BalanceClients.tsx`, `BalanceAgee.tsx`                                     | Les deux écrans de liste                                                                               |
| **Web flux**              | `pages/finance/Releve.tsx`, `Facturation.tsx`                                             | Relevé et campagne                                                                                     |
| **Web portail**           | `pages/TenantPortal/`                                                                     | L'onglet relevé du locataire                                                                           |
| **Relecteur**             | lecture seule                                                                             | Rapport de revue sur le diff complet                                                                   |

Je ne délègue jamais : le schéma, les migrations, les fichiers-registre du § 1, la fusion, et tout arbitrage qui change le plan.

---

## 5. Le séquencement en vagues

Une vague est un ensemble d'agents lancés ensemble, sans dépendance entre eux. Entre deux vagues, je fais un point d'intégration : je relis les rapports, je vérifie les territoires, je lance la vérification globale, je tranche les hypothèses signalées.

### Vague 1 · Lot 0 additif — 3 agents, dès maintenant

| Agent         | Modèle           | Dépend de |
| ------------- | ---------------- | --------- |
| Spécificateur | Sonnet 5         | rien      |
| Caractériseur | Opus 5, voir § 6 | rien      |
| Mesureur      | Sonnet 5         | rien      |

Tous trois ne créent que des fichiers nouveaux. Ils tournent sur la branche courante sans risque.

**Point d'intégration 1.** Je relis la spécification, je vérifie que les tests de caractérisation passent sur le code non modifié, j'enregistre le décompte de référence des erreurs TypeScript.

### Vague 2 · Lot 0 extractions — 2 agents, après la branche propre

| Agent                 | Modèle   | Dépend de     |
| --------------------- | -------- | ------------- |
| Refactoreur comptable | Sonnet 5 | Caractériseur |
| Refactoreur locatif   | Sonnet 5 | rien          |

Deux fichiers distincts, deux agents. Le filet de sécurité du premier est le jeu de tests de la vague 1 : un refactoring à comportement identique se prouve par des tests écrits avant.

**Point d'intégration 2.** Tests de caractérisation toujours verts, décompte TypeScript inchangé.

### Vague 3 · Fondation du lot 1 — moi seul

Non parallélisable, et c'est la pièce qui conditionne tout le reste. Je produis :

- les trois modèles Prisma et leurs enums, puis la migration ;
- `lib/finance/types.ts` : types de domaine et signatures, avec talons ;
- `apps/web/src/types/finance-types.ts` et `services/finance-service.ts` ;
- les contrats de routes dans `specs/016-finance-operationnelle/contracts/`.

Compter une journée. C'est le prix du parallélisme des vagues suivantes.

### Vague 4 · Lot 1, le gros œuvre — 6 agents

C'est ici que le parallélisme paie. Trois agents backend et trois agents frontend, tous contre le contrat gelé de la vague 3.

| Agent        | Modèle   | Travaille contre                   |
| ------------ | -------- | ---------------------------------- |
| Grand-livre  | Sonnet 5 | le schéma                          |
| Restitution  | Sonnet 5 | le schéma                          |
| Campagne     | Sonnet 5 | le schéma, le talon du grand livre |
| Web balances | Sonnet 5 | `finance-types.ts`, service mocké  |
| Web flux     | Sonnet 5 | `finance-types.ts`, service mocké  |
| Web portail  | Sonnet 5 | `finance-types.ts`, service mocké  |

**Pourquoi le frontend peut démarrer sans backend.** Le dépôt a déjà la réponse : `apps/web/src/dev/atelier/mock-api.ts` branche une fausse API sous l'adaptateur axios, de sorte que services, React Query et écrans s'exécutent comme en production. Les trois agents web ajoutent leurs jeux d'essai à `fixtures.ts` et construisent les écrans dans l'atelier. Le branchement sur la vraie API n'est plus qu'un changement d'adaptateur.

Seul point de contention : `fixtures.ts` est un fichier partagé par les trois agents web. Je le découpe en vague 3 en trois fichiers, un par agent.

**Point d'intégration 3.** Le plus chargé. Tests unitaires de chaque territoire, revue des hypothèses, arbitrage.

### Vague 5 · Câblage — 3 agents

| Agent               | Modèle   | Dépend de             |
| ------------------- | -------- | --------------------- |
| Intégrateur locatif | Sonnet 5 | Grand-livre           |
| API                 | Sonnet 5 | Restitution, Campagne |
| Droits              | Sonnet 5 | rien                  |

L'intégrateur locatif est le plus délicat du lot : il touche quatre services existants et doit écrire dans leurs transactions Prisma, jamais à côté. Sa consigne porte cette règle en tête, et un test qui force un échec après le mouvement vérifie qu'aucune trace ne subsiste.

**Point d'intégration 4.** Je monte le routeur, je branche les écrans sur la vraie API, je remplis la navigation et la table des routes.

### Vague 6 · Recette — 1 agent, et moi

| Agent     | Modèle           | Rôle                                 |
| --------- | ---------------- | ------------------------------------ |
| Relecteur | Opus 5, voir § 6 | revue du diff complet, lecture seule |

En parallèle, je lance la suite complète, le banc de charge à 500 tiers, et je vérifie les critères de sortie du § 5.5 du plan. Puis j'écris `docs/finance/LOT-1-RAPPORT.md`, selon le rituel des rapports de refonte.

---

## 6. Choix des modèles

Sonnet 5 par défaut, comme demandé. Je recommande trois exceptions, chacune motivée.

| Agent               | Modèle proposé                               | Raison                                                                                                                                                                                                                                |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caractériseur       | Opus 5                                       | Il doit comprendre un comportement existant subtil et non documenté, dans un fichier de 3 847 lignes, puis écrire des tests qui le décrivent sans le corriger. Une erreur ici fige un mauvais garde-fou, et le lot 2 s'appuie dessus. |
| Relecteur           | Opus 5                                       | Une revue ne vaut que si elle voit ce que l'auteur n'a pas vu.                                                                                                                                                                        |
| Intégrateur locatif | Opus 5 si la vague 5 remonte des difficultés | Seul agent qui modifie des transactions financières existantes. Démarrer en Sonnet 5 et escalader si son rapport signale des hypothèses.                                                                                              |

Tous les autres travaillent contre un contrat gelé, dans un territoire fermé, avec un critère de fin mécanique. C'est exactement la situation où Sonnet 5 est le bon choix.

---

## 7. Ce que je demande à chaque agent

Chaque consigne d'agent porte les six mêmes rubriques. L'uniformité n'est pas un ornement : elle rend les rapports comparables et les écarts visibles.

1. **Territoire.** La liste des chemins qu'il peut créer ou modifier. Rien d'autre.
2. **Contrat.** Les fichiers qu'il doit lire et respecter sans les modifier.
3. **Travail.** Ce qu'il produit, en termes de comportement, pas d'implémentation.
4. **Conventions.** Les règles du dépôt qui s'appliquent à lui : isolation multi-tenant par `tenantId`, erreurs typées de `lib/errors.ts`, contrôleurs en `asyncHandler`, réseau par `api-client`, état de liste dans l'URL, interface en français, aucun mot « débit » ou « crédit » à l'écran.
5. **Critère de fin.** Mécanique et vérifiable : ses tests passent, le décompte d'erreurs TypeScript n'augmente pas, aucun fichier hors territoire n'est modifié.
6. **Rapport.** Trois paragraphes : ce qu'il a fait, ce qu'il n'a pas pu faire, les hypothèses qu'il a prises. Les agents ne peuvent pas poser de question en cours de route. Cette rubrique est leur seul canal, et mon principal point de contrôle.

---

## 8. Ce que je vérifie entre deux vagues

Quatre contrôles, toujours les mêmes.

| Contrôle                  | Commande ou geste                                                     |
| ------------------------- | --------------------------------------------------------------------- |
| Territoires respectés     | `git diff --name-only` comparé à la liste des territoires de la vague |
| Pas de régression de type | Décompte `tsc --noEmit` comparé à la référence de la vague 1          |
| Tests verts               | `npm test` et `npm run test:web`                                      |
| Hypothèses arbitrées      | Lecture des rubriques 6 de chaque rapport, décision écrite au carnet  |

Je tiens un carnet de bord dans le répertoire de travail temporaire : qui possède quoi, ce qui est fait, les hypothèses en attente d'arbitrage. Il survit aux résumés de contexte de la session.

---

## 9. Ce que ça fait gagner, honnêtement

Le parallélisme n'agit que sur les phases de fan-out. Les vagues 3 et les points d'intégration restent séquentiels, et ils sont incompressibles.

| Phase                        | Séquentiel | Avec agents | Gain           |
| ---------------------------- | ---------- | ----------- | -------------- |
| Lot 0                        | 1 semaine  | 2 à 3 jours | réel           |
| Lot 1 vague 3                | 1 jour     | 1 jour      | nul, c'est moi |
| Lot 1 vagues 4 et 5          | 2 semaines | 4 à 6 jours | réel           |
| Lot 1 intégration et recette | 3 jours    | 3 jours     | nul            |

Ordre de grandeur pour les lots 0 et 1 réunis : de trois à quatre semaines vers dix à douze jours. Pas un facteur six. La coordination a un coût, et je le paie en points d'intégration.

Le gain augmentera au lot 2, où le fan-out est plus large : la généralisation comptable, les fournisseurs et le chantier ont peu de fichiers communs.

---

## 10. Risques propres à cette organisation

| Risque                                                           | Garde-fou                                                                                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un agent sort de son territoire et écrase le travail d'un autre  | Territoires énoncés en tête de consigne, vérification systématique par `git diff --name-only` à chaque point d'intégration                                      |
| Un agent invente une signature au lieu de lire le contrat        | Le contrat est un fichier TypeScript avec des talons qui lèvent une erreur. Un agent qui l'ignore ne compile pas.                                               |
| Deux agents implémentent la même règle métier différemment       | Les règles vivent dans la spécification 016 de la vague 1, écrite avant tout code                                                                               |
| Un agent prend une hypothèse fausse et personne ne le voit       | Rubrique 6 obligatoire dans chaque rapport, lue à chaque point d'intégration                                                                                    |
| Le contrat de la vague 3 se révèle faux en vague 4               | Je le corrige moi-même et je relance les agents concernés. C'est le scénario le plus coûteux, et la raison pour laquelle la vague 3 mérite une journée entière. |
| Les 160 erreurs TypeScript préexistantes masquent une régression | Décompte de référence capturé en vague 1 par le Mesureur, comparé à chaque point d'intégration                                                                  |

---

## 11. Pour lancer

Il me faut trois choses.

1. **La validation de cette organisation**, ou vos corrections sur les rôles et les vagues.
2. **Une décision sur le démarrage** : soit je lance la vague 1 tout de suite sur la branche courante, puisqu'elle n'ajoute que des fichiers, soit j'attends que la refonte soit commitée et fusionnée.
3. **Le geste git** du § 3, que je ne fais pas sans vous : commiter 114 fichiers et fusionner une branche de 59 commits dans `main` sont des actions qui vous appartiennent. Je peux les préparer et vous montrer ce que je ferais.
