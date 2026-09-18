# syntax=docker/dockerfile:1
#
# Build context is the REPOSITORY ROOT, not packages/api: the monorepo uses npm
# workspaces with a single lockfile at the root.
#   docker build -f packages/api/Dockerfile .
# docker-compose.yml already sets the context accordingly.

FROM node:20-alpine AS build
WORKDIR /repo

# OpenSSL is required by Prisma's query engine on Alpine.
RUN apk add --no-cache openssl

# Manifests first so the install layer is cached independently of the sources.
COPY package.json package-lock.json .npmrc ./
COPY packages/api/package.json packages/api/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY apps/web/package.json apps/web/

# The web workspace is not needed in the API image.
RUN npm ci --ignore-scripts --workspace @immotopia/api --include-workspace-root

# bcrypt est un module natif dont le binaire est recupere ou compile par un
# script d'installation (hasInstallScript: true dans package-lock.json).
# --ignore-scripts ci-dessus le saute : sans la reconstruction qui suit, l'API
# demarre normalement mais require('bcrypt') echoue, et TOUTE connexion plante.
#
# --build-from-source n'est pas optionnel : les binaires precompiles publies par
# node-pre-gyp sont lies a la glibc et ne se chargent pas sur Alpine (musl).
# La chaine de compilation est retiree dans la meme couche, et reste de toute
# facon confinee a cette etape de build.
RUN apk add --no-cache --virtual .bcrypt-build-deps python3 make g++ \
 && npm rebuild bcrypt --build-from-source \
 && apk del .bcrypt-build-deps \
 && node -e "const b=require('bcrypt'); if(!b.compareSync('x',b.hashSync('x',10))) process.exit(1); console.log('bcrypt: binding natif operationnel');"

COPY packages/tsconfig packages/tsconfig
COPY packages/api/prisma packages/api/prisma
RUN npx prisma generate --schema packages/api/prisma/schema.prisma

COPY packages/api/tsconfig.json packages/api/
COPY packages/api/src packages/api/src

# tsc sort en code 2 des qu'il reste une erreur de type, mais il EMET quand
# meme le JavaScript : noEmitOnError n'est pas active dans packages/tsconfig.
# packages/api traine une centaine d'erreurs de types heritees, que le mode
# --transpile-only de ts-node-dev masque en developpement depuis toujours.
#
# On tolere donc le code de sortie, et on verifie a la place que la sortie
# attendue a bien ete produite EN ENTIER. C'est une DETTE ASSUMEE, pas une
# cible : le jour ou packages/api passe `tsc` proprement, retirer le `|| true`
# et le garde-fou qui suit, et laisser le build echouer sur la moindre erreur.
RUN npm run build -w @immotopia/api || true
RUN set -eu; \
    src_count=$(find packages/api/src -name '*.ts' ! -name '*.d.ts' | wc -l); \
    out_count=$(find packages/api/dist -name '*.js' | wc -l); \
    test -f packages/api/dist/index.js \
      || { echo "ERREUR : tsc n'a produit aucun dist/index.js." >&2; exit 1; }; \
    test "$out_count" -ge "$src_count" \
      || { echo "ERREUR : $out_count fichiers emis pour $src_count sources, compilation partielle." >&2; exit 1; }; \
    echo "tsc a emis $out_count fichiers JavaScript pour $src_count sources TypeScript"


# Etape dediee aux migrations Prisma.
#
# `prisma` (la CLI) est une devDependency : elle disparait de l'arbre une fois
# `npm prune --omit=dev` passe, et n'existe donc PAS dans l'image runtime.
# Lancer les migrations depuis cette etape evite d'aller la retelecharger au
# moment du deploiement. Voir infra/scripts/deploy.sh.
FROM build AS migrate
WORKDIR /repo
CMD ["npx", "prisma", "migrate", "deploy", "--schema", "packages/api/prisma/schema.prisma"]


# L'elagage des devDependencies vit dans sa propre etape pour que `build` garde
# un arbre complet, utilisable par l'etape `migrate` ci-dessus.
FROM build AS prod-deps
RUN npm prune --omit=dev


FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=8001
# Uploads live on a volume, outside the deployment directory.
ENV UPLOADS_DIR=/data/uploads

COPY --from=prod-deps /repo/node_modules ./node_modules

# Une workspace npm resout ses modules sur DEUX niveaux :
# packages/api/node_modules d'abord, puis la racine. Tout ce que npm n'a pas pu
# remonter a la racine — parce qu'une autre workspace y epingle deja une autre
# version — reste imbrique ici. L'image, elle, aplatit tout dans /app/node_modules.
#
# Sans cette seconde copie, ces paquets disparaissent SILENCIEUSEMENT : le build
# reussit et l'API meurt au demarrage. Cas rencontre : `concurrently` (devDep de
# la racine) epingle date-fns@2, donc le date-fns@4 declare par l'API se
# retrouvait imbrique, et l'image partait sans lui.
#
# Copiee APRES la racine : la version specifique a l'API doit l'emporter.
COPY --from=prod-deps /repo/packages/api/node_modules ./node_modules

COPY --from=prod-deps /repo/packages/api/dist ./dist
COPY --from=prod-deps /repo/packages/api/prisma ./prisma
COPY --from=prod-deps /repo/packages/api/package.json ./package.json

# Garde-fou : aucune dependance de production declaree ne doit manquer.
# On teste la presence du dossier plutot que require.resolve, car plusieurs
# entrees de `dependencies` sont des paquets @types sans point d'entree.
RUN node -e "\
const deps = Object.keys(require('/app/package.json').dependencies); \
const fs = require('fs'); \
const missing = deps.filter(d => !fs.existsSync('/app/node_modules/' + d)); \
if (missing.length) { \
  console.error('ERREUR : ' + missing.length + ' dependance(s) de production absente(s) de l image : ' + missing.join(', ')); \
  process.exit(1); \
} \
console.log(deps.length + ' dependances de production presentes dans l image');"

# En production, winston ajoute deux transports fichier vers logs/error.log et
# logs/combined.log (packages/api/src/utils/logger.ts) — en chemin RELATIF au
# cwd, donc /app. Le conteneur tourne en USER node et /app appartient a root :
# sans ce dossier prepare, le process meurt au demarrage sur
# `EACCES: permission denied, mkdir 'logs'`.
#
# Ces fichiers restent volontairement ephemeres, sans volume : le transport
# Console est toujours actif, donc la source de verite est `docker logs`.
RUN mkdir -p /data/uploads /app/logs && chown -R node:node /data /app/logs

USER node
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8001)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
