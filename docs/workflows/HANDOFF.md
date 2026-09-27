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

## Branche `chore/agentic-architecture` — 2026-09-27

**État :** en cours (PR #16 ouverte ; garde et outils ajoutés localement)
**Dernier commit :** `f2440f7 chore(agents): processus dev/recette, bus partagé et démo figée`, sur la base `43e5761` (fix/recette-syndic-modules)

Fait :

- Architecture de consignes pour agents : `CLAUDE.md` (importe `AGENTS.md`),
  `CLAUDE.local.md` (ignoré), `.claude/rules/`, `.claude/agents/`,
  `.claude/skills/audit/`, `.claude/hooks/`, `.claude/settings.json`,
  `.mcp.json`, `docs/architecture/{SYSTEM_DESIGN,DATA_MODELS}.md`,
  `docs/architecture/adr/`, `docs/governance/`, `docs/workflows/`.
- Garde déterministe des frontières frontend/API avec `dependency-cruiser`
  16.10.4 (compatible Node 20), script racine et étape bloquante dans la CI.
- `npm run check:architecture` passe : 1125 modules et 5583 dépendances
  analysés sans violation.
- Remplacement local de Husky par Lefthook 2.1.14, en conservant `lint-staged`
  comme hook de pré-commit.
- `npm run prepare` migre l'ancien `core.hooksPath=.husky/_` et installe le hook
  Lefthook ; sa configuration passe `lefthook validate`.
- Ajout de Repomix 1.14.0, configuré avec détection Secretlint ; le pack complet
  a exclu quatre fichiers signalés comme sensibles.
- Un pack ciblé `README.md,AGENTS.md` passe et ne signale aucun contenu sensible.
- `AGENTS.md` décrit désormais quand produire un pack Repomix ciblé et le
  comportement automatique de Lefthook au commit.
- Deux contrats de processus indépendants des modèles : développement et
  démo/debug, avec rapport d'anomalie, boucle correction/retest et adaptateurs
  Codex (`.codex/`) et Claude (`.claude/agents/`).
- La configuration Codex préfère Astra pour les coordinateurs, Sol pour le
  développement complexe et les tests interface, Luna pour les tâches simples.
  Les profils Claude utilisent Opus 5.5 (`high` pour les coordinateurs,
  `medium` pour les rôles complexes/testeur) et Sonnet 5 pour les tâches simples.
- Lacunes comblées le 2026-09-27 :
  - canal partagé `.agent-bus/` (ignoré par git, commun aux worktrees) et CLI
    `npm run agent-bus` (`scripts/agent-bus.cjs`) ;
  - instance de démo figée : `npm run demo:sync -- <ref> [--migrate]` et
    `demo:status` (`scripts/demo-instance.cjs`), worktree détaché
    `.claude/worktrees/demo` (créé, sur `f36a2f3`), base dédiée via
    `packages/api/.env.demo` ; `api-demo`/`web-demo` y tournent ;
  - hook Lefthook `pre-push` (`scripts/pre-push-guard.cjs`) qui refuse une
    poussée vers main/master, installé ;
  - Codex en `sandbox_mode = "workspace-write"`, profils Codex
    `code_reviewer`/`security_auditor` ;
  - profils Claude : identifiants de modèle complets partout, `ui-tester` sans
    Edit/Write, `dev-complex`/`dev-simple` sans Agent ;
  - docs DEV_PROCESS, DEMO_DEBUG_PROCESS, AGENT_ADAPTERS, BUG_REPORT_TEMPLATE,
    RUNBOOK alignées ; seul le processus dev écrit HANDOFF.md.
- Recommandations appliquées : coordinateurs Codex en effort `medium` ;
  `demo:sync --install` donne au worktree démo ses propres dépendances et son
  client Prisma ; `demo:sync` copie `apps/web/.env.demo` (sinon `.env`) dans
  le worktree, les `set` de launch.json restant prioritaires (vérifié dans
  Vite 6.4.3).

- Pilote (agent unique, seul interlocuteur) : profil `.claude/agents/lead.md`
  et contrat `docs/workflows/LEAD_PROCESS.md` ; il choisit la voie, commite,
  pousse et ouvre les PR ; fusion, main, déploiement, `.env` exigent un oui.

Reste à faire :

- L'utilisateur doit renseigner lui-même `.claude/settings.local.json` :
  `"agent": "lead"` et les autorisations git/gh (écriture refusée à l'agent
  par le classifieur d'auto-modification). Prise en compte de `agent` par
  l'application de bureau non documentée : repli `claude --agent lead`.
- Suivre la CI de la PR #16 après la poussée de 9010d8d et f2440f7.
- Créer `packages/api/.env.demo` (base de démo dédiée) — à faire par
  l'utilisateur, les agents ne touchent pas aux `.env` ; puis
  `npm run demo:sync -- HEAD --migrate` et démarrer api-demo/web-demo (jamais
  essayé).
- Démarrer les deux processus (`claude --agent dev-orchestrator` /
  `demo-orchestrator`) ; les permissions de navigateur restent gérées par
  l'hôte.
- Protection de branche GitHub impossible : dépôt privé en offre gratuite
  (API 403 « Upgrade to GitHub Pro »). Le pre-push local est la seule garde et
  se contourne par `--no-verify` hors Claude.
- `demo:sync --install` (npm ci + prisma generate dans le worktree) jamais
  exécuté.
- Relire et fusionner. La branche part de `fix/recette-syndic-modules`
  (53 commits d'avance sur `main`) : la fusionner après elle.

Pièges et décisions :

- Documentation écrite en français, comme le reste du dépôt.
- Worktree démo : client Prisma partagé par jonction ; un schéma divergent ne
  donne qu'un avertissement qui recommande `--install`.
  Le SHA démo est écrit dans `.git/worktrees/demo/demo-revision`.
- `.claude/settings.local.json` existant laissé intact.
- Le hook `validate-bash.sh` est actif dès l'écriture de `settings.json`. Il
  ignore le texte entre guillemets et le corps des heredocs, sauf sous
  `bash -c`, `eval`… Pour tester une commande interdite, écrire les cas dans
  un fichier avec l'outil Write : une commande Bash qui la contient en clair
  est elle-même bloquée.
- `permissions.deny` bloque Read/Edit/Write sur les vrais `.env` (pas
  `infra/.env.example`).
- Constats hors périmètre : `apps/web/env.example` est encore au format CRA
  (tâche proposée à part) ; les IPN PaySecureHub ne sont pas signées, et
  `logging-middleware.ts` journalise la chaîne de requête (voir « Points
  ouverts » de `docs/governance/SECURITY.md`).
