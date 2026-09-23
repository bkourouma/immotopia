# ImmoTopia — Comptabilité de la gestion locative : points à valider

**Date : 23 septembre 2026.**

Document à l'attention du cabinet comptable. Il décrit ce que l'application écrit réellement en comptabilité aujourd'hui, puis liste les questions sur lesquelles le cabinet doit encore trancher.

Une première version de ce document (Q1 à Q13) a été soumise au cabinet avant la consolidation du plan SYSCOHADA. Cette consolidation ([docs/CONSOLIDATION-SYSCOHADA-IMMOTOPIA.md](../CONSOLIDATION-SYSCOHADA-IMMOTOPIA.md)) a tranché la plupart de ces questions et l'application a été mise à jour en conséquence (lot 10, commit `65ad2cd`). Les comptes, écritures et exemples ci-dessous décrivent donc l'état actuel, après cette mise à jour. Seules les questions encore ouvertes figurent en section 4.

---

## 1. Le principe retenu

L'agence agit en **mandataire** : les loyers qu'elle encaisse appartiennent aux propriétaires, jusqu'à ce qu'elle leur reverse le net. Seuls les honoraires (et, selon les paramètres, les pénalités de retard) sont un produit de l'agence.

- **Tant que le loyer n'est pas encaissé, il n'y a aucune écriture** : pas de créance locataire au 411. Le loyer appelé, mais non payé, n'est suivi que dans le compte du locataire tenu par l'application.
- **Un encaissement reçu mais pas encore rattaché à une échéance est comptabilisé dès sa réception**, comme fonds du mandant « à affecter », puis reclassé vers son compte courant au moment de l'affectation.
- **Les dépôts de garantie sont comptabilisés à l'encaissement**, comme fonds du mandant de nature « dépôt », distincts de son compte courant.
- **Une écriture n'est jamais modifiée ni supprimée.** Toute correction passe par une écriture de contre-passation, qui reste visible et reste liée à l'écriture d'origine.
- **Chaque écriture est rattachée à une pièce** : un paiement, un honoraire, une dépense, un dépôt de garantie, une retenue à la source, un reversement ou une session de caisse.
- **Journaux** : `OP-CASH` pour les mouvements de caisse, `OP-BANK` pour les mouvements de banque, Mobile Money, chèques et cartes, `OP-GENERAL` pour les honoraires, les retenues à la source, les reclassements et les contre-passations. Chaque journal est ouvert par exercice, selon l'année civile de la date de l'écriture.

## 2. Les comptes utilisés

| Compte    | Intitulé dans l'application                                             | Rôle                                                                                                                                                       | Modifiable dans l'application ?                                                     |
| --------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **4731**  | Mandants                                                                | Fonds détenus pour les propriétaires, avec un auxiliaire par propriétaire et une nature (compte courant / dépôt de garantie / à affecter) sur chaque ligne | Oui — Paramètres financiers                                                         |
| **70611** | Honoraires de gestion locative                                          | Produit de l'agence                                                                                                                                        | Oui — Paramètres financiers                                                         |
| **4432**  | TVA facturée sur prestations de services                                | TVA collectée sur les honoraires                                                                                                                           | Oui — Paramètres financiers                                                         |
| **4478**  | Retenues à la source sur loyers                                         | Retenue prélevée pour le compte de la DGI, désactivée par défaut                                                                                           | Oui — Paramètres financiers                                                         |
| **6588**  | Charges diverses — écarts de caisse                                     | Manquants de caisse, après enquête et validation                                                                                                           | Oui — Paramètres financiers                                                         |
| **7588**  | Produits divers — écarts de caisse                                      | Excédents de caisse, après enquête et validation                                                                                                           | Oui — Paramètres financiers                                                         |
| —         | Compte de produit des pénalités (facultatif)                            | Pénalités de retard revenant à l'agence, si les paramètres le prévoient                                                                                    | Oui — Paramètres financiers, requis si activé                                       |
| **5711x** | Caisses                                                                 | Espèces, une caisse par point de collecte / responsable                                                                                                    | Oui — écran Trésorerie (création libre du numéro)                                   |
| **5211x** | Banques                                                                 | Un compte par banque et par numéro de compte                                                                                                               | Oui — écran Trésorerie                                                              |
| **552x**  | Mobile Money (5521 Wave, 5522 Orange, 5523 MTN, 5524 Moov, 5529 autres) | Un portefeuille par opérateur                                                                                                                              | Oui — écran Trésorerie (le numéro par opérateur est proposé par défaut, modifiable) |
| **513**   | Chèques à encaisser                                                     | Chèques reçus, en attente de remise en banque                                                                                                              | Oui — écran Trésorerie                                                              |
| **515**   | Cartes de crédit à encaisser                                            | Règlements par carte, en attente de règlement                                                                                                              | Oui — écran Trésorerie                                                              |
| **401**   | Fournisseurs                                                            | Dette de l'agence, seulement quand elle a elle-même commandé la dépense                                                                                    | Non — compte fixé dans le code                                                      |

Tous les comptes de la gestion locative proprement dite (mandants, honoraires, TVA, retenue, écarts de caisse, pénalités) se modifient dans _Paramètres financiers_ : le numéro choisi s'applique aux écritures à venir, celles déjà passées restent sur l'ancien numéro. Les comptes de trésorerie (caisses, banques, Mobile Money, chèques, cartes) se créent et se numérotent librement dans l'écran _Trésorerie_ ; une agence qui n'en a configuré aucun reçoit des comptes par défaut (5711, 5211, un 552x par opérateur, 513, 515). Seul le 401 « Fournisseurs » reste fixé dans le code.

## 3. Les écritures, avec un exemple chiffré

**Hypothèses de l'exemple (inchangées) :**

- échéance de 200 000 FCFA, dont 180 000 de loyer et 20 000 de charges, payée en Mobile Money (Orange Money) ;
- honoraires de 10 %, calculés sur le loyer nu seul (assiette par défaut) ;
- agence assujettie à la TVA à 18 % ;
- une dépense de plomberie de 30 000 FCFA, payée par l'agence pour le compte du propriétaire (l'agence n'a pas elle-même commandé les travaux) ;
- puis un reversement par virement du net au propriétaire.

### a) Encaissement du loyer — journal `OP-BANK`, à la date du paiement

| Compte                              | Débit   | Crédit  |
| ----------------------------------- | ------- | ------- |
| 5522 Mobile Money — Orange Money    | 200 000 |         |
| 4731 Mandants — P. (compte courant) |         | 200 000 |

### b) Honoraires de gestion — journal `OP-GENERAL`, à la date de l'encaissement

| Compte                               | Débit  | Crédit |
| ------------------------------------ | ------ | ------ |
| 4731 Mandants — P. (compte courant)  | 21 240 |        |
| 70611 Honoraires de gestion locative |        | 18 000 |
| 4432 TVA facturée                    |        | 3 240  |

Les honoraires naissent **à l'encaissement du loyer**, au prorata de ce qui est payé et sur le loyer nu seulement (charges, dépôts de garantie et fonds de tiers exclus de l'assiette). Aucun honoraire n'est comptabilisé sur un loyer impayé.

### c) Dépense du bien payée pour le compte du propriétaire — journal `OP-CASH`

| Compte                              | Débit  | Crédit |
| ----------------------------------- | ------ | ------ |
| 4731 Mandants — P. (compte courant) | 30 000 |        |
| 5711 Caisse principale              |        | 30 000 |

L'agence n'est débitrice du fournisseur (401) que lorsqu'elle a elle-même contracté et commandé la dépense ; dans ce cas courant où elle avance simplement les fonds pour le propriétaire, la trésorerie réellement mobilisée est créditée directement.

### d) Reversement au propriétaire — journal `OP-BANK` (ou `OP-CASH` en espèces)

| Compte                              | Débit   | Crédit  |
| ----------------------------------- | ------- | ------- |
| 4731 Mandants — P. (compte courant) | 148 760 |         |
| 5211 Banque principale              |         | 148 760 |

Le reversement porte la référence `VIR-AAAA-NNNN` quand il est fait par virement.

Après ces quatre écritures, le 4731 (compte courant de ce propriétaire) est soldé : 200 000 − 21 240 − 30 000 − 148 760 = **0**.

### e) Cas particulier — dépôt de garantie

Un dépôt de garantie encaissé par l'agence reste, tant que le bail court, un fonds du mandant : il n'entre ni dans les honoraires, ni dans le résultat de l'agence.

**Encaissement du dépôt (100 000 FCFA, par virement) — journal `OP-BANK`**

| Compte                                 | Débit   | Crédit  |
| -------------------------------------- | ------- | ------- |
| 5211 Banque principale                 | 100 000 |         |
| 4731 Mandants — P. (dépôt de garantie) |         | 100 000 |

**Remboursement intégral au départ du locataire — journal `OP-BANK`**

| Compte                                 | Débit   | Crédit  |
| -------------------------------------- | ------- | ------- |
| 4731 Mandants — P. (dépôt de garantie) | 100 000 |         |
| 5211 Banque principale                 |         | 100 000 |

**Dépôt conservé au profit du propriétaire (dégradations, par exemple)** — le dépôt quitte la nature « dépôt de garantie » pour rejoindre le compte courant du propriétaire, sans passer par la trésorerie ; il sera reversé avec le reste — journal `OP-GENERAL`

| Compte                                 | Débit   | Crédit  |
| -------------------------------------- | ------- | ------- |
| 4731 Mandants — P. (dépôt de garantie) | 100 000 |         |
| 4731 Mandants — P. (compte courant)    |         | 100 000 |

### f) Cas particulier — encaissement non affecté

Un règlement reçu avant que le locataire n'ait désigné l'échéance qu'il paie (une avance, un trop-perçu) est comptabilisé **le jour de sa réception**, comme fonds du mandant « à affecter », puis reclassé sans que l'écriture initiale ne soit modifiée.

**Réception d'un virement de 50 000 FCFA non encore affecté — journal `OP-BANK`**

| Compte                                        | Débit  | Crédit |
| --------------------------------------------- | ------ | ------ |
| 5211 Banque principale                        | 50 000 |        |
| 4731 Mandants — P. (encaissements à affecter) |        | 50 000 |

**Affectation ultérieure à une échéance — journal `OP-GENERAL`, dans l'écriture d'encaissement du loyer**
La ligne « à affecter » est débitée pour le montant repris, et le compte courant du propriétaire est crédité, exactement comme à la section 3.a — sans nouvelle sortie de trésorerie, puisque l'argent est déjà en caisse ou en banque.

### g) Cas particulier — retenue à la source (si activée)

Désactivée par défaut : elle ne s'applique que si le cabinet en a confirmé le principe, le taux et le statut fiscal de chaque propriétaire (voir section 4). Une fois activée, elle n'est **jamais rétroactive** : elle ne porte que sur les encaissements postérieurs à la date choisie, et le taux appliqué est figé à la date de l'encaissement, propriétaire par propriétaire.

**Sur l'exemple ci-dessus, propriétaire personne physique, taux 12 % appliqué au loyer nu encaissé (180 000) — journal `OP-GENERAL`**

| Compte                               | Débit  | Crédit |
| ------------------------------------ | ------ | ------ |
| 4731 Mandants — P. (compte courant)  | 21 600 |        |
| 4478 Retenues à la source sur loyers |        | 21 600 |

**Versement à la DGI, référence `DGI-AAAA-NNNN` — journal `OP-BANK`**

| Compte                               | Débit  | Crédit |
| ------------------------------------ | ------ | ------ |
| 4478 Retenues à la source sur loyers | 21 600 |        |
| 5211 Banque principale               |        | 21 600 |

### h) Écart de caisse, passé à la validation de la session par un responsable

| Cas               | Débit        | Crédit       |
| ----------------- | ------------ | ------------ |
| Manquant de 1 000 | 6588 : 1 000 | 5711 : 1 000 |
| Excédent de 1 000 | 5711 : 1 000 | 7588 : 1 000 |

L'écart n'est imputé au 6588/7588 qu'après enquête et validation par un responsable ; s'il est finalement attribuable à un propriétaire, un locataire, un fournisseur ou un caissier identifié, il est réimputé à ce tiers plutôt que passé en charge ou produit de l'agence.

### i) Annulation d'un paiement, d'une dépense ou d'un reversement

L'écriture exactement inverse est passée au journal `OP-GENERAL`, à la date de l'annulation, avec la référence `ANN-<pièce d'origine>`. L'écriture d'origine n'est ni modifiée ni supprimée, et reste visible avec son lien vers la contre-passation.

## 4. Questions restant à trancher

Les questions Q1 à Q13 de la version précédente de ce document portaient sur le numéro du compte des mandants, les honoraires, la TVA, la banque et le Mobile Money, la caisse, les écarts de caisse, les dépenses payées pour le propriétaire, les dépôts de garantie et les encaissements non affectés. Elles ont été tranchées par la consolidation du plan SYSCOHADA du 23 septembre 2026 (voir [docs/CONSOLIDATION-SYSCOHADA-IMMOTOPIA.md](../CONSOLIDATION-SYSCOHADA-IMMOTOPIA.md)) et l'application applique désormais ces décisions. Les points suivants restent ouverts.

**Q1 — Assujettissement à la TVA et exigibilité.**
L'agence est-elle assujettie à la TVA sur ses honoraires ? Au régime réel, elle la facture ; à l'impôt synthétique, non. L'application constate la TVA **à l'encaissement du loyer**, sur l'assiette des honoraires. Est-ce conforme à l'exigibilité applicable aux prestations de services de l'agence ?

**Q2 — Activation et taux de la retenue à la source.**
La retenue sur loyers (4478) est prête dans l'application mais **désactivée par défaut**. Le cabinet doit confirmer : faut-il l'activer ? À quel taux par statut du propriétaire (l'application prévoit un taux distinct pour une personne physique et pour une personne morale, et permet d'exonérer un propriétaire nommément) ? À partir de quelle date d'encaissement ? Le statut fiscal (personne physique, personne morale, exonéré) doit être renseigné pour chaque propriétaire avant toute activation.

**Q3 — Fournisseur du mandant non réglé.**
Quand l'agence a payé une dépense **pour le compte du propriétaire** mais que le fournisseur n'est pas encore réglé (facture non payée le jour même), quel compte de tiers utiliser ? Ni le 401 (fournisseurs de l'agence, réservé aux dépenses que l'agence commande elle-même), ni le 4731 seul ne conviennent en l'état : un compte de tiers spécifique « fournisseur du mandant » reste à définir avec le cabinet.

**Q4 — Validation des comptes Mobile Money (552x).**
Les comptes proposés par défaut (5521 Wave, 5522 Orange Money, 5523 MTN MoMo, 5524 Moov Money, 5529 autres opérateurs) conviennent-ils au cabinet ? Une agence peut créer d'autres comptes ou renuméroter les siens depuis l'écran Trésorerie : le cabinet doit valider le référentiel avant la mise en service.

**Q5 — Assiette par défaut des honoraires.**
La valeur par défaut de l'application est le loyer nu effectivement encaissé, à l'exclusion des charges, dépôts de garantie, taxes et fonds de tiers ; un mode « tout l'encaissé » et un mode forfait par échéance existent aussi. Cette assiette par défaut convient-elle, ou le cabinet recommande-t-il un autre principe ?

**Q6 — Comptes opérationnels existants, à vérifier.**
Les comptes suivants sont déjà utilisés par d'autres modules de l'application, en dehors de la gestion locative : 311, 401, 402, 4047, 411, 422, 476, 486, 601, 603, 605, 613, 661. Certains ont déjà été identifiés comme mal qualifiés par la consolidation SYSCOHADA (486 n'est pas la charge constatée d'avance, c'est 476 ; 4047 est un fournisseur d'effets à payer sur immobilisations ; 402 concerne les fournisseurs, effets à payer). Le cabinet doit confirmer que les autres comptes de cette liste sont correctement employés.

**Q7 — FNE / RNE.**
Les commissions et prestations de l'agence doivent faire l'objet d'une facture normalisée électronique (FNE) ou d'un reçu normalisé électronique (RNE) selon son régime. Quel est le régime applicable, et comment s'articule-t-il avec les honoraires facturés au fil des encaissements de loyers ?

**Q8 — Format d'import du logiciel du cabinet.**
Quel logiciel utilise le cabinet (Sage, Odoo, autre) ? Quel format d'import attend-il : colonnes, séparateur, codes journaux ? L'application exporte aujourd'hui le journal, le grand livre (dont le grand livre auxiliaire des mandants, avec les colonnes Tiers et Nature) et la balance, en Excel et en CSV (point-virgule, virgule décimale). Un essai d'import sur une copie du dossier du cabinet reste à valider avant toute transmission de production.

**Q9 — Exercice comptable.**
L'exercice correspond-il à l'année civile, clôture au 31 décembre ? Le premier exercice et les cas de cessation ou de cession suivent des règles particulières que le cabinet doit préciser si applicables.

**Q10 — Commissions de vente (lot 9).**
Quand l'agence intermédiaire une vente, sa commission naît à la signature de l'acte authentique. L'application ne passe **aucune écriture à la facturation** ; chaque règlement est comptabilisé à l'encaissement : `Débit trésorerie / Crédit 70612 Honoraires de transaction (HT) + 4432 (TVA)`, comme les honoraires de gestion. Le cabinet préfère-t-il constater la créance au `411` dès la facture, avec une TVA en attente d'exigibilité ? Le `70612` convient-il ? L'agence ne détient jamais le prix ni le dépôt de l'acquéreur (notaire ou vendeur) : si elle devait un jour tenir un séquestre, il faudrait l'ouvrir au `4731`.

## 5. À savoir avant de répondre

- Les numéros de compte choisis dans _Paramètres financiers_ ou dans l'écran _Trésorerie_ s'appliquent **aux écritures à venir** : celles déjà passées restent sur l'ancien numéro. Mieux vaut donc trancher les points ci-dessus **avant la mise en service**.
- Chaque propriétaire dispose d'un auxiliaire du 4731 (compte courant, dépôt de garantie, encaissements à affecter) ; la somme des auxiliaires est rapprochée automatiquement du solde du compte collectif 4731, y compris quand les quotes-parts d'un bien en indivision changent.

---

_Réponses à retourner à l'agence : une décision par question (Q1 à Q9)._
