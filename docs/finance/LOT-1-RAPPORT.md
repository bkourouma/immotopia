# Lot 1 — Volet clients · Rapport de fin de lot

> Périmètre : `docs/finance/PLAN-mise-en-oeuvre.md` §4 et §5, lots 0 et 1.
> Spécification : `specs/016-finance-operationnelle/`.
> Branche : `feat/finance-lot-0`, créée depuis `main`. Poussée.
> 18 septembre 2026.

---

## 1. Ce que le lot livre

La réserve de la cliente tenait en une phrase : _l'application montre des statuts là où elle a besoin de soldes_. Le lot 1 y répond, sans créer une seule table sensible et sans écrire une seule écriture en partie double.

| Livrable                                               | Où                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Compte de tiers locataire, à solde courant             | `packages/api/src/lib/finance/ledger.ts`                                            |
| Balance clients et balance âgée                        | `lib/finance/reports.ts`                                                            |
| Relevé de compte, à l'écran et imprimable              | `lib/finance/reports.ts`, `statement-pdf.ts`                                        |
| Campagne de facturation mensuelle, idempotente         | `lib/finance/billing-run.ts`                                                        |
| Rétro-remplissage des comptes existants                | `packages/api/scripts/finance-backfill-tenant-accounts.ts`                          |
| Huit endpoints, dont un pour le portail locataire      | `controllers/finance-controller.ts`, `routes/finance-routes.ts`                     |
| Six permissions, saisie et validation séparées         | `middleware/finance-rbac-middleware.ts`, `prisma/seeds/finance-permissions-seed.ts` |
| Quatre écrans, plus l'onglet « Mon relevé » du portail | `apps/web/src/pages/finance/`, `pages/TenantPortal/Payments.tsx`                    |

Trois tables neuves, aucune table existante modifiée hors relations inverses. La migration est purement additive.

---

## 2. Comment le lot a été conduit

Cinq vagues, seize agents, sur des territoires de fichiers disjoints. Deux règles ont tenu tout du long.

**Le contrat précède le code.** Avant chaque fan-out, le superviseur gèle seul le schéma, les types et les signatures, avec des talons qui lèvent une erreur. Chaque agent code ensuite contre une interface stable, sans attendre les autres.

**Deux agents ne touchent jamais le même fichier.** Le territoire de chacun est une liste de chemins énoncée dans sa consigne, vérifiée après chaque vague. Les fichiers-registre — schéma Prisma, montage des routeurs, arbre de navigation, table des routes — restent au superviseur.

**Aucune collision de territoire n'a eu lieu sur les cinq vagues.**

| Vague | Agents | Objet                                                       |
| ----- | ------ | ----------------------------------------------------------- |
| 1     | 3      | Spécification, tests de caractérisation, référence chiffrée |
| 2     | 2      | Extractions à comportement identique                        |
| 3     | 0      | Contrat gelé, par le superviseur seul                       |
| 4     | 6      | Grand livre, restitution, campagne, trois écrans            |
| 5     | 3      | API, droits, branchement du grand livre                     |

---

## 3. Ce que la caractérisation a trouvé avant qu'on y touche

Le lot 0 a écrit 54 cas décrivant le comportement **actuel** du moteur comptable de copropriété, sans le corriger, pour servir de garde-fou à sa généralisation au lot 2. Ils ont mis au jour cinq défauts, consignés au §6.1 bis du plan et figés tels quels.

Le plus sérieux : **une écriture déséquilibrée peut être enregistrée**. Le contrôle somme les valeurs brutes puis arrondit les totaux, alors que chaque ligne est arrondie à l'enregistrement. Deux lignes au débit de 0,005 contre une au crédit de 0,01 passent le contrôle et ressortent à 0,02 contre 0,01. Sans conséquence aujourd'hui, les montants en francs CFA étant entiers ; certaine dès le lot 4, qui constate des charges au prorata.

Le plus révélateur : **le drapeau de verrouillage des écritures ne protège rien**. Il n'est lu nulle part ailleurs que là où il est posé. L'immuabilité tient à l'absence de route d'écriture, pas à un contrôle. Le principe P-6 du PRD suppose donc une garde qui reste entièrement à construire.

---

## 4. Les défauts trouvés à l'intégration

Sept au total, sur les vagues 4 et 5. **Tous ont été signalés par les agents eux-mêmes**, dans la rubrique d'hypothèses que leur consigne impose, et non trouvés par les tests — les agents testaient fidèlement un contrat faux.

### Quatre trous dans le contrat, tous de la main du superviseur

1. **Le portail locataire passait le mauvais identifiant.** Il envoyait celui du client locataire là où il fallait celui du compte de tiers, deux valeurs distinctes. L'appel n'aurait rien trouvé. Le portail passe désormais par un point d'entrée sans paramètre, où la session résout le locataire — ce qui interdit aussi, par construction, de lire le relevé d'un autre.
2. **Le filtre par bien envoyait un libellé** au lieu d'un identifiant. Il lit maintenant le parc, seule source qui porte les deux, ce qui supprime au passage une requête.
3. **Le compte rendu de campagne n'affichait que des identifiants techniques.** C'est l'écran que la gestionnaire regarde juste après avoir lancé sa facturation, et il ne lui disait rien. Chaque ligne porte désormais un nom, résolu par le serveur et stocké avec la campagne : un compte rendu est une trace, pas une vue.
4. **Le contrat OpenAPI nommait les bornes de période autrement que la frontière web.** Le superviseur avait gelé la seconde sans la relire contre le premier. L'écart a été tranché en faveur de l'implémentation, qui est construite, testée et consommée.

### Deux erreurs de raisonnement dans la spécification

5. **Le mouvement d'avance imputée a changé trois fois de nature** avant d'être juste. Décrit d'abord comme un débit, puis requalifié sans effet sur le solde, il est finalement un débit — mais accompagné d'un crédit au titre de l'allocation. Le détail et le raisonnement sont dans `specs/016-finance-operationnelle/data-model.md`.

   **La leçon dépasse ce champ.** Deux agents avaient bâti deux modèles de l'avance, chacun cohérent avec lui-même. La contradiction n'est apparue qu'en les faisant se rencontrer. Un invariant à vérifier à chaque lot : _pour toute pièce, le temps réel et le rejeu doivent produire exactement les mêmes mouvements._

6. **Une règle d'exclusion qui aurait coûté de l'argent.** La campagne écartait tout bail à loyer nul, alors que le montant dû additionne loyer, charges et frais. Un bail en franchise de loyer portant des charges n'aurait jamais été facturé, et l'exclusion étant motivée, donc discrète, personne ne l'aurait relue.

### Une panne en attente, vieille de plusieurs mois

7. Le service des déclarations de paiement sélectionnait un champ `phone` sur le modèle `User`, qui ne le porte pas : la requête aurait levé à l'exécution. La valeur n'était lue nulle part. C'était l'une des 103 erreurs de type connues, et personne ne l'avait regardée. **La référence passe à 102.**

---

## 5. Décisions de conception qui méritent d'être retenues

**Le compte de tiers est séparé de `OwnerAccount`, mais partage son code.** `OwnerAccount.lotId` est obligatoire et unique par lot de copropriété, et son contact est un `CrmContact` là où le locataire est un `TenantClient`. Généraliser cette table en place aurait cassé la copropriété. Ce qui est partagé, c'est le calcul du solde, extrait dans `lib/finance/ledger.ts`.

**L'idempotence ne repose sur aucune vérification préalable.** Ni pour les mouvements, ni pour les échéances : une vérification laisserait une fenêtre de concurrence. On tente l'écriture, et la violation de contrainte unique devient un cas métier — un mouvement déjà connu, ou une exclusion motivée.

**Toute écriture passe par un client de transaction.** Aucune fonction du pont locatif n'accepte `prisma`, ce qui rend l'erreur non compilable plutôt que détectable à la relecture. Un test force l'échec **après** l'écriture du mouvement et vérifie qu'il ne reste ni pièce, ni mouvement, ni déplacement de solde.

**La balance agrège en SQL, jamais en mémoire.** Le banc de charge du lot 0 mesure 93 ms contre 1 355 ms à 500 tiers. Les deux tiennent le seuil de trois secondes, mais la seconde avec une marge étroite et une variance forte.

**Le relevé ne reproduit pas le défaut de son aîné.** Son solde d'ouverture vient du dernier mouvement antérieur à la borne, jamais du solde courant. Un test le prouve sur le cas exact.

**Aucun écran ne montre « débit » ni « crédit ».** La traduction a lieu dans le grand livre, et nulle part ailleurs. Chaque écran porte un test qui échoue si l'un des deux mots apparaît, casse et accents indifférents.

---

## 6. Ce qui reste ouvert

**Le grand livre n'a pas de voie d'amendement.** La clé `(sourceType, sourceId, type)` n'admet qu'un mouvement par type et par pièce. Trois conséquences, relevées par l'intégrateur locatif et non fermées : une pénalité révisée **à la hausse** après inscription n'est pas représentable ; une seconde baisse sur la même pénalité non plus ; une pénalité d'abord calculée à zéro puis recalculée à un montant positif reste à zéro au compte. À traiter au lot 2, en même temps que la pièce d'annulation.

**L'API émet encore des alias de champs**, hérités de l'écart entre le contrat et l'implémentation. Ils ne sont consommés par rien et sont à retirer au lot 2.

**Le service des déclarations de paiement n'est pas couvert** par le test d'intégration du grand livre, son import ayant longtemps fait échouer la suite. L'obstacle est levé depuis la correction du défaut n°7 ; la couverture reste à ajouter.

**Les colonnes exactes de la balance attendent l'export du tableur de la cliente**, qui n'a pas été fourni.

**Les cinq questions ouvertes du PRD sont tranchées** depuis le 18 septembre 2026, et consignées dans la spécification 017. Le lot 5 cesse d'être conditionnel : un suivi des matériaux existe déjà, tenu à la main.

**Les questions 3 à 7 du PRD** restent à trancher avant le lot 2 : suivi des matériaux, pratique budgétaire, statut des ouvriers, états aux associés, organisation de la caisse.

---

## 7. Chiffres

| Mesure                  | Avant le lot 0 | Après le lot 1            |
| ----------------------- | -------------- | ------------------------- |
| Erreurs TypeScript, API | 103            | **102**                   |
| Erreurs TypeScript, web | 0              | 0                         |
| Suites de tests backend | 23             | 31 passées, 4 ignorées    |
| Tests backend           | 139            | **285 passés**, 4 ignorés |
| Fichiers de tests web   | 34             | 37                        |
| Tests web               | 319            | **351 passés**            |

Le décompte d'erreurs de type **baisse** d'une unité, ce qu'aucun lot précédent n'avait fait : la ligne fautive était une panne en attente, et la retirer valait mieux que la contourner. Aucun fichier auparavant à zéro erreur n'en a gagné.

Reproduire : `npx ts-node packages/api/scripts/finance-baseline.ts`.

---

## 8. Vérifié contre une vraie base

Le 18 septembre 2026, après que le lot 1 a été livré. C'est cette étape qui a trouvé le défaut de transaction décrit au § 4, invisible aux 285 tests backend.

**Rétro-remplissage**, agence Ivoire Résidences, 19 baux et 414 échéances :

| Contrôle                                           | Résultat    |
| -------------------------------------------------- | ----------- |
| Comptes créés                                      | 18          |
| Mouvements écrits                                  | 571         |
| Comptes dont le solde diverge du dernier mouvement | 0           |
| Somme des soldes                                   | 160 494 750 |
| Total facturé moins total réglé                    | 160 494 750 |

**Campagne de facturation**, agence Immobilière du Mali, sur une période vierge. Le chemin complet est exercé : création de compte, création d'échéance et écriture du mouvement dans une seule transaction.

|                  | Première passe | Seconde passe |
| ---------------- | -------------- | ------------- |
| Baux facturés    | 23             | 0             |
| Baux exclus      | 2              | 25            |
| Comptes créés    | 23             | 0             |
| Somme des soldes | 3 707 695      | inchangée     |

La somme des soldes égale au franc la somme des échéances de la période. L'état après les deux passes est rigoureusement identique : l'idempotence tient contre PostgreSQL, et non plus seulement contre un simulacre.

**Banc de charge** à l'échelle du critère de sortie, 500 tiers et 12 000 mouvements, médiane sur trois exécutions :

| Fonction         | Médiane  | Marge sur le seuil de 3 s |
| ---------------- | -------- | ------------------------- |
| Balance clients  | 88,8 ms  | 34 fois                   |
| Balance âgée     | 124,5 ms | 24 fois                   |
| Relevé de compte | 49,6 ms  | 60 fois                   |

Reproduire : `npx ts-node --project packages/api/tsconfig.json packages/api/scripts/finance-bench-reports.ts`. Le script crée son propre tenant jetable et le supprime, y compris si une mesure échoue.

---

## 9. Ce que la prochaine visioconférence doit montrer

Dans cet ordre, depuis l'atelier ou l'application :

1. **La balance clients.** Dix locataires, un total de contrôle en pied, et un solde créditeur pour celle qui a payé d'avance. C'est la réserve levée.
2. **Le relevé d'un locataire.** Une année de mouvements, dont une avance reçue puis absorbée par l'échéance suivante : le solde passe créditeur, puis revient.
3. **La facturation du mois.** Lancée une fois, puis relancée : les mêmes échéances, aucun doublon, et un compte rendu qui nomme chaque bail exclu avec son motif en français.
4. **La balance âgée**, si le temps le permet.

Le critère qualitatif du PRD est le seul qui compte : _la réserve « ce n'est pas chiffré » est-elle levée ?_
