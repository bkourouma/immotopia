# 13 — Rôles, permissions et isolation entre agences

**Module** : Gestion locative — droits `RENTAL_*`, `OWNER_STATEMENTS_*`, `FINANCE_*` (parties locatives), isolation par agence, abonnement.

## Périmètre

- Matrice des permissions : pour chaque écran et chaque bouton d'écriture, ce que voient et peuvent faire ADMIN_A, AGENT_A, LECTEUR_A et, pour une vraie lecture seule, un quatrième profil COMPTABLE_A.
- Saisie directe d'une adresse d'écran par un rôle sans droit : refus propre (écran « Accès non autorisé » ou message de refus), jamais d'écran blanc ni de réponse brute.
- Isolation entre agences : ADMIN_B face aux baux, échéances, paiements, pénalités, dépôts, documents, relevés, mandats, comptes propriétaires et liens de l'agence A, avec contrôle réseau.
- Abonnement : agence dont le pack ne comprend pas la gestion locative, barrière « détenu en propre » du pack Patrimoine, lecture seule.
- Séparation des portails (locataire, propriétaire) et des routes d'agence.

## Prérequis et conventions

- Agence A (pack Agence) avec les données du jeu de référence (fichiers 02, 06, 10) et ADMIN_A ; agence B distincte (celle d'ADMIN_B dans le README, avec ses propres données de seed) ; au besoin y créer, en tant qu'ADMIN_B, un bien, un bail, une échéance et un paiement de contraste (noms préfixés `REC-GL-B`).
- **Convention réseau** : les `fetch` de console visés dans ce fichier utilisent l'adresse de l'API de l'environnement (voir RUNBOOK ; `http://localhost:8820/api` pour la recette du 2026-11-03, voir le README du dossier) avec `credentials:'include'` ; on peut aussi relever les requêtes émises par l'écran dans l'onglet Réseau. Les identifiants de l'agence A sont relevés par ADMIN_A dans l'onglet Réseau (jamais saisis à la main).
- Un changement de rôle est pris en compte par l'API sans attendre (le cache des droits du collaborateur est purgé) ; le **menu** du collaborateur se met à jour après rechargement de la page.

## Les rôles de recette : comptes du README et profil COMPTABLE_A

Il n'existe **pas** d'écran d'agence pour créer un rôle sur mesure : l'administrateur d'agence invite un collaborateur et lui attribue un ou plusieurs rôles du système (Paramétrage › Agence › Collaborateurs / Invitations, liste « Rôles »). L'écran plateforme « Rôles et permissions » (super-administrateur) modifie les droits d'un rôle **pour toutes les agences** : à ne pas utiliser en recette partagée.

Le README du dossier associe les rôles symboliques à des comptes. **Attention : le compte LECTEUR_A y porte le rôle « Agent tenant », qui n'est pas une « lecture seule » : il n'a AUCUN droit locatif ni financier (il ne voit ni les baux ni les paiements).** La vraie lecture seule est le rôle « Comptable tenant », porté ici par un profil supplémentaire à inviter, COMPTABLE_A.

| Rôle de recette                    | Compte du README                      | Rôle réel                                  | Droits locatifs effectifs (par défaut du produit)                                                                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ADMIN_A                            | compte administrateur de l'agence A   | « Administrateur tenant » (`TENANT_ADMIN`) | Tous les `RENTAL_*`, `OWNER_STATEMENTS_*`, les six droits `FINANCE_*`, `TENANT_SETTINGS_VIEW` et `EDIT`                                                                                                                                                                        |
| AGENT_A                            | compte « gestionnaire » de l'agence A | « Gestionnaire tenant » (`TENANT_MANAGER`) | Tous les `RENTAL_*` (écritures comprises), `OWNER_STATEMENTS_*`, `FINANCE_ACCOUNTS_READ` et `FINANCE_REPORTS_READ`, `TENANT_SETTINGS_VIEW` ; **sans** `FINANCE_DOCUMENTS_CREATE`, `FINANCE_DOCUMENTS_VALIDATE` ni `TENANT_SETTINGS_EDIT`                                       |
| LECTEUR_A                          | compte « lecteur » de l'agence A      | « Agent tenant » (`TENANT_AGENT`)          | **Aucun** droit locatif ni financier ; biens, CRM et lecture des paramètres de l'agence seulement                                                                                                                                                                              |
| COMPTABLE_A (à inviter, GL-13-002) | compte à créer                        | « Comptable tenant » (`TENANT_ACCOUNTANT`) | Lecture : baux, échéances, paiements, pénalités, dépôts ; `FINANCE_ACCOUNTS_READ` et `FINANCE_REPORTS_READ` ; **et** `FINANCE_DOCUMENTS_CREATE` (création de pièces : campagne de facturation, reversement) ; ni documents locatifs, ni prélèvements, ni relevés propriétaires |

Le rôle « Comptable tenant » n'est pas strictement « sans écriture » : il crée des pièces financières (reversement, facturation). C'est le plus proche d'un « lecteur » ; l'écart est consigné au cas GL-13-027. Si l'équipe veut un lecteur strict, il faut le demander à l'éditeur (nouveau rôle ou retrait de `FINANCE_DOCUMENTS_CREATE`). Si l'environnement a déjà ajusté les rôles de LECTEUR_A ou d'AGENT_A, comparer à ce tableau et noter l'écart avant de conclure.

## Matrice des permissions

| Droit                                | Ouvre                                                                                                                | ADMIN_A | AGENT_A (Gestionnaire) | LECTEUR_A (Agent tenant) | COMPTABLE_A |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------- | ------------------------ | ----------- |
| `RENTAL_LEASES_VIEW`                 | menu Baux, liste, fiche, co-locataires, honoraires du bail (lecture), état des lieux (lecture), signatures (lecture) | oui     | oui                    | non                      | oui         |
| `RENTAL_LEASES_CREATE`               | créer un bail                                                                                                        | oui     | oui                    | non                      | non         |
| `RENTAL_LEASES_EDIT`                 | modifier, changer le statut, supprimer, co-locataire, vie du bail, état des lieux, honoraires du bail, signature     | oui     | oui                    | non                      | non         |
| `RENTAL_INSTALLMENTS_VIEW`           | menu Encaisser › Échéances, détail d'échéance                                                                        | oui     | oui                    | non                      | oui         |
| `RENTAL_INSTALLMENTS_GENERATE`       | générer, recalculer, supprimer les échéances d'un bail                                                               | oui     | oui                    | non                      | non         |
| `RENTAL_PAYMENTS_VIEW`               | menu Encaisser › Paiements, détail, déclarations en attente (lecture), liens de paiement (lecture)                   | oui     | oui                    | non                      | oui         |
| `RENTAL_PAYMENTS_CREATE`             | encaisser, annuler un paiement, créer/copier/révoquer un lien de paiement                                            | oui     | oui                    | non                      | non         |
| `RENTAL_PAYMENTS_ALLOCATE`           | affecter, changer le statut, relancer un paiement en ligne, approuver/rejeter une déclaration                        | oui     | oui                    | non                      | non         |
| `RENTAL_PENALTIES_VIEW`              | onglet Pénalités du bail, justificatif (téléchargement)                                                              | oui     | oui                    | non                      | oui         |
| `RENTAL_PENALTIES_CALCULATE`         | calculer les pénalités                                                                                               | oui     | oui                    | non                      | non         |
| `RENTAL_PENALTIES_EDIT`              | remise, suppression, justificatif (dépôt)                                                                            | oui     | oui                    | non                      | non         |
| `RENTAL_DEPOSITS_VIEW`               | onglet Dépôt de garantie, mouvements                                                                                 | oui     | oui                    | non                      | oui         |
| `RENTAL_DEPOSITS_CREATE` / `EDIT`    | créer le dépôt / enregistrer un mouvement                                                                            | oui     | oui                    | non                      | non         |
| `RENTAL_DOCUMENTS_VIEW`              | liste et détail des documents locatifs, menu Documents                                                               | oui     | oui                    | non                      | **non**     |
| `RENTAL_DOCUMENTS_GENERATE` / `EDIT` | générer un document / changer son statut                                                                             | oui     | oui                    | non                      | non         |
| `RENTAL_DIRECT_DEBIT_VIEW`           | menu Encaisser › Prélèvements (IBAN masqué)                                                                          | oui     | oui                    | non                      | **non**     |
| `RENTAL_DIRECT_DEBIT_MANAGE`         | créanciers, mandats, remises, retours banque                                                                         | oui     | oui                    | non                      | non         |
| `OWNER_STATEMENTS_VIEW`              | menu Patrimoine › Relevés, détail, liens (lecture)                                                                   | oui     | oui                    | non                      | non         |
| `OWNER_STATEMENTS_EDIT`              | générer, recalculer, modifier, envoyer, rapport du mois, créer/révoquer un lien                                      | oui     | oui                    | non                      | non         |
| `FINANCE_ACCOUNTS_READ`              | Comptes propriétaires (liste, détail), relevé d'un compte, onglet Associations (lecture)                             | oui     | oui                    | non                      | oui         |
| `FINANCE_REPORTS_READ`               | Commissions des agents, balances                                                                                     | oui     | oui                    | non                      | oui         |
| `FINANCE_DOCUMENTS_CREATE`           | **Nouveau reversement**, campagne de facturation                                                                     | oui     | **non**                | non                      | **oui**     |
| `FINANCE_DOCUMENTS_VALIDATE`         | **Annuler un reversement**                                                                                           | oui     | non                    | non                      | non         |
| `TENANT_SETTINGS_VIEW`               | Paramétrage › Paramètres financiers (lecture), conditions par propriétaire, commission des collaborateurs            | oui     | oui                    | oui                      | non         |
| `TENANT_SETTINGS_EDIT`               | enregistrer honoraires, TVA, conditions propriétaire, commission, portail propriétaire                               | oui     | non                    | non                      | non         |

Lecture de la matrice : « oui » = comportement attendu **par défaut**. Un écart entre l'environnement et ce tableau (rôle ajusté par le super-administrateur) se note dans le journal avant de conclure.

### Écrans et boutons — attendu par rôle

| Écran / action                                                                    | ADMIN_A            | AGENT_A (Gestionnaire) | LECTEUR_A (Agent tenant)                 | COMPTABLE_A                                                                         |
| --------------------------------------------------------------------------------- | ------------------ | ---------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Menu **Baux**                                                                     | visible            | visible                | absent                                   | visible                                                                             |
| Liste et fiche d'un bail                                                          | lecture + écriture | lecture + écriture     | refusé                                   | lecture seule                                                                       |
| Boutons d'écriture d'un bail (nouveau, modifier, statut, supprimer, co-locataire) | actifs             | actifs                 | sans objet                               | **visibles mais refusés** par l'API (aucun masquage prévu côté écran sur ces pages) |
| Menu **Encaisser › Échéances**                                                    | visible            | visible                | absent                                   | visible ; boutons d'écriture (générer, recalculer) refusés                          |
| Menu **Encaisser › Paiements**                                                    | visible            | visible                | absent                                   | visible ; **Encaisser / Affecter masqués** (l'écran lit les droits)                 |
| Menu **Encaisser › Prélèvements**                                                 | visible            | visible                | absent                                   | **absent**                                                                          |
| Onglets Pénalités, Dépôt de garantie du bail                                      | lecture + écriture | lecture + écriture     | refusé                                   | lecture ; écritures refusées                                                        |
| Documents de location (génération, statut)                                        | oui                | oui                    | refusé                                   | **refusé** (pas de `RENTAL_DOCUMENTS_VIEW`)                                         |
| Menu **Patrimoine › Relevés** et écritures sur les relevés                        | visible, tout      | visible, tout          | absent, refusé                           | **absent**, refusé                                                                  |
| Menu **Finance › Reversements et commissions**                                    | visible            | visible (lecture)      | absent                                   | visible                                                                             |
| Comptes propriétaires : lecture                                                   | oui                | oui                    | refusé                                   | oui                                                                                 |
| **Nouveau reversement**                                                           | oui                | masqué                 | refusé                                   | oui (droit de création de pièces)                                                   |
| **Annuler** un reversement                                                        | oui                | masqué                 | refusé                                   | masqué                                                                              |
| Commissions des agents                                                            | oui                | oui                    | refusé                                   | oui                                                                                 |
| Paramètres financiers : lecture                                                   | oui                | oui                    | oui (lecture des paramètres de l'agence) | refusé                                                                              |
| Paramètres financiers : **Enregistrer**                                           | oui                | refusé                 | refusé                                   | refusé                                                                              |

---

## A. Mise en place des comptes de recette

### GL-13-001 — Inviter LECTEUR_A avec le rôle « Agent tenant »

- **Rôle** : ADMIN_A
- **Préconditions** : compte LECTEUR_A du README (s'il n'existe pas encore, l'inviter avec l'e-mail d'essai `rec-gl-agent@exemple.test` ; les e-mails d'invitation sont lus dans le puits SMTP local) ; sinon contrôler seulement son rôle.
- **Données** : rôle « Agent tenant ».
- **Étapes** :
  1. Menu **Paramétrage › Agence › Collaborateurs**, bouton **Inviter un collaborateur** (ou **Invitations**).
  2. Valider sans e-mail, avec `agent`, sans rôle ; puis saisir l'e-mail et cocher « Agent tenant » ; **Envoyer l'invitation**.
  3. Ouvrir l'e-mail d'invitation, suivre le lien, créer le compte.
  4. Revenir sur **Collaborateurs** et ouvrir la fiche du collaborateur.
- **Attendu** :
  - Messages « L'email est requis », « Email invalide », « Veuillez sélectionner au moins un rôle » ; puis « Invitation envoyée avec succès ».
  - Après acceptation : le collaborateur figure dans la liste avec le rôle « Agent tenant » ; sa fiche liste « Rôles » et le bouton **Enregistrer les rôles**.
- **Gravité si échec** : Bloquant

### GL-13-002 — Inviter COMPTABLE_A avec le rôle « Comptable tenant »

- **Rôle** : ADMIN_A
- **Préconditions** : e-mail d'essai `rec-gl-lecteur@exemple.test` (ce profil n'existe pas dans le README : il est créé ici).
- **Données** : rôle « Comptable tenant » seul.
- **Étapes** :
  1. Mêmes étapes que GL-13-001 avec le rôle « Comptable tenant ».
  2. Chercher, dans les écrans d'agence, un moyen de créer un rôle personnalisé (liste des rôles de l'invitation, fiche collaborateur).
- **Attendu** :
  - Compte créé avec ce seul rôle.
  - Aucune fonction « créer un rôle » dans l'interface d'agence : constat consigné (le rôle de lecture stricte doit être demandé à l'éditeur).
- **Gravité si échec** : Bloquant

### GL-13-003 — Inviter AGENT_A avec le rôle « Gestionnaire tenant »

- **Rôle** : ADMIN_A
- **Préconditions** : compte AGENT_A du README (s'il n'existe pas encore dans la base de recette, l'inviter avec l'e-mail d'essai `rec-gl-gestionnaire@exemple.test` ; sinon contrôler seulement son rôle dans sa fiche collaborateur).
- **Données** : rôle « Gestionnaire tenant ».
- **Étapes** :
  1. Inviter le collaborateur et accepter l'invitation.
- **Attendu** :
  - Compte créé ; ce profil sert de référence « gestion locative sans administration financière » dans les cas suivants (relevés, reversements).
- **Gravité si échec** : Majeur

---

## B. Menus par rôle

### GL-13-005 — Menu complet d'ADMIN_A

- **Rôle** : ADMIN_A
- **Préconditions** : agence A au pack Agence.
- **Données** : —
- **Étapes** :
  1. Lire le menu (zones principale et « Plus »).
- **Attendu** :
  - Présents : **Baux**, **Encaisser** (Échéances, Paiements, Prélèvements), **Patrimoine › Relevés**, **Finance › Clients et propriétaires › Reversements et commissions**, **Paramétrage › Agence › Paramètres financiers**, **Documents**.
- **Gravité si échec** : Majeur

### GL-13-006 — Menu de LECTEUR_A

- **Rôle** : LECTEUR_A
- **Préconditions** : GL-13-001 passé.
- **Données** : —
- **Étapes** :
  1. Se connecter et parcourir le menu complet (écran large, puis « Plus » sur téléphone).
- **Attendu** :
  - Absents : Baux, Encaisser, Relevés, Finance (reversements et commissions), Documents de location, Prélèvements.
  - Présents : tableau de bord, Biens, CRM (contacts, affaires, activités selon ses droits), et, au titre de la lecture des paramètres, **Paramétrage › Agence › Paramètres de l'agence** et **Paramètres financiers** (voir GL-13-031 pour ce point).
  - La liste des collaborateurs n'est pas proposée (droit retiré à l'Agent).
- **Gravité si échec** : Majeur

### GL-13-007 — Menu de COMPTABLE_A

- **Rôle** : COMPTABLE_A
- **Préconditions** : GL-13-002 passé.
- **Données** : —
- **Étapes** :
  1. Se connecter et parcourir le menu.
- **Attendu** :
  - Présents : **Baux**, **Encaisser** avec **Échéances** et **Paiements** seulement, **Finance** (Reversements et commissions : Comptes propriétaires, Commissions des agents).
  - Absents : **Prélèvements**, **Documents** (locatifs), **Patrimoine › Relevés**, **Paramètres financiers**, Collaborateurs.
- **Gravité si échec** : Majeur

### GL-13-008 — Menu d'AGENT_A

- **Rôle** : AGENT_A
- **Préconditions** : GL-13-003 passé.
- **Données** : —
- **Étapes** :
  1. Se connecter et parcourir le menu.
- **Attendu** :
  - Présents : Baux, Encaisser (les trois entrées), Patrimoine › Relevés, Finance › Reversements et commissions, Documents, Paramètres financiers (lecture).
- **Gravité si échec** : Majeur

---

## C. Saisie directe d'adresse sans droit de lecture

### GL-13-010 — LECTEUR_A : adresses locatives

- **Rôle** : LECTEUR_A
- **Préconditions** : identifiants d'ADMIN_A (bail R1, échéance, paiement) relevés ; LECTEUR_A connecté.
- **Données** : adresses `/tenant/<A>/rental/leases`, `…/leases/new`, `…/leases/<R1>`, `…/leases/<R1>/edit`, `…/rental/installments`, `…/installments/<id>`, `…/rental/payments`, `…/payments/<id>`, `…/rental/direct-debit`, `…/direct-debit/remittances`.
- **Étapes** :
  1. Saisir chaque adresse dans la barre d'adresse.
  2. Relever l'écran et les requêtes réseau.
- **Attendu** :
  - Pour chaque adresse : écran « Accès non autorisé » (« Votre rôle ne donne pas accès à cette section. ») avec les boutons « Retour à l'écran précédent » et « Aller au tableau de bord », ou un message lisible « Vous n'avez pas les droits nécessaires pour effectuer cette action. » ; jamais d'écran blanc, de JSON brut, de tableau partiel ni de spinner infini.
  - Réseau : 403 sur chaque requête de données ; aucune donnée de l'agence dans les réponses.
  - Un message générique du type « Impossible de charger les baux. » à la place du refus est une anomalie d'ergonomie (Mineur).
- **Gravité si échec** : Majeur

### GL-13-011 — LECTEUR_A : relevés, comptes propriétaires, commissions, paramètres

- **Rôle** : LECTEUR_A
- **Préconditions** : identifiants d'un relevé et d'un compte propriétaire relevés.
- **Données** : `/tenant/<A>/patrimoine/statements`, `…/statements/<id>`, `…/finance/owner-accounts`, `…/owner-accounts/<ownerClientId>`, `…/finance/commissions`, `…/settings/finance`.
- **Étapes** :
  1. Saisir chaque adresse.
- **Attendu** :
  - Refus propre sur les cinq premières (messages d'erreur du serveur « Vous n'avez pas les droits nécessaires pour effectuer cette action. » ou écran d'accès refusé), sans donnée.
  - `/settings/finance` : lecture autorisée (droit `TENANT_SETTINGS_VIEW`) — l'Agent voit le taux d'honoraires, la TVA, les conditions par propriétaire et les parts de commission des collaborateurs ; boutons **Enregistrer** refusés (GL-13-029). Consigner si cette exposition de données financières à un Agent est voulue.
- **Gravité si échec** : Majeur

### GL-13-012 — COMPTABLE_A : adresses hors de ses droits

- **Rôle** : COMPTABLE_A
- **Préconditions** : identifiants relevés ; GL-13-007 passé.
- **Données** : `/tenant/<A>/patrimoine/statements`, `…/statements/<id>`, `…/rental/direct-debit`, `…/direct-debit/remittances/<id>`, `…/settings/finance`, le panneau Documents d'un bail.
- **Étapes** :
  1. Saisir chaque adresse ; ouvrir la fiche d'un bail et chercher l'onglet Documents.
- **Attendu** :
  - Refus propre (écran d'accès refusé ou message de droits) ; onglet ou liste de documents vide avec un message de refus, jamais une liste partielle.
  - Aucune requête ne renvoie de relevé, de mandat de prélèvement ni de paramètre financier.
- **Gravité si échec** : Majeur

### GL-13-013 — COMPTABLE_A : ce qu'il peut lire, identique à ADMIN_A

- **Rôle** : COMPTABLE_A, ADMIN_A
- **Préconditions** : jeu de référence ; deux fenêtres.
- **Données** : bail R1, échéances d'octobre, paiement de 220 000, pénalité éventuelle, dépôt.
- **Étapes** :
  1. COMPTABLE_A : ouvrir Baux (liste et fiche R1), Échéances, Paiements (détail), onglets Pénalités et Dépôt de garantie, Finance › Comptes propriétaires, Commissions des agents.
  2. Comparer les montants avec ceux d'ADMIN_A.
- **Attendu** :
  - Montants et statuts identiques ; aucun bouton d'écriture actif ne produit d'effet (voir section D) ; l'IBAN d'un mandat n'est jamais affiché (pas d'accès au module).
  - Les cartes de synthèse (totaux de listes) sont les mêmes qu'ADMIN_A.
- **Gravité si échec** : Bloquant

---

## D. Écritures sans droit

### GL-13-020 — COMPTABLE_A : écritures sur les baux

- **Rôle** : COMPTABLE_A
- **Préconditions** : bail R1 ouvert ; identifiants relevés.
- **Données** : modification du loyer en 250 000 ; passage au statut « Suspendu » ; ajout d'un co-locataire ; suppression d'un bail test.
- **Étapes** :
  1. Cliquer sur **Nouveau bail** (libellé à confirmer), remplir minimalement, enregistrer.
  2. Modifier le bail R1 ; changer son statut ; ajouter un co-locataire ; supprimer le bail test.
  3. En console : `PATCH …/rental/leases/<R1>` `{"rent_amount":250000}`, `DELETE …/rental/leases/<R1>`.
- **Attendu** :
  - Chaque action : refus 403 « Vous n'avez pas les droits nécessaires pour effectuer cette action. » affiché clairement (pas de message d'erreur générique « Une erreur est survenue ») ; aucun bail créé, modifié, suspendu ni supprimé ; ADMIN_A constate que R1 est inchangé.
  - Si les boutons sont visibles pour le lecteur : ergonomie à noter (Mineur).
- **Gravité si échec** : Bloquant (si une écriture réussit)

### GL-13-021 — COMPTABLE_A : écritures sur les échéances et les pénalités

- **Rôle** : COMPTABLE_A
- **Préconditions** : bail R1 avec échéances ; une pénalité existante.
- **Données** : générer, recalculer, supprimer les échéances ; calculer, modifier, supprimer une pénalité ; ajouter un justificatif.
- **Étapes** :
  1. Tenter chaque action depuis la fiche du bail (onglets Échéances et Pénalités) et la liste.
  2. Console : `POST …/rental/leases/<R1>/installments`, `…/installments/recalculate`, `DELETE …/installments`, `POST …/rental/penalties/calculate`, `PATCH`/`DELETE …/penalties/<id>`.
- **Attendu** :
  - Refus 403 propre pour chacune ; échéances et pénalités inchangées. Lire les pénalités et télécharger un justificatif reste permis.
- **Gravité si échec** : Bloquant

### GL-13-022 — COMPTABLE_A : écritures sur les paiements et les liens de paiement

- **Rôle** : COMPTABLE_A
- **Préconditions** : échéance de novembre de R1 à payer ; une déclaration en attente.
- **Données** : encaisser 1 000 ; affecter ; changer le statut ; approuver / rejeter la déclaration ; créer un lien de paiement.
- **Étapes** :
  1. Ouvrir **Encaisser › Paiements** et **Échéances** : chercher les boutons **Encaisser**, **Affecter**, la bascule de statut et l'onglet « Déclarations en attente ».
  2. Tenter d'approuver et de rejeter ; ouvrir une échéance et chercher le panneau « Lien de paiement Mobile Money ».
  3. Console : `POST …/rental/payments`, `…/payments/<id>/allocate`, `PATCH …/payments/<id>/status`, `POST …/payment-declarations/<id>/approve`, `…/reject`, `POST …/rental/installments/<id>/payment-link`.
- **Attendu** :
  - Sur Paiements, **Encaisser** et **Affecter** sont masqués (l'écran lit les droits) ; le panneau des liens n'offre ni création ni révocation ; la liste des déclarations est consultable, sans boutons Approuver/Rejeter ou avec refus 403.
  - Toutes les écritures par la console : 403 ; aucun paiement créé.
- **Gravité si échec** : Bloquant

### GL-13-023 — COMPTABLE_A : écritures sur le dépôt de garantie

- **Rôle** : COMPTABLE_A
- **Préconditions** : bail R1 avec dépôt.
- **Données** : créer un dépôt, enregistrer un mouvement de 10 000.
- **Étapes** :
  1. Onglet Dépôt de garantie du bail : lire ; tenter d'enregistrer un mouvement.
  2. Console : `POST …/rental/leases/<R1>/deposit`, `POST …/rental/deposits/<id>/movements`.
- **Attendu** :
  - Lecture permise ; écritures en 403 ; solde du dépôt inchangé.
- **Gravité si échec** : Bloquant

### GL-13-024 — Relevés : droits de lecture et d'écriture

- **Rôle** : LECTEUR_A, COMPTABLE_A, AGENT_A, ADMIN_A
- **Préconditions** : relevé 2026-10 de P1 « Envoyé » avec un lien actif (fichier 10).
- **Données** : —
- **Étapes** :
  1. Pour chaque rôle, tenter : lister, ouvrir, générer un relevé, **Envoyer**, **Envoyer le rapport du mois**, **Copier le lien sécurisé**, **Révoquer**.
  2. Console (LECTEUR_A et COMPTABLE_A) : `GET …/owner-statements`, `POST …/owner-statements`, `GET …/owner-statements/<id>/secure-links`, `DELETE …/secure-links/<linkId>`.
- **Attendu** :
  - ADMIN_A et AGENT_A : tout permis. LECTEUR_A et COMPTABLE_A : menu absent, lecture et écritures refusées en 403 ; le jeton d'un lien n'est jamais renvoyé par la liste.
  - Aucun lien créé ni révoqué par un rôle sans droit.
- **Gravité si échec** : Bloquant

### GL-13-026 — Signatures du bail et droits

- **Rôle** : ADMIN_A, LECTEUR_A, COMPTABLE_A
- **Préconditions** : une demande de signature de bail existe pour R1 (fichier 03 ou signature) ; menu **Signatures** (zone « Plus », section Paramétrage).
- **Données** : routes `GET /api/signatures`, `POST /api/signatures` (envoi du bail), `POST /api/signatures/<id>/cancel`.
- **Étapes** :
  1. ADMIN_A : ouvrir l'écran **Signatures**, lister les demandes.
  2. LECTEUR_A puis COMPTABLE_A : ouvrir le même écran ; console : `GET /api/signatures`, puis `POST /api/signatures` avec la cible du bail R1 et `POST …/cancel` sur une demande.
- **Attendu** :
  - La liste ne renvoie que les types de documents que le rôle peut lire : COMPTABLE_A voit les demandes de bail (droit `RENTAL_LEASES_VIEW`) mais pas celles qu'il n'a pas le droit de lire ; LECTEUR_A ne voit aucune demande de bail (il lit les biens et les affaires, pas les baux).
  - L'envoi ou l'annulation d'une demande de bail exige le droit de modification des baux : refus 403 propre pour COMPTABLE_A et LECTEUR_A ; aucune demande créée ni annulée.
- **Gravité si échec** : Majeur

### GL-13-027 — Reversements : qui peut reverser, qui peut annuler

- **Rôle** : ADMIN_A, AGENT_A, COMPTABLE_A, LECTEUR_A
- **Préconditions** : solde de P1 supérieur à 5 000 FCFA ; un reversement Validé existant.
- **Données** : reversement de 1 000 FCFA, annulation motif « Test droits REC-GL ».
- **Étapes** :
  1. Chaque rôle ouvre le compte de P1 (si accessible) et tente **Nouveau reversement** (1 000) puis **Annuler** sur le reversement existant.
  2. Console : `POST …/owner-accounts/<P1>/payouts`, `POST …/payouts/<id>/void`.
- **Attendu** :
  - ADMIN_A : reverse et annule. COMPTABLE_A (« Comptable tenant ») : **reverse**, avec **Annuler** masqué et un refus 403 à la console. AGENT_A : **Nouveau reversement** et **Annuler** masqués, avec refus 403 de la création à la console. LECTEUR_A : écran refusé.
  - Dans tous les cas refusés : aucun mouvement, aucun numéro `REV-…` consommé.
  - Règle à confirmer avec le métier : le comptable possède le droit de reverser, et le gestionnaire accède aux comptes propriétaires en lecture.
- **Gravité si échec** : Majeur

### GL-13-028 — Prélèvements bancaires

- **Rôle** : ADMIN_A, AGENT_A, COMPTABLE_A
- **Préconditions** : un créancier et un mandat de prélèvement existent (fichier 08).
- **Données** : —
- **Étapes** :
  1. COMPTABLE_A : saisir `/tenant/<A>/rental/direct-debit` ; console `GET …/rental/direct-debit/mandates`, `POST …/rental/direct-debit/creditors`.
  2. AGENT_A : ouvrir le module, créer un brouillon de mandat.
- **Attendu** :
  - COMPTABLE_A : 403 partout (aucun accès, même en lecture) ; l'IBAN complet n'est jamais renvoyé à un rôle sans `RENTAL_DIRECT_DEBIT_MANAGE`.
  - AGENT_A : accès complet. Menu cohérent avec les droits.
- **Gravité si échec** : Bloquant

### GL-13-029 — Paramètres financiers et portail propriétaire : enregistrer

- **Rôle** : AGENT_A, LECTEUR_A, COMPTABLE_A, ADMIN_A
- **Préconditions** : paramètres de l'agence enregistrés (fichier 10).
- **Données** : taux d'honoraires 12, forfait propriétaire 20 000, part d'agent 60, réglage « Afficher la vue patrimoine ».
- **Étapes** :
  1. AGENT_A et LECTEUR_A : ouvrir **Paramètres financiers**, modifier chaque carte et **Enregistrer** ; carte « Portail propriétaire » de **Paramètres de l'agence**.
  2. Console : `PUT …/settings/finance`, `PUT …/settings/finance/owners/<ownerClientId>`, `DELETE …/settings/finance/owners/<ownerClientId>`, `PUT …/settings/finance/agents/<userId>`.
  3. ADMIN_A relit les valeurs.
- **Attendu** :
  - Gestionnaire et Agent : lecture possible ; **Enregistrer** refusé (403 ou message « Vous n'avez pas la permission de modifier ces réglages. », cases en « Lecture seule » pour le portail) ; valeurs inchangées chez ADMIN_A.
  - COMPTABLE_A : l'écran lui-même est refusé.
- **Gravité si échec** : Bloquant

### GL-13-031 — Exposition des paramètres financiers à l'Agent

- **Rôle** : LECTEUR_A
- **Préconditions** : conditions par propriétaire et parts de commission renseignées.
- **Données** : —
- **Étapes** :
  1. Ouvrir **Paramètres financiers** et lire toutes les cartes.
  2. Console : `GET …/settings/finance/owners`, `…/agents`.
- **Attendu** :
  - Constat : si l'Agent lit les taux d'honoraires par propriétaire et les parts de commission des collègues, le noter comme exposition d'informations sensibles à valider (Mineur) ; l'écriture reste interdite.
- **Gravité si échec** : Mineur

---

## E. Changements de rôle et de compte

### GL-13-035 — Changer le rôle d'un collaborateur en cours de session

- **Rôle** : ADMIN_A, LECTEUR_A
- **Préconditions** : LECTEUR_A connecté dans une fenêtre, sur le tableau de bord.
- **Données** : rôle « Gestionnaire tenant » ajouté puis retiré.
- **Étapes** :
  1. ADMIN_A : fiche de LECTEUR_A › « Rôles » : cocher « Gestionnaire tenant » › **Enregistrer les rôles** (« Rôles mis à jour avec succès »).
  2. LECTEUR_A, sans se déconnecter : appeler `GET …/rental/leases` (console), puis recharger la page et lire le menu.
  3. ADMIN_A retire le rôle ; LECTEUR_A rejoue l'appel et recharge.
- **Attendu** :
  - Après ajout : l'appel API réussit sans reconnexion (droits à jour) ; le menu Baux/Encaisser/Relevés apparaît après rechargement.
  - Après retrait : l'appel redevient 403 ; le menu disparaît après rechargement.
  - Aucun accès conservé indûment.
- **Gravité si échec** : Majeur

### GL-13-036 — Désactiver un collaborateur et révoquer ses sessions

- **Rôle** : ADMIN_A, COMPTABLE_A
- **Préconditions** : COMPTABLE_A connecté.
- **Données** : —
- **Étapes** :
  1. ADMIN_A : **Collaborateurs** › **Désactiver** (confirmation) sur COMPTABLE_A, ou fiche › **Révoquer les sessions**.
  2. COMPTABLE_A : recharger une page et appeler une route d'agence.
  3. ADMIN_A : **Activer** puis reconnexion.
- **Attendu** :
  - Désactivation : la session est refusée immédiatement ou à la prochaine requête (retour à la connexion), aucune donnée servie ; réactivation : connexion de nouveau possible.
- **Gravité si échec** : Majeur

---

## F. Isolation entre agences (ADMIN_B face à l'agence A)

Deux formes de tentative à distinguer : **(1)** l'adresse porte l'identifiant de l'agence A (`/tenant/<A>/…`, `/api/tenants/<A>/…`) ; **(2)** l'adresse porte l'identifiant de l'agence B (la sienne) mais l'identifiant d'un **objet** de l'agence A. Attendu : (1) refus d'agence ; (2) « introuvable », **identique** à la réponse pour un identifiant inexistant.

### GL-13-040 — Relever les identifiants de l'agence A

- **Rôle** : ADMIN_A
- **Préconditions** : jeu de référence complet (baux R1 à R3, échéances, paiements, pénalité, dépôt, documents, relevés, lien sécurisé, reversement, mandat de prélèvement, déclaration de paiement, lien de paiement).
- **Données** : tableau d'identifiants à remplir (noté dans le journal, jamais commité) : bail, échéance, paiement, pénalité, dépôt, mouvement de dépôt, document, mandat, remise, déclaration, relevé, lien de relevé, propriétaire (client), reversement, lien de paiement, créancier.
- **Étapes** :
  1. Ouvrir chaque écran concerné avec les outils de développement (onglet Réseau) et noter les identifiants dans les adresses et les réponses.
  2. Transmettre le tableau à ADMIN_B (hors application).
- **Attendu** :
  - Tous les identifiants sont des UUID ; aucun identifiant séquentiel devinable. Les numéros lisibles (`BAIL-AAAA-NNNN`, `REV-AAAA-NNNN`) sont propres à chaque agence (le premier reversement de l'agence B porte `…-0001` même si A en a fait vingt).
- **Gravité si échec** : Mineur

### GL-13-041 — Écrans d'une autre agence saisis par adresse (interface)

- **Rôle** : ADMIN_B
- **Préconditions** : GL-13-040 passé ; ADMIN_B connecté à l'agence B.
- **Données** : `/tenant/<A>/rental/leases`, `…/leases/<R1>`, `…/rental/installments/<id>`, `…/rental/payments/<id>`, `…/patrimoine/statements`, `…/statements/<id>`, `…/finance/owner-accounts/<P1>`, `…/finance/commissions`, `…/settings/finance` ; puis `/tenant/<B>/rental/leases/<R1>` (identifiant d'objet de A sous l'agence B).
- **Étapes** :
  1. Saisir chaque adresse de la forme (1).
  2. Saisir l'adresse de la forme (2).
- **Attendu** :
  - Forme (1) : écran **« Cette agence n’est pas la vôtre »** (« L'adresse demandée appartient à une autre agence que celle de votre compte. », référence `AUTH-403-TENANT`) ; aucune requête de données n'aboutit.
  - Forme (2) : écran de chargement en échec ou « introuvable » (« Impossible de charger … » avec **Réessayer**), identique à celui d'un identifiant inexistant ; aucune donnée de A (numéro de bail, loyer, locataire).
  - Jamais d'écran blanc ni de JSON brut.
- **Gravité si échec** : Bloquant

### GL-13-042 — API : identifiant d'agence A dans le chemin (forme 1)

- **Rôle** : ADMIN_B
- **Préconditions** : GL-13-040 passé.
- **Données** : routes `GET /api/tenants/<A>/rental/leases`, `…/rental/installments`, `…/rental/payments`, `…/rental/penalties`, `…/rental/documents`, `…/rental/direct-debit/mandates`, `…/rental/payment-declarations`, `…/owner-statements`, `…/owner-accounts`, `…/finance/agent-commissions?period=2026-10`, `…/settings/finance/owners`.
- **Étapes** :
  1. Console d'ADMIN_B : un `fetch` par route, avec `credentials:'include'`.
  2. Relever statut et corps.
- **Attendu** :
  - Chaque route : **403** « Vous n'avez pas accès à ce tenant. » ; le corps ne contient aucune donnée ni liste.
- **Gravité si échec** : Bloquant

### GL-13-043 — API : identifiant d'objet de A sous l'agence B, lectures (forme 2)

- **Rôle** : ADMIN_B
- **Préconditions** : GL-13-040 passé ; un identifiant UUID inventé comme témoin.
- **Données** : sous `/api/tenants/<B>/…` avec les identifiants de A : `rental/leases/<R1>`, `rental/leases/<R1>/co-renters`, `rental/leases/<R1>/management-terms`, `rental/leases/<R1>/deposit`, `rental/deposits/<id>/movements`, `rental/installments/<id>`, `rental/installments/<id>/payment-links`, `rental/payments/<id>`, `rental/payment-declarations/<id>` et son `/proof`, `rental/penalties/<id>`, `…/penalties/<id>/justification`, `rental/documents/<id>`, `rental/direct-debit/mandates/<id>`, `…/mandates/<id>/signed-scan`, `…/remittances/<id>`, `owner-statements/<id>`, `owner-statements/<id>/secure-links`, `owner-accounts/<P1>`.
- **Étapes** :
  1. Console d'ADMIN_B : un `GET` par route ; même appel avec l'UUID inventé.
  2. Comparer statut et corps (hors identifiant) entre l'objet de A et l'UUID inventé.
- **Attendu** :
  - **404 identique** dans les deux cas (même message « introuvable », même forme de corps) ; aucune donnée de A ; aucun téléchargement de fichier (justificatif, scan signé).
  - Une réponse 403 ou 200 différente pour l'objet de A trahirait son existence ou le livrerait : défaut Bloquant.
- **Gravité si échec** : Bloquant

### GL-13-044 — API : écritures croisées vers des objets de A (forme 2)

- **Rôle** : ADMIN_B, puis ADMIN_A (vérification)
- **Préconditions** : GL-13-040 passé ; état initial de A relevé (statut de R1, solde de P1, statuts de l'échéance et de la déclaration).
- **Données** : sous `/api/tenants/<B>/…` avec des identifiants de A : `PATCH rental/leases/<R1>/status` `{"status":"SUSPENDED"}` ; `DELETE rental/leases/<R1>` ; `POST rental/leases/<R1>/installments` ; `DELETE rental/penalties/<id>` ; `PATCH rental/penalties/<id>` ; `POST rental/deposits/<id>/movements` ; `PATCH rental/documents/<id>` ; `POST rental/payment-declarations/<id>/approve` et `/reject` ; `POST rental/installments/<id>/payment-link` ; `DELETE …/payment-link/<linkId>` ; `POST rental/direct-debit/mandates/<id>/revoke` ; `POST owner-accounts/<P1>/payouts` ; `POST owner-accounts/<P1>/payouts/<id>/void` ; `POST owner-statements/<id>/send` ; `DELETE owner-statements/<id>/secure-links/<linkId>` ; `PUT settings/finance/owners/<P1>` ; `DELETE settings/finance/owners/<P1>`.
- **Étapes** :
  1. Console d'ADMIN_B : exécuter chaque appel (corps minimal valide).
  2. ADMIN_A : relire R1, la pénalité, le dépôt, le document, la déclaration, le mandat, le compte de P1, le relevé et ses liens, les conditions de P1.
- **Attendu** :
  - Chaque appel : 404 (objet introuvable dans l'agence B) ou 403 ; **aucun** changement dans l'agence A : statut de R1 inchangé, aucun e-mail de relevé, déclaration toujours en attente, lien toujours actif, mandat toujours actif, solde de P1 inchangé.
  - Aucune donnée de A dans les réponses.
- **Gravité si échec** : Bloquant

### GL-13-045 — Écritures de B qui référencent des objets de A

- **Rôle** : ADMIN_B
- **Préconditions** : GL-13-040 passé ; agence B dotée de ses propres biens, contacts, baux.
- **Données** : références croisées : `POST rental/payments` avec `leaseId` de A ; allocation vers une échéance de A ; création d'un bail de B avec `propertyId` de A, puis avec `primaryRenterClientId` ou `ownerClientId` de A ; mandat de prélèvement avec `leaseId` de A ; `PUT rental/leases/<lease B>/management-terms` avec `agentUserId` d'un collaborateur de A ; génération d'un relevé avec `ownerContactId` ou `propertyIds` de A (voir GL-10-019) ; reversement de B avec `statementId` de A.
- **Étapes** :
  1. Console d'ADMIN_B : exécuter chaque appel.
  2. ADMIN_A et ADMIN_B relisent leurs données.
- **Attendu** :
  - Chaque tentative : 404 « introuvable » ou 400 « n'appartenant pas à cette agence » ; aucune ligne créée dans A ni dans B ; une référence d'une autre agence lève la même erreur qu'un objet inexistant.
  - Le même résultat avec un collaborateur de A désigné gestionnaire d'un bail de B.
- **Gravité si échec** : Bloquant

### GL-13-046 — Listes d'ADMIN_B : aucune donnée de A

- **Rôle** : ADMIN_B
- **Préconditions** : agence A remplie de données « REC-GL » ; agence B avec ses propres données « REC-GL-B ».
- **Données** : recherche « REC-GL » (sans « -B »).
- **Étapes** :
  1. Parcourir Baux, Échéances, Paiements, Relevés, Comptes propriétaires, Commissions des agents, Documents, Prélèvements ; utiliser la recherche et les filtres.
  2. Lire les totaux (cartes de synthèse, « Total dû aux propriétaires »).
- **Attendu** :
  - Aucune ligne, aucun nom, aucun total de A ; les totaux de B ne changent pas quand A enregistre un paiement (vérifier en ajoutant un paiement dans A puis en rechargeant B).
  - Les listes déroulantes (propriétaires, biens, contacts, gestionnaires, comptes de trésorerie) ne proposent que des éléments de B.
- **Gravité si échec** : Bloquant

### GL-13-047 — Fichiers privés de A

- **Rôle** : ADMIN_B, PUBLIC
- **Préconditions** : justificatif de pénalité, justificatif de déclaration de paiement, scan de mandat signé, contrat de bail PDF dans A.
- **Données** : routes de téléchargement de GL-13-043 ; adresses `/uploads/rental/…`, `/uploads/portal/payments/…` sur le serveur d'API.
- **Étapes** :
  1. ADMIN_B puis PUBLIC : appeler chaque route de fichier avec les identifiants de A.
  2. Ouvrir les adresses statiques sans connexion.
- **Attendu** :
  - 404 pour tous les cas ; aucun fichier servi ; aucun listing de dossier ; les documents privés ne sont jamais servis en statique.
- **Gravité si échec** : Bloquant

### GL-13-048 — Liens publics : on ne peut ni les lister ni les révoquer d'une autre agence

- **Rôle** : ADMIN_B, PUBLIC
- **Préconditions** : lien sécurisé actif d'un relevé de A et lien de paiement actif d'une échéance de A.
- **Données** : `GET …/owner-statements/<id>/secure-links` ; `DELETE …/secure-links/<linkId>` ; `GET …/installments/<id>/payment-links` ; `DELETE …/payment-link/<linkId>` sous l'agence B ; lien de A ouvert par PUBLIC.
- **Étapes** :
  1. ADMIN_B appelle les quatre routes.
  2. PUBLIC ouvre le lien du relevé (comportement normal d'un lien partagé) puis ADMIN_A constate qu'il est toujours actif.
- **Attendu** :
  - ADMIN_B : 404 sur les quatre ; les liens de A restent actifs. Le jeton n'est jamais renvoyé en clair par une liste.
  - Le lien de A reste lisible par son détenteur uniquement (c'est une capacité) ; l'état « Actif » côté A est inchangé.
- **Gravité si échec** : Bloquant

### GL-13-049 — Garde d'agence côté serveur (information)

- **Rôle** : ADMIN_A
- **Préconditions** : accès au journal de l'API (administrateur technique).
- **Données** : mode de la garde `TENANT_GUARD_MODE`.
- **Étapes** :
  1. Après les cas GL-13-042 à 045, demander la lecture du journal serveur : avertissements de la garde d'agence.
- **Attendu** :
  - Aucun avertissement « requête hors agence » pour les parcours normaux d'A ou de B ; les tentatives croisées sont refusées par les routes avant la garde. Un avertissement sur un parcours nominal indique une requête qui oublie le filtre d'agence : à signaler.
  - Sans accès au journal : **non testable en interface**.
- **Gravité si échec** : Majeur

---

## G. Abonnement

### GL-13-060 — Pack sans gestion locative : menu et accès refusés

- **Rôle** : ADMIN d'une agence au pack Syndic ou Promoteur (instance dédiée si disponible)
- **Préconditions** : agence dont le pack n'ouvre pas la fonctionnalité location (Syndic : instance `syndic`, Promoteur : instance `promoteur`) ; contrôle d'abonnement en mode « appliqué » ; sinon noter « non testable ».
- **Données** : adresses `/tenant/<id>/rental/leases`, `…/rental/installments`, `…/patrimoine/statements`, `…/finance/owner-accounts`, `…/finance/commissions`, `…/settings/finance`.
- **Étapes** :
  1. Lire le menu : chercher Baux, Encaisser, Patrimoine › Relevés, Reversements et commissions.
  2. Saisir chaque adresse.
  3. Console : `GET /api/tenants/<id>/rental/leases`, `…/owner-statements`, `…/owner-accounts`, `PUT …/settings/finance/owners/<id>`.
- **Attendu** :
  - Menu sans les entrées de gestion locative (Baux, Encaisser, Relevés, Comptes propriétaires, Commissions).
  - Chaque adresse : écran **« Fonction non comprise dans votre abonnement »** avec « Cette fonction relève d'un module que votre agence n'a pas souscrit… » et les boutons de retour ; les paramètres financiers de base restent accessibles, la section propriétaire et commission est masquée.
  - API : 403 avec le code `MODULE_NOT_INCLUDED` ; aucune donnée.
  - Les portails locataire et propriétaire ne sont pas filtrés par cet abonnement (les routes `/api/portal/…` sont exemptées).
- **Gravité si échec** : Bloquant

### GL-13-061 — Pack Patrimoine : barrière « détenu en propre »

- **Rôle** : ADMIN d'une agence au pack Patrimoine Essentiel ou Pro
- **Préconditions** : instance ou agence Patrimoine disponible ; sinon « non testable ».
- **Données** : adresses `…/patrimoine/statements`, `…/finance/owner-accounts`, `…/settings/finance` ; formulaire de bail.
- **Étapes** :
  1. Ouvrir les trois adresses ; ouvrir le formulaire d'un nouveau bail.
  2. Console : `POST …/owner-statements`, `GET …/owner-accounts`, `POST …/owner-accounts/<id>/payouts`, `PUT …/settings/finance/owners/<id>`.
- **Attendu** :
  - Relevés : « Relevés de gérance non inclus » (« … ne font pas partie du pack Patrimoine. ») ; comptes propriétaires : « Comptes propriétaires non inclus » ; sections propriétaires et commissions des paramètres financiers masquées ; le formulaire de bail n'a pas le champ Propriétaire.
  - API : 403 avec le code `OWN_ASSETS_ONLY`.
  - La gestion locative **directe** (baux sur des biens détenus en propre, échéances, paiements) reste utilisable.
- **Gravité si échec** : Bloquant

### GL-13-062 — Abonnement en lecture seule

- **Rôle** : ADMIN_A (agence passée en lecture seule par le super-administrateur)
- **Préconditions** : agence de test en lecture seule (essai et grâce terminés) ; sinon « non testable ».
- **Données** : lecture et export ; écritures de tous les domaines.
- **Étapes** :
  1. Lister baux, paiements, relevés ; exporter une liste.
  2. Tenter d'encaisser, de générer un relevé, de reverser, de créer un bail.
- **Attendu** :
  - Lectures et exports permis. Chaque écriture : refus 403 explicite (abonnement en lecture seule, code `SUBSCRIPTION_READ_ONLY` ou équivalent) avec un message clair qui renvoie à l'abonnement, jamais « Une erreur est survenue ».
- **Gravité si échec** : Majeur

### GL-13-063 — Agence suspendue : portails et collaborateurs

- **Rôle** : LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL, ADMIN_A
- **Préconditions** : le super-administrateur suspend l'agence A (puis la réactive) ; sinon « non testable ».
- **Données** : —
- **Étapes** :
  1. Pendant la suspension : le locataire ouvre `/tenant`, le propriétaire ouvre `/owner`, ADMIN_A ouvre `/dashboard`.
  2. Après réactivation, tous rouvrent leurs écrans.
- **Attendu** :
  - Chaque rôle : 403 « Cette agence est suspendue. » (code `TENANT_SUSPENDED`) affiché clairement ; aucune donnée.
  - Après réactivation : accès rétabli sans action particulière.
- **Gravité si échec** : Majeur

---

## H. Séparation des portails et des routes d'agence

### GL-13-070 — Un compte ne passe pas d'un portail à l'autre par l'API

- **Rôle** : LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL
- **Préconditions** : sessions séparées.
- **Données** : routes `GET /api/portal/owner/dashboard` (avec la session du locataire), `GET /api/portal/tenant/dashboard` (avec celle du propriétaire), `GET /api/portal/copropriete/lots`.
- **Étapes** :
  1. Console du locataire puis du propriétaire : les appels ci-dessus.
- **Attendu** :
  - Locataire sur le portail propriétaire : 403 « Accès portail propriétaire refusé. Vous devez être propriétaire. » ; propriétaire sur le portail locataire : 403 « Aucun bail actif trouvé. » ; portail copropriétaire : refus tant qu'aucune invitation n'a été faite.
  - Aucune donnée dans les corps.
- **Gravité si échec** : Bloquant

### GL-13-071 — Les droits d'agence ne s'étendent pas aux comptes de portail

- **Rôle** : LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL
- **Préconditions** : identifiants de l'agence A.
- **Données** : routes `GET /api/tenants/<A>/rental/leases`, `…/owner-statements`, `…/owner-accounts`, `…/rental/payments`.
- **Étapes** :
  1. Console de chaque compte de portail : les quatre appels.
- **Attendu** :
  - 403 « Vous n'avez pas les droits nécessaires pour effectuer cette action. » partout (ces comptes n'ont aucun droit d'agence) ; aucune donnée.
- **Gravité si échec** : Bloquant

---

## Couverture

| Sous-fonctionnalité du classeur (droits et isolation)                                                       | Cas                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Baux : créer / consulter / modifier / statut / supprimer / co-locataires / honoraires du bail / vie du bail | GL-13-010, 012, 013, 020, 043, 044, 045                                                                                |
| États des lieux, documents locatifs (génération, statut)                                                    | GL-13-012, 013, 047 (droits `RENTAL_LEASES_*` et `RENTAL_DOCUMENTS_*` ; détail fonctionnel dans les fichiers 02 et 04) |
| Échéances : générer / consulter / recalculer / supprimer                                                    | GL-13-010, 013, 021, 044                                                                                               |
| Tâche quotidienne des échéances en retard                                                                   | non testable en interface (tâche planifiée, aucun droit)                                                               |
| Paiements : enregistrer / consulter / allouer / statut / contrôle en ligne                                  | GL-13-010, 013, 022, 044                                                                                               |
| Déclarations de paiement : consulter / approuver / rejeter / justificatif                                   | GL-13-022, 043, 044, 047                                                                                               |
| Pénalités : calculer / consulter / modifier / supprimer / justificatif                                      | GL-13-013, 021, 043, 044, 047                                                                                          |
| Dépôt de garantie : consulter / créer / mouvements                                                          | GL-13-013, 023, 043, 044                                                                                               |
| Liens de paiement d'une échéance : envoyer / copier / lister / révoquer                                     | GL-13-022, 043, 044, 048                                                                                               |
| Prélèvement bancaire : créanciers, mandats, remises, retours                                                | GL-13-028, 043, 044, 047                                                                                               |
| Signature électronique du bail (droits `RENTAL_LEASES_*`)                                                   | GL-13-026 (liste, envoi, annulation), 020 (écriture), 013 (lecture) ; flux détaillé dans un autre fichier              |
| Comptes propriétaires, reversements, annulation                                                             | GL-13-013, 024, 027, 041, 042, 043, 044, 046                                                                           |
| Commissions des collaborateurs (état) et configuration                                                      | GL-13-011, 029, 031, 042                                                                                               |
| Honoraires par propriétaire (configurer / réinitialiser)                                                    | GL-13-029, 044                                                                                                         |
| Relevés propriétaires : lister / générer / modifier / recalculer / envoyer                                  | GL-13-011, 012, 024, 042, 043, 044, 045                                                                                |
| Rapport du mois et liens sécurisés                                                                          | GL-13-024, 044, 048                                                                                                    |
| Portail propriétaire : compte (contexte portail sans permission nommée)                                     | GL-13-070, 071                                                                                                         |
| Portail locataire / propriétaire : accès par rôle de client                                                 | GL-13-070, 071 ; fichiers 11 et 12                                                                                     |
| Abonnement : module absent, barrière « détenu en propre », lecture seule, agence suspendue                  | GL-13-060, 061, 062, 063                                                                                               |
| Rôles : invitation, changement de rôle, désactivation                                                       | GL-13-001 à 003, 035, 036                                                                                              |
| Menus par rôle                                                                                              | GL-13-005 à 008                                                                                                        |
| Garde d'agence du serveur (journal)                                                                         | GL-13-049 (non testable sans accès au journal)                                                                         |
