# 09 — Tableau de bord, balances, caisse, écritures comptables, exports

**Périmètre.** Tout ce qui reste côté agence autour de l'argent du locatif : tableau de bord / accueil (impayés, à encaisser sous 7 jours, encaissé du mois, trésorerie sur 12 mois, échéances par statut, moyens de paiement, file de travail), balance clients, balance âgée et relevé d'un locataire (impression), caisse d'agence (ouverture, encaissements de loyers, clôture, validation), écritures comptables générées par les encaissements (Finance › Comptabilité), exports (Excel, CSV, PDF) des listes locatives (Baux, Échéances, Paiements, Pénalités, Dépôts, Documents, Déclarations) et impression. Les relevés de gérance, comptes propriétaires et reversements sont dans `GL-10-…` ; le portail locataire dans `GL-11-…`.

**Écrans et URL.**

| Écran                 | URL                                              | Menu                                                                                                              |
| --------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Tableau de bord       | `/dashboard`                                     | Accueil › Tableau de bord                                                                                         |
| Balance clients       | `/tenant/<tenantId>/finance/balance-clients`     | Plus › Finance › Clients et propriétaires › Facturation et balances › Balance clients                             |
| Balance âgée          | `/tenant/<tenantId>/finance/balance-agee`        | … › Balance âgée                                                                                                  |
| Relevé d'un locataire | `/tenant/<tenantId>/finance/comptes/<accountId>` | Balance clients › « Voir le relevé »                                                                              |
| Facturation du mois   | `/tenant/<tenantId>/finance/facturation`         | … › Facturation du mois                                                                                           |
| Caisse                | `/tenant/<tenantId>/finance/caisse`              | Plus › Finance › Caisse et comptabilité › Caisse et trésorerie › onglet « Caisse »                                |
| Comptabilité          | `/tenant/<tenantId>/finance/comptabilite`        | Plus › Finance › Caisse et comptabilité › Comptabilité (onglets Journal, Grand livre, Balance générale, Mandants) |

**Prérequis.** `GL-01-…`, `GL-02-…`, `GL-05-…` (échéances, campagne), `GL-06-…` (paiements). L'agence A porte l'historique du jeu de base (≈ 1 000 échéances, 750 encaissements) : les totaux globaux (tuiles, graphiques, listes complètes) contiennent aussi cet historique. **Méthode : toute vérification sur un total global se fait par écart avant/après** (relever, agir, relever) ou par rapprochement avec une liste exportée ; les montants exacts se lisent sur les légendes des graphiques et les listes, car les tuiles abrègent les montants (« 12,4 M », « 850 k »).

**Date de référence : 03/11/2026.** Jours de retard : 5 juillet 121 j, 5 août 90 j, 5 septembre 59 j, 5 octobre 29 j.

**Données créées par ce fichier.**

| Objet                                                         | Valeur                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locataire « REC-GL Locataire Rapports » + bail REC-GL-RPT-1   | bien « REC-GL Bien RPT-1 » (bien détenu en propre par l'agence, **sans propriétaire mandant** : gestion directe), 01/07/2026 → 30/06/2027, mensuel, jour 5, loyer 150 000, charges 10 000 (160 000), **grâce 365 jours** (aucune pénalité), Actif. Échéances générées puis « Recalculer les statuts et pénalités » lancé une fois : juillet à octobre 2026 enregistrées « En retard ». |
| Locataire « REC-GL Locataire Rapports 2 » + bail REC-GL-RPT-2 | mêmes paramètres que RPT-1 (160 000, grâce 365). Sert aux cas du tableau de bord (paiements et annulations) pour ne pas modifier RPT-1.                                                                                                                                                                                                                                                |
| Locataire « REC-GL Locataire Caisse » + bail REC-GL-CAI-1     | bien « REC-GL Bien CAI-1 », mêmes dates, loyer 100 000, charges 0, grâce 365, Actif, échéances générées. Sert uniquement à la caisse.                                                                                                                                                                                                                                                  |
| Bail REC-GL-OWN (cas `GL-06-…`)                               | bail à **propriétaire mandant** (PROPRIETAIRE_PORTAIL), sert aux écritures du compte mandant.                                                                                                                                                                                                                                                                                          |

---

## A. Tableau de bord

### GL-09-001 — Lecture du tableau de bord locatif

- **Rôle** : ADMIN_A
- **Préconditions** : agence A avec la fonction Gestion locative.
- **Données** : aucune.
- **Étapes** :
  1. Se connecter et ouvrir **Accueil › Tableau de bord** (`/dashboard`).
  2. Lire l'en-tête, les tuiles, les graphiques, la file de travail et l'activité récente.
- **Attendu** :
  - Titre « Tableau de bord », sous-titre « Bonjour <prénom> · <mois année> ».
  - Tuiles locatives : **Impayés** (montant abrégé + « N échéance(s) en retard »), **À encaisser sous 7 jours** (« N échéance(s) »), **Encaissé (novembre 2026)** (montant + « objectif du mois : … » ou « +x % vs mois précédent »), puis les tuiles Biens, Contacts, Tickets ouverts.
  - Graphiques : « Trésorerie sur 12 mois » (légende « Encaissé » et « Attendu »), « Échéances par statut », « Moyens de paiement » ; carte de la file de travail ; fil d'activité.
  - Aucun « — » ni « Module non accessible » pour un administrateur de l'agence ; aucune erreur dans la console.
  - Il n'existe **pas** de tuile « taux de recouvrement » : voir GL-09-009.
- **Gravité si échec** : Majeur

### GL-09-002 — Impayés = échéances « En retard » de la liste

- **Rôle** : ADMIN_A
- **Préconditions** : GL-09-001 ; relever tuile Impayés (nombre et montant abrégé).
- **Données** : liste Encaisser › Échéances filtrée Statut = « En retard ».
- **Étapes** :
  1. Relever sur la tuile « Impayés » : montant (ex. « 41,2 M ») et nombre (« N échéances en retard »).
  2. Cliquer la tuile : l'adresse devient `/tenant/<tenantId>/rental/installments?status=OVERDUE`.
  3. Sur la liste filtrée, lire le total (« N échéances ») ; **Exporter** en CSV, sommer la colonne « Reste à payer ».
- **Attendu** :
  - Le nombre de lignes = N de la tuile ; la somme des « Reste à payer » (arrondie à 0,1 M) = montant de la tuile.
  - La tuile est cliquable (menu vers la liste filtrée) ; la liste montre les échéances échues « Brouillon », « À échoir » non payées et « En retard » (statut reclassé).
  - Écart toléré : uniquement l'arrondi d'affichage ; une différence de comptage est une anomalie.
- **Gravité si échec** : Bloquant

### GL-09-003 — Impayés bougent avec les données : création d'un bail, paiement

- **Rôle** : ADMIN_A
- **Préconditions** : GL-09-002 (valeurs de départ I0 = nombre, M0 = montant).
- **Données** : bail REC-GL-RPT-2 (4 échéances échues de 160 000 = 640 000 de reste dû).
- **Étapes** :
  1. Créer REC-GL-RPT-2, générer ses échéances ; rouvrir le tableau de bord.
  2. Sur RPT-2, encaisser en espèces l'échéance de juillet (160 000).
  3. Rouvrir le tableau de bord.
- **Attendu** :
  - Après l'étape 1 : nombre d'impayés = I0 + **4** ; montant = M0 + 640 000 (à l'arrondi près, ex. 41,2 M → 41,8 M) ; la file de travail ne contient que les plus anciens retards de l'agence.
  - Après l'étape 3 : nombre = I0 + **3** ; montant = M0 + 480 000.
  - La liste « En retard » reflète les mêmes variations.
- **Gravité si échec** : Bloquant

### GL-09-004 — Une échéance partiellement payée et échue n'est pas dans « Impayés »

- **Rôle** : ADMIN_A
- **Préconditions** : GL-09-003 ; relever I1 (nombre d'impayés).
- **Données** : RPT-2, échéance d'août : paiement de 60 000.
- **Étapes** :
  1. Onglet Échéances de RPT-2 › `08/2026` › **Paiement…** › 60000 espèces.
  2. Relire la tuile Impayés et la liste « En retard ».
- **Attendu** :
  - L'échéance `08/2026` passe « Partiel » (reste 100 000) : elle sort de la tuile (nombre = I1 − 1) et du filtre « En retard ».
  - **Observation à valider avec le métier** : le montant restant dû (100 000, échu depuis 90 jours) ne figure alors dans aucun compteur du tableau de bord ni dans la file de travail. Consigner si le métier attend que « Impayés » inclue les partiels échus.
- **Gravité si échec** : Majeur

### GL-09-005 — « À encaisser sous 7 jours » après la campagne du mois

- **Rôle** : ADMIN_A
- **Préconditions** : `GL-05-025` (campagne de novembre faite) ; relever la tuile avant et après.
- **Données** : échéances « À échoir » (statut DUE ou Partiel) dont la date est dans les 7 prochains jours (05/11/2026).
- **Étapes** :
  1. Relever la tuile « À encaisser sous 7 jours » (N échéances, montant).
  2. Lancer la campagne de novembre si elle ne l'est pas (Facturation du mois), relire la tuile.
  3. Cliquer la tuile (`…/rental/installments?status=DUE`).
- **Attendu** :
  - Avant la campagne les échéances générées restent « Brouillon » et ne comptent pas ; après la campagne le nombre augmente du nombre de baux dont l'échéance de novembre est émise et tombe dans les 7 jours (REC-GL : MENS, RPT-1, CAI-1, DD-x… — compter par la liste filtrée « À échoir » dont la date d'échéance ≤ J+6).
  - La liste filtrée « À échoir » est cohérente avec la tuile (même nombre de lignes dans la fenêtre).
  - Les échéances « Brouillon » (non émises) n'entrent pas dans ce chiffre (comportement constaté, à signaler si le métier les attend).
- **Gravité si échec** : Majeur

### GL-09-006 — « Encaissé (mois) » : paiement du jour et légende exacte

- **Rôle** : ADMIN_A
- **Préconditions** : bail RPT-2 (GL-09-003) ; relever dans « Trésorerie sur 12 mois » la valeur exacte « Encaissé » de la légende (E0) et la tuile « Encaissé (novembre 2026) ».
- **Données** : paiement espèces de 100 000 daté d'aujourd'hui sur REC-GL-RPT-2, échéance `09/2026`.
- **Étapes** :
  1. Relever E0 (légende) et la tuile.
  2. Sur RPT-2, `09/2026` › **Paiement…** › Espèces, 100000, date d'aujourd'hui.
  3. Rouvrir le tableau de bord.
- **Attendu** :
  - Légende « Encaissé » = E0 + 100 000 (montant exact) ; la tuile « Encaissé » augmente de 0,1 M à l'arrondi près ; l'entrée « Moyens de paiement › Espèces » augmente de 100 000.
  - Le fil d'activité affiche l'encaissement récent.
- **Gravité si échec** : Bloquant

### GL-09-007 — « Encaissé » compte par date du règlement, pas par date de saisie

- **Rôle** : ADMIN_A
- **Préconditions** : GL-09-006 ; relever E1 (légende « Encaissé ») et le texte « % vs mois précédent » de la tuile.
- **Données** : paiement espèces de 50 000 sur RPT-2 avec « Date du règlement » = 15/10/2026 (saisi aujourd'hui).
- **Étapes** :
  1. Onglet Paiements de RPT-2 › Nouveau paiement › Espèces, 50000, Date du règlement 15/10/2026.
  2. Relire le tableau de bord.
- **Attendu** :
  - La légende « Encaissé » (12 mois) augmente de 50 000 ; la tuile « Encaissé (novembre 2026) » **ne bouge pas** (le montant est d'octobre) ; le mois précédent augmente (le pourcentage « vs mois précédent » diminue).
  - Anomalie si la tuile du mois courant augmente.
- **Gravité si échec** : Majeur

### GL-09-008 — Paiements annulés, échoués ou en attente ne comptent pas

- **Rôle** : ADMIN_A
- **Préconditions** : GL-09-007.
- **Données** : paiements de 50 000 (GL-09-007) et de 100 000 (GL-09-006).
- **Étapes** :
  1. Annuler le paiement de 50 000 (statut « Annulé »), relever la légende.
  2. Passer un autre paiement de test en « En attente », relever la légende.
- **Attendu** :
  - La légende « Encaissé » retombe de 50 000 après l'annulation, puis du montant du paiement passé en attente : seuls les paiements « Réussi » sont comptés.
  - (Observation : un paiement « En attente » alors qu'il est affecté à une échéance sort de l'« Encaissé » mais l'échéance reste payée : voir `GL-06-034`.)
- **Gravité si échec** : Majeur

### GL-09-009 — Taux de recouvrement : indicateur absent, calcul à partir des légendes

- **Rôle** : ADMIN_A
- **Préconditions** : tableau de bord ouvert.
- **Données** : légendes « Encaissé » et « Attendu » de « Trésorerie sur 12 mois ».
- **Étapes** :
  1. Chercher une tuile ou un graphique « taux de recouvrement » (ou « % recouvré »).
  2. Lire dans la légende de « Trésorerie sur 12 mois » : Encaissé (E), Attendu (A).
  3. Pour le mois en cours, comparer « Encaissé (novembre 2026) » avec « objectif du mois : … ».
- **Attendu** :
  - **Aucun taux de recouvrement n'est affiché** pour la location (seule la copropriété, section Syndic, porte un taux « recouvré »). Constat à consigner : l'agence doit calculer E / A elle-même.
  - « Attendu » = somme des échéances (loyer, charges, autres frais, pénalités) dont l'échéance tombe dans les 12 mois, hors annulées ; « objectif du mois » = même somme sur le seul mois. Contrôler sur un échantillon : pour le mois courant, la somme des « Montant dû » des échéances de novembre (liste filtrée par date) = objectif.
- **Gravité si échec** : Mineur

### GL-09-010 — « Échéances par statut » et « Moyens de paiement »

- **Rôle** : ADMIN_A
- **Préconditions** : paiements en espèces, virement, Mobile Money et au moins un prélèvement bancaire (`GL-08-051`).
- **Données** : cartes de graphiques.
- **Étapes** :
  1. Lire « Échéances par statut » (barres : longueur = reste à encaisser) et survoler une barre.
  2. Lire « Moyens de paiement » (12 derniers mois) : légende, montants, total « encaissés ».
  3. Cliquer « Encaisser » (lien de la carte) puis « Voir les paiements ».
- **Attendu** :
  - Barres pour Brouillon, À échoir, Partiel, En retard, Payé avec infobulle « <nombre> · <montant abrégé> » ; la barre « En retard » = tuile Impayés.
  - Moyens de paiement : libellés « Espèces », « Virement », « Chèque », « Mobile Money », « Prélèvement bancaire », « Carte bancaire » (aucun code brut comme `DIRECT_DEBIT`) ; la somme des montants = total affiché ; seuls les paiements « Réussi » sont comptés.
  - Les liens ouvrent Échéances et Paiements.
- **Gravité si échec** : Mineur

### GL-09-011 — File de travail : retards et déclarations à valider

- **Rôle** : ADMIN_A
- **Préconditions** : une déclaration de paiement en attente (`GL-06-045`) ; des échéances en retard.
- **Données** : carte « File de travail ».
- **Étapes** :
  1. Lire les tâches : « <bail> · <bien> » avec « N j de retard » et le reste dû ; « Déclaration à valider · <bail> ».
  2. Cliquer une tâche de retard, puis une déclaration ; cliquer « Tout voir ».
- **Attendu** :
  - Tâche de retard → détail de l'échéance (`/rental/installments/<id>`) ; déclaration → `/rental/payments?onglet=declarations` (onglet ouvert d'office) ; « Tout voir » → liste des échéances.
  - La file est limitée aux plus anciennes tâches (les retards de l'historique peuvent masquer ceux de la recette : filtrer la liste d'échéances pour les retrouver).
  - Les échéances « Partiel » échues n'y figurent pas (cf. GL-09-004).
- **Gravité si échec** : Mineur

### GL-09-012 — Tableau de bord avec droits restreints

- **Rôle** : LECTEUR_A
- **Préconditions** : LECTEUR_A sans droits sur les échéances ou paiements (selon le rôle).
- **Données** : tableau de bord.
- **Étapes** :
  1. Se connecter en LECTEUR_A, ouvrir `/dashboard`.
- **Attendu** :
  - Les tuiles auxquelles le rôle n'a pas droit affichent « — » avec « Module non accessible » (jamais 0) ; les graphiques correspondants sont absents ; aucune erreur 403 bloquante, aucune donnée hors droits.
  - Une agence sans la fonction Gestion locative ne montre ni tuiles locatives ni graphiques de trésorerie.
- **Gravité si échec** : Majeur

### GL-09-013 — Isolation : le tableau de bord de B ne reprend rien de A

- **Rôle** : ADMIN_B
- **Préconditions** : relevé des tuiles de A (I0, E0).
- **Données** : tableau de bord de B.
- **Étapes** :
  1. ADMIN_B : relever les tuiles, légendes et file de travail ; chercher « REC-GL ».
  2. Rejouer `GET /api/tenants/<tenantA>/dashboard` depuis la session de B.
- **Attendu** :
  - Les montants de B sont indépendants de ceux de A ; aucune tâche ni activité « REC-GL » dans B ; l'appel vers l'agence A est refusé (403/404).
- **Gravité si échec** : Bloquant

### GL-09-014 — Tableau de bord sur mobile

- **Rôle** : ADMIN_A
- **Préconditions** : largeur 375 px.
- **Données** : tableau de bord.
- **Étapes** :
  1. Ouvrir `/dashboard` en 375 px.
- **Attendu** :
  - Tuiles sur deux colonnes ; la file de travail passe avant les graphiques ; les graphiques sont des onglets (Finances, Parc, Commercial, Exploitation) ; pas de défilement horizontal ; montants abrégés lisibles.
- **Gravité si échec** : Mineur

---

## B. Balance clients, balance âgée, relevé

### GL-09-015 — Balance clients : ligne du locataire de RPT-1

- **Rôle** : ADMIN_A
- **Préconditions** : RPT-1 : échéances générées et « Recalculer les statuts et pénalités » lancé (juillet à octobre enregistrées) ; aucun paiement.
- **Données** : locataire « REC-GL Locataire Rapports ».
- **Étapes** :
  1. Plus › Finance › Clients et propriétaires › Facturation et balances › onglet **Balance clients**.
  2. Chercher la ligne du locataire (tri / recherche par nom ou filtre « Bien »).
- **Attendu** :
  - Colonnes : Locataire, Biens (« REC-GL Bien RPT-1 »), Facturé, Réglé, Solde, Actions (« Voir le relevé »).
  - **Facturé 640 000** (4 loyers échus), **Réglé 0**, **Solde 640 000** ; le loyer de novembre (échéance 05/11, non échue) n'est pas compté.
  - « Total de contrôle » = somme des soldes de la liste.
- **Gravité si échec** : Bloquant

### GL-09-016 — Balance âgée : répartition par ancienneté

- **Rôle** : ADMIN_A
- **Préconditions** : GL-09-015 (avant paiement sur RPT-1 ; sinon retrancher les paiements).
- **Données** : ligne du locataire Rapports.
- **Étapes** :
  1. Onglet **Balance âgée** : lire les colonnes À échoir, < 30 jours, 30 à 60 jours, 60 à 90 jours, > 90 jours, Solde.
- **Attendu** :
  - Juillet (121 j) et août (90 j) en **> 90 jours** : 320 000 ; septembre (59 j) en **30 à 60 jours** : 160 000 ; octobre (29 j) en **< 30 jours** : 160 000 ; 60 à 90 jours : 0 ; À échoir : 0 (novembre « Brouillon » n'est pas compté).
  - Solde = 640 000, sans mention d'écart. (La borne basse appartient à la tranche supérieure : 90 jours pile = « > 90 jours ».)
- **Gravité si échec** : Bloquant

### GL-09-017 — Balance âgée après la campagne : « À échoir » et « Écart avec la comptabilité »

- **Rôle** : ADMIN_A
- **Préconditions** : GL-09-016 ; campagne de novembre lancée (`GL-05-025`), RPT-1 active.
- **Données** : locataire Rapports.
- **Étapes** :
  1. Relire la ligne du locataire dans la Balance âgée et dans la Balance clients.
- **Attendu** :
  - Balance âgée : « À échoir » = **160 000** (novembre, émise, échéance 05/11) ; Solde affiché 800 000.
  - Balance clients : Solde 640 000 (le grand livre ne compte un loyer qu'à sa date d'échéance).
  - **Anomalie probable** : la balance âgée affiche alors « Écart avec la comptabilité : -160 000 » sous le solde pour une situation normale (un loyer émis mais non encore échu), ce qui alarme à tort. Attendu : aucun écart. Consigner le texte exact.
  - « Total de contrôle » de la balance âgée = somme des soldes affichés.
- **Gravité si échec** : Majeur

### GL-09-018 — Balance âgée : tri des tranches, période, bien, F5

- **Rôle** : ADMIN_A
- **Préconditions** : plusieurs locataires avec impayés.
- **Données** : tri sur « > 90 jours », filtre « Bien » = REC-GL Bien RPT-1, période.
- **Étapes** :
  1. Cliquer l'en-tête d'une tranche pour trier (croissant puis décroissant).
  2. Filtre **Bien** = « REC-GL Bien RPT-1 » ; filtre **Période**.
  3. F5.
- **Attendu** :
  - Tri appliqué sur l'écran (les tranches sont triables), conservé dans l'adresse ; filtre Bien : une seule ligne (le locataire de RPT-1) ; la période borne le solde (« Période filtrée : le solde est celui à la fin de la période. »).
  - Aucune erreur 4xx/5xx ; « Effacer les filtres » rétablit la liste.
- **Gravité si échec** : Mineur

### GL-09-019 — Cohérence : échéance « En retard » à l'écran mais absente de la balance

- **Rôle** : ADMIN_A
- **Préconditions** : un bail neuf REC-GL-RPT-3 (200 000, début 01/07/2026) dont les échéances viennent d'être générées, **sans** « Recalculer » ni calcul de pénalités ; locataire « Rapports 3 » neuf.
- **Données** : RPT-3.
- **Étapes** :
  1. Liste des échéances de RPT-3 : statuts (juillet à octobre « En retard »).
  2. Tableau de bord : tuile Impayés (le nombre inclut-il RPT-3 ?).
  3. Balance âgée / Balance clients : ligne du locataire « Rapports 3 ».
  4. « Recalculer les statuts et pénalités » sur RPT-3, relire les trois écrans.
- **Attendu** :
  - Avant le recalcul : la liste et le tableau de bord comptent 4 impayés pour RPT-3 ; la balance clients et la balance âgée **ne montrent pas** le locataire (aucun mouvement au compte, échéances encore « Brouillon » en base).
  - Après le recalcul : les 4 loyers apparaissent (solde 800 000) en tranches > 90 / > 90 / 30-60 / < 30.
  - Consigner l'incohérence entre écrans tant que la bascule de 02:00 n'a pas eu lieu (voir `GL-05-046`).
- **Gravité si échec** : Majeur

### GL-09-020 — Relevé d'un locataire : lignes, soldes, période, impression

- **Rôle** : ADMIN_A
- **Préconditions** : un locataire avec loyer, règlement, avance et annulation (le locataire « Paiements », parcours `GL-06-…`).
- **Données** : relevé du locataire « REC-GL Locataire Paiements » (ou Rapports).
- **Étapes** :
  1. Balance clients › **Voir le relevé** : lire l'en-tête et les lignes.
  2. Filtre **Période** (Période du relevé) sur le dernier mois.
  3. Cliquer **Imprimer**.
- **Attendu** :
  - Fil d'Ariane Finance › Clients › Relevé ; « Solde d'ouverture : X · Solde de clôture : Y » ; colonnes Date, Nature (Loyer, Règlement, Avance reçue, Avance imputée, Pénalité, Remise, Ajustement, Annulation), Libellé (ex. « Loyer de juillet 2026 »), Facturé, Réglé, Solde après.
  - Les soldes se chaînent ligne à ligne ; le solde de clôture = solde de la Balance clients.
  - **Imprimer** ouvre le PDF du relevé dans un nouvel onglet (signé, téléchargeable), avec les mêmes lignes ; message d'erreur propre si l'ouverture échoue.
- **Gravité si échec** : Majeur

### GL-09-021 — Export de la balance clients et de la balance âgée

- **Rôle** : ADMIN_A
- **Préconditions** : GL-09-016.
- **Données** : bouton **Exporter** de l'en-tête (CSV) et menu **Exporter** du tableau (Excel, CSV, PDF).
- **Étapes** :
  1. Balance âgée : cliquer le bouton **Exporter** du haut de page, ouvrir le CSV.
  2. Cliquer le menu **Exporter** du tableau › Excel, CSV puis PDF.
  3. Même opération sur la Balance clients.
- **Attendu** :
  - Deux commandes d'export coexistent ; le CSV de l'en-tête contient Locataire, Biens, Facturé, Réglé, Solde, Écart comptable et les cinq tranches ; ceux du tableau reprennent les colonnes du tableau.
  - Les valeurs du fichier = celles de l'écran ; fichier `balance-agee…` / `Balance âgée-AAAA-MM-JJ.xlsx` ; accents corrects, séparateurs lisibles à l'ouverture (CSV avec BOM).
  - Consigner la duplication des deux exports (Cosmétique).
- **Gravité si échec** : Mineur

### GL-09-022 — Droits et isolation des balances

- **Rôle** : LECTEUR_A puis ADMIN_B
- **Préconditions** : balances alimentées.
- **Données** : identifiants `<accountId>` du locataire Rapports.
- **Étapes** :
  1. LECTEUR_A : ouvrir Balance clients, Balance âgée, un relevé.
  2. ADMIN_B : ouvrir `/tenant/<tenantB>/finance/comptes/<accountId de A>` puis les balances.
- **Attendu** :
  - LECTEUR_A : lecture selon ses droits financiers, sinon accès refusé proprement (écran « accès refusé », pas de page blanche).
  - ADMIN_B : « Aucun compte sélectionné » ou 404 ; ses balances ne contiennent aucun locataire de A.
- **Gravité si échec** : Bloquant

---

## C. Caisse d'agence

La caisse compte les **paiements en espèces** saisis par le caissier **pendant la session**, au compte de caisse de la session, moins ses reversements en espèces et pièces de caisse. Le calcul se fait à la **date de saisie** (pas à la date du règlement) et seuls les paiements « Réussi » comptent. Les cas jouent avec ADMIN_A comme caissier et AGENT_A (gestionnaire) comme valideur ; si AGENT_A n'a pas le droit de valider (« Vous n'avez pas le droit de valider une caisse. »), le noter et demander au superviseur d'accorder ce droit.

### GL-09-023 — Ouvrir ma caisse : validations

- **Rôle** : ADMIN_A
- **Préconditions** : aucune caisse ouverte pour ADMIN_A ; une caisse (nature « Caisse ») existe en trésorerie.
- **Données** : fond de caisse vide, −1, 50000 ; note « Session de recette ».
- **Étapes** :
  1. Finance › Caisse et trésorerie › **Caisse** › onglet **Ma caisse** › **Ouvrir ma caisse**.
  2. Laisser « Fond de caisse (FCFA) » vide › **Ouvrir la caisse**.
  3. Saisir 50000, choisir « Caisse » (compte), Note › Ouvrir la caisse.
- **Attendu** :
  - Fond vide ou négatif : « Indiquez le fond de caisse. » ; avec 50 000 : « Caisse ouverte. » ; l'écran passe à « Caisse <numéro> » avec « Ouverte le <date> », tuiles **Fond de caisse 50 000**, **Encaissements 0**, **Décaissements 0**, « Montant attendu 50 000 », « Aucune opération pour le moment. », boutons « Actualiser » et « Clôturer la caisse ».
  - Réseau : `POST …/cash-sessions` → 201.
- **Gravité si échec** : Majeur

### GL-09-024 — Une seule caisse ouverte par caissier

- **Rôle** : ADMIN_A
- **Préconditions** : GL-09-023.
- **Données** : ouverture d'une seconde session.
- **Étapes** :
  1. Rouvrir la page Caisse dans un second onglet ; chercher « Ouvrir ma caisse ».
  2. (Contrôle API) rejouer `POST …/cash-sessions`.
- **Attendu** :
  - L'écran montre la caisse déjà ouverte (pas de formulaire d'ouverture) ; l'API répond 409 « Vous avez déjà une caisse ouverte. »
- **Gravité si échec** : Majeur

### GL-09-025 — Encaisser un loyer en espèces : la caisse l'enregistre

- **Rôle** : ADMIN_A
- **Préconditions** : GL-09-023 (fond 50 000) ; bail CAI-1 (échéances de 100 000 en retard).
- **Données** : paiement espèces 100 000 (échéance de juillet de CAI-1) puis 40 000 (partiel sur août).
- **Étapes** :
  1. Encaisser › Échéances › CAI-1 `07/2026` › **Encaisser** › Confirmer ; puis `08/2026` › **Paiement…** › Espèces 40000.
  2. Retourner sur Caisse › **Actualiser**.
- **Attendu** :
  - Encaissements = **140 000** ; Montant attendu = 50 000 + 140 000 = **190 000** ; tableau « Opérations de la caisse » : deux lignes de type « Loyer encaissé » (libellé « Loyer — REC-GL-CAI-1 »), montants 100 000 et 40 000, date et heure.
  - Décaissements 0.
- **Gravité si échec** : Bloquant

### GL-09-026 — Seuls les paiements en espèces du caissier comptent

- **Rôle** : ADMIN_A puis AGENT_A
- **Préconditions** : GL-09-025.
- **Données** : virement de 30 000 par ADMIN_A ; espèces de 20 000 par AGENT_A sur CAI-1 ; espèces de 10 000 par ADMIN_A sur un compte de caisse différent (si 2ᵉ caisse).
- **Étapes** :
  1. ADMIN_A : enregistrer un virement de 30 000 sur CAI-1 (échéance de septembre).
  2. AGENT_A : enregistrer un paiement en espèces de 20 000 (échéance d'octobre).
  3. ADMIN_A : Caisse › Actualiser.
- **Attendu** :
  - Montant attendu inchangé (**190 000**) : le virement (autre mode) et le paiement de l'autre utilisateur n'entrent pas dans ma caisse.
  - Annuler ensuite ces deux paiements de test pour garder la suite.
- **Gravité si échec** : Majeur

### GL-09-027 — Paiement annulé : il sort de la caisse ouverte

- **Rôle** : ADMIN_A
- **Préconditions** : GL-09-025.
- **Données** : paiement de 40 000.
- **Étapes** :
  1. Encaisser › Paiements › paiement de 40 000 › statut « Annulé » › Confirmer.
  2. Caisse › Actualiser.
- **Attendu** :
  - Encaissements = 100 000 ; Montant attendu = **150 000** ; la ligne de 40 000 a disparu.
- **Gravité si échec** : Majeur

### GL-09-028 — Paiement antidaté : compté à la date de saisie

- **Rôle** : ADMIN_A
- **Préconditions** : session ouverte.
- **Données** : paiement espèces 10 000, Date du règlement 20/10/2026.
- **Étapes** :
  1. Enregistrer le paiement sur CAI-1.
  2. Caisse › Actualiser.
- **Attendu** :
  - Le paiement apparaît dans la caisse du jour (compté à la saisie) alors que le tableau de bord le range en octobre (voir GL-09-007) ; consigner la différence de date entre les deux écrans.
  - Annuler ce paiement ensuite.
- **Gravité si échec** : Mineur

### GL-09-029 — Clôturer sans écart (saisie du total)

- **Rôle** : ADMIN_A
- **Préconditions** : session avec Montant attendu 150 000 (GL-09-027).
- **Données** : total compté 150 000, sans billetage.
- **Étapes** :
  1. **Clôturer la caisse** : cocher/choisir « Saisir le total sans billetage » ; « Montant compté » 150000.
  2. Lire le récapitulatif : Total compté, Attendu, Écart ; **Clôturer**.
- **Attendu** :
  - « Aucun écart » ; pas de motif demandé ; message « Caisse <numéro> clôturée. » ; la session passe au statut « À valider » ; l'onglet Ma caisse repropose « Ouvrir ma caisse ».
  - Réseau : `POST …/cash-sessions/<id>/close` → 200.
- **Gravité si échec** : Bloquant

### GL-09-030 — Clôturer avec écart : motif obligatoire, billetage

- **Rôle** : ADMIN_A
- **Préconditions** : nouvelle session (fond 20 000) avec un encaissement espèces de 80 000 (« Paiement… » partiel sur l'échéance `09/2026` de CAI-1) → attendu 100 000.
- **Données** : billetage = 95 000 (manquant 5 000) ; motif « Erreur de rendu » ; essai motif « ab ».
- **Étapes** :
  1. Clôturer la caisse sans cocher « sans billetage » : renseigner le nombre de billets/pièces par valeur pour totaliser 95 000.
  2. Lire « Manquant : 5 000 » ; essayer de clôturer sans motif, avec « ab », puis « Erreur de rendu ».
  3. Refaire une session avec un excédent (comptage 105 000).
- **Attendu** :
  - Le total du billetage se calcule en direct ; écart « Manquant : 5 000 » (ou « Excédent : 5 000 ») ; le bouton « Clôturer » reste inactif tant que le motif a moins de 3 caractères (« Expliquez cet écart ») ; avec le motif la clôture passe.
  - Le détail de la session conserve le billetage (tableau « Billetage » : Valeur, Nombre, Sous-total).
- **Gravité si échec** : Majeur

### GL-09-031 — Valider une clôture : un autre responsable

- **Rôle** : ADMIN_A puis AGENT_A
- **Préconditions** : session « À valider » (GL-09-029) tenue par ADMIN_A.
- **Données** : commentaire « Contrôlé ».
- **Étapes** :
  1. ADMIN_A : Historique › **Voir le détail** de sa session : chercher le bouton de validation.
  2. AGENT_A : Caisse › Historique › **Voir le détail** › commentaire › **Valider**.
- **Attendu** :
  - ADMIN_A voit « Vous avez tenu cette caisse : un autre responsable doit la valider. » (pas de bouton) ; un rôle sans le droit voit « La validation d'une caisse est réservée aux responsables habilités. ».
  - AGENT_A : « Caisse <numéro> validée. » ; statut « Validée » ; « Validée par … le … » ; commentaire affiché ; pour un écart, l'écriture comptable de régularisation est passée (comptes d'écart de caisse, `GL-09-040`).
- **Gravité si échec** : Majeur

### GL-09-032 — Paiement saisi après la clôture : hors session

- **Rôle** : ADMIN_A
- **Préconditions** : GL-09-029 (session clôturée).
- **Données** : paiement espèces de 5 000.
- **Étapes** :
  1. Enregistrer un paiement espèces de 5 000 sur CAI-1.
  2. Ouvrir le détail de la session clôturée.
- **Attendu** :
  - Le montant attendu de la session clôturée ne change pas (valeurs figées à la clôture) ; le paiement entrera dans la prochaine session.
  - Annuler le paiement ensuite.
- **Gravité si échec** : Majeur

### GL-09-033 — Historique des caisses : filtre, détail, export

- **Rôle** : ADMIN_A
- **Préconditions** : au moins deux sessions (validée, à valider).
- **Données** : onglet **Historique**.
- **Étapes** :
  1. Onglet **Historique** : lire le tableau ; filtre Statut (Ouverte, À valider, Validée).
  2. **Voir le détail** d'une session.
  3. **Exporter** l'historique et les opérations d'une session.
- **Attendu** :
  - Colonnes Numéro, Caisse, Caissier, Ouverture, Clôture, Attendu, Compté, Écart, Statut, Actions ; filtres cohérents ; détail : Caissier, Caisse, Ouverture, Clôture, Fond, Attendu, Compté, Écart, Motif, Opérations ; exports « Historique des caisses », « Opérations de la caisse » conformes à l'écran.
  - « Aucune session de caisse. » si rien.
- **Gravité si échec** : Mineur

### GL-09-034 — Droits et isolation de la caisse

- **Rôle** : LECTEUR_A puis ADMIN_B
- **Préconditions** : sessions existantes dans A.
- **Données** : `<sessionId>` d'une session de A.
- **Étapes** :
  1. LECTEUR_A : ouvrir Caisse ; tenter d'ouvrir une caisse, de clôturer, de valider.
  2. ADMIN_B : ouvrir la page Caisse ; rejouer `GET …/cash-sessions/<sessionId de A>` avec `<tenantB>`.
- **Attendu** :
  - LECTEUR_A : écriture refusée avec le message « Vous n'avez pas le droit … » (pas de page blanche) ; lecture de l'historique selon ses droits.
  - ADMIN_B : sa caisse est indépendante ; la session de A répond 404.
- **Gravité si échec** : Bloquant

---

## D. Écritures comptables des encaissements

Les baux **en gestion directe** (bien détenu en propre, pas de propriétaire mandant) écrivent le loyer au journal (débit 411 / crédit 7083 ; pénalité 7088 ; encaissement : débit trésorerie réelle / crédit 411 ; dépôt de garantie 165). Les baux **à propriétaire mandant** alimentent le compte du mandant (4731, voir `GL-10-…`). Chemin : Plus › Finance › Caisse et comptabilité › **Comptabilité**.

### GL-09-035 — Journal : écriture de l'encaissement d'un loyer (gestion directe)

- **Rôle** : ADMIN_A
- **Préconditions** : RPT-1 en gestion directe ; encaisser l'échéance de juillet (160 000) en espèces à l'instant.
- **Données** : Période = « Mois en cours ».
- **Étapes** :
  1. Comptabilité › onglet **Journal** › période « Mois en cours » (boutons « Mois en cours », « Mois précédent », « Année en cours ») ; filtre « Journal » = « Tous les journaux ».
  2. Chercher l'écriture dont le libellé contient « Loyer encaissé — règlement » (référence `ENC-…`).
- **Attendu** :
  - Écriture à la date du règlement, référence `ENC-<8 caractères>`, libellé « Loyer encaissé — règlement <8 caractères> » : **débit** du compte de trésorerie (caisse) **160 000**, **crédit** du compte **411 Clients** 160 000 avec le tiers « REC-GL Locataire Rapports » ; Total débit = Total crédit.
  - Le compte de trésorerie débité est celui du moyen de paiement (caisse pour espèces) ; avec un virement, la banque.
- **Gravité si échec** : Bloquant

### GL-09-036 — Journal : facturation du loyer et de la pénalité

- **Rôle** : ADMIN_A
- **Préconditions** : RPT-1 : échéances de juillet à octobre enregistrées (recalcul fait) ; un bail à pénalités (PEN-A, `GL-07-003`).
- **Données** : période « Année en cours ».
- **Étapes** :
  1. Journal › chercher les écritures `LOC-…` « Loyer de juillet 2026 » (RPT-1) et « Pénalité de retard sur l'échéance de juillet 2026 » (PEN-A).
- **Attendu** :
  - Loyer : **débit 411** 160 000 (tiers = locataire) / **crédit 7083 « Loyers et charges locatives »** 160 000, daté de l'échéance (05/07/2026) ; pénalité : débit 411 3 200 / crédit **7088 « Pénalités de retard sur loyers »**.
  - Une remise de pénalité ou la suppression d'une pénalité produit l'écriture inverse (voir GL-09-037).
  - Les mois sont écrits sans accent (« fevrier », « aout », « decembre ») dans les libellés : consigner (Cosmétique) s'ils apparaissent ainsi à l'écran.
- **Gravité si échec** : Majeur

### GL-09-037 — Annulation d'un paiement : contre-passation, jamais de suppression

- **Rôle** : ADMIN_A
- **Préconditions** : GL-09-035.
- **Données** : paiement de 160 000 de RPT-1.
- **Étapes** :
  1. Annuler le paiement (statut « Annulé » › Confirmer).
  2. Journal : relire la période.
- **Attendu** :
  - L'écriture d'origine `ENC-…` reste, marquée **Contre-passée** ; une écriture `ANN-ENC-…` inverse (crédit trésorerie / débit 411) la neutralise ; le solde du compte 411 revient au niveau d'avant ; Total débit = Total crédit.
  - Remettre le paiement en « Réussi » ne ré-écrit l'encaissement qu'à travers la nouvelle génération (`ENC-…` suffixée) ; consigner l'écriture obtenue.
- **Gravité si échec** : Bloquant

### GL-09-038 — Grand livre du compte 411 et balance générale

- **Rôle** : ADMIN_A
- **Préconditions** : écritures des cas 035 à 037.
- **Données** : compte 411 ; période « Année en cours ».
- **Étapes** :
  1. Onglet **Grand livre** › champ « Compte » = 411 : lire les lignes (Date, Journal, Référence, Libellé, Tiers, Nature, Débit, Crédit, Solde) et le « Solde de clôture ».
  2. Onglet **Balance générale** : ligne 411 (mouvements de la période, solde de clôture) et ligne 7083.
- **Attendu** :
  - Le grand livre 411 contient les lignes du locataire Rapports (loyers au débit, encaissements au crédit) ; le « Solde de clôture » du 411 pour ce tiers = son solde en Balance clients (640 000 avant paiement).
  - Balance générale : Total débit = Total crédit ; le compte 7083 est créditeur du total des loyers facturés de la période.
  - « Aucun compte mouvementé sur cette période. » si la période est vide.
- **Gravité si échec** : Bloquant

### GL-09-039 — Dépôt de garantie : compte 165, pas de loyer

- **Rôle** : ADMIN_A
- **Préconditions** : `GL-06-041` passé jusqu'à la collecte (bail REC-GL-PAY-1, gestion directe, dépôt de garantie 300 000) ; paiement P13 en « Réussi » et collecté.
- **Données** : paiement virement P13 de 300 000 collecté au dépôt.
- **Étapes** :
  1. Journal : chercher « Dépôt de garantie encaissé — règlement … ».
- **Attendu** :
  - Débit trésorerie 300 000 / crédit **165 « Dépôts et cautionnements reçus »** (jamais 411 ni avance) ; une retenue définitive crédite 758 ; un remboursement débite 165 / crédite la trésorerie.
- **Gravité si échec** : Majeur

### GL-09-040 — Écart de caisse : écriture de régularisation

- **Rôle** : AGENT_A
- **Préconditions** : session avec écart (GL-09-030) validée.
- **Données** : écart manquant de 5 000.
- **Étapes** :
  1. Journal (période du jour) : chercher l'écriture de régularisation de la caisse (compte d'écart).
- **Attendu** :
  - Manquant : débit **6588** (écart négatif de caisse) / crédit caisse ; excédent : débit caisse / crédit **7588** ; montants = écart de la session ; libellé citant le numéro de caisse.
  - (Comptes configurés dans Paramètres financiers : numéros par défaut 6588 et 7588.)
- **Gravité si échec** : Majeur

### GL-09-041 — Bail à propriétaire mandant : grand livre auxiliaire des mandants

- **Rôle** : ADMIN_A
- **Préconditions** : REC-GL-OWN : loyer de 160 000 encaissé et affecté (`GL-06-058`).
- **Données** : date du jour.
- **Étapes** :
  1. Comptabilité › onglet **Mandants** : lire « Grand livre auxiliaire des mandants » (colonnes Mandant, Compte courant, Dépôt de garantie, À affecter, Total) et la « Balance auxiliaire des mandants » à la date du jour.
  2. Ouvrir le mouvement de la nature « Loyer encaissé » du propriétaire.
- **Attendu** :
  - Le mandant PROPRIETAIRE_PORTAIL a un compte courant augmenté du loyer encaissé net d'honoraires et de TVA (exemple 142 300 pour 10 % + TVA 18 % sur 150 000) ; « Écart : 0 » (aucun écart entre auxiliaire et compte 4731).
  - Un paiement non affecté apparaît sous « À affecter » et non dans le compte courant.
  - Détail dans `GL-10-…`.
- **Gravité si échec** : Majeur

### GL-09-042 — Exports comptables (Excel, CSV) et période

- **Rôle** : ADMIN_A
- **Préconditions** : écritures sur la période.
- **Données** : onglets Journal, Grand livre, Balance générale, Mandants.
- **Étapes** :
  1. Pour chaque onglet : **Exporter en Excel**, puis **Exporter en CSV**.
  2. Changer la période (Mois précédent) et exporter de nouveau.
  3. Exporter avec une période sans écriture.
- **Attendu** :
  - Téléchargement des fichiers avec un nom parlant ; contenu = écran (mêmes écritures, mêmes totaux) ; pas de message « Le téléchargement a échoué. ».
  - Période vide : fichier vide ou message explicite (pas d'erreur 500).
  - Journal : le filtre « Journal » choisi est respecté dans l'export.
- **Gravité si échec** : Majeur

---

## E. Exports (Excel, CSV, PDF) et impression des listes locatives

Les listes ont un bouton **Exporter** (menu Excel (.xlsx), CSV, PDF). Le fichier se nomme `<Titre>-AAAA-MM-JJ.<extension>` ; il reprend les colonnes du tableau (hors « Actions »), les filtres appliqués, et **toutes les pages** pour les listes paginées par le serveur (Échéances, Paiements, Déclarations) ; au-delà de 10 000 lignes l'export est tronqué avec un avertissement. Le PDF n'est proposé que pour au plus 12 colonnes ; en arabe il passe par la fenêtre d'impression du navigateur.

### GL-09-043 — Exporter les Échéances : filtres et toutes les pages

- **Rôle** : ADMIN_A
- **Préconditions** : plus de 50 échéances dans l'agence ; filtre Locataire = « REC-GL Locataire Échéances » appliqué en cas B.
- **Données** : liste complète puis liste filtrée.
- **Étapes** :
  1. Encaisser › Échéances (sans filtre) › **Exporter** › CSV ; compter les lignes ; comparer au sous-titre « N échéances ».
  2. Appliquer le filtre Locataire › Exporter › Excel ; ouvrir.
  3. Exporter en PDF.
- **Attendu** :
  - Fichier `Échéances-AAAA-MM-JJ.csv` : N lignes (toutes les pages, pas seulement les 50 affichées) ; message « Export terminé (N lignes). » ; colonnes Bail, Locataire, Période, Échéance, Montant dû, Reste à payer, Statut ; montants **numériques** (colonne Montant dû sans symbole, comparable à l'écran), statut en français (« En retard »).
  - Filtré : uniquement les 12 échéances du locataire filtré.
  - PDF : tableau paginé, en-tête avec le titre et la date « généré le … ».
  - Liste vide : le bouton est désactivé ; filtre sans résultat : message « Aucune donnée à exporter ».
- **Gravité si échec** : Majeur

### GL-09-044 — Exporter les Paiements, les Déclarations, les Baux

- **Rôle** : ADMIN_A
- **Préconditions** : paiements de plusieurs modes (`GL-06-…`) ; des déclarations ; des baux.
- **Données** : listes Paiements, Déclarations en attente, Baux.
- **Étapes** :
  1. Paiements › Exporter (CSV, Excel, PDF) avec et sans filtre Statut = « Annulé ».
  2. Déclarations en attente › Exporter avec le filtre « Approuvées ».
  3. Baux › Exporter.
- **Attendu** :
  - Paiements : colonnes Bail, Locataire, Date, Montant, Reste à affecter, Méthode (libellés français), Statut, En ligne ; montants = écran ; « Reste à affecter » 0 pour un paiement annulé.
  - Déclarations : Date de déclaration, Date de paiement, Bail, Locataire, Échéance, Montant, Méthode, Référence, Statut ; le même filtre que l'écran.
  - Baux : `Baux-AAAA-MM-JJ…` avec Bail, Locataire, Période, Montant, Statut.
- **Gravité si échec** : Majeur

### GL-09-045 — Exporter les Pénalités, le Dépôt de garantie et les Documents

- **Rôle** : ADMIN_A
- **Préconditions** : pénalités (`GL-07-…`), mouvements de dépôt (`GL-03-…`), documents (`GL-04-…`).
- **Données** : onglets du détail d'un bail.
- **Étapes** :
  1. Pénalités › Exporter ; Dépôt de garantie › Historique des mouvements › Exporter ; Documents › Exporter.
- **Attendu** :
  - Pénalités : `Pénalités de retard-…` ; colonnes Calculée le, Retard, Montant calculé, Montant retenu ; valeurs de l'écran.
  - Dépôt : `Historique des mouvements-…` avec Date, Type (Collecte, Libération, …), Montant, Note.
  - Documents : `Documents de location-…` avec Document (numéro), Type (« Reçu de loyer »…), Émis le, Statut.
  - Chaque export reprend exactement les lignes affichées.
- **Gravité si échec** : Majeur

### GL-09-046 — Contenu d'un export : formules, caractères spéciaux, arabe

- **Rôle** : ADMIN_A
- **Préconditions** : un bien nommé « REC-GL =1+1 » et un locataire « REC-GL Ĺ'été & <b>x</b> » (créés en `GL-01-…`) sur un bail avec échéances ; interface en français puis en arabe.
- **Données** : exports CSV et Excel de Baux et Échéances.
- **Étapes** :
  1. Exporter la liste des échéances de ce bail en CSV et en Excel ; ouvrir dans un tableur.
  2. Passer la langue en arabe, exporter en PDF.
- **Attendu** :
  - Aucune cellule ne s'exécute comme formule (la valeur commençant par `=` est neutralisée, ex. préfixée d'une apostrophe) ; `<b>` reste du texte ; accents corrects ; séparateurs et BOM permettant l'ouverture directe.
  - En arabe le PDF passe par la fenêtre d'impression (« Choisissez « Enregistrer en PDF » dans la fenêtre d'impression. ») avec mise en page de droite à gauche.
- **Gravité si échec** : Majeur

### GL-09-047 — Export tronqué à 10 000 lignes et erreur réseau

- **Rôle** : ADMIN_A
- **Préconditions** : (facultatif) une liste de plus de 10 000 lignes — non disponible dans le jeu de base ; sinon simuler une coupure réseau.
- **Données** : coupure réseau au milieu d'un export.
- **Étapes** :
  1. Lancer l'export des Échéances, couper le réseau (outil de développement) avant la fin.
  2. Rétablir et relancer.
- **Attendu** :
  - Message « L'export a échoué. » sans fichier partiel corrompu ; le bouton revient à l'état normal ; l'export suivant fonctionne.
  - (Plus de 10 000 lignes : « L'export est limité à 10000 lignes : affinez les filtres pour obtenir le reste. » — non testable avec le jeu de base.)
- **Gravité si échec** : Mineur

### GL-09-048 — Impression : relevé PDF et impression navigateur

- **Rôle** : ADMIN_A
- **Préconditions** : relevé d'un locataire (GL-09-020).
- **Données** : bouton **Imprimer** du relevé ; Ctrl+P sur une liste.
- **Étapes** :
  1. Relevé › **Imprimer** : ouvrir le PDF dans le nouvel onglet.
  2. Sur la liste des Échéances, Ctrl+P (aperçu d'impression du navigateur).
- **Attendu** :
  - PDF du relevé lisible (en-tête agence, locataire, période, lignes, soldes), sans l'IBAN ni donnée d'une autre agence ; l'ouverture est refusée à une session non connectée (URL signée ou authentifiée).
  - L'aperçu d'impression d'une liste n'a pas de menu coupant le tableau de façon illisible (Cosmétique).
- **Gravité si échec** : Mineur

---

## F. Couverture

| Sous-fonctionnalité du classeur / de la mission                                      | Cas                                                                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Tableau de bord / accueil locatif (impayés, 7 jours, encaissé, graphiques, file)     | GL-09-001 à GL-09-014                                                               |
| Cohérence des indicateurs avec les données créées                                    | GL-09-002, 003, 004, 005, 006, 007, 008, 009, 010                                   |
| Taux de recouvrement                                                                 | GL-09-009 (indicateur absent : non testable en interface ; calcul par les légendes) |
| Balance clients                                                                      | GL-09-015, GL-09-020, GL-09-021, GL-09-022                                          |
| Balance âgée (tranches, écart, tri, cohérence)                                       | GL-09-016, 017, 018, 019, 021, 022                                                  |
| Relevé d'un locataire et impression                                                  | GL-09-020, GL-09-048                                                                |
| Caisse d'agence encaissant des loyers (ouverture, attendu, clôture, validation)      | GL-09-023 à GL-09-034                                                               |
| Écritures comptables des encaissements (Finance : journal, grand livre, balance)     | GL-09-035 à GL-09-042                                                               |
| Reversement / comptes propriétaires / relevés de gérance                             | `GL-10-…` (hors de ce fichier) ; GL-09-041 pour le grand livre des mandants         |
| Exports Excel / CSV / PDF des listes (Baux, Échéances, Paiements, Pénalités, Dépôts) | GL-09-043, 044, 045, 046, 047 ; GL-07-032                                           |
| Impression                                                                           | GL-09-048                                                                           |
| Droits (lecture seule) et isolation entre agences                                    | GL-09-012, 013, 022, 034                                                            |
| Mobile                                                                               | GL-09-014                                                                           |
