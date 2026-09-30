#!/usr/bin/env bash
#
# Renseigne la configuration SMTP (e-mail sortant) dans le fichier de secrets d'une
# pile, sans editeur et sans jamais afficher le mot de passe.
#
#   ssh -t -p 2222 deployer@147.93.44.169 \
#       'cd /home/deployer/immotopia-saas && ./infra/scripts/set-email-smtp.sh prod'
#
# Le -t est indispensable : le script pose des questions, il lui faut un terminal.
# Le mot de passe est demande deux fois, sans echo, n'est jamais passe en argument
# et n'apparait ni dans l'historique du shell ni dans un journal.
#
# Les valeurs proposees par defaut sont celles du fichier (ou smtp.hostinger.com,
# port 465 en TLS). Sans mot de passe ET sans utilisateur, l'API considere l'e-mail
# comme non configure ; avec les deux, elle l'active et exige alors la verification
# de l'adresse e-mail a la connexion (isEmailDeliveryConfigured).
#
# Staging : ne jamais y mettre la boite de la production (ADR-005, le staging ne
# doit pas notifier de vraies personnes) ; un bac a sable (Mailtrap, MailHog...)
# convient.
#
# Le script sauvegarde le fichier avant de le modifier et n'ecrit rien si une
# reponse est vide ou incoherente.

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

# Racine du depot : a cote du script (depot), sinon depot git du repertoire courant
# (script copie hors du depot pour un usage ponctuel).
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd || true)"
if [[ -n "$SCRIPT_ROOT" && -f "$SCRIPT_ROOT/infra/environments/${ENV_NAME}.conf" ]]; then
  REPO_ROOT="$SCRIPT_ROOT"
else
  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  [[ -n "$REPO_ROOT" && -f "$REPO_ROOT/infra/environments/${ENV_NAME}.conf" ]] \
    || { echo "Depot ImmoTopia introuvable : lancer le script depuis /home/deployer/immotopia-saas." >&2; exit 1; }
fi

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

# Derniere occurrence d'une cle (Docker Compose applique la derniere), guillemets retires.
envval() {
  local line
  line="$(grep -E "^$1=" "$ENV_FILE" | tail -1 || true)"
  line="${line#*=}"; line="${line%$'\r'}"
  case "$line" in
    \"*\") line="${line#\"}"; line="${line%\"}" ;;
    \'*\') line="${line#\'}"; line="${line%\'}" ;;
  esac
  printf '%s' "$line"
}

# Remplace (ou ajoute) CLE=VALEUR ligne a ligne dans $TMP a partir de $ENV_FILE :
# les valeurs ne traversent jamais une expression reguliere ni un argument de
# commande externe, donc aucun caractere ne peut casser la substitution.
rewrite_env() { # $1 = fichier source, $2 = fichier cible ; variables NEW_<CLE>
  local src="$1" dst="$2" line key seen=" "
  : > "$dst"
  while IFS= read -r line || [[ -n "$line" ]]; do
    key="${line%%=*}"
    case "$key" in
      EMAIL_SERVICE_TYPE|EMAIL_SMTP_HOST|EMAIL_SMTP_PORT|EMAIL_SMTP_USER|EMAIL_SMTP_PASS|EMAIL_FROM)
        local var="NEW_${key}"
        printf '%s=%s\n' "$key" "${!var}" >> "$dst"; seen="$seen$key " ;;
      *)
        printf '%s\n' "$line" >> "$dst" ;;
    esac
  done < "$src"
  for key in EMAIL_SERVICE_TYPE EMAIL_SMTP_HOST EMAIL_SMTP_PORT EMAIL_SMTP_USER EMAIL_SMTP_PASS EMAIL_FROM; do
    case "$seen" in *" $key "*) ;; *) local var="NEW_${key}"; printf '%s=%s\n' "$key" "${!var}" >> "$dst" ;; esac
  done
}

[[ -f "$ENV_FILE" ]] || { echo "$ENV_FILE introuvable." >&2; exit 1; }
[[ -t 0 ]] || { echo "Ce script a besoin d un terminal : ajoute -t a ta commande ssh." >&2; exit 1; }

echo
echo "Environnement $ENV_NAME (pile $STACK_NAME), fichier $ENV_FILE."
if [[ "$ENV_NAME" == "staging" ]]; then
  echo
  echo "ATTENTION : le staging ne doit JAMAIS utiliser la boite e-mail de la production"
  echo "(il enverrait de vrais messages a de vraies personnes). Utiliser un bac a sable."
  read -r -p "Continuer avec un compte de bac a sable ? [o/N] " ok
  [[ "$ok" == "o" || "$ok" == "O" ]] || { echo "Abandon, rien n a ete modifie."; exit 1; }
fi
echo
echo "Entree = garder la valeur proposee entre crochets."

ask() { # $1 = libelle, $2 = valeur par defaut ; ecrit la reponse dans $REPLY
  local def="$2" answer
  if [[ -n "$def" ]]; then read -r -p "$1 [$def] : " answer; else read -r -p "$1 : " answer; fi
  answer="$(printf '%s' "${answer:-$def}" | tr -d '[:space:]')"
  REPLY="$answer"
}

ask "Serveur SMTP" "$(envval EMAIL_SMTP_HOST | grep . || echo smtp.hostinger.com)"; HOST="$REPLY"
ask "Port (465 = TLS)" "$(envval EMAIL_SMTP_PORT | grep . || echo 465)"; PORT="$REPLY"
ask "Utilisateur (adresse e-mail complete)" "$(envval EMAIL_SMTP_USER)"; USER_="$REPLY"
ask "Adresse expeditrice (From)" "$(envval EMAIL_FROM | grep . || printf '%s' "$USER_")"; FROM="$REPLY"

[[ -n "$HOST" && -n "$USER_" && -n "$FROM" ]] || { echo "Valeur vide : rien n a ete modifie." >&2; exit 1; }
[[ "$PORT" =~ ^[0-9]{1,5}$ ]] || { echo "Port invalide : rien n a ete modifie." >&2; exit 1; }
[[ "$USER_" == *@*.* && "$FROM" == *@*.* ]] || { echo "Adresse e-mail invalide : rien n a ete modifie." >&2; exit 1; }

# -s : la frappe reste invisible, le mot de passe ne s'affiche pas a l'ecran.
read -r -s -p "Mot de passe SMTP (sans echo) : " PASS; echo
read -r -s -p "Confirmer le mot de passe     : " PASS2; echo
[[ -n "$PASS" ]] || { echo "Mot de passe vide : rien n a ete modifie." >&2; exit 1; }
[[ "$PASS" == "$PASS2" ]] || { echo "Les deux saisies different : rien n a ete modifie." >&2; exit 1; }
unset PASS2
# Une apostrophe ne peut pas etre protegee dans une valeur entre apostrophes, et un
# retour a la ligne casserait le fichier.
case "$PASS" in
  *\'*|*$'\n'*|*$'\r'*) echo "Le mot de passe contient une apostrophe ou un retour a la ligne : change-le dans la boite e-mail, puis relance. Rien n a ete modifie." >&2; exit 1 ;;
esac

BACKUP="${ENV_FILE}.bak-$(date +%F-%H%M%S)"
cp -p "$ENV_FILE" "$BACKUP"
chmod 600 "$BACKUP"

umask 077
# Fichier temporaire dans le MEME repertoire que le fichier de secrets : le mv final
# est atomique et le secret n'est jamais ecrit dans /tmp. mktemp le cree en mode 600.
TMP="$(mktemp "${ENV_FILE}.XXXXXX")"
chmod 600 "$TMP"
trap 'rm -f "$TMP"; unset PASS' EXIT

NEW_EMAIL_SERVICE_TYPE="smtp"
NEW_EMAIL_SMTP_HOST="$HOST"
NEW_EMAIL_SMTP_PORT="$PORT"
NEW_EMAIL_SMTP_USER="$USER_"
NEW_EMAIL_FROM="$FROM"
# Entre apostrophes : Docker Compose interpole `$` dans un fichier d'environnement
# (un mot de passe « ab$cd » deviendrait « ab »), et traite `#` et les espaces.
NEW_EMAIL_SMTP_PASS="'${PASS}'"
rewrite_env "$ENV_FILE" "$TMP"

mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE"
unset PASS NEW_EMAIL_SMTP_PASS

echo
echo "$ENV_FILE mis a jour (sauvegarde : $BACKUP)."
echo "  EMAIL_SERVICE_TYPE : smtp"
echo "  EMAIL_SMTP_HOST    : $HOST   EMAIL_SMTP_PORT : $PORT"
echo "  EMAIL_SMTP_USER    : $USER_"
echo "  EMAIL_FROM         : $FROM"
echo "  EMAIL_SMTP_PASS    : renseigne (non affiche)"
echo
echo "Applique maintenant la configuration :"
echo "  cd /home/deployer/immotopia-saas && ./infra/scripts/deploy.sh $ENV_NAME --no-build"
echo
echo "Puis verifie l'authentification SMTP, sans envoyer de message :"
echo "  docker exec ${STACK_NAME}-api node -e \"require('nodemailer').createTransport({host:process.env.EMAIL_SMTP_HOST,port:+process.env.EMAIL_SMTP_PORT,secure:+process.env.EMAIL_SMTP_PORT===465,auth:{user:process.env.EMAIL_SMTP_USER,pass:process.env.EMAIL_SMTP_PASS}}).verify().then(()=>console.log('SMTP OK'),e=>{console.log('SMTP ECHEC',e.code||'',e.responseCode||'');process.exit(1)})\""
