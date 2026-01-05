# StandardApplication Template Frontend Web Application

Application web React pour le module d'authentification et de connexion du template StandardApplication.

## Technologies

- **React** >= 18.x
- **TypeScript** (mode strict)
- **React Router** - Routage
- **Axios** - Client HTTP
- **React Context API** - Gestion d'état globale
- **Tailwind CSS** - Styles (à configurer)
- **Jest** + **React Testing Library** - Tests
- **Puppeteer** - Tests E2E

## Installation

1. Installer les dépendances :
```bash
npm install
```

2. Installer Tailwind CSS (si pas déjà fait) :
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

3. Configurer les variables d'environnement :
```bash
cp env.example .env
# Éditer .env avec vos valeurs (surtout REACT_APP_API_URL)
```

4. Démarrer l'application :
```bash
npm run dev
```

L'application sera accessible sur `http://localhost:3000`

**Note** : Assurez-vous que le backend est démarré et accessible à l'URL configurée dans `REACT_APP_API_URL`.

## Scripts disponibles

- `npm run dev` - Démarrer l'application en mode développement
- `npm run build` - Construire l'application pour la production
- `npm test` - Exécuter les tests
- `npm run test:watch` - Exécuter les tests en mode watch
- `npm run test:coverage` - Générer le rapport de couverture
- `npm run lint` - Vérifier le code avec ESLint
- `npm run lint:fix` - Corriger automatiquement les erreurs ESLint
- `npm run format` - Formater le code avec Prettier

## Structure du projet

```
apps/web/
├── src/
│   ├── components/     # Composants réutilisables
│   ├── pages/          # Pages (routage)
│   ├── services/       # Appels API
│   ├── hooks/          # Hooks personnalisés
│   ├── context/        # React Context (AuthContext)
│   ├── utils/          # Utilitaires
│   └── types/          # Types TypeScript
└── __tests__/          # Tests
```

## Variables d'environnement

Voir `env.example` pour la liste complète des variables d'environnement requises.

**Variables principales** :
- `REACT_APP_API_URL` - URL de l'API backend (ex: `http://localhost:8000/api`)
- `REACT_APP_FRONTEND_URL` - URL du frontend (ex: `http://localhost:3000`)
- `REACT_APP_NODE_ENV` - Environnement : `development` ou `production`

## Tests

Les tests sont organisés en trois catégories :
- **Unit tests** : Tests unitaires des composants et hooks
- **Integration tests** : Tests d'intégration des pages
- **E2E tests** : Tests end-to-end avec Puppeteer

Objectif de couverture : **80% minimum**

## Conventions de code

- **Composants** : PascalCase (ex: `Register.tsx`)
- **Fichiers** : PascalCase pour composants, kebab-case pour utilitaires
- **Fonctions** : camelCase
- **Hooks** : camelCase avec préfixe `use` (ex: `useAuth`)
- **Indentation** : 2 espaces
- **Guillemets** : Simple quotes
- **Point-virgule** : Oui

## UI en français

**IMPORTANT** : Tous les textes de l'interface utilisateur doivent être en français :
- Labels des formulaires
- Messages d'erreur
- Boutons
- Titres et descriptions
- Messages de confirmation

## Authentification

L'authentification est gérée via :
- **AuthContext** : État global d'authentification
- **ProtectedRoute** : Composant pour protéger les routes
- **HTTP-only cookies** : Stockage sécurisé des tokens

## Développement

### Débogage

- Utiliser **Chrome DevTools** pour l'inspection manuelle
- Utiliser **Puppeteer** pour les tests E2E automatisés

### Hot Reload

L'application supporte le hot reload en mode développement. Les modifications sont automatiquement rechargées.

