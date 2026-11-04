/**
 * Critères des listes du CRM (contacts, affaires, activités) et construction
 * de leur clause `where` Prisma.
 *
 * Fonctions pures, sans accès base : testables seules. Toute clause part de
 * `{ tenantId }` ; un identifiant reçu en filtre (contact, collaborateur,
 * étiquette) reste DANS ce `where`, donc l'identifiant d'une autre agence ne
 * ramène aucune ligne (même réponse qu'un identifiant inexistant).
 */
import {
  LeadSource,
  CrmActivityDirection,
  CrmActivityType,
  CrmContactStatus,
  CrmContactType,
  CrmDealStage,
  CrmDealType,
  MaturityLevel
} from '@prisma/client';
import { periodEnd, periodStart } from '../utils/crm-query-params';

interface PageFilters {
  page?: number;
  limit?: number;
}

/**
 * Critères de la liste des contacts. `status`, `contactType` et `maturityLevel`
 * acceptent plusieurs valeurs (`status=LEAD,ACTIVE_CLIENT` côté HTTP) ;
 * `tagIds` : au moins une des étiquettes de l'agence.
 */
export interface ContactListFilters extends PageFilters {
  status?: CrmContactStatus | CrmContactStatus[];
  contactType?: CrmContactType[];
  maturityLevel?: MaturityLevel[];
  /** Origine du prospect (énumération). `source` ci-dessous est l'ancien champ texte libre. */
  leadSource?: LeadSource[];
  source?: string;
  assignedTo?: string;
  tag?: string;
  tagIds?: string[];
  /** Nom, raison sociale, e-mail, téléphones, WhatsApp. */
  search?: string;
  startDate?: string;
  endDate?: string;
  hasActiveDeal?: boolean;
  hasUpcomingActivity?: boolean;
}

/**
 * Critères de la liste des affaires. `stage` et `type` acceptent une valeur ou
 * plusieurs (`stage=NEW,VISIT` côté HTTP) ; `search` cherche dans le contact
 * (nom, raison sociale, e-mail, téléphones), la zone, le collaborateur
 * assigné et le motif de clôture.
 */
export interface DealListFilters extends PageFilters {
  type?: CrmDealType | CrmDealType[];
  stage?: CrmDealStage | CrmDealStage[];
  assignedTo?: string;
  contactId?: string;
  budgetMin?: number;
  budgetMax?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
}

/**
 * Critères de la liste des activités. `type` et `direction` acceptent une
 * valeur ou plusieurs (`type=CALL,EMAIL` côté HTTP) ; `search` cherche dans le
 * sujet, le contenu, le résultat, le type de prochaine action, le contact et
 * l'auteur.
 */
export interface ActivityListFilters extends PageFilters {
  contactId?: string;
  dealId?: string;
  type?: CrmActivityType | CrmActivityType[];
  direction?: CrmActivityDirection | CrmActivityDirection[];
  createdBy?: string;
  /** true : avec une prochaine action planifiée ; false : sans. */
  hasNextAction?: boolean;
  search?: string;
  startDate?: string;
  endDate?: string;
}

/** Une valeur, ou `{ in: [...] }` pour plusieurs ; `undefined` si rien à filtrer. */
function oneOrMany<T>(value: T | T[] | undefined): T | { in: T[] } | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return value;
  if (value.length === 0) return undefined;
  return value.length === 1 ? value[0] : { in: value };
}

export function buildContactListWhere(tenantId: string, filters: ContactListFilters): any {
  const where: any = {
    tenantId // Always enforce tenant isolation
  };

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    if (statuses.length === 1) where.status = statuses[0];
    else if (statuses.length > 1) where.status = { in: statuses };
  }

  if (filters.contactType && filters.contactType.length > 0) {
    where.contactType = filters.contactType.length === 1 ? filters.contactType[0] : { in: filters.contactType };
  }

  if (filters.maturityLevel && filters.maturityLevel.length > 0) {
    where.maturityLevel = filters.maturityLevel.length === 1 ? filters.maturityLevel[0] : { in: filters.maturityLevel };
  }

  if (filters.leadSource && filters.leadSource.length > 0) {
    where.leadSource = filters.leadSource.length === 1 ? filters.leadSource[0] : { in: filters.leadSource };
  }

  if (filters.source) {
    where.source = filters.source;
  }

  if (filters.assignedTo) {
    where.assignedToUserId = filters.assignedTo;
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = periodStart(filters.startDate);
    }
    if (filters.endDate) {
      where.createdAt.lte = periodEnd(filters.endDate);
    }
  }

  // Build AND conditions array for complex filters
  const andConditions: any[] = [];

  if (filters.search) {
    andConditions.push({
      OR: [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { legalName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phonePrimary: { contains: filters.search, mode: 'insensitive' } },
        { phoneSecondary: { contains: filters.search, mode: 'insensitive' } },
        { whatsappNumber: { contains: filters.search, mode: 'insensitive' } },
        { source: { contains: filters.search, mode: 'insensitive' } }
      ]
    });
  }

  // Étiquettes : au moins une des étiquettes demandées (celles de CETTE agence seulement).
  if (filters.tagIds && filters.tagIds.length > 0) {
    andConditions.push({
      tags: {
        some: {
          tag: { id: { in: filters.tagIds }, tenantId }
        }
      }
    });
  }

  // Handle tag filter
  if (filters.tag) {
    andConditions.push({
      tags: {
        some: {
          tag: {
            name: filters.tag
          }
        }
      }
    });
  }

  // Handle hasActiveDeal filter
  if (filters.hasActiveDeal !== undefined) {
    if (filters.hasActiveDeal) {
      andConditions.push({
        deals: {
          some: {
            stage: {
              notIn: ['WON', 'LOST']
            }
          }
        }
      });
    } else {
      andConditions.push({
        deals: {
          none: {
            stage: {
              notIn: ['WON', 'LOST']
            }
          }
        }
      });
    }
  }

  // Handle hasUpcomingActivity filter
  if (filters.hasUpcomingActivity !== undefined) {
    const now = new Date();
    if (filters.hasUpcomingActivity) {
      // Contact must have an activity with nextActionAt in the future
      andConditions.push({
        activities: {
          some: {
            nextActionAt: {
              gte: now,
              not: null
            }
          }
        }
      });
    } else {
      // Contact must NOT have upcoming activities
      andConditions.push({
        activities: {
          none: {
            nextActionAt: {
              gte: now,
              not: null
            }
          }
        }
      });
    }
  }

  // Apply AND conditions if any
  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

export function buildDealListWhere(tenantId: string, filters: DealListFilters): any {
  const where: any = {
    tenantId // Always enforce tenant isolation
  };

  const typeFilter = oneOrMany(filters.type);
  if (typeFilter) {
    where.type = typeFilter;
  }

  const stageFilter = oneOrMany(filters.stage);
  if (stageFilter) {
    where.stage = stageFilter;
  }

  // Les identifiants restent DANS le `where` de l'agence : un collaborateur ou
  // un contact d'une autre agence ne ramène aucune ligne.
  if (filters.assignedTo) {
    where.assignedToUserId = filters.assignedTo;
  }

  if (filters.contactId) {
    where.contactId = filters.contactId;
  }

  const search = filters.search?.trim();
  if (search) {
    where.AND = where.AND || [];
    where.AND.push({
      OR: [
        { locationZone: { contains: search, mode: 'insensitive' } },
        { closedReason: { contains: search, mode: 'insensitive' } },
        { contact: { firstName: { contains: search, mode: 'insensitive' } } },
        { contact: { lastName: { contains: search, mode: 'insensitive' } } },
        { contact: { legalName: { contains: search, mode: 'insensitive' } } },
        { contact: { email: { contains: search, mode: 'insensitive' } } },
        { contact: { phonePrimary: { contains: search, mode: 'insensitive' } } },
        { contact: { phoneSecondary: { contains: search, mode: 'insensitive' } } },
        { assignedTo: { fullName: { contains: search, mode: 'insensitive' } } }
      ]
    });
  }

  if (filters.budgetMin || filters.budgetMax) {
    const budgetConditions: any[] = [];

    if (filters.budgetMin && filters.budgetMax) {
      // Deal budget overlaps with filter range if:
      // - budgetMin is within range OR
      // - budgetMax is within range OR
      // - deal range contains filter range
      budgetConditions.push({
        AND: [{ budgetMin: { lte: filters.budgetMax } }, { budgetMax: { gte: filters.budgetMin } }]
      });
      // Also include deals with only budgetMin or budgetMax
      budgetConditions.push({
        AND: [{ budgetMin: { gte: filters.budgetMin, lte: filters.budgetMax } }, { budgetMax: null }]
      });
      budgetConditions.push({
        AND: [{ budgetMin: null }, { budgetMax: { gte: filters.budgetMin, lte: filters.budgetMax } }]
      });
    } else if (filters.budgetMin) {
      // Deal has budgetMax >= filterMin OR budgetMin >= filterMin
      budgetConditions.push({ budgetMax: { gte: filters.budgetMin } });
      budgetConditions.push({ budgetMin: { gte: filters.budgetMin } });
    } else if (filters.budgetMax) {
      // Deal has budgetMin <= filterMax OR budgetMax <= filterMax
      budgetConditions.push({ budgetMin: { lte: filters.budgetMax } });
      budgetConditions.push({ budgetMax: { lte: filters.budgetMax } });
    }

    if (budgetConditions.length > 0) {
      where.AND = where.AND || [];
      where.AND.push({ OR: budgetConditions });
    }
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = periodStart(filters.startDate);
    }
    if (filters.endDate) {
      where.createdAt.lte = periodEnd(filters.endDate);
    }
  }

  return where;
}

export function buildActivityListWhere(tenantId: string, filters: ActivityListFilters): any {
  const where: any = {
    tenantId // Always enforce tenant isolation
  };

  if (filters.contactId) {
    where.contactId = filters.contactId;
  }

  if (filters.dealId) {
    where.dealId = filters.dealId;
  }

  if (filters.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    if (types.length === 1) where.activityType = types[0];
    else if (types.length > 1) where.activityType = { in: types };
  }

  if (filters.direction) {
    const directions = Array.isArray(filters.direction) ? filters.direction : [filters.direction];
    if (directions.length === 1) where.direction = directions[0];
    else if (directions.length > 1) where.direction = { in: directions };
  }

  if (filters.createdBy) {
    where.createdByUserId = filters.createdBy;
  }

  if (filters.hasNextAction !== undefined) {
    where.nextActionAt = filters.hasNextAction ? { not: null } : null;
  }

  const search = filters.search?.trim();
  if (search) {
    where.AND = [
      {
        OR: [
          { subject: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
          { outcome: { contains: search, mode: 'insensitive' } },
          { nextActionType: { contains: search, mode: 'insensitive' } },
          { contact: { firstName: { contains: search, mode: 'insensitive' } } },
          { contact: { lastName: { contains: search, mode: 'insensitive' } } },
          { contact: { legalName: { contains: search, mode: 'insensitive' } } },
          { contact: { email: { contains: search, mode: 'insensitive' } } },
          { createdBy: { fullName: { contains: search, mode: 'insensitive' } } },
          { createdBy: { email: { contains: search, mode: 'insensitive' } } }
        ]
      }
    ];
  }

  // Date range filter for occurredAt
  if (filters.startDate || filters.endDate) {
    where.occurredAt = {};
    if (filters.startDate) {
      where.occurredAt.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      // Add one day to include the entire end date
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      where.occurredAt.lte = endDate;
    }
  }

  return where;
}
