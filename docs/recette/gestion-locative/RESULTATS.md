# Résultats de la recette Gestion locative — 2026-11-03

Révision testée : `orch/2026-11-03-recette-locatif` (départ `main` @ `6be7f91a`),
base dédiée `immotopia_recette_locatif`. Outils : navigateur intégré de
Claude Code et Playwright (Chrome headless du poste). Anomalies : bus
`.agent-bus/bugs/` (identifiants `BUG-2026-11-03-NNN`), reprises dans
[ANOMALIES.md](ANOMALIES.md).

Légende : `passé`, `échoué` (+ anomalie), `bloqué` (+ cause), `non joué`.

## Bilan par fichier

| Fichier | Cas | Passés | Échoués | Bloqués | Non joués |
| ------- | --- | ------ | ------- | ------- | --------- |

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
| GL-05-031 à 052 | non joué                 | Reprendre à GL-05-031                                                                                                                     |

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
