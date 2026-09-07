import {
  PrismaClient,
  CrmContactStatus,
  CrmDealType,
  CrmDealStage,
  CrmActivityType,
  CrmActivityDirection,
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
  TenantType,
  RentalPenaltyMode,
  ValuationMethod,
  LoanStatus,
  ExpenseCategory,
  WorkProgramStatus,
  PatrimonyDocType
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
  'KouamÃ©', 'Kouassi', 'Kouadio', 'AffouÃ©', 'Akissi', 'Aya', 'Amara', 'Aminata',
  'Yao', 'Yapi', 'N\'Guessan', 'Assa', 'Assi', 'Bamba', 'BÃ©atrice', 'ClÃ©ment',
  'DjÃ©djÃ©', 'Ã‰lise', 'FranÃ§ois', 'GisÃ¨le', 'Henri', 'Innocent', 'Jean', 'JosÃ©phine',
  'Koffi', 'Martine', 'N\'Goran', 'Patrice', 'Pierre', 'Sandrine', 'Sylvain', 'ThÃ©rÃ¨se',
  'Amadou', 'Fatima', 'Moussa', 'Mariam', 'Ibrahim', 'Aissata', 'Ousmane', 'Kadiatou',
  'Boubacar', 'Hawa', 'SÃ©kou', 'Modibo', 'Fanta', 'Lassana', 'Kadija', 'Mamadou',
  'Ramata', 'Sidiki', 'Bakary', 'Daouda', 'Rokia', 'Youssouf', 'Sira', 'Hamidou',
  'Maimouna', 'Djibril', 'Nene', 'Seydou', 'Nana', 'Alassane', 'Binta', 'Tidiane',
  'Hadja', 'Cheick', 'Djeneba', 'Ibrahima', 'Kadi', 'Mahamadou', 'Oumou', 'Salif',
  'Awa', 'Bintou', 'Diarra', 'Fadima', 'Goundo', 'Hawa', 'Idrissa', 'Jibril',
  'Kadiatou', 'Lassana', 'Mamadou', 'Nene', 'Ousmane', 'Penda', 'Ramatou', 'Saliou',
  'Tidiane', 'Yacouba', 'Zainab', 'Abdoulaye', 'Aminata', 'Bakary', 'Coumba', 'Demba'
];

const lastNames = [
  'KouamÃ©', 'Kouassi', 'Kouadio', 'DiabatÃ©', 'Ouattara', 'BÃ©diÃ©', 'Gbagbo', 'BlÃ©',
  'SangarÃ©', 'Coulibaly', 'Yapi', 'N\'Guessan', 'Amani', 'KonÃ©', 'TraorÃ©', 'Diarra',
  'Diallo', 'Keita', 'Camara', 'TourÃ©', 'DembÃ©lÃ©', 'Sissoko', 'Ba', 'Diawara',
  'Doumbia', 'SidibÃ©', 'DoucourÃ©', 'SamakÃ©', 'Togola', 'Fofana', 'KantÃ©', 'KonatÃ©',
  'Ballo', 'KonarÃ©', 'BÃ©rÃ©', 'Haidara', 'Kaba', 'Magassa', 'NiakatÃ©', 'Soumahoro',
  'Sanogo', 'Bambara', 'Maiga', 'Bagayogo', 'Yao', 'Amani', 'BlÃ©', 'Bamba',
  'CissÃ©', 'Diarra', 'Diallo', 'Doumbia', 'Fofana', 'Keita', 'KonatÃ©', 'SangarÃ©',
  'SidibÃ©', 'TraorÃ©', 'TourÃ©', 'Ba', 'Camara', 'DembÃ©lÃ©', 'Diawara', 'Sissoko',
  'Togola', 'SamakÃ©', 'KantÃ©', 'KonarÃ©', 'Ballo', 'BÃ©rÃ©', 'Haidara', 'Kaba'
];

const locations = [
  'Cocody', 'Marcory', 'Yopougon', 'Plateau', 'AdjamÃ©', 'AttÃ©coubÃ©',
  'Abobo', 'Treichville', 'Koumassi', 'Port-BouÃ«t', 'Anyama', 'Bingerville',
  'Abengourou', 'BouakÃ©', 'Daloa', 'Korhogo', 'Man', 'San-PÃ©dro'
];

const emailDomains = [
  'gmail.com', 'yahoo.fr', 'outlook.com', 'hotmail.com', 'live.fr',
  'orange.ci', 'mtn.ci', 'moov.ci', 'protonmail.com', 'icloud.com'
];

const sources = ['website', 'referral', 'walk-in', 'social', 'call', 'email', 'partner'];

async function main() {
  console.log('ðŸŒ± Starting comprehensive data seeding...\n');

  // Hash password for seed users
  const password = 'Test@123456';
  const passwordHash = await bcrypt.hash(password, 10);

  // Resolve admin + tenant with fallback to base seed data
  let adminUser = await prisma.user.findUnique({
    where: { email: 'admin1@agence-mali.com' }
  });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: 'admin1@agence-mali.com',
        passwordHash,
        fullName: 'Amadou Kone',
        globalRole: GlobalRole.USER,
        emailVerified: true,
        isActive: true
      }
    });
  }

  let tenant = await prisma.tenant.findUnique({ where: { slug: 'agence-mali' } });
  if (!tenant) {
    tenant = await prisma.tenant.findFirst({
      where: {
        OR: [{ name: 'Agence Immobiliere du Mali' }, { name: 'Agence Immobilière du Mali' }]
      }
    });
  }
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: 'Agence Immobiliere du Mali',
        slug: 'agence-mali',
        type: TenantType.AGENCY,
        website: 'https://agence-mali.com',
        isActive: true
      }
    });
  }

  // Ensure admin membership exists for this tenant
  const existingMembership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: adminUser.id,
        tenantId: tenant.id
      }
    }
  });
  if (!existingMembership) {
    await prisma.membership.create({
      data: {
        userId: adminUser.id,
        tenantId: tenant.id,
        status: MembershipStatus.ACTIVE,
        acceptedAt: new Date()
      }
    });
  } else if (existingMembership.status !== MembershipStatus.ACTIVE) {
    await prisma.membership.update({
      where: { id: existingMembership.id },
      data: { status: MembershipStatus.ACTIVE, acceptedAt: existingMembership.acceptedAt || new Date() }
    });
  }

  console.log(`✓ Found tenant: ${tenant.name} (${tenant.id})`);

  // ==========================================
  // 1. Create 7 Members (collaborators)
  // ==========================================
  console.log('\nðŸ‘¥ Creating 7 members...');
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
    { first: 'KouamÃ©', last: 'DiabatÃ©' },
    { first: 'AffouÃ©', last: 'SangarÃ©' },
    { first: 'Kouassi', last: 'KouamÃ©' },
    { first: 'Akissi', last: 'Coulibaly' },
    { first: 'Yao', last: 'Ouattara' },
    { first: 'Aminata', last: 'TraorÃ©' },
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

    console.log(`  âœ“ Created ${roleKey}: ${name.first} ${name.last}`);
    members.push({ user, membership });
  }

  const allCollaborators = [adminUser, ...members.map(m => m.user)];

  // ==========================================
  // 2. Create 200 Contacts (60 clients, 140 leads)
  // ==========================================
  console.log('\nðŸ“‡ Creating 200 contacts (60 clients, 140 leads)...');
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
  console.log(`  âœ“ Created 60 clients`);

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
  console.log(`  âœ“ Created 140 leads`);

  const clientContacts = contacts.filter(c => c.status === CrmContactStatus.ACTIVE_CLIENT);

  // ==========================================
  // 3. Create 205 Deals (affaires)
  // ==========================================
  console.log('\nðŸ’¼ Creating 205 deals...');
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
          ? ['Budget insuffisant', 'Zone non disponible', 'Client a trouvÃ© ailleurs'][Math.floor(Math.random() * 3)]
          : null,
        createdAt: randomDate(90)
      }
    });

    deals.push(deal);
  }
  console.log(`  âœ“ Created 205 deals`);

  // ==========================================
  // 4. Create 75 Activities
  // ==========================================
  console.log('\nðŸ“ž Creating 75 activities...');
  const activitySubjects = [
    'Appel tÃ©lÃ©phonique',
    'Email de suivi',
    'SMS de confirmation',
    'Message WhatsApp',
    'Visite de propriÃ©tÃ©',
    'RÃ©union client',
    'Note interne',
    'TÃ¢che de suivi'
  ];

  const activityContents = [
    'Discussion sur les besoins du client',
    'Envoi de propositions immobiliÃ¨res',
    'Confirmation de rendez-vous',
    'RÃ©ponse Ã  une question client',
    'Suivi aprÃ¨s visite',
    'NÃ©gociation des conditions',
    'Mise Ã  jour du dossier',
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
        outcome: Math.random() > 0.6 ? 'SuccÃ¨s' : null,
        occurredAt: randomDate(60),
        createdByUserId: createdBy.id,
        nextActionAt: Math.random() > 0.5 ? randomFutureDate(7) : null,
        nextActionType: Math.random() > 0.5 ? 'Rappel' : null
      }
    });
  }
  console.log('  âœ“ Created 75 activities');

  // ==========================================
  // 5. CRM appointments disabled for this schema version
  // ==========================================
  console.log('\nðŸ“… Skipping appointments seed (CRM appointment models not present in current Prisma schema).');

  // ==========================================
  // 6. Create 10 demo properties for patrimoine
  // ==========================================
  console.log('\nðŸ  Creating 10 patrimoine demo properties...');
  const properties = [];
  const currentYear = new Date().getFullYear();
  const demoProperties = [
    {
      title: 'Appartement 3 pieces renove - Cocody Riviera',
      description: 'Appartement familial proche des ecoles, rentabilite locative stable.',
      propertyType: PropertyType.APPARTEMENT,
      locationZone: 'Cocody',
      address: '118 Rue des Jardins, Cocody Riviera, Abidjan',
      latitude: 5.3552,
      longitude: -3.9861,
      price: 78000000,
      fees: 320000,
      surfaceArea: 92,
      surfaceUseful: 84,
      rooms: 4,
      bedrooms: 3,
      bathrooms: 2,
      status: PropertyStatus.RENTED,
      availability: PropertyAvailability.UNAVAILABLE,
      qualityScore: 84,
      valuation: { estimatedValue: 82500000, acquisitionCost: 69000000, acquisitionDate: '2019-06-15', method: ValuationMethod.MARKET_ESTIMATE },
      loan: { lender: 'NSIA Banque', capitalAmount: 52000000, remainingCapital: 41000000, interestRate: 7.1, monthlyPayment: 468000, startDate: '2021-02-01', endDate: '2036-02-01', status: LoanStatus.ACTIVE },
      expenses: [
        { category: ExpenseCategory.CONDO_FEES, label: 'Charges copropriete annuelles', amount: 540000, paidAt: `${currentYear}-02-15` },
        { category: ExpenseCategory.INSURANCE, label: 'Assurance multirisque', amount: 220000, paidAt: `${currentYear}-01-20` }
      ]
    },
    {
      title: 'Villa 6 pieces avec jardin - Bingerville',
      description: 'Villa haut standing avec dependance, secteur residentiel calme.',
      propertyType: PropertyType.MAISON_VILLA,
      locationZone: 'Bingerville',
      address: '47 Cite des Palmiers, Bingerville',
      latitude: 5.3546,
      longitude: -3.9064,
      price: 228000000,
      fees: 950000,
      surfaceArea: 380,
      surfaceUseful: 320,
      rooms: 8,
      bedrooms: 5,
      bathrooms: 4,
      status: PropertyStatus.AVAILABLE,
      availability: PropertyAvailability.AVAILABLE,
      qualityScore: 92,
      valuation: { estimatedValue: 245000000, acquisitionCost: 198000000, acquisitionDate: '2018-11-08', method: ValuationMethod.EXPERT_APPRAISAL },
      loan: { lender: 'Coris Bank', capitalAmount: 160000000, remainingCapital: 128000000, interestRate: 6.8, monthlyPayment: 1320000, startDate: '2020-04-01', endDate: '2040-04-01', status: LoanStatus.ACTIVE },
      expenses: [
        { category: ExpenseCategory.ROUTINE_MAINTENANCE, label: 'Entretien jardin et piscine', amount: 860000, paidAt: `${currentYear}-03-05` },
        { category: ExpenseCategory.PROPERTY_TAX, label: 'Taxe fonciere annuelle', amount: 620000, paidAt: `${currentYear}-01-30` }
      ],
      workProgram: { title: 'Renovation terrasse', estimatedCost: 3500000, status: WorkProgramStatus.PLANNED, plannedDate: `${currentYear}-07-15`, isCapitalized: true }
    },
    {
      title: 'Studio meuble rendement eleve - Marcory',
      description: 'Studio proche zone commerciale, ideal location courte duree.',
      propertyType: PropertyType.STUDIO,
      locationZone: 'Marcory',
      address: '22 Rue du Canal, Marcory Bietry, Abidjan',
      latitude: 5.2851,
      longitude: -3.9724,
      price: 32500000,
      fees: 180000,
      surfaceArea: 38,
      surfaceUseful: 35,
      rooms: 1,
      bedrooms: 1,
      bathrooms: 1,
      status: PropertyStatus.RENTED,
      availability: PropertyAvailability.UNAVAILABLE,
      qualityScore: 78,
      valuation: { estimatedValue: 36000000, acquisitionCost: 28500000, acquisitionDate: '2022-09-01', method: ValuationMethod.MANUAL },
      expenses: [
        { category: ExpenseCategory.CONDO_FEES, label: 'Charges syndic annuelles', amount: 280000, paidAt: `${currentYear}-02-10` },
        { category: ExpenseCategory.UTILITIES, label: 'Abonnement energie parties communes', amount: 95000, paidAt: `${currentYear}-01-12` }
      ]
    },
    {
      title: 'Duplex de standing - Plateau',
      description: 'Duplex recent en plein centre, excellente valorisation patrimoniale.',
      propertyType: PropertyType.DUPLEX_TRIPLEX,
      locationZone: 'Plateau',
      address: '9 Avenue Lamblin, Plateau, Abidjan',
      latitude: 5.3215,
      longitude: -4.0178,
      price: 148000000,
      fees: 640000,
      surfaceArea: 210,
      surfaceUseful: 184,
      rooms: 6,
      bedrooms: 4,
      bathrooms: 3,
      status: PropertyStatus.RENTED,
      availability: PropertyAvailability.UNAVAILABLE,
      qualityScore: 89,
      valuation: { estimatedValue: 158000000, acquisitionCost: 131000000, acquisitionDate: '2020-01-10', method: ValuationMethod.MARKET_ESTIMATE },
      loan: { lender: 'BOA', capitalAmount: 98000000, remainingCapital: 73000000, interestRate: 7.4, monthlyPayment: 870000, startDate: '2020-02-01', endDate: '2038-02-01', status: LoanStatus.ACTIVE },
      expenses: [
        { category: ExpenseCategory.INSURANCE, label: 'Assurance immeuble', amount: 290000, paidAt: `${currentYear}-01-18` },
        { category: ExpenseCategory.ROUTINE_MAINTENANCE, label: 'Maintenance climatisation', amount: 410000, paidAt: `${currentYear}-03-11` }
      ]
    },
    {
      title: 'Plateau de bureaux premium - Plateau',
      description: 'Bureaux corporate avec locataire entreprise sur bail long terme.',
      propertyType: PropertyType.BUREAU,
      locationZone: 'Plateau',
      address: '3 Boulevard Roume, Plateau, Abidjan',
      latitude: 5.3238,
      longitude: -4.0161,
      price: 186000000,
      fees: 880000,
      surfaceArea: 285,
      surfaceUseful: 252,
      rooms: 10,
      bedrooms: 0,
      bathrooms: 4,
      status: PropertyStatus.RENTED,
      availability: PropertyAvailability.UNAVAILABLE,
      qualityScore: 91,
      valuation: { estimatedValue: 195000000, acquisitionCost: 166000000, acquisitionDate: '2017-05-24', method: ValuationMethod.EXPERT_APPRAISAL },
      loan: { lender: 'SIB', capitalAmount: 120000000, remainingCapital: 96000000, interestRate: 6.9, monthlyPayment: 990000, startDate: '2019-10-01', endDate: '2039-10-01', status: LoanStatus.ACTIVE },
      expenses: [
        { category: ExpenseCategory.MANAGEMENT_FEES, label: 'Honoraires gestion technique', amount: 780000, paidAt: `${currentYear}-02-28` },
        { category: ExpenseCategory.PROPERTY_TAX, label: 'Taxe professionnelle', amount: 940000, paidAt: `${currentYear}-01-25` }
      ],
      workProgram: { title: 'Mise aux normes incendie', estimatedCost: 5200000, status: WorkProgramStatus.IN_PROGRESS, plannedDate: `${currentYear}-04-10`, isCapitalized: true }
    },
    {
      title: 'Boutique commerciale angle passant - Yopougon',
      description: 'Local commercial en rez-de-chaussee avec fort trafic pieton.',
      propertyType: PropertyType.BOUTIQUE_COMMERCIAL,
      locationZone: 'Yopougon',
      address: '201 Boulevard principal, Yopougon Sicogi',
      latitude: 5.3501,
      longitude: -4.0822,
      price: 59000000,
      fees: 230000,
      surfaceArea: 68,
      surfaceUseful: 62,
      rooms: 2,
      bedrooms: 0,
      bathrooms: 1,
      status: PropertyStatus.RENTED,
      availability: PropertyAvailability.UNAVAILABLE,
      qualityScore: 80,
      valuation: { estimatedValue: 64000000, acquisitionCost: 51000000, acquisitionDate: '2021-07-19', method: ValuationMethod.MARKET_ESTIMATE },
      loan: { lender: 'Banque Atlantique', capitalAmount: 35000000, remainingCapital: 22500000, interestRate: 8.2, monthlyPayment: 355000, startDate: '2022-01-01', endDate: '2032-01-01', status: LoanStatus.ACTIVE },
      expenses: [
        { category: ExpenseCategory.UTILITIES, label: 'Electricite local commercial', amount: 145000, paidAt: `${currentYear}-02-07` },
        { category: ExpenseCategory.INSURANCE, label: 'Assurance local', amount: 125000, paidAt: `${currentYear}-01-14` }
      ]
    },
    {
      title: 'Terrain constructible 900 m2 - Anyama',
      description: 'Parcelle titree en zone de developpement residentiel.',
      propertyType: PropertyType.TERRAIN,
      locationZone: 'Anyama',
      address: 'Lot 14 Ilot C, Zone extension Anyama',
      latitude: 5.4973,
      longitude: -4.0594,
      price: 43000000,
      fees: 150000,
      surfaceArea: 900,
      surfaceUseful: 900,
      rooms: 0,
      bedrooms: 0,
      bathrooms: 0,
      status: PropertyStatus.AVAILABLE,
      availability: PropertyAvailability.AVAILABLE,
      qualityScore: 74,
      valuation: { estimatedValue: 48000000, acquisitionCost: 32000000, acquisitionDate: '2016-03-04', method: ValuationMethod.MANUAL },
      expenses: [
        { category: ExpenseCategory.PROPERTY_TAX, label: 'Taxe fonciere terrain', amount: 180000, paidAt: `${currentYear}-01-22` }
      ]
    },
    {
      title: 'Immeuble locatif 12 lots - Treichville',
      description: 'Immeuble mixte commerce/habitation avec taux d occupation eleve.',
      propertyType: PropertyType.IMMEUBLE,
      locationZone: 'Treichville',
      address: '15 Avenue 8, Treichville, Abidjan',
      latitude: 5.2959,
      longitude: -4.0087,
      price: 392000000,
      fees: 1450000,
      surfaceArea: 1240,
      surfaceUseful: 1110,
      rooms: 24,
      bedrooms: 18,
      bathrooms: 14,
      status: PropertyStatus.RENTED,
      availability: PropertyAvailability.UNAVAILABLE,
      qualityScore: 88,
      valuation: { estimatedValue: 415000000, acquisitionCost: 305000000, acquisitionDate: '2015-09-21', method: ValuationMethod.EXPERT_APPRAISAL },
      loan: { lender: 'Ecobank', capitalAmount: 290000000, remainingCapital: 255000000, interestRate: 6.5, monthlyPayment: 2415000, startDate: '2018-05-01', endDate: '2043-05-01', status: LoanStatus.ACTIVE },
      expenses: [
        { category: ExpenseCategory.ROUTINE_MAINTENANCE, label: 'Maintenance ascenseur et parties communes', amount: 1260000, paidAt: `${currentYear}-03-01` },
        { category: ExpenseCategory.CONDO_FEES, label: 'Charges copropriete immeuble', amount: 920000, paidAt: `${currentYear}-02-03` }
      ],
      workProgram: { title: 'Refection cage escalier', estimatedCost: 4100000, status: WorkProgramStatus.PLANNED, plannedDate: `${currentYear}-09-01`, isCapitalized: true }
    },
    {
      title: 'Maison familiale 4 chambres - Bouake',
      description: 'Maison de ville bien entretenue, potentiel de plus-value modere.',
      propertyType: PropertyType.MAISON_VILLA,
      locationZone: 'BouakÃ©',
      address: '56 Quartier Commerce, BouakÃ©',
      latitude: 7.6905,
      longitude: -5.0308,
      price: 86000000,
      fees: 270000,
      surfaceArea: 170,
      surfaceUseful: 152,
      rooms: 6,
      bedrooms: 4,
      bathrooms: 2,
      status: PropertyStatus.RENTED,
      availability: PropertyAvailability.UNAVAILABLE,
      qualityScore: 82,
      valuation: { estimatedValue: 92000000, acquisitionCost: 74000000, acquisitionDate: '2019-02-17', method: ValuationMethod.MARKET_ESTIMATE },
      loan: { lender: 'Orabank', capitalAmount: 46000000, remainingCapital: 38000000, interestRate: 7.7, monthlyPayment: 452000, startDate: '2019-03-01', endDate: '2034-03-01', status: LoanStatus.ACTIVE },
      expenses: [
        { category: ExpenseCategory.INSURANCE, label: 'Assurance habitation', amount: 170000, paidAt: `${currentYear}-01-09` },
        { category: ExpenseCategory.ROUTINE_MAINTENANCE, label: 'Reparation plomberie', amount: 210000, paidAt: `${currentYear}-02-26` }
      ]
    },
    {
      title: 'Appartement premium 4 pieces - Marcory Zone 4',
      description: 'Appartement haut de gamme proche commerces et axes majeurs.',
      propertyType: PropertyType.APPARTEMENT,
      locationZone: 'Marcory',
      address: '31 Rue du 7 Decembre, Marcory Zone 4',
      latitude: 5.2829,
      longitude: -3.9803,
      price: 124000000,
      fees: 510000,
      surfaceArea: 145,
      surfaceUseful: 131,
      rooms: 5,
      bedrooms: 4,
      bathrooms: 3,
      status: PropertyStatus.AVAILABLE,
      availability: PropertyAvailability.SOON_AVAILABLE,
      qualityScore: 90,
      valuation: { estimatedValue: 132000000, acquisitionCost: 109000000, acquisitionDate: '2020-10-12', method: ValuationMethod.MARKET_ESTIMATE },
      loan: { lender: 'UBA', capitalAmount: 76000000, remainingCapital: 57000000, interestRate: 7, monthlyPayment: 695000, startDate: '2021-01-01', endDate: '2041-01-01', status: LoanStatus.ACTIVE },
      expenses: [
        { category: ExpenseCategory.CONDO_FEES, label: 'Charges residence securisee', amount: 430000, paidAt: `${currentYear}-02-12` },
        { category: ExpenseCategory.UTILITIES, label: 'Maintenance groupe electrogene', amount: 185000, paidAt: `${currentYear}-03-02` }
      ],
      workProgram: { title: 'Remise a neuf cuisine', estimatedCost: 2800000, status: WorkProgramStatus.COMPLETED, plannedDate: `${currentYear - 1}-11-05`, isCapitalized: true }
    }
  ];

  const existingPropertyCount = await prisma.property.count({
    where: { tenantId: tenant.id }
  });

  for (let i = 0; i < demoProperties.length; i++) {
    const spec = demoProperties[i];
    const reference = await generatePropertyReference(tenant.id, existingPropertyCount + i);
    const owner = allCollaborators[i % allCollaborators.length];

    const property = await prisma.property.create({
      data: {
        internalReference: reference,
        propertyType: spec.propertyType,
        ownershipType: PropertyOwnershipType.TENANT,
        tenantId: tenant.id,
        ownerUserId: owner.id,
        title: spec.title,
        description: spec.description,
        address: spec.address,
        locationZone: spec.locationZone,
        latitude: spec.latitude,
        longitude: spec.longitude,
        transactionModes: [PropertyTransactionMode.SALE, PropertyTransactionMode.RENTAL],
        price: spec.price,
        fees: spec.fees,
        currency: 'XOF',
        surfaceArea: spec.surfaceArea,
        surfaceUseful: spec.surfaceUseful,
        rooms: spec.rooms,
        bedrooms: spec.bedrooms,
        bathrooms: spec.bathrooms,
        status: spec.status,
        availability: spec.availability,
        qualityScore: spec.qualityScore
      }
    });

    await prisma.propertyDocument.create({
      data: {
        propertyId: property.id,
        documentType: PropertyDocumentType.TITLE_DEED,
        filePath: `/properties/${property.id}/title_deed.pdf`,
        fileUrl: `https://storage.example.com/properties/${property.id}/title_deed.pdf`,
        fileName: `title_deed_${property.id}.pdf`,
        fileSize: 750000,
        mimeType: 'application/pdf',
        isRequired: true,
        isValid: true
      }
    });

    await prisma.assetValuation.create({
      data: {
        tenantId: tenant.id,
        propertyId: property.id,
        valuatedAt: new Date(`${currentYear}-03-01T10:00:00.000Z`),
        estimatedValue: spec.valuation.estimatedValue,
        currency: 'XOF',
        acquisitionCost: spec.valuation.acquisitionCost,
        acquisitionDate: new Date(`${spec.valuation.acquisitionDate}T00:00:00.000Z`),
        method: spec.valuation.method,
        notes: 'Donnee de demo patrimoine'
      }
    });

    if (spec.loan) {
      await prisma.propertyLoan.create({
        data: {
          tenantId: tenant.id,
          propertyId: property.id,
          lender: spec.loan.lender,
          capitalAmount: spec.loan.capitalAmount,
          remainingCapital: spec.loan.remainingCapital,
          interestRate: spec.loan.interestRate,
          monthlyPayment: spec.loan.monthlyPayment,
          currency: 'XOF',
          startDate: new Date(`${spec.loan.startDate}T00:00:00.000Z`),
          endDate: new Date(`${spec.loan.endDate}T00:00:00.000Z`),
          status: spec.loan.status
        }
      });
    }

    for (const expense of spec.expenses) {
      await prisma.propertyExpense.create({
        data: {
          tenantId: tenant.id,
          propertyId: property.id,
          category: expense.category,
          label: expense.label,
          amount: expense.amount,
          currency: 'XOF',
          paidAt: new Date(`${expense.paidAt}T09:00:00.000Z`),
          isCapitalized: false,
          notes: 'Donnee de demo patrimoine'
        }
      });
    }

    if (spec.workProgram) {
      await prisma.workProgram.create({
        data: {
          tenantId: tenant.id,
          propertyId: property.id,
          title: spec.workProgram.title,
          estimatedCost: spec.workProgram.estimatedCost,
          currency: 'XOF',
          plannedDate: new Date(`${spec.workProgram.plannedDate}T09:00:00.000Z`),
          status: spec.workProgram.status,
          isCapitalized: spec.workProgram.isCapitalized
        }
      });
    }

    await prisma.patrimonyDocument.create({
      data: {
        tenantId: tenant.id,
        propertyId: property.id,
        title: `Dossier patrimoine - ${spec.title}`,
        type: PatrimonyDocType.TITLE_DEED,
        fileUrl: `https://storage.example.com/patrimoine/${property.id}/dossier.pdf`,
        expiresAt: null
      }
    });

    properties.push(property);
  }
  console.log('  âœ“ Created 10 properties with patrimoine demo data (valuations, loans, expenses, documents)');

  // ==========================================
  // 7. Create 25 Rental Leases (baux) with installments and payments
  // ==========================================
  console.log('\nðŸ“‹ Creating 25 rental leases with installments and payments...');
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

  const existingLeaseCount = await prisma.rentalLease.count({
    where: { tenant_id: tenant.id }
  });

  for (let i = 0; i < 25; i++) {
    const property = properties[Math.floor(Math.random() * properties.length)];
    const renterClient = renterClients[i];
    const ownerClient = ownerClients[i % ownerClients.length]; // Use owner clients
    const leaseNumber = await generateLeaseNumber(tenant.id, existingLeaseCount + i);
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

    // Create installments (Ã©chÃ©ances) for the lease
    const installments = [];
    const monthsSinceStart = Math.floor((new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
    const monthsToCreate = Math.min(monthsSinceStart + 3, 12); // Up to 12 months or until now + 3 months

    for (let month = 0; month < monthsToCreate; month++) {
      // Normaliser au 1er du mois : setMonth() sur un 29/30/31 deborde sur le
      // mois suivant (31 janvier + 1 mois = 3 mars), deux iterations tombent
      // alors sur la meme periode et le document_number du recu collisionne.
      const periodDate = new Date(startDate.getFullYear(), startDate.getMonth() + month, 1);
      const dueDate = new Date(periodDate);
      dueDate.setDate(5); // Due on 5th of each month

      const isPastDue = dueDate < new Date();
      const status = isPastDue && month < monthsSinceStart
        ? (Math.random() > 0.3 ? RentalInstallmentStatus.PAID : RentalInstallmentStatus.OVERDUE)
        : RentalInstallmentStatus.DUE;

      const installment = await prisma.rentalInstallment.upsert({
        where: {
          lease_id_period_year_period_month: {
            lease_id: lease.id,
            period_year: periodDate.getFullYear(),
            period_month: periodDate.getMonth() + 1
          }
        },
        create: {
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
        },
        update: {
          due_date: dueDate,
          status,
          amount_rent: rentAmount,
          amount_service: serviceCharge,
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
            title: `ReÃ§u de loyer - ${periodDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`,
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
  console.log('  âœ“ Created 25 leases with installments, payments, and documents');

  // ==========================================
  // Summary
  // ==========================================
  console.log('\nâœ… Comprehensive data seeding completed!\n');
  console.log('ðŸ“Š Summary:');
  console.log(`  â€¢ Collaborators: 7`);
  console.log(`  â€¢ Contacts: 200 (60 clients, 140 leads)`);
  console.log(`  â€¢ Deals: 205`);
  console.log(`  â€¢ Activities: 75`);
  console.log(`  â€¢ Appointments: skipped (schema without CRM appointment models)`);
  console.log(`  â€¢ Properties: ${properties.length} (with patrimoine demo data)`);
  console.log(`  â€¢ Rental Leases: 25 (all with installments, payments, and documents)`);
  console.log(`\nðŸ¢ Tenant: ${tenant.name}`);
  console.log('');
}

main()
  .catch((e) => {
    console.error('âŒ Error seeding comprehensive data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
