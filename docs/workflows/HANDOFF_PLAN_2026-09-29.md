# Passation — plan de reprise du 2026-09-29 (échéance 16 h, heure d'Abidjan = UTC)

Écrit par le Pilote de la session « Gestion des sessions » (compte à court de
crédit, rien de ce plan n'a été lancé). À exécuter depuis **un autre compte** :
ouvrir une session, lancer `/lead`, lui demander de lire ce fichier puis
`docs/workflows/HANDOFF.md`, et d'exécuter les chantiers ci-dessous en parallèle.

`main` au moment de l'écriture : `6c45488` (PR #55, #56, #57 fusionnées, CI verte).

## 1. Décisions métier actées (réponses de l'utilisateur, 2026-09-29)

| Sujet                                                    | Décision                                                                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Préavis des baux                                         | 3 mois habitation / 6 mois commercial, validés tels quels (retirer la mention « à faire valider »).                                                                                                                |
| Pénalité de retard                                       | Corriger le **texte du modèle** : « pénalité de X en cas de retard » (montant unique, pas « par jour »). Ne pas toucher au calcul.                                                                                 |
| Devise des modèles DOCX                                  | Utiliser la **devise du bail** (défaut FCFA) au lieu de « FCFA » écrit en dur. Garder les anciennes clés du contexte (modèles d'agence personnalisés).                                                             |
| Plusieurs contrats par bail                              | Suffixe de version : le premier contrat garde le numéro du bail, les suivants prennent `-A2`, `-A3` (ex. `BAIL-2026-0012-A2`). Aujourd'hui l'index unique `(tenant_id, document_number)` refuse le second (P2002). |
| Palier gratuit Patrimoine                                | **10 actifs**, tel que déjà livré dans la PR #52 (la réponse « 5 » est abandonnée).                                                                                                                                |
| Responsabilité d'un calcul fondé sur un paramètre validé | Avertissement « estimation indicative, non vérifié par ImmoTopia » + mention du paramètre validé par l'utilisateur. À faire relire par un juriste avant l'ouverture publique.                                      |
| Données personnelles du particulier                      | **Permission dédiée** `PATRIMOINE_PERSONAL_VIEW` / `PATRIMOINE_PERSONAL_EDIT`, non donnée aux rôles agence par défaut.                                                                                             |
| Clôture d'exercice Syndic                                | **Spécifier seulement** (pas d'implémentation avant 16 h).                                                                                                                                                         |
| Lots Patrimoine                                          | Lots 1 à 4 déjà dans la PR #52. Restent : **lot 5** (exports PDF/Excel de la situation patrimoniale) et **lot 6** (collecte des paramètres fiscaux par IA, validation personnelle).                                |
| Production                                               | **Plan et checklist seulement** ; l'utilisateur déploie lui-même.                                                                                                                                                  |

Non tranché (ne pas décider à sa place) : liste des statuts juridiques fonciers
(juriste local) ; relecture juridique des conditions d'utilisation, conservation
et protection des données ; déploiement en production ; passage en
`SUBSCRIPTION_ENFORCEMENT=enforce`.

## 2. État des PR et sessions

- **PR #52** `claude/lucid-bell-0pzfvc` (Patrimoine lots 1 à 4, brouillon, ~200
  fichiers, tête `f20b5ba` au dernier relevé). Sa session est bloquée sur la
  question « lot 5 en PR séparée, ou tester le flux actuel d'abord ? » → réponse :
  **lot 5 en PR séparée**, empilée sur #52. Recette navigateur jamais faite.
  Ne pas fusionner avant recette et CI verte 6/6.
- Session « Cloud - ImmoCopilot IA assistant » : bloquée sur une permission
  `send_later` (à trancher par l'utilisateur, sans effet sur le code).
- Session « Scénario de test complet syndic » : attend le feu vert de
  l'utilisateur pour une vérification sur le serveur de production.

## 3. Chantiers (un agent = un territoire de fichiers, jamais deux sur le même fichier)

Tous les agents : modèle `sonnet`, worktree et branche propres, un seul
`git switch -c <branche> <base>` au début. Voir §5 pour les règles.

| #   | Branche (base)                                         | Tâche                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Territoire                                                                                                    | Vérifier                                                                                                                               |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | `fix/baux-numerotation-devise` (`main`)                | Numérotation `-A2` sans course (verrou consultatif, motif `withExclusiveSection` d'ImmoCopilot) ; champ `DEVISE` dans les contextes bail et quittance, modèles `.docx` mis à jour (placeholders `{{…}}`, anciennes clés conservées) ; texte de pénalité corrigé ; retirer « à faire valider » du préavis ; `RECU_NUMERO` de la quittance : attribuer le numéro définitif `RCU-…` avant le rendu si simple, sinon documenter.                                                            | `document-generation-service.ts`, `document-context-builder.ts`, `assets/modeles_documents/`, tests documents | `document-context-lease-templates.test.ts`, tests de génération, rendu des vrais modèles sans `{{` restant, deux contrats sur un bail. |
| W2  | `test/isolation-baux-docx` (`main`)                    | `cleanupTenants` qui échoue en silence dès qu'un bail existe (pas de cascade `rental_*`) ; cas passant de `POST /ai/actions/execute` avec génération DOCX réussie (modèle global semé par `db:seed:document-templates`).                                                                                                                                                                                                                                                                | `packages/api/__tests__/integration/**`, fixtures                                                             | `npm run test:isolation` sur base dédiée (`DATABASE_URL_TEST`), 43+ tests verts.                                                       |
| W3  | `fix/copilot-limiteurs-partages` (`main`)              | Limiteurs de débit ImmoCopilot en mémoire par instance : partager si une infra existe (Redis/Postgres), sinon avertissement au démarrage + documentation ; valider `connection_limit` ; test de saturation réelle du pool sur PostgreSQL ; documenter le jeton consommé après échec (fail-closed).                                                                                                                                                                                      | `src/middleware/ai-*`, `lib/ai`, `config/env.ts`, `env.example`, `ai-concurrency.test.ts`                     | Concurrence sur base réelle, `typecheck` sans nouvelle erreur.                                                                         |
| W4  | (recette, pas de code)                                 | Jouer `docs/recette/SCENARIO_SYNDIC_ESSAI_EXERCICE_COMPLET.md` sur une base neuve (agence « Horizon Syndic Gestion », pack Syndic d'essai) + les non-vus du lot d'anomalies (exécution neuve avec raisons par lot, compte copropriétaire, import réel d'image de marque). Consigner les points « consigner ». Agent `ui-tester`.                                                                                                                                                        | lecture seule ; anomalies dans `.agent-bus/`                                                                  | Rapport d'anomalies reproductibles.                                                                                                    |
| W5  | (recette, pas de code)                                 | Recette navigateur de #52 (lots 1 à 4 : valeur nette, actifs, projections, espace particulier, montée de palier), puis portail propriétaire P5 et plan de test de la PR #46 (packs Patrimoine). Ports distincts de W4.                                                                                                                                                                                                                                                                  | lecture seule                                                                                                 | Rapport d'anomalies, à renvoyer à la branche de #52.                                                                                   |
| W6  | `docs/spec-syndic-cloture-exercice` (`main`)           | Rédiger `specs/027-syndic-cloture-exercice/` : report à nouveau, ouverture N+1, écritures OD, verrouillage, AGO ; partir des manques listés en N.8 du scénario syndic. Spécification uniquement.                                                                                                                                                                                                                                                                                        | `specs/027-*`                                                                                                 | Relecture croisée avec le scénario.                                                                                                    |
| W7  | `docs/plan-deploiement-production` (`main`)            | `docs/workflows/PLAN_DEPLOIEMENT_PRODUCTION.md` : migrations à appliquer depuis l'image de prod du 2026-09-25 (lister les dossiers `prisma/migrations` postérieurs), sauvegarde de base avant, `migrate deploy`, attribution d'un pack par agence (Ivoire Résidences n'a que `MODULE_AGENCY` mais utilise 4 copropriétés et 1 chantier ; Agence Immobilière du Mali n'a aucun module), observation des refus en `warn`, puis `enforce`, retour arrière. Aucun secret, aucun accès prod. | `docs/workflows/PLAN_DEPLOIEMENT_PRODUCTION.md`                                                               | Relecture ; l'utilisateur déploie.                                                                                                     |
| W8  | `feat/patrimoine-lot5-exports` (tête de #52)           | Exports PDF et Excel de la situation patrimoniale (valeur nette, actifs, dettes) : reprendre le motif `lib/patrimoine/export/` du lot P3, `PROPERTIES_VIEW` remplacé par la permission adéquate, isolation tenant, fichier en mémoire, borne de lignes. Nouveau fichier de routes monté par une seule ligne.                                                                                                                                                                            | nouveaux fichiers `lib/patrimoine/export/net-worth-*`, contrôleur, routes                                     | Tests, `check:architecture`, `wiki:check`, budget `measure:entry`.                                                                     |
| W9  | `feat/patrimoine-permission-personnelle` (tête de #52) | Créer `PATRIMOINE_PERSONAL_VIEW/EDIT` (seed RBAC), protéger les routes des actifs non immobiliers du particulier, pas d'octroi aux rôles agence par défaut, tests `routes-inventory`. Attention : toucher le catalogue de permissions et `particulier-routes.ts`.                                                                                                                                                                                                                       | RBAC seed, routes patrimoine actifs                                                                           | `routes-inventory`, `test:isolation`, non-régression des rôles existants.                                                              |
| W10 | `feat/patrimoine-lot6-fiscal-ia` (après W9)            | Lot 6 : collecte des paramètres fiscaux par IA. `TaxParameter` est global (sans `tenantId`) : la validation personnelle exige une portée par tenant (migration additive). Mention « indicatif, non vérifié par ImmoTopia ».                                                                                                                                                                                                                                                             | `lib/patrimoine/tax/**`, schéma (additif)                                                                     | Tests, `migrate diff --exit-code` sur base jetable.                                                                                    |
| W11 | (dernier, par le Pilote seul)                          | Ménage de `docs/workflows/HANDOFF.md` : retirer les sections des branches fusionnées (PR #42 à #47 : vérifier d'abord qu'elles sont fusionnées avec les outils PR), y consigner l'état final. Vérifier le statut de `tenant-data-export.archive.test.ts` (CI de `main` verte : sans doute local seulement).                                                                                                                                                                             | `HANDOFF.md`                                                                                                  | —                                                                                                                                      |

Parallélisme : W1 à W7 sont indépendants et peuvent tous partir ensemble. W8 et
W9 partent dès que la tête de #52 est connue (fetch avant). W10 attend W9 (même
zone RBAC). W11 en dernier.

## 4. Ordre de fusion et garde-fous

1. W1, W2, W3, W6, W7 vers `main` dès CI 6/6 verte (« API — typecheck, lint,
   test », « Web — typecheck, lint, build », « Web — tests » lots 1 à 4).
2. #52 vers `main` après recette (W5), corrections et CI verte.
3. W8, W9, W10 : PR ciblant `claude/lucid-bell-0pzfvc` tant que #52 n'est pas
   fusionnée, puis `main`.
4. Fusion par le Pilote **seulement avec un « oui » explicite de l'utilisateur
   dans la conversation de ce compte** (règle du Pilote) ; l'accord donné dans
   la session précédente ne se transmet pas.

Conflits attendus, résolus par le Pilote : `HANDOFF.md` (garder toutes les
sections, relire `grep -n '^## Branche'`), classeur wiki `.xlsx` (repartir de la
version de `main`, réappliquer ses lignes, `npm run wiki:export`,
`npm run wiki:check`), catalogues i18n (`npm run i18n:extract`, ne jamais
retrier à la main), `schema.prisma` (W10 seule).

## 5. Règles des agents et limites du poste

- Poste cloud : 4 CPU, 15 Go de RAM, ~30 Go de disque, pas de `.env` : tout
  passe par des variables d'environnement en ligne (`DATABASE_URL`,
  `JWT_SECRET` généré, `AI_PROVIDER=fake`). PostgreSQL local :
  `pg_ctlcluster 16 main start` (voir HANDOFF « fix/copilot-fake-numero-bail »
  dans l'historique git pour la séquence de seeds). **Au plus 3 ou 4 agents lourds
  en même temps** ; un seul run Jest/Vitest lourd par agent (`--maxWorkers=2`).
- `npm ci` **à la racine uniquement** (le hook refuse un `cd packages/api &&
npm …`). Un `node_modules` unique, lié dans les worktrees (RUNBOOK,
  « Worktrees git »), sauf W10 (schéma) qui prend son propre `npm ci`.
  `rm -rf node_modules` est refusé par le hook.
- Prompts de réalisation : interdire `git stash`, `checkout`, `reset`,
  `restore`, push forcé, `--no-verify`, `LEFTHOOK=0`, lecture ou écriture d'un
  `.env`, lancement d'autres agents ; s'arrêter et signaler si un travail semble
  revenu en arrière. Chaque agent commite et pousse sa seule branche ; le Pilote
  ouvre les PR (titre et description en français, ligne d'attribution).
- Wiki des fonctionnalités : mettre à jour le classeur seulement si un écran,
  une route, une permission ou une entrée de menu change (W8, W9, W10) ;
  `npm run wiki:export` puis `wiki:check`.
- Avant chaque push : `typecheck` (aucune nouvelle erreur dans un fichier
  auparavant propre), tests ciblés, `check:architecture`, `i18n:extract` si un
  texte change. Rapport de fin : fait, vérifié (commande et résultat), non
  vérifié, branche, dernier commit.

## 6. Reste à la charge de l'utilisateur

- Trancher la liste des statuts fonciers (juriste local) et les relectures
  juridiques avant l'ouverture publique du particulier.
- Feu vert du serveur pour la session « Scénario de test complet syndic ».
- Déploiement en production, puis attribution des packs et passage à
  `enforce` (chaque étape avec accord).
- Protection de branche GitHub (indisponible) ; `demo:sync --install` à relancer
  depuis un poste local ; permission `send_later` de la session ImmoCopilot.
