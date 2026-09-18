import nodemailer, { Transporter } from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

/**
 * Base URL for frontend links (reset password, verify, etc.)
 * Use FRONTEND_URL or CLIENT_URL - in production set to your app domain
 */
function getBaseUrl(): string {
  return process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Overrides for notification email subject/body; supports placeholders {{variableName}}. */
export type TemplateOverrides = { subject?: string | null; bodyHtml?: string | null };

/** Replace {{key}} in template with vars; when escapeValues is true, values are HTML-escaped (for body). */
function applyTemplate(tpl: string, vars: Record<string, string>, escapeValues = false): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = String(vars[key] ?? '');
    return escapeValues ? escapeHtml(v) : v;
  });
}

/**
 * Normalize email for SMTP: remove accents from local part to avoid "553 Must declare SMTPUTF8"
 * when the server requires SMTPUTF8 but doesn't advertise it correctly.
 * Domain is left as-is (already ASCII or punycode).
 */
function normalizeEmailForSmtp(email: string): string {
  const trimmed = String(email).trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return trimmed;
  const local = trimmed
    .slice(0, at)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const domain = trimmed.slice(at + 1);
  return `${local}@${domain}`;
}

/**
 * True when the process can actually deliver mail.
 *
 * Login currently blocks unverified accounts and "resends" a link. If SMTP /
 * the API key are empty, that mail never leaves the server and the user is
 * stuck. Callers should skip the verification gate in that case.
 */
export function isEmailDeliveryConfigured(): boolean {
  const type = (process.env.EMAIL_SERVICE_TYPE || '').trim().toLowerCase();
  const apiKey = (process.env.EMAIL_SERVICE_API_KEY || '').trim();
  if (type === 'sendgrid' || type === 'ses') {
    return apiKey.length > 0;
  }
  const user = (process.env.EMAIL_SMTP_USER || '').trim();
  const pass = (process.env.EMAIL_SMTP_PASS || '').trim();
  return user.length > 0 && pass.length > 0;
}

export class EmailService {
  private transporter: Transporter;

  constructor() {
    // SMTP: configure via variables d'environnement (voir env.example ou docs/ENV-SMTP-CONFIG.md)
    const EMAIL_SMTP_HOST = process.env.EMAIL_SMTP_HOST || 'smtp.hostinger.com';
    const EMAIL_SMTP_PORT = parseInt(process.env.EMAIL_SMTP_PORT || '465', 10);
    const EMAIL_SMTP_USER = process.env.EMAIL_SMTP_USER || '';
    const EMAIL_SMTP_PASS = process.env.EMAIL_SMTP_PASS || '';

    // Port 465 requires secure: true
    this.transporter = nodemailer.createTransport({
      host: EMAIL_SMTP_HOST,
      port: EMAIL_SMTP_PORT,
      secure: EMAIL_SMTP_PORT === 465,
      auth: EMAIL_SMTP_USER && EMAIL_SMTP_PASS ? { user: EMAIL_SMTP_USER, pass: EMAIL_SMTP_PASS } : undefined
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    // Skip during Jest/automated tests unless ENABLE_EMAILS=1 (for manual testing)
    const forceSend = ['1', 'true'].includes(String(process.env.ENABLE_EMAILS || '').toLowerCase());
    if (process.env.NODE_ENV === 'test' && !forceSend) {
      console.log('[EmailService] Skipped (NODE_ENV=test):', options.subject, '→', options.to);
      return;
    }

    const EMAIL_FROM = process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER || 'noreply@localhost';

    try {
      const toAddress = normalizeEmailForSmtp(options.to);
      const info = await this.transporter.sendMail({
        from: `"ImmoTopia" <${EMAIL_FROM}>`,
        to: toAddress,
        subject: options.subject,
        text: options.text,
        html: options.html
      });
      console.log('Email sent successfully:', {
        messageId: info.messageId,
        to: options.to,
        subject: options.subject
      });
    } catch (error) {
      console.error('Error sending email:', error);
      // Re-throw error so calling code can handle it appropriately
      throw error;
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${getBaseUrl()}/verify-email?token=${token}`;
    await this.sendEmail({
      to,
      subject: 'Verify your email',
      html: `
        <h1>Welcome to Immobillier</h1>
        <p>Please click the link below to verify your email address:</p>
        <a href="${link}">${link}</a>
      `
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = `${getBaseUrl()}/reset-password?token=${token}`;
    await this.sendEmail({
      to,
      subject: 'Reset your password',
      html: `
        <h1>Password Reset</h1>
        <p>You requested a password reset. Click the link below to set a new password:</p>
        <a href="${link}">${link}</a>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });
  }

  async sendInviteEmail(
    to: string,
    token: string,
    tenantName: string,
    roleLabels: string[],
    expiresAt: Date
  ): Promise<void> {
    const { getInvitationTemplate } = await import('../utils/email-templates');
    const link = `${getBaseUrl()}/auth/accept-invite?token=${token}`;
    await this.sendEmail({
      to,
      subject: `Invitation à rejoindre ${tenantName} sur ImmoTopia`,
      html: getInvitationTemplate(link, tenantName, roleLabels, expiresAt)
    });
  }

  async sendAccountCreationEmail(
    to: string,
    userName: string,
    passwordResetToken: string,
    tenantName: string,
    leaseNumber: string,
    propertyAddress: string | null,
    clientType: 'RENTER' | 'OWNER'
  ): Promise<void> {
    const { getAccountCreationTemplate } = await import('../utils/email-templates');
    const resetUrl = `${getBaseUrl()}/reset-password?token=${passwordResetToken}`;
    const html = getAccountCreationTemplate(
      resetUrl,
      userName || 'Utilisateur',
      tenantName,
      leaseNumber,
      propertyAddress,
      clientType
    );

    const accountType = clientType === 'RENTER' ? 'locataire' : 'propriétaire';
    const textFallback = `Bonjour ${userName || 'Utilisateur'},\n\nUn compte ${accountType} a été créé pour vous sur ImmoTopia par ${tenantName}.\n\nPour activer votre compte et définir votre mot de passe, cliquez sur ce lien (valide 7 jours) :\n${resetUrl}\n\nSi le lien ne fonctionne pas, copiez-collez l'URL dans votre navigateur.`;
    await this.sendEmail({
      to,
      subject: `Votre compte ImmoTopia a été créé - ${tenantName}`,
      text: textFallback,
      html
    });
  }

  /**
   * Notify agency users that a tenant has declared a payment (en dur, like account creation).
   * Full details including Mobile Money (operator, phone, reference), notes.
   * Placeholders for overrides: agencyUserName, declarerName, leaseNumber, leaseLabel, validationUrl, agencyName, amount, paymentDate.
   */
  async sendPaymentDeclarationToAgency(
    to: string,
    agencyUserName: string,
    declarerName: string,
    leaseNumber: string,
    details: import('../utils/payment-email-templates').PaymentDeclarationEmailData,
    options?: {
      leaseLabel?: string;
      validationUrl?: string;
      agencyName?: string;
      templateOverrides?: TemplateOverrides;
    }
  ): Promise<void> {
    const { buildPaymentDetailsCard, emailWrapper } = await import('../utils/payment-email-templates');
    const validationUrl = options?.validationUrl || getBaseUrl();
    const agencyNameVal = options?.agencyName || 'ImmoTopia';
    const vars = {
      agencyUserName: agencyUserName || 'Utilisateur',
      declarerName: declarerName || 'Locataire',
      leaseNumber,
      leaseLabel: options?.leaseLabel || leaseNumber,
      validationUrl,
      agencyName: agencyNameVal,
      amount: new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(details.amount),
      paymentDate: details.paymentDate || ''
    };
    const subject = options?.templateOverrides?.subject
      ? applyTemplate(options.templateOverrides.subject, vars)
      : `Nouvelle déclaration de paiement - Bail ${leaseNumber}`;
    const detailsCard = buildPaymentDetailsCard(details);
    const leaseDisplay = options?.leaseLabel
      ? `${escapeHtml(leaseNumber)} - ${escapeHtml(options.leaseLabel)}`
      : escapeHtml(leaseNumber);
    const agencyLabel = options?.agencyName ? escapeHtml(options.agencyName) : 'ImmoTopia';
    const ctaLink = `<a href="${escapeHtml(validationUrl)}" style="color:#1e40af; font-weight:600; text-decoration:underline;">Connectez-vous à ${agencyLabel} pour valider ou rejeter cette déclaration.</a>`;
    let html: string;
    if (options?.templateOverrides?.bodyHtml) {
      html = emailWrapper(applyTemplate(options.templateOverrides.bodyHtml, vars, true));
    } else {
      const content = `
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#1a1a2e;">Nouvelle déclaration de paiement</h1>
      <p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour ${escapeHtml(agencyUserName || 'Utilisateur')},</p>
      <p style="margin:0 0 20px 0;">Un locataire a déclaré un paiement en attente de validation pour <strong>${agencyLabel}</strong>.</p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
        <tr><td style="padding:8px 0;"><strong>Déclarant :</strong> ${escapeHtml(declarerName || 'Locataire')}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Bail :</strong> ${leaseDisplay}</td></tr>
      </table>
      <div style="margin:20px 0;">${detailsCard}</div>
      <p style="margin:20px 0 0 0; padding:14px; background:#eff6ff; border-radius:8px; color:#1e40af; font-size:14px;">
        ${ctaLink}
      </p>
    `;
      html = emailWrapper(content);
    }
    const amountStr = new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(details.amount);
    const text = `Bonjour ${agencyUserName},\n\nUn locataire (${declarerName}) a déclaré un paiement de ${amountStr} FCFA pour le bail ${leaseNumber} (date: ${details.paymentDate}). Connectez-vous pour valider ou rejeter.`;
    await this.sendEmail({ to, subject, text, html });
  }

  /**
   * Notify tenant that their payment declaration was approved (en dur).
   * Placeholders for overrides: tenantName, leaseNumber, leaseLabel, portalUrl, agencyName, amount, allocatedInstallmentPeriod.
   */
  async sendPaymentApprovedToTenant(
    to: string,
    tenantName: string,
    leaseNumber: string,
    details: import('../utils/payment-email-templates').PaymentDeclarationEmailData,
    options?: {
      leaseLabel?: string;
      portalUrl?: string;
      allocatedInstallmentPeriod?: string;
      agencyName?: string;
      templateOverrides?: TemplateOverrides;
    }
  ): Promise<void> {
    const { buildPaymentDetailsCard, emailWrapper } = await import('../utils/payment-email-templates');
    const portalUrl = options?.portalUrl || getBaseUrl();
    const agencyNameVal = options?.agencyName || "l'agence";
    const vars = {
      tenantName: tenantName || 'Locataire',
      leaseNumber,
      leaseLabel: options?.leaseLabel || leaseNumber,
      portalUrl,
      agencyName: agencyNameVal,
      amount: new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(details.amount),
      allocatedInstallmentPeriod: options?.allocatedInstallmentPeriod || ''
    };
    const subject = options?.templateOverrides?.subject
      ? applyTemplate(options.templateOverrides.subject, vars)
      : `Paiement approuvé - Bail ${leaseNumber}`;
    const detailsCard = buildPaymentDetailsCard(details);
    const leaseDisplay = options?.leaseLabel
      ? `${escapeHtml(leaseNumber)} - ${escapeHtml(options.leaseLabel)}`
      : escapeHtml(leaseNumber);
    const ctaLink = `<a href="${escapeHtml(portalUrl)}" style="color:#166534; font-weight:600; text-decoration:underline;">Consultez votre historique des paiements dans le portail locataire.</a>`;
    const allocationBlock = options?.allocatedInstallmentPeriod
      ? `<p style="margin:0 0 12px 0; padding:12px; background:#ecfdf5; border-radius:8px; color:#166534; font-size:14px;"><strong>Allocation :</strong> Ce paiement a été alloué à l'échéance de <strong>${escapeHtml(options.allocatedInstallmentPeriod)}</strong>.</p>`
      : '';
    const agencyLabel = options?.agencyName ? escapeHtml(options.agencyName) : "l'agence";
    let html: string;
    if (options?.templateOverrides?.bodyHtml) {
      html = emailWrapper(applyTemplate(options.templateOverrides.bodyHtml, vars, true));
    } else {
      const content = `
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement approuvé</h1>
      <p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour ${escapeHtml(tenantName || 'Locataire')},</p>
      <p style="margin:0 0 20px 0;">Votre déclaration de paiement a été <strong style="color:#166534;">approuvée</strong> par <strong>${agencyLabel}</strong>. Ce paiement a bien été enregistré.</p>
      ${allocationBlock}
      <p style="margin:0 0 12px 0; font-size:14px; color:#555;">Récapitulatif :</p>
      <div style="margin:0 0 20px 0;">${detailsCard}</div>
      <p style="margin:0; padding:14px; background:#f0fdf4; border-radius:8px; color:#166534; font-size:14px;">
        Bail : ${leaseDisplay}
      </p>
      <p style="margin:16px 0 0 0; font-size:14px;">${ctaLink}</p>
    `;
      html = emailWrapper(content);
    }
    const amountStr = new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(details.amount);
    const agencyText = options?.agencyName || "l'agence";
    const text = `Bonjour ${tenantName},\n\nVotre déclaration de paiement de ${amountStr} FCFA pour le bail ${leaseNumber} a été approuvée par ${agencyText}.`;
    await this.sendEmail({ to, subject, text, html });
  }

  /**
   * Notify tenant that their payment declaration was rejected (en dur).
   * Placeholders for overrides: tenantName, leaseNumber, leaseLabel, portalUrl, agencyName, amount, reviewNotes.
   */
  async sendPaymentRejectedToTenant(
    to: string,
    tenantName: string,
    leaseNumber: string,
    details: import('../utils/payment-email-templates').PaymentDeclarationEmailData,
    reviewNotes: string | null,
    options?: { leaseLabel?: string; portalUrl?: string; agencyName?: string; templateOverrides?: TemplateOverrides }
  ): Promise<void> {
    const { buildPaymentDetailsCard, emailWrapper } = await import('../utils/payment-email-templates');
    const portalUrl = options?.portalUrl || getBaseUrl();
    const agencyNameVal = options?.agencyName || "l'agence";
    const vars = {
      tenantName: tenantName || 'Locataire',
      leaseNumber,
      leaseLabel: options?.leaseLabel || leaseNumber,
      portalUrl,
      agencyName: agencyNameVal,
      amount: new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(details.amount),
      reviewNotes: reviewNotes || ''
    };
    const subject = options?.templateOverrides?.subject
      ? applyTemplate(options.templateOverrides.subject, vars)
      : `Déclaration de paiement rejetée - Bail ${leaseNumber}`;
    const detailsCard = buildPaymentDetailsCard(details);
    const leaseDisplay = options?.leaseLabel
      ? `${escapeHtml(leaseNumber)} - ${escapeHtml(options.leaseLabel)}`
      : escapeHtml(leaseNumber);
    const ctaLink = `<a href="${escapeHtml(portalUrl)}" style="color:#1e40af; font-weight:600; text-decoration:underline;">Connectez-vous au portail locataire</a> pour plus de détails ou déclarer à nouveau si besoin.`;
    const agencyLabel = options?.agencyName ? escapeHtml(options.agencyName) : "l'agence";
    const notesBlock = reviewNotes
      ? `<div style="margin:20px 0; padding:14px; background:#fef2f2; border-radius:8px; border-left:4px solid #dc2626;"><p style="margin:0 0 6px 0; font-size:13px; color:#991b1b; font-weight:600;">Motif / commentaire de ${agencyLabel}</p><p style="margin:0; color:#333;">${escapeHtml(reviewNotes)}</p></div>`
      : '';
    let html: string;
    if (options?.templateOverrides?.bodyHtml) {
      html = emailWrapper(applyTemplate(options.templateOverrides.bodyHtml, vars, true));
    } else {
      const content = `
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#b91c1c;">Déclaration de paiement rejetée</h1>
      <p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour ${escapeHtml(tenantName || 'Locataire')},</p>
      <p style="margin:0 0 20px 0;">Votre déclaration de paiement a été <strong style="color:#b91c1c;">rejetée</strong> par <strong>${agencyLabel}</strong>.</p>
      <p style="margin:0 0 12px 0; font-size:14px; color:#555;">Déclaration concernée :</p>
      <div style="margin:0 0 20px 0;">${detailsCard}</div>
      ${notesBlock}
      <p style="margin:20px 0 0 0; font-size:14px; color:#555;">Bail : ${leaseDisplay}. ${ctaLink}</p>
    `;
      html = emailWrapper(content);
    }
    const amountStr = new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(details.amount);
    const agencyText = options?.agencyName || "l'agence";
    const text = `Bonjour ${tenantName},\n\nVotre déclaration de paiement de ${amountStr} FCFA pour le bail ${leaseNumber} a été rejetée par ${agencyText}.${reviewNotes ? '\nCommentaire: ' + reviewNotes : ''}`;
    await this.sendEmail({ to, subject, text, html });
  }

  /**
   * Notify tenant that their payment has been allocated to installments (en dur).
   * Placeholders for overrides: tenantName, leaseNumber, leaseLabel, portalUrl, agencyName, amountAllocated, installmentPeriods (comma-separated).
   */
  async sendPaymentAllocatedToTenant(
    to: string,
    tenantName: string,
    leaseNumber: string,
    amountAllocated: number,
    installmentPeriods: string[],
    options?: { leaseLabel?: string; portalUrl?: string; agencyName?: string; templateOverrides?: TemplateOverrides }
  ): Promise<void> {
    const { emailWrapper } = await import('../utils/payment-email-templates');
    const portalUrl = options?.portalUrl || getBaseUrl();
    const agencyNameVal = options?.agencyName || "l'agence";
    const vars = {
      tenantName: tenantName || 'Locataire',
      leaseNumber,
      leaseLabel: options?.leaseLabel || leaseNumber,
      portalUrl,
      agencyName: agencyNameVal,
      amountAllocated: new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(amountAllocated),
      installmentPeriods: installmentPeriods.join(', ')
    };
    const subject = options?.templateOverrides?.subject
      ? applyTemplate(options.templateOverrides.subject, vars)
      : `Paiement alloué aux échéances - Bail ${leaseNumber}`;
    const leaseDisplay = options?.leaseLabel
      ? `${escapeHtml(leaseNumber)} - ${escapeHtml(options.leaseLabel)}`
      : escapeHtml(leaseNumber);
    const ctaLink = `<a href="${escapeHtml(portalUrl)}" style="color:#166534; font-weight:600; text-decoration:underline;">Consultez vos échéances dans le portail locataire.</a>`;
    const amountStr = new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(amountAllocated);
    const periodsList =
      installmentPeriods.length > 0 ? installmentPeriods.map(p => `<li>${escapeHtml(p)}</li>`).join('') : '';
    const periodsBlock = periodsList ? `<ul style="margin:8px 0 16px 0; padding-left:20px;">${periodsList}</ul>` : '';
    const agencyLabel = options?.agencyName ? escapeHtml(options.agencyName) : "l'agence";
    let html: string;
    if (options?.templateOverrides?.bodyHtml) {
      html = emailWrapper(applyTemplate(options.templateOverrides.bodyHtml, vars, true));
    } else {
      const content = `
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement alloué aux échéances</h1>
      <p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour ${escapeHtml(tenantName || 'Locataire')},</p>
      <p style="margin:0 0 20px 0;"><strong>${agencyLabel}</strong> a alloué un montant de <strong>${amountStr} FCFA</strong> de votre paiement aux échéances suivantes :</p>
      ${periodsBlock}
      <p style="margin:0 0 12px 0; font-size:14px; color:#555;">Bail : ${leaseDisplay}</p>
      <p style="margin:16px 0 0 0; font-size:14px;">${ctaLink}</p>
    `;
      html = emailWrapper(content);
    }
    const agencyText = options?.agencyName || "l'agence";
    const text = `Bonjour ${tenantName},\n\n${agencyText} a alloué ${amountStr} FCFA de votre paiement aux échéances : ${installmentPeriods.join(', ')}. Bail : ${leaseNumber}.`;
    await this.sendEmail({ to, subject, text, html });
  }

  /**
   * Notify agency admins when a tenant creates a maintenance ticket (en dur).
   * Placeholders for overrides: agencyUserName, ticketTitle, ticketId, propertyReference, validationUrl, agencyName, renterName, ticketCreatedAt.
   */
  async sendMaintenanceTicketCreatedToAgency(
    to: string,
    agencyUserName: string,
    ticketTitle: string,
    ticketId: string,
    propertyReference: string,
    validationUrl: string,
    options?: {
      agencyName?: string;
      renterName?: string;
      ticketCreatedAt?: string;
      templateOverrides?: TemplateOverrides;
    }
  ): Promise<void> {
    const { emailWrapper } = await import('../utils/payment-email-templates');
    const vars = {
      agencyUserName: agencyUserName || 'Utilisateur',
      ticketTitle,
      ticketId,
      propertyReference,
      validationUrl,
      agencyName: options?.agencyName || 'ImmoTopia',
      renterName: options?.renterName || 'Un locataire',
      ticketCreatedAt: options?.ticketCreatedAt ?? ''
    };
    const subject = options?.templateOverrides?.subject
      ? applyTemplate(options.templateOverrides.subject, vars)
      : `Nouveau ticket de maintenance - ${ticketTitle}`;
    let html: string;
    if (options?.templateOverrides?.bodyHtml) {
      html = emailWrapper(applyTemplate(options.templateOverrides.bodyHtml, vars, true));
    } else {
      const agencyLabel = options?.agencyName ? escapeHtml(options.agencyName) : 'ImmoTopia';
      const renterLabel = options?.renterName ? escapeHtml(options.renterName) : 'Un locataire';
      const ctaLink = `<a href="${escapeHtml(validationUrl)}" style="color:#fa8c16; font-weight:600; text-decoration:underline;">Connectez-vous pour consulter le ticket</a>`;
      const content = `
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#fa8c16;">Nouveau ticket de maintenance</h1>
      <p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour ${escapeHtml(agencyUserName || 'Utilisateur')},</p>
      <p style="margin:0 0 20px 0;"><strong>${renterLabel}</strong> a créé une nouvelle demande de maintenance pour <strong>${agencyLabel}</strong>.</p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
        <tr><td style="padding:8px 0;"><strong>Sujet :</strong> ${escapeHtml(ticketTitle)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Propriété :</strong> ${escapeHtml(propertyReference)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Date de création :</strong> ${escapeHtml(vars.ticketCreatedAt || '—')}</td></tr>
      </table>
      <p style="margin:20px 0 0 0; padding:14px; background:#fff7e6; border-radius:8px; color:#ad6800; font-size:14px;">${ctaLink}</p>
    `;
      html = emailWrapper(content);
    }
    const renterLabel = options?.renterName || 'Un locataire';
    const text = `Bonjour ${agencyUserName},\n\n${renterLabel} a créé un ticket de maintenance : ${ticketTitle}. Connectez-vous pour le consulter.`;
    await this.sendEmail({ to, subject, text, html });
  }

  /**
   * Accusé de réception au locataire après création du ticket.
   * Placeholders: tenantName, ticketTitle, propertyReference, ticketCreatedAt, portalUrl, agencyName.
   */
  async sendMaintenanceTicketCreatedToTenant(
    to: string,
    tenantName: string,
    ticketTitle: string,
    propertyReference: string,
    ticketCreatedAt: string,
    portalUrl: string,
    options?: { agencyName?: string; templateOverrides?: TemplateOverrides }
  ): Promise<void> {
    const { emailWrapper } = await import('../utils/payment-email-templates');
    const vars = {
      tenantName: tenantName || 'Locataire',
      ticketTitle,
      propertyReference,
      ticketCreatedAt: ticketCreatedAt ?? '',
      portalUrl,
      agencyName: options?.agencyName || "l'agence"
    };
    const subject = options?.templateOverrides?.subject
      ? applyTemplate(options.templateOverrides.subject, vars)
      : `Votre ticket a bien été enregistré - ${ticketTitle}`;
    let html: string;
    if (options?.templateOverrides?.bodyHtml) {
      html = emailWrapper(applyTemplate(options.templateOverrides.bodyHtml, vars, true));
    } else {
      const agencyLabel = options?.agencyName ? escapeHtml(options.agencyName) : "l'agence";
      const ctaLink = `<a href="${escapeHtml(portalUrl)}" style="color:#1890ff; font-weight:600; text-decoration:underline;">Suivre votre ticket dans le portail locataire</a>`;
      const content = `
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Ticket de maintenance enregistré</h1>
      <p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour ${escapeHtml(tenantName || 'Locataire')},</p>
      <p style="margin:0 0 20px 0;">Votre demande de maintenance a bien été enregistrée par <strong>${escapeHtml(agencyLabel)}</strong>.</p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
        <tr><td style="padding:8px 0;"><strong>Sujet :</strong> ${escapeHtml(ticketTitle)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Propriété :</strong> ${escapeHtml(propertyReference)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Date de création :</strong> ${escapeHtml(vars.ticketCreatedAt || '—')}</td></tr>
      </table>
      <p style="margin:20px 0 0 0; padding:14px; background:#e6f7ff; border-radius:8px; color:#0050b3; font-size:14px;">${ctaLink}</p>
    `;
      html = emailWrapper(content);
    }
    const text = `Bonjour ${tenantName},\n\nVotre demande de maintenance "${ticketTitle}" a bien été enregistrée. Suivez votre ticket dans le portail locataire.`;
    await this.sendEmail({ to, subject, text, html });
  }

  /**
   * Notifier le propriétaire qu'un ticket a été créé sur son bien.
   * Placeholders: ownerName, renterName, agencyName, ticketTitle, propertyReference, ticketCreatedAt.
   */
  async sendMaintenanceTicketCreatedToOwner(
    to: string,
    ownerName: string,
    ticketTitle: string,
    propertyReference: string,
    ticketCreatedAt: string,
    options?: { agencyName?: string; renterName?: string; templateOverrides?: TemplateOverrides }
  ): Promise<void> {
    const { emailWrapper } = await import('../utils/payment-email-templates');
    const vars = {
      ownerName: ownerName || 'Propriétaire',
      renterName: options?.renterName || 'Le locataire',
      agencyName: options?.agencyName || "l'agence",
      ticketTitle,
      propertyReference,
      ticketCreatedAt: ticketCreatedAt ?? ''
    };
    const subject = options?.templateOverrides?.subject
      ? applyTemplate(options.templateOverrides.subject, vars)
      : `Nouveau ticket sur votre bien - ${ticketTitle}`;
    let html: string;
    if (options?.templateOverrides?.bodyHtml) {
      html = emailWrapper(applyTemplate(options.templateOverrides.bodyHtml, vars, true));
    } else {
      const agencyLabel = options?.agencyName ? escapeHtml(options.agencyName) : "l'agence";
      const renterLabel = options?.renterName ? escapeHtml(options.renterName) : 'Le locataire';
      const content = `
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Ticket de maintenance sur votre bien</h1>
      <p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour ${escapeHtml(ownerName || 'Propriétaire')},</p>
      <p style="margin:0 0 20px 0;">Un ticket de maintenance a été créé par le locataire <strong>${renterLabel}</strong> pour votre bien géré par <strong>${escapeHtml(agencyLabel)}</strong>.</p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
        <tr><td style="padding:8px 0;"><strong>Sujet :</strong> ${escapeHtml(ticketTitle)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Propriété :</strong> ${escapeHtml(propertyReference)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Date de création :</strong> ${escapeHtml(vars.ticketCreatedAt || '—')}</td></tr>
      </table>
      <p style="margin:20px 0 0 0; font-size:14px; color:#555;">Votre agence vous tiendra informé de l'avancement.</p>
    `;
      html = emailWrapper(content);
    }
    const text = `Bonjour ${ownerName},\n\nUn ticket de maintenance a été créé par ${vars.renterName} pour votre bien. Sujet : ${ticketTitle}.`;
    await this.sendEmail({ to, subject, text, html });
  }

  /**
   * Notify tenant when their maintenance ticket status changes (en dur).
   * Placeholders for overrides: tenantName, ticketTitle, oldStatusLabel, newStatusLabel, portalUrl, agencyName, ticketCreatedAt, ticketUpdatedAt.
   */
  async sendMaintenanceTicketStatusChangedToTenant(
    to: string,
    tenantName: string,
    ticketTitle: string,
    oldStatusLabel: string,
    newStatusLabel: string,
    portalUrl: string,
    options?: {
      agencyName?: string;
      ticketCreatedAt?: string;
      ticketUpdatedAt?: string;
      templateOverrides?: TemplateOverrides;
    }
  ): Promise<void> {
    const { emailWrapper } = await import('../utils/payment-email-templates');
    const vars = {
      tenantName: tenantName || 'Locataire',
      ticketTitle,
      oldStatusLabel,
      newStatusLabel,
      portalUrl,
      agencyName: options?.agencyName || "l'agence",
      ticketCreatedAt: options?.ticketCreatedAt ?? '',
      ticketUpdatedAt: options?.ticketUpdatedAt ?? ''
    };
    const subject = options?.templateOverrides?.subject
      ? applyTemplate(options.templateOverrides.subject, vars)
      : `Mise à jour de votre ticket - ${ticketTitle}`;
    let html: string;
    if (options?.templateOverrides?.bodyHtml) {
      html = emailWrapper(applyTemplate(options.templateOverrides.bodyHtml, vars, true));
    } else {
      const agencyLabel = options?.agencyName ? escapeHtml(options.agencyName) : "l'agence";
      const ctaLink = `<a href="${escapeHtml(portalUrl)}" style="color:#1890ff; font-weight:600; text-decoration:underline;">Consultez votre ticket dans le portail locataire</a>`;
      const content = `
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Mise à jour de votre ticket de maintenance</h1>
      <p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour ${escapeHtml(tenantName || 'Locataire')},</p>
      <p style="margin:0 0 20px 0;"><strong>${agencyLabel}</strong> a mis à jour le statut de votre demande.</p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
        <tr><td style="padding:8px 0;"><strong>Sujet :</strong> ${escapeHtml(ticketTitle)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Nouveau statut :</strong> ${escapeHtml(newStatusLabel)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Date de création :</strong> ${escapeHtml(vars.ticketCreatedAt || '—')}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Date de mise à jour :</strong> ${escapeHtml(vars.ticketUpdatedAt || '—')}</td></tr>
      </table>
      <p style="margin:20px 0 0 0; padding:14px; background:#e6f7ff; border-radius:8px; color:#0050b3; font-size:14px;">${ctaLink}</p>
    `;
      html = emailWrapper(content);
    }
    const agencyLabel = options?.agencyName ? escapeHtml(options.agencyName) : "l'agence";
    const text = `Bonjour ${tenantName},\n\n${agencyLabel} a mis à jour le statut de votre ticket "${ticketTitle}" : ${newStatusLabel}.`;
    await this.sendEmail({ to, subject, text, html });
  }

  /**
   * Notify owner that tenant's payment declaration was approved (en dur).
   * Placeholders for overrides: ownerName, renterName, leaseNumber, leaseLabel, agencyName, amount.
   */
  async sendPaymentApprovedToOwner(
    to: string,
    ownerName: string,
    renterName: string,
    leaseNumber: string,
    details: import('../utils/payment-email-templates').PaymentDeclarationEmailData,
    options?: { leaseLabel?: string; agencyName?: string; templateOverrides?: TemplateOverrides }
  ): Promise<void> {
    const { buildPaymentDetailsCard, emailWrapper } = await import('../utils/payment-email-templates');
    const agencyNameVal = options?.agencyName || "l'agence";
    const vars = {
      ownerName: ownerName || 'Propriétaire',
      renterName: renterName || 'Locataire',
      leaseNumber,
      leaseLabel: options?.leaseLabel || leaseNumber,
      agencyName: agencyNameVal,
      amount: new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(details.amount)
    };
    const subject = options?.templateOverrides?.subject
      ? applyTemplate(options.templateOverrides.subject, vars)
      : `Paiement du locataire approuvé - Bail ${leaseNumber}`;
    const detailsCard = buildPaymentDetailsCard(details);
    const leaseDisplay = options?.leaseLabel
      ? `${escapeHtml(leaseNumber)} - ${escapeHtml(options.leaseLabel)}`
      : escapeHtml(leaseNumber);
    const agencyLabel = options?.agencyName ? escapeHtml(options.agencyName) : "l'agence";
    let html: string;
    if (options?.templateOverrides?.bodyHtml) {
      html = emailWrapper(applyTemplate(options.templateOverrides.bodyHtml, vars, true));
    } else {
      const content = `
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement du locataire approuvé</h1>
      <p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour ${escapeHtml(ownerName || 'Propriétaire')},</p>
      <p style="margin:0 0 20px 0;">La déclaration de paiement de votre locataire <strong>${escapeHtml(renterName || 'Locataire')}</strong> a été <strong style="color:#166534;">approuvée</strong> par <strong>${agencyLabel}</strong>.</p>
      <p style="margin:0 0 12px 0; font-size:14px; color:#555;">Récapitulatif :</p>
      <div style="margin:0 0 20px 0;">${detailsCard}</div>
      <p style="margin:0; padding:14px; background:#f0fdf4; border-radius:8px; color:#166534; font-size:14px;">
        Bail : ${leaseDisplay}
      </p>
    `;
      html = emailWrapper(content);
    }
    const amountStr = new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(details.amount);
    const agencyText = options?.agencyName || "l'agence";
    const text = `Bonjour ${ownerName},\n\nLa déclaration de paiement de ${renterName} (${amountStr} FCFA) pour le bail ${leaseNumber} a été approuvée par ${agencyText}.`;
    await this.sendEmail({ to, subject, text, html });
  }

  /**
   * Notify owner that tenant's payment declaration was rejected (en dur).
   * Placeholders for overrides: ownerName, renterName, leaseNumber, leaseLabel, agencyName, amount, reviewNotes.
   */
  async sendPaymentRejectedToOwner(
    to: string,
    ownerName: string,
    renterName: string,
    leaseNumber: string,
    details: import('../utils/payment-email-templates').PaymentDeclarationEmailData,
    reviewNotes: string | null,
    options?: { leaseLabel?: string; agencyName?: string; templateOverrides?: TemplateOverrides }
  ): Promise<void> {
    const { buildPaymentDetailsCard, emailWrapper } = await import('../utils/payment-email-templates');
    const agencyNameVal = options?.agencyName || "l'agence";
    const vars = {
      ownerName: ownerName || 'Propriétaire',
      renterName: renterName || 'Locataire',
      leaseNumber,
      leaseLabel: options?.leaseLabel || leaseNumber,
      agencyName: agencyNameVal,
      amount: new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(details.amount),
      reviewNotes: reviewNotes || ''
    };
    const subject = options?.templateOverrides?.subject
      ? applyTemplate(options.templateOverrides.subject, vars)
      : `Déclaration de paiement du locataire rejetée - Bail ${leaseNumber}`;
    const detailsCard = buildPaymentDetailsCard(details);
    const leaseDisplay = options?.leaseLabel
      ? `${escapeHtml(leaseNumber)} - ${escapeHtml(options.leaseLabel)}`
      : escapeHtml(leaseNumber);
    const agencyLabel = options?.agencyName ? escapeHtml(options.agencyName) : "l'agence";
    const notesBlock = reviewNotes
      ? `<div style="margin:20px 0; padding:14px; background:#fef2f2; border-radius:8px; border-left:4px solid #dc2626;"><p style="margin:0 0 6px 0; font-size:13px; color:#991b1b; font-weight:600;">Motif / commentaire de ${agencyLabel}</p><p style="margin:0; color:#333;">${escapeHtml(reviewNotes)}</p></div>`
      : '';
    let html: string;
    if (options?.templateOverrides?.bodyHtml) {
      html = emailWrapper(applyTemplate(options.templateOverrides.bodyHtml, vars, true));
    } else {
      const content = `
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#b91c1c;">Déclaration de paiement du locataire rejetée</h1>
      <p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour ${escapeHtml(ownerName || 'Propriétaire')},</p>
      <p style="margin:0 0 20px 0;">La déclaration de paiement de votre locataire <strong>${escapeHtml(renterName || 'Locataire')}</strong> a été <strong style="color:#b91c1c;">rejetée</strong> par <strong>${agencyLabel}</strong>.</p>
      <p style="margin:0 0 12px 0; font-size:14px; color:#555;">Déclaration concernée :</p>
      <div style="margin:0 0 20px 0;">${detailsCard}</div>
      ${notesBlock}
      <p style="margin:20px 0 0 0; font-size:14px; color:#555;">Bail : ${leaseDisplay}</p>
    `;
      html = emailWrapper(content);
    }
    const amountStr = new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(details.amount);
    const agencyText = options?.agencyName || "l'agence";
    const text = `Bonjour ${ownerName},\n\nLa déclaration de paiement de ${renterName} (${amountStr} FCFA) pour le bail ${leaseNumber} a été rejetée par ${agencyText}.${reviewNotes ? '\nCommentaire: ' + reviewNotes : ''}`;
    await this.sendEmail({ to, subject, text, html });
  }

  /**
   * Notify owner that tenant's payment has been allocated to installments (en dur).
   * Placeholders for overrides: ownerName, renterName, leaseNumber, leaseLabel, agencyName, amountAllocated, installmentPeriods.
   */
  async sendPaymentAllocatedToOwner(
    to: string,
    ownerName: string,
    renterName: string,
    leaseNumber: string,
    amountAllocated: number,
    installmentPeriods: string[],
    options?: { leaseLabel?: string; agencyName?: string; templateOverrides?: TemplateOverrides }
  ): Promise<void> {
    const { emailWrapper } = await import('../utils/payment-email-templates');
    const agencyNameVal = options?.agencyName || "l'agence";
    const vars = {
      ownerName: ownerName || 'Propriétaire',
      renterName: renterName || 'Locataire',
      leaseNumber,
      leaseLabel: options?.leaseLabel || leaseNumber,
      agencyName: agencyNameVal,
      amountAllocated: new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(amountAllocated),
      installmentPeriods: installmentPeriods.join(', ')
    };
    const subject = options?.templateOverrides?.subject
      ? applyTemplate(options.templateOverrides.subject, vars)
      : `Paiement du locataire alloué aux échéances - Bail ${leaseNumber}`;
    const leaseDisplay = options?.leaseLabel
      ? `${escapeHtml(leaseNumber)} - ${escapeHtml(options.leaseLabel)}`
      : escapeHtml(leaseNumber);
    const amountStr = new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(amountAllocated);
    const periodsList =
      installmentPeriods.length > 0 ? installmentPeriods.map(p => `<li>${escapeHtml(p)}</li>`).join('') : '';
    const periodsBlock = periodsList ? `<ul style="margin:8px 0 16px 0; padding-left:20px;">${periodsList}</ul>` : '';
    const agencyLabel = options?.agencyName ? escapeHtml(options.agencyName) : "l'agence";
    let html: string;
    if (options?.templateOverrides?.bodyHtml) {
      html = emailWrapper(applyTemplate(options.templateOverrides.bodyHtml, vars, true));
    } else {
      const content = `
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement du locataire alloué aux échéances</h1>
      <p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour ${escapeHtml(ownerName || 'Propriétaire')},</p>
      <p style="margin:0 0 20px 0;"><strong>${agencyLabel}</strong> a alloué un montant de <strong>${amountStr} FCFA</strong> du paiement de votre locataire <strong>${escapeHtml(renterName || 'Locataire')}</strong> aux échéances suivantes :</p>
      ${periodsBlock}
      <p style="margin:0 0 12px 0; font-size:14px; color:#555;">Bail : ${leaseDisplay}</p>
    `;
      html = emailWrapper(content);
    }
    const agencyText = options?.agencyName || "l'agence";
    const text = `Bonjour ${ownerName},\n\n${agencyText} a alloué ${amountStr} FCFA du paiement de ${renterName} aux échéances : ${installmentPeriods.join(', ')}. Bail : ${leaseNumber}.`;
    await this.sendEmail({ to, subject, text, html });
  }

  /**
   * Notify owner when maintenance ticket status changes (en dur).
   * Placeholders for overrides: ownerName, ticketTitle, oldStatusLabel, newStatusLabel, agencyName, ticketCreatedAt, ticketUpdatedAt.
   */
  async sendMaintenanceTicketStatusChangedToOwner(
    to: string,
    ownerName: string,
    ticketTitle: string,
    oldStatusLabel: string,
    newStatusLabel: string,
    agencyName: string,
    options?: { ticketCreatedAt?: string; ticketUpdatedAt?: string; templateOverrides?: TemplateOverrides }
  ): Promise<void> {
    const { emailWrapper } = await import('../utils/payment-email-templates');
    const vars = {
      ownerName: ownerName || 'Propriétaire',
      ticketTitle,
      oldStatusLabel,
      newStatusLabel,
      agencyName,
      ticketCreatedAt: options?.ticketCreatedAt ?? '',
      ticketUpdatedAt: options?.ticketUpdatedAt ?? ''
    };
    const subject = options?.templateOverrides?.subject
      ? applyTemplate(options.templateOverrides.subject, vars)
      : `Mise à jour du ticket de maintenance - ${ticketTitle}`;
    let html: string;
    if (options?.templateOverrides?.bodyHtml) {
      html = emailWrapper(applyTemplate(options.templateOverrides.bodyHtml, vars, true));
    } else {
      const agencyLabel = escapeHtml(agencyName);
      const content = `
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Mise à jour du ticket de maintenance</h1>
      <p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour ${escapeHtml(ownerName || 'Propriétaire')},</p>
      <p style="margin:0 0 20px 0;"><strong>${agencyLabel}</strong> a mis à jour le statut du ticket de maintenance concernant votre bien.</p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
        <tr><td style="padding:8px 0;"><strong>Sujet :</strong> ${escapeHtml(ticketTitle)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Ancien statut :</strong> ${escapeHtml(oldStatusLabel)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Nouveau statut :</strong> ${escapeHtml(newStatusLabel)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Date de création :</strong> ${escapeHtml(vars.ticketCreatedAt || '—')}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Date de mise à jour :</strong> ${escapeHtml(vars.ticketUpdatedAt || '—')}</td></tr>
      </table>
      <p style="margin:20px 0 0 0; font-size:14px; color:#555;">Contactez votre agence pour plus de détails.</p>
    `;
      html = emailWrapper(content);
    }
    const text = `Bonjour ${ownerName},\n\n${agencyName} a mis à jour le statut du ticket de maintenance "${ticketTitle}" concernant votre bien : ${newStatusLabel}.`;
    await this.sendEmail({ to, subject, text, html });
  }

  /**
   * Notify tenant when a deposit movement is recorded.
   * Placeholders: tenantName, movementTypeLabel, amount, currency, leaseLabel, leaseNumber, agencyName, portalUrl.
   */
  async sendDepositMovementToTenant(
    to: string,
    tenantName: string,
    movementTypeLabel: string,
    amount: string,
    currency: string,
    leaseNumber: string,
    options?: { leaseLabel?: string; agencyName?: string; portalUrl?: string; templateOverrides?: TemplateOverrides }
  ): Promise<void> {
    const { emailWrapper } = await import('../utils/payment-email-templates');
    const vars = {
      tenantName: tenantName || 'Locataire',
      movementTypeLabel,
      amount,
      currency,
      leaseNumber,
      leaseLabel: options?.leaseLabel || leaseNumber,
      agencyName: options?.agencyName || "l'agence",
      portalUrl: options?.portalUrl || ''
    };
    const subject = options?.templateOverrides?.subject
      ? applyTemplate(options.templateOverrides.subject, vars)
      : `Dépôt de garantie - ${movementTypeLabel} - Bail ${leaseNumber}`;
    let html: string;
    if (options?.templateOverrides?.bodyHtml) {
      html = emailWrapper(applyTemplate(options.templateOverrides.bodyHtml, vars, true));
    } else {
      const agencyLabel = options?.agencyName ? escapeHtml(options.agencyName) : "l'agence";
      const ctaLink = options?.portalUrl
        ? `<a href="${escapeHtml(options.portalUrl)}" style="color:#1890ff; font-weight:600;">Consultez votre dépôt de garantie dans le portail locataire</a>`
        : '';
      const content = `
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Mouvement sur votre dépôt de garantie</h1>
      <p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour ${escapeHtml(tenantName || 'Locataire')},</p>
      <p style="margin:0 0 20px 0;"><strong>${agencyLabel}</strong> a enregistré un mouvement sur le dépôt de garantie de votre bail.</p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
        <tr><td style="padding:8px 0;"><strong>Type :</strong> ${escapeHtml(movementTypeLabel)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Montant :</strong> ${escapeHtml(amount)} ${escapeHtml(currency)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Bail :</strong> ${escapeHtml(options?.leaseLabel || leaseNumber)}</td></tr>
      </table>
      ${ctaLink ? `<p style="margin:20px 0 0 0; font-size:14px;">${ctaLink}</p>` : ''}
    `;
      html = emailWrapper(content);
    }
    const text = `Bonjour ${tenantName},\n\n${options?.agencyName || "L'agence"} a enregistré un mouvement sur votre dépôt de garantie : ${movementTypeLabel}, ${amount} ${currency}. Bail : ${leaseNumber}.`;
    await this.sendEmail({ to, subject, text, html });
  }

  /**
   * Notify owner when a deposit movement is recorded.
   * Placeholders: ownerName, renterName, movementTypeLabel, amount, currency, leaseLabel, leaseNumber, agencyName.
   */
  async sendDepositMovementToOwner(
    to: string,
    ownerName: string,
    renterName: string,
    movementTypeLabel: string,
    amount: string,
    currency: string,
    leaseNumber: string,
    options?: { leaseLabel?: string; agencyName?: string; templateOverrides?: TemplateOverrides }
  ): Promise<void> {
    const { emailWrapper } = await import('../utils/payment-email-templates');
    const vars = {
      ownerName: ownerName || 'Propriétaire',
      renterName: renterName || 'Locataire',
      movementTypeLabel,
      amount,
      currency,
      leaseNumber,
      leaseLabel: options?.leaseLabel || leaseNumber,
      agencyName: options?.agencyName || "l'agence"
    };
    const subject = options?.templateOverrides?.subject
      ? applyTemplate(options.templateOverrides.subject, vars)
      : `Dépôt de garantie - ${movementTypeLabel} - Bail ${leaseNumber}`;
    let html: string;
    if (options?.templateOverrides?.bodyHtml) {
      html = emailWrapper(applyTemplate(options.templateOverrides.bodyHtml, vars, true));
    } else {
      const agencyLabel = options?.agencyName ? escapeHtml(options.agencyName) : "l'agence";
      const content = `
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Mouvement sur le dépôt de garantie</h1>
      <p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour ${escapeHtml(ownerName || 'Propriétaire')},</p>
      <p style="margin:0 0 20px 0;"><strong>${agencyLabel}</strong> a enregistré un mouvement sur le dépôt de garantie du bail de votre locataire <strong>${escapeHtml(renterName || 'Locataire')}</strong>.</p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
        <tr><td style="padding:8px 0;"><strong>Type :</strong> ${escapeHtml(movementTypeLabel)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Montant :</strong> ${escapeHtml(amount)} ${escapeHtml(currency)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Bail :</strong> ${escapeHtml(options?.leaseLabel || leaseNumber)}</td></tr>
      </table>
    `;
      html = emailWrapper(content);
    }
    const text = `Bonjour ${ownerName},\n\n${options?.agencyName || "L'agence"} a enregistré un mouvement sur le dépôt de garantie du bail de ${renterName} : ${movementTypeLabel}, ${amount} ${currency}. Bail : ${leaseNumber}.`;
    await this.sendEmail({ to, subject, text, html });
  }
}

export const emailService = new EmailService();
