/**
 * ContactSearchService - Advanced multi-criteria contact search for CRM / newsletter lists
 * Supports saved searches, suggestions, and CSV export.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../utils/database';

export interface ContactSearchFilters {
  searchQuery?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  city?: string;
  district?: string;
  communeIds?: string[];
  locationZones?: string[];
  country?: string;
  contactTypes?: ('PERSON' | 'COMPANY')[];
  statuses?: ('LEAD' | 'ACTIVE_CLIENT' | 'ARCHIVED')[];
  maturityLevels?: ('COLD' | 'WARM' | 'HOT')[];
  scoreMin?: number;
  scoreMax?: number;
  leadSources?: string[];
  assignedToUserIds?: string[];
  unassigned?: boolean;
  priorityLevels?: ('LOW' | 'NORMAL' | 'HIGH')[];
  preferredContactChannels?: ('CALL' | 'WHATSAPP' | 'EMAIL' | 'SMS')[];
  professions?: string[];
  sectorsOfActivity?: string[];
  jobStabilities?: string[];
  incomeMin?: number;
  incomeMax?: number;
  borrowingCapacities?: ('YES' | 'NO' | 'UNKNOWN')[];
  balanceMin?: number;
  balanceMax?: number;
  hasPaymentIncidents?: boolean;
  paymentIncidentsCountMin?: number;
  paymentIncidentsCountMax?: number;
  dealTypes?: ('ACHAT' | 'LOCATION' | 'VENTE' | 'GESTION' | 'MANDAT')[];
  dealStages?: ('NEW' | 'QUALIFIED' | 'VISIT' | 'NEGOTIATION' | 'WON' | 'LOST')[];
  budgetMin?: number;
  budgetMax?: number;
  propertyTypes?: string[];
  roomsMin?: number;
  roomsMax?: number;
  surfaceMin?: number;
  surfaceMax?: number;
  hasGarden?: boolean;
  hasParking?: boolean;
  hasPool?: boolean;
  targetCommuneIds?: string[];
  tagIds?: string[];
  hasAnyTag?: boolean;
  hasAllTags?: boolean;
  roles?: ('PROPRIETAIRE' | 'LOCATAIRE' | 'COPROPRIETAIRE' | 'ACQUEREUR')[];
  hasActiveRole?: boolean;
  consentMarketing?: boolean;
  consentWhatsapp?: boolean;
  consentEmail?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  lastInteractionAfter?: Date;
  lastInteractionBefore?: Date;
  nextActionAfter?: Date;
  nextActionBefore?: Date;
  hasNextAction?: boolean;
  hasActivityInLastDays?: number;
  activityTypes?: string[];
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'score' | 'lastInteraction' | 'createdAt' | 'nextAction';
  sortOrder?: 'asc' | 'desc';
}

export interface ContactSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phonePrimary?: string;
  whatsappNumber?: string;
  contactType: string;
  status: string;
  maturityLevel?: string;
  score?: number;
  assignedTo?: { id: string; fullName: string | null; avatarUrl: string | null };
  commune?: { id: string; name: string };
  tags: Array<{ id: string; name: string; color: string | null }>;
  activeDeals: Array<{
    id: string;
    type: string;
    stage: string;
    budgetMin?: unknown;
    budgetMax?: unknown;
  }>;
  roles: Array<{ role: string; active: boolean }>;
  lastInteractionAt?: Date;
  nextActionAt?: Date;
}

function buildWhereClause(tenantId: string, filters: ContactSearchFilters): Prisma.CrmContactWhereInput {
  const and: Prisma.CrmContactWhereInput[] = [{ tenantId }];

  if (filters.searchQuery?.trim()) {
    const q = filters.searchQuery.trim();
    and.push({
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phonePrimary: { contains: q, mode: 'insensitive' } },
        { whatsappNumber: { contains: q, mode: 'insensitive' } },
        { legalName: { contains: q, mode: 'insensitive' } }
      ]
    });
  }

  if (filters.firstName?.trim()) {
    and.push({ firstName: { contains: filters.firstName.trim(), mode: 'insensitive' } });
  }
  if (filters.lastName?.trim()) {
    and.push({ lastName: { contains: filters.lastName.trim(), mode: 'insensitive' } });
  }
  if (filters.email?.trim()) {
    and.push({ email: { contains: filters.email.trim(), mode: 'insensitive' } });
  }
  if (filters.phone?.trim()) {
    and.push({ phonePrimary: { contains: filters.phone.trim(), mode: 'insensitive' } });
  }
  if (filters.whatsappNumber?.trim()) {
    and.push({ whatsappNumber: { contains: filters.whatsappNumber.trim(), mode: 'insensitive' } });
  }

  if (filters.city?.trim()) {
    and.push({ city: { contains: filters.city.trim(), mode: 'insensitive' } });
  }
  if (filters.district?.trim()) {
    and.push({ district: { contains: filters.district.trim(), mode: 'insensitive' } });
  }
  if (filters.communeIds?.length) {
    and.push({ communeId: { in: filters.communeIds } });
  }
  if (filters.locationZones?.length) {
    and.push({ locationZone: { in: filters.locationZones } });
  }
  if (filters.country?.trim()) {
    and.push({ country: { contains: filters.country.trim(), mode: 'insensitive' } });
  }

  if (filters.contactTypes?.length) {
    and.push({ contactType: { in: filters.contactTypes } });
  }
  if (filters.statuses?.length) {
    and.push({ status: { in: filters.statuses } });
  }
  if (filters.maturityLevels?.length) {
    and.push({ maturityLevel: { in: filters.maturityLevels } });
  }
  if (filters.scoreMin !== undefined || filters.scoreMax !== undefined) {
    const score: Prisma.IntFilter = {};
    if (filters.scoreMin !== undefined) score.gte = filters.scoreMin;
    if (filters.scoreMax !== undefined) score.lte = filters.scoreMax;
    and.push({ score: score });
  }

  if (filters.assignedToUserIds?.length) {
    and.push({ assignedToUserId: { in: filters.assignedToUserIds } });
  }
  if (filters.unassigned === true) {
    and.push({ assignedToUserId: null });
  }

  if (filters.priorityLevels?.length) {
    and.push({ priorityLevel: { in: filters.priorityLevels } });
  }
  if (filters.preferredContactChannels?.length) {
    and.push({ preferredContactChannel: { in: filters.preferredContactChannels } });
  }

  if (filters.professions?.length) {
    and.push({ profession: { in: filters.professions } });
  }
  if (filters.sectorsOfActivity?.length) {
    and.push({ sectorOfActivity: { in: filters.sectorsOfActivity } });
  }
  if (filters.jobStabilities?.length) {
    and.push({ jobStability: { in: filters.jobStabilities } });
  }

  if (filters.incomeMin !== undefined || filters.incomeMax !== undefined) {
    const range: Prisma.DecimalNullableFilter = {};
    if (filters.incomeMin !== undefined) range.gte = filters.incomeMin;
    if (filters.incomeMax !== undefined) range.lte = filters.incomeMax;
    and.push({
      OR: [{ incomeMin: range }, { incomeMax: range }]
    });
  }
  if (filters.borrowingCapacities?.length) {
    and.push({ borrowingCapacity: { in: filters.borrowingCapacities } });
  }
  if (filters.balanceMin !== undefined || filters.balanceMax !== undefined) {
    const balance: Prisma.DecimalNullableFilter = {};
    if (filters.balanceMin !== undefined) balance.gte = filters.balanceMin;
    if (filters.balanceMax !== undefined) balance.lte = filters.balanceMax;
    and.push({ balance });
  }
  if (filters.hasPaymentIncidents === true) {
    and.push({ paymentIncidentsCount: { gt: 0 } });
  }
  if (filters.paymentIncidentsCountMin !== undefined || filters.paymentIncidentsCountMax !== undefined) {
    const inc: Prisma.IntNullableFilter = {};
    if (filters.paymentIncidentsCountMin !== undefined) inc.gte = filters.paymentIncidentsCountMin;
    if (filters.paymentIncidentsCountMax !== undefined) inc.lte = filters.paymentIncidentsCountMax;
    and.push({ paymentIncidentsCount: inc });
  }

  const activeDealStageFilter = { notIn: ['WON', 'LOST'] as const };

  if (filters.dealTypes?.length) {
    and.push({
      deals: {
        some: {
          type: { in: filters.dealTypes },
          stage: activeDealStageFilter
        }
      }
    });
  }
  if (filters.dealStages?.length) {
    and.push({
      deals: {
        some: { stage: { in: filters.dealStages } }
      }
    });
  }
  if (filters.budgetMin !== undefined || filters.budgetMax !== undefined) {
    const budgetConditions: Prisma.CrmDealWhereInput[] = [];
    if (filters.budgetMin !== undefined) {
      budgetConditions.push({ budgetMax: { gte: filters.budgetMin } });
    }
    if (filters.budgetMax !== undefined) {
      budgetConditions.push({ budgetMin: { lte: filters.budgetMax } });
    }
    and.push({
      deals: {
        some: {
          AND: budgetConditions,
          stage: activeDealStageFilter
        }
      }
    });
  }

  if (filters.targetCommuneIds?.length) {
    and.push({
      targetZones: {
        some: { communeId: { in: filters.targetCommuneIds } }
      }
    });
  }

  if (filters.tagIds?.length) {
    if (filters.hasAllTags) {
      for (const tagId of filters.tagIds) {
        and.push({
          tags: { some: { tagId } }
        });
      }
    } else {
      and.push({
        tags: {
          some: { tagId: { in: filters.tagIds } }
        }
      });
    }
  }
  if (filters.hasAnyTag === true) {
    and.push({ tags: { some: {} } });
  }

  if (filters.roles?.length) {
    and.push({
      roles: {
        some: {
          role: { in: filters.roles },
          active: filters.hasActiveRole !== false
        }
      }
    });
  }

  if (filters.consentMarketing !== undefined) {
    and.push({ consentMarketing: filters.consentMarketing });
  }
  if (filters.consentWhatsapp !== undefined) {
    and.push({ consentWhatsapp: filters.consentWhatsapp });
  }
  if (filters.consentEmail !== undefined) {
    and.push({ consentEmail: filters.consentEmail });
  }

  if (filters.createdAfter || filters.createdBefore) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.createdAfter) createdAt.gte = filters.createdAfter;
    if (filters.createdBefore) createdAt.lte = filters.createdBefore;
    and.push({ createdAt });
  }
  if (filters.lastInteractionAfter || filters.lastInteractionBefore) {
    const lastInteractionAt: Prisma.DateTimeNullableFilter = {};
    if (filters.lastInteractionAfter) lastInteractionAt.gte = filters.lastInteractionAfter;
    if (filters.lastInteractionBefore) lastInteractionAt.lte = filters.lastInteractionBefore;
    and.push({ lastInteractionAt });
  }
  if (filters.nextActionAfter || filters.nextActionBefore) {
    const nextActionAt: Prisma.DateTimeNullableFilter = {};
    if (filters.nextActionAfter) nextActionAt.gte = filters.nextActionAfter;
    if (filters.nextActionBefore) nextActionAt.lte = filters.nextActionBefore;
    and.push({ nextActionAt });
  }
  if (filters.hasNextAction === true) {
    and.push({ nextActionAt: { not: null } });
  } else if (filters.hasNextAction === false) {
    and.push({ nextActionAt: null });
  }

  if (filters.hasActivityInLastDays !== undefined) {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - filters.hasActivityInLastDays);
    const activityWhere: Prisma.CrmActivityWhereInput = {
      occurredAt: { gte: dateThreshold }
    };
    if (filters.activityTypes?.length) {
      activityWhere.activityType = { in: filters.activityTypes };
    }
    and.push({ activities: { some: activityWhere } });
  }

  return { AND: and };
}

function buildOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc'
): Prisma.CrmContactOrderByWithRelationInput[] {
  const order = sortOrder;
  switch (sortBy) {
    case 'name':
      return [{ lastName: order }, { firstName: order }];
    case 'score':
      return [{ score: order }];
    case 'createdAt':
      return [{ createdAt: order }];
    case 'nextAction':
      return [{ nextActionAt: order }];
    case 'lastInteraction':
    default:
      return [{ lastInteractionAt: order }];
  }
}

export async function searchContacts(
  tenantId: string,
  filters: ContactSearchFilters
): Promise<{
  contacts: ContactSearchResult[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
  appliedFilters: ContactSearchFilters;
}> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
  const skip = (page - 1) * limit;

  const where = buildWhereClause(tenantId, filters);

  const [contacts, total] = await Promise.all([
    prisma.crmContact.findMany({
      where,
      skip,
      take: limit,
      orderBy: buildOrderBy(filters.sortBy, filters.sortOrder ?? 'desc'),
      include: {
        assignedTo: {
          select: { id: true, fullName: true, avatarUrl: true }
        },
        commune: {
          select: { id: true, name: true }
        },
        tags: {
          include: {
            tag: { select: { id: true, name: true, color: true } }
          }
        },
        deals: {
          where: { stage: { notIn: ['WON', 'LOST'] } },
          select: {
            id: true,
            type: true,
            stage: true,
            budgetMin: true,
            budgetMax: true
          }
        },
        roles: {
          select: { role: true, active: true }
        }
      }
    }),
    prisma.crmContact.count({ where })
  ]);

  const transformed: ContactSearchResult[] = contacts.map(c => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phonePrimary: c.phonePrimary ?? undefined,
    whatsappNumber: c.whatsappNumber ?? undefined,
    contactType: c.contactType ?? 'PERSON',
    status: c.status,
    maturityLevel: c.maturityLevel ?? undefined,
    score: c.score ?? undefined,
    assignedTo: c.assignedTo
      ? {
          id: c.assignedTo.id,
          fullName: c.assignedTo.fullName,
          avatarUrl: c.assignedTo.avatarUrl
        }
      : undefined,
    commune: c.commune ? { id: c.commune.id, name: c.commune.name } : undefined,
    tags: c.tags.map(ct => ({
      id: ct.tag.id,
      name: ct.tag.name,
      color: ct.tag.color
    })),
    activeDeals: c.deals.map(d => ({
      id: d.id,
      type: d.type,
      stage: d.stage,
      budgetMin: d.budgetMin,
      budgetMax: d.budgetMax
    })),
    roles: c.roles.map(r => ({ role: r.role, active: r.active })),
    lastInteractionAt: c.lastInteractionAt ?? undefined,
    nextActionAt: c.nextActionAt ?? undefined
  }));

  return {
    contacts: transformed,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    },
    appliedFilters: filters
  };
}

export async function getFieldSuggestions(tenantId: string, field: string, query?: string): Promise<string[]> {
  const fieldMap: Record<string, keyof Prisma.CrmContactScalarFieldEnum> = {
    profession: 'profession',
    sectorOfActivity: 'sectorOfActivity',
    city: 'city',
    district: 'district',
    locationZone: 'locationZone',
    leadSource: 'source'
  };
  const dbField = fieldMap[field];
  if (!dbField) return [];

  const results = await prisma.crmContact.groupBy({
    by: [dbField],
    where: {
      tenantId,
      [dbField]: query ? { contains: query, mode: 'insensitive' } : { not: null }
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 20
  });

  return results
    .map(r => (r as Record<string, unknown>)[dbField])
    .filter((v): v is string => v != null && typeof v === 'string');
}

export async function saveSearch(
  tenantId: string,
  userId: string,
  data: {
    name: string;
    description?: string;
    filters: ContactSearchFilters;
    scope?: 'PERSONAL' | 'TEAM' | 'TENANT';
  }
) {
  return prisma.savedContactSearch.create({
    data: {
      tenantId,
      name: data.name,
      description: data.description ?? null,
      filters: data.filters as unknown as Prisma.InputJsonValue,
      scope: data.scope ?? 'PERSONAL',
      createdById: userId
    }
  });
}

export async function getSavedSearches(tenantId: string, userId: string) {
  return prisma.savedContactSearch.findMany({
    where: {
      tenantId,
      OR: [{ createdById: userId, scope: 'PERSONAL' }, { scope: 'TEAM' }, { scope: 'TENANT' }]
    },
    orderBy: [{ useCount: 'desc' }, { lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      createdBy: {
        select: { id: true, fullName: true, avatarUrl: true }
      }
    }
  });
}

export async function useSavedSearch(searchId: string, tenantId: string) {
  const search = await prisma.savedContactSearch.update({
    where: { id: searchId, tenantId },
    data: {
      useCount: { increment: 1 },
      lastUsedAt: new Date()
    }
  });
  return searchContacts(tenantId, search.filters as ContactSearchFilters);
}

export async function deleteSavedSearch(searchId: string, tenantId: string, userId: string) {
  const search = await prisma.savedContactSearch.findUnique({
    where: { id: searchId, tenantId }
  });
  if (!search) throw new Error('Recherche introuvable');
  if (search.createdById !== userId) {
    throw new Error('Vous ne pouvez supprimer que vos propres recherches');
  }
  return prisma.savedContactSearch.delete({
    where: { id: searchId, tenantId }
  });
}

export async function exportSearchResultsCsv(tenantId: string, filters: ContactSearchFilters): Promise<string> {
  const result = await searchContacts(tenantId, {
    ...filters,
    limit: 10000,
    page: 1
  });

  const headers = [
    'ID',
    'Prénom',
    'Nom',
    'Email',
    'Téléphone',
    'WhatsApp',
    'Type',
    'Statut',
    'Maturité',
    'Score',
    'Commune',
    'Tags',
    'Deals actifs',
    'Rôles'
  ].join(',');

  const rows = result.contacts.map(c =>
    [
      c.id,
      c.firstName,
      c.lastName,
      c.email,
      c.phonePrimary ?? '',
      c.whatsappNumber ?? '',
      c.contactType,
      c.status,
      c.maturityLevel ?? '',
      c.score ?? '',
      c.commune?.name ?? '',
      c.tags.map(t => t.name).join(';'),
      c.activeDeals.length,
      c.roles
        .filter(r => r.active)
        .map(r => r.role)
        .join(';')
    ]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );

  return [headers, ...rows].join('\n');
}
