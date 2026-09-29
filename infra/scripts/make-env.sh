#!/usr/bin/env bash
#
# Genere le fichier d'environnement (secrets neufs) d'une pile ImmoTopia.
#
# A lancer UNE FOIS par environnement, sur le serveur, par le proprietaire du
# compte deployer :
#     ./infra/scripts/make-env.sh staging   # -> /home/deployer/immotopia-saas.env
#     ./infra/scripts/make-env.sh prod      # -> /home/deployer/immotopia-prod.env
#     ./infra/scripts/make-env.sh prod /autre/chemin.env
#
# L'environnement est obligatoire (jamais de valeur par defaut). Le nom de la
# pile, l'origine publique et le chemin par defaut viennent de
# infra/environments/<env>.conf.
#
# Le script REFUSE d'ecraser un fichier existant : relance-le apres l'avoir
# deplace si tu veux vraiment repartir de zero. Attention, changer
# POSTGRES_PASSWORD apres le premier demarrage de Postgres ne change PAS le mot
# de passe de la base (il n'est lu qu'a l'initialisation du volume) : il faut
# alors un ALTER USER, sinon l'API ne se connectera plus.
#
# Aucun secret n'est affiche. Le fichier est cree en mode 600.

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

if [[ -e "$ENV_FILE" ]]; then
  echo "$ENV_FILE existe deja. Rien n'a ete ecrit." >&2
  echo "Deplace-le d'abord si tu veux regenerer les secrets." >&2
  exit 1
fi

command -v openssl >/dev/null || { echo "openssl est requis." >&2; exit 1; }

# Alphanumerique uniquement : un caractere reserve devrait etre encode dans
# DATABASE_URL, source classique d'erreurs d'authentification silencieuses.
PG_PASSWORD="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 40)"
# JWT_SECRET : base64 complet accepte, il ne transite dans aucune URL.
# packages/api/src/config/env.ts exige au moins 32 caracteres.
JWT_SECRET="$(openssl rand -base64 48)"
# Cle AES-256 (32 octets en base64) qui chiffre les cles API de paiement
# enregistrees par les agences (lib/payment-gateway/crypto.ts).
PAYMENT_SECRETS_KEY="$(openssl rand -base64 32)"

PG_USER=immotopia
PG_DB=immotopia

if [[ "$ENV_NAME" == "staging" ]]; then
  ENV_LABEL="STAGING"
  read -r -d '' ENV_SPECIFIC <<'BLOC' || true
# --- Paiement : SIMULATEUR (staging) ------------------------------------------
# Le simulateur permet de tester le paiement en ligne sans argent reel.
PAYMENT_GATEWAY_SIMULATOR=1
PLATFORM_PAYSECUREHUB_MODE=SIMULATOR
# PLATFORM_PAYSECUREHUB_API_KEY et PLATFORM_PAYSECUREHUB_MERCHANT_ID : inutiles
# en mode SIMULATOR.

# --- Integrations (staging) ---------------------------------------------------
# E-mail, SMS, WhatsApp, IA : a laisser VIDES, ou a brancher sur un compte
# BAC A SABLE. Ne JAMAIS y recopier les identifiants de la production : un test
# ici enverrait de vrais messages a de vrais clients.
BLOC
else
  ENV_LABEL="PRODUCTION"
  read -r -d '' ENV_SPECIFIC <<'BLOC' || true
# --- Paiement : REEL (production) ---------------------------------------------
# PAYMENT_GATEWAY_SIMULATOR n'est volontairement PAS defini : deploy.sh refuse
# de deployer la production s'il vaut 1.
# Le mode PLATFORM_PAYSECUREHUB_MODE=LIVE exige la cle et l'identifiant marchand
# ci-dessous ; tant qu'ils manquent, le paiement des abonnements reste simule.
PLATFORM_PAYSECUREHUB_MODE=SIMULATOR
PLATFORM_PAYSECUREHUB_API_KEY=
PLATFORM_PAYSECUREHUB_MERCHANT_ID=

# --- Integrations (production) ------------------------------------------------
# Ce sont les integrations REELLES : les messages partent a de vrais clients.
# Utiliser des identifiants DEDIES a la production (jamais ceux du staging),
# et les brancher un par un en verifiant chaque envoi.
BLOC
fi

umask 077
cat > "$ENV_FILE" <<EOF
# Secrets ${ENV_LABEL} ImmoTopia (pile ${STACK_NAME}) — genere le $(date -Iseconds) par make-env.sh
# NE PAS VERSIONNER. NE PAS COPIER DANS UNE IMAGE.
# Modele documente : infra/.env.example

POSTGRES_USER=${PG_USER}
POSTGRES_PASSWORD=${PG_PASSWORD}
POSTGRES_DB=${PG_DB}
DATABASE_URL=postgresql://${PG_USER}:${PG_PASSWORD}@${STACK_NAME}-postgres:5432/${PG_DB}?schema=public

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=15m

# Chiffre les cles API de paiement des agences. A SAUVEGARDER HORS SERVEUR : la
# perdre rend ces cles illisibles (les agences devraient les ressaisir).
PAYMENT_SECRETS_KEY=${PAYMENT_SECRETS_KEY}

NODE_ENV=production
PORT=8001

FRONTEND_URL=${PUBLIC_ORIGIN}
CLIENT_URL=${PUBLIC_ORIGIN}
BACKEND_URL=${PUBLIC_ORIGIN}
PUBLIC_ORIGIN=${PUBLIC_ORIGIN}

UPLOADS_DIR=/data/uploads

# Garde-fous. warn : journalise sans bloquer ; passer a enforce apres validation
# (voir packages/api/env.example).
TENANT_GUARD_MODE=warn
SUBSCRIPTION_ENFORCEMENT=warn

# Assistant IA (ImmoCopilot) coupe par defaut.
AI_PROVIDER=disabled

${ENV_SPECIFIC}

# Emetteur des factures d'abonnement : mentions legales imprimees sur chaque
# facture. RCCM, numero fiscal, adresse et telephone sont a renseigner.
PLATFORM_ISSUER_NAME=Alliance Consultants
PLATFORM_ISSUER_EMAIL=support@immotopia.cloud
PLATFORM_ISSUER_RCCM=
PLATFORM_ISSUER_TAX_ID=
PLATFORM_ISSUER_ADDRESS=
PLATFORM_ISSUER_PHONE=

# --- Integrations optionnelles ---------------------------------------------
# Vides au premier deploiement. Tant que le bloc e-mail est vide, AUCUN e-mail
# ne part : invitations et reinitialisations de mot de passe ne seront pas
# recues. C'est la premiere chose a brancher apres la mise en ligne.
#
# CLIENT_URL et GOOGLE_CALLBACK_URL sont validees comme URL par zod :
# une chaine vide empeche l'API de demarrer. Soit une URL valide, soit la ligne
# reste commentee.
EMAIL_SERVICE_TYPE=
EMAIL_SERVICE_API_KEY=
EMAIL_FROM=
EMAIL_SMTP_HOST=
EMAIL_SMTP_PORT=
EMAIL_SMTP_USER=
EMAIL_SMTP_PASS=

WHATSAPP_PROVIDER=
WASENDER_API_BASE_URL=
WASENDER_API_KEY=
WASENDER_SESSION_NAME=
WHATSAPP_DEFAULT_COUNTRY_CODE=
WHATSAPP_GROUP_INVITE_LINK=
WHATSAPP_GROUP_BROADCAST_TO=
WHATSAPP_GROUP_PROPERTY_URL_TEMPLATE=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# GOOGLE_CALLBACK_URL=${PUBLIC_ORIGIN}/api/auth/google/callback
EOF

chmod 600 "$ENV_FILE"

echo "$ENV_FILE cree (environnement $ENV_NAME, pile $STACK_NAME)."
ls -l "$ENV_FILE"
echo
echo "Longueur de JWT_SECRET : ${#JWT_SECRET} caracteres (minimum requis : 32)."
echo
echo "IMPORTANT : sauvegarde ce fichier HORS DU SERVEUR (gestionnaire de mots de"
echo "passe). PAYMENT_SECRETS_KEY chiffre les cles API de paiement des agences :"
echo "la perdre les rend illisibles."
echo "Aucun secret n'a ete affiche."
if [[ "$ENV_NAME" == "prod" ]]; then
  echo
  echo "A renseigner avant d'ouvrir au public : PLATFORM_ISSUER_RCCM / _TAX_ID /"
  echo "_ADDRESS / _PHONE, le bloc e-mail, puis PLATFORM_PAYSECUREHUB_* en LIVE."
fi
