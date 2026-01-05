# PROPERTY TEMPLATE ENGINE — IMMO TOPIA

## 1. Objectif

Ce document décrit le **moteur de templates de biens immobiliers** d’ImmoTopia.

Il permet :
- de gérer plusieurs **types de biens**,
- de définir des **champs dynamiques par type**,
- de générer automatiquement les **formulaires UI**,
- de valider les données côté backend,
- de conserver un modèle **scalable, versionné et multi-tenant**.

---

## 2. Architecture fonctionnelle

### 2.1 Concepts clés

- **PropertyType** : type de bien (Appartement, Villa, Terrain…)
- **PropertyTemplate** : formulaire/version associé à un type
- **TemplateSection** : section UI (Bâtiment, Extérieurs, Juridique…)
- **PropertyField** : définition d’un champ réutilisable
- **TemplateField** : configuration du champ dans un template
- **PropertyFieldValue** : valeur saisie pour un bien

---

## 3. JSON Schema — Templates

### 3.1 PropertyType

```json
{
  "id": "uuid",
  "code": "APARTMENT",
  "label": "Appartement",
  "icon": "building",
  "isActive": true
}
```

### 3.2 PropertyTemplate

```json
{
  "id": "uuid",
  "propertyTypeId": "uuid",
  "name": "Appartement - Standard",
  "version": 1,
  "scope": "GLOBAL",
  "tenantId": null,
  "isDefault": true,
  "status": "PUBLISHED"
}
```

### 3.3 TemplateSection

```json
{
  "id": "uuid",
  "templateId": "uuid",
  "code": "BUILDING",
  "label": "Bâtiment",
  "sortOrder": 10,
  "isCollapsible": true
}
```

### 3.4 PropertyField

```json
{
  "id": "uuid",
  "key": "floor",
  "label": "Étage",
  "dataType": "INT",
  "unit": null,
  "minValue": 0,
  "maxValue": 200,
  "isActive": true
}
```

### 3.5 PropertyFieldOption

```json
{
  "id": "uuid",
  "fieldId": "uuid",
  "value": "NORTH",
  "label": "Nord"
}
```

### 3.6 TemplateField (champ dans un template)

```json
{
  "templateId": "uuid",
  "sectionId": "uuid",
  "fieldId": "uuid",
  "isRequired": true,
  "sortOrder": 1,
  "validation": {
    "min": 0,
    "max": 20
  },
  "ui": {
    "widget": "number",
    "cols": 6
  }
}
```

### 3.7 PropertyFieldValue (valeur dynamique)

```json
{
  "propertyId": "uuid",
  "fieldId": "uuid",
  "valueInt": 3
}
```

---

## 4. Seed — Types de biens

```json
[
  { "code": "APARTMENT", "label": "Appartement" },
  { "code": "HOUSE", "label": "Maison / Villa" },
  { "code": "STUDIO", "label": "Studio" },
  { "code": "DUPLEX", "label": "Duplex / Triplex" },
  { "code": "ROOM", "label": "Chambre (Colocation)" },
  { "code": "OFFICE", "label": "Bureau" },
  { "code": "SHOP", "label": "Boutique / Commercial" },
  { "code": "WAREHOUSE", "label": "Entrepôt / Industriel" },
  { "code": "LAND", "label": "Terrain" },
  { "code": "BUILDING", "label": "Immeuble" },
  { "code": "PARKING", "label": "Parking / Box" },
  { "code": "NEW_PROGRAM_LOT", "label": "Lot (Programme neuf)" }
]
```

---

## 5. Seed — Champs communs (incluant Documents)

> Remarque : les documents peuvent être gérés comme **liste** (MULTISELECT) + pièces jointes dans un module de fichiers.

```json
[
  { "key": "surface", "label": "Surface", "dataType": "DECIMAL", "unit": "m²" },
  { "key": "rooms", "label": "Nombre de pièces", "dataType": "INT" },
  { "key": "bedrooms", "label": "Chambres", "dataType": "INT" },
  { "key": "bathrooms", "label": "Salles de bain", "dataType": "INT" },
  { "key": "furnished", "label": "Meublé", "dataType": "BOOL" },
  { "key": "year_built", "label": "Année de construction", "dataType": "INT" },

  { "key": "legal_documents", "label": "Documents légaux", "dataType": "MULTISELECT" }
]
```

### Options — Documents légaux (Champ `legal_documents`)

```json
[
  { "value": "ATTESTATION_VILLAGEOISE", "label": "Attestation villageoise" },
  { "value": "ACD_GLOBALE", "label": "ACD globale" },
  { "value": "ACD_INDIVIDUEL", "label": "ACD individuel" }
]
```

---

## 6. Seed — Champs spécifiques par type

### 6.1 Appartement

```json
[
  { "key": "floor", "label": "Étage", "dataType": "INT" },
  { "key": "elevator", "label": "Ascenseur", "dataType": "BOOL" },
  { "key": "balcony", "label": "Balcon", "dataType": "BOOL" },
  { "key": "parking", "label": "Parking", "dataType": "BOOL" },
  { "key": "orientation", "label": "Orientation", "dataType": "SELECT" }
]
```

Options orientation :

```json
[
  { "value": "NORTH", "label": "Nord" },
  { "value": "SOUTH", "label": "Sud" },
  { "value": "EAST", "label": "Est" },
  { "value": "WEST", "label": "Ouest" }
]
```

---

### 6.2 Maison / Villa (mise à jour)

```json
[
  { "key": "habitable_area", "label": "Surface habitée", "dataType": "DECIMAL", "unit": "m²" },
  { "key": "land_area", "label": "Surface terrain", "dataType": "DECIMAL", "unit": "m²" },
  { "key": "garden", "label": "Jardin", "dataType": "BOOL" },
  { "key": "pool", "label": "Piscine", "dataType": "BOOL" },
  { "key": "levels", "label": "Nombre de niveaux", "dataType": "INT" },
  { "key": "generator", "label": "Groupe électrogène", "dataType": "BOOL" },

  { "key": "garage", "label": "Garage", "dataType": "SELECT" }
]
```

Options garage :

```json
[
  { "value": "GARAGE_1", "label": "Garage : 1 véhicule" },
  { "value": "GARAGE_2", "label": "Garage : 2 véhicules" }
]
```

---

### 6.3 Studio

```json
[
  { "key": "kitchenette", "label": "Coin cuisine", "dataType": "BOOL" },
  { "key": "bathroom_type", "label": "Type de salle d’eau", "dataType": "SELECT" },
  { "key": "floor", "label": "Étage", "dataType": "INT" },
  { "key": "elevator", "label": "Ascenseur", "dataType": "BOOL" }
]
```

Options `bathroom_type` :

```json
[
  { "value": "SHOWER", "label": "Douche" },
  { "value": "BATHTUB", "label": "Baignoire" }
]
```

---

### 6.4 Duplex / Triplex

```json
[
  { "key": "levels", "label": "Nombre de niveaux", "dataType": "INT" },
  { "key": "internal_stairs", "label": "Escalier interne", "dataType": "BOOL" },
  { "key": "terrace", "label": "Terrasse", "dataType": "BOOL" },
  { "key": "balcony", "label": "Balcon", "dataType": "BOOL" }
]
```

---

### 6.5 Chambre (Colocation)

```json
[
  { "key": "room_area", "label": "Surface chambre", "dataType": "DECIMAL", "unit": "m²" },
  { "key": "room_type", "label": "Type de chambre", "dataType": "SELECT" },
  { "key": "bathroom_access", "label": "Salle de bain", "dataType": "SELECT" },
  { "key": "kitchen_access", "label": "Cuisine", "dataType": "SELECT" },
  { "key": "total_roommates", "label": "Nombre total de colocataires", "dataType": "INT" },
  { "key": "included_services", "label": "Services inclus", "dataType": "MULTISELECT" }
]
```

Options `room_type` :

```json
[
  { "value": "PRIVATE", "label": "Privée" },
  { "value": "SHARED", "label": "Partagée" }
]
```

Options `bathroom_access` :

```json
[
  { "value": "PRIVATE", "label": "Privée" },
  { "value": "SHARED", "label": "Partagée" }
]
```

Options `kitchen_access` :

```json
[
  { "value": "PRIVATE", "label": "Privée" },
  { "value": "SHARED", "label": "Partagée" },
  { "value": "NONE", "label": "Aucune" }
]
```

Options `included_services` :

```json
[
  { "value": "INTERNET", "label": "Internet" },
  { "value": "WATER", "label": "Eau" },
  { "value": "POWER", "label": "Électricité" },
  { "value": "CLEANING", "label": "Ménage" }
]
```

---

### 6.6 Bureau

```json
[
  { "key": "office_area", "label": "Surface bureaux", "dataType": "DECIMAL", "unit": "m²" },
  { "key": "meeting_rooms", "label": "Salles de réunion", "dataType": "INT" },
  { "key": "reception", "label": "Accueil / réception", "dataType": "BOOL" },
  { "key": "fiber_ready", "label": "Fibre disponible", "dataType": "BOOL" },
  { "key": "parking_spaces", "label": "Places de parking", "dataType": "INT" }
]
```

---

### 6.7 Boutique / Commercial

```json
[
  { "key": "shop_area", "label": "Surface", "dataType": "DECIMAL", "unit": "m²" },
  { "key": "showcase", "label": "Vitrine", "dataType": "BOOL" },
  { "key": "ceiling_height", "label": "Hauteur sous plafond", "dataType": "DECIMAL", "unit": "m" },
  { "key": "storage_area", "label": "Réserve / stock", "dataType": "DECIMAL", "unit": "m²" },
  { "key": "lease_rights", "label": "Droit au bail / pas de porte", "dataType": "BOOL" }
]
```

---

### 6.8 Entrepôt / Industriel

```json
[
  { "key": "warehouse_area", "label": "Surface entrepôt", "dataType": "DECIMAL", "unit": "m²" },
  { "key": "office_area", "label": "Surface bureaux", "dataType": "DECIMAL", "unit": "m²" },
  { "key": "ceiling_height", "label": "Hauteur sous plafond", "dataType": "DECIMAL", "unit": "m" },
  { "key": "loading_dock", "label": "Quai de chargement", "dataType": "BOOL" },
  { "key": "heavy_truck_access", "label": "Accès poids lourds", "dataType": "BOOL" }
]
```

---

### 6.9 Terrain

```json
[
  { "key": "land_area", "label": "Surface terrain", "dataType": "DECIMAL", "unit": "m²" },
  { "key": "land_title", "label": "Type de titre", "dataType": "SELECT" },
  { "key": "serviced_water", "label": "Eau disponible", "dataType": "BOOL" },
  { "key": "serviced_power", "label": "Électricité disponible", "dataType": "BOOL" },
  { "key": "zoning", "label": "Zonage", "dataType": "SELECT" }
]
```

Options `land_title` :

```json
[
  { "value": "ACD", "label": "ACD" },
  { "value": "CPF", "label": "CPF" },
  { "value": "TF", "label": "Titre foncier" },
  { "value": "ATTESTATION", "label": "Attestation" }
]
```

Options `zoning` :

```json
[
  { "value": "RESIDENTIAL", "label": "Résidentiel" },
  { "value": "COMMERCIAL", "label": "Commercial" },
  { "value": "MIXED", "label": "Mixte" },
  { "value": "AGRICULTURAL", "label": "Agricole" }
]
```

---

### 6.10 Immeuble

```json
[
  { "key": "floors_count", "label": "Nombre d’étages", "dataType": "INT" },
  { "key": "units_count", "label": "Nombre total de lots", "dataType": "INT" },
  { "key": "elevator", "label": "Ascenseur", "dataType": "BOOL" },
  { "key": "parking_spaces", "label": "Places de parking", "dataType": "INT" },
  { "key": "occupancy_rate", "label": "Taux d’occupation", "dataType": "DECIMAL", "unit": "%" }
]
```

---

### 6.11 Parking / Box

```json
[
  { "key": "covered", "label": "Couvert", "dataType": "BOOL" },
  { "key": "secure_access", "label": "Accès sécurisé", "dataType": "BOOL" },
  { "key": "vehicle_height_limit", "label": "Hauteur max véhicule", "dataType": "DECIMAL", "unit": "m" }
]
```

---

### 6.12 Lot – Programme neuf

```json
[
  { "key": "program_name", "label": "Programme", "dataType": "TEXT" },
  { "key": "lot_number", "label": "Numéro de lot", "dataType": "TEXT" },
  { "key": "delivery_date", "label": "Date de livraison", "dataType": "DATE" },
  { "key": "payment_schedule", "label": "Échéancier", "dataType": "JSON" }
]
```

---

## 7. Règles finales

- Chaque bien est lié à **un template figé**
- Les templates sont **versionnés**
- Les validations sont **pilotées par JSON**
- L’UI est générée **100 % dynamiquement**
- Le modèle est prêt pour :
  - multi-tenant
  - filtrage avancé
  - évolutions futures

---

FIN DU DOCUMENT

