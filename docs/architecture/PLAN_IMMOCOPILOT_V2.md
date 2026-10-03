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
  (jeton HMAC à usage unique, 300 s, verrou consultatif).
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
- Outils `list_capabilities` (recherche, GET seulement, 20 résultats) et `call_read`
  : exécutent une route GET par **requête loopback** sous l'identité de l'utilisateur
  (même jeton, aucune URL fournie par le modèle), donc avec toute la chaîne de
  middlewares réelle. Réponses masquées (clés évoquant un secret) puis réduites
  (50 éléments, 500 caractères, profondeur 6, ~12 000 caractères). Détail :
  SECURITY §12.

### Étape 4 — Écritures avec aperçu et accord

- Outil `plan_write` : l'IA décrit l'action (route du catalogue + corps) ;
  le serveur valide, **simule** (lecture des enregistrements touchés,
  calcul avant/après) sans rien écrire, et renvoie : étapes prévues,
  enregistrements impactés, champs avant → après, avertissements.
- La carte d'accord affiche ce plan ; Approuver / Refuser. L'approbation
  appelle la route de confirmation, qui revérifie permissions, tenant et
  jeton, puis exécute la route du catalogue.
- Routes à effets de bord externes (paiements, envois d'e-mails ou SMS,
  signatures) : marquées « sensibles » dans le catalogue, plan en rouge,
  accord renforcé (saisie d'une confirmation).
- Chaque exécution est journalisée (qui, quoi, plan approuvé).

## Points ouverts

- Liste des conversations passées (barre latérale) : demande de stockage
  serveur des conversations, non prévue aux étapes 1 à 4 — à décider.
- Quotas : une IA qui chaîne des écritures consomme plus ; vérifier les
  limiteurs (`ai-limiteurs.md`) à l'étape 4.
- Annuler une écriture déjà approuvée : hors périmètre (pas de suppression,
  donc pas de défaire automatique).
