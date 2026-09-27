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

**État :** prêt à relire (commité, non poussé)
**Dernier commit :** `docs(agents): architecture de consignes pour agents IA`, sur la base `43e5761` (fix/recette-syndic-modules)

Fait :

- Architecture de consignes pour agents : `CLAUDE.md` (importe `AGENTS.md`),
  `CLAUDE.local.md` (ignoré), `.claude/rules/`, `.claude/agents/`,
  `.claude/skills/audit/`, `.claude/hooks/`, `.claude/settings.json`,
  `.mcp.json`, `docs/architecture/{SYSTEM_DESIGN,DATA_MODELS}.md`,
  `docs/architecture/adr/`, `docs/governance/`, `docs/workflows/`.

Reste à faire :

- Relire et fusionner. La branche part de `fix/recette-syndic-modules`
  (53 commits d'avance sur `main`) : la fusionner après elle.

Pièges et décisions :

- Documentation écrite en français, comme le reste du dépôt.
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
