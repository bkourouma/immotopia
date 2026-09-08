import { LotType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { notFound, tenantIsolationError, unprocessableEntity } from '../errors';
import { computeChargeCallStatus, computeOutstanding, isJournalEntryBalanced, roundMoney } from './finance-utils';
import { logger } from '../../utils/logger';
// Shared client: a second `new PrismaClient()` here doubled the connection
// pool and escaped the graceful-shutdown handlers in utils/database.
import { prisma, type PrismaTransactionClient } from '../../utils/database';

export type PaginationInput = {
  page?: number;
  limit?: number;
};

export type DateRangeInput = {
  from?: Date;
  to?: Date;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SYNDICATE_DOCUMENT_TYPES = [
  'REGULATION',
  'GENERAL_MEETING_MINUTES',
  'DIAGNOSTIC',
  'INSURANCE',
  'BUDGET',
  'OTHER'
] as const;

async function ensureCrmRoleForContact(
  tx: PrismaTransactionClient,
  tenantId: string,
  contactId: string,
  role: 'COOWNER' | 'TENANT'
) {
  const existing = await tx.crmContactRole.findFirst({
    where: {
      tenantId,
      contactId,
      role: role as any,
      active: true
    },
    select: { id: true }
  });

  if (existing) {
    return existing;
  }

  return tx.crmContactRole.create({
    data: {
      tenantId,
      contactId,
      role: role as any,
      active: true,
      startedAt: new Date()
    }
  });
}

export function buildPagination(pagination?: PaginationInput) {
  const page = Math.max(DEFAULT_PAGE, Number(pagination?.page ?? DEFAULT_PAGE));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(pagination?.limit ?? DEFAULT_LIMIT)));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit
  };
}

export function buildDateRangeFilter(field: string, range?: DateRangeInput): Record<string, Prisma.DateTimeFilter> {
  if (!range?.from && !range?.to) {
    return {};
  }

  return {
    [field]: {
      ...(range.from ? { gte: range.from } : {}),
      ...(range.to ? { lte: range.to } : {})
    } as Prisma.DateTimeFilter
  };
}

export async function assertSyndicateTenantOwnership(tenantId: string, syndicateId: string) {
  const syndicate = await prisma.syndicate.findFirst({
    where: {
      id: syndicateId,
      tenantId,
      status: {
        not: 'IN_LIQUIDATION'
      }
    },
    select: { id: true }
  });

  if (!syndicate) {
    throw tenantIsolationError('Copropriete introuvable pour ce tenant');
  }
}

async function syncSyndicateLotCount(
  tx: PrismaTransactionClient,
  syndicateId: string
) {
  const totalLots = await tx.syndicateLot.count({
    where: { syndicateId }
  });

  await tx.syndicate.update({
    where: { id: syndicateId },
    data: { totalLots }
  });
}

type OwnerAccountTxClient = PrismaTransactionClient;

function supportsOwnerAccount(tx: any): tx is OwnerAccountTxClient {
  return Boolean(tx?.ownerAccount && tx?.ownerAccountTransaction && tx?.syndicateLot);
}

async function ensureOwnerAccountForLotTx(
  tx: OwnerAccountTxClient,
  tenantId: string,
  syndicateId: string,
  lotId: string
) {
  if (!supportsOwnerAccount(tx)) {
    return null;
  }

  const lot = await tx.syndicateLot.findFirst({
    where: {
      id: lotId,
      syndicateId,
      syndicate: { tenantId }
    },
    select: {
      id: true,
      coownerId: true,
      ownerContactId: true,
      property: {
        select: {
          owner: {
            select: {
              email: true
            }
          }
        }
      }
    }
  });

  if (!lot) {
    return null;
  }

  let contactId = lot.coownerId ?? lot.ownerContactId ?? null;

  // Fallback for imported lots: map property owner user email to tenant CRM contact.
  if (!contactId) {
    const ownerEmail = lot.property?.owner?.email?.trim().toLowerCase();
    if (ownerEmail) {
      const ownerContact = await tx.crmContact.findFirst({
        where: {
          tenantId,
          email: ownerEmail
        },
        select: {
          id: true
        }
      });

      if (ownerContact?.id) {
        contactId = ownerContact.id;

        await tx.syndicateLot.update({
          where: { id: lot.id },
          data: {
            coownerId: ownerContact.id,
            ownerContactId: ownerContact.id
          }
        });

        await ensureCrmRoleForContact(tx, tenantId, ownerContact.id, 'COOWNER');
      }
    }
  }

  if (!contactId) {
    return null;
  }

  const existing = await tx.ownerAccount.findUnique({
    where: { lotId }
  });

  if (existing) {
    return existing;
  }

  return tx.ownerAccount.create({
    data: {
      syndicateId,
      lotId,
      contactId,
      balance: 0
    }
  });
}

async function appendOwnerAccountTransactionTx(
  tx: OwnerAccountTxClient,
  params: {
    accountId: string;
    type: 'CHARGE_CALL' | 'PAYMENT' | 'PENALTY' | 'WAIVER' | 'ADJUSTMENT' | 'FUND_TRANSFER';
    debit?: number;
    credit?: number;
    label: string;
    reference?: string | null;
    sourceId?: string | null;
    transactionDate?: Date;
  }
) {
  if (!supportsOwnerAccount(tx)) {
    return null;
  }

  const account = await tx.ownerAccount.findUnique({
    where: { id: params.accountId },
    select: { id: true, balance: true }
  });

  if (!account) {
    return null;
  }

  const debit = roundMoney(params.debit ?? 0);
  const credit = roundMoney(params.credit ?? 0);
  const currentBalance = roundMoney(Number(account.balance ?? 0));
  const balanceAfter = roundMoney(currentBalance + debit - credit);

  const transaction = await tx.ownerAccountTransaction.create({
    data: {
      accountId: params.accountId,
      transactionDate: params.transactionDate ?? new Date(),
      type: params.type as any,
      debit: debit > 0 ? debit : undefined,
      credit: credit > 0 ? credit : undefined,
      balanceAfter,
      label: params.label,
      reference: params.reference ?? undefined,
      sourceId: params.sourceId ?? undefined
    }
  });

  await tx.ownerAccount.update({
    where: { id: params.accountId },
    data: { balance: balanceAfter }
  });

  return transaction;
}

export async function listSyndicatesByTenant(tenantId: string, pagination?: PaginationInput) {
  const pager = buildPagination(pagination);
  return prisma.syndicate.findMany({
    where: {
      tenantId,
      status: {
        not: 'IN_LIQUIDATION'
      }
    },
    include: {
      _count: {
        select: {
          lots: true,
          chargeCalls: true
        }
      }
    },
    skip: pager.skip,
    take: pager.take,
    orderBy: { createdAt: 'desc' }
  });
}

export async function getSyndicateWithLotsAndStats(tenantId: string, syndicateId: string) {
  return prisma.syndicate.findFirst({
    where: {
      id: syndicateId,
      tenantId,
      status: {
        not: 'IN_LIQUIDATION'
      }
    },
    include: {
      property: {
        include: {
          containerChildren: true
        }
      },
      lots: {
        include: {
          property: {
            include: {
              owner: {
                select: {
                  id: true,
                  email: true,
                  fullName: true
                }
              }
            }
          },
          coowner: true,
          tenantAssignments: {
            where: { isActive: true },
            include: {
              contact: true
            },
            orderBy: [{ createdAt: 'desc' }]
          }
        }
      },
      chargeCalls: true,
      funds: true
    }
  });
}

export async function createSyndicateWithDefaults(
  tenantId: string,
  data: {
    propertyId?: string;
    name: string;
    address?: string;
    registrationNo?: string | null;
    fiscalYear?: number;
    syndicManagerId?: string;
    cadastralReference?: string | null;
    totalLots?: number;
    totalBuildings?: number;
  }
) {
  if (data.propertyId) {
    const property = await prisma.property.findFirst({
      where: {
        id: data.propertyId,
        tenantId
      },
      select: {
        id: true,
        propertyType: true
      }
    });

    if (!property) {
      throw notFound('Immeuble introuvable ou inaccessible');
    }

    if (property.propertyType !== 'IMMEUBLE') {
      throw unprocessableEntity('La property liee au syndic doit etre de type IMMEUBLE');
    }

    const existing = await prisma.syndicate.findFirst({
      where: {
        propertyId: data.propertyId,
        tenantId
      },
      select: { id: true }
    });

    if (existing) {
      throw unprocessableEntity('Cette property est deja liee a une copropriete');
    }
  }

  if (data.syndicManagerId) {
    const manager = await prisma.crmContact.findFirst({
      where: {
        id: data.syndicManagerId,
        tenantId
      },
      select: { id: true }
    });
    if (!manager) {
      throw notFound('Syndic manager introuvable ou inaccessible');
    }
  }

  return prisma.syndicate.create({
    data: {
      propertyId: data.propertyId ?? undefined,
      name: data.name,
      address: data.address ?? '',
      registrationNo: data.registrationNo ?? undefined,
      fiscalYear: data.fiscalYear ?? 1,
      syndicManagerId: data.syndicManagerId ?? undefined,
      cadastralReference: data.cadastralReference ?? undefined,
      totalLots: data.totalLots ?? 0,
      totalBuildings: data.totalBuildings ?? 1,
      tenantId
    }
  });
}

export async function updateSyndicateByTenant(
  tenantId: string,
  syndicateId: string,
  data: {
    propertyId?: string;
    name?: string;
    address?: string;
    registrationNo?: string | null;
    fiscalYear?: number;
    syndicManagerId?: string | null;
    cadastralReference?: string | null;
    totalLots?: number;
    totalBuildings?: number;
    status?: 'ACTIVE' | 'IN_LIQUIDATION' | 'IN_DISPUTE';
    regulationDocUrl?: string | null;
  }
) {
  const existing = await prisma.syndicate.findFirst({
    where: {
      id: syndicateId,
      tenantId
    },
    select: { id: true }
  });

  if (!existing) {
    throw notFound('Copropriete introuvable ou inaccessible');
  }

  if (data.propertyId) {
    const property = await prisma.property.findFirst({
      where: { id: data.propertyId, tenantId },
      select: { id: true, propertyType: true }
    });
    if (!property) {
      throw notFound('Immeuble introuvable ou inaccessible');
    }
    if (property.propertyType !== 'IMMEUBLE') {
      throw unprocessableEntity('La property liee au syndic doit etre de type IMMEUBLE');
    }
  }

  if (data.syndicManagerId) {
    const manager = await prisma.crmContact.findFirst({
      where: { id: data.syndicManagerId, tenantId },
      select: { id: true }
    });
    if (!manager) {
      throw notFound('Syndic manager introuvable ou inaccessible');
    }
  }

  return prisma.syndicate.update({
    where: { id: syndicateId },
    data
  });
}

export async function archiveSyndicateByTenant(tenantId: string, syndicateId: string) {
  const existing = await prisma.syndicate.findFirst({
    where: {
      id: syndicateId,
      tenantId
    },
    select: { id: true }
  });

  if (!existing) {
    throw notFound('Copropriete introuvable ou inaccessible');
  }

  return prisma.syndicate.delete({
    where: { id: syndicateId }
  });
}

export async function createSyndicateLot(
  tenantId: string,
  data: {
    syndicateId: string;
    propertyId: string;
    coownerId?: string | null;
    lotNumber: string;
    lotType: LotType;
    tantiemes: number;
    surface?: number | null;
    floor?: number | null;
    isParkingIncluded?: boolean;
  }
) {
  const syndicate = await prisma.syndicate.findFirst({
    where: { id: data.syndicateId, tenantId },
    select: { id: true, propertyId: true }
  });

  if (!syndicate) {
    throw notFound('Copropriete introuvable ou inaccessible');
  }

  const property = await prisma.property.findFirst({
    where: { id: data.propertyId, tenantId },
    select: { id: true, containerParentId: true, propertyType: true }
  });

  if (!property) {
    throw notFound('Sous-propriete introuvable ou inaccessible');
  }

  if (property.propertyType === 'IMMEUBLE') {
    throw unprocessableEntity("Un lot ne peut pas etre un immeuble parent; selectionnez une unite (appartement, villa, bureau, etc.)");
  }

  if (data.coownerId) {
    const coowner = await prisma.crmContact.findFirst({
      where: { id: data.coownerId, tenantId },
      select: { id: true }
    });
    if (!coowner) {
      throw notFound('Coproprietaire introuvable ou inaccessible');
    }
  }

  return prisma.$transaction(async tx => {
    if (data.coownerId) {
      await ensureCrmRoleForContact(tx, tenantId, data.coownerId, 'COOWNER');
    }

    const lot = await tx.syndicateLot.create({
      data: {
        syndicateId: data.syndicateId,
        propertyId: data.propertyId,
        coownerId: data.coownerId ?? undefined,
        ownerContactId: data.coownerId ?? undefined,
        lotNumber: data.lotNumber,
        lotType: data.lotType,
        generalShares: Math.round(data.tantiemes),
        specialShares: data.isParkingIncluded ? Math.round(data.tantiemes) : null
      }
    });

    await syncSyndicateLotCount(tx, data.syndicateId);

    return lot;
  });
}

function inferLotTypeFromPropertyType(
  propertyType:
    | 'APPARTEMENT'
    | 'STUDIO'
    | 'DUPLEX_TRIPLEX'
    | 'CHAMBRE_COLOCATION'
    | 'MAISON_VILLA'
    | 'LOT_PROGRAMME_NEUF'
    | 'PARKING_BOX'
    | 'BUREAU'
    | 'BOUTIQUE_COMMERCIAL'
    | 'ENTREPOT_INDUSTRIEL'
    | 'TERRAIN'
    | 'IMMEUBLE'
): LotType {
  switch (propertyType) {
    case 'APPARTEMENT':
    case 'STUDIO':
    case 'DUPLEX_TRIPLEX':
    case 'CHAMBRE_COLOCATION':
    case 'MAISON_VILLA':
    case 'LOT_PROGRAMME_NEUF':
      return 'APARTMENT';
    case 'PARKING_BOX':
      return 'PARKING';
    case 'BUREAU':
      return 'OFFICE';
    case 'BOUTIQUE_COMMERCIAL':
      return 'COMMERCIAL';
    default:
      return 'OTHER';
  }
}

function inferLotNumberFromProperty(property: {
  internalReference: string;
  title: string;
  id: string;
}) {
  return property.internalReference || property.title || property.id;
}

export async function importLotsFromPropertiesBySyndicate(
  tenantId: string,
  syndicateId: string,
  propertyIds: string[]
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  const selectedProperties = await prisma.property.findMany({
    where: {
      tenantId,
      id: { in: Array.from(new Set(propertyIds)) }
    },
    select: {
      id: true,
      propertyType: true,
      internalReference: true,
      title: true,
      owner: {
        select: {
          email: true
        }
      }
    }
  });

  const selectedIds = new Set(selectedProperties.map(property => property.id));
  const notFoundPropertyIds = propertyIds.filter(id => !selectedIds.has(id));

  const buildingIds = selectedProperties
    .filter(property => property.propertyType === 'IMMEUBLE')
    .map(property => property.id);

  const buildingChildren = buildingIds.length
    ? await prisma.property.findMany({
        where: {
          tenantId,
          containerParentId: { in: buildingIds }
        },
        select: {
          id: true,
          propertyType: true,
          internalReference: true,
          title: true,
          containerParentId: true,
          owner: {
            select: {
              email: true
            }
          }
        }
      })
    : [];

  const directProperties = selectedProperties
    .filter(property => property.propertyType !== 'IMMEUBLE')
    .map(property => ({
      ...property,
      containerParentId: null as string | null
    }));

  const candidatesById = new Map<
    string,
    {
      id: string;
      propertyType:
        | 'APPARTEMENT'
        | 'MAISON_VILLA'
        | 'STUDIO'
        | 'DUPLEX_TRIPLEX'
        | 'CHAMBRE_COLOCATION'
        | 'BUREAU'
        | 'BOUTIQUE_COMMERCIAL'
        | 'ENTREPOT_INDUSTRIEL'
        | 'TERRAIN'
        | 'IMMEUBLE'
        | 'PARKING_BOX'
        | 'LOT_PROGRAMME_NEUF';
      internalReference: string;
      title: string;
      containerParentId: string | null;
      owner: {
        email: string;
      } | null;
    }
  >();

  directProperties.forEach(property => {
    candidatesById.set(property.id, property);
  });
  buildingChildren.forEach(property => {
    candidatesById.set(property.id, property);
  });

  const candidates = Array.from(candidatesById.values()).filter(property => property.propertyType !== 'IMMEUBLE');
  if (candidates.length === 0) {
    return {
      created: [],
      skipped: [],
      notFoundPropertyIds,
      message: 'Aucune unite importable trouvee dans la selection'
    };
  }

  const ownerEmails = Array.from(
    new Set(
      candidates
        .map(property => property.owner?.email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email))
    )
  );

  const ownerContacts = ownerEmails.length
    ? await prisma.crmContact.findMany({
        where: {
          tenantId,
          email: { in: ownerEmails }
        },
        select: {
          id: true,
          email: true
        }
      })
    : [];

  const ownerContactByEmail = new Map<string, string>();
  ownerContacts.forEach(contact => {
    const email = contact.email?.trim().toLowerCase();
    if (email) {
      ownerContactByEmail.set(email, contact.id);
    }
  });

  const existingLots = await prisma.syndicateLot.findMany({
    where: {
      propertyId: {
        in: candidates.map(property => property.id)
      }
    },
    select: {
      id: true,
      syndicateId: true,
      propertyId: true,
      syndicate: {
        select: {
          status: true
        }
      }
    }
  });

  // Auto-release links coming from liquidated syndicates.
  const liquidatedLotIds = existingLots
    .filter(lot => lot.syndicate.status === 'IN_LIQUIDATION')
    .map(lot => lot.id);

  if (liquidatedLotIds.length > 0) {
    await prisma.syndicateLot.updateMany({
      where: { id: { in: liquidatedLotIds } },
      data: { propertyId: null }
    });
  }

  const existingByPropertyId = new Map<string, { id: string; syndicateId: string }>();
  existingLots
    .filter(lot => lot.syndicate.status !== 'IN_LIQUIDATION')
    .forEach(lot => {
    if (lot.propertyId) {
      existingByPropertyId.set(lot.propertyId, { id: lot.id, syndicateId: lot.syndicateId });
    }
    });

  const created: Array<{ lotId: string; propertyId: string; lotNumber: string; sourceBuildingId: string | null }> = [];
  const skipped: Array<{ propertyId: string; reason: string }> = [];

  for (const property of candidates) {
    const existingLot = existingByPropertyId.get(property.id);
    if (existingLot) {
      skipped.push({
        propertyId: property.id,
        reason:
          existingLot.syndicateId === syndicateId
            ? 'Propriete deja importee dans cette copropriete'
            : 'Propriete deja liee a une autre copropriete'
      });
      continue;
    }

    const lotType = inferLotTypeFromPropertyType(property.propertyType);
    const lotNumber = inferLotNumberFromProperty(property);
    const tantiemes = 1;

    const ownerContactId = property.owner?.email
      ? ownerContactByEmail.get(property.owner.email.trim().toLowerCase()) || null
      : null;

    const lot = await prisma.$transaction(async tx => {
      if (ownerContactId) {
        await ensureCrmRoleForContact(tx, tenantId, ownerContactId, 'COOWNER');
      }

      return tx.syndicateLot.create({
        data: {
          syndicateId,
          propertyId: property.id,
          coownerId: ownerContactId ?? undefined,
          ownerContactId: ownerContactId ?? undefined,
          lotNumber,
          lotType,
          generalShares: tantiemes,
          specialShares: lotType === 'PARKING' ? tantiemes : null
        },
        select: {
          id: true
        }
      });
    });

    created.push({
      lotId: lot.id,
      propertyId: property.id,
      lotNumber,
      sourceBuildingId: property.containerParentId ?? null
    });
  }

  await syncSyndicateLotCount(prisma, syndicateId);

  return {
    created,
    skipped,
    notFoundPropertyIds,
    summary: {
      requested: propertyIds.length,
      importable: candidates.length,
      created: created.length,
      skipped: skipped.length
    }
  };
}

export async function updateSyndicateLotByTenant(
  tenantId: string,
  syndicateId: string,
  lotId: string,
  data: {
    propertyId?: string | null;
    coownerId?: string | null;
    lotNumber?: string;
    lotType?: LotType;
    tantiemes?: number;
    surface?: number | null;
    floor?: number | null;
    isParkingIncluded?: boolean;
  }
) {
  const existing = await prisma.syndicateLot.findFirst({
    where: { id: lotId, syndicateId, syndicate: { tenantId } },
    select: { id: true }
  });

  if (!existing) {
    throw notFound('Lot introuvable ou inaccessible');
  }

  if (data.coownerId) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: data.coownerId, tenantId },
      select: { id: true }
    });
    if (!contact) {
      throw notFound('Coproprietaire introuvable ou inaccessible');
    }
  }

  return prisma.$transaction(async tx => {
    if (data.coownerId) {
      await ensureCrmRoleForContact(tx, tenantId, data.coownerId, 'COOWNER');
    }

    return tx.syndicateLot.update({
      where: { id: lotId },
      data: {
        ...(Object.prototype.hasOwnProperty.call(data, 'propertyId') ? { propertyId: data.propertyId ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'coownerId')
          ? { coownerId: data.coownerId ?? null, ownerContactId: data.coownerId ?? null }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'lotNumber') ? { lotNumber: data.lotNumber } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'lotType') ? { lotType: data.lotType } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'tantiemes')
          ? { generalShares: data.tantiemes ? Math.round(data.tantiemes) : undefined }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'isParkingIncluded')
          ? { specialShares: data.isParkingIncluded ? Math.round(data.tantiemes ?? 0) : null }
          : {})
      }
    });
  });
}

export async function addLotTenantBySyndicate(
  tenantId: string,
  syndicateId: string,
  lotId: string,
  data: {
    tenantId: string;
    startDate: Date;
    endDate?: Date;
    leaseId?: string;
    notes?: string;
  }
) {
  const [lot, tenantContact] = await Promise.all([
    prisma.syndicateLot.findFirst({
      where: {
        id: lotId,
        syndicateId,
        syndicate: { tenantId }
      },
      select: { id: true }
    }),
    prisma.crmContact.findFirst({
      where: {
        id: data.tenantId,
        tenantId
      },
      select: { id: true }
    })
  ]);

  if (!lot) {
    throw notFound('Lot introuvable ou inaccessible');
  }
  if (!tenantContact) {
    throw notFound('Contact locataire introuvable ou inaccessible');
  }

  return prisma.$transaction(async tx => {
    await tx.lotTenantAssignment.updateMany({
      where: {
        lotId,
        isActive: true
      },
      data: {
        isActive: false
      }
    });

    await ensureCrmRoleForContact(tx, tenantId, data.tenantId, 'TENANT');

    return tx.lotTenantAssignment.create({
      data: {
        lotId,
        tenantId: data.tenantId,
        leaseId: data.leaseId,
        startDate: data.startDate,
        endDate: data.endDate,
        notes: data.notes,
        isActive: true
      },
      include: {
        contact: true,
        lot: true
      }
    });
  });
}

export async function deactivateLotTenantAssignmentBySyndicate(
  tenantId: string,
  syndicateId: string,
  lotId: string,
  assignmentId: string
) {
  const assignment = await prisma.lotTenantAssignment.findFirst({
    where: {
      id: assignmentId,
      lotId,
      lot: {
        syndicateId,
        syndicate: {
          tenantId
        }
      }
    },
    select: { id: true }
  });

  if (!assignment) {
    throw notFound('Assignation locataire introuvable ou inaccessible');
  }

  return prisma.lotTenantAssignment.update({
    where: { id: assignmentId },
    data: {
      isActive: false,
      endDate: new Date()
    }
  });
}

export async function listChargeCallsBySyndicate(
  tenantId: string,
  syndicateId: string,
  filters?: {
    period?: string;
    status?: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
    range?: DateRangeInput;
    pagination?: PaginationInput;
  }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const pager = buildPagination(filters?.pagination);

  return prisma.chargeCall.findMany({
    where: {
      syndicateId,
      syndicate: {
        tenantId
      },
      ...(filters?.period ? { period: filters.period } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...buildDateRangeFilter('dueDate', filters?.range)
    },
    include: {
      lot: {
        include: {
          owner: true,
          property: {
            include: {
              owner: {
                select: {
                  id: true,
                  email: true,
                  fullName: true
                }
              }
            }
          }
        }
      },
      payments: true
    },
    skip: pager.skip,
    take: pager.take,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }]
  });
}

export async function getChargeCallByTenant(tenantId: string, syndicateId: string, chargeCallId: string) {
  return prisma.chargeCall.findFirst({
    where: {
      id: chargeCallId,
      syndicateId,
      syndicate: {
        tenantId
      }
    },
    include: {
      lot: {
        include: {
          owner: true
        }
      },
      payments: true,
      syndicate: true
    }
  });
}

export async function createChargeCallAndUpdateStatus(
  tenantId: string,
  data: {
    syndicateId: string;
    lotId?: string;
    lotIds?: string[];
    applyToAllLots?: boolean;
    period: string;
    amount: number;
    currency: string;
    dueDate: Date;
    isRecurring?: boolean;
    recurrenceFrequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
    recurrenceCount?: number;
  }
): Promise<any> {
  const isSimpleSingleCall =
    !data.applyToAllLots &&
    (!data.lotIds || data.lotIds.length === 0) &&
    Boolean(data.lotId) &&
    (!data.isRecurring || (data.recurrenceCount ?? 1) <= 1);

  if (isSimpleSingleCall && data.lotId) {
    const lot = await prisma.syndicateLot.findFirst({
      where: {
        id: data.lotId,
        syndicateId: data.syndicateId,
        syndicate: {
          tenantId
        }
      },
      select: { id: true }
    });

    if (!lot) {
      throw notFound('Lot introuvable ou inaccessible pour cette copropriete');
    }

    return prisma.$transaction(async tx => {
      const chargeCall = await tx.chargeCall.create({
        data: {
          syndicateId: data.syndicateId,
          lotId: data.lotId!,
          period: data.period,
          amount: data.amount,
          currency: data.currency,
          dueDate: data.dueDate
        }
      });

      const account = await ensureOwnerAccountForLotTx(tx, tenantId, data.syndicateId, data.lotId!);
      if (account) {
        await appendOwnerAccountTransactionTx(tx, {
          accountId: account.id,
          type: 'CHARGE_CALL',
          debit: Number(data.amount),
          label: `Appel de charges ${data.period}`,
          sourceId: chargeCall.id,
          transactionDate: data.dueDate
        });
      }

      return chargeCall;
    });
  }

  await assertSyndicateTenantOwnership(tenantId, data.syndicateId);

  const targetLotIds = data.applyToAllLots
    ? (
        await prisma.syndicateLot.findMany({
          where: {
            syndicateId: data.syndicateId,
            syndicate: { tenantId }
          },
          select: { id: true }
        })
      ).map(lot => lot.id)
    : Array.from(new Set([data.lotId, ...(data.lotIds ?? [])].filter(Boolean) as string[]));

  if (targetLotIds.length === 0) {
    throw unprocessableEntity('Aucun lot cible pour cet appel de charges');
  }

  const existingLots = await prisma.syndicateLot.findMany({
    where: {
      id: { in: targetLotIds },
      syndicateId: data.syndicateId,
      syndicate: { tenantId }
    },
    select: { id: true }
  });

  if (existingLots.length !== targetLotIds.length) {
    throw notFound('Un ou plusieurs lots sont introuvables pour cette copropriete');
  }

  const recurrenceCount = data.isRecurring ? Math.max(1, data.recurrenceCount ?? 1) : 1;
  const recurrenceFrequency = data.recurrenceFrequency ?? 'MONTHLY';

  const addRecurrence = (baseDate: Date, index: number) => {
    const next = new Date(baseDate);
    if (index <= 0) {
      return next;
    }
    if (recurrenceFrequency === 'MONTHLY') {
      next.setMonth(next.getMonth() + index);
      return next;
    }
    if (recurrenceFrequency === 'QUARTERLY') {
      next.setMonth(next.getMonth() + index * 3);
      return next;
    }
    next.setFullYear(next.getFullYear() + index);
    return next;
  };

  const resolvePeriodLabel = (index: number) => {
    if (recurrenceCount <= 1) {
      return data.period;
    }
    return `${data.period}-R${index + 1}`;
  };

  type CreatedChargeCall = Awaited<ReturnType<typeof prisma.chargeCall.create>>;
  const createdChargeCalls: CreatedChargeCall[] = [];

  for (let occurrenceIndex = 0; occurrenceIndex < recurrenceCount; occurrenceIndex += 1) {
    const dueDate = addRecurrence(data.dueDate, occurrenceIndex);
    const period = resolvePeriodLabel(occurrenceIndex);

    await prisma.$transaction(async tx => {
      for (const lotId of targetLotIds) {
        const chargeCall = await tx.chargeCall.create({
          data: {
            syndicateId: data.syndicateId,
            lotId,
            period,
            amount: data.amount,
            currency: data.currency,
            dueDate
          }
        });

        const account = await ensureOwnerAccountForLotTx(tx, tenantId, data.syndicateId, lotId);
        if (account) {
          await appendOwnerAccountTransactionTx(tx, {
            accountId: account.id,
            type: 'CHARGE_CALL',
            debit: Number(data.amount),
            label: `Appel de charges ${period}`,
            sourceId: chargeCall.id,
            transactionDate: dueDate
          });
        }

        createdChargeCalls.push(chargeCall);
      }
    });
  }

  return {
    chargeCalls: createdChargeCalls,
    generatedLots: targetLotIds.length,
    occurrences: recurrenceCount,
    totalCreated: createdChargeCalls.length
  };
}

export async function recordChargePaymentWithStatusUpdate(
  tenantId: string,
  data: { chargeCallId: string; amount: number; paidAt: Date; method?: string | null; reference?: string | null }
) {
  return prisma.$transaction(async tx => {
    const call = await tx.chargeCall.findFirst({
      where: {
        id: data.chargeCallId,
        syndicate: {
          tenantId
        }
      }
    });

    if (!call) {
      throw notFound('Appel de charges introuvable ou inaccessible');
    }

    const payment = await tx.chargePayment.create({ data });

    const aggregate = await tx.chargePayment.aggregate({
      where: { chargeCallId: data.chargeCallId },
      _sum: { amount: true }
    });

    const totalPaid = roundMoney(Number(aggregate._sum.amount ?? 0));
    const chargeAmount = Number(call.amount);
    const status = computeChargeCallStatus(totalPaid, chargeAmount);

    await tx.chargeCall.update({
      where: { id: call.id },
      data: { status }
    });

    const account = await ensureOwnerAccountForLotTx(tx, tenantId, call.syndicateId, call.lotId);
    if (account) {
      await appendOwnerAccountTransactionTx(tx, {
        accountId: account.id,
        type: 'PAYMENT',
        credit: Number(data.amount),
        label: 'Paiement appel de charges',
        reference: data.reference,
        sourceId: payment.id,
        transactionDate: data.paidAt
      });
    }

    return payment;
  });
}

export async function listMeetingsBySyndicate(
  tenantId: string,
  syndicateId: string,
  filters?: {
    status?: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    range?: DateRangeInput;
    pagination?: PaginationInput;
  }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const pager = buildPagination(filters?.pagination);

  return prisma.generalMeeting.findMany({
    where: {
      syndicateId,
      syndicate: {
        tenantId
      },
      ...(filters?.status ? { status: filters.status } : {}),
      ...buildDateRangeFilter('scheduledAt', filters?.range)
    },
    include: {
      agendaItems: {
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }]
      },
      resolutions: true,
      proxies: true
    },
    skip: pager.skip,
    take: pager.take,
    orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }]
  });
}

export async function getMeetingByTenant(tenantId: string, syndicateId: string, meetingId: string) {
  return prisma.generalMeeting.findFirst({
    where: {
      id: meetingId,
      syndicateId,
      syndicate: {
        tenantId
      }
    },
    include: {
      syndicate: {
        include: {
          lots: {
            include: {
              owner: true
            }
          }
        }
      },
      agendaItems: {
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }]
      },
      resolutions: {
        include: {
          votes: {
            include: {
              lot: {
                include: {
                  owner: true
                }
              }
            }
          }
        }
      },
      proxies: true
    }
  });
}

export async function createMeetingWithResolutions(
  tenantId: string,
  data: {
    syndicateId: string;
    type: string;
    scheduledAt: Date;
    startTime?: Date;
    endTime?: Date;
    location?: string | null;
    resolutions: { title: string; description?: string | null; majorityRule?: string | null }[];
  }
) {
  if (data.startTime && data.endTime && data.startTime > data.endTime) {
    throw unprocessableEntity("L'heure de debut doit etre inferieure a l'heure de fin");
  }

  const syndicate = await prisma.syndicate.findFirst({
    where: {
      id: data.syndicateId,
      tenantId
    },
    select: { id: true }
  });

  if (!syndicate) {
    throw notFound('Copropriete introuvable ou inaccessible');
  }

  return prisma.$transaction(async tx => {
    const meeting = await tx.generalMeeting.create({
      data: {
        syndicateId: data.syndicateId,
        type: data.type as any,
        scheduledAt: data.scheduledAt,
        startTime: data.startTime ?? undefined,
        endTime: data.endTime ?? undefined,
        location: data.location ?? undefined
      }
    });

    if (data.resolutions.length > 0) {
      await tx.gMResolution.createMany({
        data: data.resolutions.map(r => ({
          meetingId: meeting.id,
          title: r.title,
          description: r.description,
          majorityRule: r.majorityRule
        }))
      });
    }

    return getMeetingByTenant(tenantId, data.syndicateId, meeting.id);
  });
}

export async function updateMeetingByTenant(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  data: { startTime?: Date | null; endTime?: Date | null; location?: string | null }
) {
  const existing = await prisma.generalMeeting.findFirst({
    where: {
      id: meetingId,
      syndicateId,
      syndicate: {
        tenantId
      }
    },
    select: { id: true }
  });

  if (!existing) {
    throw notFound('Assemblee generale introuvable ou inaccessible');
  }

  return prisma.generalMeeting.update({
    where: { id: meetingId },
    data: {
      ...(Object.prototype.hasOwnProperty.call(data, 'startTime') ? { startTime: data.startTime ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'endTime') ? { endTime: data.endTime ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'location') ? { location: data.location ?? null } : {})
    }
  });
}

export async function addAgendaItemToMeeting(
  tenantId: string,
  syndicateId: string,
  data: { meetingId: string; title: string; orderIndex?: number; discussions: string[] }
) {
  const meeting = await prisma.generalMeeting.findFirst({
    where: {
      id: data.meetingId,
      syndicateId,
      syndicate: {
        tenantId
      }
    },
    select: { id: true }
  });

  if (!meeting) {
    throw notFound('Assemblee generale introuvable ou inaccessible');
  }

  const currentCount = await prisma.gMAgendaItem.count({
    where: { meetingId: data.meetingId }
  });

  const orderIndex = data.orderIndex ?? currentCount + 1;

  return prisma.gMAgendaItem.create({
    data: {
      meetingId: data.meetingId,
      title: data.title,
      orderIndex,
      discussions: data.discussions
    }
  });
}

export async function updateAgendaItemByTenant(
  tenantId: string,
  syndicateId: string,
  agendaItemId: string,
  data: { title?: string; orderIndex?: number; discussions?: string[] }
) {
  const existing = await prisma.gMAgendaItem.findFirst({
    where: {
      id: agendaItemId,
      meeting: {
        syndicateId,
        syndicate: {
          tenantId
        }
      }
    },
    select: { id: true }
  });

  if (!existing) {
    throw notFound("Point d'ordre du jour introuvable ou inaccessible");
  }

  return prisma.gMAgendaItem.update({
    where: { id: agendaItemId },
    data
  });
}

export async function deleteAgendaItemByTenant(tenantId: string, syndicateId: string, agendaItemId: string) {
  const existing = await prisma.gMAgendaItem.findFirst({
    where: {
      id: agendaItemId,
      meeting: {
        syndicateId,
        syndicate: {
          tenantId
        }
      }
    },
    select: { id: true }
  });

  if (!existing) {
    throw notFound("Point d'ordre du jour introuvable ou inaccessible");
  }

  return prisma.gMAgendaItem.delete({
    where: { id: agendaItemId }
  });
}

export async function addResolutionToMeeting(
  tenantId: string,
  syndicateId: string,
  data: { meetingId: string; title: string; description?: string | null; majorityRule?: string | null }
) {
  const meeting = await prisma.generalMeeting.findFirst({
    where: {
      id: data.meetingId,
      syndicateId,
      syndicate: {
        tenantId
      }
    },
    select: { id: true }
  });

  if (!meeting) {
    throw notFound('Assemblee generale introuvable ou inaccessible');
  }

  return prisma.gMResolution.create({
    data
  });
}

export async function castVoteAndRecomputeResolutionCounters(
  tenantId: string,
  syndicateId: string,
  resolutionId: string,
  lotId: string,
  vote: 'FOR' | 'AGAINST' | 'ABSTAIN'
) {
  return prisma.$transaction(async tx => {
    const resolution = await tx.gMResolution.findFirst({
      where: {
        id: resolutionId,
        meeting: {
          syndicateId,
          syndicate: {
            tenantId
          }
        }
      },
      include: {
        meeting: true
      }
    });

    if (!resolution) {
      throw notFound('Resolution introuvable ou inaccessible');
    }

    const lot = await tx.syndicateLot.findFirst({
      where: {
        id: lotId,
        syndicateId,
        syndicate: {
          tenantId
        }
      },
      select: { id: true }
    });

    if (!lot) {
      throw notFound('Lot introuvable ou inaccessible');
    }

    await tx.gMVote.upsert({
      where: {
        resolutionId_lotId: {
          resolutionId,
          lotId
        }
      },
      update: { vote },
      create: {
        resolutionId,
        lotId,
        vote
      }
    });

    const votes = await tx.gMVote.findMany({
      where: { resolutionId },
      include: {
        lot: true
      }
    });

    const syndicateLots = await tx.syndicateLot.findMany({
      where: { syndicateId },
      select: { generalShares: true }
    });

    let votesFor = 0;
    let votesAgainst = 0;
    let votesAbstain = 0;
    let sharesFor = 0;
    let representedShares = 0;

    for (const currentVote of votes) {
      representedShares += currentVote.lot.generalShares;

      if (currentVote.vote === 'FOR') {
        votesFor += 1;
        sharesFor += currentVote.lot.generalShares;
      } else if (currentVote.vote === 'AGAINST') {
        votesAgainst += 1;
      } else if (currentVote.vote === 'ABSTAIN') {
        votesAbstain += 1;
      }
    }

    const totalShares = syndicateLots.reduce(
      (sum: number, currentLot: { generalShares: number }) => sum + currentLot.generalShares,
      0
    );
    const quorum = totalShares > 0 ? (representedShares / totalShares) * 100 : 0;
    const result = votesFor > votesAgainst ? 'APPROVED' : 'REJECTED';

    await tx.gMResolution.update({
      where: { id: resolutionId },
      data: {
        result,
        votesFor,
        votesAgainst,
        votesAbstain,
        sharesFor
      }
    });

    await tx.generalMeeting.update({
      where: { id: resolution.meeting.id },
      data: {
        quorum
      }
    });

    return getMeetingByTenant(tenantId, syndicateId, resolution.meeting.id);
  });
}

export async function linkMaintenanceRequestBySyndicate(
  tenantId: string,
  syndicateId: string,
  data: {
    maintenanceRequestId: string;
    lotId?: string;
    isCommonArea?: boolean;
    costImputation?: 'SYNDICATE' | 'LOT_OWNER' | 'LOT_TENANT' | 'MIXED';
    imputationDetail?: string;
  }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  const request = await prisma.maintenanceTicket.findFirst({
    where: {
      id: data.maintenanceRequestId,
      tenant_id: tenantId
    },
    select: { id: true }
  });
  if (!request) {
    throw notFound('MaintenanceRequest introuvable ou inaccessible');
  }

  if (data.lotId) {
    const lot = await prisma.syndicateLot.findFirst({
      where: {
        id: data.lotId,
        syndicateId,
        syndicate: { tenantId }
      },
      select: { id: true }
    });
    if (!lot) {
      throw notFound('Lot introuvable pour cette copropriete');
    }
  }

  return prisma.syndicateMaintenanceLink.create({
    data: {
      syndicateId,
      maintenanceRequestId: data.maintenanceRequestId,
      lotId: data.lotId,
      isCommonArea: data.isCommonArea ?? false,
      costImputation: (data.costImputation ?? 'SYNDICATE') as any,
      imputationDetail: data.imputationDetail
    },
    include: {
      request: true,
      lot: true
    }
  });
}

export async function listLinkedMaintenanceRequestsBySyndicate(tenantId: string, syndicateId: string) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  return prisma.syndicateMaintenanceLink.findMany({
    where: { syndicateId },
    include: {
      request: true,
      lot: true
    },
    orderBy: [{ createdAt: 'desc' }]
  });
}

export async function linkMaintenanceContractBySyndicate(
  tenantId: string,
  syndicateId: string,
  data: { maintenanceContractId: string; scope?: string; budgetLineItemId?: string }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  const contract = await prisma.maintenanceContract.findFirst({
    where: {
      id: data.maintenanceContractId,
      syndicate: {
        tenantId
      }
    },
    select: { id: true }
  });
  if (!contract) {
    throw notFound('MaintenanceContract introuvable ou inaccessible');
  }

  return prisma.syndicateContractLink.create({
    data: {
      syndicateId,
      maintenanceContractId: data.maintenanceContractId,
      scope: data.scope,
      budgetLineItemId: data.budgetLineItemId
    },
    include: {
      contract: {
        include: {
          provider: true
        }
      }
    }
  });
}

export async function listLinkedMaintenanceContractsBySyndicate(tenantId: string, syndicateId: string) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  return prisma.syndicateContractLink.findMany({
    where: { syndicateId },
    include: {
      contract: {
        include: {
          provider: true,
          syndicate: true
        }
      }
    },
    orderBy: [{ createdAt: 'desc' }]
  });
}

export async function listServiceProvidersBySyndicate(tenantId: string, syndicateId: string) {
  return prisma.serviceProvider.findMany({
    where: {
      tenantId
    },
    include: {
      contracts: {
        where: { syndicateId },
        include: {
          syndicate: true
        }
      }
    },
    orderBy: { name: 'asc' }
  });
}

export async function listMaintenanceContractsBySyndicate(
  tenantId: string,
  syndicateId: string,
  filters?: { status?: 'ACTIVE' | 'EXPIRED' | 'TERMINATED' }
) {
  return prisma.maintenanceContract.findMany({
    where: {
      syndicateId,
      syndicate: {
        tenantId
      },
      ...(filters?.status ? { status: filters.status } : {})
    },
    include: {
      provider: true,
      syndicate: true
    },
    orderBy: [{ endDate: 'asc' }, { createdAt: 'desc' }]
  });
}

export async function createMaintenanceContract(
  tenantId: string,
  data: {
    syndicateId: string;
    providerId: string;
    nature: string;
    startDate: Date;
    endDate?: Date | null;
    annualAmount?: number;
    currency: string;
    renewalAlertDays: number;
  }
) {
  const [syndicate, provider] = await Promise.all([
    prisma.syndicate.findFirst({
      where: {
        id: data.syndicateId,
        tenantId
      },
      select: { id: true }
    }),
    prisma.serviceProvider.findFirst({
      where: {
        id: data.providerId,
        tenantId
      },
      select: { id: true }
    })
  ]);

  if (!syndicate) {
    throw notFound('Copropriete introuvable ou inaccessible');
  }

  if (!provider) {
    throw notFound('Prestataire introuvable ou inaccessible');
  }

  return prisma.maintenanceContract.create({
    data
  });
}

export async function getMaintenanceContractByTenant(tenantId: string, syndicateId: string, contractId: string) {
  return prisma.maintenanceContract.findFirst({
    where: {
      id: contractId,
      syndicateId,
      syndicate: {
        tenantId
      }
    },
    include: {
      provider: true,
      syndicate: true
    }
  });
}

export async function updateMaintenanceContractByTenant(
  tenantId: string,
  syndicateId: string,
  contractId: string,
  data: {
    providerId?: string;
    nature?: string;
    startDate?: Date;
    endDate?: Date | null;
    annualAmount?: number | null;
    currency?: string;
    renewalAlertDays?: number;
    status?: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  }
) {
  const existing = await prisma.maintenanceContract.findFirst({
    where: {
      id: contractId,
      syndicateId,
      syndicate: {
        tenantId
      }
    },
    select: { id: true }
  });

  if (!existing) {
    throw notFound('Contrat introuvable ou inaccessible');
  }

  return prisma.maintenanceContract.update({
    where: { id: contractId },
    data
  });
}

export async function deleteMaintenanceContractByTenant(tenantId: string, syndicateId: string, contractId: string) {
  const existing = await prisma.maintenanceContract.findFirst({
    where: {
      id: contractId,
      syndicateId,
      syndicate: {
        tenantId
      }
    },
    select: { id: true }
  });

  if (!existing) {
    throw notFound('Contrat introuvable ou inaccessible');
  }

  return prisma.maintenanceContract.delete({
    where: { id: contractId }
  });
}

export async function listDocumentsBySyndicate(
  tenantId: string,
  syndicateId: string,
  filters?: { type?: (typeof SYNDICATE_DOCUMENT_TYPES)[number] }
) {
  const syndicate = await prisma.syndicate.findFirst({
    where: {
      id: syndicateId,
      tenantId
    },
    select: {
      id: true
    }
  });

  if (!syndicate?.id) {
    return [];
  }

  return prisma.syndicateDocument.findMany({
    where: {
      syndicateId: syndicate.id,
      type: filters?.type ? filters.type : { in: [...SYNDICATE_DOCUMENT_TYPES] }
    },
    orderBy: [{ expiresAt: 'asc' }, { createdAt: 'desc' }]
  });
}

export async function createDocumentForSyndicate(
  tenantId: string,
  data: {
    syndicateId: string;
    title: string;
    type: 'REGULATION' | 'GENERAL_MEETING_MINUTES' | 'DIAGNOSTIC' | 'INSURANCE' | 'BUDGET' | 'OTHER';
    fileUrl: string;
    expiresAt?: Date;
  }
) {
  const syndicate = await prisma.syndicate.findFirst({
    where: {
      id: data.syndicateId,
      tenantId
    },
    select: { id: true }
  });

  if (!syndicate) {
    throw notFound('Copropriete introuvable ou inaccessible');
  }

  return prisma.syndicateDocument.create({
    data: {
      syndicateId: data.syndicateId,
      title: data.title,
      type: data.type,
      fileUrl: data.fileUrl,
      expiresAt: data.expiresAt
    }
  });
}

export async function listFundsBySyndicate(tenantId: string, syndicateId: string) {
  return prisma.syndicateFund.findMany({
    where: {
      syndicateId,
      syndicate: {
        tenantId
      }
    },
    orderBy: { name: 'asc' }
  });
}

export async function listCommonAssetsBySyndicate(tenantId: string, syndicateId: string) {
  return prisma.commonAreaAsset.findMany({
    where: {
      syndicateId,
      syndicate: {
        tenantId
      }
    },
    orderBy: [{ nextMaintenanceDate: 'asc' }, { createdAt: 'desc' }]
  });
}

export async function getFinanceSummaryBySyndicate(tenantId: string, syndicateId: string) {
  const [funds, charges] = await Promise.all([
    listFundsBySyndicate(tenantId, syndicateId),
    prisma.chargeCall.findMany({
      where: {
        syndicateId,
        syndicate: {
          tenantId
        }
      },
      include: {
        payments: true
      }
    })
  ]);

  const overdueCharges = charges.filter(charge => charge.status === 'OVERDUE');
  const totalCalled = roundMoney(charges.reduce((sum: number, charge) => sum + Number(charge.amount), 0));
  const totalPaid = roundMoney(
    charges.reduce(
      (sum: number, charge) =>
        sum + charge.payments.reduce((innerSum: number, payment) => innerSum + Number(payment.amount), 0),
      0
    )
  );

  return {
    funds,
    totals: {
      totalFundsBalance: roundMoney(funds.reduce((sum: number, fund) => sum + Number(fund.balance), 0)),
      totalCalled,
      totalPaid,
      totalOutstanding: computeOutstanding(totalCalled, totalPaid),
      overdueCount: overdueCharges.length,
      overdueAmount: roundMoney(
        overdueCharges.reduce((sum: number, charge) => {
          const paid = charge.payments.reduce((innerSum: number, payment) => innerSum + Number(payment.amount), 0);
          return sum + computeOutstanding(Number(charge.amount), paid);
        }, 0)
      )
    }
  };
}

export async function listOverdueDashboardBySyndicate(tenantId: string, syndicateId: string) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  const now = new Date();
  const calls = await prisma.chargeCall.findMany({
    where: {
      syndicateId,
      syndicate: { tenantId },
      dueDate: { lt: now },
      status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] }
    },
    include: {
      lot: {
        include: {
          owner: true,
          property: {
            select: {
              id: true,
              title: true,
              address: true,
              internalReference: true
            }
          }
        }
      },
      payments: true
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }]
  });

  const items = calls.map(call => {
    const paid = roundMoney(call.payments.reduce((sum, p) => sum + Number(p.amount), 0));
    const amount = Number(call.amount);
    const outstanding = computeOutstanding(amount, paid);
    const lateMs = now.getTime() - call.dueDate.getTime();
    const daysLate = Math.max(0, Math.floor(lateMs / (24 * 60 * 60 * 1000)));

    return {
      chargeCallId: call.id,
      lotId: call.lotId,
      lotNumber: call.lot.lotNumber,
      property: call.lot.property
        ? {
            id: call.lot.property.id,
            title: call.lot.property.title,
            address: call.lot.property.address,
            internalReference: call.lot.property.internalReference
          }
        : null,
      owner: call.lot.owner
        ? {
            id: call.lot.owner.id,
            firstName: call.lot.owner.firstName,
            lastName: call.lot.owner.lastName,
            email: call.lot.owner.email
          }
        : null,
      dueDate: call.dueDate,
      status: call.status,
      amount,
      paid,
      outstanding,
      daysLate
    };
  });

  const totals = items.reduce(
    (acc, item) => {
      acc.count += 1;
      acc.outstanding += item.outstanding;
      return acc;
    },
    { count: 0, outstanding: 0 }
  );

  return {
    items,
    totals: {
      overdueCount: totals.count,
      overdueAmount: roundMoney(totals.outstanding)
    }
  };
}

export async function listPaymentRemindersBySyndicate(
  tenantId: string,
  syndicateId: string,
  pagination?: PaginationInput
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const pager = buildPagination(pagination);

  return prisma.paymentReminder.findMany({
    where: {
      chargeCall: {
        syndicateId,
        syndicate: { tenantId }
      }
    },
    include: {
      chargeCall: true,
      lot: {
        include: { owner: true }
      }
    },
    skip: pager.skip,
    take: pager.take,
    orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }]
  });
}

export async function createManualReminderForChargeCall(
  tenantId: string,
  syndicateId: string,
  chargeCallId: string,
  data: {
    reminderLevel?: number;
    channel?: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';
    sentAt?: Date;
    status?: 'SENT' | 'DELIVERED' | 'FAILED';
    responseAction?: string;
  }
) {
  const call = await prisma.chargeCall.findFirst({
    where: {
      id: chargeCallId,
      syndicateId,
      syndicate: { tenantId }
    },
    include: { payments: true }
  });

  if (!call) {
    throw notFound('Appel de charges introuvable ou inaccessible');
  }

  const paid = roundMoney(call.payments.reduce((sum, p) => sum + Number(p.amount), 0));
  const outstanding = computeOutstanding(Number(call.amount), paid);
  if (outstanding <= 0) {
    throw unprocessableEntity('Aucune relance possible: appel deja solde');
  }

  return prisma.paymentReminder.create({
    data: {
      chargeCallId,
      lotId: call.lotId,
      reminderLevel: data.reminderLevel ?? 1,
      channel: data.channel ?? 'EMAIL',
      sentAt: data.sentAt ?? new Date(),
      status: data.status ?? 'SENT',
      responseAction: data.responseAction
    }
  });
}

export async function runReminderBatchForSyndicate(tenantId: string, syndicateId: string) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  const now = new Date();
  const dueCalls = await prisma.chargeCall.findMany({
    where: {
      syndicateId,
      syndicate: { tenantId },
      dueDate: { lt: now },
      status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] }
    },
    include: {
      payments: true
    }
  });

  return prisma.$transaction(async tx => {
    let created = 0;
    const createdReminderIds: string[] = [];

    for (const call of dueCalls) {
      const paid = roundMoney(call.payments.reduce((sum, p) => sum + Number(p.amount), 0));
      const outstanding = computeOutstanding(Number(call.amount), paid);
      if (outstanding <= 0) {
        continue;
      }

      const existingCount = await tx.paymentReminder.count({
        where: { chargeCallId: call.id }
      });

      const reminder = await tx.paymentReminder.create({
        data: {
          chargeCallId: call.id,
          lotId: call.lotId,
          reminderLevel: Math.min(existingCount + 1, 4),
          channel: 'EMAIL',
          sentAt: now,
          status: 'SENT'
        }
      });

      created += 1;
      createdReminderIds.push(reminder.id);
    }

    return {
      processedCalls: dueCalls.length,
      remindersCreated: created,
      createdReminderIds
    };
  });
}

export async function listLatePaymentPenaltiesBySyndicate(
  tenantId: string,
  syndicateId: string,
  pagination?: PaginationInput
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const pager = buildPagination(pagination);

  return prisma.latePaymentPenalty.findMany({
    where: {
      chargeCall: {
        syndicateId,
        syndicate: { tenantId }
      }
    },
    include: {
      chargeCall: true,
      lot: {
        include: {
          owner: true,
          property: {
            select: {
              id: true,
              title: true,
              address: true,
              internalReference: true
            }
          }
        }
      }
    },
    skip: pager.skip,
    take: pager.take,
    orderBy: [{ appliedAt: 'desc' }, { createdAt: 'desc' }]
  });
}

export async function createLatePaymentPenaltyForChargeCall(
  tenantId: string,
  syndicateId: string,
  chargeCallId: string,
  data: {
    daysLate?: number;
    penaltyRate: number;
    penaltyAmount?: number;
    appliedAt?: Date;
    waived?: boolean;
    waivedReason?: string;
  }
) {
  const call = await prisma.chargeCall.findFirst({
    where: {
      id: chargeCallId,
      syndicateId,
      syndicate: { tenantId }
    },
    include: { payments: true }
  });

  if (!call) {
    throw notFound('Appel de charges introuvable ou inaccessible');
  }

  const paid = roundMoney(call.payments.reduce((sum, p) => sum + Number(p.amount), 0));
  const outstanding = computeOutstanding(Number(call.amount), paid);
  if (outstanding <= 0) {
    throw unprocessableEntity('Aucune penalite possible: appel deja solde');
  }

  const appliedAt = data.appliedAt ?? new Date();
  const dueDate = call.dueDate;
  const computedDaysLate = Math.max(0, Math.floor((appliedAt.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)));
  const daysLate = data.daysLate ?? computedDaysLate;

  const computedPenalty = roundMoney((outstanding * data.penaltyRate * Math.max(daysLate, 1)) / 3000);
  const penaltyAmount = roundMoney(data.penaltyAmount ?? computedPenalty);

  return prisma.$transaction(async tx => {
    const penalty = await tx.latePaymentPenalty.create({
      data: {
        chargeCallId: call.id,
        lotId: call.lotId,
        daysLate,
        penaltyRate: data.penaltyRate,
        penaltyAmount,
        appliedAt,
        waived: data.waived ?? false,
        waivedReason: data.waivedReason
      }
    });

    const account = await ensureOwnerAccountForLotTx(tx, tenantId, syndicateId, call.lotId);
    if (account) {
      await appendOwnerAccountTransactionTx(tx, {
        accountId: account.id,
        type: 'PENALTY',
        debit: penaltyAmount,
        label: 'Penalite de retard',
        sourceId: penalty.id,
        transactionDate: appliedAt
      });
    }

    return penalty;
  });
}

export async function waiveLatePaymentPenaltyByTenant(
  tenantId: string,
  syndicateId: string,
  penaltyId: string,
  waivedReason: string
) {
  const penalty = await prisma.latePaymentPenalty.findFirst({
    where: {
      id: penaltyId,
      chargeCall: {
        syndicateId,
        syndicate: { tenantId }
      }
    },
    select: {
      id: true,
      penaltyAmount: true,
      lotId: true
    }
  });

  if (!penalty) {
    throw notFound('Penalite introuvable ou inaccessible');
  }

  return prisma.$transaction(async tx => {
    const updated = await tx.latePaymentPenalty.update({
      where: { id: penaltyId },
      data: {
        waived: true,
        waivedAt: new Date(),
        waivedReason
      }
    });

    const account = await ensureOwnerAccountForLotTx(tx, tenantId, syndicateId, penalty.lotId);
    if (account) {
      await appendOwnerAccountTransactionTx(tx, {
        accountId: account.id,
        type: 'WAIVER',
        credit: Number(penalty.penaltyAmount),
        label: 'Remise de penalite',
        sourceId: penalty.id,
        transactionDate: new Date()
      });
    }

    return updated;
  });
}

export async function createPaymentScheduleForChargeCall(
  tenantId: string,
  syndicateId: string,
  chargeCallId: string,
  data: {
    agreedAt?: Date;
    totalAmount: number;
    instalments: Array<{ dueDate: Date; amount: number }>;
  }
) {
  const call = await prisma.chargeCall.findFirst({
    where: {
      id: chargeCallId,
      syndicateId,
      syndicate: { tenantId }
    },
    include: { payments: true }
  });

  if (!call) {
    throw notFound('Appel de charges introuvable ou inaccessible');
  }

  const paid = roundMoney(call.payments.reduce((sum, p) => sum + Number(p.amount), 0));
  const outstanding = computeOutstanding(Number(call.amount), paid);
  if (outstanding <= 0) {
    throw unprocessableEntity('Aucun echeancier possible: appel deja solde');
  }

  const instalmentsTotal = roundMoney(data.instalments.reduce((sum, i) => sum + i.amount, 0));
  if (roundMoney(data.totalAmount) !== instalmentsTotal) {
    throw unprocessableEntity("Le total de l'echeancier doit correspondre a la somme des echeances");
  }

  return prisma.$transaction(async tx => {
    const schedule = await tx.paymentSchedule.create({
      data: {
        chargeCallId: call.id,
        lotId: call.lotId,
        agreedAt: data.agreedAt ?? new Date(),
        totalAmount: data.totalAmount,
        status: 'ACTIVE'
      }
    });

    await tx.paymentScheduleInstalment.createMany({
      data: data.instalments.map(instalment => ({
        scheduleId: schedule.id,
        dueDate: instalment.dueDate,
        amount: instalment.amount,
        status: 'PENDING'
      }))
    });

    return tx.paymentSchedule.findUnique({
      where: { id: schedule.id },
      include: { instalments: true }
    });
  });
}

export async function listPaymentSchedulesBySyndicate(
  tenantId: string,
  syndicateId: string,
  pagination?: PaginationInput
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const pager = buildPagination(pagination);

  return prisma.paymentSchedule.findMany({
    where: {
      chargeCall: {
        syndicateId,
        syndicate: { tenantId }
      }
    },
    include: {
      chargeCall: true,
      lot: {
        include: {
          owner: true,
          property: {
            select: {
              id: true,
              title: true,
              address: true,
              internalReference: true
            }
          }
        }
      },
      instalments: {
        orderBy: [{ dueDate: 'asc' }]
      }
    },
    skip: pager.skip,
    take: pager.take,
    orderBy: [{ createdAt: 'desc' }]
  });
}

async function getOrCreateOwnerAccountForLot(tenantId: string, syndicateId: string, lotId: string) {
  return prisma.$transaction(async tx => {
    return ensureOwnerAccountForLotTx(tx, tenantId, syndicateId, lotId);
  });
}

export async function getOwnerAccountByLot(tenantId: string, syndicateId: string, lotId: string) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  await getOrCreateOwnerAccountForLot(tenantId, syndicateId, lotId);

  const account = await prisma.ownerAccount.findFirst({
    where: {
      lotId,
      syndicateId,
      syndicate: { tenantId }
    },
    include: {
      syndicate: true,
      lot: {
        include: { owner: true }
      },
      contact: true
    }
  });

  if (!account) {
    throw notFound('Compte lot introuvable ou lot sans proprietaire');
  }

  return account;
}

export async function listOwnerAccountTransactionsByLot(
  tenantId: string,
  syndicateId: string,
  lotId: string,
  filters?: { range?: DateRangeInput; pagination?: PaginationInput }
) {
  const account = await getOwnerAccountByLot(tenantId, syndicateId, lotId);
  const pager = buildPagination(filters?.pagination);

  return prisma.ownerAccountTransaction.findMany({
    where: {
      accountId: account.id,
      ...buildDateRangeFilter('transactionDate', filters?.range)
    },
    skip: pager.skip,
    take: pager.take,
    orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }]
  });
}

export async function createOwnerAccountAdjustmentByLot(
  tenantId: string,
  syndicateId: string,
  lotId: string,
  data: {
    direction: 'DEBIT' | 'CREDIT';
    amount: number;
    label: string;
    reference?: string | null;
    transactionDate?: Date;
  }
) {
  const account = await getOwnerAccountByLot(tenantId, syndicateId, lotId);

  return prisma.$transaction(async tx => {
    const transaction = await appendOwnerAccountTransactionTx(tx, {
      accountId: account.id,
      type: 'ADJUSTMENT',
      debit: data.direction === 'DEBIT' ? data.amount : 0,
      credit: data.direction === 'CREDIT' ? data.amount : 0,
      label: data.label,
      reference: data.reference ?? undefined,
      transactionDate: data.transactionDate ?? new Date()
    });

    if (!transaction) {
      throw unprocessableEntity('Impossible de creer la transaction de compte lot');
    }

    return transaction;
  });
}

export async function getOwnerAccountStatementByLot(
  tenantId: string,
  syndicateId: string,
  lotId: string,
  range?: DateRangeInput
) {
  const account = await getOwnerAccountByLot(tenantId, syndicateId, lotId);

  const transactions = await prisma.ownerAccountTransaction.findMany({
    where: {
      accountId: account.id,
      ...buildDateRangeFilter('transactionDate', range)
    },
    orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }]
  });

  const openingBalance =
    transactions.length > 0
      ? roundMoney(
          Number(transactions[0].balanceAfter) -
            Number(transactions[0].debit ?? 0) +
            Number(transactions[0].credit ?? 0)
        )
      : roundMoney(Number(account.balance));

  const closingBalance =
    transactions.length > 0
      ? roundMoney(Number(transactions[transactions.length - 1].balanceAfter))
      : roundMoney(Number(account.balance));

  return {
    account,
    transactions,
    summary: {
      openingBalance,
      closingBalance
    }
  };
}

export async function listChartOfAccountsBySyndicate(tenantId: string, syndicateId: string, onlyActive = true) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  return prisma.chartOfAccount.findMany({
    where: {
      syndicateId,
      ...(onlyActive ? { isActive: true } : {})
    },
    include: {
      parent: true
    },
    orderBy: [{ accountNumber: 'asc' }, { createdAt: 'asc' }]
  });
}

export async function createChartOfAccountBySyndicate(
  tenantId: string,
  syndicateId: string,
  data: {
    accountNumber: string;
    accountName: string;
    accountClass: number;
    accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
    isAuxiliary?: boolean;
    parentAccountId?: string | null;
  }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  if (data.parentAccountId) {
    const parent = await prisma.chartOfAccount.findFirst({
      where: { id: data.parentAccountId, syndicateId },
      select: { id: true }
    });
    if (!parent) {
      throw notFound('Compte parent introuvable pour cette copropriete');
    }
  }

  return prisma.chartOfAccount.create({
    data: {
      syndicateId,
      accountNumber: data.accountNumber,
      accountName: data.accountName,
      accountClass: data.accountClass,
      accountType: data.accountType as any,
      isAuxiliary: data.isAuxiliary ?? false,
      parentAccountId: data.parentAccountId ?? undefined
    }
  });
}

export async function listAccountingJournalsBySyndicate(tenantId: string, syndicateId: string, fiscalYear?: number) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  return prisma.accountingJournal.findMany({
    where: {
      syndicateId,
      ...(fiscalYear ? { fiscalYear } : {})
    },
    orderBy: [{ fiscalYear: 'desc' }, { code: 'asc' }]
  });
}

export async function createAccountingJournalBySyndicate(
  tenantId: string,
  syndicateId: string,
  data: {
    journalType: 'GENERAL' | 'BANK' | 'CASH' | 'CHARGES';
    label: string;
    code: string;
    fiscalYear: number;
  }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  return prisma.accountingJournal.create({
    data: {
      syndicateId,
      journalType: data.journalType as any,
      label: data.label,
      code: data.code,
      fiscalYear: data.fiscalYear
    }
  });
}

export async function listJournalEntriesBySyndicate(
  tenantId: string,
  syndicateId: string,
  filters?: {
    journalId?: string;
    range?: DateRangeInput;
    pagination?: PaginationInput;
  }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const pager = buildPagination(filters?.pagination);

  return prisma.journalEntry.findMany({
    where: {
      journal: {
        syndicateId
      },
      ...(filters?.journalId ? { journalId: filters.journalId } : {}),
      ...buildDateRangeFilter('entryDate', filters?.range)
    },
    include: {
      journal: true,
      lines: {
        include: {
          account: true,
          lot: true
        },
        orderBy: [{ createdAt: 'asc' }]
      }
    },
    skip: pager.skip,
    take: pager.take,
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }]
  });
}

export async function createJournalEntryBySyndicate(
  tenantId: string,
  syndicateId: string,
  data: {
    journalId: string;
    entryDate: Date;
    reference: string;
    description: string;
    sourceType: 'CHARGE_PAYMENT' | 'MANUAL' | 'PENALTY' | 'FUND';
    sourceId?: string;
    lines: Array<{
      accountId: string;
      lotId?: string;
      debit?: number;
      credit?: number;
      label: string;
    }>;
  }
) {
  logger.info('Audit: create journal entry requested', {
    tenantId,
    syndicateId,
    journalId: data.journalId,
    reference: data.reference,
    sourceType: data.sourceType,
    linesCount: data.lines.length
  });
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  if (!isJournalEntryBalanced(data.lines)) {
    throw unprocessableEntity('Ecriture non equilibree: total debit doit etre egal au total credit');
  }

  const journal = await prisma.accountingJournal.findFirst({
    where: {
      id: data.journalId,
      syndicateId
    },
    select: { id: true, fiscalYear: true }
  });

  if (!journal) {
    throw notFound('Journal comptable introuvable pour cette copropriete');
  }

  const accountIds = Array.from(new Set(data.lines.map(line => line.accountId)));
  const accountsCount = await prisma.chartOfAccount.count({
    where: {
      syndicateId,
      id: { in: accountIds }
    }
  });

  if (accountsCount !== accountIds.length) {
    throw unprocessableEntity('Au moins un compte comptable est invalide pour cette copropriete');
  }

  return prisma.$transaction(async tx => {
    const entry = await tx.journalEntry.create({
      data: {
        journalId: data.journalId,
        entryDate: data.entryDate,
        reference: data.reference,
        description: data.description,
        sourceType: data.sourceType as any,
        sourceId: data.sourceId ?? undefined
      }
    });

    await tx.journalEntryLine.createMany({
      data: data.lines.map(line => ({
        entryId: entry.id,
        accountId: line.accountId,
        lotId: line.lotId ?? undefined,
        debit: roundMoney(Number(line.debit ?? 0)),
        credit: roundMoney(Number(line.credit ?? 0)),
        label: line.label
      }))
    });

    logger.info('Audit: journal entry created', {
      tenantId,
      syndicateId,
      journalId: data.journalId,
      entryId: entry.id,
      reference: data.reference
    });

    return tx.journalEntry.findUnique({
      where: { id: entry.id },
      include: {
        journal: true,
        lines: {
          include: {
            account: true,
            lot: true
          }
        }
      }
    });
  });
}

export async function lockJournalEntryBySyndicate(tenantId: string, syndicateId: string, entryId: string) {
  logger.info('Audit: lock journal entry requested', { tenantId, syndicateId, entryId });
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  const entry = await prisma.journalEntry.findFirst({
    where: {
      id: entryId,
      journal: { syndicateId }
    },
    select: { id: true, isLocked: true }
  });

  if (!entry) {
    throw notFound('Ecriture comptable introuvable');
  }

  if (entry.isLocked) {
    return prisma.journalEntry.findUnique({ where: { id: entryId } });
  }

  return prisma.journalEntry.update({
    where: { id: entryId },
    data: { isLocked: true }
  });
}

export async function getTrialBalanceBySyndicate(tenantId: string, syndicateId: string, range?: DateRangeInput) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  const lines = await prisma.journalEntryLine.findMany({
    where: {
      entry: {
        journal: { syndicateId },
        ...buildDateRangeFilter('entryDate', range)
      }
    },
    include: {
      account: true
    }
  });

  const byAccount = new Map<
    string,
    {
      accountId: string;
      accountNumber: string;
      accountName: string;
      totalDebit: number;
      totalCredit: number;
      balance: number;
    }
  >();

  for (const line of lines) {
    const key = line.accountId;
    const current = byAccount.get(key) ?? {
      accountId: key,
      accountNumber: line.account.accountNumber,
      accountName: line.account.accountName,
      totalDebit: 0,
      totalCredit: 0,
      balance: 0
    };
    current.totalDebit = roundMoney(current.totalDebit + Number(line.debit ?? 0));
    current.totalCredit = roundMoney(current.totalCredit + Number(line.credit ?? 0));
    current.balance = roundMoney(current.totalDebit - current.totalCredit);
    byAccount.set(key, current);
  }

  const items = Array.from(byAccount.values()).sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
  const totals = items.reduce(
    (acc, item) => {
      acc.totalDebit = roundMoney(acc.totalDebit + item.totalDebit);
      acc.totalCredit = roundMoney(acc.totalCredit + item.totalCredit);
      return acc;
    },
    { totalDebit: 0, totalCredit: 0 }
  );

  return {
    items,
    totals: {
      ...totals,
      isBalanced: roundMoney(totals.totalDebit) === roundMoney(totals.totalCredit)
    }
  };
}

export async function getGeneralLedgerBySyndicate(
  tenantId: string,
  syndicateId: string,
  filters?: {
    accountId?: string;
    range?: DateRangeInput;
    pagination?: PaginationInput;
  }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const pager = buildPagination(filters?.pagination);

  return prisma.journalEntryLine.findMany({
    where: {
      account: {
        syndicateId
      },
      ...(filters?.accountId ? { accountId: filters.accountId } : {}),
      entry: {
        journal: { syndicateId },
        ...buildDateRangeFilter('entryDate', filters?.range)
      }
    },
    include: {
      account: true,
      entry: {
        include: {
          journal: true
        }
      },
      lot: true
    },
    skip: pager.skip,
    take: pager.take,
    orderBy: [{ entry: { entryDate: 'asc' } }, { createdAt: 'asc' }]
  });
}

type BudgetLineDistributionInput = {
  id: string;
  category: string;
  amountForecast: number;
  distributionKey: 'GENERAL_SHARES' | 'SPECIAL_SHARES' | 'EQUAL' | 'MANUAL';
};

type LotDistributionInput = {
  id: string;
  lotNumber: string;
  generalShares: number;
  specialShares: number | null;
};

function distributeLineAmount(
  amount: number,
  lots: LotDistributionInput[],
  key: BudgetLineDistributionInput['distributionKey']
) {
  if (lots.length === 0) return [];
  if (lots.length === 1) {
    return [{ lotId: lots[0].id, allocated: roundMoney(amount) }];
  }

  let weights = lots.map(() => 1);
  if (key === 'GENERAL_SHARES') {
    const totalGeneral = lots.reduce((acc, lot) => acc + Number(lot.generalShares || 0), 0);
    if (totalGeneral > 0) {
      weights = lots.map(lot => Number(lot.generalShares || 0));
    }
  } else if (key === 'SPECIAL_SHARES') {
    const totalSpecial = lots.reduce((acc, lot) => acc + Number(lot.specialShares || 0), 0);
    if (totalSpecial > 0) {
      weights = lots.map(lot => Number(lot.specialShares || 0));
    }
  }

  const totalWeight = weights.reduce((acc, value) => acc + value, 0) || lots.length;
  const out = lots.map((lot, index) => {
    if (index === lots.length - 1) {
      return { lotId: lot.id, allocated: 0 };
    }
    const allocated = roundMoney((amount * weights[index]) / totalWeight);
    return { lotId: lot.id, allocated };
  });

  const partial = out.reduce((acc, item) => acc + item.allocated, 0);
  out[out.length - 1].allocated = roundMoney(amount - partial);
  return out;
}

export async function listBudgetsBySyndicate(
  tenantId: string,
  syndicateId: string,
  filters?: { fiscalYear?: number; status?: 'DRAFT' | 'APPROVED' | 'REVISED' | 'CLOSED' }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  return prisma.syndicateBudget.findMany({
    where: {
      syndicateId,
      ...(filters?.fiscalYear ? { fiscalYear: filters.fiscalYear } : {}),
      ...(filters?.status ? { status: filters.status as any } : {})
    },
    include: {
      lines: true,
      allocations: true
    },
    orderBy: [{ fiscalYear: 'desc' }, { createdAt: 'desc' }]
  });
}

export async function createBudgetBySyndicate(
  tenantId: string,
  syndicateId: string,
  data: {
    fiscalYear: number;
    label: string;
    totalAmount: number;
    currency?: string;
    lines: Array<{
      category: string;
      description: string;
      amountForecast: number;
      distributionKey: 'GENERAL_SHARES' | 'SPECIAL_SHARES' | 'EQUAL' | 'MANUAL';
      accountId?: string;
    }>;
  }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  if (data.lines.some(line => line.accountId)) {
    const accountIds = Array.from(new Set(data.lines.map(line => line.accountId).filter(Boolean) as string[]));
    const count = await prisma.chartOfAccount.count({
      where: {
        syndicateId,
        id: { in: accountIds }
      }
    });
    if (count !== accountIds.length) {
      throw unprocessableEntity('Au moins un compte comptable de ligne budgetaire est invalide');
    }
  }

  const budget = await prisma.syndicateBudget.create({
    data: {
      syndicateId,
      fiscalYear: data.fiscalYear,
      label: data.label,
      totalAmount: roundMoney(data.totalAmount),
      currency: data.currency || 'XOF',
      lines: {
        create: data.lines.map(line => ({
          category: line.category,
          description: line.description,
          amountForecast: roundMoney(line.amountForecast),
          distributionKey: line.distributionKey as any,
          accountId: line.accountId ?? undefined
        }))
      }
    }
  });

  await recomputeBudgetAllocationsByBudget(tenantId, syndicateId, budget.id);

  return prisma.syndicateBudget.findUnique({
    where: { id: budget.id },
    include: {
      lines: true,
      allocations: {
        include: {
          lot: true
        }
      }
    }
  });
}

export async function updateBudgetBySyndicate(
  tenantId: string,
  syndicateId: string,
  budgetId: string,
  data: {
    label?: string;
    status?: 'DRAFT' | 'APPROVED' | 'REVISED' | 'CLOSED';
    approvedByResolutionId?: string | null;
    totalAmount?: number;
  }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  const budget = await prisma.syndicateBudget.findFirst({
    where: { id: budgetId, syndicateId },
    select: { id: true }
  });

  if (!budget) {
    throw notFound('Budget introuvable pour cette copropriete');
  }

  return prisma.syndicateBudget.update({
    where: { id: budgetId },
    data: {
      label: data.label,
      status: data.status as any,
      approvedByResolutionId: data.approvedByResolutionId,
      approvedAt: data.status === 'APPROVED' ? new Date() : undefined,
      totalAmount: data.totalAmount !== undefined ? roundMoney(data.totalAmount) : undefined
    },
    include: {
      lines: true,
      allocations: true
    }
  });
}

export async function recomputeBudgetAllocationsByBudget(tenantId: string, syndicateId: string, budgetId: string) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  const budget = await prisma.syndicateBudget.findFirst({
    where: {
      id: budgetId,
      syndicateId
    },
    include: {
      lines: {
        select: {
          id: true,
          category: true,
          amountForecast: true,
          distributionKey: true
        }
      }
    }
  });

  if (!budget) {
    throw notFound('Budget introuvable pour cette copropriete');
  }

  const lots = await prisma.syndicateLot.findMany({
    where: { syndicateId },
    select: {
      id: true,
      lotNumber: true,
      generalShares: true,
      specialShares: true
    },
    orderBy: { lotNumber: 'asc' }
  });

  if (lots.length === 0) {
    throw unprocessableEntity('Aucun lot disponible pour calculer les allocations budgetaires');
  }

  const allocationsByLot = new Map<
    string,
    {
      totalAllocated: number;
      breakdown: Array<{ lineId: string; category: string; distributionKey: string; allocated: number }>;
    }
  >();

  for (const lot of lots) {
    allocationsByLot.set(lot.id, {
      totalAllocated: 0,
      breakdown: []
    });
  }

  for (const line of budget.lines as unknown as BudgetLineDistributionInput[]) {
    const distributed = distributeLineAmount(
      Number(line.amountForecast),
      lots as LotDistributionInput[],
      line.distributionKey
    );
    for (const lineAllocation of distributed) {
      const lotAllocation = allocationsByLot.get(lineAllocation.lotId);
      if (!lotAllocation) continue;
      lotAllocation.totalAllocated = roundMoney(lotAllocation.totalAllocated + lineAllocation.allocated);
      lotAllocation.breakdown.push({
        lineId: line.id,
        category: line.category,
        distributionKey: line.distributionKey,
        allocated: lineAllocation.allocated
      });
    }
  }

  await prisma.$transaction(async tx => {
    await tx.budgetAllocation.deleteMany({ where: { budgetId } });
    await tx.budgetAllocation.createMany({
      data: Array.from(allocationsByLot.entries()).map(([lotId, value]) => ({
        budgetId,
        lotId,
        totalAllocated: roundMoney(value.totalAllocated),
        breakdown: value.breakdown as any
      }))
    });
  });

  return prisma.budgetAllocation.findMany({
    where: { budgetId },
    include: { lot: true },
    orderBy: [{ lot: { lotNumber: 'asc' } }]
  });
}

export async function listChargeCallBatchesBySyndicate(
  tenantId: string,
  syndicateId: string,
  filters?: { status?: 'DRAFT' | 'SENT' | 'CLOSED'; period?: string }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  return prisma.chargeCallBatch.findMany({
    where: {
      syndicateId,
      ...(filters?.status ? { status: filters.status as any } : {}),
      ...(filters?.period ? { period: filters.period } : {})
    },
    include: {
      budget: true,
      chargeCalls: true
    },
    orderBy: [{ createdAt: 'desc' }]
  });
}

export async function createChargeCallBatchBySyndicate(
  tenantId: string,
  syndicateId: string,
  data: {
    label: string;
    period: string;
    dueDate: Date;
    batchType: 'REGULAR' | 'EXCEPTIONAL';
    budgetId?: string;
    totalAmount: number;
    currency?: string;
  }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  if (data.budgetId) {
    const budget = await prisma.syndicateBudget.findFirst({
      where: {
        id: data.budgetId,
        syndicateId
      },
      select: { id: true }
    });
    if (!budget) {
      throw notFound('Budget introuvable pour le batch');
    }
  }

  return prisma.chargeCallBatch.create({
    data: {
      syndicateId,
      label: data.label,
      period: data.period,
      dueDate: data.dueDate,
      batchType: data.batchType as any,
      budgetId: data.budgetId ?? undefined,
      totalAmount: roundMoney(data.totalAmount),
      currency: data.currency || 'XOF',
      status: 'SENT'
    },
    include: {
      budget: true
    }
  });
}

export async function generateChargeCallsFromBudget(
  tenantId: string,
  syndicateId: string,
  budgetId: string,
  data: {
    label: string;
    period: string;
    dueDate: Date;
    batchType: 'REGULAR' | 'EXCEPTIONAL';
    currency?: string;
  }
) {
  logger.info('Audit: generate charge calls from budget requested', {
    tenantId,
    syndicateId,
    budgetId,
    period: data.period,
    batchType: data.batchType
  });
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  const budget = await prisma.syndicateBudget.findFirst({
    where: {
      id: budgetId,
      syndicateId
    },
    include: {
      allocations: true
    }
  });

  if (!budget) {
    throw notFound('Budget introuvable pour cette copropriete');
  }

  if (budget.status !== 'APPROVED') {
    throw unprocessableEntity('Le budget doit etre approuve avant generation des appels');
  }

  const allocations = budget.allocations.length
    ? budget.allocations
    : await recomputeBudgetAllocationsByBudget(tenantId, syndicateId, budgetId);

  if (allocations.length === 0) {
    throw unprocessableEntity('Aucune allocation disponible pour generer les appels');
  }

  return prisma.$transaction(async tx => {
    const batch = await tx.chargeCallBatch.create({
      data: {
        syndicateId,
        label: data.label,
        period: data.period,
        dueDate: data.dueDate,
        batchType: data.batchType as any,
        budgetId,
        totalAmount: roundMoney(Number(budget.totalAmount)),
        currency: data.currency || budget.currency || 'XOF',
        status: 'SENT'
      }
    });

    await tx.chargeCall.createMany({
      data: allocations.map(allocation => ({
        syndicateId,
        lotId: allocation.lotId,
        batchId: batch.id,
        period: data.period,
        amount: roundMoney(Number(allocation.totalAllocated)),
        currency: data.currency || budget.currency || 'XOF',
        dueDate: data.dueDate,
        status: 'PENDING'
      }))
    });

    logger.info('Audit: charge calls batch generated from budget', {
      tenantId,
      syndicateId,
      budgetId,
      batchId: batch.id,
      generatedCalls: allocations.length
    });

    return tx.chargeCallBatch.findUnique({
      where: { id: batch.id },
      include: {
        budget: true,
        chargeCalls: true
      }
    });
  });
}

async function assertLotOwnershipForSyndicate(tenantId: string, syndicateId: string, lotId: string) {
  const lot = await prisma.syndicateLot.findFirst({
    where: {
      id: lotId,
      syndicateId,
      syndicate: { tenantId }
    },
    select: { id: true }
  });
  if (!lot) {
    throw notFound('Lot introuvable pour cette copropriete');
  }
}

export async function listLotOwnerProfilesBySyndicate(tenantId: string, syndicateId: string, lotId?: string) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  return prisma.lotOwnerProfile.findMany({
    where: {
      lot: {
        syndicateId
      },
      ...(lotId ? { lotId } : {})
    },
    include: {
      lot: true,
      contact: true
    },
    orderBy: [{ createdAt: 'desc' }]
  });
}

export async function createLotOwnerProfileBySyndicate(
  tenantId: string,
  syndicateId: string,
  data: {
    lotId: string;
    contactId: string;
    ownershipPercentage: number;
    ownedSince: Date;
    ownedUntil?: Date;
    portalAccessEnabled?: boolean;
    notificationPrefs?: any;
    isActive?: boolean;
  }
) {
  logger.info('Audit: create owner profile requested', {
    tenantId,
    syndicateId,
    lotId: data.lotId,
    contactId: data.contactId
  });
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  await assertLotOwnershipForSyndicate(tenantId, syndicateId, data.lotId);

  return prisma.lotOwnerProfile.create({
    data: {
      lotId: data.lotId,
      contactId: data.contactId,
      ownershipPercentage: roundMoney(data.ownershipPercentage),
      ownedSince: data.ownedSince,
      ownedUntil: data.ownedUntil ?? undefined,
      portalAccessEnabled: data.portalAccessEnabled ?? false,
      portalAccessToken: data.portalAccessEnabled ? randomUUID() : undefined,
      notificationPrefs: data.notificationPrefs ?? undefined,
      isActive: data.isActive ?? true
    },
    include: {
      lot: true,
      contact: true
    }
  });
}

export async function updateLotOwnerProfileBySyndicate(
  tenantId: string,
  syndicateId: string,
  profileId: string,
  data: {
    ownershipPercentage?: number;
    ownedSince?: Date;
    ownedUntil?: Date | null;
    portalAccessEnabled?: boolean;
    notificationPrefs?: any;
    isActive?: boolean;
  }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const profile = await prisma.lotOwnerProfile.findFirst({
    where: {
      id: profileId,
      lot: { syndicateId }
    },
    select: { id: true, portalAccessToken: true }
  });
  if (!profile) {
    throw notFound('Profil proprietaire introuvable');
  }

  return prisma.lotOwnerProfile.update({
    where: { id: profileId },
    data: {
      ownershipPercentage: data.ownershipPercentage !== undefined ? roundMoney(data.ownershipPercentage) : undefined,
      ownedSince: data.ownedSince,
      ownedUntil: data.ownedUntil === null ? null : data.ownedUntil,
      portalAccessEnabled: data.portalAccessEnabled,
      portalAccessToken:
        data.portalAccessEnabled === true && !profile.portalAccessToken
          ? randomUUID()
          : data.portalAccessEnabled === false
            ? null
            : undefined,
      notificationPrefs: data.notificationPrefs ?? undefined,
      isActive: data.isActive
    },
    include: {
      lot: true,
      contact: true
    }
  });
}

export async function listLotTenantProfilesBySyndicate(tenantId: string, syndicateId: string, lotId?: string) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  return prisma.lotTenantProfile.findMany({
    where: {
      lot: { syndicateId },
      ...(lotId ? { lotId } : {})
    },
    include: {
      lot: true,
      contact: true
    },
    orderBy: [{ createdAt: 'desc' }]
  });
}

export async function createLotTenantProfileBySyndicate(
  tenantId: string,
  syndicateId: string,
  data: {
    lotId: string;
    contactId: string;
    leaseId?: string;
    tenantSince: Date;
    tenantUntil?: Date;
    chargesBilledToTenant?: boolean;
    isCurrent?: boolean;
  }
) {
  logger.info('Audit: create tenant profile requested', {
    tenantId,
    syndicateId,
    lotId: data.lotId,
    contactId: data.contactId
  });
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  await assertLotOwnershipForSyndicate(tenantId, syndicateId, data.lotId);

  return prisma.lotTenantProfile.create({
    data: {
      lotId: data.lotId,
      contactId: data.contactId,
      leaseId: data.leaseId ?? undefined,
      tenantSince: data.tenantSince,
      tenantUntil: data.tenantUntil ?? undefined,
      chargesBilledToTenant: data.chargesBilledToTenant ?? false,
      isCurrent: data.isCurrent ?? true
    },
    include: {
      lot: true,
      contact: true
    }
  });
}

export async function updateLotTenantProfileBySyndicate(
  tenantId: string,
  syndicateId: string,
  profileId: string,
  data: {
    leaseId?: string | null;
    tenantSince?: Date;
    tenantUntil?: Date | null;
    chargesBilledToTenant?: boolean;
    isCurrent?: boolean;
  }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const profile = await prisma.lotTenantProfile.findFirst({
    where: {
      id: profileId,
      lot: { syndicateId }
    },
    select: { id: true }
  });
  if (!profile) {
    throw notFound('Profil locataire introuvable');
  }

  return prisma.lotTenantProfile.update({
    where: { id: profileId },
    data: {
      leaseId: data.leaseId === null ? null : data.leaseId,
      tenantSince: data.tenantSince,
      tenantUntil: data.tenantUntil === null ? null : data.tenantUntil,
      chargesBilledToTenant: data.chargesBilledToTenant,
      isCurrent: data.isCurrent
    },
    include: {
      lot: true,
      contact: true
    }
  });
}

export async function listIncidentsBySyndicate(
  tenantId: string,
  syndicateId: string,
  filters?: { status?: 'REPORTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  return prisma.syndicateIncident.findMany({
    where: {
      syndicateId,
      ...(filters?.status ? { status: filters.status as any } : {})
    },
    include: {
      reportedByContact: true,
      lot: true,
      asset: true,
      provider: true,
      imputations: true
    },
    orderBy: [{ reportedAt: 'desc' }]
  });
}

export async function createIncidentBySyndicate(
  tenantId: string,
  syndicateId: string,
  data: {
    reportedByContactId: string;
    lotId?: string;
    assetId?: string;
    incidentType: 'BREAKDOWN' | 'LEAK' | 'VANDALISM' | 'SAFETY' | 'OTHER';
    description: string;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    reportedAt?: Date;
  }
) {
  logger.info('Audit: create incident requested', {
    tenantId,
    syndicateId,
    incidentType: data.incidentType,
    urgency: data.urgency,
    lotId: data.lotId ?? null
  });
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  if (data.lotId) {
    await assertLotOwnershipForSyndicate(tenantId, syndicateId, data.lotId);
  }

  return prisma.syndicateIncident.create({
    data: {
      syndicateId,
      reportedByContactId: data.reportedByContactId,
      lotId: data.lotId ?? undefined,
      assetId: data.assetId ?? undefined,
      incidentType: data.incidentType as any,
      description: data.description,
      urgency: data.urgency as any,
      reportedAt: data.reportedAt ?? new Date()
    },
    include: {
      reportedByContact: true,
      lot: true,
      asset: true,
      provider: true,
      imputations: true
    }
  });
}

export async function updateIncidentBySyndicate(
  tenantId: string,
  syndicateId: string,
  incidentId: string,
  data: {
    status?: 'REPORTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    providerId?: string | null;
    resolvedAt?: Date | null;
    description?: string;
  }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const incident = await prisma.syndicateIncident.findFirst({
    where: { id: incidentId, syndicateId },
    select: { id: true }
  });
  if (!incident) {
    throw notFound('Incident introuvable');
  }

  return prisma.syndicateIncident.update({
    where: { id: incidentId },
    data: {
      status: data.status as any,
      providerId: data.providerId === null ? null : data.providerId,
      resolvedAt: data.resolvedAt === null ? null : data.resolvedAt,
      description: data.description
    },
    include: {
      reportedByContact: true,
      lot: true,
      asset: true,
      provider: true,
      imputations: true
    }
  });
}

export async function addIncidentImputationBySyndicate(
  tenantId: string,
  syndicateId: string,
  incidentId: string,
  data: {
    imputationType: 'SYNDICATE_BUDGET' | 'INSURANCE' | 'LOT_OWNER' | 'THIRD_PARTY';
    amount: number;
    currency?: string;
    budgetLineId?: string;
    lotId?: string;
    contractId?: string;
    notes?: string;
  }
) {
  logger.info('Audit: create incident imputation requested', {
    tenantId,
    syndicateId,
    incidentId,
    imputationType: data.imputationType,
    amount: data.amount
  });
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const incident = await prisma.syndicateIncident.findFirst({
    where: { id: incidentId, syndicateId },
    select: { id: true }
  });
  if (!incident) {
    throw notFound('Incident introuvable');
  }

  if (data.lotId) {
    await assertLotOwnershipForSyndicate(tenantId, syndicateId, data.lotId);
  }

  if (data.budgetLineId) {
    const budgetLine = await prisma.budgetLineItem.findFirst({
      where: {
        id: data.budgetLineId,
        budget: { syndicateId }
      },
      select: { id: true }
    });
    if (!budgetLine) {
      throw notFound('Ligne budgetaire introuvable pour cette copropriete');
    }
  }

  if (data.contractId) {
    const contract = await prisma.maintenanceContract.findFirst({
      where: { id: data.contractId, syndicateId },
      select: { id: true }
    });
    if (!contract) {
      throw notFound('Contrat introuvable pour cette copropriete');
    }
  }

  return prisma.incidentCostImputation.create({
    data: {
      incidentId,
      imputationType: data.imputationType as any,
      amount: roundMoney(data.amount),
      currency: data.currency || 'XOF',
      budgetLineId: data.budgetLineId ?? undefined,
      lotId: data.lotId ?? undefined,
      contractId: data.contractId ?? undefined,
      notes: data.notes
    },
    include: {
      incident: true,
      lot: true,
      budgetLine: true,
      contract: true
    }
  });
}
