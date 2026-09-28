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

## Branche `feat/patrimoine-p1-pack` — 2026-09-28

**État :** prêt à relire — PR #46 vers `main`, CI verte (6/6 checks sur `da6ca863`)
**Dernier commit :** `da6ca863` Merge branch 'main' into feat/patrimoine-p1-pack

Fait :

- Lot P1 repris intact depuis le disque (le coordinateur précédent avait
  tout implémenté mais jamais committé) : deux packs Patrimoine
  (Essentiel 9 900 FCFA/10 biens, Pro 29 900 FCFA/100 biens), capacité
  `BIENS_DETENUS`/`LotKind.HELD_PROPERTY`, barrière « détenu en propre »
  (`own-assets-barrier-service.ts`), tarification/facturation,
  écrans super-admin, traductions fr/en/ar, migrations
  `20261001101500`/`20261001101600`, tests (833 lignes environ). Détail
  complet dans la description de la PR #46.
- `origin/main` (PR #39, outil de provisionnement) fusionné dans la
  branche sans conflit. Le mock de `lot-registry-service` dans
  `subscription-provisioning-service.test.ts` (apporté par la #39) ne
  couvrait pas `countHeldProperties` : 23/32 tests en échec après
  fusion, corrigé (32/32 après).
- Outil de provisionnement vérifié en conditions réelles sur une base
  jetable (migrations + catalogue amorcé) : `provision --items
PATRIMOINE_ESSENTIEL:1,EXT_BIENS_10:1 --dry-run` reconnaît les
  nouveaux codes, calcule `BIENS_DETENUS 0/20` et la tarification
  attendue — l'outil lit le catalogue en base, aucune adaptation de
  code n'était nécessaire.
- Relectures `security-auditor` et générale (toutes deux lecture seule,
  `model: sonnet`) : 0 bloquant. Corrigés : 2 clés i18n API manquantes
  (`en.json`/`ar.json`, messages `OWN_ASSETS_ONLY`), wiki des
  fonctionnalités non mis à jour (fait : 2 packs + extension dans la
  feuille Légende, Pack(s) Patrimoine Essentiel/Pro ajouté aux 84
  sous-fonctionnalités RENTAL/PATRIMOINE, réserve « bloqué » sur les 2
  sous-fonctionnalités purement tiers, note dédiée), test de cumul
  Promoteur+Patrimoine absent (ajouté, `subscription.entitlements.test.ts`
  et `subscription.pricing.test.ts`).
- Vérifications : `npm run typecheck` 72 erreurs (73 sur `main`, aucune
  nouvelle) ; Jest ciblé 19 suites/335 tests verts ; `check:architecture`
  et `wiki:check` verts ; `migrate diff --exit-code` sans différence sur
  base jetable (`pg-fonds`, 55432, base `immotopia_p1_<horodatage>`,
  supprimée après usage) ; CI GitHub verte (API + 4 lots web + build).
- `origin/main` a de nouveau avancé pendant la revue (PR #41, sécurité
  des invitations) : re-fusionnée (`da6ca863`), un conflit trivial dans
  `error-middleware.ts` (les deux branches ajoutaient un code d'erreur
  en fin d'objet `ErrorCode`), résolu en gardant les deux. Revérifié
  après cette seconde fusion : 22 suites/359 tests Jest verts,
  `typecheck` stable (72), `check:architecture` et `wiki:check` verts,
  CI GitHub relancée et verte sur `da6ca863` (6/6 checks).

Reste à faire :

- Fusion de la PR #46 : à la charge de l'utilisateur.
- Plan de test manuel listé dans la description de la PR (création
  agence Patrimoine Essentiel, passage au Pro, barrière en `enforce`,
  cumul Agence/Promoteur + Patrimoine) — pas encore rejoué en interface.

Pièges et décisions :

- Un test `CreateTenantDrawer` (palier Patrimoine) échoue par timeout
  (5 s) quand tout le fichier tourne sous charge partagée (plusieurs
  Jest/Vitest en parallèle sur ce poste), mais passe (26 à 35 s) relancé
  seul ou avec tout le fichier sans contention (7/7) — même effet déjà
  documenté dans ce fichier pour le test « exclusivité de l'Intégré »
  voisin. Pas une régression P1 ; revérifier isolément avant de
  conclure à un échec sur ce fichier.
- `ws.insert_rows()` d'openpyxl ne déplace pas les plages fusionnées :
  après insertion de lignes dans la feuille « Legende Packs-Modules »,
  la fusion `A11:G11` (titre du second tableau) est restée à son ancien
  numéro de ligne au lieu de suivre son contenu déplacé — corrigé à la
  main (`unmerge_cells`/`merge_cells`) après coup. À vérifier
  systématiquement après tout `insert_rows` sur ce classeur.
- Barrière « détenu en propre » : ne bloque que mandat de gestion et
  rattachement de propriétaire tiers (indivision, bien, bail) pour un
  compte dont le SEUL module est `MODULE_PATRIMOINE`. Le mandat de
  VENTE est protégé par le même code mais n'est de toute façon pas
  atteignable par ce pack seul (fonctionnalité SALES non ouverte par
  `MODULE_PATRIMOINE`).

---

## Branche `fix/patrimoine-suite-p0` — 2026-09-28

**État :** prêt à relire — PR #40 vers `main`
**Dernier commit :** voir `git log -1` sur la branche (commit unique du lot)

Fait :

- `alertExpiringDocuments` (`lib/patrimoine/notifications.ts`) porte désormais
  sur `PropertyDocument` (et non plus `PatrimonyDocument`, inutilisé depuis P0) :
  fenêtre [maintenant, +30 j], destinataires = propriétaires du bien
  (`PropertyOwnershipShare` + `ownerUserId` → `TenantClient` →
  `details.crmContactId` → `CrmContact.consentEmail === true`), anti-doublon
  par `warningSentAt` réservé atomiquement (`updateMany … warningSentAt: null`),
  remis à null si aucun envoi n'aboutit ; HTML échappé.
- Job `jobs/document-expiry-alert-job.ts`, chaque jour 7 h UTC, agences
  ACTIVE une par une dans `runWithTenantContext`, démarré dans `src/index.ts`
  (deux lignes, conflit trivial possible avec `feat/provision-abonnements`).
- `owner-statements-controller.ts` en `asyncHandler` + erreurs typées ;
  tests 400/404/409 (supertest + `errorHandler` réel).
- Wiki : ligne « Alerter les propriétaires d'un document qui arrive à échéance ».

Reste à faire :

- Fusion par l'utilisateur. Le modèle `PatrimonyDocument` reste au schéma
  (retrait = migration, hors lot).

Pièges et décisions :

- Pas de consentement supposé depuis le seul `User` : un propriétaire sans
  contact CRM lié ne reçoit rien ; le document n'est pas marqué et est
  retenté chaque jour.
- Limites assumées (commentées) : échec partiel en indivision non relancé ;
  arrêt du processus entre réservation et envoi laisse la marque posée.
- Une erreur sans statut dans create/update du relevé donne 500 (et non
  plus 400 par défaut) ; les erreurs métier portent toutes un statut.

## Branche `feat/provision-abonnements` — 2026-09-28

**État :** prêt à relire (PR ouverte vers `main`)
**Dernier commit :** voir `git log` de la branche (outil d'exploitation des abonnements)

Fait :

- Outil en ligne de commande `packages/api/src/scripts/provision-subscription.ts`
  (logique : `services/subscription-provisioning-service.ts`) : `list`,
  `provision` (essai TRIALING + éléments en une transaction, `setupWaived`,
  puis réconciliation du registre des lots), `suspend` (`suspendTenant`),
  `--dry-run` sans écriture, idempotent, fenêtre hh:10–hh:20 UTC refusée,
  acteur d'audit `system:provision-subscription`. `audit-service` exporte
  `flushAuditEvents`. Section RUNBOOK « Outil d'exploitation des abonnements ».
- Essai de bout en bout sur une base jetable (PostgreSQL local, migrations +
  catalogue) avec le JavaScript compilé comme dans l'image : dry-run sans
  écriture, création Ivoire (AGENCE + SYNDIC + 2 × EXT_COPRO, 100 lots
  copro réconciliés), relance idempotente, refus non conforme, suspension
  et révocation des jetons, première facture simulée après l'essai sans
  frais de mise en route (96 810 HT / 114 236 TTC).

Reste à faire :

- En production (hors de cette branche, après fusion et déploiement) : dry-run
  puis réel pour Ivoire Résidences, Agence Immobilière du Mali, Bamako
  Immobilier (commandes dans la PR). Les slugs réels sont à lire avec `list`.

Pièges et décisions :

- Ivoire aura 4 copropriétés pour 4 incluses : la tâche horaire enverra les
  alertes de seuil 80 % et 100 % (une fois par période). Voulu par la
  composition décidée ; le dry-run l'annonce.
- Un abonnement existant non conforme est refusé, jamais corrigé : si la
  production en a déjà un pour Ivoire, décider à la main.
- Le gestionnaire SIGTERM/SIGINT d'`audit-service` sort en code 0 même si la
  file d'audit n'a pas pu être vidée (hérité, hors périmètre).

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
