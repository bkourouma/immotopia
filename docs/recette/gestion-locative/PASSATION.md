# Passation — recette Gestion locative (reprise au 05/11/2026)

## Reprise du 5 novembre — à lire avant la photographie historique

La recette a repris dans le même worktree avec Codex. D31 et maintenance 063–065 sont corrigés ; les onze anomalies RT5 sont retestées avec leur portée détaillée. Premier lot produit poussé : `7e38ae0f`. Les corrections complémentaires et preuves sont dans [REPRISE-2026-11-05.md](REPRISE-2026-11-05.md), [RT5](RETESTS-2026-11-05.md), [finance](RETESTS-FINANCE-2026-11-05.md), [maintenance](RETESTS-MAINTENANCE-2026-11-05.md) et les rapports `COMPLEMENT-*`.

- Cartographie : Serena configuré, MCP non exposé dans ce chat ; Repomix et dependency-cruiser opérationnels. Contrôle des frontières frontend/API réussi.
- `RESULTATS.md` possède désormais un bilan calculable ; `COUVERTURE-A-FINALISER.md` liste les cas partiels ou sans verdict. Le journal ancien annonce P1 terminé, mais les verdicts détaillés du bloc 01 n'ont pas été retrouvés : ne pas inventer leurs réussites.
- Nouveaux constats du 05/11 : tri des signatures corrigé ; filtre Bien du comptable corrigé dans les deux balances avec lookup minimal ; portail Dépôt multibaux (005) corrigé, testé avec récupération après erreur et retesté en Chrome ; trois fiches bloquées incluent le scénario de renouvellement contradictoire avec H39. Consulter le bus et [ANOMALIES.md](ANOMALIES.md) pour l'état actualisé.
- CI du premier lot : API 11 615 et web 4 261 tests réussis. **L'isolation affichait un faux vert** : dix tests échouaient, masqués par `continue-on-error`. Workflow rendu bloquant, messages 403, audit et nettoyage corrigés. Le rejeu LOCAL final passe réellement : **13 suites / 248 tests, code 0**, sur base neuve dédiée. Voir [ISOLATION-CI-2026-11-05.md](ISOLATION-CI-2026-11-05.md) et attendre le nouveau run avant de valider la CI du lot.
- Quota de signatures de l'agence A atteint à 20/20 à l'issue de GL-04-101 : envoi suivant refusé en 409 comme attendu. Cela empêche de nouveaux envois dans la configuration actuelle ; GL-04-115 demande 26 dossiers et GL-08-067 doit être préparé autrement. Aucun achat réalisé.
- API et SMTP relancés depuis les helpers permanents. Le puits SMTP écrivait auparavant dans l'ancien scratchpad : les trois messages manquants ont été copiés sans suppression et les nouveaux arrivent dans `outils/rec/mails`. Santé API 8820 avant chaque essai ; HMR peut prendre 40–80 secondes.
- Sessions : plusieurs connexions simultanées du même compte invalident les anciennes sessions. Répartir ADMIN_A et AGENT_A lorsque les droits le permettent, noter le rôle réellement testé.

**Les sections suivantes décrivent la photographie du 4 novembre. Leurs compteurs et priorités sont historiques ; les documents de reprise ci-dessus et HANDOFF priment pour continuer.**

Ce document permet à un autre agent IA de reprendre la recette du module de
gestion locative là où elle s'est arrêtée. Il complète
[README.md](README.md) (scénario, comptes, gravités) et
[RESULTATS.md](RESULTATS.md) (verdicts par bloc). La constitution du dépôt
reste [AGENTS.md](../../../AGENTS.md), qui prime.

## 1. Où en est-on

| Élément           | Valeur                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Branche           | `orch/2026-11-03-recette-locatif` (worktree `D:\APP\Immobillier\.claude\worktrees\recette-locatif`)                                       |
| Dernier commit    | `4dab3306`, poussé, plus le commit de cette passation                                                                                     |
| Pull request      | [bkourouma/immotopia#193](https://github.com/bkourouma/immotopia/pull/193), **brouillon**, vers `main`. La fusion revient à l'utilisateur |
| Scénario          | 852 cas en 14 fichiers (`01-…` à `14-…`)                                                                                                  |
| Anomalies         | 99 au bus pour cette recette (`BUG-2026-11-03-*`, `BUG-2026-11-04-*`). Le détail suit                                                     |
| Hypothèses métier | H1 à H40, appliquées et listées dans la description de la PR, section « Hypothèses métier à valider »                                     |

État des anomalies :

- **83 passées** : corrigées, puis confirmées au retest.
- **11 prêtes au retest** : corrigées et commitées, pas encore rejouées. Ce sont 008, 036, 047, 055, 056, 057, 058, 059, 060, 061 et 062 (toutes `BUG-2026-11-04-`).
- **3 nouvelles**, sans correction : `BUG-2026-11-04-063`, 064 et 065. Elles ont été trouvées par le dernier testeur des portails, interrompu.
- **2 bloquées** : `BUG-2026-11-03-016` (paramètres financiers lisibles par un TENANT_AGENT) et `BUG-2026-11-03-028` (liste des biens du formulaire de relevé). Lire leur fiche avant d'y toucher.

Aucune anomalie bloquante n'est ouverte.

### Travail interrompu au moment de la passation

1. **Correctif D31, non commité et inachevé** : quatre fichiers modifiés dans le worktree.
   - `apps/web/src/utils/table-export/text.ts` (nouvelle fonction `isDashPlaceholder`) et `build-table.ts` : un « - », « – » ou « — » seul devient une cellule vide à l'export. Sans cela, la neutralisation des formules l'écrit « '- » dans environ 25 colonnes.
   - Tests `apps/web/src/__tests__/primitives/table-export.test.tsx` et `table-export-writers.test.ts` : **2 tests échouent** dans `table-export.test.tsx` (bloc « tiret de remplissage »). Ce peut être le test ou le code : à diagnostiquer.
   - Points D31 non commencés :
     - (b) `PaymentDeclarationsList.tsx`, `getMethodLabel` : `OTHER: 'Autre'` sans `t()` ;
     - (c) portail locataire : `pages/TenantPortal/Dashboard.tsx`, `Lease.tsx`, `Payments.tsx` et `components/TenantPortal/InstallmentDetails.tsx` formatent en dur avec `Intl` sur XOF (« F CFA », montant arrondi), et `pages/TenantPortal/Deposit.tsx` (vers la ligne 215) affiche `deposit.currency` brut. Passer par `formatMontantLocatif` ou `deviseAffichee` (`apps/web/src/lib/rental-labels.ts`).
2. **Retest RT5 des 11 anomalies prêtes** : interrompu par une coupure réseau du modèle avant tout verdict. À relancer en entier.
3. **Testeur P21 (portails 11 et 12)** : interrompu en cours de route.
   - Il a ouvert 063, 064 et 065 (maintenance au portail locataire et à l'agence).
   - Ses scripts et sessions sont dans `outils\pw\b1112\` (voir la section 3).
   - Les cas qu'il a joués ne sont pas consignés dans `RESULTATS.md` : les rejouer.

## 2. Ce qui reste à faire, par priorité

1. **Finir D31** : faire passer les 2 tests, puis les points (b) et (c). Vérifier, commiter, pousser.
2. **Corriger 063, 064 et 065** : lire les fiches dans `D:\APP\Immobillier\.agent-bus\bugs\`. Corriger, tester, mettre la fiche à « prêt au retest ».
3. **Retester** les 11 anomalies prêtes et celles du point 2 : le brief de retest est en section 5. Pour 036, seuls « REC-GL Locataire Pénalités » (+3 200) et « REC-GL Locataire Pénalités 2 » (+2 000) doivent rester en écart. Ce sont des données orphelines d'avant le correctif `739ca2c3`, pas un défaut du calcul.
4. **Jouer les cas restants**, en reprenant les lignes « non joué » de `RESULTATS.md` :
   - 11 : GL-11-060 à 064, 100 à 102, 121, 013 à 015, 017, 031, 034, et les volets non joués de 004, 012, 035 et 120 ;
   - 12 : GL-12-001, 004, 005, 063, 065, 084, 096, 110, 126, et les volets de 010, 012, 020, 021, 040 et 125 ;
   - 04 : une vingtaine de cas (signature, états des lieux) : GL-04-045, 063, 092 à 095, 097, 101, 102, 109 à 115, 117, 118, 120 ;
   - 08 : GL-08-037, 039, 040, 042, 044, 045, 047, 067, 068 ;
   - 09 : GL-09-046 à 048, 018, 033, 041, 042, l'excédent de 030 et le 021 non concluant (deux boutons « Exporter » sur la balance âgée) ;
   - 10 : GL-10-006, 027, 032, 080 ;
   - 14 : GL-14-006 à 008, 016, 022, 027, 030, 033, 035, 037, 038, 043 à 046 ;
   - 02 : GL-02-027 et 049 (assistant de bail à 375 px) ;
   - 03 : GL-03-016 et 062.
5. **Remplir le tableau « Bilan par fichier »** en tête de `RESULTATS.md`, aujourd'hui vide.
6. **Dette déjà listée dans la PR**, à traiter ou à laisser documentée :
   - les autres `throw new Error` de `auth-service.ts` (connexion, vérification, réinitialisation), que le contrôleur lit par message ;
   - `psp_transaction_id` non unique ;
   - pas de plafond au nombre de déclarations ;
   - quelques `process.env.FRONTEND_URL ||` ;
   - `sumPaidOnFutureInstallments` (balance âgée) charge toutes les affectations futures de l'agence.
7. **Clôture** :
   - suites complètes `npm test` puis `npm run test:web`, une à la fois ;
   - `npm run test:isolation` (base `DATABASE_URL_TEST`) ;
   - mettre à jour la description de la PR : cas joués, anomalies, hypothèses, ce qui n'est pas vérifié ;
   - nettoyer les données REC-GL **par l'interface** ;
   - mettre à jour `docs/workflows/HANDOFF.md`.

## 3. Environnement de recette

Tout tourne sur ce poste Windows et sur une **base dédiée** `immotopia_recette_locatif`, qui ne contient aucune donnée réelle. Aucun e-mail ne sort.

| Service    | Port | Configuration `.claude/launch.json` du checkout principal | Lancement manuel                                                                            |
| ---------- | ---- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| SMTP local | 2525 | `rec-gl-smtp`                                             | `node D:/APP/Immobillier/.orchestration/2026-11-03-recette-locatif/outils/rec/rec-smtp.cjs` |
| API        | 8820 | `rec-gl-api`                                              | `node …/outils/rec/rec-env.cjs api` (ts-node-dev du worktree, rechargement à chaud)         |
| Web        | 3320 | `rec-gl-web`                                              | `node …/outils/rec/rec-env.cjs web` (Vite, HMR)                                             |

- Santé de l'API : `http://localhost:8820/health`.
- `rec-env.cjs` **n'est pas un `.env`** : il lit l'environnement de l'API principale, remplace la base par la base dédiée, coupe les envois sortants, active la signature électronique interne (`SIGNATURE_PROVIDER=internal`) et la conversion PDF par LibreOffice. Il n'affiche jamais aucune valeur. Ne jamais lire ni afficher un `.env`.
- Les e-mails sont écrits en `.eml` dans `…\outils\rec\mails\`. On y lit les liens d'invitation, de signature et de paiement.
- Fichiers déposés (preuves, documents) : `…\outils\rec\uploads\`. C'est une copie faite le 04/11. L'API qui tournait jusqu'ici utilisait l'ancien dossier temporaire de session ; une API relancée avec `rec-env.cjs` utilise cette copie.
- `rec-env.cjs createdb` crée la base si elle manque. **Ne jamais lancer `db:seed`** : il efface la base de démonstration.

Le dossier `D:\APP\Immobillier\.orchestration\2026-11-03-recette-locatif\` est local et exclu de git. Il contient :

- `suivi.md` : le journal complet de l'orchestration (lots D1 à D31, testeurs P1 à P21, retests RT1 à RT5, hypothèses H1 à H40, décisions techniques).
- `outils\rec\BRIEF-TESTEUR.md` : brief commun des testeurs (environnement, comptes, règles, bus, format du rapport). Les dates et les révisions qu'il cite sont celles du 03/11 : les donner à jour dans chaque prompt.
- `outils\rec\BRIEF-PLAYWRIGHT.md` : consignes Playwright.
- `outils\pw\lib.cjs` : aides Playwright (`open`, `login`, `text`, `shot`, `done`), avec Chrome du poste en mode sans interface et `playwright-core` dans `outils\pw\node_modules`.
- `outils\pw\<bloc>\` : les scripts de chaque testeur. `outils\pw\ids.json` contient les identifiants des baux de recette.
- `outils\i18n\` : les lots de traduction déjà appliqués, qui servent de modèle de format.
- `outils\pr193-body.md` : la description actuelle de la PR.

Comptes : voir `README.md` et `BRIEF-TESTEUR.md`. Les comptes sont ceux du seed de test, avec un mot de passe de test public commun.

- Agence A : `7ea5ae5e-ccfa-45cb-bebb-899262cbd719`.
- Agence B : `dcae821b-301c-4f6b-b7f2-87fc7bf6fbac`.
- Biens encore libres : REC-GL Bien B02-10 et B02-12. RPT-1 et RPT-2 sont réservés au bloc des rapports.

## 4. Bus des anomalies

À lancer depuis le worktree :

```bash
node scripts/agent-bus.cjs list
```

```bash
node scripts/agent-bus.cjs new-bug --title "…" --priority bloquant|important|mineur --scenario GL-xx-yyy --branch orch/2026-11-03-recette-locatif --sha <révision> --url "<url>"
```

```bash
node scripts/agent-bus.cjs set-state BUG-AAAA-MM-JJ-NNN "<état>" --note "…"
```

- Les fiches sont dans `D:\APP\Immobillier\.agent-bus\bugs\`. Le détail (rôle, étapes, attendu, observé, fréquence) s'ajoute à la fin de la fiche.
- États acceptés : `nouveau`, `en correction`, `prêt au retest`, `passé`, `bloqué`. « échoué au retest » est **refusé** : utiliser `en correction` avec la note « ÉCHOUÉ AU RETEST <sha> : … ».
- Une anomalie n'est retenue que si elle se reproduit deux fois, l'API étant saine.

## 5. Méthode de travail qui a fonctionné

**Rôles**

- Le superviseur découpe, délègue, vérifie, commite et pousse. Il ne développe pas lui-même.
- Les testeurs (`ui-tester`, modèle Sonnet) jouent par Playwright et écrivent seulement dans le bus.
- Les développeurs (`dev-simple` ou `dev-complex`, Sonnet) corrigent sans commiter.

**Prompt d'un testeur.** Il pointe vers les deux briefs, liste les cas exacts, donne :

- la révision testée (`--sha`) et le jour J ;
- les anomalies connues à ne pas recréer ;
- les biens libres et le préfixe `REC-GL` pour toute donnée créée.

Il rappelle les interdits et demande d'arrêter proprement vers 35 cas, en indiquant où reprendre.

**Prompt d'un développeur.** Il fixe le territoire de fichiers (jamais deux agents sur un même fichier), les correctifs avec la fiche du bus, les tests attendus et les commandes de vérification. Il demande :

- d'écrire les nouveaux textes, avec leurs traductions en et ar, dans un fichier de lot plutôt que dans les catalogues ;
- de lancer un seul fichier de test à la fois.

**Interdits à recopier dans chaque prompt d'agent**

- Aucune commande git qui modifie l'arbre ou l'index : `stash`, `checkout`, `reset`, `restore`, `add`, `commit`.
- Aucun lancement d'agent.
- Aucun redémarrage de serveur, aucune écriture directe en base, aucun `.env`.
- S'arrêter et signaler si un fichier semble revenu en arrière.

**Vérification par le superviseur**

- `npx tsc --noEmit -p packages/api` et `-p apps/web` : 0 erreur aujourd'hui.
- `npx eslint` sur les fichiers touchés.
- Les tests ciblés (Jest dans `packages/api`, Vitest dans `apps/web`).
- `npm run check:architecture`.

**Traductions**, après les correctifs :

1. `npm run i18n:extract -w @immotopia/web` (et `-w @immotopia/api`) ;
2. `node apps/web/scripts/i18n-apply.mjs <lot.json>` (format `{ "en": { "<module>": { "<fr>": "…" } }, "ar": … }`), ou `node packages/api/scripts/i18n-apply.mjs <lot.json>` (format plat `{ "en": { "<fr>": "…" }, "ar": … }`) ;
3. `npm run i18n:check -w …`.

Un message Zod, ou un message hors erreur typée, n'est extrait que s'il est une constante précédée de `// @i18n-keys`.

**Classeur des fonctionnalités** : à modifier avec `py -3` et `openpyxl`, jamais avec `exceljs`. Puis `npm run wiki:export` et `npm run wiki:check`. Voir `docs/fonctionnalites/README.md`.

**Commits**

- Messages conventionnels en français, par thème, terminés par la ligne d'attribution de l'environnement.
- Jamais pendant qu'un agent écrit : lint-staged sauvegarde et restaure les fichiers non indexés.
- Jamais `--no-verify`.
- Pousser avec `git push -v origin orch/2026-11-03-recette-locatif`. En cas de refus réseau, rejouer avec `git -c http.postBuffer=524288000 push -v`.

## 6. Pièges rencontrés

- Plus de cinq agents qui testent en même temps saturent le poste. Garder deux ou trois agents au plus : un ou deux testeurs, un ou deux développeurs sur des territoires disjoints.
- Les agents peuvent être coupés par une erreur réseau du modèle (`ENOTFOUND`). On les reprend en leur demandant de relire le bus et leurs fichiers avant de continuer, pour éviter les doublons.
- Un script Playwright peut rester bloqué en arrière-plan. Le chercher et l'arrêter (processus `node` dont la ligne de commande contient le dossier du testeur).
- Une API qui se recharge pendant un test donne 502, 503 ou `ERR_CONNECTION_REFUSED` : attendre et rejouer avant de conclure.
- Le texte français est la clé de traduction : modifier un texte casse sa traduction.
- Les tests du frontend sont lents. Un échec par dépassement de délai ne vaut rien tant que le fichier n'a pas été relancé seul. `src/__tests__/auth/permissions.test.tsx` dépasse 30 s sur deux cas sous charge (préchauffage absent du chunk `AccessDenied`).
- Des données de test ont été modifiées par de nombreux cas. Avant d'ouvrir une anomalie sur un compte « REC-GL Rapports », « Paiements » ou « Caisse », vérifier que l'écart ne vient pas d'un autre cas.
