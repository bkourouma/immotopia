# Résultats de la recette Gestion locative — 2026-11-03

Révision testée : `orch/2026-11-03-recette-locatif` (départ `main` @ `6be7f91a`),
base dédiée `immotopia_recette_locatif`. Outils : navigateur intégré de
Claude Code et Playwright (Chrome headless du poste). Anomalies : bus
`.agent-bus/bugs/` (identifiants `BUG-2026-11-03-NNN`), reprises dans
[ANOMALIES.md](ANOMALIES.md).

Légende : `passé`, `échoué` (+ anomalie), `bloqué` (+ cause), `non joué`.

## Bilan par fichier

| Fichier | Cas | Passés consignés | Échoués historiques | Bloqués | Partiels / à confirmer | Non joués explicites | Sans verdict |
| ------- | --: | ---------------: | ------------------: | ------: | ---------------------: | -------------------: | -----------: |
| 01      |  58 |                8 |                   0 |       0 |                      1 |                    0 |           49 |
| 02      | 101 |               85 |                  11 |       0 |                      4 |                    0 |            1 |
| 03      |  62 |               53 |                   5 |       1 |                      2 |                    1 |            0 |
| 04      | 123 |               74 |                   8 |       1 |                     16 |                   23 |            1 |
| 05      |  61 |               49 |                   2 |       0 |                      1 |                    0 |            9 |
| 06      |  59 |               46 |                   3 |       0 |                     10 |                    0 |            0 |
| 07      |  36 |               29 |                   6 |       0 |                      1 |                    0 |            0 |
| 08      |  68 |               41 |                   1 |       1 |                     21 |                    4 |            0 |
| 09      |  48 |               32 |                   4 |       1 |                      3 |                    8 |            0 |
| 10      |  58 |               37 |                   2 |      15 |                      0 |                    4 |            0 |
| 11      |  52 |               18 |                   7 |       5 |                      6 |                   15 |            1 |
| 12      |  47 |               22 |                   7 |       1 |                      8 |                    9 |            0 |
| 13      |  39 |               25 |                   0 |       1 |                     13 |                    0 |            0 |
| 14      |  40 |                4 |                   6 |       0 |                     15 |                   15 |            0 |
| Total   | 852 |              523 |                  62 |      26 |                    101 |                   79 |           61 |

Bilan calculé par `node scripts/recette-coverage.cjs` à partir des cas définis et des derniers verdicts explicites de ce fichier. Les réussites restent celles des révisions citées. Un échec historique peut avoir été corrigé au bus : le retest d’une anomalie ne valide pas automatiquement toutes les variantes du scénario. « Sans verdict » signifie absence de résultat consigné, et non preuve que le cas n’a jamais été joué. Les partiels et réserves ne sont pas comptés comme réussites complètes.

## Détail

### 01 — Paramétrage

| Cas       | Résultat        | Remarque                                                                |
| --------- | --------------- | ----------------------------------------------------------------------- |
| GL-01-001 | passé           | Menus de la gestion locative présents pour ADMIN_A (navigateur intégré) |
| GL-01-004 | passé           | Contact C1 créé (201), rôle Locataire                                   |
| GL-01-005 | passé           | Champs obligatoires et e-mail invalide signalés, aucun envoi            |
| GL-01-019 | passé           | Cartes des paramètres financiers ; agence déjà paramétrée               |
| GL-01-020 | passé           | 8 % de 200 000 = 16 000, net 184 000                                    |
| GL-01-022 | passé           | TVA 18 % : 2 880, net 181 120                                           |
| GL-01-023 | passé (partiel) | Bornes 0-100 ; champ vidé et interrupteur non joués ici                 |
| GL-01-024 | passé           | Bornes et arrondis du taux d'honoraires                                 |
| GL-01-027 | passé           | Enregistrement (200) et persistance après rechargement                  |

### 11 — Portail locataire (Playwright, priorité Bloquant puis Majeur)

| Cas                                                 | Résultat         | Remarque                                                                          |
| --------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| GL-11-001, 002                                      | bloqué           | Prérequis : bail neuf avec compte locataire non préparé                           |
| GL-11-003                                           | passé            | Onglets du portail ; sur mobile 375 px, pas d'onglet « Plus » (écart de scénario) |
| GL-11-004                                           | passé (partiel)  | Message d'erreur neutre ; reconnexion après changement de mot de passe non jouée  |
| GL-11-005, 007, 008                                 | bloqué           | Prérequis : locataire sans bail actif, colocataire, double agence                 |
| GL-11-006                                           | passé            | Redirections et refus entre portails (403 copropriétaire)                         |
| GL-11-010                                           | passé            | Bail BAIL-2026-0019 cohérent avec l'agence                                        |
| GL-11-011                                           | échoué           | BUG-2026-11-03-005                                                                |
| GL-11-012                                           | passé (partiel)  | Paiement complémentaire non joué                                                  |
| GL-11-016                                           | passé (partiel)  | Voir BUG-2026-11-03-005                                                           |
| GL-11-020                                           | passé            |                                                                                   |
| GL-11-022                                           | échoué           | BUG-2026-11-03-002                                                                |
| GL-11-030                                           | passé (remarque) | Cartes de synthèse 47/48 : la Partielle n'est pas comptée                         |
| GL-11-032                                           | passé            |                                                                                   |
| GL-11-033                                           | échoué           | BUG-2026-11-03-006                                                                |
| GL-11-035                                           | passé            | Filtres non joués                                                                 |
| GL-11-036                                           | passé            | Solde du relevé incohérent avec l'accueil (BUG-005)                               |
| GL-11-050, 051                                      | passé            | Justificatif servi seulement par la route agence authentifiée                     |
| GL-11-052                                           | passé (remarque) | Voir BUG-2026-11-03-009                                                           |
| GL-11-053                                           | échoué           | BUG-2026-11-03-004                                                                |
| GL-11-054                                           | passé            | Approbation : paiement alloué, échéance Payée, notification                       |
| GL-11-055                                           | passé (remarque) | Voir BUG-2026-11-03-008                                                           |
| GL-11-056                                           | passé (partiel)  |                                                                                   |
| GL-11-070                                           | échoué           | BUG-2026-11-03-003                                                                |
| GL-11-080                                           | échoué           | BUG-2026-11-03-002                                                                |
| GL-11-081                                           | passé            | Document d'un autre locataire : 404 (id mal formé : 500, BUG-007)                 |
| GL-11-103                                           | passé            | Ticket d'un autre locataire : 404 partout                                         |
| GL-11-110                                           | passé            | Échéance d'un autre locataire : 404 (id mal formé : 500, BUG-007)                 |
| GL-11-111                                           | échoué           | BUG-2026-11-03-007                                                                |
| GL-11-112, 113, 114                                 | passé            | Isolation agence, fichiers privés, portails croisés                               |
| GL-11-120                                           | passé (partiel)  | Notifications reçues ; cloche non jouée                                           |
| GL-11-013-015, 017, 031, 034, 060-064, 100-102, 121 | non joué         | Reprendre à GL-11-060                                                             |

### 05 — Échéances (Playwright, cas 001 à 030)

Les correctifs des échéances (commit `fa35f706`) étaient en service pendant ce bloc : les cas 012 à 015, qui attendaient des échéances manquantes ou une 13e échéance, valident la correction par l'interface.

| Cas             | Résultat                 | Remarque                                                                                                                                  |
| --------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| GL-05-001       | passé (écarts)           | 14 baux REC-GL (BAIL-2026-0056 à 0069), créés directement « Actif », numéro automatique ; dates au format AAAA-MM-JJ (BUG-2026-11-03-012) |
| GL-05-002, 003  | passé                    | 12 échéances, POST 201                                                                                                                    |
| GL-05-004 à 006 | passé                    | Trimestriel, semestriel, annuel conformes                                                                                                 |
| GL-05-007 à 009 | passé                    | Jours 31, 30, 29 repliés sur la fin de février (2027 et 2028)                                                                             |
| GL-05-010, 011  | passé                    | Deux échéances au 05/11/2026 (10/2026 et 11/2026), loyer plein sans prorata — à valider par le métier                                     |
| GL-05-012       | passé                    | Bail sans fin : 12 échéances                                                                                                              |
| GL-05-013       | passé (écart)            | Bail de 12 mois exacts : 12 échéances (le scénario en attendait 13 comme anomalie)                                                        |
| GL-05-014, 015  | passé                    | Début le 31/01/2027 : 12 mensuelles, 4 trimestrielles                                                                                     |
| GL-05-016       | passé                    | Double clic : un seul POST                                                                                                                |
| GL-05-017       | passé                    | Refus en 400 (le scénario attend 409), tableau inchangé                                                                                   |
| GL-05-018       | passé (partiel)          | Bail Terminé : génération refusée ; variante Annulé non jouée                                                                             |
| GL-05-019       | passé                    | Agence B : 404/403, aucune donnée de A                                                                                                    |
| GL-05-020       | échoué                   | BUG-2026-11-03-011 (boutons d'écriture visibles pour COMPTABLE_A) ; LECTEUR_A refusé partout                                              |
| GL-05-021       | passé (écart)            | Devise « XOF » à chaque ligne, pas de pied « FCFA »                                                                                       |
| GL-05-022, 023  | passé                    | Paiement partiel 60 000, filtres Statut et Retard                                                                                         |
| GL-05-024       | passé (écart de libellé) | Message d'état vide différent du scénario                                                                                                 |
| GL-05-025       | passé                    | Campagne du mois avec confirmation ; relance sans doublon non rejouée                                                                     |
| GL-05-026 à 028 | passé                    | Filtres, URL, pagination                                                                                                                  |
| GL-05-029       | passé (constat)          | Pas de recherche texte ni de filtre de période                                                                                            |
| GL-05-030       | échoué                   | BUG-2026-11-03-010 (filtre Statut repris par l'onglet Paiements, 400)                                                                     |
| GL-05-031 à 052 | voir suite               | Joués dans « 05 — suite »                                                                                                                 |

#### 05 — suite (Playwright, révision `33647d31`, 23 cas)

Aucun cas Bloquant échoué. Détail d'échéance, encaissement rapide et
complément, recalcul idempotent, suppression des échéances (bail sans
paiement, refus en 409 avec paiements alloués, bail terminé), lien de
paiement partageable de bout en bout (création, jeton affiché une fois,
page publique sans donnée personnelle, paiement simulé réussi puis
lien invalidé, échec et annulation sans effet sur l'échéance).

| Cas                                                           | Résultat        | Anomalie / remarque                                                                |
| ------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------- |
| GL-05-031, 034, 035, 037, 039 à 045, 047 à 049, 051, 052, 018 | passé           | Bail annulé : génération refusée (409) ; suppression : annulations au relevé       |
| GL-05-032, 033, 046, 050                                      | passé (écart)   | Bouton « Voir » présent, 404 au lieu de 500, échéances échues créées « En retard » |
| GL-05-036                                                     | passé (réserve) | Double clic : deux POST, un seul paiement créé (idempotence serveur)               |
| GL-05-038                                                     | passé (adapté)  | Totaux dus avec les pénalités déjà calculées (162 000 et 163 200)                  |

Écarts de scénario : les pénalités sont déjà calculées quand les cas
031 et 038 se jouent ; le fragment du lien de paiement est retiré de
l'adresse après le premier chargement, donc F5 affiche « Lien invalide
ou expiré » et ne compte pas de consultation (050).

### 13 — Rôles, permissions, isolation (Playwright + API)

Aucune fuite entre agences ni entre portails, aucune écriture hors droits (43 écritures refusées par rôle, 31 écritures croisées entre agences sans effet, état relu par ADMIN_A avant et après). Le correctif du filtre `?propertyId=` du portail propriétaire (BUG-2026-11-03-001) est confirmé.

| Cas             | Résultat               | Remarque                                                                                             |
| --------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| GL-13-001 à 003 | passé (partiel)        | Rôles des 3 comptes vérifiés ; formulaire d'invitation non rejoué                                    |
| GL-13-005 à 008 | partiel                | Menus de premier niveau conformes ; sous-menus non dépliés                                           |
| GL-13-010       | passé                  | LECTEUR_A refusé partout (403) ; `/leases/new` s'affiche mais l'écriture est refusée                 |
| GL-13-011, 012  | passé (anomalie)       | BUG-2026-11-03-014 (refus « Forbidden » / message anglais)                                           |
| GL-13-013       | passé (API)            | COMPTABLE_A lit tout le locatif                                                                      |
| GL-13-020 à 024 | passé                  | Écritures refusées en 403 ; liens de relevé sans jeton dans la liste                                 |
| GL-13-026       | partiel                | Aucune demande de signature dans A                                                                   |
| GL-13-027       | passé                  | COMPTABLE_A crée un reversement (attendu) mais ne l'annule pas                                       |
| GL-13-028       | bloqué (environnement) | Chiffrement des coordonnées bancaires non configuré sur l'API de recette : pas de mandat             |
| GL-13-029       | passé (API)            | Paramètres en écriture refusés hors admin                                                            |
| GL-13-031       | passé (constat)        | LECTEUR_A lit les conditions par propriétaire (e-mails) et les commissions des collègues — à valider |
| GL-13-035, 036  | passé (remarque)       | « Révoquer les sessions » ne coupe pas le jeton d'accès en cours (15 min)                            |
| GL-13-040 à 048 | passé                  | Isolation entre agences complète ; GL-13-044 : BUG-2026-11-03-015 (400 au lieu de 404, sans fuite)   |
| GL-13-049       | non testable           | Journal de l'API non lu                                                                              |
| GL-13-060 à 063 | non testable           | Aucun compte Syndic/Promoteur/Patrimoine ni agence suspendue                                         |
| GL-13-070, 071  | passé                  | Portails croisés et routes agence refusés sans donnée                                                |

### 02 — Baux (Playwright, environ 55 cas sur 101)

| Cas                                                                                     | Résultat         | Remarque                                                             |
| --------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------- |
| GL-02-003, 056, 064, 075                                                                | passé (écart)    | LECTEUR_A refusé partout (403) ; le scénario attendait une lecture   |
| GL-02-004, 005                                                                          | passé (écarts)   | L1 = BAIL-2026-0070 ; « CFA » au lieu de « FCFA », bien sans adresse |
| GL-02-008, 014, 015, 054                                                                | passé            | Échéances générées, refus de doublon (400)                           |
| GL-02-016                                                                               | échoué           | BUG-2026-11-03-017 (taux 0,5 affiché 50 %)                           |
| GL-02-018                                                                               | passé            | Dates incohérentes acceptées (constat attendu)                       |
| GL-02-057                                                                               | passé            |                                                                      |
| GL-02-058                                                                               | passé (remarque) | Loyer vide : « doit être supérieur à 0 » au lieu de « est requis »   |
| GL-02-059                                                                               | échoué           | BUG-2026-11-03-022 (date de fin impossible à retirer)                |
| GL-02-060                                                                               | échoué           | BUG-2026-11-03-023 (jour d'échéance et devise non enregistrés)       |
| GL-02-061                                                                               | échoué           | BUG-2026-11-03-018 (loyer modifié, échéances inchangées)             |
| GL-02-062                                                                               | échoué           | BUG-2026-11-03-021 (locataire en identifiant brut)                   |
| GL-02-065                                                                               | passé (écart)    | Agence B : 404 au lieu du 400 attendu                                |
| GL-02-066 à 069                                                                         | passé            | Suspendu, réactivé, terminé et annulé (bien libéré)                  |
| GL-02-070                                                                               | échoué           | BUG-2026-11-03-019 (fiche remplacée par un bloc Erreur)              |
| GL-02-071 à 073                                                                         | passé            | Transitions interdites refusées (400)                                |
| GL-02-076 à 079                                                                         | passé            | Suppression, refus si paiements alloués                              |
| GL-02-080                                                                               | passé (partiel)  | Hors scénario : BUG-2026-11-03-020 (onglet Dépôt : GET 409)          |
| GL-02-081, 082                                                                          | passé            | Numéro réutilisé, refus LECTEUR_A et agence B, double clic           |
| GL-02-083 à 087                                                                         | passé            | Co-locataires (API)                                                  |
| GL-02-089, 092, 093, 095                                                                | passé            | Conditions et dérogations d'honoraires                               |
| GL-02-096                                                                               | passé (partiel)  |                                                                      |
| GL-02-098, 099                                                                          | passé            | Honoraires, TVA et commission calculés et figés                      |
| GL-02-100                                                                               | passé (partiel)  | COMPTABLE_A non testé                                                |
| GL-02-001, 002, 006, 007, 009-013, 017, 019-053, 055, 063, 088, 090, 091, 094, 097, 101 | voir suite       | Joués dans « 02 — suite » (sauf 027, 049)                            |

#### 02 — suite (Playwright, révision `2400cd6e`, 46 cas)

Aucun cas Bloquant échoué. Création jouée sur des biens dédiés « REC-GL Bien
B02-n » : périodicités mensuelle, trimestrielle et annuelle, repli en fin de
mois (31/01 → 28/02, 29/02/2028), société locataire, notes de 4 098
caractères, pénalité fixe avec délai de grâce, mails « bail activé » sans mail
de création de compte, puis premier accès du locataire au portail.

| Cas                                                                | Résultat      | Anomalie / remarque                                                                        |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------ |
| GL-02-001, 006, 007, 009 à 013, 017, 019 à 023, 025, 028, 030, 037 | passé         | Baux 0113 à 0119, échéances justes, propriétaire prérempli, aucun champ « Numéro de bail » |
| GL-02-038, 040, 042, 044 à 046, 048, 050, 052, 053, 055, 063       | passé         | Liste, filtres dans l'URL, pagination, exports (121 lignes), 404 propre, double clic       |
| GL-02-091, 094, 097, 101                                           | passé         | Conditions du propriétaire, bornes du taux, gestionnaire inactif refusé, bien vendu        |
| GL-02-002, 024, 026, 029, 041, 043, 047, 051, 088, 090             | passé (écart) | Voir les écarts de scénario ci-dessous                                                     |
| GL-02-031, 034                                                     | échoué        | BUG-2026-11-04-056 (signe moins et virgule supprimés sans message)                         |
| GL-02-033, 035                                                     | passé (écart) | BUG-2026-11-04-056 (« 5,5 » devient 31, « 0,0001 » devient 1)                              |
| GL-02-032                                                          | échoué        | BUG-2026-11-04-057 (loyer de 99 999 999 999 : 500)                                         |
| GL-02-036                                                          | échoué        | BUG-2026-11-04-058 (erreur serveur invisible à l'étape Notes)                              |
| GL-02-039                                                          | échoué        | BUG-2026-11-04-059 (second bail actif sur un bien déjà loué, via la fiche du bien)         |
| GL-02-027, 049                                                     | non joué      | Mobile 375 px de l'assistant non joué                                                      |

Écarts de scénario : biens P1-P14 remplacés par « REC-GL Bien B02-n » ; la
liste « Propriété » ne propose que les biens libres ; saisie d'une date
antérieure vidée sans message (029) ; pied « Tous les montants sont en
FCFA. » absent (041) ; l'onglet du bail reste après F5 (051, voulu depuis
BUG-2026-11-04-041) ; LECTEUR_A refusé sur les co-locataires (088) ; taux
de l'agence modifié par un autre cas (090) ; aucune colonne triable (047).

### 10 — Propriétaires, relevés, reversements (Playwright, révision `2c6a4ddd`)

Le jeu de référence REC-GL (propriétaires P1/P2, baux R1/R2/R3 et leurs
paiements d'octobre) n'existait pas : l'intention a été jouée sur les
propriétaires historiques de l'agence A (Koné, Soro, Fofana, Yao, Coulibaly).
Les correctifs du lot relevés/reversements (`2fd88c40`) sont tous confirmés,
sauf la garde de statut sur « Envoyer » d'un relevé Payé : le 409 observé
venait du refus de consentement e-mail, la garde n'est donc pas prouvée en
direct (elle est couverte par les tests unitaires).

| Cas                                                                    | Résultat       | Anomalie / remarque                                                                                   |
| ---------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| GL-10-001, 004, 005                                                    | passé          | Taux agence 10 %, TVA 18 %, part du gestionnaire 40 %                                                 |
| GL-10-002                                                              | échoué         | BUG-2026-11-03-026 (forfait 0 devient 1 FCFA et est enregistré)                                       |
| GL-10-003                                                              | passé (adapté) | Forfait propriétaire sur REC-GL-Chantal DIALLO                                                        |
| GL-10-011, 014                                                         | passé (adapté) | Historique et relevé sans encaissement                                                                |
| GL-10-016 à 019                                                        | passé          | Bien ou contact d'un autre propriétaire ou de l'agence B refusé (404/400)                             |
| GL-10-025 à 031, 033 à 038                                             | passé          | Envoi, consentement, lien sécurisé, révocation, limitation (429), injection HTML neutralisée          |
| GL-10-040, 041, 043, 044, 046                                          | passé          | Compte propriétaire, reversement, dépassement refusé (409), double clic                               |
| GL-10-045                                                              | échoué         | BUG-2026-11-03-025 (montant à virgule multiplié), BUG-2026-11-03-027 (API accepte un montant décimal) |
| GL-10-048 à 051, 053 à 056                                             | passé          | Annulation, deux onglets, solde négatif, relevé Payé figé                                             |
| GL-10-061, 063                                                         | passé          | Commissions des agents, abonnement sans associations                                                  |
| GL-10-007, 010, 012, 013, 015, 020, 042, 047, 052, 060, 062, 070 à 073 | bloqué         | Données de référence REC-GL absentes                                                                  |
| GL-10-006, 027, 032, 080                                               | non joué       |                                                                                                       |

### 03 — Vie du bail et dépôt de garantie (Playwright, révision `fa868920`, ~50 cas)

Correctifs confirmés : renouvellement avec révision planifiée (015), résiliation
passée qui libère le bien (027, 028), solde de tout compte dès la première
lecture (033), retenue au-delà du dépôt refusée (056).

| Cas                                   | Résultat        | Anomalie / remarque                                                                                  |
| ------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| GL-03-001 à 006, 008 à 015            | passé           | Révisions, renouvellement, relevé du compte locataire                                                |
| GL-03-007                             | échoué          | BUG-2026-11-03-030 (loyer 99 999 999 999 → 500), BUG-2026-11-03-031 (charges négatives ramenées à 0) |
| GL-03-017                             | passé (écart)   | Date non postérieure vidée par le sélecteur : message « requise »                                    |
| GL-03-018 à 020, 022 à 035, 037 à 040 | passé           | Avenants, résiliations, solde de tout compte, droits (COMPTABLE_A 403, agence B 404)                 |
| GL-03-021                             | échoué          | BUG-2026-11-03-029 (l'aide masque le message de validation)                                          |
| GL-03-041                             | échoué          | BUG-2026-11-03-024 (409 à la première ouverture ; corrigé ensuite dans `fa1319b3`)                   |
| GL-03-042, 043, 045 à 056, 058, 061   | passé           | Mouvements de dépôt, bornes, refus croisés                                                           |
| GL-03-044                             | échoué          | BUG-2026-11-03-034 (même cause que 029)                                                              |
| GL-03-057                             | passé (écart)   | Montant vide : « supérieur à 0 »                                                                     |
| GL-03-059                             | passé (partiel) | Téléchargement CSV non déclenché                                                                     |
| GL-03-060                             | échoué          | BUG-2026-11-04-012 (cible du dépôt non mise à jour avec le bail)                                     |
| GL-03-016, 036, 062                   | non joué        | 036 relève du fichier 04 ; 062 (portail, e-mails) non tenté                                          |

### 07 — Pénalités (Playwright, révision `fa868920`, 35 cas)

Correctifs du lot pénalités (`e17931a8`) confirmés : taux 0 sur le bail sans
pénalité, aucune pénalité sur bail annulé ou suspendu, pénalité ajustée non
recalculée ni doublée, justificatif conservé, refus 404 pour une autre agence.
Trois anomalies **bloquantes** : le compte du locataire ne suit pas
l'échéance après un ajustement ou la suppression d'une pénalité ajustée.

| Cas                                                                          | Résultat         | Anomalie / remarque                                                                       |
| ---------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| GL-07-001 à 012, 015, 016, 020, 022, 023, 025, 027, 028, 030, 032, 034 à 036 | passé            | Calcul, plafonds, taux 0, idempotence, ajustement, justificatif, isolation, exports       |
| GL-07-013                                                                    | passé (écart)    | Seuil de solde minimum de l'agence (5 000, non affiché) annule la pénalité fixe           |
| GL-07-014                                                                    | passé (réserve)  | Ligne d'août vue à 5 000 puis 0 au recalcul ; à rejouer sur un bail neuf                  |
| GL-07-017                                                                    | passé (écart)    | BUG-2026-11-04-013 (10 000 000 000 → 500), BUG-2026-11-04-018 (montant vidé sans message) |
| GL-07-018                                                                    | échoué           | BUG-2026-11-04-001 (bloquant)                                                             |
| GL-07-019                                                                    | échoué           | BUG-2026-11-04-002 (bloquant)                                                             |
| GL-07-021                                                                    | échoué           | BUG-2026-11-04-004 (bloquant)                                                             |
| GL-07-024                                                                    | passé (anomalie) | BUG-2026-11-04-014 (JSON du justificatif affiché)                                         |
| GL-07-026                                                                    | échoué           | BUG-2026-11-04-015 (nom accentué), BUG-2026-11-04-019 (faux PNG accepté)                  |
| GL-07-029                                                                    | passé (anomalie) | BUG-2026-11-04-018 (boutons visibles pour COMPTABLE_A)                                    |
| GL-07-031                                                                    | échoué           | BUG-2026-11-04-017 (carte mobile sans justificatif)                                       |
| GL-07-033                                                                    | échoué           | Écart avec la comptabilité dans la balance âgée : conséquence de 001, 002, 004            |

### 08 — Prélèvement bancaire (Playwright, révision `6dc85c77`, jour J = 04/11/2026)

Aucun cas Bloquant joué en échec. Remises préparées pour le 05/11/2026 (première
date acceptée) ; les sections G et H (retour banque, GL-08-051 à 066) sont
reportées au 05/11/2026. Aucun IBAN complet dans les réponses JSON ni les
e-mails ; seul le fichier de remise et le PDF d'autorisation le portent.

| Cas                                                                 | Résultat      | Anomalie / remarque                                                                                                                         |
| ------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GL-08-001 à 026, 028, 029, 031 à 034, 038, 041, 043, 046, 048 à 050 | passé         | Créanciers, contrôle IBAN/RIB, mandats (cycle complet, PDF, scan), remises R1/R2 validées, avis, fichier CSV, déposées, droits et isolation |
| GL-08-030                                                           | passé (écart) | Date proposée = prochain jour de collecte du créancier, pas J+1                                                                             |
| GL-08-035                                                           | échoué        | BUG-2026-11-04-020 (ligne annulée non remise à l'actualisation)                                                                             |
| GL-08-036                                                           | passé (écart) | Une ligne retirée n'est pas ré-ajoutée par l'actualisation                                                                                  |
| GL-08-027                                                           | bloqué        | Signature électronique non activée sur le serveur de recette (503)                                                                          |
| GL-08-037, 039, 040, 042, 044, 045, 047, 067, 068                   | non joué      |                                                                                                                                             |
| GL-08-051 à 066                                                     | reporté       | Retour banque possible à partir du 05/11/2026                                                                                               |

### 09 — Caisse, tableaux de bord, exports (Playwright, révision `6dc85c77`, ~36 cas)

Les 13 cas Bloquant sont passés : aucun montant ni solde faux, aucune fuite
entre agences. Tranches d'âge recalculées pour le 04/11/2026.

| Cas                                                                      | Résultat         | Anomalie / remarque                                                                                                                |
| ------------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GL-09-001 à 010, 012 à 016, 020, 022, 024 à 029, 032, 034, 035, 038, 040 | passé            | Tuiles, graphiques, balance clients, relevé, caisse (ouverture, encaissements, clôture), écritures comptables, droits et isolation |
| GL-09-003, 008, 019, 031                                                 | passé (adapté)   | Données préparées différemment ; validation de caisse réservée à ADMIN_A                                                           |
| GL-09-011                                                                | échoué           | BUG-2026-11-04-022 (code MOBILE_MONEY dans la file de travail)                                                                     |
| GL-09-017                                                                | échoué           | BUG-2026-11-04-021 (écart avec la comptabilité pour un loyer émis non échu)                                                        |
| GL-09-023                                                                | échoué           | BUG-2026-11-04-023 (fond de caisse négatif ramené à 0 et accepté)                                                                  |
| GL-09-030                                                                | passé (partiel)  | Cas excédent non joué                                                                                                              |
| GL-09-036                                                                | passé (anomalie) | BUG-2026-11-04-024 (mois sans accents dans les libellés)                                                                           |
| GL-09-037                                                                | passé (réserve)  | Paiement réactivé puis annulé de nouveau : références d'écriture en double (BUG-2026-11-04-025)                                    |
| GL-09-039                                                                | bloqué           | Bail REC-GL-PAY-1 (bloc 06) absent                                                                                                 |
| GL-09-018, 021, 033, 041 à 048                                           | voir suite       | Exports joués dans « 09 — suite »                                                                                                  |

#### 09 — suite (Playwright, révision `33647d31`, exports)

Fichiers relus : nombre de lignes égal au compteur de l'écran, BOM UTF-8,
séparateur « ; », montants numériques, statuts en français, accents.

| Cas                                                 | Résultat        | Anomalie / remarque                                                                            |
| --------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| GL-09-043                                           | passé           | Échéances : 1 995 lignes en CSV et Excel, 12 lignes filtrées (CSV, Excel, PDF)                 |
| GL-09-044                                           | échoué          | BUG-2026-11-04-061 (« En ligneRéussi »), BUG-2026-11-04-062 (dates longues, « '- »)            |
| GL-09-045                                           | passé (partiel) | Pénalités conformes ; Dépôt et Documents sans données sur le bail choisi                       |
| GL-09-021                                           | non concluant   | Deux boutons « Exporter » sur la balance âgée ; aucun téléchargement observé depuis le premier |
| GL-09-018, 033, 041, 042, 046 à 048, 030 (excédent) | non joué        | Reprendre à GL-09-046                                                                          |

### 12 — Portail propriétaire (Playwright, révision `fa868920`, ~38 cas sur 47)

Pas de jeu REC-GL dans la base : joué avec Moussa Koné (PROPRIETAIRE_PORTAIL_2)
et Sandrine Coulibaly (PROPRIETAIRE_PORTAIL), attendus recalculés côté agence.
Rejeu de BUG-2026-11-03-001 : corrigé. Un `propertyId` étranger (autre
propriétaire, agence B, UUID inventé, valeur invalide) donne une liste vide
sur baux, incidents, documents, échéances, paiements et revenus.

| Cas                                               | Résultat        | Anomalie / remarque                                                                                   |
| ------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| GL-12-003, 011, 022, 030, 032, 033                | passé           | Revenus recalculés (mois 134 000, année 7 564 000, total 16 505 000), 404 identiques                  |
| GL-12-041, 061, 062, 070, 071, 080, 081           | passé           | Paiement puis annulation : compteurs revenus à l'identique ; exports PDF, CSV, Excel                  |
| GL-12-085, 090, 100, 102, 120, 121, 123, 124      | passé           | `ownerClientId` forgé ignoré, 404 partout                                                             |
| GL-12-060                                         | passé (adapté)  | Soldes 276 000 et 247 500, identiques côté agence                                                     |
| GL-12-010, 012, 020, 021, 040, 125                | passé (partiel) | Passage en maintenance, onglets secondaires, filtre Villa et saisie navigateur non joués              |
| GL-12-031                                         | échoué          | BUG-2026-11-04-006 (reste à payer avec échéances non échues), corrigé dans 34694924                   |
| GL-12-034                                         | échoué          | BUG-2026-11-04-011 (montant retenu = montant détenu), corrigé dans 34694924                           |
| GL-12-064                                         | échoué          | BUG-2026-11-04-003 (indicateurs du compte sans retenue ni dépôt conservé), corrigé                    |
| GL-12-082                                         | échoué          | BUG-2026-11-04-008 (occupation à une date passée), corrigé dans 34694924                              |
| GL-12-083                                         | passé (réserve) | BUG-2026-11-04-009 (valeurs techniques anglaises dans les exports), corrigé                           |
| GL-12-095                                         | échoué          | BUG-2026-11-04-007 (« undefined undefined » pour l'assigné), corrigé dans 34694924                    |
| GL-12-101                                         | échoué          | BUG-2026-11-04-010 (rendement 0,00 % sans valorisation), corrigé dans 34694924                        |
| GL-12-122                                         | échoué          | BUG-2026-11-04-005 (500 au lieu d'un refus, sans fuite), corrigé dans 34694924                        |
| GL-12-006                                         | bloqué          | Aucun propriétaire client de l'agence B dans le seed                                                  |
| GL-12-002                                         | passé (partiel) | Barre mobile non vérifiée                                                                             |
| GL-12-001, 004, 005, 063, 065, 084, 096, 110, 126 | non joué        | Exigent des biens, mandats, baux ou comptes REC-GL ; 084 : neutralisation CSV relue dans `lib/csv.ts` |

Écarts de scénario : GL-12-033 (l'écran Paiements ne liste que les paiements
réussis hors dépôt, total égal aux revenus), GL-12-060/064/065 (pas
d'honoraires ni de TVA dans le compte du seed), GL-12-081 (date pré-remplie,
message « Veuillez sélectionner une date » inaccessible).

### 04 — États des lieux, documents, signature (Playwright, révision `34694924`, ~70 cas sur 123)

Aucun cas Bloquant échoué. Envoi du **contrat de bail** en signature bloqué
par l'environnement : l'API de recette avait la conversion Word → PDF
désactivée (`DOCX_PDF_CONVERTER=disabled`, 503). Toute la chaîne de
signature (jeton, code, signature, scellé, droits, isolation) a été jouée
sur les états des lieux, qui produisent leur PDF eux-mêmes. Conversion
activée ensuite sur l'API de recette pour rejouer la section D.

| Cas                                                                                                                                                                               | Résultat        | Anomalie / remarque                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| GL-04-001, 002, 004 à 006, 009, 010, 012, 014 à 016, 018 à 020                                                                                                                    | passé           | Modèles vide et meublé, photos JPEG/PNG/WebP, 409 sur un état finalisé, isolation                        |
| GL-04-025, 027, 028, 031 à 038                                                                                                                                                    | passé           | Sortie : rappels d'entrée, retenues (total 475 000), compteurs                                           |
| GL-04-046 à 052, 055, 062, 065, 067, 070                                                                                                                                          | passé           | Contrat `.docx` complet sans `{{…}}`, `-A2`, régénération, reçu, export CSV                              |
| GL-04-072, 075, 076, 080, 082, 083, 096, 099, 100, 103, 104, 106, 108, 121, 122                                                                                                   | passé           | Signature d'état des lieux (e-mail, sur place, tracé), PDF scellé, jetons invalides, droits et isolation |
| GL-04-011                                                                                                                                                                         | passé (écart)   | Bandeau de restauration réaffiché après « Retour » (écart annoncé par le scénario)                       |
| GL-04-023, 064                                                                                                                                                                    | passé (écart)   | LECTEUR_A 403 dès la lecture ; COMPTABLE_A sans accès aux documents (voir H26)                           |
| GL-04-013                                                                                                                                                                         | échoué          | BUG-2026-11-04-026 (photo vide, faux JPEG, HTML acceptés), corrigé dans 1ea65367                         |
| GL-04-053, 054                                                                                                                                                                    | échoué          | BUG-2026-11-04-029 (types ramenés à « Reçu de loyer »), corrigé dans b8a62aae                            |
| GL-04-056                                                                                                                                                                         | échoué          | BUG-2026-11-04-028 (Avenant = contrat complet), corrigé dans b8a62aae (H22)                              |
| GL-04-057                                                                                                                                                                         | échoué          | BUG-2026-11-04-027 (période du relevé absente), corrigé dans b8a62aae                                    |
| GL-04-058                                                                                                                                                                         | échoué          | BUG-2026-11-04-030 (titre et description ignorés), corrigé dans b8a62aae                                 |
| GL-04-061                                                                                                                                                                         | échoué          | BUG-2026-11-04-031 (filtre `status` partagé entre onglets), corrigé dans b8a62aae                        |
| GL-04-105                                                                                                                                                                         | échoué          | BUG-2026-11-04-032 (fenêtre Signatures d'un état signé réduite au 409)                                   |
| GL-04-078, 079, 084, 085, 107, 109, 116, 119                                                                                                                                      | passé (partiel) | 429 et expirations non joués                                                                             |
| GL-04-072, 073, 075 (contrat de bail)                                                                                                                                             | bloqué          | Conversion PDF désactivée sur l'API de recette (503), réactivée depuis                                   |
| GL-04-003, 007, 008, 017, 021, 022, 024, 026, 029, 030, 040 à 045, 059, 060, 063, 066, 068, 069, 071, 074, 077, 081, 086 à 095, 097, 098, 101, 102, 110 à 115, 117, 118, 120, 123 | non joué        | Reprendre à GL-04-045 ; cas du prestataire externe (Yousign) non testables                               |

Écarts de scénario : baux du seed déjà dotés de documents (jouer 046 et 048
sur un bail neuf) ; nom du PDF signé
`etat-des-lieux-d-entree-bail-<numéro>-signe.pdf` ; le premier bouton
« Retour » du formulaire d'état des lieux ramène à la liste des baux.

### 06 — Paiements, allocations, déclarations (Playwright, révision `afee2ac6`, 41 cas sur 59)

Aucun cas Bloquant échoué. Parcours de référence S1 à S9 rejoué sur
REC-GL-PAY-1 (BAIL-2026-0108) : soldes conformes à chaque étape (30 000,
−470 000, −170 000). Plusieurs « anomalies probables » du scénario sont
absentes (005, plafond de 010, 012, 033, 034, 036, 039).

| Cas                                                       | Résultat        | Anomalie / remarque                                                                   |
| --------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| GL-06-001, 003 à 009, 012, 014, 015, 020, 023, 024        | passé           | Dates du règlement, comptes filtrés par mode, devise refusée, doublon 409, isolation  |
| GL-06-025 à 031, 034 à 040                                | passé           | Affectation auto et manuelle, 409 explicite, annulation et réactivation, solde        |
| GL-06-041                                                 | passé (réserve) | BUG-2026-11-04-039 (codes bruts dans « Paiement associé » du dépôt)                   |
| GL-06-035                                                 | passé (réserve) | BUG-2026-11-04-040 (« Montant disponible » d'un paiement annulé)                      |
| GL-06-002                                                 | passé (réserve) | BUG-2026-11-04-041 (onglet principal de la fiche bail perdu après F5)                 |
| GL-06-010                                                 | échoué          | BUG-2026-11-04-034 (« 1500,5 » saisi devient 15 005)                                  |
| GL-06-013                                                 | échoué          | BUG-2026-11-04-033 (paiement sans bail ni locataire depuis la liste globale)          |
| GL-06-011                                                 | passé (partiel) | Date vidée ramenée au jour : « date requise » inatteignable                           |
| GL-06-032, 033                                            | passé           | Pas de désallocation à l'écran ; « En attente » non proposé depuis « Réussi »         |
| GL-06-045, 047, 049                                       | passé (partiel) | Déclaration jouée sur le bail seed (le bail REC-GL-DECL n'est pas visible au portail) |
| GL-06-016 à 019, 021, 022, 042 à 044, 046, 048, 050 à 059 | voir suite      | Joués dans « 06 — suite »                                                             |

Écarts de scénario : biens et contacts REC-GL créés pendant le jeu ; bail
créé directement « Actif » ; libellé « Date du règlement » ; échéances
futures « À échoir » (pas « Brouillon ») après annulation ; compte « Cartes à
encaisser » absent du seed.

#### 06 — suite (Playwright, révision `a4a82969`, 22 cas)

Aucun cas Bloquant échoué. Déclarations jouées de bout en bout sur un bail
créé pour l'occasion (BAIL-2026-0112, locataire « REC-GL Locataire
Déclarant ») : déclaration, preuve (image et PDF, aucun `/uploads` direct),
approbation avec compte, double clic (une seule requête), surplus en
avance, rejet motivé, rejeu en 404, isolation entre agences (404 sans
fuite). Paiement en ligne simulé : réussite et échec « Solde insuffisant »,
réconciliation par rappel. Compte propriétaire : encaissement de 160 000
→ +145 840 (honoraires 8 % et TVA), annulation → retour exact.

| Cas                                                                | Résultat        | Anomalie / remarque                                                                                |
| ------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------- |
| GL-06-016, 017, 021, 022, 043, 044, 046, 048 à 051, 053 à 055, 058 | passé           | Lecture seule du comptable (403), cartes mobiles, messages de saisie, preuves, approbation, rejet  |
| GL-06-018                                                          | passé           | Écart : filtres Remboursé et Partiellement remboursé présents (voulu, H24)                         |
| GL-06-019                                                          | passé (réserve) | BUG-2026-11-04-050 (« Date d'annulation » sur un paiement réactivé), BUG-040 revu                  |
| GL-06-042                                                          | passé (réserve) | BUG-2026-11-04-051 (opérateur Mobile Money en code brut)                                           |
| GL-06-045                                                          | passé (réserve) | BUG-2026-11-04-049 (second bail actif invisible au portail), BUG-2026-11-04-052 (montant conservé) |
| GL-06-047                                                          | passé (réserve) | BUG-2026-11-04-053 (« 9/2026 » sans zéro), BUG-2026-11-04-054 (échéances échues « Brouillon »)     |
| GL-06-052                                                          | passé (partiel) | Échéance soldée : aucun bouton Payer au portail, volet non jouable                                 |
| GL-06-056                                                          | passé           | Écart : type « Quittance » retiré (H22), numérotation `RCU-AAAAMM-NNNN`                            |
| GL-06-057                                                          | échoué          | BUG-2026-11-04-048 (relevé du locataire tronqué à 50 lignes sur 73)                                |
| GL-06-059                                                          | passé (partiel) | Tableau de bord conforme ; volet caisse non joué (caisse du jour fermée)                           |

Écarts de scénario : action « Payer » au portail (pas « Déclarer un
paiement »), onglet « Déclarations en attente » dans la liste globale
seulement, PDF de preuve renommé, compte portail créé avec le bail (pas
d'invitation), taux d'honoraires de 8 % dans la base.

#### 04 — suite (Playwright, révision `9820fdd7`)

Retests : BUG-2026-11-04-026 à 032 passés (photos refusées sur leur
contenu, relevé avec période, types sans modèle refusés en 400, titre et
description enregistrés, filtre `doc_status`, fenêtre Signatures d'un état
signé consultable). Conversion PDF active : chaîne de signature du
**contrat de bail** jouée de bout en bout.

| Cas                                                                       | Résultat        | Anomalie / remarque                                                                                                                                                                     |
| ------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GL-04-051, 067, 068, 070 à 073, 075 à 078, 080 à 083, 085 à 088, 090, 091 | passé           | Envoi du contrat (201 en ~20 s), 409 doublon, page publique, codes (429), signature saisie et dessinée, PDF scellé avec certificat, relance, annulation, refus, régénération qui annule |
| GL-04-079, 084                                                            | passé (partiel) | Expiration du code et épuisement des essais non joués                                                                                                                                   |
| GL-04-089                                                                 | indéterminé     | Envoi SMS 201 par l'API ; à l'écran « Impossible d'envoyer » : BUG-2026-11-04-042 (délai client de 20 s)                                                                                |
| GL-04-045, 063, 092 à 095, 097, 101, 102, 109 à 115, 117, 118, 120        | non joué        | Contexte du testeur épuisé ; coupures de la base pendant la session                                                                                                                     |

### 14 — Transverse : langues, mobile, robustesse (Playwright, révision `4aafcceb`, ~17 cas sur 40)

Aucun cas Bloquant échoué. Arabe : `dir=rtl`, colonnes inversées, aucun
débordement. 375 px et 768 px : aucun défilement horizontal de page sur
les trois espaces (28 écrans). Session : cookies supprimés, déconnexion
dans un autre onglet et « Précédent » renvoient tous à la connexion avec
stockage vidé. Aucune clé interne ni chemin disque dans les réponses des
portails relues.

| Cas                                                                | Résultat        | Anomalie / remarque                                                                 |
| ------------------------------------------------------------------ | --------------- | ----------------------------------------------------------------------------------- |
| GL-14-002, 013, 025, 042                                           | passé           | RTL, mobile propriétaire, session expirée, retour après déconnexion                 |
| GL-14-001                                                          | passé (réserve) | BUG-2026-11-04-046 (« 1076 paiements », « Simulateur de paiement opérationnel. »)   |
| GL-14-003, 005, 010 à 012, 014, 024, 026, 040, 041                 | passé (partiel) | Fenêtres, zoom 200 %, fenêtres privées et lien de paiement valide non joués         |
| GL-14-004                                                          | échoué          | BUG-2026-11-04-046 (« Locataire: », « Loyer: », « / mois » au portail propriétaire) |
| GL-14-009, 036                                                     | échoué          | BUG-2026-11-04-045 (XOF, CFA, F CFA au lieu de FCFA)                                |
| GL-14-020                                                          | échoué          | BUG-2026-11-04-044 (panne réseau au chargement : connexion ou « aucune agence »)    |
| GL-14-034                                                          | échoué          | BUG-2026-11-04-043 (déclaration : -1, 1e9, 0,01 enregistrés en 1, 19, 1)            |
| GL-14-039                                                          | échoué          | BUG-2026-11-04-047 (avertissement React « same key » au portail locataire)          |
| GL-14-032                                                          | à confirmer     | Référence de 256 et notes de 1001 caractères acceptées sans message                 |
| GL-14-021, 023, 031                                                | non concluant   | Simulation de coupure (`page.route`) inopérante sur le POST                         |
| GL-14-006 à 008, 016, 022, 027, 030, 033, 035, 037, 038, 043 à 046 | non joué        | Reprendre à GL-14-006                                                               |

Remarques : la langue suit le compte (deux sessions du même compte se la
transmettent) ; « Choisir un compte de test » de la page de connexion reste
en français (outil de développement).

### Retests des correctifs (Playwright, révisions `87785af9` et `b0bec1dd`)

Deux passages de retest sur les anomalies déclarées corrigées, chacune
rejouée au moins deux fois.

| Anomalie                                                              | Verdict         | Observé                                                                                   |
| --------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| BUG-2026-11-04-034, 035, 040, 041, 042, 044 à 046, 048, 050, 051, 053 | passé           | Décimales, onglets mobiles et F5, signature (201 en 30-43 s), panne réseau avec Réessayer |
| BUG-2026-11-04-032                                                    | passé           | Fenêtre Signatures d'un état des lieux signé complète                                     |
| BUG-2026-11-04-033, 039                                               | passé (réserve) | Ancien paiement sans bail non affectable (seul cas : annulé) ; virement non rejoué        |
| BUG-2026-11-04-037, 038, 043, 049, 052, 054, BUG-2026-11-03-005       | passé           | Portail locataire : détail d'échéance, aucun chemin `/uploads`, plusieurs baux, montants  |
| BUG-2026-11-04-036                                                    | échoué          | Balance âgée : 55 lignes sur 63 encore en « Écart avec la comptabilité »                  |
| BUG-2026-11-04-047                                                    | échoué          | Clé React `PAYMENT_ALLOCATED_TENANT` dupliquée sur `/notifications`                       |

Nouvelles anomalies des retests : BUG-2026-11-04-055 (déclarations de
l'agence arrondies, « F CFA ») et BUG-2026-11-04-060 (« CFA » et « F CFA »
sur la fiche bail, le paiement et l'affectation).

## Reprise du 5 novembre 2026

Les retests par anomalie sont détaillés dans [RT5](RETESTS-2026-11-05.md), [maintenance](RETESTS-MAINTENANCE-2026-11-05.md) et [finance](RETESTS-FINANCE-2026-11-05.md). Ils ne transforment pas automatiquement toutes les variantes d’un scénario en réussite complète. Les tableaux suivants reprennent les derniers verdicts par cas des compléments ; consulter le rapport lié pour la portée exacte.

### Complément [COMPLEMENT-020308-2026-11-05.md](COMPLEMENT-020308-2026-11-05.md)

| Cas       | Résultat                                                                      | Portée / preuve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GL-02-027 | passé (partiel)                                                               | Liste UI puis lecture API de contrôle : 123 baux `BAIL-2026-0001` à `0123`, 123 numéros uniques, aucun trou. La séquence propre de l'agence B n'a pas été vérifiée dans cette reprise.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| GL-02-049 | passé                                                                         | Chrome 375 px : 20 cartes sur la première page, numéro/bien/locataire/statut/montant/période ; `scrollWidth=375`, aucun débordement ; le menu carte contient « Modifier le bail » et « Supprimer » ; tiroir « Filtrer les baux » avec « Voir les résultats » ; clic sur la carte BAIL-2026-0123 ouvre `/rental/leases/8bd996ab-41c3-4e52-80af-bb99a9f2e107`                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| GL-03-016 | bloqué — écart du scénario                                                    | LS = BAIL-2026-0072, Terminé, fin 31/07/2027. « Renouveler » jusqu'au 31/10/2027 renvoie deux fois HTTP 409 et « Ce bien a déjà un bail en cours sur cette période. » La règle H39 interdit ce chevauchement avec LD3 ; voir BUG-2026-11-05-001 requalifié bloqué et BUG-2026-11-04-059. Tester le nominal sur un bail terminé dont le bien est libre.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| GL-03-062 | corrigé dans l'arbre de travail, à retester après commit — bug-2026-11-05-005 | Sur L5 = BAIL-2026-0079, remboursement `REC-GL GL-03-062 remboursement reprise 05-11` de 10 000 FCFA enregistré via l'interface ; solde 589 900 → 579 900 FCFA. Les deux `.eml` du 05/11 à 06:01 UTC à C2 et C3 citent le remboursement et le bail. Le mot de passe de C2 a été réinitialisé via l'interface et le puits SMTP local. Le défaut initial (portail affichait seulement BAIL-2026-0107) a été reproduit deux fois, puis corrigé par un sélecteur de bail et `GET /portal/tenant/deposit?leaseId=...`. Dans Chrome réel sur l'arbre non commité, C2 sélectionne BAIL-2026-0079 et voit cible 800 000 FCFA, disponible 579 900 FCFA et la ligne de remboursement 10 000 FCFA. Tests web 5/5 (récupération du dépôt et de la liste après erreur comprise) et garde multi-baux API 12/12. |
| GL-08-037 | non joué — données à préparer                                                 | La liste UI ne contient pas de remise préparée pour le créancier D. Tentative via UI avec « REC-GL Créancier C bis » au 10/12/2026 : HTTP 400 « Aucune échéance à prélever pour ce créancier à cette date. ». Il faut un mandat actif et une échéance future sur un créancier sans numéro d'émetteur.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| GL-08-039 | non joué — données à préparer                                                 | R1 historique = PRL-2026-0003 déjà Déposée à la banque, prénotification datée du 05/11 ; préparer une remise future Validée.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GL-08-040 | passé sur remise de test à quatre lignes                                      | PRL-2026-0006, créancier B, 10/12/2026, Validée : avertissement « Le locataire a déjà reçu l'avis… » ; trois retraits UI successifs HTTP 200 ; quatre lignes / 270 000 → une ligne / 50 000 FCFA. Le dernier bouton « Retirer » est désactivé. Variante deux lignes initiales non jouée.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| GL-08-042 | partiel                                                                       | PRL-2026-0006 : premier CSV et trois retéléchargements, même taille 347 octets et même SHA-256 `66a6ece000072a1d9bfd879752f4c457fa9fe246c1dbcba0a6c7d26f61e0904a`. Un téléchargement après suspension temporaire de MDT-2026-0011 conserve le même contenu ; mandat réactivé et statut Actif revérifié par l'UI. L'avertissement sur mandat inactif n'a pas été capturé ; ce volet reste à confirmer.                                                                                                                                                                                                                                                                                                                                                                                             |
| GL-08-044 | partiel                                                                       | Annulation de PRL-2026-0006 après production du fichier : modal prévient « fichier produit (4 fois) », motif et acquittement obligatoires (bouton désactivé sans eux). Motif `REC-GL essai de recette, fichier jamais chargé sur une banque`, case cochée ; HTTP 200 ; statut Annulée, zéro ligne / zéro FCFA, date et motif affichés. Les variantes Brouillon et Validée n'ont pas été rejouées.                                                                                                                                                                                                                                                                                                                                                                                                 |
| GL-08-045 | partiel                                                                       | PRL-2026-0006 a montré successivement les actions Brouillon (Actualiser, Valider, Annuler), Validée (Produire, Renvoyer, Annuler), Fichier produit (Retélécharger, Marquer déposée, Renvoyer, Annuler), Annulée (aucune action). PRL-2026-0003/0004 sont Déposées. Les transitions directes HTTP 409 n'ont pas été rejouées.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GL-08-047 | partiel                                                                       | Double clic sur « Confirmer » lors de la validation de PRL-2026-0006 : un seul `POST /validate` HTTP 200 et statut Validée. Double clic sur annulation du fichier produit : un seul `POST /cancel` HTTP 200 et statut Annulée. La production par double clic n'a pas été jouée.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| GL-08-067 | non joué — prérequis à vérifier                                               | Douze mandats visibles, dont MDT-2026-0008 Actif et MDT-2026-0005 Brouillon ; l'état des demandes de signature en attente n'a pas été confirmé.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| GL-08-068 | non joué — prérequis à vérifier                                               | Les remises d'avis de novembre sont déjà Déposées ; préparer un nouvel envoi futur pour vérifier sujet personnalisé puis réinitialisation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Complément [COMPLEMENT-04-2026-11-05.md](COMPLEMENT-04-2026-11-05.md)

| Cas       | Résultat                                       | Portée / preuve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GL-04-109 | passé                                          | Page globale ouverte, 8 compteurs, 11 lignes, colonnes et actions visibles, aucun export.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| GL-04-110 | passé partiel                                  | Filtres Envoyée 2/2, Signée 3/3, Refusée 1/1, Annulée 5/5 sur le jeu initial ; Partiellement signée, Expirée et Brouillon (0) donnent chacun une liste vide. Après création des demandes des autres cas, les compteurs suivent les nouveaux statuts. Interaction avec recherche/période non recalculée exhaustivement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| GL-04-111 | passé                                          | Sept types proposés ; État des lieux filtre 2 demandes, Contrat de bail 18, Mandat de vente 0 sans erreur ; effacer le type restaure 20 demandes (état au moment du contrôle).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| GL-04-112 | passé, écart de libellé du scénario            | Recherche par bail, `KONE`/`kone`, recherche absente fonctionnent. À 101 caractères, API 400 et bandeau précis « Les données fournies sont invalides. (q : Le texte doit contenir au plus 100 caractère(s).) », bouton « Réessayer » visible, aucun écran blanc, liste de 11 demandes restaurée au vidage. Deux essais concordants. BUG-2026-11-05-002 clos sans correction produit ; actualiser le libellé attendu du scénario.                                                                                                                                                                                                                                                                                                                                                           |
| GL-04-113 | passé partiel                                  | Sélection calendrier réelle du 04/11/2026 au 04/11/2026 : 11 demandes de ce jour affichées ; 06/11/2026 au 06/11/2026 : liste vide. Survol puis clic sur la croix du widget rétablit 20 demandes (état après création des demandes du jour). Le filtre 05/11/2026, tenté ensuite, n'a pas pu être joué : session AGENT_A expirée avant l'affichage du filtre.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| GL-04-114 | passé au retest, écart de scénario             | Défaut « Créée le » décroissant. Avant correction, la colonne restait `descending` aux trois clics (BUG-2026-11-05-003, deux reproductions). Après correction locale, l'UI montre `descending → ascending → descending`, avec inversion puis restauration des quatre premières lignes. Troisième clic : `ascending` ; le scénario attend un « retour au défaut » décroissant au troisième clic et devra préciser la convention de cycle.                                                                                                                                                                                                                                                                                                                                                   |
| GL-04-115 | non joué                                       | Le scénario exige 26 demandes pour une page 2 alors que le plafond mensuel configuré est de 20 signatures et le quota est épuisé à 20/20. La liste comptait 20 demandes au dernier contrôle. La pagination nécessite un jeu de données ou une configuration de recette adaptés ; aucun achat ni changement de plafond effectué.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| GL-04-063 | passé avec rôle agent_a                        | Bail L1 `BAIL-2026-0070`, onglet Documents initialement vide. Ouvrir « Générer un document », choisir Relevé, Annuler : toujours 0. Rouvrir, choisir Relevé et la période 01/08/2026–05/11/2026, double clic « Générer le document » : un seul document `RLV-202611-0034`, encore présent après F5. Le scénario demande ADMIN_A ; le test a été joué avec AGENT_A car la session ADMIN_A était invalidée en parallèle.                                                                                                                                                                                                                                                                                                                                                                     |
| GL-04-102 | passé partiel avec rôle agent_a                | Sur `BAIL-2026-0107`, état d'entrée finalisé et sortie en brouillon. « Consulter » l'entrée affiche un bouton Signatures (1) ; « Continuer » le brouillon n'en affiche aucun (0). Refus API d'une tentative de signature sur brouillon non joué : les écritures API hors UI sont exclues de cette recette.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| GL-04-093 | passé partiel avec rôle agent_a                | Contrat L1 `BAIL-2026-0070`, deux signataires Sur place dans l'ordre REC-GL Agent, REC-GL-Aminata KONE. Au premier, consentement seul garde « Signer le document » désactivé ; tracé au canvas l'active. Signature Agent : message de succès et demande Partiellement signée. Signature locataire : message de succès, demande Signée, lien PDF signé disponible. Aucun message de signature envoyé au moment de la demande (compteur .eml 357 avant/après envoi). Certificat PDF non inspecté ; scénario demandait ADMIN_A, joué avec AGENT_A.                                                                                                                                                                                                                                            |
| GL-04-094 | passé partiel avec rôle agent_a                | Deux ouvertures consécutives de « Signer sur place » pour REC-GL Agent, fenêtre fermée entre elles : chacune émet un POST `in-person-token` 200 avec `Cache-Control: no-store`. Le tiroir d'historique de la demande signée affiche quatre émissions de nouveau lien sur place pour REC-GL Agent et une pour le locataire, ainsi que « Piste de preuve intacte ». L'invalidation de l'ancien lien et le 409 après signature restent à vérifier.                                                                                                                                                                                                                                                                                                                                            |
| GL-04-095 | passé partiel avec rôle agent_a                | Nouveau contrat L1 `BAIL-2026-0070-A2`, deux signataires Sur place en ordre imposé. La fenêtre du second s'ouvre avant le premier mais n'affiche pas immédiatement « Ce n'est pas encore votre tour ». Après consentement et tracé, sa tentative de signature reçoit HTTP 409 et affiche ce message ; aucune signature du second n'est enregistrée. La zone vide garde le bouton désactivé. Le premier refuse avec motif `REC-GL essai ordre signature` : la demande devient Refusée, message de refus visible. Écart temporel du message à préciser dans le scénario ; contrôle serveur effectif.                                                                                                                                                                                         |
| GL-04-092 | passé partiel avec rôle agent_a                | L2 identifié par bail `BAIL-2026-0113` (Bakary, 15/01/2027–31/12/2027, loyer trimestriel 360 000). Contrat généré, envoi séquentiel locataire Bakary puis bailleur Chantal par e-mail local : un seul `.eml` d'invitation au départ (Bakary). Bakary signe après code reçu dans le puits SMTP, puis un `.eml` d'invitation arrive pour Chantal ; celle-ci signe à son tour. La fiche L2 affiche Signée, les deux lignes « A signé » et PDF signé. L'état intermédiaire Partiellement signée n'a pas été lu sur la fiche ; aucune relance pendant le tour du premier.                                                                                                                                                                                                                       |
| GL-04-097 | différé au 2026-11-06                          | Préparation faite via AGENT_A : nouveau contrat L2 `BAIL-2026-0113-A2`, demande d'un signataire Bakary valable 1 jour, affichée Envoyée le 05/11/2026 et « expire le 06/11/2026 ». L'invitation est dans le puits SMTP local, fichier `2026-11-05T06-43-13-565Z-15.eml` (lien personnel à ne pas consigner dans Git). À J+1, ouvrir ce lien depuis ce fichier local, vérifier « Lien invalide ou expiré », état Expirée sur la fiche et dans la liste globale, e-mail à l'émetteur dans les 15 minutes après échéance, puis nouvel envoi possible. Le serveur n'expose ici qu'une date sans heure : calculer l'échéance réelle avant de conclure.                                                                                                                                          |
| GL-04-101 | passé partiel avec rôle agent_a                | Abonnement lu avant : 15/20 signatures électroniques mensuelles. Sur L4 `BAIL-2026-0115` (Bakary, 01/03/2027–29/02/2028, loyer annuel 1 080 000), contrat généré puis cinq demandes internes à un seul signataire Sur place : chaque POST `signatures` 201, chaque annulation laisse une demande Annulée. Sixième envoi : HTTP 409, message de quota atteint avec proposition « Signatures électroniques — bloc de 50 » affiché dans la fenêtre ; abonnement relu à 20/20. Aucun achat ni extension effectué. Variante échec d'envoi pour adresse invalide, nombre exact de signataires par demande et droits ADMIN_A non joués. Le quota de cette base dédiée est désormais épuisé et empêchera les autres scénarios de signature jusqu'à réaménagement de la recette ou au mois suivant. |
| GL-04-045 | bloqué par préconditions et dates incohérentes | Deux repères L5 coexistent : `BAIL-2026-0116` (fiche REC-GL L5 du bloc 02, 01/01/2027–30/06/2027, dépôt actuel 0 FCFA) et `BAIL-2026-0079` (fiche « REC-GL bloc03 L5 », renouvelée jusqu'au 31/12/2027, dépôt actuel **579 900 FCFA** après mouvements du bloc 03). Le second est le bon repère pour le dépôt ; sur les deux, entrée et sortie sont « Non réalisé », donc aucune sortie finalisée ni retenues 475 000. Le scénario demande préavis 01/10/2026 et fin 30/11/2026, avant le début réel 01/01/2027 du bail et alors que le bail 0079 a déjà été renouvelé. Résiliation non faite. Il faut préparer un état de sortie et corriger les dates du scénario avant ce contrôle.                                                                                                     |
| GL-04-117 | passé partiel                                  | Demande BAIL-2026-0083 ouverte : premier clic « Rappel envoyé à 2 signataire(s) en attente », second clic immédiat « Une relance vient d’être envoyée : réessayez dans quelques minutes. » ; HTTP 429 attendu pour le second. Cas « Aucun signataire à relancer » non joué.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| GL-04-118 | passé                                          | Demande BAIL-2026-0108 : bulle de confirmation visible ; « Retour » conserve Envoyée ; confirmation passe la ligne à Annulée et retire Relancer/Annuler. L'ancien lien d'invitation du puits SMTP (fichier `2026-11-04T14-26-38-093Z-320.eml`) affiche ensuite « Lien invalide ou expiré » avec GET public 404. Aucun jeton consigné dans le rapport.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GL-04-120 | passé                                          | Après statut Signée et recherche, F5 rétablit Toutes et vide la recherche. Après filtre Signée, navigation vers les Baux puis bouton Précédent : retour sur Toutes, liste complète (20 demandes à ce moment).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
