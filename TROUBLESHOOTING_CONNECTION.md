# Guide de Résolution - Erreur de Connexion Backend

## Problème : `ERR_CONNECTION_REFUSED` sur `http://localhost:8001/api/auth/login`

### Cause
Le frontend essaie de se connecter au port **8001** mais le backend écoute sur le port **8000** par défaut.

### Solution 1 : Démarrer le backend (Recommandé)

1. **Ouvrir un terminal dans le dossier `packages/api`**

2. **Vérifier que les dépendances sont installées** :
   ```bash
   npm install
   ```

3. **Vérifier la configuration de la base de données** :
   - Vérifier que le fichier `.env` existe dans `packages/api/`
   - Vérifier que `DATABASE_URL` est configuré

4. **Démarrer le backend** :
   ```bash
   npm run dev
   ```

   Le backend devrait démarrer sur `http://localhost:8000`

### Solution 2 : Aligner les ports

#### Option A : Changer le port du backend pour 8001

Dans `packages/api/src/index.ts`, ligne 27 :
```typescript
const PORT = process.env.PORT || 8001; // Changé de 8000 à 8001
```

Ou définir la variable d'environnement dans `packages/api/.env` :
```
PORT=8001
```

#### Option B : Changer la configuration du frontend pour 8000

Dans `apps/web/.env` (créer le fichier si nécessaire) :
```
REACT_APP_API_URL=http://localhost:8000/api
```

### Solution 3 : Vérifier que le backend est bien démarré

1. **Vérifier que le backend répond** :
   ```bash
   curl http://localhost:8000/api/health
   # ou
   curl http://localhost:8001/api/health
   ```

2. **Vérifier les logs du backend** :
   - Le backend devrait afficher : `Server is running on port 8000` (ou 8001)

### Vérifications rapides

1. ✅ **Backend démarré** : Vérifier qu'un terminal exécute `npm run dev` dans `packages/api/`
2. ✅ **Port correct** : Vérifier que le port dans `api-client.ts` correspond au port du backend
3. ✅ **Base de données** : Vérifier que PostgreSQL est démarré et accessible
4. ✅ **Variables d'environnement** : Vérifier que `.env` est configuré correctement

### Configuration recommandée

**Backend** (`packages/api/.env`) :
```
PORT=8000
DATABASE_URL=postgresql://user:password@localhost:5432/immotopia?schema=public
```

**Frontend** (`apps/web/.env`) :
```
REACT_APP_API_URL=http://localhost:8000/api
```

### Commandes de démarrage complètes

**Terminal 1 - Backend** :
```bash
cd packages/api
npm install
npm run dev
```

**Terminal 2 - Frontend** :
```bash
cd apps/web
npm install
npm start
```

### Si le problème persiste

1. **Vérifier les ports utilisés** :
   ```bash
   # Windows
   netstat -ano | findstr :8000
   netstat -ano | findstr :8001
   
   # Linux/Mac
   lsof -i :8000
   lsof -i :8001
   ```

2. **Vérifier les logs du backend** pour voir s'il y a des erreurs de démarrage

3. **Vérifier la configuration CORS** dans le backend si l'erreur persiste
