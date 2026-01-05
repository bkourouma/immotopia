# StandardApplication Template Backend API

Backend API pour le module d'authentification et de connexion du template StandardApplication.

## Technologies

- **Node.js** >= 18.x (LTS)
- **TypeScript** (mode strict)
- **Express.js** - Framework web
- **Prisma ORM** - Gestion de base de données
- **PostgreSQL** >= 14 - Base de données
- **JWT** - Tokens d'authentification
- **bcrypt** - Hachage de mots de passe
- **Zod** - Validation de schémas
- **Nodemailer** - Envoi d'emails

## Installation

1. Installer les dépendances :
```bash
npm install
```

2. Configurer les variables d'environnement :
```bash
cp env.example .env
# Éditer .env avec vos valeurs
```

3. Configurer PostgreSQL :
   - Installer PostgreSQL >= 14
   - Créer une base de données : `CREATE DATABASE immotopia;`
   - Configurer `DATABASE_URL` dans `.env`

4. Configurer la base de données :
```bash
# Générer le client Prisma
npm run prisma:generate

# Créer les migrations
npm run prisma:migrate

# Exécuter les seeds (données de test)
npm run prisma:seed
```

## Scripts disponibles

- `npm run dev` - Démarrer le serveur en mode développement
- `npm run build` - Compiler TypeScript
- `npm start` - Démarrer le serveur en production
- `npm test` - Exécuter les tests
- `npm run test:watch` - Exécuter les tests en mode watch
- `npm run test:coverage` - Générer le rapport de couverture
- `npm run lint` - Vérifier le code avec ESLint
- `npm run lint:fix` - Corriger automatiquement les erreurs ESLint
- `npm run format` - Formater le code avec Prettier

## Structure du projet

```
packages/api/
├── src/
│   ├── controllers/    # Routes API
│   ├── services/       # Logique métier
│   ├── middleware/     # Middlewares (auth, validation, etc.)
│   ├── utils/          # Utilitaires
│   └── types/          # Types TypeScript
├── prisma/
│   ├── schema.prisma   # Schéma de base de données
│   ├── migrations/     # Migrations
│   └── seeds/          # Données de test
└── __tests__/          # Tests
```

## Variables d'environnement

Voir `env.example` pour la liste complète des variables d'environnement requises.

**Variables principales** :
- `DATABASE_URL` - URL de connexion PostgreSQL (format: `postgresql://user:password@localhost:5432/immotopia?schema=public`)
- `JWT_SECRET` - Secret pour signer les access tokens (minimum 32 caractères, générer avec `openssl rand -base64 32`)
- `REFRESH_TOKEN_SECRET` - Secret pour signer les refresh tokens (minimum 32 caractères)
- `EMAIL_SERVICE_TYPE` - Type de service email : `smtp`, `sendgrid`, ou `ses`
- `EMAIL_SERVICE_API_KEY` - Clé API du service d'email (si SendGrid ou SES)
- `EMAIL_SMTP_HOST` - Hôte SMTP (si type `smtp`)
- `EMAIL_SMTP_PORT` - Port SMTP (si type `smtp`)
- `EMAIL_SMTP_USER` - Utilisateur SMTP (si type `smtp`)
- `EMAIL_SMTP_PASS` - Mot de passe SMTP (si type `smtp`)
- `EMAIL_FROM` - Adresse email expéditrice
- `FRONTEND_URL` - URL du frontend (ex: `http://localhost:3000`)
- `BACKEND_URL` - URL du backend (ex: `http://localhost:8000`)
- `NODE_ENV` - Environnement : `development`, `production`, ou `test`
- `PORT` - Port du serveur (défaut: `8000`)
- `LOG_LEVEL` - Niveau de log : `debug`, `info`, `warn`, `error` (défaut: `info` en production, `debug` en développement)

## Tests

Les tests sont organisés en trois catégories :
- **Unit tests** : Tests unitaires des services et utilitaires
- **Integration tests** : Tests d'intégration des endpoints API
- **E2E tests** : Tests end-to-end des flux complets

Objectif de couverture : **80% minimum**

## Documentation API

- **Documentation complète** : Voir [API.md](./API.md) pour tous les endpoints avec exemples
- **OpenAPI/Swagger** : Disponible dans `specs/1-auth-login/contracts/auth-api.yaml`

## Déploiement

### Prérequis

- Node.js >= 18.x (LTS)
- PostgreSQL >= 14
- Variables d'environnement configurées

### Production

1. Construire le projet :
```bash
npm run build
```

2. Démarrer le serveur :
```bash
npm start
```

### Docker (à venir)

Les Dockerfiles seront ajoutés dans une phase ultérieure.

### Logs

Les logs sont écrits dans :
- **Console** : Tous les environnements
- **Production** : `logs/error.log` (erreurs uniquement) et `logs/combined.log` (tous les logs)
- Rotation automatique : 5MB par fichier, maximum 5 fichiers

## Santé du système

L'endpoint `/health` permet de vérifier que le serveur fonctionne :

```bash
curl http://localhost:8000/health
```

Réponse :
```json
{
  "status": "ok",
  "timestamp": "2025-11-12T10:00:00.000Z"
}
```

## Conventions de code

- **Fichiers** : kebab-case (ex: `auth-service.ts`)
- **Fonctions** : camelCase
- **Classes** : PascalCase
- **Constantes** : UPPER_SNAKE_CASE
- **Indentation** : 2 espaces
- **Guillemets** : Simple quotes
- **Point-virgule** : Oui

## Sécurité

- Mots de passe hashés avec bcrypt (salt factor 12)
- Tokens JWT stockés dans des cookies HTTP-only
- Protection contre les attaques par force brute
- Rate limiting sur les endpoints sensibles
- Validation stricte des entrées avec Zod

