-- ============================================
-- SCRIPT DE CRÉATION DES DONNÉES DE TEST
-- Portail Propriétaire (Owner Portal)
-- ============================================
-- 
-- Ce script crée toutes les données nécessaires pour tester le portail propriétaire.
-- 
-- Compte de test:
-- Email: owner@test.com
-- Mot de passe: Test@123456
--
-- Exécution:
-- psql -U postgres -d immotopia -f seed-owner-portal-test-data.sql
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
-- Hash du mot de passe "Test@123456" avec bcrypt (12 rounds)
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
-- Note: En production, ce serait un autre utilisateur
INSERT INTO tenant_clients (id, tenant_id, user_id, client_type, created_at, updated_at)
VALUES (
  'test-renter-client-id',
  'test-owner-tenant-id',
  'test-owner-user-id',
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
-- 
-- Vérification:
-- SELECT * FROM users WHERE email = 'owner@test.com';
-- SELECT * FROM tenant_clients WHERE user_id = 'test-owner-user-id';
-- SELECT * FROM properties WHERE owner_user_id = 'test-owner-user-id';
-- ============================================
