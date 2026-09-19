---
name: run-immotopia
description: Fait tourner l'application ImmoTopia en local et la pilote dans un navigateur — API Express sur 8001, front Vite sur 3000, monorepo npm workspaces. Utilise ce skill dès qu'il s'agit de démarrer ou relancer l'app, de l'ouvrir pour la regarder, d'en faire une capture, de se connecter avec un compte de démonstration, ou de constater de ses yeux qu'une modification fonctionne dans l'application réelle. Utilise-le aussi pour tout ce qui empêche l'app de tourner correctement : serveur qui refuse de démarrer sur un secret invalide, 401 ou 403 inattendu, permission manquante, écran « Impossible de charger ces données », écran qui reste vide alors que la base contient des lignes, menu absent, ou appels API qui cessent tous de passer après un changement de port (CORS). Couvre enfin la restauration d'un dump PostgreSQL de démonstration dans la base locale. Déclenche-le même sur une demande minimale — « run », « démarre », « ça marche ? », « montre-moi » — et même si l'app n'est pas nommée. En revanche il ne sert pas à lancer la suite de tests, à écrire des tests, à corriger des erreurs de typage, à générer une migration Prisma, à déployer, ni à interroger la base pour en compter le contenu.
---

# Lancer ImmoTopia

Recette vérifiée le 19 septembre 2026 sur la branche `feat/finance-lot-0`
(Windows 11, PostgreSQL 18, Node 20). Chaque piège documenté ici a réellement
bloqué un démarrage : ils ne sont pas théoriques.

## Ce qu'est le projet

Monorepo npm workspaces, **un seul lockfile à la racine** :

| Paquet                            | Rôle                          | Port |
| --------------------------------- | ----------------------------- | ---- |
| `packages/api` (`@immotopia/api`) | Express + Prisma + PostgreSQL | 8001 |
| `apps/web` (`@immotopia/web`)     | React + Vite + Ant Design     | 3000 |

Les ports sont ceux du code. D'anciennes documentations mentionnent 8000 ou
5000 — c'est faux, et le README le dit lui-même.

## Séquence de lancement

```bash
npm install                    # à la racine uniquement
npm run dev                    # API + front en parallèle
```

Dans un harnais qui pilote des serveurs (`preview_start`), `.claude/launch.json`
définit déjà les deux entrées `api` et `web`. **Démarre `api` en premier** : le
front l'interroge dès le premier rendu et affiche un écran d'erreur s'il ne
répond pas.

### Attendre que l'API soit prête

`ts-node-dev` met une bonne dizaine de secondes à transpiler. Sonde `/health`,
qui répond **sans authentification** :

```bash
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/health)
  [ "$code" = "200" ] && echo "API prête (~${i}s)" && break
done
```

Attention : `/api/health` n'existe pas et renvoie 401 en passant par le
middleware d'authentification. Un 401 sur cette URL signifie que le serveur
tourne, pas qu'il est en panne — mais utilise `/health` pour une sonde franche.

## Les quatre pièges

### 1. L'API refuse de démarrer sur un secret invalide

`packages/api/src/config/env.ts` valide l'environnement avec Zod au démarrage et
**sort du processus** plutôt que de booter avec un secret faible. C'est un
garde-fou volontaire, pas un bug.

Trois refus possibles, et le message dit lequel :

| Message                             | Cause                                                     |
| ----------------------------------- | --------------------------------------------------------- |
| `variable requise`                  | la ligne `JWT_SECRET=` est absente du `.env`              |
| `doit faire au moins 32 caractères` | valeur vide ou trop courte                                |
| `valeur d'exemple détectée`         | valeur présente dans la liste noire `PLACEHOLDER_SECRETS` |

Le troisième cas ne touche plus les clones récents : depuis le commit `b0e3e5f`
(correctifs de sécurité, 7 septembre 2026), `env.example` livre `JWT_SECRET=""`
au lieu d'un placeholder. Un `.env` fraîchement copié produit donc l'erreur de
longueur. Le message « valeur d'exemple » signale un `.env` ancien, hérité d'un
checkout antérieur ou transmis à la main — vérifie la date du fichier avant de
conclure.

Le correctif est le même dans les trois cas.

```bash
node -e "
const fs=require('fs'), c=require('crypto'), p='packages/api/.env';
let s=fs.readFileSync(p,'utf8');
s=s.replace(/^JWT_SECRET=.*\$/m,'JWT_SECRET=\"'+c.randomBytes(48).toString('base64')+'\"');
s=s.replace(/^REFRESH_TOKEN_SECRET=.*\$/m,'REFRESH_TOKEN_SECRET=\"'+c.randomBytes(48).toString('base64')+'\"');
fs.writeFileSync(p,s);
"
```

Sauvegarde le fichier avant de le réécrire — il contient des identifiants SMTP
et OAuth que l'utilisateur ne veut pas perdre.

Seul `JWT_SECRET` est validé par le schéma Zod, et c'est donc le seul qui
bloque le démarrage. `REFRESH_TOKEN_SECRET` traîne dans `env.example`, la
documentation et le setup des tests, mais aucun code d'exécution ne le lit :
les refresh tokens sont des valeurs opaques hachées en SHA-256 et stockées en
base (`auth-service.ts`), pas des JWT signés. Le régénérer est sans effet — ni
bénéfique ni nuisible. Ne laisse personne croire que c'est lui qui bloque.

### 2. Le port du front est imposé, pas suggéré

`apps/web/vite.config.ts` pose `strictPort: true` et lit `PORT` (non préfixé
`VITE_`, donc hors du bundle navigateur), avec 3000 par défaut.

Trois choses doivent rester alignées, sinon le CORS casse silencieusement :
le port réel de Vite, `FRONTEND_URL` dans `packages/api/.env`, et le champ
`port` de `.claude/launch.json`. L'API n'autorise **qu'une seule origine**.

Si tu changes le port, change les trois.

### 3. Quatre seeds de permissions ne sont pas déclarés dans `package.json`

`packages/api/prisma/seeds/` contient des seeds de permissions par module. Ceux
de CRM, propriétés, location et **finance** n'ont aucun script npm associé, et
ne chargent pas `dotenv` — il faut leur passer `DATABASE_URL` explicitement :

```bash
cd packages/api
export DATABASE_URL=$(sed -n 's/^DATABASE_URL="\(.*\)"$/\1/p' .env)
npx ts-node -T prisma/seeds/finance-permissions-seed.ts
```

Ces seeds sont intégralement en `upsert` : les relancer est sans danger, ils
n'effacent rien.

Pour savoir lesquels manquent sur une base donnée, compte les préfixes plutôt
que de deviner :

```sql
SELECT split_part(key,'_',1) AS prefixe, count(*) FROM permissions GROUP BY 1 ORDER BY 1;
```

Une base saine montre au moins `CRM`, `FINANCE`, `PROPERTIES`, `RENTAL`,
`PLATFORM`, `USERS`. Un préfixe absent explique directement un 403 sur les
écrans du module correspondant.

### 4. Les permissions sont mises en cache 5 minutes en mémoire

`packages/api/src/services/permission-service.ts` garde un `Map` par
`userId:tenantId` avec un TTL de 5 minutes. C'est le piège le plus coûteux en
temps : après avoir lancé un seed de permissions, **se reconnecter ne suffit
pas** — le cache vit dans le processus API, pas dans le token.

Redémarre l'API. Un token fraîchement émis se heurtera au même cache.

Symptôme typique : la requête SQL confirme que l'utilisateur a bien la
permission, et l'API renvoie quand même `Permission denied: <CLÉ>`.

## Piloter l'application

L'écran de connexion affiche un panneau **« Comptes par tenant »** en mode dev
(`import.meta.env.DEV`), couvrant les quatre personas de navigation. Un clic sur
« Utiliser » pré-remplit le formulaire ; il reste à cliquer « Se connecter ».

| Persona       | Compte                                   |
| ------------- | ---------------------------------------- |
| Super-admin   | `admin@immobillier.com` / `Admin@123456` |
| Collaborateur | `devaccrocs@gmail.com`                   |
| Propriétaire  | `mickael.andjui.21@gmail.com`            |
| Locataire     | voir `apps/web/src/dev/dev-accounts.ts`  |

Le mot de passe commun des comptes d'agence est dans ce même fichier — lis-le
plutôt que de le supposer, il change avec les jeux de données.

La navigation est **dérivée du rôle** (`RoleMenuAccess`) : un menu absent n'est
pas un bug d'affichage, c'est une permission manquante.

### Vérifier qu'un écran fonctionne vraiment

Une capture ne suffit pas : ces écrans affichent un squelette de chargement
pendant plusieurs secondes, puis parfois un état d'erreur qui ressemble à un
état vide. Distingue les trois :

- **« Aucune donnée »** avec une icône neutre → l'appel a réussi, la table est
  vide. Comportement correct.
- **« Impossible de charger ces données »** avec un rond rouge → l'appel a
  échoué. Lis le statut HTTP avant de conclure.
- **Écran noir ou blanc** juste après navigation → capture prématurée. Relis la
  page quelques secondes plus tard, ou passe par le texte de la page plutôt que
  par l'image.

Le réflexe qui fait gagner le plus de temps : lire les requêtes réseau vers
`localhost:8001/api` et repérer le code de statut, plutôt que d'interpréter le
visuel.

### Une connexion en ligne de commande, pour isoler

Quand un écran échoue, teste l'endpoint directement. Ça sépare en une commande
un problème d'API d'un problème de front :

```bash
curl -s -c /tmp/cj.txt -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"devaccrocs@gmail.com","password":"<mdp>"}' -o /dev/null
curl -s -b /tmp/cj.txt -w "\nHTTP %{http_code}\n" \
  "http://localhost:8001/api/tenants/<tenantId>/finance/sites/dashboard"
```

Le token voyage dans un **cookie httpOnly**, pas dans le corps de la réponse :
inutile de chercher un `accessToken` dans le JSON du login, il n'y est pas. Et
vider `localStorage` depuis la console ne déconnecte pas — le cookie survit.

## Restaurer un dump de démonstration

Les dumps ImmoTopia sont au format PostgreSQL custom (`pg_dump -Fc`, en-tête
`PGDMP`). Sur Windows, les binaires sont typiquement sous
`D:\Program Files\PostgreSQL\18\bin`.

**Ne supprime jamais la base existante, et ne restaure jamais par-dessus.** Le
danger n'est pas celui qu'on imagine : un dump ImmoTopia porte les mêmes tables
que la base locale. Restaurer par-dessus remplace les données de la personne par
des données qui leur ressemblent — une perte silencieuse, presque indétectable
après coup. Une base qui « a l'air normale » ne prouve rien.

La séquence sûre restaure **à côté**, laisse vérifier, puis bascule. La base de
travail n'est pas touchée tant que la restauration n'est pas jugée bonne :

```bash
TS=$(date +%Y%m%d-%H%M%S)

# 1. Contrôles avant toute écriture : format du dump et lisibilité de sa TOC.
pg_restore -l <dump> > /dev/null && echo "dump lisible"

# 2. Restaurer dans une base NEUVE, séparée. Rien n'est en jeu à cette étape.
psql -U postgres -h localhost -d postgres -c "CREATE DATABASE immotopia_restore_$TS OWNER postgres;"
pg_restore -U postgres -h localhost -d immotopia_restore_$TS \
  --no-owner --no-privileges -j 4 <dump>

# 3. Comparer, et seulement ensuite décider. Voir plus bas.

# 4. Bascule par double renommage, quasi instantanée.
#    Exige zéro connexion : arrête `npm run dev` d'abord.
psql -U postgres -h localhost -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE datname IN ('immotopia','immotopia_restore_$TS') AND pid <> pg_backend_pid();"
psql -U postgres -h localhost -d postgres -c "ALTER DATABASE immotopia RENAME TO immotopia_avant_$TS;"
psql -U postgres -h localhost -d postgres -c "ALTER DATABASE immotopia_restore_$TS RENAME TO immotopia;"
```

Le retour arrière est le renommage inverse, en quelques secondes, tant que
`immotopia_avant_$TS` existe. Ne la supprime pas dans la foulée : laisse cette
décision à la personne, une fois qu'elle a travaillé un moment sur la nouvelle.

L'API maintient un pool de connexions : tant que `npm run dev` tourne, il y a
typiquement une trentaine de sessions ouvertes et **aucun renommage n'est
possible**. Arrêter les serveurs proprement vaut mieux que couper les
connexions de force.

### Vérifier avant de basculer

C'est l'étape que l'on saute et qu'on regrette. Trois contrôles :

```bash
# Le schéma correspond-il au code ?
cd packages/api && npx prisma migrate status    # attendu : « Database schema is up to date! »

# Les données sont-elles celles attendues ? Compte réellement, n'estime pas.
psql -U postgres -h localhost -d immotopia_restore_$TS -c \
  "SELECT 'users' t, count(*) FROM users UNION ALL SELECT 'tenants', count(*) FROM tenants
   UNION ALL SELECT 'properties', count(*) FROM properties ORDER BY 1;"

# Les permissions sont-elles complètes ? (piège 3)
psql -U postgres -h localhost -d immotopia_restore_$TS -c \
  "SELECT split_part(key,'_',1) AS prefixe, count(*) FROM permissions GROUP BY 1 ORDER BY 1;"
```

Un dump pris sur une base où un seed de module n'a jamais tourné reproduira
fidèlement ce trou : le préfixe manquant se verra ici, avant la bascule, plutôt
qu'en 403 une heure plus tard.

Un écart de version mineure entre le serveur local et celui qui a produit le
dump (18.1 contre 18.4, par exemple) est sans conséquence. Un écart de version
majeure, lui, mérite de s'arrêter.

### Le seed du README est destructif

`npm run db:seed` **supprime tous les utilisateurs, tenants et données liées**
sur la base visée par `DATABASE_URL`. Il exige `ALLOW_DESTRUCTIVE_SEED=1`,
justement parce qu'il est dangereux.

Après avoir restauré un dump de démonstration, ne le lance pas : il effacerait
exactement ce que la restauration venait d'apporter. Les seeds de permissions
(piège 3) sont en revanche sûrs, eux sont en `upsert`.

## Bruit connu, à ne pas confondre avec une régression

- Avertissements Ant Design : `List` déprécié, `Drawer width/height` dépréciés.
- Avertissements React Router v7 (`v7_startTransition`, `v7_relativeSplatPath`).
- Deux 401 sur `/api/auth/me` au tout premier chargement, avant connexion.
- Erreurs TypeScript côté API — une centaine, préexistantes et suivies. Côté web
  le compte attendu est **zéro** : une erreur web est un vrai signal.
- `apps/web/.env` utilise encore les préfixes `REACT_APP_*` de Create React App.
  Le code lit `VITE_API_URL` / `VITE_API_ORIGIN`, donc ce fichier est ignoré.
  Sans conséquence : `apps/web/src/config/api.ts` retombe sur
  `http://localhost:8001`.

## Diagnostic rapide

| Symptôme                                               | Cause probable                                      |
| ------------------------------------------------------ | --------------------------------------------------- |
| L'API sort au démarrage, message sur un secret         | Piège 1 — secret d'exemple                          |
| Le front charge mais tous les appels échouent          | Port ≠ `FRONTEND_URL` → CORS (piège 2)              |
| `Permission denied: X` alors que la base dit l'inverse | Piège 4 — cache 5 min, redémarrer l'API             |
| `Permission denied: X` et le préfixe manque en base    | Piège 3 — lancer le seed du module                  |
| « Impossible de charger ces données »                  | Lire le statut HTTP avant tout                      |
| « Aucune donnée »                                      | Normal — table vide, pas une erreur                 |
| Un menu entier est absent                              | Rôle sans accès (`RoleMenuAccess`), pas un bug d'UI |
| Capture noire juste après navigation                   | Trop tôt — relire la page                           |
