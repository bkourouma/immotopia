import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { ValidationError } from './error-middleware';

/**
 * Sanitize string input to prevent XSS
 * @param input - String to sanitize
 * @returns Sanitized string
 */
function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
}

/**
 * Champs secrets que l'assainissement ne touche JAMAIS, à quelque profondeur
 * que ce soit : `password`, `newPassword`, `currentPassword`, `confirmPassword`,
 * `oldPassword`, `passwordConfirmation`, `passwd`, `passphrase`…
 *
 * Un mot de passe n'est ni affiché ni interprété comme du HTML : il est haché.
 * L'« assainir » retirait silencieusement `<`, `>`, les espaces de bord,
 * `javascript:` ou un motif `onxxx=` (« Bonjour=2024! » perdait « onjour= »),
 * si bien que le hash enregistré ne correspondait plus à ce que la personne
 * avait tapé — et qu'un compte créé par une invitation (qui ne passe pas par
 * ce middleware) ne pouvait plus se connecter dès que son mot de passe
 * contenait l'un de ces caractères.
 */
const SECRET_FIELD_PATTERN = /passw(or)?d|passphrase/i;

export function isPasswordField(key: string): boolean {
  return SECRET_FIELD_PATTERN.test(key);
}

/**
 * Forme qu'un mot de passe prenait AVANT que `sanitizeBody` ne les épargne.
 *
 * Les comptes inscrits ou réinitialisés avant ce correctif ont un hash calculé
 * sur cette forme : `loginUser` la compare en second recours pour ne pas les
 * enfermer dehors. Ne pas utiliser ailleurs.
 */
export function legacySanitizedPassword(password: string): string {
  return sanitizeString(password);
}

/**
 * Sanitize request body
 * @param body - Request body object
 * @returns Sanitized body (les champs mot de passe sont recopiés tels quels)
 */
export function sanitizeBody(body: any): any {
  if (typeof body === 'string') {
    return sanitizeString(body);
  }
  if (Array.isArray(body)) {
    return body.map(sanitizeBody);
  }
  if (body && typeof body === 'object') {
    const sanitized: any = {};
    for (const key in body) {
      if (isPasswordField(key)) {
        sanitized[key] = body[key];
      } else if (typeof body[key] === 'string') {
        sanitized[key] = sanitizeString(body[key]);
      } else {
        sanitized[key] = sanitizeBody(body[key]);
      }
    }
    return sanitized;
  }
  return body;
}

// Register request schema
export const registerSchema = z
  .object({
    email: z.string().email('Veuillez entrer une adresse email valide').toLowerCase().trim(),
    password: z.string().min(1, 'Le mot de passe est requis'),
    confirmPassword: z.string().min(1, 'La confirmation du mot de passe est requise'),
    fullName: z
      .string()
      .min(1, 'Le nom complet est requis')
      .max(100, 'Le nom complet ne peut pas dépasser 100 caractères')
      .trim()
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword']
  });

// Login request schema
export const loginSchema = z.object({
  email: z.string().email('Veuillez entrer une adresse email valide').toLowerCase().trim(),
  password: z.string().min(1, 'Le mot de passe est requis')
});

// Forgot password request schema
export const forgotPasswordSchema = z.object({
  email: z.string().email('Veuillez entrer une adresse email valide').toLowerCase().trim()
});

// Reset password request schema
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Le token est requis'),
    newPassword: z.string().min(1, 'Le nouveau mot de passe est requis'),
    confirmPassword: z.string().min(1, 'La confirmation du mot de passe est requise')
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword']
  });

// Email verification request schema
export const emailVerificationSchema = z.object({
  token: z.string().min(1, 'Le token est requis')
});

// Resend verification request schema
export const resendVerificationSchema = z.object({
  email: z.string().email('Veuillez entrer une adresse email valide').toLowerCase().trim()
});

/**
 * Validation middleware factory
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 *
 * Ne construit jamais la réponse elle-même : une erreur de validation part en
 * `next(...)` vers `errorHandler` (`middleware/error-middleware.ts`), seul
 * endroit où un message est traduit (`t()`). Cette fonction construisait
 * jusqu'ici sa propre réponse JSON avec un message français codé en dur,
 * jamais passé par `t()` — donc jamais traduit, contrairement à toute autre
 * erreur `VALIDATION_ERROR` de l'API, qui suit la langue de la requête.
 */
export function validate(schema: z.ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Sanitize input before validation
      req.body = sanitizeBody(req.body);

      // Keep parsed result so zod transforms (trim, toLowerCase, defaults) are applied.
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));

        next(new ValidationError('Les données fournies sont invalides.', errors));
      } else {
        next(error);
      }
    }
  };
}
