#!/usr/bin/env bash
#
# Deploiement d'ImmoTopia, pile STAGING ou PRODUCTION.
#
#   ./infra/scripts/deploy.sh <staging|prod>              # deploiement complet
#   ./infra/scripts/deploy.sh <staging|prod> --no-build   # redemarrage sans reconstruire
#
#   staging : https://app.immotopia.cloud      pile immotopia-saas  (3019 / 5436)
#   prod    : https://clients.immotopia.cloud  pile immotopia-prod  (3020 / 5437)
#
# L'environnement est OBLIGATOIRE et n'a jamais de valeur par defaut : on ne
# deploie pas la production par accident. Ses reglages non secrets sont lus dans
# infra/environments/<env>.conf ; ses secrets, dans le fichier d'environnement
# qu'il designe (IMMOTOPIA_ENV_FILE, hors depot, mode 600).
#
# Idempotent : relancable autant de fois que necessaire. Il ne supprime jamais
# de volume, ne reinitialise jamais la base, et ne touche a rien dont le nom ne
# commence pas par le nom de la pile (${STACK_NAME}-). L'autre pile compte comme
# une voisine : deployer la prod prouve que le staging n'a pas bouge, et
# inversement.
#
# A lancer depuis /home/deployer/immotopia-saas (racine du depot deploye, un
# seul checkout pour les deux environnements).

set -Eeuo pipefail

usage() {
  echo "Usage : $0 <staging|prod> [--no-build]" >&2
  exit 2
}

# Liste blanche, verifiee AVANT de sourcer quoi que ce soit : l'argument sert a
# fabriquer un chemin de fichier.
ENV_NAME="${1:-}"
case "$ENV_NAME" in
  staging|prod) shift ;;
  *) echo "Environnement absent ou inconnu : '${ENV_NAME}'." >&2; usage ;;
esac

BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    *) echo "Option inconnue : $arg" >&2; usage ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Les reglages viennent de infra/environments/<env>.conf, JAMAIS de l'environnement
# de l'appelant : un STACK_NAME ou un WEB_PORT oublie dans le shell viserait la
# mauvaise pile. IMMOTOPIA_ALLOW_OVERRIDE=1 rouvre ce remplacement (essais
# locaux uniquement ; deploy.sh le refuse pour la production).
if [[ "${IMMOTOPIA_ALLOW_OVERRIDE:-}" != "1" ]]; then
  unset STACK_NAME IMMOTOPIA_ENV_FILE PUBLIC_ORIGIN WEB_PORT PG_PORT VITE_SHOW_DEMO_ACCOUNTS BACKUP_DIR BACKUP_KEEP_DAYS \
        POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB STAGING_ENV_FILE DEPLOY_HISTORY_FILE
fi
if [[ "$ENV_NAME" == "prod" && "${IMMOTOPIA_ALLOW_OVERRIDE:-}" == "1" ]]; then
  echo "IMMOTOPIA_ALLOW_OVERRIDE=1 est refuse pour la production : ses reglages ne se remplacent pas." >&2
  exit 2
fi

# Reglages de l'environnement (STACK_NAME, IMMOTOPIA_ENV_FILE, PUBLIC_ORIGIN,
# WEB_PORT, PG_PORT, VITE_SHOW_DEMO_ACCOUNTS...). set -a les exporte : Compose
# les lit dans son environnement, ils l'emportent sur ceux du fichier --env-file.
set -a
# shellcheck disable=SC1090
source "infra/environments/${ENV_NAME}.conf"
set +a

for var in STACK_NAME IMMOTOPIA_ENV_FILE PUBLIC_ORIGIN WEB_PORT PG_PORT VITE_SHOW_DEMO_ACCOUNTS; do
  [[ -n "${!var:-}" ]] || { echo "infra/environments/${ENV_NAME}.conf ne definit pas $var." >&2; exit 2; }
done

ENV_FILE="$IMMOTOPIA_ENV_FILE"
COMPOSE_FILE="infra/compose/docker-compose.prod.yml"
PUBLIC_URL="$PUBLIC_ORIGIN"
LOCAL_URL="http://127.0.0.1:${WEB_PORT}"
PUBLIC_HOST="${PUBLIC_ORIGIN#https://}"
DEPLOY_HISTORY_FILE="${DEPLOY_HISTORY_FILE:-/home/deployer/deploy-history-${STACK_NAME}.log}"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32mOK\033[0m   %s\n' "$*"; }
fail() { printf '    \033[31mECHEC\033[0m %s\n' "$*" >&2; exit 1; }
warn() { printf '    \033[33mATTENTION\033[0m %s\n' "$*" >&2; }

trap 'echo >&2; echo "Arret du deploiement (ligne $LINENO). Aucune donnee supprimee." >&2' ERR

compose() {
  docker compose -p "$STACK_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

# Un seul checkout sert les deux piles et la construction dure des minutes :
# deux deploy.sh simultanes (meme environnement ou non) se marcheraient dessus.
# Verrou hors depot (un fichier non suivi rendrait l'arbre « sale »), tenu par le
# descripteur 9 jusqu'a la fin du script.
if command -v flock >/dev/null 2>&1; then
  exec 9>/tmp/immotopia-deploy.lock
  flock -n 9 || fail "un autre deploy.sh est deja en cours (verrou /tmp/immotopia-deploy.lock) : attendre sa fin."
else
  warn "flock est absent : aucun verrou contre un second deploy.sh simultane."
fi

# Valeur d'une variable du fichier d'environnement (guillemets et CR retires).
# DERNIERE occurrence : c'est celle que Docker Compose applique. Ne jamais
# l'afficher si c'est un secret.
envval() {
  local file="${2:-$ENV_FILE}" line
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?$1[[:space:]]*=" "$file" | tail -1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  case "$line" in
    \"*\") line="${line#\"}"; line="${line%\"}" ;;
    \'*\') line="${line#\'}"; line="${line%\'}" ;;
  esac
  printf '%s' "$line"
}

# Empreinte sha256 d'une valeur : sert a comparer deux secrets sans les afficher.
hash_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | cut -d' ' -f1
  else
    printf '%s' "$1" | openssl dgst -sha256 | awk '{print $NF}'
  fi
}

# Port libre, ou deja tenu par un conteneur de CETTE pile (redeploiement).
check_port() {
  local port="$1" label="$2"
  if ! command -v ss >/dev/null 2>&1; then
    warn "ss est absent : le port $port ($label) n'a pas ete verifie."
    return 0
  fi
  if ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq ":${port}\$"; then
    if docker ps --filter "name=^${STACK_NAME}-" --format '{{.Ports}}' | grep -Eq ":${port}->"; then
      ok "port $port ($label) deja tenu par la pile $STACK_NAME"
    else
      fail "le port $port ($label) est occupe par autre chose que la pile $STACK_NAME (ss -ltnp pour voir quoi)."
    fi
  else
    ok "port $port ($label) libre"
  fi
}

# --- 0. Verifications prealables -------------------------------------------

step "Verifications prealables"

echo "    environnement : $ENV_NAME  (pile $STACK_NAME, $PUBLIC_ORIGIN)"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo inconnu)"
echo "    version deployee : $GIT_SHA"
HEAD_AT_CHECK=""

# Production : l'etat git doit etre PROUVE, pas suppose. Une sortie vide de
# `git status` ne veut dire « propre » que si git a reussi (proprietaire du depot
# different, .git absent : git echoue et n'affiche rien).
if [[ "$ENV_NAME" == "prod" ]]; then
  git rev-parse --git-dir >/dev/null \
    || fail "git est inutilisable ici (depot absent, ou proprietaire different : « dubious ownership ») : la production ne se deploie que depuis un depot git verifiable."
  [[ "$GIT_SHA" != "inconnu" ]] \
    || fail "version git inconnue : la production ne se deploie que depuis un etat commite identifiable."
  HEAD_AT_CHECK="$(git rev-parse HEAD)" || fail "git rev-parse HEAD a echoue."
fi

# Production : rien n'a bouge depuis les controles (HEAD identique, arbre propre).
# A rappeler juste avant chaque etape irreversible (construction, migrations).
recheck_prod_tree() {
  [[ "$ENV_NAME" == "prod" ]] || return 0
  local head_now status_now
  head_now="$(git rev-parse HEAD)" || fail "git rev-parse HEAD a echoue avant : $1."
  [[ "$head_now" == "$HEAD_AT_CHECK" ]] \
    || fail "HEAD a change pendant le deploiement (avant : $1) : relancer deploy.sh prod."
  status_now="$(git status --porcelain)" || fail "git status a echoue avant : $1."
  [[ -z "$status_now" ]] \
    || fail "l'arbre git est devenu sale pendant le deploiement (avant : $1) : relancer deploy.sh prod depuis un etat commite."
}

[[ -f "$COMPOSE_FILE" ]] || fail "$COMPOSE_FILE introuvable : lancer le script depuis la racine du depot deploye."
[[ -f "$ENV_FILE" ]]     || fail "$ENV_FILE introuvable : ./infra/scripts/make-env.sh $ENV_NAME (modele : infra/.env.example)."

perms="$(stat -c '%a' "$ENV_FILE")"
[[ "$perms" == "600" ]] || fail "$ENV_FILE est en mode $perms, attendu 600 (chmod 600 $ENV_FILE)."
ok "fichier de secrets present, mode 600"

# Les variables sans lesquelles la pile ne peut pas demarrer. On verifie leur
# PRESENCE, jamais leur valeur : aucun secret ne doit apparaitre dans un journal.
missing=()
for var in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL JWT_SECRET \
           NODE_ENV FRONTEND_URL BACKEND_URL PUBLIC_ORIGIN UPLOADS_DIR; do
  grep -Eq "^${var}=.+" "$ENV_FILE" || missing+=("$var")
done
[[ ${#missing[@]} -eq 0 ]] || fail "variables absentes ou vides dans $ENV_FILE : ${missing[*]}"
ok "variables obligatoires renseignees"

# Doublons : Docker Compose applique la DERNIERE occurrence d'une cle, un simple
# grep lirait la premiere. Une cle critique definie deux fois (ajout a la main en
# fin de fichier) fausserait tous les controles ci-dessous : on refuse.
for var in NODE_ENV FRONTEND_URL BACKEND_URL PUBLIC_ORIGIN CLIENT_URL DATABASE_URL JWT_SECRET \
           POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB PAYMENT_GATEWAY_SIMULATOR; do
  occurrences="$(grep -Ec "^[[:space:]]*(export[[:space:]]+)?${var}[[:space:]]*=" "$ENV_FILE" || true)"
  (( occurrences <= 1 )) \
    || fail "$var est definie $occurrences fois dans $ENV_FILE : ne garder qu'une ligne (Compose applique la derniere, les controles doivent voir la meme)."
done
ok "aucune cle critique en double"

# Secrets de base : refuse un modele non rempli ou un mot de passe trop court.
pg_pass="$(envval POSTGRES_PASSWORD)"
[[ "$pg_pass" != *REMPLACER* ]] || fail "POSTGRES_PASSWORD vaut encore REMPLACER (make-env.sh $ENV_NAME)."
(( ${#pg_pass} >= 24 )) || fail "POSTGRES_PASSWORD fait ${#pg_pass} caracteres, il en faut au moins 24."
[[ "$(envval JWT_SECRET)" != *REMPLACER* ]] || fail "JWT_SECRET vaut encore REMPLACER (make-env.sh $ENV_NAME)."
pg_pass=""
ok "POSTGRES_PASSWORD (24 caracteres ou plus) et JWT_SECRET renseignes"

# JWT_SECRET : l'API sort en erreur sous 32 caracteres. Autant le voir ici.
jwt_value="$(envval JWT_SECRET)"
jwt_len="${#jwt_value}"
jwt_value=""
(( jwt_len >= 32 )) || fail "JWT_SECRET fait $jwt_len caracteres, il en faut au moins 32."
ok "JWT_SECRET suffisamment long ($jwt_len caracteres)"

# Coherence du fichier d'environnement avec l'environnement demande : c'est ce
# qui empeche de deployer les secrets ou les URL d'une pile sur l'autre.
for var in FRONTEND_URL BACKEND_URL PUBLIC_ORIGIN CLIENT_URL; do
  # CLIENT_URL est facultative : ligne absente ou commentee = pas de controle.
  if [[ "$var" == "CLIENT_URL" ]] && ! grep -Eq "^CLIENT_URL=.+" "$ENV_FILE"; then
    continue
  fi
  value="$(envval "$var")"
  [[ "$value" == "$PUBLIC_ORIGIN" ]] \
    || fail "$var ($value) differe de l'origine de l'environnement $ENV_NAME ($PUBLIC_ORIGIN)."
done
ok "FRONTEND_URL, BACKEND_URL, PUBLIC_ORIGIN (et CLIENT_URL) = $PUBLIC_ORIGIN"

# Ne jamais afficher DATABASE_URL : elle porte le mot de passe.
[[ "$(envval DATABASE_URL)" == *"@${STACK_NAME}-postgres:5432/"* ]] \
  || fail "DATABASE_URL ne vise pas @${STACK_NAME}-postgres:5432/ : ce fichier d'environnement appartient a une autre pile."
ok "DATABASE_URL vise ${STACK_NAME}-postgres"

[[ "$(envval NODE_ENV)" == "production" ]] || fail "NODE_ENV doit valoir production dans $ENV_FILE (staging compris)."
ok "NODE_ENV=production"

check_port "$WEB_PORT" "web"
check_port "$PG_PORT" "postgres"

# Cles d'integration : le staging ne doit pas porter d'identifiants de production,
# et la production ne doit pas partager les siens avec le staging.
INTEGRATION_KEYS=(EMAIL_SERVICE_API_KEY EMAIL_SMTP_PASS TWILIO_AUTH_TOKEN WASENDER_API_KEY
                  GOOGLE_CLIENT_SECRET ANTHROPIC_API_KEY OPENROUTER_API_KEY PLATFORM_PAYSECUREHUB_API_KEY)

if [[ "$ENV_NAME" == "staging" ]]; then
  filled=()
  for var in "${INTEGRATION_KEYS[@]}"; do
    [[ -z "$(envval "$var")" ]] || filled+=("$var")
  done
  if [[ ${#filled[@]} -gt 0 ]]; then
    warn "le staging ne doit pas porter d'identifiants de production : cle(s) d'integration renseignee(s) dans $ENV_FILE : ${filled[*]} (valeurs non affichees)."
  fi
fi

# --- Garde-fous propres a la PRODUCTION ---
if [[ "$ENV_NAME" == "prod" ]]; then
  # git a deja ete prouve utilisable plus haut. Pas de 2>/dev/null : une erreur
  # de git ne doit jamais se lire comme « arbre propre ».
  tree_status="$(git status --porcelain)" || fail "git status a echoue : etat de l'arbre inconnu, la production ne se deploie pas a l'aveugle."
  if [[ -n "$tree_status" ]]; then
    git status --short >&2 || true
    fail "l'arbre git est sale : la production ne se deploie que depuis un etat commite."
  fi
  ok "arbre git propre"

  git rev-parse --verify -q refs/remotes/origin/main >/dev/null \
    || fail "origin/main est absent : impossible de verifier que HEAD est fusionne (git fetch origin, puis se placer sur origin/main)."
  git merge-base --is-ancestor HEAD refs/remotes/origin/main \
    || fail "HEAD ($GIT_SHA) n'est pas dans origin/main : la production ne deploie que du code fusionne (git fetch, puis se placer sur origin/main)."
  ok "HEAD ($GIT_SHA) est dans origin/main"

  if grep -Eq "^[[:space:]]*(export[[:space:]]+)?PAYMENT_GATEWAY_SIMULATOR[[:space:]]*=[[:space:]]*[\"']?1" "$ENV_FILE"; then
    fail "PAYMENT_GATEWAY_SIMULATOR=1 dans $ENV_FILE : le simulateur de paiement est interdit en production."
  fi
  ok "simulateur de paiement non active"

  # Fichier d'environnement du staging : deduit UNIQUEMENT de staging.conf (lu dans
  # un sous-shell sans IMMOTOPIA_ENV_FILE, sinon := garderait celui de la prod),
  # jamais d'une variable de l'appelant.
  STAGING_ENV_FILE="$(env -u IMMOTOPIA_ENV_FILE bash -c 'source infra/environments/staging.conf >/dev/null 2>&1; printf %s "${IMMOTOPIA_ENV_FILE:-}"' || true)"
  if [[ -z "$STAGING_ENV_FILE" || ! -r "$STAGING_ENV_FILE" ]]; then
    fail "fichier d'environnement du staging illisible (${STAGING_ENV_FILE:-non deduit de infra/environments/staging.conf}) : l'unicite des secrets entre staging et production ne peut pas etre prouvee.
       Verifier que infra/environments/staging.conf definit IMMOTOPIA_ENV_FILE, que ce fichier existe et
       que l'utilisateur courant peut le lire (mode 600, proprietaire deployer)."
  fi

  for secret in JWT_SECRET POSTGRES_PASSWORD PAYMENT_SECRETS_KEY; do
    prod_value="$(envval "$secret")"
    staging_value="$(envval "$secret" "$STAGING_ENV_FILE")"
    if [[ -n "$staging_value" && "$(hash_of "$prod_value")" == "$(hash_of "$staging_value")" ]]; then
      fail "$secret est identique a celui du staging : generer des secrets neufs (make-env.sh prod)."
    fi
  done
  prod_value=""; staging_value=""
  ok "JWT_SECRET, POSTGRES_PASSWORD et PAYMENT_SECRETS_KEY distincts de ceux du staging"

  shared=()
  for var in "${INTEGRATION_KEYS[@]}"; do
    prod_value="$(envval "$var")"
    staging_value="$(envval "$var" "$STAGING_ENV_FILE")"
    if [[ -n "$prod_value" && "$(hash_of "$prod_value")" == "$(hash_of "$staging_value")" ]]; then
      shared+=("$var")
    fi
  done
  prod_value=""; staging_value=""
  if [[ ${#shared[@]} -gt 0 ]]; then
    warn "cle(s) d'integration identique(s) a celles du staging : ${shared[*]} (un compte par environnement est preferable ; valeurs non affichees)."
  fi

  [[ "$(envval PLATFORM_PAYSECUREHUB_MODE)" == "LIVE" ]] \
    || warn "PLATFORM_PAYSECUREHUB_MODE n'est pas LIVE : le paiement des abonnements reste simule."
  for var in PLATFORM_ISSUER_RCCM PLATFORM_ISSUER_TAX_ID PLATFORM_ISSUER_ADDRESS; do
    [[ -n "$(envval "$var")" ]] || warn "$var est vide : mention legale absente des factures d'abonnement."
  done
fi

compose config -q || fail "docker-compose.prod.yml invalide."
ok "fichier compose valide"

# Empreinte des conteneurs qui ne sont PAS de cette pile : nom, identifiant complet
# et date de demarrage. Un conteneur recree change d'identifiant, un conteneur
# redemarre change de date ; la duree d'execution affichee par `docker ps`
# (« Up 2 minutes ») ne convient pas : elle evolue toute seule, ce qui produisait
# de faux positifs des qu'une pile voisine venait d'etre creee.
neighbours_fingerprint() {
  local ids
  ids="$(docker ps -q)"
  [[ -n "$ids" ]] || return 0
  # shellcheck disable=SC2086  # liste d'identifiants : un argument par identifiant
  docker inspect --format '{{.Name}} {{.Id}} {{.State.StartedAt}}' $ids \
    | { grep -v "^/${STACK_NAME}-" || true; } | sort
}

# --- 1. Empreinte des voisins ----------------------------------------------
#
# Le serveur heberge une vingtaine d'autres applications, et l'AUTRE pile
# ImmoTopia en fait partie. On photographie les conteneurs qui ne nous
# appartiennent pas, pour prouver a la fin qu'aucun n'a bouge.

step "Empreinte des conteneurs voisins (avant)"
NEIGHBOURS_BEFORE="$(mktemp)"
neighbours_fingerprint > "$NEIGHBOURS_BEFORE"
ok "$(wc -l < "$NEIGHBOURS_BEFORE") conteneurs voisins recenses"

# --- 2. Construction des images --------------------------------------------

if (( BUILD )); then
  step "Construction des images"
  recheck_prod_tree "compose build"
  # --pull : reprendre les derniers correctifs des images de base.
  compose build --pull api web
  compose --profile tools build migrate
  ok "images construites"

  # bcrypt est un module natif. packages/api/Dockerfile installe avec
  # --ignore-scripts, ce qui empeche node-pre-gyp de recuperer le binaire :
  # l'API demarrerait quand meme, et TOUTE connexion planterait a l'execution.
  # On le verifie avant de deployer quoi que ce soit.
  step "Verification du binding natif bcrypt"
  if docker run --rm --entrypoint node "${STACK_NAME}-api:latest" \
       -e "const b=require('bcrypt'); const h=b.hashSync('x',10); if(!b.compareSync('x',h)) process.exit(1); console.log('bcrypt ok');"; then
    ok "bcrypt operationnel dans l'image d'API"
  else
    fail "bcrypt est inutilisable dans l'image d'API : aucune connexion ne fonctionnerait.
       Corriger packages/api/Dockerfile (npm rebuild bcrypt --build-from-source avec
       python3/make/g++, ou bascule sur node:20-bookworm-slim) avant de relancer."
  fi
else
  step "Construction ignoree (--no-build)"
fi

# --- 3. Base de donnees -----------------------------------------------------

step "Demarrage de Postgres"
compose up -d postgres

printf '    attente de l etat healthy '
state=""
for _ in $(seq 1 60); do
  state="$(docker inspect -f '{{.State.Health.Status}}' "${STACK_NAME}-postgres" 2>/dev/null || echo starting)"
  [[ "$state" == "healthy" ]] && break
  printf '.'
  sleep 2
done
echo
[[ "$state" == "healthy" ]] || fail "Postgres n'est pas healthy apres 120 s (etat : ${state:-inconnu})."
ok "${STACK_NAME}-postgres healthy"

# --- 3.5. Controle des migrations inconnues du depot ------------------------
#
# La table _prisma_migrations peut contenir une ligne appliquee en base sans
# dossier correspondant dans le depot (reprise manuelle, hotfix non commite -
# voir ADR-003).
#
# On ne detecte PAS cela via le texte de `prisma migrate status` : mesure sur
# Prisma 5.22.0, quand le depot n'a par ailleurs aucune migration en attente,
# une ligne orpheline isolee produit le diagnostic interne
# `migrationsDirectoryIsBehind`. Le CLI ne reconnait explicitement que deux
# diagnostics (`databaseIsBehind`, `historiesDiverge`) ; tout autre cas, y
# compris celui-la, retombe en silence sur « Database schema is up to date! »
# et sort en code 0 - l'orpheline ne serait alors jamais signalee. On compare
# donc directement le contenu de _prisma_migrations au dossier du depot.
#
# La table peut ne pas encore exister (tout premier deploiement sur une base
# neuve, avant le premier `migrate deploy`) : on le verifie avec to_regclass,
# un booleen SQL ('t'/'f'), plutot que de deviner la cause d'un echec de
# lecture a partir du texte de l'erreur psql - fragile, une image postgres
# future pourrait le traduire ou le reformuler sans bruit.
#
# Staging : les orphelines listees dans migrations-orphelines-connues.txt sont
# tolerees. Prod : ce fichier est IGNORE, une base neuve ne doit avoir aucune
# orpheline.

step "Controle des migrations inconnues du depot"

ORPHANS_FILE="infra/scripts/migrations-orphelines-connues.txt"
if [[ "$ENV_NAME" == "staging" ]]; then
  [[ -f "$ORPHANS_FILE" ]] || fail "$ORPHANS_FILE introuvable."
fi

EXISTS_ERR_FILE="$(mktemp)"
APPLIED_FILE="$(mktemp)"
APPLIED_ERR_FILE="$(mktemp)"
LOCAL_DIRS_FILE="$(mktemp)"
FOUND_ORPHANS_FILE="$(mktemp)"
UNKNOWN_ORPHANS_FILE="$(mktemp)"
KNOWN_ORPHANS_FILE=""

migration_check_cleanup() {
  rm -f "$EXISTS_ERR_FILE" "$APPLIED_FILE" "$APPLIED_ERR_FILE" "$LOCAL_DIRS_FILE" \
        "$FOUND_ORPHANS_FILE" "$UNKNOWN_ORPHANS_FILE" $KNOWN_ORPHANS_FILE 2>/dev/null || true
}
trap migration_check_cleanup EXIT

# $POSTGRES_USER/$POSTGRES_DB viennent de l'environnement deja pose sur le
# conteneur postgres par $ENV_FILE, jamais de la ligne de commande - aucun
# secret n'est affiche ni journalise par cette etape. La chaine passee a
# `sh -c` est entre apostrophes ANSI-C ($'...') pour que $POSTGRES_USER et
# $POSTGRES_DB restent litteraux ici et ne soient developpes que par le sh
# interne, tout en permettant l'apostrophe litterale (\') qu'exige le
# litteral SQL de to_regclass.
if ! TABLE_EXISTS="$(compose exec -T postgres sh -c \
       $'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT to_regclass(\'_prisma_migrations\') IS NOT NULL;"' \
       2>"$EXISTS_ERR_FILE")"; then
  cat "$EXISTS_ERR_FILE" >&2
  fail "impossible de verifier l'existence de _prisma_migrations sur postgres (voir la sortie ci-dessus)."
fi

case "$TABLE_EXISTS" in
  t)
    # Production : une base deja initialisee ne migre pas sans sauvegarde recente.
    # (Aucune exigence au tout premier deploiement : la table n'existe pas.)
    if [[ "$ENV_NAME" == "prod" ]]; then
      recent_backup="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db-*.sql.gz' -mmin -1440 2>/dev/null | head -1 || true)"
      [[ -n "$recent_backup" ]] \
        || fail "aucune sauvegarde db-*.sql.gz de moins de 24 h dans $BACKUP_DIR : lancer ./infra/scripts/backup.sh prod avant de migrer la production."
      ok "sauvegarde de moins de 24 h presente ($(basename "$recent_backup"))"
    fi
    # Migrations terminees et non annulees en base.
    if ! compose exec -T postgres sh -c \
         'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;"' \
         > "$APPLIED_FILE" 2>"$APPLIED_ERR_FILE"; then
      cat "$APPLIED_ERR_FILE" >&2
      fail "lecture de _prisma_migrations impossible sur postgres (voir la sortie ci-dessus)."
    fi
    ;;
  f)
    # Tout premier deploiement sur une base neuve : rien n'est encore
    # applique, donc rien ne peut etre orphelin.
    : > "$APPLIED_FILE"
    ;;
  *)
    fail "reponse inattendue de to_regclass('_prisma_migrations') sur postgres : '$TABLE_EXISTS' (attendu t ou f)."
    ;;
esac

find packages/api/prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
  | sort -u > "$LOCAL_DIRS_FILE"

# Appliquees en base sans dossier local correspondant.
comm -23 <(sort -u "$APPLIED_FILE") "$LOCAL_DIRS_FILE" > "$FOUND_ORPHANS_FILE"

if [[ -s "$FOUND_ORPHANS_FILE" ]]; then
  KNOWN_ORPHANS_FILE="$(mktemp)"
  if [[ "$ENV_NAME" == "staging" ]]; then
    sed -e 's/\r$//' -e 's/#.*$//' -e 's/[[:space:]]*$//' -e '/^$/d' "$ORPHANS_FILE" \
      | sort -u > "$KNOWN_ORPHANS_FILE"
  else
    # Prod : aucune orpheline connue.
    : > "$KNOWN_ORPHANS_FILE"
  fi

  comm -23 "$FOUND_ORPHANS_FILE" "$KNOWN_ORPHANS_FILE" > "$UNKNOWN_ORPHANS_FILE"

  if [[ -s "$UNKNOWN_ORPHANS_FILE" ]]; then
    fail "migration(s) appliquee(s) en base mais absente(s) du depot, non tolerees pour $ENV_NAME :
$(cat "$UNKNOWN_ORPHANS_FILE")
       Staging : ajouter le nom dans $ORPHANS_FILE seulement apres avoir documente la cause (voir ADR-003), sinon corriger le depot.
       Prod : aucune orpheline n'est toleree (la liste des orphelines connues est ignoree) : corriger le depot ou la base."
  fi

  ok "migration(s) orpheline(s) connue(s) et documentee(s) ($ORPHANS_FILE) : $(tr '\n' ' ' < "$FOUND_ORPHANS_FILE")"
else
  ok "aucune migration inconnue du depot"
fi

trap - EXIT
migration_check_cleanup

# --- 4. Migrations Prisma ---------------------------------------------------
#
# `migrate deploy` applique les migrations en attente et rien d'autre : il ne
# genere pas de migration, ne reinitialise pas, ne perd pas de donnees.
# JAMAIS `db push` ni `migrate reset` sur cette base.

step "Application des migrations Prisma"
recheck_prod_tree "migrate deploy"
compose --profile tools run --rm migrate
ok "migrations appliquees"

step "Etat des migrations"
compose --profile tools run --rm --entrypoint npx migrate \
  prisma migrate status --schema packages/api/prisma/schema.prisma

# --- 5. Pile applicative ----------------------------------------------------

step "Demarrage de l'API et du front"
compose up -d api web

for container in "${STACK_NAME}-api" "${STACK_NAME}-web"; do
  printf '    %s ' "$container"
  state=""
  for _ in $(seq 1 60); do
    state="$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo starting)"
    [[ "$state" == "healthy" || "$state" == "unhealthy" ]] && break
    printf '.'
    sleep 2
  done
  echo
  if [[ "$state" != "healthy" ]]; then
    echo "--- 50 dernieres lignes de $container ---" >&2
    docker logs --tail 50 "$container" >&2 || true
    fail "$container n'est pas healthy (etat : ${state:-inconnu})."
  fi
  ok "$container healthy"
done

# --- 6. Tests de fumee ------------------------------------------------------

step "Tests de fumee"

code="$(curl -s -o /dev/null -w '%{http_code}' "$LOCAL_URL/healthz")"
[[ "$code" == "200" ]] || fail "nginx du conteneur web : /healthz renvoie HTTP $code"
ok "web  $LOCAL_URL/healthz -> 200"

code="$(curl -s -o /dev/null -w '%{http_code}' "$LOCAL_URL/health")"
[[ "$code" == "200" ]] || fail "proxy vers l'API : /health renvoie HTTP $code"
ok "api  $LOCAL_URL/health -> 200 (proxy interne operationnel)"

code="$(curl -s -o /dev/null -w '%{http_code}' "$LOCAL_URL/")"
[[ "$code" == "200" ]] || fail "SPA : / renvoie HTTP $code"
ok "spa  $LOCAL_URL/ -> 200"

# Route inexistante cote serveur : doit retomber sur index.html (React Router).
code="$(curl -s -o /dev/null -w '%{http_code}' "$LOCAL_URL/properties/quelconque")"
[[ "$code" == "200" ]] || fail "repli SPA : une route cliente renvoie HTTP $code au lieu de 200."
ok "spa  repli try_files vers index.html operationnel"

# HTTPS : normal qu'il echoue tant que le vhost et le certificat n'existent pas.
step "Test de fumee HTTPS"
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$PUBLIC_URL/" 2>/dev/null || echo 000)"
if [[ "$code" == "200" ]]; then
  ok "$PUBLIC_URL/ -> 200"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$PUBLIC_URL/health" || echo 000)"
  if [[ "$code" == "200" ]]; then
    ok "$PUBLIC_URL/health -> 200"
  else
    echo "    ATTENTION $PUBLIC_URL/health -> HTTP $code"
  fi
else
  echo "    $PUBLIC_URL injoignable (HTTP $code)."
  echo "    Attendu tant que le vhost nginx et le certificat ne sont pas installes."
  echo "    Voir infra/nginx/${PUBLIC_HOST}.conf."
fi

# --- 7. Verification des voisins -------------------------------------------

step "Empreinte des conteneurs voisins (apres)"
NEIGHBOURS_AFTER="$(mktemp)"
neighbours_fingerprint > "$NEIGHBOURS_AFTER"

if diff -u "$NEIGHBOURS_BEFORE" "$NEIGHBOURS_AFTER" > /dev/null; then
  ok "aucun conteneur voisin n'a bouge ($(wc -l < "$NEIGHBOURS_AFTER") verifies)"
else
  echo "    ATTENTION : la liste des conteneurs voisins a change :" >&2
  diff -u "$NEIGHBOURS_BEFORE" "$NEIGHBOURS_AFTER" >&2 || true
fi
rm -f "$NEIGHBOURS_BEFORE" "$NEIGHBOURS_AFTER"

# --- 8. Recapitulatif -------------------------------------------------------

step "Etat de la pile"
docker ps --filter "name=^${STACK_NAME}-" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

# Journal des deploiements : date, environnement, version, utilisateur.
if printf '%s\t%s\t%s\t%s\n' "$(date -Iseconds)" "$ENV_NAME" "$GIT_SHA" "${USER:-$(id -un)}" \
     >> "$DEPLOY_HISTORY_FILE" 2>/dev/null; then
  ok "deploiement journalise dans $DEPLOY_HISTORY_FILE"
else
  warn "journal $DEPLOY_HISTORY_FILE non inscriptible : deploiement non journalise."
fi

printf '\n\033[1;32mDeploiement %s termine (version %s).\033[0m\n' "$ENV_NAME" "$GIT_SHA"
cat <<RAPPEL

Sauvegardes (a programmer, par cron) :
  ./infra/scripts/backup.sh $ENV_NAME
  base + uploads dans ${BACKUP_DIR:-/home/deployer/backups/${STACK_NAME}}, rotation ${BACKUP_KEEP_DAYS:-14} jours ;
  copie hors serveur si BACKUP_RCLONE_REMOTE est defini. Controle de restauration :
  ./infra/scripts/restore-check.sh <dump.sql.gz>

Les volumes (${STACK_NAME}-postgres-data, ${STACK_NAME}-uploads-data) ne sont
jamais supprimes par ce script. Ne jamais lancer \`docker volume prune\` ni
\`docker system prune -a\` sur ce serveur.
RAPPEL
