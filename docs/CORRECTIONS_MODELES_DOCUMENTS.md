# Corrections - Modèles de Documents

## Problème Identifié

Lors de la génération de documents, certains champs n'étaient pas remplis correctement :
- `{{AGENCE_ADRESSE}}` - non rempli
- `{{AGENCE_TELEPHONE}}` - non rempli
- `{{AGENCE_EMAIL}}` - non rempli
- `{{LOCATAIRE_TELEPHONE}}` - non rempli
- `{{BAILLEUR_TELEPHONE}}` - non rempli
- `{{BIEN_ADRESSE}}` - non rempli
- `{{BIEN_PIECES}}` - non rempli
- `{{BIEN_CHAMBRES}}` - non rempli
- `{{BAIL_FREQUENCE}}` - affichait "MONTHLY" au lieu de "MENSUEL"

## Corrections Apportées

### 1. Amélioration de la récupération des données

Le fichier `packages/api/src/services/document-context-builder.ts` a été mis à jour pour :

#### a) Gestion des téléphones
- **LOCATAIRE_TELEPHONE** et **BAILLEUR_TELEPHONE** : 
  - **Priorité 1** : Récupère depuis le **Contact CRM** associé (`CrmContact.phonePrimary`)
  - **Priorité 2** : Si non disponible, utilise `CrmContact.phoneSecondary`
  - **Priorité 3** : Si non disponible, utilise `CrmContact.whatsappNumber`
  - **Priorité 4** : Fallback vers le champ `details` (JSON) de `TenantClient` avec les clés : `phone`, `telephone`, `mobile`
  - Si aucun n'est trouvé, retourne une chaîne vide

#### b) Formatage de la fréquence de paiement
- **BAIL_FREQUENCE** : 
  - Convertit automatiquement les valeurs en français :
    - `MONTHLY` → `MENSUEL`
    - `QUARTERLY` → `TRIMESTRIEL`
    - `SEMIANNUAL` → `SEMESTRIEL`
    - `ANNUAL` → `ANNUEL`

#### c) Gestion des adresses
- **AGENCE_ADRESSE** : 
  - Utilise `tenant.address` si disponible
  - Sinon, utilise `tenant.city` comme fallback
  - Si aucun des deux n'est disponible, retourne une chaîne vide

## Mapping des Données

### Informations de l'Agence (Tenant)

| Variable | Source | Champ Prisma | Notes |
|----------|--------|--------------|-------|
| `AGENCE_NOM` | `lease.tenant.name` | `Tenant.name` | ✅ Toujours disponible |
| `AGENCE_ADRESSE` | `lease.tenant.address` ou `lease.tenant.city` | `Tenant.address` / `Tenant.city` | ⚠️ Peut être null |
| `AGENCE_TELEPHONE` | `lease.tenant.contactPhone` | `Tenant.contactPhone` | ⚠️ Peut être null |
| `AGENCE_EMAIL` | `lease.tenant.contactEmail` | `Tenant.contactEmail` | ⚠️ Peut être null |

### Informations du Bien (Property)

| Variable | Source | Champ Prisma | Notes |
|----------|--------|--------------|-------|
| `BIEN_ADRESSE` | `lease.property.address` | `Property.address` | ⚠️ Peut être null |
| `BIEN_TYPE` | `lease.property.propertyType` | `Property.propertyType` | ✅ Toujours disponible |
| `BIEN_SURFACE` | `lease.property.surfaceArea` | `Property.surfaceArea` | ⚠️ Peut être null (affiche "0" si null) |
| `BIEN_PIECES` | `lease.property.rooms` | `Property.rooms` | ⚠️ Peut être null |
| `BIEN_CHAMBRES` | `lease.property.bedrooms` | `Property.bedrooms` | ⚠️ Peut être null |

### Informations du Locataire (TenantClient)

| Variable | Source | Champ Prisma | Notes |
|----------|--------|--------------|-------|
| `LOCATAIRE_NOM` | `lease.primaryRenter.user.fullName` | `User.fullName` | ⚠️ Peut être null |
| `LOCATAIRE_EMAIL` | `lease.primaryRenter.user.email` | `User.email` | ✅ Toujours disponible |
| `LOCATAIRE_TELEPHONE` | `lease.primaryRenter.CrmContact.phonePrimary` (priorité) ou `lease.primaryRenter.details.phone` (fallback) | `CrmContact.phonePrimary` ou `TenantClient.details` (JSON) | ✅ Récupéré depuis le contact CRM |

### Informations du Bailleur (TenantClient)

| Variable | Source | Champ Prisma | Notes |
|----------|--------|--------------|-------|
| `BAILLEUR_NOM` | `lease.ownerClient.user.fullName` | `User.fullName` | ⚠️ Peut être null |
| `BAILLEUR_EMAIL` | `lease.ownerClient.user.email` | `User.email` | ✅ Toujours disponible |
| `BAILLEUR_TELEPHONE` | `lease.ownerClient.CrmContact.phonePrimary` (priorité) ou `lease.ownerClient.details.phone` (fallback) | `CrmContact.phonePrimary` ou `TenantClient.details` (JSON) | ✅ Récupéré depuis le contact CRM |

## Actions Requises

### Pour que tous les champs soient remplis, vous devez :

1. **Renseigner les informations de l'agence (Tenant)** :
   - Aller dans les paramètres du tenant
   - Remplir : `address`, `contactPhone`, `contactEmail`

2. **Renseigner les informations du bien (Property)** :
   - Vérifier que la propriété a :
     - `address` (adresse complète)
     - `rooms` (nombre de pièces)
     - `bedrooms` (nombre de chambres)
     - `surfaceArea` (surface en m²)

3. **Renseigner les téléphones des clients** :
   - **✅ Solution recommandée** : Renseigner le téléphone dans le **Contact CRM** associé
     - Aller sur `/tenant/:tenantId/crm/contacts/:contactId`
     - Remplir le champ **"Téléphone principal"** (`phonePrimary`)
     - Le système récupérera automatiquement ce téléphone lors de la génération
   - **Alternative** : Si le contact CRM n'est pas disponible, ajouter dans `TenantClient.details` (JSON) :
     ```json
     {
       "phone": "+225 XX XX XX XX XX",
       "telephone": "+225 XX XX XX XX XX",
       "mobile": "+225 XX XX XX XX XX"
     }
     ```

## Exemple de Structure TenantClient.details

Pour que les téléphones soient récupérés, le champ `details` de `TenantClient` doit contenir :

```json
{
  "phone": "+225 07 12 34 56 78",
  "telephone": "+225 07 12 34 56 78",
  "mobile": "+225 07 12 34 56 78",
  "address": "Adresse complète",
  "birthDate": "1990-01-01",
  "nationality": "Ivoirienne",
  "idNumber": "CI-123456789",
  "profession": "Ingénieur"
}
```

Le système cherchera dans cet ordre :
1. `phone`
2. `telephone`
3. `mobile`

## Vérification

Pour vérifier que les données sont bien renseignées :

1. **Vérifier le Tenant** :
   ```sql
   SELECT id, name, address, contact_phone, contact_email 
   FROM tenants 
   WHERE id = '<tenant_id>';
   ```

2. **Vérifier la Property** :
   ```sql
   SELECT id, address, rooms, bedrooms, surface_area 
   FROM properties 
   WHERE id = '<property_id>';
   ```

3. **Vérifier le TenantClient** :
   ```sql
   SELECT id, details 
   FROM tenant_clients 
   WHERE id = '<client_id>';
   ```

## Notes Importantes

- Les champs marqués ⚠️ peuvent être `null` dans la base de données
- Si un champ est `null`, il sera remplacé par une chaîne vide `''` dans le document
- Pour éviter les champs vides, assurez-vous de renseigner toutes les informations nécessaires lors de la création/modification des entités
- Le formatage des montants utilise toujours le format FCFA avec séparateurs de milliers
- Les dates sont au format DD/MM/YYYY

## Prochaines Améliorations Possibles

1. Ajouter un champ `phone` directement dans le modèle `User`
2. Créer une interface pour gérer les `TenantClient.details` de manière structurée
3. Ajouter des validations pour s'assurer que les champs critiques sont renseignés avant la génération
4. Créer des templates par défaut avec gestion des champs optionnels

---

**Date de mise à jour** : Janvier 2025
