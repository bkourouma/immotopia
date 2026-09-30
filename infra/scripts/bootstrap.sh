#!/usr/bin/env bash
#
# Amorcage d'une plateforme ImmoTopia VIERGE (apres le premier deploy.sh) :
#
#   ./infra/scripts/bootstrap.sh <staging|prod>            # amorcage
#   ./infra/scripts/bootstrap.sh <staging|prod> --dry-run  # etat et plan, rien n'est ecrit
#
# `prisma migrate deploy` (deploy.sh) ne pose que le schema, le catalogue
# d'abonnements et les parametres fiscaux. Il manque, pour qu'un super-admin se
# connecte et cree une agence :
#   1. RBAC (permissions, roles, matrice)        prisma/seeds/rbac-seed.ts
#   2. les 12 gabarits de type de bien           prisma/seeds/property-templates-seed.ts
#   3. un premier compte SUPER_ADMIN             prisma/seeds/create-platform-super-admin.ts
#
# Ces trois seeds, et AUCUN autre, tournent dans l'image « migrate » via le
# service Compose du meme nom. Chaque etape n'est lancee que si son etat est
# absent ou INCOMPLET : le script est idempotent, et relance sans effet quand
# tout est en place (relancer le seed RBAC reajouterait des permissions qu'un
# super-admin aurait retirees). Le RBAC est juge complet quand les 5 roles cles
# existent ET que la DERNIERE ecriture de rbac-seed.ts est presente
# (TENANT_ACCOUNTANT <- BILLING_VIEW) : un seed interrompu en cours de route
# laisse un etat incomplet, que ses upserts permettent de relancer sans risque.
#
# L'e-mail du super-admin est saisi deux fois puis confirme ; le mot de passe
# est saisi au terminal (deux fois, sans echo), transmis par un tube a l'entree
# standard du seed ; jamais ecrit sur disque, jamais en argument, jamais dans
# l'environnement, jamais affiche. Toutes les saisies sont recueillies AVANT le
# premier seed : un abandon n'ecrit rien.

set -Eeuo pipefail

usage() {
  echo "Usage : $0 <staging|prod> [--dry-run]" >&2
  exit 2
}

# Liste blanche, verifiee AVANT de sourcer : l'argument sert a fabriquer un chemin.
ENV_NAME="${1:-}"
case "$ENV_NAME" in
  staging|prod) shift ;;
  *) echo "Environnement absent ou inconnu : '${ENV_NAME}'." >&2; usage ;;
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
# de l'appelant : un STACK_NAME ou un WEB_PORT oublie dans le shell viserait la
# mauvaise pile. IMMOTOPIA_ALLOW_OVERRIDE=1 rouvre ce remplacement (essais
# locaux uniquement ; deploy.sh le refuse pour la production).
if [[ "${IMMOTOPIA_ALLOW_OVERRIDE:-}" != "1" ]]; then
  unset STACK_NAME IMMOTOPIA_ENV_FILE PUBLIC_ORIGIN WEB_PORT PG_PORT VITE_SHOW_DEMO_ACCOUNTS BACKUP_DIR BACKUP_KEEP_DAYS
fi
if [[ "$ENV_NAME" == "prod" && "${IMMOTOPIA_ALLOW_OVERRIDE:-}" == "1" ]]; then
  echo "IMMOTOPIA_ALLOW_OVERRIDE=1 est refuse pour la production : ses reglages ne se remplacent pas." >&2
  exit 2
fi

# set -a : Compose lit STACK_NAME, WEB_PORT... dans son environnement.
set -a
# shellcheck disable=SC1090
source "infra/environments/${ENV_NAME}.conf"
set +a

for var in STACK_NAME IMMOTOPIA_ENV_FILE PUBLIC_ORIGIN WEB_PORT PG_PORT VITE_SHOW_DEMO_ACCOUNTS; do
  [[ -n "${!var:-}" ]] || { echo "infra/environments/${ENV_NAME}.conf ne definit pas $var." >&2; exit 2; }
done

ENV_FILE="$IMMOTOPIA_ENV_FILE"
COMPOSE_FILE="infra/compose/docker-compose.prod.yml"
PG_CONTAINER="${STACK_NAME}-postgres"
MIGRATE_IMAGE="${STACK_NAME}-api-migrate:latest"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32mOK\033[0m   %s\n' "$*"; }
info() { printf '         %s\n' "$*"; }
fail() { printf '    \033[31mECHEC\033[0m %s\n' "$*" >&2; exit 1; }
warn() { printf '    \033[33mATTENTION\033[0m %s\n' "$*" >&2; }

trap 'echo >&2; echo "Arret de l amorcage (ligne $LINENO)." >&2' ERR

compose() {
  docker compose -p "$STACK_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

# Valeur d'une variable du fichier d'environnement (guillemets et CR retires).
# Ne jamais l'afficher si c'est un secret.
envval() {
  local file="${2:-$ENV_FILE}" line
  line="$(grep -E "^$1=" "$file" | head -1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  case "$line" in
    \"*\") line="${line#\"}"; line="${line%\"}" ;;
    \'*\') line="${line#\'}"; line="${line%\'}" ;;
  esac
  printf '%s' "$line"
}

# Requete SQL en lecture, une valeur, sans decoration. $POSTGRES_* sont
# developpes par le sh DU CONTENEUR (apostrophes) : jamais sur la ligne de
# commande de l'hote. La requete est une constante de ce script.
sql_value() {
  local query="$1"
  compose exec -T postgres sh -c \
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"' sh "$query" \
    | tr -d '[:space:]'
}

# Un seed du dossier prisma/seeds, dans l'image migrate (arbre complet, ts-node).
# Reseau et env_file de la pile ; --no-deps : Postgres tourne deja.
run_seed() {
  local script="$1"; shift
  compose --profile tools run --rm --no-deps -T -w /repo/packages/api \
    --entrypoint npx migrate ts-node -T "prisma/seeds/${script}.ts" "$@"
}

# --- 0. Preconditions --------------------------------------------------------

step "Preconditions"
echo "    environnement : $ENV_NAME  (pile $STACK_NAME, $PUBLIC_ORIGIN)"
(( DRY_RUN )) && echo "    mode : --dry-run (aucun seed lance, rien n'est ecrit)"

command -v docker >/dev/null 2>&1 || fail "docker est requis."
[[ -f "$COMPOSE_FILE" ]] || fail "$COMPOSE_FILE introuvable : lancer le script depuis la racine du depot deploye."
[[ -f "$ENV_FILE" ]]     || fail "$ENV_FILE introuvable : ./infra/scripts/make-env.sh $ENV_NAME."

perms="$(stat -c '%a' "$ENV_FILE")"
[[ "$perms" == "600" ]] || fail "$ENV_FILE est en mode $perms, attendu 600 (chmod 600 $ENV_FILE)."
ok "fichier de secrets present, mode 600"

# Ne jamais afficher DATABASE_URL : elle porte le mot de passe.
[[ "$(envval DATABASE_URL)" == *"@${STACK_NAME}-postgres:5432/"* ]] \
  || fail "DATABASE_URL ne vise pas @${STACK_NAME}-postgres:5432/ : ce fichier d'environnement appartient a une autre pile."
ok "DATABASE_URL vise ${STACK_NAME}-postgres"

compose config -q || fail "docker-compose.prod.yml invalide."

[[ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null || echo false)" == "true" ]] \
  || fail "le conteneur $PG_CONTAINER ne tourne pas : lancer d'abord ./infra/scripts/deploy.sh $ENV_NAME"
health="$(docker inspect -f '{{.State.Health.Status}}' "$PG_CONTAINER" 2>/dev/null || echo inconnu)"
[[ "$health" == "healthy" ]] || fail "$PG_CONTAINER n'est pas healthy (etat : $health)."
ok "$PG_CONTAINER en marche et healthy"

has_migrations="$(sql_value "SELECT to_regclass('_prisma_migrations') IS NOT NULL;")"
[[ "$has_migrations" == "t" ]] \
  || fail "la table _prisma_migrations est absente : lancer d'abord ./infra/scripts/deploy.sh $ENV_NAME"
ok "schema Prisma present (_prisma_migrations)"

docker image inspect "$MIGRATE_IMAGE" >/dev/null 2>&1 \
  || fail "l'image $MIGRATE_IMAGE est absente : lancer d'abord ./infra/scripts/deploy.sh $ENV_NAME (elle la construit)."
ok "image $MIGRATE_IMAGE presente"

# --- 1. Etat de la base ------------------------------------------------------

count_of() { # $1 = requete COUNT ; refuse toute reponse non numerique
  local n
  n="$(sql_value "$1")"
  [[ "$n" =~ ^[0-9]+$ ]] || fail "reponse inattendue de la base pour « $1 » : '$n'."
  printf '%s' "$n"
}

RBAC_KEY_ROLES="'PLATFORM_SUPER_ADMIN','TENANT_ADMIN','TENANT_MANAGER','TENANT_AGENT','TENANT_ACCOUNTANT'"
RBAC_EXPECTED_ROLES=5

role_perm_count() { # $1 = cle de role (constante du script) : permissions accordees
  count_of "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.key = '$1';"
}

read_state() {
  N_PERMISSIONS="$(count_of 'SELECT count(*) FROM permissions;')"
  N_ROLES="$(count_of 'SELECT count(*) FROM roles;')"
  N_KEY_ROLES="$(count_of "SELECT count(*) FROM roles WHERE key IN (${RBAC_KEY_ROLES});")"
  # Derniere ecriture de rbac-seed.ts : BILLING_VIEW -> TENANT_ACCOUNTANT (aucun
  # sous-seed n'attribue BILLING_VIEW). Sa presence prouve que le seed est alle au bout.
  N_RBAC_LAST="$(count_of "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.key = 'TENANT_ACCOUNTANT' AND p.key = 'BILLING_VIEW';")"
  N_SA_PERMS="$(role_perm_count PLATFORM_SUPER_ADMIN)"
  N_TA_PERMS="$(role_perm_count TENANT_ADMIN)"
  N_TEMPLATES="$(count_of 'SELECT count(*) FROM property_type_templates;')"
  N_SUPERADMINS="$(count_of "SELECT count(*) FROM users WHERE global_role = 'SUPER_ADMIN';")"
}

print_state() {
  info "permissions              : $N_PERMISSIONS"
  info "roles                    : $N_ROLES (roles cles : $N_KEY_ROLES/$RBAC_EXPECTED_ROLES)"
  info "  permissions PLATFORM_SUPER_ADMIN : $N_SA_PERMS"
  info "  permissions TENANT_ADMIN         : $N_TA_PERMS"
  info "gabarits de type de bien : $N_TEMPLATES"
  info "comptes SUPER_ADMIN      : $N_SUPERADMINS"
}

step "Etat de la base (avant)"
read_state
print_state

# Etat du RBAC : vide, complet ou incomplet (aucun nombre de permissions en dur :
# il evolue avec le produit).
rbac_state() {
  if (( N_PERMISSIONS == 0 && N_ROLES == 0 )); then echo vide
  elif (( N_PERMISSIONS > 0 && N_KEY_ROLES == RBAC_EXPECTED_ROLES && N_RBAC_LAST > 0 )); then echo complet
  else echo incomplet
  fi
}

DO_RBAC=0; DO_TEMPLATES=0; DO_ADMIN=0
RBAC_STATE="$(rbac_state)"
[[ "$RBAC_STATE" == "complet" ]] || DO_RBAC=1
(( N_TEMPLATES == 0 )) && DO_TEMPLATES=1
(( N_SUPERADMINS == 0 )) && DO_ADMIN=1

step "Plan"
case "$RBAC_STATE" in
  vide)      info "RBAC             : sera pose (rbac-seed.ts)" ;;
  incomplet) info "RBAC             : RBAC incomplet : sera complete (relance idempotente de rbac-seed.ts)" ;;
  *)         info "RBAC             : deja pose, ignore" ;;
esac
if (( DO_TEMPLATES )); then info "gabarits de bien : seront poses (property-templates-seed.ts)"; else info "gabarits de bien : deja poses, ignores"; fi
if (( DO_ADMIN )); then info "super-admin      : sera cree (saisie interactive)"; else info "super-admin      : existe deja, ignore"; fi

if (( DRY_RUN )); then
  echo
  echo "Dry-run termine : aucun seed n'a ete lance, aucune donnee n'a ete ecrite."
  exit 0
fi

# --- 2. Saisies (avant toute ecriture) ---------------------------------------

if (( DO_ADMIN )); then
  step "Premier compte SUPER_ADMIN : saisies"
  if [[ ! -t 0 || ! -t 1 ]]; then
    fail "un terminal interactif est obligatoire pour saisir le mot de passe (relancer sans redirection ni tube)."
  fi

  ADMIN_EMAIL=""; ADMIN_EMAIL_CONFIRM=""; ADMIN_NAME=""; ADMIN_PASSWORD=""; ADMIN_PASSWORD_CONFIRM=""
  # Le mot de passe ne survit jamais au script, quelle que soit la sortie.
  trap 'unset ADMIN_PASSWORD ADMIN_PASSWORD_CONFIRM' EXIT

  # E-mail : trim et minuscules, saisi deux fois (une faute de frappe vers une
  # vraie boite tierce lui donnerait la main sur « mot de passe oublie »).
  normalize_email() {
    local v="${1,,}"
    v="${v#"${v%%[![:space:]]*}"}"
    v="${v%"${v##*[![:space:]]}"}"
    printf '%s' "$v"
  }
  read -r -p "    E-mail du super-admin : " ADMIN_EMAIL
  ADMIN_EMAIL="$(normalize_email "$ADMIN_EMAIL")"
  [[ -n "$ADMIN_EMAIL" ]] || fail "l'e-mail est obligatoire."
  read -r -p "    Confirmer l'e-mail : " ADMIN_EMAIL_CONFIRM
  ADMIN_EMAIL_CONFIRM="$(normalize_email "$ADMIN_EMAIL_CONFIRM")"
  [[ "$ADMIN_EMAIL" == "$ADMIN_EMAIL_CONFIRM" ]] || fail "les deux saisies de l'e-mail different : abandon, rien n'a ete ecrit."
  read -r -p "    Nom affiche [Super Administrateur] : " ADMIN_NAME
  ADMIN_NAME="${ADMIN_NAME:-Super Administrateur}"

  read -r -p "    Creer le SUPER_ADMIN ${ADMIN_EMAIL} (${ADMIN_NAME}) sur ${PUBLIC_ORIGIN} ? [o/N] " answer
  case "$answer" in
    o|O) ;;
    *) fail "abandon a la demande de l'operateur : rien n'a ete ecrit." ;;
  esac

  read -r -s -p "    Mot de passe (12 caracteres minimum, sans echo) : " ADMIN_PASSWORD; echo
  read -r -s -p "    Confirmer le mot de passe : " ADMIN_PASSWORD_CONFIRM; echo
  [[ -n "$ADMIN_PASSWORD" ]] || fail "le mot de passe est vide."
  [[ "$ADMIN_PASSWORD" == "$ADMIN_PASSWORD_CONFIRM" ]] || fail "les deux saisies du mot de passe different."
  unset ADMIN_PASSWORD_CONFIRM
fi

# --- 3. RBAC et gabarits -----------------------------------------------------

if (( DO_RBAC )); then
  step "Seed RBAC"
  run_seed rbac-seed
  ok "RBAC pose"
fi

if (( DO_TEMPLATES )); then
  step "Gabarits de type de bien"
  run_seed property-templates-seed
  ok "gabarits poses"
fi

# --- 4. Premier super-admin --------------------------------------------------

if (( DO_ADMIN )); then
  step "Creation du SUPER_ADMIN"
  # printf est un builtin : le mot de passe n'apparait dans aucun argv. Le seed
  # valide la robustesse et refuse un compte existant (code 2, rien de modifie).
  rc=0
  printf '%s' "$ADMIN_PASSWORD" | run_seed create-platform-super-admin \
    --email "$ADMIN_EMAIL" --name "$ADMIN_NAME" --password-stdin || rc=$?
  unset ADMIN_PASSWORD
  [[ "$rc" == "0" ]] || fail "la creation du super-admin a echoue (code $rc, voir le message ci-dessus). Relancer ce script apres correction."
  ok "super-admin cree"
fi

# --- 5. Recapitulatif --------------------------------------------------------

step "Etat de la base (apres)"
read_state
print_state
(( N_PERMISSIONS > 0 )) || fail "aucune permission apres amorcage."
(( N_ROLES >= RBAC_EXPECTED_ROLES && N_KEY_ROLES == RBAC_EXPECTED_ROLES )) \
  || fail "roles incomplets apres amorcage ($N_KEY_ROLES/$RBAC_EXPECTED_ROLES roles cles, $N_ROLES roles) : relancer ce script."
(( N_SA_PERMS > 0 )) || fail "PLATFORM_SUPER_ADMIN n'a aucune permission apres amorcage : relancer ce script."
(( N_TA_PERMS > 0 )) || fail "TENANT_ADMIN n'a aucune permission apres amorcage : relancer ce script."
[[ "$(rbac_state)" == "complet" ]] || fail "RBAC encore incomplet apres amorcage : relancer ce script."
(( N_TEMPLATES > 0 ))   || fail "aucun gabarit de bien apres amorcage."
(( N_SUPERADMINS > 0 )) || fail "aucun SUPER_ADMIN apres amorcage."

printf '\n\033[1;32mAmorcage %s termine.\033[0m\n' "$ENV_NAME"
echo "Prochaine etape : se connecter sur $PUBLIC_ORIGIN avec le compte SUPER_ADMIN,"
echo "puis creer la premiere agence (administration > agences)."
