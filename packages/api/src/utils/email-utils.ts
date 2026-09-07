import nodemailer, { Transporter } from 'nodemailer';
import { getEmailVerificationTemplate, getPasswordResetTemplate } from './email-templates';

// Email configuration from environment variables
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@immotopia.com';
const EMAIL_SERVICE_TYPE = process.env.EMAIL_SERVICE_TYPE || 'smtp';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Create email transporter based on environment
let transporter: Transporter;

if (EMAIL_SERVICE_TYPE === 'smtp') {
  // SMTP configuration (for development with Mailtrap or production SMTP)
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.EMAIL_SMTP_PORT || '2525', 10),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_SMTP_USER,
      pass: process.env.EMAIL_SMTP_PASS
    }
  });
} else if (EMAIL_SERVICE_TYPE === 'sendgrid') {
  // SendGrid configuration
  transporter = nodemailer.createTransport({
    service: 'SendGrid',
    auth: {
      user: 'apikey',
      pass: process.env.EMAIL_SERVICE_API_KEY
    }
  });
} else if (EMAIL_SERVICE_TYPE === 'ses') {
  // AWS SES configuration (requires @aws-sdk/client-ses and aws-sdk packages)
  // For now, use SMTP as fallback
  // TODO: Implement AWS SES transport when needed
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || 'localhost',
    port: parseInt(process.env.EMAIL_SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.EMAIL_SMTP_USER,
      pass: process.env.EMAIL_SMTP_PASS
    }
  });
} else {
  // Default: SMTP
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || 'localhost',
    port: parseInt(process.env.EMAIL_SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.EMAIL_SMTP_USER,
      pass: process.env.EMAIL_SMTP_PASS
    }
  });
}

/**
 * Send email verification email
 * @param to - Recipient email address
 * @param userName - User's full name
 * @param token - Verification token
 * @returns Promise resolving to message info
 */
export async function sendVerificationEmail(to: string, userName: string, token: string): Promise<void> {
  const verificationUrl = `${FRONTEND_URL}/verify-email?token=${token}`;
  const html = getEmailVerificationTemplate(verificationUrl, userName);

  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject: 'Vérification de votre adresse email - ImmoTopia',
      html
    });
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
export async function sendPasswordResetEmail(to: string, userName: string, token: string): Promise<void> {
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;
  const html = getPasswordResetTemplate(resetUrl, userName);

  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject: 'Réinitialisation de votre mot de passe - ImmoTopia',
      html
    });
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
    await transporter.verify();
    return true;
  } catch (error) {
    console.error('Email transporter verification failed:', error);
    return false;
  }
}
