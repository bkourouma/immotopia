# PRD — Gestion financière opérationnelle et suivi des chantiers

|                     |                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| **Produit**         | ImmoTopia                                                                                               |
| **Module**          | Gestion financière opérationnelle (clients, fournisseurs, chantiers, stock)                             |
| **Version**         | 0.1 — proposition initiale                                                                              |
| **Date**            | 18 septembre 2026                                                                                       |
| **Auteur**          | Baba Kourouma                                                                                           |
| **Statut**          | À valider                                                                                               |
| **Document source** | _Compte rendu — Besoin comptable exprimé par la SCI PTC_ (besoins B1–B11, propositions S1–S7 et P1–P18) |

---

## 1. Résumé

Une entreprise familiale ivoirienne exerçant trois métiers — terrains, construction, location — a validé le socle locatif d'ImmoTopia tout en formulant une réserve précise : l'application montre des **statuts** là où elle a besoin de **soldes**, et elle ne couvre que l'argent qui entre, jamais celui qui sort.

Ce PRD décrit un module de **gestion financière opérationnelle** : comptes de tiers à solde courant, balances clients et fournisseurs, imputation des dépenses aux chantiers, budget et pilotage des chantiers, et gestion du stock de matériaux. Il s'arrête volontairement **avant** la comptabilité générale, que la cliente confie à un cabinet externe.

Le point structurant : **une grande partie de la mécanique existe déjà dans le code**, enfermée dans le module Copropriété. Le projet consiste davantage à généraliser qu'à écrire.

---

## 2. Contexte et problème

### 2.1 Ce que l'application fait aujourd'hui

ImmoTopia suit le cycle locatif — bail, échéances, paiements, pénalités, dépôts de garantie — et le restitue par statut : une échéance est payée, impayée ou en retard. Côté dépenses, l'application ne connaît que des prestataires de maintenance (`MaintenanceVendor`), sans compte, sans facture, sans solde. Elle ne modélise **aucune quantité** : pas un seul champ `quantity` dans le schéma.

Le module Copropriété, lui, embarque un moteur comptable complet — plan de comptes, journaux, écritures en partie double, balance par période, comptes de tiers à solde courant avec relevé imprimable, budget prévu/réalisé — mais tout y est rattaché à un `syndicateId`.

### 2.2 Le problème à résoudre

Trois écarts, dans l'ordre où la cliente les a exprimés :

1. **Le suivi n'est pas chiffré.** Elle lit une balance ; l'application affiche des statuts. Les données sont là, la restitution manque.
2. **Les dépenses n'existent pas.** Fournisseurs, chantiers, caisse, bailleurs de terrains : deux flux sortants sur trois, entièrement absents.
3. **Le chantier n'est pas un objet financier.** `WorkProgram` en est l'embryon, mais son coût réel est un champ que rien n'alimente, et il exige un bien existant — un chantier sur terrain loué n'a nulle part où s'inscrire.

### 2.3 Pourquoi maintenant

Ce prospect représente un profil de client — construction puis location — que l'application ne sert qu'à moitié. Le même besoin de suivi de chantier et de stock remonte d'autres prospects. Le module Copropriété a déjà payé le coût du moteur ; le généraliser est le moment le moins cher pour l'étendre.

---

## 3. Objectifs et non-objectifs

### 3.1 Objectifs

| #   | Objectif                                                                 | Mesure                                                                                             |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| O1  | Restituer les créances et dettes **en soldes**, par tiers et par période | Balance clients et balance fournisseurs produites sans aucune saisie manuelle, à partir des pièces |
| O2  | Faire du **chantier** un objet financier de première classe              | Le coût réel d'un chantier est intégralement dérivé des imputations, jamais saisi                  |
| O3  | Rendre le **dépassement** visible avant qu'il soit irréversible          | L'écart budget / engagé / réalisé est consultable sur chaque chantier en cours                     |
| O4  | **Généraliser** le moteur comptable existant plutôt que le dupliquer     | Un seul moteur d'écritures sert la copropriété et la gestion opérationnelle                        |
| O5  | Conserver le vocabulaire de l'utilisatrice                               | Aucun écran n'expose « débit » ou « crédit » ; l'utilisateur **facture** et **règle**              |

### 3.2 Non-objectifs — hors périmètre

Délimité par la cliente elle-même _(compte rendu, § 2 et § 9)_ :

- Comptabilité générale, bilan, compte de résultat, liasse fiscale
- Plan comptable SYSCOHADA normalisé
- Déclarations CNPS et sociales
- Calcul de paie (bulletins, cotisations, retenues)
- Gestion multi-support de la trésorerie et rapprochement bancaire — écartés à ce stade
- Pièces justificatives numérisées et export vers le cabinet comptable — écartés à ce stade

Les deux derniers points ne sont pas hors sujet ; ils sont reportés. Le modèle de données doit les rendre possibles sans les implémenter.

---

## 4. Utilisateurs

| Persona                             | Rôle                                                                        | Ce qu'il attend                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **La gestionnaire**                 | Tient les comptes au quotidien : facture, règle, impute, suit les chantiers | Saisir vite, voir un solde en un écran, ne jamais manipuler de notion comptable                     |
| **Le dirigeant**                    | Arbitre, décide des chantiers, rend compte aux associés                     | Un tableau de bord : tous les chantiers, budget contre réalisé, ce qu'on doit et ce qu'on nous doit |
| **L'associé**                       | Copropriétaire d'un bien ou d'une zone                                      | Sa quote-part, périodiquement, sans accès au reste                                                  |
| **Le cabinet comptable**            | Hors application                                                            | Reçoit, à terme, un export propre — pas dans ce PRD                                                 |
| **Le locataire** (portail existant) | Consulte son bail et ses paiements                                          | Voir son solde et son relevé, pas seulement ses statuts                                             |

---

## 5. Principes de conception

Ces principes tranchent les arbitrages ultérieurs. Ils sont opposables.

**P-1 · Deux verbes, pas quatre.** L'utilisatrice **facture** et **règle**. La partie double est générée sous le capot, jamais exposée. Un écran qui montre « débit / crédit » est un défaut.

**P-2 · La pièce précède l'écriture.** Toute écriture naît d'une pièce — facture client, facture fournisseur, bon de caisse, note de salaire, situation de tâcheron. On ne saisit pas d'écriture libre. La pièce est la vérité ; l'écriture en est la conséquence.

**P-3 · Le solde est stocké après chaque mouvement.** Comme `OwnerAccountTransaction.balanceAfter` le fait déjà. Un relevé se lit sans recalcul, et un solde à une date se retrouve sans agrégation.

**P-4 · Un coût n'est jamais saisi, il est dérivé.** `WorkProgram.actualCost` devient une somme d'imputations. Un chiffre qu'on tape à la main est un chiffre qu'on oublie de mettre à jour.

**P-5 · Généraliser, ne pas dupliquer.** Journaux, plan de comptes, balance, budget : un seul moteur, portée par `tenantId`, avec `syndicateId` devenu optionnel. Deux moteurs divergeraient en six mois.

**P-6 · Ce qui est validé ne bouge plus.** Une pièce validée et son écriture sont immuables ; on corrige par une pièce d'annulation, jamais par modification. _(La spec 014 prévoit un verrouillage des écritures — à confirmer dans le code avant de s'y appuyer.)_

**P-7 · Le stock redéfinit le coût, il ne s'y ajoute pas.** Dès que le stock est activé sur un chantier, le coût des matériaux vient des sorties de magasin et non des factures. Ce basculement est explicite, par chantier, et irréversible.

---

## 6. Architecture fonctionnelle cible

### 6.1 Le concept unificateur : le compte de tiers

Tout ce que la cliente décrit tient en un objet : un **compte de tiers**, portant un solde courant, alimenté par des pièces. Ce qui change, c'est la nature du tiers :

| Nature du tiers     | Pièce qui l'alimente                     | Sens du solde          | Réf.  |
| ------------------- | ---------------------------------------- | ---------------------- | ----- |
| Locataire           | Échéance de loyer / règlement / avance   | Ce qu'il nous doit     | B1–B4 |
| Fournisseur         | Facture reçue / paiement / acompte       | Ce que nous lui devons | B5–B6 |
| Bailleur de terrain | Paiement annuel / constatation mensuelle | Reste à étaler         | B10   |
| Tâcheron            | Situation d'avancement / acompte         | Ce que nous lui devons | P10   |
| Associé             | Quote-part de revenus / reversement      | Ce que nous lui devons | B9    |
| Salarié             | Note de salaire / paiement               | Ce que nous lui devons | B11   |

`OwnerAccount` du module Copropriété est déjà un compte de tiers — pour un copropriétaire. Le PRD propose de le **généraliser** en une entité `ThirdPartyAccount` typée, plutôt que d'en créer une par nature de tiers.

### 6.2 La dimension analytique : le centre de coût

Le **chantier** est un centre de coût. Une pièce de dépense s'y impute, en totalité ou ventilée par poste. Le coût du chantier est la somme de ses imputations. Un chantier ne porte jamais de recette.

Les **associations** sont une seconde dimension analytique, sur les revenus : un bien rattaché à une association voit ses loyers ventilés vers le compte de cette association.

### 6.3 Ce qui existe, ce qui se généralise, ce qui se crée

| Brique                                                                                     | État vérifié dans le code                                          | Action                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `ChartOfAccount`, `AccountingJournal`, `JournalEntry`, `JournalEntryLine`                  | Implémentés, branchés, en partie double _(spec 014, 69/69 tâches)_ | **Généraliser** : portée `tenantId`, `syndicateId` optionnel |
| Balance par période — `getTrialBalanceBySyndicate`                                         | Fonctionnelle, avec totaux de contrôle _(queries.ts:2925)_         | **Généraliser** : filtre par portée et par nature de tiers   |
| `OwnerAccount` + `OwnerAccountTransaction.balanceAfter` + relevé PDF                       | Fonctionnels _(owner-account-statement.ts)_                        | **Généraliser** en `ThirdPartyAccount` typé                  |
| `SyndicateBudget`, `BudgetLineItem` (prévu / réalisé / catégorie / compte)                 | Fonctionnels, écran `SyndicBudgets.tsx` _(queries.ts:3082)_        | **Généraliser** : rattachable à un chantier                  |
| `WorkProgram` (`estimatedCost`, `actualCost`, `isCapitalized`, portée `tenantId`)          | Existe, mais coût réel non alimenté, `propertyId` obligatoire      | **Étendre** en objet Chantier                                |
| `RentalInstallment`, `RentalPayment`, `RentalPaymentAllocation`                            | Fonctionnels                                                       | **Conserver** ; y adosser le compte de tiers locataire       |
| Montants en `Decimal(14,2)`, devise `XOF`                                                  | Vérifié sur tous les modèles concernés                             | **Conserver** — pas de risque d'arrondi flottant             |
| Fournisseurs, factures fournisseurs, bons de commande, caisse, bailleurs, tâcherons, stock | **Absents**                                                        | **Créer**                                                    |

---

## 7. Exigences par épopée

Chaque épopée liste ses récits utilisateur, ses critères d'acceptation et sa traçabilité vers le compte rendu. Priorité : **M** (must, lot engagé), **S** (should), **C** (could, conditionné).

### E1 — Socle : moteur comptable généralisé

_Prérequis de tout le reste. Invisible pour l'utilisateur._

| Récit                                                                                                                | Critères d'acceptation                                                                                                                                                                 | Prio |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| En tant que système, je génère une écriture équilibrée pour chaque pièce validée, sans intervention de l'utilisateur | Toute pièce validée produit exactement une écriture ; total débit = total crédit ; l'écriture référence la pièce ; aucune écriture n'existe sans pièce                                 | M    |
| En tant que gestionnaire, je dispose d'un plan de comptes interne que je peux enrichir                               | Comptes et sous-comptes créés librement ; pas de référentiel imposé ; un compte peut être désactivé mais jamais supprimé s'il porte un mouvement                                       | M    |
| En tant que système, je tiens un compte de tiers typé, avec solde après chaque mouvement                             | `ThirdPartyAccount` porte `kind` ∈ {TENANT, SUPPLIER, LANDLORD, CONTRACTOR, PARTNER, EMPLOYEE} ; chaque mouvement stocke `balanceAfter` ; le solde à toute date se lit sans agrégation | M    |
| En tant que système, je conserve intacte la comptabilité de copropriété existante                                    | Les tests `syndics.accounting` passent sans modification ; les journaux existants gardent leur `syndicateId` ; aucune migration de données destructive                                 | M    |
| En tant que gestionnaire, je ne peux pas modifier une pièce validée                                                  | Une pièce validée est en lecture seule ; la correction passe par une pièce d'annulation liée ; l'historique montre les deux                                                            | M    |

**Dépendance technique** : rendre `AccountingJournal.syndicateId` et `ChartOfAccount.syndicateId` optionnels, ajouter `tenantId` comme portée première. Confirmer dans le code que le verrouillage prévu par la spec 014 (tâche T036) est effectif.

### E2 — Volet clients : balance, relevé, facturation groupée, avances

| Récit                                                                                                                 | Critères d'acceptation                                                                                                                                                                                                                | Réf. | Prio |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- |
| En tant que gestionnaire, je vois la **balance clients** : une ligne par locataire, total facturé, total réglé, solde | Filtrable par période et par bien ; total de contrôle en pied ; export ; un clic ouvre le relevé                                                                                                                                      | B1   | M    |
| En tant que gestionnaire, j'ouvre le **relevé de compte** d'un locataire                                              | Chronologique ; chaque ligne = une pièce (échéance, règlement, avance, pénalité) avec solde après ; imprimable ; borné par dates                                                                                                      | B2   | M    |
| En tant que gestionnaire, je lance la **facturation du mois** pour tous les baux actifs en une opération              | La campagne porte un libellé de période (« Loyer de septembre 2026 ») ; elle génère une échéance par bail actif ; elle est idempotente (relancer ne duplique pas) ; un compte rendu liste les baux facturés et les exclus, avec motif | B3   | M    |
| En tant que gestionnaire, j'encaisse un **règlement sans échéance en face**                                           | Le compte du locataire passe créditeur ; le solde créditeur s'impute automatiquement sur la prochaine échéance générée ; l'imputation est visible sur le relevé                                                                       | B4   | M    |
| En tant que gestionnaire, je vois la **balance âgée**                                                                 | Balance clients ventilée : à échoir, < 30 j, 30–60 j, 60–90 j, > 90 j ; tri par colonne                                                                                                                                               | P18  | S    |
| En tant que locataire, je vois mon solde et mon relevé sur le portail                                                 | Même relevé que côté agence, en lecture seule, borné à mon bail                                                                                                                                                                       | B2   | S    |

**Point d'attention** : `RentalInstallment` fait aujourd'hui office de facture. Le compte de tiers locataire s'adosse à l'existant ; il ne le remplace pas. Vérifier comment `RentalPaymentAllocation` traite un paiement non affecté avant de spécifier B4.

### E3 — Volet fournisseurs

| Récit                                                                                 | Critères d'acceptation                                                                                                                                                                             | Réf.   | Prio |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- |
| En tant que gestionnaire, je crée un **fournisseur**                                  | Raison sociale, contact, nature (matériaux, prestation) ; distinct de `MaintenanceVendor`, ou fusion étudiée                                                                                       | B6     | M    |
| En tant que gestionnaire, je saisis une **facture reçue**                             | Fournisseur, date, référence, montant, lignes optionnelles ; rattachement à un chantier **obligatoire** pour un fournisseur de matériaux ; validation → écriture + mouvement du compte fournisseur | B6, B7 | M    |
| En tant que gestionnaire, j'enregistre un **règlement fournisseur**, total ou partiel | Le solde du compte fournisseur diminue ; un règlement peut couvrir plusieurs factures ; un acompte sans facture rend le compte débiteur                                                            | B6     | M    |
| En tant que gestionnaire, je vois la **balance fournisseurs**                         | Miroir de la balance clients : une ligne par fournisseur, ce que nous devons ; filtrable par période et par chantier                                                                               | B5     | M    |
| En tant que gestionnaire, j'ouvre le **relevé** d'un fournisseur                      | Symétrique du relevé client                                                                                                                                                                        | B6     | M    |

### E4 — Chantier : objet et coût réel

| Récit                                                                                      | Critères d'acceptation                                                                                                                                     | Réf.   | Prio |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- |
| En tant que gestionnaire, je crée un **chantier** sans bien préexistant                    | Nom, zone, terrain (propre ou loué → lien vers compte bailleur), dates, responsable, statut ; `propertyId` optionnel ; un bien peut être créé à la clôture | P1, P3 | M    |
| En tant que gestionnaire, je structure le chantier en **postes de dépense**                | Liste configurable par tenant (gros œuvre, toiture, plomberie…) ; chaque imputation porte un poste                                                         | P2     | M    |
| En tant que gestionnaire, j'**impute** une facture fournisseur à un chantier et à un poste | Imputation totale ou ventilée ; la somme des ventilations = le montant de la facture ; visible sur le détail du chantier                                   | B7     | M    |
| En tant que gestionnaire, j'émets une **pièce de caisse** pour un ouvrier                  | Bénéficiaire, montant, date, chantier, poste, motif ; numérotée séquentiellement ; imputée au chantier à la validation                                     | B8     | M    |
| En tant que système, je calcule le **coût réel** du chantier                               | Somme des imputations validées (factures, pièces de caisse, main-d'œuvre, tâcherons, sorties de stock) ; `actualCost` n'est plus saisissable               | P11    | M    |
| En tant que dirigeant, je consulte le **détail d'un chantier**                             | Toutes les imputations, par date, par nature, par poste, avec la pièce d'origine ; sous-totaux par poste                                                   | P14    | M    |

### E5 — Chantier : budget, engagements, pilotage

| Récit                                                                               | Critères d'acceptation                                                                                                                                          | Réf. | Prio |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- |
| En tant que dirigeant, j'établis un **budget** de chantier, ligne à ligne par poste | Réutilise `BudgetLineItem` rattaché au chantier ; un budget a un statut (brouillon / validé) ; le budget validé devient le budget initial                       | P4   | M    |
| En tant que dirigeant, je modifie un budget validé par **avenant**                  | L'avenant est daté, motivé, tracé ; le budget révisé = initial + avenants ; l'écart se lit contre l'initial et contre le révisé                                 | P5   | S    |
| En tant que gestionnaire, j'émets un **bon de commande**                            | Fournisseur, chantier, poste, lignes, montant ; statut (émis / partiellement facturé / soldé) ; une facture reçue se rapproche d'un bon de commande et le solde | P6   | S    |
| En tant que système, je calcule l'**engagé**                                        | Engagé = bons de commande non soldés + factures validées ; distinct du réalisé                                                                                  | P6   | S    |
| En tant que dirigeant, je reçois une **alerte** de dépassement                      | Seuil en % du budget, configurable par chantier ; déclenchée sur l'engagé ; notification dans l'application                                                     | P7   | S    |
| En tant que gestionnaire, je saisis l'**avancement physique**                       | Pourcentage daté ; historique conservé ; affiché face au consommé                                                                                               | P12  | S    |
| En tant que dirigeant, je vois le **tableau de bord des chantiers**                 | Tous les chantiers en cours : budget, engagé, réalisé, avancement, écart en valeur et en % ; tri et filtre ; code couleur sur l'écart                           | P13  | M    |

### E6 — Chantier : clôture et bascule

| Récit                                                                                         | Critères d'acceptation                                                                                                                                                | Réf. | Prio |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- |
| En tant que gestionnaire, j'applique une **retenue de garantie** sur une facture ou situation | Taux paramétrable ; le montant retenu est isolé du solde fournisseur ; date de libération prévue ; libération = pièce dédiée                                          | P15  | S    |
| En tant que dirigeant, je calcule le **coût de revient par lot**                              | Un chantier peut produire N lots ; clé de répartition (surface, égalitaire, manuelle) ; coût par lot = quote-part du coût total                                       | P16  | S    |
| En tant que dirigeant, je **clôture** un chantier                                             | Statut clôturé ; coût final figé ; option de créer un ou plusieurs biens au patrimoine avec le coût de revient comme valeur d'acquisition ; `isCapitalized` renseigné | P17  | S    |

### E7 — Bailleurs de terrains et associations

| Récit                                                                                       | Critères d'acceptation                                                                                                                                                                      | Réf.    | Prio |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---- |
| En tant que gestionnaire, j'enregistre un **bail de terrain** où l'entreprise est locataire | Bailleur (compte de tiers LANDLORD), terrain, montant annuel, période, chantiers rattachés                                                                                                  | B10     | M    |
| En tant que gestionnaire, j'enregistre le **paiement annuel** au bailleur                   | Le compte bailleur passe débiteur du montant payé d'avance                                                                                                                                  | B10     | M    |
| En tant que système, je **constate mensuellement** la charge                                | Le 1er de chaque mois, 1/12 du montant annuel est constaté ; le compte bailleur diminue d'autant ; il atteint zéro au douzième mois ; la charge s'impute aux chantiers rattachés au prorata | B10, P3 | M    |
| En tant que gestionnaire, je rattache un bien à une **association**                         | Association = liste d'associés avec quote-part ; un bien a au plus une association                                                                                                          | B9      | S    |
| En tant que système, je **ventile** les loyers d'un bien associé                            | À chaque facturation, la part de chaque associé est constatée sur son compte de tiers PARTNER ; le compte loyer principal ne reçoit que la part de l'entreprise                             | B9      | S    |
| En tant qu'associé, je consulte mon **état de quote-part**                                  | Période, biens, loyers facturés, encaissés, ma part, reversements ; lecture seule                                                                                                           | B9      | C    |

### E8 — Salaires et tâcherons

| Récit                                                                        | Critères d'acceptation                                                                                                                                    | Réf. | Prio |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- |
| En tant que gestionnaire, je constate les **salaires du mois** comme dépense | Note de salaire par employé : montant, mois, chantier optionnel ; aucun calcul de cotisation ; validation → compte de tiers EMPLOYEE                      | B11  | S    |
| En tant que gestionnaire, j'impute la main-d'œuvre de chantier               | Une note de salaire rattachée à un chantier s'impute à son coût, poste « main-d'œuvre »                                                                   | P9   | S    |
| En tant que gestionnaire, je gère un **tâcheron**                            | Compte de tiers CONTRACTOR ; marché (montant convenu, chantier, poste) ; situations d'avancement ; acomptes déduits ; solde = marché − situations réglées | P10  | S    |

### E9 — Stock de matériaux

_Lot conditionné à la confirmation du besoin auprès de la cliente. Redéfinit le coût des chantiers concernés (principe P-7)._

| Récit                                                                                        | Critères d'acceptation                                                                                                                       | Réf. | Prio |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- |
| En tant que gestionnaire, je tiens un **référentiel d'articles**                             | Désignation, unité (sac, tonne, barre, m³), catégorie                                                                                        | S1   | C    |
| En tant que gestionnaire, j'enregistre une **réception** rattachée à une facture fournisseur | Quantité et prix unitaire par ligne ; la réception valorise le stock ; la facture ne s'impute plus au chantier — c'est la sortie qui le fera | S2   | C    |
| En tant que gestionnaire, j'enregistre une **sortie** vers un chantier                       | Article, quantité, chantier, poste, demandeur, date ; valorisée selon la méthode retenue ; imputée au coût du chantier                       | S3   | C    |
| En tant que système, je tiens un **stock par dépôt et par chantier**                         | Quantité et valeur ; mouvements tracés ; transfert dépôt → chantier                                                                          | S4   | C    |
| En tant que dirigeant, j'arrête la **méthode de valorisation**                               | Coût moyen pondéré par défaut ; choix figé par tenant ; changement = décision documentée                                                     | S5   | C    |
| En tant que gestionnaire, je fais un **inventaire physique**                                 | Comptage par article et lieu ; écart calculé ; écart justifié (casse, perte, vol) ; ajustement = mouvement tracé                             | S6   | C    |
| En tant que dirigeant, je vois le **rapprochement** acheté / consommé / restant par chantier | Par article ; l'écart non justifié est mis en évidence                                                                                       | S7   | C    |

---

## 8. Modèle de données cible

Vue d'ensemble ; le détail d'attributs relève de la conception technique.

### 8.1 À généraliser

| Entité actuelle                            | Évolution                                                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AccountingJournal`                        | `syndicateId` optionnel ; `tenantId` obligatoire ; `scope` ∈ {SYNDICATE, OPERATIONS}                                                                       |
| `ChartOfAccount`                           | Idem ; un plan par tenant, un sous-ensemble par copropriété                                                                                                |
| `OwnerAccount` / `OwnerAccountTransaction` | Deviennent `ThirdPartyAccount` / `ThirdPartyMovement` avec `kind` ; `OwnerAccount` = `kind: CO_OWNER` ; migration par vue ou par table de compatibilité    |
| `SyndicateBudget` / `BudgetLineItem`       | `Budget` rattachable à `syndicateId` **ou** `constructionSiteId` ; `BudgetLineItem.costCategoryId`                                                         |
| `WorkProgram`                              | Devient `ConstructionSite` : `propertyId` optionnel, `landLeaseId`, `zone`, `managerId`, `progressPercent`, `closedAt`, `finalCost` ; `actualCost` calculé |

### 8.2 À créer

| Entité                                                                                    | Rôle                                                  |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `Supplier`                                                                                | Fournisseur (nature, contact)                         |
| `SupplierInvoice`, `SupplierInvoiceLine`                                                  | Facture reçue                                         |
| `SupplierPayment`                                                                         | Règlement, total ou partiel, multi-factures           |
| `PurchaseOrder`, `PurchaseOrderLine`                                                      | Bon de commande — engagement                          |
| `CashVoucher`                                                                             | Pièce de caisse, numérotée                            |
| `CostCategory`                                                                            | Poste de dépense, par tenant                          |
| `CostAllocation`                                                                          | Imputation : pièce → chantier → poste → montant       |
| `BudgetAmendment`                                                                         | Avenant                                               |
| `LandLease`, `LandLeaseAccrual`                                                           | Bail de terrain, constatation mensuelle               |
| `Partnership`, `PartnershipShare`                                                         | Association, quote-parts                              |
| `Contractor`, `ContractorContract`, `ProgressStatement`                                   | Tâcheron, marché, situation                           |
| `SalaryNote`                                                                              | Note de salaire                                       |
| `RetentionGuarantee`                                                                      | Retenue de garantie                                   |
| `RentBillingRun`                                                                          | Campagne de facturation (« Loyer de septembre 2026 ») |
| `StockItem`, `StockLocation`, `StockReceipt`, `StockIssue`, `StockCount`, `StockMovement` | Stock (E9)                                            |
| `VoidDocument`                                                                            | Pièce d'annulation, liée à la pièce annulée           |

### 8.3 Invariants

- Toute pièce validée référence exactement une `JournalEntry` ; toute `JournalEntry` référence exactement une pièce.
- Σ `CostAllocation.amount` d'une pièce = montant de la pièce.
- `ConstructionSite.actualCost` = Σ `CostAllocation.amount` des pièces validées du chantier — jamais stocké, ou stocké et recalculé à chaque validation.
- `ThirdPartyMovement.balanceAfter` = `balanceAfter` du mouvement précédent ± montant.
- Montants : `Decimal(14,2)`, devise `XOF`, arrondi au franc.

---

## 9. Écrans

| Écran                                       | Persona                          | Contenu                                                                                        | Épopée     |
| ------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| Balance clients                             | Gestionnaire, dirigeant          | Une ligne par locataire ; filtres période / bien ; total ; export                              | E2         |
| Balance âgée                                | Gestionnaire                     | Idem, ventilée par ancienneté                                                                  | E2         |
| Relevé de compte (tiers)                    | Gestionnaire, locataire, associé | Chronologie avec solde après ; impression                                                      | E2, E3, E7 |
| Campagne de facturation                     | Gestionnaire                     | Lancement, période, compte rendu                                                               | E2         |
| Balance fournisseurs                        | Gestionnaire, dirigeant          | Une ligne par fournisseur ; filtres période / chantier                                         | E3         |
| Saisie facture fournisseur                  | Gestionnaire                     | Formulaire avec imputation obligatoire                                                         | E3, E4     |
| Règlement fournisseur                       | Gestionnaire                     | Sélection de factures, montant, acompte                                                        | E3         |
| Pièce de caisse                             | Gestionnaire                     | Formulaire court, impression du bon                                                            | E4         |
| Fiche chantier                              | Gestionnaire, dirigeant          | En-tête, budget, engagé, réalisé, avancement, onglets détail / imputations / commandes / stock | E4, E5, E6 |
| Tableau de bord chantiers                   | Dirigeant                        | Vue croisée tous chantiers, écarts en couleur                                                  | E5         |
| Budget de chantier                          | Dirigeant                        | Lignes par poste, validation, avenants                                                         | E5         |
| Bon de commande                             | Gestionnaire                     | Émission, suivi, rapprochement                                                                 | E5         |
| Bail de terrain                             | Gestionnaire                     | Bailleur, montant, échéancier de constatation                                                  | E7         |
| Association                                 | Dirigeant                        | Associés, quotes-parts, biens                                                                  | E7         |
| Tâcheron / marché                           | Gestionnaire                     | Marché, situations, acomptes                                                                   | E8         |
| Note de salaire                             | Gestionnaire                     | Saisie mensuelle, chantier optionnel                                                           | E8         |
| Stock : réception, sortie, inventaire, état | Gestionnaire                     | Mouvements et rapprochement                                                                    | E9         |

**Navigation** : une section **Finance** dans le menu Agence, regroupant Clients, Fournisseurs, Chantiers, Bailleurs, Associations, Stock — selon la convention de sections déjà en place dans `navigation/model.tsx`.

---

## 10. Exigences non fonctionnelles

| Exigence                   | Détail                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Isolation multi-tenant** | Toute entité porte `tenantId` ; aucune requête sans filtre tenant ; conforme au modèle existant                                     |
| **Immuabilité**            | Pièce validée et écriture en lecture seule ; annulation par pièce liée ; audit des validations et annulations                       |
| **Précision**              | `Decimal(14,2)` partout ; arrondi au franc CFA ; jamais de flottant sur un montant                                                  |
| **Cohérence**              | Pièce + écriture + mouvements + imputations créés dans une même transaction ; échec = rien n'est écrit                              |
| **Droits**                 | Rôles : saisie, validation, consultation, direction ; un associé ne voit que son état ; le portail locataire ne voit que son relevé |
| **Performance**            | Balance et relevé sur un exercice complet en moins de 3 s pour un tenant de 500 tiers — à confirmer par test de charge              |
| **Reprise**                | Import de soldes d'ouverture par tiers à une date de bascule, par pièce dédiée « solde initial »                                    |
| **Non-régression**         | Suite de tests copropriété inchangée et verte après généralisation                                                                  |

---

## 11. Phasage

Aligné sur le lotissement du compte rendu.

| Lot   | Épopées              | Livrable                                                                       | Condition d'entrée                               |
| ----- | -------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| **1** | E1 (partiel), E2     | Balance clients, relevé, facturation groupée, avances — sur données existantes | Aucune                                           |
| **2** | E1 (complet), E3, E4 | Fournisseurs, factures, caisse, imputation, coût réel de chantier              | Lot 1 livré                                      |
| **3** | E5                   | Budget, engagements, alerte, avancement, tableau de bord                       | Lot 2 livré                                      |
| **4** | E6, E7, E8           | Clôture, bascule patrimoine, bailleurs, associations, salaires, tâcherons      | Lot 3 livré                                      |
| **5** | E9                   | Stock                                                                          | Besoin **confirmé** par la cliente ; lot 2 livré |

**Le lot 1 se démontre en visioconférence.** Il ne crée aucune table nouvelle sensible et transforme la seule réserve exprimée en preuve.

---

## 12. Métriques de succès

Mesurables sans chiffre inventé :

| Métrique                                                                 | Cible                                                       |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Balance clients produite sans saisie manuelle                            | 100 % des tiers, à toute date                               |
| Coût réel de chantier saisi à la main                                    | 0 — entièrement dérivé                                      |
| Pièce validée modifiée après validation                                  | 0 — impossible par construction                             |
| Écran exposant « débit » ou « crédit » à la gestionnaire                 | 0                                                           |
| Tests copropriété en échec après généralisation                          | 0                                                           |
| Réserve « ce n'est pas chiffré » levée par la cliente en visioconférence | Oui / non — critère qualitatif, mais c'est celui qui compte |

---

## 13. Risques

| Risque                                                                                             | Impact | Mitigation                                                                                                             |
| -------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| La généralisation casse la comptabilité de copropriété                                             | Élevé  | Migration additive uniquement ; `syndicateId` conservé ; tests existants comme garde-fou ; bascule derrière un drapeau |
| Le stock change le coût des chantiers déjà suivis à la facture                                     | Élevé  | Activation par chantier, explicite et irréversible ; chantiers existants restent à la facture ; principe P-7           |
| Dérive vers la comptabilité générale                                                               | Moyen  | Non-objectifs opposables ; toute demande de bilan, résultat ou paie est refusée par le PRD                             |
| Un seul utilisateur saisit tout                                                                    | Moyen  | Droits différenciés dès le lot 2 ; la validation peut être séparée de la saisie                                        |
| Le besoin réel diverge de l'entretien (une seule personne, un seul poste, aucun document récupéré) | Moyen  | Questions ouvertes du compte rendu (§ 10) à traiter en visioconférence **avant** le lot 2                              |
| `MaintenanceVendor` et `Supplier` font doublon                                                     | Faible | Décision explicite : fusion ou coexistence avec lien, prise en conception du lot 2                                     |
| Les noms propres et montants de l'entretien sont approximatifs                                     | Faible | Ils ne figurent qu'à titre d'exemple ; aucune règle ne s'appuie dessus                                                 |

---

## 14. Questions ouvertes

Reprises du compte rendu et complétées pour la mise en œuvre :

1. Quel outil la cliente utilise-t-elle aujourd'hui ? Capture ou export à obtenir.
2. Volumes : baux, fournisseurs, chantiers actifs.
3. Suivi des matériaux : existe-t-il ? Sous quelle forme ? — conditionne le lot 5.
4. Budget de chantier : établi avant démarrage ? Comparé au réalisé ? — préalable à E5.
5. Les « ouvriers » qui prennent de l'argent au bureau : salariés ou tâcherons ?
6. Les associés reçoivent-ils un état ? Fréquence, forme, calcul de la quote-part.
7. La caisse : une ou plusieurs ? Qui valide ? _(hors périmètre trésorerie, mais nécessaire à B8)_
8. Reprise : soldes d'ouverture ou départ à zéro ?
9. Qui saisit, qui valide ?
10. **Technique** : le verrouillage des écritures prévu par la spec 014 est-il effectif dans le code ?
11. **Technique** : comment `RentalPaymentAllocation` traite-t-il aujourd'hui un paiement non affecté ?
12. **Technique** : `MaintenanceVendor` devient-il un `Supplier`, ou coexistent-ils ?

---

## 15. Matrice de traçabilité

| Réf.  | Intitulé                      | Épopée | Lot  |
| ----- | ----------------------------- | ------ | ---- |
| B1    | Balance clients               | E2     | 1    |
| B2    | Relevé de compte locataire    | E2     | 1    |
| B3    | Facturation mensuelle groupée | E2     | 1    |
| B4    | Avances locataires            | E2     | 1    |
| B5    | Balance fournisseurs          | E3     | 2    |
| B6    | Comptes fournisseurs          | E3     | 2    |
| B7    | Imputation aux chantiers      | E4     | 2    |
| B8    | Pièces de caisse              | E4     | 2    |
| B9    | Ventilation par association   | E7     | 4    |
| B10   | Comptes bailleurs             | E7     | 4    |
| B11   | Salaires comme dépense        | E8     | 4    |
| S1–S7 | Stock                         | E9     | 5    |
| P1    | Fiche chantier autonome       | E4     | 2    |
| P2    | Postes de dépense             | E4     | 2    |
| P3    | Rattachement au bailleur      | E4, E7 | 2, 4 |
| P4    | Budget ligne à ligne          | E5     | 3    |
| P5    | Avenants                      | E5     | 3    |
| P6    | Engagements                   | E5     | 3    |
| P7    | Alerte de dépassement         | E5     | 3    |
| P8    | Matériaux depuis le stock     | E9     | 5    |
| P9    | Main-d'œuvre imputée          | E8     | 4    |
| P10   | Tâcherons                     | E8     | 4    |
| P11   | Coût réel dérivé              | E4     | 2    |
| P12   | Avancement physique           | E5     | 3    |
| P13   | Tableau de bord chantiers     | E5     | 3    |
| P14   | Détail d'un chantier          | E4     | 2    |
| P15   | Retenue de garantie           | E6     | 4    |
| P16   | Coût de revient par lot       | E6     | 4    |
| P17   | Clôture et bascule patrimoine | E6     | 4    |
| P18   | Balance âgée                  | E2     | 1    |

Aucun besoin collecté n'est sans épopée. Aucune épopée n'est sans lot.

---

_Ce PRD s'appuie sur des vérifications directes du code d'ImmoTopia (schéma Prisma, `packages/api/src/lib/syndics/queries.ts`, `WorkProgram`, modèles locatifs). Les points marqués « à confirmer » n'ont pas été vérifiés et doivent l'être avant engagement du lot concerné._
