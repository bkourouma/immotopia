# ADR-002 : ajouter Repomix et Lefthook

## Statut

Accepté

## Date

2026-09-27

## Contexte

Le dépôt est un monorepo Node 20 dont l'ancien hook pré-commit utilise Husky et
lint-staged. Les assistants IA ont aussi besoin d'un moyen répétable de préparer
du contexte depuis le code, les spécifications et la documentation.

## Décision

- Remplacer Husky par Lefthook 2.1.14 comme gestionnaire de hooks, en conservant
  le comportement existant de `lint-staged`.
- Ajouter Repomix 1.14.0, compatible avec Node 20, et générer un export XML
  local.
- Respecter `.gitignore`, exclure explicitement les fichiers `.env` locaux, activer le
  contrôle Secretlint et ignorer les exports générés dans Git.

## Conséquences positives

- Les hooks restent configurés dans un seul gestionnaire et le formatage/lint
  des fichiers indexés est préservé.
- Le contexte du dépôt peut être préparé de façon reproductible.
- Les fichiers repérés comme sensibles sont exclus de l'export.

## Conséquences négatives

- Lefthook et Repomix ajoutent des dépendances de développement.
- Les exports doivent être inspectés avant partage ; la détection automatique
  de secrets ne garantit pas l'absence de toute donnée confidentielle.

## Alternatives écartées

- **Garder Husky en parallèle** — deux gestionnaires pourraient se remplacer ou
  s'exécuter deux fois pour le même hook.
- **Utiliser Repomix sans configuration** — la configuration partagée précise
  les fichiers ignorés, le format et les vérifications de sécurité.

## Liens

- `package.json` et `package-lock.json`
- `.lefthook.yml`
- `repomix.config.json`
- `.gitignore`
- `docs/governance/CODING_STANDARDS.md`
