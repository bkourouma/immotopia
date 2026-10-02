# Spécification 027 — Clôture d'exercice du module Syndic

> Report à nouveau, ouverture de l'exercice N+1, écritures d'opérations
> diverses (OD) de fin d'année, verrouillage de l'exercice clos, approbation
> des comptes en assemblée générale ordinaire (AGO) et régularisation des
> charges. **Spécification seule** : décision de l'utilisateur du 29/09/2026,
> aucune implémentation n'est engagée.
>
> Compagnons : [plan.md](./plan.md) (architecture, lots, tests),
> [data-model.md](./data-model.md) (schéma Prisma proposé),
> [contracts/openapi.yaml](./contracts/openapi.yaml) (API),
> [tasks.md](./tasks.md) (tâches par lot).

**Statut** : brouillon · **Créée** : 2026-09-29 · **Base** : `main` `6c454886`

**Règle de lecture.** Cette spécification ne décide d'aucune règle légale ou
comptable. Tout ce qui en relève est marqué **[À VALIDER — juriste]** ou
**[À VALIDER — expert-comptable]** et se paramètre au lieu de se coder en dur
quand c'est possible. La liste consolidée est au §14.

## 1. Références

- **Scénario de recette** :
  [`docs/recette/SCENARIO_SYNDIC_ESSAI_EXERCICE_COMPLET.md`](../../docs/recette/SCENARIO_SYNDIC_ESSAI_EXERCICE_COMPLET.md),
  partie N (arrêté des comptes au 31/12/2026), constats d'écart N.8, et les
  points « écart connu » cités au §13. Ses chiffres servent de **jeu de
  référence** (§9).
- **Specs voisines** : [013](../013-syndic-module/spec.md) (module Syndic),
  [021](../021-syndic-besoins-prospect/plan.md) (besoins du prospect, lots S1 à
  S7), [016](../016-finance-operationnelle/spec.md) (finance opérationnelle :
  comptes de tiers et moteur comptable de l'agence ; la clôture de chantier du
  même module, `lib/finance/site-closing.ts`, sert de modèle aux bloqueurs de
  clôture).
- **Numérotation** : le numéro 027 est réservé par le plan ; 023 à 026 sont
  dans la PR #52 non fusionnée. `ls specs` ne montre aucun 027 au 29/09/2026.
- **Inventaire des fonctionnalités** : à mettre à jour à la livraison de
  chaque lot (§12), pas maintenant.

## 2. Contexte et problème

### 2.1 Ce que fait aujourd'hui le module (vérifié dans le code, `main` `6c454886`)

| Domaine                | État réel                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exercice               | Un simple nombre. `SyndicateBudget.fiscalYear` et `AccountingJournal.fiscalYear` sont des années ; l'exercice d'une pièce est l'**année civile UTC** de sa date. `Syndicate.fiscalYear` (1 à 12) n'est lu par aucun code (le scénario le tient pour un mois de début, sans preuve dans le code ni les specs).                             |
| Verrou                 | Un seul, partiel : `assertFiscalYearOpenTx` refuse les factures et paiements de **prestataires** quand un budget de l'année est `CLOSED`. Il teste, pour l'annulation, la date **du jour** et non celle de la pièce annulée.                                                                                                              |
| Budgets                | Statuts `DRAFT → APPROVED ↔ REVISED → CLOSED` contrôlés depuis le 28/09 (`aded0be5`) ; clôture refusée tant qu'une programmation active l'utilise ; réalisé (`amountActual`, TTC des factures non annulées) et écart affichés par poste. Un budget `CLOSED` refuse modification, répartition, changement de fonds et génération d'appels. |
| Écritures comptables   | Seules les factures et paiements de prestataires sont **postés automatiquement** (comptes 401, 521, 624, 6241, verrouillés d'emblée). Appels, encaissements, pénalités et avances ne produisent **aucune** écriture. Les comptes 4500, 7010, 7020, 7580, 1010, 1020 se créent à la main (scénario C.9).                                   |
| Écritures manuelles    | Création puis « Verrouiller » une par une. `isLocked` ne protège rien (aucune route de modification n'existe, mais aucun contrôle non plus). La date d'une écriture n'est pas comparée à l'exercice de son journal.                                                                                                                       |
| Balance, grand livre   | Filtrés par plage de dates seulement, **cumulatifs** : sans report à nouveau, deux années s'additionnent ; avec une écriture d'ouverture, elles se comptent deux fois.                                                                                                                                                                    |
| Comptes de lots        | `OwnerAccount` unique par lot, **continu** (aucune coupure par exercice). Avance = somme des `ChargePayment.unallocatedAmount`. Un ajustement de compte ne devient jamais une avance imputable.                                                                                                                                           |
| Fonds                  | `SyndicateFund.balance` continu et journal `SyndicateFundMovement`, daté seulement par `createdAt` (date de saisie) : aucun solde « au 31/12 » fiable.                                                                                                                                                                                    |
| AG                     | `GeneralMeeting` (`ORDINARY`, `EXTRAORDINARY`), résolutions à majorité `ARTICLE_24/25/26/UNANIMITE` calculée en tantièmes. Aucun point n'est « l'approbation des comptes » ; `SyndicateBudget.approvedByResolutionId` n'est pas vérifié à fond.                                                                                           |
| Échéanciers            | `PaymentSchedule` n'est jamais mis à jour par le code après sa création : il reste `ACTIVE` même quand l'appel est soldé (constat L.4).                                                                                                                                                                                                   |
| Comptes bancaires      | `SyndicPaymentMethod` existe (avis d'appel) sans écran ; aucun solde de relevé n'est saisi (constat N.8-9).                                                                                                                                                                                                                               |
| Programmation d'appels | Le lanceur exige un budget `APPROVED` de l'année de la période : sans budget voté pour N+1, l'émission du T1 échoue.                                                                                                                                                                                                                      |
| Droits                 | Les routes Syndic n'exigent que `PROPERTIES_VIEW/CREATE/EDIT`. Le rôle `TENANT_ACCOUNTANT` n'en reçoit aucun au seed (`rbac-seed.ts`) : la comptable du scénario (C.1, N.6) peut ne pas atteindre le menu Syndic.                                                                                                                         |

### 2.2 Le problème

La partie N du scénario montre qu'un exercice se « clôture » aujourd'hui **à
la main**, en une vingtaine de gestes sans aucune garantie :

- les écritures de fin d'année (appels, encaissements, affectation du
  résultat, ouverture) sont saisies chiffre à chiffre, sans lien avec les
  appels et paiements réels ;
- rien n'empêche de saisir un paiement ou une facture daté d'un exercice
  « clos » ; « verrouiller » signifie cliquer écriture par écriture ;
- le report à nouveau n'existe pas : le solde d'un lot ou d'un fonds au
  31/12 n'est ni figé ni reconstituable une fois l'exercice suivant entamé ;
- l'approbation des comptes par l'AGO n'est reliée à rien ;
- la régularisation des charges (provisions contre réel) se calcule à la
  calculatrice et se saisit lot par lot, sans imputation automatique.

**Objectif.** Un syndic arrête ses comptes en quelques minutes avec des
contrôles bloquants, obtient des écritures et un dossier de comptes générés
depuis les données réelles, ne peut plus rien saisir dans l'exercice clos sans
le rouvrir explicitement, ouvre l'exercice suivant avec les soldes reportés,
fait approuver les comptes en AGO, puis applique la régularisation votée.

## 3. Périmètre

**Dans le périmètre**

- Modèle d'exercice, statuts, séquence, verrou unique de toutes les écritures
  datées.
- Contrôles avant clôture et aperçu sans effet de bord.
- Génération des OD de fin d'année, affectation du résultat, écritures
  d'ouverture.
- Instantanés figés (lots, fonds) et report à nouveau.
- Clôture atomique, réouverture encadrée, historique des versions.
- Dossier de comptes (PDF) et consultation par les copropriétaires.
- Soumission des comptes à l'AGO et constat de l'approbation.
- Régularisation des charges après le vote (crédit ou appel, lot par lot).
- Permissions, audit, i18n.

**Hors périmètre** (décisions à confirmer, §14)

- **Conseil syndical** (N.8-8) : non modélisé. Seul un visa libre « comptes
  vérifiés par… le… » est prévu (FR-068).
- **Relances par SMS** (N.8-10) : aucun lien avec la clôture ; canal non câblé,
  à traiter séparément.
- **Rapprochement bancaire complet** : la clôture compare 521 au solde d'un
  relevé saisi, sans pointage ligne à ligne.
- **Exercices non calendaires** : V1 = 01/01 au 31/12 (le modèle est prêt).
- **Avoirs et factures rectificatives** : une pièce d'un exercice clos se
  corrige par une pièce datée de l'exercice ouvert ; l'avoir n'existe pas
  (Q13).
- **Charges à payer et factures non parvenues** (coupure des comptes)
  **[À VALIDER — expert-comptable]**.
- Comptabilité automatique **au fil de l'eau** de tous les événements : la
  clôture rattrape en fin d'exercice ce qui n'est pas posté (D5).
- Liquidation de la copropriété, mutation de lot et répartition
  vendeur/acquéreur, export comptable normalisé, consolidation entre
  copropriétés.

## 4. Choix par défaut de cette spécification (réversibles)

| #   | Choix                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Exercice calendaire** en V1. `Syndicate.fiscalYear` est conservé mais ne pilote aucune date. Le modèle porte `startDate` et `endDate` pour un exercice décalé plus tard (Q6).                                                                                                                      |
| D2  | **Un exercice est une ligne** `SyndicFiscalYear`, créée **à la demande** (aucune migration de données). Un budget déjà `CLOSED` **garde son effet actuel** (refus des factures et paiements de prestataires de son année) sans clore l'exercice : seule la clôture d'exercice verrouille l'ensemble. |
| D3  | **Deux temps** : _arrêté des comptes_ (verrouillage) puis _approbation par l'AG_ (statut distinct). L'approbation n'est pas un préalable du verrouillage **[À VALIDER — juriste]** (Q4).                                                                                                             |
| D4  | **Aperçu puis clôture atomique** : l'aperçu ne change rien et porte une empreinte ; la clôture recalcule et refuse si l'empreinte a changé.                                                                                                                                                          |
| D5  | Les **OD sont générées** depuis les données (jamais saisies), en écritures synthétiques par nature, avec le détail par lot sur le compte des copropriétaires. Les comptes utilisés sont **paramétrables** **[À VALIDER — expert-comptable]** (Q1, Q2).                                               |
| D6  | **Report à nouveau = instantané figé + écriture d'ouverture.** Le compte de lot et le solde d'un fonds sont continus : rien n'est « remis à zéro ».                                                                                                                                                  |
| D7  | La **régularisation des charges est une étape distincte, après le vote** de l'AG. Excédent → crédit de régularisation (avance **non monétaire**) ; déficit → appel de régularisation dans l'exercice ouvert. Jamais avant la décision.                                                               |
| D8  | Le verrou porte sur la **date de la pièce**. Un règlement daté de N+1 qui solde un appel de N reste permis : c'est le report des créances.                                                                                                                                                           |
| D9  | **Réouverture encadrée** : administrateur, motif obligatoire, refusée après approbation constatée ou si N+1 est clos, écritures de clôture **contre-passées** et non supprimées **[À VALIDER — juriste]** (Q5).                                                                                      |
| D10 | **Aucune valeur n'est ajoutée à un enum existant.** Les OD de clôture portent `sourceType = MANUAL` et un `documentType` dédié (`SYNDIC_FISCAL_YEAR_CLOSING`) ; migration réversible.                                                                                                                |
| D11 | **Permissions dédiées** `SYNDIC_FISCAL_YEAR_*` : les routes existantes n'exigent que `PROPERTIES_*`, dont la comptable est privée.                                                                                                                                                                   |
| D12 | Le **dossier de comptes** est un PDF généré et figé à la clôture ; il n'est visible des copropriétaires que **publié** explicitement par le syndic (Q12).                                                                                                                                            |
| D13 | Le code nouveau vit dans des fichiers `lib/syndics/fiscal-year-*.ts`, pas dans `queries.ts` (5 029 lignes), pour limiter les conflits avec les lots en vol (même règle que S6).                                                                                                                      |

## 5. Rôles et parcours

### 5.1 Rôles

| Rôle                                        | Ce qu'il fait                                                                                                                                    | Permissions (proposées)                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Syndic / gestionnaire (`TENANT_MANAGER`)    | Lance les contrôles et l'aperçu, corrige les blocages, soumet les comptes à l'AGO, publie le dossier aux copropriétaires, prépare le budget N+1. | `SYNDIC_FISCAL_YEAR_VIEW`, `SYNDIC_FISCAL_YEAR_PREPARE`              |
| Comptable (`TENANT_ACCOUNTANT`)             | Paramètre les comptes de clôture, saisit le solde du relevé bancaire, vérifie les écritures proposées et le résultat par fonds.                  | `SYNDIC_FISCAL_YEAR_VIEW`, `SYNDIC_FISCAL_YEAR_PREPARE`              |
| Administrateur de l'agence (`TENANT_ADMIN`) | Clôture l'exercice, le rouvre, applique la régularisation, constate l'approbation. Modèle : clôture de chantier (`FINANCE_DOCUMENTS_VALIDATE`).  | toutes, dont `SYNDIC_FISCAL_YEAR_CLOSE`, `SYNDIC_FISCAL_YEAR_REOPEN` |
| Copropriétaire (portail)                    | Voit son relevé (solde reporté), les exercices clos **publiés**, le dossier de comptes et le résultat du vote. Ne modifie rien.                  | portail copropriétaire existant                                      |
| Agence mandante                             | Ne se connecte pas (lot S1). Son identité figure sur le dossier de comptes.                                                                      | —                                                                    |
| Super-administrateur                        | Aucun rôle : ne clôture pas les exercices d'une agence.                                                                                          | —                                                                    |

Séparation des tâches : clôturer exige `SYNDIC_FISCAL_YEAR_CLOSE`, que la
préparation ne donne pas. Un contrôle « quatre yeux » (celui qui clôture diffère
de celui qui a produit l'aperçu) n'est **pas** prévu en V1 : il obligerait à
tracer l'auteur de l'aperçu, qui est aujourd'hui une lecture pure (Q9).

### 5.2 Parcours

**P1 — Arrêter les comptes de 2026** (gestionnaire, comptable, administrateur)

1. Syndic › Finances › **Exercices** : la carte « 2026 — ouvert, fin le
   31/12/2026 » propose « Arrêter les comptes ».
2. Assistant en cinq étapes : **(1)** paramétrage des comptes (une fois par
   copropriété) ; **(2)** contrôles, bloquants en rouge, avertissements en
   orange ; **(3)** trésorerie : rapprochement 521 / fonds / relevé saisi ;
   **(4)** aperçu des écritures (APP, TRV, PEN, ENC, AFF, OUV), du résultat par
   fonds, du réalisé contre budget ; **(5)** confirmation (avertissements
   reconnus un à un, empreinte).
3. « Clôturer » : l'exercice passe à _Clos_, les écritures sont posées et
   verrouillées, 2027 s'ouvre avec ses soldes, le dossier de comptes est
   généré.

**P2 — Faire approuver les comptes** (gestionnaire)

1. « Soumettre à l'AG » crée (ou relie) une AGO avec quatre résolutions
   préremplies : approbation des comptes, quitus, affectation du résultat,
   budget N+1.
2. « Mettre à disposition des copropriétaires » publie le dossier au portail.
3. Après la séance clôturée (fonctionnement existant), l'administrateur
   « Constate l'approbation » : le résultat du vote est relu et l'exercice
   devient _Approuvé_ (ou _Rejeté_). Geste réservé à l'administrateur parce
   qu'il rend l'exercice intangible (FR-054).

**P3 — Appliquer la régularisation votée** (administrateur, comptable)

Aperçu lot par lot (provisions, réel réparti, écart) → choix de la décision
(régulariser lot par lot, ou laisser au fonds) → application unique : crédits
imputés automatiquement sur les appels ouverts, ou avances conservées pour le
prochain appel ; appels de régularisation en cas de déficit.

**P4 — Le copropriétaire** (portail)

Son relevé de lot affiche « Solde reporté au 01/01/2027 » ; il télécharge le
dossier publié et voit si les comptes ont été approuvés. Rien d'autre.

**P5 — Corriger un exercice clos** (administrateur)

« Rouvrir l'exercice » avec un motif : les écritures de clôture sont
contre-passées, les budgets et échéanciers retrouvent leur état, l'exercice
redevient ouvert ; une nouvelle clôture crée la version 2. Impossible après
approbation constatée : la correction passe alors par des pièces datées de
l'exercice ouvert.

## 6. Exigences fonctionnelles

Chaque exigence est numérotée (FR) et se rattache à des critères
d'acceptation (CA, §10) et à un lot livrable (C0 à C6, [plan.md](./plan.md)).

### 6.1 Exercice, dates, statuts

- **FR-001** Une copropriété a un exercice par année civile, créé à la demande
  (`ensureFiscalYearTx`) par la liste, le garde de verrou ou la clôture. Dates
  V1 : 01/01 au 31/12. `GET …/exercices` renvoie l'exercice courant et le
  précédent même s'ils n'existent pas encore en base.
- **FR-002** Une pièce appartient à l'exercice de sa **date métier**, en jours
  UTC (comme `getUTCFullYear()` aujourd'hui) :

  | Pièce                       | Date qui fait foi                                         |
  | --------------------------- | --------------------------------------------------------- |
  | Appel de charges            | `periodStart` (repli : `dueDate`, comme le suivi mensuel) |
  | Paiement de copropriétaire  | `paidAt`                                                  |
  | Pénalité de retard          | `appliedAt`                                               |
  | Ajustement de compte de lot | `transactionDate`                                         |
  | Facture de prestataire      | `invoiceDate`                                             |
  | Paiement de prestataire     | `paidAt`                                                  |
  | Écriture comptable          | `entryDate`                                               |
  | Mouvement de fonds          | `occurredAt` (nouvelle colonne, repli `createdAt`)        |

- **FR-003** Statuts d'exercice : `OPEN` ↔ `CLOSED` (la réouverture est la
  seule voie de retour). Statuts d'approbation : `NOT_SUBMITTED → SUBMITTED →
APPROVED | REJECTED` ; `REJECTED` et `SUBMITTED` retombent à `NOT_SUBMITTED`
  à la réouverture.
- **FR-004** **Séquence** : l'exercice N ne se clôt que si N−1 est clos (ou n'a
  aucune activité) ; N+1 ne se clôt pas avant N ; N ne se rouvre pas si N+1 est
  clos.
- **FR-005** **Cohérence des dates d'écriture** : la date d'une écriture doit
  tomber dans l'exercice de son journal (`AccountingJournal.fiscalYear`) ;
  sinon 422. Comble un manque actuel de `createJournalEntryBySyndicate`.
- **FR-006** `GET …/comptabilite/balance` et `…/grand-livre` acceptent
  `exercice=<année>` (plage par défaut : dates de l'exercice) ; sans ce
  paramètre le comportement est inchangé. La balance d'un exercice ouvert
  après report est équilibrée sans double compte.
- **FR-007** La règle actuelle « un budget `CLOSED` de l'année refuse les
  factures et paiements de prestataires » est **conservée à l'identique et
  limitée à ces deux opérations** : la généraliser à tous les paiements et
  appels d'une année parce qu'un seul budget (de travaux, par exemple) est
  clôturé bloquerait des copropriétés en pleine gestion. Elle ne clôt pas
  l'exercice ; aucune donnée n'est migrée.
- **FR-008** _(lot C6, optionnel)_ **Reprise des soldes du premier exercice** :
  l'assistant propose l'écriture `OUV-N` (521, 1010, 1020 …) d'après les soldes
  d'ouverture des fonds (mouvements `OPENING`) et des lots, modifiable et
  validée par l'utilisateur — remplace la saisie manuelle de C.9.

### 6.2 Contrôles avant clôture

- **FR-010** `GET …/exercices/:year/controles` renvoie la liste des contrôles :
  `code`, `severity` (`BLOCKING`, `WARNING`, `INFO`), `message`, `count`,
  `items` (50 au plus), `fixHint`. **Aucune écriture** : les lectures de compte
  de lot de cet endpoint ne rapprochent pas le grand livre (contrairement à
  `getOwnerAccountByLot`, qui écrit) ; le rapprochement se fait dans la
  transaction de clôture, sous verrou (FR-030).
- **FR-011** **Bloquants** : la clôture est refusée (409 `CLOSING_BLOCKED`,
  liste jointe) tant qu'un seul subsiste.
- **FR-012** **Avertissements** : la clôture exige que chaque code présent soit
  reconnu (`acknowledgedWarnings`), avec une note obligatoire pour `CLO-W02`.
  Refus sinon (409 `WARNINGS_NOT_ACKNOWLEDGED`).
- **FR-013** Catalogue V1 (les seuils sont des constantes nommées, pas des
  réglages) :

  | Code    | Sévérité      | Contrôle                                                                                                                                 |
  | ------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
  | CLO-B01 | Bloquant      | Exercice précédent non clos alors qu'il a de l'activité (FR-004).                                                                        |
  | CLO-B02 | Bloquant      | Exercice déjà clos.                                                                                                                      |
  | CLO-B03 | Bloquant      | Paramétrage comptable incomplet (comptes de clôture, compte de capitaux propres d'un fonds crédité par les appels).                      |
  | CLO-B04 | Bloquant      | Lot ayant de l'activité dans l'exercice et **sans copropriétaire** (aucun compte de lot ne peut exister).                                |
  | CLO-B05 | Bloquant      | Programmation d'appels **active et non terminée** liée à un budget de l'exercice (règle déjà appliquée à la clôture d'un budget).        |
  | CLO-B06 | Bloquant      | Facture ou paiement de prestataire de l'exercice **sans écriture** comptable.                                                            |
  | CLO-B07 | Bloquant      | Écritures de l'exercice non équilibrées.                                                                                                 |
  | CLO-B08 | Bloquant      | Ajustement manuel de compte de lot de l'exercice sans compte de contrepartie choisi (FR-025).                                            |
  | CLO-B09 | Bloquant      | Plusieurs devises dans l'exercice (V1 : XOF seulement).                                                                                  |
  | CLO-W01 | Avertissement | Exercice non terminé (`endDate` ≥ aujourd'hui) : nécessaire pour rejouer le scénario, dont les dates sont simulées.                      |
  | CLO-W02 | Avertissement | **Écart de trésorerie non expliqué** (FR-015) ; note obligatoire.                                                                        |
  | CLO-W03 | Avertissement | Fonds au solde négatif à la date d'arrêté.                                                                                               |
  | CLO-W04 | Avertissement | Comptes de l'exercice précédent non approuvés par l'AG.                                                                                  |
  | CLO-W05 | Avertissement | Aucun budget approuvé ou révisé pour l'exercice, ou budget resté en brouillon (il sera figé `CLOSED`, jamais voté).                      |
  | CLO-W06 | Avertissement | Appels soldés sans quittance émise (le bouton « Générer les quittances manquantes » existe).                                             |
  | CLO-W07 | Avertissement | Factures non rattachées à un poste de budget : réalisé incomplet, régularisation approximée (FR-071).                                    |
  | CLO-W08 | Avertissement | Appels dont la période chevauche deux exercices ou dont l'échéance tombe hors de l'exercice de leur période (alimente `otherMovements`). |
  | CLO-W09 | Avertissement | Aucun solde de relevé bancaire saisi, ou écart entre le relevé saisi et le compte 521.                                                   |
  | CLO-W10 | Avertissement | Campagne d'appels en brouillon (`ChargeCallBatch.status = DRAFT`) datée de l'exercice.                                                   |
  | CLO-W11 | Avertissement | Imputations d'incident sans écriture comptable (`IncidentCostImputation.journalEntryId` nul).                                            |
  | CLO-I01 | Info          | Échéanciers `ACTIVE` dont l'appel est soldé : la clôture les passe à `COMPLETED` (constat L.4).                                          |
  | CLO-I02 | Info          | Créances reportées : nombre de lots débiteurs et montant.                                                                                |
  | CLO-I03 | Info          | Dettes reportées : factures de prestataires non soldées.                                                                                 |

- **FR-015** **Rapprochement de trésorerie.** Écart = `solde 521 à la date
d'arrêté − (somme des fonds + avances non imputées + encaissements affectés
à aucun fonds)`. Zéro sur le jeu de référence (5 379 700 des deux côtés).
  Non nul : `CLO-W02`, à justifier. L'écart de **300 000** entre le compte
  1010 (2 663 700) et le fonds de roulement (2 363 700) est la créance de B02
  — comptabilité d'engagement contre trésorerie — et **n'est pas** une anomalie :
  il s'affiche expliqué par « créances reportées ».
- **FR-016** Le syndic peut saisir, par compte bancaire, le solde d'un relevé
  à la date d'arrêté (`SyndicBankCheck`). La clôture le compare au 521 ;
  `CLO-W09` signale l'absence ou l'écart. Ce n'est pas un rapprochement ligne
  à ligne (hors périmètre, Q11).

### 6.3 Paramétrage comptable et écritures de fin d'année

- **FR-020** Par copropriété, `SyndicClosingSettings` désigne les comptes
  utilisés : copropriétaires (4500), banque (521), produits des appels de
  charges courantes (7010) et de travaux (7020), pénalités (7580), contrepartie
  des ajustements, résultat non affecté ; chaque fonds porte son compte de
  capitaux propres (1010, 1020). `POST …/comptabilite/plan-minimal` crée les
  comptes manquants du plan minimal (jamais de doublon), sur le modèle de
  `ensureSyndicProviderAccountsTx`. Numéros et intitulés **[À VALIDER —
  expert-comptable]** : le référentiel applicable n'est pas tranché (Q1).
- **FR-021** Le journal d'opérations diverses (`OD`, type `GENERAL`) est créé
  pour l'exercice s'il manque, y compris celui de N+1.
- **FR-022** **Appels** (`APP-N`, `TRV-N`). Une écriture par compte de produit :
  débit du compte des copropriétaires **ligne par lot** (`lotId`), crédit du
  compte de produit. Somme des appels dont la **période** tombe dans
  l'exercice. Compte de produit : surcharge du budget (`incomeAccountId`),
  sinon `callIncomeRegularAccountId` pour un appel d'une campagne `REGULAR` (ou
  sans campagne) et `callIncomeExceptionalAccountId` pour une campagne
  `EXCEPTIONAL`.
- **FR-023** **Pénalités** (`PEN-N`), si le net n'est pas nul : par lot, les
  pénalités **appliquées** dans l'exercice moins les remises **datées** de
  l'exercice (une remise d'une pénalité d'un exercice antérieur s'impute sur
  l'exercice de la remise) ; débit 4500 / crédit 7580 pour un net positif,
  sens inverse pour un net négatif. Une pénalité appliquée puis remise dans
  l'exercice ne laisse rien (cas du scénario, J.4).
- **FR-024** **Encaissements** (`ENC-N`) : débit banque, crédit 4500 par lot,
  pour la somme des paiements `CASH` (affectés **ou non**, avances comprises)
  dont `paidAt` tombe dans l'exercice. Les crédits de régularisation
  (`REGULARISATION`) n'en font pas partie.
- **FR-025** **Ajustements manuels** de compte de lot de l'exercice
  (`AJU-N`) : écriture entre le compte des copropriétaires et le compte de
  contrepartie choisi (`adjustmentAccountId`). Sans choix : `CLO-B08`.
- **FR-026** **Affectation du résultat** (`AFF-N`) : solde à zéro tous les
  comptes de classes 6 et 7 de l'exercice ; la différence est portée, fonds par
  fonds, au compte de capitaux propres du fonds. Résultat d'un fonds = appels
  affectés à ce fonds (parts calculées comme `fund-credits.ts` : appel affecté
  au fonds en entier, ou parts des postes de budget à fonds, au prorata de la
  répartition du lot) − dépenses TTC non annulées imputées à ce fonds (fonds
  de la facture, à défaut fonds de ses paiements). Le reliquat sans fonds va
  au compte « résultat non affecté ». Sur le jeu de référence : 1 163 700 au
  fonds de roulement et 516 000 au fonds de travaux. **[À VALIDER —
  expert-comptable]** (Q2).
- **FR-027** Toute écriture générée : équilibrée ; référence
  `<CODE>-<année>` (suffixe `-V<n>` à partir de la version 2) ; `sourceType =
MANUAL`, `documentType = SYNDIC_FISCAL_YEAR_CLOSING`, `documentId` = clôture,
  `closing_id` renseigné ; date = date de fin d'exercice ; **verrouillée
  d'emblée**.
- **FR-028** Les écritures de factures et paiements de prestataires (S6) ne
  sont **jamais régénérées** ; la clôture les contrôle (`CLO-B06`).
- **FR-029** `GET …/exercices/:year/apercu-cloture` calcule, sans rien écrire :
  les écritures proposées (ligne à ligne), le résultat par fonds, le réalisé
  contre budget, les instantanés de lots et de fonds, le rapprochement de
  trésorerie, et une **empreinte** SHA-256 de l'ensemble.

### 6.4 Clôture, report à nouveau, ouverture de N+1

- **FR-030** `POST …/exercices/:year/cloture` s'exécute dans **une seule
  transaction**, sous un verrou consultatif de copropriété et un verrou de
  ligne exclusif sur l'exercice : (1) recontrôle ; (2) rapprochement du grand
  livre de chaque lot ; (3) recalcul de l'aperçu ; (4) comparaison des
  empreintes ; (5) pose des écritures FR-022 à FR-026 ; (6) verrouillage de
  toutes les écritures de l'exercice (FR-042) ; (7) figement des budgets
  (FR-038) ; (8) instantanés (FR-033, FR-034) ; (9) ouverture de N+1 et
  écriture d'ouverture (FR-035, FR-036) ; (10) échéanciers soldés (FR-039) ;
  (11) statut `CLOSED`, journal d'audit. Le dossier de comptes (FR-080) est
  généré **après** validation de la transaction ; un échec de génération ne
  défait pas la clôture et se rejoue.
- **FR-031** Si l'empreinte a changé depuis l'aperçu, la clôture est refusée
  (409 `PREVIEW_STALE`) : rien n'est écrit, l'aperçu est à relancer.
- **FR-032** Corps de la requête : `previewHash`, `acknowledgedWarnings`
  (`[{ code, note? }]`), `adjustmentAccountId?`. Bloquant → 409
  `CLOSING_BLOCKED` ; exercice clos → 409 `FISCAL_YEAR_ALREADY_CLOSED`.
- **FR-033** **Instantané de lots** : par lot, ouverture, appelé, encaissé,
  pénalités, remises, ajustements, crédits de régularisation,
  `otherMovements`, clôture, avance
  (`SyndicClosingLotBalance`). Solde à la date d'arrêté par la chaîne du
  compte de lot (dates d'écriture), pas par le solde courant : l'exercice
  suivant est peut-être déjà entamé.
- **FR-034** **Instantané de fonds** : ouverture, crédits, débits nets des
  annulations, clôture, solde du compte de capitaux propres après
  affectation (`SyndicClosingFundBalance`), à partir de `occurredAt`.
- **FR-035** **Report à nouveau.** Créances (lots débiteurs), avances (lots
  créditeurs) et dettes (prestataires non soldés) se poursuivent d'elles-mêmes ;
  ce qui s'ajoute est : l'instantané figé (FR-033), l'écriture d'ouverture
  (FR-036) et la ligne « Solde reporté au 01/01/N+1 » du relevé de lot
  (FR-093). Les avances (`unallocatedAmount`) ne sont jamais recréées ni
  déplacées.
- **FR-036** **Ouverture de N+1** : création de l'exercice s'il manque
  (`OPEN`), du journal `OD` de N+1, et de l'écriture `OUV-(N+1)` datée du
  01/01/N+1 qui reprend les soldes des comptes de **bilan** (classes 1 à 5)
  après affectation, 4500 **ligne par lot**. Sur le jeu de référence : 521
  débit 5 379 700, 4500 débit 300 000 (B02), 1010 crédit 2 663 700, 1020
  crédit 3 016 000 ; total 5 679 700 de chaque côté. Copropriété
  `IN_LIQUIDATION` : N+1 n'est pas créé (Q10).
- **FR-037** _(lot C6)_ `POST …/exercices/:year/budget-suivant` prépare un
  budget N+1 **en brouillon** par copie des postes du budget de N (catégorie,
  description, clé, fonds, compte) avec montant prévisionnel identique ou
  fondé sur le réalisé. Jamais approuvé automatiquement : l'approbation
  reste l'acte existant, après le vote.
- **FR-038** À la clôture, les budgets de N passent à `CLOSED` (les
  `APPROVED` et `REVISED` par la transition existante, les `DRAFT` par la
  clôture elle-même, marqués figés) ; leur statut précédent est mémorisé pour
  la réouverture.
- **FR-039** À la clôture, les échéanciers `ACTIVE` dont l'appel est soldé
  passent à `COMPLETED` (mémorisés). Les quittances manquantes ne sont **pas**
  générées en silence (`CLO-W06`). Les échéanciers d'appels non soldés
  continuent en N+1.

### 6.5 Verrouillage de l'exercice clos

- **FR-040** Un exercice `CLOSED` refuse toute pièce **datée** dans l'exercice :

  | Opération gardée                                                          | Date testée       |
  | ------------------------------------------------------------------------- | ----------------- |
  | Écriture manuelle                                                         | `entryDate`       |
  | Facture de prestataire (création, modification de date)                   | `invoiceDate`     |
  | Paiement de prestataire                                                   | `paidAt`          |
  | Paiement de copropriétaire (`recordLotPayment`, `payChargeCall`)          | `paidAt`          |
  | Ajustement de compte de lot                                               | `transactionDate` |
  | Pénalité appliquée                                                        | `appliedAt`       |
  | Création d'appel, génération depuis un budget, exécution de programmation | `periodStart`     |
  | Création ou modification d'un budget de l'exercice                        | `fiscalYear`      |

- **FR-041** Un **garde unique** `assertFiscalYearOpenTx(tx, syndicateId, date)`
  généralise l'existant : il crée la ligne d'exercice si elle manque, prend un
  verrou de ligne partagé (`FOR SHARE`) et lève une erreur typée
  `FISCAL_YEAR_CLOSED` (409, message « Exercice clos : … ») si l'exercice est
  `CLOSED`. Il est posé dans chaque opération de FR-040, à l'intérieur de sa
  transaction. La règle du budget `CLOSED` (FR-007) reste un contrôle séparé,
  appelé par les seules factures et paiements de prestataires, avec son
  comportement actuel.
- **FR-042** À la clôture, **toutes** les écritures de l'exercice passent à
  `isLocked`, en une requête ; celles que la clôture verrouille sont marquées
  (`locked_by_closing_id`) pour la réouverture. Le bouton « Verrouiller » par
  écriture reste.
- **FR-043** **Exceptions permises**, parce que leur date est dans l'exercice
  ouvert : règlement daté de N+1 d'un appel de N ; crédit de régularisation
  (FR-073) ; relances ; pénalité appliquée, remise de pénalité ; échéanciers ;
  quittances et reçus ; documents ; assemblées ; lectures du portail.
- **FR-044** L'**annulation** d'une facture ou d'un paiement de prestataire est
  refusée quand la **date propre de la pièce** est dans un exercice clos (409
  `FISCAL_YEAR_CLOSED`), au lieu de tester la date du jour : l'annuler changerait
  le réalisé figé d'un budget clos. La correction est une pièce datée de
  l'exercice ouvert (Q13).
- **FR-045** Un budget d'un exercice clos ne se crée ni ne se modifie (déjà vrai
  pour un budget `CLOSED` ; étendu aux budgets créés après la clôture).
- **FR-046** **Concurrence.** La clôture prend le verrou de ligne exclusif de
  l'exercice ; toute opération de FR-040 prend le partagé. Une opération
  commencée avant la clôture se termine avant elle ; une opération
  commencée après voit `CLOSED`. Ordre global des verrous : exercice → lot →
  fonds (comme le commentaire d'en-tête de `fund-credits.ts` l'exige entre lots
  et fonds).

### 6.6 Réouverture

- **FR-050** `POST …/exercices/:year/reouverture` exige : exercice `CLOSED`,
  approbation **différente de `APPROVED`** **[À VALIDER — juriste]**, exercice
  N+1 non clos, permission `SYNDIC_FISCAL_YEAR_REOPEN`, motif de 10 caractères
  au moins.
- **FR-051** Effets, en une transaction : contre-passation de toutes les
  écritures `closing_id` (`reverseSyndicEntryTx`, jamais de suppression), y
  compris `OUV-(N+1)` ; déverrouillage des seules écritures
  `locked_by_closing_id` (un verrou posé à la main reste) ; budgets et
  échéanciers restaurés ; exercice `OPEN` ; clôture active marquée
  `reopenedAt` ; approbation remise à `NOT_SUBMITTED`. Les instantanés de la
  version rouverte sont **conservés**.
- **FR-052** Une nouvelle clôture crée la version suivante ; ses références
  portent `-V2`, `-V3`.
- **FR-053** Journal d'audit obligatoire (motif, utilisateur, version).
- **FR-054** Après approbation constatée, l'exercice est intangible : toute
  correction passe par des pièces datées de l'exercice ouvert **[À VALIDER —
  juriste]**.

### 6.7 Approbation des comptes par l'AGO

- **FR-060** `GMResolution.resolutionKind` (nullable) qualifie une résolution :
  approbation des comptes, quitus, affectation du résultat, budget, autre. Les
  routes de création et de modification l'acceptent ; rien ne change pour une
  résolution sans type.
- **FR-061** `POST …/exercices/:year/soumission-ag` : exercice `CLOSED`
  exigé. Crée une AG de type `ORDINARY` (ou relie une AG existante non clôturée)
  et y ajoute quatre résolutions préremplies — approbation des comptes de
  l'exercice, quitus au syndic, affectation du résultat (si le résultat n'est
  pas nul), budget prévisionnel N+1 (si un brouillon existe) — avec la majorité
  par défaut `ARTICLE_24`, que le scénario retient. **Le rattachement de
  chaque résolution à un article de majorité est une donnée de départ à
  faire valider [À VALIDER — juriste]** : les articles 24, 25 et 26 du code
  sont ceux du droit français, leur pertinence pour le régime applicable
  n'est pas établie (Q3). L'exercice passe à `SUBMITTED`.
- **FR-062** La convocation reste celle de l'AG : quand `soumission-ag` crée
  l'assemblée, la convocation part comme aujourd'hui à la création
  (`notifyMeetingConvocation`, au mieux, après la transaction : un échec est
  journalisé et ne défait pas la soumission) ; relier une AG existante
  n'envoie rien. Le dossier de comptes est joint aux documents de la
  copropriété ; sa publication au portail est explicite (FR-091).
- **FR-063** `POST …/exercices/:year/constat-approbation` : autorisé quand
  l'AG est `COMPLETED` **et** que la résolution d'approbation a un résultat
  (`APPROVED` ou `REJECTED`). `APPROVED` → `approvalStatus = APPROVED`,
  `approvedAt` = date de séance, résolution et assemblée enregistrées ;
  `REJECTED` → `REJECTED`. AG non clôturée → 409. Le constat est un geste
  **explicite** (aucun automatisme au vote) et refait le calcul du résultat
  sur les données de vote, il ne recopie pas un champ saisi.
- **FR-064** Après `REJECTED`, la seule suite est la réouverture (FR-050) puis
  une nouvelle clôture et une nouvelle soumission.
- **FR-065** Quorum et délais sont **indicatifs** : aucun blocage. Une **date
  limite indicative** peut être saisie ; l'exercice clos non approuvé au-delà
  s'affiche en orange. Aucun délai légal n'est codé **[À VALIDER — juriste]**
  (Q3).
- **FR-066** `SyndicateBudget.approvedByResolutionId` est refusé si la
  résolution est `REJECTED` (409) ; accepté sinon, par compatibilité avec le
  fonctionnement actuel (le scénario approuve un budget sans AG).
- **FR-067** Le procès-verbal reste le compte rendu Word existant, déposé
  manuellement aux documents (type « PV d'AG ») : inchangé.
- **FR-068** Visa de vérification libre : `reviewedBy` (texte) et
  `reviewedAt`, affichés sur le dossier. Ce n'est pas le conseil syndical.

### 6.8 Régularisation des charges après le vote

- **FR-070** **Périmètre** : les appels de l'exercice émis en campagnes
  `REGULAR` (charges courantes) et les budgets dont ils sont issus. Les appels
  de campagnes `EXCEPTIONAL` (travaux) sont exclus : leur solde reste au fonds
  de travaux par l'affectation `AFF-N` (516 000 dans le jeu de référence, qui
  n'entre pas dans les 1 163 700 de la résolution 3). Un budget n'a pas de
  nature propre : c'est la campagne d'appel qui la porte.
  **[À VALIDER — expert-comptable]**
- **FR-071** **Calcul.** Pour chaque poste ℓ des budgets concernés, de clé K :
  `réel_ℓ` = somme des factures TTC non annulées rattachées au poste et datées
  de l'exercice ; part du lot = `réel_ℓ` réparti par la clé K (mêmes poids et
  même règle d'arrondi que la répartition du budget : le dernier lot absorbe
  le reliquat) ; provision du poste pour le lot = sa répartition du poste pour
  ce lot × (montant **appelé** au lot en campagnes `REGULAR` au titre du
  budget ÷ total réparti à ce lot pour ce budget). Écart du lot = somme des
  provisions − somme des parts ; positif = excédent, négatif = déficit. Une facture non rattachée est répartie par
  tantièmes généraux (`CLO-W07`). Base **appelée**, pas encaissée : c'est celle
  du scénario (le crédit de B02, qui n'a pas tout payé, se compense avec sa
  dette) **[À VALIDER — expert-comptable]** (Q8). `GET
…/exercices/:year/regularisation/apercu` calcule sans rien écrire.
- **FR-072** **Préalables d'application** : exercice `CLOSED` ; résolution de
  type `RESULT_ALLOCATION`, `APPROVED`, d'une assemblée `COMPLETED` de la
  copropriété ; date d'effet postérieure ou égale à la séance et dans un
  exercice ouvert ; jamais déjà appliquée (409
  `REGULARISATION_ALREADY_APPLIED`). Décision : `SETTLE_PER_LOT` ou
  `KEEP_IN_FUND`.
- **FR-073** **Excédent d'un lot** (`SETTLE_PER_LOT`) : création d'un
  `ChargePayment` de nature `REGULARISATION` (montant = écart, `paidAt` = date
  d'effet, référence `REG-N`), crédit du compte de lot libellé « Régularisation
  charges N (AGO du …) », **imputation immédiate** sur les appels ouverts les
  plus anciens (`applyLotAdvanceTx`) ; le reliquat reste **avance** du lot et
  s'impute sur le prochain appel, comme toute avance. Pas de reçu de paiement ;
  la quittance d'un appel soldé est émise comme d'habitude ; **aucun fonds
  n'est crédité** (l'argent y est déjà) ; le crédit n'est pas un encaissement.
  Répond à l'« écart à signaler » de N.10 : l'ajustement devient bien une
  avance imputable.
- **FR-074** **Déficit d'un lot** : appel de régularisation, dans l'exercice
  ouvert (campagne `EXCEPTIONAL` « Régularisation charges N », échéance
  saisie), avec avis d'appel et imputation d'avance habituels.
- **FR-075** `KEEP_IN_FUND` : aucun mouvement sur les lots ; la décision est
  seulement enregistrée (solde du résultat laissé au fonds).
- **FR-076** Écriture `REG-N`, datée de la date d'effet, journal `OD` de
  l'exercice ouvert : débit du compte de capitaux propres du fonds concerné,
  crédit du compte des copropriétaires ligne par lot (excédent) ; sens
  inverse pour un déficit **[À VALIDER — expert-comptable]**.
- **FR-077** L'application est **atomique et unique** : une transaction, lots
  verrouillés dans l'ordre croissant d'identifiant (`sortLotIdsForLocking`),
  contrainte d'unicité par exercice.
- **FR-078** **Non annulable en V1** : l'aperçu et une confirmation renforcée
  sont le garde-fou ; une erreur se corrige par ajustements datés de
  l'exercice ouvert (Q15).

### 6.9 Dossier de comptes

- **FR-080** Le dossier est un **PDF** généré à la clôture, avec l'en-tête du
  mandant ou de l'agence (`resolveDocumentBranding`), figé depuis
  `SyndicFiscalYearClosing.summary` (un **original** : il ne se régénère pas
  en silence ; s'il manque il est reconstruit à l'identique depuis le
  snapshot, comme les quittances S3). Contenu proposé **[À VALIDER —
  expert-comptable]** : (1) page de garde et date d'arrêté ; (2) état financier
  — produits, charges par poste, résultat, réalisé contre budget ; (3) situation
  des fonds ; (4) trésorerie et rapprochement ; (5) état des créances par lot
  (soldes débiteurs et avances) ; (6) état des dettes par prestataire ; (7)
  balance générale. Il répond au constat N.8-7 (annexes comptables).
- **FR-081** Le fichier est stocké en **privé** ; il ne sort que par une route
  authentifiée (jamais de chemin disque ni d'identifiant `/uploads/…`).
- **FR-082** Le grand livre détaillé n'est pas dans le PDF (volume) ; il se
  consulte à l'écran et s'exporte en tableur _(lot C3, optionnel)_.
- **FR-083** Le dossier d'une version rouverte reste consultable (archive).
- **FR-084** Le dossier ne contient que des données de la copropriété et de
  l'agence de l'appelant.

### 6.10 Portail copropriétaire

- **FR-090** `GET /api/portal/copropriete/coproprietes/:syndicId/exercices` liste les
  exercices clos **publiés** de la copropriété d'un lot ouvert au portail ;
  `GET …/exercices/:year/dossier` télécharge le PDF. Un exercice terminé avant
  l'acquisition du lot est masqué (même règle que les documents d'un ancien
  propriétaire).
- **FR-091** La **publication** est un geste du syndic
  (`dossierPublishedAt`) : rien n'est visible avant. Le moment et le délai de
  mise à disposition avant l'AG **[À VALIDER — juriste]** (Q12).
- **FR-092** Le résultat de l'approbation (approuvé, rejeté, date) s'affiche une
  fois constaté.
- **FR-093** Le relevé de lot (écran et PDF) affiche « Solde reporté au
  01/01/N+1 » d'après la chaîne du compte, égal à l'instantané. Aucun chemin
  disque n'est renvoyé (`portal-no-disk-paths`) ; le téléchargement passe par
  le limiteur `coOwnerPortalPdfRateLimiter`.

### 6.11 Transverses

- **FR-100** Permissions `SYNDIC_FISCAL_YEAR_VIEW`, `_PREPARE`, `_CLOSE`,
  `_REOPEN`, créées par un seed dédié (modèle : `finance-permissions-seed.ts`)
  et attribuées à `TENANT_ADMIN` (toutes), `TENANT_MANAGER` et
  `TENANT_ACCOUNTANT` (`VIEW`, `PREPARE`). Correspondance route → droit au
  §4 du [plan](./plan.md). Les routes restent sous le préfixe `/syndics`
  (fonctionnalité `SYNDIC` de l'abonnement).
- **FR-101** **Isolation** : chaque identifiant reçu (compte, fonds, lot,
  assemblée, résolution, budget) est vérifié comme appartenant à l'agence et à
  la copropriété ; une référence étrangère lève la même `NotFoundError` qu'un
  objet inexistant. Tout modèle nouveau porte `tenantId`.
- **FR-102** **Audit** (`logAuditEvent`) : ouverture, clôture, réouverture,
  soumission à l'AG, constat, application de la régularisation, publication du
  dossier, paramétrage comptable. Jamais le contenu des chiffres.
- **FR-103** Tous les libellés passent par `t()` (fr, en, ar) ; marges en
  propriétés logiques ; aucun texte de gestionnaire n'utilise `dangerouslySetInnerHTML`.
- **FR-104** **Cibles de performance** (à confirmer sur volumétrie réelle,
  Q16) : pour 300 lots, 4 000 appels, 5 000 paiements, 500 écritures —
  aperçu ≤ 5 s, clôture ≤ 15 s, contrôles ≤ 3 s.
- **FR-105** Aucune variable d'environnement nouvelle.
- **FR-106** Aucun changement de comportement hors ceux nommés : FR-005,
  FR-040 (nouveaux refus), FR-044 (annulation), FR-066.
- **FR-107** À la livraison de chaque lot : inventaire des fonctionnalités
  (`npm run wiki:export`), scénario de recette (partie N réécrite pour jouer
  les nouveaux écrans), `SECURITY.md` (verrou d'exercice), HANDOFF.

## 7. Cas limites

| #    | Cas                                                                  | Traitement                                                                                                                                                                                                                        |
| ---- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-01 | Copropriété sans budget, sans appel ni écriture dans l'exercice.     | Clôture possible (aucune OD) ; `CLO-W05`. N+1 s'ouvre.                                                                                                                                                                            |
| E-02 | Lot sans copropriétaire mais avec appels.                            | `CLO-B04` : aucun compte de lot n'existe.                                                                                                                                                                                         |
| E-03 | Changement de propriétaire d'un lot pendant l'exercice.              | Le compte suit le **lot** ; le copropriétaire à la date d'arrêté est mémorisé (`ownerContactId`) ; le crédit de régularisation suit le lot ; la répartition vendeur/acquéreur est hors périmètre **[À VALIDER — juriste]** (Q14). |
| E-04 | Paiement reçu en N pour un appel de N+1.                             | Avance à la date d'arrêté : compte des copropriétaires créditeur, reportée.                                                                                                                                                       |
| E-05 | Paiement de N+1 qui solde un appel de N.                             | Permis (D8) ; daté N+1 ; le fonds est crédité à cette date ; l'écriture d'encaissement arrive à la clôture de N+1.                                                                                                                |
| E-06 | Tentative de saisir un paiement daté de N après la clôture.          | 409 `FISCAL_YEAR_CLOSED`.                                                                                                                                                                                                         |
| E-07 | Facture de N reçue en janvier N+1 avant la clôture de N.             | Saisie possible dans N (encore ouvert). Après clôture : charge de N+1 (la coupure des comptes est hors périmètre **[À VALIDER — expert-comptable]**).                                                                             |
| E-08 | Appel de N émis tardivement, ou période à cheval sur deux exercices. | `CLO-W08` ; l'écart d'identité du lot figure dans `otherMovements`.                                                                                                                                                               |
| E-09 | Exercice N+2 entamé alors que N n'est pas approuvé.                  | `CLO-W04` seulement.                                                                                                                                                                                                              |
| E-10 | Comptes rejetés par l'AG.                                            | `REJECTED` → réouverture → version 2 → nouvelle soumission.                                                                                                                                                                       |
| E-11 | Deux clôtures ou une clôture et un paiement en même temps.           | FR-046 ; un seul gagne, l'autre reçoit 409 ou attend.                                                                                                                                                                             |
| E-12 | Aperçu périmé (une écriture a bougé).                                | `PREVIEW_STALE`.                                                                                                                                                                                                                  |
| E-13 | Copropriété `IN_LIQUIDATION`.                                        | Clôture permise ; N+1 non créé (Q10).                                                                                                                                                                                             |
| E-14 | Arrondis (XOF entier, `Decimal(12/14, 2)`).                          | Le dernier lot absorbe le reliquat, comme `distributeLineAmount`.                                                                                                                                                                 |
| E-15 | Écritures anciennes sans date métier de fonds.                       | Reprise au mieux (data-model §6) ; risque R-01.                                                                                                                                                                                   |
| E-16 | Données de démonstration au fuseau simulé.                           | Les jours sont UTC ; le scénario simule 2026 en septembre 2026 : `CLO-W01` doit être reconnu pour clôturer.                                                                                                                       |

## 8. Risques

| #    | Risque                                                                                                                                                                             | Parade                                                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | **Soldes « à date » sur des dates de saisie.** Les mouvements de fonds n'ont que `createdAt`.                                                                                      | Colonne `occurredAt` (data-model §3), reprise au mieux, écrite par tous les nouveaux mouvements ; tests d'invariant I-5.            |
| R-02 | **Crédit de régularisation = `ChargePayment`** : cinq fichiers le lisent (`charge-allocation`, `charge-receipts`, `charge-monthly-tracking`, `coowner-portal-finance`, `queries`). | Nature `REGULARISATION` par défaut `CASH` ; un test par consommateur (I-8) ; lot C5 dernier, indépendant des autres.                |
| R-03 | **Concurrence** clôture / saisies et interblocages (verrous de lot, de fonds, d'exercice).                                                                                         | Ordre global exercice → lot → fonds (FR-046) ; test à deux connexions sur base réelle.                                              |
| R-04 | **Choix comptables** faux si figés dans le code.                                                                                                                                   | Comptes paramétrables (D5) ; aperçu ligne à ligne relu par la comptable avant toute écriture ; expert-comptable en Q1, Q2, Q8.      |
| R-05 | **Changement de comportement** des annulations de facture et de paiement après clôture, et des refus datés (FR-005, FR-040, FR-044).                                               | Nommés en FR-106, documentés dans le scénario, tests de non-régression de la suite Syndic.                                          |
| R-06 | **Taille de `queries.ts`** (5 029 lignes) et conflits avec les lots en vol.                                                                                                        | D13 ; les gardes se posent par un appel d'une ligne dans les fonctions existantes.                                                  |
| R-07 | **Volume** : l'aperçu lit toute la copropriété.                                                                                                                                    | Agrégations SQL par lot, pas de chargement d'objets ; cibles FR-104 vérifiées par un test de charge.                                |
| R-08 | **Cadre légal inconnu** (régime de copropriété, majorités, délais).                                                                                                                | Rien de légal n'est bloquant ni codé ; questions Q3, Q5, Q12 ; libellés « indicatif ».                                              |
| R-09 | **Réalisé TTC** (`amountActual`) : une charge est comptée à la facture, pas au paiement.                                                                                           | Cohérent avec l'écriture de facture (débit 624 au TTC) ; à confirmer par l'expert-comptable (Q2).                                   |
| R-10 | **Lecture qui écrit** : `getOwnerAccountByLot` rapproche le grand livre en lisant.                                                                                                 | Les contrôles et l'aperçu utilisent des lectures pures ; le rapprochement est fait dans la transaction de clôture (FR-010, FR-030). |
| R-11 | **Pas de migration de données** : d'anciens exercices sans instantané.                                                                                                             | D2 : aucune donnée migrée ; la première vraie clôture d'une copropriété existante passe par la reprise des soldes (FR-008).         |
| R-12 | **Assistant long** : perte d'état si l'utilisateur quitte.                                                                                                                         | Seuls le paramétrage et les soldes de relevé se persistent ; l'aperçu se recalcule à la demande.                                    |

## 9. Jeu de référence — « Résidence Les Flamboyants », exercice 2026

Chiffres du scénario de recette (partie N et annexe A), à retrouver **sans
saisie** après la clôture. Ils servent de fixture aux tests d'intégration.

| Élément                                                  |                 Valeur |
| -------------------------------------------------------- | ---------------------: |
| Appels 2026 (44 appels)                                  |             17 000 000 |
| dont charges courantes / travaux                         | 12 000 000 / 5 000 000 |
| Encaissements copropriétaires                            |             16 700 000 |
| Reste dû au 31/12 (B02, T4)                              |                300 000 |
| Avances au 31/12                                         |                      0 |
| Dépenses TTC (22 factures) : charges / travaux           | 10 836 300 / 4 484 000 |
| Fonds de roulement, ouverture → clôture                  |  1 500 000 → 2 363 700 |
| Fonds de travaux, ouverture → clôture                    |  2 500 000 → 3 016 000 |
| Trésorerie (521) = total des fonds                       |              5 379 700 |
| Résultat de l'exercice (17 000 000 − 15 320 300)         |              1 679 700 |
| Excédent des charges courantes (12 000 000 − 10 836 300) |     1 163 700 (9,70 %) |

Écritures attendues à l'aperçu (journal `OD`) :

| Référence  | Date       | Lignes                                                                                                                                 |
| ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `APP-2026` | 31/12/2026 | 4500 débit 12 000 000 (8 lots) / 7010 crédit 12 000 000                                                                                |
| `TRV-2026` | 31/12/2026 | 4500 débit 5 000 000 (8 lots) / 7020 crédit 5 000 000                                                                                  |
| `ENC-2026` | 31/12/2026 | 521 débit 16 700 000 / 4500 crédit 16 700 000 (8 lots)                                                                                 |
| `PEN-2026` | —          | absente : la pénalité de 30 000 est intégralement remise                                                                               |
| `AFF-2026` | 31/12/2026 | 7010 débit 12 000 000, 7020 débit 5 000 000 / 624 crédit 10 836 300, 6241 crédit 4 484 000, 1010 crédit 1 163 700, 1020 crédit 516 000 |
| `OUV-2027` | 01/01/2027 | 521 débit 5 379 700, 4500 débit 300 000 (B02) / 1010 crédit 2 663 700, 1020 crédit 3 016 000                                           |

Régularisation après l'AGO du 20/03/2027 (résolution 3 approuvée à 1 000
tantièmes sur 1 000) — crédit par lot : A101, A102, A201, A202 : 174 555 chacun ;
B01 : 232 740 ; B02 : 116 370 ; P01, P02 : 58 185 chacun ; total 1 163 700.
Après imputation : B02 à **183 630 débiteur** (300 000 − 116 370), les sept
autres lots créditeurs de leur crédit (avance). Écriture `REG-2026` : 1010
débit 1 163 700 / 4500 crédit 1 163 700.

Résolutions de l'AGO (scénario N.9) servant aux critères d'approbation :
résolution 1 « Approbation des comptes 2026 » approuvée (900 contre 100
tantièmes) ; résolution 3 « Excédent de 1 163 700 FCFA crédité aux
copropriétaires » approuvée (1 000 contre 0).

## 10. Critères d'acceptation

Chaque critère est vérifiable par un test automatisé (API Jest, intégration sur
base `DATABASE_URL_TEST`, web Vitest) ou, à défaut, par la recette rejouée.

| CA    | FR                           | Critère                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-01 | 001, 002                     | Sur la copropriété de référence, `GET …/exercices` renvoie 2026 (`OPEN`, du 2026-01-01 au 2026-12-31) et une ligne créée en base ; un second appel ne crée aucun doublon (unicité `(copropriété, année)`).                                                                                                                                                                                                                                                                 |
| CA-02 | 013, 020                     | Avant paramétrage, `controles` renvoie `CLO-B03` ; après `plan-minimal` et paramétrage, aucun bloquant ; `CLO-W01` figure tant que la date du jour est antérieure au 31/12/2026. `CLO-I02` : 1 lot, 300 000. Le second appel de `plan-minimal` ne crée aucun compte en double ; les comptes 1010, 1020, 4500, 521, 7010, 7020 et 7580 existent.                                                                                                                            |
| CA-03 | 022, 023, 024, 026, 029, 027 | L'aperçu du jeu de référence contient exactement les écritures du §9 (montants, comptes, 8 lignes de lot sur 4500 pour APP, TRV et ENC), toutes équilibrées ; `PEN-2026` est absente. Chaque écriture porte `sourceType = MANUAL`, `documentType = SYNDIC_FISCAL_YEAR_CLOSING`, la référence `<CODE>-2026` et est verrouillée dès sa création.                                                                                                                             |
| CA-04 | 036                          | `OUV-2027` : 521 débit 5 379 700, 4500 débit 300 000 avec `lotId` de B02, 1010 crédit 2 663 700, 1020 crédit 3 016 000 ; total 5 679 700 des deux côtés.                                                                                                                                                                                                                                                                                                                   |
| CA-05 | 015                          | Rapprochement du jeu de référence : 521 = 5 379 700 = 2 363 700 + 3 016 000 ; écart 0, pas de `CLO-W02`. Variante : un paiement de 100 000 laissé en avance porte le 521 à 5 479 700 alors que les fonds restent à 5 379 700 ; l'écart de 100 000 est **expliqué** par l'avance, l'écart non expliqué reste 0.                                                                                                                                                             |
| CA-06 | 033                          | Instantané de lots : B02 clôture +300 000, avance 0 ; A101 appelé 2 650 000, encaissé 2 650 000 ; somme des `closingBalance` = 300 000 ; identité de I-4 vérifiée pour les 8 lots.                                                                                                                                                                                                                                                                                         |
| CA-07 | 034                          | Instantané de fonds : fonds de roulement 1 500 000 / 11 700 000 / 10 836 300 / 2 363 700 ; fonds de travaux 2 500 000 / 5 000 000 / 4 484 000 / 3 016 000 (paire d'erreur I.6 neutralisée) ; comptes de capitaux propres après affectation : 2 663 700 et 3 016 000.                                                                                                                                                                                                       |
| CA-08 | 030, 038, 042, 021, 028, 035 | Après `cloture` : exercice `CLOSED` ; toute écriture datée 2026 est `isLocked` ; les budgets 2026 sont `CLOSED` ; 2027 existe `OPEN` ; `OUV-2027` est en base ; le résumé figé porte les chiffres du §9. Les journaux `OD` de 2026 et de 2027 existent ; le nombre d'écritures de factures et de paiements de prestataires est inchangé (aucune n'est régénérée) ; le report à nouveau est complet : une ligne d'instantané par lot et par fonds.                          |
| CA-09 | 031, 032                     | Deuxième `cloture` → 409 `FISCAL_YEAR_ALREADY_CLOSED`. Si un paiement est saisi entre l'aperçu et la clôture, 409 `PREVIEW_STALE` et **rien** n'est écrit (comptage des écritures inchangé).                                                                                                                                                                                                                                                                               |
| CA-10 | 011, 004, 012                | Clôture de 2027 alors que 2026 est ouvert et actif → 409 `CLOSING_BLOCKED` avec `CLO-B01`. Un bloquant présent → 409 avec la liste ; un avertissement non reconnu → 409 `WARNINGS_NOT_ACKNOWLEDGED`.                                                                                                                                                                                                                                                                       |
| CA-11 | 040, 041                     | Exercice 2026 clos : chacune des huit opérations du tableau FR-040, datée en 2026, répond 409 `FISCAL_YEAR_CLOSED` ; les mêmes datées en 2027 réussissent.                                                                                                                                                                                                                                                                                                                 |
| CA-12 | 043, 073                     | Après clôture, B02 paie 300 000 le 10/02/2027 (avant toute régularisation) sur le T4 2026 : appel `PAID`, quittance émise, fonds de roulement crédité **à cette date**, aucune écriture d'encaissement n'est ajoutée à 2026, solde reporté de l'instantané inchangé.                                                                                                                                                                                                       |
| CA-13 | 044                          | Annuler une facture datée 2026 après la clôture → 409 ; le réalisé du budget 2026 est inchangé. Annuler une facture datée 2027 réussit.                                                                                                                                                                                                                                                                                                                                    |
| CA-14 | 050, 051, 052, 053, 003, 083 | Réouverture sans motif ou avec motif de 9 caractères → 400. Avec motif valide : exercice `OPEN`, écritures `closing_id` contre-passées (y compris `OUV-2027`), écritures `locked_by_closing_id` déverrouillées, budgets restaurés à leur statut d'avant, ligne d'audit écrite. Une nouvelle clôture crée la version 2 et les références `APP-2026-V2`. Le statut d'approbation retombe à `NOT_SUBMITTED` ; le dossier de la version 1 reste téléchargeable (`?version=1`). |
| CA-15 | 050, 054                     | Réouverture refusée (409) si l'approbation est `APPROVED`, ou si 2027 est clos. Un verrou posé à la main avant la clôture reste posé après réouverture.                                                                                                                                                                                                                                                                                                                    |
| CA-16 | 061, 060, 062                | `soumission-ag` sur un exercice `OPEN` → 409. Sur `CLOSED` : une AG `ORDINARY` avec 4 résolutions de types distincts, majorité `ARTICLE_24`, exercice `SUBMITTED`. Relier une AG déjà `COMPLETED` → 409. Les types de résolution sont enregistrés ; l'AG créée envoie sa convocation (échec d'envoi journalisé sans défaire la soumission) ; relier une AG existante n'envoie rien.                                                                                        |
| CA-17 | 063, 064                     | AG non clôturée → 409. AG clôturée, résolution « Approbation des comptes » `APPROVED` (900 contre 100) → `APPROVED` avec date de séance ; `REJECTED` → `REJECTED`. Le constat recalcule le résultat sur les votes. Après `REJECTED`, la réouverture est permise (CA-14).                                                                                                                                                                                                   |
| CA-18 | 066                          | `approvedByResolutionId` désignant une résolution `REJECTED` → 409 ; désignant une résolution `APPROVED` ou libre → accepté.                                                                                                                                                                                                                                                                                                                                               |
| CA-19 | 071, 070                     | Aperçu de régularisation du jeu de référence : écarts 174 555 (×4), 232 740, 116 370, 58 185 (×2) ; total 1 163 700 ; budget de travaux exclu.                                                                                                                                                                                                                                                                                                                             |
| CA-20 | 072                          | Application sans résolution `RESULT_ALLOCATION` `APPROVED` → 409 ; date d'effet antérieure à la séance → 422 ; seconde application → 409 `REGULARISATION_ALREADY_APPLIED`.                                                                                                                                                                                                                                                                                                 |
| CA-21 | 073, 076, 077                | `SETTLE_PER_LOT` sur le jeu de référence : 8 crédits ; B02 à 183 630 débiteur et T4 2026 `PARTIAL` ; les 7 autres lots avec avance égale à leur crédit ; `REG-2026` 1010 débit 1 163 700 / 4500 crédit 1 163 700 ; en cas d'échec au 5ᵉ lot, aucun crédit n'est conservé.                                                                                                                                                                                                  |
| CA-22 | 073                          | Un crédit de régularisation n'émet aucun reçu, ne crédite aucun fonds, n'entre pas dans « Total encaissé » ni dans « Mes paiements → encaissements » ; il entre dans « Total réglé » des appels qu'il solde ; l'appel soldé émet une quittance.                                                                                                                                                                                                                            |
| CA-23 | 073                          | Après régularisation, émission du T1 2027 d'un lot avec avance : appel `PAID` dès sa création, quittance émise, **aucun crédit de fonds** pour la part imputée.                                                                                                                                                                                                                                                                                                            |
| CA-24 | 074                          | Sur un jeu à déficit (réel > provisions de 200 000 pour un lot) : `SETTLE_PER_LOT` crée un appel de régularisation de 200 000 daté de l'exercice ouvert, avec avis.                                                                                                                                                                                                                                                                                                        |
| CA-25 | 080, 081, 068                | Le dossier PDF de 2026 existe après la clôture, comporte les chiffres du §9 (résultat 1 679 700, créances 300 000) et l'en-tête du mandant ; il se télécharge par la route authentifiée ; sa réponse ne contient aucun chemin disque. Le visa de vérification saisi apparaît sur le dossier.                                                                                                                                                                               |
| CA-26 | 090, 091, 092, 093           | Un copropriétaire d'un lot ouvert au portail : exercice non publié → absent de la liste ; publié → présent avec son dossier ; `APPROVED` → résultat affiché ; le relevé de son lot affiche « Solde reporté au 01/01/2027 » égal à l'instantané. Un copropriétaire d'une autre copropriété reçoit 404.                                                                                                                                                                      |
| CA-27 | 101, 084                     | Un utilisateur d'une autre agence, avec un `exerciceId`, un `lotId`, un `budgetId`, un `meetingId` ou un `fundId` de l'agence A → 404 identique à un objet inexistant sur chaque route ; `npm run test:isolation` couvre toutes les routes de l'agence de cette spécification. Le dossier de comptes d'un exercice de l'agence A répond 404 à l'agence B.                                                                                                                  |
| CA-28 | 100                          | Sans `SYNDIC_FISCAL_YEAR_CLOSE`, `cloture` → 403 ; la comptable (`VIEW`, `PREPARE`) obtient l'aperçu mais pas la clôture ; un utilisateur avec seulement `PROPERTIES_EDIT` n'obtient rien.                                                                                                                                                                                                                                                                                 |
| CA-29 | 046                          | Deux connexions : (a) paiement daté 2026 commencé avant la clôture → soit il se termine avant et figure dans l'empreinte (donc `PREVIEW_STALE` si l'aperçu est plus ancien), soit la clôture attend ; (b) après commit de la clôture, aucun paiement daté 2026 ne peut être validé. Aucun interblocage.                                                                                                                                                                    |
| CA-30 | 104                          | Jeu de 300 lots, 4 000 appels, 5 000 paiements, 500 écritures : aperçu ≤ 5 s, clôture ≤ 15 s, contrôles ≤ 3 s.                                                                                                                                                                                                                                                                                                                                                             |
| CA-31 | 006                          | `balance?exercice=2027` après clôture de 2026 : équilibrée, contient `OUV-2027` et aucune écriture de 2026 ; sans paramètre, résultat identique à celui d'avant la fonctionnalité.                                                                                                                                                                                                                                                                                         |
| CA-32 | 002, 034                     | Après la migration, chaque mouvement de fonds a un `occurred_at` ; pour les mouvements de paiements de prestataires il égale la date du paiement ; un règlement du 30/12 saisi le 05/01 compte dans l'exercice clos.                                                                                                                                                                                                                                                       |
| CA-33 | 039                          | Échéancier `ACTIVE` d'un appel soldé → `COMPLETED` à la clôture ; d'un appel non soldé → inchangé ; les deux sont restaurés à la réouverture.                                                                                                                                                                                                                                                                                                                              |
| CA-34 | 005                          | Écriture datée 2027 dans un journal d'exercice 2026 → 422.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CA-35 | 008                          | _(C6)_ Reprise du premier exercice : 521 débit 4 000 000, 1010 crédit 1 500 000, 1020 crédit 2 500 000 proposés d'après les fonds du scénario, validés puis postés ; la balance d'ouverture est équilibrée.                                                                                                                                                                                                                                                                |
| CA-36 | 037                          | _(C6)_ `budget-suivant` crée un budget 2027 en `DRAFT` avec les mêmes postes ; il n'est jamais `APPROVED` sans l'acte existant.                                                                                                                                                                                                                                                                                                                                            |
| CA-37 | 102                          | Clôture, réouverture, soumission, constat, régularisation, publication et paramétrage écrivent chacun une ligne d'audit sans montant.                                                                                                                                                                                                                                                                                                                                      |
| CA-38 | 103, 107                     | Les catalogues fr, en, ar sont complets pour tous les textes nouveaux (`npm run i18n:extract` sans orphelin) ; aucune propriété CSS physique ; le wiki (`wiki:check`) et le scénario N sont à jour.                                                                                                                                                                                                                                                                        |
| CA-39 | 101, 100                     | `routes-inventory` et `schema-tenant-coverage` passent : toutes les routes nouvelles portent leurs gardes, tous les modèles nouveaux portent `tenantId`.                                                                                                                                                                                                                                                                                                                   |
| CA-40 | 106                          | Suite Syndic existante (allocation, quittances, factures de prestataires, budgets, portail, appels automatiques) verte à chaque lot, hors les refus nommés en FR-106, dont les tests sont adaptés.                                                                                                                                                                                                                                                                         |
| CA-41 | 010, 029                     | Contrôles et aperçu ne modifient rien : décompte des lignes (écritures, transactions de comptes de lots, paiements, mouvements de fonds, exercices déjà présents) et `updatedAt` inchangés avant et après, y compris pour un lot dont le grand livre serait à rapprocher.                                                                                                                                                                                                  |
| CA-42 | 025                          | Un ajustement manuel de 50 000 crédité à un lot en 2026 : `CLO-B08` tant qu'aucune contrepartie n'est choisie ; avec `adjustmentAccountId`, l'aperçu contient `AJU-2026` (4500 crédit 50 000 au lot concerné, contrepartie débit 50 000).                                                                                                                                                                                                                                  |
| CA-43 | 016                          | Solde de relevé saisi de 5 379 700 : pas de `CLO-W09` ; de 5 300 000 : `CLO-W09` avec un écart de 79 700 ; aucun solde saisi : `CLO-W09`. Saisie et suppression refusées sur un exercice clos.                                                                                                                                                                                                                                                                             |
| CA-44 | 045                          | Après la clôture de 2026, créer un budget d'exercice 2026 → 409 ; modifier un budget 2026 → 409 ; créer un budget 2027 réussit.                                                                                                                                                                                                                                                                                                                                            |
| CA-45 | 075, 077                     | `KEEP_IN_FUND` : aucun crédit, aucun appel, aucune écriture `REG` ; la décision est enregistrée ; une application ultérieure (`SETTLE_PER_LOT` ou autre) → 409 `REGULARISATION_ALREADY_APPLIED`.                                                                                                                                                                                                                                                                           |
| CA-46 | 065                          | Un exercice clos non approuvé dont la date limite indicative est dépassée est renvoyé avec `approvalOverdue = true` ; aucune opération n'est bloquée pour autant.                                                                                                                                                                                                                                                                                                          |
| CA-47 | 007                          | Un budget `CLOSED` d'une année **sans** clôture d'exercice continue de refuser les factures et paiements de prestataires de cette année, et **n'empêche ni** un paiement de copropriétaire, ni un appel, ni une écriture manuelle datés de la même année.                                                                                                                                                                                                                  |

**Sans critère automatisé** : FR-067, FR-078, FR-082 et FR-105 énoncent des
choix de non-changement ou de non-fonctionnalité (procès-verbal inchangé,
régularisation non annulable, grand livre absent du PDF, aucune variable
d'environnement) ; ils se vérifient à la revue de code, pas par un test.

## 11. Découpage en lots livrables

Détail (contenu, fichiers, dépendances, tests) dans le [plan](./plan.md) et
les [tâches](./tasks.md). Une PR par lot, indépendante quand c'est possible.

| Lot | Contenu                                                                                                                            | Taille | Dépend de | Valeur seule                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- | ---------------------------------------------------------------------------------- |
| C0  | Socle : exercice, garde unique, dates métier des fonds, comptes minimaux et paramétrage, balance par exercice, écran « Exercices » | M      | —         | Verrou fiable de toutes les écritures ; balance par exercice ; liste des exercices |
| C1  | Contrôles, rapprochement de trésorerie, solde de relevé, **aperçu** des écritures et des états (lecture seule)                     | M      | C0        | Le syndic voit ce que donnerait la clôture, sans rien écrire                       |
| C2  | **Clôture** atomique, écritures, instantanés, ouverture N+1, réouverture, budgets et échéanciers                                   | L      | C0, C1    | Arrêté des comptes complet (cœur de la fonctionnalité)                             |
| C3  | Dossier de comptes PDF, publication, portail (exercices, solde reporté), export tableur                                            | M      | C2        | Annexes comptables (N.8-7) et transparence copropriétaires                         |
| C4  | Résolutions typées, soumission à l'AGO, constat d'approbation, visa, date limite indicative                                        | M      | C2        | Approbation des comptes reliée au vote                                             |
| C5  | Régularisation après le vote : aperçu, crédit non monétaire, appel de régularisation, écriture `REG`                               | L      | C2, C4    | Régularisation automatique (N.8-4) — le lot le plus risqué, livré en dernier       |
| C6  | Compléments : reprise du premier exercice, budget N+1 préparé, écran « Comptes bancaires » (Q11), alertes de clôture               | S à M  | C2        | Confort ; chacun peut être écarté sans conséquence                                 |

Chemin critique : C0 → C1 → C2 → C4 → C5 ; C3 se fait en parallèle de C4.

## 12. Inventaire des fonctionnalités à ajouter à la livraison

À reporter dans `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx`
(`npm run wiki:export`) lot par lot : exercices (liste, détail) ; contrôles ;
aperçu ; paramétrage comptable et plan minimal ; solde de relevé ; clôture ;
réouverture ; dossier de comptes (génération, téléchargement, publication) ;
soumission à l'AG ; constat d'approbation ; aperçu et application de la
régularisation ; budget suivant ; portail « Exercices » ; balance et grand livre
par exercice ; nouvelles permissions. Les fonctionnalités modifiées : balance
et grand livre, annulation de facture et de paiement de prestataire, création
d'écriture, paiements de charges, budgets. Détail au [plan](./plan.md) §9.

## 13. Traçabilité — manque du scénario → exigence

Chaque manque listé en **N.8** et chaque « écart connu » de la partie N (et des
parties qui y renvoient) trouve sa réponse ci-dessous.

| Origine (scénario)                                                         | Constat                                                                                | Réponse                                                                                                                                                  | FR / CA / lot                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| N.8-1                                                                      | Aucun bouton ni écran « Clôturer l'exercice 2026 »                                     | Écran « Exercices » et assistant d'arrêté des comptes ; routes `…/exercices/:year/cloture` et associées.                                                 | FR-001, 030 · CA-08 · C0, C2                        |
| N.8-2 (et N.11 l.1387 « écart N.8-2 »)                                     | Budget 2026 jamais « Clôturé » ou « Révisé »                                           | **Déjà livré** le 28/09 (`aded0be5`, transitions et boutons). Reste : la clôture d'exercice fige les budgets de l'année en `CLOSED`.                     | FR-038 · CA-08 · C2                                 |
| N.8-3 (et I.3 l.895, N.5 l.1236 « écart connu N.8 »)                       | Réalisé par poste et écart budget/réel non affichés                                    | **Déjà livré** (`amountActual`, colonnes Budgété, Réalisé, Écart). Reste : réalisé et écart **figés** dans le résumé et le dossier de comptes.           | FR-029, 080 · CA-25 · C1, C3                        |
| N.8-4 (et N.5, N.7, N.10)                                                  | Régularisation des charges absente (calcul manuel, ajustements)                        | Aperçu lot par lot, décision de l'AG, crédit ou appel de régularisation, écriture `REG`.                                                                 | FR-070 à 078 · CA-19 à 24 · C5                      |
| N.10 l.1361-1364 (« écart à signaler »)                                    | L'ajustement ne devient pas une avance : l'imputation en 2027 n'est pas automatique    | Le crédit de régularisation est une **avance non monétaire** imputée automatiquement (appels ouverts, puis prochain appel).                              | FR-073 · CA-21 à 23 · C5                            |
| N.8-5                                                                      | Report à nouveau et ouverture automatique de N+1 absents (l'exercice est un nombre)    | Exercice modélisé ; instantanés de lots et de fonds ; `OUV-(N+1)` ; création de N+1 ; « Solde reporté ».                                                 | FR-001, 033 à 036, 093 · CA-04, 06, 07, 26 · C0, C2 |
| N.8-6 (et N.6, « Verrouiller chaque écriture »)                            | Verrouillage écriture par écriture seulement                                           | Verrouillage **en bloc** à la clôture + garde de verrou sur toutes les pièces datées dans l'exercice clos.                                               | FR-040 à 046 · CA-08, 11, 29 · C0, C2               |
| N.8-7                                                                      | Annexes comptables de l'AG absentes (seuls relevé par lot et PV Word)                  | Dossier de comptes PDF : état financier, fonds, trésorerie, créances, dettes, balance. Contenu à valider par l'expert-comptable.                         | FR-080 à 084 · CA-25 · C3                           |
| N.8-8                                                                      | Conseil syndical absent                                                                | **Hors périmètre** (non modélisé). Visa libre « vérifié par … le … » sur le dossier ; spécification à part si le besoin est confirmé (Q10).              | FR-068 · C4                                         |
| N.8-9                                                                      | Comptes bancaires : modèle en base, aucun écran                                        | Saisie du solde de relevé à la date d'arrêté et comparaison au 521 dans la clôture. L'écran « Comptes bancaires » complet est un complément _(C6, Q11)_. | FR-016 · CA-05 · C1, C6                             |
| N.8-10                                                                     | Relances par SMS non câblées                                                           | **Hors périmètre** : aucun lien avec la clôture (règle absolue n° 2 du scénario : ne pas tester).                                                        | — (§3)                                              |
| Intro §0.3 l.91 (« clôture formelle n'existe pas »)                        | Constat global                                                                         | Toute la spécification.                                                                                                                                  | §6                                                  |
| L.4 l.1083-1085                                                            | Statut de l'échéancier après solde de l'appel (`COMPLETED` attendu, `ACTIVE` constaté) | Constat confirmé dans le code (aucun code ne le met à jour). La clôture passe à `COMPLETED` les échéanciers d'appels soldés.                             | FR-039 · CA-33 · C2                                 |
| J.4 l.983-984 (« la pénalité a-t-elle débité le compte du lot ? »)         | Interaction pénalité / compte de lot                                                   | Constat : oui (débit `PENALTY`, crédit `WAIVER` à la remise). Les pénalités non remises alimentent `PEN-N` (débit 4500, crédit 7580).                    | FR-023 · CA-03 · C1, C2                             |
| N.6 l.1279-1282                                                            | 1010 comptable (2 663 700) ≠ fonds de roulement (2 363 700), « pas une anomalie »      | Rapprochement de trésorerie qui **explique** l'écart par les créances reportées.                                                                         | FR-015 · CA-05 · C1                                 |
| N.6 l.1238 (« si C.1 l'a permis »)                                         | La comptable peut ne pas atteindre le menu Syndic                                      | Permissions dédiées `SYNDIC_FISCAL_YEAR_*` (D11), attribuées au comptable.                                                                               | FR-100 · CA-28 · C0                                 |
| N.6 (écritures `APP`, `TRV`, `ENC`, `AFF` saisies à la main)               | Écritures de fin d'année sans lien avec les données                                    | Générées depuis les appels, paiements, pénalités et le résultat par fonds ; aperçu ligne à ligne.                                                        | FR-022 à 029 · CA-03 · C1, C2                       |
| N.11 étape 3 (`OUV-2027` à la main) et C.9 (`OD`, comptes, reprise)        | Ouverture et plan comptable minimal saisis à la main                                   | Écriture d'ouverture générée ; plan minimal et journal `OD` créés ; reprise du premier exercice assistée.                                                | FR-008, 020, 021, 036 · CA-04, 35 · C0, C2, C6      |
| N.9 (résolutions sans lien avec les comptes ; documents déposés à la main) | L'AGO n'est reliée ni à l'exercice ni aux comptes                                      | Résolutions typées, soumission et constat de l'approbation ; dossier joint et publié.                                                                    | FR-060 à 068, 091 · CA-16 à 18 · C4                 |
| I.5, I.6 (annulations)                                                     | Annulations de facture et de paiement                                                  | Après clôture, l'annulation d'une pièce d'un exercice clos est refusée ; avant, comportement inchangé.                                                   | FR-044 · CA-13 · C0                                 |

## 14. Questions ouvertes

Les cinq premières bloquent un lot et sont à trancher avant son démarrage.

| #   | Question                                                                                                                                                                                                                                                          | Qui tranche                    | Bloque     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------- |
| Q1  | **Référentiel comptable applicable** aux copropriétés et plan de comptes : les numéros du scénario (4500, 7010, 7020, 7580, 1010, 1020, 521, 401, 624, 6241) sont-ils corrects ? Le code cite SYSCOHADA « à valider par un comptable » sans preuve.               | Expert-comptable               | C0, C1     |
| Q2  | **Nature des fonds** (1010, 1020 en capitaux propres), **affectation du résultat aux fonds**, réalisé au TTC à la facture, contrepartie de la régularisation (`REG`), traitement d'un ajustement manuel de compte de lot.                                         | Expert-comptable               | C1, C2, C5 |
| Q3  | **Cadre légal** : régime de copropriété applicable, majorités de l'approbation des comptes, du quitus et de l'affectation (le code reprend les articles 24, 25, 26 français), délai de tenue de l'AGO, délai de convocation et de mise à disposition des comptes. | Juriste                        | C4         |
| Q4  | **Deux temps** : arrêter et verrouiller **avant** l'approbation (choix D3), ou n'arrêter qu'après le vote ?                                                                                                                                                       | Juriste / utilisateur          | C2, C4     |
| Q5  | **Réouverture** : interdite après approbation (choix D9) ? Autre voie de correction ? Effets du quitus.                                                                                                                                                           | Juriste                        | C2         |
| Q6  | **Exercices non calendaires** : un cabinet en a-t-il besoin ? `Syndicate.fiscalYear` (1 à 12) désigne-t-il le mois de début d'exercice ? (aujourd'hui inutilisé).                                                                                                 | Utilisateur                    | —          |
| Q7  | **Budget provisoire** : les appels du T1 tombent avant le vote du budget N+1 ; le lanceur refuse sans budget approuvé. Faut-il un budget provisoire (reconduction de N) jusqu'au vote ? Pratique locale **[À VALIDER — juriste]**.                                | Utilisateur / juriste          | C6         |
| Q8  | **Régularisation** : base appelée (choix) ou encaissée ; budgets de travaux exclus (choix) ; déficit appelé lot par lot ou prélevé sur un fonds ; un excédent doit-il pouvoir être **remboursé** en argent ?                                                      | Expert-comptable / utilisateur | C5         |
| Q9  | **Séparation des tâches** : la clôture est-elle réservée à l'administrateur (choix) ? Le comptable peut-il clôturer ? Faut-il un contrôle « quatre yeux » (auteur de l'aperçu ≠ auteur de la clôture), qui obligerait à tracer l'aperçu ?                         | Utilisateur                    | C2         |
| Q10 | **Conseil syndical** (vérification des comptes) et copropriété `IN_LIQUIDATION` : à spécifier à part ? Comportement de N+1 à la liquidation.                                                                                                                      | Utilisateur                    | —          |
| Q11 | **Comptes bancaires** : écran complet (CRUD de `SyndicPaymentMethod`) dans cette spécification (C6) ou séparé ? Rapprochement bancaire ligne à ligne : jamais, ou plus tard ?                                                                                     | Utilisateur                    | C6         |
| Q12 | **Portail** : les copropriétaires voient-ils le dossier **avant** l'AG (mise à disposition) ou seulement le PV après ? Qui publie ?                                                                                                                               | Juriste / utilisateur          | C3         |
| Q13 | **Avoirs et factures rectificatives** : indispensables pour corriger une facture d'un exercice clos ? Sinon, hors périmètre confirmé.                                                                                                                             | Utilisateur                    | —          |
| Q14 | **Mutation de lot** : le crédit ou l'appel de régularisation suit-il le lot (choix) ou le copropriétaire de l'exercice ? Répartition vendeur/acquéreur.                                                                                                           | Juriste                        | C5         |
| Q15 | **Annulation d'une régularisation appliquée** : jamais (choix V1), ou tant qu'aucun crédit n'a été imputé ?                                                                                                                                                       | Utilisateur                    | C5         |
| Q16 | **Volumétrie réelle** des copropriétés cibles (nombre de lots) pour confirmer les cibles de performance de FR-104.                                                                                                                                                | Utilisateur                    | —          |
