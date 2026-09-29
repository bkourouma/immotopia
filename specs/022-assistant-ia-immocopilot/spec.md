# Spécification 022 — Assistant IA in-app (ImmoCopilot)

> Spécification fonctionnelle et technique de l'assistant conversationnel
> ImmoCopilot, corrigée d'après le code réel. Elle prime sur le PRD
> ([PRD_ASSISTANT_IA_IMMOCOPILOT.md](../../docs/architecture/PRD_ASSISTANT_IA_IMMOCOPILOT.md))
> là où ils divergent ; le plan d'exécution est
> [PLAN_IMMOCOPILOT.md](../../docs/architecture/PLAN_IMMOCOPILOT.md) et la
> décision d'architecture
> [ADR-004](../../docs/architecture/adr/ADR-004-assistant-ia-immocopilot.md).

## 1. Références

- **Inventaire des fonctionnalités** :
  [`docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx`](../../docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx)
  (feuille `Sous-fonctionnalites`, fonctionnalité « Assistant IA ImmoCopilot »).
- **Modèle de menace** : [`docs/governance/SECURITY.md`](../../docs/governance/SECURITY.md),
  section « Assistant IA ».
- **Exploitation** : [`docs/workflows/RUNBOOK.md`](../../docs/workflows/RUNBOOK.md),
  section « Assistant IA (ImmoCopilot) ».
- **Modèle de données** : [`packages/api/prisma/schema.prisma`](../../packages/api/prisma/schema.prisma)
  (`AuditLog`, `Property`, `RentalLease`, `RentalInstallment`, `RentalPayment`,
  `RentalDocument`). Aucun modèle Prisma n'est ajouté.

## 2. Synthèse fonctionnelle

L'assistant permet aux **collaborateurs d'une agence** d'agir en langage
naturel. Il est **désactivé par défaut** (`AI_PROVIDER=disabled`) ; activé, il
apparaît comme un bouton flottant « Assistant » (raccourci Ctrl/Cmd+J) sur
toutes les pages d'agence et ouvre un tiroir de conversation.

1. **Rechercher des biens** (`search_properties`) et **retrouver un bail**
   (`search_leases`, par numéro de bail, nom du locataire, bien ou statut).
2. **Consulter les pièces** d'un bail (`list_lease_documents`) ou d'un bien
   (`list_property_documents`).
3. **Préparer** une quittance de loyer ou un relevé de compte
   (`propose_rental_document`) : une **proposition**, sans aucune écriture.
4. **Confirmer et générer** : l'utilisateur confirme dans l'interface, le
   serveur génère le document.
5. **Télécharger** le document généré, en **Word (.docx)**.

Hors périmètre du MVP (phase 2) : avis d'échéance et relances (aucun
`DocumentType` correspondant), sortie PDF ou Excel, copie par e-mail,
maintenance, CRM, finance, syndic, persistance des conversations, assistant pour
le super-admin, autres fournisseurs que Claude.

## 3. Vérification du PRD contre le code

| Le PRD ou la version précédente disait                                       | Réalité dans le code                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Préfixe `/api/v1`                                                            | Tout est sous `/api/...` ; routes d'agence sous `/api/tenants/:tenantId/...`                                                                                                                                                                                                                              |
| Permissions `RENTAL_VIEW`, `DOCUMENTS_VIEW`, `DOCUMENTS_GENERATE`            | Inexistantes. Réelles : `PROPERTIES_VIEW`, `RENTAL_LEASES_VIEW`, `RENTAL_DOCUMENTS_VIEW`, `RENTAL_DOCUMENTS_GENERATE`, `RENTAL_DOCUMENTS_EDIT` (`rental-rbac-middleware.ts`)                                                                                                                              |
| `TENANT_AGENT` a `RENTAL_VIEW` et `DOCUMENTS_GENERATE`                       | `TENANT_AGENT` n'a **aucune** permission `RENTAL_*` par défaut ; `TENANT_ADMIN` et `TENANT_MANAGER` les ont toutes                                                                                                                                                                                        |
| Le `tenantId` vient du JWT                                                   | Le JWT ne porte que `userId`, `email`, `globalRole`. Le `tenantId` vient de l'URL, contrôlé par l'adhésion (`requireTenantAccess`) : `req.tenantContext.tenantId`, jamais une valeur du modèle. Utilisateur : `req.user.userId`                                                                           |
| `requireTenantAccess` suffit                                                 | Il admet aussi les clients de portail : on ajoute `requireTenantCollaborator`, puis un refus explicite du super-admin                                                                                                                                                                                     |
| Aucune garde sur `POST /documents/generate` (`document-routes.ts:57`)        | Exact, et vrai aussi de `regenerate`, `download` et des 5 routes de modèles. Corrigé : `RENTAL_DOCUMENTS_EDIT` (modèles en écriture), `RENTAL_DOCUMENTS_VIEW` ou `RENTAL_DOCUMENTS_GENERATE` (liste des modèles), `RENTAL_DOCUMENTS_GENERATE` (générer, régénérer), `RENTAL_DOCUMENTS_VIEW` (télécharger) |
| Types de biens `APARTMENT`, `VILLA`…                                         | `PropertyType` : `APPARTEMENT`, `MAISON_VILLA`, `STUDIO`, `DUPLEX_TRIPLEX`, `CHAMBRE_COLOCATION`, `BUREAU`, `BOUTIQUE_COMMERCIAL`, `ENTREPOT_INDUSTRIEL`, `TERRAIN`, `IMMEUBLE`, `PARKING_BOX`, `LOT_PROGRAMME_NEUF`                                                                                      |
| Statuts `AVAILABLE`, `RENTED`, `SOLD`, `UNDER_MAINTENANCE`                   | `PropertyStatus` : `DRAFT`, `UNDER_REVIEW`, `AVAILABLE`, `RESERVED`, `UNDER_OFFER`, `RENTED`, `SOLD`, `ARCHIVED`. `UNDER_MAINTENANCE` n'existe pas                                                                                                                                                        |
| Filtre `city`                                                                | Pas de champ ville : `city` cherche dans `address` ou `locationZone`                                                                                                                                                                                                                                      |
| Types de documents `RECEIPT`, `NOTICE`, `CONTRACT`, `INSPECTION`             | `RentalDocumentType` : `LEASE_CONTRACT`, `LEASE_ADDENDUM`, `RENT_RECEIPT`, `RENT_QUITTANCE`, `DEPOSIT_RECEIPT`, `STATEMENT`, `OTHER`. Les états des lieux sont un module séparé                                                                                                                           |
| Génération `RENT_RECEIPT`, `RENT_NOTICE`, `RENT_REMINDER`                    | `DocumentType` générables : `LEASE_HABITATION`, `LEASE_COMMERCIAL`, `RENT_RECEIPT`, `RENT_STATEMENT`. **Aucun avis d'échéance ni relance.** MVP : quittance et relevé de compte                                                                                                                           |
| Quittance = bail + période                                                   | La quittance part d'un **paiement encaissé** (`sourceKey = paymentId`). Le serveur résout bail, échéance de la période, allocation, paiement `SUCCESS`. Sans paiement : « impossible », aucune proposition                                                                                                |
| Sortie PDF ou Excel                                                          | **DOCX uniquement** (docxtemplater) ; le téléchargement force `.docx`. Carte « Word (.docx) »                                                                                                                                                                                                             |
| `RentalDocumentService.generate()`, `DocumentService.generateFromTemplate()` | `rental-document-service.generateDocument` crée un brouillon sans fichier. Le vrai générateur : `document-generation-service.generateDocument(tenantId, docType, sourceKey, templateId, params, actorUserId)`. Liste : `listDocuments`                                                                    |
| Bail désigné par son identifiant                                             | L'utilisateur désigne un bail par son `lease_number` : outil `search_leases` ajouté                                                                                                                                                                                                                       |
| Jeton Bearer et `EventSource` côté web                                       | Le front n'envoie pas de jeton : cookie `httpOnly` `accessToken` avec `credentials: 'include'`. `EventSource` ne fait pas de POST : `fetch` en flux (`utils/event-stream.ts`)                                                                                                                             |
| Liens `/tenants/:tenantId/properties/:id`                                    | Routes web au singulier : `/tenant/:tenantId/properties/:id`, `/tenant/:tenantId/rental/leases/:leaseId`                                                                                                                                                                                                  |
| Outil `execute_rental_document_generation` appelable par le modèle           | Retiré du registre du modèle : l'exécution n'existe que derrière une route HTTP de confirmation                                                                                                                                                                                                           |
| `sendEmailCopy`                                                              | `generateDocument` n'envoie aucun e-mail : abandonné                                                                                                                                                                                                                                                      |
| Adaptateurs Gemini, OpenAI, Claude                                           | Interface `LlmProvider` ; deux implémentations : `anthropic` (SDK officiel `@anthropic-ai/sdk`) et `fake` (déterministe)                                                                                                                                                                                  |
| Tests d'API en Vitest                                                        | L'API se teste avec **Jest** ; Vitest ne sert qu'au web                                                                                                                                                                                                                                                   |
| Arborescence `src/ai/`, `ai.controller.ts`, `llm.adapter.ts`                 | Convention du dépôt : `src/lib/ai/*`, `controllers/ai-controller.ts`, `routes/ai-routes.ts`, kebab-case avec suffixe de rôle                                                                                                                                                                              |

## 4. Gardes-fous et sécurité

Détail et justification : [SECURITY.md](../../docs/governance/SECURITY.md),
section « Assistant IA ».

1. **Étanchéité multi-tenant.** `tenantId` et `userId` viennent de
   `req.tenantContext` et `req.user`. Un schéma strict rejette une clé
   `tenantId` en entrée d'un outil. Chaque identifiant reçu passe par
   `getPropertyForTenant` ou un `findFirst({ where: { id, tenant_id } })` avec
   `select` ; un objet d'une autre agence lève la même `NotFoundError` qu'un
   objet inexistant.
2. **Accès.** Routes `/ai/*` : `authenticate`, `requireTenantAccess`,
   `requireTenantCollaborator`, `requireAiAssistantAccess` (**super-admin
   refusé**, 503 `AI_DISABLED` quand l'assistant est désactivé, sauf pour le
   statut).
3. **Permission par outil.**

   | Outil                     | Permission                                             | Module   |
   | ------------------------- | ------------------------------------------------------ | -------- |
   | `search_properties`       | `PROPERTIES_VIEW`                                      | `CORE`   |
   | `search_leases`           | `RENTAL_LEASES_VIEW`                                   | `RENTAL` |
   | `list_lease_documents`    | `RENTAL_DOCUMENTS_VIEW`                                | `RENTAL` |
   | `list_property_documents` | `PROPERTIES_VIEW`                                      | `CORE`   |
   | `propose_rental_document` | `RENTAL_DOCUMENTS_GENERATE` et `RENTAL_DOCUMENTS_VIEW` | `RENTAL` |

   Le téléchargement passe par la route existante `GET
/tenants/:tenantId/documents/:id/download` (`RENTAL_DOCUMENTS_VIEW`).

4. **Correctif RBAC des documents** (livré avant l'assistant) : les 8 routes de
   `document-routes.ts` reçoivent leur permission (voir §3). Conséquence voulue :
   `TENANT_AGENT` ne peut plus générer ni télécharger.
5. **Validation humaine.** Le chat n'écrit jamais. `propose_rental_document`
   renvoie une carte de proposition et un **jeton signé** (HMAC-SHA256, HKDF de
   `JWT_SECRET`, 300 s, lié à l'utilisateur, à l'agence, à l'action et aux
   arguments résolus par le serveur, usage unique et atomique entre instances :
   verrou consultatif PostgreSQL autour de la ligne d'audit). Elle n'est signée
   que pour un bail vu dans la requête (`search_leases`, `list_lease_documents`
   ou écran vérifié), sinon `NOT_POSSIBLE` / `lease_not_seen`. La génération n'existe que
   par `POST /ai/actions/execute`, qui rejoue authentification, agence,
   collaborateur, `RENTAL_DOCUMENTS_GENERATE` et `RENTAL_DOCUMENTS_VIEW`, puis revalide l'appartenance de
   chaque identifiant. Une quittance FINAL déjà émise est renvoyée
   (`alreadyExisted: true`) au lieu d'être regénérée ; la vérification et la
   génération forment une section critique par paiement (verrou consultatif).
6. **Minimisation.** Sorties d'outils projetées et plafonnées (10 éléments,
   8 Ko) : jamais d'e-mail, de téléphone, de chemin de fichier, de notes ni de
   propriétaire. Le jeton ne va pas au modèle. Les résultats d'outils et le
   contexte d'écran sont des données, pas des instructions.
7. **Limites.** 20 messages par requête (4 000 caractères chacun, 24 000 au
   total) ; chat 20 par minute et 300 par jour, exécution 10 par minute, par
   utilisateur et par agence, plus un plafond par agence sur le chat
   (`AI_TENANT_MINUTE_LIMIT` 100 par minute, `AI_TENANT_DAILY_LIMIT` 3000 par
   jour) ; limiteurs en mémoire, par instance ; `AI_MAX_TOOL_ROUNDS` tours (4)
   et 8 appels d'outils par requête.
8. **Traçabilité.** `AuditLog` via `logAuditEvent` : `AI_CHAT_TURN` (sans le
   texte, entité = `requestId` généré par le serveur), `AI_TOOL_CALLED`, `AI_TOOL_DENIED`, `AI_PROPOSAL_ISSUED`,
   `AI_PROPOSAL_REDEEMED` (écrit de façon synchrone, il garantit l'usage
   unique), `AI_ACTION_EXECUTED`, `AI_ACTION_REJECTED`.

## 5. Contrat d'interface

Base : `/api/tenants/:tenantId/ai`. Types et schémas Zod :
`packages/api/src/lib/ai/contracts.ts` (miroir des types :
`apps/web/src/types/copilot.ts`).

| Route                   | Rôle                                                                                                                           | Réponse                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `GET /status`           | Activé ou non, fournisseur, outils permis à l'utilisateur, limites. Répond même désactivé (`enabled: false`, `NOT_CONFIGURED`) | 200 JSON                                                 |
| `POST /chat`            | Conversation en flux ; corps `{ conversationId?, messages[1..20], context? }`, `.strict()`                                     | `text/event-stream` ; erreurs avant le flux en JSON typé |
| `POST /actions/execute` | Confirmation ; corps `{ proposalToken }`. Exige `RENTAL_DOCUMENTS_GENERATE` et `RENTAL_DOCUMENTS_VIEW`                         | 201 `{ success, data: ActionExecutedPayload }`           |

Événements SSE (`event: <type>` puis `data: <JSON>`, commentaire `: ping`
toutes les 15 s) : `meta`, `text_delta`, `tool_status`, `property_results`,
`lease_results`, `document_list`, `action_proposal`, `error`, `done`. En-têtes :
`Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`.

Codes d'erreur (`CopilotErrorCode`) : `AI_DISABLED` (503), `VALIDATION` (400),
`RATE_LIMITED` (429), `PROVIDER_UNAVAILABLE`, `PROVIDER_REFUSAL`,
`TOOL_FORBIDDEN`, `MAX_ROUNDS`, `INTERNAL`, `PROPOSAL_INVALID` (400),
`PROPOSAL_EXPIRED` (410), `PROPOSAL_ALREADY_USED` (409).

Le contexte d'écran (`currentPath`, `activeEntityType` `PROPERTY` ou `LEASE`,
`activeEntityId`) vient du navigateur, donc n'est pas fiable : il n'atteint le
modèle qu'après vérification (entité de l'agence, permission de l'outil), réduit
à une référence assainie.

## 6. Configuration

Variables `AI_*` de `packages/api/src/config/env.ts`, documentées dans
`packages/api/env.example` et dans le RUNBOOK : `AI_PROVIDER` (`disabled` par
défaut, `fake`, `anthropic`), `ANTHROPIC_API_KEY` (exigée pour `anthropic`),
`AI_MODEL` (`claude-opus-5-5`), `AI_EFFORT` (`low`), `AI_MAX_OUTPUT_TOKENS`
(16000), `AI_MAX_TOOL_ROUNDS` (4), `AI_REQUEST_TIMEOUT_MS` (60000),
`AI_PROPOSAL_TTL_SECONDS` (300), `AI_REFUSAL_FALLBACK` (`on`),
`AI_TENANT_MINUTE_LIMIT` (100), `AI_TENANT_DAILY_LIMIT` (3000). `fake` n'est
accepté que si `NODE_ENV` vaut explicitement `development` ou `test`. Aucune variable `VITE_*`.

## 7. Expérience utilisateur (`apps/web`)

- **Montage** : `CopilotRoot` est chargé en `lazy` par `AppShell` uniquement pour
  la persona `collaborateur` avec une agence active (ni portails, ni super-admin).
  Il interroge `GET /ai/status` et n'affiche **rien** si l'assistant est
  désactivé ou si le statut est en erreur.
- **Bouton flottant** « Assistant » et raccourci **Ctrl/Cmd+J**
  (`aria-keyshortcuts`). Sur mobile, il se place au-dessus de la barre d'onglets
  et de l'action flottante.
- **Tiroir** (`CopilotDrawer`, chargé à la première ouverture) : 440 px, plein
  écran sous 768 px, ancré côté « fin » (droite en français, gauche en arabe),
  focus dans la saisie, suggestions selon l'écran (fiche bail, fiche bien, module
  Location) filtrées par les outils permis, arrêt de la réponse, nouvelle
  conversation. Tous les textes passent par `t()`.
- **Cartes** : `PropertyResultCard` (lien vers `/tenant/:tenantId/properties/:id`),
  `LeaseResultCard`, `DocumentListCard`, `ActionProposalCard` (bail, bien,
  locataire, période, montant ; « Modifier » et « Confirmer et générer » ;
  désactivée à l'expiration), `DocumentDownloadCard` (« Word (.docx) »,
  `Télécharger`).
- **Rendu** : `SafeMarkdown` (paragraphes, gras, italique, code, listes) en
  éléments React ; aucun lien, image ni HTML ; jamais `dangerouslySetInnerHTML`.
- **Réseau** : `services/copilot-service.ts`, `hooks/useCopilotChat.ts`,
  `utils/event-stream.ts` (`postEventStream` : `fetch` avec
  `credentials: 'include'`, un seul rafraîchissement de session sur 401),
  `utils/sse-parser.ts`. Rien n'est stocké dans le navigateur.

## 8. Architecture des fichiers

```text
packages/api/src/
  ├── lib/ai/
  │    ├── contracts.ts              # types + schémas Zod
  │    ├── orchestrator.ts           # boucle modèle / outils, aucune écriture
  │    ├── system-prompt.ts          # invite système stable
  │    ├── page-context.ts           # contexte d'écran vérifié
  │    ├── sse.ts                    # flux SSE, ping, abandon
  │    ├── proposal-token.ts         # signature, vérification, usage unique
  │    ├── providers/                # anthropic-provider, fake-provider, index
  │    ├── tools/                    # registry + 5 outils + tool-utils
  │    └── actions/execute-rental-document.ts
  ├── middleware/ai-access-middleware.ts
  ├── controllers/ai-controller.ts
  └── routes/ai-routes.ts            # monté sur /api/tenants/:tenantId/ai

apps/web/src/
  ├── components/copilot/            # CopilotRoot, CopilotDrawer, cartes, SafeMarkdown
  ├── hooks/useCopilotChat.ts
  ├── services/copilot-service.ts
  ├── utils/{event-stream,sse-parser}.ts
  └── types/copilot.ts
```

Tests : API (Jest) `__tests__/unit/ai.*.test.ts`,
`__tests__/api/ai.routes.test.ts`, `__tests__/api/document-routes-rbac.test.ts` ;
web (Vitest) `src/__tests__/copilot/*`.
