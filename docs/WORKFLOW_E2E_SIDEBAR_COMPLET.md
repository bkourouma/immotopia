# Workflow E2E complet - ImmoTopia (menus sidebar)

## Objectif
Ce document couvre un parcours de test de bout en bout en suivant les menus de la sidebar, avec:
- les interfaces a ouvrir,
- les formulaires a remplir,
- des donnees de saisie proposees pour enregistrer.

## Perimetre sidebar couvert
1. Gestion
2. Proprietes
3. Patrimoine
4. Syndic
5. Clients
6. Transactions
7. Rapports
8. CRM
9. Gestion Locative
10. Maintenance
11. Communication

## Jeu de donnees transversal (a preparer une seule fois)
Utiliser ces donnees comme base pour tous les modules:

- Tenant test: `tenantId=<TENANT_ID>`
- Agence: `ImmoTopia Abidjan Plateau`
- Contact proprietaire CRM: `Awa Konan` (`awa.konan@example.ci`, `+225 0700000001`)
- Contact locataire CRM: `Yao N'Dri` (`yao.ndri@example.ci`, `+225 0700000002`)
- Contact acquereur CRM: `Kouassi Koffi` (`kouassi.koffi@example.ci`, `+225 0700000003`)
- Prestataire maintenance/syndic: `Plomberie Express CI`
- Devise standard: `XOF`

---

## 1) Gestion

### Interfaces
- `/tenant/:tenantId/collaborators`
- `/tenant/:tenantId/invitations`
- `/tenant/:tenantId/settings`
- `/tenant/:tenantId/invite` (depuis les ecrans de gestion)

### Formulaire - Parametres agence (`TenantSettings`)
- `name`: `ImmoTopia Abidjan Plateau`
- `legalName`: `ImmoTopia Gestion Immobiliere SARL`
- `contactEmail`: `contact@immotopia.ci`
- `contactPhone`: `+225 2720000000`
- `address`: `12 Avenue Chardy, Plateau`
- `city`: `Abidjan`
- `country`: `Cote d'Ivoire`
- `website`: `https://immotopia.ci`

### Formulaire - Invitation collaborateur (`InviteCollaborator`)
- `email`: `gestion.locative@immotopia.ci`
- `roleIds`: selectionner 1..n roles tenant (ex: gestion locative + CRM)

Resultat attendu: agence mise a jour + invitation visible dans la liste des invitations.

---

## 2) Proprietes

### Interfaces
- `/tenant/:tenantId/properties`
- `/tenant/:tenantId/properties/new`
- `/tenant/:tenantId/properties/:id/edit`
- `/tenant/:tenantId/properties/visits/calendar`

### Formulaire - Creation propriete (`PropertyForm`)
- **Type de bien** (`propertyType`): `APPARTEMENT`
- **Type de propriete** (`ownershipType`): `CLIENT`
- **Proprietaire** (`ownerUserId`): proprietaire existant
- **Titre du bien** (`title`): `Appartement 3 pieces - Riviera Golf`
- **Description** (`description`): `Appartement renove, proche commodites`
- **Statut** (`status`): `AVAILABLE`
- **Disponibilite** (`availability`): `SOON_AVAILABLE`
- **Date de disponibilite** (`availabilityDate`): `2026-04-01`
- **Localisation** (`location`): commune/zone cible
- **Adresse** (`address`): `Rue des Jardins, Cocody Riviera`
- **Surface principale** (`surfaceArea`): `95`
- **Nombre de pieces** (`rooms`): `3`
- **Nombre de chambres** (`bedrooms`): `2`
- **Nombre de salles de bain** (`bathrooms`): `2`
- **Etat d'ameublement** (`furnishingStatus`): `UNFURNISHED`
- **Type d'operation** (`transactionModes`): `RENTAL` (et/ou `SALE`)
- **Prix / loyer** (`price`): `850000`
- **Charges** (`fees`): `50000`
- **Devise** (`currency`): `XOF`
- **Mode de commission** (`commissionMode`): mode propose par le formulaire
- **Montant de commission** (`commissionAmount`): `50000`

### Formulaire - Planifier une visite (`PropertyVisitScheduler`)
- **Contact CRM** (`contactId`): contact CRM interesse
- **Affaire CRM liee** (`dealId`): affaire CRM liee (optionnel)
- **Objectif** (`goal`): `VISIT`/objectif equivalent du select (ex: `EVALUATION`)
- **Date de visite** (`scheduledDate`): `2026-03-20`
- **Heure de visite** (`scheduledTime`): `10:30`
- **Duree (minutes)** (`duration`): `60`
- **Lieu de visite** (`location`): `Sur site - entree principale`
- **Commercial assigne** (`assignedToUserId`): collaborateur commercial
- **Collaborateurs participants** (`collaboratorIds`): 1 a 2 collaborateurs
- **Notes** (`notes`): `Client souhaite comparer avec 2 biens similaires`

Resultat attendu: propriete creee + visite visible dans le calendrier des visites.

---

## 3) Patrimoine

### Interfaces
- `/tenant/:tenantId/patrimoine`
- `/tenant/:tenantId/patrimoine/performance`
- `/tenant/:tenantId/patrimoine/work-programs`
- `/tenant/:tenantId/patrimoine/statements`
- `/tenant/:tenantId/properties/:id` (onglet `Patrimoine`)

### Formulaire - Simulation performance (`YieldCalculator`)
- `years`: `10`
- `valueGrowthRate`: `0.03`
- `rentGrowthRate`: `0.02`
- `expenseGrowthRate`: `0.025`
- `vacancyRate`: `0.05`

### Formulaire - Generer releve de gerance (`OwnerStatementGenerator`)
- `ownerContactId`: contact proprietaire CRM
- `period`: `2026-03`
- `propertyIds`: selectionner le/les biens du proprietaire

### Formulaires - Onglet patrimoine du bien (`PropertyPatrimoineTab`)
- Valorisation: `valuatedAt`, `estimatedValue`, `currency`, `acquisitionCost`, `acquisitionDate`, `method`, `notes`
  Exemple: `2026-03-10`, `47000000`, `XOF`, `38000000`, `2023-01-15`, `Estimation marche`, `Revision annuelle`
- Depense: `category`, `label`, `amount`, `currency`, `paidAt`, `isCapitalized`, `receiptUrl`, `notes`
  Exemple: `COPRO`, `Charges T1`, `130000`, `XOF`, `2026-03-01`, `false`, URL facture
- Credit: `lender`, `capitalAmount`, `remainingCapital`, `interestRate`, `monthlyPayment`, `currency`, `startDate`, `endDate`, `status`
- Travaux: `title`, `description`, `estimatedCost`, `actualCost`, `currency`, `plannedDate`, `completedDate`, `status`, `isCapitalized`
- Document: `title`, `type`, `file`, `expiresAt`, `ownerContactId`

Resultat attendu: indicateurs patrimoine et historique mis a jour apres chaque enregistrement.

---

## 4) Syndic

### Interfaces
- `/tenant/:tenantId/syndics`
- `/tenant/:tenantId/syndics/:syndicId`
- `/lots`, `/charges`, `/assemblees`, `/assemblees/:meetingId`, `/prestataires`, `/documents`, `/finances`, `/recouvrement`, `/comptabilite`, `/budgets`, `/profils-incidents`, `/lots/:lotId/compte`

### Formulaire - Creer copropriete (`SyndicsList`)
- `name`: `Residence Les Jardins de Cocody`
- `address`: `Rue des Palmiers, Cocody`
- `cadastralReference`: `CI-ABJ-2026-CP-001`

### Formulaire - Lot (`SyndicLots`)
- `lotNumber`: `A-101`
- `lotType`: `APARTMENT`
- `generalShares`: `120`
- `specialShares`: `20`
- `propertyId`: bien lie (optionnel)
- `ownerContactId`: contact proprietaire CRM
- `ownerSince`: `2025-01-01`

### Formulaire - Affecter locataire lot (`SyndicLots`)
- `tenantId`: contact locataire CRM
- `startDate`: `2026-03-01`
- `endDate`: `2027-02-28` (optionnel)
- `leaseId`: reference bail (optionnel)
- `notes`: `Affectation initiale`

### Formulaire - Appel de charges (`SyndicCharges`)
- `targetMode`: lot / lots / all
- `lotId` ou `lotIds`
- `periodStart`: `2026-03-01`
- `periodEnd`: `2026-03-31`
- `amount`: `75000`
- `currency`: `XOF`
- `dueDate`: `2026-03-31`
- `isRecurring`: `true`
- `recurrenceFrequency`: `MONTHLY`
- `recurrenceCount`: `3`

### Formulaire - Assemblee generale (`SyndicMeetings`)
- `type`: `ORDINARY`
- `scheduledAt`: `2026-04-15T09:00`
- `startTime`: `09:00`
- `endTime`: `12:00`
- `location`: `Salle polyvalente residence`

### Formulaire - Resolution et ordre du jour (`SyndicMeetingDetail`)
- Resolution: `title`, `description`, `majorityRule`
- Agenda: `title`, `orderIndex`, `discussionsText`

### Formulaire - Contrat prestataire (`SyndicProviders`)
- `providerId`: prestataire existant
- `nature`: `Entretien plomberie immeuble`
- `startDate`: `2026-04-01`
- `endDate`: `2027-03-31`
- `annualAmount`: `1200000`
- `currency`: `XOF`
- `renewalAlertDays`: `30`

### Formulaire - Document syndic (`SyndicDocuments`)
- `title`: `Reglement de copropriete 2026`
- `type`: `REGULATION`
- `file`: PDF
- `expiresAt`: `2028-12-31` (optionnel)

### Formulaires - Recouvrement (`SyndicRecovery`)
- Rappel: `chargeCallId`, `reminderLevel`, `channel`
- Penalite: `chargeCallId`, `penaltyRate`, `daysLate`
- Echelonnement: `chargeCallId`, `totalAmount`, `agreedAt`, `instalments[] (dueDate, amount)`
- Remise: `waivedReason`

### Formulaires - Comptabilite (`SyndicAccounting`)
- Compte comptable: `accountNumber`, `accountClass`, `accountName`, `accountType`
- Journal: `code`, `fiscalYear`, `label`, `journalType`
- Ecriture: `journalId`, `entryDate`, `reference`, `sourceType`, `description`, `lines[] (accountId, debit, credit, label)`

### Formulaires - Budgets (`SyndicBudgets`)
- Budget: `fiscalYear`, `label`, `totalAmount`, `category`, `description`, `distributionKey`, `currency`
- Batch genere: `label`, `period`, `dueDate`, `batchType`, `currency`
- Batch manuel: `label`, `period`, `dueDate`, `totalAmount`, `batchType`, `currency`

### Formulaires - Profils & incidents (`SyndicProfilesIncidents`)
- Profil proprietaire: `lotId`, `contactId`, `ownershipPercentage`, `ownedSince`, `portalAccessEnabled`
- Profil locataire: `lotId`, `contactId`, `tenantSince`, `chargesBilledToTenant`
- Incident: `reportedByContactId`, `lotId`, `incidentType`, `urgency`, `description`
- Imputation: `imputationType`, `amount`, `currency`, `lotId`, `notes`

### Formulaire - Ajustement compte proprietaire (`SyndicOwnerAccount`)
- `direction`, `amount`, `label`, `reference`

Resultat attendu: donnees syndics persistantes et visibles dans tableaux/indicateurs associes.

---

## 5) Clients

### Interfaces
- `/clients`
- `/clients/groups`

### Formulaire - Groupe client (`ClientGroups`)
- `name`: `Investisseurs Premium`
- `color`: `#3B82F6`

Note: la creation d'un client se fait via `CRM > Nouveau contact`.

---

## 6) Transactions

### Interfaces
- `/transactions`
- `/transactions/sales`
- `/transactions/rentals`

Aucun formulaire de sauvegarde direct sur cet ecran.
Ce module redirige vers:
- Deals CRM (ventes)
- Baux gestion locative (locations)

---

## 7) Rapports

### Interface
- `/reports`

Aucun formulaire de sauvegarde direct.
Page de navigation vers les rapports CRM, locatifs et proprietes.

---

## 8) CRM

### Interfaces
- `/tenant/:tenantId/crm/dashboard`
- `/tenant/:tenantId/crm/calendar`
- `/tenant/:tenantId/crm/contacts`
- `/tenant/:tenantId/crm/contacts/new`
- `/tenant/:tenantId/crm/deals`
- `/tenant/:tenantId/crm/deals/new`
- `/tenant/:tenantId/crm/activities`

### Formulaire - Contact (`ContactForm`)
Champs principaux recommandes:
- `contactType`: `PERSON`
- `firstName`: `Awa`
- `lastName`: `Konan`
- `email`: `awa.konan@example.ci`
- `phonePrimaryCountryCode`: `+225`
- `phonePrimary`: `0700000001`
- `phonePrimaryIsWhatsApp`: `true`
- `address`: `Cocody Riviera`
- `communeId`: commune valide
- `preferredContactChannel`: `WHATSAPP`
- `leadSource`: `REFERRAL`
- `maturityLevel`: `WARM`
- `score`: `75`
- `priorityLevel`: `HIGH`
- `consentMarketing`: `true`
- `consentWhatsapp`: `true`
- `consentEmail`: `true`
- `consentSource`: `Formulaire agence`

### Formulaire - Affaire (`DealForm`)
Champs principaux (selon type de bien):
- `contactId`: contact CRM cree
- `type`: `ACHAT` (ou `LOCATION`/`VENTE`/`GESTION`/`MANDAT`)
- `budgetMin`: `35000000`
- `budgetMax`: `50000000`
- `locationZone`: `Cocody`
- `expectedValue`: `42000000`
- `propertyType`: `APPARTEMENT`
- `rooms`: `3`
- `surface`: `95`
- `furnishingStatus`: `UNFURNISHED`
- `description`: `Recherche residence principale`

### Formulaire - Activite (`ActivityForm`)
- `contactId`: contact CRM
- `dealId`: affaire liee (optionnel)
- `activityType`: `CALL`
- `direction`: `OUT`
- `subject`: `Qualification besoin`
- `content`: `Appel de qualification effectue`
- `outcome`: `Visite planifiee`
- `occurredAt`: date/heure courante
- `nextActionAt`: `2026-03-18T10:00`
- `nextActionType`: `FOLLOW_UP_CALL`

Resultat attendu: contact + affaire + activite relies entre eux et visibles dans dashboard CRM.

---

## 9) Gestion Locative

### Interfaces
- `/tenant/:tenantId/rental/leases`
- `/tenant/:tenantId/rental/leases/new`
- `/tenant/:tenantId/rental/installments`
- `/tenant/:tenantId/rental/payments`
- `/tenant/:tenantId/documents/templates`

### Formulaire - Bail (`LeaseFormWizard`/`LeaseForm`)
- `propertyId`: bien locatif
- `primaryRenterContactId` (ou client): locataire CRM
- `ownerContactId` (ou client): proprietaire CRM
- `startDate`: `2026-04-01`
- `endDate`: `2027-03-31`
- `billingFrequency`: `MONTHLY`
- `dueDayOfMonth`: `5`
- `currency`: `XOF`
- `rentAmount`: `450000`
- `serviceChargeAmount`: `50000`
- `securityDepositAmount`: `900000`
- `penaltyGraceDays`: `5`
- `penaltyMode`: `PERCENT_OF_BALANCE`
- `penaltyRate`: `5`
- `notes`: `Bail habitation standard`

### Formulaire - Paiement (`PaymentForm`)
- `method`: `MOBILE_MONEY`
- `amount`: `500000`
- `currency`: `XOF`
- `mmOperator`: operateur valide
- `mmPhone`: `0700000002`
- `pspName`: `CinetPay` (optionnel)
- `pspTransactionId`: `TXN-IMMO-20260315-001` (optionnel)
- `pspReference`: `REF-500000-01` (optionnel)

### Formulaire - Allocation paiement (`AllocatePaymentForm`)
- `installmentIds`: selectionner echeances dues
- `amounts`: montant par echeance (ou vide pour auto)

### Formulaire - Mouvement depot (`DepositMovementForm`)
- `type`: `COLLECT` (ou `RELEASE/REFUND/FORFEIT/ADJUSTMENT`)
- `paymentId`: paiement associe (si besoin)
- `amount`: `900000`
- `note`: `Depot initial collecte`

### Formulaire - Generation document (`DocumentForm`)
- `type`: `LEASE_CONTRACT`
- `title`: `Bail Awa Konan - 2026`
- `templateId`: template actif (optionnel)
- `description`: `Generation initiale du contrat`

Resultat attendu: bail actif, echeances generees, paiements alloues, depot alimente, documents telechargeables.

---

## 10) Maintenance

### Interfaces
- `/tenant/:tenantId/maintenance`
- `/tenant/:tenantId/maintenance/new`
- `/tenant/:tenantId/admin/maintenance/tickets`
- `/tenant/:tenantId/admin/maintenance/vendors`

### Formulaire - Nouveau ticket (`CreateTicket`)
- `propertyId`: bien concerne
- `leaseId`: bail lie (optionnel)
- `title`: `Fuite sous evier cuisine`
- `category`: `PLUMBING`
- `priority`: `HIGH`
- `description`: `Fuite continue depuis hier soir`
- `locationDetails`: `Cuisine, sous evier`
- `attachments`: photo/pdf (optionnel)

### Formulaire - Edition ticket (`EditTicket`)
- memes champs que creation, avec correction des informations

### Formulaire - Traitement manager (`admin/maintenance/TicketDetail`)
- `status`: `ASSIGNED` puis `IN_PROGRESS` puis `RESOLVED`
- `priority`: ajuster si necessaire
- `assignedVendorId`: prestataire cible
- `resolutionNotes`: `Joint remplace, test OK`

### Formulaire - Prestataire (`admin/maintenance/Vendors`)
- `name`: `Plomberie Express CI`
- `phone`: `+225 0700000099`
- `email`: `contact@plomberie-express.ci`
- `address`: `Cocody Angre 8e tranche`
- `specialties`: `Plomberie, Urgence`
- `isActive`: `true`

Resultat attendu: ticket cree par tenant, assigne par manager, resolu avec historique et commentaires.

---

## 11) Communication

### Interfaces
- `/tenant/:tenantId/communication/email-notifications`
- `/tenant/:tenantId/communication/whatsapp-notifications`
- `/tenant/:tenantId/communication/whatsapp-test-send`
- `/tenant/:tenantId/newsletter/lists`
- `/tenant/:tenantId/newsletter/campaigns`
- `/tenant/:tenantId/newsletter/templates`

### Formulaire - Template notification email (`EmailNotificationsUnifiedPage`)
- `subjectOverride`: `Nouveau ticket maintenance - {{ticketTitle}}`
- `bodyHtmlOverride`: HTML avec variables (ex: `{{contactName}}`, `{{ticketTitle}}`)
- activer/desactiver l'evenement via switch

### Formulaire - Template notification WhatsApp (`WhatsAppNotificationsPage`)
- `bodyOverride`: `Bonjour {{tenantName}}, votre ticket {{ticketTitle}} est pris en charge.`
- `contentSid`: `HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (optionnel Twilio)
- `contentVariablesJson`: `{"1":"ticketTitle","2":"ticketStatus"}`
- activer/desactiver l'evenement via switch

### Formulaire - Test envoi WhatsApp (`WhatsAppTestSendPage`)
- `to`: `+2250700000002`
- `message`: `Test ImmoTopia: notification WhatsApp OK`

### Formulaires - Newsletter
- Liste (`NewsletterListsPage`): `name`, `type`, `doubleOptIn`
  Exemple: `Newsletter investisseurs`, `MANUAL`, `true`
- Template (`NewsletterTemplatesPage`): `name`, `html`
  Exemple: `Template mensuel`, HTML avec `{{lien_desinscription}}`
- Campagne (`CampaignForm`): `listId`, `templateId`, `subject`, `bodyHtml`
  Exemple sujet: `Nouveaux biens - Mars 2026`

Resultat attendu: notifications personnalisees enregistrees + campagne newsletter creee/planifiee/envoyee.

---

## Ordre recommande de test bout en bout
1. Gestion: parametres + invitation collaborateur.
2. CRM: creer proprietaire/locataire + affaire + activite.
3. Proprietes: creer bien + planifier visite.
4. Gestion Locative: creer bail + paiement + allocation + depot + document.
5. Maintenance: creer ticket + traitement manager + prestataire.
6. Patrimoine: enrichir donnees financieres + simulation + releve.
7. Syndic: creer copropriete + lots + charges + AG + recouvrement/comptabilite/budgets.
8. Clients: creer groupe et verifier affectations.
9. Communication: templates email/WhatsApp + test envoi + newsletter.
10. Transactions/Rapports: verifier les redirections et la coherence globale.

## Criteres de validation finaux
- Chaque formulaire enregistre sans erreur backend.
- Les objets crees sont visibles dans les listes liees.
- Les liens inter-modules sont coherents (contact -> deal -> visite -> bail -> paiement -> notification).
- Les filtres/statuts reflètent correctement les transitions metier.
