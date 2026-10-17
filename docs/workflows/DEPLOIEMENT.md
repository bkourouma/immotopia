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
[déploiement continu](#déploiement-continu-github-actions) ·
[cycle courant](#cycle-courant) ·
[sauvegarde et restauration](#sauvegarde-et-restauration) ·
[différences de configuration](#différences-de-configuration-staging-et-production) ·
[pièges](#pièges) · [points ouverts](#points-ouverts)

## Éprouvé et non éprouvé

- **Éprouvé sur le serveur**, sous sa forme d'avant ADR-005 (une seule pile,
  `immotopia-saas`) : `deploy.sh` (construction, migrations, tests de fumée,
  empreinte des conteneurs voisins), le vhost et le certificat de
  `app.immotopia.cloud`.
- **Éprouvé sur le serveur le 2026-09-30, sur le commit `23de8301`** (chaque
  action avec l'accord du propriétaire) :
  - clonage du dépôt public dans `/home/deployer/immotopia-saas` (ancien dossier
    conservé en `immotopia-saas.copie-avant-git`) ; `backup.sh staging` (base
    1,2 Mo, documents 271 Mo) et `restore-check.sh` (209 tables, 84 lignes de
    migrations restaurées, conteneur et volume supprimés) ;
  - `deploy.sh staging` complet (tous les contrôles, dont `stat -c`, `ss` et
    `flock`, la construction, une migration appliquée, les tests de fumée locaux
    et HTTPS, 42 conteneurs voisins inchangés) ;
  - `make-env.sh prod` ; vhost et certificat de `clients.immotopia.cloud`
    (échéance 2026-12-29, renouvellement automatique) ; `deploy.sh prod` complet :
    garde-fous (arbre propre, commit dans `origin/main`, secrets distincts du
    staging, simulateur interdit, ports libres), construction, migrations depuis
    une base vierge jusqu'à 81, tests de fumée locaux et HTTPS ;
  - `bootstrap.sh prod --dry-run` (base migrée et vide, plan attendu), puis
    l'amorçage réel, **saisi au terminal par le propriétaire** (premier
    SUPER_ADMIN) : état vérifié ensuite par le même `--dry-run` (65 permissions,
    5 rôles clés, 12 gabarits de biens, 1 SUPER_ADMIN, `RBAC déjà posé`) ; journaux
    de l'API sans erreur ; sauvegarde faite après l'amorçage et sa restauration de
    contrôle (209 tables, 81 migrations, aucune orpheline) ;
  - en-têtes de sécurité observés en HTTPS sur les deux domaines (un seul jeu par
    réponse), `X-Robots-Tag: noindex` sur le staging seulement, page de connexion
    de la production sans compte de démonstration ;
  - sauvegarde nocturne de la production planifiée dans la crontab de `deployer`
    et sa commande exacte exécutée à la main (dump et documents en mode 600).
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
- **Non éprouvé** (à la date de rédaction) :
  - le déploiement continu (`deploy.yml`, `ci-deploy.sh`, clés SSH de la CI,
    environnements et secrets GitHub) : écrit et testé en local seulement ;
  - la copie hors serveur (rclone), la restauration réelle d'une sauvegarde, le
    retour arrière par étiquette d'image, le fichier temporaire de
    `set-google-oauth.sh`, la connexion Google et le paiement en mode `LIVE` ;
  - les gardes `NODE_ENV=production` des seeds de développement dans l'image
    `migrate` de la pile.
    Lire chaque résultat avant de passer à l'étape suivante.

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
- **Secrets** : `JWT_SECRET`, mot de passe Postgres, `PAYMENT_SECRETS_KEY` et
  `DIRECT_DEBIT_IBAN_KEY` distincts, tous générés neufs par `make-env.sh` et
  **contrôlés par `deploy.sh prod`** (comparaison d'empreintes, rien n'est affiché) : un secret
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

| Script                                                    | Rôle                                                                                                                                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `make-env.sh <staging\|prod> [fichier]`                   | Crée le fichier de secrets (mode 600, secrets neufs). Refuse d'écraser un fichier existant.                                                                                                                                         |
| `deploy.sh <staging\|prod> [--no-build]`                  | Contrôles, construction, migrations, démarrage, tests de fumée, empreinte des voisins. Idempotent, ne supprime jamais de volume. Un seul à la fois (verrou).                                                                        |
| `bootstrap.sh <staging\|prod> [--dry-run]`                | Amorce une base vierge : RBAC, gabarits de biens, premier SUPER_ADMIN saisi au terminal (toutes les saisies avant la première écriture).                                                                                            |
| `set-google-oauth.sh <staging\|prod> [fich.]`             | Écrit `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans le fichier de secrets, sans jamais afficher le secret.                                                                                                                      |
| `set-email-smtp.sh <staging\|prod> [fich.]`               | Écrit la configuration SMTP (serveur, port, utilisateur, expéditeur, mot de passe saisi deux fois sans écho et protégé par des apostrophes pour Docker Compose) dans le fichier de secrets.                                         |
| `backup.sh <staging\|prod>`                               | Sauvegarde la base et le volume des documents, avec rotation et copie hors serveur facultative.                                                                                                                                     |
| `restore-check.sh <dump.sql.gz>`                          | Vérifie qu'un dump se restaure, dans un conteneur jetable sans réseau. Ne touche aucune pile.                                                                                                                                       |
| `seed-pack-tests.sh staging [--dry-run] [--repair-files]` | Crée ou resynchronise 12 agences de test (deux par pack, avec 6 mois ou 3 ans de données) à mot de passe public ; `--repair-files` répare les fichiers déjà semés hors du volume. Refuse `prod`. Voir « Comptes de test par pack ». |
| `ci-deploy.sh <staging\|prod> [sha]`                      | Entrée imposée aux clés SSH de la CI (`command=`, `restrict`) : contrôles git, sauvegarde (prod), `deploy.sh`, détaché de SSH. **Non éprouvé.** Voir « Déploiement continu ».                                                       |
| `check-infra.sh`                                          | Contrôle statique sans secret (syntaxe, rendu Compose, ports, modes 100755), lancé par la CI (`bash infra/scripts/check-infra.sh` aussi en local).                                                                                  |

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

**Le dossier du serveur n'est pas encore un dépôt git (constaté le 2026-09-30, par
lecture seule).** `/home/deployer/immotopia-saas` est une copie de fichiers du poste
de travail, sans `.git`, avec un marqueur `.deployed-revision`. `deploy.sh prod`
exige un git utilisable, un arbre propre et un HEAD dans `origin/main` : il refuse
donc de tourner tel quel. Le dépôt GitHub est **public** : le serveur le clone en
HTTPS, sans clé ni jeton, et git y est installé (2.43.0). Procédure proposée,
**à faire seulement après la fusion de la pull request qui introduit ces scripts**
(sinon le clone ne contient pas `infra/environments/`), chaque commande avec le
« oui » du propriétaire :

```bash
cd /home/deployer
mv immotopia-saas immotopia-saas.copie-avant-git   # copie de secours, intacte
git clone https://github.com/bkourouma/immotopia.git immotopia-saas
cd immotopia-saas && git log -1 --oneline && git status -sb
```

Les conteneurs du staging ne dépendent pas de ce dossier (images déjà construites,
fichier de secrets et volumes nommés hors de lui) : ils continuent de tourner
pendant l'opération. Le prochain `deploy.sh staging` reconstruira depuis le nouveau
dossier. **Non éprouvé.** Les fichiers d'environnement (`/home/deployer/*.env`) ne
sont pas dans ce dossier et ne bougent pas.

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
la perdre les rend illisibles, et les agences devraient les ressaisir.
`DIRECT_DEBIT_IBAN_KEY` chiffre les IBAN des mandats de prélèvement (voir
[Clé dédiée aux IBAN](#clé-dédiée-aux-iban-prélèvement-bancaire)) : la perdre les
rend illisibles. Ce fichier n'est pas couvert par `backup.sh`.

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
  staging (voir l'étape 4). Pour le SMTP : `./infra/scripts/set-email-smtp.sh prod`
  (dans une session `ssh -t`) demande le serveur, le port, l'utilisateur,
  l'expéditeur et le mot de passe (deux saisies, sans écho) ; puis
  `deploy.sh prod --no-build` recrée l'API. Le script protège le mot de passe par des
  apostrophes : Docker Compose interpole `$` dans un fichier d'environnement (un mot
  de passe `ab$cd` deviendrait `ab`) ; un mot de passe contenant une apostrophe est
  refusé. Options : `--password-only` (ne demande que le mot de passe ; serveur,
  port, utilisateur et expéditeur sont repris du fichier) et `--visible` (une seule
  saisie, affichée : utile quand le collage dans un champ masqué échoue ; fermer
  l'onglet du terminal ensuite). Ne jamais passer le mot de passe en argument de la
  commande : il resterait dans l'historique du shell et dans la liste des processus.
  Vérifier ensuite l'authentification sans envoyer de message : la commande
  `docker exec immotopia-prod-api node -e "...verify()..."` est affichée par le
  script. **Activer l'e-mail active aussi l'exigence de vérification de l'adresse à
  la connexion** (`isEmailDeliveryConfigured`). Le staging n'utilise jamais la boîte
  de la production : un bac à sable.
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
   - `JWT_SECRET`, `POSTGRES_PASSWORD`, `PAYMENT_SECRETS_KEY` **et
     `DIRECT_DEBIT_IBAN_KEY`** différents de ceux du staging, et aucune clé du
     trousseau IBAN de la production (courante ou ancienne) présente dans celui du
     staging (comparaison d'empreintes, rien n'est affiché) ;
   - `YOUSIGN_ALLOW_SANDBOX` valant `1` (base sandbox de Yousign, signatures sans
     valeur : réservée au staging), même écriture tolérante.

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
    pas de la pile : un conteneur recréé ou redémarré est signalé). Une alerte peut venir du déploiement d'une AUTRE
    application de l'hôte, pendant la durée du build (constaté le 2026-09-30 avec les
    conteneurs `ecoledigitale-*`, recréés par leur propre déploiement) : lire le
    `diff` affiché avant de conclure à un problème. Le journal
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
Vérifier que l'écran de connexion **n'affiche pas** le menu « Choisir un compte de test ».
Créer la première agence dans l'administration (Agences). Sans e-mail
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

**Copie hors serveur provisoire, sur le poste de travail.** En attendant un stockage
distant chiffré (rclone), `./infra/scripts/pull-backups.sh prod [--fresh]`, lancé
depuis un terminal bash du poste (Git Bash sous Windows), rapatrie par SSH la
dernière sauvegarde (base et documents) et le fichier de secrets dans
`backups-serveur/prod/AAAA-MM-JJ-HHMM/` du projet. Ce dossier est **ignoré par git**
(`.gitignore`, `.dockerignore`) et le script **refuse de tourner** si la destination
ne l'est pas : le dépôt est public. Chaque fichier est vérifié (somme sha256
comparée à celle du serveur, `gzip -t`, `tar -tzf`) et les 7 copies les plus
récentes sont gardées (`--keep N`). Ces copies contiennent toutes les données et
tous les secrets **en clair** : chiffrer le disque (BitLocker), ne pas les placer
dans un dossier synchronisé non chiffré. Éprouvé le 2026-09-30 sur la production
(sauvegarde fraîche, trois fichiers, sommes identiques).

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

## Déploiement continu (GitHub Actions)

**Non éprouvé : aucun essai réel n'a eu lieu.** Le workflow
`.github/workflows/deploy.yml` et le script `infra/scripts/ci-deploy.sh` sont
écrits et contrôlés en local (refus d'arguments, enchaînement sur un faux dépôt),
mais jamais exécutés par GitHub ni sur le serveur. Décision :
[ADR-008](../architecture/adr/ADR-008-deploiement-continu.md). Tant que la mise en
service ci-dessous n'est pas faite, rien ne change : le déploiement manuel
(« Cycle courant ») reste la référence.

### Ce qui part tout seul, ce qui reste manuel

| Cas                                                                | Déclencheur                                                    | Approbation                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------ |
| **Staging** (https://app.immotopia.cloud), à chaque push de `main` | automatique si la variable `AUTO_DEPLOY_STAGING` vaut `true`   | aucune                                                       |
| **Staging**, à la demande                                          | « Run workflow », environnement `staging`                      | aucune                                                       |
| **Production** (https://clients.immotopia.cloud)                   | « Run workflow », environnement `prod`, **jamais automatique** | relecteur obligatoire de l'environnement GitHub `production` |
| Toute autre branche                                                | rien ne se déploie (la CI reste inchangée)                     |                                                              |

La production se déploie, par défaut, sur le **commit du dernier déploiement
réussi du staging** (registre des déploiements de GitHub) : on promeut ce qui a
été validé. Le champ « commit » du formulaire permet d'en choisir un autre pour
la production (40 caractères hexadécimaux) ; pour le staging, il doit rester vide
(tête de `main`). Avant `deploy.sh prod`, le déploiement fait la sauvegarde
(`backup.sh prod`) et étiquette les images actuelles (`immotopia-prod-api` et
`-web` en `avant-<date>-<version de la production>`, voir « Retour arrière »). Le staging se
déploie **sans sauvegarde préalable**.

### Cheminement

1. **Workflow `Déploiement`** (GitHub) : sur `workflow_run` du workflow `CI` (branche
   `main`, push du même dépôt, conclusion `success`, interrupteur actif) ou sur
   `workflow_dispatch` (lancé depuis `main`). Un premier job résout la cible
   (environnement et commit) ; si un commit plus récent est déjà sur `main`, le
   déploiement est écarté sans erreur (on ne recule jamais le staging, le commit
   plus récent a le sien). Un second job, rattaché à l'environnement GitHub
   `staging` ou `production`, ouvre la connexion SSH.
2. **SSH** : `ssh -p 2222 deployer@147.93.44.169 "deploy <env> <sha>"` avec une clé
   propre à l'environnement, vérification stricte de l'hôte (`known_hosts` fourni
   par un secret).
3. **`ci-deploy.sh <env>`** : imposé par la clé (`command=…`), il valide la commande
   reçue (`^deploy (staging|prod) ([0-9a-f]{40})$`, environnement égal à celui de la
   clé), puis lance un worker **détaché de la session SSH** et ne suit que le
   **canal public** de ce worker. Le worker : place d'attente et verrou CI,
   attente d'un `deploy.sh` manuel, `git fetch`, contrôles (commit dans
   `origin/main` et portant `ci-deploy.sh`, arbre propre, HEAD actuel dans
   `origin/main`) ; pour la production, commit déjà déployé avec succès sur le
   staging et refus du retour arrière ; placement du checkout ; puis (production)
   sauvegarde et étiquettes ; enfin `./infra/scripts/deploy.sh <env>`. Le code de
   sortie de `deploy.sh` est celui du job (l'entrée le lit dans `<journal>.rc`,
   jamais dans un journal).
4. **`deploy.sh`** : inchangé (contrôles, construction, migrations, tests de fumée,
   empreinte des voisins). Seuls les titres de ses étapes `==>` sont recopiés sur le
   canal public.
5. **Contrôle externe** du workflow : `<url>/health` et `<url>/` doivent répondre
   200 (quelques essais espacés).

### Garde-fous

- **Clé limitée** : la ligne `authorized_keys` porte `command="…ci-deploy.sh <env>"` et
  `restrict` (ni shell, ni terminal, ni redirection de port, ni agent). Elle ne sait
  rien faire d'autre que ce script ; **une clé par environnement** : la clé du
  staging ne peut pas déployer la production (le script compare l'environnement de
  la commande à celui de la clé, code de sortie 2 sinon).
- **Seul un commit d'`origin/main`** se déploie, et il doit **embarquer
  `infra/scripts/ci-deploy.sh`** (sinon `command=` pointerait sur un fichier
  disparu et la CI deviendrait inutilisable). **L'arbre du serveur doit être
  propre** (fichiers non suivis compris) ; le **checkout actuel doit déjà être dans
  `origin/main`** : un essai manuel sur le serveur (autre branche, commit non
  fusionné) n'est jamais déplacé, le déploiement s'arrête avec un message. Remettre
  le checkout sur `origin/main`, puis relancer.
- **La clé de production ne contourne pas la validation, côté serveur.** Pour
  `prod`, `ci-deploy.sh` exige (fermé par défaut : fichier absent ou illisible =
  refus) que le commit figure, avec l'environnement `staging`, dans
  `~/deploy-history-immotopia-saas.log` (déployé **avec succès** sur le staging), et
  **refuse un retour arrière** : si la version de la production (3e colonne de la
  dernière ligne de `~/deploy-history-immotopia-prod.log`) descend du commit demandé,
  le déploiement s'arrête. Un retour arrière ne se fait **que par la voie manuelle**
  (« Retour arrière »). Le tout premier déploiement de la production se fait aussi à
  la main (la production existe depuis le 2026-09-30).
- **File d'attente bornée, verrous dans `~/ci-deploy-logs/`** (dossier 700, hors de
  `/tmp`) : `.attente.lock` (une seule place d'attente : un second déploiement CI
  qui arrive s'arrête tout de suite, « réessayer plus tard ») et `.ci.lock` (un seul
  déploiement CI à la fois). Puis l'attente du verrou de `deploy.sh`
  (`/tmp/immotopia-deploy.lock`) quand un déploiement manuel est en cours. Chaque
  attente se fait par tranches de 30 s (20 min au plus) et le worker **abandonne
  sans rien déployer si la connexion SSH a disparu avant le début** (job GitHub
  annulé, réseau) : contrôle à chaque tour d'attente et une dernière fois, après
  deux messages publics espacés, une fois les verrous obtenus (une coupure ne tue
  l'entrée qu'en écrivant ; l'entrée pose alors un marqueur `<journal>.parti` que le
  worker consulte). Une toute petite fenêtre reste : un `deploy.sh` manuel lancé
  entre l'attente et la prise du verrou par le `deploy.sh` de la CI fait échouer ce
  dernier aussitôt, sans rien abîmer.
- **Session détachée une fois le travail commencé** : à partir du placement du
  checkout, si la connexion tombe ou si le job est annulé, le worker continue
  jusqu'au bout (une migration n'est jamais interrompue à mi-course) ; son code de
  sortie est écrit dans `<journal>.rc`.
- **Un changement de `ci-deploy.sh` ne s'applique qu'au déploiement SUIVANT** : le
  worker en cours exécute la version du script d'avant le placement du checkout
  (aucune ré-exécution). À savoir quand on corrige ce script.
- **Jamais annulé en cours** : un groupe `concurrency` par environnement
  (`deploiement-staging`, `deploiement-production`), sans annulation. Un groupe
  commun laisserait un push sur `main` remplacer, donc annuler, un déploiement de
  production en attente. Sur le serveur, un seul déploiement à la fois quel que
  soit l'environnement (verrou de `ci-deploy.sh`). Le job `deploy` a un plafond de
  90 minutes : 20 d'attente du verrou CI, 20 d'attente d'un `deploy.sh` manuel, le
  déploiement lui-même et une marge.
- **Dépôt public, journaux publics : un canal public dédié, pas un filtre.** Le
  worker écrit, à côté du journal complet, un fichier `<journal>.public` que l'entrée
  seule suit (ANSI et caractères de contrôle retirés). Il ne reçoit que les messages
  de `ci-deploy.sh` lui-même et, de `deploy.sh`, les titres des étapes `==> ` (chaînes
  fixes, forme exacte vérifiée). Rien d'autre de `deploy.sh`, `backup.sh`, `git` ou
  `docker` n'y va : ni les contrôles `OK …` de `deploy.sh` (qui citent des chemins de
  secrets et des noms d'intégrations), ni les journaux de conteneurs (falsifiables),
  ni le `diff` des voisins. En cas d'échec de `deploy.sh`, le canal public ne porte
  que « `ECHEC deploy.sh a echoue (code N) : raison dans le journal complet du
serveur` ». Le **journal complet** est sur le serveur :
  `~/ci-deploy-logs/<AAAAMMJJ-HHMMSS>-<env>-<commit>-<pid>.log` (dossier 700,
  fichiers 600, purge à 30 jours, hors du checkout pour ne pas le salir). Le workflow
  n'interpole jamais d'entrée dans un script `run:`.
- **Pas de déclenchement par un fork** : le déploiement automatique exige le même
  dépôt, un `push`, la branche `main` et une CI réussie.
- **`workflow_dispatch` exécute le fichier de la branche choisie** (« Use workflow
  from », `--ref`), pas seulement celui de la branche par défaut (seul
  `workflow_run` lit la branche par défaut). Le contrôle `REF == refs/heads/main` du
  workflow n'est qu'un confort : la vraie barrière est la règle « Deployment
  branches : main » des environnements `staging` et `production`.
- **Écrire sur `main` vaut exécuter du code sur le serveur partagé** (Docker y est un
  accès administrateur de l'hôte), et la CI est définie par le commit poussé : « CI
  verte » n'est pas une frontière de confiance. D'où le prérequis bloquant de la
  mise en service (protection de `main`).

### Mise en service (par le propriétaire, pas à pas)

À faire **après la fusion** de ce changement dans `main` : `workflow_run` ne lit que
le fichier de la branche par défaut, donc le premier déploiement automatique
n'arrive qu'ensuite, et le workflow n'existe pas avant pour `workflow_dispatch` sur
`main`. Chaque étape sur le serveur suit la [règle d'or](#règle-dor).

1. **Prérequis bloquant : protéger `main`, avant tout essai et avant d'activer
   `AUTO_DEPLOY_STAGING`.** Avec le déploiement continu, quiconque peut écrire sur
   `main` exécute du code sur le serveur partagé, et la CI étant définie par le
   commit poussé, une CI verte ne prouve rien sur l'auteur. Créer un _ruleset_
   GitHub (Settings → Rules) sur `main` : pull request obligatoire (plus aucun
   push direct), avec au moins une relecture approuvée **dès qu'un second
   mainteneur existe** (un propriétaire seul ne peut pas approuver ses propres
   pull requests : avec une relecture exigée et aucun contournement, il ne
   pourrait plus rien fusionner ; tant qu'il est seul, mettre 0 relecture et
   garder le reste) ; _status checks_ requis :
   `API — typecheck, lint, test`, les 4 lots `Web — tests`,
   `Web — typecheck, lint, build` et `Infra — scripts et compose` ; ni
   _force-push_ ni suppression ; **aucun contournement, pas même par les
   administrateurs**. Décision du propriétaire, **non créée par ce dépôt** :
   un fichier `CODEOWNERS` couvrant `.github/`, `infra/`, `**/Dockerfile*` et
   `docs/governance/`, avec relecture du propriétaire obligatoire dans le ruleset.
   Sans cela, ne pas activer le staging automatique.

2. **Contrôler le serveur** : checkout sur `origin/main` à jour, arbre propre,
   `ci-deploy.sh` exécutable ; et configuration `sshd` : un porteur de clé ne doit
   pas pouvoir passer d'environnement (`BASH_ENV` exécuterait du code avant toute
   validation).

   ```bash
   cd /home/deployer/immotopia-saas
   git fetch origin && git merge --ff-only origin/main
   git status -sb
   ls -l infra/scripts/ci-deploy.sh
   sudo sshd -T -C user=deployer,host=x,addr=127.0.0.1 | grep -iE 'acceptenv|permituserenvironment'
   ```

   `git status -sb` n'affiche que la ligne de branche ; le fichier porte
   `-rwxr-xr-x` ; `sshd` n'affiche **au plus** `acceptenv LANG LC_*` et
   `permituserenvironment no`. Sinon, corriger `sshd_config` avant de continuer.

3. **Générer deux paires de clés ed25519 sur SON poste** (jamais sur le serveur,
   jamais dans une conversation) :

   ```bash
   ssh-keygen -t ed25519 -N "" -C github-actions-immotopia-staging -f immotopia-ci-staging
   ssh-keygen -t ed25519 -N "" -C github-actions-immotopia-prod -f immotopia-ci-prod
   ```

4. **Poser les clés PUBLIQUES** dans `/home/deployer/.ssh/authorized_keys` (en
   sauvegardant le fichier d'abord), chacune sur **une seule ligne**, avec son
   préfixe :

   ```text
   command="/home/deployer/immotopia-saas/infra/scripts/ci-deploy.sh staging",restrict <contenu de immotopia-ci-staging.pub>
   command="/home/deployer/immotopia-saas/infra/scripts/ci-deploy.sh prod",restrict <contenu de immotopia-ci-prod.pub>
   ```

5. **Obtenir la ligne `known_hosts`** et la comparer à l'empreinte lue **sur le
   serveur** :

   ```bash
   # Sur le poste
   ssh-keyscan -p 2222 -t ed25519 147.93.44.169 > known_hosts_ci
   ssh-keygen -lf known_hosts_ci
   # Sur le serveur
   ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
   ```

   Les deux empreintes (`SHA256:…`) doivent être identiques ; sinon, s'arrêter.

6. **Créer les environnements GitHub** (Settings → Environments) : `staging` et
   `production`, chacun avec « Deployment branches : main seulement » ; pour
   `production`, « Required reviewers » = le propriétaire (laisser « Prevent
   self-review » désactivé s'il est seul, sinon il ne pourrait pas approuver sa
   propre exécution ; voir le risque résiduel de l'ADR-008).

7. **Poser les secrets d'environnement**, **tester les refus de la clé**, puis
   supprimer les clés privées du poste :

   ```bash
   gh secret set DEPLOY_SSH_KEY --env staging < immotopia-ci-staging
   gh secret set DEPLOY_SSH_KNOWN_HOSTS --env staging < known_hosts_ci
   gh secret set DEPLOY_SSH_KEY --env production < immotopia-ci-prod
   gh secret set DEPLOY_SSH_KNOWN_HOSTS --env production < known_hosts_ci
   ```

   **Tests négatifs obligatoires, AVANT de supprimer les clés privées** (SHA
   quelconque de 40 caractères hexadécimaux) : chacun doit être refusé, avec le
   code de sortie 2 de `ci-deploy.sh`, et ne rien déployer.

   ```bash
   # Clé du staging qui demande la production : refus (2)
   ssh -i immotopia-ci-staging -o IdentitiesOnly=yes -p 2222 deployer@147.93.44.169 "deploy prod 0123456789abcdef0123456789abcdef01234567"; echo $?
   # Commande hors liste blanche : refus (2)
   ssh -i immotopia-ci-staging -o IdentitiesOnly=yes -p 2222 deployer@147.93.44.169 "id"; echo $?
   # Aucune commande (pas de shell interactif) : refus (2)
   ssh -i immotopia-ci-staging -o IdentitiesOnly=yes -p 2222 deployer@147.93.44.169; echo $?
   ```

   Puis seulement : `rm -f immotopia-ci-staging immotopia-ci-prod`.

8. **Tester les refus du workflow** (après la création des environnements) : un
   `workflow_dispatch` lancé depuis une autre branche ne doit pas atteindre les
   secrets. Depuis une branche d'essai (créée à partir de `main`, donc portant
   `deploy.yml`) :

   ```bash
   gh workflow run deploy.yml --ref <autre-branche> -f environment=staging
   gh workflow run deploy.yml --ref <autre-branche> -f environment=prod
   ```

   Le contrôle de branche du premier job refuse déjà ; pour éprouver **la règle de
   l'environnement elle-même**, refaire l'essai sur une branche d'essai où ce
   contrôle est retiré : le job `deploy` doit être refusé (« branch not allowed »)
   avant l'étape « Contrôle des secrets ». Supprimer la branche d'essai ensuite.

9. **Premier essai manuel du staging** : onglet Actions → « Déploiement » → « Run
   workflow » (environnement `staging`, commit vide), ou
   `gh workflow run deploy.yml -f environment=staging`. Lire les lignes `ci-deploy:`
   et `==>` du journal GitHub, puis le journal complet sur le serveur
   (`ls -t ~/ci-deploy-logs | head -3`). Vérifier qu'aucune ligne du journal
   GitHub ne cite un secret, un chemin de fichier de secrets ou un nom d'intégration.

10. **Activer le staging automatique** (seulement si l'étape 1 est faite) :

    ```bash
    gh variable set AUTO_DEPLOY_STAGING --body true
    ```

11. **Premier essai de la production** : le premier déploiement de la production
    par la CI suppose une version déjà inscrite dans son journal (la production
    existe depuis le 2026-09-30). « Run workflow », environnement `prod` (commit
    vide : celui du dernier staging réussi) ; vérifier l'environnement et le commit
    dans le résumé du job « Cible du déploiement » **avant** d'approuver
    l'environnement `production` (l'approbation précède la connexion au serveur),
    puis constater `Deploiement prod termine`.

### Arrêt d'urgence, rotation

- **Couper le staging automatique** :
  `gh variable set AUTO_DEPLOY_STAGING --body false` (n'empêche pas un « Run
  workflow » manuel).
- **Annuler un run GitHub** (bouton « Cancel ») : si le worker n'a pas encore
  commencé (il attend un verrou), il abandonne tout seul dans les 30 secondes et rien
  n'est déployé. S'il a commencé, il va au bout.
- **Couper tout accès CI à un environnement** : retirer sa ligne de
  `/home/deployer/.ssh/authorized_keys`.
- **Un worker déjà en cours** : le repérer avec `pgrep -af 'ci-deploy.sh --worker'` et
  lire le journal le plus récent (`ls -t ~/ci-deploy-logs | head -3`). **Ne JAMAIS le
  tuer pendant les migrations** : une migration à moitié appliquée est pire qu'un
  déploiement terminé.
- **Retour arrière** : uniquement par la voie manuelle (« Retour arrière »). La CI
  refuse un commit antérieur à la version de la production.
- **Rotation** : regénérer la paire, remplacer la ligne `authorized_keys`, remplacer
  le secret d'environnement, supprimer l'ancienne clé privée. Voir
  [SECURITY.md](../governance/SECURITY.md), section 8.
- **Un déploiement échoue sur « le checkout est sur un commit hors de main »** : un
  essai manuel a laissé le serveur sur un autre commit. Le remettre sur
  `origin/main` à la main, puis relancer le workflow.

## Cycle courant

Le staging d'abord, la production ensuite, **sur le même commit**. Deux voies
coexistent : la voie automatisée par GitHub Actions
([Déploiement continu](#déploiement-continu-github-actions), **non éprouvée**) et
la voie manuelle par SSH, qui reste valable et qui sert de repli.

1. **Fusionner** la pull request dans `main` (décision de l'utilisateur), CI
   verte, job `infra` compris.
2. **Le staging part tout seul** après la fusion, si la CI du push est verte et si
   l'interrupteur `AUTO_DEPLOY_STAGING` vaut `true` : suivre l'exécution
   « Déploiement » dans l'onglet Actions de GitHub, noter le commit déployé (lignes
   `ci-deploy:`). Interrupteur à `false`, ou besoin de le lancer à la main :
   « Run workflow » (environnement `staging`). **Un essai manuel sur le staging
   avant la fusion bloque ce déploiement automatique** : tant que le checkout du
   serveur n'est pas remis sur `origin/main`, `ci-deploy.sh` s'arrête (« le
   checkout est sur un commit hors de main »). Remettre le checkout sur
   `origin/main` avant la fusion, ou juste après l'essai.
3. **Voie manuelle du staging** : placer le checkout sur le commit voulu
   d'`origin/main` (`git fetch origin`, puis `git merge --ff-only origin/main` si
   le checkout suit `main`), noter `git rev-parse --short HEAD` (si la fusion a créé
   un nouveau commit, c'est lui qui se valide, pas celui de la branche), puis
   `./infra/scripts/deploy.sh staging`. Il n'exige ni arbre propre ni commit dans
   `origin/main` (un essai avant fusion reste possible), mais le checkout étant
   partagé, le déplacer change ce que la prochaine construction de la production
   emploierait : avant tout déploiement de production, le remettre sur le commit
   validé.
4. **Valider sur le staging** (liste ci-dessous).
5. **Déployer la production, voie recommandée** : « Run workflow », environnement
   `prod`, champ « commit » vide (le dernier commit déployé avec succès sur le
   staging). Le workflow fait, dans l'ordre : sauvegarde (`backup.sh prod`),
   étiquetage des images actuelles (`avant-<date>-<version de la production>`), puis
   `deploy.sh prod` sur ce commit, après l'approbation de l'environnement GitHub
   `production`. Hors heures de pointe. Le serveur refuse, côté `ci-deploy.sh`, un
   commit jamais déployé avec succès sur le staging et tout retour arrière. Passer
   ensuite à l'étape 8.
6. **Voie manuelle de la production : sauvegarder, juste avant** :
   `./infra/scripts/backup.sh prod`. Les migrations ne se défont pas : c'est cette
   sauvegarde qui permet de revenir en arrière. Ce n'est plus seulement une bonne
   pratique : **`deploy.sh prod` échoue** si la base est déjà initialisée et
   qu'aucun `db-*.sql.gz` de moins de 24 heures n'existe dans `BACKUP_DIR`
   (contrôle fait après la construction des images, juste avant les migrations).
7. **Voie manuelle : étiqueter les images actuelles** pour un retour arrière
   (`deploy.sh` les reconstruit sous l'étiquette `latest`, l'ancienne image serait
   perdue), puis **déployer la production** sur le même commit, hors heures de
   pointe :

   ```bash
   docker tag immotopia-prod-api:latest immotopia-prod-api:avant-AAAAMMJJ
   docker tag immotopia-prod-web:latest immotopia-prod-web:avant-AAAAMMJJ
   ./infra/scripts/deploy.sh prod
   ```

   Vérifier que le commit affiché est celui du staging :
   `tail -n 1 /home/deployer/deploy-history-immotopia-saas.log` (troisième colonne)
   doit égaler `git rev-parse --short HEAD`. Ne rien faire d'autre dans le checkout
   pendant ce temps (pas de `git checkout`, pas de fichier créé, pas de second
   `deploy.sh`) : le script vérifie que `HEAD` et l'arbre n'ont pas bougé juste
   avant la construction et juste avant les migrations, et s'arrête sinon.

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

### Comptes de test par pack (staging)

`seed-pack-tests.sh` crée, sur le **staging uniquement**, **deux agences de test par
pack** d'abonnement (AGENCE, SYNDIC, PROMOTEUR, INTEGRE, PATRIMOINE_ESSENTIEL,
PATRIMOINE_PRO), soit 12 agences : « Test — Pack … · 6 mois » (un jeune parc, six
mois de gestion) et « Test — Pack … · 3 ans » (36 mois : parc plus large, baux
renouvelés ou résiliés, budgets qui évoluent, impayés anciens régularisés). Chacune
a un administrateur `<pack>@packs.immotopia.test` (6 mois, par exemple
`agence@packs.immotopia.test`) ou `<pack>-3ans@packs.immotopia.test` (3 ans), au mot de
passe défini dans `prisma/seeds/pack-test-tenants.ts`. Les agences passent par le vrai
service de provisionnement (modules, abonnement, socle comptable) ; le compte est
ensuite rendu utilisable sans invitation et l'essai est repoussé à +5 ans. Une agence
créée avant les profils (« Test — Pack X ») est renommée en « · 6 mois », pas recréée.

Puis l'historique est reconstitué module par module (`prisma/seeds/pack-history/`),
dates relatives à la date du seed, hasard déterministe : agence (contacts, biens, baux,
encaissements, pénalités, relevés, affaires, visites, maintenance, via les services de
l'application), syndic (copropriétés, appels, paiements, relances, AG, fonds,
comptabilité), promoteur (chantiers, lots, budgets, fournisseurs, factures, bail de
terrain), patrimoine (biens détenus, loyers, charges, travaux, assurances, prêts,
valorisations ; entités, actifs, scénarios, sinistres en Pro). INTEGRE reçoit agence +
syndic + promoteur. Aucun envoi sortant n'est possible pendant le seed (SMTP/SMS coupés
avant tout import). `PACK_TEST_HISTORY=0` crée les agences sans historique.

**Profil « 3 ans » complet (aucun écran vide).** Après 36 mois d'usage, une agence aurait
utilisé tous ses modules : les agences « 3 ans » reçoivent donc, en plus de l'historique
de base, des compléments par module (un fichier d'accroche chacun dans `pack-history/`,
appelés dans l'ordre par `index.ts`) :

| Compléments                                                | Contenu                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `equipe-plateforme` (avant)                                | équipe de 6 à 10 membres par agence (rôles réels, un membre suspendu, un ancien membre), invitations de 4 statuts, menus coupés par rôle, paie des chantiers, journal d'activité de 36 mois                                                                                                   |
| `agence-commercial`, `agence-locatif`, `agence-patrimoine` | CRM (notes, étiquettes, recherches, relances), mandats, ventes (offres, compromis, commissions), newsletters, états des lieux, événements de bail, reversements et relevés propriétaires sur 36 mois, retenues à la source, patrimoine des biens propres, prestataires, portails avec comptes |
| `syndic-extras`, `syndic-fixes`                            | quittances et reçus en PDF, programmation des appels, échéanciers, fonds, contrats, parties communes, incidents, tickets liés, documents, AG convoquées ou annulées, quotes-parts de lots à 100 %, CRM, portail copropriétaire avec comptes                                                   |
| `promoteur-extras`, `promoteur-commercial`                 | stock de chantier (articles, mouvements, bons, inventaires, écarts à justifier, WhatsApp d'inventaire sans envoi), caisse de chantier, retenues de garantie, associations, programmes en commercialisation (lots, CRM, ventes, maintenance, patrimoine conservé)                              |
| `patrimoine-extras`, `patrimoine-fixes`                    | dossier documentaire, accès tiers, sinistres, régularisation foncière, hypothèses de rendement, parc de 27 biens en Pro, baux et impayés étalés, prêts, visites, portail du titulaire                                                                                                         |
| `core-communication`                                       | newsletters (listes, modèles, campagnes), contacts CRM du Patrimoine, identité des documents (logo, signature, cachet), réglages de notification                                                                                                                                              |
| `finance-transverse`, `finance-gaps` (après)               | comptabilité reconstituée, trésoreries (banque, caisse, mobile money) jamais négatives, virements, sessions de caisse, pièces à valider, facturation du mois, balances clients                                                                                                                |
| `equipe-plateforme` (fin)                                  | 36 factures d'abonnement par agence, règlements, extensions, relevés d'usage, exports                                                                                                                                                                                                         |

Chaque bloc de ces compléments est **idempotent** : il saute ce que l'agence porte déjà.
Relancer `seed-pack-tests.sh staging` sur des agences « 3 ans » déjà créées leur ajoute
donc ce qui manque, sans doublon et sans purge. Les agences « 6 mois » ne reçoivent pas
ces compléments. Un seed d'historique de BASE interrompu laisse en revanche une agence
partielle que la relance ne complète pas (garde « le module a déjà des données ») : la
suspendre ou la purger, puis relancer. Les comptes de connexion ajoutés (équipe,
portails propriétaire, locataire, copropriétaire) ont le même mot de passe de test public
que les administrateurs. Durée constatée en local : environ une heure pour les 12 agences créées de zéro (55 min mesurées), 6 minutes pour une relance sur des agences déjà peuplées.

**Documents générés (corrigé, lot S0 de la spec 044).** Les modèles DOCX livrés
(`assets/modeles_documents/*.docx`) sont copiés en lecture seule dans l'image
runtime (`/app/assets/modeles_documents`) ; les documents générés et les
modèles importés par une agence s'écrivent sous `UPLOADS_DIR`
(`/data/uploads/generated_documents`, `/data/uploads/modeles_documents`), donc
sur le volume `<pile>-uploads-data`, sauvegardé par `backup.sh`. À vérifier sur
le staging après le prochain déploiement : « Générer un contrat » et le
téléchargement d'une quittance.

**Fichiers semés hors du volume (corrigé, réparation à lancer une fois).** Le seed
tourne dans un conteneur `migrate` **jetable** : seul le volume `<pile>-uploads-data`
(monté sur `/data/uploads`, `UPLOADS_DIR`) survit à la fin du script. Les agences
semées avant le correctif ont eu leurs documents locatifs (contrats, avenants,
reçus, quittances, relevés) et les modèles de l'agence écrits sous `/repo/assets/...`,
dans ce conteneur : les lignes `RentalDocument.file_path` et
`DocumentTemplate.storage_path` pointent vers des fichiers disparus et hors des dossiers
que l'API lit. Symptôme : « Envoyer pour signature » répond « Fichier du document
invalide », le téléchargement d'une quittance échoue. Le correctif fait écrire le seed
sur le volume (mêmes helpers que l'API, `utils/assets-paths.ts`) et monte `assets/` du
dépôt en lecture seule dans le conteneur (l'image `migrate` n'embarque pas les modèles
livrés ; un écrivain qui oublierait `UPLOADS_DIR` échoue donc au lieu de perdre ses
fichiers). Pour réparer les agences **déjà semées**, sans purge ni recréation :

```bash
./infra/scripts/seed-pack-tests.sh staging --repair-files --dry-run   # n'affiche que le plan
./infra/scripts/seed-pack-tests.sh staging --repair-files             # répare les fichiers
```

À lancer sur le serveur, depuis `/home/deployer/immotopia-saas`, **après** le
déploiement qui apporte le correctif (l'image `migrate` doit contenir le script de
réparation : `deploy.sh staging` la reconstruit). Le mode **refuse `prod`** comme le
reste du script. Pour chaque document locatif et chaque modèle d'une agence de test dont
le fichier est absent ou hors du volume, il réécrit le fichier sur le volume et met le
chemin à jour : documents reconstitués avec le même générateur Word que le seed (à
partir du numéro, de la date, du bail et de la description de la ligne ; ce n'est pas le
contenu d'origine, perdu), modèles recopiés depuis `assets/modeles_documents`. Il n'affiche
que des **compteurs** par agence (examinés, réparés, déjà sains, impossibles avec leur code
d'erreur), jamais un contenu ni un chemin, et il est **idempotent** : un second passage
répare 0 ligne. Il redonne ensuite les droits du volume à l'utilisateur de l'API
(`chown`, comme le seed). Si une agence de gestion locative n'a aucun modèle propre, il
le signale : relancer alors `./infra/scripts/seed-pack-tests.sh staging`, qui crée les
modèles manquants. Les gabarits globaux « par défaut » (`db:seed:document-templates`)
ne sont pas concernés : `bootstrap.sh` ne les pose toujours pas.

```bash
./infra/scripts/deploy.sh staging           # amène d'abord le web à jour
./infra/scripts/seed-pack-tests.sh staging  # crée ou resynchronise les 12 agences et leur historique
./infra/scripts/seed-pack-tests.sh staging --dry-run   # n'affiche que le plan
```

Il faut un SUPER_ADMIN (`bootstrap.sh` d'abord). Le script est **idempotent** :
une agence existante (repérée par son nom) n'est pas recréée, seuls le mot de
passe, la membership, le rôle et la fin d'essai sont resynchronisés ; on peut le
relancer sans doublon. Il **refuse `prod`** (code 2) avant toute action, et le
seed refuse en plus toute origine autre que `https://app.immotopia.cloud` en
production (garde `ALLOW_PACK_TEST_TENANTS=1`).

**Attention : mot de passe public, staging seulement.** Il figure dans le bundle
du staging ; ne jamais réutiliser ces comptes ni ce mot de passe ailleurs.

Les agences « 6 mois » Promoteur et Opérateur intégré portent en plus quatre
comptes de recette du contrôle du stock (lot 040), au même mot de passe :
`magasinier-promoteur@`, `comptable-promoteur@`, `magasinier-integre@` et
`responsable-integre@packs.immotopia.test` (Magasinier, Comptable, second
administrateur qui valide l'inventaire compté par un autre). Liste et rôles :
`PACK_TEST_MEMBERS` dans `prisma/seeds/pack-test-tenants.ts`, reprise dans la
connexion rapide du staging (`apps/web/src/dev/dev-accounts.ts`). Après le
déploiement du lot, **relancer le seed** (`./infra/scripts/seed-pack-tests.sh
staging`) pour les créer : il est idempotent et ne recrée pas les agences.

Lot 041 : ces deux agences portent aussi un Chef de chantier
(`chef-promoteur@` et `chef-integre@packs.immotopia.test`, rôle
`TENANT_SITE_MANAGER`), inscrit au bot WhatsApp et déjà actif, aux numéros
**fictifs** `+2250100000101` et `+2250100000102`, sur un chantier « Chantier de
recette — inventaire WhatsApp » basculé au stock. Seul le Promoteur reçoit un
bloc `EXT_INVENTAIRE_WHATSAPP` : l'Opérateur intégré joue « option absente ».
Liste : `PACK_TEST_WHATSAPP_REGISTRATIONS` dans le même fichier.

Pour les retirer, suspendre chaque agence avec l'outil d'exploitation
(`docker exec immotopia-saas-api node dist/scripts/provision-subscription.js suspend --tenant <slug> [--dry-run]`,
voir le [RUNBOOK](RUNBOOK.md)). Les relancer ne les réactive pas : le seed ne
touche pas le statut d'une agence existante.

### Retour arrière (non éprouvé)

Les images se remettent à l'étiquette précédente ; la base, elle, n'est pas
défaite. **Le retour arrière se fait uniquement par cette voie manuelle** : le
déploiement continu (`ci-deploy.sh`) refuse un commit antérieur à la version de la
production.

```bash
docker tag immotopia-prod-api:avant-AAAAMMJJ immotopia-prod-api:latest
docker tag immotopia-prod-web:avant-AAAAMMJJ immotopia-prod-web:latest
./infra/scripts/deploy.sh prod --no-build
```

- **Une sauvegarde de moins de 24 heures doit exister**, même avec `--no-build` :
  celle qui a précédé le déploiement (étape 5 ou 6 du cycle) convient tant qu'elle a
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

### Rattrapage des honoraires de gestion (PR « Opérateur intégré »)

À faire **une fois, APRÈS la migration et AVANT d'ouvrir la version aux
utilisateurs**, sur le staging puis sur la production. Un niveau de conditions
d'honoraires (bail, propriétaire, agence) ne vaut que pour les encaissements
enregistrés après son dernier enregistrement (`feeTermsApplyToAllocation`) :
un encaissement antérieur dont les honoraires ne sont pas encore figés n'en
recevrait **jamais**. Le script fige l'historique de chaque agence avec les
conditions encore en vigueur (`freezeManagementFees`, le même appel que celui
qui précède chaque changement de conditions).

```bash
C=immotopia-prod-api; T=dist/scripts/backfill-management-fees.js   # staging : immotopia-saas-api
# 1. Simulation (rien n'est écrit) : encaissements et honoraires qui seraient figés, par agence.
docker exec $C node $T --allow-production
# 2. Lire le rapport, puis appliquer (idempotent : on peut le relancer).
docker exec $C node $T --allow-production --apply
# Une seule agence : --tenant <id>. Sortie machine : --json.
```

- **Simulation par défaut.** `--apply` écrit ; `--allow-production` est exigé
  dans le conteneur (`NODE_ENV=production`). Une agence en échec est signalée
  sans arrêter les autres (code de sortie 1).
- **Idempotent.** Seuls les encaissements sans honoraires sont traités (unicité
  sur l'affectation) : un second passage, ou un passage concurrent, ne crée
  rien. Un nouvel `--apply` après coup ne touche que les encaissements arrivés
  entre-temps.
- **Sauvegarde d'abord** en production (`./infra/scripts/backup.sh prod`), comme
  pour tout déploiement. Le rattrapage ne modifie ni ne supprime aucune ligne
  existante : il ajoute des lignes d'honoraires.
- Le fichier est compilé dans l'image (`src/scripts/`) ; en développement :
  `npm run ops:backfill-management-fees -w @immotopia/api -- [options]`.
- Après `--apply`, la simulation doit afficher 0 encaissement pour chaque agence
  (les encaissements sans condition d'honoraires applicable restent sans
  honoraires, ce qui est voulu : ils n'apparaissent pas non plus en simulation).

### Clé dédiée aux IBAN (prélèvement bancaire)

Les IBAN des mandats de prélèvement (spec 042) sont chiffrés en AES-256-GCM avec
une clé **dédiée**, `DIRECT_DEBIT_IBAN_KEY`, distincte de `PAYMENT_SECRETS_KEY`
(qui protège les clés API de paiement). Chaque valeur stockée porte
l'identifiant de la clé qui l'a chiffrée (`ddk1:<id de clé>:…`), ce qui permet de
changer de clé sans perdre l'existant. Les valeurs de l'ancien format `pg1`
(chiffrées avec `PAYMENT_SECRETS_KEY`) restent **lisibles** ; on n'écrit plus
jamais en `pg1`.

- **Génération** : `openssl rand -base64 32`. `make-env.sh` la génère pour une
  pile neuve et ajoute une ligne `DIRECT_DEBIT_IBAN_PREVIOUS_KEYS=` vide.
- **Sauvegarde hors serveur** (gestionnaire de mots de passe), avec le reste du
  fichier de secrets : la perdre rend les IBAN illisibles, les mandats devraient
  être ressaisis. `backup.sh` ne la couvre pas.
- **Sans clé**, l'API démarre mais refuse de créer un mandat ; les mandats
  existants au format `pg1` restent lisibles. L'API **refuse de démarrer** si la
  clé est identique à `PAYMENT_SECRETS_KEY` ou si une entrée de
  `DIRECT_DEBIT_IBAN_PREVIOUS_KEYS` n'est pas une clé de 32 octets en base64
  canonique (44 caractères, terminée par `=`) ou est manifestement faible
  (moins de 16 octets distincts). `deploy.sh` applique la même forme et refuse
  avant de remplacer le conteneur.
- **Contrôles de `deploy.sh`** : doublons de ligne, valeur `REMPLACER`, égalité
  avec `PAYMENT_SECRETS_KEY` (échec) ; en production, unicité face au staging,
  trousseau compris (échec) ; clé absente en production (avertissement). Rien
  n'est jamais affiché.

**Rotation** (par exemple après une suspicion de fuite) :

1. Sauvegarde fraîche (`backup.sh`), puis copie de l'ancien fichier de secrets
   hors serveur.
2. Générer la nouvelle clé. Dans le fichier de secrets, mettre l'**ancienne**
   valeur de `DIRECT_DEBIT_IBAN_KEY` dans `DIRECT_DEBIT_IBAN_PREVIOUS_KEYS`
   (séparées par des virgules s'il y en a déjà), puis la nouvelle dans
   `DIRECT_DEBIT_IBAN_KEY` (en modifiant les lignes existantes, sans doublon).
3. Recréer l'API : `./infra/scripts/deploy.sh <staging|prod> --no-build`. Les
   mandats existants restent lisibles, les nouveaux sont chiffrés avec la
   nouvelle clé.
4. Rechiffrer : `docker exec <conteneur-api> node dist/scripts/reencrypt-direct-debit-ibans.js --dry-run`,
   puis la même commande sans `--dry-run`. Le script n'affiche que des compteurs,
   l'identifiant de la clé courante et les identifiants des mandats illisibles
   (code de sortie 0 : **toutes** les valeurs ont été déchiffrées, y compris
   celles déjà sur la clé courante, et aucune n'a changé entre-temps ; 2 : il
   reste des illisibles, code prioritaire ; 3 : des mandats ont changé entre la
   lecture et l'écriture, relancer ; 1 : erreur d'usage ou de configuration). Il
   est idempotent : relancé, il annonce 0 mandat rechiffré, et préserve la date
   de dernière modification des mandats.
5. N'**ôter l'ancienne clé** de `DIRECT_DEBIT_IBAN_PREVIOUS_KEYS` (et recréer
   l'API) qu'après un passage à 0 à rechiffrer, 0 illisible, **et** une
   sauvegarde de la base vérifiée faite après le rechiffrement : une sauvegarde
   antérieure contient encore des valeurs chiffrées avec l'ancienne clé.

Points d'attention de la rotation :

- **Pas de retour arrière après rechiffrement.** Une version de l'API
  antérieure à ce changement ne sait pas lire le format `ddk1` : une fois des
  valeurs rechiffrées, revenir à cette version rend les IBAN illisibles. Le
  retour arrière passe par un correctif en avant, pas par l'ancienne image.
- **Conserver l'ancienne clé** dans le gestionnaire de mots de passe jusqu'à
  l'expiration des sauvegardes (14 jours), avec l'identifiant de clé affiché par
  le script : c'est la seule façon de relire une sauvegarde antérieure.
- **Rotation après une fuite** : purger aussi du serveur les copies du fichier
  de secrets (`*.env.bak-*`), qui contiennent l'ancienne clé en clair.

> **Staging — commandes à lancer par l'utilisateur** (aucun agent ne touche au
> fichier de secrets). Ordre : la clé peut être ajoutée **avant** la fusion de la
> PR (l'API actuelle ignore la variable) ; le script de rechiffrement n'existe
> dans le conteneur qu'**après le déploiement** de cette PR.
>
> ```bash
> F=/home/deployer/immotopia-saas.env
>
> # 1. Ajout idempotent de la clé, sans jamais l'afficher. Le bloc est dans un
> #    sous-shell ( … ) : aucun `exit`, la session SSH reste ouverte, et le
> #    `umask 077` ne la déborde pas. Une valeur de 44 caractères déjà présente
> #    est laissée telle quelle ; une ligne vide, « REMPLACER » ou entre
> #    guillemets est à corriger À LA MAIN (jamais de doublon : Compose retient
> #    la dernière occurrence).
> (
>   umask 077
>   F=/home/deployer/immotopia-saas.env
>   if [ ! -f "$F" ]; then
>     echo "fichier absent"
>   else
>     if grep -Eq '^DIRECT_DEBIT_IBAN_KEY=.{44}$' "$F"; then
>       echo "DIRECT_DEBIT_IBAN_KEY déjà renseignée : inchangée"
>     elif grep -q '^DIRECT_DEBIT_IBAN_KEY=' "$F"; then
>       echo "ligne DIRECT_DEBIT_IBAN_KEY présente mais vide ou non conforme : à corriger à la main"
>     else
>       K="$(openssl rand -base64 32)"
>       if [ "${#K}" -eq 44 ]; then
>         printf '\nDIRECT_DEBIT_IBAN_KEY=%s\n' "$K" >> "$F"
>       else
>         echo "génération de la clé échouée : rien n'est écrit"
>       fi
>       unset K
>     fi
>     grep -q '^DIRECT_DEBIT_IBAN_PREVIOUS_KEYS=' "$F" || printf '\nDIRECT_DEBIT_IBAN_PREVIOUS_KEYS=\n' >> "$F"
>   fi
> )
>
> # 2. Mode 600 attendu (affiche « 600 »).
> stat -c '%a' "$F"
>
> # 3. Une seule ligne par clé (affiche « 1 »), et clé différente de PAYMENT_SECRETS_KEY
> #    (empreintes tronquées de la VALEUR seule : deux résultats différents, jamais les clés).
> grep -c '^DIRECT_DEBIT_IBAN_KEY=' "$F"
> for k in PAYMENT_SECRETS_KEY DIRECT_DEBIT_IBAN_KEY; do grep -E "^$k=" "$F" | cut -d= -f2- | tr -d '"' | sha256sum | cut -c1-12; done
>
> # 4. Sauvegarder le fichier HORS SERVEUR (gestionnaire de mots de passe) AVANT de continuer.
>
> # 5. Prise en compte : recréation de l'API sans reconstruire
> #    (voir « Modifier une variable d'environnement »).
> ./infra/scripts/deploy.sh staging --no-build
>
> # 6. APRÈS le déploiement de la PR : simulation puis rechiffrement
> #    (résultat attendu aujourd'hui : 0 mandat).
> docker exec immotopia-saas-api node dist/scripts/reencrypt-direct-debit-ibans.js --dry-run
> docker exec immotopia-saas-api node dist/scripts/reencrypt-direct-debit-ibans.js
> ```

### Lot 040 — contrôle du stock de chantier

À relire avant le premier déploiement du lot (détail :
`specs/040-controle-stock/data-model.md` §5.3).

- **Le retour arrière est un correctif en avant.** Les migrations ajoutent des
  valeurs d'enum (`ALTER TYPE … ADD VALUE`, irréversible) ; dès qu'une ligne
  porte une valeur nouvelle (inventaire `COUNTED` ou `CANCELLED`, mouvement
  `SCRAP` ou `SUPPLIER_RETURN`, écriture `STOCK_SCRAP`…), l'ancienne image ne
  sait plus lire la liste des inventaires, le journal ni le grand livre. Le
  retour arrière de la section précédente ne vaut donc que dans les minutes qui
  suivent la mise en ligne, avant toute écriture du stock ; ensuite, on corrige
  et on redéploie le code du lot, les migrations restent.
- **API et web partent ensemble** (ce que fait `deploy.sh`) : les formes de
  réponse du stock changent (`POST /stock/receipts`, `POST /stock/issues`,
  `PUT …/lines`, listes paginées). Un onglet resté ouvert sur l'ancien web se
  remet d'aplomb en rechargeant la page ; aucun drapeau de fonctionnalité.
- **`STOCK_ALERT_MAIL_JOB_ENABLED`** (`env.example`, défaut `false`) : envoi,
  toutes les 10 minutes, de l'e-mail récapitulatif des nouvelles alertes de
  stock aux responsables du stock de chaque agence. La purge nocturne des clés
  d'idempotence (3 h UTC) tourne quelle que soit la valeur. L'activer d'abord
  sur le staging, vérifier la réception, puis sur la production
  ([modifier une variable](#modifier-une-variable-denvironnement)).
- **Droits.** La migration `20261008090200_controle_stock_permissions` crée les
  dix droits `STOCK_*` et le rôle Magasinier (`TENANT_STOREKEEPER`), et reporte
  les droits financiers existants sur les droits du stock équivalents, pour
  tous les rôles qui les portent (personne ne perd l'accès qu'il avait). Elle
  est idempotente. Les droits prennent effet au plus tard 5 minutes après
  l'attribution d'un rôle (cache par instance).
- **Couper les menus hors stock du Magasinier, une fois, par la plateforme.**
  Les clés de menu ne sont connues que du web : la migration n'écrit aucune
  décision de menu. Après le déploiement, un super-administrateur ouvre
  l'écran des accès aux menus par rôle (`PUT /roles/menu-access/:roleKey`) et,
  pour `TENANT_STOREKEEPER`, choisit **« Toutes les agences (défaut) »** puis ne
  laisse que les menus du stock (le Magasin, les preneurs, le stock). Ce défaut
  vaut pour toutes les agences, y compris celles créées ensuite, tant qu'une
  agence n'a pas son propre réglage pour ce rôle. À faire sur le staging, puis
  sur la production.
- **Comptes de recette** : relancer le seed des comptes de test par pack sur le
  staging ([plus haut](#comptes-de-test-par-pack-staging)).

### Lot 041 — Inventaire WhatsApp

Comptage du stock de chantier par photo WhatsApp et IA (`specs/041-inventaire-whatsapp/`).
À relire avant le premier déploiement du lot.

**Variables** (`packages/api/env.example`, contrôlées au démarrage par
`src/config/env.ts`) :

| Variable                                                                           | Staging              | Production                                                                                          |
| ---------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| `WHATSAPP_INVENTORY_TRANSPORT`                                                     | `log` (rien ne part) | `meta`, ou `disabled` (défaut) tant que la mise en service n'est pas faite                          |
| `WHATSAPP_INVENTORY_SIMULATOR`                                                     | `1`                  | absent (`0`)                                                                                        |
| `STOCK_VISION_PROVIDER`                                                            | `fake`               | `gemini` ou `openrouter`                                                                            |
| `STOCK_VISION_MODEL`, `GEMINI_API_KEY` (ou `OPENROUTER_API_KEY`)                   | —                    | requis par le fournisseur choisi                                                                    |
| `META_WA_APP_SECRET`, `META_WA_VERIFY_TOKEN` (32 caractères au moins)              | —                    | requis avec `meta`                                                                                  |
| `META_WA_ACCESS_TOKEN`, `META_WA_PHONE_NUMBER_ID`                                  | —                    | requis avec `meta`                                                                                  |
| `META_WA_GRAPH_VERSION`, `META_WA_MEDIA_HOSTS`, `WHATSAPP_INVENTORY_PUBLIC_NUMBER` | facultatif           | défauts `v23.0`, `lookaside.fbsbx.com` [à vérifier au déploiement] ; numéro affiché à l'inscription |
| `WHATSAPP_INVENTORY_WARN_QUOTA`                                                    | `500`                | `500` (quota de secours hors `enforce`)                                                             |

**Refus de `deploy.sh prod`.** Le script refuse la production si le fichier de
secrets porte `WHATSAPP_INVENTORY_SIMULATOR=1`, `WHATSAPP_INVENTORY_TRANSPORT=log`
ou `STOCK_VISION_PROVIDER=fake`, quelle que soit l'écriture (`export`,
guillemets, espaces), comme `PAYMENT_GATEWAY_SIMULATOR`. `env.ts` refuse en plus
au démarrage `log` en production sans simulateur et `fake` hors développement,
test ou simulateur.

**Staging.** `WHATSAPP_INVENTORY_TRANSPORT=log`, `WHATSAPP_INVENTORY_SIMULATOR=1`,
`STOCK_VISION_PROVIDER=fake` : aucun message WhatsApp ne part, aucune IA n'est
appelée. La recette se joue dans l'onglet Gestion du stock › WhatsApp ›
Simulateur, avec les directives `fake:…` en légende des photos. Après le
déploiement du lot, **relancer le seed des comptes de test**
([plus haut](#comptes-de-test-par-pack-staging)) : il crée les deux chefs de
chantier, leurs inscriptions et le bloc d'option du Promoteur.

**Mise en service Meta, pas à pas** (production, une fois) :

1. Business Manager vérifié ; application Meta de type « Business » ; produit
   WhatsApp ajouté.
2. Numéro officiel ajouté et vérifié (SMS ou appel), nom d'affichage approuvé ;
   noter le `phone_number_id` → `META_WA_PHONE_NUMBER_ID`.
3. Utilisateur système avec un jeton **permanent** (droits
   `whatsapp_business_messaging` et `whatsapp_business_management`) →
   `META_WA_ACCESS_TOKEN`. Jamais le jeton temporaire de 24 heures.
4. Clé secrète de l'application → `META_WA_APP_SECRET` ; jeton de vérification
   généré (`openssl rand -base64 48`) → `META_WA_VERIFY_TOKEN`. Les deux restent
   propres à la production.
5. Déployer avec `WHATSAPP_INVENTORY_TRANSPORT=meta`
   ([modifier une variable](#modifier-une-variable-denvironnement)). Puis, dans
   l'application Meta : URL de rappel
   `https://<api>/api/webhooks/whatsapp-cloud/events` et jeton de vérification ;
   « Vérifier et enregistrer » (le `GET` doit rendre le challenge). Le webhook
   répond `404` tant que le transport n'est pas `meta`, `401` à un corps sans
   signature `X-Hub-Signature-256` valide.
6. Abonner le compte WhatsApp Business au champ `messages`.
7. Moyen de paiement du compte : les réponses dans la fenêtre de 24 heures sont
   gratuites, mais le compte l'exige [à vérifier].
8. Essai : inscrire un numéro de test, envoyer son code, puis une photo ;
   vérifier dans le journal l'hôte de téléchargement des médias et ajuster
   `META_WA_MEDIA_HOSTS` si besoin (refus `HOST_NOT_ALLOWED` sinon).
9. Vision : `STOCK_VISION_PROVIDER=gemini` et `GEMINI_API_KEY` (ou `openrouter`
   et sa clé), `STOCK_VISION_MODEL`.
10. Couper les menus hors stock du rôle « Chef de chantier »
    (`TENANT_SITE_MANAGER`) par l'écran des accès aux menus par rôle, en
    choisissant « Toutes les agences (défaut) », comme pour le Magasinier du
    lot 040. Le rôle ne porte que `STOCK_COUNT` : sans
    `STOCK_VIEW`, la Gestion du stock lui est de toute façon fermée.
11. **Retour arrière** : `WHATSAPP_INVENTORY_TRANSPORT=disabled` coupe la
    fonction sans redéployer (webhook en `404`, minuteries et reprise des
    événements arrêtées ; l'effacement des copies et les purges nocturnes
    continuent). Schéma : les migrations ajoutent des valeurs d'enum
    (`PHOTOS_INVENTAIRE`, `FIELD_COUNT_CLOSED`), irréversibles ; le retour
    arrière du schéma est un correctif en avant
    (`specs/041-inventaire-whatsapp/data-model.md` §5.3).

**Données personnelles.** Le numéro d'un chef n'apparaît jamais en clair dans un
journal ; celui d'un expéditeur inconnu n'est gardé qu'en empreinte HMAC. Les
photos sont des fichiers privés (`uploads/stock-whatsapp/<agence>/…`), jamais
servis en statique, et partent avec l'export d'agence.

### Lot 044 — Signature électronique : Yousign sandbox sur le staging

Spec `specs/044-signature-electronique/`, détail de l'adaptateur dans
[signature-prestataire.md](../integrations/signature-prestataire.md). Le staging
tourne en `NODE_ENV=production` comme la production : sans réglage, `env.ts` refuse
au démarrage `SIGNATURE_PROVIDER=yousign` avec une base « sandbox » (le refus est
voulu pour la production), et la base de production Yousign y produirait de vraies
signatures facturées. Le drapeau `YOUSIGN_ALLOW_SANDBOX=1` lève ce seul refus, sur le
staging seulement.

| Variable                 | Staging                                           | Production                                                              |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `SIGNATURE_PROVIDER`     | `yousign` pour essayer Yousign ; sinon `internal` | `yousign` (ou `internal`) selon le choix produit; `disabled` par défaut |
| `YOUSIGN_API_BASE_URL`   | `https://api-sandbox.yousign.app/v3` (défaut)     | `https://api.yousign.app/v3`                                            |
| `YOUSIGN_ALLOW_SANDBOX`  | `1`                                               | absent (`0`) : `deploy.sh prod` refuse `1`                              |
| `YOUSIGN_API_KEY`        | clé de la **sandbox** Yousign                     | clé de production, distincte                                            |
| `YOUSIGN_WEBHOOK_SECRET` | secret du webhook sandbox (32 caractères)         | secret du webhook de production, distinct                               |

**État du staging réel (relevé du 2026-10-16, soir).** Relevé par l'utilisateur sur le
serveur, non revérifié depuis le dépôt. Le fichier `/home/deployer/immotopia-saas.env`
est antérieur à `make-env.sh` : il ne portait ni `SIGNATURE_PROVIDER`, ni
`PAYMENT_GATEWAY_SIMULATOR`, ni configuration e-mail, alors que le tableau « Vue
d'ensemble » les donne pour acquis (il décrit la cible que `make-env.sh staging`
écrit, pas l'état d'un fichier plus ancien). Corrigé le jour même, à la main :

- `SIGNATURE_PROVIDER=internal` : la signature interne est active, **Yousign ne l'est
  pas encore** (ce lot : passer à `yousign` avec les lignes ci-dessous) ;
- `PAYMENT_GATEWAY_SIMULATOR=1` : le simulateur de paiement est disponible ;
- e-mail : boîte dédiée au staging, configurée par `set-email-smtp.sh` (port 465) ;
  `deploy.sh staging --no-build` passé, test `verify()` de nodemailer : « SMTP OK » ;
- `SMS_PROVIDER` reste **absent** (donc `disabled`) : pas de canal SMS sur le staging.

Piège à retenir : un fichier de secrets plus ancien que `make-env.sh` ne reçoit
jamais les réglages que le script écrit aujourd'hui pour un fichier neuf. Pour un
fichier existant, comparer ses clés à celles du gabarit (`grep -E '^(...)='`, voir
« Différences de configuration, staging et production »), sans afficher les secrets.

**Brancher la sandbox**, dans `/home/deployer/immotopia-saas.env` (édité à la main
sur le serveur, en **modifiant les lignes existantes**, sans les doubler) :

```bash
SIGNATURE_PROVIDER=yousign
YOUSIGN_API_KEY=…            # clé API de la sandbox, jamais celle de la production
YOUSIGN_WEBHOOK_SECRET=…     # 32 caractères, le même que celui déclaré chez Yousign
YOUSIGN_API_BASE_URL=https://api-sandbox.yousign.app/v3
YOUSIGN_ALLOW_SANDBOX=1
```

Puis [modifier une variable](#modifier-une-variable-denvironnement) :
`./infra/scripts/deploy.sh staging --no-build`. Le journal de l'API doit porter
l'avertissement « les signatures n'ont aucune valeur ». Webhook à déclarer chez
Yousign, dans la sandbox : `https://app.immotopia.cloud/api/public/signature-provider/yousign`
(événements et secret : [signature-prestataire.md](../integrations/signature-prestataire.md#créer-le-webhook-chez-yousign)).

**`SIGNATURE_PROVIDER` est unique.** Un seul fournisseur sert tout le serveur :

- avec `yousign`, **le canal SMS est refusé** (ainsi que WhatsApp et « sur place ») :
  Yousign n'invite que par e-mail ;
- tester le SMS (Orange CI) exige `SIGNATURE_PROVIDER=internal` (ou `log`) et
  `SMS_PROVIDER=orange` avec un compte Orange CI **dédié au staging** ;
- **`SMS_PROVIDER=log` est refusé sur le staging** : `NODE_ENV=production` et le
  transport `log` n'est accepté que si `NODE_ENV` vaut `development` ou `test`. Le
  staging n'a donc pas de SMS « à blanc » : `orange` ou `disabled`.

Passer d'un essai à l'autre revient à modifier le fichier de secrets et à
redéployer avec `--no-build`.

**Refus de `deploy.sh prod`.** Le script refuse la production si le fichier de
secrets porte `YOUSIGN_ALLOW_SANDBOX=1`, quelle que soit l'écriture (`export`,
guillemets, espaces), comme `PAYMENT_GATEWAY_SIMULATOR`. Sans le drapeau, `env.ts`
refuse de toute façon une base « sandbox » en production : deux barrières
indépendantes. Ne pas copier le fichier de secrets du staging vers la production.

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
  tout dossier `assets/` créé dans le conteneur d'API (les documents générés
  sont désormais sur le volume des téléversements, voir
  [« Fichiers livrés et fichiers générés »](#fichiers-livrés-et-fichiers-générés)).

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

| Réglage                                                                             | Staging                                                       | Production                                                          |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Origine (`PUBLIC_ORIGIN`, `FRONTEND_URL`, `BACKEND_URL`)                            | `https://app.immotopia.cloud`                                 | `https://clients.immotopia.cloud`                                   |
| `NODE_ENV`                                                                          | `production`                                                  | `production` (mêmes contrôles au démarrage sur les deux piles)      |
| `VITE_SHOW_DEMO_ACCOUNTS` (figé dans l'image web)                                   | `true`                                                        | `false`                                                             |
| `PAYMENT_GATEWAY_SIMULATOR`                                                         | `1`                                                           | absent, `deploy.sh prod` refuse `1`                                 |
| `PLATFORM_PAYSECUREHUB_MODE`                                                        | `SIMULATOR`                                                   | `SIMULATOR` à la création, puis `LIVE` (avertissement tant que non) |
| E-mail, WhatsApp, Google OAuth                                                      | vides ou bac à sable, client OAuth propre                     | identifiants réels dédiés, client OAuth propre                      |
| Signature (`SIGNATURE_PROVIDER`, `YOUSIGN_ALLOW_SANDBOX`)                           | Yousign sandbox : `YOUSIGN_ALLOW_SANDBOX=1`                   | base de production, `deploy.sh prod` refuse le drapeau              |
| Clés d'intégration (contrôle de `deploy.sh`)                                        | avertissement si l'une est renseignée                         | avertissement si l'une est identique à celle du staging             |
| Assistant IA (`AI_PROVIDER`)                                                        | `disabled`, ou clé propre au staging                          | selon le choix produit ; `fake` refusé sur les deux                 |
| `TENANT_GUARD_MODE`, `SUBSCRIPTION_ENFORCEMENT`                                     | `warn` à la création ; on bascule ici d'abord                 | `warn` à la création ; `enforce` seulement après le staging         |
| `JWT_SECRET`, mot de passe Postgres, `PAYMENT_SECRETS_KEY`, `DIRECT_DEBIT_IBAN_KEY` | propres à la pile                                             | propres à la pile, distincts de ceux du staging (échec sinon)       |
| Migrations orphelines tolérées                                                      | celles de `migrations-orphelines-connues.txt`                 | aucune                                                              |
| Arbre git propre et `HEAD` dans `origin/main` (`deploy.sh`)                         | non exigés                                                    | exigés, revérifiés avant la construction et avant les migrations    |
| Sauvegarde `db-*.sql.gz` de moins de 24 h avant de migrer                           | non exigée                                                    | exigée dès que la base est initialisée (pas au premier déploiement) |
| En-tête `X-Robots-Tag: noindex, nofollow`                                           | prévu par le vhost du dépôt, à ajouter à la main côté serveur | non posé                                                            |
| `BACKUP_DIR`, `BACKUP_KEEP_DAYS`                                                    | `/home/deployer/backups/immotopia-saas`, 14                   | `/home/deployer/backups/immotopia-prod`, 14                         |

Comment vérifier, en lecture seule, depuis le serveur :

```bash
# Réglages non secrets des deux fichiers (aucun secret dans cette liste).
grep -E '^(NODE_ENV|FRONTEND_URL|BACKEND_URL|CLIENT_URL|PUBLIC_ORIGIN|PAYMENT_GATEWAY_SIMULATOR|PLATFORM_PAYSECUREHUB_MODE|AI_PROVIDER|SIGNATURE_PROVIDER|YOUSIGN_API_BASE_URL|YOUSIGN_ALLOW_SANDBOX|SMS_PROVIDER|TENANT_GUARD_MODE|SUBSCRIPTION_ENFORCEMENT)=' \
  /home/deployer/immotopia-saas.env /home/deployer/immotopia-prod.env

# PAYMENT_SECRETS_KEY et DIRECT_DEBIT_IBAN_KEY distinctes : empreintes différentes (pas les clés).
for k in PAYMENT_SECRETS_KEY DIRECT_DEBIT_IBAN_KEY; do
  for e in saas prod; do grep -E "^$k=" /home/deployer/immotopia-$e.env | sha256sum | cut -c1-12; done
done

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

`JWT_SECRET`, `POSTGRES_PASSWORD`, `PAYMENT_SECRETS_KEY` et `DIRECT_DEBIT_IBAN_KEY`
sont déjà comparés par `deploy.sh prod`, qui échoue s'ils sont identiques à ceux du staging. Le panneau
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
  (`PAYMENT_SECRETS_KEY`), les IBAN des mandats (`DIRECT_DEBIT_IBAN_KEY`) et
  invaliderait les sessions (`JWT_SECRET`) :
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

## Fichiers livrés et fichiers générés

Choix (lot S0) : une seule règle, portée par `packages/api/src/utils/assets-paths.ts`.

| Nature                                           | Emplacement dans l'image                                        | Écriture                     |
| ------------------------------------------------ | --------------------------------------------------------------- | ---------------------------- |
| Modèles livrés `assets/modeles_documents/*.docx` | `/app/assets/modeles_documents` (couche d'image)                | jamais, lecture seule        |
| Documents générés (baux, quittances)             | `$UPLOADS_DIR/generated_documents/<agence>/<type>/<AAAA>/<MM>/` | volume `<pile>-uploads-data` |
| Modèles importés par une agence                  | `$UPLOADS_DIR/modeles_documents/tenants/<agence>/`              | volume `<pile>-uploads-data` |

- Pas de nouveau volume ni de nouvelle variable : `UPLOADS_DIR` (déjà
  `/data/uploads` dans l'image et dans le compose) suffit, et `backup.sh` couvre
  déjà ce volume. `docker-compose.yml`, `docker-compose.prod.yml` (utilisé aussi
  pour le staging) n'ont pas changé.
- Le serveur statique ne sert jamais `generated_documents` ni `modeles_documents`
  (liste blanche de `uploadsAccessGuard`) : le téléchargement passe par la route
  authentifiée.
- `.dockerignore` : `assets/generated_documents`, `assets/modeles_documents/tenants`,
  `assets/modeles_documents/default` et `assets/media` restent hors de l'image ;
  seuls les `.docx` livrés à la racine de `modeles_documents` sont copiés.
- Repli pour l'existant : un document déjà généré porte en base un chemin absolu
  de l'ancien emplacement (`<cwd>/assets/generated_documents/...`) ; la lecture
  l'accepte toujours (chemin stocké, dans l'ancien ou le nouveau dossier). Les
  modèles importés sont cherchés d'abord sur le volume, puis sous
  `assets/modeles_documents`. Aucune migration de données. Sans `UPLOADS_DIR`
  (développement), rien ne change : tout reste sous `<racine>/assets/`.
- Les gabarits globaux « par défaut » (`db:seed:document-templates`) ne sont
  toujours pas amorcés par `bootstrap.sh`.

### Conversion DOCX vers PDF (LibreOffice)

L'étape runtime installe `libreoffice-writer`, `font-noto` et `ttf-dejavu` et
pose `DOCX_PDF_CONVERTER=libreoffice` (`lib/pdf-convert`, utilisé par la
signature électronique). **Impact sur l'image : de l'ordre de +450 à +600 Mo**
(estimation Alpine, à mesurer au premier build), et un build plus long. Hors
Docker (développement), la variable vaut `disabled` par défaut : la conversion
répond 503 avec un message clair. Pour la désactiver sur une pile, poser
`DOCX_PDF_CONVERTER=disabled` dans son fichier d'environnement.

Durcissement : la conversion lance `soffice` avec un environnement réduit à
`PATH`, `HOME` (dossier de travail) et `LANG` (aucun secret du serveur hérité),
neutralise le DOCX avant conversion (relations externes, champs `INCLUDEPICTURE`
/ `INCLUDETEXT` / `LINK`, adresses `file:`, macros) et borne les conversions à
2 simultanées par processus (503 au-delà).

### Journaux nginx sans jeton de signature

Le lien `/signer/<jeton>` et l'API publique `/api/public/signatures/<jeton>`
portent un jeton secret dans le chemin. Les trois fichiers `infra/nginx/*.conf`
déclarent un `map` + un `log_format` (`immotopia_staging_masked`,
`immotopia_prod_masked`, `immotopia_web_masked`) qui remplacent le jeton par
`[masque]` dans la ligne de requête ET dans le Referer, et branchent
`access_log` dessus. Les fichiers de `sites-enabled` sont inclus dans le
contexte `http` : ces directives y sont valides sans toucher à `nginx.conf`.

Actions sur le serveur (non éprouvées, `nginx -t` non exécuté ici) :

1. **Les vhosts de l'hôte ont déjà été réécrits par certbot** : ne pas recopier
   le fichier du dépôt. Ajouter à la main, AVANT le premier bloc `server`, les
   blocs `map` et `log_format` du fichier du dépôt, puis remplacer dans le bloc
   `server` qui écoute en 443 (et en 80) la ligne `access_log` par
   `access_log /var/log/nginx/<hôte>.access.log immotopia_staging_masked;`
   (`immotopia_prod_masked` en production).
2. `sudo nginx -t && sudo systemctl reload nginx`.
3. Le nginx embarqué (`spa.conf`) est reconstruit avec l'image web : redéployer.
4. Vérifier : `curl -s https://<hôte>/signer/AAAAAAAAAAAAAAAAAAAAAAAA >/dev/null`
   puis `grep signer /var/log/nginx/<hôte>.access.log | tail -1` doit montrer
   `/signer/[masque]`.

Limite : `error_log` peut citer la ligne de requête lors d'une erreur amont
(502, délai). Il n'a pas de masquage possible côté nginx ; en limiter la
conservation et l'accès (rotation courte, lecture réservée à root).

## Points ouverts

Non résolus à la date de rédaction :

- **Staging : Yousign sandbox et SMS pas encore branchés (relevé du 2026-10-16).** Le
  fichier de secrets du staging, antérieur à `make-env.sh`, a été mis à niveau à la
  main le jour même (`SIGNATURE_PROVIDER=internal`, `PAYMENT_GATEWAY_SIMULATOR=1`,
  e-mail). Restent : Yousign sandbox (cette PR, puis
  [Lot 044](#lot-044--signature-électronique--yousign-sandbox-sur-le-staging)) et
  `SMS_PROVIDER`, absent donc `disabled`.
- **Déploiement continu non éprouvé.** Aucun essai réel du workflow
  `deploy.yml` ni de `ci-deploy.sh` (clés, `known_hosts`, environnements GitHub,
  détachement de la session, filtre de sortie, étiquettes d'images). Le premier
  essai se fait à la main, staging d'abord ([mise en service](#mise-en-service-par-le-propriétaire-pas-à-pas)).
- **Le staging se déploie sans sauvegarde préalable** par le déploiement continu
  (seule la production en fait une). Une migration destructrice ou mal écrite se
  verrait sur le staging avant la production, mais ses données de test ne seraient
  pas restaurables : à décider si cela gêne.
- **Canal public : hypothèse sur `deploy.sh`.** Le canal public ne reçoit des
  étapes de `deploy.sh` que leurs titres `==> `, supposés fixes (chaînes sans
  variable : vérifié à la rédaction) et vérifiés contre une forme et un jeu de
  caractères stricts. Un titre d'étape futur qui contiendrait une donnée variable
  la publierait : relire les `step` de `deploy.sh` à chaque modification. Le titre est
  limité à `^[A-Za-z0-9 ,.()'_-]{1,100}$` (ni `/` ni `:` : aucun chemin ni URL). **Risque
  résiduel** : une ligne de journal de conteneur qui imiterait exactement la séquence
  de couleur d'une étape pourrait publier un faux titre de 100 caractères ordinaires
  au plus.
- **Protection de `main` et CODEOWNERS : décisions du propriétaire, non créées par
  le dépôt.** Sans ruleset (PR relue, status checks requis, pas de contournement) ni
  CODEOWNERS sur `.github/`, `infra/`, `**/Dockerfile*` et `docs/governance/`,
  l'écriture sur `main` vaut exécution de code sur le serveur partagé : ne pas
  activer `AUTO_DEPLOY_STAGING` avant.
- **Propriétaire seul relecteur de `production`.** Avec « Prevent self-review »
  désactivé, il approuve ses propres exécutions : l'approbation est formelle, pas un
  second regard.
- **Retour arrière : manuel uniquement.** La CI refuse tout commit antérieur à la
  version de la production et tout commit jamais déployé avec succès sur le staging
  (journaux `~/deploy-history-*.log`). Ce garde-fou lit ces journaux : s'ils sont
  absents ou illisibles, la CI refuse (fermé par défaut).
- **Version du script.** Un changement de `ci-deploy.sh` ne s'applique qu'au
  déploiement suivant (le worker en cours exécute l'ancienne version).
- **File d'attente d'une seule place.** Un troisième déploiement CI qui arrive
  pendant qu'un autre attend est refusé (« réessayer plus tard ») ; GitHub marque
  le job en échec.
- **Registre des déploiements de GitHub.** La promotion en production lit le
  dernier déploiement réussi de l'environnement `staging` ; ce registre garde le
  SHA de l'exécution. Pour cette raison le staging refuse un commit saisi à la main
  différent de la tête de `main`.
- **Dépôt privé.** Le serveur fait son `git fetch` en HTTPS sans identifiant : si le
  dépôt devenait privé, le déploiement continu échouerait (il faudrait une clé de
  déploiement en lecture seule).
- **Géographie de la Côte d'Ivoire non amorcée.** `bootstrap.sh` ne lance pas
  `db:seed:geographic` : la recherche de communes est vide. Non bloquant.
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
