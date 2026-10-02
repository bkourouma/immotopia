# Feature Specification: Projections et simulations du patrimoine

**Feature Branch**: `[025-patrimoine-projections-simulations]`
**Created**: 2026-09-29
**Status**: Draft
**Décision d'architecture**: [ADR-005](../../docs/architecture/adr/ADR-005-patrimoine-multi-actifs.md) (décision 7, lot 3)
**Précédents**: [023 — socle](../023-patrimoine-multi-actifs/spec.md), [024 — valorisation par classe](../024-patrimoine-valorisation-par-classe/spec.md)
**Input**: « Ils doivent savoir la valeur de leur patrimoine et aussi faire des projections,
simulations, etc. »

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Projeter ma valeur nette sur plusieurs années (Priority: P1)

Un particulier choisit un horizon (1 à 30 ans) et voit l'évolution année par année de ses actifs,
de ses dettes et de sa valeur nette, selon les hypothèses de sa classe d'actif.

**Independent Test**: fournir des actifs et des prêts connus et vérifier chaque année de la projection.

**Acceptance Scenarios**:

1. **Given** un actif valorisé 10 000 000 XOF avec une croissance de 5 % par an, **When** l'utilisateur
   projette sur 3 ans, **Then** la valeur est 10 500 000, puis 11 025 000, puis 11 576 250 XOF.
2. **Given** un véhicule valorisé 6 400 000 XOF, amortissement linéaire d'annuité 1 800 000 XOF et
   valeur résiduelle 1 000 000 XOF, **When** l'utilisateur projette sur 3 ans, **Then** la valeur est
   4 600 000, puis 2 800 000, puis 1 000 000 XOF (plancher résiduel).
3. **Given** une dette de 12 000 000 XOF restant dû, taux 6 % par an, mensualité 200 000 XOF,
   **When** la projection calcule le premier mois, **Then** les intérêts valent 60 000, le capital
   remboursé 140 000 et le restant dû 11 860 000 XOF ; une dette soldée disparaît ensuite du total.
4. **Given** un actif sans valeur, **When** la projection est lancée, **Then** il est exclu et signalé,
   comme dans la valeur nette.
5. **Given** un horizon hors de 1 à 30 ans, **When** la projection est demandée, **Then** elle est
   refusée avec une erreur de validation.

---

### User Story 2 - Comparer trois scénarios (Priority: P1)

L'utilisateur compare un scénario prudent, un central et un optimiste, chacun étant un jeu
d'hypothèses nommé (croissance par classe, inflation, épargne mensuelle).

**Acceptance Scenarios**:

1. **Given** les trois scénarios par défaut, **When** l'utilisateur les affiche, **Then** il voit trois
   courbes de valeur nette sur le même horizon, prudent ≤ central ≤ optimiste à chaque année.
2. **Given** une hypothèse modifiée (croissance de l'immobilier à 7 %), **When** la projection est
   relancée, **Then** seule la classe concernée change et le résultat indique quelle hypothèse a été
   personnalisée.
3. **Given** l'inflation renseignée, **When** l'utilisateur demande les valeurs réelles, **Then** chaque
   montant est aussi affiché en pouvoir d'achat d'aujourd'hui.

---

### User Story 3 - Simuler une opération sans toucher à mes données (Priority: P1)

L'utilisateur applique des opérations hypothétiques (vente, achat, emprunt, remboursement anticipé,
épargne mensuelle) sur une **copie** de son patrimoine et compare avec la trajectoire de base.

**Acceptance Scenarios**:

1. **Given** un actif valorisé 20 000 000 XOF vendu à l'an 1 avec 3 % de frais, **When** la simulation
   est calculée, **Then** la trésorerie augmente de 19 400 000 XOF, l'actif disparaît de la classe
   d'origine, et la valeur nette à la date de vente baisse de 600 000 XOF (les frais).
2. **Given** une dette de 12 000 000 XOF, **When** l'utilisateur simule un remboursement anticipé de
   5 000 000 XOF, **Then** les dettes baissent de 5 000 000, la trésorerie baisse de 5 000 000, la
   valeur nette est inchangée à cette date, puis supérieure à la base les années suivantes (intérêts
   économisés).
3. **Given** un nouvel emprunt de 10 000 000 XOF à 8 % sur 5 ans versé en trésorerie, **When** la
   simulation est calculée, **Then** la trésorerie et les dettes augmentent du même montant à la date
   de versement, et la valeur nette est inchangée à cet instant.
4. **Given** une épargne mensuelle de 100 000 XOF versée dans un compte à 0 %, **When** la simulation
   est calculée sur 2 ans, **Then** la trésorerie augmente de 2 400 000 XOF.
5. **Given** une simulation, **When** elle est exécutée ou enregistrée, **Then** aucune valorisation,
   aucun actif, aucune dette réelle n'est créé ni modifié.
6. **Given** une vente qui dépasse la quantité détenue ou un remboursement supérieur au restant dû,
   **When** la simulation est demandée, **Then** elle est refusée avec l'opération et le champ en cause.

---

### User Story 4 - Enregistrer et retrouver mes scénarios (Priority: P2)

L'utilisateur nomme et enregistre un scénario (hypothèses et opérations), le rouvre plus tard et le
recalcule avec ses valeurs actuelles.

**Acceptance Scenarios**:

1. **Given** un scénario enregistré, **When** l'utilisateur le rouvre après avoir ajouté un actif,
   **Then** le résultat est recalculé sur le patrimoine actuel, avec les mêmes hypothèses.
2. **Given** deux agences, **When** l'une lit les scénarios, **Then** elle ne voit jamais ceux de l'autre.
3. **Given** un scénario qui référence un actif ensuite archivé, **When** il est recalculé, **Then**
   l'opération concernée est signalée comme sans objet plutôt que de faire échouer tout le calcul.

---

## Edge Cases

- Une projection à partir d'une valeur périmée affiche l'avertissement de fiabilité du lot 2 (part de
  valeur peu fiable de départ).
- Une dette dont la mensualité ne couvre pas les intérêts (capital croissant) est signalée.
- Une classe sans hypothèse de croissance utilise la valeur constante et le dit.
- Une devise étrangère est convertie une fois au taux de l'actif (aucune projection de change).
- Une opération datée avant aujourd'hui ou au-delà de l'horizon est refusée.
- Les hypothèses par défaut sont des valeurs nominales indicatives : l'interface les présente comme
  telles, jamais comme une prévision.
- Un scénario enregistré n'écrit jamais dans les valorisations ; les résultats ne sont pas stockés,
  seulement les hypothèses et opérations.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Le système MUST projeter, année par année sur 1 à 30 ans, la valeur de chaque actif, le
  capital restant dû de chaque dette, les totaux et la valeur nette, à partir des données actuelles.
- **FR-002**: La croissance d'un actif MUST dépendre de sa classe et de ses hypothèses : taux annuel par
  classe, amortissement linéaire ou dégressif pour véhicules et équipements (plancher résiduel), taux
  attendu pour l'épargne, valeur constante sinon.
- **FR-003**: L'amortissement d'une dette MUST suivre un échéancier mensuel (intérêts sur le capital
  restant, mensualité, plancher zéro) et arrêter à l'échéance ou au solde.
- **FR-004**: Le système MUST fournir trois scénarios nommés (prudent, central, optimiste) dont les
  hypothèses par défaut sont des constantes nommées et documentées, et accepter des hypothèses
  personnalisées par classe, l'inflation et l'épargne mensuelle.
- **FR-005**: Une simulation MUST appliquer des opérations (`SELL_ASSET`, `BUY_ASSET`, `TAKE_LOAN`,
  `PREPAY_LOAN`, `MONTHLY_SAVING`) à une copie en mémoire du patrimoine, sans aucune écriture sur les
  données réelles.
- **FR-006**: Chaque opération MUST être validée (actif ou dette appartenant à l'agence, montants,
  dates, quantités) et refusée avec le champ en cause.
- **FR-007**: Le résultat MUST comparer la trajectoire de base et la trajectoire simulée et exposer
  l'écart de valeur nette par année.
- **FR-008**: Un scénario (nom, hypothèses, opérations, horizon) MUST pouvoir être enregistré, listé,
  modifié et supprimé, isolé par agence ; les résultats ne sont jamais stockés.
- **FR-009**: Les calculs MUST utiliser `roundMoneyXof` ; aucun flottant stocké ; horizon et nombre
  d'opérations bornés (30 ans, 50 opérations, 100 scénarios par agence).
- **FR-010**: Tout libellé MUST passer par `t()` (fr, en, ar), toute marge par une propriété logique ;
  les routes MUST passer `routes-inventory`, l'étanchéité entre agences MUST être testée, le wiki des
  fonctionnalités mis à jour.
- **FR-011**: Le budget d'entrée du web (`npm run measure:entry`) MUST rester tenu : aucun `React.lazy`
  ajouté à `App.tsx`, pas de bibliothèque supplémentaire.

### Key Entities

- **PatrimonyScenario**: scénario enregistré d'une agence (nom, horizon, hypothèses, opérations,
  auteur, dates) ; aucun résultat stocké.
- **ProjectionAssumptions** (structure, non stockée seule): croissance annuelle par classe, inflation,
  épargne mensuelle.
- **SimulationOperation** (structure): opération hypothétique datée.

## Assumptions & Dependencies

- Dépend des lots 1 et 2 (`Asset`, valeur nette, méthodes d'amortissement, fiabilité).
- Les hypothèses par défaut (croissance par classe, inflation) sont indicatives ; leur choix final est
  une décision produit à confirmer (voir le plan) et n'empêche pas l'implémentation : les constantes
  sont nommées, testées, modifiables sans migration.
- Aucune donnée personnelle ne quitte l'infrastructure : tout est calculé côté serveur.

## Success Criteria _(mandatory)_

- **SC-001**: chaque scénario d'acceptation chiffré ci-dessus est reproduit à l'unité par les tests.
- **SC-002**: aucune simulation ne modifie une donnée réelle (test qui compare l'état avant et après).
- **SC-003**: 100 % des opérations sur des identifiants d'une autre agence sont refusées.
- **SC-004**: aucune régression des suites des lots 1 et 2 et de l'immobilier existant.
