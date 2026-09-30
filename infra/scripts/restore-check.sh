#!/usr/bin/env bash
#
# Verifie qu'un dump de sauvegarde se restaure, sans toucher a aucune pile.
#
#   ./infra/scripts/restore-check.sh /home/deployer/backups/immotopia-prod/db-2026-09-29-0215.sql.gz
#
# Demarre un conteneur postgres:16-alpine JETABLE (immotopia-restorecheck-<pid>),
# sans AUCUN reseau (--network none : il tourne en authentification « trust »
# pendant qu'il contient une copie complete de la prod, il ne doit donc etre
# joignable de nulle part, ni de l'hote ni des autres conteneurs), restaure le
# dump dedans (ON_ERROR_STOP=1), en affiche le nombre de tables et l'etat des
# migrations Prisma, puis supprime le conteneur en toute circonstance AVEC son
# volume anonyme (l'image declare VOLUME /var/lib/postgresql/data : docker rm -v).
# Ne touche JAMAIS une pile immotopia-saas-* ou immotopia-prod-* : le conteneur
# jetable n'a ni son reseau, ni ses volumes. Tout passe par docker exec (socket
# unix), jamais par le reseau.
#
# Code de sortie non nul si la restauration echoue.

set -Eeuo pipefail

DUMP="${1:-}"
if [[ -z "$DUMP" || $# -ne 1 ]]; then
  echo "Usage : $0 <dump.sql.gz>" >&2
  exit 2
fi
[[ -f "$DUMP" ]] || { echo "Dump introuvable : $DUMP" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "docker est requis." >&2; exit 1; }
gzip -t "$DUMP" || { echo "Le dump est corrompu (gzip -t) : $DUMP" >&2; exit 1; }

CONTAINER="immotopia-restorecheck-$$"
STARTED=0

cleanup() {
  if (( STARTED )); then
    # -v : supprime aussi le volume anonyme (copie de la prod) du conteneur.
    docker rm -f -v "$CONTAINER" >/dev/null 2>&1 || true
    if docker inspect "$CONTAINER" >/dev/null 2>&1; then
      echo "ATTENTION : le conteneur jetable $CONTAINER existe encore et contient une copie de la prod (donnees, volume anonyme)." >&2
      echo "Le supprimer a la main : docker rm -f -v $CONTAINER" >&2
    else
      echo "conteneur jetable $CONTAINER et son volume supprimes"
    fi
  fi
}
trap cleanup EXIT

echo "==> Demarrage du conteneur jetable $CONTAINER"
# trust : aucun mot de passe, donc aucun secret ; --network none le rend
# injoignable par le reseau (un port non publie reste atteignable par IP sur le
# bridge par defaut) : seul docker exec, par socket unix, y accede.
STARTED=1  # avant docker run : un conteneur cree puis en echec est nettoye aussi
docker run -d --name "$CONTAINER" --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_INITDB_ARGS="--encoding=UTF8 --locale=C" \
  postgres:16-alpine >/dev/null

# L'image demarre un serveur temporaire pour initdb puis le redemarre : on
# attend la SECONDE annonce de disponibilite.
printf '    attente de Postgres '
ready=0
for _ in $(seq 1 60); do
  n="$(docker logs "$CONTAINER" 2>&1 | grep -c 'ready to accept connections' || true)"
  if (( n >= 2 )) && docker exec "$CONTAINER" pg_isready -U postgres -q; then ready=1; break; fi
  printf '.'
  sleep 1
done
echo
(( ready )) || { docker logs --tail 20 "$CONTAINER" >&2 || true; echo "Postgres n'a pas demarre." >&2; exit 1; }

echo "==> Restauration de $(basename "$DUMP")"
gzip -dc "$DUMP" | docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres >/dev/null

psql_val() {
  docker exec "$CONTAINER" psql -U postgres -d postgres -Atc "$1"
}

tables="$(psql_val "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")"
echo "==> Restauration reussie"
echo "    tables du schema public : $tables"

if [[ "$(psql_val "SELECT to_regclass('_prisma_migrations') IS NOT NULL;")" == "t" ]]; then
  echo "    _prisma_migrations : $(psql_val 'SELECT count(*) FROM _prisma_migrations;') ligne(s)"
  echo "    derniere migration : $(psql_val 'SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC NULLS LAST, migration_name DESC LIMIT 1;')"
else
  echo "    _prisma_migrations : absente"
fi

(( tables > 0 )) || { echo "ECHEC : aucune table restauree." >&2; exit 1; }
