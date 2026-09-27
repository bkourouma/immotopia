# Processus développement

Ce contrat décrit des **rôles**, pas des modèles ni un fournisseur. Il fonctionne
avec tout agent capable de lire le dépôt, de déléguer des tâches et d'exécuter
les commandes du projet. `AGENTS.md` reste prioritaire.

## Rôles

| Rôle                       | Responsabilité                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Coordinateur développement | Comprend la demande, découpe le travail, attribue les fichiers, intègre et vérifie le résultat, reçoit les anomalies. |
| Développeur complexe       | Traite les changements multi-modules, les règles métier, la sécurité et les corrections difficiles.                   |
| Développeur simple         | Traite les changements locaux, déterministes et faciles à vérifier.                                                   |

Le coordinateur choisit le nombre d'agents selon les tâches réellement
indépendantes et les limites du moteur. Un agent ne modifie que les fichiers qui
lui sont attribués ; le coordinateur règle les conflits et garde la responsabilité
du résultat. Les agents de réalisation ne créent pas d'autres agents.

## Boucle autonome

1. Lire `AGENTS.md`, `docs/workflows/HANDOFF.md`, le besoin et les règles des
   fichiers concernés. Relever la branche et la révision de départ.
2. Définir des critères observables et attribuer des tâches bornées aux agents
   disponibles. Confier les changements complexes au rôle complexe, les
   changements simples au rôle simple.
3. Intégrer les résultats et exécuter les vérifications adaptées : tests ciblés,
   lint, typecheck, `check:architecture` et, si nécessaire, tests d'isolation.
   Les erreurs préexistantes sont distinguées des régressions. Pour un diff qui
   touche authentification, portails, paiements, uploads ou une route recevant
   un identifiant de tenant, faire relire par `code-reviewer` et
   `security-auditor` (ou `/audit`) avant la passation. Si le diff ajoute,
   modifie ou retire une fonctionnalité visible, le coordinateur met à jour
   `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx` (un agent de
   réalisation à qui le fichier n'a pas été confié signale les
   sous-fonctionnalités concernées dans son rapport) et lance
   `npm run wiki:export` avant de considérer la tâche finie.
4. Faire tourner `npm run demo:sync -- <sha>` (avec `--migrate` si le schéma a
   changé) pour poser la révision sur l'instance de démo dédiée, puis
   transmettre au processus démo/debug la révision testable, les changements
   visibles, l'URL de l'instance et les critères de réussite.
5. Journaliser la livraison avec
   `npm run agent-bus -- revision --sha <sha> --branch <branche> [--fixes ID,ID]`
   — cette commande passe les anomalies citées à l'état `prêt au retest`. À
   réception d'une anomalie créée par la recette dans le bus d'agents (voir
   [BUG_REPORT_TEMPLATE.md](BUG_REPORT_TEMPLATE.md) pour le format), la
   reproduire, la corriger, l'état `en correction` reflète le travail en
   cours, puis répéter l'étape 4. Continuer jusqu'à ce que le processus
   démo/debug confirme les cas concernés.
6. Mettre à jour `HANDOFF.md` avec l'état final et les points encore ouverts.
   Le suivi anomalie par anomalie reste dans le bus d'agents, pas dans
   `HANDOFF.md`.

Une correction est terminée lorsque le scénario concerné passe dans
l'interface, que les vérifications adaptées passent, que les autres scénarios
touchés n'ont pas régressé, et que le classeur de fonctionnalités et son
miroir sont à jour si le changement en touchait une (voir
[docs/fonctionnalites/README.md](../fonctionnalites/README.md)). Ne déclarer
aucun résultat non vérifié.

## Coordination

Le canal partagé est le bus d'agents : `.agent-bus/` à la racine du checkout
principal (commun à tous les worktrees, surchargeable par `AGENT_BUS_DIR`),
piloté par `npm run agent-bus -- <commande>`. Chaque anomalie est un fichier
`bugs/BUG-AAAA-MM-JJ-NNN.md` et `revisions.md` journalise les livraisons. Le
développement y écrit « Correction annoncée » et les états `en correction` /
`prêt au retest` (via `agent-bus revision`) ; ce fichier est la trace de
référence, pas la messagerie de l'outil.

Utiliser en plus la messagerie entre agents ou tâches offerte par
l'environnement (SendMessage, messagerie de tâches Codex) uniquement pour
réveiller le processus démo/debug en indiquant l'identifiant de l'anomalie ou
de la révision : un message sans entrée correspondante dans le bus ne compte
pas comme passation.

Ne solliciter personne pour des décisions de mise en œuvre réversibles déjà
autorisées. Les permissions de l'environnement et les confirmations exigées
par les outils restent applicables ; signaler seulement un blocage réel.
