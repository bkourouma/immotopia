# Feature Specification: Hypothèses de projection serveur et ratios bancaires

**Feature Branch**: `feat/patrimoine-projection`  
**Created**: 2026-10-01  
**Status**: Implemented (lot A1 de la feuille de route patrimoine, capacités 3 et 8)  
**Input**: [PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md](../../docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md), lot A1.
Complète la spec [015-patrimoine-module](../015-patrimoine-module/spec.md) (FR-008, FR-009).

## Contexte

Aujourd'hui, les hypothèses du simulateur de rendement (horizon, croissance de la valeur, des loyers
et des charges, vacance) ne vivent que dans le `localStorage` du navigateur, par agence et par bien :
elles ne suivent pas l'utilisateur d'un appareil à l'autre et ne sont pas partagées entre collaborateurs.
Par ailleurs, l'application calcule les rendements brut, net et net-net, mais aucun des ratios qu'un
banquier demande pour instruire un financement : couverture de la dette (DSCR), taux d'endettement sur
la valeur (LTV), rentabilité des fonds propres (cash-on-cash) et taux de rentabilité interne (TRI).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Retrouver mes hypothèses sur n'importe quel appareil (Priority: P1)

Un gestionnaire règle, pour un bien, l'horizon et les croissances de la projection. Il rouvre la fiche
depuis un autre poste, ou un collègue l'ouvre, et retrouve les mêmes hypothèses sans les ressaisir.

**Why this priority**: sans cela, deux collaborateurs voient deux projections différentes pour le même bien,
et chaque changement d'appareil perd le travail de réglage.

**Independent Test**: enregistrer des hypothèses sur un bien via l'API puis les relire avec un autre
utilisateur de la même agence ; vérifier qu'un utilisateur d'une autre agence ne les voit pas.

**Acceptance Scenarios**:

1. **Given** un bien sans hypothèses enregistrées, **When** le gestionnaire ouvre l'onglet Patrimoine,
   **Then** le simulateur affiche les valeurs par défaut (10 ans, +3 % valeur, +2 % loyers, +2,5 % charges,
   5 % vacance) et l'écran indique que les hypothèses sont synchronisées avec le serveur.
2. **Given** un gestionnaire qui modifie les hypothèses puis clique sur « Recalculer », **When** un autre
   collaborateur de l'agence ouvre le même bien, **Then** il voit ces hypothèses et la projection qui en découle.
3. **Given** des hypothèses enregistrées et une requête de rendement qui fournit un paramètre explicite
   (ex. `years=5`), **When** le serveur calcule, **Then** le paramètre de la requête l'emporte champ par champ,
   les autres champs venant des hypothèses enregistrées, puis des défauts.
4. **Given** un utilisateur qui n'a que le droit de consulter les biens, **When** il tente d'enregistrer
   des hypothèses, **Then** le serveur refuse (403) et l'écran garde le calcul à l'écran en signalant
   « non synchronisé » sans erreur bloquante.

---

### User Story 2 - Ne pas perdre les hypothèses déjà saisies sur l'appareil (Priority: P1)

Un gestionnaire a déjà réglé des hypothèses qui dorment dans le `localStorage` de son navigateur
(clé `patrimoine:performance:assumptions:{tenant}:{property}`). Elles sont reprises sur le serveur une
seule fois, automatiquement.

**Why this priority**: sinon la livraison efface silencieusement du travail de paramétrage.

**Independent Test**: simuler un `localStorage` valide et un serveur sans ligne ; vérifier un seul `PUT`,
puis qu'un second chargement n'en émet plus.

**Acceptance Scenarios**:

1. **Given** des hypothèses valides en local et aucune ligne serveur pour ce bien, **When** l'écran se charge,
   **Then** elles sont envoyées au serveur une fois (migration), et l'écran les affiche comme synchronisées.
2. **Given** des hypothèses déjà enregistrées sur le serveur, **When** l'écran se charge avec une valeur
   locale différente, **Then** le serveur fait foi et la valeur locale n'écrase jamais le serveur.
3. **Given** une valeur locale hors bornes ou illisible, **When** l'écran se charge, **Then** elle est ignorée
   (aucun envoi, aucune erreur).
4. **Given** un serveur injoignable ou un droit d'édition absent, **When** l'écran se charge, **Then** la valeur
   locale sert de repli, l'écran indique « non synchronisé » et la migration est retentée au chargement suivant.

---

### User Story 3 - Présenter les ratios attendus par une banque (Priority: P1)

Un gestionnaire prépare un dossier de financement. Sur l'onglet Patrimoine du bien, il lit le DSCR, le LTV,
le cash-on-cash et le TRI, chacun avec sa définition.

**Why this priority**: ce sont les chiffres exigés par les établissements de crédit ; leur absence oblige
à les recalculer à la main dans un tableur.

**Independent Test**: sur un bien chiffré à la main (loyer, charges, prêt, valeur, coût de revient connus),
vérifier que les quatre ratios de `GET /yield` correspondent au calcul manuel.

**Acceptance Scenarios**:

1. **Given** un bien avec un bail actif, des charges, un prêt actif, une valeur estimée et un prix d'acquisition,
   **When** le gestionnaire ouvre l'onglet Patrimoine, **Then** il voit DSCR, LTV, cash-on-cash et TRI.
2. **Given** un bien sans aucun prêt actif, **When** les ratios sont calculés, **Then** DSCR et LTV sont
   indéterminés (« — » avec la raison « Aucun emprunt actif ») et le cash-on-cash est calculé sur le coût
   de revient entier.
3. **Given** un bien sans prix d'acquisition renseigné, **When** les ratios sont calculés, **Then** le cash-on-cash
   et le TRI sont indéterminés avec la raison « Renseignez le prix d'acquisition dans une valorisation »,
   jamais affichés à 0.
4. **Given** un bien entièrement financé par ses prêts actifs, **When** le cash-on-cash est calculé, **Then**
   il est indéterminé (fonds propres nuls ou négatifs).
5. **Given** des flux qui n'admettent pas de taux de rentabilité interne, **When** le TRI est calculé, **Then**
   il est indéterminé (non convergent) et le calcul s'arrête en un nombre borné d'itérations.

---

### User Story 4 - Retrouver ces ratios dans la performance du bien (Priority: P2)

Depuis la page « Performance Patrimoine », sur un bien choisi, le gestionnaire voit les mêmes hypothèses
(synchronisées) et les mêmes ratios.

**Independent Test**: appeler `GET /patrimoine/performance?propertyId=` et vérifier la présence de `ratios` et
`assumptions`.

**Acceptance Scenarios**:

1. **Given** un bien choisi sur la page Performance, **When** elle se charge, **Then** les hypothèses
   enregistrées sont appliquées et les ratios affichés.
2. **Given** aucun bien choisi, **When** la page se charge, **Then** la performance du portefeuille reste
   inchangée (pas de ratios de portefeuille dans ce lot).

---

### Edge Cases

- Un bien d'une autre agence : `GET` et `PUT` d'hypothèses répondent comme pour un bien inexistant (404).
- `PUT` deux fois de suite avec le même corps : une seule ligne, aucune erreur (idempotent).
- Corps `PUT` incomplet, hors bornes, avec un champ inconnu ou un `tenantId` : 400 (`.strict()`).
- Valeur estimée nulle : LTV et TRI indéterminés (« Aucune valorisation renseignée »).
- Mensualités nulles sur 12 mois (prêt arrivé à terme) : DSCR indéterminé.
- Prêt dont le capital emprunté dépasse le coût de revient : cash-on-cash indéterminé, pas négatif trompeur.
- Rôle de lecture seule : voit les hypothèses et les ratios, ne peut pas les enregistrer.
- Bien client sous mandat (sans `tenantId` propre) : `GET /yield` répond (hypothèses par défaut), mais `GET`/`PUT .../yield/assumptions`
  répondent 404 : aucune ligne d'hypothèses ne peut être rattachée à ce bien (décision de sécurité ; le front garde alors
  les hypothèses sur l'appareil, « non synchronisées »).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Le système MUST conserver, par bien et par agence, les cinq hypothèses de projection
  (`years`, `valueGrowthRate`, `rentGrowthRate`, `expenseGrowthRate`, `vacancyRate`), avec une seule ligne par
  bien, l'auteur de la dernière modification et ses horodatages.
- **FR-002**: Le système MUST exposer `GET` et `PUT /tenants/:tenantId/properties/:propertyId/yield/assumptions`,
  gardés par `PROPERTIES_VIEW` et `PROPERTIES_EDIT`, le bien étant vérifié comme appartenant à l'agence.
- **FR-003**: Le corps du `PUT` MUST être strict (cinq champs obligatoires, aucun champ inconnu) et respecter
  les bornes de `projectionQuerySchema` : années entières de 1 à 30 ; croissances de −50 % à +100 % ;
  vacance de 0 à 100 %. Le `tenantId` n'est jamais lu du corps.
- **FR-004**: Sans ligne enregistrée, `GET` MUST renvoyer les valeurs par défaut avec `saved: false`
  et `updatedAt: null`.
- **FR-005**: `GET /yield` et `GET /patrimoine/performance?propertyId=` MUST résoudre les hypothèses champ
  par champ selon la priorité : requête > enregistrées > défauts ; un paramètre invalide reste un 400.
  La réponse expose `assumptions` (valeurs appliquées) et `assumptionsSaved`.
- **FR-006**: Le front MUST lire et écrire les hypothèses sur le serveur ; le `localStorage` ne sert plus que
  de repli hors ligne et de source de migration.
- **FR-007**: Le front MUST migrer le contenu valide du `localStorage` vers le serveur **une seule fois** :
  uniquement si le serveur n'a pas de ligne ; le serveur ne doit jamais être écrasé par le local ; la migration
  est retentée tant qu'elle échoue, et cesse dès que le serveur a une ligne.
- **FR-008**: Le système MUST calculer le **DSCR** = (loyers annuels effectifs − charges d'exploitation des
  12 derniers mois) ÷ mensualités d'emprunt des 12 prochains mois ; loyers effectifs = loyers annuels × (1 − vacance
  des hypothèses appliquées). Indéterminé sans prêt actif (`NO_ACTIVE_LOAN`) ou si un prêt actif n'a aucune mensualité sur 12 mois (`NO_DEBT_SERVICE`).
- **FR-009**: Le système MUST calculer le **LTV** = capital restant dû des prêts actifs ÷ valeur estimée (en %).
  Indéterminé sans prêt actif ou sans valeur estimée.
- **FR-010**: Le système MUST calculer le **cash-on-cash** = (loyers effectifs − charges − mensualités sur 12 mois)
  ÷ fonds propres investis × 100, fonds propres = coût de revient − capital initialement emprunté des prêts actifs.
  Indéterminé sans coût de revient ou si les fonds propres sont nuls ou négatifs.
- **FR-011**: Le système MUST calculer le **TRI** du bien avant financement sur l'horizon projeté : flux initial
  négatif égal au coût de revient, flux annuels = loyer effectif projeté − charges projetées, valeur terminale =
  valeur projetée à l'horizon ajoutée au dernier flux. Résolution numérique bornée (itérations et intervalle
  fixes) ; indéterminé sans coût de revient, sans valeur estimée, ou si elle ne converge pas.
- **FR-012**: Un ratio indéterminable MUST être renvoyé `{ value: null, reason }` avec un code de raison
  (`NO_ACTIVE_LOAN`, `NO_DEBT_SERVICE`, `NO_VALUE`, `NO_COST_BASIS`, `NO_EQUITY`, `NOT_CONVERGENT`) et JAMAIS 0 ni une valeur
  par défaut inventée.
- **FR-013**: L'onglet Patrimoine du bien MUST afficher les quatre ratios en cartes, chacune avec une info-bulle
  qui définit la formule, et la raison quand le ratio est indéterminé. Tous les textes passent par `t()`.
- **FR-014**: Le bandeau d'état des hypothèses MUST distinguer « synchronisées avec le serveur » et
  « non synchronisées : conservées sur cet appareil ».
- **FR-015**: Aucune route de ce lot n'est utilisable hors de la fonctionnalité d'abonnement `PATRIMOINE`
  (préfixe `/properties/:propertyId/yield` déjà mappé dans `route-features.ts`).

### Hors périmètre

- Export PDF/Excel des ratios, dossier bancaire et consolidation de groupe (chantier multi-actifs non fusionné
  qui réécrit `export/*` et `entities/consolidation-service.ts` : lot C3 de la feuille de route).
- Ratios de portefeuille (la performance sans `propertyId` est inchangée).
- Portail propriétaire (`owner-portal-view.ts` inchangé).
- TRI après financement (flux de fonds propres, dette restante à la sortie).
- Suppression ou réinitialisation d'hypothèses enregistrées (une valeur enregistrée se remplace, elle ne s'efface pas).

### Key Entities

- **PropertyYieldAssumption** : une ligne par bien (`propertyId` unique), porte `tenantId` directement ;
  `years` (entier), quatre taux (décimaux), `updatedByUserId` (nullable), `createdAt`, `updatedAt`.
- **RatioResult** (réponse, non stocké) : `{ value: number | null, reason: RatioReason | null }`.

## Hypothèses et décisions

- **Vacance appliquée au DSCR et au cash-on-cash** : l'hypothèse de vacance enregistrée réduit les loyers
  de ces deux ratios (c'est ce que les banques font) ; les rendements brut et net existants ne changent pas.
- **TRI avant financement** : il mesure la rentabilité du bien, pas celle des fonds propres ; un TRI après
  financement est un lot ultérieur.
- **Unités** : DSCR en ratio (1,25 = 1,25 x) ; LTV, cash-on-cash et TRI en points de pourcentage, comme les
  rendements existants.
- **Prêts actifs seulement** : un prêt soldé n'entre ni dans la dette ni dans les fonds propres investis.
- **Le serveur fait foi** : le `localStorage` migré ne sert qu'une fois ; ensuite il n'est qu'un miroir hors ligne.
- Aucune valeur fiscale, foncière ou de taux inventée ; aucun appel à un service externe.

## Success Criteria _(mandatory)_

- **SC-001**: Des hypothèses enregistrées par un collaborateur sont visibles par un autre, sur un autre
  appareil, au chargement suivant, sans ressaisie.
- **SC-002**: Un `localStorage` valide présent avant la livraison est repris sur le serveur au premier
  chargement, une seule fois, sans jamais écraser une valeur serveur.
- **SC-003**: Sur un bien chiffré à la main, les quatre ratios renvoyés par l'API égalent le calcul manuel
  (tests unitaires chiffrés).
- **SC-004**: Aucun ratio indéterminable n'est affiché à 0 : dans tous les cas indéterminés, l'API renvoie
  `null` et un code de raison, l'écran affiche « — » et la raison.
- **SC-005**: Un bien d'une autre agence est inaccessible en lecture comme en écriture d'hypothèses ;
  `schema-tenant-coverage`, `routes-inventory`, `route-features` et le registre d'export de données passent.
