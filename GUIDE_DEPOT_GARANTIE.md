# Guide : Onglet "Dépôt de garantie"

## 📋 Vue d'ensemble

L'onglet **"Dépôt de garantie"** permet de gérer le dépôt de garantie associé à un bail locatif. Il suit les mouvements financiers (collecte, blocage, libération, remboursement, confiscation) et calcule automatiquement le solde disponible.

## 🔄 Fonctionnement

### 1. **Création automatique du dépôt**

Le dépôt de garantie est créé automatiquement dans deux cas :
- Lors de la création d'un bail avec un `security_deposit_amount > 0`
- Lors de l'accès à l'onglet si le bail a un `security_deposit_amount` mais qu'aucun dépôt n'existe encore

**Fichier concerné :** `packages/api/src/services/rental-deposit-service.ts` (fonction `getDeposit`)

### 2. **Structure des données**

Le dépôt de garantie contient :
- **`target_amount`** : Montant cible (égal au `security_deposit_amount` du bail)
- **`collected_amount`** : Montant total collecté
- **`held_amount`** : Montant actuellement bloqué
- **`refunded_amount`** : Montant remboursé
- **`forfeited_amount`** : Montant confisqué
- **`current_balance`** : Solde actuel = `collected_amount - refunded_amount - forfeited_amount`

### 3. **Types de mouvements**

| Type | Description | Impact sur le solde |
|------|-------------|-------------------|
| **COLLECT** | Collecte du dépôt | ✅ Augmente `collected_amount` |
| **HOLD** | Blocage d'une partie | ⚠️ Augmente `held_amount` (ne change pas le solde disponible) |
| **RELEASE** | Libération d'un blocage | ⚠️ Diminue `held_amount` |
| **REFUND** | Remboursement au locataire | ❌ Diminue `collected_amount`, augmente `refunded_amount` |
| **FORFEIT** | Confiscation (dommages) | ❌ Diminue `collected_amount`, augmente `forfeited_amount` |
| **ADJUSTMENT** | Ajustement (correction) | ➕➖ Peut augmenter ou diminuer `collected_amount` |

### 4. **Règles de validation**

#### Collecte (COLLECT)
- ✅ **Une seule collecte autorisée** par dépôt
- ✅ Le montant doit être **exactement égal** au `target_amount`
- ✅ Un `paymentId` est **obligatoire** (doit être lié à un paiement)

#### Remboursement/Confiscation (REFUND/FORFEIT)
- ✅ Le montant ne peut pas dépasser le solde disponible
- ✅ Solde disponible = `collected_amount - refunded_amount - forfeited_amount`

## 🧪 Guide de test

### Prérequis
1. Avoir un bail actif avec un `security_deposit_amount > 0`
2. URL de test : `http://localhost:3000/tenant/e3e428d1-364b-42c9-a102-a22daa9329c5/rental/leases/d1eda045-334d-49e3-891c-e04715469e1e`

### Test 1 : Vérifier la création automatique

**Scénario :** Accéder à l'onglet "Dépôt de garantie" pour un bail qui n'a pas encore de dépôt

**Étapes :**
1. Ouvrir la page du bail
2. Cliquer sur l'onglet "Dépôt de garantie"
3. Vérifier que :
   - Le dépôt est créé automatiquement
   - Le "Montant cible" correspond au `security_deposit_amount` du bail
   - Le "Solde actuel" est à 0
   - Le statut est "En attente"

**Résultat attendu :** ✅ Dépôt créé avec `target_amount` = montant du bail, `collected_amount` = 0

---

### Test 2 : Collecte du dépôt de garantie

**Scénario :** Enregistrer la collecte complète du dépôt

**Étapes :**
1. Cliquer sur "Nouveau mouvement"
2. Sélectionner le type : **"Collecte"**
3. Entrer le montant : **exactement égal au montant cible** (ex: 500 000)
4. Ajouter une note optionnelle (ex: "Collecte initiale du dépôt")
5. Cliquer sur "Enregistrer"

**Résultat attendu :** ✅ 
- Mouvement créé avec succès
- `collected_amount` = montant cible
- `current_balance` = montant cible
- Statut passe à "Complet" (si solde >= montant cible)
- Le mouvement apparaît dans l'historique

**Test d'erreur :** Essayer de créer une deuxième collecte → doit échouer avec le message "Security deposit can only be collected once"

**Test d'erreur :** Essayer de collecter un montant différent du montant cible → doit échouer avec le message "Collection amount must equal target amount"

---

### Test 3 : Blocage et libération

**Scénario :** Bloquer une partie du dépôt puis la libérer

**Étapes :**
1. Après avoir collecté le dépôt, créer un mouvement de type **"Blocage"**
2. Entrer un montant (ex: 100 000)
3. Ajouter une note (ex: "Blocage pour réparations")
4. Enregistrer
5. Vérifier que le solde disponible reste le même (blocage ne change pas le solde)
6. Créer un mouvement de type **"Libération"**
7. Entrer le même montant (100 000)
8. Enregistrer

**Résultat attendu :** ✅
- `held_amount` augmente puis diminue
- Le `current_balance` reste inchangé (blocage/libération n'affectent pas le solde disponible)

---

### Test 4 : Remboursement partiel

**Scénario :** Rembourser une partie du dépôt au locataire

**Étapes :**
1. Après avoir collecté le dépôt complet
2. Créer un mouvement de type **"Remboursement"**
3. Entrer un montant inférieur au solde disponible (ex: 200 000 sur 500 000)
4. Ajouter une note (ex: "Remboursement partiel")
5. Enregistrer

**Résultat attendu :** ✅
- `refunded_amount` = 200 000
- `collected_amount` diminue de 200 000
- `current_balance` = 300 000 (500 000 - 200 000)
- Le mouvement apparaît dans l'historique avec un signe "-"

**Test d'erreur :** Essayer de rembourser plus que le solde disponible → doit échouer avec "Insufficient deposit balance"

---

### Test 5 : Confiscation

**Scénario :** Confisquer une partie du dépôt pour dommages

**Étapes :**
1. Après avoir collecté le dépôt
2. Créer un mouvement de type **"Confiscation"**
3. Entrer un montant (ex: 150 000)
4. Ajouter une note (ex: "Dommages causés aux murs")
5. Enregistrer

**Résultat attendu :** ✅
- `forfeited_amount` = 150 000
- `collected_amount` diminue de 150 000
- `current_balance` diminue
- Le mouvement apparaît dans l'historique

---

### Test 6 : Ajustement

**Scénario :** Corriger une erreur dans le dépôt

**Étapes :**
1. Créer un mouvement de type **"Ajustement"**
2. Entrer un montant positif (ex: 50 000) pour augmenter
3. Ou un montant négatif (ex: -30 000) pour diminuer
4. Ajouter une note expliquant l'ajustement
5. Enregistrer

**Résultat attendu :** ✅
- `collected_amount` est ajusté selon le montant
- `current_balance` est recalculé

---

### Test 7 : Vérification de l'historique

**Scénario :** Vérifier que tous les mouvements sont correctement enregistrés

**Étapes :**
1. Après avoir créé plusieurs mouvements
2. Vérifier l'onglet "Historique des mouvements"
3. Vérifier que :
   - Tous les mouvements sont listés (du plus récent au plus ancien)
   - Les dates sont correctes
   - Les montants sont corrects
   - Les icônes sont appropriées (↑ pour collecte, ↓ pour remboursement)
   - Les notes sont affichées

**Résultat attendu :** ✅ Historique complet et chronologique

---

### Test 8 : Calcul du solde

**Scénario :** Vérifier que le solde est correctement calculé après plusieurs opérations

**Étapes :**
1. Collecter 500 000
2. Rembourser 200 000
3. Confisquer 100 000
4. Vérifier le solde affiché

**Résultat attendu :** ✅
- Solde = 500 000 - 200 000 - 100 000 = **200 000**
- Le calcul doit être : `collected_amount - refunded_amount - forfeited_amount`

---

### Test 9 : Statut "Complet" vs "En attente"

**Scénario :** Vérifier le changement de statut

**Étapes :**
1. Vérifier que le statut est "En attente" quand `current_balance < target_amount`
2. Compléter le dépôt jusqu'à atteindre le montant cible
3. Vérifier que le statut passe à "Complet"

**Résultat attendu :** ✅
- Statut "En attente" : solde < montant cible
- Statut "Complet" : solde >= montant cible

---

### Test 10 : Multi-tenant (isolation)

**Scénario :** Vérifier que les dépôts sont bien isolés par tenant

**Étapes :**
1. Créer un dépôt pour le tenant A
2. Essayer d'accéder au dépôt avec un autre tenantId
3. Vérifier que l'accès est refusé

**Résultat attendu :** ✅ Erreur "Security deposit not found" si tentative d'accès cross-tenant

---

## 🔍 Points de vérification techniques

### Backend (API)
- ✅ Endpoint GET `/api/tenants/:tenantId/rental/leases/:leaseId/deposit`
- ✅ Endpoint POST `/api/tenants/:tenantId/rental/leases/:leaseId/deposit` (création manuelle)
- ✅ Endpoint POST `/api/tenants/:tenantId/rental/deposits/:depositId/movements`
- ✅ Endpoint GET `/api/tenants/:tenantId/rental/deposits/:depositId/movements`

### Frontend
- ✅ Composant `Deposits.tsx` : Affichage du dépôt et de l'historique
- ✅ Composant `DepositMovementForm.tsx` : Formulaire de création de mouvement
- ✅ Intégration dans `LeaseDetailPage.tsx` comme onglet

### Base de données
- ✅ Table `rental_security_deposits` : Stockage des dépôts
- ✅ Table `rental_deposit_movements` : Historique des mouvements
- ✅ Contrainte unique : Un seul dépôt par bail (`lease_id`)

---

## 🐛 Problèmes courants et solutions

### Problème : "Security deposit not found"
**Cause :** Le dépôt n'existe pas encore
**Solution :** Le système devrait le créer automatiquement si le bail a un `security_deposit_amount > 0`

### Problème : "Collection amount must equal target amount"
**Cause :** Tentative de collecter un montant différent du montant cible
**Solution :** Utiliser exactement le montant cible pour la collecte

### Problème : "Security deposit can only be collected once"
**Cause :** Tentative de créer une deuxième collecte
**Solution :** Utiliser "Ajustement" pour corriger le montant collecté

### Problème : "Insufficient deposit balance"
**Cause :** Tentative de rembourser/confisquer plus que le solde disponible
**Solution :** Vérifier le solde disponible avant de créer le mouvement

---

## 📊 Exemple de workflow complet

1. **Création du bail** avec `security_deposit_amount = 500 000`
2. **Accès à l'onglet** → Dépôt créé automatiquement (target = 500 000, collected = 0)
3. **Collecte** → collected = 500 000, balance = 500 000, statut = "Complet"
4. **Blocage** (100 000) → held = 100 000, balance = 500 000 (inchangé)
5. **Libération** (100 000) → held = 0, balance = 500 000 (inchangé)
6. **Remboursement** (200 000) → refunded = 200 000, balance = 300 000
7. **Confiscation** (100 000) → forfeited = 100 000, balance = 200 000
8. **Ajustement** (+50 000) → collected = 350 000, balance = 250 000

**Solde final :** 250 000 (350 000 collecté - 200 000 remboursé - 100 000 confisqué)

---

## ✅ Checklist de validation

- [ ] Dépôt créé automatiquement à l'accès de l'onglet
- [ ] Collecte unique et égale au montant cible
- [ ] Blocage/libération n'affectent pas le solde disponible
- [ ] Remboursement/confiscation vérifient le solde disponible
- [ ] Historique complet et chronologique
- [ ] Calcul du solde correct
- [ ] Statut "Complet"/"En attente" correct
- [ ] Isolation multi-tenant fonctionnelle
- [ ] Messages d'erreur clairs
- [ ] Interface utilisateur intuitive

---

**Date de création :** 2025-01-27
**Dernière mise à jour :** 2025-01-27
