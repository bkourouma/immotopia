# 10 — Propriétaires : relevés de gérance, comptes courants, reversements, commissions

**Module** : Gestion locative — côté agence (Patrimoine › Relevés, Finance › Clients et propriétaires › Reversements et commissions, Paramétrage › Agence › Paramètres financiers).

## Périmètre

- Relevés propriétaires (menu **Patrimoine › Relevés**, URL `/tenant/:tenantId/patrimoine/statements`) : générer pour un mois, détail, recalculer, envoyer au propriétaire, rapport mensuel (e-mail), liens sécurisés (créer/copier, lister, révoquer), ouverture du lien public `/rapport-proprietaire#<jeton>`.
- Justesse des montants : loyers **encaissés** (et non contractuels), honoraires de gestion HT, TVA sur honoraires, dépenses, retenue à la source, dépôt de garantie conservé, net à reverser.
- Paramétrage des honoraires (agence, propriétaire, commission des collaborateurs).
- Comptes courants propriétaires et reversements (menu **Finance › Clients et propriétaires › Reversements et commissions › Comptes propriétaires**, URL `/tenant/:tenantId/finance/owner-accounts`) : consulter, reverser (numéro `REV-AAAA-NNNN`), annuler un reversement.
- Commissions des agents (même famille, onglet **Commissions des agents**, URL `/tenant/:tenantId/finance/commissions`).
- Indivision (carte **Indivision** de la fiche d'un bien) et son effet sur relevés et comptes.

## Prérequis

- Environnement de recette avec l'agence A (pack Agence ou Opérateur intégré), ADMIN_A connecté. Les envois d'e-mail sont captés par le récepteur local de l'environnement ; il n'y a pas de WhatsApp.
- Baux créés dans `02-baux.md` (cas `GL-02-…`), échéances générées et facturées, paiements enregistrés dans `06-paiements.md` (cas `GL-06-…`). Si ces fichiers ont créé d'autres montants que ceux du tableau ci-dessous, **recalculer les attendus avec les formules** données plus bas.
- Contacts CRM des propriétaires portant le rôle **Propriétaire** (fiche contact › Rôles), avec adresse e-mail valide ; le consentement e-mail est activé pour P1 et désactivé pour P2 (utile aux cas d'envoi).
- Les cas sont à jouer **dans l'ordre** : les premiers fixent les honoraires, les suivants dépendent des paiements et des montants calculés.
- **Ordre impératif avec les fichiers 02 et 06 (règle de gel des honoraires)** : les honoraires sont figés avec les conditions en vigueur et ne s'appliquent qu'aux encaissements enregistrés **après** l'enregistrement de ces conditions (taux de l'agence, conditions du propriétaire, conditions du bail). Les cas GL-10-001 à GL-10-007 (taux, forfait de P2, part de AGENT_A, gestionnaire du bail R1) doivent donc être joués **avant** l'enregistrement des paiements R1, R2 et R3 du fichier 06. Si ces paiements existent déjà, enregistrer de nouveaux paiements REC-GL après les cas GL-10-001 à 007 (mêmes montants, nouvelles échéances) : les attendus chiffrés ne valent que pour des encaissements postérieurs aux conditions ; pour les paiements antérieurs, recalculer avec le taux alors en vigueur (souvent celui de l'agence seule).

## Jeu de données de référence (partagé avec les fichiers 11 et 12)

| Élément                | Valeur                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Honoraires de l'agence | Pourcentage 10 %, calculés sur « Le loyer seul, hors charges et pénalités »                                                                             |
| TVA de l'agence        | Assujettie, taux 18 %                                                                                                                                   |
| P1                     | REC-GL Propriétaire Un (`rec-gl-proprietaire1@exemple.test`), conditions de l'agence                                                                    |
| P2                     | REC-GL Propriétaire Deux (`rec-gl-proprietaire2@exemple.test`), forfait 15 000 FCFA par échéance                                                        |
| T1, T2, T3             | REC-GL Locataire Un, Deux, Trois (`rec-gl-locataire1@exemple.test`, …2, …3)                                                                             |
| Biens                  | REC-GL Villa Cocody (P1), REC-GL Studio Marcory (P1), REC-GL Appartement Plateau (P2)                                                                   |
| Bail R1                | Villa, T1 : loyer 200 000, charges 20 000 (échéance 220 000), échéance le 5, début 01/10/2026                                                           |
| Bail R2                | Studio, T2 : loyer 100 000, charges 0, échéance le 5, début 01/10/2026                                                                                  |
| Bail R3                | Appartement, T3 : loyer 150 000, charges 0, échéance le 5, début 01/09/2026                                                                             |
| Paiements              | R1 octobre : 220 000 le 08/10/2026 (Espèces) ; R2 octobre : 60 000 le 10/10/2026 (Virement) ; R3 septembre : 150 000 le 07/09/2026 ; R3 octobre : aucun |
| Dépense                | Villa, « REC-GL Réparation plomberie », 15 000 le 12/10/2026                                                                                            |

**Formules de contrôle.** Pour un règlement affecté à une échéance : assiette = montant affecté × loyer de l'échéance ÷ total de l'échéance (mode « loyer seul ») ; honoraires = assiette × taux, arrondis au franc ; TVA = honoraires × 18 %, arrondie au franc ; en mode forfait, honoraires = forfait × (montant affecté ÷ total de l'échéance). **Net à reverser = loyers encaissés − honoraires − TVA − dépenses − retenue à la source + dépôt de garantie conservé.**

Valeurs attendues avec le jeu ci-dessus :

|                    | Encaissé                   | Honoraires HT           | TVA                   | Dépenses | Net                        |
| ------------------ | -------------------------- | ----------------------- | --------------------- | -------- | -------------------------- |
| P1, octobre 2026   | 280 000 (220 000 + 60 000) | 26 000 (20 000 + 6 000) | 4 680 (3 600 + 1 080) | 15 000   | **234 320**                |
| P2, septembre 2026 | 150 000                    | 15 000 (forfait)        | 2 700                 | 0        | **132 300**                |
| P2, octobre 2026   | 0                          | 0                       | 0                     | 0        | **0** (restant dû 150 000) |

- **Convention réseau** : les `fetch` de console cités dans ce fichier utilisent l'adresse de l'API de l'environnement (voir RUNBOOK ; `http://localhost:8820/api` pour la recette du 2026-11-03, voir le README du dossier) avec `credentials:'include'` ; on peut aussi relever la requête émise par l'écran dans l'onglet Réseau. Les identifiants d'objets sont relevés dans l'onglet Réseau, jamais saisis à la main.
- **Comptes et volume de l'agence A** : l'agence A de la recette porte un historique de trois ans (nombreux propriétaires, baux, relevés, reversements). Les attendus chiffrés de ce fichier valent pour les **lignes REC-GL** créées par ces cas : comparer les lignes et détails REC-GL, pas les totaux de l'agence (« Total dû aux propriétaires », totaux des Commissions, etc. incluent les autres propriétaires ; vérifier alors seulement leur cohérence arithmétique). AGENT_A, désigné gestionnaire des baux R1, est le compte « gestionnaire » du README.

## Données créées par ce fichier

Relevés `2026-10` (P1) et `2026-09` (P2), liens sécurisés, reversements `REV-2026-NNNN` (puis annulés), dépense temporaire « REC-GL Dépense test négative » (supprimée), conditions d'honoraires du propriétaire P2, part de commission de AGENT_A, indivision temporaire sur la Villa (supprimée en fin de fichier).

---

## A. Paramétrage des honoraires

### GL-10-001 — Fixer la TVA et le taux d'honoraires de l'agence

- **Rôle** : ADMIN_A
- **Préconditions** : aucun encaissement de recette n'a encore été enregistré, ou les honoraires ne sont pas encore figés (un taux ne s'applique qu'aux encaissements enregistrés **après** son enregistrement).
- **Données** : TVA assujettie, taux 18 ; mode Pourcentage ; taux 10 ; calculé sur le loyer seul.
- **Étapes** :
  1. Menu **Paramétrage › Agence › Paramètres financiers** (`/tenant/:tenantId/settings/finance`).
  2. Dans la carte **Fiscalité**, activer « L'agence est assujettie à la TVA » et saisir « Taux de TVA (%) » = 18.
  3. Dans la carte **Honoraires de gestion**, choisir « Mode de calcul » = **Pourcentage**, « Taux d'honoraires (%) » = 10, « Calculés sur » = **Le loyer seul, hors charges et pénalités**.
  4. Lire l'encart d'exemple (« Exemple sur un loyer encaissé de … »), puis cliquer **Enregistrer**.
- **Attendu** :
  - Message de réussite, formulaire rechargé avec les valeurs saisies ; le bandeau « Ces paramètres n'ont jamais été enregistrés » disparaît s'il était affiché.
  - L'encart d'exemple est cohérent : Honoraires = 10 % de l'exemple, TVA = 18 % des honoraires, « Net au propriétaire » = exemple − honoraires − TVA.
  - Requête `PUT` des paramètres financiers : 200.
- **Gravité si échec** : Bloquant

### GL-10-002 — Validations des honoraires et de la TVA

- **Rôle** : ADMIN_A
- **Préconditions** : GL-10-001 passé.
- **Données** : taux 101 ; taux −1 ; forfait 0 ; TVA vide.
- **Étapes** :
  1. Sur **Paramètres financiers**, saisir « Taux d'honoraires (%) » = 101 puis −1 : observer le champ (bornes 0 à 100).
  2. Passer le mode à **Forfait par échéance**, saisir « Forfait par échéance (FCFA) » = 0 puis enregistrer.
  3. Vider « Taux de TVA (%) » avec l'agence assujettie, puis enregistrer.
  4. Remettre les valeurs de GL-10-001 (Pourcentage, 10, loyer seul, TVA 18) et enregistrer.
- **Attendu** :
  - Taux hors 0–100 impossible à saisir ou refusé.
  - Forfait 0 : message « Le forfait doit être supérieur à 0 » ; forfait vide : « Le montant du forfait est requis ».
  - TVA vide : message « Le taux de TVA est requis » ; rien n'est enregistré dans les trois cas.
  - Aucun écran blanc, aucune erreur 500 dans le réseau.
- **Gravité si échec** : Mineur

### GL-10-003 — Conditions d'honoraires propres à un propriétaire (forfait)

- **Rôle** : ADMIN_A
- **Préconditions** : P2 existe comme propriétaire de l'agence (client de type propriétaire) ; aucun paiement de R3 n'est encore enregistré (voir « Ordre impératif » en tête de fichier).
- **Données** : P2 : forfait 15 000 FCFA ; statut fiscal « Personne physique ».
- **Étapes** :
  1. **Paramètres financiers**, carte **Conditions par propriétaire** : repérer la ligne REC-GL Propriétaire Deux (colonne Conditions : « Suit l'agence »).
  2. Cliquer **Modifier** : la fenêtre « Conditions de REC-GL Propriétaire Deux » s'ouvre.
  3. « Mode de calcul » = **Forfait par échéance**, forfait = 15000 ; « Statut fiscal (retenue à la source) » = **Personne physique** ; **Enregistrer**.
- **Attendu** :
  - Message « Conditions du propriétaire enregistrées » ; la ligne affiche « Forfait 15 000 FCFA » (libellé « Forfait {{amount}} »).
  - La colonne **Baux** de la ligne indique le nombre de baux du propriétaire.
  - P1 reste « Suit l'agence ».
- **Gravité si échec** : Majeur

### GL-10-004 — Revenir aux conditions de l'agence, puis rétablir le forfait

- **Rôle** : ADMIN_A
- **Préconditions** : GL-10-003 passé.
- **Données** : —
- **Étapes** :
  1. Sur la ligne de P2, cliquer **Revenir** : la confirmation « Revenir aux conditions de l'agence pour REC-GL Propriétaire Deux ? » s'affiche ; valider avec « Revenir aux conditions de l'agence ».
  2. Constater l'état, puis recommencer GL-10-003 pour rétablir le forfait de 15 000 FCFA.
- **Attendu** :
  - Message « Le propriétaire suit maintenant les conditions de l'agence » ; la ligne repasse à « Suit l'agence ».
  - Annuler la confirmation (bouton **Annuler**) ne change rien.
  - Après rétablissement, la ligne affiche à nouveau « Forfait 15 000 FCFA ».
- **Gravité si échec** : Majeur

### GL-10-005 — Commission des collaborateurs

- **Rôle** : ADMIN_A
- **Préconditions** : AGENT_A est collaborateur actif de l'agence.
- **Données** : part de AGENT_A = 40 ; valeur invalide 101.
- **Étapes** :
  1. **Paramètres financiers**, carte **Commission des collaborateurs** : ligne AGENT_A, colonne **Part (%)**.
  2. Saisir 101 puis **Enregistrer** ; corriger en 40 puis **Enregistrer**.
  3. Vider le champ (retirer la part) et enregistrer ; remettre 40.
- **Attendu** :
  - 101 refusé (borne 0–100) sans enregistrement.
  - 40 : message « Part de {{name}} enregistrée ».
  - Champ vide : la part est supprimée (valeur nulle), la commission de l'agent n'est plus calculée sur les nouveaux encaissements.
- **Gravité si échec** : Majeur

### GL-10-006 — Aucun honoraire tant que le taux n'est pas fixé (état initial, si rejouable)

- **Rôle** : ADMIN_A
- **Préconditions** : une agence ou un propriétaire sur lequel aucun taux n'a jamais été fixé et dont un encaissement existe (sinon marquer « non rejouable » : ce cas n'est possible qu'avant GL-10-001).
- **Données** : encaissement antérieur à tout paramétrage.
- **Étapes** :
  1. Générer un relevé (cas GL-10-012) pour cette période.
  2. Ouvrir son détail.
  3. Fixer ensuite le taux (GL-10-001) et ouvrir de nouveau le détail.
- **Attendu** :
  - Sans taux : honoraires = 0 et bandeau « Aucun honoraire déduit : le taux de l'agence n'était pas fixé au moment du calcul » avec le lien « Fixer le taux d'honoraires » et, si le relevé est en brouillon, un bouton **Recalculer**.
  - Après avoir fixé le taux, les encaissements **déjà faits** ne reçoivent pas d'honoraires (règle de gel) : ils restent à 0 ; seuls les encaissements suivants en reçoivent.
- **Gravité si échec** : Majeur

### GL-10-007 — Désigner AGENT_A gestionnaire du bail R1 (avant tout encaissement figé)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-10-005 passé (part de 40 %) ; bail R1 actif (fichier 02) ; **aucun paiement de R1 enregistré avant ce cas** (le gestionnaire est figé avec les honoraires au premier calcul ; sinon la commission du cas GL-10-060 serait nulle et il faudra le noter).
- **Données** : bail R1 : gestionnaire AGENT_A, conditions du propriétaire (pas de dérogation de bail).
- **Étapes** :
  1. Menu **Baux** › bail R1 › carte **Honoraires et gestionnaire** (zone « Conditions du bail »).
  2. Lire « Honoraires applicables » : origine « Paramètres de l'agence », mode Pourcentage, taux 10 %, assiette « Le loyer seul ».
  3. Choisir « Gestionnaire du bail » = AGENT_A ; ne pas fixer de conditions propres au bail ; **Enregistrer**.
  4. Faire de même pour R2 en laissant « Aucun gestionnaire ».
- **Attendu** :
  - Message de réussite ; la carte affiche le gestionnaire AGENT_A pour R1 et « Aucun gestionnaire » pour R2.
  - Sans taux fixé, la carte propose « Fixer le taux d'honoraires » et affiche « Aucun taux fixé » (cas contraire à GL-10-001).
- **Gravité si échec** : Majeur

---

## B. Génération et justesse du relevé

### GL-10-010 — Saisir la dépense de la Villa (donnée du relevé)

- **Rôle** : ADMIN_A
- **Préconditions** : bien Villa existant, paiements R1 et R2 enregistrés (fichier 06).
- **Données** : libellé « REC-GL Réparation plomberie », montant 15000, date de paiement 12/10/2026, ponctuelle.
- **Étapes** :
  1. Menu **Biens** › fiche de REC-GL Villa Cocody › onglet **Patrimoine**.
  2. Ouvrir **Gérer les dépenses**, cliquer **Ajouter dépense**.
  3. Renseigner Catégorie (une catégorie d'entretien ou de réparation, libellé à confirmer), Libellé, Montant, Devise = FCFA, Date de paiement ; enregistrer.
- **Attendu** :
  - Message « Dépense ajoutée » ; la dépense apparaît dans « Charges et dépenses » avec 15 000 FCFA.
  - Une date de paiement future est refusée pour une dépense périodique (message « La date de paiement d'une dépense périodique ne peut pas être dans le futur »).
- **Gravité si échec** : Majeur

### GL-10-011 — Page Relevés : état vide

- **Rôle** : ADMIN_A
- **Préconditions** : aucun relevé n'a encore été généré pour l'agence (sinon noter « non rejouable » et vérifier seulement la structure de la page).
- **Données** : —
- **Étapes** :
  1. Menu **Patrimoine › Relevés** (`/tenant/:tenantId/patrimoine/statements`).
- **Attendu** :
  - Titre « Relevés de gérance », sous-titre « Génération, suivi et envoi des relevés propriétaires » ; carte « Générer un relevé de gérance » ; carte « Historique des relevés » avec tableau vide (texte d'état vide à confirmer).
  - La liste des propriétaires du formulaire ne contient que des contacts ayant le rôle Propriétaire ; P1 et P2 y figurent.
  - Aucune erreur dans la console.
- **Gravité si échec** : Mineur

### GL-10-012 — Générer le relevé d'octobre 2026 de P1

- **Rôle** : ADMIN_A
- **Préconditions** : GL-10-001, GL-10-010 ; échéances d'octobre de R1 et R2 facturées (Finance › Facturation du mois) ou payées.
- **Données** : propriétaire REC-GL Propriétaire Un ; période `2026-10` ; biens REC-GL Villa Cocody et REC-GL Studio Marcory.
- **Étapes** :
  1. Sur **Relevés**, carte « Générer un relevé de gérance » : choisir le propriétaire, saisir « Période (YYYY-MM) » = 2026-10, sélectionner les deux biens.
  2. Cliquer **Générer le relevé**.
  3. Lire la ligne créée dans « Historique des relevés ».
- **Attendu** :
  - Message « Relevé généré ». Ligne : Période 2026-10 ; Propriétaire REC-GL Propriétaire Un ; **Loyers encaissés 280 000 FCFA** (et non 320 000, loyer des contrats) ; **Honoraires et TVA 30 680 FCFA** (26 000 + 4 680) ; **Dépenses 15 000 FCFA** ; **Net à reverser 234 320 FCFA** ; Statut **Brouillon** ; boutons Détails et Envoyer.
  - Réseau : `POST /api/tenants/:tenantId/owner-statements` → 201.
- **Gravité si échec** : Bloquant

### GL-10-013 — Détail du relevé : chaque ligne et chaque total

- **Rôle** : ADMIN_A
- **Préconditions** : GL-10-012 passé.
- **Données** : —
- **Étapes** :
  1. Dans l'historique, cliquer **Détails** sur la ligne 2026-10 (URL `/tenant/:tenantId/patrimoine/statements/:id`).
  2. Relever la fiche puis le tableau « Lignes du relevé ».
- **Attendu** :
  - Fiche : Période 2026-10 ; Statut Brouillon ; Propriétaire ; **Loyers appelés 320 000** ; **Loyers encaissés 280 000** ; **Restant dû par les locataires 40 000** (le solde de R2) ; **Honoraires de gestion (10 %) 26 000** ; **TVA sur honoraires (18 %) 4 680** ; **Dépenses 15 000** ; Retenue à la source 0 ; Dépôt de garantie conservé 0 ; **Net à reverser 234 320** ; Envoyé le « - ».
  - Lignes (colonnes Bien, Libellé, Type, Montant) — Villa : « Loyers encaissés » 220 000 (type Loyer encaissé), « Honoraires de gestion (10 %) » 20 000, « TVA sur honoraires (18 %) » 3 600, « REC-GL Réparation plomberie » 15 000 (type Dépense déduite) ; Studio : « Loyers encaissés » 60 000, honoraires 6 000, TVA 1 080.
  - Vérification arithmétique : 280 000 − 26 000 − 4 680 − 15 000 = 234 320.
  - Bouton **Retour** ramène à la liste.
- **Gravité si échec** : Bloquant

### GL-10-014 — Loyer encaissé et non loyer du contrat : locataire qui n'a rien payé

- **Rôle** : ADMIN_A
- **Préconditions** : GL-10-001 ; R3 payé en septembre (150 000), rien payé en octobre ; P2 au forfait.
- **Données** : propriétaire P2 ; périodes `2026-09` puis `2026-10` ; bien Appartement Plateau.
- **Étapes** :
  1. Générer le relevé de P2 pour `2026-09`, ouvrir son détail.
  2. Générer le relevé de P2 pour `2026-10`, ouvrir son détail.
- **Attendu** :
  - Septembre : Loyers encaissés 150 000 ; Honoraires de gestion 15 000 (libellé de ligne « Honoraires de gestion (forfait) ») ; TVA 2 700 ; Net **132 300**.
  - Octobre : Loyers appelés 150 000 ; Loyers encaissés **0** ; Restant dû par les locataires **150 000** ; honoraires 0 ; TVA 0 ; Net 0. Aucune ligne « Loyers encaissés » n'est créée pour R3.
  - Le bandeau « Aucun honoraire déduit … » n'apparaît pas (le forfait du propriétaire est fixé).
- **Gravité si échec** : Bloquant (un loyer non payé affiché comme encaissé = montant faux)

### GL-10-015 — Régénérer un relevé encore en brouillon

- **Rôle** : ADMIN_A
- **Préconditions** : relevé 2026-10 de P1 en Brouillon.
- **Données** : mêmes que GL-10-012.
- **Étapes** :
  1. Régénérer le relevé de P1 pour `2026-10` avec les deux mêmes biens.
  2. Régénérer en ne sélectionnant que la Villa.
  3. Rétablir les deux biens.
- **Attendu** :
  - Aucun doublon : une seule ligne 2026-10 pour P1 (unicité propriétaire + période) dont les montants sont recalculés.
  - Villa seule : encaissé 220 000, honoraires 20 000, TVA 3 600, dépenses 15 000, net 181 400 ; retour aux deux biens : net 234 320.
- **Gravité si échec** : Majeur

### GL-10-016 — Validations du formulaire de génération

- **Rôle** : ADMIN_A
- **Préconditions** : page Relevés ouverte.
- **Données** : champs vides ; période `2026-3` ; `2026-13` ; `202610`.
- **Étapes** :
  1. Cliquer **Générer le relevé** sans rien remplir.
  2. Choisir le propriétaire, saisir `2026-3`, un bien : valider.
  3. Saisir `2026-13` : valider.
- **Attendu** :
  - Messages « Sélectionnez un propriétaire », « Période requise », « Sélectionnez au moins un bien ».
  - `2026-3` ou `202610` : « Format YYYY-MM ».
  - `2026-13` (format correct, mois impossible) : refus par le serveur avec un message clair (pas d'erreur 500) et aucun relevé créé.
- **Gravité si échec** : Mineur

### GL-10-017 — Bien d'un autre propriétaire dans le relevé

- **Rôle** : ADMIN_A
- **Préconditions** : biens Villa (P1) et Appartement (P2).
- **Données** : propriétaire P1, période `2026-09`, biens Villa **et Appartement Plateau**.
- **Étapes** :
  1. Générer le relevé de P1 pour `2026-09` en sélectionnant aussi l'Appartement Plateau (bien de P2).
  2. Ouvrir le détail ; supprimer ensuite ce relevé s'il a été créé (régénérer avec la seule Villa ne le supprime pas : le noter).
- **Attendu** :
  - Attendu métier : refus (le bien n'appartient pas à ce propriétaire) ou, à défaut, absence des encaissements de P2 dans le relevé de P1.
  - **Point de vigilance (anomalie probable)** : la génération ne vérifie que l'appartenance des biens à l'agence ; si le relevé de P1 contient les 150 000 de R3, c'est un montant faux et une fuite entre propriétaires → Bloquant.
- **Gravité si échec** : Bloquant

### GL-10-018 — Période future et période sans activité

- **Rôle** : ADMIN_A
- **Préconditions** : —
- **Données** : P1, biens Villa + Studio, périodes `2027-06` et `2026-08`.
- **Étapes** :
  1. Générer le relevé pour `2027-06` puis pour `2026-08` (avant le début des baux).
  2. Ouvrir chaque détail.
- **Attendu** :
  - Pas d'erreur 500 ; relevés à zéro (encaissé 0, honoraires 0, net 0) ou refus clair de la période future. Le comportement observé est noté dans le journal (la règle n'est pas précisée dans la spécification).
  - Aucune ligne de loyer n'est inventée à partir du contrat.
- **Gravité si échec** : Mineur

### GL-10-019 — Bien ou propriétaire d'une autre agence (contrôle réseau)

- **Rôle** : ADMIN_A
- **Préconditions** : un identifiant de bien de l'agence B (fourni par ADMIN_B).
- **Données** : `propertyIds` = [id du bien de B] ; `ownerContactId` = contact de A.
- **Étapes** :
  1. Dans la console du navigateur d'ADMIN_A, appeler `fetch('/api/tenants/<A>/owner-statements', {method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ownerContactId:'<contact A>', period:'2026-10', propertyIds:['<bien de B>']})})` (adapter l'URL de l'API à l'environnement, voir RUNBOOK).
  2. Refaire avec `ownerContactId` d'un contact de B.
- **Attendu** :
  - Premier appel : 400 « Un ou plusieurs biens sont introuvables ou hors tenant » ; second : 404 « Contact propriétaire introuvable ». Aucune donnée de B dans la réponse.
- **Gravité si échec** : Bloquant

### GL-10-020 — Double clic sur « Générer le relevé »

- **Rôle** : ADMIN_A
- **Préconditions** : formulaire rempli pour P1, `2026-10`.
- **Données** : —
- **Étapes** :
  1. Double-cliquer rapidement sur **Générer le relevé**.
  2. F5 après la réponse.
- **Attendu** :
  - Le bouton passe en chargement ; une seule ligne 2026-10 pour P1 ; pas de message d'erreur d'unicité visible.
  - Après F5 : la liste est identique, rien n'est regénéré.
- **Gravité si échec** : Mineur

---

## C. Envoi, rapport mensuel et liens sécurisés

### GL-10-025 — Envoyer le relevé au propriétaire (brouillon → envoyé)

- **Rôle** : ADMIN_A
- **Préconditions** : relevé 2026-10 de P1 en Brouillon ; contact de P1 avec adresse e-mail valide et consentement e-mail **activé** ; événement e-mail « relevé propriétaire » activé (par défaut).
- **Données** : —
- **Étapes** :
  1. Sur la ligne 2026-10 de P1, cliquer **Envoyer**.
  2. Ouvrir le récepteur d'e-mails local et lire le message reçu.
  3. Rouvrir le détail du relevé.
- **Attendu** :
  - Message « Relevé envoyé (email) » ; Statut passe à **Envoyé** ; le détail affiche « Envoyé le » avec la date du jour.
  - L'e-mail contient les lignes du relevé au format « - <libellé> (<référence du bien>) : <montant> FCFA » et le net ; il est adressé à P1.
  - Réseau : `POST …/owner-statements/:id/send` → 202.
- **Gravité si échec** : Bloquant

### GL-10-026 — Envoi refusé : le propriétaire n'a pas consenti

- **Rôle** : ADMIN_A
- **Préconditions** : relevé 2026-09 de P2 en Brouillon ; contact de P2 avec e-mail mais consentement e-mail **désactivé**.
- **Données** : —
- **Étapes** :
  1. Cliquer **Envoyer** sur le relevé 2026-09 de P2.
- **Attendu** :
  - Message d'erreur « Le propriétaire n'a pas consenti à recevoir des communications par e-mail : le relevé ne peut pas lui être envoyé. » ; statut inchangé (Brouillon) ; aucun e-mail reçu.
  - Réseau : 409.
- **Gravité si échec** : Majeur

### GL-10-027 — Envoi impossible : pas d'adresse e-mail, ou événement désactivé

- **Rôle** : ADMIN_A
- **Préconditions** : (a) un contact propriétaire sans e-mail, si la fiche contact le permet ; (b) pour (b), l'événement d'e-mail « relevé propriétaire » désactivé dans la configuration des notifications e-mail de l'agence (Communication, libellé à confirmer).
- **Données** : —
- **Étapes** :
  1. (a) Envoyer un relevé du contact sans e-mail.
  2. (b) Désactiver l'événement, envoyer le relevé de P1 d'un autre mois en brouillon, puis réactiver l'événement.
- **Attendu** :
  - (a) Avertissement « Le propriétaire n'a pas d'email valide. » ; (b) avertissement « L'envoi est désactivé pour ce type de notification. » ; dans les deux cas le statut reste Brouillon.
  - Si (a) est impossible parce que l'e-mail du contact est obligatoire, noter « non testable en interface ».
- **Gravité si échec** : Mineur

### GL-10-028 — Régénérer un relevé déjà envoyé

- **Rôle** : ADMIN_A
- **Préconditions** : relevé 2026-10 de P1 au statut Envoyé (GL-10-025).
- **Données** : mêmes que GL-10-012.
- **Étapes** :
  1. Dans le formulaire, régénérer le relevé de P1 pour `2026-10`.
- **Attendu** :
  - Message d'erreur « Ce relevé a déjà été envoyé au propriétaire : il ne peut plus être recalculé. » ; le relevé et ses montants sont inchangés.
- **Gravité si échec** : Majeur

### GL-10-029 — Renvoyer un relevé envoyé : le statut ne doit pas régresser

- **Rôle** : ADMIN_A
- **Préconditions** : relevé 2026-10 de P1 « Envoyé ».
- **Données** : —
- **Étapes** :
  1. Cliquer de nouveau **Envoyer** sur la ligne (le bouton reste visible pour tout relevé calculé selon la méthode actuelle).
  2. Lire le message, le statut et la date « Envoyé le ».
- **Attendu** :
  - Le renvoi réussit (nouvel e-mail) ou est refusé clairement ; le statut reste **Envoyé**.
  - **Point de vigilance** : voir GL-10-053 — pour un relevé « Payé », le renvoi repositionne le statut à « Envoyé » (aucune garde de transition côté serveur) → Majeur.
- **Gravité si échec** : Majeur

### GL-10-030 — Rapport du mois sur un relevé encore brouillon

- **Rôle** : ADMIN_A
- **Préconditions** : un relevé au statut Brouillon (ex. 2026-09 de P2).
- **Données** : —
- **Étapes** :
  1. Détail du relevé 2026-09 de P2 : carte « Rapport mensuel et liens sécurisés ».
  2. Cliquer **Envoyer le rapport du mois**, puis **Copier le lien sécurisé**.
- **Attendu** :
  - Dans les deux cas, message : « Ce relevé est encore un brouillon : il ne peut être partagé qu'une fois envoyé au propriétaire, depuis la liste des relevés (bouton « Envoyer »). » ; aucun lien créé ; la liste « Liens actifs » reste vide (« Aucun lien actif. »).
  - Réseau : 409.
- **Gravité si échec** : Majeur

### GL-10-031 — Envoyer le rapport du mois par e-mail

- **Rôle** : ADMIN_A
- **Préconditions** : relevé 2026-10 de P1 « Envoyé » ; consentement e-mail de P1 actif ; événement « rapport mensuel » activé pour l'e-mail (par défaut).
- **Données** : —
- **Étapes** :
  1. Détail du relevé 2026-10 : cliquer **Envoyer le rapport du mois**.
  2. Lire l'e-mail dans le récepteur local ; noter l'adresse du lien (`…/rapport-proprietaire#<jeton>`).
  3. Observer le tableau « Liens actifs ».
- **Attendu** :
  - Message « Rapport envoyé par e-mail. » ; réseau 202.
  - L'e-mail contient le lien, le nom du propriétaire, le mois et la date d'expiration ; il ne contient pas les montants.
  - Une ligne apparaît dans « Liens actifs » : Créé le (maintenant), Expire le (≈ +7 jours), Consultations 0, Dernière consultation « - », Statut **Actif**, bouton Révoquer.
  - Un second clic crée un second lien et un second e-mail (l'envoi manuel ignore l'anti-doublon).
- **Gravité si échec** : Majeur

### GL-10-032 — Rapport du mois : aucun canal éligible, événement désactivé, WhatsApp

- **Rôle** : ADMIN_A
- **Préconditions** : relevé « Envoyé » dont le propriétaire a ensuite perdu son consentement e-mail (désactiver le consentement sur la fiche contact de P1 pour ce cas, puis le rétablir).
- **Données** : —
- **Étapes** :
  1. Cliquer **Envoyer le rapport du mois** avec le consentement désactivé.
  2. Rétablir le consentement, désactiver l'événement « rapport mensuel » dans la configuration de l'agence, recliquer, puis réactiver l'événement.
  3. WhatsApp : sans objet dans l'environnement (voir attendu).
- **Attendu** :
  - Étape 1 : avertissement « Aucun canal éligible : consentement ou coordonnées manquants. » ; réseau 200 ; aucun lien créé.
  - Étape 2 : « Cet envoi est désactivé dans la configuration de l'agence. »
  - WhatsApp : **non testable** (pas de fournisseur WhatsApp en recette) ; l'envoi par ce canal est couvert uniquement par lecture du code.
- **Gravité si échec** : Mineur

### GL-10-033 — Copier le lien sécurisé

- **Rôle** : ADMIN_A
- **Préconditions** : relevé 2026-10 de P1 « Envoyé ».
- **Données** : —
- **Étapes** :
  1. Cliquer **Copier le lien sécurisé**.
  2. Coller le presse-papiers dans la barre d'adresse d'une fenêtre privée (utilisée au cas suivant, sans l'ouvrir ici).
  3. Si le navigateur refuse l'accès au presse-papiers, lire la fenêtre « Copiez ce lien manuellement ».
- **Attendu** :
  - Message « Lien sécurisé copié dans le presse-papiers. » (ou fenêtre « Copiez ce lien manuellement » avec « Ce lien ne sera plus affiché après la fermeture de cette fenêtre. »).
  - Le lien commence par l'adresse du site et se termine par `/rapport-proprietaire#` suivi d'un jeton long (le jeton n'est jamais relisible ensuite).
  - Nouvelle ligne dans « Liens actifs ». Réseau : `POST …/secure-links` → 201.
- **Gravité si échec** : Majeur

### GL-10-034 — Ouvrir le lien public (sans connexion)

- **Rôle** : PUBLIC
- **Préconditions** : lien copié au cas précédent ; fenêtre privée, non connectée.
- **Données** : —
- **Étapes** :
  1. Coller le lien dans la fenêtre privée et valider.
  2. Lire la page ; cliquer **Imprimer / enregistrer en PDF** (aperçu seulement).
  3. Retourner ADMIN_A › détail du relevé › « Liens actifs ».
- **Attendu** :
  - Page « Rapport mensuel — octobre 2026 » avec nom de l'agence, « Propriétaire : REC-GL Propriétaire Un » ; carte **Synthèse** : Loyers appelés 320 000, Loyers encaissés 280 000, Restant dû 40 000, Honoraires 26 000, TVA 4 680, Dépenses 15 000, Net à reverser 234 320 ; une carte par bien avec ses lignes et un « Sous-total ».
  - Les chiffres sont identiques à ceux du relevé côté agence.
  - Phrase « Ce lien expire le … » ; le jeton disparaît de la barre d'adresse après chargement ; aucun menu d'agence, aucun appel `/auth/me` ni `/auth/refresh`.
  - Côté agence : Consultations passe à 1 et « Dernière consultation » est renseignée.
  - Réseau : `POST /api/public/secure-links/owner-monthly-report` → 200 avec en-têtes `no-store`.
- **Gravité si échec** : Bloquant

### GL-10-035 — Recharger la page publique (F5) et jeton altéré

- **Rôle** : PUBLIC
- **Préconditions** : GL-10-034 passé (page ouverte).
- **Données** : jeton altéré = lien dont le dernier caractère est modifié.
- **Étapes** :
  1. Appuyer sur F5 sur la page ouverte.
  2. Ouvrir le lien avec un jeton altéré.
  3. Ouvrir `/rapport-proprietaire` sans jeton.
- **Attendu** :
  - Après F5 (jeton retiré de l'adresse par conception) et dans les deux autres cas : « Ce lien est invalide ou a expiré. Demandez un nouveau lien à votre agence. » — jamais d'écran blanc ni de donnée.
  - Le jeton altéré donne 404 réseau (refus uniforme). Le F5 qui efface l'accès est noté comme comportement à confirmer (Mineur si jugé gênant).
- **Gravité si échec** : Mineur

### GL-10-036 — Révoquer un lien sécurisé

- **Rôle** : ADMIN_A, puis PUBLIC
- **Préconditions** : au moins un lien actif (GL-10-033) dont l'URL complète est conservée.
- **Données** : —
- **Étapes** :
  1. Détail du relevé › « Liens actifs » › **Révoquer** : la confirmation « Révoquer ce lien ? » précise « Le propriétaire ne pourra plus ouvrir le rapport avec ce lien. » ; choisir **Annuler**, puis refaire et choisir **Révoquer**.
  2. Dans la fenêtre privée, rouvrir l'URL conservée.
- **Attendu** :
  - Message « Lien révoqué. » ; la ligne disparaît de « Liens actifs ».
  - La page publique répond « Ce lien est invalide ou a expiré. Demandez un nouveau lien à votre agence. » (même refus qu'un lien inconnu).
  - Les autres liens du relevé restent actifs.
- **Gravité si échec** : Bloquant (un lien révoqué qui fonctionne encore expose des montants)

### GL-10-037 — Lien expiré ; limite de débit du lien public

- **Rôle** : PUBLIC
- **Préconditions** : lien actif ; accès à la console du navigateur.
- **Données** : 31 appels en moins d'une minute.
- **Étapes** :
  1. Lien expiré : la durée minimale (1 jour) interdit de le constater en recette sans modifier la base ou l'horloge — noter « non testable en interface ».
  2. Depuis la console de la fenêtre privée, exécuter 31 `fetch('/api/public/secure-links/owner-monthly-report', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({token:'x'})})` à la suite.
  3. Rouvrir ensuite un lien valide depuis la même adresse IP.
- **Attendu** :
  - Au-delà de 30 requêtes par minute et par IP : 429 ; la page affiche « Trop de tentatives, réessayez dans quelques minutes. »
  - Les 30 premiers appels répondent 404 (refus uniforme).
- **Gravité si échec** : Mineur

### GL-10-038 — Libellé de dépense contenant du HTML dans le relevé, l'e-mail et la page publique

- **Rôle** : ADMIN_A, PUBLIC
- **Préconditions** : relevé de P1 pour un mois contenant une dépense au libellé `REC-GL <b>gras</b> <img src=x onerror=alert(1)>` (dépense saisie comme au cas GL-10-010, sur un autre mois, relevé envoyé).
- **Données** : libellé ci-dessus.
- **Étapes** :
  1. Générer le relevé, ouvrir son détail.
  2. L'envoyer et lire l'e-mail dans le récepteur local.
  3. Créer un lien, l'ouvrir en fenêtre privée.
- **Attendu** :
  - Dans les trois endroits, le libellé s'affiche comme **texte brut** (balises visibles ou neutralisées), aucune fenêtre d'alerte, aucune image, aucune mise en gras.
- **Gravité si échec** : Bloquant (script exécuté)

---

## D. Comptes courants des propriétaires et reversements

### GL-10-040 — Liste des comptes propriétaires

- **Rôle** : ADMIN_A
- **Préconditions** : GL-10-012 et GL-10-014 passés (paiements enregistrés). Le compte se synchronise à chaque consultation : il n'existe pas de bouton « synchroniser ».
- **Données** : —
- **Étapes** :
  1. Menu **Finance › Clients et propriétaires › Reversements et commissions** ; onglet **Comptes propriétaires** (`/tenant/:tenantId/finance/owner-accounts`).
  2. Lire la carte « Total dû aux propriétaires » et le tableau.
- **Attendu** :
  - Titre « Comptes propriétaires », sous-titre « N propriétaire(s) » ; colonnes Propriétaire, E-mail, **Solde dû**, Dernier mouvement, Dernier reversement, Actions (**Voir le compte**).
  - REC-GL Propriétaire Un : solde dû **234 320 FCFA** ; REC-GL Propriétaire Deux : **132 300 FCFA** (même valeur que le net des relevés correspondants). « Dernier reversement » = « — ». « Dernier mouvement » = date du dernier mouvement du compte.
  - « Total dû aux propriétaires » = somme des soldes positifs affichés (366 620 FCFA si seuls P1 et P2 existent).
  - Sur un téléphone la liste devient des cartes (voir fichier 14).
- **Gravité si échec** : Bloquant

### GL-10-041 — Détail du compte de P1 : mouvements et totaux

- **Rôle** : ADMIN_A
- **Préconditions** : GL-10-040 passé.
- **Données** : —
- **Étapes** :
  1. Cliquer **Voir le compte** sur REC-GL Propriétaire Un (`/tenant/:tenantId/finance/owner-accounts/:ownerClientId`).
  2. Lire l'en-tête, les cinq indicateurs, « Mouvements du compte » et « Reversements ».
- **Attendu** :
  - En-tête : nom du propriétaire, e-mail, bouton **Nouveau reversement** ; « Solde dû » **234 320 FCFA**.
  - Indicateurs : Loyers encaissés **280 000** ; Honoraires **26 000** ; TVA **4 680** ; Dépenses **15 000** ; Reversements **0**.
  - Mouvements (colonnes Date, Type, Libellé, Bien ou bail, Débit, Crédit, Solde dû après) : deux « Loyer encaissé » en crédit (220 000 le 08/10, 60 000 le 10/10), deux « Honoraires » et deux « TVA sur honoraires » en débit, une « Dépense » de 15 000 en débit ; le dernier « Solde dû après » vaut 234 320. Chaque ligne indique le bien ou le bail.
  - Tableau « Reversements » : « Aucun reversement enregistré. »
  - Crédits − débits = solde dû : 280 000 − 26 000 − 4 680 − 15 000 = 234 320.
- **Gravité si échec** : Bloquant

### GL-10-042 — Cohérence relevé / compte / portail

- **Rôle** : ADMIN_A
- **Préconditions** : GL-10-013 et GL-10-041 passés, aucun reversement.
- **Données** : —
- **Étapes** :
  1. Comparer le « Net à reverser » du relevé 2026-10 de P1, le « Solde dû » de son compte et la phrase « L'agence vous doit » du portail propriétaire (cas GL-12-060 du fichier 12).
- **Attendu** :
  - Les trois valeurs sont égales (234 320 FCFA) tant que P1 n'a pas d'autre activité, pas de reversement et pas de retenue à la source.
  - Si une différence apparaît, l'expliquer par un mouvement hors période du relevé (le compte cumule toutes les périodes, le relevé un seul mois) ; sinon anomalie.
- **Gravité si échec** : Bloquant

### GL-10-043 — Reverser une partie du solde

- **Rôle** : ADMIN_A
- **Préconditions** : compte de P1 à 234 320 FCFA ; un compte de trésorerie utilisable pour le mode Virement (sinon créer la banque dans Finance › Caisse et comptabilité › Trésorerie, libellé à confirmer).
- **Données** : montant 200000 ; date du jour ; mode **Virement** ; référence `REC-GL-VIR-001` ; notes « Reversement octobre ».
- **Étapes** :
  1. Détail du compte de P1 : bouton **Nouveau reversement**. Lire l'avertissement « Un reversement enregistré ne se modifie pas : en cas d’erreur, on l’annule et on en saisit un nouveau. » et la valeur proposée par défaut (le solde dû, 234 320).
  2. Remplacer le montant par 200000, choisir le mode, le compte de trésorerie si proposé, saisir référence et notes.
  3. Cliquer **Enregistrer**.
- **Attendu** :
  - Message « Reversement REV-AAAA-NNNN enregistré. » (AAAA = année de la date choisie, NNNN = rang dans l'agence pour cette année, sur 4 chiffres) ; la fenêtre se ferme.
  - « Solde dû » = **34 320 FCFA** ; indicateur Reversements = 200 000 ; nouveau mouvement « Reversement » en débit de 200 000 (libellé « Reversement REV-… ») ; tableau « Reversements » : numéro, date, mode « Virement », référence `REC-GL-VIR-001`, montant 200 000, statut **Validé**, bouton **Annuler**.
  - Dans la liste des comptes : solde 34 320 et « Dernier reversement » = `REV-… · 200 000 FCFA · date`.
  - Réseau : `POST …/owner-accounts/:ownerClientId/payouts` → 201.
- **Gravité si échec** : Bloquant

### GL-10-044 — Reversement supérieur au solde dû

- **Rôle** : ADMIN_A
- **Préconditions** : solde de P1 = 34 320 FCFA (GL-10-043).
- **Données** : montant 40000.
- **Étapes** :
  1. **Nouveau reversement**, montant 40000, mode Espèces, **Enregistrer**.
- **Attendu** :
  - Message d'erreur « Le reversement dépasse le solde dû au propriétaire » (le message générique « L'enregistrement du reversement a échoué. » n'est qu'un repli) ; la fenêtre reste ouverte ; solde et liste inchangés ; réseau 409.
  - Aucun numéro `REV-…` consommé de façon visible (le prochain reversement valide garde le rang suivant).
- **Gravité si échec** : Majeur

### GL-10-045 — Validations du formulaire de reversement

- **Rôle** : ADMIN_A
- **Préconditions** : détail du compte de P1.
- **Données** : montant vide, 0, −5, 1000,5 ; date de demain ; bouton **Renoncer**.
- **Étapes** :
  1. Ouvrir **Nouveau reversement**, effacer le montant : observer le bouton **Enregistrer**.
  2. Saisir 0, puis −5 (champ avec minimum 1), puis 1000,5.
  3. Ouvrir le sélecteur de date : tenter d'atteindre demain.
  4. Cliquer **Renoncer**, rouvrir la fenêtre.
  5. Contrôle réseau (console) : `POST` avec `paidAt` de demain ; puis avec un mode inconnu (`method: "BITCOIN"`).
- **Attendu** :
  - Montant vide ou ≤ 0 : le bouton Enregistrer est désactivé ; le message « Indiquez un montant positif. » s'affiche si le clic passe malgré tout ; le champ refuse le négatif.
  - 1000,5 : arrondi à une valeur entière de FCFA ou refus clair (pas de montant à 1000,5 enregistré tel quel).
  - Dates futures grisées dans le sélecteur ; par l'API : 400 « La date du reversement ne peut pas être dans le futur » ; mode inconnu : 400 de validation, jamais 500.
  - **Renoncer** ferme sans rien enregistrer ; la fenêtre rouverte est réinitialisée (montant = solde dû).
- **Gravité si échec** : Mineur

### GL-10-046 — Double clic sur « Enregistrer » et F5

- **Rôle** : ADMIN_A
- **Préconditions** : solde de P1 = 34 320 FCFA.
- **Données** : montant 10000, mode Espèces.
- **Étapes** :
  1. **Nouveau reversement**, montant 10000, double-cliquer rapidement sur **Enregistrer**.
  2. Après la réponse, appuyer sur F5.
- **Attendu** :
  - Un seul reversement de 10 000 est créé (bouton en chargement, un seul numéro) ; solde = 24 320 FCFA.
  - Après F5 : mêmes données, aucun doublon.
- **Gravité si échec** : Bloquant (double décaissement)

### GL-10-047 — Écriture comptable du reversement

- **Rôle** : ADMIN_A
- **Préconditions** : reversements des cas GL-10-043 et GL-10-046.
- **Données** : —
- **Étapes** :
  1. Menu **Finance › Caisse et comptabilité › Comptabilité** : consulter le journal de la période du reversement.
  2. Rechercher la pièce « Reversement REV-… au propriétaire ».
- **Attendu** :
  - Une écriture équilibrée par reversement : débit du compte « Fonds des propriétaires » (4731 par défaut) rattaché à l'auxiliaire du propriétaire, crédit du compte de trésorerie du mode choisi (banque pour Virement, caisse pour Espèces), même montant.
  - Libellés de ligne « Reversement REV-… ».
  - Si l'écran de comptabilité demande des filtres ou un paramétrage préalable, les noter (libellé à confirmer).
- **Gravité si échec** : Majeur

### GL-10-048 — Annuler un reversement : motif obligatoire

- **Rôle** : ADMIN_A
- **Préconditions** : reversement de 200 000 (GL-10-043) au statut Validé ; ADMIN_A détient le droit de validation financière.
- **Données** : motifs « ab » puis « Erreur sur le montant (REC-GL) ».
- **Étapes** :
  1. Dans « Reversements », cliquer **Annuler** sur le reversement de 200 000. Lire la fenêtre « Annuler ce reversement ? » : « Une pièce d’annulation liée sera créée. Le reversement d’origine reste visible avec son numéro, mais son montant ne compte plus dans le solde dû. »
  2. Laisser « Motif de l'annulation » vide : observer le bouton « Confirmer l'annulation ».
  3. Saisir « ab » puis confirmer.
  4. Saisir « Erreur sur le montant (REC-GL) » puis confirmer.
- **Attendu** :
  - Motif vide : bouton désactivé.
  - « ab » (moins de 3 caractères) : refus du serveur avec un message lisible (pas d'erreur 500) ; le reversement reste Validé.
  - Motif valide : message « Reversement REV-… annulé. », fenêtre fermée.
  - Réseau : `POST …/payouts/:payoutId/void` → 200.
- **Gravité si échec** : Majeur

### GL-10-049 — Effets de l'annulation sur le compte

- **Rôle** : ADMIN_A
- **Préconditions** : GL-10-048 passé ; reversement de 10 000 (GL-10-046) toujours Validé.
- **Données** : —
- **Étapes** :
  1. Relire le détail du compte de P1 et la liste des comptes.
- **Attendu** :
  - Le reversement de 200 000 reste affiché avec son numéro, montant barré, statut **Annulé**, motif visible sous l'étiquette ; plus de bouton Annuler sur cette ligne.
  - Nouveau mouvement « Annulation » (libellé « Annulation du reversement REV-… — Erreur sur le montant (REC-GL) ») en crédit de 200 000 ; « Solde dû » = 234 320 − 10 000 = **224 320 FCFA**.
  - Indicateur Reversements = 10 000 (l'annulé compte pour zéro). Liste des comptes : « Dernier reversement » = celui de 10 000 (un reversement annulé n'est jamais « dernier »).
  - Comptabilité : une écriture de contre-passation « Annulation du reversement REV-… : Erreur sur le montant (REC-GL) ».
- **Gravité si échec** : Bloquant

### GL-10-050 — Annuler deux fois le même reversement

- **Rôle** : ADMIN_A
- **Préconditions** : deux onglets sur le détail du compte de P1, reversement de 10 000 Validé dans les deux.
- **Données** : motif « Doublon REC-GL ».
- **Étapes** :
  1. Onglet 1 : annuler le reversement de 10 000 et confirmer.
  2. Onglet 2 (sans recharger) : cliquer Annuler et confirmer.
- **Attendu** :
  - Onglet 2 : message « Ce reversement est déjà annulé » (409) ; un seul mouvement d'annulation existe ; solde = 234 320 FCFA.
- **Gravité si échec** : Bloquant

### GL-10-051 — Reverser le solde entier, puis un reversement de trop

- **Rôle** : ADMIN_A
- **Préconditions** : solde de P1 = 234 320 FCFA, aucun reversement validé.
- **Données** : montant par défaut (le solde), mode Espèces ; second reversement 1 FCFA.
- **Étapes** :
  1. **Nouveau reversement** : laisser le montant proposé (234 320), **Enregistrer**.
  2. Relire solde et liste ; ouvrir **Nouveau reversement** : le montant proposé est vide.
  3. Tenter 1 FCFA.
  4. Annuler le reversement de 234 320 avec le motif « Remise en état REC-GL » pour restituer le solde aux cas suivants.
- **Attendu** :
  - Après l'étape 1 : solde dû **0 FCFA** (affiché « 0 », sans couleur d'alerte) ; la carte « Total dû aux propriétaires » baisse de 234 320.
  - Étape 3 : « Le reversement dépasse le solde dû au propriétaire » (409).
  - Après l'étape 4 : solde 234 320 FCFA.
- **Gravité si échec** : Bloquant

### GL-10-052 — Numérotation REV-AAAA-NNNN

- **Rôle** : ADMIN_A
- **Préconditions** : solde de P1 supérieur à 3 000 FCFA.
- **Données** : deux reversements de 1000 FCFA, l'un daté du jour, l'autre daté du 31/12/2025 ; un troisième de 1000 après annulation du premier.
- **Étapes** :
  1. Enregistrer les deux reversements ; noter leurs numéros.
  2. Annuler le reversement du jour.
  3. Enregistrer un nouveau reversement du jour de 1000.
  4. Annuler tous les reversements de test (motif « Nettoyage REC-GL »).
- **Attendu** :
  - Format `REV-2026-NNNN` pour le reversement du jour et `REV-2025-NNNN` pour celui daté de 2025 ; les compteurs sont séparés par année.
  - Le numéro d'un reversement annulé n'est jamais réattribué : le troisième reversement a un rang supérieur au premier.
  - Pas de doublon de numéro dans l'agence (une collision entre deux propriétaires reversés en même temps est un défaut).
  - Solde final de P1 = 234 320.
- **Gravité si échec** : Majeur

### GL-10-053 — Lier un reversement à un relevé : fonction API seulement

- **Rôle** : ADMIN_A
- **Préconditions** : relevé 2026-10 de P1 « Envoyé » ; relevé 2026-09 de P2 ; identifiants dans le réseau du navigateur. **L'écran de reversement n'envoie pas de `statementId`** : ce cas se joue par la console.
- **Données** : `statementId` = relevé de P1, montant 1000 ; ensuite `statementId` = relevé de P2 pour un reversement de P1.
- **Étapes** :
  1. `POST …/owner-accounts/<P1>/payouts` avec `{amount:1000, paidAt:'<aujourd'hui>', method:'CASH', statementId:'<relevé 2026-10 de P1>'}`.
  2. Relire la liste des relevés. Cliquer **Envoyer** sur ce relevé « Payé ».
  3. `PATCH …/owner-statements/<id>` avec `{"status":"DRAFT"}` sur le même relevé.
  4. Refaire l'étape 1 avec le relevé de P2 (propriétaire différent).
  5. Annuler les reversements créés (motif « Nettoyage REC-GL »).
- **Attendu** :
  - Attendu métier : le relevé passe « Payé » seulement si le reversement le couvre et correspond à son propriétaire ; un relevé « Payé » ne revient pas en arrière ; l'annulation du reversement remet le relevé à « Envoyé ».
  - **Points de vigilance (anomalies probables)** : (a) 1000 FCFA suffisent à passer un relevé de 234 320 en « Payé » ; (b) un reversement de P1 peut marquer « Payé » le relevé de P2 ; (c) « Envoyer » sur un relevé « Payé » le repasse « Envoyé » ; (d) `PATCH` accepte n'importe quelle transition de statut. Chaque point constaté : Majeur.
  - Dans l'interface, le statut « Payé » n'est donc **jamais** atteint par un reversement saisi à l'écran.
- **Gravité si échec** : Majeur

### GL-10-054 — Solde négatif (le propriétaire doit de l'argent à l'agence)

- **Rôle** : ADMIN_A
- **Préconditions** : compte de P2 à 132 300 FCFA (septembre).
- **Données** : dépense « REC-GL Dépense test négative » de 200000 sur l'Appartement Plateau, payée le 20/09/2026.
- **Étapes** :
  1. Ajouter la dépense (comme GL-10-010) sur l'Appartement Plateau.
  2. Détail du compte de P2, puis liste des comptes, puis portail propriétaire de P2 (« Mon compte »).
  3. Tenter **Nouveau reversement** de 1000.
  4. Supprimer la dépense (« Supprimer cette dépense ? ») et relire le compte.
- **Attendu** :
  - Solde dû de P2 = **−67 700 FCFA** (132 300 − 200 000), affiché en négatif dans le détail et la liste ; dans le portail : « Vous devez à l'agence » et 67 700 en valeur absolue.
  - « Nouveau reversement » ne propose aucun montant par défaut ; 1000 FCFA est refusé (« Le reversement dépasse le solde dû au propriétaire »).
  - « Total dû aux propriétaires » ignore ce solde négatif (somme des soldes positifs).
  - Après suppression de la dépense : solde revenu à 132 300 FCFA par contre-passation (mouvement d'annulation visible), sans mouvement perdu.
- **Gravité si échec** : Majeur

### GL-10-055 — Reversements simultanés sur deux onglets

- **Rôle** : ADMIN_A
- **Préconditions** : solde de P1 = 234 320 FCFA ; deux onglets ouverts sur le détail du compte, fenêtre de reversement ouverte dans les deux avec le montant proposé (234 320).
- **Données** : montant 234 320 dans chaque onglet.
- **Étapes** :
  1. Valider l'onglet 1, puis immédiatement l'onglet 2.
  2. Annuler le reversement valide (motif « Nettoyage REC-GL »).
- **Attendu** :
  - Un seul reversement est enregistré ; l'autre onglet affiche « Le reversement dépasse le solde dû au propriétaire » (verrou du compte : le second voit le solde déjà diminué).
  - Solde final 234 320 après nettoyage.
- **Gravité si échec** : Bloquant

### GL-10-056 — Identifiant de propriétaire inexistant (contrôle réseau)

- **Rôle** : ADMIN_A
- **Préconditions** : —
- **Données** : `ownerClientId` = un UUID inventé.
- **Étapes** :
  1. Ouvrir `/tenant/<A>/finance/owner-accounts/00000000-0000-4000-8000-000000000000`.
  2. `GET …/owner-accounts/<UUID inventé>` et `POST …/payouts` sur ce même UUID depuis la console.
- **Attendu** :
  - Écran « Impossible de charger ce compte. » avec bouton **Réessayer** (pas d'écran blanc) ; réseau 404 « Proprietaire introuvable » ; aucune création.
- **Gravité si échec** : Mineur

---

## E. Commissions des agents

### GL-10-060 — Commissions d'octobre : part de l'agent et honoraires sans gestionnaire

- **Rôle** : ADMIN_A
- **Préconditions** : GL-10-005 (40 %), GL-10-007 (R1 géré par AGENT_A, R2 sans gestionnaire), honoraires figés à l'encaissement des paiements d'octobre.
- **Données** : période octobre 2026.
- **Étapes** :
  1. Menu **Finance › Clients et propriétaires › Reversements et commissions**, onglet **Commissions des agents** (`/tenant/:tenantId/finance/commissions`).
  2. Dans « Période », choisir octobre 2026 (l'URL porte `?period=2026-10`).
  3. Lire les quatre indicateurs, déplier la ligne de AGENT_A.
- **Attendu** :
  - Indicateurs : **Honoraires HT 26 000** ; **TVA 4 680** ; **Commissions dues aux agents 8 000** (40 % de 20 000) ; **Honoraires sans gestionnaire 6 000** (R2).
  - Tableau : ligne AGENT_A (part 40 %, un encaissement, honoraires 20 000, commission 8 000) et ligne « Sans gestionnaire » (honoraires 6 000) ; le détail déplié montre Date d'encaissement (08/10/2026), Bail, Bien, Montant encaissé (220 000), Honoraires (20 000), Part de l'agent (8 000).
  - Phrase d'aide : « Les honoraires sont figés à l’encaissement : un changement de taux ou de part ne modifie pas une commission déjà calculée. »
- **Gravité si échec** : Majeur

### GL-10-061 — Période sans encaissement et période invalide

- **Rôle** : ADMIN_A
- **Préconditions** : —
- **Données** : période janvier 2026 ; `?period=2026-13` dans l'URL.
- **Étapes** :
  1. Choisir janvier 2026.
  2. Modifier l'URL en `?period=2026-13`.
- **Attendu** :
  - Janvier : indicateurs à 0 et message « Aucun honoraire encaissé sur cette période. »
  - Période invalide : message d'erreur clair (« Periode invalide, format attendu YYYY-MM » côté serveur) avec bouton Réessayer, ou retour à la période courante ; pas d'écran blanc.
- **Gravité si échec** : Mineur

### GL-10-062 — Changer la part de l'agent ne réécrit pas le passé

- **Rôle** : ADMIN_A
- **Préconditions** : GL-10-060 passé.
- **Données** : nouvelle part de AGENT_A = 50.
- **Étapes** :
  1. Régler la part à 50 (GL-10-005).
  2. Rouvrir les commissions d'octobre.
  3. Enregistrer un nouveau paiement de R2 (fichier 06) puis relire novembre.
- **Attendu** :
  - Octobre inchangé (commission 8 000) ; un nouvel encaissement sur un bail géré par AGENT_A recevrait 50 %.
  - Remettre ensuite la part à 40.
- **Gravité si échec** : Majeur

### GL-10-063 — Associations (partage de revenus) selon le pack

- **Rôle** : ADMIN_A
- **Préconditions** : agence au pack Agence (sans la fonctionnalité Chantiers).
- **Données** : —
- **Étapes** :
  1. Dans la même famille de menu, cliquer sur l'onglet **Associations** (`/tenant/:tenantId/finance/associations`).
- **Attendu** :
  - Attendu : l'écran est refusé proprement (« Fonction non comprise dans votre abonnement », avec boutons de retour) car les associations relèvent de la fonctionnalité Chantiers ; aucune erreur 500.
  - Si l'onglet est visible alors qu'il est refusé, noter l'incohérence de navigation (Cosmétique). Création d'association, ajout d'associé, rattachement d'un bien et état de quote-part : **non testables sur ce pack** (à jouer dans la recette du pack Promoteur).
- **Gravité si échec** : Mineur

---

## F. Indivision (plusieurs propriétaires d'un même bien)

### GL-10-070 — Définir l'indivision de la Villa : validations

- **Rôle** : ADMIN_A
- **Préconditions** : Villa louée à T1 (R1) avec paiements d'octobre ; P2 est un propriétaire de l'agence ; comptes de P1 et de P2 connus (234 320 et 132 300 FCFA).
- **Données** : P1 60 %, P2 40 % ; erreurs : 60 + 30 ; même propriétaire deux fois.
- **Étapes** :
  1. Fiche du bien REC-GL Villa Cocody, carte **Indivision** : lire « Pas d'indivision : le bien appartient à … ».
  2. Cliquer **Définir l'indivision** : ajouter les lignes avec **Ajouter un propriétaire**, parts 60 et 30 ; observer le total ; **Enregistrer**.
  3. Ajouter deux fois P1 ; **Enregistrer**.
  4. Utiliser **Répartir à parts égales** puis fixer 60 / 40 ; **Enregistrer**.
- **Attendu** :
  - 60 + 30 : refus « Les quotes-parts doivent totaliser 100 % (actuellement 90 %). » ; doublon : « Un même propriétaire apparaît deux fois ».
  - 60 / 40 : message « Indivision enregistrée. » ; la carte liste les deux indivisaires avec leur part ; boutons **Modifier** et **Supprimer l'indivision** apparaissent.
- **Gravité si échec** : Majeur

### GL-10-071 — Effet de l'indivision sur les comptes

- **Rôle** : ADMIN_A
- **Préconditions** : GL-10-070 (60 / 40).
- **Données** : —
- **Étapes** :
  1. Relire le compte de P1 puis celui de P2.
- **Attendu** :
  - Les mouvements de la Villa sont répartis : P1 reçoit 60 % (loyer 132 000, honoraires 12 000, TVA 2 160, dépense 9 000) et P2 40 % (88 000, 8 000, 1 440, 6 000). Le compte de P1 devient 132 000 − 12 000 − 2 160 − 9 000 + (Studio : 60 000 − 6 000 − 1 080) = **161 760 FCFA** ; celui de P2 devient 132 300 + (88 000 − 8 000 − 1 440 − 6 000) = **204 860 FCFA**.
  - La somme des deux comptes est inchangée (234 320 + 132 300 = 366 620 avant ; 161 760 + 204 860 = 366 620 après) : aucun franc créé ou perdu.
  - Les anciens mouvements ne sont ni supprimés ni modifiés : les inscriptions entières sont contre-passées et réinscrites (mouvements d'annulation visibles).
- **Gravité si échec** : Bloquant

### GL-10-072 — Effet de l'indivision sur les relevés

- **Rôle** : ADMIN_A
- **Préconditions** : GL-10-070 ; relevé 2026-10 de P1 envoyé (non régénérable) : utiliser un mois sans relevé ou un autre bail ; sinon générer P2 pour `2026-10` avec la Villa.
- **Données** : P2, période `2026-10`, biens Villa et Appartement Plateau.
- **Étapes** :
  1. Générer le relevé de P2 pour `2026-10` (Villa + Appartement).
  2. Ouvrir le détail.
- **Attendu** :
  - Lignes de la Villa suffixées « (quote-part 40 %) » : « Loyers encaissés (quote-part 40 %) » 88 000, honoraires 8 000, TVA 1 440, dépense 6 000. Les honoraires restent ceux figés à l'encaissement selon les conditions applicables au bail R1 (conditions de l'agence, car le propriétaire du bail est P1) : le forfait de P2 ne s'applique pas à la Villa.
  - Loyers encaissés totaux de P2 = 88 000 (Villa) + 0 (Appartement, rien payé en octobre).
  - La somme des parts de P1 et de P2 sur chaque ligne de la Villa égale la ligne entière (220 000, 20 000, 3 600, 15 000) ; un écart d'arrondi de 1 FCFA entre relevé et compte est à signaler (Mineur).
- **Gravité si échec** : Majeur

### GL-10-073 — Supprimer l'indivision et revenir au propriétaire unique

- **Rôle** : ADMIN_A
- **Préconditions** : indivision en place.
- **Données** : —
- **Étapes** :
  1. Carte **Indivision** › **Supprimer l'indivision** › confirmer « Supprimer l'indivision ? ».
  2. Relire les comptes de P1 et P2.
- **Attendu** :
  - Message « Indivision supprimée. » ; la carte affiche de nouveau « Pas d'indivision … ».
  - Comptes de retour à 234 320 (P1) et 132 300 (P2), plus les mouvements de contre-passation visibles. Supprimer ensuite le relevé de test de P2 n'est pas possible (aucune suppression de relevé en interface) : le noter.
- **Gravité si échec** : Majeur

---

## G. Tâches planifiées (information)

### GL-10-080 — Envoi mensuel automatique du rapport et alertes d'échéance

- **Rôle** : ADMIN_A
- **Préconditions** : —
- **Données** : —
- **Étapes** :
  1. Vérifier avec l'administrateur technique si la tâche d'envoi mensuel (active les 10 premiers jours du mois, désactivée par défaut) et les alertes d'échéance de bail ou de document pour propriétaire sont activées dans l'environnement.
  2. Si activées, attendre ou déclencher selon le RUNBOOK, puis relire l'historique de la communication (Paramétrage › Agence › Journal des notifications).
- **Attendu** :
  - Un seul message par relevé non brouillon et par mois (anti-doublon), uniquement pour les propriétaires consentants ; aucun message pour un relevé brouillon.
  - Sinon : **non testable en interface** (tâche planifiée désactivée par défaut, WhatsApp absent).
- **Gravité si échec** : Mineur

---

## Couverture

| Sous-fonctionnalité du classeur                                                               | Cas                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consulter / lister les comptes courants propriétaires (Finance › Reversements et commissions) | GL-10-040, 041, 042, 056, 071                                                                                                                            |
| Reverser un propriétaire (REV-AAAA-NNNN, verrou, solde dû)                                    | GL-10-043 à 047, 051, 052, 054, 055                                                                                                                      |
| Annuler un reversement (motif ≥ 3 caractères, contre-passation, 409 si déjà annulé)           | GL-10-048, 049, 050, 053                                                                                                                                 |
| Lier un reversement à un relevé (`statementId`, relevé « Payé »/« Envoyé »)                   | GL-10-053 (API seulement, absent de l'interface)                                                                                                         |
| Consulter l'état des commissions des collaborateurs                                           | GL-10-060, 061, 062                                                                                                                                      |
| Configurer les honoraires par propriétaire / réinitialiser                                    | GL-10-003, 004                                                                                                                                           |
| Configurer l'agence (taux, TVA) — base des calculs                                            | GL-10-001, 002, 006                                                                                                                                      |
| Configurer la commission des collaborateurs                                                   | GL-10-005, 007                                                                                                                                           |
| Consulter / lister les relevés propriétaires                                                  | GL-10-011, 012, 013, 014                                                                                                                                 |
| Générer un relevé propriétaire (périodes, unicité, refus si déjà réglé/envoyé)                | GL-10-012 à 020, 028                                                                                                                                     |
| Modifier un relevé propriétaire (`PATCH`)                                                     | non testable en interface ; GL-10-053 (par la console)                                                                                                   |
| Recalculer un relevé propriétaire                                                             | GL-10-006 (bouton **Recalculer** du bandeau sur relevé brouillon) ; relevé « Ancien calcul » : non testable sans données héritées d'une ancienne version |
| Envoyer un relevé au propriétaire (consentement, événement désactivé)                         | GL-10-025 à 029                                                                                                                                          |
| Envoyer le rapport du mois (WhatsApp ou e-mail)                                               | GL-10-030, 031, 032 ; canal WhatsApp : non testable en recette                                                                                           |
| Créer / copier un lien sécurisé                                                               | GL-10-033                                                                                                                                                |
| Lister les liens sécurisés actifs                                                             | GL-10-031, 033, 034                                                                                                                                      |
| Révoquer un lien sécurisé                                                                     | GL-10-036                                                                                                                                                |
| Rapport mensuel public par lien sécurisé (`/rapport-proprietaire`)                            | GL-10-034, 035, 036, 037 ; lien expiré : non testable (durée minimale 1 jour)                                                                            |
| Envoi mensuel automatique / alertes d'échéance propriétaire                                   | GL-10-080 (information ; tâche planifiée désactivée par défaut)                                                                                          |
| Indivision et répartition par quote-part (relevés, comptes)                                   | GL-10-070 à 073                                                                                                                                          |
| Associations (partage de revenus, fonctionnalité Chantiers)                                   | GL-10-063 (refus selon pack) ; reste non testable sur le pack Agence                                                                                     |
| Compte courant côté portail propriétaire                                                      | cas du fichier 12 (GL-12-…) ; recoupement GL-10-042, 054                                                                                                 |
| Droits et isolation des écrans de ce fichier                                                  | fichier 13                                                                                                                                               |
