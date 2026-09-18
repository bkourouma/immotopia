# Feature Specification: Gestion financiere operationnelle - Volet clients (lot 1)

**Feature Branch**: `[016-finance-operationnelle]`
**Created**: 2026-09-18
**Status**: Draft
**Input**: PRD "Gestion financiere operationnelle et suivi des chantiers" v0.1 (`docs/finance/PRD-gestion-financiere-chantiers.md`), Plan de mise en oeuvre du 18 septembre 2026 (`docs/finance/PLAN-mise-en-oeuvre.md`), decisions actees a son paragraphe 12.

## Perimetre de cette specification

Cette specification couvre exclusivement le **lot 1** du plan de mise en oeuvre : l'epopee E1 du PRD dans sa partie socle (compte de tiers typé, sans ecriture en partie double) et l'epopee E2 en entier (balance clients, releve de compte, campagne de facturation mensuelle, avances, balance agee). Elle ne cree, ne modifie et ne supprime aucune table existante : la migration est purement additive.

Les lots 2 a 5 (fournisseurs, chantier, budget, bailleurs, associations, salaires, tacherons, stock) sont hors perimetre de ce document ; ils sont resumes en une phrase chacun a la section "Suites prevues" et ne sont pas detailles ici.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Voir la balance clients en un ecran (Priority: P1)

Une gestionnaire veut voir, sans aucune saisie manuelle, une ligne par locataire avec le total facture, le total regle et le solde, pour repondre a la reserve "ce n'est pas chiffre" exprimee par la cliente.

**Why this priority**: C'est la demonstration meme du lot 1 (plan de mise en oeuvre, §5, "critere de sortie" : demonstration en visioconference sur les donnees existantes). Sans cet ecran, aucun autre recit de ce lot n'a de valeur montrable.

**Independent Test**: Sur la base de demonstration, apres le retro-remplissage des comptes de tiers depuis les echeances et paiements existants, ouvrir l'ecran de balance clients et verifier qu'une ligne existe par locataire actif, avec un total de controle en pied de tableau egal a la somme des soldes.

**Acceptance Scenarios**:

1. **Given** des locataires avec des echeances et des paiements deja enregistres dans le module locatif, **When** la gestionnaire ouvre la balance clients, **Then** elle voit une ligne par locataire avec le total facture, le total regle et le solde, sans avoir rien saisi pour produire cet ecran.
2. **Given** la balance clients affichee, **When** la gestionnaire filtre par periode ou par bien, **Then** seules les lignes concernees restent visibles et le total de controle se recalcule en consequence.
3. **Given** la balance clients affichee, **When** la gestionnaire clique sur une ligne, **Then** le releve de compte du locataire correspondant s'ouvre.
4. **Given** la balance clients affichee, **When** la gestionnaire demande l'export, **Then** un fichier est produit avec les memes lignes et le meme total que l'ecran.
5. **Given** un tenant simule avec 500 comptes de tiers et un exercice complet de mouvements, **When** la balance est calculee, **Then** le resultat est produit en moins de 3 secondes.

---

### User Story 2 - Consulter le releve de compte d'un locataire (Priority: P1)

Une gestionnaire veut ouvrir le releve chronologique d'un locataire donne, avec le solde apres chaque mouvement, pour repondre a une question du locataire ou justifier un solde sans recalcul manuel.

**Why this priority**: Le releve est la contrepartie indispensable de la balance : une balance sans releve ne permet pas d'expliquer un chiffre. Les deux sont demontres ensemble.

**Independent Test**: Ouvrir le releve d'un locataire ayant plusieurs echeances, paiements, et au moins une penalite ou une annulation ; verifier que chaque ligne porte un solde apres coherent avec la ligne precedente, que le releve est borne par des dates, et qu'il s'imprime.

**Acceptance Scenarios**:

1. **Given** un locataire avec un historique de mouvements, **When** la gestionnaire ouvre son releve, **Then** elle voit une ligne chronologique par piece (echeance, reglement, avance, penalite) avec le solde apres chaque ligne, un solde d'ouverture et un solde de cloture.
2. **Given** un releve ouvert, **When** la gestionnaire restreint la periode par des bornes de dates, **Then** seules les lignes de la periode s'affichent, avec un solde d'ouverture recalcule a la date de debut.
3. **Given** un releve ouvert, **When** la gestionnaire demande l'impression, **Then** un document PDF est produit avec les memes lignes, soldes et bornes que l'ecran.
4. **Given** un releve d'un locataire d'un autre tenant, **When** une gestionnaire du tenant courant tente d'y acceder, **Then** l'acces est refuse.

---

### User Story 3 - Lancer la facturation du mois pour tous les baux actifs (Priority: P1)

Une gestionnaire veut generer, en une seule operation, l'echeance du mois pour tous les baux actifs, avec un compte rendu des baux traites et exclus, pour ne plus generer les echeances bail par bail.

**Why this priority**: C'est le geste operationnel mensuel le plus repetitif que le lot doit soulager ; c'est aussi la demonstration la plus parlante en visioconference (recit B3 du PRD, priorite M).

**Independent Test**: Sur un jeu de baux actifs, suspendus et termines, lancer une campagne pour une periode donnee ; verifier qu'une echeance est creee pour chaque bail actif eligible, qu'un compte rendu liste les baux exclus avec un motif, puis relancer la meme campagne et verifier qu'aucune echeance n'est dupliquee.

**Acceptance Scenarios**:

1. **Given** des baux actifs sans echeance sur la periode visee, **When** la gestionnaire lance la campagne "Loyer de septembre 2026", **Then** une echeance est creee pour chaque bail actif eligible et le compte rendu liste les baux factures.
2. **Given** un bail suspendu, un bail dont la periode est hors de la duree du bail, et un bail portant deja une echeance sur la periode, **When** la campagne est executee, **Then** ces trois baux apparaissent dans la liste des exclus du compte rendu, chacun avec son motif.
3. **Given** une campagne deja executee pour une periode, **When** la gestionnaire la relance pour la meme periode, **Then** aucune echeance supplementaire n'est creee et le compte rendu obtenu est equivalent au premier.
4. **Given** un locataire dont le compte est crediteur (avance, voir Recit 4), **When** la campagne genere sa nouvelle echeance, **Then** l'avance disponible est imputee sur cette echeance avant la cloture de la campagne, en commencant par l'avance la plus ancienne.
5. **Given** une campagne terminee, **When** la gestionnaire consulte l'historique des campagnes, **Then** elle retrouve cette campagne avec son libelle de periode, son statut et son horodatage.

---

### User Story 4 - Encaisser un reglement sans echeance en face (Priority: P1)

Une gestionnaire veut enregistrer un reglement d'un locataire meme quand aucune echeance ne lui correspond encore, et voir ce montant s'imputer automatiquement sur la prochaine echeance generee, pour ne pas refuser un paiement recu en avance.

**Why this priority**: Recit B4 du PRD, priorite M : c'est la situation concrete la plus citee par la cliente ("le locataire paie avant qu'on ait facture"). Sans elle, la balance resterait fausse pour ces locataires.

**Independent Test**: Enregistrer un paiement pour un locataire sans echeance ouverte a due concurrence du reglement ; verifier que le compte du locataire devient crediteur du montant recu, que le releve montre ce mouvement, puis lancer la campagne suivante et verifier que l'avance est imputee sur la nouvelle echeance et disparait du solde crediteur.

**Acceptance Scenarios**:

1. **Given** un locataire sans echeance ouverte, **When** un reglement est encaisse pour lui, **Then** le compte de tiers du locataire devient crediteur du montant recu.
2. **Given** un compte de tiers locataire crediteur, **When** la gestionnaire consulte le releve, **Then** le mouvement d'origine de ce solde crediteur est visible et daté.
3. **Given** un compte de tiers locataire crediteur et une nouvelle echeance generee par une campagne, **When** la campagne s'execute, **Then** le solde crediteur disponible est impute sur cette echeance jusqu'a due concurrence, et le releve montre distinctement l'echeance et son imputation.
4. **Given** plusieurs reglements non alloues sur des dates differentes pour le meme locataire, **When** une campagne impute une avance, **Then** le reglement le plus ancien est consomme en premier.

---

### User Story 5 - Voir la balance agee (Priority: P2)

Une gestionnaire veut voir la balance clients ventilee par anciennete d'echeance (a echoir, moins de 30 jours, 30 a 60, 60 a 90, plus de 90 jours), pour prioriser les relances.

**Why this priority**: Recit P18 du PRD, priorite S : utile a la decision mais pas indispensable a la premiere demonstration, qui peut se faire avec la seule balance simple.

**Independent Test**: Sur un jeu d'echeances aux dates d'echeance etalees, ouvrir la balance agee et verifier que chaque montant en retard tombe dans la bonne tranche, et que le tri par colonne fonctionne.

**Acceptance Scenarios**:

1. **Given** des echeances impayees a differentes dates d'echeance, **When** la gestionnaire ouvre la balance agee, **Then** chaque solde est ventile dans la tranche correspondant a son anciennete au jour de la consultation.
2. **Given** la balance agee affichee, **When** la gestionnaire trie par une colonne de tranche, **Then** les lignes se reordonnent selon le montant de cette tranche.
3. **Given** une echeance dont la date d'echeance n'est pas encore atteinte, **When** la balance agee est calculee, **Then** son solde apparait dans la tranche "a echoir", jamais dans une tranche de retard.

---

### User Story 6 - Consulter mon solde depuis le portail locataire (Priority: P3)

Un locataire veut voir son solde et son releve depuis son portail, plutot que de devoir demander a l'agence.

**Why this priority**: Recit du PRD (§4, persona "le locataire" ; §7 E2, priorite S) : valeur reelle mais degradable sans compromettre la demonstration du coeur du lot, qui s'adresse d'abord a la gestionnaire.

**Independent Test**: Se connecter au portail d'un locataire ayant un historique de mouvements et verifier qu'il voit exactement son propre releve, en lecture seule, et qu'il ne peut atteindre le compte d'aucun autre locataire.

**Acceptance Scenarios**:

1. **Given** un locataire connecte a son portail, **When** il ouvre l'onglet solde, **Then** il voit le meme releve que celui que verrait la gestionnaire pour son compte, en lecture seule.
2. **Given** un locataire connecte, **When** il tente d'acceder a l'identifiant de compte d'un autre locataire, **Then** l'acces est refuse quel que soit le moyen utilise (URL, requete directe).

---

### Edge Cases

- Un bail actif dont le loyer est a zero ou non renseigne : exclu de la campagne, motif explicite dans le compte rendu.
- Une periode de campagne anterieure a la date de debut du bail, ou posterieure a sa date de fin : bail exclu avec motif.
- Un paiement dont le montant depasse largement le total du reste a devoir du locataire : le surplus reste credite au compte, disponible pour la prochaine echeance.
- Une annulation d'echeance ou de paiement deja repercutee sur le compte de tiers : le mouvement inverse doit apparaitre sur le releve, jamais une correction silencieuse du solde.
- Deux campagnes lancees sur la meme periode a quelques secondes d'intervalle (double clic) : la contrainte d'unicite de la campagne et celle des echeances empechent la duplication.
- Un tenant B ne doit jamais voir un compte, un mouvement ou une campagne du tenant A, y compris par un identifiant devine.
- Un compte de tiers locataire sans aucun mouvement (bail tout juste cree, pas encore facture) : il apparait dans la balance avec un solde de zero, pas absent de la liste.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Le systeme MUST maintenir un compte de tiers typé (`ThirdPartyAccount`) par locataire (`TenantClient`), alimente uniquement par des pieces existantes (echeance, paiement, penalite, annulation), sans saisie d'ecriture libre.
- **FR-002**: Le systeme MUST enregistrer, pour chaque mouvement du compte de tiers, le solde obtenu immediatement apres ce mouvement (`balanceAfter`), de sorte que le solde a toute date se lise sans agregation.
- **FR-003**: Le systeme MUST reconstruire integralement un compte de tiers a partir des pieces qui le concernent (idempotent, rejouable), pour le retro-remplissage initial et pour la reprise en cas de divergence.
- **FR-004**: Le systeme MUST afficher une balance clients : une ligne par locataire avec le total facture, le total regle et le solde de la periode, filtrable par periode et par bien, avec un total de controle et un export.
- **FR-005**: Le systeme MUST afficher une balance agee : la meme balance ventilee en tranches d'anciennete (a echoir, moins de 30 jours, 30-60, 60-90, plus de 90 jours), triable par colonne.
- **FR-006**: Le systeme MUST afficher un releve de compte chronologique et borne par dates pour un compte de tiers, avec solde d'ouverture, solde de cloture, et un export imprimable (PDF).
- **FR-007**: Le systeme MUST permettre de lancer une campagne de facturation mensuelle qui genere une echeance pour chaque bail actif eligible sur une periode donnee, en une seule operation.
- **FR-008**: Une campagne de facturation MUST etre idempotente : la relancer sur une periode deja traitee ne cree aucune echeance supplementaire et produit un compte rendu equivalent.
- **FR-009**: Une campagne de facturation MUST produire un compte rendu listant les baux factures et les baux exclus, chacun avec un motif explicite (bail suspendu, periode hors bail, echeance deja existante, loyer non renseigne).
- **FR-010**: Le systeme MUST permettre l'encaissement d'un reglement pour un locataire sans qu'aucune echeance ne lui corresponde, et rendre son compte de tiers crediteur du montant recu.
- **FR-011**: La campagne de facturation MUST imputer automatiquement, avant sa cloture, le solde crediteur disponible d'un locataire sur la nouvelle echeance qu'elle genere pour lui, en consommant le reglement non alloue le plus ancien en premier, et cette imputation MUST rester visible comme un mouvement distinct sur le releve.
- **FR-012**: Le systeme MUST exposer, sur le portail locataire, le solde et le releve du locataire connecte, en lecture seule, strictement borne a son propre compte.
- **FR-013**: Le systeme MUST isoler toute donnee financiere par `tenantId` ; aucune requete de ce lot ne peut lire ou modifier un compte, un mouvement ou une campagne d'un autre tenant.
- **FR-014**: Aucun ecran ni aucun libelle de ce lot MUST exposer les mots "debit" ou "credit" a l'utilisatrice ; le vocabulaire visible est "facturer" et "regler" (montants, soldes, mouvements).
- **FR-015**: Le systeme MUST conserver telles quelles les tables et fonctions locatives existantes (`RentalInstallment`, `RentalPayment`, `RentalPaymentAllocation`) ; ce lot les complete par une nouvelle couche de lecture, sans les modifier.
- **FR-016**: La suite de tests locative existante (generation d'echeances, allocation de paiements, integration) MUST rester verte apres l'introduction de ce lot.
- **FR-017**: Le calcul de la balance clients sur un exercice complet MUST rester sous 3 secondes pour un tenant simule de 500 comptes de tiers.

### Key Entities _(include if feature involves data)_

- **ThirdPartyAccount**: Compte de tiers typé (locataire pour ce lot), portant un solde courant et une devise, rattache a un `TenantClient` et a un `tenantId`. Detail complet dans `data-model.md`.
- **ThirdPartyMovement**: Mouvement d'un compte de tiers, ne d'une piece locative (echeance, paiement, avance appliquee, penalite, annulation), portant le solde apres mouvement. Detail complet dans `data-model.md`.
- **RentBillingRun**: Campagne de facturation mensuelle, portant la periode, le statut, le compte rendu (baux factures, exclus avec motif, avances appliquees). Detail complet dans `data-model.md`.
- **RentalInstallment / RentalPayment / RentalPaymentAllocation / TenantClient** (existants, non modifies): sources des pieces qui alimentent le compte de tiers locataire ; voir `research.md` pour le detail de leur comportement verifie dans le code.

## Assumptions & Dependencies

- Le retro-remplissage initial (§5.4 du plan) couvre uniquement les echeances, paiements et penalites deja en base ; aucune reprise de solde d'ouverture manuel n'est traitee dans ce lot (D10 du plan : la piece "solde initial" arrive au lot 2).
- Les volumes retenus pour le calibrage sont ceux actes le 18 septembre 2026 : 50 a 200 baux, 50 fournisseurs (hors perimetre de ce lot), 10 chantiers (hors perimetre de ce lot) ; le test de charge de ce lot porte sur 500 comptes de tiers simules, chiffre explicitement retenu par le plan comme cible de performance et non comme un volume reel observe.
- Ce lot ne cree aucune ecriture de journal comptable (decision D2 du plan) : le compte de tiers seul porte la preuve du solde. Les ecritures en partie double arrivent au lot 2 avec les fournisseurs.
- L'export tableur de la cliente, prevu a la tache 0.6 du lot 0 pour calibrer les colonnes de la balance, n'a pas ete fourni au moment de la redaction de cette specification ; les colonnes proposees (locataire, bien, facture, regle, solde) reprennent celles du PRD et du plan, a confirmer ou ajuster des reception de cet export.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% des locataires actifs de la base de demonstration apparaissent dans la balance clients apres retro-remplissage, sans aucune saisie manuelle.
- **SC-002**: La campagne "Loyer de septembre 2026" lancee deux fois produit le meme nombre d'echeances et un compte rendu equivalent aux deux executions.
- **SC-003**: Un reglement sans echeance en face rend le compte crediteur, et la campagne suivante consomme integralement ce solde des lors que la nouvelle echeance est du meme montant ou superieure.
- **SC-004**: La balance clients sur un exercice complet se calcule en moins de 3 secondes pour un tenant simule de 500 comptes de tiers.
- **SC-005**: Aucun des quatre ecrans du lot (balance clients, balance agee, releve, campagne) n'affiche les mots "debit" ou "credit", verifie par un test dedie.
- **SC-006**: La suite de tests locative existante reste verte (0 regression) apres l'introduction de ce lot.
- **SC-007**: La reserve "ce n'est pas chiffre" est levee par la cliente lors de la demonstration en visioconference du lot 1 (critere qualitatif, repris du PRD §12).

## Suites prevues

Les lots suivants, hors perimetre de ce document, sont resumes ici pour memoire seulement :

- **Lot 2** : moteur comptable generalise (ecritures en partie double), fournisseurs, factures, reglements, caisse, chantier (`ConstructionSite`), imputation et cout reel derive.
- **Lot 3** : budget de chantier, avenants, bons de commande, engage, alerte de depassement, avancement physique, tableau de bord des chantiers.
- **Lot 4** : bailleurs de terrains, associations et ventilation des loyers, salaires, tacherons, retenue de garantie, cloture et bascule au patrimoine.
- **Lot 5** : stock de materiaux, conditionne a la confirmation du besoin par la cliente.
