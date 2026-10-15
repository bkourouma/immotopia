# Catalogue des balises des modèles DOCX standard

Huit modèles standard sont livrés dans `assets/modeles_standard/`. Ils partagent
la même charte : bandeau d'en-tête (logo de l'émetteur à gauche, identité au
centre, logo et nom de la copropriété à droite), filet, titre, tableau de
références, pied de page « émetteur · RCCM · NCC · Page X / Y ».

| Fichier                                | Document                     | Branché                                                                 |
| -------------------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| `bail_habitation.docx`                 | Contrat de bail d'habitation | Type `LEASE_HABITATION` (par défaut, voir ci-dessous)                   |
| `bail_commercial.docx`                 | Contrat de bail commercial   | Type `LEASE_COMMERCIAL`                                                 |
| `recu_loyer.docx`                      | Reçu de loyer                | Type `RENT_RECEIPT`                                                     |
| `releve_locatif.docx`                  | Relevé de compte locatif     | Type `RENT_STATEMENT`                                                   |
| `compte_rendu_assemblee_generale.docx` | Compte rendu d'AG            | Oui : `buildMeetingMinutesDocx`, repli quand l'agence n'a pas de modèle |
| `avis_appel_charges.docx`              | Avis d'appel de charges      | Oui : `GET .../charges/:chargeId/avis.docx`                             |
| `quittance_charges.docx`               | Quittance de charges         | Oui : `GET .../quittances/:receiptId/fichier.docx`                      |
| `convocation_assemblee_generale.docx`  | Convocation à l'AG           | Oui : `GET .../assemblees/:meetingId/lots/:lotId/convocation.docx`      |

Syntaxe : `{{BALISE}}` (docxtemplater, délimiteurs `{{ }}`). Une section répétée
s'écrit `{{#LISTE}} … {{/LISTE}}` ; son contraire `{{^LISTE}} … {{/LISTE}}` ne
s'affiche que si la liste est vide. Dans un tableau, l'ouverture va dans la
première cellule de la ligne et la fermeture dans la dernière.

Régénération : `cd packages/api && npx ts-node scripts/build-standard-docx-templates.ts`
(contenu dans `src/lib/documents/docx-standard-content.ts`). La construction est
déterministe.

## Logos

| Balise                 | Signification                                               | Source                                     |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| `{{LOGO_EMETTEUR}}`    | Logo de l'émetteur (mandant, sinon agence), inséré en image | `resolveDocumentBranding().issuerLogo`     |
| `{{LOGO_COPROPRIETE}}` | Logo de la copropriété, inséré en image                     | `resolveDocumentBranding().syndicate.logo` |

Le marqueur est remplacé APRÈS le rendu par un dessin inline (hauteur max 2,5 cm,
largeur max 4 cm, proportions conservées) ; sans image il disparaît. Il peut être
posé dans l'en-tête, le pied ou le corps, y compris dans un modèle personnalisé
d'agence. Aucune dépendance image n'est utilisée (injection via `pizzip`).

## Balises communes (tous les modèles DOCX)

Fournies par `buildCommonDocumentContext` (`src/lib/documents/docx-branding.ts`).
Une valeur absente reste vide dans le document (jamais le nom de la balise).

| Balise                                 | Signification                                               | Source                                                                                                        | Exemple                                    |
| -------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `{{EMETTEUR_NOM}}`                     | Nom de l'émetteur (mandant de la copropriété, sinon agence) | `branding.issuer.name`                                                                                        | Cabinet Horizon                            |
| `{{EMETTEUR_RAISON_SOCIALE}}`          | Raison sociale (sinon le nom)                               | `branding.issuer.legalName`                                                                                   | Horizon Gestion SARL                       |
| `{{EMETTEUR_ADRESSE}}`                 | Adresse                                                     | `branding.issuer.address`                                                                                     | Cocody, Abidjan                            |
| `{{EMETTEUR_TELEPHONE}}`               | Téléphone                                                   | `branding.issuer.phone`                                                                                       | +225 27 00 00 00                           |
| `{{EMETTEUR_EMAIL}}`                   | E-mail                                                      | `branding.issuer.email`                                                                                       | contact@horizon.ci                         |
| `{{EMETTEUR_RCCM}}`                    | N° RCCM                                                     | `branding.issuer.rccm`                                                                                        | CI-ABJ-2020-B-1234                         |
| `{{EMETTEUR_NCC}}`                     | N° de compte contribuable                                   | `branding.issuer.taxId`                                                                                       | 2012345A                                   |
| `{{EMETTEUR_CONTACT}}`                 | « Tél. … · e-mail » (éléments présents seulement)           | Calculée                                                                                                      | Tél. +225 27 00 00 00 · contact@horizon.ci |
| `{{EMETTEUR_MENTIONS_LEGALES}}`        | « RCCM … · NCC … » (éléments présents seulement)            | Calculée                                                                                                      | RCCM CI-ABJ-2020-B-1234 · NCC 2012345A     |
| `{{EMETTEUR_PIED_DE_PAGE}}`            | Nom, RCCM et NCC pour le pied de page                       | Calculée                                                                                                      | Cabinet Horizon · RCCM CI-ABJ-2020-B-1234  |
| `{{COPROPRIETE_NOM}}`                  | Nom de la copropriété (vide hors syndic)                    | `branding.syndicate.name`                                                                                     | Résidence Les Flamboyants                  |
| `{{COPROPRIETE_ADRESSE}}`              | Adresse de la copropriété                                   | `branding.syndicate.address`                                                                                  | Riviera 3, Abidjan                         |
| `{{COPROPRIETE_IMMATRICULATION}}`      | N° d'immatriculation                                        | `branding.syndicate.registrationNo`                                                                           | IMM-2019-0042                              |
| `{{COPROPRIETE_REFERENCE_CADASTRALE}}` | Référence cadastrale                                        | `branding.syndicate.cadastralReference`                                                                       | TF 1234/CI                                 |
| `{{COPROPRIETE_REFERENCES}}`           | « Immatriculation … · Réf. cadastrale … »                   | Calculée                                                                                                      | Immatriculation IMM-2019-0042              |
| `{{DATE_EMISSION_DOCUMENT}}`           | Date d'émission du document                                 | Date du jour (JJ/MM/AAAA)                                                                                     | 30/09/2026                                 |
| `{{REFERENCE_DOCUMENT}}`               | Numéro ou référence du document                             | Bail : `BAIL_NUMERO` ; reçu : `RECU_NUMERO` (numéro définitif) ; relevé : `RELEVE_REFERENCE` ; AG : `AG-<id>` | BAIL-2026-0012                             |

Pour les documents locatifs, l'émetteur est l'agence (aucune copropriété) : les
balises `COPROPRIETE_*` sont vides et `{{LOGO_COPROPRIETE}}` disparaît.

## Contrat de bail d'habitation (`bail_habitation.docx`)

Source : `buildLeaseHabitationContext` (`src/services/document-context-builder.ts`).

| Balise                      | Signification                     | Source                             | Exemple                      |
| --------------------------- | --------------------------------- | ---------------------------------- | ---------------------------- |
| `{{BAILLEUR_NOM}}`          | Nom ou raison sociale du bailleur | Propriétaire du bien, sinon agence | Moussa Traoré                |
| `{{BAILLEUR_ADRESSE}}`      | Adresse du bailleur               | Contact CRM / agence               | Cocody, Abidjan              |
| `{{BAILLEUR_TELEPHONE}}`    | Téléphone du bailleur             | Contact CRM / agence               | +225 07 00 00 00             |
| `{{BAILLEUR_EMAIL}}`        | E-mail du bailleur                | Utilisateur / contact              | bailleur@exemple.ci          |
| `{{LOCATAIRE_NOM}}`         | Nom et prénom du preneur          | Locataire principal du bail        | Awa Koné                     |
| `{{LOCATAIRE_ADRESSE}}`     | Adresse du preneur                | Contact CRM                        | Marcory, Abidjan             |
| `{{LOCATAIRE_TELEPHONE}}`   | Téléphone du preneur              | Contact CRM                        | +225 07 11 22 33             |
| `{{LOCATAIRE_EMAIL}}`       | E-mail du preneur                 | Utilisateur / contact              | awa@exemple.ci               |
| `{{LOCATAIRE_PIECE_ID}}`    | Pièce d'identité du preneur       | Contact CRM                        | CNI n° C0012345678           |
| `{{TYPE_BIEN}}`             | Type de bien                      | Bien du bail                       | Appartement                  |
| `{{ADRESSE_BIEN}}`          | Adresse complète du bien          | Bien du bail                       | 12 rue des Palmiers, Cocody  |
| `{{DESCRIPTION_BIEN}}`      | Description du bien               | Bien du bail                       | Villa 4 pièces               |
| `{{SUPERFICIE}}`            | Superficie (m²)                   | Bien du bail                       | 120                          |
| `{{EQUIPEMENTS}}`           | Équipements et annexes            | Bien du bail                       | Climatisation, parking       |
| `{{DUREE_BAIL}}`            | Durée du bail                     | Dates du bail                      | 12 mois                      |
| `{{DATE_DEBUT_BAIL}}`       | Date d'effet                      | Bail                               | 01/07/2026                   |
| `{{DATE_FIN_BAIL}}`         | Date de fin                       | Bail                               | 30/06/2027                   |
| `{{LOYER_MENSUEL}}`         | Loyer mensuel (sans devise)       | Bail                               | 120 000                      |
| `{{CHARGES_MENSUELLES}}`    | Charges mensuelles (sans devise)  | Bail                               | 15 000                       |
| `{{DEVISE}}`                | Devise                            | Bail                               | FCFA                         |
| `{{JOUR_ECHEANCE}}`         | Jour d'échéance du loyer          | Bail                               | 5                            |
| `{{DEPOT_GARANTIE}}`        | Dépôt de garantie (sans devise)   | Bail                               | 240 000                      |
| `{{DELAI_GRACE}}`           | Délai de grâce (jours)            | Bail                               | 5                            |
| `{{CLAUSE_PENALITE}}`       | Clause de pénalité de retard      | Bail                               | une pénalité de 2 % par mois |
| `{{PREAVIS_PRENEUR}}`       | Préavis du preneur                | Valeur par défaut                  | trois (3) mois               |
| `{{CLAUSES_PARTICULIERES}}` | Clauses particulières             | Notes du bail                      | —                            |
| `{{LIEU_SIGNATURE}}`        | Lieu de signature                 | Ville de l'agence                  | Abidjan                      |
| `{{DATE_SIGNATURE}}`        | Date de signature                 | Création du bail                   | 30/06/2026                   |

## Contrat de bail commercial (`bail_commercial.docx`)

Mêmes balises que le bail d'habitation, hors `LOCATAIRE_PIECE_ID`, plus :

| Balise                          | Signification                 | Source                        | Exemple                          |
| ------------------------------- | ----------------------------- | ----------------------------- | -------------------------------- |
| `{{BAILLEUR_FORME_JURIDIQUE}}`  | Forme juridique du bailleur   | Contact CRM                   | SARL                             |
| `{{BAILLEUR_REPRESENTANT}}`     | Représentant du bailleur      | Contact CRM                   | M. Diallo (Gérant)               |
| `{{LOCATAIRE_FORME_JURIDIQUE}}` | Forme juridique du preneur    | Contact CRM                   | SARL                             |
| `{{LOCATAIRE_RCCM}}`            | RCCM du preneur               | Contact CRM                   | CI-ABJ-2021-B-5678               |
| `{{LOCATAIRE_REPRESENTANT}}`    | Représentant du preneur       | Contact CRM                   | Mme Koné (Directrice)            |
| `{{ACTIVITE_COMMERCIALE}}`      | Activité exercée              | Secteur d'activité du contact | Restauration                     |
| `{{DETAIL_CHARGES}}`            | Détail des charges            | Bail                          | les charges de service convenues |
| `{{PAS_DE_PORTE}}`              | Droit d'entrée (pas-de-porte) | À compléter à la main         | —                                |

## Reçu de loyer (`recu_loyer.docx`)

Source : `buildRentReceiptContext`.

| Balise                    | Signification          | Source                        | Exemple             |
| ------------------------- | ---------------------- | ----------------------------- | ------------------- |
| `{{RECU_NUMERO}}`         | N° de reçu             | Numéro définitif de quittance | RCU-202606-0007     |
| `{{DATE_EMISSION}}`       | Date du reçu           | Date du jour                  | 08/06/2026          |
| `{{LIEU_EMISSION}}`       | Lieu d'émission        | Ville de l'agence             | Abidjan             |
| `{{LOCATAIRE_NOM}}`       | Locataire              | Paiement / bail               | Awa Koné            |
| `{{LOCATAIRE_TELEPHONE}}` | Téléphone du locataire | Contact                       | +225 07 11 22 33    |
| `{{BAILLEUR_NOM}}`        | Bailleur               | Propriétaire, sinon agence    | Moussa Traoré       |
| `{{BAILLEUR_TELEPHONE}}`  | Téléphone du bailleur  | Contact                       | +225 07 00 00 00    |
| `{{BAILLEUR_EMAIL}}`      | E-mail du bailleur     | Contact                       | bailleur@exemple.ci |
| `{{PERIODE_LOYER}}`       | Période couverte       | Échéances payées              | juin 2026           |
| `{{DEVISE}}`              | Devise                 | Paiement                      | FCFA                |
| `{{MONTANT_LOYER}}`       | Part loyer             | Ventilation du paiement       | 120 000             |
| `{{MONTANT_CHARGES}}`     | Part charges           | Ventilation du paiement       | 15 000              |
| `{{MONTANT_PENALITES}}`   | Part pénalités         | Ventilation du paiement       | 0                   |
| `{{MONTANT_TOTAL}}`       | Total payé             | Paiement                      | 135 000             |
| `{{TYPE_BIEN}}`           | Type de bien           | Bien du bail                  | Maison / Villa      |
| `{{ADRESSE_BIEN}}`        | Adresse du bien        | Bien du bail                  | 12 rue des Palmiers |
| `{{BAIL_REFERENCE}}`      | Référence du bail      | Bail                          | BAIL-2026-001       |
| `{{MODE_PAIEMENT}}`       | Mode de paiement       | Paiement                      | Virement bancaire   |
| `{{REFERENCE_PAIEMENT}}`  | Référence du paiement  | Paiement                      | TRX-889             |
| `{{DATE_PAIEMENT}}`       | Date du paiement       | Paiement                      | 08/06/2026          |

## Relevé de compte locatif (`releve_locatif.docx`)

Source : `buildRentStatementContext`. Balises du bailleur, du locataire, du bien
et du bail : voir le reçu de loyer (`BAILLEUR_*`, `LOCATAIRE_NOM`,
`LOCATAIRE_TELEPHONE`, `TYPE_BIEN`, `ADRESSE_BIEN`, `BAIL_REFERENCE`, `DEVISE`).

| Balise                 | Signification                 | Source                  | Exemple                  |
| ---------------------- | ----------------------------- | ----------------------- | ------------------------ |
| `{{RELEVE_REFERENCE}}` | Référence du relevé           | Bail + mois de début    | RLV-BAIL-2026-001-202604 |
| `{{PERIODE_DEBUT}}`    | Début de la période           | Paramètre de la demande | 01/04/2026               |
| `{{PERIODE_FIN}}`      | Fin de la période             | Paramètre de la demande | 30/06/2026               |
| `{{DATE_EDITION}}`     | Date d'édition                | Date du jour            | 01/07/2026               |
| `{{LIEU_EDITION}}`     | Lieu d'édition                | Ville de l'agence       | Abidjan                  |
| `{{SOLDE_INITIAL}}`    | Solde au début de la période  | Échéances antérieures   | 20 000 FCFA              |
| `{{TOTAL_LOYERS}}`     | Loyers facturés               | Échéances de la période | 360 000 FCFA             |
| `{{TOTAL_CHARGES}}`    | Charges facturées             | Échéances de la période | 45 000 FCFA              |
| `{{TOTAL_PENALITES}}`  | Pénalités                     | Échéances de la période | 0 FCFA                   |
| `{{TOTAL_PAIEMENTS}}`  | Paiements reçus               | Échéances de la période | 370 000 FCFA             |
| `{{SOLDE_FINAL}}`      | Solde en fin de période       | Calculé                 | 55 000 FCFA              |
| `{{OP_DATE_n}}`        | Date de l'opération n (1 à 3) | Échéances regroupées    | Échéance avril 2026      |
| `{{OP_LIBELLE_n}}`     | Libellé de l'opération n      | Idem                    | Loyer + charges          |
| `{{OP_DEBIT_n}}`       | Débit de l'opération n        | Idem                    | 135 000 FCFA             |
| `{{OP_CREDIT_n}}`      | Crédit de l'opération n       | Idem                    | 135 000 FCFA             |
| `{{OP_SOLDE_n}}`       | Solde après l'opération n     | Calculé                 | 20 000 FCFA              |
| `{{OBSERVATIONS}}`     | Observations                  | Calculées               | —                        |

## Compte rendu d'assemblée générale (`compte_rendu_assemblee_generale.docx`)

Source : `buildTemplateContext` (`src/lib/syndics/minutes-generator.ts`). Ordre de
résolution : modèle `compte-rendu-TEMPLATE.docx` de l'agence, sinon ce modèle
standard, sinon (échec) le texte brut de secours.

| Balise                                               | Signification                                 | Source                     | Exemple                             |
| ---------------------------------------------------- | --------------------------------------------- | -------------------------- | ----------------------------------- |
| `{{SYNDICATE_NAME}}`                                 | Nom de la copropriété                         | Copropriété de l'assemblée | Résidence Les Flamboyants           |
| `{{SYNDICATE_ADDRESS}}`                              | Adresse de la copropriété                     | Copropriété                | Riviera 3, Abidjan                  |
| `{{MEETING_TYPE}}`                                   | Type d'assemblée (libellé)                    | Assemblée                  | Ordinaire                           |
| `{{MEETING_DATE}}`                                   | Date                                          | Assemblée                  | 10/03/2026                          |
| `{{MEETING_START_TIME}}`                             | Heure de début                                | Assemblée                  | 09:00                               |
| `{{MEETING_END_TIME}}`                               | Heure de fin                                  | Assemblée                  | 11:30                               |
| `{{MEETING_LOCATION}}`                               | Lieu                                          | Assemblée                  | Salle polyvalente                   |
| `{{MEETING_QUORUM}}`                                 | Quorum                                        | Assemblée                  | 60%                                 |
| `{{#AGENDA_ITEMS}}` … `{{/AGENDA_ITEMS}}`            | Boucle des points d'ordre du jour             | Ordre du jour              |                                     |
| `{{AGENDA_INDEX}}`                                   | N° du point (dans la boucle)                  | Ordre du jour              | 1                                   |
| `{{AGENDA_TITLE}}`                                   | Titre du point                                | Ordre du jour              | Approbation des comptes             |
| `{{AGENDA_DISCUSSION}}`                              | Discussions du point                          | Ordre du jour              | 1. Comptes présentés                |
| `{{AGENDA_ITEMS_WITH_DISCUSSIONS}}`                  | Ordre du jour et discussions en un seul texte | Calculée                   |                                     |
| `{{#RESOLUTIONS}}` … `{{/RESOLUTIONS}}`              | Boucle des résolutions                        | Résolutions                |                                     |
| `{{RESOLUTION_INDEX}}`                               | N° de la résolution                           | Résolutions                | 1                                   |
| `{{RESOLUTION_TITLE}}`                               | Titre                                         | Résolutions                | Budget prévisionnel                 |
| `{{RESOLUTION_DESCRIPTION}}`                         | Description                                   | Résolutions                | —                                   |
| `{{RESOLUTION_MAJORITY_RULE}}`                       | Règle de majorité                             | Résolutions                | Article 24 - …                      |
| `{{RESOLUTION_VOTES_FOR}}` / `_AGAINST` / `_ABSTAIN` | Nombre de voix pour / contre / abstention     | Résolutions                | 5 / 0 / 1                           |
| `{{RESOLUTION_TANTIEMES}}`                           | Décompte en tantièmes (vide sans décompte)    | Résolutions                | Tantièmes : pour 750, contre 150, … |
| `{{RESOLUTION_RESULT}}`                              | Résultat                                      | Résolutions                | Approuvée                           |
| `{{RESOLUTIONS_WITH_RESULTS}}`                       | Résolutions et résultats en un seul texte     | Calculée                   |                                     |
| `{{#PROXIES}}` … `{{/PROXIES}}`                      | Boucle des pouvoirs (`{{^PROXIES}}` : aucun)  | Pouvoirs                   |                                     |
| `{{PROXY_GRANTOR}}`                                  | Mandant                                       | Pouvoirs                   | Awa Traoré                          |
| `{{PROXY_REPRESENTATIVE}}`                           | Mandataire                                    | Pouvoirs                   | Jean-Marc Kouadio                   |
| `{{PROXIES_LIST}}`                                   | Pouvoirs en un seul texte                     | Calculée                   |                                     |
| `{{FINAL_SUMMARY}}`                                  | Synthèse finale                               | Texte fixe                 |                                     |

Les balises communes (`EMETTEUR_*`, `COPROPRIETE_*`, `DATE_EMISSION_DOCUMENT`,
`REFERENCE_DOCUMENT`) s'y ajoutent ; `REFERENCE_DOCUMENT` vaut `AG-` suivi des 8
premiers caractères de l'identifiant de l'assemblée.

## Avis d'appel de charges (`avis_appel_charges.docx`) — branché

Route `GET /tenants/:tenantId/syndics/:syndicId/charges/:chargeId/avis.docx` (permission `SYNDIC_VIEW`, même limiteur que l'avis PDF). Contexte : `buildChargeCallContext` (`src/lib/syndics/word-documents.ts`), données de `loadChargeCallNoticeForTenant` (`charge-call-notice.ts`), les mêmes que l'avis PDF. Particularités : `{{DEVISE}}` vaut `FCFA` pour XOF/XAF ; `{{SOLDE_ANTERIEUR}}` porte, en négatif, l'avance imputée et les règlements déjà reçus sur cet appel (« appelé + solde = total à payer ») ; `{{TOTAL_A_PAYER}}` est le reste à payer du PDF ; `{{LIGNES}}` compte une ligne (l'appel, le PDF n'a pas de ventilation par poste) ; `{{REFERENCE_DOCUMENT}}` et `{{APPEL_REFERENCE}}` valent `APL-` + 8 premiers caractères de l'identifiant de l'appel ; `{{LIEU_EMISSION}}` est le dernier élément de l'adresse de l'émetteur.

| Balise                        | Signification                          | Source (prévue)               | Exemple                       |
| ----------------------------- | -------------------------------------- | ----------------------------- | ----------------------------- |
| `{{COPROPRIETAIRE_NOM}}`      | Nom du copropriétaire destinataire     | Propriétaire du lot (contact) | Awa Traoré                    |
| `{{COPROPRIETAIRE_ADRESSE}}`  | Adresse du copropriétaire              | Contact du lot                | Plateau, Abidjan              |
| `{{COPROPRIETAIRE_EMAIL}}`    | E-mail du copropriétaire               | Contact du lot                | awa@exemple.ci                |
| `{{LOT_NUMERO}}`              | N° du lot                              | `ChargeCall.lot.lotNumber`    | A12                           |
| `{{LOT_TYPE}}`                | Type de lot                            | `lotTypeLabel(lot.lotType)`   | Appartement                   |
| `{{LOT_TANTIEMES}}`           | Tantièmes du lot                       | Lot                           | 85                            |
| `{{LOT_TANTIEMES_TOTAL}}`     | Total des tantièmes de la copropriété  | Copropriété                   | 1000                          |
| `{{PERIODE}}`                 | Période appelée                        | `ChargeCall.period`           | 3e trimestre 2026             |
| `{{#LIGNES}}` … `{{/LIGNES}}` | Boucle des lignes du tableau de détail | Postes de charges de l'appel  |                               |
| `{{LIGNE_LIBELLE}}`           | Poste de charge (dans la boucle)       | Poste de l'appel              | Eau commune                   |
| `{{LIGNE_BASE}}`              | Base de répartition du poste           | Clé de répartition            | 85/1000 tantièmes             |
| `{{LIGNE_MONTANT}}`           | Montant du poste                       | Allocation                    | 12 500                        |
| `{{DEVISE}}`                  | Devise                                 | `ChargeCall.currency`         | FCFA                          |
| `{{MONTANT_APPELE}}`          | Montant appelé                         | `ChargeCall.amount`           | 45 000                        |
| `{{MONTANT_APPELE_LETTRES}}`  | Montant appelé en lettres              | `number-to-french-words.ts`   | quarante-cinq mille           |
| `{{SOLDE_ANTERIEUR}}`         | Solde antérieur du compte              | Compte du copropriétaire      | 0                             |
| `{{TOTAL_A_PAYER}}`           | Total à payer                          | Calculé                       | 45 000                        |
| `{{ECHEANCE}}`                | Date d'échéance                        | `ChargeCall.dueDate`          | 15/10/2026                    |
| `{{MODALITES_PAIEMENT}}`      | Modes de règlement acceptés            | `SyndicPaymentMethod` actifs  | Virement : CI000 … ; Wave : … |
| `{{LIEU_EMISSION}}`           | Lieu d'émission                        | Ville de l'émetteur           | Abidjan                       |

## Quittance de charges (`quittance_charges.docx`) — branché

Route `GET /tenants/:tenantId/syndics/:syndicId/quittances/:receiptId/fichier.docx` (permission `SYNDIC_VIEW`). Contexte : `buildReceiptContext`, TOUT depuis le snapshot figé (`charge-receipt-snapshot.ts`), identité et logos par `brandingForSnapshot` ; jamais de relecture du lot ou du contact vivants. Le snapshot ne porte ni les tantièmes ni l'e-mail : `{{LOT_TANTIEMES}}` et `{{LOT_TANTIEMES_TOTAL}}` valent `—`, `{{COPROPRIETAIRE_EMAIL}}` reste vide. Un reçu de paiement (type `RECEIPT`) utilise le même modèle : période(s) et montant appelé viennent des affectations du snapshot, `{{RESTE_DU}}` de `outstandingAfter`.

| Balise                                                                             | Signification                         | Source (prévue)                | Exemple                        |
| ---------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------ | ------------------------------ |
| `{{COPROPRIETAIRE_NOM}}`, `{{COPROPRIETAIRE_ADRESSE}}`, `{{COPROPRIETAIRE_EMAIL}}` | Copropriétaire                        | Voir l'avis d'appel de charges | Awa Traoré                     |
| `{{LOT_NUMERO}}`, `{{LOT_TYPE}}`, `{{LOT_TANTIEMES}}`, `{{LOT_TANTIEMES_TOTAL}}`   | Lot                                   | Voir l'avis d'appel de charges | A12                            |
| `{{REFERENCE_DOCUMENT}}`                                                           | N° de quittance                       | `charge-receipt-numbering.ts`  | QCH-2026-0042                  |
| `{{APPEL_REFERENCE}}`                                                              | Référence de l'appel de charges soldé | Appel de charges               | APL-2026-T3                    |
| `{{PERIODE}}`                                                                      | Période payée                         | Appel de charges               | 3e trimestre 2026              |
| `{{DATE_PAIEMENT}}`                                                                | Date du paiement                      | Paiement                       | 12/10/2026                     |
| `{{DEVISE}}`                                                                       | Devise                                | Appel de charges               | FCFA                           |
| `{{MONTANT_APPELE}}`                                                               | Montant appelé                        | Appel de charges               | 45 000                         |
| `{{MONTANT_PAYE}}`                                                                 | Montant payé                          | Paiement                       | 45 000                         |
| `{{MONTANT_PAYE_LETTRES}}`                                                         | Montant payé en lettres               | `number-to-french-words.ts`    | quarante-cinq mille francs CFA |
| `{{RESTE_DU}}`                                                                     | Reste dû                              | Calculé                        | 0                              |
| `{{MODE_PAIEMENT}}`                                                                | Mode de paiement                      | Paiement                       | Virement bancaire              |
| `{{REFERENCE_PAIEMENT}}`                                                           | Référence du paiement                 | Paiement                       | TRX-889                        |
| `{{LIEU_EMISSION}}`                                                                | Lieu d'émission                       | Ville de l'émetteur            | Abidjan                        |

## Convocation à l'assemblée générale (`convocation_assemblee_generale.docx`) — branché

Route `GET /tenants/:tenantId/syndics/:syndicId/assemblees/:meetingId/lots/:lotId/convocation.docx` (permission `SYNDIC_VIEW`), paramètre optionnel `?dateLimitePouvoir=AAAA-MM-JJ`. Contexte : `buildConvocationContext`. Destinataire : propriétaires actuels du lot (indivision : noms joints par une virgule), à défaut le propriétaire saisi sur le lot. `{{ORDRE_DU_JOUR}}` : points de l'ordre du jour, sinon résolutions proposées (titre + description). `{{MENTION_QUORUM}}` : vide si l'assemblée n'a pas de quorum. `{{DATE_LIMITE_POUVOIR}}` : la date passée en paramètre, sinon le jour de l'assemblée.

| Balise                                                                             | Signification                          | Source (prévue)                | Exemple                 |
| ---------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------ | ----------------------- |
| `{{COPROPRIETAIRE_NOM}}`, `{{COPROPRIETAIRE_ADRESSE}}`, `{{COPROPRIETAIRE_EMAIL}}` | Destinataire                           | Voir l'avis d'appel de charges | Awa Traoré              |
| `{{LOT_NUMERO}}`, `{{LOT_TYPE}}`, `{{LOT_TANTIEMES}}`, `{{LOT_TANTIEMES_TOTAL}}`   | Lot du destinataire                    | Voir l'avis d'appel de charges | A12                     |
| `{{ASSEMBLEE_TYPE}}`                                                               | Type d'assemblée                       | `formatMeetingType`            | ordinaire               |
| `{{ASSEMBLEE_DATE}}`                                                               | Date de la réunion                     | Assemblée                      | 10/03/2027              |
| `{{ASSEMBLEE_HEURE}}`                                                              | Heure                                  | Assemblée                      | 09:00                   |
| `{{ASSEMBLEE_LIEU}}`                                                               | Lieu                                   | Assemblée                      | Salle polyvalente       |
| `{{#ORDRE_DU_JOUR}}` … `{{/ORDRE_DU_JOUR}}`                                        | Boucle des points                      | Ordre du jour                  |                         |
| `{{POINT_NUMERO}}`                                                                 | N° du point                            | Ordre du jour                  | 1                       |
| `{{POINT_TITRE}}`                                                                  | Titre du point                         | Ordre du jour                  | Approbation des comptes |
| `{{POINT_DESCRIPTION}}`                                                            | Description du point                   | Ordre du jour                  | Examen du bilan 2026    |
| `{{DATE_LIMITE_POUVOIR}}`                                                          | Date limite de remise des pouvoirs     | À fixer par le syndic          | 05/03/2027              |
| `{{MENTION_QUORUM}}`                                                               | Mention sur le quorum / 2e convocation | À fixer par le syndic          | À défaut de quorum, …   |
| `{{LIEU_EMISSION}}`                                                                | Lieu d'émission                        | Ville de l'émetteur            | Abidjan                 |

## Brancher les modèles locatifs

Les quatre modèles locatifs d'origine (`assets/modeles_documents/*.docx`) restent
en place : ils servent encore au seed et aux tests de contexte. Les modèles
standard ont les mêmes balises ; pour qu'ils deviennent le défaut des agences
sans modèle personnalisé, le seed `prisma/seeds/document-templates-seed.ts` doit
lire `assets/modeles_standard/<fichier>` à la place du fichier d'origine (voir
`standardTemplateForDocType`), et l'empreinte des anciens fichiers rejoint
`PREVIOUS_SHIPPED_HASHES` (`src/services/document-template-refresh.ts`) pour que
`decideTemplateRefresh` les remplace sans toucher un modèle personnalisé. Aucune
migration Prisma n'est nécessaire.
