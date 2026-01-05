import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

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
 * Sanitize request body
 * @param body - Request body object
 * @returns Sanitized body
 */
function sanitizeBody(body: any): any {
  if (typeof body === 'string') {
    return sanitizeString(body);
  }
  if (Array.isArray(body)) {
    return body.map(sanitizeBody);
  }
  if (body && typeof body === 'object') {
    const sanitized: any = {};
    for (const key in body) {
      if (typeof body[key] === 'string') {
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
      .trim(),
    role: z.enum(['STUDENT', 'INSTRUCTOR']).optional().default('STUDENT')
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
 */
export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Sanitize input before validation
      req.body = sanitizeBody(req.body);

      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));

        res.status(400).json({
          success: false,
          message: 'Les données fournies sont invalides.',
          errors
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Une erreur est survenue lors de la validation.'
        });
      }
    }
  };
}
