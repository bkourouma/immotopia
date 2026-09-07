# Checklist test WhatsApp (Twilio) – tout est prêt

Tu as tout donné pour Twilio ; voici la vérification que tout est en place et comment tester.

---

## Ce qui est déjà en place dans le projet

| Élément | Statut |
|--------|--------|
| Provider Twilio (`whatsapp.provider.ts`) | Utilise `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` |
| Envoi template (ContentSid + ContentVariables) | Implémenté (message initié par l'entreprise) |
| Envoi message libre (body) | Implémenté (si pas de Content SID) |
| Config par tenant (activation + template) | API `GET/PATCH /api/tenants/:tenantId/whatsapp-notifications` |
| Page Communication → Notifications WhatsApp | Menu + route + formulaire (message + Template Twilio) |
| Déclenchement maintenance | Ticket créé / statut changé → envoi WhatsApp si contact avec consentement + numéro |
| Migration BDD `whatsapp_notification_configs` | À appliquer si pas déjà fait (`prisma migrate deploy`) |
| Client Prisma à jour | `npx prisma generate` après modification du schéma |

---

## À faire de ton côté (une fois)

### 1. Variables d'environnement

Dans **`packages/api/.env`** :

```env
TWILIO_ACCOUNT_SID=AC2174127f32ee40f7eb5482def5162cec
TWILIO_AUTH_TOKEN=ton_auth_token
TWILIO_WHATSAPP_FROM=+14155238886
```

*(Tu as déjà fourni ces valeurs ; vérifie que le Auth Token est bien celui affiché dans la console Twilio.)*

### 2. Base de données

- Migration appliquée : `cd packages/api && npx prisma migrate deploy`
- Client à jour : `npx prisma generate` (à faire avec l’API arrêtée si EPERM)

### 3. Sandbox Twilio

- Sur le téléphone qui recevra les messages (ex. +22595031843), envoyer **« join &lt;code&gt; »** au numéro du Sandbox dans WhatsApp (code affiché dans la console Twilio → Messaging → WhatsApp → Sandbox).

### 4. Contact CRM pour le test

- Un **contact** avec :
  - **Numéro** : `+22595031843` ou `0022595031843` (format E.164 recommandé).
  - **Consentement WhatsApp** coché.
- Ce contact sera utilisé comme **contact locataire** du ticket.

### 5. Interface Communication

- **Communication** → **Notifications WhatsApp**.
- Pour **« Nouveau ticket de maintenance »** (ou **« Rappel rendez-vous »**) :
  - Activer la notification (switch).
  - Optionnel – **Template Twilio** (pour message initié par l’entreprise) :
    - Content SID : `HXb5b62575e6e4ff6129ad7c8efe1f983e`
    - Mapping : `{"1":"appointmentDate","2":"appointmentTime"}` (pour Rappel rendez-vous).
- Enregistrer.

### 6. Déclencher l’envoi

- **Maintenance** → créer un **nouveau ticket**.
- Associer le **contact** (avec +22595031843 et consentement WhatsApp) comme **contact locataire** du ticket.
- Enregistrer le ticket → l’API envoie l’email (si configuré) et, si la notif WhatsApp est activée, un WhatsApp via Twilio.

---

## Vérifications rapides

- **API démarrée** après modification du `.env` (redémarrage nécessaire).
- **Numéro du contact** : de préférence avec indicatif (`+225...` ou `00225...`), sinon le code suppose par défaut le pays 33 (France).
- **Logs API** : en cas d’échec, regarder les logs (provider non configuré, erreur Twilio, etc.).

---

## Résumé

Avec les infos Twilio que tu as données (Account SID, Auth Token, From +14155238886, template Rappels de rendez-vous), tout est prêt côté code. Il suffit de :

1. Mettre les 3 variables dans `.env` et redémarrer l’API.
2. Avoir un contact CRM avec numéro + consentement WhatsApp.
3. Avoir rejoint le Sandbox avec ce numéro.
4. Activer la notification dans **Communication → Notifications WhatsApp** et créer un ticket avec ce contact.

Si un de ces points manque, le message ne partira pas ; une fois tout coché, le test peut être fait tel quel.
