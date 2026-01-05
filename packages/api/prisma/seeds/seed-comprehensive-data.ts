import {
  PrismaClient,
  CrmContactStatus,
  CrmDealType,
  CrmDealStage,
  CrmActivityType,
  CrmActivityDirection,
  CrmAppointmentType,
  CrmAppointmentStatus,
  CrmContactRoleType,
  GlobalRole,
  PropertyType,
  PropertyOwnershipType,
  PropertyTransactionMode,
  PropertyStatus,
  PropertyAvailability,
  PropertyDocumentType,
  RentalLeaseStatus,
  RentalBillingFrequency,
  RentalInstallmentStatus,
  RentalPaymentMethod,
  RentalPaymentStatus,
  RentalDocumentType,
  RentalDocumentStatus,
  MaturityLevel,
  ClientType,
  MembershipStatus,
  RentalPenaltyMode
} from '@prisma/client';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

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

// Helper to generate unique property reference
async function generatePropertyReference(_tenantId: string, index: number): Promise<string> {
  const prefix = 'PROP';
  const year = new Date().getFullYear();
  const number = String(index + 1).padStart(6, '0');
  return `${prefix}-${year}-${number}`;
}

// Helper to generate unique lease number
async function generateLeaseNumber(_tenantId: string, index: number): Promise<string> {
  const prefix = 'BAIL';
  const year = new Date().getFullYear();
  const number = String(index + 1).padStart(4, '0');
  return `${prefix}-${year}-${number}`;
}

// Ivorian and West African names for realistic data
const firstNames = [
  'Kouamé', 'Kouassi', 'Kouadio', 'Affoué', 'Akissi', 'Aya', 'Amara', 'Aminata',
  'Yao', 'Yapi', 'N\'Guessan', 'Assa', 'Assi', 'Bamba', 'Béatrice', 'Clément',
  'Djédjé', 'Élise', 'François', 'Gisèle', 'Henri', 'Innocent', 'Jean', 'Joséphine',
  'Koffi', 'Martine', 'N\'Goran', 'Patrice', 'Pierre', 'Sandrine', 'Sylvain', 'Thérèse',
  'Amadou', 'Fatima', 'Moussa', 'Mariam', 'Ibrahim', 'Aissata', 'Ousmane', 'Kadiatou',
  'Boubacar', 'Hawa', 'Sékou', 'Modibo', 'Fanta', 'Lassana', 'Kadija', 'Mamadou',
  'Ramata', 'Sidiki', 'Bakary', 'Daouda', 'Rokia', 'Youssouf', 'Sira', 'Hamidou',
  'Maimouna', 'Djibril', 'Nene', 'Seydou', 'Nana', 'Alassane', 'Binta', 'Tidiane',
  'Hadja', 'Cheick', 'Djeneba', 'Ibrahima', 'Kadi', 'Mahamadou', 'Oumou', 'Salif',
  'Awa', 'Bintou', 'Diarra', 'Fadima', 'Goundo', 'Hawa', 'Idrissa', 'Jibril',
  'Kadiatou', 'Lassana', 'Mamadou', 'Nene', 'Ousmane', 'Penda', 'Ramatou', 'Saliou',
  'Tidiane', 'Yacouba', 'Zainab', 'Abdoulaye', 'Aminata', 'Bakary', 'Coumba', 'Demba'
];

const lastNames = [
  'Kouamé', 'Kouassi', 'Kouadio', 'Diabaté', 'Ouattara', 'Bédié', 'Gbagbo', 'Blé',
  'Sangaré', 'Coulibaly', 'Yapi', 'N\'Guessan', 'Amani', 'Koné', 'Traoré', 'Diarra',
  'Diallo', 'Keita', 'Camara', 'Touré', 'Dembélé', 'Sissoko', 'Ba', 'Diawara',
  'Doumbia', 'Sidibé', 'Doucouré', 'Samaké', 'Togola', 'Fofana', 'Kanté', 'Konaté',
  'Ballo', 'Konaré', 'Béré', 'Haidara', 'Kaba', 'Magassa', 'Niakaté', 'Soumahoro',
  'Sanogo', 'Bambara', 'Maiga', 'Bagayogo', 'Yao', 'Amani', 'Blé', 'Bamba',
  'Cissé', 'Diarra', 'Diallo', 'Doumbia', 'Fofana', 'Keita', 'Konaté', 'Sangaré',
  'Sidibé', 'Traoré', 'Touré', 'Ba', 'Camara', 'Dembélé', 'Diawara', 'Sissoko',
  'Togola', 'Samaké', 'Kanté', 'Konaré', 'Ballo', 'Béré', 'Haidara', 'Kaba'
];

const locations = [
  'Cocody', 'Marcory', 'Yopougon', 'Plateau', 'Adjamé', 'Attécoubé',
  'Abobo', 'Treichville', 'Koumassi', 'Port-Bouët', 'Anyama', 'Bingerville',
  'Abengourou', 'Bouaké', 'Daloa', 'Korhogo', 'Man', 'San-Pédro'
];

const emailDomains = [
  'gmail.com', 'yahoo.fr', 'outlook.com', 'hotmail.com', 'live.fr',
  'orange.ci', 'mtn.ci', 'moov.ci', 'protonmail.com', 'icloud.com'
];

const sources = ['website', 'referral', 'walk-in', 'social', 'call', 'email', 'partner'];

const propertyTypes = [
  PropertyType.APPARTEMENT,
  PropertyType.MAISON_VILLA,
  PropertyType.STUDIO,
  PropertyType.DUPLEX_TRIPLEX,
  PropertyType.BUREAU,
  PropertyType.BOUTIQUE_COMMERCIAL,
  PropertyType.TERRAIN,
  PropertyType.IMMEUBLE
];

async function main() {
  console.log('🌱 Starting comprehensive data seeding...\n');

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
    { first: 'Koffi', last: 'N\'Guessan' }
  ];

  const members = [];
  for (let i = 0; i < 7; i++) {
    const name = collaboratorNames[i];
    const email = `collab${i + 1}.${name.first.toLowerCase()}.${name.last.toLowerCase()}@agence-mali.com`;
    
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

    let membership = await prisma.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId: tenant.id
        }
      }
    });

    if (!membership) {
      membership = await prisma.membership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          status: MembershipStatus.ACTIVE,
          acceptedAt: new Date()
        }
      });
    } else if (membership.status !== MembershipStatus.ACTIVE) {
      membership = await prisma.membership.update({
        where: { id: membership.id },
        data: { status: MembershipStatus.ACTIVE, acceptedAt: new Date() }
      });
    }

    const roleKey = roleKeys[i];
    const role = roleKey === 'TENANT_ADMIN' ? tenantAdminRole : 
                 roleKey === 'TENANT_MANAGER' ? tenantManagerRole : tenantAgentRole;
    
    await prisma.userRole.deleteMany({
      where: { userId: user.id, tenantId: tenant.id }
    });
    
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
        tenantId: tenant.id
      }
    });

    console.log(`  ✓ Created ${roleKey}: ${name.first} ${name.last}`);
    members.push({ user, membership });
  }

  const allCollaborators = [adminUser, ...members.map(m => m.user)];

  // ==========================================
  // 2. Create 200 Contacts (60 clients, 140 leads)
  // ==========================================
  console.log('\n📇 Creating 200 contacts (60 clients, 140 leads)...');
  const contacts = [];
  
  // Create 60 clients (ACTIVE_CLIENT)
  for (let i = 0; i < 60; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const domain = emailDomains[Math.floor(Math.random() * emailDomains.length)];
    const email = `client${i + 1}.${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
    const phone = `+225 ${Math.floor(Math.random() * 9) + 1}${String(Math.floor(Math.random() * 90000000) + 10000000)}`;
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
        lastInteractionAt: lastInteraction,
        city: locations[Math.floor(Math.random() * locations.length)],
        address: `${Math.floor(Math.random() * 200) + 1} Rue ${lastName}`,
        maturityLevel: [MaturityLevel.COLD, MaturityLevel.WARM, MaturityLevel.HOT][Math.floor(Math.random() * 3)],
        score: Math.floor(Math.random() * 100)
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
  console.log(`  ✓ Created 60 clients`);

  // Create 140 leads (LEAD)
  for (let i = 0; i < 140; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const domain = emailDomains[Math.floor(Math.random() * emailDomains.length)];
    const email = `lead${i + 1}.${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
    const phone = `+225 ${Math.floor(Math.random() * 9) + 1}${String(Math.floor(Math.random() * 90000000) + 10000000)}`;
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
        lastInteractionAt: lastInteraction,
        city: locations[Math.floor(Math.random() * locations.length)],
        address: `${Math.floor(Math.random() * 200) + 1} Rue ${lastName}`,
        maturityLevel: [MaturityLevel.COLD, MaturityLevel.WARM, MaturityLevel.HOT][Math.floor(Math.random() * 3)],
        score: Math.floor(Math.random() * 100)
      }
    });

    contacts.push(contact);
  }
  console.log(`  ✓ Created 140 leads`);

  const clientContacts = contacts.filter(c => c.status === CrmContactStatus.ACTIVE_CLIENT);

  // ==========================================
  // 3. Create 205 Deals (affaires)
  // ==========================================
  console.log('\n💼 Creating 205 deals...');
  const deals = [];
  const allContactsForDeals = [...clientContacts, ...contacts.slice(0, 100)];

  for (let i = 0; i < 205; i++) {
    const contact = allContactsForDeals[Math.floor(Math.random() * allContactsForDeals.length)];
    const dealType = Math.random() > 0.5 ? CrmDealType.ACHAT : CrmDealType.LOCATION;
    const assignedTo = allCollaborators[Math.floor(Math.random() * allCollaborators.length)];
    const location = locations[Math.floor(Math.random() * locations.length)];
    
    const stages = Object.values(CrmDealStage);
    const stage = stages[Math.floor(Math.random() * stages.length)];
    
    const budgetMin = dealType === CrmDealType.ACHAT 
      ? Math.floor(Math.random() * 50000000) + 10000000
      : Math.floor(Math.random() * 50000) + 50000;
    const budgetMax = budgetMin + (dealType === CrmDealType.ACHAT 
      ? Math.floor(Math.random() * 20000000) + 5000000
      : Math.floor(Math.random() * 50000) + 50000);

    const deal = await prisma.crmDeal.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        type: dealType,
        stage,
        budgetMin,
        budgetMax,
        locationZone: location,
        criteriaJson: {
          rooms: Math.floor(Math.random() * 4) + 2,
          surface: Math.floor(Math.random() * 100) + 60,
          furnished: Math.random() > 0.5
        },
        expectedValue: dealType === CrmDealType.ACHAT ? budgetMax : budgetMax * 12,
        probability: Math.floor(Math.random() * 40) + 40,
        assignedToUserId: assignedTo.id,
        closedAt: stage === CrmDealStage.WON || stage === CrmDealStage.LOST
          ? randomDate(30)
          : null,
        closedReason: stage === CrmDealStage.LOST
          ? ['Budget insuffisant', 'Zone non disponible', 'Client a trouvé ailleurs'][Math.floor(Math.random() * 3)]
          : null,
        createdAt: randomDate(90)
      }
    });

    deals.push(deal);
  }
  console.log(`  ✓ Created 205 deals`);

  // ==========================================
  // 4. Create 75 Activities
  // ==========================================
  console.log('\n📞 Creating 75 activities...');
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

  for (let i = 0; i < 75; i++) {
    const contact = contacts[Math.floor(Math.random() * contacts.length)];
    const deal = Math.random() > 0.3 ? deals[Math.floor(Math.random() * deals.length)] : null;
    const activityType = Object.values(CrmActivityType)[Math.floor(Math.random() * Object.values(CrmActivityType).length)];
    const createdBy = allCollaborators[Math.floor(Math.random() * allCollaborators.length)];
    const direction = activityType === CrmActivityType.NOTE || activityType === CrmActivityType.TASK
      ? CrmActivityDirection.INTERNAL
      : (Math.random() > 0.5 ? CrmActivityDirection.OUT : CrmActivityDirection.IN);
    
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
  console.log('  ✓ Created 75 activities');

  // ==========================================
  // 5. Create 180 Appointments (rendez-vous)
  // ==========================================
  console.log('\n📅 Creating 180 appointments...');
  const appointmentLocations = [
    'Bureau agence - Plateau',
    'Cocody',
    'Marcory',
    'Yopougon',
    'Adjamé',
    'Treichville',
    'Koumassi'
  ];

  const appointmentStatuses: CrmAppointmentStatus[] = [
    CrmAppointmentStatus.SCHEDULED,
    CrmAppointmentStatus.CONFIRMED,
    CrmAppointmentStatus.DONE,
    CrmAppointmentStatus.NO_SHOW,
    CrmAppointmentStatus.CANCELED
  ];

  for (let i = 0; i < 180; i++) {
    const contact = contacts[Math.floor(Math.random() * contacts.length)];
    const deal = Math.random() > 0.4 ? deals[Math.floor(Math.random() * deals.length)] : null;
    const appointmentType = Math.random() > 0.5 ? CrmAppointmentType.RDV : CrmAppointmentType.VISITE;
    const createdBy = allCollaborators[Math.floor(Math.random() * allCollaborators.length)];
    const assignedTo = allCollaborators[Math.floor(Math.random() * allCollaborators.length)];
    const status = appointmentStatuses[Math.floor(Math.random() * appointmentStatuses.length)];
    
    const startAt = status === CrmAppointmentStatus.DONE || status === CrmAppointmentStatus.NO_SHOW || status === CrmAppointmentStatus.CANCELED
      ? randomDate(30)
      : randomFutureDate(30);
    const endAt = new Date(startAt.getTime() + (60 + Math.floor(Math.random() * 120)) * 60000);
    const location = appointmentLocations[Math.floor(Math.random() * appointmentLocations.length)];

    const appointment = await prisma.crmAppointment.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        dealId: deal?.id,
        appointmentType,
        startAt,
        endAt,
        location,
        status,
        createdByUserId: createdBy.id,
        assignedToUserId: assignedTo.id
      }
    });

    if (Math.random() > 0.7) {
      const extraCollaborator = allCollaborators[Math.floor(Math.random() * allCollaborators.length)];
      if (extraCollaborator.id !== assignedTo.id) {
        await prisma.crmAppointmentCollaborator.create({
          data: {
            appointmentId: appointment.id,
            userId: extraCollaborator.id
          }
        });
      }
    }
  }
  console.log('  ✓ Created 180 appointments');

  // ==========================================
  // 6. Create 80 Properties (propriétés)
  // ==========================================
  console.log('\n🏠 Creating 80 properties...');
  const properties = [];
  const propertyTitles = [
    'Appartement moderne 3 pièces',
    'Villa avec jardin',
    'Studio meublé',
    'Duplex de standing',
    'Bureau professionnel',
    'Boutique commerciale',
    'Terrain constructible',
    'Immeuble locatif'
  ];

  for (let i = 0; i < 80; i++) {
    const propertyType = propertyTypes[Math.floor(Math.random() * propertyTypes.length)];
    const reference = await generatePropertyReference(tenant.id, i);
    const location = locations[Math.floor(Math.random() * locations.length)];
    const owner = allCollaborators[Math.floor(Math.random() * allCollaborators.length)];
    
    const property = await prisma.property.create({
      data: {
        internalReference: reference,
        propertyType,
        ownershipType: PropertyOwnershipType.TENANT,
        tenantId: tenant.id,
        ownerUserId: owner.id,
        title: `${propertyTitles[Math.floor(Math.random() * propertyTitles.length)]} - ${location}`,
        description: `Belle propriété située à ${location} avec toutes les commodités.`,
        address: `${Math.floor(Math.random() * 200) + 1} Rue ${lastNames[Math.floor(Math.random() * lastNames.length)]}, ${location}`,
        locationZone: location,
        latitude: 5.3 + Math.random() * 0.2,
        longitude: -4.0 + Math.random() * 0.2,
        transactionModes: [PropertyTransactionMode.SALE, PropertyTransactionMode.RENTAL],
        price: Math.floor(Math.random() * 50000000) + 10000000,
        fees: Math.floor(Math.random() * 500000) + 100000,
        currency: 'FCFA',
        surfaceArea: Math.floor(Math.random() * 200) + 50,
        surfaceUseful: Math.floor(Math.random() * 150) + 40,
        rooms: Math.floor(Math.random() * 4) + 2,
        bedrooms: Math.floor(Math.random() * 3) + 1,
        bathrooms: Math.floor(Math.random() * 2) + 1,
        status: Object.values(PropertyStatus)[Math.floor(Math.random() * Object.values(PropertyStatus).length)],
        availability: Object.values(PropertyAvailability)[Math.floor(Math.random() * Object.values(PropertyAvailability).length)],
        qualityScore: Math.floor(Math.random() * 40) + 60
      }
    });

    // Create property document
    await prisma.propertyDocument.create({
      data: {
        propertyId: property.id,
        documentType: PropertyDocumentType.TITLE_DEED,
        filePath: `/properties/${property.id}/title_deed.pdf`,
        fileUrl: `https://storage.example.com/properties/${property.id}/title_deed.pdf`,
        fileName: `title_deed_${property.id}.pdf`,
        fileSize: Math.floor(Math.random() * 1000000) + 500000,
        mimeType: 'application/pdf',
        isRequired: true,
        isValid: true
      }
    });

    properties.push(property);
  }
  console.log('  ✓ Created 80 properties with documents');

  // ==========================================
  // 7. Create 25 Rental Leases (baux) with installments and payments
  // ==========================================
  console.log('\n📋 Creating 25 rental leases with installments and payments...');
  const leases = [];

  // Get or create tenant clients for renters and owners
  const renterClients = [];
  const ownerClients = [];
  
  // Create renter clients
  for (let i = 0; i < 25; i++) {
    const clientContact = clientContacts[i % clientContacts.length];
    
    // Find or create user for this contact
    let renterUser = await prisma.user.findUnique({
      where: { email: clientContact.email }
    });

    if (!renterUser) {
      renterUser = await prisma.user.create({
        data: {
          email: clientContact.email,
          passwordHash,
          fullName: `${clientContact.firstName} ${clientContact.lastName}`,
          globalRole: GlobalRole.USER,
          emailVerified: true,
          isActive: true
        }
      });
    }

    // Create tenant client as renter
    let tenantClient = await prisma.tenantClient.findUnique({
      where: {
        userId_tenantId: {
          userId: renterUser.id,
          tenantId: tenant.id
        }
      }
    });

    if (!tenantClient) {
      tenantClient = await prisma.tenantClient.create({
        data: {
          userId: renterUser.id,
          tenantId: tenant.id,
          clientType: ClientType.RENTER
        }
      });
    }

    renterClients.push(tenantClient);
  }

  // Create owner clients (different contacts)
  for (let i = 0; i < 10; i++) {
    const ownerContact = clientContacts[(i + 30) % clientContacts.length];
    
    // Find or create user for this contact
    let ownerUser = await prisma.user.findUnique({
      where: { email: `owner.${ownerContact.email}` }
    });

    if (!ownerUser) {
      ownerUser = await prisma.user.create({
        data: {
          email: `owner.${ownerContact.email}`,
          passwordHash,
          fullName: `${ownerContact.firstName} ${ownerContact.lastName} (Owner)`,
          globalRole: GlobalRole.USER,
          emailVerified: true,
          isActive: true
        }
      });
    }

    // Create tenant client as owner
    let tenantClient = await prisma.tenantClient.findUnique({
      where: {
        userId_tenantId: {
          userId: ownerUser.id,
          tenantId: tenant.id
        }
      }
    });

    if (!tenantClient) {
      tenantClient = await prisma.tenantClient.create({
        data: {
          userId: ownerUser.id,
          tenantId: tenant.id,
          clientType: ClientType.OWNER
        }
      });
    }

    ownerClients.push(tenantClient);
  }

  for (let i = 0; i < 25; i++) {
    const property = properties[Math.floor(Math.random() * properties.length)];
    const renterClient = renterClients[i];
    const ownerClient = ownerClients[i % ownerClients.length]; // Use owner clients
    const leaseNumber = await generateLeaseNumber(tenant.id, i);
    const startDate = randomDate(365);
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + Math.floor(Math.random() * 2) + 1);
    
    const rentAmount = Math.floor(Math.random() * 200000) + 50000;
    const serviceCharge = Math.floor(Math.random() * 50000) + 10000;
    const securityDeposit = rentAmount * 2;

    const lease = await prisma.rentalLease.create({
      data: {
        tenant_id: tenant.id,
        property_id: property.id,
        primary_renter_client_id: renterClient.id,
        owner_client_id: ownerClient.id,
        lease_number: leaseNumber,
        status: RentalLeaseStatus.ACTIVE,
        start_date: startDate,
        end_date: endDate,
        move_in_date: startDate,
        billing_frequency: RentalBillingFrequency.MONTHLY,
        due_day_of_month: 5,
        currency: 'FCFA',
        rent_amount: rentAmount,
        service_charge_amount: serviceCharge,
        security_deposit_amount: securityDeposit,
        penalty_grace_days: 5,
        penalty_mode: RentalPenaltyMode.PERCENT_OF_BALANCE,
        penalty_rate: 0.05,
        created_by_user_id: allCollaborators[Math.floor(Math.random() * allCollaborators.length)].id
      }
    });

    // Create security deposit
    await prisma.rentalSecurityDeposit.create({
      data: {
        tenant_id: tenant.id,
        lease_id: lease.id,
        currency: 'FCFA',
        target_amount: securityDeposit,
        collected_amount: securityDeposit,
        held_amount: securityDeposit
      }
    });

    // Create installments (échéances) for the lease
    const installments = [];
    const monthsSinceStart = Math.floor((new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
    const monthsToCreate = Math.min(monthsSinceStart + 3, 12); // Up to 12 months or until now + 3 months

    for (let month = 0; month < monthsToCreate; month++) {
      const periodDate = new Date(startDate);
      periodDate.setMonth(periodDate.getMonth() + month);
      const dueDate = new Date(periodDate);
      dueDate.setDate(5); // Due on 5th of each month

      const isPastDue = dueDate < new Date();
      const status = isPastDue && month < monthsSinceStart
        ? (Math.random() > 0.3 ? RentalInstallmentStatus.PAID : RentalInstallmentStatus.OVERDUE)
        : RentalInstallmentStatus.DUE;

      const installment = await prisma.rentalInstallment.create({
        data: {
          tenant_id: tenant.id,
          lease_id: lease.id,
          period_year: periodDate.getFullYear(),
          period_month: periodDate.getMonth() + 1,
          due_date: dueDate,
          status,
          currency: 'FCFA',
          amount_rent: rentAmount,
          amount_service: serviceCharge,
          amount_other_fees: 0,
          penalty_amount: status === RentalInstallmentStatus.OVERDUE ? Math.floor(rentAmount * 0.05) : 0,
          amount_paid: status === RentalInstallmentStatus.PAID ? rentAmount + serviceCharge : 0,
          paid_at: status === RentalInstallmentStatus.PAID ? dueDate : null
        }
      });

      installments.push(installment);

      // Create payment for paid installments
      if (status === RentalInstallmentStatus.PAID) {
        const payment = await prisma.rentalPayment.create({
          data: {
            tenant_id: tenant.id,
            lease_id: lease.id,
            renter_client_id: renterClient.id,
            method: Object.values(RentalPaymentMethod)[Math.floor(Math.random() * Object.values(RentalPaymentMethod).length)],
            status: RentalPaymentStatus.SUCCESS,
            currency: 'FCFA',
            amount: rentAmount + serviceCharge,
            idempotency_key: uuidv4(),
            initiated_at: dueDate,
            succeeded_at: new Date(dueDate.getTime() + Math.random() * 86400000), // Within 24h
            created_by_user_id: allCollaborators[Math.floor(Math.random() * allCollaborators.length)].id
          }
        });

        // Allocate payment to installment
        await prisma.rentalPaymentAllocation.create({
          data: {
            tenant_id: tenant.id,
            payment_id: payment.id,
            installment_id: installment.id,
            amount: rentAmount + serviceCharge,
            currency: 'FCFA'
          }
        });

        // Create payment document
        await prisma.rentalDocument.create({
          data: {
            tenant_id: tenant.id,
            type: RentalDocumentType.RENT_RECEIPT,
            status: RentalDocumentStatus.FINAL,
            lease_id: lease.id,
            installment_id: installment.id,
            payment_id: payment.id,
            document_number: `REC-${lease.lease_number}-${periodDate.getFullYear()}${String(periodDate.getMonth() + 1).padStart(2, '0')}`,
            file_path: `/rentals/${lease.id}/receipts/receipt_${installment.id}.pdf`,
            file_url: `https://storage.example.com/rentals/${lease.id}/receipts/receipt_${installment.id}.pdf`,
            mime_type: 'application/pdf',
            issued_at: payment.succeeded_at,
            title: `Reçu de loyer - ${periodDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`,
            created_by_user_id: allCollaborators[Math.floor(Math.random() * allCollaborators.length)].id
          }
        });
      }
    }

    // Create lease document
    await prisma.rentalDocument.create({
      data: {
        tenant_id: tenant.id,
        type: RentalDocumentType.LEASE_CONTRACT,
        status: RentalDocumentStatus.FINAL,
        lease_id: lease.id,
        document_number: `CONTRACT-${lease.lease_number}`,
        file_path: `/rentals/${lease.id}/contracts/lease_${lease.id}.pdf`,
        file_url: `https://storage.example.com/rentals/${lease.id}/contracts/lease_${lease.id}.pdf`,
        mime_type: 'application/pdf',
        issued_at: startDate,
        title: `Contrat de bail - ${lease.lease_number}`,
        created_by_user_id: allCollaborators[Math.floor(Math.random() * allCollaborators.length)].id
      }
    });

    leases.push(lease);
  }
  console.log('  ✓ Created 25 leases with installments, payments, and documents');

  // ==========================================
  // Summary
  // ==========================================
  console.log('\n✅ Comprehensive data seeding completed!\n');
  console.log('📊 Summary:');
  console.log(`  • Collaborators: 7`);
  console.log(`  • Contacts: 200 (60 clients, 140 leads)`);
  console.log(`  • Deals: 205`);
  console.log(`  • Activities: 75`);
  console.log(`  • Appointments: 180`);
  console.log(`  • Properties: 80 (all with documents)`);
  console.log(`  • Rental Leases: 25 (all with installments, payments, and documents)`);
  console.log(`\n🏢 Tenant: ${tenant.name}`);
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding comprehensive data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

