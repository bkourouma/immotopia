# ADR-004 : assistant IA ImmoCopilot, lecture par outils et écriture confirmée par l'humain

## Statut

Accepté

## Date

2026-09-29

## Contexte

ImmoTopia compte près de 700 sous-fonctionnalités réparties en menus et
formulaires nombreux. Le PRD `docs/architecture/PRD_ASSISTANT_IA_IMMOCOPILOT.md`
propose un assistant conversationnel pour les collaborateurs d'agence :
rechercher des biens et des baux, consulter des documents, générer une
quittance. Sa vérification contre le code (plan
`docs/architecture/PLAN_IMMOCOPILOT.md`, table §1) a montré plusieurs écarts qui
contraignent la conception :

- aucune permission du PRD n'existe, sauf `PROPERTIES_VIEW` ; les vraies sont
  `RENTAL_LEASES_VIEW` et `RENTAL_DOCUMENTS_VIEW/GENERATE/EDIT`, et `TENANT_AGENT`
  n'a aucune permission `RENTAL_*` par défaut ;
- les routes `generate`, `regenerate`, `download` et les routes de modèles de
  `document-routes.ts` n'avaient aucune garde de permission ;
- `requireTenantAccess` admet les clients de portail ; le JWT ne porte pas le
  `tenantId` ;
- la quittance se génère à partir d'un **paiement** encaissé, il n'existe pas
  d'avis d'échéance, et la sortie est du DOCX ;
- le front s'authentifie par cookie `httpOnly` (pas de jeton Bearer) ;
  `EventSource` ne sait pas faire de POST ;
- le middleware de compression met en tampon les réponses `text/*`, donc un flux
  SSE ;
- aucun SDK de modèle de langage n'est présent dans le dépôt.

Le sujet touche des données personnelles (noms de locataires, montants) qui
sortent de l'infrastructure vers un fournisseur externe, et une action qui
écrit (générer un document) déclenchée depuis un texte que l'utilisateur, ou un
contenu injecté dans les données, peut piloter.

## Décision

1. **L'assistant est désactivé par défaut.** `AI_PROVIDER=disabled` : l'application
   fonctionne sans clé, le bouton est masqué, `/ai/chat` et `/ai/actions/execute`
   répondent 503 `AI_DISABLED`. Le faux fournisseur (`fake`) est refusé en
   production.
2. **Interface `LlmProvider`** (`lib/ai/contracts.ts`) avec deux
   implémentations : `anthropic` (SDK officiel `@anthropic-ai/sdk`, modèle
   `claude-opus-5-5` par défaut, `tool_choice: auto`, repli serveur en cas de
   refus) et `fake` (déterministe, pour la recette et les tests).
3. **Le chat n'écrit jamais.** Les outils du modèle sont au nombre de cinq :
   `search_properties`, `search_leases`, `list_lease_documents`,
   `list_property_documents` (lecture) et `propose_rental_document` (prépare une
   proposition, aucune écriture). L'outil d'exécution est **retiré du registre du
   modèle** ; l'orchestrateur n'importe ni l'exécuteur ni le générateur.
4. **Écriture par confirmation humaine.** `POST /ai/actions/execute` est la seule
   porte de génération : elle rejoue authentification, agence, collaborateur et
   `RENTAL_DOCUMENTS_GENERATE` et `RENTAL_DOCUMENTS_VIEW`, vérifie un **jeton de proposition** (HMAC-SHA256,
   clé dérivée par HKDF de `JWT_SECRET`, 300 s, lié à l'utilisateur, à l'agence, à
   l'action et aux arguments résolus par le serveur, usage unique), revalide
   l'appartenance de chaque identifiant, puis appelle
   `document-generation-service.generateDocument`. L'usage unique repose sur une
   table mémoire et sur une ligne `AuditLog` lue puis écrite sous un verrou
   consultatif PostgreSQL transactionnel (atomique entre instances), et
   l'idempotence des quittances sur un verrou par paiement : **aucun nouveau
   modèle Prisma**.
5. **Une permission par outil**, clés réelles, plus `requireTenantCollaborator` et
   un refus explicite du **super-admin** (MVP). En mode `enforce`, les modules de
   l'abonnement filtrent aussi les outils (`/ai` en `CORE`, `/ai/actions` en
   `RENTAL`).
6. **Correctif RBAC des documents** livré d'abord : les 8 routes de
   `document-routes.ts` reçoivent leur permission `RENTAL_DOCUMENTS_*`. Le rôle
   `TENANT_AGENT` perd la génération et le téléchargement (voulu).
7. **Minimisation** des données envoyées au fournisseur : projections explicites
   (jamais d'e-mail, de téléphone, de chemin de fichier, de notes ni de
   propriétaire), 10 éléments et 8 Ko au plus par résultat d'outil, jeton jamais
   renvoyé au modèle, contexte d'écran vérifié et réduit à une référence. Les
   résultats d'outils et le contexte sont des données, pas des instructions.
8. **Flux SSE** sur `POST /ai/chat` : `text/event-stream`,
   `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, `: ping`
   toutes les 15 s, abandon de l'appel au fournisseur à la fermeture de la
   connexion. Côté web, `fetch` en flux avec `credentials: 'include'`
   (`utils/event-stream.ts`), rendu Markdown maison sans HTML.
9. **Limites** : 20 messages par requête, chat 20 par minute et 300 par jour,
   exécution 10 par minute (par utilisateur et par agence), plafond par agence sur
   le chat (`AI_TENANT_MINUTE_LIMIT` 100 par minute, `AI_TENANT_DAILY_LIMIT` 3000
   par jour), 4 tours et 8 appels
   d'outils par requête.
10. **Périmètre MVP** : quittance (depuis un paiement encaissé) et relevé de
    compte, en DOCX. Avis d'échéance, relances, PDF, e-mail, persistance des
    conversations, autres domaines et autres fournisseurs : phase 2.
11. **Le transfert de données personnelles au fournisseur est une décision
    juridique et contractuelle**, à prendre avant d'activer `anthropic` en
    production ; elle n'est pas tranchée par cet ADR.

## Conséquences positives

- Aucune écriture possible depuis le texte de la conversation : une injection de
  consigne, un titre de bien piégé ou un modèle qui se trompe ne peuvent pas
  générer de document, seulement en proposer un que l'humain lit avant de
  confirmer.
- Les permissions existantes gouvernent l'assistant : rien n'est contourné, et la
  faille des routes de documents est fermée au passage.
- Aucune migration ni nouveau modèle : l'inventaire tenant
  (`schema-tenant-coverage`) est inchangé, l'audit réutilise `AuditLog`.
- L'application reste utilisable sans clé ni réseau ; le faux fournisseur permet
  de tester et de recetter sans coût ni fuite de données.
- L'interface `LlmProvider` permet d'ajouter un autre fournisseur sans toucher à
  l'orchestrateur.

## Conséquences négatives

- Les données décrites à la décision 7 quittent l'infrastructure quand `anthropic` est
  actif (noms de locataires, montants) : décision juridique préalable, et
  information des agences.
- L'usage unique du jeton et l'idempotence des quittances sont atomiques entre
  instances (verrous consultatifs) ; les limiteurs de débit restent en mémoire,
  **par instance** (plafonds effectifs multipliés par le nombre d'instances).
- Le cache de permissions dure 5 minutes : une révocation peut mettre ce temps à
  s'appliquer.
- La clé de proposition dérive de `JWT_SECRET` : la faire tourner invalide les
  propositions en cours (5 minutes au plus).
- `TENANT_AGENT` perd la génération et le téléchargement de documents : à annoncer.
- Le compteur de numérotation de `generateDocument` n'est pas transactionnel
  (défaut existant, non corrigé ici).
- Le SDK `@anthropic-ai/sdk` entre dans les dépendances de l'API ; un proxy en
  amont doit désactiver la mise en tampon et allonger `proxy_read_timeout` pour le
  flux.
- Pas de quittance sans paiement `SUCCESS` alloué ni sans modèle actif ; pas de
  conversion DOCX vers PDF.
- Conversations non persistées : fermer le tiroir ou recharger la page les efface.

## Alternatives écartées

- **Outil `execute_…` appelable par le modèle**, avec un jeton en argument — le
  modèle, ou un contenu injecté, pourrait enchaîner proposition et exécution sans
  humain ; la confirmation par route HTTP distincte, avec permission relue,
  supprime ce chemin.
- **Jeton de proposition tenu en base** (nouveau modèle Prisma) — plus robuste
  face à plusieurs instances, mais ajoute un modèle à couvrir par l'inventaire
  tenant et une migration, pour un MVP ; la ligne `AuditLog`, lue puis écrite sous verrou consultatif,
  suffit à l'usage unique.
- **`EventSource` pour le flux** — ne fait pas de POST et ne porte pas le corps
  du chat ; `fetch` en flux avec `credentials: 'include'` réutilise le cookie
  `httpOnly` sans jeton Bearer.
- **Rendu Markdown par une bibliothèque ou `dangerouslySetInnerHTML`** —
  interdit par les règles du dépôt ; un rendu en éléments React couvre le besoin.
- **Un seul adaptateur multi-fournisseurs (Gemini, OpenAI, Claude)** dès le MVP —
  trois surfaces à tester pour un usage qui n'en exige qu'une ; l'interface
  `LlmProvider` garde la porte ouverte.
- **Assistant ouvert au super-admin ou aux portails** — le super-admin contourne
  les contrôles d'agence par conception et les clients de portail n'ont pas de
  permissions d'agence ; réservé aux collaborateurs.
- **Activer par défaut** avec un fournisseur externe — ferait partir des données
  personnelles sans décision juridique.

## Liens

- `docs/architecture/PLAN_IMMOCOPILOT.md` (table §1, décisions §2, risques §8)
- `docs/architecture/PRD_ASSISTANT_IA_IMMOCOPILOT.md` (encadré « Écarts avec le code »)
- `specs/022-assistant-ia-immocopilot/spec.md`
- `docs/governance/SECURITY.md` (section « Assistant IA »)
- `docs/workflows/RUNBOOK.md` (section « Assistant IA (ImmoCopilot) »)
- `packages/api/src/lib/ai/`, `routes/ai-routes.ts`, `controllers/ai-controller.ts`,
  `middleware/ai-access-middleware.ts`, `routes/document-routes.ts`
- `apps/web/src/components/copilot/`, `utils/event-stream.ts`
- Commits `65f16dc` (RBAC documents) à `2fc56cb` (bouton flottant et tiroir)
