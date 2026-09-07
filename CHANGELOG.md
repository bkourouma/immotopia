# Changelog - ImmoTopia

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [Non publié]

### À venir
- Initialisation du projet backend (Node.js + TypeScript + Prisma)
- Initialisation du projet frontend (React + TypeScript)
- Configuration base de données PostgreSQL
- Scripts de seed initiaux

---

## [1.0.0] - 2025-11-12

### Ajouté
- **Constitution du projet** (`.specify/memory/constitution.md`) v1.0.0
  - Principe I: Français Obligatoire (UI, messages, docs, notifications)
  - Principe II: Aucune Donnée Fictive (seeds uniquement)
  - Principe III: Stack Technique Imposée (Node + TypeScript + React + PostgreSQL + Prisma)
  - Principe IV: Débogage Systématique (Chrome DevTools + Puppeteer)
  - Principe V: Workflow & Qualité (Git conventions, 80% coverage, seeds versionnés)
- Architecture projet définie (packages/api, apps/web)
- Services backend spécifiés (Auth, User, Course, Module, Organization, etc.)
- Processus de gouvernance établi (amendements, exceptions, conformité)

---

## Exceptions à la Constitution

> Toute exception aux principes de la Constitution doit être documentée ici.

### Format attendu:
```markdown
## [DATE] - Exception Principe [N] ([NOM DU PRINCIPE])
**Fichier**: [chemin/vers/fichier]
**Raison**: [justification détaillée]
**Durée**: [temporaire avec deadline OU permanent]
**Impact**: [scope, risques]
**Remédiation**: [plan de correction si applicable]
**Approuvé par**: [nom du lead technique/architecte]
```

### Aucune exception actuellement

---

## Notes de version

### [1.0.0] - Constitution initiale
Cette version établit les principes fondamentaux non-négociables du projet ImmoTopia.
Elle remplace toute pratique antérieure et devient la référence unique pour toutes les
décisions techniques et architecturales.

**Impact sur l'équipe**:
- Tous les développeurs doivent lire et respecter la Constitution
- Les PRs doivent inclure une checklist de conformité Constitution
- Les revues de code doivent bloquer toute violation des 5 principes
- Les agents AI (Cursor, etc.) doivent valider la conformité avant génération de code

**Prochaines étapes**:
1. Réviser templates (.specify/templates/) pour alignement
2. Créer checklist de conformité pour PRs
3. Établir routine de revue hebdomadaire/mensuelle
4. Former l'équipe sur les principes et processus d'exception

