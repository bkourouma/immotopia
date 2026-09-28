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

## Branche `feat/patrimoine-p5-portail` — 2026-09-28

**État :** prêt à relire — PR vers `main` ouverte par ce tour (voir `gh pr list --head feat/patrimoine-p5-portail`), CI à suivre, à fusionner par l'utilisateur
**Dernier commit :** voir `git log -1` sur la branche (feat(patrimoine): vue patrimoine dans le portail propriétaire)

Reprise : le tour précédent avait tout implémenté mais s'est arrêté avant de
committer (limite d'API) — la branche était encore au niveau de PR #38, 7
commits derrière `main` (PR #39 provisionnement, #40 patrimoine-suite-p0).
Ce tour a relu (`security-auditor` + relecture générale, aucun bloquant, un
point mineur documenté ci-dessous), vérifié (`typecheck`, 7 suites Jest
ciblées = 114 tests, 5 fichiers Vitest = 57 tests, `check:architecture`,
`wiki:check`, tous verts), committé, fusionné `origin/main` (sans conflit sur
le code — seuls `HANDOFF.md`, `sous-fonctionnalites.md` et le classeur wiki se
recoupaient, résolus en conservant les deux apports), puis ouvert la PR.

Fait :

- Vue patrimoine du portail propriétaire (lot P5) : `GET /api/portal/owner/patrimoine`
  (+ `/settings`, `/properties/:propertyId`, `/properties/:propertyId/documents/:documentId/file`),
  lecture seule, biens = `req.ownerPortal.propertyIds` dans l'agence du portail,
  même 404 pour bien d'autrui / d'une autre agence / inexistant. Calculs par
  `buildPropertyYieldInput` + `lib/patrimoine/yield.ts` (aucun second moteur).
  Agrégats de la liste pondérés par la quote-part d'indivision ; détail non pondéré.
- Masquage par l'agence : modèle `OwnerPortalSettings` (migration
  `20261003150500_owner_portal_settings`, table dédiée, tout ouvert par défaut
  sans écrire), `GET|PUT /api/tenants/:tenantId/settings/owner-portal`
  (`TENANT_SETTINGS_VIEW/EDIT`), carte « Portail propriétaire » dans Paramètres
  de l'agence. Vue masquée → 404 et entrée de menu retirée ; rubrique masquée →
  clé absente ; `netNetYield` absent si les emprunts sont masqués.
- Front : `pages/OwnerPortal/Patrimoine.tsx`, `PatrimoinePropertyDetails.tsx`
  (React.lazy), menu « Mon patrimoine », traductions en/ar.
- Correctifs du portail propriétaire : bug `date-fns` (variable `format` du corps
  qui masquait la fonction → 500 sur les trois rapports) ; IDOR préexistant de
  `POST /reports/export` (`report-generator.ts` : `propertyId` du corps écrasait
  le périmètre) ; validation de `entityType`/`format`.
- Tests : `owner-portal-patrimoine` (24), `owner-portal-reports-filename` (5),
  `owner-portal-export-scope` (18), Vitest portail/menu/réglage. Wiki mis à jour
  (4 lignes ajoutées, 3 rapports repassés « Disponible », note date-fns retirée).
- Relectures (ce tour) : `security-auditor` — 0 bloquant, 1 mineur (cas
  `PropertyDocument.tenantId: null` non documenté, corrigé par une note dans
  `docs/governance/SECURITY.md` §5) ; relecture générale — 0 bloquant, 2
  remarques cosmétiques sans suite.

Reste à faire :

- Recette navigateur du portail propriétaire sur une base migrée (non faite
  — CI et revue humaine seules avant fusion).
- Suivre la CI de la PR jusqu'au vert.
- Décision éventuelle : un bien dont la table d'indivision ne cite pas le
  propriétaire compte pour 0 % dans ses totaux (même règle que le relevé de
  gérance, `ownerSharesByProperty`).

Pièges et décisions :

- Table dédiée plutôt que colonnes sur `AgencyFinanceSettings` : réglage de
  portail, pas comptable, et P4 touche aux réglages fiscaux en parallèle.
- Les tests qui montent `owner-portal-routes` vont dans `APP_LEVEL_TESTS`
  (`jest.config.js`) : erreurs TS anciennes de `document-context-builder.ts`.
- Worktree avec son propre `npm ci` (schéma modifié), pas de jonction.
- Fusion de `origin/main` dans ce tour : les sections `fix/patrimoine-suite-p0`
  (#40) et `feat/provision-abonnements` (#39) qui vivaient ici ont été
  retirées — les deux branches sont déjà fusionnées dans `main` (règle du
  fichier : une section disparaît une fois fusionnée, l'historique reste dans
  `git log`).

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
