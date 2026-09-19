# Lot 3 — Budget, engagements, pilotage · Rapport de fin de lot

> Périmètre : `docs/finance/PLAN-mise-en-oeuvre.md` §7, PRD épique E5.
> Spécification : `specs/018-finance-budget-pilotage/`.
> Branche : `feat/finance-lot-0`.
> 19 septembre 2026.

---

## 1. Ce que le lot livre

Les lots 1 et 2 avaient fait exister l'argent qui rentre, puis celui qui sort. Celui-ci fait exister l'argent **qu'on s'est engagé à dépenser**, et le compare à ce qu'on avait prévu.

| Livrable                                        | Où                                         |
| ----------------------------------------------- | ------------------------------------------ |
| Budget de chantier, ligne à ligne par poste     | `packages/api/src/lib/finance/budgets.ts`  |
| Avenants datés et motivés, budget révisé dérivé | `lib/finance/budgets.ts`                   |
| Bons de commande, émission, annulation          | `lib/finance/purchase-orders.ts`           |
| Rapprochement d'une facture reçue sur un bon    | `lib/finance/purchase-orders.ts`           |
| Engagé, calculé à la lecture                    | `lib/finance/purchase-orders.ts`           |
| Avancement physique daté, historique conservé   | `lib/finance/site-progress.ts`             |
| Alerte de dépassement, acquittable              | `lib/finance/budget-alerts.ts`             |
| Tableau de bord des chantiers, en un seul appel | `lib/finance/site-dashboard.ts`            |
| Coût réel d'un chantier, définition unique      | `lib/finance/site-cost.ts`                 |
| Dix-neuf points d'entrée                        | trois contrôleurs et leurs routeurs        |
| Quatre écrans                                   | `apps/web/src/pages/finance/`              |
| Parcours de bout en bout contre une vraie base  | `packages/api/scripts/finance-e2e-lot3.ts` |

Huit tables neuves, deux colonnes ajoutées à des tables existantes, deux migrations purement additives. **Aucune permission neuve** : les six des lots précédents suffisent.

---

## 2. Deux écarts assumés avec le plan

Le plan avait été écrit avant d'avoir le nez dans le schéma. Deux de ses choix ne tenaient pas.

**Il prévoyait de réutiliser le modèle de ligne budgétaire de la copropriété.** Ce modèle porte une clé de répartition des charges entre lots, obligatoire et dénuée de sens pour un chantier ; une catégorie en texte libre là où il faut une clé étrangère ; et surtout un réalisé stocké. Ce dernier point tranche : toute la doctrine des lots précédents est qu'un coût se dérive, et c'est exactement le défaut corrigé au lot 2 sur le coût du programme de travaux. Le réutiliser aurait fait entrer ce défaut dans le module neuf.

Ce que le plan voulait partager reste partageable : c'est le composant de saisie de lignes, pas la table. Partager un composant React n'oblige pas à partager un modèle.

**Il renvoyait ensuite à un modèle de notification qui n'existe pas.** Le dépôt ne connaît que le courriel et WhatsApp, alors que le PRD exige une alerte dans l'application. Plutôt que de bâtir une charpente générique dont rien d'autre ne se servirait, l'alerte est un enregistrement à part entière, daté, acquittable, lu depuis le tableau de bord.

---

## 3. Le fil du lot : ce qui se calcule ne se stocke pas

Trois grandeurs pouvaient tenter d'exister en colonne, et aucune n'en a : le total d'un budget, le budget révisé, l'état de facturation d'un bon de commande.

La seule copie stockée est le pourcentage d'avancement du chantier, parce que les écrans du lot 2 le lisent déjà. Un invariant le surveille, et le parcours de bout en bout vérifie qu'il dit exactement ce que dit la dernière saisie.

### Le piège de l'engagé

```
réalisé = somme des imputations validées et non annulées

engagé  = réalisé
        + somme, sur les bons ÉMIS et non annulés,
          de leur RESTE À FACTURER
```

Le reste à facturer, **et non le montant du bon**. Sans cela, une facture rapprochée d'un bon compterait deux fois : une fois dans le réalisé, une fois dans le bon.

Le piège est écrit dans le contrat gelé, et prouvé deux fois : par un test unitaire dédié, et par le parcours contre une vraie base. Un bon d'un million émis, une facture de quatre cent mille validée et rapprochée, engagé égal à un million.

---

## 4. Les défauts trouvés à l'intégration

### Cinq trous dans le contrat, tous de ma main

Troisième lot, troisième fois. Le point faible de cette organisation reste le même : je gèle seul des contrats que personne ne relit avant que les agents ne les implémentent fidèlement.

| Défaut                                                                                | Comment il est sorti                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| La spécification annonçait vingt routes, le tableau en listait dix-neuf               | L'agent du contrat a recompté à la main           |
| Un budget validé ne nommait pas son validateur                                        | Le même, en comparant les deux contrats gelés     |
| L'annulation d'un bon recevait un motif que rien ne stockait                          | Deux agents, indépendamment                       |
| Le budget ne portait pas son total révisé                                             | L'agent des écrans, qui a refusé de le recomposer |
| Le lien entre poste de dépense et compte comptable, promis au lot 3, n'y figurait pas | Ma propre relecture, en écrivant ce rapport       |

Les quatre premiers sont corrigés. Le cinquième reste ouvert (§6).

### La formule du réalisé était écrite cinq fois

Deux fois dans le fichier des chantiers, une dans celui des imputations, une chez les bons de commande, une chez les alertes. Chaque auteur l'avait recopiée au caractère près et l'avait signalé en commentaire, ce qui est honnête et insuffisant : cinq copies finissent par diverger.

C'est le défaut des trois plans comptables du lot 2, en pire. Il n'en reste qu'une, dans un module qui accepte aussi bien le client global qu'un client de transaction — le remaniement que le lot 2 avait annoncé sans pouvoir le faire, faute de territoire.

### Deux arrondis dans un même lot, puis ma propre erreur en les unifiant

Budgets et bons comptaient en unités de franc, pilotage au centime. Je les ai uniformisés par un remplacement en bloc, qui a aussi arrondi **deux pourcentages** à l'unité : « 83,33 % consommé » est devenu « 83 % ».

C'est un test qui l'a rattrapé, pas ma relecture. D'où une fonction d'arrondi nommée pour les pourcentages, qu'on ne remplacera plus par inadvertance.

### Une sentinelle qui se lisait comme une mesure

Un budget révisé nul rendait 999 999,99. Un écran l'affichant annonce « 999 999,99 % consommé », ce qu'aucune gestionnaire ne lira comme « il n'y a pas de budget ». Une valeur inventée qui se lit comme une mesure est pire qu'une absence de mesure — même raison qui fait qu'une pièce de caisse sans numéro n'affiche pas de tiret.

Elle rend zéro, et surtout l'alerte ne se lève plus du tout contre un budget nul. Le garde est posé explicitement, là où il ne tenait qu'au hasard d'un seuil non nul.

### Un poste désactivé ne pouvait plus être réduit

La première version refusait toute ligne d'avenant sur un poste désactivé, ce qui figeait une enveloppe morte dans le budget révisé. Or on désactive justement un poste pour déplacer son enveloppe ailleurs. On refuse désormais de l'augmenter, jamais de la réduire.

### Un défaut vivant du lot 2, trouvé hors territoire

Le bouton « Nouvelle pièce de caisse » du détail d'un chantier ne menait nulle part. Il navigue vers une adresse portant le chantier en paramètre de requête, l'écran lit bien ce paramètre, et la route déclarée portait l'identifiant dans le chemin.

C'est exactement le défaut corrigé la veille sur les factures fournisseurs, resté sur la caisse — et que ma relecture du lot 2 n'avait pas vu. L'agent des écrans l'a repéré en travaillant à côté, et l'a signalé sans y toucher.

---

## 5. Ce que les agents ont mieux fait que ma spécification

Quatre fois, un agent a rendu mieux que ce qu'on lui demandait.

**L'ordre de montage des routeurs.** Le tableau de bord et la fiche de chantier du lot 2 ont la même forme d'adresse, et Express essaie les routeurs dans leur ordre de montage. Sans cet avertissement, le lot 2 aurait happé le mot « dashboard » comme un identifiant de chantier. L'agent l'a signalé depuis son propre territoire, alors que le montage ne lui appartenait pas.

**Le refus de recomposer le total révisé à l'écran.** L'agent des écrans pouvait additionner l'initial et les avenants côté client. Il a refusé, parce que le principe l'interdit, et a signalé le manque au lieu de le contourner. Le serveur rend désormais ce total.

**Le test du double compte.** L'agent des bons de commande a écrit exactement le test demandé, sans le diluer : un bon d'un million, une facture de quatre cent mille, engagé à un million et non un million quatre.

**La duplication signalée plutôt que tue.** Deux agents ont recopié la formule du réalisé faute de pouvoir l'importer, et l'ont tous deux écrit noir sur blanc en commentaire. C'est ce qui a rendu la consolidation possible en une passe.

---

## 6. Ce qui reste ouvert

**Le lien entre un poste de dépense et un compte du plan comptable n'existe toujours pas.** Le rapport du lot 2 l'annonçait pour le lot 3 ; ma propre spécification du lot 3 ne l'a pas repris, et personne ne l'a vu avant ce rapport. Conséquence inchangée : toute dépense de chantier impute le même compte de charge, quel que soit le poste. L'imputation analytique et l'imputation comptable restent deux mondes séparés.

Le reste, par ordre d'importance :

- Les tests unitaires du lot 3 simulent entièrement Prisma, comme ceux du lot 2. Tant que cela reste vrai, les parcours de bout en bout sont le seul filet contre les défauts de schéma, et ils doivent tourner à chaque intégration.
- Aucune route ne liste les règlements d'un fournisseur : l'écran ne connaît que ceux de sa propre session.
- Aucune route ne corrige les lignes d'un budget après sa création. Seul un avenant le fait évoluer, ce qui est cohérent pour un budget validé, mais rigide pour un brouillon.
- Deux écarts mineurs hérités de la copropriété, relevés au lot 0 et toujours là : un intervalle de dates invalide donne 500 sur les écritures et 400 sur la balance ; le filtre d'activité ne reconnaît que la chaîne exacte `false`.
- Le dépôt n'a pas de fichier de configuration des fins de ligne, ce qui fait apparaître environ deux cents fichiers comme modifiés à tort.
- Le typage de l'API porte cent une erreurs préexistantes, antérieures au module financier. Aucune ne vient de ce lot.

---

## 7. Chiffres

| Mesure                         | Fin du lot 2 | Fin du lot 3 |
| ------------------------------ | ------------ | ------------ |
| Suites de tests backend        | 42           | 48           |
| dont ignorées                  | 4            | 4            |
| Tests backend                  | 444          | 612          |
| dont ignorés                   | 4            | 4            |
| Fichiers de tests web          | 41           | 44           |
| Tests web                      | 405          | 441          |
| Erreurs de typage, API         | 101          | 101          |
| Erreurs de typage, web         | 0            | 0            |
| Constats contre une vraie base | 42           | 39 de plus   |

Reproduire : `npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot3.ts`. Le parcours du lot 2 tient toujours ses quarante-deux constats après les modifications de ce lot.

---

## 8. Vérifié contre une vraie base

Le parcours crée un chantier, son budget, un avenant, un fournisseur, deux bons de commande, une facture rapprochée, deux points d'avancement, et lit le tableau de bord. Il produit **trente-neuf constats, tous tenus**, et supprime son tenant jetable derrière lui.

Quatre d'entre eux méritent d'être cités.

**L'engagé ne compte pas deux fois la facture rapprochée.** C'est le critère de sortie du lot, et la seule façon de le prouver était contre une vraie base.

**Une saisie antérieure ajoutée après coup n'écrase pas un point plus récent.** La copie d'avancement suit la date de la saisie, pas celle de l'enregistrement.

**Un avenant en brouillon ne compte pour rien dans le budget révisé**, et l'initial ne bouge jamais : on amende, on ne réécrit pas.

**Une seule alerte non acquittée par budget.** Sans cette règle, chaque pièce validée au-delà du seuil en produirait une nouvelle et le tableau de bord se remplirait de la même alerte.

---

## 9. Ce que la prochaine visioconférence doit montrer

Dans cet ordre, parce qu'il suit celui du travail réel.

1. Un budget de chantier saisi ligne à ligne, laissé en brouillon, puis validé. Le total n'est jamais tapé.
2. Un avenant motivé, laissé en brouillon : le budget révisé ne bouge pas. Le même validé : il bouge.
3. Un bon de commande saisi, puis émis. C'est l'émission qui fait entrer le bon dans l'engagé, pas la saisie.
4. Une facture reçue rapprochée de ce bon, puis validée. Montrer que l'engagé ne bouge pas : la dépense s'est simplement déplacée de l'engagement vers le réalisé.
5. Le tableau de bord : budget initial, révisé, engagé, réalisé, avancement, écart en valeur et en pourcentage, code couleur, et l'alerte de dépassement.
6. Un point d'avancement saisi, puis un point antérieur ajouté après coup, qui ne remplace pas le premier.

Aucun de ces écrans ne prononce les mots « débit » ni « crédit ».
