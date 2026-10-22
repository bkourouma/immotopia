#!/usr/bin/env bash
#
# Renseigne la cle API d'ImmoCopilot (OpenRouter ou Anthropic) dans le fichier
# de secrets d'une pile, sans editeur et sans jamais afficher la cle.
#
#   ssh -t alliance '/home/deployer/immotopia-saas/infra/scripts/set-ai-key.sh prod openrouter'
#
# Le -t est indispensable : le script pose une question, il lui faut un terminal.
# Environnement et fournisseur sont obligatoires (jamais de valeur par defaut).
# Le script sauvegarde le fichier avant de le modifier et n'ecrit rien si la
# reponse est vide. Il ne redemarre rien : il affiche la suite a lancer.

set -Eeuo pipefail

usage() {
  echo "Usage : $0 <staging|prod> <openrouter|anthropic> [fichier]" >&2
  exit 2
}

ENV_NAME="${1:-}"
case "$ENV_NAME" in
  staging|prod) ;;
  *) echo "Environnement absent ou inconnu : '${ENV_NAME}'." >&2; usage ;;
esac
PROVIDER="${2:-}"
case "$PROVIDER" in
  openrouter) VAR=OPENROUTER_API_KEY ;;
  anthropic) VAR=ANTHROPIC_API_KEY ;;
  *) echo "Fournisseur absent ou inconnu : '${PROVIDER}'." >&2; usage ;;
esac
[[ $# -le 3 ]] || usage

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "${IMMOTOPIA_ALLOW_OVERRIDE:-}" != "1" ]]; then
  unset STACK_NAME IMMOTOPIA_ENV_FILE PUBLIC_ORIGIN WEB_PORT PG_PORT VITE_SHOW_DEMO_ACCOUNTS BACKUP_DIR BACKUP_KEEP_DAYS
fi
# shellcheck disable=SC1090
source "$REPO_ROOT/infra/environments/${ENV_NAME}.conf"

ENV_FILE="${3:-$IMMOTOPIA_ENV_FILE}"
[[ -f "$ENV_FILE" ]] || { echo "$ENV_FILE introuvable." >&2; exit 1; }
[[ -t 0 ]] || { echo "Ce script a besoin d un terminal : ajoute -t a ta commande ssh." >&2; exit 1; }

echo
echo "Environnement $ENV_NAME (pile $STACK_NAME), fichier $ENV_FILE."
# -s : la frappe reste invisible.
read -r -s -p "$VAR : " KEY
echo
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
[[ -n "$KEY" ]] || { echo "Valeur vide : rien n a ete modifie." >&2; exit 1; }

BACKUP="${ENV_FILE}.bak-$(date +%F-%H%M%S)"
cp -p "$ENV_FILE" "$BACKUP"
chmod 600 "$BACKUP"

umask 077
TMP="$(mktemp "${ENV_FILE}.XXXXXX")"
chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT
seen=0
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    "$VAR"=*) printf '%s=%s\n' "$VAR" "$KEY"; seen=1 ;;
    *) printf '%s\n' "$line" ;;
  esac
done < "$ENV_FILE" > "$TMP"
(( seen )) || printf '%s=%s\n' "$VAR" "$KEY" >> "$TMP"

mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo
echo "$ENV_FILE mis a jour (sauvegarde : $BACKUP)."
echo "  $VAR : renseignee (${#KEY} caracteres, non affichee)"
echo
echo "Applique maintenant la configuration :"
echo "  cd /home/deployer/immotopia-saas && ./infra/scripts/backup.sh $ENV_NAME && ./infra/scripts/deploy.sh $ENV_NAME --no-build"
