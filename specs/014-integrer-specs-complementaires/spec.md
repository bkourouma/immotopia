# Feature Specification: Extensions complementaires du module Syndic

**Feature Branch**: `[014-integrer-specs-complementaires]`  
**Created**: 2026-03-06  
**Status**: Draft  
**Input**: User description: "Integrer les specs complementaires syndic comptabilite budgets relances comptes incidents"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Suivre les impayes et relances automatiques (Priority: P1)

Un gestionnaire syndic veut piloter les retards de paiement par lot, declencher des relances multicanal (email, SMS, WhatsApp), appliquer des penalites et proposer des echeanciers.

**Why this priority**: La reduction des impayes est la valeur metier immediate la plus critique pour le syndic.

**Independent Test**: Creer des charges en retard, executer la relance batch, verifier l'historique des relances, puis appliquer une penalite et un echeancier sur un lot.

**Acceptance Scenarios**:

1. **Given** des charges en retard dans une copropriete, **When** le gestionnaire lance le traitement de relance automatique, **Then** des objets de relance sont crees avec niveau, canal et statut.
2. **Given** une charge tres en retard, **When** le gestionnaire applique une penalite, **Then** le montant de penalite est calcule, stocke et visible dans le suivi du lot.
3. **Given** un coproprietaire en difficulte, **When** le gestionnaire cree un echeancier, **Then** le plan d'echeances est enregistre et suivi par statut des mensualites.

---

### User Story 2 - Gerer les comptes individuels par lot (Priority: P1)

Un gestionnaire veut disposer d'un compte courant temps reel par lot (debits, credits, solde), avec releve PDF et ajustements manuels controles.

**Why this priority**: Le compte individuel rend le recouvrement actionnable et transparent pour le syndic et le coproprietaire.

**Independent Test**: Ouvrir le compte d'un lot, verifier les transactions suite a des appels/paiements/penalites, generer un releve PDF et enregistrer un ajustement.

**Acceptance Scenarios**:

1. **Given** un lot actif, **When** des appels et paiements sont enregistres, **Then** le solde du compte lot est mis a jour automatiquement et auditable.
2. **Given** un lot avec historique, **When** le gestionnaire demande un releve, **Then** un document de releve est genere avec solde initial, mouvements et solde final.

---

### User Story 3 - Comptabilite syndic conforme OHADA (Priority: P1)

Un responsable financier veut gerer la comptabilite de la copropriete avec plan comptable, journaux, ecritures, grand livre et balance.

**Why this priority**: La conformite comptable et les etats financiers sont indispensables pour l'exploitation et la gouvernance.

**Independent Test**: Creer des comptes, saisir une ecriture equilibree, consulter grand livre et balance sur une periode, puis valider une cloture d'exercice.

**Acceptance Scenarios**:

1. **Given** une copropriete avec plan comptable, **When** une ecriture est saisie et validee, **Then** les lignes debit/credit sont stockees, equilibrees et non modifiables apres verrouillage.
2. **Given** des ecritures sur une periode, **When** le gestionnaire consulte la balance, **Then** les soldes par compte sont affiches avec total debit egal total credit.

---

### User Story 4 - Budget previsionnel et generation des appels (Priority: P2)

Un syndic veut construire un budget annuel, le faire approuver, repartir les montants par lots et generer automatiquement des appels de charges.

**Why this priority**: Le budget structure la planification financiere mais depend des briques de comptabilite et de recouvrement.

**Independent Test**: Creer un budget avec lignes, valider la repartition par lots, approuver le budget puis lancer la generation d'un batch d'appels.

**Acceptance Scenarios**:

1. **Given** un budget annuel draft, **When** le gestionnaire ajoute des lignes et lance la repartition, **Then** une allocation par lot est calculee selon la cle de distribution.
2. **Given** un budget approuve, **When** le gestionnaire genere les appels periodiques, **Then** un batch est cree avec le total attendu et des charge calls lies.

---

### User Story 5 - Portail coproprietaire et incidents (Priority: P3)

Un syndic veut enrichir la relation coproprietaire (profils owner/tenant, acces portail) et tracer les incidents des parties communes avec imputation financiere.

**Why this priority**: Cette couche augmente la qualite de service mais peut etre livree apres le noyau financier/comptable.

**Independent Test**: Ajouter un profil proprietaire et locataire sur lot, inviter au portail, creer un incident, l'assigner puis enregistrer une imputation.

**Acceptance Scenarios**:

1. **Given** un lot avec proprietaire CRM, **When** le gestionnaire cree un profil proprietaire et envoie une invitation portail, **Then** l'acces lecture du coproprietaire est activable et tracable.
2. **Given** un incident declare sur partie commune, **When** il est assigne puis impute, **Then** le workflow d'etat est conserve et le cout est rattache au budget ou au lot cible.

---

### Edge Cases

- Plusieurs proprietaires successifs sur un meme lot durant le meme exercice fiscal.
- Paiements partiels multiples avec penalites puis remise partielle de penalite.
- Budget revise en cours d'exercice apres generation partielle des appels.
- Incident sans prestataire disponible mais necessitant cloture comptable provisoire.
- Echec webhook Mobile Money (doublon, delai, reference inconnue).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le systeme MUST gerer des profils proprietaire et locataire de lot relies a `CrmContact`, avec historique d'occupation et de possession.
- **FR-002**: Le systeme MUST permettre l'invitation et l'activation d'un acces portail en lecture pour coproprietaire.
- **FR-003**: Le systeme MUST creer des batches d'appels de charges reguliers ou exceptionnels et lier les `ChargeCall` generes.
- **FR-004**: Le systeme MUST supporter les methodes de paiement Mobile Money, virement, cheque, especes et carte avec reference de transaction.
- **FR-005**: Le systeme MUST enregistrer relances, penalites et echeanciers avec statuts et horodatages.
- **FR-006**: Le systeme MUST maintenir un compte individuel par lot avec transactions et solde courant.
- **FR-007**: Le systeme MUST produire un releve de compte lot exportable en PDF.
- **FR-008**: Le systeme MUST fournir un plan comptable par copropriete et la hierarchie de comptes.
- **FR-009**: Le systeme MUST enregistrer des ecritures comptables en partie double avec lignes debit/credit et verrouillage apres validation.
- **FR-010**: Le systeme MUST exposer grand livre, balance et cloture d'exercice pour une periode donnee.
- **FR-011**: Le systeme MUST permettre la creation, revision, approbation et suivi d'un budget previsionnel annuel.
- **FR-012**: Le systeme MUST calculer la repartition budgetaire par lot selon la cle definie (general, special, egal, manuel).
- **FR-013**: Le systeme MUST generer des appels de charges depuis un budget approuve.
- **FR-014**: Le systeme MUST gerer les incidents syndic avec workflow de statuts et lien vers equipements communs et prestataires.
- **FR-015**: Le systeme MUST enregistrer les imputations financieres d'incident vers budget syndic, assurance, lot ou tiers.
- **FR-016**: Le systeme MUST conserver l'isolation stricte des donnees par `tenantId` et appliquer les permissions RBAC existantes.
- **FR-017**: Le systeme MUST tracer toutes les operations sensibles (paiement, relance, ecriture comptable, cloture, imputation) pour audit.

### Key Entities *(include if feature involves data)*

- **LotOwnerProfile**: Profil proprietaire enrichi d'un lot, avec periode de possession et preferences de notification.
- **LotTenantProfile**: Profil locataire d'un lot, avec periode d'occupation et lien bail optionnel.
- **ChargeCallBatch**: Regroupement d'appels de charges pour une periode et un type (regulier/exceptionnel).
- **PaymentMethod**: Methode de paiement configuree par tenant.
- **PaymentReminder**: Trace des relances envoyees et de leur statut de livraison.
- **LatePaymentPenalty**: Penalite appliquee pour retard de paiement.
- **PaymentSchedule**: Echeancier associe a une charge en retard.
- **SyndicateBudget**: Budget annuel de copropriete avec statut de cycle de vie.
- **BudgetLineItem**: Ligne budgetaire avec cle de distribution et suivi reel vs previsionnel.
- **BudgetAllocation**: Repartition du budget par lot.
- **OwnerAccount**: Compte courant individuel d'un lot.
- **OwnerAccountTransaction**: Mouvement comptable du compte lot.
- **ChartOfAccount**: Compte du plan comptable de copropriete.
- **AccountingJournal / JournalEntry / JournalEntryLine**: Journalisation comptable en partie double.
- **SyndicateIncident / IncidentCostImputation**: Incident syndic et ventilation financiere associee.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% des charges en retard detectees apparaissent dans le dashboard retards en moins de 60 secondes apres calcul.
- **SC-002**: 90% des relances batch sont emises sans intervention manuelle et historisees avec statut de livraison.
- **SC-003**: 100% des ecritures valides respectent l'equilibre debit = credit dans les tests d'acceptation.
- **SC-004**: Le temps de generation d'une balance comptable annuelle reste inferieur a 30 secondes pour une copropriete pilote.
- **SC-005**: 90% des budgets approuves peuvent generer un batch d'appels sans correction manuelle des allocations.
- **SC-006**: 95% des releves de compte lot se generent sans erreur et avec concordance du solde final.
