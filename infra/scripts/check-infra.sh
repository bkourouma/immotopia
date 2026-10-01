#!/usr/bin/env bash
#
# Controle statique de l'infrastructure, sans secret, en local comme en CI :
#
#   bash infra/scripts/check-infra.sh
#
#  1. `bash -n` sur tous les scripts de infra/scripts ;
#  2. les scripts a environnement refusent un argument absent ou inconnu ;
#  3. pour staging et prod : rendu `docker compose config` avec un fichier
#     d'environnement factice, puis assertions sur les noms, ports et volumes
#     (les deux piles doivent rester etanches ; tout port publie est lie a
#     127.0.0.1, l'API n'en publie aucun) ;
#  4. dans un depot git : les scripts suivis ont le mode 100755 dans l'index.
#
# Sans docker, les etapes 3 sont ignorees (code 0) sauf si CI=true (echec).

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

FAILED=0
ok()   { printf 'OK     %s\n' "$*"; }
ko()   { printf 'ECHEC  %s\n' "$*" >&2; FAILED=1; }

# --- 1. Syntaxe des scripts -------------------------------------------------
for script in infra/scripts/*.sh; do
  if bash -n "$script" 2>/dev/null; then ok "bash -n $script"; else ko "bash -n $script"; bash -n "$script" || true; fi
done

# --- 2. Arguments d'environnement obligatoires ------------------------------
for script in deploy make-env set-google-oauth set-email-smtp backup bootstrap pull-backups; do
  for arg in "" "dev" "production"; do
    rc=0
    bash "infra/scripts/$script.sh" $arg >/dev/null 2>&1 || rc=$?
    if [[ "$rc" == "2" ]]; then ok "$script.sh '${arg}' -> usage (2)"; else ko "$script.sh '${arg}' devrait sortir en 2, code $rc"; fi
  done
done
# seed-pack-tests : seul `staging` est accepte ; `prod` est refuse (code 2) avant toute action.
for arg in "" "dev" "prod" "production"; do
  rc=0
  bash infra/scripts/seed-pack-tests.sh $arg >/dev/null 2>&1 || rc=$?
  if [[ "$rc" == "2" ]]; then ok "seed-pack-tests.sh '${arg}' -> refus (2)"; else ko "seed-pack-tests.sh '${arg}' devrait sortir en 2, code $rc"; fi
done
rc=0; bash infra/scripts/restore-check.sh >/dev/null 2>&1 || rc=$?
[[ "$rc" == "2" ]] && ok "restore-check.sh sans argument -> usage (2)" || ko "restore-check.sh sans argument devrait sortir en 2, code $rc"

# --- 3. Rendu Compose -------------------------------------------------------
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  if [[ "${CI:-}" == "true" ]]; then
    ko "docker compose est absent alors que CI=true."
    exit 1
  fi
  echo "docker compose absent : rendu Compose ignore (definir CI=true pour l'exiger)."
  (( FAILED )) && exit 1
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# Chemin lisible par docker aussi sous Git Bash / Windows.
if command -v cygpath >/dev/null 2>&1; then TMP_DOCKER="$(cygpath -m "$TMP")"; else TMP_DOCKER="$TMP"; fi

# Fichier d'environnement factice : de quoi satisfaire les ${VAR:?} de Compose.
printf 'POSTGRES_USER=u\nPOSTGRES_PASSWORD=p\nPOSTGRES_DB=d\n' > "$TMP/fake.env"

render() { # $1 = staging|prod -> $TMP/<env>.yml
  local env="$1"
  (
    export IMMOTOPIA_ENV_FILE="$TMP_DOCKER/fake.env"
    set -a
    # shellcheck disable=SC1090
    source "infra/environments/${env}.conf"
    set +a
    docker compose -p "$STACK_NAME" --env-file "$TMP_DOCKER/fake.env" \
      -f infra/compose/docker-compose.prod.yml config -q
    docker compose -p "$STACK_NAME" --env-file "$TMP_DOCKER/fake.env" \
      -f infra/compose/docker-compose.prod.yml config > "$TMP/${env}.yml"
  )
}

for env in staging prod; do
  if render "$env"; then ok "docker compose config ($env)"; else ko "docker compose config ($env)"; fi
done

# Sans variables, Compose doit refuser (aucune valeur par defaut dangereuse).
if ( unset STACK_NAME WEB_PORT PG_PORT PUBLIC_ORIGIN VITE_SHOW_DEMO_ACCOUNTS IMMOTOPIA_ENV_FILE
     docker compose -f infra/compose/docker-compose.prod.yml config -q ) >/dev/null 2>&1; then
  ko "Compose accepte le fichier sans STACK_NAME : une commande manuelle pourrait viser la mauvaise pile."
else
  ok "Compose refuse un lancement sans variables d'environnement"
fi

assert_has()  { grep -Fq -- "$2" "$TMP/$1.yml" && ok "$1 contient « $2 »" || ko "$1 devrait contenir « $2 »"; }
assert_lacks() { if grep -Fq -- "$2" "$TMP/$1.yml"; then ko "$1 ne devrait PAS contenir « $2 »"; else ok "$1 ne contient pas « $2 »"; fi; }

if [[ -s "$TMP/staging.yml" && -s "$TMP/prod.yml" ]]; then
  assert_has staging 'immotopia-saas-api'
  assert_has staging '"3019"'
  assert_has staging 'VITE_SHOW_DEMO_ACCOUNTS: "true"'
  assert_lacks staging 'immotopia-prod'
  assert_has prod 'immotopia-prod-api'
  assert_has prod '"3020"'
  assert_has prod 'VITE_SHOW_DEMO_ACCOUNTS: "false"'
  assert_lacks prod 'immotopia-saas'

  # Noms de volumes, reseaux et conteneurs (les cles `name:` des sections
  # networks/volumes, et container_name) : les deux piles doivent etre disjointes.
  names() {
    awk '
      /^[a-z]/ { section = $1 }
      section == "networks:" || section == "volumes:" { if ($1 == "name:") print $2 }
      $1 == "container_name:" { print $2 }
    ' "$TMP/$1.yml" | sort -u
  }
  names staging > "$TMP/staging.names"
  names prod > "$TMP/prod.names"
  [[ -s "$TMP/staging.names" && -s "$TMP/prod.names" ]] || ko "aucun nom de volume/reseau/conteneur extrait du rendu"
  common="$(comm -12 "$TMP/staging.names" "$TMP/prod.names")"
  if [[ -z "$common" ]]; then
    ok "noms de volumes, reseaux et conteneurs disjoints entre staging et prod ($(wc -l < "$TMP/prod.names") noms en prod)"
  else
    ko "noms partages entre staging et prod : $(echo "$common" | tr '\n' ' ')"
  fi

  # Ports publies : disjoints aussi.
  ports() { grep -E '^\s+published:' "$TMP/$1.yml" | sort -u; }
  if [[ -z "$(comm -12 <(ports staging) <(ports prod))" ]]; then ok "ports publies disjoints"; else ko "un port est publie par les deux piles"; fi

  # Aucun port n'est expose au reseau : chacun est lie a 127.0.0.1 (le nginx de
  # l'hote est le seul point d'entree), et l'API n'en publie aucun (elle n'est
  # joignable que par le reseau interne de la pile, via le service `web`).
  for env in staging prod; do
    published="$(grep -Ec '^\s+published:' "$TMP/$env.yml" || true)"
    loopback="$(grep -Ec '^\s+host_ip: 127\.0\.0\.1$' "$TMP/$env.yml" || true)"
    if (( published > 0 && published == loopback )); then
      ok "$env : les $published port(s) publie(s) sont lies a 127.0.0.1"
    else
      ko "$env : $published port(s) publie(s) mais $loopback lie(s) a 127.0.0.1 (tout port doit l'etre)"
    fi
    api_ports="$(awk '
      /^[a-z]/ { top = $1 }
      top == "services:" && /^  [a-z]/ { svc = $1 }
      top == "services:" && svc == "api:" && $1 == "ports:" { n++ }
      END { print n + 0 }
    ' "$TMP/$env.yml")"
    if [[ "$api_ports" == "0" ]]; then ok "$env : le service api ne publie aucun port"; else ko "$env : le service api publie des ports"; fi
  done
fi

# --- 4. Mode executable des scripts dans l'index git -------------------------
# Un script suivi en 100644 n'est pas executable apres un `git clone` / pull sur
# le serveur : ./infra/scripts/deploy.sh y echouerait en « Permission denied ».
# (git add --chmod=+x infra/scripts/*.sh)
if git rev-parse --git-dir >/dev/null 2>&1; then
  bad_mode=""
  while read -r mode _ _ path; do
    [[ "$mode" == "100755" ]] || bad_mode+=" $path($mode)"
  done < <(git ls-files -s -- 'infra/scripts/*.sh')
  if [[ -z "$bad_mode" ]]; then
    ok "scripts infra/scripts/*.sh suivis en mode 100755"
  else
    ko "scripts suivis sans le bit executable dans l'index :${bad_mode} (git add --chmod=+x infra/scripts/*.sh)"
  fi
fi

if (( FAILED )); then
  echo >&2
  echo "check-infra : ECHEC" >&2
  exit 1
fi
echo
echo "check-infra : tout est conforme."
