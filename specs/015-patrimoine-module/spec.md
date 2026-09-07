# Feature Specification: Module Gestion du Patrimoine

**Feature Branch**: `[015-patrimoine-module]`  
**Created**: 2026-03-10  
**Status**: Draft  
**Input**: User description: "Integrer le module Gestion du Patrimoine dans ImmoTopia en enrichissant les biens existants, sans creation de nouveaux biens"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Piloter la valeur globale du portefeuille (Priority: P1)

Un gestionnaire veut visualiser, sur un tableau de bord consolide, la valeur totale des biens, l'endettement, les charges annuelles et les revenus locatifs pour prendre des decisions de gestion.

**Why this priority**: Cette vision portefeuille apporte une valeur immediate pour le pilotage financier de l'organisation.

**Independent Test**: Charger un portefeuille existant et verifier que le tableau de bord affiche les indicateurs consolides coherents a partir des biens et donnees patrimoniales existantes.

**Acceptance Scenarios**:

1. **Given** des biens existants avec valorisations, prets, depenses et baux actifs, **When** le gestionnaire ouvre la vue patrimoine, **Then** il voit les indicateurs consolides du portefeuille.
2. **Given** plusieurs valorisations historiques pour un meme bien, **When** la valeur totale est calculee, **Then** seule la valorisation la plus recente de chaque bien est prise en compte.

---

### User Story 2 - Enrichir un bien existant avec ses donnees patrimoniales (Priority: P1)

Un gestionnaire veut ouvrir la fiche d'un bien existant et y consulter ou saisir les valorisations, depenses, prets, travaux et documents patrimoniaux sans dupliquer les informations du bien.

**Why this priority**: La gestion du patrimoine par bien est le coeur du module et repose sur les biens deja existants.

**Independent Test**: Depuis la fiche d'un bien existant, verifier la consultation et la gestion des donnees patrimoniales, puis confirmer qu'aucune creation de bien n'est possible dans ce module.

**Acceptance Scenarios**:

1. **Given** un bien appartenant a l'organisation, **When** le gestionnaire ouvre l'onglet Patrimoine du bien, **Then** il peut gerer les valorisations, depenses, prets, travaux et documents lies a ce bien.
2. **Given** un identifiant de bien hors organisation, **When** une operation patrimoine est demandee, **Then** l'acces est refuse et aucune donnee n'est creee ou modifiee.

---

### User Story 3 - Produire et envoyer les releves de gerance proprietaire (Priority: P2)

Un gestionnaire veut generer un releve mensuel par proprietaire avec les lignes de revenus et charges, puis l'envoyer au proprietaire en respectant ses preferences de consentement.

**Why this priority**: Le releve de gerance est un livrable metier cle pour la relation proprietaire.

**Independent Test**: Generer un releve pour une periode et un proprietaire, verifier ses lignes, puis lancer l'envoi et valider le changement de statut.

**Acceptance Scenarios**:

1. **Given** un proprietaire et des biens selectionnes pour une periode, **When** le gestionnaire genere un releve, **Then** le releve et ses lignes sont crees de maniere atomique avec montant net calcule.
2. **Given** un releve en statut brouillon et un proprietaire joignable avec consentement valide, **When** le gestionnaire envoie le releve, **Then** une notification est emise et le statut de suivi est mis a jour.

---

### User Story 4 - Anticiper la performance et les risques patrimoniaux (Priority: P3)

Un gestionnaire veut analyser les rendements brut, net et net-net ainsi que des projections pluriannuelles pour prioriser les actions d'investissement, de renovation et de financement.

**Why this priority**: L'analyse avancee ameliore la qualite de decision mais depend des donnees de base deja collectees.

**Independent Test**: Fournir des donnees de loyers, valeur, charges et mensualites, puis verifier les rendements et la projection annuelle sur plusieurs annees.

**Acceptance Scenarios**:

1. **Given** des donnees patrimoniales completes pour un bien, **When** l'analyse de rendement est lancee, **Then** les indicateurs brut, net, net-net et plus-value latente sont restitues.
2. **Given** des hypotheses de croissance et de vacance, **When** la projection sur N annees est calculee, **Then** un resultat annuel coherent est produit pour chaque annee de la periode.

---

### Edge Cases

- Un bien sans valorisation ne doit pas etre considere comme valorise dans le total portefeuille.
- Un bien peut avoir des charges sur l'annee mais aucun bail actif.
- Un document patrimonial peut expirer prochainement sans proprietaire rattache.
- Un proprietaire peut avoir plusieurs biens sur une meme periode de releve.
- Une tentative d'operation sur un bien d'une autre organisation doit toujours etre rejetee.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le systeme MUST fournir une vue consolidee patrimoine du portefeuille avec nombre de biens, taux d'occupation, valeur estimee totale, encours de dette, charges annuelles et loyer annuel.
- **FR-002**: Le systeme MUST permettre la gestion des valorisations historiques d'un bien existant, incluant date, methode, montant estime et informations de cout d'acquisition.
- **FR-003**: Le systeme MUST permettre la gestion des prets immobiliers d'un bien existant, incluant capital initial, capital restant, taux, mensualite, echeances et statut.
- **FR-004**: Le systeme MUST permettre la gestion des depenses d'un bien existant avec categorie, montant, date de paiement et indicateur de capitalisation.
- **FR-005**: Le systeme MUST permettre la gestion des programmes de travaux planifies pour un bien existant avec suivi d'etat et couts estimes/reels.
- **FR-006**: Le systeme MUST permettre la gestion des documents patrimoniaux lies a un bien et/ou un proprietaire avec typologie et date d'expiration optionnelle.
- **FR-007**: Le systeme MUST permettre de generer des releves de gerance proprietaire par periode avec lignes detaillees de revenus et deductions.
- **FR-008**: Le systeme MUST calculer et exposer les indicateurs de rendement brut, net, net-net et plus-value latente a partir des donnees disponibles.
- **FR-009**: Le systeme MUST produire des projections de performance sur plusieurs annees a partir d'hypotheses de croissance de valeur, loyers, charges et vacance.
- **FR-010**: Le systeme MUST envoyer un releve au proprietaire en tenant compte des consentements de communication et tracer l'evenement d'envoi.
- **FR-011**: Le systeme MUST declencher des alertes pour les documents arrivant a expiration dans une fenetre configurable.
- **FR-012**: Le module patrimoine MUST interdire toute creation de bien et toute modification des informations de reference d'un bien existant.
- **FR-013**: Le module patrimoine MUST interdire toute duplication des informations de reference du bien et reutiliser les donnees du bien existant lors des consultations.
- **FR-014**: Toute operation patrimoine sur un bien MUST verifier l'appartenance du bien a l'organisation active avant lecture ou ecriture.
- **FR-015**: La generation d'un releve et de ses lignes MUST etre atomique afin d'eviter des releves partiels.

### Key Entities *(include if feature involves data)*

- **Asset Valuation**: Historique des valorisations d'un bien avec montant estime, methode et contexte d'acquisition.
- **Property Loan**: Donnees d'emprunt associees a un bien pour suivre dette, mensualites et cycle de vie du pret.
- **Property Expense**: Charges et depenses liees a un bien, avec nature de charge et caractere capitalisable.
- **Work Program**: Travaux planifies ou realises sur un bien avec couts et avancement.
- **Patrimony Document**: Document patrimonial rattache a un bien ou a un proprietaire avec suivi d'expiration.
- **Owner Statement**: Releve periodique de gerance pour un proprietaire avec totaux revenus/charges/net.
- **Owner Statement Item**: Ligne detaillee d'un releve, rattachee a un bien et a un type de flux financier.

## Assumptions & Dependencies

- Les biens immobiliers de reference existent deja et sont geres dans le module dedie aux biens.
- Les informations de proprietaires existent deja et sont geres dans le module de contacts.
- Les donnees de loyers exploitables pour les calculs de rendement sont disponibles via les baux actifs.
- Les mecanismes de notification et de journalisation existants sont reutilisables pour les envois et alertes patrimoine.
- L'isolation stricte des donnees par organisation reste un prerequis transversal a toutes les operations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% des gestionnaires peuvent consulter la vue consolidee patrimoine en moins de 30 secondes apres ouverture de la page.
- **SC-002**: 100% des operations patrimoine sur des biens hors organisation sont bloquees dans les tests d'acceptation.
- **SC-003**: 95% des releves de gerance sont generes sans erreur et sans incoherence de totaux sur un jeu de donnees representatif.
- **SC-004**: 90% des releves envoyes atteignent un statut de diffusion trace dans la meme journee.
- **SC-005**: 100% des calculs de rendement verifies sur jeux de donnees de reference retournent les resultats attendus.
- **SC-006**: 95% des documents expirant dans la fenetre cible font l'objet d'une alerte avant leur date d'expiration.
