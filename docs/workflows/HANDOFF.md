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
## Branche `feat/syndic-paiement-declare` — 2026-10-18

**État :** PR1 et PR2 (spec 047) écrites, non commitées par l'agent ; L8 (pré-remplissage IA, T059 à T066) non commencé.
**Dernier commit :** `66dddfea` (L1, L2, L6, L7) ; le reste est dans l'arbre de travail.

**Fait :** API agence (routes 1.1 à 1.11, `syndic-declared-payment-routes.ts`), API portail (2.1, 2.4, 2.5, 2.6, `coowner-portal-routes.ts`), `portal.ts`, limiteurs `syndicDeclaredWriteRateLimiter` et `coOwnerDeclarationCreateLimiter`, capture reçue par `middleware/declared-proof-upload.ts` (5 Mo, type réel contrôlé par le moteur), `sendPrivateFile` gagne `{ inline }`. `pendingDeclaration` et `onlinePayable` sur `/appels`, 409 `CHARGE_CALL_DECLARATION_PENDING` au démarrage du paiement en ligne, relances groupées suspendues (D7), relance manuelle qui renvoie `pendingDeclaration`. Notifications (quatre clés e-mail, trois WhatsApp), tâche `syndic-declared-payment-job` (récapitulatif horaire, alerte 8 h Africa/Abidjan, purge) inscrite dans `index.ts`. Traductions en/ar ajoutées à la main (web : `common.json`, `syndic.json` ; API : `en.json`, `ar.json`). Classeur : 22 lignes, onglet renommé « Paiements » dans les menus des anciennes lignes, README à 1068 lignes (`A1:O1069`).

**Compléments (2026-10-18, après relecture) :** reversement depuis un sous-compte 5521x (R23, T071), compteurs de déclarations (onglet, tableau de bord, lot), job idempotent (verrou + `NotificationMarker`), ApproveModal sans liste d'appels figée, avance possible sans appel, libellé du sous-compte et langue des notifications, audit masqué du changement de numéro + alerte aux autres gestionnaires, passerelle IA (numeros-reception et preuve sensibles), plafond du montant retenu (total ≤ déclaré, R18 autorise la répartition entre lots), lecture de la capture limitée et auditée, CSP sur les fichiers inline. Piège : ne jamais lancer `prettier --write` sur un dossier entier (réécrit les fins de ligne de centaines de fichiers).

**Reste à faire :** T031 et T058 (isolation `npm run test:isolation` non lancée : pas de `DATABASE_URL_TEST`), recette navigateur sur la démo, relecture `code-reviewer` + `security-auditor`, validation comptable des comptes 5521x (T069), L8, catalogue IA à régénérer (`npm run ai:catalog` dans `packages/api`) si le test `ai.catalog` échoue.

**Pièges :** le message de validation ne joint pas les PDF : ils partent déjà par `scheduleChargeDocumentDelivery` (évite un doublon). Les `notifyDeclaration*` ne font rien sous Jest (`isTest`). La fenêtre horaire du récapitulatif est l'heure pleine précédente : une heure sans serveur n'est pas rattrapée. Fichiers à fins de ligne mixtes (CRLF/LF) : normaliser avant un remplacement multi-lignes. Les fixtures `syndics.online-payment-fixtures.ts` et deux tests du portail simulent maintenant `syndicPaymentDeclaration`.

## Branche `feat/prelevement-signature-mandat` — 2026-10-18

**État :** signature électronique du mandat de prélèvement (spec 042 §10) branchée côté copropriété et vérifiée côté API, empilée sur P4 (64456315). Rien n'est commité par l'agent : le pilote commite.
**Worktree :** `.claude/worktrees/prelevement-p2`.

Fait :

- Écran : `MandateSignatureSection` (type `SYNDIC_DIRECT_DEBIT_MANDATE`) dans l'onglet Prélèvements de Syndic. Un bouton « Signature électronique » (actions d'un mandat en brouillon, `SyndicMandateActions`) déplie la section sous la ligne du mandat (`SyndicMandatesCard`, ligne extensible). Bouton et section réservés à `SYNDIC_DIRECT_DEBIT_MANAGE` (`useSyndicDirectDebitRights`).
- API, §9.3 vérifié : l'activation sans `signedAt` d'un mandat déjà daté, et l'annulation des demandes ouvertes à la révocation et au dépôt d'un scan, sont dans les fonctions communes `lib/direct-debit/mandates.ts` (paramètre de périmètre) : les deux périmètres en bénéficient, rien à ajouter dans `syndic/mandates.ts`.
- Défaut corrigé : `signature-pdf-data.ts` présentait le numéro de lot comme un « Bail » et le syndicat comme un « Bien loué » dans le PDF envoyé en signature. Il renseigne maintenant `syndicateName` et `lotNumber` (lignes « Copropriété » et « Lot », mention des appels de charges) ; l'empreinte HMAC (`signature-snapshot.ts`) les inclut, ce qui change l'empreinte des demandes en cours (aucune en production : branche non fusionnée).
- Tests : jest `direct-debit.signature-source` (rendu du PDF de copropriété et du PDF locatif, empreinte sensible au lot et au syndicat), `direct-debit.syndic-mandates` (parcours signé puis activé avec date préremplie) ; vitest `syndics/syndic-direct-debit-signature` (5 tests).
- Traductions en/ar de « Signature électronique » dans `syndic.json` ; classeur : 5 lignes ajoutées + 1 ligne locative modifiée (1086 lignes, `A1:O1087`).

Correctifs de l'audit de sécurité (commit b1571a3f) :

- SIG-S5 : la lecture du `signed.pdf` par la route du scan signé (locatif et copropriété) est auditée avant l'envoi (`auditSignatureFileServed`, lecteur transmis par les contrôleurs).
- Jeton de consultation : effacé à la signature, au refus et à l'annulation ; exigé aussi pour refuser (le web l'envoie, le lien « Refuser de signer » n'apparaît qu'après le code) ; `sourceGateOf` fermé par défaut pour les deux types de mandat.
- Yousign : l'hôte du lien de signature doit être celui de l'API configurée ou `*.yousign.app` (`isYousignHost`).
- Un scan papier qui remplace un scan électronique remet `signatureRequestId` et `signedAt` à zéro ; l'annulation supprime `source.pdf` des deux types ; `onSealed` recalcule l'empreinte dans la transaction (`tx`).
- Empreinte : syndicat et lot en fin de tableau canonique, seulement en copropriété (l'empreinte locative garde sa forme initiale). Rotation de `DIRECT_DEBIT_IBAN_KEY` : voir SECURITY.md et DEPLOIEMENT.md.
- Destinataire e-mail différent du débiteur : permis, tracé dans l'audit (`signerOverride`, adresse masquée). CORS lit `FRONTEND_URL` par `config/env`.

Reste à faire :

- Recette navigateur du parcours complet (envoi, code, signature, activation) en copropriété ; Yousign non essayé pour ce type.
- `npm run test:isolation` non lancé.

Pièges :

- La cible de signature est `DIRECT_DEBIT_MANDATE` pour les deux types ; seul `kind` distingue le périmètre.

## Branche `feat/prelevement-p4-copropriete` — 2026-10-18

**État :** lot P4 terminé côté code et documentation, à relire (PR empilée sur P3 = #166). Rien n'est commité par l'agent : le pilote commite.
**Worktree :** `.claude/worktrees/agent-a8c45bf28b7afdbdf`.

Fait (spec 042 P4, contrat `specs/042-prelevement-bancaire/data-model.md` §9) :

- Typage de la fusion P3 dans P4 : le service de retour (`lib/direct-debit/returns/`) fonctionne pour `RENTAL_LEASE` et `SYNDIC_LOT` (filtre du syndicat sur remises et imports, ligne de l'encaisseur complète, `chargePaymentId` écrit au règlement, avis de rejet `SYNDIC_DIRECT_DEBIT_REJECTED`, nom du contact débiteur dans l'aperçu, `scope` dans l'historique des imports).
- Écrans : détail complet d'une remise de copropriété et import d'un retour banque (aperçu, application, historique) ; le détail locatif a été extrait dans `components/rental/direct-debit/RemittanceDetailView.tsx` (commun aux deux périmètres, `pages/rental/DirectDebitRemittanceDetail.tsx` n'est plus qu'un habillage) ; `ReturnImportModal` et `ReturnImportsHistory` acceptent l'API d'un périmètre. Droits : `useSyndicDirectDebitRights` (VIEW lit, MANAGE écrit).
- Service web `syndic-direct-debit-service.ts` : constats, tout régler, aperçu, application, historique.
- Traductions en/ar ajoutées à la main dans `syndic.json` (15 textes) ; classeur : 26 lignes (1081 au total) ; `plan.md` : P4 fait.

Reste à faire :

- Recette navigateur de l'onglet Prélèvements (jamais ouvert dans un vrai navigateur) ; migrations P4 jamais appliquées sur une vraie base ; `npm run test:isolation` non lancé.
- Un fichier de retour qui rejette une ligne déjà réglée en copropriété est rapproché comme `REJECT` puis échoue à l'application (message de l'API) : l'aperçu prévient, mais ne l'écarte pas (pas de raison d'écart dédiée dans le contrat).
- P5 (portails) non commencé.

Pièges :

- Le rejet tardif n'existe pas en copropriété (aucune contre-passation d'un `ChargePayment`) : le bouton n'est pas proposé et l'API répond 409.
- Les écrans de finances du syndic ne passent pas par React Query : après un constat, rien à invalider côté appels de charges (ils se relisent au montage).
- Les tests vitest d'un fichier syndic prennent plus de 7 minutes quand la machine est chargée ; relancer seul le fichier avant de conclure à un échec.
- Le correctif de typage portait sur le service de P3 : sa dérogation « le syndicat s'ajoutera avec la colonne de P4 » est tenue.

## Branche `feat/prelevement-p3-retour-banque` — 2026-10-17

**État :** prêt à relire — PR vers `main` ouverte par le pilote (premier des trois lots empilés : P3, puis P4 `feat/prelevement-p4-copropriete`, puis signature `feat/prelevement-signature-mandat`). Relectures de code et de sécurité faites, constats corrigés.
**Dernier commit :** voir `git log` (fusion des correctifs de relecture, classeur et plan).
**Worktree d'intégration :** `.claude/worktrees/amazing-brattain-ff3069`, `node_modules` PROPRE (`npm ci`, pas de jonction).

Fait (spec 042 P3, contrat `specs/042-prelevement-bancaire/data-model.md` §8, dont §8.12) :

- Retour banque : constat de règlement (encaissement `DIRECT_DEBIT` ventilé, quittance après commit), de rejet y compris tardif (contre-passation, quittance annulée, frais refacturés portés sur l'échéance et exclus de la part du propriétaire, suspension automatique au seuil, e-mail `DIRECT_DEBIT_REJECTED`), constat de toute la remise, import d'un fichier de retour `GENERIC_CSV` (aperçu puis application, historique, au plus 500 enregistrements actionnables et 50 remises, un import à la fois par agence).
- Retours de recette du staging : mandats brouillons ou suspendus dans les non retenus (`MANDATE_NOT_ACTIVE`) et non retenus affichés en permanence sur un brouillon ; messages nommant le fichier téléchargé ; adresse masquée et provenance (compte portail ou fiche contact) de chaque avis ; note sur la fiche contact du CRM quand le compte portail a une autre adresse.
- Classeur des fonctionnalités : 9 lignes (1031 au total) ; `plan.md` : P3 fait.

Reste à faire :

- Recette navigateur sur la démo (`packages/api/.env.demo` absent du checkout principal : `demo:sync` impossible tant que l'utilisateur ne l'a pas recréé).
- Migrations `20261017100000_*` et `20261017100100_*` jamais appliquées sur une vraie base ; `test:isolation` non lancé.
- Points ouverts : format réel de la banque pilote ; e-mail de règlement ; traitement de fond des gros imports ; un paiement fait seulement de frais de rejet ne crée pas de mouvement propriétaire (comme les pénalités).

Pièges et décisions :

- Méthode du 17/10 : contrats d'abord (data-model §8 à §10), échafaudage commun par le pilote, puis agents en worktrees isolés (`isolation: worktree`, chacun son `npm ci`) qui partent de la branche du lot par avance rapide ; le pilote commite dans chaque worktree d'agent (`EnterWorktree`) puis fusionne dans la branche du lot.
- Ne pas changer de worktree (`EnterWorktree`) pendant qu'un sous-agent NON isolé travaille dans celui de la session : son shell est coupé.
- La machine saturée (plusieurs `npm ci` et suites de tests en parallèle) fait échouer des suites jest « au démarrage » et des tests vitest par délai : relancer seules avant de conclure.
- `git worktree remove` d'un worktree d'agent peut s'arrêter à mi-chemin (« Directory not empty ») : le dossier reste mais n'est plus enregistré ; le checkout principal n'est pas touché (les `node_modules` d'agents sont réels, sans jonction).

## Branche `docs/handoff-staging-deploiement` — 2026-10-16

**État :** prêt à relire.

**Fait :** staging déployé par la CI (workflow `Déploiement`, `workflow_dispatch`, commit `d4c9c83`, `deploy.sh staging` OK, `/health` et `/` en 200 sur app.immotopia.cloud). Premier essai réel du déploiement continu : il fonctionne. Secrets `DEPLOY_SSH_KEY` et `DEPLOY_SSH_KNOWN_HOSTS` posés dans l'environnement GitHub `staging` ; clé publique ajoutée dans `authorized_keys` de `deployer` (sauvegarde `authorized_keys.avant-ci-*`). PR 126, 132, 142 fusionnées dans `main`.

**Reste :** repasser les 3 tests de refus de la clé du staging (code 2 attendu) puis supprimer la clé privée du poste ; environnement `production` et clé prod non créés ; `AUTO_DEPLOY_STAGING` non activé ; `main` non protégé par ruleset (prérequis de l'automatique) ; classeur de fonctionnalités à compléter (paiement mobile copropriétaires, règlements fournisseurs).

**Pièges :** le service `ssh` du serveur s'est arrêté le 2026-10-16 (port 2222 refusé, `ssh.service` désactivé et lancé par `ssh.socket`) : à surveiller. `ssh-keyscan` de Windows ne rend que la bannière : lire la clé d'hôte sur le serveur. Le checkout du serveur doit être à jour (`git merge --ff-only origin/main`) sinon `ci-deploy.sh` est introuvable (code 127).

## Branche `docs/spec-syndic-paiement-declare` — 2026-10-17

**État :** PR 165 en brouillon, spec seule, décisions produit D7 à D18 tranchées par Baba le 2026-10-17 ; seule reste ouverte la validation comptable des sous-comptes 552x (Q9).
**Dernier commit :** décisions D11 à D18 de la spec 047 (voir `git log`).

**Fait :** `specs/047-syndic-paiement-declare/spec.md` : paiement mobile money hors d'ImmoTopia, déclaré par le copropriétaire (référence obligatoire, capture facultative pré-lue par IA), validé par le gestionnaire. Rien n'est crédité avant validation ; la validation réutilise `recordLotPaymentTx` + `issueReceiptsForPaymentTx`.

**Reste :** spec, plan (lots L1 à L8 par territoire de fichiers), contrats (routes et modèle Prisma) et tâches écrits ; le Pilote implémente sur `feat/syndic-paiement-declare`. Comptes : hypothèse H1 (sous-comptes 5521x par numéro), révisable, à faire valider par un comptable avant la production (T069).

**Pièges :** le hook `validate-bash.sh` refuse une commande qui contient `--base main` (il y voit une poussée sur main) : lancer `gh pr create` sans `--base`, dans une commande séparée du `git push`. `TreasuryAccount` est au niveau de l'agence, pas de la copropriété. Le côté loyers a déjà `RentalPaymentDeclaration`.

## Branche `feat/finance-fournisseurs-tresorerie` — 2026-10-16

**État :** prêt à relire (PR 142), CI à relire après la fusion de main.
**Dernier commit :** fusion de `main` (PR 126 et 132 fusionnées le 2026-10-16).

**Fait :** règlements fournisseurs (mode de règlement, compte de trésorerie), refus des sorties à solde insuffisant, route `GET .../suppliers/:supplierId/payments`, boutons masqués selon les permissions. `useMyMenuAccess` de main reprend un champ `ready`. Catalogue IA régénéré.

**Reste :** compléter `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx` (classeur non relisible par exceljs : à faire à la main) pour les règlements fournisseurs, le refus à solde insuffisant et les boutons selon permissions ; idem côté paiement mobile copropriétaires (PR 132, fusionnée sans lignes de classeur).

**Pièges :** `node_modules` des worktrees = jonction vers le checkout principal, ne jamais la supprimer avec `rm -rf` ; en CI, deux tests sans `import` se partagent le portée globale TS (`export {}` en tête). Le worktree `port-oi` garde du travail finance non commité déjà repris ici.

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

## Pilote — finalisation des chantiers ouverts — 2026-10-18

**État :** tout est fusionné dans `main` (`7f1c6e55`, CI verte). Rien n'est déployé. Le workflow « Déploiement » se termine en `skipped` après chaque fusion, sans doute parce que la variable `AUTO_DEPLOY_STAGING` n'est pas à `true`. Le staging est donc resté à `0469fdf7`, et la production n'a rien reçu.

Fusionné le 2026-10-18 :

- #151 (défauts du paiement mobile et de la signature) et #154 (extracteurs i18n sans perte, `--check`).
- #166 (P3 retour banque), #167 (P4 copropriété) et #168 (signature électronique du mandat).
- #165 (spec 047) et #169 (paiement déclaré, lots L1 à L8 : API agence et portail, notifications, lecture IA, reversement R23).
- #156, #159, #160 et #161 (cinq prospectus).
- Budget du chunk d'entrée relevé à 229 376 o, sur décision de l'utilisateur.

Reste à faire :

- Déploiement, sur décision de l'utilisateur :
  - staging : par « Run workflow », ou en remettant `AUTO_DEPLOY_STAGING` à `true` ;
  - production : sauvegarde, étiquette, puis `deploy.sh prod` ([DEPLOIEMENT.md](DEPLOIEMENT.md)).
- Migrations nouvelles, jamais appliquées sur une vraie base : sauvegarder la base avant.
  - P3 : `20261017100000_*` et `20261017100100_*`.
  - P4 : `20261017110000/110100/110200_*`.
  - Signature : `20261017120000/120100_*`.
  - Spec 047 : `20261017150000/150100_*`.
  - Les deux `ALTER TYPE ChargePaymentOrigin ADD VALUE` (`DIRECT_DEBIT` et `DECLARED`) sont chacun dans leur propre migration.
- Recette navigateur de P3, de P4, de la signature du mandat et du paiement déclaré : pas faite, car `packages/api/.env.demo` manque pour `demo:sync`.
- Tests non lancés :
  - `npm run test:isolation` (base `DATABASE_URL_TEST`) ;
  - tests d'intégration de la spec 047 sur un vrai PostgreSQL.
- Spec 047 :
  - T069 : validation comptable des sous-comptes 5521x ;
  - lecture IA : il faut une clé Gemini payante et `PAYMENT_PROOF_VISION_PROVIDER` ;
  - la rotation de `DIRECT_DEBIT_IBAN_KEY` invalide les demandes de signature ouvertes.
- Budget d'entrée du web : relevé quatre fois, l'allègement structurel reste à faire.

Pièges et décisions :

- Un worktree dont `node_modules` est une jonction vers le checkout principal hérite de dépendances périmées : le checkout principal est resté sur `feat/signature-s5-s7`. Pointer la jonction vers un worktree à jour.
- Fusion des catalogues i18n :
  - garder toute traduction non vide ;
  - ensuite, `npm run i18n:extract` (corrigé par la PR 154) atteint son point fixe ;
  - une clé qui arrive vide se remplit souvent avec le même texte d'un autre catalogue de la langue.
- Deux tests vitest fragiles sous la charge de la CI sont corrigés :
  - `declare-for-third-party-modal` : le filtre est asynchrone ;
  - `declared-payment-form` : l'icône de chargement entre dans le nom accessible.
- Le checkout principal porte des fichiers non suivis (`.claude/deploy-*-cles.ps1`, `.husky/`, `docs/ImmoTopia_Wiki_Fonctionnalites.xlsx`). Ne pas les commiter sans les avoir relus.

## Branche `docs/prospectus-syndic` — 2026-10-18

**État :** prêt à fusionner. PR #156 (base `main`) porte les cinq prospectus : Syndic, Agence (#158 fusionnée dedans), Promoteur (#159, base reciblée sur `docs/prospectus-syndic` le 2026-10-18), Opérateur intégré (#160) et Patrimoine (#161), ces deux dernières déjà fusionnées dans `docs/prospectus-promoteur`. Ordre : #159 dans `docs/prospectus-syndic`, puis #156 dans `main`.

Fait :

- Cinq prospectus recto-verso A4 dans `docs/commercial/prospectus/` (HTML et PDF de 2 pages vérifiés en image), `README.md` du dossier (règles de contenu, « Bientôt » par pack, régénération du PDF).

Reste à faire :

- À valider par l'utilisateur : affichage des prix, coordonnées commerciales (bloc « Votre conseiller » vierge), Mobile Money mis en avant alors que le mode réel PaySecureHub n'est pas activé.

Pièges et décisions :

- Le PDF déborde vite : après toute retouche du texte, régénérer et vérifier le bas de chaque face.
- Dans un `display:flex`, un `<sup>` devient un élément à part : envelopper le texte dans un `<span>`.

## Branche `feat/syndic-visio-micro-camera` — 2026-10-17

**État :** prêt à relire (PR empilée sur `fix/syndic-ag-direct-recette`, PR 163), non déployé. Migration Prisma `20261017120000_syndic_ag_media_moderation` à appliquer (`demo:sync --migrate`).

**Fait :** les copropriétaires activent micro et caméra dans la visio de l'AG ; le gestionnaire coupe un micro/une caméra, interdit/autorise un participant ou tous (`mediaPolicy`, `mediaLockedAt`, droits décidés côté serveur à chaque jeton, rattrapage à la connexion par le webhook LiveKit `participant_joined`). Audit, avis d'enregistrement (convocation et bandeau), spec 045 §V16 datée du 2026-10-17. Audit sécurité : 1 point important corrigé (jeton ancien), 2 mineurs corrigés.

**Reste :** rien vérifié avec un vrai LiveKit (mute, interdiction, ordre d'arrivée de `participant_joined`) ; vérifier que `participant_joined` est envoyé à l'URL de webhook LiveKit ; rendu RTL non vu ; traductions en/ar non relues ; classeur de fonctionnalités à compléter (micro/caméra, couper, interdire, interdire à tous, rattrapage à la connexion) ; pas de « couper tous les micros » en un geste.

**Pièges :** jeton copropriétaire valable 600 s, non révocable : seule la règle serveur à l'arrivée le rattrape. Mêmes pièges d'i18n et de jest que la branche de la PR 163.

## Branche `fix/crm-contact-commune` — 2026-10-17

**État :** prêt à relire (PR vers `main`).

**Fait :** `ContactForm` n'exige plus la commune qu'à la création ; une fiche existante sans commune (recette staging, contact « Awa Gogoua ») s'enregistre. La bascule vers l'onglet du premier champ fautif existait déjà dans `main` (`FIELD_TABS`, `handleFinishFailed`) : le staging n'avait vraisemblablement pas encore cette version. Test `contact-form-commune.test.tsx`. Aucune validation API de la commune (rien à changer côté serveur).

**Reste :** redéployer le staging pour constater la correction ; classeur des fonctionnalités non modifié (aucune ligne ne décrit cette règle).

**Pièges :** `tsc` web signale 7 erreurs préexistantes (livekit absent), sans lien.

## Branche `feat/syndic-ag-visio` — 2026-10-17

**État :** FUSIONNÉE dans `main` le 2026-10-17 (PR https://github.com/bkourouma/immotopia/pull/144, commit de fusion `79aeb324`), avec les PR #145 (enregistrements orphelins) et #148 (discussion modérée), fusionnées dans la branche avant elle pour ne passer qu'une CI (7/7 verte sur `0011c4d1`). Section gardée pour la mise en service ; à supprimer une fois la visio en service.
**Dernier commit :** `0011c4d1` (fusion de `origin/main`, PR 146) ; `main` = `79aeb324`, arbre identique à `0011c4d1`.
**Worktrees :** `.claude/worktrees/suspicious-cartwright-fc4a4c` et `zen-poincare-ac73f3` ont leur propre `node_modules` ; `sweet-kilby-b1ed43` a trois JONCTIONS vers ceux de `suspicious-cartwright-fc4a4c` : les retirer avec `rmdir` AVANT tout `git worktree remove`, et retirer ce worktree avant `suspicious-cartwright-fc4a4c`.

Fait :

- Spec `specs/045-syndic-ag-visio/spec.md` (044 = signature électronique) : visio LiveKit intégrée à l'AG en direct et enregistrement, décisions V1–V15 et R1–R12. Spec `specs/046-syndic-ag-discussion/spec.md` : discussion écrite modérée, règles M1–M15.
- API : service LiveKit porté d'École Digitale ; routes publiques `/api/public/assemblees/visio`, `/visio/main`, `/discussion`, `/discussion/envoyer` ; routes gestionnaire `/visio`, `/visio/jeton`, parole, exclusion, écriture coupée, discussion (lecture, envoi, masquer, ouvrir/fermer), enregistrement (`GMRecording`, migration `20261016120000_syndic_ag_enregistrement`, Egress MP4 vers S3, webhook `/api/webhooks/livekit`, rapatriement, lecture et téléchargement audités, reprise, suppression) ; `GMChatMessage` (migration `20261016150000_syndic_ag_discussion`) ; purge des MP4 et objets S3 lors des suppressions en cascade (`lib/syndics/meeting-recording-cleanup.ts`, branchée dans `deleteEmptySyndicateByTenant`).
- Web : salle `MeetingVisioRoom` (chargée à la demande) avec panneau « Discussion », page `/ag-direct` (côte à côte ou onglets), console (visio, enregistrements, discussion, couper l'écriture).
- Relectures code et sécurité corrigées (0 critique, 0 haute) ; recettes navigateur sur la démo (voir les specs) ; classeur des fonctionnalités (13 + 7 lignes, 1 modifiée) ; `SECURITY.md` § 12 quater ; `deploy.sh` (`INTEGRATION_KEYS`) ; avis d'enregistrement dans la convocation (`{{recordingNotice}}`).

Reste à faire :

- Staging : un déploiement de `79aeb324` a été lancé à la main (workflow_dispatch, compte `bkourouma`, pas par le Pilote) le 2026-10-17 à 05:21 UTC, juste après la fusion ; il applique les migrations `20261016120000_syndic_ag_enregistrement` et `20261016150000_syndic_ag_discussion`. Sans `LIVEKIT_*` sur le staging, la visio intégrée reste désactivée (le lien de visio externe reste affiché). Vérifier l'issue de ce déploiement.
- Mise en service par l'utilisateur : projet LiveKit Cloud dédié (compte et dépense), `LIVEKIT_*` et `LIVEKIT_RECORDING_S3_*` en staging puis production, webhook `<BACKEND_URL>/api/webhooks/livekit`, bucket S3 dédié, CSP `connect-src` vers le `wss://`.
- Fondateur : base juridique de l'enregistrement ; V2–V4, V7–V9, V11–V13 (dont la visibilité des noms en salle) ; M1–M15 de la discussion.
- Le jour où une suppression d'AG ou une purge d'agence est créée : appeler la purge avec `{ kind: 'MEETING' }` ou `{ kind: 'TENANT' }`.
- Non vérifié : LiveKit Cloud, charge à 300 participants, plusieurs instances de l'API (plafond de discussion par AG propre au processus), effet serveur de `revokeTokenTs`, bascule de largeur à chaud dans un vrai navigateur, `test:isolation`.

Pièges et décisions :

- Pile de recette locale gratuite : conteneurs `immotopia-visio-net` (Redis, propriétaire de l'espace réseau et des ports 7880/7881/7882/8333), `immotopia-livekit-dev`, `immotopia-visio-s3` (SeaweedFS : les images MinIO ne sont plus publiées), `immotopia-visio-egress`, ARRÊTÉS : les redémarrer dans cet ordre avec `docker start`. Configuration de développement dans le scratchpad des sessions, jamais dans le dépôt ; mode d'emploi dans `docs/recette/SCENARIO_SYNDIC_AG_VISIO.md`.
- LiveKit sous Docker Desktop : sans `node_ip` et avec `enable_loopback_candidate: true`, sinon le Chrome de l'Egress refuse le candidat de boucle locale.
- `React.StrictMode` montait la salle deux fois : la connexion part un tick après le montage (`StableLiveKitRoom`).
- Changer de langue pendant la visio remonte l'application (`key={language}`) et coupe la salle : limite documentée, non corrigée.
- Instance de démo : worktree `.claude/worktrees/demo` détaché sur `95e9b0d9`, migrations appliquées sur `immotopia_demo` jusqu'à `20261016150000`, serveurs arrêtés ; `demo:sync` exige `packages/api/.env.demo` (absent). Données de recette : AG « recette visio » et « recette visio 2 » dans « Horizon Syndic Gestion ».
- `deleteRecording` écrit son audit critique dans la transaction depuis la branche `fix/syndic-ag-audit-critique-enregistrement` (section ci-dessous) ; `prisma/seed.ts`, le seed de démo Syndic et une suppression SQL manuelle d'agence laissent les MP4.
- `npm run i18n:extract` salit tout l'arbre : traductions de ces lots ajoutées à la main. Tests instables surveillés : `MeetingLiveConsole.test.tsx` (« supprime après confirmation »), `property-ownership.test.tsx`.
- Classeur des fonctionnalités en conflit à chaque fusion : reporter ligne à ligne les lignes de la branche sur la version de `main` (openpyxl, `difflib` sur les lignes de la table `SousFonctionnalites`), puis `wiki:export` et comparer le miroir.

## Branche `fix/i18n-extracteurs-cles-dynamiques` — 2026-10-17

**État :** prêt à relire — PR https://github.com/bkourouma/immotopia/pull/154 (base `main`), CI en cours à l'ouverture ; worktree `.claude/worktrees/distracted-greider-b4a494` (jonctions `node_modules` à retirer avec `rmdir`/`Directory.Delete($p, $false)`, jamais `rm -rf`).
**Dernier commit :** voir `git log` (poussé sur origin).

Fait :

- `npm run i18n:extract` (web `apps/web/scripts/i18n-migrate.mjs`, API `packages/api/scripts/i18n-extract.mjs`) ne supprime PLUS jamais une traduction non vide : une clé non recensée mais traduite reste dans le catalogue (le bilan la compte, `--unreferenced` la liste). Plus aucun `*.orphans.json` sans `--prune` ; `--prune` fusionne par union avec le fichier existant, qui n'est jamais supprimé. Reproduit sur `main` avant correction : 172 entrées par langue perdues côté web (dont 161 = celles de la PR 151), 69 côté API.
- Clés dynamiques recensées : résolution automatique des constantes de niveau module du même fichier (`t(CAPACITY_LABELS[k] ?? …)`, `throw notFound(MESSAGE)`) et marqueur `// @i18n-keys [noms…]` sur sa propre ligne. Documenté dans `docs/architecture/i18n.md` (section « Clés dynamiques »). Marqueur posé sur `OWN_ASSETS_ONLY_MESSAGES` (`middleware/error-middleware.ts`).
- Nouvelles options communes : `--check` (sans écriture, exit 1 s'il y a à écrire), `--dry`, `--prune`, `--unreferenced`, `--root=<dossier>` ; option inconnue = exit 2. Scripts `i18n:check` dans les deux paquets. Bibliothèque partagée `scripts/i18n/catalog.mjs`. Les catalogues existants gardent leurs fins de ligne et ne sont plus réécrits quand le contenu est identique.
- Le web ne réécrit plus `pages/CoOwnerPortal/ChargeCalls.tsx` (`MTN Money` ajouté aux noms propres).
- Les clés dynamiques jusque-là jamais recensées (donc jamais traduites : 14 côté web, 37 côté API) sont traduites en/ar.
- Test : `packages/api/__tests__/unit/i18n-extractors.test.ts` lance les deux scripts pour de vrai sur des paquets jetables (perte, clés dynamiques, point fixe, `--check`, `--prune`, CRLF).

Reste à faire :

- Fusionner la PR 151 (restaure et traduit les clés de la PR 132) : c'est elle qui rend `main` point fixe. Vérifié sur l'arbre de la branche de la PR 151 + ces traductions : `--check` → « Catalogues à jour. » dans les deux paquets, aucun orphelin, 0 source réécrite. Sur `main` seul, le premier passage ajoute encore 176 clés web et 41 clés API (paiement mobile, traduites dans la PR 151) et remet en ordre une quinzaine de catalogues (ordre trié non respecté par des ajouts manuels) ; une fois la PR 151 fusionnée, plus rien.
- `--check` n'est PAS branché dans la CI (les catalogues dérivent d'une PR à l'autre) : à décider, une fois `main` propre.
- Les traductions « non référencées » conservées (web 171 dont 44 doublons d'une clé référencée dans un autre module ; API 49) sont des restes (textes retouchés, anciennes versions sans accents, clés d'audit disparues) : à examiner avec `--unreferenced`, puis `--prune` si on veut les sortir. Une partie côté API a un littéral présent dans le code sous une forme non reconnue (messages Zod `.min(1, '…')`, `super('…')`, `{ message: '…' }`) : y poser `// @i18n-keys` si on veut qu'elles soient recensées.

Pièges :

- Les mentions « ne pas lancer `i18n:extract` » des sections voisines de ce fichier datent d'avant ce correctif ; elles restent vraies pour le bruit d'ordre et les 176/41 clés ajoutées vides tant que la PR 151 n'est pas fusionnée.
- Un `// @i18n-keys` suivi d'un mot sur la même ligne lit ce mot comme un nom de propriété ; un commentaire collé en fin de ligne de code n'est pas vu.
- Le `trim()` de `record()` côté API reste (une clé avec espaces en tête, comme `'  - Discussion : non renseignée.'`, est recensée sans ses espaces alors que `t()` la cherche avec) : écart préexistant, non traité.
- Ne pas copier `apps/web/src` « sous la main » pour essayer : utiliser `--root=<copie>`.

## Branche `fix/syndic-ag-audit-critique-enregistrement` — 2026-10-17

**État :** prêt à relire (PR sur `main` ; les PR 144 et 145 y sont fusionnées). Worktree `.claude/worktrees/bold-wilson-73a664`, avec trois JONCTIONS `node_modules` vers ceux de `suspicious-cartwright-fc4a4c` (seul client Prisma qui connaît `GMRecording`) : les retirer avec `rmdir` AVANT tout `git worktree remove`.
**Dernier commit :** `fd518c11` fix(syndic): écrire l'audit de suppression d'un enregistrement d'AG dans la transaction (suivi du commit de ce carnet).

Fait :

- `deleteRecording` (`lib/syndics/meeting-recording.ts`) : passage en `DELETED` et `recordAuditEvent(tx, SYNDIC_MEETING_RECORDING_DELETED)` dans un même `prisma.$transaction` ; fichier puis objet S3 toujours effacés d'abord ; 409 inchangé ; le statut lu est dans le `where` (double suppression = 200 + 409, une seule trace).
- Tests : `syndics.meeting-recording` (client de transaction, suppressions simultanées, échec de l'audit = 500), `audit-critical-transactional` étendu aux deux fichiers d'enregistrement. 4 suites ciblées vertes (87 tests), `tsc --noEmit` de l'API à 0 erreur avant et après.

Reste à faire :

- Relecture et fusion de la PR par l'utilisateur, puis supprimer cette section.
- Hors périmètre, relevé par un balayage des clés `critical` : `AI_ACTION_EXECUTED` (`lib/ai/actions/execute-capability.ts`, `execute-rental-document.ts`) et `AUDIT_INTEGRITY_FAILED` (`jobs/audit-maintenance-job.ts`) passent encore par `logAuditEvent`, sans transaction métier autour.

Pièges et décisions :

- Si l'audit échoue, la transaction est annulée mais le fichier et l'objet S3 sont déjà effacés : la ligne reste `AVAILABLE`/`FAILED` sans fichier (lecture en 404) et une nouvelle suppression réussit (ENOENT toléré). Choix assumé pour garder l'ordre « fichier d'abord ».
- La base en mémoire des tests n'a pas de retour arrière : l'annulation sur échec d'audit n'est pas vérifiable en test API.

## Branche `fix/yousign-sandbox-staging` — 2026-10-16

**État :** prêt à relire — PR https://github.com/bkourouma/immotopia/pull/146 (base `main`), mise à jour avec `main` le 2026-10-16 (a0b94a2e, PR 149, puis 80d1c6a0, PR 147) : seul `HANDOFF.md` était en conflit chaque fois, toutes les sections sont gardées (worktree `.claude/worktrees/loving-moser-776024`, jonctions `node_modules` retirées hors commit)
**Dernier commit :** voir `git log` (poussé sur origin) ; le code est dans `b7567aa4` fix(config): autoriser la sandbox Yousign sur le staging avec YOUSIGN_ALLOW_SANDBOX, les commits suivants ne touchent que `HANDOFF.md` et `DEPLOIEMENT.md`

Fait : `YOUSIGN_ALLOW_SANDBOX` (`0`/`1`, défaut `0`) dans `config/env.ts` lève le seul refus « base SANDBOX Yousign en production » (le staging tourne en `NODE_ENV=production`) ; l'avertissement « aucune valeur » reste et suit toute base contenant « sandbox ». `deploy.sh prod` refuse `YOUSIGN_ALLOW_SANDBOX=1`. Tests dans `env-signature-yousign.test.ts` (5 suites env/SMS, 68 tests verts), docs `signature-prestataire.md`, `DEPLOIEMENT.md` (« Lot 044 »), `SECURITY.md`, `env.example`. Classeur des fonctionnalités non touché (configuration d'exploitation).

Reste à faire (par l'utilisateur, sur le serveur, après fusion de la PR et déploiement du staging par la CI) :

- Dans `/home/deployer/immotopia-saas.env` : remplacer `SIGNATURE_PROVIDER=internal` (valeur actuelle) par `SIGNATURE_PROVIDER=yousign`, puis `YOUSIGN_API_KEY` et `YOUSIGN_WEBHOOK_SECRET` de la **sandbox**, `YOUSIGN_API_BASE_URL=https://api-sandbox.yousign.app/v3`, `YOUSIGN_ALLOW_SANDBOX=1` ; puis `./infra/scripts/deploy.sh staging --no-build`.
- Déclarer le webhook dans la sandbox Yousign : `https://app.immotopia.cloud/api/public/signature-provider/yousign`.
- Vérifier au démarrage l'avertissement « les signatures n'ont aucune valeur » dans le journal de l'API.

Pièges et décisions :

- **Fichier de secrets du staging antérieur à `make-env.sh` (relevé de l'utilisateur sur le serveur, 2026-10-16, non revérifié depuis le dépôt) :** il ne portait que `NODE_ENV=production` et `BACKEND_URL=https://app.immotopia.cloud` parmi `SIGNATURE_PROVIDER`, `SMS_PROVIDER`, `PAYMENT_GATEWAY_SIMULATOR` et la configuration e-mail : un fichier ancien ne reçoit pas les réglages que `make-env.sh` écrit pour un fichier neuf, et le tableau « Vue d'ensemble » de `DEPLOIEMENT.md` décrit la cible, pas cet état. Corrigé le soir même à la main : `SIGNATURE_PROVIDER=internal`, `PAYMENT_GATEWAY_SIMULATOR=1`, e-mail par `set-email-smtp.sh` (boîte dédiée staging, port 465, `verify()` nodemailer « SMTP OK »), `deploy.sh staging --no-build` passé. `SMS_PROVIDER` reste absent (`disabled`) ; Orange exige d'abord un nom d'expéditeur personnalisé approuvé (voir la section `fix/seed-fichiers-volume` ci-dessous) ; Yousign attend cette PR. Noté dans `DEPLOIEMENT.md` (section « Lot 044 » et « Points ouverts »). Non vérifié ici : `PLATFORM_PAYSECUREHUB_MODE=SIMULATOR` dans ce fichier.
- `SIGNATURE_PROVIDER` est unique : avec `yousign`, SMS, WhatsApp et « sur place » sont refusés ; le SMS Orange CI se teste avec `SIGNATURE_PROVIDER=internal` et `SMS_PROVIDER=orange` (compte dédié au staging). `SMS_PROVIDER=log` est refusé sur le staging (`NODE_ENV=production`).
- Non éprouvés : `deploy.sh prod` (seul le motif `grep` a été essayé), le démarrage réel du staging avec Yousign sandbox, l'envoi ou non de vraies invitations par la sandbox Yousign (n'y saisir que des adresses de test).
- `YOUSIGN_API_KEY` n'est pas dans `INTEGRATION_KEYS` de `deploy.sh` (décision : une clé sandbox n'est pas un identifiant de production).
- Les jonctions `node_modules` du worktree se retirent avec `rmdir` (jamais `rm -rf`) avant tout `git worktree remove`.

## Branche `feat/syndic-acces-portail-visible` — 2026-10-16

**État :** prêt à relire — PR https://github.com/bkourouma/immotopia/pull/147 (base `main`), CI en cours à l'ouverture ; fusion par l'utilisateur
**Dernier commit :** `76d61ad7` feat(syndic): afficher l'accès au portail copropriétaire par lot (+ ce commit de passation)
**Worktree :** `.claude/worktrees/serene-hawking-f4a5a3` (jonctions `node_modules` retirées en fin de session : les reposer pour retester)

Fait : recette du 2026-10-16 (staging) — un testeur ne voyait pas quels copropriétaires ont un accès au portail. Aucune route ajoutée : `GET .../syndics/:id` et `GET .../lots` chargent `portalAccessEnabled` avec les profils propriétaires déjà lus et renvoient `portalAccess` { status NONE/INACTIVE/PARTIAL/ACTIVE, activeCount, ownerCount } par lot (`presentSyndicateLots`, `lib/syndics/lot-owner.ts`). La fiche renvoie maintenant `owners`/`ownersLabel` comme la page « Lots » (plus de profils bruts). Colonne « Portail » dans `LotTable` (fiche + page « Lots »), lien « Gérer l'accès » vers `/profils-incidents`, indicateur « Lots avec accès au portail ». Six clés en/ar, classeur (992 lignes) et miroir à jour. Tests : `SyndicLotPortalAccess.test.tsx`, `syndics.lots-portal-access.test.ts`, `syndics.lot-owner.test.ts`.

Reste à faire :

- Regarder le rendu sur le staging après déploiement (fiche et page « Lots », arabe/RTL) : aucune recette visuelle n'a été jouée (pas d'API ni de base dans la session).
- Dette hors périmètre : `npm run i18n:extract` à lancer pour le paiement mobile (PR 132) — plusieurs centaines de clés sans traduction dans `syndic.json` et remaniements d'autres catalogues ; ne pas le lancer « pour ajouter une clé » dans une PR de fonctionnalité.

Pièges :

- Jonctions `node_modules` vers le checkout principal = client Prisma partagé, plus ancien que le schéma d'origin/main (scope `CHARGE_CALL_PAYMENT`) : les suites Jest d'API qui montent `syndic-routes` échouent en ts-jest sur `lib/secure-links/service.ts`. Vérification locale avec une config Jest `isolatedModules` (comme le projet `api-app`) ; la CI régénère le client.
- Le motif `__tests__/unit/syndics` capte aussi `syndics.*-fixtures.ts` (fichiers sans test : « must contain at least one test »), faux échecs.
- Retirer les jonctions sans jamais suivre leur cible (jamais `rm -rf`), avant de supprimer le worktree : sous PowerShell, `[System.IO.Directory]::Delete($chemin, $false)` après avoir vérifié `LinkType -eq 'Junction'`. `cmd /c rmdir` lancé depuis Git Bash est mal interprété (`/c` converti en chemin) et ne retire rien.

## Branche `fix/seed-fichiers-volume` — 2026-10-16

**État :** prêt à relire (PR https://github.com/bkourouma/immotopia/pull/149, base `main`, CI en cours) ; worktree `.claude/worktrees/distracted-wu-7f2ca7`, `node_modules` = jonctions vers le checkout principal.
**Dernier commit :** voir `git log` (poussé sur origin).

Anomalie de recette du staging : sur « Pack Agence · 3 ans », « Envoyer pour signature » du bail BAIL-2026-0052 répondait « Fichier du document invalide » (`getDocumentFile`).

Cause : `seed-pack-tests.sh` lance le seed dans un conteneur `migrate` jetable ; trois écrivains ignoraient `UPLOADS_DIR` et écrivaient sous `getProjectRoot()/assets/...` (= `/repo/assets/...`, perdu à la fin du conteneur) : `saveRentalDocx` (`agence-locatif-files.ts`), `seedDocumentTemplates` (`agence-commercial-docs.ts`), `writeGeneratedDocx` (`patrimoine-extras-files.ts`). Les lignes `RentalDocument.file_path` pointent donc vers des fichiers disparus et hors des dossiers autorisés. Découverte en plus : l'image `migrate` (cible `build` du Dockerfile) n'embarque pas `assets/`, donc `seedDocumentTemplates` ignorait les modèles livrés (« modèle de base introuvable ») : les agences de test n'ont peut-être AUCUN modèle propre.

Fait :

- Les trois écrivains passent par `utils/assets-paths.ts` (nouveau `getGeneratedDocumentDir`, repris par `saveGeneratedDocument` : un seul découpage `<agence>/<type>/<AAAA>/<MM>`), donc sur le volume quand `UPLOADS_DIR` est posé. Même correction dans la branche REFRESH de `document-templates-seed.ts`.
- `seed-pack-tests.sh` monte `assets/` du dépôt en lecture seule dans le conteneur et gagne `--repair-files` (refuse `prod` comme le reste).
- `prisma/seeds/repair-pack-test-files.ts` + `pack-history/repair-files.ts` : répare les `RentalDocument` (docx reconstitué avec `buildDocx` depuis la ligne, `file_hash` mis à jour) et les `DocumentTemplate` (copie du modèle livré) des 12 agences de test ; idempotent, n'affiche que des compteurs.
- Tests : `pack-history.generated-files-paths.test.ts`, `pack-history.repair-files.test.ts`. Doc : `DEPLOIEMENT.md` (« Comptes de test par pack »).

Reste à faire (par l'utilisateur, sur le serveur, après `deploy.sh staging` qui reconstruit l'image `migrate`) : `./infra/scripts/seed-pack-tests.sh staging --repair-files`, puis, si le compte rendu signale des agences sans modèle propre, `./infra/scripts/seed-pack-tests.sh staging`. Ensuite rejouer « Envoyer pour signature » sur BAIL-2026-0052.

Pièges et non vérifié :

- Rien n'a tourné sur le staging ni sur une base réelle : tests unitaires sur disque temporaire et base simulée seulement.
- Les gabarits globaux (`db:seed:document-templates`) ne sont toujours pas posés par `bootstrap.sh` : sans modèle d'agence, la génération d'un nouveau contrat échoue (« Aucun template disponible »).
- La signature convertit le DOCX en PDF (LibreOffice de l'image runtime) : non vérifiée sur un document reconstitué.
- Les fichiers réparés sont créés par root dans le conteneur ; le script refait le `chown` du volume.

Relevés de recette du staging, 2026-10-16 (Claude dans Chrome, rapportés par l'utilisateur ; pas relus ici) :

- Contournement validé sans cette PR : sur « Pack Agence · 6 mois », le modèle `assets/modeles_standard/bail_habitation.docx` téléversé par l'interface puis défini par défaut ; contrat généré sur BAIL-2026-0008 ; envoi pour signature par e-mail à deux signataires, codes reçus, les deux ont signé, document scellé, « Piste de preuve intacte ». La signature interne fonctionne donc de bout en bout sur le staging, et la conversion DOCX → PDF par LibreOffice de l'image Docker est vérifiée en réel pour la première fois. Contenu du PDF signé pas encore relu.
- Paiement mobile money d'un appel de charges (copropriété « Résidence Les Jacarandas », agence « Pack Syndic · 3 ans », mode Simulateur) réussi de bout en bout : reçu Q-2026-000093, statut « Payé », compte 5525 crédité.
- Réglages du staging complétés le 2026-10-16 dans son fichier d'environnement (aucune valeur ici) : `SIGNATURE_PROVIDER=internal`, `PAYMENT_GATEWAY_SIMULATOR=1`, clé `PAYMENT_SECRETS_KEY` propre au staging, SMTP configuré (vérifié). `SMS_PROVIDER` reste `disabled` : l'application Orange « ImmoTopia Staging » existe, mais Orange exige un nom d'expéditeur personnalisé approuvé (demande « IMMOTOPIA », à déposer par l'utilisateur) avant tout achat de forfait.

## Branche `fix/paiement-mobile-signature-defauts` — 2026-10-16

**État :** prêt à relire (PR ouverte vers `main`, voir `gh pr list`), worktree `.claude/worktrees/affectionate-mendeleev-85d25c` (`node_modules` propre par `npm ci`, pas de jonction).
**Dernier commit :** voir `git log` de la branche (poussée sur origin).

Correctifs des défauts relevés le 2026-10-16 en relisant les PR fusionnées #132 (paiement mobile des charges de copropriété) et #141 (signature électronique). Les sections `feat/syndic-paiement-mobile` (#132) et `feat/finance-fournisseurs-tresorerie` (#142), fusionnées, sont retirées ; leurs restes encore ouverts sont repris ci-dessous.

Fait :

- Impasse de décision levée : un `REVIEW` `CONTRARY_STATE` sans encaissement (succès fournisseur après expiration) s'accepte en encaissant ou se refuse ; avec encaissement, inchangé (`checkout-review.ts`, spec R21, contrat §1.7). Raison explicite et texte « le montant demandé sera enregistré » quand le fournisseur ne rapporte pas de montant.
- Écran « Paiements en ligne » : Vérifier, Trancher, reversements derrière `SYNDIC_EDIT` ; configuration et test derrière `SYNDIC_EDIT` + `TENANT_SETTINGS_EDIT` (`useMyMenuAccess`).
- T075 : l'écran Charges propose le lien « Payer cet appel » par la fenêtre de la PR 150 (`ChargeCallPaymentLinkModal`, bouton « Lien de paiement », devises XOF/FCFA, droits création/consultation) ; l'implémentation concurrente de cette branche (bouton + tiroir) a été retirée à la fusion de `main` du 2026-10-18. Reste de cette branche sur ce sujet : `Cache-Control: no-store` sur la réponse qui porte l'URL.
- Signature : rôle et canal en libellés (page `/signer/:jeton`, certificat PDF via `lib/signature/labels.ts`), libellé de `IN_PERSON_TOKEN_ISSUED`, `q` accepté par `GET /api/signatures/summary`, champ `canEdit` (liste et détail) qui masque Relancer/Annuler.
- Traductions en/ar : 238 libellés (web `common`, `syndic`, API). Classeur : 23 lignes ajoutées, 14 modifiées (1015 lignes après fusion de main, qui en ajoutait une).

Reste à faire :

- Extracteur i18n : `npm run i18n:extract` (web et API) retire des catalogues des clés encore utilisées dynamiquement (`t(CAPACITY_LABELS[...])`…) et un second passage efface le fichier d'orphelins ; 460 entrées ont été restaurées à la main. Ne pas relancer l'extracteur tel quel avant correction (session de suivi proposée).
- Audit du 2026-10-16, basses non traitées : refuser un succès tardif affiche « échoué » au payeur alors qu'il a été débité (même comportement que les autres refus) ; aucun signal quand les appels d'un succès tardif ont été soldés entre-temps par une autre tentative (le montant part en avance du lot).
- Hérité de #132 : rejouer les tests sur PostgreSQL réel et `npm run test:isolation` ; variables `CHARGE_CALL_PAYMENT_LINK_SENT` dans `apps/web/src/constants/whatsapp-notification-variables.ts` ; mutualiser `isCurrentLotOwner` ; GET de statut du portail sans revérification du droit SYNDIC (contrat §2 à aligner) ; exercice clos 409 contre 400 au contrat ; décisions encore à prendre par l'utilisateur (WhatsApp du lien activé par défaut, mode LIVE et frais BMI, deux copropriétés sur un même compte marchand).
- Recette navigateur du lien de paiement (fenêtre de la PR 150) et de l'écran Paiements en ligne au simulateur non faite ; panneaux de signature intégrés (bail, mandat, état des lieux, compromis) non alignés sur `canEdit`.

Pièges :

- Pas de nouvelle valeur d'enum `SyndicReviewKind` : le cas « succès tardif » se reconnaît à `CONTRARY_STATE` + `chargePaymentId` nul.
- Le certificat PDF reste en français pour une demande en arabe (polices PDF standard, `safeText`).
- Tests lourds lancés en parallèle par plusieurs agents : jest tué (SIGTERM) et `tsc` web à court de mémoire ; relancer avec `--maxWorkers=2` ou `NODE_OPTIONS=--max-old-space-size=8192`.

## Branche `feat/syndic-lien-paiement-ui` — 2026-10-16

**État :** prêt à relire — PR https://github.com/bkourouma/immotopia/pull/150 (base `main`), CI à lire, à fusionner par l'utilisateur ; worktree `.claude/worktrees/brave-noether-f68511` (`node_modules` = jonctions vers le checkout principal : son client Prisma est plus ancien, ne pas lancer `prisma generate` ni le typecheck API ici)
**Dernier commit :** voir `git log` (poussé sur origin).

Suite de la PR #132 (paiement mobile des appels de charges par les copropriétaires, spec `specs/042-syndic-paiement-mobile/`), fusionnée et déployée sur le staging le 2026-10-16 ; paiement par le portail recetté avec succès.

Fait :

- Lien « Payer cet appel » côté gestionnaire (`Syndic › Finances › Appels de charges`, colonne Actions) : `ChargeCallPaymentLinkModal` (copier avec URL montrée une fois, envoyer par e-mail ou WhatsApp, liste des liens, révoquer), hook `useSyndicOnlinePaymentUsable` (lit `usable` de la configuration), `canOfferChargePaymentLink` dans `ChargeCallTable`, câblage dans `SyndicCharges`. Droits : écriture `SYNDIC_EDIT` (après lecture des droits), liste `SYNDIC_VIEW`. Aucune route API modifiée.
- Revue `security-auditor` du diff web : 0 critique, 0 important, 3 mineurs corrigés (champ de copie de repli retiré en `finally`, URL effacée au changement d'appel, fenêtre non fermable par le fond pendant que l'URL est visible).
- Variables WhatsApp (`apps/web/src/constants/whatsapp-notification-variables.ts` ; le fichier côté API n'existe pas) pour `CHARGE_CALL_PAYMENT_LINK_SENT`, `CHARGE_CALL_ISSUED`, `CHARGE_CALL_REMINDER`.
- `npm run i18n:extract` web et API, puis traductions en/ar (183 clés web par langue, 36 + 16 clés API par langue).
- Classeur : 24 lignes ajoutées, 4 mises à jour, 3 notes, miroir régénéré (1015 lignes).
- Recette du staging du 2026-10-17 (copropriété Les Jacarandas, appel P02, simulateur : « Solde insuffisant », « Annuler », « Payer » → ni ligne ni compteur « Annulé ») : **pas de défaut du moteur trouvé**. Le test `syndics.online-payment-simulator-sequence.test.ts` rejoue la séquence avec le vrai client simulateur : chaque essai sur une nouvelle tentative donne Échoué, Annulé, Payé, tous listés et comptés. Deux causes possibles côté recette, à départager par le code `IMS-…` de l'adresse de retour (`?paiement=`) après chaque clic : (1) « Annuler » cliqué sur la page périmée d'une tentative déjà close (bouton Précédent) : rien n'est enregistré, le retour affiche l'ancien statut ; (2) rapprochement en échec après « Annuler » (erreur avalée par le contrôleur, journal `Simulateur PaySecureHub (charges) : rapprochement en échec`) : la tentative reste en attente et le « Payer » suivant la reprend (R10). Amélioration possible, non faite : la page du simulateur d'une tentative close pourrait afficher son état au lieu des trois boutons.
- Vérifié : tsc web 0 erreur, eslint 0 erreur, `check:architecture`, `wiki:check`, Vitest syndics / portail copropriétaire / pages publiques / i18n verts, Jest `i18n-*` API verts.

Reste à faire :

- **Recette navigateur du lien gestionnaire au simulateur** (non faite : tests Vitest seulement) ; relecture `code-reviewer` non faite sur l'ensemble de la spec 042 ; rejouer les tests du module sur PostgreSQL réel (Docker était arrêté pour la PR #132), `npm run test:isolation`.
- **Outil d'extraction i18n** : `apps/web/scripts/i18n-migrate.mjs` et `packages/api/scripts/i18n-extract.mjs` déplacent vers `*.orphans.json` les traductions utilisées via `t(variable)` (invisibles). Elles ont été restaurées à la main (47 clés web par langue, 36 clés API par langue) ; la prochaine extraction les déplacera de nouveau et le test de complétude refusera le fichier d'orphelins : corriger l'outil (garder toute entrée dont le texte figure encore dans `src`) avant la prochaine extraction.
- Catalogues déjà fautifs dans `main` : `en/syndic.json` (37 valeurs en arabe), `en/common.json` (5), `en/documents.json` (1) ; la clé « Mode » vaut « Method » alors que `GatewayConfigCard` s'en sert pour Simulateur / Réel.
- Route de disponibilité du paiement en ligne sans `merchantId`, `apiKeyLast4`, `lastTest` ni solde du 5525 (visibles avec `SYNDIC_VIEW` ; l'interface ne lit que `usable`) ; reversements et décision REVIEW n'exigent que `SYNDIC_EDIT` : basse n° 4 de l'audit de la PR #132, toujours à décider.
- Le GET de statut du portail ne revérifie pas le droit SYNDIC (voulu : un paiement lancé doit pouvoir se rapprocher) ; contrat §2 à aligner. Exercice clos : `assertFiscalYearOpenTx` lève un 409, le contrat §0.2 / §1.7 dit 400 : corriger le contrat.
- Mutualiser `isCurrentLotOwner` (dupliqué dans `notifications.ts` et `charge-call-link.ts`) ; `copyToClipboard` existe maintenant dans `utils/copy-to-clipboard.ts` et reste dupliqué dans `InstallmentPaymentLinkButton.tsx` et `OwnerStatementSecureLinks.tsx`.
- Changement de comportement à valider : un succès automatique dont les appels sont déjà soldés passe en REVIEW `CALLS_UNAVAILABLE` au lieu d'être mis en avance ; le gestionnaire peut l'accepter (excédent en avance).
- À trancher par l'utilisateur : WhatsApp `CHARGE_CALL_PAYMENT_LINK_SENT` actif par défaut (le lien de loyer est en opt-in) ; langue du libellé « Payer en ligne » ; numéro du reçu absent du statut public (§3.3) ; règle « lot revendu » ; `TENANT_SETTINGS_EDIT` exigé en plus de `SYNDIC_EDIT` pour la configuration (le rôle Gestionnaire ne la détient pas) ; deux copropriétés peuvent partager un compte marchand ; mode LIVE non validé (le montant BMI inclut-il les frais ? sinon REVIEW à tort).

Pièges :

- Ne pas lancer `prisma format` : il réécrit ~600 lignes du schéma.
- Les tests de page Vitest (`SyndicCharges` complet) prennent 15 à 40 s chacun sur ce poste : `vi.setConfig({ testTimeout: 90_000 })` dans `SyndicChargesPaymentLink.test.tsx` ; un timeout seul ne prouve rien, relancer le fichier seul.
- Dans l'outil Bash de cette session, un heredoc perd un antislash (`\` devient `\`) : écrire les scripts à expressions régulières avec l'outil d'écriture de fichier.
- Pas de colonne `mode` sur `SyndicOnlineCheckout` : le mode affiché vient de la configuration actuelle.

## Branche `ci/deploiement-continu-staging` — 2026-10-16

**État :** prêt à relire — PR ouverte vers `main`, à fusionner par l'utilisateur ; rien n'agit avant la mise en service par le propriétaire
**Dernier commit :** `42707962` correctifs de l'audit de sécurité (+ ce commit de passation)
**Worktree :** `.claude/worktrees/deploiement-continu` (jonction `node_modules` vers le checkout principal)

Fait :

- `.github/workflows/deploy.yml` : staging automatique sur CI verte de `main` (interrupteur `AUTO_DEPLOY_STAGING`), production par « Run workflow » derrière l'environnement `production`, sur le commit du dernier staging réussi. Un groupe de concurrence par environnement.
- `infra/scripts/ci-deploy.sh` : commande imposée des clés SSH (`command=…,restrict`), worker détaché, canal public dédié (`<journal>.public`), journal complet dans `~/ci-deploy-logs/`. Prod : exige un commit déjà déployé avec succès en staging, refuse les retours arrière, sauvegarde et étiquette les images.
- `check-infra.sh` : 18 cas de refus d'arguments. Docs : section « Déploiement continu » de `DEPLOIEMENT.md` (mise en service en 11 étapes), ADR-008, SECURITY.md §8.
- Audit `security-auditor` (1 haute, 4 moyennes, 6 basses) : tout corrigé ou documenté. Simulation Linux réelle (conteneur ubuntu, vrais setsid/flock/tail, faux deploy.sh) : 42/42, dont coupure SSH en plein déploiement, client parti avant le début, file bornée, réécriture du script par son propre `git merge`.

Reste à faire (propriétaire) :

- FAIT le 2026-10-16 par le propriétaire : ruleset « Protection de main » (id 25223655, actif, aucun contournement) : PR obligatoire à 0 relecture, 7 contrôles CI requis, ni force-push ni suppression. Plus aucun push direct sur `main`.
- Fusionner la PR, puis suivre la suite de la mise en service de `DEPLOIEMENT.md` : `sshd`, clés ed25519, `authorized_keys`, `known_hosts`, environnements GitHub, secrets, tests négatifs, premier essai staging, puis `AUTO_DEPLOY_STAGING=true`.
- Rien n'a tourné sur le serveur ni chez GitHub : tout est « non éprouvé ».

Pièges :

- `workflow_dispatch` exécute le fichier de la branche choisie : seule la règle « Deployment branches : main » des environnements protège les secrets.
- Un essai manuel sur le serveur (checkout hors `origin/main`) bloque le déploiement CI : c'est voulu.
- Un changement de `ci-deploy.sh` ne s'applique qu'au déploiement suivant.
- Python lancé par heredoc depuis Git Bash lit le texte en cp1252 : pour une retouche de texte accentué, passer par l'outil d'édition.

## Branche `feat/pwa-mobile` — 2026-10-15

**État :** prêt à relire (PR ouverte sur `main`)
**Dernier commit :** voir `git log` de la branche

Fait :

- PWA installable (modèle : Repetiteur_Maison) : `apps/web/public/manifest.webmanifest`, icônes `public/icons/` (script `scripts/make-pwa-icons.ps1`), `sw.js`, `hors-ligne.html` ; `src/pwa/{register,install}.ts`, bouton `components/pwa/InstallAppButton` (page de connexion + menu utilisateur) ; blocs nginx `/sw.js`, `/hors-ligne.html`, manifeste et `/icons/` dans `infra/nginx/spa.conf`.
- Le service worker ne met JAMAIS en cache `/api`, `/uploads` ni les pages de navigation : seulement `/assets`, `/fonts`, `/icons`.
- Vérifié dans Chrome sur le build de production : service worker activé, bouton d'installation affiché, API non mise en cache. Tests : `src/pwa/__tests__/pwa.test.ts`.

Reste à faire :

- Non vérifié : installation réelle sur Android/iOS, pas de déploiement (staging puis prod via `deploy.sh`, l'image web doit être reconstruite) ; le mode hors ligne réel (coupure réseau) n'a été testé que par test unitaire.
- Pas de notifications push ni de données hors ligne (choix volontaire : données d'agence jamais stockées sur l'appareil).

Pièges et décisions :

- Le checkout principal avait un `node_modules` incomplet ; le worktree `.claude/worktrees/pwa` a ses propres dépendances (`npm ci --ignore-scripts`).
- `npm run i18n:extract` sur `main` réécrit ~14 catalogues (dérive d'autres PR) : seules mes 2 clés ont été gardées.
- Le navigateur intégré de l'app Claude refuse les service workers : tester dans Chrome.

## Branche `feat/export-tableaux` — 2026-10-15

**État :** PR #131 (base `main`), worktree `.claude/worktrees/export-tableaux` (jonctions `node_modules`)
**Dernier commit :** voir `git log` (correctifs d'export, puis cette passation)

Fait :

- Socle `apps/web/src/utils/table-export/`, `primitives/ExportMenu.tsx`, `primitives/Table.tsx`, prop `export` de `DataView` (actif par défaut), champs de colonne `exportable`/`exportTitle`/`exportValue`, `collectAllPages`. Déployé sur 156 fichiers ; classeur des fonctionnalités ; traductions en/ar.
- Les 8 fichiers de test en échec dans la suite complète passent SEULS (`finance/stock` : 51 tests mais 449 s, lenteur préexistante).
- Build OK ; entrée 226 050 o gzip, budget 227 328 o (marge 1 278 o) ; `exceljs` et `jspdf` hors entrée.
- Relecture des lots (agent sonnet, lecture seule) : filtres des `fetchAll`, `exportValue` et `exportable={false}` conformes. Corrigé : export complet de la recherche de contacts (`AdvancedContactSearch`), soldes Débiteur/Créditeur exportés en nombre signé (+ débiteur, − créditeur) avec titre de colonne dédié.
- `NewsletterListsPage` : `exportFetchAll` branché (tous les abonnés de la liste).
- Recette navigateur (instance de démo, web servi depuis le worktree) : Biens en grille, EN, CSV/Excel/PDF — CSV conforme, xlsx valide (nombres typés, en-tête figé, filtre automatique, pas d'actions), PDF 1 page. Collaborateurs en arabe : CSV avec BOM et en-têtes arabes ; PDF → repli impression (toast « Enregistrer en PDF »), aucun fichier.

Reste à faire :

- Non vérifié en réel : export multi-pages (Baux paginé : la base de démo n'a aucun bail ni de liste de plus d'une page ; seuls les tests unitaires de `collectAllPages` le couvrent), page de portail, xlsx/PDF en arabe.
- Les filtres de colonne côté client d'Ant Design ne restreignent pas l'export.
- Passer la PR en prête quand la CI est verte ; ne pas fusionner.

Pièges :

- Le dépôt partage l'instance de démo (`.claude/worktrees/demo`) : une autre session l'a re-synchronisée sur un autre commit et re-semée (autre identifiant d'agence) pendant la recette. Servir le web depuis son propre worktree (API de démo inchangée côté API) et lire l'identifiant d'agence dans les liens du tableau de bord.
- Ports 3300/8800 pris : j'ai utilisé 3310 (web) et 8810 (API, `FRONTEND_URL=http://localhost:3310`).
- En dev, la première importation de `jspdf` fait recharger la page (optimisation Vite) : relancer l'export.
- Ne pas déclencher l'impression en panneau masqué : la boîte native bloque le panneau.
- `apps/web/.env` du worktree (ignoré par git) a servi au lancement ; le laisser ou le supprimer.

## Branche `feat/syndic-ag-en-direct` — 2026-10-15

**État :** prêt à relire — PR https://github.com/bkourouma/immotopia/pull/130, fusion par l'utilisateur
**Dernier commit :** voir `git log` (décisions D1, D3, D7, D13 validées le 2026-10-15)
**Worktree :** `.claude/worktrees/ag-direct`, avec son PROPRE `node_modules` (npm ci, schéma modifié) : pas de jonction à retirer avant `git worktree remove`.

Fait :

- Spec `specs/043-syndic-ag-en-direct/spec.md` (décisions D1–D12 du Pilote, à valider par le fondateur).
- API, web, migration `20261015100000_syndic_ag_en_direct`, wiki des fonctionnalités, revue de sécurité (0 critique/haute ; 1 moyenne + 3 basses corrigées).
- Recette navigateur (`docs/recette/SCENARIO_SYNDIC_AG_EN_DIRECT.md`) jouée sur la démo : 6 anomalies d'écran (BUG-2026-10-15-001 à 006) corrigées dans `7fcbe145` et retestées « passé ». Migration appliquée avec succès sur la base de démo.
- Démo : worktree `.claude/worktrees/demo` sur `7fcbe145`, dépendances propres (réinstallées le 2026-10-15 : la première installation était incomplète, `zod` amputé). Agence de recette « Horizon Syndic Gestion » créée par l'interface dans la base de démo (identifiants de test : `docs/recette/SCENARIO_SYNDIC_MODULES_V2.md` 1.1), copropriété « Résidence Les Flamboyants », 4 lots, 2 AG de recette.

Reste à faire :

- Décisions validées par le fondateur le 2026-10-15 : lien seul suffit (D1), quorum indicatif (D3), décision provisoire masquée au gestionnaire pendant un vote ouvert (D7, fait), téléphone gardé dans la liste des participants (D13).
- Non joué : portail copropriétaire (aucun compte portail dans la démo), boutons de vote en 375 px pendant un vote ouvert, compte rendu Word avec feuille de présence (téléchargement non fait), envoi réel des convocations (démo sans SMTP : « 4 échoué(s) »), `measure:entry`, `test:isolation`, charge du polling sur une grande copropriété.

Pièges et décisions :

- `npm run i18n:extract` supprime des traductions existantes sur ce dépôt (API : 35 clés) et en ajoute des vides : ne pas l'utiliser, éditer les catalogues à la main et relire leur diff.
- Après tout ajout de route API : `npm run ai:catalog` dans `packages/api` (sinon `ai.catalog.test.ts` échoue en CI).
- Ne pas lancer `prisma format` (réaligne ~200 lignes du schéma).
- Recette dans un panneau masqué : l'interrogation se met en pause (`document.hidden`) ; l'agent de recette force la visibilité par JavaScript.
- La base de démo n'avait aucune agence Syndic : le seed des packs a été refusé par l'outil de sécurité ; l'agence a été créée par l'interface avec l'accord de l'utilisateur.

## Branche `fix/docker-modeles-standard` — 2026-10-15

**État :** prêt à relire (PR 135)
**Dernier commit :** voir `git log` de la branche

Fait :

- Modèles Word standard (PR 129) et téléchargements Word syndic (PR 133, avis d'appel `charges/:id/avis.docx`, quittance `quittances/:id/fichier.docx`, convocation `assemblees/:id/lots/:lotId/convocation.docx`) fusionnés dans `main` le 2026-10-15. Le `Dockerfile` ne livrait aucun `assets/` : cette PR ajoute la copie de `assets/modeles_standard`.

Reste à faire :

- Livrer aussi `assets/modeles_documents/*.docx` (baux, reçu, relevé) : fait par la PR 134 (signature électronique, autre session) ; conflit trivial sur le `Dockerfile` attendu entre 134 et 135, garder les deux blocs.
- Déployer le staging (par l'utilisateur) une fois 134 et 135 fusionnées, puis `npm run db:seed:document-templates` pour que le défaut locatif devienne le modèle standard ; ouvrir un document dans Word (jamais fait).
- Limites connues : quittance Word sans tantièmes ni e-mail (le snapshot ne les porte pas) ; convocation sans description par point d'ordre du jour ; pied « Page » du DOCX et libellés PDF arabes en français.

Pièges et décisions :

- `ai.catalog` : toute nouvelle route impose `npm run ai:catalog` (catalog.generated.json).
- Le test `syndics.word-documents` ne compile pas en worktree à cause du client Prisma partagé (erreurs `CapacityKey`) ; il passe en CI.

## État courant (pilote) — 2026-10-13

Toutes les branches qui avaient une section ici sont fusionnées dans `main` ;
leurs sections ont été retirées (historique : `git log`). Ce qui suit est ce
qui reste vrai et ouvert.

### Dépôt et environnements

- `main` = `7effd904` (PR #121, #124 et #125 fusionnées les 2026-10-13 et 14). PR ouverte : #126 (brouillon), voir ci-dessous.
- Staging (app.immotopia.cloud) : code identique à `main`. Le serveur est sur `90de4895` ou plus récent ; depuis, seuls des tests et des docs ont changé, exclus des images par `.dockerignore`. Seed « 3 ans » passé le 2026-10-11. `/health` OK vérifié le 2026-10-13.
- Déploiements : la protection automatique de l'outil refuse aux agents toute commande SSH sur ce serveur (il héberge aussi la production). Ils sont lancés par l'utilisateur : `git fetch && git merge --ff-only origin/main && ./infra/scripts/deploy.sh staging` dans le checkout du serveur.
- Production (clients.immotopia.cloud) : n'a pas reçu les lots 040/041 ni les correctifs postérieurs. Ne pas déployer sans décision. Cycle : `backup.sh prod`, étiquette `avant-AAAAMMJJ`, `deploy.sh prod` sur le même commit que le staging ([DEPLOIEMENT.md](DEPLOIEMENT.md)). Relire avant la prod les migrations d'audit, de patrimoine et de réécriture des paiements Syndic (sauvegarde de base avant).
- PR #126 `fix/recette-operateur-integre` (brouillon), poussée le 2026-10-14 : 9 commits de la recette Opérateur intégré (2026-10-03 ; invitations, admin, navigation par permissions, biens, propriétaires, CRM, locatif), fusion de `main` (`d21a7145`, 16 conflits résolus : catalogues par union des clés, StatusTag, permissions-labels, menu-catalog, role-controller), puis correctifs des relectures (`32d1e156`). Travaillée dans le worktree `.claude/worktrees/oi-integration` (branche locale `integ/recette-oi`, jonctions `node_modules`). **Décisions produit en attente avant fusion :** (1) `useMenuAccess` masque côté web tout menu sans permission, même si l'agence l'a ouvert explicitement dans « Rôles et menus » (contredit Q14 du lot 040 et le commentaire de `PERMISSION_GATED_GROUPS`) ; (2) `MENU_REQUIREMENTS` Finance retire par défaut « Caisse et trésorerie » et « Reversements » aux rôles sans droit financier ; (3) `feeTermsApplyToAllocation` : les encaissements antérieurs aux conditions d'honoraires n'en reçoivent plus jamais (rattrapage `freezeManagementFees` à prévoir). Migration `20261014090000_comptable_lecture_locatif` à appliquer au déploiement. Sauvegarde brute du travail finance non commité de `port-oi` : branche distante `wip/port-oi-finance` (30 fichiers, non vérifiée). Distincte de `origin/test/recette-operateur-integre` (17 commits hors `main`, non fusionnée).
- Autre branche non intégrée : `origin/feat/sms-lot-1` (fondations SMS, fournisseur Orange CI, sans PR). À reprendre ou archiver.
- Worktrees restants sous `.claude/worktrees/` : `oi-integration` (PR #126), `port-oi` (ancien emplacement de la branche, travail finance non commité sauvegardé dans `wip/port-oi-finance`), `recette-packs` (354 fichiers de recette hors dépôt, ne pas le supprimer avec `--force`), `w4-recette`, `w5-recette` (recettes, modifications non commitées), `wiki-patrimoine` (modifications locales du classeur). Les autres ont été supprimés les 2026-10-13 et 14.
- Nettoyage git à décider : branches distantes déjà fusionnées (`feat/controle-stock`, `feat/inventaire-whatsapp`) et branches de passation périmées (`docs/handoff-reprise-2026-09-29`, `docs/spec-fournisseur-sms`, `chore/i18n-syndic-orphelins`, `docs/wiki-fonctionnalites`, anciennes `00x-*`, `salvage/*`, `archive/*`). `HANDOFF_PLAN_2026-09-29.md` est un plan périmé à archiver.
- Fichiers locaux volontairement non commités : `.claude/launch.json` (entrées de recette `rec-*`, `*-oi`, `rec-wa-*` vers des scripts du scratchpad ; ne pas les commiter) et `docs/ImmoTopia_Wiki_Fonctionnalites.xlsx` à la racine de `docs/` (copie périmée ; le classeur de référence est `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx`).

### Déploiement et exploitation

- `assets/` est absent des images Docker (DOCX de baux et quittances, import de gabarits, absents des sauvegardes). Sur le staging, « Générer un contrat » et le téléchargement des quittances du jeu de démonstration ne marchent pas, et `document_templates` reste vide. Ne pas promettre ces documents à un client avant correction (tâche à part ; « Non résolus » de `DEPLOIEMENT.md`).
- Points ouverts de `DEPLOIEMENT.md` : `TENANT_GUARD_MODE` en `warn` (le staging est en `SUBSCRIPTION_ENFORCEMENT=enforce` depuis le 2026-10-03, la garde tenant non) ; Postgres de la prod publié en boucle locale sans usage ; images de base non épinglées ; staging public avec panneau de démo ; scripts `seed-demo-*` non gardés ; géographie CI et fiscalité en `A_VALIDER` ; activation de l'e-mail = adresse vérifiée exigée à la connexion.
- Non éprouvé : restauration réelle d'une sauvegarde, retour arrière par étiquette d'image, rclone, mode `LIVE` de PaySecureHub, rotation locale de `pull-backups.sh`.
- Tâches du propriétaire : `PLATFORM_ISSUER_ADDRESS` et `PLATFORM_ISSUER_PHONE` (factures d'abonnement) ; PaySecureHub en `LIVE` ; stockage distant chiffré (rclone, `BACKUP_RCLONE_REMOTE` dans la crontab ; la copie du poste n'est qu'un complément) ; chiffrer le disque du poste ; supprimer sur le serveur les copies `immotopia-prod.env.bak-*` et `.avant-*` (elles contiennent des secrets) ; tester sur la prod un vrai « Mot de passe oublié » et une vraie connexion Google (écran de consentement à publier « En production »).
- Production, agence AYOU CONSULT : la première invitation administrateur a expiré le 2026-10-07 sans acceptation ; la seconde (2026-10-08) expire le 2026-10-15 à 14:33 UTC. Acceptation non revérifiée depuis le 2026-10-08 ; renvoi éventuel à décider par l'utilisateur.
- Staging, après le déploiement des lots 040/041 : couper les menus hors stock des rôles Magasinier et Chef de chantier (écran Menus, « Toutes les agences (défaut) »). Recette navigateur de l'écran Menus à rejouer sur la version « défaut + surcharge » (faite le 2026-10-04 sur l'ancienne version).
- Mise en service Meta (WhatsApp, `DEPLOIEMENT.md`) et choix de la vision (Gemini ou OpenRouter et sa clé), par le fondateur.
- Seed « 3 ans » : ouvrir les comptes `<pack>-3ans@…` dans un navigateur (par l'utilisateur ou en local : un agent ne saisit pas de mot de passe sur le staging). Le rendu des écrans n'a été recetté qu'à l'API. Les profils « 6 mois » ne reçoivent pas les compléments.
- Nettoyage local : conteneur `immotopia-stock-test` et bases `immotopia_recette_wa`, `immotopia_wa_iso`, `immotopia_rec_*`.

### Produit et décisions métier

- Signature électronique (2026-10-16) : spec `specs/044-signature-electronique/` ; S0-S4 (noyau, bail, mandats, état des lieux, compromis) fusionnés dans main (PR 127). Lots S5-S7 sur `feat/signature-s5-s7` (PR ouverte, non fusionnée) : S5 écran global « Signatures » (`/tenant/:tenantId/signatures`, liste paginée `GET /api/signatures` + `/summary`, relance/annulation/téléchargement, tiroir de détail) et rappels automatiques J-3/J-1 (`SIGNATURE_REMINDER_DAYS_BEFORE`, événement `REMINDER_AUTO`) ; S6 prestataire externe Yousign v3 provisoire (`SIGNATURE_PROVIDER=yousign`, webhook `POST /api/public/signature-provider/yousign` à HMAC, fin de signature, preuve `?variant=evidence`) ; S7 canal SMS (`SMS_PROVIDER` disabled|log|orange, contact CRM requis et numéro identique au contact, indicatifs `SMS_ALLOWED_DIAL_CODES`, plafond `SIGNATURE_SMS_DAILY_LIMIT`). Audit sécurité fait (0 critique/haut), points moyens corrigés. Décisions : Yousign est NON qualifié par défaut (`YOUSIGN_SIGNATURE_LEVEL=electronic_signature`) donc le compromis reste refusé tant que `SALE_AGREEMENT` est dans `SIGNATURE_PROVIDER_REQUIRED_KINDS` et que le niveau n'est pas avancé/qualifié (avis juridique requis) ; quotas par pack provisoires (Agence 20, Syndic 50, Promoteur 20, Intégré 100) et extension « bloc de 50 » non vendable (prix à fixer). Reste : comparaison de prestataires et avis juridique ; recette sandbox Yousign (coordonnées du champ, PDF ou ZIP, preuve à activer auprès du support, date de signature) ; recette réelle Orange CI ; unicité `(providerId, providerRef)` (migration) ; marqueur `REMINDER_AUTO` écrit après l'envoi (renvoi possible après plantage) ; consentement SMS absent du CRM ; entrée de menu Signatures sans contrôle de fonctionnalité ; écrans catalogue/achat de l'extension ; liens de l'écran global vers état des lieux et mandat de gestion ; les 4 migrations de signature jamais appliquées sur une base de test (`test:isolation`, `signature.db.test.ts` jamais exécuté) ; masquage du jeton dans les vhosts nginx (DEPLOIEMENT.md) ; LibreOffice/Docker réels ; rendu des PDF et navigateur (mobile, tactile, arabe) jamais vus. Pièges : noms arabes imprimés en « ? » dans les PDF ; l'extracteur i18n ne voit pas « signatures électroniques ce mois-ci » (tableau) ; le hook de commit refuse `no-control-regex` (utiliser `lib/signature/text.ts`) ; ne jamais retirer une jonction de worktree avec `git worktree remove` ni `rd /s` (incident du 2026-10-16 : le checkout principal a été vidé via les jonctions node_modules) ; `ai.write-plan.test.ts` échoue (6 tests, hors signature).
- Signature électronique, intégration (2026-10-16) : spec renumérotée 044 (043 = AG en direct Syndic ; migrations SQL non retouchées) ; #134 et #136 fusionnées dans leurs bases, S2-S4 ramené dans la branche de la PR 127 (avance rapide `92db7438`) ; `main` fusionné dans la PR 127 (`2639cd4d`, 17 conflits : catalogues i18n réunis — la branche avait perdu 34 traductions API, remises —, wiki fusionné à trois voies, code réuni). Reste : CI de la PR 127, puis fusion. Points : deux migrations au même horodatage `20261015100000` (`signature_enums` et `syndic_ag_en_direct`, indépendantes, ordre alphabétique) ; `prisma generate` du `node_modules` partagé du checkout principal interrompu en EPERM (moteur verrouillé par un serveur) : le relancer serveurs arrêtés ; `@types/archiver` absent du `node_modules` partagé (`npm install` à la racine). Une fusion abandonnée de `main` traîne dans `.claude/worktrees/sig-spec` (base périmée `80da0ba7`) : à abandonner par son auteur.
- Paiement mobile des copropriétaires (2026-10-15) : plan proposé en conversation (lots M0–M6, spec à créer en `specs/042-syndic-paiement-mobile/`), rien de codé, aucune branche. Décisions de l'utilisateur du 2026-10-15 : un compte marchand PaySecureHub PAR COPROPRIÉTÉ (pas celui du cabinet, aucun repli vers lui) ; appels entiers seulement (pas de montant libre) ; frais selon le réglage `feesPaidBy` de l'agence ; lien « Payer cet appel » sans connexion dans les avis et relances inclus dans la livraison (M6). Reste à valider : le compte comptable du solde PaySecureHub de la copropriété et l'écriture de reversement vers le 521. Faits d'ancrage : `OnlinePaymentCheckout` est lié en 1-1 à `RentalPayment` (inutilisable tel quel) ; `ChargePayment` n'a ni clé d'idempotence ni référence fournisseur unique ; le portail `/api/portal/copropriete` échappe au garde d'abonnement ; point d'écriture unique `recordLotPaymentTx` (`lib/syndics/charge-allocation.ts:374`).
- rec040-01 (chantier transverse, non fait) : un magasinier qui saisit l'URL d'une page financière voit une erreur générique au lieu d'un refus. Le web ignore les permissions (`useAuth` ne porte que `globalRole`) et `DataView` ne reçoit qu'un texte. Pistes : exposer les permissions dans `/auth/me`, ou faire passer le 403 jusqu'aux 37 pages financières. Même cause : boutons d'écriture visibles pour un rôle en lecture seule, bouton « Exporter en CSV » du journal d'audit réservé aux `SUPER_ADMIN`.
- Lot 041 : R8.3 non vérifié (la file « À traiter » de l'Accueil prend 4 alertes par source, l'alerte `FIELD_COUNT_CLOSED` sans écart peut manquer) ; cosmétique : « Rien à afficher pour le moment. » sous « Cette alerte est introuvable. ».
- Décisions métier à valider : consolidation et export patrimoine limités aux biens détenus en propre ; comptes 165/758 pour le dépôt de garantie, 411/7083 en gestion directe, 450 sans écriture d'émission d'appel ; libellé juridique de la clause de pénalité ; préavis de bail (3 mois habitation, 6 mois commercial), « FCFA » en dur dans les modèles, texte « par jour de retard » ; liste des statuts fonciers et relecture juridique (conditions d'utilisation, conservation des données par pays, mention « indicatif, non vérifié par ImmoTopia ») avant l'ouverture publique de l'espace particulier ; plafond de surface de l'import (500 000 m²) ; date d'exigibilité de la taxe foncière par pays.
- Anomalies de recette des packs restées ouvertes (`docs/recette/packs/ANOMALIES.md`) : 074 (modèles de contrat de vente Promoteur), 091 (modèles de documents Syndic), restes de traduction 067/093/097/098/100, 095 (libellé du verrou manuel). Questions produit : l'assistant d'un pack Promoteur n'annonce aucune capacité chantier/vente ; pas de champ honoraires dans le mandat de gestion ; colonne « À échoir » de la Balance âgée supérieure au solde (définition à confirmer) ; DEP-289FBAB5 en double au journal Pro ; sélecteur de bien Performance limité à 100 (BUG-2026-10-01-001) ; valeur marchande non rafraîchie (-002) ; noms de biens de recette avec U+FFFD à ressaisir.
- Patrimoine, vague C encore à livrer : vue Groupe, export de ratios, dossier bancaire et déclaration fiscale, multi-devises, démembrement (plan : `docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md`). Lots 5 (exports de la situation patrimoniale) et 6 (paramètres fiscaux par IA, validation personnelle, `TaxParameter` global à porter par tenant) de l'espace particulier non faits.
- Patrimoine, décisions ouvertes : espace particulier (navigation et liste blanche `particulier-routes.ts` sans les lots patrimoine récents ; routes patrimoine laissées sous `PROPERTIES_*`) ; une agence qui perd le pack PATRIMOINE peut encore lire les accès partagés ; raccourci `INSURER_NOTIFIED` vers `SETTLED/REJECTED` ; checkout en `REVIEW` et échéances `DRAFT` (lien de paiement) ; vraie action « marquer prêt » (BUG-2026-10-01-006) ; modèles `.docx` de bail déjà semés gardant l'ancien texte ; arriérés au mois 1 du plan ; `consentWhatsapp` à `true` par défaut en base (pas un vrai consentement) ; bien client sous mandat actif ; un bien hors table d'indivision compte pour 0 % dans les totaux du portail.
- Recettes patrimoine jamais jouées : e-mails d'alerte quotidiens, cas `REVIEW` du paiement, accès partagé expiré, arabe sur « Accès partagés », mobile et RTL de la vague A, paiement mobile money réel (simulateur seulement), réserves cosmétiques de la page publique à 375 px et de « Dernière consultation » à 1920 px. Plan de test manuel des packs Patrimoine (création, passage au Pro, barrière en `enforce`, cumul) jamais rejoué en interface.
- Syndic : la clôture complète d'exercice (report à nouveau, ouverture N+1) n'existe pas ; scénario `docs/recette/SCENARIO_SYNDIC_ESSAI_EXERCICE_COMPLET.md` jamais joué sur la démo. Cause réelle des avis d'appel non envoyés en prod non vérifiée. Pagination « 1–3 sur 3 » non traduite (branche `fix/pagination-i18n` fusionnée dans `main` ; rendu non revérifié dans un navigateur). Les images de marque déjà en 3000 px sont à réimporter.
- Baux : un second contrat sur le même bail est numéroté `<bail>-A2`, `-A3`… sous verrou.
- Défauts de l'application constatés par le seed « 3 ans », non corrigés : `property-quality-service.ts:134` (`field.name.split`, 500 sur tout terrain) ; `Penalties.tsx` lit `adjusted_amount` que l'API ne renvoie pas ; `getTimeSeries` du tableau de bord CRM (semaines futures, dates par `updatedAt`) ; tableau de bord du syndic sans « en retard » dérivé ; `GET /syndics/mandants` et `/rental/installments?status=<invalide>` répondent 500 au lieu de 400 ; `/maintenance/admin/vendors` lit `service_providers` ; `listProperties` masque un bien CLIENT dont le mandat n'est plus actif ; `getPatrimoineOverview` compte les loyers de tous les baux actifs ; l'onglet abonnés d'une liste dynamique lit `newsletter_subscribers` ; le service de salaires crédite toujours la caisse par défaut ; la balance âgée ne lit que les baux ; `createTransfer` numérote par ordre de saisie ; `JournalType` sans achats, ventes, OD ; quotas `ACTIFS` et `PHOTOS_INVENTAIRE` affichés en dépassement et essai à +5 ans (voulu ou hors périmètre ?) ; `rental_refunds`, `crm_notes`, `communications` sans route ni écran.

### IA (ImmoCopilot)

- Cache de prompt Anthropic (`lib/ai/providers/anthropic-provider.ts`, coupe-circuit `AI_PROMPT_CACHE=off`) jamais vérifié en réel : contrôler `cache_read_input_tokens > 0` dans le journal `debug` du staging. Le préfixe doit dépasser le minimum cacheable du modèle (512 jetons sur Opus 5.5), sinon rien n'est mis en cache, sans erreur.
- OpenRouter jamais appelé en réel avec une clé (`OPENROUTER_API_KEY` à poser dans `packages/api/.env`) ; le comportement des `tool_calls` dépend du modèle ; cache du réglage de 30 s par instance. Réglage `fake` possible dans la base locale : le remettre sur `disabled` ou `openrouter`.
- Écritures du Copilote : « Approuver et exécuter » jamais exercé sur un `PUT` de bien (on ignore s'il conserve les autres champs). Seules 11 routes ont une validation à sec (`lib/ai/gateway/write-validators.ts`) ; ~340 écritures sont `unchecked` (~15 min par route : contrôleur, schéma exporté, entrée, test de parité). Faux accept connu : bail avec `startDate: ''`. Messages Zod personnalisés encore en anglais. 6 GET sans permission connue (volontaire). Gardes de routeur à faire remonter dans `permissionsOf`. Ces changements sont sur le staging (code identique à `main`).
- Liste des anciennes conversations (décision : stockage serveur) non faite : plan écrit, migration Prisma, routes, rétention, revue de sécurité, UI en PR séparée. Même défaut `t()` évalué à l'import ailleurs (`home/dashboard-viz.ts`, tables de statuts maintenance, portails, finance ; ~90 fichiers) : un changement de langue à chaud ne les retraduit pas. Ajouter `GET …/syndics/:syndicId/lots/:lotId` ou classer `paiements/apercu` en lecture. Limiteurs de débit en mémoire par instance (ImmoCopilot, renvoi de convocation) ; `connection_limit` à dimensionner. Vrai micro et rejeu navigateur de la désactivation (dernier admin) et du PNG au nom accentué.

### Sécurité, audit et dette technique

- Journal d'audit : activer la purge (`AUDIT_PURGE_ENABLED`, `false` par défaut) seulement après validation de la rétention (24 mois agence, 60 mois plateforme). Les scellés sont dans la même base : ancrer la tête de chaîne hors base (RUNBOOK ; aujourd'hui un log à recopier). Restent : `AI_ACTION_EXECUTED` asynchrone, événements d'authentification non câblés (Google, rafraîchissement, demande de réinitialisation, e-mail inconnu), lignes `LATE_ROWS` non rescellées.
- `npm run test:isolation` jamais rejoué sur l'ensemble depuis les dernières intégrations (pas de `DATABASE_URL_TEST` sur le poste).
- Deux ADR numérotés 005 (`environnements-staging-production` et `patrimoine-multi-actifs`) : renuméroter l'un. L'ADR-006 est l'audit à deux niveaux.
- Lint API : 1 erreur locale `no-irregular-whitespace` (`src/lib/audit/platform-audit-csv.ts:70`, BOM littéral à remplacer par l'échappement) ; verte en CI. Le backend garde des erreurs TypeScript préexistantes (dont `archiver`) : ne pas en ajouter.
- Budget d'entrée du web (`npm run measure:entry`, 229 376 octets gzip depuis le 2026-10-18, relevé quatre fois en trois semaines) : alléger l'entrée de façon structurelle (routes et menus du patrimoine, moteur de formulaires d'Ant Design via `ConfigProvider`). Toujours remesurer avant de pousser du web.
- Classeur des fonctionnalités : les annotations « À vérifier (en développement, PR n°X non fusionnée) » ajoutées pour les PR aujourd'hui fusionnées sont à retirer s'il en reste.
- Test web instable, non élucidé : un échec isolé du test « gabarit » de l'import patrimoine après 22,8 s en local (piste non prouvée : premier chargement d'`exceljs`). Les 4 tests `ai.write-plan` « miroir du front » n'échouent que sous Windows (CRLF).

## Pièges durables

Worktrees et Git :

- Retirer les jonctions `node_modules` avec `rmdir` AVANT tout `git worktree remove` (incident du 2026-09-27 : un `remove` a vidé `apps/web` et `packages/api` du checkout principal). Un worktree sans jonction ni `npm ci` casse le hook de commit.
- Un worktree à schéma modifié a son propre `npm ci --ignore-scripts` puis `npm rebuild bcrypt` (sinon `routes-inventory` ne démarre pas) et `npm rebuild lefthook` (Windows peut bloquer `lefthook.exe`).
- `npx prisma generate` après tout `git merge main` qui change le schéma (sinon ~300 erreurs `tsc`). Il échoue en EPERM tant que l'API ou un Jest orphelin tourne : les arrêter d'abord (chercher les `node.exe` du worktree).
- `git checkout --theirs` pendant une fusion = version de `main`. Les modifications d'un agent non indexées avant `git commit` ne sont pas dans le commit.
- Hooks : une commande qui mêle `push` et `main`, ou `--forceExit`, ou `git fetch origin main` avec un push, est refusée : séparer `git push` et `gh pr create --base main`.
- `preview_start` lance dans le checkout principal, pas dans un worktree : lancer API et web à la main depuis le worktree. Un shell d'arrière-plan est tué au bout de quelques minutes : `Start-Process` détaché.
- `core.autocrlf=true` : `git status` marque parfois `M` sans changement réel. `git diff --numstat` ou `git hash-object` contre `git show HEAD:<f>` tranchent.
- Git Bash : `MSYS_NO_PATHCONV=1` (sinon `-w /repo/...` est converti en chemin Windows) ; `chmod 600` sans effet sur NTFS ; `BACKUP_DIR` en `C:/...` fait lire `tar` comme un hôte distant : chemins POSIX.
- Fichiers en CRLF (tests, pages) : un remplacement scripté en `\n` échoue en silence. Préférer l'outil Edit.
- Disque D: presque plein : surveiller avant un `npm ci` ou un build.

Tests :

- Ne jamais lancer Jest et Vitest en même temps, ni pendant un build. Sous charge : délais en cascade, workers tués (SIGKILL), 4 à 11 échecs sans rapport. Relancer le fichier ou le lot seul avant de conclure à une régression. Instables connus : `copilot-root` (Ctrl+J), import patrimoine, `land-detail`, `CreateTenantDrawer`, `PropertyPatrimoineTab`, stock-inventaire.
- Jest : chemin du fichier AVANT `--selectProjects` ; `routes-inventory` et `route-features` sont dans le projet `api-app`. Un filtre `whatsapp` correspond au nom du worktree `inventaire-whatsapp` et lance toute la suite.
- Vitest 2.1.9 n'a pas `--repeat` (option `{ repeats: N }` dans une copie temporaire). Le filtre `-t` ne retrouve pas un nom à apostrophe typographique passé par le shell Windows : filtrer sur un mot ASCII. Pour simuler la CI : `start "" /affinity 0x1 /wait /b cmd /c npx vitest run …` épingle sur 1 cœur.
- Un événement clavier envoyé juste après `findBy*` sur un composant dont l'écouteur est posé dans un `useEffect` a une fenêtre de course : renvoyer l'événement dans un `waitFor`. Pour un état intermédiaire (fenêtre montée puis préremplie), attendre la disparition de l'état par défaut.
- Un fichier de test sans `import`/`export` est un script global : deux fichiers qui déclarent le même `type Row` entrent en collision TS2300 dans un même run ts-jest. Mettre `export {}` ; avant de re-corriger, vérifier `git log` sur `provision-subscription-cli.test.ts` et `subscription-provisioning-service.test.ts`.
- Tests dépendant de l'horloge : ne pas écrire de dates en dur (un test a cassé toute PR à une date passée). Un test qui charge `config/env.ts` relit le `.env` local : mocker `dotenv/config`.
- `test:isolation` : base dédiée `DATABASE_URL_TEST` ; la suite `audit-integrity` tourne après, séparément (elle désactive un déclencheur) ; `signup-guard.integration` échoue si `DATABASE_URL_TEST` est posé sans `TEST_DATABASE_URL` hors du lanceur. Postgres local à 100 connexions quand plusieurs seeds tournent en parallèle ; `DROP DATABASE` peut être refusé par la protection de l'outil : créer une base numérotée.
- Un test web qui lit du texte rendu attend le rendu (`findAllByText`), pas seulement l'appel du service ; année courante, jamais 2026 en dur ; un `waitFor` qui attend une vraie bascule de langue passe `{ timeout: 8000 }`.
- `Space` d'Ant Design 6 donne aux enfants d'un fragment une clé par position : un bloc qui change de place perd son état ; lui donner une `key` fixe.

Traductions et classeur :

- `npm run i18n:extract` : orpheline des traductions (à restaurer à la main depuis les `*.orphans.json` ou une sauvegarde : 32 clés côté API à chaque passage, dont les messages `OWN_ASSETS_ONLY` et « pack Patrimoine »), réécrit les fins de ligne de ~30 catalogues et supprime des clés d'autres lots, orphelinise les clés à variable (`t(variable)`). Ne commiter que les catalogues au vrai diff ; ne jamais retrier les JSON à la main. Ne PAS le lancer pour le périmètre ImmoCopilot. Un `*.orphans.json` non commité fait échouer `i18n-catalogs-completeness.test.ts` en local.
- Classeur `ImmoTopia_Wiki_Fonctionnalites.xlsx` (binaire) : en conflit, ne pas prendre un camp entier. Repartir de la version de `main`, réappliquer ses lignes par clé stable (Module, Fonctionnalité, Sous-fonctionnalité), puis `npm run wiki:export`. Après un `insert_rows` openpyxl : refaire les fusions de cellules et mettre à jour `ref` ET `autoFilter.ref` de la table `SousFonctionnalites`, sinon `wiki:check` sous-compte.
- `HANDOFF.md` est réécrit par presque chaque PR au même endroit : en cas de conflit, repartir de la version de `main` et y replacer sa propre section ; relire `grep -n '^## Branche'` avant de pousser (intitulés en double).

Application et données :

- Une nouvelle route de tenant se classe dans `lib/subscription/route-features.ts` (sinon avertissement « unclassified tenant route ») et passe `routes-inventory` ; après tout changement de routes : `npm run ai:catalog`. Une route utile à un espace PARTICULIER s'ajoute à `particulier-routes.ts`.
- `AuditLog` : le déclencheur d'immuabilité refuse UPDATE/DELETE ; la purge passe par `audit_logs_purge` (180 jours minimum, partitions scellées) ; une clé d'action hors catalogue est écrite `PLATFORM_ONLY` ; toute lecture agence passe par `getTenantAuditLogs`.
- Le `.env` ne s'écrit pas depuis un agent (règle de refus) : configurer une base locale jetable par variables d'environnement. `OPENROUTER_API_KEY` vide est refusé par `env.ts` : ne pas poser la variable. `db:seed:catalog` sans `--missing-only` écrase les prix et plafonds ajustés.
- La connexion nettoie le mot de passe avant de comparer (`sanitizeString`) : le seed du super-admin refuse les mots de passe contenant `<`, `>`, `javascript:`.
- Seed « 3 ans » : l'image `immotopia-saas-api-migrate` est nettoyée après un déploiement ; la reconstruire avant un nouveau seed (profil `tools`, service `migrate`, voir `DEPLOIEMENT.md`). Le mot de passe de test des comptes de pack est PUBLIC : staging seulement. Aucune campagne newsletter en statut SCHEDULED (le job du staging l'enverrait). Le seed coupe SMTP et SMS.
- Une image web est propre à un environnement (`VITE_*` figés au build) : on promeut un commit, jamais une image. Un `STACK_NAME` ou un port hérité du shell est ignoré par les scripts d'`infra/`. `check-infra.sh` échoue sur le serveur (chemin du checkout dans le rendu compose) : faux positif. Recréer le conteneur API efface ses journaux.
- Déploiement (par l'utilisateur) : `ssh alliance` (port 2222), checkout `/home/deployer/immotopia-saas`, `nohup ./infra/scripts/deploy.sh staging > journal &` (~8 min) ; lire le journal (`pgrep -f` dans la commande ssh se trouve lui-même). Les builds Docker locaux échouent parfois en `EIDLETIMEOUT` : relancer, construire les images en séquence.
- Menus par agence : une sauvegarde au niveau d'une agence écrit sa carte complète et fige ses valeurs jusqu'à « Revenir au défaut » ; modifier le défaut touche toutes les agences sans réglage propre.
- Patrimoine : les mensualités de dettes ne sont pas prélevées sur la trésorerie des projections ; supprimer un bien supprime ses valorisations et parts, refusé (409) tant qu'un prêt actif y est adossé ; `PropertyHolding.propertyId` et `PropertyLoan.propertyId` sont nullables (actifs non immobiliers).
- Recette locale : le navigateur intégré refuse les pages servies par adresse IP (utiliser `*.localhost`) et ses captures échouent panneau masqué (preuves par DOM et réseau) ; `preview_start` est limité à 5 serveurs. Les testeurs n'ont pas les mots de passe de recette : les consigner dans les scénarios.
- Ports : API 8001, web 3000 (3002 sur ce poste), démo 8800/3300 ; sur ce poste le port 3301 est pris par un autre projet (Docker).
- Les marques anti-doublon des notifications vivent dans la table `notification_markers`, jamais dans `AuditLog`.
