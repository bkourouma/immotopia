#!/usr/bin/env bash
#
# Cree, sur le STAGING uniquement, deux agences de test par pack d'abonnement
# (AGENCE, SYNDIC, PROMOTEUR, INTEGRE, PATRIMOINE_ESSENTIEL, PATRIMOINE_PRO),
# chacune avec un administrateur a mot de passe connu :
#
#   ./infra/scripts/seed-pack-tests.sh staging            # creation / resynchronisation
#   ./infra/scripts/seed-pack-tests.sh staging --dry-run  # affiche le plan, rien n'est lance
#
# A lancer apres deploy.sh et bootstrap.sh (il faut un SUPER_ADMIN). Le seed
# (prisma/seeds/seed-pack-test-tenants.ts) tourne dans l'image « migrate ».
# IDEMPOTENT : une agence deja presente n'est pas recreee, seuls mot de passe,
# membership, role et fin d'essai sont resynchronises ; relancable sans doublon.
#
# REFUSE la production (et tout environnement autre que staging) AVANT toute
# action : ces comptes ont un mot de passe PUBLIC (il figure dans le bundle du
# staging). Le seed repete cette garde cote code (ALLOW_PACK_TEST_TENANTS=1 et
# origine exactement https://app.immotopia.cloud).

set -Eeuo pipefail

usage() {
  echo "Usage : $0 staging [--dry-run]" >&2
  exit 2
}

# Liste blanche, verifiee AVANT de sourcer : l'argument sert a fabriquer un chemin.
ENV_NAME="${1:-}"
case "$ENV_NAME" in
  staging) shift ;;
  prod)
    echo "REFUS : les comptes de test par pack ont un mot de passe public ; ils ne se creent jamais en production." >&2
    exit 2
    ;;
  *) echo "Environnement absent ou inconnu : '${ENV_NAME}' (seul staging est accepte)." >&2; usage ;;
esac

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Option inconnue : $arg" >&2; usage ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Les reglages viennent de infra/environments/<env>.conf, JAMAIS de l'environnement
# de l'appelant (voir bootstrap.sh).
if [[ "${IMMOTOPIA_ALLOW_OVERRIDE:-}" != "1" ]]; then
  unset STACK_NAME IMMOTOPIA_ENV_FILE PUBLIC_ORIGIN WEB_PORT PG_PORT VITE_SHOW_DEMO_ACCOUNTS BACKUP_DIR BACKUP_KEEP_DAYS
fi

set -a
# shellcheck disable=SC1090
source "infra/environments/${ENV_NAME}.conf"
set +a

for var in STACK_NAME IMMOTOPIA_ENV_FILE PUBLIC_ORIGIN WEB_PORT PG_PORT VITE_SHOW_DEMO_ACCOUNTS; do
  [[ -n "${!var:-}" ]] || { echo "infra/environments/${ENV_NAME}.conf ne definit pas $var." >&2; exit 2; }
done

# Defense en profondeur : meme un STAGING mal configure (IMMOTOPIA_ALLOW_OVERRIDE)
# ne doit jamais viser l'origine de production.
if [[ "$PUBLIC_ORIGIN" == *clients.immotopia.cloud* ]]; then
  echo "REFUS : l'origine $PUBLIC_ORIGIN est celle de la production." >&2
  exit 2
fi

ENV_FILE="$IMMOTOPIA_ENV_FILE"
COMPOSE_FILE="infra/compose/docker-compose.prod.yml"
PG_CONTAINER="${STACK_NAME}-postgres"
MIGRATE_IMAGE="${STACK_NAME}-api-migrate:latest"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32mOK\033[0m   %s\n' "$*"; }
info() { printf '         %s\n' "$*"; }
fail() { printf '    \033[31mECHEC\033[0m %s\n' "$*" >&2; exit 1; }

compose() {
  docker compose -p "$STACK_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

step "Plan"
echo "    environnement : $ENV_NAME  (pile $STACK_NAME, $PUBLIC_ORIGIN)"
info "12 agences de test, deux par pack (6 mois et 3 ans d'historique) : AGENCE, SYNDIC, PROMOTEUR, INTEGRE, PATRIMOINE_ESSENTIEL, PATRIMOINE_PRO"
info "administrateurs : <pack>@packs.immotopia.test (mot de passe commun, public : staging seulement)"
info "idempotent : une agence existante est resynchronisee, jamais dupliquee"
info "seed : prisma/seeds/seed-pack-test-tenants.ts (image $MIGRATE_IMAGE, ALLOW_PACK_TEST_TENANTS=1)"

if (( DRY_RUN )); then
  echo
  echo "Dry-run termine : rien n'a ete lance, aucune donnee n'a ete ecrite."
  exit 0
fi

step "Preconditions"
command -v docker >/dev/null 2>&1 || fail "docker est requis."
[[ -f "$COMPOSE_FILE" ]] || fail "$COMPOSE_FILE introuvable : lancer le script depuis la racine du depot deploye."
[[ -f "$ENV_FILE" ]]     || fail "$ENV_FILE introuvable : ./infra/scripts/make-env.sh $ENV_NAME."
compose config -q || fail "docker-compose.prod.yml invalide."
[[ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null || echo false)" == "true" ]] \
  || fail "le conteneur $PG_CONTAINER ne tourne pas : lancer d'abord ./infra/scripts/deploy.sh $ENV_NAME"
docker image inspect "$MIGRATE_IMAGE" >/dev/null 2>&1 \
  || fail "l'image $MIGRATE_IMAGE est absente : lancer d'abord ./infra/scripts/deploy.sh $ENV_NAME (elle la construit)."
ok "pile $STACK_NAME prete"

# Meme mecanique que bootstrap.sh (run_seed), avec la variable de garde du seed
# passee au conteneur par `-e` (option de `compose run`).
run_seed() {
  local script="$1"; shift
  compose --profile tools run --rm --no-deps -T -w /repo/packages/api \
    -e ALLOW_PACK_TEST_TENANTS=1 \
    -e UPLOADS_DIR=/data/uploads \
    -v "${STACK_NAME}-uploads-data:/data/uploads" \
    --entrypoint npx migrate ts-node -T "prisma/seeds/${script}.ts" "$@"
}

step "Creation des agences de test par pack"
run_seed seed-pack-test-tenants || fail "le seed a echoue (voir le message ci-dessus). Il est idempotent : relancer apres correction."

# Le conteneur migrate tourne en root : les fichiers ecrits (photos de biens, PDF des
# documents, pieces jointes) lui appartiennent. L'API tourne en `node` : elle doit
# les lire ET pouvoir ajouter des fichiers dans les memes dossiers (nouvelle photo
# sur un bien du jeu de demonstration, par exemple).
step "Droits sur les fichiers deposes"
compose --profile tools run --rm --no-deps -T \
  -v "${STACK_NAME}-uploads-data:/data/uploads" \
  --entrypoint chown migrate -R node:node /data/uploads \
  || fail "chown du volume ${STACK_NAME}-uploads-data impossible."
ok "volume ${STACK_NAME}-uploads-data rendu a l'utilisateur de l'API"

printf '\n\033[1;32mAgences de test par pack pretes sur %s.\033[0m\n' "$PUBLIC_ORIGIN"
echo "Idempotent : relancer ce script ne cree aucun doublon, il resynchronise seulement les comptes."
echo "Rappel : mot de passe PUBLIC, staging seulement."
