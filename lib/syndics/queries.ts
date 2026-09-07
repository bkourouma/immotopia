import { PrismaClient } from '@prisma/client';
import { notFound } from '../errors';

const prisma = new PrismaClient();

export async function listSyndicatesByTenant(tenantId: string) {
  return prisma.syndicate.findMany({
    where: { tenantId },
    include: {
      _count: {
        select: {
          lots: true,
          chargeCalls: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getSyndicateWithLotsAndStats(tenantId: string, syndicateId: string) {
  return prisma.syndicate.findFirst({
    where: {
      id: syndicateId,
      tenantId
    },
    include: {
      lots: true,
      chargeCalls: true,
      funds: true
    }
  });
}

export async function createSyndicateWithDefaults(
  tenantId: string,
  data: { name: string; address: string; cadastralReference?: string | null; totalLots?: number; totalBuildings?: number }
) {
  return prisma.syndicate.create({
    data: {
      ...data,
      tenantId
    }
  });
}

export async function updateSyndicateByTenant(
  tenantId: string,
  syndicateId: string,
  data: {
    name?: string;
    address?: string;
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

  // Temporary soft-archive until the schema provides a dedicated archive status or archivedAt field.
  return prisma.syndicate.update({
    where: { id: syndicateId },
    data: {
      status: 'IN_LIQUIDATION'
    }
  });
}

export async function createSyndicateLot(
  tenantId: string,
  data: {
    syndicateId: string;
    propertyId?: string | null;
    ownerContactId?: string | null;
    lotNumber: string;
    lotType: string;
    generalShares: number;
    specialShares?: number | null;
    ownerSince?: Date | null;
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

  return prisma.syndicateLot.create({
    data
  });
}

export async function listChargeCallsBySyndicate(
  tenantId: string,
  syndicateId: string,
  filters?: { period?: string; status?: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' }
) {
  return prisma.chargeCall.findMany({
    where: {
      syndicateId,
      syndicate: {
        tenantId
      },
      ...(filters?.period ? { period: filters.period } : {}),
      ...(filters?.status ? { status: filters.status } : {})
    },
    include: {
      lot: {
        include: {
          owner: true
        }
      },
      payments: true
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }]
  });
}

export async function getChargeCallByTenant(
  tenantId: string,
  syndicateId: string,
  chargeCallId: string
) {
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
  data: { syndicateId: string; lotId: string; period: string; amount: number; currency: string; dueDate: Date }
) {
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

  return prisma.$transaction(async (tx) => {
    const chargeCall = await tx.chargeCall.create({ data });
    return chargeCall;
  });
}

export async function recordChargePaymentWithStatusUpdate(
  tenantId: string,
  data: { chargeCallId: string; amount: number; paidAt: Date; method?: string | null; reference?: string | null }
) {
  return prisma.$transaction(async (tx) => {
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

    const totalPaid = aggregate._sum.amount ?? 0;
    let status = call.status;

    if (totalPaid <= 0) {
      status = 'PENDING';
    } else if (totalPaid > 0 && totalPaid < call.amount) {
      status = 'PARTIAL';
    } else if (totalPaid >= call.amount) {
      status = 'PAID';
    }

    await tx.chargeCall.update({
      where: { id: call.id },
      data: { status }
    });

    return payment;
  });
}

export async function createMeetingWithResolutions(data: {
  syndicateId: string;
  type: string;
  scheduledAt: Date;
  location?: string | null;
  resolutions: { title: string; description?: string | null; majorityRule?: string | null }[];
}) {
  return prisma.$transaction(async (tx) => {
    const meeting = await tx.generalMeeting.create({
      data: {
        syndicateId: data.syndicateId,
        type: data.type as any,
        scheduledAt: data.scheduledAt,
        location: data.location ?? undefined
      }
    });

    if (data.resolutions.length > 0) {
      await tx.gMResolution.createMany({
        data: data.resolutions.map((r) => ({
          meetingId: meeting.id,
          title: r.title,
          description: r.description,
          majorityRule: r.majorityRule
        }))
      });
    }

    return meeting;
  });
}

export async function castVoteAndRecomputeResolutionCounters(
  resolutionId: string,
  lotId: string,
  vote: 'FOR' | 'AGAINST' | 'ABSTAIN',
  lotShares: number
) {
  return prisma.$transaction(async (tx) => {
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
      where: { resolutionId }
    });

    let votesFor = 0;
    let votesAgainst = 0;
    let votesAbstain = 0;
    let sharesFor = 0;

    for (const v of votes) {
      if (v.vote === 'FOR') {
        votesFor += 1;
        sharesFor += lotShares;
      } else if (v.vote === 'AGAINST') {
        votesAgainst += 1;
      } else if (v.vote === 'ABSTAIN') {
        votesAbstain += 1;
      }
    }

    await tx.gMResolution.update({
      where: { id: resolutionId },
      data: {
        votesFor,
        votesAgainst,
        votesAbstain,
        sharesFor
      }
    });
  });
}
