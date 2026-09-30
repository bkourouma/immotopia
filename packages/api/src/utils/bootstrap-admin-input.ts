/**
 * Validation pure des saisies du premier compte SUPER_ADMIN
 * (prisma/seeds/create-platform-super-admin.ts, lancé par infra/scripts/bootstrap.sh).
 *
 * Aucune entrée/sortie ici : uniquement des fonctions testables. Aucun message
 * d'erreur ne contient jamais le mot de passe.
 */
import { z } from 'zod';
import { validatePasswordStrength } from './password-utils';

export class BootstrapInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapInputError';
  }
}

export const BOOTSTRAP_MIN_PASSWORD_LENGTH = 12;
export const BOOTSTRAP_MAX_PASSWORD_LENGTH = 72; // limite de bcrypt (octets)
export const DEFAULT_ADMIN_NAME = 'Super Administrateur';
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 120;

// Même validation que la connexion (loginSchema, middleware/validation-middleware.ts).
const LOGIN_EMAIL_SCHEMA = z.string().email().toLowerCase().trim();

/**
 * Reproduit EXACTEMENT `sanitizeString` de middleware/validation-middleware.ts, que
 * `validate(loginSchema)` applique à tout le corps de POST /auth/login, mot de passe
 * compris. À GARDER IDENTIQUE : le test bootstrap-admin-input.test.ts exécute le vrai
 * middleware et échoue si les deux divergent. Un mot de passe ou un e-mail que cette
 * fonction modifie produirait un compte qui ne pourrait jamais se connecter.
 */
export function sanitizeLikeLogin(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
}

/** Retire les espaces autour et met en minuscules (la connexion compare en exact sur la saisie en minuscules). */
export function normalizeAdminEmail(raw: string): string {
  if (typeof raw !== 'string') {
    throw new BootstrapInputError("L'adresse e-mail est obligatoire.");
  }
  const email = raw.trim().toLowerCase();
  if (email.length === 0) {
    throw new BootstrapInputError("L'adresse e-mail est obligatoire.");
  }
  if (email.length > MAX_EMAIL_LENGTH || sanitizeLikeLogin(email) !== email) {
    throw new BootstrapInputError("L'adresse e-mail n'a pas un format valide.");
  }
  const parsed = LOGIN_EMAIL_SCHEMA.safeParse(email);
  if (!parsed.success || parsed.data !== email) {
    throw new BootstrapInputError("L'adresse e-mail n'a pas un format valide.");
  }
  return email;
}

/** Au moins 12 caractères, puis les règles de robustesse de la plateforme. Ne renvoie jamais le mot de passe. */
export function validateBootstrapPassword(password: string): void {
  if (typeof password !== 'string' || password.length === 0) {
    throw new BootstrapInputError('Le mot de passe est obligatoire.');
  }
  if (password.length < BOOTSTRAP_MIN_PASSWORD_LENGTH) {
    throw new BootstrapInputError(
      `Le mot de passe doit contenir au moins ${BOOTSTRAP_MIN_PASSWORD_LENGTH} caractères.`
    );
  }
  if (Buffer.byteLength(password, 'utf8') > BOOTSTRAP_MAX_PASSWORD_LENGTH) {
    throw new BootstrapInputError(`Le mot de passe est trop long (${BOOTSTRAP_MAX_PASSWORD_LENGTH} octets au plus).`);
  }
  if (sanitizeLikeLogin(password) !== password) {
    throw new BootstrapInputError(
      'Le mot de passe contient des caractères que la connexion retire (< >, javascript:, motif onxxx=, espaces en début ou fin) : choisir un autre mot de passe.'
    );
  }
  const strength = validatePasswordStrength(password);
  if (!strength.isValid) {
    throw new BootstrapInputError(strength.error ?? 'Le mot de passe est trop faible.');
  }
}

/**
 * Contenu lu sur l'entrée standard : retire uniquement les retours à la ligne
 * FINAUX (`\n` ou `\r\n`), jamais les espaces, qui peuvent faire partie du mot de passe.
 */
export function readPasswordFromStdinContent(raw: string): string {
  if (typeof raw !== 'string') {
    throw new BootstrapInputError("Aucun mot de passe reçu sur l'entrée standard.");
  }
  const password = raw.replace(/(\r?\n)+$/, '');
  if (password.length === 0) {
    throw new BootstrapInputError("Aucun mot de passe reçu sur l'entrée standard.");
  }
  return password;
}

/** Nom affiché : espaces normalisés, valeur par défaut si vide. */
export function normalizeAdminName(raw: string | undefined | null): string {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (name.length === 0) return DEFAULT_ADMIN_NAME;
  if (name.length > MAX_NAME_LENGTH) {
    throw new BootstrapInputError(`Le nom est trop long (${MAX_NAME_LENGTH} caractères au plus).`);
  }
  return name;
}
