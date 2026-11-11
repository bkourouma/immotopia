import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * Helper function to get phone from TenantClient
 * Same logic as in document-context-builder.ts
 */
async function getPhoneFromClient(client: any, tenantId: string, clientType: string = 'unknown'): Promise<string> {
  if (!client) {
    return '';
  }

  // First, try to get phone from CRM Contact via crmContactId in details
  if (client.details) {
    try {
      const details = typeof client.details === 'string' ? JSON.parse(client.details) : client.details;

      // If we have a crmContactId, fetch the contact
      if (details?.crmContactId && tenantId) {
        try {
          const contact = await prisma.crmContact.findFirst({
            where: {
              id: details.crmContactId,
              tenantId: tenantId
            },
            select: {
              id: true,
              phonePrimary: true,
              phoneSecondary: true,
              whatsappNumber: true
            }
          });

          if (contact) {
            if (contact.phonePrimary) return contact.phonePrimary;
            if (contact.phoneSecondary) return contact.phoneSecondary;
            if (contact.whatsappNumber) return contact.whatsappNumber;
          }
        } catch (error) {
          // If contact fetch fails, continue to fallback
          console.error(`Error fetching CRM contact for ${clientType}:`, error);
        }
      }

      // Fallback to phone in details
      const phoneFromDetails = details?.phone || details?.telephone || details?.mobile || '';
      if (phoneFromDetails) return phoneFromDetails;
    } catch (error) {
      console.error(`Error parsing details for ${clientType}:`, error);
    }
  }

  return '';
}

interface MissingDataReport {
  leaseId: string;
  leaseNumber: string;
  tenantId: string;
  tenantName: string;
  missingFields: {
    agence?: {
      address?: boolean;
      phone?: boolean;
      email?: boolean;
    };
    bien?: {
      address?: boolean;
      rooms?: boolean;
      bedrooms?: boolean;
    };
    locataire?: {
      phone?: boolean;
    };
    bailleur?: {
      phone?: boolean;
    };
  };
  urls: {
    leaseUrl: string;
    tenantSettingsUrl?: string;
    propertyEditUrl?: string;
    locataireContactUrl?: string;
    bailleurContactUrl?: string;
  };
}

async function checkLeaseData(tenantId?: string): Promise<MissingDataReport[]> {
  console.log('🔍 Recherche des données manquantes dans les contrats de bail...\n');

  // Build where clause
  const whereClause: any = {};
  if (tenantId) {
    whereClause.tenant_id = tenantId;
  }

  // Fetch all leases with related data
  const leases = await prisma.rentalLease.findMany({
    where: whereClause,
    include: {
      tenant: true,
      property: true,
      primaryRenter: {
        include: {
          user: true
        }
      },
      ownerClient: {
        include: {
          user: true
        }
      }
    },
    orderBy: {
      created_at: 'desc'
    }
  });

  console.log(`✓ ${leases.length} bail(s) trouvé(s)\n`);

  const reports: MissingDataReport[] = [];

  for (const lease of leases) {
    const missingFields: MissingDataReport['missingFields'] = {};
    let hasMissingData = false;

    // Check Tenant (Agency) data
    const agenceMissing: any = {};
    if (!lease.tenant.address && !lease.tenant.city) {
      agenceMissing.address = true;
      hasMissingData = true;
    }
    if (!lease.tenant.contactPhone) {
      agenceMissing.phone = true;
      hasMissingData = true;
    }
    if (!lease.tenant.contactEmail) {
      agenceMissing.email = true;
      hasMissingData = true;
    }
    if (Object.keys(agenceMissing).length > 0) {
      missingFields.agence = agenceMissing;
    }

    // Check Property data
    const bienMissing: any = {};
    if (!lease.property.address) {
      bienMissing.address = true;
      hasMissingData = true;
    }
    if (!lease.property.rooms) {
      bienMissing.rooms = true;
      hasMissingData = true;
    }
    if (!lease.property.bedrooms) {
      bienMissing.bedrooms = true;
      hasMissingData = true;
    }
    if (Object.keys(bienMissing).length > 0) {
      missingFields.bien = bienMissing;
    }

    // Check Locataire (Renter) phone
    if (lease.primaryRenter) {
      const locatairePhone = await getPhoneFromClient(lease.primaryRenter, lease.tenant_id, 'LOCATAIRE');
      if (!locatairePhone) {
        missingFields.locataire = { phone: true };
        hasMissingData = true;
      }
    }

    // Check Bailleur (Owner) phone
    if (lease.ownerClient) {
      const bailleurPhone = await getPhoneFromClient(lease.ownerClient, lease.tenant_id, 'BAILLEUR');
      if (!bailleurPhone) {
        missingFields.bailleur = { phone: true };
        hasMissingData = true;
      }
    }

    // Only add to report if there's missing data
    if (hasMissingData) {
      // Get CRM contact IDs for URLs
      let locataireContactId: string | undefined;
      let bailleurContactId: string | undefined;

      if (lease.primaryRenter?.details) {
        try {
          const details =
            typeof lease.primaryRenter.details === 'string'
              ? JSON.parse(lease.primaryRenter.details)
              : lease.primaryRenter.details;
          locataireContactId = details?.crmContactId;
        } catch (e) {
          // Ignore
        }
      }

      if (lease.ownerClient?.details) {
        try {
          const details =
            typeof lease.ownerClient.details === 'string'
              ? JSON.parse(lease.ownerClient.details)
              : lease.ownerClient.details;
          bailleurContactId = details?.crmContactId;
        } catch (e) {
          // Ignore
        }
      }

      reports.push({
        leaseId: lease.id,
        leaseNumber: lease.lease_number,
        tenantId: lease.tenant_id,
        tenantName: lease.tenant.name,
        missingFields,
        urls: {
          leaseUrl: `http://localhost:3000/tenant/${lease.tenant_id}/rental/leases/${lease.id}`,
          tenantSettingsUrl: `http://localhost:3000/tenant/${lease.tenant_id}/settings`,
          propertyEditUrl: `http://localhost:3000/tenant/${lease.tenant_id}/properties/${lease.property_id}/edit`,
          locataireContactUrl: locataireContactId
            ? `http://localhost:3000/tenant/${lease.tenant_id}/crm/contacts/${locataireContactId}`
            : undefined,
          bailleurContactUrl: bailleurContactId
            ? `http://localhost:3000/tenant/${lease.tenant_id}/crm/contacts/${bailleurContactId}`
            : undefined
        }
      });
    }
  }

  return reports;
}

async function main() {
  try {
    // Get tenant ID from command line argument or check all
    const tenantId = process.argv[2];

    const reports = await checkLeaseData(tenantId);

    if (reports.length === 0) {
      console.log('✅ Aucune donnée manquante trouvée ! Tous les contrats sont complets.\n');
      return;
    }

    console.log(`\n⚠️  ${reports.length} bail(s) avec des données manquantes :\n`);
    console.log('='.repeat(100));

    for (const report of reports) {
      console.log(`\n📄 Bail N° ${report.leaseNumber}`);
      console.log(`   Tenant: ${report.tenantName}`);
      console.log(`   URL: ${report.urls.leaseUrl}\n`);

      if (report.missingFields.agence) {
        console.log('   🏢 Informations Agence manquantes:');
        if (report.missingFields.agence.address) {
          console.log('      ❌ Adresse (AGENCE_ADRESSE)');
          console.log(`         → Renseigner dans: ${report.urls.tenantSettingsUrl}`);
        }
        if (report.missingFields.agence.phone) {
          console.log('      ❌ Téléphone (AGENCE_TELEPHONE)');
          console.log(`         → Renseigner dans: ${report.urls.tenantSettingsUrl}`);
        }
        if (report.missingFields.agence.email) {
          console.log('      ❌ Email (AGENCE_EMAIL)');
          console.log(`         → Renseigner dans: ${report.urls.tenantSettingsUrl}`);
        }
      }

      if (report.missingFields.bien) {
        console.log('   🏠 Informations Bien manquantes:');
        if (report.missingFields.bien.address) {
          console.log('      ❌ Adresse (BIEN_ADRESSE)');
          console.log(`         → Renseigner dans: ${report.urls.propertyEditUrl}`);
        }
        if (report.missingFields.bien.rooms) {
          console.log('      ❌ Nombre de pièces (BIEN_PIECES)');
          console.log(`         → Renseigner dans: ${report.urls.propertyEditUrl}`);
        }
        if (report.missingFields.bien.bedrooms) {
          console.log('      ❌ Nombre de chambres (BIEN_CHAMBRES)');
          console.log(`         → Renseigner dans: ${report.urls.propertyEditUrl}`);
        }
      }

      if (report.missingFields.locataire) {
        console.log('   👤 Informations Locataire manquantes:');
        if (report.missingFields.locataire.phone) {
          console.log('      ❌ Téléphone (LOCATAIRE_TELEPHONE)');
          if (report.urls.locataireContactUrl) {
            console.log(`         → Renseigner dans: ${report.urls.locataireContactUrl}`);
          } else {
            console.log(`         → Renseigner dans le contact CRM du locataire`);
          }
        }
      }

      if (report.missingFields.bailleur) {
        console.log('   👔 Informations Bailleur manquantes:');
        if (report.missingFields.bailleur.phone) {
          console.log('      ❌ Téléphone (BAILLEUR_TELEPHONE)');
          if (report.urls.bailleurContactUrl) {
            console.log(`         → Renseigner dans: ${report.urls.bailleurContactUrl}`);
          } else {
            console.log(`         → Renseigner dans le contact CRM du bailleur`);
          }
        }
      }

      console.log('');
    }

    console.log('='.repeat(100));

    const totalLeases = await prisma.rentalLease.count({ where: tenantId ? { tenant_id: tenantId } : {} });
    const completeLeases = totalLeases - reports.length;

    console.log(`\n📊 Résumé:`);
    console.log(`   Total de baux vérifiés: ${totalLeases}`);
    console.log(`   Baux avec données manquantes: ${reports.length}`);
    console.log(`   Baux complets: ${completeLeases}\n`);

    // Generate JSON report
    const jsonReport = {
      generatedAt: new Date().toISOString(),
      totalChecked: totalLeases,
      totalWithMissingData: reports.length,
      totalComplete: completeLeases,
      reports: reports
    };

    const reportPath = path.join(__dirname, '..', 'missing-lease-data-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(jsonReport, null, 2));
    console.log(`📄 Rapport JSON sauvegardé: ${reportPath}\n`);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
