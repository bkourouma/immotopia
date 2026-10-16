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
# qui est deja dans origin/main, par ./infra/scripts/deploy.sh. Pour la
# production, le commit doit en plus avoir deja ete deploye AVEC SUCCES sur le
# staging (journal des deploiements du staging) et ne doit pas etre un retour
# arriere (un retour arriere se fait a la main : DEPLOIEMENT.md, « Retour
# arriere »). Ce qu'elle ne permet pas : un shell, une autre commande, un autre
# environnement, un commit hors de main, un transfert de port ou de fichier
# (`restrict`).
#
# Garde-fous : verrou propre a la CI, une seule place d'attente, abandon si le
# client SSH est parti avant le debut du travail, attente d'un deploy.sh manuel,
# arbre propre exige, refus de deplacer un essai manuel (HEAD hors de
# origin/main), travail detache de la session SSH (une connexion coupee ne tue
# jamais une migration une fois le placement du checkout commence).
#
# CANAL PUBLIC. Les journaux GitHub sont lisibles par tous (depot public). Rien
# de ce que deploy.sh, backup.sh, git ou docker impriment n'est filtre puis
# renvoye : le worker ecrit en parallele, dans un fichier dedie
# `<journal>.public`, uniquement les messages de CE script et les titres des
# etapes `==>` de deploy.sh (chaines fixes). L'entree ne suit que ce fichier.
# Le journal COMPLET reste sur le serveur :
# ~/ci-deploy-logs/<date>-<env>-<sha court>-<pid>.log (mode 600, 30 jours).
#
# DECALAGE DE VERSION. Le worker execute la version de ce script qui existait
# AVANT le placement du checkout : un changement de ci-deploy.sh ne s'applique
# qu'au deploiement SUIVANT (le worker en cours n'est pas relance).
#
# Procedure de mise en service : docs/workflows/DEPLOIEMENT.md,
# section « Deploiement continu (GitHub Actions) » ; decision : ADR-008.

set -Eeuo pipefail

# Plages [0-9a-f] et tris independants de la locale (sinon A-F pourrait passer).
export LC_ALL=C

# Canal public (fd 3), ouvert par le worker seulement.
PUB_OPEN=0
pub() {
  (( PUB_OPEN )) || return 0
  local msg="$*"
  printf '%s\n' "${msg//[[:cntrl:]]/}" >&3 || true
}

# Chaque message va au journal complet (stdout/stderr) ET, sans couleur, au canal public.
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; pub "==> $*"; }
ok()   { printf '    \033[32mOK\033[0m   %s\n' "$*"; pub "    OK   $*"; }
fail() { printf '    \033[31mECHEC\033[0m %s\n' "$*" >&2; pub "    ECHEC $*"; exit 1; }
warn() { printf '    \033[33mATTENTION\033[0m %s\n' "$*" >&2; pub "    ATTENTION $*"; }
say()  { printf 'ci-deploy: %s\n' "$*"; pub "ci-deploy: $*"; }

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
# relay_deploy, ...) sont definies avant cette ligne, donc lues en entier elles
# aussi. Ne rien ajouter apres la derniere ligne.
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
    [[ "${CI_DEPLOY_PARENT:-}" =~ ^[0-9]{1,10}$ ]] || refuse "mode --worker reserve a ce script (pid de l'entree non fourni)."
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

  # --- 3. Entree : lance le worker detache et suit le canal public --------------
  local log_dir short ts log pid rc_file rc i
  old_umask="$(umask)"
  umask 077                                   # dossier 700, journaux 600
  log_dir="$HOME/ci-deploy-logs"              # HORS du checkout (arbre git propre)
  mkdir -p -m 700 "$log_dir"
  # Purge des vieux journaux, dans ce seul dossier.
  find "$log_dir" -maxdepth 1 -type f -name '*.log*' -mtime +30 -delete || true

  short="${sha:0:8}"
  ts="$(date +%Y%m%d-%H%M%S)"
  log="$log_dir/$ts-$env-$short-$$.log"       # le pid rend le nom unique
  rc_file="$log.rc"
  : > "$log"
  : > "$log.public"
  rm -f "$rc_file"
  umask "$old_umask"

  say "deploiement $env, commit $short (journal complet sur le serveur : $log)"

  # Detache de la session SSH : setsid (nouvelle session, plus de terminal), nohup
  # (ignore SIGHUP). Si la connexion tombe ou si le job GitHub est annule APRES
  # le debut du travail, ce processus continue : une migration n'est jamais
  # interrompue a mi-course. Avant le debut (file d'attente), le worker s'arrete
  # seul quand il constate que cette entree (CI_DEPLOY_PARENT) n'existe plus.
  CI_DEPLOY_LOG="$log" CI_DEPLOY_PARENT="$$" \
    setsid nohup "$script_path" --worker "$env" "$sha" > "$log" 2>&1 < /dev/null &
  pid=$!

  # Suit UNIQUEMENT le canal public, jusqu'a la fin du worker. On retire les
  # sequences ANSI et les caracteres de controle. `|| true` : si la connexion est
  # fermee, sed meurt de SIGPIPE : l'entree s'arrete, le worker continue.
  tail --pid="$pid" -n +1 -f "$log.public" 2>/dev/null \
    | sed -u -E 's/\x1b\[[0-9;]*[A-Za-z]//g; s/[[:cntrl:]]//g' || true

  # Si le worker vit encore, la sortie est morte (le client SSH est parti : sed
  # est mort de SIGPIPE, puis tail). On laisse un marqueur que le worker consulte
  # avant de commencer, et on s'arrete tout de suite sans attendre le .rc.
  if kill -0 "$pid" 2>/dev/null && [[ ! -e "$rc_file" ]]; then
    ( umask 077; : > "$log.parti" )
    return 1
  fi

  # Code de sortie du worker : ecrit par son trap EXIT (jamais lu dans un
  # journal). Petite attente au cas ou le systeme de fichiers n'a pas encore
  # rendu le fichier visible.
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

# Le client SSH est-il encore la ? Non si l'entree a pose le marqueur .parti
# (sa sortie est morte alors que le worker vivait) ou si elle n'existe plus.
client_present() {
  [[ ! -e "$CI_DEPLOY_LOG.parti" ]] && kill -0 "$CI_DEPLOY_PARENT" 2>/dev/null
}

# Attend un verrou par tranches de 30 s (la commande $2... prend le verrou et
# sort en 0 si elle l'obtient). A chaque tour : si le client SSH est parti avant
# le debut du travail, on abandonne sans rien deployer.
# Le message d'attente va aussi au canal public. Plafond : 20 minutes.
wait_for_lock() {
  local label="$1" waited=0
  shift
  until "$@"; do
    client_present \
      || fail "la connexion CI s'est fermee avant le debut : rien n'est deploye."
    waited=$((waited + 30))
    (( waited < 1200 )) || fail "$label : attente de 20 minutes depassee, rien n'est deploye."
    say "en attente du verrou $label (${waited} s)"
  done
}

# Lecteur de la sortie de deploy.sh : tout va au journal complet ; au canal
# public, SEULS les titres des etapes `==> ` (chaines fixes de deploy.sh). On ne
# retient que la forme exacte emise par sa fonction step (couleur bleue gras,
# remise a zero) et un titre court de caracteres ordinaires : une ligne de
# journal de conteneur ne peut pas se faire passer pour une etape.
relay_deploy() {
  local line title
  local open=$'\e[1;34m==> ' close=$'\e[0m' re="^[A-Za-z0-9 ,.()'_-]{1,100}$"
  while IFS= read -r line || [[ -n "$line" ]]; do
    printf '%s\n' "$line"
    if [[ "$line" == "$open"*"$close" ]]; then
      title="${line#"$open"}"
      title="${title%"$close"}"
      if [[ "$title" =~ $re ]]; then
        pub "deploy.sh ==> $title"
      fi
    fi
  done
}

# --- Worker : le vrai travail, detache de la session SSH ----------------------
run_worker() {
  local env="$1" sha="$2" repo_root="$3"
  local log="$CI_DEPLOY_LOG" log_dir head_before head_before_short branch stamp prod_version image status_lines
  local hist deployed_on_staging col2 col3 prod_commit

  # Le journal doit etre directement sous ~/ci-deploy-logs/ (valeur posee par l'entree).
  case "$log" in
    "$HOME"/ci-deploy-logs/*.log) ;;
    *) refuse "journal hors de ~/ci-deploy-logs." ;;
  esac
  log_dir="$HOME/ci-deploy-logs"
  [[ "${log#"$log_dir"/}" != */* && "$log" != *..* ]] || refuse "journal invalide."
  # RC_FILE est GLOBAL a dessein : le trap EXIT s'execute apres le retour de
  # cette fonction, quand ses variables locales n'existent plus.
  RC_FILE="$log.rc"

  # Canal public : fd 3, en ajout, fichier cree par l'entree (mode 600).
  umask 077
  exec 3>>"$log.public"
  PUB_OPEN=1

  # Le code de sortie est ecrit quoi qu'il arrive (succes, echec, exit, signal
  # attrape) : c'est lui que l'entree renvoie a GitHub. Ecriture atomique.
  trap 'rc=$?; ( umask 077; printf "%s\n" "$rc" > "$RC_FILE.tmp" && mv -f "$RC_FILE.tmp" "$RC_FILE" ) || true' EXIT
  trap 'echo >&2; echo "Arret du deploiement (ci-deploy, ligne $LINENO)." >&2; pub "    ECHEC arret inattendu de ci-deploy : voir le journal complet du serveur"' ERR

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

  # a. File d'attente : une seule place (verrou .attente.lock, fd 7) et un seul
  #    deploiement CI a la fois (verrou .ci.lock, fd 8). Les verrous sont dans le
  #    dossier 700 des journaux, pas dans /tmp (lisible et creable par tous).
  step "Verrou du deploiement continu"
  command -v flock >/dev/null 2>&1 || fail "flock est absent : le deploiement continu exige un verrou."
  exec 7>"$log_dir/.attente.lock" || fail "ouverture de .attente.lock impossible."
  flock -n 7 || fail "un deploiement CI attend deja son tour : reessayer plus tard."
  exec 8>"$log_dir/.ci.lock" || fail "ouverture de .ci.lock impossible."
  wait_for_lock "du deploiement CI" flock -w 30 8
  exec 7>&-                                   # la place d'attente est liberee
  ok "verrou du deploiement continu pris"

  # b. Attendre qu'aucun deploy.sh manuel ne tourne. On prend puis on relache
  #    aussitot le verrou de deploy.sh. Fenetre de course restante : un deploy.sh
  #    manuel lance ENTRE ce test et la prise du verrou par notre propre
  #    deploy.sh. Dans ce cas c'est le notre qui echoue tout de suite sur son
  #    verrou (« un autre deploy.sh est deja en cours ») : rien n'est abime. En
  #    production, deploy.sh revérifie de toute facon HEAD et l'arbre juste
  #    avant la construction et avant les migrations.
  step "Attente d'un eventuel deploy.sh manuel"
  wait_for_lock "de deploy.sh" flock -w 30 /tmp/immotopia-deploy.lock true
  ok "aucun deploy.sh manuel en cours"

  # Dernier controle de presence du client, car les verrous ont pu etre obtenus
  # sans aucun tour d'attente (le deploiement precedent a fini avant 30 s). Une
  # coupure SSH ne tue l'entree qu'en ECRIVANT : la premiere ecriture tue sed, la
  # seconde tue tail (qui lit le fichier chaque seconde), et seulement alors
  # l'entree constate que le worker vit encore et pose .parti. D'ou deux lignes
  # publiques, espacees de plus d'une seconde, avant de decider.
  say "verrous obtenus, verification de la connexion CI"
  sleep 2
  say "connexion CI : controle"
  sleep 3
  client_present \
    || fail "la connexion CI s'est fermee avant le debut : rien n'est deploye."

  # A partir d'ici le travail commence : plus aucun abandon, il va au bout.

  # c. Le commit doit exister, appartenir a origin/main et embarquer ce script.
  step "Verification du commit"
  git fetch --quiet origin || fail "git fetch origin a echoue."
  git cat-file -e "$sha^{commit}" 2>/dev/null || fail "le commit ${sha:0:8} est inconnu de ce depot (apres git fetch)."
  git merge-base --is-ancestor "$sha" refs/remotes/origin/main \
    || fail "le commit ${sha:0:8} n'est pas dans origin/main : seul un commit de main se deploie."
  # Sans ce fichier dans le commit, `command=` pointerait sur un fichier disparu
  # apres le placement et la CI deviendrait inutilisable.
  git cat-file -e "$sha:infra/scripts/ci-deploy.sh" 2>/dev/null \
    || fail "le commit ${sha:0:8} n'embarque pas infra/scripts/ci-deploy.sh : le deploiement le supprimerait du serveur."
  ok "commit ${sha:0:8} present dans origin/main, ci-deploy.sh inclus"

  # c bis. Production : la cle prod ne contourne pas la validation par le staging.
  if [[ "$env" == "prod" ]]; then
    step "Controles propres a la production"
    # 1. Le commit doit deja avoir ete deploye AVEC SUCCES sur le staging : une
    #    ligne du journal des deploiements du staging (date, env, SHA court,
    #    utilisateur ; separees par des tabulations). Ferme par defaut.
    hist="$HOME/deploy-history-immotopia-saas.log"
    [[ -r "$hist" ]] || fail "journal des deploiements du staging illisible : la production exige un commit deja valide sur le staging."
    deployed_on_staging=0
    while IFS=$'\t' read -r _ col2 col3 _ || [[ -n "${col2:-}" ]]; do
      if [[ "$col2" == "staging" && "$col3" =~ ^[0-9a-f]{7,40}$ && "$sha" == "$col3"* ]]; then
        deployed_on_staging=1
        break
      fi
    done < "$hist"
    (( deployed_on_staging )) \
      || fail "le commit ${sha:0:8} n'a jamais ete deploye avec succes sur le staging."
    ok "commit ${sha:0:8} deja deploye avec succes sur le staging"

    # 2. Pas de retour arriere par la CI : la version que la production fait
    #    tourner (3e colonne de la derniere ligne de son journal) ne doit pas etre
    #    un descendant du commit demande. Journal absent ou illisible : refus
    #    (le premier deploiement de la production se fait a la main).
    [[ -r "$HOME/deploy-history-immotopia-prod.log" ]] \
      || fail "journal des deploiements de la production illisible : le premier deploiement se fait a la main."
    prod_version="$(tail -n 1 "$HOME/deploy-history-immotopia-prod.log" | cut -f3)"
    [[ "$prod_version" =~ ^[0-9a-f]{7,40}$ ]] \
      || fail "version de la production illisible dans son journal des deploiements."
    prod_commit="$(git rev-parse --verify -q "${prod_version}^{commit}" || true)"
    [[ -n "$prod_commit" ]] \
      || fail "la version de la production ($prod_version) est inconnue de ce depot."
    if [[ "$prod_commit" != "$sha" ]] && git merge-base --is-ancestor "$sha" "$prod_commit"; then
      fail "retour arriere refuse par la CI : voir « Retour arriere » dans DEPLOIEMENT.md (voie manuelle)."
    fi
    ok "pas de retour arriere (production sur $prod_version)"
  fi

  # d. Arbre propre, fichiers non suivis compris : on n'ecrase jamais un travail
  #    manuel sur le serveur. Les noms de fichiers restent dans le journal du
  #    serveur (jamais sur le canal public).
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

  # g. Production : sauvegarde, puis etiquettes de retour arriere. La sortie de
  #    backup.sh va au journal complet seulement.
  if [[ "$env" == "prod" ]]; then
    step "Sauvegarde de la production"
    ./infra/scripts/backup.sh prod || fail "backup.sh prod a echoue : la production n'est pas deployee (voir le journal du serveur)."
    ok "sauvegarde terminee"

    step "Etiquetage des images de la production (retour arriere)"
    # L'etiquette porte la version que la production fait tourner (lue plus haut
    # dans son journal des deploiements), et non le HEAD du checkout : le staging
    # a pu le deplacer depuis.
    stamp="avant-$(date +%Y%m%d-%H%M%S)-$prod_version"
    for image in immotopia-prod-api immotopia-prod-web; do
      if docker image inspect "$image:latest" >/dev/null 2>&1; then
        docker tag "$image:latest" "$image:$stamp" \
          || fail "docker tag $image a echoue."
        ok "$image:$stamp"
      else
        warn "$image:latest n'existe pas : rien a etiqueter."
      fi
    done
  fi

  # h. Deploiement : son code de sortie devient celui du worker. Toute la sortie
  #    de deploy.sh va au journal complet ; seuls les titres d'etape passent au
  #    canal public (relay_deploy).
  # A partir d'ici le resultat est rapporte explicitement : le piege ERR se
  # declencherait sur le pipeline `deploy.sh | relay_deploy` meme sous `set +e` et
  # publierait un faux « arret inattendu ». Le piege EXIT ecrit toujours le .rc.
  trap - ERR
  step "deploy.sh $env"
  local rc=0
  set +e
  ./infra/scripts/deploy.sh "$env" 2>&1 | relay_deploy
  rc=${PIPESTATUS[0]}
  set -e
  if (( rc == 0 )); then
    ok "deploy.sh $env termine"
  else
    fail_public_rc "$rc"
  fi
  return "$rc"
}

# Echec de deploy.sh : message public fixe (aucune sortie de deploy.sh).
fail_public_rc() {
  printf '    \033[31mECHEC\033[0m deploy.sh a echoue (code %s)\n' "$1" >&2
  pub "    ECHEC deploy.sh a echoue (code $1) : raison dans le journal complet du serveur"
}

main "$@"; exit $?
