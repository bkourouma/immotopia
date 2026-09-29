import {
  PrismaClient,
  CrmContactStatus,
  CrmDealType,
  CrmDealStage,
  CrmActivityType,
  CrmActivityDirection,
  CrmContactRoleType,
  GlobalRole
} from '@prisma/client';
import bcrypt from 'bcrypt';

import { assertNotProduction } from './assert-not-production';

// Garde en tête : avant toute requête base (seed de développement, jamais en production).
assertNotProduction('seed-crm-data.ts');

const prisma = new PrismaClient();

// Helper function to generate random date within last N days
function randomDate(daysAgo: number): Date {
  const now = new Date();
  const past = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return new Date(past.getTime() + Math.random() * (now.getTime() - past.getTime()));
}

// Helper function to generate random future date
function randomFutureDate(daysAhead: number): Date {
  const now = new Date();
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  return new Date(now.getTime() + Math.random() * (future.getTime() - now.getTime()));
}

// Ivorian and West African names for realistic data
const firstNames = [
  // Ivorian names
  'Kouamé',
  'Kouassi',
  'Kouadio',
  'Affoué',
  'Akissi',
  'Aya',
  'Amara',
  'Aminata',
  'Yao',
  'Yapi',
  "N'Guessan",
  'Assa',
  'Assi',
  'Bamba',
  'Béatrice',
  'Clément',
  'Djédjé',
  'Élise',
  'François',
  'Gisèle',
  'Henri',
  'Innocent',
  'Jean',
  'Joséphine',
  'Koffi',
  'Martine',
  "N'Goran",
  'Patrice',
  'Pierre',
  'Sandrine',
  'Sylvain',
  'Thérèse',
  // Common West African names
  'Amadou',
  'Fatima',
  'Moussa',
  'Mariam',
  'Ibrahim',
  'Aissata',
  'Ousmane',
  'Kadiatou',
  'Boubacar',
  'Hawa',
  'Sékou',
  'Modibo',
  'Fanta',
  'Lassana',
  'Kadija',
  'Mamadou',
  'Ramata',
  'Sidiki',
  'Bakary',
  'Daouda',
  'Rokia',
  'Youssouf',
  'Sira',
  'Hamidou',
  'Maimouna',
  'Djibril',
  'Nene',
  'Seydou',
  'Nana',
  'Alassane',
  'Binta',
  'Tidiane',
  'Hadja',
  'Cheick',
  'Djeneba',
  'Ibrahima',
  'Kadi',
  'Mahamadou',
  'Oumou',
  'Salif'
];

const lastNames = [
  // Ivorian names
  'Kouamé',
  'Kouassi',
  'Kouadio',
  'Diabaté',
  'Ouattara',
  'Bédié',
  'Gbagbo',
  'Blé',
  'Sangaré',
  'Coulibaly',
  'Yapi',
  "N'Guessan",
  'Amani',
  'Koné',
  'Traoré',
  'Diarra',
  'Diallo',
  'Keita',
  'Camara',
  'Touré',
  'Dembélé',
  'Sissoko',
  'Ba',
  'Diawara',
  'Doumbia',
  'Sidibé',
  'Doucouré',
  'Samaké',
  'Togola',
  'Fofana',
  'Kanté',
  'Konaté',
  'Ballo',
  'Konaré',
  'Béré',
  'Haidara',
  'Kaba',
  'Magassa',
  'Niakaté',
  'Soumahoro',
  'Sanogo',
  'Bambara',
  'Maiga',
  'Bagayogo',
  'Yao',
  'Amani',
  'Blé',
  'Bamba'
];

const locations = [
  'Cocody',
  'Marcory',
  'Yopougon',
  'Plateau',
  'Adjamé',
  'Attécoubé',
  'Abobo',
  'Treichville',
  'Koumassi',
  'Port-Bouët',
  'Anyama',
  'Bingerville',
  'Abengourou',
  'Bouaké',
  'Daloa',
  'Korhogo',
  'Man',
  'San-Pédro'
];

const emailDomains = [
  'gmail.com',
  'yahoo.fr',
  'outlook.com',
  'hotmail.com',
  'live.fr',
  'orange.ci',
  'mtn.ci',
  'moov.ci',
  'protonmail.com',
  'icloud.com'
];

const sources = ['website', 'referral', 'walk-in', 'social', 'call', 'email', 'partner'];

const activityTypes: CrmActivityType[] = [
  CrmActivityType.CALL,
  CrmActivityType.EMAIL,
  CrmActivityType.SMS,
  CrmActivityType.WHATSAPP,
  CrmActivityType.VISIT,
  CrmActivityType.MEETING,
  CrmActivityType.NOTE,
  CrmActivityType.TASK
];

async function main() {
  console.log('🌱 Starting CRM data seeding...\n');

  // Find tenant where Amadou Koné is admin
  const adminUser = await prisma.user.findFirst({
    where: {
      fullName: 'Amadou Koné',
      email: 'admin1@agence-mali.com'
    },
    include: {
      memberships: {
        include: {
          tenant: true
        }
      }
    }
  });

  if (!adminUser || !adminUser.memberships.length) {
    throw new Error('Amadou Koné or his tenant not found. Please run the base seed first.');
  }

  const tenant = adminUser.memberships[0].tenant;
  console.log(`✓ Found tenant: ${tenant.name} (${tenant.id})`);

  // Hash password for new users
  const password = 'Test@123456';
  const passwordHash = await bcrypt.hash(password, 10);

  // ==========================================
  // 1. Create 7 Members (collaborators)
  // ==========================================
  console.log('\n👥 Creating 7 members...');
  // Get tenant roles for assignment
  const tenantAdminRole = await prisma.role.findUnique({ where: { key: 'TENANT_ADMIN' } });
  const tenantManagerRole = await prisma.role.findUnique({ where: { key: 'TENANT_MANAGER' } });
  const tenantAgentRole = await prisma.role.findUnique({ where: { key: 'TENANT_AGENT' } });

  if (!tenantAdminRole || !tenantManagerRole || !tenantAgentRole) {
    throw new Error('Tenant roles not found. Please run RBAC seed first.');
  }

  const roleKeys = [
    'TENANT_ADMIN',
    'TENANT_MANAGER',
    'TENANT_AGENT',
    'TENANT_MANAGER',
    'TENANT_AGENT',
    'TENANT_AGENT',
    'TENANT_AGENT'
  ];

  const collaboratorNames = [
    { first: 'Kouamé', last: 'Diabaté' },
    { first: 'Affoué', last: 'Sangaré' },
    { first: 'Kouassi', last: 'Kouamé' },
    { first: 'Akissi', last: 'Coulibaly' },
    { first: 'Yao', last: 'Ouattara' },
    { first: 'Aminata', last: 'Traoré' },
    { first: 'Koffi', last: "N'Guessan" }
  ];

  const members = [];
  for (let i = 0; i < 7; i++) {
    const name = collaboratorNames[i];
    const email = `collab${i + 1}.${name.first.toLowerCase()}.${name.last.toLowerCase()}@agence-mali.com`;

    // Use upsert to handle existing users
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        fullName: `${name.first} ${name.last}`,
        isActive: true
      },
      create: {
        email,
        passwordHash,
        fullName: `${name.first} ${name.last}`,
        globalRole: GlobalRole.USER,
        emailVerified: true,
        isActive: true
      }
    });

    // Check if membership already exists
    let membership = await prisma.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId: tenant.id
        }
      }
    });

    if (!membership) {
      // Create membership
      membership = await prisma.membership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          status: 'ACTIVE',
          acceptedAt: new Date()
        }
      });
    } else if (membership.status !== 'ACTIVE') {
      // Activate if not active
      membership = await prisma.membership.update({
        where: { id: membership.id },
        data: { status: 'ACTIVE', acceptedAt: new Date() }
      });
    }

    // Assign role
    const roleKey = roleKeys[i];
    const role =
      roleKey === 'TENANT_ADMIN' ? tenantAdminRole : roleKey === 'TENANT_MANAGER' ? tenantManagerRole : tenantAgentRole;

    // Remove existing tenant roles for this user
    await prisma.userRole.deleteMany({
      where: { userId: user.id, tenantId: tenant.id }
    });

    // Assign new role
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
        tenantId: tenant.id
      }
    });

    console.log(`  ✓ Created ${roleKey}: ${name.first} ${name.last} (${email})`);
    members.push({ user, membership });
  }

  const allCollaborators = [adminUser, ...members.map(m => m.user)];

  // ==========================================
  // 2. Create 105 Contacts (24 clients, 81 leads)
  // ==========================================
  console.log('\n📇 Creating 105 contacts (24 clients, 81 leads)...');
  const contacts = [];

  // Create 24 clients (ACTIVE_CLIENT)
  for (let i = 0; i < 24; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const domain = emailDomains[Math.floor(Math.random() * emailDomains.length)];
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i + 1}@${domain}`;
    const phone = `+225 ${Math.floor(Math.random() * 9) + 1}${Math.floor(Math.random() * 90000000) + 10000000}`;
    const source = sources[Math.floor(Math.random() * sources.length)];
    const assignedTo = allCollaborators[Math.floor(Math.random() * allCollaborators.length)];
    const lastInteraction = randomDate(30);

    const contact = await prisma.crmContact.create({
      data: {
        tenantId: tenant.id,
        firstName,
        lastName,
        email,
        phonePrimary: phone,
        source,
        status: CrmContactStatus.ACTIVE_CLIENT,
        assignedToUserId: assignedTo.id,
        lastInteractionAt: lastInteraction
      }
    });

    // Add a contact role for clients
    const roleTypes = [
      CrmContactRoleType.PROPRIETAIRE,
      CrmContactRoleType.LOCATAIRE,
      CrmContactRoleType.ACQUEREUR,
      CrmContactRoleType.COPROPRIETAIRE
    ];
    const roleType = roleTypes[Math.floor(Math.random() * roleTypes.length)];

    await prisma.crmContactRole.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        role: roleType,
        active: true,
        startedAt: randomDate(90)
      }
    });

    contacts.push(contact);
  }
  console.log(`  ✓ Created 24 clients`);

  // Create 81 leads (LEAD)
  for (let i = 0; i < 81; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const domain = emailDomains[Math.floor(Math.random() * emailDomains.length)];
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.lead${i + 1}@${domain}`;
    const phone = `+225 ${Math.floor(Math.random() * 9) + 1}${Math.floor(Math.random() * 90000000) + 10000000}`;
    const source = sources[Math.floor(Math.random() * sources.length)];
    const assignedTo = allCollaborators[Math.floor(Math.random() * allCollaborators.length)];
    const lastInteraction = randomDate(60);

    const contact = await prisma.crmContact.create({
      data: {
        tenantId: tenant.id,
        firstName,
        lastName,
        email,
        phonePrimary: phone,
        source,
        status: CrmContactStatus.LEAD,
        assignedToUserId: assignedTo.id,
        lastInteractionAt: lastInteraction
      }
    });

    contacts.push(contact);
  }
  console.log(`  ✓ Created 81 leads`);

  // ==========================================
  // 3. Create 41 Deals (affaires)
  // ==========================================
  console.log('\n💼 Creating 41 deals...');
  const deals = [];
  const clientContacts = contacts.filter(c => c.status === CrmContactStatus.ACTIVE_CLIENT);
  const allContactsForDeals = [...clientContacts, ...contacts.slice(0, 20)]; // Mix of clients and leads

  // Stage distribution
  const stageCounts = {
    [CrmDealStage.NEW]: 5,
    [CrmDealStage.QUALIFIED]: 8,
    [CrmDealStage.VISIT]: 13,
    [CrmDealStage.NEGOTIATION]: 8,
    [CrmDealStage.WON]: 5,
    [CrmDealStage.LOST]: 2
  };

  let dealIndex = 0;
  for (const [stage, count] of Object.entries(stageCounts)) {
    for (let i = 0; i < count; i++) {
      const contact = allContactsForDeals[Math.floor(Math.random() * allContactsForDeals.length)];
      const dealType = Math.random() > 0.5 ? CrmDealType.ACHAT : CrmDealType.LOCATION;
      const assignedTo = allCollaborators[Math.floor(Math.random() * allCollaborators.length)];
      const location = locations[Math.floor(Math.random() * locations.length)];

      // Budget ranges in FCFA
      const budgetMin =
        dealType === CrmDealType.ACHAT
          ? Math.floor(Math.random() * 50000000) + 10000000 // 10M - 60M
          : Math.floor(Math.random() * 50000) + 50000; // 50K - 100K/month
      const budgetMax =
        budgetMin +
        (dealType === CrmDealType.ACHAT
          ? Math.floor(Math.random() * 20000000) + 5000000 // +5M - 25M
          : Math.floor(Math.random() * 50000) + 50000); // +50K - 100K

      const deal = await prisma.crmDeal.create({
        data: {
          tenantId: tenant.id,
          contactId: contact.id,
          type: dealType,
          stage: stage as CrmDealStage,
          budgetMin,
          budgetMax,
          locationZone: location,
          criteriaJson: {
            rooms: Math.floor(Math.random() * 4) + 2,
            surface: Math.floor(Math.random() * 100) + 60,
            furnished: Math.random() > 0.5
          },
          expectedValue: dealType === CrmDealType.ACHAT ? budgetMax : budgetMax * 12,
          probability: Math.floor(Math.random() * 40) + 40, // 40-80%
          assignedToUserId: assignedTo.id,
          closedAt: stage === CrmDealStage.WON || stage === CrmDealStage.LOST ? randomDate(30) : null,
          closedReason:
            stage === CrmDealStage.LOST
              ? ['Budget insuffisant', 'Zone non disponible', 'Client a trouvé ailleurs'][Math.floor(Math.random() * 3)]
              : null,
          createdAt: randomDate(90)
        }
      });

      deals.push(deal);
      dealIndex++;
    }
    console.log(`  ✓ Created ${count} deals in stage ${stage}`);
  }

  // ==========================================
  // 4. Create 150 Activities
  // ==========================================
  console.log('\n📞 Creating 150 activities...');
  const activitySubjects = [
    'Appel téléphonique',
    'Email de suivi',
    'SMS de confirmation',
    'Message WhatsApp',
    'Visite de propriété',
    'Réunion client',
    'Note interne',
    'Tâche de suivi'
  ];

  const activityContents = [
    'Discussion sur les besoins du client',
    'Envoi de propositions immobilières',
    'Confirmation de rendez-vous',
    'Réponse à une question client',
    'Suivi après visite',
    'Négociation des conditions',
    'Mise à jour du dossier',
    'Relance client'
  ];

  for (let i = 0; i < 150; i++) {
    const contact = contacts[Math.floor(Math.random() * contacts.length)];
    const deal = Math.random() > 0.3 ? deals[Math.floor(Math.random() * deals.length)] : null;
    const activityType = activityTypes[Math.floor(Math.random() * activityTypes.length)];
    const createdBy = allCollaborators[Math.floor(Math.random() * allCollaborators.length)];
    const direction =
      activityType === CrmActivityType.NOTE || activityType === CrmActivityType.TASK
        ? CrmActivityDirection.INTERNAL
        : Math.random() > 0.5
          ? CrmActivityDirection.OUT
          : CrmActivityDirection.IN;

    const subject = activitySubjects[Math.floor(Math.random() * activitySubjects.length)];
    const content = activityContents[Math.floor(Math.random() * activityContents.length)];

    await prisma.crmActivity.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        dealId: deal?.id,
        activityType,
        direction,
        subject,
        content: `${content} - ${contact.firstName} ${contact.lastName}`,
        outcome: Math.random() > 0.6 ? 'Succès' : null,
        occurredAt: randomDate(60),
        createdByUserId: createdBy.id,
        nextActionAt: Math.random() > 0.5 ? randomFutureDate(7) : null,
        nextActionType: Math.random() > 0.5 ? 'Rappel' : null
      }
    });
  }
  console.log('  ✓ Created 150 activities');

  // ==========================================
  // Summary
  // ==========================================
  console.log('\n✅ CRM data seeding completed!\n');
  console.log('📊 Summary:');
  console.log(`  • Members: 7 (1 existing + 6 new)`);
  console.log(`  • Contacts: 105 (24 clients, 81 leads)`);
  console.log(`  • Deals: 41 (various stages)`);
  console.log(`  • Activities: 150`);
  console.log(`\n🏢 Tenant: ${tenant.name}`);
  console.log('');
}

main()
  .catch(e => {
    console.error('❌ Error seeding CRM data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
