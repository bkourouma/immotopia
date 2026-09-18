# Feature Specification: Gestion financiere operationnelle - Fournisseurs et chantiers (lot 2)

**Feature Branch**: `[017-finance-fournisseurs-chantiers]`
**Created**: 2026-09-18
**Status**: Draft
**Input**: PRD "Gestion financiere operationnelle et suivi des chantiers" v0.1 (`docs/finance/PRD-gestion-financiere-chantiers.md`), Plan de mise en oeuvre du 18 septembre 2026 (`docs/finance/PLAN-mise-en-oeuvre.md`, §6 et §6.1 bis), `docs/finance/LOT-1-RAPPORT.md`, decisions actees au §12 du plan.

## Perimetre de cette specification

Cette specification couvre exclusivement le **lot 2** du plan de mise en oeuvre : l'epopee E1 du PRD dans sa partie qui restait ouverte apres le lot 1 (moteur comptable generalise, ecritures en partie double), l'epopee E3 en entier (fournisseurs, factures recues, reglements, balance et releve fournisseurs) et l'epopee E4 en entier (chantier comme objet financier, postes de depense, imputation, pieces de caisse, cout reel derive). Elle inclut aussi la file de validation prevue par la decision D7 du plan (saisie et validation separees), condition d'existence des pieces fournisseurs des ce lot.

Le lot 2 est un prealable technique invisible (la generalisation comptable, epopee E1) suivi de deux volets visibles (fournisseurs, chantiers) qui partagent le meme moteur. Les trois sont traites dans un seul document parce que le plan les livre "d'un bloc" (§6, decision actee) : separer leur specification aurait masque leur dependance reelle - aucune facture fournisseur ne peut s'ecrire tant que le plan de comptes n'est pas porte par `tenantId`.

Les lots 3 a 5 (budget et engagements, bailleurs et associations, salaires et tacherons, stock) sont hors perimetre de ce document ; ils sont resumes en quelques lignes chacun a la section "Suites prevues".

## Decision actee : la caisse

Le PRD laissait sa question 7 (§14) sans reponse : _"La caisse : une ou plusieurs ? Qui valide ?"_. Cette question conditionne directement le besoin B8 (piece de caisse), qui est dans le perimetre de ce lot (User Story 10 ci-dessous). **Elle a ete tranchee par le porteur du projet le 18 septembre 2026**, confirmant mot pour mot l'hypothese que la premiere version de cette specification posait a titre revisable.

**Decision** : une seule caisse par tenant, alimentee par un solde qui n'est pas modelise dans ce lot (aucun rapprochement de tresorerie, conformement au non-objectif du PRD §3.2). La gestionnaire emet la piece de caisse ; le dirigeant la valide. Le validateur d'une piece de caisse est la personne qui porte la permission `finance.documents.validate` - la meme qui valide toute autre piece financiere de ce lot - sans caisse ni role de "caissier" distinct.

**Risque residuel, et non plus une incertitude ouverte** : cette specification ne cree toujours aucune table `CashRegister` ni aucun champ `CashVoucher.cashRegisterId`. Si l'organisation de la cliente venait a evoluer vers plusieurs caisses (par exemple une par chantier, ou une par zone), la migration a prevoir serait : ajouter `CashRegister` (id, tenantId, label) et `cashRegisterId` sur `CashVoucher`, retro-remplir avec une caisse unique par defaut pour les pieces deja emises, puis rendre le champ obligatoire - une migration de meme forme que celle de `data-model.md` §1, mais sans son risque d'unicite (aucune contrainte n'existerait encore sur une colonne qui n'existe pas encore). Voir `research.md` §4.1 pour le detail.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Generaliser le moteur comptable sans casser la copropriete (Priority: P1)

En tant que systeme, je porte le plan de comptes et les journaux par `tenantId` plutot que par la seule copropriete, pour que le meme moteur serve les operations courantes de l'entreprise et sa copropriete geree, sans que l'un ne puisse jamais corrompre l'autre.

**Why this priority**: Prealable technique absolu. Aucune facture fournisseur, aucun reglement, aucune imputation de chantier ne peut s'ecrire tant que `ChartOfAccount` et `AccountingJournal` n'acceptent pas une ecriture sans `syndicateId`. C'est aussi le risque le plus eleve du lot (PRD §13) : une migration ratee casse une fonctionnalite deja livree et demontree en visioconference.

**Independent Test**: Executer la migration sur une copie de la base de demonstration contenant au moins deux copropretes et verifier : la suite de tests de caracterisation (lot 0, 54 cas) reste verte sauf pour les cinq cas `SURPRISE` corriges intentionnellement ; un plan de comptes et un journal peuvent etre crees sans `syndicateId` ; deux plans de comptes, l'un de copropriete et l'un operationnel, coexistent dans le meme tenant sans collision d'unicite.

**Acceptance Scenarios**:

1. **Given** la base de demonstration avec des copropretes existantes portant des plans de comptes et des journaux, **When** la migration `generalize_accounting_scope` est appliquee, **Then** chaque `ChartOfAccount` et chaque `AccountingJournal` existant porte desormais un `tenantId` non nul, egal au `tenantId` de sa copropriete, et son `syndicateId` reste inchange.
2. **Given** la migration appliquee, **When** le systeme cree un plan de comptes operationnel pour un tenant sans le rattacher a une copropriete, **Then** l'enregistrement est accepte avec `syndicateId` nul et `scope = OPERATIONS`.
3. **Given** deux copropretes du meme tenant portant chacune un compte numerote "512", et un plan de comptes operationnel de ce tenant portant aussi un compte "512", **When** les trois sont crees, **Then** aucune violation d'unicite ne se produit : l'unicite reste `(syndicateId, accountNumber)` pour les comptes de copropriete et devient `(tenantId, accountNumber)` restreinte a `syndicateId IS NULL` pour les comptes operationnels.
4. **Given** la migration deja appliquee une premiere fois, **When** elle est rejouee (reprise apres interruption, ou environnement recree depuis les migrations), **Then** elle ne produit aucune erreur et aucun doublon : le retro-remplissage de `tenantId` et la creation des index partiels sont idempotents.
5. **Given** les 54 tests de caracterisation du lot 0, **When** ils s'executent apres la migration et apres la correction des cinq defauts du §6.1 bis du plan, **Then** les tests non lies a un defaut corrige restent verts sans modification, et chaque test dont l'intitule commence par `SURPRISE :` et qui concerne un defaut corrige est mis a jour pour decrire le nouveau comportement voulu, avec une note explicite renvoyant a cette specification.
6. **Given** une ecriture nee d'une piece validee (facture fournisseur, reglement, piece de caisse), **When** la piece est validee, **Then** l'ecriture est verrouillee automatiquement dans la meme transaction, sans appel separe.

---

### User Story 2 - Creer un fournisseur et son compte de tiers (Priority: P1)

Une gestionnaire veut enregistrer un fournisseur - raison sociale, contact, nature (materiaux ou prestation) - pour pouvoir ensuite lui adresser des factures et des reglements.

**Why this priority**: Sans fournisseur, aucune facture ne peut exister. C'est le premier geste du volet E3.

**Independent Test**: Creer un fournisseur de nature "materiaux" et verifier qu'un compte de tiers `SUPPLIER` est cree automatiquement pour lui, avec un solde de zero, visible dans la balance fournisseurs des sa creation.

**Acceptance Scenarios**:

1. **Given** une gestionnaire renseignant raison sociale, contact et nature d'un fournisseur, **When** elle valide la creation, **Then** le fournisseur est enregistre et un `ThirdPartyAccount` de type `SUPPLIER` lui est associe, avec un solde initial de zero.
2. **Given** un fournisseur cree pour designer un prestataire de maintenance deja present dans `MaintenanceVendor`, **When** la gestionnaire le rattache via un lien optionnel, **Then** le fournisseur et le prestataire de maintenance coexistent, chacun dans son propre ecran, sans fusion de donnees (decision Q12 du plan : coexistence).
3. **Given** un fournisseur inactif, **When** la gestionnaire tente de lui creer une nouvelle facture, **Then** l'operation est refusee avec un message explicite.

---

### User Story 3 - Saisir une facture fournisseur et l'imputer a un chantier (Priority: P1)

Une gestionnaire veut enregistrer une facture recue d'un fournisseur, avec ses lignes, et l'imputer a un chantier et a un ou plusieurs postes de depense, pour que le cout du chantier se mette a jour sans ressaisie.

**Why this priority**: C'est le geste central du lot : c'est lui qui fait exister "l'argent qui sort" (PRD §2.2) et qui alimente le cout reel du chantier (US8).

**Independent Test**: Saisir une facture d'un fournisseur de materiaux rattachee a un chantier ; verifier que la validation cree en une seule transaction l'ecriture equilibree, le mouvement du compte fournisseur et l'imputation au chantier, et que l'echec simule de l'une de ces trois ecritures n'en laisse aucune trace.

**Acceptance Scenarios**:

1. **Given** un fournisseur de nature "materiaux", **When** la gestionnaire saisit une facture sans rattachement a un chantier, **Then** la saisie est refusee : le rattachement a un chantier est obligatoire pour ce type de fournisseur (recit B6/B7 du PRD).
2. **Given** un fournisseur de nature "prestation", **When** la gestionnaire saisit une facture sans chantier, **Then** la saisie est acceptee : le rattachement a un chantier reste optionnel pour ce type.
3. **Given** une facture brouillon avec ses lignes et son imputation (totale ou ventilee sur plusieurs postes), **When** la gestionnaire la valide, **Then** la facture passe au statut valide, une ecriture equilibree est creee et verrouillee, le compte du fournisseur est debite du montant de la facture (il nous doit plus), et une ou plusieurs `CostAllocation` sont creees dont la somme egale exactement le montant de la facture.
4. **Given** une imputation ventilee dont la somme ne correspond pas au montant de la facture, **When** la gestionnaire tente de valider, **Then** la validation est refusee avant toute ecriture.
5. **Given** une facture deja validee, **When** quiconque tente de la modifier ou de la supprimer, **Then** l'operation est refusee (HTTP 409) : la correction passe par une facture d'annulation liee (`VoidDocument`), jamais par une modification.
6. **Given** une transaction de validation dans laquelle l'ecriture de l'imputation echoue apres que le mouvement du compte fournisseur a ete ecrit, **When** l'operation est rejouee, **Then** aucune trace partielle ne subsiste : ni ecriture, ni mouvement de compte, ni imputation.

---

### User Story 4 - Regler une facture fournisseur, total ou partiel (Priority: P1)

Une gestionnaire veut enregistrer un reglement a un fournisseur, qui peut couvrir une ou plusieurs factures, et voir le solde du compte fournisseur diminuer d'autant.

**Why this priority**: Symetrique de la facture : sans reglement, le solde fournisseur ne bouge jamais et la balance reste fausse.

**Independent Test**: Regler partiellement une facture, verifier que le solde fournisseur diminue du montant regle et que la facture reste identifiee comme partiellement reglee ; regler ensuite le solde, verifier que le compte s'equilibre.

**Acceptance Scenarios**:

1. **Given** une facture fournisseur validee de 500 000 FCFA, **When** la gestionnaire enregistre un reglement de 500 000 FCFA affecte a cette facture, **Then** le compte du fournisseur est credite de ce montant et l'ecart entre facture et reglements affectes tombe a zero pour cette facture.
2. **Given** deux factures d'un meme fournisseur, **When** la gestionnaire enregistre un reglement unique dont le montant couvre les deux, **Then** l'allocation se repartit sur les deux factures selon le choix de la gestionnaire, et le releve montre un mouvement par facture soldee.
3. **Given** un reglement dont le montant depasse le total du a un fournisseur (acompte sans facture en face), **When** il est enregistre, **Then** le compte fournisseur devient debiteur du surplus (l'entreprise a paye d'avance), visible sur son releve.
4. **Given** un reglement deja valide, **When** quiconque tente de le modifier, **Then** l'operation est refusee ; la correction passe par une piece d'annulation.

---

### User Story 5 - Voir la balance fournisseurs (Priority: P1)

Une gestionnaire veut voir, en un ecran, une ligne par fournisseur avec ce que l'entreprise lui doit, filtrable par periode et par chantier.

**Why this priority**: Miroir exact de la balance clients du lot 1 (recit B5 du PRD) ; c'est la deuxieme moitie de la reserve "ce n'est pas chiffre".

**Independent Test**: Sur un jeu de fournisseurs avec factures et reglements varies, ouvrir la balance fournisseurs et verifier une ligne par fournisseur actif avec un total de controle en pied de tableau, puis filtrer par chantier et verifier que seuls les fournisseurs ayant une imputation sur ce chantier restent visibles.

**Acceptance Scenarios**:

1. **Given** des fournisseurs avec factures et reglements enregistres, **When** la gestionnaire ouvre la balance fournisseurs, **Then** elle voit une ligne par fournisseur actif avec le total facture, le total regle et le solde, sans saisie additionnelle.
2. **Given** la balance affichee, **When** elle filtre par chantier, **Then** seuls les fournisseurs ayant au moins une imputation validee sur ce chantier apparaissent, avec les montants restreints a ce chantier.
3. **Given** la balance affichee, **When** elle clique sur une ligne, **Then** le releve du fournisseur correspondant s'ouvre (User Story 6).

---

### User Story 6 - Ouvrir le releve d'un fournisseur (Priority: P2)

Une gestionnaire veut consulter la chronologie des factures et reglements d'un fournisseur, avec le solde apres chaque mouvement.

**Why this priority**: Necessaire pour justifier un solde de la balance fournisseurs, mais degradable au regard de la demonstration centrale du lot (les factures et l'imputation aux chantiers).

**Independent Test**: Ouvrir le releve d'un fournisseur ayant plusieurs factures et reglements, verifier la coherence chronologique des soldes et l'export imprimable.

**Acceptance Scenarios**:

1. **Given** un fournisseur avec un historique de factures et reglements, **When** la gestionnaire ouvre son releve, **Then** elle voit une ligne chronologique par piece avec le solde apres chaque ligne, un solde d'ouverture et un solde de cloture calcules depuis le dernier mouvement anterieur a la borne (jamais depuis le solde courant, correction du defaut §6.1 bis).
2. **Given** un releve borne par dates sans aucun mouvement dans la periode, **When** il est consulte, **Then** le solde d'ouverture et le solde de cloture affiches sont egaux et corrects a la date, distincts du solde actuel du compte si celui-ci a bouge depuis.

---

### User Story 7 - Creer un chantier sans bien preexistant (Priority: P1)

Une gestionnaire veut creer un chantier - nom, zone, terrain propre ou loue, dates, responsable - sans qu'un bien existe deja au patrimoine, pour suivre une construction des son lancement.

**Why this priority**: Sans chantier, aucune imputation ne peut exister. C'est l'entree du volet E4 et la traduction directe de la decision D5 du plan : le chantier est une table neuve, pas un renommage de `WorkProgram`.

**Independent Test**: Creer un chantier sans `propertyId`, verifier qu'il apparait dans la liste des chantiers avec un cout reel de zero, puis verifier qu'un chantier existant et un programme de travaux du Patrimoine (User Story 12) restent deux objets visuellement et fonctionnellement distincts pour la meme gestionnaire.

**Acceptance Scenarios**:

1. **Given** une gestionnaire renseignant nom, zone, dates et responsable d'un chantier, sans bien rattache, **When** elle valide la creation, **Then** le chantier est cree avec `propertyId` nul, un statut initial, et un cout reel de zero (aucune imputation encore).
2. **Given** un chantier sur un terrain loue, **When** la gestionnaire le rattache a un bail de terrain, **Then** le lien est enregistre (`landLeaseId`), sans que ce lot ne cree l'objet bail de terrain lui-meme (E7, lot 4) : le champ reste disponible mais non alimente avant le lot 4.
3. **Given** un chantier et un programme de travaux (`WorkProgram`) existants et non lies l'un a l'autre, **When** une gestionnaire consulte les deux ecrans, **Then** les libelles distinguent explicitement "Chantier" (sous Finance) de "Programme de travaux" (sous Patrimoine), et aucun champ de saisie de cout n'apparait identique entre les deux au point de preter a confusion (voir "Distinction ConstructionSite / WorkProgram" ci-dessous).

---

### User Story 8 - Voir le cout reel d'un chantier, derive des imputations (Priority: P1)

En tant que dirigeant, je consulte le cout reel d'un chantier et sais qu'il est entierement calcule a partir des imputations validees, jamais saisi a la main.

**Why this priority**: C'est l'objectif O2 du PRD, la metrique de succes "cout reel de chantier saisi a la main : 0". Sans cette derivation automatique, le chantier ne serait qu'un dossier de plus, pas un objet financier.

**Independent Test**: Imputer plusieurs pieces (facture, piece de caisse) a un chantier, verifier que son cout reel affiche est exactement leur somme, et verifier qu'aucune route de l'API ne permet d'ecrire une valeur dans ce champ.

**Acceptance Scenarios**:

1. **Given** un chantier avec trois imputations validees de montants distincts, **When** le cout reel est consulte, **Then** il est egal a la somme exacte des trois imputations.
2. **Given** une facture d'annulation liee a une des imputations, **When** elle est validee, **Then** le cout reel du chantier diminue du montant annule.
3. **Given** n'importe quel appel a l'API de creation ou de mise a jour d'un chantier, **When** il porte un champ `actualCost` ou equivalent, **Then** ce champ est ignore ou rejete : aucune route n'accepte d'ecrire le cout reel.

---

### User Story 9 - Consulter le detail d'un chantier (Priority: P2)

Un dirigeant veut voir toutes les imputations d'un chantier, par date, par nature de piece et par poste de depense, avec un sous-total par poste.

**Why this priority**: Necessaire pour justifier le cout reel (US8) et pour preparer le pilotage du lot 3, mais l'ecran de synthese (balance, factures) porte deja la premiere demonstration.

**Independent Test**: Sur un chantier avec des imputations de natures et de postes varies, ouvrir le detail et verifier les sous-totaux par poste et le lien vers chaque piece d'origine.

**Acceptance Scenarios**:

1. **Given** un chantier avec des imputations sur plusieurs postes de depense, **When** le detail est ouvert, **Then** chaque imputation est listee avec sa date, sa nature (facture, piece de caisse), son poste et un lien vers la piece d'origine, et un sous-total par poste est affiche.
2. **Given** un tenant qui n'a encore cree aucun poste de depense personnalise, **When** le premier chantier est cree, **Then** un jeu de postes par defaut est propose (gros oeuvre, toiture, plomberie, electricite, main-d'oeuvre, materiaux, divers), modifiable ensuite.

---

### User Story 10 - Emettre une piece de caisse pour un ouvrier (Priority: P1)

Une gestionnaire veut emettre une piece de caisse - beneficiaire, montant, date, chantier, poste, motif - numerotee, pour tracer une remise d'argent liquide sur un chantier.

**Why this priority**: Recit B8 du PRD, priorite M. L'organisation de la caisse (question 7 du PRD) est desormais tranchee (voir "Decision actee : la caisse" ci-dessus) : caisse unique par tenant, gestionnaire emettrice, dirigeant validateur. Rien ne justifie plus de degrader sa priorite par prudence ; elle rejoint P1, au meme rang que les autres gestes centraux du lot.

**Independent Test**: Emettre deux pieces de caisse le meme jour pour le meme tenant, verifier qu'elles recoivent des numeros sequentiels distincts meme emises presque simultanement, et que chacune s'impute au chantier et au poste indiques des sa validation.

**Acceptance Scenarios**:

1. **Given** une gestionnaire saisissant beneficiaire, montant, chantier et poste d'une piece de caisse, **When** elle la valide, **Then** la piece recoit un numero sequentiel unique pour le tenant et l'annee en cours, une ecriture est creee, et une `CostAllocation` impute son montant au chantier et au poste indiques.
2. **Given** deux pieces de caisse emises en concurrence (quasi simultanement) pour le meme tenant, **When** les deux validations s'executent, **Then** aucune ne recoit le meme numero : la sequence est protegee contre la concurrence.
3. **Given** une piece de caisse validee, **When** la gestionnaire demande son impression, **Then** un document imprimable est produit avec le numero, le beneficiaire, le montant, le motif et le chantier.

---

### User Story 11 - Valider une piece financiere avant qu'elle ne s'impute (Priority: P1)

Une personne distincte de la saisisseuse veut retrouver, dans une file, les pieces financieres en attente de validation, et les valider ou les rejeter, pour que la saisie et la validation restent deux gestes separes (decision D7 du plan).

**Why this priority**: Sans validation separee, aucune des pieces de ce lot (facture, reglement, piece de caisse) ne peut suivre le principe P-6 du PRD ("ce qui est valide ne bouge plus"). C'est aussi la premiere fois que ce droit, deja scaffold au lot 1 sans usage, sert reellement.

**Independent Test**: Creer une facture fournisseur avec un compte n'ayant que le droit de saisie, verifier qu'elle reste au statut brouillon et invisible de la balance ; se connecter avec un compte ayant le droit de validation, la valider depuis la file, et verifier qu'elle apparait desormais dans la balance et le releve.

**Acceptance Scenarios**:

1. **Given** une piece financiere creee par une saisisseuse (facture, reglement ou piece de caisse), **When** elle est enregistree, **Then** elle reste au statut brouillon, ne produit aucune ecriture, et n'apparait dans aucune balance.
2. **Given** une piece brouillon, **When** un utilisateur ne portant que le droit de saisie tente de la valider, **Then** l'operation est refusee (droit distinct requis).
3. **Given** un validateur consultant la file "Pieces a valider", **When** il filtre par auteur ou par nature de piece, **Then** seules les pieces correspondantes s'affichent, toutes natures confondues (facture, reglement, piece de caisse).
4. **Given** une piece validee, **When** elle est relue, **Then** elle porte a la fois `createdByUserId` et `validatedByUserId`, tous deux visibles sur son detail.

---

### User Story 12 - Lier un programme de travaux existant a un chantier (Priority: P3)

Une gestionnaire veut rattacher un programme de travaux (`WorkProgram`, module Patrimoine) a un chantier financier, pour que son cout reel soit desormais derive du chantier plutot que saisi a la main, sans quitter l'ecran du Patrimoine.

**Why this priority**: Cas de raccordement entre deux mondes (Patrimoine et Finance), utile a la coherence globale mais non demonstratif a lui seul : il degrade proprement si le lien n'est jamais pose (le programme continue de fonctionner comme avant, coute saisi a la main).

**Independent Test**: Rattacher un programme de travaux existant a un nouveau chantier, verifier que son `actualCost` devient immediatement egal au cout reel du chantier et que le champ de saisie du cout reel disparait de son formulaire d'edition ; imputer une nouvelle piece au chantier et verifier que le programme de travaux se met a jour sans action supplementaire.

**Acceptance Scenarios**:

1. **Given** un programme de travaux existant sans chantier rattache, **When** la gestionnaire pose le lien vers un chantier, **Then** `WorkProgram.actualCost` prend immediatement la valeur du cout reel du chantier lie.
2. **Given** un programme de travaux rattache a un chantier, **When** une nouvelle imputation est validee sur ce chantier, **Then** `WorkProgram.actualCost` se met a jour dans la meme transaction, sans appel separe.
3. **Given** un programme de travaux rattache a un chantier, **When** la gestionnaire ouvre son formulaire d'edition, **Then** le champ de saisie du cout reel n'est plus presente comme modifiable ; le formulaire affiche la valeur derivee en lecture seule avec un lien vers le chantier.
4. **Given** un programme de travaux non rattache a un chantier, **When** la gestionnaire l'edite, **Then** rien ne change par rapport au comportement actuel du module Patrimoine (le champ `actualCost` reste saisissable).

---

### Edge Cases

- Une facture fournisseur de nature "materiaux" sans chantier renseigne : refusee a la saisie, pas seulement a la validation.
- Une ventilation d'imputation dont la somme differe du montant de la facture, meme d'un franc : refusee avant toute ecriture.
- Un reglement fournisseur d'un montant nul ou negatif : refuse.
- Deux factures validees simultanement pour le meme fournisseur avec un numero de piece identique (double soumission) : la seconde est rejetee sans dupliquer le mouvement (meme mecanisme d'idempotence que le lot 1, transpose aux pieces fournisseurs).
- Une tentative de creer un second compte comptable operationnel avec le meme numero pour le meme tenant : refusee (index partiel operationnel).
- Une tentative de creer un compte comptable de copropriete avec un numero deja utilise par le plan operationnel du meme tenant : acceptee (les deux perimetres sont distincts, seule la collision a l'interieur d'un meme perimetre est bloquee).
- Une piece de caisse emise pour un chantier cloture (anticipation du lot 4) : hors perimetre de ce lot, mais le champ `ConstructionSite.status` doit deja permettre de detecter ce cas pour que le lot 4 le bloque sans migration supplementaire.
- Un `WorkProgram` deja porteur d'un `actualCost` saisi manuellement, au moment ou il est rattache a un chantier : la valeur saisie est ecrasee par la valeur derivee, et ce remplacement est trace (log d'audit), pour qu'aucune valeur ne disparaisse silencieusement.
- Un tenant B ne doit jamais voir un fournisseur, une facture, un chantier, une imputation ou une piece de caisse du tenant A, y compris par un identifiant devine.
- Une violation d'unicite de numero de compte (Prisma `P2002`) doit renvoyer une reponse HTTP 409 avec un message metier, jamais le message Prisma brut (correction du defaut §6.1 bis n°5).

## Requirements _(mandatory)_

### Functional Requirements

**Generalisation comptable (E1 complet)**

- **FR-001**: Le systeme MUST porter `ChartOfAccount` et `AccountingJournal` par `tenantId`, obligatoire, en plus de `syndicateId`, devenu optionnel.
- **FR-002**: Le systeme MUST distinguer un plan de comptes et un journal de copropriete (`scope = SYNDICATE`, `syndicateId` non nul) d'un plan de comptes et d'un journal operationnels (`scope = OPERATIONS`, `syndicateId` nul), sans collision d'unicite entre les deux perimetres au sein d'un meme tenant.
- **FR-003**: Le systeme MUST construire une ecriture equilibree pour toute piece validee de ce lot (facture fournisseur, reglement fournisseur, piece de caisse), par un chemin d'ecriture unique (`postDocumentEntryTx`), et verrouiller cette ecriture automatiquement dans la meme transaction.
- **FR-004**: Le systeme MUST permettre l'annulation d'une piece validee par la creation d'une piece d'annulation liee (`VoidDocument`) et d'une ecriture inverse, sans jamais modifier ni supprimer la piece ni l'ecriture d'origine.
- **FR-005**: La migration de generalisation MUST etre additive et rejouable sans erreur ; elle MUST retro-remplir `tenantId` sur chaque `ChartOfAccount` et `AccountingJournal` existant depuis `Syndicate.tenantId`, avant de rendre la colonne obligatoire.
- **FR-006**: La suite de tests de caracterisation du lot 0 (54 cas) MUST rester verte apres la migration et la correction des defauts du §6.1 bis, a l'exception des cas explicitement mis a jour pour decrire un changement voulu, chacun signale par le maintien du prefixe `SURPRISE :` dans son nouvel intitule ou par un commentaire renvoyant a cette specification.
- **FR-007**: Chacun des cinq defauts du §6.1 bis du plan MUST etre corrige pendant cette generalisation : arrondi de chaque ligne avant le controle d'equilibre ; lecture effective d'`isLocked` par toute voie d'ecriture ; calcul du solde d'ouverture d'un releve depuis le dernier mouvement anterieur a la borne ; precision monetaire du XOF tranchee explicitement ; traduction d'une violation d'unicite Prisma (`P2002`) en reponse HTTP 409 avec message metier.

**Fournisseurs (E3)**

- **FR-008**: Le systeme MUST permettre de creer un fournisseur (raison sociale, contact, nature MATERIALS / SERVICES / MIXED), avec creation automatique de son compte de tiers `SUPPLIER`.
- **FR-009**: Le systeme MUST permettre un lien optionnel entre un fournisseur et un `MaintenanceVendor` existant, sans fusionner les deux entites.
- **FR-010**: Le systeme MUST exiger un rattachement a un chantier pour toute facture d'un fournisseur de nature MATERIALS ou MIXED, et le laisser optionnel pour un fournisseur de nature SERVICES.
- **FR-011**: Le systeme MUST permettre la saisie d'une facture fournisseur en brouillon (fournisseur, date, reference, montant, lignes optionnelles, imputation), puis sa validation par un appel distinct de sa creation.
- **FR-012**: La validation d'une facture fournisseur MUST, dans une seule transaction : verifier que la somme des imputations egale le montant de la facture, poster l'ecriture, deplacer le compte du fournisseur (credit, le fournisseur nous est du davantage), creer les `CostAllocation` correspondantes, et verrouiller l'ecriture. L'echec d'une de ces etapes MUST annuler toutes les autres.
- **FR-013**: Une facture fournisseur validee MUST etre en lecture seule ; toute correction MUST passer par une piece d'annulation liee.
- **FR-014**: Le systeme MUST permettre d'enregistrer un reglement fournisseur, total ou partiel, pouvant couvrir plusieurs factures d'un meme fournisseur, avec repartition explicite du montant entre les factures visees.
- **FR-015**: Un reglement fournisseur dont le montant excede le total du (acompte) MUST rendre le compte fournisseur debiteur du surplus.
- **FR-016**: Le systeme MUST afficher une balance fournisseurs (une ligne par fournisseur, total facture, total regle, solde), filtrable par periode et par chantier, avec total de controle.
- **FR-017**: Le systeme MUST afficher un releve fournisseur chronologique et borne par dates, avec solde d'ouverture calcule depuis le dernier mouvement anterieur a la borne (jamais depuis le solde courant).

**Chantier et imputation (E4)**

- **FR-018**: Le systeme MUST permettre de creer un `ConstructionSite` (nom, zone, dates, responsable, statut) sans bien preexistant (`propertyId` optionnel), distinct de `WorkProgram`.
- **FR-019**: Le systeme MUST permettre de structurer un chantier en postes de depense (`CostCategory`) configurables par tenant, avec un jeu par defaut cree au premier chantier du tenant.
- **FR-020**: Le systeme MUST permettre d'imputer une piece de depense (facture fournisseur, piece de caisse) a un chantier et a un ou plusieurs postes, la somme des ventilations devant toujours egaler le montant de la piece.
- **FR-021**: Le cout reel d'un chantier (`ConstructionSite.actualCost`, expose par l'API) MUST toujours etre calcule comme la somme des `CostAllocation` validees de ce chantier ; aucune route MUST accepter de l'ecrire directement.
- **FR-022**: Le systeme MUST permettre d'emettre une piece de caisse (beneficiaire, montant, date, chantier, poste, motif), numerotee sequentiellement par tenant et par annee, protegee contre les doublons sous concurrence, imprimable.
- **FR-023**: Le systeme MUST afficher le detail d'un chantier : toutes ses imputations, par date, par nature de piece et par poste, avec sous-totaux par poste et lien vers chaque piece d'origine.
- **FR-024**: Le systeme MUST permettre de rattacher un `WorkProgram` existant a un `ConstructionSite` par un lien optionnel (`constructionSiteId`) ; des que ce lien est pose, `WorkProgram.actualCost` MUST etre recopie depuis le cout reel du chantier a chaque validation ou annulation d'imputation, et ce champ MUST cesser d'etre accepte en saisie par l'API Patrimoine pour ce programme.

**Validation et droits**

- **FR-025**: Toute piece financiere de ce lot (facture fournisseur, reglement fournisseur, piece de caisse) MUST porter `createdByUserId`, rester au statut brouillon a la creation, et n'etre validee que par un appel distinct portant le droit `finance.documents.validate`.
- **FR-026**: Le systeme MUST exposer une file "Pieces a valider", filtrable par auteur et par nature de piece, regroupant toutes les pieces financieres brouillon du tenant.
- **FR-027**: Le systeme MUST isoler toute nouvelle donnee de ce lot par `tenantId` ; aucune requete ne peut lire ou modifier un fournisseur, une facture, un chantier, une imputation ou une piece de caisse d'un autre tenant.
- **FR-028**: Aucun ecran ni aucun libelle de ce lot MUST exposer les mots "debit" ou "credit" a l'utilisatrice ; le vocabulaire visible reste "facturer" et "regler" (principe P-1 du PRD), etendu ici a "imputer" pour le rattachement d'une piece a un chantier.
- **FR-029**: La suite de tests locative et de copropriete existante (y compris les tests non-lot du module Patrimoine touches par FR-024) MUST rester verte apres l'introduction de ce lot, hors changements voulus et documentes de FR-006/FR-007.

### Key Entities _(include if feature involves data)_

- **ChartOfAccount / AccountingJournal / JournalEntry / JournalEntryLine** (existants, generalises) : portee etendue a `tenantId` et `scope`, sinon inchanges dans leur usage copropriete. Detail complet et raisonnement de migration dans `data-model.md`.
- **VoidDocument** : piece d'annulation, liee a la piece annulee (facture, reglement ou piece de caisse), portant sa propre ecriture inverse.
- **Supplier** : fournisseur, `kind` (MATERIALS / SERVICES / MIXED), lien optionnel vers `MaintenanceVendor`, lien vers son `ThirdPartyAccount` de type `SUPPLIER`.
- **SupplierInvoice / SupplierInvoiceLine** : facture recue, statut DRAFT / VALIDATED / VOIDED, lignes optionnelles, rattachement chantier obligatoire ou non selon `Supplier.kind`.
- **SupplierPayment / SupplierPaymentAllocation** : reglement, total ou partiel, reparti sur une ou plusieurs factures.
- **ConstructionSite** : chantier, `propertyId?`, `landLeaseId?`, zone, responsable, statut, dates, cout reel calcule (jamais stocke en colonne modifiable), rattachable a des `WorkProgram`.
- **CostCategory** : poste de depense, par tenant, jeu par defaut a la premiere creation.
- **CostAllocation** : imputation d'une piece (facture, piece de caisse) a un chantier et a un poste, avec invariant de somme.
- **CashVoucher** : piece de caisse, numerotee sequentiellement par tenant et par annee, imputee a la validation.
- **WorkProgram** (existant, etendu) : ajout d'un `constructionSiteId?` optionnel ; quand renseigne, `actualCost` derive et non saisissable.

## Assumptions & Dependencies

- **Caisse (question 7 du PRD, tranchee le 18 septembre 2026)** : une seule caisse par tenant ; la gestionnaire emet la piece, le dirigeant valide ; le validateur d'une piece de caisse est le porteur du droit `finance.documents.validate`, sans role de "caissier" distinct. Ce n'est plus une hypothese revisable mais une decision actee ; voir "Decision actee : la caisse" ci-dessus et `research.md` §4.1.
- **Questions 3, 4, 5, 6 du PRD §14, toutes tranchees le 18 septembre 2026** (voir `research.md` §4.2) : un suivi manuel des materiaux existe deja chez la cliente (le lot 5 cesse d'etre conditionnel) ; un budget de chantier est etabli avant demarrage et compare au realise (le lot 3 est pleinement justifie) ; salaries et tacherons coexistent selon le chantier (le lot 4 devra livrer les deux modeles) ; aucun etat de quote-part n'est formalise aujourd'hui pour les associes (le lot 4 livrera une ventilation des loyers et un ecran de consultation, sans envoi periodique). Aucune de ces reponses ne change le perimetre de ce lot ; elles ferment des questions que le plan (§12) citait comme "a trancher avec la cliente avant le lot 2".
- **Volumes** retenus, actes le 18 septembre 2026 (plan §12, decision 10) : 50 a 200 baux (hors perimetre direct de ce lot), 50 fournisseurs, 10 chantiers. Aucun chiffre de performance chiffre au-dela de ceux deja retenus par le lot 1 n'est invente pour ce lot ; aucune exigence de temps de reponse specifique aux fournisseurs ou aux chantiers n'est fixee dans le PRD au-dela de la balance clients (lot 1). Les memes methodes d'agregation SQL (`groupBy`) sont reprises par prudence, sans nouveau seuil chiffre.
- **Reprise (solde initial)** : la piece "solde initial" par tiers, annoncee par le plan (D10) comme arrivant au lot 2, est incluse dans le perimetre fonctionnel de ce lot pour les comptes fournisseurs (un fournisseur cree en cours d'exercice peut recevoir un solde d'ouverture par piece dediee), mais aucune campagne de reprise en masse n'est specifiee : elle reste manuelle, fournisseur par fournisseur.
- **`MaintenanceVendor` et `Supplier` coexistent** (decision actee, plan §1.1 Q12) : ce lot ne fusionne pas les deux entites.
- **Le stock (E9, lot 5) n'existe pas encore** : une facture de materiaux s'impute donc toujours directement au chantier dans ce lot, jamais via une reception de stock.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: La suite de tests de caracterisation du lot 0 (54 cas) reste verte apres la migration, a l'exception des cas lies aux cinq defauts corriges, tous identifies nommement dans le rapport de fin de lot.
- **SC-002**: 100% des factures fournisseurs validees sur la base de demonstration produisent une ecriture equilibree et une imputation dont la somme egale exactement le montant facture.
- **SC-003**: Le cout reel de chaque chantier de la base de demonstration est egal, au franc pres, a la somme de ses imputations validees ; aucune route de l'API ne permet de l'ecrire directement (verifie par un test dedie sur la surface publique du module, a l'image du test d'immuabilite des ecritures du lot 0).
- **SC-004**: La balance fournisseurs et le releve fournisseur ne montrent jamais les mots "debit" ou "credit", verifie par un test dedie (meme mecanisme que le lot 1, SC-005).
- **SC-005**: Aucune facture, aucun reglement, aucune piece de caisse validee n'est modifiable apres validation (verifie par un test qui tente chaque modification et attend un 409).
- **SC-006**: Un `WorkProgram` rattache a un chantier voit son `actualCost` se mettre a jour automatiquement des la validation d'une nouvelle imputation sur ce chantier, sans action manuelle, et son champ de saisie de cout disparait de son formulaire d'edition.
- **SC-007**: La suite de tests locative, de copropriete et de Patrimoine existante reste verte (0 regression non voulue) apres l'introduction de ce lot.
- **SC-008**: La reserve "l'application ne connait pas l'argent qui sort" est levee par la cliente lors de la demonstration du lot 2 (critere qualitatif, transpose du PRD §12 a ce lot).

## Suites prevues

Les lots suivants, hors perimetre de ce document, sont resumes ici pour memoire seulement. Les questions 3 a 6 du PRD (§14), qui les conditionnaient, ont ete tranchees le 18 septembre 2026 (voir `research.md` §4.2) : aucune ne change le perimetre de ce lot, mais toutes ferment une incertitude qui pesait sur le phasage annonce par le plan.

- **Lot 3** : budget de chantier (`SiteBudget`), avenants, bons de commande, engage, alerte de depassement, avancement physique, tableau de bord des chantiers. **Pleinement justifie** (question 4) : la cliente etablit deja un budget avant demarrage et le compare au realise.
- **Lot 4** : bailleurs de terrains (`LandLease`), associations et ventilation des loyers, salaires (`SalaryNote`), tacherons (`Contractor`), retenue de garantie, cloture de chantier et bascule au patrimoine. Devra livrer **les deux modeles** de main-d'oeuvre, salaries et tacherons coexistant selon le chantier (question 5) ; livrera une ventilation des loyers et **un ecran de consultation** de la quote-part associe, sans envoi periodique, aucun etat formalise n'existant aujourd'hui chez la cliente (question 6).
- **Lot 5** : stock de materiaux. **N'est plus conditionnel** (question 3) : un suivi manuel (cahier ou fichier) existe deja chez la cliente, que ce lot remplacera plutot que d'inventer une pratique nouvelle, ce qui reduit sensiblement son risque d'adoption. Redefinira le cout des chantiers concernes des son activation (principe P-7 du PRD).
