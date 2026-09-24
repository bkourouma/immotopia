# ImmoTopia — Liste des fonctionnalités

Mise à jour du 24 septembre 2026, branche `feat/gestion-locative-lot-1` (pas
encore fusionnée sur `main`).

Recensement établi à partir du code réel (routes API `packages/api/src/routes`,
services `packages/api/src/services`, écrans `apps/web/src/pages`, modèle de
navigation `apps/web/src/navigation/model.tsx`, schéma `prisma/schema.prisma`).

## 0. Socle

- **Multi-tenant** : une instance, plusieurs agences/opérateurs (`Tenant`), chacune avec ses collaborateurs, ses données et ses paramètres.
- **Modules activables par tenant** : `MODULE_AGENCY`, `MODULE_SYNDIC`, `MODULE_PROMOTER` — activés/désactivés depuis l'administration plateforme.
- **4 personas de navigation** : super-administrateur plateforme, collaborateur d'agence, propriétaire (portail), locataire (portail). Chacun a son arbre de menus et sa barre d'onglets mobile.
- **RBAC** : rôles (`Role`) × permissions (`Permission`) fines par domaine, plus un réglage des menus visibles par rôle (`RoleMenuAccess`).
- **Journal d'audit** : traçabilité des actions sensibles (`AuditLog`), consultable en administration.

## 1. Authentification et comptes

- Inscription, connexion, rafraîchissement de session, déconnexion.
- Vérification d'adresse e-mail (jeton dédié).
- Mot de passe oublié / réinitialisation par jeton.
- Connexion Google (OAuth), avec liste des fournisseurs disponibles exposée par l'API.
- Invitation de collaborateurs et acceptation d'invitation (création du compte à l'acceptation).
- Limitation de débit sur les routes sensibles (login, reset, inscription, invitation).
- Profil utilisateur et préférences.

## 2. Administration de la plateforme (super-admin)

- Liste, création, consultation et modification des agences (tenants).
- Activation/désactivation des modules par agence.
- Abonnements : plan, cycle, statut (`Subscription`).
- Facturation plateforme : création, modification, marquage payé/annulé (`Invoice`).
- Rôles et permissions : édition des permissions par rôle **et** des entrées de menu ouvertes par rôle, avec des valeurs par défaut déduites des permissions.
- Statistiques transverses de la plateforme.
- Journaux d'audit.

## 3. Biens immobiliers (parc)

- Fiche bien complète : création, modification, archivage/suppression.
- Modèles de type de bien (`PropertyTypeTemplate`) : champs et caractéristiques selon la nature du bien.
- Médias : photos et pièces jointes du bien, avec gestion d'ordre.
- Documents du bien.
- Historique des changements de statut (`PropertyStatusHistory`).
- Mandats (`PropertyMandate`) : mandat de gestion / de vente rattaché au bien.
- Publication : mise en ligne / retrait d'une annonce, avec une API publique (`/public/properties`) pour un site vitrine.
- Score de qualité de l'annonce (`PropertyQualityScore`) : complétude/qualité de la fiche.
- Recherche de biens multi-critères.
- Visites : planification, collaborateurs affectés, **calendrier des visites**.
- Référentiel géographique : pays, régions, communes — utilisé pour la localisation et les zones cibles.

## 4. Gestion locative

- **Baux** (`RentalLease`) : création, modification, colocataires (`CoRenter`), détail du bail.
- **Échéances** (`RentalInstallment`) : génération automatique des échéances, lignes de détail (loyer, charges…), suivi et fiche d'échéance.
- **Paiements** (`RentalPayment`) : saisie, allocation d'un paiement sur une ou plusieurs échéances (`RentalPaymentAllocation`), fiche paiement. La date retenue est celle du règlement effectif, pas celle de la saisie (`96ad470`).
- **Déclarations de paiement** (`RentalPaymentDeclaration`) : le locataire déclare un règlement, l'agence valide.
- **Remboursements** (`RentalRefund`).
- **Pénalités de retard** : règles paramétrables (`RentalPenaltyRule`), calcul automatique par tâche planifiée (`penalty-calculation-job`), consultation et ajustement manuel.
- **Dépôts de garantie** (`RentalSecurityDeposit`) : constitution, mouvements (retenues, restitutions).
- **Documents locatifs** (`RentalDocument`) : génération, consultation, modification.
- **Honoraires de gestion** (`ManagementFee`) : calculés à chaque affectation de règlement, figés à leur création (taux, TVA, gestionnaire, part d'agent). Barème à trois niveaux — bail (`LeaseManagementTerms`) > propriétaire (`OwnerManagementTerms`) > agence (`AgencyFinanceSettings`) — en pourcentage ou forfait, sur le loyer seul ou loyer + charges. TVA calculée si l'agence y est assujettie. Commission d'agent sur les honoraires (`AgentCommissionRate`) : part du collaborateur gestionnaire du bail.
- **Compte courant du propriétaire** (`ThirdPartyAccount` de nature mandant, `ThirdPartyMovement`) : solde alimenté automatiquement par chaque encaissement, honoraires, TVA et dépense, jamais de saisie libre. Suivi SYSCOHADA au compte 4731, un sous-compte par mandant.
- **Reversements aux propriétaires** (`OwnerPayout`, numérotés REV-AAAA-NNNN) : paiement du solde dû, moyen de règlement, compte de trésorerie débité, annulation tracée (motif, auteur).
- **Relevé de gérance** (`OwnerStatement` / `OwnerStatementItem`) : instantané mensuel — loyers réellement encaissés dans le mois (arriérés compris), loyers appelés, arriérés restants, montant net (encaissé − honoraires − TVA − dépenses) —, figé à l'envoi pour ne pas bouger si un paiement est saisi en retard (`c69e6c5`).
- **Indivision** (`PropertyOwnershipShare`) : quotes-parts des indivisaires d'un bien, sommant à 100 %. Loyers, honoraires, TVA et dépenses répartis au prorata dans les comptes et relevés de chaque indivisaire (`7826e57`).
- **Vie du bail** (`LeaseEvent`) : révision de loyer avec historique et taux annoncé, renouvellement, avenant, résiliation (initiateur locataire/bailleur/mutuel, préavis, date de sortie) — chaque événement conserve l'état antérieur du bail (`38cc322`).
- **États des lieux** (`LeaseInspection`, `LeaseInspectionPhoto`) : un par type (entrée/sortie) et par bail, brouillon puis finalisé, pièce par pièce avec état de chaque élément, index des compteurs, retenues proposées sur le dépôt de garantie à la sortie, photos rattachées (fichiers privés, jamais servis en statique) (`38cc322`).
- **Retenue à la source sur loyers** (`RentWithholding`, `TaxRemittance`) : taux distinct particulier/société, assiette et montant figés à l'encaissement, activable par l'agence avec une date de début (n'affecte jamais les encaissements passés), versement à la DGI numéroté DGI-AAAA-NNNN (`65ad2cd`).

## 5. Documents et modèles

- **Modèles de documents** (`DocumentTemplate`) paramétrables par l'agence, avec variables métier.
- Moteur de génération : construction du contexte de données (bail, bien, locataire, agence…) et rendu **DOCX**.
- Numérotation automatique des documents (`DocumentCounter`).

## 6. Patrimoine (vue investisseur)

- **Vue consolidée** du patrimoine sur l'ensemble des biens.
- **Performance** : rendement par bien (`/properties/:id/yield`) et indicateurs consolidés.
- **Valorisations** (`AssetValuation`) : historique de valeur des biens.
- **Emprunts** (`PropertyLoan`) : crédits rattachés aux biens.
- **Dépenses** (`PropertyExpense`).
- **Programmes de travaux** (`WorkProgram`) : par bien et vue transverse.
- **Relevés propriétaire** (`OwnerStatement` / `OwnerStatementItem`) : constitution, consultation et **envoi** au propriétaire.
- Documents patrimoniaux (`PatrimonyDocument`).

## 7. Maintenance / incidents

- **Tickets** (`MaintenanceTicket`) : création par le locataire ou l'agence, cycle de vie complet.
- Pièces jointes et **fil de commentaires** sur le ticket.
- Historique des changements de statut.
- **Prestataires** (`MaintenanceVendor`) : annuaire et affectation.
- Notifications automatiques aux parties prenantes lors des événements du ticket.
- Deux angles de vue : « Tickets de l'agence » (gestionnaire) et « Mes demandes » (demandeur).

## 8. CRM

- **Contacts** (`CrmContact`) : prospects, clients, propriétaires, locataires ; rôles multiples par contact, étiquettes (`CrmTag`), zones cibles, notes, archivage.
- **Affaires** (`CrmDeal`) : pipeline avec étapes, biens rattachés à l'affaire.
- **Activités** (`CrmActivity`) : appels, tâches, notes.
- **Calendrier** et rendez-vous : création, modification, annulation, vue calendrier dédiée.
- **Appariement biens ↔ affaires** (matching) : exécution et consultation des résultats.
- **Tableau de bord CRM** : indicateurs commerciaux.
- **Recherches de contacts enregistrées** (`SavedContactSearch`).

### Ventes immobilières (lot 9)

L'agence intermédiaire la vente d'un bien, du mandat à l'encaissement de sa commission. Cahier des charges : `docs/ventes/PRD-lot-9-ventes.md`. Menu **Ventes**.

- **Mandats de vente** (`SaleMandate`, `MV-AAAA-NNNN`) : vendeur `TenantClient` (co-vendeurs d'un bien en indivision affichés), mandat simple ou exclusif, prix demandé et plancher, honoraires en pourcentage ou forfait, à la charge du vendeur ou de l'acquéreur, négociateur et sa part ; un seul mandat actif par bien, révocation motivée.
- **Offres d'achat** (`SaleOffer`, `OA-AAAA-NNNN`) : acquéreur `CrmContact`, affaire CRM d'origine, financement, validité ; contre-offre, acceptation, refus, retrait. Une seule offre acceptée vivante par mandat ; les offres encore ouvertes sont refusées d'office à la vente ou à la révocation.
- **Compromis** (`SaleAgreement`, `CV-AAAA-NNNN`) : prix convenu, dépôt de l'acquéreur (chez le notaire ou le vendeur), notaire, conditions suspensives (`SaleAgreementCondition`), échéancier de l'acquéreur (`SalePaymentMilestone`, suivi sans écriture) ; brouillon → signé → acte signé, ou annulé. L'acte exige que toutes les conditions soient réalisées ou renoncées.
- **Statut du bien** synchronisé avec l'historique : réservé à l'acceptation, sous offre au compromis, vendu à l'acte, disponible à l'annulation. L'affaire CRM liée passe « gagnée » à l'acte.
- **Commissions de vente** (`SaleCommission`, `HT-AAAA-NNNN`) : créées à l'acte, TVA figée selon les paramètres financiers, encaissements partiels (`SaleCommissionPayment`, `RC-AAAA-NNNN`) comptabilisés `trésorerie / 70612 + 4432`, annulation par contre-passation, part du négociateur.
- **Tableau des ventes** : mandats actifs et expirés, offres ouvertes, compromis signés, ventes et commissions du mois ; encart « Vente » sur la fiche d'un bien.

## 9. Communication

- **Notifications e-mail** : configuration par événement métier (`EmailNotificationConfig`), modèles par défaut fournis, écran unifié d'édition.
- **Notifications WhatsApp** : configuration par événement, modèles par défaut, variables métier, envoi via fournisseur (Twilio).
- **Message groupé WhatsApp** : diffusion à un groupe, automatisation de groupe, webhook entrant WhatsApp, journal des invitations de groupe.
- **Résolution de contact** : rapprochement d'un numéro entrant avec un contact/bail existant.
- **Newsletter** :
  - Listes d'abonnés (`NewsletterList`, `NewsletterSubscriber`)
  - Campagnes (`NewsletterCampaign`) avec planification (`newsletter-campaign-scheduler.job`) et suivi des destinataires
  - Modèles de newsletter (`NewsletterTemplate`)
  - Pages publiques : inscription, confirmation (double opt-in), désinscription
- **Préférences de communication** par contact (`CommunicationPreference`) et historique des envois (`Communication`).
- **Relances planifiées** (`reminder-scheduler.job`, `ReminderConfig`, `PaymentReminder`).

## 10. Syndic / copropriété

- **Copropriétés** (`Syndicate`) : fiche, création, modification, liste.
- **Lots** (`SyndicateLot`) : tantièmes, affectation propriétaire (`LotOwnerProfile`) et locataire (`LotTenantProfile`, `LotTenantAssignment`).
- **Charges** : appels de charges (`ChargeCall`), lots d'appels (`ChargeCallBatch`), paiements de charges (`ChargePayment`).
- **Recouvrement** : relances (`PaymentReminder`), pénalités de retard (`LatePaymentPenalty`), échéanciers de paiement (`PaymentSchedule` / `PaymentScheduleInstalment`), moyens de paiement (`SyndicPaymentMethod`).
- **Assemblées générales** (`GeneralMeeting`) : ordre du jour (`GMAgendaItem`), résolutions (`GMResolution`), votes (`GMVote`), pouvoirs (`GMProxy`), détail de séance.
- **Budgets** (`SyndicateBudget`) : lignes budgétaires et ventilations (`BudgetLineItem`, `BudgetAllocation`).
- **Comptabilité** : plan comptable (`ChartOfAccount`), journaux (`AccountingJournal`), écritures et lignes (`JournalEntry`, `JournalEntryLine`).
- **Comptes propriétaires** (`OwnerAccount`, `OwnerAccountTransaction`) et écran « Finances ».
- **Prestataires et contrats** (`ServiceProvider`, `MaintenanceContract`), **équipements des parties communes** (`CommonAreaAsset`).
- **Incidents de copropriété** (`SyndicateIncident`) avec imputation des coûts (`IncidentCostImputation`), lien vers la maintenance.
- **Documents de copropriété** (`SyndicateDocument`), **fonds** (`SyndicateFund`).

## 11. Portail propriétaire

Tableau de bord, mes biens et fiche bien, baux et détail de bail, revenus, paiements, échéances, dépôts de garantie, incidents, documents, rapports, préférences.

## 12. Portail locataire

Tableau de bord, mon bail, paiements (dont déclaration de règlement), dépôt de garantie, incidents / demandes de maintenance, documents.

## 13. Tableau de bord et pilotage

- Tableau de bord d'accueil orienté « poste de travail » (actions du jour, alertes, raccourcis) selon le rôle.
- Service de statistiques transverses.
- Tableaux de bord dédiés : CRM, patrimoine, portails propriétaire et locataire.

## 14. Paramétrage de l'agence

- Paramètres de l'agence (identité, coordonnées).
- Collaborateurs : liste, fiche, rôles, désactivation.
- Invitations : envoi et suivi.
- Modèles de documents et configurations de notification (voir §5 et §9).
- **Paramètres financiers** (`AgencyFinanceSettings`) : assujettissement et taux de TVA, numéro de contribuable (NCC), barème d'honoraires de gestion par défaut (taux ou forfait, assiette), numéros de comptes de la gestion locative (fonds propriétaires, honoraires, TVA collectée, écarts de caisse), bénéficiaire des pénalités de retard (propriétaire ou agence), retenue à la source sur loyers (activation, date de départ, taux particulier/société, compte).

## 15. Finance opérationnelle et chantiers

Module distinct de la gestion locative, pour les dépenses de l'agence, ses
fournisseurs et ses chantiers (routes `packages/api/src/routes/finance-*`,
écrans `apps/web/src/pages/finance`, `specs/016-finance-operationnelle`,
`specs/017-finance-fournisseurs-chantiers`, `specs/018-finance-budget-pilotage`,
`specs/019-finance-baux-terrain`, `docs/finance/PRD-gestion-financiere-chantiers.md`).

- **Caisse** : pièces de caisse (`CashVoucher`), brouillon jetable, duplication d'une pièce existante (`apps/web/src/utils/duplication-piece.ts`).
- **Sessions de caisse** (`CashSession`) : ouverture avec fonds de caisse, clôture avec montant attendu/compté, billetage (nombre de billets et pièces par coupure), écart et validation par le responsable (`7ba61a9`).
- **Trésorerie** (`TreasuryAccount`, `TreasuryTransfer`) : comptes caisse/banque/Mobile Money/chèques et cartes à encaisser, virements internes numérotés VIR-AAAA-NNNN (remise en banque, approvisionnement de caisse).
- **Fournisseurs** (`Supplier`) : fiche, compte de tiers, factures (`SupplierInvoice`, lignes `SupplierInvoiceLine`), règlements (`SupplierPayment`, allocation `SupplierPaymentAllocation`), balance fournisseurs.
- **Bons de commande** (`PurchaseOrder`, `PurchaseOrderLine`).
- **Chantiers** (`ConstructionSite`) : fiche, tableau de bord transverse, clôture (`finance-site-closing-routes.ts`), imputation des dépenses (`CostAllocation`, `CostCategory`).
- **Budgets de chantier** (`SiteBudget`, `SiteBudgetLine`) et avenants (`BudgetAmendment`, `BudgetAmendmentLine`) : écart budget/engagé/réalisé, alertes de dépassement (`SiteBudgetAlert`).
- **Avancement de chantier** (`SiteProgressEntry`) et lots (`SiteLot`).
- **Stock de matériaux** : référentiel (`StockItem`, `StockLocation`, `StockSettings`), soldes (`StockBalance`), mouvements (`StockMovement`), inventaire et rapprochement (`StockCount`, `StockCountLine`) — bascule d'un chantier au stock traçable et datée en jours, pas en instants.
- **Sous-traitants** (`Contractor`, `ContractorContract`) : situations d'avancement (`ProgressStatement`), règlements (`ContractorPayment`), retenues de garantie (`RetentionGuarantee`).
- **Salaires** (`Employee`, `SalaryNote`, `SalaryPayment`) : notes de salaire et paiements, hors calcul de paie/cotisations (explicitement hors périmètre, voir §18 « Non couvert à ce jour »).
- **Baux de terrain** (`LandLease`, `LandLeasePayment`, `LandLeaseAccrual`) : loyers versés à un bailleur de terrain, échéances courues.
- **Partenariats** (`Partnership`, `PartnershipShare`, `PartnershipDistribution`) : quotes-parts d'associés et répartitions.
- **Importation** : reprise de suivis Excel existants (écran `Importation.tsx`, menu dédié), sans modèle Prisma propre — passage direct par les pièces (`08a668f`).
- **Pièces annulées** (`VoidDocument`) : traçabilité des annulations, sans réécriture des pièces d'origine.

## 16. Comptabilité et trésorerie (agence)

Moteur comptable généralisé depuis le module Syndic (voir §10) à la gestion
locative et à la finance opérationnelle, conforme SYSCOHADA (`65ad2cd`).

- **Plan comptable** (`ChartOfAccount`) et **journaux** (`AccountingJournal`) portés par le tenant (`scope` syndicat ou agence).
- **Écritures** (`JournalEntry`, `JournalEntryLine`) en partie double, jamais de saisie libre : chaque écriture naît d'une pièce existante (échéance, paiement, pénalité, annulation).
- **Grand livre et balance**, exportables en CSV et Excel (`d265e9b`, écran `Comptabilite.tsx`).
- **Comptes de tiers mandants** (`ThirdPartyAccount`, `ThirdPartyMovement`) : un sous-compte 4731 par propriétaire, solde courant et relevé imprimable, alimenté uniquement par les pièces (jamais de saisie libre).
- **Comptes de trésorerie** (`TreasuryAccount`) : caisse (5711x), banque (5211x), Mobile Money (552x), chèques (513) et cartes (515) à encaisser — chaque encaissement/décaissement précise le compte touché.
- **Retenue à la source** (compte 4478) : voir §4 « Retenue à la source sur loyers ».
- **Écarts de caisse** : imputés aux comptes 6588 (charge) / 7588 (produit) par défaut, paramétrables.
- **Balances clients et fournisseurs** (`Balance clients`, `Balance âgée`, `Balance fournisseurs`) dans le menu Finance.

## 17. Technique

- Monorepo npm : `packages/api` (Express + Prisma) et `apps/web` (React + Vite + Ant Design + Tailwind).
- Tâches planifiées : calcul des pénalités, planificateur de campagnes, planificateur de relances.
- Déploiement conteneurisé (`docker-compose.yml`, `infra/`).
- Contrôle qualité : ESLint, Prettier, TypeScript, tests API et web, vérification de contraste d'accessibilité (`npm run a11y:contrast`).

## 18. Non couvert à ce jour

- **Mobile Money intégré avec rapprochement opérateur** : la saisie et la déclaration de paiement existent (§4), mais aucune intégration d'un opérateur (confirmation automatique, affectation directe au dossier) n'est présente dans le code.
- **SMS** : les notifications passent par e-mail et WhatsApp (§9) ; aucun envoi de SMS.
- **Documents de vente** : le mandat, l'offre et le compromis ne se génèrent pas encore en DOCX ; ventes du promoteur en VEFA (appels de fonds), séquestre tenu par l'agence et portail acquéreur hors du lot 9.
- **Mode hors ligne** : aucune installation locale ni synchronisation différée ; l'application suppose une connexion permanente.
- **Assistant IA** interrogeant les données de gestion : aucune fonctionnalité de ce type dans le code.
