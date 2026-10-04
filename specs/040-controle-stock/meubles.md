# Spécification 040 — Contrôle des stocks · volet meublés : gabarit mobilier des états des lieux

> Volet parallèle de la spec 040 (exigences M1 à M5). Il ne touche aucun
> fichier du stock de chantier et peut être livré indépendamment des sprints A
> et B.
> Vérifié dans le worktree `feat/controle-stock` (base `e72e960a`, à jour de
> `origin/main`) le 04/10/2026. Les références `fichier:ligne` portent sur cet
> état.

## 0. Cadre

| Décision                | Conséquence pour ce volet                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 — tout est inclus    | Le gabarit reste sous la fonctionnalité **RENTAL** (`route-features.ts:131`, préfixe `/rental`), donc dans les mêmes packs qu'aujourd'hui. Aucune ligne de catalogue, aucune permission nouvelle : les routes gardent `RENTAL_LEASES_VIEW` / `RENTAL_LEASES_EDIT` (`lease-inspection-routes.ts:53-68`). |
| D2 — vocabulaire        | Le statut s'appelle **« Manquant »**. Les écrans parlent de « manquant », « baisse de quantité », « absent de la sortie », « clé manquante ». Aucun libellé, message d'API ni ligne de retenue proposée ne qualifie la cause de l'écart.                                                                |
| D3 — périmètre          | M1 à M5 seulement. Pas de PDF, pas de publication aux portails, pas de contre-signature, pas de registre des clés, pas de modèle par agence (voir §12).                                                                                                                                                 |
| D4 — rien d'automatique | Les retenues restent **proposées** à la demande de l'agent, modifiables, et ne sont enregistrées que par « Enregistrer ». La finalisation ne crée aucun mouvement de dépôt (c'est déjà le cas, `service.ts:528-559`). Les photos restent celles des éléments, pas des personnes.                        |
| Pas de migration        | `rooms` et `deductions` sont des colonnes JSON (`schema.prisma:7932`, `:7940`) : le volet n'ajoute ni table, ni colonne, ni énumération Prisma.                                                                                                                                                         |

## 1. Objectif

Un état des lieux de logement meublé doit pouvoir servir d'inventaire :
lister le mobilier et les équipements avec leur quantité et, si l'agence le
souhaite, leur valeur de remplacement ; constater à la sortie qu'un objet est
manquant ou qu'il en manque une partie ; faire ressortir ces écarts, ainsi que
les clés et les compteurs, dans la comparaison ; et préparer la retenue sur le
dépôt de garantie à partir de la valeur de remplacement, au lieu d'une ligne à
0 FCFA.

## 2. Existant vérifié

| Sujet                       | Constat                                                                                                                                                                                                                                                                    | Référence                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Modèle                      | `LeaseInspection` : `rooms Json`, `meters Json?`, `keysCount Int?`, `deductions Json?`, unique par `(leaseId, type)`. Forme du JSON documentée en commentaire.                                                                                                             | `schema.prisma:7925-7954` (commentaire du modèle `:7914-7924`), unicité `:7951`                         |
| États possibles             | `NEW, GOOD, FAIR, POOR, BROKEN` : pas d'état « manquant ».                                                                                                                                                                                                                 | `service.ts:27`, `:381` ; web `lease-inspections-service.ts:15`, `inspection-constants.ts:9`            |
| Élément                     | `{ id, label, condition, comment }` : ni quantité, ni valeur.                                                                                                                                                                                                              | `service.ts:29-34`, validation `:383-388`                                                               |
| Modèle de pièces            | Codé en dur, bâti seulement (sol, murs, portes, sanitaires…). Libellés stockés en français, sans `t()`.                                                                                                                                                                    | `service.ts:98-121`                                                                                     |
| Sortie                      | Reprend les pièces et identifiants de l'entrée, états et commentaires vidés.                                                                                                                                                                                               | `service.ts:124-130`, `:350-359`                                                                        |
| Validation                  | `z.object` sans `passthrough` : toute clé inconnue d'un élément ou d'une retenue est **supprimée** à l'enregistrement. Unicité des identifiants de pièce et d'élément dans le document.                                                                                    | `service.ts:383-414`, `:469-486`                                                                        |
| Finalisation                | Exige le signataire agence, le signataire locataire s'il était présent, et **un seul** élément renseigné.                                                                                                                                                                  | `service.ts:540-550`                                                                                    |
| Comparaison                 | Correspondance par `roomId:itemId`. `degraded` seulement si les deux états sont renseignés et la sortie strictement pire. Un élément supprimé de la sortie donne `exitCondition = null`, `degraded = false`. Ni clés ni compteurs.                                         | `service.ts:142-195` (clé `:149`, `:158`), route `lease-inspection-routes.ts:55`                        |
| Retenues proposées          | Calcul côté écran : une ligne par élément dégradé, **montant 0**, dédoublonnage par `itemId`.                                                                                                                                                                              | `InspectionForm.tsx:246-273` (`amount: 0` ligne 261)                                                    |
| Retenues consommées         | Le solde de tout compte lit `deductions` (libellé + montant seulement), même si la sortie est en brouillon ; l'écran avertit dans ce cas.                                                                                                                                  | `lease-lifecycle/service.ts:670-733` (lecture `:692-695`, `:718-722`) ; `FinalSettlementCard.tsx:45-83` |
| Clés et compteurs à l'écran | Saisis en sortie sans rappel de l'entrée.                                                                                                                                                                                                                                  | `InspectionForm.tsx:326-362`                                                                            |
| Saisie sur téléphone        | Boutons d'état de 44 px, `flex: '1 1 18%'` ; photo par l'appareil arrière.                                                                                                                                                                                                 | `ConditionPicker.tsx:19-46` ; `ItemPhotos.tsx:92-93`                                                    |
| Brouillon local             | Copie `localStorage` de toute la saisie, éléments compris.                                                                                                                                                                                                                 | `local-draft-storage.ts:13-24`                                                                          |
| Impression                  | Seule sortie papier : `window.print()` sur la vue de consultation.                                                                                                                                                                                                         | `InspectionViewer.tsx:60-65`                                                                            |
| PDF, portails               | **Aucun.** Les seuls fichiers de l'API qui lisent `leaseInspection` sont le service, le contrôleur, les routes, le solde de tout compte, la garde des fichiers et l'export d'agence. Aucune route de portail (`coowner-`, `owner-`, `tenant-portal-routes.ts`) n'en parle. | `grep -rln leaseInspection packages/api/src`                                                            |
| Export d'agence             | Exporte les lignes telles quelles et les photos (`filePath`).                                                                                                                                                                                                              | `tenant-data-export/archive-builder.ts:68`, `file-references.ts:82`                                     |
| Ameublement du bien         | `Property.furnishingStatus` : `FURNISHED`, `UNFURNISHED`, `PARTIALLY_FURNISHED`. La fiche du bail ne le renvoie pas.                                                                                                                                                       | `schema.prisma:379-383`, `:2147` ; `rental-lease-service.ts:684-690`                                    |
| Messages d'API              | Traduits par le gestionnaire d'erreurs, le texte français servant de clé ; seuls `message`, `errors[].message`, `code` et `data` (d'une `AppError`) sortent — le `details` des aides de `lib/errors.ts` n'est pas renvoyé.                                                 | `error-middleware.ts:230-241`, `:383-386` ; `lib/errors.ts:1-8`                                         |
| Audit                       | Aucun événement d'audit sur les états des lieux.                                                                                                                                                                                                                           | `audit-catalog.ts:201-210` (baux seulement)                                                             |

## 3. Vocabulaire

| Terme                             | Sens                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Élément de bâti (`FIXTURE`)       | Élément attaché au logement (sol, murs, robinetterie…). Pas de quantité. Valeur par défaut d'un élément existant.          |
| Élément de mobilier (`FURNITURE`) | Meuble, équipement, linge ou ustensile. Porte une quantité et, facultativement, une valeur de remplacement unitaire.       |
| Manquant (`MISSING`)              | L'élément n'est pas dans le logement au moment de l'état des lieux. Pour un élément de mobilier, sa quantité vaut alors 0. |
| Baisse de quantité                | Élément de mobilier présent à la sortie en nombre inférieur à l'entrée (6 chaises → 4).                                    |
| Absent de la sortie               | Élément de l'entrée qui ne figure plus dans le document de sortie (cas hérité, voir R4).                                   |
| Valeur de remplacement            | Prix unitaire, en FCFA, d'un objet équivalent, saisi par l'agence. Sert seulement à **proposer** un montant de retenue.    |
| Élément évalué                    | État renseigné ; pour le mobilier, quantité renseignée aussi, sauf s'il est manquant.                                      |

## 4. Exigences et critères d'acceptation

### M1 — Modèle « mobilier et équipements »

**Exigence.** À la création d'un état des lieux, l'agent choisit le modèle de
départ : « Bâti seulement » (le modèle actuel) ou « Bâti, mobilier et
équipements ». Le second ajoute aux pièces du modèle actuel des éléments de
mobilier, chacun avec une quantité et une valeur de remplacement facultative.
Pendant la saisie, l'agent peut ajouter un élément de mobilier à n'importe
quelle pièce.

Contenu du modèle (ajouté **après** les éléments de bâti de chaque pièce, dans
cet ordre ; libellés stockés en français, comme le modèle actuel) :

| Pièce                                              | Éléments de mobilier ajoutés                                                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrée/Séjour                                      | Canapé ; Fauteuils ; Table basse ; Table à manger ; Chaises ; Téléviseur ; Télécommandes ; Climatiseur ; Ventilateur ; Rideaux ; Lampes                                                         |
| Cuisine                                            | Réfrigérateur ; Cuisinière ou plaques de cuisson ; Bouteille de gaz ; Four à micro-ondes ; Bouilloire ; Assiettes ; Verres ; Couverts ; Casseroles et poêles ; Ustensiles de cuisine ; Poubelle |
| Chambre 1                                          | Lit ; Matelas ; Oreillers ; Jeux de draps ; Couvertures ; Armoire ou penderie ; Cintres ; Table de chevet ; Climatiseur ; Moustiquaire ; Rideaux                                                |
| Salle de bain                                      | Serviettes ; Tapis de bain ; Miroir ; Chauffe-eau                                                                                                                                               |
| WC                                                 | (aucun)                                                                                                                                                                                         |
| Équipements et divers (nouvelle pièce, en dernier) | Fer à repasser ; Planche à repasser ; Balai et serpillière ; Extincteur ; Décodeur TV ; Box internet                                                                                            |

Quantité de départ : **1** à l'entrée (l'agent la corrige), **vide** à la
sortie. Valeur de remplacement : vide.

**Choix par défaut.** Le modèle « Bâti, mobilier et équipements » est
présélectionné quand le bien du bail est `FURNISHED` ou
`PARTIALLY_FURNISHED` ; sinon « Bâti seulement ». L'agent peut toujours
changer. Côté API, l'absence de `template` vaut `STANDARD` : un appelant qui
ne connaît pas le paramètre obtient exactement le comportement actuel.

Critères d'acceptation :

- **CA-M1.1** `POST …/inspections` avec `{ type: 'ENTRY', template: 'FURNISHED' }`
  crée six pièces ; chaque pièce contient d'abord les éléments du modèle actuel
  (`kind: 'FIXTURE'`, `quantity: null`), puis ceux du tableau ci-dessus
  (`kind: 'FURNITURE'`, `quantity: 1`, `replacementValue: null`,
  `condition: null`). Tous les identifiants sont uniques.
- **CA-M1.2** Sans `template`, ou avec `STANDARD`, le résultat est identique à
  aujourd'hui, à ceci près que chaque élément porte `kind: 'FIXTURE'`,
  `quantity: null`, `replacementValue: null`.
- **CA-M1.3** `type: 'EXIT'` alors qu'une entrée existe : `template` est
  ignoré ; les pièces de l'entrée sont reprises avec `kind` et
  `replacementValue` conservés, `quantity`, `condition` et `comment` vidés.
- **CA-M1.4** `type: 'EXIT'` sans entrée : le modèle demandé s'applique, avec
  des quantités vides.
- **CA-M1.5** Dans le formulaire, « Nouvel élément » propose une case
  « Mobilier (avec quantité) » ; cochée, l'élément est créé avec
  `kind: 'FURNITURE'` et une quantité de 1 à l'entrée, vide à la sortie.
- **CA-M1.6** Un élément de mobilier affiche, sous le choix de l'état, un champ
  « Quantité » (entier, de 0 à 9 999, boutons + et − de 44 px) et un champ
  « Valeur de remplacement (FCFA, à l'unité) » facultatif, formaté avec
  espaces. Un élément de bâti n'affiche ni l'un ni l'autre.
- **CA-M1.7** La fenêtre « Commencer l'état des lieux » présélectionne le
  modèle d'après l'ameublement du bien ; pour une sortie avec entrée existante,
  le choix n'est pas proposé et l'aide actuelle (« Reprend les pièces de
  l'entrée pour la comparaison. ») reste affichée.

### M2 — Statut « Manquant »

**Exigence.** Un sixième état, « Manquant », est proposé pour tout élément,
après « HS ». Il signifie que l'objet n'est pas là. Il est permis à l'entrée
aussi (un objet prévu mais absent dès l'arrivée, ce qui protège le locataire).

Critères d'acceptation :

- **CA-M2.1** `condition: 'MISSING'` est accepté par `PUT …/inspections/:id`
  pour un élément de bâti comme de mobilier.
- **CA-M2.2** Un élément de mobilier enregistré avec `MISSING` a sa quantité
  ramenée à **0** par le serveur, quelle que soit la valeur envoyée. À l'écran,
  choisir « Manquant » met la quantité à 0 et la désactive ; choisir un autre
  état la réactive, vide.
- **CA-M2.3** Le sélecteur d'état affiche six boutons d'au moins 44 px de
  haut ; sur un écran de 360 px de large ils tiennent sur deux lignes au plus,
  sans défilement horizontal.
- **CA-M2.4** « Manquant » a sa propre couleur (violet `#722ed1`), distincte du
  rouge de « HS ».
- **CA-M2.5** Un « Manquant » n'est jamais compté comme « Dégradé » : les
  deux indicateurs sont distincts (voir M4).

### M3 — Finalisation exigeant que tous les éléments soient évalués

**Exigence.** Un état des lieux (entrée ou sortie, meublé ou non) ne se
finalise que si **chaque** élément est évalué : état renseigné ; pour un
élément de mobilier non manquant, quantité renseignée. La règle « au moins un
élément » est conservée pour le document vide.

Critères d'acceptation :

- **CA-M3.1** `POST …/finalize` sur un document dont un élément a
  `condition: null` répond **400**, message « Tous les éléments doivent être
  évalués avant de finaliser. », et `data.unevaluatedItems` liste chaque
  élément en cause `{ roomId, roomName, itemId, label, missing: 'CONDITION' | 'QUANTITY' }`.
- **CA-M3.2** Même réponse pour un élément de mobilier dont l'état est
  renseigné (autre que `MISSING`) mais la quantité `null`.
- **CA-M3.3** Un document sans aucun élément garde le refus actuel « Au moins
  un élément doit avoir un état renseigné avant de finaliser. »
- **CA-M3.4** Un document dont tous les éléments sont évalués et dont les
  signataires sont renseignés se finalise comme aujourd'hui.
- **CA-M3.5** À l'écran, l'en-tête de la carte « Pièces » affiche
  « {{evalues}} éléments évalués sur {{total}} » ; chaque pièce incomplète
  porte une étiquette « {{nombre}} à évaluer ».
- **CA-M3.6** Un clic sur « Finaliser » avec des éléments non évalués
  enregistre le brouillon, **n'appelle pas** la route de finalisation, affiche
  « {{nombre}} éléments ne sont pas encore évalués. » avec la liste (dix au
  plus, puis « et {{nombre}} autres »), ouvre les pièces concernées et entoure
  les éléments en orange. Si le serveur répond quand même 400 avec
  `data.unevaluatedItems`, l'écran fait la même chose.
- **CA-M3.7** Aucun bouton « tout marquer en bon état » : chaque élément est
  évalué par un geste explicite.

### M4 — Comparaison qui fait ressortir manquants, baisses de quantité, clés et compteurs

**Exigence.** La comparaison entrée/sortie distingue, pour chaque élément :
dégradé, manquant, baisse de quantité, absent de la sortie ; elle donne la
valeur de remplacement des manquants ; elle ajoute une synthèse des clés
(entrée, sortie, clés manquantes) et des compteurs (relevés d'entrée et de
sortie, différence quand les relevés sont des nombres).

Critères d'acceptation :

- **CA-M4.1** Entrée `GOOD` / sortie `MISSING` : `missing: true`,
  `degraded: false`, `missingQuantity` = quantité d'entrée (1 pour un élément
  de bâti).
- **CA-M4.2** Mobilier 6 à l'entrée, 4 à la sortie, état `GOOD` :
  `quantityDecrease: 2`, `missingQuantity: 2`, `missing: false`.
- **CA-M4.3** Entrée `MISSING` / sortie `MISSING` : ni manquant, ni baisse
  (l'objet manquait déjà à l'arrivée).
- **CA-M4.4** `missingValue` = valeur de remplacement × `missingQuantity` ;
  `null` si aucune valeur n'est connue. La valeur prise est celle de l'entrée,
  à défaut celle de la sortie.
- **CA-M4.5** Un élément de l'entrée absent du document de sortie (sortie
  existante) donne `absentFromExit: true` ; sans sortie, `absentFromExit` vaut
  toujours `false`.
- **CA-M4.6** Un élément déplacé d'une pièce à l'autre entre l'entrée et la
  sortie est toujours rapproché (correspondance par `itemId`, unique dans un
  document — `service.ts:478-485`).
- **CA-M4.7** `summary.keys` : 3 clés à l'entrée, 2 à la sortie →
  `{ entry: 3, exit: 2, missing: 1 }` ; 3 et 3 → `missing: 0` ; l'un des deux
  inconnu → `missing: null`.
- **CA-M4.8** `summary.meters.electricity` : « 12 345 » et « 12 980 » →
  `difference: 635` ; « 12 980 » puis « 12 345 » → `difference: -635` (l'écran
  affiche « Relevé de sortie inférieur à celui d'entrée », sans autre
  qualification) ; un relevé non numérique → `difference: null`.
- **CA-M4.9** La fenêtre de comparaison montre en tête : nombre de manquants,
  de baisses de quantité, de dégradés, valeur de remplacement totale des
  manquants, clés et compteurs ; puis le tableau avec les étiquettes
  « Manquant », « Baisse de quantité (−{{nombre}}) », « Dégradé », « Absent de
  la sortie », et un interrupteur « Afficher seulement les écarts ».
- **CA-M4.10** Les lignes existantes gardent leurs champs et leur sens
  (`roomId`, `roomName`, `itemId`, `label`, `entryCondition`,
  `exitCondition`, `degraded`) : seuls des champs s'ajoutent.
- **CA-M4.11** Pendant la saisie de la sortie, la carte « Compteurs et clés »
  rappelle sous chaque champ la valeur d'entrée (« Entrée : {{valeur}} »).
- **CA-M4.12** Aucun texte de la comparaison, du formulaire ni de la
  consultation ne contient « vol », « voleur », « fraude » ou « détournement »
  (test dédié, §10).

### M5 — Retenue pré-remplie par la valeur de remplacement

**Exigence.** Le bouton de proposition des retenues de la sortie (renommé
« Proposer depuis les dégradations et manquants ») crée, pour chaque élément
manquant ou en baisse de quantité, une ligne dont le montant est la valeur de
remplacement × la quantité manquante. L'agent garde la main : il modifie ou
supprime chaque ligne. Les dégradations gardent une ligne à 0 FCFA (aucune
valeur de réparation n'est connue). Rien n'est ajouté sans ce clic.

Critères d'acceptation :

- **CA-M5.1** « Téléviseur » manquant, 1 à l'entrée, valeur 150 000 → ligne
  « Entrée/Séjour — Téléviseur : 1 manquant », montant **150 000**,
  `proposedAmount: 150000`, `source: 'MISSING'`, `itemId` renseigné.
- **CA-M5.2** « Chaises » 6 → 4, valeur 15 000 → ligne « Entrée/Séjour —
  Chaises : 2 manquants sur 6 », montant **30 000**.
- **CA-M5.3** Manquant sans valeur de remplacement → montant 0,
  `proposedAmount: null`, et la ligne affiche « Valeur de remplacement non
  renseignée : montant à saisir ».
- **CA-M5.4** Dégradé → ligne « {{piece}} — {{element}} (dégradé) », montant
  0, `source: 'DEGRADED'` (comportement actuel, `source` en plus).
- **CA-M5.5** Clés : 3 à l'entrée, 2 à la sortie → ligne « Clés manquantes :
  1 », montant 0, `source: 'KEYS'`, sans `itemId`. Une seule ligne de clés au
  plus.
- **CA-M5.6** Un second clic n'ajoute pas de doublon (même `itemId`, ou ligne
  `KEYS` déjà présente), comme aujourd'hui (`InspectionForm.tsx:248`, `:256`).
- **CA-M5.7** Le montant reste modifiable ; quand il diffère de
  `proposedAmount`, la ligne affiche « Proposé : {{montant}} FCFA » en
  secondaire. Le total et le solde de tout compte prennent le montant saisi.
- **CA-M5.8** En confirmant la finalisation d'une sortie, si des éléments
  manquants ou en baisse n'ont aucune ligne de retenue, la fenêtre ajoute :
  « {{nombre}} éléments manquants n'ont pas de retenue. Vous pouvez finaliser
  quand même. » La finalisation n'est pas bloquée.
- **CA-M5.9** Rien ne change dans le solde de tout compte : il continue de lire
  `label` et `amount` (`lease-lifecycle/service.ts:718-722`) ; les champs
  `source` et `proposedAmount` y sont ignorés.

## 5. Données

### 5.1 JSON `rooms` — nouvelle forme, compatible

```ts
type Condition = "NEW" | "GOOD" | "FAIR" | "POOR" | "BROKEN" | "MISSING";
type ItemKind = "FIXTURE" | "FURNITURE";

interface InspectionItem {
  id: string;
  label: string;
  condition: Condition | null;
  comment: string | null;
  kind?: ItemKind; // absent = 'FIXTURE'
  quantity?: number | null; // FURNITURE seulement ; entier 0..9999
  replacementValue?: number | null; // FCFA, entier 0..100 000 000, à l'unité
}
```

Les trois champs ajoutés sont **facultatifs dans le type TypeScript**, pour
que les documents déjà enregistrés et les montages de test existants
(`__tests__/unit/lease-inspections.test.ts:79-81`, fixture web
`lease-inspections.test.tsx:41-65`) restent valides tels quels.

**Compatibilité ascendante (obligatoire).**

1. **Lecture** : `toRooms` (`service.ts:202-204`) devient `normalizeRooms` et
   complète chaque élément : `kind ?? 'FIXTURE'`, `quantity ?? null`,
   `replacementValue ?? null`. Le DTO porte donc toujours les trois champs. Rien
   n'est réécrit en base à la lecture : un document ancien n'est modifié qu'au
   prochain `PUT`.
2. **Écriture** : le schéma zod accepte un élément sans ces champs et applique
   les mêmes valeurs par défaut. Un client web ancien (onglet ouvert pendant le
   déploiement) qui renvoie des éléments sans `kind` ni `quantity` les ferait
   repasser en bâti : risque accepté et borné à la fenêtre de déploiement (§13).
3. **Finalisés** : un état des lieux déjà finalisé n'est jamais revalidé ; il
   s'affiche avec des éléments de bâti et la comparaison fonctionne.
4. **Brouillons existants** : ils restent modifiables ; la règle M3 s'applique
   à leur finalisation (effet voulu).
5. **Brouillon local** (`local-draft-storage.ts`) : la forme de haut niveau ne
   change pas ; les éléments y transitent avec ou sans les nouveaux champs. Pas
   de changement de clé de stockage.

### 5.2 JSON `deductions` — deux champs facultatifs

```ts
interface Deduction {
  id: string;
  label: string;
  amount: number;
  roomId: string | null;
  itemId: string | null;
  source?: "MANUAL" | "DEGRADED" | "MISSING" | "KEYS"; // absent = 'MANUAL'
  proposedAmount?: number | null; // montant proposé au moment du clic
}
```

Même règle de lecture (`toDeductions`, `service.ts:210-212` : compléter
`source ?? 'MANUAL'`, `proposedAmount ?? null`).

### 5.3 Schéma Prisma

Aucune migration. Seul le commentaire du modèle (`schema.prisma:7919-7924`)
décrit l'ancienne forme : le mettre à jour (« `condition` parmi NEW, GOOD,
FAIR, POOR, BROKEN, MISSING ; `kind`, `quantity`, `replacementValue`
facultatifs ; `deductions` : `source`, `proposedAmount` facultatifs »).
`schema.prisma` est aussi modifié par le stock : cette retouche de commentaire
revient à l'agent des fondations, qui tient seul le schéma pour tout le lot
(plan.md, étape 0), jamais en parallèle. La référence de la forme reste l'en-tête de
`lib/lease-inspections/inventory.ts` (§6).

## 6. Règles serveur

Nouveau module pur `packages/api/src/lib/lease-inspections/inventory.ts`
(testable sans base, comme `defaultRooms` et `compareInspections`
aujourd'hui) ; `service.ts` l'importe et réexporte ce qu'il faut.

- **R1 — Modèles.** `defaultRooms()` (inchangé dans son contenu, éléments en
  `kind: 'FIXTURE'`) et `furnishedRooms({ withQuantities: boolean })` : modèle
  M1, quantité 1 si `withQuantities`, `null` sinon. `blankRoomsFrom`
  (`service.ts:124-130`) conserve `kind` et `replacementValue`, vide
  `quantity`, `condition`, `comment`.
- **R2 — Validation d'un élément** (dans `itemSchema`, `service.ts:383-388`) :
  `condition` étendu à `MISSING` ; `kind` `enum(['FIXTURE','FURNITURE'])`
  facultatif → `'FIXTURE'` ; `quantity` entier 0..9 999, `null`/absent →
  `null` ; `replacementValue` entier 0..100 000 000, `null`/absent → `null`.
  Refus (zod, 400 « Les données fournies sont invalides. ») si un élément
  `FIXTURE` porte une `quantity` non nulle : message d'erreur de champ
  « Seul un élément de mobilier porte une quantité. »
- **R3 — Normalisation** après validation : `FURNITURE` + `MISSING` →
  `quantity = 0`.
- **R4 — Sortie : pas de retrait d'un élément de l'entrée.** Dans
  `updateInspection`, pour un document `EXIT`, si l'entrée du bail est
  **finalisée** : tout `itemId` présent à la fois dans l'entrée et dans la
  sortie **enregistrée** doit rester présent dans le corps reçu. Sinon
  **400** « Un élément repris de l'état des lieux d'entrée ne peut pas
  être retiré de la sortie : indiquez « Manquant ». », `data.removedItems`
  `[{ itemId, label }]` (lever une `AppError` de `middleware/error-middleware`
  avec `data`, pas `badRequest` de `lib/errors.ts`, dont le détail n'est pas
  renvoyé). **Libellé et valeur figés** (révision 2) : pour un élément repris
  d'une entrée finalisée, le serveur **remplace** `label`, `kind` et
  `replacementValue` reçus par ceux de l'entrée (sans erreur : un client ancien
  ou une saisie maladroite ne bloque pas l'enregistrement). Sans cela, renommer
  « Téléviseur » en « Carton vide » en sortie contournerait l'esprit de R4 et
  fausserait la comparaison et la retenue proposée. L'écran les affiche déjà en
  lecture seule pour ces éléments (§8, `RoomsAccordion.tsx`). La comparaison avec la sortie **enregistrée** (et non avec toute
  l'entrée) laisse passer les brouillons anciens où un élément avait déjà été
  retiré ; ils ressortent en « Absent de la sortie ». Entrée en brouillon ou
  inexistante : pas de contrainte (elle ne fait pas foi).
- **R5 — Finalisation.** `findUnevaluatedItems(rooms)` renvoie les éléments
  `condition === null`, ou `kind === 'FURNITURE' && condition !== 'MISSING' &&
quantity === null`. Ordre des contrôles dans `finalizeInspection`
  (`service.ts:540-550`) : signataire agence ; signataire locataire ; document
  sans élément (message actuel conservé) ; éléments non évalués (CA-M3.1).
- **R6 — Comparaison.** `compareInspections` (`service.ts:142-195`) garde sa
  signature et son ordre (pièces de l'entrée, puis ce qui n'existe qu'en
  sortie) mais rapproche par `itemId`. Pour chaque ligne :

  ```text
  kind            = entrée.kind ?? sortie.kind ?? 'FIXTURE'
  entryQuantity   = kind FURNITURE ? entrée.quantity ?? null : null
  exitQuantity    = kind FURNITURE et élément en sortie ?
                      (sortie.condition == MISSING ? 0 : sortie.quantity ?? null) : null
  missing         = exitCondition == MISSING et entryCondition != MISSING
  quantityDecrease= !missing et entryQuantity, exitQuantity non nuls ?
                      max(0, entryQuantity − exitQuantity) : 0
  missingQuantity = missing ? (entryQuantity ?? 1) : quantityDecrease
  degraded        = les deux états non nuls, aucun MISSING, rang(sortie) > rang(entrée)
  absentFromExit  = une sortie existe et l'élément d'entrée n'y figure pas
  replacementValue= entrée.replacementValue ?? sortie.replacementValue ?? null
  missingValue    = replacementValue non nul et missingQuantity > 0 ?
                      replacementValue × missingQuantity : null
  ```

  `CONDITION_RANK` (`service.ts:132`) reçoit `MISSING: 5`, utilisé seulement
  pour l'ordre d'affichage.

- **R7 — Synthèse.** `compareSummary(entry, exit, rows)` :

  ```ts
  summary: {
    keys: {
      entry: number | null;
      exit: number | null;
      missing: number | null;
    }
    meters: Record<
      "electricity" | "water" | "gas",
      { entry: string | null; exit: string | null; difference: number | null }
    >;
    missingCount: number; // lignes missing
    quantityDecreaseCount: number; // lignes quantityDecrease > 0
    degradedCount: number;
    absentFromExitCount: number;
    missingValueTotal: number; // somme des missingValue non nulles
    missingWithoutValueCount: number; // lignes manquantes ou en baisse sans valeur
  }
  ```

  `keys.missing = max(0, entry − exit)` si les deux sont connus, sinon `null`.
  Un relevé de compteur est lu comme nombre après retrait des espaces
  (y compris insécables) et remplacement de la virgule par un point ;
  `difference = sortie − entrée` si les deux se lisent, sinon `null`.

## 7. Contrat d'API

Préfixe commun : `/api/tenants/:tenantId/rental/leases/:leaseId/inspections`
(`lease-inspection-routes.ts:51`). Gardes inchangées :
`authenticate`, `requireTenantAccess`, `requirePermission`. **Aucune route
ajoutée ni retirée** : `routes-inventory.test.ts` n'est pas touché.

| Méthode        | Chemin          | Permission           | Changement                                                                                                                                                                                                                                            |
| -------------- | --------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST           | `/`             | `RENTAL_LEASES_EDIT` | Corps : `{ type, inspectionDate, template?: 'STANDARD' \| 'FURNISHED' }`. `template` absent = `STANDARD`. Ignoré pour `EXIT` si une entrée existe. Réponse 201 inchangée dans sa forme ; les éléments portent `kind`, `quantity`, `replacementValue`. |
| GET            | `/`             | `RENTAL_LEASES_VIEW` | Réponse : éléments normalisés (§5.1), `condition` peut valoir `MISSING`, retenues avec `source` et `proposedAmount`.                                                                                                                                  |
| PUT            | `/:id`          | `RENTAL_LEASES_EDIT` | Corps : éléments et retenues étendus (§5). Nouvelles erreurs : 400 zod (R2) ; 400 `data.removedItems` (R4). Réponse : DTO normalisé.                                                                                                                  |
| POST           | `/:id/finalize` | `RENTAL_LEASES_EDIT` | Nouvelle erreur : 400 « Tous les éléments doivent être évalués avant de finaliser. », `data.unevaluatedItems` (CA-M3.1).                                                                                                                              |
| GET            | `/compare`      | `RENTAL_LEASES_VIEW` | Réponse : `{ entry, exit, rows, summary }` ; chaque ligne ajoute `kind`, `entryQuantity`, `exitQuantity`, `missing`, `quantityDecrease`, `missingQuantity`, `absentFromExit`, `replacementValue`, `missingValue` (R6) ; `summary` (R7).               |
| DELETE, photos | inchangés       | inchangées           | —                                                                                                                                                                                                                                                     |

Hors du préfixe : `GET /api/tenants/:tenantId/rental/leases/:leaseId`
(`getLeaseById`, `rental-lease-service.ts:676-690`) ajoute
`furnishingStatus: true` au `select` du bien, pour présélectionner le modèle
(M1). Types : `LeaseDetail.property` (`types/rental-types.ts:60-64`) et
`Lease.property` côté web (`services/rental-service.ts:115-123`) reçoivent
`furnishingStatus?: 'FURNISHED' | 'UNFURNISHED' | 'PARTIALLY_FURNISHED' | null`.
`GET …/final-settlement` : inchangé.

## 8. Écrans

Tous sous `apps/web/src/components/rental/inspections/` sauf mention.

| Fichier                                 | Changement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/lease-inspections-service.ts` | Types du §5 et du §7 (`InspectionCondition` + `MISSING`, `InspectionItemKind`, champs facultatifs d'élément et de retenue, `InspectionCompareRow` étendu, `InspectionCompareSummary`, `CreateInspectionRequest.template`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `inspection-constants.ts`               | `CONDITION_ORDER` + `MISSING` ; `conditionColor('MISSING') = '#722ed1'` ; `conditionLabel('MISSING') = t('Manquant')` ; `isDegraded` renvoie faux si l'un des états est `MISSING` ; nouvelles fonctions pures `isMissing(entry, exit)`, `isItemEvaluated(item)`, `countUnevaluated(rooms)`, `itemKind(item)` (absent → `FIXTURE`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| nouveau `deduction-proposals.ts`        | Fonction pure `proposeDeductions({ rooms, entryItemsById, entryKeysCount, exitKeysCount, existing })` → lignes à ajouter (M5), libellés via `t()` : « {{piece}} — {{element}} : {{quantite}} manquant(s) », « {{piece}} — {{element}} : {{manquants}} manquant(s) sur {{total}} », « {{piece}} — {{element}} (dégradé) » (clé existante), « Clés manquantes : {{nombre}} ». Prévoir les formes du pluriel du catalogue (`_one`/`_other`) si le projet les utilise, sinon le « (s) ».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ConditionPicker.tsx`                   | Six boutons ; disposition en grille `repeat(auto-fit, minmax(64px, 1fr))` au lieu de `flex: '1 1 18%'` (`:31`), hauteur 44 px conservée.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `RoomsAccordion.tsx`                    | Pour un élément `FURNITURE` : champ Quantité (`InputNumber`, `min 0`, `max 9999`, `precision 0`, boutons de 44 px, désactivé et à 0 si `MISSING`) ; champ Valeur de remplacement (formaté comme `DeductionsSection.tsx:64-77`), en lecture seule en sortie pour un élément issu de l'entrée ; en sortie, rappel « Entrée : {{etat}} · {{quantite}} » et bouton « Comme à l'entrée ({{quantite}}) » qui remplit seulement la quantité. Étiquettes « Manquant » et « Baisse de quantité (−{{nombre}}) » à côté de « Dégradé » (`:187-196`). Case « Mobilier (avec quantité) » près de « Nouvel élément » (`:223-235`). Bouton de suppression masqué pour un élément issu de l'entrée en sortie (R4), et suppression de pièce désactivée si elle en contient (infobulle « Indiquez « Manquant » plutôt que de retirer un élément de l'entrée. »). Nouvelles props : `isExit`, `highlightUnevaluated`. Étiquette d'en-tête « {{nombre}} à évaluer ». En lecture seule : « Quantité : {{quantite}} », « Valeur de remplacement : {{montant}} FCFA ». |
| `InspectionForm.tsx`                    | Compteur « {{evalues}} éléments évalués sur {{total}} » (CA-M3.5) ; pré-contrôle M3 avant finalisation (CA-M3.6), lecture de `error.response.data.data.unevaluatedItems` et `removedItems` ; `handleProposeFromDamages` (`:246-273`) remplacé par l'appel à `proposeDeductions` ; message vide « Aucune dégradation ni aucun manquant détecté pour le moment. » ; rappel des valeurs d'entrée sous les compteurs et les clés en sortie (CA-M4.11) ; paragraphe de la confirmation (CA-M5.8). La case mobilier est transmise à `RoomsAccordion`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `DeductionsSection.tsx`                 | Bouton « Proposer depuis les dégradations et manquants » (`:98-101`) ; sous un montant : « Proposé : {{montant}} FCFA » si différent de `proposedAmount`, ou « Valeur de remplacement non renseignée : montant à saisir » si `source === 'MISSING'` et `proposedAmount === null`. Une ligne ajoutée à la main porte `source: 'MANUAL'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `InspectionCompareModal.tsx`            | Synthèse en tête (CA-M4.9) : quatre chiffres (`StatCard` de `components/primitives` si sa forme convient, sinon `Descriptions`), clés, tableau des compteurs ; colonnes « Quantité (entrée → sortie) » (seulement si une ligne est du mobilier) et « Valeur des manquants » (`MoneyValue`) ; étiquettes M4 ; interrupteur « Afficher seulement les écarts » ; fond de ligne `#fff1f0` (dégradé) ou `#f9f0ff` (manquant, baisse, absent). Largeur 900, défilement horizontal du tableau seulement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `InspectionViewer.tsx`                  | Lecture seule : quantités, valeurs, « Manquant » (via `RoomsAccordion`) ; pour une entrée, ligne « Valeur de remplacement totale de l'inventaire : {{montant}} FCFA » si au moins une valeur ; pour une sortie, rappel des clés et compteurs d'entrée. Ce sont les pages imprimées (`window.print()`, `:60-65`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `StartInspectionModal.tsx`              | Groupe de boutons radio « Modèle de départ » : « Bâti seulement » / « Bâti, mobilier et équipements » ; props `defaultTemplate`, `showTemplateChoice` ; `onConfirm(inspectionDate, template)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `LeaseInspectionsPanel.tsx`             | Prop `propertyFurnishingStatus` ; calcule `defaultTemplate` ; masque le choix pour une sortie quand l'entrée existe ; transmet `template` à `createInspection` (`:77`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pages/rental/LeaseDetailPage.tsx`      | Passe `lease.property?.furnishingStatus` au panneau (`:531`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Contraintes transverses : marges en propriétés logiques (`marginInlineStart`,
comme `RoomsAccordion.tsx:191`) ; tout libellé par `t()` ; montants FCFA en
entiers ; aucune couleur seule pour porter un sens (chaque état a son texte).

## 9. Impression, PDF, portails, export, solde

- **Impression** : seule sortie papier existante, couverte par
  `InspectionViewer` (§8).
- **PDF** : il n'existe pas de PDF d'état des lieux (§2). Hors périmètre (D3).
- **Portails** : aucun portail n'affiche l'état des lieux (§2). Hors périmètre.
- **Export d'agence** : les colonnes JSON partent telles quelles ; aucune
  modification de `tenant-data-export/*`.
- **Solde de tout compte** : aucune modification (CA-M5.9) ; l'avertissement
  sur une sortie non finalisée (`FinalSettlementCard.tsx:77-83`) reste valable.

## 10. Tests

API — unitaires purs, `packages/api/__tests__/unit/lease-inspections.test.ts`
(étendu) ou nouveau `lease-inspections-inventory.test.ts` :

- `defaultRooms` : contenu inchangé, chaque élément `kind: 'FIXTURE'`,
  `quantity: null` (les tests `:12-80` passent sans retouche).
- `furnishedRooms` : six pièces, bâti puis mobilier dans l'ordre M1,
  quantité 1 / `null` selon l'option, identifiants uniques et renouvelés.
- `blankRoomsFrom` (à exporter) : conserve `kind` et `replacementValue`, vide le
  reste.
- `findUnevaluatedItems` : état nul ; mobilier sans quantité ; mobilier
  `MISSING` sans quantité accepté ; élément ancien sans `kind` traité en bâti.
- `compareInspections` : CA-M4.1 à M4.6 ; non-régression de `:84-185` — les
  `toEqual` de `:103-122` et `:175-185` portent sur la forme exacte des lignes
  et **doivent être mis à jour** avec les nouveaux champs (changement voulu,
  sens des anciens champs identique).
- `compareSummary` : CA-M4.7, CA-M4.8 (espaces insécables, virgule, texte).

API — routes, `packages/api/__tests__/api/lease-inspections.test.ts`
(Prisma simulé, `:47-112`) :

- création `template: 'FURNISHED'` ; création sans `template` (forme actuelle
  - champs normalisés) ; sortie reprenant `kind` et `replacementValue`.
- mise à jour acceptant un élément **sans** les nouveaux champs (document
  ancien) ; `MISSING` ramène la quantité à 0 ; quantité sur un élément de bâti
  refusée (400) ; retrait d'un élément de l'entrée finalisée refusé (400,
  `data.removedItems`) ; retrait toléré si l'entrée est en brouillon.
- finalisation : refus avec `data.unevaluatedItems` ; le test `:267-284`
  (« au moins un état saisi ») devient « finalise quand tous les éléments sont
  évalués » (il ne renseigne qu'un élément sur trente-six aujourd'hui).
- comparaison : `summary.keys`, lignes `missing` et `quantityDecrease`.
- Le simulacre de `rentalLease.findFirst` (`:49-54`) ne change pas : la
  création ne lit pas l'ameublement du bien (le choix vient du client).

Web — `apps/web/src/__tests__/rental/lease-inspections.test.tsx` (étendu) :

- « Manquant » sélectionnable, quantité désactivée à 0.
- élément de mobilier : quantité et valeur saisies partent dans le corps du
  `PUT`.
- fixture ancienne (`makeInspection`, `:41-65`) : s'affiche et s'enregistre
  sans champ de quantité.
- finalisation avec éléments non évalués : `finalizeInspection` n'est pas
  appelé, le message et la liste s'affichent.
- proposition des retenues : montants CA-M5.1, M5.2, M5.3, ligne de clés,
  pas de doublon ; le test `:185-196` reste vert (le libellé « dégradé » ne
  change pas, la regex du bouton `/Proposer depuis les dégradations/` couvre
  le nouveau libellé).
- en sortie, pas de bouton de suppression sur un élément issu de l'entrée.
- fenêtre « Commencer » : modèle présélectionné selon l'ameublement, `template`
  transmis.
- fenêtre de comparaison : synthèse, étiquettes, filtre des écarts ; et
  **vocabulaire** : le texte rendu ne correspond pas à
  `/\b(vols?|voleurs?|fraudes?|detournements?)\b/`, après passage du texte en
  minuscules sans accents comme le fait `normaliser` (même esprit que
  `__tests__/finance/stock-chantier.test.tsx:472-492`). Ce test-là interdit
  aussi « manquant » sur l'écran de rapprochement du stock, où le mot
  qualifierait un écart de calcul ; il reste intact. Ici « Manquant » est un
  constat sur un objet présent ou non dans le logement, terme retenu par D2.
- `deduction-proposals.ts` et `inspection-constants.ts` : tests unitaires purs
  (nouveau fichier `__tests__/rental/inspection-inventory.test.ts`).

À lancer : `npm test -- lease-inspections` (API), `npm run test:web --
lease-inspections inspection-inventory`, `npm run typecheck`,
`npm run check:architecture`, les deux complétudes de catalogues
(`i18n-catalogs-completeness.test.ts`, `catalogs-completeness.test.ts`).

## 11. Traductions

Le texte français est la clé. Après le code : `npm run i18n:extract -w
@immotopia/web` et `npm run i18n:extract -w @immotopia/api`, puis traductions
en/ar (`apps/web/src/i18n/locales/{en,ar}/rental.json`,
`packages/api/src/i18n/locales/{en,ar}.json`).

Clés web nouvelles : « Manquant », « Baisse de quantité (−{{nombre}}) »,
« Absent de la sortie », « Quantité », « Quantité : {{quantite}} »,
« Valeur de remplacement (FCFA, à l'unité) », « Valeur de remplacement :
{{montant}} FCFA », « Mobilier (avec quantité) », « Comme à l'entrée
({{quantite}}) », « Entrée : {{etat}} · {{quantite}} », « Entrée :
{{valeur}} », « {{evalues}} éléments évalués sur {{total}} », « {{nombre}} à
évaluer », « {{nombre}} éléments ne sont pas encore évalués. », « et
{{nombre}} autres », « Indiquez « Manquant » plutôt que de retirer un élément
de l'entrée. », « Modèle de départ », « Bâti seulement », « Bâti, mobilier et
équipements », « {{piece}} — {{element}} : {{quantite}} manquant(s) »,
« {{piece}} — {{element}} : {{manquants}} manquant(s) sur {{total}} »,
« Clés manquantes : {{nombre}} », « Proposé : {{montant}} FCFA », « Valeur
de remplacement non renseignée : montant à saisir », « {{nombre}} éléments
manquants n'ont pas de retenue. Vous pouvez finaliser quand même. »,
« Manquants », « Baisses de quantité », « Dégradés », « Valeur de
remplacement des manquants », « Clés », « Clés : {{entree}} à l'entrée,
{{sortie}} à la sortie », « Compteur », « Relevé d'entrée », « Relevé de
sortie », « Différence », « Relevé de sortie inférieur à celui d'entrée »,
« Quantité (entrée → sortie) », « Valeur des manquants », « Afficher
seulement les écarts », « Valeur de remplacement totale de l'inventaire :
{{montant}} FCFA ».

Clés web **modifiées** (traduction orpheline à reporter à la main) :
« Proposer depuis les dégradations » → « Proposer depuis les dégradations et
manquants » ; « Aucune dégradation détectée pour le moment. » → « Aucune
dégradation ni aucun manquant détecté pour le moment. »

Clés API nouvelles : « Tous les éléments doivent être évalués avant de
finaliser. », « Un élément repris de l'état des lieux d'entrée ne peut pas
être retiré de la sortie : indiquez « Manquant ». », « Seul un élément de
mobilier porte une quantité. ». Message conservé : « Au moins un élément doit
avoir un état renseigné avant de finaliser. »

Les libellés des modèles de pièces (M1) sont des **données** stockées en
français, comme le modèle actuel (`service.ts:98-121`) : non traduits, ce que
l'agent peut renommer.

## 12. Wiki des fonctionnalités

Domaine `Gestion locative`, module `RENTAL`, fonctionnalité « Baux — États des
lieux ». Modifier dans le classeur (puis `npm run wiki:export`) les lignes
miroir `sous-fonctionnalites.md` :

| Ligne | Sous-fonctionnalité                            | Colonnes à modifier                                                                                                                                                                                                                                                                                             |
| ----- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 234   | Réaliser un état des lieux (entrée ou sortie)  | Entrée : « `type` (ENTRY/EXIT), `inspectionDate`, `template?` (STANDARD/FURNISHED, défaut STANDARD) ». Sortie : « État des lieux créé (bâti seul, ou bâti + mobilier et équipements avec quantités ; ou pièces de l'entrée reprises, états et quantités vidés, valeurs de remplacement conservées) ».           |
| 235   | Consulter / lister les états des lieux         | Sortie : « … pièces, éléments (état, dont « manquant » ; quantité et valeur de remplacement pour le mobilier), compteurs, retenues, photos ».                                                                                                                                                                   |
| 236   | Modifier un état des lieux (brouillon)         | Entrée : « … `rooms[]` (par élément : `condition` dont MISSING, `kind` FIXTURE/FURNITURE, `quantity?`, `replacementValue?`) … `deductions[]` (`source?`, `proposedAmount?`) ». Dépend de : ajouter « ; en sortie, un élément repris d'une entrée finalisée ne peut pas être retiré (le marquer « Manquant ») ». |
| 237   | Finaliser un état des lieux                    | Dépend de : remplacer « au moins un élément avec un état renseigné » par « tous les éléments évalués (état renseigné ; quantité pour le mobilier, sauf manquant) ».                                                                                                                                             |
| 239   | Comparer les états des lieux (entrée / sortie) | Objectif : « Voir, élément par élément, dégradations, manquants et baisses de quantité, ainsi que clés et compteurs ». Sortie : « Lignes (états et quantités d'entrée et de sortie, `degraded`, `missing`, `quantityDecrease`, `absentFromExit`, valeur des manquants) et synthèse (clés, compteurs, totaux) ». |

Ligne à **ajouter** : « Proposer les retenues depuis les dégradations et
manquants » — Objectif « Préremplir les retenues sur le dépôt avec la valeur
de remplacement des éléments manquants » ; Entrée « Clic sur la sortie en
brouillon » ; Sortie « Lignes de retenue proposées, modifiables (dégradé à
0 FCFA, manquant = valeur × quantité, clés à 0 FCFA) » ; Dépend de « Modifier
un état des lieux (brouillon) » ; Rôles « Collaborateur (accès agence) » ;
Portail « Agence (collaborateur) » ; Route « — (calcul à l'écran, enregistré
par PUT /tenants/:tenantId/rental/leases/:leaseId/inspections/:id) » ;
Permission `RENTAL_LEASES_EDIT` ; Statut « Disponible » ; Menu « Baux ›
Détail du bail › États des lieux ».

Ligne 233 (solde de tout compte) : inchangée.

## 13. Écarts justifiés, hors périmètre, risques

**Écarts par rapport à la demande, justifiés.**

- _Modèle non configurable par agence._ Le modèle est fixe, dans le code,
  comme l'actuel. Aucune demande client documentée (dossier d'enquête) ; un
  modèle par agence demanderait une table, des routes et un écran de réglage.
  L'agent ajoute, renomme et supprime librement les éléments.
- _Pas de conversion d'un brouillon existant au modèle mobilier._ L'agent peut
  ajouter des éléments de mobilier un par un, ou supprimer le brouillon et le
  recréer. Éviter une route de plus pour un cas transitoire.
- _Comparaison des compteurs sans jugement._ Les relevés sont du texte libre
  (`schema.prisma:7933`) : la différence n'est calculée que s'ils se lisent
  comme des nombres, et un relevé de sortie plus bas est signalé comme tel,
  sans plus.
- _R4 limité à une entrée finalisée._ Une entrée en brouillon ne fait pas foi
  entre les parties.

**Hors périmètre** (D3) : PDF de l'état des lieux ; publication aux portails
locataire et propriétaire ; contre-signature ou contestation par le
locataire ; registre des clés (porteur, remise, restitution) ; report de
l'inventaire d'un bail au suivant ; contrôles entre deux séjours (l'unicité
`(leaseId, type)`, `schema.prisma:7951`, l'interdit) ; courte durée ;
journal d'audit des états des lieux (aucun aujourd'hui, à traiter avec la
spec 023 s'il est demandé) ; retenue ou confiscation de dépôt automatique.

**Risques.**

- _Brouillons anciens bloqués à la finalisation_ par M3 : effet voulu ; le
  message liste les éléments à évaluer. À annoncer aux agences.
- _Client web ancien pendant le déploiement_ (§5.1, point 2) : il peut
  renvoyer des éléments sans quantité. Fenêtre courte ; le rechargement de la
  page suffit.
- _Fichiers partagés avec le volet stock_ : `schema.prisma` (commentaire
  seulement, §5.3), `packages/api/src/i18n/locales/{en,ar}.json`, le classeur
  du wiki et son miroir. Les écrire **en fin de lot, par un seul agent**,
  jamais en parallèle d'un agent du stock.
- _Libellés des retenues générés dans la langue de l'agent_, puis stockés
  (comportement actuel, `InspectionForm.tsx:260`).

## 14. Découpage proposé (territoires de fichiers)

| Tâche | Territoire                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Dépend de  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| T1    | API : `lib/lease-inspections/inventory.ts` (nouveau), `lib/lease-inspections/service.ts`, `__tests__/unit/lease-inspections*.test.ts`, `__tests__/api/lease-inspections.test.ts`                                                                                                                                                                                                                                                                                     | —          |
| T2    | API : `services/rental-lease-service.ts` (`select` du bien), `types/rental-types.ts`                                                                                                                                                                                                                                                                                                                                                                                 | —          |
| T3    | Web : `services/lease-inspections-service.ts`, `inspection-constants.ts`, `deduction-proposals.ts` (nouveau), `ConditionPicker.tsx`, `RoomsAccordion.tsx`, `DeductionsSection.tsx`, `InspectionForm.tsx`, `InspectionViewer.tsx`                                                                                                                                                                                                                                     | contrat §7 |
| T4    | Web : `InspectionCompareModal.tsx`, `StartInspectionModal.tsx`, `LeaseInspectionsPanel.tsx`, `pages/rental/LeaseDetailPage.tsx`, `services/rental-service.ts`                                                                                                                                                                                                                                                                                                        | contrat §7 |
| T5    | Web : `__tests__/rental/lease-inspections.test.tsx`, `__tests__/rental/inspection-inventory.test.ts` (nouveau)                                                                                                                                                                                                                                                                                                                                                       | T3, T4     |
| T6    | **Supprimée en révision 2** : les fichiers partagés avec le volet stock (catalogues `packages/api/src/i18n/locales/{en,ar}.json`, `apps/web/src/i18n/locales/{en,ar}/rental.json`, commentaire de `schema.prisma`, classeur du wiki) reviennent à des agents **communs aux deux volets** : le commentaire du modèle à l'agent des fondations, les catalogues et le wiki à l'agent d'intégration finale (plan.md). Aucun agent du volet meublés n'écrit ces fichiers. | —          |
