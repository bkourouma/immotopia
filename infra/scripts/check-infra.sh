#!/usr/bin/env bash
#
# Controle statique de l'infrastructure, sans secret, en local comme en CI :
#
#   bash infra/scripts/check-infra.sh
#
#  1. `bash -n` sur tous les scripts de infra/scripts ;
#  2. les scripts a environnement refusent un argument absent ou inconnu ;
#     ci-deploy.sh refuse en code 2, avant toute action, toute commande SSH ou
#     tout argument hors de sa liste blanche ;
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

# --- 1b. En-tetes de securite nginx et masquage des jetons ---------------------
# Dans nginx, un `add_header` pose dans un `location` annule l'heritage du niveau
# `server` : chaque location qui en definit un doit repeter les cinq en-tetes, et
# le niveau `server` doit les porter aussi.
SPA_CONF="infra/nginx/spa.conf"
SEC_HEADERS="Content-Security-Policy-Report-Only Permissions-Policy X-Content-Type-Options X-Frame-Options Referrer-Policy"
if [[ -f "$SPA_CONF" ]]; then
  header_report="$(tr -d '' < "$SPA_CONF" | awk -v required="$SEC_HEADERS" '
    BEGIN { n = split(required, req, " ") }
    function check(label,   i, missing) {
      missing = ""
      for (i = 1; i <= n; i++) if (!(req[i] in seen)) missing = missing " " req[i]
      if (missing != "") print "MANQUE " label ":" missing; else print "BON " label
    }
    {
      line = $0
      sub(/^[ 	]+/, "", line)
      if (line ~ /^#/) next
      opens = gsub(/\{/, "{", line); closes = gsub(/\}/, "}", line)
      if (line ~ /^server[ 	]*\{/ ) { depth = 1; in_server = 1; delete seen; has = 0; label = "server"; next }
      if (in_server && depth == 1 && line ~ /^location[ 	]/) {
        # fin du niveau server : verdict, puis ouverture du location
        if (!server_done) { check("server"); server_done = 1 }
        label = line; sub(/[ 	]*\{.*/, "", label); delete seen; has = 0; in_loc = 1
      }
      if (line ~ /^add_header[ 	]/) { has = 1; name = line; sub(/^add_header[ 	]+/, "", name); sub(/[ 	].*/, "", name); seen[name] = 1 }
      depth += opens - closes
      if (in_loc && depth == 1) { in_loc = 0; if (has) check(label); delete seen; has = 0 }
    }
    END { if (in_server && !server_done) check("server") }
  ')"
  checked_blocks="$(printf '%s
' "$header_report" | grep -c '^BON ' || true)"
  while IFS= read -r l; do
    [[ "$l" == MANQUE* ]] && ko "spa.conf, en-tetes de securite : ${l#MANQUE }"
  done <<< "$header_report"
  if ! printf '%s
' "$header_report" | grep -q '^MANQUE '; then
    if printf '%s
' "$header_report" | grep -q '^BON server$' && (( checked_blocks > 1 )); then
      ok "spa.conf : le niveau server et chacun des $((checked_blocks - 1)) location(s) avec add_header portent les 5 en-tetes de securite"
    else
      ko "spa.conf : niveau server ou location introuvable pour le controle des en-tetes (analyse : $checked_blocks bloc(s))"
    fi
  fi
else
  ko "$SPA_CONF introuvable"
fi

# Masquage des jetons : chaque vhost porte ses map (URI et Referer, trois passes
# chacune) et leurs variables ne se recoupent ni dans un fichier ni entre fichiers
# (ils sont tous inclus dans le meme contexte http).
all_map_vars=""
for conf in infra/nginx/spa.conf infra/nginx/app.immotopia.cloud.conf infra/nginx/clients.immotopia.cloud.conf; do
  if [[ ! -f "$conf" ]]; then ko "$conf introuvable"; continue; fi
  vars="$(tr -d '' < "$conf" | grep -E '^map[[:space:]]' | awk '{print $3}')"
  nmaps="$(printf '%s
' "$vars" | grep -c . || true)"
  ntoken="$(tr -d '' < "$conf" | grep -c 'token=' || true)"
  if (( nmaps >= 8 && ntoken >= 6 )); then ok "$conf : $nmaps map dont $ntoken passes de masquage de jeton"; else ko "$conf : map de masquage de jeton manquants ($nmaps map, $ntoken passes ; attendu >= 8 et >= 6)"; fi
  # Contre-audit PR #205 : le nom du parametre peut contenir un point (hub.verify_token de Meta).
  nnarrow="$(grep -c '\[a-z_\]\*token=' "$conf" || true)"
  [[ "$nnarrow" == 0 ]] || ko "$conf : $nnarrow passe(s) de masquage en [a-z_]*token= (attendu [a-z_.]*token=, sinon hub.verify_token reste en clair)"
  dup="$(printf '%s
' "$vars" | sort | uniq -d | tr '
' ' ')"
  [[ -z "$dup" ]] || ko "$conf : variables de map en double : $dup"
  all_map_vars+="$vars"$'
'
done
dup_all="$(printf '%s' "$all_map_vars" | sort | uniq -d | tr '
' ' ')"
if [[ -z "$dup_all" ]]; then ok "variables de map sans doublon entre les trois fichiers nginx"; else ko "variables de map en double entre fichiers nginx : $dup_all"; fi

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

# ci-deploy.sh : point d'entree des cles SSH de la CI. Chaque entree invalide doit
# etre refusee en code 2 AVANT toute action : on place devant le PATH de faux git,
# docker, flock, setsid et nohup qui laissent une trace s'ils sont appeles, et on
# verifie qu'aucun dossier de journaux n'a ete cree dans le HOME factice.
CI_STUBS="$(mktemp -d)"
mkdir -p "$CI_STUBS/bin" "$CI_STUBS/home"
for cmd in git docker flock setsid nohup tail find mkdir; do
  printf '#!/bin/sh\necho "%s" >> "%s/called"\nexit 99\n' "$cmd" "$CI_STUBS" > "$CI_STUBS/bin/$cmd"
  chmod +x "$CI_STUBS/bin/$cmd"
done
CI_SHA="0123456789abcdef0123456789abcdef01234567"
ci_refuse() { # $1 = libelle, $2 = SSH_ORIGINAL_COMMAND (ou __absent__), reste = arguments du script
  local label="$1" soc="$2" rc=0
  shift 2
  rm -f "$CI_STUBS/called"
  if [[ "$soc" == "__absent__" ]]; then
    env -u SSH_ORIGINAL_COMMAND HOME="$CI_STUBS/home" PATH="$CI_STUBS/bin:$PATH" \
      bash infra/scripts/ci-deploy.sh "$@" >/dev/null 2>&1 || rc=$?
  else
    env SSH_ORIGINAL_COMMAND="$soc" HOME="$CI_STUBS/home" PATH="$CI_STUBS/bin:$PATH" \
      bash infra/scripts/ci-deploy.sh "$@" >/dev/null 2>&1 || rc=$?
  fi
  if [[ "$rc" != "2" ]]; then
    ko "ci-deploy.sh $label devrait sortir en 2, code $rc"
  elif [[ -e "$CI_STUBS/called" || -e "$CI_STUBS/home/ci-deploy-logs" ]]; then
    ko "ci-deploy.sh $label : une action (git, docker, journal...) a precede le refus"
  else
    ok "ci-deploy.sh $label -> refus (2), aucune action"
  fi
}
ci_refuse "sans argument"                        __absent__
ci_refuse "'dev'"                                __absent__ dev
ci_refuse "'production'"                         __absent__ production
ci_refuse "'staging' sans SHA ni commande SSH"   __absent__ staging
ci_refuse "'staging' + SHA de 39 caracteres"     __absent__ staging "${CI_SHA:0:39}"
ci_refuse "'staging' + SHA de 41 caracteres"     __absent__ staging "${CI_SHA}0"
ci_refuse "'staging' + SHA en majuscules"        __absent__ staging "${CI_SHA^^}"
ci_refuse "'staging' + SHA + argument en trop"   __absent__ staging "$CI_SHA" extra
ci_refuse "cle staging, commande « deploy prod »" "deploy prod $CI_SHA" staging
ci_refuse "commande SSH avec « ; id »"           "deploy staging $CI_SHA; id" staging
ci_refuse "commande SSH « rm -rf / »"            "rm -rf /" staging
ci_refuse "commande SSH, SHA en majuscules"      "deploy staging ${CI_SHA^^}" staging
ci_refuse "commande SSH + retour a la ligne"     $'deploy staging '"$CI_SHA"$'\n' staging
ci_refuse "commande SSH + ligne « id »"          $'deploy staging '"$CI_SHA"$'\nid' staging
ci_refuse "commande SSH + retour chariot"        $'deploy staging '"$CI_SHA"$'\r' staging
ci_refuse "commande SSH vide"                    "" staging
ci_refuse "commande SSH + argument en trop"      "deploy staging $CI_SHA" staging extra
ci_refuse "--worker hors de ce script"           __absent__ --worker staging "$CI_SHA"
rm -rf "$CI_STUBS"

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
