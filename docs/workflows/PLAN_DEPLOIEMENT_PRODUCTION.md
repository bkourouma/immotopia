# Plan de déploiement en production

**Statut :** plan et checklist. Rien n'a été exécuté en production ; l'utilisateur
déploie lui-même. Aucun secret ni identifiant réel dans ce document : les
variables d'environnement sont citées par leur nom seulement.

**Rédigé le** 2026-09-29 depuis `main` au commit `6c454886` (CI verte sur ce
commit à cette date). **Périmètre :** ImmoTopia sur `app.immotopia.cloud` (pile
Compose `immotopia-saas`), de la vérification du point de départ jusqu'au passage
en `SUBSCRIPTION_ENFORCEMENT=enforce`.

Chaque commande porte une étiquette :

- **[dépôt]** lue dans un script, un workflow ou un document du dépôt (source citée) ;
- **[exécuté]** commande en lecture seule (`git`, `gh`) lancée pour rédiger ce plan,
  résultat résumé ;
- **[à confirmer]** non exécutée (serveur, base, Docker) ou déduite : à relire, ou à
  rejouer sur une copie, avant le jour J.

Toutes les heures sont en UTC (Abidjan et Bamako sont à UTC+0).

Fonctions utilisées par les blocs de commandes du serveur (reprise de la fonction
`compose` de [`deploy.sh`](../../infra/scripts/deploy.sh)) **[dépôt]** :

```bash
cd /home/deployer/immotopia-saas                     # racine du dépôt déployé
export IMMOTOPIA_ENV_FILE=/home/deployer/immotopia-saas.env
dc() { docker compose -p immotopia-saas --env-file "$IMMOTOPIA_ENV_FILE" \
         -f infra/compose/docker-compose.prod.yml "$@"; }
```

## En bref

1. **Le point de départ n'est pas prouvé.** La consigne (image du 2026-09-25) donne le
   commit de référence `31c266b1` et **21 migrations** à appliquer. Mais l'ADR-003
   (2026-09-28) décrit un déploiement de `main` le 28/09, qui ramènerait la liste à
   **6 migrations**. Lire l'état réel de la base avant toute autre action (§ 1.4).
2. Deux migrations demandent de l'attention : la réécriture des paiements Syndic
   (`20260929110000`) et la reprise des fonds (`20260930091000`, qui échoue
   volontairement si les données sont incohérentes). Les répéter sur une copie de la
   base (§ 3.5).
3. `deploy.sh` ne sauvegarde pas la base, ne gèle pas l'API et ne garde pas
   l'ancienne image. Ce plan ajoute ces trois garde-fous (§ 3 et 4).
4. Aucun seed n'est requis. `db:seed` et les seeds de démonstration ne doivent jamais
   tourner en production (§ 4.7).
5. Les packs par agence sont une décision de l'utilisateur (§ 5) : la composition
   déjà préparée pour Ivoire Résidences ne couvre pas son chantier.
6. `warn` d'abord, `enforce` seulement avec l'accord explicite de l'utilisateur (§ 6).
7. Le retour arrière après migration est une restauration de la base : il faut donc
   geler les écritures pendant la fenêtre (§ 7).
8. Point d'infrastructure à trancher avant de reconstruire le front :
   `docker-compose.prod.yml` compile `VITE_SHOW_DEMO_ACCOUNTS="true"` dans le bundle
   (§ 3.7).

## 1. Point de départ

### 1.1 Ce que dit la consigne

L'image de production date du 2026-09-25. Source : la passation du 27/09
([HANDOFF.md](HANDOFF.md), section « Pilote — lots Syndic S3 à S5 ») : « l'image de
prod date du 2026-09-25, sans garde d'abonnement ; 10 migrations en attente ;
aucune agence n'a d'abonnement », relevé en lecture seule.

### 1.2 Commit de référence retenu : `31c266b1`

`31c266b19edaca73641fd6111320c85180724e85`, fusion de la PR #8 (paiement en ligne,
lot 7) dans `main`, le 2026-09-25 à 04:18. Comment il a été déterminé :

| Indice                                                                                                                      | Source                                                                         | Ce qu'il établit                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fusions dans `main` le 25/09 : #7 à 03:36, #8 à 04:18, **#10 (abonnements par packs) à 18:43**. Aucune autre entre les deux | `TZ=UTC git log origin/main --first-parent …` **[exécuté]**                    | Une image construite depuis `main` le 25/09 entre 04:18 et 18:43 a exactement l'arbre de `31c266b1`. « Sans garde d'abonnement » place l'image avant #10                                                               |
| Comptage : `git diff --name-only 31c266b1..a964c49c -- packages/api/prisma/migrations` donne **10 dossiers**                | **[exécuté]** ; `a964c49c` = `main` au moment de la passation                  | Retrouve exactement « 10 migrations en attente ». Un départ avant #8 en donnerait 11 ou plus, un départ après #10 en donnerait 5                                                                                       |
| Migration `20260927080000_mouvements_fonds_copropriete` appliquée en production le 25/09 à 03:49                            | [ADR-003](../architecture/adr/ADR-003-migration-hors-git-fonds-copropriete.md) | La production a reçu ce jour-là un déploiement depuis un arbre qui n'était pas exactement `main` (dossier jamais commité). `31c266b1` est donc une approximation : image = `31c266b1` + code non commité sur les fonds |

**Limite.** L'image n'est pas étiquetée par un commit : `docker-compose.prod.yml` la
nomme `immotopia-saas-api:latest`. Le dépôt ne permet pas de prouver le commit exact.

### 1.3 Signaux contradictoires

- **ADR-003, daté du 28/09 à 09:05.** Il écrit « état relevé en production le
  28/09/2026 (lecture seule) », donne `syndicate_fund_movements_legacy` à 72 lignes
  (cette table n'existe qu'après la migration `20260929145000`), un
  `prisma migrate status` net « après le déploiement » et cite le « journal du
  déploiement du 28/09 ». Si c'est exact, un déploiement de `main` a eu lieu entre la
  passation du 27/09 (21:27) et le 28/09 09:05, au plus tôt après la fusion de #35
  (28/09 06:42). L'image n'est alors plus celle du 25/09.
- **La passation du 27/09 elle-même** écrit que les refus du garde d'abonnement
  d'avant le 27/09 18:47 sont perdus à la recréation du conteneur API. Cela suppose
  qu'un garde journalisait déjà des refus, ce qui ne colle pas avec « sans garde
  d'abonnement ».

Le plan suit la consigne (hypothèse A), mais **la liste des migrations du § 2 doit
être recalculée à partir de la base avant le jour J**.

### 1.4 Confirmer côté serveur (lecture seule)

**[à confirmer]** — aucune de ces commandes n'écrit ; elles n'affichent aucun secret.

```bash
# 1. Ce qui est réellement appliqué en base (même requête que deploy.sh)   [dépôt]
dc exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;"'

# 2. Ce qui reste à appliquer, et les orphelines (technique de deploy.sh)
comm -13 \
  <(dc exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"' | sort -u) \
  <(find packages/api/prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -u)
# (même commande avec `comm -23` : orphelines ; attendu : 20260927080000_mouvements_fonds_copropriete seule)

# 3. Date et contenu des images en service
docker image ls --format '{{.Repository}}:{{.Tag}}  {{.ID}}  {{.CreatedAt}}' | grep '^immotopia-saas'
docker inspect -f '{{.Name}}  créé={{.Created}}  démarré={{.State.StartedAt}}' immotopia-saas-api
docker exec immotopia-saas-api ls dist/scripts     # provision-subscription.js présent => image construite après la fusion de #39 (28/09 12:49)
docker logs immotopia-saas-api 2>&1 | grep -c 'would have refused'   # > 0 => le garde d'abonnement tourne déjà en warn

# 4. Commit posé sur le serveur
git rev-parse HEAD && git status --short
```

**Règle de décision.** La liste applicable est celle de la commande 2 (dossiers du
dépôt absents de `_prisma_migrations`). Les tableaux du § 2 servent à la
reconnaître et à en évaluer le risque. Reporter le résultat dans le journal (§ 8).

## 2. Migrations à appliquer

### 2.1 Sur `main` : 21 dossiers depuis `31c266b1`

Commande **[exécuté]** (à relancer après `git fetch`, sur le commit à déployer) :

```bash
git diff --name-only 31c266b1..origin/main -- packages/api/prisma/migrations | cut -d/ -f5 | sort -u
```

Résultat : 21 dossiers, tous ajoutés (`--name-status` : 21 × `A`, aucune migration
existante modifiée ni supprimée). Prisma les applique dans l'ordre alphabétique.

Légende : **A** additive (tables, colonnes, index neufs), défaisable à la main tant
qu'aucune donnée n'y est écrite (Prisma n'a pas de « down ») ; **E** ajoute des
valeurs d'enum PostgreSQL, non défaisable sans recréer le type ; **D** réécrit ou
recopie des données existantes, ou remplace une contrainte : retour par restauration
de sauvegarde seulement ; **X** peut échouer volontairement selon les données.

| #   | Dossier                                             | PR  | Ce qu'elle fait                                                                                                                                                                                                                                                                              | Nature                      |
| --- | --------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | `20260928090000_abonnements_packs`                  | #10 | Catalogue par packs (8 tables), colonnes d'abonnement, de facture et de module, registre des lots ; amorce le catalogue (4 packs, 3 extensions, 4 mises en route) ; `plan_key` devient facultatif ; rattrape les fins d'essai en cours et marque `RENTAL` les factures rattachées aux loyers | A + D (2 UPDATE)            |
| 2   | `20260928100000_abonnements_extensions_pack`        | #10 | Lien extension → pack ; rattache les extensions existantes (sans effet tant qu'aucun abonnement n'existe)                                                                                                                                                                                    | A                           |
| 3   | `20260928110000_abonnements_facturation`            | #10 | Facturation automatique : statut `OVERDUE`, colonnes de facture, numérotation continue `IMT-AAAA-NNNNN`, index uniques partiels                                                                                                                                                              | A + E                       |
| 4   | `20260928120000_abonnements_paiement`               | #10 | Paiement de l'abonnement (constat manuel, PaySecureHub d'ImmoTopia), demandes d'extension                                                                                                                                                                                                    | A                           |
| 5   | `20260928120000_charge_call_notice_sent_at`         | #47 | Date du dernier avis d'appel de charges envoyé (`IF NOT EXISTS`)                                                                                                                                                                                                                             | A                           |
| 6   | `20260928130000_abonnements_lecture_seule_manuelle` | #10 | Lecture seule manuelle posée par le super-admin (2 colonnes)                                                                                                                                                                                                                                 | A                           |
| 7   | `20260929100000_syndic_identite_documents`          | #19 | Agences mandantes du syndic, signature et cachet                                                                                                                                                                                                                                             | A                           |
| 8   | `20260929110000_syndic_affectation_avance`          | #21 | **Réécrit les paiements de charges** : `charge_payments.lot_id` devient obligatoire (rempli depuis l'appel), une affectation créée par paiement existant, bornes de période lues dans le libellé, **statut des appels recalculé**                                                            | D                           |
| 9   | `20260929112000_syndic_mandant_fk_composite`        | #21 | Clé étrangère composite (agence, mandant), pas de correction de données prévue                                                                                                                                                                                                               | A (remplace une contrainte) |
| 10  | `20260929120000_syndic_quittances`                  | #25 | Reçus et quittances de charges, compteurs de numérotation                                                                                                                                                                                                                                    | A                           |
| 11  | `20260929130000_syndic_appels_automatiques`         | #26 | Échéanciers d'appels automatiques et leurs exécutions                                                                                                                                                                                                                                        | A                           |
| 12  | `20260929145000_syndic_fonds_ancienne_table`        | #35 | Renomme en `syndicate_fund_movements_legacy` la table hors dépôt `syndicate_fund_movements` (contraintes et index compris) si elle a l'ancienne structure ; sinon ne fait rien                                                                                                               | D (renommage)               |
| 13  | `20260929150000_syndic_factures_prestataires`       | #20 | Factures et paiements des prestataires, **nouveau** journal `syndicate_fund_movements`, 2 valeurs de l'enum `SourceType`. Échoue si le n° 12 n'a pas libéré le nom                                                                                                                           | A + E                       |
| 14  | `20260929160000_export_donnees_agence`              | #18 | Demandes d'export complet d'une agence                                                                                                                                                                                                                                                       | A                           |
| 15  | `20260929170000_patrimoine_types_documents`         | #34 | 5 types de pièces de bien (enum `PropertyDocumentType`)                                                                                                                                                                                                                                      | E                           |
| 16  | `20260930090000_syndic_fonds_paiements`             | #35 | `fund_id` sur appels et postes de budget (`IF NOT EXISTS` : la production les a déjà), 3 valeurs d'enum                                                                                                                                                                                      | A + E                       |
| 17  | `20260930091000_syndic_fonds_reprise`               | #35 | Recopie l'ancien journal (`_legacy`) dans le nouveau, crée les ouvertures manquantes, ne modifie jamais un solde. **Échoue** si : montant nul, type inconnu, solde ≠ somme du journal, appel ou poste rattaché au fonds d'une autre copropriété                                              | D + X                       |
| 18  | `20261001101500_patrimoine_pack_enums`              | #46 | `MODULE_PATRIMOINE`, `BIENS_DETENUS`, `HELD_PROPERTY`                                                                                                                                                                                                                                        | E                           |
| 19  | `20261001101600_patrimoine_pack_catalogue`          | #46 | Catalogue Patrimoine (Essentiel, Pro, extension de biens, mises en route), `ON CONFLICT DO NOTHING`                                                                                                                                                                                          | A (amorçage idempotent)     |
| 20  | `20261002143700_patrimoine_p4_entites_fiscalite`    | #44 | Entités détentrices, détentions, profils fiscaux, paramètres fiscaux CI et ML amorcés                                                                                                                                                                                                        | A (+ amorçage)              |
| 21  | `20261003150500_owner_portal_settings`              | #42 | Réglage du portail propriétaire                                                                                                                                                                                                                                                              | A                           |

### 2.2 Ce que change chaque hypothèse de départ

| Hypothèse                                                     | Commit de départ              | Migrations restantes sur `main`  |
| ------------------------------------------------------------- | ----------------------------- | -------------------------------- |
| **A** — image du 25/09, avant #10 (consigne)                  | `31c266b1` (#8, 25/09 04:18)  | **21** (tableau ci-dessus)       |
| A' — image du 25/09 au soir, après #10                        | `e7ecdc87` (#10, 25/09 18:43) | 16 : tous sauf les n° 1 à 4 et 6 |
| **B** — déploiement du 28/09 (ADR-003), au plus tôt après #35 | `b2994b5c` (#35, 28/09 06:42) | **6** : n° 5, 15, 18, 19, 20, 21 |
| B' — même déploiement, après #34                              | `b474b897` (#34, 28/09 07:34) | 5 : n° 5, 18, 19, 20, 21         |

Comptes **[exécutés]** avec `git diff --name-only <commit>..origin/main -- packages/api/prisma/migrations | cut -d/ -f5 | sort -u | wc -l`.
Sous B, le déploiement du 28/09 a aussi mis en service le garde d'abonnement, en
mode par défaut `warn` (`env.ts`) : l'observation du § 6 serait alors déjà commencée.

### 2.3 Migrations particulières

- **`20260927080000_mouvements_fonds_copropriete` : en base, pas dans le dépôt.**
  Appliquée en production le 25/09 à 03:49, jamais commitée. PR #37 : [ADR-003](../architecture/adr/ADR-003-migration-hors-git-fonds-copropriete.md)
  (décision, SQL d'origine) ; PR #38 : contrôle automatique dans `deploy.sh`.
  - L'étape « Contrôle des migrations inconnues du dépôt » de `deploy.sh` compare
    `_prisma_migrations` aux dossiers du dépôt. Elle ne tolère que les noms de
    [`migrations-orphelines-connues.txt`](../../infra/scripts/migrations-orphelines-connues.txt)
    (un seul aujourd'hui, celui-ci) et **fait échouer le déploiement avant toute
    migration** pour tout autre nom **[dépôt]**.
  - `migrate deploy` l'ignore ; `migrate status` lancé avant un déploiement répond
    « not found locally » et sort en code 1 : attendu, pas une panne (ADR-003).
  - Les n° 12, 16 et 17 sont écrits pour cet état : la table ancienne est mise de
    côté (`_legacy`, archive hors schéma), l'ancienne structure n'est pas reprise.
    `prisma migrate diff --from-url <prod>` proposera de supprimer `_legacy` et deux
    enums : **ne jamais appliquer ce script**.
  - Retirer la ligne orpheline de `_prisma_migrations` est **facultatif**, à faire hors
    déploiement, en trois temps documentés dans l'ADR (décision D10, § 3.1).
- **Autre orpheline éventuelle.** La commande 2 du § 1.4 doit ne lister que celle-là.
  `20260927090000_sms_lot1` n'existe que sur `origin/feat/sms-lot-1` (sans PR) : absente
  de `main`, elle ne fait pas partie de ce déploiement **[exécuté]**.
- **Échec possible sur données réelles :** n° 17 (contrôles volontaires), n° 8
  (colonne obligatoire), n° 9 (clé composite). D'où la répétition du § 3.5.
- **Enums (E) :** n° 3, 13, 15, 16, 18. Non défaisables (§ 7.3).
- **Échec en cours de route :** un fichier de migration s'exécute normalement dans une
  transaction implicite (ses effets sont annulés), mais sa ligne reste non terminée
  dans `_prisma_migrations` et bloque les déploiements suivants (`P3009`) tant qu'elle
  n'est pas résolue (§ 7.1) **[à confirmer sur copie]**.
- **Ordre hors séquence (hypothèse B).** Le n° 5 (`20260928120000_…`) porte un nom
  antérieur à des migrations déjà appliquées : `migrate deploy` doit l'appliquer
  quand même **[à confirmer sur copie]**.

### 2.4 Migrations en attente dans les PR ouvertes

Elles changeraient la liste si elles étaient fusionnées avant le déploiement.
Commandes **[exécutées]** (dépôt à jour au 2026-09-29) :

```bash
git diff --name-only origin/main...origin/claude/lucid-bell-0pzfvc -- packages/api/prisma/migrations | cut -d/ -f5 | sort -u   # PR #52 : 7
git diff --name-only origin/main...origin/feat/copilot-openrouter   -- packages/api/prisma/migrations | cut -d/ -f5 | sort -u   # PR #61 : 1
```

Les PR #59 et #60 n'ajoutent aucune migration.

**PR #61** (`feat/copilot-openrouter`, tête `6303e441`) : 1 migration.

| Dossier                               | Ce qu'elle fait                                                                                                                                                        | Nature                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `20261004090000_platform_ai_settings` | Table `platform_ai_settings` (une ligne `default` : fournisseur, modèle, effort, repli), clé étrangère vers `users`. Les clés API restent en variables d'environnement | A, défaisable par `DROP TABLE` tant que vide |

**PR #52** (`claude/lucid-bell-0pzfvc`, tête `f20b5ba3`, brouillon, 242 fichiers) : 7 migrations,
toutes postérieures au n° 21.

| Dossier                                  | Ce qu'elle fait                                                                                                                                                                                                 | Nature                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `20261004160000_patrimoine_multi_actifs` | Table `assets`, 3 enums, `asset_id` sur 4 tables, `property_id` devient facultatif sur 3 tables, contraintes CHECK, un actif immobilier créé pour chaque bien qui porte déjà des données patrimoniales (INSERT) | A + D léger (INSERT)        |
| `20261004170000_asset_property_cascade`  | Clé `assets.property_id` en `ON DELETE CASCADE` : supprimer un bien supprime son actif                                                                                                                          | D (remplace une contrainte) |
| `20261004180000_valorisation_par_classe` | 8 valeurs de l'enum `ValuationMethod`, colonne `reliability_reasons`                                                                                                                                            | A + E                       |
| `20261004190000_patrimoine_scenarios`    | Table des scénarios de projection, contraintes CHECK                                                                                                                                                            | A                           |
| `20261004210000_signup_attempts`         | Table anti-abus des inscriptions (empreinte d'adresse)                                                                                                                                                          | A                           |
| `20261004220000_particulier_enums`       | `TenantType.PARTICULIER`, `CapacityKey.ACTIFS`                                                                                                                                                                  | E                           |
| `20261004220100_particulier_catalogue`   | Catalogue Particulier (Gratuit, Plus), prix « provisoire », `ON CONFLICT DO NOTHING`                                                                                                                            | A (amorçage idempotent)     |

Effet sur le total : 21 (A) + 1 (#61) = 22 ; + 7 (#52) = 29. Ordre d'application :
`20261004090000` (#61) puis `2026100416…` à `20261004220100` (#52), après le n° 21.

**Recommandation (décision D4, § 3.1) :** déployer `main` seul, puis #61 et #52 dans un
second passage. #52 est un brouillon dont la recette navigateur n'a jamais été faite
(passation du 29/09) ; il introduit l'espace particulier en libre-service
(spécification `026-particuliers-libre-service`, ouverture publique **à confirmer** dans
le code) qui appelle une relecture juridique. #61 est additive et sans risque, mais son
utilité dépend de l'activation de l'assistant IA (D11).

## 3. Avant

### 3.1 Décisions à prendre (l'utilisateur tranche)

| #   | Décision                                                                                                                                                                                                                               | Recommandation                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| D1  | Point de départ réel (§ 1.4) : hypothèse A ou B                                                                                                                                                                                        | Le lire avant tout ; il dicte la liste des migrations                 |
| D2  | Gel : (a) `deploy.sh` complet, API ancienne active pendant la migration ; (b) pré-construction, arrêt de l'API, puis `deploy.sh --no-build`, front arrêté jusqu'au go (§ 4.8)                                                          | (b) : le n° 8 réécrit `charge_payments` sous une API qui écrit encore |
| D3  | `VITE_SHOW_DEMO_ACCOUNTS="true"` dans le build web de production (§ 3.7)                                                                                                                                                               | Le retirer si des clients réels utilisent l'instance                  |
| D4  | Fusionner #52 et #61 avant ou après ce déploiement (§ 2.4)                                                                                                                                                                             | Après                                                                 |
| D5  | Répéter les migrations sur une copie de la base (§ 3.5)                                                                                                                                                                                | Oui                                                                   |
| D6  | Pack de chaque agence (§ 5.3)                                                                                                                                                                                                          | **À trancher par agence**                                             |
| D7  | Conditions commerciales : fin d'essai, frais de mise en route, politique de quota, cycle (§ 5.4)                                                                                                                                       | À trancher par agence                                                 |
| D8  | Durée d'observation en `warn` et critères de passage (§ 6.4, 6.5)                                                                                                                                                                      | 14 jours minimum, fin de mois comprise (proposition)                  |
| D9  | Passage à `enforce` (§ 6.6)                                                                                                                                                                                                            | Accord explicite et écrit                                             |
| D10 | Retrait facultatif de la ligne orpheline de `_prisma_migrations` (ADR-003)                                                                                                                                                             | Hors déploiement, après deux déploiements sans incident               |
| D11 | ImmoCopilot : laisser `AI_PROVIDER` absent ou `disabled` (défaut) tant que la décision juridique sur les données personnelles transmises au fournisseur n'est pas prise ([RUNBOOK](RUNBOOK.md), [SECURITY](../governance/SECURITY.md)) | Laisser désactivé                                                     |

### 3.2 Fenêtre, gel et annonce

- **Annoncer** la fenêtre aux agences (durée, indisponibilité, absence de saisie
  pendant l'arrêt). Message à rédiger par l'utilisateur.
- **Choisir un créneau** à faible activité, qui évite :
  - **02:30** : passage quotidien complet de la tâche d'abonnements (facturation,
    échéances, relevés) ;
  - **hh:10 à hh:20**, bornes incluses : passage horaire de `subscription-usage-job`
    à hh:15 (alertes de seuil). L'outil `provision-subscription` y refuse toute écriture
    ([RUNBOOK](RUNBOOK.md), « Outil d'exploitation des abonnements ») ;
  - la fin et le début de mois (appels de charges programmés, quittances).

  Les horaires 02:30 et hh:15 sont dans `src/jobs/subscription-usage-job.ts`
  (`'30 2 * * *'`, `'15 * * * *'`, fuseau UTC) **[dépôt]**.

- **Geler les écritures** : pendant la fenêtre, l'API est arrêtée (§ 4.2). Aucune page
  de maintenance n'existe dans `infra/nginx/` **[dépôt]** : le front affichera des
  erreurs de connexion. À prévoir dans l'annonce.
- **Équipe disponible** jusqu'à la fin des vérifications du § 4.6.

### 3.3 Version à déployer

- `git fetch`, choisir le commit de `main`, le noter dans le journal (§ 8).
- CI verte sur ce commit. Relevé **[exécuté]** le 2026-09-29 :
  `gh run list --branch main --limit 3 --json conclusion,headSha,status,name` →
  `success` sur `6c454886`. (Un run précédent, sur `3ff95142`, était en échec ; le
  suivant est vert.)
- Poser ce commit sur le serveur par la méthode habituelle **[à confirmer : elle n'est
  pas décrite dans le dépôt]**, puis `git rev-parse HEAD`.
- Vérifier que la liste du § 2 est celle du commit choisi (§ 1.4, commande 2).

### 3.4 Sauvegardes

Le dépôt ne planifie aucune sauvegarde : `deploy.sh` la rappelle seulement en fin de
sortie **[dépôt]**. À programmer par l'utilisateur.

Sauvegarde préalable, hors fenêtre **[à confirmer]** (méthode d'[ADR-003](../architecture/adr/ADR-003-migration-hors-git-fonds-copropriete.md) et
de `deploy.sh`, adaptée) :

```bash
STAMP=$(date -u +%Y%m%d-%H%M)
mkdir -p /home/deployer/sauvegardes && chmod 700 /home/deployer/sauvegardes

# Base : format custom, lisible par pg_restore
dc exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > /home/deployer/sauvegardes/immotopia-$STAMP.dump

# Fichiers téléversés (volume nommé, montage en lecture seule)
docker run --rm -v immotopia-saas-uploads-data:/d:ro \
  -v /home/deployer/sauvegardes:/b alpine tar czf "/b/uploads-$STAMP.tar.gz" -C /d .

# Fichier d'environnement (droits conservés) et journaux de l'API en cours
cp -p "$IMMOTOPIA_ENV_FILE" "$IMMOTOPIA_ENV_FILE.avant-deploiement-$STAMP"
docker logs immotopia-saas-api > /home/deployer/sauvegardes/api-logs-$STAMP.log 2>&1
```

**Vérifier la sauvegarde** (un fichier non vérifié n'est pas une sauvegarde) :

```bash
test -s /home/deployer/sauvegardes/immotopia-$STAMP.dump && echo "non vide"
sha256sum /home/deployer/sauvegardes/immotopia-$STAMP.dump
cat /home/deployer/sauvegardes/immotopia-$STAMP.dump | dc exec -T postgres pg_restore --list | head -20
```

Puis **une restauration d'essai** (§ 3.5). Copier le dump **hors du serveur** (poste de
l'utilisateur ou stockage distinct) : le serveur héberge une vingtaine d'autres
applications et les volumes Docker vivent sur le même hôte. Le dump contient des données personnelles : droits
restreints, copie chiffrée, suppression des copies d'essai après usage.

Les fichiers ci-dessus sont des copies : ne jamais lancer `docker volume prune` ni
`docker system prune -a` sur ce serveur (avertissement de `deploy.sh`) **[dépôt]**.

### 3.5 Répétition sur une copie (recommandée, D5)

Sur le poste de l'utilisateur, jamais sur le serveur de production : base jetable,
distincte de la base de développement courante **[dépôt : RUNBOOK, sections « Prérequis »,
« Commandes quotidiennes » et « Assistant IA »]** ; adaptation **[à confirmer]**.

```bash
docker compose up -d db                      # PostgreSQL 16 local (docker-compose.yml racine)
# créer une base jetable, y restaurer le dump (pg_restore -d <base_jetable> --no-owner)
cd packages/api
DATABASE_URL="<url de la base jetable>" npx prisma migrate deploy
DATABASE_URL="<url de la base jetable>" npx prisma migrate status
```

Ce que la répétition doit montrer : toutes les migrations passent (n° 8, 12, 17 en
particulier), `migrate status` ne se plaint que de l'orpheline connue, les comptages
de tables clés sont cohérents avec la production. Elle sert aussi à rejouer les
`list` et `--dry-run` du § 5 sur des données réelles, sans risque :

```bash
export JWT_SECRET="$(openssl rand -hex 48)"  # sans lui, la configuration ne se charge pas (RUNBOOK)
DATABASE_URL="<url de la base jetable>" npm run ops:provision-subscription -w @immotopia/api -- list
```

(commande de la section « Outil d'exploitation des abonnements » du RUNBOOK **[dépôt]**.)

### 3.6 Variables d'environnement attendues (noms seulement)

Font foi : [`packages/api/env.example`](../../packages/api/env.example) et
[`packages/api/src/config/env.ts`](../../packages/api/src/config/env.ts). Le modèle
d'infrastructure [`infra/.env.example`](../../infra/.env.example) ne liste **ni les
variables d'abonnement, ni celles de l'assistant IA** : il est en retard sur ces
deux points.

| Groupe                         | Variables                                                                                                                                                                                                  | Attendu                                                                                                                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Socle (contrôlé par deploy.sh) | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `FRONTEND_URL`, `BACKEND_URL`, `PUBLIC_ORIGIN`, `UPLOADS_DIR`                                               | Présentes et non vides ; fichier en mode 600 ; `JWT_SECRET` d'au moins 32 caractères, jamais une valeur d'exemple (`env.ts` sort en erreur sinon) ; `NODE_ENV=production`                                                                                               |
| URLs                           | `CLIENT_URL`, `PORT`                                                                                                                                                                                       | `CLIENT_URL` : une URL valide **ou absente**, jamais vide (échec de validation Zod)                                                                                                                                                                                     |
| Abonnements                    | `SUBSCRIPTION_ENFORCEMENT`                                                                                                                                                                                 | Poser `warn` **explicitement** avant le déploiement (le défaut de `env.ts` est déjà `warn`, mais l'écrire lève toute ambiguïté)                                                                                                                                         |
| Émetteur des factures          | `PLATFORM_ISSUER_NAME`, `PLATFORM_ISSUER_ADDRESS`, `PLATFORM_ISSUER_RCCM`, `PLATFORM_ISSUER_TAX_ID`, `PLATFORM_ISSUER_EMAIL`, `PLATFORM_ISSUER_PHONE`, `PLATFORM_INVOICE_DUE_DAYS`                         | Renseignées **avant la première facture** (fin du premier essai) : les mentions légales sont figées dans chaque facture émise (`env.example`)                                                                                                                           |
| Paiement de l'abonnement       | `PLATFORM_PAYSECUREHUB_MODE`, `PLATFORM_PAYSECUREHUB_API_KEY`, `PLATFORM_PAYSECUREHUB_MERCHANT_ID`, `PAYMENT_GATEWAY_SIMULATOR`, `PAYMENT_SECRETS_KEY`, `PAYSECUREHUB_BASE_URL`, `PAYSECUREHUB_TIMEOUT_MS` | Sans configuration `LIVE` utilisable, seul le constat manuel du super-admin reste (`env.example`). Le mode réel PaySecureHub n'est pas validé : ne pas l'activer sans validation avec l'agrégateur ([sous-fonctionnalités](../fonctionnalites/sous-fonctionnalites.md)) |
| E-mail                         | `EMAIL_SERVICE_TYPE`, `EMAIL_SERVICE_API_KEY`, `EMAIL_FROM`, `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`                                                                    | Tant que le bloc est vide, **aucun e-mail ne part** (`infra/.env.example`) : ni alertes de seuil, ni rappels de fin d'essai, ni factures d'abonnement                                                                                                                   |
| Garde tenant                   | `TENANT_GUARD_MODE`                                                                                                                                                                                        | Défaut `warn` : ne pas le changer dans ce déploiement                                                                                                                                                                                                                   |
| Assistant IA                   | `AI_PROVIDER` (défaut `disabled`), `AI_MODEL`, `AI_EFFORT`, `ANTHROPIC_API_KEY`, `AI_*`. Avec #61 : `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`                                                            | Laisser désactivé (D11). `fake` est refusé par `env.ts` hors `development`/`test`. Une clé n'est jamais commitée ni préfixée `VITE_`                                                                                                                                    |
| Intégrations optionnelles      | `WHATSAPP_*`, `WASENDER_*`, `TWILIO_*`, `GOOGLE_*`                                                                                                                                                         | Inchangées                                                                                                                                                                                                                                                              |

Contrôle de présence **sans afficher aucune valeur** (même `grep` que `deploy.sh`)
**[dépôt]** :

```bash
for v in SUBSCRIPTION_ENFORCEMENT PLATFORM_ISSUER_NAME PLATFORM_ISSUER_ADDRESS PLATFORM_ISSUER_RCCM \
         PLATFORM_ISSUER_TAX_ID PLATFORM_ISSUER_EMAIL PLATFORM_ISSUER_PHONE EMAIL_SERVICE_TYPE EMAIL_FROM \
         PAYMENT_SECRETS_KEY PLATFORM_PAYSECUREHUB_MODE TENANT_GUARD_MODE AI_PROVIDER; do
  if grep -Eq "^${v}=.+" "$IMMOTOPIA_ENV_FILE"; then echo "présente : $v"; else echo "absente  : $v"; fi
done
```

Toute modification d'une variable lue par l'API impose de recréer les conteneurs :
`./infra/scripts/deploy.sh` (ou `--no-build`), d'après `infra/.env.example` **[dépôt]**.
Un simple `docker restart` ne relit pas le fichier d'environnement **[à confirmer]**.

### 3.7 Image et infrastructure

- **Panneau de comptes de démonstration.** `infra/compose/docker-compose.prod.yml`
  fixe l'argument de build `VITE_SHOW_DEMO_ACCOUNTS: "true"` du service `web`
  **[dépôt]**. Il compile dans le bundle servi à tout visiteur un panneau de comptes
  de démonstration avec un mot de passe commun (`apps/web/src/dev/dev-accounts.ts`), alors
  que `apps/web/env.example` dit « jamais en production ». Le contrôle anti-mot-de-passe
  de la CI ne le voit pas (elle construit sans cette variable). **À trancher (D3)** avant
  de reconstruire le front ; si le drapeau est retiré, c'est une modification du
  fichier Compose (PR séparée) et une reconstruction du front. Vérifier aussi que ces
  comptes n'existent pas dans la base de production, ou en changer les mots de passe.
- **Espace disque** pour le dump et deux jeux d'images : `df -h`, `docker system df`
  (lectures seules) **[à confirmer]**.
- **Contrôles de l'image construite** : voir § 4.1 (migrations embarquées, outil
  d'exploitation, binding `bcrypt`).
- **Nginx** : `infra/nginx/*` n'a pas changé depuis le 18/09 **[exécuté :
  `git log origin/main -- infra/nginx`]**. `client_max_body_size 60m` et
  `proxy_read_timeout 120s` restent valables. Le flux SSE de l'assistant ne concerne
  que l'IA activée (RUNBOOK, « Proxy et flux SSE »).

## 4. Pendant

### 4.1 Construire hors fenêtre et étiqueter l'ancienne version

**[dépôt]** pour les étapes de construction et le test `bcrypt` (étape 2 de
`deploy.sh`) ; étiquetage **[à confirmer]**. Ce qui suit vaut pour l'option D2 (b). Si
le gel simple est retenu (D2 a), ne faire que l'étape 1 (étiquettes), puis lancer
`./infra/scripts/deploy.sh` sans option : il construit, teste `bcrypt` et migre lui-même.

```bash
# 1. Étiquettes de retour AVANT de reconstruire (sinon `latest` est écrasée)
TAG="avant-$STAMP"                                   # à noter dans le journal (§ 8)
for i in immotopia-saas-api immotopia-saas-web immotopia-saas-api-migrate; do
  docker tag "$i:latest" "$i:$TAG"
done

# 2. Construction (étape 2 de deploy.sh)
dc build --pull api web
dc --profile tools build migrate

# 3. Binding natif bcrypt : deploy.sh le teste seulement quand il construit
docker run --rm --entrypoint node immotopia-saas-api:latest \
  -e "const b=require('bcrypt'); const h=b.hashSync('x',10); if(!b.compareSync('x',h)) process.exit(1); console.log('bcrypt ok');"

# 4. L'image embarque bien les migrations et l'outil attendus
docker run --rm --entrypoint ls immotopia-saas-api-migrate:latest packages/api/prisma/migrations | tail -3
docker run --rm --entrypoint ls immotopia-saas-api:latest dist/scripts       # provision-subscription.js
```

Le dernier dossier de migration listé doit être celui du commit choisi
(`20261003150500_owner_portal_settings` pour `main` au 2026-09-29). Le conteneur API
actuel continue de tourner avec son ancienne image.

### 4.2 Geler, sauvegarder, migrer

Début de la fenêtre annoncée (hors 02:30 et hors hh:10–hh:20).

1. **Arrêter l'API** : `docker stop immotopia-saas-api`. Plus aucune écriture ; les
   tâches planifiées, qui vivent dans le processus de l'API, s'arrêtent avec elle.
2. **Sauvegarde de fenêtre** : refaire les commandes de base et de vérification du
   § 3.4 avec un nouveau `STAMP`. C'est **cette** sauvegarde qui sert à restaurer :
   l'API étant arrêtée, une restauration ne perd aucune écriture.
3. **Lancer** `./infra/scripts/deploy.sh --no-build` **[dépôt]**. Le script, dans l'ordre :
   vérifie le fichier d'environnement (mode 600, variables obligatoires, `JWT_SECRET`
   ≥ 32), photographie les conteneurs voisins, s'assure que Postgres est sain,
   **compare `_prisma_migrations` aux dossiers du dépôt** (échec si une orpheline est
   inconnue), lance `prisma migrate deploy` par le service `migrate`, affiche
   `prisma migrate status`, démarre `api` et `web`, attend leur état `healthy`, fait
   les tests de fumée, compare les conteneurs voisins avant/après.
4. Lire la sortie : ligne « migration(s) orpheline(s) connue(s) et documentée(s) », la
   liste des migrations appliquées (doit correspondre au § 2), « Database schema is up
   to date! ».
5. **Le script rouvre le site de lui-même** (`up -d api web`). Pour vérifier avant
   d'ouvrir aux utilisateurs, arrêter le front dès la fin du script :
   `docker stop immotopia-saas-web`. Le front est la seule porte : l'API ne publie
   aucun port (`docker-compose.prod.yml` **[dépôt]**). Voir § 4.8.

### 4.3 Si le script s'arrête à « Etat des migrations »

`deploy.sh` tourne sous `set -Eeuo pipefail` et lance `migrate status` **avant**
`compose up -d api web`. Si une version future de Prisma signalait la ligne orpheline
même sans migration en attente, le script sortirait en code 1 **après** les migrations
et **avant** le démarrage de l'API (ADR-003, « Conséquences négatives »). Dans ce cas :

1. Lire la sortie : la seule anomalie doit être l'orpheline connue. Si une autre
   migration est en cause, ne pas continuer (§ 7.1).
2. Sinon, démarrer à la main : `dc up -d api web`, puis rejouer les vérifications du
   § 4.4.

### 4.4 Vérifications de santé

Tests de fumée de `deploy.sh` **[dépôt]** (à rejouer à la main si besoin) :

```bash
docker inspect -f '{{.Name}} {{.State.Health.Status}}' immotopia-saas-api immotopia-saas-web
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3019/healthz    # web : 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3019/health     # API via le proxy : 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3019/           # SPA : 200
curl -s -o /dev/null -w '%{http_code}\n' https://app.immotopia.cloud/health   # via nginx de l'hôte : 200
```

Journaux de démarrage **[à confirmer]** : aucune sortie de validation d'environnement,
pas d'erreur de connexion à la base, tâches planifiées démarrées.

```bash
docker logs --since 10m immotopia-saas-api 2>&1 | grep -iE 'error|Tenant guard|Subscription guard' | head -50
```

### 4.5 Contrôles de données (lecture seule)

**[à confirmer]** : requêtes écrites pour ce plan, non exécutées. Les rejouer d'abord
sur la copie du § 3.5.

```sql
-- Aucune migration inachevée ni annulée (attendu : 0 ligne)
SELECT migration_name, started_at, finished_at, rolled_back_at
  FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;

-- Catalogue complet (packs, extensions, mises en route, Patrimoine)
SELECT code, kind, monthly_price FROM catalog_items ORDER BY sort_order;

-- Fonds : l'archive est intacte et le nouveau journal la contient
SELECT (SELECT count(*) FROM syndicate_fund_movements_legacy) AS archive,
       (SELECT count(*) FROM syndicate_fund_movements)        AS journal;   -- journal >= archive

-- Paiements de charges : chacun rattaché à un appel a son affectation (attendu : 0)
SELECT count(*) FROM charge_payments p
  LEFT JOIN charge_payment_allocations a ON a.payment_id = p.id
 WHERE p.charge_call_id IS NOT NULL AND a.id IS NULL;
```

Comparer aussi, avant/après, le nombre de lignes des tables clés (agences,
utilisateurs, biens, baux, copropriétés, lots, paiements) : il ne doit pas baisser.

### 4.6 Recette rapide, sans écriture

Avec un compte super-admin puis un compte d'agence, sans créer ni modifier de donnée
réelle sauf convention préalable :

- connexion et déconnexion ; liste des biens ; un bail ;
- Syndic : une copropriété, ses fonds (le solde affiché doit égaler le dernier solde du
  journal), un appel de charges ancien (statut cohérent), un reçu ou une quittance en
  téléchargement ;
- écran d'abonnement de l'agence (`/tenant/:tenantId/settings/abonnement`) et écrans
  d'abonnement du super-admin : ils doivent s'ouvrir sans erreur, même sans abonnement ;
- portail propriétaire et portail locataire : connexion et une page.

### 4.7 Seeds

**Aucun seed n'est requis.** Le catalogue est amorcé par les migrations n° 1 (4 packs,
3 extensions, 4 mises en route) et n° 19 (Patrimoine), et les seeds de rôles et de
permissions n'ont pas changé depuis le 25/09 : seuls `catalog-seed.ts` (nouveau) et
deux seeds de démonstration Syndic ont bougé **[exécuté :
`git diff --name-status 31c266b1..origin/main -- packages/api/prisma/seeds`]**.

Les seeds `ts-node` ne tournent pas dans l'image d'exécution : le `Dockerfile` en
élague les dépendances de développement. Ils ne pourraient se lancer que depuis l'image
`migrate` **[dépôt : `packages/api/Dockerfile`]**.

| Script (`packages/api/package.json`)                                                                | Statut                            | Raison                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db:seed:catalog`                                                                                   | Facultatif, avec `--missing-only` | Sans l'option il **réécrit les prix et plafonds** du catalogue à la grille du code et écrase les modifications du super-admin ; le catalogue existe déjà par migration                                                                                                                                            |
| `db:seed`                                                                                           | **JAMAIS**                        | Efface tous les utilisateurs, agences et données en cascade. Exige `ALLOW_DESTRUCTIVE_SEED=1` et refuse `NODE_ENV=production`, mais ne jamais compter sur ce seul garde-fou                                                                                                                                       |
| `db:seed:comprehensive`, `db:seed:crm`                                                              | **JAMAIS**                        | Données de démonstration avec `deleteMany`, sans garde de production                                                                                                                                                                                                                                              |
| `db:seed:tenant-members`, `db:seed:syndic-demo`, `db:seed:maintenance`, `seed-quick-login-users.ts` | **JAMAIS**                        | Données et comptes de démonstration écrits dans la première agence active ou par `deleteMany` (le seed des membres est protégé par `ALLOW_DESTRUCTIVE_SEED`, celui du syndic par un garde de production ; le seed « quick login » n'a aucun garde)                                                                |
| `db:seed:super-admin`                                                                               | Non                               | Crée un compte super-admin : inutile, l'administration de la plateforme est déjà en service                                                                                                                                                                                                                       |
| `db:seed:document-templates`                                                                        | Non                               | Ne remplace jamais un modèle global existant, lit `assets/modeles_documents/` (absent de l'image : le `Dockerfile` ne le copie pas) et crée un utilisateur système si aucun `admin` n'existe. Les modèles DOCX n'ont pas changé depuis le 08/09 **[exécuté : `git log origin/main -- assets/modeles_documents`]** |
| `db:seed:rbac` et seeds de permissions, `db:seed:geographic`, `db:seed:property-templates`          | Non                               | Aucun changement depuis le 25/09 ; les référentiels existent déjà                                                                                                                                                                                                                                                 |
| `db:migrate:subscriptions-to-packs`                                                                 | Hors plan                         | Déduit les packs des modules actifs et pose des dérogations « Reprise » de 3 mois ; refuse la production sans `--allow-production`. Ce plan utilise `provision-subscription`                                                                                                                                      |

### 4.8 Point de non-retour

`deploy.sh` rouvre le site à la fin de son étape 5. Le point de non-retour est le
moment où des utilisateurs peuvent écrire dans le nouveau schéma. Deux façons de le
placer :

- **Recommandée.** Arrêter le front dès la fin du script
  (`docker stop immotopia-saas-web`) : le site reste fermé. Vérifier l'état `healthy`
  de l'API (`docker inspect`, § 4.4) et passer les contrôles de données du § 4.5 ;
  faire la **sauvegarde post-migration** (même méthode que § 3.4, nouveau `STAMP`) ;
  rendre la décision **go / no-go** ; puis `docker start immotopia-saas-web`, faire la
  recette rapide du § 4.6 avec l'équipe et clore la fenêtre.
- **Sinon.** Accepter la réouverture immédiate et enchaîner les contrôles ; la fenêtre
  annoncée court alors jusqu'au go.

**Après réouverture, et dès qu'un utilisateur a écrit dans le nouveau schéma, la
restauration perd ces écritures : on corrige en avant** (§ 7.1).

## 5. Attribution des packs par agence

### 5.1 Prérequis

- Déploiement terminé, `SUBSCRIPTION_ENFORCEMENT=warn`.
- Image contenant `dist/scripts/provision-subscription.js` (§ 4.1).
- Hors fenêtre interdite **hh:10 à hh:20 UTC** (§ 3.2).
- E-mail configuré (§ 3.6) : l'attribution déclenche de vrais envois (ci-dessous).
- **Sauvegarde de la base juste avant le premier `provision`** (méthode du § 3.4, vérifiée) :
  aucune commande ne défait un provisionnement (§ 7.4).

### 5.2 Ce que fait l'outil, ce qu'il déclenche

Source : [RUNBOOK](RUNBOOK.md), « Outil d'exploitation des abonnements (production) »
**[dépôt]**, et [`provision-subscription.ts`](../../packages/api/src/scripts/provision-subscription.ts).

- `provision` crée, en une transaction, un abonnement **d'essai `TRIALING`** (30 jours par
  défaut), les éléments au prix du catalogue, les modules, puis réconcilie le registre
  des lots. **Aucune facture pendant l'essai.** Idempotent ; un abonnement existant
  différent de la demande est refusé, jamais corrigé.
- **Il n'existe pas de commande pour défaire un `provision`.** `suspend` n'en est pas
  l'inverse : il met l'agence en `SUSPENDED` et **révoque les sessions** de ses
  membres actifs (§ 7.4).
- Effets qui ne dépendent pas de `SUBSCRIPTION_ENFORCEMENT` (`subscription-usage-job.ts`
  **[dépôt]**) : alertes de seuil à 80 % et 100 % par capacité (e-mail à l'administrateur
  de l'agence et au super-admin), rappels de fin d'essai à J-7 et J-1, et, à l'échéance
  de l'essai, **première facture émise et envoyée automatiquement**. Sans paiement
  enregistré, l'abonnement passe `PAST_DUE`, puis en lecture seule après 7 jours
  de grâce (appliqué seulement en `enforce`).
- Codes de sortie : `0` succès ou rien à faire, `2` refus, `1` erreur.

### 5.3 Décisions par agence : À TRANCHER par l'utilisateur

Constat du 27/09 (lecture seule de la production, passation) : aucune agence n'a
d'abonnement ; **Ivoire Résidences** n'a que `MODULE_AGENCY` mais utilise 4
copropriétés et 1 chantier ; **Agence Immobilière du Mali** n'a aucun module. Lire la
liste complète avec `list` : elle peut contenir d'autres agences (la passation de
la branche `feat/provision-abonnements` cite Bamako Immobilier).

Catalogue utile (source [`catalog.ts`](../../packages/api/src/lib/subscription/catalog.ts) ;
prix HT en FCFA par mois, **à relire dans le dry-run** car figés à l'attribution) :

| Code           | Ouvre                                               | Inclus                                | Prix HT / mois                 |
| -------------- | --------------------------------------------------- | ------------------------------------- | ------------------------------ |
| `AGENCE`       | `MODULE_AGENCY` (location, CRM, ventes, patrimoine) | 100 lots                              | 29 900                         |
| `SYNDIC`       | `MODULE_SYNDIC` (Syndic seul)                       | 2 copropriétés, 100 lots              | 49 900                         |
| `PROMOTEUR`    | `MODULE_PROMOTER` (chantiers, ventes, CRM)          | 2 chantiers, 150 lots                 | 149 900                        |
| `INTEGRE`      | les trois modules (exclusif)                        | 3 chantiers, 3 copropriétés, 300 lots | 249 900                        |
| `EXT_COPRO`    | rien                                                | +1 copropriété                        | 10 000                         |
| `EXT_CHANTIER` | rien                                                | +1 chantier                           | 40 000 (35 000 avec `INTEGRE`) |

Les lots forment une réserve unique pour tous les packs. Plusieurs packs déclenchent une
remise de 10 % du prix de base du pack le moins cher ([PLAN-ABONNEMENTS](../architecture/PLAN-ABONNEMENTS.md),
D6). Les chantiers relèvent de `MODULE_PROMOTER` : `SYNDIC` seul ne les ouvre pas
(`features.ts`, `route-features.ts`).

**Ivoire Résidences** (4 copropriétés, 1 chantier, agence déjà `MODULE_AGENCY`) :

| Option                  | `--items`                             | Couvre                                                       | À savoir                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Composition préparée | `AGENCE,SYNDIC,EXT_COPRO:2`           | Agence, Syndic, 4 copropriétés (2 + 2)                       | **Ne couvre pas le chantier** : refusé en `enforce` (`MODULE_NOT_INCLUDED`), journalisé en `warn`. Composition testée par la branche `feat/provision-abonnements` (96 810 HT / mois après essai, relevé sur base jetable) et conforme à la décision du 25/09 « AGENCE + SYNDIC », prise sur la base de développement (3 copropriétés) |
| B. Trois packs          | `AGENCE,SYNDIC,PROMOTEUR,EXT_COPRO:2` | + module chantiers, 2 chantiers inclus                       | Plus cher ; remise de combinaison de 10 % sur le pack le moins cher                                                                                                                                                                                                                                                                   |
| C. Intégré              | `INTEGRE,EXT_COPRO:1`                 | 3 copropriétés + 1, 3 chantiers, 300 lots, les trois modules | Pack exclusif ; 3 chantiers pour 1 utilisé                                                                                                                                                                                                                                                                                            |

Question à trancher : le chantier d'Ivoire doit-il rester utilisable (B ou C) ou
peut-il être refusé (A) ? Avec 4 copropriétés sur une capacité de 4 (options A, B et C),
l'agence recevra l'alerte de seuil à 100 % au passage horaire suivant : la prévenir.

**Agence Immobilière du Mali** (aucun module) :

| Option               | Commande             | À savoir                                                                                                                                                               |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Agence            | `--items AGENCE`     | Si elle gère des locations. Le dry-run donne l'usage réel (lots comptés, capacité 100). Sur la base de développement elle comptait 9 logements (PLAN-ABONNEMENTS § 10) |
| B. Autre pack        | selon l'usage réel   | Si le dry-run montre des copropriétés ou des chantiers                                                                                                                 |
| C. Ne rien attribuer | —                    | Acceptable **seulement en `warn`** : en `enforce`, une agence sans module est fermée                                                                                   |
| D. Suspendre         | `suspend --tenant …` | Agence dormante ou de test ; **révoque les sessions**, à ne pas confondre avec une mise en attente                                                                     |

**Toutes les autres agences** : une ligne de décision chacune, à partir de `list`. En
`enforce`, toute agence sans abonnement qui utilise un module est refusée : la liste doit
être traitée en entier avant § 6.6. Les portails et paiements des locataires et le
super-admin ne sont jamais bloqués.

### 5.4 Paramètres commerciaux (décision D7, par agence)

| Option                       | Effet                                                                      | Défaut                       |
| ---------------------------- | -------------------------------------------------------------------------- | ---------------------------- |
| `--trial-ends-at AAAA-MM-JJ` | Date de fin d'essai ; c'est la date de la **première facture automatique** | 30 jours après l'attribution |
| `--setup-waived`             | La première facture ne porte pas les frais `SETUP_<pack>`                  | frais facturés               |
| `--quota-policy`             | `BILL_OVERAGE` (dépassement facturé), `BLOCK` (refus), `WARN_ONLY`         | `BILL_OVERAGE`               |
| `--billing-cycle`            | `MONTHLY` ou `ANNUAL`                                                      | `MONTHLY`                    |

### 5.5 Procédure

**[dépôt]** : commandes du RUNBOOK ; `<slug>` se lit avec `list`, ce document n'en cite
aucun.

```bash
C=immotopia-saas-api; T=dist/scripts/provision-subscription.js
docker exec $C node $T list                                   # toutes les agences, leur statut, leurs éléments
docker exec $C node $T list --search <texte>                  # retrouver un slug
docker exec $C node $T provision --tenant <slug> --items <CODE[:QTE],…> [options] --dry-run
docker exec $C node $T provision --tenant <slug> --items <CODE[:QTE],…> [options]
```

Pour chaque agence :

1. `--dry-run` d'abord. Relire : état avant, ce qui serait fait, prix, estimation
   mensuelle HT / TVA / TTC, capacités utilisées et plafonds, alertes de seuil qui
   partiront. Rien n'est écrit.
2. Corriger la décision si le dry-run surprend (capacité dépassée, prix inattendu).
3. Relancer **sans** `--dry-run`, hors hh:10–hh:20.
4. Contrôler : `list --search <texte>` puis l'écran d'abonnement de l'agence.
5. Noter dans le journal (§ 8) : agence, éléments, date de fin d'essai, options.

## 6. Observation en `warn`, puis `enforce`

### 6.1 Poser `warn`

`SUBSCRIPTION_ENFORCEMENT=warn` écrit explicitement dans le fichier d'environnement
(§ 3.6), conteneurs recréés (`./infra/scripts/deploy.sh --no-build`). En `warn`, tout
passe et chaque refus qui **aurait** eu lieu est journalisé ; les portails, les
paiements des locataires et le super-admin ne sont jamais concernés (`env.example`,
`subscription-feature-middleware.ts` **[dépôt]**).

### 6.2 Quoi surveiller

| Signal                                                                               | Message journalisé                                                                                                                                                                                                        | Que faire                                                                                            |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Refus de module, de lecture seule, de quota                                          | `Subscription feature guard (warn): would have refused` (avec `tenantId`, `feature`, `code`, `moduleKey`, `method`, `path`) et `Subscription guard (warn): would have refused` (avec `tenantId`, `error` et son contexte) | Un usage légitime refusé = pack à compléter (§ 5). Un usage illégitime = à expliquer à l'agence      |
| Route de l'agence non classée dans la table du garde                                 | `Subscription guard: unclassified tenant route`                                                                                                                                                                           | Bogue de classement à corriger avant `enforce`                                                       |
| Calcul des droits en échec (la requête passe)                                        | `Subscription guard: entitlements unavailable, request allowed` (niveau `error`)                                                                                                                                          | À traiter : en `enforce`, une panne du module ne ferme pas l'application, mais elle masque des refus |
| Alertes de seuil 80 % et 100 %, rappels de fin d'essai, factures                     | e-mails, lignes `quota_alerts`                                                                                                                                                                                            | Vérifier qu'ils partent (configuration e-mail) et que l'agence est prévenue                          |
| Bruit initial : tant qu'une agence n'a pas de pack, chaque requête produit une ligne | idem première ligne                                                                                                                                                                                                       | Attribuer les packs le jour même, sinon le volume noie le signal                                     |

### 6.3 Où lire les refus journalisés

Journaux Winston en production : `logs/combined.log` et `logs/error.log` (`src/utils/logger.ts`
**[dépôt]**), sur le volume `immotopia-saas-api-logs` monté en `/app/logs`
(`docker-compose.prod.yml` **[dépôt]**). Rotation à **5 fichiers de 5 Mo** : l'historique
conservé est borné à 25 Mo, et le bruit initial (voir ci-dessus) peut le faire tourner
vite. **Exporter chaque jour.**
`docker logs` ne garde rien à la recréation du conteneur. Commandes **[à confirmer]**
(noms des fichiers tournants, format des lignes) :

```bash
L='cat /app/logs/combined*.log'
docker exec immotopia-saas-api sh -c "$L" | grep -c 'would have refused'                                       # volume total
docker exec immotopia-saas-api sh -c "$L" | grep 'would have refused' | grep -oE '"tenantId":"[^"]+"' | sort | uniq -c | sort -rn   # par agence
docker exec immotopia-saas-api sh -c "$L" | grep 'would have refused' | grep -oE '"(feature|code|moduleKey|error)":"[^"]+"' | sort | uniq -c | sort -rn   # par nature
docker exec immotopia-saas-api sh -c "$L" | grep -E 'unclassified tenant route|entitlements unavailable'
docker exec immotopia-saas-api sh -c "$L" > /home/deployer/sauvegardes/observation-$(date -u +%F).log   # export quotidien
```

Les compteurs internes du garde (`getSubscriptionGuardCounters`) ne sont exposés par
aucune route **[dépôt]** : ne pas compter dessus.

### 6.4 Durée d'observation (décision D8)

**Proposition :** au moins **14 jours pleins après la dernière attribution de pack**,
en traversant une fin de mois : appels de charges programmés, quittances, passage
quotidien de 02:30 et rappels d'essai ne se produisent qu'à ces échéances. Repartir de
zéro à chaque changement de pack.

### 6.5 Critères de passage à `enforce` (proposition à valider)

- [ ] Toute agence active a un abonnement `TRIALING` ou `ACTIVE` dont les modules
      couvrent son usage réel (`list` vérifié, aucune agence oubliée).
- [ ] Sur la période d'observation, **plus aucun refus « would have refused » pour un
      usage légitime** ; les refus restants sont identifiés et acceptés un par un.
- [ ] Aucune ligne `unclassified tenant route` ni `entitlements unavailable`.
- [ ] Capacités : chaque agence est sous son plafond, ou sa politique de quota
      (`BILL_OVERAGE`, `BLOCK`, `WARN_ONLY`) est un choix assumé.
- [ ] Chaîne de facturation prête avant la première fin d'essai : `PLATFORM_ISSUER_*`
      complets, e-mail opérationnel, mode d'encaissement défini (constat manuel du
      super-admin, ou PaySecureHub `LIVE` validé).
- [ ] Agences informées de la date de bascule.
- [ ] Retour à `warn` compris et répété (§ 7.4).

### 6.6 Passer à `enforce` : accord explicite requis

**Ne pas passer à `enforce` sans l'accord explicite de l'utilisateur**, donné pour cette
étape. En `enforce` (`env.example`, `subscription-feature-middleware.ts`) : module absent
→ 403 `MODULE_NOT_INCLUDED` ; module retiré → lecture seule (`MODULE_READ_ONLY`) ;
abonnement échu après grâce → lecture seule (`SUBSCRIPTION_READ_ONLY`) ; quota selon la
politique de l'agence.

1. Journaliser la décision (date, auteur).
2. Changer `SUBSCRIPTION_ENFORCEMENT=enforce`, recréer (`./infra/scripts/deploy.sh --no-build`), hors 02:30 et hh:10–hh:20.
3. Vérifier avec un compte d'agence sans droit sur un module (attendu : 403 avec le
   code) et avec un compte d'agence conforme (aucun changement), puis suivre les
   journaux de l'heure suivante.
4. Ne rien changer d'autre le même jour (`TENANT_GUARD_MODE` reste à `warn`).

## 7. Retour arrière

### 7.1 Quel retour selon l'avancement

| Où en est-on                                                                                                 | Conséquence                                                                                                                                  | Retour                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Avant `migrate deploy` (construction, `bcrypt`, contrôle des orphelines en échec)                            | Rien n'a changé en base ; `deploy.sh` s'arrête (« Aucune donnée supprimée »)                                                                 | Corriger et relancer. Si l'API a été arrêtée : `docker start immotopia-saas-api` (ancienne image, ancienne base)                                                                                                                                                                                                       |
| `migrate deploy` échoue                                                                                      | Les migrations précédentes restent appliquées ; celle qui échoue est annulée mais bloque les suivantes (`P3009`) **[à confirmer sur copie]** | Lire l'erreur, ne pas relancer à l'aveugle. Si la cause est corrigeable (données), corriger puis marquer la migration `--rolled-back` via `npx prisma migrate resolve --rolled-back <nom>` dans l'image `migrate` (modèle : étape « Etat des migrations » de `deploy.sh`), puis relancer. Sinon : restauration (§ 7.2) |
| Migrations appliquées, application défaillante, **avant** réouverture aux utilisateurs (front arrêté, § 4.8) | La base est neuve, l'ancienne image ne la comprend pas (n° 8 : `lot_id` obligatoire)                                                         | Restauration de la base **et** des images (§ 7.2). Corriger en avant si le défaut est mineur                                                                                                                                                                                                                           |
| Application ouverte, des utilisateurs ont écrit                                                              | Une restauration efface leurs saisies                                                                                                        | **Corriger en avant** (correctif ou réglage) ; ne restaurer que sur décision explicite de l'utilisateur, en assumant la perte depuis la sauvegarde post-migration                                                                                                                                                      |
| Provisionnement d'une agence à défaire                                                                       | Pas de commande inverse                                                                                                                      | § 7.4                                                                                                                                                                                                                                                                                                                  |
| `enforce` posé trop tôt                                                                                      | Refus 403 chez les agences                                                                                                                   | § 7.4 : revenir à `warn` (aucun changement de schéma)                                                                                                                                                                                                                                                                  |
| Variable d'environnement erronée                                                                             | API qui ne démarre pas ou comportement changé                                                                                                | Remettre la copie `.avant-deploiement-<STAMP>` du fichier d'environnement (§ 3.4, droits 600), puis `./infra/scripts/deploy.sh --no-build`                                                                                                                                                                             |

### 7.2 Restaurer la base et les images

**[à confirmer]** : procédure écrite pour ce plan, à **rejouer sur la copie du § 3.5**
avant le jour J. Elle restaure dans une base **neuve** et bascule par renommage : la
base défaillante est conservée pour analyse.

```bash
# 1. Plus aucune connexion à la base
docker stop immotopia-saas-web immotopia-saas-api

# 2. Restaurer la sauvegarde de fenêtre dans une base neuve (l'existante n'est pas touchée)
dc exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" immotopia_restauree'
dc exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d immotopia_restauree --no-owner --exit-on-error' \
  < /home/deployer/sauvegardes/immotopia-<STAMP_FENETRE>.dump

# 3. Contrôler : comptages des tables clés, `_prisma_migrations` = état d'avant

# 4. Bascule par renommage (base d'origine conservée sous un autre nom)
dc exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER DATABASE \"$POSTGRES_DB\" RENAME TO immotopia_apres_incident" \
  -c "ALTER DATABASE immotopia_restauree RENAME TO \"$POSTGRES_DB\""'

# 5. Remettre les anciennes images sous `latest`, puis démarrer sans reconstruire
for i in immotopia-saas-api immotopia-saas-web immotopia-saas-api-migrate; do
  docker tag "$i:<TAG>" "$i:latest"                  # <TAG> noté au § 4.1
done
dc up -d --no-build --force-recreate api web
```

Puis rejouer les vérifications du § 4.4. Les fichiers téléversés ne sont pas concernés
par la restauration de la base (le volume est indépendant) ; ceux ajoutés pendant la
fenêtre restent en place, sans effet.

Nettoyage : ne supprimer `immotopia_apres_incident` qu'après analyse et décision de
l'utilisateur.

### 7.3 Ce qui n'est PAS réversible

- **Les migrations appliquées.** Prisma n'a pas de retour arrière ; le seul retour réel
  est la restauration ci-dessus.
- **Les valeurs d'enum ajoutées** (n° 3, 13, 15, 16, 18 ; et, si #52 est déployée,
  `PARTICULIER`, `ACTIFS`, méthodes de valorisation) : PostgreSQL ne sait pas retirer
  une valeur d'un type sans le recréer. Sans conséquence pour l'ancien code, mais
  définitif.
- **La réécriture des paiements Syndic (n° 8)** : `lot_id` obligatoire, affectations,
  statuts d'appels recalculés. L'ancienne version de l'API ne peut plus enregistrer de
  paiement de charges sur ce schéma.
- **Le journal des fonds (n° 12, 17)** : l'ancienne table est renommée en `_legacy`
  (archive conservée), le nouveau journal en est la source.
- **Les écritures faites après réouverture** dans le nouveau schéma (paiements
  affectés, factures prestataires, quittances numérotées, abonnements…).
- **Les e-mails partis** : alertes de seuil, rappels d'essai, factures d'abonnement.
- **Un abonnement d'essai créé** (aucune commande pour le supprimer, § 7.4).

**Comment on le gère :** geler avant, sauvegarder après l'arrêt de l'API, répéter sur
une copie, fixer le point de non-retour (§ 4.8) et, au-delà, corriger en avant.

### 7.4 Défaire un provisionnement, revenir de `enforce`

- **`enforce` → `warn`** : changer la variable, `./infra/scripts/deploy.sh --no-build`.
  Aucun schéma touché, effet immédiat au redémarrage.
- **Un `provision` à défaire.** Il n'existe pas de commande inverse et `suspend` **n'en
  est pas une**. Options, **à confirmer** : laisser l'abonnement en place (inoffensif en
  `warn`) ; le corriger depuis l'écran d'abonnement du super-admin ; ou restaurer la
  sauvegarde prise juste avant le provisionnement (§ 5.1), au prix de **toutes les
  écritures faites depuis** : à réserver à un incident grave. Ne jamais corriger par
  SQL à la main sans en écrire la procédure et la faire relire.
- **`suspend` par erreur** : l'agence est `SUSPENDED` et ses sessions sont révoquées ;
  la réactivation passe par les écrans du super-admin **[à confirmer]**.

## 8. Checklist finale et responsabilités

### 8.1 Journal à remplir

| Élément                                       | Valeur |
| --------------------------------------------- | ------ |
| Point de départ établi (lectures du § 1.4)    |        |
| Commit déployé (SHA)                          |        |
| Fenêtre (début, fin, UTC)                     |        |
| Identifiants des images avant / après         |        |
| Fichiers de sauvegarde (avant, fenêtre, post) |        |
| Migrations appliquées (nombre, dernière)      |        |
| Heure de réouverture                          |        |
| Agences provisionnées (éléments, fin d'essai) |        |
| Date de passage à `warn` / à `enforce`        |        |

### 8.2 Checklist

**Avant**

- [ ] Point de départ réel établi par les lectures serveur (§ 1.4) ; liste des migrations recalculée.
- [ ] Décisions D1 à D11 prises ou explicitement reportées (§ 3.1).
- [ ] Commit choisi, CI verte, liste du § 2 conforme à ce commit.
- [ ] Une seule orpheline en base : `20260927080000_mouvements_fonds_copropriete`.
- [ ] Sauvegarde préalable faite, **vérifiée** (`pg_restore --list`), copiée hors serveur.
- [ ] Répétition sur copie réussie (migrations, `migrate status`, `list` et dry-run des packs).
- [ ] Variables présentes, noms contrôlés sans valeur (§ 3.6) ; `SUBSCRIPTION_ENFORCEMENT=warn` explicite.
- [ ] `VITE_SHOW_DEMO_ACCOUNTS` tranché (D3).
- [ ] Fenêtre annoncée aux agences ; créneau hors 02:30 et hh:10–hh:20.
- [ ] Espace disque suffisant ; sauvegarde du fichier d'environnement ; étiquettes `avant-` posées.

**Pendant**

- [ ] Images construites, `bcrypt` opérationnel, dernière migration embarquée attendue, outil d'exploitation présent.
- [ ] API arrêtée ; sauvegarde de fenêtre faite et vérifiée.
- [ ] `deploy.sh --no-build` terminé, migrations conformes au § 2, `migrate status` net.
- [ ] Front arrêté jusqu'au go (recommandé, § 4.8) ; API `healthy`, quatre tests de fumée à 200, journaux de démarrage sans erreur.
- [ ] Contrôles de données passés (§ 4.5).
- [ ] Sauvegarde post-migration faite ; go / no-go de l'utilisateur ; front redémarré.
- [ ] Recette rapide passée (§ 4.6) ; fenêtre close et annoncée comme telle.

**Après**

- [ ] Aucun seed lancé (§ 4.7).
- [ ] Sauvegarde vérifiée juste avant le premier `provision` (§ 5.1).
- [ ] Packs attribués agence par agence (dry-run puis réel), journalisés (§ 5).
- [ ] Alertes et e-mails déclenchés compris ; agences concernées prévenues.
- [ ] Observation en `warn` : export quotidien des journaux, refus triés (§ 6.3).
- [ ] Critères de passage remplis (§ 6.5) ; accord explicite de l'utilisateur ; `enforce` posé et vérifié (§ 6.6).
- [ ] Sauvegardes planifiées (le dépôt n'en planifie aucune) ; copies d'essai supprimées.

### 8.3 Reste à la charge de l'utilisateur

- **Déployer** : toutes les commandes du serveur, y compris le choix du créneau, du gel
  et de la méthode de mise à jour du code sur le serveur.
- **Trancher** les décisions D1 à D11, et en particulier le pack et les conditions de
  chaque agence (§ 5.3, 5.4) et le passage à `enforce`.
- **Renseigner** les mentions légales de l'émetteur des factures (RCCM, compte
  contribuable, adresse, téléphone) et brancher l'e-mail avant la première fin d'essai.
- **Choisir le mode d'encaissement** des abonnements et faire valider PaySecureHub en
  mode réel s'il doit servir.
- **Relectures juridiques** avant ouverture au public : conditions d'utilisation,
  conservation et protection des données personnelles, transfert de données au
  fournisseur d'IA avant d'activer l'assistant, avertissement des calculs fiscaux.
- **Statuts fonciers** (liste à fixer avec un juriste local) et paramètres fiscaux CI
  et ML amorcés par la migration n° 20 : à faire valider par le métier avant de
  présenter des calculs fiscaux aux clients (proposition).
- **Retrait facultatif** de la ligne orpheline de `_prisma_migrations` (D10).
- **Protection de branche GitHub** (indisponible) et fusion de #52 et #61 après recette.
- **Communication** aux agences : fenêtre, alertes de seuil, fin d'essai, factures.

## Références

- [RUNBOOK](RUNBOOK.md) : « Outil d'exploitation des abonnements (production) »,
  « Migration orpheline en production », « Assistant IA (ImmoCopilot) », « Base de données ».
- [HANDOFF](HANDOFF.md) : section « Pilote — lots Syndic S3 à S5 » (état de la production au 27/09).
- [ADR-003](../architecture/adr/ADR-003-migration-hors-git-fonds-copropriete.md) :
  migration hors dépôt des fonds de copropriété, retrait facultatif de la ligne orpheline.
- [PLAN-ABONNEMENTS](../architecture/PLAN-ABONNEMENTS.md) : catalogue, cycle de vie, décisions D1 à D16.
- [`infra/scripts/deploy.sh`](../../infra/scripts/deploy.sh),
  [`docker-compose.prod.yml`](../../infra/compose/docker-compose.prod.yml),
  [`.env.example`](../../infra/.env.example),
  [`migrations-orphelines-connues.txt`](../../infra/scripts/migrations-orphelines-connues.txt).
- [`packages/api/env.example`](../../packages/api/env.example),
  [`packages/api/src/config/env.ts`](../../packages/api/src/config/env.ts).
- [SECURITY](../governance/SECURITY.md) : modèle de menace, section « Assistant IA ».
- CI : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
