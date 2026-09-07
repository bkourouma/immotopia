/**
 * Seed script for Communication Module – default template and notification rule.
 * Creates PAYMENT_RECEIVED email template and rule so US1 can be tested end-to-end.
 * Run: npx ts-node prisma/seeds/communication-seed.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedCommunication() {
  console.log('📬 Seeding Communication module (default template + rule)...');

  const tenant = await prisma.tenant.findFirst({
    where: { status: 'ACTIVE' }
  });

  if (!tenant) {
    console.log('⚠️  No active tenant found. Skipping communication seed.');
    return;
  }

  console.log(`  Using tenant: ${tenant.name} (${tenant.id})`);

  // Default email template: confirmation de paiement
  const existingTemplate = await prisma.communicationTemplate.findFirst({
    where: {
      tenant_id: tenant.id,
      name: 'Confirmation de paiement reçu',
      channel: 'EMAIL'
    }
  });

  let templateId: string;
  if (existingTemplate) {
    console.log('  Template "Confirmation de paiement reçu" already exists.');
    templateId = existingTemplate.id;
  } else {
    const template = await prisma.communicationTemplate.create({
      data: {
        tenant_id: tenant.id,
        name: 'Confirmation de paiement reçu',
        type: 'NOTIFICATION',
        channel: 'EMAIL',
        subject: 'Paiement reçu – {{amount}} {{currency}}',
        body: `<p>Bonjour,</p>
<p>Nous vous confirmons la réception de votre paiement.</p>
<ul>
<li>Montant : {{amount}} {{currency}}</li>
<li>Référence : {{paymentId}}</li>
</ul>
<p>Cordialement,<br/>L'équipe</p>`,
        variables: ['amount', 'currency', 'paymentId', 'leaseId'],
        is_active: true
      }
    });
    templateId = template.id;
    console.log(`  ✓ Created template: ${template.name} (${template.id})`);
  }

  // Default notification rule: PAYMENT_RECEIVED → RENTER by email
  const existingRule = await prisma.notificationRule.findFirst({
    where: {
      tenant_id: tenant.id,
      event_trigger: 'PAYMENT_RECEIVED',
      name: 'Notification paiement reçu (locataire)'
    }
  });

  if (existingRule) {
    console.log('  Rule "Notification paiement reçu (locataire)" already exists.');
  } else {
    await prisma.notificationRule.create({
      data: {
        tenant_id: tenant.id,
        name: 'Notification paiement reçu (locataire)',
        event_trigger: 'PAYMENT_RECEIVED',
        recipient_types: ['RENTER'],
        template_id_email: templateId,
        template_id_whatsapp: null,
        template_id_sms: null,
        copy_agency: false,
        active: true
      }
    });
    console.log('  ✓ Created rule: Notification paiement reçu (locataire)');
  }

  console.log('\n✅ Communication seed completed.');
}

seedCommunication()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
