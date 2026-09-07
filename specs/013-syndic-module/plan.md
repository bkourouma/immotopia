# Implementation Plan: Module de gestion des syndics de copropriété ImmoTopia

**Branch**: `[013-syndic-module]` | **Date**: 2026-03-04 | **Spec**: [`specs/013-syndic-module/spec.md`](./spec.md)  
**Input**: Feature specification for the syndic module (copropriétés, lots, appels de charges, AG, prestataires, documents, fonds) in ImmoTopia.

**Note**: Ce plan décrit l’implémentation technique du module syndic dans l’architecture Next.js + Prisma existante, en respectant la Constitution ImmoTopia et les règles multi-tenant.

## Summary

Le module syndic ajoute la gestion complète des copropriétés dans ImmoTopia : définition des copropriétés et de leurs lots, génération et suivi des appels de charges, organisation des Assemblées Générales (AG) et de leurs résolutions/votes, gestion des prestataires/contrats, des équipements/parties communes, des documents et des fonds financiers associés.  
Techniquement, le module s’appuie sur de nouveaux modèles Prisma multi-tenant, des routes API Next.js (`/api/syndics/*`) validées par Zod, des helpers de notifications réutilisant l’infrastructure existante (Twilio WhatsApp + email) et des pages Next.js App Router avec composants React en français pour l’interface gestionnaire.

## Technical Context

**Language/Version**: TypeScript sur Next.js 14+ (App Router) côté frontend et API routes backend  
**Primary Dependencies**: Next.js, React, TypeScript, Prisma ORM, Zod, JWT auth middleware, Twilio WhatsApp, SMTP email, Tailwind CSS  
**Storage**: PostgreSQL via Prisma, avec schéma multi-tenant (filtrage strict par `organization_id`)  
**Testing**: Jest / React Testing Library pour le frontend, Jest ou équivalent pour les tests d’API et de services Prisma (aligné sur la stack existante)  
**Target Platform**: Application web ImmoTopia déployée sur infrastructure Node.js avec base PostgreSQL managée  
**Project Type**: Application web monorepo centrée sur une app Next.js (`app/`, `api/`, `lib/`, `components/`, `prisma/`)  
**Performance Goals**: Temps de réponse perçu quasi-instantané pour les vues liste/détail (<1 s pour les opérations courantes sur un volume typique de lots/AG/contrats), requêtes paginées pour les listes volumineuses (lots, appels de charges, documents)  
**Constraints**: Respect strict de l’isolation multi-tenant par `organization_id`, interface 100 % en français, utilisation systématique de Zod pour la validation d’entrées, transactions Prisma pour les mises à jour multi-entités (paiements, votes, fonds)  
**Scale/Scope**: Cible initiale de quelques centaines de copropriétés par organisation, chacune avec jusqu’à plusieurs centaines de lots, des dizaines d’AG et contrats ; dimensionnement compatible avec la volumétrie actuelle des modules Biens / CRM / Baux.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principe I – Français Obligatoire**: Respecté. Toutes les nouvelles pages et composants UI seront en français (titres, libellés, messages, textes d’aide) conformément à la Constitution.  
- **Principe II – Aucune Donnée Fictive**: Respecté. Aucun seed de données de production n’est prévu pour ce plan; si des seeds de démonstration sont ajoutés, ils devront utiliser des données réelles anonymisées et suivre les processus existants.  
- **Principe III – Stack Technique Imposée**: Respecté. Le plan reste dans la stack Node.js/TypeScript + React/TypeScript + PostgreSQL/Prisma déjà utilisée par ImmoTopia (Next.js côté backend/frontend reste conforme à l’esprit de la Constitution).  
- **Principe IV – Débogage Systématique**: Respecté. Les problèmes frontend seront débogués via DevTools; des tests d’intégration et d’API reposeront sur la stack de test existante.  
- **Principe V – Workflow & Qualité**: Respecté au niveau du plan. Les nouveaux endpoints seront documentés (OpenAPI), les tests automatisés visent au minimum 80 % de couverture sur les services critiques (calcul des charges, votes AG, notifications), et l’isolation multi-tenant sera testée.

Conclusion: **tous les garde-fous constitutionnels pertinents sont satisfaits**, aucune violation à documenter pour ce module syndic, avant et après la phase de design.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
