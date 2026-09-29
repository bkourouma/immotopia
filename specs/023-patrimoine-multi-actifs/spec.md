# Feature Specification: Patrimoine multi-actifs

**Feature Branch**: `[023-patrimoine-multi-actifs]`
**Created**: 2026-09-29
**Status**: Draft
**Décision d'architecture**: [ADR-005](../../docs/architecture/adr/ADR-005-patrimoine-multi-actifs.md)
**Input**: « Élargir la gestion du patrimoine à tout type de patrimoine : des
particuliers de l'UEMOA qui ont un immeuble mais aussi des stocks, des
véhicules, des entreprises, de l'épargne, doivent pouvoir valoriser tout ça,
connaître la valeur de leur patrimoine, faire des projections et des
simulations. »

Cette spec détaille le **lot 1 (socle)**. Les lots 2 à 6 sont décrits par leurs
récits utilisateur ; chacun aura sa propre spec détaillée avant implémentation.

## Périmètre

| Lot | Contenu                                                                        |
| --- | ------------------------------------------------------------------------------ |
| 1   | Socle `Asset`, classes, valorisation manuelle, valeur nette, migration         |
| 2   | Méthodes de valorisation par classe, fiabilité, statut juridique               |
| 3   | Projections consolidées, scénarios, simulations                                |
| 4   | Tenant particulier, inscription libre, palier gratuit, mobile money            |
| 5   | Exports PDF et Excel, portail                                                  |
| 6   | Collecte des paramètres fiscaux d'un pays par IA, validation par l'utilisateur |

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Connaître la valeur nette de mon patrimoine (Priority: P1)

Un particulier veut voir, sur un seul écran, la valeur de tout ce qu'il
possède, ce qu'il doit, et ce qui lui reste, réparti par type d'actif.

**Why this priority**: c'est la promesse du produit ; sans elle, les autres
lots n'ont pas de socle.

**Independent Test**: créer trois actifs de classes différentes avec une
valeur, un prêt, puis vérifier total des actifs, total des dettes, valeur
nette et répartition.

**Acceptance Scenarios**:

1. **Given** un immeuble valorisé à 80 000 000 XOF, un véhicule à 6 000 000
   XOF et un compte mobile money à 400 000 XOF, **When** l'utilisateur ouvre
   le tableau de bord, **Then** il voit 86 400 000 XOF d'actifs répartis par
   classe.
2. **Given** un prêt de 20 000 000 XOF restant dû, **When** la valeur nette
   est calculée, **Then** elle vaut 66 400 000 XOF.
3. **Given** plusieurs valorisations d'un même actif, **When** le total est
   calculé, **Then** seule la plus récente compte.
4. **Given** un actif sans valorisation, **When** le total est calculé, **Then**
   il n'est pas compté et le tableau de bord le signale.

---

### User Story 2 - Enregistrer un actif de n'importe quelle classe (Priority: P1)

Un particulier veut ajouter un actif en choisissant sa classe, remplir les
champs propres à cette classe et saisir sa première valeur.

**Independent Test**: créer un actif de chaque classe avec ses champs propres,
puis vérifier qu'un champ invalide pour la classe est refusé.

**Acceptance Scenarios**:

1. **Given** la classe `VEHICLE_EQUIPMENT`, **When** l'utilisateur saisit
   marque, année et prix d'achat, **Then** l'actif est créé avec ces attributs.
2. **Given** la classe `BUSINESS_EQUITY`, **When** l'utilisateur saisit un
   pourcentage de détention supérieur à 100, **Then** la saisie est refusée.
3. **Given** la classe `REAL_ESTATE`, **When** l'utilisateur crée l'actif,
   **Then** il choisit un bien existant, ou en crée un depuis le module Biens ;
   aucune fiche de bien n'est dupliquée.

---

### User Story 3 - Suivre l'évolution de la valeur d'un actif (Priority: P1)

Un particulier veut ajouter des valorisations successives et voir la courbe
de valeur d'un actif et du patrimoine dans le temps.

**Acceptance Scenarios**:

1. **Given** un actif avec trois valorisations datées, **When** l'utilisateur
   ouvre sa fiche, **Then** il voit l'historique et la valeur courante.
2. **Given** des valorisations de plusieurs actifs, **When** l'utilisateur
   consulte l'évolution du patrimoine, **Then** chaque point de la courbe est la
   somme des dernières valeurs connues à cette date.

---

### User Story 4 - Rattacher dettes, dépenses, documents et détenteurs (Priority: P2)

Un particulier veut lier un prêt, une dépense, un document ou une entité
détentrice (SCI, société, lui-même) à un actif quelconque.

**Acceptance Scenarios**:

1. **Given** un prêt adossé à un véhicule, **When** l'utilisateur l'enregistre,
   **Then** il apparaît sur la fiche du véhicule et dans les dettes.
2. **Given** un prêt non adossé (dette personnelle), **When** la valeur nette
   est calculée, **Then** il est soustrait.
3. **Given** un document avec une date d'expiration, **When** l'échéance
   approche, **Then** l'alerte existante se déclenche, quelle que soit la
   classe de l'actif.

---

### User Story 5 - Garder le comportement immobilier existant (Priority: P1)

Un gestionnaire d'un bien immobilier retrouve, après la refonte, le rendement,
la fiscalité, les relevés de gérance et le portail propriétaire tels qu'avant.

**Acceptance Scenarios**:

1. **Given** un bien détenu déjà valorisé avant la migration, **When** la
   migration s'exécute, **Then** un actif `REAL_ESTATE` lui est associé avec les
   mêmes valorisations, prêts, dépenses, travaux et documents.
2. **Given** un bien immobilier, **When** le rendement est demandé, **Then** le
   résultat est identique à celui d'avant la migration.

---

### Récits des lots suivants (à détailler dans leurs specs)

- **Lot 2** : je choisis une méthode adaptée à ma classe (amortissement, parts ×
  valeur de l'entreprise, quantité × prix) ; chaque valeur affiche sa méthode,
  sa date et sa fiabilité ; un terrain sans titre foncier est signalé fragile.
- **Lot 3** : je projette ma valeur nette sur N années avec des hypothèses par
  classe, je compare trois scénarios, je simule une vente ou un emprunt sans
  toucher à mes données.
- **Lot 4** : je m'inscris seul, je démarre gratuitement avec quelques actifs,
  je paie mon abonnement par mobile money.
- **Lot 5** : j'exporte ma situation patrimoniale en PDF et Excel.
- **Lot 6** : je choisis un pays, l'assistant collecte les paramètres fiscaux
  avec leurs sources, je les relis et les valide pour mon usage ; un résultat
  fondé sur un paramètre non promu est marqué « indicatif ».

## Edge Cases

- Un actif dont la devise n'est pas XOF est converti avec un taux saisi ; sans
  taux, il est exclu du total et signalé.
- Un actif clôturé (vendu, détruit) reste dans l'historique mais sort de la
  valeur nette à sa date de sortie.
- Une dette non adossée dont le capital restant dépasse l'actif adossé donne un
  actif net négatif, affiché tel quel.
- Supprimer un bien qui a un actif `REAL_ESTATE` est refusé tant que l'actif
  existe (ou l'actif est archivé) ; ne jamais laisser un actif orphelin.
- Un `propertyId` d'un autre tenant est rejeté par la même `NotFoundError` qu'un
  objet inexistant.
- Un utilisateur sans actif voit un état vide qui explique comment commencer,
  pas un tableau de zéros.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Le système MUST permettre de créer, lister, modifier, archiver un
  actif d'une classe parmi `REAL_ESTATE`, `BUSINESS_EQUITY`, `INVENTORY`,
  `VEHICLE_EQUIPMENT`, `CASH`, `SAVINGS_INVESTMENT`, `RECEIVABLE`,
  `AGRICULTURE`, `MOVABLE`, `OTHER`.
- **FR-002**: Les attributs propres à une classe MUST être validés par un schéma
  par classe ; une valeur invalide pour la classe est refusée.
- **FR-003**: Un actif `REAL_ESTATE` MUST référencer au plus un `Property` du
  même tenant et MUST NOT dupliquer ses champs de référence.
- **FR-004**: Le système MUST conserver l'historique des valorisations d'un
  actif (date, montant, devise, méthode, source, notes).
- **FR-005**: Le système MUST calculer la valeur nette : somme des dernières
  valeurs des actifs actifs moins somme des capitaux restants dus, en XOF.
- **FR-006**: Le tableau de bord MUST afficher total actifs, total dettes, valeur
  nette, répartition par classe et actifs sans valeur.
- **FR-007**: Le système MUST fournir l'évolution de la valeur nette dans le
  temps à partir des valorisations datées.
- **FR-008**: Prêts, dépenses, travaux, documents et parts détenues MUST se
  rattacher à un `Asset` ; un prêt MAY ne pas être adossé.
- **FR-009**: Toute opération sur un actif MUST vérifier son appartenance au
  tenant actif ; tout identifiant reçu (`propertyId`, entité détentrice, actif)
  MUST être vérifié par `assertBelongsToTenant`.
- **FR-010**: La migration MUST créer un `Asset` `REAL_ESTATE` pour chaque bien
  portant des données patrimoniales et rattacher ces données sans perte ; les
  moteurs de rendement, fiscalité, relevés de gérance et portail propriétaire
  MUST produire les mêmes résultats qu'avant.
- **FR-011**: Les montants MUST utiliser `Decimal` et l'arrondi XOF existant
  (`roundMoneyXof`) ; aucun flottant pour un calcul d'argent stocké.
- **FR-012**: Tout libellé MUST passer par `t()` (fr, en, ar) et toute marge par
  une propriété logique.
- **FR-013**: Les routes MUST passer `routes-inventory`, les modèles
  `schema-tenant-coverage`, et une requête entre tenants MUST être bloquée
  (`npm run test:isolation`).
- **FR-014**: Le wiki des fonctionnalités MUST être mis à jour dans la PR
  d'implémentation (`npm run wiki:export`).

### Key Entities

- **Asset**: actif du patrimoine d'un tenant, avec classe, valeur courante
  dérivée, attributs propres à la classe.
- **AssetValuation**: point d'historique de valeur d'un actif.
- **AssetLoan**: dette, adossée ou non à un actif.
- **AssetHolding**: part d'un actif détenue par une entité détentrice.
- **HoldingEntity**: existant (SCI, holding, société, personne).

## Assumptions & Dependencies

- Aucun client n'utilise le module Patrimoine ; seules les données de démonstration
  sont migrées ou régénérées.
- Les moteurs immobiliers (`yield.ts`, `tax/`) restent inchangés au lot 1 ; ils
  lisent leurs entrées par le bien, via l'actif.
- La devise de référence est le XOF ; les autres devises sont converties avec un
  taux saisi par l'utilisateur.
- L'assistant IA du lot 6 dépend d'un fournisseur avec recherche web
  (`LlmProvider`, ADR-004) et d'une décision sur la portée des validations
  utilisateur.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: un utilisateur crée un actif de chaque classe et voit sa valeur
  nette en moins de 5 minutes, sans documentation.
- **SC-002**: 100 % des opérations sur un actif d'un autre tenant sont bloquées
  dans les tests d'isolation.
- **SC-003**: les résultats de rendement, fiscalité et relevés de gérance sont
  identiques avant et après migration sur le jeu de démonstration.
- **SC-004**: la valeur nette calculée correspond au calcul de référence sur un
  jeu de données de 10 actifs de classes variées.
- **SC-005**: aucune régression des suites `patrimoine`, `routes-inventory`,
  `schema-tenant-coverage`.
