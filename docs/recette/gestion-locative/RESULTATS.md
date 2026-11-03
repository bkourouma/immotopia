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
