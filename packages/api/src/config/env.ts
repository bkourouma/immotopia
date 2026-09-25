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

    // Prisma tenant guard (utils/prisma-tenant-guard-extension.ts).
    // `warn` logs unscoped queries on tenant-owned models without blocking
    // them; `enforce` throws. See env.example for the warn → enforce sequence.
    TENANT_GUARD_MODE: z.enum(['off', 'warn', 'enforce']).default('warn')
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
