# ADR-001 : contrôler les frontières entre paquets

## Statut

Accepté

## Date

2026-09-27

## Contexte

ImmoTopia est un monorepo npm avec un frontend dans `apps/web` et une API dans
`packages/api`. Les règles de contribution documentent leur séparation, mais
aucune vérification statique n'empêche un import direct d'un paquet vers les
sources de l'autre.

Le dépôt cible Node 20. La CI GitHub Actions installe déjà les dépendances à la
racine.

## Décision

- Ajouter `dependency-cruiser` comme dépendance de développement racine.
- Bloquer les imports de `packages/api/src` depuis `apps/web/src` et les imports
  de `apps/web/src` depuis `packages/api/src`.
- Exécuter cette vérification comme étape bloquante de la CI.
- Utiliser une version compatible avec Node 20 et garder la configuration dans
  `.dependency-cruiser.cjs`.

## Conséquences positives

- Une violation de frontière échoue localement via `npm run check:architecture`
  et dans chaque pull request.
- La règle vérifie le code réel et complète les consignes écrites.
- Le contrôle ne requiert pas de service externe ni de nouvel accès aux données.

## Conséquences négatives

- `dependency-cruiser` ajoute une dépendance de développement et un peu de temps
  à l'installation et à la CI.
- Les règles restent limitées aux frontières de paquets ; elles ne garantissent
  pas à elles seules toutes les couches internes de l'architecture.

## Alternatives écartées

- **Ajouter tous les outils proposés** — ast-grep, Gitleaks, adr-tools et
  plusieurs serveurs MCP apporteraient des dépendances, des accès ou
  de la maintenance supplémentaires sans besoin démontré dans ce changement.
- **Ajouter des contraintes internes entre toutes les couches** — plusieurs
  exceptions existantes demandent un audit séparé avant d'en faire des règles
  bloquantes.
- **S'en tenir aux règles Markdown** — elles expliquent la séparation mais ne
  détectent pas automatiquement une régression d'import.

## Liens

- `.dependency-cruiser.cjs`
- `package.json` (`check:architecture`)
- `.github/workflows/ci.yml`
- `docs/governance/CODING_STANDARDS.md`
