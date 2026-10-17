import 'dotenv/config';
import { z } from 'zod';
import { connectionLimitWarnings, perInstanceLimitersWarning } from '../lib/ai/pool-guard';

/**
 * Centralised, validated environment configuration.
 *
 * Parsed once at startup: if a required variable is missing or obviously
 * insecure (placeholder secret, secret too short), the process exits instead of
 * booting with an unsafe fallback.
 *
 * Import `env` from here rather than reading `process.env` directly.
 */

/** Placeholder values shipped in env.example that must never reach a running server. */
const PLACEHOLDER_SECRETS = new Set([
  'your-access-token-secret-minimum-256-bits-here',
  'your-refresh-token-secret-minimum-256-bits-here',
  'changeme_in_production_secret_key_12345',
  'changeme',
  'secret',
  // Exemples du lot 041 (env.example) : assez longs pour passer le minimum.
  'cle-secrete-de-l-application-meta-32-caracteres-min',
  'jeton-de-verification-du-webhook-32-caracteres-min'
]);

const MIN_SECRET_LENGTH = 32;

/**
 * Le faux fournisseur d'ImmoCopilot (`AI_PROVIDER=fake`) répond sans clé ni
 * contrôle : réservé aux postes de développement et aux tests. NODE_ENV vaut
 * 'development' quand il est absent ; c'est donc la variable BRUTE qui est
 * examinée : un déploiement qui oublie NODE_ENV ne peut pas activer `fake`.
 */
export function fakeProviderAllowed(rawNodeEnv: string | undefined): boolean {
  return rawNodeEnv === 'development' || rawNodeEnv === 'test';
}

const secretSchema = z
  .string({ required_error: 'variable requise' })
  .min(MIN_SECRET_LENGTH, `doit faire au moins ${MIN_SECRET_LENGTH} caractères`)
  .refine(value => !PLACEHOLDER_SECRETS.has(value.trim()), {
    message: "valeur d'exemple détectée : générez un secret avec `openssl rand -base64 48`"
  });

const optionalUrl = z.string().url().optional();

/**
 * Variable facultative (lot 041) : une valeur vide (`KEY=""` dans le `.env`)
 * vaut une variable absente, au lieu de faire échouer le démarrage.
 */
function emptyAsUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(value => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema);
}

/**
 * Secret facultatif (lot 041) : absent, ou d'au moins 32 caractères et jamais
 * une valeur d'exemple. Son caractère requis dépend du transport choisi
 * (`superRefine` plus bas).
 */
const optionalSecretSchema = emptyAsUndefined(
  z
    .string()
    .optional()
    .refine(value => value === undefined || value.length >= MIN_SECRET_LENGTH, {
      message: `doit faire au moins ${MIN_SECRET_LENGTH} caractères`
    })
    .refine(value => value === undefined || !PLACEHOLDER_SECRETS.has(value.trim()), {
      message: "valeur d'exemple détectée : générez un secret avec `openssl rand -base64 48`"
    })
);

/** Nom d'hôte seul (sans schéma, port ni chemin), en minuscules. */
const HOSTNAME_PATTERN = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Hôtes autorisés pour le téléchargement des médias WhatsApp (garde SSRF,
 * spec 041 W6-R9) : liste séparée par des virgules, rendue en tableau.
 */
const mediaHostsSchema = z
  .string()
  .default('lookaside.fbsbx.com')
  .transform(value =>
    value
      .split(',')
      .map(host => host.trim().toLowerCase())
      .filter(host => host.length > 0)
  )
  .pipe(
    z
      .array(
        z.string().regex(HOSTNAME_PATTERN, "nom d'hôte seul attendu, sans schéma ni port (ex. lookaside.fbsbx.com)")
      )
      .min(1, 'au moins un hôte')
  );

/**
 * Clé de chiffrement des clés API des agrégateurs de paiement (lot 7).
 *
 * Optionnelle : une agence ne peut alors pas enregistrer de clé API
 * (`encryptionAvailable = false` côté paramètres), mais le serveur démarre
 * quand même — contrairement à `JWT_SECRET`, l'absence de cette variable ne
 * rend rien d'existant inutilisable. Quand elle est présente, elle doit
 * décoder en exactement 32 octets base64 (`openssl rand -base64 32`) : la
 * taille d'une clé AES-256.
 */
const paymentSecretsKeySchema = z
  .string()
  .optional()
  .refine(
    value => {
      if (!value) return true;
      try {
        return Buffer.from(value, 'base64').length === 32;
      } catch {
        return false;
      }
    },
    { message: 'doit être 32 octets encodés en base64 (`openssl rand -base64 32`)' }
  );

/**
 * Contrôle strict d'une clé IBAN : forme canonique d'une clé de 32 octets en
 * base64 (43 caractères et un `=`), 32 octets décodés, au moins 16 octets
 * distincts (refus d'une clé manifestement faible : zéros, motif répété…).
 * Renvoie la raison du refus, jamais la valeur.
 */
export function ibanKeyProblem(value: string): string | null {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    return 'doit être une clé de 32 octets en base64 canonique, 44 caractères (`openssl rand -base64 32`)';
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== 32) return 'doit faire 32 octets une fois décodée (`openssl rand -base64 32`)';
  if (new Set(bytes).size < 16) {
    return 'est trop faible (octets trop peu variés) : générez-la avec `openssl rand -base64 32`';
  }
  return null;
}

/** `true` quand la valeur est une clé IBAN acceptable (voir `ibanKeyProblem`). */
export function isStrictIbanKey(value: string | undefined): value is string {
  return typeof value === 'string' && ibanKeyProblem(value) === null;
}

/**
 * Clé DÉDIÉE aux IBAN des mandats de prélèvement (spec 042) : 32 octets en
 * base64 canonique et non triviale ; une valeur vide vaut absente. Distincte
 * de `PAYMENT_SECRETS_KEY` (contrôle dans `superRefine`). Le message ne cite
 * jamais la valeur.
 */
const directDebitIbanKeySchema = emptyAsUndefined(
  z
    .string()
    .optional()
    .superRefine((value, ctx) => {
      const problem = value === undefined ? null : ibanKeyProblem(value);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    })
);

function isBase64Key32(value: string): boolean {
  try {
    return Buffer.from(value, 'base64').length === 32;
  } catch {
    return false;
  }
}

/** Découpe une liste de clés séparées par des virgules (espaces tolérés, entrées vides ignorées). */
export function parseKeyList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry !== '');
}

/**
 * Anciennes clés IBAN (rotation) : ne servent qu'à déchiffrer. Le message
 * n'indique que le rang de l'entrée fautive, jamais sa valeur.
 */
const directDebitIbanPreviousKeysSchema = z
  .string()
  .optional()
  .superRefine((value, ctx) => {
    parseKeyList(value).forEach((entry, index) => {
      const problem = ibanKeyProblem(entry);
      if (problem) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `l'entrée n°${index + 1} ${problem}`
        });
      }
    });
  });

/**
 * Types de document signables (miroir de l'enum Prisma `SignatureDocumentKind`, gardé
 * aligné par `__tests__/unit/env-signature-kinds.test.ts`). Liste littérale : la
 * configuration ne dépend pas du client Prisma, que de nombreux tests simulent.
 */
export const SIGNATURE_DOCUMENT_KINDS = [
  'LEASE_CONTRACT',
  'MANAGEMENT_MANDATE',
  'SALE_MANDATE',
  'LEASE_INSPECTION',
  'SALE_AGREEMENT'
] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(8001),

    // Persistence
    DATABASE_URL: z.string({ required_error: 'variable requise' }).min(1),

    // Auth
    JWT_SECRET: secretSchema,
    JWT_EXPIRES_IN: z.string().default('15m'),

    // Application URLs. FRONTEND_URL is the single source of truth for the
    // browser origin; CLIENT_URL is kept as a legacy alias.
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),
    CLIENT_URL: optionalUrl,
    BACKEND_URL: z.string().url().default('http://localhost:8001'),

    // Where user-uploaded files live. Defaults to <repo>/uploads (resolved in
    // index.ts) when unset, so existing installs keep working.
    UPLOADS_DIR: z.string().optional(),

    // Google OAuth (optional: the strategy is skipped when unset)
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALLBACK_URL: optionalUrl,

    // Paiement en ligne des loyers (lot 7) — agrégateur PaySecureHub.
    PAYMENT_SECRETS_KEY: paymentSecretsKeySchema,
    // IBAN des mandats de prélèvement (spec 042) : clé dédiée, versionnée.
    DIRECT_DEBIT_IBAN_KEY: directDebitIbanKeySchema,
    DIRECT_DEBIT_IBAN_PREVIOUS_KEYS: directDebitIbanPreviousKeysSchema,
    PAYSECUREHUB_BASE_URL: z.string().url().default('https://rest-airtime.paysecurehub.com/api'),
    PAYSECUREHUB_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    // '1' autorise le simulateur en production (démonstration). Hors
    // production il est toujours disponible, quelle que soit cette valeur.
    PAYMENT_GATEWAY_SIMULATOR: z.string().optional(),

    // Paiement de l'abonnement des agences (vague 3) : compte PaySecureHub
    // PROPRE A IMMOTOPIA, distinct des comptes des agences. En LIVE, la cle et
    // l'identifiant marchand sont exiges ; sans eux le paiement en ligne des
    // factures est simplement indisponible (le constat manuel reste possible).
    PLATFORM_PAYSECUREHUB_MODE: z.enum(['SIMULATOR', 'LIVE']).default('SIMULATOR'),
    PLATFORM_PAYSECUREHUB_API_KEY: z.string().optional(),
    PLATFORM_PAYSECUREHUB_MERCHANT_ID: z.string().optional(),

    // Emetteur des factures d'abonnement (vague 3, lot A) : mentions legales
    // d'Alliance Consultants imprimees sur chaque facture PLATFORM et figees
    // dans la facture a son emission. Aucune n'est un secret.
    PLATFORM_ISSUER_NAME: z.string().min(1).default('Alliance Consultants'),
    PLATFORM_ISSUER_ADDRESS: z.string().optional(),
    PLATFORM_ISSUER_RCCM: z.string().optional(),
    PLATFORM_ISSUER_TAX_ID: z.string().optional(),
    PLATFORM_ISSUER_EMAIL: z.string().optional(),
    PLATFORM_ISSUER_PHONE: z.string().optional(),
    // Jours laisses pour regler une facture de depassement mensuel (annuel).
    PLATFORM_INVOICE_DUE_DAYS: z.coerce.number().int().min(0).max(90).default(7),

    // Liens securises (lib/secure-links, lot A3) : duree de vie d'un lien public
    // en lecture seule. `ttlDays` demande a la creation est borne a [1, MAX].
    SECURE_LINK_DEFAULT_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(7),
    SECURE_LINK_MAX_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

    // Tache planifiee du rapport mensuel proprietaire (lot A3) : coupee par defaut.
    PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED: z
      .enum(['true', 'false', '1', '0'])
      .default('false')
      .transform(value => value === 'true' || value === '1'),

    // Lot 040 (B7-R6) : envoi par e-mail des alertes de stock (recapitulatif
    // par agence, toutes les 10 minutes). Coupe par defaut ; la purge
    // nocturne des cles d'idempotence du stock tourne, elle, toujours.
    STOCK_ALERT_MAIL_JOB_ENABLED: z
      .enum(['true', 'false', '1', '0'])
      .default('false')
      .transform(value => value === 'true' || value === '1'),

    // Prisma tenant guard (utils/prisma-tenant-guard-extension.ts).
    // `warn` logs unscoped queries on tenant-owned models without blocking
    // them; `enforce` throws. See env.example for the warn → enforce sequence.
    TENANT_GUARD_MODE: z.enum(['off', 'warn', 'enforce']).default('warn'),

    // Journal d'audit : retention, scellement, purge (ADR-006, phase 5,
    // jobs/audit-maintenance-job.ts). Les durees sont des DEFAUTS A VALIDER.
    // Minimum 7 mois : la fonction SQL `audit_logs_purge` refuse de toute facon
    // une date limite de moins de 180 jours.
    // - lignes visibles de l'agence (visibility = TENANT) : 24 mois ;
    // - lignes reservees a la plateforme (PLATFORM_ONLY, sans agence) : 60 mois.
    AUDIT_RETENTION_TENANT_MONTHS: z.coerce.number().int().min(7).max(240).default(24),
    AUDIT_RETENTION_PLATFORM_MONTHS: z.coerce.number().int().min(7).max(240).default(60),
    // Jours laisses a une journee avant d'etre scellee : une ligne remise en file
    // par une panne de base peut arriver avec la date de sa journee d'origine.
    AUDIT_SEAL_GRACE_DAYS: z.coerce.number().int().min(1).max(30).default(2),
    // La purge est DESTRUCTIVE : elle est desactivee tant qu'elle n'est pas
    // activee expressement (`true`). Le scellement, lui, est toujours actif.
    AUDIT_PURGE_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform(value => value === 'true'),

    // Abonnements par packs (lib/subscription, docs/architecture/PLAN-ABONNEMENTS.md).
    // `off` : droits calcules mais jamais appliques ; `warn` : modules,
    // lecture seule et quotas journalises sans bloquer ; `enforce` : appliques.
    SUBSCRIPTION_ENFORCEMENT: z.enum(['off', 'warn', 'enforce']).default('warn'),

    // ImmoCopilot (lib/ai, docs/architecture/PLAN_IMMOCOPILOT.md).
    // AI_PROVIDER / AI_MODEL / AI_EFFORT / AI_REFUSAL_FALLBACK sont des VALEURS PAR
    // DEFAUT : le reglage du super-admin en base (services/ai-settings-service.ts)
    // est prioritaire. Les cles API restent ici, jamais en base.
    // `disabled` : l'assistant est coupe et l'application marche sans cle.
    // Aucun secret par defaut : ANTHROPIC_API_KEY est exigee si `anthropic`,
    // OPENROUTER_API_KEY si `openrouter`.
    AI_PROVIDER: z.enum(['disabled', 'fake', 'anthropic', 'openrouter']).default('disabled'),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
    // Identifiant du modele : `claude-opus-5-5` pour anthropic, un identifiant
    // OpenRouter (`fournisseur/modele`, ex. `anthropic/claude-sonnet-4.5`) pour openrouter.
    AI_MODEL: z.string().min(1).default('claude-opus-5-5'),
    AI_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1024).max(64000).default(16000),
    AI_MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(8).default(4),
    AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    AI_PROPOSAL_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    // Plans d'ecriture generiques (plan V2, etape 4) : l'utilisateur doit lire les
    // changements calcules par le serveur et, pour un plan sensible, saisir un mot de
    // confirmation. 300 s ne suffisent pas toujours : 900 s par defaut, 300 s au minimum.
    AI_WRITE_PLAN_TTL_SECONDS: z.coerce.number().int().min(300).max(3600).default(900),
    AI_REFUSAL_FALLBACK: z.enum(['on', 'off']).default('on'),
    // Cache de prompt Anthropic (cache_control) : invite systeme + outils, et
    // historique des tours d'outils. `off` coupe les marqueurs sans toucher au reste.
    AI_PROMPT_CACHE: z.enum(['on', 'off']).default('on'),
    // Plafonds PAR AGENCE (tous collaborateurs confondus) sur POST /ai/chat, en
    // plus des limites par utilisateur (rate-limit-middleware.ts).
    AI_TENANT_MINUTE_LIMIT: z.coerce.number().int().min(1).max(100000).default(100),
    AI_TENANT_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000000).default(3000),

    // Inventaire de chantier par WhatsApp et IA (lot 041, spec 041 W1, W8, W11 ;
    // data-model §7). Transport `disabled` par defaut : webhook en 404, tache
    // arretee. `log` n'envoie rien (developpement, staging, tests) et alimente
    // le simulateur ; `meta` appelle l'API Graph de WhatsApp Cloud.
    WHATSAPP_INVENTORY_TRANSPORT: z.enum(['disabled', 'log', 'meta']).default('disabled'),
    // '1' autorise hors developpement (staging, NODE_ENV=production) le transport
    // `log`, le simulateur et, avec `log` seulement, le faux fournisseur de vision.
    // deploy.sh prod refuse ce reglage, le transport `log` et la vision `fake`.
    WHATSAPP_INVENTORY_SIMULATOR: z.enum(['0', '1']).default('0'),
    // Application Meta : cle secrete (signature X-Hub-Signature-256, empreinte
    // des expediteurs), jeton de verification du webhook, jeton d'acces
    // permanent d'un utilisateur systeme, identifiant du numero. Requis si `meta`.
    META_WA_APP_SECRET: optionalSecretSchema,
    META_WA_VERIFY_TOKEN: optionalSecretSchema,
    META_WA_ACCESS_TOKEN: emptyAsUndefined(z.string().min(1).optional()),
    META_WA_PHONE_NUMBER_ID: emptyAsUndefined(
      z.string().regex(/^\d+$/, 'chiffres seulement (phone_number_id de Meta)').optional()
    ),
    // Visio integree a l'AG en direct (spec 045). Projet LiveKit DEDIE a
    // ImmoTopia : les trois variables ou aucune (verifie dans le superRefine).
    // `ws://` n'est accepte qu'en developpement et en test.
    LIVEKIT_URL: emptyAsUndefined(
      z
        .string()
        .regex(/^wss?:\/\/\S+$/, 'doit commencer par wss:// (ou ws:// en développement)')
        .optional()
    ),
    LIVEKIT_API_KEY: emptyAsUndefined(z.string().min(1).optional()),
    LIVEKIT_API_SECRET: optionalSecretSchema,
    // Enregistrement des AG (spec 045, R3) : stockage S3 (ou compatible) vers lequel LiveKit
    // Egress ecrit le MP4. Bucket et cles : tous ou aucun, et la visio doit etre configuree.
    LIVEKIT_RECORDING_S3_BUCKET: emptyAsUndefined(z.string().min(3).max(255).optional()),
    LIVEKIT_RECORDING_S3_REGION: emptyAsUndefined(z.string().min(1).default('us-east-1')),
    LIVEKIT_RECORDING_S3_ENDPOINT: emptyAsUndefined(
      z
        .string()
        .regex(/^https?:\/\/\S+$/, 'doit commencer par http:// ou https://')
        .optional()
    ),
    // Cles d'acces S3 : pas de minimum de 32 caracteres (ce ne sont pas des secrets applicatifs).
    LIVEKIT_RECORDING_S3_ACCESS_KEY: emptyAsUndefined(z.string().min(1).optional()),
    LIVEKIT_RECORDING_S3_SECRET: emptyAsUndefined(z.string().min(1).optional()),
    LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE: z.enum(['0', '1']).default('0'),
    // Prefixe des objets : relatif (pas de / initial) et sans « .. ».
    LIVEKIT_RECORDING_S3_PREFIX: emptyAsUndefined(
      z
        .string()
        .min(1)
        .max(200)
        .refine(value => !value.startsWith('/') && !value.split('/').includes('..') && !value.includes('\\'), {
          message: 'doit être relatif : pas de / initial, pas de « .. »'
        })
        .default('ag-enregistrements/')
    ),
    // Taille maximale (octets) d'un enregistrement rapatrie ; au-dela : echec `TOO_LARGE`, objet conserve.
    LIVEKIT_RECORDING_MAX_BYTES: emptyAsUndefined(
      z.coerce
        .number()
        .int()
        .positive()
        .default(8 * 1024 ** 3)
    ),
    META_WA_GRAPH_BASE_URL: z.string().url().default('https://graph.facebook.com'),
    // [A verifier au deploiement] : derniere version stable de l'API Graph.
    META_WA_GRAPH_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/, 'forme vNN.N attendue (ex. v23.0)')
      .default('v23.0'),
    META_WA_MEDIA_HOSTS: emptyAsUndefined(mediaHostsSchema),
    // Numero officiel du bot, affiche a l'ecran d'inscription. E.164 (+225...).
    WHATSAPP_INVENTORY_PUBLIC_NUMBER: emptyAsUndefined(
      z
        .string()
        .regex(/^\+[0-9]{8,15}$/, 'numéro E.164 attendu (ex. +2250700000000)')
        .optional()
    ),
    // Quota de secours (photos par agence et par mois) sans option souscrite,
    // en SUBSCRIPTION_ENFORCEMENT=warn ou off (W11-R4).
    WHATSAPP_INVENTORY_WARN_QUOTA: z.coerce.number().int().min(0).max(100000).default(500),
    // Analyse des photos (W8). Independant du reglage ImmoCopilot du super-admin.
    STOCK_VISION_PROVIDER: z.enum(['disabled', 'fake', 'gemini', 'openrouter']).default('disabled'),
    // Flash stable recommande pour un nouveau projet (gemini-2.5-flash n'est plus
    // ouvert qu'aux comptes qui l'utilisaient deja) : https://ai.google.dev/gemini-api/docs/models,
    // verifie le 04/10/2026. `fournisseur/modele` pour openrouter : google/gemini-3.8-flash
    // (https://openrouter.ai/google/gemini-3.8-flash, meme date).
    STOCK_VISION_MODEL: z.string().min(1).default('gemini-3.8-flash'),
    GEMINI_API_KEY: emptyAsUndefined(z.string().min(1).optional()),
    STOCK_VISION_TIMEOUT_MS: z.coerce.number().int().min(2000).max(60000).default(20000),

    // Signature electronique (spec 044, SG-R13). `disabled` par defaut : toute
    // demande est refusee. `log` : rien ne part, seules des metadonnees sont
    // journalisees (jamais lien, jeton ni code). `internal` : jeton + code a
    // usage unique geres par le noyau (e-mail, WhatsApp).
    SIGNATURE_PROVIDER: z.enum(['disabled', 'log', 'internal', 'yousign']).default('disabled'),
    // Prestataire externe Yousign API v3 (lot S6). Base par defaut = SANDBOX, jamais la
    // production. Cle et secret de webhook : aucun defaut, requis si SIGNATURE_PROVIDER=yousign.
    YOUSIGN_API_KEY: emptyAsUndefined(z.string().min(1).optional()),
    YOUSIGN_API_BASE_URL: emptyAsUndefined(z.string().url().default('https://api-sandbox.yousign.app/v3')),
    // '1' autorise la base SANDBOX de Yousign quand NODE_ENV=production : le staging
    // tourne en production (make-env.sh) mais ne doit pas produire de vraies signatures
    // facturees. Sans ce drapeau, une base « sandbox » en production est refusee au
    // demarrage. deploy.sh prod refuse YOUSIGN_ALLOW_SANDBOX=1.
    YOUSIGN_ALLOW_SANDBOX: emptyAsUndefined(z.enum(['0', '1']).default('0')),
    YOUSIGN_WEBHOOK_SECRET: emptyAsUndefined(z.string().min(16).optional()),
    // Niveau de signature demande a Yousign. Seuls `advanced` et `qualified` rendent le
    // fournisseur « qualifie » (SG-R1) ; le defaut (simple) ne leve donc pas l'exigence.
    YOUSIGN_SIGNATURE_LEVEL: z
      .enum(['electronic_signature', 'advanced_electronic_signature', 'qualified_electronic_signature'])
      .default('electronic_signature'),
    SIGNATURE_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(2000).max(60000).default(20000),

    // Transport SMS (signature, lot S7). `disabled` par defaut ; `log` n'envoie
    // rien (development/test seulement) ; `orange` = SMS API Orange CI. Aucun
    // secret n'a de valeur par defaut ; requis seulement si `orange` (superRefine).
    SMS_PROVIDER: z.enum(['disabled', 'log', 'orange']).default('disabled'),
    ORANGE_SMS_CLIENT_ID: emptyAsUndefined(z.string().min(1).optional()),
    ORANGE_SMS_CLIENT_SECRET: emptyAsUndefined(z.string().min(1).optional()),
    ORANGE_SMS_API_BASE_URL: z.string().url().default('https://api.orange.com'),
    // Indicatifs pays (sans +) autorises pour un SMS de signature : UEMOA + Guinee.
    SMS_ALLOWED_DIAL_CODES: z
      .string()
      .default('225,221,223,226,227,228,229,245,224')
      .transform(value =>
        value
          .split(',')
          .map(item => item.trim().replace(/^\+/, ''))
          .filter(Boolean)
      )
      .refine(list => list.length > 0 && list.every(code => /^\d{1,4}$/.test(code)), {
        message: 'liste d’indicatifs numériques séparés par des virgules'
      }),
    // Plafond de SMS de signature par agence et par jour (invitations, relances, codes).
    SIGNATURE_SMS_DAILY_LIMIT: z.coerce.number().int().min(1).max(100000).default(200),
    // Adresse d'expediteur Orange, forme `tel:+<numero>` (a confirmer avec le compte).
    ORANGE_SMS_SENDER_ADDRESS: emptyAsUndefined(
      z
        .string()
        .regex(/^tel:\+\d{6,15}$/, 'forme attendue : tel:+225...')
        .optional()
    ),
    // Nom d'expediteur facultatif : 11 caracteres alphanumeriques ou espaces,
    // approuve au prealable par Orange (sinon l'envoi est refuse).
    ORANGE_SMS_SENDER_NAME: emptyAsUndefined(
      z
        .string()
        .regex(/^[A-Za-z0-9 ]{1,11}$/, '11 caracteres alphanumeriques ou espaces au plus')
        .optional()
    ),
    // Types de document dont la signature exige un prestataire qualifie (SG-R1) :
    // liste separee par des virgules de SignatureDocumentKind. Le fournisseur
    // `internal` (signature simple) est refuse pour ces types tant que le type
    // n'est pas retire de la liste, apres avis juridique. Defaut : le compromis de vente.
    // Chaque element est valide : une valeur inconnue (faute de frappe) bloque le
    // demarrage, au lieu de laisser un type sans la protection attendue.
    SIGNATURE_PROVIDER_REQUIRED_KINDS: z
      .string()
      .default('SALE_AGREEMENT')
      .transform(value =>
        value
          .split(',')
          .map(kind => kind.trim().toUpperCase())
          .filter(Boolean)
      )
      .pipe(
        z.array(
          z.enum(SIGNATURE_DOCUMENT_KINDS, {
            errorMap: (issue, ctx) => ({
              message: `type de document inconnu ${JSON.stringify((issue as { received?: unknown }).received ?? ctx.data)} (valeurs : ${SIGNATURE_DOCUMENT_KINDS.join(', ')})`
            })
          })
        )
      ),
    // Duree de validite par defaut d'une demande (et donc des jetons), en jours ; 30 au plus.
    SIGNATURE_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    // Code a usage unique (SG-R4) : validite, essais, renvois, delai entre deux envois.
    SIGNATURE_OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
    SIGNATURE_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
    SIGNATURE_OTP_MAX_RESENDS: z.coerce.number().int().min(0).max(10).default(3),
    SIGNATURE_OTP_RESEND_DELAY_SECONDS: z.coerce.number().int().min(0).max(600).default(30),
    // Quota de secours (demandes par agence et par mois) sans capacite
    // SIGNATURES_MENSUELLES, en SUBSCRIPTION_ENFORCEMENT=warn ou off (SG-R12).
    SIGNATURE_WARN_QUOTA: z.coerce.number().int().min(0).max(100000).default(50),
    // Rappels automatiques avant expiration (spec 044, SG-R11) : seuils en jours
    // restants, entiers de 1 a 30 separes par des virgules ("3,1" : a 3 jours puis a
    // 1 jour de l'echeance). "" ou "off" desactive. Dedoublonnes, tries decroissant.
    // Une valeur invalide bloque le demarrage.
    SIGNATURE_REMINDER_DAYS_BEFORE: z
      .string()
      .default('3,1')
      .transform((value, ctx): number[] => {
        const raw = value.trim().toLowerCase();
        if (raw === '' || raw === 'off') return [];
        const days = new Set<number>();
        for (const part of raw.split(',')) {
          const item = part.trim();
          const n = Number(item);
          if (!/^\d+$/.test(item) || n < 1 || n > 30) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `seuil invalide ${JSON.stringify(item)} (entiers de 1 a 30 separes par des virgules, ou "off")`
            });
            return z.NEVER;
          }
          days.add(n);
        }
        return [...days].sort((a, b) => b - a);
      }),
    // Conversion DOCX -> PDF (lib/pdf-convert), necessaire au bail signable.
    DOCX_PDF_CONVERTER: z.enum(['libreoffice', 'disabled']).default('disabled')
  })
  // Unknown keys are preserved: many optional integrations still read
  // process.env directly (WhatsApp, SMTP, Twilio).
  .passthrough()
  .superRefine((value, ctx) => {
    if (
      value.DIRECT_DEBIT_IBAN_KEY &&
      value.PAYMENT_SECRETS_KEY &&
      isBase64Key32(value.DIRECT_DEBIT_IBAN_KEY) &&
      isBase64Key32(value.PAYMENT_SECRETS_KEY) &&
      Buffer.from(value.DIRECT_DEBIT_IBAN_KEY, 'base64').equals(Buffer.from(value.PAYMENT_SECRETS_KEY, 'base64'))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DIRECT_DEBIT_IBAN_KEY'],
        message: 'doit être dédiée aux IBAN : elle ne peut pas être identique à PAYMENT_SECRETS_KEY'
      });
    }
    if (value.AI_PROVIDER === 'anthropic' && !value.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ANTHROPIC_API_KEY'],
        message: 'variable requise quand AI_PROVIDER=anthropic'
      });
    }
    if (value.AI_PROVIDER === 'openrouter') {
      if (!value.OPENROUTER_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OPENROUTER_API_KEY'],
          message: 'variable requise quand AI_PROVIDER=openrouter'
        });
      }
      // Le défaut anthropic n'existe pas chez OpenRouter : exiger un identifiant `fournisseur/modele`.
      if (!value.AI_MODEL.includes('/')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AI_MODEL'],
          message: 'identifiant OpenRouter requis quand AI_PROVIDER=openrouter (ex. anthropic/claude-sonnet-4.5)'
        });
      }
    }
    // Liste blanche : `fake` n'est accepté que pour NODE_ENV=development ou test,
    // jamais quand NODE_ENV est absent d'un déploiement (qui vaut alors 'development'
    // par défaut) ni pour une valeur intermédiaire ('staging', 'production'...).
    if (value.AI_PROVIDER === 'fake' && !fakeProviderAllowed(process.env.NODE_ENV)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AI_PROVIDER'],
        message: "le faux fournisseur 'fake' n'est accepté que si NODE_ENV vaut explicitement 'development' ou 'test'"
      });
    }

    // Spec 045 : visio LiveKit, les trois variables ou aucune ; `wss://` hors développement et test.
    const livekit = [
      ['LIVEKIT_URL', value.LIVEKIT_URL],
      ['LIVEKIT_API_KEY', value.LIVEKIT_API_KEY],
      ['LIVEKIT_API_SECRET', value.LIVEKIT_API_SECRET]
    ] as const;
    if (livekit.some(([, present]) => present) && !livekit.every(([, present]) => present)) {
      for (const [name, present] of livekit) {
        if (!present) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: 'LIVEKIT_URL, LIVEKIT_API_KEY et LIVEKIT_API_SECRET vont ensemble : les trois ou aucune'
          });
        }
      }
    }
    // Comme ws:// : un endpoint S3 en clair (http://) n'est accepte qu'en developpement et en test.
    if (value.LIVEKIT_RECORDING_S3_ENDPOINT?.startsWith('http://') && !fakeProviderAllowed(process.env.NODE_ENV)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LIVEKIT_RECORDING_S3_ENDPOINT'],
        message: "http:// n'est accepté que si NODE_ENV vaut explicitement 'development' ou 'test' : utilisez https://"
      });
    }
    if (value.LIVEKIT_URL?.startsWith('ws://') && !fakeProviderAllowed(process.env.NODE_ENV)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LIVEKIT_URL'],
        message: "ws:// n'est accepté que si NODE_ENV vaut explicitement 'development' ou 'test' : utilisez wss://"
      });
    }

    // Spec 045 (R3) : enregistrement, bucket et cles ensemble, et seulement avec la visio.
    const recording = [
      ['LIVEKIT_RECORDING_S3_BUCKET', value.LIVEKIT_RECORDING_S3_BUCKET],
      ['LIVEKIT_RECORDING_S3_ACCESS_KEY', value.LIVEKIT_RECORDING_S3_ACCESS_KEY],
      ['LIVEKIT_RECORDING_S3_SECRET', value.LIVEKIT_RECORDING_S3_SECRET]
    ] as const;
    if (recording.some(([, present]) => present) && !recording.every(([, present]) => present)) {
      for (const [name, present] of recording) {
        if (!present) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: 'LIVEKIT_RECORDING_S3_BUCKET, _ACCESS_KEY et _SECRET vont ensemble : les trois ou aucune'
          });
        }
      }
    }
    if (
      value.LIVEKIT_RECORDING_S3_BUCKET &&
      !(value.LIVEKIT_URL && value.LIVEKIT_API_KEY && value.LIVEKIT_API_SECRET)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LIVEKIT_RECORDING_S3_BUCKET'],
        message: "l'enregistrement exige la visio configurée (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)"
      });
    }
    // Transport SMS (signature, lot S7).
    if (value.SMS_PROVIDER === 'orange') {
      const requisSms = [
        ['ORANGE_SMS_CLIENT_ID', value.ORANGE_SMS_CLIENT_ID],
        ['ORANGE_SMS_CLIENT_SECRET', value.ORANGE_SMS_CLIENT_SECRET],
        ['ORANGE_SMS_SENDER_ADDRESS', value.ORANGE_SMS_SENDER_ADDRESS]
      ] as const;
      for (const [name, present] of requisSms) {
        if (!present) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: 'variable requise quand SMS_PROVIDER=orange'
          });
        }
      }
    }
    if (value.SMS_PROVIDER === 'log' && !fakeProviderAllowed(process.env.NODE_ENV)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMS_PROVIDER'],
        message: "le transport 'log' n'est accepté que si NODE_ENV vaut explicitement 'development' ou 'test'"
      });
    }

    // Lot S6 — prestataire de signature externe Yousign.
    if (!value.ORANGE_SMS_API_BASE_URL.startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ORANGE_SMS_API_BASE_URL'],
        message: "l'URL doit être en https"
      });
    }
    if (
      value.NODE_ENV === 'production' &&
      value.SIGNATURE_PROVIDER === 'yousign' &&
      value.YOUSIGN_API_BASE_URL.includes('sandbox') &&
      value.YOUSIGN_ALLOW_SANDBOX !== '1'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['YOUSIGN_API_BASE_URL'],
        message:
          'la base SANDBOX Yousign est refusée en production (https://api.yousign.app/v3) ; seul le staging l’autorise, avec YOUSIGN_ALLOW_SANDBOX=1'
      });
    }
    if (!value.YOUSIGN_API_BASE_URL.startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['YOUSIGN_API_BASE_URL'],
        message: "l'URL doit être en https"
      });
    }
    if (value.SIGNATURE_PROVIDER === 'yousign') {
      for (const [name, present] of [
        ['YOUSIGN_API_KEY', value.YOUSIGN_API_KEY],
        ['YOUSIGN_WEBHOOK_SECRET', value.YOUSIGN_WEBHOOK_SECRET]
      ] as const) {
        if (!present) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: 'variable requise quand SIGNATURE_PROVIDER=yousign'
          });
        }
      }
    }

    // Lot 041 — inventaire par WhatsApp (data-model §7).
    if (value.WHATSAPP_INVENTORY_TRANSPORT === 'meta') {
      const requis = [
        ['META_WA_APP_SECRET', value.META_WA_APP_SECRET],
        ['META_WA_VERIFY_TOKEN', value.META_WA_VERIFY_TOKEN],
        ['META_WA_ACCESS_TOKEN', value.META_WA_ACCESS_TOKEN],
        ['META_WA_PHONE_NUMBER_ID', value.META_WA_PHONE_NUMBER_ID]
      ] as const;
      for (const [name, present] of requis) {
        if (!present) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: 'variable requise quand WHATSAPP_INVENTORY_TRANSPORT=meta'
          });
        }
      }
    }
    // Écart E1 (spec 041 §13) : `log` seulement si NODE_ENV vaut EXPLICITEMENT
    // 'development' ou 'test' (valeur brute, comme pour AI_PROVIDER=fake : un
    // déploiement qui oublie NODE_ENV n'en profite pas), ou avec le simulateur.
    if (
      value.WHATSAPP_INVENTORY_TRANSPORT === 'log' &&
      !fakeProviderAllowed(process.env.NODE_ENV) &&
      value.WHATSAPP_INVENTORY_SIMULATOR !== '1'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WHATSAPP_INVENTORY_TRANSPORT'],
        message:
          "le transport 'log' n'est accepté que si NODE_ENV vaut explicitement 'development' ou 'test', ou avec WHATSAPP_INVENTORY_SIMULATOR=1"
      });
    }
    // W8-R9 : faux fournisseur de vision en développement, en test, ou avec le
    // simulateur ET le transport `log` : jamais de comptages simulés derrière de
    // vrais messages WhatsApp (transport `meta`).
    if (
      value.STOCK_VISION_PROVIDER === 'fake' &&
      !fakeProviderAllowed(process.env.NODE_ENV) &&
      !(value.WHATSAPP_INVENTORY_SIMULATOR === '1' && value.WHATSAPP_INVENTORY_TRANSPORT === 'log')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STOCK_VISION_PROVIDER'],
        message:
          "le faux fournisseur de vision 'fake' n'est accepté que si NODE_ENV vaut 'development' ou 'test', ou avec WHATSAPP_INVENTORY_SIMULATOR=1 et WHATSAPP_INVENTORY_TRANSPORT=log"
      });
    }
    if (value.STOCK_VISION_PROVIDER === 'gemini' && !value.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GEMINI_API_KEY'],
        message: 'variable requise quand STOCK_VISION_PROVIDER=gemini'
      });
    }
    if (value.STOCK_VISION_PROVIDER === 'openrouter') {
      if (!value.OPENROUTER_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OPENROUTER_API_KEY'],
          message: 'variable requise quand STOCK_VISION_PROVIDER=openrouter'
        });
      }
      if (!value.STOCK_VISION_MODEL.includes('/')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STOCK_VISION_MODEL'],
          message: 'identifiant OpenRouter requis quand STOCK_VISION_PROVIDER=openrouter (ex. google/gemini-3.8-flash)'
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues.map(issue => `  - ${issue.path.join('.') || '(racine)'} : ${issue.message}`).join('\n');
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(
      [
        '',
        '❌ Configuration invalide : le serveur ne peut pas démarrer.',
        formatIssues(parsed.error),
        '',
        'Renseignez ces variables dans packages/api/.env (voir env.example).',
        ''
      ].join('\n')
    );
    process.exit(1);
  }

  const env = parsed.data;

  if (env.AI_PROVIDER === 'fake') {
    // eslint-disable-next-line no-console
    console.warn(
      '⚠️  AI_PROVIDER=fake : ImmoCopilot répond avec le faux fournisseur déterministe (développement et recette uniquement).'
    );
  }

  // ImmoCopilot : pool Prisma vs sections exclusives, limiteurs par instance (lib/ai/pool-guard.ts).
  for (const message of connectionLimitWarnings(env.DATABASE_URL, env.AI_PROVIDER !== 'disabled')) {
    // eslint-disable-next-line no-console
    console.warn(`⚠️  ${message}`);
  }
  if (env.NODE_ENV === 'production' && env.AI_PROVIDER !== 'disabled') {
    // eslint-disable-next-line no-console
    console.warn(
      `⚠️  ${perInstanceLimitersWarning({ tenantMinute: env.AI_TENANT_MINUTE_LIMIT, tenantDaily: env.AI_TENANT_DAILY_LIMIT })}`
    );
  }

  if (
    env.NODE_ENV === 'production' &&
    env.SIGNATURE_PROVIDER === 'yousign' &&
    env.YOUSIGN_API_BASE_URL.includes('sandbox')
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      '⚠️  SIGNATURE_PROVIDER=yousign en production avec la base SANDBOX (YOUSIGN_ALLOW_SANDBOX=1, staging seulement) : les signatures n’ont aucune valeur. Renseignez YOUSIGN_API_BASE_URL (production) après recette.'
    );
  }

  if (!env.SIGNATURE_PROVIDER_REQUIRED_KINDS.includes('SALE_AGREEMENT')) {
    // eslint-disable-next-line no-console
    console.warn(
      "⚠️  SIGNATURE_PROVIDER_REQUIRED_KINDS ne contient pas SALE_AGREEMENT : le compromis de vente peut être signé par la signature simple (sans prestataire qualifié). À ne faire qu'après avis juridique."
    );
  }

  if (env.NODE_ENV === 'production') {
    if (env.FRONTEND_URL.startsWith('http://localhost')) {
      // eslint-disable-next-line no-console
      console.warn('⚠️  FRONTEND_URL pointe encore sur localhost en production.');
    }
    if (!env.BACKEND_URL.startsWith('https://')) {
      // eslint-disable-next-line no-console
      console.warn('⚠️  BACKEND_URL devrait utiliser HTTPS en production.');
    }
  }

  return env;
}

export const env = loadEnv();

/** Browser origin allowed by CORS and referenced in e-mail links. */
export const frontendUrl = env.CLIENT_URL || env.FRONTEND_URL;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/**
 * Le simulateur PaySecureHub est-il autorisé sur ce serveur ?
 *
 * Toujours vrai hors production (dev, test, démonstration). En production,
 * seulement si l'agence a explicitement demandé la démo
 * (`PAYMENT_GATEWAY_SIMULATOR=1`).
 */
export const paymentGatewaySimulatorAvailable = !isProduction || env.PAYMENT_GATEWAY_SIMULATOR === '1';

/**
 * Le simulateur de l'inventaire par WhatsApp est-il disponible (spec 041,
 * W13-R1) ? Seulement avec le transport `log`, et seulement si NODE_ENV vaut
 * explicitement 'development' ou 'test' (valeur brute) ou avec
 * `WHATSAPP_INVENTORY_SIMULATOR=1` (écart E1, refusé par deploy.sh sur la
 * production).
 */
export const whatsappInventorySimulatorAvailable =
  env.WHATSAPP_INVENTORY_TRANSPORT === 'log' &&
  (fakeProviderAllowed(process.env.NODE_ENV) || env.WHATSAPP_INVENTORY_SIMULATOR === '1');
