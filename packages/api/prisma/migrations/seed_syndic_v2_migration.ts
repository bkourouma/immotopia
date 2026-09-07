import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const documentTypeMap: Record<string, 'SYNDICATE_REGL_COPRO' | 'SYNDICATE_PV' | 'SYNDICATE_BUDGET' | 'SYNDICATE_CONTRAT'> = {
  REGULATION: 'SYNDICATE_REGL_COPRO',
  GENERAL_MEETING_MINUTES: 'SYNDICATE_PV',
  BUDGET: 'SYNDICATE_BUDGET',
  DIAGNOSTIC: 'SYNDICATE_CONTRAT',
  INSURANCE: 'SYNDICATE_CONTRAT',
  OTHER: 'SYNDICATE_CONTRAT'
};

async function migrateLotCoowners() {
  const lots = await prisma.syndicateLot.findMany({
    where: {
      ownerContactId: { not: null },
      coownerId: null
    },
    include: {
      syndicate: {
        select: { tenantId: true }
      }
    }
  });

  for (const lot of lots) {
    if (!lot.ownerContactId) continue;
    await prisma.$transaction(async (tx) => {
      await tx.syndicateLot.update({
        where: { id: lot.id },
        data: { coownerId: lot.ownerContactId }
      });

      const role = await tx.crmContactRole.findFirst({
        where: {
          tenantId: lot.syndicate.tenantId,
          contactId: lot.ownerContactId,
          role: 'COOWNER',
          active: true
        },
        select: { id: true }
      });

      if (!role) {
        await tx.crmContactRole.create({
          data: {
            tenantId: lot.syndicate.tenantId,
            contactId: lot.ownerContactId,
            role: 'COOWNER',
            active: true,
            startedAt: new Date()
          }
        });
      }
    });
  }
}

async function migrateTenantProfiles() {
  const profiles = await prisma.lotTenantProfile.findMany({
    include: {
      lot: {
        include: {
          syndicate: { select: { tenantId: true } }
        }
      }
    }
  });

  for (const profile of profiles) {
    await prisma.$transaction(async (tx) => {
      await tx.lotTenantAssignment.updateMany({
        where: { lotId: profile.lotId, isActive: true },
        data: { isActive: false }
      });

      const existing = await tx.lotTenantAssignment.findFirst({
        where: {
          lotId: profile.lotId,
          tenantId: profile.contactId,
          startDate: profile.tenantSince
        },
        select: { id: true }
      });

      if (!existing) {
        await tx.lotTenantAssignment.create({
          data: {
            lotId: profile.lotId,
            tenantId: profile.contactId,
            leaseId: profile.leaseId ?? undefined,
            startDate: profile.tenantSince,
            endDate: profile.tenantUntil ?? undefined,
            isActive: profile.isCurrent
          }
        });
      }

      const role = await tx.crmContactRole.findFirst({
        where: {
          tenantId: profile.lot.syndicate.tenantId,
          contactId: profile.contactId,
          role: 'TENANT',
          active: true
        },
        select: { id: true }
      });
      if (!role) {
        await tx.crmContactRole.create({
          data: {
            tenantId: profile.lot.syndicate.tenantId,
            contactId: profile.contactId,
            role: 'TENANT',
            active: true,
            startedAt: new Date()
          }
        });
      }
    });
  }
}

async function migrateIncidentsToMaintenanceLinks() {
  const incidents = await prisma.syndicateIncident.findMany({
    include: {
      syndicate: true,
      lot: true
    }
  });

  for (const incident of incidents) {
    const existingLink = await prisma.syndicateMaintenanceLink.findFirst({
      where: { syndicateId: incident.syndicateId, lotId: incident.lotId ?? undefined },
      select: { id: true }
    });
    if (existingLink) continue;

    const propertyId = incident.lot?.propertyId ?? incident.syndicate.propertyId;
    if (!propertyId) continue;

    const ticket = await prisma.maintenanceTicket.create({
      data: {
        tenant_id: incident.syndicate.tenantId,
        property_id: propertyId,
        title: `Incident syndic ${incident.incidentType}`,
        category: 'OTHER',
        priority:
          incident.urgency === 'CRITICAL' ? 'URGENT' : incident.urgency === 'HIGH' ? 'HIGH' : incident.urgency === 'MEDIUM' ? 'MEDIUM' : 'LOW',
        description: incident.description,
        status:
          incident.status === 'CLOSED'
            ? 'RESOLVED'
            : incident.status === 'RESOLVED'
              ? 'RESOLVED'
              : incident.status === 'ASSIGNED'
                ? 'ASSIGNED'
                : incident.status === 'IN_PROGRESS'
                  ? 'IN_PROGRESS'
                  : 'DECLARED',
        declared_at: incident.reportedAt
      }
    });

    await prisma.syndicateMaintenanceLink.create({
      data: {
        syndicateId: incident.syndicateId,
        maintenanceRequestId: ticket.id,
        lotId: incident.lotId ?? undefined,
        isCommonArea: !incident.lotId,
        costImputation: 'SYNDICATE'
      }
    });
  }
}

async function migrateSyndicateDocuments() {
  const docs = await prisma.syndicateDocument.findMany({
    include: {
      syndicate: {
        select: {
          propertyId: true
        }
      }
    }
  });

  for (const doc of docs) {
    const propertyId = doc.syndicate.propertyId;
    if (!propertyId) continue;

    const existing = await prisma.propertyDocument.findFirst({
      where: {
        propertyId,
        fileUrl: doc.fileUrl
      },
      select: { id: true }
    });
    if (existing) continue;

    const fileName = doc.fileUrl.split('/').pop() || `${doc.id}.dat`;
    await prisma.propertyDocument.create({
      data: {
        propertyId,
        documentType: documentTypeMap[doc.type] || 'SYNDICATE_CONTRAT',
        filePath: doc.fileUrl,
        fileUrl: doc.fileUrl,
        fileName,
        expirationDate: doc.expiresAt ?? undefined
      }
    });
  }
}

async function main() {
  await migrateLotCoowners();
  await migrateTenantProfiles();
  await migrateIncidentsToMaintenanceLinks();
  await migrateSyndicateDocuments();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
