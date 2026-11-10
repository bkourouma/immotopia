import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { getEmailVerificationTemplate, getPasswordResetTemplate } from './email-templates';
import { logger } from './logger';

// Email configuration from environment variables (via config/env.ts)
const EMAIL_FROM = env.EMAIL_FROM || 'noreply@immotopia.com';
const EMAIL_SERVICE_TYPE = env.EMAIL_SERVICE_TYPE || 'smtp';
const FRONTEND_URL = env.FRONTEND_URL || 'http://localhost:3000';

/** Longueurs maximales (RFC 5321) d'une adresse et de sa partie locale. */
const MAX_ADDRESS_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
// Un seul destinataire par champ : ni espace, ni virgule/point-virgule, ni chevrons, guillemets, parentheses.
const SIMPLE_ADDRESS = /^[^\s@<>(),;:\\"]+@[^\s@<>(),;:\\"]+\.[^\s@<>(),;:\\"]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
// Idem sans la tabulation (u0009) : celle-ci est traitée à part (bords tolérés, interne refusée par SIMPLE_ADDRESS).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_NO_TAB = /[\u0000-\u0008\u000a-\u001f\u007f]/;

/**
 * Adresse destinataire sure a transmettre a nodemailer (FRI-08) : une seule
 * adresse simple, sans retour ligne ni caractere de controle (injection
 * d'en-tetes), sans liste ni forme « Nom <adresse> ».
 */
export function isSafeEmailAddress(address: unknown): address is string {
  if (typeof address !== 'string') return false;
  // Les espaces et tabulations de BORD sont tolérés (copier-coller), mais
  // l'adresse à transmettre est alors `normalizeRecipientAddress(address)`
  // (version rognée), jamais la valeur brute. Tout autre caractère de contrôle
  // (CR, LF, NUL…) est rejeté AVANT le rognage, au bord comme à l'intérieur :
  // « a@b.com\r\n » est refusée. Une tabulation ou un espace INTERNE reste
  // refusé par SIMPLE_ADDRESS (« a@\tb.com »).
  const edgeTrimmed = address.replace(/^[ \t]+|[ \t]+$/g, '');
  if (edgeTrimmed.length === 0 || edgeTrimmed.length > MAX_ADDRESS_LENGTH) return false;
  if (CONTROL_CHARS_NO_TAB.test(edgeTrimmed)) return false;
  if (!SIMPLE_ADDRESS.test(edgeTrimmed)) return false;
  const at = edgeTrimmed.lastIndexOf('@');
  return at > 0 && at <= MAX_LOCAL_PART_LENGTH;
}

/** Version à transmettre au transport : espaces/tabulations de bord retirés. */
export function normalizeRecipientAddress(address: string): string {
  return address.replace(/^[ \t]+|[ \t]+$/g, '');
}

/** Masque la partie locale pour les journaux (`j***@domaine`). */
export function maskEmailForLog(address: unknown): string {
  const value = String(address ?? '')
    .replace(CONTROL_CHARS, '')
    .slice(0, MAX_ADDRESS_LENGTH);
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return '***';
  return `${value.slice(0, 1)}***${value.slice(at)}`;
}

/**
 * Ne garde que les adresses sures (une chaine ou un tableau). Les adresses
 * rejetees sont journalisees (partie locale masquee), sans jamais lever.
 */
export function sanitizeRecipients(input: string | readonly string[] | null | undefined): string[] {
  if (input === null || input === undefined) return [];
  const list = typeof input === 'string' ? [input] : Array.from(input);
  const safe: string[] = [];
  for (const candidate of list) {
    if (isSafeEmailAddress(candidate)) {
      safe.push(normalizeRecipientAddress(candidate));
    } else {
      logger.warn('Adresse destinataire rejetee (format invalide)', { address: maskEmailForLog(candidate) });
    }
  }
  return safe;
}

// Create email transporter based on environment (lazily: importer ce module ne cree aucun transport)
let transporter: Transporter | undefined;

function createEmailTransporter(): Transporter {
  if (EMAIL_SERVICE_TYPE === 'smtp') {
    // SMTP configuration (for development with Mailtrap or production SMTP)
    return nodemailer.createTransport({
      host: env.EMAIL_SMTP_HOST || 'smtp.mailtrap.io',
      port: env.EMAIL_SMTP_PORT ?? 2525,
      secure: false, // true for 465, false for other ports
      auth: {
        user: env.EMAIL_SMTP_USER,
        pass: env.EMAIL_SMTP_PASS
      }
    });
  }
  if (EMAIL_SERVICE_TYPE === 'sendgrid') {
    // SendGrid configuration
    return nodemailer.createTransport({
      service: 'SendGrid',
      auth: {
        user: 'apikey',
        pass: env.EMAIL_SERVICE_API_KEY
      }
    });
  }
  // AWS SES (requires @aws-sdk/client-ses) : pour l'instant, repli SMTP.
  // TODO: Implement AWS SES transport when needed
  // Default: SMTP
  return nodemailer.createTransport({
    host: env.EMAIL_SMTP_HOST || 'localhost',
    port: env.EMAIL_SMTP_PORT ?? 587,
    secure: false,
    auth: {
      user: env.EMAIL_SMTP_USER,
      pass: env.EMAIL_SMTP_PASS
    }
  });
}

function getTransporter(): Transporter {
  if (!transporter) transporter = createEmailTransporter();
  return transporter;
}

/**
 * Send email verification email
 * @param to - Recipient email address
 * @param userName - User's full name
 * @param token - Verification token
 * @returns Promise resolving to message info
 */
export async function sendVerificationEmail(to: string, userName: string, token: string): Promise<boolean> {
  const verificationUrl = `${FRONTEND_URL}/verify-email?token=${token}`;
  const html = getEmailVerificationTemplate(verificationUrl, userName);

  const [recipient] = sanitizeRecipients(to);
  if (!recipient) return false;

  try {
    await getTransporter().sendMail({
      from: EMAIL_FROM,
      to: recipient,
      subject: 'Vérification de votre adresse email - ImmoTopia',
      html
    });
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error("Erreur lors de l'envoi de l'email de vérification");
  }
}

/**
 * Send password reset email
 * @param to - Recipient email address
 * @param userName - User's full name
 * @param token - Password reset token
 * @returns Promise resolving to message info
 */
export async function sendPasswordResetEmail(to: string, userName: string, token: string): Promise<boolean> {
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;
  const html = getPasswordResetTemplate(resetUrl, userName);

  const [recipient] = sanitizeRecipients(to);
  if (!recipient) return false;

  try {
    await getTransporter().sendMail({
      from: EMAIL_FROM,
      to: recipient,
      subject: 'Réinitialisation de votre mot de passe - ImmoTopia',
      html
    });
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error("Erreur lors de l'envoi de l'email de réinitialisation");
  }
}

/**
 * Verify email transporter configuration
 * @returns Promise resolving to true if configuration is valid
 */
export async function verifyEmailConfig(): Promise<boolean> {
  try {
    await getTransporter().verify();
    return true;
  } catch (error) {
    console.error('Email transporter verification failed:', error);
    return false;
  }
}
