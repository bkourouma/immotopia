# Spécification 022 — Assistant IA In-App (ImmoCopilot)

> Document de cadrage et spécification fonctionnelle & technique pour l'intégration de l'assistant IA conversationnel dans le SaaS ImmoTopia.

## 1. Références et Dépendances

- **PRD de référence** : [`docs/architecture/PRD_ASSISTANT_IA_IMMOCOPILOT.md`](file:///D:/APP/Immobillier/docs/architecture/PRD_ASSISTANT_IA_IMMOCOPILOT.md)
- **Catalogue source des actions** : [`docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx`](file:///D:/APP/Immobillier/docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx) (feuille `Sous-fonctionnalites`)
- **Modèle de menace et sécurité** : [`docs/governance/SECURITY.md`](file:///D:/APP/Immobillier/docs/governance/SECURITY.md)
- **Modèle de données** : [`packages/api/prisma/schema.prisma`](file:///D:/APP/Immobillier/packages/api/prisma/schema.prisma) (`AuditLog`, `Property`, `RentalLease`, `RentalDocument`)

## 2. Synthèse Fonctionnelle

L'assistant permet aux utilisateurs habilités d'exécuter des actions métier par le langage naturel :

1. **Recherche & Filtrage** : Localiser des biens ou des baux selon des critères combinés.
2. **Consultation de pièces** : Lister les documents d'un dossier locatif ou d'une propriété.
3. **Génération de documents** : Préparer et émettre des quittances ou avis d'échéance.
4. **Téléchargement direct** : Mettre à disposition le document PDF ou Excel généré.

## 3. Gardes-Fous & Sécurité

1. **Étanchéité Multi-Tenant** : Le `tenantId` est injecté obligatoirement depuis la session JWT. L'IA ne peut jamais demander un tenant arbitraire.
2. **Contrôle RBAC par Outil** : Chaque tool vérifie la permission technique requise (`PROPERTIES_VIEW`, `RENTAL_VIEW`, `DOCUMENTS_GENERATE`).
3. **Correctif RBAC requis** : Application d'un guard explicite `requirePermission('DOCUMENTS_GENERATE')` sur `POST /tenants/:tenantId/documents/generate` (`packages/api/src/routes/document-routes.ts:57`).
4. **Human-in-the-Loop** : Toute action créant ou modifiant un document nécessite une confirmation explicite de l'utilisateur via une carte interactive Ant Design dans le chat.
5. **Traçabilité** : Chaque appel d'outil est journalisé dans la table Prisma `audit_logs` avec l'identifiant de l'utilisateur, l'action exécutée et le statut.

## 4. Architecture des Fichiers Cibles

```text
packages/api/src/
  ├── ai/
  │    ├── adapters/             # Adaptateurs LLM (Gemini, OpenAI, Claude)
  │    │    └── llm.adapter.ts
  │    ├── tools/                # Définitions Zod des outils et exécuteurs
  │    │    ├── properties.tools.ts
  │    │    └── rental-documents.tools.ts
  │    ├── orchestrator.ts       # Boucle agentique et gestion des tools
  │    └── ai.controller.ts      # Endpoint POST /tenants/:tenantId/ai/chat (SSE)
  └── routes/
       └── ai-routes.ts          # Déclaration de la route protégée

apps/web/src/
  ├── components/copilot/
  │    ├── CopilotDrawer.tsx     # Tiroir Ant Design 6
  │    ├── CopilotTrigger.tsx    # Bouton flottant + écouteur Ctrl+J
  │    ├── ActionCard.tsx        # Carte de confirmation Human-in-the-Loop
  │    └── DownloadCard.tsx      # Carte de téléchargement direct
  └── hooks/
       └── useCopilotChat.ts     # Hook de streaming SSE et gestion de conversation
```
