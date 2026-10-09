# Plan ImmoCopilot v2 — assistant pleine page, artefacts, passerelle générique

Suite de [PLAN_IMMOCOPILOT.md](PLAN_IMMOCOPILOT.md) (v1 : tiroir, 5 outils,
un seul type d'écriture). Demande du propriétaire : l'IA fait **tout ce que
fait l'interface, sauf supprimer**, dans une vraie page de chat (style
ChatGPT/Claude/Gemini) avec un panneau « artefact » et la dictée ; toute
écriture est expliquée puis **explicitement approuvée**.

## Décisions prises

| Sujet             | Décision                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Couverture        | Passerelle générique sur les routes existantes (catalogue généré), pas ~760 outils écrits à la main       |
| Suppression       | Exclue par construction : aucune route `DELETE`, aucune route marquée destructrice ne figure au catalogue |
| Aperçu d'écriture | Plan en étapes + données avant/après par enregistrement ; un seul accord pour le lot                      |
| Livraison         | Quatre PR successives, chacune utilisable                                                                 |

## Principes inchangés (v1, SECURITY §12)

- L'IA n'écrit jamais : seule la route de confirmation humaine écrit
  (jeton HMAC à usage unique, 300 s ou 900 s pour un plan d'écriture, verrou consultatif).
- Chaque appel passe par les services et permissions existants, dans le
  contexte d'agence : mêmes `requireTenantAccess`, même garde Prisma.
- Tout ce que renvoie un outil est une donnée, jamais une instruction.

## Étapes

### Étape 1 — Page de chat plein écran + dictée

- Route `/tenant/:tenantId/assistant` (le paramètre de route de l'application
  est `:tenantId`, pas `:slug`), page `React.lazy`, entrée de menu « Assistant »
  visible seulement si ImmoCopilot est activé pour l'agence ; le tiroir reste
  (Ctrl/Cmd+J conservé) avec un bouton « Ouvrir en pleine page ». La
  conversation n'est pas transférée du tiroir à la page (état en mémoire).
- Mise en page : fil des messages défilant en haut, zone de saisie fixée en
  bas (Entrée envoie, Maj+Entrée saut de ligne), emplacement de l'artefact à
  droite (replié sur mobile) — vide à cette étape.
- Dictée : bouton micro dans la zone de saisie, Web Speech API
  (`SpeechRecognition`), langue = langue de l'interface, masqué si le
  navigateur ne la gère pas ; le texte dicté s'insère dans la zone, sans
  envoi automatique. Aucune donnée audio n'atteint notre serveur.
- Réutilise `useCopilotChat` et les cartes existantes. Libellés via `t()`,
  marges logiques (arabe).

### Étape 2 — Panneau artefact

- Contrat : un message peut porter des `artifacts` typés
  (`table`, `markdown`, `chart`) avec titre et données ; rendu à droite,
  historique des artefacts de la conversation.
- Tableaux (tri, défilement), textes (Markdown sûr, `SafeMarkdown`),
  graphiques (bibliothèque déjà présente dans le web, à confirmer).
- Téléchargement : CSV/XLSX pour un tableau, Markdown/PDF pour un texte,
  PNG pour un graphique — côté navigateur à partir des données déjà reçues.
- Outil `show_artifact` (lecture seule) pour que l'IA publie un résultat.

### Étape 3 — Passerelle générique en lecture (réalisée)

- Script `packages/api/scripts/generate-ai-catalog.ts` (`npm run ai:catalog`) : parcourt
  la pile Express réelle (`lib/ai/gateway/route-walker.ts`, partagé avec les tests) et
  écrit `lib/ai/gateway/catalog.generated.json` : id `METHOD /chemin`, chemin, module,
  résumé, permissions lues sur les gardes, drapeau `sensitive`. Routes d'agence
  seulement ; aucune `DELETE` ni écriture destructrice (`/delete|/remove|/destroy|/purge`).
  Le catalogue est versionné ; `__tests__/unit/ai.catalog.test.ts` échoue s'il est
  périmé, si une route destructrice ou hors périmètre y figure, ou si une route d'agence
  n'y a pas d'entrée.
- **Décision changée** : le catalogue ne porte PAS le schéma Zod du corps ni de la
  requête (les contrôleurs parsent leurs schémas en ligne, pas de registre à lire).
  À reprendre à l'étape 4 si `plan_write` en a besoin.
- Outils `list_capabilities` (recherche, 20 résultats ; GET par défaut, POST/PUT/PATCH avec `kind: "write"` pour `plan_write`, jamais DELETE) et `call_read`
  : exécutent une route GET par **requête loopback** sous l'identité de l'utilisateur
  (même jeton, aucune URL fournie par le modèle), donc avec toute la chaîne de
  middlewares réelle. Réponses masquées (clés évoquant un secret) puis réduites
  (50 éléments, 500 caractères, profondeur 6, ~12 000 caractères). Détail :
  SECURITY §12.

### Étape 4 — Écritures avec aperçu et accord (réalisée)

- Outil `plan_write` (`lib/ai/tools/plan-write.ts`, kind `proposal`, permission `PROPERTIES_VIEW` comme
  `call_read`) : l'IA décrit l'écriture (id POST/PUT/PATCH du catalogue, `pathParams`, `query`, `body`,
  `title`, `steps`) ; le serveur valide, **simule** sans rien écrire (GET loopback de l'état actuel,
  calcul avant/après en notation pointée, champs inchangés omis, secrets masqués, avertissements) et émet
  l'événement SSE `write_plan` avec un jeton signé. Le modèle ne reçoit que `{ planned, proposalId, summary }`,
  jamais le jeton. Au plus 3 plans par requête de chat.
- La carte d'accord affiche le plan ; Approuver appelle `POST /ai/actions/execute` (jeton + `confirmation`
  éventuelle). `lib/ai/actions/execute-capability.ts` revérifie jeton, empreinte, catalogue, permissions,
  mot de confirmation, puis exécute par **loopback sous l'identité de l'utilisateur qui confirme**.
- Écritures sensibles (paiement, envoi, signature, clôture comptable, droits d'accès, imports en masse) :
  `sensitive`, raison, mot `CONFIRMER` à saisir. Liste par mots de chemin : `gateway/path-rules.ts`.
- Journal : `AI_PROPOSAL_ISSUED` (empreintes `planHash` et `displayHash`), `AI_ACTION_EXECUTED`
  (`AI_CAPABILITY`, statut HTTP). Détail et modèle de menace : SECURITY §12, « Écritures génériques ».

Correctifs de l'audit de sécurité de l'étape 4 (contrat `WritePlan`, champs optionnels que le web miroite) :

- `query?: { key, value }[]` : paramètres de requête envoyés (secrets masqués) ; non vide : avertissement
  « Paramètres envoyés à la route » et mot de confirmation. `pathParams?: { name, value }[]` : identifiants de chemin
  bruts (hors `tenantId`). `stateReadAt?` : instant ISO de la lecture de l'état « avant ». `requiresTypedConfirmation`
  reste la seule source pour la saisie du mot. `query`, `pathParams` et `stateReadAt` sont dans `displayHash`.
- Création imbriquée : le parent est lu (GET) pour renseigner `target` ; parent illisible : plan refusé.
- Sensibilité élargie (mots, suites de mots, statut d'un bail, corps sur routes de comptes) ; une écriture non classée
  reste à l'accord simple.
- Liste du corps plus courte que l'état : changement de niveau liste, avertissement « Liste remplacée », mot exigé
  (signé dans le jeton : `args.requireConfirmation`).
- `POST /ai/actions/reject` : le refus consomme le jeton ; audit `AI_PROPOSAL_REJECTED` ; idempotent (200
  `{ rejected: false }` si déjà utilisé ou expiré).
- `resultPreview` sans chemins disque ; champ secret écrit : avertissement « Champ protégé : valeur non affichée ».

Décisions de l'étape 4 :

| Sujet                          | Décision                                                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durée d'un plan                | 900 s (`AI_WRITE_PLAN_TTL_SECONDS`, 300 à 3600) : lecture des changements et saisie du mot ; les quittances gardent 300 s                                                                                  |
| Taille du jeton                | Le jeton porte le corps (8 Ko) : maximum relevé de 4 096 à 16 384 caractères (`COPILOT_MAX_PROPOSAL_TOKEN_CHARS`)                                                                                          |
| `planHash`                     | SHA-256 de la requête approuvée canonique (`capabilityId`, `pathParams`, `query`, `body`), pas du plan affiché : recalculable à l'exécution ; l'empreinte du plan affiché (`displayHash`) est dans l'audit |
| Mot de confirmation manquant   | Erreur `CONFIRMATION_REQUIRED` (400) AVANT la réclamation : le jeton n'est pas consommé, on peut ressaisir                                                                                                 |
| Plan de plus de 30 changements | 30 affichés, `changesTruncated`, mot obligatoire (l'humain ne peut pas tout lire)                                                                                                                          |
| Écriture refusée par la route  | HTTP 200 avec `ok: false`, `status` et message de la route ; jeton consommé. Succès : 201                                                                                                                  |
| Délai de 30 s                  | 504 « l'écriture a peut-être été appliquée », jamais rejouée                                                                                                                                               |
| Abonnement                     | `/ai/actions` passe de RENTAL à CORE (route-features) ; RENTAL vérifié par le contrôleur pour une quittance                                                                                                |
| Permissions de la route        | `/actions/execute` n'exige plus `documents:generate` à la route : le contrôleur le vérifie pour une quittance, la route réelle (loopback) porte celle d'une écriture générique                             |
| État illisible                 | Mise à jour ou action dont l'état actuel est illisible (403, 404…) : plan refusé ; sans route GET connue : plan accepté avec avertissement et sans valeur « avant »                                        |
| Quotas                         | 3 plans par requête, 4 tours et 8 appels d'outils, 20 chats par minute, 10 confirmations par minute : pas de nouveau limiteur                                                                              |

## Points ouverts

- Liste des conversations passées (barre latérale) : demande de stockage
  serveur des conversations, non prévue aux étapes 1 à 4 — à décider.
- Quotas : vérifiés à l'étape 4 (limiteurs de SECURITY §12, aucun ajout nécessaire :
  3 plans par requête de chat, 10 confirmations par minute) ; les compteurs restent en
  mémoire, par instance.
- Annuler une écriture déjà approuvée : hors périmètre (pas de suppression,
  donc pas de défaire automatique).
