# Quickstart Guide: Authentication & Login Module

**Feature**: 1-auth-login  
**Date**: 2025-11-12  
**Purpose**: Guide de démarrage rapide pour implémenter le module d'authentification

---

## Prérequis

### Outils requis

- **Node.js** >=18.x (LTS recommandée)
- **PostgreSQL** >=14
- **npm** ou **yarn** (gestionnaire de paquets)
- **Git** (contrôle de version)

### Comptes requis

- **Email service** (SendGrid, Mailgun, AWS SES, ou SMTP) - pour l'envoi d'emails
- **GitHub/GitLab** (optionnel) - pour le contrôle de version

---

## Installation

### 1. Cloner le repository

```bash
git clone <repository-url>
cd immotopia
```

### 2. Installer les dépendances

```bash
# Backend
cd packages/api
npm install

# Frontend
cd ../../apps/web
npm install
```

### 3. Configurer l'environnement

#### Backend (`.env`)

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/immotopia?schema=public"

# JWT Secrets (générer avec: openssl rand -base64 32)
JWT_SECRET="your-jwt-secret-minimum-256-bits"
REFRESH_TOKEN_SECRET="your-refresh-token-secret-minimum-256-bits"

# Email Service (SendGrid)
EMAIL_SERVICE_API_KEY="your-sendgrid-api-key"
EMAIL_FROM="noreply@immotopia.com"

# Application URLs
FRONTEND_URL="http://localhost:3000"
BACKEND_URL="http://localhost:8000"

# Environment
NODE_ENV="development"
```

#### Frontend (`.env`)

```env
REACT_APP_API_URL="http://localhost:8000/api"
REACT_APP_FRONTEND_URL="http://localhost:3000"
```

### 4. Configurer la base de données

```bash
# Backend
cd packages/api

# Créer la base de données PostgreSQL
createdb immotopia

# Exécuter les migrations Prisma
npx prisma migrate dev --name init_auth_schema

# Générer le client Prisma
npx prisma generate

# Exécuter les seeds
npx prisma db seed
```

### 5. Vérifier l'installation

```bash
# Backend
cd packages/api
npm run dev

# Frontend (dans un autre terminal)
cd apps/web
npm run dev
```

---

## Structure du projet

### Backend (`packages/api`)

```
packages/api/
├── src/
│   ├── controllers/
│   │   └── auth-controller.ts      # Routes API
│   ├── services/
│   │   └── auth-service.ts         # Logique métier
│   ├── middleware/
│   │   ├── auth-middleware.ts      # Authentification
│   │   ├── validation-middleware.ts # Validation
│   │   └── rate-limit-middleware.ts # Rate limiting
│   ├── utils/
│   │   ├── jwt-utils.ts            # JWT utilities
│   │   ├── email-utils.ts          # Email utilities
│   │   └── password-utils.ts       # Password utilities
│   └── types/
│       └── auth-types.ts           # TypeScript types
├── prisma/
│   ├── schema.prisma               # Schéma Prisma
│   ├── migrations/                 # Migrations
│   └── seeds/
│       └── seed-users.ts           # Seed data
└── __tests__/
    ├── unit/                       # Tests unitaires
    ├── integration/                # Tests d'intégration
    └── e2e/                        # Tests end-to-end
```

### Frontend (`apps/web`)

```
apps/web/
├── src/
│   ├── components/
│   │   ├── ProtectedRoute.tsx      # Route protégée
│   │   ├── AuthForm.tsx            # Formulaire d'authentification
│   │   └── PasswordStrength.tsx    # Indicateur de force de mot de passe
│   ├── pages/
│   │   ├── Register.tsx            # Page d'inscription
│   │   ├── Login.tsx               # Page de connexion
│   │   ├── ForgotPassword.tsx      # Page mot de passe oublié
│   │   ├── ResetPassword.tsx       # Page de réinitialisation
│   │   ├── VerifyEmail.tsx         # Page de vérification
│   │   └── Dashboard.tsx           # Tableau de bord
│   ├── services/
│   │   └── auth-service.ts         # Appels API
│   ├── hooks/
│   │   └── useAuth.ts              # Hook d'authentification
│   ├── context/
│   │   └── AuthContext.tsx         # Context d'authentification
│   └── utils/
│       └── api-client.ts           # Client API (Axios)
└── __tests__/
    ├── unit/                       # Tests unitaires
    ├── integration/                # Tests d'intégration
    └── e2e/                        # Tests end-to-end (Puppeteer)
```

---

## Configuration

### 1. Base de données (PostgreSQL)

```bash
# Créer la base de données
createdb immotopia

# Vérifier la connexion
psql -d immotopia -c "SELECT version();"
```

### 2. Email Service (SendGrid)

```bash
# Créer un compte SendGrid
# https://sendgrid.com/

# Obtenir la clé API
# Dashboard > Settings > API Keys > Create API Key

# Configurer l'environnement
EMAIL_SERVICE_API_KEY="SG.your-api-key"
EMAIL_FROM="noreply@immotopia.com"
```

### 3. JWT Secrets

```bash
# Générer des secrets JWT (minimum 256 bits)
openssl rand -base64 32
openssl rand -base64 32

# Configurer l'environnement
JWT_SECRET="your-jwt-secret"
REFRESH_TOKEN_SECRET="your-refresh-token-secret"
```

---

## Développement

### 1. Démarrer le backend

```bash
cd packages/api
npm run dev
```

Le backend démarre sur `http://localhost:8000`

### 2. Démarrer le frontend

```bash
cd apps/web
npm run dev
```

Le frontend démarre sur `http://localhost:3000`

### 3. Tester l'API

```bash
# Inscription
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@123456",
    "confirmPassword": "Test@123456",
    "fullName": "Test User",
    "role": "STUDENT"
  }'

# Connexion
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@123456"
  }'
```

---

## Tests

### 1. Tests backend

```bash
cd packages/api
npm test
```

### 2. Tests frontend

```bash
cd apps/web
npm test
```

### 3. Tests end-to-end (Puppeteer)

```bash
cd apps/web
npm run test:e2e
```

### 4. Couverture de tests

```bash
# Backend
cd packages/api
npm run test:coverage

# Frontend
cd apps/web
npm run test:coverage
```

---

## Débogage

### 1. Backend (Node.js)

```bash
# Mode debug
cd packages/api
node --inspect src/index.ts

# Logs
npm run dev
```

### 2. Frontend (React)

```bash
# Chrome DevTools
# 1. Ouvrir Chrome DevTools (F12)
# 2. Onglet Console pour les erreurs
# 3. Onglet Network pour les requêtes API
# 4. Onglet React DevTools pour le state

# Logs
cd apps/web
npm run dev
```

### 3. Base de données (Prisma Studio)

```bash
cd packages/api
npx prisma studio
```

Prisma Studio démarre sur `http://localhost:5555`

---

## Déploiement

### 1. Build backend

```bash
cd packages/api
npm run build
```

### 2. Build frontend

```bash
cd apps/web
npm run build
```

### 3. Variables d'environnement (production)

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/immotopia?schema=public&sslmode=require"

# JWT Secrets
JWT_SECRET="production-jwt-secret"
REFRESH_TOKEN_SECRET="production-refresh-token-secret"

# Email Service
EMAIL_SERVICE_API_KEY="production-email-api-key"
EMAIL_FROM="noreply@immotopia.com"

# Application URLs
FRONTEND_URL="https://immotopia.com"
BACKEND_URL="https://api.immotopia.com"

# Environment
NODE_ENV="production"
```

### 4. Migrations (production)

```bash
cd packages/api
npx prisma migrate deploy
```

---

## Comptes de test

### Admin

- **Email**: admin@immotopia.com
- **Password**: Admin@123456
- **Role**: ADMIN

### Instructor

- **Email**: instructeur@immotopia.com
- **Password**: Instructor@123456
- **Role**: INSTRUCTOR

### Student

- **Email**: etudiant@immotopia.com
- **Password**: Student@123456
- **Role**: STUDENT

---

## Ressources

### Documentation

- [Prisma Documentation](https://www.prisma.io/docs)
- [Express.js Documentation](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

### API Documentation

- [OpenAPI Specification](./contracts/auth-api.yaml)
- [API Documentation](http://localhost:8000/api-docs) (Swagger UI)

### Support

- **Email**: support@immotopia.com
- **GitHub Issues**: [Repository Issues](https://github.com/immotopia/issues)

---

## Dépannage

### Problème: Erreur de connexion à la base de données

```bash
# Vérifier la connexion PostgreSQL
psql -d immotopia -c "SELECT version();"

# Vérifier DATABASE_URL dans .env
echo $DATABASE_URL
```

### Problème: Erreur d'envoi d'email

```bash
# Vérifier la clé API SendGrid
curl -X GET "https://api.sendgrid.com/v3/user/profile" \
  -H "Authorization: Bearer $EMAIL_SERVICE_API_KEY"

# Vérifier EMAIL_SERVICE_API_KEY dans .env
echo $EMAIL_SERVICE_API_KEY
```

### Problème: Token JWT invalide

```bash
# Vérifier JWT_SECRET dans .env
echo $JWT_SECRET

# Vérifier la configuration JWT
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Problème: CORS errors

```bash
# Vérifier CORS configuration dans backend
# Vérifier FRONTEND_URL dans .env
echo $FRONTEND_URL
```

---

## Prochaines étapes

1. **Implémenter les endpoints API** (voir [plan.md](./plan.md))
2. **Créer les composants React** (voir [plan.md](./plan.md))
3. **Configurer les tests** (voir [plan.md](./plan.md))
4. **Déployer en production** (voir [plan.md](./plan.md))

---

**Quickstart Status**: ✅ Complete - Guide de démarrage rapide créé  
**Last Updated**: 2025-11-12

