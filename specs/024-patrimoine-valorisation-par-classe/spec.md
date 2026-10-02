# Feature Specification: Valorisation par classe d'actif et fiabilité

**Feature Branch**: `[024-patrimoine-valorisation-par-classe]`
**Created**: 2026-09-29
**Status**: Draft
**Décision d'architecture**: [ADR-005](../../docs/architecture/adr/ADR-005-patrimoine-multi-actifs.md) (lot 2)
**Précédent**: [023 — socle multi-actifs](../023-patrimoine-multi-actifs/spec.md)
**Input**: « Ils doivent pouvoir valoriser tout ça » : chaque classe d'actif a sa méthode de
valorisation, et chaque valeur dit d'où elle vient, quand elle date et à quel point on peut s'y fier.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Obtenir une valeur suggérée adaptée à ma classe d'actif (Priority: P1)

Un particulier saisit les caractéristiques d'un actif (prix d'achat d'un véhicule, part détenue dans une
entreprise, quantité et coût unitaire d'un stock…) et l'application lui **propose** une valeur avec la
méthode utilisée. Il l'accepte, la corrige ou saisit la sienne.

**Independent Test**: pour chaque classe, fournir des attributs connus et vérifier la valeur suggérée et
sa méthode ; vérifier qu'aucune valeur n'est enregistrée sans confirmation de l'utilisateur.

**Acceptance Scenarios**:

1. **Given** un véhicule acheté 10 000 000 XOF il y a 2 ans, durée d'utilité 5 ans, valeur résiduelle 10 %,
   **When** l'utilisateur demande une suggestion, **Then** l'amortissement linéaire donne 6 400 000 XOF.
2. **Given** 30 % des parts d'une entreprise valorisée 200 000 000 XOF, **When** la suggestion est demandée,
   **Then** elle vaut 60 000 000 XOF, méthode « quote-part de l'entreprise ».
3. **Given** 120 unités à 8 500 XOF, décote de 10 %, **When** la suggestion est demandée, **Then** elle vaut
   918 000 XOF.
4. **Given** un placement de 5 000 000 XOF à 6 % par an, dernière valorisation il y a 6 mois, **When** la
   suggestion est demandée, **Then** elle capitalise les intérêts et donne 5 147 815 XOF (intérêts composés,
   arrondi au franc).
5. **Given** une créance de 4 000 000 XOF recouvrable à 75 %, **When** la suggestion est demandée, **Then**
   elle vaut 3 000 000 XOF, méthode « créance décotée ».
6. **Given** une classe sans méthode calculable (biens meubles, autre), **When** l'utilisateur demande une
   suggestion, **Then** l'application répond qu'une saisie manuelle ou une expertise est nécessaire.

---

### User Story 2 - Savoir à quel point je peux me fier à une valeur (Priority: P1)

Chaque valorisation affiche sa méthode, sa date, sa source et un niveau de fiabilité (élevée, moyenne,
faible) accompagné de la raison.

**Acceptance Scenarios**:

1. **Given** une expertise datant de 3 mois, **When** la fiabilité est calculée, **Then** elle est élevée.
2. **Given** la même expertise datant de 30 mois, **When** la fiabilité est calculée, **Then** elle descend de
   deux niveaux (faible) et la raison mentionne l'ancienneté.
3. **Given** une estimation manuelle récente, **When** la fiabilité est calculée, **Then** elle est faible ou
   moyenne selon la source renseignée, jamais élevée.
4. **Given** un solde de compte saisi il y a 1 mois, **When** la fiabilité est calculée, **Then** elle est élevée.
5. **Given** la valeur nette, **When** elle est affichée, **Then** elle indique la part de la valeur totale qui
   repose sur des valeurs de fiabilité faible.

---

### User Story 3 - Signaler la fragilité juridique d'un bien ou d'un terrain (Priority: P1)

Pour un actif immobilier, l'utilisateur indique son statut juridique. Un statut faible plafonne la fiabilité
de la valeur et déclenche un avertissement.

**Acceptance Scenarios**:

1. **Given** un terrain avec titre foncier, **When** la fiabilité est calculée, **Then** aucun plafond ne
   s'applique.
2. **Given** un terrain avec seulement une attestation villageoise, **When** la fiabilité est calculée,
   **Then** elle ne dépasse pas « faible » et un avertissement « statut juridique fragile » s'affiche.
3. **Given** un statut juridique non renseigné, **When** la fiabilité est calculée, **Then** elle ne dépasse
   pas « moyenne » et l'application invite à le renseigner.

---

### User Story 4 - Repérer les valeurs périmées (Priority: P2)

L'utilisateur voit quels actifs n'ont pas été revalorisés depuis longtemps, selon la classe (un solde de
compte vieillit plus vite qu'un terrain).

**Acceptance Scenarios**:

1. **Given** un compte mobile money valorisé il y a 4 mois, **When** la liste des actifs est affichée,
   **Then** l'actif est signalé périmé.
2. **Given** un terrain valorisé il y a 4 mois, **When** la liste est affichée, **Then** il n'est pas signalé.

---

## Edge Cases

- Attributs insuffisants pour la méthode (durée d'utilité absente, valeur d'entreprise inconnue) : la
  suggestion est refusée avec la liste des champs manquants, jamais une valeur inventée.
- Date d'acquisition future ou postérieure à la date de calcul : suggestion refusée.
- Un véhicule amorti au-delà de sa durée d'utilité vaut sa valeur résiduelle, jamais moins.
- Une valorisation existante sans méthode calculée (saisie manuelle du lot 1) garde sa fiabilité `null`
  jusqu'à recalcul ; l'interface la traite comme « faible, source non renseignée ».
- Une devise étrangère est suggérée dans la devise de l'actif, la conversion reste celle de la valeur nette.
- Une valeur suggérée n'est jamais enregistrée automatiquement.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Le système MUST proposer, par classe, une méthode de valorisation calculable à partir des
  attributs de l'actif : amortissement linéaire ou dégressif (véhicules et équipements), quote-part
  d'entreprise (entreprises), quantité × coût unitaire avec décote (stocks), capitalisation des intérêts
  (épargne et placements), solde (comptes et mobile money), créance décotée (créances), effectif ou surface
  × valeur unitaire (agriculture).
- **FR-002**: La suggestion MUST être un calcul pur, sans écriture ; l'utilisateur confirme pour créer la
  valorisation.
- **FR-003**: Toute valorisation MUST porter méthode, date, source facultative et fiabilité ; la fiabilité
  est calculée par le serveur, jamais fournie par le client.
- **FR-004**: La fiabilité MUST dépendre de la méthode, de l'ancienneté, de la classe et, pour l'immobilier,
  du statut juridique ; le résultat MUST inclure la raison lisible.
- **FR-005**: Un actif immobilier MUST pouvoir porter un statut juridique parmi : titre foncier, arrêté de
  concession définitive (ACD), certificat de propriété ou de détention, lettre d'attribution, attestation
  villageoise ou coutumière, autre, non renseigné.
- **FR-006**: La valeur nette MUST indiquer la part de valeur reposant sur une fiabilité faible.
- **FR-007**: Les actifs périmés MUST être signalés selon un seuil par classe.
- **FR-008**: Les montants MUST utiliser `roundMoneyXof` ; aucun flottant stocké.
- **FR-009**: Tout libellé MUST passer par `t()` (fr, en, ar) ; toute marge par une propriété logique.
- **FR-010**: Les routes MUST passer `routes-inventory`, l'étanchéité entre agences MUST être testée, et le
  wiki des fonctionnalités mis à jour.

### Key Entities

- **AssetValuation**: gagne des valeurs de méthode et la fiabilité calculée (colonnes `method`,
  `reliability`, `source` déjà présentes).
- **Détails de classe**: étendus de champs de valorisation (durée d'utilité, valeur résiduelle, valeur de
  l'entreprise, décote, taux, recouvrabilité, valeur unitaire).

## Assumptions & Dependencies

- Dépend du lot 1 (`Asset`, `AssetValuation`, valeur nette).
- Les seuils de péremption, les poids de fiabilité et la liste des statuts juridiques sont des valeurs par
  défaut ajustables ; la liste des statuts juridiques reflète les régimes fonciers courants de l'UEMOA et
  reste à valider par un juriste local avant communication grand public.
- Aucune donnée personnelle ne quitte l'infrastructure : tout est calculé côté serveur.

## Success Criteria _(mandatory)_

- **SC-001**: chaque scénario d'acceptation chiffré ci-dessus est reproduit à l'unité près par les tests.
- **SC-002**: aucune valorisation n'est créée sans confirmation explicite de l'utilisateur.
- **SC-003**: 100 % des valorisations affichées portent méthode, date et fiabilité.
- **SC-004**: aucune régression des suites du lot 1 et de l'immobilier existant.
