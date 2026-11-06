# 05 — Échéances et liens de paiement

**Périmètre.** Menu **Encaisser › Échéances** et onglet **Échéances** du détail d'un bail : génération des échéances d'un bail (fréquences mensuelle, trimestrielle, semestrielle, annuelle, jour d'échéance 29/30/31, février, début en milieu de mois, bail sans date de fin), liste et filtres, détail d'une échéance, recalcul des statuts, suppression de toutes les échéances, effet du passage automatique en retard, encaissement rapide depuis la liste (renvoi au fichier 06 pour le détail), liens de paiement Mobile Money d'une échéance (envoyer, copier, lister, révoquer, page publique `/payer`).

**Écrans et URL.**

| Écran                  | URL                                                      | Libellé de menu                           |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------- |
| Liste globale          | `/tenant/<tenantId>/rental/installments`                 | Encaisser › Échéances                     |
| Détail d'une échéance  | `/tenant/<tenantId>/rental/installments/<installmentId>` | (pas d'entrée de menu)                    |
| Onglet du bail         | `/tenant/<tenantId>/rental/leases/<leaseId>`             | Baux › (un bail) › onglet « Échéances »   |
| Page publique du lien  | `/payer#<jeton>` puis `/payer/statut?paiement=<code>`    | (lien reçu par le locataire)              |
| Simulateur de paiement | `/api/payment-gateway/simulator/<code>` (page API)       | (redirection depuis « Payer maintenant ») |

**Prérequis.** Cas d'autres fichiers à avoir passés : `GL-01-…` (réglages financiers de l'agence A, un compte de trésorerie par moyen de paiement), `GL-02-…` (création et passage à « Actif » d'un bail par le formulaire « Nouveau bail »). Le contact locataire n'a pas besoin de portail pour ce fichier. Le paiement en ligne est en mode **simulateur** (aucun argent réel) ; l'envoi par e-mail part dans le puits SMTP local (lire le fichier `.eml`), l'envoi par WhatsApp est neutralisé.

**Date de référence.** Les montants de retard et les jours de retard ci-dessous sont calculés **au 03/11/2026**. Si la recette est jouée un autre jour, recalculer les jours de retard (date du jour moins date d'échéance) et décaler les cas qui parlent de « dans 2 jours » ; les montants des échéances ne changent pas.

**Conventions d'affichage.** Dans les tableaux la devise n'est pas répétée à chaque ligne : elle figure en pied (« Tous les montants sont en FCFA. »). Dans le détail d'une échéance le montant porte le symbole de la devise. Libellés de statut : `DRAFT` « Brouillon », `DUE` « À échoir » (dans le détail d'une échéance, l'étiquette dit « Échéance »), `PARTIAL` « Partiel », `PAID` « Payé », `OVERDUE` « En retard ». Une échéance dont la date est passée et qui n'est pas soldée s'affiche « En retard » même si elle est restée « Brouillon » en base (statut reclassé à l'affichage). Un partiel prime sur le retard : une échéance en retard à moitié payée s'affiche « Partiel ».

**Données créées par ce fichier.** Un locataire dédié aux échéances « REC-GL Locataire Échéances » (un seul bail, pour pouvoir lire son solde), un locataire « REC-GL Locataire Variantes » (tous les autres baux), et les baux ci-dessous, chacun sur un bien libre distinct « REC-GL Bien ECH-n ». Tous les baux sont créés par Baux › Nouveau bail puis passés à **Actif**. Mêmes réglages de pénalité partout : jours de grâce 5, mode « Pourcentage du solde », taux 2 (%), plafond vide.

| Bail (numéro)   | Locataire | Début → fin             | Fréquence   | Jour | Loyer     | Charges | Total par échéance |
| --------------- | --------- | ----------------------- | ----------- | ---- | --------- | ------- | ------------------ |
| REC-GL-ECH-MENS | Échéances | 01/07/2026 → 30/06/2027 | Mensuel     | 5    | 150 000   | 10 000  | 160 000            |
| REC-GL-ECH-TRIM | Variantes | 01/09/2026 → 31/08/2027 | Trimestriel | 10   | 450 000   | 30 000  | 480 000            |
| REC-GL-ECH-SEM  | Variantes | 01/07/2026 → 30/06/2027 | Semestriel  | 5    | 900 000   | 60 000  | 960 000            |
| REC-GL-ECH-ANN  | Variantes | 01/07/2026 → 30/06/2027 | Annuel      | 5    | 1 800 000 | 0       | 1 800 000          |
| REC-GL-ECH-J31  | Variantes | 01/01/2027 → 31/05/2027 | Mensuel     | 31   | 100 000   | 0       | 100 000            |
| REC-GL-ECH-BIS  | Variantes | 01/01/2028 → 31/03/2028 | Mensuel     | 30   | 100 000   | 0       | 100 000            |
| REC-GL-ECH-J29  | Variantes | 01/07/2026 → 30/06/2027 | Mensuel     | 29   | 100 000   | 0       | 100 000            |
| REC-GL-ECH-MID  | Variantes | 15/10/2026 → 14/01/2027 | Mensuel     | 5    | 150 000   | 0       | 150 000            |
| REC-GL-ECH-IND  | Variantes | 01/07/2026, sans fin    | Mensuel     | 5    | 100 000   | 0       | 100 000            |
| REC-GL-ECH-1AN  | Variantes | 01/07/2026 → 01/07/2027 | Mensuel     | 5    | 100 000   | 0       | 100 000            |
| REC-GL-ECH-D31  | Variantes | 31/01/2027 → 31/12/2027 | Mensuel     | 5    | 100 000   | 0       | 100 000            |
| REC-GL-ECH-T31  | Variantes | 31/01/2027 → 31/12/2027 | Trimestriel | 5    | 300 000   | 0       | 300 000            |
| REC-GL-ECH-FIN  | Variantes | 01/01/2026 → 31/12/2026 | Mensuel     | 5    | 100 000   | 0       | 100 000            |
| REC-GL-ECH-FIN2 | Variantes | 01/01/2026 → 31/12/2026 | Mensuel     | 5    | 100 000   | 0       | 100 000            |

Jours de retard au 03/11/2026 pour REC-GL-ECH-MENS (échéances du 5 du mois) : juillet 121 j, août 90 j, septembre 59 j, octobre 29 j ; novembre n'est pas encore échu (5/11).

---

## A. Préparation

### GL-05-001 — Créer et activer les 14 baux de recette des échéances

- **Rôle** : ADMIN_A
- **Préconditions** : un bien libre « REC-GL Bien ECH-1 » à « REC-GL Bien ECH-14 » et les deux locataires ci-dessus existent (cas `GL-01-…`, `GL-02-…`). Aucun de ces baux n'a d'échéance.
- **Données** : tableau de la section « Données créées » ; pénalités : grâce 5, « Pourcentage du solde », taux 2.
- **Étapes** :
  1. Menu **Baux** → bouton de création du bail (formulaire en étapes, cas `GL-02-…` pour le détail des champs).
  2. Saisir pour chaque ligne du tableau : bien, locataire principal, début, fin (vide pour REC-GL-ECH-IND), « Fréquence de facturation », « Jour d'échéance (1-31) », « Montant du loyer », « Charges de service », « Jours de grâce pour pénalités » = 5, « Mode de pénalité » = « Pourcentage du solde », « Taux de pénalité (%) » = 2.
  3. Enregistrer, ouvrir le bail, passer son statut à « Actif ».
- **Attendu** :
  - 14 baux visibles dans Baux avec le statut « Actif » et les numéros REC-GL-ECH-… (numéro saisi à la main).
  - Aucun appel en erreur (4xx/5xx) dans l'onglet réseau.
- **Gravité si échec** : Bloquant

### GL-05-002 — Onglet « Échéances » d'un bail sans échéance : état vide et actions

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-001 ; bail REC-GL-ECH-MENS sans échéance.
- **Données** : bail REC-GL-ECH-MENS.
- **Étapes** :
  1. Menu **Baux** › ouvrir REC-GL-ECH-MENS › onglet **Échéances** (actif par défaut).
  2. Lire le titre, le texte vide et les boutons.
  3. Cliquer le bouton **⋮** (« Autres actions »).
- **Attendu** :
  - Titre « Échéances », pas de sous-titre de compteur.
  - Texte « Aucune échéance pour ce bail. Générez-les depuis l’action ci-dessus. »
  - Bouton principal « Générer les échéances » ; menu « Autres actions » avec « Recalculer les statuts et pénalités » et « Supprimer toutes les échéances » (en rouge).
  - Sur la liste globale (Encaisser › Échéances) ces trois actions n'existent pas (elles ne sont proposées que dans l'onglet d'un bail).
- **Gravité si échec** : Mineur

---

## B. Génération des échéances

### GL-05-003 — Générer les échéances d'un bail mensuel (12 mois)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-002.
- **Données** : REC-GL-ECH-MENS (01/07/2026 → 30/06/2027, jour 5, 160 000).
- **Étapes** :
  1. Onglet **Échéances** du bail › bouton **Générer les échéances**.
  2. Attendre le message, lire le tableau.
- **Attendu** :
  - Message « Échéances générées. » ; sous-titre « 12 échéances ».
  - 12 lignes, période `07/2026` à `06/2027`, dates d'échéance le 5 de chaque mois (`05/07/2026` … `05/06/2027`), Montant dû 160 000, Reste à payer 160 000.
  - Statut : juillet, août, septembre, octobre 2026 « En retard » (dates passées, statut reclassé à l'affichage) ; novembre 2026 à juin 2027 « Brouillon ».
  - Réseau : `POST /api/tenants/<tenantId>/rental/leases/<leaseId>/installments` → **201** ; le tableau est rechargé (`GET …/rental/installments?leaseId=…` → 200).
  - Les colonnes « Bail » et « Locataire » sont absentes dans l'onglet (valeurs répétées inutiles).
- **Gravité si échec** : Bloquant

### GL-05-004 — Générer un bail trimestriel

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-001.
- **Données** : REC-GL-ECH-TRIM (01/09/2026 → 31/08/2027, jour 10, 480 000).
- **Étapes** :
  1. Ouvrir REC-GL-ECH-TRIM › onglet Échéances › « Générer les échéances ».
- **Attendu** :
  - 4 échéances : `09/2026` (échéance `10/09/2026`, en retard), `12/2026` (`10/12/2026`), `03/2027` (`10/03/2027`), `06/2027` (`10/06/2027`) ; chacune 480 000.
  - Aucune échéance pour octobre, novembre, janvier, février, avril, mai.
- **Gravité si échec** : Bloquant

### GL-05-005 — Générer un bail semestriel

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-001.
- **Données** : REC-GL-ECH-SEM (01/07/2026 → 30/06/2027, jour 5, 960 000).
- **Étapes** :
  1. Ouvrir REC-GL-ECH-SEM › Échéances › « Générer les échéances ».
- **Attendu** :
  - 2 échéances : `07/2026` (échéance `05/07/2026`, « En retard ») et `01/2027` (`05/01/2027`, « Brouillon »), 960 000 chacune.
- **Gravité si échec** : Bloquant

### GL-05-006 — Générer un bail annuel

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-001.
- **Données** : REC-GL-ECH-ANN (01/07/2026 → 30/06/2027, jour 5, 1 800 000).
- **Étapes** :
  1. Ouvrir REC-GL-ECH-ANN › Échéances › « Générer les échéances ».
- **Attendu** :
  - 1 seule échéance : `07/2026`, échéance `05/07/2026`, 1 800 000, statut « En retard ». Sous-titre « 1 échéance » (singulier).
- **Gravité si échec** : Bloquant

### GL-05-007 — Jour d'échéance 31 : repli sur le dernier jour du mois

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-001.
- **Données** : REC-GL-ECH-J31 (01/01/2027 → 31/05/2027, jour 31, 100 000).
- **Étapes** :
  1. Ouvrir REC-GL-ECH-J31 › Échéances › « Générer les échéances ».
  2. Lire la colonne « Échéance ».
- **Attendu** :
  - 5 échéances : `01/2027` → `31/01/2027` ; `02/2027` → `28/02/2027` ; `03/2027` → `31/03/2027` ; `04/2027` → `30/04/2027` ; `05/2027` → `31/05/2027`.
  - Aucune date débordant sur le mois suivant (pas de 03/03/2027).
- **Gravité si échec** : Majeur

### GL-05-008 — Février d'une année bissextile (jour 30)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-001.
- **Données** : REC-GL-ECH-BIS (01/01/2028 → 31/03/2028, jour 30, 100 000).
- **Étapes** :
  1. Ouvrir REC-GL-ECH-BIS › Échéances › « Générer les échéances ».
- **Attendu** :
  - 3 échéances : `01/2028` → `30/01/2028` ; `02/2028` → `29/02/2028` (année bissextile) ; `03/2028` → `30/03/2028`.
- **Gravité si échec** : Majeur

### GL-05-009 — Jour 29 en février d'une année non bissextile

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-001.
- **Données** : REC-GL-ECH-J29 (01/07/2026 → 30/06/2027, jour 29, 100 000).
- **Étapes** :
  1. Ouvrir REC-GL-ECH-J29 › Échéances › « Générer les échéances ».
- **Attendu** :
  - 12 échéances ; `02/2027` → `28/02/2027` ; toutes les autres le 29 (`29/07/2026`, `29/08/2026`, …, `29/06/2027`).
- **Gravité si échec** : Majeur

### GL-05-010 — Bail qui commence en milieu de mois, jour d'échéance déjà passé

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-001.
- **Données** : REC-GL-ECH-MID (début 15/10/2026, fin 14/01/2027, jour 5, 150 000).
- **Étapes** :
  1. Ouvrir REC-GL-ECH-MID › Échéances › « Générer les échéances ».
  2. Lire périodes et dates d'échéance.
- **Attendu** (règle du code : la première échéance ne peut pas précéder le début du bail) :
  - 4 échéances : `10/2026` → `05/11/2026` ; `11/2026` → `05/11/2026` ; `12/2026` → `05/12/2026` ; `01/2027` → `05/01/2027`.
  - **Point à confirmer par le métier** : deux échéances (octobre et novembre) tombent le même jour, 05/11/2026. Noter comme observation si le métier juge cela anormal.
- **Gravité si échec** : Mineur

### GL-05-011 — Aucun prorata sur la première période

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-010.
- **Données** : REC-GL-ECH-MID, échéance `10/2026` (période du 15 au 31 octobre).
- **Étapes** :
  1. Lire « Montant dû » de l'échéance `10/2026`.
- **Attendu** :
  - Le montant est **150 000** (loyer plein), non proratisé (≈ 85 000 pour 17 jours sur 31). Le système n'applique pas de prorata à la génération : consigner « pas de prorata » comme comportement constaté, à valider par le métier.
- **Gravité si échec** : Mineur

### GL-05-012 — Bail sans date de fin : nombre d'échéances générées

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-001.
- **Données** : REC-GL-ECH-IND (début 01/07/2026, **fin vide**, jour 5, 100 000).
- **Étapes** :
  1. Ouvrir REC-GL-ECH-IND › Échéances › « Générer les échéances ».
  2. Compter les lignes.
- **Attendu** (inventaire : « 12 mois par défaut si bail à durée indéterminée ») :
  - **12 échéances**, `07/2026` à `06/2027`.
  - Anomalie probable à vérifier : le code génère jusqu'à la date de début + 1 an **inclus**, soit **13 échéances** (`07/2026` à `07/2027`). Si 13 lignes apparaissent, consigner l'écart avec la documentation.
- **Gravité si échec** : Majeur

### GL-05-013 — Bail d'un an dont la fin tombe le lendemain du dernier mois

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-001.
- **Données** : REC-GL-ECH-1AN (01/07/2026 → **01/07/2027**, mensuel, jour 5, 100 000).
- **Étapes** :
  1. Ouvrir REC-GL-ECH-1AN › Échéances › « Générer les échéances ».
- **Attendu** :
  - Une période commence tant que sa date de début est ≤ la date de fin : **13 échéances** (`07/2026` à `07/2027`), la 13ᵉ (`07/2027`, échéance `05/07/2027`) commençant le jour de fin du bail. Cohérent avec la règle du code ; à signaler au métier si un bail de 12 mois doit en produire 12.
- **Gravité si échec** : Mineur

### GL-05-014 — Bail commençant le 31 janvier (mensuel) : aucune échéance ne doit manquer

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-001.
- **Données** : REC-GL-ECH-D31 (31/01/2027 → 31/12/2027, mensuel, jour 5, 100 000).
- **Étapes** :
  1. Ouvrir REC-GL-ECH-D31 › Échéances › « Générer les échéances ».
  2. Lister les périodes obtenues.
- **Attendu** :
  - 12 échéances, `01/2027` à `12/2027` (la première échéance de janvier tombe le `05/02/2027`, jour 5 déjà passé le 31/01).
  - **Anomalie probable** (calcul de fin de période dans `generateInstallments`, `rental-installment-service.ts` ~l. 340-365) : la fin de la première période est calculée un mois trop tard quand le jour de début (29, 30, 31) n'existe pas le mois suivant ; la période `02/2027` est alors **sautée** et seules **11 échéances** sont créées. Une échéance manquante signifie un loyer jamais facturé.
- **Gravité si échec** : Bloquant

### GL-05-015 — Bail commençant le 31 janvier (trimestriel) : quatre échéances attendues

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-001.
- **Données** : REC-GL-ECH-T31 (31/01/2027 → 31/12/2027, trimestriel, jour 5, 300 000).
- **Étapes** :
  1. Ouvrir REC-GL-ECH-T31 › Échéances › « Générer les échéances ».
- **Attendu** :
  - 4 échéances : `01/2027`, `04/2027`, `07/2027`, `10/2027`, chacune 300 000.
  - **Anomalie probable** (même cause que GL-05-014) : seule l'échéance `01/2027` est créée (les périodes suivantes tombent hors du cycle trimestriel et sont ignorées) ; on obtient **1 échéance au lieu de 4**.
- **Gravité si échec** : Bloquant

### GL-05-016 — Double clic sur « Générer les échéances » : pas de doublon

- **Rôle** : ADMIN_A
- **Préconditions** : un bail actif sans échéance (créer REC-GL-ECH-DBL, copie de REC-GL-ECH-MENS sur « REC-GL Bien ECH-15 », ou utiliser un bail neuf).
- **Données** : REC-GL-ECH-DBL.
- **Étapes** :
  1. Onglet Échéances › double-cliquer très vite sur « Générer les échéances ».
  2. Attendre la fin du chargement, F5.
- **Attendu** :
  - Le bouton passe en chargement après le premier clic ; une seule série est créée (12 échéances, jamais 24).
  - Si deux requêtes partent, la seconde reçoit un refus « Des échéances existent déjà pour ce bail. Supprimez-les d'abord si vous souhaitez les régénérer. » (code 400 ; 409 serait plus juste) et n'ajoute rien. Unicité (bail, année, mois) respectée.
- **Gravité si échec** : Bloquant

### GL-05-017 — Régénérer alors que des échéances existent

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-003 (REC-GL-ECH-MENS a 12 échéances).
- **Données** : REC-GL-ECH-MENS.
- **Étapes** :
  1. Onglet Échéances › « Générer les échéances ».
- **Attendu** :
  - Toast d'erreur « Des échéances existent déjà pour ce bail. Supprimez-les d'abord si vous souhaitez les régénérer. » ; tableau inchangé (12 lignes).
  - Réseau : `POST …/installments` → 4xx (400 observé par le contrôleur ; 409 attendu).
- **Gravité si échec** : Majeur

### GL-05-018 — Génération refusée pour un bail terminé ou annulé

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-001 ; bail REC-GL-ECH-FIN2 sans échéance, passé au statut « Terminé » (statut final, irréversible).
- **Données** : REC-GL-ECH-FIN2.
- **Étapes** :
  1. Ouvrir REC-GL-ECH-FIN2 › Échéances › « Générer les échéances ».
- **Attendu** :
  - Toast « Impossible de générer des échéances pour un bail annulé ou terminé ». Aucune échéance créée.
  - Répéter avec un bail passé à « Annulé » : même refus.
- **Gravité si échec** : Majeur

### GL-05-019 — Isolation : l'administrateur d'une autre agence ne voit pas les échéances de A

- **Rôle** : ADMIN_B
- **Préconditions** : GL-05-003 ; relever `<tenantA>`, `<leaseId>` de REC-GL-ECH-MENS et `<installmentId>` d'une de ses échéances (consulter l'URL en étant ADMIN_A).
- **Données** : identifiants relevés.
- **Étapes** :
  1. Connecté en ADMIN_B, ouvrir `/tenant/<tenantB>/rental/installments/<installmentId de A>`.
  2. Ouvrir `/tenant/<tenantA>/rental/installments` et `/tenant/<tenantA>/rental/installments/<installmentId>`.
  3. Dans l'agence B, ouvrir Encaisser › Échéances et chercher « REC-GL ».
- **Attendu** :
  - Étape 1 : page d'erreur « Échéance non trouvée » (ou « Échéance non trouvée » dans l'alerte rouge), aucune donnée de A ; API `GET …/rental/installments/<id>` → **404**.
  - Étape 2 : accès refusé à l'agence A (403) ou redirection ; jamais de liste ni de détail de A.
  - Étape 3 : aucune échéance REC-GL dans la liste de B.
  - Aucune réponse réseau ne contient un nom, un montant ou un bail de A.
- **Gravité si échec** : Bloquant

### GL-05-020 — Droits : un collaborateur en lecture seule ne génère pas d'échéances

- **Rôle** : LECTEUR_A
- **Préconditions** : bail REC-GL-ECH-DBL sans échéance (voir GL-05-016, si déjà généré en utiliser un autre, ex. un bail neuf).
- **Données** : bail sans échéance.
- **Étapes** :
  1. Se connecter en LECTEUR_A › Baux › ouvrir le bail › onglet Échéances.
  2. Cliquer « Générer les échéances » (le bouton n'est pas masqué : l'écran ne teste pas le droit).
  3. Ouvrir « Autres actions » › « Supprimer toutes les échéances » puis tenter de confirmer.
- **Attendu** :
  - Chaque tentative aboutit à un refus **403** de l'API ; un message d'erreur s'affiche (toast), aucune échéance créée ni supprimée.
  - Observation (Mineur) : un bouton qui répond toujours 403 devrait être masqué ou désactivé, comme le font les écrans Paiements pour ce rôle.
  - En consultation, LECTEUR_A voit bien les échéances (liste et détail).
- **Gravité si échec** : Majeur

---

## C. Liste, filtres, détail

### GL-05-021 — Liste globale : colonnes, tri et compteur

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-003 à GL-05-015 ; l'agence A porte aussi l'historique du jeu de base (liste volumineuse).
- **Données** : aucune.
- **Étapes** :
  1. Menu **Encaisser › Échéances**.
  2. Lire l'en-tête, les colonnes, le pied et la pagination.
- **Attendu** :
  - Titre « Échéances », sous-titre « N échéances » (N = total de l'agence).
  - Colonnes : Bail (numéro + nom du bien), Locataire, Période (`MM/AAAA`), Échéance (date), Montant dû, Reste à payer, Statut, Actions.
  - Tri par date d'échéance croissante (les plus anciennes d'abord).
  - Actions : sur une ligne non soldée « Encaisser », « Paiement… » et (si éligible) « Envoyer un lien de paiement » ; sur une ligne soldée « Voir ».
  - Pied « Tous les montants sont en FCFA. » ; pagination par 50 (`1–50 sur N`), bouton « Exporter » (Excel, CSV, PDF).
- **Gravité si échec** : Majeur

### GL-05-022 — Filtre « Statut » = En retard / Partiel après un paiement partiel

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-003.
- **Données** : REC-GL-ECH-MENS, échéance `07/2026` ; paiement de 60 000 en espèces.
- **Étapes** :
  1. Onglet Échéances de REC-GL-ECH-MENS : sur la ligne `07/2026` cliquer **Paiement…**.
  2. Dans « Paiement · échéance 07/2026 du 05/07/2026 » : Méthode « Espèces », Montant `60000`, Date du règlement = aujourd'hui › « Enregistrer le paiement ».
  3. Sur la liste globale appliquer le filtre « Statut » = « En retard », lire les lignes de REC-GL-ECH-MENS ; puis « Partiel ».
- **Attendu** :
  - Message « Paiement enregistré. » ; la ligne `07/2026` : Montant dû 160 000, Reste à payer **100 000**, Statut **Partiel**.
  - Filtre « En retard » : les échéances `08/2026`, `09/2026`, `10/2026` de REC-GL-ECH-MENS y figurent, **pas** `07/2026`.
  - Filtre « Partiel » : `07/2026` y figure.
  - Réseau : `POST …/rental/payments` (201) puis `POST …/rental/payments/<id>/allocate` (200).
- **Gravité si échec** : Bloquant

### GL-05-023 — Filtre « Retard » = « En retard uniquement » (inclut les partiels échus)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-022.
- **Données** : REC-GL-ECH-MENS.
- **Étapes** :
  1. Liste globale › champ **Retard** › « En retard uniquement ».
  2. Comparer avec le filtre Statut « En retard » de GL-05-022.
- **Attendu** :
  - Le filtre « Retard » contient `07/2026` (Partiel mais échu) **et** `08/2026`, `09/2026`, `10/2026` ; il exclut `11/2026` et les suivantes.
  - Le filtre « Statut = En retard » n'avait pas `07/2026` : les deux filtres ne donnent pas le même ensemble (comportement voulu : un partiel prime sur le retard). Consigner la différence, ne pas la corriger.
- **Gravité si échec** : Mineur

### GL-05-024 — Filtre « Statut » = À échoir : vide avant la campagne de facturation

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-003 ; aucune campagne de facturation lancée pour novembre 2026.
- **Données** : REC-GL-ECH-MENS `11/2026` (« Brouillon »).
- **Étapes** :
  1. Liste globale › Statut = « À échoir ».
  2. Chercher REC-GL-ECH-MENS dans les lignes.
- **Attendu** :
  - Aucune échéance de REC-GL-ECH-MENS dans « À échoir » : une échéance générée reste « Brouillon » tant que la campagne du mois ne l'a pas émise. Le filtre « Brouillon » n'existe pas dans la liste (options : À échoir, Partiel, Payé, En retard).
  - Si aucune ligne ne ressort : message « Aucune échéance enregistrée. » avec le lien/bouton « Effacer les filtres ».
- **Gravité si échec** : Mineur

### GL-05-025 — Campagne de facturation du mois : les échéances de novembre passent « À échoir »

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-003 ; GL-05-024.
- **Données** : mois « novembre », année 2026.
- **Étapes** :
  1. Menu **Plus › Finance › Clients et propriétaires › Facturation et balances**, onglet **Facturation du mois**.
  2. Bouton **Lancer la facturation du mois** : Mois = novembre, Année = 2026 › **Lancer la campagne**.
  3. Lire le compte rendu, puis revenir à Encaisser › Échéances, filtre Statut = « À échoir ».
- **Attendu** :
  - Message « Campagne exécutée : N baux facturés, … » ; compte rendu avec « Baux facturés » incluant REC-GL-ECH-MENS (160 000) et « Baux exclus » avec leur motif.
  - L'échéance `11/2026` de REC-GL-ECH-MENS passe **« À échoir »** (échéance `05/11/2026`, dans 2 jours) ; elle apparaît dans le filtre « À échoir ».
  - Le mouvement « Loyer de novembre 2026 » apparaît sur le compte du locataire (cas `GL-09-…`).
  - Relancer la campagne ne crée aucun doublon (message de confirmation « Relancer la campagne … »).
- **Gravité si échec** : Majeur

### GL-05-026 — Filtre par locataire et combinaison de filtres

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-003, GL-05-004.
- **Données** : locataires « REC-GL Locataire Échéances » et « REC-GL Locataire Variantes ».
- **Étapes** :
  1. Liste globale › champ **Locataire** : taper « REC-GL » puis choisir « REC-GL Locataire Échéances ».
  2. Ajouter Statut = « En retard ».
  3. Lire le bouton de filtres (compteur) et cliquer **Effacer les filtres**.
- **Attendu** :
  - Après l'étape 1 : seules les 12 échéances de REC-GL-ECH-MENS ; sous-titre « 12 échéances ».
  - Après l'étape 2 : `08/2026`, `09/2026`, `10/2026` (3 lignes ; `07/2026` Partiel exclu si GL-05-022 est passé).
  - Compteur « Filtres (2) » sur petit écran ; « Effacer les filtres » ramène la liste complète et la page 1.
  - Le sélecteur ne propose que des locataires qui ont au moins un bail.
- **Gravité si échec** : Majeur

### GL-05-027 — F5 conserve filtres, tri et page

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-026.
- **Données** : filtres Locataire + Statut.
- **Étapes** :
  1. Appliquer Locataire = « REC-GL Locataire Échéances » et Statut = « En retard ».
  2. Lire l'URL (`?renterClientId=…&status=OVERDUE`), faire **F5**.
  3. Ouvrir une échéance soldée (« Voir ») puis revenir en arrière (navigateur).
- **Attendu** :
  - Après F5 les mêmes filtres et les mêmes lignes ; l'URL porte les paramètres.
  - Le retour arrière depuis le détail restaure la liste filtrée.
  - Copier l'URL dans un nouvel onglet reproduit la liste filtrée.
- **Gravité si échec** : Mineur

### GL-05-028 — Pagination par 50 et changement de taille de page

- **Rôle** : ADMIN_A
- **Préconditions** : la liste globale compte plus de 50 échéances (historique A + baux REC-GL).
- **Données** : aucune.
- **Étapes** :
  1. Liste globale : lire « 1–50 sur N ».
  2. Aller à la page 2 (`?page=2`), puis changer la taille de page.
  3. Appliquer un filtre alors qu'on est en page 2.
- **Attendu** :
  - Page 2 affichée avec les lignes suivantes, sans doublon ni trou avec la page 1.
  - Un changement de filtre remet la page à 1.
  - Le total « N » est identique au sous-titre.
- **Gravité si échec** : Mineur

### GL-05-029 — Absence de recherche texte, de filtre par bail et de filtre par période dans la liste globale

- **Rôle** : ADMIN_A
- **Préconditions** : liste globale ouverte.
- **Données** : aucune.
- **Étapes** :
  1. Chercher un champ de recherche libre, un sélecteur de bail et un sélecteur de mois/année sur Encaisser › Échéances.
  2. Ouvrir « Filtrer » (écran étroit) et lister les filtres.
- **Attendu** (constat, non testable en interface) :
  - Seuls trois filtres existent : Locataire, Statut, Retard. La recherche par texte et la période (mois/année) ne sont pas offertes à l'écran (l'API accepte `year`, `month`). Le filtre par bail se fait en ouvrant le bail (onglet Échéances).
  - Consigner comme « fonction absente » pour la couverture ; ne pas ouvrir d'anomalie sauf demande du métier.
- **Gravité si échec** : Cosmétique

### GL-05-030 — Statut en commun entre onglets d'un bail : clé d'URL partagée

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-003, un paiement existe sur REC-GL-ECH-MENS (GL-05-022).
- **Données** : REC-GL-ECH-MENS.
- **Étapes** :
  1. Détail du bail › onglet Échéances › filtre **Statut** = « En retard » (l'URL passe à `?status=OVERDUE`).
  2. Cliquer l'onglet **Paiements** du même bail.
  3. Revenir à l'onglet Échéances et poser Statut = « Payé », puis ouvrir l'onglet Paiements.
- **Attendu** :
  - Les deux onglets lisent le même paramètre d'URL `status`, mais n'ont pas les mêmes valeurs. Attendu : l'onglet Paiements ne reprend pas le filtre de l'autre onglet.
  - **Anomalie probable** : l'onglet Paiements envoie `status=OVERDUE` à l'API, qui répond **400** (« Valeur non reconnue ») ; l'onglet affiche « Impossible de charger les paiements. » (et symétriquement `status=SUCCESS` casse l'onglet Échéances).
- **Gravité si échec** : Majeur

### GL-05-031 — Détail d'une échéance soldée ou en retard

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-022 (échéance `07/2026` partielle).
- **Données** : REC-GL-ECH-MENS, échéance `07/2026`.
- **Étapes** :
  1. Ouvrir le détail : sur la liste globale cliquer **Voir** sur une ligne soldée, ou (échéance non soldée) ouvrir `/tenant/<tenantId>/rental/installments/<installmentId>` (identifiant relevé dans l'onglet réseau de la liste).
  2. Lire les deux cartes, le bandeau de statut et le bouton **Retour**.
- **Attendu** :
  - Titre « Échéance 7/2026 », sous-titre « Détails de l'échéance », étiquette de statut « Partiel ».
  - Carte « Informations financières » : Loyer 150 000, Charges de service 10 000, Autres frais 0, Pénalités 0, Total dû 160 000, Montant Payé 60 000, Reste à payer 100 000 (en rouge tant que > 0).
  - Carte « Informations » : Période 7/2026, Date d'échéance 05/07/2026, Statut, Devise FCFA, Date de création, Dernière mise à jour (pas de « Date de paiement » tant que non soldée).
  - Section « Lien de paiement Mobile Money » avec le tableau « Aucun lien de paiement. ».
  - Le bouton « Retour » ramène au **bail**, pas à la liste des échéances.
  - Observation : le statut `DUE` s'écrit « Échéance » dans cette page et « À échoir » dans la liste (incohérence de libellé, Cosmétique).
- **Gravité si échec** : Majeur

### GL-05-032 — Accès au détail depuis la liste sur ordinateur : lignes non soldées

- **Rôle** : ADMIN_A
- **Préconditions** : fenêtre de largeur ≥ 992 px ; GL-05-022.
- **Données** : ligne `08/2026` de REC-GL-ECH-MENS (non soldée).
- **Étapes** :
  1. Sur la liste globale, chercher un lien/bouton pour ouvrir le détail de `08/2026` (clic sur la ligne, sur la période, bouton « Voir »).
- **Attendu** :
  - Sur une ligne non soldée seuls « Encaisser », « Paiement… » et « Envoyer un lien de paiement » existent ; il n'y a pas de bouton « Voir » ni de ligne cliquable : le détail (et donc la liste/révocation des liens de paiement) n'est atteignable que par l'URL ou, sur mobile, par la carte.
  - À consigner comme défaut d'ergonomie (Majeur) : on ne peut pas révoquer un lien de paiement d'une échéance impayée depuis la liste sur ordinateur.
- **Gravité si échec** : Majeur

### GL-05-033 — Détail d'une échéance : identifiant inexistant ou mal formé

- **Rôle** : ADMIN_A
- **Préconditions** : connecté.
- **Données** : `/tenant/<tenantId>/rental/installments/00000000-0000-0000-0000-000000000000` puis `/tenant/<tenantId>/rental/installments/abc`.
- **Étapes** :
  1. Ouvrir chaque URL.
  2. Regarder la réponse API et le message affiché.
- **Attendu** :
  - Identifiant bien formé mais inconnu : alerte « Échéance non trouvée », API **404**.
  - Identifiant mal formé (`abc`) : refus propre (400 ou 404) avec message neutre.
  - **Anomalie probable** : le contrôleur renvoie **500** avec le texte brut de l'erreur de base de données (`error.message`) pour un identifiant non UUID, ce qui expose des détails techniques. Consigner le code et le texte exacts.
- **Gravité si échec** : Majeur

### GL-05-034 — Affichage mobile de la liste (cartes)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-003 ; largeur 375 px.
- **Données** : REC-GL-ECH-MENS.
- **Étapes** :
  1. Réduire la fenêtre à 375 px (ou émulation mobile), ouvrir Encaisser › Échéances.
  2. Lire une carte non soldée et une carte soldée ; ouvrir le menu « Plus d'actions » de la carte.
- **Attendu** :
  - Les lignes deviennent des cartes « Échéance MM/AAAA » avec sous-titre « <bien> · <locataire> — à payer le <date> ».
  - Le reste à payer est mis en avant ; champs « Montant dû », « Déjà payé », « Pénalités » (si > 0).
  - Carte non soldée : bouton **Encaisser** et menu « Paiement détaillé… » / « Envoyer un lien de paiement » ; carte soldée : aucune action (le reste à payer disparaît).
  - Toucher la carte ouvre le détail de l'échéance.
  - Pas de défilement horizontal de la page.
- **Gravité si échec** : Mineur

---

## D. Encaisser depuis la liste (renvoi au fichier 06)

### GL-05-035 — « Encaisser » : confirmation avant écriture

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-003 ; échéance `08/2026` de REC-GL-ECH-MENS non soldée.
- **Données** : REC-GL-ECH-MENS `08/2026`, reste 160 000.
- **Étapes** :
  1. Liste globale (ou onglet du bail) › ligne `08/2026` › **Encaisser**.
  2. Lire la fenêtre de confirmation puis cliquer **Annuler**.
  3. Vérifier qu'aucun paiement n'a été créé (Encaisser › Paiements).
- **Attendu** :
  - Fenêtre « Encaisser 160 000 FCFA en espèces ? » avec « Locataire : REC-GL Locataire Échéances », « Échéance : 08/2026 — REC-GL-ECH-MENS », « Mode de paiement : Espèces » ; boutons « Confirmer l'encaissement » / « Annuler ».
  - Après « Annuler » : aucune écriture, aucun paiement créé, l'échéance garde son statut.
- **Gravité si échec** : Majeur

### GL-05-036 — « Encaisser » confirmé, double clic sur « Confirmer l'encaissement »

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-035.
- **Données** : REC-GL-ECH-MENS `08/2026`.
- **Étapes** :
  1. Cliquer **Encaisser** › double-cliquer très vite sur **Confirmer l'encaissement**.
  2. Attendre, ouvrir Encaisser › Paiements, filtrer sur le bail.
- **Attendu** :
  - Message « Encaissement enregistré. » ; l'échéance `08/2026` devient **Payé** (reste 0, bouton « Voir » seul).
  - **Un seul** paiement de 160 000 en espèces apparaît (jamais deux) ; la clé d'idempotence est liée à l'échéance.
  - Le bouton « Encaisser » de la ligne est en chargement pendant l'écriture.
  - Cliquer à nouveau « Encaisser » sur la ligne soldée n'est plus possible (plus de bouton). Les suites (allocation, comptes) sont détaillées dans `GL-06-…`.
- **Gravité si échec** : Bloquant

### GL-05-037 — Paiement partiel puis complément depuis la liste

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-022 (`07/2026` : payé 60 000, reste 100 000).
- **Données** : REC-GL-ECH-MENS `07/2026`.
- **Étapes** :
  1. Ligne `07/2026` › **Encaisser** (le montant proposé est le reste dû) › **Confirmer l'encaissement**.
- **Attendu** :
  - La fenêtre annonce « Encaisser 100 000 FCFA en espèces ? » ; après confirmation l'échéance est **Payé** : payé 160 000, reste 0.
  - Deux paiements pour cette échéance (60 000 et 100 000) dans Encaisser › Paiements, tous deux « Réussi ».
- **Gravité si échec** : Bloquant

---

## E. Recalcul des statuts

### GL-05-038 — « Recalculer les statuts et pénalités » (un bail)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-003 ; GL-05-022 ; pas de paiement supplémentaire sur `09/2026` et `10/2026`. Pour que les chiffres ci-dessous soient exacts, ne pas avoir passé GL-05-037 (échéance `07/2026` encore à 100 000 de reste) ; sinon recalculer avec `07/2026` soldée (pénalité 0).
- **Données** : REC-GL-ECH-MENS ; pénalité 2 % du solde, grâce 5 j.
- **Étapes** :
  1. Onglet Échéances de REC-GL-ECH-MENS › **⋮ Autres actions** › « Recalculer les statuts et pénalités ».
  2. Attendre le message, relire le tableau, puis ouvrir l'onglet **Pénalités** du bail.
- **Attendu** :
  - Message « Statuts et pénalités recalculés. ».
  - Pénalités créées sur `07/2026` (2 % de 100 000 = **2 000**), `08/2026`, `09/2026`, `10/2026` (2 % de 160 000 = **3 200** chacune), soit **11 600** au total ; le Montant dû de ces échéances devient 162 000 / 163 200 / 163 200 / 163 200 ; le Reste à payer 102 000 / 163 200 / 163 200 / 163 200.
  - Statuts : `07/2026` Partiel ; `08/2026`, `09/2026`, `10/2026` « En retard » (désormais enregistrés en base).
  - Les échéances `11/2026` et suivantes restent « Brouillon » ou « À échoir » (pas de pénalité).
  - Le compte du locataire « REC-GL Locataire Échéances » enregistre les loyers `08` à `10/2026` et les pénalités (vérifié en `GL-09-…`) : solde = 4 × 160 000 + 11 600 − 60 000 = **591 600**.
  - Réseau : `POST …/leases/<id>/installments/recalculate` (200) puis `POST …/rental/penalties/calculate` (200).
  - **Effet de bord à noter** : l'écran lance aussi le calcul des pénalités **pour toute l'agence** (tous les baux en retard), pas seulement ce bail.
- **Gravité si échec** : Bloquant

### GL-05-039 — Recalcul répété : idempotent

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-038.
- **Données** : REC-GL-ECH-MENS.
- **Étapes** :
  1. Relancer « Recalculer les statuts et pénalités » deux fois de suite.
  2. Comparer montants, nombre de pénalités et solde du locataire avant/après.
- **Attendu** :
  - Aucune pénalité en double (4 pénalités sur le bail, comme avant) ; montants dus et soldes identiques.
  - Messages de succès à chaque fois.
- **Gravité si échec** : Bloquant

### GL-05-040 — Recalcul sans échéance ou sur un bail introuvable

- **Rôle** : ADMIN_A
- **Préconditions** : bail sans échéance (REC-GL-ECH-FIN2 est terminé : utiliser un autre bail sans échéance, ex. une copie de REC-GL-ECH-MENS vide).
- **Données** : bail sans échéance.
- **Étapes** :
  1. Onglet Échéances › « Recalculer les statuts et pénalités ».
- **Attendu** :
  - Succès sans effet (« Statuts et pénalités recalculés. ») ; tableau toujours vide ; aucun message d'erreur.
- **Gravité si échec** : Mineur

---

## F. Suppression de toutes les échéances

### GL-05-041 — Supprimer toutes les échéances d'un bail sans paiement

- **Rôle** : ADMIN_A
- **Préconditions** : bail REC-GL-ECH-J31 avec 5 échéances et **aucun paiement** (GL-05-007).
- **Données** : REC-GL-ECH-J31.
- **Étapes** :
  1. Onglet Échéances › **⋮ Autres actions** › « Supprimer toutes les échéances ».
  2. Lire la confirmation, cliquer **Supprimer**.
  3. Cliquer « Générer les échéances » à nouveau.
- **Attendu** :
  - Confirmation « Supprimer toutes les échéances de ce bail ? » / « Cette action est irréversible. » avec les boutons « Supprimer » (rouge) et « Annuler ».
  - Après confirmation : message « Échéances supprimées. », tableau vide (« Aucune échéance pour ce bail… »).
  - La nouvelle génération recrée les 5 mêmes échéances.
  - Réseau : `DELETE …/leases/<id>/installments` → 200 `{ deletedCount: 5 }`.
- **Gravité si échec** : Majeur

### GL-05-042 — Annulation de la confirmation de suppression

- **Rôle** : ADMIN_A
- **Préconditions** : bail avec échéances (REC-GL-ECH-BIS, GL-05-008).
- **Données** : REC-GL-ECH-BIS.
- **Étapes** :
  1. « Supprimer toutes les échéances » › **Annuler**.
- **Attendu** :
  - Aucune requête `DELETE` ; les 3 échéances restent.
- **Gravité si échec** : Majeur

### GL-05-043 — Suppression refusée quand un paiement est affecté

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-036 (REC-GL-ECH-MENS a des paiements affectés).
- **Données** : REC-GL-ECH-MENS.
- **Étapes** :
  1. « Supprimer toutes les échéances » › **Supprimer**.
- **Attendu** :
  - Toast d'erreur « Impossible de supprimer les échéances : certaines échéances ont des paiements alloués. Supprimez d'abord les paiements. » ; les 12 échéances et les paiements restent intacts.
  - Réseau : `DELETE` → 4xx (400 observé).
- **Gravité si échec** : Bloquant

### GL-05-044 — Suppression refusée pour un bail terminé depuis moins de 30 jours

- **Rôle** : ADMIN_A
- **Préconditions** : bail REC-GL-ECH-FIN : 12 échéances générées puis statut « Terminé » (fin du bail 31/12/2026, donc encore dans moins de 30 jours de la fin).
- **Données** : REC-GL-ECH-FIN.
- **Étapes** :
  1. Générer les échéances de REC-GL-ECH-FIN (bail actif), puis passer le bail à « Terminé ».
  2. Onglet Échéances › « Supprimer toutes les échéances » › Supprimer.
- **Attendu** :
  - Toast « Impossible de supprimer les échéances d'un bail récemment terminé. Attendez 30 jours après la fin du bail. » ; échéances conservées.
- **Gravité si échec** : Majeur

### GL-05-045 — Suppression : le compte du locataire est contre-passé

- **Rôle** : ADMIN_A
- **Préconditions** : bail REC-GL-ECH-SEM (2 échéances, GL-05-005) dont les échéances `07/2026` ont été passées « En retard » en base (lancer « Recalculer les statuts et pénalités » avant) et **sans paiement**.
- **Données** : REC-GL-ECH-SEM, locataire « REC-GL Locataire Variantes ».
- **Étapes** :
  1. Relever le solde du locataire dans Finance › Facturation et balances › Balance clients (ligne « REC-GL Locataire Variantes »).
  2. Supprimer toutes les échéances du bail.
  3. Relire le solde et le relevé (« Voir le relevé »).
- **Attendu** :
  - Le solde baisse de 960 000 (loyer `07/2026`) + la pénalité éventuelle (2 % de 960 000 = 19 200 si calculée) ; le relevé montre les lignes « Annulation du loyer de juillet 2026 » (nature « Annulation ») qui contre-passent le loyer et la pénalité.
  - Facturé et Réglé restent cohérents (solde = Facturé − Réglé).
- **Gravité si échec** : Bloquant

---

## G. Passage automatique en retard (tâche de 02:00)

### GL-05-046 — Effet du passage en retard sur des échéances passées (sans attendre 02:00)

- **Rôle** : ADMIN_A
- **Préconditions** : bail REC-GL-ECH-J29 avec échéances générées (GL-05-009), **sans** « Recalculer » ni calcul de pénalités ; les échéances du 29/07 au 29/10/2026 sont échues.
- **Données** : REC-GL-ECH-J29.
- **Étapes** :
  1. Liste globale › Statut = « En retard » : repérer les lignes de REC-GL-ECH-J29.
  2. Ouvrir le détail d'une de ces échéances (identifiant dans l'onglet réseau).
  3. Ouvrir Finance › Facturation et balances › Balance âgée et relever le locataire « REC-GL Locataire Variantes ».
  4. Cliquer « Recalculer les statuts et pénalités » sur le bail, puis relire la Balance âgée.
- **Attendu** :
  - La liste et le détail affichent déjà « En retard » pour les 4 échéances échues (statut reclassé à l'affichage), alors qu'elles sont encore « Brouillon » en base.
  - Avant le recalcul, la Balance âgée **n'inclut pas** ces échéances (les Brouillon sont ignorés) ; après le recalcul elles apparaissent dans les tranches « > 90 jours » (29/07 : 97 j), « 60 à 90 jours » (29/08 : 66 j), « 30 à 60 jours » (29/09 : 35 j), « < 30 jours » (29/10 : 5 j).
  - Consigner l'écart de cohérence : le tableau de bord (Impayés) compte ces échéances dès l'affichage, la Balance âgée seulement après la bascule en base (tâche de 02:00 ou recalcul). À signaler si le métier l'attend identique.
  - La tâche automatique n'est pas déclenchable depuis l'interface : sa vérification se limite à constater, le lendemain de la recette, que les échéances encore « Brouillon » dont la date est passée sont devenues « En retard » en base (le nombre de pénalités créées pendant la nuit s'ajoute aux pénalités existantes).
- **Gravité si échec** : Majeur

---

## H. Liens de paiement Mobile Money

### GL-05-047 — Ouvrir la fenêtre « Lien de paiement » d'une échéance échue

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-025 (campagne de novembre faite) ; bail REC-GL-ECH-MENS **Actif**, échéance `09/2026` non soldée (en retard).
- **Données** : REC-GL-ECH-MENS `09/2026`.
- **Étapes** :
  1. Liste globale (ou onglet du bail) › ligne `09/2026` › **Envoyer un lien de paiement**.
  2. Lire le titre, les options et le champ de durée.
- **Attendu** :
  - Fenêtre « Lien de paiement · échéance 09/2026 » ; texte « Le locataire paie le reste dû par Mobile Money. Le montant est recalculé au moment du paiement et n’apparaît pas dans le lien. »
  - Options « Envoyer au locataire (WhatsApp ou e-mail) » (sélectionnée) et « Copier le lien » ; « Durée de validité (jours) » = 7 (entre 1 et 30).
  - Boutons « Annuler » et « Envoyer le lien ».
- **Gravité si échec** : Majeur

### GL-05-048 — Copier le lien : l'adresse s'affiche une seule fois

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-047.
- **Données** : REC-GL-ECH-MENS `09/2026`, durée 7 jours.
- **Étapes** :
  1. Choisir « Copier le lien » (le bouton devient « Créer le lien ») › **Créer le lien**.
  2. Lire l'avertissement, cliquer **Copier**, coller dans un champ de texte.
  3. Cliquer **Fermer**, rouvrir la fenêtre et chercher l'adresse.
- **Attendu** :
  - Alerte « Ce lien ne sera plus affiché après la fermeture de cette fenêtre. » ; champ en lecture seule avec une adresse `…/payer#<jeton>` ; texte « Montant dû : 163 200 FCFA — expire le <date> » (reste dû pénalité comprise si une pénalité a été calculée, sinon 160 000).
  - Message « Lien de paiement copié dans le presse-papiers. » (ou « Copie impossible : sélectionnez le lien et copiez-le manuellement. »).
  - Après fermeture le jeton n'est plus affiché nulle part (ni liste, ni réseau) ; la liste ne montre que dates, consultations, statut.
  - Réseau : `POST …/installments/<id>/payment-link` → **201** `{ linkId, url, expiresAt, amountDue }`.
- **Gravité si échec** : Majeur

### GL-05-049 — Liste des liens d'une échéance

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-048.
- **Données** : REC-GL-ECH-MENS `09/2026`.
- **Étapes** :
  1. Ouvrir le détail de l'échéance (URL `/tenant/<tenantId>/rental/installments/<installmentId>`).
  2. Lire le tableau de la section « Lien de paiement Mobile Money ».
- **Attendu** :
  - Une ligne : Créé le (date et heure), Expire le (création + 7 jours), Consultations 0, Dernière consultation « - », Statut « Actif », Paiement « Aucun paiement », bouton **Révoquer**.
  - Aucune adresse ni jeton visible. Réseau : `GET …/payment-links` → 200.
- **Gravité si échec** : Majeur

### GL-05-050 — Page publique du lien : lecture et compteur de consultations

- **Rôle** : PUBLIC
- **Préconditions** : GL-05-048 (adresse du lien copiée).
- **Données** : adresse `…/payer#<jeton>`.
- **Étapes** :
  1. Dans une fenêtre sans session (navigation privée), ouvrir l'adresse.
  2. Lire la page ; recharger (F5) une fois.
  3. Revenir (ADMIN_A) sur le détail de l'échéance et lire « Consultations ».
- **Attendu** :
  - Page « Paiement du loyer — 09/2026 » avec, en mode simulateur, l'alerte « Mode test » / « Ce paiement est simulé : aucun argent ne sera débité. » ; période, échéance (`05/09/2026`), « Montant dû » (reste dû recalculé côté serveur), « Moyens de paiement » (Wave, Orange Money, MTN Money, Moov Money), bouton **Payer maintenant**, mention « Ce lien expire le <date>. »
  - Aucun nom, e-mail ni téléphone du locataire ni du propriétaire n'apparaît ; titre de l'onglet « Paiement du loyer » ; balise `noindex, nofollow`.
  - Le jeton est dans le fragment `#…` : l'API reçoit un `POST /api/public/secure-links/installment-payment` avec le jeton **dans le corps**, jamais dans l'URL.
  - « Consultations » = 2 après deux ouvertures ; « Dernière consultation » renseignée.
- **Gravité si échec** : Bloquant

### GL-05-051 — Payer par le lien (simulateur) : réussite

- **Rôle** : PUBLIC
- **Préconditions** : GL-05-050.
- **Données** : reste dû affiché sur la page.
- **Étapes** :
  1. Sur `/payer#<jeton>` cliquer **Payer maintenant** (redirection vers la page du simulateur).
  2. Sur la page du simulateur cliquer **Payer**.
  3. Sur `/payer/statut?paiement=<code>` attendre la mise à jour (page qui se rafraîchit toute seule).
  4. Retourner (ADMIN_A) sur Encaisser › Échéances et Paiements.
- **Attendu** :
  - Page de statut : d'abord « Paiement en cours de vérification » (« Cette page se met à jour toute seule. Ne la fermez pas. ») puis **« Paiement reçu »** / « Merci, votre loyer est réglé. »
  - Côté agence : un paiement Mobile Money de montant = reste dû, statut « Réussi », badge « En ligne » + « Réussi » + « Mode démonstration », affecté à l'échéance `09/2026` qui devient **Payé** (ou Partiel si le montant payé est inférieur au dû).
  - Le lien devient inopérant : le rouvrir affiche « Lien invalide ou expiré ».
  - Un second paiement du même lien est impossible.
- **Gravité si échec** : Bloquant

### GL-05-052 — Payer par le lien : échec et annulation côté simulateur

- **Rôle** : PUBLIC
- **Préconditions** : nouveau lien actif sur l'échéance `10/2026` de REC-GL-ECH-MENS (créé comme en GL-05-048).
- **Données** : lien neuf.
- **Étapes** :
  1. Ouvrir le lien › **Payer maintenant** › sur le simulateur cliquer **Solde insuffisant**.
  2. Observer la page de statut, puis rouvrir le lien et refaire **Payer maintenant** › **Annuler**.
- **Attendu** :
  - Statut « Le paiement a échoué » puis, après annulation, « Paiement annulé » (jamais « Paiement reçu »).
  - Côté agence : le paiement en ligne apparaît « Échoué » / « Annulé » avec l'étiquette « En ligne » ; l'échéance reste non soldée, aucune affectation.
  - Le lien reste utilisable pour une nouvelle tentative tant qu'il est actif et que le reste dû est positif.
- **Gravité si échec** : Majeur

### GL-05-053 — Envoyer le lien au locataire (e-mail) et motifs de non-envoi

- **Rôle** : ADMIN_A
- **Préconditions** : un locataire avec adresse e-mail et consentement (cas `GL-01-…`) ; événement « Lien de paiement du loyer » activé (Communication › Notifications email, `/tenant/<tenantId>/communication/email-notifications`) ; échéance `10/2026` non soldée.
- **Données** : REC-GL-ECH-MENS `10/2026`.
- **Étapes** :
  1. « Envoyer un lien de paiement » › option « Envoyer au locataire (WhatsApp ou e-mail) » › **Envoyer le lien**.
  2. Lire le message ; ouvrir le fichier `.eml` du puits SMTP.
  3. Répéter pour un locataire sans e-mail ni consentement (REC-GL-ECH-J29, locataire « Variantes » sans coordonnées).
- **Attendu** :
  - Message vert « Lien de paiement envoyé par e-mail. » (WhatsApp neutralisé en recette : « Lien de paiement envoyé par WhatsApp. » seulement si un canal WhatsApp éligible existe) ; le `.eml` contient une adresse `…/payer#<jeton>`, jamais dans l'objet.
  - Sans canal éligible : alerte orange « Aucun canal éligible : le locataire n’a ni numéro WhatsApp ni e-mail utilisable, ou n’a pas donné son consentement. » et **aucun lien conservé** (la liste des liens de l'échéance reste vide).
  - Événement désactivé : « Cet envoi est désactivé dans la configuration de l'agence. »
  - Réseau : envoi réussi → **201** `{ sent: true, channel }` ; non envoyé → **200** `{ sent: false, reason }`.
- **Gravité si échec** : Majeur

### GL-05-054 — Durée de validité : bornes 1 à 30 jours

- **Rôle** : ADMIN_A
- **Préconditions** : fenêtre de lien ouverte.
- **Données** : durées 0, 1, 30, 31, 7,5.
- **Étapes** :
  1. Option « Copier le lien », saisir successivement 0, 31, puis 7,5 dans « Durée de validité (jours) », créer le lien à chaque fois et lire « expire le ».
  2. Saisir 1 puis 30.
- **Attendu** :
  - Le champ est borné (min 1, max 30, entiers) ; une valeur hors bornes retombe sur 7 jours ; 1 et 30 sont acceptés (expiration = création + 1 ou + 30 jours).
  - Une requête forgée avec 31 jours serait refusée par l'API (400), jamais tronquée.
- **Gravité si échec** : Mineur

### GL-05-055 — Révoquer un lien

- **Rôle** : ADMIN_A
- **Préconditions** : un lien actif (GL-05-048).
- **Données** : lien actif de l'échéance `09/2026` (ou une autre non soldée).
- **Étapes** :
  1. Détail de l'échéance › tableau des liens › **Révoquer**.
  2. Dans la bulle « Révoquer ce lien ? » (« Le locataire ne pourra plus payer avec ce lien. ») cliquer **Révoquer**.
  3. Ouvrir à nouveau l'adresse du lien en navigation privée.
- **Attendu** :
  - Message « Lien révoqué. » ; le statut du lien passe « Révoqué » (étiquette rouge) et le bouton disparaît.
  - L'adresse révoquée donne « Lien invalide ou expiré » (même réponse que pour un lien inconnu ou expiré, 404 uniforme).
  - Révoquer un lien déjà révoqué n'est plus proposé.
- **Gravité si échec** : Bloquant

### GL-05-056 — Lien expiré

- **Rôle** : PUBLIC
- **Préconditions** : un lien dont l'expiration est passée (créer un lien de 1 jour puis attendre J+2, ou demander au superviseur de reculer la date d'expiration en base).
- **Données** : lien expiré.
- **Étapes** :
  1. Ouvrir l'adresse du lien expiré.
  2. Côté agence, lire le statut du lien dans le détail de l'échéance.
- **Attendu** :
  - Page « Lien invalide ou expiré » (aucune information sur l'échéance).
  - Statut « Expiré » dans le tableau des liens ; plus de bouton « Révoquer ».
- **Gravité si échec** : Majeur

### GL-05-057 — Liens non proposés pour une échéance soldée, brouillon à venir ou bail non actif

- **Rôle** : ADMIN_A
- **Préconditions** : GL-05-036 (échéance soldée), GL-05-003 (échéance `12/2026` « Brouillon » à venir), un bail « Suspendu ».
- **Données** : échéance `08/2026` payée ; échéance `12/2026` Brouillon ; bail REC-GL-ECH-MID passé à « Suspendu ».
- **Étapes** :
  1. Échéance soldée : chercher le bouton « Envoyer un lien de paiement ».
  2. Échéance `12/2026` (Brouillon à venir) › « Envoyer un lien de paiement » › « Copier le lien » › « Créer le lien ».
  3. Échéance d'un bail suspendu › même action.
- **Attendu** :
  - Échéance soldée : aucun bouton « Envoyer un lien de paiement » (reste dû nul).
  - Brouillon à venir : le bouton existe, mais l'API refuse : toast « Cette échéance est encore à l'état de brouillon : émettez-la avant d'envoyer un lien de paiement. » (le bouton ne devrait pas être proposé : Mineur).
  - Bail non actif : toast « Le bail de cette échéance n'est pas actif. » (400). Aucun lien créé.
  - Une échéance annulée : « Cette échéance est annulée. »
- **Gravité si échec** : Majeur

### GL-05-058 — Lien : le montant se recalcule après un acompte

- **Rôle** : PUBLIC (puis ADMIN_A)
- **Préconditions** : lien actif sur `10/2026` de REC-GL-ECH-MENS (reste dû 163 200 si pénalité calculée, sinon 160 000).
- **Données** : acompte de 50 000.
- **Étapes** :
  1. Ouvrir le lien et noter « Montant dû ».
  2. En ADMIN_A, enregistrer un paiement de 50 000 espèces sur `10/2026` (bouton « Paiement… »).
  3. Recharger la page publique.
- **Attendu** :
  - Le montant affiché passe de X à X − 50 000 (jamais l'ancien montant) ; le paiement lancé ensuite porte le nouveau reste dû.
  - Si l'échéance est entièrement soldée entre-temps, le lien affiche « Lien invalide ou expiré ».
- **Gravité si échec** : Bloquant

### GL-05-059 — Lien : double « Payer maintenant » (paiement déjà en cours)

- **Rôle** : PUBLIC
- **Préconditions** : lien actif sur une échéance non soldée.
- **Données** : deux onglets sur le même lien.
- **Étapes** :
  1. Dans l'onglet 1 : **Payer maintenant** (sans terminer sur le simulateur).
  2. Dans l'onglet 2 (même lien) : **Payer maintenant**.
  3. Terminer le paiement dans l'onglet 1 (« Payer »).
- **Attendu** :
  - Un seul paiement en ligne actif : l'onglet 2 est redirigé vers la même page du simulateur (reprise) ou reçoit le message « Un paiement est déjà en cours pour cette échéance. Patientez quelques minutes puis réessayez. »
  - Après réussite, un seul paiement « Réussi » sur l'échéance (jamais deux paiements pour un seul lien).
- **Gravité si échec** : Bloquant

### GL-05-060 — Page publique : jeton inventé ou altéré

- **Rôle** : PUBLIC
- **Préconditions** : aucune.
- **Données** : `/payer#abc123` ; `/payer` (sans fragment) ; `/payer/statut?paiement=IMT-AAAAAAAAAAAAAAAAAAAA` ; `/payer/statut?paiement=n'importe-quoi`.
- **Étapes** :
  1. Ouvrir chaque adresse.
- **Attendu** :
  - Chaque cas affiche « Lien invalide ou expiré » (ou le message neutre de la page de statut), sans distinguer inconnu, expiré, révoqué ; aucune donnée d'agence.
  - Réseau : 404 uniforme, en-têtes `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`.
  - Au-delà d'une trentaine d'ouvertures en une minute depuis la même adresse, message « Trop de tentatives, réessayez dans quelques minutes. » (limiteur).
- **Gravité si échec** : Majeur

### GL-05-061 — Isolation et droits des liens de paiement

- **Rôle** : ADMIN_B puis LECTEUR_A
- **Préconditions** : un lien existe sur une échéance de A (GL-05-048) ; relever `<installmentId>` et `<linkId>` (réseau).
- **Données** : identifiants relevés.
- **Étapes** :
  1. ADMIN_B : ouvrir `/tenant/<tenantB>/rental/installments/<installmentId de A>` ; lister les liens par la console réseau en rejouant `GET …/installments/<id>/payment-links` dans le contexte de B.
  2. LECTEUR_A : ouvrir le détail de l'échéance (URL), lire la section « Lien de paiement Mobile Money », tenter « Envoyer un lien de paiement » et « Révoquer ».
- **Attendu** :
  - ADMIN_B : 404 « Échéance introuvable » (jamais la liste des liens de A).
  - LECTEUR_A : la section et la liste sont visibles s'il a le droit de lecture des paiements ; création et révocation refusées (**403**), message d'erreur « Échec de la création du lien de paiement » ou texte de l'API. Observation : le bouton n'est pas masqué (l'écran passe `canCreate` à vrai).
- **Gravité si échec** : Bloquant

---

## I. Couverture

| Sous-fonctionnalité du classeur (Encaisser — Échéances / Liens de paiement)    | Cas                                                                                                       |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Générer les échéances d'un bail (mensuel, trimestriel, semestriel, annuel)     | GL-05-003 à GL-05-006                                                                                     |
| Jour d'échéance 29/30/31, février, année bissextile                            | GL-05-007, GL-05-008, GL-05-009                                                                           |
| Début en milieu de mois, prorata                                               | GL-05-010, GL-05-011                                                                                      |
| Bail sans date de fin, bornes de la durée                                      | GL-05-012, GL-05-013                                                                                      |
| Début le 31 (échéances manquantes)                                             | GL-05-014, GL-05-015                                                                                      |
| Génération : double clic, régénération, bail terminé/annulé                    | GL-05-016, GL-05-017, GL-05-018                                                                           |
| Consulter / lister les échéances (statut reclassé, filtres, pagination, F5)    | GL-05-021 à GL-05-028, GL-05-030, GL-05-034                                                               |
| Filtres bail / période / recherche                                             | GL-05-029 (non testable en interface : absents de la liste globale ; bail par l'onglet du bail GL-05-003) |
| Détail d'une échéance (allocations, pénalités)                                 | GL-05-031, GL-05-032, GL-05-033                                                                           |
| Recalculer les statuts des échéances                                           | GL-05-038, GL-05-039, GL-05-040                                                                           |
| Supprimer toutes les échéances d'un bail (avec / sans paiements, bail terminé) | GL-05-041 à GL-05-045                                                                                     |
| Passer automatiquement les échéances échues en retard (tâche quotidienne)      | GL-05-046 (effet constatable ; la tâche elle-même n'est pas déclenchable en interface)                    |
| Statut « À échoir » et campagne de facturation du mois                         | GL-05-024, GL-05-025                                                                                      |
| Encaisser depuis la liste (confirmation, double clic)                          | GL-05-035, GL-05-036, GL-05-037 (détail du paiement dans `GL-06-…`)                                       |
| Envoyer le lien de paiement d'une échéance (WhatsApp ou e-mail)                | GL-05-047, GL-05-053 (envoi réel WhatsApp non vérifiable : neutralisé)                                    |
| Copier le lien de paiement d'une échéance                                      | GL-05-048, GL-05-054                                                                                      |
| Lister les liens de paiement et l'état du paiement                             | GL-05-049, GL-05-051, GL-05-052                                                                           |
| Révoquer un lien de paiement                                                   | GL-05-055                                                                                                 |
| Page publique du lien, paiement simulé, statut                                 | GL-05-050, GL-05-051, GL-05-052, GL-05-056, GL-05-058, GL-05-059, GL-05-060                               |
| Isolation entre agences                                                        | GL-05-019, GL-05-061                                                                                      |
| Droits en lecture seule                                                        | GL-05-020, GL-05-061                                                                                      |
| Export des listes (Excel, CSV, PDF)                                            | voir `GL-09-…` (cas d'export des Échéances)                                                               |
