# Passation de session

Carnet de reprise entre sessions d'agents. **Lire en premier** en début de
session ; **mettre à jour sans l'annoncer** avant de conclure tout tour en
plusieurs étapes (règle posée dans AGENTS.md et CLAUDE.md).

## Mode d'emploi

- Une section par branche, la plus récente en haut. Réécrire la section de sa
  branche au lieu d'empiler des entrées : ce fichier décrit l'état présent, pas
  l'historique (l'historique, c'est `git log`).
- Supprimer la section d'une branche une fois fusionnée dans `main`.
- Dates absolues (`2026-09-27`), jamais « hier ».
- Chaque worktree a sa copie : en cas de conflit à la fusion, garder les deux
  sections de branche, elles sont indépendantes.
- Pas de secret, pas de donnée personnelle, pas de contenu de `.env`.

Modèle de section :

```markdown
## Branche `type/sujet` — AAAA-MM-JJ

**État :** en cours | prêt à relire | bloqué
**Dernier commit :** `abc1234` résumé

Fait :

- …

Reste à faire :

- …

Pièges et décisions :

- …
```

---

## Branche `feat/patrimoine-p4-entites-fiscalite` — 2026-09-28

**État :** prêt à relire — PR #44 vers `main`, CI verte (6/6 jobs)
**Dernier commit :** `61fba4e2` (fusion de `origin/main`, PR #40 incluse) sur `c50a14ee`
(commit unique du lot)

Fait :

- Lot P4 complet (reprise après une coupure d'API du coordinateur précédent au
  moment de lancer les agents de réalisation — le plan détaillé
  (`p4-contrat.md`) et l'implémentation des trois territoires étaient déjà sur
  disque, non commités, à la reprise) : entités détentrices (SCI/holding/
  société/personne physique) avec organigramme, rattachement à un bien par
  quote-part, consolidation patrimoniale par entité ; moteur fiscal pur
  (impôt foncier + impôt sur les revenus fonciers, CI et ML) ; référentiel
  `TaxParameter` (34 paramètres 2026, tous `A_VALIDER`, sourcés CGI/DGI/loi de
  finances) ; 16 routes API ; 3 écrans + section fiscale dans la fiche bien
  avec l'avertissement « estimation indicative, à valider par un conseil
  fiscal » ; wiki (16 sous-fonctionnalités) ; i18n fr/en/ar.
- Relectures `security-auditor` et générale (lecture seule, sonnet) : 0
  bloquant. 1 correction appliquée par `dev-simple` avant le commit : les
  colonnes Bien/Occupation/Propriétaire du référentiel des paramètres
  fiscaux affichaient les codes bruts du moteur au lieu de libellés
  traduits par `t()` (`tax-labels.ts` : `propertyKindSelectorLabel` /
  `occupancySelectorLabel` / `ownerKindSelectorLabel`, gérant le sélecteur
  `ANY` → « Tous »).
- Vérifié avant et après fusion de `origin/main` (PR #40) : typecheck (0
  nouvelle erreur, base 72 préexistantes ailleurs, 0 côté web), 98 tests Jest
  unitaires du module, 8 tests API mockés, suite `isolation.test.ts` complète
  (28 tests dont 5 nouveaux sur `HoldingEntity`), tests Vitest frontend (11
  fichiers, isolés du reste de la suite pour éviter les faux-négatifs par
  contention), `prisma migrate diff --exit-code` sans écart sur une base
  PostgreSQL jetable, `wiki:check` et `check:architecture` verts. Suite
  backend complète post-fusion : 176/182 vertes (5 ignorées, 1 échec
  pré-existant hors périmètre, voir Pièges).

Reste à faire :

- Fusion par l'utilisateur.

Pièges et décisions :

- Fusion de `origin/main` (PR #40 `fix/patrimoine-suite-p0`) : conflit
  uniquement sur le classeur `.xlsx` et son miroir (binaire, un seul agent à
  la fois) — résolu en reprenant la version de `origin/main` (662 lignes,
  dont la nouvelle ligne « Alerter les propriétaires d'un document qui arrive
  à échéance ») puis en réappliquant les 16 lignes P4 par-dessus et en
  relançant `wiki:export`. Aucun autre conflit ; `lib/patrimoine/notifications.ts`
  (hors territoire P4) fusionné automatiquement par git, non retouché.
  Piège d'édition xlsx : `openpyxl` avec `sort_keys=True`/un tri Python
  générique reformate tout le fichier (diff énorme, ordre différent du tri
  français de l'outil `i18n:extract`) — ne jamais retrier les catalogues
  i18n JSON à la main, seulement modifier une valeur en place ou relancer
  `npm run i18n:extract` (idempotent, régénère l'ordre canonique).
- Deux fichiers untracked pré-existants dans ce worktree, **non liés à P4 et
  non commités par ce lot** : `packages/api/src/i18n/locales/{ar,en}.orphans.json`
  (clé orpheline « Document patrimoine introuvable », plus aucune occurrence
  dans le code source actuel). Ils font échouer localement
  `i18n-catalogs-completeness.test.ts` (CI verte car ces fichiers ne sont pas
  commités) — tâche de fond proposée séparément (`task_de0abfd6`) pour
  retrouver la nouvelle clé et reporter la traduction à la main.
- Ce poste est lent pour les tests : un test Vitest isolé peut approcher les
  40 s (timeout par défaut) sans qu'il y ait de bug — toujours relancer seul
  avant de conclure à une régression (confirmé une fois de plus sur
  `property-holding-tax-section.test.tsx` et `patrimoine.entities.routes.test.ts`).

## Pilote — lots Syndic S3 à S5, e-mail de contact, abonnements — 2026-09-27

**État :** prêt à relire ; 5 PR ouvertes, CI verte (#26/#27 relancées après le dernier correctif)
**Dernier commit :** S3 `ec3fceb`, S4 `caaa034`, S5 `5e3dd93`, e-mail `443461b`, journaux `e077830`

Fait :

- PR empilées, à fusionner dans l'ordre : #25 S3 reçus/quittances (base
  `main`) → #26 S4 appels automatiques (base S3) → #27 S5 portail
  copropriétaire (base S4 ; S5 a été empilée sur S4 pour absorber les
  conflits S4↔S5 : limiteurs de débit, routes du portail, wiki).
- Revue de code et audit de sécurité S4/S5 : 0 bloquant ; corrigés : suivi
  mensuel du portail borné aux appels du copropriétaire (moyenne), avis
  d'appel du portail borné à `ownedSince`, limiteurs sur l'exécution
  manuelle et l'avis gestionnaire. Choix produit actés : signature et cachet
  restent sur les quittances servies au portail (même PDF que l'e-mail) ;
  le relevé du portail ouvre sur le solde du compte à la date d'acquisition.
- Recette navigateur sur la démo (`5e3dd93`) : S3, S4, S5 passés ;
  BUG-2026-09-27-009 (appels non notifiés comptés nulle part) corrigé
  (`caaa034`) et retesté. Traduction « Quittance » = « Settlement receipt »
  / « إيصال تسوية » (S3 avait « Statement »).
- #28 : adresse de support `support@immotopia.cloud` (env.example, specs).
  `PLATFORM_ISSUER_EMAIL=support@immotopia.cloud` posé dans `.env`, `.env.demo`
  et l'environnement de production (sauvegarde
  `/home/deployer/immotopia-saas.env.avant-email-20260927`), API de prod
  recréée. Site vitrine : e-mail déployé (`d2a4818`, image de retour
  `immotopia-site:avant-email-20260927`), et avant cela logos/menu/formulations
  (`9b30cbd`, retour `:avant-menu-20260927`).
- #29 : `/app/logs` de l'API de prod sur un volume nommé.
- Abonnements en production (lecture seule) : l'image de prod date du
  2026-09-25, sans garde d'abonnement ; 10 migrations en attente ; aucune
  agence n'a d'abonnement ; Ivoire Résidences n'a que MODULE_AGENCY mais
  utilise 4 copropriétés et 1 chantier ; Agence Immobilière du Mali n'a aucun
  module.

Reste à faire :

- Fusion de #25 → #26 → #27, #28, #29 : décision de l'utilisateur.
- Déployer `main` en production (10 migrations, dont la réécriture des
  paiements Syndic : sauvegarde de base avant), puis attribuer un pack à
  chaque agence, observer les refus en `warn`, enfin
  `SUBSCRIPTION_ENFORCEMENT=enforce` — chaque étape avec accord.
- Découper `SyndicChargeSchedules.tsx` (631 lignes, remarque de revue).
- Pagination « 1–3 sur 3 » non traduite : tâche séparée lancée
  (`fix/pagination-i18n`).
- Hérité : `demo:sync --install` jamais relancé depuis S7 ; protection de
  branche GitHub indisponible.

Pièges et décisions :

- Recréer le conteneur API de prod efface ses journaux (#29 corrige) : les
  refus du garde d'abonnement d'avant le 2026-09-27 18:47 UTC sont perdus.
- Deux jest lourds en parallèle sur ce poste : tout tombe en délai ; lancer
  les suites une par une (`--maxWorkers=4`).
- Un jest orphelin d'une session morte verrouille le moteur Prisma du
  worktree (EPERM au `prisma generate`) : chercher les `node.exe` du worktree.
- `validate-bash.sh` prend `gh pr create --base main` chaîné après `git push`
  pour une poussée vers main : lancer `gh pr create` seul.
- Test web du suivi mensuel du portail : attendre le rendu (`findAllByText`),
  pas seulement l'appel du service ; année courante, jamais 2026 en dur.
- Déploiement du site : `npx tsc --noEmit` local passe grâce au cache
  incrémental alors que `next build` échoue ; vérifier avec
  `--incremental false` ou `npm run build`.
