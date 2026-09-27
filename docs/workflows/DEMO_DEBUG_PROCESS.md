# Processus démo et débogage

Ce contrat décrit des **rôles**, indépendamment du modèle et du fournisseur.
Le navigateur peut être celui de l'application hôte ou un outil de navigation
réelle connecté à l'agent. Les scénarios se jouent par l'interface utilisateur,
pas par une simulation des appels réseau. `AGENTS.md` reste prioritaire.

## Rôles

| Rôle                    | Responsabilité                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Coordinateur démo/debug | Conçoit les scénarios, attribue les lots, trie les anomalies, échange avec le développement et décide des retests. |
| Testeur interface       | Exécute les parcours dans un navigateur réel et fournit des observations reproductibles.                           |

Le coordinateur tire les scénarios de `specs/`, des parcours de `docs/`, de
l'inventaire `docs/fonctionnalites/` (`npm run wiki:search -- <termes>`) et des
changements annoncés par le développement. Il couvre le parcours nominal et
les erreurs importantes, notamment l'isolation entre agences lorsqu'elle est
concernée. Il indique pour chaque scénario le rôle utilisateur, les données de
démo, les étapes et le résultat attendu.

## Boucle autonome

1. Lire `AGENTS.md`, `docs/workflows/HANDOFF.md` et le
   [RUNBOOK.md](RUNBOOK.md). Lancer `npm run demo:status` pour vérifier le SHA
   de l'instance de démo (le worktree détaché `.claude/worktrees/demo`) et la
   santé des ports : `api-demo` (8800) et `web-demo` (3300) y tournent
   désormais, avec une base dédiée via `packages/api/.env.demo`. Si le SHA
   annoncé par le développement diffère, attendre `npm run demo:sync` avant de
   commencer.
2. Préparer des scénarios numérotés. Envoyer chaque lot cohérent au testeur
   interface avec des critères de réussite explicites.
3. Le testeur navigue réellement, vérifie l'état affiché après chaque action et
   rapporte `passé`, `échoué` ou `bloqué` avec les preuves disponibles. Il ne
   modifie pas le code.
4. Le coordinateur déduplique les échecs et crée une anomalie par
   `npm run agent-bus -- new-bug --title "..." [--priority ...] [--branch]
[--sha] [--url]`, conforme à
   [BUG_REPORT_TEMPLATE.md](BUG_REPORT_TEMPLATE.md) : priorité, étapes de
   reproduction, attendu, observé, URL et révision sont de son ressort. La
   messagerie de l'outil sert seulement à signaler l'identifiant au
   développement.
5. Après l'avis de correction (`agent-bus set-state <ID> "prêt au retest"` ou
   `agent-bus revision --fixes ID,ID`), vérifier `npm run demo:status` : le SHA
   doit correspondre au SHA annoncé avant de rejouer. Relancer les scénarios
   échoués et les parcours voisins susceptibles de régresser. Passer l'anomalie
   à `passé` ou `bloqué` dans le bus, avec preuve et retest. Continuer jusqu'à
   réussite ou blocage vérifié.

La recette est terminée lorsque chaque scénario prévu est passé ou qu'un
blocage est documenté avec sa cause et son propriétaire. Une capture seule ne
prouve pas qu'un parcours complet fonctionne : noter l'état final observé.

## Permissions et données

Utiliser uniquement des comptes et données de démonstration autorisés. Ne pas
lancer un seed destructeur sur une base non dédiée. `npm run demo:sync` refuse
de tourner si `packages/api/.env.demo` pointe sur la même `DATABASE_URL` que le
développement : ne pas contourner ce refus. Les permissions de site,
les connexions et les confirmations de l'outil de navigation appartiennent à
l'environnement hôte ; un fichier de consignes ne peut pas les supprimer. Si
elles empêchent un scénario, le marquer `bloqué` avec l'action nécessaire.
