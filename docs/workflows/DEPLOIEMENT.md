# Déploiement — staging et production

Mise en service, déploiement courant, sauvegarde et restauration des deux
environnements d'ImmoTopia, qui tournent sur le même serveur (147.93.44.169,
partagé avec une vingtaine d'autres applications). La décision et ses raisons
sont dans
[ADR-005](../architecture/adr/ADR-005-environnements-staging-production.md) ;
l'installation locale, les ports de développement et le dépannage sont dans
[RUNBOOK.md](RUNBOOK.md).

Document rédigé le 2026-09-29 à partir de la lecture des scripts
`infra/scripts/*.sh`, du compose `infra/compose/docker-compose.prod.yml`, des
réglages `infra/environments/*.conf`, des vhosts `infra/nginx/*.conf` et du
modèle `infra/.env.example`, relus et complétés le même jour après les
correctifs de sécurité de ces scripts, de `Dockerfile.web`, de `spa.conf` et des
seeds. Les commandes et les résultats attendus sont ceux que ces fichiers
produisent ; ce qui n'a jamais tourné sur le serveur est marqué **non éprouvé**.

Dans ce document : [éprouvé ou non](#éprouvé-et-non-éprouvé) ·
[règle d'or](#règle-dor) · [vue d'ensemble](#vue-densemble) ·
[première mise en service de la production](#première-mise-en-service-de-la-production) ·
[cycle courant](#cycle-courant) ·
[sauvegarde et restauration](#sauvegarde-et-restauration) ·
[différences de configuration](#différences-de-configuration-staging-et-production) ·
[pièges](#pièges) · [points ouverts](#points-ouverts)

## Éprouvé et non éprouvé

- **Éprouvé sur le serveur**, sous sa forme d'avant ADR-005 (une seule pile,
  `immotopia-saas`) : `deploy.sh` (construction, migrations, tests de fumée,
  empreinte des conteneurs voisins), le vhost et le certificat de
  `app.immotopia.cloud`.
- **Vérifié par la CI, sans serveur** : `infra/scripts/check-infra.sh` (job
  `infra` de `.github/workflows/ci.yml`, qui ne reçoit que le droit
  `contents: read`) contrôle la syntaxe des scripts, le refus d'un environnement
  absent ou inconnu (code de sortie 2), le rendu de Compose pour les deux
  environnements et l'étanchéité des noms de conteneurs, de volumes, de réseaux
  et des ports. Il vérifie aussi que **chaque port publié est lié à
  `127.0.0.1`**, que le service `api` n'en publie **aucun**, et que les scripts
  `infra/scripts/*.sh` suivis par git ont le **mode 100755 dans l'index** (sinon
  `./infra/scripts/backup.sh prod`, donc le cron, échouerait en « Permission
  denied » après un `git pull`). Il n'exécute aucun script contre un vrai Docker.
- **Éprouvé en local le 2026-09-29, sur les scripts et les images FINAUX**
  (Docker Desktop sous Windows ; les deux piles construites et lancées côte à
  côte avec les vraies confs, sur des bases vierges et des secrets jetables, tout
  démonté ensuite) :
  - construction des deux images (chacune vise sa propre origine, aucun
    croisement `app`/`clients` dans les bundles) ; les 80 migrations sur une
    base vierge ; tests de fumée des deux piles ; noms, ports, réseaux et volumes
    disjoints ;
  - panneau de comptes de démo présent sur la page de connexion du staging et
    absent sur celle de la production ; bundle de production sans aucun
    identifiant de démonstration, et build en échec quand on en injecte un
    (garde-fou de `Dockerfile.web`) ;
  - `deploy.sh staging --no-build` exécuté en entier avec ses contrôles
    (aucune clé critique en double, mot de passe Postgres de 24 caractères ou
    plus, cohérence des URL, de la base et de `NODE_ENV`) ; l'empreinte des
    conteneurs voisins, l'autre pile comprise, sans fausse alerte, et un
    redémarrage de voisin détecté (un faux positif dû à la durée d'exécution
    affichée par `docker ps` a été corrigé à cette occasion) ;
  - `bootstrap.sh` : `--dry-run` sur base vierge (états à zéro et plan), lancement
    sans terminal refusé **avant toute écriture**, état du RBAC « complet »
    (ignoré), « incomplet » (marqueur retiré : « sera complété ») puis complété par
    relance ; les trois seeds d'amorçage dans l'image `migrate` : 65 permissions,
    5 rôles, 12 gabarits de biens, un SUPER_ADMIN créé par l'entrée standard,
    refus d'un mot de passe faible, d'un compte existant et d'une option
    `--password` (valeur non répétée), seed RBAC relancé sans effet (189 liaisons
    avant et après) ;
  - connexion du super-admin, liste et création d'une agence en un clic (HTTP 201,
    essai de 30 jours, pack `AGENCE`) : le RBAC et le rôle `TENANT_ADMIN` posés par
    l'amorçage suffisent ;
  - `backup.sh` (dump, archive des documents, avertissement d'absence de copie
    hors serveur, rotation) et `restore-check.sh` (conteneur sans réseau, 208
    tables et 80 migrations restaurées, conteneur et volume supprimés : le nombre
    de volumes Docker est le même avant et après) ;
  - en-têtes de sécurité de `infra/nginx/spa.conf` sur une image web réelle avec
    un faux upstream imitant Helmet : `nginx -t` valide, les trois en-têtes sur le
    SPA, les assets, `/healthz` et les icônes, un seul jeu (sans doublon) sur
    `/api/`, `/uploads/` et `/health` ;
  - le refus, par le seed, d'un mot de passe ou d'un e-mail que la connexion
    modifierait : test unitaire (64 cas) qui exécute le vrai middleware de
    connexion. Les gardes `NODE_ENV=production` des six seeds de développement :
    exécutées avec un `DATABASE_URL` invalide, sortie en code 1 avant toute
    connexion.
- **Non éprouvé** : tout ce qui se joue sur le serveur lui-même.
  - La production : `make-env.sh prod` et `deploy.sh prod`. Ses garde-fous
    (arbre sale, git inutilisable, HEAD hors d'`origin/main`, secrets identiques
    au staging, simulateur de paiement, sauvegarde de moins de 24 h) n'ont été
    exercés que sur une copie tronquée du script avec de faux fichiers ; un
    déploiement complet de la production n'a jamais tourné.
  - Le vhost et le certificat de `clients.immotopia.cloud`, et les en-têtes de
    sécurité observés derrière le nginx de l'hôte et en HTTPS.
  - La saisie interactive de `bootstrap.sh` (aucun terminal en local) : les deux
    saisies de l'e-mail et du mot de passe sans écho, le récapitulatif `[o/N]`.
  - Les contrôles propres à Linux : `stat -c` (mode 600, simulé en local car NTFS
    ne le conserve pas), `ss` (ports) et `flock` (verrou), absents ou simulés en
    local.
  - Le cron, la copie hors serveur (rclone), la restauration réelle, le retour
    arrière par étiquette d'image, le fichier temporaire de `set-google-oauth.sh`,
    et les gardes des seeds de développement dans l'image `migrate` de la pile.
    Le premier passage sur le serveur sert donc aussi de test : lire chaque
    résultat avant de passer à l'étape suivante.

## Règle d'or

Chaque action sur le serveur (nginx, certbot, déploiement, restauration, cron,
édition d'un fichier de secrets) est faite par le propriétaire du serveur, ou
explicitement approuvée par lui avant d'être lancée. Un agent IA ne déploie
jamais sans un « oui » explicite pour l'action en cause, et ne lit ni n'écrit un
fichier `.env` (`AGENTS.md` ; `LEAD_PROCESS.md`, section « Ce que le Pilote ne
fait jamais sans un « oui » explicite »). Un « oui » vaut pour une action, pas
pour la suivante.

Les commandes de ce document s'exécutent en tant que `deployer`, depuis
`/home/deployer/immotopia-saas`, dans une session
`ssh -t -p 2222 deployer@147.93.44.169` (le `-t` est obligatoire pour
`bootstrap.sh` et `set-google-oauth.sh`, qui posent des questions : sans terminal,
`bootstrap.sh` échoue avant d'avoir rien écrit quand un compte reste à créer).
Aucun secret ne se colle dans une conversation, un ticket ou un journal.

## Vue d'ensemble

| Élément                              | Staging                                                                       | Production                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| URL                                  | https://app.immotopia.cloud                                                   | https://clients.immotopia.cloud                                   |
| Rôle                                 | répéter, valider, démontrer ; données de test                                 | vrais clients                                                     |
| Pile (projet Compose)                | `immotopia-saas` (nom historique, jamais renommé)                             | `immotopia-prod`                                                  |
| Port web, sur 127.0.0.1              | 3019                                                                          | 3020                                                              |
| Port Postgres, sur 127.0.0.1         | 5436                                                                          | 5437                                                              |
| Fichier de secrets (hors dépôt, 600) | `/home/deployer/immotopia-saas.env`                                           | `/home/deployer/immotopia-prod.env`                               |
| Réglages non secrets (dans le dépôt) | `infra/environments/staging.conf`                                             | `infra/environments/prod.conf`                                    |
| Vhost nginx de l'hôte                | `infra/nginx/app.immotopia.cloud.conf`                                        | `infra/nginx/clients.immotopia.cloud.conf`                        |
| Conteneurs                           | `immotopia-saas-postgres`, `-api`, `-web`                                     | `immotopia-prod-postgres`, `-api`, `-web`                         |
| Images                               | `immotopia-saas-api`, `-web`, `-api-migrate` (étiquette `latest`)             | `immotopia-prod-api`, `-web`, `-api-migrate` (étiquette `latest`) |
| Volumes                              | `immotopia-saas-postgres-data`, `-uploads-data`, `-api-logs`                  | `immotopia-prod-postgres-data`, `-uploads-data`, `-api-logs`      |
| Réseau Docker                        | `immotopia-saas-network`                                                      | `immotopia-prod-network`                                          |
| Sauvegardes (`BACKUP_DIR`)           | `/home/deployer/backups/immotopia-saas`                                       | `/home/deployer/backups/immotopia-prod`                           |
| Journal des déploiements             | `/home/deployer/deploy-history-immotopia-saas.log`                            | `/home/deployer/deploy-history-immotopia-prod.log`                |
| Panneau de comptes de démo           | affiché (`VITE_SHOW_DEMO_ACCOUNTS=true`)                                      | absent (`false`)                                                  |
| Simulateur de paiement               | actif (`PAYMENT_GATEWAY_SIMULATOR=1`, `PLATFORM_PAYSECUREHUB_MODE=SIMULATOR`) | interdit (`deploy.sh prod` refuse `PAYMENT_GATEWAY_SIMULATOR=1`)  |
| E-mail, SMS, WhatsApp                | vides, ou sur un compte bac à sable                                           | identifiants réels, dédiés à la production                        |
| Google OAuth                         | un client OAuth propre au staging                                             | un client OAuth propre à la production                            |

**Le staging ne notifie jamais de vraies personnes et ne porte jamais un
identifiant de la production** (messagerie, opérateur SMS, WhatsApp, IA, compte
de paiement) : un essai y enverrait de vrais messages à de vrais clients.

### Règles de séparation

- **Bases et fichiers** : chaque pile a son conteneur Postgres, son volume de
  données, son volume de documents téléversés, son volume de journaux et son
  réseau Docker. Rien n'est partagé.
- **Réseau** : tous les ports publiés sont liés à `127.0.0.1`, et le service
  `api` n'en publie aucun (il n'est joignable que par le réseau interne de la
  pile, à travers le nginx du service `web`). Le nginx de l'hôte est la seule
  porte d'entrée, avec un vhost par sous-domaine. `check-infra.sh` le vérifie sur
  le rendu Compose.
- **Certificats** : `app.immotopia.cloud` et `clients.immotopia.cloud` ont
  chacun leur certificat. Le certificat de `immotopia.cloud` (un autre projet,
  servi par un autre vhost qu'il ne faut pas toucher) ne les couvre pas.
- **Secrets** : `JWT_SECRET`, mot de passe Postgres et `PAYMENT_SECRETS_KEY`
  distincts, tous trois générés neufs par `make-env.sh` et **contrôlés par
  `deploy.sh prod`** (comparaison d'empreintes, rien n'est affiché) : un secret
  identique à celui du staging fait échouer le déploiement. Les clés
  d'intégration (e-mail, SMTP, Twilio, WaSender, Google, Anthropic, OpenRouter,
  PaySecureHub) identiques à celles du staging ne donnent qu'un avertissement.
  Inversement, `deploy.sh staging` avertit si le staging en porte une.
- **Sessions** : les cookies d'authentification sont posés sans attribut
  `domain` (`packages/api/src/utils/auth-cookies.ts`) : une session ouverte sur
  un sous-domaine n'existe pas sur l'autre, et deux `JWT_SECRET` distincts
  rendent un jeton de l'un invalide chez l'autre.
- **Images** : les `VITE_*` sont figés dans le bundle à la compilation. Une image
  web est propre à un environnement ; on promeut un commit, jamais une image.
- **Un seul checkout** : `/home/deployer/immotopia-saas` sert les deux piles. Le
  script prend l'environnement en argument **obligatoire** : il n'y a jamais
  d'environnement par défaut.
- **Un seul `deploy.sh` à la fois**, quel que soit l'environnement : le checkout
  est partagé et la construction dure des minutes. Un verrou `flock` sur
  `/tmp/immotopia-deploy.lock` (hors dépôt : un fichier non suivi rendrait
  l'arbre « sale ») fait échouer le second lancement tout de suite, avec le
  message « un autre deploy.sh est déjà en cours ». Sans `flock` sur l'hôte, le
  script avertit et ne verrouille rien.
- **Aucun remplacement par le shell** : les scripts purgent les variables
  `STACK_NAME`, `IMMOTOPIA_ENV_FILE`, `PUBLIC_ORIGIN`, `WEB_PORT`, `PG_PORT`,
  `VITE_SHOW_DEMO_ACCOUNTS`, `BACKUP_DIR` et `BACKUP_KEEP_DAYS` restées dans le
  shell ; `deploy.sh` purge aussi `POSTGRES_USER`, `POSTGRES_PASSWORD`,
  `POSTGRES_DB`, `STAGING_ENV_FILE` et `DEPLOY_HISTORY_FILE`. Seuls comptent les
  réglages de `infra/environments/<env>.conf` et le fichier de secrets.
  `IMMOTOPIA_ALLOW_OVERRIDE=1` rouvre ce remplacement pour des essais locaux ;
  `deploy.sh` et `bootstrap.sh` le refusent pour la production. Ne jamais
  l'exporter dans une session du serveur.

### Scripts

| Script                                        | Rôle                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `make-env.sh <staging\|prod> [fichier]`       | Crée le fichier de secrets (mode 600, secrets neufs). Refuse d'écraser un fichier existant.                                                                  |
| `deploy.sh <staging\|prod> [--no-build]`      | Contrôles, construction, migrations, démarrage, tests de fumée, empreinte des voisins. Idempotent, ne supprime jamais de volume. Un seul à la fois (verrou). |
| `bootstrap.sh <staging\|prod> [--dry-run]`    | Amorce une base vierge : RBAC, gabarits de biens, premier SUPER_ADMIN saisi au terminal (toutes les saisies avant la première écriture).                     |
| `set-google-oauth.sh <staging\|prod> [fich.]` | Écrit `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans le fichier de secrets, sans jamais afficher le secret.                                               |
| `backup.sh <staging\|prod>`                   | Sauvegarde la base et le volume des documents, avec rotation et copie hors serveur facultative.                                                              |
| `restore-check.sh <dump.sql.gz>`              | Vérifie qu'un dump se restaure, dans un conteneur jetable sans réseau. Ne touche aucune pile.                                                                |
| `check-infra.sh`                              | Contrôle statique sans secret (syntaxe, rendu Compose, ports, modes 100755), lancé par la CI (`bash infra/scripts/check-infra.sh` aussi en local).           |

Les scripts doivent porter le **mode 100755 dans le dépôt** (voir le piège
« Modes des scripts »).

`migrate deploy` (lancé par `deploy.sh`) ne pose que le schéma, le catalogue
d'abonnements et les paramètres fiscaux. Les rôles, les permissions, les
gabarits de biens et le premier super-admin viennent de `bootstrap.sh`. Le seed
de démonstration (`npm run db:seed`) n'est pas une option : il efface la base et
refuse de tourner en production.

**Seeds de développement dans l'image `migrate`.** L'image `migrate` embarque
tout le dossier `packages/api/prisma/seeds/`, donc aussi des seeds de
développement qui créent des comptes à mots de passe connus ou suppriment des
données. Six d'entre eux refusent désormais `NODE_ENV=production` (code de sortie
1, message qui renvoie à `bootstrap.sh`), par la garde
`prisma/seeds/assert-not-production.ts` appelée en tête de script :
`create-super-admin.ts`, `seed-quick-login-users.ts`, `seed-comprehensive-data.ts`,
`seed-crm-data.ts`, `seed-tenant-members.ts` et `seed-users.ts`. Les fichiers de
secrets posent `NODE_ENV=production` (contrôlé par `deploy.sh`) : c'est ce qui
rend la garde effective dans l'image. **Les `seed-demo-*.ts` ne sont pas gardés**
([points ouverts](#points-ouverts)) ; `bootstrap.sh` n'en lance aucun.

## Première mise en service de la production

À faire dans l'ordre. Chaque étape donne la commande et son résultat attendu ;
en cas d'écart, s'arrêter et comprendre avant de continuer. Rien ici ne touche
la pile du staging, hors la mise en conformité recommandée de l'étape 0 bis.

### Étape 0 — Prérequis

**DNS.** `clients.immotopia.cloud` doit pointer vers 147.93.44.169.

```bash
getent hosts clients.immotopia.cloud
```

Résultat attendu : une ligne qui commence par `147.93.44.169`. S'il existe un
enregistrement AAAA, il doit pointer vers ce serveur aussi (le vhost écoute en
IPv6 et certbot passe par le nom).

**Ports libres.** 3020 et 5437 ne doivent servir à rien d'autre.

```bash
ss -ltnH | grep -E ':(3020|5437)\b'
```

Résultat attendu : **aucune sortie**. Si une ligne apparaît, ne pas continuer :
changer de port se fait dans `infra/environments/prod.conf` et dans le vhost par
une pull request, jamais par un remplacement dans le shell (refusé pour la
production).

**Espace disque.** Chaque pile construit ses propres images (`api`, `web`,
`migrate`) ; deux piles doublent donc l'espace des images.

```bash
df -h /var/lib/docker /home/deployer
docker system df
```

Aucun seuil n'a été mesuré. Noter l'espace libre avant et après le premier
build de la production.

**Checkout à jour, arbre propre, commit dans `origin/main`.**

```bash
cd /home/deployer/immotopia-saas
git fetch origin
git status -sb
git merge-base --is-ancestor HEAD origin/main && echo "HEAD est dans origin/main"
git log -1 --oneline
ls -l infra/scripts infra/environments
```

Résultat attendu : `git status -sb` n'affiche que la ligne d'en-tête de branche
(aucune ligne `M` ni `??` : un fichier non suivi ou modifié suffit à faire
refuser `deploy.sh prod`) ; le message `HEAD est dans origin/main` (sans
`git fetch origin`, la référence `origin/main` peut manquer : le script échoue
alors au lieu d'avertir) ; `infra/scripts` contient `backup.sh`, `bootstrap.sh`,
`check-infra.sh`, `deploy.sh`, `make-env.sh`, `restore-check.sh` et
`set-google-oauth.sh`, chacun avec le bit exécutable (`-rwxr-xr-x`) ;
`infra/environments` contient `prod.conf` et `staging.conf`. Si le checkout est
sur `main` et en retard, `git merge --ff-only origin/main` le met à jour. Le
commit affiché est celui qui sera déployé : c'est celui qui doit avoir été validé
sur le staging.

### Étape 0 bis — Mettre le staging en conformité (recommandée)

La pile `immotopia-saas` a été la production jusqu'à ADR-005. Avant d'ouvrir la
production, la remettre dans son rôle de staging, sur le même commit :

```bash
./infra/scripts/deploy.sh staging
```

Le déploiement du staging applique aussi les nouveaux contrôles à son fichier de
secrets. Si le script signale une variable absente (par exemple
`PUBLIC_ORIGIN`), une URL qui diffère de `https://app.immotopia.cloud`, une clé
critique définie plusieurs fois (voir l'étape 4), un `POSTGRES_PASSWORD` de moins
de 24 caractères ou contenant `REMPLACER`, corriger le fichier
`/home/deployer/immotopia-saas.env` à la main puis relancer avec `--no-build`
(un mot de passe Postgres trop court ne se corrige pas en éditant seulement le
fichier : voir le piège sur `POSTGRES_PASSWORD`). Il avertit aussi, sans les
afficher, des clés d'intégration renseignées. Ensuite, deux vérifications :

```bash
# Noms des intégrations qui ont une valeur dans le fichier du staging (les valeurs ne s'affichent pas).
grep -E '^(EMAIL_|WHATSAPP_|WASENDER_|TWILIO_|GOOGLE_|ANTHROPIC_|OPENROUTER_|PLATFORM_PAYSECUREHUB_(API_KEY|MERCHANT_ID))[A-Z_]*=.+' /home/deployer/immotopia-saas.env | cut -d= -f1

# Le staging ne doit pas être indexé par les moteurs de recherche.
curl -sI https://app.immotopia.cloud/ | grep -i x-robots-tag
```

Résultat attendu : la première commande ne liste que des comptes bac à sable ou
rien (chaque nom listé porte une valeur : elle ne doit jamais être un
identifiant de la production ; si c'est le cas, la retirer ou la remplacer, puis
`./infra/scripts/deploy.sh staging --no-build`). La seconde affiche
`x-robots-tag: noindex, nofollow`. Si l'en-tête manque, l'ajouter à la main dans
le bloc `server` qui écoute en 443 du vhost du staging
(`add_header X-Robots-Tag "noindex, nofollow" always;`), car certbot a déjà
réécrit ce fichier sur le serveur, puis `sudo nginx -t && sudo systemctl reload nginx`.

### Étape 1 — Créer le fichier de secrets

```bash
./infra/scripts/make-env.sh prod
```

Résultat attendu (aucun secret n'est affiché) :

```text
/home/deployer/immotopia-prod.env cree (environnement prod, pile immotopia-prod).
-rw------- 1 deployer deployer … /home/deployer/immotopia-prod.env
Longueur de JWT_SECRET : 64 caracteres (minimum requis : 32).
```

Le script refuse d'écraser un fichier existant (code de sortie 1, rien n'est
écrit).

**Sauvegarder le fichier hors du serveur, tout de suite**, dans un gestionnaire
de mots de passe : le propriétaire ouvre lui-même le fichier et l'y copie.
`PAYMENT_SECRETS_KEY` chiffre les clés de paiement enregistrées par les agences :
la perdre les rend illisibles, et les agences devraient les ressaisir. Ce fichier
n'est pas couvert par `backup.sh`.

### Étape 2 — Compléter à la main et décider des intégrations

Éditer `/home/deployer/immotopia-prod.env` (l'éditeur conserve le mode 600 ;
vérifier avec `ls -l` après).

- **Modifier la ligne existante, ne pas en ajouter une seconde.** `make-env.sh`
  livre déjà les lignes `PLATFORM_ISSUER_*`, `PLATFORM_PAYSECUREHUB_MODE`,
  `PLATFORM_PAYSECUREHUB_API_KEY`, `PLATFORM_PAYSECUREHUB_MERCHANT_ID`, `EMAIL_*`,
  `WHATSAPP_*`, `GOOGLE_*`… (vides ou à `SIMULATOR`) : en renseigner la valeur
  **sur cette ligne**, pas en fin de fichier. Docker Compose applique la
  **dernière** occurrence d'une clé ; `deploy.sh` lit lui aussi la dernière, et
  **échoue** si l'une des clés critiques `NODE_ENV`, `FRONTEND_URL`,
  `BACKEND_URL`, `PUBLIC_ORIGIN`, `CLIENT_URL`, `DATABASE_URL`, `JWT_SECRET`,
  `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` ou
  `PAYMENT_GATEWAY_SIMULATOR` y figure plus d'une fois. Les autres clés ne sont
  pas contrôlées : un doublon y passerait sans bruit et laisserait un fichier
  ambigu à la relecture.
- **Émetteur des factures d'abonnement** : `PLATFORM_ISSUER_RCCM`,
  `PLATFORM_ISSUER_TAX_ID`, `PLATFORM_ISSUER_ADDRESS` et `PLATFORM_ISSUER_PHONE`
  sont vides à la création. `deploy.sh prod` avertit (sans bloquer) si RCCM,
  compte contribuable ou adresse manquent : les mentions légales seraient absentes
  des factures. Le nom (`Alliance Consultants`) et l'e-mail
  (`support@immotopia.cloud`) sont déjà posés.
- **E-mail, en premier.** Tant que le bloc `EMAIL_*` est vide, **aucune
  invitation ni réinitialisation de mot de passe ne part**. Renseigner le service
  choisi (variables documentées dans `infra/.env.example` et
  `packages/api/env.example`) avec des identifiants **dédiés à la production**.
  Brancher les intégrations une par une et vérifier chaque envoi. `deploy.sh prod`
  avertit, sans bloquer, si une clé d'intégration est identique à celle du
  staging (voir l'étape 4).
- **WhatsApp** (`WHATSAPP_*`, `WASENDER_*`, `TWILIO_*`) : mêmes règles. **SMS** :
  `infra/.env.example` ne porte aucune variable SMS à ce jour ; à documenter
  avec le lot SMS.
- **Assistant IA** : `AI_PROVIDER=disabled` est posé à la création, l'application
  fonctionne sans clé. Activer l'assistant est une décision produit qui suppose
  d'abord la décision juridique sur le transfert de données personnelles au
  fournisseur ([SECURITY.md](../governance/SECURITY.md), section « Assistant IA » ;
  [RUNBOOK.md](RUNBOOK.md)). La clé d'API reste dans ce fichier, jamais en base ni
  dans le dépôt, et le faux fournisseur `fake` est refusé en production. Sur
  `origin/main`, le réglage saisi par le super-admin dans l'administration
  (fournisseur, modèle : il est stocké dans la base de la pile, donc propre à
  chaque environnement) prime sur `AI_PROVIDER` : à contrôler dans chaque
  environnement.
- **Paiement** : `PLATFORM_PAYSECUREHUB_MODE=SIMULATOR` à la création, sans
  `PAYMENT_GATEWAY_SIMULATOR` (donc pas de simulateur pour les paiements des
  agences). Le passage en `LIVE` se fait à l'étape 7.
- **Ne jamais laisser une valeur vide** pour `CLIENT_URL` ni
  `GOOGLE_CALLBACK_URL` : elles sont validées comme URL et une chaîne vide
  empêche l'API de démarrer. Soit une URL valide, soit la ligne commentée.

### Étape 3 — Vhost nginx et certificat

Le vhost du dépôt est la version HTTP seule, celle qui laisse certbot répondre
au challenge HTTP-01. Même schéma que `app.immotopia.cloud`
(`/etc/nginx/sites-available/`, lien dans `/etc/nginx/sites-enabled/`).

```bash
sudo cp /home/deployer/immotopia-saas/infra/nginx/clients.immotopia.cloud.conf /etc/nginx/sites-available/clients.immotopia.cloud
sudo ln -s /etc/nginx/sites-available/clients.immotopia.cloud /etc/nginx/sites-enabled/clients.immotopia.cloud
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d clients.immotopia.cloud --agree-tos -m admin@immotopia.cloud --no-eff-email --redirect
```

Résultats attendus : `nginx -t` annonce une syntaxe correcte et un test réussi ;
certbot obtient un certificat pour `clients.immotopia.cloud` et réécrit le
fichier en place (bloc `listen 443 ssl`, redirection 301 depuis le port 80). À ce
stade, `https://clients.immotopia.cloud` répond une erreur 502 : c'est normal, la
pile n'existe pas encore.

- Ne pas recopier le fichier du dépôt par-dessus après certbot : le TLS
  sauterait. La version certbot n'existe que sur le serveur.
- Ne pas toucher au vhost `immotopia.cloud` / `www.immotopia.cloud` : c'est un
  autre projet.
- Vérifier le renouvellement automatique, partagé avec les autres certificats de
  l'hôte : `sudo certbot certificates` doit lister `clients.immotopia.cloud`, et
  `sudo certbot renew --dry-run` doit réussir.

### Étape 4 — Déployer la production

À lancer hors des heures de pointe : la construction des images se fait sur la
machine qui sert déjà le staging et les autres applications.

**Deux préalables propres à la production.** Aucun autre `deploy.sh` ne doit
tourner (verrou, voir « Règles de séparation »). Et, **dès que la base est
initialisée, une sauvegarde `db-*.sql.gz` de moins de 24 heures doit exister**
dans `/home/deployer/backups/immotopia-prod` : le script échoue sinon, avec la
consigne de lancer `./infra/scripts/backup.sh prod`. **Rien n'est exigé à ce tout
premier déploiement** (la table `_prisma_migrations` n'existe pas encore, il n'y a
rien à sauvegarder) ; tous les suivants l'exigent, `--no-build` compris.

```bash
./infra/scripts/deploy.sh prod
```

Le script s'arrête au premier échec, sans rien supprimer, et peut être relancé.
Il contrôle, dans l'ordre :

1. **Verrou et git.** Un seul `deploy.sh` à la fois. En production, l'état git
   est **prouvé**, pas supposé : git doit être utilisable (dépôt présent,
   propriétaire correct, sinon « dubious ownership ») et la version identifiable.
   Ce sont des **échecs**, non des avertissements.
2. **Fichier de secrets** : présent, mode 600, variables obligatoires renseignées
   (`POSTGRES_*`, `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `FRONTEND_URL`,
   `BACKEND_URL`, `PUBLIC_ORIGIN`, `UPLOADS_DIR`). **Aucune clé critique n'y est
   définie plusieurs fois** (`NODE_ENV`, `FRONTEND_URL`, `BACKEND_URL`,
   `PUBLIC_ORIGIN`, `CLIENT_URL`, `DATABASE_URL`, `JWT_SECRET`, `POSTGRES_USER`,
   `POSTGRES_PASSWORD`, `POSTGRES_DB`, `PAYMENT_GATEWAY_SIMULATOR`) : le script lit
   la **dernière** occurrence, comme Compose, et refuse le fichier si une clé
   critique en compte deux. `POSTGRES_PASSWORD` d'au moins 24 caractères et sans
   `REMPLACER`, `JWT_SECRET` sans `REMPLACER` et d'au moins 32 caractères,
   `NODE_ENV=production`. Ces contrôles valent aussi pour le staging.
3. **Cohérence avec l'environnement** : `FRONTEND_URL`, `BACKEND_URL`,
   `PUBLIC_ORIGIN` (et `CLIENT_URL` si elle est définie) égales à
   `https://clients.immotopia.cloud` ; `DATABASE_URL` vise
   `immotopia-prod-postgres`.
4. **Ports** 3020 et 5437 libres (ou déjà tenus par cette pile).
5. **Garde-fous propres à la production**, tous des **échecs** :
   - arbre git propre (fichiers non suivis compris) ; `origin/main` présent
     (`git fetch origin`) et `HEAD` dedans ;
   - `PAYMENT_GATEWAY_SIMULATOR` valant `1`, **quelle que soit l'écriture**
     (`export PAYMENT_GATEWAY_SIMULATOR = "1"` compris) ;
   - fichier de secrets du staging lisible : il se déduit **uniquement** de
     `infra/environments/staging.conf` (jamais d'une variable du shell), et son
     illisibilité **bloque la production**, faute de pouvoir prouver
     l'unicité des secrets (mode 600, propriétaire `deployer` : l'utilisateur
     courant doit pouvoir le lire) ;
   - `JWT_SECRET`, `POSTGRES_PASSWORD` **et `PAYMENT_SECRETS_KEY`** différents de
     ceux du staging (comparaison d'empreintes, rien n'est affiché).

   Il **avertit**, sans bloquer, si une clé d'intégration (e-mail, SMTP, Twilio,
   WaSender, Google, Anthropic, OpenRouter, PaySecureHub) est identique à celle du
   staging, si `PLATFORM_PAYSECUREHUB_MODE` n'est pas `LIVE`, ou si
   `PLATFORM_ISSUER_RCCM`, `_TAX_ID` ou `_ADDRESS` sont vides.

6. **Voisins** : photographie des conteneurs qui n'appartiennent pas à la pile,
   dont ceux du staging.
7. **Construction** des trois images, puis vérification que le module natif
   `bcrypt` fonctionne dans l'image d'API (sans lui, toute connexion planterait).
   `HEAD` et l'arbre git sont **revérifiés juste avant `compose build`** : si le
   checkout a bougé depuis les contrôles (un autre utilisateur, un autre
   terminal), le script s'arrête.
8. **Base** : Postgres démarre et devient `healthy` ; le contrôle des migrations
   inconnues du dépôt ne tolère **aucune** orpheline en production (sur une base
   neuve, la table `_prisma_migrations` n'existe pas encore : rien à comparer) ;
   **si la table existe, la sauvegarde de moins de 24 heures est exigée ici**
   (elle est cherchée dans `BACKUP_DIR`, sur le disque local : la copie hors
   serveur ne compte pas) ; `HEAD` et l'arbre sont **revérifiés une seconde fois
   juste avant `prisma migrate deploy`**, puis `prisma migrate status`.
9. **Démarrage** de l'API et du web, tous deux `healthy`.
10. **Tests de fumée** sur `http://127.0.0.1:3020` : `/healthz`, `/health`, `/` et
    une route cliente (repli SPA) répondent 200. Le test HTTPS public est
    informatif : il échoue tant que le vhost et le certificat manquent.
11. **Voisins, après** : aucun conteneur voisin n'a bougé (comparaison du nom, de
    l'identifiant complet et de la date de démarrage de chaque conteneur qui n'est
    pas de la pile : un conteneur recréé ou redémarré est signalé). Le journal
    `/home/deployer/deploy-history-immotopia-prod.log` reçoit une ligne (date,
    environnement, commit, utilisateur).

Le contrôle de la sauvegarde (point 8) a lieu **après la construction des
images** (celle-ci est omise avec `--no-build`) : sans sauvegarde récente,
l'échec arrive après plusieurs minutes de build. Lancer `backup.sh prod`
**avant** `deploy.sh prod`, comme le prévoit le cycle courant.

Résultat attendu : `Deploiement prod termine (version <commit>).`, avec
« aucun conteneur voisin n'a bougé » et, si l'étape 3 est faite,
`https://clients.immotopia.cloud/ -> 200`. Les avertissements sur le mode `LIVE`
et sur les mentions de l'émetteur sont normaux tant que l'étape 7 et l'étape 2 ne
sont pas faites ; un avertissement sur des clés d'intégration identiques à celles
du staging se corrige (un compte par environnement) sans bloquer.

**Non éprouvé** : le démarrage de l'API sur une base vierge (aucun rôle, aucune
permission). Si `immotopia-prod-api` n'est pas `healthy`, le script affiche les
50 dernières lignes de son journal : les lire, ne pas contourner.

**Cas limite, non éprouvé.** Si ce premier déploiement échoue **après**
`prisma migrate deploy` (API non `healthy`, par exemple), la base est désormais
initialisée : la relance exige une sauvegarde de moins de 24 heures, donc
`./infra/scripts/backup.sh prod` d'abord. `backup.sh` exige aussi le volume
`immotopia-prod-uploads-data` ; s'il n'existe pas encore (l'API n'a jamais été
démarrée), la sauvegarde échoue à son tour : comprendre pourquoi avant toute autre
action, sans contourner le contrôle.

Vérification :

```bash
docker ps --filter name='^immotopia-prod-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
curl -s -o /dev/null -w '%{http_code}\n' https://clients.immotopia.cloud/health
```

Trois conteneurs `healthy` (`postgres` sur `127.0.0.1:5437->5432`, `api`, `web`
sur `127.0.0.1:3020->80`) et `200`.

### Étape 5 — Amorcer la base

`bootstrap.sh` lit l'état de la base, pose ce qui manque (RBAC, 12 gabarits de
type de bien, premier compte SUPER_ADMIN) et ne relance pas une étape terminée :
il est idempotent. Les gabarits sont posés si leur table est vide, le compte s'il
n'existe aucun SUPER_ADMIN. Le RBAC, lui, n'est pas jugé sur « zéro permission »
mais sur trois états :

| État du RBAC | Critère                                                                                                                                                         | Action                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| vide         | 0 permission et 0 rôle                                                                                                                                          | posé (`rbac-seed.ts`)                                                                       |
| complet      | au moins une permission, les 5 rôles clés (`PLATFORM_SUPER_ADMIN`, `TENANT_ADMIN`, `TENANT_MANAGER`, `TENANT_AGENT`, `TENANT_ACCOUNTANT`) et le marqueur de fin | ignoré : le relancer réajouterait des permissions qu'un super-admin aurait retirées         |
| incomplet    | tout autre cas, typiquement un seed interrompu en cours de route                                                                                                | complété par une relance idempotente de `rbac-seed.ts` (« RBAC incomplet : sera complété ») |

Le marqueur de fin est la dernière écriture de `rbac-seed.ts` : la permission
`BILLING_VIEW` accordée à `TENANT_ACCOUNTANT`. D'abord à blanc :

```bash
./infra/scripts/bootstrap.sh prod --dry-run
```

Résultat attendu : préconditions OK (fichier de secrets, Postgres `healthy`,
schéma Prisma présent, image `immotopia-prod-api-migrate:latest` présente), l'état
de la base (permissions, rôles avec « rôles clés : 0/5 », permissions de
`PLATFORM_SUPER_ADMIN` et de `TENANT_ADMIN`, gabarits, comptes SUPER_ADMIN, tous
attendus à 0 sur une base neuve), le plan (« sera posé » pour le RBAC et les
gabarits, « sera créé » pour le super-admin), puis
`Dry-run termine : aucun seed n'a ete lance, aucune donnee n'a ete ecrite.` Le
mode `--dry-run` n'exige pas de terminal. Un plan « RBAC incomplet : sera
complété » sur une base censée être neuve est un signal à comprendre avant de
continuer.

Puis pour de bon, dans un terminal interactif (`ssh -t`, sans redirection ni
tube) :

```bash
./infra/scripts/bootstrap.sh prod
```

**Toutes les saisies sont recueillies avant le premier seed.** Les questions ne
sont posées que s'il n'existe encore aucun SUPER_ADMIN. Dans ce cas, sans
terminal, le script échoue avant d'avoir rien écrit ; un abandon à n'importe
laquelle des questions n'écrit rien non plus. Dans l'ordre :

1. l'e-mail du super-admin, **saisi deux fois** (espaces de bord retirés, mis en
   minuscules ; deux saisies différentes arrêtent le script) ;
2. son nom affiché (par défaut `Super Administrateur`) ;
3. un récapitulatif, `Créer le SUPER_ADMIN <e-mail> (<nom>) sur <origine> ? [o/N]`
   (l'origine est ici `https://clients.immotopia.cloud`). **Seuls `o` et `O`
   poursuivent** ; toute autre réponse, y compris Entrée, abandonne ;
4. le mot de passe, **deux fois, sans écho**.

Le mot de passe est transmis par un tube à l'entrée standard du seed de création
(`create-platform-super-admin.ts`) ; il n'est jamais écrit sur disque, ni passé en
argument, ni placé dans l'environnement, ni affiché. Le script lance ensuite ce
que le plan a annoncé (RBAC, gabarits, création du compte), puis contrôle l'état
« après » : des permissions, les **5 rôles clés présents**,
**`PLATFORM_SUPER_ADMIN` et `TENANT_ADMIN` avec au moins une permission chacun**,
des gabarits et un SUPER_ADMIN, et un RBAC désormais « complet ». Résultat
attendu : `Amorcage prod termine.` ; au moindre écart, `ECHEC` et l'invitation à
relancer le script. Le mot de passe se choisit et se conserve dans le gestionnaire
de mots de passe du propriétaire.

**Mot de passe et e-mail : ce que le seed refuse, et pourquoi.** La connexion
nettoie le mot de passe **avant** de le comparer (`validate(loginSchema)`,
`packages/api/src/middleware/validation-middleware.ts`) : espaces de bord
retirés, `<` et `>` supprimés, `javascript:` supprimé (casse ignorée), motifs
`onxxx=` supprimés (`on` suivi de lettres ou de chiffres, puis `=` : par exemple
`Bonjour1=`). Un mot de passe que ce nettoyage modifierait serait haché tel que
saisi puis comparé sous sa forme nettoyée : le compte **ne pourrait jamais se
connecter**. Le seed refuse donc tout mot de passe :

- de moins de 12 caractères, ou de plus de 72 octets (limite de bcrypt) ;
- qui ne compte pas au moins une majuscule, une minuscule, un chiffre et un
  caractère spécial (robustesse de la plateforme) ;
- contenant `<`, `>`, `javascript:` ou un motif `onxxx=` ;
- commençant ou finissant par une espace (une espace au milieu est permise).

L'e-mail doit passer la même validation que la connexion (adresse usuelle en
ASCII, sans `<` ni motif `onxxx=`) ; il est mis en minuscules. Aucun message de
refus ne répète le mot de passe. Un test
(`packages/api/__tests__/unit/bootstrap-admin-input.test.ts`) exécute le vrai
middleware de connexion et échoue si ces règles cessent de le refléter.

**Conseil pratique.** Si le gestionnaire de mots de passe génère des `<` ou des
`>` (ou un `=`), régénérer en excluant ces caractères : les autres caractères
spéciaux restent permis, et il en faut au moins un.

Ces validations se font dans le seed de création, donc **après** la pose du RBAC
et des gabarits. Un refus (`Refus : …`, puis « la creation du super-admin a
echoue ») ne crée aucun compte mais laisse le RBAC et les gabarits en place, ce
qui est sans danger : relancer `./infra/scripts/bootstrap.sh prod` ne redemande
que les saisies et la création du compte.

### Étape 6 — Première connexion et première agence

Ouvrir https://clients.immotopia.cloud et se connecter avec le SUPER_ADMIN.
Vérifier que l'écran de connexion **n'affiche pas** le panneau « Comptes par
tenant ». Créer la première agence dans l'administration (Agences). Sans e-mail
configuré (étape 2), aucune invitation ne partira : brancher l'e-mail avant
d'inviter quiconque. L'abonnement d'essai d'une agence se pose avec l'outil
d'exploitation décrit dans [RUNBOOK.md](RUNBOOK.md), section « Outil
d'exploitation des abonnements (production) » (conteneur `immotopia-prod-api`).

### Étape 7 — Google OAuth et paiement

**Google OAuth.** Créer dans la console Google Cloud un client OAuth
(« Application Web ») **propre à la production**, sans réutiliser celui du
staging. Puis :

```bash
./infra/scripts/set-google-oauth.sh prod
```

Le script affiche les deux valeurs à déclarer chez Google, au caractère près
(`redirect_uri_mismatch` sinon) :

- origine JavaScript autorisée : `https://clients.immotopia.cloud` ;
- URI de redirection autorisé :
  `https://clients.immotopia.cloud/api/auth/google/callback`.

Il demande ensuite l'identifiant client (visible) et le secret (sans écho),
sauvegarde le fichier de secrets sous `immotopia-prod.env.bak-<date>` (mode 600,
à supprimer une fois le résultat validé) et ne modifie rien si une réponse est
vide. La réécriture passe par un fichier temporaire créé **à côté du fichier de
secrets** (même dossier, mode 600), remplacé par un `mv` atomique et supprimé en
fin de script même en cas d'échec : le secret n'est jamais écrit dans `/tmp`.
Appliquer, **après une sauvegarde de la base** : la base est initialisée depuis
l'étape 5, donc `deploy.sh prod` (même avec `--no-build`) exige une sauvegarde de
moins de 24 heures et refuse sans elle.

```bash
./infra/scripts/backup.sh prod
./infra/scripts/deploy.sh prod --no-build
```

Résultat attendu : le bouton Google apparaît sur l'écran de connexion (tant que
les deux valeurs sont vides, `/api/auth/google` répond 503 et le bouton est
masqué). `GOOGLE_CALLBACK_URL` reste absente : l'API la déduit de `BACKEND_URL`.

**PaySecureHub, mode LIVE.** Renseigner à la main, dans le fichier de secrets,
`PLATFORM_PAYSECUREHUB_MODE=LIVE`, `PLATFORM_PAYSECUREHUB_API_KEY` et
`PLATFORM_PAYSECUREHUB_MERCHANT_ID`, **en modifiant les lignes que `make-env.sh`
a déjà posées** (pas de seconde ligne en fin de fichier : voir l'étape 2), puis
`./infra/scripts/backup.sh prod` et `./infra/scripts/deploy.sh prod --no-build`.
L'API transmet à PaySecureHub, à chaque demande de paiement, une URL de retour
(`<FRONTEND_URL>/tenant/…`) et une URL de notification
(`<BACKEND_URL>/api/payment-gateway/paysecurehub/ipn` pour les loyers,
`…/platform-ipn` pour les abonnements) : elles suivent donc l'origine de
l'environnement. Ce que le fournisseur exige de déclarer de son côté n'est pas
vérifiable dans le dépôt : à confirmer avec lui. **Le mode LIVE n'a jamais été
validé** (voir [points ouverts](#points-ouverts)) : ne l'activer qu'après un
essai de bout en bout convenu avec le fournisseur. La signature et le filtrage
par adresse IP des notifications ne sont pas implémentés
([SECURITY.md](../governance/SECURITY.md), section « Points ouverts »).

### Étape 8 — Sauvegardes, avant toute donnée réelle

**Aucune donnée réelle ne se saisit en production avant que les cinq cases
suivantes soient cochées.** Tout est **non éprouvé** ; le détail des scripts est
dans [Sauvegarde et restauration](#sauvegarde-et-restauration).

- [ ] Une sauvegarde manuelle réussit : `./infra/scripts/backup.sh prod` (elle
      crée aussi `/home/deployer/backups`, dont le cron a besoin pour son
      journal ; la première a dû être lancée dès l'étape 7, avant
      `deploy.sh prod --no-build`). Elle avertit qu'il n'existe aucune copie hors
      serveur tant que l'étape suivante n'est pas faite.
- [ ] Une copie hors serveur est configurée : rclone installé et configuré pour
      `deployer` (de préférence un remote chiffré, les sauvegardes contenant
      toutes les données), `BACKUP_RCLONE_REMOTE=<remote>:<chemin>` posée dans la
      crontab. Une exécution manuelle avec cette variable finit sur
      `copie hors serveur terminee`, sans ligne `ATTENTION`.
- [ ] Le cron est en place (`crontab -e` en tant que `deployer`, voir ci-dessous),
      et son premier passage de nuit a laissé les deux fichiers du jour et un
      journal sans `ECHEC` ni `ATTENTION`.
- [ ] Un `restore-check.sh` a réussi **sur un dump récupéré depuis la copie hors
      serveur** (pas sur le fichier local) : c'est cette preuve, et non l'existence
      du fichier, qui compte.
- [ ] Le fichier de secrets de la production est conservé hors serveur (étape 1).

Le cron, dans la crontab de `deployer` :

```cron
BACKUP_RCLONE_REMOTE=<remote>:<chemin>
15 2 * * * cd /home/deployer/immotopia-saas && ./infra/scripts/backup.sh prod >> /home/deployer/backups/prod-cron.log 2>&1
```

Le `PATH` d'un cron est réduit : vérifier que `docker` et `rclone` y sont
trouvés (`command -v docker rclone`, généralement dans `/usr/bin`). Le cron lance
la version du script présente dans le checkout à ce moment-là : un checkout placé
sur un commit qui n'a pas `backup.sh` fait échouer la sauvegarde, en silence hors
lecture du journal. L'heure est celle du serveur.

Le cron sert aussi le déploiement : `deploy.sh prod` refuse de migrer sans un
`db-*.sql.gz` de moins de 24 heures dans `BACKUP_DIR`. Un cron en échec depuis
plus d'un jour se révélera donc au prochain déploiement (par ce refus), pas
avant : ce n'est pas une alerte, et il n'y en a pas d'autre (voir les
[points ouverts](#points-ouverts)). Une sauvegarde de nuit ne dispense pas de
`backup.sh prod` juste avant un déploiement : les migrations ne se défont pas.

### Étape 9 — Vérifier que le staging n'a pas bougé

```bash
docker ps --filter name='^immotopia-saas-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
curl -s -o /dev/null -w '%{http_code}\n' https://app.immotopia.cloud/
tail -n 3 /home/deployer/deploy-history-immotopia-saas.log
```

Résultat attendu : les trois conteneurs `immotopia-saas-*` `healthy`, avec une
durée de fonctionnement inchangée (pas « Up 2 minutes » alors que personne n'a
déployé le staging), `127.0.0.1:3019->80` et `127.0.0.1:5436->5432`, et `200`.
`deploy.sh prod` a déjà comparé la liste des conteneurs voisins avant et après.

## Cycle courant

Le staging d'abord, la production ensuite, **sur le même commit**.

1. **Fusionner** la pull request dans `main` (décision de l'utilisateur), CI
   verte, job `infra` compris.
2. **Placer le checkout** sur le commit voulu d'`origin/main`
   (`git fetch origin`, puis `git merge --ff-only origin/main` si le checkout
   suit `main`) et noter `git rev-parse --short HEAD`. Si la fusion a créé un
   nouveau commit, c'est lui qui se valide, pas celui de la branche.
3. **Déployer le staging** : `./infra/scripts/deploy.sh staging`. Il n'exige ni
   arbre propre ni commit dans `origin/main` (un essai avant fusion reste
   possible), mais le checkout étant partagé, le déplacer change ce que la
   prochaine construction de la production emploierait : avant tout déploiement
   de production, le remettre sur le commit validé.
4. **Valider sur le staging** (liste ci-dessous).
5. **Sauvegarder la production, juste avant** : `./infra/scripts/backup.sh prod`.
   Les migrations ne se défont pas : c'est cette sauvegarde qui permet de revenir
   en arrière. Ce n'est plus seulement une bonne pratique : **`deploy.sh prod`
   échoue** si la base est déjà initialisée et qu'aucun `db-*.sql.gz` de moins de
   24 heures n'existe dans `BACKUP_DIR` (contrôle fait après la construction des
   images, juste avant les migrations).
6. **Étiqueter les images actuelles** pour un retour arrière (`deploy.sh` les
   reconstruit sous l'étiquette `latest`, l'ancienne image serait perdue) :

   ```bash
   docker tag immotopia-prod-api:latest immotopia-prod-api:avant-AAAAMMJJ
   docker tag immotopia-prod-web:latest immotopia-prod-web:avant-AAAAMMJJ
   ```

7. **Déployer la production** sur le même commit, hors heures de pointe :
   `./infra/scripts/deploy.sh prod`. Vérifier que le commit affiché est celui du
   staging : `tail -n 1 /home/deployer/deploy-history-immotopia-saas.log`
   (troisième colonne) doit égaler `git rev-parse --short HEAD`. Ne rien faire
   d'autre dans le checkout pendant ce temps (pas de `git checkout`, pas de
   fichier créé, pas de second `deploy.sh`) : le script vérifie que `HEAD` et
   l'arbre n'ont pas bougé juste avant la construction et juste avant les
   migrations, et s'arrête sinon.
8. **Constater** : `Deploiement prod termine`, « aucun conteneur voisin n'a
   bougé », `https://clients.immotopia.cloud/ -> 200`, puis un parcours rapide
   des écrans touchés.

Le journal de chaque pile est `/home/deployer/deploy-history-<pile>.log`, une
ligne par déploiement réussi, séparée par des tabulations : date ISO,
environnement, commit, utilisateur.

### Checklist de validation sur le staging

- `deploy.sh staging` se termine sur `Deploiement staging termine (version …)`,
  sans avertissement inexpliqué.
- L'état des migrations affiche `Database schema is up to date!`.
- https://app.immotopia.cloud répond, une connexion avec un compte de test
  réussit, les écrans et parcours touchés par le changement fonctionnent.
- Aucune nouvelle erreur dans le journal d'erreurs de l'API :
  `docker exec immotopia-saas-api tail -n 50 /app/logs/error.log`.
- Si le changement ajoute des migrations : les relire (elles s'exécuteront sur
  les données réelles de la production) et savoir dire si l'ancienne image y
  survivrait (voir le retour arrière ci-dessous).
- Si le changement touche `infra/`, `docker-compose.prod.yml` ou un réglage
  d'environnement : `bash infra/scripts/check-infra.sh` est vert.

### Retour arrière (non éprouvé)

Les images se remettent à l'étiquette précédente ; la base, elle, n'est pas
défaite.

```bash
docker tag immotopia-prod-api:avant-AAAAMMJJ immotopia-prod-api:latest
docker tag immotopia-prod-web:avant-AAAAMMJJ immotopia-prod-web:latest
./infra/scripts/deploy.sh prod --no-build
```

- **Une sauvegarde de moins de 24 heures doit exister**, même avec `--no-build` :
  celle qui a précédé le déploiement (étape 5 du cycle) convient tant qu'elle a
  moins de 24 heures ; sinon `./infra/scripts/backup.sh prod` d'abord.
- **Laisser le checkout sur le commit déployé.** Le remettre sur l'ancien commit
  ferait voir à `deploy.sh prod` les migrations déjà appliquées comme
  « orphelines » (absentes du dépôt), et la production n'en tolère aucune : le
  script refuserait.
- L'ancienne image n'est sûre que si les migrations appliquées sont compatibles
  avec l'ancien code (ajouts de colonnes ou de tables, par exemple). Sinon, la
  seule issue est de restaurer la sauvegarde d'avant déploiement (voir plus bas),
  au prix des données saisies depuis.
- Supprimer les anciennes étiquettes `avant-*` une fois la version validée
  (`docker rmi immotopia-prod-api:avant-AAAAMMJJ`, qui ne retire que l'étiquette
  tant que l'image sert ailleurs). En garder les deux ou trois dernières.

### Modifier une variable d'environnement

Éditer le fichier de secrets de la pile (en **modifiant la ligne existante**, sans
en ajouter une seconde : voir l'étape 2), puis recréer les conteneurs sans
reconstruire :

```bash
./infra/scripts/deploy.sh <staging|prod> --no-build
```

En production, une sauvegarde de moins de 24 heures doit exister avant
(`./infra/scripts/backup.sh prod`), même avec `--no-build`.

Le front étant figé à la compilation, un changement de `PUBLIC_ORIGIN` ou de
`VITE_SHOW_DEMO_ACCOUNTS` (dans `infra/environments/<env>.conf`) impose un
déploiement **avec** construction.

### Bascules de configuration risquées

`SUBSCRIPTION_ENFORCEMENT` et `TENANT_GUARD_MODE` passent de `warn` (journalise
sans bloquer) à `enforce` (bloque). Toujours dans cet ordre :

1. Sur le staging : poser `enforce` dans `/home/deployer/immotopia-saas.env`,
   `./infra/scripts/deploy.sh staging --no-build`.
2. Utiliser l'application sur les parcours réels, puis lire les avertissements
   restants : `docker exec immotopia-saas-api grep -E 'Tenant guard|Subscription guard|Subscription quota' /app/logs/combined.log`.
3. Si rien d'anormal : la même bascule sur la production, avec une sauvegarde
   juste avant.

Ne jamais commencer par la production. Avec `warn`, aucun refus ne se produit :
seul le journal dit ce qui aurait été refusé. `make-env.sh` livre `warn` dans les
deux environnements : tant que la bascule n'est pas faite, le filet
multi-tenant et les quotas d'abonnement de la production ne bloquent rien (voir
les [points ouverts](#points-ouverts)).

## Sauvegarde et restauration

### Ce que produit `backup.sh` (non éprouvé)

```bash
./infra/scripts/backup.sh <staging|prod>
```

Dans `BACKUP_DIR` (`/home/deployer/backups/<pile>`, réglé dans
`infra/environments/<env>.conf`, dossier en mode 700, fichiers en 600) :

| Fichier                          | Contenu                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `db-AAAA-MM-JJ-HHMM.sql.gz`      | `pg_dump --no-owner --no-privileges` de la base, en SQL, compressé                  |
| `uploads-AAAA-MM-JJ-HHMM.tar.gz` | archive du volume `<pile>-uploads-data` (documents téléversés), lu en lecture seule |

Vérifications avant de valider un fichier : `gzip -t`, taille non nulle, présence
du marqueur de fin de `pg_dump` (un dump tronqué est refusé), `tar -tzf` sur
l'archive des documents. Un fichier partiel est supprimé, jamais conservé. Les
identifiants de la base sont lus dans l'environnement du conteneur, jamais sur la
ligne de commande. Un verrou (`flock`) empêche deux sauvegardes de la même pile de
se chevaucher. Code de sortie non nul au moindre échec.

- **Rotation** : les fichiers plus vieux que `BACKUP_KEEP_DAYS` (14 jours par
  défaut) qui correspondent **exactement** aux deux motifs ci-dessus sont
  supprimés, directement dans `BACKUP_DIR` ; rien d'autre. Elle ne concerne que
  le disque local : le script ne purge jamais la copie hors serveur.
- **Copie hors serveur** : si `BACKUP_RCLONE_REMOTE` est définie (par exemple
  `s3crypt:immotopia`), les deux fichiers sont copiés avec `rclone copy` vers
  `<remote>/<pile>/`. Sinon le script avertit qu'il n'existe **aucune** copie
  hors serveur. Cette variable ne vient pas de `<env>.conf` (elle dépend du
  compte rclone du serveur) : elle se pose dans la crontab ou devant la commande.
  Le script ne vérifie pas que le remote est chiffré (type `crypt`) : c'est à
  l'opérateur de le contrôler (`rclone config show <remote>`).
- **Cohérence** : la base est un instantané cohérent, mais les documents sont
  archivés juste après : un document ajouté entre les deux peut manquer à l'un
  des deux fichiers. Toujours restaurer la paire du même horodatage.
- **Ce que `backup.sh` ne sauvegarde pas** : le fichier de secrets (à conserver
  hors serveur, étape 1), le volume des journaux (`<pile>-api-logs`), la
  configuration nginx et les certificats, la crontab, la configuration rclone, et
  tout dossier `assets/` créé dans le conteneur d'API (voir
  [points ouverts](#points-ouverts)).

### `restore-check.sh` (non éprouvé)

```bash
./infra/scripts/restore-check.sh /home/deployer/backups/immotopia-prod/db-AAAA-MM-JJ-HHMM.sql.gz
```

Vérifie qu'un dump **se rejoue**, sans toucher à aucune pile : conteneur
`postgres:16-alpine` jetable (`immotopia-restorecheck-<pid>`), restauration avec
`ON_ERROR_STOP=1`, puis suppression du conteneur en toute circonstance.
Résultat attendu : `Restauration reussie`, le nombre de tables du schéma
`public`, le nombre de lignes de `_prisma_migrations` et le nom de la dernière
migration. Code de sortie non nul si la restauration échoue ou si aucune table
n'est restaurée.

Ce conteneur contient une **copie complète de la base** (donc de la production,
si c'est son dump) et tourne en authentification `trust` (aucun mot de passe). Il
est donc isolé :

- **aucun réseau** (`--network none`) : il est injoignable de l'hôte comme des
  autres conteneurs. Ce n'est pas seulement l'absence de port publié, puisqu'un
  conteneur sans port publié reste atteignable par son adresse IP sur le réseau
  Docker par défaut. Seul `docker exec`, par la socket unix de Docker, y accède ;
- **volume supprimé avec lui** : l'image `postgres` déclare un volume anonyme
  pour ses données ; le script supprime le conteneur par `docker rm -f -v`, ce qui
  emporte aussi ce volume. Il n'y a donc **rien à nettoyer** avec
  `docker volume prune`, commande interdite sur ce serveur (voir les pièges) ;
- **suppression vérifiée** : le script n'écrit « conteneur jetable … et son
  volume supprimes » qu'après avoir constaté que le conteneur n'existe plus. S'il
  existe encore, il **avertit** et donne la commande à lancer à la main :
  `docker rm -f -v immotopia-restorecheck-<pid>`. Une telle ligne
  `ATTENTION` se traite tout de suite : la copie de la production y est
  restée.

Il prouve que le dump est lisible et complet en structure ; il ne prouve ni que
les données sont à jour, ni que l'archive des documents est bonne (pour celle-ci,
`tar -tzf` sur le fichier).

### Restauration réelle (non éprouvée, à répéter sur le staging)

**Cette procédure n'a jamais été exécutée.** À répéter sur le staging (données de
test) avant d'en avoir besoin en production : `backup.sh staging`, puis les
étapes ci-dessous avec les noms `immotopia-saas-*`,
`/home/deployer/backups/immotopia-saas` et `deploy.sh staging --no-build`. Ne
jamais restaurer le dump d'une pile dans l'autre.

Elle s'appuie sur ce que font les scripts : le dump est du SQL simple, **sans**
`CREATE DATABASE` ni `DROP` : il doit se rejouer dans une base **vide**. Or
`deploy.sh` crée déjà le schéma dans la base courante : d'où l'étape qui met de
côté la base existante. Exemple pour la production ; `AAAA-MM-JJ-HHMM` est
l'horodatage de la paire de fichiers choisie.

1. **Décider, prévenir, choisir la paire.** Les fichiers sont dans
   `/home/deployer/backups/immotopia-prod` ; si le disque est perdu, les
   récupérer depuis la copie hors serveur avec `rclone copy` vers un dossier en
   mode 700. Vérifier d'abord le dump avec `restore-check.sh` (sans effet sur la
   pile). Si la pile tourne encore et que sa base est lisible, prendre une
   sauvegarde de l'état actuel : `./infra/scripts/backup.sh prod`.

2. **Arrêter l'API et le web** (Postgres reste en marche) :

   ```bash
   docker stop immotopia-prod-web immotopia-prod-api
   ```

   `restart: unless-stopped` ne les relance pas après un arrêt manuel.

3. **Mettre de côté la base actuelle et en créer une vide** (le renommage
   exige qu'aucune session ne soit ouverte sur la base) :

   ```bash
   docker exec immotopia-prod-postgres sh -c \
     'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "ALTER DATABASE \"$POSTGRES_DB\" RENAME TO \"${POSTGRES_DB}_avant_restauration\""'
   docker exec immotopia-prod-postgres sh -c \
     'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$POSTGRES_DB\""'
   ```

   L'ancienne base reste sur le volume, sous le nom `<base>_avant_restauration`,
   jusqu'à ce que le propriétaire la supprime volontairement, après validation.

4. **Rejouer le dump dans la base vide** :

   ```bash
   gzip -dc /home/deployer/backups/immotopia-prod/db-AAAA-MM-JJ-HHMM.sql.gz \
     | docker exec -i immotopia-prod-postgres sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null
   ```

   Résultat attendu : aucune erreur. À la première erreur, `ON_ERROR_STOP` arrête
   tout et la base est à moitié restaurée : la supprimer et la recréer vide (en
   vérifiant deux fois le nom : jamais `_avant_restauration`), comprendre
   l'erreur, recommencer.

5. **Contrôler la base restaurée** :

   ```bash
   docker exec immotopia-prod-postgres sh -c \
     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM _prisma_migrations" -c "SELECT count(*) FROM users"'
   ```

6. **Documents** (seulement si le volume est perdu ou corrompu) : extraire
   l'archive de la **même paire** dans le volume.

   ```bash
   docker run --rm -v immotopia-prod-uploads-data:/d -v /home/deployer/backups/immotopia-prod:/b:ro \
     alpine tar xzf /b/uploads-AAAA-MM-JJ-HHMM.tar.gz -C /d
   ```

   L'extraction ajoute et écrase, elle ne supprime rien : les fichiers ajoutés
   depuis la sauvegarde restent. Le propriétaire des fichiers doit être celui de
   l'utilisateur `node` du conteneur d'API (comparer
   `docker exec immotopia-prod-api id` avec
   `docker run --rm -v immotopia-prod-uploads-data:/d alpine ls -ln /d`).

7. **Redémarrer** avec les contrôles du script :

   ```bash
   ./infra/scripts/deploy.sh prod --no-build
   ```

   Si le dump est plus ancien que le code déployé, `migrate deploy` applique les
   migrations manquantes à la base restaurée : c'est attendu. La base restaurée
   étant initialisée, `deploy.sh prod` exige un `db-*.sql.gz` de **moins de 24
   heures** dans `BACKUP_DIR` : la sauvegarde de l'état actuel de l'étape 1 le
   satisfait ; si la pile était perdue et que cette sauvegarde n'existe pas (un
   dump ramené de la copie hors serveur peut avoir plus de 24 heures), lancer
   `./infra/scripts/backup.sh prod` sur la base restaurée juste avant. Non
   éprouvé.

8. **Constater** : connexion, quelques agences et documents ouverts, tests de
   fumée du script au vert. Après plusieurs jours sans incident, supprimer
   volontairement la base `<base>_avant_restauration`.

**Si toute la pile est perdue** (disque, volumes) : retrouver d'abord le fichier
de secrets sauvegardé hors serveur (même `PAYMENT_SECRETS_KEY`), le remettre en
place en mode 600, `./infra/scripts/deploy.sh prod` recrée une pile à schéma
neuf, puis reprendre les étapes 2 à 8 ci-dessus.

## Différences de configuration, staging et production

| Réglage                                                     | Staging                                                       | Production                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Origine (`PUBLIC_ORIGIN`, `FRONTEND_URL`, `BACKEND_URL`)    | `https://app.immotopia.cloud`                                 | `https://clients.immotopia.cloud`                                   |
| `NODE_ENV`                                                  | `production`                                                  | `production` (mêmes contrôles au démarrage sur les deux piles)      |
| `VITE_SHOW_DEMO_ACCOUNTS` (figé dans l'image web)           | `true`                                                        | `false`                                                             |
| `PAYMENT_GATEWAY_SIMULATOR`                                 | `1`                                                           | absent, `deploy.sh prod` refuse `1`                                 |
| `PLATFORM_PAYSECUREHUB_MODE`                                | `SIMULATOR`                                                   | `SIMULATOR` à la création, puis `LIVE` (avertissement tant que non) |
| E-mail, WhatsApp, Google OAuth                              | vides ou bac à sable, client OAuth propre                     | identifiants réels dédiés, client OAuth propre                      |
| Clés d'intégration (contrôle de `deploy.sh`)                | avertissement si l'une est renseignée                         | avertissement si l'une est identique à celle du staging             |
| Assistant IA (`AI_PROVIDER`)                                | `disabled`, ou clé propre au staging                          | selon le choix produit ; `fake` refusé sur les deux                 |
| `TENANT_GUARD_MODE`, `SUBSCRIPTION_ENFORCEMENT`             | `warn` à la création ; on bascule ici d'abord                 | `warn` à la création ; `enforce` seulement après le staging         |
| `JWT_SECRET`, mot de passe Postgres, `PAYMENT_SECRETS_KEY`  | propres à la pile                                             | propres à la pile, distincts de ceux du staging (échec sinon)       |
| Migrations orphelines tolérées                              | celles de `migrations-orphelines-connues.txt`                 | aucune                                                              |
| Arbre git propre et `HEAD` dans `origin/main` (`deploy.sh`) | non exigés                                                    | exigés, revérifiés avant la construction et avant les migrations    |
| Sauvegarde `db-*.sql.gz` de moins de 24 h avant de migrer   | non exigée                                                    | exigée dès que la base est initialisée (pas au premier déploiement) |
| En-tête `X-Robots-Tag: noindex, nofollow`                   | prévu par le vhost du dépôt, à ajouter à la main côté serveur | non posé                                                            |
| `BACKUP_DIR`, `BACKUP_KEEP_DAYS`                            | `/home/deployer/backups/immotopia-saas`, 14                   | `/home/deployer/backups/immotopia-prod`, 14                         |

Comment vérifier, en lecture seule, depuis le serveur :

```bash
# Réglages non secrets des deux fichiers (aucun secret dans cette liste).
grep -E '^(NODE_ENV|FRONTEND_URL|BACKEND_URL|CLIENT_URL|PUBLIC_ORIGIN|PAYMENT_GATEWAY_SIMULATOR|PLATFORM_PAYSECUREHUB_MODE|AI_PROVIDER|TENANT_GUARD_MODE|SUBSCRIPTION_ENFORCEMENT)=' \
  /home/deployer/immotopia-saas.env /home/deployer/immotopia-prod.env

# PAYMENT_SECRETS_KEY distincte : deux empreintes différentes (pas la clé).
for e in saas prod; do grep -E '^PAYMENT_SECRETS_KEY=' /home/deployer/immotopia-$e.env | sha256sum | cut -c1-12; done

# Ports et conteneurs, volumes, réseaux : chaque pile a les siens.
docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep immotopia-
docker volume ls --filter name=immotopia-
docker network ls --filter name=immotopia-

# En-têtes de sécurité du nginx embarqué (éprouvé en local sur l'image ; à confirmer
# derrière le nginx de l'hôte, en HTTPS) : trois lignes par requête,
# un seul exemplaire de chaque en-tête, sur le SPA comme sur l'API.
for h in app clients; do
  for p in / /health; do
    curl -s -D - -o /dev/null "https://$h.immotopia.cloud$p" | grep -iE '^(x-content-type-options|x-frame-options|referrer-policy):'
  done
done
```

`JWT_SECRET`, `POSTGRES_PASSWORD` et `PAYMENT_SECRETS_KEY` sont déjà comparés par
`deploy.sh prod`, qui échoue s'ils sont identiques à ceux du staging. Le panneau
de démo se vérifie à l'écran de connexion, et le bundle de production est refusé
au build s'il contient un identifiant de démonstration (`Dockerfile.web`). Sans
serveur, `bash infra/scripts/check-infra.sh` prouve sur le rendu Compose que les
noms et les ports des deux piles sont disjoints.

## Commandes de lecture

Sans effet sur les piles :

```bash
docker ps --filter name='^immotopia-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker logs --tail 100 immotopia-prod-api
docker exec immotopia-prod-api tail -n 50 /app/logs/error.log
tail -n 5 /home/deployer/deploy-history-immotopia-prod.log
docker stats --no-stream
ls -lh /home/deployer/backups/immotopia-prod
```

## Pièges

- **Jamais `docker volume prune`, `docker system prune -a`,
  `docker image prune -a` ni `docker compose down -v`** sur ce serveur. Ces
  commandes agissent sur tout l'hôte, pas sur une pile : `volume prune` supprime
  tout volume qu'aucun conteneur n'utilise (données, documents), `system prune -a`
  et `image prune -a` toute image inutilisée (dont les images `avant-*` du retour
  arrière), et `down -v` les volumes de la pile. `deploy.sh` ne supprime jamais un
  volume et ne touche à rien dont le nom ne commence pas par celui de la pile.
- **Les `VITE_*` sont figés au build.** Origine de l'API et panneau de démo ne se
  changent pas par une variable d'exécution : une image web est propre à un
  environnement. `Dockerfile.web` n'a plus de valeur par défaut pour l'origine
  (un build sans elle échoue au lieu de viser la mauvaise origine) et masque le
  panneau par défaut.
- **Le build Docker se fait sur la machine qui sert la production** et les autres
  applications : le lancer hors des heures de pointe, et surveiller
  `docker stats --no-stream` pendant et après (aucune limite de CPU ou de mémoire
  n'est posée : voir les points ouverts).
- **Scripts GNU/Linux uniquement** (`stat -c`, `find -printf`, `ss`) : ne pas les
  lancer depuis macOS ni depuis un autre système. Seul `check-infra.sh` est prévu
  hors serveur.
- **Un fichier non suivi ou modifié dans le checkout bloque `deploy.sh prod`** (il
  exige un arbre propre, fichiers non suivis compris, et le revérifie juste avant
  la construction et avant les migrations). Le déplacer hors du dépôt. Le verrou
  de `deploy.sh` est justement posé hors du dépôt (`/tmp/immotopia-deploy.lock`)
  pour ne pas produire un tel fichier.
- **Modes des scripts : ils viennent du dépôt, pas d'un `chmod` local.** Les
  scripts `infra/scripts/*.sh` doivent être suivis en **mode 100755** dans l'index
  git ; `check-infra.sh` le vérifie (en CI comme en local). Un script suivi en
  100644 n'est pas exécutable après un `git clone` ou un `git pull` :
  `./infra/scripts/backup.sh prod`, donc le cron, échouerait en « Permission
  denied ». À l'inverse, **sur le serveur, ne pas poser de `chmod +x` à la
  main** : avec `core.fileMode=true` (le réglage usuel sous Linux), un mode
  différent de celui de l'index rend l'arbre « sale » (ligne `M`) et
  `deploy.sh prod` refuse. Un script non exécutable se corrige dans le dépôt
  (`git add --chmod=+x infra/scripts/<script>.sh`, puis une pull request), pas
  sur le serveur.
- **Ajouter une clé à la fin du fichier de secrets ne la remplace pas.** Compose
  applique la dernière occurrence ; `deploy.sh` refuse le fichier si une clé
  critique y est définie plusieurs fois. Modifier la ligne existante (voir
  l'étape 2).
- **Un mot de passe de super-admin que la connexion modifierait est refusé.** Le
  seed de `bootstrap.sh` refuse `<`, `>`, `javascript:`, un motif `onxxx=` (par
  exemple `Bonjour1=`) et les espaces de bord, parce que la connexion les retire
  avant de comparer : le compte ne pourrait jamais se connecter. Le refus arrive
  **après** la pose du RBAC et des gabarits, sans danger (voir l'étape 5).
- **Le refus de sauvegarde récente arrive après la construction.** Sans
  `db-*.sql.gz` de moins de 24 heures, `deploy.sh prod` s'arrête juste avant les
  migrations, donc après plusieurs minutes de build : sauvegarder d'abord.
- **En-têtes de sécurité du nginx embarqué (`infra/nginx/spa.conf`).** Le serveur
  pose `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` et
  `Referrer-Policy: strict-origin-when-cross-origin` sur les deux piles. Dans
  nginx, **un `add_header` défini dans un `location` annule tout l'héritage** des
  `add_header` du niveau supérieur : ces trois lignes sont donc répétées dans
  chaque `location` qui en définit déjà un (`/healthz`, `/assets/`, `/fonts/`,
  icônes, `/index.html`), et tout nouveau `location` avec `add_header` doit faire
  de même, sous peine de perdre silencieusement les en-têtes sur ses réponses.
  Pour `/api/`, `/uploads/` et `/health`, nginx **masque** (`proxy_hide_header`)
  ceux que Helmet pose déjà, afin de n'en émettre qu'un jeu. Configuration
  éprouvée en local sur l'image (voir « Éprouvé et non éprouvé ») ; la commande de
  « Différences de configuration » la confirme derrière le nginx de l'hôte, en
  HTTPS, sur les deux domaines.
- **Le build de la production échoue si le bundle contient un identifiant de
  démonstration.** `Dockerfile.web` cherche `Admin@123456` et `DevMick@2003` dans
  le bundle quand `VITE_SHOW_DEMO_ACCOUNTS` n'est pas `true`. Ces deux valeurs
  viennent de `apps/web/src/dev/dev-accounts.ts` : si elles y changent (ou si un
  compte de démonstration est ajouté), **mettre à jour la liste dans le
  `Dockerfile.web`**, sinon le garde-fou ne verrait plus la nouvelle valeur.
- **Les seeds de développement refusent la production** (`NODE_ENV=production`,
  code de sortie 1) : `create-super-admin.ts`, `seed-quick-login-users.ts`,
  `seed-comprehensive-data.ts`, `seed-crm-data.ts`, `seed-tenant-members.ts`,
  `seed-users.ts`. Ne pas tenter de les contourner ; amorcer avec
  `bootstrap.sh`. Les `seed-demo-*.ts` ne sont pas gardés (points ouverts).
- **Un seul checkout pour deux piles** : déplacer le dépôt sur un autre commit
  pour le staging change ce que le prochain déploiement de la production
  construirait. Avant la production, toujours revenir au commit validé.
- **La liste des migrations orphelines ne vaut que pour le staging.**
  `infra/scripts/migrations-orphelines-connues.txt` (la migration
  `20260927080000_mouvements_fonds_copropriete`, voir
  [ADR-003](../architecture/adr/ADR-003-migration-hors-git-fonds-copropriete.md))
  décrit la pile `immotopia-saas`. La base neuve de la production n'a pas cette
  ligne et `deploy.sh prod` ignore le fichier.
- **Changer `POSTGRES_PASSWORD` après le premier démarrage ne change pas le mot de
  passe de la base** (il n'est lu qu'à l'initialisation du volume) : il faut un
  `ALTER USER`, sinon l'API ne se connecte plus. `deploy.sh` exige au moins 24
  caractères et refuse `REMPLACER`, sur les deux piles : un mot de passe plus
  court, sur une pile déjà initialisée, se change d'abord dans Postgres
  (`ALTER USER`), puis dans le fichier. De même, régénérer un fichier de
  secrets sur une pile en marche rendrait illisibles les clés de paiement
  (`PAYMENT_SECRETS_KEY`) et invaliderait les sessions (`JWT_SECRET`) :
  `make-env.sh` refuse d'écraser pour cette raison.
- **« Vide » n'est pas « absent »** pour `CLIENT_URL` et `GOOGLE_CALLBACK_URL` :
  une chaîne vide empêche l'API de démarrer (validation d'URL).
- **Fins de ligne** : un script ou un `.conf` copié à la main depuis Windows peut
  porter des CRLF (`bash\r`, valeurs corrompues). Passer par git (`.gitattributes`
  force LF pour `*.sh`, `infra/environments/*.conf` et les listes de migrations).
  `infra/scripts/strip-crlf.py` reste un outil de dépannage, qui réécrit sur place
  les fichiers de `/home/deployer/immotopia-saas/infra`.
- **Les ports de développement (8001, 3000, 5432) ne sont pas ceux du serveur.**
  Le `docker-compose.yml` de la racine est un outil de développement : ne jamais
  le déployer.

## Points ouverts

Non résolus à la date de rédaction :

- **Géographie de la Côte d'Ivoire non amorcée.** `bootstrap.sh` ne lance pas
  `db:seed:geographic` : la recherche de communes est vide. Non bloquant.
- **Gabarits DOCX globaux (baux, quittances) non amorcés, et écriture sous
  `<cwd>/assets/` impossible dans l'image : CONFIRMÉ le 2026-09-29.**
  `bootstrap.sh` ne lance pas `db:seed:document-templates`. Les `.docx` sources
  sont dans `assets/modeles_documents/` du dépôt, mais `packages/api/Dockerfile`
  ne copie aucun dossier `assets/` dans ses images. Le code lit et écrit sous
  `<cwd>/assets/` (`modeles_documents`, `generated_documents`) ; dans l'image
  runtime le répertoire courant est `/app`, qui appartient à `root`, alors que le
  conteneur tourne sous l'utilisateur `node`. Mesuré sur une image construite en
  local : `mkdir /app/assets` répond « Permission denied » et `/app/assets`
  n'existe pas. La génération d'un bail ou d'une quittance et l'import d'un
  gabarit par une agence échouent donc très probablement aussi sur le staging
  actuel. Même en créant le dossier, il vivrait dans la couche du conteneur
  (perdu à chaque recréation) et hors sauvegarde. Correction confiée à une tâche
  séparée (variable de dossier, volume nommé sauvegardé, gabarits livrés) ;
  **ne pas promettre les contrats de bail ni les quittances à un client avant
  qu'elle soit livrée et vérifiée sur le staging.**
- **34 paramètres fiscaux livrés en statut `A_VALIDER`** (référentiel
  `TaxParameter`, migration `20261002143700_patrimoine_p4_entites_fiscalite`) :
  validation métier à obtenir avant de présenter les estimations à un client.
- **Mode LIVE de PaySecureHub jamais validé**, et signature ou filtrage IP des
  notifications non implémentés
  ([SECURITY.md](../governance/SECURITY.md), « Points ouverts »).
- **Aucune limite de CPU ni de mémoire** dans le compose. Mesurer d'abord
  (`docker stats --no-stream` en charge normale, pendant un build) avant d'en
  imposer, pour ne pas étrangler une pile.
- **Second serveur** : la production partage Docker, disque, processeur, mémoire,
  nginx et certbot avec le staging et les autres applications
  ([ADR-005](../architecture/adr/ADR-005-environnements-staging-production.md),
  « Alternatives écartées »). À reconsidérer dès que la production porte de vrais
  clients ou que la charge l'exige.
- **Limiteurs de débit en mémoire, par instance** : ils se remettent à zéro à
  chaque redémarrage et se multiplieraient avec plusieurs instances d'API. Sans
  effet tant qu'il n'y a qu'une instance par pile.
- **Aucune alerte de sauvegarde** : un cron qui échoue n'avertit personne. La
  lecture du journal `prod-cron.log` est manuelle ; le seul garde-fou est le
  refus de `deploy.sh prod` sans dump de moins de 24 heures, qui ne se produit
  qu'au déploiement suivant.
- **Postgres de la production publié sur `127.0.0.1:5437` sans usage.** Tous les
  scripts (`deploy.sh`, `backup.sh`, `bootstrap.sh`, `restore-check.sh`) passent
  par `docker exec` ou par le réseau Compose, jamais par ce port : c'est une
  surface locale inutile (tout processus de l'hôte peut atteindre ce port). À
  retirer par un override Compose propre à la production, le compose étant
  partagé par les deux piles ; non fait ici.
- **Images de base flottantes** : `node:20-alpine`, `nginx:1.27-alpine`,
  `postgres:16-alpine` et `alpine` sont référencées par étiquette, pas par
  empreinte (`@sha256:…`). Un build ou un `--pull` peut changer leur contenu sans
  qu'aucun fichier du dépôt ne change. À épingler par digest, avec une mise à jour
  volontaire et relue.
- **Copies rclone sans rotation ni contrôle du remote.** `backup.sh` copie avec
  `rclone copy` sans jamais purger la copie hors serveur (elle grossit sans
  limite), et rien ne vérifie que le remote est de type `crypt` : un remote non
  chiffré recevrait toutes les données de la production en clair.
- **`TENANT_GUARD_MODE=warn` et `SUBSCRIPTION_ENFORCEMENT=warn` livrés par
  `make-env.sh`.** Le filet d'isolation multi-tenant ne bloque aucune requête tant
  qu'on ne passe pas à `enforce` (d'abord sur le staging, voir « Bascules de
  configuration risquées »), et les quotas d'abonnement ne sont pas appliqués.
- **Staging accessible publiquement, avec panneau de comptes de démo et
  simulateur de paiement.** `app.immotopia.cloud` est joignable par tout internet
  et affiche des identifiants de démonstration. `X-Robots-Tag` évite l'indexation,
  pas l'accès. À envisager : `auth_basic` ou une liste d'adresses IP dans le
  vhost du staging.
- **Secrets visibles de l'intérieur de l'hôte.** Le fichier de secrets alimente
  l'environnement des conteneurs (`env_file`) : `docker inspect` et
  `docker exec … env` les affichent à tout membre du groupe `docker` de l'hôte,
  ce qui équivaut à un accès administrateur, pour les deux piles à la fois.
- **`seed-demo-*.ts` non gardés.** La garde `assert-not-production.ts` protège
  six seeds de développement ; les `seed-demo-*.ts` (`affaires`, `documents`,
  `locative`, `maintenance`, `syndic`, `visites`) sont pourtant dans l'image
  `migrate` et n'ont pas cette garde, pas plus que `syndic-demo-seed.ts` et
  `syndic-demo-fund-movements.ts` (recherche de `assertNotProduction` dans
  `packages/api/prisma/seeds/`). Aucun script de déploiement ne les lance ; c'est
  un manque de défense en profondeur, non résolu ici.

## Renvois

- [ADR-005](../architecture/adr/ADR-005-environnements-staging-production.md) :
  la décision, la séparation stricte, les conséquences.
- [RUNBOOK.md](RUNBOOK.md) : installation locale, ports de développement,
  dépannage, outil d'exploitation des abonnements, migration orpheline du
  staging.
- [ADR-003](../architecture/adr/ADR-003-migration-hors-git-fonds-copropriete.md) :
  la migration hors dépôt de la pile `immotopia-saas`.
- [SECURITY.md](../governance/SECURITY.md) : secrets, réseau, points ouverts de
  sécurité.
- `infra/.env.example`, `infra/environments/`, `infra/nginx/`, `infra/scripts/`.
