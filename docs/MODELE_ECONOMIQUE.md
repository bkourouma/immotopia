# ImmoTopia — Modèle économique et architecture des packs

**Version** 1.0 — 22 septembre 2026
**Marché de référence** Abidjan, Côte d'Ivoire (FCFA, XOF)
**Périmètre** Tous les modules, branches `feat/design-system-navy-orange` et `claude/dazzling-poincare-ed5cfd` confondues

---

## 1. Principes

Quatre règles déterminent toute la grille. Elles sont posées avant les prix, parce que ce sont elles qui rendent les prix défendables.

**P1 — On facture la valeur gérée, jamais le siège.** Une agence de 4 personnes gère 400 lots. Facturer à l'utilisateur rate la valeur et pousse au partage de comptes, travers déjà généralisé localement.

**P2 — Un lot se paie une fois, quel que soit son stade.** Un appartement qui naît d'un chantier, part en location puis entre en copropriété est _un_ lot, pas trois. C'est la conséquence directe du modèle de données : `Property` est le pivot, `SiteLot.propertyId` et `SyndicateLot.propertyId` y pointent tous les deux.

**P3 — Le prépayé annuel est le mode normal.** Le mobile money ne fait pas de débit récurrent fiable et la carte est peu pénétrée. Le paiement mensuel automatique du SaaS classique ne fonctionnera pas ici. Remise de 20 % sur l'annuel : ce n'est pas un geste commercial, c'est le modèle de trésorerie.

**P4 — La mise en service se facture.** Reprise des données, paramétrage, formation. C'est du cash immédiat, et c'est surtout ce qui empêche le départ : un client dont le parc a été saisi ne repart pas.

---

## 2. Le socle — présent partout, vendu nulle part

Ces domaines ne sont jamais une option. Les retirer casse l'expérience des autres, y compris celle du locataire et du propriétaire, qui ne sont pas les payeurs.

| Domaine               | Contenu                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Biens & annonces      | Fiches, médias, documents, statuts, mandats, publication, recherche, score de qualité, visites et calendrier |
| Contacts              | Contacts, rôles, étiquettes, zones cibles, notes, recherches enregistrées                                    |
| Maintenance           | Tickets, pièces jointes, commentaires, prestataires, notifications                                           |
| Documents             | Modèles paramétrables, variables métier, génération DOCX, numérotation                                       |
| Portails              | Portail propriétaire (12 écrans), portail locataire (6 écrans)                                               |
| Communication de base | Notifications e-mail par événement, préférences, historique                                                  |
| Administration        | Collaborateurs, invitations, rôles et permissions, menus par rôle, paramètres, audit, tableau de bord        |

**Pourquoi le socle est gratuit :** il n'a aucune valeur isolée et une valeur immense en accompagnement. Un prospect qui teste les biens et les contacts sans payer est un prospect qui saisit ses données chez vous.

---

## 3. Les packs métier

Quatre packs, quatre profils d'acheteur réels, quatre assiettes différentes — chacune choisie parce qu'elle bouge avec la valeur que le client retire.

### 3.1 Transaction

**Pour** l'agent indépendant et l'agence de vente/location qui ne gère pas de parc.
**Assiette** l'utilisateur actif — ici la valeur vient du nombre de négociateurs, pas d'un parc.

Pipeline d'affaires, activités, calendrier et rendez-vous, appariement biens ↔ affaires, tableau de bord commercial, mandats.

> **15 000 FCFA / utilisateur actif / mois — minimum 30 000**

### 3.2 Gestion Locative

**Pour** l'agence de gestion. Le cœur historique du produit.
**Assiette** le lot géré.

Baux et colocataires, échéances et génération, paiements et allocations, déclarations de paiement, pénalités automatiques, dépôts de garantie et mouvements, remboursements, documents locatifs, relevés propriétaire.

> **500 FCFA / lot géré / mois — minimum 25 000**

_Ancrage :_ l'agence prend 8 à 10 % du loyer. À 150 000 FCFA de loyer moyen, elle gagne 15 000 FCFA par lot et par mois. Vos 500 FCFA représentent **3,3 % de ce qu'elle gagne grâce à l'outil**. C'est l'argument, et il tient en une phrase.

### 3.3 Syndic

**Pour** le syndic de copropriété professionnel.
**Assiette** le lot de copropriété, avec un plancher **par copropriété**.

Copropriétés et lots, tantièmes, profils propriétaires et locataires, appels de charges et lots d'appels, paiements, recouvrement (relances, pénalités, échéanciers), assemblées générales (ordre du jour, résolutions, votes, pouvoirs), budgets et ventilations, comptabilité en partie double (plan de comptes, journaux, écritures), comptes propriétaires, incidents et imputation des coûts, prestataires et contrats, équipements des parties communes, documents, fonds.

> **350 FCFA / lot / mois — minimum 25 000 par copropriété**

_Pourquoi un plancher par copropriété et non par client :_ une copropriété de 15 lots exige la même assemblée générale, le même budget et la même comptabilité qu'une copropriété de 80. Le travail est par immeuble, le prix aussi.

### 3.4 Chantiers

**Pour** le promoteur et l'entreprise de construction.
**Assiette** le chantier actif — elle monte et descend avec l'activité réelle, elle est auditable, elle se comprend sans explication.

Chantier comme objet financier, imputation des coûts, catégories de coûts, budgets et avenants, bons de commande et engagé, avancement, alertes de dépassement, tableau de bord chantiers, pièces de caisse, file de validation, lots de chantier, coût de revient, clôture et bascule au patrimoine.

> **175 000 FCFA / mois — 3 chantiers actifs inclus, puis +50 000 par chantier actif**

_Pourquoi le prix change d'ordre de grandeur :_ un chantier de 20 logements pèse 400 millions à 1 milliard de FCFA. Un dépassement de 5 % non vu à temps coûte 20 à 50 millions. Le plafond de la commission d'agence, qui bride toute la grille locative, n'existe pas ici.

---

## 4. Les extensions

Elles ne se vendent pas seules : chacune exige un pack métier.

| Extension      | Contenu                                                                                                                                                                                         | Prix                       | Exige                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------ |
| **Finance**    | Comptes de tiers, balance clients, balance âgée, balance fournisseurs, relevés, campagnes de facturation, caisse, fournisseurs et factures, file de validation, importation Excel               | **+30 000 / mois**         | un pack métier — _incluse d'office dans Chantiers et Syndic_ |
| **BTP+**       | Stock complet (référentiel, mouvements, inventaire, rapprochement, coût moyen pondéré), salaires, tâcherons et situations, retenues de garantie, associations et distributions, baux de terrain | **+150 000 / mois**        | Chantiers                                                    |
| **Patrimoine** | Valorisations, emprunts, dépenses, rendement par bien, vue consolidée, performance, programmes de travaux                                                                                       | **+200 FCFA / lot / mois** | Gestion Locative ou Chantiers                                |

**Finance à 30 000, volontairement peu cher :** ce module est _dérivé de données que le client a déjà saisies_. Coût marginal quasi nul, valeur perçue immédiate — « enfin des soldes, plus des statuts ». C'est votre meilleur produit d'expansion sur base installée et le chemin naturel vers les packs chantier.

---

## 5. Le pack intégré — Opérateur

**Pour** l'entreprise qui construit, puis loue ou vend, puis gère la copropriété. Profil de la SCI PTC, et profil où ImmoTopia n'a aucun concurrent sérieux.

**Tout est inclus** : les quatre packs métier, les trois extensions, sans exception.

**Assiette unique, dégressive — le lot actif, compté une seule fois quel que soit son stade :**

| Tranche        | Prix par lot et par mois |
| -------------- | ------------------------ |
| 1 à 200 lots   | 1 200 FCFA               |
| 201 à 500 lots | 900 FCFA                 |
| au-delà de 500 | 700 FCFA                 |

> **Plancher : 400 000 FCFA / mois**

### Définition de l'assiette — la formule de facturation

Un lot actif est :

- un `Property` non archivé, **ou**
- un `SiteLot` qui n'a pas encore basculé au patrimoine (`propertyId IS NULL`).

Les lots de copropriété (`SyndicateLot.propertyId`) et les lots de chantier déjà basculés (`SiteLot.propertyId`) **ne comptent pas une seconde fois** : ils pointent vers un `Property` déjà compté. La déduplication est structurelle, pas déclarative — c'est la contrainte `@unique` sur ces deux colonnes qui la garantit.

### Pourquoi la dégressivité n'est pas une remise de confort

Sans elle, le pack intégré devient plus cher que la somme des packs au-delà de ~500 lots, et la promesse commerciale s'effondre au moment exact où le client est le plus engagé. Vérification à trois volumes :

| Volume     | Packs séparés | Opérateur              | Écart |
| ---------- | ------------- | ---------------------- | ----- |
| 300 lots   | ~455 000      | **400 000** (plancher) | −12 % |
| 600 lots   | ~657 000      | **580 000**            | −12 % |
| 1 000 lots | ~940 000      | **860 000**            | −9 %  |

La phrase de vente s'écrit seule : **« vous payez l'appartement une fois, pas trois fois le même appartement. »**

---

## 6. Découverte — l'entrée gratuite

> **Gratuit — 10 lots, 1 utilisateur**

Biens, contacts, baux, échéances. Ni documents générés, ni WhatsApp, ni portails, ni finance.

Ce n'est pas de la générosité : c'est le moyen le moins cher de faire saisir un parc chez vous. Le plafond à 10 lots est assez bas pour qu'une vraie agence le dépasse en une semaine.

---

## 7. Options à l'usage

| Option                        | Prix                                                                | Note                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **WhatsApp**                  | 5 000 FCFA / 500 notifications                                      | Coût réel refacturé avec marge — Meta facture au message. Les relances d'impayés par WhatsApp ont une valeur perçue très forte localement. |
| **Newsletter**                | 15 000 FCFA / mois                                                  | Listes, campagnes, modèles, pages publiques d'inscription et de désinscription                                                             |
| **Portail Diaspora**          | 10 000 FCFA / mois / propriétaire                                   | Accès propriétaire renforcé + relevés envoyés. Disposition à payer en euros — votre meilleure marge.                                       |
| **Encaissement mobile money** | 1,5 % plafonné à 2 000 FCFA par encaissement, payé par le locataire | _À activer seulement après négociation d'un tarif de gros avec l'agrégateur : en dessous du volume, la marge est nulle._                   |

---

## 8. Mise en service

Non négociable, et facturée avant le premier mois d'abonnement.

| Pack             | Mise en service                                                                |
| ---------------- | ------------------------------------------------------------------------------ |
| Gestion Locative | 150 000 – 500 000 FCFA                                                         |
| Transaction      | 100 000 – 250 000 FCFA                                                         |
| Syndic           | 300 000 – 800 000 FCFA (reprise des comptes et des tantièmes)                  |
| Chantiers / BTP+ | 1 500 000 – 3 000 000 FCFA (plan analytique, formation caissier et magasinier) |
| Opérateur        | 2 000 000 – 4 000 000 FCFA                                                     |

L'écran **Importation** n'est pas un détail technique : c'est la réponse à la seule objection qui tue ces ventes — « et mes données actuelles ? ». Mettez-le dans la démonstration, et facturez la reprise.

---

## 9. Exemples chiffrés

**Agence de gestion locative — 120 lots**
Socle + Gestion Locative (120 × 500 = 60 000) + Finance (30 000) = **90 000 FCFA / mois**
Annuel prépayé : 864 000 FCFA. Mise en service : 350 000 FCFA.

**Syndic professionnel — 4 copropriétés, 180 lots**
Syndic : 180 × 350 = 63 000, mais plancher 4 × 25 000 = 100 000 → **100 000 FCFA / mois**, Finance incluse.

**Entreprise BTP — 5 chantiers actifs, pas d'activité locative**
Chantiers (175 000 + 2 × 50 000 = 275 000) + BTP+ (150 000) + Finance incluse = **425 000 FCFA / mois**

**Opérateur intégré — 300 lots (80 en chantier, 150 en location, 70 en copropriété)**
200 × 1 200 + 100 × 900 = 330 000 → plancher = **400 000 FCFA / mois**, tout inclus.
Contre ~455 000 en packs séparés.

---

## 10. Ce qui bloque aujourd'hui

Cette grille n'est pas applicable en l'état. Cinq chantiers, par ordre de dépendance.

### 10.1 Les clés de module n'existent pas

`ModuleKey` ne contient que `MODULE_AGENCY`, `MODULE_SYNDIC`, `MODULE_PROMOTER`. Le module financier est protégé par des permissions `FINANCE_*` mais **par aucune clé de module** : il est donc impossible de l'activer, de le désactiver ou de le facturer par tenant.

Enum cible :

```
MODULE_TRANSACTION
MODULE_RENTAL
MODULE_SYNDIC
MODULE_CONSTRUCTION
MODULE_FINANCE
MODULE_BTP_PLUS
MODULE_PATRIMONY
```

`MODULE_AGENCY` et `MODULE_PROMOTER` sont trop grossiers pour cette grille et doivent être migrés.

### 10.2 Le compteur d'assiette n'existe pas

Aucun code ne calcule les lots actifs, les chantiers actifs ni les utilisateurs actifs. C'est l'assiette de facturation de **trois packs sur quatre**. Voir la formule au §5.

### 10.3 Les paliers ne sont pas gérés

Rien n'implémente « +50 000 par chantier au-delà de 3 », ni la dégressivité par tranches du pack Opérateur.

### 10.4 `PAST_DUE` ne fait rien

Le statut existe dans `SubscriptionStatus`, aucune dégradation d'accès n'y est branchée. Avec un paiement non automatique (P3), l'impayé d'abonnement est certain, pas hypothétique.

### 10.5 Le maillon « vente » est absent

`CrmDealType.VENTE` et `CrmDealStage.WON` existent, et l'histoire s'arrête là : pas de contrat de vente, pas de prix convenu, pas d'échéancier acquéreur, pas de transfert de propriété, pas de création du copropriétaire.

Or la vente est la charnière du pack Opérateur — le moment où l'acquéreur devient copropriétaire. Il manque aussi les **appels de fonds selon l'avancement** : à Abidjan un promoteur vend sur plan et encaisse par tranches indexées sur l'avancement des travaux. `SiteProgressEntry` existe, les appels de fonds acquéreurs non. C'est le flux entrant principal de ce métier, et le seul que le module financier ignore.

**Ne vendez pas le pack Opérateur avant d'avoir comblé ce maillon.** Le client le signerait, découvrirait le trou au premier appartement vendu, et vous perdriez la référence la plus précieuse de votre marché.

### 10.6 Le module financier vit sur une branche latérale

Tout le module finance et chantiers est sur `claude/dazzling-poincare-ed5cfd` et n'est pas intégré à la ligne principale. Rien de ce qui en dépend n'est vendable tant que ce n'est pas fusionné et verrouillable.

---

## 11. Séquence

| Horizon         | Priorité                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Immédiat**    | Clés de module + compteur d'assiette + `PAST_DUE`. Sans ça, rien n'est facturable.                                  |
| **Court terme** | Fusion du module financier sur la ligne principale. Packs Gestion Locative, Transaction, Syndic ouverts à la vente. |
| **Moyen terme** | Maillon vente + appels de fonds sur avancement. Ouverture des packs Chantiers, BTP+ et Opérateur.                   |
| **Long terme**  | Encaissement mobile money, une fois le volume acquis et le tarif de gros négocié.                                   |

---

## 12. À valider sur le terrain

Trois chiffres décident de la viabilité de cette grille, et aucun ne s'obtient depuis le code — il faut une dizaine d'entretiens.

1. Le **loyer moyen réellement géré** par les agences cibles. L'hypothèse retenue est 150 000 FCFA ; à 60 000, toute la section locative descend.
2. La **taille médiane de parc** d'une agence abidjanaise.
3. Ce qu'elles paient **aujourd'hui**, en logiciel et en saisie manuelle.

À vérifier aussi auprès d'un juriste local : la durée pendant laquelle un promoteur peut exercer le syndic de son propre ouvrage en Côte d'Ivoire. Cela conditionne la durée de rétention du pack Opérateur, pas son principe.
