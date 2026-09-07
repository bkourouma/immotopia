# Guide de Test - Module Maintenance & Incidents Locatifs

**Date de création**: 2025-01-28  
**Version**: 1.0  
**Module**: Maintenance & Rental Incidents

---

## Table des matières

1. [Prérequis](#prérequis)
2. [Données de test](#données-de-test)
3. [Tests Interface Locataire](#tests-interface-locataire)
4. [Tests Interface Gestionnaire](#tests-interface-gestionnaire)
5. [Tests Gestion des Prestataires](#tests-gestion-des-prestataires)
6. [Scénario End-to-End Complet](#scénario-end-to-end-complet)
7. [Tests de Sécurité](#tests-de-sécurité)
8. [Tests de Performance](#tests-de-performance)
9. [Checklist de Validation](#checklist-de-validation)

---

## Prérequis

### 1. Configuration de l'environnement

- ✅ Base de données PostgreSQL configurée et accessible
- ✅ Variables d'environnement configurées (`.env` dans `packages/api/`)
- ✅ Backend API démarré (`npm run dev` dans `packages/api/`)
- ✅ Frontend démarré (`npm start` dans `apps/web/`)
- ✅ Seed de données exécuté : `npm run db:seed:maintenance` (optionnel)

### 2. Comptes de test requis

**Locataire (Tenant Contact)**:
- Email: `locataire@test.com` (ou un contact CRM existant avec type RENTER)
- Doit avoir un bail actif (`RentalLease` avec status `ACTIVE`)
- Doit être lié à une propriété

**Gestionnaire (Manager)**:
- Email: `manager@test.com` (ou un utilisateur avec permission `MAINTENANCE_ADMIN`)
- Doit être membre du tenant avec rôle approprié

### 3. Données prérequises

- ✅ Au moins un tenant actif
- ✅ Au moins une propriété liée au tenant
- ✅ Au moins un bail actif pour la propriété
- ✅ Au moins un contact CRM de type RENTER

---

## Données de test

### Propriété de test

```
- Référence interne: PROP-2025-000001
- Adresse: 123 Rue de la République, 75001 Paris
- Type: APARTMENT
- Statut: AVAILABLE
```

### Bail de test

```
- Numéro: BAIL-2025-0001
- Propriété: PROP-2025-000001
- Locataire: Contact CRM (type RENTER)
- Statut: ACTIVE
- Date début: 2025-01-01
- Date fin: 2025-12-31
```

### Prestataire de test

```
- Nom: Plomberie Express
- Téléphone: +33 1 23 45 67 89
- Email: contact@plomberie-express.fr
- Spécialités: Plomberie, Chauffage, Sanitaires
- Statut: Actif
```

---

## Tests Interface Locataire

### Test 1 : Création d'un ticket de maintenance

**Objectif**: Vérifier qu'un locataire peut créer un ticket de maintenance

**Étapes**:

1. **Se connecter en tant que locataire**
   - URL: `http://localhost:3000/login`
   - Email: `locataire@test.com`
   - Mot de passe: (selon votre configuration)

2. **Naviguer vers la page de création de ticket**
   - URL: `http://localhost:3000/tenant/{tenantId}/maintenance/tickets/new`
   - Ou via le menu: Maintenance → Nouveau ticket

3. **Remplir le formulaire**
   ```
   Titre: Fuite d'eau dans la salle de bain
   Catégorie: Plomberie
   Priorité: Élevée
   Description: Fuite importante sous le lavabo de la salle de bain principale. 
                L'eau s'écoule sur le sol et risque d'endommager le parquet.
   Détails de localisation: Salle de bain principale, premier étage, sous le lavabo
   Propriété: [Sélectionner la propriété de test]
   Bail: [Sélectionner le bail actif si disponible]
   ```

4. **Uploader une pièce jointe (optionnel)**
   - Cliquer sur "Ajouter des fichiers"
   - Sélectionner une image (JPG, PNG) ou un PDF
   - Vérifier que le fichier apparaît dans la liste
   - Taille max: 10 MB
   - Nombre max: 5 fichiers

5. **Soumettre le formulaire**
   - Cliquer sur "Créer le ticket"
   - Vérifier le message de succès
   - Vérifier la redirection vers la page de détail du ticket

**Résultats attendus**:
- ✅ Ticket créé avec succès
- ✅ Statut initial: "Déclaré"
- ✅ Pièce jointe uploadée (si fournie)
- ✅ Email de notification envoyé aux gestionnaires
- ✅ Ticket visible dans la liste des tickets du locataire

**Vérifications API**:
```bash
# Vérifier la création via API
GET /api/tenants/{tenantId}/maintenance/tenant/tickets
# Doit retourner le nouveau ticket avec status DECLARED
```

---

### Test 2 : Consultation d'un ticket

**Objectif**: Vérifier l'affichage complet des détails d'un ticket

**Étapes**:

1. **Accéder à la liste des tickets**
   - URL: `http://localhost:3000/tenant/{tenantId}/maintenance/tickets`

2. **Cliquer sur un ticket**
   - Vérifier l'affichage de tous les détails

**Résultats attendus**:
- ✅ Informations du ticket affichées (titre, catégorie, priorité, description)
- ✅ Statut affiché avec badge coloré
- ✅ Timeline des statuts visible
- ✅ Pièces jointes affichées avec possibilité de téléchargement
- ✅ Commentaires affichés dans l'ordre chronologique
- ✅ Bouton "Annuler" visible si statut = "Déclaré"

**Vérifications**:
- Timeline montre "Déclaré" avec date de création
- Pièces jointes cliquables et téléchargeables
- Commentaires avec auteur et date

---

### Test 3 : Ajout d'un commentaire

**Objectif**: Vérifier qu'un locataire peut ajouter un commentaire

**Étapes**:

1. **Accéder à un ticket existant**
   - URL: `http://localhost:3000/tenant/{tenantId}/maintenance/tickets/{ticketId}`

2. **Ajouter un commentaire**
   - Saisir du texte dans le champ "Ajouter un commentaire"
   - Exemple: "La fuite semble s'être aggravée. Merci d'intervenir rapidement."
   - Cliquer sur "Envoyer"

**Résultats attendus**:
- ✅ Commentaire ajouté et affiché immédiatement
- ✅ Auteur: "Vous" (ou nom du locataire)
- ✅ Date et heure affichées
- ✅ Commentaire visible dans le thread

**Vérifications API**:
```bash
# Vérifier le commentaire via API
GET /api/tenants/{tenantId}/maintenance/tenant/tickets/{ticketId}
# Doit inclure le nouveau commentaire avec authorType TENANT
```

---

### Test 4 : Upload de pièce jointe

**Objectif**: Vérifier l'upload de fichiers sur un ticket existant

**Étapes**:

1. **Accéder à un ticket existant**
   - URL: `http://localhost:3000/tenant/{tenantId}/maintenance/tickets/{ticketId}`

2. **Uploader une pièce jointe**
   - Cliquer sur "Ajouter des fichiers"
   - Sélectionner un fichier (image ou PDF)
   - Vérifier la validation côté client (type, taille)

3. **Vérifier l'upload**
   - Attendre la confirmation
   - Vérifier l'apparition dans la liste des pièces jointes

**Résultats attendus**:
- ✅ Fichier uploadé avec succès
- ✅ Nom du fichier original affiché
- ✅ Taille du fichier affichée
- ✅ Pour les images: prévisualisation affichée
- ✅ Lien de téléchargement fonctionnel

**Tests de validation**:
- ❌ Fichier > 10 MB → Erreur affichée
- ❌ Type de fichier non autorisé → Erreur affichée
- ❌ Plus de 5 fichiers → Erreur affichée

---

### Test 5 : Annulation d'un ticket

**Objectif**: Vérifier qu'un locataire peut annuler un ticket "Déclaré"

**Étapes**:

1. **Accéder à un ticket avec statut "Déclaré"**
   - URL: `http://localhost:3000/tenant/{tenantId}/maintenance/tickets/{ticketId}`

2. **Annuler le ticket**
   - Cliquer sur le bouton "Annuler le ticket"
   - Confirmer l'annulation dans la modal

**Résultats attendus**:
- ✅ Ticket annulé avec succès
- ✅ Statut changé à "Annulé"
- ✅ Timeline mise à jour avec le changement de statut
- ✅ Bouton "Annuler" disparaît
- ✅ Ticket reste visible dans la liste mais avec statut "Annulé"

**Vérifications**:
- Timeline montre la transition: "Déclaré" → "Annulé"
- Date d'annulation enregistrée

---

### Test 6 : Filtrage et recherche

**Objectif**: Vérifier les filtres sur la liste des tickets

**Étapes**:

1. **Accéder à la liste des tickets**
   - URL: `http://localhost:3000/tenant/{tenantId}/maintenance/tickets`

2. **Tester les filtres**
   - Filtrer par statut: "Déclaré", "En cours", "Résolu", "Annulé"
   - Filtrer par propriété (si plusieurs propriétés)
   - Vérifier la pagination (si plus de 20 tickets)

**Résultats attendus**:
- ✅ Filtres fonctionnent correctement
- ✅ Liste mise à jour selon les filtres
- ✅ Pagination fonctionnelle
- ✅ Compteur de tickets affiché

---

## Tests Interface Gestionnaire

### Test 7 : Consultation de tous les tickets

**Objectif**: Vérifier que le gestionnaire voit tous les tickets du tenant

**Étapes**:

1. **Se connecter en tant que gestionnaire**
   - URL: `http://localhost:3000/login`
   - Email: `manager@test.com`
   - Mot de passe: (selon votre configuration)

2. **Accéder à la liste des tickets**
   - URL: `http://localhost:3000/tenant/{tenantId}/admin/maintenance/tickets`

**Résultats attendus**:
- ✅ Tous les tickets du tenant affichés (pas seulement ceux du gestionnaire)
- ✅ Tableau avec colonnes: Titre, Propriété, Statut, Priorité, Prestataire, Date
- ✅ Filtres avancés disponibles

---

### Test 8 : Filtres avancés (Gestionnaire)

**Objectif**: Vérifier les filtres avancés pour les gestionnaires

**Étapes**:

1. **Accéder à la liste des tickets (gestionnaire)**
   - URL: `http://localhost:3000/tenant/{tenantId}/admin/maintenance/tickets`

2. **Tester chaque filtre**
   - **Propriété**: Sélectionner une propriété spécifique
   - **Statut**: Filtrer par statut (Déclaré, En cours, Assigné, Résolu, Annulé)
   - **Priorité**: Filtrer par priorité (Faible, Moyenne, Élevée, Urgente)
   - **Prestataire**: Filtrer par prestataire assigné
   - **Date**: Sélectionner une plage de dates (date de création)

3. **Combiner plusieurs filtres**
   - Appliquer plusieurs filtres simultanément
   - Vérifier que les résultats correspondent

**Résultats attendus**:
- ✅ Chaque filtre fonctionne individuellement
- ✅ Combinaison de filtres fonctionne correctement
- ✅ Liste mise à jour en temps réel
- ✅ Compteur de résultats affiché

---

### Test 9 : Mise à jour du statut d'un ticket

**Objectif**: Vérifier que le gestionnaire peut changer le statut d'un ticket

**Étapes**:

1. **Accéder au détail d'un ticket**
   - URL: `http://localhost:3000/tenant/{tenantId}/admin/maintenance/tickets/{ticketId}`

2. **Changer le statut**
   - Cliquer sur le sélecteur de statut
   - Sélectionner un nouveau statut valide
   - Exemple: "Déclaré" → "En cours"

3. **Vérifier les transitions valides**
   - Tester toutes les transitions possibles selon le workflow

**Résultats attendus**:
- ✅ Statut mis à jour avec succès
- ✅ Timeline mise à jour avec le changement
- ✅ Email de notification envoyé au locataire
- ✅ Transitions invalides bloquées (ex: "Résolu" → "Déclaré")

**Workflow de statuts valides**:
```
DECLARED → IN_PROGRESS → ASSIGNED → RESOLVED
DECLARED → CANCELED
ASSIGNED → IN_PROGRESS → RESOLVED
```

**Vérifications API**:
```bash
# Vérifier le changement de statut
PATCH /api/tenants/{tenantId}/maintenance/admin/tickets/{ticketId}
Body: { "status": "IN_PROGRESS" }
# Doit retourner le ticket avec le nouveau statut
```

---

### Test 10 : Assignation d'un prestataire

**Objectif**: Vérifier l'assignation d'un prestataire à un ticket

**Étapes**:

1. **Accéder au détail d'un ticket**
   - URL: `http://localhost:3000/tenant/{tenantId}/admin/maintenance/tickets/{ticketId}`

2. **Assigner un prestataire**
   - Cliquer sur le sélecteur "Prestataire"
   - Sélectionner un prestataire actif
   - Sauvegarder

**Résultats attendus**:
- ✅ Prestataire assigné avec succès
- ✅ Prestataire affiché dans les détails du ticket
- ✅ Si ticket était "En cours", transition automatique vers "Assigné"
- ✅ Seuls les prestataires actifs sont proposés

**Vérifications**:
- Prestataire inactif ne peut pas être assigné
- Transition automatique de statut si applicable

---

### Test 11 : Modification de la priorité

**Objectif**: Vérifier la modification de la priorité d'un ticket

**Étapes**:

1. **Accéder au détail d'un ticket**
   - URL: `http://localhost:3000/tenant/{tenantId}/admin/maintenance/tickets/{ticketId}`

2. **Modifier la priorité**
   - Cliquer sur le sélecteur "Priorité"
   - Changer la priorité (ex: "Moyenne" → "Urgente")
   - Sauvegarder

**Résultats attendus**:
- ✅ Priorité mise à jour
- ✅ Badge de priorité mis à jour avec la couleur appropriée
- ✅ Changement visible dans la liste des tickets

---

### Test 12 : Ajout de notes de résolution

**Objectif**: Vérifier l'ajout de notes de résolution

**Étapes**:

1. **Accéder au détail d'un ticket**
   - URL: `http://localhost:3000/tenant/{tenantId}/admin/maintenance/tickets/{ticketId}`

2. **Ajouter des notes de résolution**
   - Remplir le champ "Notes de résolution"
   - Exemple: "Robinet réparé avec remplacement du joint. Test effectué, plus de fuite."
   - Sauvegarder

**Résultats attendus**:
- ✅ Notes enregistrées
- ✅ Notes affichées dans la section appropriée
- ✅ Notes visibles lors de la consultation ultérieure

---

### Test 13 : Ajout d'un commentaire (Gestionnaire)

**Objectif**: Vérifier que le gestionnaire peut ajouter un commentaire

**Étapes**:

1. **Accéder au détail d'un ticket**
   - URL: `http://localhost:3000/tenant/{tenantId}/admin/maintenance/tickets/{ticketId}`

2. **Ajouter un commentaire**
   - Saisir un commentaire dans le champ prévu
   - Exemple: "Prestataire contacté. Intervention prévue demain matin entre 9h et 12h."
   - Cliquer sur "Envoyer"

**Résultats attendus**:
- ✅ Commentaire ajouté avec succès
- ✅ Auteur identifié comme "Gestionnaire" (ou nom de l'utilisateur)
- ✅ Commentaire visible dans le thread
- ✅ Locataire peut voir le commentaire du gestionnaire

---

### Test 14 : Historique de maintenance par propriété

**Objectif**: Vérifier l'affichage de l'historique de maintenance pour une propriété

**Étapes**:

1. **Accéder à la fiche d'une propriété**
   - URL: `http://localhost:3000/tenant/{tenantId}/properties/{propertyId}`

2. **Ouvrir l'onglet "Maintenance"**
   - Cliquer sur l'onglet "Maintenance" dans la fiche propriété

**Résultats attendus**:
- ✅ Liste de tous les tickets de maintenance pour cette propriété
- ✅ Filtres par statut et catégorie disponibles
- ✅ Tableau avec colonnes: Titre, Catégorie, Statut, Priorité, Date
- ✅ Clic sur un ticket → redirection vers le détail

**Vérifications API**:
```bash
# Vérifier l'historique via API
GET /api/tenants/{tenantId}/maintenance/admin/properties/{propertyId}/maintenance
# Doit retourner tous les tickets de la propriété
```

---

## Tests Gestion des Prestataires

### Test 15 : Liste des prestataires

**Objectif**: Vérifier l'affichage de la liste des prestataires

**Étapes**:

1. **Accéder à la gestion des prestataires**
   - URL: `http://localhost:3000/tenant/{tenantId}/admin/maintenance/vendors`

**Résultats attendus**:
- ✅ Liste de tous les prestataires du tenant
- ✅ Colonnes: Nom, Téléphone, Email, Spécialités, Statut, Actions
- ✅ Bouton "Nouveau prestataire" visible

---

### Test 16 : Création d'un prestataire

**Objectif**: Vérifier la création d'un nouveau prestataire

**Étapes**:

1. **Accéder à la gestion des prestataires**
   - URL: `http://localhost:3000/tenant/{tenantId}/admin/maintenance/vendors`

2. **Créer un nouveau prestataire**
   - Cliquer sur "Nouveau prestataire"
   - Remplir le formulaire:
     ```
     Nom: Électricité Pro
     Téléphone: +33 1 98 76 54 32
     Email: info@electricite-pro.fr
     Adresse: 456 Avenue des Champs, 69001 Lyon
     Spécialités: Électricité, Éclairage, Tableaux électriques
     ```
   - Cliquer sur "Créer"

**Résultats attendus**:
- ✅ Prestataire créé avec succès
- ✅ Statut par défaut: "Actif"
- ✅ Prestataire visible dans la liste
- ✅ Prestataire disponible pour assignation aux tickets

**Tests de validation**:
- ❌ Nom vide → Erreur
- ❌ Nom < 2 caractères → Erreur
- ❌ Nom en double → Erreur (conflit)
- ❌ Email invalide → Erreur

---

### Test 17 : Modification d'un prestataire

**Objectif**: Vérifier la modification d'un prestataire existant

**Étapes**:

1. **Accéder à la gestion des prestataires**
   - URL: `http://localhost:3000/tenant/{tenantId}/admin/maintenance/vendors`

2. **Modifier un prestataire**
   - Cliquer sur "Modifier" pour un prestataire
   - Modifier les informations (ex: ajouter une spécialité)
   - Sauvegarder

**Résultats attendus**:
- ✅ Modifications enregistrées
- ✅ Changements visibles dans la liste
- ✅ Prestataire toujours disponible pour assignation

---

### Test 18 : Désactivation d'un prestataire

**Objectif**: Vérifier la désactivation d'un prestataire

**Étapes**:

1. **Accéder à la gestion des prestataires**
   - URL: `http://localhost:3000/tenant/{tenantId}/admin/maintenance/vendors`

2. **Désactiver un prestataire**
   - Cliquer sur "Désactiver" pour un prestataire actif
   - Confirmer dans la modal

**Résultats attendus**:
- ✅ Prestataire désactivé (statut → "Inactif")
- ✅ Prestataire ne peut plus être assigné aux nouveaux tickets
- ✅ Si prestataire assigné à des tickets actifs → Erreur (protection)

**Tests de protection**:
- ❌ Désactiver un prestataire assigné à un ticket actif → Erreur avec message explicite

---

### Test 19 : Recherche et filtres (Prestataires)

**Objectif**: Vérifier la recherche et les filtres sur les prestataires

**Étapes**:

1. **Accéder à la gestion des prestataires**
   - URL: `http://localhost:3000/tenant/{tenantId}/admin/maintenance/vendors`

2. **Tester la recherche**
   - Rechercher par nom: "Plomberie"
   - Rechercher par spécialité: "Électricité"

3. **Tester les filtres**
   - Filtrer par statut: "Actifs" ou "Inactifs"

**Résultats attendus**:
- ✅ Recherche fonctionne (nom et spécialités)
- ✅ Filtres fonctionnent correctement
- ✅ Liste mise à jour en temps réel

---

## Scénario End-to-End Complet

### Scénario : Cycle de vie complet d'un ticket de maintenance

**Objectif**: Tester le processus complet depuis la création jusqu'à la résolution

**Durée estimée**: 15-20 minutes

---

#### Étape 1 : Création du ticket (Locataire)

1. **Se connecter en tant que locataire**
   - Email: `locataire@test.com`

2. **Créer un nouveau ticket**
   - Titre: "Problème de chauffage"
   - Catégorie: "Autre"
   - Priorité: "Élevée"
   - Description: "Le chauffage ne fonctionne plus depuis ce matin. Température très basse dans l'appartement."
   - Localisation: "Appartement entier"
   - Propriété: [Sélectionner]
   - Bail: [Sélectionner si disponible]

3. **Uploader une pièce jointe**
   - Uploader une photo du thermostat

4. **Soumettre le ticket**
   - Vérifier le message de succès
   - Noter l'ID du ticket créé

**Vérifications**:
- ✅ Ticket créé avec statut "Déclaré"
- ✅ Email de notification envoyé aux gestionnaires
- ✅ Pièce jointe uploadée

---

#### Étape 2 : Réception et prise en charge (Gestionnaire)

1. **Se connecter en tant que gestionnaire**
   - Email: `manager@test.com`

2. **Vérifier la notification email**
   - Ouvrir l'email reçu
   - Cliquer sur le lien vers le ticket

3. **Consulter le ticket**
   - Vérifier tous les détails
   - Vérifier la pièce jointe

4. **Ajouter un commentaire**
   - "Ticket reçu. Nous allons contacter un prestataire rapidement."

5. **Changer le statut**
   - "Déclaré" → "En cours"

**Vérifications**:
- ✅ Email reçu par le gestionnaire
- ✅ Commentaire ajouté
- ✅ Statut mis à jour
- ✅ Timeline mise à jour

---

#### Étape 3 : Assignation d'un prestataire (Gestionnaire)

1. **Créer un prestataire si nécessaire**
   - Nom: "Chauffage Express"
   - Téléphone: "+33 1 11 22 33 44"
   - Email: "contact@chauffage-express.fr"
   - Spécialités: "Chauffage", "Dépannage"

2. **Assigner le prestataire au ticket**
   - Sélectionner "Chauffage Express" dans le sélecteur
   - Sauvegarder

**Vérifications**:
- ✅ Prestataire assigné
- ✅ Statut automatiquement changé à "Assigné" (si était "En cours")

---

#### Étape 4 : Suivi par le locataire

1. **Se reconnecter en tant que locataire**
   - Email: `locataire@test.com`

2. **Vérifier l'email de notification**
   - Ouvrir l'email de changement de statut
   - Vérifier le contenu

3. **Consulter le ticket**
   - Vérifier le nouveau statut "Assigné"
   - Vérifier le prestataire assigné
   - Vérifier le commentaire du gestionnaire

4. **Ajouter un commentaire**
   - "Merci pour le suivi. J'attends l'intervention."

**Vérifications**:
- ✅ Email de notification reçu
- ✅ Statut mis à jour dans l'interface
- ✅ Commentaire visible

---

#### Étape 5 : Résolution (Gestionnaire)

1. **Se reconnecter en tant que gestionnaire**
   - Email: `manager@test.com`

2. **Mettre à jour le ticket**
   - Changer le statut: "Assigné" → "Résolu"
   - Ajouter des notes de résolution: "Intervention effectuée. Thermostat remplacé. Système testé et fonctionnel."

3. **Ajouter un commentaire final**
   - "Intervention terminée. Le chauffage fonctionne à nouveau normalement."

**Vérifications**:
- ✅ Statut changé à "Résolu"
- ✅ Notes de résolution enregistrées
- ✅ Email de notification envoyé au locataire
- ✅ Date de résolution enregistrée

---

#### Étape 6 : Consultation finale (Locataire)

1. **Se reconnecter en tant que locataire**
   - Email: `locataire@test.com`

2. **Consulter le ticket résolu**
   - Vérifier le statut "Résolu"
   - Vérifier les notes de résolution
   - Vérifier tous les commentaires
   - Vérifier la timeline complète

3. **Vérifier l'historique**
   - Accéder à la liste des tickets
   - Filtrer par "Résolu"
   - Vérifier que le ticket apparaît

**Vérifications**:
- ✅ Ticket marqué comme résolu
- ✅ Timeline complète visible
- ✅ Tous les commentaires présents
- ✅ Notes de résolution visibles

---

#### Étape 7 : Consultation de l'historique par propriété

1. **Se connecter en tant que gestionnaire**
   - Email: `manager@test.com`

2. **Accéder à la fiche propriété**
   - URL: `http://localhost:3000/tenant/{tenantId}/properties/{propertyId}`

3. **Ouvrir l'onglet "Maintenance"**
   - Vérifier que le ticket résolu apparaît dans l'historique
   - Tester les filtres (statut, catégorie)

**Vérifications**:
- ✅ Ticket visible dans l'historique de la propriété
- ✅ Filtres fonctionnent
- ✅ Clic sur le ticket → redirection vers le détail

---

## Tests de Sécurité

### Test 20 : Isolation tenant

**Objectif**: Vérifier qu'un utilisateur ne peut accéder qu'aux données de son tenant

**Étapes**:

1. **Créer un ticket dans Tenant A**
   - Se connecter avec un compte du Tenant A
   - Créer un ticket

2. **Tenter d'accéder depuis Tenant B**
   - Se connecter avec un compte du Tenant B
   - Tenter d'accéder au ticket du Tenant A via l'URL directe

**Résultats attendus**:
- ❌ Accès refusé (404 ou 403)
- ✅ Seuls les tickets du Tenant B sont visibles

**Vérifications API**:
```bash
# Tenter d'accéder à un ticket d'un autre tenant
GET /api/tenants/{tenantIdA}/maintenance/tenant/tickets/{ticketIdFromTenantB}
# Doit retourner 404 ou 403
```

---

### Test 21 : Permissions RBAC

**Objectif**: Vérifier que seuls les utilisateurs avec les bonnes permissions peuvent accéder

**Étapes**:

1. **Tester avec un utilisateur sans permission MAINTENANCE_ADMIN**
   - Se connecter avec un utilisateur standard
   - Tenter d'accéder aux routes admin

**Résultats attendus**:
- ❌ Accès refusé (403 Forbidden)
- ✅ Message d'erreur clair

---

### Test 22 : Sécurité des fichiers

**Objectif**: Vérifier la protection contre les attaques path traversal

**Étapes**:

1. **Tenter un téléchargement avec path traversal**
   - Tenter d'accéder à: `/api/tenants/{tenantId}/maintenance/files/../../../etc/passwd`

**Résultats attendus**:
- ❌ Accès refusé
- ✅ Validation du chemin de fichier
- ✅ Seuls les fichiers dans `uploads/maintenance/` sont accessibles

---

### Test 23 : Validation des fichiers uploadés

**Objectif**: Vérifier les validations de sécurité sur les uploads

**Étapes**:

1. **Tester différents types de fichiers**
   - Uploader un fichier .exe → ❌ Refusé
   - Uploader un fichier > 10 MB → ❌ Refusé
   - Uploader plus de 5 fichiers → ❌ Refusé
   - Uploader un fichier valide (JPG, PNG, PDF) → ✅ Accepté

**Résultats attendus**:
- ✅ Types de fichiers validés
- ✅ Taille validée
- ✅ Nombre de fichiers validé
- ✅ Noms de fichiers sanitized

---

## Tests de Performance

### Test 24 : Performance de la liste des tickets

**Objectif**: Vérifier les performances avec un grand nombre de tickets

**Étapes**:

1. **Créer 50+ tickets de test** (via seed ou script)

2. **Tester la liste des tickets**
   - Mesurer le temps de chargement
   - Tester la pagination
   - Tester les filtres

**Résultats attendus**:
- ✅ Temps de chargement < 2 secondes
- ✅ Pagination fonctionnelle
- ✅ Filtres rapides

---

### Test 25 : Performance des requêtes avec relations

**Objectif**: Vérifier l'optimisation des requêtes Prisma

**Vérifications**:
- ✅ Utilisation de `include` pour éviter les N+1 queries
- ✅ Index sur les colonnes fréquemment filtrées
- ✅ Requêtes optimisées avec `select` pour limiter les données

---

## Checklist de Validation

### Fonctionnalités Core

- [ ] Création de ticket par locataire
- [ ] Consultation de ticket par locataire
- [ ] Ajout de commentaire par locataire
- [ ] Upload de pièce jointe
- [ ] Annulation de ticket
- [ ] Liste des tickets avec filtres (locataire)
- [ ] Consultation de tous les tickets (gestionnaire)
- [ ] Filtres avancés (gestionnaire)
- [ ] Changement de statut
- [ ] Assignation de prestataire
- [ ] Modification de priorité
- [ ] Notes de résolution
- [ ] Commentaires gestionnaire
- [ ] Historique par propriété

### Gestion des Prestataires

- [ ] Liste des prestataires
- [ ] Création de prestataire
- [ ] Modification de prestataire
- [ ] Désactivation de prestataire
- [ ] Recherche et filtres
- [ ] Protection contre désactivation si assigné

### Notifications

- [ ] Email de création de ticket (gestionnaires)
- [ ] Email de changement de statut (locataire)
- [ ] Templates HTML en français
- [ ] Notifications non-bloquantes

### Sécurité

- [ ] Isolation tenant
- [ ] Permissions RBAC
- [ ] Validation des fichiers
- [ ] Protection path traversal
- [ ] Validation des transitions de statut

### Performance

- [ ] Temps de chargement acceptable
- [ ] Pagination fonctionnelle
- [ ] Requêtes optimisées
- [ ] Index sur colonnes importantes

### UI/UX

- [ ] Tous les textes en français
- [ ] Messages d'erreur clairs
- [ ] Feedback utilisateur (success, error)
- [ ] Responsive design
- [ ] Accessibilité de base

---

## Commandes utiles

### Seed de données de test

```bash
# Dans packages/api/
npm run db:seed:maintenance
```

### Vérification des logs

```bash
# Vérifier les logs du backend
# Les logs incluent:
# - Création de tickets
# - Changements de statut
# - Assignations de prestataires
# - Uploads de fichiers
```

### Tests API avec cURL

```bash
# Créer un ticket
curl -X POST http://localhost:5000/api/tenants/{tenantId}/maintenance/tenant/tickets \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test ticket",
    "category": "PLUMBING",
    "priority": "HIGH",
    "description": "Description du ticket",
    "propertyId": "{propertyId}"
  }'

# Lister les tickets
curl -X GET http://localhost:5000/api/tenants/{tenantId}/maintenance/tenant/tickets \
  -H "Authorization: Bearer {token}"

# Changer le statut
curl -X PATCH http://localhost:5000/api/tenants/{tenantId}/maintenance/admin/tickets/{ticketId} \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"status": "IN_PROGRESS"}'
```

---

## Notes importantes

1. **Données de test**: Utiliser des données réalistes mais anonymisées
2. **Isolation**: Chaque tenant doit être testé indépendamment
3. **Notifications**: Vérifier que les emails sont bien envoyés (configurer SMTP ou Mailtrap)
4. **Fichiers**: Les fichiers uploadés sont stockés dans `uploads/maintenance/{tenantId}/{ticketId}/`
5. **Workflow**: Respecter le workflow de statuts (transitions valides uniquement)

---

**Version du document**: 1.0  
**Dernière mise à jour**: 2025-01-28  
**Auteur**: ImmoTopia Development Team
