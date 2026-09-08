# 🚀 Guide de Démarrage - ImmoTopia

Guide complet pour démarrer le projet ImmoTopia (plateforme de gestion immobilière).

## 📋 Prérequis

Avant de commencer, assurez-vous d'avoir installé :

- **Node.js** >= 18.x (LTS) - [Télécharger](https://nodejs.org/)
- **npm** (inclus avec Node.js)
- **PostgreSQL** >= 14 - [Télécharger](https://www.postgresql.org/download/)
- **Git** (optionnel, pour cloner le projet)

## 🔧 Installation

### 1. Installer les dépendances

#### 1.1. Installation à la racine

À la racine du projet :

```bash
npm install
```

Cette commande installera automatiquement les dépendances pour :
- Le backend (`packages/api`)
- Le frontend (`apps/web`)

#### 1.2. Résolution des conflits de dépendances (si nécessaire)

Si vous rencontrez une erreur de conflit de dépendances lors de l'installation du frontend (erreur `ERESOLVE`), c'est normal. Le projet utilise TypeScript 5.x alors que `react-scripts@5.0.1` supporte officiellement TypeScript 4.x.

**Solution automatique** : Un fichier `.npmrc` a été créé dans `apps/web/` pour utiliser `--legacy-peer-deps` automatiquement.

Si le problème persiste, installez manuellement dans le dossier frontend :

```bash
cd apps/web
npm install --legacy-peer-deps
```

**Note** : Cette solution est sûre et fonctionne correctement. `react-scripts` fonctionne bien avec TypeScript 5.x même si ce n'est pas officiellement supporté.

### 2. Configuration de la base de données

#### 2.1. Créer la base de données PostgreSQL

Connectez-vous à PostgreSQL et créez la base de données :

```sql
CREATE DATABASE immotopia;
```

#### 2.2. Configurer les variables d'environnement du backend

```bash
cd packages/api
copy env.example .env
```

Éditez le fichier `.env` et configurez au minimum :

```env
# Base de données (OBLIGATOIRE)
DATABASE_URL="postgresql://user:password@localhost:5432/immotopia?schema=public"

# Secrets JWT (OBLIGATOIRE - générer avec: openssl rand -base64 32)
JWT_SECRET="votre-secret-jwt-minimum-256-bits"
REFRESH_TOKEN_SECRET="votre-secret-refresh-token-minimum-256-bits"

# URLs de l'application
FRONTEND_URL="http://localhost:3000"
BACKEND_URL="http://localhost:8001"
CLIENT_URL="http://localhost:3000"

# Port du serveur backend
PORT=8001

# Environnement
NODE_ENV="development"
```

**Note importante** : Le projet utilise le port **8001** pour le backend (voir le script `00000001 start-immobillier.bat`).

#### 2.3. Configurer les variables d'environnement du frontend

```bash
cd ../../apps/web
copy env.example .env
```

Éditez le fichier `.env` :

```env
# URL de l'API backend
REACT_APP_API_URL=http://localhost:8001/api

# URL du frontend
REACT_APP_FRONTEND_URL=http://localhost:3000

# Environnement
REACT_APP_NODE_ENV=development

# Google OAuth (optionnel)
REACT_APP_GOOGLE_CLIENT_ID=votre-google-client-id
```

### 3. Initialiser la base de données

Retournez à la racine du projet et exécutez le script de configuration de la base de données :

```bash
setup-database.bat
```

Ce script va :
1. Vérifier que Node.js est installé
2. Générer le client Prisma
3. Exécuter les migrations de base de données
4. Remplir la base avec des données de test (seeds)

**Comptes de test créés** :
- `visitor@immobillier.com` / `Test@123456`
- `admin1@agence-mali.com` / `Test@123456`
- `admin2@bamako-immo.com` / `Test@123456`
- `agent@agence-mali.com` / `Test@123456`
- `proprietaire@gmail.com` / `Test@123456`
- `locataire@gmail.com` / `Test@123456`

## ▶️ Démarrage du projet

### Méthode 1 : Script automatique (Recommandé)

À la racine du projet, double-cliquez sur :

```
00000001 start-immobillier.bat
```

Ce script va :
1. Fermer les processus existants sur les ports 3000 et 8001
2. Démarrer le backend sur le port 8001
3. Démarrer le frontend sur le port 3000

### Méthode 2 : Commande npm (Alternative)

À la racine du projet :

```bash
npm run dev
```

Cette commande démarre simultanément le backend et le frontend.

### Méthode 3 : Démarrage manuel

#### Démarrer le backend

```bash
cd packages/api
npm run dev
```

Le backend sera accessible sur : `http://localhost:8001`

#### Démarrer le frontend (dans un autre terminal)

```bash
cd apps/web
npm run dev
```

Le frontend sera accessible sur : `http://localhost:3000`

## 🌐 Accès à l'application

Une fois les serveurs démarrés :

- **Frontend** : http://localhost:3000
- **Backend API** : http://localhost:8001/api
- **Inscription** : http://localhost:3000/register
- **Connexion** : http://localhost:3000/login

## 📁 Structure du projet

```
ImmoTopia-main/
├── apps/
│   └── web/              # Frontend React + TypeScript
│       ├── src/
│       ├── public/
│       └── package.json
├── packages/
│   └── api/              # Backend Express + TypeScript + Prisma
│       ├── src/
│       ├── prisma/
│       └── package.json
├── specs/                # Spécifications du projet
├── package.json          # Configuration monorepo
├── start-dev.bat         # Script de démarrage (port 8000)
└── 00000001 start-immobillier.bat  # Script de démarrage (port 8001)
```

## 🔍 Vérification

### Vérifier que tout fonctionne

1. **Backend** : Ouvrez http://localhost:8001/api/health (si disponible) ou http://localhost:8001/api
2. **Frontend** : Ouvrez http://localhost:3000
3. **Base de données** : Connectez-vous avec un compte de test

### Commandes utiles

```bash
# Backend - Générer le client Prisma
cd packages/api
npm run prisma:generate

# Backend - Créer une migration
npm run prisma:migrate

# Backend - Rôles et permissions RBAC (à lancer AVANT le seed principal)
npm run db:seed:rbac

# Backend - Remplir la base avec des données de test
# ⚠️ Ce seed efface tous les utilisateurs et tenants de la base ciblée :
#    il refuse de démarrer sans ALLOW_DESTRUCTIVE_SEED=1
#    PowerShell : $env:ALLOW_DESTRUCTIVE_SEED="1"; npm run db:seed
ALLOW_DESTRUCTIVE_SEED=1 npm run db:seed

# Frontend - Lancer les tests
cd apps/web
npm test

# Backend - Lancer les tests
cd packages/api
npm test
```

## 🛠️ Dépannage

### Le backend ne démarre pas

1. Vérifiez que PostgreSQL est démarré
2. Vérifiez que la base de données `immotopia` existe
3. Vérifiez que le fichier `.env` dans `packages/api` est correctement configuré
4. Vérifiez que le port 8001 n'est pas déjà utilisé

### Le frontend ne démarre pas

1. Vérifiez que le fichier `.env` dans `apps/web` est correctement configuré
2. Vérifiez que le port 3000 n'est pas déjà utilisé
3. Vérifiez que le backend est démarré et accessible
4. Si `react-scripts` n'est pas reconnu, réinstallez les dépendances :
   ```bash
   cd apps/web
   npm install --legacy-peer-deps
   ```

### Erreur de conflit de dépendances (ERESOLVE)

Si vous voyez une erreur concernant `react-scripts` et `typescript` :

1. **Solution automatique** : Le fichier `.npmrc` dans `apps/web/` devrait résoudre ce problème automatiquement
2. **Solution manuelle** : Installez avec `--legacy-peer-deps` :
   ```bash
   cd apps/web
   npm install --legacy-peer-deps
   ```
3. Cette erreur est normale et ne cause pas de problème fonctionnel

### Erreurs de base de données

1. Vérifiez que PostgreSQL est démarré
2. Vérifiez la connexion avec : `psql -U user -d immotopia`
3. Réinitialisez la base (⚠️ supprime toutes les données) :
   ```bash
   cd packages/api
   npx prisma migrate reset
   ```

### Port déjà utilisé

Si un port est déjà utilisé, vous pouvez :

1. Fermer l'application qui utilise le port
2. Modifier le port dans les fichiers de configuration :
   - Backend : `packages/api/.env` → `PORT=8001`
   - Frontend : `apps/web/.env` → Modifier `REACT_APP_API_URL` si nécessaire

## 📚 Documentation supplémentaire

- **API Backend** : `packages/api/README.md`
- **Frontend** : `apps/web/README.md`
- **API Documentation** : `packages/api/API.md`
- **Quick Start Dashboard** : `apps/web/QUICK_START.md`

## 🎯 Prochaines étapes

1. Connectez-vous avec un compte de test
2. Explorez le tableau de bord admin
3. Consultez la documentation API pour comprendre les endpoints disponibles
4. Consultez les spécifications dans le dossier `specs/`

## 💡 Astuces

- Utilisez le script `00000001 start-immobillier.bat` pour un démarrage rapide
- Les modifications sont rechargées automatiquement en mode développement (hot reload)
- Les logs du backend s'affichent dans la console où il a été démarré
- Les logs du frontend s'affichent dans la console du navigateur (F12)

---

**Bon développement ! 🚀**
