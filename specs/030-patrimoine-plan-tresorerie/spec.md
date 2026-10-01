# Feature Specification: Plan de trésorerie prévisionnel du patrimoine (lot A2)

**Feature Branch**: `[feat/patrimoine-tresorerie]`
**Created**: 2026-10-01
**Status**: Draft
**Input**: feuille de route « gestion du patrimoine » (`docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md`, lot A2, capacité 7, § « Décisions prises par défaut » et § « Risques »). Le contrat d'interface commun à l'API et à l'écran est tenu par le coordinateur ; ce document en reprend les règles et les formes de réponse sans s'en écarter.

## Périmètre de cette spécification

Cette spécification couvre le lot A2 seul : un **plan de trésorerie prévisionnel** par mois, sur 12 ou 24 mois, pour le patrimoine de l'agence (les biens `ownershipType = 'TENANT'`) hors biens en vente, avec solde de départ facultatif, cumul mensuel et alerte de creux.

Les flux viennent de briques qui existent déjà et restent dispersées : échéances de loyer, baux actifs, emprunts, programmes de travaux, dépenses du bien, estimation de taxe foncière du moteur fiscal. Ce lot ne les remplace pas ; il les agrège en lecture.

Le lot ajoute deux données, de façon strictement additive : une **périodicité** sur les dépenses d'un bien (ponctuelle, mensuelle, trimestrielle, annuelle) et un **paramètre d'agence** qui porte la date d'exigibilité de la taxe foncière, **sans valeur par défaut**. Aucune dépense existante ne change de sens ; aucune date ni aucun montant fiscal n'est inventé.

Les lots A1 (hypothèses de projection serveur et ratios bancaires) et A3 (canaux WhatsApp et liens sécurisés) sont traités par ailleurs. Ce lot ne modifie ni le rendement du bien ni la projection pluriannuelle.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Voir mois par mois les flux attendus du patrimoine et être alerté d'un creux (Priority: P1)

Un gestionnaire veut ouvrir une page « Trésorerie prévisionnelle » et voir, mois par mois sur 12 ou 24 mois, ce que le patrimoine doit encaisser et décaisser, le solde cumulé et un signal clair si ce cumul devient négatif, pour anticiper un manque de liquidités avant qu'il se produise.

**Why this priority**: c'est la raison d'être du lot (capacité 7 de la feuille de route : « aucun plan agrégé » aujourd'hui). Sans cet écran, les briques existantes restent séparées et personne ne voit le mois où la trésorerie manquera.

**Independent Test**: sur une agence qui porte un bail actif, un emprunt actif et un programme de travaux planifié, ouvrir la page, constater que les 12 mois sont présents, que chaque mois porte entrées, sorties, net et cumul cohérents, puis saisir un solde de départ faible et constater l'alerte de creux avec son premier mois et sa profondeur.

**Acceptance Scenarios**:

1. **Étant donné** une agence avec un bail actif, un emprunt actif et un programme de travaux planifié sur des biens retenus, **Quand** le gestionnaire ouvre la page avec l'horizon par défaut, **Alors** il voit exactement 12 mois à partir du mois courant, chacun avec ses entrées, ses sorties, son net et son cumul, y compris les mois sans aucun flux (montants à 0).
2. **Étant donné** le plan affiché, **Quand** le gestionnaire passe l'horizon à 24 mois, **Alors** le plan est recalculé et affiche exactement 24 mois.
3. **Étant donné** un solde de départ de 100 000 XOF et des sorties qui dépassent les entrées dès le troisième mois, **Quand** le cumul passe sous zéro, **Alors** un bandeau d'alerte indique le premier mois où le cumul est négatif, le cumul à ce mois, le mois du cumul le plus bas et la profondeur du creux.
4. **Étant donné** un plan dont le cumul ne devient jamais négatif, **Quand** la page s'affiche, **Alors** un bandeau « aucun creux » le dit et aucune alerte n'est montrée.
5. **Étant donné** le plan affiché, **Quand** le gestionnaire déplie un mois, **Alors** il voit le détail ligne par ligne de ce mois, avec pour chaque ligne la catégorie, le sens (entrée ou sortie), le montant, le bien et la source.
6. **Étant donné** un gestionnaire sans la permission de lecture des biens, **Quand** il appelle le plan, **Alors** l'accès est refusé.

---

### User Story 2 - Savoir d'où vient chaque ligne et pourquoi une source manque (Priority: P1)

Un gestionnaire veut pouvoir remonter, pour chaque ligne du plan, à sa source (échéance, bail, prêt, programme de travaux, dépense, estimation fiscale), et lire explicitement quelles sources ne sont pas dans le plan et pourquoi, pour ne jamais prendre un « 0 » pour une vraie absence de flux.

**Why this priority**: un plan de trésorerie qui affiche un zéro silencieux fait plus de mal qu'une absence de plan : le gestionnaire croit à un mois calme alors qu'une source n'est simplement pas lue. La confiance dans le plan repose sur cette traçabilité.

**Independent Test**: sur une agence sans emprunt actif et sans paramètre de taxe foncière, ouvrir la page et vérifier que l'encart « sources non incluses » liste la source « Emprunts » (aucun emprunt actif) et la source « Taxe foncière » (date d'exigibilité non renseignée), chacune avec son explication, et qu'aucun mois ne porte de ligne issue de ces sources.

**Acceptance Scenarios**:

1. **Étant donné** une ligne du plan, **Quand** le gestionnaire la consulte, **Alors** elle indique sa catégorie, son sens, son montant, son bien, le type de sa source et l'identifiant de cette source (échéance, prêt, programme, dépense ou bail), ainsi que le libellé d'origine saisi par l'utilisateur quand il existe.
2. **Étant donné** une agence sans bail actif, sans emprunt actif, sans travaux planifiés ni charge récurrente, **Quand** le plan est calculé, **Alors** la réponse contient une entrée par source (loyers, emprunts, travaux, charges récurrentes, taxe foncière), chacune avec son statut et sa raison, et l'écran affiche l'explication de chacune.
3. **Étant donné** une source qui ne concerne qu'une partie des biens (par exemple une taxe foncière non estimable pour certains biens seulement), **Quand** le plan est calculé, **Alors** cette source est déclarée partielle avec le nombre de biens concernés.
4. **Étant donné** une ligne qui résulte d'un déplacement ou d'un reste à payer (échéance en retard ramenée au mois 1, travaux dont la date est dépassée, travaux en cours dont une partie est déjà payée), **Quand** le gestionnaire la consulte, **Alors** une particularité lisible la signale.

---

### User Story 3 - Ne jamais deviner la date de la taxe foncière (Priority: P1)

Un gestionnaire veut que la taxe foncière n'entre dans le plan que si l'agence a elle-même renseigné sa date d'exigibilité, et qu'une estimation reposant sur des paramètres fiscaux non validés soit marquée « estimation indicative », pour ne pas faire un plan faux avec une date ou un montant inventés.

**Why this priority**: c'est une décision de la feuille de route (« aucune valeur fiscale, foncière ou de date d'exigibilité inventée »). La date varie selon le pays et n'est pas établie ; le moteur fiscal a la quasi-totalité de ses paramètres `A_VALIDER`. Un plan qui y mettrait une date par défaut serait faux avec aplomb.

**Independent Test**: sans paramètre de taxe, vérifier qu'aucune ligne de taxe n'apparaît et que le message l'explique ; renseigner un mois et un jour, vérifier que des lignes de taxe apparaissent au bon mois, marquées « estimation indicative » tant que les paramètres du moteur fiscal ne sont pas tous validés.

**Acceptance Scenarios**:

1. **Étant donné** une agence dont la date d'exigibilité de la taxe foncière n'est pas renseignée, **Quand** le plan est calculé, **Alors** aucune ligne de taxe n'est produite, le moteur fiscal n'est pas interrogé, et la source « Taxe foncière » est déclarée non configurée avec le message « Date d'exigibilité de la taxe foncière non renseignée ».
2. **Étant donné** ce message à l'écran, **Quand** le gestionnaire renseigne un mois et un jour dans le formulaire proposé à cet endroit et enregistre, **Alors** le paramètre est conservé pour l'agence et le plan est recalculé avec la taxe.
3. **Étant donné** une date d'exigibilité renseignée et une estimation du moteur fiscal pour un bien, **Quand** le plan est calculé, **Alors** une ligne de sortie de catégorie taxe foncière est placée au mois de chaque échéance annuelle comprise dans l'horizon, pour un montant égal à la taxe foncière estimée de l'année de cette échéance (parts de tous les détenteurs), jamais la taxe sur les revenus locatifs.
4. **Étant donné** une estimation calculée avec au moins un paramètre fiscal `A_VALIDER`, **Quand** la ligne s'affiche, **Alors** elle est marquée « estimation indicative ».
5. **Étant donné** un bien pour lequel le moteur ne donne aucune estimation utilisable (pays non géré, paramètres absents, exonération, montant nul), **Quand** le plan est calculé, **Alors** aucune ligne n'est produite pour ce bien et il est compté dans la raison « taxe non estimable » de la source.
6. **Étant donné** un bien qui porte déjà une dépense périodique de catégorie taxe foncière, **Quand** le plan est calculé, **Alors** aucune taxe estimée n'est ajoutée pour ce bien (pas de doublon) et il est compté dans la raison « couvert par une charge récurrente ».
7. **Étant donné** un paramètre de taxe incomplet (mois sans jour ou jour sans mois) ou impossible (31 février), **Quand** le gestionnaire l'enregistre, **Alors** il est refusé avec une erreur de validation et rien n'est écrit.
8. **Étant donné** un paramètre renseigné, **Quand** le gestionnaire l'efface (mois et jour nuls), **Alors** la taxe sort de nouveau du plan avec le message de la source non configurée.

---

### User Story 4 - Déclarer une charge récurrente sur un bien (Priority: P2)

Un gestionnaire veut indiquer qu'une dépense d'un bien est mensuelle, trimestrielle ou annuelle, avec une date de fin éventuelle, pour qu'elle entre dans le plan aux bonnes échéances sans ressaisie.

**Why this priority**: sans périodicité, une charge régulière (assurance annuelle, frais de syndic trimestriels, abonnement mensuel) ne peut pas être projetée. Elle vient après le plan lui-même, qui reste utile avec les autres sources.

**Independent Test**: créer une dépense trimestrielle ancrée à une date future, vérifier ses occurrences tous les trois mois dans le plan, puis lui donner une date de fin et vérifier qu'aucune occurrence ne la dépasse.

**Acceptance Scenarios**:

1. **Étant donné** le formulaire de dépense d'un bien, **Quand** le gestionnaire crée une dépense, **Alors** il peut choisir sa périodicité (ponctuelle par défaut, mensuelle, trimestrielle, annuelle) et, si elle est périodique, une date de fin.
2. **Étant donné** une dépense existante créée avant ce lot, **Quand** le plan est calculé, **Alors** elle est ponctuelle, comme avant, et n'entre jamais dans le plan.
3. **Étant donné** une dépense mensuelle dont la date de paiement sert d'ancrage, **Quand** le plan est calculé, **Alors** une sortie est placée à chaque date anniversaire mensuelle à partir de l'ancrage, seules les occurrences à partir d'aujourd'hui et dans l'horizon étant retenues.
4. **Étant donné** une dépense périodique avec une date de fin, **Quand** le plan est calculé, **Alors** aucune occurrence au-delà de cette date (incluse) n'est produite.
5. **Étant donné** une date de fin fournie pour une dépense ponctuelle, ou une date de fin antérieure à la date de paiement, **Quand** le gestionnaire enregistre, **Alors** la saisie est refusée avec une erreur de validation.
6. **Étant donné** la liste des dépenses d'un bien, **Quand** elle s'affiche, **Alors** chaque dépense indique sa périodicité.
7. **Étant donné** une dépense périodique, **Quand** le rendement du bien est calculé, **Alors** le résultat est identique à celui d'avant ce lot : la périodicité ne s'applique qu'au plan de trésorerie.

---

### User Story 5 - Restreindre le plan à un bien (Priority: P2)

Un gestionnaire veut filtrer le plan sur un seul bien pour voir ce que ce bien rapporte et coûte mois par mois.

**Why this priority**: utile pour juger un bien isolé, mais le plan de l'ensemble du patrimoine apporte déjà l'essentiel de la valeur.

**Independent Test**: choisir un bien dans le filtre, vérifier que toutes les lignes portent ce bien et que les totaux sont recalculés ; demander un bien d'une autre agence et vérifier le refus.

**Acceptance Scenarios**:

1. **Étant donné** le plan de l'ensemble du patrimoine, **Quand** le gestionnaire choisit un bien, **Alors** seules les lignes de ce bien restent, et les totaux, le cumul et l'alerte sont recalculés sur ce bien.
2. **Étant donné** un identifiant de bien appartenant à une autre agence ou inexistant, **Quand** le plan est demandé, **Alors** la réponse est la même erreur « introuvable » dans les deux cas.
3. **Étant donné** un bien exclu du plan (en vente, vendu, archivé, brouillon), **Quand** le filtre le désigne, **Alors** le plan est vide et le bien figure dans la liste des biens exclus avec son motif.

---

### User Story 6 - Avec ou sans solde de départ (Priority: P2)

Un gestionnaire veut saisir le solde de trésorerie actuel pour que le cumul parte de la réalité, ou laisser le plan se calculer sans lui et savoir qu'il est calculé sans lui.

**Why this priority**: le solde de départ rend l'alerte de creux pertinente, mais l'application ne connaît pas la trésorerie réelle de l'agence : le champ doit être facultatif et sa non-saisie doit se voir.

**Independent Test**: calculer le plan sans solde et lire l'avertissement « calculé sans solde de départ » ; saisir un solde puis un solde négatif et vérifier le cumul.

**Acceptance Scenarios**:

1. **Étant donné** aucun solde saisi, **Quand** le plan est calculé, **Alors** le cumul part de 0, la réponse indique que le solde de départ n'a pas été fourni, et l'écran affiche « calculé sans solde de départ ».
2. **Étant donné** un solde de départ saisi, **Quand** le plan est calculé, **Alors** chaque cumul vaut ce solde plus la somme des nets jusqu'à ce mois inclus, et l'avertissement disparaît.
3. **Étant donné** un solde de départ négatif, **Quand** le plan est calculé, **Alors** le premier mois est le premier mois du creux et l'alerte le signale.
4. **Étant donné** une valeur non numérique ou non finie pour le solde de départ, **Quand** le plan est demandé, **Alors** la requête est refusée avec une erreur de validation.

---

### Edge Cases

- **Emprunt qui finit en cours de plan** : la mensualité est produite jusqu'à la date de fin incluse puis n'apparaît plus ; les mois suivants ne portent plus aucune ligne de prêt.
- **Échéance de loyer en retard** (date d'échéance antérieure au mois courant, reste dû > 0) : placée au mois 1 en catégorie « arriérés de loyer » ; les échéances payées ou annulées sont ignorées ; seul le reste à payer est compté.
- **Période de bail déjà couverte par une échéance** (quel que soit son statut) : l'échéance existante fait foi, la période n'est pas générée une seconde fois à partir du bail.
- **Bail sans montant de loyer** : il ne produit aucune ligne ; il n'invente pas de loyer.
- **Bail sans date de fin** : ses échéances sont projetées jusqu'à la fin de l'horizon.
- **Pénalités** : jamais anticipées sur les échéances à venir ; seules celles déjà portées par une échéance existante entrent dans son reste dû.
- **Travaux à date dépassée** : placés au mois 1 avec la particularité « date dépassée, ramenée au premier mois » ; date hors horizon : ignorés.
- **Travaux en cours avec coût réel déjà saisi** : le reste à payer (coût estimé moins coût réel, plancher 0) est compté, avec la particularité correspondante ; un reste nul ne produit aucune ligne.
- **Bien en vente** (aucun mode de transaction de location, voir la section Points ouverts) ou vendu, archivé, en brouillon : exclu du plan, listé avec son motif dans le périmètre.
- **Montant en devise autre que XOF** : ni converti ni additionné ; écarté et compté dans un avertissement affiché à l'écran. « FCFA » et « XOF » désignent la même monnaie.
- **Solde de départ négatif** : voir l'histoire 6.
- **29 février et fins de mois** : une échéance fixée au 29, 30 ou 31 est ramenée au dernier jour des mois plus courts ; le jour est calculé depuis l'ancrage et non en cumulant les décalages (un 31 janvier mensuel retombe sur le 31 mars, pas sur le 28).
- **Doublon taxe foncière / dépense périodique** : voir l'histoire 3, scénario 6.
- **Dépense ponctuelle** : n'entre jamais dans le plan, elle est passée.
- **Occurrences passées d'une dépense périodique** : réputées déjà comprises dans le solde de départ ; seules celles à partir d'aujourd'hui sont retenues.
- **Mois sans flux** : présent dans le plan avec des montants à 0 et aucune ligne.
- **Un seul bien exclu parmi plusieurs** : le plan des autres biens est calculé et le bien exclu figure dans le périmètre.
- **Aucun bien retenu** : le plan est vide et la source indique « aucun bien éligible », jamais un plan de zéros sans explication.
- **Isolation entre agences** : un bien, un prêt, un bail ou une dépense d'une autre agence n'entre jamais dans le plan, et un identifiant d'une autre agence se comporte comme un identifiant inexistant.

## Requirements _(mandatory)_

### Functional Requirements

**Calcul**

- **FR-001**: Le système MUST calculer un plan mensuel dont le premier mois est le mois courant (UTC) et qui contient exactement 12 ou 24 mois (12 par défaut), mois sans flux compris, avec pour chaque mois : entrées, sorties (positives), net (entrées moins sorties), cumul et montant par catégorie.
- **FR-002**: Le cumul d'un mois MUST valoir le solde de départ plus la somme des nets jusqu'à ce mois inclus. Le solde de départ vaut 0 s'il n'est pas fourni, et la réponse MUST indiquer s'il l'a été.
- **FR-003**: Le système MUST arrondir les montants à l'unité XOF en fin de calcul seulement ; les sommes intermédiaires se font en entiers ou en décimaux exacts, sans dérive de virgule flottante. Les montants des lignes sont toujours positifs, le sens (entrée ou sortie) portant le signe.
- **FR-004**: Le système MUST travailler en XOF. Un montant dont la devise n'est pas XOF (ou FCFA, équivalente) MUST être écarté, jamais converti ni additionné, et son nombre MUST être restitué dans un avertissement.
- **FR-005**: Le périmètre MUST se limiter aux biens de l'agence (`ownershipType = 'TENANT'`) dont le statut n'est ni brouillon, ni vendu, ni archivé (ensemble `OCCUPANCY_EXCLUDED_STATUSES` existant, réutilisé sans modification) et qui ne sont pas « en vente ». Les biens exclus MUST figurer dans la réponse avec leur motif ; les biens d'une autre nature de propriété n'y figurent pas, ils ne font pas partie du patrimoine de l'agence.
- **FR-006**: Le calcul MUST être une fonction pure sans accès à la base : les données lues par un service de chargement lui sont passées, et elle ne dépend d'aucun état global ni de l'horloge (la date du jour est une entrée).

**Sources et règles**

- **FR-007**: **Loyers.** Le système MUST inclure (a) le reste à payer des échéances de loyer existantes non payées et non annulées (loyer, charges, autres frais et pénalités, moins le payé), placé au mois de leur date d'échéance, ou au mois 1 en catégorie « arriérés de loyer » si cette date est antérieure au mois courant ; (b) les échéances à venir des baux actifs, construites avec le générateur d'échéances existant (jamais réécrit), pour chaque mois de l'horizon non déjà couvert par une échéance existante du même bail, pour le montant du loyer plus celui du service. Les pénalités ne sont jamais anticipées.
- **FR-008**: **Emprunts.** Le système MUST inclure, pour chaque prêt actif, la mensualité à la date anniversaire du jour de début, de un mois après le début jusqu'à la date de fin incluse, une occurrence n'entrant que si sa date est à partir d'aujourd'hui (début de journée UTC) et dans l'horizon. Aucun tableau d'amortissement n'est établi ; la mensualité est constante.
- **FR-009**: **Travaux.** Le système MUST inclure les programmes de travaux planifiés ou en cours pour leur coût estimé, placés au mois de leur date prévue ; pour un programme en cours dont un coût réel est renseigné, le reste à payer (estimé moins réel, minimum 0) ; une date antérieure au mois courant place la ligne au mois 1 avec la particularité « date dépassée » ; une date hors horizon est ignorée.
- **FR-010**: **Charges récurrentes.** Le système MUST inclure les dépenses dont la périodicité n'est pas ponctuelle, aux occurrences `date de paiement + k × pas` (pas de 1, 3 ou 12 mois, k ≥ 0), jusqu'à la date de fin incluse si elle est renseignée ; seules les occurrences à partir d'aujourd'hui et dans l'horizon sont retenues. Les dépenses ponctuelles n'entrent jamais dans le plan.
- **FR-011**: **Taxe foncière.** Si la date d'exigibilité de l'agence n'est pas renseignée, le système MUST NOT produire de ligne de taxe ni interroger le moteur fiscal, et MUST déclarer la source non configurée avec la raison « date d'exigibilité non renseignée ». Sinon, pour chaque bien retenu et chaque échéance annuelle dans l'horizon à partir d'aujourd'hui, la ligne MUST valoir la taxe foncière estimée de l'année de l'échéance (somme des taxes de nature taxe foncière applicables, parts de tous les détenteurs), jamais la taxe sur les revenus locatifs.
- **FR-012**: Une ligne de taxe estimée MUST être marquée indicative dès que l'estimation repose sur au moins un paramètre fiscal non validé. Un bien sans estimation utilisable MUST rester sans ligne et être compté dans la raison « taxe non estimable » ; un bien couvert par une dépense périodique de catégorie taxe foncière MUST ne recevoir aucune ligne estimée et être compté dans la raison « couvert par une charge récurrente ». Quand la date d'exigibilité est renseignée mais qu'aucune échéance ne tombe dans la fenêtre (par exemple l'échéance de ce mois est déjà passée sur un plan de 12 mois), la source MUST être déclarée sans donnée avec la raison « échéance hors période affichée » (jamais un zéro silencieux). Les appels au moteur fiscal MUST se faire par lots de 5 au plus.
- **FR-013**: Une échéance fixée à un jour qui n'existe pas dans un mois (29, 30 ou 31) MUST être ramenée au dernier jour de ce mois, le jour étant calculé depuis l'ancrage et non par décalages cumulés.

**Traçabilité et alerte**

- **FR-014**: Chaque ligne MUST porter sa catégorie, son sens, son montant, son bien (identifiant et titre), sa source (type et identifiant, nul pour la taxe estimée), un indicateur d'estimation indicative, un code de particularité éventuel et le libellé d'origine non traduit quand il existe.
- **FR-015**: Le système MUST déclarer, pour chacune des cinq sources (loyers, emprunts, travaux, charges récurrentes, taxe foncière), un statut (incluse, sans donnée, non configurée, partielle), une raison et, quand c'est pertinent, un nombre de biens. Une source sans ligne MUST toujours être expliquée ; le système MUST NOT présenter un zéro sans en dire la cause.
- **FR-016**: Le système MUST signaler un creux dès que le cumul devient négatif : premier mois négatif et cumul à ce mois, mois du cumul le plus bas et profondeur du creux (positive). Il MUST renvoyer une absence de creux (valeur nulle) quand le cumul reste positif ou nul sur tout l'horizon. Un solde de départ négatif fait du mois 1 le premier mois du creux.

**API et gardes**

- **FR-017**: Le système MUST exposer `GET /api/tenants/:tenantId/patrimoine/cash-plan`, protégé par la permission de lecture des biens (`PROPERTIES_VIEW`), avec une requête stricte : `months` (12 ou 24), `openingBalance` (nombre fini, facultatif), `propertyId` (identifiant, facultatif). Tout autre paramètre MUST être refusé par la validation.
- **FR-018**: Le système MUST exposer `PUT /api/tenants/:tenantId/patrimoine/cash-plan/settings`, protégé par la permission d'écriture des biens (`PROPERTIES_EDIT`), avec un corps strict `{ propertyTaxDueMonth, propertyTaxDueDay }` : mois entier de 1 à 12 et jour entier de 1 à 31, **soit tous deux nuls (effacement), soit tous deux renseignés**, le jour devant exister dans le mois (février : jusqu'au 29). L'écriture est un upsert par agence.
- **FR-019**: Tout filtre `propertyId` MUST être vérifié comme appartenant à l'agence avant lecture ; une référence d'une autre agence MUST lever la même erreur « introuvable » qu'un bien inexistant. Toute requête de lecture ou d'écriture de ce lot MUST être filtrée par `tenantId`.
- **FR-020**: Le plan lui-même MUST NOT être persisté : il est calculé à chaque lecture à partir des données du moment.

**Périodicité des dépenses**

- **FR-021**: Le système MUST ajouter à une dépense de bien une périodicité (ponctuelle, mensuelle, trimestrielle, annuelle) et une date de fin facultative, de façon additive : la périodicité par défaut est « ponctuelle », aucune dépense existante ne change de sens et la date de paiement reste la date de référence (date de la dépense ponctuelle, ou ancrage de la récurrence).
- **FR-022**: Les routes de création et de mise à jour des dépenses existantes MUST accepter la périodicité et la date de fin ; la date de fin MUST exiger une périodicité non ponctuelle et être postérieure ou égale à la date de paiement quand les deux sont fournies ; toutes les réponses de dépense (liste, détail, création, mise à jour) MUST renvoyer ces deux champs.
- **FR-023**: Le rendement du bien et les charges annuelles de la vue consolidée MUST rester calculés exactement comme avant ce lot ; la périodicité n'est lue que par le plan de trésorerie.

**Paramètre d'agence**

- **FR-024**: Le système MUST conserver un paramètre de plan de trésorerie par agence, portant le mois et le jour d'exigibilité de la taxe foncière, **sans aucune valeur par défaut** : nul signifie « non renseigné ». Une contrainte en base MUST garantir que les deux valeurs sont soit toutes deux nulles, soit toutes deux renseignées dans leurs bornes.

**Écran**

- **FR-025**: Le système MUST proposer la page « Trésorerie prévisionnelle » à `/tenant/:tenantId/patrimoine/plan-tresorerie`, chargée en `React.lazy`, avec une entrée de menu sous « Patrimoine » visible pour `PROPERTIES_VIEW` et le libellé de route correspondant. La page MUST proposer : le choix 12/24 mois, le solde de départ (XOF), le filtre par bien, le bandeau d'alerte de creux ou d'absence de creux, un graphique (barres des entrées et des sorties, courbe du cumul), un tableau mensuel dépliable (catégories, net, cumul, détail des lignes avec leur source) et un encart « sources non incluses ».
- **FR-026**: L'encart « sources non incluses » MUST lister chaque source non configurée ou sans donnée avec son explication, et, pour la taxe foncière non configurée, MUST proposer le formulaire mois/jour qui appelle l'écriture du paramètre (réservé aux détenteurs de `PROPERTIES_EDIT`). L'écran MUST afficher la mention « estimation indicative » sur les lignes indicatives, l'avertissement « calculé sans solde de départ » quand le solde n'est pas fourni, et l'avertissement de devise écartée quand il y en a.
- **FR-027**: Le formulaire de dépense du bien (onglet Patrimoine) MUST proposer la périodicité (Ponctuelle, Mensuelle, Trimestrielle, Annuelle) et, si elle est périodique, une date de fin ; la liste des dépenses MUST afficher la périodicité.
- **FR-028**: Le graphique MUST être chargé avec la page et jamais dans le paquet d'entrée de l'application.

**Transverse**

- **FR-029**: Tout texte affiché MUST passer par `t()` (le français est la clé) et être traduit en français, anglais et arabe ; les libellés de catégorie, de source, de raison et de particularité renvoyés par l'API sous forme de codes MUST être traduits côté écran ; les libellés d'origine saisis par l'utilisateur ne sont jamais traduits. Les marges MUST être logiques (`ms-*`, `me-*`, `align: 'end'`), jamais `ml-*` ou `mr-*`.
- **FR-030**: La nouvelle route MUST passer `routes-inventory.test.ts` et le nouveau modèle `schema-tenant-coverage.test.ts` ; l'étanchéité entre agences MUST être couverte par un test d'isolation.
- **FR-031**: Le wiki des fonctionnalités MUST être mis à jour (écran, routes, permissions, entrée de menu, périodicité des dépenses) et `npm run wiki:export` lancé dans la même PR ; `npm run wiki:check` MUST passer.

### Key Entities _(include if feature involves data)_

- **PropertyExpense (étendue)** : dépense d'un bien, existante, qui gagne `recurrence` (ponctuelle par défaut, mensuelle, trimestrielle, annuelle) et `recurrenceEndDate` (facultative). `paidAt` reste la date de référence. Le changement est additif : aucune colonne existante n'est modifiée ni supprimée.
- **PatrimonyCashPlanSettings** : paramètre du plan de trésorerie, une ligne par agence, portant le mois et le jour d'exigibilité de la taxe foncière, tous deux nuls tant que l'agence ne les a pas renseignés, avec l'auteur de la dernière modification. Calqué sur le paramètre du portail propriétaire.
- **CashPlanData (lecture seule, non persistée)** : le plan renvoyé par l'API. Il contient l'horizon, le solde de départ et son indicateur de saisie, le périmètre (biens retenus et exclus avec motif), les mois (entrées, sorties, net, cumul, montants par catégorie, lignes), les totaux, l'alerte de creux, l'état de chaque source, le paramètre de taxe en vigueur et les avertissements. Chaque ligne porte sa source.
- **RentalInstallment, Lease, PropertyLoan, WorkProgram, PropertyExpense, estimation de taxe foncière** (existants, lus sans être modifiés) : sources des lignes ; le plan ne les écrit jamais.

## Assumptions & Dependencies

- Le mois 1 est le mois courant (UTC), conformément à la décision de la feuille de route qui fixe la borne UTC+0 pour toute la vague.
- Les occurrences passées des charges récurrentes et les mensualités passées sont réputées déjà prises en compte dans le solde de départ saisi : le plan ne regarde que l'avenir.
- Les emprunts sont à amortissement constant du point de vue du plan : la mensualité est fixe de la première à la dernière échéance. Aucun tableau d'amortissement externe n'est lu ni produit.
- Les arriérés (échéances en retard) sont supposés encaissés au mois 1 : c'est une hypothèse de prudence discutable, signalée comme telle par la catégorie dédiée, et non une prévision de recouvrement.
- Les montants sont arrondis à l'unité XOF en fin de calcul, ce qui peut écarter le total d'un mois de quelques unités de la somme de ses lignes arrondies une à une ; le total est arrondi, pas les lignes cumulées.
- L'estimation de taxe foncière est celle de l'année de l'échéance (et non de l'année courante) : un plan de 24 mois peut donc comporter deux estimations d'années différentes.
- Le rendement du bien n'est pas modifié par la périodicité (FR-023).
- La dernière mensualité d'un emprunt est celle du dernier MOIS qui contient `endDate` (lecture prudente : si le jour anniversaire du prêt dépasse le jour de `endDate` dans ce mois, la mensualité est quand même comptée).
- La date de paiement d'une dépense périodique est celle d'un paiement RÉEL (le dernier, ou le premier déjà effectué) : la saisie écrit au journal le montant à cette date, et les occurrences suivantes sont déduites. L'API refuse donc une dépense périodique datée de plus de 24 h dans le futur.
- Une source sans flux dans la période alors que des enregistrements existent (dates passées, éléments terminés, montant nul, devise écartée) est déclarée avec la raison « aucun flux dans la période », distincte de « rien en base ».
- Limites connues, non traitées dans ce lot : le calcul de la taxe foncière appelle le moteur fiscal une fois par bien et par année d'échéance (environ six lectures chacun, sans cache) ; l'écran relance tout le plan quand le solde de départ change ; le filtre par bien de l'écran charge au plus 100 biens ; le formulaire de la date d'exigibilité est affiché aux lecteurs mais son enregistrement exige la permission d'édition ; l'ancre des dépenses est lue en UTC (une saisie très proche de minuit peut décaler le mois).
- Le moteur fiscal, les échéances de loyer, le générateur d'échéances, les emprunts, les programmes de travaux et les dépenses existent déjà sur `main` ; ce lot en dépend en lecture.
- Aucune valeur fiscale, foncière ni date d'exigibilité n'est fournie par ce lot : le paramètre de taxe est vide jusqu'à ce que l'agence le renseigne.
- Dépendance de coordination : les lots A1 et A3 touchent aussi `schemas.ts`, `queries.ts` et l'onglet Patrimoine du bien ; ce lot s'y rattache par ajouts ciblés (voir `plan.md`).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Pour tout jeu de données de test, la réponse contient exactement `months` mois (12 ou 24), et pour chaque mois le net vaut entrées moins sorties et le cumul vaut le solde de départ plus la somme des nets jusqu'à ce mois : 100 % des cas vérifiés par des tests de la fonction pure.
- **SC-002**: Sur un jeu de référence comportant un emprunt qui finit en cours de plan, une échéance en retard, des travaux à date dépassée, une charge trimestrielle et une taxe à date renseignée, chaque ligne attendue est présente au bon mois avec le bon montant et la bonne catégorie, sans ligne supplémentaire.
- **SC-003**: Aucune agence ne voit un « 0 » sans explication : sur l'ensemble des jeux de test, 100 % des sources sans ligne portent un statut et une raison dans la réponse, et l'écran affiche cette raison.
- **SC-004**: Sans date d'exigibilité renseignée, 0 ligne de taxe et 0 appel au moteur fiscal ; avec une date renseignée et des paramètres non validés, 100 % des lignes de taxe sont marquées indicatives.
- **SC-005**: Un jeu de test dont le cumul devient négatif produit une alerte dont le premier mois, le mois le plus bas et la profondeur sont exacts ; un jeu dont le cumul reste positif produit une absence de creux.
- **SC-006**: Toute référence à un bien d'une autre agence (filtre) renvoie la même erreur qu'un bien inexistant ; le test d'isolation entre deux agences passe, et aucun bien, prêt, bail, dépense ou paramètre de l'autre agence n'apparaît dans le plan.
- **SC-007**: Après la migration, 100 % des dépenses existantes sont ponctuelles, et le rendement et les charges annuelles d'un jeu de référence sont identiques avant et après (0 écart).
- **SC-008**: Le plan sur 24 mois d'un portefeuille de 100 biens avec un bail actif chacun est calculé en moins de 3 secondes, taxe foncière comprise (les appels au moteur fiscal se faisant par lots de 5).
- **SC-009**: Aucun libellé de l'écran n'est absent des catalogues français, anglais et arabe, vérifié par le contrôle d'extraction des textes ; aucune marge physique (`ml-*`, `mr-*`) dans les fichiers du lot.
- **SC-010**: `npm run typecheck`, `npm run lint`, `npm run check:architecture`, `npm run wiki:check` et les tests ciblés du lot passent, sans erreur TypeScript nouvelle dans un fichier déjà propre.

## Hors périmètre

- **Conversion de devises** : un montant non XOF est écarté et signalé, jamais converti (la conversion relève du lot C2 de la feuille de route).
- **Tableau d'amortissement** : la mensualité d'un emprunt est constante ; ni tableau ni recalcul d'intérêts.
- **Simulation de scénarios** : pas de « et si » (loyers en baisse, travaux décalés) ; le plan reflète les données saisies.
- **Export PDF ou Excel du plan** : l'export relève de la vague C (dossier bancaire et exports).
- **Rapprochement bancaire** : le plan ne lit aucun relevé bancaire et ne compare pas le prévu au réel.
- **Modification du rendement, de la projection pluriannuelle ou des ratios** (lot A1).
- **Anticipation des pénalités de retard**, des révisions de loyer et de la vacance locative.
- **Biens d'un autre type de propriété** que le patrimoine de l'agence (`ownershipType` différent de `TENANT`) et ventes de biens.
- **Valeur par défaut de la date d'exigibilité de la taxe foncière**, pour aucun pays.

## Points ouverts pour l'utilisateur

1. **Date d'exigibilité de la taxe foncière, par pays.** Elle diffère selon le pays (Côte d'Ivoire, Mali…) et n'est établie nulle part dans le dépôt. Elle doit être fixée avec un conseil fiscal ; aucune valeur n'est inventée ici, et le paramètre reste vide tant que l'agence ne l'a pas renseigné. Le paramètre étant unique par agence, il faudra trancher le cas d'une agence qui détient des biens dans plusieurs pays (une date par pays ? par bien ?).
2. **Sémantique de « bien en vente ».** La règle retenue est : le bien est en vente si ses modes de transaction contiennent la vente et ni la location ni la location de courte durée. Il faut confirmer ce critère, en particulier pour un bien à la fois à vendre et loué, qui reste dans le plan.
3. **Arriérés au mois 1.** Les loyers en retard sont placés au mois courant. À confirmer : préfère-t-on les exclure du plan, ou les étaler ?
4. **Solde de départ.** Il est saisi à la main et non mémorisé. À confirmer : faut-il le conserver pour l'agence (auquel cas il devient une donnée à tenir à jour) ou le laisser à saisir à chaque visite ?
5. **Charge périodique de taxe foncière.** Un bien qui porte déjà une dépense périodique de catégorie taxe foncière n'a pas d'estimation en plus. À confirmer que cette règle de non-doublon convient, y compris lorsque la dépense saisie ne couvre qu'une partie de la taxe.
