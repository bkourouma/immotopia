# Configuration WaSender (WASENDER_API_BASE_URL)

Ce document décrit la configuration **réellement utilisée dans ImmoTopia** pour l'implémentation WhatsApp via WaSender, afin de la répliquer dans une autre solution.

## 1) Variables d'environnement utilisées

### Obligatoires (mode WaSender)

```env
WHATSAPP_PROVIDER=wasender
WASENDER_API_BASE_URL=https://wasenderapi.com/api
WASENDER_API_KEY=your-wasender-api-key
```

### Recommandées

```env
WASENDER_SESSION_NAME=Immotopia
WASENDER_TIMEOUT_MS=10000
WHATSAPP_DEFAULT_COUNTRY_CODE=225
```

### Optionnelles avancées (supportées par le code)

```env
# hint de session alternatif (si votre compte WaSender l'utilise)
WASENDER_SESSION=

# bypass du check GET /status avant envoi
# valeurs true acceptées: 1, true, yes, on
WASENDER_SKIP_STATUS_CHECK=0
```

### Variables liées aux features groupe WhatsApp

```env
# destination groupe (JID, ex: 1203...@g.us)
WHATSAPP_GROUP_BROADCAST_TO=

# lien d'invitation groupe
WHATSAPP_GROUP_INVITE_LINK=https://chat.whatsapp.com/FigaM5mUQaqDHRk6YAaS0l?mode=gi_t

# toggles d'automatisation
WHATSAPP_GROUP_AUTO_INVITE_ON_CONTACT_CREATE=1
WHATSAPP_GROUP_NOTIFY_ON_PROPERTY_PUBLISH=1
WHATSAPP_GROUP_INVITE_APPEND_LINK_MESSAGE=1
WHATSAPP_GROUP_PROPERTY_APPEND_LINK_MESSAGE=1

# template URL publique (optionnel)
WHATSAPP_GROUP_PROPERTY_URL_TEMPLATE=

# newsletters via WhatsApp
NEWSLETTER_WHATSAPP_ENABLED=1
```

## 2) Logique de sélection du provider

- Si `WHATSAPP_PROVIDER=wasender` alors WaSender est utilisé.
- Si `WHATSAPP_PROVIDER` est vide:
  - WaSender est choisi si `WASENDER_API_KEY` est présent.
  - Sinon fallback Twilio.
- `WASENDER_API_BASE_URL` a un défaut interne: `https://wasenderapi.com/api`.

## 3) Appels HTTP WaSender effectués

Headers utilisés:

```http
Authorization: Bearer <WASENDER_API_KEY>
Accept: application/json
```

### Pré-check session (avant envoi)

```http
GET {WASENDER_API_BASE_URL}/status
```

- Attendu: `status = connected`
- Sinon erreur: session non connectée (reconnexion QR demandée).

### Pré-check groupe (si destinataire se termine par `@g.us`)

```http
GET {WASENDER_API_BASE_URL}/groups/{groupJid}/participants
GET {WASENDER_API_BASE_URL}/groups/{groupJid}/metadata
GET {WASENDER_API_BASE_URL}/user
```

- Vérifie la synchro des participants.
- Si groupe en mode admin-only (`announce=true`), vérifie que le compte session est admin.

### Envoi message texte

```http
POST {WASENDER_API_BASE_URL}/send-message
Content-Type: application/json

{
  "to": "+2250700000001",
  "text": "Bonjour depuis ImmoTopia",
  "session": "...optionnel...",
  "sessionName": "Immotopia"
}
```

### Envoi image

1. Upload binaire:

```http
POST {WASENDER_API_BASE_URL}/upload
Content-Type: image/jpeg|image/png
(body binaire)
```

2. Puis envoi message image:

```http
POST {WASENDER_API_BASE_URL}/send-message
Content-Type: application/json

{
  "to": "120363424460487328@g.us",
  "text": "Caption optionnelle",
  "imageUrl": "https://...",
  "session": "...optionnel...",
  "sessionName": "Immotopia"
}
```

## 4) Normalisation des numéros (important pour intégration)

Le code normalise en E.164:
- `+...` => conservé
- `00...` => converti en `+...`
- numéro local commençant par `0` => préfixé avec `WHATSAPP_DEFAULT_COUNTRY_CODE`
- numéro numérique sans `+` => préfixé avec `WHATSAPP_DEFAULT_COUNTRY_CODE`

Exemple avec `WHATSAPP_DEFAULT_COUNTRY_CODE=225`:
- `0700000001` => `+225700000001`

## 5) Endpoints backend ImmoTopia liés à cette config

- `POST /api/tenants/:tenantId/whatsapp-notifications/test-send`
- `POST /api/tenants/:tenantId/whatsapp-notifications/group-broadcast/send`
- `POST /api/tenants/:tenantId/whatsapp-notifications/group-invite/send-all`
- `POST /api/whatsapp/webhook`

## 6) Exemple minimal prêt à réutiliser dans une autre solution

```env
WHATSAPP_PROVIDER=wasender
WASENDER_API_BASE_URL=https://wasenderapi.com/api
WASENDER_API_KEY=your-real-api-key
WASENDER_SESSION_NAME=Immotopia
WASENDER_TIMEOUT_MS=10000
WHATSAPP_DEFAULT_COUNTRY_CODE=225
```

## 7) Fichiers source de référence (implémentation)

- `packages/api/src/services/providers/whatsapp.provider.ts`
- `packages/api/src/services/whatsapp-notification-send-service.ts`
- `packages/api/src/services/whatsapp-group-broadcast-service.ts`
- `packages/api/src/services/whatsapp-group-automation-service.ts`
- `packages/api/src/controllers/whatsapp-notification-config-controller.ts`
- `packages/api/src/routes/whatsapp.webhook.route.ts`
- `packages/api/env.example`

## 8) Point de vigilance sécurité

Ne jamais versionner `WASENDER_API_KEY` réel dans git. Utiliser des variables d'environnement (CI/CD, secret manager, `.env` local non commité).
