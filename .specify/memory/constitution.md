<!--
Sync Impact Report:
Version change: 1.1.0 → 2.0.0
Modified principles:
  - Principe I: Français Obligatoire → Français Langue Source, interface trilingue
    (fr / en / ar). Changement MAJEUR : l'exigence « français UNIQUEMENT »,
    marquée non-négociable, est levée.
Added sections: None
Removed sections: None
Templates requiring updates:
  ✅ plan-template.md - Constitution Check section aligns with updated principle
  ✅ spec-template.md - No changes needed (language-agnostic)
  ✅ tasks-template.md - No changes needed (language-agnostic)
  ✅ checklist-template.md - No changes needed
Follow-up TODOs: None
-->

# ImmoTopia Constitution

## Core Principles

### I. Français Langue Source - Interface trilingue fr / en / ar

Tout texte visible par l'utilisateur final DOIT être écrit **en français dans le
code source**, et DOIT passer par la fonction de traduction `t()`. Le texte français
_est_ la clé de traduction : `t('Ajouter un bien')`, jamais `t('properties.add')`.
Cette exigence s'applique à:

- Tous les composants React et éléments UI (boutons, labels, placeholders, tooltips)
- Tous les messages d'erreur et de succès affichés à l'utilisateur
- Toutes les notifications (toasts, alertes, confirmations)
- Tous les formulaires et leurs validations
- Tous les textes de navigation (menus, breadcrumbs, titres de pages)
- Tous les textes d'aide et tooltips contextuels
- Les messages d'erreur de l'API et les gabarits d'e-mail

L'application est servie en **français, anglais et arabe**. Une chaîne sans
traduction s'affiche en français : c'est le comportement par défaut, et non une
défaillance. L'arabe entraîne le passage de la mise en page en écriture
droite-à-gauche ; les styles DOIVENT donc employer des propriétés logiques
(`margin-inline-start`, `ms-4`, `align: 'end'`) et jamais leurs équivalents
directionnels.

**Rationale**: ImmoTopia est née pour un marché francophone, et le français reste
la langue dans laquelle l'application est pensée et écrite — c'est ce que garantit
la règle « le texte français est la clé ». Mais la zone couverte n'est pas
uniformément francophone, et refuser l'anglais et l'arabe revenait à refuser des
utilisateurs, pas à préserver une cohérence.

**Note**: Cette exigence concerne UNIQUEMENT l'interface utilisateur. Le code source,
les commentaires techniques, la documentation technique pour développeurs, et les
logs système peuvent utiliser l'anglais si nécessaire pour la maintenabilité.
Les messages `console.*` ne sont pas traduits : ils s'adressent au développeur.

**Mise en œuvre**: voir `docs/architecture/i18n.md`.

### II. Aucune Donnée Fictive

Les scripts de seed (données initiales) DOIVENT utiliser uniquement des données
réelles ou des données anonymisées provenant de sources légitimes. Aucune donnée
fictive, inventée, ou générée aléatoirement n'est autorisée dans les seeds de
production.

**Rationale**: Les données fictives peuvent créer de la confusion, des problèmes
de sécurité, et des incohérences dans les tests et la démonstration. L'utilisation
de données réelles ou anonymisées garantit la crédibilité et la fiabilité du système.

### III. Stack Technique Imposée

Le projet DOIT utiliser exclusivement la stack technique suivante:

- **Backend**: Node.js avec TypeScript, Express ou NestJS
- **Frontend**: React avec TypeScript, composants fonctionnels et hooks
- **Base de données**: PostgreSQL avec Prisma ORM
- **Contrôle de version**: Git

Aucune déviation de cette stack n'est autorisée sans amendement constitutionnel.

**Rationale**: La standardisation de la stack technique garantit la cohérence,
la maintenabilité, et la capacité de l'équipe à collaborer efficacement. Elle
réduit également les risques liés à la fragmentation technologique.

### IV. Débogage Systématique

Tout problème de frontend DOIT être débogué systématiquement en utilisant:

- Chrome DevTools pour l'inspection et le débogage interactif
- Puppeteer pour l'automatisation et les tests de bout en bout

Les problèmes ne doivent pas être résolus par des ajustements aléatoires ou des
tentatives non documentées.

**Rationale**: Le débogage systématique avec des outils standardisés garantit
la reproductibilité, la traçabilité, et la qualité des corrections. Il évite
les solutions temporaires qui masquent les problèmes sous-jacents.

### V. Workflow & Qualité

Le projet DOIT respecter les standards suivants:

- **Conventions Git**: Messages de commit descriptifs au format
  `<service>: <action> – <description>`
- **Couverture de tests**: Minimum 80% de couverture de code
- **Seeds versionnés**: Tous les scripts de seed doivent être versionnés et
  documentés
- **Branches de fonctionnalité**: Format `feature/<role>-<feature>`

**Rationale**: Des standards de qualité élevés garantissent la maintenabilité
à long terme, facilitent la collaboration, et réduisent les risques de régression.

## Architecture & Structure

Le projet suit une architecture monorepo avec:

- **Backend**: `packages/api` - Services API avec Express/NestJS
- **Frontend**: `apps/web` - Application React
- **Services backend**: AuthenticationService, UserProfileService, CourseService,
  ModuleService, OrganizationService, EnrollmentService, ReportingService,
  NotificationService, RecommendationService
- **Préfixe API**: `/api`

## Processus de Développement

### Code Review & Conformité

- Toutes les PRs DOIVENT inclure une vérification de conformité à la Constitution
- Les revues de code DOIVENT bloquer toute violation des principes
- Les agents AI (Cursor, etc.) DOIVENT valider la conformité avant génération de code

### Tests & Validation

- Tests écrits avant l'implémentation (TDD recommandé)
- Couverture minimale de 80% requise
- Tests d'intégration pour les nouveaux contrats et changements de schéma
- Validation systématique avec quickstart.md

### Documentation

- Chaque endpoint API public DOIT avoir une documentation Swagger/OpenAPI
- Chaque classe de service DOIT avoir un résumé JSDoc
- Les modules et relations d'entités DOIVENT être documentés dans architecture.md

## Governance

La Constitution ImmoTopia remplace toutes les pratiques antérieures et devient
la référence unique pour toutes les décisions techniques et architecturales.

### Amendements

Les amendements à la Constitution DOIVENT:

1. Être documentés avec justification détaillée
2. Suivre le versioning sémantique (MAJOR.MINOR.PATCH)
3. Être approuvés par le lead technique/architecte
4. Inclure un plan de migration si nécessaire
5. Être documentés dans CHANGELOG.md

### Exceptions

Toute exception aux principes DOIT être:

- Documentée dans CHANGELOG.md sous "Exceptions à la Constitution"
- Justifiée avec raison détaillée
- Approuvée par le lead technique
- Marquée comme temporaire (avec deadline) ou permanente

### Conformité

- Tous les développeurs DOIVENT lire et respecter la Constitution
- Les PRs DOIVENT inclure une checklist de conformité
- Les revues de code DOIVENT bloquer toute violation
- Les agents AI DOIVENT valider la conformité avant génération

**Version**: 2.0.0 | **Ratified**: 2025-11-12 | **Last Amended**: 2026-09-19
