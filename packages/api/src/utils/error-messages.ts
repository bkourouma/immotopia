/**
 * French error messages for all error scenarios
 * Centralized error messages for consistency
 */

export const ErrorMessages = {
  // Authentication errors
  AUTH_REQUIRED: 'Authentification requise.',
  AUTH_INVALID_TOKEN: 'Token invalide ou expiré. Veuillez vous reconnecter.',
  AUTH_MISSING_TOKEN: "Token d'accès manquant. Veuillez vous connecter.",
  AUTH_INVALID_CREDENTIALS: 'Email ou mot de passe incorrect.',
  AUTH_ACCOUNT_LOCKED: 'Trop de tentatives de connexion. Votre compte est temporairement bloqué.',
  AUTH_ACCOUNT_DISABLED: "Votre compte a été désactivé. Contactez l'administrateur.",
  AUTH_EMAIL_NOT_VERIFIED: 'Veuillez vérifier votre adresse email avant de vous connecter.',

  // Registration errors
  REG_EMAIL_EXISTS: 'Cette adresse email est déjà utilisée.',
  REG_INVALID_PASSWORD: 'Le mot de passe ne respecte pas les critères de sécurité.',
  REG_PASSWORDS_DONT_MATCH: 'Les mots de passe ne correspondent pas.',

  // Validation errors
  VALIDATION_REQUIRED: 'Ce champ est requis.',
  VALIDATION_INVALID_EMAIL: 'Veuillez entrer une adresse email valide.',
  VALIDATION_INVALID_FORMAT: 'Le format fourni est invalide.',

  // Token errors
  TOKEN_INVALID: 'Token invalide ou expiré.',
  TOKEN_EXPIRED: 'Token expiré. Veuillez faire une nouvelle demande.',
  TOKEN_MISSING: 'Token manquant.',
  TOKEN_ALREADY_USED: 'Ce token a déjà été utilisé.',

  // Password reset errors
  PASSWORD_RESET_INVALID_TOKEN: 'Token de réinitialisation invalide ou expiré. Veuillez faire une nouvelle demande.',
  PASSWORD_RESET_EXPIRED: 'Le lien de réinitialisation a expiré. Veuillez faire une nouvelle demande.',

  // Email verification errors
  EMAIL_VERIFICATION_INVALID_TOKEN: 'Token de vérification invalide ou expiré.',
  EMAIL_VERIFICATION_ALREADY_VERIFIED: 'Cette adresse email est déjà vérifiée.',

  // User errors
  USER_NOT_FOUND: 'Utilisateur introuvable.',
  USER_ALREADY_EXISTS: 'Cet utilisateur existe déjà.',

  // General errors
  INTERNAL_ERROR: 'Une erreur est survenue. Veuillez réessayer plus tard.',
  NOT_FOUND: 'Ressource non trouvée.',
  FORBIDDEN: 'Accès refusé. Permissions insuffisantes.',
  RATE_LIMIT_EXCEEDED: 'Trop de tentatives. Veuillez réessayer dans quelques instants.',

  // Database errors
  DATABASE_ERROR: 'Erreur de base de données. Veuillez réessayer plus tard.',
  DATABASE_CONNECTION_ERROR: 'Impossible de se connecter à la base de données.'
};

/**
 * Get error message by key
 * @param key - Error message key
 * @returns Error message in French
 */
export function getErrorMessage(key: keyof typeof ErrorMessages): string {
  return ErrorMessages[key] || ErrorMessages.INTERNAL_ERROR;
}
