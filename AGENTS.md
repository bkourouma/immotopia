# Consignes pour les agents IA

Contexte à charger avant de modifier ce dépôt. Pour les conventions humaines,
voir [CONTRIBUTING.md](CONTRIBUTING.md) ; pour l'état du code et la dette
identifiée, voir [AUDIT_CODE.md](AUDIT_CODE.md).

## Structure réelle

```text
apps/web                 React 18 + TypeScript + Ant Design, build Vite
packages/api             Express 4 + Prisma 5 + PostgreSQL
packages/tsconfig        configuration TypeScript partagée
packages/eslint-config   configuration ESLint partagée
docs/                    documentation (index : docs/README.md)
specs/                   spécifications fonctionnelles par module
```

Monorepo npm workspaces : `npm install` **à la racine uniquement**, un seul
`package-lock.json`.

## Commandes

```bash
npm run dev          # API (8001) + web (3000)
npm run typecheck    # tsc --noEmit sur les deux paquets
npm run lint
npm test             # tests backend
npm run test:web     # tests frontend
```

## Règles à respecter

**Isolation multi-tenant.** Toute requête sur une entité appartenant à un tenant
est filtrée par `tenantId`. Pour les biens et leurs enfants, passer par
`packages/api/src/utils/property-tenant-guard.ts`. Une extension Prisma
(`prisma-tenant-guard-extension.ts`) signale les requêtes non filtrées dans les
logs : ne pas ignorer ces avertissements.

**Erreurs.** Les services lèvent des erreurs typées de
`middleware/error-middleware` ; les contrôleurs sont enveloppés dans
`asyncHandler`. Ne pas ajouter de `try/catch` qui devine le statut HTTP à partir
du message. Modèle : `src/controllers/property-media-controller.ts`.

**Configuration.** Toute variable d'environnement passe par
`src/config/env.ts` et est documentée dans `env.example`. Pas de
`process.env.X || 'valeur par défaut'` pour un secret.

**Fichiers uploadés.** Les documents privés ne sont jamais servis en statique.

**Frontend.** Réseau via `utils/api-client`, URL via `config/api`, pages en
`React.lazy`, jamais de `dangerouslySetInnerHTML` sur du contenu utilisateur.

**Ports.** API 8001, web 3000. Des documents archivés mentionnent 8000 ou 5000 :
c'est faux.

## Pièges connus

- La base de démonstration est effacée par `npm run db:seed` : ce seed exige
  `ALLOW_DESTRUCTIVE_SEED=1` et refuse de tourner en production.
- Les variables d'environnement du frontend doivent être préfixées `VITE_` pour
  être exposées au bundle, et se lisent via `import.meta.env`, pas
  `process.env`. Le port du serveur de développement vient de `PORT` dans
  `apps/web/.env` et doit rester aligné avec `FRONTEND_URL` côté API, dont le
  CORS n'autorise qu'une seule origine.
- Vitest refuse tout import qu'un `vi.mock` ne déclare pas explicitement, là où
  Jest renvoyait `undefined` en silence : un mock de module doit couvrir chaque
  export utilisé par le composant testé.
- Le backend compte encore ~160 erreurs TypeScript préexistantes ; ne pas en
  ajouter dans les fichiers déjà propres.
