# MODULE BIENS & ANNONCES (PROPERTIES MODULE)

## 1) Objet et périmètre

Le module **Biens (Properties)** constitue la **source de vérité unique** pour l’ensemble des actifs immobiliers gérés ou publiés via ImmoTopia :
- acquisition et saisie des biens,

- matching CRM (clients ↔ biens),
- organisation des visites et rendez-vous,
- gestion des contrats (vente, bail),




Le module doit impérativement supporter :
- **plusieurs types de biens** (résidentiel, commercial, terrain, parking, immeuble, programme neuf, etc.),
- des **modèles (templates) par type de bien** afin d’assurer la complétude et la qualité des données,
- plusieurs **modes de propriété et de gestion** :
  - biens appartenant et gérés par un **tenant** (agence / opérateur),
  - **annonces publiques** publiées par des **propriétaires particuliers enregistrés (non-tenants)**, avec possibilité de **mandat de gestion par un tenant**.

---

## 2) Concepts clés


### 2.2 Templates par type de bien (champs dynamiques)

Chaque type de bien dispose d’un **template de saisie dédié**, définissant :
- les champs affichés,
- les champs obligatoires vs facultatifs,
- les règles de validation,
- les valeurs par défaut,
- l’organisation par sections fonctionnelles (ex. : Bâtiment, Équipements, Juridique, Charges, Utilités).

Cette approche évite le modèle « formulaire unique » et garantit :
- une saisie rapide,
- une meilleure qualité des annonces,
- une homogénéité des données pour la recherche et le matching.

---

## 3) Types de biens supportés (socle extensible)

Le système doit supporter a minima les types suivants :
1. Appartement
2. Maison / Villa
3. Studio
4. Duplex / Triplex
5. Chambre / Colocation
6. Bureau
7. Boutique / Local commercial
8. Entrepôt / Industriel
9. Terrain
10. Immeuble
11. Parking / Box
12. Lot de programme neuf (Promoteur)

Ces types sont extensibles par configuration sans refonte technique.

---

## 4) Templates — Jeux de champs par type de bien

### 4.1 Champs communs à tous les biens

- Titre de l’annonce / du bien
- Référence interne unique
- Description détaillée (prévue multilingue à terme)
- Portée du bien : privé tenant / public
- Adresse complète
- Zone / quartier / secteur (location_zone)
- Coordonnées géographiques (latitude / longitude)
- Modes de transaction : vente / location / courte durée
- Prix (vente ou loyer)
- Frais, commissions et honoraires
- Surface (principale, utile, terrain si applicable)
- Nombre de pièces (extensible : chambres, salles d’eau)
- Statut d’ameublement
- Statut du bien (workflow)
- Disponibilité
- Médias : photos, vidéos, visite 360°
- Documents : titre foncier, mandat, plans, documents fiscaux
- Liaison avec contacts CRM (propriétaire, mandataire, client intéressé)

---

### 4.2 Appartement / Maison / Villa (Résidentiel)

- Étage / nombre de niveaux
- Ascenseur
- Année de construction
- Orientation
- Balcon / terrasse / jardin
- Parking / garage / cave
- Sécurité / gardiennage
- Connexion internet et utilités
- Charges de copropriété
- État général et besoins de rénovation

---

### 4.3 Terrain

- Superficie du terrain
- Façade
- Pente et nature du sol (optionnel)
- Zonage et usage autorisé
- Statut juridique (ACD, CPF, attestation villageoise, etc.)
- Viabilisation (eau, électricité, voirie)
- Contraintes de constructibilité

---

### 4.4 Bureau / Local commercial / Entrepôt

- Surface totale et surface utile
- Cloisonnement
- Hauteur sous plafond
- Accès livraison
- Nombre de places de parking
- Droits d’enseigne
- Normes de sécurité et conformité
- Conditions de bail (durée, dépôt, indexation)

---

### 4.5 Immeuble

- Nombre d’étages
- Nombre total de lots
- Typologie des lots
- Taux d’occupation actuel
- Revenus locatifs (option avancée)
- Équipements techniques (groupe électrogène, ascenseurs, cuves, etc.)

---

### 4.6 Lot de programme neuf (Promoteur)

- Programme immobilier
- Bâtiment / bloc
- Numéro de lot
- Date prévisionnelle de livraison
- Échéancier de paiement
- Statut de réservation
- Plans et options de finitions

---

## 5) Propriété, gestion et visibilité (tenant & public)

### 5.1 Propriété du bien

Un bien peut relever de l’un des modes suivants :

- **Bien tenant** :
  Le bien appartient et est géré par un tenant (agence ou opérateur immobilier).

  Le bien appartient à un **utilisateur enregistré particulier**, qui n’est pas tenant de la plateforme.
  - le propriétaire crée et gère directement son annonce sur le portail public,
  - le bien n’appartient à aucun tenant par défaut.

  Le propriétaire non-tenant peut confier la gestion de son annonce à un tenant via un **mandat**.
  - le propriétaire reste juridiquement et fonctionnellement propriétaire du bien,
  - le tenant agit uniquement comme gestionnaire/mandataire.

Recommandations fonctionnelles :
- champ `ownership_type` : TENANT | PUBLIC | CLIENT
- champ `owner_contact_id` (contact CRM propriétaire)
- champ `tenant_id` conservé comme **tenant gestionnaire** lorsqu’un mandat existe.

---


## 6) Fonctionnalités avancées (niveau professionnel)

### 6.1 Qualité et scoring des annonces

- Score de complétude automatique (champs obligatoires, médias, géolocalisation).
- Suggestions intelligentes :
  - champs manquants,
  - amélioration de description,
  - cohérence prix / marché (option IA).

---

### 6.2 Workflow et cycle de vie du bien

Statuts standards :
- Brouillon
- En validation
- Disponible
- Réservé
- Sous offre
- Loué / Vendu
- Archivé

Historique et traçabilité complète des modifications (audit).

---

### 6.3 Intégration CRM & matching

- Association biens ↔ affaires CRM.
- Suggestions automatiques de biens selon les critères clients.
- Suivi : proposé / visité / négociation / conclu.

---

### 6.4 Visites et rendez-vous

- Création de visites directement depuis la fiche bien.
- Liaison avec contacts et affaires.
- Synchronisation avec le calendrier CRM.

---

### 6.5 Marketing et diffusion

- Génération automatique :
  - fiche PDF du bien,
  - lien de partage public,
  - supports optimisés pour WhatsApp et réseaux sociaux.

---

### 6.6 Gestion multi-lots

- Biens conteneurs (immeuble, programme).
- Lots enfants avec héritage partiel des informations.
- Vue agrégée : disponibilités, fourchettes de prix, typologies.

---

### 6.7 Conformité et contrôle des risques

- Détection de doublons (adresse, géolocalisation, surface, propriétaire).
- Vérification obligatoire des documents légaux avant publication.
- Contrôle d’accès fin par rôle (agent, manager, administrateur).

---

## 7) MVP recommandé

1. Création de biens avec templates par type
2. Gestion basique des statuts
3. Upload médias et géolocalisation
4. Publication / dépublication sur le portail public
5. Liaison avec contacts et affaires CRM
6. Planification de visites
7. Recherche et filtres (interne tenant + public)

