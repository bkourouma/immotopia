#!/usr/bin/env bash
#
# Rapatrie sur CE poste (donc HORS du serveur) la derniere sauvegarde d'une pile et
# son fichier de secrets, dans un dossier du projet EXCLU de git.
#
#   ./infra/scripts/pull-backups.sh <staging|prod> [--fresh] [--no-env] [--keep N] [--dest DOSSIER]
#
#   --fresh     lance d'abord backup.sh sur le serveur, puis rapatrie le resultat
#   --no-env    ne rapatrie pas le fichier de secrets (seulement la base et les documents)
#   --keep N    garde les N copies locales les plus recentes (defaut 7)
#   --dest D    dossier de destination (defaut : <depot>/backups-serveur)
#
# Resultat : <dest>/<env>/AAAA-MM-JJ-HHMM/ contenant
#   db-….sql.gz  uploads-….tar.gz  immotopia-<env>.env   (mode 600)
#
# A executer depuis un terminal bash (Git Bash sous Windows), sur le poste de
# travail. Connexion au serveur par SSH sans mot de passe (cle) : IMMOTOPIA_SSH_TARGET
# (defaut deployer@147.93.44.169) et IMMOTOPIA_SSH_PORT (defaut 2222).
#
# SECURITE. Ces copies contiennent TOUTES les donnees et TOUS les secrets, en clair :
#  - le script REFUSE de tourner si la destination n'est pas ignoree par git (le depot
#    est public : un commit par erreur exposerait tout) ;
#  - ne jamais placer la destination dans un dossier synchronise (OneDrive, Dropbox...)
#    sans chiffrement ; chiffrer le disque (BitLocker) ;
#  - c'est un COMPLEMENT, pas un remplacement : une copie chiffree automatique vers un
#    stockage distant (BACKUP_RCLONE_REMOTE de backup.sh) reste recommandee.
#
# Chaque fichier est verifie (somme sha256 comparee a celle du serveur, gzip -t,
# tar -tzf). Code de sortie non nul au moindre echec.

set -Eeuo pipefail

usage() {
  echo "Usage : $0 <staging|prod> [--fresh] [--no-env] [--keep N] [--dest DOSSIER]" >&2
  exit 2
}

# Liste blanche, verifiee AVANT de sourcer : l'argument sert a fabriquer un chemin.
ENV_NAME="${1:-}"
case "$ENV_NAME" in
  staging|prod) shift ;;
  *) echo "Environnement absent ou inconnu : '${ENV_NAME}'." >&2; usage ;;
esac

FRESH=0; WITH_ENV=1; KEEP=7; DEST_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --fresh) FRESH=1 ;;
    --no-env) WITH_ENV=0 ;;
    --keep) shift; [[ "${1:-}" =~ ^[1-9][0-9]*$ ]] || { echo "--keep attend un entier >= 1." >&2; usage; }; KEEP="$1" ;;
    --dest) shift; [[ -n "${1:-}" ]] || usage; DEST_ARG="$1" ;;
    *) echo "Option inconnue : $1" >&2; usage ;;
  esac
  shift
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Les reglages (chemins SUR LE SERVEUR : BACKUP_DIR, fichier de secrets) viennent de
# infra/environments/<env>.conf, jamais de l'environnement de l'appelant.
unset STACK_NAME IMMOTOPIA_ENV_FILE PUBLIC_ORIGIN WEB_PORT PG_PORT VITE_SHOW_DEMO_ACCOUNTS BACKUP_DIR BACKUP_KEEP_DAYS
# shellcheck disable=SC1090
source "$REPO_ROOT/infra/environments/${ENV_NAME}.conf"

SSH_TARGET="${IMMOTOPIA_SSH_TARGET:-deployer@147.93.44.169}"
SSH_PORT="${IMMOTOPIA_SSH_PORT:-2222}"
REMOTE_REPO="${IMMOTOPIA_REMOTE_REPO:-/home/deployer/immotopia-saas}"
DEST="${DEST_ARG:-$REPO_ROOT/backups-serveur}"
STAMP="$(date +%Y-%m-%d-%H%M)"
ENV_DIR="$DEST/$ENV_NAME"
TARGET_DIR="$ENV_DIR/$STAMP"

log()  { printf '%s  %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '%s  ATTENTION %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die()  { printf '%s  ECHEC %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }

command -v ssh >/dev/null 2>&1 || die "ssh est requis."
command -v sha256sum >/dev/null 2>&1 || die "sha256sum est requis."

# Une commande sur le serveur, avec nouvelles tentatives SI LA CONNEXION echoue (code
# 255) : le serveur coupe parfois les connexions sous charge. Un echec de la commande
# elle-meme (autre code) n'est jamais rejoue.
rssh() {
  local try rc=0
  for try in 1 2 3; do
    rc=0
    ssh -n -p "$SSH_PORT" -o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=15 \
        "$SSH_TARGET" "$@" || rc=$?
    [[ "$rc" -ne 255 ]] && return "$rc"
    warn "connexion SSH interrompue (essai $try/3)"; sleep 6
  done
  return 255
}

# --- Destination : creee, puis verifiee IGNOREE par git ------------------------------
mkdir -p "$TARGET_DIR"
chmod 700 "$DEST" "$ENV_DIR" "$TARGET_DIR" 2>/dev/null || true
if git -C "$TARGET_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if ! git -C "$TARGET_DIR" check-ignore -q "$TARGET_DIR/probe"; then
    rmdir "$TARGET_DIR" "$ENV_DIR" "$DEST" 2>/dev/null || true
    die "$DEST n'est pas ignore par git : ajouter « /backups-serveur/ » au .gitignore (ou une regle .git/info/exclude) avant de rapatrier des secrets."
  fi
  log "destination ignoree par git : OK"
else
  warn "la destination n'est dans aucun depot git : verifier qu'elle n'est pas synchronisee ailleurs."
fi

# --- 1. Sauvegarde fraiche (optionnelle) ---------------------------------------------
if (( FRESH )); then
  log "sauvegarde fraiche sur le serveur (backup.sh $ENV_NAME)..."
  rssh "cd '$REMOTE_REPO' && ./infra/scripts/backup.sh $ENV_NAME" 2>&1 | sed 's/^/    serveur : /' \
    || die "backup.sh a echoue sur le serveur."
fi

# --- 2. Quels fichiers ? (les plus recents) + sommes de controle ----------------------
log "recherche de la derniere sauvegarde sur le serveur ($BACKUP_DIR)..."
LIST="$(rssh "cd '$BACKUP_DIR' 2>/dev/null && for f in \$(ls -1t db-*.sql.gz 2>/dev/null | head -1) \$(ls -1t uploads-*.tar.gz 2>/dev/null | head -1); do printf '%s %s %s\n' \"\$f\" \"\$(sha256sum \"\$f\" | cut -d' ' -f1)\" \"\$(stat -c %Y \"\$f\")\"; done")" \
  || die "impossible de lister les sauvegardes sur le serveur."
[[ "$(printf '%s\n' "$LIST" | grep -c .)" -eq 2 ]] \
  || die "attendu : une base et une archive de documents dans $BACKUP_DIR (lancer backup.sh, ou utiliser --fresh). Reponse : $(printf '%s' "$LIST" | tr '\n' ' ')"

NOW_EPOCH="$(rssh "date +%s")"
while read -r NAME SUM MTIME; do
  AGE_H=$(( (NOW_EPOCH - MTIME) / 3600 ))
  (( AGE_H <= 26 )) || warn "$NAME a $AGE_H h : la sauvegarde nocturne ne tourne peut-etre plus (ou utiliser --fresh)."
  log "telechargement de $NAME (age ${AGE_H} h)..."
  rssh "cat '$BACKUP_DIR/$NAME'" > "$TARGET_DIR/$NAME" || die "telechargement de $NAME echoue."
  LOCAL_SUM="$(sha256sum "$TARGET_DIR/$NAME" | cut -d' ' -f1)"
  [[ "$LOCAL_SUM" == "$SUM" ]] || die "somme de controle differente pour $NAME (copie corrompue)."
  log "  somme sha256 identique a celle du serveur"
  chmod 600 "$TARGET_DIR/$NAME" 2>/dev/null || true
done <<< "$LIST"

# --- 3. Fichier de secrets (optionnel) --------------------------------------------------
if (( WITH_ENV )); then
  ENV_BASENAME="$(basename "$IMMOTOPIA_ENV_FILE")"
  log "telechargement du fichier de secrets ($ENV_BASENAME)..."
  REMOTE_ENV_SUM="$(rssh "sha256sum '$IMMOTOPIA_ENV_FILE' | cut -d' ' -f1")" || die "fichier de secrets illisible sur le serveur."
  ( umask 077; rssh "cat '$IMMOTOPIA_ENV_FILE'" > "$TARGET_DIR/$ENV_BASENAME" ) || die "telechargement du fichier de secrets echoue."
  [[ "$(sha256sum "$TARGET_DIR/$ENV_BASENAME" | cut -d' ' -f1)" == "$REMOTE_ENV_SUM" ]] \
    || die "somme de controle differente pour le fichier de secrets."
  chmod 600 "$TARGET_DIR/$ENV_BASENAME" 2>/dev/null || true
  log "  somme sha256 identique a celle du serveur"
fi

# --- 4. Controles d'integrite locaux ---------------------------------------------------
# Dans le dossier, avec des chemins relatifs : sous Windows, tar lirait « C: » d'un
# chemin absolu comme un nom d'hote.
(
  cd "$TARGET_DIR"
  for f in db-*.sql.gz; do gzip -t "$f" || exit 1; done
  for f in uploads-*.tar.gz; do tar -tzf "$f" >/dev/null || exit 1; done
) || die "une archive est illisible apres telechargement."
log "archives lisibles (gzip -t, tar -tzf)"

# --- 5. Rotation : seulement les dossiers dates de ce script -----------------------------
mapfile -t DIRS < <(find "$ENV_DIR" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9]' | sort -r)
if (( ${#DIRS[@]} > KEEP )); then
  for d in "${DIRS[@]:KEEP}"; do rm -rf -- "$d"; log "ancienne copie supprimee : $(basename "$d")"; done
fi

echo
log "copie hors serveur terminee : $TARGET_DIR"
du -h "$TARGET_DIR"/* 2>/dev/null | sed 's/^/    /'
echo
echo "Ces fichiers contiennent toutes les donnees et tous les secrets, en clair."
echo "Ne les synchronise pas vers un dossier non chiffre ; chiffre le disque (BitLocker)."
