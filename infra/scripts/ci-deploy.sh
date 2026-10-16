#!/usr/bin/env bash
#
# Point d'entree du deploiement continu (GitHub Actions -> serveur).
#
#   ci-deploy.sh <staging|prod>                 # appel par SSH (cle a commande imposee)
#   ci-deploy.sh <staging|prod> <sha-40-hex>    # appel manuel au terminal, par le proprietaire
#
# Ce script est la SEULE chose que les cles SSH de la CI peuvent lancer. Il est
# pose dans authorized_keys du compte `deployer`, une cle par environnement :
#
#   command="/home/deployer/immotopia-saas/infra/scripts/ci-deploy.sh staging",restrict ssh-ed25519 AAAA... github-actions-immotopia-staging
#   command="/home/deployer/immotopia-saas/infra/scripts/ci-deploy.sh prod",restrict ssh-ed25519 AAAA... github-actions-immotopia-prod
#
# Le client SSH envoie `deploy <env> <sha>` ; sshd le range dans
# SSH_ORIGINAL_COMMAND, jamais dans les arguments. Le script l'exige IDENTIQUE a
# l'expression ^deploy (staging|prod) ([0-9a-f]{40})$ et l'environnement demande
# doit egaler celui que la cle autorise ($1). Sinon : refus, code de sortie 2,
# avant toute autre action (ni cd, ni git, ni docker).
#
# Ce que la cle permet : deployer, sur UN environnement, un commit de ce depot
# qui est deja dans origin/main, par ./infra/scripts/deploy.sh (et, pour la
# production, apres backup.sh et l'etiquetage des images). Ce qu'elle ne permet
# pas : un shell, une autre commande, un autre environnement, un commit hors de
# main, un transfert de port ou de fichier (`restrict`).
#
# Garde-fous : verrou propre a la CI, attente d'un deploy.sh manuel, arbre propre
# exige, refus de deplacer un essai manuel (HEAD hors de origin/main), travail
# detache de la session SSH (une connexion coupee ne tue jamais une migration).
#
# Sortie : seules les lignes d'etape (==>, OK, ECHEC, ATTENTION, Deploiement ...
# termine, Arret du deploiement, ci-deploy:) sont renvoyees par SSH, donc dans
# les journaux GitHub, lisibles par tous (depot public). Le journal COMPLET reste
# sur le serveur : ~/ci-deploy-logs/<date>-<env>-<sha court>.log (mode 600).
#
# Procedure de mise en service : docs/workflows/DEPLOIEMENT.md,
# section « Deploiement continu (GitHub Actions) » ; decision : ADR-008.

set -Eeuo pipefail

# Plages [0-9a-f] et tris independants de la locale (sinon A-F pourrait passer).
export LC_ALL=C

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32mOK\033[0m   %s\n' "$*"; }
fail() { printf '    \033[31mECHEC\033[0m %s\n' "$*" >&2; exit 1; }
warn() { printf '    \033[33mATTENTION\033[0m %s\n' "$*" >&2; }
say()  { printf 'ci-deploy: %s\n' "$*"; }

SHA_RE='^[0-9a-f]{40}$'
SSH_CMD_RE='^deploy (staging|prod) ([0-9a-f]{40})$'

# Refus d'arguments : code 2, message court. Ne reaffiche JAMAIS plus de 80
# caracteres d'une entree recue, et par %q (un caractere de controle ne peut
# pas fausser le journal).
refuse() {
  printf 'ci-deploy: refus : %s\n' "$1" >&2
  exit 2
}
quote80() { printf '%q' "${1:0:80}"; }

# Tout le corps est dans `main`, appelee par la derniere ligne du fichier.
# POURQUOI : le worker fait un `git checkout` / `git merge` qui peut REECRIRE CE
# FICHIER pendant qu'il tourne, et bash lit un script au fil de l'eau (il lit la
# suite au deplacement du curseur dans le fichier). Une fonction est lue en
# entier avant d'etre executee, et la derniere ligne (`main ...; exit $?`) est
# analysee avant son execution puis termine le processus : bash ne relit jamais
# un fichier modifie sous ses pieds. Les fonctions annexes (run_worker,
# filter_output) sont definies avant cette ligne, donc lues en entier elles aussi.
# Ne rien ajouter apres la derniere ligne.
main() {
  local old_umask script_path repo_root

  # --- 1. Validation des arguments : AVANT tout cd, git ou docker -------------
  local mode="entry" env="" sha="" key_env=""

  if [[ "${1:-}" == "--worker" ]]; then
    # Mode interne : lance par ce script lui-meme, jamais par SSH (la commande
    # imposee fixe $1). On revalide quand meme avec les memes regles.
    [[ $# -eq 3 ]] || refuse "usage interne : --worker <staging|prod> <sha>."
    mode="worker"
    env="$2"; sha="$3"
    case "$env" in
      staging|prod) ;;
      *) refuse "environnement inconnu : $(quote80 "$env")." ;;
    esac
    [[ "$sha" =~ $SHA_RE ]] || refuse "SHA invalide (40 caracteres hexadecimaux minuscules attendus)."
    [[ -n "${CI_DEPLOY_LOG:-}" ]] || refuse "mode --worker reserve a ce script (journal non fourni)."
  else
    key_env="${1:-}"
    case "$key_env" in
      staging|prod) ;;
      *) refuse "environnement absent ou inconnu : $(quote80 "$key_env") (staging ou prod)." ;;
    esac
    if [[ -n "${SSH_ORIGINAL_COMMAND+x}" ]]; then
      # Appel par SSH : la commande recue doit etre exactement `deploy <env> <sha>`.
      # Test d'expression reguliere seulement : jamais eval, jamais de decoupage
      # de la chaine par le shell.
      [[ $# -eq 1 ]] || refuse "arguments en trop."
      if [[ ! "$SSH_ORIGINAL_COMMAND" =~ $SSH_CMD_RE ]]; then
        refuse "commande SSH refusee : $(quote80 "$SSH_ORIGINAL_COMMAND")"
      fi
      env="${BASH_REMATCH[1]}"; sha="${BASH_REMATCH[2]}"
      [[ "$env" == "$key_env" ]] || refuse "cette cle ne deploie que '$key_env' (demande : '$env')."
    else
      # Appel manuel au terminal : le SHA complet est obligatoire.
      [[ $# -eq 2 ]] || refuse "usage : $0 <staging|prod> <sha-complet-de-40-caracteres>."
      env="$key_env"; sha="$2"
      [[ "$sha" =~ $SHA_RE ]] || refuse "SHA invalide (40 caracteres hexadecimaux minuscules attendus)."
    fi
  fi

  # --- 2. Emplacement : le depot se deduit de celui du script ------------------
  script_path="$(readlink -f "${BASH_SOURCE[0]}")"
  repo_root="$(cd "$(dirname "$script_path")/../.." && pwd)"

  if [[ "$mode" == "worker" ]]; then
    run_worker "$env" "$sha" "$repo_root"
    return $?
  fi

  # --- 3. Entree : lance le worker detache et suit son journal -----------------
  local log_dir short ts log pid rc_file rc i
  old_umask="$(umask)"
  umask 077                                   # dossier 700, journaux 600
  log_dir="$HOME/ci-deploy-logs"              # HORS du checkout (arbre git propre)
  mkdir -p -m 700 "$log_dir"
  # Purge des vieux journaux, dans ce seul dossier.
  find "$log_dir" -maxdepth 1 -type f -name '*.log*' -mtime +30 -delete || true

  short="${sha:0:8}"
  ts="$(date +%Y%m%d-%H%M%S)"
  log="$log_dir/$ts-$env-$short.log"
  rc_file="$log.rc"
  : > "$log"
  rm -f "$rc_file"
  umask "$old_umask"

  say "deploiement $env, commit $short (journal complet sur le serveur : $log)"

  # Detache de la session SSH : setsid (nouvelle session, plus de terminal), nohup
  # (ignore SIGHUP). Si la connexion tombe ou si le job GitHub est annule, ce
  # processus continue : une migration n'est jamais interrompue a mi-course.
  CI_DEPLOY_LOG="$log" setsid nohup "$script_path" --worker "$env" "$sha" > "$log" 2>&1 < /dev/null &
  pid=$!

  # Suit le journal jusqu'a la fin du worker, a travers le filtre de sortie.
  # `|| true` : grep sort en 1 s'il ne retient aucune ligne.
  tail --pid="$pid" -n +1 -f "$log" 2>/dev/null | filter_output || true

  # Code de sortie du worker : ecrit par son trap EXIT. Petite attente au cas
  # ou le systeme de fichiers n'a pas encore rendu le fichier visible.
  for i in 1 2 3 4 5; do
    [[ -s "$rc_file" ]] && break
    sleep 1
  done
  echo
  say "journal complet : $log"
  if [[ ! -s "$rc_file" ]]; then
    say "code de sortie du deploiement introuvable ($rc_file manque) : le worker a ete tue ou n'a pas fini. Voir le journal sur le serveur."
    return 1
  fi
  rc="$(tr -dc '0-9' < "$rc_file")"
  [[ -n "$rc" ]] || { say "fichier de code de sortie illisible ($rc_file)."; return 1; }
  say "code de sortie : $rc"
  return "$rc"
}

# Filtre de sortie : retire les codes couleur ANSI et ne laisse passer que les
# lignes d'etape. Tout le reste (construction Docker, journaux de conteneurs,
# diff des conteneurs voisins, recapitulatif `docker ps`) reste dans le journal
# du serveur. -u / --line-buffered : sortie en direct, sans attendre un tampon.
filter_output() {
  sed -u -E 's/\x1b\[[0-9;]*[A-Za-z]//g; s/\r$//' \
    | grep --line-buffered -E '^[[:space:]]*(==>|OK[[:space:]]|ECHEC|ATTENTION)|^Deploiement .* termine|^Arret du deploiement|^ci-deploy: '
}

# --- Worker : le vrai travail, detache de la session SSH ----------------------
run_worker() {
  local env="$1" sha="$2" repo_root="$3"
  local log="$CI_DEPLOY_LOG" head_before head_before_short branch stamp prod_version image status_lines

  # Le journal doit etre sous ~/ci-deploy-logs/ (valeur posee par l'entree).
  case "$log" in
    "$HOME"/ci-deploy-logs/*.log) ;;
    *) refuse "journal hors de ~/ci-deploy-logs." ;;
  esac
  [[ "$log" != *..* ]] || refuse "journal invalide."
  # RC_FILE est GLOBAL a dessein : le trap EXIT s'execute apres le retour de
  # cette fonction, quand ses variables locales n'existent plus.
  RC_FILE="$log.rc"

  # Le code de sortie est ecrit quoi qu'il arrive (succes, echec, exit, signal
  # attrape) : c'est lui que l'entree renvoie a GitHub. Ecriture atomique.
  trap 'rc=$?; ( umask 077; printf "%s\n" "$rc" > "$RC_FILE.tmp" && mv -f "$RC_FILE.tmp" "$RC_FILE" ) || true' EXIT
  trap 'echo >&2; echo "Arret du deploiement (ci-deploy, ligne $LINENO)." >&2' ERR

  # Le travail se fait avec les droits par defaut du compte (la construction
  # Docker copie des fichiers : un umask 077 les rendrait illisibles).
  umask 022
  # Jamais de remplacement des reglages par l'environnement (deploy.sh le refuse
  # pour la production, mais on ne le laisse meme pas arriver jusque la).
  unset IMMOTOPIA_ALLOW_OVERRIDE SSH_ORIGINAL_COMMAND
  export GIT_TERMINAL_PROMPT=0

  step "ci-deploy : $env, commit ${sha:0:8}"
  say "demarre le $(date -Iseconds), pid $$"

  cd "$repo_root"

  # a. Verrou propre a la CI, tenu pendant tout le worker (descripteur 8).
  step "Verrou du deploiement continu"
  command -v flock >/dev/null 2>&1 || fail "flock est absent : le deploiement continu exige un verrou."
  exec 8>/tmp/immotopia-ci-deploy.lock
  flock -w 1800 8 || fail "un autre deploiement continu est deja en cours (verrou /tmp/immotopia-ci-deploy.lock, attente de 30 min depassee)."
  ok "verrou /tmp/immotopia-ci-deploy.lock pris"

  # b. Attendre qu'aucun deploy.sh manuel ne tourne. On prend puis on relache
  #    aussitot le verrou de deploy.sh. Fenetre de course restante : un deploy.sh
  #    manuel lance ENTRE ce test et la prise du verrou par notre propre
  #    deploy.sh. Dans ce cas c'est le notre qui echoue tout de suite sur son
  #    verrou (« un autre deploy.sh est deja en cours ») : rien n'est abime. En
  #    production, deploy.sh revérifie de toute facon HEAD et l'arbre juste
  #    avant la construction et avant les migrations.
  step "Attente d'un eventuel deploy.sh manuel"
  flock -w 1800 /tmp/immotopia-deploy.lock true \
    || fail "un deploy.sh manuel tient son verrou depuis plus de 30 min : abandon."
  ok "aucun deploy.sh manuel en cours"

  # c. Le commit doit exister et appartenir a origin/main.
  step "Verification du commit"
  git fetch --quiet origin || fail "git fetch origin a echoue."
  git cat-file -e "$sha^{commit}" 2>/dev/null || fail "le commit ${sha:0:8} est inconnu de ce depot (apres git fetch)."
  git merge-base --is-ancestor "$sha" refs/remotes/origin/main \
    || fail "le commit ${sha:0:8} n'est pas dans origin/main : seul un commit de main se deploie."
  ok "commit ${sha:0:8} present dans origin/main"

  # d. Arbre propre, fichiers non suivis compris : on n'ecrase jamais un travail
  #    manuel sur le serveur. Les noms de fichiers restent dans le journal du
  #    serveur (le filtre ne les laisse pas passer).
  step "Arbre de travail"
  status_lines="$(git status --porcelain)"
  if [[ -n "$status_lines" ]]; then
    git status --short | head -n 20
    fail "l'arbre git du serveur n'est pas propre ($(printf '%s\n' "$status_lines" | wc -l) entree(s) : voir le journal du serveur) : rien n'est ecrase. Nettoyer a la main puis relancer."
  fi
  ok "arbre propre"

  # e. HEAD actuel doit deja etre dans origin/main : on ne deplace jamais un essai manuel.
  head_before="$(git rev-parse HEAD)"
  head_before_short="${head_before:0:8}"
  git merge-base --is-ancestor "$head_before" refs/remotes/origin/main \
    || fail "le checkout est sur un commit hors de main (essai manuel ?) : le remettre sur origin/main avant de relancer."
  ok "checkout actuel sur $head_before_short (dans origin/main)"

  # f. Placement sur le commit demande.
  step "Placement du checkout sur ${sha:0:8}"
  if [[ "$head_before" == "$sha" ]]; then
    ok "deja sur ${sha:0:8}"
  else
    branch="$(git symbolic-ref -q --short HEAD || true)"
    if [[ "$branch" == "main" ]] && git merge-base --is-ancestor "$head_before" "$sha"; then
      git merge --ff-only --quiet "$sha" || fail "git merge --ff-only a echoue."
    else
      git checkout --quiet --detach "$sha" || fail "git checkout --detach a echoue."
    fi
    [[ "$(git rev-parse HEAD)" == "$sha" ]] || fail "le checkout n'est pas sur ${sha:0:8} apres le placement."
    ok "checkout sur ${sha:0:8}"
  fi

  # g. Production : sauvegarde, puis etiquettes de retour arriere.
  if [[ "$env" == "prod" ]]; then
    step "Sauvegarde de la production"
    ./infra/scripts/backup.sh prod || fail "backup.sh prod a echoue : la production n'est pas deployee."
    ok "sauvegarde terminee"

    step "Etiquetage des images de la production (retour arriere)"
    # L'etiquette porte la version que la production fait tourner, lue dans son
    # journal des deploiements (3e colonne de la derniere ligne), et non le HEAD
    # du checkout : le staging a pu le deplacer depuis.
    stamp="avant-$(date +%Y%m%d-%H%M%S)"
    prod_version="$(tail -n 1 "$HOME/deploy-history-immotopia-prod.log" 2>/dev/null | cut -f3 || true)"
    if [[ "$prod_version" =~ ^[0-9a-f]{7,40}$ ]]; then
      stamp="$stamp-$prod_version"
    fi
    for image in immotopia-prod-api immotopia-prod-web; do
      if docker image inspect "$image:latest" >/dev/null 2>&1; then
        docker tag "$image:latest" "$image:$stamp" \
          || fail "docker tag $image a echoue."
        ok "$image:$stamp"
      else
        warn "$image:latest n'existe pas : rien a etiqueter (premier deploiement ?)."
      fi
    done
  fi

  # h. Deploiement : son code de sortie devient celui du worker.
  step "deploy.sh $env"
  local rc=0
  ./infra/scripts/deploy.sh "$env" || rc=$?
  if (( rc == 0 )); then
    ok "deploy.sh $env termine"
  else
    printf '    \033[31mECHEC\033[0m deploy.sh %s a echoue (code %s) : journal complet sur le serveur.\n' "$env" "$rc" >&2
  fi
  return "$rc"
}

main "$@"; exit $?
