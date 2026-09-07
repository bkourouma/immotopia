# Guide de Test - Portail Propriétaire (Owner Portal)

## Vue d'ensemble

Ce document fournit un guide complet pour tester toutes les fonctionnalités du portail propriétaire, incluant les données de test nécessaires et les scénarios de test pour chaque page.

## Prérequis

1. **Base de données** : PostgreSQL avec les migrations appliquées
2. **Utilisateur de test** : Un utilisateur avec un compte `TenantClient` de type `PROPRIETAIRE` (OWNER)
3. **Propriétés** : Des propriétés liées au propriétaire (via `Property.ownerUserId` ou `RentalLease.ownerClientId`)
4. **Données de test** : Voir section "Données de Test Requises" ci-dessous

---

## Compte de Test

### Identifiants de connexion

**Email** : `owner@test.com`  
**Mot de passe** : `Test@123456`

Ce compte est disponible dans la page de connexion pour une connexion rapide.

---

## Données de Test Requises

### Script SQL complet

Exécutez le script SQL suivant pour créer toutes les données de test nécessaires :

```sql
-- ============================================
-- SCRIPT DE CRÉATION DES DONNÉES DE TEST
-- Portail Propriétaire (Owner Portal)
-- ============================================

-- 1. Créer un Tenant (Agence)
INSERT INTO tenants (id, name, slug, type, status, created_at, updated_at)
VALUES (
  'test-owner-tenant-id',
  'Agence Immobilière Test',
  'agence-test',
  'AGENCY',
  'ACTIVE',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 2. Créer un utilisateur propriétaire
-- Note: Le hash du mot de passe "Test@123456" avec bcrypt (12 rounds)
INSERT INTO users (id, email, password_hash, full_name, phone_primary, global_role, email_verified, is_active, created_at, updated_at)
VALUES (
  'test-owner-user-id',
  'owner@test.com',
  '$2b$12$6PGvbfNzyJZ5uZajG4QApOMcztc3CEU8WxoUwkH0.pgLFrcPMbDd.',
  'Ibrahim Sanogo',
  '+221771234567',
  'USER',
  true,
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  full_name = EXCLUDED.full_name,
  email_verified = true,
  is_active = true;

-- 3. Créer un TenantClient de type PROPRIETAIRE
INSERT INTO tenant_clients (id, tenant_id, user_id, client_type, owner_portal_enabled, owner_portal_last_access, created_at, updated_at)
VALUES (
  'test-owner-client-id',
  'test-owner-tenant-id',
  'test-owner-user-id',
  'OWNER',
  true,
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  owner_portal_enabled = true,
  owner_portal_last_access = NOW();

-- 4. Créer des propriétés (propriétaire direct)
INSERT INTO properties (
  id, tenant_id, internal_reference, property_type, ownership_type,
  address, title, description,
  status, transaction_modes,
  owner_user_id,
  created_at, updated_at
)
VALUES
-- Propriété 1: Appartement loué
(
  'test-property-1-id',
  'test-owner-tenant-id',
  'PROP-OWNER-001',
  'APPARTEMENT',
  'INDIVIDUAL',
  '123 Avenue Bourguiba, Dakar',
  'Appartement T3 - Centre-ville',
  'Bel appartement de 3 pièces au centre de Dakar, proche des commodités.',
  'RENTED',
  ARRAY['RENTAL']::text[],
  'test-owner-user-id',
  NOW(),
  NOW()
),
-- Propriété 2: Maison disponible
(
  'test-property-2-id',
  'test-owner-tenant-id',
  'PROP-OWNER-002',
  'MAISON_VILLA',
  'INDIVIDUAL',
  '456 Rue de la Corniche, Almadies',
  'Villa avec jardin',
  'Magnifique villa avec jardin, piscine et garage.',
  'AVAILABLE',
  ARRAY['RENTAL', 'SALE']::text[],
  'test-owner-user-id',
  NOW(),
  NOW()
),
-- Propriété 3: Studio en maintenance
(
  'test-property-3-id',
  'test-owner-tenant-id',
  'PROP-OWNER-003',
  'STUDIO',
  'INDIVIDUAL',
  '789 Boulevard Général de Gaulle, Plateau',
  'Studio meublé',
  'Studio meublé idéal pour étudiant ou jeune professionnel.',
  'UNDER_REVIEW',
  ARRAY['RENTAL']::text[],
  'test-owner-user-id',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 5. Créer un locataire (TenantClient de type RENTER)
INSERT INTO tenant_clients (id, tenant_id, user_id, client_type, created_at, updated_at)
VALUES (
  'test-renter-client-id',
  'test-owner-tenant-id',
  'test-owner-user-id', -- Même utilisateur pour simplifier (en production, ce serait un autre utilisateur)
  'RENTER',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 6. Créer des baux (RentalLease)
INSERT INTO rental_leases (
  id, tenant_id, property_id, primary_renter_client_id, owner_client_id,
  lease_number, status, start_date, end_date,
  currency, rent_amount, service_charge_amount, security_deposit_amount,
  billing_frequency, due_day_of_month,
  created_at, updated_at
)
VALUES
-- Bail actif - Propriété 1
(
  'test-lease-1-id',
  'test-owner-tenant-id',
  'test-property-1-id',
  'test-renter-client-id',
  'test-owner-client-id',
  'BAIL-2024-001',
  'ACTIVE',
  '2024-01-01',
  '2024-12-31',
  'FCFA',
  200000,
  30000,
  400000,
  'MONTHLY',
  5,
  NOW(),
  NOW()
),
-- Bail terminé - Propriété 2 (pour historique)
(
  'test-lease-2-id',
  'test-owner-tenant-id',
  'test-property-2-id',
  'test-renter-client-id',
  'test-owner-client-id',
  'BAIL-2023-001',
  'ENDED',
  '2023-01-01',
  '2023-12-31',
  'FCFA',
  300000,
  40000,
  600000,
  'MONTHLY',
  5,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 7. Créer des échéances (RentalInstallment)
INSERT INTO rental_installments (
  id, tenant_id, lease_id,
  period_year, period_month, due_date,
  amount_rent, amount_service, amount_other_fees,
  amount_paid, status,
  created_at, updated_at
)
VALUES
-- Échéances payées (2024)
(
  'installment-paid-1-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  2024, 1, '2024-01-05',
  200000, 30000, 0,
  230000, 'PAID',
  NOW(), NOW()
),
(
  'installment-paid-2-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  2024, 2, '2024-02-05',
  200000, 30000, 0,
  230000, 'PAID',
  NOW(), NOW()
),
(
  'installment-paid-3-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  2024, 3, '2024-03-05',
  200000, 30000, 0,
  230000, 'PAID',
  NOW(), NOW()
),
-- Échéance due (courante)
(
  'installment-due-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  2024, 4, '2024-04-05',
  200000, 30000, 0,
  0, 'DUE',
  NOW(), NOW()
),
-- Échéance en retard
(
  'installment-overdue-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  2024, 5, '2024-05-05',
  200000, 30000, 0,
  0, 'OVERDUE',
  NOW(), NOW()
),
-- Échéance partielle
(
  'installment-partial-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  2024, 6, '2024-06-05',
  200000, 30000, 0,
  115000, 'PARTIAL',
  NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 8. Créer des paiements (RentalPayment)
INSERT INTO rental_payments (
  id, tenant_id, lease_id, renter_client_id,
  payment_number, status, method, currency, amount,
  succeeded_at, created_at, updated_at
)
VALUES
-- Paiement réussi - Janvier
(
  'payment-1-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  'test-renter-client-id',
  'PAY-2024-001',
  'SUCCESS',
  'BANK_TRANSFER',
  'FCFA',
  230000,
  '2024-01-10 10:00:00',
  NOW(),
  NOW()
),
-- Paiement réussi - Février
(
  'payment-2-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  'test-renter-client-id',
  'PAY-2024-002',
  'SUCCESS',
  'MOBILE_MONEY',
  'FCFA',
  230000,
  '2024-02-08 14:30:00',
  NOW(),
  NOW()
),
-- Paiement réussi - Mars
(
  'payment-3-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  'test-renter-client-id',
  'PAY-2024-003',
  'SUCCESS',
  'CASH',
  'FCFA',
  230000,
  '2024-03-12 09:15:00',
  NOW(),
  NOW()
),
-- Paiement partiel - Juin
(
  'payment-partial-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  'test-renter-client-id',
  'PAY-2024-004',
  'SUCCESS',
  'CHECK',
  'FCFA',
  115000,
  '2024-06-10 11:00:00',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 9. Créer des allocations de paiement (RentalPaymentAllocation)
INSERT INTO rental_payment_allocations (
  id, tenant_id, payment_id, installment_id, amount,
  created_at, updated_at
)
VALUES
-- Allocation pour janvier
(
  'allocation-1-id',
  'test-owner-tenant-id',
  'payment-1-id',
  'installment-paid-1-id',
  230000,
  NOW(), NOW()
),
-- Allocation pour février
(
  'allocation-2-id',
  'test-owner-tenant-id',
  'payment-2-id',
  'installment-paid-2-id',
  230000,
  NOW(), NOW()
),
-- Allocation pour mars
(
  'allocation-3-id',
  'test-owner-tenant-id',
  'payment-3-id',
  'installment-paid-3-id',
  230000,
  NOW(), NOW()
),
-- Allocation partielle pour juin
(
  'allocation-partial-id',
  'test-owner-tenant-id',
  'payment-partial-id',
  'installment-partial-id',
  115000,
  NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 10. Créer un dépôt de garantie (RentalSecurityDeposit)
INSERT INTO rental_security_deposits (
  id, tenant_id, lease_id,
  currency, target_amount, collected_amount,
  held_amount, refunded_amount, forfeited_amount,
  created_at, updated_at
)
VALUES (
  'deposit-1-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  'FCFA',
  400000,
  400000,
  50000,
  0,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 11. Créer des mouvements de dépôt (RentalDepositMovement)
INSERT INTO rental_deposit_movements (
  id, tenant_id, deposit_id,
  type, currency, amount,
  note, created_at, updated_at
)
VALUES
-- Collecte initiale
(
  'movement-collect-id',
  'test-owner-tenant-id',
  'deposit-1-id',
  'COLLECT',
  'FCFA',
  400000,
  'Dépôt de garantie collecté à la signature du bail',
  '2024-01-01 10:00:00',
  NOW()
),
-- Mise en retenue
(
  'movement-hold-id',
  'test-owner-tenant-id',
  'deposit-1-id',
  'HOLD',
  'FCFA',
  50000,
  'Retenue pour réparations mineures',
  '2024-03-15 14:00:00',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 12. Créer des tickets de maintenance (MaintenanceTicket)
INSERT INTO maintenance_tickets (
  id, tenant_id, property_id, lease_id,
  tenant_contact_id, created_by_contact_id,
  title, category, priority, description,
  status, declared_at,
  created_at, updated_at
)
VALUES
-- Ticket déclaré
(
  'ticket-declared-id',
  'test-owner-tenant-id',
  'test-property-1-id',
  'test-lease-1-id',
  'test-renter-client-id',
  'test-renter-client-id',
  'Fuite d''eau dans la salle de bain',
  'PLUMBING',
  'HIGH',
  'Il y a une fuite d''eau importante sous le lavabo de la salle de bain principale. L''eau coule même lorsque le robinet est fermé.',
  'DECLARED',
  '2024-03-10 09:00:00',
  NOW(),
  NOW()
),
-- Ticket en cours
(
  'ticket-in-progress-id',
  'test-owner-tenant-id',
  'test-property-1-id',
  'test-lease-1-id',
  'test-renter-client-id',
  'test-renter-client-id',
  'Problème électrique - Prise défectueuse',
  'ELECTRICITY',
  'MEDIUM',
  'La prise électrique dans la chambre principale ne fonctionne plus. Aucun appareil ne peut être branché.',
  'IN_PROGRESS',
  '2024-04-01 10:00:00',
  NOW(),
  NOW()
),
-- Ticket résolu
(
  'ticket-resolved-id',
  'test-owner-tenant-id',
  'test-property-1-id',
  'test-lease-1-id',
  'test-renter-client-id',
  'test-renter-client-id',
  'Climatisation en panne',
  'AC',
  'URGENT',
  'La climatisation ne fonctionne plus depuis hier. La température monte rapidement dans l''appartement.',
  'RESOLVED',
  '2024-02-15 11:00:00',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 13. Créer des commentaires de tickets (MaintenanceTicketComment)
INSERT INTO maintenance_ticket_comments (
  id, tenant_id, ticket_id,
  author_type, content,
  author_contact_id,
  created_at, updated_at
)
VALUES
(
  'comment-1-id',
  'test-owner-tenant-id',
  'ticket-declared-id',
  'TENANT',
  'La fuite semble s''être aggravée ce matin. Il y a maintenant une flaque d''eau sur le sol.',
  'test-renter-client-id',
  '2024-03-11 08:00:00',
  NOW()
),
(
  'comment-2-id',
  'test-owner-tenant-id',
  'ticket-in-progress-id',
  'TENANT',
  'Merci pour l''intervention rapide. Le technicien est passé hier.',
  'test-renter-client-id',
  '2024-04-02 09:00:00',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 14. Créer des documents (RentalDocument)
INSERT INTO rental_documents (
  id, tenant_id, lease_id,
  type, document_number, title,
  status, file_path, file_url,
  issued_at, mime_type,
  created_at, updated_at
)
VALUES
-- Contrat de bail
(
  'doc-lease-contract-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  'LEASE_CONTRACT',
  '2024-001',
  'Contrat de bail - Appartement T3',
  'FINAL',
  '/assets/generated_documents/lease-contract-2024-001.pdf',
  '/uploads/documents/lease-contract-2024-001.pdf',
  '2024-01-01',
  'application/pdf',
  NOW(),
  NOW()
),
-- Quittance de loyer
(
  'doc-receipt-1-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  'RENT_RECEIPT',
  '2024-002',
  'Quittance de loyer - Janvier 2024',
  'FINAL',
  '/assets/generated_documents/receipt-2024-002.pdf',
  '/uploads/documents/receipt-2024-002.pdf',
  '2024-01-10',
  'application/pdf',
  NOW(),
  NOW()
),
(
  'doc-receipt-2-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  'RENT_RECEIPT',
  '2024-003',
  'Quittance de loyer - Février 2024',
  'FINAL',
  '/assets/generated_documents/receipt-2024-003.pdf',
  '/uploads/documents/receipt-2024-003.pdf',
  '2024-02-10',
  'application/pdf',
  NOW(),
  NOW()
),
-- Attestation de domicile
(
  'doc-attestation-id',
  'test-owner-tenant-id',
  'test-lease-1-id',
  'RESIDENCE_CERTIFICATE',
  '2024-004',
  'Attestation de domicile',
  'FINAL',
  '/assets/generated_documents/attestation-2024-004.pdf',
  '/uploads/documents/attestation-2024-004.pdf',
  '2024-02-15',
  'application/pdf',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- FIN DU SCRIPT
-- ============================================
```

### Note importante sur le hash du mot de passe

Le hash dans le script SQL est déjà généré pour le mot de passe "Test@123456". Si vous devez régénérer le hash, utilisez :

```bash
# Dans Node.js (depuis packages/api)
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Test@123456', 12).then(hash => console.log(hash));"
```

Ou utilisez un script TypeScript :

```typescript
import bcrypt from 'bcrypt';
const hash = await bcrypt.hash('Test@123456', 12);
console.log(hash);
```

---

## Navigation et Menus

### Sidebar - Vérification des Menus

Le sidebar du portail propriétaire doit contenir les menus suivants (dans l'ordre) :

1. **Tableau de bord** (`/owner`) - Icône: HomeOutlined
2. **Mes propriétés** (`/owner/properties`) - Icône: BankOutlined
3. **Baux** (`/owner/leases`) - Icône: FileTextOutlined
4. **Revenus** (`/owner/revenues`) - Icône: DollarOutlined
5. **Échéances** (`/owner/installments`) - Icône: CalendarOutlined
6. **Paiements** (`/owner/payments`) - Icône: WalletOutlined
7. **Dépôts de garantie** (`/owner/deposits`) - Icône: SafetyOutlined
8. **Maintenance** (`/owner/maintenance`) - Icône: ToolOutlined
9. **Documents** (`/owner/documents`) - Icône: FolderOutlined
10. **Rapports** (`/owner/reports`) - Icône: FileSearchOutlined

**Vérification** : Tous les menus sont présents dans `apps/web/src/pages/OwnerPortal/Layout.tsx`

---

## Scénarios de Test par Page

### 1. Page de Connexion

**URL** : `/login`

**Test** :
1. Vérifier que le compte "Ibrahim Sanogo - PROPRIÉTAIRE (Owner)" est visible dans la section "Clients"
2. Cliquer sur le bouton de connexion rapide
3. Vérifier la redirection vers `/owner` (tableau de bord)

**Données attendues** :
- Email : `owner@test.com`
- Mot de passe : `Test@123456`
- Badge : "Owner Client"

---

### 2. Tableau de Bord (`/owner`)

**Objectif** : Vue d'ensemble du portefeuille immobilier

**Éléments à vérifier** :

1. **Cartes de résumé du portefeuille** :
   - Total : 3 propriétés
   - Louées : 1 propriété
   - Disponibles : 1 propriété
   - En maintenance : 1 propriété

2. **Métriques de revenus** :
   - Revenus du mois courant : 690 000 FCFA (3 paiements × 230 000)
   - Revenus de l'année courante : 690 000 FCFA
   - Revenus du mois dernier : 0 FCFA
   - Revenus de l'année dernière : 0 FCFA

3. **Taux d'occupation** :
   - Taux : 33.33% (1 louée / 3 total)

4. **Échéances à venir** :
   - Échéance due : Avril 2024 - 230 000 FCFA
   - Échéance en retard : Mai 2024 - 230 000 FCFA

5. **Paiements récents** :
   - 3 paiements récents (Janvier, Février, Mars)
   - Montants : 230 000 FCFA chacun

6. **Tickets de maintenance récents** :
   - 3 tickets (Déclaré, En cours, Résolu)

7. **Bouton "Actualiser"** :
   - Vérifier que le bouton rafraîchit les données

**Tests à effectuer** :
- [ ] Vérifier l'affichage correct de toutes les cartes
- [ ] Vérifier les calculs de revenus
- [ ] Vérifier le taux d'occupation
- [ ] Vérifier la liste des échéances à venir
- [ ] Vérifier la liste des paiements récents
- [ ] Vérifier la liste des tickets récents
- [ ] Tester le bouton de rafraîchissement

---

### 3. Mes Propriétés (`/owner/properties`)

**Objectif** : Liste et détails des propriétés

**Éléments à vérifier** :

1. **Cartes de résumé** :
   - Total : 3
   - Louées : 1
   - Disponibles : 1
   - En maintenance : 1

2. **Filtres** :
   - Statut (Tous, Disponible, Loué, En révision, Réservé, Sous offre)
   - Type de propriété (Tous, Appartement, Maison/Villa, Studio, etc.)
   - Mode de transaction (Tous, Location, Vente, Location courte durée)

3. **Liste des propriétés** :
   - Propriété 1 : Appartement T3 - Centre-ville (Loué)
   - Propriété 2 : Villa avec jardin (Disponible)
   - Propriété 3 : Studio meublé (En révision)

4. **Actions** :
   - Cliquer sur une propriété pour voir les détails

**Tests à effectuer** :
- [ ] Vérifier l'affichage de toutes les propriétés
- [ ] Tester les filtres par statut
- [ ] Tester les filtres par type
- [ ] Tester les filtres par mode de transaction
- [ ] Vérifier la navigation vers les détails d'une propriété
- [ ] Tester le bouton de rafraîchissement

---

### 4. Détails d'une Propriété (`/owner/properties/:id`)

**Objectif** : Informations détaillées sur une propriété

**Éléments à vérifier** :

1. **Informations générales** :
   - Adresse : 123 Avenue Bourguiba, Dakar
   - Type : Appartement
   - Statut : Loué
   - Référence : PROP-OWNER-001

2. **Bail actif** :
   - Numéro : BAIL-2024-001
   - Locataire : (nom du locataire)
   - Date de début : 01/01/2024
   - Date de fin : 31/12/2024
   - Loyer mensuel : 200 000 FCFA
   - Charges : 30 000 FCFA

3. **Statistiques** :
   - Revenus totaux
   - Paiements reçus
   - Échéances en attente

**Tests à effectuer** :
- [ ] Vérifier toutes les informations de la propriété
- [ ] Vérifier les détails du bail actif
- [ ] Vérifier les statistiques financières
- [ ] Vérifier la navigation vers le détail du bail

---

### 5. Baux (`/owner/leases`)

**Objectif** : Liste des baux

**Éléments à vérifier** :

1. **Cartes de résumé** :
   - Baux actifs : 1
   - Baux terminés : 1
   - Baux suspendus : 0

2. **Filtres** :
   - Statut (Tous, Actif, Terminé, Suspendu)

3. **Liste des baux** :
   - Bail actif : BAIL-2024-001 (Propriété 1)
   - Bail terminé : BAIL-2023-001 (Propriété 2)

4. **Actions** :
   - Cliquer sur un bail pour voir les détails

**Tests à effectuer** :
- [ ] Vérifier l'affichage de tous les baux
- [ ] Tester les filtres par statut
- [ ] Vérifier la navigation vers les détails d'un bail
- [ ] Tester le bouton de rafraîchissement

---

### 6. Détails d'un Bail (`/owner/leases/:id`)

**Objectif** : Informations détaillées sur un bail

**Éléments à vérifier** :

1. **Informations du bail** :
   - Numéro : BAIL-2024-001
   - Propriété : Appartement T3 - Centre-ville
   - Locataire : (nom)
   - Période : 01/01/2024 - 31/12/2024
   - Loyer : 200 000 FCFA
   - Charges : 30 000 FCFA
   - Dépôt de garantie : 400 000 FCFA

2. **Calendrier des échéances** :
   - Liste des échéances avec statuts (Payé, Due, En retard, Partiel)

3. **Historique des paiements** :
   - Liste des paiements avec dates et montants

**Tests à effectuer** :
- [ ] Vérifier toutes les informations du bail
- [ ] Vérifier le calendrier des échéances
- [ ] Vérifier l'historique des paiements
- [ ] Vérifier la navigation vers les détails d'un paiement

---

### 7. Revenus (`/owner/revenues`)

**Objectif** : Analyse des revenus locatifs

**Éléments à vérifier** :

1. **Cartes de résumé** :
   - Revenus totaux (année courante)
   - Revenus du mois courant
   - Revenus du mois dernier
   - Nombre de paiements

2. **Graphiques** :
   - Revenus par mois (graphique en barres)
   - Revenus par propriété (graphique en barres)

3. **Filtres** :
   - Période (date de début, date de fin)
   - Propriété (Toutes ou une propriété spécifique)
   - Groupement (Par mois, Par année, Par propriété)

4. **Tableau des revenus** :
   - Liste détaillée des revenus par période

**Tests à effectuer** :
- [ ] Vérifier les cartes de résumé
- [ ] Vérifier les graphiques (revenus par mois, par propriété)
- [ ] Tester les filtres de période
- [ ] Tester les filtres par propriété
- [ ] Tester les différents groupements
- [ ] Vérifier le tableau des revenus
- [ ] Tester le bouton de rafraîchissement

---

### 8. Échéances (`/owner/installments`)

**Objectif** : Suivi des échéances de paiement

**Éléments à vérifier** :

1. **Cartes de résumé** :
   - Total des échéances
   - Échéances dues
   - Échéances en retard
   - Échéances payées

2. **Filtres** :
   - Statut (Tous, Due, En retard, Payé, Partiel)
   - Propriété (Toutes ou une propriété spécifique)
   - Période (date de début, date de fin)

3. **Tableau des échéances** :
   - Propriété
   - Locataire
   - Période
   - Date d'échéance
   - Montant
   - Statut

**Tests à effectuer** :
- [ ] Vérifier les cartes de résumé
- [ ] Vérifier le tableau des échéances
- [ ] Tester les filtres par statut
- [ ] Tester les filtres par propriété
- [ ] Tester les filtres par période
- [ ] Tester le bouton de rafraîchissement

---

### 9. Paiements (`/owner/payments`)

**Objectif** : Historique des paiements reçus

**Éléments à vérifier** :

1. **Cartes de résumé** :
   - Total des paiements (année courante)
   - Paiements du mois courant
   - Paiements du mois dernier
   - Nombre de paiements

2. **Filtres** :
   - Propriété (Toutes ou une propriété spécifique)
   - Méthode de paiement (Toutes, Virement, Mobile Money, Espèces, Chèque, Carte)
   - Statut (Tous, Succès, Échec, En attente)
   - Période (date de début, date de fin)

3. **Tableau des paiements** :
   - Date
   - Propriété
   - Locataire
   - Montant
   - Méthode
   - Statut
   - Actions (Voir détails)

4. **Modal de détails** :
   - Informations complètes du paiement
   - Allocations aux échéances

**Tests à effectuer** :
- [ ] Vérifier les cartes de résumé
- [ ] Vérifier le tableau des paiements
- [ ] Tester les filtres par propriété
- [ ] Tester les filtres par méthode
- [ ] Tester les filtres par statut
- [ ] Tester les filtres par période
- [ ] Ouvrir le modal de détails d'un paiement
- [ ] Vérifier les allocations dans le modal
- [ ] Tester le bouton de rafraîchissement

---

### 10. Dépôts de Garantie (`/owner/deposits`)

**Objectif** : Suivi des dépôts de garantie

**Éléments à vérifier** :

1. **Cartes de résumé** :
   - Total des dépôts
   - Montant total retenu
   - Montant total remboursé

2. **Tableau des dépôts** :
   - Propriété
   - Locataire
   - Montant du dépôt
   - Montant retenu
   - Montant remboursé
   - Statut
   - Actions (Voir historique)

3. **Modal d'historique** :
   - Liste des mouvements (Collecte, Retenue, Remboursement, Forfaiture)

**Tests à effectuer** :
- [ ] Vérifier les cartes de résumé
- [ ] Vérifier le tableau des dépôts
- [ ] Ouvrir le modal d'historique d'un dépôt
- [ ] Vérifier les mouvements dans le modal
- [ ] Tester le bouton de rafraîchissement

---

### 11. Maintenance (`/owner/maintenance`)

**Objectif** : Suivi des tickets de maintenance

**Éléments à vérifier** :

1. **Cartes de résumé** :
   - Total des tickets
   - Tickets déclarés
   - Tickets en cours
   - Tickets résolus

2. **Filtres** :
   - Statut (Tous, Déclaré, En cours, Résolu, Fermé)
   - Catégorie (Toutes, Plomberie, Électricité, Climatisation, etc.)
   - Priorité (Toutes, Urgente, Haute, Moyenne, Basse)
   - Propriété (Toutes ou une propriété spécifique)

3. **Tableau des tickets** :
   - Propriété
   - Titre
   - Catégorie
   - Priorité
   - Statut
   - Date de déclaration
   - Actions (Voir détails)

4. **Modal de détails** :
   - Description complète
   - Pièces jointes
   - Commentaires
   - Historique des statuts

**Tests à effectuer** :
- [ ] Vérifier les cartes de résumé
- [ ] Vérifier le tableau des tickets
- [ ] Tester les filtres par statut
- [ ] Tester les filtres par catégorie
- [ ] Tester les filtres par priorité
- [ ] Tester les filtres par propriété
- [ ] Ouvrir le modal de détails d'un ticket
- [ ] Vérifier les commentaires dans le modal
- [ ] Vérifier l'historique des statuts
- [ ] Tester le bouton de rafraîchissement

---

### 12. Documents (`/owner/documents`)

**Objectif** : Accès aux documents de location

**Éléments à vérifier** :

1. **Filtres** :
   - Type de document (Tous, Contrat de bail, Quittance de loyer, Attestation de domicile, etc.)
   - Propriété (Toutes ou une propriété spécifique)
   - Bail (Tous ou un bail spécifique)

2. **Documents groupés par type** :
   - Contrats de bail
   - Quittances de loyer
   - Attestations de domicile
   - Autres documents

3. **Actions** :
   - Télécharger un document

**Tests à effectuer** :
- [ ] Vérifier l'affichage des documents groupés par type
- [ ] Tester les filtres par type
- [ ] Tester les filtres par propriété
- [ ] Tester les filtres par bail
- [ ] Tester le téléchargement d'un document
- [ ] Tester le bouton de rafraîchissement

---

### 13. Rapports (`/owner/reports`)

**Objectif** : Génération de rapports (revenus, occupation, export de données)

**Éléments à vérifier** :

1. **Rapport de revenus** :
   - Date de début
   - Date de fin
   - Propriété (optionnelle)
   - Format (PDF, CSV, Excel)
   - Bouton "Générer et télécharger"

2. **Rapport d'occupation** :
   - Date de référence
   - Format (PDF, CSV, Excel)
   - Bouton "Générer et télécharger"

3. **Export de données** :
   - Type d'entité (Paiements, Échéances, Baux)
   - Date de début (optionnelle)
   - Date de fin (optionnelle)
   - Propriété (optionnelle)
   - Format (CSV, Excel)
   - Bouton "Exporter et télécharger"

**Tests à effectuer** :
- [ ] Générer un rapport de revenus en PDF
- [ ] Générer un rapport de revenus en CSV
- [ ] Générer un rapport de revenus en Excel
- [ ] Générer un rapport d'occupation en PDF
- [ ] Générer un rapport d'occupation en CSV
- [ ] Générer un rapport d'occupation en Excel
- [ ] Exporter les paiements en CSV
- [ ] Exporter les paiements en Excel
- [ ] Exporter les échéances en CSV
- [ ] Exporter les échéances en Excel
- [ ] Exporter les baux en CSV
- [ ] Exporter les baux en Excel
- [ ] Vérifier le contenu des fichiers générés

---

## Tests de Sécurité

### Vérification de l'isolation des données

1. **Test d'accès non autorisé** :
   - Se connecter avec un compte qui n'est pas propriétaire
   - Vérifier que l'accès au portail propriétaire est refusé

2. **Test de propriété** :
   - Vérifier qu'un propriétaire ne peut voir que ses propres propriétés
   - Vérifier qu'un propriétaire ne peut voir que les baux de ses propriétés
   - Vérifier qu'un propriétaire ne peut voir que les paiements de ses propriétés

3. **Test de middleware** :
   - Vérifier que le middleware `requireOwnerPortalAccess` bloque les accès non autorisés
   - Vérifier que seuls les `TenantClient` de type `PROPRIETAIRE` peuvent accéder

---

## Tests de Performance

1. **Temps de chargement** :
   - Vérifier que le tableau de bord se charge en moins de 2 secondes
   - Vérifier que les listes se chargent en moins de 1 seconde

2. **Rafraîchissement** :
   - Tester le bouton de rafraîchissement sur chaque page
   - Vérifier que les données sont mises à jour correctement

---

## Tests d'Accessibilité

1. **Navigation au clavier** :
   - Vérifier que tous les éléments interactifs sont accessibles au clavier
   - Vérifier la navigation dans les menus

2. **ARIA labels** :
   - Vérifier que les boutons ont des labels ARIA appropriés
   - Vérifier que les formulaires ont des labels appropriés

---

## Checklist de Test Complète

### Navigation
- [ ] Tous les menus du sidebar sont présents
- [ ] La navigation entre les pages fonctionne correctement
- [ ] Les routes de détail (propriété, bail) sont accessibles depuis les listes

### Tableau de bord
- [ ] Toutes les cartes de résumé s'affichent correctement
- [ ] Les métriques de revenus sont correctes
- [ ] Le taux d'occupation est correct
- [ ] Les échéances à venir s'affichent
- [ ] Les paiements récents s'affichent
- [ ] Les tickets récents s'affichent
- [ ] Le bouton de rafraîchissement fonctionne

### Propriétés
- [ ] La liste des propriétés s'affiche
- [ ] Les filtres fonctionnent
- [ ] Les détails d'une propriété s'affichent
- [ ] Le bouton de rafraîchissement fonctionne

### Baux
- [ ] La liste des baux s'affiche
- [ ] Les filtres fonctionnent
- [ ] Les détails d'un bail s'affichent
- [ ] Le bouton de rafraîchissement fonctionne

### Revenus
- [ ] Les cartes de résumé s'affichent
- [ ] Les graphiques s'affichent
- [ ] Les filtres fonctionnent
- [ ] Le tableau des revenus s'affiche
- [ ] Le bouton de rafraîchissement fonctionne

### Échéances
- [ ] Les cartes de résumé s'affichent
- [ ] Le tableau des échéances s'affiche
- [ ] Les filtres fonctionnent
- [ ] Le bouton de rafraîchissement fonctionne

### Paiements
- [ ] Les cartes de résumé s'affichent
- [ ] Le tableau des paiements s'affiche
- [ ] Les filtres fonctionnent
- [ ] Le modal de détails s'ouvre
- [ ] Le bouton de rafraîchissement fonctionne

### Dépôts
- [ ] Les cartes de résumé s'affichent
- [ ] Le tableau des dépôts s'affiche
- [ ] Le modal d'historique s'ouvre
- [ ] Le bouton de rafraîchissement fonctionne

### Maintenance
- [ ] Les cartes de résumé s'affichent
- [ ] Le tableau des tickets s'affiche
- [ ] Les filtres fonctionnent
- [ ] Le modal de détails s'ouvre
- [ ] Le bouton de rafraîchissement fonctionne

### Documents
- [ ] Les documents groupés par type s'affichent
- [ ] Les filtres fonctionnent
- [ ] Le téléchargement fonctionne
- [ ] Le bouton de rafraîchissement fonctionne

### Rapports
- [ ] Le rapport de revenus se génère (PDF, CSV, Excel)
- [ ] Le rapport d'occupation se génère (PDF, CSV, Excel)
- [ ] L'export de données fonctionne (CSV, Excel)
- [ ] Les fichiers générés contiennent les bonnes données

### Sécurité
- [ ] L'accès non autorisé est bloqué
- [ ] L'isolation des données est respectée
- [ ] Les validations de propriété fonctionnent

### Performance
- [ ] Les temps de chargement sont acceptables
- [ ] Le rafraîchissement fonctionne correctement

### Accessibilité
- [ ] La navigation au clavier fonctionne
- [ ] Les labels ARIA sont présents

---

## Résolution des Problèmes

### Problème : Le compte owner n'apparaît pas dans la page de connexion

**Solution** :
1. Vérifier que le script SQL a été exécuté correctement
2. Vérifier que l'utilisateur existe dans la table `users`
3. Vérifier que le `TenantClient` existe avec `client_type = 'OWNER'`
4. Vérifier que `owner_portal_enabled = true`

### Problème : Erreur 403 lors de l'accès au portail

**Solution** :
1. Vérifier que le `TenantClient` a `client_type = 'PROPRIETAIRE'`
2. Vérifier que le `TenantClient` a `owner_portal_enabled = true`
3. Vérifier que le propriétaire a au moins une propriété (via `Property.ownerUserId` ou `RentalLease.ownerClientId`)

### Problème : Aucune donnée n'apparaît dans le tableau de bord

**Solution** :
1. Vérifier que les propriétés sont liées au propriétaire
2. Vérifier que les baux sont liés aux propriétés
3. Vérifier que les paiements sont liés aux baux
4. Vérifier que les tickets sont liés aux propriétés

### Problème : Les rapports ne se génèrent pas

**Solution** :
1. Vérifier que les dépendances sont installées (`pdf-lib`, `exceljs`, `csv-writer`)
2. Vérifier les logs du serveur pour les erreurs
3. Vérifier que les données existent pour la période sélectionnée

---

## Conclusion

Ce guide de test couvre toutes les fonctionnalités du portail propriétaire. Utilisez-le pour valider l'implémentation complète et vous assurer que toutes les fonctionnalités fonctionnent correctement.

Pour toute question ou problème, consultez la documentation technique dans `specs/009-owner-portal/`.
