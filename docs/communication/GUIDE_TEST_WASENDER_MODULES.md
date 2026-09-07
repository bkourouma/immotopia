# Guide de Test WaSender - Modules a Verifier

Date: 2026-03-15

Ce document liste les zones de l'application ou WhatsApp est implemente et ce que tu dois tester.

## 1. Prerequis

- API redemarree apres mise a jour `.env`.
- Variables presentes:
  - `WHATSAPP_PROVIDER=wasender`
  - `WASENDER_API_KEY=...`
  - `WASENDER_API_BASE_URL=https://wasenderapi.com/api`
  - `WASENDER_SESSION_NAME=Immotopia` (optionnel)
  - `WHATSAPP_DEFAULT_COUNTRY_CODE=225`
  - `WHATSAPP_GROUP_AUTO_INVITE_ON_CONTACT_CREATE=1`
  - `WHATSAPP_GROUP_NOTIFY_ON_PROPERTY_PUBLISH=1`
  - `WHATSAPP_GROUP_INVITE_LINK=https://chat.whatsapp.com/FigaM5mUQaqDHRk6YAaS0l?mode=gi_t`
  - `WHATSAPP_GROUP_BROADCAST_TO=...` (ID destination groupe WaSender)
  - `WHATSAPP_GROUP_PROPERTY_URL_TEMPLATE=https://.../properties/{{propertyId}}` (optionnel)
  - `NEWSLETTER_WHATSAPP_ENABLED=1`
- Contacts de test avec:
  - consentement WhatsApp actif (`consentWhatsapp=true`)
  - numero WhatsApp (`whatsappNumber` ou `phonePrimary`)

## 2. Smoke Test Recommande (ordre rapide)

1. `Communication > Message Groupe WhatsApp` (envoi manuel direct au groupe).
2. `Newsletter > Campagnes` (envoi campagne: email + relais WhatsApp).
3. `Maintenance` (creation ticket puis changement de statut).
4. `Location` (approbation/rejet declaration + allocation paiement + mouvement depot).
5. `Syndic` (appel de charges, rappel, convocation AG).

## 3. Modules et Scenarios a Tester

## 3.1 Module Communication WhatsApp (config + test manuel)

- UI:
  - `/tenant/:tenantId/communication/whatsapp-notifications`
  - `/tenant/:tenantId/communication/whatsapp-group-message`
- API:
  - `GET /api/tenants/:tenantId/whatsapp-notifications`
  - `PATCH /api/tenants/:tenantId/whatsapp-notifications/:key`
  - `POST /api/tenants/:tenantId/whatsapp-notifications/test-send`
  - `POST /api/tenants/:tenantId/whatsapp-notifications/group-broadcast/send` (message + image optionnelle)
- Fichiers implementes:
  - `packages/api/src/services/providers/whatsapp.provider.ts`
  - `packages/api/src/services/whatsapp-notification-send-service.ts`
  - `packages/api/src/services/whatsapp-group-broadcast-service.ts`
  - `packages/api/src/controllers/whatsapp-notification-config-controller.ts`
  - `apps/web/src/pages/communication/WhatsAppGroupMessagePage.tsx`
  - `apps/web/src/services/whatsapp-notification-config-service.ts`

Test attendu:

- Message WhatsApp recu dans le groupe cible.
- Si image jointe: message recu avec media.
- Reponse API de test avec `success=true`.
- Contraintes image: JPEG/PNG, max 5MB.

## 3.2 Module Newsletter (nouvelle integration WhatsApp)

- UI:
  - `/tenant/:tenantId/newsletter/lists`
  - `/tenant/:tenantId/newsletter/campaigns`
  - `/tenant/:tenantId/newsletter/templates`
- API:
  - `POST /api/tenants/:tenantId/newsletter/campaigns/:campaignId/send`
- Fichiers implementes:
  - `packages/api/src/services/newsletter-campaign.service.ts`
  - `packages/api/src/routes/newsletter-routes.ts`
  - `packages/api/src/controllers/newsletter-controller.ts`
  - `apps/web/src/components/newsletter/CampaignForm.tsx`

Test attendu:

- Campagne envoyee par email comme avant.
- Relais WhatsApp envoye aux destinataires avec consentement + numero.
- Si WhatsApp echoue mais email passe, la campagne continue.
- Si aucun canal ne passe pour un destinataire, il est en `FAILED`.

Important:

- Pour liste `MANUAL`, le relais WhatsApp depend du matching email -> contact CRM.

## 3.3 Module Maintenance

- Evenements WhatsApp testes par flux metier:
  - `MAINTENANCE_TICKET_CREATED_AGENCY`
  - `MAINTENANCE_TICKET_CREATED_TENANT`
  - `MAINTENANCE_TICKET_STATUS_CHANGED_TENANT`
- Fichier principal:
  - `packages/api/src/services/maintenance-notification-service.ts`

Test attendu:

- Creation ticket: notification agence + locataire (si config active).
- Changement statut ticket: notification locataire.

## 3.4 Module Location (Rental)

- Evenements WhatsApp:
  - `PAYMENT_ALLOCATED_TENANT`
  - `PAYMENT_APPROVED_TENANT`
  - `PAYMENT_REJECTED_TENANT`
  - `DEPOSIT_MOVEMENT_TENANT`
- Fichiers:
  - `packages/api/src/services/rental-payment-service.ts`
  - `packages/api/src/services/rental-payment-declaration-service.ts`
  - `packages/api/src/services/rental-deposit-service.ts`

Test attendu:

- Apres chaque action metier, message WhatsApp recu par le locataire cible.

## 3.5 Module Syndic

- Evenements WhatsApp:
  - `CHARGE_CALL_ISSUED`
  - `CHARGE_CALL_REMINDER`
  - `GENERAL_MEETING_CONVOCATION`
- Fichier:
  - `packages/api/src/lib/syndics/notifications.ts`

Test attendu:

- Emission appel de charges: coproprietaire notifie.
- Rappel appel de charges: coproprietaire notifie.
- Convocation AG: coproprietaires notifies.

## 3.6 Comptes / Invitations Portail

- Evenement WhatsApp:
  - `PORTAL_ACCOUNT_CREATED`
- Fichiers:
  - `packages/api/src/services/tenant-service.ts`
  - `packages/api/src/services/invitation-service.ts`

Test attendu:

- Creation/invitation de compte portail declenche un message WhatsApp.

## 3.7 Webhook WhatsApp (entrant)

- Endpoint:
  - `POST /api/whatsapp/webhook`
- Fichier:
  - `packages/api/src/routes/whatsapp.webhook.route.ts`

Test attendu:

- Payload Twilio: reponse XML TwiML.
- Payload JSON (WaSender): reponse JSON `success=true`.

## 3.8 CRM + Propriete (nouvelle automatisation groupe)

- Nouveaux evenements WhatsApp:
  - `CRM_CONTACT_GROUP_INVITE`
  - `PROPERTY_PUBLISHED_GROUP_BROADCAST`
- API:
  - `POST /api/tenants/:tenantId/whatsapp-notifications/group-invite/send-all`
- Fichiers:
  - `packages/api/src/services/whatsapp-group-automation-service.ts`
  - `packages/api/src/services/crm-contact-service.ts`
  - `packages/api/src/services/property-publication-service.ts`

Test attendu:

- Creation d'un contact CRM (consentement + numero) => invitation groupe envoyee automatiquement.
- Publication d'un bien => message poste sur la destination groupe (`WHATSAPP_GROUP_BROADCAST_TO`).
- Envoi manuel en masse via endpoint `group-invite/send-all` pour inviter les anciens contacts CRM.
- Anti-doublon actif: un contact deja invite avec le meme lien est ignore automatiquement.
- Pour re-inviter explicitement, envoyer `{ "force": true }` dans le body de `group-invite/send-all`.

## 4. Ou la Config WhatsApp est Definie

- Clés d'evenement:
  - `packages/api/src/constants/whatsapp-notification-keys.ts`
- Templates par defaut:
  - `packages/api/src/constants/whatsapp-notification-default-templates.ts`

## 5. Verification Logs (recommande)

Verifier dans les logs API:

- `WhatsApp notification sent`
- `WhatsApp template notification sent` (si templates utilises)
- `WhatsApp test message sent`
- `Newsletter campaign sent`
- `WhatsApp webhook received`

Si besoin, utiliser ce grep:

```bash
rg "WhatsApp|Newsletter campaign sent" packages/api
```
