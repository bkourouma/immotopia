import {
  PrismaClient,
  CrmAppointmentType,
  CrmAppointmentStatus,
  CrmActivityType,
  CrmActivityDirection,
} from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_ID = 'e3e428d1-364b-42c9-a102-a22daa9329c5';

async function main() {
  console.log('🔍 Vérification des données du dashboard CRM...\n');

  // Vérifier le tenant
  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
  });

  if (!tenant) {
    console.error(`❌ Tenant ${TENANT_ID} non trouvé`);
    process.exit(1);
  }

  console.log(`✓ Tenant trouvé: ${tenant.name} (${tenant.id})\n`);

  // Vérifier les contacts disponibles
  const contacts = await prisma.crmContact.findMany({
    where: { tenantId: TENANT_ID },
    take: 20,
  });

  if (contacts.length === 0) {
    console.error('❌ Aucun contact trouvé pour ce tenant. Veuillez créer des contacts d\'abord.');
    process.exit(1);
  }

  console.log(`✓ ${contacts.length} contact(s) trouvé(s)\n`);

  // Vérifier les utilisateurs disponibles
  const users = await prisma.user.findMany({
    where: {
      memberships: {
        some: {
          tenantId: TENANT_ID,
        },
      },
    },
    take: 10,
  });

  if (users.length === 0) {
    console.error('❌ Aucun utilisateur trouvé pour ce tenant.');
    process.exit(1);
  }

  console.log(`✓ ${users.length} utilisateur(s) trouvé(s)\n`);

  // Vérifier les rendez-vous existants
  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const existingAppointments = await prisma.crmAppointment.count({
    where: {
      tenantId: TENANT_ID,
      startAt: { gte: now, lte: sevenDaysFromNow },
      status: { not: CrmAppointmentStatus.CANCELED },
    },
  });

  console.log(`📅 Rendez-vous à venir existants: ${existingAppointments}`);

  // Vérifier les actions en retard existantes
  const existingOverdueActions = await prisma.crmActivity.count({
    where: {
      tenantId: TENANT_ID,
      nextActionAt: { lt: now, not: null },
    },
  });

  console.log(`⚠️  Actions en retard existantes: ${existingOverdueActions}\n`);

  // Ajouter 12 rendez-vous
  const appointmentsToAdd = 12;
  const appointmentsAdded = [];

  console.log(`📅 Ajout de ${appointmentsToAdd} rendez-vous...`);

  for (let i = 0; i < appointmentsToAdd; i++) {
    const contact = contacts[Math.floor(Math.random() * contacts.length)];
    const user = users[Math.floor(Math.random() * users.length)];

    // Créer un rendez-vous dans les 7 prochains jours
    const startAt = new Date(now);
    startAt.setDate(startAt.getDate() + 1 + Math.floor(Math.random() * 6));
    startAt.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 4) * 15, 0, 0);

    const endAt = new Date(startAt);
    endAt.setHours(startAt.getHours() + 1);

    const appointment = await prisma.crmAppointment.create({
      data: {
        tenantId: TENANT_ID,
        contactId: contact.id,
        appointmentType: Math.random() > 0.5 ? CrmAppointmentType.RDV : CrmAppointmentType.VISITE,
        startAt,
        endAt,
        location: ['Bureau agence', 'Chez le client', 'Visite terrain'][Math.floor(Math.random() * 3)],
        status: Math.random() > 0.3 ? CrmAppointmentStatus.SCHEDULED : CrmAppointmentStatus.CONFIRMED,
        createdByUserId: user.id,
        assignedToUserId: user.id,
      },
    });

    appointmentsAdded.push(appointment);
  }

  console.log(`✓ ${appointmentsAdded.length} rendez-vous ajoutés\n`);

  // Ajouter 7 actions en retard
  const overdueActionsToAdd = 7;
  const overdueActionsAdded = [];

  console.log(`⚠️  Ajout de ${overdueActionsToAdd} actions en retard...`);

  for (let i = 0; i < overdueActionsToAdd; i++) {
    const contact = contacts[Math.floor(Math.random() * contacts.length)];
    const user = users[Math.floor(Math.random() * users.length)];

    // Créer une activité avec nextActionAt dans le passé (1-10 jours dans le passé)
    const nextActionAt = new Date(now);
    nextActionAt.setDate(nextActionAt.getDate() - (1 + Math.floor(Math.random() * 10)));
    nextActionAt.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 4) * 15, 0, 0);

    const activity = await prisma.crmActivity.create({
      data: {
        tenantId: TENANT_ID,
        contactId: contact.id,
        activityType: CrmActivityType.CALL,
        direction: CrmActivityDirection.OUT,
        subject: 'Relance client',
        content: `Action de relance pour ${contact.firstName} ${contact.lastName}`,
        occurredAt: new Date(nextActionAt.getTime() - 24 * 60 * 60 * 1000), // 1 jour avant
        createdByUserId: user.id,
        nextActionAt,
        nextActionType: 'Rappel',
      },
    });

    overdueActionsAdded.push(activity);
  }

  console.log(`✓ ${overdueActionsAdded.length} actions en retard ajoutées\n`);

  // Vérifier les nouveaux compteurs
  const newAppointmentsCount = await prisma.crmAppointment.count({
    where: {
      tenantId: TENANT_ID,
      startAt: { gte: now, lte: sevenDaysFromNow },
      status: { not: CrmAppointmentStatus.CANCELED },
    },
  });

  const newOverdueActionsCount = await prisma.crmActivity.count({
    where: {
      tenantId: TENANT_ID,
      nextActionAt: { lt: now, not: null },
    },
  });

  console.log('📊 Résultats finaux:');
  console.log(`   - Rendez-vous à venir: ${newAppointmentsCount}`);
  console.log(`   - Actions en retard: ${newOverdueActionsCount}\n`);

  console.log('✅ Opération terminée avec succès!');
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


