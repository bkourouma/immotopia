# Démarrer les deux processus selon l'agent utilisé

Les contrats communs sont [DEV_PROCESS.md](DEV_PROCESS.md) et
[DEMO_DEBUG_PROCESS.md](DEMO_DEBUG_PROCESS.md). Ouvrir deux sessions ou tâches
distinctes sur le même projet : une pour le développement et une pour la
démo/debug. Leur donner accès à la même révision testable, à une instance de
démo dédiée et à un canal de messages ou de suivi partagé. Chaque processus
reste responsable de son rôle ; seul le développement écrit dans le code.

## Codex

`.codex/config.toml` et `.codex/agents/*.toml` sont des préférences propres à
Codex. Les coordinateurs `dev_orchestrator` et `demo_orchestrator` utilisent
GPT-6 Astra ; `dev_complex` et `ui_tester` utilisent GPT-6 Sol ; `dev_simple`
utilise GPT-6 Luna. Les profils de relecture `code_reviewer` et
`security_auditor` suivent les mêmes grilles que les profils Claude
équivalents (voir plus bas) et s'invoquent avant une passation qui touche
authentification, portails, paiements, uploads ou une route recevant un
identifiant de tenant. Les noms de rôles et contrats communs restent valables
si un autre modèle est choisi. Chaque profil Codex tourne avec
`sandbox_mode = "workspace-write"` et `approval_policy = "never"` : autonome,
mais cantonné à l'espace de travail — les hooks `.claude/` ne s'appliquent pas
à Codex, les garde-fous communs restent les hooks git Lefthook (`pre-commit`
via lint-staged, `pre-push` qui refuse une poussée directe vers main/master)
et la CI. Dans Codex Desktop, lancer deux tâches avec ces consignes de
départ :

```text
Processus développement : lis AGENTS.md et docs/workflows/DEV_PROCESS.md.
Coordonne le développement et la correction des anomalies envoyées par la
tâche démo/debug. Délègue les tâches indépendantes aux rôles adaptés, vérifie
les changements et renvoie chaque révision testable. Poursuis la boucle.
```

```text
Processus démo/debug : lis AGENTS.md et docs/workflows/DEMO_DEBUG_PROCESS.md.
Conçois les scénarios, fais-les exécuter dans le navigateur réel par le rôle
testeur interface, transmets les anomalies à la tâche développement et rejoue
les cas après correction. Poursuis jusqu'à réussite ou blocage documenté.
```

Le navigateur intégré est disponible dans Codex Desktop lorsque l'outil est
présent et que le site est autorisé. Les tâches séparées échangent par la
messagerie de l'application ; si elles utilisent des worktrees différents,
toujours transmettre la branche et la révision à tester.

## Claude Code

Les profils `.claude/agents/*.md` portent les mêmes rôles. Les deux
coordinateurs utilisent Claude Opus 5.5 avec effort `high` ; `dev-complex`
et `ui-tester` utilisent Claude Opus 5.5 avec effort `medium` ; `dev-simple`
utilise Claude Sonnet 5. Les profils de relecture `code-reviewer` (Claude
Sonnet 5) et `security-auditor` (Claude Opus 5.5) s'invoquent avant une
passation qui touche authentification, portails, paiements, uploads ou une
route recevant un identifiant de tenant (voir `.claude/agents/code-reviewer.md`
et `security-auditor.md`, ou `/audit`). `ui-tester` n'a ni outil d'édition ni
outil d'écriture de fichier : il ne peut que constater. `dev-complex` et
`dev-simple` ne peuvent pas lancer d'agent. Ce choix de modèles reste propre à
l'adaptateur Claude. Lancer deux sessions avec `claude --agent
dev-orchestrator` et `claude --agent demo-orchestrator`, ou invoquer ces
profils dans une interface Claude qui les prend en charge. Le testeur utilise
l'outil navigateur réellement disponible dans cette session. Le canal de
passation entre les deux sessions est le bus d'agents (`.agent-bus/`, voir
[DEV_PROCESS.md](DEV_PROCESS.md)) ; la seule présence de deux profils ne crée
pas ce canal, et SendMessage ne sert qu'à signaler un identifiant déjà écrit
dans le bus.

## Autres agents

Lire `AGENTS.md` puis les deux contrats. Associer les rôles aux capacités
locales : coordination, implémentation complexe, tâches simples et navigation
réelle. Choisir les modèles disponibles et un canal de passation. Garder le
format d'anomalie et les critères de fin identiques.

## Limite d'autonomie

Les processus prennent seuls les décisions de développement réversibles et
réalisent leurs vérifications techniques. Aucun fichier de dépôt ne peut
autoriser un site, fournir un compte manquant ou supprimer une confirmation
imposée par le navigateur ou l'environnement hôte. Dans ces cas, documenter le
blocage précis et reprendre automatiquement dès que l'accès est disponible.
