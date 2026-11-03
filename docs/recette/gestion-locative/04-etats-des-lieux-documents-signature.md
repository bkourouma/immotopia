# Recette Gestion locative — 04 États des lieux, documents et signature électronique

**Périmètre.** Onglet « États des lieux » d'un bail (entrée et sortie : création, brouillon, photos, finalisation,
retenues sur le dépôt, comparaison) ; onglet « Documents » (contrat de bail, reçus, relevé, régénération,
téléchargement) ; onglet « Signatures » du bail et de l'état des lieux (envoi, signataires, canaux e-mail / SMS /
sur place, relance, annulation, page publique `/signer/<jeton>`, PDF scellé) ; écran global « Paramétrage ›
Signatures » (`/tenant/<idA>/signatures`).

**Prérequis.**

- Fichiers 01, 02 et 03 passés. Baux utilisés : **L1** (documents, signature sur place), **L2** (sans état des lieux,
  signature séquentielle), **L3** (état des lieux d'entrée standard, signature par e-mail), **L4** (refus, SMS,
  régénération), **L5** (villa meublée : cycle complet entrée → sortie → solde), **L6** (bail commercial), **L10**
  (annulé), **L11** (vente seule). Les contacts C1 à C4 ont les téléphones `+225 07 00 00 00 0n` (n = 1 à 4) renseignés dans
  leur fiche (champ « Téléphone principal »).
- Environnement : les e-mails sont écrits en fichiers `.eml` dans le puits SMTP (liens `/signer/<jeton>`, codes à 6
  chiffres). WhatsApp est neutralisé ; le SMS est en mode « journal » (`SMS_PROVIDER=log`) : l'option SMS est proposée
  et acceptée, le code ou le lien SMS est lu dans le journal de l'API **si** ce mode les y écrit (sinon le cas le note
  « bloqué : message SMS illisible » et on poursuit par un autre canal). Abonnements appliqués (`enforce`) : le pack
  Agence ouvre un quota mensuel de signatures (provisoirement 20).
- La conversion du contrat DOCX en PDF (LibreOffice sur le poste) est nécessaire à l'envoi d'un bail en signature ;
  sinon l'envoi échoue avec « La conversion du contrat en PDF a échoué. » et tous les cas d'envoi de bail sont bloqués
  (à noter une seule fois).
- Fichiers de test : `REC-GL-photo.jpg` (JPEG ≤ 1 Mo), `REC-GL-photo.png`, `REC-GL-photo.webp`, `REC-GL-anim.gif`,
  `REC-GL-notes.pdf`, `REC-GL-grosse-photo.jpg` (> 10 Mo), `REC-GL-modele-incomplet.docx` (voir fichier 01).

**Données créées par ce fichier.**

| Repère | Objet                          | Valeurs                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EDL-3E | État des lieux d'entrée de L3  | modèle « Bâti seulement », réduit à la pièce « Entrée/Séjour » (7 éléments tous « Bon »), agent `REC-GL Agent`, locataire présent `REC-GL-Aminata KONE`, finalisé                                                                                                                                                                                                                              |
| EDL-5E | État des lieux d'entrée de L5  | modèle « Bâti, mobilier et équipements », réduit à « Entrée/Séjour » (18 éléments tous « Bon », quantité 1 sauf Téléviseur 2, Fauteuils 2, Télécommandes 2), valeurs de remplacement Canapé 300 000 et Téléviseur 150 000, clés 3, compteurs électricité `10 250`, eau `540,5`, gaz vide ; agent `REC-GL Agent` ; **locataire absent** (interrupteur éteint, nom du locataire vide) ; finalisé |
| EDL-5S | État des lieux de sortie de L5 | Murs « Mauvais », Canapé « Manquant », Téléviseur quantité 1, clés 2, compteurs `10 120` / `548` / `12` ; retenues 475 000 ; finalisé                                                                                                                                                                                                                                                          |
| DOC-…  | Documents de L1                | contrat `BAIL-AAAA-000x` (L1), `…-A2`, reçus `RCU-AAAAMM-000n`, relevé `RLV-AAAAMM-000n`                                                                                                                                                                                                                                                                                                       |
| SIG-…  | Demandes de signature          | L3 (e-mail), L2 (séquentiel), L4 (refus, SMS), L1 (sur place), EDL-3E                                                                                                                                                                                                                                                                                                                          |

---

## A. États des lieux : entrée

### GL-04-001 — Onglet « États des lieux » sans document

- **Rôle** : ADMIN_A
- **Préconditions** : L3 sans état des lieux.
- **Données** : aucune.
- **Étapes** : fiche de L3 › onglet « États des lieux ».
- **Attendu** :
  - Deux cartes : « État des lieux d'entrée » et « État des lieux de sortie », chacune avec l'étiquette « Non réalisé » et
    le bouton « Commencer » ; l'info-bulle de la carte de sortie dit « Reprend les pièces de l'entrée pour la
    comparaison. ».
  - Pas de bouton « Comparer entrée et sortie » (il faut les deux documents).
  - Réseau : `GET …/leases/<leaseId>/inspections` répond 200 avec une liste vide.
- **Gravité si échec** : Majeur

### GL-04-002 — Commencer l'état des lieux d'entrée (modèle « Bâti seulement »)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-04-001 fait ; P3 non meublé.
- **Données** : date du jour (par défaut), modèle « Bâti seulement ».
- **Étapes** :
  1. Carte d'entrée › « Commencer ». La fenêtre s'intitule « Commencer l'état des lieux d'entrée ».
  2. Lire le modèle présélectionné, garder la date, cliquer « Commencer ».
- **Attendu** :
  - Fenêtre : « Date de l'état des lieux » (aujourd'hui au format JJ/MM/AAAA), « Modèle de départ » avec « Bâti
    seulement » (présélectionné pour un bien non meublé) et « Bâti, mobilier et équipements ».
  - L'écran de saisie s'ouvre sur un brouillon : 5 pièces (« Entrée/Séjour », « Cuisine », « Chambre 1 », « Salle de bain »,
    « WC ») et 33 éléments de bâti (7, 9, 8, 6, 3), tous « Non renseigné » ; compteur « 0 éléments évalués sur 33 ».
  - Réseau : `POST …/inspections` répond 201 avec `type` `ENTRY`, `status` `DRAFT`.
- **Gravité si échec** : Bloquant

### GL-04-003 — Annuler la fenêtre de démarrage, date effacée

- **Rôle** : ADMIN_A
- **Préconditions** : L1 sans état des lieux.
- **Données** : date effacée.
- **Étapes** : « Commencer » › effacer la date (croix) › observer le bouton ; remettre la date ; « Annuler » ; rouvrir et fermer
  par la croix.
- **Attendu** : le bouton « Commencer » est désactivé sans date ; « Annuler » ou la croix ferme la fenêtre sans rien créer
  (l'onglet affiche toujours « Non réalisé »).
- **Gravité si échec** : Mineur

### GL-04-004 — Commencer l'entrée d'un bien meublé (modèle complet)

- **Rôle** : ADMIN_A
- **Préconditions** : L5 (bien P6 « Meublé »), sans état des lieux.
- **Données** : modèle présélectionné.
- **Étapes** : fiche de L5 › « États des lieux » › « Commencer » (entrée).
- **Attendu** :
  - Le modèle « Bâti, mobilier et équipements » est présélectionné (le bien est meublé).
  - Brouillon à 6 pièces : « Entrée/Séjour », « Cuisine », « Chambre 1 », « Salle de bain », « WC » et « Équipements et
    divers » ; 76 éléments (33 de bâti + 43 de mobilier et équipements) ; compteur « 0 éléments évalués sur 76 ».
  - Les éléments de mobilier portent déjà la **quantité 1** ; exemples : « Canapé », « Téléviseur », « Réfrigérateur »,
    « Lit », « Extincteur ».
- **Gravité si échec** : Majeur

### GL-04-005 — Évaluer des éléments : six états

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon d'entrée de L3 ouvert.
- **Données** : éléments « Sol » (Neuf), « Murs » (Bon), « Plafond » (Usagé), « Portes » (Mauvais), « Fenêtres » (HS),
  « Éclairage » (Manquant) ; commentaire sur « Murs » : `REC-GL fissure fine`.
- **Étapes** : cliquer le bouton d'état de chaque élément ; saisir le commentaire.
- **Attendu** : six boutons par élément — « Neuf », « Bon », « Usagé », « Mauvais », « HS », « Manquant » — de couleurs
  différentes (vert foncé à rouge ; « Manquant » violet) ; l'état choisi est rempli ; le compteur monte à « 6 éléments
  évalués sur 33 » ; le champ « Commentaire (optionnel) » accepte le texte ; rien n'est encore envoyé au serveur.
- **Gravité si échec** : Majeur

### GL-04-006 — Pièces et éléments : ajouter, renommer, supprimer

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon d'entrée de L3.
- **Données** : nouvelle pièce `Terrasse` ; nouvel élément `Garde-corps` ; renommer `Chambre 1` en `Chambre parentale`.
- **Étapes** :
  1. Saisir `Terrasse` dans « Nouvelle pièce » puis « Ajouter une pièce » (ou Entrée).
  2. Dans cette pièce, « Nouvel élément » = `Garde-corps` › « Ajouter ».
  3. Cliquer le nom d'une pièce (modifiable) et renommer.
  4. Supprimer l'élément (icône corbeille), puis la pièce : la confirmation est « Supprimer cette pièce ? ».
- **Attendu** : la pièce et l'élément apparaissent (élément non évalué, signalé « 1 à évaluer ») ; un nom de pièce vide
  est ignoré ; la suppression de la pièce demande confirmation ; ajouter une pièce ou un élément à nom vide n'a aucun
  effet.
- **Gravité si échec** : Mineur

### GL-04-007 — Mobilier : quantité et valeur de remplacement

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon d'entrée de L5 (modèle meublé).
- **Données** : « Téléviseur » quantité 2, valeur de remplacement `150 000` ; « Canapé » quantité 1, valeur `300 000` ; élément
  ajouté avec la case « Mobilier (avec quantité) » cochée : `Lampe de chevet`.
- **Étapes** : utiliser les boutons « − » / « + » (« Diminuer la quantité » / « Augmenter la quantité ») et le champ de
  quantité ; saisir les valeurs ; essayer quantité `-1`, `10000`, `2,5` et valeur `100 000 001`.
- **Attendu** :
  - « − » est désactivé à 0 ; « + » à 9 999 ; le champ n'accepte que des entiers de 0 à 9 999 ; la valeur de remplacement
    est un entier de 0 à 100 000 000, affichée avec séparateur d'espaces et unité « FCFA, à l'unité ».
  - Un nouvel élément de mobilier ajouté à l'entrée démarre à la quantité 1.
  - Choisir l'état « Manquant » sur un mobilier met sa quantité à 0 et la verrouille ; en sortir remet la quantité à vide.
- **Gravité si échec** : Majeur

### GL-04-008 — Compteurs et clés

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon d'entrée de L5.
- **Données** : électricité `10 250` ; eau `540,5` ; gaz vide ; nombre de clés `3` (puis essayer `-1`).
- **Étapes** : saisir dans la carte « Compteurs et clés » (champs « Électricité », « Eau », « Gaz », « Nombre de clés »).
- **Attendu** : les relevés acceptent du texte libre (120 caractères au plus côté serveur) ; « Nombre de clés » refuse les
  valeurs négatives et les décimales ; à l'entrée, aucun rappel « Entrée : … » n'est affiché.
- **Gravité si échec** : Mineur

### GL-04-009 — Observations, présence du locataire et signataires

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon d'entrée de L3.
- **Données** : observations `REC-GL RAS` ; interrupteur « Le locataire est présent » ; « Nom du locataire signataire » =
  `REC-GL-Aminata KONE` ; « Nom de l'agent » = `REC-GL Agent`.
- **Étapes** : saisir dans « Observations générales » et la carte « Signatures » ; éteindre puis rallumer l'interrupteur.
- **Attendu** : interrupteur éteint → « Nom du locataire signataire » est désactivé ; allumé → saisissable ; aucune
  retenue n'est affichée à l'entrée (les retenues n'existent que pour une sortie).
- **Gravité si échec** : Mineur

### GL-04-010 — Enregistrer le brouillon, recharger

- **Rôle** : ADMIN_A
- **Préconditions** : GL-04-005 à GL-04-009 faits.
- **Données** : date de l'état des lieux changée (`01/11/2026`).
- **Étapes** : cliquer « Enregistrer » ; recharger (F5) ; rouvrir « États des lieux » › « Continuer ».
- **Attendu** : message « État des lieux enregistré » ; carte d'entrée « Brouillon » avec le bouton « Continuer » ; après
  F5 toutes les saisies (états, quantités, compteurs, noms, date) sont conservées ; `PUT …/inspections/<id>` répond 200.
- **Gravité si échec** : Bloquant

### GL-04-011 — Saisie non enregistrée : copie locale

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon d'entrée de L3 enregistré.
- **Données** : commentaire `REC-GL texte local` ajouté sans enregistrer.
- **Étapes** :
  1. Saisir le commentaire, cliquer « Retour » (sans enregistrer).
  2. Rouvrir par « Continuer ».
  3. Cliquer « Restaurer » (puis refaire et cliquer « Ignorer »).
  4. Rouvrir le brouillon sans avoir rien modifié depuis la dernière sauvegarde, cliquer « Retour », rouvrir.
- **Attendu** :
  - Étape 2 : bandeau « Une saisie locale non enregistrée a été trouvée pour cet état des lieux. » avec « Restaurer » et
    « Ignorer ».
  - « Restaurer » remet le commentaire ; « Ignorer » le supprime et efface la copie.
  - Étape 4 : aucun bandeau ne devrait apparaître puisque rien n'a changé. Écart probable : le bandeau réapparaît (la copie
    locale est écrite dès l'ouverture) — gravité Mineur.
- **Gravité si échec** : Mineur

### GL-04-012 — Photos : ajouter, voir, supprimer

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon d'entrée de L3.
- **Données** : `REC-GL-photo.jpg` sur « Murs » ; `REC-GL-photo.png` et `REC-GL-photo.webp` sur « Sol ».
- **Étapes** : sous un élément, cliquer le bouton « Photo », choisir le fichier ; répéter ; cliquer la croix rouge d'une
  vignette (« Supprimer la photo »).
- **Attendu** :
  - Chaque photo s'envoie immédiatement (sans « Enregistrer ») : vignette sous l'élément ; `POST …/inspections/<id>/photos`
    répond 201.
  - La vignette se charge par une requête authentifiée `GET …/photos/<photoId>/file` (200, `Content-Type` image).
  - Suppression : la vignette disparaît ; `DELETE …/photos/<photoId>` répond 200.
  - Après F5, les photos restantes sont toujours rattachées à leurs éléments.
- **Gravité si échec** : Majeur

### GL-04-013 — Photos refusées

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon d'entrée.
- **Données** : `REC-GL-anim.gif`, `REC-GL-notes.pdf`, `REC-GL-grosse-photo.jpg` (> 10 Mo), fichier de 0 octet.
- **Étapes** : tenter chaque fichier avec le bouton « Photo » (le sélecteur propose « image/* »).
- **Attendu** : GIF et PDF : message d'erreur issu du serveur, du type « Type de fichier non autorisé. Formats acceptés :
  JPEG, PNG, WebP. » ; photo de plus de 10 Mo : refus clair (« Fichier trop volumineux : 10 Mo maximum. » ou message
  équivalent) ; fichier vide : refus ; aucune vignette fantôme ni 500.
- **Gravité si échec** : Mineur

### GL-04-014 — Photos : accès réservé et isolation

- **Rôle** : ADMIN_B puis ADMIN_A
- **Préconditions** : photo existante dans le brouillon de L3 ; `<photoId>`, `<inspectionId>` relevés dans le réseau.
- **Données** : adresse de la photo `/api/tenants/<idA>/rental/leases/<leaseIdL3>/inspections/<inspectionId>/photos/<photoId>/file`.
- **Étapes** :
  1. ADMIN_B : ouvrir cette adresse ; puis la même avec `<idB>`.
  2. Sans être connecté (fenêtre privée) : ouvrir l'adresse.
  3. ADMIN_A : vérifier qu'aucune adresse de type `/uploads/…` ne permet de lire la photo.
- **Attendu** : étape 1 : 403 puis 404 ; étape 2 : 401 ; étape 3 : le fichier n'est pas servi en statique (les photos
  sortent seulement par la route authentifiée).
- **Gravité si échec** : Bloquant (fichier privé exposé)

### GL-04-015 — Finalisation refusée : des éléments ne sont pas évalués

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon d'entrée de L3 avec des éléments « Non renseigné » ; noms de l'agent et du locataire renseignés.
- **Données** : aucune.
- **Étapes** : cliquer « Finaliser ».
- **Attendu** : le brouillon est d'abord enregistré, puis un bandeau orange « N éléments ne sont pas encore évalués. »
  liste jusqu'à 10 éléments « pièce — élément » (puis « et N autres ») ; les pièces concernées s'ouvrent et les éléments
  sont entourés en orange ; la fenêtre de confirmation ne s'ouvre pas.
- **Gravité si échec** : Majeur

### GL-04-016 — Finalisation refusée : signataires manquants

- **Rôle** : ADMIN_A
- **Préconditions** : tous les éléments évalués ; « Nom de l'agent » vide, puis « Le locataire est présent » allumé avec nom vide.
- **Données** : aucune.
- **Étapes** : « Finaliser » dans chaque situation.
- **Attendu** : nom de l'agent vide → erreur « Le nom du signataire pour l'agence est requis pour finaliser. » ; locataire
  présent sans nom → « Le nom du signataire locataire est requis : le locataire était présent. » ; l'état reste en brouillon.
- **Gravité si échec** : Majeur

### GL-04-017 — Finalisation d'un document sans élément

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon sans aucune pièce (toutes supprimées), nom de l'agent saisi.
- **Données** : aucune.
- **Étapes** : « Finaliser » et confirmer.
- **Attendu** : erreur « Au moins un élément doit avoir un état renseigné avant de finaliser. » ; le texte « Aucune pièce
  pour le moment. » s'affiche dans la carte « Pièces » ; l'état reste en brouillon. Restaurer ensuite des pièces (supprimer
  le brouillon et recommencer si besoin).
- **Gravité si échec** : Mineur

### GL-04-018 — Finaliser l'état des lieux d'entrée de L3 (EDL-3E)

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon d'entrée de L3 réduit à « Entrée/Séjour » (supprimer les 4 autres pièces) ; les 7 éléments à « Bon ».
- **Données** : agent `REC-GL Agent` ; locataire présent, nom `REC-GL-Aminata KONE`.
- **Étapes** : « Finaliser » › dans la boîte « Finaliser l'état des lieux ? » (« Une fois finalisé, l'état des lieux ne peut
  plus être modifié. ») cliquer d'abord « Annuler », puis « Finaliser » de nouveau et confirmer par « Finaliser ».
- **Attendu** :
  - « Annuler » laisse le brouillon intact. Confirmation : message « État des lieux finalisé » ; l'écran passe en lecture
    seule.
  - La carte d'entrée indique « Finalisé » et la date de finalisation (jour du mois en toutes lettres) avec le bouton
    « Consulter ».
  - Réseau : `POST …/inspections/<id>/finalize` répond 200 (`status` `FINALIZED`, `finalizedAt` renseigné).
- **Gravité si échec** : Bloquant

### GL-04-019 — Consultation d'un état des lieux finalisé

- **Rôle** : ADMIN_A
- **Préconditions** : EDL-3E finalisé.
- **Données** : aucune.
- **Étapes** : « Consulter » ; lire l'écran ; cliquer « Imprimer » (aperçu d'impression) puis « Retour ».
- **Attendu** : boutons « Retour », « Imprimer » et « Signatures » ; titre « État des lieux d'entrée », « Réalisé le <date> »,
  « Finalisé le <date> » ; pièces et éléments en lecture seule (pastilles d'état, aucun champ modifiable, aucune zone d'ajout
  de photo) ; compteurs, observations, signataires affichés ; à l'impression, les boutons sont masqués.
- **Gravité si échec** : Majeur

### GL-04-020 — Un état finalisé ne se modifie plus

- **Rôle** : ADMIN_A
- **Préconditions** : EDL-3E finalisé.
- **Données** : aucune.
- **Étapes** :
  1. Chercher un moyen de modifier ou supprimer le document depuis l'écran.
  2. Console (même session) : `PUT …/inspections/<id>` avec un corps valide ; `DELETE …/inspections/<id>` ;
     `POST …/inspections/<id>/photos` ; `POST …/inspections/<id>/finalize`.
- **Attendu** : aucun bouton « Continuer », « Enregistrer » ou « Supprimer » (le viewer est en lecture seule). Console :
  409 « Cet état des lieux est finalisé : il ne peut plus être modifié. » ; 409 « …il ne peut plus être supprimé. » ;
  409 « …il ne peut plus recevoir de photos. » ; 409 « Cet état des lieux est déjà finalisé. ».
- **Gravité si échec** : Bloquant (modification d'un document finalisé)

### GL-04-021 — Supprimer un brouillon

- **Rôle** : ADMIN_A
- **Préconditions** : bail L2 sans état des lieux ; brouillon d'entrée créé avec une photo et une saisie locale.
- **Données** : aucune.
- **Étapes** : « Supprimer le brouillon » › la boîte « Supprimer ce brouillon ? » (« Cette action est irréversible. ») ›
  « Annuler », puis de nouveau et « Supprimer ».
- **Attendu** : « Annuler » ne supprime rien ; « Supprimer » : message « Brouillon supprimé » ; l'onglet revient à « Non
  réalisé » ; la photo est supprimée du disque (la route de la photo répond 404 ensuite) ; la copie locale est effacée
  (rouvrir ne propose aucune restauration).
- **Gravité si échec** : Majeur

### GL-04-022 — Deux entrées pour le même bail

- **Rôle** : ADMIN_A
- **Préconditions** : deux onglets du navigateur ouverts sur l'onglet « États des lieux » de L4 (sans état des lieux).
- **Données** : aucune.
- **Étapes** : dans l'onglet 1 : « Commencer » (entrée) puis valider ; dans l'onglet 2 (écran périmé) : « Commencer » (entrée)
  puis valider.
- **Attendu** : l'onglet 2 reçoit 409 « Un état des lieux d'entrée existe déjà pour ce bail. » (message d'erreur affiché) ;
  un seul état d'entrée existe (le brouillon de L4, conservé jusqu'à GL-04-023).
- **Gravité si échec** : Majeur

### GL-04-023 — États des lieux : droits et isolation

- **Rôle** : LECTEUR_A puis ADMIN_B
- **Préconditions** : EDL-3E finalisé ; brouillon d'entrée de L4 (créé en GL-04-022).
- **Données** : aucune.
- **Étapes** :
  1. LECTEUR_A : consulter EDL-3E ; tenter « Commencer » une sortie, « Enregistrer » le brouillon de L4, « Finaliser ».
  2. ADMIN_B (console) : `GET /api/tenants/<idB>/rental/leases/<leaseIdL3>/inspections`, `…/inspections/compare`,
     `PUT …/inspections/<id>`, `POST …/finalize`.
- **Attendu** : étape 1 : lecture possible ; chaque écriture refusée 403 « Vous n'avez pas les droits nécessaires… »
  (boutons visibles néanmoins — constat). Étape 2 : 404 « Bail introuvable. » ; rien n'est modifié. À la fin,
  supprimer le brouillon d'entrée de L4 (« Supprimer le brouillon ») pour libérer L4.
- **Gravité si échec** : Bloquant

## B. États des lieux : sortie, retenues, comparaison

### GL-04-024 — Sortie sans entrée : choix du modèle

- **Rôle** : ADMIN_A
- **Préconditions** : L2 sans état des lieux.
- **Données** : modèle « Bâti, mobilier et équipements ».
- **Étapes** : carte de sortie › « Commencer » › choisir le modèle complet › « Commencer » ; observer ; puis supprimer le
  brouillon.
- **Attendu** : la fenêtre « Commencer l'état des lieux de sortie » propose le choix du modèle (aucune entrée à reprendre) ;
  le brouillon compte 6 pièces et 76 éléments dont les quantités sont **vides** (à renseigner) ; aucun rappel « Entrée : »
  ; pas de bouton « Comparer entrée et sortie ».
- **Gravité si échec** : Mineur

### GL-04-025 — Sortie avec une entrée finalisée (L5)

- **Rôle** : ADMIN_A
- **Préconditions** : EDL-5E finalisé (créer l'entrée de L5 comme en GL-04-004 à GL-04-010 et GL-04-018 en suivant le tableau :
  supprimer les pièces autres que « Entrée/Séjour », tous les éléments « Bon », quantités 1 sauf Téléviseur 2, Fauteuils 2,
  Télécommandes 2, valeurs de remplacement Canapé 300 000, Téléviseur 150 000, clés 3, compteurs `10 250` / `540,5`).
- **Données** : sortie datée d'aujourd'hui.
- **Étapes** : carte de sortie › « Commencer ». Lire la fenêtre et l'écran qui suit.
- **Attendu** :
  - La fenêtre n'a plus de choix de modèle ; elle dit « Reprend les pièces de l'entrée pour la comparaison. ».
  - Brouillon de sortie : mêmes pièce et éléments que l'entrée, états vides, quantités vides, valeurs de remplacement
    conservées ; sous chaque élément un rappel gris « Entrée : Bon » (et « · 2 » pour une quantité).
  - Les compteurs et les clés montrent « Entrée : … » sous chaque champ ; la section « Retenues sur le dépôt de garantie »
    est visible (« Aucune retenue pour le moment. »).
- **Gravité si échec** : Bloquant

### GL-04-026 — Sortie créée alors que l'entrée est encore en brouillon

- **Rôle** : ADMIN_A
- **Préconditions** : un bail avec une entrée **en brouillon** (par exemple L6 : créer une entrée sans la finaliser).
- **Données** : aucune.
- **Étapes** : démarrer la sortie de L6 ; modifier l'entrée (renommer une pièce) ; revenir à la sortie.
- **Attendu** : aucun blocage : la sortie reprend les pièces de l'entrée brouillon (constat) ; les contraintes de la
  sortie (élément d'entrée non supprimable, libellé figé) ne s'appliquent que face à une entrée **finalisée** ; la sortie ne
  suit pas les changements faits ensuite à l'entrée brouillon. Supprimer les deux brouillons ensuite.
- **Gravité si échec** : Mineur

### GL-04-027 — Éléments repris de l'entrée : ni supprimables, ni renommables

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon de sortie de L5 (GL-04-025).
- **Données** : tentative de suppression de « Murs » ; de la pièce « Entrée/Séjour » ; ajout de `Store extérieur` (élément propre
  à la sortie).
- **Étapes** : repérer les boutons de suppression ; survoler la corbeille de la pièce ; ajouter un élément.
- **Attendu** :
  - Aucune corbeille sur les éléments repris de l'entrée ; la corbeille de la pièce est grisée avec l'info-bulle « Indiquez
    « Manquant » plutôt que de retirer un élément de l'entrée. » ; la valeur de remplacement d'un élément repris est affichée
    en texte, non modifiable.
  - Un élément ajouté en sortie reste supprimable ; un mobilier ajouté en sortie démarre **sans** quantité.
  - Console : un `PUT` qui retire un élément d'entrée répond 400 « Un élément repris de l'état des lieux d'entrée ne peut
    pas être retiré de la sortie : indiquez « Manquant ». » (avec la liste des éléments).
- **Gravité si échec** : Majeur

### GL-04-028 — Dégradé, manquant, baisse de quantité

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon de sortie de L5.
- **Données** : « Murs » → Mauvais ; « Canapé » → Manquant ; « Téléviseur » → Bon avec quantité 1 (entrée : 2) ; les autres
  éléments → Bon ; « Fauteuils » et « Télécommandes » : quantité 2.
- **Étapes** : renseigner chaque élément et lire les rappels.
- **Attendu** :
  - « Murs » : fond rouge clair et pastille rouge « Dégradé » (Bon → Mauvais).
  - « Canapé » : fond violet clair, pastille violette « Manquant », quantité verrouillée à 0.
  - « Téléviseur » : pastille violette « Baisse de quantité (−1) ».
  - Un élément « Manquant » à l'entrée ne compte pas comme manquant à la sortie.
- **Gravité si échec** : Majeur

### GL-04-029 — Bouton « Comme à l'entrée »

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon de sortie de L5, mobilier non manquant.
- **Données** : « Fauteuils » (entrée 2), « Télécommandes » (entrée 2).
- **Étapes** : sous la quantité, cliquer « Comme à l'entrée (2) ».
- **Attendu** : la quantité prend la valeur de l'entrée (2) ; le bouton n'existe pas pour un élément « Manquant » ni pour un
  élément de bâti.
- **Gravité si échec** : Cosmétique

### GL-04-030 — Compteurs et clés en sortie

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon de sortie de L5.
- **Données** : électricité `10 120` ; eau `548` ; gaz `12` ; clés `2`.
- **Étapes** : saisir les relevés ; lire les rappels sous chaque champ.
- **Attendu** : sous « Électricité » : « Entrée : 10 250 » ; « Eau » : « Entrée : 540,5 » ; « Gaz » : « Entrée : — » ; « Nombre de clés » :
  « Entrée : 3 ».
- **Gravité si échec** : Mineur

### GL-04-031 — Proposer les retenues depuis les dégradations et manquants

- **Rôle** : ADMIN_A
- **Préconditions** : GL-04-028 et GL-04-030 faits ; aucune retenue.
- **Données** : aucune.
- **Étapes** : section « Retenues sur le dépôt de garantie » › « Proposer depuis les dégradations et manquants ».
- **Attendu** : quatre lignes ajoutées, dans cet ordre :
  1. « Entrée/Séjour — Murs (dégradé) » : 0 FCFA ;
  2. « Entrée/Séjour — Canapé : 1 manquant(s) » : **300 000** FCFA (valeur 300 000 × 1) ;
  3. « Entrée/Séjour — Téléviseur : 1 manquant(s) sur 2 » : **150 000** FCFA (150 000 × 1) ;
  4. « Clés manquantes : 1 » : 0 FCFA.
     Total affiché « Total : 450 000 FCFA ». Aucune ligne n'est enregistrée tant qu'on ne clique pas « Enregistrer ».
- **Gravité si échec** : Bloquant (montants de retenue faux)

### GL-04-032 — Proposer deux fois, ou sans écart

- **Rôle** : ADMIN_A
- **Préconditions** : GL-04-031 fait.
- **Données** : aucune.
- **Étapes** : recliquer sur « Proposer depuis les dégradations et manquants » ; sur un autre brouillon de sortie sans écart,
  cliquer le même bouton.
- **Attendu** : pas de doublon (une ligne par élément ; une seule ligne de clés) ; message « Aucune dégradation ni aucun
  manquant détecté pour le moment. » quand rien n'est à proposer.
- **Gravité si échec** : Mineur

### GL-04-033 — Modifier, ajouter et supprimer des lignes de retenue

- **Rôle** : ADMIN_A
- **Préconditions** : quatre lignes proposées.
- **Données** : ligne « Murs » : montant `25 000` ; nouvelle ligne `REC-GL peinture` `0` puis supprimée ; ligne « Canapé »
  modifiée à `280 000`, puis remise à `300 000`.
- **Étapes** : modifier les montants et libellés ; « Ajouter une ligne » ; supprimer (corbeille « Supprimer cette retenue »).
- **Attendu** :
  - Sous une ligne dont le montant a changé, l'indication « Proposé : 300 000 FCFA » (montant proposé conservé) ; elle
    disparaît quand le montant revient à 300 000.
  - Le total se recalcule : après la saisie de 25 000 pour « Murs » : **475 000** (25 000 + 300 000 + 150 000 + 0).
  - Une ligne manuelle ajoutée est vide (libellé à saisir, montant 0).
  - « Enregistrer » conserve les lignes (après F5 elles sont là).
- **Gravité si échec** : Majeur

### GL-04-034 — Retenue invalide

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon de sortie avec une ligne vide.
- **Données** : libellé vide ; montant `-100` ; montant vide.
- **Étapes** : « Ajouter une ligne », laisser le libellé vide, « Enregistrer » ; saisir un montant négatif.
- **Attendu** : le champ de montant refuse le négatif ; un libellé vide est refusé par le serveur : « Les données fournies sont
  invalides. (… Libellé de retenue requis. …) » dans le bandeau d'erreur du formulaire ; rien n'est enregistré tant que le
  libellé manque.
- **Gravité si échec** : Mineur

### GL-04-035 — Finaliser la sortie : manquants sans retenue

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon de sortie de L5 évalué en entier, avec les retenues de GL-04-031 et GL-04-033 ; agent
  `REC-GL Agent` ; locataire présent `REC-GL-Aminata KONE`.
- **Données** : aucune.
- **Étapes** : supprimer la ligne de retenue « Canapé » (corbeille) ; « Finaliser » ; lire la boîte ; « Annuler » ; cliquer
  de nouveau « Proposer depuis les dégradations et manquants » (la ligne « Canapé » revient en fin de liste, les autres ne
  sont pas dupliquées) ; « Finaliser » et confirmer.
- **Attendu** :
  - Avec la ligne supprimée : la boîte « Finaliser l'état des lieux ? » ajoute « 1 éléments manquants n'ont pas de retenue.
    Vous pouvez finaliser quand même. » (la finalisation n'est pas bloquée).
  - Avec toutes les lignes : pas d'avertissement ; confirmation → « État des lieux finalisé » (EDL-5S, retenues 475 000,
    lignes enregistrées dans l'ordre Murs, Téléviseur, Clés manquantes, Canapé).
- **Gravité si échec** : Majeur

### GL-04-036 — Consultation de la sortie finalisée

- **Rôle** : ADMIN_A
- **Préconditions** : EDL-5S finalisé.
- **Données** : aucune.
- **Étapes** : carte de sortie › « Consulter ».
- **Attendu** : lecture seule ; rappels « Entrée : … » à côté des compteurs et des clés ; section « Retenues sur le dépôt de
  garantie » avec les 4 lignes en lecture seule (Murs « 25 000 FCFA », Téléviseur « 150 000 FCFA », Clés « 0 FCFA », Canapé
  « 300 000 FCFA ») et « Total : 475 000 FCFA » ; mêmes pastilles Dégradé / Manquant / Baisse de quantité ; bouton « Comparer entrée et sortie » visible
  sur l'onglet.
- **Gravité si échec** : Majeur

### GL-04-037 — Comparaison entrée et sortie : synthèse et tableau

- **Rôle** : ADMIN_A
- **Préconditions** : EDL-5E et EDL-5S finalisés.
- **Données** : aucune.
- **Étapes** : « Comparer entrée et sortie » ; lire la synthèse et le tableau ; activer « Afficher seulement les écarts » ;
  « Exporter ».
- **Attendu** :
  - Fenêtre « Comparaison entrée et sortie » ; cartes : « Manquants » **1**, « Baisses de quantité » **1**, « Dégradés » **1**,
    « Valeur de remplacement des manquants » **450 000 FCFA** (Canapé 300 000 + Téléviseur 150 000).
  - « Clés : 3 à l'entrée, 2 à la sortie » avec la pastille « Clés manquantes : 1 ».
  - Tableau (colonnes « Pièce », « Élément », « État d'entrée », « État de sortie », « Quantité (entrée → sortie) »,
    « Valeur des manquants ») : lignes colorées pour Murs (rouge), Canapé (violet, « Manquant », valeur 300 000),
    Téléviseur (violet, « Baisse de quantité (−1) », quantité « 2 → 1 », valeur 150 000).
  - Avec le commutateur : seules ces trois lignes restent. L'export (Excel / CSV) contient les mêmes lignes.
  - Réseau : `GET …/inspections/compare` répond 200.
- **Gravité si échec** : Bloquant (comparaison fausse)

### GL-04-038 — Comparaison des compteurs

- **Rôle** : ADMIN_A
- **Préconditions** : GL-04-037 ouverte.
- **Données** : électricité `10 250` → `10 120` ; eau `540,5` → `548` ; gaz vide → `12`.
- **Étapes** : lire le tableau « Compteur ».
- **Attendu** : trois lignes. Électricité : entrée 10 250, sortie 10 120, différence **-130** avec la mention « Relevé de sortie
  inférieur à celui d'entrée » ; Eau : 540,5 → 548, différence **7,5** ; Gaz : entrée « — », sortie 12, différence « — » (une
  seule valeur lisible).
- **Gravité si échec** : Majeur

### GL-04-039 — Comparaison impossible sans les deux documents

- **Rôle** : ADMIN_A
- **Préconditions** : L3 n'a que l'entrée (EDL-3E).
- **Données** : aucune.
- **Étapes** : onglet « États des lieux » de L3 ; console : `GET …/inspections/compare`.
- **Attendu** : le bouton « Comparer entrée et sortie » est absent ; l'API répond tout de même 200 (comparaison partielle,
  éléments d'entrée sans sortie), sans erreur 500.
- **Gravité si échec** : Mineur

### GL-04-040 — Retenues supérieures au dépôt

- **Rôle** : ADMIN_A
- **Préconditions** : brouillon de sortie ; dépôt du bail inférieur au total des retenues.
- **Données** : une ligne de retenue de `5 000 000` sur L4 (dépôt 90 000) — jouer sur un brouillon de sortie de L4 puis le
  supprimer.
- **Étapes** : créer la sortie de L4 (sans entrée), ajouter la ligne, « Enregistrer ».
- **Attendu** : aucun contrôle : le total de retenues peut dépasser le dépôt (constat). Le solde de tout compte affichera alors
  un « Reste dû par le locataire » (voir GL-03-033). Gravité de l'absence de garde-fou : Mineur. Supprimer le brouillon.
- **Gravité si échec** : Mineur

### GL-04-041 — Élément ajouté seulement à la sortie

- **Rôle** : ADMIN_A
- **Préconditions** : sortie de L5 en brouillon.
- **Données** : élément `Store extérieur` en état « Mauvais ».
- **Étapes** : ajouter, enregistrer ; ouvrir la comparaison après finalisation (ou sur un brouillon de test).
- **Attendu** : l'élément apparaît dans la comparaison avec un état d'entrée vide, sans être compté « Manquant » ni valorisé ;
  « Proposer… » ne génère aucune retenue pour lui.
- **Gravité si échec** : Mineur

### GL-04-042 — Supprimer une sortie en brouillon puis la recréer

- **Rôle** : ADMIN_A
- **Préconditions** : bail L3 avec entrée finalisée (EDL-3E).
- **Données** : sortie datée du jour.
- **Étapes** : créer la sortie de L3, saisir un état, « Supprimer le brouillon » ; recréer la sortie.
- **Attendu** : après suppression, la carte de sortie revient à « Non réalisé » ; la nouvelle sortie repart des pièces de
  l'entrée, vides ; aucune donnée de l'ancien brouillon ne persiste. (Garder ensuite cette sortie de L3 en brouillon ou la
  supprimer, sans importance pour la suite.)
- **Gravité si échec** : Mineur

### GL-04-043 — Impression du constat

- **Rôle** : ADMIN_A
- **Préconditions** : EDL-5S finalisé.
- **Données** : aucune.
- **Étapes** : « Consulter » › « Imprimer ».
- **Attendu** : la fenêtre d'impression du navigateur s'ouvre sur le constat ; les boutons « Retour », « Imprimer » et
  « Signatures » n'apparaissent pas dans l'aperçu ; la mise en page reste lisible.
- **Gravité si échec** : Cosmétique

### GL-04-044 — Sortie : éléments non évalués et mobilier sans quantité

- **Rôle** : ADMIN_A
- **Préconditions** : nouveau brouillon de sortie sur un bail avec entrée finalisée (créer une sortie pour L3, voir GL-04-042).
- **Données** : un mobilier sans quantité ; un élément sans état.
- **Étapes** : « Finaliser ».
- **Attendu** : bandeau « N éléments ne sont pas encore évalués. » ; les éléments sans état **et** les mobiliers non manquants
  sans quantité sont mis en avant ; le message ne cite que les éléments réellement incomplets.
- **Gravité si échec** : Majeur

### GL-04-045 — Solde de tout compte avec les retenues de la sortie (L5)

- **Rôle** : ADMIN_A
- **Préconditions** : EDL-5S finalisé avec retenues 475 000 ; dépôt de L5 : « Solde actuel » lu dans l'onglet « Dépôt de
  garantie » (570 000 si seuls les mouvements du fichier 03 ont été faits, moins les remboursements ultérieurs) ; aucune échéance
  de L5 échue et impayée.
- **Données** : résiliation de L5 : préavis `2026-10-01`, fin `2026-11-30`, initiative « Accord amiable ».
- **Étapes** : onglet « Vie du bail » de L5 › « Résilier le bail » › confirmer ; lire la carte « Solde de tout compte ».
- **Attendu** :
  - Aucun bandeau « L'état des lieux de sortie n'est pas finalisé… ».
  - « Dépôt détenu » = Solde actuel de l'onglet Dépôt (ex. 560 000 si 10 000 ont été remboursés en GL-03-062) ; « Impayés » 0 ;
    « Retenues (état des lieux) » : les 4 lignes de la sortie, dans l'ordre enregistré (« Entrée/Séjour — Murs (dégradé) »
    25 000, « Téléviseur : 1 manquant(s) sur 2 » 150 000, « Clés manquantes : 1 » 0, « Canapé : 1 manquant(s) » 300 000) et
    « Total des retenues » **475 000**.
  - Solde = dépôt détenu − 0 − 475 000. Avec un dépôt détenu de 560 000 : « À restituer au locataire : 85 000 FCFA ».
  - Les échéances de L5 postérieures à novembre 2026 non payées sont « Annulées » (12).
- **Gravité si échec** : Bloquant (solde faux)

---

## C. Documents locatifs

### GL-04-046 — Onglet « Documents » d'un bail sans document

- **Rôle** : ADMIN_A
- **Préconditions** : L1 sans document.
- **Données** : aucune.
- **Étapes** : fiche de L1 › onglet « Documents ».
- **Attendu** : titre « Documents » ; bouton « Générer un document » ; état vide « Aucun document pour ce bail. Générez-en
  un depuis l'action ci-dessus. » avec le bouton « Générer un document » ; pas de pagination.
- **Gravité si échec** : Mineur

### GL-04-047 — Formulaire « Générer un document »

- **Rôle** : ADMIN_A
- **Préconditions** : L1.
- **Données** : aucune.
- **Étapes** : « Générer un document » ; lire les champs ; ouvrir la liste « Type de document » ; modifier le type.
- **Attendu** :
  - Fenêtre « Générer un document » (feuille du bas sur mobile) : « Type de document » (par défaut « Contrat de bail »),
    « Titre (optionnel) », « Template (optionnel) », « Description (optionnel) », boutons « Annuler » et « Générer le
    document ».
  - Types : « Contrat de bail », « Avenant », « Reçu de loyer », « Quittance de loyer », « Reçu de dépôt », « Relevé »,
    « Autre ».
  - « Template (optionnel) » : si l'agence n'a aucun modèle actif pour ce type, la liste est grisée (« Aucun template
    disponible ») avec l'aide « Aucun template actif pour ce type de document. Le template par défaut sera utilisé. » ;
    sinon les modèles actifs sont proposés et le modèle « (Par défaut) » est présélectionné. La liste change avec le type
    choisi.
- **Gravité si échec** : Mineur

### GL-04-048 — Générer le contrat de bail de L1

- **Rôle** : ADMIN_A
- **Préconditions** : GL-04-046 fait.
- **Données** : type « Contrat de bail », aucun modèle choisi.
- **Étapes** : « Générer le document ».
- **Attendu** :
  - Message « Document généré. » ; la fenêtre se ferme.
  - Une ligne : numéro **égal au numéro du bail** (`BAIL-AAAA-0001`), type « Contrat de bail », « Émis le » aujourd'hui, statut
    « Final » ; sous-titre « 1 document » ; bouton « Télécharger » et menu « ⋮ » (« Régénérer à partir des données
    actuelles »).
  - Réseau : `POST /api/tenants/<idA>/documents/generate` répond 201 (`docType` `LEASE_CONTRACT`, `sourceKey` = identifiant du
    bail) ; la réponse ne contient ni chemin de fichier ni identifiant de stockage.
- **Gravité si échec** : Bloquant

### GL-04-049 — Télécharger le contrat et en lire le contenu

- **Rôle** : ADMIN_A
- **Préconditions** : GL-04-048 fait.
- **Données** : aucune.
- **Étapes** : « Télécharger » (le bouton passe en chargement) ; ouvrir le fichier dans un traitement de texte.
- **Attendu** : le fichier se nomme `BAIL-AAAA-0001.docx` ; `GET …/documents/<id>/download` répond 200 avec le type
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`. Le contrat reprend les données du bail :
  locataire `REC-GL-Aminata KONE`, propriétaire `REC-GL-Chantal DIALLO`, bien, dates (01/08/2026 → 31/07/2028 après le
  renouvellement du fichier 03), loyer 155 000 (ou valeur en vigueur), dépôt 300 000, agence ; aucune variable
  `{{…}}` restante, aucun « undefined ». Constat : la route fournit uniquement un fichier Word (pas de PDF direct).
- **Gravité si échec** : Bloquant

### GL-04-050 — Générer un second contrat pour le même bail

- **Rôle** : ADMIN_A
- **Préconditions** : GL-04-048 fait.
- **Données** : type « Contrat de bail ».
- **Étapes** : « Générer un document » › « Générer le document » de nouveau.
- **Attendu** : le second contrat est créé sans confirmation, sous le numéro `BAIL-AAAA-0001-A2` (puis `-A3`…) ; « 2
  documents » ; les deux sont « Final ». La boîte « Un contrat existe déjà pour ce bail » (prévue par l'écran pour proposer
  une régénération) n'apparaît jamais : constat Mineur (code mort). Chaque génération rend caduque toute demande de
  signature ouverte sur le bail (voir GL-04-088).
- **Gravité si échec** : Mineur

### GL-04-051 — Régénérer un document

- **Rôle** : ADMIN_A
- **Préconditions** : contrat `BAIL-AAAA-0001` ; changer d'abord le « Téléphone principal » de C1 en `+225 07 00 00 00 91`.
- **Données** : aucune.
- **Étapes** : ligne du contrat › « ⋮ » › « Régénérer à partir des données actuelles » ; la boîte « Régénérer ce document ? »
  (« Le document BAIL-AAAA-0001 sera reconstruit à partir des données actuelles du bail. La version précédente est
  remplacée. ») › « Annuler », puis de nouveau › « Régénérer » ; télécharger le fichier. Remettre ensuite le téléphone de C1.
- **Attendu** : « Annuler » ne fait rien ; « Régénérer » : message « Document régénéré. » ; le numéro reste identique,
  « Émis le » prend la date du jour ; le nouveau fichier porte le nouveau numéro de téléphone du locataire (si le modèle
  contient cette variable) ; `POST …/documents/<id>/regenerate` répond 200.
- **Gravité si échec** : Majeur

### GL-04-052 — Reçu de loyer

- **Rôle** : ADMIN_A
- **Préconditions** : L1 avec les échéances 08/2026 et 09/2026 encaissées.
- **Données** : type « Reçu de loyer ».
- **Étapes** : générer ; télécharger.
- **Attendu** : message « Document généré. » ; numéro `RCU-AAAAMM-NNNN` (mois en cours, séquence du mois) ; type « Reçu de loyer » ;
  statut « Final ». Le reçu porte sur le dernier paiement encaissé du bail (montant, date, locataire, bail) ; le numéro du
  reçu dans le fichier est le numéro du document.
- **Gravité si échec** : Majeur

### GL-04-053 — « Quittance de loyer » garde-t-elle son type ?

- **Rôle** : ADMIN_A
- **Préconditions** : GL-04-052 fait.
- **Données** : type « Quittance de loyer ».
- **Étapes** : générer ; lire la colonne « Type » de la nouvelle ligne.
- **Attendu** : un document est créé (numéro `RCU-…` suivant). Le type affiché devrait être « Quittance de loyer ». Écart
  probable : « Reçu de loyer » (le type choisi est ramené au modèle « Reçu de loyer » à la génération) — gravité Mineur.
- **Gravité si échec** : Mineur

### GL-04-054 — « Reçu de dépôt » et « Autre »

- **Rôle** : ADMIN_A
- **Préconditions** : paiement encaissé sur L1.
- **Données** : types « Reçu de dépôt » puis « Autre ».
- **Étapes** : générer chacun.
- **Attendu** : chaque type devrait donner un document de son propre type. Écart probable : les deux produisent un « Reçu de
  loyer » `RCU-…` (aucun modèle propre à ces types) — gravité Mineur (type de document trompeur).
- **Gravité si échec** : Mineur

### GL-04-055 — Reçu demandé sans paiement encaissé

- **Rôle** : ADMIN_A
- **Préconditions** : L2 sans aucun paiement encaissé.
- **Données** : type « Reçu de loyer ».
- **Étapes** : onglet « Documents » de L2 › générer.
- **Attendu** : la fenêtre reste ouverte avec le bandeau d'erreur « Aucun paiement encaissé pour ce bail : générez la
  quittance depuis un paiement ou une échéance payée. » (400) ; aucun document créé.
- **Gravité si échec** : Majeur

### GL-04-056 — « Avenant » : quel document est produit ?

- **Rôle** : ADMIN_A
- **Préconditions** : L1 avec ses contrats.
- **Données** : type « Avenant ».
- **Étapes** : générer ; lire la nouvelle ligne et le fichier.
- **Attendu** : un avenant devrait donner un document de type « Avenant ». Écart probable : c'est un **contrat de bail** complet
  (`BAIL-AAAA-0001-A3`, type « Contrat de bail ») — gravité Majeur (document erroné) ; en outre toute demande de
  signature ouverte sur le bail est annulée.
- **Gravité si échec** : Majeur

### GL-04-057 — Relevé

- **Rôle** : ADMIN_A
- **Préconditions** : L1.
- **Données** : type « Relevé ».
- **Étapes** : générer ; télécharger.
- **Attendu** : numéro `RLV-AAAAMM-NNNN`, type « Relevé » ; le relevé du compte locatif liste les échéances et paiements du
  bail. Si le modèle « Relevé de Compte Locatif » est absent : bandeau « Aucun template disponible… » (400) et aucun document.
- **Gravité si échec** : Majeur

### GL-04-058 — Titre et description du formulaire

- **Rôle** : ADMIN_A
- **Préconditions** : L1.
- **Données** : titre `REC-GL Titre test` ; description `REC-GL Description test`.
- **Étapes** : renseigner les deux champs, type « Reçu de loyer », générer ; lire la ligne.
- **Attendu** : le titre saisi devrait apparaître sous le numéro. Écart probable : aucun titre ni description n'est enregistré
  (champs ignorés à l'envoi) — gravité Mineur.
- **Gravité si échec** : Mineur

### GL-04-059 — Choisir un modèle, modèle incomplet

- **Rôle** : ADMIN_A
- **Préconditions** : ajouter dans « Modèles de documents » deux modèles « Bail Habitation » : `REC-GL Bail Habitation A`
  (valide) et `REC-GL Bail incomplet` (fichier `REC-GL-modele-incomplet.docx`).
- **Données** : modèles A, puis incomplet.
- **Étapes** : générer un contrat pour L1 en choisissant d'abord A, puis le modèle incomplet. Supprimer les deux modèles à la fin.
- **Attendu** : avec A : « Document généré. » et le fichier est celui du modèle A. Avec le modèle incomplet : le bandeau
  d'erreur « Champs critiques manquants: … » (liste des variables absentes) ; aucun document créé.
- **Gravité si échec** : Majeur

### GL-04-060 — Bail commercial : modèle commercial

- **Rôle** : ADMIN_A
- **Préconditions** : L6 (bien de type Bureau).
- **Données** : type « Contrat de bail ».
- **Étapes** : onglet « Documents » de L6 › générer ; ouvrir la liste « Template » avant de valider ; télécharger.
- **Attendu** : le contrat est produit avec le modèle de **bail commercial** (le choix dépend du type de bien) et porte le
  numéro de L6. Écart probable : la liste « Template » ne propose que des modèles « Bail Habitation » (même pour un
  bureau) ; en choisir un est sans effet (le modèle commercial est utilisé) — gravité Mineur.
- **Gravité si échec** : Majeur

### GL-04-061 — Filtres de la liste et URL partagée avec les autres onglets

- **Rôle** : ADMIN_A
- **Préconditions** : L1 avec au moins 3 documents de types différents (contrat, reçu, relevé).
- **Données** : type « Reçu de loyer » ; statut « Final » ; statut « Brouillon ».
- **Étapes** :
  1. Filtres « Type » puis « Statut » ; lire l'adresse ; F5 ; « Effacer les filtres ».
  2. Choisir le statut « Final » dans l'onglet « Documents », puis passer à l'onglet « Échéances » de la même fiche.
- **Attendu** :
  - Étape 1 : la liste se limite aux documents choisis (`?type=RENT_RECEIPT&status=FINAL`) ; « Brouillon » donne « Aucun
    résultat » (tous les documents générés sont « Final ») ; F5 conserve les filtres.
  - Étape 2 : l'onglet « Échéances » ne doit pas être gêné par un filtre de statut posé dans « Documents ». Écart probable :
    les onglets partagent le paramètre `status` de l'adresse, et « Échéances » reçoit `status=FINAL` (valeur sans
    sens pour une échéance) : liste vide ou erreur — gravité Majeur.
- **Gravité si échec** : Majeur

### GL-04-062 — Export de la liste des documents

- **Rôle** : ADMIN_A
- **Préconditions** : plusieurs documents.
- **Données** : aucune.
- **Étapes** : « Exporter » › Excel ou CSV.
- **Attendu** : fichier « Documents de location » avec une ligne par document (Document `numéro — titre`, Type, Émis le,
  Statut) ; « Export terminé (N lignes). ».
- **Gravité si échec** : Mineur

### GL-04-063 — Génération : annuler, double clic, rechargement

- **Rôle** : ADMIN_A
- **Préconditions** : onglet « Documents » de L1.
- **Données** : type « Relevé ».
- **Étapes** : ouvrir la fenêtre, « Annuler » ; rouvrir, double-cliquer « Générer le document » ; F5.
- **Attendu** : « Annuler » ne crée rien ; le double clic crée un seul document (un seul numéro `RLV-…` supplémentaire) ; F5
  conserve la liste.
- **Gravité si échec** : Majeur (doublon de document)

### GL-04-064 — Documents : droits

- **Rôle** : LECTEUR_A
- **Préconditions** : documents sur L1.
- **Données** : aucune.
- **Étapes** : consulter l'onglet « Documents » ; « Télécharger » ; « Générer un document » ; « Régénérer ».
- **Attendu** : liste et téléchargement possibles ; la génération et la régénération sont refusées 403 « Vous n'avez pas les
  droits nécessaires pour effectuer cette action. » (message dans la fenêtre / en toast) ; boutons visibles malgré tout.
- **Gravité si échec** : Bloquant (si l'écriture passe)

### GL-04-065 — Documents : isolation

- **Rôle** : ADMIN_B
- **Préconditions** : `<documentId>` d'un document de L1 relevé dans le réseau.
- **Données** : aucune.
- **Étapes** (console de B) : `GET /api/tenants/<idB>/documents/<documentId>/download` ;
  `POST /api/tenants/<idB>/documents/<documentId>/regenerate` ;
  `POST /api/tenants/<idB>/documents/generate` avec `sourceKey` = identifiant de L1 ; mêmes appels sur `<idA>`.
- **Attendu** : sur `<idB>` : 404 (« Document not found » ou « Document introuvable. ») et 404 « Bail introuvable » ; sur `<idA>` : 403. Aucun contenu d'un document de A n'est lisible. Noter que le message de téléchargement introuvable est en anglais
  (« Document not found », Cosmétique).
- **Gravité si échec** : Bloquant

### GL-04-066 — Bail « vente seule » : onglet Documents seul

- **Rôle** : ADMIN_A
- **Préconditions** : L11 (bien en vente).
- **Données** : types « Contrat de bail » et « Relevé ».
- **Étapes** : fiche de L11 › onglet « Documents » (seul onglet) › générer les deux documents.
- **Attendu** : le contrat est produit sous le numéro de L11 ; le relevé aussi (ou un message clair si les données financières
  manquent) ; aucune erreur 500.
- **Gravité si échec** : Mineur

## D. Signature électronique du bail

### GL-04-067 — Onglet « Signatures » sans demande

- **Rôle** : ADMIN_A
- **Préconditions** : L3 sans demande de signature.
- **Données** : aucune.
- **Étapes** : fiche de L3 › onglet « Signatures ».
- **Attendu** : texte « Signature électronique du document, signataire par signataire. », bouton « Envoyer pour signature »
  actif, état vide « Ce document n'a pas encore été envoyé pour signature ». Réseau : `GET /api/signatures?targetType=RentalLease&targetId=…` 200.
- **Gravité si échec** : Mineur

### GL-04-068 — Envoi sans contrat généré

- **Rôle** : ADMIN_A
- **Préconditions** : L4 sans aucun contrat.
- **Données** : signataires préremplis.
- **Étapes** : onglet « Signatures » de L4 › « Envoyer pour signature » › compléter les e-mails › « Envoyer ».
- **Attendu** : bandeau d'erreur dans la fenêtre « Aucun contrat n'a été généré pour ce bail : générez le contrat avant de
  l'envoyer en signature. » (400) ; aucune demande, quota non consommé.
- **Gravité si échec** : Majeur

### GL-04-069 — Générer les contrats de L2, L3 et L4

- **Rôle** : ADMIN_A
- **Préconditions** : L2, L3, L4.
- **Données** : type « Contrat de bail ».
- **Étapes** : pour chacun, onglet « Documents » › générer le contrat.
- **Attendu** : trois contrats « Final » numérotés comme leur bail. (Si le bail est de type commercial ou meublé, le modèle
  correspondant est choisi.)
- **Gravité si échec** : Bloquant (préalable)

### GL-04-070 — Fenêtre d'envoi : signataires préremplis

- **Rôle** : ADMIN_A
- **Préconditions** : contrat de L3 généré.
- **Données** : aucune.
- **Étapes** : onglet « Signatures » de L3 › « Envoyer pour signature » ; ouvrir la liste « Canal » de chaque ligne.
- **Attendu** :
  - Fenêtre « Envoyer pour signature » (largeur 720) ; une ligne par signataire : **Locataire** `REC-GL-Aminata KONE`, canal
    « E-mail », contact `rec-gl-aminata@packs.immotopia.test` ; **Bailleur** `REC-GL-Daouda YAO`, canal « E-mail »,
    contact `rec-gl-daouda@packs.immotopia.test` (un co-locataire, s'il y en a un, a une ligne « Co-locataire » à compléter).
  - « Signature dans l'ordre de la liste » éteint ; « Valable » 14 « jours ».
  - Canaux : « E-mail », « WhatsApp », « SMS », « Sur place ». Pour un signataire lié à un contact CRM, WhatsApp et SMS sont
    proposés ; pour une ligne ajoutée à la main, ils sont grisés avec « — Lier à un contact CRM ». Le SMS n'est pas grisé
    (le transport est actif en mode journal).
  - Le bouton « Envoyer » est actif ; « Annuler » ferme sans envoi.
- **Gravité si échec** : Majeur

### GL-04-071 — Fenêtre d'envoi : validations

- **Rôle** : ADMIN_A
- **Préconditions** : fenêtre ouverte sur L3.
- **Données** : nom effacé ; contact effacé ; e-mail `pas-un-email` ; nom `A` ; 11 signataires ; durée `0`, `31`, vide.
- **Étapes** : tester chaque cas ; essayer de retirer tous les signataires ; « Ajouter un signataire » jusqu'à 11.
- **Attendu** :
  - Nom ou contact vide : « Envoyer » reste désactivé.
  - E-mail invalide : « Adresse e-mail invalide pour <nom>. » (400) dans le bandeau ; rien n'est envoyé.
  - Nom d'un caractère : refus 400 avec détail de champ (au moins 2 caractères).
  - Le dernier signataire ne peut pas être retiré (bouton désactivé). À 11 signataires : refus 400 (10 au maximum).
  - Durée : bornée entre 1 et 30 ; vide → 14.
  - Aucune demande n'est créée dans ces cas ; le quota n'est pas consommé.
- **Gravité si échec** : Majeur

### GL-04-072 — Envoi nominal du bail L3 par e-mail

- **Rôle** : ADMIN_A
- **Préconditions** : contrat de L3 généré ; aucune demande ouverte.
- **Données** : les deux signataires préremplis, e-mail, non séquentiel, 14 jours.
- **Étapes** : « Envoyer ». Ouvrir le puits SMTP.
- **Attendu** :
  - Message « Demande de signature envoyée » ; la fenêtre se ferme ; une carte apparaît : étiquette bleue « Envoyée »,
    « Envoyée le JJ/MM/AAAA · expire le JJ/MM/AAAA » (+14 jours), boutons « PDF source », « Relancer », « Annuler la demande » ;
    deux signataires « En attente », avec « Locataire · E-mail · r…@… » (contact masqué).
  - Le bouton « Envoyer pour signature » est désormais désactivé.
  - Deux e-mails (`.eml`) arrivent : un par signataire, avec un lien `…/signer/<jeton>` (jeton long, non devinable).
  - Réseau : `POST /api/signatures` répond 201 ; la liste ne renvoie jamais de jeton ni de contact en clair.
- **Gravité si échec** : Bloquant

### GL-04-073 — Une seule demande ouverte à la fois

- **Rôle** : ADMIN_A
- **Préconditions** : demande ouverte sur L3.
- **Données** : aucune.
- **Étapes** : constater le bouton ; console : `POST /api/signatures` pour le même bail.
- **Attendu** : bouton « Envoyer pour signature » désactivé ; l'API refuse 409 « Une demande de signature est déjà en cours
  pour ce document : annulez-la avant d'en créer une autre. » ; le quota n'est pas consommé deux fois.
- **Gravité si échec** : Majeur

### GL-04-074 — Bail terminé ou annulé non signable

- **Rôle** : ADMIN_A
- **Préconditions** : L10 « Annulé » et LS « Terminé ».
- **Données** : un signataire e-mail quelconque.
- **Étapes** : onglet « Signatures » de L10 › « Envoyer pour signature » › « Envoyer » ; idem pour LS.
- **Attendu** : bandeau « Ce bail est terminé ou annulé : il ne peut plus être envoyé en signature. » (400) ; aucune demande.
- **Gravité si échec** : Majeur

### GL-04-075 — PDF source de la demande

- **Rôle** : ADMIN_A
- **Préconditions** : demande ouverte sur L3.
- **Données** : aucune.
- **Étapes** : cliquer « PDF source » ; ouvrir le fichier.
- **Attendu** : téléchargement `bail-BAIL-AAAA-0003-source.pdf` ; c'est un PDF du contrat de L3 identique au contrat généré ;
  `GET /api/signatures/<id>/file?variant=source` répond 200 (`application/pdf`, sans mise en cache). Le bouton « PDF signé »
  n'existe pas encore.
- **Gravité si échec** : Majeur

### GL-04-076 — Page publique : ouverture du lien du locataire

- **Rôle** : PUBLIC (fenêtre privée, sans session)
- **Préconditions** : e-mail du locataire C1 reçu (GL-04-072).
- **Données** : lien `/signer/<jeton-locataire>`.
- **Étapes** : ouvrir le lien ; lire la page ; regarder les en-têtes de la page.
- **Attendu** :
  - Hors de l'application (pas de menu) ; titre « Contrat de bail BAIL-AAAA-0003 » ; « Signataire : REC-GL-Aminata KONE
    (Locataire) » ; « Valable jusqu'au » avec la date ; iframe « Document à signer » et lien « Télécharger le document (PDF) » ;
    case de consentement avec son texte ; « Pour confirmer votre identité, recevez un code sur <contact masqué> » avec
    « Recevoir le code » et le champ « Code reçu » ; choix « Saisir mon nom » / « Dessiner » ; bouton « Signer le document »
    désactivé ; lien « Refuser de signer ».
  - La page demande aux moteurs de ne pas l'indexer et de ne pas envoyer le referrer. Le jeton n'apparaît pas dans les journaux
    de requêtes visibles (réponses sans mise en cache).
  - Côté agence (F5 de l'onglet « Signatures »), le locataire passe de « En attente » à « Document ouvert ».
- **Gravité si échec** : Bloquant

### GL-04-077 — Page publique : lecture du PDF

- **Rôle** : PUBLIC
- **Préconditions** : lien du locataire ouvert.
- **Données** : aucune.
- **Étapes** : lire le document dans l'iframe ; cliquer « Télécharger le document (PDF) ».
- **Attendu** : le PDF est le contrat de L3 ; `GET /api/public/signatures/<jeton>/file` répond 200 `application/pdf` sans cookie de session ;
  le téléchargement donne le même fichier que « PDF source » de l'agence.
- **Gravité si échec** : Majeur

### GL-04-078 — Code de confirmation : envoi, délai, renvois

- **Rôle** : PUBLIC
- **Préconditions** : lien du locataire ouvert.
- **Données** : aucune.
- **Étapes** :
  1. Cliquer « Recevoir le code ».
  2. Observer le bouton ; ouvrir le `.eml` du code.
  3. Attendre 30 s ; cliquer « Renvoyer le code » (jusqu'à épuisement des renvois).
- **Attendu** :
  - Étape 1 : texte « Un code a été envoyé à <contact masqué>. » ; le bouton devient « Renvoyer le code dans N s » (30 s) et est
    désactivé pendant le délai.
  - Étape 2 : un code à 6 chiffres, valable 10 minutes.
  - Étape 3 : 4 envois au total (1 + 3 renvois) ; au 5e : message « Nombre d'envois atteint : contactez l'agence. ». Un
    nouvel appel avant 30 s (console) répond 429 avec un délai de reprise.
- **Gravité si échec** : Majeur

### GL-04-079 — Code faux, trop court, expiré

- **Rôle** : PUBLIC
- **Préconditions** : code reçu (GL-04-078).
- **Données** : code `000000` ; code `12` ; code `12345` ; consentement coché et nom saisi.
- **Étapes** : saisir chaque code puis « Signer le document ».
- **Attendu** :
  - Code de moins de 4 caractères : bouton désactivé ; 4 ou 5 caractères : bouton actif mais refus serveur (un code a 6 chiffres).
  - Code faux : « Code incorrect ou expiré. Essais restants : 4. » (puis 3, 2, 1) ; au-delà de 5 essais, « Code incorrect ou expiré.
    Vérifiez-le ou demandez-en un nouveau. » et plus aucune signature possible avant un nouveau code.
  - Un nouveau code (renvoi encore permis) remet le compteur d'essais à zéro ; le bon code fonctionne.
  - Après 10 minutes, le code expire (même message).
- **Gravité si échec** : Majeur

### GL-04-080 — Le locataire signe en tapant son nom

- **Rôle** : PUBLIC
- **Préconditions** : code valable reçu.
- **Données** : consentement coché ; code valable ; mode « Saisir mon nom » ; nom `REC-GL-Aminata KONE`.
- **Étapes** : saisir et cliquer « Signer le document » ; recharger la page publique ; regarder côté agence.
- **Attendu** :
  - Conditions : le bouton reste désactivé tant que la case, le code (4 caractères au moins) et le nom manquent.
  - Succès : « Merci, votre signature est enregistrée » et « Les autres signataires vont être sollicités. L'agence vous enverra le
    document signé. ».
  - Côté agence : le locataire passe « A signé » avec la date ; la demande devient « Partiellement signée » (pastille jaune).
  - Après rechargement, la page indique « Vous avez déjà signé ce document. ».
- **Gravité si échec** : Bloquant

### GL-04-081 — Le bailleur signe en dessinant ; demande complète

- **Rôle** : PUBLIC
- **Préconditions** : e-mail du bailleur C4 reçu ; code demandé et reçu.
- **Données** : mode « Dessiner » ; un tracé ; puis « Effacer » ; puis un nouveau tracé.
- **Étapes** : ouvrir le lien du bailleur ; « Recevoir le code » ; choisir « Dessiner » ; cliquer dans la zone (« Zone de signature :
  dessinez votre signature ») ; « Effacer » ; dessiner de nouveau ; consentement ; code ; « Signer le document ».
- **Attendu** :
  - Avant le tracé le bouton est désactivé ; « Effacer » vide la zone.
  - Succès : « Merci, votre signature est enregistrée » et « Toutes les signatures sont réunies : l'agence vous enverra le
    document signé. ».
  - Côté agence : la demande passe « Signée » (vert), deux signataires « A signé », le bouton « PDF signé » apparaît ; plus de
    « Relancer » ni de « Annuler la demande » ; événement « Document scellé ».
- **Gravité si échec** : Bloquant

### GL-04-082 — PDF signé (scellé)

- **Rôle** : ADMIN_A
- **Préconditions** : demande de L3 « Signée ».
- **Données** : aucune.
- **Étapes** : « PDF signé » ; ouvrir le fichier ; comparer avec « PDF source ».
- **Attendu** : fichier `bail-BAIL-AAAA-0003-signe.pdf` ; le contrat est suivi d'un certificat de signature où chaque
  signataire figure avec son nom, son rôle en libellé lisible (« Locataire », « Bailleur ») et son canal (« E-mail »), la
  date et l'heure de signature, l'empreinte du document ; le certificat est en français ; `GET …/file?variant=signed` répond 200. Avant le scellement, `variant=signed` répond 404.
- **Gravité si échec** : Bloquant

### GL-04-083 — Lien utilisé après signature, et lien du second signataire

- **Rôle** : PUBLIC
- **Préconditions** : demande de L3 « Signée ».
- **Données** : liens des deux signataires.
- **Étapes** : rouvrir chaque lien.
- **Attendu** : chaque page affiche « Vous avez déjà signé ce document. » ; aucune nouvelle signature n'est possible ; aucune erreur 500.
- **Gravité si échec** : Majeur

### GL-04-084 — Relancer les signataires en attente (L4)

- **Rôle** : ADMIN_A
- **Préconditions** : contrat de L4 généré ; nouvelle demande sur L4 avec deux signataires e-mail : `REC-GL-Bakary TRAORE`
  (`rec-gl-bakary@packs.immotopia.test`) et un signataire ajouté `REC-GL Garant` (`rec-gl-garant@packs.immotopia.test`, rôle
  « Co-locataire »).
- **Données** : aucune.
- **Étapes** : envoyer ; « Relancer » ; lire le message ; ouvrir les nouveaux `.eml`.
- **Attendu** : message « Rappel envoyé à 2 signataire(s) en attente » ; deux nouveaux e-mails ; événement « Rappel envoyé » ;
  `POST /api/signatures/<id>/remind` répond 200 avec `reminded` 2, `failed` 0. Si aucun signataire n'est en attente (tous ont
  ouvert leur lien), le message est « Aucun signataire à relancer ».
- **Gravité si échec** : Majeur

### GL-04-085 — Relances rapprochées, ancien lien invalide

- **Rôle** : ADMIN_A puis PUBLIC
- **Préconditions** : GL-04-084 fait, moins de 10 minutes plus tôt.
- **Données** : ancien lien (premier e-mail) et nouveau lien (second e-mail) de `REC-GL-Bakary TRAORE`.
- **Étapes** : « Relancer » de nouveau ; ouvrir l'ancien lien puis le nouveau.
- **Attendu** : message « Une relance vient d'être envoyée : réessayez dans quelques minutes. » (429) ; l'ancien lien ne marche plus
  (« Lien invalide ou expiré », sous-titre « Ce lien de signature n'existe pas ou n'est plus valable. Contactez l'agence qui vous
  l'a envoyé. ») ; le nouveau lien fonctionne.
- **Gravité si échec** : Majeur

### GL-04-086 — Annuler la demande

- **Rôle** : ADMIN_A puis PUBLIC
- **Préconditions** : demande ouverte sur L4.
- **Données** : aucune.
- **Étapes** : « Annuler la demande » › la bulle « Annuler cette demande de signature ? » › « Retour » ; recommencer › « Annuler la
  demande » ; ouvrir les liens des signataires ; envoyer ensuite une nouvelle demande.
- **Attendu** : « Retour » ne change rien ; confirmation : message « Demande annulée », étiquette « Annulée », plus de boutons
  « Relancer » ni « Annuler la demande » ; les liens affichent « Lien invalide ou expiré » ; une nouvelle demande est possible (le
  bouton « Envoyer pour signature » redevient actif). Le quota consommé n'est pas rendu.
- **Gravité si échec** : Majeur

### GL-04-087 — Refus de signer

- **Rôle** : ADMIN_A puis PUBLIC
- **Préconditions** : nouvelle demande ouverte sur L4 (deux signataires e-mail).
- **Données** : motif `REC-GL je refuse ce bail`.
- **Étapes** : sur la page du premier signataire, « Refuser de signer » ; saisir le motif (500 caractères au plus) ; « Annuler » ;
  « Refuser de signer » de nouveau ; « Confirmer le refus » ; rouvrir le lien ; ouvrir le lien du second signataire ; regarder
  l'agence et le `.eml` destiné à ADMIN_A.
- **Attendu** :
  - « Annuler » revient à la page de signature sans effet. Confirmation : « Vous avez refusé de signer » et « L'agence a été informée.
    Aucune signature n'a été enregistrée. ».
  - Agence : demande « Refusée » (rouge), signataire « A refusé » ; le lien du second signataire affiche « Lien invalide ou expiré ».
  - Le lien refusé, rouvert, affiche « Lien invalide ou expiré ». ADMIN_A reçoit un e-mail « Signature refusée — Contrat de bail … ».
  - Un nouvel envoi est possible.
- **Gravité si échec** : Majeur

### GL-04-088 — Un nouveau contrat annule la demande ouverte

- **Rôle** : ADMIN_A puis PUBLIC
- **Préconditions** : nouvelle demande ouverte sur L4.
- **Données** : régénération du contrat de L4.
- **Étapes** : onglet « Documents » de L4 › « ⋮ » › « Régénérer… » (ou générer un nouveau contrat) ; retourner sur « Signatures » ;
  ouvrir un lien reçu.
- **Attendu** : la demande est « Annulée » (le contrat a changé depuis l'envoi) ; le lien affiche « Lien invalide ou expiré » ; aucune
  signature n'est possible sur l'ancien contrat ; l'événement apparaît dans l'historique de la demande.
- **Gravité si échec** : Majeur

### GL-04-089 — Canal SMS

- **Rôle** : ADMIN_A
- **Préconditions** : L4 sans demande ouverte ; C2 a le téléphone `+225 07 00 00 00 02`.
- **Données** : signataire `REC-GL-Bakary TRAORE`, rôle « Locataire », canal « SMS », contact `+225 07 00 00 00 02`.
- **Étapes** : « Envoyer pour signature » › régler la ligne en canal « SMS » › « Envoyer » ; lire le journal de l'API.
- **Attendu** : envoi accepté (« Demande de signature envoyée ») ; le signataire s'affiche « Locataire · SMS · <numéro masqué> » « En
  attente » ; un SMS court (nom de l'agence, titre abrégé, lien entier) est « envoyé » au transport du journal ; la page publique, une
  fois le lien lu, envoie le code par SMS (même délai de 30 s, 4 envois). Si le journal ne contient pas le lien ou le code, noter
  « bloqué : message SMS illisible ». Annuler ensuite la demande.
- **Gravité si échec** : Majeur

### GL-04-090 — SMS : refus

- **Rôle** : ADMIN_A
- **Préconditions** : fenêtre d'envoi de L4.
- **Données** : numéro `+225 07 99 99 99 99` (pas celui de C2) ; numéro `+33 6 12 34 56 78` ; numéro `abc` ; signataire sans contact CRM.
- **Étapes** : essayer chaque cas en canal « SMS ».
- **Attendu** : « Le numéro de REC-GL-Bakary TRAORE n'est pas celui du contact du CRM désigné (SMS). » ; « L'indicatif du numéro de … n'est
  pas autorisé pour les SMS de signature. » ; « Numéro de téléphone invalide pour … (SMS). » ; pour une ligne ajoutée à la main, l'option « SMS —
  Lier à un contact CRM » est grisée. Aucun SMS n'est envoyé et le quota n'est pas consommé.
- **Gravité si échec** : Majeur

### GL-04-091 — WhatsApp sans consentement

- **Rôle** : ADMIN_A
- **Préconditions** : fenêtre d'envoi de L4 ; C2 n'a pas donné son consentement WhatsApp.
- **Données** : canal « WhatsApp » pour `REC-GL-Bakary TRAORE`, contact `+225 07 00 00 00 02`.
- **Étapes** : « Envoyer ».
- **Attendu** : refus 400 « Ce contact n'a pas consenti à recevoir des messages WhatsApp (REC-GL-Bakary TRAORE). » ; aucune demande. Une
  ligne sans contact CRM grise l'option WhatsApp (« — Lier à un contact CRM »).
- **Gravité si échec** : Majeur

### GL-04-092 — Signature dans l'ordre de la liste (séquentielle)

- **Rôle** : ADMIN_A puis PUBLIC
- **Préconditions** : contrat de L2 généré ; L2 sans demande ouverte.
- **Données** : signataires `REC-GL-Bakary TRAORE` (locataire) puis `REC-GL-Chantal DIALLO` (bailleur), e-mail ; interrupteur
  « Signature dans l'ordre de la liste » activé.
- **Étapes** : envoyer ; compter les `.eml` ; faire signer le premier (code + nom) ; recompter les `.eml` ; faire signer le second.
- **Attendu** : à l'envoi, un seul e-mail part (celui du premier signataire) ; après sa signature, le second reçoit son lien ; la demande
  passe « Partiellement signée » puis « Signée » après le second. Relancer pendant le tour du premier ne concerne que lui.
- **Gravité si échec** : Majeur

### GL-04-093 — Signature sur place (agent et locataire côte à côte)

- **Rôle** : ADMIN_A
- **Préconditions** : contrat de L1 généré ; aucune demande ouverte sur L1. C'est le **dernier** contrat généré du bail qui part en
  signature (après GL-04-050 et GL-04-056, c'est `BAIL-AAAA-0001-A3`) ; le noter dans le compte rendu.
- **Données** : deux signataires en canal « Sur place » : `REC-GL Agent` (rôle « Agent ») et `REC-GL-Aminata KONE` (rôle « Locataire »).
- **Étapes** :
  1. « Envoyer pour signature » ; choisir « Sur place » pour les deux lignes (le champ de contact disparaît) ; « Envoyer ».
  2. La fenêtre « Signature sur place : REC-GL Agent » s'ouvre seule ; cocher le consentement, dessiner, « Signer le document ».
  3. Fermer ; sur la ligne du locataire, « Signer sur place » ; signer.
- **Attendu** :
  - Aucun e-mail n'est envoyé (tous sur place). Dans la fenêtre, ni choix « Saisir mon nom » ni champ de code : la signature
    **dessinée** est obligatoire ; « Signer le document » est désactivé tant que le tracé et le consentement manquent.
  - Après chaque signature : message « Merci, votre signature est enregistrée » dans la fenêtre ; la liste se recharge (« A signé ») ;
    après la seconde, la demande est « Signée » et « PDF signé » est disponible.
  - Le certificat du PDF signé indique le canal « Sur place » et l'agent qui a assisté.
- **Gravité si échec** : Bloquant

### GL-04-094 — Réémission du jeton de signature sur place

- **Rôle** : ADMIN_A
- **Préconditions** : demande ouverte sur L1 avec un signataire sur place pas encore signé (refaire un envoi si besoin).
- **Données** : aucune.
- **Étapes** : cliquer « Signer sur place » deux fois de suite (en fermant la fenêtre entre les deux) ; ouvrir la fiche de la demande
  dans Paramétrage › Signatures (tiroir) ; consulter l'historique.
- **Attendu** : chaque ouverture émet un nouveau lien (le précédent ne marche plus) ; l'historique montre « Nouveau lien de signature
  sur place émis » à chaque fois ; `POST /api/signatures/<id>/signers/<signerId>/in-person-token` répond 200 (jeton non mis en cache
  `Cache-Control: no-store`) ; un signataire ayant déjà signé n'a plus de bouton (409 côté API).
- **Gravité si échec** : Majeur

### GL-04-095 — Sur place : ordre imposé, refus et zone de signature

- **Rôle** : ADMIN_A
- **Préconditions** : nouvelle demande sur L1 avec deux signataires sur place et « Signature dans l'ordre de la liste » activé
  (annuler la demande précédente si besoin).
- **Données** : aucune.
- **Étapes** : ouvrir « Signer sur place » du **second** signataire avant le premier ; fermer ; ouvrir le premier, « Refuser de
  signer » › motif › « Confirmer le refus ».
- **Attendu** : le second voit « Ce n'est pas encore votre tour » (« Vous recevrez votre lien de signature dès que les signataires
  précédents auront signé. ») ; le refus du premier clôt la demande « Refusée » ; la zone de signature vide ne permet pas de signer.
- **Gravité si échec** : Majeur

### GL-04-096 — Jeton invalide ou mal formé

- **Rôle** : PUBLIC
- **Préconditions** : aucune.
- **Données** : `/signer/abc` ; `/signer/` suivi de 64 caractères hexadécimaux au hasard ; `/signer/%20` ; `/signer/<jeton valide
modifié d'un caractère>`.
- **Étapes** : ouvrir chaque adresse ; console : `POST /api/public/signatures/<jeton>/otp` et `/sign` avec un faux jeton.
- **Attendu** : la page affiche partout « Lien invalide ou expiré » (404 uniforme, sans indication sur l'existence du jeton) ; aucun
  500 ; limitation par adresse IP si les essais sont répétés (« Trop de demandes — Réessayez dans quelques minutes. »).
- **Gravité si échec** : Majeur

### GL-04-097 — Jeton expiré

- **Rôle** : ADMIN_A puis PUBLIC
- **Préconditions** : à préparer la veille : une demande sur L2 ou L3 avec « Valable 1 jour » ; à contrôler le lendemain (J+1).
- **Données** : lien reçu la veille.
- **Étapes** : à J+1, ouvrir le lien ; regarder l'agence (onglet « Signatures » et écran Signatures) ; relever le `.eml` destiné à l'émetteur.
- **Attendu** : le lien affiche « Lien invalide ou expiré » ; au plus 15 minutes après l'échéance, la demande passe « Expirée » et l'émetteur
  est prévenu ; un nouvel envoi est possible. (Non jouable le jour même : à noter « différé à J+1 ».)
- **Gravité si échec** : Majeur

### GL-04-098 — Page publique sur mobile, rechargement, retour

- **Rôle** : PUBLIC
- **Préconditions** : navigateur à 375 px de large ; lien d'un signataire valable.
- **Données** : aucune.
- **Étapes** : ouvrir le lien ; saisir le consentement et un nom ; recharger (F5) ; utiliser le bouton Précédent du navigateur ;
  tourner l'écran si possible.
- **Attendu** : mise en page lisible sans défilement horizontal, boutons pleine largeur, iframe du PDF de 60 % de la hauteur ; après F5
  la page recharge et les saisies (case, nom) sont perdues, mais le code reçu reste valable ; Précédent quitte la page sans erreur.
- **Gravité si échec** : Mineur

### GL-04-099 — Signature du bail : droits

- **Rôle** : LECTEUR_A
- **Préconditions** : une demande ouverte sur un bail ; contrat généré.
- **Données** : aucune.
- **Étapes** : onglet « Signatures » ; « Envoyer pour signature » › « Envoyer » ; « Relancer » ; « Annuler la demande » ; « PDF source ».
- **Attendu** : lecture et téléchargement possibles ; envoi, relance et annulation refusés 403 « Vous n'avez pas les droits nécessaires pour
  effectuer cette action. » ; boutons visibles malgré tout (constat) ; aucune demande créée.
- **Gravité si échec** : Bloquant

### GL-04-100 — Signature du bail : isolation

- **Rôle** : ADMIN_B
- **Préconditions** : demande de L3 ; `<requestId>`, `<leaseIdL3>` relevés.
- **Données** : aucune.
- **Étapes** (console de B, avec sa session) : `GET /api/signatures/<requestId>` ; `GET /api/signatures/<requestId>/file` ;
  `POST /api/signatures/<requestId>/cancel` ; `POST /api/signatures/<requestId>/remind` ;
  `GET /api/signatures/targets/LEASE_CONTRACT/<leaseIdL3>/context` ; `POST /api/signatures` avec `kind` `LEASE_CONTRACT` et
  `targetId` = `<leaseIdL3>`.
- **Attendu** : 404 pour chaque appel (« Demande de signature introuvable. » ou « Bail introuvable. ») ; la demande de A reste inchangée ;
  aucun quota de B consommé.
- **Gravité si échec** : Bloquant

### GL-04-101 — Quota mensuel de signatures

- **Rôle** : ADMIN_A
- **Préconditions** : lire le quota et la consommation dans Mon compte › Abonnement (capacité « Signatures électroniques »). Jouable si
  l'écart est d'au plus une dizaine d'envois.
- **Données** : envois répétés sur L4 (envoyer puis annuler) jusqu'au plafond.
- **Étapes** : répéter « Envoyer » puis « Annuler la demande » ; lire l'avancement ; au dépassement, lire le message.
- **Attendu** : chaque demande compte pour un, quel que soit le nombre de signataires ; l'annulation ne rend pas la place ; au dépassement :
  409 « Le quota mensuel de signatures électroniques de votre agence est atteint : ajoutez l'extension « Signatures électroniques — bloc de 50 »
  depuis votre abonnement. » (affiché dans la fenêtre, éventuellement relayé par la notification d'abonnement) ; un échec d'envoi (adresse invalide)
  ne consomme rien. Si l'abonnement n'inclut pas la capacité : « Votre abonnement n'inclut pas la signature électronique. ». L'ajout de
  l'extension « bloc de 50 » relève de l'administration de la plateforme (non jouable avec les comptes de la recette).
- **Gravité si échec** : Majeur

## E. Signature de l'état des lieux

### GL-04-102 — Le bouton « Signatures » n'existe que pour un état finalisé

- **Rôle** : ADMIN_A
- **Préconditions** : un état des lieux finalisé (EDL-3E) et un brouillon.
- **Données** : aucune.
- **Étapes** : consulter l'état finalisé ; ouvrir le brouillon (« Continuer ») ; console : `POST /api/signatures` pour le brouillon.
- **Attendu** : bouton « Signatures » présent seulement dans la consultation de l'état finalisé ; absent du brouillon. L'API refuse l'envoi
  d'un brouillon : 400 « Finalisez l'état des lieux avant de l'envoyer en signature : un brouillon ne peut pas être signé. ».
- **Gravité si échec** : Majeur

### GL-04-103 — Fenêtre « Signatures de l'état des lieux » et signataires proposés

- **Rôle** : ADMIN_A
- **Préconditions** : EDL-3E finalisé (locataire présent).
- **Données** : aucune.
- **Étapes** : « Consulter » › « Signatures » ; « Envoyer pour signature ».
- **Attendu** : fenêtre « Signatures de l'état des lieux » ; encadré « Le locataire est présent : faites-le signer sur place, directement sur cet
  écran. » avec « Chaque signataire présent dessine sa signature ; les absents reçoivent un lien par e-mail. » ; signataires proposés : locataire
  (sur place car présent), bailleur (e-mail), agent `REC-GL Agent` (sur place) ; un signataire sans nom est écarté de la liste.
- **Gravité si échec** : Majeur

### GL-04-104 — Signer l'état des lieux d'entrée sur place

- **Rôle** : ADMIN_A
- **Préconditions** : GL-04-103 ; retirer la ligne du bailleur (ou la compléter) pour que les deux signataires soient sur place.
- **Données** : locataire `REC-GL-Aminata KONE` et agent `REC-GL Agent`, canal « Sur place ».
- **Étapes** : « Envoyer » ; signer l'agent dans la fenêtre qui s'ouvre ; signer le locataire avec « Signer sur place ».
- **Attendu** : aucun e-mail ; chaque signataire dessine et coche le consentement ; la demande est « Signée » ; « PDF signé » apparaît ; le
  quota augmente de 1 ; le document finalisé reste inchangé (aucune colonne « signé » : la preuve est la demande scellée).
- **Gravité si échec** : Bloquant

### GL-04-105 — PDF de l'état des lieux (source et signé)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-04-104 fait ; une photo rattachée à un élément avant la finalisation (ajouter une photo à un nouveau brouillon si besoin).
- **Données** : aucune.
- **Étapes** : « PDF source » puis « PDF signé » ; ouvrir.
- **Attendu** : fichiers `etat-des-lieux-entree-source.pdf` et `etat-des-lieux-entree-signe.pdf` ; le PDF contient pièces, états, commentaires,
  compteurs, clés, noms de signataires et les photos ; le PDF signé ajoute le certificat (rôle et canal lisibles).
- **Gravité si échec** : Majeur

### GL-04-106 — Locataire absent : signature par e-mail

- **Rôle** : ADMIN_A puis PUBLIC
- **Préconditions** : EDL-5E (locataire absent) finalisé.
- **Données** : locataire par e-mail `rec-gl-aminata@packs.immotopia.test` ; agent sur place.
- **Étapes** : « Signatures » de EDL-5E ; envoyer ; signer l'agent sur place ; ouvrir le lien du locataire, code, signature.
- **Attendu** : l'encadré « Le locataire est présent… » n'apparaît pas ; le locataire reçoit un e-mail avec lien ; après code et signature, la demande
  est « Signée ».
- **Gravité si échec** : Majeur

### GL-04-107 — Un état des lieux déjà signé ne se renvoie pas

- **Rôle** : ADMIN_A
- **Préconditions** : GL-04-104 fait.
- **Données** : un signataire quelconque.
- **Étapes** : « Envoyer pour signature » › « Envoyer ».
- **Attendu** : bandeau « Cet état des lieux est déjà signé : il ne peut pas être envoyé une seconde fois en signature. » (409) ; aucune demande ;
  quota inchangé.
- **Gravité si échec** : Majeur

### GL-04-108 — Sortie signée séparément ; droits et isolation

- **Rôle** : ADMIN_A, LECTEUR_A, ADMIN_B
- **Préconditions** : EDL-5S finalisé.
- **Données** : agent et locataire sur place.
- **Étapes** : signer EDL-5S comme en GL-04-104 ; LECTEUR_A tente d'envoyer ; ADMIN_B (console) :
  `GET /api/signatures?targetType=LeaseInspection` et `POST /api/signatures` avec le `targetId` de EDL-5S.
- **Attendu** : la demande de la sortie est distincte de celle de l'entrée (titre « État des lieux de sortie - bail … ») ; LECTEUR_A : 403 ;
  ADMIN_B : liste sans demande de A, création 404 « État des lieux introuvable. ».
- **Gravité si échec** : Bloquant

## F. Écran global « Signatures »

### GL-04-109 — Accès et premier écran

- **Rôle** : ADMIN_A
- **Préconditions** : plusieurs demandes (envoyées, signées, refusées, annulées).
- **Données** : aucune.
- **Étapes** : menu « Paramétrage » › « Signatures » (`/tenant/<idA>/signatures`).
- **Attendu** : titre « Signatures » ; rangée de boutons « Toutes (N) », « Envoyée (n) », « Partiellement signée (n) », « Signée (n) », « Refusée
  (n) », « Expirée (n) », « Annulée (n) », « Brouillon (n) » ; filtres « Type de document », champ « Rechercher un document ou un signataire »,
  sélecteur de période ; tableau « Document », « Type », « Statut », « Signataires » (« n/N signés »), « Créée le », « Échéance », « Actions »
  (« Télécharger », et « Relancer » / « Annuler » sur les demandes ouvertes). Aucun export. 25 lignes au plus par page.
- **Gravité si échec** : Majeur

### GL-04-110 — Compteurs par statut

- **Rôle** : ADMIN_A
- **Préconditions** : demandes dans plusieurs statuts.
- **Données** : aucune.
- **Étapes** : cliquer chaque compteur ; revenir sur « Toutes ».
- **Attendu** : le bouton choisi est mis en avant ; la liste se limite à ce statut et revient à la page 1 ; chaque compteur égale le nombre de
  lignes obtenu ; les compteurs suivent la recherche, le type et la période, mais pas le statut choisi.
- **Gravité si échec** : Majeur

### GL-04-111 — Filtre par type de document

- **Rôle** : ADMIN_A
- **Préconditions** : au moins une demande de bail et une demande d'état des lieux.
- **Données** : « Contrat de bail », « État des lieux ».
- **Étapes** : choisir chaque type dans « Type de document » ; ouvrir la liste complète des types.
- **Attendu** : la liste ne montre que ce type ; les types proposés sont : Contrat de bail, Mandat de gestion, Mandat de vente, État des lieux,
  Compromis de vente, Autorisation de prélèvement (bail), Autorisation de prélèvement (copropriété) ; un type hors du périmètre de l'utilisateur
  donne une liste vide, sans erreur.
- **Gravité si échec** : Majeur

### GL-04-112 — Recherche d'un document ou d'un signataire

- **Rôle** : ADMIN_A
- **Préconditions** : demandes de L1, L3, L4.
- **Données** : `BAIL-AAAA-0003` (numéro de L3) ; `KONE` ; `kone` ; `zzzz` ; chaîne de 101 caractères.
- **Étapes** : saisir et valider (Entrée ou icône de recherche) ; vider.
- **Attendu** : le titre ou le nom d'un signataire est cherché sans tenir compte de la casse ; `zzzz` → « Aucune demande de signature » ; 101
  caractères → bandeau d'erreur « Erreur lors du chargement des signatures » avec « Réessayer » (400) sans écran blanc ; la liste revient au vidage.
- **Gravité si échec** : Mineur

### GL-04-113 — Période de création

- **Rôle** : ADMIN_A
- **Préconditions** : demandes créées aujourd'hui.
- **Données** : période aujourd'hui → aujourd'hui ; période dans le futur ; période effacée.
- **Étapes** : choisir la période dans le sélecteur de dates.
- **Attendu** : aujourd'hui → aujourd'hui inclut les demandes créées toute la journée ; une période future donne « Aucune demande de signature » ;
  l'effacer ramène tout. Les compteurs suivent la période.
- **Gravité si échec** : Mineur

### GL-04-114 — Tri

- **Rôle** : ADMIN_A
- **Préconditions** : plusieurs demandes.
- **Données** : colonnes « Document », « Statut », « Créée le », « Échéance ».
- **Étapes** : cliquer sur chaque titre de colonne, trois fois de suite.
- **Attendu** : par défaut « Créée le » décroissant ; chaque clic alterne croissant puis décroissant, et le troisième revient à l'ordre par
  défaut (« Créée le » décroissant) ; les colonnes « Type », « Signataires » et « Actions » ne se trient pas.
- **Gravité si échec** : Mineur

### GL-04-115 — Pagination (25 par page)

- **Rôle** : ADMIN_A
- **Préconditions** : au moins 26 demandes (sinon noter « non jouable »).
- **Données** : aucune.
- **Étapes** : passer à la page 2 ; changer un filtre ; revenir.
- **Attendu** : 25 lignes par page, pas de choix de taille ; changer un filtre remet à la page 1 ; le total est exact.
- **Gravité si échec** : Mineur

### GL-04-116 — Tiroir de détail d'une demande

- **Rôle** : ADMIN_A
- **Préconditions** : demande « Signée » de L3 et demande de EDL-3E.
- **Données** : aucune.
- **Étapes** : cliquer le titre de la demande de L3 ; lire le tiroir ; cliquer « Ouvrir le document » ; refaire pour la demande d'état des lieux.
- **Attendu** :
  - Tiroir (560 px) : Type « Contrat de bail », Statut « Signée », « Créée le » (date et heure), « Échéance », « Terminée le » ; ligne « Document » avec
    « Ouvrir le document » (mène à la fiche du bail) ; « Signataires » avec rôle, canal, contact masqué et statut ; « Historique » en
    ordre chronologique : « Demande créée », « Invitation envoyée », « Document ouvert », « Code de vérification envoyé », « Signature apposée »,
    « Document scellé » ; pastille verte « Piste de preuve intacte ».
  - Pour l'état des lieux : pas de lien « Ouvrir le document » (aucune adresse pour cette cible).
  - Fermer par la croix ou en cliquant à côté ; réouvrir une autre demande remplace le contenu.
- **Gravité si échec** : Majeur

### GL-04-117 — Relancer depuis la liste

- **Rôle** : ADMIN_A
- **Préconditions** : demande ouverte dont un signataire n'a rien ouvert ; une autre demande dont tous les signataires ont ouvert leur lien.
- **Données** : aucune.
- **Étapes** : « Relancer » sur chacune ; recommencer tout de suite.
- **Attendu** : « Rappel envoyé à N signataire(s) en attente » pour la première ; « Aucun signataire à relancer » pour la seconde ; relance rapprochée :
  « Une relance vient d'être envoyée : réessayez dans quelques minutes. » ; le bouton n'existe pas sur une demande terminée, refusée ou annulée.
- **Gravité si échec** : Majeur

### GL-04-118 — Annuler depuis la liste

- **Rôle** : ADMIN_A
- **Préconditions** : demande ouverte.
- **Données** : aucune.
- **Étapes** : « Annuler » › la bulle « Annuler cette demande de signature ? » › « Retour », puis de nouveau › « Annuler la demande ».
- **Attendu** : « Retour » ne change rien ; confirmation : « Demande annulée », la ligne passe « Annulée », les compteurs sont recalculés ; les liens des
  signataires sont morts.
- **Gravité si échec** : Majeur

### GL-04-119 — Télécharger depuis la liste

- **Rôle** : ADMIN_A
- **Préconditions** : une demande « Signée » et une demande ouverte.
- **Données** : aucune.
- **Étapes** : « Télécharger » sur chacune.
- **Attendu** : la demande signée donne le PDF scellé (`contrat-de-bail-bail-aaaa-0003-signe.pdf`), la demande ouverte le PDF source (`…-source.pdf`) ;
  une erreur de téléchargement affiche un message lisible.
- **Gravité si échec** : Majeur

### GL-04-120 — Les filtres ne survivent pas au rechargement

- **Rôle** : ADMIN_A
- **Préconditions** : filtre de statut « Signée » et recherche posés.
- **Données** : aucune.
- **Étapes** : recharger (F5) ; naviguer ailleurs et revenir avec le bouton Précédent.
- **Attendu** : constat : les filtres, la page et le tri ne sont pas dans l'adresse ; après F5 ou retour arrière l'écran revient à « Toutes », sans
  recherche (contrairement à la liste des baux). Gravité Cosmétique (écart de cohérence).
- **Gravité si échec** : Cosmétique

### GL-04-121 — Écran global : droits

- **Rôle** : LECTEUR_A
- **Préconditions** : demandes de bail et d'état des lieux.
- **Données** : aucune.
- **Étapes** : ouvrir « Paramétrage › Signatures » ; tenter « Télécharger » ; chercher « Relancer » / « Annuler ».
- **Attendu** : l'entrée de menu est visible (droit de lecture des baux) ; la liste montre les demandes des types lisibles ; « Relancer » et « Annuler » sont
  masqués (aucun droit d'édition) ; « Télécharger » fonctionne ; une requête `POST /api/signatures/<id>/cancel` répond 403.
- **Gravité si échec** : Majeur

### GL-04-122 — Écran global : isolation

- **Rôle** : ADMIN_B
- **Préconditions** : demandes de A existantes.
- **Données** : aucune.
- **Étapes** : ouvrir `/tenant/<idB>/signatures` ; ouvrir `/tenant/<idA>/signatures` ; console : `GET /api/signatures/<requestIdA>`.
- **Attendu** : B ne voit que ses demandes (ou « Aucune demande de signature ») et ses propres compteurs ; l'adresse de A est refusée (403) ; l'appel
  direct répond 404.
- **Gravité si échec** : Bloquant

### GL-04-123 — Tâches planifiées, rappels automatiques et prestataire externe

- **Rôle** : ADMIN_A (observation)
- **Préconditions** : demande ouverte dont l'échéance est proche (voir GL-04-097).
- **Données** : aucune.
- **Étapes** : après l'échéance (J+1) ou à J-3 / J-1 de l'échéance : ouvrir le tiroir de la demande ; lire les `.eml`.
- **Attendu** : si la plateforme le permet, la demande passe « Expirée » dans les 15 minutes après l'échéance ; les rappels automatiques (J-3 et J-1)
  apparaissent dans l'historique (« Rappel automatique envoyé ») et dans les `.eml` aux signataires encore en attente ; le webhook du prestataire externe
  (Yousign), le dossier de preuve du prestataire et les seuils `SIGNATURE_REMINDER_DAYS_BEFORE` ne sont pas jouables en interface (voir Couverture).
- **Gravité si échec** : Mineur

---

## Couverture

| Sous-fonctionnalité du classeur                                                                                            | Cas GL-04-…                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Réaliser un état des lieux entrée / sortie (ligne 19)                                                                      | 001 à 004, 024 à 026                                                                                                                                   |
| Consulter / lister les états des lieux (ligne 20)                                                                          | 001, 010, 019, 036                                                                                                                                     |
| Modifier un état des lieux en brouillon (ligne 21)                                                                         | 005 à 011, 027 à 034, 041                                                                                                                              |
| Finaliser un état des lieux (ligne 22)                                                                                     | 015 à 018, 035, 044                                                                                                                                    |
| Supprimer un état des lieux (ligne 23)                                                                                     | 020, 021, 042                                                                                                                                          |
| Comparer les états des lieux (ligne 24)                                                                                    | 037, 038, 039                                                                                                                                          |
| Proposer les retenues depuis les dégradations et manquants (ligne 25)                                                      | 031, 032, 033, 034, 040, 045                                                                                                                           |
| Ajouter / consulter / supprimer une photo d'état des lieux (ligne 26)                                                      | 012, 013, 014                                                                                                                                          |
| Droits et isolation des états des lieux                                                                                    | 023                                                                                                                                                    |
| Brouillon local, impression                                                                                                | 011, 043                                                                                                                                               |
| Générer un document locatif (ligne 30)                                                                                     | 047 à 060, 063, 066                                                                                                                                    |
| Consulter / lister les documents (ligne 31), téléchargement, régénération                                                  | 046, 048, 049, 051, 061, 062, 064, 065                                                                                                                 |
| Changer le statut d'un document (ligne 32)                                                                                 | non testable en interface (aucun écran n'appelle `PATCH …/rental/documents/<id>` ; tous les documents générés sont « Final »)                          |
| Téléchargement PDF d'un document                                                                                           | non testable en interface pour les documents (seul le Word est servi) ; le PDF du contrat est celui de « PDF source » (cas 075)                        |
| Envoyer un bail pour signature (ligne 96)                                                                                  | 067 à 074, 092, 093                                                                                                                                    |
| Consulter les demandes de signature d'un bail et leur historique (ligne 97)                                                | 067, 072, 116                                                                                                                                          |
| Relancer les signataires en attente (ligne 98)                                                                             | 084, 085, 117                                                                                                                                          |
| Annuler une demande de signature (ligne 99)                                                                                | 086, 118                                                                                                                                               |
| Télécharger le PDF source ou scellé (ligne 100)                                                                            | 075, 082, 119                                                                                                                                          |
| Réémettre le jeton de signature sur place (ligne 101)                                                                      | 094                                                                                                                                                    |
| Signer sur place (ligne 102)                                                                                               | 093, 094, 095                                                                                                                                          |
| Page publique : lire le PDF (ligne 103), code de confirmation (ligne 104), signer (ligne 105), refuser (ligne 106)         | 076 à 083, 087, 096, 098                                                                                                                               |
| Jeton expiré, invalide, lien après relance                                                                                 | 085, 086, 096, 097                                                                                                                                     |
| Capacité d'abonnement SIGNATURES_MENSUELLES (ligne 107)                                                                    | 101                                                                                                                                                    |
| Tâche planifiée d'expiration et de scellement (ligne 108) ; rappels automatiques (lignes 123, 124)                         | 097 et 123 (observation différée) ; non testable en interface autrement                                                                                |
| Extension « Signatures supplémentaires » (ligne 109)                                                                       | non testable avec les rôles de la recette (administration de la plateforme)                                                                            |
| Envoyer un état des lieux finalisé pour signature (ligne 110)                                                              | 102, 103, 104, 106, 107                                                                                                                                |
| Signer sur place un état des lieux (ligne 111)                                                                             | 104                                                                                                                                                    |
| Consulter les signatures d'un état des lieux et télécharger les PDF (ligne 112)                                            | 105, 108                                                                                                                                               |
| Annulation automatique à la suppression de l'état des lieux (ligne 113)                                                    | non testable en interface (seul un brouillon se supprime et il n'a jamais de demande) ; le cas voisin est 088 (annulation par régénération du contrat) |
| Obtenir le contexte d'une cible à signer (ligne 114)                                                                       | 070, 103 (signataires proposés), 100                                                                                                                   |
| Contrôle d'accès par type de document (ligne 115)                                                                          | 099, 100, 108, 121                                                                                                                                     |
| Écran Signatures : liste, compteurs, relance, annulation, télécharger, tiroir, menu (lignes 116 à 122)                     | 109 à 122                                                                                                                                              |
| Envoyer avec le prestataire externe, webhook Yousign, dossier de preuve, scellement chez le prestataire (lignes 125 à 129) | non testable en interface (configuration serveur `SIGNATURE_PROVIDER=yousign`, appels de serveur à serveur)                                            |
| Envoyer le lien de signature par SMS, recevoir le code par SMS, canal disponible, transport (lignes 130 à 133)             | 070 (option SMS), 089, 090 ; transport `SMS_PROVIDER` : non testable en interface (configuration serveur)                                              |
| Mandat de prélèvement signé électroniquement (lignes 152 à 154)                                                            | hors périmètre de ce fichier (voir le fichier Prélèvement bancaire)                                                                                    |
