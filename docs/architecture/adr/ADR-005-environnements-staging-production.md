# ADR-005 : staging sur app.immotopia.cloud, production sur clients.immotopia.cloud

## Statut

Accepté

## Date

2026-09-29

## Contexte

Une seule pile ImmoTopia est déployée : le projet Docker Compose
`immotopia-saas`, servi sur https://app.immotopia.cloud par le nginx de l'hôte
(vers 127.0.0.1:3019), avec Postgres publié sur 127.0.0.1:5436. Le serveur est
partagé avec une vingtaine d'autres applications, dont le site public
`immotopia.cloud`, qui est un autre projet.

Faits qui rendent la décision nécessaire (état avant cette décision) :

- Les données de cette pile sont des données de **test** : aucun client réel n'y
  est inscrit à ce jour.
- L'infra est écrite en dur pour cette seule pile : `PROJECT`, `ENV_FILE`,
  `PUBLIC_URL` et `LOCAL_URL` dans `deploy.sh`, noms de conteneurs, de réseau, de
  volumes et d'images dans le compose, origine publique par défaut dans
  `Dockerfile.web`, chemin du fichier de secrets dans `make-env.sh`, vhost nginx
  de `app.immotopia.cloud`. Il n'existe pas de second jeu de valeurs.
- Le compose fige `VITE_SHOW_DEMO_ACCOUNTS=true` (et `Dockerfile.web` le prend à
  `true` par défaut) : l'écran de connexion affiche le panneau de comptes de
  démo. Acceptable pour du test, pas devant un client.
- Vite inscrit les `VITE_*` dans le bundle à la compilation
  (`infra/compose/Dockerfile.web`) : l'origine de l'API et l'affichage du panneau
  de démo sont figés dans l'image web, pas dans son environnement d'exécution.
- Aucune sauvegarde n'est programmée : `deploy.sh` en rappelle seulement les
  commandes en fin de déploiement.
- Les cookies d'authentification sont posés sans attribut `domain`
  (`packages/api/src/utils/auth-cookies.ts`) : ce sont des cookies d'hôte, non
  transmis d'un sous-domaine à l'autre.
- Le simulateur de paiement PaySecureHub n'est disponible en production que si
  `PAYMENT_GATEWAY_SIMULATOR=1` (`packages/api/src/config/env.ts`) et le faux
  fournisseur d'IA `fake` est refusé hors développement et tests (ADR-004) : les
  réglages qui séparent démonstration et réel existent, mais un seul fichier de
  secrets les porte aujourd'hui.

Le produit doit accueillir de vrais clients sur `clients.immotopia.cloud`, sans
les mêler aux essais.

## Décision

1. **`app.immotopia.cloud` devient le STAGING.** La pile existante garde son nom
   historique `immotopia-saas` : aucun renommage, donc aucun risque pour ses
   volumes (`immotopia-saas-postgres-data`, `immotopia-saas-uploads-data`,
   `immotopia-saas-api-logs`).
2. **`clients.immotopia.cloud` devient la PRODUCTION**, dans une nouvelle pile
   `immotopia-prod` créée **à vide** sur le même serveur. Aucune donnée n'est
   migrée du staging : les migrations Prisma construisent le schéma, rien de plus
   (voir « Conséquences négatives » pour l'amorçage).
3. **Séparation stricte** entre les deux piles :

   | Élément                                | Staging                             | Production                          |
   | -------------------------------------- | ----------------------------------- | ----------------------------------- |
   | Sous-domaine                           | `app.immotopia.cloud`               | `clients.immotopia.cloud`           |
   | Projet Compose                         | `immotopia-saas`                    | `immotopia-prod`                    |
   | Port web (127.0.0.1)                   | 3019                                | 3020                                |
   | Port Postgres (127.0.0.1)              | 5436                                | 5437                                |
   | Fichier de secrets                     | `/home/deployer/immotopia-saas.env` | `/home/deployer/immotopia-prod.env` |
   | Base, volumes (données, uploads, logs) | propres, préfixe `immotopia-saas-`  | propres, préfixe `immotopia-prod-`  |
   | Réseau Docker, conteneurs, images      | propres à la pile                   | propres à la pile                   |
   | `JWT_SECRET`, mot de passe Postgres    | distincts                           | distincts                           |
   | Certificat TLS                         | propre à `app.immotopia.cloud`      | propre à `clients.immotopia.cloud`  |

   Tous les ports publiés restent liés à `127.0.0.1` : le nginx de l'hôte est la
   seule porte d'entrée, avec un vhost par sous-domaine. Les cookies restent sans
   attribut `domain` : une session ouverte sur un sous-domaine n'existe pas sur
   l'autre, et deux `JWT_SECRET` distincts rendent un jeton de l'un invalide chez
   l'autre.

4. **Un seul checkout du dépôt sert les deux piles**, par
   `infra/scripts/deploy.sh <staging|prod>`. Un même fichier compose
   (`infra/compose/docker-compose.prod.yml`) est paramétré par environnement :
   tout ce qui porte un nom dérive de `STACK_NAME`, et les valeurs non secrètes
   de chaque environnement (nom de pile, fichier de secrets, origine publique,
   ports, panneau de démo) vivent dans `infra/environments/staging.conf` et
   `infra/environments/prod.conf`. La production n'est déployée que depuis un
   commit d'`origin/main`, arbre de travail propre, après validation de ce
   commit sur le staging. Le front étant compilé par environnement, on
   **promeut un commit, pas une image** : l'image web du staging n'est jamais
   réutilisée en production.
5. **Configuration différente par environnement** :

   | Réglage                                                | Staging                              | Production             |
   | ------------------------------------------------------ | ------------------------------------ | ---------------------- |
   | Panneau de comptes de démo (`VITE_SHOW_DEMO_ACCOUNTS`) | affiché                              | absent                 |
   | Simulateur de paiement (`PAYMENT_GATEWAY_SIMULATOR`)   | `1`                                  | interdit               |
   | E-mail, SMS, WhatsApp                                  | coupés ou sur bac à sable            | identifiants réels     |
   | Assistant IA (`AI_PROVIDER`)                           | `disabled`, ou clé propre au staging | selon le choix produit |

   Le staging ne doit **jamais** notifier de vraies personnes, ni utiliser un
   identifiant de la production (messagerie, opérateur SMS, WhatsApp, IA, compte
   de paiement). Les deux piles exécutent le même code avec `NODE_ENV=production`
   (cookies `secure`, mêmes contrôles au démarrage). Le simulateur du staging
   passe alors par `PAYMENT_GATEWAY_SIMULATOR=1` ; hors production, il serait
   disponible sans condition (`packages/api/src/config/env.ts`). Le faux
   fournisseur d'IA `fake` reste refusé sur les deux piles.

6. **Le staging répète les changements risqués avant la production** : bascules
   de configuration (`SUBSCRIPTION_ENFORCEMENT` et `TENANT_GUARD_MODE`, de `warn`
   vers `enforce`, avec lecture des avertissements) et migrations Prisma.

## Conséquences positives

- La production naît propre : pas de donnée de test, pas de panneau de démo, pas
  de simulateur de paiement, secrets neufs, journaux vierges.
- Aucune opération sur la pile existante : pas de migration de données, pas de
  renommage, pas de risque pour ses volumes. Si la mise en place de la
  production échoue, le staging reste intact.
- Une erreur ou une fuite d'un côté n'ouvre pas l'autre : base, volumes,
  secrets, sessions et certificat sont distincts.
- La validation avant mise en production se fait sur le même serveur, avec le
  même code : les migrations et les bascules `warn` vers `enforce` sont
  répétées dans des conditions proches du réel.
- Le staging peut être cassé, rechargé ou rempli de données de démonstration sans
  toucher un client.

## Conséquences négatives

- **Même serveur, mêmes points de défaillance** : Docker, disque, processeur,
  mémoire, nginx de l'hôte et renouvellement des certificats sont partagés entre
  le staging, la production et les autres applications. La construction des
  images Docker s'exécute sur la machine qui sert la production ; un build lourd
  peut la ralentir.
- **Un seul checkout** : déplacer le dépôt sur un autre commit pour le staging
  change ce que le prochain déploiement de la production construirait. D'où la
  règle du commit d'`origin/main` à arbre propre, validé au préalable sur le
  staging, et l'ordre imposé : staging d'abord, production ensuite.
- **Le front est figé à la compilation** : origine de l'API et panneau de démo
  ne se changent pas par une variable d'exécution, et chaque pile reconstruit
  sa propre image web. Deux garde-fous limitent l'erreur : `Dockerfile.web` n'a
  plus de valeur par défaut pour l'origine de l'API et masque le panneau par
  défaut, et seul `infra/environments/staging.conf` l'active. Une valeur
  oubliée fait échouer le build au lieu de viser la mauvaise origine.
- **Sauvegardes hors serveur indispensables avant la première donnée réelle** :
  `BACKUP_DIR` (dans `infra/environments/<env>.conf`) désigne un dossier du
  serveur, donc une panne de disque emporterait la production avec ses
  sauvegardes. Les scripts `infra/scripts/backup.sh` et
  `infra/scripts/restore-check.sh` sont là pour cela ; aucune donnée réelle
  n'est saisie en production avant qu'une copie hors serveur soit programmée
  et sa restauration éprouvée.
- **Amorçage d'une base neuve** : `migrate deploy` seul crée le schéma, pas les
  données de départ (rôles, permissions, catalogue, premier super-admin). Le
  seed de démonstration n'est pas une option : il efface la base et refuse de
  tourner en production (`AGENTS.md`). Voir la procédure d'amorçage.
- **Ressources à confirmer** : la disponibilité des ports 3020 et 5437 sur le
  serveur est à vérifier avant la création de la pile de production. Les URL de
  rappel déclarées chez des tiers (connexion Google, notifications de paiement)
  sont propres à chaque sous-domaine et sont à déclarer pour
  `clients.immotopia.cloud` avant la mise en service.
- **Risque de confusion** : les liens `app.immotopia.cloud` déjà distribués ne
  concernent que du test. Rien n'empêche techniquement quelqu'un d'y saisir de
  vraies données ; ce risque est reconnu, pas traité ici.

## Alternatives écartées

- **Inverser les rôles (`app.immotopia.cloud` en production, `clients` en
  staging).** Aucune migration à faire, mais les vraies URL de la marque
  resteraient sur le nom le plus ancien. Écarté : le choix produit est
  `clients.immotopia.cloud` en production, et aucune donnée réelle n'existe
  encore, donc rien ne justifie de contourner ce choix.
- **Renommer ou recréer la pile existante** (par exemple en `immotopia-staging`).
  Le nom du projet Compose est interne, invisible des utilisateurs, alors que le
  renommage ou la recréation toucherait les volumes nommés qui portent les
  données. Risque inutile.
- **Un second serveur pour la production.** Meilleure isolation (pannes,
  ressources, builds), mais hors budget aujourd'hui. À reconsidérer dès que la
  production porte de vrais clients ou que la charge l'exige ; la séparation
  décrite ici ne l'empêche pas.

## Liens

- `infra/compose/docker-compose.prod.yml`, `infra/compose/Dockerfile.web`
- `infra/environments/staging.conf`, `infra/environments/prod.conf`
- `infra/nginx/` (un vhost par sous-domaine, `spa.conf` pour l'image web)
- `infra/scripts/deploy.sh`, `infra/scripts/make-env.sh`,
  `infra/scripts/backup.sh`, `infra/scripts/restore-check.sh`,
  `infra/scripts/check-infra.sh`
- `infra/.env.example`
- `docs/workflows/DEPLOIEMENT.md` (procédure de déploiement et d'amorçage)
- `packages/api/src/utils/auth-cookies.ts`, `packages/api/src/config/env.ts`
- `.github/workflows/ci.yml` (job `infra`)
- [ADR-003](ADR-003-migration-hors-git-fonds-copropriete.md) : la « production »
  qu'il décrit est la pile `immotopia-saas`, devenue le staging ; la base
  neuve de la production n'a pas sa ligne orpheline.
- [ADR-004](ADR-004-assistant-ia-immocopilot.md) : `AI_PROVIDER` et le refus de
  `fake` en production.
