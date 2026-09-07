# Événements déclencheurs – Notifications email

Ce document indique **à quel moment** chaque événement déclencheur est émis et **où tester** dans l’interface (URL et menu).

**Page de configuration des notifications :**  
`http://localhost:3000/tenant/{tenantId}/communication/email-notifications`

Remplacez `{tenantId}` par l’ID de votre tenant (ex. `e3e428d1-364b-42c9-a102-a22daa9329c5`).

---

## Maintenance

### Nouveau ticket de maintenance (Agence, Locataire, Propriétaire)

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `MAINTENANCE_TICKET_CREATED_AGENCY` | Agence (admins) | Lorsqu’un **locataire** crée un ticket de maintenance | **Portail locataire** : créer un ticket |
| `MAINTENANCE_TICKET_CREATED_TENANT` | Locataire | Accusé de réception après création du ticket par le locataire | Même action : le locataire reçoit l’email |
| `MAINTENANCE_TICKET_CREATED_OWNER` | Propriétaire | Lorsqu’un ticket est créé sur un bien du propriétaire | Même action : le propriétaire du bien reçoit l’email |

**URL pour tester :**
- **Création du ticket (locataire) :**  
  `http://localhost:3000/tenant/maintenance`  
  → Se connecter au **portail locataire**, aller dans **Maintenance**, puis **Créer un ticket** (bail actif + propriété requis).

---

### Changement de statut du ticket (locataire)

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `MAINTENANCE_TICKET_STATUS_CHANGED_TENANT` | Locataire | Lorsque l’**agence** change le statut d’un ticket (ex. Déclaré → En cours, En cours → Résolu) | **Back-office agence** : modifier le statut d’un ticket |

**URL pour tester :**
- **Changer le statut d’un ticket :**  
  `http://localhost:3000/tenant/{tenantId}/admin/maintenance/tickets`  
  → Menu : **Maintenance** (côté admin) → **Tickets** → ouvrir un ticket → **Modifier le statut** (Déclaré → En cours, ou En cours → Résolu, etc.).  
- Détail d’un ticket :  
  `http://localhost:3000/tenant/{tenantId}/admin/maintenance/tickets/{ticketId}`

Le **locataire** associé au ticket reçoit l’email de mise à jour du statut (si la notification est activée dans Communication > Notifications email).

---

### Changement de statut du ticket (propriétaire)

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `MAINTENANCE_TICKET_STATUS_CHANGED_OWNER` | Propriétaire | Même moment que ci‑dessus : changement de statut par l’agence | Même écran que **Changement de statut (locataire)** |

**URL pour tester :** identique à `MAINTENANCE_TICKET_STATUS_CHANGED_TENANT` (voir ci‑dessus). Le **propriétaire** du bien concerné reçoit aussi l’email.

---

## Paiements

### Déclaration de paiement

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `PAYMENT_DECLARATION_AGENCY` | Agence (+ propriétaire) | Lorsqu’un **locataire** déclare un paiement (portail locataire) | **Portail locataire** : Paiements → Déclarer un paiement |

**URL pour tester :**  
`http://localhost:3000/tenant/maintenance` (même portail) → **Paiements** → **Déclarer un paiement** (avec justificatif).

---

### Paiement approuvé (locataire / propriétaire)

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `PAYMENT_APPROVED_TENANT` | Locataire | Lorsque l’agence **approuve** une déclaration de paiement | **Back-office** : Baux / Paiements → Déclarations → Approuver |
| `PAYMENT_APPROVED_OWNER` | Propriétaire | Même action | Même écran |

**URL pour tester :**  
`http://localhost:3000/tenant/{tenantId}/rental/payments` (ou parcours Baux → Bail → Paiements / Déclarations) → **Approuver** une déclaration.

---

### Paiement rejeté (locataire / propriétaire)

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `PAYMENT_REJECTED_TENANT` | Locataire | Lorsque l’agence **rejette** une déclaration de paiement | **Back-office** : même zone Paiements / Déclarations → Rejeter |
| `PAYMENT_REJECTED_OWNER` | Propriétaire | Même action | Même écran |

**URL pour tester :**  
`http://localhost:3000/tenant/{tenantId}/rental/payments` → **Rejeter** une déclaration.

---

### Paiement alloué aux échéances (locataire / propriétaire)

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `PAYMENT_ALLOCATED_TENANT` | Locataire | Lorsque l’agence **alloue** un paiement à des échéances (loyers) | **Back-office** : Paiements → Allouer un paiement à des échéances |
| `PAYMENT_ALLOCATED_OWNER` | Propriétaire | Même action | Même écran |

**URL pour tester :**  
`http://localhost:3000/tenant/{tenantId}/rental/payments` → détail d’un paiement / déclaration → **Allouer aux échéances**.

---

### Paiement reçu / Paiement confirmé

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `PAYMENT_RECEIVED` | Locataire / Propriétaire | Confirmation d’un paiement reçu | Dépend du flux métier (à brancher si besoin) |
| `PAYMENT_CONFIRMED` | Destinataire concerné | Notification de confirmation de paiement | Idem |

**Statut :** Templates et clés définis ; liaison à un flux métier précis à confirmer selon votre usage.

---

## Dépôts de garantie

### Mouvement sur le dépôt de garantie (locataire / propriétaire)

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `DEPOSIT_MOVEMENT_TENANT` | Locataire | Lorsqu’un **mouvement** est enregistré sur le dépôt (collecte, remboursement, blocage, etc.) | **Back-office** : Baux → Dépôts de garantie → Enregistrer un mouvement |
| `DEPOSIT_MOVEMENT_OWNER` | Propriétaire | Même moment | Même écran |

**URL pour tester :**  
`http://localhost:3000/tenant/{tenantId}/rental/deposits` (ou via un bail) → **Créer / Enregistrer un mouvement** sur le dépôt de garantie.

---

## Baux et échéances

### Rappel d’échéance (loyer)

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `INSTALLMENT_DUE_REMINDER` | Locataire | Envoi automatique (job planifié) avant l’échéance du loyer | **Non déclenché manuellement** : job quotidien (ex. 6h UTC). Créer une échéance à échoir sous 1–3 jours pour voir l’email. |

**Statut :** Job présent ; envoi effectif via templates « Notifications email » à finaliser (TODO dans le code).

---

### Échéance dépassée (impayé)

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `INSTALLMENT_OVERDUE` | Locataire | Notification d’échéance en retard | Dépend d’un job ou d’un flux dédié (à brancher si besoin). |

**Statut :** Clé et templates définis ; déclenchement à implémenter.

---

### Bail activé

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `LEASE_ACTIVATED` | Locataire / Propriétaire | Lors de l’**activation** d’un bail | **Back-office** : Baux → activer un bail (passage en statut Actif). |

**Statut :** Template défini ; envoi via « Notifications email » (config) à brancher dans le service d’activation du bail si pas déjà fait.

**URL pour tester :**  
`http://localhost:3000/tenant/{tenantId}/rental/leases` → ouvrir un bail → **Activer**.

---

### Fin de bail prochaine

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `LEASE_ENDING_SOON` | Locataire / Propriétaire | Envoi automatique (job) X jours avant la fin du bail | **Non déclencable manuellement** : job quotidien. Bail avec date de fin dans les 30 jours. |

**Statut :** Job présent ; envoi via templates « Notifications email » à finaliser (TODO).

---

## CRM

### Affaire créée / Étape affaire modifiée

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `DEAL_CREATED` | Contact CRM / Agence | Lors de la **création** d’une affaire CRM | **Back-office** : CRM → Affaires → Créer une affaire |
| `DEAL_STAGE_CHANGED` | Contact CRM / Agence | Lors du **changement d’étape** d’une affaire | CRM → Affaires → Ouvrir une affaire → Changer l’étape |

**Statut :** Templates définis ; envoi via « Notifications email » à brancher dans les services CRM (commentaires dans le code).

**URL pour tester :**  
`http://localhost:3000/tenant/{tenantId}/crm/deals` (ou équivalent selon vos routes).

---

### Rappel rendez-vous

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `APPOINTMENT_REMINDER` | Contact | Rappel avant un rendez-vous CRM | Dépend d’un job ou d’un flux CRM (à brancher). |

**Statut :** Clé et template définis ; déclenchement à implémenter.

---

## Propriétés et documents

### Propriété publiée

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `PROPERTY_PUBLISHED` | Agence / Contact | Lors de la **publication** d’une propriété | **Back-office** : Propriétés → Publier une propriété |

**Statut :** Template défini ; envoi à brancher dans le service de publication (commentaire dans le code).

**URL pour tester :**  
`http://localhost:3000/tenant/{tenantId}/properties` → propriété → **Publier**.

---

### Document expirant

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `DOCUMENT_EXPIRING` | Destinataire concerné | Alerte avant expiration d’un document | Dépend d’un job ou d’un flux document (à brancher). |

**Statut :** Clé et template définis ; déclenchement à implémenter.

---

## Autres

### Invitation

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `INVITATION` | Invité | Envoi d’un **email d’invitation** (collaborateur, portail, etc.) | **Back-office** : Paramètres / Utilisateurs → Inviter un collaborateur |

**URL pour tester :**  
`http://localhost:3000/tenant/{tenantId}/users` (ou Invitations) → **Inviter** → saisir un email. L’invité reçoit l’email d’invitation (template peut être géré en dur côté auth/invitation).

---

### Réinitialisation mot de passe

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `PASSWORD_RESET` | Utilisateur | Lors d’une demande de **réinitialisation de mot de passe** | **Page login** : « Mot de passe oublié » → saisir l’email |

**URL pour tester :**  
`http://localhost:3000/login` → **Mot de passe oublié** → envoyer le lien. L’utilisateur reçoit l’email avec le lien de réinitialisation.

---

### Personnalisé

| Clé | Destinataire | Déclenchement | Où tester |
|-----|--------------|---------------|------------|
| `CUSTOM` | Selon règle | Événement personnalisé (template libre) | Utilisable par des règles / templates ou intégrations futures. |

---

## Récapitulatif – Où tester (URLs principales)

| Événement | URL de test | Menu / action |
|-----------|-------------|----------------|
| **Nouveau ticket de maintenance** (agence, locataire, propriétaire) | `http://localhost:3000/tenant/maintenance` | Portail locataire → Maintenance → Créer un ticket |
| **Changement de statut du ticket** (locataire / propriétaire) | `http://localhost:3000/tenant/{tenantId}/admin/maintenance/tickets` | Maintenance (admin) → Tickets → Modifier le statut d’un ticket |
| **Déclaration de paiement** | Portail locataire (même base que maintenance) | Paiements → Déclarer un paiement |
| **Paiement approuvé / rejeté** | `http://localhost:3000/tenant/{tenantId}/rental/payments` | Baux / Paiements → Approuver ou Rejeter une déclaration |
| **Paiement alloué** | Idem | Paiements → Allouer aux échéances |
| **Mouvement dépôt de garantie** | `http://localhost:3000/tenant/{tenantId}/rental/deposits` | Dépôts → Enregistrer un mouvement |
| **Invitation** | `http://localhost:3000/tenant/{tenantId}/users` | Inviter un collaborateur |
| **Réinitialisation mot de passe** | `http://localhost:3000/login` | Mot de passe oublié |

---

*Document généré pour le module Communication (spec 010). Mettre à jour ce fichier si de nouveaux déclencheurs sont ajoutés ou si les URLs changent.*
