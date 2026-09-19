# Lot 5 — Stock de matériaux · Rapport de fin de lot

> Périmètre : `docs/finance/PLAN-mise-en-oeuvre.md` §9, PRD épique E9, besoins S1 à S7.
> Branche : `feat/finance-lot-0`.
> 19 septembre 2026.

---

## 1. Une réserve à lever avant tout le reste

Le PRD marque ce lot **« conditionné à la confirmation du besoin auprès de la cliente »**, et ses sept besoins sont tous en priorité **C**, la plus basse. Le plan le range derrière un prérequis explicite : « besoin confirmé ».

Le lot a été construit sur instruction, la réserve est levée par celui qui l'a donnée. Elle est rappelée ici parce qu'elle ne figure nulle part ailleurs dans le code, et qu'un lecteur qui découvrirait ce module dans six mois doit savoir qu'il a été bâti avant sa confirmation formelle.

---

## 2. Ce que le lot livre

Les lots 1 à 4 avaient fait exister l'argent qui rentre, celui qui sort, celui qu'on s'est engagé à dépenser, et tous ceux à qui l'agence doit quelque chose. Celui-ci fait exister **la matière** — et il change la façon dont un chantier apprend ce qu'il coûte.

| Sous-lot                              | Service                              | Écran                  |
| ------------------------------------- | ------------------------------------ | ---------------------- |
| 1 · Référentiel                       | `lib/finance/stock-referentiel.ts`   | `StockReferentiel.tsx` |
| 2 · Réceptions, sorties, valorisation | `lib/finance/stock-mouvements.ts`    | `Stock.tsx`            |
| 3 · Transferts et inventaire          | `lib/finance/stock-inventaire.ts`    | `StockInventaire.tsx`  |
| 4 · Bascule et rapprochement          | `lib/finance/stock-rapprochement.ts` | `StockChantier.tsx`    |

Six tables neuves, quatre énumérations, une migration purement additive. Deux comptes opérationnels de plus — le **311** pour les stocks, le **603** pour les variations d'inventaire. **Aucune permission neuve** : les six des lots précédents suffisent encore.

Les quatre écrans sont routés, présents au menu, et servis par le banc de l'atelier. La fiche d'un chantier mène à son stock.

---

## 3. Le fil du lot : le stock redéfinit le coût, il ne s'y ajoute pas

C'est le principe P-7 du PRD, et tout le lot en découle.

Dès qu'un chantier est passé au stock, la facture de ses matériaux **cesse de s'imputer à son coût** : sa valeur entre au 311, et c'est la **sortie de magasin** qui fait du matériau une charge.

### Le double comptage était le piège, et rien ne l'aurait signalé

Si la facture continuait de s'imputer pendant que la sortie s'impute aussi, le chantier paraîtrait coûter le double de ce qu'il coûte, et le dirigeant déciderait là-dessus. Prises séparément, les deux imputations sont légitimes ; la balance reste équilibrée dans les deux cas. **Aucun test unitaire ne pouvait voir la différence** — ceux du fournisseur remplacent le moteur comptable par une doublure, ceux du stock ne connaissent pas la facture.

C'est le parcours de bout en bout qui le prouve, en trois temps : avant bascule la facture fait monter le coût, après bascule elle ne le fait plus, et la sortie le fait monter d'exactement la valeur sortie.

### Le tri se fait imputation par imputation, sur la date de la pièce

Une facture peut porter un chantier au stock et un autre qui ne l'est pas. Et une facture du mois dernier, saisie aujourd'hui sur un chantier basculé hier, **appartient à l'avant** : elle s'impute comme avant. Juger sur l'instant présent aurait reclassé rétroactivement des pièces déjà comptées.

### La bascule est irréversible, et sans porte de sortie

Revenir en arrière obligerait à rejouer l'imputation de toutes les factures postérieures et à défaire celle de toutes les sorties. Le coût du chantier changerait sous les pieds de celui qui le regarde. Il n'existe donc aucune fonction de retour, pas même réservée à un administrateur — et l'écran le dit avant de confirmer.

---

## 4. Trois décisions de conception, et pourquoi

**Le coût moyen est par (article, lieu), jamais global.** Le besoin S4 exige une quantité _et une valeur_ par dépôt et par chantier ; un coût moyen global ne saurait pas dire ce que vaut le stock d'un dépôt.

**Le coût moyen ne se stocke pas, le solde si.** Le coût moyen se déduit de `value / quantity` — une troisième colonne serait un troisième chiffre à tenir d'accord avec les deux autres, et c'est toujours celui-là qui ment. Mais le **solde**, lui, est stocké, et c'est la seule grandeur de tout le module financier qui échappe à la doctrine « ce qui se calcule ne se stocke pas ». Elle y échappe pour une raison : une moyenne pondérée **dépend du chemin**, elle ne se déduit pas d'un ensemble de mouvements, elle se construit en les rejouant dans l'ordre. Le dépôt suivait déjà ce schéma depuis le lot 1 — `ThirdPartyAccount.balance` et `ThirdPartyMovement.balanceAfter` — et `StockBalance` reprend ce couple.

**Une sortie supérieure au stock est refusée.** C'est la seule interdiction dure du module, et elle tranche avec la doctrine suivie partout ailleurs : enregistrer ce qui a eu lieu plutôt que bloquer. Ici c'est différent — un stock négatif n'a pas de coût moyen qui veuille dire quelque chose, et toute la valorisation qui suit deviendrait fausse. Quand le physique dépasse ce que le système croit, le geste juste est un inventaire, pas une sortie à découvert.

---

## 5. Les défauts trouvés à l'intégration

### Douze routeurs, vingt-quatre allers-retours en base pour rien

Chaque sous-lot financier monte son routeur sur `/api`, et chacun pose sa garde sur le préfixe `/tenants/:tenantId/finance`. Express exécute le `use` de **chaque** routeur dont le préfixe correspond, jusqu'à trouver la route qui répond. Une seule requête financière vérifiait donc le jeton jusqu'à douze fois, et `requireTenantAccess` — qui fait **deux requêtes en base** — tournait jusqu'à douze fois aussi.

C'est mon fait, accumulé un sous-lot à la fois depuis le lot 2. **Aucun test ne pouvait le voir** : chaque suite d'API monte un seul routeur, et le défaut ne naissait que de leur addition dans `index.ts`. Les deux gardes se court-circuitent désormais, et un test l'épingle.

Relevé par l'agent du référentiel, dans un fichier qui ne lui appartenait pas.

### `tenantContext` déclaré deux fois, avec des types incompatibles

Deux fichiers augmentaient l'interface `Request` d'Express avec la même propriété et des types qui ne se fusionnent pas. Conséquence : **les deux fichiers ne pouvaient jamais être importés dans une même compilation**, ce qui rendait intestable toute suite qui chargeait les deux. 101 erreurs de typage préexistantes, 97 après.

### Le rapprochement cachait une donnée réelle

Le contrat disait qu'un chantier non basculé affiche « tout à zéro ». Faux : un magasin central peut lui avoir livré des sorties qui ont bel et bien imputé son coût. Seuls le facturé et l'écart dépendent de la bascule ; le consommé, le reçu et le restant disent la vérité dans tous les cas.

L'agent a implémenté la lettre du contrat **tout en écrivant que c'était le seul endroit où son rendu mentait**. C'était la bonne réaction, et c'est le contrat qui avait tort.

### Une livraison interne n'est pas un achat

Le même contrat mettait les réceptions **et** les transferts reçus dans une seule grandeur, confrontée au facturé. Dans le cas le plus courant — un chantier approvisionné depuis un magasin central, sans facture à son nom — l'écart affichait l'opposé de tout ce qu'on lui avait livré. Un nombre négatif qui ne veut rien dire.

Les deux entrées sont séparées. Seule la réception facturée se confronte au facturé ; un transfert a déjà été payé ailleurs, ou ne l'a jamais été.

**Un indicateur qui se trompe dans le cas le plus fréquent est pire qu'un indicateur absent.** L'agent l'avait annoncé « structurellement négatif et difficile à lire » sans avoir le droit d'y toucher.

### Trois textes affirmaient que la bascule n'était pas branchée

Elle l'était depuis un commit précédent. Le contrat avertissait encore « tant qu'il n'est pas posé, le coût est compté deux fois » — un avertissement que j'avais écrit exprès après le lot 4, qui a servi, puis **qui a survécu au geste qu'il réclamait**. Un agent des écrans l'a lu comme l'état actuel et a classé le double comptage comme le risque le plus cher de son sous-lot.

Deux autres textes disaient la même chose périmée : un commentaire de contrôleur, et un bloc de documentation orphelin décrivant une duplication de code supprimée depuis.

**Un avertissement périmé se lit comme un avertissement.** Les trois sont corrigés.

### Le journal montrait deux moitiés de transfert sans rien qui les relie

Le service qui écrit un transfert insiste dans son propre en-tête : c'est `transferGroupId`, et lui seul, qui dit qu'il s'agit d'un déplacement et non d'une perte d'un côté suivie d'une apparition de l'autre. **Il n'était exposé nulle part.** Le champ est ajouté au contrat de lecture et rempli par les deux services ; le regroupement à l'écran reste à faire et figure dans ce qui reste ouvert.

### Une page de 1 146 lignes que rien n'avait jamais exercée

L'écran de paramétrage a été livré par un agent coupé avant d'écrire ses tests. Un second agent a été chargé d'écrire cette suite **et de corriger ce qu'elle révélerait**, avec pour consigne qu'un « la page était parfaite » serait un signal d'alarme. Elle en a révélé quatre, dont un vrai trou fonctionnel.

**On ne pouvait plus rien désactiver sous 992 pixels.** En dessous de ce seuil, la vue rend des cartes et non un tableau : la colonne « Actions » disparaît, et les cartes n'offraient que « Corriger ». Un article ou un lieu devenait donc indésactivable sur mobile — et rien ne le remplace, puisque **aucune route ne supprime**. La donnée était piégée.

**L'avertissement sur le changement d'unité criait à faux.** Il se déclenchait dès que le champ était vidé pour être retapé, affichant « changer l'unité de "sac" en "" ». C'est le seul avertissement sérieux de cet écran ; le voir mentir à chaque frappe est la meilleure façon qu'on lui apprenne à l'ignorer.

**Un message d'erreur désignait le mauvais champ** — il réclamait le libellé quand c'était le chantier qui manquait.

**Un avertissement était dupliqué mot pour mot** entre le tableau et la carte : extrait en constante, parce que l'une des deux copies aurait fini par laisser croire qu'on supprime.

Sur les neuf exigences vérifiées, l'écran hérité était déjà correct pour cinq d'entre elles. Le reste n'aurait été découvert qu'à l'usage.

### `roundQuantity` vivait en trois copies

Une par fichier du lot, chacune signalée par son agent comme une dette à remonter. Elle rejoint `roundMoneyXof` et `roundPercent` dans `money.ts`. Deux copies finissent par diverger : c'est ce qui avait donné cinq versions de la formule du coût réel avant `site-cost.ts`.

---

## 6. Ce que les agents ont mieux fait que ma spécification

**Ils ont refusé d'interpréter.** L'écran du rapprochement n'attribue **aucune couleur** à l'écart, jamais de rouge, parce qu'un rouge est déjà un verdict. Et son test ne balaie pas seulement « débit » et « crédit » : il refuse aussi « perte », « vol », « anomalie », « manquant », « détournement ». Un vol et des frais de transport se ressemblent dans une soustraction ; le système montre, il ne juge pas.

**Ils ont écrit des tests qui peuvent échouer.** Les fixtures du comptage portent un écart que la soustraction ne produit pas — un écran qui recalculerait tomberait. C'est la leçon du lot 4 appliquée sans qu'on la redemande.

**Un agent a testé la disposition mobile, que personne ne teste.** C'est en basculant le point de rupture qu'il a trouvé le trou de désactivation. Aucune autre suite d'écran du dépôt ne le fait : `useBreakpoint` y est figé en bureau, et tout ce qui ne vit que dans les cartes échappe donc aux tests.

**Un agent a trouvé un piège de test qui vaut pour tout le dépôt.** Ant Design laisse les menus déroulants déjà déployés dans le document : un `findByText` global cliquait l'option d'une ligne précédente et modifiait la mauvaise ligne, **sans que rien n'échoue**. Sa fonction retrouve le menu par son identifiant. Les autres suites à formulaires répétés peuvent porter le même défaut silencieux.

---

## 7. Ce qui reste ouvert

### À trancher avec la cliente

**L'écart du rapprochement compte le total des factures, pas leurs seules lignes de matériaux.** Une facture de sous-traitance ou de location d'engin rattachée au même chantier gonfle l'écart sans qu'aucun matériau soit en cause. Sur un chantier où les factures ne sont pas majoritairement des matériaux, l'indicateur sera structurellement gros.

**La décision de méthode de valorisation n'a pas de mémoire.** Le besoin S5 veut qu'un changement soit documenté ; la table ne garde que la dernière décision, pas l'historique. Sans conséquence tant qu'une seule méthode existe — mais le jour où une seconde arrive, il faudra une table d'historique.

**`GET /stock/settings` écrit.** La lecture sème les réglages par défaut si le tenant n'en a pas, sur une route portée par un droit de lecture. Le précédent existe dans le dépôt, mais il mérite d'être su.

### Dettes techniques assumées

**Le journal des mouvements ne pagine pas.** C'est le journal quotidien d'un magasin : il grossira sans borne et l'écran charge tout. La dette la plus sérieuse du lot.

**Aucun filtre par demandeur au journal**, alors que le besoin S3 fait du demandeur la pièce centrale de la traçabilité. « Qui a sorti quoi ce mois-ci » n'est pas répondable aujourd'hui.

**Le journal ne regroupe pas encore les deux moitiés d'un transfert**, bien que le champ existe désormais.

**Une sortie erronée n'a aucun moyen d'être défaite.** `VoidableDocumentType` ne connaît pas les pièces de stock. Le rattrapage est un ajustement d'inventaire, qui remet la quantité sans retirer l'imputation du coût du chantier.

**La fenêtre de concurrence sur `StockBalance` est ouverte**, comme celle du grand livre des tiers depuis le lot 1 : lecture puis écriture, sans verrou. Deux sorties réellement simultanées du même couple (article, lieu) peuvent lire le même solde. Un `SELECT … FOR UPDATE` serait le remède ; il est intestable sous le magasin en mémoire des tests unitaires.

**Rien ne gèle un lieu pendant un comptage**, et rien n'empêche un mouvement postérieur à la validation d'un inventaire. C'est la faille par laquelle un inventaire peut écraser une sortie légitime.

**Quatre bancs de l'atelier répondent aux mêmes routes d'articles et de lieux.** Chaque sous-lot a dû composer ses propres listes, faute de pouvoir importer celles d'un voisin écrit en parallèle. Résolu par l'ordre d'inscription — le référentiel gagne — plutôt que par une réécriture.

**Deux services web listent les mêmes deux routes** — articles et lieux — avec des types de lecture différents, parce que chaque sous-lot a recopié sa frontière pendant que les voisins s'écrivaient. Cela se lit comme un oubli même si c'était délibéré, et un agent l'a signalé en devant renommer ses propres imports pour éviter la collision.

**Aucune suite d'écran du dépôt ne teste la disposition mobile**, sauf celle du paramétrage désormais. Tout ce qui ne vit que dans les cartes — la désactivation en était — échappe aux tests.

**La recherche d'articles n'a pas d'anti-rebond** : chaque frappe déclenche une requête. Il n'existe aucune convention d'anti-rebond dans les écrans des lots précédents ; c'est un choix transversal à faire une fois.

**Le banc de l'atelier ignore toujours les paramètres de requête et la méthode HTTP.** Les filtres ne filtrent pas, et les paires `GET`/`POST` partageant un chemin retombent sur la liste.

**La devise est incohérente dans les jeux d'essai** : 83 occurrences de `XOF`, 18 de `GNF`, 4 de `FCFA`, et `MoneyValue` affiche « FCFA » en dur. Une agence en une autre devise afficherait faux, dans tout le module.

**Toujours aucune vérification HTTP de bout en bout.** Les tests d'écran épinglent ce que le web envoie, les tests d'API ce que le serveur accepte ; les deux moitiés se répondent sans jamais se rencontrer. Les parcours appellent les fonctions du domaine, pas les routes. C'est l'angle mort depuis le lot 2.

---

## 8. Chiffres

|                                   |                                        |
| --------------------------------- | -------------------------------------- |
| Sous-lots                         | 4, gelés et ouverts l'un après l'autre |
| Agents                            | 9 (4 services, 5 écrans)               |
| Tables neuves                     | 6                                      |
| Migrations                        | 1, purement additive                   |
| Comptes opérationnels ajoutés     | 2 (311, 603)                           |
| Tests API du paquet, en entier    | 1255, tous verts                       |
| Tests d ecran du module financier | 522, tous verts                        |
| Parcours de bout en bout du lot   | 1, 23 constats, tous tenus             |
| Erreurs de typage préexistantes   | 101 avant le lot, 97 après             |

---

## 9. Vérifié contre une vraie base

```bash
npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot5.ts
```

Vingt-trois constats, dans l'ordre d'une vraie vie de chantier : une facture imputée fait monter le coût ; basculer crée le lieu de stockage ; **la même facture, après bascule, ne le fait plus** ; la réception valorise le stock sans écrire d'écriture ; **la sortie fait monter le coût, d'exactement la valeur sortie** ; un transfert ne fait monter aucun coût ; un écart d'inventaire ne s'impute à aucun chantier ; et le rapprochement sépare ce qui vient d'une facture de ce qui vient d'un autre lieu.

Le script crée un tenant jetable au slug reconnaissable, nettoie systématiquement, et ne prétend jamais avoir nettoyé ce qui ne l'a pas été. Il se rattrape avec `--nettoyer-restes`.
