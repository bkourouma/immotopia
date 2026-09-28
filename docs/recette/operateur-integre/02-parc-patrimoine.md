# Partie C — Parc immobilier et patrimoine

Constitution du parc de l'opérateur (immeuble locatif, villa sous mandat
privé, terrain à vendre) et exercice du module Patrimoine (valorisations,
dépenses, emprunts, travaux) sur ces biens. Couvre les domaines « Parc
immobilier » — modules **CORE** et **PATRIMOINE** —
(`docs/fonctionnalites/sous-fonctionnalites.md`), à l'exclusion du Syndic
(partie 08) et de la Gestion locative (partie 04).

---

## Prérequis

- Partie B terminée : opérateur « Groupe Intégré Recette OI » actif, admin.oi
  et les trois collaborateurs connectés au moins une fois.
- Compte utilisé pour la création : admin.oi@recette.test (droits complets),
  sauf mention contraire.

## Réalité de l'environnement

- **Quatre sous-fonctionnalités « Mandats de gestion (biens CLIENT) » sans
  écran.** Le composant `PropertyMandateForm`
  (`apps/web/src/components/properties/PropertyMandateForm.tsx`) n'est
  importé nulle part dans l'application, et les fonctions de service
  associées (`createMandate`, `getPropertyMandates`, `getTenantMandates`,
  `revokeMandate`, `packages/api/src/services/property-service.ts` lignes
  ~161–206 côté API, `apps/web/src/services/property-service.ts` côté web)
  n'ont aucun appelant dans le code React. Malgré le statut « Disponible »
  et un chemin de menu indiqué dans le wiki, **il n'existe aucun bouton pour
  créer, consulter ou révoquer un mandat de gestion** : la Villa Riviera OI
  sera créée en bien `CLIENT` avec un propriétaire désigné, mais le mandat
  formel ne peut pas être posé par clic. Suspicion d'anomalie à signaler.
- **Score de qualité de la fiche sans écran.** `PropertyQualityScore`
  (`apps/web/src/components/properties/PropertyQualityScore.tsx`) n'est
  importé nulle part : la route `GET .../quality` existe côté API mais rien
  ne l'appelle depuis l'interface.
- **Historique des statuts sans écran.** `PropertyStatusHistory`
  (`apps/web/src/components/properties/PropertyStatusHistory.tsx`) n'est
  importé nulle part non plus.
- **Pas de bouton « Changer le statut ».** `PropertyStatusWorkflow`
  (`apps/web/src/components/properties/PropertyStatusWorkflow.tsx`) n'est
  importé nulle part : aucun écran ne permet de changer manuellement le
  statut d'un bien (`POST .../status`) ; le statut n'évolue qu'en
  conséquence d'autres actions (acceptation d'une offre → réservé, signature
  d'un compromis → sous offre, passage à l'acte → vendu — voir la partie D).
- **Pas d'onglet « Documents » distinct.** La fiche bien
  (`apps/web/src/pages/properties/PropertyDetail.tsx`) n'a que les onglets
  Aperçu, Médias, Lots (immeuble), Maintenance, Patrimoine, Visites : les
  documents du bien (titre de propriété, diagnostic, etc.) se gèrent depuis
  l'onglet **Patrimoine**, qui réutilise le même modèle `PropertyDocument`
  que la route `documents` du wiki. Ce n'est pas une anomalie de
  fonctionnement (le mécanisme marche), mais le libellé de menu du wiki
  (« onglet Documents ») ne correspond à aucun onglet réel.
- **Publication et médias se gèrent depuis la page Modifier, pas depuis la
  fiche.** Les contrôles « Publier sur le portail public » / « Retirer du
  portail public » (`PropertyPublicationControls.tsx`) et le téléversement
  de photos/vidéos (`PropertyMediaUpload`) sont rendus sur
  `/properties/:id/edit` (`PropertyEdit.tsx`) ; l'onglet « Médias » de la
  fiche (`PropertyDetail.tsx`) n'affiche qu'un carrousel de lecture.
- **Conditions de publication exactes**
  (`packages/api/src/services/property-publication-service.ts`,
  `validatePublicationRequirements`) : titre, description et adresse non
  vides, une photo principale, une latitude/longitude renseignées, un prix,
  un statut parmi Disponible/Réservé/Sous offre, et aucun document
  obligatoire invalide ou expiré. La latitude/longitude vient du champ
  « Localisation » (recherche de commune) du formulaire, pas d'une saisie
  libre.
- **Le référentiel géographique n'a pas d'écran propre.** Il n'existe qu'en
  tant que champ « Localisation » à autocomplétion dans les formulaires
  (bien, contact...) — jamais une entrée de menu dédiée, y compris pour
  « Consulter toutes les communes ».
- **Un bien en mode Vente, ou découpé en sous-biens, ne compte jamais dans
  aucun quota de lot** (règle déjà connue de la partie 09) : sans incidence
  ici puisque cette partie ne teste pas les quotas, mais utile pour
  comprendre pourquoi l'immeuble et ses appartements Vente de l'immeuble B
  éventuels ne feraient bouger aucune jauge.
- **Suppression d'un bien : permission incohérente.** Le wiki note que
  `DELETE .../properties/:id` utilise `PROPERTIES_EDIT`, pas une permission
  `PROPERTIES_DELETE` dédiée — un Agent qui a `PROPERTIES_EDIT` (voir partie
  B) peut donc, en théorie, supprimer un bien. Non vérifié à l'écran ici
  (l'étape C.11 est jouée par l'admin), simple point de vigilance.

---

## Jeu de données créé dans cette partie

Immeuble **Résidence Les Palmiers OI** (Cocody, location) avec les
appartements **Palmiers A1/A2/A3** ; villa **Villa Riviera OI**
(propriétaire privé Kouassi Yao OI, `ownershipType` CLIENT, location) ;
terrain **Terrain Bingerville OI** (vente) ; le client propriétaire Kouassi
Yao OI est créé à la volée par la fiche bien si nécessaire (`ownerEmail`).

---

### C.1 — Créer l'immeuble « Résidence Les Palmiers OI »

**Compte :** admin.oi@recette.test
**Action :** menu **Biens > Toutes les propriétés**
(`/tenant/<TENANT>/properties`) → bouton de création → assistant
(`PropertyFormWizard.tsx`). Type de bien **Immeuble**, mode **Location**,
adresse `Cocody, Abidjan` (recherche de commune), titre
`Résidence Les Palmiers OI`.
**Attendu :** la liste des propriétés (`GET .../properties`) affiche le
nouveau bien avec sa référence interne générée ; la fiche
(`/properties/:id`) s'ouvre sur l'onglet Aperçu avec les informations
saisies. Le formulaire a chargé le gabarit de champs du type Immeuble
(`GET /property-templates/IMMEUBLE`) : les champs spécifiques (nombre
d'appartements déclaré, etc.) apparaissent.
**Couvre :** Parc immobilier / Fiche bien / Créer un bien ; Consulter la
liste des biens ; Consulter le détail d'un bien ; Consulter les modèles de
champs par type de bien.

### C.2 — Créer les appartements Palmiers A1/A2/A3

**Compte :** admin.oi@recette.test
**Action :** fiche de l'immeuble, onglet **Lots** → créer trois sous-biens
« Palmiers A1 », « Palmiers A2 », « Palmiers A3 » (type Appartement, mode
Location, hérite de l'adresse du parent).
**Attendu :** les trois lots apparaissent dans l'onglet Lots avec
`containerParentId` pointant vers l'immeuble ; chacun a sa propre fiche
accessible.
**Couvre :** Parc immobilier / Fiche bien / Créer un sous-bien (appartement
d'un immeuble) ; Consulter les sous-biens d'un immeuble.

### C.3 — Médias de « Palmiers A1 »

**Compte :** admin.oi@recette.test
**Action :** fiche « Palmiers A1 » → bouton « Modifier »
(`/properties/:id/edit`) → section médias
(`PropertyMediaUpload`/`PropertyMediaGallery`) : téléverser une photo puis
une seconde, désigner l'une des deux comme principale, réordonner (si
plusieurs), téléverser une courte vidéo, puis supprimer une des photos.
Revenir sur la fiche, onglet **Médias**.
**Attendu :** les photos/vidéo apparaissent dans la galerie d'édition ; sur
la fiche, l'onglet Médias affiche un carrousel avec la vignette « Voir » et
une section Vidéos ; le badge de comptage sur l'onglet Médias reflète le
nombre après suppression.
**Couvre :** Parc immobilier / Médias du bien / Ajouter un média ;
Consulter les médias ; Réordonner les médias ; Définir la photo principale ;
Supprimer un média.

### C.4 — Documents de « Palmiers A1 » (onglet Patrimoine)

**Compte :** admin.oi@recette.test
**Action :** fiche « Palmiers A1 », onglet **Patrimoine**
(`PropertyPatrimoineTab.tsx`) → section documents : ajouter un document
(ex. « Titre de propriété », PDF), consulter la liste, télécharger le
fichier ajouté, puis en supprimer un second ajouté pour le test.
**Attendu :** le document apparaît dans la liste avec son type et son
statut de validité (`isValid`) calculé selon l'expiration ; le
téléchargement sert un flux binaire (jamais un chemin disque exposé) ; la
suppression retire fichier et enregistrement.
**Couvre :** Parc immobilier / Documents du bien / Ajouter un document ;
Consulter la liste des documents ; Télécharger le fichier d'un document ;
Supprimer un document ; Documents patrimoniaux / Consulter les documents
patrimoniaux ; Ajouter un document patrimonial ; Supprimer un document
patrimonial (même mécanisme, un seul onglet réel — voir « Réalité de
l'environnement »).

### C.5 — Compléter, publier et dépublier « Palmiers A1 »

**Compte :** admin.oi@recette.test
**Action :** sur `/properties/:id/edit`, compléter les champs requis pour la
publication (description, prix, adresse déjà géolocalisée par la recherche
de commune), s'assurer d'une photo principale et d'un statut Disponible.
Dans la carte « Publication », cliquer « Publier sur le portail public ».
Puis, sur `/public/properties` (portail public, sans authentification),
retrouver le bien et ouvrir sa fiche publique. Revenir sur l'édition,
cliquer « Retirer du portail public ».
**Attendu :**

- Si une condition manque : bandeau « Conditions de publication non
  remplies » avec la liste précise des champs en cause (titre, description,
  adresse, photo principale, géolocalisation, prix, statut, documents
  obligatoires).
- Une fois toutes les conditions réunies : tag « Publié » ; message
  « Propriété publiée avec succès ».
- Portail public (`/public/properties`) : le bien apparaît dans la liste
  publique ; sa fiche de détail public affiche médias et documents valides.
- Après retrait : tag « Non publié » ; message « Propriété retirée du
  portail public » ; le bien disparaît de `/public/properties`.
  **Couvre :** Parc immobilier / Fiche bien / Publier un bien sur le portail
  public ; Dépublier un bien ; Modifier un bien ; Portail public des annonces /
  Consulter la liste des biens publiés ; Consulter le détail d'un bien publié.

### C.6 — Visites sur les appartements Palmiers

**Compte :** admin.oi@recette.test
**Action :** fiche « Palmiers A2 », onglet **Visites** → planifier une
visite (date future, durée, type). Modifier son statut (ex. confirmée), puis
la clôturer avec une note de compte-rendu. Consulter ensuite **Biens >
Calendrier des visites** (`/tenant/<TENANT>/properties/visits/calendar`).
**Attendu :** la visite créée apparaît dans l'onglet Visites du bien avec
son statut ; après clôture, statut « Terminée » (`DONE`) et note visible ;
le calendrier de l'agence liste la visite à sa date, filtrable par
collaborateur assigné.
**Couvre :** Parc immobilier / Visites / Planifier une visite ; Consulter
les visites d'un bien ; Modifier le statut d'une visite ; Clôturer une
visite (compte-rendu) ; Consulter le calendrier des visites de l'agence.

### C.7 — Créer la Villa « Villa Riviera OI » (bien CLIENT)

**Compte :** admin.oi@recette.test
**Action :** **Biens > Toutes les propriétés** → créer un bien, type
**Maison/Villa**, mode **Location**, adresse à Abidjan, titre
`Villa Riviera OI`. Dans la section propriété, choisir « Mandat de gestion »
(`ownershipType = CLIENT`) et renseigner l'e-mail du propriétaire
`proprio.oi@recette.test` (Kouassi Yao OI).
**Attendu :** le bien est créé avec `ownershipType: CLIENT` ; la fiche
affiche le propriétaire désigné (Kouassi Yao OI) dans le bandeau
d'information ; **aucun mandat de gestion formel n'est créé par cette
action** — il n'existe pas d'écran pour cela (voir « Réalité de
l'environnement »). Consigner ce point précisément dans le journal.
**Couvre :** Parc immobilier / Fiche bien / Créer un bien (variante bien
CLIENT).

### C.8 — Indivision de la Villa Riviera OI

**Compte :** admin.oi@recette.test
**Action :** fiche « Villa Riviera OI », onglet Aperçu → carte
**Indivision** (`PropertyOwnershipCard.tsx`) : consulter la répartition
affichée par défaut (déduite du propriétaire désigné), puis poser une
répartition explicite à 100 % pour Kouassi Yao OI (un seul propriétaire, à
titre de vérification du principe).
**Attendu :** `GET .../ownership` renvoie le propriétaire déduit
(`leaseOwner`) avant toute saisie ; après enregistrement, `PUT .../ownership`
remplace la répartition et l'affiche telle quelle (100 % Kouassi Yao OI).
**Couvre :** Parc immobilier / Indivision / quotes-parts du bien / Consulter
la répartition des quotes-parts ; Définir/modifier la répartition des
quotes-parts.

### C.9 — Créer le Terrain « Terrain Bingerville OI »

**Compte :** admin.oi@recette.test
**Action :** créer un bien type **Terrain**, mode **Vente**, adresse
Bingerville, titre `Terrain Bingerville OI`, propriété de l'agence
(`ownershipType = TENANT`).
**Attendu :** bien créé, visible dans la liste, statut initial (brouillon ou
disponible selon le gabarit du type Terrain).
**Couvre :** Parc immobilier / Fiche bien / Créer un bien (déjà couvert en
C.1/C.7 — regroupé ici pour la suite en partie D, qui l'utilisera pour la
vente).

### C.10 — Recherche avancée et suppression d'un bien de test

**Compte :** admin.oi@recette.test
**Action :** **Biens > Toutes les propriétés**, barre de recherche avancée :
filtrer par ville `Abidjan` et type `TERRAIN` pour retrouver le terrain créé
en C.9. Créer ensuite un bien jetable (« OI — à supprimer »), puis le
supprimer depuis sa fiche.
**Attendu :** la recherche renvoie le terrain ; la suppression du bien
jetable répond 204 et il disparaît de la liste. Si aucune affaire CRM
(`CrmDeal`) active n'y est liée, la suppression réussit toujours (elle est
bloquée sinon).
**Couvre :** Parc immobilier / Fiche bien / Rechercher des biens (recherche
avancée) ; Supprimer un bien.

### C.11 — Patrimoine : vue consolidée et performance

**Compte :** admin.oi@recette.test
**Action :** menu **Patrimoine > Vue consolidée**
(`/tenant/<TENANT>/patrimoine`), puis **Patrimoine > Performance**
(`/tenant/<TENANT>/patrimoine/performance`) : consulter l'aperçu portefeuille
(sans sélection de bien) puis sélectionner « Villa Riviera OI » dans le
menu déroulant pour voir son rendement.
**Attendu :** la vue consolidée affiche un agrégat du patrimoine (valeur
totale, indicateurs) et un aperçu des travaux en cours ; la page Performance
sans bien sélectionné affiche l'aperçu portefeuille, puis avec « Villa
Riviera OI » sélectionnée, les rendements brut/net (le net-net et la
plus-value latente affichent « — » tant qu'aucun prix d'acquisition n'est
connu pour ce bien).
**Couvre :** Parc immobilier / Vue consolidée du patrimoine / Consulter la
vue consolidée ; Performance du patrimoine / Consulter la performance
(portefeuille ou par bien) ; Consulter le rendement d'un bien.

### C.12 — Valorisations, dépenses et emprunts de la Villa

**Compte :** admin.oi@recette.test
**Action :** fiche « Villa Riviera OI », onglet **Patrimoine** :

- Valorisations : ajouter une estimation (méthode « Marché », valeur,
  devise), consulter la liste, ouvrir son détail, la modifier, puis en
  ajouter une seconde jetable pour la supprimer.
- Dépenses : ajouter une charge (catégorie, montant > 0, date, moyen de
  paiement), consulter, modifier, supprimer une dépense de test.
- Emprunts : ajouter un prêt (prêteur, capital, mensualité, taux, dates),
  consulter, modifier son statut, supprimer un emprunt de test.
  **Attendu :** chaque création apparaît immédiatement dans sa liste
  respective de l'onglet Patrimoine ; les modifications et suppressions se
  reflètent sans rechargement complet nécessaire.
  **Couvre :** Parc immobilier / Valorisations d'un bien (Consulter, Ajouter,
  Détail, Modifier, Supprimer) ; Dépenses / charges d'un bien (idem) ;
  Emprunts liés à un bien (idem).

### C.13 — Programme de travaux sur la Villa et vue transversale

**Compte :** admin.oi@recette.test
**Action :** fiche « Villa Riviera OI », onglet Patrimoine → ajouter un
programme de travaux (titre, coût estimé > 0, date planifiée). Ouvrir son
détail, le modifier (coût réel, statut « En cours »). Puis menu
**Patrimoine > Travaux** (`/tenant/<TENANT>/patrimoine/work-programs`) pour
la vue transversale de l'agence, filtrer par statut.
**Attendu :** le programme apparaît sur la fiche du bien avec son statut par
défaut « Planifié » (`PLANNED`) ; après modification, statut « En cours » et
coût réel affichés ; la page « Travaux » de l'agence liste tous les
programmes (dont celui-ci) avec le bien associé, filtrable par statut.
**Couvre :** Parc immobilier / Programmes de travaux / Consulter les
travaux d'un bien ; Consulter tous les travaux de l'agence ; Ajouter un
programme de travaux ; Consulter le détail d'un programme ; Modifier un
programme de travaux ; Supprimer un programme de travaux (à faire sur un
second programme jetable).

---

## Hors interface

- **Mandats de gestion (biens CLIENT)** — Créer un mandat, Consulter les
  mandats d'un bien, Révoquer un mandat, Consulter tous les mandats de
  l'agence : aucun écran ne les déclenche (composant orphelin, voir
  « Réalité de l'environnement »). Suspicion d'anomalie à remonter.
- **Consulter/recalculer le score de qualité de la fiche** — composant
  `PropertyQualityScore` jamais monté dans une page.
- **Changer le statut d'un bien / Consulter l'historique des statuts** —
  composants `PropertyStatusWorkflow` et `PropertyStatusHistory` jamais
  montés ; le statut change uniquement en conséquence d'autres actions
  (voir partie D pour la vente, partie 04 pour la location).
- **Rattacher/détacher un programme de travaux à un chantier financier** —
  dépend du chantier « Chantier Émeraude OI », créé en partie 07 (Promoteur),
  pas encore disponible à ce stade ; non couvert ici.
- **Alerter les propriétaires d'un document qui arrive à échéance** — tâche
  planifiée quotidienne (`document-expiry-alert-job.ts`), aucune route API
  ni écran ; ne peut pas être déclenchée depuis le navigateur.
- **Référentiel géographique (Rechercher, Toutes les communes, Régions d'un
  pays, Communes d'une région, Détail d'une commune)** — exercé implicitement
  par le champ « Localisation » des formulaires (C.1, C.7, C.9) ; aucune
  entrée de menu dédiée à tester isolément.

## Couverture

| Fonctionnalité (wiki)                      | Sous-fonctionnalités couvertes                                                                                                              | Étapes                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Fiche bien                                 | Créer, Consulter liste/détail, Modifier, Supprimer, Créer/consulter sous-bien, Publier/Dépublier, Rechercher (avancée), Consulter templates | C.1, C.2, C.5, C.7, C.9, C.10 |
| Médias du bien                             | Ajouter, Consulter, Réordonner, Définir principale, Supprimer                                                                               | C.3                           |
| Documents du bien                          | Ajouter, Consulter, Télécharger, Supprimer                                                                                                  | C.4                           |
| Indivision / quotes-parts                  | Consulter, Définir/modifier                                                                                                                 | C.8                           |
| Visites                                    | Planifier, Consulter, Modifier statut, Clôturer, Calendrier agence                                                                          | C.6                           |
| Portail public des annonces                | Liste publiée, Détail publié                                                                                                                | C.5                           |
| Vue consolidée / Performance du patrimoine | Vue consolidée, Performance portefeuille/bien, Rendement d'un bien                                                                          | C.11                          |
| Valorisations / Dépenses / Emprunts        | Consulter, Ajouter, Détail, Modifier, Supprimer (×3 catégories)                                                                             | C.12                          |
| Programmes de travaux                      | Consulter (bien + agence), Ajouter, Détail, Modifier, Supprimer                                                                             | C.13                          |
| Documents patrimoniaux                     | Consulter, Ajouter, Supprimer                                                                                                               | C.4                           |

**Non couvertes, avec raison :** Mandats de gestion (4), Score de qualité (1),
Changer le statut (1), Historique des statuts (1), Rattacher un programme à
un chantier (1), Alerte d'échéance de document (1), Référentiel géographique
en tant qu'écran isolé (5) — voir « Hors interface » ci-dessus pour le détail
de chacune.
