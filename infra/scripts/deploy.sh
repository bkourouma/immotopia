#!/usr/bin/env bash
#
# Deploiement d'ImmoTopia sur app.immotopia.cloud.
#
# Idempotent : relancable autant de fois que necessaire. Il ne supprime jamais
# de volume, ne reinitialise jamais la base, et ne touche a rien dont le nom ne
# commence pas par immotopia-saas.
#
#   ./infra/scripts/deploy.sh              # deploiement complet
#   ./infra/scripts/deploy.sh --no-build   # redemarrage sans reconstruire
#
# A lancer depuis /home/deployer/immotopia-saas (racine du depot deploye).

set -Eeuo pipefail

PROJECT="immotopia-saas"
ENV_FILE="${IMMOTOPIA_ENV_FILE:-/home/deployer/immotopia-saas.env}"
COMPOSE_FILE="infra/compose/docker-compose.prod.yml"
PUBLIC_URL="https://app.immotopia.cloud"
LOCAL_URL="http://127.0.0.1:3019"
BUILD=1

for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    *) echo "Option inconnue : $arg" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32mOK\033[0m   %s\n' "$*"; }
fail() { printf '    \033[31mECHEC\033[0m %s\n' "$*" >&2; exit 1; }

trap 'echo >&2; echo "Arret du deploiement (ligne $LINENO). Aucune donnee supprimee." >&2' ERR

compose() {
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

# --- 0. Verifications prealables -------------------------------------------

step "Verifications prealables"

[[ -f "$COMPOSE_FILE" ]] || fail "$COMPOSE_FILE introuvable : lancer le script depuis la racine du depot deploye."
[[ -f "$ENV_FILE" ]]     || fail "$ENV_FILE introuvable : voir infra/.env.example."

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

# JWT_SECRET : l'API sort en erreur sous 32 caracteres. Autant le voir ici.
jwt_len=$(( $(grep -E '^JWT_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | wc -c) - 1 ))
(( jwt_len >= 32 )) || fail "JWT_SECRET fait $jwt_len caracteres, il en faut au moins 32."
ok "JWT_SECRET suffisamment long ($jwt_len caracteres)"

compose config -q || fail "docker-compose.prod.yml invalide."
ok "fichier compose valide"

# --- 1. Empreinte des voisins ----------------------------------------------
#
# Le serveur heberge une vingtaine d'autres applications. On photographie les
# conteneurs qui ne nous appartiennent pas, pour prouver a la fin qu'aucun n'a
# bouge.

step "Empreinte des conteneurs voisins (avant)"
NEIGHBOURS_BEFORE="$(mktemp)"
docker ps --format '{{.Names}}\t{{.RunningFor}}' | grep -v '^immotopia-saas-' | sort > "$NEIGHBOURS_BEFORE"
ok "$(wc -l < "$NEIGHBOURS_BEFORE") conteneurs voisins recenses"

# --- 2. Construction des images --------------------------------------------

if (( BUILD )); then
  step "Construction des images"
  # --pull : reprendre les derniers correctifs des images de base.
  compose build --pull api web
  compose --profile tools build migrate
  ok "images construites"

  # bcrypt est un module natif. packages/api/Dockerfile installe avec
  # --ignore-scripts, ce qui empeche node-pre-gyp de recuperer le binaire :
  # l'API demarrerait quand meme, et TOUTE connexion planterait a l'execution.
  # On le verifie avant de deployer quoi que ce soit.
  step "Verification du binding natif bcrypt"
  if docker run --rm --entrypoint node immotopia-saas-api:latest \
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
  state="$(docker inspect -f '{{.State.Health.Status}}' immotopia-saas-postgres 2>/dev/null || echo starting)"
  [[ "$state" == "healthy" ]] && break
  printf '.'
  sleep 2
done
echo
[[ "$state" == "healthy" ]] || fail "Postgres n'est pas healthy apres 120 s (etat : ${state:-inconnu})."
ok "immotopia-saas-postgres healthy"

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

step "Controle des migrations inconnues du depot"

ORPHANS_FILE="infra/scripts/migrations-orphelines-connues.txt"
[[ -f "$ORPHANS_FILE" ]] || fail "$ORPHANS_FILE introuvable."

APPLIED_FILE="$(mktemp)"
APPLIED_ERR_FILE="$(mktemp)"
LOCAL_DIRS_FILE="$(mktemp)"
FOUND_ORPHANS_FILE="$(mktemp)"
UNKNOWN_ORPHANS_FILE="$(mktemp)"
KNOWN_ORPHANS_FILE=""

migration_check_cleanup() {
  rm -f "$APPLIED_FILE" "$APPLIED_ERR_FILE" "$LOCAL_DIRS_FILE" \
        "$FOUND_ORPHANS_FILE" "$UNKNOWN_ORPHANS_FILE" $KNOWN_ORPHANS_FILE 2>/dev/null || true
}
trap migration_check_cleanup EXIT

# Migrations terminees et non annulees en base, lues par le socket local du
# conteneur postgres : $POSTGRES_USER/$POSTGRES_DB viennent de l'environnement
# deja pose sur ce conteneur par $ENV_FILE, jamais de la ligne de commande -
# aucun secret n'est affiche ni journalise par cette etape.
if ! compose exec -T postgres sh -c \
     'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;"' \
     > "$APPLIED_FILE" 2>"$APPLIED_ERR_FILE"; then
  if grep -qi '_prisma_migrations" does not exist' "$APPLIED_ERR_FILE"; then
    # Tout premier deploiement sur une base neuve : rien n'est encore
    # applique, donc rien ne peut etre orphelin.
    : > "$APPLIED_FILE"
  else
    cat "$APPLIED_ERR_FILE" >&2
    fail "lecture de _prisma_migrations impossible sur postgres (voir la sortie ci-dessus)."
  fi
fi

find packages/api/prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
  | sort -u > "$LOCAL_DIRS_FILE"

# Appliquees en base sans dossier local correspondant.
comm -23 <(sort -u "$APPLIED_FILE") "$LOCAL_DIRS_FILE" > "$FOUND_ORPHANS_FILE"

if [[ -s "$FOUND_ORPHANS_FILE" ]]; then
  KNOWN_ORPHANS_FILE="$(mktemp)"
  sed -e 's/\r$//' -e 's/#.*$//' -e 's/[[:space:]]*$//' -e '/^$/d' "$ORPHANS_FILE" \
    | sort -u > "$KNOWN_ORPHANS_FILE"

  comm -23 "$FOUND_ORPHANS_FILE" "$KNOWN_ORPHANS_FILE" > "$UNKNOWN_ORPHANS_FILE"

  if [[ -s "$UNKNOWN_ORPHANS_FILE" ]]; then
    fail "migration(s) appliquee(s) en base mais absente(s) du depot, non documentee(s) dans $ORPHANS_FILE :
$(cat "$UNKNOWN_ORPHANS_FILE")
       Ajouter le nom dans ce fichier seulement apres avoir documente la cause (voir ADR-003), sinon corriger le depot."
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
compose --profile tools run --rm migrate
ok "migrations appliquees"

step "Etat des migrations"
compose --profile tools run --rm --entrypoint npx migrate \
  prisma migrate status --schema packages/api/prisma/schema.prisma

# --- 5. Pile applicative ----------------------------------------------------

step "Demarrage de l'API et du front"
compose up -d api web

for container in immotopia-saas-api immotopia-saas-web; do
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
  echo "    Voir infra/nginx/app.immotopia.cloud.conf."
fi

# --- 7. Verification des voisins -------------------------------------------

step "Empreinte des conteneurs voisins (apres)"
NEIGHBOURS_AFTER="$(mktemp)"
docker ps --format '{{.Names}}\t{{.RunningFor}}' | grep -v '^immotopia-saas-' | sort > "$NEIGHBOURS_AFTER"

if diff -u "$NEIGHBOURS_BEFORE" "$NEIGHBOURS_AFTER" > /dev/null; then
  ok "aucun conteneur voisin n'a bouge ($(wc -l < "$NEIGHBOURS_AFTER") verifies)"
else
  echo "    ATTENTION : la liste des conteneurs voisins a change :" >&2
  diff -u "$NEIGHBOURS_BEFORE" "$NEIGHBOURS_AFTER" >&2 || true
fi
rm -f "$NEIGHBOURS_BEFORE" "$NEIGHBOURS_AFTER"

# --- 8. Recapitulatif -------------------------------------------------------

step "Etat de la pile"
docker ps --filter 'name=immotopia-saas-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

printf '\n\033[1;32mDeploiement termine.\033[0m\n'
cat <<'RAPPEL'

Sauvegardes (a programmer) :
  base     docker exec immotopia-saas-postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
             | gzip > "immotopia-$(date +%F).sql.gz"
  uploads  docker run --rm -v immotopia-saas-uploads-data:/d:ro -v "$PWD":/b alpine \
             tar czf "/b/uploads-$(date +%F).tar.gz" -C /d .

Les deux volumes (immotopia-saas-postgres-data, immotopia-saas-uploads-data) ne
sont jamais supprimes par ce script. Ne jamais lancer `docker volume prune` ni
`docker system prune -a` sur ce serveur.
RAPPEL
