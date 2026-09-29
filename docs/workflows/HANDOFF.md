# Passation de session

Carnet de reprise entre sessions d'agents. **Lire en premier** en début de
session ; **mettre à jour sans l'annoncer** avant de conclure tout tour en
plusieurs étapes (règle posée dans AGENTS.md et CLAUDE.md).

## Mode d'emploi

- Une section par branche, la plus récente en haut. Réécrire la section de sa
  branche au lieu d'empiler des entrées : ce fichier décrit l'état présent, pas
  l'historique (l'historique, c'est `git log`).
- Supprimer la section d'une branche une fois fusionnée dans `main`.
- Dates absolues (`2026-09-27`), jamais « hier ».
- Chaque worktree a sa copie : en cas de conflit à la fusion, garder les deux
  sections de branche, elles sont indépendantes.
- Pas de secret, pas de donnée personnelle, pas de contenu de `.env`.

Modèle de section :

```markdown
## Branche `type/sujet` — AAAA-MM-JJ

**État :** en cours | prêt à relire | bloqué
**Dernier commit :** `abc1234` résumé

Fait :

- …

Reste à faire :

- …

Pièges et décisions :

- …
```

---

## Pilote — exécution du plan de reprise du 2026-09-29 — 2026-09-29

**État :** 14 PR ouvertes (#62 à #74 et #76), aucune fusionnée (une fusion demande l'accord explicite de l'utilisateur) ; lot 6 non commencé
**Branche :** `docs/handoff-reprise-2026-09-29` (cette passation, PR vers `main`) — dernier commit : voir `git log -1`

Les sections des branches déjà fusionnées dans `main` (PR #40 à #48, ImmoCopilot #49 à #57) ont été retirées : l'historique est dans `git log`. Le plan d'origine est `docs/workflows/HANDOFF_PLAN_2026-09-29.md` (PR #60, pas encore fusionnée).

### PR ouvertes

Vers `main`, indépendantes. Un classeur `.xlsx` binaire et son miroir sont touchés par #63, #71, #72 : le deuxième et le troisième à fusionner auront un conflit ; repartir du classeur de `main`, réappliquer ses lignes avec `openpyxl`, puis `npm run wiki:export` et `npm run wiki:check`.

- #62 tests d'isolation : nettoyage des baux sans échec silencieux, cas passant de génération DOCX (46 tests).
- #63 baux : numérotation `-A2` des contrats suivants (verrou consultatif), devise du bail (`{{DEVISE}}`), texte de pénalité, `RECU_NUMERO`. **Remplace la #59 (à fermer).**
- #64 ImmoCopilot : avertissements (limiteurs par instance, `connection_limit`), test de saturation du pool.
- #65 spec `027-syndic-cloture-exercice` (spécification seule) ; #66 plan de mise en production (plan seul).
- #76 spec `028-ia-credits` (spécification seule) : facturation des crédits IA d'ImmoCopilot (10 requêtes gratuites par mois, packs, dépassement plafonné en opt-in, recharges) ; 16 décisions « par défaut, à valider », 23 questions ouvertes ; les prix ne se figent qu'après deux semaines de mesure du lot A ; dépend de l'ordre de fusion de #61 (OpenRouter) et de #52.
- #68 web : inscription libre (`confirmPassword`), fil d'Ariane admin, accents, devise du portail.
- #71 Syndic : tantièmes spéciaux et « propriétaire depuis » des lots enregistrés (décision à valider : un parking sans saisie n'a plus de tantièmes spéciaux).
- #72 Syndic : programmation modifiable, échec d'envoi d'une relance signalé (pénalité BUG-H : constat seulement).
- #73 sécurité : l'administrateur d'une agence provisionnée peut accepter son invitation (relue par `security-auditor`, essai de bout en bout sur PostgreSQL réel).

Pile de la PR #52 (Patrimoine lots 1 à 4, brouillon, `claude/lucid-bell-0pzfvc`). **Ne la fusionner qu'après ces PR et un dernier rejeu de recette.**

- #67 fiche d'un actif inaccessible (route sans `:assetId`) ; #74 valeur calculée enregistrée comme « manuelle » (B1) ; #69 permissions `PATRIMOINE_PERSONAL_VIEW/EDIT` (rôle réservé `PERSONAL_SPACE_OWNER`, audit de sécurité fait, faille haute corrigée) ; #70 lot 5, exports PDF et Excel, **empilée sur #69** (base `feat/patrimoine-permission-personnelle`) ; audit de sécurité fait, limiteur de débit dédié ajouté, restent deux constats bas (trace d'audit de l'export, coût quadratique de `loadOriginalValues`).
- Le job web « lot 4/4 » a échoué à deux reprises sur `copilot-root.test.tsx` (Ctrl+J) puis passé au rejeu, et `property-holding-tax-section.test.tsx` une fois sur #63 : tests instables, non liés aux changements.

Autres : #59 à fermer ; #60 plan de reprise (doc) ; #61 OpenRouter (autre session, CI en échec avant cette session, non touchée).

### Reste à faire

- **Fusions et déploiement : l'utilisateur.** Après #69 : `npm run db:seed:patrimoine-personal-permissions -w @immotopia/api` (sinon les espaces PARTICULIER existants reçoivent 403). Après #63 : remplacer les modèles DOCX globaux en base (le seed saute les modèles par défaut existants). Voir `PLAN_DEPLOIEMENT_PRODUCTION.md` (#66) : la contradiction entre l'ADR-003 et la passation est à trancher en premier ; `infra/compose/docker-compose.prod.yml` fixe `VITE_SHOW_DEMO_ACCOUNTS: "true"` (panneau de comptes de démonstration dans le bundle : à trancher avant de reconstruire le front).
- **Lot 6 Patrimoine (collecte fiscale par IA) : non commencé.** Bloquants : le `LlmProvider` n'a pas de recherche web (spec 023, cas limites) ; `TaxParameter` est global, la validation personnelle exige une portée par agence (migration additive). Découpage proposé : 6a validation par agence avec mention « indicatif, non vérifié par ImmoTopia » ; 6b collecte par IA.
- **Décisions produit** : pénalité de retard Syndic (BUG-H : taux par mois au prorata des jours, ou forfait ?) ; les agences perdent l'accès aux écrans Valeur nette, Actifs, Entités et Projections (voie d'octroi : permission accordée à un rôle par le super-admin) et leur menu n'est pas filtré par permission (`role-menu-service.ts`, « absence = autorisé ») ; menu d'un compte « biens détenus » en mode `warn` ; routes `properties/:id/holdings|tax-*` laissées sous `PROPERTIES_*` ; dette adossée à un actif cédé toujours comptée.
- **Recettes.** Deux passes navigateur jouées sur des instances jetables ; les corrections #67, #68, #71, #72, #73 ont été **rejouées en navigateur** (Syndic : tantièmes spéciaux, programmation, relance manuelle en échec, invitation d'administrateur, fil d'Ariane, accents : OK) ; #74 et #69/#70 ne l'ont été que par tests. **Non rejouées.** Patrimoine : archivage d'un actif, suggestions hors véhicule, dépassement de 100 % des parts, simulations, comptage des biens, dépassement facturé, `EXT_BIENS_10`, changement de palier, `OWN_ASSETS_ONLY`, arabe et 375 px des nouveaux écrans. Syndic : F.1 à F.4, F.6, F.7, G, H, I.2 à I.7, J.3, K, L.4, L.5, M, N.4 à N.11, O, et « Exécuter maintenant » d'une programmation sur une période neuve ; le compte copropriétaire (lien `reset-password` à jeton) a été refusé par le contrôle de permissions de l'environnement, à faire jouer avec un accord explicite. **Anomalies ouvertes** : libellés non traduits en arabe sur `S/budgets` (BUG-I) ; « TRIALING » brut et « Remise de combinaison 10 % » sur un pack unique (fiche agence) ; page d'abonnement du particulier (codes de pack bruts, lignes Lots et Copropriétés sans objet, rôle « Collaborateur d'agence ») ; « Reprise » d'une programmation qui chevauche une autre active semble ne rien faire sans message (N2, à confirmer) ; modales de profils Syndic sans accents (« propriete », « debut », « facturees ») ; l'agence « biens détenus » garde un menu complet en mode `warn` ; aucune entrée de menu mène à Valeur nette / Actifs / Projections pour un compte d'agence (elles existent dans le code, zone « Plus »).
- **Dette d'authentification relevée par l'audit (hors PR)** : `lastLoginAt` n'est écrit nulle part ; la fusion Google (`passport.ts`) garde le mot de passe d'un compte libre pré-créé ; `resetPassword` ne révoque pas les refresh tokens ; le risque accepté du super-admin qui provisionne un e-mail arbitraire est à consigner dans `SECURITY.md` (évité pour ne pas entrer en conflit avec #61). Reste aussi à l'utilisateur : statuts fonciers, relectures juridiques, feu vert serveur de la session « Scénario de test complet syndic », permission `send_later` de la session ImmoCopilot.

### Pièges rencontrés

- **Worktrees et jonctions (incident du 2026-09-27).** Cette session a posé des worktrees sous `.claude/worktrees/` (`w1-baux`, `w2-isolation`, `w3-limiteurs`, `w4-recette`, `w5-recette`, `w6-spec-cloture`, `w7-plan-prod`, `w8-exports`, `w9-permission`, `w11-handoff`, `f1-invitation` à `f6-valorisation`) avec des jonctions `node_modules`. Ceux de #52 (`w8`, `w9`, `w5`, `f6`) pointent vers une copie privée du `node_modules` dans le dossier temporaire de la session, qui peut disparaître. **Avant tout `git worktree remove`, supprimer chaque jonction avec `rmdir`** (jamais `rm -rf`).
- Une copie de `node_modules` doit vivre dans un dossier **nommé** `node_modules` (la résolution Node l'exige) ; `robocopy /XJ` ne copie pas les liens `@immotopia/*` (à refaire). `New-Item -ItemType Junction` crée les dossiers parents manquants : ne l'exécuter qu'après `git worktree add`.
- **Vite** : deux serveurs qui partagent `apps/web/node_modules/.vite` par une jonction donnent une page blanche (504 « Outdated Optimize Dep ») ; donner à chacun son propre `apps/web/node_modules` (dossier local de jonctions, sans `.vite`).
- **Jest** : `--selectProjects api` avale les chemins, utiliser `--runTestsByPath` avec des chemins relatifs à `packages/api` ; `__tests__/setup.ts` remplace `DATABASE_URL` par `TEST_DATABASE_URL` ; un test qui lit `process.env` doit l'isoler (`AI_PROVIDER=fake` exporté sur le poste faisait échouer un test) ; deux fichiers de test sans `import` ni `export` partagent la portée globale (`TS2451` en CI seulement) : ajouter `export {}`.
- `npm run i18n:extract -w @immotopia/web` est un script de **migration** qui réécrit des sources (`CopilotRoot.tsx`) : ajouter les clés web à la main. Celui de l'API déplace en `*.orphans.json` au moins 14 clés non littérales (dont les deux « pack Patrimoine ») : les remettre à la main.
- Fichiers à fins de ligne CRLF : un remplacement de chaîne multi-lignes échoue en silence, utiliser des expressions avec `\s`. Le classeur `.xlsx` se modifie avec `openpyxl` (étendre la référence du tableau), jamais avec `exceljs` ; en cas de conflit binaire, prendre une version et réappliquer les lignes.
- Le hook `validate-bash.sh` refuse une commande qui mêle `git push` et le mot `main` (par exemple `gh pr create --base main`) : deux appels séparés.
- Recette : les instances jetables se montent avec des variables en ligne (pas de `.env`) sur une base PostgreSQL de conteneur dédiée ; `BACKEND_URL` doit suivre le port de l'API, sinon le paiement simulé redirige vers le port 8001. Le contrôle de permissions de l'environnement refuse à un agent de lire la base ou d'ouvrir un lien à jeton : ne pas chercher à le contourner.
- **Poste à nettoyer** : conteneur Docker `immotopia-pilote-pg` (PostgreSQL 16 jetable, port 55440, une dizaine de bases `immo_*`) ; serveurs de recette de #52 éventuellement encore actifs (web 3311, API 8811) ; le serveur de développement du checkout principal (3002) ne répondait plus en fin de session (non arrêté par le Pilote).
