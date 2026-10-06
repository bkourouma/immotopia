/**
 * Réglages des notifications e-mail et WhatsApp (écrans Communication › E-mail
 * et WhatsApp) pour les packs qui n'en ont aucun : quelques notifications
 * personnalisées (objet, corps), d'autres désactivées, le reste suit le modèle
 * par défaut du code.
 *
 * Il n'existe ni écran « historique des envois » ni journal des messages dans
 * l'application : rien d'autre n'est écrit (la table `communications` est une
 * ébauche sans écran). IDEMPOTENT : saute si le tenant a déjà ses réglages.
 */
import { between } from './types';
import { addDays } from './agence-commercial-data';
import type { HistoryContext } from './types';

interface EmailCfg {
  key: string;
  enabled: boolean;
  subject?: string;
  body?: string;
}
interface WaCfg {
  key: string;
  enabled: boolean;
  body?: string;
}
interface PackNotif {
  email: EmailCfg[];
  whatsapp: WaCfg[];
}

const SIGN = '<p style="margin:20px 0 0 0; font-size:14px;">Bien cordialement,<br/>{{agencyName}}</p>';

const COMMON_EMAIL: EmailCfg[] = [
  { key: 'INVITATION', enabled: true, subject: 'Bienvenue chez {{agencyName}} : activez votre espace personnel' },
  { key: 'PASSWORD_RESET', enabled: true },
  { key: 'CUSTOM', enabled: true }
];

const NOTIF: Record<string, PackNotif> = {
  SYNDIC: {
    email: [
      {
        key: 'CHARGE_CALL_ISSUED',
        enabled: true,
        subject: 'Appel de charges {{period}} — {{syndicateName}}, lot {{lotLabel}}',
        body: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Appel de charges {{period}}</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Le syndic de la copropriété <strong>{{syndicateName}}</strong> vous adresse l'appel de charges de la période <strong>{{period}}</strong> pour votre lot {{lotLabel}}.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Montant : <strong>{{amount}} {{currency}}</strong>. Échéance : {{dueDate}}. Paiement par Orange Money, MTN, Wave, chèque ou virement.</p>
${SIGN}`
      },
      {
        key: 'CHARGE_CALL_REMINDER',
        enabled: true,
        subject: 'Rappel amical : charges {{period}} restant à régler ({{remainingAmount}} {{currency}})'
      },
      { key: 'CHARGE_PAYMENT_RECEIPT', enabled: true },
      { key: 'CHARGE_CALL_SETTLED', enabled: true, subject: 'Quittance de charges n° {{number}} — {{period}}' },
      {
        key: 'GENERAL_MEETING_CONVOCATION',
        enabled: true,
        subject: 'Convocation : assemblée générale de {{syndicateName}} le {{meetingDate}}',
        body: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#0f766e;">Convocation à l’assemblée générale</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Vous êtes convoqué(e) à l’assemblée générale de la copropriété <strong>{{syndicateName}}</strong>. Votre présence ou un pouvoir donné à un autre copropriétaire est essentiel pour atteindre le quorum.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Date : {{meetingDate}}. Heure : {{meetingTime}}. Lieu : {{meetingLocation}}.</p>
${SIGN}`
      },
      { key: 'GENERAL_MEETING_MINUTES', enabled: true },
      {
        key: 'CONTRACT_RENEWAL_ALERT',
        enabled: true,
        subject: 'À décider : renouvellement du contrat {{contractNature}}'
      },
      { key: 'COMMON_AREA_INCIDENT', enabled: true },
      { key: 'DOCUMENT_EXPIRING', enabled: false },
      ...COMMON_EMAIL
    ],
    whatsapp: [
      {
        key: 'CHARGE_CALL_ISSUED',
        enabled: true,
        body: 'Bonjour {{ownerName}}, l’appel de charges de {{syndicateName}} est disponible pour votre lot {{lotLabel}} : {{amount}} {{currency}}, à régler avant le {{dueDate}}. Orange Money, Wave, MTN ou virement.'
      },
      { key: 'CHARGE_CALL_REMINDER', enabled: true },
      {
        key: 'GENERAL_MEETING_CONVOCATION',
        enabled: true,
        body: 'Bonjour {{ownerName}}, assemblée générale de {{syndicateName}} le {{meetingDate}} à {{meetingTime}} ({{meetingLocation}}). Pensez à vous faire représenter si vous ne pouvez pas venir.'
      },
      { key: 'GENERAL_MEETING_MINUTES', enabled: true },
      { key: 'CONTRACT_RENEWAL_ALERT', enabled: true },
      { key: 'COMMON_AREA_INCIDENT', enabled: true },
      { key: 'PORTAL_ACCOUNT_CREATED', enabled: true },
      { key: 'CRM_CONTACT_GROUP_INVITE', enabled: false }
    ]
  },
  PROMOTEUR: {
    email: [
      {
        key: 'DEAL_CREATED',
        enabled: true,
        subject: 'Votre projet d’acquisition est enregistré — {{dealId}}'
      },
      {
        key: 'DEAL_STAGE_CHANGED',
        enabled: true,
        subject: 'Réservation {{dealId}} : une nouvelle étape est franchie'
      },
      {
        key: 'APPOINTMENT_REMINDER',
        enabled: true,
        subject: 'Rappel : visite de votre futur logement le {{appointmentDate}}',
        body: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#993c1d;">Rappel de visite</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Nous vous attendons le <strong>{{appointmentDate}}</strong> pour visiter l’appartement témoin et faire le point sur l’avancement du chantier.</p>
${SIGN}`
      },
      { key: 'PROPERTY_PUBLISHED', enabled: true, subject: 'Nouveau lot disponible : {{propertyAddress}}' },
      { key: 'DOCUMENT_EXPIRING', enabled: true },
      {
        key: 'STOCK_ALERT_AGENCY',
        enabled: true,
        subject: 'Chantiers : alertes de stock à traiter — {{agencyName}}'
      },
      { key: 'PAYMENT_RECEIVED', enabled: true, subject: 'Appel de fonds réglé : merci, {{amount}} bien reçus' },
      { key: 'PAYMENT_CONFIRMED', enabled: false },
      ...COMMON_EMAIL
    ],
    whatsapp: [
      {
        key: 'APPOINTMENT_REMINDER',
        enabled: true,
        body: 'Bonjour, rappel de votre visite du {{appointmentDate}} sur notre programme. Pensez à vous munir d’une pièce d’identité. {{agencyName}}.'
      },
      {
        key: 'DEAL_STAGE_CHANGED',
        enabled: true,
        body: 'Bonjour {{contactName}}, votre dossier d’acquisition avance : {{stageLabel}}. Votre conseiller reste à votre disposition. {{agencyName}}.'
      },
      { key: 'PROPERTY_PUBLISHED_GROUP_BROADCAST', enabled: true },
      { key: 'PAYMENT_APPROVED_TENANT', enabled: false },
      { key: 'CRM_CONTACT_GROUP_INVITE', enabled: true },
      { key: 'PORTAL_ACCOUNT_CREATED', enabled: true }
    ]
  }
};

const PATRIMOINE_EMAIL: EmailCfg[] = [
  {
    key: 'INSTALLMENT_DUE_REMINDER',
    enabled: true,
    subject: 'Rappel : votre loyer de {{dueAmount}} est attendu le {{dueDate}}'
  },
  {
    key: 'INSTALLMENT_OVERDUE',
    enabled: true,
    subject: 'Loyer en retard — {{leaseLabel}}',
    body: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b91c1c;">Loyer en retard</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Sauf erreur de notre part, l'échéance du <strong>{{dueDate}}</strong> ({{dueAmount}}) pour {{leaseLabel}} reste impayée. Merci de la régler rapidement ou de nous contacter pour convenir d'un échéancier.</p>
${SIGN}`
  },
  { key: 'PAYMENT_RECEIVED', enabled: true, subject: 'Merci, votre paiement de {{amount}} est bien enregistré' },
  { key: 'LEASE_ENDING_SOON', enabled: true },
  { key: 'LEASE_ACTIVATED', enabled: true },
  { key: 'OWNER_STATEMENT_SENT', enabled: true, subject: 'Votre relevé de gérance — {{period}}' },
  { key: 'OWNER_MONTHLY_REPORT_SENT', enabled: true, subject: 'Votre rapport patrimonial de {{period}}' },
  { key: 'LOAN_MATURITY_ALERT', enabled: true, subject: 'Prêt bientôt soldé — {{propertyReference}}' },
  { key: 'INSURANCE_DEADLINE_ALERT', enabled: true },
  { key: 'DOCUMENT_EXPIRY_ALERT', enabled: true },
  { key: 'WORK_PROGRAM_REMINDER', enabled: true },
  { key: 'LAND_STEP_OVERDUE_ALERT', enabled: false },
  {
    key: 'EXTERNAL_ACCESS_LINK_SENT',
    enabled: true,
    subject: 'Accès à votre dossier patrimonial partagé par {{agencyName}}'
  },
  { key: 'PAYMENT_CONFIRMED', enabled: false },
  ...COMMON_EMAIL
];

const PATRIMOINE_WA: WaCfg[] = [
  {
    key: 'INSTALLMENT_DUE_REMINDER',
    enabled: true,
    body: 'Bonjour {{tenantName}}, rappel : votre loyer de {{amount}} est attendu le {{dueDate}}. Paiement possible par Orange Money, MTN, Wave ou virement. {{agencyName}}.'
  },
  { key: 'INSTALLMENT_OVERDUE', enabled: true },
  { key: 'LEASE_ENDING_SOON', enabled: true },
  { key: 'OWNER_STATEMENT_SENT', enabled: true },
  { key: 'OWNER_MONTHLY_REPORT_SENT', enabled: true },
  { key: 'OWNER_LEASE_ENDING_SOON', enabled: true },
  {
    key: 'OWNER_DOCUMENT_EXPIRY_ALERT',
    enabled: true,
    body: 'Bonjour {{ownerName}}, le document « {{documentTitle}} » du bien {{propertyReference}} expire le {{expiresAt}}. Nous préparons son renouvellement avec vous.'
  },
  { key: 'RENTER_PAYMENT_LINK_SENT', enabled: true },
  { key: 'PORTAL_ACCOUNT_CREATED', enabled: true },
  { key: 'PAYMENT_REJECTED_TENANT', enabled: false }
];

NOTIF.PATRIMOINE_ESSENTIEL = { email: PATRIMOINE_EMAIL, whatsapp: PATRIMOINE_WA };
NOTIF.PATRIMOINE_PRO = {
  email: [
    ...PATRIMOINE_EMAIL,
    { key: 'DEPOSIT_MOVEMENT_OWNER', enabled: true },
    { key: 'PAYMENT_APPROVED_OWNER', enabled: true }
  ],
  whatsapp: [...PATRIMOINE_WA, { key: 'DEPOSIT_MOVEMENT_TENANT', enabled: true }]
};

export async function seedNotificationSettings(ctx: HistoryContext, pack: string): Promise<void> {
  const { prisma, tenantId, rng, end, log } = ctx;
  const plan = NOTIF[pack];
  if (!plan) return;
  if ((await prisma.emailNotificationConfig.count({ where: { tenant_id: tenantId } })) === 0) {
    for (const c of plan.email) {
      const at = addDays(end, -between(rng, 40, 900));
      await prisma.emailNotificationConfig.create({
        data: {
          tenant_id: tenantId,
          notification_key: c.key,
          enabled: c.enabled,
          subject_override: c.subject ?? null,
          body_html_override: c.body ?? null,
          created_at: at,
          updated_at: at
        }
      });
    }
    log(`core-communication notifications : ${plan.email.length} réglages e-mail.`);
  }
  if ((await prisma.whatsappNotificationConfig.count({ where: { tenant_id: tenantId } })) === 0) {
    for (const c of plan.whatsapp) {
      const at = addDays(end, -between(rng, 40, 700));
      await prisma.whatsappNotificationConfig.create({
        data: {
          tenant_id: tenantId,
          notification_key: c.key,
          enabled: c.enabled,
          body_override: c.body ?? null,
          created_at: at,
          updated_at: at
        }
      });
    }
    log(`core-communication notifications : ${plan.whatsapp.length} réglages WhatsApp.`);
  }
}
