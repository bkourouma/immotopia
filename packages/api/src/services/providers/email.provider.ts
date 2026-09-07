/**
 * Email provider for communication module – SendGrid or Nodemailer.
 * configure, send, sendWithTemplate, handleWebhook.
 * @see specs/010-communication-module/plan.md
 */
import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../../utils/logger';

export interface EmailSendOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
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
  const provider = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();

  try {
    if (provider === 'sendgrid' && process.env.SENDGRID_API_KEY) {
      transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY
        }
      });
    } else {
      // Align with EmailService defaults (e.g. Hostinger: 465, secure) so same .env works for Communication and email-notifications
      const port = parseInt(process.env.EMAIL_SMTP_PORT || '465', 10);
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_SMTP_HOST || 'smtp.hostinger.com',
        port,
        secure: port === 465 || process.env.EMAIL_SMTP_SECURE === 'true',
        auth: process.env.EMAIL_SMTP_USER
          ? { user: process.env.EMAIL_SMTP_USER, pass: process.env.EMAIL_SMTP_PASS }
          : undefined
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
export async function sendEmail(options: EmailSendOptions): Promise<{ messageId?: string }> {
  const transport = configureEmailProvider();
  if (!transport) {
    throw new Error('Email provider not configured');
  }
  const from = process.env.SENDGRID_FROM_NAME
    ? `"${process.env.SENDGRID_FROM_NAME}" <${process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM}>`
    : process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM || 'noreply@example.com';
  const info = await transport.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    replyTo: options.replyTo
  });
  return { messageId: info.messageId };
}

/**
 * Send email using a pre-rendered HTML body (template already resolved).
 */
export async function sendWithTemplate(options: EmailTemplateOptions): Promise<{ messageId?: string }> {
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
