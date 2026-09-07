# Référence des templates WhatsApp Business (ImmoTopia)

Ce fichier liste, pour chaque type de notification WhatsApp, le **texte par défaut** utilisé par ImmoTopia et les **noms de variables** disponibles. Vous pouvez vous en servir pour créer vos templates dans Twilio (Content Editor) et pour remplir le **mapping des variables** (Content Variables JSON) dans Communication → Notifications WhatsApp.

Format du mapping dans ImmoTopia : `{"1": "nomVariable1", "2": "nomVariable2", ...}` où `1`, `2`, … sont les placeholders de votre template Twilio ({{1}}, {{2}}, …) et `nomVariable1`, `nomVariable2` sont les clés listées ci‑dessous.

---

## MAINTENANCE_TICKET_CREATED_AGENCY

**Destinataire :** Agence (admins).

**Texte par défaut :**  
`Nouveau ticket de maintenance : {{ticketTitle}}. Locataire : {{renterName}}. Propriété : {{propertyReference}}. Créé le {{ticketCreatedAt}}. {{agencyName}}.`

**Variables disponibles :**  
`agencyUserName`, `renterName`, `ticketTitle`, `propertyReference`, `ticketCreatedAt`, `agencyName`

**Exemple de mapping (template avec {{1}} à {{6}}) :**  
`{"1": "ticketTitle", "2": "renterName", "3": "propertyReference", "4": "ticketCreatedAt", "5": "agencyName", "6": "agencyUserName"}`

---

## MAINTENANCE_TICKET_CREATED_TENANT

**Destinataire :** Locataire.

**Texte par défaut :**  
`Bonjour {{tenantName}}, votre demande de maintenance "{{ticketTitle}}" a bien été enregistrée par {{agencyName}}. Propriété : {{propertyReference}}. Suivez votre ticket dans le portail locataire.`

**Variables disponibles :**  
`tenantName`, `ticketTitle`, `agencyName`, `propertyReference`, `ticketCreatedAt`

**Exemple de mapping :**  
`{"1": "tenantName", "2": "ticketTitle", "3": "agencyName", "4": "propertyReference"}`

---

## MAINTENANCE_TICKET_STATUS_CHANGED_TENANT

**Destinataire :** Locataire.

**Texte par défaut :**  
`Bonjour {{tenantName}}, le statut de votre ticket "{{ticketTitle}}" a été mis à jour : {{newStatusLabel}}. {{agencyName}}.`

**Variables disponibles :**  
`tenantName`, `ticketTitle`, `newStatusLabel`, `agencyName`, `ticketCreatedAt`

**Exemple de mapping :**  
`{"1": "tenantName", "2": "ticketTitle", "3": "newStatusLabel", "4": "agencyName"}`

---

## PAYMENT_APPROVED_TENANT

**Destinataire :** Locataire.

**Texte par défaut :**  
`Bonjour {{tenantName}}, votre déclaration de paiement a été approuvée par {{agencyName}}. Merci.`

**Variables disponibles :**  
`tenantName`, `agencyName`

**Exemple de mapping :**  
`{"1": "tenantName", "2": "agencyName"}`

---

## PAYMENT_REJECTED_TENANT

**Destinataire :** Locataire.

**Texte par défaut :**  
`Bonjour {{tenantName}}, votre déclaration de paiement a été rejetée par {{agencyName}}. Contactez l'agence pour plus d'informations.`

**Variables disponibles :**  
`tenantName`, `agencyName`

**Exemple de mapping :**  
`{"1": "tenantName", "2": "agencyName"}`

---

## PAYMENT_ALLOCATED_TENANT

**Destinataire :** Locataire.

**Texte par défaut :**  
`Bonjour {{tenantName}}, votre paiement a été alloué aux échéances ({{amountAllocated}}). Bail {{leaseLabel}}. {{agencyName}}.`

**Variables disponibles :**  
`tenantName`, `amountAllocated`, `leaseLabel`, `agencyName`

**Exemple de mapping :**  
`{"1": "tenantName", "2": "amountAllocated", "3": "leaseLabel", "4": "agencyName"}`

---

## INSTALLMENT_DUE_REMINDER

**Destinataire :** Locataire.

**Texte par défaut :**  
`Bonjour {{tenantName}}, rappel : votre échéance de loyer est prévue le {{dueDate}}. Montant : {{amount}}. {{agencyName}}.`

**Variables disponibles :**  
`tenantName`, `dueDate`, `amount`, `agencyName`

**Exemple de mapping :**  
`{"1": "tenantName", "2": "dueDate", "3": "amount", "4": "agencyName"}`

---

## INSTALLMENT_OVERDUE

**Destinataire :** Locataire.

**Texte par défaut :**  
`Bonjour {{tenantName}}, votre échéance du {{dueDate}} n'a pas été réglée. Merci de régulariser au plus tôt. {{agencyName}}.`

**Variables disponibles :**  
`tenantName`, `dueDate`, `agencyName`

**Exemple de mapping :**  
`{"1": "tenantName", "2": "dueDate", "3": "agencyName"}`

---

## LEASE_ACTIVATED

**Destinataire :** Locataire.

**Texte par défaut :**  
`Bonjour {{tenantName}}, votre bail a été activé. {{agencyName}} vous souhaite une bonne installation.`

**Variables disponibles :**  
`tenantName`, `agencyName`

**Exemple de mapping :**  
`{"1": "tenantName", "2": "agencyName"}`

---

## LEASE_ENDING_SOON

**Destinataire :** Locataire.

**Texte par défaut :**  
`Bonjour {{tenantName}}, votre bail se termine bientôt ({{endDate}}). Pensez à prendre contact avec {{agencyName}} pour la suite.`

**Variables disponibles :**  
`tenantName`, `endDate`, `agencyName`

**Exemple de mapping :**  
`{"1": "tenantName", "2": "endDate", "3": "agencyName"}`

---

## DEPOSIT_MOVEMENT_TENANT

**Destinataire :** Locataire.

**Texte par défaut :**  
`Bonjour {{tenantName}}, un mouvement sur votre dépôt de garantie : {{movementTypeLabel}}, {{amount}} {{currency}}. Bail {{leaseLabel}}. {{agencyName}}.`

**Variables disponibles :**  
`tenantName`, `movementTypeLabel`, `amount`, `currency`, `leaseLabel`, `agencyName`

**Exemple de mapping :**  
`{"1": "tenantName", "2": "movementTypeLabel", "3": "amount", "4": "currency", "5": "leaseLabel", "6": "agencyName"}`

---

## APPOINTMENT_REMINDER

**Destinataire :** Contact.

**Texte par défaut :**  
`Rappel : vous avez un rendez-vous prévu le {{appointmentDate}}. {{agencyName}}.`

**Variables disponibles :**  
`appointmentDate`, `agencyName`

**Exemple de mapping :**  
`{"1": "appointmentDate", "2": "agencyName"}`

---

## DEAL_STAGE_CHANGED

**Destinataire :** Contact CRM.

**Texte par défaut :**  
`Bonjour {{contactName}}, l'étape de votre affaire a été mise à jour : {{stageLabel}}. {{agencyName}}.`

**Variables disponibles :**  
`contactName`, `stageLabel`, `agencyName`

**Exemple de mapping :**  
`{"1": "contactName", "2": "stageLabel", "3": "agencyName"}`
