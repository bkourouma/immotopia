# Workflow de test simple - Module Syndic

## Comment utiliser ce document
Pour chaque page:
1. Lire "Cette page permet de faire".
2. Faire les actions dans "Ce qu'on doit faire".
3. Vérifier "Résultat attendu".

---

## Preparation générale (avant de commencer)
1. Vérifier qu'un tenant avec module `MODULE_SYNDIC` actif est disponible.
2. Vérifier qu'au moins une copropriété existe (ou en creer une dans l'etape 1).
3. Vérifier qu'il existe des contacts CRM (propriétaires + locataires) pour tester les affectations.
4. Vérifier qu'il existe des biens dans `Propriétés` pour tester l'import des lots.
5. Garder sous la main:
- `Contact locataire` exemple: `b391be0f-76ea-4998-886b-f1d8451f7bd7`
- `syndicId` exemple: `54180050-e76f-4622-a92b-c0972503a85f`

---

## 1) Page: /tenant/:tenantId/syndics
Exemple: `http://localhost:3000/tenant/b391be0f-76ea-4998-886b-f1d8451f7bd7/syndics`

### Cette page permet de faire
1. Voir la liste des copropriétés du tenant.
2. Créer une copropriété.
3. Ouvrir la fiche détail d'une copropriété.

### Ce qu'on doit faire
1. Ouvrir la page.
2. Vérifier l'affichage de la liste (nom, adresse, statut, compteurs).
3. Cliquer sur `Créer une copropriété`.
4. Remplir les champs obligatoires, valider.
5. Vérifier que la nouvelle copropriété apparaît dans la liste.
6. Ouvrir la fiche détail de la copropriété créée.

### Résultat attendu
1. La page se charge sans erreur.
2. Création fonctionnelle et visible immédiatement.
3. Navigation vers le détail OK.

---

## 2) Page: /tenant/:tenantId/syndics/:syndicId

### Cette page permet de faire
1. Voir les informations générales de la copropriété.
2. Voir les indicateurs (lots, batiments, appels de charges).
3. Naviguer vers tous les sous-modules syndic.

### Ce qu'on doit faire
1. Ouvrir la fiche d'une copropriété.
2. Vérifier les informations générales (nom, adresse, reference cadastrale, nb lots, nb batiments).
3. Cliquer chaque bouton de navigation:
- `Gerer les lots`
- `Charges`
- `Assemblées`
- `Prestataires`
- `Documents`
- `Finances`
- `Recouvrement`
- `Comptabilite`
- `Budgets`
- `Profils/Incidents`

### Résultat attendu
1. Les donnees du syndic sont coherentes.
2. Tous les liens ouvrent la bonne route sans erreur 404.

---

## 3) Page: /tenant/:tenantId/syndics/:syndicId/lots

### Cette page permet de faire
1. Créer/modifier des lots de copropriété.
2. Importer des lots depuis les biens existants.
3. Assigner un locataire a un lot.
4. Ouvrir le compte propriétaire d'un lot.

### Ce qu'on doit faire
1. Ouvrir la page lots.
2. Cliquer `Nouveau lot`, renseigner:
- Numéro de lot
- Type de lot
- Tantièmes généraux
- (optionnel) Tantièmes spéciaux
- (optionnel) Bien lie
- (optionnel) Propriétaire CRM
3. Valider et verifier la ligne dans le tableau.
4. Cliquer `Modifier` sur la ligne créée et changer une valeur.
5. Cliquer `Importer des biens`, selectionner 1 a 2 propriétés, valider.
6. Vérifier que les lots importes apparaissent.
7. Cliquer `Locataire` sur un lot, assigner un contact locataire + date début.
8. Vérifier le nom du locataire dans la colonne `Locataire`.
9. Cliquer `Compte` pour ouvrir le compte propriétaire du lot.
10. Sur mobile/largeur reduite, verifier le scroll horizontal du tableau.

### Résultat attendu
1. CRUD lot fonctionnel.
2. Import lots fonctionnel avec mapping correct des propriétés.
3. Assignation locataire enregistree.
4. Navigation vers compte lot OK.
5. Tableau responsive avec scroll horizontal visible en bas.

---

## 4) Page: /tenant/:tenantId/syndics/:syndicId/lots/:lotId/compte

### Cette page permet de faire
1. Voir le solde du compte propriétaire du lot.
2. Voir l'historique des transactions.
3. Ajouter un ajustement.
4. Exporter un releve.

### Ce qu'on doit faire
1. Ouvrir le compte d'un lot.
2. Vérifier les stats: `Solde courant`, `Transactions`, `Propriétaire`.
3. Cliquer `Ajouter ajustement`, saisir un montant + motif, valider.
4. Vérifier la nouvelle transaction dans l'historique.
5. Cliquer le bouton de releve (si disponible dans la page) et verifier le retour.

### Résultat attendu
1. Les transactions se rafraichissent apres ajout.
2. Le solde est mis a jour correctement.
3. Le releve se genere sans erreur API.

---

## 5) Page: /tenant/:tenantId/syndics/:syndicId/charges

### Cette page permet de faire
1. Visualiser les appels de charges.
2. Filtrer par statut/période.
3. Créer un appel de charges (lot unique, plusieurs lots, ou tous les lots).

### Ce qu'on doit faire
1. Ouvrir la page charges.
2. Vérifier les indicateurs (montant appele, en attente, en retard).
3. Changer les filtres statut/période.
4. Cliquer `Créer un appel de charges`.
5. Tester les 3 modes de ciblage:
- un lot
- plusieurs lots
- tous les lots
6. Saisir période, montant, date d'échéance, valider.
7. Vérifier l'apparition dans la liste.

### Résultat attendu
1. Les filtres mettent a jour la liste.
2. La creation fonctionne pour tous les modes.
3. Les statuts (`PENDING`, `OVERDUE`, etc.) sont coherents avec les dates/conditions.

---

## 6) Page: /tenant/:tenantId/syndics/:syndicId/assemblées

### Cette page permet de faire
1. Lister les assemblées générales.
2. Créer une assemblée générale.
3. Ouvrir le détail d'une assemblee.

### Ce qu'on doit faire
1. Ouvrir la page AG.
2. Vérifier la liste existante.
3. Cliquer `Créer une assemblée générale`.
4. Renseigner date, lieu, titre/description, valider.
5. Vérifier la nouvelle AG dans la liste.
6. Ouvrir le détail de l'AG créée.

### Résultat attendu
1. Création AG OK.
2. Redirection/détail AG OK.

---

## 7) Page: /tenant/:tenantId/syndics/:syndicId/assemblées/:meetingId

### Cette page permet de faire
1. Gerer l'ordre du jour.
2. Ajouter des résolutions.
3. Saisir/visualiser les votes.
4. Générer le compte rendu Word.

### Ce qu'on doit faire
1. Ouvrir le détail d'une AG.
2. Cliquer `Ajouter un point d'ordre du jour`, valider.
3. Modifier un point existant.
4. Cliquer `Ajouter une résolution`, renseigner les champs, valider.
5. Enregistrer des votes (pour/contre/abstention selon UI).
6. Cliquer `Générer compte rendu Word`.

### Résultat attendu
1. Les points et résolutions sont persistes.
2. Les votes sont pris en compte dans l'affichage.
3. Le compte rendu est genere/téléchargé sans erreur.

---

## 8) Page: /tenant/:tenantId/syndics/:syndicId/prestataires

### Cette page permet de faire
1. Voir les prestataires.
2. Créer un contrat de maintenance.
3. Voir les actifs communs associes.

### Ce qu'on doit faire
1. Ouvrir la page prestataires.
2. Vérifier les sections:
- Prestataires
- Contrats de maintenance
- Actifs communs
3. Cliquer `Nouveau contrat`.
4. Renseigner prestataire, type de contrat, dates, montant, valider.
5. Vérifier la ligne dans `Contrats de maintenance`.

### Résultat attendu
1. Les donnees prestataires se chargent correctement.
2. Le contrat créé apparait immédiatement.

---

## 9) Page: /tenant/:tenantId/syndics/:syndicId/documents

### Cette page permet de faire
1. Lister les documents syndic.
2. Filtrer par type.
3. Ajouter un document.

### Ce qu'on doit faire
1. Ouvrir la page documents.
2. Appliquer un filtre de type, verifier le resultat.
3. Cliquer `Ajouter un document`.
4. Renseigner titre, type, URL/fichier selon formulaire, valider.
5. Vérifier l'apparition de la ligne dans le tableau.

### Résultat attendu
1. Le filtre fonctionne.
2. Le document est créé et visible.
3. Les liens de document sont ouvrables.

---

## 10) Page: /tenant/:tenantId/syndics/:syndicId/finances

### Cette page permet de faire
1. Voir la synthese financiere de la copropriété.
2. Consulter les fonds de copropriété.

### Ce qu'on doit faire
1. Ouvrir la page finances.
2. Vérifier les indicateurs:
- Total fonds
- Total appele
- Total paye
- Reste a payer
- Dossiers en retard
- Montant en retard
3. Vérifier la section `Fonds de copropriété`.

### Résultat attendu
1. Les montants sont affiches sans valeur incoherente.
2. Les totaux sont coherents avec les charges et paiements existants.

---

## 11) Page: /tenant/:tenantId/syndics/:syndicId/recouvrement

### Cette page permet de faire
1. Piloter les impayes.
2. Créer des relances manuelles.
3. Appliquer des pénalités/remises.
4. Créer des échéanciers.
5. Lancer des relances par lot.

### Ce qu'on doit faire
1. Ouvrir la page recouvrement.
2. Vérifier les blocs:
- Dashboard retards
- Historique relances
- Penalites de retard
- Echeanciers
3. Cliquer `Créer une relance manuelle`, valider.
4. Cliquer `Appliquer une pénalité`, valider.
5. Cliquer `Remise de pénalité`, valider.
6. Cliquer `Créer un échéancier`, ajouter au moins 2 échéances, valider.
7. Tester l'action de relance batch si disponible.

### Résultat attendu
1. Les actions ecrivent dans les historiques correspondants.
2. Les montants dus et statuts se mettent a jour.
3. Les échéanciers sont visibles apres creation.

---

## 12) Page: /tenant/:tenantId/syndics/:syndicId/comptabilite

### Cette page permet de faire
1. Gerer le plan comptable.
2. Gerer les journaux comptables.
3. Saisir des ecritures.
4. Vérifier balance et grand livre.
5. Verrouiller une ecriture.

### Ce qu'on doit faire
1. Ouvrir la page comptabilite.
2. Cliquer `Nouveau compte`, creer un compte.
3. Cliquer `Nouveau journal`, creer un journal.
4. Cliquer `Nouvelle ecriture comptable`, ajouter des lignes debit/credit equilibrees, valider.
5. Vérifier la nouvelle ecriture dans le tableau.
6. Vérifier `Balance de verification` et `Grand livre`.
7. Cliquer `Verrouiller` sur une ecriture test.

### Résultat attendu
1. Comptes/journaux/ecritures se creent sans erreur.
2. L'ecriture equilibree est acceptee, l'ecriture desequilibree est refusee.
3. Le verrouillage empeche les modifications ulterieures.

---

## 13) Page: /tenant/:tenantId/syndics/:syndicId/budgets

### Cette page permet de faire
1. Créer des budgets syndic.
2. Recalculer les répartitions par lots.
3. Générer des appels de charges depuis un budget.
4. Gerer les batches d'appels.

### Ce qu'on doit faire
1. Ouvrir la page budgets.
2. Cliquer `Nouveau budget`, renseigner exercice/montants, valider.
3. Ouvrir le budget cree, lancer le recalcul des allocations.
4. Vérifier la section `Répartition des lots`.
5. Cliquer `Générer appels` depuis le budget.
6. Vérifier les lignes dans `Batches d'appels`.
7. Cliquer `Nouveau batch` et creer un batch manuel.

### Résultat attendu
1. Le budget est créé et visible dans la liste.
2. Les allocations sont calculees pour les lots.
3. Les batches et charges associees sont generes.

---

## 14) Page: /tenant/:tenantId/syndics/:syndicId/profils-incidents

### Cette page permet de faire
1. Gerer les profils propriétaires des lots.
2. Gerer les profils locataires des lots.
3. Declarer des incidents.
4. Ajouter des imputations d'incident.

### Ce qu'on doit faire
1. Ouvrir la page profils/incidents.
2. Cliquer `Nouveau profil propriétaire`, renseigner lot + contact + date, valider.
3. Cliquer `Nouveau profil locataire`, renseigner lot + contact + options de facturation, valider.
4. Cliquer `Nouvel incident`, renseigner lot + type + description + cout estime, valider.
5. Sur l'incident cree, cliquer `Ajouter imputation`, renseigner montant + cible, valider.

### Résultat attendu
1. Les 3 sections (`Profils propriétaires`, `Profils locataires`, `Incidents et imputations`) se mettent a jour.
2. Les imputations sont rattachees au bon incident.

---

## 15) Controles obligatoires de securite

### Ce qu'on doit faire
1. Tester avec 2 tenants differents (Tenant A et Tenant B).
2. Depuis Tenant A, tenter d'acceder aux routes/API syndic du Tenant B.
3. Tester un utilisateur sans droit syndic (ou module non active).

### Résultat attendu
1. Acces refuse (403/404) hors scope tenant.
2. Aucune fuite de donnees entre tenants.
3. Les menus syndic ne doivent pas etre accessibles si module inactif.

---

## 16) Vérifications formulaires (erreurs)

### Ce qu'on doit faire
1. Tester des saisies invalides:
- montant negatif
- date de fin avant date de début
- lot sans numero
- AG sans date
- ecriture comptable non equilibree
- document sans champ obligatoire
2. Valider chaque formulaire.

### Résultat attendu
1. Le formulaire bloque l'envoi.
2. Un message d'erreur clair est affiche.
3. Aucune donnee invalide n'est enregistree en base.

---

## 17) Ordre conseille des tests
1. Liste + creation copropriété
2. Fiche détail copropriété
3. Lots + compte propriétaire
4. Charges
5. Assemblées + détail AG
6. Prestataires
7. Documents
8. Finances
9. Recouvrement
10. Comptabilite
11. Budgets
12. Profils/Incidents
13. Securite multi-tenant

---

## 18) Validation finale (checklist)
1. [ ] Menus Syndic visibles et routes accessibles.
2. [ ] Toutes les pages du module Syndic s'ouvrent sans erreur.
3. [ ] CRUD Lots + import + assignation locataire OK.
4. [ ] Appels de charges: creation, filtres, affichage OK.
5. [ ] Assemblées: creation, ordre du jour, résolutions, votes, compte rendu OK.
6. [ ] Prestataires/contrats OK.
7. [ ] Documents syndic: ajout + filtrage OK.
8. [ ] Finances: indicateurs coherents.
9. [ ] Recouvrement: relances, pénalités, échéanciers OK.
10. [ ] Comptabilite: comptes/journaux/ecritures/balance/grand livre/verrouillage OK.
11. [ ] Budgets: creation, allocations, generation appels, batches OK.
12. [ ] Profils/Incidents: profils + incidents + imputations OK.
13. [ ] Controles erreurs formulaires OK.
14. [ ] Isolation multi-tenant OK.
15. [ ] Decision finale: GO / NO-GO.

---


## 19) Donnees de test synchronisees par interface (du début a la fin)

### 19.0 Variables de chainage (a conserver pendant tout le test)
1. `Contact locataire`: `b391be0f-76ea-4998-886b-f1d8451f7bd7`
2. `syndicId_TEST`: ID de la copropriété créée a l'interface 1.
3. `lotId_A101`: ID du lot `A-101` créé a l'interface 3.
4. `lotId_B12`: ID du lot `B-12` créé a l'interface 3.
5. `meetingId_AG2026`: ID de l'AG créée a l'interface 6.
6. `résolutionId_BUDGET2026`: ID de la résolution créée a l'interface 7.
7. `chargeCallId_A101_Q2`: ID de l'appel `A-101 / 2026-Q2` créé a l'interface 5.
8. `providerId_EXISTANT_1`: ID du prestataire choisi a l'interface 8.
9. `accountId_401100`: ID du compte comptable numero `401100` créé a l'interface 12.
10. `accountId_706100`: ID du compte comptable numero `706100` créé a l'interface 12.
11. `journalId_OD`: ID du journal `OD` créé a l'interface 12.
12. `entryId_TEST`: ID de l'ecriture comptable créée a l'interface 12.
13. `budgetId_2026`: ID du budget créé a l'interface 13.
14. `batchId_2026Q3`: ID du batch genere a l'interface 13.
15. `incidentId_EAU`: ID de l'incident créé a l'interface 14.

### 19.1 Interface 1 - /syndics (Création copropriété)
Formulaire `Créer une copropriété`:
1. `Nom`: `Domaine Azur Lagune`
2. `Adresse`: `Boulevard de Marseille, Zone 4, Abidjan`
3. `Référence cadastrale`: `CI-ABJ-COCODY-2026-00077`

Sortie a capturer:
1. `syndicId_TEST` depuis l'URL apres creation.

### 19.2 Interface 2 - /syndics/:syndicId (Fiche détail)
Vérification attendue:
1. `Nom`: `Domaine Azur Lagune`
2. `Adresse`: `Boulevard de Marseille, Zone 4, Abidjan`
3. `Référence cadastrale`: `CI-ABJ-COCODY-2026-00077`

Règle de chainage:
1. Toutes les navigations suivantes doivent conserver `syndicId_TEST`.

### 19.3 Interface 3 - /syndics/:syndicId/lots
Formulaire `Nouveau lot` - Lot A:
1. `Numéro de lot`: `A-101`
2. `Type de lot`: `APARTMENT`
3. `Tantièmes généraux`: `120`
4. `Tantièmes spéciaux`: `20`
5. `Bien lié`: selectionner `REF-A101 - Appartement A101` (ou equivalent)
6. `Propriétaire CRM`: contact CRM `Kone Aminata`
7. `Propriétaire depuis le`: `2024-01-15`

Formulaire `Nouveau lot` - Lot B:
1. `Numéro de lot`: `B-12`
2. `Type de lot`: `PARKING`
3. `Tantièmes généraux`: `30`
4. `Tantièmes spéciaux`: laisser vide
5. `Propriétaire CRM`: contact CRM `Yao Didier`
6. `Propriétaire depuis le`: `2024-01-15`

Formulaire `Importer des lots depuis des propriétés`:
1. `propertyIds`: selectionner `REF-C201`, `REF-C202` (ou 2 biens existants)

Formulaire `Ajouter un locataire - A-101`:
1. `Contact locataire`: contact CRM `Traore Salif`
2. `Date de début`: `2026-01-01`
3. `Date de fin`: laisser vide
4. `Référence bail`: `BAIL-A101-2026`
5. `Notes`: `Locataire principal lot A-101`

Sorties a capturer:
1. `lotId_A101`
2. `lotId_B12`

### 19.4 Interface 4 - /syndics/:syndicId/lots/:lotId/compte
Utiliser `lotId_A101`.

Formulaire `Ajouter ajustement` #1:
1. `Sens`: `DEBIT`
2. `Montant`: `15000`
3. `Libellé`: `Regularisation charges eau`
4. `Référence`: `ADJ-A101-2026-01`

Formulaire `Ajouter ajustement` #2 (optionnel):
1. `Sens`: `CREDIT`
2. `Montant`: `5000`
3. `Libellé`: `Avoir suite reclamation`
4. `Référence`: `AV-A101-2026-01`

### 19.5 Interface 5 - /charges
Date de reference pour ce workflow: `2026-03-12`.

Création appel 1 (mode `single`):
1. `Cible`: `single`
2. `Lot`: `lotId_A101`
3. `Période`: `2026-Q2`
4. `Montant`: `85000`
5. `Devise`: `XOF`
6. `Date d'échéance`: `2026-03-19`
7. `Charge récurrente`: `false`
8. Sortie: stocker `chargeCallId_A101_Q2`

Création appel 2 (mode `multiple`):
1. `Cible`: `multiple`
2. `Lots`: `lotId_A101`, `lotId_B12`
3. `Période`: `2026-Q3`
4. `Montant`: `60000`
5. `Devise`: `XOF`
6. `Date d'échéance`: `2026-04-11`
7. `Charge récurrente`: `true`
8. `Fréquence`: `MONTHLY`
9. `Occurrences`: `3`

Création appel 3 (mode `all`):
1. `Cible`: `all`
2. `Période`: `2026-EXC-01`
3. `Montant`: `25000`
4. `Devise`: `XOF`
5. `Date d'échéance`: `2026-04-26`
6. `Charge récurrente`: `false`

### 19.6 Interface 6 - /assemblées
Formulaire `Créer une assemblée générale`:
1. `type`: `ORDINARY`
2. `Date et heure`: `2026-07-20 09:00`
3. `Heure de début`: `09:30`
4. `Heure de fin`: `12:00`
5. `Lieu`: `Salle polyvalente - Domaine Azur Lagune`

Sortie a capturer:
1. `meetingId_AG2026`

### 19.7 Interface 7 - /assemblées/:meetingId
Utiliser `meetingId_AG2026`.

Formulaire inline (meta reunion):
1. `Heure de début`: `09:30`
2. `Heure de fin`: `12:15`
3. `Lieu`: `Salle polyvalente Batiment A`

Formulaire `Ajouter un point d'ordre du jour`:
1. `Titre`: `Validation du budget prévisionnel 2026`
2. `Ordre`: `1`
3. `Discussions`: `Présentation des charges communes\nDébat sur répartition tantièmes\nVote de clôture`

Formulaire `Ajouter une résolution`:
1. `Titre`: `Adoption du budget 2026`
2. `Description`: `Valider le budget annuel et autoriser les appels trimestriels.`
3. `Règle de majorité`: `article 24`

Votes:
1. `vote=FOR` pour `lotId_A101`
2. `vote=FOR` pour `lotId_B12`

Sortie a capturer:
1. `résolutionId_BUDGET2026`
2. Generation du compte rendu Word (document reutilisable en interface 9)

### 19.8 Interface 8 - /prestataires
Precondition:
1. Choisir un prestataire existant dans la liste et stocker son ID en `providerId_EXISTANT_1`.

Formulaire `Nouveau contrat de maintenance`:
1. `Prestataire`: `providerId_EXISTANT_1`
2. `Nature du contrat`: `Maintenance ascenseur`
3. `Date de début`: `2026-01-01`
4. `Date de fin`: `2026-12-31`
5. `Montant annuel`: `1800000`
6. `Devise`: `XOF`
7. `Alerte renouvellement (jours)`: `45`

### 19.9 Interface 9 - /documents
Formulaire `Ajouter un document` (PV AG lie a 19.7):
1. `Titre`: `PV AG Ordinaire 20-07-2026`
2. `type`: `GENERAL_MEETING_MINUTES`
3. `Fichier`: `pv-ag-2026.docx` (ou `pv-ag-2026.pdf`)
4. `Date d'expiration`: `2027-07-20`

Formulaire `Ajouter un document` (assurance liee au contrat):
1. `Titre`: `Attestation assurance immeuble 2026`
2. `type`: `INSURANCE`
3. `Fichier`: `assurance-immeuble-2026.pdf`
4. `Date d'expiration`: `2026-12-31`

### 19.10 Interface 10 - /finances
Vérifications liees:
1. `Total appele` inclut les appels crees en 19.5.
2. `Reste a payer` est coherent avec les paiements/ajustements saisis.
3. `Montant en retard` augmente uniquement pour des appels passes en `OVERDUE`.

### 19.11 Interface 11 - /recouvrement
Precondition de chainage:
1. Utiliser un appel en retard du dashboard.
2. Priorite: `chargeCallId_A101_Q2` si deja `OVERDUE`, sinon prendre `chargeCallId_OVERDUE` existant et le noter.

Formulaire `Créer une relance manuelle`:
1. `chargeCallId`: `chargeCallId_A101_Q2` ou `chargeCallId_OVERDUE`
2. `Niveau`: `1`
3. `Canal`: `EMAIL`

Formulaire `Appliquer une pénalité`:
1. `chargeCallId`: meme ID que relance
2. `Taux (%)`: `5`
3. `Jours de retard`: `15`

Formulaire `Créer un échéancier`:
1. `chargeCallId`: meme ID
2. `Montant total`: `85000`
3. `Date d'accord`: `2026-03-12`
4. `instalment #1`: `dueDate=2026-03-27`, `amount=42500`
5. `instalment #2`: `dueDate=2026-04-11`, `amount=42500`

Formulaire `Remise de pénalité`:
1. `Motif de remise`: `Accord amiable valide par le syndic - dossier A101`

### 19.12 Interface 12 - /comptabilite
Formulaire `Nouveau compte comptable` #1:
1. `Numéro compte`: `401100`
2. `Classe`: `4`
3. `Intitulé compte`: `Copropriétaires - appels de fonds`
4. `Type`: `ASSET`
5. Sortie: stocker `accountId_401100`

Formulaire `Nouveau compte comptable` #2:
1. `Numéro compte`: `706100`
2. `Classe`: `7`
3. `Intitulé compte`: `Produits appels de charges`
4. `Type`: `INCOME`
5. Sortie: stocker `accountId_706100`

Formulaire `Nouveau journal`:
1. `code`: `OD`
2. `Exercice`: `2026`
3. `Libellé`: `Operations diverses 2026`
4. `Type journal`: `GENERAL`
5. Sortie: stocker `journalId_OD`

Formulaire `Nouvelle ecriture comptable`:
1. `journalId`: `journalId_OD`
2. `Date écriture`: `2026-07-21T10:00`
3. `Référence`: `ECR-OD-2026-001`
4. `Source`: `MANUAL`
5. `Description`: `Constatation appel de charges A-101 Q2`
6. Ligne 1: `accountId=accountId_401100`, `debit=85000`, `credit=0`, `label=Creance copropriétaire A-101`
7. Ligne 2: `accountId=accountId_706100`, `debit=0`, `credit=85000`, `label=Produit appel charges Q2`
8. Sortie: stocker `entryId_TEST` puis cliquer `Verrouiller`

### 19.13 Interface 13 - /budgets
Formulaire `Nouveau budget`:
1. `Exercice`: `2026`
2. `Libellé`: `Budget prévisionnel 2026 - Azur Lagune`
3. `Montant total`: `2400000`
4. `category`: `Charges communes`
5. `Description`: `Entretien, securite, energie, nettoyage`
6. `Clé de distribution`: `GENERAL_SHARES`
7. `Devise`: `XOF`
8. Sortie: stocker `budgetId_2026`

Actions budget:
1. Cliquer `Approuver` sur `budgetId_2026`
2. Cliquer `Repartir` puis `Voir allocations`

Formulaire `Générer appels depuis budget`:
1. `Libellé`: `Batch Budget 2026-Q3`
2. `Période`: `2026-07`
3. `Date d'échéance`: `2026-08-10`
4. `batchType`: `REGULAR`
5. `Devise`: `XOF`
6. Sortie: stocker `batchId_2026Q3`

Formulaire `Nouveau batch`:
1. `Libellé`: `Travaux exceptionnels ascenseur`
2. `Période`: `2026-09`
3. `Date d'échéance`: `2026-09-30`
4. `Montant total`: `900000`
5. `batchType`: `EXCEPTIONAL`
6. `Devise`: `XOF`

### 19.14 Interface 14 - /profils-incidents
Formulaire `Nouveau profil propriétaire`:
1. `Lot`: `lotId_A101`
2. `contactId`: `Kone Aminata`
3. `Part de propriété (%)`: `100`
4. `ownedSince`: `2024-01-15`
5. `Activer accès portail`: `Oui`

Formulaire `Nouveau profil locataire`:
1. `Lot`: `lotId_A101`
2. `contactId`: `Traore Salif`
3. `Date d'entrée`: `2026-01-01`
4. `Charges facturées au locataire`: `Oui`

Formulaire `Nouvel incident`:
1. `Contact déclarant`: `Traore Salif`
2. `Lot`: `lotId_A101`
3. `Type incident`: `LEAK`
4. `Urgence`: `HIGH`
5. `Description`: `Fuite continue sous évier cuisine depuis 3 jours.`
6. Sortie: stocker `incidentId_EAU`

Formulaire `Imputation d'incident`:
1. `Type imputation`: `LOT_OWNER`
2. `Montant`: `65000`
3. `Devise`: `XOF`
4. `Lot`: `lotId_A101`
5. `Notes`: `Réparation plomberie imputee au lot A-101 selon expertise`

### 19.15 Controle final de liaison
1. `syndicId_TEST` est present dans toutes les routes du module.
2. `lotId_A101` est reutilise dans: compte lot, charges, AG/votes, recouvrement, profils/incidents.
3. `chargeCallId_A101_Q2` est reutilise dans: recouvrement et controles finances.
4. `meetingId_AG2026` est relie au document `PV AG Ordinaire 20-07-2026`.
5. `accountId_401100` et `accountId_706100` alimentent `entryId_TEST`.
6. `budgetId_2026` et `batchId_2026Q3` restent relies aux appels generes.
7. `incidentId_EAU` confirme la chaine incident -> imputation.

---

## 20) Vue rapide - Données de saisie par interface (copier/coller)

### Interface 1 - /syndics
Formulaire `Créer une copropriété`:
1. `Nom`: `Domaine Azur Lagune`
2. `Adresse`: `Boulevard de Marseille, Zone 4, Abidjan`
3. `Référence cadastrale`: `CI-ABJ-COCODY-2026-00077`

### Interface 2 - /syndics/:syndicId
Vérification:
1. `Nom`: `Domaine Azur Lagune`
2. `Adresse`: `Boulevard de Marseille, Zone 4, Abidjan`
3. `Référence cadastrale`: `CI-ABJ-COCODY-2026-00077`

### Interface 3 - /syndics/:syndicId/lots
Formulaire `Nouveau lot` (A-101):
1. `Numéro de lot`: `A-101`
2. `Type de lot`: `APARTMENT`
3. `Tantièmes généraux`: `120`
4. `Tantièmes spéciaux`: `20`
5. `Propriétaire CRM`: `Kone Aminata`
6. `Propriétaire depuis le`: `2024-01-15`

Formulaire `Nouveau lot` (B-12):
1. `Numéro de lot`: `B-12`
2. `Type de lot`: `PARKING`
3. `Tantièmes généraux`: `30`
4. `Tantièmes spéciaux`: vide
5. `Propriétaire CRM`: `Yao Didier`
6. `Propriétaire depuis le`: `2024-01-15`

Formulaire `Ajouter un locataire` (A-101):
1. `Contact locataire`: `Traore Salif`
2. `Date de début`: `2026-01-01`
3. `Date de fin`: vide
4. `Référence bail`: `BAIL-A101-2026`
5. `Notes`: `Locataire principal lot A-101`

### Interface 4 - /lots/:lotId/compte
Formulaire `Ajouter ajustement`:
1. `Direction`: `DEBIT`
2. `Montant`: `15000`
3. `Libellé`: `Regularisation charges eau`
4. `Référence`: `ADJ-A101-2026-01`

### Interface 5 - /charges
Formulaire `Créer un appel de charges`:
1. `Cible`: `single`, `Lot=lotId_A101`, `Période=2026-Q2`, `Montant=85000`, `Devise=XOF`, `Date d'échéance=2026-03-19`
2. `Cible`: `multiple`, `Lots=lotId_A101+lotId_B12`, `Période=2026-Q3`, `Montant=60000`, `Date d'échéance=2026-04-11`, `Charge récurrente=Oui`, `Fréquence=MONTHLY`, `Occurrences=3`
3. `Cible`: `all`, `Période=2026-EXC-01`, `Montant=25000`, `Date d'échéance=2026-04-26`

### Interface 6 - /assemblées
Formulaire `Créer une assemblée générale`:
1. `Type`: `ORDINARY`
2. `Date et heure`: `2026-07-20 09:00`
3. `Heure de début`: `09:30`
4. `Heure de fin`: `12:00`
5. `Lieu`: `Salle polyvalente - Domaine Azur Lagune`

### Interface 7 - /assemblées/:meetingId
Formulaire `Ajouter un point d'ordre du jour`:
1. `Titre du point`: `Validation du budget prévisionnel 2026`
2. `Ordre`: `1`
3. `Discussions`: `Présentation des charges communes` + `Débat sur répartition tantièmes` + `Vote de clôture`

Formulaire `Ajouter une résolution`:
1. `Titre`: `Adoption du budget 2026`
2. `Description`: `Valider le budget annuel et autoriser les appels trimestriels.`
3. `Règle de majorité`: `article 24`

Votes:
1. `lotId_A101`: `FOR`
2. `lotId_B12`: `FOR`

### Interface 8 - /prestataires
Formulaire `Nouveau contrat de maintenance`:
1. `Prestataire`: `providerId_EXISTANT_1`
2. `Nature du contrat`: `Maintenance ascenseur`
3. `Date de début`: `2026-01-01`
4. `Date de fin`: `2026-12-31`
5. `Montant annuel`: `1800000`
6. `Devise`: `XOF`
7. `Alerte renouvellement (jours)`: `45`

### Interface 9 - /documents
Formulaire `Ajouter un document`:
1. `Titre`: `PV AG Ordinaire 20-07-2026`
2. `Type`: `GENERAL_MEETING_MINUTES`
3. `Fichier`: `pv-ag-2026.docx` (ou PDF)
4. `Date d'expiration`: `2027-07-20`

Formulaire `Ajouter un document`:
1. `Titre`: `Attestation assurance immeuble 2026`
2. `Type`: `INSURANCE`
3. `Fichier`: `assurance-immeuble-2026.pdf`
4. `Date d'expiration`: `2026-12-31`

### Interface 10 - /finances
Controle:
1. `Total appele` inclut les appels de l'interface 5
2. `Reste a payer` coherent
3. `Montant en retard` coherent

### Interface 11 - /recouvrement
Formulaire `Créer une relance manuelle`:
1. `Appel de charges`: `chargeCallId_A101_Q2`
2. `Niveau`: `1`
3. `Canal`: `EMAIL`

Formulaire `Appliquer une pénalité`:
1. `Appel de charges`: `chargeCallId_A101_Q2`
2. `Taux`: `5`
3. `Jours de retard`: `15`

Formulaire `Créer un échéancier`:
1. `Appel de charges`: `chargeCallId_A101_Q2`
2. `Montant total`: `85000`
3. `Date d'accord`: `2026-03-12`
4. `Echeance #1`: `2026-03-27`, `42500`
5. `Echeance #2`: `2026-04-11`, `42500`

Formulaire `Remise de pénalité`:
1. `Motif de remise`: `Accord amiable valide par le syndic - dossier A101`

### Interface 12 - /comptabilite
Formulaire `Nouveau compte comptable`:
1. `Numéro compte`: `401100`
2. `Classe`: `4`
3. `Intitule compte`: `Copropriétaires - appels de fonds`
4. `Type`: `ASSET`

Formulaire `Nouveau compte comptable`:
1. `Numéro compte`: `706100`
2. `Classe`: `7`
3. `Intitule compte`: `Produits appels de charges`
4. `Type`: `INCOME`

Formulaire `Nouveau journal`:
1. `Code`: `OD`
2. `Exercice`: `2026`
3. `Libellé`: `Operations diverses 2026`
4. `Type journal`: `GENERAL`

Formulaire `Nouvelle ecriture comptable`:
1. `Journal`: `journalId_OD`
2. `Date ecriture`: `2026-07-21T10:00`
3. `Référence`: `ECR-OD-2026-001`
4. `Source`: `MANUAL`
5. `Description`: `Constatation appel de charges A-101 Q2`
6. Ligne 1: `accountId_401100`, `debit=85000`, `credit=0`, `label=Creance copropriétaire A-101`
7. Ligne 2: `accountId_706100`, `debit=0`, `credit=85000`, `label=Produit appel charges Q2`

### Interface 13 - /budgets
Formulaire `Nouveau budget`:
1. `Exercice`: `2026`
2. `Libellé`: `Budget prévisionnel 2026 - Azur Lagune`
3. `Montant total`: `2400000`
4. `Categorie principale`: `Charges communes`
5. `Description ligne`: `Entretien, securite, energie, nettoyage`
6. `Cle de distribution`: `GENERAL_SHARES`
7. `Devise`: `XOF`

Formulaire `Générer appels depuis budget`:
1. `Libellé batch`: `Batch Budget 2026-Q3`
2. `Période`: `2026-07`
3. `Date échéance`: `2026-08-10`
4. `Type batch`: `REGULAR`
5. `Devise`: `XOF`

Formulaire `Nouveau batch`:
1. `Libellé`: `Travaux exceptionnels ascenseur`
2. `Période`: `2026-09`
3. `Date échéance`: `2026-09-30`
4. `Montant total`: `900000`
5. `Type batch`: `EXCEPTIONAL`
6. `Devise`: `XOF`

### Interface 14 - /profils-incidents
Formulaire `Nouveau profil propriétaire`:
1. `Lot`: `lotId_A101`
2. `Contact propriétaire`: `Kone Aminata`
3. `Part de propriété (%)`: `100`
4. `Date de début`: `2024-01-15`
5. `Activer acces portail`: `Oui`

Formulaire `Nouveau profil locataire`:
1. `Lot`: `lotId_A101`
2. `Contact locataire`: `Traore Salif`
3. `Date d entrée`: `2026-01-01`
4. `Charges facturees au locataire`: `Oui`

Formulaire `Nouvel incident`:
1. `Contact declarant`: `Traore Salif`
2. `Lot`: `lotId_A101`
3. `Type incident`: `LEAK`
4. `Urgence`: `HIGH`
5. `Description`: `Fuite continue sous évier cuisine depuis 3 jours.`

Formulaire `Imputation d incident`:
1. `Type imputation`: `LOT_OWNER`
2. `Montant`: `65000`
3. `Devise`: `XOF`
4. `Lot`: `lotId_A101`
5. `Notes`: `Réparation plomberie imputee au lot A-101 selon expertise`




