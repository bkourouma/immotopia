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
## Branche `feat/comptes-test-packs` — 2026-10-01

**État :** code prêt, PR ouverte (fusion à l'utilisateur) ; **rien n'est déployé ni créé sur app.immotopia.cloud** : pas d'accès SSH non interactif depuis le poste (connexion fermée), et la fusion de la PR est préalable.

**Fait :** un tenant par pack de test (AGENCE, SYNDIC, PROMOTEUR, INTEGRE, PATRIMOINE_ESSENTIEL, PATRIMOINE_PRO) créé par `packages/api/prisma/seeds/seed-pack-test-tenants.ts` (vrai `provisionTenant`, administrateur à mot de passe connu, abonnement repoussé de 5 ans, idempotent) via `infra/scripts/seed-pack-tests.sh staging` (refuse `prod`) ; menu déroulant « Choisir un compte de test » sur la page de connexion (`apps/web/src/dev/DevAccountsSelect.tsx`, remplace le panneau `DevAccountsPanel`), 6 groupes de pack en tête puis les comptes historiques ; garde-fou du `Dockerfile.web` étendu au nouveau mot de passe et au domaine `packs.immotopia.test`. Vérifié : Jest 10/10, Vitest 11/11, typecheck web 0 erreur, `check-infra` vert, bundle sans identifiants quand `VITE_SHOW_DEMO_ACCOUNTS=false`.

**Reste à faire (chaque action serveur exige un « oui ») :** fusionner la PR, puis sur le serveur `git pull`, `./infra/scripts/deploy.sh staging` (reconstruit le web avec le menu), `./infra/scripts/seed-pack-tests.sh staging` (crée les 6 agences). Non éprouvé : le seed contre une vraie base, `-e ALLOW_PACK_TEST_TENANTS=1` dans `compose run`, le `RUN` du garde-fou dans un vrai `docker build`, le rendu du menu dans un navigateur.

**Pièges :** le menu et le mot de passe commun (public) n'existent que sur le staging ; le one-clic « Se connecter » du panneau a disparu (choisir le compte puis « Se connecter »). Wiki non mis à jour : outillage de staging, aucune fonctionnalité de l'application.

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

## Pilote — fusion des PR ImmoCopilot #55 et #56 — 2026-09-29

**État :** #55 et #56 fusionnées dans `main` (CI 6/6 verte avant chaque fusion) ; #52 (Patrimoine lot 1) laissée à sa session
**Dernier commit :** voir `git log -1` sur `main`

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
- Baux : un seul contrat par bail (numéro de document = numéro du bail, index unique
  `(tenant_id, document_number)`, P2002) — correctif dans `document-generation-service.ts` ;
  préavis (3 mois habitation, 6 mois commercial) à faire valider par le métier ;
  « FCFA » en dur dans les modèles ; texte « par jour de retard » à revoir.
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
