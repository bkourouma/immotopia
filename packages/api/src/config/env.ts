import 'dotenv/config';
import { z } from 'zod';

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

    // Prisma tenant guard (utils/prisma-tenant-guard-extension.ts).
    // `warn` logs unscoped queries on tenant-owned models without blocking
    // them; `enforce` throws. See env.example for the warn → enforce sequence.
    TENANT_GUARD_MODE: z.enum(['off', 'warn', 'enforce']).default('warn'),

    // Abonnements par packs (lib/subscription, docs/architecture/PLAN-ABONNEMENTS.md).
    // `off` : droits calcules mais jamais appliques ; `warn` : modules,
    // lecture seule et quotas journalises sans bloquer ; `enforce` : appliques.
    SUBSCRIPTION_ENFORCEMENT: z.enum(['off', 'warn', 'enforce']).default('warn')
  })
  // Unknown keys are preserved: many optional integrations still read
  // process.env directly (WhatsApp, SMTP, Twilio).
  .passthrough();

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
