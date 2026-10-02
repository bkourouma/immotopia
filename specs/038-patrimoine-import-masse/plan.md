# Plan d'implémentation 038 — Import en masse du patrimoine : biens et valorisations

**Branche** : `feat/patrimoine-import` · **Spec** : [spec.md](./spec.md) ·
**Plan de vague** : [PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md](../../docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md) (lot C4)

## Résumé

Le moteur d'importation existant (`apps/web/src/lib/importation/`, aujourd'hui au service de
l'import finance) est étendu par deux descripteurs de nature, « Biens » et
« Valorisations », et par une lecture de fichier durcie (`.xlsx` et `.csv`). Un nouvel écran
« Importer mon patrimoine » (menu Patrimoine) conduit la personne de la nature au rapport :
gabarit, fichier, colonnes, aperçu avec erreurs par ligne et estimation du quota, exécution
ligne à ligne avec arrêt possible, rapport CSV et reprise. **Tout se passe dans le
navigateur** et par des routes existantes : aucun code API, aucune migration, aucune
permission.

## Contexte technique

- Web React 18, Ant Design, Vitest ; `exceljs` déjà présent, chargé à la demande.
- Existant réutilisé : `lib/importation` (`types.ts`, `classeur.ts`, `rapprochement.ts`,
  `valeurs.ts`, `referentiel.ts`, `execution.ts`, `natures.ts`), l'écran
  `pages/finance/Importation.tsx` (cinq étapes : document, fichier, colonnes, aperçu,
  import) comme modèle de parcours, `services/geographic-service.ts` (communes),
  la liste des biens de l'agence, `GET /tenants/:tenantId/entitlements`,
  `POST /tenants/:tenantId/properties` et `POST …/properties/:propertyId/valuations`
  (`patrimoine-routes.ts`), `i18n/t.ts`.
- Déjà posé sur la branche : extension de `types.ts` (référentiels `communes`, `biens`,
  `typesBien`, `modesTransaction`, `methodesValorisation`, `BienExistant`, correspondance
  exacte, valeur d'exemple) et `gabarit-constantes.ts` (marqueur `[EXEMPLE]`).
- Pas de migration, pas de schéma Prisma touché, pas de nouvelle variable d'environnement,
  pas de route ni de permission : `routes-inventory.test.ts` et
  `schema-tenant-coverage.test.ts` ne bougent pas.
- Budget d'entrée du bundle : 226 304 o gzip (`measure:entry`). L'écran, les descripteurs et
  `exceljs` restent hors du chunk d'entrée.

## Vérification de la constitution (AGENTS.md)

| Règle                          | Application                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolation multi-tenant         | Aucune route nouvelle ; les `POST` passent par `requireTenantAccess` et les gardes existants ; biens du référentiel filtrés sur `tenantId` en plus du serveur             |
| Erreurs typées, `asyncHandler` | Sans objet côté API ; côté web, les refus serveur (403, 404, 409, 429) sont lus par `motifDeLErreur` et rendus ligne par ligne                                            |
| Configuration                  | Aucune variable d'environnement ajoutée                                                                                                                                   |
| Frontend                       | Réseau par `utils/api-client` (services existants) ; page en `React.lazy` ; jamais de `dangerouslySetInnerHTML` : cellules rendues par React                              |
| i18n                           | Fr clé, `npm run i18n:extract` côté web ; marges et alignements en propriétés logiques ; les libellés des descripteurs voyagent en français et passent par `t()` au rendu |
| Barrière « détenu en propre »  | `ownershipType` `TENANT` fixé, jamais de propriétaire tiers ni de mandat dans le corps ; 403 du serveur rapporté par ligne                                                |
| Wiki                           | Mise à jour par le coordinateur (voir ci-dessous) ; `npm run wiki:export` et `wiki:check`                                                                                 |

## Découpage par territoire de fichiers

Un fichier = un seul agent. Ordre : 1 → 2 → (3 ∥ 4) → 5 → 6.

### 1. Moteur : types, valeurs, rapprochement, référentiel

- `apps/web/src/lib/importation/types.ts` : contrat du descripteur étendu (déjà commencé) ;
  résultat de ligne « partielle », état d'exécution d'une ligne, type de l'évaluation de
  quota.
- `apps/web/src/lib/importation/valeurs.ts` : nombres au format français, dates
  `JJ/MM/AAAA` et numéros de série Excel, normalisation (casse, accents, ponctuation) ;
  rejet d'un texte commençant par `=` ou `@`.
- `apps/web/src/lib/importation/rapprochement.ts` : prise en compte de la correspondance
  **exacte** pour un champ de référence ; évaluation de ligne qui rend une erreur de niveau
  ligne explicite (ambigu, inconnu).
- `apps/web/src/lib/importation/referentiel.ts` : chargement des communes
  (`GET /geographic/communes`) et des biens de l'agence (toutes les pages, filtrés sur
  `tenantId`) ; listes fermées `typesBien`, `modesTransaction`, `methodesValorisation`
  sans appel réseau.
- `apps/web/src/lib/importation/index.ts` : exports.

### 2. Lecture du fichier, formules et gabarit

- `apps/web/src/lib/importation/fichier.ts` : lecture `.xlsx` et `.csv` vers `FichierLu` ;
  limites (5 Mo, 1 000 lignes, 60 colonnes, 2 000 caractères par cellule) ; inspection de
  l'archive avant lecture (20 Mo décompressés, 300 entrées) ; refus de `.xlsm`, `.xlsb` et
  de `vbaProject.bin` ; séparateur CSV détecté, UTF-8 strict puis repli windows-1252
  signalé ; écart de la ligne `[EXEMPLE]`. `classeur.ts` reste pour l'import finance.
- `apps/web/src/lib/importation/formules.ts` : lecture du résultat d'une cellule formule ;
  détection d'un texte en `=` ou `@` ; neutralisation sortante des cellules en
  `= + - @` (gabarit et rapport CSV).
- `apps/web/src/lib/importation/gabarit-constantes.ts` : marqueur `[EXEMPLE]` et
  `estLigneExemple` (déjà posés).
- `apps/web/src/lib/importation/gabarits.ts` : génération du `.xlsx` d'une nature
  (en-têtes exacts, ligne d'exemple fictive, feuille « Aide », notes sur les en-têtes, sans
  formule ni macro).
- `apps/web/src/lib/importation/listes-patrimoine.ts` : types de bien ouverts à la création
  (tous les types moins ceux masqués par l'assistant), modes de transaction, méthodes de
  valorisation.

### 3. Natures du patrimoine

- `apps/web/src/lib/importation/natures-patrimoine.ts` : descripteurs « Biens » et
  « Valorisations » (champs de FR-015 et FR-021, règles, doublons, `enregistrer` par les
  deux routes). `natures.ts` (finance) **ne change pas** ; le catalogue du patrimoine est
  exposé à part pour que les huit descripteurs finance et leurs tests restent intacts.
  - Biens : `ownershipType` `TENANT`, devise « CFA », `typeSpecificData.referenceImport`,
    surface obligatoire pour un Terrain, ville rapprochée exactement, empreintes par
    référence et par titre + adresse (existant et fichier), prix d'acquisition suivi de la
    valorisation d'acquisition, résultat « partielle » si seule la seconde route échoue.
  - Valorisations : rattachement par référence (ImmoTopia ou import) ou titre exact,
    ambigu et introuvable refusés, date sans défaut et jamais future, valeur strictement
    positive, doublons dans le fichier seulement, source versée dans les notes.

### 4. Exécution, quota et rapport

- `apps/web/src/lib/importation/execution.ts` : exécution en série avec signal d'arrêt,
  états par ligne (importée, ignorée, en erreur, refusée par le serveur, hors quota, non
  traitée, partielle), interruption propre sur HTTP 429, relance ciblée (refusées
  relançables et non traitées, jamais une partielle). Compatible avec les appels existants
  de l'import finance.
- `apps/web/src/lib/importation/quota.ts` : estimation d'après
  `GET /tenants/:tenantId/entitlements` (capacité `BIENS_DETENUS`, sinon `LOTS` pour les
  biens proposés à la location) ; politiques BLOCK, BILL_OVERAGE, WARN_ONLY, modes
  enforce, warn, off ; abonnement en lecture seule.
- `apps/web/src/lib/importation/rapport.ts` : `LigneRapport`, génération du CSV (séparateur
  `;`, UTF-8 avec BOM, neutralisation de `formules.ts`), correspondance référence du fichier
  ↔ référence attribuée.

### 5. Écran

- `apps/web/src/pages/patrimoine/import/*` : page `ImportationPatrimoine.tsx` et composants
  d'étapes (nature, fichier et gabarit, colonnes, aperçu avec choix « ignorer » ou
  « refuser » les doublons et estimation de quota, exécution avec progression et bouton
  d'arrêt, rapport avec téléchargement CSV et « Relancer »). Parcours calqué sur
  `pages/finance/Importation.tsx`, sans le modifier. Cellules rendues par React, aucune
  écriture dans le stockage du navigateur.

### 6. Navigation

- `apps/web/src/App.tsx` : route `/tenant/:tenantId/patrimoine/importation` en
  `React.lazy`, dans le chunk « patrimoine ».
- `apps/web/src/navigation/model.tsx` et `apps/web/src/navigation/menu-catalog.ts` : entrée
  `patrimoine-import` sous Patrimoine, permissions `PROPERTIES_CREATE` ou `PROPERTIES_EDIT` (au moins une).
- Catalogues i18n web : `npm run i18n:extract`, puis complétude fr/en/ar.

## Tests

Sous `apps/web/src/__tests__/patrimoine/import/`. Les tests de l'import finance existants
ne sont pas modifiés.

| Domaine                      | Cas                                                                                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valeurs                      | nombres français (« 1 250 000,50 »), dates `JJ/MM/AAAA`, numéros de série Excel, normalisation de texte                                                                                                        |
| Lecture de fichier           | `.csv` en `;`, `,` et tabulation ; UTF-8 et repli windows-1252 signalé ; limites (5 Mo, 1 001 lignes, 61 colonnes, cellule de 2 001 caractères) ; archive gonflée ; `.xlsm`, `.xlsb`, `vbaProject.bin` refusés |
| Formules                     | cellule formule lue par son résultat ; texte en `=` ou `@` refusé ; neutralisation sortante de `= + - @` (gabarit et rapport)                                                                                  |
| Gabarit                      | en-têtes exacts par nature, ligne `[EXEMPLE]`, feuille « Aide », aucune formule ; ligne d'exemple écartée à l'import                                                                                           |
| Nature « Biens »             | types fermés, ville exacte (ambiguë et inconnue refusées), Terrain sans surface refusé, date sans prix refusée, corps de requête (`TENANT`, « CFA », `referenceImport`, aucun propriétaire tiers)              |
| Doublons des biens           | par référence (ImmoTopia, import, fichier), par titre + adresse, choix « ignorer » et « refuser »                                                                                                              |
| Nature « Valorisations »     | rattachement par référence et par titre exact ; ambigu et introuvable ; date future, valeur nulle ou négative ; plusieurs valorisations par bien ; doublons dans le fichier                                    |
| Quota                        | BLOCK enforce (hors quota non envoyées), BILL_OVERAGE, WARN_ONLY, warn, off, lecture seule ; `BIENS_DETENUS` sinon `LOTS`                                                                                      |
| Exécution                    | aucune écriture avant validation ; erreur 4xx/5xx n'arrête pas la suite ; 429 interrompt, lignes non traitées ; arrêt manuel ; partielle non relançable ; relance sans doublon                                 |
| Rapport                      | états et motifs par ligne ; CSV complet ; correspondance référence du fichier ↔ référence attribuée                                                                                                            |
| Isolation (`test:isolation`) | valorisation visant un bien d'une autre agence : refus 404                                                                                                                                                     |
| Écran                        | parcours nature → rapport ; étape « colonnes » sautée si rapprochement parfait ; cellule hostile (`<img onerror>`) rendue en texte ; menu visible seulement avec `PROPERTIES_CREATE` ou `PROPERTIES_EDIT`      |
| Non-régression finance       | suites de l'import finance inchangées et vertes                                                                                                                                                                |

## Vérifications de fin

- Vitest ciblé : `apps/web/src/__tests__/patrimoine/import/` et les suites de l'import
  finance.
- `npm run typecheck` (web et API : aucune nouvelle erreur), `npm run lint`,
  `npm run check:architecture`.
- `npm run i18n:extract` dans `apps/web`, puis complétude fr/en/ar ; aucun fichier
  `*.orphans.json` laissé sans report.
- `npm run build` puis `measure:entry` : budget d'entrée de **226 304 o gzip** respecté.
- Wiki : mise à jour de `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx`, puis
  `npm run wiki:export` et `npm run wiki:check`.
- `npm run test:isolation` (cas valorisation inter-agences) ; relecture `code-reviewer` et
  `security-auditor` (lecture de fichier, injection de formule, archive piégée).

## Définition de fini

Tests ciblés verts, vérifications de fin ci-dessus, `HANDOFF.md` à jour par le coordinateur,
wiki des fonctionnalités à jour, statut de la spec passé de « en cours » à « livré » à la
fusion.

## Sous-fonctionnalités à ajouter au wiki (pour le coordinateur)

Fonctionnalité « Patrimoine » :

- Écran « Importer mon patrimoine » (menu Patrimoine, permissions `PROPERTIES_CREATE` ou `PROPERTIES_EDIT`).
- Import en masse de biens de l'agence depuis `.xlsx` ou `.csv`, avec aperçu et correction
  par ligne.
- Import en masse de valorisations rattachées à un bien (référence ou titre exact).
- Gabarit Excel téléchargeable par nature (ligne d'exemple, feuille « Aide »).
- Estimation du quota d'abonnement avant import, lignes « hors quota ».
- Rapport d'import par ligne, téléchargeable en CSV, avec correspondance des références.
- Reprise d'un import interrompu ou partiellement refusé (« Relancer »), sans doublon.
- Aucune route API ajoutée : routes utilisées `POST …/properties`,
  `POST …/properties/:propertyId/valuations`, `GET …/entitlements`,
  `GET /geographic/communes`.

## Risques

- **Fichier partagé avec l'import finance** : `lib/importation` sert deux écrans. Les
  extensions des descripteurs et de l'exécution restent rétrocompatibles ; les tests de
  l'import finance sont rejoués à chaque lot.
- **Limite de requêtes** : 1 000 requêtes par 15 minutes pour toute l'agence ; un fichier
  avec prix d'acquisition peut en consommer deux par ligne. Le 429 est géré (spec §8), pas
  évité.
- **Estimation de quota fausse** : un autre import ou une création simultanée peut consommer
  le restant ; le serveur reste l'autorité et ses refus sont rapportés ligne par ligne.
- **Poids du bundle** : le budget d'entrée est serré (relevé de 225 280 à 226 304 o le
  2026-09-29) ; aucun import statique de l'écran, de `exceljs` ou des descripteurs depuis le
  chunk d'entrée.
- **Contrat de la route de valorisation** : les noms de champs de la valorisation
  d'acquisition (hypothèse de la spec §6) sont à confirmer à la lecture de
  `patrimoine-routes.ts` avant d'écrire le descripteur.
- **Fichiers très partagés** : `App.tsx`, `navigation/model.tsx`, `menu-catalog.ts`,
  catalogues i18n, wiki. Intégrer lot par lot, jamais en parallèle sur le même fichier.
