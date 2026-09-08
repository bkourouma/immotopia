# Contribuer à ImmoTopia

## Environnement

Node 20 (voir `.nvmrc`), npm 10. Une seule installation depuis la racine :
`npm install`. N'installez pas dans `apps/web` ou `packages/api` séparément :
le dépôt est un monorepo npm workspaces avec un unique `package-lock.json`.

## Branches et commits

- `main` est la branche de référence. On ne pousse pas directement dessus.
- Une branche par sujet : `fix/...`, `feat/...`, `chore/...`.
- Messages de commit en [Conventional Commits](https://www.conventionalcommits.org/fr/) :
  `type(portée): résumé à l'impératif`.
- Le corps du message explique le *pourquoi*, pas le *quoi* — le diff dit déjà
  quoi.

## Garde-fous

Un hook `pre-commit` (husky + lint-staged) formate et lint les fichiers
modifiés. La CI (`.github/workflows/ci.yml`) exécute sur chaque PR :

| Étape | Bloquant |
|---|---|
| `prisma generate` + `prisma migrate diff` | non (signale la dérive schéma/migrations) |
| `tsc --noEmit` backend | non (dette préexistante, voir `AUDIT_CODE.md`) |
| `eslint` | non (dette préexistante) |
| `jest` backend | **oui** |
| `tsc --noEmit` frontend | **oui** |
| `build` frontend | **oui** |

Les étapes non bloquantes le sont temporairement : elles doivent passer à
bloquant module par module à mesure que la dette est résorbée. Ne rajoutez pas
d'erreurs dans les fichiers déjà propres.

## Conventions de code

**Backend**

- Les services lèvent des erreurs typées (`NotFoundError`, `ConflictError`, …
  depuis `middleware/error-middleware`) ; les contrôleurs sont enveloppés dans
  `asyncHandler` et laissent le middleware central formater la réponse. Modèle
  de référence : `src/controllers/property-media-controller.ts`.
- Toute requête Prisma sur une entité appartenant à un tenant est filtrée par
  `tenantId`. Pour les biens et leurs enfants, passer par
  `utils/property-tenant-guard.ts`.
- Une écriture en plusieurs étapes qui doit rester cohérente va dans un
  `prisma.$transaction`.
- Un seul client Prisma : importer `prisma` depuis `utils/database`.
- Toute nouvelle variable d'environnement est déclarée dans `src/config/env.ts`
  et documentée dans `env.example`.

**Frontend**

- Les appels réseau passent par `utils/api-client` (jamais `fetch` brut) et les
  URL viennent de `config/api`.
- Les pages sont chargées en `React.lazy` depuis `App.tsx`.
- Le HTML d'origine utilisateur ne se rend pas avec `dangerouslySetInnerHTML` :
  utiliser une `<iframe sandbox>`.

## Migrations Prisma

```bash
npm run prisma:migrate -w @immotopia/api   # crée et applique en développement
```

Une migration qui touche à des données existantes commence par un contrôle qui
l'arrête avec un message clair plutôt que d'échouer à mi-parcours. Exemple :
`prisma/migrations/20260907120000_tenant_scoping_and_money_precision`.

## Sécurité

- Aucun secret dans le dépôt. `.env` est ignoré ; `env.example` ne contient que
  des valeurs vides ou factices.
- Les documents privés (baux, preuves de paiement, pièces jointes) ne sont
  jamais servis en statique : ils passent par `uploads-access-middleware`.
