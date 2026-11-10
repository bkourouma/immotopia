/**
 * Email provider for communication module – SendGrid or Nodemailer.
 * configure, send, sendWithTemplate, handleWebhook.
 * @see specs/010-communication-module/plan.md
 */
import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { isSafeEmailAddress, maskEmailForLog, normalizeRecipientAddress } from '../../utils/email-utils';

export interface EmailSendOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

/** Résultat explicite d'un envoi : `sent: false` + `reason` quand rien n'est parti. */
export interface EmailProviderResult {
  sent: boolean;
  reason?: 'INVALID_RECIPIENT';
  messageId?: string;
}

export interface EmailTemplateOptions {
  to: string;
  templateId?: string;
  subject: string;
  html: string;
  variables?: Record<string, string>;
}

let transporter: Transporter | null = null;

/**
 * Configure transporter from env (EMAIL_PROVIDER, SENDGRID_*, SMTP).
 */
export function configureEmailProvider(): Transporter | null {
  if (transporter) return transporter;
  const provider = (env.EMAIL_PROVIDER || 'smtp').toLowerCase();

  try {
    if (provider === 'sendgrid' && env.SENDGRID_API_KEY) {
      transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: env.SENDGRID_API_KEY
        }
      });
    } else {
      // Align with EmailService defaults (e.g. Hostinger: 465, secure) so same .env works for Communication and email-notifications
      const port = env.EMAIL_SMTP_PORT ?? 465;
      transporter = nodemailer.createTransport({
        host: env.EMAIL_SMTP_HOST || 'smtp.hostinger.com',
        port,
        secure: port === 465 || env.EMAIL_SMTP_SECURE,
        auth: env.EMAIL_SMTP_USER ? { user: env.EMAIL_SMTP_USER, pass: env.EMAIL_SMTP_PASS } : undefined
      });
    }
    logger.info('Email provider configured', { provider });
    return transporter;
  } catch (e) {
    logger.warn('Email provider not configured', { error: e });
    return null;
  }
}

/**
 * Send a single email.
 */
export async function sendEmail(options: EmailSendOptions): Promise<EmailProviderResult> {
  // FRI-08 : adresse invalide => aucun envoi, sans lever, résultat explicite.
  if (!isSafeEmailAddress(options.to)) {
    logger.warn('Email rejete : destinataire invalide', { to: maskEmailForLog(options.to) });
    return { sent: false, reason: 'INVALID_RECIPIENT' };
  }
  const to = normalizeRecipientAddress(options.to);
  let replyTo = options.replyTo;
  if (replyTo !== undefined && !isSafeEmailAddress(replyTo)) {
    logger.warn('Email : replyTo invalide ignore', { replyTo: maskEmailForLog(replyTo) });
    replyTo = undefined;
  } else if (replyTo !== undefined) {
    replyTo = normalizeRecipientAddress(replyTo);
  }
  const transport = configureEmailProvider();
  if (!transport) {
    throw new Error('Email provider not configured');
  }
  const from = env.SENDGRID_FROM_NAME
    ? `"${env.SENDGRID_FROM_NAME}" <${env.SENDGRID_FROM_EMAIL || env.EMAIL_FROM}>`
    : env.SENDGRID_FROM_EMAIL || env.EMAIL_FROM || 'noreply@example.com';
  const info = await transport.sendMail({
    from,
    to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    replyTo
  });
  return { sent: true, messageId: info.messageId };
}

/**
 * Send email using a pre-rendered HTML body (template already resolved).
 */
export async function sendWithTemplate(options: EmailTemplateOptions): Promise<EmailProviderResult> {
  return sendEmail({
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.html.replace(/<[^>]*>/g, ' ')
  });
}

/**
 * Handle inbound webhook from provider (e.g. delivery/open events). No-op by default.
 */
export function handleWebhook(payload: unknown): { processed: boolean } {
  logger.debug('Email webhook received', { payload });
  return { processed: true };
}
