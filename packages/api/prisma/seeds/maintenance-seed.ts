import { PrismaClient, MaintenanceTicketCategory, MaintenanceTicketPriority, MaintenanceTicketStatus, MaintenanceTicketCommentAuthorType } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed script for Maintenance & Rental Incidents Module
 * Creates sample vendors, tickets, comments, and attachments
 * Uses anonymized/real data only per Constitution
 */
async function seedMaintenance() {
  console.log('🔧 Seeding Maintenance & Rental Incidents data...');

  // Get first tenant (assuming at least one tenant exists)
  const tenant = await prisma.tenant.findFirst({
    where: {
      status: 'ACTIVE'
    }
  });

  if (!tenant) {
    console.log('⚠️  No active tenant found. Skipping maintenance seed.');
    return;
  }

  console.log(`  Using tenant: ${tenant.name} (${tenant.id})`);

  // Get a property for the tenant
  const property = await prisma.property.findFirst({
    where: {
      tenant_id: tenant.id
    }
  });

  if (!property) {
    console.log('⚠️  No property found for tenant. Skipping maintenance seed.');
    return;
  }

  console.log(`  Using property: ${property.internalReference} (${property.id})`);

  // Get an active lease for the property (optional)
  const lease = await prisma.rentalLease.findFirst({
    where: {
      property_id: property.id,
      status: 'ACTIVE'
    }
  });

  // Get a tenant contact (optional)
  const tenantContact = await prisma.crmContact.findFirst({
    where: {
      tenant_id: tenant.id,
      clientType: 'RENTER'
    }
  });

  // Get a user for manager actions
  const managerUser = await prisma.user.findFirst({
    where: {
      email: {
        contains: '@'
      }
    },
    include: {
      memberships: {
        where: {
          tenant_id: tenant.id,
          status: 'ACTIVE'
        }
      }
    }
  });

  // Create maintenance vendors
  console.log('\n  Creating maintenance vendors...');
  const vendors = [
    {
      tenant_id: tenant.id,
      name: 'Plomberie Express',
      phone: '+33 1 23 45 67 89',
      email: 'contact@plomberie-express.fr',
      address: '123 Rue de la République, 75001 Paris',
      specialties: ['Plomberie', 'Chauffage', 'Sanitaires'],
      is_active: true
    },
    {
      tenant_id: tenant.id,
      name: 'Électricité Pro',
      phone: '+33 1 98 76 54 32',
      email: 'info@electricite-pro.fr',
      address: '456 Avenue des Champs, 69001 Lyon',
      specialties: ['Électricité', 'Éclairage', 'Tableaux électriques'],
      is_active: true
    },
    {
      tenant_id: tenant.id,
      name: 'Climatisation & Ventilation',
      phone: '+33 1 11 22 33 44',
      email: 'service@clim-vent.fr',
      address: '789 Boulevard Saint-Michel, 13001 Marseille',
      specialties: ['Climatisation', 'Ventilation', 'Dépannage'],
      is_active: true
    },
    {
      tenant_id: tenant.id,
      name: 'Multi-Services Habitat',
      phone: '+33 1 55 66 77 88',
      email: 'contact@multi-services-habitat.fr',
      address: '321 Rue de la Paix, 33000 Bordeaux',
      specialties: ['Plomberie', 'Électricité', 'Peinture', 'Menuiserie'],
      is_active: true
    },
    {
      tenant_id: tenant.id,
      name: 'Dépannage Urgence 24/7',
      phone: '+33 1 99 88 77 66',
      email: 'urgence@depannage-24-7.fr',
      address: '654 Place de la Victoire, 31000 Toulouse',
      specialties: ['Plomberie', 'Électricité', 'Chauffage', 'Urgence'],
      is_active: false // Inactive vendor for testing
    }
  ];

  const createdVendors = [];
  for (const vendorData of vendors) {
    const vendor = await prisma.maintenanceVendor.create({
      data: vendorData
    });
    createdVendors.push(vendor);
    console.log(`    ✓ Created vendor: ${vendor.name}`);
  }

  // Create maintenance tickets
  console.log('\n  Creating maintenance tickets...');
  const tickets = [
    {
      tenant_id: tenant.id,
      property_id: property.id,
      lease_id: lease?.id || null,
      tenant_contact_id: tenantContact?.id || null,
      created_by_contact_id: tenantContact?.id || null,
      title: 'Fuite d\'eau dans la salle de bain',
      category: MaintenanceTicketCategory.PLUMBING,
      priority: MaintenanceTicketPriority.HIGH,
      description: 'Fuite importante sous le lavabo de la salle de bain principale. L\'eau s\'écoule sur le sol et risque d\'endommager le parquet.',
      location_details: 'Salle de bain principale, premier étage, sous le lavabo',
      status: MaintenanceTicketStatus.IN_PROGRESS,
      assigned_vendor_id: createdVendors[0].id, // Plomberie Express
      declared_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      in_progress_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
    },
    {
      tenant_id: tenant.id,
      property_id: property.id,
      lease_id: lease?.id || null,
      tenant_contact_id: tenantContact?.id || null,
      created_by_contact_id: tenantContact?.id || null,
      title: 'Interrupteur défectueux dans le salon',
      category: MaintenanceTicketCategory.ELECTRICITY,
      priority: MaintenanceTicketPriority.MEDIUM,
      description: 'L\'interrupteur principal du salon ne fonctionne plus. Impossible d\'allumer les lumières.',
      location_details: 'Salon, mur principal, interrupteur près de la porte d\'entrée',
      status: MaintenanceTicketStatus.ASSIGNED,
      assigned_vendor_id: createdVendors[1].id, // Électricité Pro
      declared_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      assigned_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
    },
    {
      tenant_id: tenant.id,
      property_id: property.id,
      lease_id: lease?.id || null,
      tenant_contact_id: tenantContact?.id || null,
      created_by_contact_id: tenantContact?.id || null,
      title: 'Climatisation en panne',
      category: MaintenanceTicketCategory.AC,
      priority: MaintenanceTicketPriority.URGENT,
      description: 'La climatisation ne fonctionne plus depuis hier. Température très élevée dans l\'appartement.',
      location_details: 'Appartement entier, unité extérieure sur le balcon',
      status: MaintenanceTicketStatus.DECLARED,
      declared_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
    },
    {
      tenant_id: tenant.id,
      property_id: property.id,
      lease_id: lease?.id || null,
      tenant_contact_id: tenantContact?.id || null,
      created_by_user_id: managerUser?.id || null,
      title: 'Réparation robinet cuisine',
      category: MaintenanceTicketCategory.PLUMBING,
      priority: MaintenanceTicketPriority.LOW,
      description: 'Le robinet de la cuisine fuit légèrement. Réparation non urgente.',
      location_details: 'Cuisine, évier principal',
      status: MaintenanceTicketStatus.RESOLVED,
      assigned_vendor_id: createdVendors[0].id, // Plomberie Express
      resolution_notes: 'Robinet réparé avec remplacement du joint. Test effectué, plus de fuite.',
      declared_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      assigned_at: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000), // 9 days ago
      resolved_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // 8 days ago
    },
    {
      tenant_id: tenant.id,
      property_id: property.id,
      lease_id: lease?.id || null,
      tenant_contact_id: tenantContact?.id || null,
      created_by_contact_id: tenantContact?.id || null,
      title: 'Problème électrique multiple',
      category: MaintenanceTicketCategory.ELECTRICITY,
      priority: MaintenanceTicketPriority.HIGH,
      description: 'Plusieurs prises électriques ne fonctionnent plus dans la chambre principale et le bureau.',
      location_details: 'Chambre principale et bureau, prises murales',
      status: MaintenanceTicketStatus.CANCELED,
      declared_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      canceled_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) // 6 days ago
    }
  ];

  const createdTickets = [];
  for (const ticketData of tickets) {
    const ticket = await prisma.maintenanceTicket.create({
      data: ticketData
    });
    createdTickets.push(ticket);
    console.log(`    ✓ Created ticket: ${ticket.title} (${ticket.status})`);

    // Create status history for tickets with status changes
    if (ticket.status === MaintenanceTicketStatus.IN_PROGRESS) {
      await prisma.maintenanceTicketStatusHistory.create({
        data: {
          tenant_id: tenant.id,
          ticket_id: ticket.id,
          from_status: MaintenanceTicketStatus.DECLARED,
          to_status: MaintenanceTicketStatus.IN_PROGRESS,
          changed_by_user_id: managerUser?.id || null,
          changed_at: ticket.in_progress_at || ticket.declared_at
        }
      });
    } else if (ticket.status === MaintenanceTicketStatus.ASSIGNED) {
      await prisma.maintenanceTicketStatusHistory.create({
        data: {
          tenant_id: tenant.id,
          ticket_id: ticket.id,
          from_status: MaintenanceTicketStatus.DECLARED,
          to_status: MaintenanceTicketStatus.ASSIGNED,
          changed_by_user_id: managerUser?.id || null,
          changed_at: ticket.assigned_at || ticket.declared_at
        }
      });
    } else if (ticket.status === MaintenanceTicketStatus.RESOLVED) {
      await prisma.maintenanceTicketStatusHistory.createMany({
        data: [
          {
            tenant_id: tenant.id,
            ticket_id: ticket.id,
            from_status: MaintenanceTicketStatus.DECLARED,
            to_status: MaintenanceTicketStatus.ASSIGNED,
            changed_by_user_id: managerUser?.id || null,
            changed_at: ticket.assigned_at || ticket.declared_at
          },
          {
            tenant_id: tenant.id,
            ticket_id: ticket.id,
            from_status: MaintenanceTicketStatus.ASSIGNED,
            to_status: MaintenanceTicketStatus.RESOLVED,
            changed_by_user_id: managerUser?.id || null,
            changed_at: ticket.resolved_at || ticket.assigned_at
          }
        ]
      });
    } else if (ticket.status === MaintenanceTicketStatus.CANCELED) {
      await prisma.maintenanceTicketStatusHistory.create({
        data: {
          tenant_id: tenant.id,
          ticket_id: ticket.id,
          from_status: MaintenanceTicketStatus.DECLARED,
          to_status: MaintenanceTicketStatus.CANCELED,
          changed_by_user_id: tenantContact?.id ? null : managerUser?.id || null,
          changed_by_contact_id: tenantContact?.id || null,
          changed_at: ticket.canceled_at || ticket.declared_at
        }
      });
    }
  }

  // Create comments for some tickets
  console.log('\n  Creating ticket comments...');
  if (createdTickets.length > 0 && tenantContact) {
    // Tenant comment on first ticket
    await prisma.maintenanceTicketComment.create({
      data: {
        tenant_id: tenant.id,
        ticket_id: createdTickets[0].id,
        author_type: MaintenanceTicketCommentAuthorType.TENANT,
        content: 'La fuite semble s\'être aggravée. Merci d\'intervenir rapidement.',
        author_contact_id: tenantContact.id,
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      }
    });
    console.log('    ✓ Created tenant comment');

    // Manager comment on first ticket
    if (managerUser) {
      await prisma.maintenanceTicketComment.create({
        data: {
          tenant_id: tenant.id,
          ticket_id: createdTickets[0].id,
          author_type: MaintenanceTicketCommentAuthorType.MANAGER,
          content: 'Prestataire contacté. Intervention prévue demain matin entre 9h et 12h.',
          author_user_id: managerUser.id,
          created_at: new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago
        }
      });
      console.log('    ✓ Created manager comment');
    }
  }

  // Create a sample attachment (metadata only, no actual file)
  console.log('\n  Creating ticket attachments (metadata)...');
  if (createdTickets.length > 0 && tenantContact) {
    await prisma.maintenanceTicketAttachment.create({
      data: {
        tenant_id: tenant.id,
        ticket_id: createdTickets[0].id,
        file_url: `/uploads/maintenance/${tenant.id}/${createdTickets[0].id}/photo-fuite.jpg`,
        file_name: 'photo-fuite.jpg',
        mime_type: 'image/jpeg',
        file_size: 245760, // 240 KB
        uploaded_by_contact_id: tenantContact.id,
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      }
    });
    console.log('    ✓ Created attachment metadata');
  }

  console.log('\n✅ Maintenance seed completed successfully!');
  console.log(`   - ${createdVendors.length} vendors created`);
  console.log(`   - ${createdTickets.length} tickets created`);
  console.log(`   - Comments and attachments created`);
}

async function main() {
  try {
    await seedMaintenance();
  } catch (error) {
    console.error('❌ Error seeding maintenance data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { seedMaintenance };
