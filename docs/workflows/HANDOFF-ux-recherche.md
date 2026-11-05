# Passation — chantier « recherche multicritères et ergonomie » (ux-recherche)

> **Reprise Codex le 2026-11-04 :** SYN-B et JOK sont terminés et intégrés
> (`949b1ece`, `d7843e87`), les traductions et le classeur du lot Z sont faits.
> Compilations, lint, architecture, i18n, wiki, budget et contrastes locaux verts ;
> recette ciblée navigateur/CSV/PDF et isolation réelle 129/129 réussies. PERF est écarté.
> Livraison et CI complète : [PR #195](https://github.com/bkourouma/immotopia/pull/195).
> L'état courant, les tests et la suite figurent dans [HANDOFF.md](HANDOFF.md).
> Les sections ci-dessous conservent le contexte et les décisions de la
> passation initiale ; leurs listes « à faire » décrivent l'arrêt de Claude.

Arrêté le **2026-11-04 vers 21 h** à la demande de l'utilisateur, pour être repris par une autre IA, éventuellement sur une autre plateforme. Ce document est autonome : il ne suppose ni Claude Code, ni le poste Windows d'origine, ni les fichiers locaux de la session précédente, qui sont perdus pour le repreneur.

Lire aussi, dans cet ordre :

1. `AGENTS.md`, la constitution du dépôt, qui prime sur tout le reste ;
2. `docs/architecture/recherche-listes.md`, le guide du composant de recherche et ses pièges (§10) ;
3. `docs/architecture/i18n.md`.

---

## 1. En deux minutes

**Demande de l'utilisateur** (Baba, fondateur d'ImmoTopia) :

- permettre de trouver l'information très facilement sur chaque écran ;
- poser un module de recherche multicritères au-dessus de chaque tableau ;
- réorganiser les modules qui empilent plusieurs longs tableaux ;
- rendre la comptabilité (journaux, grand livre, balance) rapide et exploitable ;
- rendre toute l'interface « extrêmement user friendly ».

**État au 2026-11-04 :**

| Élément                                                 | État                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Branche d'intégration `orch/2026-11-03-ux-recherche`    | poussée, tête `c1249d5a`. 16 fusions de lots, typecheck web et API à 0 erreur, `check:architecture` vert à chaque fusion. |
| Lots SYN-B, PERF, JOK                                   | **interrompus**, chacun commité en l'état (`wip(...)`) sur sa branche. **Rien n'y est vérifié.**                          |
| Lot final Z (traductions, catalogue IA, classeur, docs) | pas commencé                                                                                                              |
| Pull request vers `main`                                | **aucune**. La fusion reste à l'utilisateur.                                                                              |

**Ordre conseillé pour reprendre :**

1. Finir et vérifier SYN-B, puis le fusionner dans l'intégration (§6.1).
2. Finir la phase 1 de JOK, faire sa phase 2 (après SYN-B), vérifier, fusionner (§6.3).
3. PERF : le terminer et le mesurer, ou l'abandonner (§6.2). Il est facultatif.
4. Lot Z (§7).
5. Vérification complète de l'intégration, relecture de code et de sécurité, PR (§8).

---

## 2. Dépôt et branches

- Dépôt : `github.com/bkourouma/immotopia`.
- Base : `main` @ `6be7f91a`. `main` n'a pas bougé depuis le début du chantier (vérifié le 2026-11-04).
- Intégration : `orch/2026-11-03-ux-recherche`. Par rapport à `main` : 57 commits, 643 fichiers, +65 809 / −18 251 lignes.
- PR ouverte d'une autre session : #193 `orch/2026-11-03-recette-locatif` (« Recette gestion locative »). Elle touche les mêmes fichiers que plusieurs lots : `pages/rental/*`, services rental de l'API, `tenant-portal-controller`, portails `OwnerPortal/*` et `TenantPortal/*`, `hooks/useListParams.ts`, `Caisse`/`CompteProprietaire`/`CommissionsAgents`, `HomeFeeds`, `OwnerStatementsPage`. Les lots ont gardé un diff minimal sur ces fichiers. **La PR fusionnée en second résout les conflits.**

| Branche                                                                             | Tête       | État                                                           |
| ----------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| `orch/2026-11-03-ux-recherche`                                                      | `c1249d5a` | intégration, à jour                                            |
| `orch/2026-11-03-ux-recherche-lot-syn-b`                                            | `c692fb8c` | **wip**, part de `e3168041` (intégration avant PAT et RET)     |
| `orch/2026-11-03-ux-recherche-lot-perf`                                             | `58ca023e` | **wip**, part de `e3168041`                                    |
| `orch/2026-11-03-ux-recherche-lot-jok`                                              | `0da76a7d` | **wip**, part de `c1249d5a`                                    |
| `orch/2026-11-03-ux-recherche-lot-{0,compta,fin-a,fin-b,syn-a,loc,pat,por,div,ret}` | —          | déjà fusionnées dans l'intégration ; gardées pour l'historique |

Méthode suivie :

- une branche par lot, partie de l'intégration ;
- vérification indépendante par un relecteur qui ne modifie rien ;
- commits conventionnels en français ;
- `git merge --no-ff` dans l'intégration, puis poussée ;
- jamais de poussée sur `main`, jamais de `--force` ni de `--no-verify` ;
- le hook Lefthook `pre-commit` lance `lint-staged`, et un refus se corrige.

---

## 3. Ce qui est livré (fusionné dans l'intégration)

| Lot                         | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Fusion                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **0 — Fondation**           | Composant `apps/web/src/components/primitives/ListSearch.tsx`, hooks `useListSearch` (mode serveur : critères → paramètres d'API, état dans l'URL avec préfixe par tableau, `clampPage`, `ariaLabel`) et `useLocalListSearch` (filtrage local insensible à la casse et aux accents), `utils/list-search/**`, `useListParams.setPage(page, {replace})`. API : `packages/api/src/utils/list-query-schemas.ts` (`zSearch`, `zCsvEnum`, `zDay`, `dayStart`, `dayEnd`, `dayRange`, `zAmount`, `zId`, `dayOrderRefinement`). Guide : `docs/architecture/recherche-listes.md`. | `5fd0661d`, `b71ab544`             |
| **C — Comptabilité agence** | Synchronisation des écritures non bloquante (jusqu'à 1 min de retard, bouton « Actualiser les écritures » ; les exports restent toujours à jour), comptabilité en sous-pages, pagination serveur, grand livre **par compte** avec solde progressif, balance. Index de lecture (migration `20261103100000_accounting_read_indexes`, sans `CONCURRENTLY` car Prisma exécute en transaction, et avec un index partiel en SQL brut). Recherche multicritères sur les quatre sous-pages.                                                                                     | `67c4bdaf`, `be1eeaff`             |
| **DIV**                     | CRM (contacts, affaires, pipeline), administration, notifications, signatures, messagerie, newsletter, maintenance, agence, accueil. Les filtres CRM, jusque-là envoyés mais ignorés par l'API, sont appliqués (H9).                                                                                                                                                                                                                                                                                                                                                    | `8504a9f5`, `6dbc13d3`             |
| **POR**                     | Portails propriétaire, locataire, copropriétaire. **Faille existante corrigée** : sur le portail propriétaire, un `propertyId` reçu remplaçait le périmètre, ce qui rendait visibles les baux, tickets et documents d'un autre propriétaire de l'agence. Sélection d'échéances du paiement en ligne limitée à 24, montant recalé au rechargement.                                                                                                                                                                                                                       | `f3d4881e`, `39d744c6`, `4fcb377b` |
| **FIN-B**                   | Facturation, trésorerie, caisse (recherche sans accents), balances clients et fournisseurs, relevé de compte (recherche libre avec un vrai « Solde après » et la mention « Lignes filtrées », H5), file de validation, reversements, salaires.                                                                                                                                                                                                                                                                                                                          | `54c13975`, `48fef0fa`             |
| **FIN-A**                   | Chantiers, fournisseurs, commandes, baux de terrain, tâcherons, stock (état, journal, preneurs, alertes). Plafonds de quatre tests jsdom lents relevés.                                                                                                                                                                                                                                                                                                                                                                                                                 | `d97baa74`                         |
| **LOC**                     | Locatif (baux, échéances, paiements et déclarations, pénalités, documents, prélèvements : mandats, remises, rejets), biens (liste avec filtrage serveur, onglets de la fiche), assurance (sinistres), ventes (mandats, offres, commissions, sélecteurs distants). Les onglets lourds sont démontés quand on les quitte, sauf ceux qui portent une saisie (`withTabLifecycle`, `LEASE_KEEP_MOUNTED_TABS`, `PROPERTY_KEEP_MOUNTED_TABS`).                                                                                                                                 | `4f6979a5`                         |
| **SYN-A**                   | Syndic, partie finances : appels de fonds, paiements reçus, retards (nombre de relances calculé par l'API en une requête), relances, pénalités, échéanciers, budgets, compte copropriétaire, quittances, déclarations, paiements en ligne, reversements, prélèvements. Comptabilité de la copropriété en onglets paginés par le serveur (écritures, grand livre par compte, balance en SQL, plan comptable complet, journaux).                                                                                                                                          | `e3168041`                         |
| **PAT**                     | Patrimoine : actifs, valorisations, dettes, entités, régularisations foncières, programmes de travaux, relevés propriétaire, paramètres fiscaux, rapport d'import, accès partagés et journal d'accès. L'onglet patrimoine du bien est organisé par rubriques. Pages publiques (accès partagé, rapport mensuel) : recherche locale, et l'impression (bouton, Ctrl+P, repli `matchMedia('print')`) rend toutes les lignes. Composants morts supprimés.                                                                                                                    | `ddf4fc81`                         |
| **RET**                     | Recherche dans l'onglet Documents du bien (préfixe d'URL `pdoc.`). Onglet États des lieux du bail gardé monté. Plafond de 120 s pour un test lent de compromis.                                                                                                                                                                                                                                                                                                                                                                                                         | `c1249d5a`                         |

**Règle commune à tous les lots :** une liste plafonnée par l'API affiche un bandeau `t('…')` quand le plafond est atteint (par exemple 500 mandats, 200 sinistres, 5 000 appels de fonds, 200 reversements). Une liste plafonnée sans bandeau était un défaut **bloquant**.

---

## 4. Décisions de l'utilisateur (hypothèses métier)

| Id  | Sujet                                                  | Décision                                                                                                                           |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Fraîcheur des écritures de la comptabilité agence      | Jusqu'à 1 min de retard, bouton « Actualiser les écritures », exports toujours à jour : **validée**                                |
| H2  | Exercice comptable                                     | Année civile ; période par défaut du 1er janvier à aujourd'hui : **validée**                                                       |
| H3  | Totaux du journal filtré par compte                    | Toutes les lignes des écritures retenues (débit = crédit) : **validée**                                                            |
| H4  | Solde du grand livre filtré                            | Vrai solde du compte, plus la mention « Lignes filtrées » avec leurs propres débit et crédit : **validée**                         |
| H5  | Recherche sur le relevé de compte                      | **Refusée** puis corrigée : recherche libre voulue, « Solde après » = vrai solde de la suite complète, mention « Lignes filtrées » |
| H6  | Validation en lot paginée                              | Sélection limitée à la page, vidée au changement de page ou de filtre : **validée**                                                |
| H7  | Sessions de caisse anciennes sans compte de trésorerie | Exclues du filtre par compte (égalité stricte) : **validée**                                                                       |
| H8  | Balances clients filtrées                              | Totaux sur les lignes retenues : **validée**                                                                                       |
| H9  | Filtres CRM ignorés par l'API jusqu'ici                | Désormais appliqués ; plusieurs étiquettes = « au moins une » : **validée**                                                        |
| H10 | Types d'affaire du filtre                              | Les 5 types que crée `DealForm` ; « Rendez-vous » retiré : **validée**                                                             |
| H11 | Recherche de conversations par un client de portail    | **Changée** : titre plus noms des participants (jamais e-mail ni téléphone), toujours bornée à ses conversations                   |
| H12 | StockPreneurs, liste par défaut                        | Tous les preneurs (actifs et désactivés) tant qu'aucun statut n'est choisi : **validée**                                           |
| H13 | Balance fournisseurs filtrée                           | « Total de contrôle » serveur masqué quand la liste est réduite : **validée**                                                      |

Autres arbitrages, pris par prudence et à mentionner dans la PR :

- les dates `aaaa-mm-jj` sont strictes sur les paiements et déclarations locatifs et sur le syndic ;
- la recherche à plusieurs mots ne découpe pas les mots ;
- le syndic garde le 403 `TENANT_ISOLATION_ERROR` existant ;
- la liste des paiements reçus du syndic ne lit que les 5 000 appels de fonds les plus anciens par échéance, avec un bandeau qui le dit. Une route paginée côté serveur reste à faire.

---

## 5. Règles du chantier (à respecter par la suite)

Elles s'ajoutent à `AGENTS.md`.

**Recherche.**

- Au-dessus de chaque tableau ou liste de plus de quelques lignes, utiliser `ListSearch` du lot 0, jamais une barre maison.
- Un champ libre cherche dans toutes les colonnes textuelles utiles. Chaque colonne discriminante a son critère (statut, type, période, montant min/max, entité liée, booléens). Les critères secondaires vont sous « Plus de critères ».
- **Liste paginée par le serveur** : les critères partent à l'API. Si l'API ne sait pas filtrer, on ajoute le paramètre à la route existante. Jamais de filtrage local d'une page reçue du serveur.
- **Liste reçue en entier** (volume borné, pas de `take` ni de plafond côté API) : filtrage local avec `useLocalListSearch`.
- L'état vit dans l'URL. S'il y a plusieurs tableaux sur un écran, chacun a un préfixe d'URL (`paramPrefix`), et un changement d'onglet purge les clés des autres onglets.
- L'export exporte ce que la recherche affiche.
- L'écran distingue « aucune donnée » de « aucun résultat pour ces critères », qui propose un bouton Effacer.
- Les petits tableaux de détail (≤ 10 lignes) n'ont pas de barre.

**Écrans lourds.**

- Sections en onglets ou sous-pages paresseuses : une requête ne part qu'à l'affichage.
- Pagination dès ~50 lignes.
- Les sélecteurs utilisent la recherche distante (`showSearch`, `limit` ≤ 20) au lieu d'un `limit: 500`.
- Aucun changement de calcul, de montant, de droit ou de règle métier.

**API.**

- Le paramètre libre s'appelle `search` (côté URL du front : `q`).
- Validation Zod via `list-query-schemas.ts` : un paramètre invalide donne un 400, jamais un 500.
- `tenantId` figure dans chaque `where`. Un identifiant reçu en filtre reste dans le périmètre de l'agence.
- Un test unitaire par filtre ajouté.
- Pas de nouvelle route ni de migration sans nécessité. Une nouvelle route impose `routes-inventory`, `route-features` et `ai:catalog`.

**Front.**

- `t('Texte français')` : le texte français est la clé.
- Marges en propriétés logiques.
- Réseau via `utils/api-client`.
- Jamais de `dangerouslySetInnerHTML`.
- Au moins un test de recherche par écran converti.

**Discipline.**

- Plusieurs agents en parallèle : jamais deux sur le même fichier.
- Les vérifications lourdes passent une à une (le poste d'origine saturait).
- Les catalogues i18n, `ai:catalog` et le classeur ne se touchent que dans le lot Z.

---

## 6. Lots interrompus : état et suite

Les trois branches `wip` ont été commitées telles quelles à l'arrêt. Le hook `lint-staged` est passé (ESLint `--fix` et Prettier sur les fichiers indexés). **Aucun typecheck, ni lint complet, ni série de tests n'a été conclu sur ces états.** Les relire avant de s'y fier.

### 6.1 SYN-B — Syndic : copropriétés, lots, prestataires, assemblées, documents

Branche `orch/2026-11-03-ux-recherche-lot-syn-b` @ `c692fb8c` : 71 fichiers, +5 937 / −1 630. Elle part de `e3168041` ; la fusionner d'abord avec l'intégration actuelle, qui a reçu PAT et RET sur d'autres fichiers.

**Périmètre prévu.**

- Écrans :
  - `pages/syndics/` : `SyndicsList`, `SyndicDetail` (LotTable, LotTypeRatesCard), `SyndicLots`, `SyndicMandatingAgencies`, `SyndicMeetings`, `SyndicMeetingDetail`, `SyndicProfilesIncidents` (4 tableaux empilés, à mettre en onglets paresseux `?tab=`), `SyndicProviders`, `SyndicDocuments`, `SyndicMonthlyTracking` ;
  - `components/syndics/` : `ContractList`, `ProviderList`, `ProviderInvoicesTab`, `ProviderInvoiceDrawer`, `LinkedProviderInvoices`, `DocumentVault`, `MeetingProxies`, `VoteBoard`, `live/LiveLotsTable`, `live/LiveParticipantsTable`, `visio/*`.
- API :
  - `search` (et paramètres facultatifs) sur `/lots`, prestataires, contrats, factures de prestataires ;
  - `search` sur `/portal/copropriete/quittances` et `/portal/copropriete/paiements-declares`.
- Ajouter `{ id: 'asc' }` en dernier critère de l'`orderBy` de `listChargeCallsBySyndicate` (`lib/syndics/queries.ts`, ~l. 1520), pour que la pagination ne double ni ne saute de ligne.

**Déjà dans le commit** (à vérifier un par un) :

- la plupart des écrans ci-dessus et leurs tests, dont de nombreux fichiers `__tests__/syndics/*Search.test.tsx` neufs ;
- `components/syndics/profiles/` (nouveau) ;
- pages du portail copropriétaire `CoOwnerPortal/Payments.tsx` et `Receipts.tsx` ;
- côté API : `syndic-controller.ts`, `lib/syndics/{queries,schemas,provider-invoices,provider-invoice-schemas,coowner-portal-finance,coowner-portal-schemas}.ts`, `declared-payment/{declaration-queries,portal,request-schemas}.ts`, et les tests unitaires `syndic-lots-search`, `syndic-provider-invoice-search`, `coowner-portal-search`.

Au moment de l'arrêt, le chef de lot faisait tourner les tests `MeetingsSearch` et `LiveTablesSearch`. Le travail était donc avancé, mais on ne sait pas s'il était complet.

**Critères pour finir.**

- Console d'AG en direct (`live/**`, rafraîchie par polling) : la recherche y est locale seulement. Aucune requête ne s'ajoute au cycle de polling, et la saisie comme la page survivent au rafraîchissement.
- Les sélecteurs de lots ailleurs (`DeclarationsTable`, `SyndicMandatesCard`, `PrintReceiptsModal`…) appellent `listSyndicateLots` sans paramètre. Leur comportement par défaut ne doit pas changer.
- Portail copropriétaire : le périmètre reste celui du copropriétaire connecté, jamais un identifiant reçu. Rien d'un autre copropriétaire n'apparaît dans les résultats.
- Bandeau quand une liste atteint le plafond de l'API.
- Aucun changement de vote, de quorum, de tantièmes ni de calcul.
- Ne pas modifier `packages/api/src/utils/list-query-schemas.ts` (domaine de JOK).
- Clôture verte : typecheck web et API, lint, `check:architecture`, jest ciblé (avec `routes-inventory`), vitest des fichiers `__tests__/syndics/**` et `__tests__/coowner-portal/**` touchés.
- Relecture indépendante, puis fusion dans l'intégration.

### 6.2 PERF — coût de rendu des barres de recherche (facultatif)

Branche `orch/2026-11-03-ux-recherche-lot-perf` @ `58ca023e`. Elle part de `e3168041`.

**Constat.**

- En jsdom, les fichiers `apps/web/src/__tests__/finance/stock.test.tsx` (~100 tests, ~1 500 s) et `tacherons.test.tsx` sont très lents : 20 à 65 s par test. Ils dépassent leur plafond au hasard selon la charge.
- Une mesure avant et après le lot FIN-A a donné +13 à 25 % de rendu, sans boucle de rendu ni requête répétée.
- Dans un vrai navigateur, l'effet est probablement négligeable. Le problème touche surtout la fiabilité des tests. Les tests web ne sont pas dans la CI.

**Contenu du commit.**

- `hooks/useListSearch.ts` : `dataSignature`, `displaySignature`, valeurs et `filterParams` mémoïsés.
- `ListSearch.tsx`, `list-search/controls.tsx`, `list-search/parts.tsx` : mémoïsations.
- `pages/finance/Stock.tsx` : `OngletEtat` en `React.memo`, critères mémoïsés.
- `pages/finance/Tacheron.tsx` : idem.
- Nouveau test `__tests__/primitives/list-search-renders.test.tsx` qui compte les rendus.
- Les tests jetables de profilage (`zz-profil-*`) n'ont pas été commités.

**À faire.**

- Mesurer, à charge comparable, les mêmes tests avant (intégration) et après (branche), et produire un tableau par test.
- Passer **tous** les tests des primitives et un échantillon d'écrans de chaque module (finance, rental, syndics, crm, portails) : ces primitives servent à tout le chantier.
- Si le gain n'est pas démontré ou si une régression apparaît : abandonner la branche, rien n'en dépend.
- Ne pas relever `testTimeout` dans `vite.config.ts`.

### 6.3 JOK — les jokers `%` et `_` cherchés tels quels

Branche `orch/2026-11-03-ux-recherche-lot-jok` @ `0da76a7d` : 48 fichiers, +585 / −126. Elle part de `c1249d5a`.

**Défaut.** Prisma 5.22 passe `contains`, `startsWith` et `endsWith` tels quels à `LIKE`/`ILIKE`. Un `%` ou un `_` saisi joue donc le joker : « 100% » trouve tout ce qui contient « 100 », « lot_7 » trouve « lotA7 ». Le SQL brut de la comptabilité agence (`lib/accounting-exports/queries/sql.ts`) et celui du syndic (`lib/syndics/accounting-reads.ts`) échappaient déjà ces caractères.

**Contenu du commit (phase 1, hors fichiers du syndic).**

- Helper unique `packages/api/src/utils/like-escape.ts` : `escapeLike()` échappe `\`, puis `%` et `_`, par `\`, caractère d'échappement par défaut de PostgreSQL. Il est réexporté par `list-query-schemas.ts` et réutilisé par `accounting-exports/queries/sql.ts`.
- Application dans 46 fichiers : services CRM, contacts, biens, locatif, prélèvements, finance et stock, trésorerie, messagerie, notifications, patrimoine, assurance, newsletter, maintenance, audit, portails propriétaire et locataire, signatures, factures plateforme…
- Tests créés et **pas encore exécutés** : `__tests__/unit/like-escape.test.ts`, `like-escape-lib.test.ts`, `like-escape-services.test.ts`, `__tests__/integration/like-escape-sql.test.ts`.

**À faire, phase 1.**

- Vérifier que **chaque** usage échappé reçoit bien une saisie de l'utilisateur, et qu'aucun préfixe calculé par le code n'est échappé (génération de références ou de numéros, par exemple `property-reference-generator`, `rental-lease-number`, `subscription-provisioning`). Lister les usages laissés tels quels avec fichier:ligne.
- Contrôler qu'aucun résultat ne change pour une recherche sans `%`, `_` ni `\`.
- Exécuter les tests unitaires, puis le test d'intégration SQL sur une base **dédiée**, via `DATABASE_URL_TEST` et `npm run test:isolation` (voir `__tests__/helpers/run-isolation-tests.js`). Jamais sur la production.

**À faire, phase 2, après la fusion de SYN-B.**

- Appliquer `escapeLike` dans `lib/syndics/**` (notamment `accounting-reads.ts` ~l. 195-199 et ~l. 532-538, `buildJournalEntriesWhere`), `lib/direct-debit/syndic/**`, `services/syndic-*.ts` et le portail copropriétaire.
- Passer en `it` les **9 `it.failing`** de `packages/api/__tests__/integration/syndic-accounting-reads-sql.test.ts`. Ils décrivent exactement le défaut.
- Ajouter `syndic-accounting-reads-sql.test.ts`, `accounting-exports-sql.test.ts` et `like-escape-sql.test.ts` à `packages/api/__tests__/helpers/run-isolation-tests.js`.
- Supprimer le code mort des anciennes lectures comptables du syndic si plus rien ne l'appelle : `listJournalEntriesBySyndicate`, `getTrialBalanceBySyndicate`, `getGeneralLedgerBySyndicate`, `listChartOfAccountsBySyndicate` dans `lib/syndics/queries.ts`, les schémas `accountingEntriesQuerySchema` et `accountingRangeQuerySchema` de `schemas.ts`, et leurs tests.

---

## 7. Lot Z — finitions transverses (pas commencé)

À faire après la fusion de tous les autres lots, dans une branche partie de l'intégration complète :

1. **Traductions web et API.**
   - Lancer `npm run i18n:extract` dans `apps/web` puis dans `packages/api`.
   - Compléter `en` et `ar` pour **chaque** clé nouvelle. Le texte français est la clé.
   - Traiter les fichiers `*.orphans.json` : une clé devenue orpheline parce que son texte français a été retouché garde sa traduction, à reporter sur la nouvelle clé. Exemple connu : « La date de debut doit preceder la date de fin » est devenu « La date de début doit être antérieure ou égale à la date de fin. ».
   - `npm run i18n:check` doit passer, web et API.
2. **Libellés encore en dur.**
   - Envelopper dans `t()` les libellés hérités des portails (propriétaire, locataire, copropriétaire) et tout libellé visible dans les fichiers du chantier (`git diff --name-only origin/main...HEAD`).
   - Ne pas toucher aux valeurs envoyées à l'API ni aux fixtures de tests.
3. **Catalogue IA.** Lancer `npm run ai:catalog -w @immotopia/api` (les paramètres des routes ont changé) et commiter le fichier régénéré.
4. **Classeur des fonctionnalités** `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx` (procédure dans `docs/fonctionnalites/README.md`).
   - Mettre à jour les sous-fonctionnalités de consultation des listes qui ont gagné une recherche ou de nouveaux paramètres d'API (colonnes « Donnees attendues (entree) » et « Route API »). Ajouter « Rechercher et filtrer … » quand la consultation n'existe pas.
   - Mettre à jour les écrans restructurés : comptabilité agence en sous-pages, comptabilité du syndic en onglets, grand livre par compte, balances.
   - Utiliser uniquement les domaines existants. Étendre la référence du tableau nommé `SousFonctionnalites`.
   - Lancer ensuite `npm run wiki:export` et `npm run wiki:check` (bloquant en CI).
5. **Mesures de la CI.** `npm run measure:entry -w @immotopia/web` ne doit montrer aucune régression du point d'entrée. `npm run a11y:contrast` doit passer.
6. **Documentation.** Mettre `docs/architecture/recherche-listes.md` à jour avec l'état final : optimisations de PERF si elles sont gardées, `escapeLike` de JOK, règle du bandeau de plafond, `withTabLifecycle`.

---

## 8. Fin du chantier

1. Vérification complète de l'intégration :
   - `npm run typecheck` (0 erreur aujourd'hui, web et API : n'en ajouter aucune) ;
   - `npm run lint` (0 erreur, des milliers d'avertissements préexistants) ;
   - `npm run check:architecture`, `npm test` (backend), `npm run wiki:check`, `npm run build`, `npm run a11y:contrast`, `npm run measure:entry -w @immotopia/web` ;
   - les tests web : `npm run test:web`, de préférence par dossiers ; voir les pièges §9.
2. Relecture de code, puis audit de sécurité, sur le diff complet. Priorités :
   - isolation entre agences : chaque nouveau filtre, chaque identifiant reçu ;
   - portails : périmètre du client connecté, faille corrigée par POR ;
   - paiements en ligne et sélection d'échéances ;
   - fichiers privés ;
   - SQL brut.
3. PR `orch/2026-11-03-ux-recherche` → `main`, rédigée en français. Contenu :
   - contexte, lots livrés, résultats des tests, hypothèses H1 à H13 ;
   - mise à jour du classeur des fonctionnalités ;
   - points d'attention (§8.1) ;
   - ce qui n'a pas été vérifié.
4. **La fusion, le déploiement et toute action sur une base réelle restent à l'utilisateur.**

### 8.1 Points d'attention à mettre dans la PR

- **Migration d'index** `20261103100000_accounting_read_indexes` : sans `CONCURRENTLY` (Prisma l'exécute en transaction), avec un index partiel en SQL brut invisible pour Prisma. `prisma generate` est nécessaire au déploiement. Les index se construisent avec verrou sur `journal_entries` et `journal_entry_lines` : à passer en heure creuse sur une grosse base.
- **Comptabilité agence** :
  - synchronisation en mémoire, non bloquante, jusqu'à 1 min de retard (H1) ;
  - la première passe de la caisse a un coût ;
  - le relevé n'accepte que des dates réelles (`from=2026-02-31` renvoie 400).
- **Recherches `contains` sans index trigramme** : une lenteur est possible sur de très gros volumes.
- **Recherche à plusieurs mots** : pas de découpage, comportement transverse.
- **Dates `aaaa-mm-jj` strictes** (locatif, syndic) : un ancien appelant qui envoie une date-heure ISO reçoit maintenant un 400. Aucun appelant interne trouvé.
- **Plafonds signalés par bandeau** : 500 mandats, 200 sinistres, 500 actifs, 500 accès partagés, 100 événements de journal d'accès, 5 000 appels de fonds pour les paiements reçus du syndic (les plus anciens), 200 reversements.
- **Faille de portail corrigée** (POR, propriétaire) : à signaler en clair.
- **Syndic** : 403 `TENANT_ISOLATION_ERROR` conservé. Paramètres invalides désormais en 400 (`status` de `/charges`, compte lot), alors qu'ils étaient ignorés avant.
- **Taille de page** : `limit` > 100 renvoie 400 sur les programmes de travaux et les relevés propriétaire. Ces écrans plafonnent à 100.
- **Restes notés par les lots** :
  - catalogue d'articles sans plafond ;
  - fournisseurs sans `search` côté API ;
  - `listDeals` sans `search` ;
  - `listContacts` sans filtre par rôle (le filtre propriétaire des relevés ne voit que 20 contacts) ;
  - pénalités non paginées hors d'un bail ;
  - `AdvancedContactSearch`.
- **Conflits attendus avec la PR #193** (voir §2).
- Les tests web ne sont pas dans la CI, et plusieurs fichiers jsdom très lents ont vu leur plafond relevé (§9).

---

## 9. Pièges rencontrés

- **Jest** : toujours `--runInBand --forceExit`. Sans `--forceExit`, la file d'audit (`audit-service`, `flushAuditQueue`) garde le processus ouvert indéfiniment ; trois processus figés ont tourné une nuit entière.
- **Vitest** : sous charge, des tests jsdom lents (`finance/stock`, `finance/tacherons`, `sales/agreement-complete`, `rental/lease-inspections`, `patrimoine/projections-page`, `patrimoine/asset-valuations-suggest`) échouent par dépassement de délai. Un échec par timeout ne prouve rien tant que le fichier n'a pas tourné **seul** (`--maxWorkers=1`). Les plafonds explicites passés en dernier argument d'un `it` l'emportent sur `--testTimeout`.
- **Vitest** refuse tout import qu'un `vi.mock` ne déclare pas. Les tests tournent en français (`setupTests.ts`).
- **antd 6** : `destroyOnHidden` posé sur `<Tabs>` l'emporte sur celui d'un onglet. On le pose onglet par onglet (`withTabLifecycle`), sinon une saisie se perd au changement d'onglet.
- **Taille de page** : `useListParams` lit `limit` depuis l'URL. Une URL modifiée à la main peut dépasser le maximum de l'API (100). On plafonne dans l'écran, pas dans le hook commun.
- **i18n** : modifier un texte français casse sa traduction (la clé, c'est le texte). Voir les orphelins.
- **Prisma `contains`** n'échappe pas les jokers (voir JOK).
- **Fins de ligne** : le dépôt mélange LF et CRLF. Git normalise, mais un outil qui réécrit un fichier entier peut gonfler un diff : comparer avec `--ignore-cr-at-eol`.
- **Base de test** : les tests d'intégration SQL exigent une base PostgreSQL dédiée (`DATABASE_URL_TEST`). Ne jamais pointer une base de démo ni de production. `npm run db:seed` efface la base de démonstration.
- **Poste d'origine (Windows)** : le travail se faisait dans des worktrees avec des jonctions `node_modules` vers une installation unique. Toujours retirer les jonctions avant `git worktree remove`, sinon on vide `node_modules` ailleurs. Sans objet sur une autre plateforme.

---

## 10. Consommation (indicatif)

Le chantier a mobilisé :

- des chefs de lot Opus, à la demande explicite de l'utilisateur ;
- des exécutants et des vérificateurs Sonnet ;
- un expert Opus (SQL du grand livre et de la balance du syndic) ;
- quelques tâches Haiku.

Ordre de grandeur par lot, exécutants compris :

- de 1,7 M à 3,1 M de jetons pour FIN-A, FIN-B, LOC, PAT et SYN-A ;
- environ 2,3 M pour POR ;
- moins de 0,5 M pour les petits lots (RET, plafonds FIN-A, correctifs).
