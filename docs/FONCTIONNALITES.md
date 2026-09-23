# ImmoTopia — Liste des fonctionnalités

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
- **Paiements** (`RentalPayment`) : saisie, allocation d'un paiement sur une ou plusieurs échéances (`RentalPaymentAllocation`), fiche paiement.
- **Déclarations de paiement** (`RentalPaymentDeclaration`) : le locataire déclare un règlement, l'agence valide.
- **Remboursements** (`RentalRefund`).
- **Pénalités de retard** : règles paramétrables (`RentalPenaltyRule`), calcul automatique par tâche planifiée (`penalty-calculation-job`), consultation et ajustement manuel.
- **Dépôts de garantie** (`RentalSecurityDeposit`) : constitution, mouvements (retenues, restitutions).
- **Documents locatifs** (`RentalDocument`) : génération, consultation, modification.

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

## 15. Technique

- Monorepo npm : `packages/api` (Express + Prisma) et `apps/web` (React + Vite + Ant Design + Tailwind).
- Tâches planifiées : calcul des pénalités, planificateur de campagnes, planificateur de relances.
- Déploiement conteneurisé (`docker-compose.yml`, `infra/`).
- Contrôle qualité : ESLint, Prettier, TypeScript, tests API et web, vérification de contraste d'accessibilité (`npm run a11y:contrast`).
