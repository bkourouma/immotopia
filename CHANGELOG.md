# Changelog - ImmoTopia

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [Non publié]

### Ajouté

- **Interface multilingue : français, anglais et arabe.**
  - Le **texte français est la clé de traduction** (`t('Ajouter un bien')`) : une
    chaîne non traduite s'affiche en français, jamais vide ni sous forme de clé.
  - Sélecteur de langue dans l'en-tête et dans le profil ; le choix est mémorisé
    localement et rattaché au compte (`users.preferred_language`).
  - **Arabe en écriture droite-à-gauche** : `<html dir>`, `<ConfigProvider direction>`,
    passage des styles aux propriétés logiques, pile de polices couvrant l'arabe.
  - Dates, nombres et devises suivent la langue (`Intl`, dayjs, Ant Design).
  - Côté API : messages d'erreur traduits au moment de la réponse
    (`Accept-Language`), gabarits d'e-mail dans la langue du destinataire.
  - Outillage rejouable : `npm run i18n:extract` dans chaque paquet.
  - Détails : [docs/architecture/i18n.md](docs/architecture/i18n.md).

### Modifié

- **Constitution 1.1.0 → 2.0.0** — Principe I. L'exigence « interface UNIQUEMENT
  en français », marquée non-négociable, devient « français langue source,
  interface trilingue ». Voir ci-dessous.

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

## 2026-09-19 - Amendement Principe I (Français Obligatoire)

**Fichier**: `.specify/memory/constitution.md` — Principe I
**Raison**: le Principe I interdisait toute langue autre que le français dans
l'interface, et se déclarait non-négociable. La demande d'ouvrir l'application à
l'anglais et à l'arabe le contredit frontalement : elle ne pouvait pas être livrée
sans amender le principe. Plutôt qu'une exception — qui aurait laissé le dépôt se
contredire lui-même — le principe est **amendé**, et son intention préservée :
le français reste la langue dans laquelle l'application est écrite, puisque le
texte français _est_ la clé de traduction.
**Durée**: permanent (amendement, version 2.0.0).
**Impact**: toute l'interface web, les messages d'erreur de l'API et les gabarits
d'e-mail. Une chaîne non traduite s'affiche en français : aucun écran ne peut
régresser vers du texte vide ou une clé technique.
**Remédiation**: sans objet — il ne s'agit pas d'une dette à résorber.
**Approuvé par**: Baba Kourouma (2026-09-19), après présentation du conflit entre
le Principe I et la demande de mise en multilingue.

### Aucune autre exception actuellement

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
