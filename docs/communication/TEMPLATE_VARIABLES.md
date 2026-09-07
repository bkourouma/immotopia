# Variables des templates de communication

Les templates (email et WhatsApp) acceptent des variables au format `{{nom_variable}}`. Elles sont remplacées au moment du déclenchement par les valeurs du contexte de l’événement.

## Contexte commun

| Variable | Description | Exemple |
|----------|-------------|--------|
| `event` | Type d’événement déclencheur | `PAYMENT_RECEIVED`, `TICKET_CREATED` |
| `tenant_name` | Nom du tenant (agence) | À fournir dans le contexte si disponible |

## Événements locatifs

### PAYMENT_RECEIVED

- `leaseId`, `amount`, `contactName`, etc. (selon contexte fourni par le service de paiement).

### INSTALLMENT_DUE_REMINDER

- `leaseId` : ID du bail
- `installmentId` : ID de l’échéance
- `dueDate` : Date d’échéance (ISO)
- `amount` : Montant dû

### LEASE_ENDING_SOON

- `leaseId` : ID du bail
- `endDate` : Date de fin du bail (ISO)

### LEASE_ACTIVATED

- `leaseId` et autres champs passés par le service de bail.

## Événements maintenance

### TICKET_CREATED / TICKET_STATUS_CHANGED

- `ticketId`, `status`, etc. (selon contexte fourni par le service de maintenance).

## Événements CRM

### DEAL_CREATED / DEAL_STAGE_CHANGED

- `dealId`, `stage`, etc. (selon contexte fourni par le service CRM).

## Événements propriétés

### PROPERTY_PUBLISHED

- Contexte fourni par le service de publication.

## Utilisation dans un template

Exemple corps email :

```text
Bonjour {{contactName}},

Votre paiement de {{amount}} a bien été reçu. Merci.

Cordialement,
{{tenant_name}}
```

Exemple sujet :

```text
Confirmation de paiement – {{amount}}
```

Les variables non présentes dans le contexte sont remplacés par une chaîne vide. Les noms sont insensibles à la casse (`{{ContactName}}` et `{{contactName}}` sont équivalents).
