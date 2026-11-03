# 06 — Paiements, allocations, déclarations du portail

**Périmètre.** Menu **Encaisser › Paiements** et onglet **Paiements** du détail d'un bail : enregistrement manuel d'un règlement (espèces, virement, chèque, Mobile Money, carte, autre), date réelle du règlement distincte de la date de saisie, validations (montant, date, devise, bail, doublons), allocation à une ou plusieurs échéances (totale, partielle, trop-perçu, automatique ou manuelle), changement de statut et annulation d'un paiement alloué, rapprochement d'un paiement en ligne, déclarations de paiement venues du portail locataire (liste, preuve, approuver, rejeter), détail du paiement, reçu/quittance, effet sur le solde du locataire et sur le compte du propriétaire.

**Écrans et URL.**

| Écran                   | URL                                                      | Libellé de menu                                                                                            |
| ----------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Liste globale           | `/tenant/<tenantId>/rental/payments`                     | Encaisser › Paiements                                                                                      |
| Détail d'un paiement    | `/tenant/<tenantId>/rental/payments/<paymentId>`         | (bouton « Voir » de la liste)                                                                              |
| Onglet du bail          | `/tenant/<tenantId>/rental/leases/<leaseId>`             | Baux › (un bail) › onglet « Paiements »                                                                    |
| Déclarations en attente | `/tenant/<tenantId>/rental/payments?onglet=declarations` | onglet « Déclarations en attente » de la liste                                                             |
| Relevé du locataire     | `/tenant/<tenantId>/finance/comptes/<accountId>`         | Plus › Finance › Clients et propriétaires › Facturation et balances › Balance clients › « Voir le relevé » |
| Portail locataire       | `/tenant/payments`                                       | (portail locataire, bouton « Déclarer un paiement »)                                                       |

**Prérequis.** Cas à avoir passés : `GL-01-…` (réglages financiers, comptes de trésorerie : au moins une caisse, une banque, un compte Mobile Money, un compte « Chèques à encaisser »), `GL-02-…` (création d'un bail), `GL-05-003` (génération des échéances). Le paiement en ligne est en **simulateur** ; e-mails dans le puits SMTP ; WhatsApp neutralisé.

**Date de référence : 03/11/2026.** Les montants sont indépendants de la date, mais « échu » dépend d'elle : à une autre date, recalculer quelles échéances sont échues et adapter les cas qui parlent d'« échue ».

**Comportements structurants (lus dans le code, à confirmer à l'écran).**

- Un paiement saisi à la main est **toujours créé « Réussi »** ; il n'y a pas de statut « Brouillon ». La date saisie dans « Date du règlement » devient la date de succès du paiement (date où l'argent est arrivé) ; la **date de saisie** (« Date d'initiation ») reste la date du jour.
- Un règlement non affecté est porté au compte du locataire comme **avance reçue** ; l'affecter à une échéance ne change pas son solde (reprise de l'avance).
- Il n'existe **pas de désallocation à l'écran** : la seule façon de défaire une affectation est d'annuler le paiement.
- Les statuts « Remboursé » et « Partiellement remboursé » ne sont pas proposés à l'écran.

**Données créées par ce fichier.**

| Objet                     | Valeur                                                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Locataire                 | « REC-GL Locataire Paiements » (un seul bail, pour lire son solde)                                                                                                                                                                                                                               |
| Bail REC-GL-PAY-1         | bien « REC-GL Bien PAY-1 », 01/07/2026 → 30/06/2027, mensuel, jour 5, loyer 150 000, charges 10 000 (160 000), dépôt de garantie 300 000, **jours de grâce pour pénalités = 365** (pour qu'aucune pénalité ne s'ajoute pendant la recette), mode « Pourcentage du solde », taux 2 ; statut Actif |
| Échéances de REC-GL-PAY-1 | 12 échéances de 160 000 : E07 (05/07/2026), E08, E09, E10 échues ; E11 (05/11/2026), E12 … à venir                                                                                                                                                                                               |
| Bail REC-GL-DECL          | locataire du portail (LOCATAIRE_PORTAIL_2), bien « REC-GL Bien DECL-1 », 01/09/2026 → 31/08/2027, mensuel, jour 5, loyer 120 000, charges 0, grâce 365 ; échéances 09/2026 et 10/2026 échues, 11/2026 à venir                                                                                    |
| Bail REC-GL-OWN           | locataire « REC-GL Locataire Propriétaire », **propriétaire mandant** = propriétaire du portail (PROPRIETAIRE_PORTAIL), loyer 150 000, charges 10 000, 01/10/2026 → 30/09/2027, jour 5, grâce 365                                                                                                |

Parcours de référence sur REC-GL-PAY-1 (soldes du locataire « Paiements » **au 03/11/2026** ; **Solde = Facturé − Réglé**, négatif = avance en faveur du locataire). Un loyer n'entre dans le solde qu'à sa date d'échéance : les échéances E11 et suivantes, à venir, ne changent pas le solde du jour, même payées d'avance.

| Étape | Événement                                                | E07  | E08                   | E09                      | E10                   | Solde    |
| ----- | -------------------------------------------------------- | ---- | --------------------- | ------------------------ | --------------------- | -------- |
| S1    | P1 espèces 160 000 → E07                                 | Payé | impayée               | impayée                  | impayée               | 0        |
| S2    | P2 virement 100 000 (règlement 20/10) → E08              | Payé | Partiel, reste 60 000 | impayée                  | impayée               | 60 000   |
| S3    | P3 chèque 300 000 créé, non affecté                      | Payé | Partiel               | impayée                  | impayée               | −240 000 |
| S4    | P4 Mobile Money 50 000 créé, non affecté                 | Payé | Partiel               | impayée                  | impayée               | −290 000 |
| S5    | P3 affecté (auto) → E08 60 000, E09 160 000, E10 80 000  | Payé | Payé                  | Payé                     | Partiel, reste 80 000 | 30 000   |
| S6    | P4 : 30 000 affectés à E10 (manuel) ; 20 000 restent     | Payé | Payé                  | Payé                     | Partiel, reste 50 000 | 30 000   |
| S7    | P5 espèces 500 000 → E10 seule (50 000), 450 000 restent | Payé | Payé                  | Payé                     | Payé                  | −470 000 |
| S8    | P3 annulé                                                | Payé | Partiel, reste 60 000 | En retard, reste 160 000 | Partiel, reste 80 000 | −170 000 |
| S9    | P3 de nouveau « Réussi » (non affecté)                   | Payé | Partiel               | En retard                | Partiel               | −470 000 |

Les paiements de test créés **hors** de ce parcours (cas 009, 010, 011, 012, 013, 015, 018, 025, 029, 031, 033, 034, 037, 038, 041, 059) sont **annulés** (statut « Annulé ») à la fin de leur cas, pour que les soldes de la table restent exacts. Seuls les soldes de la table sont comparés ; la contre-passation d'un paiement annulé laisse des lignes « Annulation » au relevé, sans changer le solde. Le cas S7 n'a pas d'étape « complément sur la même échéance » (le cas 027 échoue ou réussit sans changer le solde).

---

## A. Préparation et écrans

### GL-06-001 — Créer REC-GL-PAY-1 et générer ses échéances

- **Rôle** : ADMIN_A
- **Préconditions** : locataire « REC-GL Locataire Paiements » et bien « REC-GL Bien PAY-1 » (cas `GL-01-…`, `GL-02-…`).
- **Données** : bail REC-GL-PAY-1 du tableau ci-dessus.
- **Étapes** :
  1. Baux › créer le bail (grâce 365, taux 2, dépôt 300 000) › le passer à « Actif ».
  2. Onglet Échéances › « Générer les échéances ».
- **Attendu** :
  - 12 échéances de 160 000 ; E07 à E10 « En retard », E11 à E06/2027 « Brouillon ».
  - Aucun paiement : onglet Paiements vide.
- **Gravité si échec** : Bloquant

### GL-06-002 — État vide des Paiements et des déclarations d'un bail

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-001 (aucun paiement sur le bail).
- **Données** : REC-GL-PAY-1.
- **Étapes** :
  1. Détail du bail › onglet **Paiements**.
  2. Cliquer l'onglet interne **Déclarations en attente**.
- **Attendu** :
  - Titre « Paiements », pas de sous-titre ; texte « Aucun paiement enregistré. » avec le bouton « Enregistrer un paiement » ; en-tête avec le bouton **Nouveau paiement**.
  - Onglet « Déclarations en attente » : « Aucune déclaration trouvée » ; liste déroulante de statut « Tous les statuts ».
  - L'URL passe à `?onglet=declarations` ; F5 reste sur cet onglet.
- **Gravité si échec** : Mineur

---

## B. Enregistrement manuel : chaque mode de paiement

### GL-06-003 — Encaissement rapide d'une échéance en espèces (S1)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-001.
- **Données** : E07 de REC-GL-PAY-1, 160 000, espèces.
- **Étapes** :
  1. Onglet Échéances du bail › ligne `07/2026` › **Encaisser** › **Confirmer l'encaissement**.
  2. Onglet **Paiements** : lire la ligne ; cliquer **Voir**.
  3. Ouvrir le détail de l'échéance E07 (« Voir » dans l'onglet Échéances).
- **Attendu** :
  - Message « Encaissement enregistré. » ; E07 « Payé », reste 0.
  - Liste Paiements : Date = aujourd'hui, Montant 160 000, Reste à affecter « Affecté », Méthode « Espèces », Statut « Réussi » ; sous-titre « 1 paiement ».
  - Détail du paiement : titre « Paiement #<8 caractères> » ; Locataire = REC-GL Locataire Paiements ; Montant 160 000 ; Montant alloué 160 000 ; Montant disponible 0 ; « Allocations aux échéances » : « Échéance 7/2026 – 05/07/2026 », « Montant alloué : 160 000 ».
  - Détail de l'échéance : Montant Payé 160 000, Reste à payer 0, Date de paiement renseignée.
  - Réseau : `POST …/rental/payments` 201 puis `POST …/payments/<id>/allocate` 200.
- **Gravité si échec** : Bloquant

### GL-06-004 — Paiement détaillé par virement avec date de règlement passée (S2)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-003 ; un compte de trésorerie de type Banque.
- **Données** : E08, virement bancaire 100 000, date du règlement 20/10/2026, compte banque, devise FCFA.
- **Étapes** :
  1. Onglet Échéances › ligne `08/2026` › **Paiement…**.
  2. Dans « Paiement · échéance 08/2026 du 05/08/2026 » : Méthode « Virement bancaire » ; « Compte de trésorerie » = la banque ; Montant (préremplit 160 000) → 100000 ; « Date du règlement » = 20/10/2026.
  3. **Enregistrer le paiement**.
- **Attendu** :
  - Message « Paiement enregistré. » ; E08 « Partiel » : Montant dû 160 000, Reste à payer **60 000**.
  - Paiement P2 : Méthode « Virement bancaire », Statut « Réussi », « Affecté ».
- **Gravité si échec** : Bloquant

### GL-06-005 — Date réelle du règlement ≠ date de saisie (liste, détail, relevé)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-004.
- **Données** : P2 (règlement 20/10/2026, saisi aujourd'hui).
- **Étapes** :
  1. Liste Paiements : lire la colonne « Date » de P2.
  2. Ouvrir le détail de P2 : carte « Dates ».
  3. Relevé du locataire (Balance clients › « Voir le relevé ») : lire la date de la ligne « Règlement (virement bancaire) affecté à l'échéance … ».
- **Attendu** :
  - Le détail montre « Date d'initiation » = aujourd'hui (03/11/2026) et « **Date de succès** » = **20/10/2026**.
  - Le relevé date le règlement du **20/10/2026** (date réelle).
  - **Anomalie probable** : la colonne « Date » de la liste affiche la date de **saisie** (03/11/2026), pas la date du règlement ; un règlement du 20/10 saisi le 03/11 apparaît donc à la mauvaise date dans la liste. Consigner (Mineur) et la différence avec le détail.
- **Gravité si échec** : Mineur

### GL-06-006 — Chèque non affecté depuis l'onglet Paiements (S3)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-004 ; compte « Chèques à encaisser » (ou banque).
- **Données** : chèque 300 000, date du règlement 01/11/2026, référence PSP « CHQ-0001 » (le formulaire n'a pas de champ « numéro de chèque » : la référence se saisit dans « Référence PSP (optionnel) »).
- **Étapes** :
  1. Onglet **Paiements** du bail › **Nouveau paiement**.
  2. Méthode « Chèque », Compte de trésorerie « Chèques à encaisser », Montant 300000, Date du règlement 01/11/2026, Référence PSP « CHQ-0001 » › **Enregistrer le paiement**.
- **Attendu** :
  - Message « Paiement enregistré. » ; ligne P3 : Montant 300 000, **Reste à affecter 300 000**, Méthode « Chèque », « Réussi », bouton **Affecter**.
  - Les échéances ne changent pas (E08 reste Partiel, E09 et E10 non payées).
  - Solde du locataire = −240 000 (avance 300 000 − 60 000 dû sur E08, voir le tableau S3).
  - Le formulaire est prérempli : Méthode « Espèces », Devise FCFA, Date du règlement = aujourd'hui.
- **Gravité si échec** : Bloquant

### GL-06-007 — Mobile Money avec opérateur, téléphone et ID de transaction (S5)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-006 ; compte Mobile Money.
- **Données** : Mobile Money 50 000, opérateur « Orange Money », téléphone « +225 07 00 00 00 00 », ID Transaction PSP « OM-REC-0001 », Référence PSP « REF-OM-1 », date = aujourd'hui.
- **Étapes** :
  1. Onglet Paiements › Nouveau paiement › Méthode « Mobile Money » : les champs **Opérateur** et **Numéro de téléphone** apparaissent.
  2. Remplir comme ci-dessus › Enregistrer le paiement.
  3. Ouvrir le détail du paiement.
- **Attendu** :
  - Paiement P4 « Mobile Money », 50 000, « Réussi », Reste à affecter 50 000.
  - Détail : « Opérateur Mobile Money » = ORANGE, « Numéro de téléphone » renseigné.
  - Le choix « Compte de trésorerie » ne propose que des comptes Mobile Money.
  - Solde du locataire = **−290 000** (étape S4 du parcours de référence).
- **Gravité si échec** : Majeur

### GL-06-008 — Mobile Money : opérateur et téléphone obligatoires

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-007.
- **Données** : Mobile Money 10 000 sans opérateur, puis avec opérateur sans téléphone.
- **Étapes** :
  1. Nouveau paiement › Méthode « Mobile Money » › laisser vides Opérateur et Téléphone › Enregistrer le paiement.
  2. Choisir un opérateur, laisser le téléphone vide › Enregistrer.
- **Attendu** :
  - Messages « L'opérateur mobile money est requis » puis « Le numéro de téléphone est requis » ; aucun paiement créé, aucune requête réseau.
  - Repasser sur « Espèces » masque les deux champs sans les exiger.
- **Gravité si échec** : Mineur

### GL-06-009 — Carte bancaire, « Autre » et choix du compte de trésorerie

- **Rôle** : ADMIN_A
- **Préconditions** : comptes « Cartes à encaisser » ou banque existants.
- **Données** : carte 20 000 ; autre 15 000 ; sélection du compte selon le mode.
- **Étapes** :
  1. Nouveau paiement › Méthode « Carte bancaire » : ouvrir « Compte de trésorerie ».
  2. Changer la méthode en « Espèces » : relire le champ « Compte de trésorerie » (il se vide) puis la liste.
  3. Enregistrer successivement un paiement « Carte bancaire » (sans compte choisi) et un paiement « Autre » (tous les comptes proposés).
- **Attendu** :
  - Carte : seuls « Cartes à encaisser » et les banques ; Espèces : seulement les caisses ; Virement : les banques ; Chèque : « Chèques à encaisser » et banques ; Mobile Money : les comptes Mobile Money ; Autre : tous.
  - Changer de méthode **vide** le compte déjà choisi.
  - Sans compte choisi, le paiement est enregistré sur le compte par défaut du moyen de paiement (aucune erreur).
  - Les paiements apparaissent avec « Carte bancaire » et « Autre » (le libellé « Autre » n'est pas traduit dans la liste : Cosmétique).
  - « Prélèvement bancaire » n'est pas proposé dans ce formulaire.
- **Gravité si échec** : Majeur

### GL-06-010 — Validation du montant : vide, 0, négatif, décimal, démesuré

- **Rôle** : ADMIN_A
- **Préconditions** : formulaire Nouveau paiement ouvert sur le bail.
- **Données** : (vide), 0, −500, 1500,5, 10 000 000 000.
- **Étapes** :
  1. Laisser « Montant » vide › Enregistrer le paiement.
  2. Saisir 0, puis −500 (le champ remonte à 0), puis 1500,5, puis 10000000000.
- **Attendu** :
  - Vide : « Le montant est requis ». 0 : « Le montant doit être supérieur à 0 ». −500 : impossible à saisir (le champ est borné à 0) puis même message.
  - 1500,5 : accepté ou arrondi sans erreur (le FCFA n'a pas de subdivision) ; le montant enregistré est affiché sans centimes.
  - 10 000 000 000 : refus **propre** attendu (message de limite). **Anomalie probable** : aucun plafond côté API, l'écriture échoue en base (champ à 12 chiffres) et renvoie une erreur 500 ou un message technique ; consigner le code et le texte.
- **Gravité si échec** : Majeur

### GL-06-011 — Validation de la date du règlement : vide, future, très ancienne

- **Rôle** : ADMIN_A
- **Préconditions** : formulaire Nouveau paiement ouvert.
- **Données** : date vide, date de demain, 01/01/1990.
- **Étapes** :
  1. Effacer « Date du règlement » › Enregistrer.
  2. Ouvrir le calendrier : essayer de choisir demain.
  3. Saisir 01/01/1990 au clavier › Enregistrer un paiement de 1 000.
- **Attendu** :
  - Vide : « La date du règlement est requise ».
  - Les dates futures sont grisées dans le calendrier ; une date future forcée (requête rejouée avec `paidAt` demain) est refusée par l'API : « La date du règlement ne peut pas être dans le futur » (400).
  - 01/1990 : accepté (aucun contrôle par rapport au début du bail) ; consigner comme observation (la date de règlement antérieure au bail n'est pas contrôlée).
  - Texte d'aide sous le champ : « La date à laquelle le locataire a payé, pas celle de la saisie. »
- **Gravité si échec** : Mineur

### GL-06-012 — Devise différente de celle du bail

- **Rôle** : ADMIN_A
- **Préconditions** : formulaire Nouveau paiement sur REC-GL-PAY-1 (bail en FCFA).
- **Données** : Montant 100, Devise « EUR ».
- **Étapes** :
  1. Choisir Devise = EUR, Montant 100, Enregistrer le paiement.
  2. Cliquer **Affecter** sur ce paiement et le répartir sur E10 ; lire le montant alloué.
- **Attendu** :
  - Attendu métier (spec FR-032) : refus « devise différente de celle du bail ».
  - **Anomalie probable** : le paiement en EUR est accepté et l'affectation compte « 100 » comme 100 FCFA sur E10 (aucune conversion) ; un solde faux en résulte. Si c'est le cas, annuler le paiement (statut « Annulé ») pour rétablir la suite du parcours.
- **Gravité si échec** : Bloquant

### GL-06-013 — Paiement sans bail depuis la page globale « Nouveau paiement »

- **Rôle** : ADMIN_A
- **Préconditions** : Encaisser › Paiements (liste globale, sans bail).
- **Données** : espèces 5 000.
- **Étapes** :
  1. Liste globale › **Nouveau paiement** : chercher un champ « Bail » ou « Locataire » dans le formulaire.
  2. Enregistrer un paiement de 5 000 en espèces.
  3. Lire la ligne créée (colonnes Bail et Locataire) ; cliquer **Affecter**.
  4. Ouvrir le détail du paiement.
- **Attendu** :
  - Attendu métier : le paiement est rattaché à un bail et à un locataire (champ obligatoire ou sélecteur).
  - **Anomalie probable** : le formulaire ne propose aucun bail ni locataire ; le paiement est créé « sans bail » (Bail « — », Locataire « — »), n'alimente aucun compte de locataire, et « Affecter » ouvre une fenêtre qui reste sur « Chargement des échéances... » sans jamais proposer d'échéance. Le détail masque « Allouer aux échéances ». Le montant compte pourtant dans l'« Encaissé » du tableau de bord.
  - Annuler ce paiement (statut « Annulé ») après le constat.
- **Gravité si échec** : Majeur

### GL-06-014 — ID de transaction PSP déjà utilisé

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-007 (ID « OM-REC-0001 » déjà utilisé).
- **Données** : second paiement Mobile Money avec le même « ID Transaction PSP ».
- **Étapes** :
  1. Nouveau paiement Mobile Money 10 000, ID Transaction PSP « OM-REC-0001 ».
  2. Enregistrer le paiement.
- **Attendu** :
  - Refus avec un message lisible (le conflit d'unicité répond 409 « Cette ressource existe déjà. ») ; aucun paiement en double ; le formulaire reste ouvert avec le message.
  - Observation sécurité : l'unicité de cet identifiant est **globale** (toutes agences) ; un identifiant utilisé par une autre agence provoque le même refus, ce qui révèle son existence. À consigner (Mineur) sans le tester sur la vraie donnée d'une autre agence.
- **Gravité si échec** : Mineur

### GL-06-015 — Double clic sur « Enregistrer le paiement »

- **Rôle** : ADMIN_A
- **Préconditions** : formulaire Nouveau paiement sur le bail.
- **Données** : espèces 7 000, date = aujourd'hui.
- **Étapes** :
  1. Remplir le formulaire.
  2. Double-cliquer très vite sur **Enregistrer le paiement** (puis, sur un second essai, appuyer deux fois sur Entrée).
  3. Compter les paiements de 7 000 dans la liste ; F5.
- **Attendu** :
  - **Un seul** paiement de 7 000 (le bouton passe en chargement au premier clic).
  - Avec la touche Entrée deux fois de suite, vérifier qu'une seule requête `POST …/rental/payments` part ; sinon consigner un doublon de paiement (Bloquant : le formulaire n'envoie pas de clé d'idempotence).
  - Annuler le paiement de 7 000 après le constat pour garder les soldes de référence.
- **Gravité si échec** : Bloquant

### GL-06-016 — Retour arrière et F5 après un enregistrement

- **Rôle** : ADMIN_A
- **Préconditions** : un paiement vient d'être enregistré (GL-06-006).
- **Données** : liste Paiements du bail.
- **Étapes** :
  1. Après l'enregistrement, F5 sur la liste.
  2. Cliquer **Voir**, puis le bouton **Retour** de la page de détail.
- **Attendu** :
  - Le paiement n'apparaît qu'une fois, avec les mêmes montants.
  - **Retour** ramène au **bail** quand le paiement a un bail (à la liste des paiements sinon), pas à la liste d'origine : consigner l'ergonomie (Cosmétique).
- **Gravité si échec** : Mineur

---

## C. Liste, filtres, détail

### GL-06-017 — Liste des paiements : colonnes, tri, compteur

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-003 à GL-06-007.
- **Données** : liste globale et liste du bail.
- **Étapes** :
  1. Encaisser › Paiements ; lire l'en-tête et les colonnes.
  2. Comparer avec l'onglet Paiements du bail.
- **Attendu** :
  - Titre « Paiements », sous-titre « N paiements » (le mot « paiement » n'est pas traduit par le système de traduction : Cosmétique en anglais/arabe).
  - Liste globale : Bail (numéro + bien), Locataire, Date, Montant, Reste à affecter, Méthode, Statut, En ligne, Actions (Voir, Affecter). Onglet du bail : sans Bail ni Locataire.
  - Tri du plus récent au plus ancien (date de saisie).
  - Onglets « Paiements » et « Déclarations en attente ».
- **Gravité si échec** : Majeur

### GL-06-018 — Filtres de la liste : statut, locataire, F5

- **Rôle** : ADMIN_A
- **Préconditions** : paiements « Réussi » et au moins un « Annulé » (créer et annuler un paiement de 1 000 si besoin).
- **Données** : filtres Statut (En attente, Réussi, Échoué, Annulé) et Locataire.
- **Étapes** :
  1. Liste globale › Statut = « Annulé », puis « Réussi », « En attente », « Échoué ».
  2. Locataire = « REC-GL Locataire Paiements ».
  3. F5 ; « Effacer les filtres ».
- **Attendu** :
  - Chaque filtre ne montre que le statut choisi ; combiné au locataire, seuls ses paiements.
  - Les statuts « Remboursé » et « Partiellement remboursé » ne sont pas proposés dans le filtre.
  - Les filtres survivent à F5 (paramètres d'URL) ; « Effacer les filtres » rétablit la liste complète.
  - Sans résultat : message « Aucun paiement enregistré. » avec le moyen d'effacer le filtre.
- **Gravité si échec** : Mineur

### GL-06-019 — Détail d'un paiement

- **Rôle** : ADMIN_A
- **Préconditions** : P3 (chèque) affecté (voir GL-06-021).
- **Données** : P3.
- **Étapes** :
  1. Liste › P3 › **Voir**.
  2. Lire cartes, sélecteur de statut et blocs d'utilisation.
- **Attendu** :
  - Sélecteur de statut en haut (« En attente », « Réussi », « Échoué », « Annulé ») sur « Réussi ».
  - « Informations financières » : Locataire, Montant 300 000, Montant alloué, Montant disponible, Méthode de paiement « Chèque », Statut « Réussi ».
  - « Dates » : Date d'initiation, Date de succès (date du règlement).
  - « Utilisation du paiement » : « Allocations aux échéances » (une carte par échéance avec « Montant alloué »), « Allocation au dépôt de garantie » (« Aucune allocation au dépôt de garantie. »).
  - Aucun bouton de reçu ou de quittance sur cette page (voir GL-06-051).
- **Gravité si échec** : Majeur

### GL-06-020 — Paiement introuvable, mal formé, ou d'une autre agence

- **Rôle** : ADMIN_A puis ADMIN_B
- **Préconditions** : relever `<paymentId>` de P1 et `<tenantA>`.
- **Données** : `/tenant/<tenantA>/rental/payments/00000000-0000-0000-0000-000000000000`, `…/payments/abc`.
- **Étapes** :
  1. ADMIN_A : ouvrir chacune des deux URL.
  2. ADMIN_B : ouvrir `/tenant/<tenantB>/rental/payments/<paymentId de A>` puis `/tenant/<tenantA>/rental/payments/<paymentId de A>`.
- **Attendu** :
  - Identifiant inconnu : alerte « Erreur » avec « Paiement introuvable » (404). Identifiant mal formé : refus 400/404 sans texte technique.
  - ADMIN_B : jamais le paiement de A (404 dans son agence ; 403 dans l'agence A). Aucune réponse réseau ne contient un montant, un nom ou un bail de A.
- **Gravité si échec** : Bloquant

### GL-06-021 — Droits : un collaborateur en lecture seule consulte sans écrire

- **Rôle** : LECTEUR_A
- **Préconditions** : paiements existants (GL-06-006).
- **Données** : liste, détail, déclarations.
- **Étapes** :
  1. Encaisser › Paiements : chercher « Nouveau paiement » et « Affecter ».
  2. Ouvrir le détail d'un paiement : essayer de changer le statut.
  3. Onglet « Déclarations en attente » (si une déclaration en attente existe, voir GL-06-045).
- **Attendu** :
  - La liste s'affiche ; les boutons « Nouveau paiement » et « Affecter » sont **absents** ; le sélecteur de statut du détail est **désactivé**.
  - Les boutons « Approuver » / « Rejeter » des déclarations restent **visibles** pour ce rôle et répondent 403 au clic (Mineur : à masquer comme les autres boutons).
  - Aucune écriture possible : toute requête rejouée `POST …/rental/payments` répond 403.
- **Gravité si échec** : Majeur

### GL-06-022 — Affichage mobile de la liste des paiements

- **Rôle** : ADMIN_A
- **Préconditions** : largeur 375 px.
- **Données** : paiements existants.
- **Étapes** :
  1. Ouvrir Encaisser › Paiements et lire une carte avec reste à affecter, une carte entièrement affectée.
- **Attendu** :
  - Cartes titrées par le montant, sous-titre « <date> · <méthode> », statut ; champs « Déjà affecté » / « Reste à affecter » ou « Affectation : Intégralement affecté » ; bouton **Affecter** sur la carte avec reliquat ; toucher la carte ouvre le détail.
  - Pas de défilement horizontal de la page.
- **Gravité si échec** : Mineur

---

## D. Allocation aux échéances

### GL-06-023 — Fenêtre « Affecter » : lecture et aucune échéance cochée

- **Rôle** : ADMIN_A
- **Préconditions** : P3 non affecté (GL-06-006) ; E08 Partiel (60 000), E09 et E10 non payées.
- **Données** : P3 (300 000).
- **Étapes** :
  1. Liste › ligne P3 › **Affecter**.
  2. Lire la fenêtre, puis cliquer **Allouer le paiement** sans rien cocher.
- **Attendu** :
  - Titre « Affecter 300 000 FCFA » ; « Allouer le paiement », « Montant total: 300 000 », « Montant disponible: 300 000 » (« Déjà alloué » absent tant que rien n'est affecté).
  - Liste des échéances **impayées** du bail (E08 reste 60 000, E09, E10, E11 … reste 160 000), chacune avec une case et « Reste à payer: … ».
  - Sans case cochée : message « Sélectionnez au moins une échéance » ; aucune requête.
- **Gravité si échec** : Majeur

### GL-06-024 — Allocation automatique sur plusieurs échéances (S4)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-023.
- **Données** : cocher E08, E09, E10 ; champs « Montant à allouer » vides.
- **Étapes** :
  1. Cocher `08/2026`, `09/2026`, `10/2026` (les champs de montant apparaissent : « Montant à allouer (laisser vide pour allouer automatiquement) »).
  2. Cliquer **Allouer le paiement**.
  3. Lire la liste, l'onglet Échéances, le détail de P3.
- **Attendu** :
  - Message « Paiement affecté. » ; on **reste** sur l'écran (pas de redirection vers les échéances).
  - Répartition par date d'échéance croissante : E08 **60 000** (→ Payé), E09 **160 000** (→ Payé), E10 **80 000** (→ Partiel, reste 80 000). Total 300 000 ; P3 « Affecté ».
  - Détail de P3 : trois cartes d'allocation (60 000, 160 000, 80 000), Montant alloué 300 000, disponible 0.
  - Solde du locataire = **30 000** (étape S5 : Facturé 640 000, Réglé 610 000).
  - Réseau : `POST …/payments/<id>/allocate` avec `installmentIds` (3) → 200.
- **Gravité si échec** : Bloquant

### GL-06-025 — L'ordre de coche n'influe pas : allocation par date d'échéance

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-024 passé (E10 reste 80 000) ; un nouveau paiement espèces de 200 000 non affecté (P6) ; l'échéance `12/2026` (05/12/2026, reste 160 000) non payée.
- **Données** : cocher d'abord `12/2026` puis `10/2026` ; champs vides.
- **Étapes** :
  1. Affecter P6 : cocher `12/2026` puis `10/2026` › Allouer le paiement.
- **Attendu** :
  - E10 reçoit **80 000** en premier (échéance la plus ancienne, quel que soit l'ordre de coche), `12/2026` reçoit **120 000** (→ Partiel, reste 40 000) ; P6 « Affecté ».
  - Annuler P6 ensuite (statut « Annulé ») : E10 revient à « Partiel, reste 80 000 », `12/2026` à « Brouillon », pour garder la suite des soldes.
- **Gravité si échec** : Majeur

### GL-06-026 — Allocation manuelle partielle (S6)

- **Rôle** : ADMIN_A
- **Préconditions** : P4 (Mobile Money 50 000) non affecté ; E10 reste 80 000.
- **Données** : montant manuel 30 000 sur E10.
- **Étapes** :
  1. Affecter P4 › cocher `10/2026` › « Montant à allouer » = 30000 › Allouer le paiement.
- **Attendu** :
  - E10 : payé 80 000 (P3) + 30 000 (P4) = 110 000 → reste **50 000** ; P4 : « Reste à affecter **20 000** » (bouton Affecter toujours présent).
  - Détail de P4 : Montant alloué 30 000, disponible 20 000.
  - Solde du locataire inchangé (**30 000**, étape S6) : les 20 000 non affectés restent une avance.
- **Gravité si échec** : Bloquant

### GL-06-027 — Compléter l'allocation d'un paiement sur la même échéance

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-026 (P4 reste 20 000, E10 reste 50 000).
- **Données** : cocher de nouveau `10/2026`, laisser le montant vide (automatique).
- **Étapes** :
  1. Affecter P4 › cocher `10/2026` › Allouer le paiement.
- **Attendu** :
  - Attendu métier : 20 000 de plus sont affectés à E10 (reste 30 000), P4 « Affecté ».
  - **Anomalie probable** : un paiement ne peut porter qu'une affectation par échéance ; la seconde tentative sur la même échéance est refusée (conflit 409 « Cette ressource existe déjà. ») et le message n'explique pas la cause. Le reliquat doit être affecté à une autre échéance. Consigner le texte exact.
- **Gravité si échec** : Majeur

### GL-06-028 — Affecter le reliquat à une autre échéance

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-027 (reliquat 20 000 de P4).
- **Données** : cocher `12/2026` (05/12/2026), champ vide.
- **Étapes** :
  1. Affecter P4 › cocher `12/2026` › Allouer le paiement.
- **Attendu** :
  - `12/2026` (à venir) reçoit 20 000 → « Partiel » (reste 140 000) ; P4 « Affecté » (si GL-06-027 a échoué).
  - Une échéance à venir peut donc être payée à l'avance ; son loyer est porté au compte du locataire à l'affectation mais ne compte dans le solde qu'à partir de sa date d'échéance (05/12/2026) : le solde du jour reste **30 000**.
- **Gravité si échec** : Majeur

### GL-06-029 — Montant manuel supérieur au reste dû : champ borné

- **Rôle** : ADMIN_A
- **Préconditions** : un paiement non affecté suffisant (créer P7 espèces 400 000).
- **Données** : montant 999 999 sur une échéance dont le reste est 50 000.
- **Étapes** :
  1. Affecter P7 › cocher une échéance de reste 50 000 › saisir 999999 dans « Montant à allouer ».
- **Attendu** :
  - Le champ refuse une valeur supérieure au reste dû (la saisie est ignorée ou plafonnée à 50 000) ; texte d'aide « Max: 50 000 ». Aucune erreur serveur.
  - Annuler P7 ensuite.
- **Gravité si échec** : Mineur

### GL-06-030 — Trop-perçu : le reliquat reste en avance (S8)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-026 ; E10 reste 50 000.
- **Données** : P5 espèces 500 000.
- **Étapes** :
  1. Onglet Paiements › Nouveau paiement espèces 500000.
  2. Affecter P5 › cocher uniquement `10/2026` › Allouer.
  3. Lire la liste, puis le relevé du locataire.
- **Attendu** :
  - E10 reçoit 50 000 → **Payé** ; P5 : « Reste à affecter **450 000** » (avance). Plus aucune échéance échue impayée.
  - Solde du locataire = **−470 000** (avance 450 000 de P5 + 20 000 de P4 si GL-06-027/028 n'ont pas placé ce reliquat), Facturé 640 000, Réglé 1 110 000 (étape S7) ; la ligne « Règlement (espèces) reçu en avance, non affecté » figure au relevé.
- **Gravité si échec** : Bloquant

### GL-06-031 — Double clic sur « Allouer le paiement »

- **Rôle** : ADMIN_A
- **Préconditions** : un paiement non affecté (P8 espèces 160 000) et l'échéance `01/2027` (05/01/2027) non payée.
- **Données** : P8.
- **Étapes** :
  1. Affecter P8 › cocher `01/2027` › double-cliquer très vite sur **Allouer le paiement**.
  2. Lire le détail de P8 et l'échéance ; annuler P8 ensuite.
- **Attendu** :
  - **Une seule** allocation de 160 000 ; `01/2027` « Payé » une seule fois ; jamais 320 000 sur l'échéance.
  - Si la seconde requête part, elle reçoit un refus (« Le paiement est déjà entièrement alloué » ou « Aucune allocation possible ») sans effet.
  - Un paiement entièrement affecté n'offre plus le bouton Affecter.
- **Gravité si échec** : Bloquant

### GL-06-032 — Désallocation : aucune commande à l'écran

- **Rôle** : ADMIN_A
- **Préconditions** : un paiement affecté (P3).
- **Données** : détail de P3.
- **Étapes** :
  1. Chercher, sur la liste, le détail du paiement et le détail de l'échéance, une commande pour retirer ou modifier une affectation.
- **Attendu** :
  - Aucune commande de désallocation (non testable en interface). La seule façon de défaire une affectation est de passer le paiement à « Annulé » ou « Échoué » (voir section E). Consigner pour la couverture.
- **Gravité si échec** : Cosmétique

### GL-06-033 — « Affecter » proposé sur un paiement « En attente »

- **Rôle** : ADMIN_A
- **Préconditions** : un paiement P9 espèces 10 000 non affecté ; l'échéance `01/2027` non payée.
- **Données** : P9 passé « En attente ».
- **Étapes** :
  1. Détail de P9 › sélecteur de statut → « En attente ».
  2. Liste Paiements : lire la ligne P9, cliquer **Affecter**, affecter à `01/2027`.
  3. Retourner au détail de P9.
- **Attendu** :
  - Dans le détail, « Allouer aux échéances » n'est pas proposé (réservé aux paiements « Réussi »).
  - Attendu : la liste ne propose pas non plus « Affecter » pour un paiement non encaissé. **Anomalie probable** : le bouton est présent dans la liste et l'affectation aboutit, soldant une échéance avec de l'argent non encore reçu.
  - Si l'affectation a abouti, annuler P9 (statut « Annulé ») pour défaire l'affectation.
- **Gravité si échec** : Majeur

---

## E. Statut d'un paiement

### GL-06-034 — Passer un paiement alloué de « Réussi » à « En attente »

- **Rôle** : ADMIN_A
- **Préconditions** : un paiement affecté de montant modeste (P10 espèces 5 000 affecté à l'échéance `02/2027`).
- **Données** : P10.
- **Étapes** :
  1. Détail de P10 › sélecteur → « En attente » (aucune confirmation n'est demandée).
  2. Relire le détail, l'échéance `02/2027`, le tableau de bord (tuile « Encaissé »).
- **Attendu** :
  - Message « Statut mis à jour avec succès » ; statut « En attente ».
  - Attendu métier : une transition « Réussi → En attente » n'a pas de sens (refus, ou défait l'affectation). **Anomalie probable** : toutes les transitions sont acceptées sans contrôle ; l'affectation à `02/2027` reste, mais le paiement n'est plus compté dans l'« Encaissé » du tableau de bord : les écrans se contredisent.
  - Annuler P10 ensuite (statut « Annulé »).
- **Gravité si échec** : Majeur

### GL-06-035 — Annuler un paiement alloué : confirmation et effets (S9)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-030 (étape S7), P3 (chèque 300 000) affecté à E08 (60 000), E09 (160 000), E10 (80 000).
- **Données** : P3.
- **Étapes** :
  1. Détail de P3 › sélecteur de statut → « Annulé ».
  2. Lire la fenêtre, cliquer **Retour** puis rouvrir et cliquer **Confirmer**.
  3. Relire le détail de P3, l'onglet Échéances, la liste Paiements.
- **Attendu** :
  - Fenêtre « Annuler ce paiement ? » / « Les affectations aux échéances et la collecte du dépôt de garantie rattachées à ce paiement seront défaites. » avec « Confirmer » (rouge) et « Retour ». « Retour » ne change rien.
  - Après confirmation : message « Statut mis à jour avec succès » ; P3 « Annulé » (date d'annulation), plus aucune allocation (« Aucune allocation aux échéances. »), Reste à affecter 0.
  - Échéances : E08 **Partiel** (payé 100 000, reste 60 000) ; E09 **En retard** (payé 0, reste 160 000) ; E10 **Partiel** (payé 80 000, reste 80 000) ; E07 inchangée.
- **Gravité si échec** : Bloquant

### GL-06-036 — Solde du locataire après annulation

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-035.
- **Données** : locataire « REC-GL Locataire Paiements ».
- **Étapes** :
  1. Balance clients : ligne du locataire (Facturé, Réglé, Solde) ; « Voir le relevé » : lire les mouvements de nature « Annulation ».
- **Attendu** :
  - **Solde = −170 000** (étape S8 : reste dû 60 000 + 160 000 + 80 000 = 300 000, moins avances 450 000 + 20 000).
  - Facturé attendu 640 000, Réglé attendu 810 000. **Anomalie probable** : le calcul de « Facturé » et « Réglé » ne neutralise pas la contre-passation de l'avance annulée : Facturé 940 000 et Réglé 1 110 000 s'affichent, le solde seul restant juste. Consigner les valeurs lues.
  - Le relevé contient une ligne « Annulation du règlement (chèque) reçu en avance ».
- **Gravité si échec** : Majeur

### GL-06-037 — Passer un paiement alloué à « Échoué »

- **Rôle** : ADMIN_A
- **Préconditions** : paiement P11 espèces 160 000 affecté à l'échéance `03/2027` (05/03/2027).
- **Données** : P11.
- **Étapes** :
  1. Détail de P11 › sélecteur → « Échoué » › **Confirmer**.
- **Attendu** :
  - Même fenêtre de confirmation que pour « Annulé ». P11 « Échoué » (Date d'échec renseignée), affectation défaite, `03/2027` revient « Brouillon » (échéance future) avec reste 160 000.
- **Gravité si échec** : Majeur

### GL-06-038 — Annuler un paiement non affecté (avance)

- **Rôle** : ADMIN_A
- **Préconditions** : un paiement P12 espèces 40 000 non affecté.
- **Données** : P12 ; solde du locataire relevé avant.
- **Étapes** :
  1. Relever le solde du locataire.
  2. Détail de P12 › statut → « Annulé » › Confirmer.
  3. Relire le solde.
- **Attendu** :
  - Le solde augmente de 40 000 (l'avance disparaît) ; aucune échéance modifiée ; le paiement n'est plus compté (« Reste à affecter 0 », plus de bouton Affecter).
- **Gravité si échec** : Bloquant

### GL-06-039 — Réactiver un paiement annulé

- **Rôle** : ADMIN_A
- **Préconditions** : P3 annulé (GL-06-035).
- **Données** : P3.
- **Étapes** :
  1. Détail de P3 › statut → « Réussi » (aucune confirmation).
  2. Liste Paiements, détail de P3, échéances, solde du locataire.
- **Attendu** :
  - P3 « Réussi », **Reste à affecter 300 000** (les affectations défaites ne reviennent pas) ; E08, E09, E10 inchangées.
  - Solde attendu : **−470 000** (étape S9 : la somme de P3 compte de nouveau comme avance). **Anomalie probable** : le solde reste à −170 000 parce que l'avance déjà inscrite puis annulée n'est pas ré-inscrite ; l'avance de 300 000 est alors absente du compte. Consigner.
  - Ré-affecter ensuite P3 à E09 (160 000) pour confirmer que l'affectation fonctionne à nouveau.
- **Gravité si échec** : Bloquant

### GL-06-040 — Statuts de remboursement et double changement de statut

- **Rôle** : ADMIN_A
- **Préconditions** : un paiement quelconque.
- **Données** : sélecteur de statut.
- **Étapes** :
  1. Ouvrir le sélecteur de statut du détail.
  2. Choisir deux fois de suite « Annulé » très vite (double clic sur Confirmer).
- **Attendu** :
  - Le sélecteur ne propose que « En attente », « Réussi », « Échoué », « Annulé » : « Remboursé » et « Partiellement remboursé » sont **non testables en interface** (API seulement).
  - Le double changement n'écrit qu'une fois (aucune contre-passation en double au relevé : une seule ligne « Annulation du règlement »).
- **Gravité si échec** : Majeur

### GL-06-041 — Annuler un paiement qui a financé le dépôt de garantie

- **Rôle** : ADMIN_A
- **Préconditions** : REC-GL-PAY-1 a un dépôt de garantie de 300 000 (créé automatiquement à la première consultation de l'onglet « Dépôt de garantie »).
- **Données** : paiement P13 virement 300 000.
- **Étapes** :
  1. Créer P13 (virement, 300000, non affecté).
  2. Onglet **Dépôt de garantie** › **Nouveau mouvement** › Type « Collecte », « Paiement associé » = P13, montant (rempli à 300 000) › Enregistrer.
  3. Liste Paiements : P13 ; détail de P13 : bloc « Allocation au dépôt de garantie ».
  4. Annuler P13 (« Annulé » › Confirmer) et relire l'onglet Dépôt de garantie.
- **Attendu** :
  - Après la collecte : P13 « Affecté » ; détail : « Collecte (dépôt de garantie) — Montant : 300 000 » ; dépôt « Complet ».
  - Après annulation : le mouvement de collecte est supprimé, le solde du dépôt retombe à 0 (« En attente »).
  - Si le dépôt a déjà été restitué ou retenu avant l'annulation : refus « Ce paiement a financé un dépôt de garantie déjà restitué ou retenu : annulez d'abord ces mouvements du dépôt. » (409), P13 reste « Réussi ».
- **Gravité si échec** : Bloquant

---

## F. Paiement en ligne

### GL-06-042 — Paiement en ligne réussi : badge et rapprochement

- **Rôle** : ADMIN_A (puis PUBLIC)
- **Préconditions** : lien de paiement actif sur une échéance échue de REC-GL-PAY-1 (cas `GL-05-048`) ; mode simulateur.
- **Données** : lien neuf.
- **Étapes** :
  1. En PUBLIC : ouvrir le lien › **Payer maintenant** › sur le simulateur cliquer **Payer**.
  2. En ADMIN_A : Encaisser › Paiements : lire la ligne et la colonne « En ligne ».
  3. Ouvrir le détail du paiement : carte « Paiement en ligne ».
- **Attendu** :
  - Paiement Mobile Money « Réussi » avec badge **En ligne** + **Réussi** (+ « Mode démonstration » dans le détail), affecté à l'échéance visée (voir `GL-05-051`).
  - Le bouton « Vérifier le statut » n'existe que tant que le paiement en ligne est « En attente » ou « En cours de vérification par l'agence ».
- **Gravité si échec** : Bloquant

### GL-06-043 — « Vérifier le statut » d'un paiement en ligne en attente

- **Rôle** : ADMIN_A
- **Préconditions** : un paiement en ligne démarré mais non terminé : en PUBLIC, ouvrir un lien › **Payer maintenant** › s'arrêter sur la page du simulateur.
- **Données** : paiement en ligne PENDING.
- **Étapes** :
  1. Paiements : repérer la ligne « En attente » avec badge « En ligne » + « En attente » ; cliquer l'icône **Vérifier le statut**.
  2. Sur le simulateur (autre onglet) cliquer **Payer**.
  3. Revenir et recliquer **Vérifier le statut**.
- **Attendu** :
  - Premier clic : message « Statut vérifié », le paiement reste « En attente » ; aucune affectation.
  - Après « Payer » côté simulateur et nouveau clic : paiement « Réussi », échéance soldée ou partielle selon le montant, badge « Réussi ».
  - Réseau : `POST …/rental/payments/<id>/online-check` → 200.
  - Sur un paiement qui n'est pas en ligne, l'action n'est pas proposée (API : 404 « Ce paiement n'a pas de paiement en ligne associé. »).
- **Gravité si échec** : Majeur

### GL-06-044 — Paiement en ligne échoué ou annulé

- **Rôle** : ADMIN_A (puis PUBLIC)
- **Préconditions** : un lien actif.
- **Données** : simulateur « Solde insuffisant » puis « Annuler ».
- **Étapes** :
  1. PUBLIC : Payer maintenant › **Solde insuffisant**.
  2. ADMIN_A : liste Paiements › détail du paiement en ligne.
- **Attendu** :
  - Paiement « Échoué » avec badge « En ligne » + « Échoué » et le message d'échec du fournisseur (si fourni) en rouge ; aucune échéance modifiée ; « Reste à affecter » 0.
  - Un paiement en ligne « En cours de vérification par l'agence » (écart de montant) n'est pas reproductible avec le simulateur : non testable en interface.
- **Gravité si échec** : Majeur

---

## G. Déclarations de paiement du portail locataire

### GL-06-045 — Le locataire déclare un paiement lié à une échéance

- **Rôle** : LOCATAIRE_PORTAIL (LOCATAIRE_PORTAIL_2)
- **Préconditions** : bail REC-GL-DECL actif avec échéances 09/2026 et 10/2026 impayées (notées « Dû »/« En retard » dans le portail) ; le portail affiche bien ce bail dans « Mon bail » (sinon désigner un locataire sans autre bail actif).
- **Données** : virement bancaire 60 000, date de paiement 02/11/2026, référence « VIR-REC-001 », échéance 10/2026, justificatif PNG de test (< 5 Mo), notes « Virement du 02/11 ».
- **Étapes** :
  1. Portail locataire `/tenant/payments` › sur la ligne `10/2026` (ou le bouton **Déclarer un paiement**).
  2. Remplir : Montant (proposé = solde de l'échéance, modifier en 60000), Date de paiement, Méthode « Virement bancaire », Référence, Justificatif (« Télécharger un fichier »), Notes › **Déclarer le paiement**.
- **Attendu** :
  - Message « Déclaration de paiement créée avec succès. Elle est en attente d'approbation par le gestionnaire. » ; la fenêtre se ferme.
  - La déclaration apparaît « En attente » côté portail ; aucun paiement ni changement d'échéance n'existe tant que l'agence n'a pas approuvé.
- **Gravité si échec** : Bloquant

### GL-06-046 — Validations de la déclaration (portail)

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : fenêtre « Déclarer un paiement » ouverte.
- **Données** : montant 0 ; date de demain ; Mobile Money sans téléphone ; fichier .txt ; fichier de 6 Mo.
- **Étapes** :
  1. Vider le montant puis saisir 0 › Déclarer le paiement.
  2. Essayer une date future dans le calendrier.
  3. Choisir « Mobile Money » : laisser Numéro de téléphone et Opérateur vides.
  4. Joindre un .txt, puis un fichier de plus de 5 Mo.
- **Attendu** :
  - « Le montant est requis » / « Le montant doit être positif » ; dates futures grisées ; « Le numéro de téléphone ayant servi à la transaction est requis » et « L'opérateur mobile est requis ».
  - Fichier refusé : « Vous ne pouvez télécharger que des images ou des PDF! » puis « Le fichier doit être inférieur à 5MB! ».
  - Aucune déclaration créée tant que le formulaire est invalide.
- **Gravité si échec** : Mineur

### GL-06-047 — Liste des déclarations côté agence

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-045.
- **Données** : onglet « Déclarations en attente ».
- **Étapes** :
  1. Détail du bail REC-GL-DECL (ou Encaisser › Paiements) › onglet **Déclarations en attente**.
  2. Lire le tableau et les filtres.
- **Attendu** :
  - Colonnes : Date de déclaration, Date de paiement, Bail, Locataire, Échéance (`10/2026`), Montant (60 000), Méthode (« Virement bancaire »), Référence (« VIR-REC-001 »), Statut (étiquette « En attente »), Actions (icône preuve, **Approuver**, **Rejeter**).
  - Liste « Tous les statuts » / « En attente » / « Approuvées » / « Rejetées » / « Annulées » ; total « Total 1 déclaration ».
- **Gravité si échec** : Majeur

### GL-06-048 — Voir la preuve de paiement

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-047 (déclaration avec justificatif PNG) ; une seconde déclaration avec un PDF.
- **Données** : icône « Voir la preuve de paiement ».
- **Étapes** :
  1. Cliquer l'icône de la déclaration avec image, puis de celle avec PDF.
- **Attendu** :
  - Image : fenêtre « Preuve de paiement » avec l'image ; PDF : téléchargement du fichier (nom d'origine).
  - Réseau : `GET …/rental/payment-declarations/<id>/proof` → 200 ; l'adresse `/uploads/portal/payments/…` en direct répond 404 (les preuves ne sont jamais servies en statique).
  - Message « Téléchargement impossible. » si le fichier manque.
- **Gravité si échec** : Majeur

### GL-06-049 — Approuver une déclaration : paiement créé et affecté

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-045 (60 000 sur `10/2026` de REC-GL-DECL, loyer 120 000).
- **Données** : compte de trésorerie banque, notes « Reçu sur relevé ».
- **Étapes** :
  1. Onglet Déclarations en attente › **Approuver**.
  2. Dans « Approuver la déclaration de paiement » : lire Montant, Date de paiement, Méthode, Déclarant ; choisir « Compte de trésorerie » ; Notes › **Approuver**.
  3. Lire la liste des déclarations, l'onglet Paiements, l'onglet Échéances.
- **Attendu** :
  - Message « Déclaration approuvée avec succès » ; la déclaration passe « Approuvée ».
  - Un paiement « Virement bancaire » de 60 000, « Réussi », **daté du 02/11/2026** (date de paiement déclarée), apparaît dans Paiements avec Locataire = déclarant ; il est **affecté à l'échéance 10/2026** : « Partiel », reste 60 000.
  - Le compte du locataire est crédité ; le bouton « Approuver » disparaît de la ligne.
  - Réseau : `POST …/payment-declarations/<id>/approve` → 200.
- **Gravité si échec** : Bloquant

### GL-06-050 — Double clic sur « Approuver »

- **Rôle** : ADMIN_A
- **Préconditions** : une nouvelle déclaration en attente (LOCATAIRE_PORTAIL, 30 000 sur `10/2026`).
- **Données** : déclaration D2.
- **Étapes** :
  1. Approuver › double-cliquer très vite sur le bouton **Approuver** de la fenêtre.
  2. Compter les paiements créés.
- **Attendu** :
  - **Un seul** paiement de 30 000 ; l'autre requête reçoit « Déclaration déjà traitée » (409) ou « Déclaration non trouvée ou déjà traitée ».
  - L'échéance `10/2026` : payé 90 000 (60 000 + 30 000), reste 30 000.
- **Gravité si échec** : Bloquant

### GL-06-051 — Approuver une déclaration supérieure au reste dû

- **Rôle** : LOCATAIRE_PORTAIL puis ADMIN_A
- **Préconditions** : échéance `09/2026` de REC-GL-DECL (reste 120 000).
- **Données** : déclaration de 150 000 sur `09/2026`.
- **Étapes** :
  1. Portail : déclarer 150 000 (virement) sur `09/2026`.
  2. Agence : Approuver.
- **Attendu** :
  - L'échéance `09/2026` est affectée à hauteur de **120 000** (Payé) ; le paiement garde **30 000 non affectés** (« Reste à affecter 30 000 », avance au compte du locataire).
- **Gravité si échec** : Majeur

### GL-06-052 — Approuver une déclaration sur une échéance déjà soldée ou sans échéance

- **Rôle** : LOCATAIRE_PORTAIL puis ADMIN_A
- **Préconditions** : `09/2026` soldée (GL-06-051).
- **Données** : déclaration de 20 000 sans échéance, puis de 20 000 sur `09/2026` déjà payée.
- **Étapes** :
  1. Portail : déclarer 20 000 sans lier d'échéance (bouton **Déclarer un paiement** de la page).
  2. Portail : déclarer 20 000 sur `09/2026` (si le portail ne propose pas de déclarer une échéance déjà soldée, noter « non testable » pour ce volet).
  3. Agence : approuver les deux.
- **Attendu** :
  - Dans les deux cas le paiement est créé « Réussi » mais **non affecté** (20 000 en avance) ; aucune échéance ne bouge ; l'agence peut ensuite l'affecter à la main.
- **Gravité si échec** : Majeur

### GL-06-053 — Rejeter une déclaration : motif obligatoire

- **Rôle** : ADMIN_A
- **Préconditions** : une déclaration en attente D4.
- **Données** : motif « Preuve illisible » ; essai avec motif vide.
- **Étapes** :
  1. **Rejeter** › laisser « Raison du rejet (obligatoire) » vide › Rejeter.
  2. Saisir « Preuve illisible » › Rejeter.
  3. Lire la liste, l'onglet Paiements et l'échéance.
- **Attendu** :
  - Motif vide : message « Veuillez fournir une raison pour le rejet », fenêtre ouverte, aucune requête.
  - Avec motif : « Déclaration rejetée » ; statut « Rejetée » ; **aucun paiement** créé, échéance inchangée.
  - Un motif de seulement des espaces est refusé.
  - Côté portail la déclaration apparaît « Rejetée » (cas `GL-11-…` pour le détail).
- **Gravité si échec** : Majeur

### GL-06-054 — Une déclaration traitée ne se retraite pas

- **Rôle** : ADMIN_A
- **Préconditions** : D (approuvée) et D4 (rejetée).
- **Données** : filtres « Approuvées », « Rejetées ».
- **Étapes** :
  1. Filtrer « Approuvées » : chercher Approuver/Rejeter.
  2. Rejouer, depuis l'onglet réseau, `POST …/approve` sur une déclaration rejetée.
- **Attendu** :
  - Aucun bouton d'action sur les lignes traitées.
  - La requête rejouée est refusée (404 « Déclaration non trouvée ou déjà traitée ») ; rien n'est créé.
  - Filtres « Approuvées », « Rejetées », « Annulées » cohérents avec les statuts.
- **Gravité si échec** : Majeur

### GL-06-055 — Isolation des déclarations entre agences

- **Rôle** : ADMIN_B
- **Préconditions** : identifiant `<declarationId>` d'une déclaration de A.
- **Données** : identifiant relevé.
- **Étapes** :
  1. Dans l'agence B, rejouer `GET …/rental/payment-declarations/<id>`, `…/proof`, `POST …/approve` avec `<tenantB>`.
  2. Ouvrir `/tenant/<tenantB>/rental/payments?onglet=declarations`.
- **Attendu** :
  - 404 pour chaque appel ; aucune déclaration, preuve ni nom de A dans la liste de B.
- **Gravité si échec** : Bloquant

---

## H. Reçu, comptes et conséquences en aval

### GL-06-056 — Reçu de loyer et quittance depuis les documents du bail

- **Rôle** : ADMIN_A
- **Préconditions** : E07 payée (GL-06-003).
- **Données** : type « Reçu de loyer », puis « Quittance de loyer ».
- **Étapes** :
  1. Détail du bail › onglet **Documents** › **Générer un document**.
  2. Type « Reçu de loyer » › générer ; recommencer avec « Quittance de loyer ».
  3. Ouvrir/télécharger chaque document ; chercher dans l'écran d'un paiement ou d'une échéance un moyen de le lier.
- **Attendu** :
  - Message « Document généré. » ; deux documents (numéros `AAAA-NNN`) de type « Reçu de loyer » et « Quittance de loyer » ; téléchargement possible.
  - **Limite constatée** : le formulaire génère un document pour le **bail**, sans choisir de paiement ni d'échéance ; le détail d'un paiement ne propose ni reçu ni quittance. Un reçu lié à un paiement précis n'est donc pas obtenu par l'interface (hors prélèvement bancaire, qui génère son reçu tout seul). Consigner pour la couverture.
- **Gravité si échec** : Majeur

### GL-06-057 — Solde du locataire et relevé suivent chaque étape

- **Rôle** : ADMIN_A
- **Préconditions** : parcours S1 à S9 joué (on peut aussi relever le solde au fil des cas).
- **Données** : tableau « Parcours de référence ».
- **Étapes** :
  1. Après chaque étape S1 à S9, ouvrir Plus › Finance › Clients et propriétaires › Facturation et balances › **Balance clients** : ligne « REC-GL Locataire Paiements ».
  2. Relever Facturé, Réglé, Solde ; ouvrir « Voir le relevé ».
- **Attendu** :
  - Solde de chaque étape = colonne « Solde » du tableau (S1 0 ; S2 60 000 ; S3 −240 000 ; S4 −290 000 ; S5 30 000 ; S6 30 000 ; S7 −470 000 ; S8 −170 000 ; S9 −470 000).
  - Nature des lignes du relevé : « Loyer », « Règlement », « Avance reçue », « Avance imputée », « Annulation ».
  - Solde = Facturé − Réglé à chaque étape (sauf le défaut GL-06-036).
  - Rien ne fuit entre locataires : le solde d'un autre locataire n'est pas modifié.
- **Gravité si échec** : Bloquant

### GL-06-058 — Compte du propriétaire après encaissement et affectation

- **Rôle** : ADMIN_A
- **Préconditions** : bail REC-GL-OWN avec propriétaire mandant (PROPRIETAIRE_PORTAIL) et échéances générées ; règle d'honoraires de l'agence relevée en `GL-01-…` (ex. 10 % sur « Loyer seul », TVA 18 %).
- **Données** : paiement espèces 160 000 sur l'échéance `10/2026` de REC-GL-OWN ; solde dû du propriétaire relevé avant.
- **Étapes** :
  1. Plus › Finance › Clients et propriétaires › Reversements et commissions › **Comptes propriétaires** : relever « Solde dû » du propriétaire.
  2. Encaisser le loyer (« Encaisser » sur `10/2026` de REC-GL-OWN).
  3. Rouvrir le compte du propriétaire (« Voir le compte »).
- **Attendu** :
  - Le compte se resynchronise à la consultation : une ligne « Loyer encaissé » de 160 000 apparaît, avec « Honoraires » et « TVA sur honoraires » selon la règle (exemple : honoraires 10 % de 150 000 = 15 000, TVA 18 % = 2 700).
  - Variation du « Solde dû » = 160 000 − honoraires − TVA (exemple : **+142 300**) ; les cartes « Loyers encaissés », « Honoraires », « TVA » augmentent d'autant.
  - Un paiement non affecté n'augmente pas le compte courant (fonds « à affecter »).
  - Après annulation du paiement (GL-06-035) le compte repasse à sa valeur d'origine (lignes « Annulation »).
- **Gravité si échec** : Bloquant

### GL-06-059 — Effet de la date de règlement sur le tableau de bord et la caisse

- **Rôle** : ADMIN_A
- **Préconditions** : GL-06-004 (règlement du 20/10 saisi le 03/11) ; caisse ouverte (cas `GL-09-…`) pour le volet caisse.
- **Données** : paiement espèces 10 000 daté 20/10/2026 saisi aujourd'hui.
- **Étapes** :
  1. Relever sur le tableau de bord la tuile « Encaissé (novembre 2026) » et le mois précédent.
  2. Enregistrer un paiement espèces 10 000 avec Date du règlement = 20/10/2026.
  3. Relire le tableau de bord ; relire la caisse du jour (Finance › Caisse).
- **Attendu** :
  - Le montant s'ajoute à **octobre** (date du règlement), pas à novembre, dans « Encaissé » ; la caisse du jour (qui compte par date de saisie) l'inclut dans ses encaissements du jour.
  - Les deux écrans comptent donc le même paiement à deux dates : à signaler au métier (voir `GL-09-…`).
- **Gravité si échec** : Majeur

---

## I. Couverture

| Sous-fonctionnalité du classeur (Encaisser — Paiements)                               | Cas                                                                                                             |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Enregistrer un paiement (espèces, virement, chèque, Mobile Money, carte, autre)       | GL-06-003, 004, 006, 007, 009                                                                                   |
| Date réelle du règlement, référence, trésorerie                                       | GL-06-004, 005, 006, 009, 011, 059                                                                              |
| Validations (montant, date, devise, sans bail, doublon, double clic)                  | GL-06-008, 010, 011, 012, 013, 014, 015, 016                                                                    |
| Consulter / lister les paiements (filtres, détail, états vides, mobile)               | GL-06-002, 017, 018, 019, 020, 022                                                                              |
| Allouer un paiement (totale, partielle, trop-perçu, auto/manuel, ordre, doubles)      | GL-06-023 à GL-06-031, 033                                                                                      |
| Désallocation                                                                         | GL-06-032 (non testable en interface : aucune commande ; passer par l'annulation du paiement)                   |
| Changer le statut d'un paiement (transitions, annulation d'un paiement alloué, dépôt) | GL-06-034 à GL-06-041                                                                                           |
| Statuts Remboursé / Partiellement remboursé                                           | GL-06-040 (non testable en interface : non proposés)                                                            |
| Paiement issu d'un prélèvement bancaire : statut non modifiable                       | voir `GL-08-…` (constat de la remise)                                                                           |
| Relancer le rapprochement d'un paiement en ligne                                      | GL-06-042, GL-06-043, GL-06-044 (cas « en cours de vérification par l'agence » non reproductible en simulateur) |
| Consulter / lister les déclarations de paiement, preuve                               | GL-06-047, GL-06-048                                                                                            |
| Approuver une déclaration (effet sur l'échéance, double clic, trop-perçu)             | GL-06-049, 050, 051, 052, 054                                                                                   |
| Rejeter une déclaration (motif obligatoire)                                           | GL-06-053, 054                                                                                                  |
| Création de la déclaration côté portail locataire                                     | GL-06-045, GL-06-046 (détail du portail dans `GL-11-…`)                                                         |
| Reçu / quittance d'un paiement                                                        | GL-06-056 (génération limitée au bail ; lien au paiement non disponible à l'écran)                              |
| Effet sur le solde du locataire                                                       | GL-06-005, 024, 030, 036, 038, 039, 057                                                                         |
| Effet sur le compte du propriétaire                                                   | GL-06-058                                                                                                       |
| Conséquence sur le tableau de bord et la caisse                                       | GL-06-059 (détail dans `GL-09-…`)                                                                               |
| Isolation entre agences                                                               | GL-06-020, GL-06-055                                                                                            |
| Droits en lecture seule                                                               | GL-06-021                                                                                                       |
| Export de la liste des paiements                                                      | voir `GL-09-…`                                                                                                  |
