/**
 * Script pour préparer les contacts CRM afin que les notifications WhatsApp
 * (création de ticket de maintenance) soient envoyées au locataire et à l'agence.
 *
 * Utilisation:
 *   cd packages/api
 *   npx ts-node scripts/ensure-whatsapp-contacts-maintenance.ts [TENANT_ID]
 *
 * Variables d'environnement optionnelles (sinon les numéros existants sont conservés):
 *   TENANT_ID          - ID du tenant (sinon 1er arg)
 *   LOCATAIRE_EMAIL    - Email du locataire (défaut: devaccrocs@gmail.com)
 *   LOCATAIRE_PHONE    - Téléphone/WhatsApp du locataire (ex: +2250700000000)
 *   AGENCY_EMAILS      - Emails agence séparés par des virgules (défaut: collab1..., scolarflow...)
 *   AGENCY_PHONES      - Numéros agence dans le même ordre, séparés par des virgules
 *
 * Exemple:
 *   LOCATAIRE_PHONE=+2250700000001 AGENCY_PHONES=+2250700000002,+2250700000003 npx ts-node scripts/ensure-whatsapp-contacts-maintenance.ts e3e428d1-364b-42c9-a102-a22daa9329c5
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_TENANT_ID = 'e3e428d1-364b-42c9-a102-a22daa9329c5';
const DEFAULT_LOCATAIRE_EMAIL = 'devaccrocs@gmail.com';
const DEFAULT_AGENCY_EMAILS = [
  'collab1.kouamé.diabaté@agence-mali.com',
  'scolarflow@gmail.com'
];

function ensurePhone(phone: string | null | undefined): string | null {
  if (!phone || !String(phone).trim()) return null;
  const p = String(phone).trim();
  return p.startsWith('+') ? p : `+${p}`;
}

async function findContactByEmail(tenantId: string, email: string) {
  return prisma.crmContact.findFirst({
    where: {
      tenantId,
      email: { equals: email.trim(), mode: 'insensitive' }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      consentWhatsapp: true,
      whatsappNumber: true,
      phonePrimary: true
    }
  });
}

async function ensureContact(
  tenantId: string,
  email: string,
  role: 'locataire' | 'agence',
  options: { phone?: string | null; label?: string }
) {
  const contact = await findContactByEmail(tenantId, email);
  const phone = ensurePhone(options.phone);

  if (contact) {
    const updates: Record<string, unknown> = { consentWhatsapp: true };
    if (phone && !contact.whatsappNumber && !contact.phonePrimary) {
      updates.whatsappNumber = phone;
      updates.phonePrimary = phone;
    } else if (phone && (!contact.whatsappNumber || !contact.phonePrimary)) {
      if (!contact.whatsappNumber) updates.whatsappNumber = phone;
      if (!contact.phonePrimary) updates.phonePrimary = phone;
    }
    await prisma.crmContact.update({
      where: { id: contact.id },
      data: updates
    });
    const hasPhone = contact.whatsappNumber || contact.phonePrimary || phone;
    return {
      action: 'updated',
      id: contact.id,
      email: contact.email,
      consentWhatsapp: true,
      hasPhone: !!hasPhone,
      phone: contact.whatsappNumber || contact.phonePrimary || phone || null
    };
  }

  if (!phone && role === 'locataire') {
    return {
      action: 'skip',
      email,
      reason: 'Contact inexistant et aucun LOCATAIRE_PHONE fourni (création impossible)'
    };
  }

  const firstName = options.label || (role === 'locataire' ? 'Locataire' : 'Admin');
  const lastName = role === 'locataire' ? 'Test' : 'Agence';
  const created = await prisma.crmContact.create({
    data: {
      tenantId,
      contactType: 'PERSON',
      firstName,
      lastName,
      email: email.trim().toLowerCase(),
      consentWhatsapp: true,
      consentDate: new Date(),
      whatsappNumber: phone || null,
      phonePrimary: phone || null,
      status: 'LEAD'
    }
  });
  return {
    action: 'created',
    id: created.id,
    email: created.email,
    consentWhatsapp: true,
    hasPhone: !!phone,
    phone
  };
}

async function main() {
  const tenantId = process.argv[2] || process.env.TENANT_ID || DEFAULT_TENANT_ID;
  const locataireEmail = process.env.LOCATAIRE_EMAIL || DEFAULT_LOCATAIRE_EMAIL;
  const locatairePhone = process.env.LOCATAIRE_PHONE || null;
  const agencyEmailsEnv = process.env.AGENCY_EMAILS;
  const agencyEmails = agencyEmailsEnv
    ? agencyEmailsEnv.split(',').map((e) => e.trim()).filter(Boolean)
    : DEFAULT_AGENCY_EMAILS;
  const agencyPhonesEnv = process.env.AGENCY_PHONES;
  const agencyPhones = agencyPhonesEnv
    ? agencyPhonesEnv.split(',').map((p) => p.trim())
    : [];

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true }
  });
  if (!tenant) {
    console.error('Tenant non trouvé:', tenantId);
    process.exit(1);
  }
  console.log('Tenant:', tenant.name, `(${tenantId})\n`);

  console.log('--- État actuel des contacts (avant mise à jour) ---');
  const allEmails = [locataireEmail, ...agencyEmails];
  for (const email of allEmails) {
    const c = await findContactByEmail(tenantId, email);
    const role = email === locataireEmail ? 'Locataire' : 'Agence';
    if (!c) {
      console.log(`  [${role}] ${email}: aucun contact CRM`);
    } else {
      const phone = c.whatsappNumber || c.phonePrimary || null;
      const ok = c.consentWhatsapp && phone;
      console.log(`  [${role}] ${email}: id=${c.id} consent_whatsapp=${c.consentWhatsapp} phone=${phone || 'NON'} => WhatsApp ${ok ? 'OK' : 'KO'}`);
    }
  }
  console.log('');

  console.log('--- Locataire (reçoit "Votre ticket a bien été enregistré" + WhatsApp) ---');
  const locataireResult = await ensureContact(tenantId, locataireEmail, 'locataire', {
    phone: locatairePhone,
    label: 'Locataire'
  });
  console.log(JSON.stringify(locataireResult, null, 2));

  console.log('\n--- Agence (reçoivent "Nouveau ticket de maintenance" + WhatsApp) ---');
  for (let i = 0; i < agencyEmails.length; i++) {
    const email = agencyEmails[i];
    const phone = agencyPhones[i] ?? null;
    const result = await ensureContact(tenantId, email, 'agence', {
      phone,
      label: `Admin ${i + 1}`
    });
    console.log(JSON.stringify(result, null, 2));
  }

  console.log('\n--- Vérification résolution WhatsApp ---');
  async function resolveWhatsAppContactId(tId: string, email: string): Promise<string | null> {
    const c = await prisma.crmContact.findFirst({
      where: {
        tenantId: tId,
        email: { equals: email.trim(), mode: 'insensitive' },
        consentWhatsapp: true
      },
      select: { id: true, whatsappNumber: true, phonePrimary: true }
    });
    if (!c) return null;
    const hasPhone = (c.whatsappNumber?.trim() || c.phonePrimary?.trim()) ?? '';
    return hasPhone ? c.id : null;
  }
  const tenantResolved = await resolveWhatsAppContactId(tenantId, locataireEmail);
  console.log('Locataire résolu pour WhatsApp:', tenantResolved ?? 'NON');
  for (const email of agencyEmails) {
    const id = await resolveWhatsAppContactId(tenantId, email);
    console.log(`Agence ${email}:`, id ?? 'NON');
  }

  console.log('\n--- Test ---');
  console.log('Créez un nouveau ticket de maintenance avec le compte locataire (devaccrocs@gmail.com).');
  console.log('Vous devriez recevoir l\'email + un WhatsApp (locataire) et les admins agence aussi (email + WhatsApp).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
