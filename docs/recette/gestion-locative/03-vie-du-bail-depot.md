# Recette Gestion locative — 03 Vie du bail et dépôt de garantie

**Périmètre.** Onglet « Vie du bail » d'un bail : historique, révision du loyer (effet sur les échéances non réglées,
écart inscrit au compte du locataire), renouvellement, avenant, résiliation (annulation des échéances futures,
contre-passation), solde de tout compte. Onglet « Dépôt de garantie » : création automatique, mouvements (collecte,
blocage, libération, remboursement, confiscation, ajustement), montants incohérents, liste des mouvements.

**Prérequis.**

- Fichiers 01 et 02 passés. En particulier : L1 avec 12 échéances générées dont **08/2026 et 09/2026 encaissées**
  (GL-02-099) et un gestionnaire AGENT_A ; L3, L4, L5, L8, L10 (annulé), LS (terminé) et LT créés ; échéances de L3, L4 et
  L5 générées ; échéances de LT **générées** (GL-03-002) mais **non** recalculées.
- Les dates supposent une recette jouée le **03/11/2026** (voir fichier 01). Les échéances dont la date est passée
  sont « En retard » à l'affichage ; leur statut enregistré reste « Brouillon » tant qu'un recalcul ou la tâche de
  nuit ne l'a pas mis à jour.
- Base amorcée (voir fichier 02) : relever les numéros de bail réels.
- Rappel des conventions : L1 = premier bail créé en 02 ; un message d'erreur de l'API est repris tel quel par l'écran
  dans la fenêtre ou le bandeau ouvert.

**Données créées par ce fichier.**

| Repère   | Objet                    | Valeurs                                                                                                                                                                                                                            |
| -------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LT2      | Bail sur P14             | locataire C2, propriétaire C3, 01/08/2026 → 31/07/2027, Mensuel, jour 5, loyer 150 000, charges 10 000, dépôt 300 000, pénalités par défaut (taux 0) ; sert à la révision avec écart, au dépôt collecté et à la résiliation passée |
| R-a      | Révision immédiate de L1 | mois d'effet 10/2026, loyer 155 000, charges 10 000                                                                                                                                                                                |
| R-b      | Révision planifiée de L1 | mois d'effet 04/2027, taux 5 % soit 162 750                                                                                                                                                                                        |
| Dépôt L5 | Dépôt de garantie de L5  | cible 800 000 ; suite de mouvements décrite en H                                                                                                                                                                                   |

---

## A. Panneau « Vie du bail » et préparation

### GL-03-001 — Panneau « Vie du bail » d'un bail sans événement

- **Rôle** : ADMIN_A
- **Préconditions** : L1 sans événement (aucune révision, aucun avenant).
- **Données** : aucune.
- **Étapes** : fiche de L1 › onglet « Vie du bail ».
- **Attendu** :
  - Carte « Vie du bail » : « Loyer en vigueur » 150 000 FCFA, « Charges en vigueur » 10 000 FCFA, « Date de fin »
    31/07/2027 (format JJ/MM/AAAA).
  - Quatre boutons actifs : « Réviser le loyer », « Renouveler », « Enregistrer un avenant », « Résilier le bail ».
  - Rubrique « Historique » : « Aucun événement enregistré ». Aucune carte « Solde de tout compte ».
  - Réseau : `GET …/rental/leases/<leaseId>/events` répond 200.
- **Gravité si échec** : Majeur

### GL-03-002 — Préparer LT et LT2 (échéances, recalcul)

- **Rôle** : ADMIN_A
- **Préconditions** : LT (P13) existe (GL-02-017) ; P14 « Disponible ».
- **Données** : LT2 : voir tableau de tête.
- **Étapes** :
  1. Créer LT2 avec l'assistant comme en GL-02-004 (pénalités laissées par défaut).
  2. Pour LT et pour LT2 : onglet « Échéances » › « Générer les échéances ».
  3. Pour LT2 **seulement** : menu « ⋮ » › « Recalculer les statuts et pénalités ».
  4. Pour LT2 : onglet « Dépôt de garantie » (le dépôt de 300 000 est créé à l'ouverture) ; onglet « Paiements » ›
     « Nouveau paiement » : méthode « Espèces », montant 300 000, date du règlement aujourd'hui ; enregistrer ; puis
     « Dépôt de garantie » › « Nouveau mouvement » › type « Collecte », paiement proposé, « Enregistrer ».
- **Attendu** :
  - LT et LT2 ont chacun 12 échéances (08/2026 à 07/2027) de 160 000.
  - Après le recalcul de LT2 : août, septembre et octobre 2026 sont « En retard » (statut enregistré) ; novembre et les
    suivantes restent « Brouillon » (date non échue). Aucune pénalité n'apparaît (taux 0).
  - Dépôt de LT2 : « Montant cible » 300 000, « Solde actuel » 300 000, statut « Complet ».
  - LT n'a pas de dépôt collecté (son dépôt de 300 000 reste « En attente »).
- **Gravité si échec** : Bloquant (préalable de tout le fichier)

## B. Révision du loyer

### GL-03-003 — Fenêtre « Réviser le loyer » : valeurs proposées

- **Rôle** : ADMIN_A
- **Préconditions** : L1 (loyer 150 000, charges 10 000).
- **Données** : aucune.
- **Étapes** : onglet « Vie du bail » › « Réviser le loyer ».
- **Attendu** : fenêtre « Réviser le loyer » avec les champs « Mois d'effet » (préréglé sur le mois suivant : 12/2026,
  format MM/AAAA), « Taux de révision (%) » (vide, aide « Facultatif : calcule le nouveau loyer à partir du loyer
  actuel. »), « Nouveau loyer » (150 000), « Nouvelles charges » (10 000), « Motif » (aide « Les échéances pas encore
  réglées sont recalculées ; l'écart est inscrit au compte du locataire. »), boutons « Réviser » et « Annuler ».
- **Gravité si échec** : Mineur

### GL-03-004 — Champs obligatoires de la révision

- **Rôle** : ADMIN_A
- **Préconditions** : fenêtre ouverte.
- **Données** : « Mois d'effet » effacé ; « Nouveau loyer » effacé.
- **Étapes** : effacer le mois (croix du sélecteur), cliquer « Réviser » ; remettre le mois, effacer le loyer, « Réviser ».
- **Attendu** : messages « Le mois d'effet est requis » puis « Le nouveau loyer est requis » ; aucun appel réseau.
- **Gravité si échec** : Mineur

### GL-03-005 — Mois d'effet avant le début du bail

- **Rôle** : ADMIN_A
- **Préconditions** : L1 débute le 01/08/2026.
- **Données** : mois d'effet `07/2026`, loyer 155 000.
- **Étapes** : saisir et cliquer « Réviser ».
- **Attendu** : la fenêtre reste ouverte avec un bandeau d'erreur « Le mois d'effet précède le début du bail. » (400) ;
  aucun événement ; le loyer de L1 reste 150 000.
- **Gravité si échec** : Majeur

### GL-03-006 — Mois d'effet portant une échéance déjà réglée

- **Rôle** : ADMIN_A
- **Préconditions** : échéances 08/2026 et 09/2026 de L1 payées.
- **Données** : mois d'effet `08/2026`, puis `09/2026`, loyer 155 000.
- **Étapes** : saisir chaque mois et cliquer « Réviser ».
- **Attendu** : pour chaque mois, bandeau « Des échéances de cette période sont déjà réglées, même en partie : choisissez
  un mois d'effet postérieur. » (409) ; rien n'est modifié ; les échéances payées gardent 160 000. Un mois postérieur
  (10/2026) est accepté (GL-03-008).
- **Gravité si échec** : Bloquant (réécriture d'une échéance payée)

### GL-03-007 — Valeurs invalides de la révision

- **Rôle** : ADMIN_A
- **Préconditions** : fenêtre ouverte sur L1, mois 11/2026.
- **Données** : loyer `0` ; loyer `-1` ; taux `-101` ; taux `1001` ; charges `-5` ; loyer `99 999 999 999`.
- **Étapes** : saisir chaque valeur et cliquer « Réviser ».
- **Attendu** :
  - Le champ « Nouveau loyer » refuse les valeurs négatives (message « Le loyer doit être positif ») ; les charges aussi
    (« Les charges doivent être positives »).
  - Loyer `0` : refus 400 (le loyer doit être strictement positif) avec un message lisible dans la fenêtre.
  - Taux `-101` ou `1001` : refus 400 ; le taux accepte de -100 à 1000.
  - Loyer `99 999 999 999` : refus propre (message clair, pas de 500).
  - Dans tous les cas, aucun événement créé et la fenêtre reste ouverte.
- **Gravité si échec** : Majeur

### GL-03-008 — Révision immédiate (R-a) : effet sur les échéances non réglées

- **Rôle** : ADMIN_A
- **Préconditions** : L1 : 08/2026 et 09/2026 payées ; 10/2026 à 07/2027 non payées.
- **Données** : mois d'effet `10/2026` ; taux vide ; nouveau loyer `155 000` ; nouvelles charges `10 000` ; motif
  `REC-GL révision annuelle`.
- **Étapes** :
  1. « Réviser le loyer », saisir, cliquer « Réviser ».
  2. Lire le panneau, la fiche du bail et l'onglet « Échéances ».
- **Attendu** :
  - Message « Loyer révisé » ; la fenêtre se ferme.
  - Historique : « Loyer révisé de 150 000 à 155 000 FCFA au 01/10/2026 — 10 échéance(s) recalculée(s) », signé « Par
    <nom d'ADMIN_A>, le <date du jour> ».
  - Le mois d'effet (01/10/2026) est passé : le loyer du bail change tout de suite — panneau « Loyer en vigueur »
    155 000 FCFA ; carte « Financier » de la fiche : Loyer 155 000.
  - Échéances : 08/2026 et 09/2026 inchangées (160 000, « Payé ») ; 10/2026 à 07/2027 : 165 000 chacune (155 000 +
    10 000).
  - Réseau : `POST …/events/revision` répond 201/200 ; le corps porte `effectiveMonth` `2026-10`, `newRent` 155000,
    `newCharges` 10000.
- **Gravité si échec** : Bloquant (montants d'échéances faux)

### GL-03-009 — Révision planifiée (R-b) avec un taux

- **Rôle** : ADMIN_A
- **Préconditions** : GL-03-008 fait ; loyer en vigueur 155 000.
- **Données** : mois d'effet `04/2027` ; taux `5` ; motif `REC-GL indexation`.
- **Étapes** :
  1. « Réviser le loyer » ; saisir le taux 5 : le champ « Nouveau loyer » se remplit seul.
  2. Régler le mois d'effet à 04/2027, cliquer « Réviser ».
  3. Lire le panneau et les échéances.
- **Attendu** :
  - Étape 1 : « Nouveau loyer » = **162 750** (155 000 × 1,05).
  - Historique (en tête) : « Loyer révisé de 155 000 à 162 750 FCFA au 01/04/2027 (+5 %) — 4 échéance(s) recalculée(s) ».
  - La révision est dans le futur : le loyer en vigueur reste **155 000** (panneau et fiche) ; les échéances 04/2027 à
    07/2027 passent à **172 750** (162 750 + 10 000) ; 10/2026 à 03/2027 restent à 165 000.
- **Gravité si échec** : Bloquant

### GL-03-010 — Révision des charges seules (L3)

- **Rôle** : ADMIN_A
- **Préconditions** : L3 (semestriel, loyer 1 200 000, charges 0, échéances 01/2027 et 07/2027).
- **Données** : mois d'effet `07/2027` ; nouveau loyer `1 200 000` (inchangé) ; nouvelles charges `15 000`.
- **Étapes** : réviser L3 avec ces valeurs.
- **Attendu** :
  - Seule l'échéance 07/2027 est recalculée : 1 200 000 + 15 000 = **1 215 000** ; l'échéance 01/2027 reste à
    1 200 000. Historique : « Loyer révisé de 1 200 000 à 1 200 000 FCFA au 01/07/2027 — 1 échéance(s) recalculée(s) »
    (la phrase ne mentionne pas les charges — constat Mineur).
  - Les charges en vigueur du bail restent 0 (révision future).
- **Gravité si échec** : Majeur

### GL-03-011 — Écart de révision inscrit au compte du locataire (LT2)

- **Rôle** : ADMIN_A
- **Préconditions** : LT2 : août, septembre et octobre 2026 « En retard » enregistrés (GL-03-002).
- **Données** : révision de LT2 : mois d'effet `10/2026`, loyer 155 000, charges 10 000.
- **Étapes** :
  1. Réviser LT2.
  2. Ouvrir Finance › Clients et propriétaires › Facturation et balances › Balance clients, puis la fiche du compte du
     locataire C2 (relevé).
- **Attendu** :
  - Échéances de LT2 : 08/2026 et 09/2026 à 160 000 ; 10/2026 à 07/2027 à 165 000.
  - Relevé du compte de C2 : une ligne d'ajustement « Révision du loyer — échéance 10/2026 » de **5 000** facturé.
    Aucune ligne pour les échéances encore « Brouillon » (novembre et suivantes : rien n'avait été inscrit).
  - Le solde du compte de C2 augmente de 5 000 par rapport à avant la révision.
- **Gravité si échec** : Bloquant (comptabilité locataire fausse)

### GL-03-012 — Annuler la révision, double clic

- **Rôle** : ADMIN_A
- **Préconditions** : L3.
- **Données** : mois 09/2027, loyer 1 250 000.
- **Étapes** :
  1. Ouvrir la fenêtre, saisir, cliquer « Annuler » ; rouvrir (les champs repartent des valeurs du bail) ; fermer par la
     croix ; fermer par Échap.
  2. Ouvrir, saisir une révision valable sur L8 (mois `06/2027`, loyer 85 000), double-cliquer sur « Réviser ».
- **Attendu** : étape 1 : aucun événement ; les valeurs saisies ne sont pas conservées. Étape 2 : un seul événement
  (une seule requête) ; L8 révisé une fois.
- **Gravité si échec** : Majeur (double événement) / Mineur

## C. Renouvellement

### GL-03-013 — Renouveler sans changer le prix (L4)

- **Rôle** : ADMIN_A
- **Préconditions** : L4 (annuel, fin 29/02/2028, 1 échéance 03/2027).
- **Données** : nouvelle date de fin `2029-02-28` ; loyer et charges vides ; observations `REC-GL renouvellement`.
- **Étapes** : « Renouveler », la fenêtre s'intitule « Renouveler le bail » ; saisir la date et valider avec
  « Renouveler ».
- **Attendu** :
  - Message « Bail renouvelé ». Panneau : « Date de fin » 28/02/2029.
  - Historique : « Bail renouvelé jusqu’au 28/02/2029 — 1 échéance(s) créée(s) ». L'échéance 03/2028 de 1 080 000, échue
    le 10/03/2028, apparaît dans l'onglet « Échéances » (2 échéances au total).
  - Aucun événement « Loyer révisé » (prix inchangé).
- **Gravité si échec** : Bloquant

### GL-03-014 — Renouveler avec un nouveau loyer (L5)

- **Rôle** : ADMIN_A
- **Préconditions** : L5 (fin 30/06/2027, 6 échéances de 400 000, jour 31).
- **Données** : nouvelle fin `2027-12-31` ; nouveau loyer `420 000` ; charges vides.
- **Étapes** : renouveler L5 avec ces valeurs.
- **Attendu** :
  - Six échéances créées, 07/2027 à 12/2027, de **420 000**, aux dates 31/07, 31/08, 30/09, 31/10, 30/11, 31/12/2027.
  - Historique : deux lignes — « Loyer révisé de 400 000 à 420 000 FCFA au 01/07/2027 » (« Nouveau loyer au
    renouvellement ») et « Bail renouvelé jusqu’au 31/12/2027 — 6 échéance(s) créée(s) ».
  - Le loyer en vigueur de L5 reste **400 000** jusqu'au 01/07/2027 (renouvellement planifié) ; les six échéances
    anciennes restent à 400 000. Aide du champ : « Facultatif : appliqué au premier mois qui suit l'ancienne fin. »
- **Gravité si échec** : Bloquant

### GL-03-015 — Renouveler un bail ayant une révision planifiée (L1)

- **Rôle** : ADMIN_A
- **Préconditions** : L1 : R-b planifiée en vigueur à partir du 04/2027 (loyer à 162 750) ; fin 31/07/2027.
- **Données** : nouvelle fin `2028-07-31` ; loyer vide.
- **Étapes** : renouveler L1 ; lire les échéances 08/2027 à 07/2028.
- **Attendu** :
  - 12 échéances créées (08/2027 à 07/2028) ; historique « Bail renouvelé jusqu’au 31/07/2028 — 12 échéance(s)
    créée(s) ».
  - Montant attendu pour chaque nouvelle échéance : **172 750** (loyer 162 750 en vigueur depuis 04/2027 + 10 000).
    Écart probable : les échéances sont créées à **165 000** (loyer du bail à ce jour, 155 000, la révision
    planifiée étant ignorée) — gravité Majeur (montant faux).
- **Gravité si échec** : Majeur

### GL-03-016 — Renouveler un bail terminé à la main (LS)

- **Rôle** : ADMIN_A
- **Préconditions** : LS au statut « Terminé » (GL-02-068), sans résiliation enregistrée ; fin 31/07/2027.
- **Données** : nouvelle fin `2027-10-31`.
- **Étapes** : fiche de LS › « Vie du bail » ; les boutons sont actifs ; « Renouveler ».
- **Attendu** : LS redevient « Actif » ; 3 échéances sont créées (08/2027, 09/2027, 10/2027) ; historique « Bail
  renouvelé jusqu’au 31/10/2027 — 3 échéance(s) créée(s) ». (Le bien P5 reste « Loué » grâce à LD3.)
- **Gravité si échec** : Majeur

### GL-03-017 — Nouvelle date de fin non postérieure à la fin actuelle

- **Rôle** : ADMIN_A
- **Préconditions** : L4, fin 28/02/2029 après GL-03-013.
- **Données** : `2029-02-28` puis `2028-01-01`.
- **Étapes** : dans « Renouveler », ouvrir le sélecteur ; essayer de saisir ces dates au clavier.
- **Attendu** : les jours jusqu'à la fin actuelle sont grisés ; une date saisie à la main déclenche « La nouvelle fin doit
  être postérieure à la fin actuelle » ; rien n'est envoyé.
- **Gravité si échec** : Majeur

### GL-03-018 — Bail à durée indéterminée

- **Rôle** : ADMIN_A
- **Préconditions** : L8 sans date de fin.
- **Données** : nouvelle fin `2028-01-31`.
- **Étapes** : « Renouveler » (le bouton est actif), saisir, valider.
- **Attendu** : bandeau d'erreur dans la fenêtre « Ce bail est à durée indéterminée : il n'a pas de fin à repousser. »
  (400) ; aucun événement. Le sélecteur n'impose aucune borne basse sur la date.
- **Gravité si échec** : Mineur

### GL-03-019 — Champs invalides et annulation du renouvellement

- **Rôle** : ADMIN_A
- **Préconditions** : L4.
- **Données** : date vide ; nouveau loyer `0` ; charges `-1` ; date `2030-02-28` valable.
- **Étapes** : valider sans date ; saisir loyer 0 avec une date valable ; annuler.
- **Attendu** : « La nouvelle date de fin est requise » ; loyer 0 refusé par le serveur avec un message lisible
  (le loyer, s'il est saisi, doit être positif) ; les charges négatives sont bornées à 0 ; « Annuler » ferme sans
  événement.
- **Gravité si échec** : Mineur

## D. Avenant

### GL-03-020 — Enregistrer un avenant

- **Rôle** : ADMIN_A
- **Préconditions** : L1.
- **Données** : date d'effet `03/11/2026` (date du jour par défaut) ; objet `REC-GL avenant : sous-location interdite`.
- **Étapes** : « Enregistrer un avenant » ; saisir l'objet ; « Enregistrer ».
- **Attendu** :
  - Message « Avenant enregistré ». Historique : « Avenant du 03/11/2026 : REC-GL avenant : sous-location interdite ».
  - Ni le loyer, ni les dates, ni le statut du bail ne changent ; aucune échéance n'est recalculée.
- **Gravité si échec** : Majeur

### GL-03-021 — Avenant : validations

- **Rôle** : ADMIN_A
- **Préconditions** : fenêtre « Enregistrer un avenant » ouverte.
- **Données** : objet vide ; objet `ab` (2 caractères) ; date d'effet effacée ; objet de 4 001 caractères.
- **Étapes** : tester chaque cas puis « Enregistrer ».
- **Attendu** : objet vide : « L'objet de l'avenant est requis » ; date effacée : « La date d'effet est requise » ;
  `ab` : refus 400 par le serveur, message lisible dans la fenêtre (3 caractères au minimum) ; 4 001 caractères :
  refus 400 (4 000 au maximum). Aucun événement créé dans ces cas.
- **Gravité si échec** : Mineur

### GL-03-022 — L'aide de l'avenant renvoie à une fonction absente

- **Rôle** : ADMIN_A
- **Préconditions** : GL-03-020 fait.
- **Données** : aucune.
- **Étapes** : lire l'aide sous le champ « Objet » (« Déposez l'avenant signé dans l'onglet Documents. ») puis ouvrir
  l'onglet « Documents » de L1.
- **Attendu** : l'onglet « Documents » permet de **générer** un document (« Générer un document »), pas d'en déposer
  un. Constat à signaler (Mineur) : l'aide promet un dépôt de fichier qui n'existe pas dans l'écran.
- **Gravité si échec** : Mineur

## E. Résiliation

### GL-03-023 — Fenêtre « Résilier le bail » et champs obligatoires

- **Rôle** : ADMIN_A
- **Préconditions** : LT.
- **Données** : champs vides.
- **Étapes** : « Résilier le bail », cliquer « Résilier » sans rien saisir.
- **Attendu** : fenêtre « Résilier le bail » avec « Date de préavis », « Date de fin », « À l'initiative de » (Locataire,
  Bailleur, Accord amiable), « Date de sortie des lieux » (facultative), « Motif » ; messages « La date de préavis est
  requise », « La date de fin est requise », « L'initiateur de la résiliation est requis » ; aucune confirmation ni
  appel réseau.
- **Gravité si échec** : Mineur

### GL-03-024 — Dates incohérentes de la résiliation

- **Rôle** : ADMIN_A
- **Préconditions** : LT (début 01/08/2026).
- **Données** : (a) préavis `2026-12-15`, fin `2026-12-01` ; (b) préavis `2026-05-01`, fin `2026-06-01` (avant le début
  du bail).
- **Étapes** : saisir chaque jeu, valider, puis confirmer la boîte « Résilier ce bail ? ».
- **Attendu** :
  - (a) bandeau d'erreur et message « Le préavis ne peut pas être postérieur à la date de fin. » (400) ; aucune
    résiliation.
  - (b) « La date de fin précède le début du bail. » (400).
  - Dans les deux cas, le bail n'est pas modifié et la fenêtre reste ouverte.
- **Gravité si échec** : Majeur

### GL-03-025 — Annuler la résiliation

- **Rôle** : ADMIN_A
- **Préconditions** : LT.
- **Données** : préavis `2026-11-01`, fin `2026-12-31`, initiative « Locataire ».
- **Étapes** : remplir, cliquer « Résilier » : la boîte « Résilier ce bail ? » (« Cette action est définitive et annule les
  échéances pas encore facturées au-delà de la fin du bail. ») s'ouvre ; cliquer « Annuler » ; puis fermer la fenêtre
  par « Annuler » / la croix.
- **Attendu** : rien n'est résilié ; les 12 échéances de LT existent toujours ; aucun événement.
- **Gravité si échec** : Majeur

### GL-03-026 — Résiliation à date future (LT)

- **Rôle** : ADMIN_A
- **Préconditions** : LT avec 12 échéances « Brouillon/En retard » non payées ; aucune pénalité.
- **Données** : préavis `2026-11-01` ; fin `2026-12-31` ; à l'initiative du « Locataire » ; sortie des lieux
  `2026-12-31` ; motif `REC-GL départ`.
- **Étapes** : remplir, « Résilier », confirmer par « Résilier » dans la boîte.
- **Attendu** :
  - Message « Bail résilié ». Alerte « Bail résilié — fin le 31/12/2026 ». « Date de fin » du panneau : 31/12/2026.
  - Historique : « Bail résilié au 31/12/2026, à l’initiative du locataire (préavis du 01/11/2026) — sortie des lieux le
    31/12/2026 ».
  - Échéances : 01/2027 à 07/2027 (7) passent « Annulé » ; 08/2026 à 12/2026 (5) restent. Aucun avertissement
    d'échéances réglées (« billedAfterEnd » = 0).
  - Le bail reste « Actif » tant que le 31/12/2026 n'est pas passé. La fiche indique « Date de fin » 31/12/2026 et
    « Date de déménagement » 31/12/2026.
  - Boutons « Réviser le loyer », « Renouveler » et « Résilier le bail » désactivés ; « Enregistrer un avenant » reste actif.
  - Apparition de la carte « Solde de tout compte » (voir F).
- **Gravité si échec** : Bloquant

### GL-03-027 — Résiliation à date passée, règlement postérieur, contre-passation (LT2)

- **Rôle** : ADMIN_A
- **Préconditions** : LT2 : révisée (GL-03-011), dépôt collecté (GL-03-002) ; encaisser d'abord l'échéance 11/2026 (165 000)
  par « Encaisser » (message « Encaissement enregistré. »).
- **Données** : préavis `2026-08-01` ; fin `2026-08-31` ; initiative « Bailleur » ; sortie `2026-08-31`.
- **Étapes** : résilier LT2 et confirmer ; lire le panneau et les échéances ; ouvrir le relevé du compte de C2 dans
  Finance › Balance clients.
- **Attendu** :
  - Message « Bail résilié ». Le bail passe tout de suite à « Terminé » (la date de fin est passée).
  - Alertes : « Bail résilié — fin le 31/08/2026 » et « 1 échéance(s) déjà réglée(s) après la fin du bail : à régulariser
    par un avoir. » (l'échéance 11/2026 payée).
  - Échéances : 09/2026, 10/2026 et 12/2026 à 07/2027 (10) « Annulé » ; 08/2026 reste « En retard » (160 000) ; 11/2026
    reste « Payé » (165 000).
  - Compte de C2 : contre-passations « Résiliation du bail — échéance 09/2026 annulée » (−160 000) et « Résiliation du
    bail — échéance 10/2026 annulée » (−165 000, l'ajustement de révision de 5 000 est inclus) ; les échéances encore
    « Brouillon » (12/2026 à 07/2027) n'avaient rien inscrit, donc rien à contre-passer.
  - Historique : « Bail résilié au 31/08/2026, à l’initiative du bailleur (préavis du 01/08/2026) — sortie des lieux le
    31/08/2026 ».
- **Gravité si échec** : Bloquant

### GL-03-028 — Après une résiliation passée, le bien reste-t-il « Loué » ?

- **Rôle** : ADMIN_A
- **Préconditions** : LT2 « Terminé » par résiliation (GL-03-027).
- **Données** : aucune.
- **Étapes** : ouvrir la fiche du bien P14.
- **Attendu** : un bail terminé devrait libérer le bien : P14 « Disponible » (comme après un changement de statut
  « Terminé », GL-02-068). Écart probable : P14 reste « Loué » (la résiliation ne remet pas le statut du bien) — gravité
  Majeur ; contournement : passer le bien « Disponible » à la main.
- **Gravité si échec** : Majeur

### GL-03-029 — Actions fermées après résiliation, y compris depuis un écran resté ouvert

- **Rôle** : ADMIN_A
- **Préconditions** : LT résilié (GL-03-026) ; ouvrir **avant** la résiliation un second onglet du navigateur sur la « Vie du
  bail » de LT (écran périmé), puis résilier dans le premier. Ensuite utiliser le second onglet.
- **Données** : révision mois 12/2026 loyer 160 000 ; renouvellement fin 2027-12-31 ; nouvelle résiliation.
- **Étapes** : dans l'onglet périmé, lancer successivement « Réviser », « Renouveler », « Résilier ».
- **Attendu** : trois refus 409, chacun affiché dans la fenêtre : « Ce bail est résilié : son loyer ne se révise plus. »,
  « Ce bail est résilié : il ne se renouvelle plus. », « Ce bail est déjà résilié. » ; l'événement de résiliation reste
  unique.
- **Gravité si échec** : Majeur

### GL-03-030 — Bail annulé : révision, renouvellement et résiliation refusés

- **Rôle** : ADMIN_A
- **Préconditions** : L10 au statut « Annulé » (GL-02-069).
- **Données** : révision mois 01/2027 loyer 75 000 ; renouvellement fin 2028-12-31 ; résiliation fin 2027-12-31.
- **Étapes** : les trois boutons sont actifs (aucune résiliation n'a eu lieu) ; essayer chacun.
- **Attendu** : chaque action est refusée par le serveur : « Ce bail est annulé. » (409) ; aucun événement ; le bail
  reste « Annulé ».
- **Gravité si échec** : Majeur

### GL-03-031 — Double clic sur « Résilier »

- **Rôle** : ADMIN_A
- **Préconditions** : L7 (P8, bail de test) : le résilier ici est acceptable car L7 n'est plus utilisé ensuite.
- **Données** : préavis `2026-11-01`, fin `2026-12-31`, initiative « Accord amiable ».
- **Étapes** : confirmer la boîte puis double-cliquer vivement sur « Résilier ».
- **Attendu** : un seul événement de résiliation ; un seul message « Bail résilié » ; pas de 409 affiché.
- **Gravité si échec** : Majeur

## F. Solde de tout compte

### GL-03-032 — Pas de solde avant la résiliation

- **Rôle** : ADMIN_A
- **Préconditions** : L1 non résilié.
- **Données** : aucune.
- **Étapes** : onglet « Vie du bail » de L1.
- **Attendu** : aucune carte « Solde de tout compte » (elle n'apparaît qu'une fois la résiliation enregistrée).
  `GET …/final-settlement` n'est pas appelé par l'écran.
- **Gravité si échec** : Mineur

### GL-03-033 — Solde d'un bail sans dépôt collecté (LT) : reste dû

- **Rôle** : ADMIN_A
- **Préconditions** : LT résilié (GL-03-026), échéances 08/2026, 09/2026, 10/2026 échues et non payées ; dépôt non collecté ;
  aucun état des lieux de sortie.
- **Données** : aucune.
- **Étapes** :
  1. Lire la carte « Solde de tout compte » **sans** recalculer les statuts.
  2. Menu « ⋮ » de l'onglet « Échéances » › « Recalculer les statuts et pénalités » ; revenir sur « Vie du bail » (F5).
- **Attendu** :
  - « Dépôt détenu » 0 ; « Retenues (état des lieux) » « Aucune » ; bandeau « L'état des lieux de sortie n'est pas
    finalisé : les retenues peuvent encore évoluer. ».
  - « Impayés » : **480 000** (3 échéances échues de 160 000 : 08/2026, 09/2026, 10/2026 ; une échéance 11/2026 en plus
    si la date du jour est postérieure au 05/11/2026). Avant le recalcul, un écart probable est « Impayés 0 » (le calcul ne
    lit que les échéances déjà enregistrées « À échoir / En retard / Partiel ») — gravité Majeur (solde faux).
  - Phrase finale : « Reste dû par le locataire : 480 000 FCFA » (solde = 0 − 480 000, jamais un montant négatif nu).
- **Gravité si échec** : Bloquant (solde faux)

### GL-03-034 — Solde avec dépôt collecté (LT2) : à restituer

- **Rôle** : ADMIN_A
- **Préconditions** : LT2 résilié (GL-03-027), dépôt collecté 300 000, aucun remboursement.
- **Données** : aucune.
- **Étapes** : onglet « Vie du bail » de LT2.
- **Attendu** : « Dépôt détenu » 300 000 ; « Impayés » 160 000 (échéance 08/2026 seule : les autres sont annulées ou
  payées) ; « Retenues (état des lieux) » « Aucune » ; phrase finale « À restituer au locataire : 140 000 FCFA »
  (300 000 − 160 000 − 0). Même bandeau sur l'état des lieux de sortie non finalisé.
- **Gravité si échec** : Bloquant

### GL-03-035 — Le solde suit le dépôt réellement détenu

- **Rôle** : ADMIN_A
- **Préconditions** : LT2 résilié ; dépôt de 300 000 collecté.
- **Données** : remboursement de 100 000 (mouvement « Remboursement »), confiscation de 20 000.
- **Étapes** : enregistrer les deux mouvements dans l'onglet « Dépôt de garantie » de LT2 puis rouvrir « Vie du bail ».
- **Attendu** : « Dépôt détenu » = 300 000 − 100 000 − 20 000 = **180 000** ; « À restituer au locataire : 20 000 FCFA »
  (180 000 − 160 000). Un blocage (mouvement « Blocage ») ne change pas le dépôt détenu.
- **Gravité si échec** : Majeur

### GL-03-036 — Solde et retenues de l'état des lieux de sortie

- **Rôle** : ADMIN_A
- **Préconditions** : fichier 04 : état des lieux de sortie finalisé avec retenues sur un bail résilié (cas GL-04-045).
- **Données** : voir GL-04-045.
- **Étapes** : rouvrir le solde de ce bail.
- **Attendu** : voir GL-04-045 (liste des retenues, « Total des retenues », bandeau d'avertissement absent, solde
  recalculé). Ce cas est joué dans le fichier 04.
- **Gravité si échec** : Majeur

## G. Historique, droits et isolation

### GL-03-037 — Historique : ordre et contenu

- **Rôle** : ADMIN_A
- **Préconditions** : L1 porte R-a, R-b, un renouvellement et un avenant.
- **Données** : aucune.
- **Étapes** : onglet « Vie du bail » de L1 ; recharger (F5) ; naviguer vers une autre page puis revenir avec le bouton
  Précédent.
- **Attendu** :
  - Quatre lignes, de la date d'effet la plus récente à la plus ancienne : renouvellement (01/08/2027), R-b
    (01/04/2027), avenant (03/11/2026), R-a (01/10/2026) ; chaque ligne porte une icône colorée et « Par <nom>, le
    <date> ».
  - Après F5 et retour, le même contenu s'affiche (le panneau recharge l'historique).
- **Gravité si échec** : Majeur

### GL-03-038 — Droits d'un collaborateur en lecture

- **Rôle** : LECTEUR_A
- **Préconditions** : L1 avec historique.
- **Données** : révision mois 12/2026 loyer 160 000 ; avenant `x1234`.
- **Étapes** : ouvrir « Vie du bail » ; essayer « Réviser », « Renouveler », « Enregistrer un avenant », « Résilier ».
- **Attendu** : la lecture fonctionne (historique, carte « Solde de tout compte » d'un bail résilié) ; chaque écriture
  est refusée par le serveur (403) avec le message « Vous n'avez pas les droits nécessaires pour effectuer cette
  action. » ; aucun événement créé. Constat : les boutons restent visibles pour ce profil.
- **Gravité si échec** : Bloquant

### GL-03-039 — Isolation de la vie du bail

- **Rôle** : ADMIN_B
- **Préconditions** : L1 existe en A.
- **Données** : `<leaseIdL1>`.
- **Étapes** (console du navigateur connecté en ADMIN_B) :
  1. `GET /api/tenants/<idB>/rental/leases/<leaseIdL1>/events`.
  2. `GET /api/tenants/<idB>/rental/leases/<leaseIdL1>/final-settlement`.
  3. `POST /api/tenants/<idB>/rental/leases/<leaseIdL1>/events/revision` avec `{"effectiveMonth":"2027-06","newRent":1}`.
  4. Mêmes appels avec `<idA>` à la place de `<idB>`.
- **Attendu** : étapes 1 à 3 : 404 « Bail introuvable » ; étape 4 : 403 (B n'est pas membre de A). Aucune écriture : le
  loyer de L1 est inchangé.
- **Gravité si échec** : Bloquant

### GL-03-040 — Avenant sur un bail résilié

- **Rôle** : ADMIN_A
- **Préconditions** : LT résilié.
- **Données** : objet `REC-GL avenant après résiliation`, date d'effet du jour.
- **Étapes** : « Enregistrer un avenant » sur LT.
- **Attendu** : l'avenant est accepté (le bouton reste actif) ; il apparaît dans l'historique ; il n'a aucun effet sur les
  échéances annulées ni sur la date de fin.
- **Gravité si échec** : Mineur

## H. Dépôt de garantie

Tous les cas H utilisent le bail L5 (dépôt cible 800 000), sauf mention contraire. Sauf indication, le rôle est ADMIN_A.
`<M>` désigne le montant du mouvement. Le tableau de suivi ci-dessous donne l'état attendu après chaque mouvement réussi :

| Étape | Mouvement             | Collecté | Retenu (blocage) | Remboursé | Confisqué | Solde actuel affiché |
| ----- | --------------------- | -------- | ---------------- | --------- | --------- | -------------------- |
| 0     | création              | 0        | 0                | 0         | 0         | 0                    |
| 1     | Collecte 800 000      | 800 000  | 0                | 0         | 0         | 800 000              |
| 2     | Blocage 100 000       | 800 000  | 100 000          | 0         | 0         | 800 000              |
| 3     | Libération 30 000     | 800 000  | 70 000           | 0         | 0         | 800 000              |
| 4     | Remboursement 200 000 | 800 000  | 70 000           | 200 000   | 0         | 600 000              |
| 5     | Confiscation 50 000   | 800 000  | 70 000           | 200 000   | 50 000    | 550 000              |
| 6     | Ajustement 20 000     | 820 000  | 70 000           | 200 000   | 50 000    | 570 000              |

### GL-03-041 — Dépôt créé automatiquement à la première ouverture

- **Rôle** : ADMIN_A
- **Préconditions** : L5 (dépôt 800 000) dont l'onglet « Dépôt de garantie » n'a jamais été ouvert.
- **Données** : aucune.
- **Étapes** : fiche de L5 › onglet « Dépôt de garantie » ; regarder le réseau.
- **Attendu** :
  - Titre « Dépôt de garantie », texte « Gérez le dépôt de garantie du bail », bouton « Nouveau mouvement ».
  - « Montant cible » 800 000 (F CFA), « Solde actuel » 0, « Statut » « En attente ».
  - Carte « Historique des mouvements » : « Aucun mouvement enregistré ».
  - `GET …/leases/<leaseId>/deposit` répond 200 (le dépôt est créé à cette première lecture).
- **Gravité si échec** : Majeur

### GL-03-042 — Bail sans dépôt

- **Rôle** : ADMIN_A
- **Préconditions** : L2 (dépôt 0).
- **Données** : aucune.
- **Étapes** : fiche de L2 › « Dépôt de garantie ».
- **Attendu** : message « Aucun dépôt de garantie configuré pour ce bail » ; pas de bouton « Nouveau mouvement » ; la
  requête `GET …/deposit` répond 404 (attendu), sans bandeau d'erreur. Constat : aucun moyen de créer un dépôt depuis
  l'écran pour un bail à dépôt 0 (la modification du bail peut le fixer, voir GL-03-060).
- **Gravité si échec** : Mineur

### GL-03-043 — Préparer un paiement libre de 800 000

- **Rôle** : ADMIN_A
- **Préconditions** : L5.
- **Données** : méthode « Espèces », montant `800 000`, date du règlement d'aujourd'hui, devise FCFA.
- **Étapes** : fiche de L5 › onglet « Paiements » › « Nouveau paiement » › remplir › enregistrer (ne pas l'affecter à
  une échéance).
- **Attendu** : message « Paiement enregistré. » ; le paiement apparaît « Réussi » avec un « Reste à affecter » de
  800 000. La date du règlement ne peut pas être dans le futur.
- **Gravité si échec** : Bloquant (préalable)

### GL-03-044 — Collecte : paiement obligatoire

- **Rôle** : ADMIN_A
- **Préconditions** : GL-03-043 fait.
- **Données** : type « Collecte », aucun paiement choisi.
- **Étapes** : « Nouveau mouvement » › type « Collecte » (par défaut) ; observer le montant ; « Enregistrer » sans paiement.
- **Attendu** : le champ « Montant » est rempli à **800 000** (montant cible) avec l'aide « Pour une collecte, ce montant
  doit être égal au montant cible du dépôt (rempli automatiquement). » ; message « Le paiement est requis pour une
  collecte » ; aucun envoi.
- **Gravité si échec** : Mineur

### GL-03-045 — Collecte : montant différent de la cible

- **Rôle** : ADMIN_A
- **Préconditions** : GL-03-043 fait.
- **Données** : paiement de 800 000 ; montant modifié à `700 000`.
- **Étapes** : choisir le paiement (libellé « 800 000 F CFA - CASH - <date> » : le mode de paiement s'affiche avec son code technique anglais, constat Cosmétique) ; changer le montant ; « Enregistrer ».
- **Attendu** : refus 400 : « Le montant encaissé (700000) doit être égal au montant cible (800000) » affiché en
  message et dans le bandeau du formulaire ; le formulaire reste ouvert ; solde inchangé.
- **Gravité si échec** : Majeur

### GL-03-046 — Collecte nominale (étape 1)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-03-043 fait.
- **Données** : paiement 800 000 ; montant 800 000 ; note `REC-GL collecte`.
- **Étapes** : « Nouveau mouvement » › « Collecte » › paiement › note › « Enregistrer ».
- **Attendu** :
  - Message « Mouvement enregistré avec succès. » ; le formulaire se ferme.
  - « Solde actuel » **800 000** ; statut « Complet ». Historique : une ligne « Collecte » en vert « +800 000 », note
    `REC-GL collecte`.
  - Onglet « Paiements » : le paiement de 800 000 n'a plus de « Reste à affecter » (utilisé pour le dépôt).
  - Réseau : `POST …/rental/deposits/<depositId>/movements` répond 201.
- **Gravité si échec** : Bloquant

### GL-03-047 — Seconde collecte refusée

- **Rôle** : ADMIN_A
- **Préconditions** : GL-03-046 fait ; un second paiement libre de 800 000 créé.
- **Données** : second paiement 800 000.
- **Étapes** : « Nouveau mouvement » › « Collecte » › second paiement › « Enregistrer ».
- **Attendu** : refus 400 « Le dépôt de garantie ne peut être encaissé qu'une seule fois (paiement unique exigé) » ;
  solde inchangé à 800 000.
- **Gravité si échec** : Majeur

### GL-03-048 — Paiement non utilisable pour la collecte

- **Rôle** : ADMIN_A
- **Préconditions** : dépôt de L3 (cible 400 000, jamais collecté) ; deux paiements de L3 : un de 300 000 libre, un de 400 000
  déjà affecté à une échéance.
- **Données** : aucune.
- **Étapes** : fiche de L3 › « Dépôt de garantie » › « Nouveau mouvement » › « Collecte » › ouvrir « Paiement associé ».
- **Attendu** : la liste ne propose que les paiements « Réussi » dont le montant encore libre couvre 400 000 : ni celui
  de 300 000 (insuffisant), ni celui déjà affecté ; sinon « Aucun paiement trouvé ». Un paiement d'un autre bail
  n'apparaît pas.
- **Gravité si échec** : Majeur

### GL-03-049 — Blocage (étape 2)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-03-046 fait.
- **Données** : type « Blocage » ; montant `100 000` ; note `REC-GL blocage dégâts`.
- **Étapes** : « Nouveau mouvement » › « Blocage » › montant › « Enregistrer ».
- **Attendu** : message de succès ; le champ « Paiement associé » n'existe pas pour ce type ; « Solde actuel » reste
  **800 000** (un blocage ne réduit pas le solde affiché) ; ligne « Blocage » dans l'historique, montant affiché « -100 000 »
  en rouge (constat : un blocage n'est pas une sortie d'argent, le signe est trompeur — Cosmétique).
- **Gravité si échec** : Majeur

### GL-03-050 — Libération (étape 3)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-03-049 fait (retenu 100 000).
- **Données** : type « Libération » ; montant `30 000`.
- **Étapes** : enregistrer le mouvement.
- **Attendu** : succès ; retenu = 70 000 (non affiché à l'écran) ; solde actuel inchangé 800 000.
- **Gravité si échec** : Majeur

### GL-03-051 — Libération supérieure à ce qui est retenu

- **Rôle** : ADMIN_A
- **Préconditions** : GL-03-050 fait (retenu 70 000).
- **Données** : montant `100 000`.
- **Étapes** : « Libération » 100 000 › « Enregistrer ».
- **Attendu** : refus 400 « Le montant retenu est insuffisant pour cette libération (retenu : 70000, demandé : 100000) » ;
  aucun mouvement ajouté.
- **Gravité si échec** : Majeur

### GL-03-052 — Remboursement avec compte de trésorerie (étape 4)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-03-050 fait.
- **Données** : type « Remboursement » ; montant `200 000` ; compte de trésorerie : un compte actif de l'agence.
- **Étapes** : choisir « Remboursement » : le champ « Compte de trésorerie » apparaît (aide « Compte débité pour le
  remboursement du dépôt de garantie au locataire. ») ; sélectionner un compte ; « Enregistrer ».
- **Attendu** : succès ; « Solde actuel » **600 000** ; le statut passe à « En attente » (solde inférieur à la cible — libellé
  discutable, constat Cosmétique) ; ligne « Remboursement » « -200 000 » ; le compte de trésorerie choisi est débité de
  200 000 (contrôle dans Finance › caisse/trésorerie). Sans compte choisi, la caisse par défaut est utilisée.
- **Gravité si échec** : Majeur

### GL-03-053 — Remboursement supérieur au solde

- **Rôle** : ADMIN_A
- **Préconditions** : solde 600 000.
- **Données** : montant `700 000`.
- **Étapes** : « Remboursement » 700 000 › « Enregistrer ».
- **Attendu** : refus 400 « Solde du dépôt insuffisant (disponible : 600000, demandé : 700000) » ; solde inchangé.
- **Gravité si échec** : Bloquant (si le remboursement passe)

### GL-03-054 — Confiscation (étape 5) et confiscation trop élevée

- **Rôle** : ADMIN_A
- **Préconditions** : solde 600 000.
- **Données** : confiscation `50 000`, puis `600 000`.
- **Étapes** : enregistrer chaque confiscation.
- **Attendu** : `50 000` : succès, solde **550 000** ; `600 000` : refus « Solde du dépôt insuffisant (disponible :
  550000, demandé : 600000) ».
- **Gravité si échec** : Majeur

### GL-03-055 — Ajustement (étape 6)

- **Rôle** : ADMIN_A
- **Préconditions** : solde 550 000.
- **Données** : « Ajustement » `20 000`.
- **Étapes** : enregistrer ; essayer ensuite une valeur négative `-20 000`.
- **Attendu** : succès ; solde **570 000** (le collecté passe à 820 000) ; ligne « Ajustement » « +20 000 » en vert. Une
  valeur négative est refusée (« Le montant doit être supérieur à 0 ») : on ne peut donc corriger un dépôt qu'à la hausse
  (constat à signaler : un ajustement sans paiement gonfle le dépôt collecté).
- **Gravité si échec** : Majeur

### GL-03-056 — Retenue supérieure au dépôt

- **Rôle** : ADMIN_A
- **Préconditions** : étapes 1 à 6 faites ; solde 570 000.
- **Données** : « Blocage » `900 000` (plus que le dépôt).
- **Étapes** : enregistrer le mouvement.
- **Attendu** : une retenue supérieure au dépôt devrait être refusée. Écart probable : le blocage est accepté (le total
  retenu dépasse le dépôt collecté) — gravité Majeur (montant incohérent) ; vérifier que le solde actuel reste 570 000.
- **Gravité si échec** : Majeur

### GL-03-057 — Montant invalide d'un mouvement

- **Rôle** : ADMIN_A
- **Préconditions** : formulaire ouvert.
- **Données** : montant vide ; `0` ; `-100` ; `abc` ; `0,001` ; `10 000 000 000`.
- **Étapes** : tester chaque valeur puis « Enregistrer ».
- **Attendu** : vide : « Le montant est requis » ; `0` : « Le montant doit être supérieur à 0 » ; le champ refuse les
  valeurs négatives et les lettres ; `0,001` : accepté par l'écran ou refusé proprement (à noter) ; montant démesuré :
  refus lisible (collecte : « doit être égal au montant cible » ; remboursement : solde insuffisant). Aucun 500.
- **Gravité si échec** : Mineur

### GL-03-058 — Annuler, double clic, rechargement

- **Rôle** : ADMIN_A
- **Préconditions** : dépôt de L5 avec des mouvements.
- **Données** : blocage `1 000`.
- **Étapes** : ouvrir le formulaire, cliquer « Annuler » ; rouvrir, saisir, double-cliquer « Enregistrer » ; recharger (F5).
- **Attendu** : « Annuler » ferme sans enregistrer ; le double clic crée un seul mouvement ; après F5 les mouvements et le
  solde sont identiques (570 000).
- **Gravité si échec** : Mineur

### GL-03-059 — Liste des mouvements : libellés, signes, ordre

- **Rôle** : ADMIN_A
- **Préconditions** : suite de mouvements faite.
- **Données** : aucune.
- **Étapes** : lire la carte « Historique des mouvements » et l'exporter (« Exporter » › CSV).
- **Attendu** :
  - Colonnes « Date », « Type », « Montant », « Note » ; le plus récent en haut.
  - Libellés : « Collecte », « Blocage », « Libération », « Remboursement », « Confiscation », « Ajustement ».
  - Signes : « + » vert pour Collecte et Ajustement ; « - » rouge pour Blocage, Libération, Remboursement,
    Confiscation (constat : « Libération » et « Blocage » ne sont pas des sorties de trésorerie).
  - L'export donne les montants signés (nombres) dans le même ordre.
- **Gravité si échec** : Mineur

### GL-03-060 — Montant du dépôt modifié sur le bail après création du dépôt

- **Rôle** : ADMIN_A
- **Préconditions** : L3 : dépôt créé à 400 000 (onglet ouvert au moins une fois).
- **Données** : dépôt du bail `450 000`.
- **Étapes** : modifier L3 (GL-02-057), « Dépôt de garantie » = 450 000 › « Mettre à jour » ; rouvrir l'onglet « Dépôt de
  garantie ».
- **Attendu** : les deux écrans doivent concorder. Écart probable : la carte « Financier » indique 450 000 alors que
  l'onglet « Dépôt de garantie » garde un « Montant cible » de 400 000 (la cible du dépôt déjà créé n'est pas mise à
  jour) ; une collecte devra alors porter sur 400 000 — gravité Majeur.
  Pour L2 (dépôt 0) : mettre 90 000 sur le bail crée la cible 90 000 à la prochaine ouverture de l'onglet.
- **Gravité si échec** : Majeur

### GL-03-061 — Dépôt : droits et isolation

- **Rôle** : LECTEUR_A puis ADMIN_B
- **Préconditions** : dépôt de L5 avec mouvements ; `<depositId>` relevé dans la requête réseau.
- **Données** : mouvement « Blocage » 1 000.
- **Étapes** :
  1. LECTEUR_A : onglet « Dépôt de garantie » de L5, puis « Nouveau mouvement » › « Enregistrer ».
  2. ADMIN_B (console) : `GET /api/tenants/<idB>/rental/leases/<leaseIdL5>/deposit` ;
     `GET /api/tenants/<idB>/rental/deposits/<depositId>/movements` ;
     `POST /api/tenants/<idB>/rental/deposits/<depositId>/movements` avec un blocage valide.
  3. ADMIN_A (console) : `POST …/deposits/<depositId>/movements` de collecte avec le `paymentId` d'un paiement d'un **autre**
     bail.
- **Attendu** :
  - Étape 1 : lecture possible (solde, mouvements) ; enregistrement refusé 403 « Vous n'avez pas les droits nécessaires… ».
  - Étape 2 : 404 « Bail introuvable » puis deux fois 404 « Dépôt de garantie introuvable » ; aucun mouvement ajouté.
  - Étape 3 : refus (« Ce paiement n'appartient pas au bail de ce dépôt de garantie » ou « Seul un paiement encaissé… ») ;
    rien d'écrit.
- **Gravité si échec** : Bloquant

### GL-03-062 — Notifications et portail locataire après un mouvement

- **Rôle** : ADMIN_A, puis LOCATAIRE_PORTAIL (C2, locataire de L5)
- **Préconditions** : notifications « mouvement de dépôt » activées ; C2 a un compte (mot de passe défini par le lien du
  puits SMTP de GL-02-007).
- **Données** : remboursement de 10 000 sur L5.
- **Étapes** :
  1. Enregistrer le remboursement.
  2. Relever les `.eml` adressés à C2 et à C3.
  3. En LOCATAIRE_PORTAIL, ouvrir `/tenant/deposit`.
- **Attendu** : C2 reçoit un message de mouvement (« Remboursement », montant 10 000, bail) ; C3 aussi si la notification
  propriétaire est active ; le portail affiche le dépôt de L5 avec le solde détenu (cible 800 000, détenu = collecté −
  remboursé − confisqué), sans chemin de fichier ni donnée d'un autre locataire.
- **Gravité si échec** : Majeur

---

## Couverture

| Sous-fonctionnalité du classeur                                                                                                           | Cas GL-03-…                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Consulter l'historique du bail (ligne 13)                                                                                                 | 001, 037, 038, 039                                                                                                                            |
| Réviser le loyer (ligne 14) : immédiate, planifiée, taux, charges seules, mois invalides, échéances réglées, écart au compte du locataire | 003 à 012, 038, 039                                                                                                                           |
| Renouveler le bail (ligne 15)                                                                                                             | 013 à 019, 029, 030                                                                                                                           |
| Enregistrer un avenant (ligne 16)                                                                                                         | 020, 021, 022, 038, 040                                                                                                                       |
| Résilier le bail (ligne 17) : date future, date passée, contre-passation, échéances réglées après la fin                                  | 023 à 031                                                                                                                                     |
| Consulter le solde de tout compte (ligne 18)                                                                                              | 032 à 036                                                                                                                                     |
| Dépôt de garantie : consulter / créer (ligne 27)                                                                                          | 041, 042, 060                                                                                                                                 |
| Mouvement de dépôt : collecte, blocage, libération, remboursement, confiscation, ajustement (ligne 28)                                    | 043 à 058                                                                                                                                     |
| Lister les mouvements de dépôt (ligne 29)                                                                                                 | 046, 059                                                                                                                                      |
| Droits (LECTEUR_A) et isolation (ADMIN_B)                                                                                                 | 038, 039, 061                                                                                                                                 |
| Portail locataire (dépôt) et e-mails de mouvement                                                                                         | 062                                                                                                                                           |
| Création explicite du dépôt (`POST …/deposit`)                                                                                            | non testable en interface (le dépôt se crée à la première lecture ; aucun bouton « Créer le dépôt »)                                          |
| Tâche quotidienne qui applique les révisions planifiées à leur date d'effet (`applyDueRevisions`)                                         | non testable en interface (nécessite d'attendre la date d'effet : vérifier après le 01/04/2027 que le loyer en vigueur de L1 passe à 162 750) |
| Passage de la résiliation future à « Terminé » à sa date de fin                                                                           | non testable en interface (dépend de la date ; à vérifier après le 31/12/2026)                                                                |
