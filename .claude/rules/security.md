---
paths:
  - "packages/api/src/**"
  - "packages/api/prisma/**"
  - "apps/web/src/**"
  - "**/env.example"
  - "**/.env*"
---

# Sécurité

Modèle de menace complet : [docs/governance/SECURITY.md](../../docs/governance/SECURITY.md).

## Authentification

JWT (`utils/jwt-utils.ts`), lu depuis le cookie `httpOnly` `accessToken`
en priorité, repli sur `Authorization: Bearer` pour les clients API
(`middleware/auth-middleware.ts`). Refresh tokens stockés hashés.

## Secrets et configuration

Toute variable passe par `src/config/env.ts`, validée au démarrage — le
process refuse de démarrer si `JWT_SECRET`/`REFRESH_TOKEN_SECRET` sont
absents, trop courts, ou reprennent une valeur placeholder connue. Jamais
`process.env.X || 'valeur par défaut'` pour un secret. Toute variable
nouvelle est documentée dans `env.example` avec une valeur factice.

**`VITE_*` est public.** Intégré en clair dans le bundle navigateur
(`config/api.ts` : `import.meta.env.VITE_API_ORIGIN`). Aucun secret dedans.

## Isolation multi-tenant

`requireTenantAccess` pose `req.tenantContext` ; `assertBelongsToTenant`
(`utils/tenant-ownership.ts`) vérifie tout identifiant reçu avant
écriture ; `property-tenant-guard.ts` fait de même pour les biens.
L'extension Prisma `utils/prisma-tenant-guard-extension.ts`
(`TENANT_GUARD_MODE`, `warn` par défaut, `enforce` en cible) contrôle en
plus chaque requête Prisma d'un modèle porteur de `tenantId`, dérivée
automatiquement du schéma — ne jamais ignorer ses avertissements.

Trois portails, chacun avec son middleware de contexte : propriétaire
(`owner-portal-access.ts`), locataire (`tenant-portal-access.ts`),
copropriétaire (`coowner-portal-access.ts`). Un identifiant reçu du client
n'est jamais utilisé tel quel dans un `where`/`data` Prisma sans garde
d'appartenance ; `include: { user: true }` interdit, toujours `select`.

## Fichiers privés

`middleware/uploads-access-middleware.ts` n'autorise en statique qu'une
liste blanche exacte (médias de bien, logos d'agence, images WhatsApp) ;
tout le reste répond 404 sur `/uploads`. Un document privé sort
uniquement par une route authentifiée qui vérifie le droit de l'appelant.

Une réponse de portail ne renvoie **jamais** un chemin disque ni
l'identifiant `/uploads/...` d'un fichier privé : `select` explicite, avec
un `downloadPath` relatif quand une route authentifiée sert le fichier
(modèle : `lib/files/portal-files.ts`, garde-fou :
`__tests__/api/portal-no-disk-paths.test.ts`).

## XSS et réseau

Jamais `dangerouslySetInnerHTML` sur du contenu saisi par un utilisateur —
`<iframe sandbox>` à la place (modèle :
`pages/newsletter/NewsletterCampaignsPage.tsx`), HTML de newsletter
assaini côté serveur avec DOMPurify (`services/newsletter-campaign.service.ts`).
CORS à origine unique (`middleware/cors-middleware.ts`, `FRONTEND_URL`
seul). Helmet actif (`app.ts`). Rate limiting dédié sur les routes
sensibles (`middleware/rate-limit-middleware.ts`) plus `webhookRateLimiter`
et un plancher global (`globalApiRateLimiter`).

## Webhooks de paiement

Les IPN PaySecureHub (`controllers/payment-gateway-public-controller.ts`)
ne sont jamais crus sur parole : ils déclenchent une réconciliation
serveur-à-serveur (`reconcileCheckoutPublic`) qui redemande le statut à
l'agrégateur, jamais le contenu de la requête entrante. **Aucune
vérification de signature ni de filtrage IP** n'est en place — point
ouvert documenté dans `docs/integrations/paysecurehub.md`.

Toute route nouvelle doit passer `__tests__/unit/routes-inventory.test.ts`.
