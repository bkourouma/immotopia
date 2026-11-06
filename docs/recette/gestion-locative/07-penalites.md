# 07 — Pénalités de retard

**Périmètre.** Onglet **Pénalités** du détail d'un bail (il n'existe pas d'écran « Pénalités » global dans le menu) : calcul des pénalités de retard selon les réglages du bail (mode, taux, montant fixe, plafond, jours de grâce), liste, recalcul sans doublon, ajustement manuel (remise), suppression, justificatif (joindre, remplacer, télécharger), effet sur l'échéance, sur le solde du locataire et sur la balance. Le calcul est déclenché par le bouton **Calculer les pénalités** de l'onglet, par « Recalculer les statuts et pénalités » d'un bail (fichier 05) et par la tâche de 02:00 (non déclenchable à l'écran).

**Écrans.**

| Écran                       | URL / chemin                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Onglet Pénalités du bail    | `/tenant/<tenantId>/rental/leases/<leaseId>` › onglet « Pénalités »                                        |
| Échéances (effet du calcul) | Encaisser › Échéances, ou onglet « Échéances » du bail                                                     |
| Relevé du locataire         | Plus › Finance › Clients et propriétaires › Facturation et balances › Balance clients › « Voir le relevé » |
| Balance âgée                | Plus › Finance › … › Facturation et balances › Balance âgée                                                |

**Prérequis.** `GL-01-…` (réglages financiers), `GL-02-…` (formulaire de bail), `GL-05-003` (génération des échéances). Le calcul est **agence entière** : le bouton « Calculer les pénalités » traite tous les baux de l'agence A qui ont des échéances en retard (dont l'historique du jeu de base), pas seulement le bail ouvert. La tâche de 02:00 UTC peut avoir déjà calculé des pénalités : si des pénalités existent déjà avant le premier clic, c'est normal ; ce qui compte est qu'un nouveau calcul ne les duplique pas et ne les modifie pas à tort.

**Règles de calcul lues dans le code** (`rental-penalty-service.ts`) :

- Une échéance est pénalisée quand **jours de retard > jours de grâce du bail** (jours de retard = date du jour − date d'échéance). Les échéances « Brouillon » échues comptent comme les autres ; les échéances soldées (Payé) et à venir sont ignorées.
- « Pourcentage du solde » : montant = (loyer + charges + autres frais − déjà payé) × taux / 100 ; la pénalité elle-même n'entre pas dans la base. « Montant fixe » : montant fixe du bail. Plafond : si la pénalité dépasse le plafond, elle est ramenée au plafond.
- Le mode « Pourcentage du loyer » existe dans le moteur mais **n'est pas proposé** par le formulaire de bail (non testable en interface).
- Un nouveau calcul **met à jour** la pénalité existante de l'échéance (pas de doublon) ; une pénalité **ajustée à la main** n'est plus recalculée.
- La pénalité s'ajoute au « Montant dû » de l'échéance (loyer + charges + autres frais + pénalités) et au compte du locataire.

**Date de référence : 03/11/2026.** Jours de retard des échéances du 5 du mois : juillet 121 j, août 90 j, septembre 59 j, octobre 29 j. À une autre date, appliquer la règle « jours de retard > jours de grâce » pour recalculer quelles échéances sont pénalisées.

**Données créées par ce fichier.** Cinq baux mensuels 01/07/2026 → 30/06/2027, jour d'échéance 5, loyer 150 000, charges 10 000 (160 000 par échéance), bien « REC-GL Bien PEN-x » distinct, statut Actif, échéances générées. Les 4 premières échéances (juillet à octobre 2026) sont échues. Locataire « REC-GL Locataire Pénalités » pour PEN-A seul (pour lire son solde) ; « REC-GL Locataire Pénalités 2 » pour PEN-B à PEN-E.

| Bail         | Jours de grâce | Mode                 | Taux                                | Montant fixe | Plafond | Pénalités attendues au 03/11/2026                                  |
| ------------ | -------------- | -------------------- | ----------------------------------- | ------------ | ------- | ------------------------------------------------------------------ |
| REC-GL-PEN-A | 5              | Pourcentage du solde | 2                                   | —            | vide    | 07, 08, 09, 10/2026 : **3 200** chacune (2 % de 160 000)           |
| REC-GL-PEN-B | 5              | Pourcentage du solde | 2                                   | —            | 3 000   | 4 pénalités **plafonnées à 3 000**                                 |
| REC-GL-PEN-C | 0              | Montant fixe         | —                                   | 5 000        | —       | 4 pénalités de **5 000**                                           |
| REC-GL-PEN-D | 29             | Pourcentage du solde | 2                                   | —            | vide    | 07, 08, 09/2026 : **3 200** ; 10/2026 : **aucune** (29 j non > 29) |
| REC-GL-PEN-E | 5              | Pourcentage du solde | 0 (valeur par défaut du formulaire) | —            | vide    | **aucune pénalité** attendue (taux 0 %)                            |

---

## A. Préparation et état vide

### GL-07-001 — Créer et activer les cinq baux de test des pénalités

- **Rôle** : ADMIN_A
- **Préconditions** : biens « REC-GL Bien PEN-A » à « PEN-E » libres et les deux locataires (cas `GL-01-…`, `GL-02-…`).
- **Données** : tableau « Données créées ».
- **Étapes** :
  1. Baux › Nouveau bail, cinq fois : saisir bien, locataire, dates, « Fréquence de facturation » Mensuel, « Jour d'échéance (1-31) » 5, « Montant du loyer » 150000, « Charges de service » 10000, puis à l'étape « Pénalités » : « Jours de grâce pour pénalités », « Mode de pénalité » (« Pourcentage du solde » ou « Montant fixe »), « Taux de pénalité (%) » ou « Montant fixe de pénalité », « Montant maximum de pénalité (optionnel) » pour PEN-B.
  2. Passer chaque bail à « Actif » puis « Générer les échéances » (onglet Échéances).
- **Attendu** :
  - 5 baux « Actif » avec 12 échéances de 160 000 chacun ; les valeurs de pénalité visibles dans la fiche du bail.
  - Le champ « Taux de pénalité (%) » vaut 0 par défaut ; « Montant maximum de pénalité » n'apparaît que pour « Pourcentage du solde » (il est masqué en « Montant fixe »).
  - Le mode « Pourcentage du loyer » n'existe pas dans la liste (seulement « Pourcentage du solde » et « Montant fixe »).
- **Gravité si échec** : Bloquant

### GL-07-002 — Onglet Pénalités sans pénalité : état vide

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-001 ; aucun calcul encore lancé depuis la création des baux (si la tâche de 02:00 a tourné, passer ce cas sur un bail neuf).
- **Données** : REC-GL-PEN-A.
- **Étapes** :
  1. Baux › REC-GL-PEN-A › onglet **Pénalités**.
- **Attendu** :
  - Titre « Pénalités » sans compteur ; texte « Aucune pénalité pour ce bail. Lancez le calcul si des échéances sont en retard. » ; bouton principal **Calculer les pénalités**.
  - Pas de bouton « Exporter » actif (rien à exporter).
- **Gravité si échec** : Mineur

---

## B. Calcul selon les modes du bail

### GL-07-003 — Calculer les pénalités (pourcentage du solde, 2 %)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-002 ; relever le solde du locataire « REC-GL Locataire Pénalités » avant (Balance clients : probablement absent ou 0).
- **Données** : REC-GL-PEN-A ; grâce 5 j ; 2 %.
- **Étapes** :
  1. Onglet Pénalités de REC-GL-PEN-A › **Calculer les pénalités**.
  2. Lire le message et le tableau.
  3. Onglet Échéances du même bail ; puis détail d'une échéance en retard.
  4. Balance clients : ligne « REC-GL Locataire Pénalités ».
- **Attendu** :
  - Message « Pénalités calculées. » ; sous-titre « 4 pénalités ».
  - 4 lignes : « Retard » 121 jours, 90 jours, 59 jours, 29 jours ; « Montant calculé » **3 200** et « Montant retenu » **3 200** chacune ; colonne « Calculée le » = aujourd'hui ; actions « Ajuster » et « ⋮ ».
  - Aucune ligne pour novembre 2026 et les suivantes (non échues).
  - Échéances `07/2026` à `10/2026` : Montant dû **163 200**, Reste à payer 163 200, statut « En retard » (enregistré en base) ; détail : « Pénalités » 3 200, « Total dû » 163 200.
  - Solde du locataire = 4 × 160 000 + 4 × 3 200 = **652 800** ; le relevé contient 4 lignes « Loyer » et 4 lignes « Pénalité ».
  - Réseau : `POST …/rental/penalties/calculate` (sans identifiant d'échéance) → 200 ; puis `GET …/rental/penalties?leaseId=…` → 200.
  - Effet agence entière : les pénalités des baux PEN-B à PEN-E (et de tous les baux en retard de l'agence) sont aussi créées par ce clic.
- **Gravité si échec** : Bloquant

### GL-07-004 — Plafond de pénalité

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-003.
- **Données** : REC-GL-PEN-B (2 %, plafond 3 000).
- **Étapes** :
  1. Onglet Pénalités de REC-GL-PEN-B.
- **Attendu** :
  - 4 pénalités ; « Montant calculé » **3 000** (2 % de 160 000 = 3 200 est ramené à 3 000) et « Montant retenu » 3 000 ; échéances à 163 000 de montant dû.
  - Le plafond s'applique avant l'enregistrement : aucune ligne à 3 200.
- **Gravité si échec** : Majeur

### GL-07-005 — Montant fixe

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-003.
- **Données** : REC-GL-PEN-C (montant fixe 5 000, grâce 0).
- **Étapes** :
  1. Onglet Pénalités de REC-GL-PEN-C.
- **Attendu** :
  - 4 pénalités de **5 000** (indépendantes du loyer et du retard : 121, 90, 59, 29 jours) ; échéances à 165 000 de montant dû.
  - Avec grâce 0, l'échéance d'octobre (29 jours de retard) est pénalisée.
- **Gravité si échec** : Majeur

### GL-07-006 — Jours de grâce : la limite est « strictement supérieur »

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-003, date de référence 03/11/2026 (ou 04/11/2026 : à partir du 05/11, l'échéance de septembre a 61 jours et octobre 31 jours).
- **Données** : REC-GL-PEN-D (grâce 29 j).
- **Étapes** :
  1. Onglet Pénalités de REC-GL-PEN-D.
  2. Onglet Échéances : statut et montant dû de `10/2026`.
- **Attendu** :
  - 3 pénalités (juillet 121 j, août 90 j, septembre 59 j), **aucune** pour octobre (29 jours de retard, pas supérieur à 29 jours de grâce) : l'échéance `10/2026` reste à 160 000, « En retard ».
  - Le lendemain (04/11 : 30 jours > 29), un nouveau calcul crée la pénalité d'octobre : vérifier si la recette dure.
- **Gravité si échec** : Majeur

### GL-07-007 — Taux de pénalité 0 % laissé par défaut

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-003.
- **Données** : REC-GL-PEN-E (mode « Pourcentage du solde », taux 0, grâce 5).
- **Étapes** :
  1. Onglet Pénalités de REC-GL-PEN-E ; lire montants calculés et retenus.
  2. Onglet Échéances : montant dû.
- **Attendu** :
  - Attendu : aucune pénalité (ou des pénalités à **0**) puisque le bail dit 0 %.
  - **Anomalie probable** (`rental-penalty-service.ts` ~l. 148 et 108) : un taux 0 sur le bail est traité comme « non renseigné » et remplacé par le taux par défaut de l'agence (0,02 interprété comme 0,02 %) : les pénalités valent **32** (160 000 × 0,02 %). Consigner les montants lus.
- **Gravité si échec** : Majeur

### GL-07-008 — Nouveau calcul : aucun doublon, mise à jour de la pénalité existante

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-003.
- **Données** : REC-GL-PEN-A.
- **Étapes** :
  1. Relever le nombre de lignes et les dates « Calculée le ».
  2. Cliquer **Calculer les pénalités** deux fois de suite.
  3. Relire l'onglet Pénalités et le solde du locataire.
- **Attendu** :
  - Toujours **4 pénalités** de 3 200 (pas de 8) ; la date « Calculée le » est mise à jour, les jours de retard aussi.
  - Solde du locataire inchangé : **652 800**.
  - Message « Pénalités calculées. » à chaque clic.
- **Gravité si échec** : Bloquant

### GL-07-009 — Échéance non échue ou dans le délai de grâce : aucune pénalité

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-003.
- **Données** : REC-GL-PEN-A, échéance `11/2026` (05/11/2026, non échue).
- **Étapes** :
  1. Onglet Échéances : statut de `11/2026` ; onglet Pénalités : chercher une ligne pour novembre.
- **Attendu** :
  - `11/2026` reste « Brouillon » à 160 000 ; aucune pénalité ; seules 4 lignes dans l'onglet.
- **Gravité si échec** : Majeur

### GL-07-010 — Calcul pour une seule échéance : non disponible à l'écran

- **Rôle** : ADMIN_A
- **Préconditions** : un bail avec une échéance échue sans pénalité (créer REC-GL-PEN-F ou supprimer la pénalité d'une échéance).
- **Données** : identifiant d'une échéance échue.
- **Étapes** :
  1. Chercher, dans l'onglet Pénalités, l'onglet Échéances et le détail d'une échéance, un bouton pour calculer la pénalité d'**une** échéance.
  2. (Contrôle API, facultatif, depuis la console du navigateur connecté) `POST /api/tenants/<tenantId>/rental/penalties/calculate?installmentId=<id>`.
- **Attendu** :
  - Aucun bouton : l'écran n'offre que le calcul pour toute l'agence (non testable en interface).
  - Contrôle API : 200 avec la pénalité de l'échéance ; une échéance non échue ou dans le délai de grâce répond 400 « Cette échéance n'est pas encore en retard (délai de grâce en cours) ». Remarque : ce chemin API ne vérifie pas que l'échéance est déjà payée (une pénalité à montant fixe pourrait être posée sur une échéance soldée) ; à noter si observé.
- **Gravité si échec** : Mineur

---

## C. Recalcul, paiements et pénalités

### GL-07-011 — Recalcul après un paiement partiel : la pénalité baisse

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-008 (solde du locataire 652 800).
- **Données** : REC-GL-PEN-A, échéance `10/2026` : paiement espèces 100 000.
- **Étapes** :
  1. Onglet Échéances › ligne `10/2026` › **Paiement…** › Espèces, 100000 › Enregistrer le paiement.
  2. Onglet Pénalités › **Calculer les pénalités**.
  3. Relire la pénalité d'octobre, l'échéance et le relevé du locataire.
- **Attendu** :
  - Avant recalcul : `10/2026` payée 100 000 sur 163 200 → « Partiel », reste 63 200.
  - Après recalcul : pénalité d'octobre = 2 % × (160 000 − 100 000) = **1 200** (la même ligne est mise à jour, « Montant calculé » 1 200) ; échéance : Montant dû 161 200, Reste à payer **61 200**.
  - Les autres pénalités (juillet, août, septembre) restent à 3 200.
  - Solde du locataire = 163 200 × 3 + 161 200 − 100 000 = **550 800** ; le relevé montre une ligne « Remise » (2 000) pour la baisse de la pénalité.
- **Gravité si échec** : Bloquant

### GL-07-012 — Loyer payé sans la pénalité : la pénalité en pourcentage tombe à 0

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-011.
- **Données** : REC-GL-PEN-A, échéance `08/2026` : paiement 160 000 (le loyer, hors pénalité).
- **Étapes** :
  1. Échéances › `08/2026` › **Paiement…** › Espèces, 160000 › Enregistrer.
  2. Relire l'échéance (statut « Partiel », reste 3 200 de pénalité).
  3. Pénalités › **Calculer les pénalités**.
  4. Relire la pénalité d'août, l'échéance et le solde.
- **Attendu** :
  - Après paiement : `08/2026` « Partiel », reste 3 200.
  - Après recalcul : la pénalité d'août passe à **0** (2 % d'un solde nul), l'échéance devient **Payé**, reste 0.
  - Solde du locataire = **387 600** (550 800 − 160 000 − 3 200 de remise).
  - La ligne de pénalité d'août reste listée à 0 (« Montant calculé » 0).
- **Gravité si échec** : Majeur

### GL-07-013 — Montant fixe : le loyer payé laisse la pénalité due

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-005 (REC-GL-PEN-C : pénalités de 5 000).
- **Données** : REC-GL-PEN-C, échéance `07/2026` : paiement 160 000.
- **Étapes** :
  1. Échéances › `07/2026` › Paiement… › Espèces, 160000.
  2. Pénalités › Calculer les pénalités.
- **Attendu** :
  - `07/2026` reste **Partiel** avec un reste de **5 000** (la pénalité fixe n'est pas effacée) ; la pénalité reste 5 000.
- **Gravité si échec** : Majeur

### GL-07-014 — Échéance entièrement payée : pas de nouvelle pénalité, l'ancienne reste

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-013.
- **Données** : REC-GL-PEN-C, échéance `08/2026` : paiement 165 000 (loyer + pénalité).
- **Étapes** :
  1. Échéances › `08/2026` › Encaisser (le reste dû proposé est 165 000) › Confirmer l'encaissement.
  2. Pénalités › Calculer les pénalités.
  3. Compter les pénalités du bail.
- **Attendu** :
  - `08/2026` « Payé » ; après recalcul, **toujours 4 pénalités** de 5 000 : l'échéance soldée n'est pas recalculée et ne reçoit aucune nouvelle ligne ; la pénalité d'août reste affichée à 5 000 (historique).
- **Gravité si échec** : Majeur

---

## D. Ajustement manuel (remise)

### GL-07-015 — Ajuster une pénalité à la baisse avec une raison

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-012 (solde de PEN-A 387 600) ; pénalité de juillet = 3 200.
- **Données** : montant retenu 1 000, raison « Geste commercial ».
- **Étapes** :
  1. Onglet Pénalités de REC-GL-PEN-A › ligne `Retard 121 jours` › **Ajuster**.
  2. Dans « Ajuster la pénalité » lire « Montant calculé : 3 200 · 121 jours de retard » ; saisir Montant retenu 1000, Raison « Geste commercial » › **Enregistrer l'ajustement**.
  3. Relire le tableau, l'échéance `07/2026`, le solde.
- **Attendu** :
  - Message « Pénalité ajustée. » ; « Montant calculé » reste **3 200**, « Montant retenu » **1 000**, la raison « Geste commercial » s'affiche sous le montant retenu.
  - Échéance `07/2026` : Montant dû 161 000.
  - Solde du locataire = 387 600 − 2 200 = **385 400** ; une ligne « Remise » de 2 200 au relevé.
  - Réseau : `PATCH …/rental/penalties/<id>` `{ amount: 1000, reason: … }` → 200.
- **Gravité si échec** : Bloquant

### GL-07-016 — Une pénalité ajustée n'est plus recalculée

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-015.
- **Données** : pénalité de juillet de PEN-A ajustée à 1 000.
- **Étapes** :
  1. Calculer les pénalités.
  2. Relire la ligne de juillet.
- **Attendu** :
  - Juillet reste à 1 000 retenu (raison conservée) ; pas de nouvelle ligne ; les autres pénalités non ajustées sont mises à jour normalement.
- **Gravité si échec** : Majeur

### GL-07-017 — Validations du formulaire d'ajustement

- **Rôle** : ADMIN_A
- **Préconditions** : fenêtre « Ajuster la pénalité » ouverte sur une pénalité de PEN-B.
- **Données** : montant vide ; raison vide ; raison « » avec espaces ; montant −1 ; montant 10 000 000 000.
- **Étapes** :
  1. Vider « Montant retenu » › Enregistrer l'ajustement.
  2. Remettre un montant, laisser « Raison de l'ajustement » vide › Enregistrer.
  3. Saisir trois espaces dans la raison › Enregistrer.
  4. Essayer de saisir −1 dans le montant.
  5. Saisir 10000000000 et une raison valable › Enregistrer.
- **Attendu** :
  - « Indiquez le montant retenu. » ; « Indiquez pourquoi le montant est ajusté. » ; aucune requête.
  - Trois espaces : l'écran laisse passer, l'API refuse (400 « Données invalides ») : un message générique s'affiche (Mineur : refuser les espaces à l'écran).
  - −1 impossible à saisir (champ borné à 0).
  - 10 000 000 000 : refus propre attendu ; **anomalie probable** : erreur 500 de base de données (champ numérique à 12 chiffres). Consigner.
  - Annuler la fenêtre à chaque fin de test (**Annuler** ne change rien).
- **Gravité si échec** : Mineur

### GL-07-018 — Ajuster à la hausse : le compte du locataire doit suivre

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-015 (pénalité de juillet de PEN-A : calculé 3 200, retenu 1 000 ; solde 385 400).
- **Données** : montant retenu 5 000, raison « Frais de relance ».
- **Étapes** :
  1. Ajuster la pénalité de juillet › 5000 › raison › Enregistrer l'ajustement.
  2. Relire l'échéance `07/2026` (Montant dû) et le solde du locataire.
- **Attendu** :
  - Montant retenu 5 000 ; l'échéance : Montant dû **165 000**.
  - Solde du locataire attendu : 385 400 + 4 000 = **389 400**.
  - **Anomalie probable** : une révision à la hausse n'est pas inscrite au compte (le code ne peut écrire qu'une seule pénalité et une seule remise par pénalité) ; le solde reste 385 400 alors que l'échéance est montée à 165 000 : l'échéance et le compte divergent. Consigner les deux valeurs.
- **Gravité si échec** : Bloquant

### GL-07-019 — Remise totale puis seconde remise : le compte doit suivre

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-015 ; pénalité de juillet de PEN-A à 1 000 (si GL-07-018 a été joué, la repasser d'abord à 1 000).
- **Données** : montant retenu 0, raison « Remise totale ».
- **Étapes** :
  1. Ajuster la pénalité de juillet › Montant retenu **0**, raison « Remise totale » › Enregistrer.
  2. Relire l'échéance `07/2026` et le solde du locataire.
- **Attendu** :
  - Montant retenu 0 ; échéance : Montant dû 160 000, reste 160 000.
  - Solde attendu : 385 400 − 1 000 = **384 400** (la seconde remise s'ajoute à la première).
  - **Anomalie probable** : une seconde remise sur la même pénalité n'est pas inscrite au compte ; le solde reste 385 400 (1 000 de pénalité encore « due » au compte alors que l'échéance n'en porte plus). Consigner.
- **Gravité si échec** : Bloquant

### GL-07-020 — Annuler la fenêtre d'ajustement

- **Rôle** : ADMIN_A
- **Préconditions** : une pénalité non ajustée de PEN-B.
- **Données** : montant 1 modifié sans enregistrer.
- **Étapes** :
  1. Ajuster › saisir un autre montant et une raison › **Annuler** (ou fermer par la croix).
  2. Rouvrir « Ajuster » sur la même ligne.
- **Attendu** :
  - Aucune requête `PATCH` ; la ligne est inchangée ; la fenêtre rouverte affiche les valeurs d'origine (montant retenu et raison de la ligne), pas la saisie abandonnée.
- **Gravité si échec** : Mineur

---

## E. Suppression

### GL-07-021 — Supprimer une pénalité : confirmation et effets

- **Rôle** : ADMIN_A
- **Préconditions** : pénalité de septembre de PEN-A (3 200) ; solde relevé.
- **Données** : pénalité `Retard 59 jours` de PEN-A.
- **Étapes** :
  1. Sur la ligne › **⋮** › **Supprimer**.
  2. Lire la confirmation, **Annuler**, puis recommencer et cliquer **Supprimer**.
  3. Relire l'onglet Pénalités, l'échéance `09/2026`, le relevé et le solde.
- **Attendu** :
  - Confirmation « Supprimer cette pénalité ? » / « Pénalité de 59 jours de retard. Cette action est irréversible. » ; « Annuler » ne supprime rien.
  - Après « Supprimer » : message « Pénalité supprimée. » ; ligne disparue ; échéance `09/2026` : Montant dû **160 000**, reste 160 000.
  - Solde du locataire diminué de 3 200 ; une ligne « Remise » au relevé.
  - Réseau : `DELETE …/rental/penalties/<id>` → 200.
- **Gravité si échec** : Bloquant

### GL-07-022 — Recalculer après suppression : la pénalité revient

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-021.
- **Données** : PEN-A, échéance `09/2026` sans pénalité.
- **Étapes** :
  1. Calculer les pénalités.
  2. Relire la ligne de septembre et le solde.
- **Attendu** :
  - Une nouvelle pénalité de **3 200** (59 jours) est créée pour septembre ; échéance à 163 200.
  - Le solde du locataire remonte de 3 200 (nouvelle pièce au compte) : retrouver exactement la valeur d'avant la suppression.
  - Les pénalités ajustées (juillet) ne bougent pas.
- **Gravité si échec** : Majeur

### GL-07-023 — Double clic sur « Supprimer », « Calculer » et « Enregistrer l'ajustement »

- **Rôle** : ADMIN_A
- **Préconditions** : pénalités sur PEN-B.
- **Données** : PEN-B.
- **Étapes** :
  1. Double-cliquer très vite sur le bouton **Supprimer** de la confirmation d'une pénalité de PEN-B.
  2. Double-cliquer sur **Calculer les pénalités**.
  3. Ouvrir « Ajuster » et double-cliquer sur **Enregistrer l'ajustement**.
- **Attendu** :
  - Suppression : une seule suppression (la seconde requête répond « Pénalité introuvable » sans effet visible) ; le compte du locataire n'est contre-passé qu'une fois.
  - Calcul : aucune pénalité en double.
  - Ajustement : une seule écriture ; une seule ligne « Remise » au relevé.
- **Gravité si échec** : Majeur

---

## F. Justificatif

### GL-07-024 — Joindre un justificatif (PDF) et le télécharger

- **Rôle** : ADMIN_A
- **Préconditions** : une pénalité sans justificatif (PEN-B).
- **Données** : fichier `justificatif-test.pdf` (< 1 Mo).
- **Étapes** :
  1. Ligne › **⋮** › **Ajouter un justificatif**.
  2. Dans « Justificatif » : « Déposez le fichier ici, ou touchez pour le choisir » / « PDF, Word ou image (JPEG, PNG) » : déposer le PDF.
  3. Lire la ligne ; cliquer **Justificatif** (icône téléchargement).
- **Attendu** :
  - Message « Justificatif enregistré. » ; la fenêtre se ferme ; la ligne affiche un bouton **Justificatif** ; le menu ⋮ propose maintenant « Remplacer le justificatif ».
  - Le clic télécharge `justificatif-test.pdf` avec son nom d'origine.
  - Réseau : `POST …/rental/penalties/<id>/justification` (multipart) → 200 ; `GET …/justification` → 200 ; l'adresse `/uploads/rental/penalties/…` ouverte directement répond 404 (jamais servi en statique).
- **Gravité si échec** : Majeur

### GL-07-025 — Remplacer le justificatif

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-024.
- **Données** : second fichier `justificatif-2.png`.
- **Étapes** :
  1. ⋮ › **Remplacer le justificatif** : la fenêtre montre « Justificatif actuel : justificatif-test.pdf », un bouton **Ouvrir** et « Le nouveau fichier remplacera celui-ci. ».
  2. Déposer `justificatif-2.png`.
  3. Télécharger le justificatif.
- **Attendu** :
  - Le justificatif téléchargé est `justificatif-2.png` ; la ligne n'affiche qu'un seul justificatif.
- **Gravité si échec** : Mineur

### GL-07-026 — Fichier non autorisé ou trop gros

- **Rôle** : ADMIN_A
- **Préconditions** : fenêtre « Justificatif » ouverte.
- **Données** : `notes.txt`, `archive.zip`, `script.html`, un PDF de plus de 25 Mo (limite à confirmer).
- **Étapes** :
  1. Glisser-déposer chaque fichier dans la zone (le sélecteur de fichiers filtre déjà .pdf, .doc, .docx, .jpg, .jpeg, .png ; le glisser-déposer contourne ce filtre).
- **Attendu** :
  - Fichiers non autorisés : message « Type de fichier invalide. Formats acceptés : … » (400) et le justificatif existant est conservé.
  - Fichier trop gros : refus avec message de taille (limite à confirmer) ; jamais de page blanche.
  - Nom de fichier avec caractères spéciaux (`é & ' <b>.pdf`) : accepté, nom affiché échappé, sans exécution de code.
- **Gravité si échec** : Majeur

### GL-07-027 — Justificatif joint avant un ajustement : il doit rester

- **Rôle** : ADMIN_A
- **Préconditions** : une pénalité **jamais ajustée** de PEN-B portant un justificatif (GL-07-024).
- **Données** : montant retenu 2 500, raison « Accord amiable ».
- **Étapes** :
  1. Ajuster cette pénalité › 2500 › « Accord amiable » › Enregistrer l'ajustement.
  2. Relire la ligne : bouton « Justificatif » ? menu ⋮ « Ajouter » ou « Remplacer » ?
- **Attendu** :
  - Le justificatif joint reste attaché à la pénalité (bouton « Justificatif » toujours présent, menu « Remplacer le justificatif »).
  - **Anomalie probable** : le premier ajustement d'une pénalité qui n'était pas encore ajustée réécrit le champ de raison et **perd la référence du justificatif** ; le bouton disparaît et le fichier devient inaccessible (perte de donnée). Consigner.
- **Gravité si échec** : Bloquant

### GL-07-028 — Justificatif joint après un ajustement : il se conserve

- **Rôle** : ADMIN_A
- **Préconditions** : pénalité ajustée (GL-07-015) sans justificatif.
- **Données** : `justif-remise.pdf`.
- **Étapes** :
  1. Joindre le justificatif sur la pénalité de juillet de PEN-A (déjà ajustée).
  2. Ajuster de nouveau son montant (ex. 800 / raison « Révision »), relire la ligne.
- **Attendu** :
  - Le justificatif reste attaché après le second ajustement ; la raison est mise à jour, « Montant calculé » inchangé (3 200).
- **Gravité si échec** : Majeur

---

## G. Droits, isolation, affichage

### GL-07-029 — Droits : lecture seule

- **Rôle** : LECTEUR_A
- **Préconditions** : pénalités existantes sur PEN-A.
- **Données** : PEN-A.
- **Étapes** :
  1. Baux › PEN-A › onglet Pénalités : lire la liste et télécharger un justificatif.
  2. Cliquer **Calculer les pénalités**, **Ajuster** (enregistrer), **⋮ › Supprimer**, **Ajouter un justificatif**.
- **Attendu** :
  - Lecture et téléchargement autorisés (200).
  - Chaque action d'écriture répond **403** et affiche un message d'erreur ; rien n'est modifié ; les boutons ne sont pas masqués pour ce rôle (Mineur : à masquer comme sur l'écran Paiements).
- **Gravité si échec** : Majeur

### GL-07-030 — Isolation : pénalités d'une autre agence

- **Rôle** : ADMIN_B
- **Préconditions** : relever `<penaltyId>` d'une pénalité de A et `<leaseId>` de PEN-A.
- **Données** : identifiants relevés.
- **Étapes** :
  1. Dans l'agence B, rejouer (console réseau) `GET …/rental/penalties/<penaltyId>`, `PATCH …` (montant 1, raison « x »), `DELETE …`, `GET …/justification`, `POST …/justification`, `GET …/rental/penalties?leaseId=<leaseId de A>`.
  2. Ouvrir `/tenant/<tenantB>/rental/leases/<leaseId de A>` puis l'onglet Pénalités.
- **Attendu** :
  - Aucune donnée de A : `GET` 404 ; les écritures sont refusées (400 observé pour `PATCH`/`DELETE`/`POST` avec le message « Pénalité introuvable » : un 404 serait plus juste, Mineur) ; la liste filtrée sur le bail de A est vide.
  - Le bail de A ouvert depuis B : « bail introuvable ».
  - Le calcul de B (« Calculer les pénalités ») ne touche aucune pénalité de A (vérifier ensuite côté A que rien n'a bougé).
- **Gravité si échec** : Bloquant

### GL-07-031 — Affichage mobile de l'onglet Pénalités

- **Rôle** : ADMIN_A
- **Préconditions** : largeur 375 px ; pénalités sur PEN-A dont une ajustée avec justificatif.
- **Données** : PEN-A.
- **Étapes** :
  1. Ouvrir l'onglet Pénalités ; lire une carte ajustée et une carte non ajustée ; ouvrir le menu d'actions.
- **Attendu** :
  - Cartes « 121 jours de retard » (sous-titre « Calculée le … »), montant retenu en évidence ; champs « Montant calculé » et « Raison » pour une carte ajustée, « Justificatif » avec le nom du fichier ; bouton **Ajuster** ; menu : « Ouvrir le justificatif », « Remplacer / Ajouter un justificatif », « Supprimer ».
  - Pas de défilement horizontal.
- **Gravité si échec** : Mineur

### GL-07-032 — Export de la liste des pénalités

- **Rôle** : ADMIN_A
- **Préconditions** : PEN-A avec au moins 4 pénalités dont une ajustée.
- **Données** : bouton **Exporter** du tableau.
- **Étapes** :
  1. Exporter en CSV, puis Excel (.xlsx), puis PDF ; ouvrir chaque fichier.
- **Attendu** :
  - Fichiers `Pénalités de retard-AAAA-MM-JJ.csv` / `.xlsx` / `.pdf` ; colonnes « Calculée le », « Retard », « Montant calculé », « Montant retenu » ; même nombre de lignes que l'écran ; montants identiques (3 200, 1 000 pour l'ajustée) ; message « Export terminé (N lignes). ». (Détails des exports dans `GL-09-…`.)
- **Gravité si échec** : Majeur

### GL-07-033 — Les pénalités dans la balance âgée et le relevé

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-015 terminé ; PEN-A avec pénalités.
- **Données** : locataire « REC-GL Locataire Pénalités ».
- **Étapes** :
  1. Balance âgée : ligne du locataire, tranches et solde.
  2. Relevé : nature des lignes.
- **Attendu** :
  - Chaque échéance non soldée pèse son reste dû **pénalité comprise** dans sa tranche : juillet (121 j) en « > 90 jours », septembre (59 j) en « 30 à 60 jours », octobre (29 j) en « < 30 jours » ; août, soldée au cas GL-07-012, n'y figure plus.
  - Total des tranches = solde du locataire (aucune mention « Écart avec la comptabilité »). Une mention d'écart non nul révèle la divergence entre échéances et compte décrite aux cas GL-07-018 et GL-07-019 : la rapprocher de ces cas.
  - Relevé : natures « Loyer », « Pénalité », « Remise », « Règlement », « Avance reçue », « Avance imputée ».
- **Gravité si échec** : Majeur

---

### GL-07-034 — Bail annulé ou suspendu : pas de nouvelle pénalité

- **Rôle** : ADMIN_A
- **Préconditions** : bail REC-GL-PEN-F (copie de PEN-A, grâce 5, 2 %) sur « REC-GL Bien PEN-F », actif, échéances générées ; **aucun calcul** lancé depuis sa création (créer le bail et exécuter ce cas avant tout nouveau clic de calcul, sinon utiliser un bail neuf).
- **Données** : REC-GL-PEN-F passé à « Annulé » (puis, sur un second bail PEN-G, à « Suspendu »).
- **Étapes** :
  1. Passer REC-GL-PEN-F à « Annulé » (statut final).
  2. Ouvrir un bail actif quelconque › Pénalités › **Calculer les pénalités**.
  3. Ouvrir l'onglet Pénalités de REC-GL-PEN-F.
  4. Répéter avec un bail « Suspendu » (PEN-G).
- **Attendu** :
  - Attendu métier : un bail annulé ne produit aucune pénalité nouvelle ; un bail suspendu non plus (ou, à défaut, le comportement est écrit et validé par le métier).
  - **Anomalie probable** : le calcul retient toute échéance en retard sans regarder le statut du bail ; des pénalités apparaissent sur le bail annulé. Consigner le nombre de lignes créées et leur effet sur le compte du locataire (dette sur un bail annulé).
- **Gravité si échec** : Majeur

### GL-07-035 — Calcul sur l'agence entière : volume et temps de réponse

- **Rôle** : ADMIN_A
- **Préconditions** : l'agence A porte l'historique du jeu de base (≈ 1 000 échéances, dont des retards) ; GL-07-008.
- **Données** : bouton **Calculer les pénalités** d'un bail quelconque.
- **Étapes** :
  1. Ouvrir l'onglet Pénalités de PEN-A, ouvrir la console réseau.
  2. Cliquer **Calculer les pénalités** et chronométrer la réponse de `POST …/rental/penalties/calculate`.
  3. Relire l'onglet pendant et après le calcul.
- **Attendu** :
  - Le bouton passe en chargement ; la réponse arrive en 200 avant tout délai d'attente du navigateur (ordre de grandeur : moins de 30 s) ; message « Pénalités calculées. ».
  - Aucune erreur 5xx ni message d'erreur ; la liste du bail se recharge. Consigner le temps mesuré ; au-delà de 60 s, ouvrir une anomalie de performance.
  - Un second clic pendant le chargement est impossible (bouton en chargement).
- **Gravité si échec** : Majeur

### GL-07-036 — Encaisser une échéance pénalisée : le montant proposé inclut la pénalité

- **Rôle** : ADMIN_A
- **Préconditions** : GL-07-004 (REC-GL-PEN-B : pénalités plafonnées à 3 000, montant dû 163 000 par échéance échue).
- **Données** : REC-GL-PEN-B, échéance `09/2026` (reste 163 000).
- **Étapes** :
  1. Onglet Échéances de PEN-B › ligne `09/2026` › **Encaisser**.
  2. Lire la confirmation puis **Confirmer l'encaissement**.
  3. Lire l'échéance et la pénalité de septembre ; relancer **Calculer les pénalités**.
- **Attendu** :
  - Confirmation « Encaisser 163 000 FCFA en espèces ? » ; après confirmation `09/2026` « Payé » (reste 0).
  - La pénalité de septembre reste listée à 3 000 (historique de l'échéance soldée) ; le nouveau calcul ne la modifie pas et ne crée pas de ligne.
  - Les trois autres échéances en retard de PEN-B gardent 163 000 de reste.
- **Gravité si échec** : Majeur

## H. Couverture

| Sous-fonctionnalité du classeur (Encaisser — Pénalités)                             | Cas                                                                                                                                 |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Calculer une pénalité — toutes les échéances en retard (bouton)                     | GL-07-003, 004, 005, 006, 007, 008, 009                                                                                             |
| Calculer une pénalité — une échéance                                                | GL-07-010 (non testable en interface : pas de bouton ; contrôle API facultatif)                                                     |
| Modes du bail : pourcentage du solde, montant fixe, plafond, jours de grâce, taux 0 | GL-07-003 à GL-07-007                                                                                                               |
| Mode pourcentage du loyer                                                           | GL-07-001 (non proposé par le formulaire : non testable en interface)                                                               |
| Recalcul sans doublon                                                               | GL-07-008, GL-07-011, GL-07-012, GL-07-016, GL-07-022                                                                               |
| Pénalité et paiements (partiel, loyer sans pénalité, montant fixe, échéance payée)  | GL-07-011, 012, 013, 014                                                                                                            |
| Consulter / lister les pénalités (montant calculé, retenu, raison, jours)           | GL-07-002, 003, 015, 031                                                                                                            |
| Modifier une pénalité (remise manuelle, hausse, remise totale, validations)         | GL-07-015 à GL-07-020                                                                                                               |
| Supprimer une pénalité                                                              | GL-07-021, 022, 023                                                                                                                 |
| Joindre / remplacer / télécharger un justificatif                                   | GL-07-024, 025, 026, 027, 028                                                                                                       |
| Tâche quotidienne de calcul (02:00)                                                 | GL-07-003 (préambule) : la tâche n'est pas déclenchable en interface ; constater le lendemain que les pénalités et statuts existent |
| Effet sur échéance, solde, balance, relevé                                          | GL-07-003, 011, 012, 015, 018, 019, 021, 033, 036                                                                                   |
| Calcul sur l'agence entière (volume) et bail annulé / suspendu                      | GL-07-034, GL-07-035                                                                                                                |
| Droits en lecture seule                                                             | GL-07-029                                                                                                                           |
| Isolation entre agences                                                             | GL-07-030                                                                                                                           |
| Export de la liste                                                                  | GL-07-032 (détail dans `GL-09-…`)                                                                                                   |
