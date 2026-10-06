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
## Pilote — lots 040 (contrôle du stock) et 041 (inventaire par WhatsApp) — 2026-10-05

**État :** **fusionné dans `main`** le 2026-10-05, à la demande de l'utilisateur :

- bkourouma/immotopia#114 (lot 040), commit de fusion `73616da3` ;
- bkourouma/immotopia#115 (lot 041, redirigée vers `main` après la #114), commit de fusion `757771e8`.

CI verte sur les deux. **Rien n'est déployé** : le checkout du serveur (`/home/deployer/immotopia-saas`) a été avancé en avance rapide de `24ea2062` à `757771e8` (arbre propre), mais `deploy.sh staging` n'a pas été lancé (refusé par la protection automatique de l'outil) ; staging et production tournent sur leurs anciennes images. Le prochain `deploy.sh`, staging ou production, construira `757771e8`. Les branches distantes `feat/controle-stock` et `feat/inventaire-whatsapp` existent encore, sans suppression automatique à la fusion. Les worktrees `controle-stock` et `inventaire-whatsapp` sont aussi encore présents ; le second fait tourner l'instance de recette.

**Décisions de l'utilisateur :**

- **Lot 040, D1 à D5.**
  - Tout est inclus dans les packs standard.
  - On parle d'« écart à justifier » ou de « disparition non expliquée », jamais de « vol ».
  - Livrés : sprints A et B, et le gabarit mobilier des états des lieux.
  - Pas de sanction automatique, pas de géolocalisation, pas de SMS.
- **Lot 041, W-D1 à W-D7.**
  - Le comptage WhatsApp remplit un inventaire normal, validé au bureau par une autre personne.
  - Aveugle strict : le bot ne montre ni stock attendu ni écart, et ne demande aucun motif.
  - D2 est conservé.
  - Passerelle Meta Cloud API.
  - Seul le rôle « Chef de chantier » s'inscrit. Il ne porte que `STOCK_COUNT`, sans `STOCK_VIEW`.
  - Option payante `EXT_INVENTAIRE_WHATSAPP` : 25 000 FCFA HT par mois et par bloc de 500 photos.

**Fait (2026-10-05) :**

- Intégration 041 :
  - pont vers le lot 040 réduit à des réexports ;
  - test de bout en bout sur base réelle ;
  - pastilles dans l'écran Inventaire ;
  - registres, assistant et export d'agence ;
  - comptes de recette `chef-promoteur@` et `chef-integre@` ;
  - traductions en et ar ;
  - `DEPLOIEMENT.md` (mise en service Meta) et wiki (906 lignes).
- Relecture de sécurité de l'intégration : un constat moyen, corrigé dans `0a47428d`. Le catalogue de l'assistant proposait `remove-photo` ; tout segment qui commence par delete, remove, destroy ou purge est désormais destructeur.
- Recette navigateur sur une instance dédiée (base `immotopia_recette_wa`, API 8810, web 3410) :
  - lot 040 : 9 scénarios réussis, 9 partiels, 1 non joué, 6 anomalies ;
  - lot 041 : 15 réussis sur 20, 2 anomalies ;
  - correctifs `c34e87ef` (reporté sur `feat/controle-stock` en `6298a1e9`) et `6c509137` ;
  - re-test : 9 corrections sur 9 confirmées.

**Reste à faire :**

- **rec040-01**, chantier transverse non fait. Un magasinier qui saisit l'URL d'une page financière voit une erreur générique au lieu d'un refus. Le web ne connaît pas les permissions, et `DataView` ne reçoit qu'un texte. Deux pistes :
  - exposer les permissions au web ;
  - faire passer l'erreur 403 jusqu'aux blocs d'erreur des 37 pages financières.
- Cosmétique : sous « Cette alerte est introuvable. », l'écran ajoute « Rien à afficher pour le moment. ».
- R8.3, non vérifié : la file « À traiter » de l'Accueil ne prend que 4 alertes par source, WARNING d'abord. L'alerte `FIELD_COUNT_CLOSED` sans écart (INFO) peut ne pas y figurer.
- Après fusion et déploiement :
  - reseeder les comptes de test du staging (`./infra/scripts/seed-pack-tests.sh staging`) ;
  - couper les menus hors stock des rôles Magasinier et Chef de chantier ;
  - mise en service Meta et choix de la vision (Gemini ou OpenRouter et sa clé), par le fondateur.
- Nettoyage :
  - conteneur `immotopia-stock-test`, avec les bases `immotopia_recette_wa`, `immotopia_wa_iso` et autres ;
  - worktree `controle-stock-meubles` : retirer ses jonctions avec `rmdir` AVANT `git worktree remove`.

**Pièges :**

- Recette locale :
  - lanceur sans `.env` dans le scratchpad de la session (`rec-wa/rec-wa.cjs`). `DOTENV_CONFIG_PATH` pointe vers un fichier vide et les secrets sont générés ;
  - entrées `rec-wa-api` et `rec-wa-web` ajoutées en local dans `.claude/launch.json`, fichier suivi par git : ne pas les commiter ;
  - seed : rbac, gabarits, puis super-admin AVANT `seed-pack-test-tenants`, qui l'exige. `OPENROUTER_API_KEY` vide est refusé par `env.ts` : ne pas poser la variable.
- Un filtre Jest `whatsapp` correspond au nom du worktree `inventaire-whatsapp` et lance toute la suite.
- `npm run lint` de l'API est rouge pour une erreur préexistante (`platform-audit-csv.ts:70`). Les 4 tests `ai.write-plan` « miroir du front » n'échouent que sous Windows (CRLF).
- L'extraction des traductions de l'API rend orphelines à chaque passage 32 clés préexistantes : les remettre depuis une sauvegarde.
- `Space` d'Ant Design 6 donne aux enfants d'un fragment une clé par position. Un bloc qui change de place est remonté et perd son état (rec040-03) : lui donner une `key` fixe.
- Ne jamais lancer Jest et Vitest en même temps.

---

## Branche `feat/seed-3ans-complet` — 2026-10-06

**État :** code prêt, PR ouverte (fusion à l'utilisateur). **Rien n'est déployé ni seedé sur app.immotopia.cloud** (chaque action serveur exige un « oui »). Dernier commit : voir `git log` de la branche.

**Fait :** les 6 agences « Test — Pack … · 3 ans » ne laissent plus d'écran vide. Après rejeu du seed d'origine sur une base jetable, 91 tables à `tenant_id` étaient vides dans les 5 types d'agence et chaque agence n'avait qu'un membre. Un fichier d'accroche par module complète maintenant l'historique (liste et ordre : `pack-history/index.ts`, détail : `DEPLOIEMENT.md` § « Profil 3 ans complet ») : équipe, CRM et ventes, locatif, patrimoine des biens propres, syndic, promoteur (stock, caisse, CRM, ventes), patrimoine, communication, finance, facturation plateforme, avec de vrais fichiers (`seed-files.ts`). Deux vagues d'agents, deux recettes API (un testeur par pack, GET seuls) : écrans vides, hypothèses de rendement en pourcentages au lieu de fractions, quotes-parts de lots fausses, comptes de trésorerie négatifs, quittances et campagnes manquantes corrigés. Vérifié : seed complet de zéro en 55 min, code 0 ; 3 tables seulement restent vides, sans écran (`communications`, `communication_preferences`, et `lot_tenant_assignments`, qui n'a pas de `tenant_id`) ; 2e et 3e passages en 6 min, code 0, le 3e identique au 2e (le 1er rattrape ~90 lignes sur les biens créés par un bloc tardif) ; aucun compte de trésorerie négatif, balances équilibrées ; types et ESLint propres sur `pack-history/`. `infra/scripts/seed-pack-tests.sh` donne désormais le volume des fichiers à l'utilisateur `node` de l'API.

**Reste à faire (après fusion, un « oui » par action serveur) :** `git pull`, `./infra/scripts/deploy.sh staging`, `./infra/scripts/seed-pack-tests.sh staging` (idempotent : crée ou complète les 12 agences sans purge ; ~1 h la première fois). Non éprouvé : le seed dans l'image `migrate` du staging (chemins `UPLOADS_DIR`, droits du volume), le rendu des écrans dans un navigateur (recette faite à l'API seulement).

**Pièges :**

- Les modèles DOCX (`document_templates`) et les documents générés des baux dépendent de `assets/`, absent des images Docker (voir « Non résolus » de `DEPLOIEMENT.md`) : sur le staging, « Générer un contrat » et le téléchargement des quittances du jeu de démonstration ne marchent pas, et aucun modèle n'est créé. À corriger dans une tâche à part avant toute démonstration de génération de documents.
- Les comptes ajoutés (équipe, portails propriétaire, locataire, copropriétaire, titulaire) ont le mot de passe de test PUBLIC : staging seulement.
- Aucune campagne newsletter en statut SCHEDULED (le job d'envoi du staging l'enverrait vraiment). Le seed coupe SMTP et SMS avant tout import.
- Pour le seul pack SYNDIC, une fiche bâtiment (`Property` IMMEUBLE, `COPRO-xxxx`) par copropriété porte les tickets de maintenance ; l'Opérateur intégré n'en a aucune (elles polluaient listes, tableau de bord et quotas).
- Les profils « 6 mois » ne reçoivent pas ces compléments.
- Postgres local à 100 connexions quand plusieurs agents lancent des seeds en parallèle ; `DROP DATABASE` peut être refusé par le classifieur d'outils : créer une base numérotée à la place. Limiteur de l'API : 1000 requêtes par 15 min et par IP.

**Défauts de l'application constatés, non corrigés :** `property-quality-service.ts:134` (`field.name.split` alors que les gabarits portent `key` : 500 sur tout terrain) ; l'écran des pénalités (`Penalties.tsx`) lit `adjusted_amount` que l'API ne renvoie pas ; `getTimeSeries` du tableau de bord CRM génère des semaines futures et date gains et conversions par `updatedAt` ; le tableau de bord du syndic ne dérive pas « en retard » alors que la liste le fait ; `GET /syndics/mandants` et `/rental/installments?status=<invalide>` répondent 500 au lieu de 400 ; `/maintenance/admin/vendors` lit `service_providers` (`maintenance_vendors` n'est qu'un miroir) ; `listProperties` masque un bien CLIENT dont le mandat n'est plus actif ; `getPatrimoineOverview` compte les loyers de tous les baux actifs ; l'onglet abonnés d'une liste dynamique lit `newsletter_subscribers` (contourné par des lignes miroirs) ; le service de salaires crédite toujours la caisse par défaut ; la balance âgée ne lit que les baux ; `createTransfer` numérote par ordre de saisie ; `JournalType` n'a ni achats, ni ventes, ni OD ; quotas `ACTIFS` et `PHOTOS_INVENTAIRE` affichés en dépassement et essai à +5 ans (TRIALING) : voulus ou hors périmètre ; `rental_refunds`, `crm_notes`, `communications` : aucune route ni écran. Wiki non mis à jour : aucune fonctionnalité visible ajoutée (données de démonstration seulement).

---

## Branche `feat/comptes-test-packs` — 2026-10-01

**État :** code prêt, PR ouverte (fusion à l'utilisateur) ; **rien n'est déployé ni créé sur app.immotopia.cloud** : pas d'accès SSH non interactif depuis le poste (connexion fermée), et la fusion de la PR est préalable.

**Fait :** un tenant par pack de test (AGENCE, SYNDIC, PROMOTEUR, INTEGRE, PATRIMOINE_ESSENTIEL, PATRIMOINE_PRO) créé par `packages/api/prisma/seeds/seed-pack-test-tenants.ts` (vrai `provisionTenant`, administrateur à mot de passe connu, abonnement repoussé de 5 ans, idempotent) via `infra/scripts/seed-pack-tests.sh staging` (refuse `prod`) ; menu déroulant « Choisir un compte de test » sur la page de connexion (`apps/web/src/dev/DevAccountsSelect.tsx`, remplace le panneau `DevAccountsPanel`), 6 groupes de pack en tête puis les comptes historiques ; garde-fou du `Dockerfile.web` étendu au nouveau mot de passe et au domaine `packs.immotopia.test`. Vérifié : Jest 10/10, Vitest 11/11, typecheck web 0 erreur, `check-infra` vert, bundle sans identifiants quand `VITE_SHOW_DEMO_ACCOUNTS=false`.

**Reste à faire (chaque action serveur exige un « oui ») :** fusionner la PR, puis sur le serveur `git pull`, `./infra/scripts/deploy.sh staging` (reconstruit le web avec le menu), `./infra/scripts/seed-pack-tests.sh staging` (crée les 6 agences). Non éprouvé : le seed contre une vraie base, `-e ALLOW_PACK_TEST_TENANTS=1` dans `compose run`, le `RUN` du garde-fou dans un vrai `docker build`, le rendu du menu dans un navigateur.

**Pièges :** le menu et le mot de passe commun (public) n'existent que sur le staging ; le one-clic « Se connecter » du panneau a disparu (choisir le compte puis « Se connecter »). Wiki non mis à jour : outillage de staging, aucune fonctionnalité de l'application.

## Branche `docs/wiki-patrimoine` — 2026-10-02

**État :** classeur des fonctionnalités mis à jour (846 lignes), PR ouverte (fusion à l'utilisateur). `wiki:check` vert.

**Fait :** 56 lignes ajoutées et 26 annotées pour des fonctionnalités NON fusionnées (statut « À vérifier (en développement, PR n°X non fusionnée) » + notes) : PR 52/69/70/74 (Patrimoine particulier, permissions, exports), 94 (journal d'audit), 71/72/73/63/88, branche `feat/sms-lot-1` (sans PR). Patrimoine PR 91–100 déjà présent dans le classeur.

**Reste :** à chaque fusion d'une de ces PR, retirer les annotations « En développement » du classeur (binaire, ne pas fusionner : reprendre celui-ci). Ordre de fusion des PR empilées : 52, 69, 70, 74. Ouvrir ou archiver la branche SMS. Le .xlsx n'a pas été ouvert dans Excel.

## Branche `fix/test-copilot-root-instable` — 2026-09-30

**État :** terminé, PR ouverte (fusion à l'utilisateur). Test seul modifié : `apps/web/src/__tests__/copilot/copilot-root.test.tsx`.

**Cause :** dans `CopilotRoot`, l'écouteur `keydown` (Ctrl/Cmd+J) est posé par un `useEffect` (passif) qui tourne après le commit du bouton dans le DOM. `findByRole` rend la main dès la mutation du DOM, donc la touche partait parfois avant l'écouteur (`fireEvent` renvoyait `true`). Reproduit hors CI : ~3 % d'échecs sur 100 boucles, 0 sur 500 avec le correctif. Le composant n'est pas en cause (un humain ne tape pas dans cette fenêtre).

**Correctif :** le test renvoie la touche dans un `waitFor` jusqu'à ce que l'écouteur l'ait prise (`preventDefault`). Pas de délai ajouté. Vérifié : 20 exécutions du fichier sans échec, lot `--shard=4/4` vert (44 fichiers, 377 tests), typecheck web sans erreur, eslint et prettier propres.

**Piège :** tout test qui envoie un événement clavier `window` juste après `findBy*` sur un composant dont l'écouteur est posé dans un `useEffect` a la même fenêtre de course.

---

## Branche `fix/recette-packs-e2e` — 2026-09-30

**État :** terminé côté code, PR ouverte (voir la PR ; fusion à l'utilisateur). Recette de bout en bout des 6 packs (AGENCE, SYNDIC, PROMOTEUR, INTEGRE, PATRIMOINE_ESSENTIEL, PATRIMOINE_PRO) : un testeur par pack, ~100 anomalies consignées, ~30 correcteurs en parallèle. Rapport : `docs/recette/packs/RAPPORT_FINAL.md` ; index des anomalies : `docs/recette/packs/ANOMALIES.md` ; scénarios et journaux : `docs/recette/packs/SCENARIO_PACK_*.md`.

**Commits :** `fix(api)` (999559c1), `fix(web)` (278839dc), puis la documentation (recette, wiki, RUNBOOK, HANDOFF). Vérifié : typecheck web 0 erreur, API 44 erreurs (dette antérieure, base ~48), lint 0 erreur, `check:architecture` et `wiki:check` verts, Jest API (4038+ tests) et Vitest web (179 fichiers, 1704 tests) verts après correction des tests.

**À savoir au déploiement :**

- Migrations `20261005090000` à `20261006150000` (dont permissions Syndic `…130000`/`…140000`) à appliquer AVANT ou AVEC le déploiement du code ; le cache des permissions vit 5 min.
- Scripts de rattrapage (`packages/api/scripts/backfill-*.ts`) : simulation par défaut, `--apply` pour écrire, `--allow-production` en production. Jamais lancés hors bases `immotopia_rec_*`.
- Décisions métier à valider : consolidation/export patrimoine limités aux biens détenus en propre ; comptes 165/758 pour le dépôt de garantie, 411/7083 en gestion directe, 450 sans écriture d'émission d'appel ; libellé juridique de la clause de pénalité.
- Limiteur du renvoi de convocation : en mémoire, par processus.

**Reste ouvert (voir ANOMALIES.md) :** 074 (modèles de contrat de vente Promoteur) et 091 (modèles de documents Syndic), restes de traduction 067/093/097/098/100, 095 (libellé du verrou manuel), plus les anomalies « prêt au retest » jamais rejouées (008, 016, 030, 034, 058, 060, 089, 099). Les `t()` évalués à l'import de modules (~90 fichiers) ne suivent pas un changement de langue à chaud. Anciennes anomalies du bus 09-28/09-29 corrigées seulement sur la branche non fusionnée `origin/test/recette-operateur-integre`.

**Environnement de recette (hors dépôt) :** worktree `.claude/worktrees/recette-packs` (npm ci propre, sans jonctions ; ne pas le supprimer avec `--force`), 6 bases `immotopia_rec_*` (clonées de `immotopia_rec_tpl`), serveurs arrêtés. Lanceurs dans le scratchpad de la session (`rec/rec-all.cjs`, `rec-db.cjs`, `snapshot-sync.cjs`). Les bases les plus anciennes n'ont pas les migrations `…140000`/`…150000` (`rec-db.cjs migrate-all`). Ports : AGENCE web 3311 (3301 = Docker OphtaClinic).

**Pièges :** `.claude/launch.json` (entrées `rec-*`) et `docs/Compte-rendu-entretien-module-syndic.md`, `docs/ImmoTopia_Wiki_Fonctionnalites.xlsx` (racine), `docs/recette/SCENARIO_SYNDIC_MODULES_V2.md` ne sont PAS commités (travail étranger à cette branche). `preview_start` limité à 5 serveurs ; le navigateur intégré refuse les pages servies par adresse IP (utiliser `*.localhost`). `i18n:extract` API met à la poubelle les clés à variable (`t(variable)`) en `*.orphans.json` : les remettre. Un test API chargeant `config/env.ts` relit le `.env` local : mocker `dotenv/config`.

---

## Branche `feat/copilot-openrouter` — 2026-09-29

**Fait :** fournisseur LLM `openrouter` (fetch + SSE, API OpenAI-compatible) ; réglage de la plateforme en base (`PlatformAiSettings`, migration `20261004090000`) prioritaire sur les variables `AI_*` ; écran super-admin `/admin/ai-settings` (fournisseur, modèle avec recherche dans le catalogue OpenRouter, effort/repli pour Anthropic) ; routes `/api/platform/ai-settings[/models]` ; wiki mis à jour (3 lignes).

**Reste :** appel réel à OpenRouter jamais testé (clé `OPENROUTER_API_KEY` à poser dans `packages/api/.env` par l'utilisateur) ; le comportement des `tool_calls` dépend du modèle choisi ; cache du réglage de 30 s par instance ; tour de chat complet non rejoué dans le navigateur avec le faux fournisseur.

**Pièges :** `getLlmProvider()` est devenu asynchrone. `npm run i18n:extract` déplace les 2 traductions « pack Patrimoine » d'`error-middleware.ts` en orphelines (restaurées à la main dans `packages/api/src/i18n/locales/{en,ar}.json`). `prisma generate` échoue en EPERM tant que l'API tourne : l'arrêter d'abord. Le réglage local de la base a été passé sur `fake` pendant la recette ; le remettre sur `disabled` ou `openrouter` depuis l'écran.

**Poste local :** `main` avancé à `origin/main` (19 commits) le 2026-09-29, 16 migrations appliquées. Non commités : `.claude/launch.json`, `docs/Compte-rendu-entretien-module-syndic.md`, `docs/ImmoTopia_Wiki_Fonctionnalites.xlsx`, `docs/recette/SCENARIO_SYNDIC_MODULES_V2.md`. L'ancien HANDOFF local (sections « Production ») a été écrasé ; copie dans le scratchpad de la session.

---

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

## Branche `feat/immocopilot-o9nygz` — 2026-10-05

**État :** suite des recettes d'ImmoCopilot (PR ouverte, fusion à l'utilisateur). Décisions de l'utilisateur appliquées : refuser les créations imbriquées sans parent lisible, rendre déterministes les deux tests web instables, corriger deux mineurs de la recette.

**Fait :** `plan_write` refuse une création imbriquée dont le parent n'a pas de route GET (3 routes du catalogue : `…/deals/:dealId/properties/:propertyId/status/legacy`, `…/syndics/:syndicId/lots/:lotId/compte/ajustements`, `…/lots/:lotId/paiements/apercu`) ; garde-fou de test `KNOWN_UNPLANNABLE_NESTED_CREATES` ; libellés de `StatusTag` résolus au rendu (changement de langue à chaud) ; carte d'accord : ~60 champs et noms de module traduits ; `land-detail-page` et `import-patrimoine-page` rendus déterministes (saisie d'un coup, test d'import scindé en deux, plus de délai explicite de 30 s). Vérifié : tsc API/web 0 erreur, API ciblé 731 + 21, web ciblé 1108, check:architecture, wiki:check.

**Reste à faire :** liste des anciennes conversations (décision : OUI, stockage serveur) : plan écrit, migration Prisma, routes, rétention, revue de sécurité, UI en PR séparée ; même défaut `t()` au chargement du module ailleurs (`home/dashboard-viz.ts`, tables de statuts maintenance/portails/finance : à confirmer) ; ajouter `GET …/syndics/:syndicId/lots/:lotId` ou classer `paiements/apercu` en lecture ; rejouer en navigateur les correctifs de désactivation (auto-désactivation, dernier admin) et le nom de fichier PNG accentué dans un vrai Chrome ; vrai micro (à la charge de l'utilisateur) ; `npm run test:isolation`.

**Pièges :** `npx prisma generate` après tout `git merge main` qui change le schéma (sinon ~300 erreurs tsc et 9 suites en échec) ; `git checkout --theirs` pendant une fusion = version de main ; les modifs d'un agent non indexées avant `git commit` ne sont pas dans le commit (réindexer) ; `npm run ai:catalog` après tout changement de routes ; le hook bloque une commande combinant `git fetch origin main` et un push ; test d'import patrimoine : le sous-test (1 bis) porte le parcours complet.

## Branche `feat/menus-coupes-par-agence` — 2026-10-05

**État :** PR #112 ouverte vers `main` (fusion à l'utilisateur), worktree `.claude/worktrees/menus-agence`, correction automatique de la CI active. Rien de déployé.

**Fait :** décision utilisateur du 2026-10-05 « défaut + surcharge par agence » (les lots 040/041 coupent une fois, pour toutes les agences, les menus hors stock des rôles Magasinier et Chef de chantier). `role_menu_access.tenant_id` : NULL = défaut de toutes les agences pour un rôle d'agence/portail, périmètre plateforme pour un rôle PLATFORM ; agence = surcharge. Résolution par (rôle, menu) : agence > défaut > rien. Migration `20261010100000_role_menu_access_par_agence` : colonne, FK en cascade, unicités (dont index partiel NULL), sans copie : les décisions existantes deviennent le défaut. PUT sans `tenantId` = défaut (rôle d'agence) ou plateforme ; avec = surcharge (interdit pour PLATFORM) ; `{}` avec `tenantId` = « Revenir au défaut ». Écran Menus : choix « Toutes les agences (défaut) » ou une agence, tags « Hérite du défaut » / « Réglage propre à l'agence », bouton « Revenir au défaut ». DEPLOIEMENT.md (lots 040/041) et classeur à jour.

**Vérifié :** Jest 89 tests ciblés, Vitest 292 (admin, navigation), typecheck web 0 / API 1 préexistante (`archiver`), `wiki:check`. Recette navigateur faite le 2026-10-04 sur la version « strictement par agence » (non rejouée sur la version défaut + surcharge).

**Reste :** rejouer la recette navigateur sur la version défaut + surcharge ; après fusion, déployer le staging puis appliquer les étapes 040/041 (couper les menus hors stock des rôles stock avec « Toutes les agences (défaut) »).

**Pièges :** une sauvegarde au niveau d'une agence écrit sa carte complète et fige ses valeurs jusqu'à « Revenir au défaut ». Modifier le défaut touche toutes les agences sans réglage propre (alerte à l'écran). `npm run i18n:extract` réécrit 30 catalogues en retard sur `main` : ajouter ses clés à la main. Le test « Importer mon patrimoine » dépasse parfois 30 s en CI (passe seul). L'instance démo n'a pas sa base migrée (service `postgresql-x64-18` arrêté). Staging : `SUBSCRIPTION_ENFORCEMENT=enforce` depuis le 2026-10-03 (sauvegarde `immotopia-saas.env.avant-enforce-20261003`), coupures TENANT_ADMIN levées le même jour (sauvegarde `/home/deployer/role_menu_access_tenant_admin_avant_20261003.csv`).

---

## Branche `integration/multi-actifs` — 2026-10-02

**État :** grappe « multi-actifs patrimoine » assemblée depuis `origin/main` (86da95c6) : PR #52, #67, #74, #69, #70 fusionnées dans cet ordre (une fusion `--no-ff` par PR), poussée. Pas de PR ouverte (le Pilote décide).

**Vérifié :** typecheck API et web 0 erreur ; Jest API `__tests__/unit` 317 suites / 4679 tests passés, `__tests__/api` 74 suites / 1546 tests passés ; Vitest web 2385/2386 (seul échec : `copilot-root` Ctrl+J, instable connu, passe seul) ; `check:architecture` vert ; `wiki:check` vert (841 lignes) ; `npx prisma migrate deploy` de zéro sur base jetable vierge : toutes les migrations passent, `migrate diff` base vers schéma vide. Lint : 1 erreur préexistante de `main` (`lib/audit/platform-audit-csv.ts`, espace insécable), non touchée.

**Non vérifié :** `npm run test:isolation` (pas de `DATABASE_URL_TEST` dans ce worktree) ; recette navigateur.

**À trancher :** deux ADR numérotés 005 (`environnements-staging-production` et `patrimoine-multi-actifs`) ; la navigation d'un espace PARTICULIER et la liste blanche `particulier-routes.ts` n'incluent pas les lots patrimoine de `main` (trésorerie, assurances, foncier, import, accès tiers) ; ces routes restent sous `PROPERTIES_*` et sont ajoutées à la liste blanche du test `routes-inventory` (permissions personnelles de la PR #69).

**Pièges :** `PropertyHolding.propertyId` et `PropertyLoan.propertyId` deviennent nullables (actifs non immobiliers) : le code de `main` qui les lit (accès tiers, plan de trésorerie) a été typé en conséquence ; l'inscription de la PR #52 garde la personnalisation des e-mails de `main` (nom, langue) et ses événements `logAuthEvent`.

---

## Branche `claude/elegant-pasteur-f0vpti` — 2026-10-01

**État :** phases 0 et 1 du journal d'audit à deux niveaux livrées et poussées (`4050054`) ; phase 2 (niveau agence) **livrée** : backend (`8d2e23b`), wiki, et page web « Journal d'activité » (`/tenant/:tenantId/activity`, entrée « Agence > Journal d'activité », 3 fichiers de tests Vitest). Aucune PR ouverte. Décision : [ADR-006](../architecture/adr/ADR-006-audit-deux-niveaux.md) ; contrat et plan : [specs/023-audit-deux-niveaux/spec.md](../../specs/023-audit-deux-niveaux/spec.md) (§7 et §8).

**Fait (phase 2, backend) :** `GET /api/tenants/:tenantId/audit` (`routes/tenant-audit-routes.ts`, contrôleur, schéma Zod strict) ; lecteur unique `services/audit-read-service.ts` (agence et `visibility = TENANT` posées côté serveur, pagination par curseur, personnel plateforme sans identité/IP) ; permission `TENANT_AUDIT_VIEW` (seed `audit-permissions-seed.ts`, migration `20261007100000`, administrateur d'agence et super-admin seulement) ; `AUDIT_VIEWED` tracé à la première page ; route classée `CORE` pour le garde d'abonnement ; enrichissement de libellés borné à l'agence et rendu tolérant (UUID invalides, échec non bloquant) ; wiki : 1 ligne ajoutée, 1 mise à jour, miroir régénéré (711 lignes).

**Vérifié :** typecheck API 0 erreur ; Jest API complet 294 suites passées, 0 test en échec ; `npm run test:isolation` sur Postgres 16 réel : 52/52, dont 8 tests du journal, et 4 d'entre eux échouent quand on retire le filtre d'agence du lecteur (mutation essayée). Corrigé au passage dans les fixtures : `SYNDIC_EDIT` manquait au rôle de test, d'où deux échecs « Syndic » (403 au lieu de 404) antérieurs à cette branche.

**Phase 3 livrée (2026-10-01) :** (1) middleware d'accès `middleware/audit-access-middleware.ts` (`ACCESS_DENIED`, `TENANT_ACCESS_DENIED` sans agence et réservé à la plateforme, `DOCUMENT_DOWNLOADED`, `DATA_EXPORTED`, observés sur la réponse, anti-inondation) ; (2) authentification rattachée à une ligne par agence active (`services/audit-auth-events.ts`) ; (3) 30 actions `critical` écrites par `recordAuditEvent(tx, …)` dans la transaction de leur effet (membres/rôles, agences, abonnements, réglage IA, factures, biens, baux, dépôts, pénalités, copropriété, suppressions) ; (4) avant/après ciblé (`lib/audit/changes.ts`) sur affaires CRM, contacts, biens, baux, pénalités ; (5) migration `20261007110000` (rattrapage de `CRM_DEAL_UPDATED`/`CRM_DEAL_STAGE_CHANGED`, qui suspend le déclencheur d'immuabilité : unique exception) ; (6) libellés web des nouveaux événements. Détail et exceptions : spec 023 §6 (phase 3). Corrigé en route : bogue préexistant dans `resetMemberPassword` (le mot de passe aléatoire généré était validé par la politique et échouait environ 1 fois sur 4) ; mock de test sans `recordAuditEvent` dans `syndics.coowner-portal.test.ts`.

**Vérifié :** typecheck API et web 0 erreur ; Jest API complet 300 suites passées, 0 échec ; `test:isolation` sur Postgres 16 réel 56/56 (dont refus de droit visible de la seule agence concernée, étranger réservé à la plateforme, changement de rôle écrit sans attendre la file, téléchargement tracé) ; Vitest ciblé web, architecture et wiki verts.

**Phase 4 livrée (2026-10-01) :** console plateforme. `GET /api/admin/audit` passe au curseur (`PLATFORM_AUDIT_VIEW`, schéma strict : les anciens paramètres `page`, `action`, `resourceType`, `userId` sont refusés) ; `GET /api/admin/audit/export` (`PLATFORM_AUDIT_EXPORT` + super-admin + 5 exports/10 min) : CSV de 50 000 lignes au plus, protégé contre l'injection de formule, trace `AUDIT_EXPORTED` écrite AVANT le premier octet (sans trace, pas d'export), en-têtes `X-Export-Rows`/`X-Export-Truncated` ; lecteur séparé `services/audit-platform-read-service.ts` (aucun filtre implicite) ; migration `20261007120000` (`PLATFORM_AUDIT_VIEW` accordé à tout rôle qui avait `PLATFORM_TENANTS_VIEW`, export au super-admin seul) ; écran `/admin/audit` réécrit (filtres agence, catégorie, résultat, type d'acteur, visibilité, action, identifiant de requête, « Charger plus », « Exporter en CSV ») ; wiki : 1 ligne mise à jour, 1 ajoutée (712). **Vérifié :** typecheck API et web 0 erreur ; Jest API complet 303 suites + la suite tuée par la mémoire rejouée seule, 0 échec ; `test:isolation` 65/65 sur Postgres 16 réel (super-admin lit tout, administrateur d'agence refusé, rôle délégué consulte sans exporter, export tracé avant les données, retirer `requireSuperAdmin` de la route fait échouer un test) ; Vitest ciblé web 215 tests.

**Phase 5 livrée (2026-10-01) :** rétention, scellés, marqueurs. (1) Marqueurs anti-doublon hors d'`AuditLog` : table `notification_markers` (migration `20261007130000`, qui copie puis retire les 4 anciennes clés du journal), `lib/patrimoine/notifications.ts` et `lib/syndics/notifications.ts` migrés, les 4 clés sortent de l'enum et du catalogue ; `listInvitations` lit la colonne `roleIds`. (2) Scellés : `audit_seals` (ajout seul) + fonction SQL `audit_logs_purge` (migration `20261007140000`), `lib/audit/integrity.ts` (algorithme `sha256-merkle-v1`, valeurs de référence figées), `services/audit-integrity-service.ts` (scellement par partition jour × agence × visibilité, chaîne, vérification), `services/audit-retention-service.ts`. (3) Job `jobs/audit-maintenance-job.ts` (2 h 30 UTC : scelle, purge si `AUDIT_PURGE_ENABLED`, vérifie, journalise la tête de chaîne), enregistré dans `index.ts`. (4) `GET /api/admin/audit/integrity?from&to` (`PLATFORM_AUDIT_VIEW`, 10/10 min). (5) Nouvelles actions `AUDIT_SEALED`, `AUDIT_PURGED`, `AUDIT_INTEGRITY_FAILED` ; carte « Intégrité du journal » dans `/admin/audit`. (6) Docs : spec 023 (§7 phase 5, §8), ADR-006 (Accepté), RUNBOOK (« Journal d'audit »), SECURITY, wiki (714 lignes).

**Vérifié :** typecheck API et web 0 erreur ; Jest API complet 307 suites, 4333 tests, 0 échec ; `test:isolation` sur base vierge 65/65 puis 14/14 pour la suite d'intégrité (altération, suppression, lignes tardives, chaîne rompue, purge) ; `migrate diff` vide sur base vierge ; Vitest web admin 104 tests ; architecture et wiki verts. Les catalogues web en/ar étaient en retard sur le code : `i18n:extract` a ajouté une centaine de textes (traduits) et retiré les clés de l'ancienne console d'audit.

**Fusion de `main` (2026-10-02) :** `main` avait avancé de 31 commits (lots patrimoine). Résolu : catalogues web `common.json` fusionnés clé à clé, classeur du wiki recombiné (794 lignes, 4 lignes de cette branche rejouées sur la version de `main`), conflits de code dans `audit-types.ts`, `patrimoine/notifications.ts` et `run-isolation-tests.js`. Les marqueurs anti-doublon ajoutés par `main` (alertes d'assurance, d'entretien et de régularisation foncière, rapport propriétaire) passent aussi par `notification_markers` via le module partagé `lib/notification-markers.ts` ; le rapport propriétaire écrit la marque ET garde son événement d'audit ; la migration `20261007130000` copie leurs lignes. Les 18 nouvelles clés d'audit de `main` sont classées dans le catalogue. Vérifié après fusion : typecheck API et web 0 erreur, Jest API 354 suites (les 3 suites en échec dans la passe complète se sont révélées l'une un mock manquant, corrigé, les deux autres des délais sous charge, vertes seules), `test:isolation` 92/92 + 14/14, `migrate diff` vide sur base vierge, Vitest web admin 104, architecture et wiki verts.

**À valider par le responsable produit avant d'activer la purge :** rétention 24 mois (agence) / 60 mois (plateforme), scellement toujours actif, `AUDIT_PURGE_ENABLED=false` par défaut. Limite assumée : les scellés sont dans la même base ; ancrer la tête de chaîne hors de la base (RUNBOOK).

**Reste :** `AI_ACTION_EXECUTED` encore asynchrone (le générateur de documents prend ses propres connexions) ; événements d'authentification non câblés (Google, rafraîchissement, demande de réinitialisation, e-mail inconnu) ; ancrage externe automatique de la tête de chaîne (aujourd'hui : log à recopier à la main) ; lignes `LATE_ROWS` (arrivées après le scellé) non rescellées ; permissions du compte connecté non exposées au front.

**Pièges :**

- Le déclencheur d'immuabilité refuse tout UPDATE/DELETE sur `audit_logs` ; `TRUNCATE` reste possible. La purge passe uniquement par `audit_logs_purge` (180 jours minimum, partitions scellées) ; la migration des marqueurs est l'autre usage de `app.audit_purge`.
- Une clé d'action hors catalogue est écrite `PLATFORM_ONLY` (invisible de l'agence) avec un avertissement ; `audit-catalog.test.ts` détecte les clés littérales. Une clé ajoutée après la migration `…090000` se déclare dans `postMigrationKeys` de ce test.
- `AuditLog` reste exempt de la garde tenant : toute lecture agence passe par `getTenantAuditLogs`.
- Une route de tenant nouvelle doit être classée dans `lib/subscription/route-features.ts`, sinon avertissement « unclassified tenant route » (vu au test d'isolation).
- `npm run i18n:extract` (API) retire 11 traductions sans rapport avec cette branche ; ne pas le relancer sans les restaurer.
- Tests de la phase 5 : `__tests__/integration/audit-integrity.test.ts` (base réelle, lancé par `test:isolation` APRÈS la suite d'isolation et séparément, car il désactive un déclencheur le temps d'une altération simulée). Ses lignes sont datées de 2018 sous des identifiants d'agence aléatoires : rejouable sans nettoyage.
- Une purge ne retire jamais un scellé : vider `audit_logs` sans `audit_seals` (hors `TRUNCATE` des deux) fait signaler des lignes manquantes.
- Web : le front ne connaît pas les permissions de l'utilisateur connecté (`useAuth` ne porte que `globalRole`) : le bouton « Exporter en CSV » est montré aux seuls `SUPER_ADMIN` (l'API l'exige de toute façon) et disparaît après un 403. Un contrôle exact demanderait d'exposer les permissions dans `/auth/me`. L'ancien filtre « Type de ressource » de la console n'a pas été reconduit (l'API accepte `entityType`).
- Web : les cartes `AUDIT_*_LABELS_FR` évaluent `t()` à l'import (comme le reste d'`audit-labels.ts`) : un changement de langue à chaud ne les retraduit pas. `PropertyPatrimoineTab.test.tsx` (envoi multipart) expire parfois sous charge dans la suite complète, et passe seul.
- Dans ce conteneur : `npm ci --ignore-scripts` à la racine puis `npm rebuild bcrypt` ; `jest <fichier> --selectProjects api` (chemin AVANT l'option) ; `pkill -f jest` tue aussi le shell appelant ; Postgres 16 local à relancer (`service postgresql start`) s'il est tombé, bases d'essai `immo_audit` / `immo_iso` (utilisateur `immo`) ; deux Jest + Vitest en parallèle peuvent tuer des workers (SIGKILL, mémoire) : rejouer la suite touchée.

## Pilote — retest des 8 anomalies « prêt au retest » (packs) — 2026-10-01

**État :** retest fait, PR de documentation ouverte (index `docs/recette/packs/ANOMALIES.md`). Résultat : 8 passées (008, 016, 030, 034, 058, 060, 089, 099) ; **058** corrigée par la PR #87 (`fix/finance-totaux-balance-clients`) et rejouée dans l'interface (écran Balance clients conforme). Détail dans l'index, section « Retest du 2026-10-01 ».
**Branche :** `docs/retest-anomalies-packs` (depuis `origin/main` d10c9942)

Reste à faire :

- 058 : fusionner la PR #87 (l'API Pro de recette tourne depuis le worktree `fix-058`). BUG-2026-10-01-003 (filtre Période de la Balance clients : borne de fin exclue, solde ignorant la période) corrigé par la PR #88 (empilée sur #87, base `fix/finance-totaux-balance-clients`) et rejoué dans l'interface (passé) : à fusionner après #87. Web ET API Pro de recette tournent depuis le worktree `fix-058`. Question ouverte : la colonne « À échoir » de la Balance âgée affiche des montants supérieurs au solde (Alpha 22 750 000 pour un solde de 650 000) ; définition à confirmer. Les 3 mouvements par encaissement au relevé sont voulus (FR-011) ; DEP-289FBAB5 en double (net 0) au journal Pro reste à examiner.
- 089 : passé avec un compte jetable (`retest089.jetable@exemple.test`, mot de passe dans le scratchpad de la session) ; question produit ouverte : l'assistant d'un pack Promoteur n'annonce aucune capacité chantier/vente.
- Nouvelles : BUG-2026-10-01-001 (sélecteur de bien Performance limité à 100), -002 (valeur marchande non rafraîchie). Ressaisir les noms de biens contenant U+FFFD (données de recette, pas le code d'export).
- Écart du scénario I-01 : pas de champ honoraires dans le mandat de gestion.

Pièges :

- Le worktree `recette-packs` est en retard sur `main` (HEAD 9d351134 + fichiers non commités). Retest fait dans un worktree jetable `.claude/worktrees/retest-main` (jonctions `node_modules` ; les retirer avec `rmdir` avant tout `worktree remove`). Lanceurs recopiés dans le scratchpad de la session (`rec/`, `WT` pointé sur `retest-main`).
- Migrations appliquées sur les 6 bases `immotopia_rec_*` (jusqu'à `20261006150000`). Données de test ajoutées : agence « Retest Doublon Promoteur », biens/mandat/document de retest (Agence, Pro), valorisations de démonstration sur E2A1 (Intégré).
- Les testeurs n'ont pas les mots de passe de recette (hors dépôt) : l'un a deviné la convention, un autre a utilisé la connexion rapide super-admin. Consigner les mots de passe de test dans les scénarios.
- Les captures du navigateur intégré échouent panneau masqué : preuves par DOM et réseau.

## Pilote — clôture : tout est sur GitHub, staging à jour — 2026-10-03

**État :** `main` = `a2ff8d5c` + la PR de cette passation (documentation seule). Aucune PR de code ouverte. Le **code du staging (72214188) est identique à celui de `main`** : les commits suivants ne touchent que `HANDOFF.md` et retirent deux tests obsolètes, donc aucun redéploiement n'était nécessaire. Production non touchée.

**Fait :** ajout au dépôt de `docs/Compte-rendu-entretien-module-syndic.md` et `docs/recette/SCENARIO_SYNDIC_MODULES_V2.md`, restés non suivis depuis le 2026-09-26.

**Volontairement NON commité (poste local) :** `.claude/launch.json` du checkout principal (entrées `rec-*`/`*-oi` pointant vers des scripts du scratchpad de sessions passées) ; `docs/ImmoTopia_Wiki_Fonctionnalites.xlsx` à la racine de `docs/` (copie périmée, 847 lignes ; le classeur de référence est `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx`, 848 lignes, déjà dans `main`).

**Travail poussé sur GitHub mais NON intégré dans `main` ni sur le staging — décision de l'utilisateur :**

- `origin/test/recette-operateur-integre` (16 commits du 2026-09-29 : chantiers, décaissements, comptes dormants des propriétaires, gardes de communication, verrou paiement/dépôt, newsletters…) : fusion d'essai dans `main` = ~100 fichiers en conflit (services API, composants web, catalogues i18n, `HANDOFF.md`), dans du code de finance et de sécurité. Abandonnée sans rien résoudre. À reporter commit par commit (cherry-pick + recette), pas à fusionner d'un bloc.
- `origin/feat/sms-lot-1` (lot SMS-1 : fondations, fournisseur Orange CI, sans PR) : fonctionnalité inachevée, non intégrée.
- Branches de passation ou de nettoyage périmées (`docs/handoff-reprise-2026-09-29`, `docs/spec-fournisseur-sms`, `chore/i18n-syndic-orphelins`, `docs/wiki-fonctionnalites`, anciennes `00x-*`, `salvage/*`, `archive/*`) : rien à reprendre, à supprimer quand l'utilisateur le décide.
- Une trentaine de worktrees sous `.claude/worktrees/` sont sales ou sur des branches fusionnées (`recette-packs` à ne pas supprimer, 354 fichiers de recette hors dépôt). À nettoyer avec `rmdir` de la jonction `node_modules` AVANT `git worktree remove`.

## Pilote — intégration de toutes les PR et déploiement du staging — 2026-10-02

**État :** `main` = 72214188 (PR #103, intégration des 24 PR restantes : multi-actifs #52/#67/#69/#70/#74, syndic/baux/sécurité/web #59/#62/#63/#64/#68/#71/#72/#73/#84, finance/comptes de test/docs #60/#65/#66/#76/#86/#87/#88/#89/#90/#101). **Staging déployé en version 72214188** sur app.immotopia.cloud (111 migrations, schéma à jour, conteneurs sains, tests de fumée HTTPS et pages publiques à jeton OK, aucun conteneur voisin touché) ; les 6 agences de test par pack y sont créées (`seed-pack-tests.sh staging`). **Production NON déployée** (aucune consigne). Seule PR ouverte voulue : #75 (supprime 662 lignes de HANDOFF, périmée : à fermer).

Reste à faire :

- Validation fonctionnelle du staging par connexion (comptes `<pack>@packs.immotopia.test`, mot de passe de `prisma/seeds/pack-test-tenants.ts`) : parcours patrimoine (actifs multi-actifs, projections, trésorerie, assurances, foncier, accès partagés, import, lien de paiement), contrats de bail `-A2`, syndic, balance clients. Aucune validation par connexion n'a été faite (pas de saisie d'identifiants sur un site distant).
- Décisions ouvertes : espace particulier (navigation et liste blanche `particulier-routes.ts` sans les lots patrimoine de main) ; permissions personnelles (#69) : routes patrimoine de main laissées sous `PROPERTIES_*` ; ADR-005 en double (environnements / patrimoine-multi-actifs : renuméroter l'un) ; modèles `.docx` de bail déjà semés en base gardent l'ancien texte (#63) ; plafond de surface de l'import (500 000 m²) ; libellé « Affecté » d'un paiement échoué ; rôle lecture seule voit les boutons d'écriture.
- Production : ne pas déployer sans décision. Cycle : `backup.sh prod`, étiquette `avant-AAAAMMJJ`, `deploy.sh prod` sur le même commit que le staging (DEPLOIEMENT.md). Les migrations d'audit et de patrimoine sont à relire avant la prod.
- Lint local rouge (`no-irregular-whitespace`, `platform-audit-csv.ts:70`, BOM littéral) mais vert en CI : à corriger par `﻿`.
- `npm run test:isolation` jamais rejoué sur l'ensemble (pas de base `DATABASE_URL_TEST` sur le poste).

Pièges :

- `check-infra.sh` échoue sur le serveur (le dossier du checkout s'appelle `immotopia-saas`, son chemin apparaît dans le rendu du compose prod) : faux positif, il passe en local et en CI ; `deploy.sh` a ses propres contrôles.
- Déploiement : `ssh alliance` (port 2222), checkout `/home/deployer/immotopia-saas` : `git fetch`, `git merge --ff-only origin/main`, `nohup ./infra/scripts/deploy.sh staging > journal &` (~8 min). `pgrep -f` dans la commande ssh se trouve lui-même : lire le journal.
- Des tests web sous charge échouent par délai (import patrimoine, copilot-root Ctrl+J/Cmd+J, land-detail) : relancer les jobs échoués ; ne jamais lancer Jest/Vitest pendant un build.
- Un contrôle de permissions de la session refuse les fusions en rafale de PR non nommées ; une seule PR d'intégration (branches `integration/*`) a évité d'avoir à les fusionner une à une.

---

## Pilote — recette navigateur des vagues B et C, correctifs (PR #102) — 2026-10-02

**État :** recette jouée (B1 assurances, B2 foncier, B3 accès tiers de confiance, C4 import, C5 lien de paiement) : 17 anomalies au bus (`BUG-2026-10-02-001` à `017`). Correctifs dans la PR #102 (`fix/patrimoine-recette-bc`, dernier commit 7007e4ec, CI en cours à la rédaction) : 001 à 015 rejouées et passées ; 016 (étiquette « À valider » rognée en mobile) et 017 (paiement échoué affichait « Reste à affecter ») corrigées, à l'état « prêt au retest ». Audit sécurité du diff : rien. Fusion de #102 : à la main de l'utilisateur.

Reste à faire :

- Rejouer 016 et 017 dans le navigateur ; suivre la CI de #102 et la fusionner sur accord.
- Rôle avec `PROPERTIES_VIEW` sans `PROPERTIES_EDIT` : les boutons d'écriture restent visibles (l'API répond 403) ; il faut exposer les permissions dans le contexte d'authentification.
- Réserves cosmétiques du retest : « 245 000 000 XOF » touche le bord du tableau « Synthèse » (page publique à 375 px) ; « Dernière consultation » rognée sous la colonne Actions collante (1920 px) ; le bouton « Envoyer un lien de paiement » reste affiché sur une échéance brouillon (l'API refuse) ; la réponse de génération d'échéances renvoie DRAFT pour une échéance déjà en retard (la liste renvoie OVERDUE).
- Non joué : e-mails d'alerte quotidiens (job non déclenchable par l'interface), cas REVIEW du paiement, état « expiré » d'un accès partagé, isolation inter-agences réelle (`npm run test:isolation`), bien client sous mandat actif, arabe sur « Accès partagés ».
- Plafond de surface de l'import (500 000 m²) à valider.

Pièges :

- Recette : worktree `.claude/worktrees/rec-bc` (détaché sur le commit testé), instances Agence/Patrimoine Pro lancées par `scratchpad/rec-a/rec-all.cjs` (lancer avec `Start-Process` détaché : un shell d'arrière-plan est tué au bout de quelques minutes). `instances.cjs` pointe sur `rec-bc`.
- `npm ci --ignore-scripts` ne pose pas `lefthook` : `npm rebuild lefthook` ; Windows peut bloquer `lefthook.exe` (stratégie de contrôle d'application) tant que l'utilisateur ne l'a pas autorisé.
- Le panneau navigateur intégré est souvent masqué (pas de capture) : les testeurs passent par `chrome-devtools`.
- Instance de recette : l'inscription publique n'avait jamais pu fonctionner (confirmPassword non envoyé, corrigé dans #102) ; le super-admin du seed crée les agences jetables.

---

## Pilote — feuille de route patrimoine, vagues A, B, C (partielle) et lot F1 — 2026-10-02

**État :** fusionnés dans `main` : vague A (#91, #92, #93), vague B (B1 assurances #96, B2 foncier #95, B3 accès tiers de confiance #97), lot F1 de correctifs de recette (#98), C4 import en masse (#100), C5 lien de paiement Mobile Money (#99). Budget d'entrée web relevé de 1 Kio (226 304 -> 227 328 o gzip) sur décision explicite de l'utilisateur le 02/10 (marge actuelle 626 o). Non fusionnées : #90 (plan, cette branche), #86 (retest docs), #87 et #88 (balance clients, 058/003).

Reste à faire :

- Capacités de la vague C encore à livrer (elles attendent la fusion des PR multi-actifs #52/#67/#69/#70/#74, à décider par l'utilisateur) : vue Groupe (1), export de ratios (8), dossier bancaire + déclaration fiscale (9, 6), multi-devises (11), démembrement (5).
- Recette navigateur des vagues B, C et du lot F1 jamais rejouée (seule la vague A l'a été).
- Alléger l'entrée web de façon structurelle (routes et menus du patrimoine hors du chunk d'entrée) : le budget a été relevé deux fois en une semaine.
- Décisions ouvertes : raccourci INSURER_NOTIFIED -> SETTLED/REJECTED (B1) ; prix d'acquisition sans date et dépendance `jszip` (C4) ; traitement du checkout en REVIEW et des échéances DRAFT, mode LIVE PaySecureHub non testé (C5) ; B3 : une agence qui perd le pack PATRIMOINE peut encore lire les accès partagés ; BUG-2026-10-01-006 réclame une vraie action « marquer prêt » ; `isolation.test.ts` de B3 a 2 échecs Syndic S3 (404 au lieu de 403) non comparés à `main` ; 3 tests copilot instables (#84 non fusionnée).

Pièges :

- Après chaque fusion de `main` : `prisma generate` (client périmé = ~89 erreurs TS2339) ; `npm ci --ignore-scripts` + `npm rebuild bcrypt` dans chaque worktree à schéma modifié.
- Conflits récurrents entre lots : classeur wiki (fusion à trois voies par clé + `wiki:export`), catalogues i18n plats (fusion à trois voies), `App.tsx`, menus de navigation, `schema.prisma` (union des relations et des valeurs d'enum), `email-notification-keys.ts`, `routes-inventory.test.ts`.
- Tests API lancés en parallèle d'un build web : timeouts en cascade ; les relancer seuls.
- Retirer les jonctions `node_modules` avec `rmdir` AVANT tout `git worktree remove` (incident du 27/09). Worktrees à nettoyer : `pat-*`, `retest-main`.

---

## Pilote — feuille de route patrimoine, vague A — 2026-10-01

**État :** plan publié (PR #90) ; vague A livrée en trois PR indépendantes depuis `main` (CI non encore vue) : A1 #91 (`feat/patrimoine-projection`, spec 029), A2 #93 (`feat/patrimoine-tresorerie`, spec 030), A3 #92 (`feat/patrimoine-canaux`, spec 031). Aucune fusion faite. Plan : `docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md` (14 capacités, vagues A/B/C, specs 029 à 040 réservées).

Reste à faire :

- Fusion de #91, #92, #93 (conflits attendus : classeur wiki binaire → reprendre la version de `main` et réappliquer les lignes du lot ; A1/A2 : `schemas.ts` `createExpenseSchema`, `queries.ts`, `PropertyPatrimoineTab.tsx`, `patrimoine-types.ts`, `patrimoine-labels.ts`). Migrations : `20261007090000` (A1), `…100000` (A2), `…110000` (A3).
- Recette navigateur de la vague A (jamais rejouée) : carte « Ratios bancaires », synchronisation des hypothèses, page « Trésorerie prévisionnelle », rapport mensuel par lien (page publique `/rapport-proprietaire`), RTL arabe, mobile.
- Vague B (spec 032 sinistres/assurances, 033 suivi foncier, 034 accès tiers de confiance — dépend des liens sécurisés de #92) ; vague C après fusion des PR multi-actifs (#52/#67/#69/#70/#74) : vue Groupe, multi-devises, dossier bancaire + déclaration fiscale, import en masse, paiement par lien, démembrement.
- Décisions ouvertes : date d'exigibilité de la taxe foncière par pays ; arriérés au mois 1 du plan ; « bien en vente » ; volume d'appels au moteur fiscal (cache) ; route publique montée après CORS ; double envoi du rapport par le job ; `consentWhatsapp` à `true` par défaut en base (pas un vrai consentement) ; hypothèses des biens sous mandat en 404 ; TRI avant financement.

Pièges :

- Worktrees `.claude/worktrees/pat-{projection,tresorerie,canaux}` : `npm ci --ignore-scripts` + `prisma generate` PROPRES (schéma modifié, pas de jonction) ; `bcrypt` doit être recompilé (`npm rebuild bcrypt`), sinon `routes-inventory`/`route-features` ne démarrent pas. Disque D: presque plein (~19 Go libres).
- Outil de base jetable : `scratchpad/scratch-db.cjs create|run|drop <nom>` (bases `immotopia_dev_<nom>`, mot de passe jamais affiché).
- `i18n:extract` réécrit les fins de ligne de ~30 catalogues sans changer leur contenu et supprime des clés d'autres lots côté API : ne commiter que les catalogues au vrai diff.
- `code-reviewer` n'existe pas comme type d'agent dans cette session : relecture faite par un `general-purpose` suivant `.claude/agents/code-reviewer.md`.

---

## Pilote — environnements staging et production (PR #77, #78, #79, #81 fusionnées) — 2026-09-30

**État :** tout est fusionné dans `main` (`a48559d2`) ; le clone du serveur est au même commit. La pile de production `immotopia-prod` est en ligne sur https://clients.immotopia.cloud (HTTPS, base migrée et amorcée, premier super-admin créé par le propriétaire, **e-mail SMTP et connexion Google actifs**, RCCM et compte contribuable posés), sauvegarde nocturne planifiée. Le staging est redéployé sur le même commit. La production n'est pas utilisée pour l'instant.
**Dernier commit :** `a48559d2` (fusion de #81)

Fait :

- Décision (ADR-005) : `app.immotopia.cloud` = staging (pile historique
  `immotopia-saas`, données de test, inchangée), `clients.immotopia.cloud` =
  production (nouvelle pile `immotopia-prod`, à vide), même serveur. Aucune
  migration de données.
- `infra/` paramétré par environnement : `infra/environments/{staging,prod}.conf`,
  compose sans valeur par défaut (`STACK_NAME`, ports, volumes...),
  `deploy.sh|make-env.sh|set-google-oauth.sh|backup.sh|bootstrap.sh <staging|prod>`
  (environnement obligatoire, jamais de défaut, variables héritées du shell
  ignorées), vhost `clients.immotopia.cloud`, `check-infra.sh` + job CI `infra`.
- Garde-fous de `deploy.sh prod` : git prouvé (arbre propre, HEAD dans
  `origin/main`, revérifiés avant build et migration), un seul déploiement à la
  fois, fichier d'environnement cohérent (clés critiques non dupliquées, dernière
  occurrence lue comme Compose), secrets distincts du staging, simulateur interdit,
  sauvegarde de moins de 24 h avant de migrer une base existante.
- Amorçage d'une base vierge : `bootstrap.sh` lance dans l'image `migrate` le seed
  RBAC (65 permissions, 5 rôles ; état vide/incomplet/complet), les 12 gabarits de
  biens et le nouveau `prisma/seeds/create-platform-super-admin.ts` (mot de passe
  par stdin, création seule, refuse ce que la connexion modifierait). Sans cela :
  aucun rôle, 403 partout, création d'agence en erreur. Les seeds de développement
  (`create-super-admin`, `seed-quick-login-users`, `seed-comprehensive-data`,
  `seed-crm-data`, `seed-tenant-members`, `seed-users`) refusent `NODE_ENV=production`.
- Sauvegardes : `backup.sh` (dump + documents vérifiés, rotation, rclone optionnel)
  et `restore-check.sh` (conteneur jetable sans réseau, volume supprimé avec lui).
- Docs : `docs/workflows/DEPLOIEMENT.md` (procédure pas à pas, éprouvé / non
  éprouvé), RUNBOOK, SECURITY, ADR-003 (note) et ADR-005, tables d'`AGENTS.md` et
  `CLAUDE.md`.
- Audit de sécurité (security-auditor) : 0 bloquant ; les 5 points importants et la
  plupart des mineurs sont corrigés (mot de passe altéré par la connexion, gardes
  fail-open, doublons de clés d'environnement, conteneur de restauration, RBAC
  partiel, en-têtes nginx, garde-fou de démo au build).
- Éprouvé en local (Docker Desktop, deux piles côte à côte, bases vierges, tout
  démonté ensuite) sur les scripts finaux : builds, 80 migrations, tests de fumée,
  isolation, `deploy.sh staging --no-build` complet, amorçage, connexion super-admin,
  création d'agence (201), backup + restore-check, en-têtes nginx sur une vraie image.

- Mise en service sur le serveur (accord du propriétaire, 2026-09-30) : clone du dépôt
  public, staging redéployé (`noindex` posé), `make-env.sh prod`, vhost et certificat
  `clients` (échéance 2026-12-29), `deploy.sh prod` complet, `bootstrap.sh prod`,
  cron de sauvegarde (02h15), en-têtes de sécurité vérifiés en HTTPS.
- Configuration par le propriétaire avec des scripts qui n'affichent jamais un secret :
  `set-email-smtp.sh prod --password-only --visible` (Hostinger `smtp.hostinger.com:465`,
  authentification vérifiée : `SMTP OK`, aucun message envoyé) et `set-google-oauth.sh prod`
  (client OAuth dédié à la production : `/api/auth/google` redirige bien vers Google,
  journal « Connexion Google activée »).
- `pull-backups.sh` : copie base, documents et fichier de secrets dans `backups-serveur/`
  du projet (ignoré par git, refus si la destination ne l'est pas) ; première copie faite.

Reste à faire (chaque action serveur exige un « oui » explicite) :

- **À faire par le propriétaire :** se connecter sur https://clients.immotopia.cloud avec
  le super-admin et créer la première agence (l'agent n'a pas le mot de passe) ; tester un
  vrai « Mot de passe oublié » (e-mail réel, regarder les indésirables) et une vraie
  connexion Google (`redirect_uri_mismatch` ou « application en test » : écran de
  consentement à publier « En production »).
- **Informations du propriétaire :** `PLATFORM_ISSUER_ADDRESS` et `_PHONE` (factures
  d'abonnement) ; PaySecureHub en `LIVE` ; stockage distant chiffré (rclone,
  `BACKUP_RCLONE_REMOTE` dans la crontab) : **la copie du poste n'est qu'un complément** ;
  chiffrer le disque du poste.
- **Nettoyage avec accord :** copies `immotopia-prod.env.bak-*` et `.avant-*` laissées sur le
  serveur (mode 600, elles contiennent les secrets).
- Tâches séparées lancées : écriture sous `/app/assets` impossible dans l'image de l'API
  (baux et quittances DOCX, import de gabarits, absents des sauvegardes) : **ne pas
  promettre ces documents à un client avant correction** ; test instable
  `copilot-root.test.tsx` (Ctrl+J / Cmd+J), tombé deux fois en CI sur des PR sans lien avec le front.
- Points ouverts (DEPLOIEMENT.md) : Postgres de la prod publié sur 127.0.0.1 sans usage,
  images de base non épinglées, `TENANT_GUARD_MODE` et `SUBSCRIPTION_ENFORCEMENT` livrés en
  `warn`, staging public avec panneau de démo, `seed-demo-*` non gardés, géographie CI et
  fiscalité `A_VALIDER`, activation de l'e-mail = vérification d'adresse exigée à la connexion.
- Non éprouvé : restauration réelle d'une sauvegarde, retour arrière par étiquette d'image,
  rclone, mode `LIVE` de PaySecureHub, rotation locale de `pull-backups.sh`.

Pièges et décisions :

- Un `STACK_NAME` ou un port hérité du shell est ignoré par les scripts
  (`IMMOTOPIA_ALLOW_OVERRIDE=1` seulement pour des essais locaux, refusé pour la
  prod dans `deploy.sh` et `bootstrap.sh`).
- La connexion nettoie le mot de passe avant de comparer (`sanitizeString` : trim,
  retrait de `<` `>`, `javascript:`, `onxxx=`) : le seed du super-admin refuse ces
  mots de passe. Le test `bootstrap-admin-input.test.ts` exécute le vrai middleware.
- Le hook lint-staged reformate les `.ts` indexés : `seed-crm-data.ts` a pris 231
  lignes de prettier dans le commit des gardes de seeds (sans effet de comportement).
- Sous Git Bash : `MSYS_NO_PATHCONV=1` (sinon `-w /repo/...` est converti en chemin
  Windows) ; `chmod 600` sans effet sur NTFS (le contrôle de mode refuse : substitut
  de `stat` dans un dossier hors dépôt) ; un `BACKUP_DIR` en `C:/...` fait lire `tar`
  comme un hôte distant : chemins POSIX. Docker Desktop peut s'arrêter en cours de
  build (relancer l'application).
- Les builds Docker locaux échouent parfois en `EIDLETIMEOUT`/`ECONNRESET` sur npmjs
  (réseau) : relancer, les couches sont en cache ; construire les deux images en
  séquence, pas en parallèle.
- Une image web est propre à un environnement (`VITE_*` figés au build) : on promeut
  un commit, jamais une image.
- L'empreinte des voisins de `deploy.sh` compare nom, identifiant et date de
  démarrage, pas la durée d'exécution (faux positif corrigé).
- Wiki des fonctionnalités : non mis à jour, aucune fonctionnalité visible de
  l'application (outillage d'exploitation seulement).

---

## Branche `claude/lucid-bell-0pzfvc` — 2026-09-29

**État :** en cours — PR brouillon [#52](https://github.com/bkourouma/immotopia/pull/52) ; lots 1 à 4 livrés (API et web), lots 5 et 6 pas commencés
**Dernier commit :** voir `git log -1` de la branche

Fait :

- ADR-005 `patrimoine-multi-actifs` (Accepté). Marché UEMOA, XOF, cadre OHADA.
- Lot 1 (socle, `specs/023-…`) : `Asset` (10 classes), valorisations, dettes (adossées ou
  personnelles), parts détenues, valeur nette et historique, écrans « Valeur nette » et « Mes actifs ».
  Double clé : les lignes d'un actif immobilier restent sur `propertyId`, celles des autres actifs sur
  `assetId` (`lib/patrimoine/asset-scope.ts`). Dépenses et travaux restent liés au bien.
- Lot 2 (`specs/024-…`) : suggestion de valeur par classe (sans écriture), fiabilité calculée par le
  serveur, statut juridique des biens, valeur périmée par classe, part de valeur peu fiable.
- Lot 3 (`specs/025-…`) : projections sur 1 à 30 ans, trois scénarios, simulations sur copie (vente,
  achat, emprunt, remboursement anticipé, épargne mensuelle), scénarios enregistrés (100 par agence,
  audités), page « Projections ».
- Relectures qualité et sécurité des lots 1, 2 et 3 : corrections faites (aucun bloquant restant).
- Lot 4 (`specs/026-…`, espace particulier en libre-service) : type de tenant `PARTICULIER`, packs
  `PARTICULIER_GRATUIT` (10 actifs) et `PARTICULIER_PLUS` (prix et plafond provisoires), capacité `ACTIFS` ;
  `POST /api/personal-space` (idempotent, un seul espace par personne, e-mail vérifié exigé) ; garde
  `FREE_TIER_LIMIT` à la création d'actif et de bien (verrou consultatif, indépendante de
  `SUBSCRIPTION_ENFORCEMENT`) ; `GET patrimoine/usage` ; montée de palier `POST subscription/upgrade`
  (facture, paiement PaySecureHub, changement de pack seulement au règlement réconcilié) ; anti-abus
  d'inscription (limiteur par IP en base, réponse neutre) ; garde de liste blanche de routes pour un
  espace `PARTICULIER` (`lib/subscription/particulier-routes.ts`, 403 `PERSONAL_SPACE_ROUTE_FORBIDDEN`) ;
  web : « Créer mon espace », navigation réduite décidée par `tenant.type`, bandeau d'usage, carte de
  montée de palier. Relectures qualité et sécurité faites, corrections appliquées.
- Wiki des fonctionnalités à jour (742 lignes au lot 4).
- Décisions du 2026-09-29 : validation fiscale utilisateur personnelle (« indicatif, non vérifié par
  ImmoTopia ») ; palier gratuit du particulier = 10 actifs de tout type, gratuit durable, blocage à
  l'ajout au-delà, garde dédiée sans toucher `SUBSCRIPTION_ENFORCEMENT` global ; palier payant
  particulier = nouveau pack moins cher (prix provisoire à ajuster par le produit) ; mobile money
  possible via PaySecureHub.

Reste à faire :

- Lot 5 (exports PDF et Excel de la situation patrimoniale) et lot 6 (collecte des paramètres
  fiscaux par IA, validation personnelle) : pas commencés.
- Recette navigateur de bout en bout : jamais faite (les écrans sont testés par des tests
  automatiques seulement) ; le paiement mobile money réel n'est pas testable sans identifiants
  PaySecureHub de production (simulateur seulement).
- Décisions métier ouvertes : validation par un juriste local de la liste des statuts juridiques
  fonciers ; relecture juridique des conditions d'utilisation, de la conservation des données et de la
  protection des données par pays, et de la mention « indicatif, non vérifié par ImmoTopia » avant le
  lot 6 ; durée d'essai ; captcha à revoir avant l'ouverture publique.
- Décisions du 2026-09-29 (à la suite de la PR) : pack Particulier plus conservé à 2 900 FCFA HT par
  mois et 100 actifs (modifiable au catalogue) ; pas de captcha maintenant ; conservation des données,
  suppression sur demande à l'équipe (libre-service dans un lot ultérieur) ; hypothèses de projection par
  défaut conservées, affichées comme indicatives ; liste des statuts fonciers conservée, marquée à
  valider ; suppression d'un bien refusée (409) tant qu'un prêt actif y est adossé ; lot 6 : la
  responsabilité d'un calcul fondé sur un paramètre validé revient à l'utilisateur, avec mention
  explicite (à faire relire par un juriste avant l'ouverture publique) ;
  `docs/documentation payhubsecure.docx` retiré du suivi git et ajouté à `.gitignore` (il reste dans
  l'historique tant qu'il n'est pas purgé).

Pièges et décisions :

- **Budget d'entrée du web** (`npm run measure:entry`, 225 280 octets gzip, marge de 253 octets après le lot 4) :
  chaque `React.lazy` ou fichier partagé entre chunks ajouté coûte des octets sur la carte des
  dépendances du chunk d'entrée, et la marge bouge de ±20 octets avec les hashes. Les écrans du
  patrimoine sont montés sur la route `/tenant/:tenantId/patrimoine/*` (`PatrimoineHome`), pas sur des
  `React.lazy` de `App.tsx` ; pas de graphique recharts de plus. Une économie réelle a été faite :
  `antd/es/locale/fr_FR` (ESM) au lieu de `antd/locale/fr_FR` (CommonJS). Toujours remesurer avant de
  pousser un changement web. Le chunk d'entrée embarque aussi tout le moteur de formulaires d'Ant
  Design via `ConfigProvider` (`antd/es/form/context`) : gisement d'économie préexistant, non traité.
- Les mensualités de dettes ne sont pas prélevées sur la trésorerie dans les projections (pas de
  modèle de revenus) : la valeur nette augmente du capital remboursé ; l'écran le dit.
- Le moteur fiscal calcule déjà avec un paramètre `A_VALIDER` et marque le résultat non validé
  (`tax/engine.ts`, `allValidated`) ; `TaxParameter` est global, sans `tenantId` : la validation
  personnelle du lot 6 exige une portée par tenant.
- Supprimer un bien supprime ses valorisations et parts en cascade ; la suppression est refusée (409)
  tant qu'un prêt actif y est adossé (`deleteProperty`).
- Écrire un `.env` dans le dépôt est bloqué par une règle de refus : la base locale jetable se configure
  par variables d'environnement (PostgreSQL 16, bases `immotopia` et `immotopia_isolation_test`).
- Jest : chemin du fichier de test AVANT `--selectProjects`, et `--forceExit` ; ne jamais écrire
  `--forceExit` dans une commande qui contient `git` (un hook la prend pour `--force`) ;
  `routes-inventory` et `route-features` sont dans le projet `api-app`. Un test lit le code source avec
  des expressions régulières (`lot-registry.call-sites`) : le hook de commit reformate les fichiers, les
  regex doivent tolérer les retours à la ligne.
- `npm run i18n:extract` touche des fichiers hors périmètre (`CopilotRoot.tsx`, clé vide dans
  `common.json`, ordre dans `portal.json`) : les remettre à l'identique.
- Lot 4 : un `TENANT_ADMIN` d'espace `PARTICULIER` atteignait les routes d'agence tant que
  `SUBSCRIPTION_ENFORCEMENT=warn` ; le garde de type (`particulier-routes.ts`, monté avec
  `subscriptionRouteGuard`) refuse par défaut toute route hors liste blanche : une nouvelle route utile à
  un particulier doit y être ajoutée (test `particulier-routes`). `requireTenantAccess` lit maintenant
  `status` et `type` du tenant (`utils/tenant-access.ts`) et `my-memberships` renvoie `tenant.type`.
- Lot 4 : le compteur d'actifs = actifs non archivés + biens non archivés sans actif lié ; un actif lié à
  un bien déjà compté ne change pas le compteur. `isFreeSubscription` ne vaut que pour les packs
  Particulier à prix nul : une agence à prix nul est facturée comme avant.
- Lot 4 : `db:seed:catalog` sans `--missing-only` écrase le prix et le plafond ajustés par le produit
  (RUNBOOK). `ensurePropertyAsset` ne consulte le plafond que pour un bien archivé.
- Tests d'intégration (base réelle) : `npm run test:isolation -w @immotopia/api` avec
  `DATABASE_URL_TEST` ; `signup-guard.integration` échoue si `DATABASE_URL_TEST` est posé sans
  `TEST_DATABASE_URL` hors de ce lanceur ; ils sont ignorés en CI. Sous charge (agents en parallèle) des
  workers jest sont tués (SIGKILL, mémoire) : relancer la suite seule avant de conclure à une régression.
- Le test `copilot-root` (Ctrl+J) est instable sous charge en CI (course entre le rendu du bouton et le
  raccourci) : une relance suffit ; il n'est pas lié au patrimoine.

## Pilote — fusion des PR ImmoCopilot #55 et #56 — 2026-09-29

**État :** #55 et #56 fusionnées dans `main` (CI 6/6 verte avant chaque fusion) ; #52 (Patrimoine lot 1) laissée à sa session
**Dernier commit :** voir `git log -1` sur `main`

**Plan de reprise complet (décisions métier, 11 chantiers parallèles, ordre de fusion) :** [HANDOFF_PLAN_2026-09-29.md](HANDOFF_PLAN_2026-09-29.md) — rien n'a été lancé, le compte de la session est à court de crédit ; à exécuter depuis un autre compte via `/lead`, avant 16 h.

Fait :

- #55 (contrats de bail : champs des modèles DOCX) puis #56 (durcissements de l'audit
  ImmoCopilot : jeton et quittance atomiques, plafond par agence, garde « bail vu »,
  permissions GENERATE + VIEW, faux fournisseur refusé hors développement) fusionnées.
  #56 avait un conflit sur HANDOFF.md (sections des PR voisines) : les deux sections
  gardées, `main` fusionné dans la branche, CI relancée avant fusion.

Reste à faire :

- #52 `claude/lucid-bell-0pzfvc` (Patrimoine lot 1, brouillon, 192 fichiers) : la
  session « Élargir périmètre gestion patrimoine » corrige encore (web + API, non
  commité au dernier relevé) ; recette navigateur, concurrence sur les parts et rendu
  RTL non vérifiés. Ne pas fusionner avant.
- Session « Cloud - ImmoCopilot IA assistant » : bloquée sur une demande de permission
  (`send_later`) que seul l'utilisateur peut trancher.
- Baux : préavis (3 mois habitation, 6 mois commercial) à faire valider par le métier ;
  « FCFA » en dur dans les modèles ; texte « par jour de retard » à revoir. (Un second
  contrat sur le même bail est numéroté `<bail>-A2`, `-A3`… sous verrou.)
- ImmoCopilot : limiteurs de débit en mémoire par instance ; `connection_limit` à
  dimensionner ; après un échec de section exclusive le jeton est consommé (fail-closed) ;
  saturation réelle du pool non testée.

Pièges et décisions :

- HANDOFF.md est réécrit par presque chaque PR au même endroit : en cas de conflit,
  repartir de la version de `main` et y replacer sa propre section (une reprise en bloc
  du côté « ours » recopie les sections déjà fusionnées).
- Un `sed` de résolution de conflit peut laisser un intitulé en double : relire
  `grep -n '^## Branche'` avant de pousser.

## Branche `docs/scenario-syndic-exercice-complet` — 2026-09-28

**État :** prêt à relire (documentation seule)
**Dernier commit :** voir `git log` de la branche (worktree `.claude/worktrees/scenario-syndic`)

Fait :

- `docs/recette/SCENARIO_SYNDIC_ESSAI_EXERCICE_COMPLET.md` : scénario chiffré
  de bout en bout — agence `Horizon Syndic Gestion` en pack Syndic d'essai,
  configuration complète, exercice 2026 de la `Résidence Les Flamboyants`
  (8 lots, 1 000 tantièmes, 17 000 000 appelés, 16 700 000 encaissés),
  AGE, travaux, 22 factures prestataires, recouvrement, appels automatiques,
  portail, arrêté des comptes, AGO 2027 et ouverture 2027. Libellés et
  règles vérifiés dans le code de `main` `b474b89`.

Reste à faire :

- Jouer le scénario sur l'instance de démo (`npm run demo:sync`) par
  `ui-tester` ; les points marqués « consigner » sont des comportements non
  certains (carte « Lots en retard », pénalité sur le compte du lot,
  ajustement devenu avance ou non, statut de l'échéancier).

Pièges et décisions :

- La clôture d'exercice n'existe pas dans le code : le scénario la fait à la
  main (écritures OD, verrouillage, AGO) et liste les manques en N.8.
- Ordre des parties imposé par les fonds : dépenses (partie I) après le T3,
  factures du T4 (L.5) après les encaissements du T4, sinon le Fonds de
  roulement passe en négatif.

## Branche `fix/syndic-anomalies-recette` — 2026-09-28

**État :** prêt à relire — PR #47 vers `main`, recette navigateur faite (5/5)
**Dernier commit :** voir `git log -1` sur la branche (worktree `.claude/worktrees/anomalies-recette`)

Fait (5 anomalies du testeur, recette Syndic du 2026-09-28) :

- AG : date seule + heure de début obligatoire (plus de panneau date+heure
  débordant) ; `needConfirm={false}` sur les autres DatePicker showTime.
- Incidents : bouton « Modifier l'incident » (PATCH existant), statut Assigné.
- Avis d'appel : destinataire `ownerContactId ?? coownerId`, raisons
  distinctes affichées en clair, `charge_calls.notice_sent_at` (migration
  `20260928120000_charge_call_notice_sent_at`), route
  `…/executions/:runId/renvoyer-avis` avec réservation atomique.
- Budgets : transitions contrôlées, Réviser / Clôturer, réalisé et écart.
- Téléchargements : délai 120 s pour les blobs sans rejeu sur expiration,
  `download-error.ts`, images de marque réduites à 800 px avant l'envoi.
- Wiki mis à jour, i18n extrait et traduit (en/ar).

Reste à faire :

- Recette faite le 2026-09-28 sur la démo (base `immotopia_demo`, créée depuis
  `.env` avec envois neutralisés ; `.env.demo` ignoré par git). Non vu : une
  exécution neuve avec raisons par lot, compte copropriétaire, import réel
  d'image de marque. BUG-011 (jeton expiré → 403) corrigé en 401 (63a68506) ;
  BUG-012 (calendrier 25 px sous la fenêtre à 1280x700) accepté.
- Cause réelle des avis non envoyés en production : non vérifiée (pas de
  lecture de la base prod) ; le nouvel écran donne la raison.
- Déploiement : `migrate deploy` (migration additive).
- Hors lot : clôture complète d'exercice (report à nouveau, ouverture N+1).

Pièges et décisions :

- Fusion de `main` (PR #43 `feat/syndic-reprise-ecarts` incluse) : l'écran
  Programmation est désormais découpé en sous-composants
  (`components/syndics/charge-schedules/`) ; les avis y passent par
  `ChargeScheduleRunNotices` (ScheduleTable, ScheduleRunsPanel,
  `handleNoticesResent` de `useChargeSchedules`). Tableau des incidents :
  description de 240 px (retour à la ligne) pour que Statut, Prestataire et
  Actions restent visibles.
- Le client Prisma partagé par jonction a été régénéré avec `noticeSentAt`
  (additif).
- Échec connu hors sujet : `tenant-data-export.archive.test.ts` (types
  `archiver` absents), aussi sur `main`.
- Les images de marque déjà en 3000 px restent lentes à incruster : il faut
  les réimporter.

## Branche `feat/patrimoine-p3-exports` — 2026-09-28

**État :** prêt à relire — PR #45 vers `main`
(https://github.com/bkourouma/immotopia/pull/45), CI relancée après un
second `git merge origin/main`, résultat pas encore connu à l'écriture de
cette section
**Dernier commit :** `9f55032` chore: retire mon export{} redondant apres
fusion du correctif equivalent de main

Fait (lot P3 Patrimoine : exports, alertes, ACD) :

- **Exports PDF/Excel** (`lib/patrimoine/export/{data,pdf,workbook,labels}.ts`,
  `controllers/patrimoine-export-controller.ts`, routes
  `GET /tenants/:tenantId/patrimoine/export` et
  `GET /tenants/:tenantId/properties/:propertyId/patrimoine/export`,
  `PROPERTIES_VIEW`, isolation tenant, fichier en mémoire jamais servi en
  statique, borné à 500 biens — `MAX_EXPORT_PROPERTIES`) : déjà en place au
  début de cette reprise (travail non commité d'une session précédente),
  commité tel quel (`5f70ff69`) après vérification — tests déjà verts,
  aucune correction nécessaire.
- **ACD** (`PropertyDocumentType.LAND_CONCESSION`) : déjà livré avant cette
  session (schéma, libellés, i18n fr/en/ar API+web) — vérifié, rien à faire.
- **Alertes d'échéance étendues** (`lib/patrimoine/notifications.ts`,
  `jobs/document-expiry-alert-job.ts`, `types/audit-types.ts`) : ajoutées
  par cette session, en extension du job de PR #40 (fusionnée entre-temps
  dans `main`, rebasée dessus via `git merge origin/main`) — jamais dupliqué :
  - `alertExpiringLeases` : baux actifs, propriétaire résolu via
    `Property.ownerUserId`/indivision **et** `RentalLease.owner_client_id`
    (bug trouvé en relecture croisée : sans ce second chemin, un bail créé
    normalement n'a jamais de destinataire) ;
  - `alertLoanMaturity`/`alertUpcomingWorks` : emprunts actifs / travaux
    planifiés, alertent l'agence (`TENANT_ADMIN` actifs, repli
    `Tenant.contactEmail`) via un petit helper local
    `resolveAgencyAdminRecipients` (dupliqué volontairement, pas importé, de
    `jobs/subscription-usage-job.ts` — évite d'entraîner tout son graphe
    d'imports dans les tests de notifications) ;
  - anti-doublon via `AuditLog` (clé composée `id::échéance`, pas une simple
    marque par id — survit à un renouvellement/restructuration/report), au
    lieu d'une colonne `warningSentAt` dédiée : impossible d'ajouter une
    migration Prisma dans ce worktree (jonction `node_modules/.prisma`
    partagée avec le checkout principal, `prisma generate` interdit hors
    d'un worktree qui a son propre `node_modules`) ; flush immédiat après
    chaque envoi réussi (pas en fin de boucle) pour borner la fenêtre de
    doublon en cas de crash.
- Wiki : 5 lignes ajoutées (section « Parc immobilier ») — 2 exports, 3
  alertes étendues ; miroir régénéré (`npm run wiki:export`), `wiki:check`
  vert.
- Relecture croisée (`security-auditor` + revue générale, sous-agents
  `model: sonnet`) : GO sécurité (1 point mineur, corrigé — flush par
  entité) ; 2 points bloquants de correction fonctionnelle trouvés et
  corrigés (voir ci-dessus, résolution du propriétaire de bail et
  permanence de la marque anti-doublon).
- Vérifications : `typecheck` (0 nouvelle erreur, 73 préexistantes
  inchangées), `jest` ciblé (34 tests alertes/exports + suite large
  `patrimoine`/`routes-inventory`/`schema-tenant-coverage`, 2818/2818 hors 1
  échec préexistant sans rapport — `tenant-data-export.archive.test.ts`,
  typage du module `archiver`), `vitest` (`patrimoine`, 2 timeouts sous
  charge confirmés non reproductibles en isolation), `check:architecture`
  (0 violation), `wiki:check` (vert).

Reste à faire :

- Suivre la CI de la PR #45 jusqu'au vert (relancée après le second merge,
  résultat pas encore connu au moment d'écrire cette section) et corriger
  si besoin.
- Fusion par l'utilisateur (pas faite par cette session).

Pièges et décisions :

- **CI rouge sans rapport avec ce lot** : le premier passage de la PR #45 a
  échoué sur `API — typecheck, lint, test` (bloquant) avec
  `TS2300: Duplicate identifier 'Row'` entre
  `packages/api/__tests__/unit/provision-subscription-cli.test.ts` et
  `subscription-provisioning-service.test.ts` (lot abonnements, PR #39) :
  aucun des deux fichiers n'a d'`import`/`export` au sommet, donc TypeScript
  les traite comme des scripts globaux dont les `type Row` locaux entrent en
  collision dès que les deux sont compilés dans le même run ts-jest — jamais
  reproduit dans mon run local (qui ne ciblait que `patrimoine`/
  `routes-inventory`/`schema-tenant-coverage`, sans ces deux fichiers).
  Corrigé (`export {}`), **puis découvert qu'une autre session avait
  indépendamment trouvé et corrigé le même bug** en suivant la CI de la PR #41
  (`fix/securite-invitations`, commit `3770efb7`, fusionné dans `main` entre
  mes deux pushs) : après `git merge origin/main`, les deux fichiers portaient
  chacun deux `export {}` — retiré le mien, gardé celui de `main` (motif déjà
  établi ailleurs : `cash-sessions.test.ts`, `treasury*.test.ts`, `export {}`
  en fin de fichier). À surveiller : si une session future retombe sur ce
  même `TS2300`, c'est que le correctif a été perdu quelque part — ne pas le
  re-corriger sans vérifier `git log` sur ces deux fichiers d'abord.

- La branche n'avait aucun commit propre au départ de cette reprise (tout le
  travail d'export était en modifications non commitées) et était en retard
  de 2 commits sur `origin/main` (PR #40 fusionnée entre-temps) : commit de
  l'existant d'abord, puis `git merge origin/main --no-edit` — conflit
  uniquement sur le classeur xlsx et son miroir (fichiers binaires/générés),
  résolu en prenant la version `origin/main` puis en réappliquant les lignes
  du lot par-dessus (`docs/fonctionnalites/README.md`, section « Piège de
  fusion »).
- `resolveDocumentOwnerRecipients` (dans `notifications.ts`) a gagné un
  paramètre optionnel `extraTenantClientIds` pour couvrir
  `RentalLease.owner_client_id` sans dupliquer toute la logique
  indivision/CRM déjà éprouvée pour `alertExpiringDocuments`.
- Ne pas réintroduire une colonne `warningSentAt` sur `RentalLease`/
  `PropertyLoan`/`WorkProgram` sans avoir d'abord donné à ce worktree (ou à
  un nouveau worktree dédié) son propre `node_modules` (`--install`, voir
  RUNBOOK) : la jonction partagée interdit `prisma generate` ici.

---

## Branche `fix/patrimoine-suite-p0` — 2026-09-28

---

## Branche `feat/patrimoine-p4-entites-fiscalite` — 2026-09-28

---

## Branche `feat/patrimoine-p1-pack` — 2026-09-28

**État :** prêt à relire — PR #46 vers `main`, CI verte (6/6 checks sur `da6ca863`)
**Dernier commit :** `da6ca863` Merge branch 'main' into feat/patrimoine-p1-pack

Fait :

- Lot P1 repris intact depuis le disque (le coordinateur précédent avait
  tout implémenté mais jamais committé) : deux packs Patrimoine
  (Essentiel 9 900 FCFA/10 biens, Pro 29 900 FCFA/100 biens), capacité
  `BIENS_DETENUS`/`LotKind.HELD_PROPERTY`, barrière « détenu en propre »
  (`own-assets-barrier-service.ts`), tarification/facturation,
  écrans super-admin, traductions fr/en/ar, migrations
  `20261001101500`/`20261001101600`, tests (833 lignes environ). Détail
  complet dans la description de la PR #46.
- `origin/main` (PR #39, outil de provisionnement) fusionné dans la
  branche sans conflit. Le mock de `lot-registry-service` dans
  `subscription-provisioning-service.test.ts` (apporté par la #39) ne
  couvrait pas `countHeldProperties` : 23/32 tests en échec après
  fusion, corrigé (32/32 après).
- Outil de provisionnement vérifié en conditions réelles sur une base
  jetable (migrations + catalogue amorcé) : `provision --items
PATRIMOINE_ESSENTIEL:1,EXT_BIENS_10:1 --dry-run` reconnaît les
  nouveaux codes, calcule `BIENS_DETENUS 0/20` et la tarification
  attendue — l'outil lit le catalogue en base, aucune adaptation de
  code n'était nécessaire.
- Relectures `security-auditor` et générale (toutes deux lecture seule,
  `model: sonnet`) : 0 bloquant. Corrigés : 2 clés i18n API manquantes
  (`en.json`/`ar.json`, messages `OWN_ASSETS_ONLY`), wiki des
  fonctionnalités non mis à jour (fait : 2 packs + extension dans la
  feuille Légende, Pack(s) Patrimoine Essentiel/Pro ajouté aux 84
  sous-fonctionnalités RENTAL/PATRIMOINE, réserve « bloqué » sur les 2
  sous-fonctionnalités purement tiers, note dédiée), test de cumul
  Promoteur+Patrimoine absent (ajouté, `subscription.entitlements.test.ts`
  et `subscription.pricing.test.ts`).
- Vérifications : `npm run typecheck` 72 erreurs (73 sur `main`, aucune
  nouvelle) ; Jest ciblé 19 suites/335 tests verts ; `check:architecture`
  et `wiki:check` verts ; `migrate diff --exit-code` sans différence sur
  base jetable (`pg-fonds`, 55432, base `immotopia_p1_<horodatage>`,
  supprimée après usage) ; CI GitHub verte (API + 4 lots web + build).
- `origin/main` a de nouveau avancé pendant la revue (PR #41, sécurité
  des invitations) : re-fusionnée (`da6ca863`), un conflit trivial dans
  `error-middleware.ts` (les deux branches ajoutaient un code d'erreur
  en fin d'objet `ErrorCode`), résolu en gardant les deux. Revérifié
  après cette seconde fusion : 22 suites/359 tests Jest verts,
  `typecheck` stable (72), `check:architecture` et `wiki:check` verts,
  CI GitHub relancée et verte sur `da6ca863` (6/6 checks).

Reste à faire :

- Fusion de la PR #46 : à la charge de l'utilisateur.
- Plan de test manuel listé dans la description de la PR (création
  agence Patrimoine Essentiel, passage au Pro, barrière en `enforce`,
  cumul Agence/Promoteur + Patrimoine) — pas encore rejoué en interface.

Pièges et décisions :

- Un test `CreateTenantDrawer` (palier Patrimoine) échoue par timeout
  (5 s) quand tout le fichier tourne sous charge partagée (plusieurs
  Jest/Vitest en parallèle sur ce poste), mais passe (26 à 35 s) relancé
  seul ou avec tout le fichier sans contention (7/7) — même effet déjà
  documenté dans ce fichier pour le test « exclusivité de l'Intégré »
  voisin. Pas une régression P1 ; revérifier isolément avant de
  conclure à un échec sur ce fichier.
- `ws.insert_rows()` d'openpyxl ne déplace pas les plages fusionnées :
  après insertion de lignes dans la feuille « Legende Packs-Modules »,
  la fusion `A11:G11` (titre du second tableau) est restée à son ancien
  numéro de ligne au lieu de suivre son contenu déplacé — corrigé à la
  main (`unmerge_cells`/`merge_cells`) après coup. À vérifier
  systématiquement après tout `insert_rows` sur ce classeur.
- Barrière « détenu en propre » : ne bloque que mandat de gestion et
  rattachement de propriétaire tiers (indivision, bien, bail) pour un
  compte dont le SEUL module est `MODULE_PATRIMOINE`. Le mandat de
  VENTE est protégé par le même code mais n'est de toute façon pas
  atteignable par ce pack seul (fonctionnalité SALES non ouverte par
  `MODULE_PATRIMOINE`).

---

## Branche `fix/langue-menu-connexion` — 2026-09-28

**État :** prêt à relire — PR à ouvrir vers `main`
**Dernier commit :** voir `git log -1` sur la branche (commit unique du lot)

Fait (repris d'une session précédente arrêtée par une limite d'API, puis
terminé) :

- Menu latéral, intertitres de domaine et actions d'écran (FAB) : les
  constantes de module figées en français à l'import (`NAVIGATION`,
  `SECTION_LABELS`, `PORTAL_PSEUDO_ROLES`, `SCREEN_ACTIONS`) sont devenues des
  fonctions `getNavigation()`/`getSectionLabels()`/`getPortalPseudoRoles()`/
  `getScreenActions()`, recalculées à chaque appel avec un cache par langue
  pour les deux premières (même motif que `route-labels.ts:currentRouteLabels`,
  préexistant et non touché — le fil d'Ariane et les titres suivaient déjà la
  langue, seul le menu restait figé).
- Connexion : `LanguagePreferenceSync.tsx` réécrit — la préférence du compte
  prime une fois par `user.id` (pas à chaque nouvel objet `user`), et un choix
  fait en session est remonté au compte une seule fois par bascule. Un repli
  navigateur n'est jamais écrit sur le compte.
- `LanguageProvider.tsx` : garde de course `languageRequestId` (deux
  `setLanguage` qui se chevauchent, seul le dernier en date gagne) et nouveau
  drapeau `initialLanguageResolved`, exposé par le contexte — nécessaire car
  les effets d'un composant ENFANT (`LanguagePreferenceSync`) se déclenchent
  avant ceux du PROVIDER au montage : `isSwitching` ne pouvait donc pas servir
  à cette garde (racine du bug trouvé par la relecture, voir plus bas).
- `AuthContext.tsx` : `logout()` vide `LANGUAGE_STORAGE_KEY` — sans ça, un
  choix explicite de langue persisté localement par un compte fuitait vers le
  compte suivant à se connecter sur le même poste (partagé/kiosque), même sans
  préférence enregistrée pour ce second compte (trouvé par la relecture).
- Clés mortes de `syndic.json` (en/ar) : vérifié avec
  `node apps/web/scripts/i18n-migrate.mjs` (sans `--only`, sur tout le dépôt,
  après fusion d'`origin/main`) — **aucun orphelin**, dans `syndic.json` ni
  ailleurs. Confirmé indépendamment par la relecture (recherche littérale des
  clés dans le code). Les ~30 fichiers de catalogues que ce script réécrit
  quand même (mêmes clés, fin de ligne différente) ont été remis à l'identique
  du `HEAD` (`git show HEAD:<f> > <f>`, vérifié octet à octet) plutôt que
  commités sans effet.
- Trois nouveaux fichiers de test (régression) :
  `i18n/__tests__/language-provider-race.test.tsx`,
  `i18n/__tests__/language-preference-sync.test.tsx` (7 cas, dont le (g) qui
  couvre la course décrite plus haut), `__tests__/shell/localized-menu-integration.test.tsx`.
  Les `waitFor` qui attendent une vraie bascule (catalogue + locales AntD/dayjs
  réels, rien mocké) passent `{ timeout: 8000 }`, comme `__tests__/finance/*` —
  sans ça, le délai par défaut de `waitFor` (1000 ms) est flaky sous charge.
- Relecture par un agent `general-purpose` en lecture seule : 1 bloquant (la
  course `isSwitching`, corrigée), 1 à corriger (fuite de langue entre
  comptes, corrigée), suggestions mineures non retenues (commentaire
  `menu-catalog.ts` toujours au nom de l'ancienne constante `NAVIGATION` ;
  export `changeLanguage` de `i18n/index.ts` plus utilisé qu'en interne).
- Vérifications : `typecheck -w @immotopia/web` (0 erreur), `check:architecture`
  (0 violation), `wiki:check` (661 sous-fonctionnalités, à jour — pas de
  fonctionnalité visible ajoutée/retirée par ce lot). Backend :
  `typecheck -w @immotopia/api` a ses ~30 erreurs préexistantes habituelles,
  aucune dans un fichier touché par ce lot (aucun fichier backend touché).
- Suite web complète, 4 lots (`--shard=N/4 --maxWorkers=2 --minWorkers=1`) :
  tous verts. Le lot 1/4 a d'abord affiché 11 échecs par timeout dans 4
  fichiers sans rapport avec ce lot (`finance/cloture-chantier`,
  `finance/tacherons`, `finance/stock-inventaire`,
  `syndics/LotPaymentModal`) — relancés seuls, ces 4 fichiers passent
  intégralement (75/75) : timeout sous charge parallèle, pas une régression
  (piège documenté dans `.claude/rules/testing.md`).

Reste à faire :

- Ouvrir la PR (`gh pr create`, seul) et suivre la CI jusqu'au vert.

Pièges et décisions :

- `isSwitching` du `LanguageProvider` NE PEUT PAS servir de garde dans un
  composant enfant pour détecter « la détection initiale est encore en cours »
  au tout premier rendu : les effets des enfants se déclenchent avant celui du
  parent au montage, donc avant que `isSwitching` ne passe à `true` pour cette
  détection. D'où `initialLanguageResolved`, un état dédié qui part
  correctement à `false` dès le premier rendu quel que soit l'ordre des
  effets. Piège reproductible uniquement quand la session est DÉJÀ active au
  tout premier rendu (rechargement de page, cookie valide) — invisible dans
  un scénario de connexion classique où l'authentification résout après que
  la détection initiale a eu largement le temps de se stabiliser.
- Le hook `git status`/`git diff` de ce dépôt (`core.autocrlf=true`) marque
  parfois un fichier `M` sans aucun changement réel de contenu (LF sur disque
  vs CRLF attendu au checkout) : `git diff --numstat` (vide) et
  `cmp`/`git hash-object` contre `git show HEAD:<f>` tranchent en cas de
  doute, plutôt que de committer par précaution.

---

## Branche `feat/syndic-reprise-ecarts` — 2026-09-28

**État :** prêt à relire — PR #43 vers `main`, CI verte (6/6)
**Dernier commit :** `ffd2bdff` fix(api): lever la collision de type entre deux fichiers de test sans import

Fait (reprise d'une session coupée par une limite d'API — le travail était déjà
sur disque dans le worktree, non commité ; repris sans rien refaire) :

- Les 7 écarts du lot, chacun dans son propre commit : pagination des
  copropriétés (`queries.ts`, `syndic-controller.ts`, `syndic-service.ts`,
  `SyndicsList.tsx`), votants d'AG à la date (nouveau
  `packages/api/src/lib/syndics/meeting-voters.ts`, consommé côté frontend
  sans dupliquer `meeting-governance.ts`), sélecteur « Changer de
  copropriété » dans `SyndicWorkspaceLayout`, prestataires sous contrat en
  premier (nouveau `ProviderList.tsx`), seed de démo avec historique des
  fonds cohérent (nouveau `syndic-demo-fund-movements.ts`), découpage de
  `SyndicChargeSchedules.tsx` (828 → 146 lignes) en
  `components/syndics/charge-schedules/`, retouches d'affichage
  lots/incidents. Catalogues i18n et classeur wiki en commits séparés.
- Vérifications : typecheck api+web propre sur les fichiers touchés (aucune
  nouvelle erreur dans la base préexistante) ; Jest ciblé
  (`syndics.*`, `routes-inventory`, `route-features`,
  `schema-tenant-coverage`) tout vert ; Vitest syndics+navigation vert, sauf
  des délais isolés déjà connus sur ce poste (confirmés indépendants du diff
  en relançant les fichiers seuls) ; `check:architecture` et `wiki:check`
  propres (662 sous-fonctionnalités).
- Relecture `security-auditor` (pagination + votants d'AG, identifiants
  reçus dans les routes) : 0 constat. Relecture générale indépendante des 7
  items : **prêt** sur les 7.
- Fusion de `main` (en retard de plusieurs commits, dont PR #37 à #40 —
  migrations, abonnements, patrimoine) : seul le classeur wiki
  (`ImmoTopia_Wiki_Fonctionnalites.xlsx`) entrait en conflit binaire.
  Résolu en repartant du classeur de `main` et en y réappliquant les mêmes
  modifications de cellules que sur cette branche (1 ligne ajoutée, 5
  retouchées), puis en régénérant le miroir. Le mirroir doit refléter
  `endRow − startRow` lignes de données (table Excel `SousFonctionnalites`,
  `ref` **et** `autoFilter.ref` à mettre à jour tous les deux après un
  `insert_rows` openpyxl, sinon `wiki:check` sous-compte silencieusement).
- CI : un premier run a échoué sur `provision-subscription-cli.test.ts` /
  `subscription-provisioning-service.test.ts` (fusionnés depuis `main`,
  PR #39) — aucun des deux n'a d'`import`/`export` top-level, TypeScript les
  traite comme deux scripts globaux et leur `type Row` commun entre en
  collision (TS2300) dès qu'ils tournent dans le même run `jest`. Corrigé
  par un `export {}` dans chacun (commit dédié, hors périmètre du lot mais
  nécessaire pour la CI verte).

Reste à faire :

- Fusion de la PR #43 : à l'utilisateur.

Pièges et décisions :

- Un fichier de test Jest sans `import`/`export` est un script global en
  TypeScript : deux fichiers de ce type déclarant le même identifiant de
  niveau supérieur (ex. `type Row = …`, motif très répandu dans
  `packages/api/__tests__`) entrent en collision TS2300 s'ils sont compilés
  ensemble — invisible tant qu'un seul des deux tourne isolément.
- Résolution d'un conflit Git sur le classeur xlsx : ne pas prendre un
  camp entier, reconstruire par clé stable (Module, Fonctionnalité,
  Sous-fonctionnalité) — script dans le scratchpad de session
  `6d754bbb-846c-4481-9333-070145f6e577` (non conservé).

---

## Branche `feat/patrimoine-p5-portail` — 2026-09-28

**État :** prêt à fusionner — PR #42 vers `main`, 6/6 checks CI au vert (`gh pr view 42` : `mergeable: MERGEABLE`), fusion laissée à l'utilisateur
**Dernier commit :** `0728d7a` fix(tests): lever la collision de type entre deux suites d'abonnements

Reprise : le tour précédent avait tout implémenté mais s'est arrêté avant de
committer (limite d'API) — la branche était encore au niveau de PR #38, 7
commits derrière `main` (PR #39 provisionnement, #40 patrimoine-suite-p0).
Ce tour a relu (`security-auditor` + relecture générale, aucun bloquant, un
point mineur documenté ci-dessous), vérifié (`typecheck`, 7 suites Jest
ciblées = 114 tests, 5 fichiers Vitest = 57 tests, `check:architecture`,
`wiki:check`, tous verts), committé, fusionné `origin/main` (sans conflit sur
le code — seuls `HANDOFF.md`, `sous-fonctionnalites.md` et le classeur wiki se
recoupaient, résolus en conservant les deux apports), puis ouvert la PR.

Fait :

- Vue patrimoine du portail propriétaire (lot P5) : `GET /api/portal/owner/patrimoine`
  (+ `/settings`, `/properties/:propertyId`, `/properties/:propertyId/documents/:documentId/file`),
  lecture seule, biens = `req.ownerPortal.propertyIds` dans l'agence du portail,
  même 404 pour bien d'autrui / d'une autre agence / inexistant. Calculs par
  `buildPropertyYieldInput` + `lib/patrimoine/yield.ts` (aucun second moteur).
  Agrégats de la liste pondérés par la quote-part d'indivision ; détail non pondéré.
- Masquage par l'agence : modèle `OwnerPortalSettings` (migration
  `20261003150500_owner_portal_settings`, table dédiée, tout ouvert par défaut
  sans écrire), `GET|PUT /api/tenants/:tenantId/settings/owner-portal`
  (`TENANT_SETTINGS_VIEW/EDIT`), carte « Portail propriétaire » dans Paramètres
  de l'agence. Vue masquée → 404 et entrée de menu retirée ; rubrique masquée →
  clé absente ; `netNetYield` absent si les emprunts sont masqués.
- Front : `pages/OwnerPortal/Patrimoine.tsx`, `PatrimoinePropertyDetails.tsx`
  (React.lazy), menu « Mon patrimoine », traductions en/ar.
- Correctifs du portail propriétaire : bug `date-fns` (variable `format` du corps
  qui masquait la fonction → 500 sur les trois rapports) ; IDOR préexistant de
  `POST /reports/export` (`report-generator.ts` : `propertyId` du corps écrasait
  le périmètre) ; validation de `entityType`/`format`.
- Tests : `owner-portal-patrimoine` (24), `owner-portal-reports-filename` (5),
  `owner-portal-export-scope` (18), Vitest portail/menu/réglage. Wiki mis à jour
  (4 lignes ajoutées, 3 rapports repassés « Disponible », note date-fns retirée).
- Relectures (ce tour) : `security-auditor` — 0 bloquant, 1 mineur (cas
  `PropertyDocument.tenantId: null` non documenté, corrigé par une note dans
  `docs/governance/SECURITY.md` §5) ; relecture générale — 0 bloquant, 2
  remarques cosmétiques sans suite.

- Correctif hors P5 après la fusion de `origin/main` : `npm test -w @immotopia/api`
  échouait en CI (TS2300 « Duplicate identifier 'Row' » entre
  `provision-subscription-cli.test.ts` et
  `subscription-provisioning-service.test.ts`, aucun des deux n'a
  d'import/export donc TypeScript les traite en scripts globaux). Défaut
  préexistant des PR #39/#40 déjà fusionnées — vérifié avec
  `gh run list --branch main` : la CI de `main` elle-même est rouge sur ce
  point depuis la fusion de la #40, indépendamment de P5. Corrigé en
  renommant l'alias en `CliRow` dans le seul fichier CLI (`0728d7a`) ; les
  deux suites (46 tests) repassent au vert.

Reste à faire :

- Fusion de la PR #42 : décision de l'utilisateur.
- Recette navigateur du portail propriétaire sur une base migrée (non faite
  dans ce tour — CI verte et deux relectures automatisées seules avant
  fusion).
- Signalé à part (hors P5, tâche déléguée via `spawn_task` — `task_42d38dec`) :
  `main` a une CI rouge sur ce même défaut depuis la fusion de la #40 —
  `subscription-provisioning-service.test.ts` garde encore le nom `Row` non
  renommé ici (volontairement, pour ne toucher qu'un fichier dans cette PR) ;
  un futur commit sur `main` doit soit renommer aussi ce second alias, soit
  ajouter un `export {}` aux deux fichiers.
- Décision éventuelle : un bien dont la table d'indivision ne cite pas le
  propriétaire compte pour 0 % dans ses totaux (même règle que le relevé de
  gérance, `ownerSharesByProperty`).

Pièges et décisions :

- Table dédiée plutôt que colonnes sur `AgencyFinanceSettings` : réglage de
  portail, pas comptable, et P4 touche aux réglages fiscaux en parallèle.
- Les tests qui montent `owner-portal-routes` vont dans `APP_LEVEL_TESTS`
  (`jest.config.js`) : erreurs TS anciennes de `document-context-builder.ts`.
- Worktree avec son propre `npm ci` (schéma modifié), pas de jonction.
- Fusion de `origin/main` dans ce tour : les sections `fix/patrimoine-suite-p0`
  (#40) et `feat/provision-abonnements` (#39) qui vivaient ici ont été
  retirées — les deux branches sont déjà fusionnées dans `main` (règle du
  fichier : une section disparaît une fois fusionnée, l'historique reste dans
  `git log`).

---

## Branche `fix/patrimoine-suite-p0` — 2026-09-28

**État :** prêt à relire — PR #44 vers `main`, CI verte (6/6 jobs)
**Dernier commit :** `61fba4e2` (fusion de `origin/main`, PR #40 incluse) sur `c50a14ee`
(commit unique du lot)

Fait :

- Lot P4 complet (reprise après une coupure d'API du coordinateur précédent au
  moment de lancer les agents de réalisation — le plan détaillé
  (`p4-contrat.md`) et l'implémentation des trois territoires étaient déjà sur
  disque, non commités, à la reprise) : entités détentrices (SCI/holding/
  société/personne physique) avec organigramme, rattachement à un bien par
  quote-part, consolidation patrimoniale par entité ; moteur fiscal pur
  (impôt foncier + impôt sur les revenus fonciers, CI et ML) ; référentiel
  `TaxParameter` (34 paramètres 2026, tous `A_VALIDER`, sourcés CGI/DGI/loi de
  finances) ; 16 routes API ; 3 écrans + section fiscale dans la fiche bien
  avec l'avertissement « estimation indicative, à valider par un conseil
  fiscal » ; wiki (16 sous-fonctionnalités) ; i18n fr/en/ar.
- Relectures `security-auditor` et générale (lecture seule, sonnet) : 0
  bloquant. 1 correction appliquée par `dev-simple` avant le commit : les
  colonnes Bien/Occupation/Propriétaire du référentiel des paramètres
  fiscaux affichaient les codes bruts du moteur au lieu de libellés
  traduits par `t()` (`tax-labels.ts` : `propertyKindSelectorLabel` /
  `occupancySelectorLabel` / `ownerKindSelectorLabel`, gérant le sélecteur
  `ANY` → « Tous »).
- Vérifié avant et après fusion de `origin/main` (PR #40) : typecheck (0
  nouvelle erreur, base 72 préexistantes ailleurs, 0 côté web), 98 tests Jest
  unitaires du module, 8 tests API mockés, suite `isolation.test.ts` complète
  (28 tests dont 5 nouveaux sur `HoldingEntity`), tests Vitest frontend (11
  fichiers, isolés du reste de la suite pour éviter les faux-négatifs par
  contention), `prisma migrate diff --exit-code` sans écart sur une base
  PostgreSQL jetable, `wiki:check` et `check:architecture` verts. Suite
  backend complète post-fusion : 176/182 vertes (5 ignorées, 1 échec
  pré-existant hors périmètre, voir Pièges).

Reste à faire :

- Fusion par l'utilisateur.

Pièges et décisions :

- Fusion de `origin/main` (PR #40 `fix/patrimoine-suite-p0`) : conflit
  uniquement sur le classeur `.xlsx` et son miroir (binaire, un seul agent à
  la fois) — résolu en reprenant la version de `origin/main` (662 lignes,
  dont la nouvelle ligne « Alerter les propriétaires d'un document qui arrive
  à échéance ») puis en réappliquant les 16 lignes P4 par-dessus et en
  relançant `wiki:export`. Aucun autre conflit ; `lib/patrimoine/notifications.ts`
  (hors territoire P4) fusionné automatiquement par git, non retouché.
  Piège d'édition xlsx : `openpyxl` avec `sort_keys=True`/un tri Python
  générique reformate tout le fichier (diff énorme, ordre différent du tri
  français de l'outil `i18n:extract`) — ne jamais retrier les catalogues
  i18n JSON à la main, seulement modifier une valeur en place ou relancer
  `npm run i18n:extract` (idempotent, régénère l'ordre canonique).
- Deux fichiers untracked pré-existants dans ce worktree, **non liés à P4 et
  non commités par ce lot** : `packages/api/src/i18n/locales/{ar,en}.orphans.json`
  (clé orpheline « Document patrimoine introuvable », plus aucune occurrence
  dans le code source actuel). Ils font échouer localement
  `i18n-catalogs-completeness.test.ts` (CI verte car ces fichiers ne sont pas
  commités) — tâche de fond proposée séparément (`task_de0abfd6`) pour
  retrouver la nouvelle clé et reporter la traduction à la main.
- Ce poste est lent pour les tests : un test Vitest isolé peut approcher les
  40 s (timeout par défaut) sans qu'il y ait de bug — toujours relancer seul
  avant de conclure à une régression (confirmé une fois de plus sur
  `property-holding-tax-section.test.tsx` et `patrimoine.entities.routes.test.ts`).

## Pilote — lots Syndic S3 à S5, e-mail de contact, abonnements — 2026-09-27

**État :** prêt à relire ; 5 PR ouvertes, CI verte (#26/#27 relancées après le dernier correctif)
**Dernier commit :** S3 `ec3fceb`, S4 `caaa034`, S5 `5e3dd93`, e-mail `443461b`, journaux `e077830`

Fait :

- PR empilées, à fusionner dans l'ordre : #25 S3 reçus/quittances (base
  `main`) → #26 S4 appels automatiques (base S3) → #27 S5 portail
  copropriétaire (base S4 ; S5 a été empilée sur S4 pour absorber les
  conflits S4↔S5 : limiteurs de débit, routes du portail, wiki).
- Revue de code et audit de sécurité S4/S5 : 0 bloquant ; corrigés : suivi
  mensuel du portail borné aux appels du copropriétaire (moyenne), avis
  d'appel du portail borné à `ownedSince`, limiteurs sur l'exécution
  manuelle et l'avis gestionnaire. Choix produit actés : signature et cachet
  restent sur les quittances servies au portail (même PDF que l'e-mail) ;
  le relevé du portail ouvre sur le solde du compte à la date d'acquisition.
- Recette navigateur sur la démo (`5e3dd93`) : S3, S4, S5 passés ;
  BUG-2026-09-27-009 (appels non notifiés comptés nulle part) corrigé
  (`caaa034`) et retesté. Traduction « Quittance » = « Settlement receipt »
  / « إيصال تسوية » (S3 avait « Statement »).
- #28 : adresse de support `support@immotopia.cloud` (env.example, specs).
  `PLATFORM_ISSUER_EMAIL=support@immotopia.cloud` posé dans `.env`, `.env.demo`
  et l'environnement de production (sauvegarde
  `/home/deployer/immotopia-saas.env.avant-email-20260927`), API de prod
  recréée. Site vitrine : e-mail déployé (`d2a4818`, image de retour
  `immotopia-site:avant-email-20260927`), et avant cela logos/menu/formulations
  (`9b30cbd`, retour `:avant-menu-20260927`).
- #29 : `/app/logs` de l'API de prod sur un volume nommé.
- Abonnements en production (lecture seule) : l'image de prod date du
  2026-09-25, sans garde d'abonnement ; 10 migrations en attente ; aucune
  agence n'a d'abonnement ; Ivoire Résidences n'a que MODULE_AGENCY mais
  utilise 4 copropriétés et 1 chantier ; Agence Immobilière du Mali n'a aucun
  module.

Reste à faire :

- Fusion de #25 → #26 → #27, #28, #29 : décision de l'utilisateur.
- Déployer `main` en production (10 migrations, dont la réécriture des
  paiements Syndic : sauvegarde de base avant), puis attribuer un pack à
  chaque agence, observer les refus en `warn`, enfin
  `SUBSCRIPTION_ENFORCEMENT=enforce` — chaque étape avec accord.
- Découper `SyndicChargeSchedules.tsx` (631 lignes, remarque de revue).
- Pagination « 1–3 sur 3 » non traduite : tâche séparée lancée
  (`fix/pagination-i18n`).
- Hérité : `demo:sync --install` jamais relancé depuis S7 ; protection de
  branche GitHub indisponible.

Pièges et décisions :

- Recréer le conteneur API de prod efface ses journaux (#29 corrige) : les
  refus du garde d'abonnement d'avant le 2026-09-27 18:47 UTC sont perdus.
- Deux jest lourds en parallèle sur ce poste : tout tombe en délai ; lancer
  les suites une par une (`--maxWorkers=4`).
- Un jest orphelin d'une session morte verrouille le moteur Prisma du
  worktree (EPERM au `prisma generate`) : chercher les `node.exe` du worktree.
- `validate-bash.sh` prend `gh pr create --base main` chaîné après `git push`
  pour une poussée vers main : lancer `gh pr create` seul.
- Test web du suivi mensuel du portail : attendre le rendu (`findAllByText`),
  pas seulement l'appel du service ; année courante, jamais 2026 en dur.
- Déploiement du site : `npx tsc --noEmit` local passe grâce au cache
  incrémental alors que `next build` échoue ; vérifier avec
  `--incremental false` ou `npm run build`.
