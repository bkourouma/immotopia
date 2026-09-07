const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:DevMick@2003@localhost:5432/immotopia?schema=public'
    }
  }
});

// IDs fixes pour les données de test (UUIDs valides)
const TEST_IDS = {
  tenantId: 'test-tenant-id', // Garder les IDs existants qui sont déjà des strings
  userId: 'test-tenant-user-id',
  tenantClientId: 'test-tenant-client-id',
  propertyId: '00000000-0000-0000-0000-000000000001',
  leaseId: '00000000-0000-0000-0000-000000000002',
  depositId: '00000000-0000-0000-0000-000000000003',
  contactId: '00000000-0000-0000-0000-000000000004',
  installments: {
    paid: '00000000-0000-0000-0000-000000000011',
    due: '00000000-0000-0000-0000-000000000012',
    partial: '00000000-0000-0000-0000-000000000013',
    overdue: '00000000-0000-0000-0000-000000000014'
  },
  payments: {
    success: '00000000-0000-0000-0000-000000000021',
    mobile: '00000000-0000-0000-0000-000000000022'
  },
  allocations: {
    allocation1: '00000000-0000-0000-0000-000000000031',
    allocation2: '00000000-0000-0000-0000-000000000032'
  },
  movements: {
    collect: '00000000-0000-0000-0000-000000000041',
    hold: '00000000-0000-0000-0000-000000000042'
  },
  tickets: {
    declared: '00000000-0000-0000-0000-000000000051',
    inProgress: '00000000-0000-0000-0000-000000000052',
    resolved: '00000000-0000-0000-0000-000000000053'
  },
  comments: {
    comment1: '00000000-0000-0000-0000-000000000061'
  },
  documents: {
    leaseContract: '00000000-0000-0000-0000-000000000071',
    receipt: '00000000-0000-0000-0000-000000000072',
    statement: '00000000-0000-0000-0000-000000000073'
  }
};

async function main() {
  console.log('🚀 Création des données de test pour le portail locataire...\n');

  try {
    // Vérifier que le tenant et l'utilisateur existent
    const tenant = await prisma.tenant.findUnique({
      where: { id: TEST_IDS.tenantId }
    });

    if (!tenant) {
      console.error('❌ Le tenant test-tenant-id n\'existe pas. Veuillez d\'abord exécuter create-test-tenant-and-client.js');
      process.exit(1);
    }

    const user = await prisma.user.findUnique({
      where: { id: TEST_IDS.userId }
    });

    if (!user) {
      console.error('❌ L\'utilisateur test-tenant-user-id n\'existe pas. Veuillez d\'abord exécuter create-test-tenant-and-client.js');
      process.exit(1);
    }

    console.log('✅ Tenant et utilisateur trouvés\n');

    // 1. Créer la propriété
    console.log('📦 Création de la propriété...');
    const property = await prisma.property.upsert({
      where: { internalReference: 'PROP-001' },
      update: {
        tenantId: TEST_IDS.tenantId,
        internalReference: 'PROP-001',
        address: '123 Rue de la République, Dakar',
        title: 'Appartement T3',
        propertyType: 'APPARTEMENT',
        ownershipType: 'TENANT',
        description: 'Bel appartement T3 avec balcon',
        transactionModes: ['RENTAL'],
        price: 150000,
        currency: 'FCFA',
        status: 'RENTED',
        isPublished: true,
        publishedAt: new Date('2024-01-01')
      },
      create: {
        tenantId: TEST_IDS.tenantId,
        internalReference: 'PROP-001',
        address: '123 Rue de la République, Dakar',
        title: 'Appartement T3',
        propertyType: 'APPARTEMENT',
        ownershipType: 'TENANT',
        description: 'Bel appartement T3 avec balcon',
        transactionModes: ['RENTAL'],
        price: 150000,
        currency: 'FCFA',
        status: 'RENTED',
        isPublished: true,
        publishedAt: new Date('2024-01-01')
      }
    });
    // Utiliser l'ID réel de la propriété
    TEST_IDS.propertyId = property.id;
    console.log(`   ✓ Propriété créée: ${property.title} (ID: ${property.id})\n`);

    // 2. Créer un CrmContact pour les tickets de maintenance
    console.log('👤 Création du contact CRM...');
    const contact = await prisma.crmContact.upsert({
      where: {
        tenantId_email: {
          tenantId: TEST_IDS.tenantId,
          email: 'locataire@test.com'
        }
      },
      update: {
        firstName: 'Amadou',
        lastName: 'Diallo',
        phonePrimary: '+221771234567',
        status: 'ACTIVE_CLIENT',
        contactType: 'PERSON'
      },
      create: {
        id: TEST_IDS.contactId,
        tenantId: TEST_IDS.tenantId,
        email: 'locataire@test.com',
        firstName: 'Amadou',
        lastName: 'Diallo',
        phonePrimary: '+221771234567',
        status: 'ACTIVE_CLIENT',
        contactType: 'PERSON'
      }
    });
    console.log(`   ✓ Contact CRM créé: ${contact.firstName} ${contact.lastName}\n`);

    // 3. Créer le bail actif
    console.log('📄 Création du bail actif...');
    const lease = await prisma.rentalLease.upsert({
      where: { id: TEST_IDS.leaseId },
      update: {
        tenant_id: TEST_IDS.tenantId,
        property_id: TEST_IDS.propertyId,
        primary_renter_client_id: TEST_IDS.tenantClientId,
        lease_number: 'BAIL-2024-001',
        status: 'ACTIVE',
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        currency: 'FCFA',
        rent_amount: 150000,
        service_charge_amount: 20000,
        security_deposit_amount: 300000,
        billing_frequency: 'MONTHLY',
        due_day_of_month: 5,
        created_by_user_id: TEST_IDS.userId
      },
      create: {
        id: TEST_IDS.leaseId,
        tenant_id: TEST_IDS.tenantId,
        property_id: TEST_IDS.propertyId,
        primary_renter_client_id: TEST_IDS.tenantClientId,
        lease_number: 'BAIL-2024-001',
        status: 'ACTIVE',
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        currency: 'FCFA',
        rent_amount: 150000,
        service_charge_amount: 20000,
        security_deposit_amount: 300000,
        billing_frequency: 'MONTHLY',
        due_day_of_month: 5,
        created_by_user_id: TEST_IDS.userId
      }
    });
    console.log(`   ✓ Bail créé: ${lease.leaseNumber}\n`);

    // 4. Créer les échéances
    console.log('📅 Création des échéances...');
    const installments = [
      {
        id: TEST_IDS.installments.paid,
        periodYear: 2024,
        periodMonth: 1,
        dueDate: new Date('2024-01-05'),
        amountRent: 150000,
        amountService: 20000,
        amountPaid: 170000,
        paidAt: new Date('2024-01-10'),
        status: 'PAID'
      },
      {
        id: TEST_IDS.installments.due,
        periodYear: 2024,
        periodMonth: 2,
        dueDate: new Date('2024-02-05'),
        amountRent: 150000,
        amountService: 20000,
        amountPaid: 0,
        status: 'DUE'
      },
      {
        id: TEST_IDS.installments.partial,
        periodYear: 2024,
        periodMonth: 3,
        dueDate: new Date('2024-03-05'),
        amountRent: 150000,
        amountService: 20000,
        amountPaid: 85000,
        status: 'PARTIAL'
      },
      {
        id: TEST_IDS.installments.overdue,
        periodYear: 2024,
        periodMonth: 4,
        dueDate: new Date('2024-04-05'),
        amountRent: 150000,
        amountService: 20000,
        amountPaid: 0,
        status: 'OVERDUE'
      }
    ];

    for (const inst of installments) {
      await prisma.rentalInstallment.upsert({
        where: { id: inst.id },
        update: {
          due_date: inst.dueDate,
          amount_rent: inst.amountRent,
          amount_service: inst.amountService,
          amount_paid: inst.amountPaid,
          paid_at: inst.paidAt,
          status: inst.status
        },
        create: {
          id: inst.id,
          tenant_id: TEST_IDS.tenantId,
          lease_id: TEST_IDS.leaseId,
          period_year: inst.periodYear,
          period_month: inst.periodMonth,
          due_date: inst.dueDate,
          amount_rent: inst.amountRent,
          amount_service: inst.amountService,
          amount_paid: inst.amountPaid,
          paid_at: inst.paidAt,
          status: inst.status
        }
      });
    }
    console.log(`   ✓ ${installments.length} échéances créées\n`);

    // 5. Créer les paiements
    console.log('💳 Création des paiements...');
    const payments = [
      {
        id: TEST_IDS.payments.success,
        amount: 170000,
        method: 'BANK_TRANSFER',
        status: 'SUCCESS',
        initiatedAt: new Date('2024-01-10T09:00:00'),
        succeededAt: new Date('2024-01-10T10:00:00'),
        idempotencyKey: `payment-success-${Date.now()}`
      },
      {
        id: TEST_IDS.payments.mobile,
        amount: 85000,
        method: 'MOBILE_MONEY',
        status: 'SUCCESS',
        mmOperator: 'ORANGE',
        mmPhone: '+221771234567',
        initiatedAt: new Date('2024-03-10T13:00:00'),
        succeededAt: new Date('2024-03-10T14:00:00'),
        idempotencyKey: `payment-mobile-${Date.now()}`
      }
    ];

    for (const payment of payments) {
      await prisma.rentalPayment.upsert({
        where: { id: payment.id },
        update: {
          tenantId: TEST_IDS.tenantId,
          leaseId: TEST_IDS.leaseId,
          renterClientId: TEST_IDS.tenantClientId,
          amount: payment.amount,
          currency: 'FCFA',
          method: payment.method,
          status: payment.status,
          mmOperator: payment.mmOperator,
          mmPhone: payment.mmPhone,
          initiatedAt: payment.initiatedAt,
          succeededAt: payment.succeededAt,
          idempotencyKey: payment.idempotencyKey
        },
        create: {
          id: payment.id,
          tenantId: TEST_IDS.tenantId,
          leaseId: TEST_IDS.leaseId,
          renterClientId: TEST_IDS.tenantClientId,
          amount: payment.amount,
          currency: 'FCFA',
          method: payment.method,
          status: payment.status,
          mmOperator: payment.mmOperator,
          mmPhone: payment.mmPhone,
          initiatedAt: payment.initiatedAt,
          succeededAt: payment.succeededAt,
          idempotencyKey: payment.idempotencyKey
        }
      });
    }
    console.log(`   ✓ ${payments.length} paiements créés\n`);

    // 6. Créer les allocations de paiement
    console.log('🔗 Création des allocations de paiement...');
    const allocations = [
      {
        id: TEST_IDS.allocations.allocation1,
        paymentId: TEST_IDS.payments.success,
        installmentId: TEST_IDS.installments.paid,
        amount: 170000
      },
      {
        id: TEST_IDS.allocations.allocation2,
        paymentId: TEST_IDS.payments.mobile,
        installmentId: TEST_IDS.installments.partial,
        amount: 85000
      }
    ];

    for (const alloc of allocations) {
      await prisma.rentalPaymentAllocation.upsert({
        where: {
          paymentId_installmentId: {
            paymentId: alloc.paymentId,
            installmentId: alloc.installmentId
          }
        },
        update: {
          tenantId: TEST_IDS.tenantId,
          amount: alloc.amount
        },
        create: {
          id: alloc.id,
          tenantId: TEST_IDS.tenantId,
          paymentId: alloc.paymentId,
          installmentId: alloc.installmentId,
          amount: alloc.amount
        }
      });
    }
    console.log(`   ✓ ${allocations.length} allocations créées\n`);

    // 7. Créer le dépôt de garantie
    console.log('💰 Création du dépôt de garantie...');
    const deposit = await prisma.rentalSecurityDeposit.upsert({
      where: { leaseId: TEST_IDS.leaseId },
      update: {
        tenantId: TEST_IDS.tenantId,
        currency: 'FCFA',
        targetAmount: 300000,
        collectedAmount: 300000,
        heldAmount: 50000,
        refundedAmount: 0,
        forfeitedAmount: 0
      },
      create: {
        id: TEST_IDS.depositId,
        tenantId: TEST_IDS.tenantId,
        leaseId: TEST_IDS.leaseId,
        currency: 'FCFA',
        targetAmount: 300000,
        collectedAmount: 300000,
        heldAmount: 50000,
        refundedAmount: 0,
        forfeitedAmount: 0
      }
    });
    console.log(`   ✓ Dépôt de garantie créé\n`);

    // 8. Créer les mouvements de dépôt
    console.log('📊 Création des mouvements de dépôt...');
    const movements = [
      {
        id: TEST_IDS.movements.collect,
        type: 'COLLECT',
        amount: 300000,
        note: 'Dépôt de garantie collecté',
        createdAt: new Date('2024-01-01T10:00:00')
      },
      {
        id: TEST_IDS.movements.hold,
        type: 'HOLD',
        amount: 50000,
        note: 'Retenue pour réparations',
        createdAt: new Date('2024-02-01T10:00:00')
      }
    ];

    for (const mov of movements) {
      await prisma.rentalDepositMovement.upsert({
        where: { id: mov.id },
        update: {
          tenantId: TEST_IDS.tenantId,
          depositId: TEST_IDS.depositId,
          type: mov.type,
          amount: mov.amount,
          note: mov.note,
          createdAt: mov.createdAt
        },
        create: {
          id: mov.id,
          tenantId: TEST_IDS.tenantId,
          depositId: TEST_IDS.depositId,
          type: mov.type,
          amount: mov.amount,
          note: mov.note,
          createdAt: mov.createdAt
        }
      });
    }
    console.log(`   ✓ ${movements.length} mouvements créés\n`);

    // 9. Créer les tickets de maintenance
    console.log('🔧 Création des tickets de maintenance...');
    const tickets = [
      {
        id: TEST_IDS.tickets.declared,
        title: 'Fuite d\'eau dans la salle de bain',
        category: 'PLUMBING',
        priority: 'HIGH',
        description: 'Il y a une fuite d\'eau importante sous le lavabo de la salle de bain principale.',
        status: 'DECLARED',
        declaredAt: new Date('2024-01-15T09:00:00')
      },
      {
        id: TEST_IDS.tickets.inProgress,
        title: 'Problème électrique - Prise défectueuse',
        category: 'ELECTRICITY',
        priority: 'MEDIUM',
        description: 'La prise électrique dans la chambre ne fonctionne plus.',
        status: 'IN_PROGRESS',
        declaredAt: new Date('2024-02-01T10:00:00'),
        inProgressAt: new Date('2024-02-02T10:00:00')
      },
      {
        id: TEST_IDS.tickets.resolved,
        title: 'Climatisation en panne',
        category: 'AC',
        priority: 'URGENT',
        description: 'La climatisation ne fonctionne plus depuis hier.',
        status: 'RESOLVED',
        declaredAt: new Date('2024-03-01T11:00:00'),
        inProgressAt: new Date('2024-03-01T12:00:00'),
        resolvedAt: new Date('2024-03-02T15:00:00'),
        resolutionNotes: 'Climatisation réparée, pièce remplacée'
      }
    ];

    for (const ticket of tickets) {
      await prisma.maintenanceTicket.upsert({
        where: { id: ticket.id },
        update: {
          tenantId: TEST_IDS.tenantId,
          propertyId: TEST_IDS.propertyId,
          leaseId: TEST_IDS.leaseId,
          tenantContactId: TEST_IDS.contactId,
          createdByContactId: TEST_IDS.contactId,
          title: ticket.title,
          category: ticket.category,
          priority: ticket.priority,
          description: ticket.description,
          status: ticket.status,
          declaredAt: ticket.declaredAt,
          inProgressAt: ticket.inProgressAt,
          resolvedAt: ticket.resolvedAt,
          resolutionNotes: ticket.resolutionNotes
        },
        create: {
          id: ticket.id,
          tenantId: TEST_IDS.tenantId,
          propertyId: TEST_IDS.propertyId,
          leaseId: TEST_IDS.leaseId,
          tenantContactId: TEST_IDS.contactId,
          createdByContactId: TEST_IDS.contactId,
          title: ticket.title,
          category: ticket.category,
          priority: ticket.priority,
          description: ticket.description,
          status: ticket.status,
          declaredAt: ticket.declaredAt,
          inProgressAt: ticket.inProgressAt,
          resolvedAt: ticket.resolvedAt,
          resolutionNotes: ticket.resolutionNotes
        }
      });
    }
    console.log(`   ✓ ${tickets.length} tickets créés\n`);

    // 10. Créer un commentaire sur un ticket
    console.log('💬 Création des commentaires...');
    await prisma.maintenanceTicketComment.upsert({
      where: { id: TEST_IDS.comments.comment1 },
      update: {
        tenantId: TEST_IDS.tenantId,
        ticketId: TEST_IDS.tickets.declared,
        authorType: 'TENANT',
        content: 'La fuite semble s\'être aggravée ce matin.',
        authorContactId: TEST_IDS.contactId,
        createdAt: new Date('2024-01-16T08:00:00')
      },
      create: {
        id: TEST_IDS.comments.comment1,
        tenantId: TEST_IDS.tenantId,
        ticketId: TEST_IDS.tickets.declared,
        authorType: 'TENANT',
        content: 'La fuite semble s\'être aggravée ce matin.',
        authorContactId: TEST_IDS.contactId,
        createdAt: new Date('2024-01-16T08:00:00')
      }
    });
    console.log(`   ✓ Commentaire créé\n`);

    // 11. Créer les documents
    console.log('📄 Création des documents...');
    const documents = [
      {
        id: TEST_IDS.documents.leaseContract,
        type: 'LEASE_CONTRACT',
        documentNumber: '2024-001',
        title: 'Contrat de bail',
        status: 'FINAL',
        filePath: '/assets/generated_documents/lease-contract-2024-001.docx',
        fileUrl: '/uploads/documents/lease-contract-2024-001.pdf',
        mimeType: 'application/pdf',
        issuedAt: new Date('2024-01-01')
      },
      {
        id: TEST_IDS.documents.receipt,
        type: 'RENT_RECEIPT',
        documentNumber: '2024-002',
        title: 'Quittance de loyer - Janvier 2024',
        status: 'FINAL',
        filePath: '/assets/generated_documents/receipt-2024-002.docx',
        fileUrl: '/uploads/documents/receipt-2024-002.pdf',
        mimeType: 'application/pdf',
        issuedAt: new Date('2024-01-10')
      },
      {
        id: TEST_IDS.documents.statement,
        type: 'STATEMENT',
        documentNumber: '2024-003',
        title: 'Relevé de compte - Trimestre 1',
        status: 'FINAL',
        filePath: '/assets/generated_documents/statement-2024-003.docx',
        fileUrl: '/uploads/documents/statement-2024-003.pdf',
        mimeType: 'application/pdf',
        issuedAt: new Date('2024-03-31')
      }
    ];

    for (const doc of documents) {
      await prisma.rentalDocument.upsert({
        where: { id: doc.id },
        update: {
          tenantId: TEST_IDS.tenantId,
          leaseId: TEST_IDS.leaseId,
          type: doc.type,
          documentNumber: doc.documentNumber,
          title: doc.title,
          status: doc.status,
          filePath: doc.filePath,
          fileUrl: doc.fileUrl,
          mimeType: doc.mimeType,
          issuedAt: doc.issuedAt,
          createdByUserId: TEST_IDS.userId
        },
        create: {
          id: doc.id,
          tenantId: TEST_IDS.tenantId,
          leaseId: TEST_IDS.leaseId,
          type: doc.type,
          documentNumber: doc.documentNumber,
          title: doc.title,
          status: doc.status,
          filePath: doc.filePath,
          fileUrl: doc.fileUrl,
          mimeType: doc.mimeType,
          issuedAt: doc.issuedAt,
          createdByUserId: TEST_IDS.userId
        }
      });
    }
    console.log(`   ✓ ${documents.length} documents créés\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Toutes les données de test ont été créées avec succès!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 Résumé:');
    console.log(`   ✓ 1 Propriété`);
    console.log(`   ✓ 1 Contact CRM`);
    console.log(`   ✓ 1 Bail actif`);
    console.log(`   ✓ ${installments.length} Échéances`);
    console.log(`   ✓ ${payments.length} Paiements`);
    console.log(`   ✓ ${allocations.length} Allocations`);
    console.log(`   ✓ 1 Dépôt de garantie`);
    console.log(`   ✓ ${movements.length} Mouvements de dépôt`);
    console.log(`   ✓ ${tickets.length} Tickets de maintenance`);
    console.log(`   ✓ 1 Commentaire`);
    console.log(`   ✓ ${documents.length} Documents\n`);

  } catch (error) {
    console.error('❌ Erreur lors de la création:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });
