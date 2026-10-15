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

## État courant (pilote) — 2026-10-13

Toutes les branches qui avaient une section ici sont fusionnées dans `main` ;
leurs sections ont été retirées (historique : `git log`). Ce qui suit est ce
qui reste vrai et ouvert.

### Dépôt et environnements

- `main` = `f80662c4` (PR #121 et #124 fusionnées le 2026-10-13). Aucune PR ouverte.
- Staging (app.immotopia.cloud) : code identique à `main`. Le serveur est sur `90de4895` ou plus récent ; depuis, seuls des tests et des docs ont changé, exclus des images par `.dockerignore`. Seed « 3 ans » passé le 2026-10-11. `/health` OK vérifié le 2026-10-13.
- Déploiements : la protection automatique de l'outil refuse aux agents toute commande SSH sur ce serveur (il héberge aussi la production). Ils sont lancés par l'utilisateur : `git fetch && git merge --ff-only origin/main && ./infra/scripts/deploy.sh staging` dans le checkout du serveur.
- Production (clients.immotopia.cloud) : n'a pas reçu les lots 040/041 ni les correctifs postérieurs. Ne pas déployer sans décision. Cycle : `backup.sh prod`, étiquette `avant-AAAAMMJJ`, `deploy.sh prod` sur le même commit que le staging ([DEPLOIEMENT.md](DEPLOIEMENT.md)). Relire avant la prod les migrations d'audit, de patrimoine et de réécriture des paiements Syndic (sauvegarde de base avant).
- Branche LOCALE non poussée `fix/recette-operateur-integre` (worktree `.claude/worktrees/port-oi`) : 9 commits absents de tout distant (correctifs locatif, CRM, propriétaires, biens, navigation, admin, invitations, plus le scénario Opérateur intégré). Décision de l'utilisateur : pousser et ouvrir une PR, ou abandonner. Distincte de `origin/test/recette-operateur-integre` (17 commits hors `main`, non fusionnée : un essai de fusion d'un bloc donnait ~100 fichiers en conflit, à reporter commit par commit).
- Autre branche non intégrée : `origin/feat/sms-lot-1` (fondations SMS, fournisseur Orange CI, sans PR). À reprendre ou archiver.
- Worktrees restants sous `.claude/worktrees/` : `port-oi`, `recette-packs` (354 fichiers de recette hors dépôt, ne pas le supprimer avec `--force`), `w4-recette`, `w5-recette` (recettes, modifications non commitées), `wiki-patrimoine` (modifications locales du classeur), `seed-3ans` et `youthful-elbakyan-3df131` (PR fusionnées : à supprimer par l'utilisateur). Tous les autres anciens worktrees ont été supprimés le 2026-10-13 ; `youthful-elbakyan-3df131` n'a plus ses jonctions `node_modules`, `seed-3ans` a son propre `node_modules`.
- Nettoyage git à décider : branches distantes déjà fusionnées (`feat/controle-stock`, `feat/inventaire-whatsapp`) et branches de passation périmées (`docs/handoff-reprise-2026-09-29`, `docs/spec-fournisseur-sms`, `chore/i18n-syndic-orphelins`, `docs/wiki-fonctionnalites`, anciennes `00x-*`, `salvage/*`, `archive/*`). `HANDOFF_PLAN_2026-09-29.md` est un plan périmé à archiver.
- Fichiers locaux volontairement non commités : `.claude/launch.json` (entrées de recette `rec-*`, `*-oi`, `rec-wa-*` vers des scripts du scratchpad ; ne pas les commiter) et `docs/ImmoTopia_Wiki_Fonctionnalites.xlsx` à la racine de `docs/` (copie périmée ; le classeur de référence est `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx`).

### Déploiement et exploitation

- `assets/` est absent des images Docker (DOCX de baux et quittances, import de gabarits, absents des sauvegardes). Sur le staging, « Générer un contrat » et le téléchargement des quittances du jeu de démonstration ne marchent pas, et `document_templates` reste vide. Ne pas promettre ces documents à un client avant correction (tâche à part ; « Non résolus » de `DEPLOIEMENT.md`).
- Points ouverts de `DEPLOIEMENT.md` : `TENANT_GUARD_MODE` en `warn` (le staging est en `SUBSCRIPTION_ENFORCEMENT=enforce` depuis le 2026-10-03, la garde tenant non) ; Postgres de la prod publié en boucle locale sans usage ; images de base non épinglées ; staging public avec panneau de démo ; scripts `seed-demo-*` non gardés ; géographie CI et fiscalité en `A_VALIDER` ; activation de l'e-mail = adresse vérifiée exigée à la connexion.
- Non éprouvé : restauration réelle d'une sauvegarde, retour arrière par étiquette d'image, rclone, mode `LIVE` de PaySecureHub, rotation locale de `pull-backups.sh`.
- Tâches du propriétaire : `PLATFORM_ISSUER_ADDRESS` et `PLATFORM_ISSUER_PHONE` (factures d'abonnement) ; PaySecureHub en `LIVE` ; stockage distant chiffré (rclone, `BACKUP_RCLONE_REMOTE` dans la crontab ; la copie du poste n'est qu'un complément) ; chiffrer le disque du poste ; supprimer sur le serveur les copies `immotopia-prod.env.bak-*` et `.avant-*` (elles contiennent des secrets) ; tester sur la prod un vrai « Mot de passe oublié » et une vraie connexion Google (écran de consentement à publier « En production »).
- Production, agence AYOU CONSULT : la première invitation administrateur a expiré le 2026-10-07 sans acceptation ; la seconde (2026-10-08) expire le 2026-10-15 à 14:33 UTC. Acceptation non revérifiée depuis le 2026-10-08 ; renvoi éventuel à décider par l'utilisateur.
- Staging, après le déploiement des lots 040/041 : couper les menus hors stock des rôles Magasinier et Chef de chantier (écran Menus, « Toutes les agences (défaut) »). Recette navigateur de l'écran Menus à rejouer sur la version « défaut + surcharge » (faite le 2026-10-04 sur l'ancienne version).
- Mise en service Meta (WhatsApp, `DEPLOIEMENT.md`) et choix de la vision (Gemini ou OpenRouter et sa clé), par le fondateur.
- Seed « 3 ans » : ouvrir les comptes `<pack>-3ans@…` dans un navigateur (par l'utilisateur ou en local : un agent ne saisit pas de mot de passe sur le staging). Le rendu des écrans n'a été recetté qu'à l'API. Les profils « 6 mois » ne reçoivent pas les compléments.
- Nettoyage local : conteneur `immotopia-stock-test` et bases `immotopia_recette_wa`, `immotopia_wa_iso`, `immotopia_rec_*`.

### Produit et décisions métier

- Signature électronique (2026-10-16) : spec `specs/044-signature-electronique/` (PR 127) ; lots S0+S1 (noyau + bail) en PR 134 (`feat/signature-noyau`) ; lots S2 (mandats de gestion et de vente), S3 (état des lieux : PDF + signature sur place dessinée) et S4 (compromis) sur `feat/signature-s2-s4`, PR empilée sur la 134. Noyau extensible par `lib/signature/sources/` (registre `SignatureDocumentSource`, un fichier par type, droits et module par type, `snapshotHash`/`isSourceIntact`/`onSealed`). Quotas par pack provisoires (Agence 20, Syndic 50, Promoteur 20, Intégré 100) + extension « bloc de 50 » non vendable (prix à fixer). Compromis : refusé avec le fournisseur interne tant que `SALE_AGREEMENT` est dans `SIGNATURE_PROVIDER_REQUIRED_KINDS` (défaut) ; à retirer seulement après avis juridique ou branchement d'un prestataire `qualified`. Reste : lot S5 (écran Signatures global, rappels), S6 (adaptateur prestataire), S7 (SMS, lot SMS-1) ; écrans catalogue/achat de l'extension (PR suivante) ; avis juridique sur la signature simple pour la vente ; relecture juridique des clauses types des mandats et du compromis. À faire avant déploiement : appliquer les 4 migrations signature (noyau, enums, durcissement, mandats) sur une base dédiée et lancer `test:isolation` (`signature.db.test.ts` jamais exécuté) ; poser le masquage du jeton dans les vhosts nginx déjà réécrits (voir DEPLOIEMENT.md) ; tester LibreOffice et l'image Docker réels (+450 à 600 Mo estimés) ; envois réels e-mail/WhatsApp ; rendu navigateur (mobile, tactile, arabe) et rendu visuel des PDF (jamais ouverts à l'écran). Pièges : noms arabes imprimés en « ? » dans les PDF (police WinAnsi) ; la clé i18n « signatures électroniques ce mois-ci » (tableau dans subscription-denial-notice.ts) repart en orphelin à chaque `i18n:extract` ; le hook de commit refuse `no-control-regex` (prettier déplace le commentaire de désactivation : utiliser `lib/signature/text.ts`) ; 042 réservé au paiement mobile Syndic ; `ai.write-plan.test.ts` échoue (6 tests, fichiers IA non touchés, probablement antérieur) ; export d'agence (`tenant-data-export/storage.ts`) et seeds de gabarits globaux ne suivent pas encore les nouveaux chemins `assets`.
- Paiement mobile des copropriétaires (2026-10-15) : plan proposé en conversation (lots M0–M6, spec à créer en `specs/042-syndic-paiement-mobile/`), rien de codé, aucune branche. Décisions de l'utilisateur du 2026-10-15 : un compte marchand PaySecureHub PAR COPROPRIÉTÉ (pas celui du cabinet, aucun repli vers lui) ; appels entiers seulement (pas de montant libre) ; frais selon le réglage `feesPaidBy` de l'agence ; lien « Payer cet appel » sans connexion dans les avis et relances inclus dans la livraison (M6). Reste à valider : le compte comptable du solde PaySecureHub de la copropriété et l'écriture de reversement vers le 521. Faits d'ancrage : `OnlinePaymentCheckout` est lié en 1-1 à `RentalPayment` (inutilisable tel quel) ; `ChargePayment` n'a ni clé d'idempotence ni référence fournisseur unique ; le portail `/api/portal/copropriete` échappe au garde d'abonnement ; point d'écriture unique `recordLotPaymentTx` (`lib/syndics/charge-allocation.ts:374`).
- rec040-01 (chantier transverse, non fait) : un magasinier qui saisit l'URL d'une page financière voit une erreur générique au lieu d'un refus. Le web ignore les permissions (`useAuth` ne porte que `globalRole`) et `DataView` ne reçoit qu'un texte. Pistes : exposer les permissions dans `/auth/me`, ou faire passer le 403 jusqu'aux 37 pages financières. Même cause : boutons d'écriture visibles pour un rôle en lecture seule, bouton « Exporter en CSV » du journal d'audit réservé aux `SUPER_ADMIN`.
- Lot 041 : R8.3 non vérifié (la file « À traiter » de l'Accueil prend 4 alertes par source, l'alerte `FIELD_COUNT_CLOSED` sans écart peut manquer) ; cosmétique : « Rien à afficher pour le moment. » sous « Cette alerte est introuvable. ».
- Décisions métier à valider : consolidation et export patrimoine limités aux biens détenus en propre ; comptes 165/758 pour le dépôt de garantie, 411/7083 en gestion directe, 450 sans écriture d'émission d'appel ; libellé juridique de la clause de pénalité ; préavis de bail (3 mois habitation, 6 mois commercial), « FCFA » en dur dans les modèles, texte « par jour de retard » ; liste des statuts fonciers et relecture juridique (conditions d'utilisation, conservation des données par pays, mention « indicatif, non vérifié par ImmoTopia ») avant l'ouverture publique de l'espace particulier ; plafond de surface de l'import (500 000 m²) ; date d'exigibilité de la taxe foncière par pays.
- Anomalies de recette des packs restées ouvertes (`docs/recette/packs/ANOMALIES.md`) : 074 (modèles de contrat de vente Promoteur), 091 (modèles de documents Syndic), restes de traduction 067/093/097/098/100, 095 (libellé du verrou manuel). Questions produit : l'assistant d'un pack Promoteur n'annonce aucune capacité chantier/vente ; pas de champ honoraires dans le mandat de gestion ; colonne « À échoir » de la Balance âgée supérieure au solde (définition à confirmer) ; DEP-289FBAB5 en double au journal Pro ; sélecteur de bien Performance limité à 100 (BUG-2026-10-01-001) ; valeur marchande non rafraîchie (-002) ; noms de biens de recette avec U+FFFD à ressaisir.
- Patrimoine, vague C encore à livrer : vue Groupe, export de ratios, dossier bancaire et déclaration fiscale, multi-devises, démembrement (plan : `docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md`). Lots 5 (exports de la situation patrimoniale) et 6 (paramètres fiscaux par IA, validation personnelle, `TaxParameter` global à porter par tenant) de l'espace particulier non faits.
- Patrimoine, décisions ouvertes : espace particulier (navigation et liste blanche `particulier-routes.ts` sans les lots patrimoine récents ; routes patrimoine laissées sous `PROPERTIES_*`) ; une agence qui perd le pack PATRIMOINE peut encore lire les accès partagés ; raccourci `INSURER_NOTIFIED` vers `SETTLED/REJECTED` ; checkout en `REVIEW` et échéances `DRAFT` (lien de paiement) ; vraie action « marquer prêt » (BUG-2026-10-01-006) ; modèles `.docx` de bail déjà semés gardant l'ancien texte ; arriérés au mois 1 du plan ; `consentWhatsapp` à `true` par défaut en base (pas un vrai consentement) ; bien client sous mandat actif ; un bien hors table d'indivision compte pour 0 % dans les totaux du portail.
- Recettes patrimoine jamais jouées : e-mails d'alerte quotidiens, cas `REVIEW` du paiement, accès partagé expiré, arabe sur « Accès partagés », mobile et RTL de la vague A, paiement mobile money réel (simulateur seulement), réserves cosmétiques de la page publique à 375 px et de « Dernière consultation » à 1920 px. Plan de test manuel des packs Patrimoine (création, passage au Pro, barrière en `enforce`, cumul) jamais rejoué en interface.
- Syndic : la clôture complète d'exercice (report à nouveau, ouverture N+1) n'existe pas ; scénario `docs/recette/SCENARIO_SYNDIC_ESSAI_EXERCICE_COMPLET.md` jamais joué sur la démo. Cause réelle des avis d'appel non envoyés en prod non vérifiée. Pagination « 1–3 sur 3 » non traduite (branche `fix/pagination-i18n` fusionnée dans `main` ; rendu non revérifié dans un navigateur). Les images de marque déjà en 3000 px sont à réimporter.
- Baux : un second contrat sur le même bail est numéroté `<bail>-A2`, `-A3`… sous verrou.
- Défauts de l'application constatés par le seed « 3 ans », non corrigés : `property-quality-service.ts:134` (`field.name.split`, 500 sur tout terrain) ; `Penalties.tsx` lit `adjusted_amount` que l'API ne renvoie pas ; `getTimeSeries` du tableau de bord CRM (semaines futures, dates par `updatedAt`) ; tableau de bord du syndic sans « en retard » dérivé ; `GET /syndics/mandants` et `/rental/installments?status=<invalide>` répondent 500 au lieu de 400 ; `/maintenance/admin/vendors` lit `service_providers` ; `listProperties` masque un bien CLIENT dont le mandat n'est plus actif ; `getPatrimoineOverview` compte les loyers de tous les baux actifs ; l'onglet abonnés d'une liste dynamique lit `newsletter_subscribers` ; le service de salaires crédite toujours la caisse par défaut ; la balance âgée ne lit que les baux ; `createTransfer` numérote par ordre de saisie ; `JournalType` sans achats, ventes, OD ; quotas `ACTIFS` et `PHOTOS_INVENTAIRE` affichés en dépassement et essai à +5 ans (voulu ou hors périmètre ?) ; `rental_refunds`, `crm_notes`, `communications` sans route ni écran.

### IA (ImmoCopilot)

- Cache de prompt Anthropic (`lib/ai/providers/anthropic-provider.ts`, coupe-circuit `AI_PROMPT_CACHE=off`) jamais vérifié en réel : contrôler `cache_read_input_tokens > 0` dans le journal `debug` du staging. Le préfixe doit dépasser le minimum cacheable du modèle (512 jetons sur Opus 5.5), sinon rien n'est mis en cache, sans erreur.
- OpenRouter jamais appelé en réel avec une clé (`OPENROUTER_API_KEY` à poser dans `packages/api/.env`) ; le comportement des `tool_calls` dépend du modèle ; cache du réglage de 30 s par instance. Réglage `fake` possible dans la base locale : le remettre sur `disabled` ou `openrouter`.
- Écritures du Copilote : « Approuver et exécuter » jamais exercé sur un `PUT` de bien (on ignore s'il conserve les autres champs). Seules 11 routes ont une validation à sec (`lib/ai/gateway/write-validators.ts`) ; ~340 écritures sont `unchecked` (~15 min par route : contrôleur, schéma exporté, entrée, test de parité). Faux accept connu : bail avec `startDate: ''`. Messages Zod personnalisés encore en anglais. 6 GET sans permission connue (volontaire). Gardes de routeur à faire remonter dans `permissionsOf`. Ces changements sont sur le staging (code identique à `main`).
- Liste des anciennes conversations (décision : stockage serveur) non faite : plan écrit, migration Prisma, routes, rétention, revue de sécurité, UI en PR séparée. Même défaut `t()` évalué à l'import ailleurs (`home/dashboard-viz.ts`, tables de statuts maintenance, portails, finance ; ~90 fichiers) : un changement de langue à chaud ne les retraduit pas. Ajouter `GET …/syndics/:syndicId/lots/:lotId` ou classer `paiements/apercu` en lecture. Limiteurs de débit en mémoire par instance (ImmoCopilot, renvoi de convocation) ; `connection_limit` à dimensionner. Vrai micro et rejeu navigateur de la désactivation (dernier admin) et du PNG au nom accentué.

### Sécurité, audit et dette technique

- Journal d'audit : activer la purge (`AUDIT_PURGE_ENABLED`, `false` par défaut) seulement après validation de la rétention (24 mois agence, 60 mois plateforme). Les scellés sont dans la même base : ancrer la tête de chaîne hors base (RUNBOOK ; aujourd'hui un log à recopier). Restent : `AI_ACTION_EXECUTED` asynchrone, événements d'authentification non câblés (Google, rafraîchissement, demande de réinitialisation, e-mail inconnu), lignes `LATE_ROWS` non rescellées.
- `npm run test:isolation` jamais rejoué sur l'ensemble depuis les dernières intégrations (pas de `DATABASE_URL_TEST` sur le poste).
- Deux ADR numérotés 005 (`environnements-staging-production` et `patrimoine-multi-actifs`) : renuméroter l'un. L'ADR-006 est l'audit à deux niveaux.
- Lint API : 1 erreur locale `no-irregular-whitespace` (`src/lib/audit/platform-audit-csv.ts:70`, BOM littéral à remplacer par l'échappement) ; verte en CI. Le backend garde des erreurs TypeScript préexistantes (dont `archiver`) : ne pas en ajouter.
- Budget d'entrée du web (`npm run measure:entry`, 227 328 octets gzip, marge ~626 octets, relevé deux fois en une semaine) : alléger l'entrée de façon structurelle (routes et menus du patrimoine, moteur de formulaires d'Ant Design via `ConfigProvider`). Toujours remesurer avant de pousser du web.
- Classeur des fonctionnalités : les annotations « À vérifier (en développement, PR n°X non fusionnée) » ajoutées pour les PR aujourd'hui fusionnées sont à retirer s'il en reste.
- Test web instable, non élucidé : un échec isolé du test « gabarit » de l'import patrimoine après 22,8 s en local (piste non prouvée : premier chargement d'`exceljs`). Les 4 tests `ai.write-plan` « miroir du front » n'échouent que sous Windows (CRLF).

## Pièges durables

Worktrees et Git :

- Retirer les jonctions `node_modules` avec `rmdir` AVANT tout `git worktree remove` (incident du 2026-09-27 : un `remove` a vidé `apps/web` et `packages/api` du checkout principal). Un worktree sans jonction ni `npm ci` casse le hook de commit.
- Un worktree à schéma modifié a son propre `npm ci --ignore-scripts` puis `npm rebuild bcrypt` (sinon `routes-inventory` ne démarre pas) et `npm rebuild lefthook` (Windows peut bloquer `lefthook.exe`).
- `npx prisma generate` après tout `git merge main` qui change le schéma (sinon ~300 erreurs `tsc`). Il échoue en EPERM tant que l'API ou un Jest orphelin tourne : les arrêter d'abord (chercher les `node.exe` du worktree).
- `git checkout --theirs` pendant une fusion = version de `main`. Les modifications d'un agent non indexées avant `git commit` ne sont pas dans le commit.
- Hooks : une commande qui mêle `push` et `main`, ou `--forceExit`, ou `git fetch origin main` avec un push, est refusée : séparer `git push` et `gh pr create --base main`.
- `preview_start` lance dans le checkout principal, pas dans un worktree : lancer API et web à la main depuis le worktree. Un shell d'arrière-plan est tué au bout de quelques minutes : `Start-Process` détaché.
- `core.autocrlf=true` : `git status` marque parfois `M` sans changement réel. `git diff --numstat` ou `git hash-object` contre `git show HEAD:<f>` tranchent.
- Git Bash : `MSYS_NO_PATHCONV=1` (sinon `-w /repo/...` est converti en chemin Windows) ; `chmod 600` sans effet sur NTFS ; `BACKUP_DIR` en `C:/...` fait lire `tar` comme un hôte distant : chemins POSIX.
- Fichiers en CRLF (tests, pages) : un remplacement scripté en `\n` échoue en silence. Préférer l'outil Edit.
- Disque D: presque plein : surveiller avant un `npm ci` ou un build.

Tests :

- Ne jamais lancer Jest et Vitest en même temps, ni pendant un build. Sous charge : délais en cascade, workers tués (SIGKILL), 4 à 11 échecs sans rapport. Relancer le fichier ou le lot seul avant de conclure à une régression. Instables connus : `copilot-root` (Ctrl+J), import patrimoine, `land-detail`, `CreateTenantDrawer`, `PropertyPatrimoineTab`, stock-inventaire.
- Jest : chemin du fichier AVANT `--selectProjects` ; `routes-inventory` et `route-features` sont dans le projet `api-app`. Un filtre `whatsapp` correspond au nom du worktree `inventaire-whatsapp` et lance toute la suite.
- Vitest 2.1.9 n'a pas `--repeat` (option `{ repeats: N }` dans une copie temporaire). Le filtre `-t` ne retrouve pas un nom à apostrophe typographique passé par le shell Windows : filtrer sur un mot ASCII. Pour simuler la CI : `start "" /affinity 0x1 /wait /b cmd /c npx vitest run …` épingle sur 1 cœur.
- Un événement clavier envoyé juste après `findBy*` sur un composant dont l'écouteur est posé dans un `useEffect` a une fenêtre de course : renvoyer l'événement dans un `waitFor`. Pour un état intermédiaire (fenêtre montée puis préremplie), attendre la disparition de l'état par défaut.
- Un fichier de test sans `import`/`export` est un script global : deux fichiers qui déclarent le même `type Row` entrent en collision TS2300 dans un même run ts-jest. Mettre `export {}` ; avant de re-corriger, vérifier `git log` sur `provision-subscription-cli.test.ts` et `subscription-provisioning-service.test.ts`.
- Tests dépendant de l'horloge : ne pas écrire de dates en dur (un test a cassé toute PR à une date passée). Un test qui charge `config/env.ts` relit le `.env` local : mocker `dotenv/config`.
- `test:isolation` : base dédiée `DATABASE_URL_TEST` ; la suite `audit-integrity` tourne après, séparément (elle désactive un déclencheur) ; `signup-guard.integration` échoue si `DATABASE_URL_TEST` est posé sans `TEST_DATABASE_URL` hors du lanceur. Postgres local à 100 connexions quand plusieurs seeds tournent en parallèle ; `DROP DATABASE` peut être refusé par la protection de l'outil : créer une base numérotée.
- Un test web qui lit du texte rendu attend le rendu (`findAllByText`), pas seulement l'appel du service ; année courante, jamais 2026 en dur ; un `waitFor` qui attend une vraie bascule de langue passe `{ timeout: 8000 }`.
- `Space` d'Ant Design 6 donne aux enfants d'un fragment une clé par position : un bloc qui change de place perd son état ; lui donner une `key` fixe.

Traductions et classeur :

- `npm run i18n:extract` : orpheline des traductions (à restaurer à la main depuis les `*.orphans.json` ou une sauvegarde : 32 clés côté API à chaque passage, dont les messages `OWN_ASSETS_ONLY` et « pack Patrimoine »), réécrit les fins de ligne de ~30 catalogues et supprime des clés d'autres lots, orphelinise les clés à variable (`t(variable)`). Ne commiter que les catalogues au vrai diff ; ne jamais retrier les JSON à la main. Ne PAS le lancer pour le périmètre ImmoCopilot. Un `*.orphans.json` non commité fait échouer `i18n-catalogs-completeness.test.ts` en local.
- Classeur `ImmoTopia_Wiki_Fonctionnalites.xlsx` (binaire) : en conflit, ne pas prendre un camp entier. Repartir de la version de `main`, réappliquer ses lignes par clé stable (Module, Fonctionnalité, Sous-fonctionnalité), puis `npm run wiki:export`. Après un `insert_rows` openpyxl : refaire les fusions de cellules et mettre à jour `ref` ET `autoFilter.ref` de la table `SousFonctionnalites`, sinon `wiki:check` sous-compte.
- `HANDOFF.md` est réécrit par presque chaque PR au même endroit : en cas de conflit, repartir de la version de `main` et y replacer sa propre section ; relire `grep -n '^## Branche'` avant de pousser (intitulés en double).

Application et données :

- Une nouvelle route de tenant se classe dans `lib/subscription/route-features.ts` (sinon avertissement « unclassified tenant route ») et passe `routes-inventory` ; après tout changement de routes : `npm run ai:catalog`. Une route utile à un espace PARTICULIER s'ajoute à `particulier-routes.ts`.
- `AuditLog` : le déclencheur d'immuabilité refuse UPDATE/DELETE ; la purge passe par `audit_logs_purge` (180 jours minimum, partitions scellées) ; une clé d'action hors catalogue est écrite `PLATFORM_ONLY` ; toute lecture agence passe par `getTenantAuditLogs`.
- Le `.env` ne s'écrit pas depuis un agent (règle de refus) : configurer une base locale jetable par variables d'environnement. `OPENROUTER_API_KEY` vide est refusé par `env.ts` : ne pas poser la variable. `db:seed:catalog` sans `--missing-only` écrase les prix et plafonds ajustés.
- La connexion nettoie le mot de passe avant de comparer (`sanitizeString`) : le seed du super-admin refuse les mots de passe contenant `<`, `>`, `javascript:`.
- Seed « 3 ans » : l'image `immotopia-saas-api-migrate` est nettoyée après un déploiement ; la reconstruire avant un nouveau seed (profil `tools`, service `migrate`, voir `DEPLOIEMENT.md`). Le mot de passe de test des comptes de pack est PUBLIC : staging seulement. Aucune campagne newsletter en statut SCHEDULED (le job du staging l'enverrait). Le seed coupe SMTP et SMS.
- Une image web est propre à un environnement (`VITE_*` figés au build) : on promeut un commit, jamais une image. Un `STACK_NAME` ou un port hérité du shell est ignoré par les scripts d'`infra/`. `check-infra.sh` échoue sur le serveur (chemin du checkout dans le rendu compose) : faux positif. Recréer le conteneur API efface ses journaux.
- Déploiement (par l'utilisateur) : `ssh alliance` (port 2222), checkout `/home/deployer/immotopia-saas`, `nohup ./infra/scripts/deploy.sh staging > journal &` (~8 min) ; lire le journal (`pgrep -f` dans la commande ssh se trouve lui-même). Les builds Docker locaux échouent parfois en `EIDLETIMEOUT` : relancer, construire les images en séquence.
- Menus par agence : une sauvegarde au niveau d'une agence écrit sa carte complète et fige ses valeurs jusqu'à « Revenir au défaut » ; modifier le défaut touche toutes les agences sans réglage propre.
- Patrimoine : les mensualités de dettes ne sont pas prélevées sur la trésorerie des projections ; supprimer un bien supprime ses valorisations et parts, refusé (409) tant qu'un prêt actif y est adossé ; `PropertyHolding.propertyId` et `PropertyLoan.propertyId` sont nullables (actifs non immobiliers).
- Recette locale : le navigateur intégré refuse les pages servies par adresse IP (utiliser `*.localhost`) et ses captures échouent panneau masqué (preuves par DOM et réseau) ; `preview_start` est limité à 5 serveurs. Les testeurs n'ont pas les mots de passe de recette : les consigner dans les scénarios.
- Ports : API 8001, web 3000 (3002 sur ce poste), démo 8800/3300 ; sur ce poste le port 3301 est pris par un autre projet (Docker).
- Les marques anti-doublon des notifications vivent dans la table `notification_markers`, jamais dans `AuditLog`.
