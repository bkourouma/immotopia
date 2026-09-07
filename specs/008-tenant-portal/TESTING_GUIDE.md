# Guide de Test - Portail Locataire

## Vue d'ensemble

Ce document fournit un guide complet pour tester toutes les fonctionnalités du portail locataire, incluant les données de test nécessaires et les scénarios de test pour chaque page.

## Prérequis

1. **Base de données** : PostgreSQL avec les migrations appliquées
2. **Utilisateur de test** : Un utilisateur avec un compte `TenantClient` lié à un bail actif
3. **Bail actif** : Un `RentalLease` avec le statut `ACTIVE`
4. **Données de test** : Voir section "Données de Test Requises" ci-dessous

---

## Navigation et Menus

### Sidebar - Vérification des Menus

Le sidebar du portail locataire doit contenir les menus suivants (dans l'ordre) :

1. **Tableau de bord** (`/tenant`) - Icône: HomeOutlined
2. **Mon bail** (`/tenant/lease`) - Icône: FileTextOutlined
3. **Paiements** (`/tenant/payments`) - Icône: DollarOutlined
4. **Dépôt de garantie** (`/tenant/deposit`) - Icône: SafetyOutlined
5. **Maintenance** (`/tenant/maintenance`) - Icône: ToolOutlined
6. **Documents** (`/tenant/documents`) - Icône: FolderOutlined

**Vérification** : Tous les menus sont présents dans `apps/web/src/pages/TenantPortal/Layout.tsx`

---

## Données de Test Requises

### 1. Utilisateur et TenantClient

```sql
-- Créer un utilisateur de test
INSERT INTO users (id, email, password_hash, full_name, phone_primary, global_role, email_verified, created_at, updated_at)
VALUES (
  'test-tenant-user-id',
  'locataire@test.com',
  '$2b$10$...', -- Hash du mot de passe "password123"
  'Jean Dupont',
  '+221771234567',
  'USER',
  true,
  NOW(),
  NOW()
);

-- Créer un TenantClient lié à cet utilisateur
INSERT INTO tenant_clients (id, tenant_id, user_id, client_type, created_at, updated_at)
VALUES (
  'test-tenant-client-id',
  'test-tenant-id',
  'test-tenant-user-id',
  'RENTER',
  NOW(),
  NOW()
);
```

### 2. Propriété et Bail Actif

```sql
-- Créer une propriété
INSERT INTO properties (id, tenant_id, internal_reference, address, title, property_type, created_at, updated_at)
VALUES (
  'test-property-id',
  'test-tenant-id',
  'PROP-001',
  '123 Rue de la République, Dakar',
  'Appartement T3',
  'APARTMENT',
  NOW(),
  NOW()
);

-- Créer un bail actif
INSERT INTO rental_leases (
  id, tenant_id, property_id, primary_renter_client_id,
  lease_number, status, start_date, end_date,
  currency, rent_amount, service_charge_amount, security_deposit_amount,
  billing_frequency, due_day_of_month,
  created_at, updated_at
)
VALUES (
  'test-lease-id',
  'test-tenant-id',
  'test-property-id',
  'test-tenant-client-id',
  'BAIL-2024-001',
  'ACTIVE',
  '2024-01-01',
  '2024-12-31',
  'FCFA',
  150000,
  20000,
  300000,
  'MONTHLY',
  5,
  NOW(),
  NOW()
);
```

### 3. Échéances (Installments)

```sql
-- Créer quelques échéances pour le bail
INSERT INTO rental_installments (
  id, tenant_id, lease_id,
  period_year, period_month, due_date,
  amount_rent, amount_service, amount_other_fees,
  amount_paid, status,
  created_at, updated_at
)
VALUES
-- Échéance payée
(
  'installment-paid-id',
  'test-tenant-id',
  'test-lease-id',
  2024, 1, '2024-01-05',
  150000, 20000, 0,
  170000, 'PAID',
  NOW(), NOW()
),
-- Échéance due
(
  'installment-due-id',
  'test-tenant-id',
  'test-lease-id',
  2024, 2, '2024-02-05',
  150000, 20000, 0,
  0, 'DUE',
  NOW(), NOW()
),
-- Échéance partielle
(
  'installment-partial-id',
  'test-tenant-id',
  'test-lease-id',
  2024, 3, '2024-03-05',
  150000, 20000, 0,
  85000, 'PARTIAL',
  NOW(), NOW()
),
-- Échéance en retard
(
  'installment-overdue-id',
  'test-tenant-id',
  'test-lease-id',
  2024, 4, '2024-04-05',
  150000, 20000, 0,
  0, 'OVERDUE',
  NOW(), NOW()
);
```

### 4. Paiements

```sql
-- Créer quelques paiements
INSERT INTO rental_payments (
  id, tenant_id, lease_id, renter_client_id,
  amount, currency, method, status,
  succeeded_at, initiated_at,
  created_at, updated_at
)
VALUES
-- Paiement réussi
(
  'payment-success-id',
  'test-tenant-id',
  'test-lease-id',
  'test-tenant-client-id',
  170000, 'FCFA', 'BANK_TRANSFER', 'SUCCESS',
  '2024-01-10 10:00:00', '2024-01-10 09:00:00',
  NOW(), NOW()
),
-- Paiement mobile money
(
  'payment-mobile-id',
  'test-tenant-id',
  'test-lease-id',
  'test-tenant-client-id',
  85000, 'FCFA', 'MOBILE_MONEY', 'SUCCESS',
  '2024-03-10 14:00:00', '2024-03-10 13:00:00',
  NOW(), NOW()
);

-- Allouer les paiements aux échéances
INSERT INTO rental_payment_allocations (
  id, tenant_id, payment_id, installment_id,
  amount, created_at, updated_at
)
VALUES
(
  'allocation-1-id',
  'test-tenant-id',
  'payment-success-id',
  'installment-paid-id',
  170000,
  NOW(), NOW()
),
(
  'allocation-2-id',
  'test-tenant-id',
  'payment-mobile-id',
  'installment-partial-id',
  85000,
  NOW(), NOW()
);
```

### 5. Dépôt de Garantie

```sql
-- Créer un dépôt de garantie
INSERT INTO rental_security_deposits (
  id, tenant_id, lease_id,
  currency, target_amount, collected_amount,
  held_amount, refunded_amount, forfeited_amount,
  created_at, updated_at
)
VALUES (
  'deposit-id',
  'test-tenant-id',
  'test-lease-id',
  'FCFA',
  300000,
  300000,
  50000,
  0,
  0,
  NOW(),
  NOW()
);

-- Créer quelques mouvements de dépôt
INSERT INTO rental_deposit_movements (
  id, tenant_id, deposit_id,
  type, currency, amount,
  note, created_at, updated_at
)
VALUES
-- Collecte
(
  'movement-collect-id',
  'test-tenant-id',
  'deposit-id',
  'COLLECT',
  'FCFA',
  300000,
  'Dépôt de garantie collecté',
  '2024-01-01 10:00:00',
  NOW()
),
-- Mise en retenue
(
  'movement-hold-id',
  'test-tenant-id',
  'deposit-id',
  'HOLD',
  'FCFA',
  50000,
  'Retenue pour réparations',
  '2024-02-01 10:00:00',
  NOW()
);
```

### 6. Tickets de Maintenance

```sql
-- Créer quelques tickets de maintenance
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
  'test-tenant-id',
  'test-property-id',
  'test-lease-id',
  'test-tenant-client-id',
  'test-tenant-client-id',
  'Fuite d''eau dans la salle de bain',
  'PLUMBING',
  'HIGH',
  'Il y a une fuite d''eau importante sous le lavabo de la salle de bain principale.',
  'DECLARED',
  '2024-01-15 09:00:00',
  NOW(),
  NOW()
),
-- Ticket en cours
(
  'ticket-in-progress-id',
  'test-tenant-id',
  'test-property-id',
  'test-lease-id',
  'test-tenant-client-id',
  'test-tenant-client-id',
  'Problème électrique - Prise défectueuse',
  'ELECTRICITY',
  'MEDIUM',
  'La prise électrique dans la chambre ne fonctionne plus.',
  'IN_PROGRESS',
  '2024-02-01 10:00:00',
  NOW(),
  NOW()
),
-- Ticket résolu
(
  'ticket-resolved-id',
  'test-tenant-id',
  'test-property-id',
  'test-lease-id',
  'test-tenant-client-id',
  'test-tenant-client-id',
  'Climatisation en panne',
  'AC',
  'URGENT',
  'La climatisation ne fonctionne plus depuis hier.',
  'RESOLVED',
  '2024-03-01 11:00:00',
  NOW(),
  NOW()
);

-- Ajouter des commentaires aux tickets
INSERT INTO maintenance_ticket_comments (
  id, tenant_id, ticket_id,
  author_type, content,
  author_contact_id,
  created_at, updated_at
)
VALUES
(
  'comment-1-id',
  'test-tenant-id',
  'ticket-declared-id',
  'TENANT',
  'La fuite semble s''être aggravée ce matin.',
  'test-tenant-client-id',
  '2024-01-16 08:00:00',
  NOW()
);
```

### 7. Documents

```sql
-- Créer quelques documents
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
  'test-tenant-id',
  'test-lease-id',
  'LEASE_CONTRACT',
  '2024-001',
  'Contrat de bail',
  'FINAL',
  '/assets/generated_documents/lease-contract-2024-001.docx',
  '/uploads/documents/lease-contract-2024-001.pdf',
  '2024-01-01',
  'application/pdf',
  NOW(),
  NOW()
),
-- Quittance de loyer
(
  'doc-receipt-id',
  'test-tenant-id',
  'test-lease-id',
  'RENT_RECEIPT',
  '2024-002',
  'Quittance de loyer - Janvier 2024',
  'FINAL',
  '/assets/generated_documents/receipt-2024-002.docx',
  '/uploads/documents/receipt-2024-002.pdf',
  '2024-01-10',
  'application/pdf',
  NOW(),
  NOW()
),
-- Relevé
(
  'doc-statement-id',
  'test-tenant-id',
  'test-lease-id',
  'STATEMENT',
  '2024-003',
  'Relevé de compte - Trimestre 1',
  'FINAL',
  '/assets/generated_documents/statement-2024-003.docx',
  '/uploads/documents/statement-2024-003.pdf',
  '2024-03-31',
  'application/pdf',
  NOW(),
  NOW()
);
```

---

## Pages et Scénarios de Test

### Page 1: Tableau de bord (`/tenant`)

**Route** : `/tenant`  
**Composant** : `TenantDashboard`  
**Fichier** : `apps/web/src/pages/TenantPortal/Dashboard.tsx`

#### Éléments à vérifier :

1. **En-tête de page**
   - Titre "Tableau de bord"
   - Sous-titre "Vue d'overview de votre situation locative"

2. **Carte "Informations du bail"**
   - Adresse de la propriété
   - Montant du loyer mensuel
   - Montant des charges
   - Dates de début et fin
   - Statut du bail (badge coloré)

3. **Cartes statistiques**
   - **Solde actuel** : Montant avec icône et couleur (vert si créditeur, rouge si débiteur)
   - **Prochaine échéance** : Montant, date d'échéance, période
   - **Dépôt de garantie** : Montant retenu vs montant total

4. **Section "Paiements récents"**
   - Liste des 5 derniers paiements
   - Montant, méthode, date pour chaque paiement

5. **Section "Résumé maintenance"**
   - Total de tickets
   - Tickets ouverts
   - Tickets en cours
   - Tickets résolus

#### Données de test attendues :

- Bail actif avec propriété "123 Rue de la République, Dakar"
- Loyer : 150 000 FCFA
- Charges : 20 000 FCFA
- Solde actuel : Calculé automatiquement
- Prochaine échéance : Échéance avec statut DUE la plus proche
- 5 paiements récents affichés
- Résumé maintenance avec compteurs

---

### Page 2: Mon bail (`/tenant/lease`)

**Route** : `/tenant/lease`  
**Composant** : `TenantLease`  
**Fichier** : `apps/web/src/pages/TenantPortal/Lease.tsx`

#### Éléments à vérifier :

1. **En-tête de page**
   - Titre "Mon bail"
   - Sous-titre "Détails complets de votre contrat de location"

2. **Carte "Informations du bail"**
   - Numéro de bail
   - Statut (badge)
   - Propriété (adresse)
   - Date de début
   - Date de fin
   - Date d'emménagement
   - Loyer mensuel
   - Charges
   - Dépôt de garantie
   - Fréquence de facturation
   - Jour d'échéance
   - Devise
   - Notes (si présentes)

3. **Carte "Locataire principal"**
   - Nom complet
   - Email

4. **Carte "Propriétaire"** (si présent)
   - Nom complet
   - Email

5. **Carte "Co-locataires"** (si présents)
   - Liste des co-locataires avec nom et email

6. **Carte "Documents"**
   - Documents groupés par type
   - Pour chaque type : titre, numéro, date d'émission
   - Bouton "Télécharger" pour chaque document

#### Données de test attendues :

- Toutes les informations du bail affichées
- Locataire principal : "Jean Dupont" / "locataire@test.com"
- Documents groupés par type (Contrat de bail, Quittances, Relevés, etc.)

---

### Page 3: Paiements (`/tenant/payments`)

**Route** : `/tenant/payments`  
**Composant** : `TenantPayments`  
**Fichier** : `apps/web/src/pages/TenantPortal/Payments.tsx`

#### Éléments à vérifier :

1. **En-tête de page**
   - Titre "Paiements et échéances"
   - Bouton "Déclarer un paiement"

2. **Cartes statistiques**
   - Total échéances
   - Payées
   - En attente
   - En retard

3. **Filtres**
   - Filtre par statut (Payé, Dû, En retard, Partiel, Brouillon)
   - Filtre par plage de dates
   - Bouton "Réinitialiser"

4. **Onglet "Échéances"**
   - Tableau avec colonnes :
     - Période
     - Date d'échéance
     - Montant total
     - Payé
     - Solde
     - Statut
     - Actions (bouton "Détails")
   - Pagination

5. **Onglet "Historique des paiements"**
   - Filtres : Méthode de paiement, Plage de dates
   - Tableau avec colonnes :
     - Date
     - Montant
     - Méthode
     - Référence
     - Statut
     - Alloué
     - Non alloué
   - Expansion de ligne pour voir les allocations par échéance
   - Carte "Total payé"

6. **Modal "Détails de l'échéance"**
   - Informations complètes de l'échéance
   - Détail des éléments (loyer, charges, autres frais)
   - Pénalités appliquées
   - Historique des paiements avec allocations

7. **Modal "Déclarer un paiement"**
   - Formulaire avec :
     - Montant
     - Date de paiement
     - Méthode de paiement
     - Opérateur mobile (si méthode = MOBILE_MONEY)
     - Référence
     - Justificatif (upload)
     - Notes
   - Validation et soumission

#### Données de test attendues :

- 4 échéances (1 payée, 1 due, 1 partielle, 1 en retard)
- Statistiques : Total: 4, Payées: 1, En attente: 1, En retard: 1
- 2 paiements dans l'historique
- Allocations visibles dans l'expansion des lignes

---

### Page 4: Dépôt de garantie (`/tenant/deposit`)

**Route** : `/tenant/deposit`  
**Composant** : `TenantDeposit`  
**Fichier** : `apps/web/src/pages/TenantPortal/Deposit.tsx`

#### Éléments à vérifier :

1. **En-tête de page**
   - Titre "Dépôt de garantie"
   - Sous-titre "Informations détaillées sur votre dépôt de garantie"

2. **Cartes statistiques**
   - Montant cible
   - Montant collecté
   - Montant retenu
   - Montant disponible

3. **Carte "Détails du dépôt"**
   - Numéro de bail
   - Devise
   - Montant cible
   - Montant collecté
   - Montant retenu
   - Montant remboursé
   - Montant confisqué
   - Montant disponible

4. **Carte "Historique des mouvements"**
   - Tableau avec colonnes :
     - Date
     - Type (avec badge coloré)
     - Montant (avec signe + ou -)
     - Paiement associé
     - Échéance associée
     - Note
     - Créé par
   - Tri par date (plus récent en premier)
   - Pagination

#### Données de test attendues :

- Dépôt avec montant cible : 300 000 FCFA
- Montant collecté : 300 000 FCFA
- Montant retenu : 50 000 FCFA
- Montant disponible : 250 000 FCFA
- 2 mouvements dans l'historique (Collecte, Mise en retenue)

---

### Page 5: Maintenance (`/tenant/maintenance`)

**Route** : `/tenant/maintenance`  
**Composant** : `TenantMaintenance`  
**Fichier** : `apps/web/src/pages/TenantPortal/Maintenance.tsx`

#### Éléments à vérifier :

1. **En-tête de page**
   - Titre "Maintenance"
   - Bouton "Nouvelle demande"

2. **Cartes statistiques**
   - Total tickets
   - Ouverts
   - En cours
   - Résolus

3. **Filtres**
   - Filtre par statut (Déclaré, En cours, Assigné, Résolu, Annulé)
   - Bouton "Réinitialiser"

4. **Tableau des tickets**
   - Colonnes :
     - Titre
     - Catégorie
     - Priorité (badge coloré)
     - Statut (badge coloré)
     - Date de création
     - Actions (bouton "Détails")

5. **Modal "Nouvelle demande de maintenance"**
   - Formulaire avec :
     - Titre
     - Catégorie (Plomberie, Électricité, Climatisation, Autre)
     - Priorité (Basse, Moyenne, Haute, Urgente)
     - Description
     - Détails de localisation (optionnel)
     - Photos (max 10, images uniquement)
   - Validation et soumission

6. **Modal "Détails du ticket"**
   - Informations complètes du ticket
   - Photos en galerie avec preview
   - Section commentaires :
     - Liste des commentaires avec auteur et date
     - Formulaire pour ajouter un commentaire
   - Bouton "Ajouter un commentaire"

#### Données de test attendues :

- 3 tickets (1 déclaré, 1 en cours, 1 résolu)
- Statistiques : Total: 3, Ouverts: 1, En cours: 1, Résolus: 1
- Commentaires visibles dans les détails

---

### Page 6: Documents (`/tenant/documents`)

**Route** : `/tenant/documents`  
**Composant** : `TenantDocuments`  
**Fichier** : `apps/web/src/pages/TenantPortal/Documents.tsx`

#### Éléments à vérifier :

1. **En-tête de page**
   - Titre "Documents"
   - Sous-titre "Accédez et téléchargez vos documents de location"

2. **Filtre**
   - Filtre par type de document
   - Bouton "Réinitialiser"

3. **Documents groupés par type**
   - Pour chaque type :
     - Titre avec icône et compteur
     - Liste des documents avec :
       - Icône de document
       - Titre ou numéro de document
       - Statut (badge)
       - Date d'émission
       - Bouton "Télécharger"
   - Si aucun document : Message "Aucun document trouvé"

#### Données de test attendues :

- 3 documents groupés par type :
  - Contrat de bail (1 document)
  - Quittances de loyer (1 document)
  - Relevés (1 document)
- Boutons de téléchargement fonctionnels

---

## Scénarios de Test Complets

### Scénario 1: Accès au Portail

**Prérequis** : Utilisateur connecté avec un compte TenantClient lié à un bail actif

**Étapes** :
1. Se connecter avec `locataire@test.com` / `password123`
2. Accéder à `/tenant`
3. Vérifier que le sidebar s'affiche avec tous les menus
4. Vérifier que le tableau de bord se charge avec les données

**Résultat attendu** :
- Sidebar visible avec 6 menus
- Tableau de bord affiche les informations du bail
- Pas d'erreur 403 ou 404

---

### Scénario 2: Navigation entre les Pages

**Étapes** :
1. Cliquer sur chaque menu du sidebar
2. Vérifier que la page correspondante se charge
3. Vérifier que le menu actif est surligné

**Résultat attendu** :
- Toutes les pages se chargent sans erreur
- Le menu actif est visuellement distinct
- Les données s'affichent correctement

---

### Scénario 3: Déclarer un Paiement

**Étapes** :
1. Aller sur `/tenant/payments`
2. Cliquer sur "Déclarer un paiement"
3. Remplir le formulaire :
   - Montant : 100000
   - Date : Date d'aujourd'hui
   - Méthode : Mobile Money
   - Opérateur : Orange
   - Référence : TEST-REF-001
   - Uploader un justificatif (image ou PDF)
4. Soumettre le formulaire

**Résultat attendu** :
- Message de succès affiché
- La déclaration est créée avec le statut PENDING
- Le formulaire se réinitialise
- La liste des paiements se met à jour

---

### Scénario 4: Créer un Ticket de Maintenance

**Étapes** :
1. Aller sur `/tenant/maintenance`
2. Cliquer sur "Nouvelle demande"
3. Remplir le formulaire :
   - Titre : "Test de ticket"
   - Catégorie : Plomberie
   - Priorité : Haute
   - Description : "Description détaillée du problème"
   - Uploader 2-3 photos
4. Soumettre le formulaire

**Résultat attendu** :
- Message de succès affiché
- Le ticket est créé avec le statut DECLARED
- Le ticket apparaît dans la liste
- Les photos sont uploadées et visibles

---

### Scénario 5: Ajouter un Commentaire à un Ticket

**Étapes** :
1. Aller sur `/tenant/maintenance`
2. Cliquer sur "Détails" d'un ticket
3. Dans la section commentaires, saisir un commentaire
4. Cliquer sur "Ajouter un commentaire"

**Résultat attendu** :
- Message de succès affiché
- Le commentaire apparaît dans la liste
- Le commentaire affiche l'auteur (locataire) et la date

---

### Scénario 6: Télécharger un Document

**Étapes** :
1. Aller sur `/tenant/documents`
2. Cliquer sur "Télécharger" pour un document
3. Vérifier que le téléchargement démarre

**Résultat attendu** :
- Le fichier PDF se télécharge
- Le nom du fichier est correct
- Le fichier est valide et lisible

---

### Scénario 7: Filtrer les Échéances

**Étapes** :
1. Aller sur `/tenant/payments`
2. Dans l'onglet "Échéances", sélectionner le filtre "En retard"
3. Vérifier que seules les échéances en retard s'affichent
4. Réinitialiser le filtre

**Résultat attendu** :
- Le filtre fonctionne correctement
- Seules les échéances correspondantes sont affichées
- Le bouton "Réinitialiser" restaure tous les résultats

---

### Scénario 8: Voir les Détails d'une Échéance

**Étapes** :
1. Aller sur `/tenant/payments`
2. Cliquer sur "Détails" d'une échéance
3. Vérifier les informations affichées :
   - Détails de l'échéance
   - Détail des éléments
   - Historique des paiements

**Résultat attendu** :
- Modal s'ouvre avec toutes les informations
- Les allocations sont visibles
- Les montants sont corrects

---

## Checklist de Test

### Fonctionnalités Core

- [ ] Accès au portail avec authentification
- [ ] Sidebar avec tous les menus
- [ ] Navigation entre les pages
- [ ] Affichage des données sur chaque page
- [ ] Filtres fonctionnels
- [ ] Pagination fonctionnelle

### Dashboard

- [ ] Informations du bail affichées
- [ ] Solde actuel calculé correctement
- [ ] Prochaine échéance identifiée
- [ ] Paiements récents affichés
- [ ] Résumé maintenance correct

### Bail

- [ ] Toutes les informations du bail
- [ ] Locataire principal affiché
- [ ] Propriétaire affiché (si présent)
- [ ] Co-locataires listés
- [ ] Documents groupés par type

### Paiements

- [ ] Liste des échéances avec filtres
- [ ] Statistiques correctes
- [ ] Historique des paiements
- [ ] Allocations visibles
- [ ] Déclaration de paiement fonctionnelle
- [ ] Upload de justificatif fonctionnel

### Dépôt de Garantie

- [ ] Montants affichés correctement
- [ ] Historique des mouvements
- [ ] Types de mouvements avec badges colorés

### Maintenance

- [ ] Liste des tickets avec filtres
- [ ] Statistiques correctes
- [ ] Création de ticket fonctionnelle
- [ ] Upload de photos fonctionnel
- [ ] Détails du ticket avec photos
- [ ] Ajout de commentaire fonctionnel

### Documents

- [ ] Documents groupés par type
- [ ] Filtre par type fonctionnel
- [ ] Téléchargement fonctionnel

---

## Données de Test SQL Complètes

Pour faciliter les tests, voici un script SQL complet à exécuter :

```sql
-- ============================================
-- SCRIPT DE DONNÉES DE TEST - PORTAL LOCATAIRE
-- ============================================

-- 1. Créer l'utilisateur
INSERT INTO users (id, email, password_hash, full_name, phone_primary, global_role, email_verified, created_at, updated_at)
VALUES (
  'test-tenant-user-id',
  'locataire@test.com',
  '$2b$10$rQ8K8K8K8K8K8K8K8K8K8K8K8K8K8K8K8K8K8K8K8K8K8K8K8K8K', -- Hash pour "password123"
  'Jean Dupont',
  '+221771234567',
  'USER',
  true,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- 2. Créer le TenantClient
INSERT INTO tenant_clients (id, tenant_id, user_id, client_type, created_at, updated_at)
VALUES (
  'test-tenant-client-id',
  'test-tenant-id',
  'test-tenant-user-id',
  'RENTER',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- 3. Créer la propriété
INSERT INTO properties (id, tenant_id, internal_reference, address, title, property_type, created_at, updated_at)
VALUES (
  'test-property-id',
  'test-tenant-id',
  'PROP-001',
  '123 Rue de la République, Dakar',
  'Appartement T3',
  'APARTMENT',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- 4. Créer le bail actif
INSERT INTO rental_leases (
  id, tenant_id, property_id, primary_renter_client_id,
  lease_number, status, start_date, end_date,
  currency, rent_amount, service_charge_amount, security_deposit_amount,
  billing_frequency, due_day_of_month,
  created_at, updated_at
)
VALUES (
  'test-lease-id',
  'test-tenant-id',
  'test-property-id',
  'test-tenant-client-id',
  'BAIL-2024-001',
  'ACTIVE',
  '2024-01-01',
  '2024-12-31',
  'FCFA',
  150000,
  20000,
  300000,
  'MONTHLY',
  5,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- 5. Créer les échéances
INSERT INTO rental_installments (
  id, tenant_id, lease_id,
  period_year, period_month, due_date,
  amount_rent, amount_service, amount_other_fees,
  amount_paid, status,
  created_at, updated_at
)
VALUES
('installment-paid-id', 'test-tenant-id', 'test-lease-id', 2024, 1, '2024-01-05', 150000, 20000, 0, 170000, 'PAID', NOW(), NOW()),
('installment-due-id', 'test-tenant-id', 'test-lease-id', 2024, 2, '2024-02-05', 150000, 20000, 0, 0, 'DUE', NOW(), NOW()),
('installment-partial-id', 'test-tenant-id', 'test-lease-id', 2024, 3, '2024-03-05', 150000, 20000, 0, 85000, 'PARTIAL', NOW(), NOW()),
('installment-overdue-id', 'test-tenant-id', 'test-lease-id', 2024, 4, '2024-04-05', 150000, 20000, 0, 0, 'OVERDUE', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 6. Créer les paiements
INSERT INTO rental_payments (
  id, tenant_id, lease_id, renter_client_id,
  amount, currency, method, status,
  succeeded_at, initiated_at,
  created_at, updated_at
)
VALUES
('payment-success-id', 'test-tenant-id', 'test-lease-id', 'test-tenant-client-id', 170000, 'FCFA', 'BANK_TRANSFER', 'SUCCESS', '2024-01-10 10:00:00', '2024-01-10 09:00:00', NOW(), NOW()),
('payment-mobile-id', 'test-tenant-id', 'test-lease-id', 'test-tenant-client-id', 85000, 'FCFA', 'MOBILE_MONEY', 'SUCCESS', '2024-03-10 14:00:00', '2024-03-10 13:00:00', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 7. Allouer les paiements
INSERT INTO rental_payment_allocations (
  id, tenant_id, payment_id, installment_id,
  amount, created_at, updated_at
)
VALUES
('allocation-1-id', 'test-tenant-id', 'payment-success-id', 'installment-paid-id', 170000, NOW(), NOW()),
('allocation-2-id', 'test-tenant-id', 'payment-mobile-id', 'installment-partial-id', 85000, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 8. Créer le dépôt de garantie
INSERT INTO rental_security_deposits (
  id, tenant_id, lease_id,
  currency, target_amount, collected_amount,
  held_amount, refunded_amount, forfeited_amount,
  created_at, updated_at
)
VALUES (
  'deposit-id',
  'test-tenant-id',
  'test-lease-id',
  'FCFA',
  300000,
  300000,
  50000,
  0,
  0,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- 9. Créer les mouvements de dépôt
INSERT INTO rental_deposit_movements (
  id, tenant_id, deposit_id,
  type, currency, amount,
  note, created_at, updated_at
)
VALUES
('movement-collect-id', 'test-tenant-id', 'deposit-id', 'COLLECT', 'FCFA', 300000, 'Dépôt de garantie collecté', '2024-01-01 10:00:00', NOW()),
('movement-hold-id', 'test-tenant-id', 'deposit-id', 'HOLD', 'FCFA', 50000, 'Retenue pour réparations', '2024-02-01 10:00:00', NOW())
ON CONFLICT (id) DO NOTHING;

-- 10. Créer les tickets de maintenance
INSERT INTO maintenance_tickets (
  id, tenant_id, property_id, lease_id,
  tenant_contact_id, created_by_contact_id,
  title, category, priority, description,
  status, declared_at,
  created_at, updated_at
)
VALUES
('ticket-declared-id', 'test-tenant-id', 'test-property-id', 'test-lease-id', 'test-tenant-client-id', 'test-tenant-client-id', 'Fuite d''eau dans la salle de bain', 'PLUMBING', 'HIGH', 'Il y a une fuite d''eau importante sous le lavabo de la salle de bain principale.', 'DECLARED', '2024-01-15 09:00:00', NOW(), NOW()),
('ticket-in-progress-id', 'test-tenant-id', 'test-property-id', 'test-lease-id', 'test-tenant-client-id', 'test-tenant-client-id', 'Problème électrique - Prise défectueuse', 'ELECTRICITY', 'MEDIUM', 'La prise électrique dans la chambre ne fonctionne plus.', 'IN_PROGRESS', '2024-02-01 10:00:00', NOW(), NOW()),
('ticket-resolved-id', 'test-tenant-id', 'test-property-id', 'test-lease-id', 'test-tenant-client-id', 'test-tenant-client-id', 'Climatisation en panne', 'AC', 'URGENT', 'La climatisation ne fonctionne plus depuis hier.', 'RESOLVED', '2024-03-01 11:00:00', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 11. Créer les commentaires
INSERT INTO maintenance_ticket_comments (
  id, tenant_id, ticket_id,
  author_type, content,
  author_contact_id,
  created_at, updated_at
)
VALUES
('comment-1-id', 'test-tenant-id', 'ticket-declared-id', 'TENANT', 'La fuite semble s''être aggravée ce matin.', 'test-tenant-client-id', '2024-01-16 08:00:00', NOW())
ON CONFLICT (id) DO NOTHING;

-- 12. Créer les documents
INSERT INTO rental_documents (
  id, tenant_id, lease_id,
  type, document_number, title,
  status, file_path, file_url,
  issued_at, mime_type,
  created_at, updated_at
)
VALUES
('doc-lease-contract-id', 'test-tenant-id', 'test-lease-id', 'LEASE_CONTRACT', '2024-001', 'Contrat de bail', 'FINAL', '/assets/generated_documents/lease-contract-2024-001.docx', '/uploads/documents/lease-contract-2024-001.pdf', '2024-01-01', 'application/pdf', NOW(), NOW()),
('doc-receipt-id', 'test-tenant-id', 'test-lease-id', 'RENT_RECEIPT', '2024-002', 'Quittance de loyer - Janvier 2024', 'FINAL', '/assets/generated_documents/receipt-2024-002.docx', '/uploads/documents/receipt-2024-002.pdf', '2024-01-10', 'application/pdf', NOW(), NOW()),
('doc-statement-id', 'test-tenant-id', 'test-lease-id', 'STATEMENT', '2024-003', 'Relevé de compte - Trimestre 1', 'FINAL', '/assets/generated_documents/statement-2024-003.docx', '/uploads/documents/statement-2024-003.pdf', '2024-03-31', 'application/pdf', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
```

---

## Notes Importantes

1. **IDs de test** : Les IDs utilisés dans ce guide sont des exemples. Assurez-vous d'utiliser des UUIDs valides ou de laisser la base de données les générer automatiquement.

2. **Mot de passe** : Le hash du mot de passe doit être généré avec bcrypt. Pour tester, vous pouvez utiliser un hash connu ou créer l'utilisateur via l'interface d'inscription.

3. **Fichiers** : Les fichiers de documents doivent exister physiquement dans les chemins spécifiés pour que le téléchargement fonctionne.

4. **Dates** : Ajustez les dates selon la date actuelle pour que les tests soient pertinents (échéances futures, paiements récents, etc.).

5. **Tenant ID** : Remplacez `'test-tenant-id'` par l'ID réel de votre tenant dans la base de données.

---

## Problèmes Courants et Solutions

### Problème : Erreur 403 "Accès portail locataire refusé"

**Cause** : L'utilisateur n'a pas de TenantClient ou n'a pas de bail actif.

**Solution** : Vérifier que :
- L'utilisateur a un TenantClient lié
- Le TenantClient est lié à un bail avec statut ACTIVE

### Problème : Aucune donnée affichée

**Cause** : Pas de données de test dans la base de données.

**Solution** : Exécuter le script SQL de données de test ci-dessus.

### Problème : Erreur lors du téléchargement de document

**Cause** : Le fichier n'existe pas physiquement.

**Solution** : Créer les fichiers de test ou utiliser des fichiers existants.

---

## Conclusion

Ce guide de test couvre toutes les fonctionnalités du portail locataire. Utilisez-le pour valider que toutes les User Stories fonctionnent correctement et que l'expérience utilisateur est fluide.

Pour toute question ou problème, référez-vous aux logs du serveur et aux messages d'erreur dans la console du navigateur.
