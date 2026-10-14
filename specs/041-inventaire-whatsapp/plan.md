# Plan de réalisation — 041 Inventaire de chantier par WhatsApp et IA

> **Branche** : `feat/inventaire-whatsapp` (empilée sur `feat/controle-stock`) ·
> **Worktree** : `.claude/worktrees/inventaire-whatsapp` · **Rédigé** :
> 04/10/2026 · **Base** : `c03d75f2`
> **Documents** : [spec.md](spec.md) (W1 à W14), [data-model.md](data-model.md),
> [contracts/openapi.yaml](contracts/openapi.yaml) (1.0.0), [ecrans.md](ecrans.md).
> Chemins relatifs à la racine du dépôt.

Même méthode que `specs/040-controle-stock/plan.md` : des **territoires de
fichiers** pour des agents parallèles, **jamais deux agents sur le même
fichier**, un seul propriétaire par fichier carrefour (§6).

## 1. Ordonnancement et prérequis

```text
Prérequis : étape 0 du lot 040 fusionnée dans feat/controle-stock, puis
            feat/inventaire-whatsapp remise à jour sur elle (Pilote).
      │
      ▼
Étape 0 — FONDATIONS 041 (1 agent) ─────────────────────────────┐
      │                                                         ▼
      │   Étape 1 — cinq territoires en parallèle :
      │     W1 Transport Meta et webhook      W4 API d'agence et simulateur
      │     W2 Vision IA                      W5 Web
      │     W3 Moteur, inscription, quota, tâche
      │                                                         │
      ▼                                                         ▼
           Étape 2 — INTÉGRATION (1 agent, après les territoires de 041
           ET les territoires API-2, API-4, API-5 du lot 040)
                                   ▼
           Recette navigateur (§9), puis pull request empilée (W-D7)
```

- **Pourquoi ce prérequis** : ce lot écrit dans `StockCount` (lot 040),
  appelle `raiseStockAlertTx` et `readStockAlertSettings`
  (`src/lib/finance/stock-alertes.ts`, fondations 040), les masques
  (`src/lib/finance/stock-controles.ts`, fondations 040) et ajoute une valeur à
  `StockAlertKind` (schéma 040). Sans eux, ses fondations ne compilent pas.
- **Fonctions du lot 040 encore vides à l'étape 1** (`createStockCountTx`,
  `setStockCountLineTx`, `closeStockCountTx` d'API-2 ; `detectStockFileKind`,
  `stripImageMetadata`, `sha256Hex` d'API-4) : leurs signatures sont figées
  (plan 040 §11). Les tests unitaires de ce lot les **simulent** (`jest.mock`) ;
  l'intégration les rejoue sur le code réel.
- **Modèle** : tous les agents de ce lot tournent sur **Opus 5.5**, effort élevé :
  demande expresse de l'utilisateur (04/10), qui prime ici sur la règle « Sonnet
  par défaut » de `CLAUDE.md`.

## 2. Règles communes à tous les agents (à recopier dans chaque prompt)

1. Travailler **uniquement** dans
   `D:\APP\Immobillier\.claude\worktrees\inventaire-whatsapp`. Ne jamais lire ni
   écrire `D:\APP\Immobillier\apps` ni `D:\APP\Immobillier\packages`.
2. N'écrire **que** les fichiers de son territoire (§3 à §5). Un fichier
   manquant dont l'agent a besoin : s'arrêter et le signaler, ne pas le créer.
3. **Interdit** : `git stash`, `checkout`, `reset`, `restore`, `add`, `commit`,
   `push` et toute commande git qui modifie l'arbre ou l'index ; lancer
   d'autres agents ; lire ou écrire un `.env` ; toucher une base (aucun
   `migrate dev`, `db push`, `db:seed`). Git en lecture permis.
4. Un fichier qui semble revenu en arrière ou modifié par un autre : s'arrêter
   et le signaler, ne pas refaire le travail.
5. Lancer **sa** suite de tests (commande donnée), pas la suite complète ;
   lister sans les corriger les erreurs de typecheck d'autres territoires.
6. Français pour tout texte, `t()` pour tout libellé et **tout message du bot**
   (texte français = clé), marges logiques, mots interdits du lot 040 jamais
   dans un texte destiné à un utilisateur **ni dans la consigne de l'IA**. Ne
   pas lancer `npm run i18n:extract` (intégration).
7. Erreurs métier en `AppError` avec un code `STOCK_WHATSAPP_*` (fondations) ;
   tout identifiant reçu vérifié par `assertBelongsToTenant`
   (`packages/api/src/utils/tenant-ownership.ts:64`) ; jamais
   `include: { user: true }`.
8. **Aveugle (spec §8.3)** : aucun message du bot, aucun champ envoyé à l'IA,
   aucun champ de capture ne contient un attendu, un solde, un écart ou une
   valeur.
9. Jamais `process.env` : tout passe par `env` (`packages/api/src/config/env.ts`).
10. Rapport final : fichiers touchés, exigences couvertes, tests et résultat,
    erreurs vues hors territoire, écarts à la spec, sous-fonctionnalités du
    wiki touchées.

## 3. Étape 0 — Fondations du lot 041 (un agent)

**But** : tout ce dont deux territoires ou plus dépendent, plus les squelettes
qui permettent de compiler dès l'étape 1.

### 3.1 Fichiers

API (`packages/api/`) :

| Fichier                                                                                                                                          | Contenu                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                                                                                           | data-model §2 entier (enums, `StockCount.source`, sept modèles, relations inverses). Point d'accroche du lot 040 : `StockAlertKind` + `FIELD_COUNT_CLOSED`.                                                                                                                                                 |
| `prisma/migrations/<ts>_inventaire_whatsapp_enums/`, `…_inventaire_whatsapp/`, `…_inventaire_whatsapp_catalogue/`, `…_inventaire_whatsapp_role/` | data-model §5 (générées sans base, méthode du plan 040 §3.2), §5.1, §5.2, §3.                                                                                                                                                                                                                               |
| `prisma/seeds/site-manager-role-seed.ts` (nouveau), `prisma/seeds/rbac-seed.ts` (une ligne)                                                      | data-model §3.                                                                                                                                                                                                                                                                                              |
| `src/config/env.ts`, `env.example`                                                                                                               | data-model §7 (toutes les variables, `superRefine`, commentaires).                                                                                                                                                                                                                                          |
| `src/middleware/error-middleware.ts`                                                                                                             | Codes `StockWhatsappErrorCode` du contrat dans `ErrorCode` (`:45`).                                                                                                                                                                                                                                         |
| `src/types/audit-types.ts`, `src/types/audit-catalog.ts`, `__tests__/unit/audit-catalog.test.ts`                                                 | Clés `StockWhatsappAuditKey` du contrat, catégories et criticité, `redact: ['phone', 'phoneE164']` ; `postMigrationKeys`.                                                                                                                                                                                   |
| `src/services/invitation-service.ts`                                                                                                             | « Chef de chantier » dans `TENANT_ROLE_LABELS_FR` (`:26-31`).                                                                                                                                                                                                                                               |
| `src/lib/subscription/catalog.ts`                                                                                                                | data-model §4 (capacité, extension, `DEFAULT_CATALOG`).                                                                                                                                                                                                                                                     |
| `src/services/subscription-v2-service.ts`                                                                                                        | `usageProviders.PHOTOS_INVENTAIRE` (`:231-237`) ; commentaire à `extensionCodes` (`:1520`).                                                                                                                                                                                                                 |
| `src/jobs/subscription-usage-job.ts`                                                                                                             | `CAPACITY_LABELS`, `isOptionalCapacityWithoutCap` (`:63-75`).                                                                                                                                                                                                                                               |
| `src/app.ts`                                                                                                                                     | Préfixe `/api/webhooks/whatsapp-cloud` ajouté aux préfixes que les parseurs globaux ne traitent pas (`:129-136`) ; montage du routeur webhook **avant** `whatsappWebhookRoutes` (`:221`) ; montage du routeur d'agence à côté des routeurs du stock (`:275-278`). **Seule modification d'`app.ts` du lot.** |
| `src/middleware/logging-middleware.ts`                                                                                                           | Masquage de `hub.verify_token` et `hub.challenge` dans `req.url` (W6-R3).                                                                                                                                                                                                                                   |
| `src/lib/phone/e164.ts` (nouveau)                                                                                                                | `normalizePhoneE164`, `maskPhone`, `waIdToE164` (§3.3).                                                                                                                                                                                                                                                     |
| `src/lib/stock-whatsapp/types.ts` (nouveau)                                                                                                      | Tous les types du §3.3.                                                                                                                                                                                                                                                                                     |
| `src/lib/stock-whatsapp/capture-files.ts` (nouveau)                                                                                              | Stockage et relecture d'une photo de capture (§3.3).                                                                                                                                                                                                                                                        |
| `src/lib/stock-whatsapp/sender-hash.ts` (nouveau)                                                                                                | `hashSender` (HMAC, W6-R8).                                                                                                                                                                                                                                                                                 |
| `src/routes/whatsapp-cloud-webhook-routes.ts`, `src/routes/finance-stock-whatsapp-routes.ts` (nouveaux, **vides**)                               | Routeurs sans route, `export default router`. Le second applique `authenticate` + `requireTenantAccess` au niveau du routeur, comme les routeurs du stock du lot 5.                                                                                                                                         |
| `__tests__/unit/phone-e164.test.ts` (nouveau)                                                                                                    | W3-R3.                                                                                                                                                                                                                                                                                                      |

Web (`apps/web/src/`) :

| Fichier                                                                                                 | Contenu                                                                       |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `types/finance-stock-whatsapp-types.ts` (nouveau)                                                       | Recopie du contrat 1.0.0, noms identiques.                                    |
| `services/finance-stock-whatsapp-service.ts` (nouveau)                                                  | Une fonction par route (§3.3).                                                |
| `pages/finance/StockWhatsapp.tsx`, `pages/finance/StockComptagesTerrain.tsx` (nouveaux, **squelettes**) | Exports nommés qui rendent un `PageHeader` : `App.tsx` compile dès l'étape 1. |

### 3.2 Consignes, dans l'ordre

1. Vérifier le prérequis (§1) : `src/lib/finance/stock-alertes.ts`,
   `stock-controles.ts` et `StockAlertKind` présents ; sinon s'arrêter.
2. Schéma, puis migrations sans base (`git show origin/main:packages/api/prisma/schema.prisma`
   dans le dossier de travail de l'agent, `npx prisma migrate diff
--from-schema-datamodel … --to-schema-datamodel prisma/schema.prisma
--script` ; la base de comparaison doit inclure les migrations du lot 040 :
   prendre le schéma de `feat/controle-stock`). `npx prisma validate`, `npx
prisma generate`.
3. Variables d'environnement, codes, audit, rôle, catalogue et ses effets de
   bord, `app.ts`, journal des requêtes.
4. Types et aides du §3.3, squelettes de routeurs, socle web.
5. `npm run typecheck -w @immotopia/api` et `-w @immotopia/web` : aucune erreur
   dans les fichiers des fondations ; les autres listées.

### 3.3 Contrat d'interface livré par les fondations

`src/lib/phone/e164.ts` :

```ts
export function normalizePhoneE164(
  raw: string,
  defaultDialCode?: string,
): string | null; // '225' par défaut ; null si invalide
export function waIdToE164(waId: string): string | null; // '2250712345678' -> '+2250712345678'
export function maskPhone(e164: string): string; // '+225 07 •• •• •• 78'
```

`src/lib/stock-whatsapp/types.ts` :

```ts
export type WhatsappVia = 'META' | 'SIMULATOR';

export type InboundMessage = {
  metaMessageId: string;            // wamid, ou 'sim-<uuid>' pour le simulateur
  fromE164: string;                 // normalisé
  receivedAt: Date;                 // heure serveur
  sentAt: Date;                     // timestamp Meta
  via: WhatsappVia;
} & (
  | { kind: 'TEXT'; text: string }
  | { kind: 'IMAGE'; media: { mediaId: string; mimeType: string; providerSha256: string | null; caption: string | null } }
  | { kind: 'REPLY'; replyId: string; replyTitle: string; contextMessageId: string | null }
  | { kind: 'UNSUPPORTED'; originalType: string }
);

export type OutboundMessage =
  | { kind: 'TEXT'; text: string }
  | { kind: 'BUTTONS'; text: string; buttons: Array<{ id: string; title: string }> } // 1 à 3
  | { kind: 'LIST'; text: string; buttonText: string; rows: Array<{ id: string; title: string; description?: string }> }; // 1 à 10

export interface WhatsappTransport {
  readonly id: 'meta' | 'log' | 'disabled';
  /** Bornes Meta appliquées ici (W1-R4). Écrit le message sortant dans StockWhatsappMessage. */
  send(input: {
    toE164: string;
    message: OutboundMessage;
    log: { tenantId: string; registrationId: string; sessionId: string | null; captureId: string | null } | null; // null : expéditeur inconnu, rien n'est journalisé
  }): Promise<{ metaMessageId: string | null; error: string | null }>;
  markRead(metaMessageId: string): Promise<void>; // ne lève jamais
  /** Garde SSRF, 10 Mo, octets lus ; lève MediaFetchError. */
  fetchMedia(mediaId: string): Promise<{ buffer: Buffer; declaredMimeType: string; providerSha256: string | null }>;
}
export class MediaFetchError extends Error {
  constructor(readonly reason: 'TOO_LARGE' | 'HOST_NOT_ALLOWED' | 'HTTP' | 'TIMEOUT' | 'NOT_FOUND', message: string);
}

export type StockVisionCandidate = { id: string; reference: string; label: string; unit: string; category: string | null };
export type StockVisionRequest = {
  image: Buffer;                    // fichier STOCKÉ (EXIF retiré)
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  candidates: StockVisionCandidate[]; // 300 au plus ; jamais de solde
  imposedItemId: string | null;
  fakeDirective: string | null;     // légende, lue par le seul fournisseur fake
};
export const stockVisionResultSchema: z.ZodType<StockVisionResult>; // spec W8-R5
export type StockVisionResult = {
  quality: 'OK' | 'TOO_DARK' | 'BLURRY' | 'NOT_STOCK';
  itemId: string | null; itemConfidence: number;
  visibleUnits: number; layers: number | null; columns: number | null; depthRows: number | null;
  proposedTotal: number; confidence: number;
  method: 'SACKS_STACKED' | 'BARS_BUNDLE' | 'BLOCKS_PALLET' | 'OTHER';
  explanation: string;
};
export type StockVisionOutcome =
  | { ok: true; result: StockVisionResult; provider: string; model: string; latencyMs: number }
  | { ok: false; reason: 'TIMEOUT' | 'PROVIDER_ERROR' | 'INVALID_OUTPUT' | 'DISABLED'; provider: string; model: string; latencyMs: number };
export interface StockVisionProvider {
  readonly id: 'gemini' | 'openrouter' | 'fake' | 'disabled';
  readonly model: string;
  analyze(request: StockVisionRequest, signal: AbortSignal): Promise<StockVisionOutcome>; // ne lève jamais
}

export type ChefAccess =
  | { ok: true; tenantId: string; userId: string; registrationId: string; language: 'fr' | 'en' | 'ar'; quota: { limit: number; source: 'OPTION' | 'WARN_FALLBACK' | 'OFF_FALLBACK' } }
  | { ok: false; reason: 'TENANT_SUSPENDED' | 'MEMBERSHIP_NOT_ACTIVE' | 'USER_INACTIVE' | 'ROLE_MISSING' | 'REGISTRATION_NOT_ACTIVE' | 'OPTION_MISSING' };
```

`src/lib/stock-whatsapp/capture-files.ts` (appelle les aides figées d'API-4 du
lot 040, `src/lib/finance/stock-pieces-jointes.ts`) :

```ts
export const CAPTURE_MAX_BYTES = 10 * 1024 * 1024;
export async function storeCapturePhoto(
  tenantId: string,
  buffer: Buffer,
): Promise<
  | {
      fileUrl: string; // /uploads/stock-whatsapp/<tenantId>/<aaaa>/<uuid>.<ext>
      mimeType: "image/jpeg" | "image/png" | "image/webp";
      sizeBytes: number;
      sha256: string; // du fichier STOCKÉ
    }
  | { refused: "TYPE" | "TOO_LARGE" }
>; // detectStockFileKind → stripImageMetadata → sha256Hex → écriture
export async function readCapturePhoto(capture: {
  tenantId: string;
  fileUrl: string | null;
  receivedAt: Date;
}): Promise<PrivateFile>; // privateUploadPath + readPrivateUpload
export async function deleteCapturePhoto(fileUrl: string): Promise<void>;
```

`src/lib/stock-whatsapp/sender-hash.ts` :

```ts
export function hashSender(e164: string): string; // HMAC-SHA256(META_WA_APP_SECRET, e164) hex ; clé de repli 'dev' seulement hors meta
```

**Contrats que les territoires se doivent entre eux** (noms et signatures
figés ici ; corps écrits par le territoire propriétaire) :

| Fonction (fichier)                                                                                                                                                                                                                                                                                                  | Propriétaire | Appelée par                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------- |
| `getWhatsappTransport(): WhatsappTransport` (`src/lib/stock-whatsapp/transport/index.ts`)                                                                                                                                                                                                                           | W1           | W3, W4                     |
| `depositSimulatorMedia(buffer: Buffer, mimeType: string): string` → `mediaId` (`src/lib/stock-whatsapp/transport/log-transport.ts`)                                                                                                                                                                                 | W1           | W4                         |
| `processWebhookEvent(eventId: string): Promise<void>` (`src/lib/stock-whatsapp/webhook/process-event.ts`) — réclame, convertit en `InboundMessage`, appelle `handleInboundMessage`, efface `payload`                                                                                                                | W1           | W1 (route), W3 (tâche)     |
| `getStockVisionProvider(): StockVisionProvider` (`src/lib/stock-whatsapp/vision/index.ts`)                                                                                                                                                                                                                          | W2           | W3                         |
| `handleInboundMessage(message: InboundMessage): Promise<void>` (`src/lib/stock-whatsapp/engine/index.ts`) — ne lève jamais                                                                                                                                                                                          | W3           | W1, W4                     |
| `runSessionTimers(options?: { sessionId?: string; now?: Date }): Promise<void>` (`src/lib/stock-whatsapp/engine/timers.ts`)                                                                                                                                                                                         | W3           | W3 (tâche), W4 (`advance`) |
| `resolveChefAccess(registrationId: string): Promise<ChefAccess>` (`src/lib/stock-whatsapp/registrations/access.ts`)                                                                                                                                                                                                 | W3           | W3, W4                     |
| `createRegistration`, `updateRegistrationSites`, `regenerateActivationCode`, `revokeRegistration`, `listRegistrations`, `getRegistration`, `listEligibleMembers`, `listEligibleSites` (`src/lib/stock-whatsapp/registrations/service.ts`) — signatures `(tenantId, actorUserId, input)` rendant les vues du contrat | W3           | W4                         |
| `getWhatsappQuotaState(tenantId: string, now?: Date): Promise<{ month: string; used: number; limit: number; source: 'OPTION' \| 'WARN_FALLBACK' \| 'OFF_FALLBACK' \| 'NONE'; blocks: number }>` (`src/lib/stock-whatsapp/quota.ts`)                                                                                 | W3           | W4                         |
| `countWhatsappPhotosThisMonth(db, tenantId): Promise<number>` (`src/lib/stock-whatsapp/quota.ts`) — branché par les fondations sur `usageProviders` avec un corps provisoire, W3 le réécrit sans changer la forme                                                                                                   | W3           | fondations                 |

## 4. Territoires de l'étape 1 — API

Aucun ne touche `schema.prisma`, `app.ts`, `env.ts`, `error-middleware.ts`, les
fichiers d'audit, `catalog.ts` (fondations).

### W1 — Transport Meta et webhook

|               |                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fichiers**  | `packages/api/src/lib/stock-whatsapp/transport/index.ts`, `meta-transport.ts`, `log-transport.ts`, `message-limits.ts`, `media-guard.ts` ; `src/lib/stock-whatsapp/webhook/signature.ts`, `parse-payload.ts`, `record-event.ts`, `process-event.ts` ; `src/routes/whatsapp-cloud-webhook-routes.ts` (squelette des fondations) ; `__tests__/unit/whatsapp-cloud-webhook.test.ts`, `__tests__/unit/whatsapp-meta-transport.test.ts` (nouveaux). |
| **Lecture**   | Fondations ; `src/lib/secure-links/token.ts:16-26` ; `src/middleware/rate-limit-middleware.ts:127-136` ; `src/routes/whatsapp.webhook.route.ts` (contre-modèle : **ne pas** copier le contournement de signature) ; `src/lib/files/private-files.ts`.                                                                                                                                                                                          |
| **Exigences** | W1 (R1 à R7), W6 (R1 à R10, sauf le stockage, qui appelle `storeCapturePhoto` depuis W3), W7-R1 (empreinte, réponse une fois par 24 h : l'envoi M01 se fait ici, sans session), W13-R3 (magasin de médias du transport `log`).                                                                                                                                                                                                                 |
| **Routes**    | `GET`, `POST /api/webhooks/whatsapp-cloud/events`.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Tests**     | Critères W1-1 à 4, W6-1 à 6, W6-8, W7-1 à 3. Client HTTP injecté (aucun appel réseau). Commande : `npm run test -w @immotopia/api -- "whatsapp-(cloud-webhook\|meta-transport)"`.                                                                                                                                                                                                                                                              |
| **Consignes** | HMAC sur le `Buffer` brut, jamais sur un objet re-sérialisé. `crypto.timingSafeEqual` sur des tampons de même longueur (comparer les empreintes). `express.raw` dans **ce** routeur. Réponse `200 { received: true }` après l'insertion des événements, traitement par `setImmediate(() => processWebhookEvent(id))`. Aucun `fetch` sans `AbortSignal` (10 s). Redirections refusées (`redirect: 'manual'`).                                   |

### W2 — Vision IA

|               |                                                                                                                                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fichiers**  | `packages/api/src/lib/stock-whatsapp/vision/index.ts`, `schema.ts` (`stockVisionResultSchema` et sa version JSON Schema), `prompt.ts`, `gemini-provider.ts`, `openrouter-provider.ts`, `fake-provider.ts`, `candidates.ts` (choix des 300 candidats, W8-R4) ; `__tests__/unit/stock-vision.test.ts` (nouveau). |
| **Lecture**   | Fondations ; `src/lib/ai/providers/openrouter-provider.ts:239-275` (forme de l'appel, clé lue dans `env`).                                                                                                                                                                                                     |
| **Exigences** | W8 (R1 à R10).                                                                                                                                                                                                                                                                                                 |
| **Tests**     | Critères W8-1 à 5 ; candidats sans aucun champ de solde ; vocabulaire de la consigne. Commande : `npm run test -w @immotopia/api -- stock-vision`.                                                                                                                                                             |
| **Consignes** | Ne pas réutiliser `getLlmProvider` (ImmoCopilot, texte seul, réglé par le super-admin) : fournisseurs indépendants. `analyze` ne lève jamais. Aucune journalisation de l'image ni de la réponse brute. [À vérifier : `responseSchema` ou `responseJsonSchema` chez Gemini ; noms des modèles Flash.]           |

### W3 — Moteur de conversation, inscription, quota et tâche

|               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fichiers**  | `packages/api/src/lib/stock-whatsapp/engine/index.ts`, `states.ts`, `commands.ts` (FIN, AIDE, CHANTIER, nombres), `site-choice.ts`, `capture-flow.ts`, `item-matching.ts` (W9), `count-writer.ts` (W5 : seuls appels au lot 040), `field-alert.ts` (W5-R6), `timers.ts` ; `src/lib/stock-whatsapp/bot-messages.ts` (textes du spec §10) ; `src/lib/stock-whatsapp/registrations/service.ts`, `access.ts`, `activation.ts` ; `src/lib/stock-whatsapp/quota.ts` ; `src/jobs/stock-whatsapp-job.ts` (nouveau) ; `src/index.ts` (démarrage) ; **point d'accroche du lot 040** : `src/lib/finance/stock-alertes-lecture.ts` (titre et message de `FIELD_COUNT_CLOSED` : « Inventaire de chantier clos par WhatsApp », « Comptage terrain de {{lieu}} clos : {{n}} article(s) à justifier et valider. ») ; tests `__tests__/unit/stock-whatsapp-engine.test.ts`, `stock-whatsapp-registration.test.ts`, `stock-whatsapp-quota.test.ts`, `stock-whatsapp-job.test.ts`, `stock-whatsapp-blind.test.ts`, `stock-whatsapp-dependencies.test.ts`, `__tests__/integration/stock-whatsapp-quota-concurrence.test.ts` (nouveaux). |
| **Lecture**   | Fondations ; plan 040 §11 (signatures figées) ; `src/lib/finance/stock-alertes.ts` (`raiseStockAlertTx`, `readStockAlertSettings`) ; `src/lib/finance/stock-controles.ts` ; `src/utils/tenant-context.ts` ; `src/i18n/index.ts` (`runWithLanguage`) ; `src/lib/subscription/feature-access.ts` ; `src/services/subscription-v2-service.ts:342` (`getEntitlements`) ; `src/jobs/newsletter-campaign-scheduler.job.ts:14-60`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Exigences** | W3 (R2, R4 à R10 côté service), W4 (tout), W5 (tout), W7-R2, W9, W10, W11-R2 à R5, W12, W13-R5 (`runSessionTimers`), §8.3, §8.5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Tests**     | Critères W3-1 à 8, W4-1 à 8, W5-1 à 7, W9-1 à 4, W10-1/2, W11-2 à 5 et 7 (W11-3 en intégration, sauté sans `DATABASE_URL_TEST`), W12-1. Commande : `npm run test -w @immotopia/api -- "stock-whatsapp-(engine\|registration\|quota\|job\|blind\|dependencies)"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Consignes** | Transitions par mises à jour conditionnelles (`updateMany … where state`, compter les lignes) ; aucun verrou ni transaction ouverts pendant l'appel à l'IA. Ordre d'une confirmation : verrou consultatif de l'inscription, relecture de l'accès (W12-R2), puis les fonctions du lot 040 (qui prennent leurs propres verrous, plan 040 A10-R2). Contrôle d'accès en base, jamais `getUserPermissions`. Hors requête, l'audit reçoit `actorUserId` et `tenantId` explicites. Chaque texte du bot vient de `bot-messages.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### W4 — API d'agence, réconciliation, captures et simulateur

|               |                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fichiers**  | `packages/api/src/lib/stock-whatsapp/admin/field-counts.ts` (réconciliation), `captures.ts`, `sessions.ts`, `overview.ts` (mesures), `simulator.ts`, `schemas.ts` (Zod des corps) ; `src/controllers/finance-stock-whatsapp-controller.ts` (nouveau) ; `src/routes/finance-stock-whatsapp-routes.ts` (squelette des fondations) ; `__tests__/api/finance.stock-whatsapp.test.ts` (nouveau). |
| **Lecture**   | Fondations ; contrats W1 et W3 (§3.3) ; `src/lib/finance/stock-controles.ts` (`resolveStockCallerContext`, `loadBlindLocationIds`, `buildStockMeta`, `maskValue`) ; `src/controllers/property-media-controller.ts` (modèle de contrôleur, AGENTS.md) ; `src/routes/lease-inspection-routes.ts:35-49` (multer) ; `src/lib/files/private-files.ts`.                                           |
| **Exigences** | W3-R1 (routes d'inscription), W11 (vue du quota), W13 (R1 à R6), W14 (R2 à R5, R7), §8.2 ; toutes les routes d'agence du contrat.                                                                                                                                                                                                                                                           |
| **Routes**    | Toutes celles du contrat sous `/tenants/{tenantId}/finance/stock/whatsapp/…`.                                                                                                                                                                                                                                                                                                               |
| **Tests**     | Critères W3 (droits et `404`), W13-1 à 3, W14-1 à 3 ; masques de `field-counts` (comptable sans `STOCK_COUNT_VALIDATE` sur un lieu en comptage) ; `404` inter-agences pour chaque identifiant. Commande : `npm run test -w @immotopia/api -- finance.stock-whatsapp`.                                                                                                                       |
| **Consignes** | Contrôleurs dans `asyncHandler`, aucun `try/catch` qui devine le statut. Gardes : `requirePermission` / `requireAnyPermission` (`src/middleware/rbac-middleware.ts:38, 92`). Disponibilité du simulateur testée **avant** toute lecture. Le fichier : `sendPrivateFile` (no-store). Agrégats SQL : `tenant_id = $1` explicite.                                                              |

## 5. Territoire de l'étape 1 — web

### W5 — Écrans

|               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fichiers**  | `apps/web/src/pages/finance/StockWhatsapp.tsx`, `StockComptagesTerrain.tsx` (squelettes des fondations) ; `apps/web/src/components/finance/stock/whatsapp/*` (nouveau dossier) ; **points d'accroche du lot 040** : `pages/finance/StockInventaire.tsx` (ecrans §6 seulement), `types/finance-stock-controle-types.ts` (libellé de `FIELD_COUNT_CLOSED` : « Inventaire de chantier clos par WhatsApp ») ; `App.tsx` (deux routes) ; `navigation/finance-workspaces.tsx` (deux onglets) ; `constants/permissions-labels.ts` (rôle), `constants/audit-labels.ts` (clés `STOCK_WHATSAPP_*`) ; capacité `PHOTOS_INVENTAIRE` : `services/subscription-v2-service.ts:16`, `pages/tenant/TenantSubscriptionSettings.tsx:45`, `components/admin/tenant-detail/SubscriptionTab.tsx:78, 291`, `utils/subscription-denial-notice.ts:65`, `components/admin/CreateTenantDrawer.tsx:155` ; `dev/atelier/finance-mock-stock-whatsapp.ts` (nouveau) ; tests de ecrans.md §8. |
| **Lecture**   | Fondations web ; ecrans.md ; écrans et composants du lot 040 (`components/finance/stock/`, `hooks/useStockFieldContext.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Exigences** | ecrans.md §1 à §8 ; W14-R1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Tests**     | Commande : `npm run test -w @immotopia/web -- finance/stock-whatsapp.test finance/stock-comptages-terrain.test finance/stock-capture-drawer.test finance/stock-inventaire.test finance/corps-des-requetes navigation/finance-workspace-tabs-access.test`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Consignes** | Dans `StockInventaire.tsx`, aucune autre retouche que ecrans §6 ; si le fichier n'a pas encore sa forme du lot 040 (WEB-2 en cours), s'arrêter et le signaler. Les scènes d'atelier (`dev/atelier/Atelier.tsx`) restent au propriétaire du lot 040 (WEB-3) : W5 fournit le banc de données et décrit ses deux scènes (« WhatsApp, administrateur », « Comptages terrain, comptable pendant un comptage ») dans son rapport.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## 6. Fichiers carrefours — un seul propriétaire

| Fichier                                                                                                                                                       | Propriétaire    | Ce que les autres attendent                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| `packages/api/prisma/schema.prisma` (dont `StockAlertKind`, `StockCount.source`)                                                                              | Fondations 041  | data-model §2 ; un besoin de colonne découvert en étape 1 remonte au Pilote.                    |
| `packages/api/src/app.ts`                                                                                                                                     | Fondations 041  | Préfixe brut, deux montages ; aucune route ajoutée ailleurs que dans les deux routeurs.         |
| `packages/api/src/config/env.ts`, `env.example`                                                                                                               | Fondations 041  | Toutes les variables de data-model §7.                                                          |
| `packages/api/src/middleware/error-middleware.ts`, `audit-types.ts`, `audit-catalog.ts`, `audit-catalog.test.ts`                                              | Fondations 041  | Codes et clés du contrat.                                                                       |
| `packages/api/src/lib/subscription/catalog.ts`, `subscription-v2-service.ts`, `subscription-usage-job.ts`                                                     | Fondations 041  | data-model §4.                                                                                  |
| `packages/api/prisma/seeds/rbac-seed.ts`                                                                                                                      | Fondations 041  | Une ligne d'appel.                                                                              |
| `packages/api/src/middleware/logging-middleware.ts`                                                                                                           | Fondations 041  | Masquage du jeton de vérification.                                                              |
| `packages/api/src/index.ts`                                                                                                                                   | W3              | Démarrage de `stock-whatsapp-job` si transport ≠ `disabled`.                                    |
| `packages/api/src/lib/finance/stock-alertes-lecture.ts` (lot 040)                                                                                             | W3              | Titre et message de `FIELD_COUNT_CLOSED`, sans montant pour un appelant sans valeurs.           |
| `packages/api/src/services/tenant-data-export/file-references.ts`, `model-registry.ts`                                                                        | Intégration     | data-model §6.                                                                                  |
| `packages/api/__tests__/unit/routes-inventory.test.ts`, `route-features.test.ts`, `schema-tenant-coverage.test.ts`                                            | Intégration     | Webhook public, famille `/api/webhooks`, `WhatsappCloudEvent` global.                           |
| `packages/api/__tests__/integration/isolation.test.ts`, `__tests__/helpers/run-isolation-tests.js`                                                            | Intégration     | Bloc « Inventaire WhatsApp » ; test de concurrence du quota ajouté au lanceur.                  |
| `packages/api/src/lib/ai/gateway/catalog-builder.ts`, `catalog.generated.json`                                                                                | Intégration     | Segment `simulator` exclu (W13-R6), catalogue régénéré.                                         |
| `packages/api/__tests__/unit/stock-vocabulaire.test.ts` (lot 040)                                                                                             | Intégration     | Étendu au module du lot et à la consigne de l'IA.                                               |
| `packages/api/src/i18n/locales/{en,ar}.json`, `apps/web/src/i18n/locales/*`                                                                                   | Intégration     | Extraction et traductions en une fois.                                                          |
| `packages/api/prisma/seeds/pack-test-tenants.ts`, `seed-pack-test-tenants.ts`, `__tests__/unit/pack-test-tenants.test.ts`, `apps/web/src/dev/dev-accounts.ts` | Intégration     | Comptes de recette (§7, étape 6).                                                               |
| `apps/web/src/pages/finance/StockInventaire.tsx`, `types/finance-stock-controle-types.ts` (lot 040)                                                           | W5              | ecrans §6 ; libellé de nature d'alerte.                                                         |
| `apps/web/src/App.tsx`, `navigation/finance-workspaces.tsx`, `constants/*`                                                                                    | W5              | Deux routes, deux onglets, libellés.                                                            |
| `apps/web/src/dev/atelier/Atelier.tsx`                                                                                                                        | Lot 040 (WEB-3) | Scènes décrites par W5.                                                                         |
| `infra/scripts/deploy.sh`                                                                                                                                     | Intégration     | Refus de `WHATSAPP_INVENTORY_SIMULATOR=1` et de `STOCK_VISION_PROVIDER=fake` sur la production. |
| `docs/workflows/DEPLOIEMENT.md`, `docs/fonctionnalites/*`                                                                                                     | Intégration     | §7.                                                                                             |
| `docs/workflows/HANDOFF.md`                                                                                                                                   | Pilote          | —                                                                                               |

**Fichiers du lot 040 touchés par ce lot** (et seulement ceux-là) :
`schema.prisma` (`StockAlertKind`, `StockCount`), `rbac-seed.ts` (une ligne),
`stock-alertes-lecture.ts` (une nature), `stock-vocabulaire.test.ts`
(périmètre), `StockInventaire.tsx` (badge), `types/finance-stock-controle-types.ts`
(un libellé). Aucune règle du lot 040 ne change.

## 7. Étape 2 — Intégration (un agent)

1. **Relire** les rapports ; rejouer les tests unitaires de W3 contre le code
   réel du lot 040 (retirer les simulations devenues inutiles seulement si le
   test reste lisible ; sinon ajouter un test d'intégration
   `__tests__/integration/stock-whatsapp-inventaire.test.ts` qui joue photo →
   confirmation → `FIN` → `COUNTED` → validation par une autre personne sur
   base réelle).
2. **Traductions** : `npm run i18n:extract -w @immotopia/api` et `-w
@immotopia/web` ; traduire en anglais et en arabe tous les messages du bot
   et libellés ; reporter les orphelins ; supprimer les `*.orphans.json`.
3. **Vocabulaire** : étendre les deux tests de vocabulaire du lot 040.
4. **Assistant** : exclure le segment `simulator` dans
   `src/lib/ai/gateway/catalog-builder.ts` (`isExcludedPath`, `:57-62`) avec son
   test ; `npm run ai:catalog` ; vérifier que `revoke` et `regenerate-code`
   sortent sensibles (le segment `whatsapp` les classe déjà « sending »,
   `src/lib/ai/gateway/path-rules.ts:66-73`). `remove-photo` efface une preuve :
   il est exclu du catalogue comme destructeur (le dernier segment commence par
   `remove`), jamais proposé par l'assistant.
5. **Isolation et inventaires de routes** : `routes-inventory.test.ts` (deux
   entrées de liste blanche, raison : « Webhook Meta WhatsApp Cloud (lot 041) :
   signature X-Hub-Signature-256 toujours vérifiée, aucune session par
   nature. ») ; `route-features.test.ts` (`/api/webhooks`) ;
   `schema-tenant-coverage.test.ts` (`WhatsappCloudEvent`) ; export d'agence
   (data-model §6) ; bloc « Inventaire WhatsApp » de `isolation.test.ts`.
   `npm run test:isolation` si `DATABASE_URL_TEST` existe, sinon le dire.
6. **Comptes de recette** : `pack-test-tenants.ts` et son test : pour
   « Promoteur · 6 mois » et « Opérateur intégré · 6 mois », un Chef de
   chantier (`chef-promoteur@`, `chef-integre@`, domaine
   `packs.immotopia.test`), son inscription en `log` au numéro fictif
   `+2250100000101` / `+2250100000102` (plage de recette, jamais un vrai
   numéro), un chantier affecté basculé au stock ; et un bloc
   `EXT_INVENTAIRE_WHATSAPP` sur l'abonnement du Promoteur seulement (pour
   jouer « option absente » sur l'Intégré). Liste de connexion rapide du
   staging (`apps/web/src/dev/dev-accounts.ts`). Aucun lancement du seed.
7. **`deploy.sh`** : refuser sur la production `WHATSAPP_INVENTORY_SIMULATOR=1`,
   `WHATSAPP_INVENTORY_TRANSPORT=log` et `STOCK_VISION_PROVIDER=fake`, comme
   `PAYMENT_GATEWAY_SIMULATOR` (`infra/scripts/deploy.sh:279-282`).
8. **`docs/workflows/DEPLOIEMENT.md`** — section « Inventaire WhatsApp »,
   mise en service Meta pas à pas :
   1. Business Manager vérifié ; application Meta de type « Business » ;
      produit WhatsApp ajouté.
   2. Numéro officiel ajouté et vérifié (SMS ou appel), nom d'affichage
      approuvé ; noter `phone_number_id` → `META_WA_PHONE_NUMBER_ID`.
   3. Utilisateur système avec jeton **permanent** (droits
      `whatsapp_business_messaging`, `whatsapp_business_management`) →
      `META_WA_ACCESS_TOKEN`. Jamais le jeton temporaire de 24 h.
   4. Clé secrète de l'application → `META_WA_APP_SECRET` ; jeton de
      vérification généré (`openssl rand -base64 48`) → `META_WA_VERIFY_TOKEN`.
   5. Déployer avec `WHATSAPP_INVENTORY_TRANSPORT=meta` ; puis, dans
      l'application Meta, URL de rappel
      `https://<api>/api/webhooks/whatsapp-cloud/events` et jeton de
      vérification ; « Vérifier et enregistrer » (le `GET` doit rendre le
      challenge).
   6. Abonner le compte WhatsApp Business au champ `messages`.
   7. Moyen de paiement du compte (les réponses dans la fenêtre de 24 h sont
      gratuites, mais le compte l'exige) [à vérifier].
   8. Essai : un numéro de test inscrit envoie son code, puis une photo ; vérifier
      l'hôte de téléchargement des médias dans le journal et ajuster
      `META_WA_MEDIA_HOSTS` si besoin.
   9. Vision : `STOCK_VISION_PROVIDER=gemini` + `GEMINI_API_KEY` (ou
      `openrouter`), `STOCK_VISION_MODEL`.
   10. Couper les menus hors stock du rôle « Chef de chantier » (Rôles et
       menus).
   11. Retour arrière : `WHATSAPP_INVENTORY_TRANSPORT=disabled` ; schéma :
       data-model §5.3.
       Staging : `WHATSAPP_INVENTORY_TRANSPORT=log`, `WHATSAPP_INVENTORY_SIMULATOR=1`,
       `STOCK_VISION_PROVIDER=fake`, reseed des comptes de recette.
9. **Wiki** : sous-fonctionnalités d'ecrans.md §9 dans
   `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx`, puis `npm run
wiki:export` et `npm run wiki:check`.
10. **Contrôles** : `npm run typecheck`, `npm run lint`, `npm run
check:architecture`, `npm test`, `npm run test:web`. Relecture
    `code-reviewer` et `security-auditor` (webhook public, fichiers, numéro de
    téléphone : DEV_PROCESS.md, étape 3).

## 8. Couverture des exigences

| Exigence | Territoire(s)                                            | Exigence | Territoire(s)                                  |
| -------- | -------------------------------------------------------- | -------- | ---------------------------------------------- |
| W1       | Fondations (env) ; W1                                    | W8       | W2 ; W3 (décision après analyse)               |
| W2       | Fondations (rôle) ; W5 (libellés) ; intégration (menus)  | W9       | W3                                             |
| W3       | Fondations (téléphone) ; W3 (service) ; W4 (routes) ; W5 | W10      | W3                                             |
| W4       | W3                                                       | W11      | Fondations (catalogue) ; W3 (quota) ; W4, W5   |
| W5       | W3 ; W5 (badge)                                          | W12      | W3                                             |
| W6       | Fondations (`app.ts`, journal) ; W1                      | W13      | W1 (médias `log`) ; W3 (horloge) ; W4 ; W5     |
| W7       | W1 ; W3 (en attente)                                     | W14      | W4 ; W5 ; intégration (export, purges testées) |

## 9. Recette navigateur

**Environnement** : staging (ou instance locale) avec
`WHATSAPP_INVENTORY_TRANSPORT=log`, `WHATSAPP_INVENTORY_SIMULATOR=1`,
`STOCK_VISION_PROVIDER=fake`, `SUBSCRIPTION_ENFORCEMENT=enforce`, migrations
appliquées, comptes de recette reseedés (§7 étape 6). Mot de passe : constante
`PACK_TEST_PASSWORD` de `packages/api/prisma/seeds/pack-test-tenants.ts` (non
recopiée). Agences : « Test — Pack Promoteur · 6 mois » (option souscrite),
« Test — Pack Opérateur intégré · 6 mois » (sans option). Une capture par étape
marquée ★. Les messages du bot se lisent dans le simulateur (onglet WhatsApp ›
Simulateur).

**R1 — Rôle et inscription** (`promoteur@`)

1. Collaborateurs : ★ le rôle « Chef de chantier » est proposé et attribué à
   `chef-promoteur@`.
2. Gestion du stock › WhatsApp › Chefs de chantier › « Inscrire un chef de
   chantier » : un agent sans le rôle n'est pas proposé ; numéro `07 00 00 01
03` ; un chantier clos n'est pas proposé.
3. ★ Fenêtre du code : 6 chiffres, numéro du bot, « valable 72 heures ».
   Fermer : le code n'est plus affiché nulle part.
4. Réinscrire le même numéro pour un autre membre : refus « Ce numéro ne peut
   pas être inscrit. ».

**R2 — Activation** (`promoteur@`, simulateur)

1. Simulateur, inscription en attente : envoyer une photo → M05.
2. Envoyer un mauvais code → ★ M03 « Il vous reste 4 essai(s) ».
3. Envoyer le bon code → ★ M02 ; la liste passe à « Actif ».
4. « Numéro inconnu » `+2250100000999` : « Bonjour » → ★ M01 ; un second
   message dans la minute : aucune réponse.

**R3 — Un chantier, photo validée** (`promoteur@`, simulateur au nom de
`chef-promoteur@`)

1. Photo sans légende → M11 puis ★ M13 (« Total proposé : 84 », boutons
   « Valider » / « Annuler »).
2. Cliquer « Valider » → ★ M14.
3. Inventaire : ★ inventaire « Comptage en cours », pastille « Ouvert par
   WhatsApp », ligne avec « WhatsApp » et bouton photo ; aucune quantité
   attendue affichée.

**R4 — Correction et annulation**

1. Photo `fake:item=<référence d'un 2e article>;total=60;conf=0.5` → M13 avec
   ★ la phrase de prudence. Répondre « 58 sacs » → M15.
2. Photo suivante → « 0 » → M16 ; Comptages terrain : la capture annulée n'a
   pas de ligne.

**R5 — Même article deux fois**

1. Photo `fake:item=<référence du 1er article>;total=40` → valider → ★ M30
   « déjà compté… 84 » ; « 1 » → ligne à 124.

**R6 — Photos illisibles et non reconnues**

1. `fake:dark` → ★ M18 ; `fake:notstock` → M18b ; compteur du mois +2.
2. `fake:unknown` → M19 ; taper « fer » (plusieurs articles « Fer … ») →
   ★ liste ; choisir → M13 ; compteur inchangé par la nouvelle analyse.
3. `fake:fail` → ★ M22 ; compteur inchangé.

**R7 — Une photo à la fois**

1. Envoyer deux photos sans attendre : la seconde reçoit ★ M12 (ou M12b), une
   seule capture.

**R8 — FIN, alerte et validation au bureau** (`chef-promoteur@` puis
`promoteur@`)

1. « FIN » → ★ M25 « 2 article(s) compté(s) ».
2. Inventaire : statut « Comptage clos », écarts révélés, lignes « non
   comptées » des articles non photographiés.
3. Accueil › « À traiter » : ★ « Inventaire de chantier clos par WhatsApp » ;
   Contrôle › Alertes : même alerte, aucun nom de personne dans le titre.
4. `chef-promoteur@` se connecte au web : ★ « Gestion du stock » est absent (aucun
   `STOCK_VIEW`) ; une adresse du stock saisie à la main répond par un refus
   explicite.
5. `promoteur@` : justifier, écarter les non comptés, valider : ★ « Validé »,
   « Compté par » = chef.

**R9 — Inventaire ouvert au bureau**

1. Magasinier (`magasinier-promoteur@`, lot 040) ouvre un inventaire sur le
   même chantier et compte un article.
2. Chef : photo validée, puis « FIN » → ★ M25b (« Il reste ouvert »).

**R10 — Inventaire en attente de validation**

1. Clore cet inventaire au bureau sans le valider.
2. Chef : photo validée → ★ M29, rien d'enregistré.

**R11 — Plusieurs chantiers et CHANTIER**

1. Affecter deux autres chantiers à l'inscription.
2. Photo → ★ boutons des trois chantiers ; choisir → la photo est analysée.
3. « CHANTIER » → nouveau choix.

**R12 — Relance et expiration**

1. Photo → M13, puis « Avancer de 10 minutes » → ★ M23.
2. « Avancer de 30 minutes » → ★ M24 « La dernière photo n'a pas été
   enregistrée » ; capture « Abandonnée (sans réponse) ».

**R13 — Révocation et perte du rôle**

1. Révoquer l'inscription → message du chef → ★ M06.
2. Réinscrire, activer ; retirer le rôle Chef de chantier → message → M06
   immédiatement ; colonne « Accès » : ★ « Rôle Chef de chantier retiré ».

**R14 — Option et quota** (`integre@`)

1. Opérateur intégré, sans option : inscrire `chef-integre@` (en `log`),
   activer, photo → ★ M06b.
2. Onglet WhatsApp : carte quota « Option non souscrite ».
3. (Instance locale, `SUBSCRIPTION_ENFORCEMENT=warn`,
   `WHATSAPP_INVENTORY_WARN_QUOTA=2`) : la 3e photo → ★ M07.

**R15 — Comptages terrain et masques** (`comptable-promoteur@`, lot 040)

1. Pendant un inventaire en cours sur un chantier : Comptages terrain filtré
   sur ce lieu → ★ « Comptage en cours » à la place du stock théorique, pas de
   colonne d'écart ; dernier comptage, date, chef, source, statut affichés.
2. `magasinier-promoteur@` : aucune colonne Valeur.

**R16 — Visualiseur de preuve**

1. « Voir la photo » → ★ photo, « heure du serveur », empreinte copiable,
   analyse (méthode, total proposé, confiance), « Corrigée par le chef » pour
   la capture de R4.
2. `promoteur@` : « Voir la conversation » → bulles ; `magasinier-promoteur@` :
   bouton absent.
3. « Retirer la photo » avec un motif → ★ « Photo retirée… », empreinte gardée.

**R17 — Étanchéité** (`integre@`)

1. Ouvrir `/finance/stock/comptages-terrain?capture=<id d'une capture du
Promoteur>` → ★ « introuvable » ; idem pour une conversation.

**R18 — Langues et vocabulaire**

1. Passer `chef-promoteur@` en anglais (Profil › Langue) : AIDE → ★ réponse
   en anglais ; en arabe : ★ réponse en arabe, écrans WhatsApp et Comptages
   terrain retournés.
2. Parcourir les écrans du lot en trois langues : aucun mot interdit.

**R19 — Mesures**

1. Onglet WhatsApp › Mesures : ★ photos analysées, délai médian, part validée
   sans correction, couverture photo ; aucune donnée par personne.

**R20 — Passerelle réelle** (production, après la mise en service §7 étape 8,
par le Pilote avec un numéro de test, hors recette du staging)

1. Envoyer le code puis une vraie photo de sacs depuis un téléphone : réponse
   en moins de 45 s, photo visible dans le visualiseur, empreinte enregistrée.
2. `POST` forgé sans signature sur l'URL du webhook : `401`.
