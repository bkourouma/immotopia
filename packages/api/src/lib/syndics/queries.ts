import { LotType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { conflict, notFound, tenantIsolationError, unprocessableEntity } from '../errors';
import {
  computeLatePenalty,
  computeOutstanding,
  deriveChargeCallStatus,
  isJournalEntryBalanced,
  roundMoney
} from './finance-utils';
import {
  computeMeetingAttendance,
  computeResolutionTally,
  DEFAULT_MAJORITY_RULE,
  type MajorityLot
} from './meeting-majority';
// Ecart recette (lot syndic-ecarts, T2) : votant d'un lot a la date de l'AG.
import { presentLotOwners, pickPrimaryOwnerProfile, syncLotOwnerFromProfilesTx } from './lot-owner';
import { toMajorityLotsAt, votersAt, type LotOwnerProfileForVoters } from './meeting-voters';
import { assertBelongsToTenant } from '../../utils/tenant-ownership';
import { logger } from '../../utils/logger';
// Lot S2 (audit S1) : le logo prive de la copropriete est supprime avec elle.
import { deleteBrandingImage } from '../documents/branding-storage';
// Shared client: a second `new PrismaClient()` here doubled the connection
// pool and escaped the graceful-shutdown handlers in utils/database.
import { prisma, type PrismaTransactionClient } from '../../utils/database';
// Grand livre partage avec les futurs comptes de tiers (decision D1, lot 1) :
// extrait de ce fichier vers lib/finance/ledger.ts, sans changement de comportement.
import { appendOwnerAccountTransactionTx } from '../finance/ledger';
// Lot S2 : compte de lot et role CRM extraits vers owner-account-tx.ts, partages
// avec l'affectation des paiements (charge-allocation.ts).
import { ensureCrmRoleForContact, ensureOwnerAccountForLotTx } from './owner-account-tx';
import {
  applyLotAdvanceTx,
  CHARGE_CALL_ALLOCATIONS_INCLUDE,
  compareLotIdsForLocking,
  lockLotTx,
  sortLotIdsForLocking,
  paidFromAllocations,
  recordLotPaymentTx,
  withAllocationPayments
} from './charge-allocation';
import { toCents, fromCents } from './charge-allocation-plan';
import {
  applyChronologicalBalances,
  chronologicalBalanceStrictlyBefore,
  type RunningBalanceMovement
} from './owner-account-running-balance';
// Lot S3 : recus et quittances emis dans la transaction, livres apres le commit.
import {
  issueQuittancesAfterAdvanceTx,
  issueReceiptsForPaymentTx,
  toDocumentRefs,
  type IssuedChargeDocument
} from './charge-receipts';
import { scheduleChargeDocumentDelivery } from './charge-receipt-delivery';
import {
  assertFundCurrency,
  assertFundOfSyndicate,
  assertFundsOfSyndicate,
  creditFundsForAllocationsTx,
  lockFundsTx,
  recordFundMovementTx,
  type FundCreditItem
} from './fund-credits';
import { recurrenceStepMonths, resolvePeriodBounds, shiftPeriodBounds, type PeriodBounds } from './period';
// Lot S4 : quote-part annuelle du budget divisee par le nombre de periodes.
import { annualShareForPeriod } from './charge-schedule-periods';
import { AppError, ConflictError, QuotaExceededError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { logAuditEvent, recordAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import {
  ACTIVE_SYNDICATE_STATUSES,
  assertCapacityTx,
  LOT_QUOTA_REACHED_REASON,
  resolveLotScope,
  syncLotActivationsTx
} from '../../services/lot-registry-service';

const isCountedSyndicateStatus = (status: string) => (ACTIVE_SYNDICATE_STATUSES as readonly string[]).includes(status);

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

/**
 * C3 — un profil proprietaire/locataire de lot pointe vers un CrmContact; sans
 * ce controle, un contact d'une autre agence pouvait etre attache a un lot
 * (IDOR silencieux: le contact n'a pas de lien direct avec la copropriete
 * dans le schema, seul ce controle applicatif l'empeche).
 */
async function assertContactBelongsToTenant(tenantId: string, contactId: string) {
  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId },
    select: { id: true }
  });
  if (!contact) {
    throw notFound('Contact introuvable ou inaccessible');
  }
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

async function syncSyndicateLotCount(tx: PrismaTransactionClient, tenantId: string, syndicateId: string) {
  const totalLots = await tx.syndicateLot.count({
    where: { syndicateId }
  });

  await tx.syndicate.update({
    where: { id: syndicateId, tenantId },
    data: { totalLots }
  });
}

/**
 * Lot S1 : l'agence mandante designee doit appartenir a l'agence. Un mandant
 * d'une autre agence repond comme un mandant inexistant (404).
 */
async function assertMandatingAgencyOfTenant(tenantId: string, mandatingAgencyId: string | null | undefined) {
  await assertBelongsToTenant(prisma, 'syndicMandatingAgency', mandatingAgencyId, tenantId, {
    message: 'Agence mandante introuvable.'
  });
}

/**
 * Ecart recette (lot syndic-ecarts, T1) : `buildPagination()` etait appele
 * sans argument, tronquant silencieusement la liste a `DEFAULT_LIMIT` (20)
 * copropretes des que l'agence en avait davantage. `page`/`limit` sont
 * desormais transmis par le controleur (query string validee par
 * `paginationQuerySchema`), et la reponse porte `total`/`totalPages` — meme
 * filtre (`tenantId`, statut hors liquidation) pour la page et le compte.
 */
export async function listSyndicatesByTenant(tenantId: string, pagination?: PaginationInput) {
  const pager = buildPagination(pagination);
  const where: Prisma.SyndicateWhereInput = {
    tenantId,
    status: {
      not: 'IN_LIQUIDATION'
    }
  };

  const [items, total] = await Promise.all([
    prisma.syndicate.findMany({
      where,
      include: {
        // Le compte complet (pas seulement lots/chargeCalls) permet a la liste
        // web de savoir, sans requete supplementaire, si le bouton
        // « Supprimer » doit etre desactive (ecart recette #8 : seule une
        // copropriete vide peut etre supprimee — voir
        // `deleteEmptySyndicateByTenant`).
        // Lot S1 : resume du mandant, expose par toSyndicateResponse.
        mandatingAgency: { select: { id: true, name: true } },
        _count: {
          select: {
            lots: true,
            chargeCalls: true,
            budgets: true,
            generalMeetings: true,
            documents: true,
            serviceContracts: true,
            incidents: true
          }
        }
      },
      skip: pager.skip,
      take: pager.take,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.syndicate.count({ where })
  ]);

  return {
    items,
    total,
    page: pager.page,
    limit: pager.limit,
    totalPages: Math.ceil(total / pager.limit)
  };
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
          // Proprietaires actuels (indivision) : lus par `presentLotOwners`, jamais exposes tels quels.
          ownerProfiles: {
            select: {
              id: true,
              contactId: true,
              ownershipPercentage: true,
              ownedSince: true,
              ownedUntil: true,
              isActive: true,
              contact: { select: { id: true, firstName: true, lastName: true, legalName: true, email: true } }
            }
          },
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
      funds: true,
      mandatingAgency: { select: { id: true, name: true } }
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
    mandatingAgencyId?: string | null;
  }
) {
  await assertMandatingAgencyOfTenant(tenantId, data.mandatingAgencyId);

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

  // Une copropriete ACTIVE consomme la capacite COPROPRIETES (D14) : controle
  // sous le verrou d'agence, dans la transaction de la creation.
  return prisma.$transaction(async tx => {
    await assertCapacityTx(tx, tenantId, 'COPROPRIETES');
    return tx.syndicate.create({
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
        mandatingAgencyId: data.mandatingAgencyId ?? undefined,
        tenantId
      }
    });
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
    mandatingAgencyId?: string | null;
  }
) {
  const existing = await prisma.syndicate.findFirst({
    where: {
      id: syndicateId,
      tenantId
    },
    select: { id: true, status: true }
  });

  if (!existing) {
    throw notFound('Copropriété introuvable ou inaccessible');
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

  await assertMandatingAgencyOfTenant(tenantId, data.mandatingAgencyId);

  const statusChanges = data.status !== undefined && data.status !== existing.status;
  if (!statusChanges) {
    return prisma.syndicate.update({
      where: { id: syndicateId, tenantId },
      data
    });
  }

  // Changement de statut : la copropriete et ses lots principaux entrent dans
  // la reserve (ACTIVE, IN_DISPUTE) ou en sortent (IN_LIQUIDATION), D2/D14.
  return prisma.$transaction(async tx => {
    if (!isCountedSyndicateStatus(existing.status) && isCountedSyndicateStatus(data.status as string)) {
      await assertCapacityTx(tx, tenantId, 'COPROPRIETES');
    }
    const updated = await tx.syndicate.update({
      where: { id: syndicateId, tenantId },
      data
    });
    await syncLotActivationsTx(tx, tenantId, { syndicateIds: [syndicateId] }, { reason: `SYNDICATE_${data.status}` });
    return updated;
  });
}

/**
 * Suppression definitive d'une copropriete — seulement si elle est vide.
 *
 * Anciennement `archiveSyndicateByTenant` : le nom promettait un archivage
 * (statut, corbeille) que le code n'a jamais fait — c'etait deja un
 * `prisma.syndicate.delete` en cascade sur les lots, appels de charges, AG,
 * documents, contrats et incidents (ecart recette #8,
 * docs/recette/SCENARIO_SYNDIC_MODULES.md). Sans migration pour ajouter un
 * statut d'archivage a `SyndicateStatus`, la seule option sure est de refuser
 * la suppression tant qu'il reste la moindre donnee liee, et de renommer la
 * fonction pour qu'elle dise ce qu'elle fait reellement.
 */
export async function deleteEmptySyndicateByTenant(tenantId: string, syndicateId: string) {
  const existing = await prisma.syndicate.findFirst({
    where: {
      id: syndicateId,
      tenantId
    },
    // Le logo prive (s'il existe) est releve AVANT la suppression pour
    // pouvoir supprimer le fichier une fois la ligne effacee en base.
    select: { id: true, logoPath: true }
  });

  if (!existing) {
    throw notFound('Copropriété introuvable ou inaccessible');
  }

  const [lots, budgets, chargeCalls, meetings, documents, contracts, incidents] = await Promise.all([
    prisma.syndicateLot.count({ where: { syndicateId } }),
    prisma.syndicateBudget.count({ where: { syndicateId } }),
    prisma.chargeCall.count({ where: { syndicateId } }),
    prisma.generalMeeting.count({ where: { syndicateId } }),
    prisma.syndicateDocument.count({ where: { syndicateId } }),
    prisma.maintenanceContract.count({ where: { syndicateId } }),
    prisma.syndicateIncident.count({ where: { syndicateId } })
  ]);

  if (lots + budgets + chargeCalls + meetings + documents + contracts + incidents > 0) {
    throw conflict(
      'Cette copropriete a des lots, des appels de charges, des assemblees ou des documents : elle ne peut pas etre supprimee.'
    );
  }

  // Suppression : perimetre releve AVANT la suppression, comme pour toute
  // autre sortie du registre des lots (il n'y a normalement aucun lot ici
  // puisque la copropriete est vide, mais on garde la meme mecanique que les
  // autres operations de `syncLotActivationsTx` par coherence).
  const deleted = await prisma.$transaction(async tx => {
    const scope = await resolveLotScope(tx, tenantId, { syndicateIds: [syndicateId] });
    const row = await tx.syndicate.delete({
      where: { id: syndicateId, tenantId }
    });
    await syncLotActivationsTx(tx, tenantId, scope, { reason: 'SYNDICATE_DELETED' });
    return row;
  });

  // Logo prive de la copropriete : supprime apres coup, jamais bloquant pour
  // la suppression elle-meme (deleteBrandingImage journalise et n'echoue
  // jamais, meme fichier deja absent).
  await deleteBrandingImage(tenantId, existing.logoPath);

  return deleted;
}

const LOT_NUMBER_DUPLICATE_MESSAGE = 'Ce numéro de lot existe déjà dans la copropriété';

/** Normalise un numéro de lot : espaces de bord retirés (la casse est ignorée à la comparaison). */
function normalizeLotNumber(value: string): string {
  return value.trim();
}

function lotNumberConflict(): ConflictError {
  return new ConflictError(LOT_NUMBER_DUPLICATE_MESSAGE, [
    { field: 'lotNumber', message: LOT_NUMBER_DUPLICATE_MESSAGE }
  ]);
}

/**
 * BUG-2026-09-30-025 : le numéro de lot est unique dans une copropriété, sans
 * égard à la casse ni aux espaces de bord (« A1 » = « a1 »). Contrôle fait
 * AVANT toute écriture dérivée (tantièmes, compte du lot, quota) ; l'index
 * unique `syndicate_lots_syndicate_lot_number_uniq` garantit la règle en base
 * face à deux requêtes concurrentes (voir `rethrowLotNumberRace`).
 */
async function assertLotNumberAvailable(
  client: Pick<PrismaTransactionClient, 'syndicateLot'>,
  syndicateId: string,
  lotNumber: string,
  excludeLotId?: string
): Promise<void> {
  const duplicate = await client.syndicateLot.findFirst({
    where: {
      syndicateId,
      lotNumber: { equals: normalizeLotNumber(lotNumber), mode: 'insensitive' },
      ...(excludeLotId ? { id: { not: excludeLotId } } : {})
    },
    select: { id: true }
  });
  if (duplicate) throw lotNumberConflict();
}

const PROPERTY_ALREADY_LINKED_MESSAGE = 'Ce bien est déjà rattaché à un lot de copropriété.';

/** P2002 sur l'unicité de `SyndicateLot.propertyId` (et non sur le numéro de lot). */
function isPropertyLinkViolation(error: unknown): boolean {
  const target = (error as { meta?: { target?: unknown } } | null)?.meta?.target;
  const text = Array.isArray(target) ? target.join(',') : typeof target === 'string' ? target : '';
  return /property_id|propertyId/.test(text);
}

function propertyLinkConflict(): ConflictError {
  return new ConflictError(PROPERTY_ALREADY_LINKED_MESSAGE, [
    { field: 'propertyId', message: PROPERTY_ALREADY_LINKED_MESSAGE }
  ]);
}

/** Une course entre deux requêtes est arrêtée par l'index unique : même réponse 409. */
function rethrowLotNumberRace(error: unknown): never {
  if ((error as { code?: string } | null)?.code === 'P2002') {
    throw isPropertyLinkViolation(error) ? propertyLinkConflict() : lotNumberConflict();
  }
  throw error;
}

export async function createSyndicateLot(
  tenantId: string,
  data: {
    syndicateId: string;
    propertyId?: string | null;
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
    throw notFound('Copropriété introuvable ou inaccessible');
  }

  // Un lot de copropriete (parking, cave...) peut ne pas avoir de bien lie :
  // il est alors cree directement au niveau de la copropriete. Cf. modele
  // Prisma SyndicateLot.propertyId (optionnel) et
  // docs/recette/SCENARIO_SYNDIC_ABONNEMENT.md (lot MC1).
  if (data.propertyId) {
    const property = await prisma.property.findFirst({
      where: { id: data.propertyId, tenantId },
      select: { id: true, containerParentId: true, propertyType: true }
    });

    if (!property) {
      throw notFound('Sous-propriete introuvable ou inaccessible');
    }

    if (property.propertyType === 'IMMEUBLE') {
      throw unprocessableEntity(
        'Un lot ne peut pas etre un immeuble parent; selectionnez une unite (appartement, villa, bureau, etc.)'
      );
    }
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

  const lotNumber = normalizeLotNumber(data.lotNumber);

  return prisma
    .$transaction(async tx => {
      await assertLotNumberAvailable(tx, data.syndicateId, lotNumber);

      if (data.coownerId) {
        await ensureCrmRoleForContact(tx, tenantId, data.coownerId, 'COOWNER');
      }

      const lot = await tx.syndicateLot.create({
        data: {
          syndicateId: data.syndicateId,
          propertyId: data.propertyId ?? null,
          coownerId: data.coownerId ?? undefined,
          ownerContactId: data.coownerId ?? undefined,
          lotNumber,
          lotType: data.lotType,
          generalShares: Math.round(data.tantiemes),
          specialShares: data.isParkingIncluded ? Math.round(data.tantiemes) : null
        }
      });

      await syncSyndicateLotCount(tx, tenantId, data.syndicateId);
      // Lot principal d'une copropriete active : compte dans la reserve (D2).
      await syncLotActivationsTx(tx, tenantId, { syndicateLotIds: [lot.id] });

      return lot;
    })
    .catch(rethrowLotNumberRace);
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

function inferLotNumberFromProperty(property: { internalReference: string; title: string; id: string }) {
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
  const liquidatedLotIds = existingLots.filter(lot => lot.syndicate.status === 'IN_LIQUIDATION').map(lot => lot.id);

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
    const lotNumber = normalizeLotNumber(inferLotNumberFromProperty(property));
    const tantiemes = 1;

    const ownerContactId = property.owner?.email
      ? ownerContactByEmail.get(property.owner.email.trim().toLowerCase()) || null
      : null;

    // Une transaction par ligne : en `enforce` avec la politique BLOCK, la
    // ligne qui depasserait la reserve de lots est annulee et ecartee
    // (« Quota de lots atteint ») ; les suivantes qui ne consomment rien
    // (parking, bien deja compte) passent encore. BILL_OVERAGE / WARN_ONLY :
    // tout passe.
    let lot: { id: string };
    try {
      lot = await prisma.$transaction(async tx => {
        await assertLotNumberAvailable(tx, syndicateId, lotNumber);
        if (ownerContactId) {
          await ensureCrmRoleForContact(tx, tenantId, ownerContactId, 'COOWNER');
        }

        const createdLot = await tx.syndicateLot.create({
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
        await syncLotActivationsTx(tx, tenantId, { syndicateLotIds: [createdLot.id] });
        return createdLot;
      });
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'P2002' || error instanceof ConflictError) {
        // Numéro déjà pris dans la copropriété : le bien est écarté, pas d'échec global.
        skipped.push({
          propertyId: property.id,
          reason: t(isPropertyLinkViolation(error) ? PROPERTY_ALREADY_LINKED_MESSAGE : LOT_NUMBER_DUPLICATE_MESSAGE)
        });
        continue;
      }
      if (!(error instanceof QuotaExceededError)) throw error;
      skipped.push({ propertyId: property.id, reason: t(LOT_QUOTA_REACHED_REASON) });
      continue;
    }

    created.push({
      lotId: lot.id,
      propertyId: property.id,
      lotNumber,
      sourceBuildingId: property.containerParentId ?? null
    });
  }

  await syncSyndicateLotCount(prisma, tenantId, syndicateId);

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

/**
 * Un lot désactivé, supprimé ou dont les tantièmes changent ne doit plus
 * figurer dans la répartition déjà calculée des budgets non clôturés : sans
 * cela, le prochain appel budgétaire réutilise l'ancienne répartition (le lot
 * y est encore appelé et la somme des parts ne vaut plus le budget).
 */
async function refreshOpenBudgetAllocations(tenantId: string, syndicateId: string) {
  const budgets = await prisma.syndicateBudget.findMany({
    where: { syndicateId, status: { not: 'CLOSED' }, allocations: { some: {} } },
    select: { id: true }
  });
  for (const budget of budgets) {
    try {
      await recomputeBudgetAllocationsByBudget(tenantId, syndicateId, budget.id);
    } catch (error) {
      // Plus aucun lot, budget clôturé entre-temps : rien à répartir.
      if (!(error instanceof AppError)) throw error;
      logger.warn('Budget allocations not refreshed after lot change', { tenantId, syndicateId, budgetId: budget.id });
    }
  }
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
    select: { id: true, propertyId: true }
  });

  if (!existing) {
    throw notFound('Lot introuvable ou inaccessible');
  }

  if (data.lotNumber !== undefined) {
    data = { ...data, lotNumber: normalizeLotNumber(data.lotNumber) };
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

  const updated = await prisma
    .$transaction(async tx => {
      if (data.lotNumber !== undefined) {
        await assertLotNumberAvailable(tx, syndicateId, data.lotNumber, lotId);
      }
      if (data.coownerId) {
        await ensureCrmRoleForContact(tx, tenantId, data.coownerId, 'COOWNER');
      }

      const updatedLot = await tx.syndicateLot.update({
        where: { id: lotId },
        data: {
          ...(Object.prototype.hasOwnProperty.call(data, 'propertyId') ? { propertyId: data.propertyId ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(data, 'coownerId')
            ? { coownerId: data.coownerId ?? null, ownerContactId: data.coownerId ?? null }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(data, 'lotNumber') ? { lotNumber: data.lotNumber } : {}),
          ...(Object.prototype.hasOwnProperty.call(data, 'lotType') ? { lotType: data.lotType } : {}),
          ...(Object.prototype.hasOwnProperty.call(data, 'tantiemes')
            ? { generalShares: data.tantiemes !== undefined ? Math.round(data.tantiemes) : undefined }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(data, 'isParkingIncluded')
            ? { specialShares: data.isParkingIncluded ? Math.round(data.tantiemes ?? 0) : null }
            : {})
        }
      });
      // Type de lot ou bien rattache modifies : le lot entre, sort ou change de cle (D2).
      // Tantiemes modifies : un lot ramene a 0 sort de la reserve (et y revient s'il retrouve des tantiemes).
      if (
        data.lotType !== undefined ||
        data.tantiemes !== undefined ||
        Object.prototype.hasOwnProperty.call(data, 'propertyId')
      ) {
        await syncLotActivationsTx(tx, tenantId, {
          syndicateLotIds: [lotId],
          propertyIds: [existing.propertyId, updatedLot.propertyId]
        });
      }
      return updatedLot;
    })
    .catch(rethrowLotNumberRace);
  if (data.tantiemes !== undefined) {
    await refreshOpenBudgetAllocations(tenantId, syndicateId);
  }
  return updated;
}

/**
 * BUG-2026-09-30-078 : suppression d'un lot saisi par erreur. Refusee (409) des
 * qu'il porte un mouvement — appel de charges, paiement, recu, ecriture, vote,
 * incident, relance... — car l'historique doit rester intact : on propose alors
 * de le DESACTIVER (tantiemes a 0 : exclu de la cle de repartition, de la
 * reserve de lots et des appels futurs, mais conserve). Sans mouvement, le lot
 * et ses rattachements vides sont supprimes et la place est liberee dans la
 * jauge LOTS (`syncLotActivationsTx`).
 */
export async function deleteSyndicateLotByTenant(tenantId: string, syndicateId: string, lotId: string) {
  const existing = await prisma.syndicateLot.findFirst({
    where: { id: lotId, syndicateId, syndicate: { tenantId } },
    select: { id: true, propertyId: true, lotNumber: true }
  });
  if (!existing) {
    throw notFound('Lot introuvable ou inaccessible');
  }

  const deleted = await prisma.$transaction(async tx => {
    await lockLotTx(tx, lotId);
    const counts = await Promise.all([
      tx.chargeCall.count({ where: { lotId } }),
      tx.chargePayment.count({ where: { lotId } }),
      tx.syndicChargeReceipt.count({ where: { lotId } }),
      tx.journalEntryLine.count({ where: { lotId } }),
      tx.gMVote.count({ where: { lotId } }),
      tx.syndicateIncident.count({ where: { lotId } }),
      tx.incidentCostImputation.count({ where: { lotId } }),
      tx.paymentReminder.count({ where: { lotId } }),
      tx.latePaymentPenalty.count({ where: { lotId } }),
      tx.paymentSchedule.count({ where: { lotId } }),
      tx.ownerAccountTransaction.count({ where: { account: { lotId } } })
    ]);
    if (counts.some(count => count > 0)) {
      const message = `Le lot ${existing.lotNumber} a des mouvements (appels de charges, paiements, reçus…) : il ne peut pas être supprimé. Désactivez-le pour l'exclure de la clé de répartition et des appels futurs.`;
      throw new ConflictError(message, [{ field: 'lotId', message }]);
    }

    // Aucun mouvement : les rattachements restants (repartitions de budget,
    // profils, compte vide du lot) partent avec lui.
    await tx.budgetAllocation.deleteMany({ where: { lotId } });
    await tx.lotOwnerProfile.deleteMany({ where: { lotId } });
    await tx.lotTenantProfile.deleteMany({ where: { lotId } });
    await tx.lotTenantAssignment.deleteMany({ where: { lotId } });
    await tx.ownerAccount.deleteMany({ where: { lotId } });
    await tx.syndicateLot.delete({ where: { id: lotId } });

    await syncSyndicateLotCount(tx, tenantId, syndicateId);
    await syncLotActivationsTx(
      tx,
      tenantId,
      { syndicateLotIds: [lotId], propertyIds: existing.propertyId ? [existing.propertyId] : [] },
      { reason: 'LOT_DELETED' }
    );
    return { id: lotId };
  });
  await refreshOpenBudgetAllocations(tenantId, syndicateId);
  return deleted;
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

type ChargeCallListFilters = {
  period?: string;
  status?: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  range?: DateRangeInput;
  pagination?: PaginationInput;
};

/**
 * Filtre commun de la liste des appels de charges et de sa synthese : la
 * synthese (cartes de l'ecran) doit porter sur le MEME ensemble que la liste,
 * toutes pages confondues, jamais sur la page courante.
 */
function buildChargeCallListWhere(
  tenantId: string,
  syndicateId: string,
  filters: ChargeCallListFilters | undefined,
  now: Date
): Prisma.ChargeCallWhereInput {
  // Le statut OVERDUE n'est jamais stocke (voir deriveChargeCallStatus,
  // finance-utils.ts) : un filtre demandant ce statut doit donc reprendre la
  // meme regle (echeance passee, solde non solde) plutot que de chercher une
  // valeur qui n'existe jamais en base ; a l'inverse, un filtre PENDING/PARTIAL
  // exclut ce qui serait maintenant derive OVERDUE, pour rester coherent avec
  // ce que l'ecran affichera.
  let statusWhere: Prisma.ChargeCallWhereInput = {};
  if (filters?.status === 'OVERDUE') {
    statusWhere = { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: now } };
  } else if (filters?.status === 'PENDING' || filters?.status === 'PARTIAL') {
    statusWhere = { status: filters.status, dueDate: { gte: now } };
  } else if (filters?.status === 'PAID') {
    statusWhere = { status: 'PAID' };
  }

  const rangeWhere = buildDateRangeFilter('dueDate', filters?.range);
  const combinedConditions: Prisma.ChargeCallWhereInput[] = [];
  if (Object.keys(statusWhere).length > 0) combinedConditions.push(statusWhere);
  if (Object.keys(rangeWhere).length > 0) combinedConditions.push(rangeWhere);

  return {
    syndicateId,
    syndicate: {
      tenantId
    },
    ...(filters?.period ? { period: filters.period } : {}),
    ...(combinedConditions.length > 0 ? { AND: combinedConditions } : {})
  };
}

/**
 * Synthese des appels de charges filtres (agregat serveur sur TOUS les appels,
 * pas sur la page courante) : montant appele, dossiers en attente (en attente
 * ou partiels, echeance non depassee) et dossiers en retard (non soldes,
 * echeance passee) — memes definitions que `deriveChargeCallStatus`.
 */
export async function summarizeChargeCallsBySyndicate(
  tenantId: string,
  syndicateId: string,
  filters?: Omit<ChargeCallListFilters, 'pagination'>
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const now = new Date();
  const where = buildChargeCallListWhere(tenantId, syndicateId, filters, now);

  const [totals, pendingCount, overdueCount] = await Promise.all([
    prisma.chargeCall.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
    prisma.chargeCall.count({
      where: { AND: [where, { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: now }, amount: { gt: 0 } }] }
    }),
    prisma.chargeCall.count({
      where: { AND: [where, { status: { not: 'PAID' }, dueDate: { lt: now }, amount: { gt: 0 } }] }
    })
  ]);

  return {
    totalCount: totals._count._all,
    totalAmount: roundMoney(Number(totals._sum.amount ?? 0)),
    pendingCount,
    overdueCount
  };
}

export async function listChargeCallsBySyndicate(
  tenantId: string,
  syndicateId: string,
  filters?: ChargeCallListFilters
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const pager = buildPagination(filters?.pagination);
  const now = new Date();

  const calls = await prisma.chargeCall.findMany({
    where: buildChargeCallListWhere(tenantId, syndicateId, filters, now),
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
      ...CHARGE_CALL_ALLOCATIONS_INCLUDE
    },
    skip: pager.skip,
    take: pager.take,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }]
  });

  // Lot S2 : `payments` est reconstitue a partir des affectations (voir withAllocationPayments).
  return calls.map(call => ({
    ...withAllocationPayments(call),
    status: deriveChargeCallStatus(call.status, call.dueDate, now)
  }));
}

export async function getChargeCallByTenant(tenantId: string, syndicateId: string, chargeCallId: string) {
  const call = await prisma.chargeCall.findFirst({
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
      ...CHARGE_CALL_ALLOCATIONS_INCLUDE,
      syndicate: true
    }
  });

  if (!call) {
    return call;
  }

  return { ...withAllocationPayments(call), status: deriveChargeCallStatus(call.status, call.dueDate) };
}

/**
 * Lot S2 : cree UN appel de charges pour un lot, dans la transaction de
 * l'appelant : bornes de periode, debit au grand livre du lot, puis
 * imputation de l'avance du lot (aucun mouvement de grand livre). L'appel est
 * relu si l'avance l'a touche, pour que son statut soit a jour AVANT toute
 * notification.
 *
 * Le verrou du lot est pris avant le debit : meme ordre (lot, puis compte)
 * que `recordLotPaymentTx`, donc pas d'interblocage avec un paiement
 * concurrent sur le meme lot.
 *
 * Lot S3 : chaque appel que l'avance vient de solder recoit sa quittance,
 * dans la meme transaction ; les documents emis sont ajoutes a `issued`,
 * que l'appelant livre (PDF, e-mail) apres le commit.
 *
 * Fonds : les parts de l'avance imputee sont AJOUTEES a `fundCredits`, sans
 * crediter ; l'appelant appelle `creditFundsForAllocationsTx` une seule fois,
 * apres le dernier verrou de lot de sa transaction (voir `fund-credits.ts`).
 */
async function createLotChargeCallTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  data: {
    syndicateId: string;
    lotId: string;
    batchId?: string;
    period: string;
    bounds: PeriodBounds | null;
    amount: number;
    currency: string;
    dueDate: Date;
    /** Fonds qui recoit en entier ce qui est paye sur l'appel (verifie par l'appelant). */
    fundId?: string | null;
  },
  issued: IssuedChargeDocument[],
  fundCredits: FundCreditItem[]
) {
  await lockLotTx(tx, data.lotId);
  const chargeCall = await tx.chargeCall.create({
    data: {
      syndicateId: data.syndicateId,
      lotId: data.lotId,
      ...(data.batchId ? { batchId: data.batchId } : {}),
      ...(data.fundId ? { fundId: data.fundId } : {}),
      period: data.period,
      periodStart: data.bounds?.start ?? null,
      periodEnd: data.bounds?.end ?? null,
      amount: data.amount,
      currency: data.currency,
      dueDate: data.dueDate
    }
  });

  const account = await ensureOwnerAccountForLotTx(tx, tenantId, data.syndicateId, data.lotId);
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

  const application = await applyLotAdvanceTx(tx, data.lotId);
  fundCredits.push(...application.fundCredits);
  issued.push(
    ...(await issueQuittancesAfterAdvanceTx(tx, {
      tenantId,
      syndicateId: data.syndicateId,
      lotId: data.lotId,
      imputedCallIds: application.imputations.map(imputation => imputation.chargeCallId)
    }))
  );
  if (application.imputations.some(imputation => imputation.chargeCallId === chargeCall.id)) {
    return (await tx.chargeCall.findUnique({ where: { id: chargeCall.id } })) ?? chargeCall;
  }
  return chargeCall;
}

export async function createChargeCallAndUpdateStatus(
  tenantId: string,
  data: {
    syndicateId: string;
    lotId?: string;
    lotIds?: string[];
    applyToAllLots?: boolean;
    period: string;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    amount: number;
    currency: string;
    dueDate: Date;
    /** Appel verse en entier a ce fonds (appel de fonds travaux). */
    fundId?: string | null;
    /** Auteur des credits de fonds nes de l'imputation d'avance. */
    actorUserId?: string | null;
    isRecurring?: boolean;
    recurrenceFrequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
    recurrenceCount?: number;
  }
): Promise<any> {
  if (data.fundId) {
    const fund = await assertFundOfSyndicate(prisma, tenantId, data.syndicateId, data.fundId);
    assertFundCurrency(fund, data.currency);
  }
  const isSimpleSingleCall =
    !data.applyToAllLots &&
    (!data.lotIds || data.lotIds.length === 0) &&
    Boolean(data.lotId) &&
    (!data.isRecurring || (data.recurrenceCount ?? 1) <= 1);
  // Lot S2 : bornes fournies, sinon deduites du libelle (meme analyseur que la migration).
  const baseBounds = resolvePeriodBounds(data);

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

    const issued: IssuedChargeDocument[] = [];
    const chargeCall = await prisma.$transaction(async tx => {
      const fundCredits: FundCreditItem[] = [];
      const created = await createLotChargeCallTx(
        tx,
        tenantId,
        {
          syndicateId: data.syndicateId,
          lotId: data.lotId!,
          period: data.period,
          bounds: baseBounds,
          amount: data.amount,
          currency: data.currency,
          dueDate: data.dueDate,
          fundId: data.fundId ?? null
        },
        issued,
        fundCredits
      );
      await creditFundsForAllocationsTx(tx, { items: fundCredits, actorUserId: data.actorUserId ?? null });
      return created;
    });
    scheduleChargeDocumentDelivery(tenantId, issued);
    return chargeCall;
  }

  await assertSyndicateTenantOwnership(tenantId, data.syndicateId);

  const targetLotIds = data.applyToAllLots
    ? (
        await prisma.syndicateLot.findMany({
          where: {
            syndicateId: data.syndicateId,
            syndicate: { tenantId },
            // Lot sans tantieme (desactive) : pas d'appel futur (BUG-078).
            generalShares: { gt: 0 }
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

  // Verrous consultatifs par lot pris dans un ordre GLOBAL (identifiant croissant) :
  // deux creations concurrentes sur [L7, L3] et [L3, L7] s'interbloqueraient sinon.
  const lotIdsInLockOrder = sortLotIdsForLocking(targetLotIds);

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

  // Lot S2 : chaque occurrence decale les bornes de la periode de base.
  const resolveBounds = (index: number) =>
    baseBounds ? shiftPeriodBounds(baseBounds, index * recurrenceStepMonths(recurrenceFrequency)) : null;

  type CreatedChargeCall = Awaited<ReturnType<typeof createLotChargeCallTx>>;
  const createdChargeCalls: CreatedChargeCall[] = [];

  for (let occurrenceIndex = 0; occurrenceIndex < recurrenceCount; occurrenceIndex += 1) {
    const dueDate = addRecurrence(data.dueDate, occurrenceIndex);
    const period = resolvePeriodLabel(occurrenceIndex);
    const bounds = resolveBounds(occurrenceIndex);

    const issued: IssuedChargeDocument[] = [];
    await prisma.$transaction(async tx => {
      const fundCredits: FundCreditItem[] = [];
      for (const lotId of lotIdsInLockOrder) {
        const chargeCall = await createLotChargeCallTx(
          tx,
          tenantId,
          {
            syndicateId: data.syndicateId,
            lotId,
            period,
            bounds,
            amount: data.amount,
            currency: data.currency,
            dueDate,
            fundId: data.fundId ?? null
          },
          issued,
          fundCredits
        );
        createdChargeCalls.push(chargeCall);
      }
      // Tous les lots sont verrouilles : les fonds se prennent maintenant, en une vague.
      await creditFundsForAllocationsTx(tx, { items: fundCredits, actorUserId: data.actorUserId ?? null });
    });
    scheduleChargeDocumentDelivery(tenantId, issued);
  }

  return {
    chargeCalls: createdChargeCalls,
    generatedLots: targetLotIds.length,
    occurrences: recurrenceCount,
    totalCreated: createdChargeCalls.length
  };
}

/**
 * Paiement d'un appel designe (route historique `.../charges/:chargeId/pay`).
 *
 * Lot S2 : passe par `recordLotPaymentTx` avec cet appel en premier ; le
 * trop-percu n'est plus refuse (ancien 422) : l'excedent s'impute sur les
 * autres appels ouverts du lot, les plus anciens d'abord, puis reste en
 * avance du lot. La reponse garde les champs du paiement et ajoute
 * `allocations`, `advance` et `lotAdvanceBalance`.
 */
export async function recordChargePaymentWithStatusUpdate(
  tenantId: string,
  data: {
    chargeCallId: string;
    amount: number;
    paidAt: Date;
    method?: string | null;
    reference?: string | null;
    syndicateId?: string;
    actorUserId?: string | null;
  }
) {
  const { response, documents } = await prisma.$transaction(async tx => {
    const call = await tx.chargeCall.findFirst({
      where: {
        id: data.chargeCallId,
        ...(data.syndicateId ? { syndicateId: data.syndicateId } : {}),
        syndicate: {
          tenantId
        }
      },
      select: { id: true, lotId: true, syndicateId: true }
    });

    if (!call) {
      throw notFound('Appel de charges introuvable ou inaccessible');
    }

    const { record, result } = await recordLotPaymentTx(tx, {
      tenantId,
      syndicateId: call.syndicateId,
      lotId: call.lotId,
      amount: data.amount,
      paidAt: data.paidAt,
      method: data.method ?? null,
      reference: data.reference ?? null,
      chargeCallIds: [call.id],
      actorUserId: data.actorUserId ?? null
    });

    // Lot S3 : recu et quittances de ce paiement, dans la meme transaction.
    const issued = await issueReceiptsForPaymentTx(tx, {
      tenantId,
      syndicateId: call.syndicateId,
      lotId: call.lotId,
      paymentId: record.id,
      result,
      actorUserId: data.actorUserId ?? null
    });

    return {
      documents: issued,
      response: {
        ...record,
        allocations: result.allocations,
        advance: result.advance,
        lotAdvanceBalance: result.lotAdvanceBalance,
        documents: toDocumentRefs(issued)
      }
    };
  });
  scheduleChargeDocumentDelivery(tenantId, documents);
  return response;
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

/** Champs d'un contact CRM exposes dans une assemblee (mandant, mandataire). */
const MEETING_CONTACT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  legalName: true,
  email: true
} as const;

/**
 * `LotOwnerProfile.ownershipPercentage` est un `Prisma.Decimal` : converti en
 * `number` ici (frontiere Prisma), pour que `lib/syndics/meeting-voters.ts`
 * reste un module pur sans dependance a Prisma.
 */
function normalizeOwnerProfilesForVoters(
  profiles: Array<{
    contactId: string;
    ownershipPercentage: unknown;
    ownedSince: Date;
    ownedUntil: Date | null;
    contact: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      legalName: string | null;
      email: string | null;
    };
  }>
): LotOwnerProfileForVoters[] {
  return profiles.map(profile => ({
    ...profile,
    ownershipPercentage: Number(profile.ownershipPercentage)
  }));
}

/**
 * Une assemblee cloturee ou annulee est figee : plus de vote, de resolution ni
 * de pouvoir. Messages fixes (le texte francais sert de cle de traduction).
 */
function assertMeetingOpenForChanges(status: string, messages: { COMPLETED: string; CANCELLED: string }) {
  if (status === 'COMPLETED' || status === 'CANCELLED') {
    throw conflict(messages[status]);
  }
}

/**
 * Transitions de statut autorisees (data-model, GeneralMeeting) :
 * planifiee -> en cours -> cloturee, et planifiee -> annulee. Toute autre
 * transition leve un 409 avec la raison.
 */
const MEETING_STATUS_TRANSITIONS: Record<string, string[]> = {
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: []
};

function meetingTransitionErrorMessage(from: string, to: string): string {
  if (from === 'COMPLETED') return 'Assemblee cloturee : son statut ne peut plus changer';
  if (from === 'CANCELLED') return 'Assemblee annulee : son statut ne peut plus changer';
  if (from === 'PLANNED' && to === 'COMPLETED') return "La seance doit etre ouverte avant d'etre cloturee";
  if (from === 'IN_PROGRESS' && to === 'CANCELLED') {
    return 'Une seance en cours ne peut pas etre annulee : cloturez-la';
  }
  if (from === 'IN_PROGRESS' && to === 'PLANNED') return 'Une seance ouverte ne peut pas redevenir planifiee';
  return "Transition de statut d'assemblee impossible";
}

/**
 * Profils de propriete d'un lot, tels que necessaires a `votersAt` /
 * `toMajorityLotsAt` : `select` minimal — jamais `portalAccessToken` ni le
 * reste de `LotOwnerProfile` dans une reponse (ecart recette, lot
 * syndic-ecarts T2).
 */
const LOT_OWNER_PROFILE_SELECT_FOR_VOTERS = {
  contactId: true,
  ownershipPercentage: true,
  ownedSince: true,
  ownedUntil: true,
  contact: { select: MEETING_CONTACT_SELECT }
} as const;

export async function getMeetingByTenant(tenantId: string, syndicateId: string, meetingId: string) {
  const meeting = await prisma.generalMeeting.findFirst({
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
              owner: true,
              ownerProfiles: { select: LOT_OWNER_PROFILE_SELECT_FOR_VOTERS }
            }
          }
        }
      },
      agendaItems: {
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }]
      },
      resolutions: {
        orderBy: { createdAt: 'asc' },
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
      proxies: {
        orderBy: { createdAt: 'asc' },
        include: {
          grantor: { select: MEETING_CONTACT_SELECT },
          representative: { select: MEETING_CONTACT_SELECT }
        }
      }
    }
  });

  if (!meeting) {
    return meeting;
  }

  // Ecart recette (lot syndic-ecarts, T2) : le votant d'un lot est son
  // proprietaire A LA DATE DE L'AG (`scheduledAt`), pas le proprietaire
  // actuel — voir `lib/syndics/meeting-voters.ts`. Les lots transformes
  // (cle du coproprietaire a la date) alimentent le decompte en tantiemes
  // (article 26 notamment), tandis que `voters` (expose sur chaque lot) est
  // la liste nommee, pour l'affichage et le compte-rendu.
  const rawLots = meeting.syndicate?.lots ?? [];
  const profilesByLotId = new Map<string, LotOwnerProfileForVoters[]>(
    rawLots.map(lot => [lot.id, normalizeOwnerProfilesForVoters(lot.ownerProfiles ?? [])])
  );
  const lots: MajorityLot[] = toMajorityLotsAt(rawLots, profilesByLotId, meeting.scheduledAt);
  const lotsWithVoters = rawLots.map(lot => {
    // Retire du champ expose (jamais `portalAccessToken`) : remplace par `voters` ci-dessous.
    const { ownerProfiles: _ownerProfiles, ...lotFields } = lot;
    return {
      ...lotFields,
      voters: votersAt(lot, profilesByLotId.get(lot.id) ?? [], meeting.scheduledAt)
    };
  });

  return {
    ...meeting,
    syndicate: meeting.syndicate ? { ...meeting.syndicate, lots: lotsWithVoters } : meeting.syndicate,
    attendance: computeMeetingAttendance(
      lots,
      meeting.resolutions.flatMap(resolution => resolution.votes)
    ),
    resolutions: meeting.resolutions.map(resolution => ({
      ...resolution,
      tally: computeResolutionTally(resolution.majorityRule, lots, resolution.votes)
    }))
  };
}

/** Assemblee de l'agence, ou 404 identique a une assemblee inexistante. */
async function findMeetingForTenant(
  client: PrismaTransactionClient,
  tenantId: string,
  syndicateId: string,
  meetingId: string
) {
  const meeting = await client.generalMeeting.findFirst({
    where: {
      id: meetingId,
      syndicateId,
      syndicate: {
        tenantId
      }
    },
    select: { id: true, status: true, startTime: true, endTime: true, scheduledAt: true }
  });

  if (!meeting) {
    throw notFound('Assemblee generale introuvable ou inaccessible');
  }

  return meeting;
}

/**
 * Recalcule les compteurs et le resultat de chaque resolution de l'assemblee,
 * puis le quorum (tantiemes des lots ayant vote / tantiemes totaux).
 */
async function recomputeMeetingResultsTx(
  tx: PrismaTransactionClient,
  syndicateId: string,
  meetingId: string,
  scheduledAt: Date
) {
  // Ecart recette (lot syndic-ecarts, T2) : le resultat stocke doit suivre la
  // meme regle que la lecture (`getMeetingByTenant`) — le votant d'un lot est
  // son proprietaire a la date de l'AG (`scheduledAt`), pas le proprietaire
  // actuel. La date est fournie par l'appelant (deja lue via
  // `findMeetingForTenant` ou equivalent) pour eviter une lecture Prisma
  // redondante dans la transaction.
  const rawLots = await tx.syndicateLot.findMany({
    where: { syndicateId },
    select: {
      id: true,
      generalShares: true,
      coownerId: true,
      ownerContactId: true,
      owner: { select: MEETING_CONTACT_SELECT },
      ownerProfiles: { select: LOT_OWNER_PROFILE_SELECT_FOR_VOTERS }
    }
  });
  const profilesByLotId = new Map<string, LotOwnerProfileForVoters[]>(
    rawLots.map(lot => [lot.id, normalizeOwnerProfilesForVoters(lot.ownerProfiles ?? [])])
  );
  const lots: MajorityLot[] = toMajorityLotsAt(rawLots, profilesByLotId, scheduledAt);
  const resolutions = await tx.gMResolution.findMany({
    where: { meetingId },
    select: { id: true, majorityRule: true, votes: { select: { lotId: true, vote: true } } }
  });

  for (const resolution of resolutions) {
    const tally = computeResolutionTally(resolution.majorityRule, lots, resolution.votes);
    await tx.gMResolution.update({
      where: { id: resolution.id },
      data: {
        result: tally.result,
        votesFor: tally.votesFor,
        votesAgainst: tally.votesAgainst,
        votesAbstain: tally.votesAbstain,
        sharesFor: tally.sharesFor
      }
    });
  }

  const attendance = computeMeetingAttendance(
    lots,
    resolutions.flatMap(resolution => resolution.votes)
  );
  await tx.generalMeeting.update({
    where: { id: meetingId },
    data: { quorum: attendance.quorumPercent }
  });
}

export async function updateMeetingByTenant(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  data: {
    startTime?: Date | null;
    endTime?: Date | null;
    location?: string | null;
    status?: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  }
) {
  const has = (key: keyof typeof data) => Object.prototype.hasOwnProperty.call(data, key);

  return prisma.$transaction(async tx => {
    const existing = await findMeetingForTenant(tx, tenantId, syndicateId, meetingId);

    const statusChange: Record<string, unknown> = {};
    if (data.status && data.status !== existing.status) {
      if (!MEETING_STATUS_TRANSITIONS[existing.status]?.includes(data.status)) {
        throw conflict(meetingTransitionErrorMessage(existing.status, data.status));
      }
      statusChange.status = data.status;
      // L'ouverture et la cloture horodatent la seance si l'heure n'a pas ete saisie.
      const now = new Date();
      if (data.status === 'IN_PROGRESS' && !existing.startTime && !has('startTime')) {
        statusChange.startTime = now;
      }
      if (data.status === 'COMPLETED' && !existing.endTime && !has('endTime')) {
        statusChange.endTime = now;
      }
      // A la cloture, les resultats sont recalcules une derniere fois puis figes.
      if (data.status === 'COMPLETED') {
        await recomputeMeetingResultsTx(tx, syndicateId, meetingId, existing.scheduledAt);
      }
    }

    return tx.generalMeeting.update({
      where: { id: meetingId },
      data: {
        ...(has('startTime') ? { startTime: data.startTime ?? null } : {}),
        ...(has('endTime') ? { endTime: data.endTime ?? null } : {}),
        ...(has('location') ? { location: data.location ?? null } : {}),
        ...statusChange
      }
    });
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
  const meeting = await findMeetingForTenant(prisma, tenantId, syndicateId, data.meetingId);
  assertMeetingOpenForChanges(meeting.status, {
    COMPLETED: "Assemblee cloturee : impossible d'ajouter une resolution",
    CANCELLED: "Assemblee annulee : impossible d'ajouter une resolution"
  });

  return prisma.gMResolution.create({
    data: {
      ...data,
      // Code de regle stable (ARTICLE_24…) ; un texte libre reste accepte et vaut l'article 24.
      majorityRule: data.majorityRule?.trim() || DEFAULT_MAJORITY_RULE
    }
  });
}

export async function castVoteAndRecomputeResolutionCounters(
  tenantId: string,
  syndicateId: string,
  resolutionId: string,
  lotId: string,
  vote: 'FOR' | 'AGAINST' | 'ABSTAIN'
) {
  const meetingId = await prisma.$transaction(async tx => {
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
        meeting: { select: { id: true, status: true, scheduledAt: true } }
      }
    });

    if (!resolution) {
      throw notFound('Resolution introuvable ou inaccessible');
    }

    assertMeetingOpenForChanges(resolution.meeting.status, {
      COMPLETED: 'Assemblee cloturee : les votes sont figes',
      CANCELLED: 'Assemblee annulee : aucun vote possible'
    });

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

    // Resultat recalcule a chaque vote, en tantiemes, selon la regle de la
    // resolution (voir meeting-majority.ts) ; quorum recalcule sur l'assemblee.
    await recomputeMeetingResultsTx(tx, syndicateId, resolution.meeting.id, resolution.meeting.scheduledAt);

    return resolution.meeting.id;
  });

  // Relu apres la validation de la transaction : lu depuis le client global a
  // l'interieur, le detail ne voyait pas encore le vote qui venait d'etre saisi.
  return getMeetingByTenant(tenantId, syndicateId, meetingId);
}

export async function listMeetingProxiesByTenant(tenantId: string, syndicateId: string, meetingId: string) {
  await findMeetingForTenant(prisma, tenantId, syndicateId, meetingId);

  return prisma.gMProxy.findMany({
    where: { meetingId },
    orderBy: { createdAt: 'asc' },
    include: {
      grantor: { select: MEETING_CONTACT_SELECT },
      representative: { select: MEETING_CONTACT_SELECT }
    }
  });
}

/**
 * Pouvoir (mandat) d'AG. Regles :
 * - mandant et mandataire sont des contacts CRM de l'agence ;
 * - le mandant est coproprietaire d'au moins un lot de la copropriete ;
 * - le mandataire n'est pas le mandant ;
 * - un seul pouvoir par mandant et par assemblee (controle applicatif, aucun
 *   index unique en base) ;
 * - assemblee ni cloturee ni annulee.
 */
export async function createMeetingProxyByTenant(
  tenantId: string,
  syndicateId: string,
  data: { meetingId: string; grantorContactId: string; representativeContactId: string }
) {
  return prisma.$transaction(async tx => {
    const meeting = await findMeetingForTenant(tx, tenantId, syndicateId, data.meetingId);
    assertMeetingOpenForChanges(meeting.status, {
      COMPLETED: 'Assemblee cloturee : les pouvoirs ne peuvent plus etre modifies',
      CANCELLED: 'Assemblee annulee : les pouvoirs ne peuvent plus etre modifies'
    });

    if (data.grantorContactId === data.representativeContactId) {
      throw unprocessableEntity('Le mandataire ne peut pas etre le mandant');
    }

    // Un contact d'une autre agence leve la meme 404 qu'un contact inexistant.
    await assertBelongsToTenant(tx, 'crmContact', data.grantorContactId, tenantId, {
      message: 'Contact introuvable ou inaccessible'
    });
    await assertBelongsToTenant(tx, 'crmContact', data.representativeContactId, tenantId, {
      message: 'Contact introuvable ou inaccessible'
    });

    const grantorLot = await tx.syndicateLot.findFirst({
      where: {
        syndicateId,
        syndicate: { tenantId },
        OR: [{ coownerId: data.grantorContactId }, { ownerContactId: data.grantorContactId }]
      },
      select: { id: true }
    });
    if (!grantorLot) {
      throw unprocessableEntity("Le mandant doit etre coproprietaire d'au moins un lot de la copropriete");
    }

    const duplicate = await tx.gMProxy.findFirst({
      where: { meetingId: data.meetingId, grantorContactId: data.grantorContactId },
      select: { id: true }
    });
    if (duplicate) {
      throw conflict('Ce coproprietaire a deja donne un pouvoir pour cette assemblee');
    }

    return tx.gMProxy.create({
      data: {
        meetingId: data.meetingId,
        grantorContactId: data.grantorContactId,
        representativeContactId: data.representativeContactId
      },
      include: {
        grantor: { select: MEETING_CONTACT_SELECT },
        representative: { select: MEETING_CONTACT_SELECT }
      }
    });
  });
}

export async function deleteMeetingProxyByTenant(
  tenantId: string,
  syndicateId: string,
  meetingId: string,
  proxyId: string
) {
  const meeting = await findMeetingForTenant(prisma, tenantId, syndicateId, meetingId);

  const proxy = await prisma.gMProxy.findFirst({
    where: { id: proxyId, meetingId: meeting.id },
    select: { id: true }
  });
  if (!proxy) {
    throw notFound('Pouvoir introuvable ou inaccessible');
  }

  assertMeetingOpenForChanges(meeting.status, {
    COMPLETED: 'Assemblee cloturee : les pouvoirs ne peuvent plus etre modifies',
    CANCELLED: 'Assemblee annulee : les pouvoirs ne peuvent plus etre modifies'
  });

  return prisma.gMProxy.delete({ where: { id: proxy.id } });
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

/**
 * Creation d'un prestataire, rattache a l'agence (ecart recette #2, FR-010).
 * `ServiceProvider` n'est pas lie a une copropriete : le prestataire cree ici
 * est visible depuis n'importe quelle copropriete de l'agence, comme
 * `listServiceProvidersBySyndicate` (au-dessus) le fait deja pour la lecture.
 */
function providerNameConflict(name: string): ConflictError {
  const message = `Un prestataire nommé « ${name} » existe déjà dans votre agence.`;
  return new ConflictError(message, [{ field: 'name', message }]);
}

/**
 * BUG-2026-09-30-059 : le nom d'un prestataire est unique dans l'agence, sans
 * égard à la casse ni aux espaces de bord — comme pour les prestataires de
 * maintenance (même table `service_providers`). L'index unique
 * `service_providers_tenant_name_uniq` tient la règle face à deux requêtes
 * concurrentes (P2002, même réponse 409).
 */
async function assertProviderNameAvailable(tenantId: string, name: string, excludeProviderId?: string) {
  const duplicate = await prisma.serviceProvider.findFirst({
    where: {
      tenantId,
      name: { equals: name, mode: 'insensitive' },
      ...(excludeProviderId ? { id: { not: excludeProviderId } } : {})
    },
    select: { id: true }
  });
  if (duplicate) throw providerNameConflict(name);
}

export async function createServiceProvider(
  tenantId: string,
  data: { name: string; specialty?: string; email?: string; phone?: string }
) {
  const name = data.name.trim();
  await assertProviderNameAvailable(tenantId, name);
  try {
    return await prisma.serviceProvider.create({
      data: {
        tenantId,
        name,
        specialty: data.specialty,
        email: data.email,
        phone: data.phone
      }
    });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'P2002') throw providerNameConflict(name);
    throw error;
  }
}

export async function updateServiceProviderByTenant(
  tenantId: string,
  providerId: string,
  data: { name?: string; specialty?: string | null; email?: string | null; phone?: string | null }
) {
  const existing = await prisma.serviceProvider.findFirst({
    where: { id: providerId, tenantId },
    select: { id: true }
  });

  if (!existing) {
    throw notFound('Prestataire introuvable ou inaccessible');
  }

  const name = data.name?.trim();
  if (name !== undefined) await assertProviderNameAvailable(tenantId, name, providerId);

  try {
    return await prisma.serviceProvider.update({
      where: { id: providerId },
      data: { ...data, ...(name !== undefined ? { name } : {}) }
    });
  } catch (error) {
    if (name !== undefined && (error as { code?: string } | null)?.code === 'P2002') throw providerNameConflict(name);
    throw error;
  }
}

/**
 * Refuse la suppression d'un prestataire encore lie a un contrat ou un
 * incident (ecart recette #2) : le supprimer aurait laisse ces lignes
 * pointer vers un prestataire disparu sans le dire.
 */
export async function deleteServiceProviderByTenant(tenantId: string, providerId: string) {
  const existing = await prisma.serviceProvider.findFirst({
    where: { id: providerId, tenantId },
    select: { id: true }
  });

  if (!existing) {
    throw notFound('Prestataire introuvable ou inaccessible');
  }

  const [contractsCount, incidentsCount] = await Promise.all([
    prisma.maintenanceContract.count({ where: { providerId } }),
    prisma.syndicateIncident.count({ where: { providerId } })
  ]);

  if (contractsCount > 0 || incidentsCount > 0) {
    throw conflict('Ce prestataire a des contrats ou des incidents lies : il ne peut pas etre supprime.');
  }

  return prisma.serviceProvider.delete({
    where: { id: providerId }
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

/**
 * BUG-2026-09-30-059 : un contrat ACTIF du meme prestataire, de la meme nature
 * (casse et espaces ignores) et de periode qui chevauche celle d'un contrat
 * existant de la copropriete est un doublon : refus 409 explicite.
 */
async function assertNoOverlappingContract(
  syndicateId: string,
  contract: { providerId: string; nature: string; startDate: Date; endDate: Date | null }
) {
  const nature = contract.nature.trim();
  const duplicate = await prisma.maintenanceContract.findFirst({
    where: {
      syndicateId,
      providerId: contract.providerId,
      status: 'ACTIVE',
      nature: { equals: nature, mode: 'insensitive' },
      // Chevauchement : l'existant commence avant la fin du nouveau (ou sans fin) et finit apres son debut (ou sans fin).
      ...(contract.endDate ? { startDate: { lte: contract.endDate } } : {}),
      OR: [{ endDate: null }, { endDate: { gte: contract.startDate } }]
    },
    select: { id: true }
  });
  if (duplicate) {
    const message = `Un contrat « ${nature} » est déjà actif avec ce prestataire sur cette période.`;
    throw new ConflictError(message, [{ field: 'nature', message }]);
  }
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
    throw notFound('Copropriété introuvable ou inaccessible');
  }

  if (!provider) {
    throw notFound('Prestataire introuvable ou inaccessible');
  }

  await assertNoOverlappingContract(data.syndicateId, {
    providerId: data.providerId,
    nature: data.nature,
    startDate: data.startDate,
    endDate: data.endDate ?? null
  });

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
    throw notFound('Copropriété introuvable ou inaccessible');
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
  const [funds, charges, advances] = await Promise.all([
    listFundsBySyndicate(tenantId, syndicateId),
    prisma.chargeCall.findMany({
      where: {
        syndicateId,
        syndicate: {
          tenantId
        }
      },
      include: {
        allocations: { select: { amount: true } }
      }
    }),
    prisma.chargePayment.findMany({
      where: { lot: { syndicateId, syndicate: { tenantId } }, unallocatedAmount: { gt: 0 } },
      select: { unallocatedAmount: true }
    })
  ]);

  // Un appel de montant nul n'est ni du ni en retard (BUG-050).
  const overdueCharges = charges.filter(
    charge => Number(charge.amount) > 0 && deriveChargeCallStatus(charge.status, charge.dueDate) === 'OVERDUE'
  );
  const totalCalled = roundMoney(charges.reduce((sum: number, charge) => sum + Number(charge.amount), 0));
  // Lot S2 : le regle d'un appel se lit dans ses affectations ; l'avance
  // (paiements non encore affectes) est rapportee a part.
  const totalPaid = roundMoney(
    charges.reduce((sum: number, charge) => sum + paidFromAllocations(charge.allocations), 0)
  );
  const totalAdvance = fromCents(advances.reduce((sum, payment) => sum + toCents(payment.unallocatedAmount), 0));

  return {
    funds,
    totals: {
      totalFundsBalance: roundMoney(funds.reduce((sum: number, fund) => sum + Number(fund.balance), 0)),
      totalCalled,
      totalPaid,
      totalOutstanding: computeOutstanding(totalCalled, totalPaid),
      totalAdvance,
      overdueCount: overdueCharges.length,
      overdueAmount: roundMoney(
        overdueCharges.reduce((sum: number, charge) => {
          const paid = paidFromAllocations(charge.allocations);
          return sum + computeOutstanding(Number(charge.amount), paid);
        }, 0)
      )
    }
  };
}

/** Proprietaire affiche au recouvrement : celui du lot, sinon le proprietaire principal de ses profils actuels. */
function overdueOwner(lot: {
  owner?: { id: string; firstName: string | null; lastName: string | null; email: string | null } | null;
  ownerProfiles?: Array<Parameters<typeof pickPrimaryOwnerProfile>[0][number] & { contact?: any }>;
}) {
  const primary = lot.owner ?? pickPrimaryOwnerProfile(lot.ownerProfiles ?? [])?.contact ?? null;
  return primary
    ? { id: primary.id, firstName: primary.firstName, lastName: primary.lastName, email: primary.email }
    : null;
}

export async function listOverdueDashboardBySyndicate(tenantId: string, syndicateId: string) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  const now = new Date();
  const calls = await prisma.chargeCall.findMany({
    where: {
      syndicateId,
      syndicate: { tenantId },
      dueDate: { lt: now },
      // Un appel de montant nul n'est ni du ni en retard (BUG-050).
      amount: { gt: 0 },
      status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] }
    },
    include: {
      lot: {
        include: {
          owner: true,
          // Proprietaire = profils actuels du lot (meme regle que la liste et le compte, BUG-087).
          ownerProfiles: {
            select: {
              id: true,
              contactId: true,
              ownershipPercentage: true,
              ownedSince: true,
              ownedUntil: true,
              isActive: true,
              contact: { select: { id: true, firstName: true, lastName: true, legalName: true, email: true } }
            }
          },
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
      allocations: { select: { amount: true } }
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }]
  });

  const items = calls.flatMap(call => {
    const paid = paidFromAllocations(call.allocations);
    const amount = Number(call.amount);
    const outstanding = computeOutstanding(amount, paid);
    // Solde deja couvert (paiement ou avance imputee) : plus rien de du, donc pas de retard.
    if (outstanding <= 0) return [];
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
      owner: overdueOwner(call.lot),
      ...presentLotOwners(call.lot.ownerProfiles ?? []),
      dueDate: call.dueDate,
      status: deriveChargeCallStatus(call.status, call.dueDate, now),
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
      acc.lotIds.add(item.lotId);
      return acc;
    },
    { count: 0, outstanding: 0, lotIds: new Set<string>() }
  );

  return {
    items,
    totals: {
      overdueCount: totals.count,
      // « Lots en retard » : un lot compte une fois, quel que soit le nombre de ses appels impayes.
      overdueLotCount: totals.lotIds.size,
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
    include: { allocations: { select: { amount: true } } }
  });

  if (!call) {
    throw notFound('Appel de charges introuvable ou inaccessible');
  }

  const paid = paidFromAllocations(call.allocations);
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
      amount: { gt: 0 },
      status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] }
    },
    include: {
      allocations: { select: { amount: true } }
    }
  });

  return prisma.$transaction(async tx => {
    let created = 0;
    const createdReminderIds: string[] = [];

    for (const call of dueCalls) {
      // Un appel entierement couvert (paiement ou avance imputee) n'est jamais relance.
      const paid = paidFromAllocations(call.allocations);
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
    include: { allocations: { select: { amount: true } } }
  });

  if (!call) {
    throw notFound('Appel de charges introuvable ou inaccessible');
  }

  const paid = paidFromAllocations(call.allocations);
  const outstanding = computeOutstanding(Number(call.amount), paid);
  if (outstanding <= 0) {
    throw unprocessableEntity('Aucune penalite possible: appel deja solde');
  }

  const appliedAt = data.appliedAt ?? new Date();
  const dueDate = call.dueDate;
  const computedDaysLate = Math.max(0, Math.floor((appliedAt.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)));
  const daysLate = data.daysLate ?? computedDaysLate;

  const computedPenalty = computeLatePenalty(outstanding, data.penaltyRate, daysLate);
  // Un montant saisi est plafonné au reste dû, comme le calcul (computeLatePenalty).
  const penaltyAmount = Math.min(roundMoney(data.penaltyAmount ?? computedPenalty), roundMoney(outstanding));

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
    include: { allocations: { select: { amount: true } } }
  });

  if (!call) {
    throw notFound('Appel de charges introuvable ou inaccessible');
  }

  const paid = paidFromAllocations(call.allocations);
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

/**
 * Rapproche le compte d'un lot avec l'historique reel de ses appels de
 * charges et de ses paiements.
 *
 * Constat de recette : seuls les appels crees par la creation directe
 * debitaient le compte ; ceux generes depuis une campagne budgetaire
 * (`generateChargeCallsFromBudget`) passaient par un `createMany` qui ne
 * touchait jamais le grand livre — corrige a la source ci-dessus, mais les
 * appels deja generes avant ce correctif restent orphelins de toute
 * ecriture. Ce rapprochement les rattrape sans migration ni script a lancer
 * a la main : chaque `ChargeCall`/`ChargePayment` du lot sans
 * `OwnerAccountTransaction` correspondante (identifiee par `sourceId`) se
 * voit ajouter l'ecriture manquante.
 *
 * Declenchement choisi : automatique, a chaque ouverture du compte du lot
 * (`getOwnerAccountByLot`, donc `/compte` et `/compte/transactions`), plutot
 * qu'un bouton dedie « Rapprocher le compte ». Un rattrapage automatique est
 * plus sur qu'une action que quelqu'un doit penser a declencher, et le cout
 * (parcourir les appels et paiements d'UN lot) reste negligeable a chaque
 * lecture.
 *
 * Idempotence sous concurrence : `OwnerAccountTransaction` n'a pas de
 * contrainte unique sur `sourceId` (aucune migration autorisee pour ce lot),
 * donc un simple "verifier puis inserer" pourrait dupliquer une ecriture si
 * deux requetes rapprochent le meme compte en meme temps (ex. deux onglets
 * ouverts sur la meme page). Un verrou consultatif Postgres scope au compte
 * — meme idiome que `lib/finance/cash.ts` et `lot-registry-service.ts` —
 * serialise ces deux requetes : la seconde attend que la premiere ait
 * committe, puis relit un etat ou les ecritures qu'elle s'appretait a creer
 * existent deja, et ne les recree pas.
 */
export async function reconcileOwnerAccountLedgerForLot(
  tenantId: string,
  syndicateId: string,
  lotId: string
): Promise<{ accountId: string | null; created: number }> {
  return prisma.$transaction(async tx => {
    const account = await ensureOwnerAccountForLotTx(tx, tenantId, syndicateId, lotId);
    if (!account) {
      return { accountId: null, created: 0 };
    }

    const lockKey = `owner-account-ledger:${account.id}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const [charges, payments, existingEntries] = await Promise.all([
      tx.chargeCall.findMany({
        where: { lotId, syndicateId, syndicate: { tenantId } },
        select: { id: true, amount: true, period: true, dueDate: true }
      }),
      tx.chargePayment.findMany({
        // Lot S2 : un paiement appartient a un lot, avec ou sans appel (avance pure).
        where: { lotId, lot: { syndicateId, syndicate: { tenantId } } },
        select: { id: true, amount: true, paidAt: true, reference: true }
      }),
      tx.ownerAccountTransaction.findMany({
        where: { accountId: account.id, sourceId: { not: null } },
        select: { sourceId: true, type: true }
      })
    ]);

    const covered = new Set(existingEntries.map(entry => `${entry.type}:${entry.sourceId}`));

    interface PendingEntry {
      date: Date;
      apply: () => Promise<unknown>;
    }
    const pending: PendingEntry[] = [];

    for (const charge of charges) {
      if (covered.has(`CHARGE_CALL:${charge.id}`)) continue;
      pending.push({
        date: charge.dueDate,
        apply: () =>
          appendOwnerAccountTransactionTx(tx, {
            accountId: account.id,
            type: 'CHARGE_CALL',
            debit: Number(charge.amount),
            label: `Appel de charges ${charge.period}`,
            sourceId: charge.id,
            transactionDate: charge.dueDate
          })
      });
    }

    for (const payment of payments) {
      if (covered.has(`PAYMENT:${payment.id}`)) continue;
      pending.push({
        date: payment.paidAt,
        apply: () =>
          appendOwnerAccountTransactionTx(tx, {
            accountId: account.id,
            type: 'PAYMENT',
            credit: Number(payment.amount),
            label: 'Paiement appel de charges',
            reference: payment.reference,
            sourceId: payment.id,
            transactionDate: payment.paidAt
          })
      });
    }

    // Ordre chronologique : ce lot d'ecritures manquantes reconstitue un
    // solde courant coherent entre elles (le grand livre existant, lui, ne
    // rejoue jamais sa propre chronologie une fois ecrit).
    pending.sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const entry of pending) {
      await entry.apply();
    }

    return { accountId: account.id, created: pending.length };
  });
}

export async function getOwnerAccountByLot(tenantId: string, syndicateId: string, lotId: string) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  await getOrCreateOwnerAccountForLot(tenantId, syndicateId, lotId);
  await reconcileOwnerAccountLedgerForLot(tenantId, syndicateId, lotId);

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

  const [rows, movements] = await Promise.all([
    prisma.ownerAccountTransaction.findMany({
      where: {
        accountId: account.id,
        ...buildDateRangeFilter('transactionDate', filters?.range)
      },
      skip: pager.skip,
      take: pager.take,
      // Plus récent d'abord ; même critère secondaire (création) que le cumul.
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
    }),
    loadOwnerAccountMovements(account.id)
  ]);

  // BUG-006 : solde cumulé recalculé dans l'ordre chronologique affiché.
  return applyChronologicalBalances(rows, movements);
}

/**
 * Nombre total de transactions du compte d'un lot (meme filtre de periode que
 * la liste) : la carte « Transactions » ne doit pas compter la seule page
 * renvoyee par `listOwnerAccountTransactionsByLot`.
 */
export async function countOwnerAccountTransactionsByLot(
  tenantId: string,
  syndicateId: string,
  lotId: string,
  filters?: { range?: DateRangeInput }
) {
  const account = await getOwnerAccountByLot(tenantId, syndicateId, lotId);
  return prisma.ownerAccountTransaction.count({
    where: {
      accountId: account.id,
      ...buildDateRangeFilter('transactionDate', filters?.range)
    }
  });
}

/** Tous les mouvements d'un compte de lot, réduits à ce qu'exige le calcul du solde cumulé. */
async function loadOwnerAccountMovements(accountId: string): Promise<RunningBalanceMovement[]> {
  return prisma.ownerAccountTransaction.findMany({
    where: { accountId },
    select: { id: true, transactionDate: true, createdAt: true, debit: true, credit: true, balanceAfter: true }
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

/**
 * Solde du compte de lot juste avant `before`, lu sur le dernier mouvement
 * strictement anterieur a cette borne.
 *
 * Sans borne, la periode part de la genese du compte : rien ne la precede,
 * l'ouverture est nulle. Jamais le solde courant — c'est tout l'objet du
 * defaut n°3. Meme regle et meme calcul que `getBalanceStrictlyBefore` du
 * grand livre des comptes de tiers (`lib/finance/reports.ts`), auquel ce
 * releve s'aligne.
 */
function getOwnerBalanceStrictlyBefore(movements: RunningBalanceMovement[], before?: Date): number {
  if (!before) {
    return 0;
  }

  // BUG-006 : somme des mouvements antérieurs, et non plus le `balanceAfter`
  // stocké (figé dans l'ordre de création).
  return chronologicalBalanceStrictlyBefore(movements, before);
}

/**
 * Releve du compte de lot sur une periode.
 *
 * **Le solde d'ouverture ne se replie jamais sur le solde courant.** C'est la
 * correction du defaut n°3 du §6.1 bis du plan : quand la periode demandee ne
 * contenait aucun mouvement, ce releve renvoyait `account.balance`, c'est-a-dire
 * le solde du jour. Un releve de 2025 d'un compte mouvemente en 2026 affichait
 * donc le solde de 2026, en ouverture comme en cloture — un chiffre juste, mais
 * a la mauvaise date, ce qui est pire qu'un chiffre absent.
 *
 * Le releve s'ancre desormais sur la chaine des mouvements, jamais sur le solde
 * courant, exactement comme le lot 1 l'a fait pour le compte de tiers
 * (`getBalanceStrictlyBefore` / `getBalanceAtOrBefore`, `lib/finance/reports.ts`).
 * Sur une periode vide, ouverture et cloture valent le solde atteint avant la
 * borne de debut : rien ne s'est passe entre les deux bornes, donc rien n'a
 * bouge.
 */
export async function getOwnerAccountStatementByLot(
  tenantId: string,
  syndicateId: string,
  lotId: string,
  range?: DateRangeInput
) {
  const account = await getOwnerAccountByLot(tenantId, syndicateId, lotId);

  const [rows, movements] = await Promise.all([
    prisma.ownerAccountTransaction.findMany({
      where: {
        accountId: account.id,
        ...buildDateRangeFilter('transactionDate', range)
      },
      orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
    }),
    loadOwnerAccountMovements(account.id)
  ]);
  // BUG-006 : solde cumulé dans l'ordre chronologique, cohérent avec l'ordre du relevé.
  const transactions = applyChronologicalBalances(rows, movements);

  // Periode mouvementee : le premier mouvement porte deja l'ouverture, par
  // soustraction de son propre montant. Une lecture de moins, et un resultat
  // identique a la remontee de la chaine.
  const openingBalance =
    transactions.length > 0
      ? roundMoney(
          Number(transactions[0].balanceAfter) -
            Number(transactions[0].debit ?? 0) +
            Number(transactions[0].credit ?? 0)
        )
      : getOwnerBalanceStrictlyBefore(movements, range?.from);

  const closingBalance =
    transactions.length > 0 ? roundMoney(Number(transactions[transactions.length - 1].balanceAfter)) : openingBalance;

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

  try {
    return await prisma.chartOfAccount.create({
      data: {
        syndicateId,
        // Le tenant devient une colonne au lot 2. La portee reste SYNDICATE par
        // defaut : ce chemin est celui de la copropriete, et il ne change pas.
        tenantId,
        accountNumber: data.accountNumber,
        accountName: data.accountName,
        accountClass: data.accountClass,
        accountType: data.accountType as any,
        isAuxiliary: data.isAuxiliary ?? false,
        parentAccountId: data.parentAccountId ?? undefined
      }
    });
  } catch (error: any) {
    // Defaut n°5 du §6.1 bis : la violation d'unicite du numero de compte
    // remontait telle quelle, avec le message technique de Prisma, en 400. Une
    // gestionnaire lisait « Unique constraint failed on the fields... » la ou
    // il fallait lui dire que ce numero est deja pris.
    //
    // **Ce rattrapage est sur, ici, parce qu'on n'est pas dans une
    // transaction.** En PostgreSQL une commande qui echoue annule toute la
    // transaction en cours, et toute commande suivante est refusee jusqu'au
    // rollback : le motif « tenter puis rattraper » ne vaut que pour une
    // commande isolee, ce qu'est cette creation. Le chemin operationnel du
    // lot 2, lui, ecrit dans une transaction et lit donc avant d'ecrire.
    // Voir l'en-tete de `appendThirdPartyMovementTx` (`lib/finance/ledger.ts`).
    if (error?.code === 'P2002') {
      throw conflict(`Le numero de compte ${data.accountNumber} existe deja pour cette copropriete`);
    }
    throw error;
  }
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
      tenantId,
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
    throw unprocessableEntity('Écriture non équilibrée : le total des débits doit être égal au total des crédits');
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

  // Chaque ligne peut porter un lotId (IDOR sinon: un lot d'une autre
  // copropriete/agence attache a une ecriture qui n'est pas la sienne).
  const lotIds = Array.from(new Set(data.lines.map(line => line.lotId).filter((id): id is string => Boolean(id))));
  if (lotIds.length > 0) {
    const lotsCount = await prisma.syndicateLot.count({
      where: {
        syndicateId,
        id: { in: lotIds }
      }
    });
    if (lotsCount !== lotIds.length) {
      throw unprocessableEntity('Au moins un lot est invalide pour cette copropriete');
    }
  }

  return prisma.$transaction(async tx => {
    const entry = await tx.journalEntry.create({
      data: {
        journalId: data.journalId,
        tenantId,
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
      where: { id: entry.id, tenantId },
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
      tenantId,
      journal: { syndicateId }
    },
    select: { id: true, isLocked: true }
  });

  if (!entry) {
    throw notFound('Écriture comptable introuvable');
  }

  if (entry.isLocked) {
    return prisma.journalEntry.findUnique({ where: { id: entryId, tenantId } });
  }

  return prisma.journalEntry.update({
    where: { id: entryId, tenantId },
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
      /** Fonds alimente par ce poste (part du poste dans chaque paiement). */
      fundId?: string | null;
    }>;
  }
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const lineFunds = await assertFundsOfSyndicate(
    prisma,
    tenantId,
    syndicateId,
    data.lines.map(line => line.fundId)
  );
  lineFunds.forEach(fund => assertFundCurrency(fund, data.currency || 'XOF'));

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
          accountId: line.accountId ?? undefined,
          fundId: line.fundId ?? undefined
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

/**
 * Anomalie de recette N.8-2 : la clôture d'un budget voté n'était pas
 * atteignable (statuts REVISED/CLOSED presents en base mais aucun controle
 * de transition ne les autorisait depuis l'API). Transitions autorisees :
 * DRAFT -> APPROVED, APPROVED <-> REVISED, APPROVED|REVISED -> CLOSED.
 * CLOSED est terminal (aucun retour arriere depuis cette route).
 */
const BUDGET_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['APPROVED'],
  APPROVED: ['REVISED', 'CLOSED'],
  REVISED: ['APPROVED', 'CLOSED'],
  CLOSED: []
};

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

const BUDGET_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  APPROVED: 'Approuvé',
  REVISED: 'Révisé',
  CLOSED: 'Clôturé'
};

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
    select: { id: true, status: true }
  });

  if (!budget) {
    throw notFound('Budget introuvable pour cette copropriete');
  }

  if (budget.status === 'CLOSED') {
    throw conflict('Budget clôturé : il ne peut plus être modifié.');
  }

  if (data.status && data.status !== budget.status) {
    const allowedTargets = BUDGET_STATUS_TRANSITIONS[budget.status] || [];
    if (!allowedTargets.includes(data.status)) {
      throw conflict(
        `Transition de statut interdite : de ${BUDGET_STATUS_LABELS[budget.status] || budget.status} vers ${
          BUDGET_STATUS_LABELS[data.status] || data.status
        }.`
      );
    }

    if (data.status === 'CLOSED') {
      const activeSchedule = await prisma.syndicChargeSchedule.findFirst({
        // Une programmation arrivée à sa date de fin n'émet plus rien : elle
        // ne bloque pas la clôture, même si personne ne l'a mise en pause.
        where: {
          tenantId,
          budgetId,
          active: true,
          OR: [{ endDate: null }, { endDate: { gte: startOfUtcDay(new Date()) } }]
        },
        select: { id: true }
      });
      if (activeSchedule) {
        throw conflict(
          "Des programmations d'appels actives utilisent ce budget : mettez-les en pause ou terminez-les d'abord."
        );
      }
    }
  }

  if (data.approvedByResolutionId) {
    const resolution = await prisma.gMResolution.findFirst({
      where: {
        id: data.approvedByResolutionId,
        meeting: { syndicateId, syndicate: { tenantId } }
      },
      select: { id: true }
    });
    if (!resolution) {
      throw notFound('Resolution introuvable pour cette copropriete');
    }
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

  if (budget.status === 'CLOSED') {
    throw conflict('Budget clôturé : il ne peut plus être modifié.');
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
  // Cle de repartition : un lot sans tantieme (desactive) n'y figure pas ; s'il n'y en a aucun
  // avec des tantiemes, tous les lots restent (parts egales) — jamais de division par zero (BUG-078).
  const distributionLots = lots.some(lot => lot.generalShares > 0) ? lots.filter(lot => lot.generalShares > 0) : lots;

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
      distributionLots as LotDistributionInput[],
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
    periodStart?: Date | null;
    periodEnd?: Date | null;
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

  const bounds = resolvePeriodBounds(data);
  return prisma.chargeCallBatch.create({
    data: {
      syndicateId,
      label: data.label,
      period: data.period,
      periodStart: bounds?.start ?? null,
      periodEnd: bounds?.end ?? null,
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

/** Lot S4 : montant a appeler pour un lot dans un lot d'appels. */
export interface LotCallAmount {
  lotId: string;
  amount: number;
}

/**
 * Lot S4 (audit) : un seul lot d'appels ORDINAIRE par copropriete et par
 * periode (memes bornes), qu'il vienne d'une programmation ou de la
 * generation manuelle depuis le budget. Un appel exceptionnel reste possible,
 * et une periode sans bornes n'est pas controlee. 409 sinon.
 */
export async function assertNoRegularBatchForPeriodTx(
  tx: PrismaTransactionClient,
  syndicateId: string,
  bounds: PeriodBounds | null
): Promise<void> {
  if (!bounds) return;
  const duplicate = await tx.chargeCallBatch.findFirst({
    where: { syndicateId, batchType: 'REGULAR', periodStart: bounds.start, periodEnd: bounds.end },
    select: { id: true }
  });
  if (duplicate) {
    throw new ConflictError(
      "Un lot d'appels ordinaire existe déjà pour cette copropriété sur cette période : aucun appel émis."
    );
  }
}

/**
 * Lot S4 : cree un lot d'appels (`ChargeCallBatch`) et un appel par lot, dans
 * la transaction de l'appelant, par le chemin commun `createLotChargeCallTx`
 * (debit du compte du lot, imputation de l'avance, quittances S3 ajoutees a
 * `issued`). Verrous des lots pris dans l'ordre global des identifiants.
 * Partage par la generation depuis le budget et par la programmation
 * automatique (`charge-schedules.ts`).
 *
 * Fonds : credites en UNE fois, apres la boucle (tous les lots verrouilles).
 * L'appelant ne doit plus verrouiller de lot ensuite dans la meme
 * transaction (c'est le cas des deux appelants : une transaction par lot
 * d'appels).
 */
export async function createChargeCallBatchWithCallsTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  data: {
    syndicateId: string;
    label: string;
    period: string;
    bounds: PeriodBounds | null;
    dueDate: Date;
    batchType: 'REGULAR' | 'EXCEPTIONAL';
    budgetId?: string | null;
    totalAmount: number;
    currency: string;
    lots: LotCallAmount[];
    /** Auteur des credits de fonds nes de l'imputation d'avance (null : automatique). */
    actorUserId?: string | null;
  },
  issued: IssuedChargeDocument[] = []
) {
  if (data.batchType === 'REGULAR') await assertNoRegularBatchForPeriodTx(tx, data.syndicateId, data.bounds);
  const batch = await tx.chargeCallBatch.create({
    data: {
      syndicateId: data.syndicateId,
      label: data.label,
      period: data.period,
      periodStart: data.bounds?.start ?? null,
      periodEnd: data.bounds?.end ?? null,
      dueDate: data.dueDate,
      batchType: data.batchType,
      ...(data.budgetId ? { budgetId: data.budgetId } : {}),
      totalAmount: roundMoney(data.totalAmount),
      currency: data.currency,
      status: 'SENT'
    }
  });

  // Un lot dont la quote-part est nulle (ex. sans tantiemes speciaux) n'a rien a payer : ni appel,
  // ni debit, ni avis, ni relance possible (BUG-050).
  const lotsInLockOrder = data.lots
    .filter(lot => roundMoney(lot.amount) > 0)
    .sort((a, b) => compareLotIdsForLocking(a.lotId, b.lotId));
  const chargeCalls: Array<Awaited<ReturnType<typeof createLotChargeCallTx>>> = [];
  const fundCredits: FundCreditItem[] = [];
  for (const lot of lotsInLockOrder) {
    chargeCalls.push(
      await createLotChargeCallTx(
        tx,
        tenantId,
        {
          syndicateId: data.syndicateId,
          lotId: lot.lotId,
          batchId: batch.id,
          period: data.period,
          bounds: data.bounds,
          amount: roundMoney(lot.amount),
          currency: data.currency,
          dueDate: data.dueDate
        },
        issued,
        fundCredits
      )
    );
  }
  await creditFundsForAllocationsTx(tx, { items: fundCredits, actorUserId: data.actorUserId ?? null });
  return { batch, chargeCalls };
}

export async function generateChargeCallsFromBudget(
  tenantId: string,
  syndicateId: string,
  budgetId: string,
  data: {
    label: string;
    period: string;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    dueDate: Date;
    batchType: 'REGULAR' | 'EXCEPTIONAL';
    currency?: string;
    /**
     * Lot S4 : nombre de periodes par an (1, 2, 4 ou 12). Chaque appel porte
     * la quote-part annuelle du lot divisee par ce nombre ; la derniere
     * periode de l'annee (`periodIndex` = `periodsPerYear`) absorbe
     * l'arrondi. Defaut 1 : la quote-part annuelle entiere (comportement
     * historique de la route manuelle).
     */
    periodsPerYear?: number;
    /** Rang de la periode dans l'annee (1 a `periodsPerYear`), defaut 1. */
    periodIndex?: number;
    /** Auteur des credits de fonds nes de l'imputation d'avance. */
    actorUserId?: string | null;
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

  // Les appels (et les fonds alimentes par les postes) sont dans la devise du budget.
  if (data.currency && data.currency !== budget.currency) {
    throw unprocessableEntity('La devise des appels doit être celle du budget');
  }

  // Un lot sans tantième (désactivé) n'est jamais appelé (BUG-078) : si la
  // répartition enregistrée le porte encore, elle est recalculée avant émission.
  const lotShares = await prisma.syndicateLot.findMany({
    where: { syndicateId },
    select: { id: true, generalShares: true }
  });
  const hasShares = lotShares.some(lot => lot.generalShares > 0);
  const activeLotIds = new Set(lotShares.filter(lot => !hasShares || lot.generalShares > 0).map(lot => lot.id));
  const stale = budget.allocations.some(allocation => !activeLotIds.has(allocation.lotId));
  const allocations = (
    budget.allocations.length && !stale
      ? budget.allocations
      : await recomputeBudgetAllocationsByBudget(tenantId, syndicateId, budgetId)
  ).filter(allocation => activeLotIds.has(allocation.lotId));

  if (allocations.length === 0) {
    throw unprocessableEntity('Aucune allocation disponible pour generer les appels');
  }

  const bounds = resolvePeriodBounds(data);
  const periodsPerYear = data.periodsPerYear ?? 1;
  const periodIndex = data.periodIndex ?? 1;
  const lots = allocations.map(allocation => ({
    lotId: allocation.lotId,
    amount:
      periodsPerYear === 1
        ? roundMoney(Number(allocation.totalAllocated))
        : annualShareForPeriod(Number(allocation.totalAllocated), periodsPerYear, periodIndex)
  }));
  // Annee entiere : total du budget, comme avant le lot S4 ; sinon la somme des parts de la periode.
  const totalAmount =
    periodsPerYear === 1
      ? Number(budget.totalAmount)
      : fromCents(lots.reduce((sum, lot) => sum + toCents(lot.amount), 0));
  const issued: IssuedChargeDocument[] = [];
  const generated = await prisma.$transaction(async tx => {
    // Constat de recette : `createMany` (avant ce correctif) ne renvoie que
    // le nombre de lignes inserees, jamais leurs identifiants — impossible
    // d'y accrocher une ecriture de grand livre. Chaque appel est donc cree
    // un par un (createChargeCallBatchWithCallsTx -> createLotChargeCallTx),
    // qui debite le compte du lot et impute aussitot son avance (lot S2).
    const { batch } = await createChargeCallBatchWithCallsTx(
      tx,
      tenantId,
      {
        syndicateId,
        label: data.label,
        period: data.period,
        bounds,
        dueDate: data.dueDate,
        batchType: data.batchType,
        budgetId,
        totalAmount,
        currency: budget.currency,
        lots,
        actorUserId: data.actorUserId ?? null
      },
      issued
    );

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
  scheduleChargeDocumentDelivery(tenantId, issued);
  return generated;
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

/** Total des parts d'un lot : 100 %, compte en centiemes de pourcent (entiers : aucune derive flottante). */
const OWNER_SHARE_TOTAL_HUNDREDTHS = 10000;

function toShareHundredths(value: number | string | { toString(): string }): number {
  return Math.round(Number(value.toString()) * 100);
}

function formatShareHundredths(hundredths: number): string {
  return String(Number((hundredths / 100).toFixed(2)));
}

/** Profil proprietaire qui compte dans le total des parts : actif et non termine. */
function currentOwnerProfileWhere(now: Date): Prisma.LotOwnerProfileWhereInput {
  return { isActive: true, ownedSince: { lte: now }, OR: [{ ownedUntil: null }, { ownedUntil: { gt: now } }] };
}

/**
 * BUG-2026-09-30-069 : la somme des parts des proprietaires d'un lot ne
 * depasse jamais 100 % (indivision). `addHundredths` est la part du profil
 * ecrit, `excludeProfileId` le profil modifie (deja compte dans la base). Le
 * lot est verrouille par l'appelant : deux ecritures concurrentes ne peuvent
 * pas depasser ensemble le plafond.
 */
async function assertOwnerSharesWithinLimit(
  tx: PrismaTransactionClient,
  lotId: string,
  addHundredths: number,
  excludeProfileId?: string
): Promise<void> {
  const [lot, others] = await Promise.all([
    tx.syndicateLot.findFirst({ where: { id: lotId }, select: { lotNumber: true } }),
    tx.lotOwnerProfile.findMany({
      where: {
        lotId,
        ...currentOwnerProfileWhere(new Date()),
        ...(excludeProfileId ? { id: { not: excludeProfileId } } : {})
      },
      select: { ownershipPercentage: true }
    })
  ]);
  const existing = others.reduce((sum, profile) => sum + toShareHundredths(profile.ownershipPercentage), 0);
  if (existing + addHundredths > OWNER_SHARE_TOTAL_HUNDREDTHS) {
    const lotLabel = lot?.lotNumber ? `du lot ${lot.lotNumber}` : 'du lot';
    const message = `Les parts ${lotLabel} dépassent 100 % (${formatShareHundredths(existing)} % déjà attribués, ${formatShareHundredths(addHundredths)} % demandés).`;
    throw new ConflictError(message, [{ field: 'ownershipPercentage', message }]);
  }
}

/**
 * Lots dont le total des parts actuelles est inferieur a 100 % (agregat serveur
 * sur tous les profils de la copropriete) : alimente le bandeau
 * « quotes-parts incomplètes ». Un lot sans aucun profil n'est pas signale.
 */
export async function listIncompleteOwnerSharesBySyndicate(tenantId: string, syndicateId: string) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);
  const profiles = await prisma.lotOwnerProfile.findMany({
    where: { lot: { syndicateId, syndicate: { tenantId } }, ...currentOwnerProfileWhere(new Date()) },
    select: { lotId: true, ownershipPercentage: true, lot: { select: { lotNumber: true } } }
  });
  const byLot = new Map<string, { lotNumber: string; hundredths: number }>();
  for (const profile of profiles) {
    const entry = byLot.get(profile.lotId) ?? { lotNumber: profile.lot.lotNumber, hundredths: 0 };
    entry.hundredths += toShareHundredths(profile.ownershipPercentage);
    byLot.set(profile.lotId, entry);
  }
  return [...byLot.entries()]
    .filter(([, entry]) => entry.hundredths < OWNER_SHARE_TOTAL_HUNDREDTHS)
    .map(([lotId, entry]) => ({
      lotId,
      lotNumber: entry.lotNumber,
      totalPercentage: entry.hundredths / 100
    }))
    .sort((a, b) => a.lotNumber.localeCompare(b.lotNumber));
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
  await assertContactBelongsToTenant(tenantId, data.contactId);

  const ownershipPercentage = roundMoney(data.ownershipPercentage);
  const isCurrent = (data.isActive ?? true) && (!data.ownedUntil || data.ownedUntil > new Date());

  return prisma.$transaction(async tx => {
    if (isCurrent) {
      await lockLotTx(tx, data.lotId);
      await assertOwnerSharesWithinLimit(tx, data.lotId, toShareHundredths(ownershipPercentage));
    }
    const created = await tx.lotOwnerProfile.create({
      data: {
        lotId: data.lotId,
        contactId: data.contactId,
        ownershipPercentage,
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
    // Le proprietaire du lot (compte, recouvrement, liste) suit ses profils actuels (BUG-087).
    await syncLotOwnerFromProfilesTx(tx, data.lotId);
    return created;
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
    select: {
      id: true,
      lotId: true,
      portalAccessToken: true,
      ownershipPercentage: true,
      ownedUntil: true,
      isActive: true
    }
  });
  if (!profile) {
    throw notFound('Profil proprietaire introuvable');
  }

  const nextPercentage =
    data.ownershipPercentage !== undefined ? roundMoney(data.ownershipPercentage) : Number(profile.ownershipPercentage);
  const nextUntil = data.ownedUntil === undefined ? profile.ownedUntil : data.ownedUntil;
  const nextActive = data.isActive ?? profile.isActive;
  const willCount = nextActive && (!nextUntil || nextUntil > new Date());

  return prisma.$transaction(async tx => {
    if (willCount) {
      await lockLotTx(tx, profile.lotId);
      await assertOwnerSharesWithinLimit(tx, profile.lotId, toShareHundredths(nextPercentage), profileId);
    }
    const updated = await updateLotOwnerProfileRow(tx, profileId, profile, data);
    await syncLotOwnerFromProfilesTx(tx, profile.lotId);
    return updated;
  });
}

async function updateLotOwnerProfileRow(
  tx: PrismaTransactionClient,
  profileId: string,
  profile: { portalAccessToken: string | null },
  data: {
    ownershipPercentage?: number;
    ownedSince?: Date;
    ownedUntil?: Date | null;
    portalAccessEnabled?: boolean;
    notificationPrefs?: any;
    isActive?: boolean;
  }
) {
  return tx.lotOwnerProfile.update({
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
  await assertContactBelongsToTenant(tenantId, data.contactId);

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
  await assertContactBelongsToTenant(tenantId, data.reportedByContactId);
  if (data.assetId) {
    const asset = await prisma.commonAreaAsset.findFirst({
      where: { id: data.assetId, syndicateId },
      select: { id: true }
    });
    if (!asset) {
      throw notFound('Actif commun introuvable pour cette copropriete');
    }
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

  if (data.providerId) {
    const provider = await prisma.serviceProvider.findFirst({
      where: { id: data.providerId, tenantId },
      select: { id: true }
    });
    if (!provider) {
      throw notFound('Prestataire introuvable ou inaccessible');
    }
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

// =============================================================
// SYNDIC MODULE - FONDS FINANCIERS DE LA COPROPRIETE (FR-013)
// =============================================================
// Le modele SyndicateFund existait deja (utilise en lecture seule par
// getFinanceSummaryBySyndicate) mais n'avait ni route de creation ni de
// modification — voir docs/recette/SCENARIO_SYNDIC_MODULES.md, annexe #4.

async function findSyndicateFundOrThrow(tenantId: string, syndicateId: string, fundId: string) {
  const fund = await prisma.syndicateFund.findFirst({
    where: {
      id: fundId,
      syndicateId,
      syndicate: { tenantId }
    }
  });

  if (!fund) {
    throw notFound('Fonds introuvable ou inaccessible pour cette copropriete');
  }

  return fund;
}

export async function createSyndicateFundBySyndicate(
  tenantId: string,
  syndicateId: string,
  data: { name: string; initialBalance?: number; currency?: string },
  actorUserId?: string | null
) {
  await assertSyndicateTenantOwnership(tenantId, syndicateId);

  // Le solde d'un fonds est la somme de son journal : le solde initial est
  // son mouvement d'ouverture, ecrit dans la meme transaction.
  const initialBalance = roundMoney(data.initialBalance ?? 0);
  const fund = await prisma.$transaction(async tx => {
    const created = await tx.syndicateFund.create({
      data: { syndicateId, name: data.name, balance: 0, currency: data.currency || 'XOF' }
    });
    if (initialBalance <= 0) return created;
    const { fund: opened } = await recordFundMovementTx(tx, {
      tenantId,
      fundId: created.id,
      direction: 'CREDIT',
      amount: initialBalance,
      label: "Solde d'ouverture",
      sourceType: 'OPENING',
      actorUserId: actorUserId ?? null
    });
    return opened;
  });

  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.SYNDICATE_FUND_CREATED,
      entityType: 'SYNDICATE_FUND',
      entityId: fund.id,
      payload: { syndicateId, name: fund.name, initialBalance: Number(fund.balance), currency: fund.currency }
    });
  }

  return fund;
}

export async function renameSyndicateFundByTenant(
  tenantId: string,
  syndicateId: string,
  fundId: string,
  data: { name: string },
  actorUserId?: string | null
) {
  const fund = await findSyndicateFundOrThrow(tenantId, syndicateId, fundId);

  const updated = await prisma.syndicateFund.update({
    where: { id: fund.id },
    data: { name: data.name }
  });

  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.SYNDICATE_FUND_RENAMED,
      entityType: 'SYNDICATE_FUND',
      entityId: fund.id,
      payload: { syndicateId, previousName: fund.name, newName: updated.name }
    });
  }

  return updated;
}

export async function adjustSyndicateFundBalanceByTenant(
  tenantId: string,
  syndicateId: string,
  fundId: string,
  data: { direction: 'CREDIT' | 'DEBIT'; amount: number; reason: string; kind?: 'ADJUSTMENT' | 'EXPENSE' },
  actorUserId?: string | null
) {
  const fund = await findSyndicateFundOrThrow(tenantId, syndicateId, fundId);
  // Une depense payee par le fonds le diminue toujours ; un ajustement va
  // dans un sens comme dans l'autre.
  const isExpense = data.kind === 'EXPENSE';
  if (isExpense && data.direction !== 'DEBIT') {
    throw unprocessableEntity('Une dépense diminue le fonds : choisissez un débit');
  }

  const amount = roundMoney(data.amount);

  // Le solde d'un fonds (compte courant, fonds de travaux...) peut legitimement
  // devenir negatif (avance de tresorerie de l'agence, decouvert temporaire) :
  // contrairement aux montants d'appels ou de paiements, aucune regle metier
  // de la spec (FR-013, data-model.md) n'impose un plancher a zero.
  //
  // S6 : l'ajustement est un mouvement du fonds comme un autre. Increment
  // atomique (verrou de ligne jusqu'a la fin de la transaction, comme les
  // paiements de prestataires) puis trace dans `SyndicateFundMovement`, avec
  // le solde apres mouvement.
  const updated = await prisma.$transaction(async tx => {
    await lockFundsTx(tx, [fund.id]);
    const { fund: row } = await recordFundMovementTx(tx, {
      tenantId,
      fundId: fund.id,
      direction: data.direction,
      amount,
      label: data.reason,
      sourceType: isExpense ? 'MANUAL_EXPENSE' : 'MANUAL_ADJUSTMENT',
      actorUserId: actorUserId ?? null
    });
    // Critical action: audit trail written in the same transaction.
    if (actorUserId) {
      const balanceAfter = roundMoney(Number(row.balance));
      await recordAuditEvent(tx, {
        actorUserId,
        tenantId,
        actionKey: AuditActionKey.SYNDICATE_FUND_BALANCE_ADJUSTED,
        entityType: 'SYNDICATE_FUND',
        entityId: fund.id,
        payload: {
          syndicateId,
          kind: isExpense ? 'EXPENSE' : 'ADJUSTMENT',
          direction: data.direction,
          amount,
          reason: data.reason,
          previousBalance:
            data.direction === 'CREDIT' ? roundMoney(balanceAfter - amount) : roundMoney(balanceAfter + amount),
          newBalance: balanceAfter
        }
      });
    }
    return row;
  });
  const nextBalance = roundMoney(Number(updated.balance));

  // Permis (avance de tresorerie), mais signale a l'ecran.
  return { ...updated, negativeBalance: nextBalance < 0 };
}
