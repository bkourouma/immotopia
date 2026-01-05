import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

/**
 * Hash password using bcrypt
 * @param password - Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare plain password with hashed password
 * @param password - Plain text password
 * @param hash - Hashed password
 * @returns True if passwords match, false otherwise
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password strength
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 * @param password - Password to validate
 * @returns Object with isValid boolean and error message if invalid
 */
export function validatePasswordStrength(password: string): { isValid: boolean; error?: string } {
  if (password.length < 8) {
    return {
      isValid: false,
      error: 'Le mot de passe doit contenir au moins 8 caractères'
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      isValid: false,
      error: 'Le mot de passe doit contenir au moins une majuscule'
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      isValid: false,
      error: 'Le mot de passe doit contenir au moins une minuscule'
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      isValid: false,
      error: 'Le mot de passe doit contenir au moins un chiffre'
    };
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return {
      isValid: false,
      error: 'Le mot de passe doit contenir au moins un caractère spécial'
    };
  }

  return { isValid: true };
}
