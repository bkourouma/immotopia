# ImmoTopia

Plateforme de gestion immobilière multi-agences : CRM, gestion locative,
syndic de copropriété, patrimoine, maintenance, newsletter, et portails
locataire et propriétaire.

## Stack

| | |
|---|---|
| Backend | Node 20, TypeScript, Express 4, Prisma 5, PostgreSQL 16 |
| Frontend | React 18, TypeScript, Ant Design 6, Vite 6 (tests : Vitest) |
| Auth | JWT en cookies httpOnly, refresh tokens rotatifs, Google OAuth |
| Intégrations | WaSender / Twilio (WhatsApp), SMTP (e-mail) |

Monorepo en npm workspaces :

```
apps/web              application React
packages/api          API Express + Prisma
packages/tsconfig     configuration TypeScript partagée
packages/eslint-config configuration ESLint partagée
docs/                 documentation (voir docs/README.md)
specs/                spécifications fonctionnelles par module
```

## Démarrage

Prérequis : Node 20 (`.nvmrc`), npm 10, et PostgreSQL 16 — soit installé
localement, soit via Docker.

```bash
# 1. Dépendances (une seule installation pour tout le monorepo)
npm install

# 2. Base de données
docker compose up -d db          # ou votre PostgreSQL local

# 3. Configuration
cp packages/api/env.example packages/api/.env
# Renseignez au minimum DATABASE_URL et JWT_SECRET.
# Générez le secret : openssl rand -base64 48
# L'API refuse de démarrer avec un secret manquant, trop court ou d'exemple.

# 4. Schéma
npm run prisma:migrate -w @immotopia/api

# 5. Lancement (API sur 8001, web sur 3000)
npm run dev
```

L'API est sur **http://localhost:8001**, le frontend sur
**http://localhost:3000**. Ces ports sont ceux du code ; d'anciennes
documentations mentionnaient 8000 ou 5000, c'est faux.

### Jeu de données de démonstration

```bash
npm run db:seed:rbac -w @immotopia/api      # rôles et permissions (à faire en premier)
ALLOW_DESTRUCTIVE_SEED=1 npm run db:seed -w @immotopia/api
```

Le seed principal **supprime tous les utilisateurs, tenants et données liées**
sur la base ciblée par `DATABASE_URL`. Il refuse de s'exécuter sans
`ALLOW_DESTRUCTIVE_SEED=1`, et toujours en production.

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | API + frontend en parallèle |
| `npm run dev:api` / `npm run dev:web` | Un seul des deux |
| `npm run build` | Compile l'API puis le frontend |
| `npm run typecheck` | `tsc --noEmit` sur les deux paquets |
| `npm run lint` | ESLint sur les deux paquets |
| `npm test` | Tests backend (Jest) |
| `npm run test:web` | Tests frontend |

Docker : `docker compose up -d` lance PostgreSQL et l'API. `JWT_SECRET` est
obligatoire dans l'environnement.

## Documentation

Voir **[docs/README.md](docs/README.md)** pour l'index complet :
installation détaillée, architecture, intégrations, dépannage.

- [Audit technique et feuille de route](AUDIT_CODE.md) — état du code, dette
  identifiée et priorités.
- [Guide de contribution](CONTRIBUTING.md) — branches, commits, garde-fous.
- [`specs/`](specs/) — spécifications fonctionnelles par module.
