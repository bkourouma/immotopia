# Quand les règles de notification sont exécutées

Ce document indique **à quel moment** chaque type d’événement déclencheur est exécuté (et donc quand les règles associées envoient des messages).

---

## 1. Vérifier les règles créées en base

Pour lister les règles du tenant `e3e428d1-364b-42c9-a102-a22daa9329c5` (ou un autre) :

### Option A : Script npm (depuis `packages/api`)

> **Obsolete** : les tables `communication_templates` et `notification_rules` ont ete supprimees
> par la migration `20260210120000_remove_communication_messaging_tables`. Les notifications sont
> desormais pilotees par les constantes `src/constants/email-notification-*` et
> `src/constants/whatsapp-notification-*`, surchargeables par tenant via les ecrans
> "Notifications email" / "Notifications WhatsApp". Le seed `db:seed:communication` et le script
> `script:list-rules` ont ete retires.

Vous obtiendrez un JSON avec toutes les règles (nom, événement, destinataires, templates, actif, etc.).

### Option B : Prisma Studio (interface graphique)

```bash
cd packages/api
npx prisma studio
```

Puis ouvrir la table **notification_rules**, filtrer par `tenant_id` = `e3e428d1-364b-42c9-a102-a22daa9329c5`.

### Option C : Requête SQL directe

Si vous avez accès à PostgreSQL :

```sql
SELECT id, name, event_trigger, recipient_types, active,
       template_id_email, template_id_whatsapp, copy_agency, created_at
FROM notification_rules
WHERE tenant_id = 'e3e428d1-364b-42c9-a102-a22daa9329c5'
ORDER BY created_at;
```

---

## 2. À quel moment chaque règle est exécutée

Le tableau ci-dessous indique **quand** l’événement est déclenché. Seules les **règles actives** dont l’**événement déclencheur** correspond sont exécutées à ce moment-là.

| Événement déclencheur | Quand la règle est exécutée |
|------------------------|-----------------------------|
| **PAYMENT_RECEIVED** (Paiement reçu) | **Immédiatement** lorsqu’un **paiement est créé** dans le module Locatif (Locatif > Paiements > Enregistrer un paiement). |
| **PAYMENT_CONFIRMED** (Paiement confirmé) | E-mail envoyé **automatiquement** au locataire lorsque l'agence approuve une déclaration (aucune règle requise). |
| **PAYMENT_DECLARED** (Paiement déclaré) | E-mail envoyé **automatiquement** à tous les utilisateurs de l'agence lorsqu'un locataire déclare un paiement (aucune règle requise). |
| **PAYMENT_DECLARATION_REJECTED** (Déclaration rejetée) | E-mail envoyé **automatiquement** au locataire lorsque l'agence rejette une déclaration (aucune règle requise). |
| **INSTALLMENT_DUE_REMINDER** (Rappel d’échéance de loyer) | **Tous les jours à 6h00 UTC** par un job planifié : pour chaque échéance dont la **date d’échéance est dans 1 à 3 jours** et dont le statut est DRAFT, PENDING ou PARTIALLY_PAID. |
| **INSTALLMENT_OVERDUE** (Échéance dépassée) | Lorsqu’une échéance est traitée comme impayée (si l’appli déclenche cet événement). |
| **LEASE_ACTIVATED** (Bail activé) | **Immédiatement** lorsqu’un **bail est activé** (création ou passage à l’état actif dans le module Locatif > Baux). |
| **LEASE_ENDING_SOON** (Fin de bail prochaine) | **Tous les jours à 6h00 UTC** par le même job : pour chaque bail dont la **date de fin est dans les 30 prochains jours**. |
| **TICKET_CREATED** (Ticket créé) | **Immédiatement** lorsqu’un **ticket de maintenance est créé** (module Maintenance > Tickets). |
| **TICKET_STATUS_CHANGED** (Statut ticket modifié) | **Immédiatement** lorsqu’on **modifie le statut** d’un ticket (ex. Nouveau → En cours → Résolu). |
| **DEAL_CREATED** (Affaire créée) | **Immédiatement** lorsqu’une **affaire CRM est créée** (module CRM > Affaires). |
| **DEAL_STAGE_CHANGED** (Étape affaire modifiée) | **Immédiatement** lorsqu’on **change l’étape** d’une affaire (ex. Prospect → Négociation). |
| **APPOINTMENT_REMINDER** (Rappel rendez-vous) | Déclenché par un job ou un service de rappels (si implémenté). |
| **PROPERTY_PUBLISHED** (Propriété publiée) | **Immédiatement** lorsqu’une **propriété est publiée** (mise en ligne / publication). |
| **DOCUMENT_EXPIRING** (Document expirant) | Déclenché par un job qui détecte les documents proches de l’expiration (si implémenté). |

---

## 3. Résumé par type de moment

- **Immédiat (action utilisateur)**  
  Paiement créé, bail activé, ticket créé/modifié, affaire créée/étape modifiée, propriété publiée, **déclaration de paiement par le locataire** (→ PAYMENT_DECLARED, notifie l'agence), **approbation/rejet d'une déclaration par l'agence** (→ PAYMENT_CONFIRMED / PAYMENT_DECLARATION_REJECTED, notifie le locataire) → les règles correspondantes sont exécutées tout de suite après l'action.

- **Planifié (job quotidien à 6h UTC)**  
  - Rappels d’échéance : échéances dans 1 à 3 jours → **INSTALLMENT_DUE_REMINDER**.  
  - Fin de bail : baux qui se terminent dans les 30 jours → **LEASE_ENDING_SOON**.

---

## 4. Exemple pour vos règles

Si vous avez créé par exemple :

1. **Règle « Paiement reçu »** (PAYMENT_RECEIVED)  
   → S’exécute **à chaque enregistrement d’un paiement** dans Locatif > Paiements.

2. **Règle « Rappel loyer »** (INSTALLMENT_DUE_REMINDER)  
   → S’exécute **tous les jours à 6h UTC** pour les loyers dont l’échéance est dans 1 à 3 jours.

3. **Règle « Ticket créé »** (TICKET_CREATED)  
   → S'exécute **à chaque création d'un ticket** dans Maintenance > Tickets.

4. **Paiement déclaré / approuvé / rejeté** (PAYMENT_DECLARED, PAYMENT_CONFIRMED, PAYMENT_DECLARATION_REJECTED)  
   → Les notifications sont **envoyées automatiquement par e-mail** (comme pour la création de compte d'un nouveau locataire). **Aucune règle à créer** : l'agence reçoit un e-mail à chaque déclaration de paiement par un locataire ; le locataire reçoit un e-mail quand l'agence approuve ou rejette sa déclaration.

Pour voir **vos** règles exactes (noms, événements, destinataires, actif/inactif), utilisez le script ou Prisma Studio comme en section 1.
