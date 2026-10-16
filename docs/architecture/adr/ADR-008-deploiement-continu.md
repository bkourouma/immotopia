# ADR-008 : déploiement continu du staging, production sur bouton avec approbation

## Statut

Proposé (non éprouvé : aucun essai réel à la date de rédaction)

## Date

2026-10-16

## Contexte

Le déploiement est aujourd'hui entièrement manuel : le propriétaire se connecte
en `ssh -p 2222 deployer@147.93.44.169` et lance `./infra/scripts/deploy.sh
staging|prod` depuis `/home/deployer/immotopia-saas`, un **seul checkout git**
qui sert les deux piles ([ADR-005](ADR-005-environnements-staging-production.md)).

Faits qui pèsent sur la décision :

- Le serveur est **partagé** avec une vingtaine d'autres applications ; Docker,
  disque, processeur et nginx sont communs au staging, à la production et à ces
  applications. Une construction d'images est lourde.
- Le dépôt GitHub `bkourouma/immotopia` est **public** : les journaux des
  workflows sont lisibles par tous, et un fork peut ouvrir des pull requests (et
  nommer sa branche `main`).
- Une dizaine de branches de travail vivent en parallèle ; une seule base de test
  (le staging) et un seul checkout serveur existent.
- `deploy.sh prod` exige déjà un commit d'`origin/main`, un arbre propre, une
  sauvegarde de moins de 24 heures et prend un verrou (`flock`). Ses contrôles
  restent la référence.
- La production porte de vrais clients : aucun déploiement sans décision humaine.

## Décision

1. **Le staging se déploie en continu depuis `main`.** Un push sur `main` dont la
   CI est verte déclenche le workflow `.github/workflows/deploy.yml`, tant que la
   variable de dépôt `AUTO_DEPLOY_STAGING` vaut `true` (interrupteur et arrêt
   d'urgence). Les autres branches ne déploient rien.
2. **La production ne se déploie que sur bouton** (`workflow_dispatch`), derrière
   l'approbation d'un environnement GitHub `production` à relecteur obligatoire.
   Par défaut elle reçoit le **commit du dernier déploiement réussi du staging** :
   on promeut ce qui a été validé. La sauvegarde (`backup.sh prod`) et
   l'étiquetage des images pour le retour arrière sont faits automatiquement avant.
3. **Le transport est une connexion SSH à commande imposée**, pas un agent installé
   sur le serveur ni un accès Docker distant. Une clé ed25519 **par
   environnement** est posée dans `authorized_keys` avec `command="…/ci-deploy.sh
<env>",restrict` : elle ne peut lancer que ce script, qui n'accepte que
   `deploy <env> <sha>` (40 hexadécimaux), pour l'environnement de la clé, sur un
   commit d'`origin/main`.
4. **`ci-deploy.sh` ajoute ses propres garde-fous** : verrou propre à la CI,
   attente d'un `deploy.sh` manuel, arbre propre, refus de déplacer un checkout
   resté sur un commit hors de `main` (essai manuel), travail **détaché de la
   session SSH** (une connexion coupée ne tue jamais une migration), code de sortie
   conservé dans un fichier.
5. **Journaux filtrés.** Seules les lignes d'étape reviennent à GitHub ; le
   journal complet reste sur le serveur (`~/ci-deploy-logs/`, mode 600, 30 jours).
6. **Jamais annulé en cours** : un groupe `concurrency` par environnement, sans
   `cancel-in-progress` (un groupe commun laisserait un push sur `main` annuler
   un déploiement de production en attente) ; le verrou de `ci-deploy.sh` garde
   un seul déploiement à la fois sur le serveur. Une exécution automatique dont le commit n'est plus la
   tête de `main` est écartée : on ne recule jamais le staging.
7. Le déploiement automatique n'accepte que le même dépôt, un `push`, la branche
   `main` et une CI réussie (un fork ne déclenche rien avec les secrets).

## Conséquences positives

- Le staging reflète `main` sans intervention : plus d'oubli, plus d'écart entre
  ce qui est fusionné et ce qui est testé.
- La production reste une décision humaine, tracée (qui, quand, quel commit), sur
  un commit déjà validé en staging, avec sauvegarde et étiquettes de retour arrière
  faites à chaque fois.
- La clé de la CI ne vaut presque rien si elle fuit : un seul script, un seul
  environnement, aucun shell. La couper est immédiat (retirer une ligne ou mettre
  la variable à `false`).
- Aucun nouveau logiciel sur le serveur : `ssh`, `git`, `flock`, `docker` existent
  déjà ; le déploiement manuel reste utilisable en repli.

## Conséquences négatives

- **Non éprouvé.** Clés, `known_hosts`, environnements GitHub, détachement et
  filtre n'ont jamais tourné pour de vrai ; la mise en service se fait pas à pas,
  staging d'abord.
- **Un essai manuel sur le serveur bloque le déploiement automatique** tant que le
  checkout n'est pas remis sur `origin/main` : c'est voulu (on n'écrase pas un
  travail manuel), mais il faut le savoir.
- **Le staging est déployé sans sauvegarde préalable** par ce chemin.
- **Journaux publics** : le filtre réduit le risque sans le supprimer (un message
  `ECHEC` de `deploy.sh` peut citer une URL ou un nom de variable).
- **Dépendance à GitHub** (disponibilité, registre des déploiements) pour le
  chemin automatique ; le chemin manuel par SSH reste disponible.
- Le serveur fait son `git fetch` en HTTPS sans identifiant : il suppose un dépôt
  public.
- Le registre des déploiements de GitHub garde le SHA de l'exécution : le staging
  refuse un commit saisi à la main différent de la tête de `main`, pour que la
  promotion en production lise un commit réellement déployé.

## Alternatives écartées

- **Déployer le staging à chaque push de n'importe quelle branche.** Écarté : une
  dizaine de branches en parallèle sur un seul checkout et une seule base de test
  se marcheraient dessus (migrations contradictoires, états illisibles), et chaque
  push relancerait une construction lourde sur un serveur partagé.
- **Production automatique après le staging.** Écarté : aucune validation humaine
  avant de vrais clients ; les migrations ne se défont pas.
- **Runner GitHub auto-hébergé sur le serveur.** Écarté : il exécuterait du code
  venu de pull requests sur un serveur partagé avec les autres applications, avec
  un dépôt public ; le moindre workflow mal protégé donnerait la main sur l'hôte.
- **Agent ou webhook de déploiement sur le serveur**, ou **accès Docker distant**
  (socket exposé, contexte Docker par SSH). Écartés : un service de plus à
  sécuriser et à tenir à jour, et un accès Docker équivaut à un accès
  administrateur de l'hôte, donc de toutes les applications voisines.

## Liens

- `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`
- `infra/scripts/ci-deploy.sh`, `infra/scripts/deploy.sh`,
  `infra/scripts/backup.sh`, `infra/scripts/check-infra.sh`
- [DEPLOIEMENT.md](../../workflows/DEPLOIEMENT.md), section « Déploiement continu
  (GitHub Actions) » (mise en service pas à pas, arrêt d'urgence)
- [SECURITY.md](../../governance/SECURITY.md), section 8
- [ADR-005](ADR-005-environnements-staging-production.md) : environnements staging
  et production, un seul checkout.
