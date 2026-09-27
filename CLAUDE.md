# CLAUDE.md

Point d'entrée des sessions Claude Code. La constitution du projet est
[AGENTS.md](AGENTS.md) : elle est importée ci-dessous et prime sur tout le reste.

@AGENTS.md

## Chargement progressif

Ne pas tout lire d'avance. Charger le document quand la tâche le demande :

| Tâche                                    | À lire                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Reprendre un travail en cours            | [docs/workflows/HANDOFF.md](docs/workflows/HANDOFF.md) — toujours en premier |
| Lancer, configurer, dépanner             | [docs/workflows/RUNBOOK.md](docs/workflows/RUNBOOK.md)                       |
| Comprendre l'architecture                | [docs/architecture/SYSTEM_DESIGN.md](docs/architecture/SYSTEM_DESIGN.md)     |
| Toucher au schéma Prisma                 | [docs/architecture/DATA_MODELS.md](docs/architecture/DATA_MODELS.md)         |
| Conventions détaillées                   | [docs/governance/CODING_STANDARDS.md](docs/governance/CODING_STANDARDS.md)   |
| Authentification, tenant, fichiers       | [docs/governance/SECURITY.md](docs/governance/SECURITY.md)                   |
| Un libellé affiché                       | [docs/architecture/i18n.md](docs/architecture/i18n.md)                       |
| Une décision d'architecture              | [docs/architecture/adr/](docs/architecture/adr/ADR-000-template.md)          |
| Une fonctionnalité métier                | `specs/<module>/`                                                            |
| Savoir ce que fait l'application         | [docs/fonctionnalites/README.md](docs/fonctionnalites/README.md)             |
| Après avoir livré une fonctionnalité     | [docs/fonctionnalites/README.md](docs/fonctionnalites/README.md)             |
| Piloter seul un objectif de bout en bout | [docs/workflows/LEAD_PROCESS.md](docs/workflows/LEAD_PROCESS.md)             |

Les règles de `.claude/rules/` se chargent seules selon les fichiers touchés
(frontmatter `paths:`) : style, tests, routes API, sécurité.

## Outillage du dépôt

- `/audit [chemin]` — audit du diff de la branche (ou d'un chemin) :
  vérifications mécaniques, puis revue par les sous-agents `code-reviewer` et
  `security-auditor` (`.claude/agents/`).
- Hooks (`.claude/settings.json`) : `validate-bash.sh` refuse les commandes
  destructrices (stash, push forcé, remise à zéro de la base, `--no-verify`…) ;
  `pre-commit.sh` vérifie types et lint des fichiers indexés avant un
  `git commit`. Un refus de hook se corrige, il ne se contourne pas.
- `CLAUDE.local.md` et `.claude/settings.local.json` : réglages propres à la
  machine, jamais commités.

## Passation de session — règle constitutionnelle

Avant de conclure tout tour en plusieurs étapes (modification de fichiers,
commit, recette, enquête), mettre à jour
[docs/workflows/HANDOFF.md](docs/workflows/HANDOFF.md) sans l'annoncer ni
demander la permission : ce qui a été fait, ce qui reste, les pièges
rencontrés, la branche et le dernier commit. Une question simple sans
modification n'appelle pas de mise à jour. Le détail du format est dans le
fichier lui-même.

## Sous-agents

Le Pilote (session principale, voir
[docs/workflows/LEAD_PROCESS.md](docs/workflows/LEAD_PROCESS.md)) délègue
soit aux coordinateurs des deux processus, soit directement à des agents de
réalisation ou de relecture pour une tâche assez petite pour ne pas justifier
un coordinateur. Les coordinateurs délèguent à leur tour à leurs agents de
réalisation. Ces derniers ne lancent jamais d'autres sous-agents — profondeur
maximale de trois niveaux sous la session principale. Tout prompt de
réalisation interdit explicitement : toute commande git qui modifie l'arbre
ou l'index (`stash`,
`checkout`, `reset`, `restore`) ; de refaire un travail qui semble « revenu en
arrière » (s'arrêter et signaler). Découper par territoire de fichiers, jamais
deux agents sur le même fichier. Ne pas commiter pendant qu'un agent écrit : le
hook lint-staged sauvegarde et restaure les fichiers non indexés.

**Modèle des sous-agents : Sonnet 5 dès que c'est possible.** Les profils
`dev-complex`, `dev-orchestrator`, `demo-orchestrator`, `ui-tester`,
`security-auditor` et `lead` de `.claude/agents/` sont réglés sur Opus :
passer explicitement `model: "sonnet"` à chaque lancement d'agent (réalisation,
tests, relecture, recette), sinon le profil l'emporte. Opus se réserve à un
chantier transverse difficile (schéma, contrats, API et écrans à la fois) ou à
une relecture de sécurité délicate, et se justifie dans le rapport.
