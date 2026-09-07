# Feature Specification: Module de gestion des syndics de copropriété ImmoTopia

**Feature Branch**: `[013-syndic-module]`  
**Created**: 2026-03-04  
**Status**: Draft  
**Input**: Intégration d’un module complet de gestion des syndics de copropriété dans ImmoTopia (copropriétés, lots, appels de charges, AG, prestataires, documents, fonds).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gérer une copropriété et ses lots (Priority: P1)

Un gestionnaire immobilier souhaite créer une copropriété (syndic) dans ImmoTopia, y rattacher ses immeubles et lots privatifs, puis lier chaque lot à un propriétaire existant dans le CRM afin de centraliser la gestion (tantièmes, historique de détention, occupation).

**Why this priority**: Sans modèle de copropriété et de lots, aucune autre fonctionnalité (appels de charges, AG, fonds, prestataires) ne peut fonctionner. C’est la base de données métier pour les syndics.

**Independent Test**: Cette histoire est testable en créant une nouvelle copropriété, en y ajoutant plusieurs lots reliés à des propriétaires existants, puis en vérifiant que toutes les informations clés (tantièmes, type de lot, historique de propriétaire) sont consultables et modifiables sans utiliser d’autres modules.

**Acceptance Scenarios**:

1. **Given** un gestionnaire connecté sur ImmoTopia, **When** il crée une nouvelle copropriété avec son adresse, le nombre de lots et les immeubles associés, **Then** la copropriété apparaît dans la liste avec un identifiant unique et un récapitulatif (nombre de lots, statut, adresse).
2. **Given** une copropriété existante, **When** le gestionnaire crée un lot, renseigne son type, ses tantièmes et sélectionne un propriétaire dans le CRM, **Then** le lot est visible dans la liste des lots de la copropriété avec le propriétaire associé et les tantièmes agrégés dans le total de la copropriété.

---

### User Story 2 - Appeler et suivre les charges de copropriété (Priority: P1)

Un gestionnaire syndique veut émettre des appels de charges pour un exercice ou une période donnée, les répartir automatiquement par lot en fonction des tantièmes, puis suivre les paiements et les impayés pour relancer les copropriétaires concernés.

**Why this priority**: La facturation et le suivi des charges sont le cœur du métier de syndic. Sans cela, la valeur financière du module est limitée.

**Independent Test**: Cette histoire est testable en créant une série d’appels de charges pour une copropriété, en enregistrant plusieurs paiements partiels/complets, puis en vérifiant les soldes par lot, le statut de chaque appel (à jour, partiel, en retard) et la capacité à identifier les impayés pour relance.

**Acceptance Scenarios**:

1. **Given** une copropriété avec plusieurs lots et tantièmes définis, **When** le gestionnaire génère un appel de charges pour la période « 2024-Q1 » et saisit le montant global à répartir, **Then** le système calcule un montant par lot en fonction des tantièmes et affiche pour chaque lot le montant dû et la date d’échéance.
2. **Given** des appels de charges émis et certains copropriétaires ayant versé des paiements, **When** le gestionnaire enregistre ces paiements avec date, montant et référence, **Then** le statut des appels passe à « partiel » ou « payé », les soldes restants sont mis à jour et les lots en retard apparaissent dans une vue « impayés » prête pour la relance.

---

### User Story 3 - Organiser les Assemblées Générales et les décisions (Priority: P2)

Le gestionnaire souhaite planifier une Assemblée Générale (AG) pour une copropriété, convoquer automatiquement les copropriétaires selon leurs préférences de communication, gérer l’ordre du jour (résolutions), puis saisir les votes par lot afin d’obtenir un récapitulatif des décisions et du quorum.

**Why this priority**: Les AG sont obligatoires pour les copropriétés et structurent la prise de décision collective. La capacité à suivre les résolutions et les votes renforce la valeur juridique et organisationnelle du module.

**Independent Test**: Cette histoire est testable en créant une AG, en y ajoutant plusieurs résolutions, en associant des lots à des votes (présents, représentés, abstentions) et en vérifiant le calcul du quorum, des résultats par résolution et l’archivage du procès-verbal.

**Acceptance Scenarios**:

1. **Given** une copropriété existante, **When** le gestionnaire crée une AG en définissant le type (ordinaire/extraordinaire), la date, l’heure, le lieu et l’ordre du jour (résolutions), **Then** tous les copropriétaires rattachés à des lots de la copropriété sont listés comme destinataires potentiels de la convocation, avec génération d’une vue récapitulative de l’AG.
2. **Given** une AG en cours ou terminée avec des résolutions définies, **When** le gestionnaire saisit pour chaque lot les votes (pour, contre, abstention) et enregistre d’éventuels pouvoirs (proxies), **Then** le système calcule le quorum, agrège les voix et tantièmes par résolution et affiche clairement quelles résolutions sont approuvées, rejetées ou reportées.

---

### User Story 4 - Piloter les prestataires, contrats et équipements communs (Priority: P3)

Un gestionnaire souhaite centraliser les prestataires (ascensoriste, entreprise de nettoyage, maintenance chaudière, etc.), leurs contrats associés à chaque copropriété, ainsi que les équipements et parties communes, afin de suivre les dates de maintenance, les échéances de contrats et les incidents.

**Why this priority**: La gestion des prestataires et des équipements influence directement la qualité de service et la sécurité des copropriétés, tout en impactant les charges. Elle soutient les flux de maintenance et les décisions en AG.

**Independent Test**: Cette histoire est testable en ajoutant un prestataire, en créant un contrat lié à une copropriété avec dates de début/fin et montants, en enregistrant un équipement commun avec ses dates de maintenance, puis en vérifiant les alertes d’échéance et la visibilité de ces informations dans la fiche copropriété.

**Acceptance Scenarios**:

1. **Given** une copropriété, **When** le gestionnaire ajoute un prestataire (coordonnées, spécialité) et le lie à un contrat de maintenance (nature, période, montant), **Then** ce contrat apparaît dans la section « Prestataires et contrats » de la copropriété avec son statut (actif, expiré, résilié) et sa prochaine date d’alerte de renouvellement.
2. **Given** une copropriété disposant d’équipements communs critiques (ascenseur, chaudière, portail), **When** le gestionnaire crée des enregistrements pour ces équipements avec dates de dernière et prochaine maintenance, **Then** ces éléments sont visibles dans la vue « Parties communes & équipements » et les plus urgents sont clairement mis en avant.

---

### Edge Cases

- Copropriétaire possédant plusieurs lots dans la même copropriété (ou dans plusieurs copropriétés) et recevant des appels de charges et convocations groupés ou distincts.
- Appels de charges partiellement réglés, avec plusieurs paiements sur un même appel et gestion des trop-perçus ou sous-paiements.
- Changement de propriétaire d’un lot en cours d’exercice (répartition des charges entre vendeur et acquéreur, historique de propriété).
- AG sans quorum à la première convocation nécessitant une nouvelle convocation ou une AG de second appel.
- Contrats prestataires arrivant à échéance sans renouvellement explicite, avec besoin de conserver l’historique tout en évitant les alertes inutiles.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système MUST permettre de créer, consulter, mettre à jour et archiver des copropriétés (syndics) pour chaque organisation, avec des informations clés comme le nom, l’adresse, le nombre de lots, le nombre de bâtiments et le statut.
- **FR-002**: Le système MUST permettre de créer et gérer des lots de copropriété rattachés à une copropriété, de définir leur type (appartement, parking, cave, etc.), leurs tantièmes généraux/spéciaux et de les lier à des biens immobiliers et à des contacts propriétaires existants.
- **FR-003**: Le système MUST maintenir un historique de détention des lots (date de début de détention par propriétaire) afin de pouvoir reconstituer la situation de la copropriété à une date donnée.
- **FR-004**: Le système MUST permettre de créer des appels de charges pour une copropriété, sur une période donnée, en calculant les montants par lot selon les tantièmes et en stockant le montant, la devise, la date d’échéance et le statut (en attente, partiel, payé, en retard).
- **FR-005**: Le système MUST permettre d’enregistrer des paiements d’appels de charges (montant, date, mode, référence) et de mettre à jour automatiquement le statut des appels et les soldes restants par lot.
- **FR-006**: Le système MUST fournir une vue consolidée des impayés par copropriété et par propriétaire, permettant au gestionnaire d’identifier rapidement les lots en retard et les montants dus.
- **FR-007**: Le système MUST permettre de créer et gérer des Assemblées Générales (type, date, heure, lieu, statut) pour une copropriété, d’y associer des résolutions et de stocker le procès-verbal final.
- **FR-008**: Le système MUST permettre de saisir les votes par lot sur chaque résolution, y compris les cas de représentation via mandat (proxies), et de calculer le quorum, le nombre de voix/tantièmes « pour », « contre » et « abstention » par résolution.
- **FR-009**: Le système MUST déterminer pour chaque résolution si elle est approuvée, rejetée ou reportée selon la règle de majorité applicable et les résultats de vote.
- **FR-010**: Le système MUST permettre d’enregistrer des prestataires de services rattachés à une organisation, de les associer à des copropriétés via des contrats (nature, période, montant, devise, statut) et de suivre les échéances et alertes de renouvellement.
- **FR-011**: Le système MUST permettre de décrire les équipements et parties communes d’une copropriété (catégorie, nom, dates de maintenance, notes) et de les lier aux contrats/prestataires et aux incidents ou tickets de maintenance existants lorsque pertinent.
- **FR-012**: Le système MUST offrir une gestion des documents de copropriété (règlement, procès-verbaux d’AG, diagnostics, attestations d’assurance, budgets, etc.), avec titre, type, lien de fichier et date d’expiration éventuelle.
- **FR-013**: Le système MUST gérer des fonds financiers par copropriété (compte courant, fonds de travaux, etc.) avec un solde et une devise, afin de permettre un suivi synthétique de la trésorerie liée au syndic.
- **FR-014**: Le système MUST intégrer le module de notifications existant pour envoyer des notifications lors de l’émission d’un appel de charges, des relances d’impayés, des convocations d’AG, de la disponibilité du procès-verbal et des alertes de renouvellement de contrats ou d’incidents sur les parties communes, en respectant les préférences de contact des destinataires.
- **FR-015**: Le système MUST respecter le modèle multi-organisation en isolant strictement les données de copropriétés, lots, appels de charges, AG, prestataires, documents et fonds par organisation.
- **FR-016**: Le système MUST offrir des vues de synthèse dans l’interface (listes, tableaux, cartes) permettant aux gestionnaires de filtrer et chercher rapidement les copropriétés, lots, appels de charges, AG, prestataires et documents selon des critères métier (statut, période, montant, type de document, etc.).

### Key Entities *(include if feature involves data)*

- **Copropriété (Syndicate)**: Représente une copropriété gérée par une organisation, incluant ses informations d’identification (nom, adresse, références cadastrales), ses paramètres (nombre de lots, nombre de bâtiments, statut) et les liens vers ses lots, AG, contrats, équipements, documents et fonds financiers.
- **Lot de copropriété (SyndicateLot)**: Représente une unité privative ou annexe (appartement, parking, cave, bureau, commerce) rattachée à une copropriété, avec son numéro de lot, son type, ses tantièmes, son propriétaire, son éventuelle association à un bien immobilier et son historique de détention.
- **Appel de charges (ChargeCall)**: Représente un appel de fonds adressé à un lot sur une période donnée, avec période, montant, devise, date d’échéance, statut et lien vers les paiements enregistrés.
- **Paiement d’appel de charges (ChargePayment)**: Représente un règlement (total ou partiel) d’un appel de charges, avec montant, date, mode de paiement et référence de suivi.
- **Assemblée Générale (GeneralMeeting)**: Représente une réunion des copropriétaires (ordinaire ou extraordinaire) pour une copropriété, avec date, lieu, statut, quorum, résolutions associées, procès-verbal et pouvoirs.
- **Résolution d’AG (GMResolution)**: Représente un point de l’ordre du jour soumis au vote (titre, description, règle de majorité, résultat, statistiques de vote) pour une AG donnée.
- **Vote de copropriétaire (GMVote)**: Représente le vote exprimé par un lot sur une résolution (pour, contre, abstention), permettant de calculer le quorum et les résultats.
- **Pouvoir / Mandat de représentation (GMProxy)**: Représente une délégation de vote d’un copropriétaire à un autre (mandataire) pour une AG donnée.
- **Prestataire de services (ServiceProvider)**: Représente une entreprise ou un professionnel intervenant pour une ou plusieurs copropriétés (nom, spécialité, coordonnées) et lié à des contrats.
- **Contrat de maintenance (MaintenanceContract)**: Représente un contrat entre une copropriété et un prestataire pour une prestation donnée (nature, période, montant, devise, statut, alertes de renouvellement).
- **Équipement / Partie commune (CommonAreaAsset)**: Représente un équipement ou une partie commune de la copropriété (ascenseur, chaudière, toiture, portail, etc.) avec ses dates de maintenance et des notes métier.
- **Document de copropriété (SyndicateDocument)**: Représente un document structurant de la copropriété (règlement, PV, diagnostic, assurance, budget, autre), avec type, lien et date d’expiration.
- **Fonds financiers de la copropriété (SyndicateFund)**: Représente un fonds financier lié à la copropriété (compte courant, fonds de travaux, etc.) avec un solde et une devise pour le suivi de la trésorerie.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Au moins 90 % des gestionnaires pilotes peuvent créer une nouvelle copropriété, y ajouter des lots et lier les propriétaires correspondants sans assistance du support, en moins de 15 minutes lors des tests utilisateurs.
- **SC-002**: Au moins 90 % des copropriétés pilotes ont leurs appels de charges d’une période générés et notifiés aux copropriétaires en moins de 10 minutes de traitement (hors temps de saisie des données initiales).
- **SC-003**: Les gestionnaires peuvent identifier les lots en impayé et déclencher une relance ciblée en moins de 2 minutes à partir de la vue d’une copropriété, dans 95 % des cas de test.
- **SC-004**: Pour chaque AG enregistrée dans le module, le récapitulatif des décisions (résolutions approuvées/rejetées, quorum atteint ou non) est disponible immédiatement après la saisie des votes, avec un taux d’erreur inférieur à 1 % lors d’un échantillon de vérification croisée manuelle.
- **SC-005**: Au moins 80 % des gestionnaires déclarent lors d’un sondage que le suivi des prestataires, contrats et équipements est « plus simple » ou « beaucoup plus simple » qu’avec leurs outils précédents après un mois d’utilisation.
- **SC-006**: Le recours au support pour des questions liées à la création de copropriétés, appels de charges ou organisation d’AG diminue d’au moins 30 % dans les trois mois suivant le déploiement du module par rapport aux trois mois précédents.
