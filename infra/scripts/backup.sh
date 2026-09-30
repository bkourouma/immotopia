#!/usr/bin/env bash
#
# Sauvegarde d'une pile ImmoTopia : base Postgres + volume des documents.
#
#   ./infra/scripts/backup.sh <staging|prod>
#
# Produit, dans BACKUP_DIR (par defaut /home/deployer/backups/<pile>) :
#   db-AAAA-MM-JJ-HHMM.sql.gz        pg_dump --no-owner --no-privileges
#   uploads-AAAA-MM-JJ-HHMM.tar.gz   archive du volume <pile>-uploads-data
#
# Chaque fichier est verifie (gzip -t, taille non nulle, tar -tzf) avant d'etre
# valide. Les fichiers plus vieux que BACKUP_KEEP_DAYS jours qui correspondent
# EXACTEMENT a ces deux motifs sont supprimes ; rien d'autre dans BACKUP_DIR.
# Si BACKUP_RCLONE_REMOTE est defini (ex. « s3crypt:immotopia »), les deux
# fichiers sont aussi copies hors du serveur avec `rclone copy` ; sinon le
# script avertit qu'il n'existe AUCUNE copie hors serveur.
#
# A programmer par cron, par exemple chaque nuit :
#   15 2 * * * cd /home/deployer/immotopia-saas && ./infra/scripts/backup.sh prod >> /home/deployer/backups/prod-cron.log 2>&1
#
# Aucun secret n'est journalise : les identifiants de la base sont lus dans
# l'environnement du conteneur, jamais sur la ligne de commande. Code de sortie
# non nul au moindre echec.

set -Eeuo pipefail

usage() {
  echo "Usage : $0 <staging|prod>" >&2
  exit 2
}

# Liste blanche, verifiee AVANT de sourcer : l'argument sert a fabriquer un chemin.
ENV_NAME="${1:-}"
case "$ENV_NAME" in
  staging|prod) ;;
  *) echo "Environnement absent ou inconnu : '${ENV_NAME}'." >&2; usage ;;
esac
[[ $# -eq 1 ]] || usage

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Les reglages viennent de infra/environments/<env>.conf, JAMAIS de l'environnement
# de l'appelant : un STACK_NAME ou un WEB_PORT oublie dans le shell viserait la
# mauvaise pile. IMMOTOPIA_ALLOW_OVERRIDE=1 rouvre ce remplacement (essais
# locaux uniquement ; deploy.sh le refuse pour la production).
if [[ "${IMMOTOPIA_ALLOW_OVERRIDE:-}" != "1" ]]; then
  unset STACK_NAME IMMOTOPIA_ENV_FILE PUBLIC_ORIGIN WEB_PORT PG_PORT VITE_SHOW_DEMO_ACCOUNTS BACKUP_DIR BACKUP_KEEP_DAYS
fi
# shellcheck disable=SC1090
source "$REPO_ROOT/infra/environments/${ENV_NAME}.conf"

# Les sauvegardes contiennent toutes les donnees : lisibles par le seul proprietaire.
umask 077

log()  { printf '%s  %s\n' "$(date -Iseconds)" "$*"; }
warn() { printf '%s  ATTENTION %s\n' "$(date -Iseconds)" "$*" >&2; }
die()  { printf '%s  ECHEC %s\n' "$(date -Iseconds)" "$*" >&2; exit 1; }

[[ "$BACKUP_KEEP_DAYS" =~ ^[1-9][0-9]*$ ]] || die "BACKUP_KEEP_DAYS doit etre un entier >= 1 (valeur : '$BACKUP_KEEP_DAYS')."

PG_CONTAINER="${STACK_NAME}-postgres"
UPLOADS_VOLUME="${STACK_NAME}-uploads-data"
STAMP="$(date +%Y-%m-%d-%H%M)"
DB_FILE="$BACKUP_DIR/db-${STAMP}.sql.gz"
UPLOADS_FILE="$BACKUP_DIR/uploads-${STAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Fichiers partiels : supprimes quelle que soit l'issue, jamais laisses a
# passer pour une sauvegarde valide.
cleanup() {
  rm -f "$DB_FILE.part" "$UPLOADS_FILE.part" 2>/dev/null || true
  [[ -n "${LOCKDIR:-}" ]] && rmdir "$LOCKDIR" 2>/dev/null || true
}
trap cleanup EXIT
trap 'die "interrompu (ligne $LINENO), aucune sauvegarde partielle conservee."' ERR

# --- Verrou anti-chevauchement ---------------------------------------------
if command -v flock >/dev/null 2>&1; then
  exec 9>"$BACKUP_DIR/.backup.lock"
  flock -n 9 || die "une autre sauvegarde de $STACK_NAME est deja en cours."
else
  LOCKDIR="$BACKUP_DIR/.backup.lockdir"
  mkdir "$LOCKDIR" 2>/dev/null \
    || { LOCKDIR=""; die "une autre sauvegarde est en cours, ou un verrou orphelin existe ($BACKUP_DIR/.backup.lockdir : le supprimer si aucune ne tourne)."; }
fi

command -v docker >/dev/null 2>&1 || die "docker est requis."
[[ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null || echo false)" == "true" ]] \
  || die "le conteneur $PG_CONTAINER ne tourne pas."
docker volume inspect "$UPLOADS_VOLUME" >/dev/null 2>&1 || die "le volume $UPLOADS_VOLUME n'existe pas."

log "sauvegarde de la pile $STACK_NAME ($ENV_NAME) vers $BACKUP_DIR"

# --- 1. Base de donnees -----------------------------------------------------
# $POSTGRES_* sont developpes par le sh DU CONTENEUR (apostrophes ici) : les
# identifiants ne passent jamais par la ligne de commande de l'hote.
log "pg_dump de la base..."
docker exec "$PG_CONTAINER" sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' \
  | gzip > "$DB_FILE.part"

gzip -t "$DB_FILE.part" || die "l'archive de la base est corrompue (gzip -t)."
[[ -s "$DB_FILE.part" ]] || die "l'archive de la base est vide."
# pg_dump termine son flux par cette ligne : son absence signale un dump tronque.
gzip -dc "$DB_FILE.part" | tail -n 5 | grep -q 'PostgreSQL database dump complete' \
  || die "le dump de la base semble tronque (marqueur de fin absent)."
mv "$DB_FILE.part" "$DB_FILE"
log "base : $(basename "$DB_FILE") ($(du -h "$DB_FILE" | cut -f1))"

# --- 2. Documents televerses ------------------------------------------------
# Volume monte en lecture seule ; l'archive est ecrite par l'hote (flux sur la
# sortie standard) pour heriter de l'umask 077.
log "archive des documents..."
docker run --rm -v "${UPLOADS_VOLUME}:/d:ro" alpine tar czf - -C /d . > "$UPLOADS_FILE.part"

gzip -t "$UPLOADS_FILE.part" || die "l'archive des documents est corrompue (gzip -t)."
[[ -s "$UPLOADS_FILE.part" ]] || die "l'archive des documents est vide."
tar -tzf "$UPLOADS_FILE.part" >/dev/null || die "l'archive des documents est illisible (tar -tzf)."
mv "$UPLOADS_FILE.part" "$UPLOADS_FILE"
log "documents : $(basename "$UPLOADS_FILE") ($(du -h "$UPLOADS_FILE" | cut -f1))"

# --- 3. Copie hors serveur --------------------------------------------------
if [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]]; then
  command -v rclone >/dev/null 2>&1 || die "BACKUP_RCLONE_REMOTE est defini mais rclone est introuvable."
  log "copie hors serveur vers ${BACKUP_RCLONE_REMOTE}/${STACK_NAME}/ ..."
  rclone copy "$DB_FILE" "${BACKUP_RCLONE_REMOTE}/${STACK_NAME}/" || die "rclone copy (base) a echoue."
  rclone copy "$UPLOADS_FILE" "${BACKUP_RCLONE_REMOTE}/${STACK_NAME}/" || die "rclone copy (documents) a echoue."
  log "copie hors serveur terminee"
else
  warn "aucune copie hors serveur : BACKUP_RCLONE_REMOTE n'est pas defini. Un disque perdu emporte les donnees ET leurs sauvegardes."
fi

# --- 4. Rotation ------------------------------------------------------------
# Uniquement les fichiers de ce script (motifs exacts), plus vieux que
# BACKUP_KEEP_DAYS jours, directement dans BACKUP_DIR. Jamais autre chose.
old="$(find "$BACKUP_DIR" -maxdepth 1 -type f \
        \( -name 'db-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9].sql.gz' \
        -o -name 'uploads-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9].tar.gz' \) \
        -mtime "+${BACKUP_KEEP_DAYS}" -print -delete | wc -l)"
log "rotation : $old ancien(s) fichier(s) supprime(s) (plus de $BACKUP_KEEP_DAYS jours)"

log "sauvegarde terminee. Controle de restauration : ./infra/scripts/restore-check.sh $DB_FILE"
