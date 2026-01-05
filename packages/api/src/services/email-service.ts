import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export class EmailService {
  private transporter;

  constructor() {
    // For development, we'll just log emails or use a dummy transport
    this.transporter = nodemailer.createTransport({
      jsonTransport: true
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: '"Immobillier" <noreply@immobillier.com>',
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html
      });
      console.log('Email sent:', info.messageId);
      console.log('Preview:', info.envelope);
    } catch (error) {
      console.error('Error sending email:', error);
      // Don't throw for now to avoid breaking flow in dev
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${process.env.CLIENT_URL}/auth/verify?token=${token}`;
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
    const link = `${process.env.CLIENT_URL}/auth/reset-password?token=${token}`;
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

  async sendInviteEmail(to: string, token: string, tenantName: string, role: string): Promise<void> {
    const link = `${process.env.CLIENT_URL}/auth/accept-invite?token=${token}`;
    await this.sendEmail({
      to,
      subject: `Invitation to join ${tenantName}`,
      html: `
        <h1>You've been invited!</h1>
        <p>You have been invited to join <strong>${tenantName}</strong> as a <strong>${role}</strong>.</p>
        <p>Click the link below to accept the invitation and set up your account:</p>
        <a href="${link}">${link}</a>
      `
    });
  }
}

export const emailService = new EmailService();
