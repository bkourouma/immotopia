# Lot 4 — Baux de terrain, associations, salaires, tâcherons, retenues, clôture · Rapport de fin de lot

> Périmètre : `docs/finance/PLAN-mise-en-oeuvre.md` §8, PRD épiques E6, E7, E8.
> Branche : `feat/finance-lot-0`.
> 19 septembre 2026.

---

## 1. Ce que le lot livre

Les lots 1 à 3 avaient fait exister l'argent qui rentre, celui qui sort, et celui qu'on s'est engagé à dépenser. Celui-ci fait exister **tous ceux à qui l'agence doit quelque chose** — un bailleur, des associés, des salariés, des tâcherons — puis **ferme le chantier** et dit ce que chaque lot produit aura coûté.

Six sous-lots, ouverts et refermés l'un après l'autre.

| Sous-lot                           | Service                       | Écrans                                   |
| ---------------------------------- | ----------------------------- | ---------------------------------------- |
| 1 · Baux de terrain                | `lib/finance/land-leases.ts`  | `BauxDeTerrain.tsx`, `BailDeTerrain.tsx` |
| 2 · Associations                   | `lib/finance/partnerships.ts` | `Associations.tsx`, `Association.tsx`    |
| 3 · Salaires                       | `lib/finance/salaries.ts`     | `Salaires.tsx`, `Salarie.tsx`            |
| 4 · Tâcherons                      | `lib/finance/contractors.ts`  | `Tacherons.tsx`, `Tacheron.tsx`          |
| 5 · Retenues de garantie           | `lib/finance/retentions.ts`   | `RetenuesDeGarantie.tsx`                 |
| 6 · Lots, coût de revient, clôture | `lib/finance/site-closing.ts` | `ClotureChantier.tsx`                    |

Les onze écrans sont routés, présents au menu, et servis par le banc de l'atelier. La fiche d'un chantier mène désormais à ses lots et à sa clôture.

Onze tables neuves, cinq colonnes ajoutées à des tables existantes, deux migrations purement additives. Un compte opérationnel de plus, le **4047**, pour les retenues. **Aucune permission neuve** : les six des lots précédents suffisent encore.

Deux parcours de bout en bout contre une vraie base viennent s'ajouter aux trois existants.

---

## 2. Pourquoi ce lot a été ouvert sous-lot par sous-lot

Les trois lots précédents ont chacun livré la même leçon, et le compte est sans appel : **les défauts les plus coûteux viennent des contrats que j'ai gelés seul**. Quatre au lot 1, trois au lot 2, cinq au lot 3.

Un contrat gelé avant d'avoir le nez dans le schéma se trompe, et il se trompe en silence : les agents l'implémentent fidèlement, leurs tests passent, et le défaut ne se voit qu'à l'intégration — ou plus tard.

Ce lot a donc été découpé en six, chaque contrat gelé juste avant son sous-lot, avec le schéma déjà appliqué et le client Prisma déjà généré. Le résultat : **aucun contrat n'a dû être rouvert après coup**, sauf pour un ajout purement additif (§4).

---

## 3. Le fil du lot : ce que l'agence doit, et à qui

Le module savait dire ce qu'un locataire doit. Il sait désormais dire ce que l'agence doit, et la difficulté est toujours la même — **ne pas confondre deux grandeurs qui se ressemblent**.

### Le locataire doit le loyer entier

Un bien détenu en association produit un loyer que l'agence encaisse **en entier** ; ce qui se répartit entre associés est le _produit_, jamais la _créance_. Une agence qui se tromperait là-dessus réclamerait 60 % du loyer à son locataire et perdrait 40 % de son chiffre sans le voir.

Le parcours de bout en bout le vérifie explicitement.

### Un tâcheron a deux soldes

```
marché restant    = montant convenu − situations validées   → ce qui reste à EXÉCUTER
ce qu'on lui doit = situations validées − règlements        → ce qui reste à PAYER
```

Un tâcheron peut avoir terminé son marché et rester créancier, ou n'avoir rien fait et être débiteur d'un acompte. Les deux chiffres ne portent pas le même nom à l'écran, et un test le prouve.

### Une retenue ne diminue pas la charge

L'ouvrage a coûté son prix entier. Ce qui change, c'est ce qu'on doit **maintenant**. Une retenue qui ferait baisser le coût d'un chantier serait un mensonge comptable doublé d'un mensonge de pilotage : le chantier paraîtrait moins cher parce qu'on n'a pas fini de payer.

C'est pourquoi la retenue est un **reclassement** posé sur une pièce déjà validée — débit du tiers, crédit du 4047 — et n'écrit aucune imputation. Un test le prouve par le vrai chemin du lot 2 : on lit le coût réel, on pose la retenue, on libère, et le chiffre ne bouge pas aux trois lectures.

### Libérer n'est pas payer

Libérer rend l'argent exigible ; le règlement se fait ensuite par le chemin ordinaire. Un bouton « Payer » aurait fait croire à l'utilisateur qu'il avait versé l'argent.

### Le coût par lot ne se stocke pas

Il se dérive du coût du chantier et de la clé de répartition, comme le coût réel se dérive des imputations. Ce qui se fige, c'est le coût du **chantier**, à la clôture.

---

## 4. Les défauts trouvés à l'intégration

### Trois sous-lots étaient du code mort

Le plus grave, et aucun test ne pouvait le dire.

**La campagne de facturation n'appelait pas la ventilation.** `distributeInstallmentToPartnersTx` était écrite, testée par 50 tests, ses routes montées — et référencée nulle part hors de son propre fichier. L'agence n'aurait jamais rien dû à personne, et la seule chose qui l'aurait signalé est un associé qui finit par réclamer son argent.

Le test unitaire de la campagne ne pouvait pas le voir : il remplace Prisma par une doublure, et la ventilation, qui **ne lève jamais** par contrat, y passait en silence sans rien trouver. Un test qui ne peut pas échouer ne prouve rien.

**`assertSiteOpenTx` n'était branchée nulle part.** Écrite, exportée, documentée, testée chez elle par cinq cas. C'est pourtant elle qui rend `finalCost` vrai : sans elle, une pièce validée le lendemain d'une clôture fait diverger le coût figé du coût réel, en silence, et un dirigeant vend ses lots sur un coût de revient faux. Elle est désormais appelée aux cinq points d'écriture du coût.

**Le banc de l'atelier ne servait pas les associations.** L'écran était écrit, testé, monté nulle part et alimenté par personne.

Ces trois-là ont la même forme : un agent ne peut pas câbler son travail dans un fichier-registre qui ne lui appartient pas, et ce qui n'est câblé par personne n'existe pas. C'est au superviseur de le faire, et c'est ce qui manquait.

### Une nature non déclarée retombait en silence sur « MANUAL »

`SOURCE_TYPE_BY_DOCUMENT` traduit la nature d'une pièce en nature d'écriture, avec un repli `?? 'MANUAL'`. Six natures du lot 4 n'y figuraient pas : leurs écritures portaient donc `MANUAL`, et le grand livre général perdait une distinction qu'il a pour toutes les autres pièces du module.

Le défaut ne casse aucun test — le journal reste équilibré, il devient seulement illisible. Il avait déjà frappé les baux de terrain au sous-lot 1, et il s'est rejoué.

### Le même écart de contrat, pour la troisième fois

`FinanceSourceType` et `PostDocumentEntryParams.documentType` sont deux unions gelées. Chaque sous-lot les a trouvées trop étroites pour ses propres natures, et chacun a fait la même chose : un transtypage local et nommé, documenté en tête de fichier, signalé dans sa rubrique d'hypothèses.

Quatre agents ont produit le même constat indépendamment. Les unions sont élargies, les transtypages ont disparu, et la leçon est écrite noir sur blanc : **un contrat gelé avant ses voisins les laisse derrière lui**.

### Vingt-huit `as any` qui ne servaient à rien

En les retirant, j'ai découvert que le compilateur était réduit au silence sans aucune raison : les types déclarés étaient déjà les bons. Vingt-deux dans six services, six de plus dans le service de clôture. Aucune erreur de compilation, aucun test cassé.

Ils venaient d'un geste recopié de proche en proche depuis le lot 1, où il avait peut-être eu une raison. Personne ne l'avait revérifié.

### Un identifiant répété, pour la cinquième fois

`createLandLeasePayment` envoyait dans le corps un identifiant déjà porté par le chemin. Cela ne cassait rien **uniquement** parce que son schéma Zod n'était pas `.strict()` : Zod retirait le champ en silence. Le jour où ce schéma aurait été durci comme ceux des sous-lots suivants, cette création serait tombée en 400.

Le schéma est durci, le corps corrigé. Relevé par l'agent des écrans des tâcherons, en lisant un fichier qui ne lui appartenait pas.

### « ISSUED » s'affichait en anglais, depuis le lot 3

Quatre codes de statut manquaient à la table de `StatusTag`. Le composant rend fidèlement le code qu'il ne connaît pas, donc un bon de commande émis affichait « ISSUED » à l'utilisateur.

`status-coverage.test.ts` existe précisément pour empêcher cela, et affirmait couvrir « tout code déclaré dans une énumération du dépôt », « à partir des énumérations elles-mêmes, pas d'une liste recopiée ». Sa liste **était** recopiée, et les statuts financiers n'y figuraient pas — ce sont des unions TypeScript, qui s'effacent à la compilation et n'ont aucune forme qu'un test puisse parcourir.

Le test couvre désormais les huit unions, et son en-tête dit franchement lesquelles sont parcourues et lesquelles sont recopiées. **Un test qui promet plus qu'il ne tient est pire qu'un test absent : on cesse de regarder.**

### Le contrat des retenues annonçait une garantie qui n'existe nulle part

Son en-tête disait, à propos de la fenêtre qu'on ne sait pas fermer côté situations d'avancement : « l'écran pose la retenue dans la foulée de la validation, et c'est la seule garantie qu'on ait de ce côté ».

C'était faux. L'écran des retenues est une liste autonome, atteinte depuis le menu ; aucun écran ne propose de poser une retenue au moment où l'on valide une situation.

L'agent des écrans l'a constaté en découvrant qu'on lui demandait de tenir une promesse écrite dans un contrat qu'il n'avait pas rédigé. **Un contrat qui décrit une garantie inexistante est plus dangereux que l'absence de garantie : on cesse de chercher le trou.** Le contrat dit désormais la vérité, et la fenêtre figure dans ce qui reste ouvert.

### Un contrat disait le contraire de son implémentation

`unallocatedCost` devait valoir « zéro dès qu'il y a un lot — la répartition est exhaustive par construction ». Le service, lui, calcule `totalCost − somme des parts` : sans clé de répartition, rien n'est réparti et le champ vaut le coût entier malgré des lots existants.

C'est l'implémentation qui a raison. L'agent des écrans a construit son écran sur le comportement réel plutôt que sur la promesse, et signalé l'écart. Le commentaire est corrigé.

Trois refus du même sous-lot portaient également plus loin que le contrat ne l'annonçait — corriger ou supprimer un lot, ou changer la clé, est refusé dès qu'**un** lot du chantier a basculé, pas seulement celui qu'on touche. La règle est bonne : corriger un lot change la part de tous les autres. Elle n'était écrite nulle part ; elle l'est maintenant.

### Un gestionnaire d'arrêt qui bouclait à l'infini

`process.on('beforeExit')` avec un gestionnaire asynchrone : `beforeExit` se déclenche chaque fois que la boucle d'événements se vide, le gestionnaire `async` y replace aussitôt du travail, la boucle ne se vide donc jamais pour de bon, et l'événement se redéclenche.

Conséquence : tout script du paquet qui avait fini son travail continuait à tourner en écrivant la même ligne de journal. Un fichier de 1,4 Go observé en pratique, et des scripts qu'on croyait bloqués alors qu'ils avaient déjà tout fait.

### Le contrat évoquait un chiffre qu'il n'exposait pas

`PartnerStatementRecord` disait en prose « le solde de ce compte dit ce qui lui reste dû » sans jamais l'exposer. L'écran ne pouvait donc pas afficher le premier chiffre qu'un associé regarde.

L'agent des écrans a refusé de l'inventer et l'a signalé — c'était la bonne réaction. Le champ `accountBalance` a été ajouté au contrat, en cours de route, et l'agent du service l'a repris avec un test qui le distingue de `totalShare − totalPaidOut` : un relevé borné à une période plus courte que l'historique, où les deux valeurs diffèrent. Un test où elles coïncideraient ne prouverait rien.

---

## 5. Ce que les agents ont mieux fait que ma spécification

**Ils ont refusé d'inventer.** Trois fois, un agent s'est arrêté devant un champ que le contrat évoquait sans le définir, et l'a écrit dans ses hypothèses plutôt que de deviner. C'est ce qui a produit `accountBalance`.

**Ils ont lu hors de leur territoire.** Le défaut du corps répété et celui de la table de statuts ont tous deux été trouvés par des agents qui lisaient des fichiers qu'ils n'avaient pas le droit de modifier. La consigne « signale-le, ne le corrige pas » fonctionne mieux que « reste chez toi ».

**Un agent a validé une énumération que le contrat typait en `string`.** Le contrat de clôture type `propertyType` et `ownershipType` en `string` pour ne pas imposer un import d'enum dans une signature gelée. L'agent a ajouté une validation explicite qui refuse une valeur inconnue avec la liste des valeurs acceptées. C'est ce message qui m'a rattrapé quand j'ai moi-même écrit `MAISON` au lieu de `MAISON_VILLA` dans un parcours de bout en bout.

**La rubrique HYPOTHÈSES reste l'outil le plus rentable du dispositif.** Elle a produit, sur ce lot, plus de défauts réels que l'ensemble des tests.

---

## 6. Ce qui reste ouvert

### À trancher avec la cliente

**La part de l'entreprise est ce qui reste.** Le PRD dit que « le compte loyer principal ne reçoit que la part de l'entreprise ». Cette phrase suppose une comptabilisation du loyer en produit que le lot 1 n'a délibérément pas construite. La lecture retenue — l'agence doit aux associés, le reste est à elle — est la seule qui tienne avec le code existant, et elle est juste. À confirmer.

**Les charges locatives entrent dans la quote-part d'un associé.** La ventilation porte sur loyer + charges + autres frais, la même grandeur que le relevé de quote-part. Les charges sont pourtant un remboursement de frais plutôt qu'un produit. Les deux moitiés du mécanisme répondent au moins la même chose ; reste à savoir si c'est la bonne.

**Une association désactivée reçoit quand même les ventilations** si un bien lui reste rattaché. Le contrat ne mentionne `isActive` que comme filtre de liste.

**Aucune alerte de dépassement de budget ne se lève sur la main-d'œuvre ni sur les tâcherons.** Elle se lève sur les factures fournisseur et les pièces de caisse. Trois agents ont signalé l'asymétrie indépendamment. Uniformiser est un choix, pas une correction évidente.

**Le 4047 est unique pour les fournisseurs et les tâcherons**, alors que le 401 et le 402 ont justement été séparés. Le grand livre ne dira donc pas ce qui est détenu à chaque population ; seule la liste des retenues le dira.

**Les bloqueurs de clôture excluent délibérément le budget prévisionnel et les bons de commande.** Un budget est une prévision, pas une dépense ; un bon est un engagement dont la réception produit une facture, qui elle bloque. À arbitrer si la cliente veut l'inverse.

### Dettes techniques assumées

**La fenêtre de la retenue sur situation d'avancement est ouverte, et rien ne la ferme.** Le contrat prétendait le contraire (§4). Pour une facture, le service refuse une retenue posée après un règlement, parce que les règlements y sont affectés pièce par pièce. Pour une situation, ils ne le sont pas. La refermer demande un bouton « Poser une retenue » au moment de la validation, sur la fiche du tâcheron et sur celle de la facture fournisseur — un ajout à arbitrer, pas une correction évidente.

**Toujours aucune vérification HTTP de bout en bout.** `corps-des-requetes.test.ts` épingle ce que le web envoie, les tests d'API ce que le serveur accepte ; les deux moitiés se répondent mais ne se rencontrent jamais. Les parcours de bout en bout appellent les fonctions du domaine, pas les routes. C'est le même angle mort depuis le lot 2, et il est documenté comme tel dans l'en-tête du fichier de garde.

**La retenue sur une situation d'avancement ne peut pas vérifier qu'elle arrive à temps.** Pour une facture, les règlements sont affectés pièce par pièce et le service refuse une retenue posée trop tard. Pour une situation, les règlements ne sont affectés à rien — on règle un tâcheron, pas une situation. L'écran pose la retenue dans la foulée de la validation, et c'est la seule garantie de ce côté.

**Pas de libération partielle de retenue, pas d'acquisition.** Les retenues libérées en deux temps existent, le PRD n'en parle pas, et la moitié d'un mécanisme est pire que son absence.

**Aucune route d'annulation** pour les notes de salaire, les situations d'avancement et leurs règlements, alors que leur statut peut valoir `VOIDED`. Le lot 2 en a une pour ses pièces fournisseur.

**Aucune lecture ne rend l'enregistrement de clôture.** `closedAt`, `closedByLabel` et `finalCost` ne sont rendus que par les gestes de clôture et de réouverture. Un chantier clos rechargé ne peut donc pas afficher « clôturé le … par … » : il manque un `GET /sites/:siteId/closure`. Dans le même esprit, `POST /reopen` rend un enregistrement de clôture sur un chantier qu'on vient justement de rouvrir — la forme est trompeuse, l'écran ignore la réponse.

**Sur un chantier clos, l'écran n'offre plus de corriger ni de supprimer un lot**, alors que le serveur l'accepterait. Restriction volontaire de l'écran : sur un chantier clos, l'action offerte est la bascule. Conséquence : corriger le nom d'un lot avant de le basculer oblige à rouvrir le chantier.

**L'écran des retenues dépend de trois autres sous-lots** pour son seul formulaire : il n'existe aucune liste transversale des pièces validées sans retenue, donc il compose fournisseur → facture et marché → situation à partir des services voisins. Le tri « validées seulement » se fait côté écran, faute de filtre serveur, et une pièce déjà porteuse d'une retenue reste proposée — l'utilisateur ne l'apprend qu'au refus.

**Pas de `GET /contractors/:contractorId`.** La fiche d'un tâcheron charge donc tous les tâcherons de l'agence pour en afficher un. Isolé dans une seule fonction du service web, remplaçable en un point.

**Le banc de l'atelier ignore les paramètres de requête et la méthode HTTP.** `mock-api.ts` ne transmet que le chemin : les filtres sont perdus, et les paires `GET`/`POST` partageant un chemin retombent sur la branche liste. Limite du banc, pas des écrans ; la corriger demande de changer la signature de tous les gestionnaires.

**Une migration présente en base est absente du dépôt** : `20260918164826_generalize_accounting_scope`. Antérieure à ce lot.

**101 erreurs de typage préexistantes** dans `packages/api`, aucune introduite par ce lot. **Aucun `.gitattributes`** : environ 200 fichiers apparaissent modifiés par simple changement de fin de ligne, ce qui oblige à stager fichier par fichier.

---

## 7. Chiffres

|                                            |                                        |
| ------------------------------------------ | -------------------------------------- |
| Sous-lots                                  | 6, gelés et ouverts l'un après l'autre |
| Agents                                     | 10 (6 services, 4 écrans)              |
| Tables neuves                              | 11                                     |
| Migrations                                 | 2, purement additives                  |
| Tests API du module financier              | 805, tous verts                        |
| Tests d'écran du module financier          | 280, tous verts                        |
| Parcours de bout en bout du lot            | 2, 43 constats, tous tenus             |
| Transtypages inutiles retirés              | 28                                     |
| Défauts trouvés par la rubrique HYPOTHÈSES | 12                                     |
| Défauts trouvés par les tests              | 2                                      |

---

## 8. Vérifié contre une vraie base

```bash
npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot4-associations.ts
npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot4-cloture.ts
```

Le premier, 19 constats : la campagne ventile, le locataire doit le loyer entier, la somme des parts vaut le montant réparti au franc près, rejouer ne double rien, un bien sans association ne ventile rien.

Le second, 24 constats : le coût réel monte, la somme des coûts de revient vaut le coût du chantier, clôturer fige le coût, **un chantier clos refuse une nouvelle dépense**, la bascule au patrimoine porte le coût de revient en valeur d'acquisition et ne se fait qu'une fois, rouvrir libère le coût.

Les deux créent un tenant jetable au slug reconnaissable, nettoient systématiquement, et ne prétendent jamais avoir nettoyé ce qui ne l'a pas été. Ils se rattrapent avec `--nettoyer-restes`.
