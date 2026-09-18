#!/usr/bin/env bash
#
# Genere /home/deployer/immotopia-saas.env avec des secrets neufs.
#
# A lancer UNE FOIS, sur le serveur, par le proprietaire du compte deployer :
#     ./infra/scripts/make-env.sh
#
# Le script REFUSE d'ecraser un fichier existant : relance-le apres l'avoir
# deplace si tu veux vraiment repartir de zero. Attention, changer
# POSTGRES_PASSWORD apres le premier demarrage de Postgres ne change PAS le mot
# de passe de la base (il n'est lu qu'a l'initialisation du volume) : il faut
# alors un ALTER USER, sinon l'API ne se connectera plus.
#
# Aucun secret n'est affiche. Le fichier est cree en mode 600.

set -Eeuo pipefail

ENV_FILE="${1:-/home/deployer/immotopia-saas.env}"
PUBLIC_ORIGIN="https://app.immotopia.cloud"

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

PG_USER=immotopia
PG_DB=immotopia

umask 077
cat > "$ENV_FILE" <<EOF
# Secrets de production ImmoTopia — genere le $(date -Iseconds) par make-env.sh
# NE PAS VERSIONNER. NE PAS COPIER DANS UNE IMAGE.
# Modele documente : infra/.env.example

POSTGRES_USER=${PG_USER}
POSTGRES_PASSWORD=${PG_PASSWORD}
POSTGRES_DB=${PG_DB}
DATABASE_URL=postgresql://${PG_USER}:${PG_PASSWORD}@immotopia-saas-postgres:5432/${PG_DB}?schema=public

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=15m

NODE_ENV=production
PORT=8001

FRONTEND_URL=${PUBLIC_ORIGIN}
CLIENT_URL=${PUBLIC_ORIGIN}
BACKEND_URL=${PUBLIC_ORIGIN}
PUBLIC_ORIGIN=${PUBLIC_ORIGIN}

UPLOADS_DIR=/data/uploads

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

echo "$ENV_FILE cree."
ls -l "$ENV_FILE"
echo
echo "Longueur de JWT_SECRET : ${#JWT_SECRET} caracteres (minimum requis : 32)."
echo "Aucun secret n'a ete affiche. Sauvegarde ce fichier hors du serveur."
