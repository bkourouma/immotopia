#!/usr/bin/env bash
#
# Renseigne les identifiants OAuth Google dans le fichier de secrets d'une pile
# (staging ou production), sans editeur et sans jamais afficher le secret.
#
#   ssh -t -p 2222 deployer@147.93.44.169 \
#       '/home/deployer/immotopia-saas/infra/scripts/set-google-oauth.sh staging'
#
# Le -t est indispensable : le script pose des questions, il lui faut un
# terminal.
#
# L'environnement est obligatoire (jamais de valeur par defaut). Il determine
# l'origine et l'URI de redirection a declarer dans la console Google, et le
# fichier modifie (par defaut celui de infra/environments/<env>.conf).
#
# Les deux valeurs viennent de la console Google Cloud :
#   API et services > Identifiants > Creer des identifiants
#   > ID client OAuth > Application Web
# Un client OAuth par environnement : ne pas reutiliser celui du staging en
# production.
#
# Le script sauvegarde le fichier avant de le modifier, coupe les espaces
# parasites autour des valeurs collees, et n'ecrit rien si une reponse est vide.

set -Eeuo pipefail

usage() {
  echo "Usage : $0 <staging|prod> [fichier]" >&2
  exit 2
}

# Liste blanche, verifiee AVANT de sourcer : l'argument sert a fabriquer un chemin.
ENV_NAME="${1:-}"
case "$ENV_NAME" in
  staging|prod) ;;
  *) echo "Environnement absent ou inconnu : '${ENV_NAME}'." >&2; usage ;;
esac
[[ $# -le 2 ]] || usage

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

ENV_FILE="${2:-$IMMOTOPIA_ENV_FILE}"
REDIRECT_URI="$PUBLIC_ORIGIN/api/auth/google/callback"

[[ -f "$ENV_FILE" ]] || { echo "$ENV_FILE introuvable." >&2; exit 1; }
[[ -t 0 ]] || { echo "Ce script a besoin d un terminal : ajoute -t a ta commande ssh." >&2; exit 1; }

cat <<RAPPEL

Environnement $ENV_NAME (pile $STACK_NAME), fichier $ENV_FILE.

Avant de continuer, verifie dans la console Google Cloud que le client OAUTH
declare EXACTEMENT ces deux valeurs :

  Origine JavaScript autorisee : $PUBLIC_ORIGIN
  URI de redirection autorise  : $REDIRECT_URI

Au caractere pres. C'est la cause numero un des echecs de connexion Google
(erreur redirect_uri_mismatch).

RAPPEL

read -r -p "GOOGLE_CLIENT_ID    : " CID
# -s : la frappe reste invisible, le secret ne s'affiche pas a l'ecran.
read -r -s -p "GOOGLE_CLIENT_SECRET: " CSECRET
echo

# Les copier-coller depuis un navigateur trainent souvent une espace ou un
# retour chariot. Une valeur ainsi polluee produit une erreur d'authentification
# Google parfaitement opaque.
CID="$(printf '%s' "$CID" | tr -d '[:space:]')"
CSECRET="$(printf '%s' "$CSECRET" | tr -d '[:space:]')"

[[ -n "$CID" && -n "$CSECRET" ]] || { echo "Valeur vide : rien n a ete modifie." >&2; exit 1; }

if [[ "$CID" != *.apps.googleusercontent.com ]]; then
  echo
  echo "ATTENTION : un identifiant client Google se termine normalement par"
  echo "            .apps.googleusercontent.com — ce n'est pas le cas ici."
  read -r -p "Continuer quand meme ? [o/N] " ok
  [[ "$ok" == "o" || "$ok" == "O" ]] || { echo "Abandon, rien n a ete modifie."; exit 1; }
fi

BACKUP="${ENV_FILE}.bak-$(date +%F-%H%M%S)"
cp -p "$ENV_FILE" "$BACKUP"
chmod 600 "$BACKUP"

# Reecriture ligne a ligne plutot que sed : les valeurs ne traversent jamais
# une expression reguliere, donc aucun caractere ne peut casser la substitution.
umask 077
# Fichier temporaire dans le MEME repertoire que le fichier de secrets : le mv
# final est ainsi atomique (meme systeme de fichiers), et le secret n'est jamais
# ecrit dans /tmp. mktemp le cree en mode 600.
TMP="$(mktemp "${ENV_FILE}.XXXXXX")"
chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT
seen_id=0
seen_secret=0
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    GOOGLE_CLIENT_ID=*)
      printf 'GOOGLE_CLIENT_ID=%s\n' "$CID"; seen_id=1 ;;
    GOOGLE_CLIENT_SECRET=*)
      printf 'GOOGLE_CLIENT_SECRET=%s\n' "$CSECRET"; seen_secret=1 ;;
    *)
      printf '%s\n' "$line" ;;
  esac
done < "$ENV_FILE" > "$TMP"

(( seen_id )) || printf 'GOOGLE_CLIENT_ID=%s\n' "$CID" >> "$TMP"
(( seen_secret )) || printf 'GOOGLE_CLIENT_SECRET=%s\n' "$CSECRET" >> "$TMP"

mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo
echo "$ENV_FILE mis a jour (sauvegarde : $BACKUP)."
echo "  GOOGLE_CLIENT_ID     : ${CID:0:12}... (${#CID} caracteres)"
echo "  GOOGLE_CLIENT_SECRET : renseigne (${#CSECRET} caracteres, non affiche)"
echo
echo "GOOGLE_CALLBACK_URL est volontairement laissee de cote : l'API la deduit"
echo "de BACKEND_URL et obtient $REDIRECT_URI."
echo
echo "Applique maintenant la configuration :"
echo "  cd /home/deployer/immotopia-saas && ./infra/scripts/deploy.sh $ENV_NAME --no-build"
