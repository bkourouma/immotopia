# 12 — Portail propriétaire

**Module** : Gestion locative — espace du propriétaire (`apps/web/src/pages/OwnerPortal/*`).

## Périmètre

- Accès du propriétaire : création du compte, mot de passe, connexion, redirection, périmètre de ses biens.
- Écrans : **Tableau de bord** `/owner`, **Mes biens** `/owner/properties` et fiche `/owner/properties/:id`, **Revenus** `/owner/revenues`, **Mon compte** `/owner/account` (compte courant tenu par l'agence), **Mon patrimoine** `/owner/patrimoine`, **Incidents** `/owner/maintenance`, menu **Plus** : **Documents** `/owner/documents`, **Rapports** `/owner/reports`, **Préférences** `/owner/preferences`, **Notifications**, **Messagerie**.
- Écrans sans entrée de menu, atteints seulement par saisie de l'adresse : **Mes baux** `/owner/leases` (et détail `/owner/leases/:id`), **Échéances** `/owner/installments`, **Paiements** `/owner/payments`, **Dépôts de garantie** `/owner/deposits`.
- Cohérence des montants avec ceux de l'agence (Revenus ≠ net du relevé ; compte courant = net des relevés cumulés).
- Étanchéité : un propriétaire ne voit que **ses** biens (adresses et identifiants forgés vers le bien d'un autre propriétaire de la même agence ou d'une autre agence).
- Le portail **ne propose aucun écran de relevé mensuel** : le rapport mensuel de l'agence s'ouvre par lien public (cas du fichier 10).

## Prérequis

- Fichiers 02 (baux), 06 (paiements) et 10 (relevés, honoraires, comptes) joués. Rôles : **PROPRIETAIRE_PORTAIL** = REC-GL Propriétaire Un (P1 : Villa et Studio) ; **PROPRIETAIRE_PORTAIL_2** = REC-GL Propriétaire Deux (P2 : Appartement Plateau). Jeu de données : tableau du fichier `10-proprietaires-releves-reversements.md`.
- Les biens sont rattachés aux propriétaires par la fiche du bien (champ propriétaire) et/ou par le bailleur du bail. Les étapes qui demandent un état particulier (mandat échu, bien disponible, ticket…) le précisent.
- Les valeurs « mois courant » dépendent de la date de la recette : les attendus sont donnés par formule (somme des paiements réussis de la période, hors collecte de dépôt de garantie) et, en référence, pour octobre 2026 (mois précédent si la recette se joue en novembre 2026).
- Plan de jeu pour « Mon compte » : lire le solde S0 affiché avant chaque manipulation de l'agence ; tous les attendus sont relatifs à S0.

- **Convention réseau** : les `fetch` de console cités dans ce fichier utilisent l'adresse de l'API de l'environnement (voir RUNBOOK ; `http://localhost:8820/api` pour la recette du 2026-11-03, voir le README du dossier) avec `credentials:'include'` ; on peut aussi relever la requête émise par l'écran dans l'onglet Réseau. Les identifiants d'objets sont relevés dans l'onglet Réseau, jamais saisis à la main.
- **Comptes** : PROPRIETAIRE_PORTAIL et PROPRIETAIRE_PORTAIL_2 du README sont des comptes du seed, avec leurs propres biens et leur historique. Les cas à montants exacts se jouent avec les comptes REC-GL créés ici (P1 et P2, cas GL-12-001 et fichier 10). Les cas de lecture, d'étanchéité et de robustesse peuvent se jouer avec les comptes du seed, en remplaçant les valeurs du jeu de référence par celles de leurs biens lues côté agence (les formules ne changent pas).

## Données créées par ce fichier

Compte portail de P1 et de P2, bien « REC-GL Terrain Bingerville » (disponible, P1), fichiers exportés (`revenue-report-…`, `occupancy-report-…`, `payments-export-…`), ticket « REC-GL Panne portail » vu côté propriétaire, reversements de test annulés en fin de cas.

---

## A. Accès et périmètre

### GL-12-001 — Création du compte propriétaire et premier accès

- **Rôle** : ADMIN_A, puis PROPRIETAIRE_PORTAIL
- **Préconditions** : contact CRM de P1 avec e-mail `rec-gl-proprietaire1@exemple.test`, sans compte utilisateur existant ; bail R1 créé à partir du contact propriétaire (fichier 02) avec P1 comme bailleur.
- **Données** : mot de passe `Rec-GL-2026!p`.
- **Étapes** :
  1. ADMIN_A : créer le bail R1 en désignant P1 comme propriétaire (contact) ; ouvrir le récepteur d'e-mails.
  2. P1 : ouvrir le lien `reset-password` de l'e-mail « Votre bail … est activé » (version propriétaire), définir le mot de passe (mêmes règles que GL-11-002).
  3. Se connecter.
- **Attendu** :
  - Un compte et un client de type **propriétaire** sont créés avec le bail ; l'e-mail est adressé à P1 avec le rôle propriétaire (texte distinct de celui du locataire).
  - Connexion → redirection vers `/owner` (via `/dashboard`) ; titre « Tableau de bord » ; aucune entrée de menu d'agence.
- **Gravité si échec** : Bloquant

### GL-12-002 — Menus du portail propriétaire

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : GL-12-001 passé ; vue patrimoine activée par l'agence (GL-12-100).
- **Données** : écran large (≥ 992 px) puis 375 px.
- **Étapes** :
  1. Lire le menu latéral et, sur téléphone, la barre d'onglets et l'entrée **Plus**.
  2. Cliquer chaque entrée.
- **Attendu** :
  - Menu latéral : **Tableau de bord**, **Mes biens**, **Revenus**, **Mon compte**, **Mon patrimoine**, **Incidents**, **Plus** (Documents, Rapports, Ma copropriété, Préférences, Notifications, Messagerie). Onglets du téléphone : Accueil, Biens, Revenus, Incidents, Plus.
  - Chaque entrée ouvre son écran sans erreur ; **Ma copropriété** mène à l'espace copropriétaire (accès seulement s'il est invité, sinon écran explicatif).
  - Constat de navigation : Mes baux, Échéances, Paiements, Dépôts de garantie n'ont **aucune** entrée de menu (voir GL-12-030, 032, 033, 034).
- **Gravité si échec** : Majeur

### GL-12-003 — Mauvais portail et non connecté

- **Rôle** : PROPRIETAIRE_PORTAIL, LOCATAIRE_PORTAIL, ADMIN_A, PUBLIC
- **Préconditions** : sessions séparées.
- **Données** : adresses `/tenant`, `/owner/properties`, `/owner/revenues`.
- **Étapes** :
  1. P1 tape `/tenant` et `/tenant/payments`.
  2. T1 (locataire) tape `/owner/revenues`.
  3. ADMIN_A tape `/owner`.
  4. PUBLIC tape `/owner/properties`, se connecte en P1.
- **Attendu** :
  - P1 sur `/tenant…` : redirigé vers `/owner`. T1 sur `/owner…` : redirigé vers `/tenant`. ADMIN_A : redirigé vers `/dashboard`.
  - PUBLIC : redirigé vers `/login?redirect=%2Fowner%2Fproperties`, puis retour sur `/owner/properties` après connexion.
  - Aucun contenu du portail n'apparaît avant la redirection.
- **Gravité si échec** : Majeur

### GL-12-004 — Périmètre des biens : rattachement direct, bail, mandat

- **Rôle** : ADMIN_A, PROPRIETAIRE_PORTAIL
- **Préconditions** : bien « REC-GL Bien mandat » enregistré comme bien de client (propriétaire P1) avec un mandat de gestion actif de l'agence (module Biens, fichier hors périmètre) ; Villa rattachée à P1 ; Studio loué par un bail dont P1 est le bailleur.
- **Données** : mandat actif puis révoqué ou échu.
- **Étapes** :
  1. P1 : **Mes biens** : repérer les trois biens.
  2. ADMIN_A révoque (ou laisse expirer) le mandat du « Bien mandat ».
  3. P1 : recharger **Mes biens**, le tableau de bord et Documents.
- **Attendu** :
  - Les trois biens apparaissent (rattachement direct, bail, mandat actif).
  - Après révocation ou échéance du mandat : le « Bien mandat » **disparaît** partout (biens, revenus, documents, incidents, rapports) ; les deux autres restent.
  - Un bien de client **sans** mandat actif de l'agence n'apparaît jamais, même s'il est loué par un bail de l'agence.
- **Gravité si échec** : Bloquant

### GL-12-005 — Propriétaire sans aucun bien (état vide)

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : un propriétaire neuf sans bien ni bail (créer le contact et un bail brouillon, ou utiliser un compte propriétaire sans bien).
- **Données** : —
- **Étapes** :
  1. Connecté à ce compte, ouvrir Tableau de bord, Mes biens, Revenus, Mon compte, Documents, Rapports.
- **Attendu** :
  - Tableau de bord : tous les compteurs à 0, taux d'occupation 0, « Aucune échéance à venir », « Aucun paiement récent », « Aucun ticket récent ».
  - Mes biens : « Aucune propriété disponible » ; Revenus : « Aucune donnée disponible » ; Mon compte : « Votre compte est à jour » et mouvements « Aucun mouvement enregistré sur ce compte. » ; Rapports : génération refusée avec un message clair (aucune propriété), pas d'erreur 500.
- **Gravité si échec** : Majeur

### GL-12-006 — Propriétaire client de deux agences : sélecteur d'agence

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : l'e-mail de P1 est aussi propriétaire (bailleur d'un bail ou propriétaire d'un bien) dans l'agence B ; sinon « non testable ».
- **Données** : agences A et B.
- **Étapes** :
  1. Repérer le sélecteur **Changer d'agence** de l'en-tête.
  2. Sur chaque agence, relever Mes biens, Revenus, Mon compte, Documents ; changer d'agence plusieurs fois, F5 entre deux.
  3. En console, `GET /api/portal/owner/properties` avec l'en-tête `X-Portal-Tenant-Id` de chaque agence.
- **Attendu** :
  - Chaque agence ne montre **que** les biens, revenus, comptes et documents qui lui appartiennent ; un bien de l'agence B n'apparaît jamais sous l'agence A (périmètre filtré par agence) ; le changement vide les données en mémoire et revient au tableau de bord.
  - Le compte courant est séparé par agence (soldes indépendants).
  - Sans en-tête : l'agence par défaut (la plus ancienne non suspendue) ; avec l'en-tête d'une agence où le compte n'est pas propriétaire : 403.
- **Gravité si échec** : Bloquant (si un bien de B apparaît chez A)

---

## B. Tableau de bord

### GL-12-010 — Compteurs du portefeuille et taux d'occupation

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : Villa et Studio loués ; bien « REC-GL Terrain Bingerville » (P1) créé **disponible** sans bail (module Biens).
- **Données** : —
- **Étapes** :
  1. Ouvrir **Tableau de bord** ; lire « Total propriétés », « Louées », « Disponibles », « En maintenance », « Taux d'occupation ».
  2. Passer le Terrain en « En maintenance » (statut du bien côté agence) puis recharger ; le remettre « Disponible ».
  3. Cliquer **Actualiser**.
- **Attendu** :
  - Total 3 ; Louées 2 ; Disponibles 1 ; En maintenance 0 ; Taux d'occupation = 2 ÷ 3 ≈ 66,7 %.
  - Après passage en maintenance : Disponibles 0, En maintenance 1 (le total ne change pas).
  - Un bien vendu, archivé ou en brouillon n'est pas compté comme « Disponible ».
  - Le bouton **Actualiser** relance les chargements sans écran blanc.
- **Gravité si échec** : Majeur

### GL-12-011 — Revenus du tableau de bord = paiements réussis hors dépôt

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : paiements du jeu de référence ; un encaissement de dépôt de garantie de 400 000 FCFA sur R1 (collecte, fichier 06/07).
- **Données** : —
- **Étapes** :
  1. Lire « Revenus ce mois », « Revenus cette année », « Revenus mois dernier ».
  2. Recalculer à la main à partir de la liste Paiements de l'agence.
- **Attendu** :
  - Chaque carte = somme des paiements **réussis** de la période sur les biens de P1, **sans** les paiements qui collectent un dépôt de garantie ; octobre 2026 (mois précédent) = 280 000 FCFA ; cette année ≥ 280 000.
  - Ces revenus sont des montants **encaissés bruts** : ils ne déduisent ni honoraires ni TVA ni dépenses (net du relevé : 234 320 FCFA). Un propriétaire qui rapproche les deux écrans doit trouver l'écart expliqué (fichier 10).
  - Un paiement annulé ou en échec n'est jamais compté.
- **Gravité si échec** : Bloquant

### GL-12-012 — Prochains paiements, paiements récents, incidents récents

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : échéances à venir des baux R1 et R2 ; un ticket de maintenance sur la Villa.
- **Données** : —
- **Étapes** :
  1. Lire « Prochains paiements » (« 5 prochaines échéances »), « Paiements récents », « Tickets de maintenance récents ».
- **Attendu** :
  - Prochains paiements : au plus 5 échéances non soldées, triées par date, chacune avec bien, locataire, montant dû et libellé « Période: … » ; statuts « Échéance », « En retard », « Payé », « Déclaré » selon le cas ; vide : « Aucune échéance à venir ».
  - Paiements récents : derniers paiements des biens de P1 (jamais ceux de P2).
  - Tickets récents : titre, statut (« Déclaré », « En cours », « Résolu »), « Aucun ticket récent » si vide.
- **Gravité si échec** : Majeur

---

## C. Mes biens

### GL-12-020 — Liste des biens, cartes de synthèse, filtres

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : trois biens de P1 (Villa louée, Studio loué, Terrain disponible).
- **Données** : filtres Statut « Loué », Type « Terrain », Mode de transaction « Location ».
- **Étapes** :
  1. Menu **Mes biens** (`/owner/properties`) : lire le titre « Mes propriétés » et les cartes Total / Louées / Disponibles / En maintenance.
  2. Appliquer chaque filtre, puis une combinaison sans résultat.
  3. **Actualiser**.
- **Attendu** :
  - Cartes cohérentes avec le tableau de bord ; chaque bien : adresse, type (Appartement, Maison / Villa, Studio, Terrain…), statut (Disponible, Loué, Réservé, Sous offre, En révision), modes (Vente, Location, Location courte durée) et bail courant.
  - Filtre sans résultat : « Aucune propriété trouvée avec ces filtres » ; sans bien : « Aucune propriété disponible ».
  - Aucun bien de P2 (Appartement Plateau) dans la liste.
- **Gravité si échec** : Majeur

### GL-12-021 — Fiche d'un bien

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : Villa louée à T1, un ticket de maintenance, paiements d'octobre.
- **Données** : —
- **Étapes** :
  1. Dans la liste, cliquer le lien de détail de la Villa (`/owner/properties/:id`).
  2. Lire les cartes « Informations de la propriété », « Bail actif », « Statistiques de revenus », « Historique des baux », « Historique de maintenance ».
  3. Bouton **Retour à la liste**.
- **Attendu** :
  - Informations : adresse, type, statut, modes de transaction, description, date de création.
  - Bail actif : locataire principal (nom, e-mail), dates, loyer mensuel 200 000, charges 20 000, co-locataires ; « Aucun bail actif » pour le Terrain.
  - Statistiques de revenus : « Total reçu » (paiements réussis hors dépôt : 220 000 en octobre), « Moyenne mensuelle », « Ce mois ».
  - Historique des baux et de maintenance présents ou « Aucun historique de bail » / « Aucun ticket de maintenance ».
- **Gravité si échec** : Majeur

### GL-12-022 — Bien d'un autre propriétaire ou inexistant (adresse saisie)

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : identifiant de l'Appartement Plateau (bien de P2) ; un identifiant d'une autre agence (fourni par ADMIN_B) ; un UUID inventé.
- **Données** : `/owner/properties/<id Appartement>`, `/owner/properties/<id agence B>`, `/owner/properties/not-a-uuid`.
- **Étapes** :
  1. P1 ouvre chacune de ces adresses.
  2. Lire le message et le réseau.
- **Attendu** :
  - Un bandeau « Erreur » avec un message du type « Propriété non trouvée ou accès non autorisé » et le bouton **Retour à la liste** ; aucune donnée du bien, identique pour les trois cas (aucune différence entre « existe chez un autre » et « n'existe pas »).
  - Réseau : 404 pour les trois (pas de 500, pas de 403 qui trahirait l'existence).
- **Gravité si échec** : Bloquant

---

## D. Baux, échéances, paiements (écrans accessibles par adresse)

### GL-12-030 — Liste des baux

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : baux R1 et R2 actifs, un bail terminé sur la Villa (historique).
- **Données** : adresse `/owner/leases` ; filtre Statut « Actif ».
- **Étapes** :
  1. Saisir l'adresse (aucun lien de menu).
  2. Lire les cartes « Baux actifs », « Baux terminés », « Baux suspendus » et le tableau « Liste des baux ».
  3. Filtrer par statut, **Actualiser**, **Voir les détails**.
- **Attendu** :
  - Titre « Mes baux » ; chaque ligne : adresse du bien, locataire, dates (« Du … au … » ou « Non définie »), loyer, statut (Actif, Brouillon, Suspendu, Terminé, Annulé).
  - Cartes cohérentes avec la liste ; baux de P2 absents.
  - **Constat** : écran sans entrée de menu ni lien depuis la fiche du bien → défaut de navigation (Mineur).
- **Gravité si échec** : Majeur

### GL-12-031 — Détail d'un bail et soldes

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : R2 d'octobre partiellement payée (60 000 sur 100 000) ; dépôt de R2 s'il existe.
- **Données** : bail R2.
- **Étapes** :
  1. Dans `/owner/leases`, **Voir les détails** sur R2 (`/owner/leases/:id`).
  2. Lire « Informations du bail », « Locataires », « Calendrier des échéances », « Historique des paiements », « Solde du bail », « Dépôt de garantie » et « Historique des mouvements ».
- **Attendu** :
  - Informations : numéro, propriété, dates, loyer 100 000, charges 0.
  - Calendrier : échéance d'octobre avec montant, payé 60 000, statut « Partiel » ou « En retard » ; autres statuts : Payé, Brouillon, Échéance.
  - Solde du bail : Total dû, Total payé 60 000, **Reste à payer 40 000** (même valeur que Finance › Balance clients de l'agence pour ce bail).
  - Dépôt : Montant cible, détenu, remboursé, « Montant en attente de paiement » ; mouvements : Collecte, Détention, Libération, Remboursement, Confiscation, Ajustement ; sans dépôt : « Aucun dépôt de garantie enregistré ».
- **Gravité si échec** : Bloquant

### GL-12-032 — Échéances de ses biens

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : échéances de R1 et R2 (payées, partielles, à venir) ; une pénalité sur R2.
- **Données** : adresse `/owner/installments` ; filtres Statut, Propriété, plage de dates.
- **Étapes** :
  1. Saisir l'adresse.
  2. Lire « Liste des échéances » : colonnes Propriété, Locataire, Période, Date d'échéance, Montant total (avec « dont pénalité: … » et « payé: … »), Montant dû, Statut (Payé, À payer, En retard, Partiel, Brouillon).
  3. Filtrer par statut, par propriété, par dates ; **Actualiser**.
- **Attendu** :
  - Montants identiques à ceux du côté locataire et de l'agence (Montant total R2 octobre = 100 000 + pénalité éventuelle ; Montant dû = total − payé).
  - Cartes de synthèse (Total, Payées…) cohérentes avec la liste ; vide : « Aucune échéance trouvée ».
  - Aucune échéance de P2. Les échéances en Brouillon (non facturées) sont visibles : à noter (Cosmétique).
- **Gravité si échec** : Majeur

### GL-12-033 — Paiements reçus de ses biens

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : paiements de R1 et R2 ; un paiement annulé côté agence ; une collecte de dépôt.
- **Données** : adresse `/owner/payments` ; filtres Méthode « Espèces », Propriété, dates.
- **Étapes** :
  1. Lire « Historique des paiements reçus » : Date, Montant, Méthode, Locataire, Propriété, Statut (Réussi, En attente, Échoué, Annulé).
  2. Cliquer **Détails** sur le paiement de 220 000 : fenêtre avec bail et allocations.
  3. Filtrer ; **Actualiser**.
- **Attendu** :
  - Le paiement R1 de 220 000 (08/10/2026, Espèces) et celui de R2 (60 000, Virement bancaire) figurent ; cartes « Total », « Montant total », « Ce mois », « Cette année » cohérentes.
  - Détails : allocation de 220 000 sur l'échéance d'octobre.
  - **Écart à expliquer** : les revenus (écran Revenus) excluent les paiements qui collectent un dépôt de garantie, alors que cette liste montre tous les paiements réussis : le total de cet écran peut dépasser celui de Revenus du montant du dépôt collecté (Cosmétique si non expliqué).
  - Les paiements de P2 sont absents.
- **Gravité si échec** : Majeur

### GL-12-034 — Dépôts de garantie de ses baux

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : dépôt de R1 collecté (400 000), retenue de 30 000 et libération côté agence selon fichier 07 ; dépôt de R2 non collecté.
- **Données** : adresse `/owner/deposits`.
- **Étapes** :
  1. Lire « Liste des dépôts de garantie » : Propriété, Locataire, Montant du dépôt, Montant retenu, Statut (En attente, Collecté, En retenue, Remboursé, Confisqué).
  2. Cliquer sur les mouvements d'un dépôt : « Historique des mouvements » (Type, Montant, Date, Note, Créé par).
  3. Lire « Total libéré » et « Total retenu ».
- **Attendu** :
  - Montants identiques à l'onglet Dépôt de garantie du bail côté agence et à l'écran `/tenant/deposit` du locataire (GL-11-070).
  - Types de mouvement libellés : Collecte, Mise en retenue, Libération, Remboursement, Confiscation, Ajustement.
  - Vide : « Aucun dépôt de garantie trouvé » / « Aucun mouvement trouvé ». Aucun dépôt de P2.
- **Gravité si échec** : Majeur

---

## E. Revenus

### GL-12-040 — Écran Revenus : synthèse, par bien, par mois

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : paiements du jeu de référence ; année courante et année précédente sélectionnables.
- **Données** : année 2026 ; filtre Propriété = Villa ; période octobre 2026.
- **Étapes** :
  1. Menu **Revenus** (`/owner/revenues`) : lire « Ce mois », « Cette année », « Tous les temps », « Moyenne mensuelle », « Nombre de paiements ».
  2. Lire « Revenus par propriété » et « Revenus par mois » avec le sélecteur « Année (revenus mensuels) ».
  3. Appliquer les filtres Période et Propriété ; **Actualiser**.
- **Attendu** :
  - « Tous les temps » = 280 000 (P1, hors dépôt) ; « Nombre de paiements » = 2 ; par propriété : Villa 220 000, Studio 60 000 ; par mois : octobre = 280 000, autres mois 0, somme des 12 mois = « Cette année ».
  - Filtre Villa + octobre : 220 000, 1 paiement. Année sans données : « Aucune donnée disponible pour cette année ».
  - Moyenne mensuelle = total ÷ nombre de mois depuis le premier paiement (au moins 1).
  - Les revenus n'incluent pas les honoraires déduits : ils diffèrent du net du relevé de 45 680 FCFA (26 000 + 4 680 + 15 000 pour octobre).
- **Gravité si échec** : Bloquant

### GL-12-041 — Revenus : paiement annulé ou collecte de dépôt exclus

- **Rôle** : ADMIN_A, PROPRIETAIRE_PORTAIL
- **Préconditions** : un paiement de test de 10 000 FCFA sur R2 (REC-GL) ; la collecte de dépôt de R1.
- **Données** : paiement de 10 000 puis annulé.
- **Étapes** :
  1. P1 : noter « Cette année » et « Tous les temps ».
  2. ADMIN_A : enregistrer le paiement de 10 000 sur R2 (fichier 06), P1 recharge ; puis ADMIN_A annule le paiement, P1 recharge.
- **Attendu** :
  - Avec le paiement : les compteurs augmentent de 10 000 et « Nombre de paiements » de 1 ; après annulation : retour aux valeurs initiales.
  - La collecte de dépôt de R1 ne modifie jamais ces compteurs.
- **Gravité si échec** : Bloquant

---

## F. Mon compte (compte courant tenu par l'agence)

### GL-12-060 — Solde, indicateurs et mouvements

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : fichiers 06 et 10 joués ; aucun reversement validé en cours (états de fin de fichier 10). Valeur de référence : solde 234 320 FCFA si l'agence n'a enregistré aucun autre encaissement pour P1 (sinon lire S0 et recalculer).
- **Données** : —
- **Étapes** :
  1. Menu **Mon compte** (`/owner/account`) : lire le titre, la phrase de solde, les cinq indicateurs, les tableaux « Reversements reçus » et « Détail des mouvements ».
  2. Comparer avec Finance › Comptes propriétaires › compte de P1 (agence).
- **Attendu** :
  - Titre « Mon compte », sous-titre « Compte courant tenu par l'agence pour vos biens. » ; phrase **« L'agence vous doit »** suivie du montant (234 320 FCFA).
  - Indicateurs : Loyers encaissés 280 000 ; Honoraires de gestion 26 000 ; TVA sur honoraires 4 680 ; Dépenses 15 000 ; Reversements reçus 0.
  - Mouvements (Date, Type, Libellé, Bien, Montant, Solde après) : crédits « Loyer encaissé » en vert avec « + », débits « Honoraires de gestion », « TVA sur honoraires », « Dépense » en négatif, bien ou numéro de bail affiché ; « Solde après » final = solde de la phrase.
  - Mêmes montants que le compte côté agence et que le net du relevé (cas GL-10-040 à 042). Vide : « Aucun reversement n'a encore été effectué. »
  - Pied de page : « Ce compte retrace les loyers encaissés pour vous, les honoraires et dépenses déduits, et les sommes que l'agence vous a reversées. »
- **Gravité si échec** : Bloquant

### GL-12-061 — Un reversement de l'agence apparaît dans le portail

- **Rôle** : ADMIN_A, PROPRIETAIRE_PORTAIL
- **Préconditions** : S0 lu par le propriétaire ; ADMIN_A habilité aux reversements.
- **Données** : reversement de 10 000 FCFA, mode Virement, référence `REC-GL-PORTAIL-01`.
- **Étapes** :
  1. ADMIN_A : enregistrer le reversement (cas GL-10-043).
  2. P1 : cliquer **Actualiser** sur Mon compte.
- **Attendu** :
  - Solde = S0 − 10 000 ; tableau « Reversements reçus » : date, numéro `REV-AAAA-NNNN`, Mode « Virement bancaire », Référence `REC-GL-PORTAIL-01`, Montant 10 000 ; indicateur « Reversements reçus » = 10 000 ; nouveau mouvement « Reversement » en négatif.
  - Le portail ne propose aucun bouton pour modifier ou annuler (lecture seule).
- **Gravité si échec** : Bloquant

### GL-12-062 — Annulation d'un reversement vue par le propriétaire

- **Rôle** : ADMIN_A, PROPRIETAIRE_PORTAIL
- **Préconditions** : reversement de 10 000 de GL-12-061 Validé.
- **Données** : motif « Erreur de saisie REC-GL ».
- **Étapes** :
  1. ADMIN_A annule le reversement (cas GL-10-048).
  2. P1 : **Actualiser**.
- **Attendu** :
  - Le reversement reste listé avec l'étiquette **Annulé** ; un mouvement « Annulation » apparaît en positif (+10 000) ; solde de nouveau S0 ; « Reversements reçus » (indicateur) revenu à 0.
  - Le motif de l'agence n'est pas indispensable au propriétaire ; s'il est affiché, il ne doit pas contenir de donnée interne (à noter).
- **Gravité si échec** : Bloquant

### GL-12-063 — Solde à zéro et solde négatif

- **Rôle** : PROPRIETAIRE_PORTAIL, PROPRIETAIRE_PORTAIL_2, ADMIN_A
- **Préconditions** : reversement du solde entier pour P1 (cas GL-10-051, étape 1) ; dépense test négative pour P2 (cas GL-10-054).
- **Données** : —
- **Étapes** :
  1. Après le reversement total : P1 recharge **Mon compte**.
  2. Avec la dépense de 200 000 sur le bien de P2 : P2 recharge **Mon compte**.
  3. Nettoyer côté agence (annulation et suppression).
- **Attendu** :
  - Solde nul : phrase **« Votre compte est à jour »**, aucun montant affiché.
  - Solde négatif : phrase **« Vous devez à l'agence »** avec 67 700 FCFA (valeur absolue).
  - Après nettoyage : retour aux soldes d'origine.
- **Gravité si échec** : Majeur

### GL-12-064 — Les cinq indicateurs expliquent-ils le solde ? (retenue à la source, dépôt conservé)

- **Rôle** : ADMIN_A, PROPRIETAIRE_PORTAIL_2
- **Préconditions** : propriétaire P2 de statut fiscal « Personne physique » ; retenue à la source activée dans Paramètres financiers (carte « Retenue à la source sur loyers ») avec un taux pour personne physique (par exemple 5 %) à partir du jour même ; un paiement de 100 000 FCFA sur R3 daté d'aujourd'hui (fichier 06).
- **Données** : taux 5 % ; paiement 100 000.
- **Étapes** :
  1. Activer la retenue, saisir le taux, la date d'application et le compte de retenue, enregistrer.
  2. Enregistrer le paiement de R3.
  3. P2 : ouvrir **Mon compte**, lire un mouvement « Retenue à la source » et les cinq indicateurs.
  4. Faire la somme : Loyers encaissés − Honoraires − TVA − Dépenses − Reversements.
- **Attendu** :
  - Un mouvement « Retenue à la source » de 5 000 (débit) apparaît dans la liste et réduit le solde.
  - **Point de vigilance (anomalie probable)** : les cinq indicateurs ne contiennent ni la retenue à la source ni le dépôt de garantie conservé ; la somme des indicateurs ne retombe alors plus sur le solde (écart = retenue ou dépôt). Si l'écart existe et n'est pas expliqué à l'écran, c'est une présentation fausse d'un compte financier → Majeur. Le même écart existe dans le compte côté agence.
  - Remettre la retenue à l'état initial après le cas.
- **Gravité si échec** : Majeur

### GL-12-065 — Indivision vue du portail

- **Rôle** : ADMIN_A, PROPRIETAIRE_PORTAIL, PROPRIETAIRE_PORTAIL_2
- **Préconditions** : indivision de la Villa 60 % P1 / 40 % P2 définie (cas GL-10-070).
- **Données** : —
- **Étapes** :
  1. P1 : Mon compte, Mes biens, Revenus.
  2. P2 : Mon compte, Mes biens, Revenus, Mon patrimoine.
  3. Supprimer l'indivision (cas GL-10-073).
- **Attendu** :
  - Compte de P1 = 60 % des mouvements de la Villa + Studio ; compte de P2 = 40 % de la Villa + son Appartement ; les deux restent cohérents avec l'agence.
  - Écrans Revenus et Mes biens : le périmètre suit le propriétaire de la fiche du bien et le bailleur du bail. **Points de vigilance** : (a) P2 (40 % de la Villa) ne voit pas la Villa dans Mes biens alors que son compte contient des mouvements de la Villa ; (b) Revenus de P1 montre 100 % des paiements de la Villa et non sa part de 60 %. Chaque écart constaté : Majeur (incohérence compte / biens / revenus).
- **Gravité si échec** : Majeur

---

## G. Documents

### GL-12-070 — Liste, filtre et téléchargement des documents

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : contrat de bail et quittance générés pour R1 et R2 (fichier 06) ; contrat de R3 (bien de P2).
- **Données** : filtre Type « Quittance de loyer », filtre Propriété = Villa.
- **Étapes** :
  1. **Plus › Documents** (`/owner/documents`).
  2. Filtrer par type, par propriété, **Actualiser** ; cliquer **Télécharger** sur un contrat.
  3. Ouvrir le fichier.
- **Attendu** :
  - Documents groupés par type (Contrat de bail, Quittance de loyer, Reçu de dépôt, Relevé…), avec la propriété, le statut (Brouillon, Final, Annulé) et « Émis le … » ; message « Document téléchargé avec succès » ; PDF lisible.
  - Aucun document du bail R3 (propriétaire P2) ; aucun document annulé (VOID) ; vide : « Aucun document trouvé ».
  - Le fichier se télécharge par la route du portail (pas d'adresse `/uploads/…` publique).
- **Gravité si échec** : Majeur

### GL-12-071 — Document d'un autre propriétaire : téléchargement refusé

- **Rôle** : PROPRIETAIRE_PORTAIL_2
- **Préconditions** : identifiant d'un document de R1 (vu dans le réseau de P1).
- **Données** : `GET /api/portal/owner/documents/<id R1>/download`.
- **Étapes** :
  1. Console de P2 avec `credentials:'include'`.
- **Attendu** :
  - 404 « Document non trouvé ou accès non autorisé » ; aucun octet de fichier ; pas de 500.
- **Gravité si échec** : Bloquant

---

## H. Rapports et exports

### GL-12-080 — Rapport de revenus (PDF, CSV, Excel)

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : paiements d'octobre 2026.
- **Données** : période 01/10/2026 – 31/10/2026 ; formats PDF, CSV, Excel ; ensuite propriété = Villa.
- **Étapes** :
  1. **Plus › Rapports** (`/owner/reports`) : carte « Rapport de revenus ».
  2. Choisir la période, laisser « Toutes les propriétés », format PDF, **Générer le rapport**.
  3. Répéter en CSV et en Excel, puis avec la propriété Villa.
- **Attendu** :
  - Message « Rapport de revenus généré avec succès » ; fichier `revenue-report-AAAA-MM-JJ.pdf|csv|xlsx` téléchargé.
  - Contenu : total 280 000 FCFA, 2 paiements (Villa 220 000, Studio 60 000) ; avec la Villa seule : 220 000. Le PDF s'ouvre sans erreur ; le CSV s'ouvre dans un tableur avec les accents corrects.
  - Les montants du rapport égalent ceux de l'écran Revenus pour la même période.
  - Jamais de paiement d'un autre propriétaire.
- **Gravité si échec** : Majeur

### GL-12-081 — Validations des formulaires de rapports

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : page Rapports ouverte.
- **Données** : champs vides.
- **Étapes** :
  1. Valider « Rapport de revenus » sans période ; vider le format.
  2. Valider « Rapport d'occupation » sans date.
  3. Valider « Export de données » sans type.
- **Attendu** :
  - « Veuillez sélectionner une période », « Veuillez sélectionner un format », « Veuillez sélectionner une date », « Veuillez sélectionner un type » ; aucun appel réseau tant que le formulaire est invalide.
- **Gravité si échec** : Mineur

### GL-12-082 — Rapport d'occupation

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : Villa et Studio loués, Terrain disponible.
- **Données** : date du jour ; formats PDF, CSV, Excel.
- **Étapes** :
  1. Carte « Rapport d'occupation » : générer dans les trois formats.
  2. Refaire avec une date antérieure au début des baux (30/09/2026).
- **Attendu** :
  - Message « Rapport d'occupation généré avec succès » ; fichier `occupancy-report-AAAA-MM-JJ.*` avec les trois biens, le statut d'occupation à la date et le taux global (2 ÷ 3 pour le jour courant, 0 au 30/09/2026 pour des baux débutant le 01/10).
  - Aucune erreur, aucun bien d'un autre propriétaire.
- **Gravité si échec** : Majeur

### GL-12-083 — Export de données (paiements, échéances, baux)

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : données du jeu de référence.
- **Données** : types Paiements, Échéances, Baux ; formats CSV et Excel.
- **Étapes** :
  1. Carte « Export de données » : exporter chaque type dans chaque format ; choisir parfois une propriété ou une plage de dates.
  2. Ouvrir les fichiers.
- **Attendu** :
  - Message « Export des données réussi » ; fichiers `payments-export-…`, `installments-export-…`, `leases-export-…` ; chaque ligne appartient à un bien de P1 ; colonnes en français (Propriété, Locataire, Montant, Date, Méthode, Statut…).
  - Le total des paiements exportés peut dépasser « Revenus » du montant des collectes de dépôt (écart à expliquer, voir GL-12-033).
  - Aucune ligne de P2.
- **Gravité si échec** : Majeur

### GL-12-084 — CSV : cellules commençant par `=` neutralisées

- **Rôle** : ADMIN_A, PROPRIETAIRE_PORTAIL
- **Préconditions** : un locataire dont le nom commence par `=` (créer le contact `=SOMME(1+1)` REC-GL comme locataire d'un bail test, fichier 02) ou une adresse de bien commençant par `@`.
- **Données** : nom `=SOMME(1+1)`.
- **Étapes** :
  1. Exporter les baux et les paiements en CSV puis en Excel ; ouvrir dans un tableur.
- **Attendu** :
  - Dans le CSV, la cellule est préfixée (apostrophe ou espace) et s'affiche comme texte ; aucune formule n'est évaluée ; les virgules et guillemets sont échappés.
  - Excel : la valeur est du texte.
- **Gravité si échec** : Majeur (injection de formule)

### GL-12-085 — Exports et rapports sans donnée

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : période sans paiement (janvier 2026).
- **Données** : rapport de revenus janvier 2026 ; export des paiements sur cette période.
- **Étapes** :
  1. Générer les deux documents.
- **Attendu** :
  - Fichier valide avec en-têtes et total 0, ou message clair d'absence de données ; pas d'erreur 500 ni de fichier corrompu.
- **Gravité si échec** : Mineur

---

## I. Préférences

### GL-12-090 — Consentement à la newsletter

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : —
- **Données** : bascule Oui/Non.
- **Étapes** :
  1. **Plus › Préférences** (`/owner/preferences`) : lire « Recevoir la newsletter » (Oui/Non).
  2. Basculer, lire le message ; F5.
- **Attendu** :
  - Messages « Vous recevrez les newsletters. » / « Vous ne recevrez plus les newsletters. » ; la valeur persiste après F5 ; en cas d'échec : « Erreur lors de la mise à jour » sans changement visuel trompeur.
  - La préférence n'affecte que le compte du propriétaire connecté.
- **Gravité si échec** : Mineur

---

## J. Incidents (maintenance, lecture seule)

### GL-12-095 — Liste et détail des tickets de ses biens

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : ticket « REC-GL Panne portail » sur la Villa (déclaré par le locataire ou créé par l'agence, fichiers 11 et maintenance) ; un ticket sur l'Appartement de P2.
- **Données** : filtres Statut, Propriété, Catégorie, Priorité.
- **Étapes** :
  1. Menu **Incidents** (`/owner/maintenance`) : lire « Suivi des tickets de maintenance » et les cartes Total / Ouverts / En cours / Résolus.
  2. Filtrer ; ouvrir **Détails** d'un ticket (« Détails du ticket »).
- **Attendu** :
  - Seuls les tickets de la Villa et du Studio ; colonnes Titre, Propriété, Catégorie (Plomberie, Électricité, Climatisation, Autre), Priorité (Basse, Moyenne, Haute, Urgente), Statut (Déclaré, Assigné, En cours, Résolu, Annulé), Date de création.
  - Détail : description, localisation, pièces jointes (téléchargement par route du portail), commentaires, historique des statuts, utilisateur ou vendeur assigné.
  - Aucun bouton de création ni de modification (le propriétaire ne crée pas de ticket depuis le portail). Aucun ticket de P2.
- **Gravité si échec** : Majeur

### GL-12-096 — Coûts du ticket visibles du propriétaire

- **Rôle** : ADMIN_A, PROPRIETAIRE_PORTAIL
- **Préconditions** : ticket résolu avec un coût réel de 25 000 FCFA saisi par l'agence.
- **Données** : —
- **Étapes** :
  1. P1 : ouvrir le ticket ; lire le résumé de coûts (carte de synthèse des coûts s'il existe).
  2. Comparer avec le montant de la dépense du bien enregistrée par l'agence (cas GL-10-010).
- **Attendu** :
  - Le coût affiché correspond à la fiche du ticket côté agence ; le coût d'un ticket n'est pas automatiquement une dépense du relevé (le relevé ne retient que les dépenses du bien saisies par l'agence).
  - Aucun coût d'un autre propriétaire.
- **Gravité si échec** : Mineur

---

## K. Mon patrimoine

### GL-12-100 — Activer ou masquer la vue patrimoine (réglage de l'agence)

- **Rôle** : ADMIN_A, PROPRIETAIRE_PORTAIL
- **Préconditions** : valorisation, emprunt, travaux et document saisis sur la Villa par l'agence (module Patrimoine) ; ADMIN_A autorisé à modifier les réglages.
- **Données** : réglage « Afficher la vue patrimoine » ; rubriques Valorisation et plus-value, Rendements, Emprunts, Travaux, Documents.
- **Étapes** :
  1. ADMIN_A : **Paramétrage › Agence › Paramètres de l'agence**, carte **Portail propriétaire** : désactiver « Afficher la vue patrimoine » ; message « Réglage mis à jour ».
  2. P1 : recharger ; ouvrir `/owner/patrimoine`.
  3. ADMIN_A réactive la vue et décoche seulement « Emprunts » ; P1 recharge Mon patrimoine.
- **Attendu** :
  - Vue désactivée : entrée de menu **Mon patrimoine** absente ; l'adresse directe affiche « Vue indisponible » / « Cette vue n'est pas disponible. » et aucune donnée.
  - Vue activée sans « Emprunts » : les emprunts et le rendement net-net (qui en dépend) sont absents ; les autres rubriques présentes. Un utilisateur sans droit de modification voit les cases « Lecture seule ».
- **Gravité si échec** : Majeur

### GL-12-101 — Mon patrimoine : synthèse et tableau

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : vue activée, toutes rubriques ouvertes ; Villa valorisée 80 000 000 FCFA, emprunt avec capital restant dû de 30 000 000 FCFA.
- **Données** : —
- **Étapes** :
  1. Menu **Mon patrimoine** (`/owner/patrimoine`).
  2. Lire « Nombre de biens », « Valeur estimée (votre part) », « Plus-value latente », « Capital restant dû » et le tableau « Vos biens ».
  3. Cliquer **Voir le détail**.
- **Attendu** :
  - Chiffres cohérents avec les saisies de l'agence : valeur estimée = somme des dernières valorisations pondérées par la quote-part ; capital restant dû = somme des emprunts ; colonnes Bien, Dernière valorisation, Rendement brut / net / net-net, Quote-part, Voir le détail ; « Non renseigné » pour une donnée absente.
  - Aucun bien sans donnée de patrimoine dans le tableau : « Aucun bien avec des données de patrimoine. »
- **Gravité si échec** : Majeur

### GL-12-102 — Fiche patrimoine d'un bien et document

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : document « REC-GL Titre de propriété » ajouté au dossier du bien par l'agence.
- **Données** : bien Villa.
- **Étapes** :
  1. `/owner/patrimoine/:propertyId` : lire valorisations, rendements, emprunts, travaux, documents.
  2. Télécharger le document.
  3. Masquer la rubrique « Documents » côté agence (GL-12-100), recharger.
- **Attendu** :
  - Fiche complète avec historique des valorisations et plus-value latente ; document téléchargé par la route du portail (fichier privé, jamais d'adresse publique).
  - Rubrique masquée : document introuvable (404) et section absente.
  - Bien d'un autre propriétaire : « Cette vue n'est pas disponible. » ou 404 (même réponse qu'un bien inexistant).
- **Gravité si échec** : Majeur

---

## L. Notifications, messagerie

### GL-12-110 — Notifications et messagerie du propriétaire

- **Rôle** : PROPRIETAIRE_PORTAIL, ADMIN_A
- **Préconditions** : un événement notifiable (reversement enregistré, GL-12-061).
- **Données** : message « REC-GL Bonjour, merci pour le reversement. »
- **Étapes** :
  1. **Plus › Notifications** : lire, filtrer « Non lues seulement », **Tout marquer comme lu**.
  2. **Plus › Messagerie** : **Nouvelle conversation** avec un membre du personnel, envoyer le message ; ADMIN_A répond.
- **Attendu** :
  - Même comportement que pour le locataire (GL-11-120 et 121) ; l'annuaire ne propose que le personnel de l'agence ; aucune conversation visible d'un autre propriétaire.
- **Gravité si échec** : Mineur

---

## M. Étanchéité entre propriétaires et entre agences

### GL-12-120 — Filtre `propertyId` d'un autre propriétaire sur baux, incidents et documents

- **Rôle** : PROPRIETAIRE_PORTAIL_2
- **Préconditions** : identifiant de la Villa (bien de P1) ; bail R1 avec locataire T1 ; ticket « REC-GL Panne portail » ; documents de R1.
- **Données** : `?propertyId=<id de la Villa>`.
- **Étapes** :
  1. Console de P2, sessions avec cookies : `GET /api/portal/owner/leases?propertyId=<Villa>`, `GET /api/portal/owner/maintenance?propertyId=<Villa>`, `GET /api/portal/owner/documents?propertyId=<Villa>`.
  2. Refaire avec `GET /api/portal/owner/installments?propertyId=<Villa>`, `/payments?propertyId=…`, `/revenues?propertyId=…`.
- **Attendu** :
  - Attendu : toutes les réponses sont **vides** (le bien ne fait pas partie du périmètre de P2).
  - **Point de vigilance (anomalie probable, Bloquant)** : pour baux, tickets de maintenance et documents, le filtre `propertyId` remplace le périmètre du propriétaire au lieu de le restreindre ; si ces trois réponses listent le bail R1 (locataire, loyer), le ticket et les documents de la Villa, il y a fuite entre propriétaires d'une même agence. Les échéances, paiements et revenus, eux, vérifient l'appartenance (réponse vide).
- **Gravité si échec** : Bloquant

### GL-12-121 — Identifiants d'objets d'un autre propriétaire

- **Rôle** : PROPRIETAIRE_PORTAIL_2
- **Préconditions** : identifiants relevés dans le réseau de P1 : bail R1, paiement de 220 000, dépôt de R1, ticket, pièce jointe, document.
- **Données** : —
- **Étapes** :
  1. Console de P2 : `GET /api/portal/owner/leases/<R1>`, `/payments/<paiement>`, `/deposits/<dépôt>/movements`, `/maintenance/<ticket>`, `/maintenance/<ticket>/attachments/<pièce>`, `/documents/<doc>/download`.
  2. Même appels depuis l'interface en saisissant `/owner/leases/<R1>` dans la barre d'adresse.
- **Attendu** :
  - Chaque appel : 404 (bail, paiement, dépôt, ticket, document « non trouvé ou accès non autorisé ») ; l'écran affiche un bandeau « Erreur » et **Retour à la liste** ; aucune donnée de T1 ; pas de 500.
- **Gravité si échec** : Bloquant

### GL-12-122 — Rapports et exports sur une propriété étrangère

- **Rôle** : PROPRIETAIRE_PORTAIL_2
- **Préconditions** : identifiant de la Villa.
- **Données** : corps `{startDate:'2026-10-01', endDate:'2026-10-31', propertyId:'<Villa>', format:'csv'}` ; export `{entityType:'payments', propertyId:'<Villa>', format:'csv'}`.
- **Étapes** :
  1. `POST /api/portal/owner/reports/revenue` puis `POST …/reports/export` depuis la console de P2.
- **Attendu** :
  - Rapport de revenus : refus ; export : fichier **sans aucune ligne** de la Villa. **Vigilance** : le refus du rapport remonte en 500 « Erreur lors de la génération du rapport de revenus. » au lieu d'un 403/404 → Mineur (aucune fuite).
- **Gravité si échec** : Majeur

### GL-12-123 — Patrimoine : bien et document d'un autre propriétaire

- **Rôle** : PROPRIETAIRE_PORTAIL_2
- **Préconditions** : identifiant de la Villa et d'un document patrimonial de la Villa.
- **Données** : `/api/portal/owner/patrimoine/properties/<Villa>` ; `…/documents/<doc>/file`.
- **Étapes** :
  1. Appels depuis la console de P2 ; adresse `/owner/patrimoine/<Villa>` dans le navigateur.
- **Attendu** :
  - 404 identique à un bien inexistant, écran « Cette vue n'est pas disponible. » ou « Vue indisponible » ; aucune valorisation ni emprunt de P1.
- **Gravité si échec** : Bloquant

### GL-12-124 — Mon compte : aucun paramètre ne désigne un autre compte

- **Rôle** : PROPRIETAIRE_PORTAIL_2
- **Préconditions** : identifiant client de P1 (`ownerClientId`, vu dans l'URL côté agence).
- **Données** : `GET /api/portal/owner/account?ownerClientId=<P1>` ; `GET /api/tenants/<A>/owner-accounts/<P1>`.
- **Étapes** :
  1. Console de P2 : les deux appels.
- **Attendu** :
  - Premier appel : renvoie le compte de **P2** (le paramètre est ignoré) ; second : 403 « Vous n'avez pas les droits nécessaires pour effectuer cette action. » (aucun droit d'agence).
- **Gravité si échec** : Bloquant

### GL-12-125 — Agence forgée, mauvais portail et routes d'agence

- **Rôle** : PROPRIETAIRE_PORTAIL, ADMIN_B
- **Préconditions** : identifiant de l'agence B.
- **Données** : en-tête `X-Portal-Tenant-Id: <B>` ; session de P1 appelant `/api/portal/tenant/dashboard` ; adresses d'agence.
- **Étapes** :
  1. P1 : `GET /api/portal/owner/dashboard` avec l'en-tête de l'agence B.
  2. P1 : `GET /api/portal/tenant/dashboard`.
  3. P1 : saisir `/tenant/<A>/patrimoine/statements` et `/tenant/<A>/finance/owner-accounts` dans la barre d'adresse.
- **Attendu** :
  - Étape 1 : 403 « Accès portail propriétaire refusé. » ; étape 2 : 403 (pas de bail de locataire actif) ; étape 3 : écran d'accès refusé (« Aucune agence rattachée » ou « Accès non autorisé »), aucune donnée de relevé ni de compte.
- **Gravité si échec** : Bloquant

### GL-12-126 — Cas limite : bail dont le bailleur n'est pas le propriétaire du bien

- **Rôle** : ADMIN_A, PROPRIETAIRE_PORTAIL, PROPRIETAIRE_PORTAIL_2
- **Préconditions** : un bail test sur le Studio (bien de P1) créé avec **P2** comme bailleur (fichier 02).
- **Données** : —
- **Étapes** :
  1. P1 puis P2 : ouvrir **Mes biens**, **Revenus**, **Mon compte**.
  2. Clôturer ou supprimer le bail test.
- **Attendu** :
  - Comportement documenté à constater : le périmètre inclut les biens rattachés directement **et** ceux loués par un bail dont l'utilisateur est le bailleur ; P2 verrait alors le Studio. À signaler à l'agence : un bailleur différent du propriétaire du bien donne un accès au bien à un tiers (Majeur si non voulu). Les comptes courants doivent suivre le bailleur du bail.
- **Gravité si échec** : Majeur

---

## Couverture

| Sous-fonctionnalité du classeur (Portail propriétaire)                             | Cas                                                                                                                     |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Tableau de bord                                                                    | GL-12-010, 011, 012                                                                                                     |
| Consulter mes biens (périmètre, mandats, filtres)                                  | GL-12-004, 005, 020                                                                                                     |
| Consulter le détail d'un bien                                                      | GL-12-021, 022                                                                                                          |
| Consulter mes baux / détail d'un bail                                              | GL-12-030, 031, 121                                                                                                     |
| Consulter mes revenus (liste, résumé, par bien, par mois)                          | GL-12-011, 040, 041                                                                                                     |
| Consulter mes échéances                                                            | GL-12-032                                                                                                               |
| Consulter mes paiements reçus                                                      | GL-12-033, 041                                                                                                          |
| Consulter mes dépôts de garantie                                                   | GL-12-034                                                                                                               |
| Consulter mon compte courant agence                                                | GL-12-060 à 065, 124                                                                                                    |
| Consulter mes documents                                                            | GL-12-070, 071                                                                                                          |
| Générer un rapport de revenus                                                      | GL-12-080, 081, 085                                                                                                     |
| Générer un rapport d'occupation                                                    | GL-12-082, 081                                                                                                          |
| Exporter mes données                                                               | GL-12-083, 084, 085                                                                                                     |
| Gérer mes préférences                                                              | GL-12-090                                                                                                               |
| Maintenance (tickets de ses biens, lecture seule)                                  | GL-12-095, 096                                                                                                          |
| Consulter mon patrimoine / fiche patrimoine / document patrimonial                 | GL-12-100, 101, 102, 123                                                                                                |
| Rapport mensuel par lien sécurisé (côté propriétaire)                              | cas GL-10-034 à 036 du fichier 10 (le portail n'a pas d'écran de relevé)                                                |
| Notifications persistantes et messagerie interne                                   | GL-12-110                                                                                                               |
| Accès propriétaire : création du compte, connexion, redirections, agence suspendue | GL-12-001, 002, 003, 006, 125 ; agence suspendue ou compte désactivé : non testable sans action du super-administrateur |
| Étanchéité entre propriétaires / agences                                           | GL-12-022, 071, 120 à 126                                                                                               |
| Langue, mobile, erreurs réseau, injection                                          | fichier 14                                                                                                              |
