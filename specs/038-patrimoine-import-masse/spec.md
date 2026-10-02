# Spécification 038 — Import en masse du patrimoine : biens et valorisations

**Branche** : `feat/patrimoine-import` (lot C4 de la feuille de route
[PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md](../../docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md))
**Créée** : 2026-10-01
**Statut** : en cours
**Portée** : capacité 2 du plan (import en masse), **restreinte aux biens et aux
valorisations**. Hors périmètre : les baux et les locataires (ils déclenchent
échéances, invitations et e-mails), tout import côté serveur, toute route de lot,
tout nouveau modèle ou toute migration.

Références : [plan.md](./plan.md) · moteur existant `apps/web/src/lib/importation/` et
écran `apps/web/src/pages/finance/Importation.tsx` · modèle de menace dans
[SECURITY.md](../../docs/governance/SECURITY.md) · libellés dans
[i18n.md](../../docs/architecture/i18n.md).

## 1. Synthèse

Une agence qui démarre sur ImmoTopia tient déjà son parc dans un tableur. Aujourd'hui,
chaque bien se crée un par un dans l'assistant de création. Le lot ajoute un écran
**« Importer mon patrimoine »**, sous le menu Patrimoine : la personne télécharge un
gabarit Excel, le remplit, le dépose, corrige à l'aperçu ce que le fichier a de faux,
puis valide ; les biens et leurs valorisations sont alors créés ligne à ligne.

Le lot ne construit pas un second importeur : il **étend le moteur d'importation
existant** (`lib/importation`, aujourd'hui utilisé par l'import finance) par de nouveaux
**descripteurs de nature**. Le moteur garde ses principes : tout le traitement se fait
dans le navigateur, le fichier ne part jamais au serveur, rien n'est écrit avant que la
personne ait validé l'aperçu, et chaque ligne est enregistrée par une **route existante**
(`POST /tenants/:tenantId/properties`, `POST /tenants/:tenantId/properties/:propertyId/valuations`),
sous les permissions existantes des routes (`PROPERTIES_CREATE` pour les biens, `PROPERTIES_EDIT` pour les valorisations). Aucune route, aucune permission, aucun
modèle, aucune migration n'est ajouté.

Deux natures sont livrées : **Biens** (les biens de l'agence elle-même) et
**Valorisations** (rattachées à un bien déjà présent). Le lot apporte aussi une lecture de
fichier durcie (`.xlsx` et `.csv`, limites de taille, protection contre l'injection de
formule et contre les archives piégées), une estimation du quota avant écriture, un
rapport par ligne téléchargeable et une reprise propre après interruption.

## 2. Scénarios utilisateur

### US1 — L'agence importe ses biens depuis un fichier (P1)

1. **Étant donné** la page « Importer mon patrimoine », **quand** la personne choisit la
   nature « Biens », **alors** elle peut télécharger le gabarit Excel de cette nature
   (US5) ou déposer directement son fichier.
2. **Étant donné** un fichier `.xlsx` ou `.csv` dont les en-têtes sont ceux du gabarit,
   **quand** il est déposé, **alors** les colonnes sont rapprochées d'office, l'étape
   « colonnes » est sautée et l'aperçu s'affiche, avec les erreurs par ligne.
3. **Étant donné** un fichier aux en-têtes différents, **quand** il est déposé, **alors**
   l'étape « colonnes » propose un rapprochement que la personne corrige ; tant qu'un
   champ obligatoire n'a ni colonne ni valeur par défaut, l'aperçu reste bloqué et dit
   lequel manque.
4. **Étant donné** un aperçu où certaines lignes sont en erreur, **quand** la personne
   corrige une cellule sur place, **alors** la ligne entière est réévaluée ; une ligne en
   erreur ne part jamais.
5. **Étant donné** un aperçu validé, **quand** la personne lance l'import, **alors** les
   biens sont créés l'un après l'autre avec une barre de progression et un bouton
   d'arrêt ; **aucune** écriture n'a eu lieu avant ce clic.
6. **Étant donné** une ville absente du référentiel géographique, ou ambiguë, **quand**
   l'aperçu est calculé, **alors** la ligne est refusée avec un motif explicite : aucune
   ville n'est devinée.

### US2 — Le prix d'acquisition crée la valorisation d'acquisition (P1)

1. **Étant donné** une ligne de bien avec un prix et une date d'acquisition, **quand** elle
   est importée, **alors** le bien est créé puis une valorisation d'acquisition de méthode
   manuelle lui est ajoutée.
2. **Étant donné** une ligne avec une date d'acquisition **sans** prix, **quand** l'aperçu
   est calculé, **alors** la ligne est refusée (une date seule ne crée rien d'exploitable).
3. **Étant donné** un bien créé dont la valorisation est refusée par le serveur, **quand**
   le rapport est produit, **alors** la ligne est « partielle » : le bien existe, la
   valorisation manque, le motif est donné, et la ligne n'est **pas** relançable (la
   rejouer créerait un second bien). La personne ajoute la valorisation à la main ou par
   l'import « Valorisations ».

### US3 — L'agence importe des valorisations sur des biens existants (P1)

1. **Étant donné** un fichier de valorisations, **quand** une ligne désigne un bien par sa
   référence interne (ImmoTopia ou référence d'import) ou par son titre exact, **alors**
   elle est rattachée à ce bien, et son titre résolu s'affiche à l'aperçu.
2. **Étant donné** un titre porté par deux biens, **quand** l'aperçu est calculé, **alors**
   la ligne est refusée comme ambiguë ; elle l'est aussi quand rien ne correspond. Aucun
   rapprochement approximatif n'est tenté.
3. **Étant donné** une date future, une valeur négative ou nulle, ou une date absente,
   **quand** l'aperçu est calculé, **alors** la ligne est en erreur, avec son motif.
4. **Étant donné** plusieurs lignes pour le même bien à des dates différentes, **quand**
   l'import est lancé, **alors** toutes sont créées : un bien peut porter plusieurs
   valorisations.

### US4 — Un import interrompu ou partiellement refusé se reprend sans doublon (P1)

1. **Étant donné** une ligne refusée par le serveur (4xx ou 5xx), **quand** l'import
   continue, **alors** les lignes suivantes sont traitées normalement et le rapport donne le
   motif du serveur pour cette ligne.
2. **Étant donné** la limite de 1 000 requêtes par 15 minutes atteinte (HTTP 429), **quand**
   le serveur répond 429, **alors** l'import s'interrompt proprement, les lignes restantes
   sont « non traitées » et relançables.
3. **Étant donné** un import terminé avec des lignes refusées ou non traitées, **quand** la
   personne clique « Relancer », **alors** seules ces lignes sont rejouées ; une ligne déjà
   importée ou partielle ne l'est jamais.
4. **Étant donné** un clic sur « Arrêter » en cours d'import, **quand** la ligne en vol est
   terminée, **alors** l'import s'arrête et le reste est « non traité ».

### US5 — Le gabarit téléchargeable (P2)

1. **Étant donné** une nature choisie, **quand** la personne télécharge le gabarit,
   **alors** elle reçoit un `.xlsx` avec les en-têtes français exacts, une ligne d'exemple
   fictive marquée `[EXEMPLE]`, une feuille « Aide » (valeurs autorisées par champ) et des
   notes sur les en-têtes.
2. **Étant donné** un fichier rendu avec la ligne d'exemple intacte, **quand** il est
   importé, **alors** cette ligne est écartée d'office : un bien fictif n'est jamais créé.

### US6 — Le quota d'abonnement est annoncé avant l'écriture (P2)

1. **Étant donné** un pack dont la politique de dépassement est « bloquer » (mode enforce)
   et un restant de 40 pour 100 lignes valides, **quand** l'aperçu est calculé, **alors**
   60 lignes sont annoncées « hors quota » : elles ne sont pas envoyées et figurent au
   rapport.
2. **Étant donné** une politique « facturer le dépassement », **quand** l'aperçu est calculé,
   **alors** toutes les lignes passent et le dépassement facturé est annoncé.
3. **Étant donné** un mode « avertir seulement » ou désactivé, **quand** l'aperçu est
   calculé, **alors** un avertissement s'affiche sans bloquer aucune ligne.
4. **Étant donné** un abonnement en lecture seule, **quand** la personne ouvre l'import de
   biens, **alors** l'import est bloqué avec une explication.

### US7 — Le rapport de l'import (P2)

1. **Étant donné** un import terminé, **quand** le rapport s'affiche, **alors** chaque ligne
   porte un état — importée, ignorée, en erreur, refusée par le serveur, hors quota, non
   traitée, partielle — avec son motif.
2. **Étant donné** ce rapport, **quand** la personne le télécharge en CSV, **alors** le
   fichier donne, pour chaque bien créé, la correspondance entre la référence du fichier et
   la référence ImmoTopia attribuée.

## 3. Exigences fonctionnelles

### Moteur et descripteurs

- **FR-001** : le moteur `lib/importation` est étendu par descripteurs, sans écran qui
  connaisse une nature. Le descripteur reste le contrat actuel (champs typés, rapprochement
  des colonnes, valeurs par défaut, validation de ligne, `enregistrer`, empreinte de
  doublon) ; il gagne ce qu'il faut pour les natures du patrimoine : référentiels `communes`,
  `biens`, `typesBien`, `modesTransaction`, `methodesValorisation` (les trois derniers sont
  des listes fermées et statiques, sans appel réseau), correspondance **exacte** d'un champ
  de référence, valeur d'exemple de gabarit, résultat de ligne « partielle ».
- **FR-002** : les huit descripteurs finance existants et leur comportement ne changent pas ;
  leurs tests restent verts sans modification.
- **FR-003** : le principe « brouillons à l'aperçu, aucune écriture avant validation » est
  conservé : tant que la personne n'a pas lancé l'import, aucune requête d'écriture n'est
  émise.
- **FR-004** : chaque ligne est enregistrée **en série**, dans l'ordre du fichier, par les
  routes existantes. Une erreur 4xx ou 5xx sur une ligne ne bloque pas les suivantes.
- **FR-005** : HTTP 429 interrompt l'import : la ligne concernée et les suivantes sont
  « non traitées », relançables. Aucune nouvelle tentative automatique n'est faite.

### Lecture du fichier

- **FR-006** : formats acceptés : `.xlsx` et `.csv`. `.xlsm` et `.xlsb` sont refusés, de
  même qu'une archive `.xlsx` contenant `vbaProject.bin` : aucune macro n'est lue.
- **FR-007** : le fichier est lu **dans le navigateur** ; il n'est jamais envoyé au serveur,
  jamais conservé. `exceljs` est chargé à la demande, comme aujourd'hui.
- **FR-008** : limites : 5 Mo, 1 000 lignes de données, 60 colonnes, 2 000 caractères par
  cellule. Un dépassement est refusé avant tout aperçu, avec un message qui dit la limite.
- **FR-009** : avant lecture d'un `.xlsx`, l'archive est inspectée (anti-bombe zip) :
  20 Mo décompressés au plus, 300 entrées au plus ; au-delà, le fichier est refusé sans être
  décompressé. Le répertoire central est lu entrée par entrée jusqu'à sa fin déclarée (un
  compteur ou une taille falsifiés sont refusés) et `vbaProject.bin` est refusé où qu'il soit.
  Risque résiduel assumé : un fichier forgé dont les tailles déclarées mentent peut encore
  ralentir ou geler l'onglet de la personne qui l'ouvre volontairement (déni de service
  local, sans exécution ni fuite) ; la parade complète (lecture en flux avec décompte réel)
  demande d'ajouter la dépendance `jszip` et reste un point ouvert.
- **FR-010** : un `.csv` accepte les séparateurs `;`, `,` et tabulation, détectés
  automatiquement. Le texte est lu en UTF-8 strict ; en cas d'échec, repli sur windows-1252,
  **signalé** à la personne.
- **FR-011** : une formule n'est jamais interprétée ni exécutée : pour une cellule formule,
  seul le résultat mis en cache est lu. Une cellule dont le **texte** commence par `=` ou `@`
  est refusée à l'import, avec un motif en clair, **quel que soit le type du champ** (texte,
  montant, date…). Un montant n'accepte pas de signe `+` ou `-` hors de sa tête.
- **FR-012** : les nombres s'écrivent au format français (« 1 250 000,50 »), les dates en
  `JJ/MM/AAAA` ; les numéros de série Excel sont convertis en dates.
- **FR-013** : toute cellule est rendue par React (texte échappé) ; jamais de HTML, jamais de
  `dangerouslySetInnerHTML`.

### Nature « Biens »

- **FR-014** : la nature crée des biens de **l'agence uniquement** (`ownershipType` `TENANT`).
  Aucun propriétaire tiers, aucun mandat n'est jamais placé dans le corps de la requête. La
  barrière « détenu en propre » du pack Patrimoine continue de s'appliquer : ses refus 403
  sont rendus ligne par ligne, avec le message du serveur.
- **FR-015** : champs de la nature, en-têtes français exacts :

  | Champ               | Obligatoire | Règle                                                                                                                                                        |
  | ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | Référence interne   | non         | conservée dans `typeSpecificData.referenceImport` (voir FR-017)                                                                                              |
  | Titre               | oui         | texte                                                                                                                                                        |
  | Type de bien        | oui         | liste fermée : Appartement, Maison / Villa, Studio, Duplex / Triplex, Bureau, Boutique / Commercial, Entrepôt / Industriel, Terrain, Immeuble, Parking / Box |
  | Adresse             | non         | texte                                                                                                                                                        |
  | Ville / commune     | oui         | rapprochement **exact** avec `GET /geographic/communes` ; ambigu ou inconnu refusé                                                                           |
  | Quartier / zone     | non         | texte                                                                                                                                                        |
  | Surface             | non         | nombre > 0 ; **obligatoire pour un Terrain** (le gabarit serveur exige `land_area`)                                                                          |
  | Nombre de pièces    | non         | entier ≥ 0                                                                                                                                                   |
  | Mode de transaction | oui         | Vente, Location, Location courte durée                                                                                                                       |
  | Prix d'acquisition  | non         | montant > 0 ; crée la valorisation d'acquisition (FR-018)                                                                                                    |
  | Date d'acquisition  | non         | date passée ou du jour ; refusée sans prix                                                                                                                   |

  La liste des types est celle des types ouverts à la création : tous les types moins ceux
  que l'assistant de création masque.

- **FR-016** : la devise est « CFA », comme dans l'assistant de création. Aucune colonne
  devise n'est lue (voir §8, multi-devises).
- **FR-017** : la référence du fichier est conservée dans
  `typeSpecificData.referenceImport`. La référence interne ImmoTopia est **générée par le
  serveur** et ne peut pas être fixée : le rapport CSV donne, pour chaque bien créé, la
  correspondance « référence du fichier ↔ référence attribuée ».
- **FR-018** : un prix d'acquisition crée, après le bien, une **valorisation d'acquisition**
  de méthode manuelle par `POST …/properties/:propertyId/valuations`. Si le bien est créé mais
  pas la valorisation, la ligne est « partielle » : elle n'est pas relançable et son motif
  explique ce qui manque.
- **FR-019** : détection des doublons : par **référence** (contre la référence ImmoTopia et
  la référence d'import des biens existants de l'agence, et à l'intérieur du fichier) et par
  **titre + adresse** (mêmes sources). La personne choisit le traitement : **ignorer** (défaut,
  la ligne n'est pas envoyée et figure au rapport comme « ignorée ») ou **refuser** (la ligne
  est en erreur).

### Nature « Valorisations »

- **FR-020** : une ligne se rattache à un bien par sa **référence interne** (référence
  ImmoTopia ou référence d'import) **ou** par son **titre exact**. La comparaison est une
  égalité après normalisation (casse, accents, ponctuation) ; jamais une approximation.
  Introuvable ou ambigu : refusé, avec un motif explicite.
- **FR-021** : champs, en-têtes français exacts :

  | Champ              | Obligatoire | Règle                                                         |
  | ------------------ | ----------- | ------------------------------------------------------------- |
  | Bien               | oui         | référence ou titre exact (FR-020)                             |
  | Date               | oui         | **aucune valeur par défaut** ; une date future est refusée    |
  | Valeur estimée     | oui         | montant strictement positif                                   |
  | Coût d'acquisition | non         | montant > 0 (le serveur exige un montant strictement positif) |
  | Date d'acquisition | non         | date passée ou du jour                                        |
  | Méthode            | non         | Manuelle (défaut), Estimation de marché, Expertise            |
  | Source             | non         | texte, enregistré dans les notes de la valorisation           |

- **FR-022** : plusieurs valorisations pour un même bien sont autorisées. Les doublons ne
  sont détectés qu'**à l'intérieur du fichier** (même bien, même date, même valeur) : les
  valorisations existantes ne se lisent que bien par bien et ne sont pas chargées (voir §8).
- **FR-023** : les biens candidats au rattachement viennent de la liste des biens de
  l'agence ; la liste est filtrée sur `tenantId` côté client en plus du filtre serveur.

### Gabarit téléchargeable

- **FR-024** : un gabarit `.xlsx` par nature : en-têtes français exacts, **une** ligne
  d'exemple fictive dont la première cellule renseignée est marquée `[EXEMPLE]`, une feuille
  « Aide » (valeurs autorisées, formats, règles), des notes sur les en-têtes. **Aucune
  formule, aucune macro.**
- **FR-025** : la ligne portant le marqueur `[EXEMPLE]` est écartée d'office à l'import.
- **FR-026** : une cellule de gabarit ou de rapport CSV qui commencerait par `=`, `+`, `-`
  ou `@` est neutralisée par une apostrophe initiale : une valeur saisie par l'agence ne
  devient jamais une formule chez celui qui rouvre le fichier. Un nombre pur (« -5 », « +225 »)
  et le tiret seul ne sont pas apostrophés : ils ne sont pas des formules et le préfixe
  fausserait leur lecture.

### Quotas

- **FR-027** : un import de biens est soumis au quota du pack **exactement comme la création
  unitaire** : le serveur reste l'autorité, une ligne qui dépasse reçoit un
  `QuotaExceededError` (409), rendu ligne par ligne.
- **FR-028** : l'aperçu **estime** avant validation combien de lignes passeront, d'après
  `GET /tenants/:tenantId/entitlements` : la capacité `BIENS_DETENUS` quand le pack en
  apporte une, sinon `LOTS` pour les biens proposés à la location.

  | Situation du pack             | Effet à l'aperçu                                                             |
  | ----------------------------- | ---------------------------------------------------------------------------- |
  | Politique BLOCK, mode enforce | lignes au-delà du restant : « hors quota », non envoyées, listées au rapport |
  | Politique BILL_OVERAGE        | toutes passent ; dépassement facturé annoncé                                 |
  | WARN_ONLY, mode warn ou off   | avertissement seulement, aucune ligne retenue                                |
  | Abonnement en lecture seule   | import bloqué, avec explication                                              |

- **FR-029** : l'estimation ne remplace pas le contrôle serveur : si l'estimation est fausse
  (autre import en parallèle, quota consommé entre-temps), les lignes refusées par le serveur
  sont rapportées comme « refusées par le serveur ».

### Rapport et reprise

- **FR-030** : le compte rendu est **par ligne**. États : importée, ignorée (doublon),
  en erreur (refusée à l'aperçu), refusée par le serveur, hors quota, non traitée, partielle.
  Chaque ligne porte son numéro **dans le fichier**, son motif et, si créée, la référence
  attribuée.
- **FR-031** : « Relancer » rejoue uniquement les lignes refusées par le serveur
  **relançables** et les lignes non traitées. Une ligne importée, ignorée ou partielle n'est
  jamais rejouée.
- **FR-032** : le rapport se télécharge en CSV (FR-026 s'applique). Il ne contient que les
  colonnes du fichier utiles à repérer la ligne, jamais le fichier entier.

### Écran et navigation

- **FR-033** : nouvel écran « Importer mon patrimoine », route
  `/tenant/:tenantId/patrimoine/importation`, chargé en `React.lazy` dans le chunk
  « patrimoine ». Entrée de menu `patrimoine-import` sous Patrimoine, permission
  `PROPERTIES_CREATE` ou `PROPERTIES_EDIT` (au moins une des deux ; chaque route refuse la ligne si l'autre manque).
- **FR-034** : étapes : nature → gabarit ou fichier → colonnes (sautée quand le
  rapprochement est parfait) → aperçu → exécution (progression, bouton d'arrêt) → rapport.
- **FR-035** : les seules routes appelées sont celles qui existent déjà
  (`POST /tenants/:tenantId/properties`, `POST /tenants/:tenantId/properties/:propertyId/valuations`,
  `GET /tenants/:tenantId/entitlements`, `GET /geographic/communes` et la lecture des biens de
  l'agence) ; aucune route n'est ajoutée, aucune permission n'est créée.
  `routes-inventory.test.ts` et
  `schema-tenant-coverage.test.ts` n'ont donc pas de nouvelle entrée à porter.

### Transverse

- **FR-036** : tout libellé visible passe par `t()` (fr clé, en, ar) ; marges en propriétés
  logiques ; l'écran est utilisable en RTL.
- **FR-037** : aucun contenu de fichier n'est journalisé (console, journal applicatif,
  analytique) et aucun fichier n'est stocké, ni en mémoire persistante ni dans le
  navigateur (`localStorage`, `sessionStorage`, IndexedDB).
- **FR-038** : le budget d'entrée du bundle web (226 304 o gzip, `measure:entry`) est
  respecté : la page, exceljs et les descripteurs ne sont chargés qu'à l'ouverture de
  l'écran.

## 4. Menaces et mesures

| Menace                                                 | Mesure retenue                                                                                                                                                                                                      | Vérification                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Injection de formule à l'import (CSV, Excel)           | Une formule n'est jamais interprétée : résultat en cache seulement ; un texte commençant par `=` ou `@` est refusé avec un motif                                                                                    | FR-011 ; test : cellules `=…`, `@…`, `+…`, `-…`                |
| Injection de formule à l'export (gabarit, rapport CSV) | Neutralisation par apostrophe de toute cellule commençant par `= + - @` ; aucune formule dans le gabarit                                                                                                            | FR-024, FR-026 ; test : valeurs hostiles dans le rapport       |
| Fichier piégé : bombe zip, très gros fichier, macro    | 5 Mo, 1 000 lignes, 60 colonnes, 2 000 caractères par cellule ; inspection de l'archive avant lecture (20 Mo décompressés, 300 entrées) ; `.xlsm`, `.xlsb` et `vbaProject.bin` refusés                              | FR-006, FR-008, FR-009 ; test : archive gonflée, 1 001 lignes  |
| XSS à l'affichage des cellules                         | Rendu par React uniquement, texte échappé ; jamais de `dangerouslySetInnerHTML` ni de HTML construit                                                                                                                | FR-013 ; test : cellule `<img onerror=…>` affichée en texte    |
| Fuite entre agences                                    | Biens du référentiel filtrés sur `tenantId` côté client en plus du filtre serveur ; les `POST` passent par `requireTenantAccess` et les gardes existants ; valorisation vers un bien d'une autre agence : refus 404 | FR-023, FR-035 ; `test:isolation` (valorisation inter-agences) |
| Contournement de la barrière « détenu en propre »      | Le corps ne porte jamais de propriétaire tiers ni de mandat ; `ownershipType` fixé à `TENANT` ; refus 403 du serveur rapportés par ligne                                                                            | FR-014 ; test : corps de requête construit                     |
| Épuisement du quota ou de la limite de requêtes        | Estimation avant écriture ; série ; 429 interrompt proprement l'import, lignes non traitées relançables ; plafond de 1 000 lignes par fichier                                                                       | FR-005, FR-008, FR-028                                         |
| Doublons massifs                                       | Détection par référence et par titre + adresse, contre l'existant et dans le fichier ; choix ignorer ou refuser                                                                                                     | FR-019 ; test : fichier rejoué deux fois                       |
| Relance qui créerait un doublon                        | Ligne « partielle » non relançable ; « Relancer » ne rejoue que les lignes refusées relançables et non traitées                                                                                                     | FR-018, FR-031                                                 |
| Données personnelles                                   | Fichier lu dans le navigateur, jamais envoyé, jamais conservé ; aucun contenu journalisé ; rapport CSV produit à la demande, chez la personne                                                                       | FR-007, FR-037                                                 |
| Ligne d'exemple importée par erreur                    | Marqueur `[EXEMPLE]` : ligne écartée d'office                                                                                                                                                                       | FR-025                                                         |
| Rattachement d'une valorisation au mauvais bien        | Égalité exacte après normalisation, jamais d'approximation ; ambigu ou introuvable refusé                                                                                                                           | FR-020                                                         |

Limites assumées : l'estimation de quota est indicative, le serveur tranche. Un fichier
rempli de mauvaises données exactes (un bien réel, mais pas celui de l'agence) n'est pas
détectable par le navigateur. Le plafond de requêtes est global à l'agence : un import
important peut gêner, un moment, les autres usages de l'application.

## 5. Entités clés

Aucun modèle Prisma n'est ajouté. Les entités sont des types du moteur, côté web :

- **`DescripteurNature`** (existant, étendu) : décrit une nature (champs, référentiels,
  validation, enregistrement, doublons). Deux nouveaux descripteurs : « Biens » et
  « Valorisations ».
- **`FichierLu`** (nouveau) : le fichier lu et validé en limites — colonnes, lignes avec leur
  numéro dans le fichier, séparateur et encodage détectés, avertissements. Remplace la
  `FeuilleLue` actuelle pour les natures patrimoine ; l'import finance continue de lire
  `FeuilleLue`.
- **`LigneEvaluee`** (existant, étendu) : une ligne de l'aperçu, ses cellules évaluées, ses
  erreurs, son doublon éventuel, son état d'exécution.
- **`CompteRenduImport`** (existant, étendu) : le bilan de l'exécution.
- **`LigneRapport`** (nouveau) : une ligne du rapport — numéro dans le fichier, état,
  motif, référence du fichier, référence ImmoTopia attribuée.
- **`BienExistant`** (nouveau, type de référentiel) : un bien de l'agence réduit à ce que
  l'import lit — identifiant, référence interne, référence d'import, titre, adresse,
  `tenantId`.
- **Évaluation de quota** (nouveau) : capacité retenue, restant, politique, mode, nombre de
  lignes qui passent, qui sont hors quota, dépassement facturé annoncé.

Entités serveur utilisées sans modification : le bien et ses données spécifiques
(`typeSpecificData`), la valorisation d'un bien, les droits d'abonnement (`entitlements`),
le référentiel géographique.

## 6. Hypothèses

- **Prix sans date d'acquisition** : la valorisation exige une date ; une ligne avec un prix
  mais sans date d'acquisition prend la date du jour pour la valorisation (sans renseigner la
  date d'acquisition elle-même). Une date sans prix, en revanche, est refusée à l'aperçu.
  À confirmer.
- **Contenu de la valorisation d'acquisition** : valeur estimée et coût d'acquisition prennent
  le prix du fichier, la date est la date d'acquisition, la méthode est « manuelle ». Le
  contrat exact de la route de valorisation fixe les noms de champs.
- **Quota par lots** : quand la capacité `BIENS_DETENUS` n'existe pas dans le pack, seuls les
  biens dont le mode de transaction est Location ou Location courte durée consomment la
  capacité `LOTS` ; les biens à la vente n'en consomment pas.
- **Rapprochement géographique exact** : « exact » signifie égalité après normalisation
  (casse, accents, ponctuation) avec le nom de la commune ; une commune homonyme dans deux
  régions est ambiguë et refusée.
- **Un seul onglet lu** : comme l'import finance, la première feuille du classeur est lue.
- **Une ligne = un bien, une valorisation** : l'import ne regroupe rien ; un fichier de
  valorisations porte une ligne par valorisation.
- **Valeurs de liste** : « Type de bien », « Mode de transaction » et « Méthode » acceptent
  l'écriture du gabarit, sans casse ni accent ; toute autre valeur est refusée.
- **Fuseau des dates** : les dates sont des jours civils, sans heure ; « du jour » se calcule
  dans le fuseau du navigateur.
- **Serveur seule autorité** : le client ne contourne aucune règle métier ; ses contrôles
  (obligatoires, formats, doublons, quota) évitent des allers-retours mais ne remplacent
  jamais ceux du serveur.
- **Aucun import par une personne sans `PROPERTIES_CREATE` ni `PROPERTIES_EDIT`** : l'écran n'est ni visible ni
  accessible ; les routes appelées refusent de toute façon l'écriture.

## 7. Critères de succès

- **SC-001** : 100 biens sont importables en un seul passage pour une agence au pack Pro,
  dans la limite de 1 000 lignes par fichier.
- **SC-002** : 0 requête d'écriture avant la validation de l'aperçu (test sur le client réseau
  simulé).
- **SC-003** : 0 ligne importée en double lors d'une relance, y compris après un 429 ou un
  arrêt manuel.
- **SC-004** : 100 % des lignes en erreur sont expliquées à l'aperçu, ligne par ligne, avant
  toute écriture.
- **SC-005** : le rapport CSV contient 100 % des lignes du fichier (hors lignes vides et
  ligne d'exemple), avec un état, un motif et, pour les biens créés, la référence attribuée.
- **SC-006** : 100 % des fichiers hors limites (taille, lignes, colonnes, cellule, archive
  gonflée, macro) sont refusés avant tout aperçu avec un message qui dit la limite.
- **SC-007** : 0 cellule du gabarit ou du rapport ne commence par `=`, `+`, `-` ou `@` sans
  apostrophe de neutralisation.
- **SC-008** : 100 % des lignes dont la ville est inconnue ou ambiguë, et dont le bien de
  rattachement est introuvable ou ambigu, sont refusées.
- **SC-009** : sur un pack à politique BLOCK, 0 ligne au-delà du restant n'est envoyée au
  serveur.
- **SC-010** : une valorisation visant un bien d'une autre agence est refusée (`test:isolation`).
- **SC-011** : le budget d'entrée du bundle web (226 304 o gzip) est respecté.
- **SC-012** : typecheck web et API sans nouvelle erreur, lint, `check:architecture`, tests
  de l'import finance inchangés et verts, complétude i18n fr/en/ar, `wiki:check` vert ;
  relecture `code-reviewer` et `security-auditor` faite.

## 8. Points ouverts et hors périmètre

- **Import des baux et des locataires** : hors lot ; spécification future. Ils déclenchent
  échéances, invitations et e-mails, ce qui exige un mode « sans notification » et un
  traitement serveur.
- **Import côté serveur et route de lot** : non prévus ; le traitement reste dans le
  navigateur, une ligne par requête.
- **Multi-devises** (XOF, FCFA, CFA) : une seule devise « CFA », comme l'assistant de
  création ; la gestion des devises relève de la capacité 11 du plan.
- **Lecture des valorisations existantes pour les doublons** : impossible sans appel par
  bien ; attend une route de lot côté serveur.
- **Limite de 1 000 requêtes par 15 minutes** : un fichier de 1 000 lignes avec prix
  d'acquisition en consomme jusqu'à 2 000 ; le 429 est géré proprement, mais le plafond est
  un point à revoir avec l'équipe d'exploitation.
- **Rapprochement géographique approximatif** : non fait ; une ville mal orthographiée est
  refusée, la personne la corrige à l'aperçu.
- **Biens de propriétaires tiers et mandats** : hors lot ; ils relèvent de la gestion
  locative et du mandat, avec leurs propres contrôles.
- **Import de pièces jointes, photos, documents** : hors lot.
- **Plusieurs feuilles dans un classeur** : non prévu ; la première feuille est lue.
- **Mise à jour de biens existants par import** : hors lot ; l'import crée, il ne modifie
  pas.
