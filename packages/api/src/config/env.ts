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
  'secret'
]);

const MIN_SECRET_LENGTH = 32;

/**
 * Le faux fournisseur d'ImmoCopilot (`AI_PROVIDER=fake`) répond sans clé ni
 * contrôle : réservé aux postes de développement et aux tests. NODE_ENV vaut
 * 'development' quand il est absent ; c'est donc la variable BRUTE qui est
 * examinée : un déploiement qui oublie NODE_ENV ne peut pas activer `fake`.
 */
function fakeProviderAllowed(rawNodeEnv: string | undefined): boolean {
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

    // Prisma tenant guard (utils/prisma-tenant-guard-extension.ts).
    // `warn` logs unscoped queries on tenant-owned models without blocking
    // them; `enforce` throws. See env.example for the warn → enforce sequence.
    TENANT_GUARD_MODE: z.enum(['off', 'warn', 'enforce']).default('warn'),

    // Abonnements par packs (lib/subscription, docs/architecture/PLAN-ABONNEMENTS.md).
    // `off` : droits calcules mais jamais appliques ; `warn` : modules,
    // lecture seule et quotas journalises sans bloquer ; `enforce` : appliques.
    SUBSCRIPTION_ENFORCEMENT: z.enum(['off', 'warn', 'enforce']).default('warn'),

    // ImmoCopilot (lib/ai, docs/architecture/PLAN_IMMOCOPILOT.md).
    // `disabled` : l'assistant est coupe et l'application marche sans cle.
    // Aucun secret par defaut : ANTHROPIC_API_KEY est exigee si `anthropic`.
    AI_PROVIDER: z.enum(['disabled', 'fake', 'anthropic']).default('disabled'),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    AI_MODEL: z.string().min(1).default('claude-opus-5-5'),
    AI_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1024).max(64000).default(16000),
    AI_MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(8).default(4),
    AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    AI_PROPOSAL_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    AI_REFUSAL_FALLBACK: z.enum(['on', 'off']).default('on'),
    // Plafonds PAR AGENCE (tous collaborateurs confondus) sur POST /ai/chat, en
    // plus des limites par utilisateur (rate-limit-middleware.ts).
    AI_TENANT_MINUTE_LIMIT: z.coerce.number().int().min(1).max(100000).default(100),
    AI_TENANT_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000000).default(3000)
  })
  // Unknown keys are preserved: many optional integrations still read
  // process.env directly (WhatsApp, SMTP, Twilio).
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.AI_PROVIDER === 'anthropic' && !value.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ANTHROPIC_API_KEY'],
        message: 'variable requise quand AI_PROVIDER=anthropic'
      });
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
